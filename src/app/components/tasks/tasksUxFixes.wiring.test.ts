// Wiring guard for the Tasks-tab UX audit's four BLOCKERs and the SHOULD
// fixes bundled with them. vitest here is node-env and collects only
// src/**/*.test.ts (this repo's own AGENTS.md-linked notes) - no .tsx is
// ever rendered, so whether TasksTab.tsx/ManageTasksDialog.tsx/
// useCourseTasksData.ts actually WIRE the pure decisions
// (bulkConfirmDecision.ts, taskLoadState.ts, confirmArming.ts) into what
// renders - rather than computing a value and silently discarding it - can
// only be proven by reading the source as text. Matches the existing idiom
// in this directory (see taskInstructionIndicator.wiring.test.ts).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const TASKS_TAB_PATH = join(process.cwd(), "src/app/components/TasksTab.tsx");
const tasksTabSource = readFileSync(TASKS_TAB_PATH, "utf8");
const MANAGE_TASKS_DIALOG_PATH = join(process.cwd(), "src/app/components/tasks/ManageTasksDialog.tsx");
const manageTasksDialogSource = readFileSync(MANAGE_TASKS_DIALOG_PATH, "utf8");
const USE_COURSE_TASKS_DATA_PATH = join(process.cwd(), "src/app/components/tasks/useCourseTasksData.ts");
const useCourseTasksDataSource = readFileSync(USE_COURSE_TASKS_DATA_PATH, "utf8");
const USE_TASK_BULK_ACTIONS_PATH = join(process.cwd(), "src/app/components/tasks/useTaskBulkActions.ts");
const useTaskBulkActionsSource = readFileSync(USE_TASK_BULK_ACTIONS_PATH, "utf8");
const TASKS_GRID_PATH = join(process.cwd(), "src/app/components/tasks/TasksGrid.tsx");
const tasksGridSource = readFileSync(TASKS_GRID_PATH, "utf8");

describe("canary: every source file under test was actually read", () => {
  it("all five files are non-trivial", () => {
    for (const src of [tasksTabSource, manageTasksDialogSource, useCourseTasksDataSource, useTaskBulkActionsSource, tasksGridSource]) {
      expect(src.length).toBeGreaterThan(500);
    }
  });
});

describe("BLOCKER 1: Ctrl+D fill-down routes through the pure many-row confirm decision, never a bare overwritesMeaningfully check", () => {
  it("TasksGrid.tsx's handleFillDown passes the ANCHOR course name (sourceRow.course.name) as onFillDown's 4th argument", () => {
    expect(tasksGridSource).toContain("onFillDown(gridCol.task, sourceCell, targets, sourceRow.course.name);");
  });

  it("useTaskBulkActions.ts's handleFillDown calls decideFillDownConfirm (the pure BLOCKER 1 threshold), not decideStatusBulkConfirm", () => {
    const idx = useTaskBulkActionsSource.indexOf("const handleFillDown = (");
    expect(idx).toBeGreaterThan(-1);
    const body = useTaskBulkActionsSource.slice(idx, useTaskBulkActionsSource.indexOf("\n  };", idx));
    expect(body).toContain("decideFillDownConfirm(cells, sourceCell)");
    expect(body).not.toContain("decideStatusBulkConfirm(");
  });

  it("column/row bulk-set still use decideStatusBulkConfirm (the ORIGINAL AC6 threshold - unchanged by BLOCKER 1)", () => {
    expect(useTaskBulkActionsSource).toContain("decideStatusBulkConfirm(cells, status)");
  });

  it("sabotage canary: a version that fed handleFillDown's cells through decideStatusBulkConfirm instead would still satisfy a looser 'mentions decideFillDownConfirm somewhere in the file' check - this test pins it to handleFillDown's OWN body, not the whole file", () => {
    const idx = useTaskBulkActionsSource.indexOf("const handleFillDown = (");
    const body = useTaskBulkActionsSource.slice(idx, useTaskBulkActionsSource.indexOf("\n  };", idx));
    const sabotaged = body.replace("decideFillDownConfirm(cells, sourceCell)", "decideStatusBulkConfirm(cells, sourceCell.status)");
    expect(sabotaged).not.toContain("decideFillDownConfirm(cells, sourceCell)");
  });
});

describe("SHOULD 5: the bulk confirm Dialog's consequence sentence is actually wired to aria-describedby", () => {
  it("TasksTab.tsx declares bulkConfirmDescId via useId() and passes it to the Dialog", () => {
    expect(tasksTabSource).toContain("const bulkConfirmDescId = useId();");
    expect(tasksTabSource).toContain('<Dialog open onClose={cancelBulk} aria-describedby={bulkConfirmDescId}>');
  });

  it("the SAME id is set on the paragraph carrying the actual consequence text", () => {
    expect(tasksTabSource).toContain('<p id={bulkConfirmDescId}>{pendingBulk.message}</p>');
  });
});

describe("BLOCKER 4: the load-error banner is an ARIA live region", () => {
  it("TasksTab.tsx's error banner carries role=\"alert\"", () => {
    const idx = tasksTabSource.indexOf("styles.errorBanner");
    expect(idx).toBeGreaterThan(-1);
    const tagSlice = tasksTabSource.slice(idx, idx + 120);
    expect(tagSlice).toContain('role="alert"');
  });
});

