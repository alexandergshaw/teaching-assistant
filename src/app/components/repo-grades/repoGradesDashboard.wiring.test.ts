import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { JsxSelfClosingElement, Node } from "typescript";
import { describe, expect, it } from "vitest";

const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");
const index = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
const grid = readFileSync(new URL("./RepoGradesGrid.tsx", import.meta.url), "utf8");
const cellControl = readFileSync(new URL("./RepoGradeCellControl.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("./RepoGradesDashboard.tsx", import.meta.url), "utf8");
const feedback = readFileSync(new URL("./RepoDashboardFeedback.tsx", import.meta.url), "utf8");
const gradingActions = readFileSync(new URL("./useRepoGradesGradingActions.ts", import.meta.url), "utf8");
const filters = readFileSync(new URL("./RepoGradeCourseFilters.tsx", import.meta.url), "utf8");
const targetActions = readFileSync(new URL("./RepoTargetGradeActions.tsx", import.meta.url), "utf8");
const profileSettings = readFileSync(new URL("./RepoGradeProfileSettings.tsx", import.meta.url), "utf8");

it("surfaces setup failures on the collapsed grading settings summary", () => {
  const summary = index.slice(index.indexOf("<AccordionSummary"), index.indexOf("</AccordionSummary>"));
  for (const state of ["coursesError", "missingOrg", "scanError", "rosterError", "assignmentsError", "canvasGateBlockedReason", "assignmentsEmpty", "scan?.truncated", "scan?.rateLimit"]) {
    expect(summary).toContain(state);
  }
  expect(summary).toContain('role="status"');
  expect(summary).toContain("Run setup needs attention");
});

it("keeps the provider selection usable and disabled during profile saves", () => {
  expect(profileSettings).toMatch(/<TextField select id=\{`\$\{id\}-provider`\}[\s\S]*?disabled=\{savingProfile\}[\s\S]*?event\.target\.value === "embedded"/);
});

function findCourseDashboardMount(source: string, component = "RepoGradesDashboard"): JsxSelfClosingElement | null {
  const file = ts.createSourceFile("index.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const mounts: JsxSelfClosingElement[] = [];
  function visit(node: Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === component) mounts.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (mounts.length !== 1) return null;
  const [mount] = mounts;
  const groupedMount = ts.isJsxFragment(mount.parent) ? mount.parent.parent : mount.parent;
  if (!ts.isParenthesizedExpression(groupedMount)) return null;
  const gate = groupedMount.parent;
  if (!ts.isBinaryExpression(gate) || gate.right !== groupedMount) return null;
  if (gate.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) return null;
  if (gate.left.getText() !== "course && cellDraft") return null;
  const slot = gate.parent;
  if (!ts.isJsxExpression(slot)) return null;
  const container = slot.parent;
  const root = ts.isJsxElement(container) && container.openingElement.tagName.getText() === "RepoGradesStickyHeader"
    && ts.isJsxFragment(container.parent) ? container.parent : container;
  if (!ts.isJsxFragment(root)) return null;
  const groupedFragment = root.parent;
  if (!ts.isParenthesizedExpression(groupedFragment)) return null;
  const returned = groupedFragment.parent;
  if (!ts.isReturnStatement(returned) || !ts.isBlock(returned.parent)) return null;
  const tab = returned.parent.parent;
  if (!ts.isFunctionDeclaration(tab) || tab.name?.text !== "AccountRepoGradesTab") return null;
  return mount;
}

describe("class repository results wiring", () => {
  it("starts saved cell and assignment grades through the targeted durable queue", () => {
    expect(index).toContain('targetedGrading.startTargeted(selectedCourseId, folder, repo)');
    expect(index).toContain('onGradeCell={(row, column) => { void startSavedGrade(column.folder, row.repo); }}');
    expect(index).toContain('onGradeColumn={(folder) => { void startSavedGrade(folder, null); }}');
    expect(index).toContain('onGradeTarget={(repo, folder) => { void startSavedGrade(folder, repo); }}');
    expect(grid).toContain('onGradeTarget(repo.name, folder)');
    expect(grid).toContain('onGradeColumn(folder)');
    expect(index).toContain('This assignment or repository is already queued');
    expect(grid).toContain('"Grade assignment"');
    expect(targetActions).toContain('Start grading');
  });

  it("disables root grading and explains the saved worker limitation", () => {
    expect(grid).toContain('!column.folder || !durableGradeAvailable');
    expect(grid).toContain('root={!folder}');
    expect(targetActions).toContain('disabled={root || !available || pending}');
    expect(targetActions).toContain('Repository root grading is not supported by the background worker.');
    expect(index).toContain('Repository root assignments are excluded from bulk grading.');
  });
  it("prevents grading controls from acting on unavailable queue status", () => {
    expect(index).toContain('!targetRequests.ready');
    expect(index).toContain('Displayed request statuses may be out of date; grading controls are disabled until status is restored.');
    expect(index).toContain('void targetRequests.refresh()');
    expect(index).toContain('Previously completed or uncertain attempts are not automatically regraded.');
  });
  it("uses the course setter for class chips and clears the old class on an institution change", () => {
    expect(index).toMatch(/<RepoGradeCourseFilters\s+courses=\{courses\}\s+courseId=\{uiState.courseId\}\s+onCourseIdChange=\{handleCourseIdChange\}/);
    expect(index).toMatch(/<RepoGradesControls[\s\S]*?onCourseIdChange=\{handleCourseIdChange\}/);
    expect(filters).toContain('if (courseId && institution !== courseInstitution) onCourseIdChange("")');
    expect(filters).toContain("onClick={() => onCourseIdChange(id)}");
    expect(filters.match(/<Chip[^>]*component="button" type="button"/g)).toHaveLength(2);
    expect(filters.match(/<FormControl component="fieldset"/g)).toHaveLength(2);
    expect(filters.match(/<FormLabel component="legend"/g)).toHaveLength(2);
    expect(index.indexOf("<RepoGradesControls")).toBeLessThan(index.indexOf("<RepoGradeCourseFilters"));
  });

  it("shows one gradebook inside the sticky shell for a restored course, even without a scan", () => {
    const props = findCourseDashboardMount(index, "RepoGradesGrid")?.attributes.properties.map((prop) => prop.getText());
    expect(props).toContain("cellEdits={cellEdits}");
    expect(props).toContain("resultColumns={matrix.columns}");
    expect(props).toContain("gradebookRows={gradebookRows}");
    expect(index.indexOf("<RepoGradesDashboard")).toBeLessThan(index.indexOf("<RepoGradesStickyHeader"));
    expect(index).toContain("Grading profiles and saved data");
    expect(index).toMatch(/buildRepoGradeMatrix\(\s*buildRepoGradesDashboard\(cellEdits, scan\),\s*cellEdits, saved.results, columnsWithMapping, assignments, roster, effectiveStudentRepos/);
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
    expect(index).toMatch(/course && cellDraft && <RepoGradesDashboard key=\{course\.id\} courseId=\{course\.id\}/);
    expect(dashboard).toContain("const ownerId = user && isOwnerDecision(accessDecision) ? user.id : null");
    expect(index).toContain("isCellScopeCurrent: () => drafts.isCurrent(cellScope)");
    expect(index).toContain("setCellEdits: (update) => drafts.edit(cellScope, update)");
  });

  it("exposes per-course profiles to the owner independently of scan success", () => {
    expect(dashboard).toContain("if (!ownerId) return null");
    expect(dashboard).toContain("<RepoGradeProfileSettings courseId={courseId} columns={gradeColumns} />");
  });

  it("declares student row headers and assignment column headers in the working gradebook", () => {
    expect(grid).toContain('aria-label="Repository gradebook by student and assignment"');
    expect(grid).toContain('<TableCell component="th" scope="col" role="columnheader" key={folder}');
    expect(grid).toContain('<TableCell component="th" scope="row" role="rowheader"');
    expect(dashboard).not.toMatch(/<Table\b|gradebookRows|Saved evaluation history/);
  });

  it("keeps the earlier scored attempt's partial status separate from the latest attempt", () => {
    expect(dashboard).toContain('<RepoGradeStatusChip status={latest.status');
    expect(dashboard).toMatch(/scored\.generation !== latest\.generation && scored\.status === "partial" && <> <RepoGradeStatusChip status="partial"/);
  });

  it("shows saved results and copy control without browser results", () => {
    expect(grid).toContain('<RepoTargetGradeActions');
    expect(dashboard).toContain("repo.cells.get(folder)");
    expect(dashboard).toContain("<SavedMatrixResult");
    expect(dashboard).toContain('source="saved" feedback={feedback}');
    expect(dashboard).not.toContain('source="browser"');
    expect(dashboard).not.toContain("cell?.local");
    expect(dashboard).not.toContain("cell?.retained");
    expect(dashboard).toContain("scored.rubric ?? []");
    expect(grid).toContain('<MenuItem key="post" disabled');
  });

  it("suppresses the idle browser grade status beside a saved attempt and leaves manual grading reachable", () => {
    expect(grid).toContain('requests={findTargetRequests(targetRequests, targetCourseId, folder, repo.name)}');
    expect(cellControl).toContain('(!hasSavedResult || status !== "not-started")');
    expect(cellControl).toContain('placeholder={hasSavedResult ? "Browser score" : "Score"}');
    expect(cellControl).toMatch(/status !== "not-started"[\s\S]*?<RepoGradeStatusChip[\s\S]*?<RepoGradeActionsMenu[\s\S]*?<MenuItem key="grade"[\s\S]*?else onGrade\(\);/);
  });

  it("keeps the retained editor isolated with its course guard and separately keyed modal", () => {
    expect(gradingActions).toMatch(/const handleRetainedDraftChange[\s\S]*?if \(!isCurrent\(\)\) return;\s*setCellEdits\(\(prev\) => applyRetainedRepoGradeDraftEdit\(prev, repo, folder, expected, field, value\)\)/);

    const editor = feedback.slice(feedback.indexOf("function RetainedDraft("));
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
