// Tests for repoGradesPosting.ts (AC5 items 27-32, and docs/repo-grades-
// posting-and-reflow-acceptance-criteria.md's A1/A3/X1). Per the "Tests
// written BEFORE implementation" list items 3-4, this file's centerpieces
// are:
//   - buildRepoGradePostPlan: skips every non-postable row and includes every
//     postable one, with the EXACT numeric userId/score repoGradePostability
//     computed (never re-derived here); A3: includes `rubricAreas` only when
//     the score was not hand-edited away from what grading produced.
//   - fanOutRepoGradePostResult: every failed userId lands on its own row
//     with its own message, no OTHER row is marked errored, and a
//     whole-request error marks every attempted row errored.
//   - scopeRepoGradeRowsToSelection (A1): a non-empty selection narrows to
//     exactly those repos; an empty selection is a no-op (whole column).
//   - repoGradeScoreWasEdited (A3): the rubric-vs-edited-total decision.
// All are sabotage-checked (see the wave brief's mandatory sabotage-check
// list): the exact break, the exact failing test, and the restore are
// reported in the implementer's final summary, not inline here.
import { describe, it, expect } from "vitest";
import {
  buildRepoGradePostPlan,
  fanOutRepoGradePostResult,
  repoGradeAssignmentUrl,
  repoGradePostCandidateRows,
  repoGradeScoreWasEdited,
  scopeRepoGradeRowsToSelection,
  type RepoGradePostCandidateRow,
} from "./repoGradesPosting";
import { setRepoGradeCellEdit, EMPTY_REPO_GRADE_CELL_EDITS } from "./repoGradesCellEdits";
import type { RepoGradeRow } from "./repoGradesRows";

function row(overrides: Partial<RepoGradePostCandidateRow> = {}): RepoGradePostCandidateRow {
  return {
    repo: "org/repo-a",
    bindingState: "confirmed",
    canvasUserId: "501",
    folderPresent: true,
    score: "85",
    comment: "",
    rubricAreas: [],
    generatedScore: null,
    ...overrides,
  };
}

describe("buildRepoGradePostPlan - AC5 item 28: driven entirely by repoGradePostability", () => {
  it("includes a fully-postable row with the exact numeric userId and score", () => {
    const plan = buildRepoGradePostPlan([row()], "701");
    expect(plan.postable).toHaveLength(1);
    expect(plan.postable[0]).toEqual({
      repo: "org/repo-a",
      userId: 501,
      grade: { userId: 501, grade: "85" },
    });
    expect(plan.skipped).toEqual([]);
  });

  it("includes the comment only when it is non-blank, and trims it", () => {
    const plan = buildRepoGradePostPlan([row({ comment: "  Nice work  " })], "701");
    expect(plan.postable[0].grade).toEqual({ userId: 501, grade: "85", comment: "Nice work" });
  });

  it("omits the comment field entirely for a blank comment (never sends an empty string)", () => {
    const plan = buildRepoGradePostPlan([row({ comment: "   " })], "701");
    expect(plan.postable[0].grade).toEqual({ userId: 501, grade: "85" });
    expect("comment" in plan.postable[0].grade).toBe(false);
  });

  it("skips a row whose binding is not confirmed, with a reason naming the binding state", () => {
    const plan = buildRepoGradePostPlan([row({ bindingState: "suggested" })], "701");
    expect(plan.postable).toEqual([]);
    expect(plan.skipped).toEqual([{ repo: "org/repo-a", reason: expect.stringContaining("suggested") }]);
  });

  it("skips a row with a non-numeric canvasUserId", () => {
    const plan = buildRepoGradePostPlan([row({ canvasUserId: "abc" })], "701");
    expect(plan.postable).toEqual([]);
    expect(plan.skipped[0].reason).toMatch(/numeric Canvas user id/i);
  });

  it("skips every row when the column has no mapped assignment", () => {
    const plan = buildRepoGradePostPlan([row()], null);
    expect(plan.postable).toEqual([]);
    expect(plan.skipped[0].reason).toMatch(/no mapped Canvas assignment/i);
  });

  it("skips a row whose folder is absent", () => {
    const plan = buildRepoGradePostPlan([row({ folderPresent: false })], "701");
    expect(plan.postable).toEqual([]);
    expect(plan.skipped[0].reason).toMatch(/no folder/i);
  });

  it("skips a row with a blank or non-numeric score", () => {
    const plan = buildRepoGradePostPlan([row({ score: "" }), row({ repo: "org/repo-b", score: "not-a-number" })], "701");
    expect(plan.postable).toEqual([]);
    expect(plan.skipped).toHaveLength(2);
  });

  it("processes every row independently: one skip does not affect another row's inclusion", () => {
    const plan = buildRepoGradePostPlan(
      [row({ repo: "org/good", score: "90" }), row({ repo: "org/bad", bindingState: "unbound", canvasUserId: null })],
      "701"
    );
    expect(plan.postable.map((p) => p.repo)).toEqual(["org/good"]);
    expect(plan.skipped.map((s) => s.repo)).toEqual(["org/bad"]);
  });

  it("an empty row list yields an empty plan", () => {
    const plan = buildRepoGradePostPlan([], "701");
    expect(plan).toEqual({ postable: [], skipped: [] });
  });

  // SABOTAGE-CHECK ANCHOR: buildRepoGradePostPlan must call repoGradePostability
  // for postability - not a hand-rolled condition. Temporarily replacing the
  // `if (!result.postable)` branch with `if (false)` (i.e. treating every row
  // as postable regardless of repoGradePostability's verdict) was verified to
  // make "skips a row whose binding is not confirmed..." (and every other
  // "skips..." test above) FAIL, because plan.postable would then contain the
  // row that should have been skipped. The change was reverted after
  // confirming the failure; see the implementer's final report for the
  // full sabotage-check log.
  it("a row that fails EVERY postability condition at once is still reported with exactly one reason (the first that fails)", () => {
    const plan = buildRepoGradePostPlan([row({ bindingState: "unbound", canvasUserId: null, folderPresent: false, score: "" })], null);
    expect(plan.postable).toEqual([]);
    expect(plan.skipped).toHaveLength(1);
  });
});

