// Repo Grades view - AC2 (docs/repo-grades-view-acceptance-criteria.md, items
// 5-11): binding a student repo to the roster student it belongs to. This is
// the correctness core of the whole feature - a wrong binding posts a grade
// to the wrong student's Canvas gradebook, and postCanvasGrades
// (src/lib/canvas/grades.ts:22) has no undo, no audit table and no dry-run.
// Pure, no I/O: the caller supplies the repo list, roster, and the tile's
// already-loaded studentRepos rows.
//
// Rule order (AC2 item 8), summarized here so the code below reads as an
// implementation of a spec rather than an ad-hoc guess:
//   a. A stored row (CourseStudentRepo) matching the repo's full name
//      case-insensitively wins OUTRIGHT - the derive/match steps below are
//      never consulted for that repo. Its canvasUserId makes the row
//      "confirmed" only when it is all-digits (/^\d+$/); a present-but-not-
//      numeric id is "unbound", not "confirmed" (AC2 item 11), because
//      postCanvasGrades requires a numeric Canvas user id and gradeTileRepos
//      already guards this way at
//      src/lib/workflows/registry/steps.grading-repos.helpers.ts:219.
//   b. Otherwise derive a candidate "handle" from the repo name by inverting
//      repoSlug (src/app/actions/github.ts:125), the exact transform
//      setupStudentRepoAction (src/app/actions/github.ts:170-188) used to
//      build these names in the first place: repo = repoSlug(prefix) + "-" +
//      repoSlug(student-or-username), or just the suffix when there is no
//      prefix.
//   c. Match that handle against three tiers, in order, stopping at the
//      first tier that yields ANY match (a later tier is never consulted
//      once an earlier one matches, even if the earlier tier only found one
//      of several possible matches): (1) any stored row's `username`,
//      case-insensitively; (2) roster `loginId`, case-insensitively; (3)
//      repoSlug(roster name).
//   d. Report ALL matches at the winning tier, never just the first (AC2
//      item 9) - repoSlug collides ("Jo Smith" and "jo-smith" both slug to
//      "jo-smith"), so taking the first match would silently bind the wrong
//      student. Exactly one match is "suggested"; more than one is
//      "ambiguous"; zero is "unbound".
//
// Nothing here auto-applies a binding (AC2 item 6) - suggestRepoStudentBindings
// only classifies and reports; writing an accepted binding back to the
// tile's studentRepos is the caller's job, through the existing course
// update action (AC2 item 10), which is outside this pure module's scope.

import type { CourseStudentRepo } from "@/lib/supabase/courses";
import { repoSlug } from "@/lib/student-repo-names";

export type RepoBindingState = "confirmed" | "suggested" | "ambiguous" | "unbound";

export interface RepoBindingSuggestion {
  /** The repo full name exactly as given in `repos`. */
  repo: string;
  state: RepoBindingState;
  /** Only non-null when state === "confirmed" - see AC2 item 11. */
  canvasUserId: string | null;
  /** Display name when known: the stored/confirmed student, or the single
   * "suggested" match. Null for "ambiguous" (no single answer) and
   * "unbound" (no answer at all). */
  student: string | null;
  /**
   * Canvas's own sortable_name ("Last, First") for whichever roster entry
   * actually produced `student` above - a "suggested" match (rule c/d), or
   * the "confirmed" live-Canvas-name fallback below (docs/repo-grades-name-
   * columns-and-sorting-acceptance-criteria.md N2 item 6). Never
   * independently looked up: this is the SAME roster entry `student` came
   * from, carried along on this one object so a consumer (repoGradeStudentName.ts)
   * can prefer it without a second `course.roster` lookup of its own (N3
   * item 7). Absent (never null) whenever `student` did not come from a
   * roster entry at all (a stored/typed name, "ambiguous", "unbound") or
   * that entry carried no sortable_name to give.
   */
  studentSortable?: string;
  /**
   * N3 item 10 - true only for a CONFIRMED row whose stored `student` was
   * blank, so `student` above was filled in from the LIVE Canvas roster at
   * render time rather than from anything actually stored on this repo's
   * own row. Every other row's `student` (typed once, at binding-accept
   * time) has a different provenance; this marks the one case that does
   * not, so a consumer can say so instead of letting the fallback silently
   * pass as an ordinary stored name. Absent (never false) otherwise.
   */
  studentFromLiveCanvasFallback?: boolean;
  /** Every match at the winning tier. Empty unless state is "suggested" or
   * "ambiguous" - a "confirmed"/"unbound" row from a stored full-name match
   * (rule a) never derives candidates at all. */
  candidates: Array<{ canvasUserId: string; name: string; sortableName?: string }>;
  /** What the repo name resolved to via the repoSlug-inverting derivation
   * (rule b), for the UI to show. Null when a stored row won outright
   * (rule a), since no derivation happened for that repo. */
  derivedHandle: string | null;
}

