// U9: completing a course zip's embedded run log after the run that saved
// it has finished. U8 (steps.course-setup.storage.ts's "save-zip-to-course")
// can only ever embed a SNAPSHOT of the run log, because it is not the last
// step of Course Refresh or the kickoff presets that include it - other
// steps (integrate-source-into-lms, populate-lms-from-class-template) still
// run after it, and the zip step's own outcome obviously cannot appear in
// its own log. This module is the seam that closes that gap: once the
// workflow body has finished, it fetches the zip that was saved, replaces
// its single "Course-Wide/Run Log.txt" entry with the COMPLETE log, and
// saves the result back under the SAME course id and file name.
//
// Server-only (no "use client", no DOM/window access) - imported directly by
// server-runner.ts (the unattended path, already fully server-side) and by a
// thin server action in src/app/actions/automation-runs.ts (the attended
// path - see that file's completeCourseZipRunLogsAction, which
// useWorkflowRun.ts calls; U9-AC6 requires the attended path go through a
// server action, never a direct storage-library call from client code).
//
// jszip is opened/rewritten here exactly as steps.course-setup.storage.ts and
// cartridge-import.ts already do - no new zip library.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getRun, listRunSteps, type WorkflowRunRecord } from "@/lib/workflow-runs";
import { buildRunLogText } from "@/lib/workflow-run-log-text";
import { listCourseHubAction, appendCourseMaterialFileAction } from "@/app/actions";
import { uploadCourseZip, downloadCourseZipBlob, removeCourseZip } from "@/lib/course-files";
import { joinStepErrorDetail } from "./run-detail";
import type { SavedCourseZipRef } from "./run-logging";

/** The conventional path save-zip-to-course writes the run log to (see
 * steps.course-setup.storage.ts) - routed through that step's own uniquePath
 * helper there, so this is the entry's name in the overwhelming common case
 * (no name collision with a generated file). completeCourseZipRunLog targets
 * this exact path: if a rare collision meant the log actually landed
 * elsewhere in the snapshot, this adds a fresh entry at the conventional path
 * rather than guessing which existing entry was the log - never touching an
 * unrelated file.
 *
 * Exported so useWorkflowRun.ts's end-of-run download flush (AC1/AC2,
 * defect run 556b49f0's zip-log follow-up) can target the SAME path when it
 * patches a save-zip-to-course archive's embedded snapshot with the complete
 * log before the browser download fires - the two must agree on the path or
 * a patch would add a SECOND, stray entry instead of replacing the first. */
export const RUN_LOG_ENTRY_PATH = "Course-Wide/Run Log.txt";