function gridRow(repo: string, bindingState: RepoGradeRow["binding"]["state"], canvasUserId: string | null, folderStatus: "ungraded" | "missing-folder" | "scan-error"): RepoGradeRow {
  return {
    repo,
    htmlUrl: `https://github.com/${repo}`,
    binding: { repo, state: bindingState, canvasUserId, student: null, candidates: [], derivedHandle: null },
    folders: folderStatus === "scan-error" ? null : folderStatus === "ungraded" ? ["week-1"] : [],
    folderError: folderStatus === "scan-error" ? "boom" : null,
    cells: { "week-1": { status: folderStatus, score: "", comment: "", postStatus: "idle" } },
  };
}

describe("repoGradePostCandidateRows - assembles one column's rows from the grid model plus live edits", () => {
  it("pulls binding state/canvasUserId from the row and folderPresent from that column's cell status", () => {
    const rows = [gridRow("org/a", "confirmed", "501", "ungraded")];
    const candidates = repoGradePostCandidateRows(rows, EMPTY_REPO_GRADE_CELL_EDITS, "week-1");
    expect(candidates).toEqual([
      {
        repo: "org/a",
        bindingState: "confirmed",
        canvasUserId: "501",
        folderPresent: true,
        score: "",
        comment: "",
        rubricAreas: [],
        generatedScore: null,
      },
    ]);
  });

  it("A3: pulls the CURRENT rubricAreas/generatedScore from cellEdits, not just score/comment", () => {
    const rows = [gridRow("org/a", "confirmed", "501", "ungraded")];
    const areas = [{ area: "Correctness", score: "18/20", comment: "" }];
    const edits = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, "org/a", "week-1", {
      score: "18/20",
      rubricAreas: areas,
      generatedScore: "18/20",
    });
    const candidates = repoGradePostCandidateRows(rows, edits, "week-1");
    expect(candidates[0].rubricAreas).toEqual(areas);
    expect(candidates[0].generatedScore).toBe("18/20");
  });

  it("folderPresent is false for a missing-folder or scan-error cell, never conflated with ungraded", () => {
    const rows = [gridRow("org/a", "confirmed", "501", "missing-folder"), gridRow("org/b", "confirmed", "502", "scan-error")];
    const candidates = repoGradePostCandidateRows(rows, EMPTY_REPO_GRADE_CELL_EDITS, "week-1");
    expect(candidates.map((c) => c.folderPresent)).toEqual([false, false]);
  });

  it("pulls the CURRENT edited score/comment from cellEdits, not the grid model's always-blank cell fields", () => {
    const rows = [gridRow("org/a", "confirmed", "501", "ungraded")];
    const edits = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, "org/a", "week-1", { score: "88", comment: "Nice work" });
    const candidates = repoGradePostCandidateRows(rows, edits, "week-1");
    expect(candidates[0].score).toBe("88");
    expect(candidates[0].comment).toBe("Nice work");
  });

  it("a row with no edit entry falls back to blank score/comment, never throws", () => {
    const rows = [gridRow("org/a", "confirmed", "501", "ungraded")];
    const candidates = repoGradePostCandidateRows(rows, EMPTY_REPO_GRADE_CELL_EDITS, "week-1");
    expect(candidates[0].score).toBe("");
    expect(candidates[0].comment).toBe("");
  });

  it("an edit for a DIFFERENT folder under the same repo never leaks into this column's candidate row", () => {
    const rows = [gridRow("org/a", "confirmed", "501", "ungraded")];
    const edits = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, "org/a", "week-2", { score: "99" });
    const candidates = repoGradePostCandidateRows(rows, edits, "week-1");
    expect(candidates[0].score).toBe("");
  });

  it("preserves row order and one candidate per row", () => {
    const rows = [gridRow("org/b", "confirmed", "502", "ungraded"), gridRow("org/a", "confirmed", "501", "ungraded")];
    const candidates = repoGradePostCandidateRows(rows, EMPTY_REPO_GRADE_CELL_EDITS, "week-1");
    expect(candidates.map((c) => c.repo)).toEqual(["org/b", "org/a"]);
  });
});

