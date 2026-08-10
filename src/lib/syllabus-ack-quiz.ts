// Pure logic for the "Syllabus Acknowledgement" quiz button (Button 1 of
// docs/lms-tab-syllabus-buttons-acceptance-criteria.md). Due-date derivation
// and the idempotency title check both need to be unit-testable without
// touching Canvas, so they live here rather than inline in the server action
// - the same split steps.course-setup.materials.ts does NOT make (its
// due-date math and title choice are inline in the step, which is exactly
// why that step's due-date logic has never been unit-tested; see
// docs/REGRESSION.md #248 checks 3 and 8). Pure - no I/O.
import { parseCourseDate, addDays } from "./course-calendar-dates";
import { normalizedTitleEquals } from "./normalized-title-match";

/**
 * Title used for both the created quiz and its own idempotency pre-check (AC
 * B1-5) - a single constant so the create call and the dedup check can never
 * drift apart from each other.
 */
export const SYLLABUS_ACK_QUIZ_TITLE = "Syllabus Acknowledgement";

/**
 * Due date = course row startDate + 3 days at 23:59 LOCAL, converted to UTC
 * only at the very end via toISOString (AC B1-2). Uses parseCourseDate +
 * addDays - never Date.parse or a UTC getter/setter mid-way (this repo's
 * committed local-wall-clock convention, course-calendar-dates.ts:24-31 and
 * docs/REGRESSION.md #248 check 7). Returns an error rather than a
 * due-date-less quiz when the course row has no start date (AC B1-3) -
 * unlike steps.course-setup.materials.ts's own due-date derivation
 * (:197-210), which silently falls back to no deadline; this button's whole
 * premise is "due 3 days after start," so silently dropping that requirement
 * would contradict what the instructor asked for.
 */
export function computeSyllabusAckDueAt(
  startDate: string | null | undefined
): { dueAt: string } | { error: string } {
  const start = parseCourseDate(startDate);
  if (!start) {
    return {
      error:
        "This course has no start date, so the Syllabus Acknowledgement quiz's due date cannot be set. Add a start date to the course row, then try again.",
    };
  }
  const due = addDays(start, 3);
  due.setHours(23, 59, 0, 0);
  return { dueAt: due.toISOString() };
}

/** Minimal shape needed to check an existing Canvas quiz's title - matches
 * the "id"/"title" fields of BulkItem (src/lib/canvas-modules/types.ts)
 * without importing the full type into this pure module. */
export interface TitledItem {
  id: string;
  title: string;
}

/**
 * Find an already-created acknowledgement quiz among the course's existing
 * quizzes (as returned by listBulkItemsAction), matched
 * case/whitespace-insensitively (AC B1-5) so "syllabus acknowledgement " or
 * "SYLLABUS ACKNOWLEDGEMENT" still counts as the same quiz. Undefined when
 * none exists.
 */
export function findExistingAckQuiz<T extends TitledItem>(items: T[]): T | undefined {
  return items.find((item) => normalizedTitleEquals(item.title, SYLLABUS_ACK_QUIZ_TITLE));
}
