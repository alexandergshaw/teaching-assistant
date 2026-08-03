// Pure helpers for RunProgressSidebar.tsx - the persistent step tracker that
// sits beside the run form's main column (see WorkflowPanel.tsx's "Run
// Progress" block). Extracted the same way attended-fanout.ts's helpers are:
// vitest here runs under a plain "node" environment (vitest.config.ts), so
// anything that touches React state/the DOM has to stay inside the "use
// client" component itself, and only the decision logic - "which step is
// current," "what should the aria-live region say" - comes out here where it
// can be unit-tested directly.
//
// Type-only import: erased at compile time, so importing this module never
// pulls a client-only dependency into a test run.
import type { RunStateGroup } from "./attended-fanout";
import { composedGroupLabel } from "@/lib/workflows/fanout";

/** A step's position within a (possibly fanned-out) run: which group, and
 * which step inside that group. Both indices are parallel to WorkflowPanel's
 * own `expanded.steps`/`runState` arrays - see that file for how the two
 * line up. */
export interface ActiveStepLocation {
  groupIndex: number;
  stepIndex: number;
}

/** Aggregate step counts across every group of the run, used for the
 * sidebar's persistent "N/M steps" readout - the one number an instructor
 * can check at a glance without reading through every group's own step list
 * (which, for a course fan-out, can run to dozens of groups). A step counts
 * as "settled" once it can no longer change - done, error, skipped, and
 * disabled all qualify; pending and running do not. */
export function countSettledSteps(groups: RunStateGroup[]): { settled: number; total: number } {
  let settled = 0;
  let total = 0;
  for (const group of groups) {
    for (const step of group.steps) {
      total += 1;
      if (step.status !== "pending" && step.status !== "running") settled += 1;
    }
  }
  return { settled, total };
}

/**
 * Finds the first step across all groups - in group order, then step order,
 * matching both the main column's own render order and the actual execution
 * order (server-runner.ts and useWorkflowRun.ts both run groups and their
 * steps strictly sequentially, never in parallel, so "first running" is
 * always THE running step, never a race between two) - whose status is
 * "running". Returns null once nothing is running: before the first step
 * starts, momentarily between two steps, or after the run ends.
 */
export function findRunningStep(groups: RunStateGroup[]): ActiveStepLocation | null {
  for (let g = 0; g < groups.length; g++) {
    const stepIndex = groups[g].steps.findIndex((s) => s.status === "running");
    if (stepIndex !== -1) return { groupIndex: g, stepIndex };
  }
  return null;
}

/**
 * Builds the sidebar's aria-live announcement text for the run's current
 * situation, given its groups, the workflow's own step display names
 * (parallel to every group's `steps` array - see WorkflowPanel.tsx's
 * `stepDisplayNames`), and where - if anywhere - the run is currently
 * paused waiting on the instructor (a confirmation prompt or a run-input
 * prompt; see useWorkflowRun.ts's runPause/runInput). `waitingFor` takes
 * priority over an actually-running step because the run engine treats a
 * pause/input wait as the step's OWN status staying "running" while it
 * blocks - so both can be simultaneously true, and "needs your input" is
 * the more actionable thing to say.
 *
 * Deliberately narrow in what it announces (the DoD calls for "not
 * chatty"): only the step actually running, or the step blocked waiting on
 * the instructor - never a running commentary on every status change, so a
 * screen reader user isn't interrupted every time some OTHER step quietly
 * finishes. Returns null when there is nothing worth announcing (nothing
 * running, nothing waiting - e.g. before the run starts, or after it ends;
 * the run's own finished state is visible in the main column's output,
 * which is already where focus naturally lands after clicking Run).
 */
export function describeRunProgressAnnouncement(
  groups: RunStateGroup[],
  stepNames: string[],
  waitingFor: ActiveStepLocation | null
): string | null {
  const target = waitingFor ?? findRunningStep(groups);
  if (!target) return null;
  const group = groups[target.groupIndex];
  if (!group) return null;

  const name = stepNames[target.stepIndex] ?? `Step ${target.stepIndex + 1}`;
  const groupLabel = group.courseId
    ? composedGroupLabel(group.courseName ?? "", group.institution)
    : group.institution;
  const stepLabel = `Step ${target.stepIndex + 1} of ${group.steps.length}: ${name}`;
  const situation = waitingFor ? "needs your input" : "running";

  return groupLabel ? `${groupLabel} - ${stepLabel}, ${situation}` : `${stepLabel}, ${situation}`;
}
