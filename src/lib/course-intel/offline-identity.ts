// course-intel: OFFLINE IDENTITY. Resolving a name captured off a screen to a
// student, when there is no LMS to ask.
//
// Read decision D21 in docs/course-student-intelligence-acceptance-criteria.md
// and StudentIdentitySource's doc comment in ./types before changing a line of
// this file. The short version, because it is the part people get wrong:
//
//   AC1 forbids joining on a display name in the LIVE case, where a sound
//   numeric id exists and a name would be strictly worse for no gain. Offline
//   there is no id to prefer. The choice is a name or no feature, and AC1 was
//   never an argument for the second. Within ONE course, against the
//   instructor's OWN roster, (normalised name, course) is a workable key.
//
// WHAT DOES NOT RELAX is collision handling. Two students called Alex Chen in
// one section is uncommon and entirely real, and a silent merge would report
// one of them on the other's work. That is the failure this module exists to
// refuse, and it refuses it by never picking.
//
// REUSED, NOT REINVENTED. `matchNameAgainstRoster` is this repo's shipped
// answer to exactly this problem: canonicalise case, whitespace and
// "Last, First" order, then match EXACTLY, and report four honest outcomes -
// matched / ambiguous / unmatched / no-roster - rather than collapsing to a
// boolean. This module COMPOSES it rather than copying it. That import is
// safe for a pure leaf: grading-roster-match.ts's only import is a TYPE from
// grading-row.ts, which itself imports nothing at all, so the runtime
// dependency graph added here is a single dependency-free file. (The
// registry-client-bundle-guard hazard runs the other way - a client bundle
// pulling in server-only code - and does not apply. src/lib/command-proposal.ts
// is the standing precedent for a lib module importing a pure leaf out of
// src/app/components.)
//
// PURE LEAF: no React, no DOM, no node builtins, no clock, no randomness.

import {
  canonicalizeNameForMatch,
  matchNameAgainstRoster,
} from "@/app/components/grading-recording/grading-roster-match";
import type { GradingRowNameMatch } from "@/app/components/grading-recording/grading-row";
import type { CanvasUserId, StudentIdentitySource, StudentIndex } from "./types";

/**
 * The `course_hub.student_repos[]` fields this module reads.
 *
 * Declared structurally rather than imported from
 * `src/lib/supabase/courses.types.ts` so this leaf takes on no dependency for
 * two field names. `CourseStudentRepo` satisfies it as written.
 */
export interface OfflineStudentRepoRef {
  readonly student: string;
  /** Stored as a STRING on the course row even though it holds a Canvas
   *  numeric id. See parseCachedCanvasUserId for why that matters. */
  readonly canvasUserId: string | null;
}

/**
 * One student of this course, as the offline path knows them.
 *
 * `name` and `key` are for the UI and the join. NEITHER may reach a prompt:
 * `key` embeds the canonicalised NAME, so passing this record to a model
 * would defeat the whole StudentIndex mechanism. What goes to a model is
 * `index`, and nothing else from this type. (See StudentIndex's own doc in
 * ./types - the index is the mechanism, not decoration.)
 */
export interface OfflineStudentIdentity {
  /** 1-based position in this course's own list. What the model sees. */
  readonly index: StudentIndex;
  /**
   * The `(normalised name, course)` join key, or `null` when this student's
   * name is not a usable key in this course.
   *
   * `null` for an ambiguous name - two roster entries that canonicalise
   * identically produce the SAME key string, so joining on it would attribute
   * both students' recorded work to both of them. A null key joins to
   * nothing, which is the honest outcome and the one this whole module is
   * built around.
   */
  readonly key: string | null;
  /** The roster's own spelling, verbatim (trimmed). Display only, never a
   *  key, and never sent to a model. */
  readonly name: string;
  /** Non-null ONLY from a cached `student_repos[].canvasUserId`. Never
   *  synthesised, never derived from a name - see D19f: laundering a
   *  screen-read name into this field would be the worst outcome available. */
  readonly userId: CanvasUserId | null;
  readonly identitySource: StudentIdentitySource;
}

export interface OfflineIdentityIndex {
  readonly courseHubId: string;
  /** Every distinct student, in roster order then repo-only order. */
  readonly students: readonly OfflineStudentIdentity[];
  /**
   * False when there was nothing at all to match against - no roster text and
   * no student repos. Reported as `no-roster`, NEVER as `unmatched`: an
   * absent roster is our gap, not the student's (grading-row.ts's rule,
   * inherited verbatim).
   */
  readonly hasRoster: boolean;
  /** How many students carry a cached Canvas id. Partial by construction -
   *  the repo-grades UI already counts rows `withoutCanvasId` - so a caller
   *  can state the coverage rather than implying it is complete. */
  readonly cachedIdCount: number;
}

/**
 * The outcome of resolving one captured name against one course.
 *
 * `outcome` is `GradingRowNameMatch`, the same four-state type the grading
 * tool reports, imported rather than re-spelled so the two cannot drift.
 */
