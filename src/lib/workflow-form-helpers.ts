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
  /** Weekly multi-day picker selection (0=Sunday..6=Saturday); only shown/
   * used when repeat === "weekly". May be legitimately empty while the user
   * is editing - see resolveScheduleDays for the save-time fallback. */
  daysOfWeek: number[];
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

  // Prefill the day picker from the schedule's explicit selection when it has
  // one; otherwise fall back to the single day implied by nextRunAt's
  // weekday, so opening and saving an existing schedule without touching the
  // picker cannot change when it runs (an empty selection would otherwise
  // save as "no days", which is not a valid weekly schedule).
  const daysOfWeek = schedule.daysOfWeek.length > 0 ? schedule.daysOfWeek : [d.getDay()];

  return {
    runAt,
    repeat: schedule.repeat,
    intervalValue,
    intervalUnit,
    courseId: schedule.courseId ?? "",
    institution: schedule.institution ?? "",
    unattended: schedule.unattended,
    daysOfWeek,
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
// Draft persistence (Automate panel "Schedule"/"Trigger" forms)
//
// The run form persists its whole `values` map under ta-workflow-values-<id>
// (see WorkflowsTab.tsx); these two forms did not, so a page reload silently
// threw away an in-progress schedule/trigger. parseScheduleDraft/
// parseTriggerDraft are the pure parse half of that same pattern - the
// localStorage read/write itself lives in useAutomation.ts, exactly like
// parseDisabledSteps (types.expand.ts) is pure while loadDisabledSteps/
// saveDisabledSteps do the actual storage I/O.
// ---------------------------------------------------------------------------

const SCHEDULE_REPEATS: ScheduleRepeat[] = ["none", "interval", "daily", "weekly"];
const INTERVAL_UNITS: Array<ScheduleFormData["intervalUnit"]> = ["minutes", "hours"];

/**
 * Parse a persisted in-progress Schedule form draft
 * (ta-workflow-schedule-draft-<workflowId>). Mirrors parseAutomationSortState/
 * parseFolderState/parseDisabledSteps' defensive contract, but degrades the
 * WHOLE draft to null (the same as nothing being stored) on any problem -
 * bad JSON, a non-object, a missing/mistyped field, an unrecognized repeat or
 * intervalUnit, or a daysOfWeek entry that isn't a finite number - rather
 * than reconstructing a partial form from whatever happened to be valid.
 * Never throws.
 */
export function parseScheduleDraft(raw: string | null | undefined): ScheduleFormData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;

    if (typeof obj.runAt !== "string") return null;
    if (!SCHEDULE_REPEATS.includes(obj.repeat as ScheduleRepeat)) return null;
    if (typeof obj.intervalValue !== "string") return null;
    if (!INTERVAL_UNITS.includes(obj.intervalUnit as ScheduleFormData["intervalUnit"])) return null;
    if (typeof obj.courseId !== "string") return null;
    if (typeof obj.institution !== "string") return null;
    if (typeof obj.unattended !== "boolean") return null;
    if (
      !Array.isArray(obj.daysOfWeek) ||
      !obj.daysOfWeek.every((d) => typeof d === "number" && Number.isFinite(d))
    ) {
      return null;
    }

    return {
      runAt: obj.runAt,
      repeat: obj.repeat as ScheduleRepeat,
      intervalValue: obj.intervalValue,
      intervalUnit: obj.intervalUnit as ScheduleFormData["intervalUnit"],
      courseId: obj.courseId,
      institution: obj.institution,
      unattended: obj.unattended,
      daysOfWeek: obj.daysOfWeek as number[],
    };
  } catch {
    return null;
  }
}

/**
 * Parse a persisted in-progress Trigger form draft
 * (ta-workflow-trigger-draft-<workflowId>). Same total-degradation contract
 * as parseScheduleDraft: an eventType that getEventSource no longer
 * recognizes, a config map with any non-string value, or any missing/
 * mistyped field falls the whole draft back to null. Never throws.
 */
export function parseTriggerDraft(raw: string | null | undefined): TriggerFormData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;

    if (typeof obj.eventType !== "string" || !getEventSource(obj.eventType)) return null;
    if (!obj.config || typeof obj.config !== "object" || Array.isArray(obj.config)) return null;
    const configEntries = Object.entries(obj.config as Record<string, unknown>);
    if (!configEntries.every(([, v]) => typeof v === "string")) return null;
    if (typeof obj.courseId !== "string") return null;
    if (typeof obj.institution !== "string") return null;
    if (typeof obj.unattended !== "boolean") return null;

    return {
      eventType: obj.eventType as TriggerEventType,
      config: obj.config as Record<string, string>,
      courseId: obj.courseId,
      institution: obj.institution,
      unattended: obj.unattended,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * The days-of-week to persist for a weekly schedule, given the current form
 * state. Extracted as a pure helper (rather than buried in a save handler or
 * JSX) so the "selecting zero days must be impossible to save" rule is
 * directly testable: a valid, deduped, sorted selection is kept as-is; an
 * empty (or entirely invalid) selection falls back to the single day implied
 * by the chosen first-run date, since a weekly schedule with no day at all
 * would silently mean something different from "runs weekly".
 */
export function resolveScheduleDays(form: Pick<ScheduleFormData, "runAt" | "daysOfWeek">): number[] {
  const valid = Array.from(
    new Set(form.daysOfWeek.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))
  ).sort((a, b) => a - b);
  if (valid.length > 0) return valid;
  const runAt = new Date(form.runAt);
  if (Number.isNaN(runAt.getTime())) return [];
  return [runAt.getDay()];
}

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
