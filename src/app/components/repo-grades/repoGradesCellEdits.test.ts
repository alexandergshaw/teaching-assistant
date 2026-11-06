// Tests for repoGradesCellEdits.ts - the local editable-cell state (AC4 items
// 20-21). The load-bearing guarantee this file pins: editing one (repo,
// folder) cell never bleeds into another folder under the SAME repo, nor into
// the same folder under a DIFFERENT repo - the nested-Record shape and
// setRepoGradeCellEdit's spread pattern exist specifically to make that true.
import { describe, it, expect } from "vitest";
import {
  applyRepoGradeCompletion,
  applyRepoGradeFeedbackFieldEdit,
  applyRetainedRepoGradeDraftEdit,
  defaultRepoGradeCellEdit,
  getRepoGradeCellEdit,
  mergeRepoGradeLiveScores,
  setRepoGradeCellEdit,
  EMPTY_REPO_GRADE_CELL_EDITS,
} from "./repoGradesCellEdits";
import { composeOverallCommentLocal, copyAllFeedbackText } from "../grading-results/gradingResultsHelpers";
import type { RepoGradeRow } from "./repoGradesRows";

describe("applyRepoGradeCompletion", () => {
  const repo = "org/a";
  const folder = "week-1";
  const completion = {
    score: "8/10",
    generatedScore: "8/10",
    comment: "Generated feedback",
    generatedComment: "Generated feedback",
    strengths: "Generated feedback",
    grading: false,
    gradeError: null,
  };

  it("keeps identical conflicting completions separate and preserves the entire current draft", () => {
    let edits = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, repo, folder, {
      score: "7/10", comment: "Instructor draft", draftRevision: 1, postStatus: "posted",
    });
    edits = setRepoGradeCellEdit(edits, repo, "week-2", { score: "4/10" });
    edits = setRepoGradeCellEdit(edits, "org/b", folder, { score: "5/10" });
    const first = applyRepoGradeCompletion(edits, repo, folder, 0, completion);
    const second = applyRepoGradeCompletion(first, repo, folder, 0, completion);
    const { retainedResults, ...draft } = second[repo][folder];
    expect(draft).toEqual(edits[repo][folder]);
    expect(retainedResults).toMatchObject([
      { id: "local:1", source: { generatedScore: "8/10", comment: "Generated feedback" }, draft: null },
      { id: "local:2", source: { generatedScore: "8/10", comment: "Generated feedback" }, draft: null },
    ]);
    expect(first[repo][folder].retainedResults).toEqual([retainedResults?.[0]]);
    expect(second[repo]["week-2"]).toBe(edits[repo]["week-2"]);
    expect(second["org/b"]).toBe(edits["org/b"]);
  });

  it("preserves retained results across ordinary success and allocates the first unused cell-local ID", () => {
    const initial = applyRepoGradeCompletion(EMPTY_REPO_GRADE_CELL_EDITS, repo, folder, 0, completion);
    const truncated = { ...completion, submissionTruncated: true };
    let edits = applyRepoGradeCompletion(initial, repo, folder, 0, truncated);
    edits = applyRepoGradeCompletion(edits, repo, folder, 0, truncated);
    const retained = edits[repo][folder].retainedResults?.slice(1);
    edits = setRepoGradeCellEdit(edits, repo, folder, { retainedResults: retained });
    const updated = applyRepoGradeCompletion(edits, repo, folder, 0, { ...completion, score: "9/10", generatedScore: "9/10" });
    expect(updated[repo][folder].score).toBe("9/10");
    expect(updated[repo][folder].retainedResults).toBe(retained);
    expect(applyRepoGradeCompletion(updated, repo, folder, 0, truncated)[repo][folder].retainedResults?.map(({ id }) => id))
      .toEqual(["local:2", "local:1"]);
  });

  it("clones and deeply freezes source rubric data without freezing the grading payload", () => {
    const rubricAreas = [{ area: "Structure", score: "2/2", comment: "Original rubric" }];
    const edited = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, repo, folder, { draftRevision: 1 });
    const saved = applyRepoGradeCompletion(edited, repo, folder, 0, { ...completion, rubricAreas });
    const source = saved[repo][folder].retainedResults?.[0].source;
    expect(source?.rubricAreas).not.toBe(rubricAreas);
    expect(source?.rubricAreas[0]).not.toBe(rubricAreas[0]);
    expect(Object.isFrozen(source)).toBe(true);
    expect(Object.isFrozen(source?.rubricAreas)).toBe(true);
    expect(Object.isFrozen(source?.rubricAreas[0])).toBe(true);
    rubricAreas[0].comment = "Changed payload";
    expect(source?.rubricAreas[0].comment).toBe("Original rubric");
  });

  it("edits two retained drafts independently, preserving the postable draft and frozen sources", () => {
    const postable = {
      ...defaultRepoGradeCellEdit(), score: "7/10", comment: "Instructor draft",
      draftRevision: 1, postStatus: "posted" as const, postMessage: "Posted",
    };
    const initial = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, repo, folder, postable);
    const rubricAreas = [{ area: "Structure", score: "2/2", comment: "Original rubric" }];
    const once = applyRepoGradeCompletion(initial, repo, folder, 0, { ...completion, rubricAreas });
    const twice = applyRepoGradeCompletion(once, repo, folder, 0, completion);
    const [first, second] = twice[repo][folder].retainedResults!;
    const updatedScore = applyRetainedRepoGradeDraftEdit(twice, repo, folder, first, "score", "9/10");
    const updatedComment = applyRetainedRepoGradeDraftEdit(updatedScore, repo, folder, first, "comment", "Reviewed");
    const updatedStrengths = applyRetainedRepoGradeDraftEdit(updatedComment, repo, folder, first, "strengths", "Clear");
    const updatedImprovements = applyRetainedRepoGradeDraftEdit(updatedStrengths, repo, folder, first, "improvements", "Add tests");
    const updatedNotice = applyRetainedRepoGradeDraftEdit(updatedImprovements, repo, folder, first, "resubmitNotice", "Resubmit");
    const updatedBoth = applyRetainedRepoGradeDraftEdit(updatedNotice, repo, folder, second, "comment", "Other");
    const { retainedResults, ...active } = updatedBoth[repo][folder];

    expect(active).toEqual(postable);
    expect(updatedComment[repo][folder].retainedResults?.[0].draft?.comment).toBe("Reviewed");
    expect(retainedResults).toMatchObject([
      { id: first.id, draft: { score: "9/10", comment: "Clear Add tests Resubmit", strengths: "Clear", improvements: "Add tests", resubmitNotice: "Resubmit" } },
      { id: second.id, draft: { score: "8/10", comment: "Other", strengths: "Generated feedback" } },
    ]);
    expect(retainedResults?.[0].source).toBe(first.source);
    expect(retainedResults?.[1].source).toBe(second.source);
    expect(first.source.rubricAreas).toEqual(rubricAreas);
    expect(updatedScore[repo][folder].retainedResults?.[1]).toBe(second);
    expect(first.draft).toBeNull();
    expect(second.draft).toBeNull();
  });

  it("uses the existing combined copy format for edited sections and falls back to overall-only feedback", () => {
    const initial = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, repo, folder, { draftRevision: 1 });
    const retained = applyRepoGradeCompletion(initial, repo, folder, 0, { ...completion, strengths: "" });
    const [result] = retained[repo][folder].retainedResults!;
    const reviewed = applyRetainedRepoGradeDraftEdit(retained, repo, folder, result, "comment", "Overall only");
    const reviewedDraft = reviewed[repo][folder].retainedResults![0].draft!;
    expect(copyAllFeedbackText({ ...reviewedDraft, overall: reviewedDraft.comment })).toBe("Overall only");

    const sectionEdit = applyRetainedRepoGradeDraftEdit(reviewed, repo, folder, result, "strengths", "Clear");
    const improvementEdit = applyRetainedRepoGradeDraftEdit(sectionEdit, repo, folder, result, "improvements", "Add tests");
    const draft = improvementEdit[repo][folder].retainedResults![0].draft!;
    expect(draft.comment).toBe("Clear Add tests");
    expect(copyAllFeedbackText({ ...draft, overall: draft.comment })).toBe("Clear\n\nAdd tests");

    const manualOverall = applyRetainedRepoGradeDraftEdit(improvementEdit, repo, folder, result, "comment", "Manual overall");
    const manualDraft = manualOverall[repo][folder].retainedResults![0].draft!;
    expect(manualDraft.comment).toBe("Manual overall");
    expect(copyAllFeedbackText({ ...manualDraft, overall: manualDraft.comment })).toBe("Clear\n\nAdd tests");
  });

  it("rejects missing and recycled identities even when an equal result has the same local ID", () => {
    const initial = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, repo, folder, { draftRevision: 1 });
    const previous = applyRepoGradeCompletion(initial, repo, folder, 0, completion);
    const replaced = applyRepoGradeCompletion(initial, repo, folder, 0, completion);
    const oldResult = previous[repo][folder].retainedResults![0];
    const newResult = replaced[repo][folder].retainedResults![0];

    expect(oldResult).toEqual(newResult);
    expect(applyRetainedRepoGradeDraftEdit(replaced, repo, folder, oldResult, "score", "10/10")).toBe(replaced);
    expect(applyRetainedRepoGradeDraftEdit(replaced, repo, folder, { ...newResult, id: "missing" }, "score", "10/10")).toBe(replaced);
    expect(applyRetainedRepoGradeDraftEdit(replaced, "another-repo", folder, newResult, "score", "10/10")).toBe(replaced);
    expect(applyRetainedRepoGradeDraftEdit(replaced, repo, "another-folder", newResult, "score", "10/10")).toBe(replaced);
    expect(applyRetainedRepoGradeDraftEdit(replaced, repo, folder, newResult, "score", newResult.source.score)).toBe(replaced);
  });
});