/**
 * Build the COMPLETE run log text for embedding into a saved course zip,
 * once the workflow body driving `runId` has finished. Every step this run
 * has logged - via logStepOutcome/recordRunStep (run-logging.ts) - is
 * already written by the time this is called, INCLUDING save-zip-to-course's
 * own outcome and every step that ran after it (U9-AC2). Returns null when
 * the run itself cannot be found (e.g. a redacted/deleted row) - callers
 * treat that as "nothing to embed", never as reason to touch the saved zip.
 *
 * The run's own top-level row (workflow_runs) is not marked finished at the
 * moment this runs: finishWorkflowRun is called by each caller (the cron
 * route, the run-now route, the trigger runner, the webhook route, or - for
 * an attended run - useWorkflowRun.ts) AFTER the workflow body finishes,
 * using data (whether the run genuinely succeeded, its final step/error
 * counts) this function has no access to reuse verbatim, and reading the row
 * as-is here would show "Status: running" / "no finish record" for a run
 * that has, from this function's own point of view, already finished its
 * steps - embedding a "complete" log that contradicts itself that way would
 * be worse than the snapshot it replaces. So the run's terminal fields are
 * synthesized here from what the CALLER already knows (`ok`, the fetched
 * steps) rather than trusted from the row; everything else (id, workflowName,
 * workflowId, triggerSource, triggerRef, startedAt, fieldValues, detail)
 * never changes after the run starts, so it is read verbatim.
 *
 * EXCEPT `detail` (C3 fix): despite the paragraph above, `run.detail` is NOT
 * read verbatim from the row - it is synthesized too, for exactly the same
 * reason as status/finishedAt/durationMs. `detail` (the course fan-out
 * summary and/or the deduped failure list - the single most useful part of
 * the log on a failed run) is written to the row ONLY by finishWorkflowRun,
 * which every caller of this function - server-runner.ts's post-run stage
 * directly, and useWorkflowRun.ts indirectly via the automation-runs.ts
 * actions below - runs strictly AFTER this function is called. So
 * `run.detail` read off the row here is deterministically null/stale, not
 * racily: reading it verbatim was the C3 defect (see docs/REGRESSION.md
 * entry 197's "REMAINING, VERIFIED GAP" note) - the Detail: section of every
 * downloaded run-log zip came out empty, always.
 *
 * `detailOverride` fixes this by SHARING rather than duplicating: a caller
 * that already knows (or, like server-runner.ts, is about to compute) the
 * exact text it will separately hand to finishWorkflowRun passes it straight
 * through here, so the embedded log matches the DB row exactly rather than
 * this function guessing at it independently. When no override is supplied
 * (undefined - e.g. getCompleteRunLogTextAction, called from
 * finalize-run-download.ts before the attended loop has finished computing
 * its own course-fan-out-prefixed detail), this falls back to synthesizing
 * the deduped-failure-list half of that text itself, from the SAME `steps`
 * already fetched above, using the identical joinStepErrorDetail (run-
 * detail.ts) every finishWorkflowRun caller already uses for that half - so
 * the Detail: section is never silently empty, even on the one call path
 * that cannot supply a full override. Never fabricated for a passing run:
 * `ok` still gates it to "" exactly like every finishWorkflowRun caller's own
 * ternary does.
 */
export async function buildCompleteRunLogText(
  supabase: SupabaseClient<Database>,
  userId: string,
  runId: string,
  ok: boolean,
  detailOverride?: string | null
): Promise<string | null> {
  const run = await getRun(supabase, userId, runId);
  if (!run) return null;
  const steps = await listRunSteps(supabase, userId, runId);

  const finishedAt = new Date();
  const startedAtMs = run.startedAt ? Date.parse(run.startedAt) : NaN;
  const durationMs = Number.isNaN(startedAtMs) ? null : Math.max(0, finishedAt.getTime() - startedAtMs);
  // Mirrors the "genuine failure" count every caller of finishWorkflowRun
  // already uses (e.g. the manual run-now route): a disabled/skipped step is
  // never a failure, only an outright error or an unattended run stopped
  // dead by an unanswerable interaction step.
  const errorCount = steps.filter((s) => s.status === "error" || s.status === "needs-interaction").length;

  const detail: string | null =
    detailOverride !== undefined
      ? detailOverride
      : ok
        ? ""
        : joinStepErrorDetail(steps.map((s) => ({ index: s.stepIndex, type: s.stepType, status: s.status, error: s.error })));

  const completedRun: WorkflowRunRecord = {
    ...run,
    status: ok ? "ok" : "error",
    finishedAt: finishedAt.toISOString(),
    durationMs,
    stepCount: steps.length,
    errorCount,
    detail,
  };

  return buildRunLogText(completedRun, steps);
}

export type CompleteZipResult = { ok: true } | { ok: false; reason: string };

/**
 * U9-AC2/AC4/AC5: replace the SINGLE run-log entry of the course zip a
 * workflow run saved with the complete log text built above, preserving
 * every other entry byte for byte, and NEVER touching the saved zip unless
 * the full replacement blob was built successfully in memory first
 * (U9-AC4) - every await before the final upload only READS or builds data;
 * the upload/append/cleanup sequence at the end is the first point anything
 * is written, and any earlier failure returns before reaching it, leaving
 * the existing saved zip exactly as it was.
 *
 * Idempotent (U9-AC5): `ref` names the SAME (courseId, fileName) every time
 * this is called for a given run's zip, and appendCourseMaterialFile
 * deduplicates a course's materials list by name (see
 * src/lib/supabase/courses.ts) - so re-running this locates the
 * previously-completed zip (not a copy or a nested archive), replaces the
 * SAME entry again, and ends with one file, one entry, up to date.
 */
