// Tests for repoGradesBulkGrade.ts - the "grade this whole column" bulk run
// decisions (buildBulkGradePlan, bulkGradeSummaryLine). Per this file's own
// header comment, vitest here is node-env and collects only
// src/**/*.test.ts, so nothing is ever rendered - these tests pin the plan's
// facts (which repos land in `targets` vs `skipped`, and why) and the
// summary line's counts, never incidental prose spelling, since a future
// wording pass should be free to reword without breaking this suite.

import { describe, it, expect } from "vitest";
import {
  buildBulkGradePlan,
  bulkGradeSummaryLine,
  bulkGradeOutcomeFromRun,
  BULK_GRADE_CONCURRENCY,
  type BulkGradeOutcome,
  type BulkGradeTarget,
} from "./repoGradesBulkGrade";
import type { RepoGradeRow, RepoGradeCell } from "./repoGradesRows";
import type { RepoBindingSuggestion } from "@/lib/repo-student-bindings";
import { GRADING_FAILURE_PREFIX, type GradeResult } from "@/lib/grade/types";

// A binding deliberately in the "unbound" state with every field filled with
// an obviously-wrong sentinel value that would fail loudly (e.g. show up in
// a skip reason or a target) if buildBulkGradePlan ever read it - RULE 2 is
// that this module never consults `row.binding` at all.
const POISON_BINDING: RepoBindingSuggestion = {
  repo: "poison/should-never-be-read",
  state: "unbound",
  canvasUserId: "POISON_CANVAS_USER_ID",
  student: "POISON_STUDENT_NAME",
  candidates: [],
  derivedHandle: "POISON_HANDLE",
};

function cell(status: RepoGradeCell["status"], score = ""): RepoGradeCell {
  return { status, score, comment: "", postStatus: "idle" };
}

function row(repo: string, cells: Record<string, RepoGradeCell>): RepoGradeRow {
  return {
    repo,
    htmlUrl: `https://github.com/${repo}`,
    defaultBranch: "main",
    binding: POISON_BINDING,
    folders: Object.keys(cells),
    folderError: null,
    cells,
  };
}

