import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { filterAutomatedWorkflows, orderWorkflowsAttentionFirst, needsAttention, lastRunChip, isStaleStarted } from "./automation-inventory-logic";
import type { WorkflowDef } from "@/lib/workflows/types";
import type { WorkflowSchedule } from "@/lib/workflow-schedules";
import type { WorkflowTrigger } from "@/lib/workflow-triggers";

// Helpers to create test fixtures
function makeWorkflow(overrides: Partial<WorkflowDef> = {}): WorkflowDef {
  return {
    id: "w1",
    name: "Test Workflow",
    description: "A test workflow",
    category: "grading",
    steps: [],
    scope: {},
    ...overrides,
  };
}

function makeSchedule(overrides: Partial<WorkflowSchedule> = {}): WorkflowSchedule {
  return {
    id: "s1",
    userId: "u1",
    workflowId: "w1",
    workflowName: "Test Workflow",
    fieldValues: {},
    nextRunAt: "2026-07-24T00:00:00.000Z",
    repeat: "weekly",
    enabled: true,
    courseId: null,
    institution: null,
    unattended: false,
    provider: null,
    disabledSteps: [],
    intervalMinutes: null,
    fanoutProgress: null,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunDetail: null,
    ...overrides,
  };
}

function makeTrigger(overrides: Partial<WorkflowTrigger> = {}): WorkflowTrigger {
  return {
    id: "t1",
    userId: "u1",
    workflowId: "w1",
    workflowName: "Test Workflow",
    fieldValues: {},
    eventType: "app-open",
    eventConfig: {},
    cursor: null,
    checkVersion: 0,
    enabled: true,
    courseId: null,
    institution: null,
    unattended: false,
    provider: null,
    disabledSteps: [],
    webhookToken: null,
    lastCheckedAt: null,
    lastFiredAt: null,
    lastRunStatus: null,
    lastRunDetail: null,
    ...overrides,
  };
}

describe("filterAutomatedWorkflows", () => {
  it("includes workflows with enabled schedules", () => {
    const workflows = [makeWorkflow({ id: "w1", name: "A" })];
    const schedules = [makeSchedule({ workflowId: "w1", enabled: true })];
    const triggers: WorkflowTrigger[] = [];

    const result = filterAutomatedWorkflows(workflows, schedules, triggers);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("w1");
  });

  it("includes workflows with disabled schedules", () => {
    const workflows = [makeWorkflow({ id: "w1", name: "A" })];
    const schedules = [makeSchedule({ workflowId: "w1", enabled: false })];
    const triggers: WorkflowTrigger[] = [];

    const result = filterAutomatedWorkflows(workflows, schedules, triggers);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("w1");
  });

  it("includes workflows with triggers (enabled or disabled)", () => {
    const workflows = [makeWorkflow({ id: "w1", name: "A" })];
    const schedules: WorkflowSchedule[] = [];
    const triggers = [makeTrigger({ workflowId: "w1", enabled: false })];

    const result = filterAutomatedWorkflows(workflows, schedules, triggers);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("w1");
  });

  it("excludes workflows with no schedules or triggers", () => {
    const workflows = [makeWorkflow({ id: "w1", name: "A" })];
    const schedules: WorkflowSchedule[] = [];
    const triggers: WorkflowTrigger[] = [];

    const result = filterAutomatedWorkflows(workflows, schedules, triggers);
    expect(result).toHaveLength(0);
  });

  it("excludes workflows with no matching schedule/trigger ids", () => {
    const workflows = [makeWorkflow({ id: "w1" }), makeWorkflow({ id: "w2" })];
    const schedules = [makeSchedule({ workflowId: "w1" })];
    const triggers: WorkflowTrigger[] = [];

    const result = filterAutomatedWorkflows(workflows, schedules, triggers);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("w1");
  });
});

describe("needsAttention", () => {
  it("returns true for schedules with error status", () => {
    const schedule = makeSchedule({ lastRunStatus: "error" });
    expect(needsAttention(schedule, null)).toBe(true);
  });

  it("returns true for schedules with stale-started status", () => {
    const tenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const schedule = makeSchedule({ lastRunStatus: "started", lastRunAt: tenMinutesAgo });
    expect(needsAttention(schedule, null)).toBe(true);
  });

  it("returns false for schedules with ok status", () => {
    const schedule = makeSchedule({ lastRunStatus: "ok" });
    expect(needsAttention(schedule, null)).toBe(false);
  });

  it("returns false for schedules with no status", () => {
    const schedule = makeSchedule({ lastRunStatus: null });
    expect(needsAttention(schedule, null)).toBe(false);
  });

  it("returns true for triggers with error status", () => {
    const trigger = makeTrigger({ lastRunStatus: "error" });
    expect(needsAttention(null, trigger)).toBe(true);
  });

  it("returns true for triggers with stale-started status", () => {
    const tenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const trigger = makeTrigger({ lastRunStatus: "started", lastFiredAt: tenMinutesAgo });
    expect(needsAttention(null, trigger)).toBe(true);
  });
});

