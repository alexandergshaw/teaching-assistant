// A23: the fixture cross-product (O-A / R-6), plus R-7 through R-15.
// docs/a23-test-notes.md is the source of every fixture, requirement and
// frozen number here. Nothing here is imported by another *.test.ts, and
// this file imports nothing from another *.test.ts (traps-tests.md:46-50).
import { describe, expect, it, vi } from "vitest";

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import {
  classifySpecifier,
  computeForbiddenReachability,
  directoryRoots,
  scanRuntimeEdges,
  walkRuntimeGraph,
} from "./runtime-import-graph";
import {
  ALLOWED_ASSET_EXTENSIONS,
  ALLOWED_BARE_SPECIFIERS,
  BROWSER_SAFE_MODULES,
  FORBIDDEN_BARE_SPECIFIERS,
  FORBIDDEN_PATH_PREFIXES,
} from "./client-boundary-policy";

// L15: this file walks a real directory tree / reads many real files.
// vitest's 5000ms default testTimeout treats that as slow-but-fine when
// run alone, and as a false timeout under concurrent `npm test` load from
// sibling agents (measured: the slowest single top-level it() here runs
// well under 1s alone). Raised to the repo's existing slow-test
// convention of 30_000, already used by canvas-client-boundary.
// transitive.test.ts and runtime-import-graph.test.ts - this changes
// nothing about what any test asserts.
vi.setConfig({ testTimeout: 30_000 });

const SRC = join(process.cwd(), "src");

// ---------------------------------------------------------------------------
// O-A: the fixture cross-product. DUPLICATED (never imported) from
// classTrendsDraft.not-postable.test.ts:96-113 - used ONLY to derive each
// fixture's AC-8 direction label (positive control vs regression canary),
// per the mechanical rule: a positive control is a fixture this text
// comparator gets wrong.
// ---------------------------------------------------------------------------
const IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?(?:[\w*{}\s,]*?)\s*from\s+"([^"]+)"/gm;
function valueImportSpecifiers(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    if (match[1]) continue;
    const braces = /\{([^}]*)\}/.exec(match[0]);
    if (braces) {
      const parts = braces[1]
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length > 0 && parts.every((p) => p.startsWith("type "))) continue;
    }
    found.push(match[2]);
  }
  return found;
}

type Want = "edge" | "erased" | "residue" | "none";
type Separator = "inline" | "brace-wrap" | "from-wrap" | "tab";
interface Fixture {
  shape: string;
  side: string;
  separator: string;
  quote: string;
  source: string;
  fileName: string;
  want: Want;
}

const SPEC = "@/lib/grade";
const TAB = "\t";

function fromSuffix(sep: Separator, quote: string): string {
  if (sep === "from-wrap") return `from\n  ${quote}${SPEC}${quote};`;
  if (sep === "tab") return `from${TAB}${quote}${SPEC}${quote};`;
  return `from ${quote}${SPEC}${quote};`;
}

function bracesHead(prefix: string, content: string, sep: Separator): string {
  if (sep === "brace-wrap") {
    return content === "" ? `${prefix}{\n}` : `${prefix}{\n  ${content}\n}`;
  }
  return content === "" ? `${prefix}{}` : `${prefix}{ ${content} }`;
}

interface ClauseDef {
  shape: string;
  side: "import" | "export";
  want: Want;
  hasBraces: boolean;
  prefix: string;
  content?: string;
}

