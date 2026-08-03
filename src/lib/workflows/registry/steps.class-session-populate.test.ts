// resolveClassSessionProjectOverrides is the pure precedence rule
// populate-lms-from-class-template's run() applies to its projectMode/
// projectDescription inputs (steps.class-session-populate.ts): the
// template's own setting < the course's persisted project < an explicit run
// override. It was extracted verbatim (no behavior change) from run() so
// this precedence - the exact rule COURSE_BUILD's projectMode/
// projectDescription bindings had no way to exercise before they were fixed
// (presets/course-build.ts) - is directly unit-testable without mocking the
// rest of run() (template loading, Canvas/LLM calls).
//
// Every combination of {run override, persisted project, blank} is pinned
// below, including the two cases that already worked before the binding fix
// (blank run input + no persisted project stays on the template; blank run
// input + a persisted project auto-promotes) so a future change to this
// rule cannot silently regress them.

import { describe, it, expect } from "vitest";
import { resolveClassSessionProjectOverrides } from "./steps.class-session-populate";
import { emptyCourseProject, type CourseProject } from "@/lib/course-project";

function persistedProject(definition: string): CourseProject {
  return { ...emptyCourseProject(), mode: "course-long", definition };
}

describe("resolveClassSessionProjectOverrides", () => {
  // --- No persisted project on the tile ---

  it("no run override, no persisted project: stays on the template's own setting (unchanged - this case already worked)", () => {
    const result = resolveClassSessionProjectOverrides({}, emptyCourseProject());
    expect(result.projectMode).toBe("template");
    expect(result.projectDescription).toBe("");
  });

  it("blank-string run override, no persisted project: identical to no override at all", () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "", projectDescription: "" },
      emptyCourseProject()
    );
    expect(result.projectMode).toBe("template");
    expect(result.projectDescription).toBe("");
  });

  it('whitespace-only run override is treated as blank, not as a literal "  " mode', () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "   ", projectDescription: "   " },
      emptyCourseProject()
    );
    expect(result.projectMode).toBe("template");
    expect(result.projectDescription).toBe("");
  });

  it('explicit run override "none", no persisted project: honored (a genuine no-op here, since there is nothing to turn off)', () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "none" },
      emptyCourseProject()
    );
    expect(result.projectMode).toBe("none");
  });

  it('explicit run override "course-long" with a run-supplied description, no persisted project: both honored', () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "course-long", projectDescription: "A neighborhood cleanup tracker" },
      emptyCourseProject()
    );
    expect(result.projectMode).toBe("course-long");
    expect(result.projectDescription).toBe("A neighborhood cleanup tracker");
  });

  it('explicit run override "course-long" with NO run-supplied description and no persisted project: projectDescription resolves to "" (applyClassSessionOverrides then falls back to the template\'s own canned text)', () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "course-long" },
      emptyCourseProject()
    );
    expect(result.projectMode).toBe("course-long");
    expect(result.projectDescription).toBe("");
  });

  // --- A persisted course-long project on the tile ---

  it("no run override, a persisted project: silently auto-promotes to course-long, using the persisted description (unchanged - this case already worked, it is the bridge documented at the call site)", () => {
    const result = resolveClassSessionProjectOverrides({}, persistedProject("A term-long data pipeline"));
    expect(result.projectMode).toBe("course-long");
    expect(result.projectDescription).toBe("A term-long data pipeline");
  });

  it('explicit run override "none" with a persisted project: the run override wins outright - this is the genuinely NEW capability the binding fix unlocks (previously projectMode could only ever resolve to "" -> "template", so the auto-promotion above always fired and could never be turned off for one run)', () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "none" },
      persistedProject("A term-long data pipeline")
    );
    expect(result.projectMode).toBe("none");
  });

  it('explicit run override "course-long" with a persisted project but no run description: falls back to the persisted description', () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "course-long" },
      persistedProject("A term-long data pipeline")
    );
    expect(result.projectMode).toBe("course-long");
    expect(result.projectDescription).toBe("A term-long data pipeline");
  });

  it("a run-supplied description alone (no mode override) still wins over the persisted description, even though the mode itself only auto-promotes: the description precedence is independent of how projectMode got to course-long", () => {
    const result = resolveClassSessionProjectOverrides(
      { projectDescription: "This run only: focus on the deployment milestone" },
      persistedProject("A term-long data pipeline")
    );
    expect(result.projectMode).toBe("course-long");
    expect(result.projectDescription).toBe("This run only: focus on the deployment milestone");
  });

  it('explicit run override "course-long" WITH a run description, and a persisted project: the run description wins over the persisted one - "an explicit run override" outranks "the course\'s persisted project" for the description too, not just the mode', () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "course-long", projectDescription: "This run only: focus on the deployment milestone" },
      persistedProject("A term-long data pipeline")
    );
    expect(result.projectMode).toBe("course-long");
    expect(result.projectDescription).toBe("This run only: focus on the deployment milestone");
  });

  it('explicit run override literally "template" is indistinguishable from leaving the field blank: it still auto-promotes when the tile has a persisted project. Documented nuance, not a regression - "template" is not a forcing option, only "none"/"course-long" are genuine explicit overrides.', () => {
    const result = resolveClassSessionProjectOverrides(
      { projectMode: "template" },
      persistedProject("A term-long data pipeline")
    );
    expect(result.projectMode).toBe("course-long");
    expect(result.projectDescription).toBe("A term-long data pipeline");
  });

  it("a persisted project whose mode is not course-long (hasProject false) is treated exactly like no project at all", () => {
    const notReallyAProject: CourseProject = { ...emptyCourseProject(), mode: "none", definition: "Leftover text" };
    const result = resolveClassSessionProjectOverrides({}, notReallyAProject);
    expect(result.projectMode).toBe("template");
    expect(result.projectDescription).toBe("Leftover text");
  });
});
