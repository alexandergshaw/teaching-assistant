// "Tests written BEFORE implementation" item 8 (docs/task-institution-
// instructions-acceptance-criteria.md): a cell renders note, instruction and
// error indicators simultaneously without one displacing another, asserted
// through the pure helper that decides the indicator set - vitest renders no
// component, so this is the only place that guarantee can actually be
// pinned.
import { describe, expect, it } from "vitest";
import { taskCellIndicatorSet } from "./taskCellIndicators";

describe("taskCellIndicatorSet", () => {
  it("shows nothing for a cell with no note, no instruction, and no error", () => {
    expect(taskCellIndicatorSet("", "", undefined)).toEqual({ note: false, instruction: false, error: false });
  });

  it("shows only the note indicator when only a note is present", () => {
    expect(taskCellIndicatorSet("call the dean", "", undefined)).toEqual({
      note: true,
      instruction: false,
      error: false,
    });
  });

  it("shows only the instruction indicator when only an instruction resolves", () => {
    expect(taskCellIndicatorSet("", "Submit via the department Sharepoint.", undefined)).toEqual({
      note: false,
      instruction: true,
      error: false,
    });
  });

  it("shows only the error indicator when only a save error is present", () => {
    expect(taskCellIndicatorSet("", "", "Network error")).toEqual({ note: false, instruction: false, error: true });
  });

  // Test 8 itself: all three at once, none displacing another.
  it("shows note, instruction, AND error simultaneously (AC4 item 16)", () => {
    expect(taskCellIndicatorSet("call the dean", "Submit via the department Sharepoint.", "Network error")).toEqual({
      note: true,
      instruction: true,
      error: true,
    });
  });

  it("treats a whitespace-only note or instruction as absent, matching TaskCell.note / resolveTaskInstruction's own blank convention", () => {
    expect(taskCellIndicatorSet("   ", "   ", undefined)).toEqual({ note: false, instruction: false, error: false });
  });

  it("treats any truthy error string as present, regardless of its text", () => {
    expect(taskCellIndicatorSet("", "", "Could not save.")).toEqual({ note: false, instruction: false, error: true });
    expect(taskCellIndicatorSet("", "", "")).toEqual({ note: false, instruction: false, error: false });
  });
});
