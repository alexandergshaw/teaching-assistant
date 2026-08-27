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
  resolveRepoGradeSort,
  toggleRepoGradeSort,
  parseRepoGradeSortState,
  repoGradeSortSelectValue,
  parseRepoGradeSortSelectValue,
  BINDING_STATE_SORT_PRIORITY,
  DEFAULT_REPO_GRADE_SORT,
  type RepoGradeColumn,
  type RepoGradeRow,
  type RepoGradeSortState,
} from "./repoGradesRows";
import { EMPTY_REPO_GRADE_CELL_EDITS, setRepoGradeCellEdit, type RepoGradeCellEditsByRepo } from "./repoGradesCellEdits";
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

  // -------------------------------------------------------------------------
  // docs/repo-grades-name-columns-and-sorting-acceptance-criteria.md N4/N5 -
  // the new sortable columns (firstName, lastName, folder) and the three
  // failure modes (N5 items 15-17) each get their own coverage below.

  function rowWithBinding(repo: string, binding: Partial<RepoBindingSuggestion>): RepoGradeRow {
    return {
      repo,
      htmlUrl: `https://github.com/${repo}`,
      binding: { repo, state: "unbound", canvasUserId: null, student: null, candidates: [], derivedHandle: null, ...binding },
      folders: [],
      folderError: null,
      cells: {},
    };
  }

  describe("firstName / lastName sort - reads deriveRepoGradeStudentName, blanks sort last", () => {
    it("sorts by first name ascending", () => {
      const rows = [
        rowWithBinding("org/a", { student: "Zack Young" }),
        rowWithBinding("org/b", { student: "Ana Ruiz" }),
      ];
      const sorted = sortRepoGradeRows(rows, { field: "firstName", direction: "asc" });
      expect(sorted.map((r) => r.repo)).toEqual(["org/b", "org/a"]);
    });

    it("sorts by last name ascending, preferring studentSortable when present (N2 item 6)", () => {
      const rows = [
        rowWithBinding("org/a", { student: "Ana Ruiz" }), // derived last name "Ruiz"
        rowWithBinding("org/b", { student: "Something Else", studentSortable: "Anderson, Bea" }), // canvas last name "Anderson"
      ];
      const sorted = sortRepoGradeRows(rows, { field: "lastName", direction: "asc" });
      expect(sorted.map((r) => r.repo)).toEqual(["org/b", "org/a"]);
    });

    it("a row with no name (no roster match) sorts LAST on firstName, regardless of direction", () => {
      const rows = [
        rowWithBinding("org/a", { student: "Ana Ruiz" }),
        rowWithBinding("org/b", { student: null }),
      ];
      expect(sortRepoGradeRows(rows, { field: "firstName", direction: "asc" }).map((r) => r.repo)).toEqual(["org/a", "org/b"]);
      expect(sortRepoGradeRows(rows, { field: "firstName", direction: "desc" }).map((r) => r.repo)).toEqual(["org/a", "org/b"]);
    });

    it("a single-token name's UNKNOWN last name sorts LAST on lastName - never as a guessed value", () => {
      const rows = [
        rowWithBinding("org/a", { student: "Ana Ruiz" }), // has a last name
        rowWithBinding("org/b", { student: "Cher" }), // single token - last name unknown
      ];
      expect(sortRepoGradeRows(rows, { field: "lastName", direction: "asc" }).map((r) => r.repo)).toEqual(["org/a", "org/b"]);
      expect(sortRepoGradeRows(rows, { field: "lastName", direction: "desc" }).map((r) => r.repo)).toEqual(["org/a", "org/b"]);
    });
  });

  describe("folder sort - reads cellEdits, blanks/non-numeric/fraction scores all sort sensibly (N4 item 14)", () => {
    function withScore(repo: string, folder: string, score: string): { row: RepoGradeRow; edits: RepoGradeCellEditsByRepo } {
      const row = rowWithBinding(repo, {});
      const edits = setRepoGradeCellEdit(EMPTY_REPO_GRADE_CELL_EDITS, repo, folder, { score });
      return { row, edits };
    }

    it("sorts by a folder's percentage score ascending", () => {
      const a = withScore("org/a", "week-1", "18/20"); // 90%
      const b = withScore("org/b", "week-1", "5/20"); // 25%
      const rows = [a.row, b.row];
      const edits = { ...a.edits, ...b.edits };
      const columns: RepoGradeColumn[] = [{ folder: "week-1", assignmentId: null }];
      const sort: RepoGradeSortState = { field: "folder", folder: "week-1", direction: "asc" };
      expect(sortRepoGradeRows(rows, sort, edits, columns).map((r) => r.repo)).toEqual(["org/b", "org/a"]);
    });

    it("sorts by a folder's percentage score descending", () => {
      const a = withScore("org/a", "week-1", "18/20");
      const b = withScore("org/b", "week-1", "5/20");
      const rows = [a.row, b.row];
      const edits = { ...a.edits, ...b.edits };
      const columns: RepoGradeColumn[] = [{ folder: "week-1", assignmentId: null }];
      const sort: RepoGradeSortState = { field: "folder", folder: "week-1", direction: "desc" };
      expect(sortRepoGradeRows(rows, sort, edits, columns).map((r) => r.repo)).toEqual(["org/a", "org/b"]);
    });

    it("a BLANK score sorts last regardless of direction", () => {
      const graded = withScore("org/a", "week-1", "10/20");
      const blank = withScore("org/b", "week-1", "");
      const rows = [graded.row, blank.row];
      const edits = { ...graded.edits, ...blank.edits };
      const columns: RepoGradeColumn[] = [{ folder: "week-1", assignmentId: null }];
      const asc: RepoGradeSortState = { field: "folder", folder: "week-1", direction: "asc" };
      const desc: RepoGradeSortState = { field: "folder", folder: "week-1", direction: "desc" };
      expect(sortRepoGradeRows(rows, asc, edits, columns).map((r) => r.repo)).toEqual(["org/a", "org/b"]);
      expect(sortRepoGradeRows(rows, desc, edits, columns).map((r) => r.repo)).toEqual(["org/a", "org/b"]);
    });

    it("a NON-NUMERIC score (unparseable as a fraction) sorts last, same as blank", () => {
      const graded = withScore("org/a", "week-1", "10/20");
      const nonNumeric = withScore("org/b", "week-1", "pass");
      const rows = [graded.row, nonNumeric.row];
      const edits = { ...graded.edits, ...nonNumeric.edits };
      const columns: RepoGradeColumn[] = [{ folder: "week-1", assignmentId: null }];
      const sort: RepoGradeSortState = { field: "folder", folder: "week-1", direction: "asc" };
      expect(sortRepoGradeRows(rows, sort, edits, columns).map((r) => r.repo)).toEqual(["org/a", "org/b"]);
    });

    it("a FRACTION-shaped score with a different denominator still compares by PERCENTAGE, not the raw numerator", () => {
      // 9/10 (90%) should outrank 18/20 (90%, tie) which should outrank 5/40 (12.5%).
      const a = withScore("org/a", "week-1", "9/10");
      const b = withScore("org/b", "week-1", "5/40");
      const rows = [a.row, b.row];
      const edits = { ...a.edits, ...b.edits };
      const columns: RepoGradeColumn[] = [{ folder: "week-1", assignmentId: null }];
      const sort: RepoGradeSortState = { field: "folder", folder: "week-1", direction: "asc" };
      expect(sortRepoGradeRows(rows, sort, edits, columns).map((r) => r.repo)).toEqual(["org/b", "org/a"]);
    });

    it("a row whose folder cell was never edited (default \"\" score) sorts last, same as an explicit blank", () => {
      const graded = withScore("org/a", "week-1", "10/20");
      const untouched = rowWithBinding("org/b", {});
      const rows = [graded.row, untouched];
      const columns: RepoGradeColumn[] = [{ folder: "week-1", assignmentId: null }];
      const sort: RepoGradeSortState = { field: "folder", folder: "week-1", direction: "asc" };
      expect(sortRepoGradeRows(rows, sort, graded.edits, columns).map((r) => r.repo)).toEqual(["org/a", "org/b"]);
    });
  });

  describe("resolveRepoGradeSort - N5 item 17: a folder sort naming a column the current course lacks degrades to the default", () => {
    it("passes through every non-folder sort unchanged", () => {
      const sort: RepoGradeSortState = { field: "binding", direction: "desc" };
      expect(resolveRepoGradeSort(sort, [])).toEqual(sort);
    });

    it("passes through a folder sort naming a column that IS in the current column set", () => {
      const sort: RepoGradeSortState = { field: "folder", folder: "week-1", direction: "asc" };
      const columns: RepoGradeColumn[] = [{ folder: "week-1", assignmentId: null }];
      expect(resolveRepoGradeSort(sort, columns)).toEqual(sort);
    });

    it("degrades a folder sort naming a column NOT in the current column set to the default", () => {
      const sort: RepoGradeSortState = { field: "folder", folder: "week-9", direction: "asc" };
      const columns: RepoGradeColumn[] = [{ folder: "week-1", assignmentId: null }];
      expect(resolveRepoGradeSort(sort, columns)).toEqual(DEFAULT_REPO_GRADE_SORT);
    });

    it("degrades a folder sort with no folder set at all", () => {
      const sort = { field: "folder", direction: "asc" } as RepoGradeSortState;
      expect(resolveRepoGradeSort(sort, [{ folder: "week-1", assignmentId: null }])).toEqual(DEFAULT_REPO_GRADE_SORT);
    });
  });

  describe("toggleRepoGradeSort - the one decision a header click makes", () => {
    it("starts a new ascending sort when clicking a field that is not already active", () => {
      expect(toggleRepoGradeSort(DEFAULT_REPO_GRADE_SORT, "binding")).toEqual({ field: "binding", direction: "asc" });
    });

    it("flips direction when clicking the already-active field", () => {
      const sort: RepoGradeSortState = { field: "repo", direction: "asc" };
      expect(toggleRepoGradeSort(sort, "repo")).toEqual({ field: "repo", direction: "desc" });
      expect(toggleRepoGradeSort({ field: "repo", direction: "desc" }, "repo")).toEqual({ field: "repo", direction: "asc" });
    });

    it("a folder click starts a new ascending sort on that folder, even when a DIFFERENT folder was already active", () => {
      const sort: RepoGradeSortState = { field: "folder", folder: "week-1", direction: "desc" };
      expect(toggleRepoGradeSort(sort, "folder", "week-2")).toEqual({ field: "folder", folder: "week-2", direction: "asc" });
    });

    it("a folder click on the SAME folder flips direction", () => {
      const sort: RepoGradeSortState = { field: "folder", folder: "week-1", direction: "asc" };
      expect(toggleRepoGradeSort(sort, "folder", "week-1")).toEqual({ field: "folder", folder: "week-1", direction: "desc" });
    });
  });

  describe("parseRepoGradeSortState - never trusts stored data (mirrors parseTaskSortState)", () => {
    it("falls back to the default for null/empty", () => {
      expect(parseRepoGradeSortState(null)).toEqual(DEFAULT_REPO_GRADE_SORT);
      expect(parseRepoGradeSortState("")).toEqual(DEFAULT_REPO_GRADE_SORT);
    });

    it("falls back to the default for malformed JSON", () => {
      expect(parseRepoGradeSortState("{not json")).toEqual(DEFAULT_REPO_GRADE_SORT);
    });

    it("round-trips every plain field", () => {
      for (const field of ["repo", "binding", "firstName", "lastName"] as const) {
        const sort: RepoGradeSortState = { field, direction: "desc" };
        expect(parseRepoGradeSortState(JSON.stringify(sort))).toEqual(sort);
      }
    });

    it("round-trips a folder sort with its folder name", () => {
      const sort: RepoGradeSortState = { field: "folder", folder: "week-1", direction: "asc" };
      expect(parseRepoGradeSortState(JSON.stringify(sort))).toEqual(sort);
    });

    it("degrades a folder sort with a blank/missing folder to the default", () => {
      expect(parseRepoGradeSortState(JSON.stringify({ field: "folder", folder: "", direction: "asc" }))).toEqual(
        DEFAULT_REPO_GRADE_SORT
      );
      expect(parseRepoGradeSortState(JSON.stringify({ field: "folder", direction: "asc" }))).toEqual(DEFAULT_REPO_GRADE_SORT);
    });

    it("degrades an unrecognised field to the default", () => {
      expect(parseRepoGradeSortState(JSON.stringify({ field: "score", direction: "asc" }))).toEqual(DEFAULT_REPO_GRADE_SORT);
    });
  });

  describe("repoGradeSortSelectValue / parseRepoGradeSortSelectValue - N5 item 15: the Sort <select> and the header sort must agree", () => {
    it("encodes every plain field as \"field:direction\"", () => {
      expect(repoGradeSortSelectValue({ field: "repo", direction: "asc" })).toBe("repo:asc");
      expect(repoGradeSortSelectValue({ field: "firstName", direction: "desc" })).toBe("firstName:desc");
    });

    it("encodes a folder sort (which the select cannot list) as the 'custom' placeholder - NOT as a mismatched, and NOT coerced to 'repo'", () => {
      expect(repoGradeSortSelectValue({ field: "folder", folder: "week-1", direction: "asc" })).toBe("custom");
    });

    it("decodes every plain field back losslessly", () => {
      expect(parseRepoGradeSortSelectValue("binding:desc")).toEqual({ field: "binding", direction: "desc" });
      expect(parseRepoGradeSortSelectValue("lastName:asc")).toEqual({ field: "lastName", direction: "asc" });
    });

    it("the 'custom' placeholder decodes to the default rather than being selectable in practice (it is rendered disabled)", () => {
      expect(parseRepoGradeSortSelectValue("custom")).toEqual(DEFAULT_REPO_GRADE_SORT);
    });

    it("canary for the exact N5 item 15 regression: an unrecognised value never silently becomes a DIFFERENT field's sort", () => {
      // The old parseSortValue coerced anything unrecognised to "repo" - this
      // proves the new decoder degrades to the DEFAULT instead, which for
      // "repo:asc" happens to look the same, so this pins it against a value
      // that would have exposed the old bug if "binding" had been the default.
      const result = parseRepoGradeSortSelectValue("firstName-typo:asc");
      expect(result).toEqual(DEFAULT_REPO_GRADE_SORT);
      expect(result.field).not.toBe("firstName");
    });
  });
});
