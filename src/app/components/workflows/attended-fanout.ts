// Pure helpers for the attended (in-browser) course fan-out orchestration
// used by useWorkflowRun.ts's handleRun loop. Extracted so the "Stop after
// this course" cancel transition and the course-outcome summary/detail text
// are unit-testable: vitest.config.ts runs tests under a plain "node"
// environment (no DOM), so anything living inside the "use client" hook
// itself (React state, refs) cannot be exercised directly - these functions
// take/return plain data instead.
//
// Type-only import: erased at compile time, so importing this module never
// pulls registry.ts's client-only step catalog into a test run.
import type { StepRunSummary } from "@/lib/workflows/registry";
import { scopeForInstitution, scopeForCourse } from "@/lib/workflows/fanout";
import type { WorkflowScope } from "@/lib/workflows/types";

export type CourseFanoutStatus = "ok" | "failed" | "skipped";

export interface CourseOutcome {
  courseId: string;
  courseName: string;
  status: CourseFanoutStatus;
}

export interface RunStepState {
  status: "pending" | "running" | "done" | "error" | "disabled" | "skipped";
  progress: string | null;
  summary: StepRunSummary | null;
  error: string | null;
}

export interface RunStateGroup {
  institution: string | null;
  courseId?: string;
  courseName?: string;
  courseStatus?: CourseFanoutStatus;
  steps: RunStepState[];
}

/**
 * The "Stop after this course" cancel transition. Called BETWEEN courses
 * (never mid-course - the caller only invokes this once the current course's
 * step loop has already finished): every group from `fromIndex` onward is
 * marked skipped, and any of its steps still "pending" (i.e. never started)
 * becomes "skipped" too, so the UI does not keep showing them as pending once
 * the run ends. Pure - returns new arrays/objects, mutates nothing.
 */
export function applyStopAfterCourse(
  groups: RunStateGroup[],
  fromIndex: number
): { groups: RunStateGroup[]; skipped: CourseOutcome[] } {
  const skipped: CourseOutcome[] = [];
  const nextGroups = groups.map((g, i) => {
    if (i < fromIndex) return g;
    skipped.push({ courseId: g.courseId ?? "", courseName: g.courseName ?? "", status: "skipped" });
    return {
      ...g,
      courseStatus: "skipped" as const,
      steps: g.steps.map((s) => (s.status === "pending" ? { ...s, status: "skipped" as const } : s)),
    };
  });
  return { groups: nextGroups, skipped };
}

/**
 * The first-class results-block summary line shown in the Run UI once a
 * course fan-out finishes, e.g. "Generated 5 of 7 courses' runs; 2 failed; 1
 * skipped" (the skipped clause appears only when at least one course was
 * skipped, e.g. via "Stop after this course").
 */
export function buildCourseFanoutSummary(outcomes: CourseOutcome[]): string {
  const ok = outcomes.filter((c) => c.status === "ok").length;
  const failed = outcomes.filter((c) => c.status === "failed").length;
  const skipped = outcomes.filter((c) => c.status === "skipped").length;
  return `Generated ${ok} of ${outcomes.length} courses' runs; ${failed} failed${skipped > 0 ? `; ${skipped} skipped` : ""}`;
}

/**
 * The compact course-count detail persisted in the once-per-run schedule/
 * trigger last-run write-back, e.g. "5/7 courses ok; 2 failed" (distinct
 * wording from buildCourseFanoutSummary above, which is the user-facing
 * results-block line).
 */
export function buildCourseFanoutDetail(outcomes: CourseOutcome[]): string {
  const ok = outcomes.filter((c) => c.status === "ok").length;
  const failed = outcomes.filter((c) => c.status === "failed").length;
  const skipped = outcomes.filter((c) => c.status === "skipped").length;
  return `${ok}/${outcomes.length} courses ok; ${failed} failed${skipped > 0 ? `; ${skipped} skipped` : ""}`;
}

/**
 * Counts how many groups in a course fanout run have courseStatus === "ok".
 * Used to display the course progress numerator.
 */
export function countOkCourses(groups: RunStateGroup[]): number {
  return groups.filter((grp) => grp.courseStatus === "ok").length;
}

