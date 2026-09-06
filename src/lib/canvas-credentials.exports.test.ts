import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * SEC5 / E-ARCH3 - a TypeScript type cannot express "these two fields
 * (baseUrl, token) were resolved together, in the same branch, by the same
 * call". Nothing stops a caller from importing a getBaseUrl and a getToken
 * and combining results that came from two different resolutions. What DOES
 * stop it: this module exports nothing that could hand out either field
 * alone. src/lib/canvas-credentials.ts is meant to export EXACTLY
 * `resolveCanvasCredential` (the only accessor), the CanvasCredential type it
 * returns, and one deliberate exception - CANVAS_CREDENTIAL_REQUIRED_MESSAGE
 * (E-UX8), a message string exported BY IDENTITY so callers can catch it the
 * way src/lib/supabase/auth.ts's OWNER_ONLY_MESSAGE is caught in
 * src/app/account/people/page.tsx. A message string carries no baseUrl/token
 * data and cannot be recombined into a mismatched credential, so it does not
 * weaken the invariant this ratchet exists to enforce - anything else
 * (getBaseUrl, getToken, hasCredential, or any other value export) would.
 *
 * This mirrors the idiom already shipped in
 * src/app/actions/action-guard-coverage.test.ts and
 * src/lib/use-server-exports.test.ts: read the module's own SOURCE TEXT and
 * assert its export surface, rather than trusting a doc comment that nothing
 * enforces. A canary describes both a positive and a negative fixture before
 * the real scan is trusted, per this repo's own emoji-scan lesson
 * (AGENTS.md) - a detector that silently matches nothing still "passes".
 */

const MODULE_PATH = path.join(process.cwd(), "src", "lib", "canvas-credentials.ts");

/** The only value-export names this module may ever carry. Anything else - in particular getBaseUrl, getToken, hasCredential, named explicitly because they are the exact shape of accessor that would let a caller pull baseUrl and token from two different resolutions - fails the ratchet below. */
const ALLOWED_VALUE_EXPORTS = new Set(["resolveCanvasCredential", "CANVAS_CREDENTIAL_REQUIRED_MESSAGE"]);

/** Names that must never appear as an export, stated explicitly (not merely implied by ALLOWED_VALUE_EXPORTS being a closed set) because these are the exact accessors SEC5's finding names. */
const FORBIDDEN_ACCESSOR_NAMES = ["getBaseUrl", "getToken", "hasCredential"];

interface TopLevelExport {
  line: number;
  text: string;
  /** Non-null only for a recognized, well-formed export form; null means "some other export form the ratchet does not know how to name safely" - which still fails the assertions below, by construction, since null is never in ALLOWED_VALUE_EXPORTS. */
  name: string | null;
  isTypeOnly: boolean;
}

/**
 * Scan `text` for every top-level line starting with `export` and classify
 * it as type-only (export type / export interface - erased at compile time,
 * so it can never leak a baseUrl or a token at runtime) or a value export
 * (anything else), extracting a name where the form makes that unambiguous.
 * Operates purely on in-memory text - never touches disk itself - so the
 * canary fixtures below can drive it directly.
 */
function collectTopLevelExports(text: string): TopLevelExport[] {
  const found: TopLevelExport[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (!/^export\b/.test(trimmed)) return;

    const typeMatch = /^export\s+(?:type|interface)\s+(\w+)/.exec(trimmed);
    if (typeMatch) {
      found.push({ line: index + 1, text: trimmed, name: typeMatch[1], isTypeOnly: true });
      return;
    }

    const asyncFnMatch = /^export\s+async\s+function\s+(\w+)/.exec(trimmed);
    if (asyncFnMatch) {
      found.push({ line: index + 1, text: trimmed, name: asyncFnMatch[1], isTypeOnly: false });
      return;
    }

    const constMatch = /^export\s+const\s+(\w+)/.exec(trimmed);
    if (constMatch) {
      found.push({ line: index + 1, text: trimmed, name: constMatch[1], isTypeOnly: false });
      return;
    }

    // A sync `export function`, `export class`, a bare `export { x }` block,
    // `export * from ...`, or anything else this scanner does not recognize
    // as one of the three safe forms above. Named `null` deliberately: the
    // assertions below treat an unnamed export as an automatic failure
    // rather than silently skipping it.
    found.push({ line: index + 1, text: trimmed, name: null, isTypeOnly: false });
  });

  return found;
}

