// RG-SEARCH-STICKY Wave C: frozen oracles for visibleRepoRows (V1-V10) and
// selectionFilterSummary (F1-F4), hand-authored from
// docs/repo-grades-wave-c-test-notes.md sections 3 and 6.
import { describe, it, expect } from "vitest";
import { selectionFilterSummary, visibleRepoRows, type SelectionFilterSummary } from "./repoGradesVisibleRows";
import type { RepoGradeRow } from "./repoGradesRows";
import type { RepoBindingState } from "@/lib/repo-student-bindings";

function mkRow(repo: string, student: string, state: RepoBindingState): RepoGradeRow {
  return {
    repo,
    htmlUrl: "",
    defaultBranch: "main",
    binding: { repo, state, canvasUserId: null, student, candidates: [], derivedHandle: null },
    folders: null,
    folderError: null,
    cells: {},
  };
}

const ROWS: RepoGradeRow[] = [
  mkRow("org/a", "Ada Lovelace", "confirmed"),
  mkRow("org/b", "Bob Jones", "unbound"),
  mkRow("org/c", "Cy Young", "confirmed"),
];

const ids = (rows: RepoGradeRow[]): string[] => rows.map((r) => r.repo.slice(4));
const set = (...v: string[]): Set<string> => new Set(v.map((x) => `org/${x}`));

const ORACLE: Array<[string, string, Set<string>, string[]]> = [
  ["V1", "", set(), ["a", "b", "c"]],
  ["V2", "", set("a", "c"), ["a", "c"]],
  ["V3", "ada", set("a", "c"), ["a"]],
  ["V4", "zzz", set("a", "c"), []],
  ["V5 AND not OR", "bob", set("a", "c"), []],
  ["V6", "", set("a", "b", "c"), ["a", "b", "c"]],
  ["V7", "cy", set("a", "b", "c"), ["c"]],
  ["V8 off-folder", "", new Set(["org/x", "org/y"]), ["a", "b", "c"]],
  ["V9 partial off-folder", "", new Set(["org/a", "org/x"]), ["a"]],
  ["V10", "jones", set(), ["b"]],
];

describe("visibleRepoRows", () => {
  for (const [name, query, gradeSet, expected] of ORACLE) {
    it(name, () => {
      expect(ids(visibleRepoRows(ROWS, query, gradeSet))).toEqual(expected);
    });
  }
});

describe("selectionFilterSummary", () => {
  const CASES: Array<[string, number, number, boolean, SelectionFilterSummary | null]> = [
    ["F1 nothing selected", 3, 0, false, null],
    ["F2 all selected", 3, 3, false, null],
    [
      "F3 filtered",
      3,
      2,
      false,
      {
        mode: "filtered",
        counterText: "Showing 2 of 3 repos (grade-set selection)",
        primaryActionLabel: "Show all rows",
        secondaryActionLabel: "Clear selection",
      },
    ],
    [
      "F4 override",
      3,
      2,
      true,
      {
        mode: "override",
        counterText: "Showing all 3 repos; 2 selected for grading",
        primaryActionLabel: "Filter to selection",
        secondaryActionLabel: "Clear selection",
      },
    ],
  ];
  for (const [name, folderScopedCount, selectedShownCount, showAll, expected] of CASES) {
    it(name, () => {
      expect(selectionFilterSummary({ folderScopedCount, selectedShownCount, showAll })).toEqual(expected);
    });
  }
});