// 19 clause/side rows, matching docs/a23-test-notes.md's O-A shape table.
const CLAUSE_DEFS: ClauseDef[] = [
  { shape: "named-value", side: "import", want: "edge", hasBraces: true, prefix: "import ", content: "x" },
  { shape: "named-value", side: "export", want: "edge", hasBraces: true, prefix: "export ", content: "x" },
  { shape: "type-only-clause", side: "import", want: "erased", hasBraces: true, prefix: "import type ", content: "X" },
  { shape: "type-only-clause", side: "export", want: "erased", hasBraces: true, prefix: "export type ", content: "X" },
  { shape: "inline-type-1", side: "import", want: "erased", hasBraces: true, prefix: "import ", content: "type X" },
  { shape: "inline-type-1", side: "export", want: "erased", hasBraces: true, prefix: "export ", content: "type X" },
  { shape: "inline-type-2", side: "import", want: "erased", hasBraces: true, prefix: "import ", content: "type X, type Y" },
  { shape: "inline-type-2", side: "export", want: "erased", hasBraces: true, prefix: "export ", content: "type X, type Y" },
  { shape: "mixed-inline", side: "import", want: "edge", hasBraces: true, prefix: "import ", content: "type X, y" },
  { shape: "mixed-inline", side: "export", want: "edge", hasBraces: true, prefix: "export ", content: "type X, y" },
  { shape: "empty-braces", side: "import", want: "edge", hasBraces: true, prefix: "import ", content: "" },
  { shape: "empty-braces", side: "export", want: "edge", hasBraces: true, prefix: "export ", content: "" },
  { shape: "namespace", side: "import", want: "edge", hasBraces: false, prefix: "import * as N " },
  { shape: "namespace", side: "export", want: "edge", hasBraces: false, prefix: "export * as N " },
  { shape: "star", side: "export", want: "edge", hasBraces: false, prefix: "export * " },
  { shape: "default", side: "import", want: "edge", hasBraces: false, prefix: "import D " },
  { shape: "type-default", side: "import", want: "erased", hasBraces: false, prefix: "import type D " },
  { shape: "default-inline-type", side: "import", want: "edge", hasBraces: true, prefix: "import D, ", content: "type X" },
  { shape: "default-namespace", side: "import", want: "edge", hasBraces: false, prefix: "import D, * as N " },
];

function buildClauseFixtures(): Fixture[] {
  const out: Fixture[] = [];
  for (const def of CLAUSE_DEFS) {
    const seps: Separator[] = def.hasBraces
      ? ["inline", "brace-wrap", "from-wrap", "tab"]
      : ["inline", "from-wrap", "tab"];
    for (const sep of seps) {
      for (const quote of ['"', "'"]) {
        const head = def.hasBraces ? bracesHead(def.prefix, def.content ?? "", sep) : def.prefix.trimEnd();
        const source = `${head} ${fromSuffix(sep, quote)}`;
        out.push({
          shape: def.shape,
          side: def.side,
          separator: sep,
          quote,
          source,
          fileName: "fixture.ts",
          want: def.want,
        });
      }
    }
  }
  return out;
}

function buildNonClauseFixtures(): Fixture[] {
  const out: Fixture[] = [];
  for (const quote of ['"', "'"]) {
    out.push({
      shape: "side-effect",
      side: "-",
      separator: "-",
      quote,
      source: `import ${quote}${SPEC}${quote};`,
      fileName: "fixture.ts",
      want: "edge",
    });
    out.push({
      shape: "require",
      side: "-",
      separator: "-",
      quote,
      source: `const g = require(${quote}${SPEC}${quote});`,
      fileName: "fixture.ts",
      want: "edge",
    });
    out.push({
      shape: "dynamic-import",
      side: "-",
      separator: "-",
      quote,
      source: `const g = await import(${quote}${SPEC}${quote});`,
      fileName: "fixture.ts",
      want: "edge",
    });
    out.push({
      shape: "next-dynamic",
      side: "-",
      separator: "-",
      quote,
      source: `const C = dynamic(() => import(${quote}${SPEC}${quote}));`,
      fileName: "fixture.ts",
      want: "edge",
    });
    out.push({
      shape: "in-comment",
      side: "-",
      separator: "-",
      quote,
      source: `// import { x } from ${quote}${SPEC}${quote};`,
      fileName: "fixture.ts",
      want: "none",
    });
    const otherQuote = quote === '"' ? "'" : '"';
    out.push({
      shape: "in-string",
      side: "-",
      separator: "-",
      quote,
      source: `const s = ${quote}never import from ${otherQuote}${SPEC}${otherQuote} here${quote};`,
      fileName: "fixture.ts",
      want: "none",
    });
  }
  out.push({
    shape: "template-nosub",
    side: "-",
    separator: "-",
    quote: "`",
    source: `const g = await import(\`${SPEC}\`);`,
    fileName: "fixture.ts",
    want: "edge",
  });
  out.push({
    shape: "computed",
    side: "-",
    separator: "-",
    quote: "-",
    source: `const g = await import(pathVar);`,
    fileName: "fixture.ts",
    want: "residue",
  });
  out.push({
    shape: "template-substituted",
    side: "-",
    separator: "-",
    quote: "`",
    source: "const g = await import(`${base}/grade`);",
    fileName: "fixture.ts",
    want: "residue",
  });
  for (const quote of ['"', "'"]) {
    out.push({
      shape: "require-inside-jsx",
      side: "-",
      separator: "-",
      quote,
      source: `export function C() { return <div>{require(${quote}${SPEC}${quote})}</div>; }`,
      fileName: "fixture.tsx",
      want: "edge",
    });
  }
  // Fix 5 (a23-test-notes.md's founding class, reappearing a third time): TS's
  // import-equals form is a fourth declaration kind, neither an erased
  // type-only declaration nor one of the three previously-enumerated kinds.
  // Both spellings are edges; neither is expressible by valueImportSpecifiers
  // (no `from` token), so both are positive controls by construction.
  out.push({
    shape: "import-equals",
    side: "-",
    separator: "-",
    quote: '"',
    source: `import g = require("${SPEC}");`,
    fileName: "fixture.ts",
    want: "edge",
  });
  out.push({
    shape: "export-import-equals",
    side: "-",
    separator: "-",
    quote: '"',
    source: `export import g = require("${SPEC}");`,
    fileName: "fixture.ts",
    want: "edge",
  });
  return out;
}