export async function completeCourseZipRunLog(
  supabase: SupabaseClient<Database>,
  userId: string,
  ref: SavedCourseZipRef,
  logText: string
): Promise<CompleteZipResult> {
  try {
    const list = await listCourseHubAction();
    if ("error" in list) return { ok: false, reason: list.error };
    const tile = list.courses.find((c) => c.id === ref.courseId);
    if (!tile) return { ok: false, reason: "Course tile not found." };
    const entry = tile.materialsFiles.find((f) => f.name === ref.fileName);
    if (!entry) return { ok: false, reason: "The saved zip was not found on the course tile." };

    const existingBlob = await downloadCourseZipBlob(supabase, { path: entry.path });
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(existingBlob);
    zip.file(RUN_LOG_ENTRY_PATH, logText);
    const newBlob = await zip.generateAsync({ type: "blob" });

    // Only now - after the full replacement blob exists in memory - is the
    // saved zip touched (U9-AC4). uploadCourseZip writes a NEW object
    // alongside the existing one; appendCourseMaterialFileAction then swaps
    // the tile's record to point at it (deduplicating by name replaces the
    // old entry); only once THAT has succeeded is the old object removed -
    // the exact upload-then-swap-then-clean-up order every other save path
    // in this app already uses (see
    // buildServerStepRunHelpers.saveCourseMaterialFile in server-runner.ts).
    const { path } = await uploadCourseZip(supabase, userId, ref.courseId, newBlob, null);
    const r = await appendCourseMaterialFileAction(ref.courseId, { name: ref.fileName, path, size: newBlob.size });
    if ("error" in r) {
      await removeCourseZip(supabase, path);
      return { ok: false, reason: r.error };
    }
    if (r.replacedPath) {
      await removeCourseZip(supabase, r.replacedPath);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Unknown error." };
  }
}

/**
 * The single entry point both runners use: build the complete log once (a
 * run whose fan-out saved more than one course zip embeds the SAME complete
 * log in each of them - it describes the whole run, not one course's slice
 * of it) and complete every distinct saved zip with it. Never throws - a
 * failure completing one zip is recorded in the returned list and does not
 * stop the others; this whole feature is a best-effort addition to an
 * already-saved deliverable, never something that can fail the run itself
 * (U9-AC4's "the zip is the deliverable, the log is an addition to it"
 * applies at the run level too, not just per zip).
 *
 * `detail` (C3): passed straight through to buildCompleteRunLogText as its
 * detailOverride - see that function's own doc comment for why this exists
 * (the Detail: section's own deterministic-emptiness fix) and why sharing an
 * already-computed value here is preferred over this module guessing at one
 * independently. Optional/undefined for a caller with nothing better to
 * offer - buildCompleteRunLogText's own fallback still applies in that case.
 */
export async function completeCourseZipRunLogs(
  supabase: SupabaseClient<Database>,
  userId: string,
  runId: string,
  ok: boolean,
  refs: SavedCourseZipRef[],
  detail?: string | null
): Promise<Array<{ ref: SavedCourseZipRef; result: CompleteZipResult }>> {
  if (refs.length === 0) return [];
  try {
    const logText = await buildCompleteRunLogText(supabase, userId, runId, ok, detail);
    if (logText === null) {
      return refs.map((ref) => ({ ref, result: { ok: false, reason: "Run not found." } }));
    }
    const results: Array<{ ref: SavedCourseZipRef; result: CompleteZipResult }> = [];
    for (const ref of refs) {
      try {
        const result = await completeCourseZipRunLog(supabase, userId, ref, logText);
        results.push({ ref, result });
      } catch (err) {
        results.push({ ref, result: { ok: false, reason: err instanceof Error ? err.message : "Unknown error." } });
      }
    }
    return results;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error.";
    return refs.map((ref) => ({ ref, result: { ok: false, reason } }));
  }
}
