import { describe, it, expect } from "vitest";
import { isHeadlessSafeWorkflow, HEADLESS_SAFE_STEP_TYPES } from "./headless";
import { allWorkflows } from "./presets";
import type { WorkflowDef, InputBinding } from "./types";

const workflows = allWorkflows([]);
const lookup = (id: string) => workflows.find((w) => w.id === id);
const byId = (id: string): WorkflowDef => {
  const def = lookup(id);
  if (!def) throw new Error(`Missing preset "${id}" in test fixture.`);
  return def;
};

describe("isHeadlessSafeWorkflow", () => {
  it("accepts the fully-headless presets", () => {
    expect(isHeadlessSafeWorkflow(byId("assign-due-dates"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("lecture-qa"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("starter-materials"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("repo-agent-update"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("student-repo-assignment"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("morning-briefing"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("inbox-reply-drafts"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("meeting-request-autopilot"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("grade-when-needed"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("deadline-reminder-drafts"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("nudge-missing-submissions"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("quiz-pipeline"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("course-health-check"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("next-week-lectures"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("closed-institution-onboarding"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("nudge-missing-from-gradebook"), lookup)).toBe(true);
  });

  it("rejects presets with an interactive step", () => {
    expect(isHeadlessSafeWorkflow(byId("grade-submissions"), lookup)).toBe(false);
    expect(isHeadlessSafeWorkflow(byId("prepare-lecture"), lookup)).toBe(false);
    expect(isHeadlessSafeWorkflow(byId("import-courses"), lookup)).toBe(false);
    expect(isHeadlessSafeWorkflow(byId("update-course-tech"), lookup)).toBe(false);
    expect(isHeadlessSafeWorkflow(byId("copilot-pr-shepherd"), lookup)).toBe(false);
    expect(isHeadlessSafeWorkflow(byId("term-kickoff-import"), lookup)).toBe(false);
    expect(isHeadlessSafeWorkflow(byId("review-and-export-grades-csv"), lookup)).toBe(false);
  });

  it("treats prepare-lecture as headless-safe only when autonomous is pinned to literal '1'", () => {
    const make = (autonomous?: InputBinding): WorkflowDef => ({
      id: "pl-only",
      name: "Prepare lecture only",
      description: "",
      steps: [
        {
          type: "prepare-lecture",
          bindings: {
            hubCourse: { source: "runtime", fieldKey: "hubCourse" },
            ...(autonomous ? { autonomous } : {}),
          },
        },
      ],
    });
    // Pinned on -> no review pause -> headless-safe.
    expect(isHeadlessSafeWorkflow(make({ source: "literal", value: "1" }), lookup)).toBe(true);
    // Pinned off, a runtime field the predicate cannot see, or absent -> not safe.
    expect(isHeadlessSafeWorkflow(make({ source: "literal", value: "" }), lookup)).toBe(false);
    expect(isHeadlessSafeWorkflow(make({ source: "runtime", fieldKey: "autonomous" }), lookup)).toBe(false);
    expect(isHeadlessSafeWorkflow(make(undefined), lookup)).toBe(false);
  });

  it("rejects Course Refresh and Course Kickoff (load-course-tile conditionally pauses)", () => {
    // Course Kickoff includes Course Refresh's steps, so both are rejected
    // for the same reason: load-course-tile.
    expect(isHeadlessSafeWorkflow(byId("course-refresh"), lookup)).toBe(false);
    expect(isHeadlessSafeWorkflow(byId("course-kickoff"), lookup)).toBe(false);
  });

  it("rejects a workflow with an include cycle instead of throwing", () => {
    const a: WorkflowDef = {
      id: "cycle-a",
      name: "A",
      description: "",
      steps: [
        {
          type: "include-workflow",
          bindings: {},
          include: { workflowId: "cycle-b", skipSteps: [], remap: {} },
        },
      ],
    };
    const b: WorkflowDef = {
      id: "cycle-b",
      name: "B",
      description: "",
      steps: [
        {
          type: "include-workflow",
          bindings: {},
          include: { workflowId: "cycle-a", skipSteps: [], remap: {} },
        },
      ],
    };
    const cycleLookup = (id: string) => (id === "cycle-a" ? a : id === "cycle-b" ? b : undefined);
    expect(isHeadlessSafeWorkflow(a, cycleLookup)).toBe(false);
  });

  it("rejects a workflow with an unresolvable include", () => {
    const def: WorkflowDef = {
      id: "broken",
      name: "Broken",
      description: "",
      steps: [
        {
          type: "include-workflow",
          bindings: {},
          include: { workflowId: "does-not-exist", skipSteps: [], remap: {} },
        },
      ],
    };
    expect(isHeadlessSafeWorkflow(def, () => undefined)).toBe(false);
  });

  it("rejects a workflow with zero steps", () => {
    const def: WorkflowDef = { id: "empty", name: "Empty", description: "", steps: [] };
    expect(isHeadlessSafeWorkflow(def, () => undefined)).toBe(false);
  });

  it("accepts a synthetic workflow made only of headless-safe step types", () => {
    const def: WorkflowDef = {
      id: "synthetic",
      name: "Synthetic",
      description: "",
      steps: [
        { type: "generate-schedule", bindings: {} },
        { type: "post-grades", bindings: {} },
      ],
    };
    expect(isHeadlessSafeWorkflow(def, () => undefined)).toBe(true);
  });

  it("rejects a workflow with one interactive step mixed among headless-safe ones", () => {
    const def: WorkflowDef = {
      id: "mixed",
      name: "Mixed",
      description: "",
      steps: [
        { type: "generate-schedule", bindings: {} },
        { type: "grading-preflight", bindings: {} },
      ],
    };
    expect(isHeadlessSafeWorkflow(def, () => undefined)).toBe(false);
  });

  it("has exactly 117 headless-safe step types", () => {
    expect(HEADLESS_SAFE_STEP_TYPES.size).toBe(117);
  });

  it("accepts the unattended grade-to-draft preset (scoring only, no posting)", () => {
    expect(isHeadlessSafeWorkflow(byId("grade-to-draft-scorer"), lookup)).toBe(true);
  });

  it("rejects the review-grading-draft preset (pauses for human approval before posting)", () => {
    expect(isHeadlessSafeWorkflow(byId("review-grading-drafts"), lookup)).toBe(false);
  });
});
