// Pure helpers to convert persisted workflow schedules/triggers into form state
// for editing. No side effects or component use.

import type { WorkflowSchedule, ScheduleRepeat } from "./workflow-schedules";
import type { WorkflowTrigger, TriggerEventType } from "./workflow-triggers";

/**
 * Convert a schedule row into form state for editing/prefilling.
 * Splits intervalMinutes into value+unit (hours if divisible by 60 and >= 60, minutes otherwise).
 * Converts nextRunAt from ISO (UTC) to datetime-local format in LOCAL time.
 */

export function scheduleToForm(schedule: WorkflowSchedule): {
  runAt: string;
  repeat: ScheduleRepeat;
  intervalValue: string;
  intervalUnit: "minutes" | "hours";
  courseId: string;
  institution: string;
  unattended: boolean;
} {
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
export function triggerToForm(trigger: WorkflowTrigger): {
  eventType: TriggerEventType;
  config: Record<string, string>;
  courseId: string;
  institution: string;
  unattended: boolean;
} {
  return {
    eventType: trigger.eventType,
    config: trigger.eventConfig,
    courseId: trigger.courseId ?? "",
    institution: trigger.institution ?? "",
    unattended: trigger.unattended,
  };
}
