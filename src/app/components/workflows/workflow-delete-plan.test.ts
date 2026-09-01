import { describe, it, expect } from "vitest";
import { buildWorkflowDeletePlan, armedWorkflowDeleteLabel } from "./workflow-delete-plan";

const schedules = [
  { id: "s1", workflowId: "wf-1" },
  { id: "s2", workflowId: "wf-1" },
  { id: "s3", workflowId: "wf-2" },
];
const triggers = [
  { id: "t1", workflowId: "wf-1" },
  { id: "t2", workflowId: "wf-2" },
];

describe("buildWorkflowDeletePlan", () => {
  it("collects only the schedules/triggers that target this workflow", () => {
    expect(buildWorkflowDeletePlan("wf-1", schedules, triggers)).toEqual({
      workflowId: "wf-1",
      scheduleIds: ["s1", "s2"],
      triggerIds: ["t1"],
    });
  });

  it("returns empty lists for a workflow with no automations", () => {
    expect(buildWorkflowDeletePlan("wf-3", schedules, triggers)).toEqual({
      workflowId: "wf-3",
      scheduleIds: [],
      triggerIds: [],
    });
  });

  it("never includes another workflow's schedule/trigger", () => {
    const plan = buildWorkflowDeletePlan("wf-1", schedules, triggers);
    expect(plan.scheduleIds).not.toContain("s3");
    expect(plan.triggerIds).not.toContain("t2");
  });
});

describe("armedWorkflowDeleteLabel", () => {
  it("names only the workflow when it has no automations", () => {
    const plan = buildWorkflowDeletePlan("wf-3", schedules, triggers);
    expect(armedWorkflowDeleteLabel("Solo workflow", plan)).toBe(
      'Confirm delete - "Solo workflow"'
    );
  });

  it("names the workflow, its schedule count, and its trigger count", () => {
    const plan = buildWorkflowDeletePlan("wf-1", schedules, triggers);
    expect(armedWorkflowDeleteLabel("Weekly announcements", plan)).toBe(
      'Confirm delete - "Weekly announcements", its 2 schedules and 1 trigger'
    );
  });

  it("names only schedules when there are no triggers, singular when exactly one", () => {
    const plan = buildWorkflowDeletePlan("wf-2", schedules, triggers);
    // wf-2 has 1 schedule (s3) and 1 trigger (t2)
    expect(armedWorkflowDeleteLabel("Grading pass", plan)).toBe(
      'Confirm delete - "Grading pass", its 1 schedule and 1 trigger'
    );
  });

  it("names only triggers when there are no schedules", () => {
    const plan = buildWorkflowDeletePlan("wf-x", [], [{ id: "t9", workflowId: "wf-x" }]);
    expect(armedWorkflowDeleteLabel("Trigger-only workflow", plan)).toBe(
      'Confirm delete - "Trigger-only workflow", its 1 trigger'
    );
  });
});