describe("buildBulkGradePlan", () => {
  it("an empty row list yields an empty plan", () => {
    const plan = buildBulkGradePlan({ rows: [], folder: "week-1", selected: new Set(), selectionOnly: false });
    expect(plan).toEqual({ targets: [], skipped: [] });
  });

  it("every row gradeable: all land in targets, in grid order, none skipped", () => {
    const rows = [
      row("org/a", { "week-1": cell("ungraded") }),
      row("org/b", { "week-1": cell("ungraded") }),
      row("org/c", { "week-1": cell("ungraded") }),
    ];
    const plan = buildBulkGradePlan({ rows, folder: "week-1", selected: new Set(), selectionOnly: false });
    expect(plan.targets).toEqual([
      { repo: "org/a", folder: "week-1" },
      { repo: "org/b", folder: "week-1" },
      { repo: "org/c", folder: "week-1" },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("a mix of missing-folder, already-graded, scan-error and gradeable rows sorts correctly with reasons", () => {
    const rows = [
      row("org/gradeable", { "week-1": cell("ungraded") }),
      row("org/no-folder", { "week-1": cell("missing-folder") }),
      row("org/already-graded", { "week-1": cell("ungraded", "18/20") }),
      row("org/scan-failed", { "week-1": cell("scan-error") }),
    ];
    const plan = buildBulkGradePlan({ rows, folder: "week-1", selected: new Set(), selectionOnly: false });

    expect(plan.targets).toEqual([{ repo: "org/gradeable", folder: "week-1" }]);
    expect(plan.skipped).toEqual([
      { repo: "org/no-folder", reason: expect.any(String) },
      { repo: "org/already-graded", reason: expect.any(String) },
      { repo: "org/scan-failed", reason: expect.any(String) },
    ]);
    // Facts about WHICH repo got WHICH kind of reason, not the reason's exact
    // wording: the three skip causes must remain distinguishable from each
    // other (never collapsed to one generic "skipped" reason).
    const reasonByRepo = new Map(plan.skipped.map((s) => [s.repo, s.reason]));
    const reasons = new Set(reasonByRepo.values());
    expect(reasons.size).toBe(3);
  });

  it("a row with no entry for the requested folder is skipped the same way as missing-folder", () => {
    const rows = [row("org/a", { "week-2": cell("ungraded") })];
    const plan = buildBulkGradePlan({ rows, folder: "week-1", selected: new Set(), selectionOnly: false });
    expect(plan.targets).toEqual([]);
    expect(plan.skipped).toEqual([{ repo: "org/a", reason: expect.any(String) }]);
  });

  it("selectionOnly true with a subset checked narrows targets to that subset", () => {
    const rows = [
      row("org/a", { "week-1": cell("ungraded") }),
      row("org/b", { "week-1": cell("ungraded") }),
      row("org/c", { "week-1": cell("ungraded") }),
    ];
    const plan = buildBulkGradePlan({
      rows,
      folder: "week-1",
      selected: new Set(["org/a", "org/c"]),
      selectionOnly: true,
    });
    expect(plan.targets).toEqual([
      { repo: "org/a", folder: "week-1" },
      { repo: "org/c", folder: "week-1" },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("selectionOnly true with NOTHING checked means the whole column", () => {
    const rows = [row("org/a", { "week-1": cell("ungraded") }), row("org/b", { "week-1": cell("ungraded") })];
    const plan = buildBulkGradePlan({ rows, folder: "week-1", selected: new Set(), selectionOnly: true });
    expect(plan.targets).toEqual([
      { repo: "org/a", folder: "week-1" },
      { repo: "org/b", folder: "week-1" },
    ]);
  });

  it("selectionOnly false ignores a non-empty selection and grades the whole column", () => {
    const rows = [row("org/a", { "week-1": cell("ungraded") }), row("org/b", { "week-1": cell("ungraded") })];
    const plan = buildBulkGradePlan({
      rows,
      folder: "week-1",
      selected: new Set(["org/a"]),
      selectionOnly: false,
    });
    expect(plan.targets).toEqual([
      { repo: "org/a", folder: "week-1" },
      { repo: "org/b", folder: "week-1" },
    ]);
  });

  it("never reads row.binding: an all-poison binding on every row does not affect the plan", () => {
    const rows = [row("org/a", { "week-1": cell("ungraded") })];
    const plan = buildBulkGradePlan({ rows, folder: "week-1", selected: new Set(), selectionOnly: false });
    expect(plan.targets).toEqual([{ repo: "org/a", folder: "week-1" }]);
    expect(JSON.stringify(plan)).not.toContain("POISON");
  });

  it("does not mutate its inputs", () => {
    const rows = [
      row("org/a", { "week-1": cell("ungraded") }),
      row("org/b", { "week-1": cell("missing-folder") }),
    ];
    const rowsCopy = JSON.parse(JSON.stringify(rows));
    const selected = new Set(["org/a"]);
    buildBulkGradePlan({ rows, folder: "week-1", selected, selectionOnly: true });
    expect(rows).toEqual(rowsCopy);
    expect(selected).toEqual(new Set(["org/a"]));
  });
});

describe("bulkGradeSummaryLine", () => {
  function outcome(repo: string, status: BulkGradeOutcome["status"], score = ""): BulkGradeOutcome {
    return { repo, folder: "week-1", status, score, detail: "" };
  }

  it("all graded: counts graded, mentions no failures or skips, and reads as a success", () => {
    const plan = { targets: [], skipped: [] };
    const outcomes = [outcome("org/a", "graded", "18/20"), outcome("org/b", "graded", "20/20")];
    const line = bulkGradeSummaryLine(outcomes, plan);
    expect(line).toContain("2 graded");
    expect(line).not.toContain("failed");
    expect(line).not.toContain("skipped");
    expect(line.toLowerCase()).not.toContain("nothing was graded");
  });

  it("all failed: 0 graded, so it must read as nothing-was-graded, not as a success", () => {
    const plan = { targets: [], skipped: [] };
    const outcomes = [outcome("org/a", "failed"), outcome("org/b", "failed")];
    const line = bulkGradeSummaryLine(outcomes, plan);
    expect(line.toLowerCase()).toContain("nothing was graded");
    expect(line).toContain("2 failed");
    expect(line).not.toMatch(/\d+ graded/);
  });

  it("all skipped: nothing attempted, still reads as nothing-was-graded with the skip count", () => {
    const plan = { targets: [], skipped: [{ repo: "org/a", reason: "already graded" }, { repo: "org/b", reason: "already graded" }] };
    const outcomes: BulkGradeOutcome[] = [];
    const line = bulkGradeSummaryLine(outcomes, plan);
    expect(line.toLowerCase()).toContain("nothing was graded");
    expect(line).toContain("2 skipped");
  });

  it("a genuinely empty run (no outcomes, no skips) still reads as nothing-was-graded", () => {
    const plan = { targets: [], skipped: [] };
    const line = bulkGradeSummaryLine([], plan);
    expect(line.toLowerCase()).toContain("nothing was graded");
  });

  // FIX 2: gradeRepoAction's "nothing was submitted" result reaches here as
  // its own outcome status - never counted as graded, never counted as
  // failed (nothing went wrong).
  it("a no-submission outcome is its own count, never merged into graded or failed", () => {
    const plan = { targets: [], skipped: [] };
    const outcomes = [outcome("org/a", "graded", "18/20"), outcome("org/b", "no-submission")];
    const line = bulkGradeSummaryLine(outcomes, plan);
    expect(line).toContain("1 graded");
    expect(line).toContain("1 had nothing submitted");
    expect(line).not.toContain("failed");
    expect(line).not.toContain("2 graded");
  });

  it("all no-submission: 0 graded, so it must read as nothing-was-graded, not as a success", () => {
    const plan = { targets: [], skipped: [] };
    const outcomes = [outcome("org/a", "no-submission"), outcome("org/b", "no-submission")];
    const line = bulkGradeSummaryLine(outcomes, plan);
    expect(line.toLowerCase()).toContain("nothing was graded");
    expect(line).toContain("2 had nothing submitted");
    expect(line).not.toMatch(/\d+ graded/);
  });

  it("mixed: graded, failed and skipped are all present and the total is never overstated", () => {
    const plan = { targets: [], skipped: [{ repo: "org/c", reason: "already graded" }] };
    const outcomes = [outcome("org/a", "graded", "18/20"), outcome("org/b", "failed")];
    const line = bulkGradeSummaryLine(outcomes, plan);
    expect(line).toContain("1 graded");
    expect(line).toContain("1 failed");
    expect(line).toContain("1 skipped");
    // The skipped repo must never be counted as graded.
    expect(line).not.toContain("2 graded");
  });
});

describe("BULK_GRADE_CONCURRENCY", () => {
  it("is 3", () => {
    expect(BULK_GRADE_CONCURRENCY).toBe(3);
  });
});

// T-2 (docs/a28-scope.md section 8.1, R-6): bulkGradeOutcomeFromRun by value,
// over the contract's four rules (7a-7d). This is the classifier
// useRepoGradesBulkGrade.ts's call site now delegates to instead of stamping
// every success-shaped return "graded" unconditionally (A28).
describe("bulkGradeOutcomeFromRun", () => {
  const TARGET: BulkGradeTarget = { repo: "org/a", folder: "week-1" };

  function gradedRow(overrides: Partial<GradeResult> = {}): GradeResult {
    return {
      student: "org/a",
      overallComment: "",
      strengths: "",
      improvements: "",
      resubmitNotice: "",
      rubricAreas: [],
      totalScore: "18/20",
      feedback: "",
      mergedFileCount: 1,
      submittedFiles: [],
      ...overrides,
    };
  }

  function gradingFailedRow(message = `${GRADING_FAILURE_PREFIX}model error`): GradeResult {
    return {
      student: "org/a",
      overallComment: "",
      strengths: "",
      improvements: "",
      resubmitNotice: "",
      rubricAreas: [],
      totalScore: "",
      feedback: "",
      mergedFileCount: 0,
      submittedFiles: [],
      ungraded: { kind: "grading-failed", sourceIndex: 0, student: "org/a", message },
    };
  }

  function notAttemptedRow(message = "not attempted"): GradeResult {
    return {
      student: "org/a",
      overallComment: message,
      strengths: message,
      improvements: "",
      resubmitNotice: "",
      rubricAreas: [],
      totalScore: "",
      feedback: "",
      mergedFileCount: 0,
      submittedFiles: [],
      ungraded: { kind: "not-attempted", sourceIndex: 0, student: "org/a", stoppedBy: "run-deadline", message },
    };
  }

  it("(a) empty results: failed, empty score, the 'no result' detail, joined with successDetail when non-empty", () => {
    expect(bulkGradeOutcomeFromRun(TARGET, [], "")).toEqual({
      repo: "org/a",
      folder: "week-1",
      status: "failed",
      score: "",
      detail: "Grading returned no result for this folder.",
    });
    expect(bulkGradeOutcomeFromRun(TARGET, [], "instructions came from README.md")).toEqual({
      repo: "org/a",
      folder: "week-1",
      status: "failed",
      score: "",
      detail: "Grading returned no result for this folder. | instructions came from README.md",
    });
  });

  it("(b) a grading-failed row: failed, ungraded.message as detail, joined with successDetail (MU-5 guard: never dropped)", () => {
    const failedRow = gradingFailedRow();
    expect(bulkGradeOutcomeFromRun(TARGET, [failedRow], "")).toEqual({
      repo: "org/a",
      folder: "week-1",
      status: "failed",
      score: "",
      detail: failedRow.ungraded!.message,
    });
    expect(bulkGradeOutcomeFromRun(TARGET, [failedRow], "instructions came from README.md")).toEqual({
      repo: "org/a",
      folder: "week-1",
      status: "failed",
      score: "",
      detail: `${failedRow.ungraded!.message} | instructions came from README.md`,
    });
  });

  it("(b) a not-attempted row is treated the same as a grading-failed row", () => {
    const notAttempted = notAttemptedRow();
    expect(bulkGradeOutcomeFromRun(TARGET, [notAttempted], "")).toEqual({
      repo: "org/a",
      folder: "week-1",
      status: "failed",
      score: "",
      detail: notAttempted.ungraded!.message,
    });
  });

  it("(c) a graded row: graded, score copied from totalScore, detail is successDetail as-is", () => {
    const graded = gradedRow({ totalScore: "18/20" });
    expect(bulkGradeOutcomeFromRun(TARGET, [graded], "instructions came from README.md")).toEqual({
      repo: "org/a",
      folder: "week-1",
      status: "graded",
      score: "18/20",
      detail: "instructions came from README.md",
    });
  });

  it("(d) repo and folder always come from target, never from the result", () => {
    const graded = gradedRow({ student: "someone-else" });
    const outcome = bulkGradeOutcomeFromRun({ repo: "org/z", folder: "week-9" }, [graded], "");
    expect(outcome.repo).toBe("org/z");
    expect(outcome.folder).toBe("week-9");
  });

  it("MU-6 guard: reads results[0], never results.at(-1) - a graded first result beside a failed second result stays graded", () => {
    const first = gradedRow({ totalScore: "9" });
    const second = gradingFailedRow("should never be read");
    expect(bulkGradeOutcomeFromRun(TARGET, [first, second], "")).toEqual({
      repo: "org/a",
      folder: "week-1",
      status: "graded",
      score: "9",
      detail: "",
    });
  });
});
