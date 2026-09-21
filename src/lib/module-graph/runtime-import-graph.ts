// A23: the transitive runtime-import-graph walk. Replaces three text-filter
// guards (a per-line classifier, a walled-set line count, and a raw-source
// pattern sweep) that all inferred import intent from source text and all
// leaked - see docs/a23-architecture.md and docs/a23-test-notes.md.
//
// Edge extraction is done by the TypeScript compiler's own parser
// (`ts.createSourceFile`), never by a pattern over raw text: an
// un-enumerated SYNTAX is not matched by any pattern here, because there is
// no pattern - it is either an erased type-only declaration or a followed
// edge. Reachability is judged by a capability predicate on the RESOLVED
// path (docs/a23-architecture.md:472-527), under an ALLOW list for bare
// specifiers (Ruling Z1) - an un-enumerated SPECIFIER fails loudly rather
// than being silently permitted.
//
// This file is not reachable from a client bundle - it pulls in `typescript`
// and `node:fs` - and its own test asserts that (R-11).
import { createRequire } from "node:module";
import { builtinModules } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, relative, sep } from "node:path";

// createRequire bypasses vite's transform pipeline entirely (measured,
// docs/a23-architecture.md:999-1014), so it also avoids putting an 8MB CJS
// bundle through it on every run.
const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");

export type RuntimeEdgeKind = "import" | "export-from" | "require" | "dynamic-import";
export interface RuntimeEdge {
  specifier: string;
  kind: RuntimeEdgeKind;
}
export interface EdgeScan {
  edges: RuntimeEdge[];
  /** Import/require sites whose specifier is NOT a string literal. Never empty-skipped. */
  unresolvable: string[];
  /** The parsed directive prologue, e.g. ["use server"]. */
  directives: string[];
}

