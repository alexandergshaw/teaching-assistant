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
    expect(component).toContain("const startupAdapter = disabledRepoGradesStartupAdapter");
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

  it("keeps a live region outside the tab and wires a focusable, guarded native stop button", () => {
    const component = source("./RepoGradesStartup.tsx");
    expect(component).toMatch(/role="status" aria-atomic="true"[\s\S]*\{children\}/);
    expect(component).toContain('<button type="button" aria-disabled={!canStop} aria-describedby={stopHintId}');
    expect(component).toContain("if (canStop) startup.stop?.()");
    expect(component).toContain('<th scope="row">{course.label}</th>');
  });
});
