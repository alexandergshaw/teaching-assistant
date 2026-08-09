// Tests for repoGradesRows.ts - the Repo Grades grid's pure row/column model
// (docs/repo-grades-view-acceptance-criteria.md AC3/AC4). Per the "Tests
// written BEFORE implementation" list, items 2 (folder discovery reuse) and
// the AC3 item 15 "missing folder vs ungraded" distinction are the two facts
// this file exists to pin - suggestRepoStudentBindings itself already has
// its own coverage in src/lib/repo-student-bindings.test.ts and is reused
// here verbatim, not re-tested.
import { describe, it, expect } from "vitest";
import {
  applyRepoGradeBinding,
  buildRepoGradeColumns,
  buildRepoGradeGridModel,
  buildRepoGradeRows,
  sortRepoGradeRows,
  BINDING_STATE_SORT_PRIORITY,
  DEFAULT_REPO_GRADE_SORT,
  type RepoGradeColumn,
  type RepoGradeRow,
} from "./repoGradesRows";
import type { RepoFolderRow } from "@/lib/repo-grade-tree-scan";
import type { CourseStudentRepo } from "@/lib/supabase/courses";
import type { RepoBindingRosterEntry, RepoBindingSuggestion } from "@/lib/repo-student-bindings";

function repoRow(repo: string, folders: string[] | null, error: string | null = null): RepoFolderRow {
  return { repo, htmlUrl: `https://github.com/${repo}`, folders, error };
}

describe("buildRepoGradeColumns", () => {
  it("unions every repo's folders, deduped", () => {
    const columns = buildRepoGradeColumns([
      repoRow("org/a", ["week-1", "week-2"]),
      repoRow("org/b", ["week-2", "week-3"]),
    ]);
    expect(columns.map((c) => c.folder)).toEqual(["week-1", "week-2", "week-3"]);
  });

  it("sorts naturally so week-2 precedes week-10 (matches assignmentFoldersFromTree)", () => {
    const columns = buildRepoGradeColumns([repoRow("org/a", ["week-10", "week-2", "week-1"])]);
    expect(columns.map((c) => c.folder)).toEqual(["week-1", "week-2", "week-10"]);
  });

  it("a repo with a failed scan (folders null) contributes nothing to the union", () => {
    const columns = buildRepoGradeColumns([repoRow("org/a", null, "boom"), repoRow("org/b", ["week-1"])]);
    expect(columns.map((c) => c.folder)).toEqual(["week-1"]);
  });

  it("an empty repo list yields an empty column set", () => {
    expect(buildRepoGradeColumns([])).toEqual([]);
  });

  it("every column starts with no mapped assignment (next wave's hook, unset this wave)", () => {
    const columns = buildRepoGradeColumns([repoRow("org/a", ["week-1"])]);
    expect(columns[0].assignmentId).toBeNull();
  });
});

