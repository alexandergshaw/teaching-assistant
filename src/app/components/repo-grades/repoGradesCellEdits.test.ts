// Tests for repoGradesCellEdits.ts - the local editable-cell state (AC4 items
// 20-21). The load-bearing guarantee this file pins: editing one (repo,
// folder) cell never bleeds into another folder under the SAME repo, nor into
// the same folder under a DIFFERENT repo - the nested-Record shape and
// setRepoGradeCellEdit's spread pattern exist specifically to make that true.
import { describe, it, expect } from "vitest";
import {
  defaultRepoGradeCellEdit,
  getRepoGradeCellEdit,
  setRepoGradeCellEdit,
  EMPTY_REPO_GRADE_CELL_EDITS,
} from "./repoGradesCellEdits";

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
