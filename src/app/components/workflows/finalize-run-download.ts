// AC1/AC2 (defect run 556b49f0's zip-log follow-up): the end-of-run download
// flush useWorkflowRun.ts's handleRun triggers once every course's step loop
// has finished. Extracted out of that file to keep it under this project's
// 1000-line cap (same reasoning load-course-materials-attended.ts's own
// header comment already gives for its own extraction).
//
// This REPLACES the per-course flush AC4 (defect-2 write-up) used to run
// inline inside useWorkflowRun.ts's course-fanout loop: that flush fired once
// per course, right when that course's own step group finished; this one
// fires exactly once, after the WHOLE run's fan-out loop finishes, over
// every course's pending downloads accumulated together. For a single-course
// run this produces the SAME single download AC4 always did (the
// accumulator holds only that one course's files - never a second,
// redundant download); for a multi-course run it is the ONE cumulative zip
// AC2 asks for. See attended-fanout.ts's planCourseDownload doc comment for
// why the underlying "what to download" decision logic itself needed no
// change for this - only the call site (per-course -> per-run) moved.
//
// Building the actual zip (JSZip) and the DOM download mechanics both live
// HERE rather than in attended-fanout.ts's pure decision functions
// (planCourseDownload/withTopLevelRunLog) - this module is the "how", those
// are the "what", matching the split those functions' own doc comments
// describe (a DOM/zip-library dependency would make them untestable without
// a browser). finalizeRunDownload itself is therefore not directly unit
// tested the way attended-fanout.ts's pure functions are (this repo's vitest
// setup has no jsdom - see useWorkflowRun.ts's own header note on the same
// point); it is kept intentionally thin (fetch text, patch entries via the
// tested pure helpers, build the zip, trigger the download) so the actual
// decision logic it calls out to IS covered.

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getCompleteRunLogTextAction } from "@/app/actions";
import { RUN_LOG_ENTRY_PATH } from "@/lib/workflows/zip-run-log-completion";
import { joinStepErrorDetail, type StepErrorDetailInput } from "@/lib/workflows/run-detail";
import { composedGroupLabel } from "@/lib/workflows/fanout";
import {
  planCourseDownload,
  withTopLevelRunLog,
  buildCourseFanoutDetail,
  type RunPendingDownload,
  type CourseOutcome,
} from "./attended-fanout";

/**
 * AC1 (defect run 556b49f0's zip-log follow-up): reopen one pending
 * download's blob and replace its embedded run-log entry with the run's
 * COMPLETE text - but ONLY when the entry is tagged as a save-zip-to-course
 * archive (`entry.savedZipRef` set, via SAVED_ZIP_OUTPUT_KEY - see
 * RunPendingDownload's own doc comment, attended-fanout.ts). Every OTHER
 * DOWNLOADABLE_OUTPUT_KEY producer (blackboard-export, lecture-zip,
 * castletop-workbook, ...) is left byte-for-byte untouched even when it
 * happens to be zip-shaped: those archives are deliverables that may be
 * re-uploaded elsewhere (e.g. a Common Cartridge import into an LMS), and
 * splicing an unexpected extra file into one is a real, avoidable risk this
 * feature has no reason to take - only save-zip-to-course's OWN archive is a
 * materials bundle this app created and fully controls the contents of.
 *
 * Any failure to open the tagged blob as a zip (a corrupt read, or a shape
 * this app itself never produces) is caught and the ORIGINAL blob is
 * returned unchanged - a logging upgrade must never cost the instructor
 * their actual deliverable. Writes to RUN_LOG_ENTRY_PATH (zip-run-log-
 * completion.ts) - the SAME path save-zip-to-course itself reserves and
 * completeCourseZipRunLogsAction later replaces in the SAVED (course-tile)
 * copy - so this patch and that one agree on where the log lives.
 */
async function patchEmbeddedRunLog(entry: RunPendingDownload, logText: string): Promise<Blob> {
  if (!entry.savedZipRef) return entry.blob;
  try {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(entry.blob);
    zip.file(RUN_LOG_ENTRY_PATH, logText);
    return await zip.generateAsync({ type: "blob" });
  } catch {
    return entry.blob;
  }
}

/** One course's own accumulated failing-step entries for this run - the
 * per-course grouping useWorkflowRun.ts's course-fanout loop already has in
 * hand (each StepErrorDetailInput it pushes onto its run-wide `allErrors`
 * happens inside that loop's per-course iteration) before it flattens them
 * into one list for its own finishWorkflowRun call. `institution` mirrors
 * CourseOutcome's sibling fields elsewhere in this fan-out
 * (RunStateGroup.institution, attended-fanout.ts) - null when the course
 * tile has none, matching every other course-fan-out surface's convention. */
