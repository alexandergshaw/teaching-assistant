/**
 * Pure helpers behind the messaging modal (LIVE-LMS-STUDENT-MESSAGING W3):
 * mapping a table row onto the L6 token values, and inserting a variable token
 * into the body at the caret. No React, no storage.
 */

import type { EnrollmentRow } from "./enrollment-aggregator";
import type { StudentTokenValues, TemplateToken } from "./template-substitution";

/** A row's OWN live values, in the shape renderForStudents binds per student. */
export function rowToTokenValues(row: EnrollmentRow): StudentTokenValues {
  return {
    firstName: row.firstName || null,
    lastName: row.lastName || null,
    course: row.course || null,
    section: row.section || null,
    missingCount: row.missingCount,
    grade: row.grade,
  };
}

/** The literal text a token is inserted as. */
export function tokenText(token: TemplateToken): string {
  return `{{${token}}}`;
}

/**
 * Inserts `insert` into `text`, replacing the [start, end) selection (both
 * clamped into range; start/end swapped if reversed). Returns the new text and
 * the caret position just after the inserted text.
 */
export function insertAtSelection(
  text: string,
  insert: string,
  start: number,
  end: number
): { text: string; caret: number } {
  const clamp = (n: number) => (Number.isFinite(n) ? Math.min(Math.max(0, Math.floor(n)), text.length) : text.length);
  const a = clamp(start);
  const b = clamp(end);
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  return { text: text.slice(0, from) + insert + text.slice(to), caret: from + insert.length };
}
