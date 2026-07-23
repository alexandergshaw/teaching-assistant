import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  scheduleToForm,
  triggerToForm,
  validateScheduleForm,
  validateTriggerForm,
  type ScheduleFormData,
  type TriggerFormData,
} from "./workflow-form-helpers";
import type { WorkflowSchedule } from "./workflow-schedules";
import type { WorkflowTrigger } from "./workflow-triggers";
import type { WorkflowDef } from "./workflows/types";

describe("scheduleToForm", () => {
  it("converts interval minutes to hours when divisible by 60", () => {
    const schedule: WorkflowSchedule = {
      id: "s1",
      userId: "u1",
      workflowId: "wf1",
      workflowName: "Test",
      fieldValues: {},
      nextRunAt: "2026-07-21T14:00:00.000Z",
      repeat: "interval",
      enabled: true,
      courseId: null,
      institution: null,
      lastRunAt: null,
      intervalMinutes: 120,
      unattended: false,
      provider: null,
      disabledSteps: [],
      fanoutProgress: null,
      lastRunStatus: null,
      lastRunDetail: null,
      recoveryAttempts: 0,
    };
    const form = scheduleToForm(schedule);
    expect(form.intervalValue).toBe("2");
    expect(form.intervalUnit).toBe("hours");
  });

  it("keeps minutes when not divisible by 60", () => {
    const schedule: WorkflowSchedule = {
      id: "s1",
      userId: "u1",
      workflowId: "wf1",
      workflowName: "Test",
      fieldValues: {},
      nextRunAt: "2026-07-21T14:00:00.000Z",
      repeat: "interval",
      enabled: true,
      courseId: null,
      institution: null,
      lastRunAt: null,
      intervalMinutes: 90,
      unattended: false,
      provider: null,
      disabledSteps: [],
      fanoutProgress: null,
      lastRunStatus: null,
      lastRunDetail: null,
      recoveryAttempts: 0,
    };
    const form = scheduleToForm(schedule);
    expect(form.intervalValue).toBe("90");
    expect(form.intervalUnit).toBe("minutes");
  });

  it("keeps minutes for small intervals", () => {
    const schedule: WorkflowSchedule = {
      id: "s1",
      userId: "u1",
      workflowId: "wf1",
      workflowName: "Test",
      fieldValues: {},
      nextRunAt: "2026-07-21T14:00:00.000Z",
      repeat: "interval",
      enabled: true,
      courseId: null,
      institution: null,
      lastRunAt: null,
      intervalMinutes: 45,
      unattended: false,
      provider: null,
      disabledSteps: [],
      fanoutProgress: null,
      lastRunStatus: null,
      lastRunDetail: null,
      recoveryAttempts: 0,
    };
    const form = scheduleToForm(schedule);
    expect(form.intervalValue).toBe("45");
    expect(form.intervalUnit).toBe("minutes");
  });

  it("returns empty interval fields for non-interval schedules", () => {
    const schedule: WorkflowSchedule = {
      id: "s1",
      userId: "u1",
      workflowId: "wf1",
      workflowName: "Test",
      fieldValues: {},
      nextRunAt: "2026-07-21T14:00:00.000Z",
      repeat: "daily",
      enabled: true,
      courseId: null,
      institution: null,
      lastRunAt: null,
      intervalMinutes: null,
      unattended: false,
      provider: null,
      disabledSteps: [],
      fanoutProgress: null,
      lastRunStatus: null,
      lastRunDetail: null,
      recoveryAttempts: 0,
    };
    const form = scheduleToForm(schedule);
    expect(form.intervalValue).toBe("");
    expect(form.intervalUnit).toBe("minutes");
  });

  it("converts nextRunAt to local datetime-local format", () => {
    // Create a date in local time
    const localDate = new Date(2026, 6, 21, 14, 30); // July 21 2026 2:30 PM
    const isoStr = localDate.toISOString();

    const schedule: WorkflowSchedule = {
      id: "s1",
      userId: "u1",
      workflowId: "wf1",
      workflowName: "Test",
      fieldValues: {},
      nextRunAt: isoStr,
      repeat: "none",
      enabled: true,
      courseId: null,
      institution: null,
      lastRunAt: null,
      intervalMinutes: null,
      unattended: false,
      provider: null,
      disabledSteps: [],
      fanoutProgress: null,
      lastRunStatus: null,
      lastRunDetail: null,
      recoveryAttempts: 0,
    };
    const form = scheduleToForm(schedule);
    // The runAt should be YYYY-MM-DDTHH:mm in local time
    expect(form.runAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    // Verify it parses as a datetime-local input
    expect(new Date(form.runAt)).toBeTruthy();
  });

  it("preserves courseId and institution", () => {
    const schedule: WorkflowSchedule = {
      id: "s1",
      userId: "u1",
      workflowId: "wf1",
      workflowName: "Test",
      fieldValues: {},
      nextRunAt: "2026-07-21T14:00:00.000Z",
      repeat: "none",
      enabled: true,
      courseId: "course123",
      institution: "example.edu",
      lastRunAt: null,
      intervalMinutes: null,
      unattended: true,
      provider: null,
      disabledSteps: [],
      fanoutProgress: null,
      lastRunStatus: null,
      lastRunDetail: null,
      recoveryAttempts: 0,
    };
    const form = scheduleToForm(schedule);
    expect(form.courseId).toBe("course123");
    expect(form.institution).toBe("example.edu");
    expect(form.unattended).toBe(true);
  });

  it("returns empty strings for null courseId and institution", () => {
    const schedule: WorkflowSchedule = {
      id: "s1",
      userId: "u1",
      workflowId: "wf1",
      workflowName: "Test",
      fieldValues: {},
      nextRunAt: "2026-07-21T14:00:00.000Z",
      repeat: "none",
      enabled: true,
      courseId: null,
      institution: null,
      lastRunAt: null,
      intervalMinutes: null,
      unattended: false,
      provider: null,
      disabledSteps: [],
      fanoutProgress: null,
      lastRunStatus: null,
      lastRunDetail: null,
      recoveryAttempts: 0,
    };
    const form = scheduleToForm(schedule);
    expect(form.courseId).toBe("");
    expect(form.institution).toBe("");
  });
});

describe("triggerToForm", () => {
  it("converts trigger to form state", () => {
    const trigger: WorkflowTrigger = {
      id: "t1",
      userId: "u1",
      workflowId: "wf1",
      workflowName: "Test",
      fieldValues: {},
      eventType: "submission-received",
      eventConfig: { institution: "example.edu", threshold: "5" },
      cursor: null,
      checkVersion: 0,
      enabled: true,
      unattended: false,
      provider: null,
      disabledSteps: [],
      courseId: null,
      institution: null,
      webhookToken: null,
      lastCheckedAt: null,
      lastFiredAt: null,
      lastRunStatus: null,
      lastRunDetail: null,
      recoveryAttempts: 0,
    };
    const form = triggerToForm(trigger);
    expect(form.eventType).toBe("submission-received");
    expect(form.config).toEqual({ institution: "example.edu", threshold: "5" });
    expect(form.courseId).toBe("");
    expect(form.institution).toBe("");
    expect(form.unattended).toBe(false);
  });

  it("preserves courseId and institution", () => {
    const trigger: WorkflowTrigger = {
      id: "t1",
      userId: "u1",
      workflowId: "wf1",
      workflowName: "Test",
      fieldValues: {},
      eventType: "webhook",
      eventConfig: {},
      cursor: null,
      checkVersion: 0,
      enabled: true,
      unattended: true,
      provider: null,
      disabledSteps: [],
      courseId: "course123",
      institution: "example.edu",
      webhookToken: "token123",
      lastCheckedAt: null,
      lastFiredAt: null,
      lastRunStatus: null,
      lastRunDetail: null,
      recoveryAttempts: 0,
    };
    const form = triggerToForm(trigger);
    expect(form.courseId).toBe("course123");
    expect(form.institution).toBe("example.edu");
    expect(form.unattended).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Validators - shared by useAutomation (per-workflow Automate panel) and the
// Automations hub's inline editor. Moving them into this pure module made
// them directly testable for the first time.
// ---------------------------------------------------------------------------

function makeScheduleForm(overrides: Partial<ScheduleFormData> = {}): ScheduleFormData {
  return {
    runAt: "",
    repeat: "none",
    intervalValue: "",
    intervalUnit: "minutes",
    courseId: "",
    institution: "",
    unattended: false,
    ...overrides,
  };
}

function makeTriggerForm(overrides: Partial<TriggerFormData> = {}): TriggerFormData {
  return {
    eventType: "app-open",
    config: {},
    courseId: "",
    institution: "",
    unattended: false,
    ...overrides,
  };
}

// Build a "YYYY-MM-DDTHH:mm" datetime-local string from a Date's LOCAL
// components (mirrors scheduleToForm) so future/past fixtures are correct
// regardless of the test runner's timezone - both this and Date.now() read
// off the same faked system clock.
function toDateTimeLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

describe("validateScheduleForm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a null form", () => {
    expect(validateScheduleForm(null)).toEqual({ ok: false, error: "No form data" });
  });

  it("rejects an unparseable runAt", () => {
    const result = validateScheduleForm(makeScheduleForm({ runAt: "not-a-date" }));
    expect(result).toEqual({ ok: false, error: "Pick a valid first run time." });
  });

  it("rejects a runAt in the past", () => {
    const past = toDateTimeLocal(new Date(Date.now() - 3_600_000));
    const result = validateScheduleForm(makeScheduleForm({ runAt: past }));
    expect(result).toEqual({ ok: false, error: "Pick a time in the future." });
  });

  it("accepts a future runAt with a null interval for non-interval repeats", () => {
    const future = toDateTimeLocal(new Date(Date.now() + 3_600_000));
    const result = validateScheduleForm(makeScheduleForm({ runAt: future, repeat: "daily" }));
    expect(result).toEqual({ ok: true, intervalMinutes: null });
  });

  it("rejects an interval repeat with a non-numeric interval value", () => {
    const future = toDateTimeLocal(new Date(Date.now() + 3_600_000));
    const result = validateScheduleForm(
      makeScheduleForm({ runAt: future, repeat: "interval", intervalValue: "" })
    );
    expect(result).toEqual({ ok: false, error: "Enter how often it should repeat." });
  });

  it("rejects an interval below MIN_INTERVAL_MINUTES (15)", () => {
    const future = toDateTimeLocal(new Date(Date.now() + 3_600_000));
    const result = validateScheduleForm(
      makeScheduleForm({ runAt: future, repeat: "interval", intervalValue: "5", intervalUnit: "minutes" })
    );
    expect(result).toEqual({ ok: false, error: "The shortest interval is 15 minutes." });
  });

  it("accepts an interval exactly at the MIN_INTERVAL_MINUTES boundary", () => {
    const future = toDateTimeLocal(new Date(Date.now() + 3_600_000));
    const result = validateScheduleForm(
      makeScheduleForm({ runAt: future, repeat: "interval", intervalValue: "15", intervalUnit: "minutes" })
    );
    expect(result).toEqual({ ok: true, intervalMinutes: 15 });
  });

  it("converts an hours interval to minutes", () => {
    const future = toDateTimeLocal(new Date(Date.now() + 3_600_000));
    const result = validateScheduleForm(
      makeScheduleForm({ runAt: future, repeat: "interval", intervalValue: "2", intervalUnit: "hours" })
    );
    expect(result).toEqual({ ok: true, intervalMinutes: 120 });
  });
});

describe("validateTriggerForm", () => {
  it("rejects a null form", () => {
    expect(validateTriggerForm(null, undefined)).toEqual({ ok: false, error: "No form data" });
  });

  it("rejects an unrecognized event type", () => {
    const form = makeTriggerForm({ eventType: "not-a-real-event" as TriggerFormData["eventType"] });
    expect(validateTriggerForm(form, undefined)).toEqual({ ok: false, error: "Pick an event." });
  });

  it("rejects a required config field left blank (repo-push needs an org)", () => {
    const form = makeTriggerForm({ eventType: "repo-push", config: {} });
    expect(validateTriggerForm(form, undefined)).toEqual({
      ok: false,
      error: "Organization is required for this event.",
    });
  });

  it("accepts once the required config field is filled in", () => {
    const form = makeTriggerForm({ eventType: "repo-push", config: { org: "my-org" } });
    expect(validateTriggerForm(form, undefined)).toEqual({
      ok: true,
      eventConfig: { org: "my-org" },
    });
  });

  it("rejects an lmsCourse config value without a /courses/<id> path (roster-changed)", () => {
    const form = makeTriggerForm({
      eventType: "roster-changed",
      config: { course: "https://canvas.example.edu/not-a-course" },
    });
    expect(validateTriggerForm(form, undefined)).toEqual({
      ok: false,
      error: "Enter the Canvas course URL (it must contain /courses/<id>).",
    });
  });

  it("accepts an lmsCourse config value with a /courses/<id> path", () => {
    const form = makeTriggerForm({
      eventType: "roster-changed",
      config: { course: "https://canvas.example.edu/courses/123" },
    });
    expect(validateTriggerForm(form, undefined).ok).toBe(true);
  });

  it("deadline-passed falls back to the workflow's scoped course/institution when the form leaves them blank", () => {
    const workflowDef: WorkflowDef = {
      id: "wf1",
      name: "Test",
      description: "",
      steps: [],
      scope: { lmsCourse: "https://canvas.example.edu/courses/456", institution: "EXAMPLE" },
    };
    const form = makeTriggerForm({ eventType: "deadline-passed", config: {} });
    expect(validateTriggerForm(form, workflowDef)).toEqual({
      ok: true,
      eventConfig: { course: "https://canvas.example.edu/courses/456", institution: "EXAMPLE" },
    });
  });

  it("deadline-passed rejects when no course is available from the form or the workflow scope", () => {
    const form = makeTriggerForm({ eventType: "deadline-passed", config: {} });
    expect(validateTriggerForm(form, undefined)).toEqual({
      ok: false,
      error: "Set the course here, or set what this workflow is for (a single Canvas course) under Build.",
    });
  });

  it("deadline-passed prefers the form's own course/institution over the workflow scope", () => {
    const workflowDef: WorkflowDef = {
      id: "wf1",
      name: "Test",
      description: "",
      steps: [],
      scope: { lmsCourse: "https://canvas.example.edu/courses/456", institution: "EXAMPLE" },
    };
    const form = makeTriggerForm({
      eventType: "deadline-passed",
      config: { course: "https://canvas.example.edu/courses/789", institution: "OTHER" },
    });
    expect(validateTriggerForm(form, workflowDef)).toEqual({
      ok: true,
      eventConfig: { course: "https://canvas.example.edu/courses/789", institution: "OTHER" },
    });
  });
});
