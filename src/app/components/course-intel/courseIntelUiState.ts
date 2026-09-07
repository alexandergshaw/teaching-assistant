"use client";

// localStorage persistence for the Course Intel view's controls - the
// standing project rule that every new textbox/select/checkbox persists
// across reload under a ta- key.
//
// THE COURSE PICKER IS GONE (D24), and with it `ta-course-intel-course`. The
// tab is one textbox: the question itself names the course, or names none and
// is answered across all of them, so there is no selection left to persist.
// The key and its load/persist pair were removed rather than left dormant -
// dead persistence reads as a control that still exists.
//
// The draft question keeps its per-scope blob shape, which now holds exactly
// one entry. That is deliberately not simplified to a flat key: the shape
// change would orphan any draft already stored in a reader's browser, to save
// nothing. useCourseIntel.ts writes it under a single constant scope.
//
// Every read/write here is guarded by `typeof window` so this module is safe
// to import from server-rendered code paths, matching every other UI-state
// module in this codebase.

const QUESTION_KEY = "ta-course-intel-question";

/** Reads the question blob, tolerating anything that is not the shape this
 * module writes - a hand-edited value, a half-written entry, or a blob from an
 * older version. A malformed store yields an empty draft, never a throw. */
function parseQuestionByCourse(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, string> = {};
    for (const [courseId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") result[courseId] = value;
    }
    return result;
  } catch {
    return {};
  }
}

/** Reads `courseId`'s persisted draft question - "" when nothing is stored
 * yet, when the JSON is malformed, or when `courseId` is blank. Mirrors
 * repoGradesUiState.ts's loadFolderSelection: a per-course value stored in
 * one JSON blob keyed by course id, never a second top-level key per
 * course. */
export function loadCourseIntelQuestion(courseId: string): string {
  if (typeof window === "undefined" || !courseId) return "";
  const byCourse = parseQuestionByCourse(localStorage.getItem(QUESTION_KEY));
  return byCourse[courseId] ?? "";
}

/** Writes `courseId`'s draft question, preserving every OTHER course's draft
 * untouched. A blank courseId is a no-op, matching every other per-course
 * pair in this codebase's uiState modules. */
export function persistCourseIntelQuestion(courseId: string, question: string): void {
  if (typeof window === "undefined" || !courseId) return;
  try {
    const byCourse = parseQuestionByCourse(localStorage.getItem(QUESTION_KEY));
    byCourse[courseId] = question;
    localStorage.setItem(QUESTION_KEY, JSON.stringify(byCourse));
  } catch {
    // best-effort persistence only: localStorage can throw (private
    // browsing, quota) and losing one draft is acceptable where crashing
    // the tab is not.
  }
}