describe("getRepoGradeCellEdit", () => {
  it("returns the default state for a cell that has never been written", () => {
    expect(getRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, "org/a", "week-1")).toEqual(defaultRepoGradeCellEdit());
  });

  it("returns the default state for a repo that exists but not this folder", () => {
    const edits = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, "org/a", "week-1", { score: "90" });
    expect(getRepoGradeCellEdit(edits, "org/a", "week-2")).toEqual(defaultRepoGradeCellEdit());
  });
});

describe("setRepoGradeCellEdit", () => {
  it("writes a new cell's patch on top of the default state", () => {
    const edits = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, "org/a", "week-1", { score: "90" });
    expect(getRepoGradeCellEdit(edits, "org/a", "week-1")).toEqual({ ...defaultRepoGradeCellEdit(), score: "90" });
  });

  it("merges a patch onto an existing cell's state, keeping untouched fields", () => {
    let edits = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, "org/a", "week-1", { score: "90", comment: "Great" });
    edits = setRepoGradeCellEdit(edits, "org/a", "week-1", { comment: "Even better" });
    expect(getRepoGradeCellEdit(edits, "org/a", "week-1")).toEqual({
      ...defaultRepoGradeCellEdit(),
      score: "90",
      comment: "Even better",
    });
  });

  it("editing one folder under a repo leaves that repo's OTHER folders untouched", () => {
    let edits = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, "org/a", "week-1", { score: "90" });
    edits = setRepoGradeCellEdit(edits, "org/a", "week-2", { score: "70" });
    edits = setRepoGradeCellEdit(edits, "org/a", "week-1", { comment: "updated" });
    expect(getRepoGradeCellEdit(edits, "org/a", "week-1")).toEqual({ ...defaultRepoGradeCellEdit(), score: "90", comment: "updated" });
    expect(getRepoGradeCellEdit(edits, "org/a", "week-2")).toEqual({ ...defaultRepoGradeCellEdit(), score: "70" });
  });

  it("editing one repo's cell leaves a DIFFERENT repo's same-named folder untouched", () => {
    let edits = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, "org/a", "week-1", { score: "90" });
    edits = setRepoGradeCellEdit(edits, "org/b", "week-1", { score: "10" });
    expect(getRepoGradeCellEdit(edits, "org/a", "week-1").score).toBe("90");
    expect(getRepoGradeCellEdit(edits, "org/b", "week-1").score).toBe("10");
  });

  it("setting the posting status on one cell leaves a sibling cell's grading state untouched", () => {
    let edits = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, "org/a", "week-1", { grading: true });
    edits = setRepoGradeCellEdit(edits, "org/a", "week-2", { postStatus: "error", postMessage: "boom" });
    expect(getRepoGradeCellEdit(edits, "org/a", "week-1")).toEqual({ ...defaultRepoGradeCellEdit(), grading: true });
    expect(getRepoGradeCellEdit(edits, "org/a", "week-2")).toEqual({
      ...defaultRepoGradeCellEdit(),
      postStatus: "error",
      postMessage: "boom",
    });
  });

  it("never mutates the input edits object", () => {
    const before = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, "org/a", "week-1", { score: "90" });
    const beforeSnapshot = JSON.parse(JSON.stringify(before));
    setRepoGradeCellEdit(before, "org/a", "week-1", { score: "1" });
    setRepoGradeCellEdit(before, "org/b", "week-1", { score: "2" });
    expect(before).toEqual(beforeSnapshot);
  });

  // SABOTAGE-CHECK ANCHOR: setRepoGradeCellEdit spreads `edits[repo]` before
  // writing the folder key, so other folders under the same repo survive.
  // Temporarily replacing `...(edits[repo] ?? {})` with `{}` (dropping the
  // existing repo's other folders entirely on every write) was verified to
  // make "editing one folder under a repo leaves that repo's OTHER folders
  // untouched" FAIL (week-2's entry disappears after writing week-1). The
  // change was reverted after confirming the failure.
  it("a second write to the same repo's DIFFERENT folder does not remove the first folder's entry from the record", () => {
    let edits = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, "org/a", "week-1", { score: "90" });
    edits = setRepoGradeCellEdit(edits, "org/a", "week-2", { score: "70" });
    expect(Object.keys(edits["org/a"]).sort()).toEqual(["week-1", "week-2"]);
  });
});

