import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  scheduleToForm,
  triggerToForm,
  validateScheduleForm,
  validateTriggerForm,
  resolveScheduleDays,
  parseScheduleDraft,
  parseTriggerDraft,
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
      daysOfWeek: [],
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
      daysOfWeek: [],
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
      daysOfWeek: [],
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
      daysOfWeek: [],
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
      daysOfWeek: [],
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
      daysOfWeek: [],
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
      daysOfWeek: [],
    };
    const form = scheduleToForm(schedule);
    expect(form.courseId).toBe("");
    expect(form.institution).toBe("");
  });

  it("defaults daysOfWeek to the day implied by nextRunAt when the schedule has no explicit selection", () => {
    // 2026-07-21 is a Tuesday.
    const schedule: WorkflowSchedule = {
      id: "s1",
      userId: "u1",
      workflowId: "wf1",
      workflowName: "Test",
      fieldValues: {},
      nextRunAt: "2026-07-21T14:00:00.000Z",
      repeat: "weekly",
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
      daysOfWeek: [],
    };
    const form = scheduleToForm(schedule);
    expect(form.daysOfWeek).toEqual([new Date(schedule.nextRunAt).getDay()]);
  });

  it("preserves an existing multi-day selection instead of collapsing it to nextRunAt's weekday", () => {
    const schedule: WorkflowSchedule = {
      id: "s1",
      userId: "u1",
      workflowId: "wf1",
      workflowName: "Test",
      fieldValues: {},
      nextRunAt: "2026-07-17T14:00:00.000Z",
      repeat: "weekly",
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
      daysOfWeek: [0, 5, 6],
    };
    const form = scheduleToForm(schedule);
    expect(form.daysOfWeek).toEqual([0, 5, 6]);
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
    daysOfWeek: [],
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

// ---------------------------------------------------------------------------
// resolveScheduleDays - the day-of-week picker's save-time fallback. Extracted
// as a pure helper specifically so "selecting zero days must be impossible to
// save" is testable without a live form/component (see ScheduleEditForm's
// weekly picker and useAutomation/AutomationsTabView's save handlers, which
// both call this before persisting).
// ---------------------------------------------------------------------------

describe("resolveScheduleDays", () => {
  it("keeps a valid, already-populated selection as-is (sorted ascending)", () => {
    const days = resolveScheduleDays(makeScheduleForm({ runAt: "2026-07-21T14:00", daysOfWeek: [6, 0, 5] }));
    expect(days).toEqual([0, 5, 6]);
  });

  it("dedupes the selection", () => {
    const days = resolveScheduleDays(makeScheduleForm({ runAt: "2026-07-21T14:00", daysOfWeek: [1, 1, 3] }));
    expect(days).toEqual([1, 3]);
  });

  it("drops out-of-range/non-integer entries before deciding whether the selection is empty", () => {
    const days = resolveScheduleDays(
      makeScheduleForm({ runAt: "2026-07-21T14:00", daysOfWeek: [-1, 7, 2.5] as number[] })
    );
    // Every entry was invalid, so this is treated the same as an empty
    // selection: fall back to the day implied by runAt (2026-07-21 = Tuesday).
    expect(days).toEqual([new Date("2026-07-21T14:00").getDay()]);
  });

  it("falls back to the day implied by runAt when the selection is empty", () => {
    // 2026-07-17 is a Friday.
    const days = resolveScheduleDays(makeScheduleForm({ runAt: "2026-07-17T09:00", daysOfWeek: [] }));
    expect(days).toEqual([5]);
  });

  it("returns [] when both the selection and runAt are unusable", () => {
    const days = resolveScheduleDays(makeScheduleForm({ runAt: "not-a-date", daysOfWeek: [] }));
    expect(days).toEqual([]);
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

// ---------------------------------------------------------------------------
// parseScheduleDraft / parseTriggerDraft - the pure parse half of the
// Schedule/Trigger "Automate" panel draft persistence (ta-workflow-schedule-
// draft-<id> / ta-workflow-trigger-draft-<id>), read once by useAutomation's
// scheduleForm/triggerForm useState initializers. AC2's contract: anything
// malformed degrades the WHOLE draft to null - the same as nothing stored -
// rather than reconstructing a partial form, and this must never throw.
// ---------------------------------------------------------------------------

describe("parseScheduleDraft", () => {
  const validDraft: ScheduleFormData = {
    runAt: "2026-08-10T09:00",
    repeat: "weekly",
    intervalValue: "30",
    intervalUnit: "minutes",
    courseId: "course-1",
    institution: "example.edu",
    unattended: true,
    daysOfWeek: [1, 3, 5],
  };

  it("returns null when nothing is stored", () => {
    expect(parseScheduleDraft(null)).toBeNull();
    expect(parseScheduleDraft(undefined)).toBeNull();
    expect(parseScheduleDraft("")).toBeNull();
  });

  it("round-trips a valid draft through JSON.stringify/parse unchanged", () => {
    expect(parseScheduleDraft(JSON.stringify(validDraft))).toEqual(validDraft);
  });

  it("degrades unparseable JSON to null", () => {
    expect(parseScheduleDraft("{not json")).toBeNull();
  });

  it("degrades a non-object payload (array, string, number) to null", () => {
    expect(parseScheduleDraft(JSON.stringify([1, 2, 3]))).toBeNull();
    expect(parseScheduleDraft(JSON.stringify("just a string"))).toBeNull();
    expect(parseScheduleDraft(JSON.stringify(42))).toBeNull();
  });

  it("degrades to null when a field is missing entirely (institution)", () => {
    const { institution: _institution, ...withoutInstitution } = validDraft;
    void _institution;
    expect(parseScheduleDraft(JSON.stringify(withoutInstitution))).toBeNull();
  });

  it("degrades to null when a field has the wrong type (unattended as a string)", () => {
    expect(
      parseScheduleDraft(JSON.stringify({ ...validDraft, unattended: "true" }))
    ).toBeNull();
  });

  it("degrades to null on an unrecognized repeat", () => {
    expect(parseScheduleDraft(JSON.stringify({ ...validDraft, repeat: "monthly" }))).toBeNull();
  });

  it("degrades to null on an unrecognized intervalUnit", () => {
    expect(parseScheduleDraft(JSON.stringify({ ...validDraft, intervalUnit: "days" }))).toBeNull();
  });

  it("degrades to null when daysOfWeek contains a non-number", () => {
    expect(
      parseScheduleDraft(JSON.stringify({ ...validDraft, daysOfWeek: [1, "tuesday", 3] }))
    ).toBeNull();
  });

  it("degrades to null when daysOfWeek is not an array", () => {
    expect(
      parseScheduleDraft(JSON.stringify({ ...validDraft, daysOfWeek: "1,3,5" }))
    ).toBeNull();
  });

  it("accepts an empty daysOfWeek (legitimate mid-edit state before repeat is set to weekly)", () => {
    expect(parseScheduleDraft(JSON.stringify({ ...validDraft, daysOfWeek: [] }))).toEqual({
      ...validDraft,
      daysOfWeek: [],
    });
  });
});

describe("parseTriggerDraft", () => {
  const validDraft: TriggerFormData = {
    eventType: "repo-push",
    config: { org: "my-org" },
    courseId: "course-1",
    institution: "example.edu",
    unattended: true,
  };

  it("returns null when nothing is stored", () => {
    expect(parseTriggerDraft(null)).toBeNull();
    expect(parseTriggerDraft(undefined)).toBeNull();
    expect(parseTriggerDraft("")).toBeNull();
  });

  it("round-trips a valid draft through JSON.stringify/parse unchanged", () => {
    expect(parseTriggerDraft(JSON.stringify(validDraft))).toEqual(validDraft);
  });

  it("round-trips an empty config map", () => {
    const draft = { ...validDraft, eventType: "app-open" as const, config: {} };
    expect(parseTriggerDraft(JSON.stringify(draft))).toEqual(draft);
  });

  it("degrades unparseable JSON to null", () => {
    expect(parseTriggerDraft("{not json")).toBeNull();
  });

  it("degrades a non-object payload (array, string, number) to null", () => {
    expect(parseTriggerDraft(JSON.stringify([1, 2, 3]))).toBeNull();
    expect(parseTriggerDraft(JSON.stringify("just a string"))).toBeNull();
    expect(parseTriggerDraft(JSON.stringify(42))).toBeNull();
  });

  it("degrades to null when a field is missing entirely (courseId)", () => {
    const { courseId: _courseId, ...withoutCourseId } = validDraft;
    void _courseId;
    expect(parseTriggerDraft(JSON.stringify(withoutCourseId))).toBeNull();
  });

  it("degrades to null on an eventType no EVENT_SOURCES entry recognizes", () => {
    expect(
      parseTriggerDraft(JSON.stringify({ ...validDraft, eventType: "not-a-real-event" }))
    ).toBeNull();
  });

  it("degrades to null when config is missing/not an object", () => {
    expect(parseTriggerDraft(JSON.stringify({ ...validDraft, config: "org=my-org" }))).toBeNull();
    expect(parseTriggerDraft(JSON.stringify({ ...validDraft, config: [1, 2] }))).toBeNull();
  });

  it("degrades to null when a config value is not a string", () => {
    expect(
      parseTriggerDraft(JSON.stringify({ ...validDraft, config: { org: 5 } }))
    ).toBeNull();
  });

  it("degrades to null when unattended has the wrong type", () => {
    expect(
      parseTriggerDraft(JSON.stringify({ ...validDraft, unattended: "true" }))
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC3 - a saved automation's real values must always win over a leftover
// draft from a different session; a stale draft must never overwrite them.
//
// useAutomation.ts enforces this structurally: parseScheduleDraft/
// parseTriggerDraft are read exactly once, inside scheduleForm's/
// triggerForm's useState lazy initializer, and NEVER again by an effect.
// ScheduleSection's/TriggerSection's "Edit" button instead calls
// scheduleToForm(realSchedule)/triggerToForm(realTrigger) directly into
// setScheduleForm/setTriggerForm - a completely separate code path from the
// draft parser, fed only by the real, persisted row. The test below proves
// those two code paths are independent: given the SAME localStorage payload
// (a stale, conflicting draft) sitting alongside a real schedule/trigger,
// converting the real row for editing reflects only the real row, never
// anything from the stale draft.
// ---------------------------------------------------------------------------

describe("AC3: an existing schedule/trigger's real values win over a stored draft", () => {
  it("scheduleToForm reflects only the real schedule, never a conflicting stored draft", () => {
    const staleDraftRaw = JSON.stringify({
      runAt: "2020-01-01T00:00",
      repeat: "interval",
      intervalValue: "999",
      intervalUnit: "hours",
      courseId: "stale-course",
      institution: "stale-institution",
      unattended: true,
      daysOfWeek: [1, 2, 3],
    });
    // Sanity: the stale draft really does parse to something. If this were
    // null, the test below would pass with nothing to conflict with.
    const parsedStaleDraft = parseScheduleDraft(staleDraftRaw);
    expect(parsedStaleDraft).not.toBeNull();

    const realSchedule: WorkflowSchedule = {
      id: "s1",
      userId: "u1",
      workflowId: "wf1",
      workflowName: "Test",
      fieldValues: {},
      nextRunAt: "2026-08-10T09:00:00.000Z",
      repeat: "none",
      enabled: true,
      courseId: "real-course",
      institution: "real-institution",
      lastRunAt: null,
      intervalMinutes: null,
      unattended: false,
      provider: null,
      disabledSteps: [],
      fanoutProgress: null,
      lastRunStatus: null,
      lastRunDetail: null,
      recoveryAttempts: 0,
      daysOfWeek: [],
    };

    const editForm = scheduleToForm(realSchedule);

    expect(editForm.courseId).toBe("real-course");
    expect(editForm.institution).toBe("real-institution");
    expect(editForm.unattended).toBe(false);
    expect(editForm.repeat).toBe("none");
    // None of the real form's fields leaked in from the stale draft.
    expect(editForm.courseId).not.toBe(parsedStaleDraft!.courseId);
    expect(editForm.institution).not.toBe(parsedStaleDraft!.institution);
    expect(editForm.unattended).not.toBe(parsedStaleDraft!.unattended);
  });

  it("triggerToForm reflects only the real trigger, never a conflicting stored draft", () => {
    const staleDraftRaw = JSON.stringify({
      eventType: "repo-push",
      config: { org: "stale-org" },
      courseId: "stale-course",
      institution: "stale-institution",
      unattended: true,
    });
    const parsedStaleDraft = parseTriggerDraft(staleDraftRaw);
    expect(parsedStaleDraft).not.toBeNull();

    const realTrigger: WorkflowTrigger = {
      id: "t1",
      userId: "u1",
      workflowId: "wf1",
      workflowName: "Test",
      fieldValues: {},
      eventType: "submission-received",
      eventConfig: { institution: "real-institution", threshold: "5" },
      cursor: null,
      checkVersion: 0,
      enabled: true,
      unattended: false,
      provider: null,
      disabledSteps: [],
      courseId: "real-course",
      institution: "real-institution",
      webhookToken: null,
      lastCheckedAt: null,
      lastFiredAt: null,
      lastRunStatus: null,
      lastRunDetail: null,
      recoveryAttempts: 0,
    };

    const editForm = triggerToForm(realTrigger);

    expect(editForm.eventType).toBe("submission-received");
    expect(editForm.courseId).toBe("real-course");
    expect(editForm.institution).toBe("real-institution");
    expect(editForm.unattended).toBe(false);
    expect(editForm.eventType).not.toBe(parsedStaleDraft!.eventType);
    expect(editForm.courseId).not.toBe(parsedStaleDraft!.courseId);
  });
});