// ---------------------------------------------------------------------------
// A1 (docs/repo-grades-posting-and-reflow-acceptance-criteria.md): the real
// defect this chunk exists to close - `selected` must govern which rows a
// column post even considers.
describe("scopeRepoGradeRowsToSelection - A1: the selection governs what a post attempt even considers", () => {
  const rows = [{ repo: "org/a" }, { repo: "org/b" }, { repo: "org/c" }];

  it("an empty selection is a no-op - every row passes through (today's whole-column behaviour)", () => {
    expect(scopeRepoGradeRowsToSelection(rows, new Set())).toEqual(rows);
  });

  it("a non-empty selection narrows to exactly the selected repos, in original order", () => {
    const scoped = scopeRepoGradeRowsToSelection(rows, new Set(["org/c", "org/a"]));
    expect(scoped.map((r) => r.repo)).toEqual(["org/a", "org/c"]);
  });

  it("a selection containing a repo not present in `rows` contributes nothing extra", () => {
    const scoped = scopeRepoGradeRowsToSelection(rows, new Set(["org/z"]));
    expect(scoped).toEqual([]);
  });

  it("never mutates the input rows array", () => {
    const before = [...rows];
    scopeRepoGradeRowsToSelection(rows, new Set(["org/a"]));
    expect(rows).toEqual(before);
  });

  // SABOTAGE-CHECK ANCHOR: this is THE test for the real defect A1 exists to
  // close. Temporarily replacing the function body with `return rows.slice();`
  // unconditionally (i.e. ignoring `selected` entirely - the exact pre-fix
  // behaviour, where `selected` gated nothing on the post path) was verified
  // to make "a non-empty selection narrows to exactly the selected repos"
  // FAIL: it returned all three repos instead of the two selected ones. The
  // change was reverted after confirming the failure; see the implementer's
  // final report for the full sabotage-check log.
  it("a selected repo with no postable cell is still excluded from `plan.postable` (composes correctly with buildRepoGradePostPlan)", () => {
    const gridRows: RepoGradePostCandidateRow[] = [
      row({ repo: "org/postable", score: "90" }),
      row({ repo: "org/unbound", bindingState: "unbound", canvasUserId: null }),
    ];
    const scoped = scopeRepoGradeRowsToSelection(gridRows, new Set(["org/postable", "org/unbound"]));
    const plan = buildRepoGradePostPlan(scoped, "701");
    expect(plan.postable.map((p) => p.repo)).toEqual(["org/postable"]);
    expect(plan.skipped.map((s) => s.repo)).toEqual(["org/unbound"]);
  });
});

