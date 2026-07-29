// Pure helpers for the Automations hub table (AutomationsPanel): turning the
// flat schedules/triggers lists into sortable table rows, grouping them into
// Scheduled and Triggered (the two answer different questions - "what runs
// on a clock" versus "what reacts to an event" - so they are never merged
// into one interleaved sort), and persisting the chosen sort.
//
// Mirrors the courses-table-helpers.ts pattern (sortValueFor / compare /
// parseSortState) so the two tables in the app agree on how "missing value"
// and "tie" are handled.

import type { WorkflowDef } from "./workflows/types";
import { describeScheduleCadence, type WorkflowSchedule } from "./workflow-schedules";
import { describeTrigger, type WorkflowTrigger } from "./workflow-triggers";
import type { WorkflowRunStatus } from "./workflow-run-status";
import { scheduleRowKey, triggerRowKey } from "../app/components/workflows/automation-inventory-logic";

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type AutomationRowKind = "scheduled" | "triggered";

export interface AutomationTableRow {
  /** Composite key from scheduleRowKey/triggerRowKey - shared with the
   * existing expansion/edit state so a row's identity is consistent across
   * the whole panel. */
  key: string;
  kind: AutomationRowKind;
  workflowId: string;
  name: string;
  category: WorkflowDef["category"] | null;
  /** What fires it: the cadence description for a schedule, the event
   * source description for a trigger. */
  fires: string;
  lastRunAt: string | null;
  lastRunStatus: WorkflowRunStatus | null;
  lastRunDetail: string | null;
  /** ISO timestamp of the next scheduled occurrence, or null when there is
   * none - a disabled schedule (nothing pending) or any trigger (event-driven,
   * no deterministic next-fire time to show honestly). */
  nextRunAt: string | null;
  enabled: boolean;
  unattended: boolean;
  schedule: WorkflowSchedule | null;
  trigger: WorkflowTrigger | null;
}

function categoryFor(workflowId: string, categoryByWorkflowId: Map<string, WorkflowDef["category"] | null>): WorkflowDef["category"] | null {
  return categoryByWorkflowId.get(workflowId) ?? null;
}

function scheduleToRow(schedule: WorkflowSchedule, categoryByWorkflowId: Map<string, WorkflowDef["category"] | null>): AutomationTableRow {
  return {
    key: scheduleRowKey(schedule.id),
    kind: "scheduled",
    workflowId: schedule.workflowId,
    name: schedule.workflowName,
    category: categoryFor(schedule.workflowId, categoryByWorkflowId),
    fires: describeScheduleCadence(schedule),
    lastRunAt: schedule.lastRunAt,
    lastRunStatus: schedule.lastRunStatus,
    lastRunDetail: schedule.lastRunDetail,
    nextRunAt: schedule.enabled ? schedule.nextRunAt : null,
    enabled: schedule.enabled,
    unattended: schedule.unattended,
    schedule,
    trigger: null,
  };
}

function triggerToRow(trigger: WorkflowTrigger, categoryByWorkflowId: Map<string, WorkflowDef["category"] | null>): AutomationTableRow {
  return {
    key: triggerRowKey(trigger.id),
    kind: "triggered",
    workflowId: trigger.workflowId,
    name: trigger.workflowName,
    category: categoryFor(trigger.workflowId, categoryByWorkflowId),
    fires: describeTrigger(trigger),
    lastRunAt: trigger.lastFiredAt,
    lastRunStatus: trigger.lastRunStatus,
    lastRunDetail: trigger.lastRunDetail,
    nextRunAt: null,
    enabled: trigger.enabled,
    unattended: trigger.unattended,
    schedule: null,
    trigger,
  };
}

export interface AutomationRowGroups {
  scheduled: AutomationTableRow[];
  triggered: AutomationTableRow[];
}

/** Build the two row groups (AC2's primary structure) from the raw inventory.
 * Null schedules/triggers (still loading) are treated as empty, same as the
 * rest of the panel. */
