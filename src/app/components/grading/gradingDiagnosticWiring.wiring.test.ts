import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reads source text; not a render test. Pins that GradingTab captures the
// whole-run start at the single dispatch door and records through the leaf on
// the pending-settle edge (owner-walk confirms the live capture).

function withoutLineComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const tab = withoutLineComments(readFileSync("src/app/components/GradingTab.tsx", "utf-8"));

describe("GradingTab whole-run diagnostic wiring", () => {
  it("calls markWholeRunStart inside submitWholeRun, before formAction", () => {
    const i = tab.indexOf("const submitWholeRun");
    const body = tab.slice(i, tab.indexOf("};", i));
    const start = body.indexOf("markWholeRunStart()");
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(body.indexOf("formAction(fd)"));
  });

  it("GradingTab gets markWholeRunStart from useWholeRunDiagnostic(pending, state)", () => {
    expect(tab).toContain("const markWholeRunStart = useWholeRunDiagnostic(pending, state);");
    expect(tab).not.toContain("session-diagnostic-log");
  });

  it("the hook records through recordWholeRunSettled only once pending clears, then resets the ref", () => {
    const hook = withoutLineComments(readFileSync("src/app/components/grading/useWholeRunDiagnostic.ts", "utf-8"));
    expect(hook).toMatch(/if \(pending \|\| startRef\.current === null\) return/);
    expect(hook.indexOf("recordWholeRunSettled(")).toBeGreaterThan(-1);
    expect(hook.indexOf("recordWholeRunSettled(")).toBeLessThan(hook.indexOf("startRef.current = null"));
    expect(hook).toContain("[pending, state]");
    expect(hook).toMatch(/startRef\.current = performance\.now\(\)/);
  });
});
