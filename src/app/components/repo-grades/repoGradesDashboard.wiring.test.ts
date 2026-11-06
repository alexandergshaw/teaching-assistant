import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { JsxSelfClosingElement, Node } from "typescript";
import { describe, expect, it } from "vitest";

const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");
const index = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("./RepoGradesDashboard.tsx", import.meta.url), "utf8");
const feedback = readFileSync(new URL("./RepoDashboardFeedback.tsx", import.meta.url), "utf8");
const gradingActions = readFileSync(new URL("./useRepoGradesGradingActions.ts", import.meta.url), "utf8");
const filters = readFileSync(new URL("./RepoGradeCourseFilters.tsx", import.meta.url), "utf8");

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
  if (gate.left.getText() !== "course && cellDraft") return null;
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
  it("uses the course setter for class chips and clears the old class on an institution change", () => {
    expect(index).toMatch(/<RepoGradeCourseFilters\s+courses=\{courses\}\s+courseId=\{uiState.courseId\}\s+onCourseIdChange=\{handleCourseIdChange\}/);
    expect(index).toMatch(/<RepoGradesControls[\s\S]*?onCourseIdChange=\{handleCourseIdChange\}/);
    expect(filters).toContain('if (courseId && institution !== courseInstitution) onCourseIdChange("")');
    expect(filters).toContain("onClick={() => onCourseIdChange(id)}");
    expect(filters.match(/<Chip[^>]*component="button" type="button"/g)).toHaveLength(2);
    expect(filters.match(/<FormControl component="fieldset"/g)).toHaveLength(2);
    expect(filters.match(/<FormLabel component="legend"/g)).toHaveLength(2);
    expect(index.indexOf("<RepoGradeCourseFilters")).toBeLessThan(index.indexOf("<RepoGradesControls"));
  });

  it("mounts for a restored course outside the manual grid and consumes unfiltered course edits", () => {
    const props = findCourseDashboardMount(index)?.attributes.properties.map((prop) => prop.getText());
    expect(props).toContain("cellEdits={cellEdits}");
    expect(props).toContain("scan={scan}");
    expect(props).toContain("scanFailed={scanError !== null}");
    expect(index.indexOf("<RepoGradesDashboard")).toBeLessThan(index.indexOf("<RepoGradesStickyHeader"));
    expect(dashboard).toContain("buildRepoGradesDashboard(cellEdits, scan)");
    expect(dashboard).toContain("buildRepoGradeMatrix(browserRows, cellEdits, saved.results, gradeColumns, assignments, roster, studentRepos)");
  });

  it("rejects an outer guard that hides the dashboard until a folder is selected", () => {
    const gate = "{course && cellDraft && (<RepoGradesDashboard />)}";
    const direct = `function AccountRepoGradesTab() { return (<>${gate}</>); }`;
    const guarded = direct.replace(gate, `{currentSelectedFolder !== ALL_FOLDERS && (<>${gate}</>)}`);
    expect(findCourseDashboardMount(direct)).not.toBeNull();
    expect(findCourseDashboardMount(guarded)).toBeNull();
  });

  it("scopes the tab to the account and routes existing grading mutations through the current cell scope", () => {
    expect(index).toContain("return !loading && user ? <AccountRepoGradesTab key={user.id} accountId={user.id} /> : null;");
    const props = findCourseDashboardMount(index)?.attributes.properties.map((prop) => prop.getText());
    expect(props).toContain("key={course.id}");
    expect(props).toContain("courseId={course.id}");
    expect(dashboard).toContain("const ownerId = user && isOwnerDecision(accessDecision) ? user.id : null");
    expect(dashboard).toContain("<RepoGradeHistory courseId={courseId} accountId={ownerId}");
    expect(index).toContain("isCellScopeCurrent: () => drafts.isCurrent(cellScope)");
    expect(index).toContain("setCellEdits: (update) => drafts.edit(cellScope, update)");
  });

  it("exposes per-course profile settings to the owner independently of scan success", () => {
    expect(dashboard).toMatch(/user && isOwnerDecision\(accessDecision\) && \(\s*<>\s*<RepoGradesStartupPreview .* \/>\s*<RepoGradeProfileSettings courseId=\{courseId\} columns=\{gradeColumns\} \/>/);
  });

  it("declares table headers and a concise status independent of the scrollable rows", () => {
    expect(dashboard).toContain('<TableCell component="th" scope="col">Student</TableCell>');
    expect(dashboard).toContain('<TableCell component="th" key={folder} scope="col">');
    expect(dashboard).toContain('<TableCell component="th" scope="row">');
    expect(dashboard).toContain('role="region" aria-labelledby={headingId} tabIndex={0}');
    expect(dashboard.indexOf('role="status"')).toBeLessThan(dashboard.indexOf("<TableContainer"));
  });

  it("shows browser and saved results in a read-only matrix with scoped copying", () => {
    const props = findCourseDashboardMount(index)?.attributes.properties.map((prop) => prop.getText());
    expect(props).toContain("gradeColumns={columnsWithMapping}");
    expect(props).toContain("assignments={assignments}");
    expect(props).toContain("roster={roster}");
    expect(props).toContain("studentRepos={course.studentRepos}");
    expect(dashboard).toContain("const dashboardFeedbackEnabled = false");
    expect(dashboard).toContain("repo.cells.get(folder)");
    expect(dashboard).toContain('source="browser"');
    expect(dashboard).toContain('source="saved"');
    expect(dashboard).toContain("cell?.retained?.map");
    expect(dashboard).toContain("rubric={source.rubricAreas}");
    expect(dashboard).toContain("useRepoGradeMatrixResults(courseId, ownerId, historyRevision)");
    expect(dashboard).toContain("Saved results are incomplete");
    expect(feedback).toContain('copy("all", copyAllFeedbackText(feedback), "all")');
    expect(dashboard).not.toMatch(/postCanvasGradesAction|handlePost|handleGradeCell|handleGradeColumn/);
  });

  it("keeps the retained editor isolated with its course guard and separately keyed modal", () => {
    expect(gradingActions).toMatch(/const handleRetainedDraftChange[\s\S]*?if \(!isCurrent\(\)\) return;\s*setCellEdits\(\(prev\) => applyRetainedRepoGradeDraftEdit\(prev, repo, folder, expected, field, value\)\)/);

    const editor = feedback.slice(feedback.indexOf("function RetainedDraft("), feedback.indexOf("const RETENTION_LABELS"));
    expect(feedback).toMatch(/retainedResults\?\.map\(\(result, index\) => \(\s*<RetainedFeedback key=\{result\.id\} result=\{result\}/);
    expect(feedback).toContain("open && <RetainedDraft");
    expect(editor).toContain("onDraftChange(repo, folder, result, field, value)");
    expect(editor).toMatch(/<RowFeedbackBoxes[\s\S]*?onCopy=\{copy\} onChangeField=\{changeFeedback\} onExpand=\{expand\}/);
    expect(editor).toMatch(/\{expandedField && \(\s*<FeedbackExpandModal[\s\S]*?field=\{expandedField\} edit=\{feedback\}\s*onChange=\{changeFeedback\}[\s\S]*?restoreFocusRef=\{expandTrigger\}/);
    expect(editor).not.toMatch(/handleGrade|handlePost|\.filter\(/);
  });

  it("binds retained copy to the committed editor version and rejects stale status", () => {
    expect(feedback).toContain("JSON.stringify([accountId, courseId, repo, folder, id, score, comment, strengths, improvements, resubmitNotice])");
    expect(feedback).toContain("props.isCurrentCellScope() && openRef.current");
    expect(feedback).toContain("props.isAvailable() && openRef.current");
    expect(feedback).toContain("openRef.current = next; setOpen(next)");
    expect(feedback).toContain("<AccordionSummary");
    expect(feedback).toContain("lifetime.current?.identity === identity");
    expect(feedback).toContain("lifetime.current === mount");
    expect(feedback).toContain("lifetime.current = null");
    expect(feedback).toMatch(/invalidateCopy\(\);\s*onDraftChange/);
    expect(feedback).toMatch(/await copyRepoFeedback\([^;]*, isCurrent\);\s*if \(!isCurrent\(\)\) return;\s*const success/);
  });
});
