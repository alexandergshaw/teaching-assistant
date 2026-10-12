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
//   1. The name/binding columns are removed from the grid (header and body
//      together) and the name derivation survives only for search.
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
const searchSource = read(`${REPO_GRADES}/repoGradesSearch.ts`);
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

describe("name derivation: the name columns are gone, search still reads the one derivation", () => {
  const MODULE = "\\./repoGradeStudentName";
  const gridCode = gridSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const rowsCode = rowsSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const theadCode = gridCode.slice(gridCode.indexOf("<thead"), gridCode.indexOf("</thead>"));

  it("repoGradesSearch.ts calls deriveRepoGradeStudentName (the derivation survives for search)", () => {
    expect(usesSharedFunction(searchSource, "deriveRepoGradeStudentName", MODULE)).toBe(true);
  });

  it("AC-1: the grid has no First name / Last name / Binding header or body cell", () => {
    expect(theadCode).toContain('field="repo"');
    for (const field of ["firstName", "lastName", "binding"]) {
      expect(theadCode).not.toContain(`field="${field}"`);
    }
    for (const label of ["First name", "Last name", "Binding"]) {
      expect(theadCode).not.toContain(`label="${label}"`);
    }
    expect(gridCode).not.toContain("nameParts");
    expect(gridCode).not.toContain("repoGradeLastNameCellText");
    expect(gridCode).not.toContain("deriveRepoGradeStudentName");
  });

  it("AC-1: no fixed cell is left unpaired - exactly the select and repo cells precede the folder columns", () => {
    const headFixedTh = (theadCode.slice(0, theadCode.indexOf("columns.map")).match(/<th[ >]|<SortableColumnHeader[ >]/g) ?? []).length;
    const bodyStart = gridCode.indexOf("<tr role=\"row\" key={row.repo}>");
    const bodyFixedTd = (gridCode.slice(bodyStart, gridCode.indexOf("columns.map", bodyStart)).match(/<td[ >]/g) ?? []).length;
    expect(headFixedTh).toBe(2);
    expect(bodyFixedTd).toBe(2);
  });

  it("AC-2: the binding control survives only as an unconfirmed-row <details> inside the Repo cell, never in its own cell", () => {
    expect(gridCode).toMatch(/row\.binding\.state !== "confirmed" && \(\s*<details>\s*<summary>Bind student<\/summary>\s*<RepoBindingControl /);
    expect(gridCode).not.toMatch(/<td[^>]*>\s*<RepoBindingControl/);
  });

  it("AC-4: the sort-field set carries no removed column and nothing in the sort module reads a name derivation", () => {
    expect(rowsCode).toMatch(/export type RepoGradeSortField = "repo" \| "folder";/);
    expect(rowsCode).not.toContain("deriveRepoGradeStudentName");
    expect(rowsCode).not.toContain("BINDING_STATE_SORT_PRIORITY");
    expect(rowsCode).not.toContain("repoGradeSortSelectValue");
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
