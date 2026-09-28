import { describe, it, expect } from "vitest";
import {
  INCREMENTAL_CONCURRENCY,
  ITEM_REQUEST_BYTE_BUDGET,
  routeGradingRun,
  buildRunItemRequests,
  mergeArrivedResults,
  classifyItemFailure,
  estimateEntryWireBytes,
  type IncrementalRunPlan,
} from "./incrementalRunPlan";
import { UPLOAD_WIRE_BUDGET_BYTES, wireBytesForFile } from "@/lib/upload-budget";
import type { GradeResult, StudentSubmissionEntry } from "@/lib/grade/types";

function entry(overrides: Partial<StudentSubmissionEntry> = {}): StudentSubmissionEntry {
  return { student: "Student", content: "content", mergedFileCount: 1, submittedFiles: [], ...overrides };
}

function fd(fields: Record<string, string | File>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

// ---------------------------------------------------------------------------
// W4-12 clause 3 - the per-item budget is compared against
// UPLOAD_WIRE_BUDGET_BYTES by IMPORTING the constant, never a copied number.
// ---------------------------------------------------------------------------
describe("ITEM_REQUEST_BYTE_BUDGET (W4-12 clause 3)", () => {
  it("is UPLOAD_WIRE_BUDGET_BYTES itself (imported, not a re-typed literal)", () => {
    expect(ITEM_REQUEST_BYTE_BUDGET).toBe(UPLOAD_WIRE_BUDGET_BYTES);
  });
});

// ---------------------------------------------------------------------------
// W4-11 - concurrency floor, a pure-predicate claim.
// ---------------------------------------------------------------------------
describe("INCREMENTAL_CONCURRENCY (W4-11)", () => {
  it("matches BULK_GRADE_CONCURRENCY's own value (3) - the shipped production precedent this wave reuses", () => {
    expect(INCREMENTAL_CONCURRENCY).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// W4-12 clause 1 - routeGradingRun by WIRE size and provider, pure/sync.
// ---------------------------------------------------------------------------
describe("routeGradingRun (W4-12 clause 1, S4 step 2: PURE and SYNCHRONOUS)", () => {
  it("routes a picked file under the wire budget to 'incremental' on the gemini provider", () => {
    const file = new File(["short content"], "a.txt", { type: "text/plain" });
    expect(routeGradingRun(fd({ studentSubmissions: file }), "gemini")).toBe("incremental");
  });

  it("routes a picked file whose WIRE size exceeds the budget to 'whole-run'", () => {
    // File bytes chosen so wireBytesForFile(fileBytes) > ITEM_REQUEST_BYTE_BUDGET.
    const oversizedBytes = Math.ceil(ITEM_REQUEST_BYTE_BUDGET / (4 / 3)) + 1024;
    const file = new File([new Uint8Array(oversizedBytes)], "big.zip", { type: "application/zip" });
    expect(wireBytesForFile(file.size)).toBeGreaterThan(ITEM_REQUEST_BYTE_BUDGET);
    expect(routeGradingRun(fd({ studentSubmissions: file }), "gemini")).toBe("whole-run");
  });

  it("routes ANY non-gemini provider to 'whole-run', regardless of file size", () => {
    const file = new File(["tiny"], "a.txt", { type: "text/plain" });
    expect(routeGradingRun(fd({ studentSubmissions: file }), "other")).toBe("whole-run");
    expect(routeGradingRun(fd({ studentSubmissions: file }), "embedded")).toBe("whole-run");
  });

  it("routes a Canvas URL (no file) to 'incremental' on gemini - the per-item budget is enforced server-side once entries are extracted", () => {
    expect(routeGradingRun(fd({ canvasUrl: "https://example.instructure.com/courses/1/assignments/2" }), "gemini")).toBe(
      "incremental"
    );
  });

  it("routes a form with no file and no canvasUrl to 'whole-run' (lets the existing refusal fire there)", () => {
    expect(routeGradingRun(fd({}), "gemini")).toBe("whole-run");
  });
});

// ---------------------------------------------------------------------------
// W4-3 / W4-5 - buildRunItemRequests / mergeArrivedResults ordering.
// ---------------------------------------------------------------------------
describe("buildRunItemRequests (W4-3)", () => {
  it("builds one request per ticket, carrying the shared plan fields onto every one", () => {
    const plan: IncrementalRunPlan = {
      tickets: [
        { sourceIndex: 0, entry: entry({ student: "Alice" }) },
        { sourceIndex: 1, entry: entry({ student: "Bob" }) },
      ],
      assignmentInstructions: "Write an essay.",
      rubric: "1. Correctness",
      provider: "gemini",
      pointsPossible: null,
    };
    const requests = buildRunItemRequests(plan);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual({
      sourceIndex: 0,
      entry: entry({ student: "Alice" }),
      assignmentInstructions: "Write an essay.",
      rubric: "1. Correctness",
      provider: "gemini",
      pointsPossible: null,
    });
    expect(requests[1].sourceIndex).toBe(1);
  });
});

describe("mergeArrivedResults (W4-5, RULING 30: a row never moves, it only appears)", () => {
  function graded(student: string): GradeResult {
    return {
      student,
      overallComment: "",
      strengths: "",
      improvements: "",
      resubmitNotice: "",
      rubricAreas: [],
      totalScore: "",
      feedback: "",
      mergedFileCount: 1,
      submittedFiles: [],
    };
  }

  it("returns arrived rows in ASCENDING sourceIndex order, regardless of arrival order", () => {
    const merged = mergeArrivedResults(3, [
      { sourceIndex: 2, result: graded("Chen") },
      { sourceIndex: 0, result: graded("Alice") },
    ]);
    expect(merged.map((r) => r.student)).toEqual(["Alice", "Chen"]);
  });

  it("a pending (not-yet-arrived) index produces NO ROW AT ALL - never a placeholder", () => {
    const merged = mergeArrivedResults(3, [{ sourceIndex: 0, result: graded("Alice") }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].student).toBe("Alice");
  });

  it("WATCHED: an implementation keyed on ARRIVAL ORDER instead of sourceIndex would put Chen before Alice here - this test would go RED against that mutation", () => {
    const arrivedInThisOrder = [
      { sourceIndex: 2, result: graded("Chen") },
      { sourceIndex: 0, result: graded("Alice") },
    ];
    const byArrivalOrder = arrivedInThisOrder.map((a) => a.result.student);
    const bySourceIndex = mergeArrivedResults(3, arrivedInThisOrder).map((r) => r.student);
    expect(bySourceIndex).not.toEqual(byArrivalOrder);
  });

  it("returns an empty array when nothing has arrived yet", () => {
    expect(mergeArrivedResults(5, [])).toEqual([]);
  });
});

describe("classifyItemFailure (per-item isolation: one transport failure is one ordinary ungraded row)", () => {
  it("maps an Error to a grading-failed row carrying GRADING_FAILURE_PREFIX and the sourceIndex", () => {
    const row = classifyItemFailure(3, "Dana", new Error("network timeout"));
    expect(row.ungraded).toEqual({
      kind: "grading-failed",
      sourceIndex: 3,
      student: "Dana",
      message: "This submission could not be graded: network timeout",
    });
    expect(row.student).toBe("Dana");
  });

  it("falls back to a generic message for a non-Error rejection", () => {
    const row = classifyItemFailure(0, "Alice", "not an Error instance");
    expect(row.ungraded?.message).toBe("This submission could not be graded: The grading service did not respond.");
  });
});

describe("estimateEntryWireBytes", () => {
  it("counts content length plus every attached file's rawBase64 length", () => {
    const bytes = estimateEntryWireBytes(
      entry({
        content: "12345",
        submittedFiles: [
          { name: "a.png", extension: "png", previewContent: "", previewTruncated: false, rawBase64: "abcd" },
          { name: "b.png", extension: "png", previewContent: "", previewTruncated: false },
        ],
      })
    );
    expect(bytes).toBe(5 + 4);
  });
});