describe("export-surface detector (canary: proves the detector actually detects)", () => {
  it("classifies export interface / export type as type-only", () => {
    const fixture = [
      "export interface CanvasCredential {",
      "  baseUrl: string;",
      "}",
      "",
      "export type Alias = string;",
      "",
    ].join("\n");
    const exports = collectTopLevelExports(fixture);
    expect(exports).toHaveLength(2);
    expect(exports.every((e) => e.isTypeOnly)).toBe(true);
    expect(exports.map((e) => e.name)).toEqual(["CanvasCredential", "Alias"]);
  });

  it("classifies export async function and export const as value exports", () => {
    const fixture = [
      "export async function resolveCanvasCredential() {",
      "  return null;",
      "}",
      "",
      'export const SOME_MESSAGE = "hello";',
      "",
    ].join("\n");
    const exports = collectTopLevelExports(fixture);
    expect(exports).toHaveLength(2);
    expect(exports.every((e) => !e.isTypeOnly)).toBe(true);
    expect(exports.map((e) => e.name)).toEqual(["resolveCanvasCredential", "SOME_MESSAGE"]);
  });

  it("flags a disallowed accessor export (the exact SEC5 hazard) as a named value export", () => {
    const fixture = ["export async function getBaseUrl() {", "  return '';", "}", ""].join("\n");
    const exports = collectTopLevelExports(fixture);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toMatchObject({ name: "getBaseUrl", isTypeOnly: false });
  });

  it("flags an unnamed export form (sync function) with name: null rather than skipping it silently", () => {
    const fixture = ["export function syncHelper() {", "  return 1;", "}", ""].join("\n");
    const exports = collectTopLevelExports(fixture);
    expect(exports).toHaveLength(1);
    expect(exports[0].name).toBeNull();
  });
});

describe("canvas-credentials.ts export ratchet (SEC5 / E-ARCH3)", () => {
  const sourceText = fs.readFileSync(MODULE_PATH, "utf-8");
  const exports = collectTopLevelExports(sourceText);

  it("finds this module on disk and actually has export statements to check", () => {
    // A ratchet over zero exports would pass vacuously. Guard against a path
    // typo or an empty file silently making every assertion below trivially
    // true.
    expect(exports.length).toBeGreaterThan(0);
  });

  it("exports resolveCanvasCredential as an async function - the one accessor", () => {
    const resolver = exports.find((e) => e.name === "resolveCanvasCredential");
    expect(resolver, "resolveCanvasCredential must be exported").toBeDefined();
    expect(resolver!.isTypeOnly).toBe(false);
    expect(resolver!.text).toMatch(/^export\s+async\s+function\s+resolveCanvasCredential\b/);
  });

  it("exports CANVAS_CREDENTIAL_REQUIRED_MESSAGE - the E-UX8 identity-checked constant", () => {
    const message = exports.find((e) => e.name === "CANVAS_CREDENTIAL_REQUIRED_MESSAGE");
    expect(message, "CANVAS_CREDENTIAL_REQUIRED_MESSAGE must be exported").toBeDefined();
    expect(message!.isTypeOnly).toBe(false);
  });

  it("exports no value other than the two named above - the ratchet itself", () => {
    const valueExports = exports.filter((e) => !e.isTypeOnly);
    const unexpected = valueExports.filter((e) => e.name === null || !ALLOWED_VALUE_EXPORTS.has(e.name));

    expect(
      unexpected.map((e) => `line ${e.line}: ${e.text}`),
      "canvas-credentials.ts may export EXACTLY resolveCanvasCredential and " +
        "CANVAS_CREDENTIAL_REQUIRED_MESSAGE as values (plus any number of " +
        "type-only exports). A new value export here means a caller could " +
        "obtain a baseUrl and a token from two different resolutions and " +
        "combine them - the exact defect SEC5 exists to make impossible. " +
        "If the fetch layer needs something new from this module, extend " +
        "the CanvasCredential object resolveCanvasCredential already " +
        "returns, or extend CanvasCredential's fields, rather than adding " +
        "a second accessor."
    ).toEqual([]);
  });

  it("names none of the specific accessors SEC5's finding called out", () => {
    const exportedNames = new Set(exports.map((e) => e.name).filter((n): n is string => n !== null));
    for (const forbidden of FORBIDDEN_ACCESSOR_NAMES) {
      expect(exportedNames.has(forbidden), `${forbidden} must not be exported from canvas-credentials.ts`).toBe(
        false
      );
    }
  });

  it("every type-only export uses a form that is actually erased at runtime", () => {
    // Belt-and-braces: re-assert the classifier's own claim against the real
    // file, so a future edit that turns CanvasCredential into a class (still
    // matching a hand-rolled "type" regex, hypothetically) cannot silently
    // start leaking a value at runtime while this ratchet keeps reporting
    // green.
    const typeOnly = exports.filter((e) => e.isTypeOnly);
    for (const entry of typeOnly) {
      expect(entry.text).toMatch(/^export\s+(type|interface)\s+/);
    }
  });
});
