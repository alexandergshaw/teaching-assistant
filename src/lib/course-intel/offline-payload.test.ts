import { describe, it, expect } from "vitest";

import {
  MAX_OFFLINE_ROWS_PER_TABLE,
  OFFLINE_RECORDING_TOOL,
  parseOfflinePayload,
} from "./offline-payload";

// The untrusted wire boundary for the offline path. Two properties matter
// here and both are structural rather than conventional:
//
//   1. NO STUDENT PROSE CROSSES IT. The fields that carry a student's own
//      writing are not read, and the rows this module builds carry "" in
//      them. The test for that searches the SERIALISED result for a token
//      that appears only in the prose fields, so it catches a leak through
//      any field rather than only the ones it thought to name.
//   2. `recordingTool` IS THIS APP'S OWN STATEMENT, never the request's.
//      A request that could name it could make D23a's violation check agree
//      with any declaration it liked, which is the vacuous check that
//      decision exists to prevent.

const PROSE_TOKEN = "ZORVATHPROSETOKEN";

describe("parseOfflinePayload - what it refuses to carry", () => {
  it("drops every prose field, including ones a caller posts anyway", () => {
    const parsed = parseOfflinePayload({
      gradingRows: [
        {
          course: "course-1",
          studentName: "Ada Lovelace",
          assessment: "Essay 2",
          totalScore: "18/20",
          submissionTimeStatus: "known",
          submittedAt: "2026-03-01T10:00:00.000Z",
          // Every one of these is a field the offline mapping never reads.
          submissionText: PROSE_TOKEN,
          strengths: PROSE_TOKEN,
          improvements: PROSE_TOKEN,
          overallComment: PROSE_TOKEN,
        },
      ],
      replyRows: [
        { course: "course-1", author: "Grace Hopper", threadPosition: "root", postedAt: "2026-03-02", post: PROSE_TOKEN, reply: PROSE_TOKEN },
      ],
    });

    expect(parsed.gradingRows).toHaveLength(1);
    expect(parsed.replyRows).toHaveLength(1);
    // The positive control: the token IS in the input, so a search that finds
    // nothing in the output is finding nothing because nothing carried it.
    expect(JSON.stringify({ token: PROSE_TOKEN })).toContain(PROSE_TOKEN);
    expect(JSON.stringify(parsed)).not.toContain(PROSE_TOKEN);
    expect(parsed.gradingRows[0].submissionText).toBe("");
    expect(parsed.replyRows[0].post).toBe("");
    expect(parsed.replyRows[0].reply).toBe("");
  });

  it("keeps exactly the six grading fields and four reply fields the mapping reads", () => {
    const parsed = parseOfflinePayload({
      gradingRows: [
        {
          course: "course-1",
          studentName: "Ada Lovelace",
          assessment: "Essay 2",
          totalScore: "18/20",
          submissionTimeStatus: "marked-late",
          submittedAt: "2026-03-01T10:00:00.000Z",
        },
      ],
      replyRows: [{ course: "course-1", author: "Grace Hopper", threadPosition: "reply", postedAt: "2026-03-02T09:00:00.000Z" }],
    });

    const row = parsed.gradingRows[0];
    expect(row.course).toBe("course-1");
    expect(row.studentName).toBe("Ada Lovelace");
    expect(row.assessment).toBe("Essay 2");
    expect(row.totalScore).toBe("18/20");
    expect(row.submissionTimeStatus).toBe("marked-late");
    expect(row.submittedAt).toBe("2026-03-01T10:00:00.000Z");

    const reply = parsed.replyRows[0];
    expect(reply.course).toBe("course-1");
    expect(reply.author).toBe("Grace Hopper");
    expect(reply.threadPosition).toBe("reply");
    expect(reply.postedAt).toBe("2026-03-02T09:00:00.000Z");
  });

  it("refuses an unrecognised submission-time status rather than guessing one", () => {
    // D23c keeps lateness three-valued. A status this module cannot read must
    // become "unknown" (by absence), never a definite-looking "known".
    const parsed = parseOfflinePayload({
      gradingRows: [{ course: "c", studentName: "A", submissionTimeStatus: "on-time" }],
    });
    expect(parsed.gradingRows[0].submissionTimeStatus).toBeUndefined();
  });

  it("refuses an unrecognised thread position rather than guessing one", () => {
    const parsed = parseOfflinePayload({ replyRows: [{ course: "c", author: "A", threadPosition: "top-level" }] });
    expect(parsed.replyRows[0].threadPosition).toBeUndefined();
  });
});