const CLAUSE_SHAPES = Array.from(new Set(CLAUSE_DEFS.map((d) => d.shape)));
const NONCLAUSE_SHAPES = [
  "side-effect",
  "require",
  "dynamic-import",
  "next-dynamic",
  "template-nosub",
  "computed",
  "template-substituted",
  "in-comment",
  "in-string",
  "require-inside-jsx",
  "import-equals",
  "export-import-equals",
];

const CLAUSE_FIXTURES = buildClauseFixtures();
const NONCLAUSE_FIXTURES = buildNonClauseFixtures();
const FIXTURES = [...CLAUSE_FIXTURES, ...NONCLAUSE_FIXTURES];

function isDisagreement(f: Fixture): boolean {
  // A comparator with no residue channel cannot express the correct answer
  // for want=residue, so it is a disagreement by construction (O-A
  // convention 1).
  if (f.want === "residue") return true;
  const flagged = valueImportSpecifiers(f.source).includes(SPEC);
  const shouldFlag = f.want === "edge";
  return flagged !== shouldFlag;
}

function label(f: Fixture): "positive-control" | "regression-canary" {
  return isDisagreement(f) ? "positive-control" : "regression-canary";
}

describe("R-6a: every fixture's AST verdict matches its want", () => {
  it.each(FIXTURES.map((f) => [`${f.shape}/${f.side}/${f.separator}/${f.quote}`, f] as const))(
    "%s",
    (_label, f) => {
      const scan = scanRuntimeEdges(f.source, f.fileName);
      const hasEdge = scan.edges.some((e) => e.specifier === SPEC);
      if (f.want === "edge") {
        expect(hasEdge).toBe(true);
        expect(scan.unresolvable).toHaveLength(0);
      } else if (f.want === "residue") {
        expect(hasEdge).toBe(false);
        expect(scan.unresolvable.length).toBeGreaterThan(0);
      } else {
        // erased or none
        expect(hasEdge).toBe(false);
      }
    }
  );
});

describe("R-6b: every fixture carries a direction label derived from want, not from an observed value", () => {
  it("splits into 60 positive controls and 97 regression canaries", () => {
    const positive = FIXTURES.filter((f) => label(f) === "positive-control").length;
    const canary = FIXTURES.filter((f) => label(f) === "regression-canary").length;
    expect(positive).toBe(62);
    expect(canary).toBe(97);
  });
});

