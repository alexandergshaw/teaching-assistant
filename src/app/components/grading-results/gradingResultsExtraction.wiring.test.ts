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

describe("GradingResults.tsx renders CopyIcon (moved to icons.tsx) directly", () => {
  it("imports and renders CopyIcon from ./grading-results/icons", () => {
    expect(importsAndRendersIcon(GRADING_RESULTS_SOURCE, "CopyIcon")).toBe(true);
  });
});

// A16-1 (docs/REGRESSION.md entry 359, docs/a16-scope.md section 4.4):
// EyeIcon/DownloadIcon moved one hop further, from being rendered directly
// in GradingResults.tsx to being rendered inside FilesCell.tsx (the Files
// column's per-row content, also moved out in this same extraction).
// GradingResults.tsx no longer imports either icon directly - it renders
// FilesCell, which itself imports and renders both from ./icons (a same-
// directory import there, since FilesCell.tsx lives in grading-results/
// alongside icons.tsx - a different literal from GRADING_RESULTS_SOURCE's
// own "./grading-results/icons", so this is checked with its own pattern
// rather than reusing importsAndRendersIcon unchanged).
const FILES_CELL_SOURCE = read("src/app/components/grading-results/FilesCell.tsx");

function importsAndRendersIconFrom(source: string, name: string, fromPath: string): boolean {
  const importPattern = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*["']${fromPath.replace(/\./g, "\\.")}["']`);
  const renderPattern = new RegExp(`<${name}\\b`);
  return importPattern.test(source) && renderPattern.test(source);
}

describe("GradingResults.tsx renders FilesCell, which renders EyeIcon/DownloadIcon (A16-1 re-extraction)", () => {
  it("imports FilesCell from ./grading-results/FilesCell and renders <FilesCell", () => {
    expect(
      /import\s*\{[^}]*\bFilesCell\b[^}]*\}\s*from\s*["']\.\/grading-results\/FilesCell["']/.test(GRADING_RESULTS_SOURCE)
    ).toBe(true);
    expect(/<FilesCell\b/.test(GRADING_RESULTS_SOURCE)).toBe(true);
  });

  it("GradingResults.tsx no longer IMPORTS EyeIcon/DownloadIcon (they moved into FilesCell.tsx) - a header comment naming the historical icons.tsx move is not an import", () => {
    expect(/import\s*\{[^}]*\bEyeIcon\b/.test(GRADING_RESULTS_SOURCE)).toBe(false);
    expect(/import\s*\{[^}]*\bDownloadIcon\b/.test(GRADING_RESULTS_SOURCE)).toBe(false);
  });

  it.each(["EyeIcon", "DownloadIcon"])("FilesCell.tsx imports and renders %s from ./icons", (name) => {
    expect(importsAndRendersIconFrom(FILES_CELL_SOURCE, name, "./icons")).toBe(true);
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

// ── A16-1 (docs/a16-scope.md section 4.4): the trends mount ────────────────
// V1/V2/V13. Source-text tests over-specify: these pin presence, ordering
// and structural containment, never prose or attribute spelling.

/** True when `source` both imports ClassTrendsPanel from
 * ./drafted-grades/ClassTrendsPanel AND actually renders it - mirrors
 * importsAndRendersIcon above. */
function importsAndRendersClassTrendsPanel(source: string): boolean {
  const importPattern = /import\s+ClassTrendsPanel\s+from\s*["']\.\/drafted-grades\/ClassTrendsPanel["']/;
  const renderPattern = /<ClassTrendsPanel\b/;
  return importPattern.test(source) && renderPattern.test(source);
}

describe("importsAndRendersClassTrendsPanel (canary)", () => {
  it("reports true when the source imports AND renders ClassTrendsPanel from ./drafted-grades/ClassTrendsPanel", () => {
    const fixture = [
      'import ClassTrendsPanel from "./drafted-grades/ClassTrendsPanel";',
      "const x = <ClassTrendsPanel entry={entry} />;",
    ].join("\n");
    expect(importsAndRendersClassTrendsPanel(fixture)).toBe(true);
  });

  it("reports false when imported but never rendered (S1: dead import)", () => {
    const fixture = 'import ClassTrendsPanel from "./drafted-grades/ClassTrendsPanel";';
    expect(importsAndRendersClassTrendsPanel(fixture)).toBe(false);
  });

  it("reports false when rendered but not imported from that path (a local reimplementation)", () => {
    const fixture = "function ClassTrendsPanel() { return null; }\nconst x = <ClassTrendsPanel entry={entry} />;";
    expect(importsAndRendersClassTrendsPanel(fixture)).toBe(false);
  });
});

describe("GradingResults.tsx renders ClassTrendsPanel (V1)", () => {
  it("imports and renders it from ./drafted-grades/ClassTrendsPanel", () => {
    expect(importsAndRendersClassTrendsPanel(GRADING_RESULTS_SOURCE)).toBe(true);
  });
});

/** True when the <ClassTrendsPanel tag is preceded, within the same gated
 * expression, by a hasTrendableResults(...) && - i.e. the panel cannot
 * render with zero trendable results (S2's mutation removes exactly this). */
function classTrendsMountIsGated(source: string): boolean {
  const match = /hasTrendableResults\([^)]*\)\s*&&([\s\S]{0,400})/.exec(source);
  if (!match) return false;
  return /<ClassTrendsPanel\b/.test(match[1]);
}

describe("classTrendsMountIsGated (canary)", () => {
  it("reports true when the tag follows hasTrendableResults(...) && within the same expression", () => {
    const fixture = "return hasTrendableResults(entry) && (\n  <ClassTrendsPanel entry={entry} />\n);";
    expect(classTrendsMountIsGated(fixture)).toBe(true);
  });

  it("reports false when the guard is removed (S2: the exact regression this guards)", () => {
    const fixture = "return <ClassTrendsPanel entry={entry} />;";
    expect(classTrendsMountIsGated(fixture)).toBe(false);
  });

  it("reports false when hasTrendableResults is called but the tag is far outside its gated expression", () => {
    const fixture =
      "const x = hasTrendableResults(entry);\n" + "a".repeat(500) + "\nreturn <ClassTrendsPanel entry={entry} />;";
    expect(classTrendsMountIsGated(fixture)).toBe(false);
  });
});

describe("GradingResults.tsx's ClassTrendsPanel mount is gated by hasTrendableResults (V2)", () => {
  it("the tag is not reachable unless hasTrendableResults(...) is true", () => {
    expect(classTrendsMountIsGated(GRADING_RESULTS_SOURCE)).toBe(true);
  });
});

/** True when a <GradingResults render tag passes an assignmentName prop -
 * used against the three real call sites (V13), not GradingResults.tsx
 * itself. */
function rendersGradingResultsWithAssignmentName(source: string): boolean {
  // `<GradingResults\b` alone would also match `<GradingResultsHandle>` (a
  // type annotation, e.g. `useRef<GradingResultsHandle>`) since "Handle"
  // starts with a word character `\b` does not exclude - require the tag
  // name to end at a non-identifier character (whitespace, `/`, or `>`).
  const tagMatch = /<GradingResults(?=[\s/>])/.exec(source);
  if (!tagMatch) return false;
  const window = source.slice(tagMatch.index, tagMatch.index + 3000);
  return /assignmentName=/.test(window);
}

describe("rendersGradingResultsWithAssignmentName (canary)", () => {
  it("reports true when the render tag passes assignmentName=", () => {
    const fixture = '<GradingResults run={run} canvasUrl={canvasUrl} assignmentName={row.title} />';
    expect(rendersGradingResultsWithAssignmentName(fixture)).toBe(true);
  });

  it("reports false when the render tag omits assignmentName (S10: the exact regression this guards)", () => {
    const fixture = "<GradingResults run={run} canvasUrl={canvasUrl} />";
    expect(rendersGradingResultsWithAssignmentName(fixture)).toBe(false);
  });

  it("reports false when there is no <GradingResults render at all", () => {
    expect(rendersGradingResultsWithAssignmentName("const x = 1;")).toBe(false);
  });
});

describe("assignmentName reaches all three <GradingResults call sites (V13)", () => {
  it.each([
    "src/app/components/GradingTab.tsx",
    "src/app/components/LiveFeedPanel.tsx",
    "src/app/components/GithubGradingPanel.tsx",
  ])("%s passes assignmentName= to <GradingResults", (relativePath) => {
    expect(rendersGradingResultsWithAssignmentName(read(relativePath))).toBe(true);
  });
});
