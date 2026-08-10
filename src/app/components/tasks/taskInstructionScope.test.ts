// "Tests written BEFORE implementation" item 1's UI-side counterpart
// (docs/task-institution-instructions-acceptance-criteria.md AC5 item 19,
// TASKS list item "The scope-wording function: frozen literals for a named
// institution and for the no-institution case."). Frozen literals
// throughout - a wording change should show up as an obvious diff here, not
// a silent pass.
import { describe, expect, it } from "vitest";
import { columnInstructionScope, taskInstructionScopeText } from "./taskInstructionScope";

describe("taskInstructionScopeText", () => {
  it("names both the institution and the task for a named institution (frozen literal)", () => {
    expect(taskInstructionScopeText("MCC", "Syllabus uploaded")).toBe(
      'Applies to every course at MCC, not just this one - shared instructions for "Syllabus uploaded".'
    );
  });

  it("names the task and explains why when there is no institution (frozen literal, AC5 item 22)", () => {
    expect(taskInstructionScopeText(null, "Syllabus uploaded")).toBe(
      'No institution is set, so there is no shared instruction to edit for "Syllabus uploaded" here.'
    );
  });

  it("changes the named institution and the task label independently - proves neither is hardcoded", () => {
    expect(taskInstructionScopeText("MPCC", "Roster imported")).toBe(
      'Applies to every course at MPCC, not just this one - shared instructions for "Roster imported".'
    );
  });

  it("never emits a bare generic label", () => {
    const named = taskInstructionScopeText("MCC", "Roster imported");
    const none = taskInstructionScopeText(null, "Roster imported");
    expect(named).not.toBe("Instructions");
    expect(none).not.toBe("Instructions");
    expect(named).toContain("MCC");
    expect(named).toContain("Roster imported");
    expect(none).toContain("Roster imported");
  });
});

describe("columnInstructionScope", () => {
  it("none: zero institutions among the visible rows", () => {
    expect(columnInstructionScope([])).toEqual({ kind: "none" });
  });

  it("single: exactly one institution edits that one directly", () => {
    expect(columnInstructionScope(["MCC"])).toEqual({ kind: "single", institution: "MCC" });
  });

  it("multiple: several institutions lists them rather than guessing", () => {
    expect(columnInstructionScope(["MCC", "MPCC", "State U"])).toEqual({
      kind: "multiple",
      institutions: ["MCC", "MPCC", "State U"],
    });
  });

  it("preserves the caller's own order and values rather than re-sorting or re-deriving", () => {
    expect(columnInstructionScope(["Zeta", "Alpha"])).toEqual({ kind: "multiple", institutions: ["Zeta", "Alpha"] });
  });
});
