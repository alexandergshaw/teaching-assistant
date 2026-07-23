// Pure helpers shared by the per-workflow Automate panel (ScheduleSection/
// TriggerSection) and the Automations hub: converting persisted workflow
// schedules/triggers into form state for editing, and validating that form
// state before it is persisted. No side effects or component use - both
// surfaces import the SAME functions so there is exactly one implementation
// of "is this schedule/trigger form valid".

import { MIN_INTERVAL_MINUTES, type WorkflowSchedule, type ScheduleRepeat } from "./workflow-schedules";
import { getEventSource, type WorkflowTrigger, type TriggerEventType } from "./workflow-triggers";
import type { WorkflowDef } from "./workflows/types";

/** Form state for creating/editing a schedule. Shared by useAutomation (the
 * per-workflow Automate panel) and the Automations hub's inline editor. */
export interface ScheduleFormData {
  runAt: string;
  repeat: ScheduleRepeat;
  intervalValue: string;
  intervalUnit: "minutes" | "hours";
  courseId: string;
  institution: string;
  unattended: boolean;
}

/** Form state for creating/editing a trigger. Shared by useAutomation (the
 * per-workflow Automate panel) and the Automations hub's inline editor. */
export interface TriggerFormData {
  eventType: TriggerEventType;
  config: Record<string, string>;
  courseId: string;
  institution: string;
  unattended: boolean;
}

/**
 * Convert a schedule row into form state for editing/prefilling.
 * Splits intervalMinutes into value+unit (hours if divisible by 60 and >= 60, minutes otherwise).
 * Converts nextRunAt from ISO (UTC) to datetime-local format in LOCAL time.
 */

export function scheduleToForm(schedule: WorkflowSchedule): ScheduleFormData {
  const d = new Date(schedule.nextRunAt);
  // Build YYYY-MM-DDTHH:mm in local time (not UTC shift via toISOString)
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const runAt = `${year}-${month}-${day}T${hours}:${minutes}`;

  // Split intervalMinutes: hours if divisible by 60 and >= 60, else minutes
  let intervalValue = "";
  let intervalUnit: "minutes" | "hours" = "minutes";
  if (schedule.intervalMinutes !== null && schedule.intervalMinutes >= 60 && schedule.intervalMinutes % 60 === 0) {
    intervalValue = String(schedule.intervalMinutes / 60);
    intervalUnit = "hours";
  } else if (schedule.intervalMinutes !== null) {
    intervalValue = String(schedule.intervalMinutes);
    intervalUnit = "minutes";
  }

  return {
    runAt,
    repeat: schedule.repeat,
    intervalValue,
    intervalUnit,
    courseId: schedule.courseId ?? "",
    institution: schedule.institution ?? "",
    unattended: schedule.unattended,
  };
}

/**
 * Convert a trigger row into form state for editing/prefilling.
 */
export function triggerToForm(trigger: WorkflowTrigger): TriggerFormData {
  return {
    eventType: trigger.eventType,
    config: trigger.eventConfig,
    courseId: trigger.courseId ?? "",
    institution: trigger.institution ?? "",
    unattended: trigger.unattended,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Result of validating a schedule form: either the parsed interval (null for
 * non-interval repeats) or a user-facing error message. */
export type ValidateScheduleResult =
  | { ok: true; intervalMinutes: number | null }
  | { ok: false; error: string };

/**
 * Validate schedule form state before create/save. Pure and side-effect free
 * so both the per-workflow Automate panel (useAutomation) and the
 * Automations hub's inline editor share exactly one set of rules: a valid
 * future first-run time, and (for "every...") a repeat interval at or above
 * MIN_INTERVAL_MINUTES.
 */
export function validateScheduleForm(form: ScheduleFormData | null): ValidateScheduleResult {
  if (!form) return { ok: false, error: "No form data" };
  const runAt = new Date(form.runAt);
  if (Number.isNaN(runAt.getTime())) {
    return { ok: false, error: "Pick a valid first run time." };
  }
  if (runAt.getTime() <= Date.now()) {
    return { ok: false, error: "Pick a time in the future." };
  }
  let intervalMinutes: number | null = null;
  if (form.repeat === "interval") {
    const raw = Number(form.intervalValue);
    if (!Number.isFinite(raw) || raw <= 0) {
      return { ok: false, error: "Enter how often it should repeat." };
    }
    intervalMinutes = form.intervalUnit === "hours" ? Math.round(raw * 60) : Math.round(raw);
    if (intervalMinutes < MIN_INTERVAL_MINUTES) {
      return { ok: false, error: `The shortest interval is ${MIN_INTERVAL_MINUTES} minutes.` };
    }
  }
  return { ok: true, intervalMinutes };
}

/** Result of validating a trigger form: either the resolved event config
 * (with deadline-passed's course/institution scope fallback applied) or a
 * user-facing error message. */
export type ValidateTriggerResult =
  | { ok: true; eventConfig: Record<string, string> }
  | { ok: false; error: string };

/**
 * Validate trigger form state before create/save, and resolve its event
 * config (scope-inheritance for deadline-passed). Pure and side-effect free -
 * shared by useAutomation and the Automations hub's inline editor so there is
 * exactly one implementation of "is this trigger form valid".
 */
export function validateTriggerForm(
  form: TriggerFormData | null,
  workflowDef: WorkflowDef | undefined
): ValidateTriggerResult {
  if (!form) return { ok: false, error: "No form data" };
  const source = getEventSource(form.eventType);
  if (!source) {
    return { ok: false, error: "Pick an event." };
  }
  for (const field of source.configFields) {
    if (field.required && !(form.config[field.key] ?? "").trim()) {
      return { ok: false, error: `${field.label} is required for this event.` };
    }
  }
  for (const field of source.configFields) {
    if (field.type !== "lmsCourse") continue;
    const fieldValue = (form.config[field.key] ?? "").trim();
    if (fieldValue && !/courses\/\d+/.test(fieldValue)) {
      return { ok: false, error: "Enter the Canvas course URL (it must contain /courses/<id>)." };
    }
  }
  let eventConfig = form.config;
  if (form.eventType === "deadline-passed") {
    const scope = workflowDef?.scope ?? {};
    const scopeCourse = (scope.lmsCourse ?? "").trim();
    const singleCourse =
      scopeCourse && scopeCourse !== "*" && !scopeCourse.includes("\n") ? scopeCourse : "";
    const scopeInst = (scope.institution ?? "").trim();
    const singleInst = scopeInst && scopeInst !== "*" ? scopeInst : "";
    eventConfig = {
      ...form.config,
      course: (form.config.course ?? "").trim() || singleCourse,
      institution:
        (form.config.institution ?? "").trim() || singleInst || (form.institution ?? ""),
    };
    if (!eventConfig.course.trim()) {
      return {
        ok: false,
        error: "Set the course here, or set what this workflow is for (a single Canvas course) under Build.",
      };
    }
  }
  return { ok: true, eventConfig };
}