describe("orderWorkflowsAttentionFirst", () => {
  it("sorts by attention (error/stale first), then alphabetically", () => {
    const workflows = [
      makeWorkflow({ id: "w3", name: "C" }),
      makeWorkflow({ id: "w1", name: "A" }),
      makeWorkflow({ id: "w2", name: "B" }),
    ];
    const schedules = [
      makeSchedule({ workflowId: "w1", lastRunStatus: "ok" }),
      makeSchedule({ workflowId: "w2", lastRunStatus: "error" }),
      makeSchedule({ workflowId: "w3", lastRunStatus: "ok" }),
    ];
    const triggers: WorkflowTrigger[] = [];

    const result = orderWorkflowsAttentionFirst(workflows, schedules, triggers);
    // w2 (error) should come first, then w1, w3 alphabetically
    expect(result[0].id).toBe("w2");
    expect(result[1].id).toBe("w1");
    expect(result[2].id).toBe("w3");
  });

  it("puts stale-started workflows before alphabetical ones", () => {
    const tenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const workflows = [
      makeWorkflow({ id: "w1", name: "A" }),
      makeWorkflow({ id: "w2", name: "B" }),
    ];
    const schedules = [
      makeSchedule({ workflowId: "w1", lastRunStatus: "started", lastRunAt: tenMinutesAgo }),
      makeSchedule({ workflowId: "w2", lastRunStatus: "ok" }),
    ];
    const triggers: WorkflowTrigger[] = [];

    const result = orderWorkflowsAttentionFirst(workflows, schedules, triggers);
    expect(result[0].id).toBe("w1");
    expect(result[1].id).toBe("w2");
  });

  it("alphabetizes workflows with same attention level", () => {
    const workflows = [
      makeWorkflow({ id: "w3", name: "C" }),
      makeWorkflow({ id: "w1", name: "A" }),
      makeWorkflow({ id: "w2", name: "B" }),
    ];
    const schedules = [
      makeSchedule({ workflowId: "w1" }),
      makeSchedule({ workflowId: "w2" }),
      makeSchedule({ workflowId: "w3" }),
    ];
    const triggers: WorkflowTrigger[] = [];

    const result = orderWorkflowsAttentionFirst(workflows, schedules, triggers);
    expect(result[0].name).toBe("A");
    expect(result[1].name).toBe("B");
    expect(result[2].name).toBe("C");
  });
});

describe("lastRunChip", () => {
  it("returns success class and 'Last run OK' text for ok status", () => {
    const chip = lastRunChip("ok", "2026-07-22T12:00:00.000Z");
    expect(chip.text).toBe("Last run OK");
    expect(chip.class).toContain("Success");
  });

  it("returns danger class and failed text for error status", () => {
    const chip = lastRunChip("error", "2026-07-22T12:00:00.000Z");
    expect(chip.text).toBe("Last run failed");
    expect(chip.class).toContain("Danger");
  });

  it("returns neutral class and skipped text for skipped status", () => {
    const chip = lastRunChip("skipped", "2026-07-22T12:00:00.000Z");
    expect(chip.text).toBe("Last run skipped");
    expect(chip.class).toContain("Neutral");
  });

  it("returns accent class and running text for recently started status (not stale)", () => {
    vi.useFakeTimers();
    const now = new Date("2026-07-22T12:00:00.000Z").getTime();
    vi.setSystemTime(now);
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();

    const chip = lastRunChip("started", fiveMinutesAgo);
    expect(chip.text).toBe("Running");
    expect(chip.class).toContain("Accent");

    vi.useRealTimers();
  });

  it("returns danger class and 'Did not finish' text for stale-started status (11 minutes ago)", () => {
    vi.useFakeTimers();
    const now = new Date("2026-07-22T12:00:00.000Z").getTime();
    vi.setSystemTime(now);
    const elevenMinutesAgo = new Date(now - 11 * 60 * 1000).toISOString();

    const chip = lastRunChip("started", elevenMinutesAgo);
    expect(chip.text).toBe("Did not finish");
    expect(chip.class).toContain("Danger");

    vi.useRealTimers();
  });

  it("pins the 10-minute boundary behavior (exactly 10 minutes is not stale, 10+ is stale)", () => {
    vi.useFakeTimers();
    const now = new Date("2026-07-22T12:00:00.000Z").getTime();
    vi.setSystemTime(now);
    const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();

    const chip = lastRunChip("started", tenMinutesAgo);
    expect(chip.text).toBe("Running");
    expect(chip.class).toContain("Accent");

    vi.useRealTimers();
  });

  it("returns empty class and text for null status", () => {
    const chip = lastRunChip(null, "2026-07-22T12:00:00.000Z");
    expect(chip.class).toBe("");
    expect(chip.text).toBe("");
  });
});

describe("isStaleStarted", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when anchor is null", () => {
    const result = isStaleStarted(null);
    expect(result).toBe(false);
  });

  it("returns false when anchor is undefined", () => {
    const undef: string | null | undefined = undefined;
    const result = isStaleStarted(undef);
    expect(result).toBe(false);
  });

  it("returns false for timestamps within 10 minutes", () => {
    const now = new Date("2026-07-22T12:00:00.000Z").getTime();
    vi.setSystemTime(now);
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();

    const result = isStaleStarted(fiveMinutesAgo);
    expect(result).toBe(false);
  });

  it("returns false for timestamps exactly 10 minutes old", () => {
    const now = new Date("2026-07-22T12:00:00.000Z").getTime();
    vi.setSystemTime(now);
    const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();

    const result = isStaleStarted(tenMinutesAgo);
    expect(result).toBe(false);
  });

  it("returns true for timestamps more than 10 minutes old", () => {
    const now = new Date("2026-07-22T12:00:00.000Z").getTime();
    vi.setSystemTime(now);
    const tenMinutesOneSecondAgo = new Date(now - 10 * 60 * 1000 - 1000).toISOString();

    const result = isStaleStarted(tenMinutesOneSecondAgo);
    expect(result).toBe(true);
  });

  it("returns true for timestamps much older than 10 minutes", () => {
    const now = new Date("2026-07-22T12:00:00.000Z").getTime();
    vi.setSystemTime(now);
    const twentyMinutesAgo = new Date(now - 20 * 60 * 1000).toISOString();

    const result = isStaleStarted(twentyMinutesAgo);
    expect(result).toBe(true);
  });
});