/**
 * AC4 (defect-2 write-up): when a course's step group hands the runner more
 * than one distinct downloadable file (e.g. a Blackboard export AND a course
 * materials zip - two genuinely different artifacts, neither losslessly
 * foldable into the other), they get bundled into one outer zip so the
 * course still finishes with exactly one download. Two steps that happen to
 * build a same-named file (an unusual but not impossible coincidence - e.g.
 * two differently-configured template runs both naming their output
 * "Assignment.docx") would otherwise silently collide inside that zip, the
 * second entry overwriting the first. This returns `name` unchanged the
 * first time it is seen; on a repeat, it inserts " (2)", " (3)", etc. right
 * before the extension (matching the OS convention for a duplicate download)
 * until it finds one `used` does not already contain, adding whichever name
 * it returns to `used` before returning - the caller must reuse the SAME
 * `used` set across every file going into one zip, never a fresh one per
 * call, or this dedup does nothing.
 */
export function uniqueZipEntryName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let n = 2;
  let candidate = `${base} (${n})${ext}`;
  while (used.has(candidate)) {
    n++;
    candidate = `${base} (${n})${ext}`;
  }
  used.add(candidate);
  return candidate;
}

/** One file a step handed the runner to download on its behalf - matches
 * run-logging.ts's DownloadableFile (kept structural here, same discipline
 * as attended-fanout.ts's other shared types, so this stays a leaf module
 * with no dependency on run-logging.ts). */
export interface PendingDownloadFile {
  blob: Blob;
  fileName: string;
}

/**
 * AC1/AC2 (defect run 556b49f0's zip-log follow-up): PendingDownloadFile,
 * tagged with the SavedCourseZipRef the SAME step also published alongside
 * it (run-logging.ts's SAVED_ZIP_OUTPUT_KEY) when - and only when - the
 * step was "save-zip-to-course" (steps.course-setup.storage.ts is the only
 * step type in the registry that ever sets that key). Kept structural
 * (`{ courseId: string; fileName: string }`, not imported from
 * run-logging.ts) for the same "stay a leaf module" reason
 * PendingDownloadFile itself documents above.
 *
 * useWorkflowRun.ts's end-of-run download flush uses this tag to decide
 * WHICH entries are safe to reopen and patch with the run's complete log
 * before the single cumulative download fires: only a save-zip-to-course
 * archive is a materials bundle this app itself created and controls the
 * contents of - every OTHER DOWNLOADABLE_OUTPUT_KEY producer (blackboard-
 * export, lecture-zip, castletop-workbook, ...) hands off a deliverable
 * that may be re-uploaded elsewhere (e.g. a Common Cartridge import), so
 * splicing an extra file into ITS archive is never attempted regardless of
 * whether it happens to also be zip-shaped.
 */
export interface RunPendingDownload extends PendingDownloadFile {
  savedZipRef?: { courseId: string; fileName: string };
}

/** What useWorkflowRun.ts's flush should actually DO once its download
 * accumulator is final - "none" (nothing was handed off), "single" (exactly
 * one file - download it outright, unchanged from before this feature), or
 * "zip" (more than one - the entries to bundle, already collision-safe via
 * uniqueZipEntryName, plus the combined archive's own file name).
 *
 * AC1/AC2 (defect run 556b49f0's zip-log follow-up): the accumulator this
 * now decides over is the WHOLE RUN's pending downloads, not one course's -
 * see planCourseDownload's own doc comment below for why the call site
 * moved without this type or that function's own logic changing at all. */
export type CourseDownloadPlan =
  | { kind: "none" }
  | { kind: "single"; blob: Blob; fileName: string }
  | { kind: "zip"; entries: Array<{ name: string; blob: Blob }>; fileName: string };

