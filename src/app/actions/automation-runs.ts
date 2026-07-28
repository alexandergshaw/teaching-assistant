"use server";

// Server actions backing the Automations hub's per-row "Recent runs" table
// and log viewer. Every run/step/artifact read already exists in
// src/lib/workflow-runs.ts, src/lib/workflow-run-log-text.ts, and
// src/lib/recording-files.ts - this file is the owner-scoped wiring between
// those and the client components in components/workflows, following the
// try/requireOwner/catch-returns-error shape used throughout src/app/actions.

import { createServiceClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/supabase/auth";
import { listRecentRuns, getRun, listRunSteps, type WorkflowRunStatus } from "@/lib/workflow-runs";
import { buildRunLogText } from "@/lib/workflow-run-log-text";
import { listRecordingFilesForRuns, getRecordingFileById, getRecordingFileUrl } from "@/lib/recording-files";
import { groupArtifactsByRun, type RunArtifactSummary } from "@/lib/automation-run-artifacts";

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
    const runIds = runs.map((r) => r.id);
    const files = await listRecordingFilesForRuns(supabase, user.id, runIds);
    const artifactsByRun = groupArtifactsByRun(files);

    return {
      runs: runs.map((r) => ({
        id: r.id,
        status: r.status,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        durationMs: r.durationMs,
        stepCount: r.stepCount,
        errorCount: r.errorCount,
        artifacts: artifactsByRun.get(r.id) ?? [],
      })),
    };
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