/** One roster student, as needed by the suggester. A subset of
 * CanvasRosterEntry (src/lib/canvas/listings.ts:230) - loginId is optional
 * here because callers may build this from other sources too. */
export interface RepoBindingRosterEntry {
  id: string;
  name: string;
  loginId?: string | null;
  /** Canvas's own sortable_name ("Last, First") - listCourseRosterAction's
   * CanvasRosterEntry.sortableName already carries this; useRepoGradesData.ts
   * threads it through here rather than dropping it (docs/repo-grades-name-
   * columns-and-sorting-acceptance-criteria.md N2 item 6: it is a free
   * correctness win over any derived split, since Canvas holds the real
   * one). Optional because other callers of this interface (this pure
   * module has no I/O of its own) may not have one to supply. */
  sortableName?: string | null;
}

// The EXACT transform that produced these repo names - imported from the
// shared src/lib/student-repo-names.ts module (also used by
// setupStudentRepoAction, src/app/actions/github.ts), rather than duplicated
// here as it used to be. If that shared transform ever changes, this file's
// inversion below picks the change up automatically.

/** Inverts repoSlug (rule b): strips the owner/ prefix, then a leading
 * orgPrefix slug + hyphen when the repo name actually starts with it, and
 * returns whatever remains as the candidate handle. When orgPrefix is
 * absent, or the repo name does not start with its slug, the entire
 * (lower-cased) name segment after owner/ is returned unchanged - never
 * partially stripped. */
function deriveHandle(repo: string, orgPrefix: string | undefined): string {
  const trimmedRepo = repo.trim();
  const lastSlash = trimmedRepo.lastIndexOf("/");
  const namePart = (lastSlash === -1 ? trimmedRepo : trimmedRepo.slice(lastSlash + 1)).toLowerCase();

  const prefixSlug = orgPrefix && orgPrefix.trim() ? repoSlug(orgPrefix) : "";
  if (prefixSlug && namePart.startsWith(`${prefixSlug}-`)) {
    return namePart.slice(prefixSlug.length + 1);
  }
  return namePart;
}

/** A roster entry's sortableName, spread into a CANDIDATE object (property
 * name `sortableName`, matching RepoBindingSuggestion.candidates' own shape)
 * ONLY when present and non-blank - the "omit, never explicit
 * null/undefined" convention this module's own optional fields already use,
 * so a candidate literal built where no sortableName exists stays
 * byte-identical to one built before this field existed (the frozen
 * `toEqual` fixtures in repo-student-bindings.test.ts never set it, and must
 * keep passing). NOT the same property name as `studentSortableField`
 * below, which spreads onto the SUGGESTION object itself (`studentSortable`)
 * - the two names differ on purpose and must not be conflated. */
function sortableNameField(sortableName: string | null | undefined): { sortableName?: string } {
  const trimmed = (sortableName ?? "").trim();
  return trimmed ? { sortableName: trimmed } : {};
}

/** The same value, spread onto a RepoBindingSuggestion itself as
 * `studentSortable` (never `sortableName` - see sortableNameField's own doc
 * comment for why these are deliberately two different helpers rather than
 * one reused under two names). */
function studentSortableField(sortableName: string | null | undefined): { studentSortable?: string } {
  const trimmed = (sortableName ?? "").trim();
  return trimmed ? { studentSortable: trimmed } : {};
}

/** Tier 1: any stored row whose `username` matches `handle` case-insensitively.
 * Dedupes identical (canvasUserId, name) pairs so a repeated stored row never
 * inflates the candidate count. Stored rows (CourseStudentRepo) never carry a
 * Canvas sortableName, so these matches never get one either. */
