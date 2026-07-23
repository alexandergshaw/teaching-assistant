import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { filterAutomatedWorkflows, orderWorkflowsAttentionFirst, needsAttention, lastRunChip, isStaleStarted, scheduleRowKey, triggerRowKey, resolveCourseName, formatFieldValues } from "./automation-inventory-logic";
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
    recoveryAttempts: 0,
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
    recoveryAttempts: 0,
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

describe("scheduleRowKey", () => {
  it("returns schedule prefix with id", () => {
    const result = scheduleRowKey("s1");
    expect(result).toBe("schedule:s1");
  });

  it("generates same key for same input", () => {
    const key1 = scheduleRowKey("s123");
    const key2 = scheduleRowKey("s123");
    expect(key1).toBe(key2);
  });

  it("generates distinct keys for different ids", () => {
    const key1 = scheduleRowKey("s1");
    const key2 = scheduleRowKey("s2");
    expect(key1).not.toBe(key2);
  });

  it("preserves id uniqueness in key (two schedules same workflow have distinct keys)", () => {
    const schedule1 = makeSchedule({ id: "s1", workflowId: "w1" });
    const schedule2 = makeSchedule({ id: "s2", workflowId: "w1" });

    const key1 = scheduleRowKey(schedule1.id);
    const key2 = scheduleRowKey(schedule2.id);

    expect(key1).toBe("schedule:s1");
    expect(key2).toBe("schedule:s2");
    expect(key1).not.toBe(key2);
  });

  it("handles special characters in id", () => {
    const result = scheduleRowKey("s-1_abc.def");
    expect(result).toBe("schedule:s-1_abc.def");
  });
});

describe("triggerRowKey", () => {
  it("returns trigger prefix with id", () => {
    const result = triggerRowKey("t1");
    expect(result).toBe("trigger:t1");
  });

  it("generates same key for same input", () => {
    const key1 = triggerRowKey("t123");
    const key2 = triggerRowKey("t123");
    expect(key1).toBe(key2);
  });

  it("generates distinct keys for different ids", () => {
    const key1 = triggerRowKey("t1");
    const key2 = triggerRowKey("t2");
    expect(key1).not.toBe(key2);
  });

  it("preserves id uniqueness in key", () => {
    const trigger1 = makeTrigger({ id: "t1", workflowId: "w1" });
    const trigger2 = makeTrigger({ id: "t2", workflowId: "w1" });

    const key1 = triggerRowKey(trigger1.id);
    const key2 = triggerRowKey(trigger2.id);

    expect(key1).toBe("trigger:t1");
    expect(key2).toBe("trigger:t2");
    expect(key1).not.toBe(key2);
  });

  it("distinguishes schedule and trigger keys", () => {
    const scheduleKey = scheduleRowKey("row1");
    const triggerKey = triggerRowKey("row1");

    expect(scheduleKey).not.toBe(triggerKey);
    expect(scheduleKey).toBe("schedule:row1");
    expect(triggerKey).toBe("trigger:row1");
  });
});

describe("resolveCourseName", () => {
  it("returns null when courseId is null", () => {
    const result = resolveCourseName(null, [{ id: "c1", name: "Course 1" }]);
    expect(result).toBeNull();
  });

  it("returns null when courseId is empty string", () => {
    const result = resolveCourseName("", [{ id: "c1", name: "Course 1" }]);
    expect(result).toBeNull();
  });

  it("returns course name when found in hubCourses", () => {
    const hubCourses = [
      { id: "c1", name: "Math 101" },
      { id: "c2", name: "English 201" },
    ];
    const result = resolveCourseName("c1", hubCourses);
    expect(result).toBe("Math 101");
  });

  it("returns fallback 'course' when courseId not found in hubCourses", () => {
    const hubCourses = [{ id: "c1", name: "Math 101" }];
    const result = resolveCourseName("c99", hubCourses);
    expect(result).toBe("course");
  });

  it("returns fallback 'course' when hubCourses is null", () => {
    const result = resolveCourseName("c1", null);
    expect(result).toBe("course");
  });

  it("returns fallback 'course' when hubCourses is empty array", () => {
    const result = resolveCourseName("c1", []);
    expect(result).toBe("course");
  });

  it("finds course by id even if multiple courses exist", () => {
    const hubCourses = [
      { id: "c1", name: "First" },
      { id: "c2", name: "Second" },
      { id: "c3", name: "Third" },
    ];
    const result = resolveCourseName("c2", hubCourses);
    expect(result).toBe("Second");
  });

  it("returns exact course name without modification", () => {
    const hubCourses = [{ id: "c1", name: "Complex Name With Spaces 123" }];
    const result = resolveCourseName("c1", hubCourses);
    expect(result).toBe("Complex Name With Spaces 123");
  });
});

describe("formatFieldValues", () => {
  it("returns empty array when fieldValues is empty", () => {
    const result = formatFieldValues({});
    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  it("filters out empty string values", () => {
    const fieldValues = {
      name: "John",
      email: "",
      age: "25",
      notes: "",
    };
    const result = formatFieldValues(fieldValues);
    expect(result).toEqual([
      { key: "name", value: "John" },
      { key: "age", value: "25" },
    ]);
  });

  it("includes all non-empty values", () => {
    const fieldValues = {
      field1: "value1",
      field2: "value2",
      field3: "value3",
    };
    const result = formatFieldValues(fieldValues);
    expect(result).toHaveLength(3);
    expect(result).toContainEqual({ key: "field1", value: "value1" });
    expect(result).toContainEqual({ key: "field2", value: "value2" });
    expect(result).toContainEqual({ key: "field3", value: "value3" });
  });

  it("preserves stable order (Object.entries iteration)", () => {
    const fieldValues = {
      zebra: "z",
      apple: "a",
      middle: "m",
    };
    const result = formatFieldValues(fieldValues);
    // Object.entries preserves insertion order in modern JS
    expect(result[0].key).toBe("zebra");
    expect(result[1].key).toBe("apple");
    expect(result[2].key).toBe("middle");
  });

  it("handles long values without truncation", () => {
    const longValue = "a".repeat(500);
    const fieldValues = {
      description: longValue,
      other: "short",
    };
    const result = formatFieldValues(fieldValues);
    expect(result).toContainEqual({ key: "description", value: longValue });
    expect(result[0].value).toHaveLength(500);
  });

  it("skips only empty strings, preserves spaces and special characters", () => {
    const fieldValues = {
      empty: "",
      space: " ",
      special: "!@#$%",
      zero: "0",
      newline: "line1\nline2",
    };
    const result = formatFieldValues(fieldValues);
    expect(result).toContainEqual({ key: "space", value: " " });
    expect(result).toContainEqual({ key: "special", value: "!@#$%" });
    expect(result).toContainEqual({ key: "zero", value: "0" });
    expect(result).toContainEqual({ key: "newline", value: "line1\nline2" });
    expect(result).toHaveLength(4);
  });

  it("returns an array of objects with key and value properties", () => {
    const fieldValues = { test: "value" };
    const result = formatFieldValues(fieldValues);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("key");
    expect(result[0]).toHaveProperty("value");
  });
});
