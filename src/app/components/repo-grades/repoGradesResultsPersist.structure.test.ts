// RG-PERSIST-RESULTS (W5): source-structure pins for the wiring that no
// component render can check (control reachability and confirmation) and the one-home rule for the storage key.
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

describe("Discard control (M3)", () => {
  it("confirms before requesting discard for the visible scope", () => {
    const start = indexSource.indexOf("const handleDiscardSavedResults = () => {");
    const end = indexSource.indexOf("\n  };", start);
    const body = indexSource.slice(start, end);
    const confirmAt = body.indexOf("if (!window.confirm(");
    expect(confirmAt).toBeGreaterThan(-1);
    expect(body.indexOf("drafts.discard(cellDraft.scope)")).toBeGreaterThan(confirmAt);
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
