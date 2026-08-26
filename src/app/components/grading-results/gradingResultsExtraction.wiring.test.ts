// Source-reading guards for the GradingResults.tsx line-budget extraction
// (docs/REGRESSION.md entry 359: "the next feature touching this file should
// extract before it adds, not after"). Four pieces MOVED out of
// GradingResults.tsx into ./grading-results/: the three small icon
// components (icons.tsx), the sort state/derived list/handlers
// (useResultsSort.ts) and the <thead> row that reads them
// (ResultsTableHeaderRow.tsx), and the per-box "expand feedback" modal
// (FeedbackExpandModal.tsx).
//
// vitest is node-env and collects only src/**/*.test.ts - it never renders a
// component (see repoGrades.wiring.test.ts's own header comment for the same
// limitation elsewhere in this codebase), so a text-reading guard, each
// paired with a canary proving it can actually fail, is the only thing that
// keeps a mis-wired extraction (a component defined but never rendered, or
// rendered without the props it needs) caught on a routine run. Modeled on
// rubricBreakdownPercent.wiring.test.ts's readsRubricAreas/
// usesFormatScorePercent pattern.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const GRADING_RESULTS_SOURCE = read("src/app/components/GradingResults.tsx");

// ── icons.tsx ────────────────────────────────────────────────────────────

/** True when `source` both imports `name` from ./grading-results/icons AND
 * actually renders it as JSX (`<name`), not merely imports it unused. */
function importsAndRendersIcon(source: string, name: string): boolean {
  const importPattern = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*["']\\./grading-results/icons["']`);
  const renderPattern = new RegExp(`<${name}\\b`);
  return importPattern.test(source) && renderPattern.test(source);
}

describe("importsAndRendersIcon (canary)", () => {
  it("reports true when the source imports AND renders the named icon from ./grading-results/icons", () => {
    const fixture = 'import { CopyIcon } from "./grading-results/icons";\nconst x = <CopyIcon />;';
    expect(importsAndRendersIcon(fixture, "CopyIcon")).toBe(true);
  });

  it("reports false when imported but never rendered (dead import)", () => {
    const fixture = 'import { CopyIcon } from "./grading-results/icons";';
    expect(importsAndRendersIcon(fixture, "CopyIcon")).toBe(false);
  });

  it("reports false when rendered but not imported from icons.tsx (a local reimplementation)", () => {
    const fixture = "function CopyIcon() { return null; }\nconst x = <CopyIcon />;";
    expect(importsAndRendersIcon(fixture, "CopyIcon")).toBe(false);
  });
});

describe("GradingResults.tsx renders all three icons moved to icons.tsx", () => {
  it.each(["CopyIcon", "EyeIcon", "DownloadIcon"])("imports and renders %s from ./grading-results/icons", (name) => {
    expect(importsAndRendersIcon(GRADING_RESULTS_SOURCE, name)).toBe(true);
  });
});

// ── useResultsSort.ts + ResultsTableHeaderRow.tsx ──────────────────────────

/** True when `source` imports useResultsSort, calls it, and the RESULT
 * (`sortedResults`) is what actually drives the results-table row map - not
 * `run.results.map(` directly, which would silently ignore the hook's sort
 * order while still compiling and still passing every OTHER check here. */
function tableRowsAreDrivenBySortedResults(source: string): boolean {
  const importsHook = /import\s*\{[^}]*\buseResultsSort\b[^}]*\}\s*from\s*["']\.\/grading-results\/useResultsSort["']/.test(
    source
  );
  const callsHook = /=\s*useResultsSort\(run\)/.test(source);
  const mapsSortedResults = /\bsortedResults\.map\(/.test(source);
  return importsHook && callsHook && mapsSortedResults;
}

describe("tableRowsAreDrivenBySortedResults (canary)", () => {
  it("reports true when the hook is imported, called, and its output drives the row map", () => {
    const fixture = [
      'import { useResultsSort } from "./grading-results/useResultsSort";',
      "const { sortedResults } = useResultsSort(run);",
      "sortedResults.map((result) => null);",
    ].join("\n");
    expect(tableRowsAreDrivenBySortedResults(fixture)).toBe(true);
  });

  it("reports false when the row map reads run.results directly instead of the hook's sortedResults (the exact regression this guards)", () => {
    const fixture = [
      'import { useResultsSort } from "./grading-results/useResultsSort";',
      "const { sortedResults } = useResultsSort(run);",
      "run.results.map((result) => null);",
    ].join("\n");
    expect(tableRowsAreDrivenBySortedResults(fixture)).toBe(false);
  });

  it("reports false when the hook is imported but never called", () => {
    const fixture = 'import { useResultsSort } from "./grading-results/useResultsSort";\nsortedResults.map((r) => r);';
    expect(tableRowsAreDrivenBySortedResults(fixture)).toBe(false);
  });
});