export function buildAutomationRows(
  workflows: WorkflowDef[],
  schedules: WorkflowSchedule[] | null,
  triggers: WorkflowTrigger[] | null
): AutomationRowGroups {
  const categoryByWorkflowId = new Map<string, WorkflowDef["category"] | null>(workflows.map((w) => [w.id, w.category ?? null]));
  return {
    scheduled: (schedules ?? []).map((s) => scheduleToRow(s, categoryByWorkflowId)),
    triggered: (triggers ?? []).map((t) => triggerToRow(t, categoryByWorkflowId)),
  };
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

// "lastRun" (the old, single combined status+timestamp column) is deliberately
// NOT a valid field name below - the column it named was split into
// "lastRunStatus" (Status) and "lastRunAt" (Last run, timestamp-only). Any
// value already in localStorage naming the old field is therefore unknown to
// AUTOMATION_SORT_FIELDS and parseAutomationSortState falls it back to the
// default, rather than silently reinterpreting "lastRun" as one half of the
// old meaning.
export type AutomationSortField = "name" | "fires" | "lastRunStatus" | "lastRunAt" | "nextRun" | "enabled" | "unattended";
export type AutomationSortDirection = "asc" | "desc";

export interface AutomationSortState {
  field: AutomationSortField;
  direction: AutomationSortDirection;
}

export const DEFAULT_AUTOMATION_SORT: AutomationSortState = { field: "name", direction: "asc" };

export const AUTOMATION_SORT_FIELDS: AutomationSortField[] = ["name", "fires", "lastRunStatus", "lastRunAt", "nextRun", "enabled", "unattended"];
const AUTOMATION_SORT_DIRECTIONS: AutomationSortDirection[] = ["asc", "desc"];

/** Parse a persisted ta-automations-sort value; anything unrecognized or
 * malformed (unknown column, corrupt JSON, wrong shape) falls back to the
 * default sort rather than throwing. */
export function parseAutomationSortState(raw: string | null | undefined): AutomationSortState {
  if (!raw) return DEFAULT_AUTOMATION_SORT;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "field" in parsed &&
      "direction" in parsed &&
      AUTOMATION_SORT_FIELDS.includes((parsed as { field: unknown }).field as AutomationSortField) &&
      AUTOMATION_SORT_DIRECTIONS.includes((parsed as { direction: unknown }).direction as AutomationSortDirection)
    ) {
      return {
        field: (parsed as { field: AutomationSortField }).field,
        direction: (parsed as { direction: AutomationSortDirection }).direction,
      };
    }
    return DEFAULT_AUTOMATION_SORT;
  } catch {
    return DEFAULT_AUTOMATION_SORT;
  }
}

type SortValue =
  | { kind: "text"; value: string; empty: boolean }
  | { kind: "time"; value: number; empty: boolean }
  | { kind: "bool"; value: boolean; empty: false };

function timeValue(iso: string | null): SortValue {
  if (!iso) return { kind: "time", value: 0, empty: true };
  const t = Date.parse(iso);
  return Number.isNaN(t) ? { kind: "time", value: 0, empty: true } : { kind: "time", value: t, empty: false };
}

/** Pure extractor: maps one row + sortable field to a typed, comparable
 * value. "empty" marks values that must always sort last, in both
 * directions (no last run, no next run, never run). Booleans are never
 * empty - false is an ordinary value, not a missing one. */
function sortValueFor(row: AutomationTableRow, field: AutomationSortField): SortValue {
  switch (field) {
    case "name":
      return { kind: "text", value: row.name, empty: false };
    case "fires": {
      const trimmed = row.fires.trim();
      return { kind: "text", value: trimmed, empty: trimmed.length === 0 };
    }
    case "lastRunStatus":
      // Sorted by the raw status code (deterministic, no wall-clock
      // dependency) rather than the displayed chip text (lastRunChip folds in
      // a "stale started" check against Date.now(), which would make the sort
      // order itself time-dependent) - "empty" (never run) is status === null,
      // matching exactly when the Status cell shows "Never run" instead of a
      // badge.
      return { kind: "text", value: row.lastRunStatus ?? "", empty: row.lastRunStatus === null };
    case "lastRunAt":
      return timeValue(row.lastRunAt);
    case "nextRun":
      return timeValue(row.nextRunAt);
    case "enabled":
      return { kind: "bool", value: row.enabled, empty: false };
    case "unattended":
      return { kind: "bool", value: row.unattended, empty: false };
  }
}

function compareSortValues(a: SortValue, b: SortValue): number {
  if (a.kind === "text" && b.kind === "text") return a.value.localeCompare(b.value, undefined, { sensitivity: "base" });
  if (a.kind === "time" && b.kind === "time") return a.value - b.value;
  if (a.kind === "bool" && b.kind === "bool") {
    if (a.value === b.value) return 0;
    // Enabled/unattended "Yes" sorts before "No" ascending - the more
    // notable state (running, or opted into unattended) surfaces first.
    return a.value ? -1 : 1;
  }
  // Same field always yields the same kind on both sides; unreachable in
  // practice, but keeps the function total.
  return 0;
}

/** One comparator for every sortable column, driven by sortValueFor. Empty
 * values (no last run, no next run) always sort last, in both directions -
 * a schedule that has never run does not jump to the top just because
 * "desc" was chosen. Ties (including the "both empty" case) break by name
 * ascending, so the order is stable and reload-independent. */
export function compareAutomationRows(a: AutomationTableRow, b: AutomationTableRow, sort: AutomationSortState): number {
  if (sort.field === "name") {
    const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    return sort.direction === "asc" ? cmp : -cmp;
  }

  const av = sortValueFor(a, sort.field);
  const bv = sortValueFor(b, sort.field);

  let primary: number;
  if (av.empty && bv.empty) primary = 0;
  else if (av.empty) return 1;
  else if (bv.empty) return -1;
  else primary = compareSortValues(av, bv);

  if (primary === 0) return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

  return sort.direction === "asc" ? primary : -primary;
}

/** Sort one group's rows (scheduled or triggered) by the shared sort state.
 * Grouping happens before this is called (buildAutomationRows) and stays
 * that way - this never sees the other group's rows, so a sort can never
 * interleave the two kinds. */
export function sortAutomationRows(rows: AutomationTableRow[], sort: AutomationSortState): AutomationTableRow[] {
  return [...rows].sort((a, b) => compareAutomationRows(a, b, sort));
}