function tierStoredUsername(
  handle: string,
  stored: CourseStudentRepo[]
): Array<{ canvasUserId: string; name: string; sortableName?: string }> {
  const seen = new Set<string>();
  const matches: Array<{ canvasUserId: string; name: string; sortableName?: string }> = [];
  for (const row of stored) {
    const username = (row.username ?? "").trim();
    if (!username || username.toLowerCase() !== handle) continue;
    const canvasUserId = (row.canvasUserId ?? "").trim();
    const key = `${canvasUserId}\u0000${row.student}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({ canvasUserId, name: row.student });
  }
  return matches;
}

/** Tier 2: roster entries whose loginId matches `handle` case-insensitively. */
function tierRosterLoginId(
  handle: string,
  roster: RepoBindingRosterEntry[]
): Array<{ canvasUserId: string; name: string; sortableName?: string }> {
  return roster
    .filter((r) => (r.loginId ?? "").trim().toLowerCase() === handle)
    .map((r) => ({ canvasUserId: r.id, name: r.name, ...sortableNameField(r.sortableName) }));
}

/** Tier 3: roster entries whose slugged display name equals `handle`. This is
 * the tier where repoSlug's known collision lives ("Jo Smith" and "jo-smith"
 * both slug to "jo-smith") - see the collision test in
 * repo-student-bindings.test.ts, which is why every match here (not just the
 * first) must be reported. */
function tierRosterNameSlug(
  handle: string,
  roster: RepoBindingRosterEntry[]
): Array<{ canvasUserId: string; name: string; sortableName?: string }> {
  return roster
    .filter((r) => repoSlug(r.name) === handle)
    .map((r) => ({ canvasUserId: r.id, name: r.name, ...sortableNameField(r.sortableName) }));
}

function suggestOne(
  repo: string,
  roster: RepoBindingRosterEntry[],
  stored: CourseStudentRepo[],
  orgPrefix: string | undefined
): RepoBindingSuggestion {
  // Rule a: a stored row matching the repo's full name (case-insensitive)
  // wins outright - the derive/tier steps below never run for this repo.
  const repoKey = repo.trim().toLowerCase();
  const storedMatch = stored.find((row) => row.repo.trim().toLowerCase() === repoKey);
  if (storedMatch) {
    const idTrimmed = (storedMatch.canvasUserId ?? "").trim();
    const isNumeric = /^\d+$/.test(idTrimmed);
    const storedStudent = (storedMatch.student ?? "").trim();
    if (isNumeric) {
      // N3 item 10: a blank stored `student` falls back to the roster entry
      // matching this row's canvasUserId - a DIFFERENT provenance from every
      // other confirmed row (those carry the name typed at binding-accept
      // time). `studentFromLiveCanvasFallback` marks that; the fallback
      // entry's own `sortableName` is threaded through too (N2 item 6),
      // since it genuinely IS the name this row is showing. Both are
      // conditionally spread (omitted, never explicit undefined/false) so a
      // normal stored-name row's object shape is byte-identical to before
      // this feature - see repo-student-bindings.test.ts's frozen `toEqual`
      // fixtures for the "stored" case.
      const fallbackEntry = storedStudent ? null : (roster.find((r) => r.id === idTrimmed) ?? null);
      return {
        repo,
        state: "confirmed",
        canvasUserId: idTrimmed,
        student: storedStudent || fallbackEntry?.name || null,
        candidates: [],
        derivedHandle: null,
        ...(fallbackEntry ? studentSortableField(fallbackEntry.sortableName) : {}),
        ...(fallbackEntry ? { studentFromLiveCanvasFallback: true } : {}),
      };
    }
    // AC2 item 11: present-but-non-numeric is unbound, not confirmed.
    return {
      repo,
      state: "unbound",
      canvasUserId: null,
      student: storedStudent || null,
      candidates: [],
      derivedHandle: null,
    };
  }

  // Rule b: derive the candidate handle from the repo name.
  const handle = deriveHandle(repo, orgPrefix);

  // Rule c/d: first tier with any match wins; every match at that tier is
  // reported, never just the first.
  let candidates = tierStoredUsername(handle, stored);
  if (candidates.length === 0) candidates = tierRosterLoginId(handle, roster);
  if (candidates.length === 0) candidates = tierRosterNameSlug(handle, roster);

  const state: RepoBindingState =
    candidates.length === 0 ? "unbound" : candidates.length === 1 ? "suggested" : "ambiguous";

  return {
    repo,
    state,
    // Never confirmed via derivation - accepting a suggestion is an explicit
    // per-row action outside this pure function (AC2 item 6).
    canvasUserId: null,
    student: state === "suggested" ? candidates[0].name : null,
    candidates,
    derivedHandle: handle,
    // N2 item 6: the single "suggested" candidate's own sortableName, when
    // it has one - the SAME roster entry `student` above just came from, so
    // this is never a second lookup. "ambiguous" has no single winner (and
    // `student` stays null for it), so it never gets one either.
    ...(state === "suggested" ? studentSortableField(candidates[0].sortableName) : {}),
  };
}

/**
 * Classifies every repo's binding to a roster student. Pure - no I/O, no
 * mutation of any input. See the module header for the full rule order.
 */
export function suggestRepoStudentBindings(
  repos: string[],
  roster: RepoBindingRosterEntry[],
  stored: CourseStudentRepo[],
  orgPrefix?: string
): RepoBindingSuggestion[] {
  return repos.map((repo) => suggestOne(repo, roster, stored, orgPrefix));
}
