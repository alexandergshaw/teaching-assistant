import { beforeEach, describe, expect, it } from "vitest";
import { readSessionDiagnosticSurfaceEntries, resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";
import {
  GRADING_ACTION_FAILURE_CLASSES,
  MERGE_CHECK_FAILURE_CLASSES,
  classifyGradingActionResult,
  classifyMergeCheckResult,
  decideGradingActionDiagnostic,
  timeGradingAction,
  timePostGrades,
} from "./gradingActionSeam";

beforeEach(() => {
  resetSessionDiagnosticLogForTests("2026-10-08T10:00:00.000Z");
});

function grading() {
  return readSessionDiagnosticSurfaceEntries("grading").entries;
}

describe("classifyGradingActionResult (pure)", () => {
  it("treats a clean post, a rubric, a run and a checklist as success", () => {
    expect(classifyGradingActionResult({ posted: 3, failures: [], skipped: [] })).toBeNull();
    expect(classifyGradingActionResult({ posted: 2, failed: 0, skipped: 0, attempted: 2 })).toBeNull();
    expect(classifyGradingActionResult({ rubric: "r", fullName: "o/r", fileCount: 1 })).toBeNull();
    expect(classifyGradingActionResult({ items: ["a"] })).toBeNull();
    expect(classifyGradingActionResult(undefined)).toBeNull();
  });

  it("maps an { error } result to a fixed class", () => {
    expect(classifyGradingActionResult({ error: "Jane Smith could not be posted" })).toBe("action failed");
  });

  it("maps partial posts (Canvas arrays and draft counts) to a fixed class", () => {
    expect(classifyGradingActionResult({ posted: 1, failures: [{ userId: 1, error: "Jane" }], skipped: [] })).toBe(
      "partially posted"
    );
    expect(classifyGradingActionResult({ posted: 1, failures: [], skipped: [{ userId: 2, reason: "Jane" }] })).toBe(
      "partially posted"
    );
    expect(classifyGradingActionResult({ posted: 1, failed: 1, skipped: 0, attempted: 2 })).toBe("partially posted");
    expect(classifyGradingActionResult({ posted: 1, failed: 0, skipped: 1, attempted: 2 })).toBe("partially posted");
  });

  it("only ever returns a member of the fixed set, never the input text", () => {
    for (const raw of [{ error: "Alice Jones" }, { failures: [{ error: "Alice" }] }, { failed: 2 }]) {
      const out = classifyGradingActionResult(raw);
      expect(out).not.toBeNull();
      expect(GRADING_ACTION_FAILURE_CLASSES).toContain(out);
      expect(out).not.toContain("Alice");
    }
  });
});

describe("decideGradingActionDiagnostic (pure)", () => {
  it("success carries a rounded, non-negative duration and no error", () => {
    expect(
      decideGradingActionDiagnostic({ operation: "post_grades", startedAtMs: 100, settledAtMs: 350.6, failureClass: null })
    ).toEqual({ operation: "post_grades", outcome: "success", durationMs: 251 });
    expect(
      decideGradingActionDiagnostic({ operation: "grade_repo", startedAtMs: 500, settledAtMs: 400, failureClass: null }).durationMs
    ).toBe(0);
  });

  it("failure carries the fixed class", () => {
    expect(
      decideGradingActionDiagnostic({ operation: "post_draft", startedAtMs: 0, settledAtMs: 40, failureClass: "partially posted" })
    ).toEqual({ operation: "post_draft", outcome: "failure", durationMs: 40, error: "partially posted" });
  });
});

describe("timeGradingAction (wrapper call shape)", () => {
  it("records a grading-surface success with a numeric duration and returns the result unchanged", async () => {
    const result = { posted: 2, failures: [], skipped: [] };
    const out = await timeGradingAction("post_grades", async () => result);
    expect(out).toBe(result);
    const e = grading();
    expect(e).toHaveLength(1);
    expect(e[0].surface).toBe("grading");
    expect([e[0].operation, e[0].outcome]).toEqual(["post_grades", "success"]);
    expect(e[0].label).toBe("Post grades to Canvas");
    expect(typeof e[0].durationMs).toBe("number");
  });

  it("records an { error } result as the fixed class, never the raw text or a name", async () => {
    await timeGradingAction("grade_repo", async () => ({ error: "Jane Smith repo org/jane-smith is private" }));
    const e = grading();
    expect(e[0].outcome).toBe("failure");
    expect(e[0].error).toBe("action failed");
    expect(JSON.stringify(e)).not.toContain("Jane");
    expect(JSON.stringify(e)).not.toContain("jane-smith");
  });

  it("records a rejection as request threw and rethrows the original error", async () => {
    const boom = new Error("network down for Alice");
    await expect(timeGradingAction("post_draft", async () => Promise.reject(boom))).rejects.toBe(boom);
    const e = grading();
    expect(e[0].error).toBe("request threw");
    expect(JSON.stringify(e)).not.toContain("Alice");
  });

  it("records a partial post as a failure with the fixed class", async () => {
    await timeGradingAction("post_draft", async () => ({ posted: 1, failed: 0, skipped: 1, attempted: 2 }));
    expect(grading()[0].error).toBe("partially posted");
  });

  it("timePostGrades records the post_grades operation (not a mislabel)", async () => {
    await timePostGrades(async () => ({ posted: 1, failures: [], skipped: [] }));
    expect(grading()[0].operation).toBe("post_grades");
  });
});

describe("merge-check diagnostic (AC-8)", () => {
  it("classifyMergeCheckResult reads only the fixed status set by shape", () => {
    for (const status of ["merged", "not-merged", "no-submission", "unknown"]) {
      expect(classifyMergeCheckResult({ branchMergeCheck: { status, targetBranch: "main" } })).toBe(status);
    }
    expect(classifyMergeCheckResult({ run: {} })).toBeNull();
    expect(classifyMergeCheckResult({ branchMergeCheck: { status: "made-up" } })).toBeNull();
    expect(classifyMergeCheckResult(undefined)).toBeNull();
  });

  it("decideGradingActionDiagnostic carries mergeCheck only when supplied", () => {
    const base = { operation: "grade_repo" as const, startedAtMs: 0, settledAtMs: 10, failureClass: null };
    expect(decideGradingActionDiagnostic({ ...base, mergeCheck: "not-merged" }).mergeCheck).toBe("not-merged");
    expect("mergeCheck" in decideGradingActionDiagnostic(base)).toBe(false);
    expect("mergeCheck" in decideGradingActionDiagnostic({ ...base, mergeCheck: null })).toBe(false);
  });

  it("a merged grade (either engine) records only the ordinary success entry", async () => {
    await timeGradingAction("grade_repo", async () => ({ run: {}, branchMergeCheck: { status: "merged", targetBranch: "main" } }));
    const e = grading();
    expect(e).toHaveLength(1);
    expect(e[0].outcome).toBe("success");
  });

  it("each non-merged outcome adds one fixed-class entry and never records a branch or repo name", async () => {
    for (const status of ["not-merged", "no-submission", "unknown"] as const) {
      resetSessionDiagnosticLogForTests("2026-10-08T10:00:00.000Z");
      await timeGradingAction("grade_repo", async () => ({
        noSubmission: true,
        fullName: "org/jane-smith",
        reason: "Jane Smith feature-secret",
        branchMergeCheck: { status, targetBranch: "release-secret", foundOnBranch: "feature-secret" },
      }));
      const e = grading();
      expect(e).toHaveLength(2);
      expect(e[1].error).toBe(MERGE_CHECK_FAILURE_CLASSES[status]);
      const dump = JSON.stringify(e);
      for (const leak of ["Jane", "jane-smith", "feature-secret", "release-secret"]) expect(dump).not.toContain(leak);
    }
  });

  it("other operations never read a merge check", async () => {
    await timeGradingAction("post_grades", async () => ({ branchMergeCheck: { status: "not-merged", targetBranch: "m" } }));
    expect(grading()).toHaveLength(1);
  });
});
