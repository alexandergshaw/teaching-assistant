import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

describe("Repo Grades startup wiring", () => {
  it("mounts the startup lifecycle outside tab content and scopes the unavailable message to Repo Grades", () => {
    const home = source("../../page.tsx");
    const mount = home.indexOf("<RepoGradesStartup>");
    expect(mount).toBeGreaterThan(home.indexOf("<WorkflowTriggerWatcher"));
    expect(mount).toBeLessThan(home.indexOf("<main"));
    expect(home.match(/<RepoGradesStartupStatus \/>/g)).toHaveLength(1);
    expect(home).toMatch(/<RepoGradesStartupStatus \/>\s*<RepoGradesTab \/>/);
    expect(home).toMatch(/<\/main>\s*<\/RepoGradesStartup>/);
    const component = source("./RepoGradesStartup.tsx");
    expect(source("../../layout.tsx")).toContain('<RepoGradesStartupActivation enabled={repoGradeStartupAvailable(repoGradeMode)} embeddedPilot={repoGradeMode === "embedded-only"}>');
    expect(source("./startup-activation.tsx")).toContain("createContext(false)");
    expect(component).toContain("useRepoGradesStartupActivation() && isOwnerDecision(accessDecision)");
    expect(component).toContain("const pilotEnabled = useRepoGradesEmbeddedPilot();");
    expect(component).toContain("startupEnabled ? serverRepoGradesStartupAdapter : disabledRepoGradesStartupAdapter");
    expect(component).toContain("useRepoGradesStartup(loading ? null : user?.id ?? null, startupAdapter)");
  });

  it("starts one lifecycle per authenticated scope and disposes its observer in effect cleanup", () => {
    const hook = source("./useRepoGradesStartup.ts");
    expect(hook).toContain('if (!accountId || adapter.status === "disabled") return');
    expect(hook).toContain("generation: crypto.randomUUID()");
    expect(hook).toContain("return run.dispose");
    expect(hook).toContain("}, [session])");
    expect(hook).toContain("if (current?.session === session) return current");
  });

  it("gives the coordinator no LMS, grade posting, or direct network dependency", () => {
    const coordinator = source("./startup-coordinator.ts");
    expect([...coordinator.matchAll(/from "([^"]+)"/g)].map(([, path]) => path))
      .toEqual(["@/lib/repo-grades-dashboard/scheduler", "./startup-diagnostics", "./startup-progress"]);
    expect(coordinator).not.toMatch(/\b(?:fetch|XMLHttpRequest|canvas|postGrade|postScore)\b/i);
    expect(source("./RepoGradesStartup.tsx")).not.toMatch(/app\/actions/);
  });

  it("scopes the explicit read-only preview to the owner and selected class", () => {
    const dashboard = source("../repo-grades/RepoGradesDashboard.tsx");
    expect(dashboard).toMatch(/user && isOwnerDecision\(accessDecision\) && \([\s\S]*?<RepoGradesStartupPreview key=\{JSON.stringify\(\[user.id, courseId\]\)\} accountId=\{user.id\} courseId=\{courseId\}/);
    const preview = source("./RepoGradesStartupPreview.tsx");
    expect(preview).toContain("onClick={loadPreview}");
    expect(preview).toContain("loadRepoGradesStartupPreview(courseId, accountId)");
    expect(preview).not.toMatch(/useEffect|runRepoGrade|BatchAction|StartupTargetAction/);
    const client = source("./startup-preview-client.ts");
    expect(client).toContain("previewRepoGradeStartupPlanAction(courseId, accountId)");
    expect(client).not.toMatch(/runRepoGrade|BatchAction|StartupTargetAction/);
  });

  it("keeps a live region outside the tab and wires focusable, guarded Material UI controls", () => {
    const component = source("./RepoGradesStartup.tsx");
    expect(component).toMatch(/role="status" aria-atomic="true"[\s\S]*\{children\}/);
    expect(component).toContain('import Button from "@mui/material/Button"');
    expect(component).toContain('<Button type="button" variant="outlined" size="small" aria-disabled={!canStop} aria-describedby={stopHintId}');
    expect(component).toContain("if (canStop) startup.stop?.()");
    expect(component).toContain("Copy it before reloading or signing out.");
    expect(component).toContain("Manual repository grading is paused while the Embedded pilot is selected.");
    expect(component).toContain("slotProps={{ input: { readOnly: true } }}");
    expect(component).toContain("value={JSON.stringify(entry, null, 2)}");
  });

  it("shows sortable, keyboard-operable status labels only in the existing startup table", () => {
    const component = source("./RepoGradesStartup.tsx");
    const table = source("./RepoGradesStartupTable.tsx");
    expect(component).toContain("<RepoGradesStartupTable courses={progress.courses} headingId={headingId} />");
    expect(table).toContain('<Table size="small" aria-labelledby={headingId}>');
    expect(table).toContain('<TableCell component="th" scope="row">{course.label}</TableCell>');
    expect(table).toContain('sortDirection={active ? sort.direction : false}');
    expect(table).toContain('<TableSortLabel component="button" type="button" active={active}');
    expect(table).toContain('onClick={() => setSort((current) => nextStartupTableSort(current, id))}');
    expect(table).toContain("sortStartupCourses(courses, sort).map");
    expect(table).toContain("orderStartupStatuses(course.states).map");
    expect(table).toContain('label={count ? `${label} (${count})` : label}');
  });

  it("wires an explicit retry button to the current startup lifecycle", () => {
    const component = source("./RepoGradesStartup.tsx");
    expect(component).toContain("A retry may use a model call to prepare the rubric. Repository grading remains separate.");
    expect(component).toContain('<p role="status">{PREPARATION_TEXT[status]}</p>');
    expect(component).toMatch(/\(canRetry \|\| status === "retrying"\) && \(\s*<Button type="button"/);
    expect(component).toMatch(/onClick=\{\(\) => \{ if \(enabled\) void startup\.retryPreparation\?\.\(preparation\); \}\}/);
    expect(source("./useRepoGradesStartup.ts")).toContain("retryPreparation: run.retryPreparation");
  });
});