describe("BLOCKER 3: the empty state is gated on taskLoadState.ts's pure decisions, never a re-derived state check", () => {
  it("imports shouldShowEmptyState/shouldShowMainContent/errorBannerText from taskLoadState.ts", () => {
    expect(tasksTabSource).toContain('from "./tasks/taskLoadState"');
    expect(tasksTabSource).toContain("shouldShowEmptyState(data.state, data.courses.length)");
    expect(tasksTabSource).toContain("shouldShowMainContent(data.state, data.courses.length)");
    expect(tasksTabSource).toContain("errorBannerText(data.state, data.error)");
  });

  it("sabotage canary: the OLD gate ('state !== \"loading\" && courses.length === 0') is no longer present", () => {
    expect(tasksTabSource).not.toContain('data.state !== "loading" && data.courses.length === 0');
  });
});

describe("SHOULD 7: no timer clears a cell's save-error marker", () => {
  it("useTaskCellErrors.ts (the cell-error map's only owner) never CALLS setTimeout (the header comment may still describe the old approach in prose)", () => {
    const src = readFileSync(join(process.cwd(), "src/app/components/tasks/useTaskCellErrors.ts"), "utf8");
    expect(src).not.toContain("setTimeout(");
  });

  it("TasksTab.tsx no longer schedules a 6000ms clear", () => {
    expect(tasksTabSource).not.toContain("6000");
    expect(tasksTabSource).not.toContain("window.setTimeout(() => clearCellError");
  });
});

describe("BLOCKER 2: a bulk write's per-course outcome reaches the SAME error map a single-cell edit already uses", () => {
  it("useTaskBulkActions.ts's markCellOutcome calls both reportCellError and clearCellError - never one without the other", () => {
    const idx = useTaskBulkActionsSource.indexOf("const markCellOutcome = ");
    expect(idx).toBeGreaterThan(-1);
    const body = useTaskBulkActionsSource.slice(idx, useTaskBulkActionsSource.indexOf("};", idx));
    expect(body).toContain("clearCellError(key)");
    expect(body).toContain("reportCellError(key,");
  });

  it("every one of the three action branches (column/row/fill) calls markCellOutcome", () => {
    const occurrences = useTaskBulkActionsSource.split("markCellOutcome(").length - 1;
    // 1 for the definition's own body reference is not counted (it's the
    // declaration, not a call site) - three real call sites, one per branch.
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });

  it("TasksTab.tsx renders the SAME `announcement` string visibly (statusText) as well as through the srOnly region - a bulk outcome is no longer audible-only", () => {
    expect(tasksTabSource).toContain("statusText={announcement}");
  });
});

describe("SHOULD 6: Retire is armed via this repo's shipped signature-based idiom (isConfirmArmed), not a bare boolean or a hand-rolled second copy", () => {
  it("ManageTasksDialog.tsx imports isConfirmArmed from confirmArming.ts and calls it", () => {
    expect(manageTasksDialogSource).toContain(
      'import { isConfirmArmed } from "../content-tab/modules/confirmArming";'
    );
    expect(manageTasksDialogSource).toContain("isConfirmArmed(confirmRetireId, taskId)");
    expect(manageTasksDialogSource).toContain("isConfirmArmed(confirmRetireId, task.id)");
  });

  it("retiring announces through a role=\"status\" region, not silently", () => {
    expect(manageTasksDialogSource).toContain('role="status"');
    expect(manageTasksDialogSource).toContain("{retireStatus}");
  });

  it("Escape disarms (stopPropagation, so the dialog itself does not also close) - the same shape as TaskAttachmentsDialog.tsx's disarmRemove", () => {
    const idx = manageTasksDialogSource.indexOf('if (e.key === "Escape") {');
    expect(idx).toBeGreaterThan(-1);
    const body = manageTasksDialogSource.slice(idx, idx + 200);
    expect(body).toContain("e.stopPropagation();");
    expect(body).toContain("disarmRetire(task.id, task.label, true);");
  });
});

describe("SHOULD 8: a silent reload failure now records `error` (previously returned with nothing set at all)", () => {
  it("setError(coursesResult.error) runs UNCONDITIONALLY, before the silent/non-silent branch", () => {
    const idx = useCourseTasksDataSource.indexOf('if ("error" in coursesResult) {');
    expect(idx).toBeGreaterThan(-1);
    const block = useCourseTasksDataSource.slice(idx, useCourseTasksDataSource.indexOf("return;", idx));
    const setErrorIdx = block.indexOf("setError(coursesResult.error);");
    const silentGuardIdx = block.indexOf("if (!opts?.silent) {");
    expect(setErrorIdx).toBeGreaterThan(-1);
    expect(silentGuardIdx).toBeGreaterThan(setErrorIdx);
  });

  it("sabotage canary: a version with setError INSIDE the !opts?.silent branch (the old, silent-on-silent-failure behavior) would fail the ordering check above", () => {
    const sabotaged = useCourseTasksDataSource.replace(
      "setError(coursesResult.error);\n      if (!opts?.silent) {\n        setState(\"error\");\n      }",
      'if (!opts?.silent) {\n        setState("error");\n        setError(coursesResult.error);\n      }'
    );
    const idx = sabotaged.indexOf('if ("error" in coursesResult) {');
    const block = sabotaged.slice(idx, sabotaged.indexOf("return;", idx));
    const setErrorIdx = block.indexOf("setError(coursesResult.error);");
    const silentGuardIdx = block.indexOf("if (!opts?.silent) {");
    expect(setErrorIdx).toBeGreaterThan(silentGuardIdx);
  });

  it("TasksTab.tsx renders a manual Refresh entry point wired to `refreshing`", () => {
    expect(tasksTabSource).toContain("refreshing={data.refreshing}");
    expect(tasksTabSource).toContain("onRefresh={() => void reload()}");
  });
});
