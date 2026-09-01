import { describe, it, expect } from "vitest";
import { mapDraft, coerceGradingDraftPayload, createGradingDraft } from "./grading-drafts";
import { GRADE_DETERMINATIONS } from "./grade/types";
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
    source: null,
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

  it("rounds-trips source when set to repos, lms, or cartridge", () => {
    const row = makeRow({ source: "repos" });
    expect(mapDraft(row).source).toBe("repos");
    expect(mapDraft(makeRow({ source: "lms" })).source).toBe("lms");
    expect(mapDraft(makeRow({ source: "cartridge" })).source).toBe("cartridge");
  });

  it("maps null source to undefined", () => {
    const row = makeRow({ source: null });
    expect(mapDraft(row).source).toBeUndefined();
  });

  it("drops an invalid source value and maps to undefined", () => {
    const row = makeRow({ source: "invalid" });
    expect(mapDraft(row).source).toBeUndefined();
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

  // AC2.4: a draft must round-trip which repo/ref a GitHub-URL submission was
  // graded against, so the grade can still be defended after this run's
  // process exits and the draft is reloaded from Supabase jsonb.
  it("round-trips gradedRepo/gradedRef when present in the raw jsonb", () => {
    const withRepo = {
      ...validRunEntry,
      run: {
        ...validRunEntry.run,
        results: [{ ...validRunEntry.run.results[0], gradedRepo: "student/hw1", gradedRef: "abc123def456" }],
      },
    };
    const payload = coerceGradingDraftPayload({ runs: [withRepo] });
    expect(payload.runs[0].run.results[0].gradedRepo).toBe("student/hw1");
    expect(payload.runs[0].run.results[0].gradedRef).toBe("abc123def456");
  });

  it("defaults gradedRepo/gradedRef to null when absent", () => {
    const payload = coerceGradingDraftPayload({ runs: [validRunEntry] });
    expect(payload.runs[0].run.results[0].gradedRepo).toBeNull();
    expect(payload.runs[0].run.results[0].gradedRef).toBeNull();
  });

  // docs/no-submission-and-requirement-checking-acceptance-criteria.md G1c:
  // the same allowlist that already dropped submissionTruncated once must
  // not do the same to determination.
  it("round-trips determination when present in the raw jsonb", () => {
    const withDetermination = {
      ...validRunEntry,
      run: {
        ...validRunEntry.run,
        results: [{ ...validRunEntry.run.results[0], determination: "no-submission" }],
      },
    };
    const payload = coerceGradingDraftPayload({ runs: [withDetermination] });
    expect(payload.runs[0].run.results[0].determination).toBe("no-submission");
  });

  it("defaults determination to undefined when absent (a draft predating this feature)", () => {
    const payload = coerceGradingDraftPayload({ runs: [validRunEntry] });
    expect(payload.runs[0].run.results[0].determination).toBeUndefined();
  });

  it("defaults determination to undefined for a wrong/unknown value rather than throwing or keeping it", () => {
    const withBadDetermination = {
      ...validRunEntry,
      run: {
        ...validRunEntry.run,
        results: [{ ...validRunEntry.run.results[0], determination: "something-else" }],
      },
    };
    const payload = coerceGradingDraftPayload({ runs: [withBadDetermination] });
    expect(payload.runs[0].run.results[0].determination).toBeUndefined();
  });

  // docs/no-submission-and-requirement-checking-acceptance-criteria.md G3:
  // GradeDetermination was widened to add "no-submission-unmerged-branch"
  // alongside "no-submission". Driven off GRADE_DETERMINATIONS (grade/types.ts)
  // itself, not a hand-typed literal list here, so a future third member is
  // automatically exercised by this same test without an edit to this file -
  // if GRADE_DETERMINATIONS grows without coerceGradeDetermination recognizing
  // the new member, this test fails instead of silently coercing it to
  // undefined.
  it("round-trips every known GradeDetermination member", () => {
    expect(GRADE_DETERMINATIONS.length).toBeGreaterThanOrEqual(2);
    for (const determination of GRADE_DETERMINATIONS) {
      const withDetermination = {
        ...validRunEntry,
        run: {
          ...validRunEntry.run,
          results: [{ ...validRunEntry.run.results[0], determination }],
        },
      };
      const payload = coerceGradingDraftPayload({ runs: [withDetermination] });
      expect(payload.runs[0].run.results[0].determination).toBe(determination);
    }
  });

  // docs/grading-results-feedback-boxes-acceptance-criteria.md A5 item 18:
  // same degrade-to-default idiom as github-grading-run-store.ts - a draft
  // saved before this feature existed has no strengths/improvements/
  // resubmitNotice keys in its stored jsonb at all, and must still coerce
  // into a valid result rather than being dropped like a genuinely malformed
  // row (the "drops a malformed grade result" case above).
  it("defaults strengths/improvements/resubmitNotice to \"\" for a result predating this feature", () => {
    const payload = coerceGradingDraftPayload({ runs: [validRunEntry] });
    expect(payload.runs[0].run.results[0].student).toBe("Jane Doe");
    expect(payload.runs[0].run.results[0].strengths).toBe("");
    expect(payload.runs[0].run.results[0].improvements).toBe("");
    expect(payload.runs[0].run.results[0].resubmitNotice).toBe("");
  });
});

describe("createGradingDraft", () => {
  it("persists the source column when provided as repos", async () => {
    let insertedData: Record<string, unknown> | null = null;

    const mockSupabase = {
      from: () => ({
        insert: (data: Record<string, unknown>) => {
          insertedData = data;
          return {
            select: () => ({
              single: () => Promise.resolve({
                data: makeRow({ source: "repos" as const }),
                error: null,
              }),
            }),
          };
        },
      }),
    };

    const draft = await createGradingDraft(
      mockSupabase as unknown as Parameters<typeof createGradingDraft>[0],
      "u1",
      {
        summary: "test",
        payload: { runs: [] },
        source: "repos",
      }
    );

    expect(insertedData).toHaveProperty("source", "repos");
    expect(draft.source).toBe("repos");
  });

  it("persists null source when omitted", async () => {
    let insertedData: Record<string, unknown> | null = null;

    const mockSupabase = {
      from: () => ({
        insert: (data: Record<string, unknown>) => {
          insertedData = data;
          return {
            select: () => ({
              single: () => Promise.resolve({
                data: makeRow({ source: null }),
                error: null,
              }),
            }),
          };
        },
      }),
    };

    const draft = await createGradingDraft(
      mockSupabase as unknown as Parameters<typeof createGradingDraft>[0],
      "u1",
      {
        summary: "test",
        payload: { runs: [] },
      }
    );

    expect(insertedData).toHaveProperty("source", null);
    expect(draft.source).toBeUndefined();
  });
});
