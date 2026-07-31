"use server";

// Server actions backing "Recent runs" listings and the log viewer, used by
// both the Automations hub (one schedule/trigger's runs) and the Workflows
// tab (one workflow's runs regardless of what caused them). Every run/step/
// artifact read already exists in src/lib/workflow-runs.ts,
// src/lib/workflow-run-log-text.ts, and src/lib/recording-files.ts - this
// file is the owner-scoped wiring between those and the client components in
// components/workflows, following the try/requireOwner/catch-returns-error
// shape used throughout src/app/actions.

import { createServiceClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/supabase/auth";
import { listRecentRuns, getRun, listRunSteps, type WorkflowRunRecord, type WorkflowRunStatus } from "@/lib/workflow-runs";
import { buildRunLogText } from "@/lib/workflow-run-log-text";
import { listRecordingFilesForRuns, getRecordingFileById, getRecordingFileUrl } from "@/lib/recording-files";
import { groupArtifactsByRun, type RunArtifactSummary } from "@/lib/automation-run-artifacts";
import { listWorkflowDefs } from "@/lib/workflow-defs";
import { allWorkflows } from "@/lib/workflows/presets";
import { expandWorkflowDef } from "@/lib/workflows/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export interface AutomationRunSummary {
  id: string;
  status: WorkflowRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  stepCount: number | null;
  errorCount: number | null;
  artifacts: RunArtifactSummary[];
}

/**
 * Attach each run's persisted artifacts (recording_files rows) and map to
 * the client-facing summary shape - the part listAutomationRunsAction and
 * listRunsForWorkflowAction below share verbatim. Only the listRecentRuns
 * filter differs between the two (triggerRef vs workflowId), so this is
 * factored out rather than duplicated across them.
 */
async function toRunSummaries(
  supabase: SupabaseClient<Database>,
  userId: string,
  runs: WorkflowRunRecord[]
): Promise<AutomationRunSummary[]> {
  const runIds = runs.map((r) => r.id);
  const files = await listRecordingFilesForRuns(supabase, userId, runIds);
  const artifactsByRun = groupArtifactsByRun(files);

  return runs.map((r) => ({
    id: r.id,
    status: r.status,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    durationMs: r.durationMs,
    stepCount: r.stepCount,
    errorCount: r.errorCount,
    artifacts: artifactsByRun.get(r.id) ?? [],
  }));
}

/**
 * Recent runs caused by one schedule/trigger (identified by triggerRef -
 * WorkflowRunRecord.triggerRef), newest first, each with the artifacts it
 * produced attached. Powers the "Recent runs" section in the Automations
 * hub's per-row Details disclosure; called lazily when that disclosure
 * opens, never on page load.
 */