describe("buildRepoGradeRows - AC3 item 15: missing-folder vs ungraded vs scan-error are distinct", () => {
  const columns: RepoGradeColumn[] = [
    { folder: "week-1", assignmentId: null },
    { folder: "week-2", assignmentId: null },
  ];

  function binding(repo: string): RepoBindingSuggestion {
    return { repo, state: "unbound", canvasUserId: null, student: null, candidates: [], derivedHandle: "x" };
  }

  it("a folder present in this repo is 'ungraded', never 'missing-folder'", () => {
    const rows = buildRepoGradeRows([repoRow("org/a", ["week-1", "week-2"])], [binding("org/a")], columns);
    expect(rows[0].cells["week-1"].status).toBe("ungraded");
    expect(rows[0].cells["week-2"].status).toBe("ungraded");
  });

  it("a folder absent from this repo (but present in another) is 'missing-folder', never 'ungraded'", () => {
    const rows = buildRepoGradeRows([repoRow("org/a", ["week-1"])], [binding("org/a")], columns);
    expect(rows[0].cells["week-1"].status).toBe("ungraded");
    expect(rows[0].cells["week-2"].status).toBe("missing-folder");
  });

  it("a repo whose tree fetch failed (folders null) reports 'scan-error' for every column, never 'missing-folder'", () => {
    const rows = buildRepoGradeRows([repoRow("org/a", null, "rate limited")], [binding("org/a")], columns);
    expect(rows[0].cells["week-1"].status).toBe("scan-error");
    expect(rows[0].cells["week-2"].status).toBe("scan-error");
    expect(rows[0].folderError).toBe("rate limited");
  });

  it("every cell carries the score/comment/postStatus hook shape, inert this wave", () => {
    const rows = buildRepoGradeRows([repoRow("org/a", ["week-1"])], [binding("org/a")], columns);
    expect(rows[0].cells["week-1"]).toEqual({ status: "ungraded", score: "", comment: "", postStatus: "idle" });
  });

  it("throws when a repo has no matching binding (misuse guard - buildRepoGradeGridModel never triggers this)", () => {
    expect(() => buildRepoGradeRows([repoRow("org/a", [])], [], columns)).toThrow(/no binding suggestion/);
  });
});

describe("buildRepoGradeGridModel - integration with suggestRepoStudentBindings", () => {
  const roster: RepoBindingRosterEntry[] = [{ id: "501", name: "Jane Doe", loginId: "jdoe" }];
  const stored: CourseStudentRepo[] = [];

  it("wires a suggested binding through end to end from a repo name", () => {
    const model = buildRepoGradeGridModel(
      [repoRow("acme-course/module-jdoe", ["week-1"])],
      roster,
      stored,
      "module"
    );
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0].binding.state).toBe("suggested");
    expect(model.rows[0].binding.student).toBe("Jane Doe");
    expect(model.columns.map((c) => c.folder)).toEqual(["week-1"]);
  });

  it("a stored full-name match confirms outright, bypassing derivation", () => {
    const confirmedStored: CourseStudentRepo[] = [
      { student: "Jane Doe", canvasUserId: "501", repo: "acme-course/module-jdoe", username: null, email: null },
    ];
    const model = buildRepoGradeGridModel(
      [repoRow("acme-course/module-jdoe", ["week-1"])],
      roster,
      confirmedStored,
      "module"
    );
    expect(model.rows[0].binding.state).toBe("confirmed");
    expect(model.rows[0].binding.canvasUserId).toBe("501");
  });
});

describe("applyRepoGradeBinding - AC2 item 10 write-back shape", () => {
  it("appends a new row when the repo is not already present", () => {
    const next = applyRepoGradeBinding([], "org/repo-a", "501", "Jane Doe", null);
    expect(next).toEqual([{ student: "Jane Doe", canvasUserId: "501", repo: "org/repo-a", username: null, email: null }]);
  });

  it("updates the existing row for that repo, matched case-insensitively and trimmed", () => {
    const existing: CourseStudentRepo[] = [
      { student: "", canvasUserId: null, repo: " Org/Repo-A ", username: null, email: "jane@example.edu" },
    ];
    const next = applyRepoGradeBinding(existing, "org/repo-a", "501", "Jane Doe", null);
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({
      student: "Jane Doe",
      canvasUserId: "501",
      repo: " Org/Repo-A ",
      username: null,
      email: "jane@example.edu",
    });
  });

  it("preserves every OTHER row verbatim", () => {
    const existing: CourseStudentRepo[] = [
      { student: "Other Student", canvasUserId: "9", repo: "org/repo-b", username: "other", email: null },
    ];
    const next = applyRepoGradeBinding(existing, "org/repo-a", "501", "Jane Doe", null);
    expect(next).toContainEqual(existing[0]);
    expect(next).toHaveLength(2);
  });

  it("a null username preserves the existing row's prior username rather than clearing it", () => {
    const existing: CourseStudentRepo[] = [
      { student: "", canvasUserId: null, repo: "org/repo-a", username: "jdoe-prior", email: null },
    ];
    const next = applyRepoGradeBinding(existing, "org/repo-a", "501", "Jane Doe", null);
    expect(next[0].username).toBe("jdoe-prior");
  });

  it("a provided username overrides the prior stored value", () => {
    const existing: CourseStudentRepo[] = [
      { student: "", canvasUserId: null, repo: "org/repo-a", username: "jdoe-prior", email: null },
    ];
    const next = applyRepoGradeBinding(existing, "org/repo-a", "501", "Jane Doe", "jdoe-confirmed");
    expect(next[0].username).toBe("jdoe-confirmed");
  });
});