/**
 * AC4 (defect-2 write-up): decide what ONE browser download (if any) should
 * be produced from everything the run's steps handed off via
 * DOWNLOADABLE_OUTPUT_KEY (run-logging.ts). Pure - it decides WHAT to
 * download, never how: building the actual zip (JSZip's async
 * generateAsync) and the DOM download mechanics both stay in
 * useWorkflowRun.ts, which is why this returns a PLAN rather than a ready
 * blob - that split is what makes the decision itself unit-testable without
 * a DOM or a real zip library.
 *
 * AC1/AC2 (defect run 556b49f0's zip-log follow-up): originally called once
 * per COURSE, right when that course's own step group finished (a real
 * Course Build run downloaded roughly eighteen separate files before AC4;
 * one bundle per course after it). Now called exactly ONCE, after the
 * WHOLE run's fan-out loop finishes, over every course's pending downloads
 * accumulated together - a single-course run still produces exactly the
 * download AC4 always did (the accumulator holds only that one course's
 * files), while a multi-course run now produces ONE cumulative download
 * instead of one per course. This function's OWN logic did not need to
 * change for that - "decide single vs. zip from a list of pending files" is
 * identical at either granularity - only the caller's accumulator moved
 * from per-course to per-run.
 *
 * `combinedFileName` is supplied by the caller (built via
 * buildWorkflowFileName, file-names.ts, so it matches every other artifact's
 * naming convention) rather than computed here, since naming needs the
 * course/workflow context this module intentionally has no dependency on.
 */
export function planCourseDownload(
  pending: PendingDownloadFile[],
  combinedFileName: string
): CourseDownloadPlan {
  if (pending.length === 0) return { kind: "none" };
  if (pending.length === 1) {
    return { kind: "single", blob: pending[0].blob, fileName: pending[0].fileName };
  }
  const used = new Set<string>();
  const entries = pending.map((file) => ({
    name: uniqueZipEntryName(file.fileName, used),
    blob: file.blob,
  }));
  return { kind: "zip", entries, fileName: combinedFileName };
}

/**
 * AC1/AC2 (defect run 556b49f0's zip-log follow-up): given a "zip" plan's
 * entries and the run's complete log text (or null when it could not be
 * fetched - useWorkflowRun.ts's fetch is best-effort), returns the entries
 * to actually write into the outer bundle - every entry unchanged, PLUS one
 * more carrying the log text, named "Run Log.txt" (or a collision-safe
 * variant via uniqueZipEntryName, reusing the SAME collision-avoidance
 * every other entry already went through - a real generated file named
 * exactly "Run Log.txt" is exceedingly unlikely, but never silently
 * overwritten either way). This guarantees a multi-file cumulative download
 * always carries a TOP-LEVEL, immediately discoverable copy of the complete
 * log regardless of which (if any) of its individual entries happens to be
 * a save-zip-to-course archive that may ALSO carry its own patched copy
 * nested inside (see useWorkflowRun.ts's patchEmbeddedRunLog). Returns
 * `entries` unchanged when there is no log text to add.
 *
 * Pure - the caller still builds the actual Blob (`new Blob([logText])`)
 * and the real zip, matching the same "decide, don't do" split
 * planCourseDownload's own doc comment describes.
 */
export function withTopLevelRunLog(
  entries: Array<{ name: string; blob: Blob }>,
  logText: string | null
): Array<{ name: string; blob: Blob }> {
  if (logText === null) return entries;
  const used = new Set(entries.map((e) => e.name));
  const name = uniqueZipEntryName("Run Log.txt", used);
  return [...entries, { name, blob: new Blob([logText], { type: "text/plain" }) }];
}

/**
 * Build the fan-out entity list for a composed (institution "*" + course
 * multiplicity) run: one entity per resolved course tile, carrying the
 * tile's own institution (see fanout.ts's design note - a composed fan-out
 * collapses to a single course-dimension fan-out with institution derived
 * per tile, not a nested institution x course product). Pure - no I/O - so
 * the composed-entity shape is unit-testable without a DOM environment.
 */
export function buildComposedFanoutEntities(
  courses: Array<{ id: string; name: string; institution: string | null }>
): Array<{ institution: string | null; courseId: string; courseName: string }> {
  return courses.map((course) => ({
    institution: course.institution,
    courseId: course.id,
    courseName: course.name,
  }));
}

/**
 * Pin a composed fan-out group's scope to one course tile's own id AND
 * institution: scopeForInstitution(scopeForCourse(scope, tile.id), tile's
 * institution ?? ""). An institution-less tile pins to "" (unset) rather
 * than leaving the original "*" in place, so its scoped institution inputs
 * resolve as unset - same as a single run on such a tile.
 */
export function pinComposedGroupScope(
  scope: WorkflowScope,
  courseId: string,
  institution: string | null
): WorkflowScope {
  return scopeForInstitution(scopeForCourse(scope, courseId), institution ?? "");
}
