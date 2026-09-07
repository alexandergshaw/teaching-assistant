"use client";

// localStorage persistence for the Course Intel view's controls - the
// standing project rule that every new textbox/select/checkbox persists
// across reload under a ta- key. Modeled directly on
// src/app/components/repo-grades/repoGradesUiState.ts: a plain top-level key
// for the course picker (D13 of docs/course-student-intelligence-acceptance-
// criteria.md - "Persist the course_hub uuid under ta-course-intel-course -
// never a Canvas URL, never the Canvas numeric id"), and a per-COURSE blob
// for the draft question, the same shape repoGradesUiState.ts's
// loadFolderSelection/persistFolderSelection use for that view's per-course
// folder choice - one course's half-typed question means nothing under
// another course, so switching courses must never show course A's draft
// under course B's picker.
//
// Every read/write here is guarded by `typeof window` so this module is safe
// to import from server-rendered code paths, matching every other UI-state
// module in this codebase.

const COURSE_KEY = "ta-course-intel-course";
const QUESTION_KEY = "ta-course-intel-question";

/** The course_hub row id (a uuid) the picker last had selected - "" when
 * nothing has ever been chosen. NEVER a Canvas URL and NEVER the Canvas
 * numeric course id (D13/S18 of the acceptance-criteria doc): those two ids
 * are easy to cross precisely because this derivation is copy-pasted per
 * feature rather than centralised, so this module only ever touches the
 * course_hub uuid - useCourseIntel.ts derives the Canvas numeric id fresh,
 * on every render, via parseCanvasCourseId(course.canvasUrl), and never
 * stores it here or anywhere else. */
export function loadCourseIntelCourseId(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(COURSE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function persistCourseIntelCourseId(courseId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COURSE_KEY, courseId);
  } catch {
    // localStorage can throw (private browsing, quota) - losing persistence
    // for one change is acceptable, crashing the tab is not. Matches
    // repoGradesUiState.ts's persistRepoGradesUiState.
  }
}

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
    // best-effort persistence only, matching persistCourseIntelCourseId above.
  }
}