// ---------------------------------------------------------------------------
// A3: rubric detail must not be posted alongside a score the instructor has
// hand-edited away from what grading produced.
describe("repoGradeScoreWasEdited - A3: the rubric-vs-edited-total decision", () => {
  it("not edited when the current score matches the generated score exactly", () => {
    expect(repoGradeScoreWasEdited("85", "85")).toBe(false);
  });

  it("not edited when the current score is a bare number matching the generated 'earned/possible' form", () => {
    expect(repoGradeScoreWasEdited("85", "85/100")).toBe(false);
  });

  it("not edited when the current score is still the untouched 'earned/possible' form grading left it in", () => {
    expect(repoGradeScoreWasEdited("85/100", "85/100")).toBe(false);
  });

  it("edited when the instructor typed a different number", () => {
    expect(repoGradeScoreWasEdited("90", "85/100")).toBe(true);
  });

  it("edited when generatedScore is null (this cell was never graded via the Grade button)", () => {
    expect(repoGradeScoreWasEdited("85", null)).toBe(true);
  });

  it("edited when the current score is blank or unparseable", () => {
    expect(repoGradeScoreWasEdited("", "85/100")).toBe(true);
    expect(repoGradeScoreWasEdited("not-a-number", "85/100")).toBe(true);
  });

  // SABOTAGE-CHECK ANCHOR: temporarily hardcoding `return false;` (always
  // "not edited," so rubricAreas would always be sent even after a hand
  // edit) was verified to make "edited when the instructor typed a different
  // number" FAIL. The change was reverted after confirming the failure.
});

describe("buildRepoGradePostPlan - A3: rubricAreas is included/omitted based on repoGradeScoreWasEdited", () => {
  const areas = [
    { area: "Correctness", score: "18/20", comment: "ignored - not sent" },
    { area: "Style", score: "5/5", comment: "" },
  ];

  it("includes rubricAreas (area/score/comment:'') when the score was not hand-edited", () => {
    const plan = buildRepoGradePostPlan([row({ score: "85", rubricAreas: areas, generatedScore: "85/100" })], "701");
    expect(plan.postable[0].grade.rubricAreas).toEqual([
      { area: "Correctness", score: "18/20", comment: "" },
      { area: "Style", score: "5/5", comment: "" },
    ]);
  });

  it("omits rubricAreas entirely when the instructor hand-edited the score away from what grading produced", () => {
    const plan = buildRepoGradePostPlan([row({ score: "95", rubricAreas: areas, generatedScore: "85/100" })], "701");
    expect(plan.postable[0].grade).toEqual({ userId: 501, grade: "95" });
    expect("rubricAreas" in plan.postable[0].grade).toBe(false);
  });

  it("omits rubricAreas when there is none to send (never-graded cell, hand-typed score)", () => {
    const plan = buildRepoGradePostPlan([row({ score: "85", rubricAreas: [], generatedScore: null })], "701");
    expect("rubricAreas" in plan.postable[0].grade).toBe(false);
  });

  it("a postable row's rubricAreas and comment are both included together when neither is blank/edited", () => {
    const plan = buildRepoGradePostPlan(
      [row({ score: "85", comment: "Great work", rubricAreas: areas, generatedScore: "85/100" })],
      "701"
    );
    expect(plan.postable[0].grade).toEqual({
      userId: 501,
      grade: "85",
      comment: "Great work",
      rubricAreas: [
        { area: "Correctness", score: "18/20", comment: "" },
        { area: "Style", score: "5/5", comment: "" },
      ],
    });
  });

  // SABOTAGE-CHECK ANCHOR: temporarily changing the guard from
  // `row.rubricAreas.length > 0 && !repoGradeScoreWasEdited(...)` to just
  // `row.rubricAreas.length > 0` (i.e. dropping the edited-check entirely, so
  // a contradictory rubric would always be sent whenever ANY rubric exists)
  // was verified to make "omits rubricAreas entirely when the instructor
  // hand-edited the score" FAIL (rubricAreas would have been present). The
  // change was reverted after confirming the failure.
});

