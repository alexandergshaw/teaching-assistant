/**
 * Pure recipient-count gate for a course-wide message. A send needs at least
 * two recipients (one student is a direct message, not a course message) and
 * at most MAX_COURSE_RECIPIENTS.
 */

export const MIN_COURSE_RECIPIENTS = 2;
export const MAX_COURSE_RECIPIENTS = 100;

export type SendDecision =
  | { send: true }
  | { send: false; kind: "one-student" | "over-max"; count: number };

export function classifyRecipientCount(count: number): SendDecision {
  if (count < MIN_COURSE_RECIPIENTS) {
    return { send: false, kind: "one-student", count };
  }
  if (count > MAX_COURSE_RECIPIENTS) {
    return { send: false, kind: "over-max", count };
  }
  return { send: true };
}
