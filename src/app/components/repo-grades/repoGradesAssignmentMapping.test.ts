// Tests for repoGradesAssignmentMapping.ts (AC5 items 25-26). Per the
// "Tests written BEFORE implementation" list item 5's spirit (selection
// restore filters out stale ids) and task 1's explicit filtering requirement,
// this file's centerpiece is filterRepoGradeAssignmentMapping: a stale
// mapping entry (renamed folder OR deleted assignment) must never survive a
// restore.
import { describe, it, expect } from "vitest";
import {
  applyRepoGradeAssignmentMapping,
  filterRepoGradeAssignmentMapping,
  setRepoGradeAssignmentMapping,
  EMPTY_REPO_GRADE_ASSIGNMENT_MAP,
} from "./repoGradesAssignmentMapping";
import type { RepoGradeColumn } from "./repoGradesRows";

describe("setRepoGradeAssignmentMapping", () => {
  it("adds a mapping for a folder with no prior entry", () => {
    const next = setRepoGradeAssignmentMapping(EMPTY_REPO_GRADE_ASSIGNMENT_MAP, "week-1", "501");
    expect(next).toEqual({ "week-1": "501" });
  });

  it("overwrites an existing folder's mapping", () => {
    const next = setRepoGradeAssignmentMapping({ "week-1": "501" }, "week-1", "999");
    expect(next).toEqual({ "week-1": "999" });
  });

  it("trims the assignment id before storing it", () => {
    const next = setRepoGradeAssignmentMapping(EMPTY_REPO_GRADE_ASSIGNMENT_MAP, "week-1", "  501  ");
    expect(next).toEqual({ "week-1": "501" });
  });

  it("clears a folder's mapping when given null", () => {
    const next = setRepoGradeAssignmentMapping({ "week-1": "501", "week-2": "502" }, "week-1", null);
    expect(next).toEqual({ "week-2": "502" });
  });

  it("clears a folder's mapping when given a blank string", () => {
    const next = setRepoGradeAssignmentMapping({ "week-1": "501" }, "week-1", "   ");
    expect(next).toEqual({});
  });

  it("leaves every OTHER folder's mapping untouched", () => {
    const before = { "week-1": "501", "week-2": "502", "week-3": "503" };
    const next = setRepoGradeAssignmentMapping(before, "week-2", "999");
    expect(next["week-1"]).toBe("501");
    expect(next["week-3"]).toBe("503");
  });

  it("never mutates the input mapping", () => {
    const before = { "week-1": "501" };
    const beforeCopy = { ...before };
    setRepoGradeAssignmentMapping(before, "week-1", "999");
    expect(before).toEqual(beforeCopy);
  });

  it("clearing an already-unmapped folder returns the SAME reference (no-op)", () => {
    const before = { "week-1": "501" };
    const next = setRepoGradeAssignmentMapping(before, "week-2", null);
    expect(next).toBe(before);
  });
});

describe("applyRepoGradeAssignmentMapping", () => {
  function column(folder: string): RepoGradeColumn {
    return { folder, assignmentId: null };
  }

  it("overlays a mapped assignment id onto its matching column", () => {
    const columns = [column("week-1"), column("week-2")];
    const next = applyRepoGradeAssignmentMapping(columns, { "week-1": "501" });
    expect(next[0]).toEqual({ folder: "week-1", assignmentId: "501" });
    expect(next[1]).toEqual({ folder: "week-2", assignmentId: null });
  });

  it("leaves assignmentId null for a folder with no mapping entry", () => {
    const next = applyRepoGradeAssignmentMapping([column("week-1")], {});
    expect(next[0].assignmentId).toBeNull();
  });

  it("returns a NEW array and does not mutate the input columns", () => {
    const columns = [column("week-1")];
    const next = applyRepoGradeAssignmentMapping(columns, { "week-1": "501" });
    expect(next).not.toBe(columns);
    expect(columns[0].assignmentId).toBeNull();
  });

  it("a mapping entry for a folder that has no matching column is simply ignored", () => {
    const next = applyRepoGradeAssignmentMapping([column("week-1")], { "week-1": "501", "week-99": "999" });
    expect(next).toEqual([{ folder: "week-1", assignmentId: "501" }]);
  });
});

describe("filterRepoGradeAssignmentMapping - AC5 task 1: stale folder or stale assignment id is dropped", () => {
  const columns: Pick<RepoGradeColumn, "folder">[] = [{ folder: "week-1" }, { folder: "week-2" }];
  const assignments = [{ id: "501" }, { id: "502" }];

  it("keeps an entry whose folder AND assignment id are both still valid", () => {
    const next = filterRepoGradeAssignmentMapping({ "week-1": "501" }, columns, assignments);
    expect(next).toEqual({ "week-1": "501" });
  });

  it("drops an entry whose folder no longer exists (a renamed/removed assignment folder)", () => {
    const next = filterRepoGradeAssignmentMapping({ "week-1": "501", "week-99-renamed": "502" }, columns, assignments);
    expect(next).toEqual({ "week-1": "501" });
  });

  it("drops an entry whose assignment id no longer exists (a deleted Canvas assignment)", () => {
    const next = filterRepoGradeAssignmentMapping({ "week-1": "501", "week-2": "999-deleted" }, columns, assignments);
    expect(next).toEqual({ "week-1": "501" });
  });

  it("drops an entry when BOTH the folder and the assignment id are stale", () => {
    const next = filterRepoGradeAssignmentMapping({ "week-99-renamed": "999-deleted" }, columns, assignments);
    expect(next).toEqual({});
  });

  it("keeps every other entry when only one entry is stale", () => {
    const next = filterRepoGradeAssignmentMapping({ "week-1": "501", "week-2": "502", stale: "999" }, columns, assignments);
    expect(next).toEqual({ "week-1": "501", "week-2": "502" });
  });

  it("an empty mapping stays empty", () => {
    expect(filterRepoGradeAssignmentMapping({}, columns, assignments)).toEqual({});
  });

  it("empty columns drops every entry (course switched, nothing scanned yet)", () => {
    const next = filterRepoGradeAssignmentMapping({ "week-1": "501" }, [], assignments);
    expect(next).toEqual({});
  });

  it("empty assignments drops every entry (Canvas assignments not loaded yet, or the course has none)", () => {
    const next = filterRepoGradeAssignmentMapping({ "week-1": "501" }, columns, []);
    expect(next).toEqual({});
  });

  it("returns the SAME reference when nothing was dropped (cheap no-op persistence skip)", () => {
    const before = { "week-1": "501" };
    const next = filterRepoGradeAssignmentMapping(before, columns, assignments);
    expect(next).toBe(before);
  });

  it("never mutates the input mapping", () => {
    const before = { "week-1": "501", stale: "999" };
    const beforeCopy = { ...before };
    filterRepoGradeAssignmentMapping(before, columns, assignments);
    expect(before).toEqual(beforeCopy);
  });
});