export interface CourseFailureGroup {
  courseId: string;
  courseName: string;
  institution: string | null;
  errors: StepErrorDetailInput[];
}

/**
 * AC5 residual (docs/REGRESSION.md entry 203): attribute the run-level
 * Detail: section this artifact embeds to the course(s) a course-fan-out run
 * actually touched, closing the gap recorded there - "that ONE artifact gets
 * the failure list without the course fan-out prefix". Reuses, never
 * reinvents, the two conventions already established elsewhere for exactly
 * this purpose:
 *
 *  - buildCourseFanoutDetail (attended-fanout.ts) for the leading course-
 *    count summary ("5/7 courses ok; 2 failed") - the SAME helper
 *    useWorkflowRun.ts's own handleRun already calls to build the
 *    "course-fan-out-prefixed detail text" (see automation-runs.ts's own
 *    phrase for it) it hands finishWorkflowRun and
 *    completeCourseZipRunLogsAction for this identical field, right after
 *    its own call to finalizeRunDownload. This reproduces that SAME
 *    `${courseSummary} - ${failureList}` formula rather than inventing a
 *    competing one.
 *  - composedGroupLabel (workflows/fanout.ts) for labeling ONE course's own
 *    slice of the failure list ("<institution>: <course name>") - the SAME
 *    convention buildRunReportMarkdown (server-runner.ts), the fan-out group
 *    headers (RunProgressSidebar.tsx / WorkflowPanel.tsx /
 *    run-progress-sidebar.ts), and workflow-run-log-text.ts's own
 *    iterationLabel already use to attribute a piece of run output to the
 *    course that produced it.
 *
 * joinStepErrorDetail (run-detail.ts) - AC5's own dedup helper - still runs
 * PER COURSE here, preserving its "(xN)" collapse for the SAME failure
 * repeating within one course's own steps exactly as AC5 added it.
 * Deliberately NOT run across courses: the SAME failure happening in two
 * DIFFERENT courses is a systemic problem, not a duplicate to fold away, and
 * collapsing it into one unattributed "(x2)" line would hide which course(s)
 * it actually happened in - the exact defect this residual exists to close.
 * So a genuine multi-course run (more than one course total, per
 * `courseOutcomes`) gets one labeled block per course that had a failure;
 * the SAME failure in two courses therefore reads as two separately labeled
 * lines, not one merged count. A run that only ever touched one course
 * (fewer than two entries in `courseOutcomes`, including none at all) gets
 * the SAME plain, unlabeled joinStepErrorDetail output it always did - a
 * label naming the only course involved would be pure noise.
 */
export function buildAttributedRunDetail(
  courseOutcomes: CourseOutcome[] | undefined,
  failureGroups: CourseFailureGroup[]
): string {
  const groupsWithErrors = failureGroups.filter((g) => g.errors.length > 0);
  const isMultiCourse = (courseOutcomes?.length ?? 0) > 1;

  const failureList = isMultiCourse
    ? groupsWithErrors
        .map((g) => {
          const joined = joinStepErrorDetail(g.errors);
          return joined ? `${composedGroupLabel(g.courseName, g.institution)} - ${joined}` : "";
        })
        .filter((entry) => entry.length > 0)
        .join("; ")
    : joinStepErrorDetail(groupsWithErrors.flatMap((g) => g.errors));

  if (!courseOutcomes || courseOutcomes.length === 0) return failureList;
  const courseSummary = buildCourseFanoutDetail(courseOutcomes);
  return failureList ? `${courseSummary} - ${failureList}` : courseSummary;
}

/**
 * Decide what (if anything) to download for the whole run and fire it - a
 * no-op outside a browser (`typeof document === "undefined"`, the SAME guard
 * this logic always carried pre-extraction) and when nothing was handed off.
 *
 * Before deciding what to download, every save-zip-to-course archive in
 * `pendingRunDownloads` gets its embedded run log upgraded from the SNAPSHOT
 * that step froze in the moment it ran (it is not the run's last step - see
 * buildRunLogSnapshotHeader's own doc comment, steps.course-setup.storage.ts)
 * to the run's COMPLETE text: that text is now available before the browser
 * ever sees these bytes, since the download itself is deferred to this
 * point, so there is no "already downloaded, cannot be reached" problem left
 * to work around for THIS copy (the tile-saved copy is completed separately,
 * via completeCourseZipRunLogsAction - the two are independent best-effort
 * writes over the SAME text, one patching an in-memory blob here, one
 * patching stored bytes there). Fetching that text is itself best-effort
 * (gated on `user && supabase`, wrapped in try/catch): a failure here never
 * blocks the download, it just leaves whatever log (if any) save-zip-to-
 * course already embedded as-is.
 */