describe("parseOfflinePayload - recordingTool is the app's own statement", () => {
  it("is the constant, whatever the request says", () => {
    expect(parseOfflinePayload({}).recordingTool).toBe(OFFLINE_RECORDING_TOOL);
    expect(parseOfflinePayload({ recordingTool: "Canvas SpeedGrader" }).recordingTool).toBe(OFFLINE_RECORDING_TOOL);
    expect(parseOfflinePayload(null).recordingTool).toBe(OFFLINE_RECORDING_TOOL);
  });

  it("is never blank - a blank tool would make every declared assessment read violated", () => {
    expect(OFFLINE_RECORDING_TOOL.trim().length).toBeGreaterThan(0);
  });
});

describe("parseOfflinePayload - declarations", () => {
  it("drops a record with no usable key, and one whose work kind is not in the closed set", () => {
    const parsed = parseOfflinePayload({
      assessmentDeclarations: [
        { courseId: "c", assessmentId: "Essay 2", assessmentLabel: "Essay 2", workKind: "assignment", deadline: "2026-03-01" },
        { courseId: "c", assessmentId: "", workKind: "assignment", deadline: "2026-03-01" },
        { courseId: "", assessmentId: "Essay 3", workKind: "assignment", deadline: "2026-03-01" },
        // D23a: never guess a work kind - drop the record instead.
        { courseId: "c", assessmentId: "Essay 4", workKind: "Assignments", deadline: "2026-03-01" },
      ],
      toolDeclarations: [
        { courseId: "c", workKind: "discussion", tool: "Screen recording (this app)" },
        { courseId: "c", workKind: "quiz", tool: "Something" },
      ],
    });
    expect(parsed.assessmentDeclarations.map((a) => a.assessmentId)).toEqual(["Essay 2"]);
    expect(parsed.toolDeclarations.map((t) => t.workKind)).toEqual(["discussion"]);
  });
});

describe("parseOfflinePayload - intake counts what was dropped", () => {
  it("distinguishes an absent payload from an empty one", () => {
    expect(parseOfflinePayload(undefined).intake.payloadPresent).toBe(false);
    expect(parseOfflinePayload({}).intake.payloadPresent).toBe(true);
  });

  it("counts rows over the cap rather than silently ignoring them", () => {
    const rows = Array.from({ length: MAX_OFFLINE_ROWS_PER_TABLE + 7 }, (_, i) => ({
      course: "c",
      studentName: `Student ${i}`,
      assessment: "Essay 2",
      totalScore: "10/10",
    }));
    const parsed = parseOfflinePayload({ gradingRows: rows });
    expect(parsed.gradingRows).toHaveLength(MAX_OFFLINE_ROWS_PER_TABLE);
    expect(parsed.intake.gradingRowsReceived).toBe(MAX_OFFLINE_ROWS_PER_TABLE + 7);
    expect(parsed.intake.gradingRowsOverCap).toBe(7);
  });

  it("counts a row that could not be read rather than dropping it in silence", () => {
    const parsed = parseOfflinePayload({
      gradingRows: [{ course: "c", studentName: "A" }, null, { studentName: "", course: "" }, "not an object"],
      replyRows: [{ course: "c", author: "A" }, 17],
    });
    expect(parsed.gradingRows).toHaveLength(1);
    expect(parsed.intake.gradingRowsUnreadable).toBe(3);
    expect(parsed.replyRows).toHaveLength(1);
    expect(parsed.intake.replyRowsUnreadable).toBe(1);
  });

  it("never throws on hostile input", () => {
    for (const raw of [null, undefined, 0, "", [], { gradingRows: "nope" }, { replyRows: {} }]) {
      expect(() => parseOfflinePayload(raw)).not.toThrow();
    }
  });
});
