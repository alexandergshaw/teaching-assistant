// RG-PERSIST-RESULTS (W5): source-structure pins for the wiring that no
// component render can check (restore placement, persist guard, Discard
// control + confirm) and the one-home rule for the storage key (M4).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Duplicated on purpose (never imported from another test file).
function withoutLineComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

const DIR = __dirname;
const SRC_ROOT = join(DIR, "..", "..", "..");
const indexSource = withoutLineComments(readFileSync(join(DIR, "index.tsx"), "utf8"));
const uiStateSource = withoutLineComments(readFileSync(join(DIR, "repoGradesUiState.ts"), "utf8"));
const leafSource = withoutLineComments(readFileSync(join(DIR, "repoGradesResultsStore.ts"), "utf8"));

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(abs);
  }
  return out;
}

describe("restore wiring (index.tsx)", () => {
  it("the course-change branch restores saved cells for the current course", () => {
    const branchStart = indexSource.indexOf("if (uiState.courseId !== cellStateResetForCourse) {");
    expect(branchStart).toBeGreaterThan(-1);
    const branch = indexSource.slice(branchStart, branchStart + 900);
    expect(branch).toContain("loadRepoGradeCells(uiState.courseId)");
    expect(branch).toContain("setCellEdits(restoredEdits)");
    expect(branch).not.toContain("setCellEdits(EMPTY_REPO_GRADE_CELL_EDITS)");
  });

  it("persists from an effect that returns early until the restore has run", () => {
    const callIdx = indexSource.indexOf("persistRepoGradeCells(uiState.courseId, cellEdits)");
    expect(callIdx).toBeGreaterThan(-1);
    const effectStart = indexSource.lastIndexOf("useEffect(() => {", callIdx);
    const head = indexSource.slice(effectStart, callIdx);
    expect(head).toContain("if (cellStateResetForCourse !== uiState.courseId) return;");
  });

  it("the stale 'never persisted' justification is gone", () => {
    expect(readFileSync(join(DIR, "index.tsx"), "utf8")).not.toContain("never persisted to localStorage");
  });
});

describe("Discard control (M3)", () => {
  it("the handler confirms before clearing, and a control calls it", () => {
    const start = indexSource.indexOf("const handleDiscardSavedResults = () => {");
    expect(start).toBeGreaterThan(-1);
    const body = indexSource.slice(start, start + 700);
    const confirmIdx = body.indexOf("if (!window.confirm(");
    const clearIdx = body.indexOf("clearRepoGradeCells(uiState.courseId)");
    expect(confirmIdx).toBeGreaterThan(-1);
    expect(body).toMatch(/if \(!window\.confirm\([^\n]*\)\) return;/);
    expect(clearIdx).toBeGreaterThan(confirmIdx);
    expect(indexSource).toContain("onClick={handleDiscardSavedResults}");
    expect(indexSource).toContain("Discard saved results for this course");
  });
});

describe("one home for the storage key (M4)", () => {
  it("exactly one non-test source file spells ta-repo-grades-cells", () => {
    const hits = walk(SRC_ROOT, [])
      .filter((abs) => readFileSync(abs, "utf8").includes("ta-repo-grades-cells"))
      .map((abs) => abs.slice(SRC_ROOT.length + 1).split("\\").join("/"));
    expect(hits).toEqual(["app/components/repo-grades/repoGradesUiState.ts"]);
  });

  it("the key is a quoted literal in repoGradesUiState.ts (the canary scan sees it)", () => {
    expect(uiStateSource).toContain('"ta-repo-grades-cells"');
  });

  it("the leaf never touches a storage global and never names a key", () => {
    expect(leafSource).not.toContain("localStorage");
    expect(leafSource).not.toContain("window");
    expect(leafSource).not.toContain('"ta-');
  });
});
