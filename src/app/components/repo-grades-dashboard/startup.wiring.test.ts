import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

describe("Repo Grades startup wiring", () => {
  it("keeps actionable status visible in the collapsed automatic grading summary", () => {
    const component = source("./RepoGradesStartup.tsx");
    expect(component).toContain("Status may be out of date");
    expect(component).toContain("GitHub rate limit: retry at");
    expect(component).toContain("Waiting for a previous startup check");
    expect(component).toContain("Class queue settings unavailable");
    expect(component).toContain("Feedback recovery available");
    expect(component).toContain("Grading needs attention");
    expect(component).toContain('variant="body2" role="status"');
  });
  it("mounts the startup lifecycle outside tab content and scopes the unavailable message to Repo Grades", () => {
    const home = source("../../page.tsx");
    const mount = home.indexOf("<RepoGradesStartup>");
    expect(mount).toBeGreaterThan(home.indexOf("<WorkflowTriggerWatcher"));
    expect(mount).toBeLessThan(home.indexOf("<main"));
    expect(home).not.toContain("<RepoGradesStartupStatus />");
    const repoTab = source("../repo-grades/index.tsx");
    expect(repoTab).toContain("<RepoGradesStartupStatus />");
    expect(repoTab.indexOf('title="Repo Grades"')).toBeLessThan(repoTab.indexOf("<RepoGradesStartupStatus />"));
    expect(home).toMatch(/<\/main>\s*<\/RepoGradesStartup>/);
    const component = source("./RepoGradesStartup.tsx");
    expect(source("../../layout.tsx")).toContain('<RepoGradesStartupActivation enabled={repoGradeStartupAvailable(repoGradeMode)} embeddedPilot={repoGradeMode === "embedded-only"} durable={repoGradeDurableStartupAvailable(repoGradeMode)}>');
    expect(source("./startup-activation.tsx")).toContain("createContext(false)");
    expect(component).toContain("useRepoGradesStartupActivation() && owner && !durable");
    expect(component).toContain("const pilotEnabled = useRepoGradesEmbeddedPilot();");
    expect(component).toContain("startupEnabled ? serverRepoGradesStartupAdapter : disabledRepoGradesStartupAdapter");
    expect(component).toContain("useRepoGradesStartup(accountId, startupAdapter)");
    expect(component).toContain("useRepoGradesAutomatic(durable ? accountId : null)");
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

  it("keeps owner-scoped profile controls without the startup preview", () => {
    const dashboard = source("../repo-grades/RepoGradesDashboard.tsx");
    expect(dashboard).toContain("if (!ownerId) return null");
    expect(dashboard).toContain("<RepoGradeProfileSettings courseId={courseId} columns={gradeColumns} />");
    expect(dashboard).not.toContain("RepoGradesStartupPreview");
  });

  it("keeps a live region outside the tab and wires focusable, guarded Material UI controls", () => {
    const component = source("./RepoGradesStartup.tsx");
    expect(component).toMatch(/role="status" aria-atomic="true"[\s\S]*\{children\}/);
    expect(component).toMatch(/import \{[^}]*\bButton\b[^}]*\} from "@mui\/material"/);
    expect(component).toContain('<Button type="button" variant="outlined" size="small" aria-disabled={!canStop} aria-describedby={stopHintId}');
    expect(component).toContain("if (canStop) startup.stop?.()");
    expect(component).toContain("Copy it before reloading or signing out.");
    expect(component).toContain("Manual repository grading is paused while the Embedded pilot is selected.");
    expect(component).toContain("slotProps={{ input: { readOnly: true } }}");
    expect(component).toContain("value={JSON.stringify(entry, null, 2)}");
  });

  it("keeps class queue controls without a grading table", () => {
    const queue = source("./AutomaticRepoGradeClassQueue.tsx");
    const status = source("./RepoGradesAutomaticStatus.tsx");
    expect(queue).toContain('<List dense aria-describedby={hintId}');
    expect(queue).toContain('aria-label={`Move ${direction < 0 ? "up" : "down"}: ${label}`}');
    expect(queue).toContain("save(configured ? included : null)");
    expect(queue).not.toContain("RepoGradesStartupTable");
    expect(status).not.toContain("RepoGradesStartupTable");
    expect(status).toContain("<AutomaticRepoGradeScheduleControl");
    expect(status).toContain("onClick={() => void start()}");
  });

  it("removes rubric preparation areas from startup status", () => {
    expect(source("./RepoGradesStartup.tsx")).not.toContain("<h3>Rubric preparation</h3>");
    expect(source("./RepoGradesAutomaticStatus.tsx")).not.toContain("<h3>Rubric preparation</h3>");
    expect(source("./RepoGradesAutomaticStatus.tsx")).toContain("await retryPreparation(id)");
    expect(source("./useRepoGradesStartup.ts")).toContain("retryPreparation: run.retryPreparation");
  });
});