export interface OfflineIdentityResolution {
  readonly outcome: GradingRowNameMatch;
  /**
   * How the student was identified, or `null` for `unmatched`/`no-roster`
   * where NOTHING was identified and so no source describes how.
   *
   * `ambiguous` carries `ambiguous-name`, which attributes nothing - it is a
   * question for the instructor, never a pick.
   */
  readonly identitySource: StudentIdentitySource | null;
  /** Set only for `matched`. */
  readonly studentIndex: StudentIndex | null;
  /** Set only for `matched`, and only when a cached id exists. */
  readonly userId: CanvasUserId | null;
  /** Set only for `matched`. The join key for recorded rows. */
  readonly key: string | null;
  /** Every roster entry the name matched, verbatim, in roster order. Two or
   *  more for `ambiguous` - shown to the instructor so they can choose,
   *  which is the entire point of not choosing here. */
  readonly candidates: readonly string[];
}

/**
 * Reads a cached `student_repos[].canvasUserId` back as a `CanvasUserId`.
 *
 * The column is `string | null` and is NOT written exclusively by the
 * GitHub roster-binding workflow: `RosterCell.tsx` lets an instructor type
 * into a "Canvas user id" column by hand, and seeds every row's value as
 * `r.canvasUserId ?? ""`. So blanks, whitespace and free text all reach this
 * function in practice.
 *
 * Accepts only a run of digits denoting a positive safe integer. A leading
 * "+", a decimal point, a negative sign and anything with a letter in it all
 * return null rather than being coerced by `Number()`, which would happily
 * turn "" into 0 and " 12 " into 12. Returning null means "no cached id",
 * which degrades to a name match - the correct failure direction. Coercing
 * would manufacture a confident wrong id, and D19c already names that as
 * worse than an admittedly-fuzzy name, because everything downstream stops
 * treating it as uncertain.
 */
export function parseCachedCanvasUserId(raw: string | null | undefined): CanvasUserId | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * THE offline key: `(normalised name, course)`.
 *
 * The course half is not decoration. D21d verified that none of the three
 * recorded row types carries a course today and all three persist to one
 * global table per browser, so two courses graded in the same browser already
 * share one table. Embedding the course id here means a key minted for course
 * A can never equal one minted for course B, so a row whose course is unknown
 * joins to nothing rather than to whichever course happens to be open.
 *
 * Returns null for a blank name or a blank course id - a key that identified
 * "everyone with no name" would be the silent merge in a different costume.
 */
export function offlineStudentKey(courseHubId: string, name: string): string | null {
  const course = courseHubId.trim();
  if (!course) return null;
  const canon = canonicalizeNameForMatch(name);
  if (!canon) return null;
  return `${course}::${canon}`;
}

export interface BuildOfflineIdentityIndexArgs {
  readonly courseHubId: string;
  /**
   * One entry per DISTINCT roster student, in roster order.
   *
   * This is `matchNameAgainstRoster`'s own contract and it is inherited
   * unchanged: two identical strings here mean TWO STUDENTS WHO SHARE A NAME,
   * not one student listed twice, and are reported ambiguous on purpose. A
   * caller reading the free-text roster field should use `parseRosterNames`
   * (grading-course-roster.ts), which already de-duplicates. This module
   * deliberately does not de-duplicate them itself: folding two identical
   * lines into one entry would erase the exact collision it exists to catch.
   */
  readonly rosterNames: readonly string[];
  /** `course_hub.student_repos`, or an empty list. */
  readonly studentRepos: readonly OfflineStudentRepoRef[];
}

/**
 * Builds this course's offline student list from the two things a course row
 * carries with no connection: the free-text roster and the cached repo
 * bindings.
 *
 * MERGE RULE, and the reason it is not a plain concatenation: a student named
 * in BOTH sources is one student. Concatenating would give their name two
 * entries, and `matchNameAgainstRoster` would then report every such student
 * as `ambiguous` - turning a normal overlapping roster into a course where
 * nothing resolves. So a repo row whose canonicalised name already appears in
 * the roster ATTACHES its cached id to that entry; only a repo row with no
 * roster counterpart adds an entry of its own (a student known from a real
 * prior binding but missing from the pasted roster text, which is an ordinary
 * state rather than an error).
 *
 * WHERE A CACHED ID DOES NOT BREAK A TIE: if a canonical name appears twice
 * in the roster, a cached id for that name identifies one Canvas user but
 * says nothing about WHICH of the two roster lines is that user. Both entries
 * stay `ambiguous-name` and neither takes the id. The same holds when two
 * repo rows share a name and carry different ids - two ids for one name is
 * two people, so the name resolves to neither.
 */
