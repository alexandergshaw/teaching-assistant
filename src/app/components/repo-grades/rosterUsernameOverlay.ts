// Repo Grades view - bridging the Courses tab's hand-typed roster into the
// binder's data.
//
// The bug this file fixes: an instructor can type thirty "Student Name |
// github-username" lines into the Roster tile (RosterCell.tsx) on the
// Courses tab. That tile saves ONLY course.roster, a plain text field
// (rowsToRoster, courses-tab-helpers.ts). The Repo Grades binder
// (suggestRepoStudentBindings, repo-student-bindings.ts) never reads
// course.roster at all - it matches a repo's derived handle against
// stored[].username, where `stored` is course.studentRepos. The only writer
// that ever puts a real username into studentRepos is buildRosterUpdate
// (workflows/roster-merge.ts), and that only runs on the live-Canvas
// submissions path. So an instructor who filled in the roster table by hand
// still sees every repo as unbound - their work is invisible to the binder.
// This module folds the roster text's name/username pairs into studentRepos
// rows so tier 1 (tierStoredUsername) can actually see them.
//
// Pure, no I/O, no React, no clock: vitest here is node-env and collects
// only src/**/*.test.ts, so nothing rendered is ever exercised by a test -
// the matching/merging decisions have to live here, with the caller only
// calling this and folding the result into a course update.

import { rosterToRows } from "@/lib/courses-tab-helpers";
import type { CourseStudentRepo } from "@/lib/supabase/courses";

export interface RosterUsernameOverlayResult {
  /** studentRepos with roster usernames folded in. Never mutates the input. */
  rows: CourseStudentRepo[];
  /** Roster students whose username filled a BLANK on an existing row. */
  matched: number;
  /** Roster students who had no existing row and gained a new one. */
  added: number;
  /** Of `matched` + `added`, how many carry no numeric canvasUserId - these
   * can identify a repo's owner but can never be posted to Canvas. */
  withoutCanvasId: number;
  /** Roster rows whose username was ignored because the existing row already
   * had a different one, as "Student: kept <existing>, roster said <roster>". */
  conflicts: string[];
}

/** Trim, collapse internal whitespace, lowercase. The baseline every name
 * comparison in this module goes through - never a substring match. */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Canonicalizes a name so "Smith, John" (the Roster tile's own placeholder
 * spelling) and "John Smith" (a Canvas-derived studentRepos.student spelling)
 * produce the SAME key. Splits on the FIRST comma only, swaps the two sides,
 * and re-joins - an explicit transform, not a fuzzy match. A name with no
 * comma is assumed to already be in "First Last" order and passes through
 * normalizeName unchanged, which is exactly the key a comma-form name
 * produces once inverted, so both spellings collide on purpose.
 */
// Exported (2026-09-01, roster editor UX pass): the Roster column's
// per-student provisioning panel (StudentRepoRoster.tsx) needs this SAME
// canonicalization to look up a username that lives on `studentRepos` but
// not on the hand-typed roster text - see that file's own comment on why.
// This is the only edit made to this file for that feature; the overlay
// function itself (roster -> studentRepos direction) is unchanged.
export function canonicalNameKey(name: string): string {
  const normalized = normalizeName(name);
  const commaIndex = normalized.indexOf(",");
  if (commaIndex === -1) return normalized;
  const last = normalized.slice(0, commaIndex).trim();
  const first = normalized.slice(commaIndex + 1).trim();
  // A malformed comma (nothing on one side) can't be inverted meaningfully -
  // fall back to the plain normalized form rather than guessing.
  if (!last || !first) return normalized;
  return `${first} ${last}`;
}

/** postCanvasGrades needs a numeric Canvas user id (same rule
 * repo-student-bindings.ts applies at rule a: /^\d+$/, not just "present"). */
function hasNumericCanvasId(id: string | null | undefined): boolean {
  return typeof id === "string" && /^\d+$/.test(id.trim());
}

/**
 * Folds a roster's hand-typed "Name | username" pairs into studentRepos rows
 * so suggestRepoStudentBindings' tier 1 (tierStoredUsername) can see them.
 * See this file's header for the bug this bridges. Pure - never mutates
 * either argument; always returns a new array of new row objects.
 */
export function overlayRosterUsernames(
  studentRepos: readonly CourseStudentRepo[],
  rosterText: string | null
): RosterUsernameOverlayResult {
  const rows = studentRepos.map((row) => ({ ...row }));
  const conflicts: string[] = [];
  let matched = 0;
  let added = 0;
  let withoutCanvasId = 0;

  // Index existing rows by canonical name key BEFORE any mutation or
  // addition, so a name that matches more than one EXISTING row is detected
  // against the original set (rule: an ambiguous name changes nothing for
  // that student), and so a row added later in this same pass can never
  // accidentally satisfy a still-unprocessed roster line's lookup.
  const byKey = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = canonicalNameKey(row.student);
    // A blank student name (e.g. an org-scan placeholder row) is not a
    // student anyone's roster line should ever be able to match.
    if (!key) return;
    const existing = byKey.get(key);
    if (existing) existing.push(index);
    else byKey.set(key, [index]);
  });

  for (const { student, username } of rosterToRows(rosterText ?? "")) {
    const trimmedStudent = student.trim();
    const trimmedUsername = username.trim();
    // A roster row with no username is a student with no GitHub account
    // recorded, not an error - it contributes nothing.
    if (!trimmedStudent || !trimmedUsername) continue;

    const indices = byKey.get(canonicalNameKey(trimmedStudent)) ?? [];

    if (indices.length > 1) {
      // An ambiguous name is exactly the case where a wrong guess sends a
      // grade to the wrong person - change nothing, just report it.
      conflicts.push(
        `${trimmedStudent}: ambiguous match (${indices.length} existing rows share this name) - left unchanged`
      );
      continue;
    }

    if (indices.length === 1) {
      const row = rows[indices[0]];
      const existingUsername = (row.username ?? "").trim();
      if (!existingUsername) {
        row.username = trimmedUsername;
        matched += 1;
        if (!hasNumericCanvasId(row.canvasUserId)) withoutCanvasId += 1;
      } else if (existingUsername.toLowerCase() !== trimmedUsername.toLowerCase()) {
        // A username already on the row came from the student's own Canvas
        // submission (buildRosterUpdate) - more authoritative than a
        // hand-typed roster line. Keep it, but surface the disagreement.
        conflicts.push(`${row.student}: kept ${existingUsername}, roster said ${trimmedUsername}`);
      }
      continue;
    }

    // No existing row for this student - add one. `repo: ""` is deliberate
    // and matches buildRosterUpdate's own new rows: it keeps the binder's
    // full-repo-name rule from firing for it, and exists purely to feed
    // tier 1 (tierStoredUsername).
    rows.push({ student: trimmedStudent, canvasUserId: null, repo: "", username: trimmedUsername, email: null });
    added += 1;
    // A newly-added row's canvasUserId is always null - always counts.
    withoutCanvasId += 1;
  }

  return { rows, matched, added, withoutCanvasId, conflicts };
}

/**
 * True when the roster text carries at least one usable name+username pair -
 * lets a caller decide whether to offer the course-table source at all.
 */
export function rosterHasUsernames(rosterText: string | null): boolean {
  if (!rosterText) return false;
  return rosterToRows(rosterText).some((row) => row.student.trim() && row.username.trim());
}
