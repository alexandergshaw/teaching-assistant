// Pure decision logic for the accommodations/extensions feature (backlog
// N4). ZERO React/DOM imports - no "react", no "next/", no window/document
// reference anywhere in this file - so it is the one part of this feature
// any test in this repo can actually execute (vitest here is node-env and
// renders no component; see docs/loop/this-repo.md).
//
// This file has NO knowledge of Supabase, Canvas, or any I/O. It exists so
// the "is a scope fully selected" and "is this entry valid to save" rules
// are testable independent of a data-access module, an action, or a
// component - the same discipline src/lib/institutions.ts and similar leaves
// already follow in this repo.

export interface AccommodationsScope {
  institution: string;
  courseId: string;
  assignmentId: string;
}

/**
 * True only when all three scope levels are non-empty strings. Reads NOTHING
 * beyond its three arguments - no page, router, or global state - so a
 * caller cannot accidentally derive "complete" from the current route
 * rather than from an explicit selection. That is the mechanical form of
 * this feature's no-inference rule: the accommodations panel must never
 * silently show a list for a scope the owner did not explicitly pick.
 */
export function isAccommodationsSelectionComplete(
  institution: string | null,
  courseId: string | null,
  assignmentId: string | null
): boolean {
  return Boolean(institution && institution.trim()) && Boolean(courseId && courseId.trim()) && Boolean(assignmentId && assignmentId.trim());
}

export type ValidateAccommodationEntryResult =
  | { ok: true }
  | { ok: false; reason: "missing-student" };

/**
 * The one validation rule for the add-entry form: canvasUserId is required
 * (the Canvas student user id - this is the ONLY per-student identifier this
 * feature ever writes to the database; a student's name is never stored).
 * note is optional - an accommodation entry with no note yet ("flagged,
 * details pending") is a valid intermediate state.
 */
export function validateAccommodationEntry(input: {
  canvasUserId: string;
  note: string;
}): ValidateAccommodationEntryResult {
  if (!input.canvasUserId || !input.canvasUserId.trim()) {
    return { ok: false, reason: "missing-student" };
  }
  return { ok: true };
}
