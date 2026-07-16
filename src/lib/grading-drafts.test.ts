import { describe, it, expect } from "vitest";
import { mapDraft, coerceGradingDraftPayload } from "./grading-drafts";
import type { Database } from "./supabase/types";

type DraftRow = Database["public"]["Tables"]["grading_drafts"]["Row"];

function makeRow(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    id: "d1",
    user_id: "u1",
    status: "pending",
    summary: "1 assignment(s), 2 submission(s) graded - review to post",
    payload: { runs: [] } as unknown as DraftRow["payload"],
    created_at: "2026-07-13T00:00:00.000Z",
    updated_at: "2026-07-13T00:00:00.000Z",
    workflow_id: null,
    workflow_name: null,
    ...overrides,
  };
}

const validRunEntry = {
  courseName: "Course A",
  assignmentName: "Essay 1",
  canvasUrl: "https://canvas.example.com/courses/1/assignments/2",
  institution: "UT",
  assignmentId: "2",
  pointsPossible: 20,
  run: {
    results: [
      {
        student: "Jane Doe",
        overallComment: "Nice work.",
        rubricAreas: [{ area: "Clarity", score: "8/10", comment: "" }],
        totalScore: "8/10",
        feedback: "Total Score: 8/10",
        mergedFileCount: 1,
        submittedFiles: [],
        userId: 42,
      },
    ],
    rubricAreaNames: ["Clarity"],
    fullCreditChecklist: [],
    speedGraderUrl: "https://canvas.example.com/courses/1/gradebook/speed_grader?assignment_id=2",
  },
};

describe("mapDraft", () => {
  it("maps every scalar column", () => {
    const row = makeRow();
    const draft = mapDraft(row);
    expect(draft).toMatchObject({
      id: "d1",
      userId: "u1",
      status: "pending",
      summary: row.summary,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  it("coerces an unrecognized status to pending", () => {
    const row = makeRow({ status: "something-else" });
    expect(mapDraft(row).status).toBe("pending");
  });

  it("passes through a reviewed status", () => {
    const row = makeRow({ status: "reviewed" });
    expect(mapDraft(row).status).toBe("reviewed");
  });

  it("round-trips a well-formed payload's runs", () => {
    const row = makeRow({ payload: { runs: [validRunEntry] } as unknown as DraftRow["payload"] });
    const draft = mapDraft(row);
    expect(draft.payload.runs).toHaveLength(1);
    expect(draft.payload.runs[0].courseName).toBe("Course A");
    expect(draft.payload.runs[0].run.results[0].student).toBe("Jane Doe");
    expect(draft.payload.runs[0].run.results[0].userId).toBe(42);
  });
});

describe("coerceGradingDraftPayload", () => {
  it("returns an empty runs array for null/undefined/non-object input", () => {
    expect(coerceGradingDraftPayload(null)).toEqual({ runs: [] });
    expect(coerceGradingDraftPayload(undefined)).toEqual({ runs: [] });
    expect(coerceGradingDraftPayload("not an object")).toEqual({ runs: [] });
  });

  it("returns an empty runs array when runs is missing or not an array", () => {
    expect(coerceGradingDraftPayload({})).toEqual({ runs: [] });
    expect(coerceGradingDraftPayload({ runs: "nope" })).toEqual({ runs: [] });
  });

  it("drops a malformed run entry (missing required fields) without throwing", () => {
    const payload = coerceGradingDraftPayload({
      runs: [{ courseName: "Course A" /* missing assignmentName and run */ }, validRunEntry],
    });
    expect(payload.runs).toHaveLength(1);
    expect(payload.runs[0].courseName).toBe("Course A");
  });

  it("drops a malformed grade result within an otherwise-valid run", () => {
    const withBadResult = {
      ...validRunEntry,
      run: {
        ...validRunEntry.run,
        results: [{ notStudent: true }, validRunEntry.run.results[0]],
      },
    };
    const payload = coerceGradingDraftPayload({ runs: [withBadResult] });
    expect(payload.runs[0].run.results).toHaveLength(1);
    expect(payload.runs[0].run.results[0].student).toBe("Jane Doe");
  });

  it("never resurrects a rawBase64 value even if present in the raw jsonb", () => {
    const withBase64 = {
      ...validRunEntry,
      run: {
        ...validRunEntry.run,
        results: [
          {
            ...validRunEntry.run.results[0],
            submittedFiles: [
              {
                name: "essay.docx",
                extension: "docx",
                previewContent: "preview",
                previewTruncated: false,
                rawBase64: "SHOULD-NEVER-COME-BACK",
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              },
            ],
          },
        ],
      },
    };
    const payload = coerceGradingDraftPayload({ runs: [withBase64] });
    const file = payload.runs[0].run.results[0].submittedFiles[0];
    expect(file.rawBase64).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("SHOULD-NEVER-COME-BACK");
  });

  it("defaults pointsPossible to undefined when absent, keeps null when explicitly null", () => {
    const { pointsPossible: _omit, ...withoutPoints } = validRunEntry;
    void _omit;
    const withNull = { ...validRunEntry, pointsPossible: null };

    const payload = coerceGradingDraftPayload({ runs: [withoutPoints, withNull] });
    expect(payload.runs[0].pointsPossible).toBeUndefined();
    expect(payload.runs[1].pointsPossible).toBeNull();
  });

  it("coerces the offline flag to a boolean", () => {
    const payload = coerceGradingDraftPayload({ runs: [{ ...validRunEntry, offline: "yes" }] });
    expect(payload.runs[0].offline).toBe(true);
  });
});