/** PURE. Parses with ts.createSourceFile; no file system access. */
export function scanRuntimeEdges(source: string, fileName: string): EdgeScan {
  const scriptKind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);

  const edges: RuntimeEdge[] = [];
  const unresolvable: string[] = [];
  const directives: string[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
      directives.push(statement.expression.text);
    } else {
      break;
    }
  }

  // A literal string, or a template literal with no substitutions (a NoSub-
  // stitutionTemplateLiteral is a real string at compile time - only a
  // TemplateExpression with `${...}` parts is computed). Anything else
  // (an Identifier, a substituted template, ...) has no literal text and is
  // residue, never silently dropped.
  function literalText(expr: import("typescript").Expression): string | null {
    if (ts.isStringLiteral(expr)) return expr.text;
    if (ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
    return null;
  }

  function namedElementsConveyValue(elements: readonly { isTypeOnly: boolean }[]): boolean {
    // Empty braces (`{}`) are pinned as an edge (Ruling V1/section 3.4): a
    // measured SWC edge on the import side, and a deliberate fail-closed
    // overshoot on the export side (SWC erases it; this design does not).
    if (elements.length === 0) return true;
    return elements.some((e) => !e.isTypeOnly);
  }

  function visit(node: import("typescript").Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      const clause = node.importClause;
      if (!clause) {
        // Bare side-effect import: `import "spec";` - erased by nothing.
        edges.push({ specifier, kind: "import" });
      } else if (!clause.isTypeOnly) {
        let isEdge = Boolean(clause.name); // a default binding is always a value.
        const bindings = clause.namedBindings;
        if (bindings) {
          if (ts.isNamespaceImport(bindings)) isEdge = true;
          else if (ts.isNamedImports(bindings) && namedElementsConveyValue(bindings.elements)) isEdge = true;
        }
        if (isEdge) edges.push({ specifier, kind: "import" });
      }
      // clause.isTypeOnly (import type { X } from S) is erased entirely.
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (!node.isTypeOnly) {
        let isEdge = false;
        const clause = node.exportClause;
        if (!clause) {
          isEdge = true; // export * from S
        } else if (ts.isNamespaceExport(clause)) {
          isEdge = true; // export * as ns from S
        } else if (ts.isNamedExports(clause)) {
          isEdge = namedElementsConveyValue(clause.elements);
        }
        if (isEdge) edges.push({ specifier, kind: "export-from" });
      }
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport || isRequire) {
        const arg = node.arguments[0];
        const kind: RuntimeEdgeKind = isDynamicImport ? "dynamic-import" : "require";
        if (arg) {
          const text = literalText(arg);
          if (text !== null) {
            edges.push({ specifier: text, kind });
          } else {
            unresolvable.push(`${kind}(${arg.getText(sourceFile)})`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(sourceFile, visit);

  return { edges, unresolvable, directives };
}

/** Z1: every LITERAL specifier gets a bucket. `null` is not a bucket. */
export type SpecifierDisposition =
  | { kind: "module"; resolved: string } // a .ts/.tsx under src/ - an edge
  | { kind: "asset"; resolved: string; ext: string } // on disk, not a module
  | { kind: "node-builtin" } // node:x, or builtinModules.includes(x)
  | { kind: "missing" } // relative/alias, nothing on disk
  | { kind: "package" }; // a bare npm specifier

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

const RESOLUTION_CANDIDATES = [".ts", ".tsx", `${sep}index.ts`, `${sep}index.tsx`] as const;

export function classifySpecifier(specifier: string, importerAbs: string, srcRoot: string): SpecifierDisposition {
  if (specifier.startsWith("@/") || specifier.startsWith(".")) {
    const base = specifier.startsWith("@/")
      ? join(srcRoot, specifier.slice(2))
      : normalize(join(dirname(importerAbs), specifier));
    for (const suffix of RESOLUTION_CANDIDATES) {
      const candidate = suffix.startsWith(sep) ? base + suffix : `${base}${suffix}`;
      // m-4: a .ts/.tsx candidate that resolves outside src/ is routed to the
      // fail-closed `missing` bucket rather than treated as a module - zero
      // occurrences on this tree (docs/a23-architecture.md:625-635).
      if (candidate.startsWith(srcRoot) && isFile(candidate)) return { kind: "module", resolved: candidate };
    }
    if (isFile(base)) return { kind: "asset", resolved: base, ext: extname(base) };
    return { kind: "missing" };
  }
  if (specifier.startsWith("node:") || builtinModules.includes(specifier)) return { kind: "node-builtin" };
  return { kind: "package" };
}

export interface WalkOptions {
  srcRoot: string;
  forbiddenPathPrefixes: string[];
  /** Positively-stated exceptions inside a forbidden prefix (m4). */
  browserSafeModules: string[];
  /** DIAGNOSTIC ONLY - completeness rests on allowedBareSpecifiers. */
  forbiddenBareSpecifiers: string[];
  /** THE ALLOW LIST. A bare specifier not on it FAILS. */
  allowedBareSpecifiers: string[];
  allowedAssetExtensions: string[];
  treatUseServerAsWall: boolean;
}
export interface Violation {
  trail: string[];
  specifier: string;
  resolved: string | null;
}
/** A literal specifier that is neither a followed edge nor on an allow list. */
export interface Unallowed {
  trail: string[];
  specifier: string;
  reason: SpecifierDisposition["kind"];
}
export interface WalkResult {
  violations: Violation[];
  /** NON-literal specifier sites. Reported, never skipped. */
  unresolvable: string[];
  /** Z1: literal specifiers that fail the allow list. Reported, never skipped. */
  unallowed: Unallowed[];
  nodes: number;
}

export function walkRuntimeGraph(roots: string[], options: WalkOptions): WalkResult {
  const violations: Violation[] = [];
  const unresolvable: string[] = [];
  const unallowed: Unallowed[] = [];
  const visited = new Set<string>();

  const toRel = (abs: string): string => relative(options.srcRoot, abs).split(sep).join("/");
  const isForbidden = (relPath: string): boolean =>
    options.forbiddenPathPrefixes.some((prefix) => relPath.startsWith(prefix)) &&
    !options.browserSafeModules.includes(relPath);

  function visit(abs: string, trail: string[]): void {
    if (visited.has(abs)) return;
    visited.add(abs);
    let source: string;
    try {
      source = readFileSync(abs, "utf8");
    } catch {
      return;
    }
    const scan = scanRuntimeEdges(source, abs);
    // R-9 / the 339-false-positive incident: a "use server" module is a wall.
    // Next replaces it with an RPC stub, so nothing it imports reaches the
    // browser - walking through it reports almost every file in the app.
    if (options.treatUseServerAsWall && scan.directives.includes("use server")) return;

    for (const site of scan.unresolvable) unresolvable.push(site);
    const nextTrail = [...trail, toRel(abs)];

    for (const edge of scan.edges) {
      const disposition = classifySpecifier(edge.specifier, abs, options.srcRoot);
      if (disposition.kind === "module") {
        const relPath = toRel(disposition.resolved);
        if (isForbidden(relPath)) {
          violations.push({ trail: nextTrail, specifier: edge.specifier, resolved: relPath });
        } else {
          visit(disposition.resolved, nextTrail);
        }
        continue;
      }
      if (disposition.kind === "asset") {
        if (!options.allowedAssetExtensions.includes(disposition.ext)) {
          unallowed.push({ trail: nextTrail, specifier: edge.specifier, reason: "asset" });
        }
        continue;
      }
      if (disposition.kind === "node-builtin") {
        unallowed.push({ trail: nextTrail, specifier: edge.specifier, reason: "node-builtin" });
        if (options.forbiddenBareSpecifiers.includes(edge.specifier)) {
          violations.push({ trail: nextTrail, specifier: edge.specifier, resolved: null });
        }
        continue;
      }
      if (disposition.kind === "missing") {
        unallowed.push({ trail: nextTrail, specifier: edge.specifier, reason: "missing" });
        continue;
      }
      // package
      if (!options.allowedBareSpecifiers.includes(edge.specifier)) {
        unallowed.push({ trail: nextTrail, specifier: edge.specifier, reason: "package" });
      }
      if (options.forbiddenBareSpecifiers.includes(edge.specifier)) {
        violations.push({ trail: nextTrail, specifier: edge.specifier, resolved: null });
      }
    }
  }

  for (const root of roots) visit(root, []);
  return { violations, unresolvable, unallowed, nodes: visited.size };
}

/** The A22 root derivation, generalised: this directory's non-test .ts/.tsx files. */
export function directoryRoots(absDir: string): string[] {
  return readdirSync(absDir)
    .filter(
      (name) =>
        /\.(ts|tsx)$/.test(name) &&
        !name.endsWith(".test.ts") &&
        !name.endsWith(".test.tsx") &&
        !name.endsWith(".d.ts")
    )
    .map((name) => join(absDir, name));
}
