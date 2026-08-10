// TDD contract for useCourseTasksData.ts's optimistic instruction-map update
// (docs/task-institution-instructions-acceptance-criteria.md AC5 items 24,
// 25; TASKS list items "Blank/whitespace-only clears and drops the key from
// the local map" and "The cap is applied on input" - this pins the write-
// side counterpart of that cap).
import { describe, expect, it } from "vitest";
import { taskInstructionMapKey, TASK_INSTRUCTION_MAX_LENGTH } from "@/lib/task-institution-instructions";
import { applyInstructionEdit } from "./taskInstructionEdit";

describe("applyInstructionEdit", () => {
  it("sets a trimmed body under the normalized (institution, task) key", () => {
    const next = applyInstructionEdit({}, "mcc", "syllabus-uploaded", "  Submit via Sharepoint.  ");
    expect(next).toEqual({ [taskInstructionMapKey("mcc", "syllabus-uploaded")]: "Submit via Sharepoint." });
  });

  it("blank body deletes the key rather than storing an empty string (AC5 item 25)", () => {
    const key = taskInstructionMapKey("MCC", "syllabus-uploaded");
    const map = { [key]: "Existing text.", other: "kept" };
    const next = applyInstructionEdit(map, "MCC", "syllabus-uploaded", "");
    expect(next).not.toHaveProperty(key);
    expect(next.other).toBe("kept");
  });

  it("whitespace-only body deletes the key too", () => {
    const key = taskInstructionMapKey("MCC", "syllabus-uploaded");
    const map = { [key]: "Existing text." };
    const next = applyInstructionEdit(map, "MCC", "syllabus-uploaded", "   \t  ");
    expect(next).not.toHaveProperty(key);
  });

  it("leaves every other key untouched", () => {
    const other = taskInstructionMapKey("MPCC", "roster-imported");
    const map = { [other]: "Unrelated." };
    const next = applyInstructionEdit(map, "MCC", "syllabus-uploaded", "New text.");
    expect(next[other]).toBe("Unrelated.");
    expect(next[taskInstructionMapKey("MCC", "syllabus-uploaded")]).toBe("New text.");
  });

  it("caps at TASK_INSTRUCTION_MAX_LENGTH (AC5 item 24, defense in depth alongside the server-side cap)", () => {
    const long = "x".repeat(TASK_INSTRUCTION_MAX_LENGTH + 50);
    const next = applyInstructionEdit({}, "MCC", "syllabus-uploaded", long);
    expect(next[taskInstructionMapKey("MCC", "syllabus-uploaded")]).toHaveLength(TASK_INSTRUCTION_MAX_LENGTH);
  });

  it("never mutates the input map", () => {
    const map = {};
    applyInstructionEdit(map, "MCC", "syllabus-uploaded", "text");
    expect(map).toEqual({});
  });

  it("a subsequent blank edit removes a key a prior edit just added", () => {
    let map = applyInstructionEdit({}, "MCC", "syllabus-uploaded", "First.");
    expect(map[taskInstructionMapKey("MCC", "syllabus-uploaded")]).toBe("First.");
    map = applyInstructionEdit(map, "MCC", "syllabus-uploaded", "");
    expect(map).toEqual({});
  });
});
