// Guards for docs/repo-grades-name-columns-and-sorting-acceptance-criteria.md
// (first/last name columns and sortable columns). vitest is node-env and
// collects only src/**/*.test.ts, so nothing in RepoGradesGrid.tsx,
// repoGradesRows.ts, or useRepoGradesGradingActions.ts is ever exercised by
// rendering - these guards read them as TEXT instead, the same idiom
// repoGrades.wiring.test.ts and repoGradesSliceA.guards.test.ts already
// established for this exact class of "implemented but not actually wired
// the safe way" risk.
//
// Two facts this file exists to prove, each with a canary BEFORE the real
// file is trusted (REGRESSION entry 239 check 10: "a structural assertion
// without a canary is worthless"):
//
//   1. N5 item 16 - the grid's name cells and repoGradesRows.ts's sort key
//      read the SAME derivation (deriveRepoGradeStudentName), not two
//      independent re-implementations of the split rules that could drift
//      apart and sort by something other than what the table displays.
//   2. N4 item 13 - the "merge cellEdits scores onto rows" helper has ONE
//      copy (mergeRepoGradeLiveScores, repoGradesCellEdits.ts), not a
//      second/third hand-rolled loop in RepoGradesGrid.tsx or
//      useRepoGradesGradingActions.ts.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const REPO_GRADES = "src/app/components/repo-grades";
const gridSource = read(`${REPO_GRADES}/RepoGradesGrid.tsx`);
const rowsSource = read(`${REPO_GRADES}/repoGradesRows.ts`);
const gradingActionsSource = read(`${REPO_GRADES}/useRepoGradesGradingActions.ts`);
const cellEditsSource = read(`${REPO_GRADES}/repoGradesCellEdits.ts`);

/** Borrowed verbatim from repoGrades.wiring.test.ts / repoGradesSliceA.guards.test.ts
 * rather than reinvented: requires the named import AND at least one call
 * site, so a type-only import, a commented-out import, or a local
 * reimplementation under the same name cannot satisfy this. */
function usesSharedFunction(text: string, symbolName: string, fromModule: string): boolean {
  const importPattern = new RegExp(`import\\s*\\{[^}]*\\b${symbolName}\\b[^}]*\\}\\s*from\\s*["']${fromModule}["']`);
  return importPattern.test(text) && text.includes(`${symbolName}(`);
}

describe("canary: usesSharedFunction actually discriminates", () => {
  const MODULE = "\\./repoGradeStudentName";

  it("import plus call site passes", () => {
    const wired =
      'import { deriveRepoGradeStudentName } from "./repoGradeStudentName";\n' +
      "const parts = deriveRepoGradeStudentName(row.binding.student, row.binding.studentSortable);";
    expect(usesSharedFunction(wired, "deriveRepoGradeStudentName", MODULE)).toBe(true);
  });

  it("an import with no call site does not pass (dead import)", () => {
    const deadImport = 'import { deriveRepoGradeStudentName } from "./repoGradeStudentName";';
    expect(usesSharedFunction(deadImport, "deriveRepoGradeStudentName", MODULE)).toBe(false);
  });

  it("a local re-implementation under the same name, with no import, does not pass", () => {
    const local =
      "function deriveRepoGradeStudentName(s) { return s; }\n" + "deriveRepoGradeStudentName(row.binding.student);";
    expect(usesSharedFunction(local, "deriveRepoGradeStudentName", MODULE)).toBe(false);
  });

  it("a type-only import does not pass (the import group must carry the value name as a real, non-type-only specifier)", () => {
    // usesSharedFunction's regex matches `import { X }` and `import { type X }`
    // both syntactically, but a type-only import can never satisfy the
    // SECOND half of the check in practice (calling a type as a function is
    // a compile error) - this canary documents that the call-site half is
    // what actually closes this hole, not the import pattern alone.
    const typeOnly = 'import type { deriveRepoGradeStudentName } from "./repoGradeStudentName";';
    expect(usesSharedFunction(typeOnly, "deriveRepoGradeStudentName", MODULE)).toBe(false);
  });
});

describe("N5 item 16: the name cells and the sort key read the SAME derivation", () => {
  const MODULE = "\\./repoGradeStudentName";

  it("RepoGradesGrid.tsx's name cells call deriveRepoGradeStudentName", () => {
    expect(usesSharedFunction(gridSource, "deriveRepoGradeStudentName", MODULE)).toBe(true);
  });

  it("repoGradesRows.ts's sort key calls deriveRepoGradeStudentName", () => {
    expect(usesSharedFunction(rowsSource, "deriveRepoGradeStudentName", MODULE)).toBe(true);
  });

  it("the last-name SORT KEY reads the raw `.lastName` field, never repoGradeLastNameCellText's em-dash display substitution - a 'single token' row must sort as blank, not as a fixed dash string", () => {
    // A cheap but load-bearing text check: the sort module may import
    // repoGradeLastNameCellText for other reasons in the future, but its
    // sortFieldValue function itself must read `.lastName` directly.
    expect(rowsSource).toMatch(/parts\.lastName/);
  });
});

describe("N4 item 13: mergeRepoGradeLiveScores has exactly ONE implementation, reused everywhere", () => {
  const MODULE = "\\./repoGradesCellEdits";

  it("repoGradesCellEdits.ts actually defines mergeRepoGradeLiveScores (the one real copy)", () => {
    expect(cellEditsSource).toMatch(/export function mergeRepoGradeLiveScores\(/);
  });

  it("RepoGradesGrid.tsx calls the shared mergeRepoGradeLiveScores, not a local re-implementation", () => {
    expect(usesSharedFunction(gridSource, "mergeRepoGradeLiveScores", MODULE)).toBe(true);
  });

  it("useRepoGradesGradingActions.ts calls the shared mergeRepoGradeLiveScores, not its old private withLiveScores copy", () => {
    expect(usesSharedFunction(gradingActionsSource, "mergeRepoGradeLiveScores", MODULE)).toBe(true);
  });

  it("neither file still defines its own local merge function (the exact duplication N4 item 13 closes)", () => {
    // The old bug shape: `function withLiveScores(` or an inline
    // `rows.map(...)` loop reassigning `cells[folder] = { ...cell, score: ... }`
    // outside of repoGradesCellEdits.ts. Pinning the absence of the OLD named
    // function is the direct, unambiguous check; a broader structural search
    // for "any loop that merges a score" would be too fragile to maintain.
    expect(gridSource).not.toMatch(/function\s+withLiveScores\s*\(/);
    expect(gradingActionsSource).not.toMatch(/function\s+withLiveScores\s*\(/);
  });
});
