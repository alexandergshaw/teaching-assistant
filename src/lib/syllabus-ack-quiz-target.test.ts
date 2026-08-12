// The syllabus acknowledgement quiz's module target - the two decisions that
// can be tested without rendering anything.
//
// Written before the implementation; currently failing. Contract from
// docs/syllabus-ack-quiz-module-target-acceptance-criteria.md.
//
// vitest here is node-env and collects only src/**/*.test.ts, so the select
// itself, its default and its persistence are verified by reading. What IS
// executable is the pair of decisions that would otherwise hide in a component:
// which target a stored choice resolves to against THIS course's modules, and
// what a second press should do when the quiz already exists. Both are pure, so
// both are pinned here.
import { describe, it, expect } from "vitest";
// The sentinel is imported from THIS pure module, not from the hook that
// declares it today. A dependency-free lib must not reach into a client hook,
// and the constant needs exactly one owner - so the sentinel moves here and the
// hook re-exports it for its existing consumers.
import {
  initialModuleChoice,
  syllabusQuizLinkDecision,
  NEW_MODULE_TARGET_VALUE,
  type ModuleOption,
} from "./syllabus-ack-quiz-target";

const START_HERE: ModuleOption = { id: 7, name: "Start Here" };
const WEEK_ONE: ModuleOption = { id: 12, name: "Week 1" };
const MODULES: ModuleOption[] = [WEEK_ONE, START_HERE];

describe("initialModuleChoice", () => {
  it("defaults to the Start Here module when the course has one", () => {
    expect(initialModuleChoice(MODULES, null)).toBe("7");
  });

  it("matches Start Here regardless of case and surrounding whitespace", () => {
    // The existing findStartHereModule contract - a course titled "start here"
    // or " Start Here " is the same module to an instructor.
    expect(initialModuleChoice([{ id: 3, name: "  start HERE " }], null)).toBe("3");
  });

  it("defaults to NOTHING when there is no Start Here module", () => {
    // Deliberately not the first module: silently filing the quiz somewhere the
    // instructor did not choose is the behaviour this path has always refused,
    // and its sibling button's first-module fallback is not inherited here.
    expect(initialModuleChoice([WEEK_ONE], null)).toBe("");
  });

  it("restores a stored choice that still resolves in this course", () => {
    expect(initialModuleChoice(MODULES, "12")).toBe("12");
  });

  it("discards a stored id that no longer exists and falls back to the default", () => {
    // Module ids are course-specific, so a remembered id from another course
    // must never resurrect as a silent target.
    expect(initialModuleChoice(MODULES, "999")).toBe("7");
    expect(initialModuleChoice([WEEK_ONE], "999")).toBe("");
  });

  it("keeps a stored new-module choice, which names no id to validate", () => {
    expect(initialModuleChoice(MODULES, NEW_MODULE_TARGET_VALUE)).toBe(NEW_MODULE_TARGET_VALUE);
  });

  it("ignores stored junk", () => {
    for (const junk of ["", "  ", "abc", "12abc"]) {
      expect(initialModuleChoice(MODULES, junk)).toBe("7");
    }
  });
});

describe("syllabusQuizLinkDecision", () => {
  it("links a newly created quiz into the chosen existing module", () => {
    expect(syllabusQuizLinkDecision({ existing: null, target: { kind: "existing", moduleId: 7 } })).toEqual({
      action: "link",
      moduleId: 7,
    });
  });

  it("creates the named module first when the instructor chose a new one", () => {
    expect(syllabusQuizLinkDecision({ existing: null, target: { kind: "new", name: "Start Here" } })).toEqual({
      action: "create-module-then-link",
      name: "Start Here",
    });
  });

  it("leaves a new quiz unlinked when no target was chosen, exactly as today", () => {
    const decision = syllabusQuizLinkDecision({ existing: null, target: null });
    expect(decision.action).toBe("none");
    if (decision.action === "none") expect(decision.reason.trim().length).toBeGreaterThan(0);
  });

  it("links an existing quiz that sits in no module, rather than leaving it stranded", () => {
    expect(
      syllabusQuizLinkDecision({ existing: { inModule: null }, target: { kind: "existing", moduleId: 12 } })
    ).toEqual({ action: "link", moduleId: 12 });
  });

  it("never re-homes an existing quiz that already lives in a module", () => {
    // Moving it is a bigger action than was asked for. Report where it is.
    const decision = syllabusQuizLinkDecision({
      existing: { inModule: { id: 7, name: "Start Here" } },
      target: { kind: "existing", moduleId: 12 },
    });
    expect(decision).toEqual({ action: "report-existing", moduleName: "Start Here" });
  });

  it("reports an existing placed quiz even when the same module was chosen", () => {
    const decision = syllabusQuizLinkDecision({
      existing: { inModule: { id: 7, name: "Start Here" } },
      target: { kind: "existing", moduleId: 7 },
    });
    expect(decision.action).toBe("report-existing");
  });

  it("does nothing for an existing unlinked quiz when no target was chosen", () => {
    expect(syllabusQuizLinkDecision({ existing: { inModule: null }, target: null }).action).toBe("none");
  });

  it("never returns an action that would create a module unless one was named", () => {
    // Guards the amended criterion: creating a module is permitted ONLY as the
    // instructor's explicit choice, never as a side effect of any other branch.
    const inputs = [
      { existing: null, target: null },
      { existing: null, target: { kind: "existing" as const, moduleId: 7 } },
      { existing: { inModule: null }, target: { kind: "existing" as const, moduleId: 7 } },
      { existing: { inModule: { id: 7, name: "Start Here" } }, target: null },
    ];
    for (const input of inputs) {
      expect(syllabusQuizLinkDecision(input).action).not.toBe("create-module-then-link");
    }
  });

  it("links an unlinked existing quiz into a brand-new module when that was chosen", () => {
    // Not explicitly walked through by the AC doc's prose, but implied by
    // AC4's "reuses rather than duplicates" reasoning applying uniformly to
    // both the freshly-created-quiz and already-exists paths: an already-
    // exists quiz sitting in no module should be able to reach
    // "create-module-then-link" too, the same as a freshly created one can.
    expect(
      syllabusQuizLinkDecision({ existing: { inModule: null }, target: { kind: "new", name: "Week 1" } })
    ).toEqual({ action: "create-module-then-link", name: "Week 1" });
  });
});

// AC8: zero modules is not an error - the pure default/decision layer never
// special-cases an empty course, it just has nothing to match.
describe("AC8 - a course with no modules at all", () => {
  it("initialModuleChoice defaults to nothing, never throws, for an empty module list", () => {
    expect(initialModuleChoice([], null)).toBe("");
    expect(initialModuleChoice([], "999")).toBe("");
    expect(initialModuleChoice([], NEW_MODULE_TARGET_VALUE)).toBe(NEW_MODULE_TARGET_VALUE);
  });
});
