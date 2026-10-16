import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string): string => readFileSync(join(process.cwd(), p), "utf8");

describe("two-phase Courses load wiring", () => {
  const hook = read("src/app/components/courses/useCoursesData.ts");

  it("the hook calls the light action and merges the full rows", () => {
    expect(hook).toMatch(/listCourseHubLightAction\(\)/);
    expect(hook).toMatch(/mergeHydratedCourses\(/);
    expect(hook).toMatch(/setHeavyReady\(false\)/);
    expect(hook).toMatch(/setHeavyReady\(true\)/);
  });

  it("shows light course rows before waiting for supporting metadata", () => {
    const twoPhase = hook.slice(hook.indexOf("if (twoPhase) {"), hook.indexOf("const [c, s, o, t] = await Promise.all"));
    const lightLoad = twoPhase.indexOf("const c = await listCourseHubLightAction();");
    const firstRows = twoPhase.indexOf("setCourses(c.courses);", lightLoad);
    const firstPaint = twoPhase.indexOf('setState("idle");', firstRows);
    const auxiliaryWait = twoPhase.indexOf("await auxiliaryPromise", firstPaint);

    expect(twoPhase).toContain("const auxiliaryPromise = Promise.all([");
    expect(lightLoad).toBeGreaterThanOrEqual(0);
    expect(firstRows).toBeGreaterThan(lightLoad);
    expect(firstPaint).toBeGreaterThan(firstRows);
    expect(auxiliaryWait).toBeGreaterThan(firstPaint);
    expect(twoPhase).toContain("const fullPromise = listCourseHubAction();");
  });

  it("discards in-flight loads when the cache owner changes", () => {
    expect(hook).toMatch(/registerOwnerScopedCache\(\(\) => \{\s*hubCache = null;\s*hubCacheGeneration\+\+;/);
    expect(hook).toMatch(/const cacheGeneration = hubCacheGeneration;/);
    expect(hook).toMatch(/cacheGeneration === hubCacheGeneration/);
    expect(hook).toMatch(/if \(!isCurrentLoad\(\)\) return;/);
  });

  it("the table body is inert until heavyReady and CoursesTab passes the flag", () => {
    expect(read("src/app/components/courses/CoursesTable.tsx")).toMatch(/<tbody inert=\{!heavyReady\}>/);
    expect(read("src/app/components/CoursesTab.tsx")).toMatch(/heavyReady=\{heavyReady\}/);
  });

  it("CourseRow swaps heavy cells for a placeholder via heavyReadReady", () => {
    expect(read("src/app/components/courses/CourseRow.tsx")).toMatch(/heavyReadReady\(heavyReady, id\)/);
  });

  it("the light action is exported from course-hub-core and selects through listCoursesLight", () => {
    const core = read("src/app/actions/course-hub-core.ts");
    expect(core).toMatch(/export async function listCourseHubLightAction/);
    expect(core).toMatch(/listCoursesLight\(user\.id\)/);
  });
});
