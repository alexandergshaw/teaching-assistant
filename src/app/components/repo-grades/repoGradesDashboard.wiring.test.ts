import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { JsxSelfClosingElement, Node } from "typescript";
import { describe, expect, it } from "vitest";

const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");
const index = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("./RepoGradesDashboard.tsx", import.meta.url), "utf8");

function findCourseDashboardMount(source: string): JsxSelfClosingElement | null {
  const file = ts.createSourceFile("index.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const mounts: JsxSelfClosingElement[] = [];
  function visit(node: Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === "RepoGradesDashboard") mounts.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (mounts.length !== 1) return null;
  const [mount] = mounts;
  const groupedMount = mount.parent;
  if (!ts.isParenthesizedExpression(groupedMount)) return null;
  const gate = groupedMount.parent;
  if (!ts.isBinaryExpression(gate) || gate.right !== groupedMount) return null;
  if (gate.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) return null;
  if (gate.left.getText() !== "course && cellStateResetForCourse === course.id") return null;
  const slot = gate.parent;
  if (!ts.isJsxExpression(slot) || !ts.isJsxFragment(slot.parent)) return null;
  const groupedFragment = slot.parent.parent;
  if (!ts.isParenthesizedExpression(groupedFragment)) return null;
  const returned = groupedFragment.parent;
  if (!ts.isReturnStatement(returned) || !ts.isBlock(returned.parent)) return null;
  const tab = returned.parent.parent;
  if (!ts.isFunctionDeclaration(tab) || tab.name?.text !== "AccountRepoGradesTab") return null;
  return mount;
}

describe("class repository results wiring", () => {
  it("mounts for a restored course outside the manual grid and consumes unfiltered course edits", () => {
    const props = findCourseDashboardMount(index)?.attributes.properties.map((prop) => prop.getText());
    expect(props).toContain("cellEdits={cellEdits}");
    expect(props).toContain("scan={scan}");
    expect(props).toContain("scanFailed={scanError !== null}");
    expect(index.indexOf("<RepoGradesDashboard")).toBeLessThan(index.indexOf("<RepoGradesStickyHeader"));
    expect(dashboard).toContain("buildRepoGradesDashboard(cellEdits, scan)");
  });

  it("rejects an outer guard that hides the dashboard until a folder is selected", () => {
    const gate = "{course && cellStateResetForCourse === course.id && (<RepoGradesDashboard />)}";
    const direct = `function AccountRepoGradesTab() { return (<>${gate}</>); }`;
    const guarded = direct.replace(gate, `{currentSelectedFolder !== ALL_FOLDERS && (<>${gate}</>)}`);
    expect(findCourseDashboardMount(direct)).not.toBeNull();
    expect(findCourseDashboardMount(guarded)).toBeNull();
  });

  it("scopes the tab to the account and routes existing grading mutations through the current cell scope", () => {
    expect(index).toContain("return !loading && user ? <AccountRepoGradesTab key={user.id} /> : null;");
    const props = findCourseDashboardMount(index)?.attributes.properties.map((prop) => prop.getText());
    expect(props).toContain("key={course.id}");
    expect(props).toContain("courseId={course.id}");
    expect(dashboard).toContain("courseId={courseId} accountId={user.id}");
    expect(index).toContain("setCellState({ scope: {}, edits })");
    expect(index).toContain("setCellEdits(restoredEdits)");
    expect(index).toContain("setCellEdits: (update) => setCellState((current) => updateRepoGradesCourseEdits(current, cellScope, update))");
  });

  it("declares table headers and a concise status independent of the scrollable rows", () => {
    expect(dashboard).toContain('<th scope="col">Folder</th>');
    expect(dashboard).toContain('<th scope="row">{repo}</th>');
    expect(dashboard).toContain('role="region" aria-labelledby={headingId} tabIndex={0}');
    expect(dashboard.indexOf('role="status"')).toBeLessThan(dashboard.indexOf("<table"));
  });

  it("keeps dashboard feedback disabled while retaining its verified-target wiring", () => {
    const props = findCourseDashboardMount(index)?.attributes.properties.map((prop) => prop.getText());
    expect(props).toContain("gradeRows={sortedRows}");
    expect(props).toContain("gradeColumns={columnsWithMapping}");
    expect(props).toContain("grading={{ handleGradeCell, handleGradeColumn, handleScoreChange, handleFeedbackFieldChange, bulkRunningFolder }}");
    expect(dashboard).toContain("const verified = !!scan && !scanLoading && !scanFailed");
    expect(dashboard).toContain('verified && discovery === "Found in scan"');
    expect(dashboard).toContain('row.cells[column.folder]?.status === "ungraded"');
    expect(dashboard).toContain("grading.handleGradeCell(row, column)");
    expect(dashboard).toContain("grading.handleGradeColumn(folder)");
    expect(dashboard).toContain("const dashboardFeedbackEnabled = false");
    expect(dashboard).toContain("{dashboardFeedbackEnabled && folder !== null && edit && (");
    expect(dashboard).toContain("grading.handleScoreChange(repo, folder, score)");
    expect(dashboard).toContain("grading.handleFeedbackFieldChange(repo, folder, field, value)");
    expect(dashboard).not.toMatch(/postCanvasGradesAction|handlePost/);
  });
});
