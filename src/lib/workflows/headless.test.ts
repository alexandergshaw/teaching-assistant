import { describe, it, expect } from "vitest";
import {
  isHeadlessSafeWorkflow,
  HEADLESS_SAFE_STEP_TYPES,
  CONDITIONALLY_HEADLESS_SAFE,
  ALWAYS_INTERACTIVE_STEP_TYPES,
} from "./headless";
import { allWorkflows } from "./presets";
import { STEP_REGISTRY } from "./registry";
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
    expect(isHeadlessSafeWorkflow(byId("weekly-concept-animations"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("weekly-everything-prep"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("cartridge-grading"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("problem-solving-companion"), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(byId("module-homework-answers"), lookup)).toBe(true);
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

  it("treats audit-visualizer-coverage as headless-safe only when dispatch is NOT pinned to literal '1' (never a silent unattended Copilot dispatch)", () => {
    const make = (dispatch?: InputBinding): WorkflowDef => ({
      id: "avc-only",
      name: "Audit visualizer coverage only",
      description: "",
      steps: [
        {
          type: "audit-visualizer-coverage",
          bindings: {
            schedule: { source: "runtime", fieldKey: "schedule" },
            ...(dispatch ? { dispatch } : {}),
          },
        },
      ],
    });
    // Unbound, or pinned off -> the batched Copilot task can never fire -> headless-safe.
    expect(isHeadlessSafeWorkflow(make(undefined), lookup)).toBe(true);
    expect(isHeadlessSafeWorkflow(make({ source: "literal", value: "" }), lookup)).toBe(true);
    // Pinned on, or bound to a runtime field the predicate cannot see -> not safe.
    expect(isHeadlessSafeWorkflow(make({ source: "literal", value: "1" }), lookup)).toBe(false);
    expect(isHeadlessSafeWorkflow(make({ source: "runtime", fieldKey: "dispatchVisualizerGaps" }), lookup)).toBe(false);
  });

  it("rejects Course Refresh, Course Kickoff, and Course Kickoff (no codebase) (load-course-tile conditionally pauses)", () => {
    // Course Kickoff and Course Kickoff (no codebase) include Course Refresh's steps,
    // so all three are rejected for the same reason: load-course-tile.
    expect(isHeadlessSafeWorkflow(byId("course-refresh"), lookup)).toBe(false);
    expect(isHeadlessSafeWorkflow(byId("course-kickoff"), lookup)).toBe(false);
    expect(isHeadlessSafeWorkflow(byId("course-kickoff-no-code"), lookup)).toBe(false);
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

  it("has exactly 154 headless-safe step types", () => {
    expect(HEADLESS_SAFE_STEP_TYPES.size).toBe(154);
  });

  it("classifies schedule-weekly-announcements-for-term as headless-safe, a deliberate choice distinct from post-announcement (AC8 item 28)", () => {
    expect(HEADLESS_SAFE_STEP_TYPES.has("schedule-weekly-announcements-for-term")).toBe(true);
    expect(ALWAYS_INTERACTIVE_STEP_TYPES.has("schedule-weekly-announcements-for-term")).toBe(false);
  });

  it("accepts the unattended grade-to-draft preset (scoring only, no posting)", () => {
    expect(isHeadlessSafeWorkflow(byId("grade-to-draft-scorer"), lookup)).toBe(true);
  });

  it("rejects the review-grading-draft preset (pauses for human approval before posting)", () => {
    expect(isHeadlessSafeWorkflow(byId("review-grading-drafts"), lookup)).toBe(false);
  });
});

describe("headless classification vs. STEP_REGISTRY (structural coverage)", () => {
  // Guards the direction the count canary above cannot: it only proves the
  // headless-safe set has not SHRUNK. Nothing previously stopped a step type
  // newly added to STEP_REGISTRY from going unclassified forever - it would
  // just silently default to not-headless-safe, with the canary staying
  // green throughout. This test instead requires every STEP_REGISTRY type to
  // be classified in exactly one of the three headless.ts buckets, and every
  // entry in those buckets to still exist in STEP_REGISTRY (catching a stale
  // entry left behind when a step is deleted or renamed).
  const registryTypes = new Set(STEP_REGISTRY.map((s) => s.type));
  const conditionalTypes = new Set(Object.keys(CONDITIONALLY_HEADLESS_SAFE));

  it("classifies every STEP_REGISTRY step type in exactly one of HEADLESS_SAFE_STEP_TYPES, CONDITIONALLY_HEADLESS_SAFE, or ALWAYS_INTERACTIVE_STEP_TYPES", () => {
    const unclassified: string[] = [];
    const doubleClassified: string[] = [];

    for (const type of registryTypes) {
      const memberships = [
        HEADLESS_SAFE_STEP_TYPES.has(type),
        conditionalTypes.has(type),
        ALWAYS_INTERACTIVE_STEP_TYPES.has(type),
      ].filter(Boolean).length;
      if (memberships === 0) unclassified.push(type);
      if (memberships > 1) doubleClassified.push(type);
    }

    expect(
      unclassified,
      `headless.ts does not classify: ${unclassified.join(", ")}. ` +
        `For each, open its run() in registry/*.ts and add it to exactly one of: ` +
        `HEADLESS_SAFE_STEP_TYPES (only if run() never sets requireInput/requireConfirmation and has no ` +
        `browser-only dependency - this also bumps the "has exactly N headless-safe step types" canary above), ` +
        `CONDITIONALLY_HEADLESS_SAFE (if safety depends on how the step is bound, like prepare-lecture), or ` +
        `ALWAYS_INTERACTIVE_STEP_TYPES (otherwise - the default for anything that pauses, needs a live browser ` +
        `File, or is marked "Attended-only" in its own description).`
    ).toEqual([]);

    expect(
      doubleClassified,
      `The following step type(s) are classified in more than one of HEADLESS_SAFE_STEP_TYPES, ` +
        `CONDITIONALLY_HEADLESS_SAFE, and ALWAYS_INTERACTIVE_STEP_TYPES: ${doubleClassified.join(", ")}. ` +
        `A step type belongs in exactly one bucket - remove it from all but the correct one.`
    ).toEqual([]);
  });

  it("has no stale classification entries for step types no longer in STEP_REGISTRY", () => {
    const staleSafe = [...HEADLESS_SAFE_STEP_TYPES].filter((t) => !registryTypes.has(t));
    const staleConditional = [...conditionalTypes].filter((t) => !registryTypes.has(t));
    const staleInteractive = [...ALWAYS_INTERACTIVE_STEP_TYPES].filter((t) => !registryTypes.has(t));
    const stale = [...staleSafe, ...staleConditional, ...staleInteractive];

    expect(
      stale,
      `The following step type(s) are classified in headless.ts but no longer exist in STEP_REGISTRY: ` +
        `${stale.join(", ")}. Remove the stale entry from whichever of HEADLESS_SAFE_STEP_TYPES, ` +
        `CONDITIONALLY_HEADLESS_SAFE, or ALWAYS_INTERACTIVE_STEP_TYPES still lists it.`
    ).toEqual([]);
  });
});
