// Shared guard for the Canvas-only LMS steps (lms-wipe, lms-modules,
// lms-populate, lms-assignments - steps.lms-modules.ts and
// steps.assignments-creation.ts). Those steps call Canvas-only server
// actions (listCourseContentAction, createModuleAction, ...) that ultimately
// go through canvas-core.ts's resolveCourse, which THROWS when the course
// URL is not Canvas-shaped ("Could not read a course from that URL. Expected
// a link like .../courses/123.") - a real Blackboard course's URL (e.g.
// .../ultra/courses/_33114_1/outline) always hits this. Both run loops
// (server-runner.ts, useWorkflowRun.ts) add a thrown step to `failedSteps`,
// and any dependent step whose binding reads that step's output THROWS
// during its own input resolution ("Skipped - depends on step N, which
// failed") - see each loop's `if (failedSteps.has(binding.stepIndex))`
// branch. That is how one Canvas-only step throwing on a Blackboard course
// cascades into losing every dependent's LOCAL deliverables too, not just
// the LMS upload.
//
// The fix is for each Canvas-only step to detect a non-Canvas LMS itself and
// return a normal, successful StepRunResult with defined (non-undefined)
// empty outputs - the exact shape these steps already use for their
// pre-existing "no LMS course selected" skip. A step that returns normally
// is never added to failedSteps, and a defined output (e.g. `modules: []`)
// resolves cleanly for any dependent bound to it - so the skip does not
// cascade, without needing passThroughOnFailure (registry-helpers.ts) or any
// other error-recovery mechanism: there is no error to recover from, because
// the step never throws in the first place.
//
// LMS detection reuses the course tile's own `lms` field - the SAME
// authoritative field load-course-tile (steps.course-setup.tiles.ts)
// already surfaces in its "LMS: ..." summary line, and blackboard-export
// (steps.lms-export.ts's `tileLms`) already reads to choose Blackboard vs.
// Canvas cartridge packaging - not a second notion of "which LMS is this".
// The institution-field fallback below (a tile with no LMS of its own
// inherits the institution's) mirrors that same file's fallback exactly.

import { listCourseHubAction } from "@/app/actions";
import { courseLmsLabel } from "@/lib/course-lms-options";
import type { Course } from "@/lib/supabase/courses";
import type { StepInputSpec, StepRunHelpers } from "@/lib/workflows/registry-helpers";

/** Optional input each Canvas-only step gains so it can look up its course
 * tile's `lms` field. Deliberately not bound in any preset (course-setup.ts
 * is out of scope for this fix) - an unbound input of a scope-coverable type
 * is still filled automatically by the workflow scope when the run is
 * course-scoped (server-runner.ts / useWorkflowRun.ts both fill an unbound
 * input via `scopeCoversType`/`applyWorkflowScope` before falling through to
 * "unset"), which every course-fanout run (e.g. Course Build) is. On a
 * workflow that is not course-scoped this resolves to "" and the step
 * behaves exactly as it did before this guard existed. */
export const HUB_COURSE_LMS_INPUT: StepInputSpec = {
  key: "hubCourse",
  label: "Course tile",
  type: "hubCourse",
  required: false,
  help: "Optional - lets this step detect a non-Canvas LMS on the tile and skip cleanly instead of erroring against a Canvas-only API. Filled automatically on a course-scoped run.",
};

/**
 * Resolve an already-loaded tile's effective `lms` value
 * ("canvas" | "blackboard" | "brightspace" | ... | ""), falling back to the
 * institution's LMS field when the tile has none of its own - the same
 * fallback blackboard-export (steps.lms-export.ts) applies, reused here
 * rather than re-derived a second time.
 */
export async function resolveLmsFromTile(
  tile: Pick<Course, "lms" | "institution"> | undefined,
  helpers: Pick<StepRunHelpers, "getInstitutionFields">
): Promise<string> {
  let lms = (tile?.lms ?? "").trim().toLowerCase();

  if (!lms && tile?.institution && helpers.getInstitutionFields) {
    const fields = await helpers.getInstitutionFields(tile.institution).catch(() => []);
    lms = (fields.find((f) => f.id === "lmsUrl")?.lms ?? "").trim().toLowerCase();
  }

  return lms;
}

/**
 * Look up a course tile by id (HUB_COURSE_LMS_INPUT's resolved value) and
 * resolve its effective LMS. Fails OPEN ("" - treated as Canvas by
 * isCanvasLms below) on a blank id, a lookup error, or an unknown id: this
 * guard must never block a working Canvas run because ITS OWN lookup failed,
 * only because the tile positively recorded a non-Canvas LMS.
 */
export async function resolveTileLms(
  hubCourseId: string,
  helpers: Pick<StepRunHelpers, "getInstitutionFields">
): Promise<string> {
  const id = hubCourseId.trim();
  if (!id) return "";

  const list = await listCourseHubAction().catch(() => null);
  if (!list || "error" in list) return "";

  const tile = list.courses.find((c) => c.id === id);
  if (!tile) return "";

  return resolveLmsFromTile(tile, helpers);
}

/**
 * True when `lms` is empty (unset - the state of every tile before this
 * guard existed, and of any tile never assigned an LMS; must keep behaving
 * exactly as it always did, i.e. proceed against Canvas) or explicitly
 * "canvas". False for any other recorded value (blackboard, brightspace,
 * moodle, ...).
 */
export function isCanvasLms(lms: string): boolean {
  const trimmed = lms.trim().toLowerCase();
  return trimmed === "" || trimmed === "canvas";
}

/** Display label for a non-Canvas skip summary ("Blackboard",
 * "Brightspace", ...) - reuses course-lms-options.ts's single label mapping
 * instead of restating it. Falls back to the raw value for an LMS not in
 * that list, same fallback courseLmsLabel itself uses. */
export function lmsDisplayLabel(lms: string): string {
  return courseLmsLabel(lms) || lms;
}

/**
 * Standard, explanatory skip text for a Canvas-only LMS step reached by a
 * non-Canvas course - reused by lms-wipe/lms-modules/lms-populate/
 * lms-assignments so an instructor reading any of their summaries (or the
 * run report) sees identical, unambiguous wording rather than four
 * independently-worded near-misses.
 */
export function canvasOnlySkipText(lms: string): string {
  return `Skipped - this course is on ${lmsDisplayLabel(lms)}; this step targets Canvas.`;
}
