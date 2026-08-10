// "Tests written BEFORE implementation" item 7 (docs/task-institution-
// instructions-acceptance-criteria.md): taskCellAccessibleName's new,
// optional `hasInstruction` parameter (course-tasks-view.ts) mentions that an
// institution instruction exists WITHOUT inlining its body - frozen literal,
// per AC4 item 17. A SEPARATE file from course-tasks-view.test.ts (rather
// than an addition to it) because this wave's file list does not include
// that existing test file - only course-tasks-view.ts itself is in scope to
// modify, and the existing test file's own coverage of the 4-argument call
// form must keep passing completely untouched, which the default parameter
// value (see course-tasks-view.ts) already guarantees on its own.
import { describe, expect, it } from "vitest";
import { taskCellAccessibleName } from "./course-tasks-view";
import type { TaskCell, TaskDefinition } from "./course-tasks";

const NOW = 1_700_000_000_000;

const task: TaskDefinition = {
  id: "syllabus-uploaded",
  label: "Syllabus uploaded?",
  view: "term",
  group: "independent",
  cadence: "once",
  builtIn: true,
};

const doneCell: TaskCell = { status: "done", note: "", doneAt: NOW };

describe("taskCellAccessibleName: institution-instruction mention (AC4 item 17)", () => {
  it("omitting hasInstruction entirely behaves exactly like before this feature - frozen literal", () => {
    expect(taskCellAccessibleName("Databases", task, doneCell, NOW)).toBe("Databases, Syllabus uploaded?: Done");
  });

  it("hasInstruction=false behaves identically to omitting it - frozen literal", () => {
    expect(taskCellAccessibleName("Databases", task, doneCell, NOW, false)).toBe(
      "Databases, Syllabus uploaded?: Done"
    );
  });

  // Test 7 itself.
  it("hasInstruction=true appends a bounded mention that an instruction exists, never the body - frozen literal", () => {
    expect(taskCellAccessibleName("Databases", task, doneCell, NOW, true)).toBe(
      "Databases, Syllabus uploaded?: Done. Institution instructions available."
    );
  });

  it("the mention never contains any instruction BODY text, even though this function is never handed one - it structurally cannot leak what it was never given", () => {
    const name = taskCellAccessibleName("Databases", task, doneCell, NOW, true);
    expect(name).not.toContain("Sharepoint");
    expect(name).not.toContain("registrar");
  });

  it("combines with an existing note without a doubled terminator - frozen literal", () => {
    const noted: TaskCell = { status: "open", note: "waiting on the dean", doneAt: null };
    expect(taskCellAccessibleName("Databases", task, noted, NOW, true)).toBe(
      "Databases, Syllabus uploaded?: Not done, note: waiting on the dean. Institution instructions available."
    );
  });

  it("does not double a note's own trailing '?' - appendSentence, not a blind string append", () => {
    const noted: TaskCell = { status: "open", note: "confirmed with dept?", doneAt: null };
    expect(taskCellAccessibleName("Databases", task, noted, NOW, true)).toBe(
      "Databases, Syllabus uploaded?: Not done, note: confirmed with dept? Institution instructions available."
    );
  });

  it("SABOTAGE-CHECK anchor: with hasInstruction=true, the string always mentions instructions; with false/omitted, it never does", () => {
    expect(taskCellAccessibleName("Databases", task, doneCell, NOW, true)).toContain("Institution instructions");
    expect(taskCellAccessibleName("Databases", task, doneCell, NOW, false)).not.toContain("Institution instructions");
    expect(taskCellAccessibleName("Databases", task, doneCell, NOW)).not.toContain("Institution instructions");
  });
});