export async function listAutomationRunsAction(
  triggerRef: string,
  limit: number
): Promise<{ runs: AutomationRunSummary[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const runs = await listRecentRuns(supabase, user.id, { triggerRef, limit });
    return { runs: await toRunSummaries(supabase, user.id, runs) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load recent runs." };
  }
}

/**
 * Recent runs of one WORKFLOW, newest first, regardless of what caused each
 * one (manual click, schedule, trigger, webhook) - each with the artifacts
 * it produced attached, same as listAutomationRunsAction above.
 *
 * Named listRunsForWorkflowAction, not listWorkflowRunsAction, because that
 * name is already taken by github-repos.ts's GitHub Actions CI run list (a
 * completely different domain reusing the word "workflow" - see
 * useActionsTab.ts) and both are re-exported through the same src/app/actions
 * barrel, where a same-named export from two source files is a compile error.
 *
 * A sibling action rather than a generalized listAutomationRunsAction: the
 * two answer different questions ("this schedule/trigger's runs" vs "this
 * workflow's runs, however caused"), triggerRef and workflowId are never
 * both meaningful for the same call, and listAutomationRunsAction's
 * (triggerRef, limit) signature is already pinned by
 * automation-runs.test.ts and consumed by AutomationRunsSection/AutomationRow
 * - changing its shape to a filter object would touch working, tested call
 * sites for no behavioral gain. The actual duplication risk (fetching
 * artifacts and mapping to AutomationRunSummary) is factored into
 * toRunSummaries above instead, so the two actions share that logic and
 * differ only in which listRecentRuns filter they pass - the one line that
 * is genuinely specific to each. Powers the Workflows tab's "Run history"
 * disclosure (WorkflowPanel); called lazily when that disclosure opens,
 * never on tab mount or workflow selection.
 */
export async function listRunsForWorkflowAction(
  workflowId: string,
  limit: number
): Promise<{ runs: AutomationRunSummary[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const runs = await listRecentRuns(supabase, user.id, { workflowId, limit });
    return { runs: await toRunSummaries(supabase, user.id, runs) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load recent runs." };
  }
}

/**
 * The full plain-text log for one run (see buildRunLogText), fetched on
 * demand when a "Log" action is clicked - never prefetched for every row in
 * the table. A run id that is missing or not owned by the caller returns an
 * error, never another user's data: getRun scopes its read by user_id and
 * returns null on no match, which this maps to an error rather than passing
 * through.
 */
export async function getAutomationRunLogAction(
  runId: string
): Promise<{ text: string; workflowName: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const run = await getRun(supabase, user.id, runId);
    if (!run) {
      return { error: "Run not found." };
    }
    const steps = await listRunSteps(supabase, user.id, runId);
    return { text: buildRunLogText(run, steps), workflowName: run.workflowName };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the run log." };
  }
}

/**
 * Which step TYPES a still-IN-PROGRESS run had not yet reached, as of right
 * now - reused by `save-zip-to-course` (U8-AC2, steps.course-setup.storage.ts)
 * so the run log it embeds in the terminal zip can NAME the steps that ran
 * after it, rather than silently reading as a complete log when it is
 * actually a mid-run snapshot (save-zip-to-course is not the final step of
 * Course Refresh / the kickoff presets - `integrate-source-into-lms` and
 * `populate-lms-from-class-template` both run after it).
 *
 * Resolution mirrors the exact pattern the cron route / run-now route already
 * use to find a run's own workflow definition (listWorkflowDefs + allWorkflows
 * + a byId lookup for expandWorkflowDef's include-workflow resolution) - nothing
 * new is invented here, just reused. Every step this run has ALREADY logged a
 * row for - whether it finished, errored, was skipped, or was disabled -
 * occupies one array slot in `listRunSteps`'s result, in the SAME order
 * server-runner.ts's step loop runs them (see run-logging.ts's logStepOutcome,
 * called once per step before the next one starts) - so
 * `loggedSteps.length` is reliably this step's own 0-based position in a
 * normal (non-fan-out) run, and `expanded.steps.slice(loggedSteps.length + 1)`
 * is everything after it.
 *
 * Returns `{ ok: true, stepTypes }` when this could be determined reliably
 * (an empty array is a real, positive fact: this step genuinely was the
 * last one) and `{ ok: false }` whenever it could not be - a deleted custom
 * workflow, an unresolvable include, a fan-out run where step indices repeat
 * (the length-based position math no longer lines up), or any other failure.
 * Callers must render an honest "could not be determined" caveat for
 * `ok: false`, never treat it the same as a genuinely empty list.
 */
export async function getNotYetRunStepTypesAction(
  runId: string
): Promise<{ ok: true; stepTypes: string[] } | { ok: false }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const run = await getRun(supabase, user.id, runId);
    if (!run) return { ok: false };

    const [customDefs, loggedSteps] = await Promise.all([
      listWorkflowDefs(supabase, user.id),
      listRunSteps(supabase, user.id, runId),
    ]);

    const defs = allWorkflows(customDefs);
    const byId = new Map(defs.map((d) => [d.id, d]));
    const def = byId.get(run.workflowId);
    if (!def) return { ok: false };

    const expanded = expandWorkflowDef(def, (id) => byId.get(id));
    const notYetRunFrom = loggedSteps.length + 1; // +1 skips this step itself - it has not logged its own row yet
    if (notYetRunFrom > expanded.steps.length) return { ok: false };

    return { ok: true, stepTypes: expanded.steps.slice(notYetRunFrom).map((s) => s.type) };
  } catch {
    return { ok: false };
  }
}

/**
 * A signed download URL for one artifact (recording_files row), by id. Same
 * ownership guarantee as getAutomationRunLogAction: a missing or foreign id
 * returns an error rather than another user's file.
 */
export async function getAutomationArtifactUrlAction(
  fileId: string
): Promise<{ url: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const file = await getRecordingFileById(supabase, user.id, fileId);
    if (!file) {
      return { error: "File not found." };
    }
    const url = await getRecordingFileUrl(supabase, file);
    return { url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not get the download URL." };
  }
}
