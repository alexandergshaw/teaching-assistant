// Wave 2 of the recording-grader UX overhaul
// (docs/grading-recording-ux-overhaul-scope.md, Move B): the rubric's
// persistence and restore decisions, moved out of GradingRecordingPanel.tsx
// (which sits at the 1000-line ceiling) into a plain .ts leaf so vitest can
// reach them (no component is rendered by any test here).
//
// Two stores, both through src/lib/grade/rubric-memory.ts:
//  - STORAGE_KEY_RUBRIC: one entry per course+assessment (A39 wave 3b, path F).
//  - STORAGE_KEY_RUBRIC_COURSE: one entry per COURSE, the most recently used
//    rubric for that course. A repeat discussion under a new assessment label
//    starts from it instead of an empty field.
//
// Resolution order on restore: this exact course+assessment entry, then this
// course's own default, then (existing behaviour) the newest entry anywhere,
// labelled with where it came from. A course default saved for a DIFFERENT
// course is never used: loadRubricMemory falls back to the newest entry across
// every scope, so the scope it reports is checked against the requested one.
//
// Bound consts, scanned by grading-rows.test.ts's exact-set persisted-key
// canary.
import {
  describeRubricOrigin,
  loadRubricMemory,
  saveRubricMemory,
  type LoadedRubricMemory,
} from "@/lib/grade/rubric-memory";

export const STORAGE_KEY_RUBRIC = "ta-rec-grade-rubric";
export const STORAGE_KEY_RUBRIC_COURSE = "ta-rec-grade-rubric-course";

/** Scope key for the per-assessment entry: empty until BOTH the course and the
 *  assessment label are known, so an instructor who has picked neither cannot
 *  restore a rubric that looks like it belongs to whatever they pick next. */
export function recordingRubricScope(courseName: string, assessmentIdValue: string): string {
  return courseName.trim() && assessmentIdValue.trim() ? `recording:${courseName}|${assessmentIdValue}` : "";
}

/** Scope key for the per-course default: empty until a course is chosen. */
export function courseDefaultRubricScope(courseName: string): string {
  const name = courseName.trim();
  return name ? `course-default:${name}` : "";
}

/**
 * True when a restore may write into the field: it is empty, or it still holds
 * exactly what the last restore (or a confirmed modal submit) put there. A
 * rubric the instructor has typed or edited is never replaced.
 */
export function isRubricFieldUntouched(current: string, lastRestored: string | null): boolean {
  return current === "" || current === lastRestored;
}

export interface RubricRestoreChoice {
  loaded: LoadedRubricMemory;
  /** The scope the origin label is described against. */
  requestedScope: string;
}

/**
 * Pick which stored rubric to restore from the two raw lookups. Pure: the
 * caller does the storage reads.
 */
export function chooseRubricRestore(args: {
  scope: string;
  courseScope: string;
  assessmentHit: LoadedRubricMemory | null;
  courseHit: LoadedRubricMemory | null;
}): RubricRestoreChoice | null {
  const { scope, courseScope, assessmentHit, courseHit } = args;
  if (assessmentHit && scope && assessmentHit.scope === scope) {
    return { loaded: assessmentHit, requestedScope: scope };
  }
  if (courseHit && courseScope && courseHit.scope === courseScope) {
    return { loaded: courseHit, requestedScope: courseScope };
  }
  if (assessmentHit && scope) return { loaded: assessmentHit, requestedScope: scope };
  return null;
}

export interface RubricRestore {
  rubric: string;
  origin: string;
}

/** Read both stores and resolve; null when nothing applies yet. */
export function restoreRubric(courseName: string, assessmentIdValue: string): RubricRestore | null {
  const scope = recordingRubricScope(courseName, assessmentIdValue);
  const courseScope = courseDefaultRubricScope(courseName);
  const assessmentHit = scope ? loadRubricMemory(STORAGE_KEY_RUBRIC, scope) : null;
  const courseHit = courseScope ? loadRubricMemory(STORAGE_KEY_RUBRIC_COURSE, courseScope) : null;
  const choice = chooseRubricRestore({ scope, courseScope, assessmentHit, courseHit });
  if (!choice) return null;
  return { rubric: choice.loaded.entry.rubric, origin: describeRubricOrigin(choice.loaded, choice.requestedScope) };
}

/**
 * Save `text` under this course+assessment and as this course's default.
 * Blank text is not saved anywhere, so clearing the field cannot erase a good
 * default. Either scope may be empty, in which case that half is skipped.
 */
export function persistRubric(courseName: string, assessmentIdValue: string, text: string): void {
  if (!text.trim()) return;
  const scope = recordingRubricScope(courseName, assessmentIdValue);
  if (scope) saveRubricMemory(STORAGE_KEY_RUBRIC, scope, { rubric: text });
  const courseScope = courseDefaultRubricScope(courseName);
  if (courseScope) saveRubricMemory(STORAGE_KEY_RUBRIC_COURSE, courseScope, { rubric: text });
}