describe("R-6c: the fixture count is frozen, and so is the shape count", () => {
  it("fixtures.length === 159", () => {
    expect(FIXTURES.length).toBe(159);
  });
  it("CLAUSE_SHAPES.length === 12 and NONCLAUSE_SHAPES.length === 12", () => {
    expect(CLAUSE_SHAPES.length).toBe(12);
    expect(NONCLAUSE_SHAPES.length).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// R-7: a .tsx source is parsed as TSX.
// ---------------------------------------------------------------------------
describe("R-7: a .tsx source is parsed as TSX", () => {
  it("the require-inside-jsx edge is found under a .tsx file name and lost under .ts", () => {
    const src = 'export function C() { return <div>{require("@/lib/grade")}</div>; }';
    expect(scanRuntimeEdges(src, "fixture.tsx").edges.map((e) => e.specifier)).toEqual(["@/lib/grade"]);
    expect(scanRuntimeEdges(src, "fixture.ts").edges.map((e) => e.specifier)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// R-8: the forbidden-path prefix is CHARACTER-BY-CHARACTER, and a SIBLING
// FILE IS FLAGGED. A configuration oracle: browserSafeModules: [],
// treatUseServerAsWall: false - not a real-tree assertion.
// ---------------------------------------------------------------------------
describe("R-8: forbidden-path prefix matching is character-by-character, no segment boundary", () => {
  const oracleOptions = (forbiddenPathPrefixes: string[]) => ({
    srcRoot: SRC,
    forbiddenPathPrefixes,
    browserSafeModules: [],
    forbiddenBareSpecifiers: [],
    allowedBareSpecifiers: ALLOWED_BARE_SPECIFIERS,
    allowedAssetExtensions: ALLOWED_ASSET_EXTENSIONS,
    treatUseServerAsWall: false,
  });

  it("R-8a: a sibling file, app/actions.ts, is flagged when its own edges reach it (no trailing slash on the prefix)", () => {
    const root = join(SRC, "app", "account", "diagnostics", "page.tsx");
    const result = walkRuntimeGraph([root], oracleOptions(["app/actions"]));
    expect(result.violations.some((v) => v.resolved === "app/actions.ts")).toBe(true);
  });

  it("R-8b: a sibling file, lib/canvas.ts, is flagged (no trailing slash on the prefix)", () => {
    const root = join(SRC, "lib", "course-intel", "canvas-readers.ts");
    const result = walkRuntimeGraph([root], oracleOptions(["lib/canvas"]));
    expect(result.violations.some((v) => v.resolved === "lib/canvas.ts")).toBe(true);
  });

  it("R-8c: a file inside the forbidden directory is also flagged", () => {
    const root = join(SRC, "lib", "canvas", "announcements.ts");
    const result = walkRuntimeGraph([root], oracleOptions(["lib/canvas"]));
    expect(result.violations.some((v) => v.resolved?.startsWith("lib/canvas/"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R-9: a "use server" module is a WALL. The 339-false-positive incident.
// ---------------------------------------------------------------------------
describe('R-9: a "use server" module is a wall - removing it explodes both real closures', () => {
  it(
    "repo-grades and grading-results closures both explode past 50 violations with the wall removed",
    { timeout: 30000 },
    () => {
      const rgRoots = directoryRoots(join(SRC, "app", "components", "repo-grades"));
      const grRoots = [
        ...directoryRoots(join(SRC, "app", "components", "grading-results")),
        join(SRC, "app", "components", "GradingResults.tsx"),
        join(SRC, "lib", "grade", "types.ts"),
      ];
      const noWallOptions = {
        srcRoot: SRC,
        forbiddenPathPrefixes: FORBIDDEN_PATH_PREFIXES,
        browserSafeModules: BROWSER_SAFE_MODULES,
        forbiddenBareSpecifiers: FORBIDDEN_BARE_SPECIFIERS,
        allowedBareSpecifiers: ALLOWED_BARE_SPECIFIERS,
        allowedAssetExtensions: ALLOWED_ASSET_EXTENSIONS,
        treatUseServerAsWall: false,
      };
      const rg = walkRuntimeGraph(rgRoots, noWallOptions);
      const gr = walkRuntimeGraph(grRoots, noWallOptions);
      expect(rg.violations.length).toBeGreaterThan(50);
      expect(gr.violations.length).toBeGreaterThan(50);
    }
  );
});

// ---------------------------------------------------------------------------
// R-10: all FIVE policy lists are frozen, and two of them are disjoint.
// ---------------------------------------------------------------------------
describe("R-10: the five policy lists are frozen literals, and the allow/deny specifier lists are disjoint", () => {
  it("matches the frozen literals", () => {
    expect(FORBIDDEN_PATH_PREFIXES).toEqual(["lib/supabase"]);
    expect(BROWSER_SAFE_MODULES).toEqual(["lib/supabase/client.ts"]);
    expect(FORBIDDEN_BARE_SPECIFIERS).toEqual(["next/headers", "node:async_hooks", "server-only"]);
    expect(ALLOWED_BARE_SPECIFIERS).toEqual([
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
    ]);
    expect(ALLOWED_ASSET_EXTENSIONS).toEqual([".css"]);
  });

  it("ALLOWED_BARE_SPECIFIERS and FORBIDDEN_BARE_SPECIFIERS share no element, compared as raw literal arrays", () => {
    const intersection = ALLOWED_BARE_SPECIFIERS.filter((s) => FORBIDDEN_BARE_SPECIFIERS.includes(s));
    expect(intersection).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// R-11: the leaf is not reachable from a client bundle.
// ---------------------------------------------------------------------------
describe("R-11: no file under src/ - test or non-test - imports this leaf except a *.test.ts", () => {
  it(
    "finds at least 3 importers (anti-vacuity), and every one ends in .test.ts",
    { timeout: 30000 },
    () => {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) {
            walk(full);
            continue;
          }
          if (/\.(ts|tsx)$/.test(name)) files.push(full);
        }
      };
      walk(SRC);

      const leafAbs = join(SRC, "lib", "module-graph", "runtime-import-graph.ts");
      const importers = files.filter((file) => {
        const source = readFileSync(file, "utf8");
        const scan = scanRuntimeEdges(source, file);
        return [...scan.edges.map((e) => e.specifier)].some((spec) => {
          if (!(spec.startsWith("@/") || spec.startsWith("."))) return false;
          const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : normalize(join(dirname(file), spec));
          return [`${base}.ts`, `${base}.tsx`].includes(leafAbs) || base === leafAbs.replace(/\.ts$/, "");
        });
      });

      expect(importers.length).toBeGreaterThanOrEqual(3);
      expect(importers.every((p) => p.endsWith(".test.ts"))).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// R-14: classifySpecifier returns the right bucket by the right candidate.
// ---------------------------------------------------------------------------
describe("R-14: classifySpecifier's buckets, over the five-bucket x resolution-candidate census", () => {
  const rows: Array<{ specifier: string; importer: string; bucket: string; candidateSuffix?: string }> = [
    { specifier: "@/lib/grade/types", importer: join(SRC, "app", "x.ts"), bucket: "module", candidateSuffix: ".ts" },
    {
      specifier: "./ungradedRowLabel",
      importer: join(SRC, "app", "components", "grading-results", "x.ts"),
      bucket: "module",
      candidateSuffix: ".ts",
    },
    {
      specifier: "@/app/components/grading-results/icons",
      importer: join(SRC, "app", "x.ts"),
      bucket: "module",
      candidateSuffix: ".tsx",
    },
    {
      specifier: "./icons",
      importer: join(SRC, "app", "components", "grading-results", "x.ts"),
      bucket: "module",
      candidateSuffix: ".tsx",
    },
    { specifier: "@/lib/prose", importer: join(SRC, "app", "x.ts"), bucket: "module", candidateSuffix: `${sep}index.ts` },
    {
      specifier: "../../../lib/prose",
      importer: join(SRC, "app", "components", "grading-results", "x.ts"),
      bucket: "module",
      candidateSuffix: `${sep}index.ts`,
    },
    {
      specifier: "@/app/components/repo-grades",
      importer: join(SRC, "app", "x.ts"),
      bucket: "module",
      candidateSuffix: `${sep}index.tsx`,
    },
    {
      specifier: "../repo-grades",
      importer: join(SRC, "app", "components", "grading-results", "x.ts"),
      bucket: "module",
      candidateSuffix: `${sep}index.tsx`,
    },
    {
      specifier: "./../../account/people/people.module.css",
      importer: join(SRC, "app", "components", "grading-results", "x.ts"),
      bucket: "asset",
    },
    {
      specifier: "@/app/account/people/people.module.css",
      importer: join(SRC, "app", "x.ts"),
      bucket: "asset",
    },
    { specifier: "node:crypto", importer: join(SRC, "app", "x.ts"), bucket: "node-builtin" },
    { specifier: "fs", importer: join(SRC, "app", "x.ts"), bucket: "node-builtin" },
    { specifier: "@/lib/grade/NoSuchModule", importer: join(SRC, "app", "x.ts"), bucket: "missing" },
    { specifier: "./NoSuchModule", importer: join(SRC, "app", "x.ts"), bucket: "missing" },
    { specifier: "@/app/components", importer: join(SRC, "app", "x.ts"), bucket: "missing" },
    { specifier: "@mui/material", importer: join(SRC, "app", "x.ts"), bucket: "package" },
    { specifier: "react", importer: join(SRC, "app", "x.ts"), bucket: "package" },
    { specifier: "@mui/material/Button", importer: join(SRC, "app", "x.ts"), bucket: "package" },
  ];

  it("18 rows, 0 mismatches on bucket or resolution candidate", () => {
    expect(rows.length).toBe(18);
    let mismatches = 0;
    for (const row of rows) {
      const disposition = classifySpecifier(row.specifier, row.importer, SRC);
      if (disposition.kind !== row.bucket) mismatches += 1;
      if (disposition.kind === "module" && row.candidateSuffix) {
        if (!disposition.resolved.endsWith(row.candidateSuffix)) mismatches += 1;
      }
    }
    expect(mismatches).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// R-15: Violation.resolved's PATH FORM is pinned by the seam - a COMPUTED
// expectation, never a regex enumeration of its properties.
// ---------------------------------------------------------------------------
describe("R-15: Violation.resolved is relative(srcRoot, abs), POSIX-joined - a computed expectation", () => {
  it("every violation on the grade-barrel canary walk matches the computed form", () => {
    const root = join(SRC, "lib", "grade.ts");
    const result = walkRuntimeGraph([root], {
      srcRoot: SRC,
      forbiddenPathPrefixes: FORBIDDEN_PATH_PREFIXES,
      browserSafeModules: BROWSER_SAFE_MODULES,
      forbiddenBareSpecifiers: FORBIDDEN_BARE_SPECIFIERS,
      allowedBareSpecifiers: ALLOWED_BARE_SPECIFIERS,
      allowedAssetExtensions: ALLOWED_ASSET_EXTENSIONS,
      treatUseServerAsWall: true,
    });
    expect(result.violations.length).toBeGreaterThan(0);
    for (const violation of result.violations) {
      if (violation.resolved === null) continue;
      // THE CONSTRUCTION, not an enumeration of the property: re-resolve the
      // violating edge from the last file in its own trail and recompute
      // relative(srcRoot, abs).split(sep).join("/") independently, rather
      // than matching a regex against the value under test.
      const importerAbs = join(SRC, ...violation.trail[violation.trail.length - 1].split("/"));
      const disposition = classifySpecifier(violation.specifier, importerAbs, SRC);
      expect(disposition.kind).toBe("module");
      if (disposition.kind !== "module") continue;
      const expected = relative(SRC, disposition.resolved).split(sep).join("/");
      expect(violation.resolved).toBe(expected);
    }
    expect(result.violations.some((v) => v.resolved?.startsWith("lib/supabase/server"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R-16: engine.ts's OWN runtime closure, pinned per-DIRECT-EDGE, by exact
// trail. A39 W2-5 residual (docs/backlog.yml): R-9 above already proves
// lib/supabase/server.ts is reachable from lib/grade.ts's barrel through
// lib/grade/rubric.ts, so a plain `walkRuntimeGraph([engineAbs], ...)` here
// would not measure what W2-5 needs, for a second, subtler reason beyond the
// resolved-target problem the residual names: walkRuntimeGraph MEMOIZES on
// the visited absolute path (runtime-import-graph.ts:229-230). Once
// lib/research/rubric-bank.ts is visited via engine.ts -> lib/grade/rubric.ts
// -> rubric-bank.ts, a SECOND, more direct edge from engine.ts straight to
// rubric-bank.ts - exactly what importing rubricFingerprint from
// ../research/rubric-bank instead of ../research/rubric-fingerprint adds -
// hits the `if (visited.has(abs)) return;` guard and is silently dropped
// from a single whole-graph walk rooted at engine.ts: no new violation, no
// new trail, verified empirically (npx tsx probe against the sabotaged
// file, reported in this change's PR/handback) to reproduce zero change in
// violations under that exact mutation.
//
// The fix is to walk each of engine.ts's DIRECT edges INDEPENDENTLY, each
// with its OWN fresh call to walkRuntimeGraph (a fresh `visited` Set is
// created inside every call), so a new direct edge always gets its own
// full, unshadowed downstream walk rather than being absorbed into a
// visited-set left behind by a sibling edge's traversal.
// ---------------------------------------------------------------------------
describe("R-16: engine.ts's own runtime closure is pinned per direct edge, by exact trail", () => {
  const walkOptions = {
    srcRoot: SRC,
    forbiddenPathPrefixes: FORBIDDEN_PATH_PREFIXES,
    browserSafeModules: BROWSER_SAFE_MODULES,
    forbiddenBareSpecifiers: FORBIDDEN_BARE_SPECIFIERS,
    allowedBareSpecifiers: ALLOWED_BARE_SPECIFIERS,
    allowedAssetExtensions: ALLOWED_ASSET_EXTENSIONS,
    treatUseServerAsWall: true,
  };
  const ENGINE_ABS = join(SRC, "lib", "grade", "engine.ts");

  // Frozen literal, measured against the real tree at authoring time (npx tsx
  // probe, reported in this change's handback): engine.ts has THREE direct
  // edges whose INDEPENDENT downstream walk reaches lib/supabase -
  // lib/grade/rubric.ts (-> rubric-bank.ts -> db.ts), lib/grade/extraction.ts
  // (a dynamic import, -> the Canvas credential chain, which itself reaches
  // rubric-bank.ts a second way through lib/grade.ts's barrel), and "../canvas"
  // (also a dynamic import, inside gradeCanvasUrl, duplicating the same Canvas
  // chain one hop shorter) - ten trails in total as of A39 wave 4b, which
  // added an eleventh direct edge's own independent walk (../reconcile,
  // itself importing ./rubric - see FROZEN_TRAILS' own comment below).
  // engine.ts's fourth relevant
  // direct edge today, ../research/rubric-fingerprint, walks to ZERO
  // violations (it depends on nothing but node:crypto and a text helper) -
  // that is the leaf the sabotage below swaps out from under this list. A
  // tenth trail whose first hop is "lib/grade/engine.ts ->
  // lib/research/rubric-bank.ts" - what importing rubricFingerprint from
  // ../research/rubric-bank instead produces - is not in this list, and the
  // deep-equal goes red on it because that edge now gets its OWN independent
  // walk instead of being memoized away (confirmed empirically: this exact
  // mutation raised the list from 9 to 10 trails and failed the deep-equal).
  const FROZEN_TRAILS = [
    "lib/grade/engine.ts -> lib/canvas.ts -> lib/canvas/discussions.ts -> lib/canvas-core.ts -> lib/canvas-credentials.ts",
    "lib/grade/engine.ts -> lib/canvas.ts -> lib/canvas/discussions.ts -> lib/canvas-core.ts -> lib/canvas-credentials.ts -> lib/lms-credentials.ts",
    "lib/grade/engine.ts -> lib/canvas.ts -> lib/canvas/inbox.ts",
    "lib/grade/engine.ts -> lib/canvas.ts -> lib/canvas/listings.ts -> lib/canvas/auto-zero.ts -> lib/grade-zeros.ts -> lib/grade.ts -> lib/grade/rubric.ts -> lib/research/rubric-bank.ts -> lib/research/db.ts",
    "lib/grade/engine.ts -> lib/grade/extraction.ts -> lib/canvas.ts -> lib/canvas/discussions.ts -> lib/canvas-core.ts -> lib/canvas-credentials.ts",
    "lib/grade/engine.ts -> lib/grade/extraction.ts -> lib/canvas.ts -> lib/canvas/discussions.ts -> lib/canvas-core.ts -> lib/canvas-credentials.ts -> lib/lms-credentials.ts",
    "lib/grade/engine.ts -> lib/grade/extraction.ts -> lib/canvas.ts -> lib/canvas/inbox.ts",
    "lib/grade/engine.ts -> lib/grade/extraction.ts -> lib/canvas.ts -> lib/canvas/listings.ts -> lib/canvas/auto-zero.ts -> lib/grade-zeros.ts -> lib/grade.ts -> lib/grade/rubric.ts -> lib/research/rubric-bank.ts -> lib/research/db.ts",
    // A39 wave 4b: engine.ts now imports ./reconcile (the pure canonical-
    // column projection, docs/a39-waves.md 8.4.2), which itself imports
    // ./rubric for normalizeAreaName - an independent walk from THIS direct
    // edge, one hop shorter than the pre-existing "lib/grade/engine.ts ->
    // lib/grade/rubric.ts -> ..." trail below because reconcile.ts sits
    // between them. reconcile.ts imports nothing else (its own header:
    // "imports only ./types and ./rubric"), so this is the only new trail
    // this wave adds - ten in total, not nine.
    "lib/grade/engine.ts -> lib/grade/reconcile.ts -> lib/grade/rubric.ts -> lib/research/rubric-bank.ts -> lib/research/db.ts",
    "lib/grade/engine.ts -> lib/grade/rubric.ts -> lib/research/rubric-bank.ts -> lib/research/db.ts",
  ];

  // PURE per test run: reads engine.ts's real source, extracts its own direct
  // edges with the same AST scanner the walk itself uses (never a duplicated
  // text pattern), then walks each distinct resolved child as its OWN root -
  // a fresh, unshadowed walkRuntimeGraph call per direct edge.
  function engineViolationTrails(): string[] {
    const source = readFileSync(ENGINE_ABS, "utf8");
    const scan = scanRuntimeEdges(source, ENGINE_ABS);
    const trails: string[] = [];
    const visitedChildren = new Set<string>();
    for (const edge of scan.edges) {
      const disposition = classifySpecifier(edge.specifier, ENGINE_ABS, SRC);
      if (disposition.kind !== "module") continue;
      if (visitedChildren.has(disposition.resolved)) continue;
      visitedChildren.add(disposition.resolved);
      const childResult = walkRuntimeGraph([disposition.resolved], walkOptions);
      for (const v of childResult.violations) {
        trails.push(["lib/grade/engine.ts", ...v.trail].join(" -> "));
      }
    }
    return trails.sort();
  }

  it("engine.ts reaches exactly the frozen set of server-only trails today (positive control: non-empty)", () => {
    const trails = engineViolationTrails();
    expect(trails.length).toBeGreaterThan(0);
    expect(trails).toEqual(FROZEN_TRAILS);
  });

  it("every frozen trail resolves to a lib/supabase module - the class this guards against", () => {
    const source = readFileSync(ENGINE_ABS, "utf8");
    const scan = scanRuntimeEdges(source, ENGINE_ABS);
    let total = 0;
    for (const edge of scan.edges) {
      const disposition = classifySpecifier(edge.specifier, ENGINE_ABS, SRC);
      if (disposition.kind !== "module") continue;
      const childResult = walkRuntimeGraph([disposition.resolved], walkOptions);
      for (const v of childResult.violations) {
        total += 1;
        expect(v.resolved).not.toBeNull();
        expect(v.resolved?.startsWith("lib/supabase")).toBe(true);
      }
    }
    expect(total).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// R-17: computeForbiddenReachability does not depend on root order or count
// (RULING 119). Regression for a real bug caught before it shipped: a first
// version memoized a single recursive DFS's per-node answer, which is
// correct on an acyclic graph and wrong on a cyclic one. `lib/canvas.ts` and
// `lib/canvas/listings.ts` form a real cycle in THIS repo today
// (listings.ts -> auto-zero.ts -> grade-zeros.ts -> grade.ts ->
// extraction.ts -> canvas.ts -> back to listings.ts), and extraction.ts
// separately reaches `lib/github.repos.ts` via repo-content.ts -> github.ts.
// Walking `actions/accommodations.ts` FIRST (it reaches listings.ts via a
// different route and starts exploring the cycle before extraction.ts's
// OWN edge to repo-content.ts is found) used to permanently memoize
// `lib/canvas.ts` as "does not reach forbidden" - a false frozen mid-cycle,
// never corrected once the rest of the cycle proved true - so a LATER root,
// `actions/canvas-inbox.ts`, which reaches the target only through
// `lib/canvas.ts`, silently dropped out of the detected set the moment both
// roots were walked in the same call. Single-root walks never exercised this
// (each got a fresh, empty memo), which is why this must be asserted with
// BOTH roots in the SAME call, in the order that triggers it.
// ---------------------------------------------------------------------------
describe("R-17: computeForbiddenReachability does not depend on root order or count (RULING 119)", () => {
  const reachabilityOptions = {
    srcRoot: SRC,
    forbiddenPathPrefixes: ["lib/github.repos.ts"],
    browserSafeModules: [],
    treatUseServerAsWall: false,
  };
  const CANVAS_INBOX = join(SRC, "app", "actions", "canvas-inbox.ts");
  const ACCOMMODATIONS = join(SRC, "app", "actions", "accommodations.ts");

  it("canvas-inbox.ts alone reaches lib/github.repos.ts (positive control)", () => {
    const result = computeForbiddenReachability([CANVAS_INBOX], reachabilityOptions);
    expect(result.has(CANVAS_INBOX)).toBe(true);
  });

  it("canvas-inbox.ts still reaches it when walked AFTER accommodations.ts touches the same cycle first - the exact shape that broke the single-DFS-memo version", () => {
    const result = computeForbiddenReachability([ACCOMMODATIONS, CANVAS_INBOX], reachabilityOptions);
    expect(result.has(ACCOMMODATIONS)).toBe(true);
    expect(result.has(CANVAS_INBOX)).toBe(true);
  });

  it("the answer for canvas-inbox.ts is identical regardless of how many OTHER roots are walked alongside it", () => {
    const alone = computeForbiddenReachability([CANVAS_INBOX], reachabilityOptions);
    const withSibling = computeForbiddenReachability([ACCOMMODATIONS, CANVAS_INBOX], reachabilityOptions);
    const siblingFirst = computeForbiddenReachability([CANVAS_INBOX, ACCOMMODATIONS], reachabilityOptions);
    expect(withSibling.has(CANVAS_INBOX)).toBe(alone.has(CANVAS_INBOX));
    expect(siblingFirst.has(CANVAS_INBOX)).toBe(alone.has(CANVAS_INBOX));
  });
});
