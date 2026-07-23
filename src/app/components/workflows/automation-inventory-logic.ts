import type { WorkflowDef } from "@/lib/workflows/types";
import type { WorkflowSchedule } from "@/lib/workflow-schedules";
import type { WorkflowTrigger } from "@/lib/workflow-triggers";
import styles from "../../page.module.css";

const STALE_STARTED_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export function isStaleStarted(statusTimestamp: string | null | undefined): boolean {
  if (!statusTimestamp) return false;
  const timestampMs = new Date(statusTimestamp).getTime();
  const tenMinutesAgoMs = Date.now() - STALE_STARTED_THRESHOLD_MS;
  return timestampMs < tenMinutesAgoMs;
}

export interface LastRunChip {
  class: string;
  text: string;
}

export function lastRunChip(
  status: string | null,
  runAt: string | null
): LastRunChip {
  if (!status) {
    return { class: "", text: "" };
  }

  if (status === "ok") {
    return { class: styles.ghBadgeSuccess, text: "Last run OK" };
  }
  if (status === "error") {
    return { class: styles.ghBadgeDanger, text: "Last run failed" };
  }
  if (status === "skipped") {
    return { class: styles.ghBadgeNeutral, text: "Last run skipped" };
  }
  if (status === "started" && isStaleStarted(runAt)) {
    return { class: styles.ghBadgeDanger, text: "Did not finish" };
  }

  return { class: styles.ghBadgeAccent, text: "Running" };
}

export function needsAttention(
  schedule: WorkflowSchedule | null,
  trigger: WorkflowTrigger | null
): boolean {
  if (schedule) {
    if (schedule.lastRunStatus === "error") return true;
    if (schedule.lastRunStatus === "started" && isStaleStarted(schedule.lastRunAt)) return true;
    return false;
  }
  if (trigger) {
    if (trigger.lastRunStatus === "error") return true;
    if (trigger.lastRunStatus === "started" && isStaleStarted(trigger.lastFiredAt)) return true;
    return false;
  }
  return false;
}

export function filterAutomatedWorkflows(
  workflows: WorkflowDef[],
  schedules: WorkflowSchedule[] | null,
  triggers: WorkflowTrigger[] | null
): WorkflowDef[] {
  const automatedIds = new Set<string>();

  for (const schedule of schedules ?? []) {
    automatedIds.add(schedule.workflowId);
  }
  for (const trigger of triggers ?? []) {
    automatedIds.add(trigger.workflowId);
  }

  return workflows.filter((w) => automatedIds.has(w.id));
}

export function orderWorkflowsAttentionFirst(
  workflows: WorkflowDef[],
  schedules: WorkflowSchedule[] | null,
  triggers: WorkflowTrigger[] | null
): WorkflowDef[] {
  const automated = filterAutomatedWorkflows(workflows, schedules, triggers);

  // Create a map of workflow id to whether it needs attention
  const needsAttentionMap = new Map<string, boolean>();
  for (const w of automated) {
    const wfSchedules = (schedules ?? []).filter((s) => s.workflowId === w.id);
    const wfTriggers = (triggers ?? []).filter((t) => t.workflowId === w.id);

    const hasAttention =
      wfSchedules.some((s) => needsAttention(s, null)) ||
      wfTriggers.some((t) => needsAttention(null, t));

    needsAttentionMap.set(w.id, hasAttention);
  }

  // Sort: attention first (error/stale-started), then alphabetically
  return automated.sort((a, b) => {
    const aAttention = needsAttentionMap.get(a.id) ?? false;
    const bAttention = needsAttentionMap.get(b.id) ?? false;

    // If attention levels differ, prioritize attention
    if (aAttention !== bAttention) {
      return aAttention ? -1 : 1;
    }

    // Otherwise sort alphabetically
    return a.name.localeCompare(b.name);
  });
}

// ---------------------------------------------------------------------------
// Automations hub row helpers (per-row expansion/edit in AutomationsPanel)
// ---------------------------------------------------------------------------

/** Composite key identifying a schedule row for expansion/editing state, kept
 * in one place so every consumer (panel, row, hub) agrees on the format. */
export function scheduleRowKey(id: string): string {
  return `schedule:${id}`;
}

/** Composite key identifying a trigger row for expansion/editing state, kept
 * in one place so every consumer (panel, row, hub) agrees on the format. */
export function triggerRowKey(id: string): string {
  return `trigger:${id}`;
}

/** Resolve a schedule/trigger's courseId to the hub course's display name, for
 * the row's detail view. Null when no course is attached; falls back to a
 * generic "course" label if the id no longer resolves (mirrors the existing
 * ScheduleSection/TriggerSection attachment behavior). */
export function resolveCourseName(
  courseId: string | null,
  hubCourses: Array<{ id: string; name: string }> | null
): string | null {
  if (!courseId) return null;
  return hubCourses?.find((c) => c.id === courseId)?.name ?? "course";
}

/** Render a schedule/trigger's fieldValues snapshot as a compact, stable-order
 * key/value list for the row's expanded view. Skips empty values so the
 * snapshot only shows what was actually filled in at schedule/trigger time. */
export function formatFieldValues(
  fieldValues: Record<string, string>
): Array<{ key: string; value: string }> {
  return Object.entries(fieldValues)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => ({ key, value }));
}
