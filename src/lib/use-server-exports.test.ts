// Guard against a build break that neither `tsc --noEmit` nor `vitest run`
// can see: a "use server" module may export NOTHING but async functions
// (plus type-only exports, which are erased). Turbopack enforces this at
// build time with "Only async functions are allowed to be exported in a
// 'use server' file" - a plain `export const`, a synchronous
// `export function`, or an `export { x } from "./y"` re-export (illegal by
// FORM - the compiler cannot see through a re-export to prove the binding it
// names is async) all compile clean under tsc and pass every unit test, then
// break `next build`. That is exactly how this class of bug reached main
// once already (see the course-planning-grounding.ts / knowledge-check.ts
// fix this guard was added alongside) - this test exists so the NEXT
// instance is caught by `vitest run`, in seconds, instead of by a failed
// build.
//
// Two pure functions do the actual work, both operating on file TEXT (never
// touching disk themselves) so the canary suite below can drive them with
// small in-memory fixtures:
//   - isUseServerModuleText: does this file's first non-blank, non-comment
//     line carry the "use server" directive?
//   - findIllegalUseServerExports: for a file already known to be a "use
//     server" module, which lines export something that is not one of the
//     four legal forms (export async function, export default async
//     function, export type ..., export interface ...)?
//
// This repo has been bitten before by a scanner that silently matched
// nothing and reported "clean" without ever actually checking anything (see
// AGENTS.md/the emoji-scan lesson) - the canary describe block below proves
// both functions actually fire on a known-bad fixture, not just that they
// return empty on real source.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

interface ExportViolation {
  line: number;
  text: string;
}

/**
 * True when `text`'s first non-blank, non-comment line is the "use server"
 * directive (single or double quotes, semicolon optional). Skips leading
 * blank lines, leading line comments, and leading block comments (including
 * one that closes and is followed by code on the same line) before looking
 * at the first substantive line - the same rule Next.js itself uses to
 * locate the directive.
 */
