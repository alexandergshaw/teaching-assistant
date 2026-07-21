import { describe, it, expect } from "vitest";
import { scheduleToForm, triggerToForm } from "./workflow-form-helpers";
import type { WorkflowSchedule } from "./workflow-schedules";
import type { WorkflowTrigger } from "./workflow-triggers";

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
    };
    const form = triggerToForm(trigger);
    expect(form.courseId).toBe("course123");
    expect(form.institution).toBe("example.edu");
    expect(form.unattended).toBe(true);
  });
});
