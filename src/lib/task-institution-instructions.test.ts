// TDD contract for the per-(institution, task) instruction resolver
// (docs/task-institution-instructions-acceptance-criteria.md, "Tests
// written BEFORE implementation" 1-4, 9). Frozen literal tables throughout -
// no computed expectations - so a change to the normalization or resolution
// behavior shows up as an obvious diff here, not a silent pass.
import { describe, expect, it } from "vitest";
import {
  taskInstructionKey,
  taskInstructionMapKey,
  buildTaskInstructionMap,
  resolveTaskInstruction,
  TASK_INSTRUCTION_MAX_LENGTH,
  type TaskInstruction,
} from "./task-institution-instructions";

describe("taskInstructionKey", () => {
  // Test 1: trims, uppercases, maps null/undefined/blank/whitespace to "".
  it("trims and uppercases a normal value", () => {
    expect(taskInstructionKey("mcc")).toBe("MCC");
    expect(taskInstructionKey("Mcc")).toBe("MCC");
    expect(taskInstructionKey("MCC")).toBe("MCC");
    expect(taskInstructionKey("  mcc  ")).toBe("MCC");
    expect(taskInstructionKey("Middlesex Community College")).toBe("MIDDLESEX COMMUNITY COLLEGE");
  });

  it("maps null, undefined, empty string, and whitespace-only to \"\"", () => {
    expect(taskInstructionKey(null)).toBe("");
    expect(taskInstructionKey(undefined)).toBe("");
    expect(taskInstructionKey("")).toBe("");
    expect(taskInstructionKey("   ")).toBe("");
    expect(taskInstructionKey("\t\n")).toBe("");
  });
});

describe("taskInstructionMapKey", () => {
  it("joins the normalized institution and the raw task id with a space", () => {
    expect(taskInstructionMapKey("mcc", "syllabus-uploaded")).toBe("MCC syllabus-uploaded");
    expect(taskInstructionMapKey("MCC", "syllabus-uploaded")).toBe("MCC syllabus-uploaded");
    expect(taskInstructionMapKey("  Mcc  ", "syllabus-uploaded")).toBe("MCC syllabus-uploaded");
  });

  it("produces \"\" prefixed keys for a blank institution, never colliding with a real one", () => {
    expect(taskInstructionMapKey(null, "syllabus-uploaded")).toBe(" syllabus-uploaded");
    expect(taskInstructionMapKey("MCC", "syllabus-uploaded")).not.toBe(
      taskInstructionMapKey(null, "syllabus-uploaded")
    );
  });
});

describe("buildTaskInstructionMap / resolveTaskInstruction: the casing join (AC2 item 6)", () => {
  // Test 2: THE ANTI-DEFECT TEST. A course stored "mcc" (course_hub.institution
  // is only trimmed, never uppercased - src/lib/supabase/courses.ts:400-403)
  // must resolve an instruction stored "MCC" (this feature's write path
  // normalizes via taskInstructionKey before storing). This is the exact
  // scenario AC2 item 6 says would otherwise silently show nothing.
  it("resolves an instruction stored under \"MCC\" for a course whose institution is \"mcc\"", () => {
    const rows: TaskInstruction[] = [
      { institution: "MCC", taskId: "syllabus-uploaded", body: "Submit via the department Sharepoint." },
    ];
    const map = buildTaskInstructionMap(rows);

    expect(resolveTaskInstruction(map, "mcc", "syllabus-uploaded")).toBe(
      "Submit via the department Sharepoint."
    );
  });

  it("resolves regardless of which side is upper/lower/mixed case", () => {
    const rows: TaskInstruction[] = [{ institution: "mcc", taskId: "roster-imported", body: "CC the registrar." }];
    const map = buildTaskInstructionMap(rows);

    expect(resolveTaskInstruction(map, "MCC", "roster-imported")).toBe("CC the registrar.");
    expect(resolveTaskInstruction(map, "Mcc", "roster-imported")).toBe("CC the registrar.");
    expect(resolveTaskInstruction(map, "  mcc  ", "roster-imported")).toBe("CC the registrar.");
  });
});

