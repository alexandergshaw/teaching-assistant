// docs/rubric-criteria-breakdown-acceptance-criteria.md, Job A + Job B:
// source-reading guards, each paired with a canary, proving three .tsx
// surfaces actually RENDER the rubric breakdown / its percentage rather than
// merely having a tested-in-isolation helper that nothing ever calls - the
// exact trap the acceptance criteria doc names by name: "the percent helper
// gets exhaustively unit-tested while the .tsx still never mentions
// edit.rubricAreas - which is LITERALLY the current state of this field."
//
// vitest is node-env and collects only src/**/*.test.ts - it never renders a
// component (see src/app/components/repo-grades/repoGrades.wiring.test.ts's
// own header comment for the same limitation elsewhere in this codebase), so
// a text-reading guard, with a canary proving it can actually fail, is the
// only thing that keeps this class of defect caught on a routine run.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const CELL_CONTROL_SOURCE = read("src/app/components/repo-grades/RepoGradeCellControl.tsx");
const GRADING_RESULTS_SOURCE = read("src/app/components/GradingResults.tsx");
const DRAFTED_GRADES_SOURCE = read("src/app/components/DraftedGradesTab.tsx");

/** True when `source` contains a real reference to `edit.rubricAreas` (a
 * `.length` read or a `.map(` call, not merely the word appearing in a
 * comment). */
function readsRubricAreas(source: string): boolean {
  return /edit\.rubricAreas\.length\b/.test(source) || /edit\.rubricAreas\.map\(/.test(source);
}

/** True when `source` both imports formatScorePercent from
 * repoGradeScoreDisplay AND actually calls it (Job B) - not merely imports
 * it unused, and not a hand-rolled percent computation that could drift from
 * the tested helper (B2: reuse, do not reinvent - there are already three
 * near-identical copies of the earned-only score regex in this codebase). */
function usesFormatScorePercent(source: string): boolean {
  const imports = /import\s*\{[^}]*\bformatScorePercent\b[^}]*\}\s*from\s*["'][^"']*repoGradeScoreDisplay["']/.test(
    source
  );
  const calls = /formatScorePercent\(/.test(source);
  return imports && calls;
}

describe("readsRubricAreas (canary: proves the source-reading check actually discriminates)", () => {
  it("reports true when the source maps or length-checks edit.rubricAreas", () => {
    expect(readsRubricAreas("const n = edit.rubricAreas.length;")).toBe(true);
    expect(readsRubricAreas("edit.rubricAreas.map((a) => a.area)")).toBe(true);
  });

  it("reports false when rubricAreas is only mentioned in a comment, never actually read", () => {
    const fixture = "// TODO: render edit.rubricAreas here eventually\nreturn <div />;";
    expect(readsRubricAreas(fixture)).toBe(false);
  });

  it("reports false for a component that receives `edit` but never touches rubricAreas at all - the literal pre-fix state of RepoGradeCellControl.tsx", () => {
    const fixture = "export default function RepoGradeCellControl({ edit }) { return <input value={edit.score} />; }";
    expect(readsRubricAreas(fixture)).toBe(false);
  });
});

describe("usesFormatScorePercent (canary: proves the import+call check actually discriminates)", () => {
  it("reports true when the source imports AND calls formatScorePercent from repoGradeScoreDisplay", () => {
    const fixture =
      'import { formatScorePercent } from "./repo-grades/repoGradeScoreDisplay";\nconst p = formatScorePercent(score);';
    expect(usesFormatScorePercent(fixture)).toBe(true);
  });

  it("reports false when the function is called but never imported from repoGradeScoreDisplay (a hand-rolled reimplementation)", () => {
    const fixture = "function formatScorePercent(s) { return s; }\nconst p = formatScorePercent(score);";
    expect(usesFormatScorePercent(fixture)).toBe(false);
  });

  it("reports false when imported but never called (dead import)", () => {
    const fixture = 'import { formatScorePercent } from "./repo-grades/repoGradeScoreDisplay";';
    expect(usesFormatScorePercent(fixture)).toBe(false);
  });
});

describe("JOB A: RepoGradeCellControl.tsx renders edit.rubricAreas (a dead capability made live)", () => {
  it("actually reads edit.rubricAreas, not just receives it in props", () => {
    expect(readsRubricAreas(CELL_CONTROL_SOURCE)).toBe(true);
  });

  it("also renders a per-area percentage via the shared, tested helper - not a reinvented regex", () => {
    expect(usesFormatScorePercent(CELL_CONTROL_SOURCE)).toBe(true);
  });
});

describe("JOB B: the two pre-existing breakdown surfaces gain a per-criterion percentage", () => {
  it("GradingResults.tsx's per-area score cells call formatScorePercent from the shared, tested helper", () => {
    expect(usesFormatScorePercent(GRADING_RESULTS_SOURCE)).toBe(true);
  });

  it("DraftedGradesTab.tsx's per-area rows call formatScorePercent from the shared, tested helper", () => {
    expect(usesFormatScorePercent(DRAFTED_GRADES_SOURCE)).toBe(true);
  });
});