// docs/grading-results-feedback-boxes-acceptance-criteria.md, brought to this
// surface after it shipped on GradingResults.tsx first (REGRESSION entry
// 355): `strengths`/`improvements`/`resubmitNotice`/`submittedFiles`/
// `submissionTruncated` are new fields on RepoGradeCellEdit. The
// "backward compatibility" concern the AC document raises (an old stored
// blob missing these fields must degrade to a safe default, never crash or
// invalidate the whole run) does not apply to a PERSISTENCE round-trip here -
// index.tsx's own header comment on `cellEdits` establishes this state is
// NEVER written to localStorage (reset to EMPTY_REPO_GRADE_CELL_EDITS on
// every course switch) - but the identical hazard exists for any caller that
// only supplies a PARTIAL patch (every real caller in this codebase does:
// handleScoreChange patches only `score`, handleGradeCell patches many
// fields but not `postStatus`, etc.). These tests pin that
// defaultRepoGradeCellEdit() - the fallback getRepoGradeCellEdit degrades to
// for any field a caller did not supply - never omits or nulls out the new
// fields, and that reading an old (pre-this-feature-shaped) patch through
// setRepoGradeCellEdit still produces a complete, safe RepoGradeCellEdit
// rather than one missing the new fields.
describe("defaultRepoGradeCellEdit degrades the new feedback/file fields to safe, non-crashing values", () => {
  it("seeds strengths/improvements/resubmitNotice to empty strings and submittedFiles/submissionTruncated to their empty/false defaults", () => {
    const edit = defaultRepoGradeCellEdit();
    expect(edit.strengths).toBe("");
    expect(edit.improvements).toBe("");
    expect(edit.resubmitNotice).toBe("");
    expect(edit.submittedFiles).toEqual([]);
    expect(edit.submissionTruncated).toBe(false);
  });

  it("a cell patched only with fields that predate this feature (e.g. just { score }) still reads back with the new fields at their safe defaults - never undefined, never a crash", () => {
    // Mirrors handleScoreChange's own patch shape (score, postStatus,
    // postMessage only) - a pre-existing caller this feature must not break.
    const edits = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, "org/a", "week-1", {
      score: "90",
      postStatus: "idle",
      postMessage: null,
    });
    const edit = getRepoGradeCellEdit(edits, "org/a", "week-1");
    expect(edit.strengths).toBe("");
    expect(edit.improvements).toBe("");
    expect(edit.resubmitNotice).toBe("");
    expect(edit.submittedFiles).toEqual([]);
    expect(edit.submissionTruncated).toBe(false);
  });

  // Live-defect fix: repo grading has been executing student code since
  // fa057050 (see this field's own doc comment on RepoGradeCellEdit), but
  // neither grading path copied the result onto the cell - `codeExecution`
  // is the fix. Defaults to null (never undefined), same "safe, non-crashing
  // default for any caller that has not been taught about a new field"
  // guarantee the rest of this describe block already pins.
  it("seeds codeExecution to null until a grading call sets it", () => {
    expect(defaultRepoGradeCellEdit().codeExecution).toBeNull();
    const edits = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, "org/a", "week-1", { score: "90" });
    expect(getRepoGradeCellEdit(edits, "org/a", "week-1").codeExecution).toBeNull();
  });
});