describe("GradingResults.tsx's table rows are driven by useResultsSort's sortedResults", () => {
  it("imports and calls useResultsSort(run), and maps sortedResults (not run.results) for the tbody", () => {
    expect(tableRowsAreDrivenBySortedResults(GRADING_RESULTS_SOURCE)).toBe(true);
  });
});

/** True when `source` renders <ResultsTableHeaderRow with all three props the
 * component needs to do its job: the rubric area names, the sort handler,
 * and the label function - a render missing one would compile (the props are
 * optional at the type level only if you forget to check) but silently break
 * either the rubric columns or every column's sort affordance. */
function rendersHeaderRowWithProps(source: string): boolean {
  const rendersTag = /<ResultsTableHeaderRow\b/.test(source);
  const hasRubricAreaNames = /rubricAreaNames=\{run\.rubricAreaNames\}/.test(source);
  const hasOnSort = /onSort=\{handleSort\}/.test(source);
  const hasSortLabel = /sortLabel=\{sortLabel\}/.test(source);
  return rendersTag && hasRubricAreaNames && hasOnSort && hasSortLabel;
}

describe("rendersHeaderRowWithProps (canary)", () => {
  it("reports true only when all three required props are present alongside the tag", () => {
    const fixture =
      "<ResultsTableHeaderRow rubricAreaNames={run.rubricAreaNames} onSort={handleSort} sortLabel={sortLabel} />";
    expect(rendersHeaderRowWithProps(fixture)).toBe(true);
  });

  it("reports false when the tag is rendered but missing a required prop (e.g. onSort dropped)", () => {
    const fixture = "<ResultsTableHeaderRow rubricAreaNames={run.rubricAreaNames} sortLabel={sortLabel} />";
    expect(rendersHeaderRowWithProps(fixture)).toBe(false);
  });

  it("reports false when the tag is never rendered at all", () => {
    expect(rendersHeaderRowWithProps("const x = 1;")).toBe(false);
  });
});

describe("GradingResults.tsx renders ResultsTableHeaderRow with rubricAreaNames/onSort/sortLabel", () => {
  it("wires all three required props", () => {
    expect(rendersHeaderRowWithProps(GRADING_RESULTS_SOURCE)).toBe(true);
  });
});

// ── FeedbackExpandModal.tsx ────────────────────────────────────────────────

/** True when `source` renders <FeedbackExpandModal, gated on `expandedBox &&`
 * (so it only shows when a box is actually expanded - an ungated render
 * would crash or show stale data the moment `expandedBox` is null), and
 * wired to all five props the component needs: which student/field, the
 * resolved edit, and both callbacks. */
function rendersFeedbackExpandModalWired(source: string): boolean {
  const gated = /\{expandedBox\s*&&\s*\(\s*<FeedbackExpandModal\b/.test(source);
  const hasStudent = /student=\{expandedBox\.student\}/.test(source);
  const hasField = /field=\{expandedBox\.field\}/.test(source);
  const hasEdit = /edit=\{edits\[expandedBox\.student\]\s*\?\?\s*blankRowEdit\(\)\}/.test(source);
  const hasOnChange = /onChange=\{\(field, value\)\s*=>\s*updateFeedbackField\(expandedBox\.student, field, value\)\}/.test(
    source
  );
  const hasOnClose = /onClose=\{\(\)\s*=>\s*setExpandedBox\(null\)\}/.test(source);
  return gated && hasStudent && hasField && hasEdit && hasOnChange && hasOnClose;
}

describe("rendersFeedbackExpandModalWired (canary)", () => {
  const goodFixture = [
    "{expandedBox && (",
    "  <FeedbackExpandModal",
    "    student={expandedBox.student}",
    "    field={expandedBox.field}",
    "    edit={edits[expandedBox.student] ?? blankRowEdit()}",
    "    onChange={(field, value) => updateFeedbackField(expandedBox.student, field, value)}",
    "    onClose={() => setExpandedBox(null)}",
    "  />",
    ")}",
  ].join("\n");

  it("reports true for the real, fully-wired render", () => {
    expect(rendersFeedbackExpandModalWired(goodFixture)).toBe(true);
  });

  it("reports false when the render is not gated on expandedBox (would crash/show stale data when null)", () => {
    const ungated = goodFixture.replace("{expandedBox && (\n  ", "").replace("\n)}", "");
    expect(rendersFeedbackExpandModalWired(ungated)).toBe(false);
  });

  it("reports false when onChange no longer routes through updateFeedbackField with expandedBox.student (the edit.overall invariant's caller-side wiring)", () => {
    const brokenOnChange = goodFixture.replace(
      "onChange={(field, value) => updateFeedbackField(expandedBox.student, field, value)}",
      "onChange={() => {}}"
    );
    expect(rendersFeedbackExpandModalWired(brokenOnChange)).toBe(false);
  });
});

describe("GradingResults.tsx renders FeedbackExpandModal, gated and fully wired", () => {
  it("gates on expandedBox and wires student/field/edit/onChange/onClose", () => {
    expect(rendersFeedbackExpandModalWired(GRADING_RESULTS_SOURCE)).toBe(true);
  });
});