export async function finalizeRunDownload(opts: {
  pendingRunDownloads: RunPendingDownload[];
  workflowRunId: string;
  /** Whether the run finished with no genuine failure - passed straight
   * through to getCompleteRunLogTextAction, which needs it to synthesize a
   * FINISHED run header (see buildCompleteRunLogText's own doc comment,
   * zip-run-log-completion.ts) rather than trust the still-"running" stored
   * row (finishWorkflowRun has not necessarily run yet at this point). */
  ok: boolean;
  user: User | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any> | null;
  /** Built by the caller via buildWorkflowFileName (file-names.ts), so it
   * matches every other artifact's naming convention - naming needs the
   * course/workflow context this module intentionally has no dependency on. */
  combinedFileName: string;
  /** AC5 residual (docs/REGRESSION.md entry 203): the SAME per-course pass/
   * fail counts useWorkflowRun.ts's own course-fan-out loop already builds
   * (its `courseOutcomes` accumulator) - optional so an existing caller that
   * has not been wired to supply it yet still gets today's behavior
   * unchanged (buildCompleteRunLogText's own self-computed, unattributed
   * fallback). Combined with `failureGroups` below via
   * buildAttributedRunDetail to build this artifact's Detail: text with the
   * SAME course-fan-out prefix every other computation of this field
   * already carries. */
  courseOutcomes?: CourseOutcome[];
  /** AC5 residual: this run's failing steps, grouped by the course each one
   * ran for - the per-course slices useWorkflowRun.ts's course-fanout loop
   * already has before it flattens them into one run-wide list. Optional,
   * same reasoning as `courseOutcomes` above; only used when non-empty (a
   * caller with genuinely nothing to report here is treated exactly like a
   * caller that omitted it, not as "zero failures, embed an empty Detail:
   * section" - that distinction matters because getCompleteRunLogTextAction's
   * `detail` argument, once supplied, REPLACES its own fallback outright). */
  failureGroups?: CourseFailureGroup[];
}): Promise<void> {
  const { pendingRunDownloads, workflowRunId, ok, user, supabase, combinedFileName, courseOutcomes, failureGroups } = opts;
  if (typeof document === "undefined" || pendingRunDownloads.length === 0) return;

  // AC5 residual: only override the builder's own self-computed Detail: text
  // when the caller actually handed us something to attribute - a run that
  // succeeded (`ok`) never has a genuine failure to attribute in the first
  // place (mirrors every other computation of this field's own `ok ? "" :
  // ...` gate), and a caller with no failureGroups at all (today's only
  // caller, useWorkflowRun.ts, not yet wired to supply one) must keep
  // falling through to buildCompleteRunLogText's existing fallback rather
  // than being handed an empty override that would blank the section out.
  const attributedDetail: string | undefined =
    !ok && failureGroups && failureGroups.some((g) => g.errors.length > 0)
      ? buildAttributedRunDetail(courseOutcomes, failureGroups)
      : undefined;

  let completeLogText: string | null = null;
  if (user && supabase) {
    try {
      const logResult =
        attributedDetail !== undefined
          ? await getCompleteRunLogTextAction(workflowRunId, ok, attributedDetail)
          : await getCompleteRunLogTextAction(workflowRunId, ok);
      if (!("error" in logResult)) completeLogText = logResult.text;
    } catch {
      // Best-effort - the download below still happens either way, just
      // without an upgraded log.
    }
  }

  const patchedEntries: RunPendingDownload[] =
    completeLogText === null
      ? pendingRunDownloads
      : await Promise.all(
          pendingRunDownloads.map(async (entry) => ({
            ...entry,
            blob: await patchEmbeddedRunLog(entry, completeLogText!),
          }))
        );

  const plan = planCourseDownload(patchedEntries, combinedFileName);
  if (plan.kind === "none") return;

  let finalBlob: Blob;
  let finalName: string;
  if (plan.kind === "single") {
    // The common (single-course, single-artifact) case - exactly what AC4
    // already produced, byte for byte, except the log inside it (when it is
    // a save-zip-to-course archive) is now the complete text rather than a
    // snapshot.
    finalBlob = plan.blob;
    finalName = plan.fileName;
  } else {
    // More than one distinct artifact across the run (several courses,
    // and/or several artifacts within one course) - bundle them into one
    // outer zip, PLUS a top-level "Run Log.txt" (withTopLevelRunLog,
    // attended-fanout.ts) so the log is discoverable at the root regardless
    // of which nested entries do or do not already carry their own patched
    // copy.
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const entries = withTopLevelRunLog(plan.entries, completeLogText);
    for (const entry of entries) {
      zip.file(entry.name, entry.blob);
    }
    finalBlob = await zip.generateAsync({ type: "blob" });
    finalName = plan.fileName;
  }

  const url = URL.createObjectURL(finalBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = finalName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
