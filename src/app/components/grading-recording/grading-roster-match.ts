// Grading from a screen recording - roster matching (R3a).
// docs/grading-via-recording-acceptance-criteria.md section 3.
//
// Nothing in this repo validated a vision-read name against a roster before
// this file. `src/lib/repo-student-bindings.ts` is the READ precedent (not
// imported - it classifies REPO NAMES against a roster via a completely
// different derivation, repoSlug inversion, that has no bearing on a name
// read off a screen); the part worth copying from it is its shape, not its
// code: three real outcomes (matched / ambiguous / unmatched), because
// collapsing "found several" into "found none" hides exactly the row an
// instructor most needs to look at. This module adds a fourth state,
// "no-roster" (grading-row.ts's own doc comment has the full reasoning for
// why that is NOT the same thing as "unmatched").
//
// Pure and dependency-free (only imports the GradingRowNameMatch type),
// same discipline as grading-row.ts itself - this is a plain leaf with no
// I/O, so both a future client caller and a future "use server" action can
// import it.
//
// CONTRACT: `rosterNames` must be one entry per DISTINCT roster student, not
// a raw, possibly-duplicated concatenation of every roster source. Two
// different students who really do share an identical name produce
// "ambiguous" here on purpose (matchNameAgainstRoster has no way to tell
// "the same person listed twice" from "two people who share a name" - both
// look identical as plain strings), so a caller that merges course.roster
// text with studentRepos or a Canvas roster fetch must de-duplicate its
// combined list before calling this function, or a normal overlapping
// roster would misreport every student as ambiguous.

import type { GradingRowNameMatch } from "./grading-row";

export interface RosterNameMatchResult {
  nameMatch: GradingRowNameMatch;
  /** Every roster entry (verbatim, trimmed) that matched, in roster order.
   *  Exactly one for "matched", two or more for "ambiguous", empty for
   *  "unmatched"/"no-roster". */
  rosterCandidates: readonly string[];
}

/**
 * Canonicalizes a name for COMPARISON ONLY - never assigned back to
 * `studentName` (grading-row.ts's own rule: the read name is never
 * overwritten with a roster name). Forgiving about the three things R3a
 * asks for:
 *
 *   - case: lowercased.
 *   - extra whitespace: trimmed, and every internal run of whitespace
 *     collapsed to one space.
 *   - "Last, First" ordering: a name containing a comma is read as
 *     "Last, First [Middle...]" and reordered to "First [Middle...] Last"
 *     - the same token order a plain "First Last" name already has - so
 *     both spellings of the same name canonicalize identically. This is
 *     the exact shape `parseRosterLines` (src/lib/workflows/registry-
 *     helpers.ts) warns a comma can appear in ("commas in names like
 *     'Last, First' never masquerade as usernames"), and Canvas's own
 *     sortable_name (CanvasRosterEntry.sortableName) is spelled this way
 *     too.
 *
 * Deliberately does NOT split on whitespace and compare token sets
 * (order-independent) - that would let "Maria Garcia" match a roster
 * candidate "Garcia Maria" (nobody writes names that way) and would also
 * let a single-token read name pass a subset check against a multi-token
 * roster name, which is exactly the "match on a first name alone" failure
 * mode R3a forbids. Reordering ONLY around an explicit comma keeps this
 * strict: two full names must canonicalize to the literal same string of
 * tokens, in the same order, to be considered the same person.
 */
export function canonicalizeNameForMatch(name: string): string {
  const collapsed = name.trim().replace(/\s+/g, " ");
  if (!collapsed) return "";

  const commaIdx = collapsed.indexOf(",");
  if (commaIdx === -1) {
    return collapsed.toLowerCase();
  }

  const last = collapsed.slice(0, commaIdx).trim();
  const rest = collapsed.slice(commaIdx + 1).trim().replace(/\s+/g, " ");
  if (!last || !rest) {
    // A stray/misplaced comma ("Maria Garcia,", ", Maria Garcia") - fall
    // back to treating the comma as ordinary punctuation rather than
    // guessing which side is the surname.
    return collapsed.replace(/,/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  }
  return `${rest} ${last}`.toLowerCase();
}

/**
 * Checks a name read off the screen against the course roster (R3a).
 *
 * `rosterNames === null/undefined`, or an empty array, both mean "no roster
 * was available to check against" and report "no-roster" - NEVER
 * "unmatched" (grading-row.ts's own doc comment on GradingRowNameMatch: "an
 * absent roster is our gap, not the student's"). An empty array is treated
 * the same as null/undefined deliberately: a roster tile that exists but
 * parsed to zero usable names leaves exactly as little to check against as
 * no roster at all, and the instructor's gap is the same either way.
 *
 * Matching is EXACT after canonicalization (case/whitespace/"Last, First"
 * folded away, per canonicalizeNameForMatch above) - never a fuzzy or
 * partial match, and never a match on a single name token alone. A blank
 * read name (defensive only - R3's extraction-time rule already skips a
 * submission whose name could not be read, so this should not be reachable
 * in practice) canonicalizes to "" and matches nothing, reporting
 * "unmatched" rather than a spurious "matched" against some blank roster
 * entry.
 */
export function matchNameAgainstRoster(
  readName: string,
  rosterNames: readonly string[] | null | undefined
): RosterNameMatchResult {
  if (!rosterNames || rosterNames.length === 0) {
    return { nameMatch: "no-roster", rosterCandidates: [] };
  }

  const target = canonicalizeNameForMatch(readName);
  if (!target) {
    return { nameMatch: "unmatched", rosterCandidates: [] };
  }

  const matches = rosterNames
    .map((candidate) => ({ display: candidate.trim(), canon: canonicalizeNameForMatch(candidate) }))
    .filter((c) => c.canon !== "" && c.canon === target)
    .map((c) => c.display);

  if (matches.length === 0) return { nameMatch: "unmatched", rosterCandidates: [] };
  if (matches.length === 1) return { nameMatch: "matched", rosterCandidates: matches };
  return { nameMatch: "ambiguous", rosterCandidates: matches };
}