export function buildOfflineIdentityIndex(args: BuildOfflineIdentityIndexArgs): OfflineIdentityIndex {
  const courseHubId = args.courseHubId;

  // Distinct cached ids per canonical name. A Set, because two repo rows for
  // the same person carrying the same id is a duplicate, while two carrying
  // different ids is two people.
  const idsByCanon = new Map<string, Set<CanvasUserId>>();
  const repoNameByCanon = new Map<string, string>();
  for (const repo of args.studentRepos) {
    const display = typeof repo.student === "string" ? repo.student.trim() : "";
    const canon = canonicalizeNameForMatch(display);
    if (!canon) continue;
    if (!repoNameByCanon.has(canon)) repoNameByCanon.set(canon, display);
    const id = parseCachedCanvasUserId(repo.canvasUserId);
    if (id === null) continue;
    const existing = idsByCanon.get(canon);
    if (existing) existing.add(id);
    else idsByCanon.set(canon, new Set([id]));
  }

  const draft: { readonly name: string; readonly canon: string }[] = [];
  const rosterCanons = new Set<string>();
  for (const rosterName of args.rosterNames) {
    const display = typeof rosterName === "string" ? rosterName.trim() : "";
    const canon = canonicalizeNameForMatch(display);
    if (!canon) continue;
    draft.push({ name: display, canon });
    rosterCanons.add(canon);
  }
  for (const [canon, display] of repoNameByCanon) {
    if (rosterCanons.has(canon)) continue;
    draft.push({ name: display, canon });
  }

  const occurrences = new Map<string, number>();
  for (const entry of draft) occurrences.set(entry.canon, (occurrences.get(entry.canon) ?? 0) + 1);

  let cachedIdCount = 0;
  const students: OfflineStudentIdentity[] = draft.map((entry, i) => {
    const ids = idsByCanon.get(entry.canon);
    const ambiguous = (occurrences.get(entry.canon) ?? 0) > 1 || (ids?.size ?? 0) > 1;
    if (ambiguous) {
      return {
        index: i + 1,
        key: null,
        name: entry.name,
        userId: null,
        identitySource: "ambiguous-name",
      };
    }
    const userId = ids && ids.size === 1 ? Array.from(ids)[0] : null;
    if (userId !== null) cachedIdCount += 1;
    return {
      index: i + 1,
      key: offlineStudentKey(courseHubId, entry.name),
      name: entry.name,
      userId,
      // A cached id is PREFERRED over the name match and marked differently,
      // because it is a fact from a real prior Canvas call rather than a
      // match. It is not stronger than a live roster read: its age is
      // unknowable offline and its coverage is partial by construction, which
      // is why it is its own source rather than being called "lms-roster".
      identitySource: userId !== null ? "cached-canvas-id" : "course-roster-name",
    };
  });

  return {
    courseHubId,
    students,
    hasRoster: students.length > 0,
    cachedIdCount,
  };
}

const UNRESOLVED = Object.freeze({
  identitySource: null,
  studentIndex: null,
  userId: null,
  key: null,
  candidates: Object.freeze([]) as readonly string[],
});

/**
 * Resolves one captured name against one course's offline student list.
 *
 * The four outcomes are `matchNameAgainstRoster`'s, unchanged:
 *
 *   matched    - exactly one student. Carries a cached id when one exists
 *                (`cached-canvas-id`), otherwise resolves by name alone
 *                (`course-roster-name`) with a null userId. Offline there is
 *                no id to invent and none is invented.
 *   ambiguous  - more than one student matched. ATTRIBUTES NOTHING. This is
 *                the outcome that keeps one student's work off another
 *                student's record, and it is a question for the instructor,
 *                never a pick. `candidates` carries who matched so the
 *                instructor can answer it.
 *   unmatched  - a roster existed and this name is not on it.
 *   no-roster  - there was no list to check against at all. Distinct from
 *                `unmatched` and must never be reported as if it were.
 *
 * A student whose index entry is already `ambiguous-name` resolves as
 * `ambiguous` even though `matchNameAgainstRoster` sees a single entry for
 * it: that entry stands for two people whose repo bindings disagree, and only
 * this index knows it.
 */
export function resolveOfflineIdentity(
  index: OfflineIdentityIndex,
  readName: string
): OfflineIdentityResolution {
  if (!index.hasRoster) {
    return { outcome: "no-roster", ...UNRESOLVED };
  }

  const rosterNames = index.students.map((s) => s.name);
  const result = matchNameAgainstRoster(readName, rosterNames);

  if (result.nameMatch === "no-roster" || result.nameMatch === "unmatched") {
    return { outcome: result.nameMatch, ...UNRESOLVED };
  }

  if (result.nameMatch === "ambiguous") {
    return {
      outcome: "ambiguous",
      identitySource: "ambiguous-name",
      studentIndex: null,
      userId: null,
      key: null,
      candidates: result.rosterCandidates,
    };
  }

  const canon = canonicalizeNameForMatch(readName);
  const student = index.students.find((s) => canonicalizeNameForMatch(s.name) === canon);
  if (!student) {
    // Unreachable: matchNameAgainstRoster matched against this exact list.
    // Kept total rather than throwing - a throw here would lose every other
    // student in the same pass, and "unmatched" attributes nothing.
    return { outcome: "unmatched", ...UNRESOLVED };
  }

  if (student.identitySource === "ambiguous-name" || student.key === null) {
    return {
      outcome: "ambiguous",
      identitySource: "ambiguous-name",
      studentIndex: null,
      userId: null,
      key: null,
      candidates: [student.name],
    };
  }

  return {
    outcome: "matched",
    identitySource: student.identitySource,
    studentIndex: student.index,
    userId: student.userId,
    key: student.key,
    candidates: result.rosterCandidates,
  };
}