function isUseServerModuleText(text: string): boolean {
  const lines = text.split(/\r?\n/);
  let inBlockComment = false;

  for (const rawLine of lines) {
    let remainder = rawLine.trim();
    if (remainder === "") continue;

    if (inBlockComment) {
      const end = remainder.indexOf("*/");
      if (end === -1) continue; // still inside the block comment
      remainder = remainder.slice(end + 2).trim();
      inBlockComment = false;
      if (remainder === "") continue;
    }

    if (remainder.startsWith("//")) continue;

    if (remainder.startsWith("/*")) {
      const end = remainder.indexOf("*/", 2);
      if (end === -1) {
        inBlockComment = true;
        continue;
      }
      remainder = remainder.slice(end + 2).trim();
      if (remainder === "") continue;
    }

    // `remainder` is now the first substantive text on the first
    // non-blank, non-comment line - check it, then stop regardless of the
    // result, since only the FIRST such line counts as the directive.
    return /^['"]use server['"];?$/.test(remainder);
  }

  return false;
}

/**
 * Scans every line of `text` for an illegal top-level export form. Only four
 * forms are legal in a "use server" module: `export async function ...`,
 * `export default async function ...`, and the two type-only forms
 * (`export type ...` - which covers both `export type { X } from "./y"` and
 * `export type * from "./y"` - and `export interface ...`), since type
 * exports are erased before the "async-only" rule ever applies. Anything
 * else that opens a line with the `export` keyword - `export const`,
 * `export let`, `export var`, `export class`, a synchronous
 * `export function`, `export { x } from "./y"`, `export * from "./y"`, or a
 * bare `export { x }` block (single- or multi-line: a multi-line one only
 * has "export {" on its opening line, which is enough to flag it) - is
 * illegal and gets reported.
 */
function findIllegalUseServerExports(text: string): ExportViolation[] {
  const ALLOWED = [
    /^export\s+async\s+function\b/,
    /^export\s+default\s+async\s+function\b/,
    /^export\s+type\b/,
    /^export\s+interface\b/,
  ];

  // The one `export type` form that is NOT safe: a BARE re-export list with no
  // `from` clause - `export type { Foo };` - naming a binding this module
  // imported at the top. This shipped and BROKE A PRODUCTION DEPLOY:
  //
  //   Error: Turbopack build failed with 1 errors:
  //   The export GenerationFailure was not found in module
  //   [project]/src/app/actions/lms-generation.ts [app-rsc] (ecmascript).
  //
  // The type is erased, and the "use server" transform is then left
  // enumerating an export name with nothing behind it. `tsc --noEmit` and
  // `eslint` both pass; only `next build` catches it, which is precisely why
  // this line-level guard now exists. Declaring a type (`export type Bar =
  // ...`, `export interface Baz {...}`) is still fine - it is only the bare
  // RE-export of an imported binding that breaks.
  //
  // Deliberately NOT flagged: `export type { Foo } from "./shape"` and
  // `export type * from "./other"`. Those name their source module directly,
  // so nothing dangles, and the canary below still asserts they stay legal.
  // The evidence from the broken deploy covers only the bare form, so this
  // guard flags only the bare form rather than widening on a guess.
  const BARE_TYPE_REEXPORT = /^export\s+type\s*\{/;
  const HAS_FROM_CLAUSE = /\bfrom\s*['"]/;

  const violations: ExportViolation[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (!/^export\b/.test(trimmed)) return;
    if (BARE_TYPE_REEXPORT.test(trimmed) && !HAS_FROM_CLAUSE.test(trimmed)) {
      violations.push({ line: index + 1, text: trimmed });
      return;
    }
    if (ALLOWED.some((re) => re.test(trimmed))) return;
    violations.push({ line: index + 1, text: trimmed });
  });

  return violations;
}

describe("use-server export detector (canary: proves the detector actually detects)", () => {
  // RCA precedent (see AGENTS.md's emoji-scan lesson): a scanner that
  // silently matches nothing still reports "clean". These fixtures force
  // both functions to prove a positive AND a negative result before the real
  // filesystem scan below is trusted at all.

  describe("isUseServerModuleText", () => {
    it("recognizes the directive as the first line", () => {
      expect(isUseServerModuleText('"use server";\n\nexport async function f() {}\n')).toBe(true);
    });

    it("recognizes the directive with single quotes and no semicolon", () => {
      expect(isUseServerModuleText("'use server'\n\nexport async function f() {}\n")).toBe(true);
    });

    it("skips leading blank lines and a leading line comment before the directive", () => {
      const fixture = [
        "",
        "// header comment",
        '"use server";',
        "",
        "export async function f() {}",
        "",
      ].join("\n");
      expect(isUseServerModuleText(fixture)).toBe(true);
    });

    it("skips a leading block comment (including one closed on its own opening line) before the directive", () => {
      const fixture = ["/* header */", '"use server";', "", "export async function f() {}", ""].join("\n");
      expect(isUseServerModuleText(fixture)).toBe(true);
    });

    it("skips a multi-line leading block comment before the directive", () => {
      const fixture = [
        "/**",
        " * A JSDoc-style header explaining this module.",
        " */",
        '"use server";',
        "",
        "export async function f() {}",
        "",
      ].join("\n");
      expect(isUseServerModuleText(fixture)).toBe(true);
    });

    it("returns false for a plain module whose first real line is a normal export, not the directive", () => {
      const fixture = ["// some comment", "export const NOT_A_SERVER_FILE = 1;", ""].join("\n");
      expect(isUseServerModuleText(fixture)).toBe(false);
    });

    it("returns false when the directive appears after other code, not as the first line", () => {
      const fixture = ["export const x = 1;", '"use server";', ""].join("\n");
      expect(isUseServerModuleText(fixture)).toBe(false);
    });
  });

  describe("findIllegalUseServerExports", () => {
    it("flags a known violation (export const) in an otherwise valid module", () => {
      const violatingFixture = [
        '"use server";',
        "",
        "export async function goodFn() {",
        "  return 1;",
        "}",
        "",
        "export const BAD_CONST = 42;",
        "",
      ].join("\n");

      const violations = findIllegalUseServerExports(violatingFixture);
      expect(violations).toHaveLength(1);
      expect(violations[0].text).toBe("export const BAD_CONST = 42;");
      // Line numbers are 1-indexed and must point at the actual offending line.
      expect(violations[0].line).toBe(7);
    });

    it("reports zero violations for a clean fixture using every legal form", () => {
      const cleanFixture = [
        '"use server";',
        "",
        "export async function goodFn() {",
        "  return 1;",
        "}",
        "",
        "export default async function defaultFn() {",
        "  return 2;",
        "}",
        "",
        "export type { Foo } from './shape';",
        "export type * from './other-shape';",
        "export type Bar = { a: number };",
        "",
        "export interface Baz {",
        "  b: string;",
        "}",
        "",
      ].join("\n");

      expect(findIllegalUseServerExports(cleanFixture)).toEqual([]);
    });

    it("flags every illegal form named in the acceptance criteria", () => {
      const fixture = [
        "export const A = 1;",
        "export let b = 2;",
        "export var c = 3;",
        "export class Thing {}",
        "export function syncFn() {}",
        "export { x, y } from './other';",
        "export * from './everything';",
        "export {",
        "  localA,",
        "  localB,",
        "};",
      ].join("\n");

      const violations = findIllegalUseServerExports(fixture);
      // One violation per offending line - the bare multi-line `export {`
      // block only flags its opening line, which is sufficient to fail the
      // test and point a reader at the right spot.
      expect(violations).toHaveLength(8);
      expect(violations.map((v) => v.text)).toEqual([
        "export const A = 1;",
        "export let b = 2;",
        "export var c = 3;",
        "export class Thing {}",
        "export function syncFn() {}",
        "export { x, y } from './other';",
        "export * from './everything';",
        "export {",
      ]);
    });

    it("flags a BARE `export type { X };` re-export - the form that broke a production deploy", () => {
      // Reproduces src/app/actions/lms-generation.ts's regression exactly: a
      // type imported at the top, then re-exported with no `from` clause.
      // Turbopack erased it and then failed with "The export GenerationFailure
      // was not found in module ...". tsc and eslint both passed.
      const fixture = [
        '"use server";',
        "",
        'import type { GenerationFailure } from "@/lib/lms-generation/kinds";',
        "",
        "export type { GenerationFailure };",
        "",
        "export async function goodFn(): Promise<GenerationFailure | null> {",
        "  return null;",
        "}",
        "",
      ].join("\n");

      const violations = findIllegalUseServerExports(fixture);
      expect(violations).toHaveLength(1);
      expect(violations[0].text).toBe("export type { GenerationFailure };");
      expect(violations[0].line).toBe(5);
    });

    it("still allows a type re-export that names its source module", () => {
      // The `from` forms are NOT what broke the deploy - they name their
      // source directly, so nothing dangles. Kept legal deliberately; see
      // findIllegalUseServerExports' own comment on why this guard does not
      // widen past the evidence.
      const fixture = [
        '"use server";',
        "",
        "export type { Foo } from './shape';",
        "export type * from './other-shape';",
        "",
      ].join("\n");

      expect(findIllegalUseServerExports(fixture)).toEqual([]);
    });
  });
});

describe("no 'use server' module exports a non-async binding (real source scan)", () => {
  function walk(dir: string, out: string[]): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, out);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
      out.push(full);
    }
    return out;
  }

  const srcRoot = path.resolve(process.cwd(), "src");
  const allSourceFiles = walk(srcRoot, []);

  const useServerFiles = allSourceFiles.filter((file) => isUseServerModuleText(fs.readFileSync(file, "utf-8")));

  it("finds more than 30 'use server' modules under src/ (so this test cannot pass by scanning zero files)", () => {
    expect(useServerFiles.length).toBeGreaterThan(30);
  });

  it("has no illegal export form in any 'use server' module", () => {
    const failures: string[] = [];

    for (const file of useServerFiles) {
      const text = fs.readFileSync(file, "utf-8");
      const relativePath = path.relative(process.cwd(), file);
      for (const violation of findIllegalUseServerExports(text)) {
        failures.push(`${relativePath}:${violation.line}: ${violation.text}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Found ${failures.length} illegal export(s) in "use server" module(s). A "use server" file may export ` +
          `nothing but async functions and type-only exports; move the offending value into a plain module ` +
          `(see src/lib/knowledge-check-shape.ts for the pattern) and re-export only its types if needed.\n\n` +
          failures.join("\n")
      );
    }
  });
});
