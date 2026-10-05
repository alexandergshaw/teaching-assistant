// Reachability pin for the One-Off Tasks tab: the hook is actually called and
// the CRUD / registry / grouping / non-happy-state symbols are referenced
// somewhere in the component directory. Source-text only: it proves a symbol is
// present and wired, never that a control is bound to the right handler.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "src", "app", "components", "one-off-tasks");

// The hook file itself is excluded: it defines useOneOffTasks( and the CRUD /
// loading / error names, so scanning it would satisfy every pin on its own.
function dirSource(): string {
  return fs
    .readdirSync(DIR)
    .filter((n) => /\.tsx?$/.test(n) && !n.includes(".test.") && n !== "useOneOffTasks.ts")
    .map((n) => fs.readFileSync(path.join(DIR, n), "utf8"))
    .join("\n");
}

const HOOK_CALL = /useOneOffTasks\s*\(/;
const REGISTRY = /\buseInstitutions\b|\buseInstitutionSelection\b/;
const GROUPING = /\bgroupTasksByCollege\b/;
const CRUD = ["add", "toggleDone", "remove"];

function hasToken(source: string, token: string): boolean {
  return new RegExp(`\\b${token}\\b`).test(source);
}

describe("OneOffTasksTab wiring", () => {
  const source = dirSource();

  it("scans a non-empty source and every matcher fires on a fixture (dead-scan canary)", () => {
    expect(source.length).toBeGreaterThan(0);
    expect(HOOK_CALL.test("const x = useOneOffTasks();")).toBe(true);
    expect(REGISTRY.test("const l = useInstitutions();")).toBe(true);
    expect(GROUPING.test("groupTasksByCollege(t, i)")).toBe(true);
    expect(hasToken("const { add } = h;", "add")).toBe(true);
    expect(hasToken("padding", "add")).toBe(false);
  });

  it("calls the hook (not merely imports it)", () => {
    expect(HOOK_CALL.test(source)).toBe(true);
  });

  it("references each CRUD binding", () => {
    for (const token of CRUD) {
      expect({ token, present: hasToken(source, token) }).toEqual({ token, present: true });
    }
  });

  it("reuses the institution registry rather than a parallel college list", () => {
    expect(REGISTRY.test(source)).toBe(true);
  });

  it("calls the per-college grouping", () => {
    expect(GROUPING.test(source)).toBe(true);
  });

  it("handles both the loading and error states", () => {
    expect(hasToken(source, "loading")).toBe(true);
    expect(hasToken(source, "error")).toBe(true);
  });
});
