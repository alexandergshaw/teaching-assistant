import { describe, it, expect } from "vitest";
import {
  buildAutomationRows,
  compareAutomationRows,
  sortAutomationRows,
  parseAutomationSortState,
  DEFAULT_AUTOMATION_SORT,
  type AutomationTableRow,
  type AutomationSortState,
} from "./automations-table-helpers";
import type { WorkflowDef } from "./workflows/types";
import type { WorkflowSchedule } from "./workflow-schedules";
import type { WorkflowTrigger } from "./workflow-triggers";

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
    daysOfWeek: [],
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

// ---------------------------------------------------------------------------
// buildAutomationRows (grouping)
// ---------------------------------------------------------------------------

describe("buildAutomationRows", () => {
  it("splits schedules and triggers into their own groups when both kinds are present", () => {
    const workflows = [makeWorkflow({ id: "w1", name: "Grader" })];
    const schedules = [makeSchedule({ id: "s1", workflowId: "w1" })];
    const triggers = [makeTrigger({ id: "t1", workflowId: "w1" })];

    const { scheduled, triggered } = buildAutomationRows(workflows, schedules, triggers);

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].kind).toBe("scheduled");
    expect(scheduled[0].key).toBe("schedule:s1");
    expect(triggered).toHaveLength(1);
    expect(triggered[0].kind).toBe("triggered");
    expect(triggered[0].key).toBe("trigger:t1");
  });

  it("returns an empty scheduled group when only triggers exist", () => {
    const workflows = [makeWorkflow({ id: "w1" })];
    const triggers = [makeTrigger({ id: "t1", workflowId: "w1" })];

    const { scheduled, triggered } = buildAutomationRows(workflows, null, triggers);

    expect(scheduled).toHaveLength(0);
    expect(triggered).toHaveLength(1);
  });

  it("returns an empty triggered group when only schedules exist", () => {
    const workflows = [makeWorkflow({ id: "w1" })];
    const schedules = [makeSchedule({ id: "s1", workflowId: "w1" })];

    const { scheduled, triggered } = buildAutomationRows(workflows, schedules, null);

    expect(scheduled).toHaveLength(1);
    expect(triggered).toHaveLength(0);
  });

  it("returns both groups empty when there is nothing automated", () => {
    const { scheduled, triggered } = buildAutomationRows([], null, null);
    expect(scheduled).toHaveLength(0);
    expect(triggered).toHaveLength(0);
  });

  it("resolves each row's category from the owning workflow", () => {
    const workflows = [makeWorkflow({ id: "w1", category: "communication" })];
    const schedules = [makeSchedule({ id: "s1", workflowId: "w1" })];

    const { scheduled } = buildAutomationRows(workflows, schedules, null);
    expect(scheduled[0].category).toBe("communication");
  });

  it("a disabled schedule has no next run (nothing pending)", () => {
    const workflows = [makeWorkflow({ id: "w1" })];
    const schedules = [makeSchedule({ id: "s1", workflowId: "w1", enabled: false, nextRunAt: "2026-08-01T00:00:00.000Z" })];

    const { scheduled } = buildAutomationRows(workflows, schedules, null);
    expect(scheduled[0].nextRunAt).toBeNull();
  });

  it("a trigger never has a next run (event-driven)", () => {
    const workflows = [makeWorkflow({ id: "w1" })];
    const triggers = [makeTrigger({ id: "t1", workflowId: "w1" })];

    const { triggered } = buildAutomationRows(workflows, null, triggers);
    expect(triggered[0].nextRunAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// compareAutomationRows / sortAutomationRows
// ---------------------------------------------------------------------------

function row(overrides: Partial<AutomationTableRow>): AutomationTableRow {
  return {
    key: "schedule:x",
    kind: "scheduled",
    workflowId: "w1",
    name: "Zeta",
    category: null,
    fires: "",
    lastRunAt: null,
    lastRunStatus: null,
    lastRunDetail: null,
    nextRunAt: null,
    enabled: true,
    unattended: false,
    schedule: null,
    trigger: null,
    ...overrides,
  };
}

function sortState(field: AutomationSortState["field"], direction: AutomationSortState["direction"]): AutomationSortState {
  return { field, direction };
}

describe("compareAutomationRows - name", () => {
  it("sorts ascending and descending alphabetically", () => {
    const a = row({ name: "Beta" });
    const b = row({ name: "Alpha" });
    expect(compareAutomationRows(a, b, sortState("name", "asc"))).toBeGreaterThan(0);
    expect(compareAutomationRows(a, b, sortState("name", "desc"))).toBeLessThan(0);
  });
});

describe("compareAutomationRows - fires", () => {
  it("sorts ascending and descending alphabetically", () => {
    const a = row({ name: "A", fires: "daily" });
    const b = row({ name: "B", fires: "weekly" });
    expect(compareAutomationRows(a, b, sortState("fires", "asc"))).toBeLessThan(0);
    expect(compareAutomationRows(a, b, sortState("fires", "desc"))).toBeGreaterThan(0);
  });

  it("sorts a blank fires description last in both directions", () => {
    const withFires = row({ name: "A", fires: "daily" });
    const blank = row({ name: "B", fires: "" });
    expect(compareAutomationRows(withFires, blank, sortState("fires", "asc"))).toBeLessThan(0);
    expect(compareAutomationRows(withFires, blank, sortState("fires", "desc"))).toBeLessThan(0);
  });
});

describe("compareAutomationRows - lastRunAt", () => {
  it("sorts by timestamp ascending and descending", () => {
    const earlier = row({ name: "A", lastRunAt: "2026-01-01T00:00:00.000Z" });
    const later = row({ name: "B", lastRunAt: "2026-02-01T00:00:00.000Z" });
    expect(compareAutomationRows(earlier, later, sortState("lastRunAt", "asc"))).toBeLessThan(0);
    expect(compareAutomationRows(earlier, later, sortState("lastRunAt", "desc"))).toBeGreaterThan(0);
  });

  it("sorts a row that has never run last in both directions", () => {
    const ran = row({ name: "A", lastRunAt: "2026-01-01T00:00:00.000Z" });
    const neverRan = row({ name: "B", lastRunAt: null });
    expect(compareAutomationRows(ran, neverRan, sortState("lastRunAt", "asc"))).toBeLessThan(0);
    expect(compareAutomationRows(ran, neverRan, sortState("lastRunAt", "desc"))).toBeLessThan(0);
    // And the reverse comparison agrees (never-ran always sorts after).
    expect(compareAutomationRows(neverRan, ran, sortState("lastRunAt", "asc"))).toBeGreaterThan(0);
    expect(compareAutomationRows(neverRan, ran, sortState("lastRunAt", "desc"))).toBeGreaterThan(0);
  });
});

describe("compareAutomationRows - lastRunStatus", () => {
  it("sorts by status code ascending and descending", () => {
    const errored = row({ name: "A", lastRunStatus: "error" });
    const skipped = row({ name: "B", lastRunStatus: "skipped" });
    expect(compareAutomationRows(errored, skipped, sortState("lastRunStatus", "asc"))).toBeLessThan(0);
    expect(compareAutomationRows(errored, skipped, sortState("lastRunStatus", "desc"))).toBeGreaterThan(0);
  });

  it("sorts a row that has never run last in both directions", () => {
    const ran = row({ name: "A", lastRunStatus: "ok" });
    const neverRan = row({ name: "B", lastRunStatus: null });
    expect(compareAutomationRows(ran, neverRan, sortState("lastRunStatus", "asc"))).toBeLessThan(0);
    expect(compareAutomationRows(ran, neverRan, sortState("lastRunStatus", "desc"))).toBeLessThan(0);
    expect(compareAutomationRows(neverRan, ran, sortState("lastRunStatus", "asc"))).toBeGreaterThan(0);
    expect(compareAutomationRows(neverRan, ran, sortState("lastRunStatus", "desc"))).toBeGreaterThan(0);
  });

  it("is independent of lastRunAt - two rows with the same status but different timestamps still tie-break by name", () => {
    const a = row({ name: "Beta", lastRunStatus: "ok", lastRunAt: "2026-01-01T00:00:00.000Z" });
    const b = row({ name: "Alpha", lastRunStatus: "ok", lastRunAt: "2026-06-01T00:00:00.000Z" });
    expect(compareAutomationRows(a, b, sortState("lastRunStatus", "asc"))).toBeGreaterThan(0);
  });
});

describe("compareAutomationRows - nextRun", () => {
  it("sorts by timestamp ascending and descending", () => {
    const sooner = row({ name: "A", nextRunAt: "2026-01-01T00:00:00.000Z" });
    const later = row({ name: "B", nextRunAt: "2026-02-01T00:00:00.000Z" });
    expect(compareAutomationRows(sooner, later, sortState("nextRun", "asc"))).toBeLessThan(0);
    expect(compareAutomationRows(sooner, later, sortState("nextRun", "desc"))).toBeGreaterThan(0);
  });

  it("sorts a row with no next run (e.g. a trigger) last in both directions", () => {
    const scheduled = row({ name: "A", nextRunAt: "2026-01-01T00:00:00.000Z" });
    const triggered = row({ name: "B", kind: "triggered", nextRunAt: null });
    expect(compareAutomationRows(scheduled, triggered, sortState("nextRun", "asc"))).toBeLessThan(0);
    expect(compareAutomationRows(scheduled, triggered, sortState("nextRun", "desc"))).toBeLessThan(0);
  });
});

describe("compareAutomationRows - enabled", () => {
  it("sorts enabled before disabled ascending, and the reverse descending", () => {
    const enabled = row({ name: "A", enabled: true });
    const disabled = row({ name: "B", enabled: false });
    expect(compareAutomationRows(enabled, disabled, sortState("enabled", "asc"))).toBeLessThan(0);
    expect(compareAutomationRows(enabled, disabled, sortState("enabled", "desc"))).toBeGreaterThan(0);
  });
});

describe("compareAutomationRows - unattended", () => {
  it("sorts unattended before attended ascending, and the reverse descending", () => {
    const unattended = row({ name: "A", unattended: true });
    const attended = row({ name: "B", unattended: false });
    expect(compareAutomationRows(unattended, attended, sortState("unattended", "asc"))).toBeLessThan(0);
    expect(compareAutomationRows(unattended, attended, sortState("unattended", "desc"))).toBeGreaterThan(0);
  });
});

describe("compareAutomationRows - stability", () => {
  it("breaks ties on the sorted field by name ascending, regardless of direction", () => {
    const a = row({ name: "Beta", fires: "daily" });
    const b = row({ name: "Alpha", fires: "daily" });
    expect(compareAutomationRows(a, b, sortState("fires", "asc"))).toBeGreaterThan(0);
    expect(compareAutomationRows(a, b, sortState("fires", "desc"))).toBeGreaterThan(0);
  });

  it("two rows that are both missing the sorted value still tie-break by name", () => {
    const a = row({ name: "Beta", lastRunAt: null });
    const b = row({ name: "Alpha", lastRunAt: null });
    expect(compareAutomationRows(a, b, sortState("lastRunAt", "asc"))).toBeGreaterThan(0);
    expect(compareAutomationRows(a, b, sortState("lastRunAt", "desc"))).toBeGreaterThan(0);
  });

  it("sortAutomationRows produces a fully deterministic order for equal-key rows", () => {
    const rows = [row({ name: "Charlie", fires: "daily" }), row({ name: "Alpha", fires: "daily" }), row({ name: "Bravo", fires: "daily" })];
    const sorted = sortAutomationRows(rows, sortState("fires", "asc"));
    expect(sorted.map((r) => r.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });
});

describe("sortAutomationRows", () => {
  it("does not mutate the input array", () => {
    const rows = [row({ name: "Beta" }), row({ name: "Alpha" })];
    const original = [...rows];
    sortAutomationRows(rows, sortState("name", "asc"));
    expect(rows).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// parseAutomationSortState
// ---------------------------------------------------------------------------

describe("parseAutomationSortState", () => {
  it("parses a valid persisted value", () => {
    const stored = JSON.stringify({ field: "lastRunAt", direction: "desc" });
    expect(parseAutomationSortState(stored)).toEqual({ field: "lastRunAt", direction: "desc" });
  });

  it("parses a valid persisted value for the new status column", () => {
    const stored = JSON.stringify({ field: "lastRunStatus", direction: "asc" });
    expect(parseAutomationSortState(stored)).toEqual({ field: "lastRunStatus", direction: "asc" });
  });

  it("treats a stored value naming the old combined 'lastRun' field as corrupt and falls back to the default (the column it named was split into lastRunStatus/lastRunAt)", () => {
    const stored = JSON.stringify({ field: "lastRun", direction: "desc" });
    expect(parseAutomationSortState(stored)).toEqual(DEFAULT_AUTOMATION_SORT);
  });

  it("falls back to the default for an unrecognized column", () => {
    const stored = JSON.stringify({ field: "notARealColumn", direction: "asc" });
    expect(parseAutomationSortState(stored)).toEqual(DEFAULT_AUTOMATION_SORT);
  });

  it("falls back to the default for an unrecognized direction", () => {
    const stored = JSON.stringify({ field: "name", direction: "sideways" });
    expect(parseAutomationSortState(stored)).toEqual(DEFAULT_AUTOMATION_SORT);
  });

  it("falls back to the default for corrupt JSON", () => {
    expect(parseAutomationSortState("{not json")).toEqual(DEFAULT_AUTOMATION_SORT);
  });

  it("falls back to the default for null/empty input", () => {
    expect(parseAutomationSortState(null)).toEqual(DEFAULT_AUTOMATION_SORT);
    expect(parseAutomationSortState("")).toEqual(DEFAULT_AUTOMATION_SORT);
  });

  it("falls back to the default for a well-formed but wrong-shaped value", () => {
    expect(parseAutomationSortState(JSON.stringify(["name", "asc"]))).toEqual(DEFAULT_AUTOMATION_SORT);
    expect(parseAutomationSortState(JSON.stringify({ field: "name" }))).toEqual(DEFAULT_AUTOMATION_SORT);
  });
});