// docs/repo-grades-name-columns-and-sorting-acceptance-criteria.md N4 item
// 13: the ONE consolidated copy of the "merge cellEdits scores onto rows"
// helper - RepoGradesGrid.tsx and useRepoGradesGradingActions.ts both used to
// hand-roll this same loop; both now call this function instead.
describe("mergeRepoGradeLiveScores", () => {
  function row(repo: string, cells: Record<string, { status: "ungraded"; score: string }>): RepoGradeRow {
    return {
      repo,
      htmlUrl: `https://github.com/${repo}`,
      defaultBranch: "main",
      binding: { repo, state: "unbound", canvasUserId: null, student: null, candidates: [], derivedHandle: null },
      folders: Object.keys(cells),
      folderError: null,
      cells: Object.fromEntries(
        Object.entries(cells).map(([folder, cell]) => [folder, { ...cell, comment: "", postStatus: "idle" as const }])
      ),
    };
  }

  it("overlays each cell's edited score onto the matching (repo, folder) cell, leaving the raw row's own score untouched as input", () => {
    const rows = [row("org/a", { "week-1": { status: "ungraded", score: "" } })];
    const edits = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, "org/a", "week-1", { score: "18/20" });
    const merged = mergeRepoGradeLiveScores(rows, edits);
    expect(merged[0].cells["week-1"].score).toBe("18/20");
    // The input rows array is not mutated.
    expect(rows[0].cells["week-1"].score).toBe("");
  });

  it("a cell with no edit yet reads back its untouched \"\" score", () => {
    const rows = [row("org/a", { "week-1": { status: "ungraded", score: "" } })];
    const merged = mergeRepoGradeLiveScores(rows, EMPTY_REPO_GRADE_CELL_EDITS);
    expect(merged[0].cells["week-1"].score).toBe("");
  });

  it("merges every folder under a repo independently - editing one never bleeds into a sibling folder", () => {
    const rows = [
      row("org/a", { "week-1": { status: "ungraded", score: "" }, "week-2": { status: "ungraded", score: "" } }),
    ];
    const edits = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, "org/a", "week-1", { score: "90" });
    const merged = mergeRepoGradeLiveScores(rows, edits);
    expect(merged[0].cells["week-1"].score).toBe("90");
    expect(merged[0].cells["week-2"].score).toBe("");
  });

  it("merges every row independently - editing one repo never bleeds into another repo's same-named folder", () => {
    const rows = [row("org/a", { "week-1": { status: "ungraded", score: "" } }), row("org/b", { "week-1": { status: "ungraded", score: "" } })];
    const edits = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, "org/a", "week-1", { score: "90" });
    const merged = mergeRepoGradeLiveScores(rows, edits);
    expect(merged[0].cells["week-1"].score).toBe("90");
    expect(merged[1].cells["week-1"].score).toBe("");
  });
});