describe("resolveTaskInstruction: hit, miss, blank body, whitespace-only body, null institution", () => {
  // Test 3.
  const rows: TaskInstruction[] = [
    { institution: "MCC", taskId: "syllabus-uploaded", body: "Submit via the department Sharepoint." },
    { institution: "MPCC", taskId: "syllabus-uploaded", body: "Email the coordinator directly." },
    { institution: "BLANKBODY", taskId: "syllabus-uploaded", body: "" },
    { institution: "WHITESPACEBODY", taskId: "syllabus-uploaded", body: "   \t  " },
  ];
  const map = buildTaskInstructionMap(rows);

  it("hit: returns the stored body for a matching institution and task", () => {
    expect(resolveTaskInstruction(map, "MCC", "syllabus-uploaded")).toBe(
      "Submit via the department Sharepoint."
    );
    expect(resolveTaskInstruction(map, "MPCC", "syllabus-uploaded")).toBe("Email the coordinator directly.");
  });

  it("miss: returns \"\" for a task id with no recorded instruction", () => {
    expect(resolveTaskInstruction(map, "MCC", "some-other-task")).toBe("");
  });

  it("miss: returns \"\" for an institution with no recorded instruction", () => {
    expect(resolveTaskInstruction(map, "SOME OTHER SCHOOL", "syllabus-uploaded")).toBe("");
  });

  it("blank body: never indexed, so lookup misses entirely", () => {
    expect(resolveTaskInstruction(map, "BLANKBODY", "syllabus-uploaded")).toBe("");
  });

  it("whitespace-only body: never indexed, so lookup misses entirely (AC3 item 13)", () => {
    expect(resolveTaskInstruction(map, "WHITESPACEBODY", "syllabus-uploaded")).toBe("");
  });

  it("null institution: always \"\", regardless of what the map contains (A4)", () => {
    expect(resolveTaskInstruction(map, null, "syllabus-uploaded")).toBe("");
    expect(resolveTaskInstruction(map, undefined, "syllabus-uploaded")).toBe("");
    expect(resolveTaskInstruction(map, "", "syllabus-uploaded")).toBe("");
    expect(resolveTaskInstruction(map, "   ", "syllabus-uploaded")).toBe("");
  });
});

describe("buildTaskInstructionMap: blank institution never produces a lookup entry (AC2 item 8, test 4)", () => {
  it("drops a row whose institution normalizes to \"\"", () => {
    const rows: TaskInstruction[] = [
      { institution: "", taskId: "syllabus-uploaded", body: "This should never be reachable." },
      { institution: "   ", taskId: "roster-imported", body: "Neither should this." },
    ];
    const map = buildTaskInstructionMap(rows);

    expect(Object.keys(map)).toHaveLength(0);
    expect(resolveTaskInstruction(map, "", "syllabus-uploaded")).toBe("");
    expect(resolveTaskInstruction(map, null, "roster-imported")).toBe("");
  });

  it("keeps a row with a real institution alongside a dropped blank-institution row", () => {
    const rows: TaskInstruction[] = [
      { institution: "", taskId: "syllabus-uploaded", body: "Dropped." },
      { institution: "MCC", taskId: "syllabus-uploaded", body: "Kept." },
    ];
    const map = buildTaskInstructionMap(rows);

    expect(Object.keys(map)).toHaveLength(1);
    expect(resolveTaskInstruction(map, "MCC", "syllabus-uploaded")).toBe("Kept.");
  });
});

describe("A3: one store, keyed on task_id, serves both Term and Recurring sub-views (test 9)", () => {
  it("resolves independently for a Term-catalog task id and a Recurring-catalog task id from the same map", () => {
    const rows: TaskInstruction[] = [
      { institution: "MCC", taskId: "syllabus-uploaded", body: "Term-view instruction." },
      { institution: "MCC", taskId: "attendance-daily", body: "Recurring-view instruction." },
    ];
    const map = buildTaskInstructionMap(rows);

    expect(resolveTaskInstruction(map, "MCC", "syllabus-uploaded")).toBe("Term-view instruction.");
    expect(resolveTaskInstruction(map, "MCC", "attendance-daily")).toBe("Recurring-view instruction.");
  });
});

describe("TASK_INSTRUCTION_MAX_LENGTH", () => {
  it("is a positive number larger than the per-cell note cap of 200", () => {
    expect(TASK_INSTRUCTION_MAX_LENGTH).toBe(1000);
    expect(TASK_INSTRUCTION_MAX_LENGTH).toBeGreaterThan(200);
  });
});