// ---------------------------------------------------------------------------
// The live-defect fix: resolvePostScore (repoGradePostScore.ts) rescales a
// fraction-shaped score onto the assignment's pointsPossible before it posts
// (e.g. "13/16" against a 100-point assignment posts as 81.25) - but the
// RAW rubric areas (e.g. summing to 13) must never ride along with that
// rescaled total, because Canvas applies both `submission[posted_grade]` and
// `rubric_assessment[<criterionId>][points]` in the SAME request
// (src/lib/canvas/grades.ts:83-96), and when the assignment's attached rubric
// is marked use_for_grading, Canvas overwrites the posted grade with the
// rubric's own point sum - silently recording 13/100 instead of 81.25/100.
// A contradictory rubric is worse than none (the same principle already
// governing the hand-edited case above) - so a rescaled total must omit
// rubricAreas exactly as a hand-edited total does, even though the row's
// score was never hand-edited.
describe("buildRepoGradePostPlan - the live-defect fix: a rescaled total never carries a contradicting rubricAreas breakdown", () => {
  const areas = [
    { area: "Correctness", score: "13/16", comment: "" },
    { area: "Style", score: "0/0", comment: "" },
  ];

  it("a rescaled fraction post (scaled onto pointsPossible) carries NO rubricAreas, even though the score was never hand-edited", () => {
    const plan = buildRepoGradePostPlan(
      [row({ score: "13/16", rubricAreas: areas, generatedScore: "13/16" })],
      "701",
      100
    );
    expect(plan.postable[0].grade.grade).toBe("81.25");
    expect("rubricAreas" in plan.postable[0].grade).toBe(false);
  });

  it("a bare-number post (not rescaled) still carries rubricAreas exactly as before, even when pointsPossible is known", () => {
    const plan = buildRepoGradePostPlan(
      [row({ score: "85", rubricAreas: areas, generatedScore: "85/100" })],
      "701",
      100
    );
    expect(plan.postable[0].grade.grade).toBe("85");
    expect(plan.postable[0].grade.rubricAreas).toEqual([
      { area: "Correctness", score: "13/16", comment: "" },
      { area: "Style", score: "0/0", comment: "" },
    ]);
  });

  it("a hand-edited score still suppresses rubricAreas even when the edited score is itself fraction-shaped and would also rescale", () => {
    const plan = buildRepoGradePostPlan(
      [row({ score: "15/16", rubricAreas: areas, generatedScore: "13/16" })],
      "701",
      100
    );
    expect("rubricAreas" in plan.postable[0].grade).toBe(false);
    expect(plan.postable[0].grade.grade).toBe("93.75");
  });

  it("the posted grade string (submission[posted_grade]) is identical with or without this fix - only rubricAreas presence changes", () => {
    const rescaled = buildRepoGradePostPlan(
      [row({ score: "13/16", rubricAreas: areas, generatedScore: "13/16" })],
      "701",
      100
    );
    const notRescaled = buildRepoGradePostPlan(
      [row({ score: "85", rubricAreas: areas, generatedScore: "85/100" })],
      "701",
      100
    );
    const edited = buildRepoGradePostPlan(
      [row({ score: "95", rubricAreas: areas, generatedScore: "85/100" })],
      "701",
      100
    );
    // These numeric grade strings are exactly what repoGradePostability/
    // resolvePostScore already computed before this fix - the fix only ever
    // adds or removes `rubricAreas`, never touches `grade`.
    expect(rescaled.postable[0].grade.grade).toBe("81.25");
    expect(notRescaled.postable[0].grade.grade).toBe("85");
    expect(edited.postable[0].grade.grade).toBe("95");
  });
});

