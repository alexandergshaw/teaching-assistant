// Shared plain-JS mirror of src/lib/module-graph/runtime-import-graph.ts and
// client-boundary-policy.ts, for the ten wave-step-0 probes (RES-A23-13).
// These probes are MEASUREMENT INSTRUMENTS, not the production seam - the
// production seam is the TypeScript file under src/lib/module-graph/. This
// mirror exists only so a probe can be run with plain `node docs/a23/<probe>.mjs`
// from the repo root, matching docs/a23-probe.mjs and docs/a23-scan.mjs's own
// existing convention of a self-contained script.
import { createRequire } from "node:module";
import { builtinModules } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, relative, sep } from "node:path";

const ts = createRequire(import.meta.url)("typescript");

export const SRC = join(process.cwd(), "src");

export const FORBIDDEN_PATH_PREFIXES = ["lib/supabase"];
export const BROWSER_SAFE_MODULES = ["lib/supabase/client.ts"];
export const FORBIDDEN_BARE_SPECIFIERS = ["next/headers", "node:async_hooks", "server-only"];
export const ALLOWED_BARE_SPECIFIERS = [
  "@monaco-editor/react",
  "@mui/material",
  "@mui/material/Autocomplete",
  "@mui/material/Button",
  "@mui/material/Checkbox",
  "@mui/material/FormControlLabel",
  "@mui/material/IconButton",
  "@mui/material/MenuItem",
  "@mui/material/TextField",
  "@supabase/ssr",
  "jszip",
  "next/dynamic",
  "node-html-parser",
  "react",
];
export const ALLOWED_ASSET_EXTENSIONS = [".css"];

export function scanRuntimeEdges(source, fileName) {
  const scriptKind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  const edges = [];
  const unresolvable = [];
  const directives = [];

  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
      directives.push(statement.expression.text);
    } else break;
  }

  function literalText(expr) {
    if (ts.isStringLiteral(expr)) return expr.text;
    if (ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
    return null;
  }
  function namedElementsConveyValue(elements) {
    if (elements.length === 0) return true;
    return elements.some((e) => !e.isTypeOnly);
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      const clause = node.importClause;
      if (!clause) {
        edges.push({ specifier, kind: "import" });
      } else if (!clause.isTypeOnly) {
        let isEdge = Boolean(clause.name);
        const bindings = clause.namedBindings;
        if (bindings) {
          if (ts.isNamespaceImport(bindings)) isEdge = true;
          else if (ts.isNamedImports(bindings) && namedElementsConveyValue(bindings.elements)) isEdge = true;
        }
        if (isEdge) edges.push({ specifier, kind: "import" });
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (!node.isTypeOnly) {
        let isEdge = false;
        const clause = node.exportClause;
        if (!clause) isEdge = true;
        else if (ts.isNamespaceExport(clause)) isEdge = true;
        else if (ts.isNamedExports(clause)) isEdge = namedElementsConveyValue(clause.elements);
        if (isEdge) edges.push({ specifier, kind: "export-from" });
      }
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport || isRequire) {
        const arg = node.arguments[0];
        const kind = isDynamicImport ? "dynamic-import" : "require";
        if (arg) {
          const text = literalText(arg);
          if (text !== null) edges.push({ specifier: text, kind });
          else unresolvable.push(`${kind}(${arg.getText(sourceFile)})`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(sourceFile, visit);
  return { edges, unresolvable, directives };
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export function classifySpecifier(specifier, importerAbs, srcRoot) {
  if (specifier.startsWith("@/") || specifier.startsWith(".")) {
    const base = specifier.startsWith("@/") ? join(srcRoot, specifier.slice(2)) : normalize(join(dirname(importerAbs), specifier));
    for (const suffix of [".ts", ".tsx", `${sep}index.ts`, `${sep}index.tsx`]) {
      const candidate = suffix.startsWith(sep) ? base + suffix : `${base}${suffix}`;
      if (candidate.startsWith(srcRoot) && isFile(candidate)) return { kind: "module", resolved: candidate };
    }
    if (isFile(base)) return { kind: "asset", resolved: base, ext: extname(base) };
    return { kind: "missing" };
  }
  if (specifier.startsWith("node:") || builtinModules.includes(specifier)) return { kind: "node-builtin" };
  return { kind: "package" };
}

export function walkRuntimeGraph(roots, options) {
  const violations = [];
  const unresolvable = [];
  const unallowed = [];
  const visited = new Set();
  const toRel = (abs) => relative(options.srcRoot, abs).split(sep).join("/");
  const isForbidden = (relPath) =>
    options.forbiddenPathPrefixes.some((p) => relPath.startsWith(p)) && !options.browserSafeModules.includes(relPath);

  function visit(abs, trail) {
    if (visited.has(abs)) return;
    visited.add(abs);
    let source;
    try {
      source = readFileSync(abs, "utf8");
    } catch {
      return;
    }
    const scan = scanRuntimeEdges(source, abs);
    if (options.treatUseServerAsWall && scan.directives.includes("use server")) return;
    for (const site of scan.unresolvable) unresolvable.push(site);
    const nextTrail = [...trail, toRel(abs)];
    for (const edge of scan.edges) {
      const disposition = classifySpecifier(edge.specifier, abs, options.srcRoot);
      if (disposition.kind === "module") {
        const relPath = toRel(disposition.resolved);
        if (isForbidden(relPath)) violations.push({ trail: nextTrail, specifier: edge.specifier, resolved: relPath });
        else visit(disposition.resolved, nextTrail);
        continue;
      }
      if (disposition.kind === "asset") {
        if (!options.allowedAssetExtensions.includes(disposition.ext))
          unallowed.push({ trail: nextTrail, specifier: edge.specifier, reason: "asset" });
        continue;
      }
      if (disposition.kind === "node-builtin") {
        unallowed.push({ trail: nextTrail, specifier: edge.specifier, reason: "node-builtin" });
        if (options.forbiddenBareSpecifiers.includes(edge.specifier))
          violations.push({ trail: nextTrail, specifier: edge.specifier, resolved: null });
        continue;
      }
      if (disposition.kind === "missing") {
        unallowed.push({ trail: nextTrail, specifier: edge.specifier, reason: "missing" });
        continue;
      }
      if (!options.allowedBareSpecifiers.includes(edge.specifier))
        unallowed.push({ trail: nextTrail, specifier: edge.specifier, reason: "package" });
      if (options.forbiddenBareSpecifiers.includes(edge.specifier))
        violations.push({ trail: nextTrail, specifier: edge.specifier, resolved: null });
    }
  }
  for (const root of roots) visit(root, []);
  return { violations, unresolvable, unallowed, nodes: visited.size };
}

export function directoryRoots(absDir) {
  return readdirSync(absDir)
    .filter((n) => /\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts") && !n.endsWith(".test.tsx") && !n.endsWith(".d.ts"))
    .map((n) => join(absDir, n));
}

export const SHIPPING_OPTIONS = {
  srcRoot: SRC,
  forbiddenPathPrefixes: FORBIDDEN_PATH_PREFIXES,
  browserSafeModules: BROWSER_SAFE_MODULES,
  forbiddenBareSpecifiers: FORBIDDEN_BARE_SPECIFIERS,
  allowedBareSpecifiers: ALLOWED_BARE_SPECIFIERS,
  allowedAssetExtensions: ALLOWED_ASSET_EXTENSIONS,
  treatUseServerAsWall: true,
};

export function walkSrc(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) stack.push(full);
      else if (/\.(ts|tsx)$/.test(name)) out.push(full);
    }
  }
  return out;
}
