// RG-SEARCH-STICKY Wave B: the frozen oracle for rowMatchesQuery (AC-F1-1) and
// the AC-F1-2 source pin (the leaf calls the shared name derivation). The
// fixtures and the 5x13 expected table are hand-authored literals from
// docs/repo-grades-wave-b-search-test-notes.md section 3, not computed from the
// implementation.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { rowMatchesQuery } from "./repoGradesSearch";
import type { RepoGradeRow } from "./repoGradesRows";
import type { RepoBindingState } from "@/lib/repo-student-bindings";

function mkRow(repo: string, student: string | null, studentSortable: string | undefined, state: RepoBindingState): RepoGradeRow {
  return {
    repo,
    htmlUrl: "",
    defaultBranch: "main",
    binding: {
      repo,
      state,
      canvasUserId: null,
      student,
      ...(studentSortable === undefined ? {} : { studentSortable }),
      candidates: [],
      derivedHandle: null,
    },
    folders: null,
    folderError: null,
    cells: {},
  };
}

const FIXTURES: Array<[string, RepoGradeRow]> = [
  ["A", mkRow("octo-org/algorithms-alice", null, undefined, "unbound")],
  ["B", mkRow("octo-org/hw-r2", "Jane Doe", undefined, "suggested")],
  ["C", mkRow("octo-org/proj-x", null, "Nakamoto, Satoshi", "confirmed")],
  ["D", mkRow("octo-org/zeta", null, undefined, "ambiguous")],
  ["E", mkRow("octo-org/grp", "Bobby Tables", "Tables, Bob", "suggested")],
];

// query -> expected for rows A..E (1 = match).
const ORACLE: Array<[string, [number, number, number, number, number]]> = [
  ["", [1, 1, 1, 1, 1]],
  ["   ", [1, 1, 1, 1, 1]],
  ["alice", [1, 0, 0, 0, 0]],
  ["octo-org", [1, 1, 1, 1, 1]],
  ["jane", [0, 1, 0, 0, 0]],
  ["DOE", [0, 1, 0, 0, 0]],
  ["nakamoto", [0, 0, 1, 0, 0]],
  ["satoshi", [0, 0, 1, 0, 0]],
  ["unbound", [1, 0, 0, 0, 0]],
  ["confirmed", [0, 0, 1, 0, 0]],
  ["ambiguous", [0, 0, 0, 1, 0]],
  ["bobby", [0, 0, 0, 0, 1]],
  ["zzznomatch", [0, 0, 0, 0, 0]],
];

describe("rowMatchesQuery frozen oracle (5 fixtures x 13 queries)", () => {
  for (const [query, expected] of ORACLE) {
    it(`query ${JSON.stringify(query)}`, () => {
      FIXTURES.forEach(([id, row], i) => {
        expect(rowMatchesQuery(row, query), `row ${id}`).toBe(expected[i] === 1);
      });
    });
  }
});

function withoutLineComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("AC-F1-2: the leaf uses the shared name derivation", () => {
  const SRC = withoutLineComments(readFileSync(join(__dirname, "repoGradesSearch.ts"), "utf8"));
  it("imports deriveRepoGradeStudentName from ./repoGradeStudentName and calls it", () => {
    expect(SRC).toMatch(/import\s*\{[^}]*deriveRepoGradeStudentName[^}]*\}\s*from\s*["']\.\/repoGradeStudentName["']/);
    expect(SRC).toMatch(/deriveRepoGradeStudentName\s*\(/);
  });
});