describe("applyRepoGradeFeedbackFieldEdit - the ONE writer of `comment` once a cell has feedback boxes", () => {
  it("patches the named field and recomputes `comment` as the composition of all three parts, in order", () => {
    const edit = defaultRepoGradeCellEdit();
    const withStrengths = applyRepoGradeFeedbackFieldEdit(edit, "strengths", "Clean code");
    expect(withStrengths.strengths).toBe("Clean code");
    expect(withStrengths.comment).toBe("Clean code");

    const withImprovements = applyRepoGradeFeedbackFieldEdit(withStrengths, "improvements", "Add tests");
    expect(withImprovements.comment).toBe("Clean code Add tests");

    const withNotice = applyRepoGradeFeedbackFieldEdit(withImprovements, "resubmitNotice", "You may resubmit.");
    expect(withNotice.comment).toBe("Clean code Add tests You may resubmit.");
  });

  it("matches composeOverallCommentLocal exactly - it is not a second, hand-rolled composer", () => {
    const edit = { ...defaultRepoGradeCellEdit(), strengths: "A", improvements: "", resubmitNotice: "C" };
    const result = applyRepoGradeFeedbackFieldEdit(edit, "improvements", "B");
    expect(result.comment).toBe(composeOverallCommentLocal("A", "B", "C"));
  });

  it("drops empty parts rather than leaving stray whitespace or separators", () => {
    const edit = defaultRepoGradeCellEdit();
    const result = applyRepoGradeFeedbackFieldEdit(edit, "strengths", "Only this");
    expect(result.comment).toBe("Only this");
  });

  it("editing one feedback field never touches score, rubricAreas, submittedFiles or any other sibling field on the SAME cell", () => {
    const edit = {
      ...defaultRepoGradeCellEdit(),
      score: "18/20",
      generatedScore: "18/20",
      rubricAreas: [{ area: "Correctness", score: "18/20", comment: "" }],
      submittedFiles: [
        { name: "main.py", extension: "py", previewContent: "print(1)", previewTruncated: false },
      ],
      submissionTruncated: true,
    };
    const result = applyRepoGradeFeedbackFieldEdit(edit, "improvements", "Add comments");
    expect(result.score).toBe("18/20");
    expect(result.generatedScore).toBe("18/20");
    expect(result.rubricAreas).toEqual(edit.rubricAreas);
    expect(result.submittedFiles).toEqual(edit.submittedFiles);
    expect(result.submissionTruncated).toBe(true);
  });

  it("never mutates the input edit object", () => {
    const edit = defaultRepoGradeCellEdit();
    const before = JSON.parse(JSON.stringify(edit));
    applyRepoGradeFeedbackFieldEdit(edit, "strengths", "changed");
    expect(edit).toEqual(before);
  });
});

describe("branch-merge fix: the cell carries the merge outcome (AC-F1)", () => {
  it("an untouched cell has mergeStatus and mergeFoundOnBranch null", () => {
    const d = defaultRepoGradeCellEdit();
    expect(d.mergeStatus).toBeNull();
    expect(d.mergeFoundOnBranch).toBeNull();
  });
});

