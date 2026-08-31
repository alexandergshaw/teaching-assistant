// Tests for repoGradesBulkGrade.ts - the "grade this whole column" bulk run
// decisions (buildBulkGradePlan, bulkGradeSummaryLine). Per this file's own
// header comment, vitest here is node-env and collects only
// src/**/*.test.ts, so nothing is ever rendered - these tests pin the plan's
// facts (which repos land in `targets` vs `skipped`, and why) and the
// summary line's counts, never incidental prose spelling, since a future
// wording pass should be free to reword without breaking this suite.

import { describe, it, expect } from "vitest";
import { buildBulkGradePlan, bulkGradeSummaryLine, BULK_GRADE_CONCURRENCY, type BulkGradeOutcome } from "./repoGradesBulkGrade";
import type { RepoGradeRow, RepoGradeCell } from "./repoGradesRows";
import type { RepoBindingSuggestion } from "@/lib/repo-student-bindings";

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