describe("sortRepoGradeRows", () => {
  function row(repo: string, state: RepoBindingSuggestion["state"]): RepoGradeRow {
    return {
      repo,
      htmlUrl: `https://github.com/${repo}`,
      binding: { repo, state, canvasUserId: state === "confirmed" ? "1" : null, student: null, candidates: [], derivedHandle: null },
      folders: [],
      folderError: null,
      cells: {},
    };
  }

  it("defaults to repo name ascending", () => {
    expect(DEFAULT_REPO_GRADE_SORT).toEqual({ field: "repo", direction: "asc" });
  });

  it("sorts by repo name naturally (week-2 before week-10 within the repo string)", () => {
    const rows = [row("org/week-10", "confirmed"), row("org/week-2", "confirmed")];
    const sorted = sortRepoGradeRows(rows, { field: "repo", direction: "asc" });
    expect(sorted.map((r) => r.repo)).toEqual(["org/week-2", "org/week-10"]);
  });

  it("repo sort reverses cleanly under 'desc'", () => {
    const rows = [row("org/a", "confirmed"), row("org/b", "confirmed")];
    const sorted = sortRepoGradeRows(rows, { field: "repo", direction: "desc" });
    expect(sorted.map((r) => r.repo)).toEqual(["org/b", "org/a"]);
  });

  it("binding sort (asc) surfaces unbound, then ambiguous, then suggested, then confirmed", () => {
    const rows = [row("org/c", "confirmed"), row("org/a", "unbound"), row("org/d", "suggested"), row("org/b", "ambiguous")];
    const sorted = sortRepoGradeRows(rows, { field: "binding", direction: "asc" });
    expect(sorted.map((r) => r.binding.state)).toEqual(["unbound", "ambiguous", "suggested", "confirmed"]);
  });

  it("binding sort (desc) reverses the priority order", () => {
    const rows = [row("org/a", "unbound"), row("org/b", "confirmed")];
    const sorted = sortRepoGradeRows(rows, { field: "binding", direction: "desc" });
    expect(sorted.map((r) => r.binding.state)).toEqual(["confirmed", "unbound"]);
  });

  it("ties within the same binding state break by repo name", () => {
    const rows = [row("org/z", "unbound"), row("org/a", "unbound")];
    const sorted = sortRepoGradeRows(rows, { field: "binding", direction: "asc" });
    expect(sorted.map((r) => r.repo)).toEqual(["org/a", "org/z"]);
  });

  it("never mutates the input array", () => {
    const rows = [row("org/b", "confirmed"), row("org/a", "confirmed")];
    const original = [...rows];
    sortRepoGradeRows(rows, { field: "repo", direction: "asc" });
    expect(rows).toEqual(original);
  });

  it("BINDING_STATE_SORT_PRIORITY covers exactly the four binding states, each with a distinct rank", () => {
    const values = Object.values(BINDING_STATE_SORT_PRIORITY);
    expect(new Set(values).size).toBe(4);
    expect(Object.keys(BINDING_STATE_SORT_PRIORITY).sort()).toEqual(["ambiguous", "confirmed", "suggested", "unbound"]);
  });
});
