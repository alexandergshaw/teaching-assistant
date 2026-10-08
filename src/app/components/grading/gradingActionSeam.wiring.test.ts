import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reads source text; not a render test. REACHABILITY pin: each client file that
// completes a repo / drafted / post / rubric / checklist grading operation must
// route its awaited action through timeGradingAction with the right operation,
// so a covered surface cannot ship with a recorder that never fires.
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
function read(path: string): string {
  return withoutComments(readFileSync(path, "utf-8"));
}

const SITES: Array<{ file: string; operation: string; action: string; count: number; wrapper?: string }> = [
  { file: "src/app/components/GithubGradingPanel.tsx", operation: "generate_rubric", action: "generateRubricFromRepoAction", count: 1 },
  { file: "src/app/components/GithubGradingPanel.tsx", operation: "grade_repos", action: "gradeReposAction", count: 1 },
  { file: "src/app/components/repo-grades/useRepoGradesBulkGrade.ts", operation: "grade_repo", action: "gradeRepoAction", count: 1 },
  { file: "src/app/components/repo-grades/useRepoGradesGradingActions.ts", operation: "grade_repo", action: "gradeRepoAction", count: 1 },
  { file: "src/app/components/repo-grades/useRepoGradesGradingActions.ts", operation: "post_grades", action: "postCanvasGradesAction", count: 2 },
  { file: "src/app/components/GradingResults.tsx", operation: "post_grades", action: "postCanvasGradesAction", count: 2, wrapper: "timePostGrades" },
  { file: "src/app/components/DraftedGradesTab.tsx", operation: "post_draft", action: "postGradingDraftAction", count: 1 },
  { file: "src/app/components/drafted-grades/AssignmentChecklistPanel.tsx", operation: "derive_checklist", action: "deriveAssignmentChecklistAction", count: 1 },
];

describe("grading action seams are wired at the call sites that complete each operation", () => {
  for (const site of SITES) {
    it(`${site.file} times ${site.action} as ${site.operation} (x${site.count})`, () => {
      const src = read(site.file);
      const wrapper = site.wrapper ?? "timeGradingAction";
      expect(src).toMatch(new RegExp(`import [{] ${wrapper} [}] from "[./]+/(grading/)?gradingActionSeam"`));
      const opArg = site.wrapper ? "" : `"${site.operation}", `;
      const wrapped = src.split(`${wrapper}(${opArg}() => ${site.action}(`).length - 1;
      expect(wrapped).toBe(site.count);
      // No bare, un-timed call of the action remains in the file.
      expect(src.split(`await ${site.action}(`).length - 1).toBe(0);
    });
  }
});

describe("the action-seam leaf", () => {
  const leaf = read("src/app/components/grading/gradingActionSeam.ts");

  it("records only through the grading wrapper, never the core directly", () => {
    expect(leaf).toContain("recordGradingDiagnosticEntry(");
    expect(leaf).not.toContain("session-diagnostic-log");
  });

  it("passes only the decided fixed class, never raw result text", () => {
    expect(leaf).toMatch(/error: decision\.error/);
  });
});
