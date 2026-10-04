// RG-SEARCH-STICKY Wave C: source pins (docs/repo-grades-wave-c-test-notes.md
// sections 1, 4, 5, 6). Nothing renders under vitest, so these prove the
// STRUCTURE: every grade-plan site routes through resolveGradeScope, the
// typeahead owns no selection state, and both selection surfaces share one
// toggle handler. Keyboard, ARIA and the on-screen counter are an owner walk.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (name: string): string => readFileSync(join(__dirname, name), "utf8");

function withoutLineComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

/** The text from `start` to the first `end` after it; both anchors must resolve. */
function slice(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  expect(a, `anchor ${start}`).toBeGreaterThan(-1);
  const b = src.indexOf(end, a);
  expect(b, `end anchor ${end} after ${start}`).toBeGreaterThan(a);
  return src.slice(a, b);
}

const INDEX = withoutLineComments(read("index.tsx"));
const HOME = withoutLineComments(read("RepoGradesGradeSetTypeahead.tsx"));
const RUNBAR = withoutLineComments(read("RepoGradesRunBar.tsx"));
const GRID = withoutLineComments(read("RepoGradesGrid.tsx"));
const ACTIONS = withoutLineComments(read("useRepoGradesGradingActions.ts"));
const HEADER = withoutLineComments(read("RepoGradesStickyHeader.tsx"));

describe("F3-c: every grade-plan site routes through resolveGradeScope", () => {
  for (const [name, src] of [
    ["useRepoGradesGradingActions.ts", ACTIONS],
    ["RepoGradesRunBar.tsx", RUNBAR],
    ["RepoGradesGrid.tsx", GRID],
  ] as const) {
    it(`${name} imports and calls it, with no bare pre-F3-c expression`, () => {
      expect(src).toMatch(/import\s*\{[^}]*resolveGradeScope[^}]*\}\s*from\s*["']\.\/repoGradesGradeSet["']/);
      expect(src).toContain("resolveGradeScope(selected, bulkSelectionOnly)");
      expect(src).not.toContain("selectionOnly: bulkSelectionOnly");
      expect(src).not.toContain("scopedToSelection: bulkSelectionOnly && selected.size > 0");
      expect(src).not.toContain("const scopedToSelection = bulkSelectionOnly && selected.size > 0");
    });
  }

  it("the two label sites read scopedToSelection off the resolved scope", () => {
    expect(RUNBAR).toContain("gradeScope.scopedToSelection");
    expect(GRID).toContain("gradeScope.scopedToSelection");
  });
});

describe("AC-F3-2: one toggle source of truth", () => {
  it("A: index.tsx toggleSelected calls the one reducer and persists that value", () => {
    const def = slice(INDEX, "const toggleSelected = (repo: string) => {", "};");
    expect(def).toContain("toggleRepoInGradeSet(selected, repo)");
    expect(def).toContain("setSelected(next)");
    expect(def).toContain("persistSelectedRepoIds(next)");
  });

  it("B: the typeahead takes selection and one toggle callback as props and owns no selection", () => {
    const props = slice(HOME, "export default function RepoGradesGradeSetTypeahead(", ")");
    expect(props).toContain("selected");
    expect(props).toContain("onToggleRepo");
    expect(HOME).not.toMatch(/useState<Set/);
    expect(HOME).not.toMatch(/useState\(\s*new Set/);
    expect(HOME).not.toContain('"ta-');
    expect(HOME).not.toContain("localStorage");
  });

  it("C: the typeahead and the grid checkboxes share the one toggleSelected", () => {
    const mount = slice(INDEX, "<RepoGradesGradeSetTypeahead", "/>");
    expect(mount).toContain("selected={selected}");
    expect(mount).toContain("onToggleRepo={toggleSelected}");
    expect(INDEX).toContain("onToggleSelected={toggleSelected}");
  });

  it("the typeahead is mounted through the sticky header", () => {
    expect(INDEX).toMatch(/gradeSetControl=\{/);
    expect(HEADER).toContain("{gradeSetControl}");
  });
});

describe("AC-F4: the auto-filter and its affordance", () => {
  it("bodyRows comes from visibleRepoRows over the query-free displayedRows", () => {
    const def = slice(INDEX, "const bodyRows =", ";");
    expect(def).toContain("visibleRepoRows(displayedRows, uiState.searchQuery");
    expect(INDEX).toMatch(/rows:\s*displayedRows/);
  });

  it("the typeahead renders the counter whenever a summary exists, with both actions", () => {
    expect(HOME).toContain("selectionFilterSummary(");
    expect(HOME).toMatch(/\{summary && \(/);
    expect(HOME).toContain("summary.primaryActionLabel");
    expect(HOME).toContain("summary.secondaryActionLabel");
  });

  it("show-all is ephemeral: no new persisted key in index.tsx", () => {
    expect(INDEX).toContain("const [showAll, setShowAll] = useState(false)");
  });
});
