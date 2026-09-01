// Pure decision logic for B5 of the workflows/lecture UX audit: deleting a
// workflow must not silently orphan its schedules and triggers.
//
// deleteWorkflowDef (src/lib/workflow-defs.ts) deletes the workflow_defs row
// only - workflow_schedules.workflow_id and workflow_triggers.workflow_id are
// plain text with no foreign key and no cascade (see migrations
// 20260808000000_create_workflow_schedules.sql and
// 20260916000000_workflow_defs_preset_overrides.sql), so a schedule/trigger
// that targeted the deleted workflow used to keep firing server-side
// forever, against a workflow that no longer exists. This module computes
// (a) exactly which schedule/trigger ids a delete must also remove, and (b)
// the confirm copy naming the workflow and what else goes with it - the bar
// ScheduledReleasesPanel.tsx's own confirm already sets (names the target,
// previews the consequence, never a bare "are you sure?").
//
// Kept pure (plain arrays in, plain data out) so the plan and its copy are
// unit-testable without Supabase or a DOM - vitest.config.ts is node-env
// only, and WorkflowPanel.tsx's delete handler is the only caller.

export interface WorkflowDeletePlan {
  workflowId: string;
  scheduleIds: string[];
  triggerIds: string[];
}

/** The subset of WorkflowSchedule/WorkflowTrigger (src/lib/workflow-
 * schedules.ts, src/lib/workflow-triggers/event-sources.ts) this needs -
 * kept structural, not imported, so this stays a leaf module. */
export interface DeletePlanScheduleLike {
  id: string;
  workflowId: string;
}
export interface DeletePlanTriggerLike {
  id: string;
  workflowId: string;
}

/** What deleting `workflowId` takes with it: every schedule/trigger id that
 * currently targets it. WorkflowPanel.tsx's delete handler calls
 * automation.handleDeleteSchedule/handleDeleteTrigger for each id here BEFORE
 * calling deleteWorkflowDef, so nothing is left behind still enabled. */
export function buildWorkflowDeletePlan(
  workflowId: string,
  schedules: DeletePlanScheduleLike[],
  triggers: DeletePlanTriggerLike[]
): WorkflowDeletePlan {
  return {
    workflowId,
    scheduleIds: schedules.filter((s) => s.workflowId === workflowId).map((s) => s.id),
    triggerIds: triggers.filter((t) => t.workflowId === workflowId).map((t) => t.id),
  };
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** The armed (second-click) state's own button label - this project's
 * existing two-click idiom (WorkflowPanel.tsx already swaps "Delete" ->
 * "Confirm delete" for this exact button) swaps to THIS text instead of a
 * bare "Confirm delete", so the confirm itself names the workflow and counts
 * what else the click removes - e.g. 'Confirm delete - "Weekly
 * announcements", its 2 schedules and 1 trigger'. */
export function armedWorkflowDeleteLabel(workflowName: string, plan: WorkflowDeletePlan): string {
  const { scheduleIds, triggerIds } = plan;
  if (scheduleIds.length === 0 && triggerIds.length === 0) {
    return `Confirm delete - "${workflowName}"`;
  }
  const parts: string[] = [];
  if (scheduleIds.length > 0) parts.push(pluralize(scheduleIds.length, "schedule"));
  if (triggerIds.length > 0) parts.push(pluralize(triggerIds.length, "trigger"));
  return `Confirm delete - "${workflowName}", its ${parts.join(" and ")}`;
}
