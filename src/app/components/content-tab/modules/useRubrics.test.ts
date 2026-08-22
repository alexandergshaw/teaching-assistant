// useRubrics.ts owns the bulk rubric-association picker's data (rubrics.ts's
// listRubrics, threaded through the listRubricsAction server action). vitest
// here is node-env and renders no component (see contentSourceGating.test.ts
// and useCartridgeToCanvas.test.ts's own headers for why) - useRubrics itself
// is a React hook and is therefore untestable directly in this suite. Every
// DECISION the hook makes about a listRubricsAction result lives in
// interpretRubricsResult instead, and this file pins that exhaustively; the
// remaining wiring (the hook takes a setNote param, calls interpretRubricsResult,
// and ModulesView threads its own setNote through) is checked as source text,
// the same idiom askAiSelection.wiring.test.ts already uses.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { interpretRubricsResult } from "./useRubrics";
import type { CanvasRubric } from "@/lib/canvas-modules";

const HOOK_PATH = join(process.cwd(), "src/app/components/content-tab/modules/useRubrics.ts");
const MODULES_VIEW_PATH = join(process.cwd(), "src/app/components/content-tab/ModulesView.tsx");

// ── interpretRubricsResult - the pure decision the hook makes (AC3/AC4) ─────

describe("interpretRubricsResult", () => {
  const courseRubric: CanvasRubric = { id: 1, title: "Essay Rubric", source: "course" };

  it("a clean load (no error) sets the rubrics and raises no note", () => {
    const outcome = interpretRubricsResult({ rubrics: [courseRubric] });
    expect(outcome.rubrics).toEqual([courseRubric]);
    expect(outcome.note).toBeNull();
  });

  it("a genuinely empty course (no error) is NOT reported as a failure - AC3's 'no rubrics' case", () => {
    const outcome = interpretRubricsResult({ rubrics: [] });
    expect(outcome.rubrics).toEqual([]);
    expect(outcome.note).toBeNull();
  });

  it("a partial failure (rubrics loaded degraded, error set) still shows what loaded AND raises a note - AC4", () => {
    const outcome = interpretRubricsResult({
      rubrics: [courseRubric],
      error: "Could not load account-level rubrics (HTTP 500).",
    });
    expect(outcome.rubrics).toEqual([courseRubric]);
    expect(outcome.note).toEqual({
      kind: "error",
      text: "Could not load account-level rubrics (HTTP 500).",
    });
  });

  it("a total failure (bare error shape, no rubrics field) clears the list and raises a note - AC3's 'could not load' case", () => {
    const outcome = interpretRubricsResult({ error: "Canvas rejected the request." });
    expect(outcome.rubrics).toEqual([]);
    expect(outcome.note).toEqual({ kind: "error", text: "Canvas rejected the request." });
  });

  it("distinguishes the two failure shapes by the note text, never fabricating a generic message", () => {
    // Proves the text is passed THROUGH, not replaced by a canned string -
    // otherwise "no rubrics" and "could not load" would be indistinguishable
    // by their note text even though this function tells them apart.
    const total = interpretRubricsResult({ error: "token expired" });
    const partial = interpretRubricsResult({ rubrics: [courseRubric], error: "account fetch timed out" });
    expect(total.note?.text).toBe("token expired");
    expect(partial.note?.text).toBe("account fetch timed out");
  });
});

// ── Wiring: the hook actually uses interpretRubricsResult + setNote (source text) ─

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("useRubrics threads a genuine fetch failure to the existing note channel (AC3)", () => {
  const hookSource = stripComments(readFileSync(HOOK_PATH, "utf8"));

  it("accepts setNote as a parameter, rather than inventing a second channel", () => {
    expect(hookSource).toMatch(/export function useRubrics\(/);
    const start = hookSource.indexOf("export function useRubrics(");
    const end = hookSource.indexOf(")", hookSource.indexOf("): UseRubricsReturn", start));
    const signature = hookSource.slice(start, end);
    expect(signature).toMatch(/setNote:/);
  });

  it("the initial load and refreshRubrics both run the result through interpretRubricsResult", () => {
    const occurrences = [...hookSource.matchAll(/interpretRubricsResult\(/g)];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("both call sites feed a note (when present) into setNote, and always set the rubric list", () => {
    const setRubricsCalls = [...hookSource.matchAll(/setRubrics\(loaded\)/g)];
    const setNoteCalls = [...hookSource.matchAll(/if \(note\) setNote\(note\)/g)];
    expect(setRubricsCalls.length).toBeGreaterThanOrEqual(2);
    expect(setNoteCalls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("ModulesView threads its own setNote into useRubrics", () => {
  const modulesViewSource = stripComments(readFileSync(MODULES_VIEW_PATH, "utf8"));

  it("calls useRubrics with courseUrl, acronym, and setNote", () => {
    const callIdx = modulesViewSource.indexOf("useRubrics(");
    expect(callIdx, "useRubrics is never called").toBeGreaterThan(-1);
    const callEnd = modulesViewSource.indexOf(");", callIdx);
    const callArgs = modulesViewSource.slice(callIdx, callEnd);
    expect(callArgs).toMatch(/\bcourseUrl\b/);
    expect(callArgs).toMatch(/\bacronym\b/);
    expect(callArgs).toMatch(/\bsetNote\b/);
  });
});