describe("fanOutRepoGradePostResult - AC5 item 30: per-row status after a bulk post", () => {
  const attempted = [
    { repo: "org/a", userId: 1 },
    { repo: "org/b", userId: 2 },
    { repo: "org/c", userId: 3 },
  ];

  it("every failed userId lands on its own row with its own message, and no other row is marked errored", () => {
    const result = { posted: 2, failures: [{ userId: 2, error: "No submission found." }] };
    const fanout = fanOutRepoGradePostResult(attempted, result);
    expect(fanout).toEqual([
      { repo: "org/a", postStatus: "posted", postMessage: null },
      { repo: "org/b", postStatus: "error", postMessage: "No submission found." },
      { repo: "org/c", postStatus: "posted", postMessage: null },
    ]);
  });

  it("multiple distinct failures each land on their own row with their own message", () => {
    const result = {
      posted: 1,
      failures: [
        { userId: 1, error: "Not authorized." },
        { userId: 3, error: "HTTP 500." },
      ],
    };
    const fanout = fanOutRepoGradePostResult(attempted, result);
    expect(fanout).toEqual([
      { repo: "org/a", postStatus: "error", postMessage: "Not authorized." },
      { repo: "org/b", postStatus: "posted", postMessage: null },
      { repo: "org/c", postStatus: "error", postMessage: "HTTP 500." },
    ]);
  });

  it("no failures at all marks every attempted row posted", () => {
    const fanout = fanOutRepoGradePostResult(attempted, { posted: 3, failures: [] });
    expect(fanout.every((f) => f.postStatus === "posted" && f.postMessage === null)).toBe(true);
  });

  it("a whole-request error marks EVERY attempted row errored with that one message", () => {
    const fanout = fanOutRepoGradePostResult(attempted, { error: "Not authorized to post grades." });
    expect(fanout).toEqual([
      { repo: "org/a", postStatus: "error", postMessage: "Not authorized to post grades." },
      { repo: "org/b", postStatus: "error", postMessage: "Not authorized to post grades." },
      { repo: "org/c", postStatus: "error", postMessage: "Not authorized to post grades." },
    ]);
  });

  it("only rows actually in `attempted` are reported - a failure for a userId outside this batch is ignored", () => {
    const result = { posted: 1, failures: [{ userId: 999, error: "unrelated" }] };
    const fanout = fanOutRepoGradePostResult(attempted, result);
    expect(fanout.map((f) => f.repo)).toEqual(["org/a", "org/b", "org/c"]);
    expect(fanout.every((f) => f.postStatus === "posted")).toBe(true);
  });

  it("an empty attempted list yields an empty fan-out even when the result reports failures", () => {
    const fanout = fanOutRepoGradePostResult([], { posted: 0, failures: [{ userId: 1, error: "x" }] });
    expect(fanout).toEqual([]);
  });

  it("never mutates the attempted array", () => {
    const before = [...attempted];
    fanOutRepoGradePostResult(attempted, { posted: 3, failures: [] });
    expect(attempted).toEqual(before);
  });

  // SABOTAGE-CHECK ANCHOR: the failure lookup is keyed by userId, read via
  // Map.get(row.userId) per attempted row. Temporarily changing the lookup to
  // "mark the row at the SAME ARRAY INDEX as any failure errored" (i.e.
  // `failures[i]` instead of `failureByUserId.get(row.userId)`) was verified
  // to make "multiple distinct failures each land on their own row..." FAIL
  // (org/a would incorrectly show errored for the userId-2 failure, since it
  // sits at failures[0] positionally while the real failing student is
  // org/b). The change was reverted after confirming the failure.
  it("two failures for two different users never collapse onto the same row", () => {
    const result = {
      posted: 0,
      failures: [
        { userId: 1, error: "err-a" },
        { userId: 2, error: "err-b" },
      ],
    };
    const fanout = fanOutRepoGradePostResult(attempted, result);
    const byRepo = new Map(fanout.map((f) => [f.repo, f]));
    expect(byRepo.get("org/a")).toEqual({ repo: "org/a", postStatus: "error", postMessage: "err-a" });
    expect(byRepo.get("org/b")).toEqual({ repo: "org/b", postStatus: "error", postMessage: "err-b" });
    expect(byRepo.get("org/c")).toEqual({ repo: "org/c", postStatus: "posted", postMessage: null });
  });
});

describe("repoGradeAssignmentUrl", () => {
  it("builds the assignments URL from a course URL and a numeric assignment id", () => {
    expect(repoGradeAssignmentUrl("https://school.instructure.com/courses/123", "456")).toBe(
      "https://school.instructure.com/courses/123/assignments/456"
    );
  });

  it("works from a deeper course URL (e.g. a modules page)", () => {
    expect(repoGradeAssignmentUrl("https://school.instructure.com/courses/123/modules", "456")).toBe(
      "https://school.instructure.com/courses/123/assignments/456"
    );
  });

  it("returns null for a non-numeric assignment id", () => {
    expect(repoGradeAssignmentUrl("https://school.instructure.com/courses/123", "abc")).toBeNull();
  });

  it("returns null when the course URL has no /courses/<id> segment", () => {
    expect(repoGradeAssignmentUrl("https://school.instructure.com/", "456")).toBeNull();
  });
});
