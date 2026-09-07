// course-intel: THE JOIN. Raw per-source arrays in, one CourseIntelAssembly
// out. This is the file AC1 calls "the feature" - if the join is unsound,
// nothing built on top of it is worth having.
//
// A PURE LEAF, deliberately: no fetch, no Supabase, no React, no `node:`
// import, no clock. `now` and `assembledAt` arrive as parameters. Every byte
// this module touches has already been fetched and ownership-checked by its
// caller, which is the same split src/lib/chat/knowledge-context.ts documents
// at its own top - and it is the only split under which this repo's vitest
// (environment "node", src/**/*.test.ts only) can actually test anything.
//
// THE KEY IS THE NUMERIC CANVAS user_id, AND NOTHING ELSE. Never a display
// name, never a similarity score. This repo already ships a feature that
// matches message senders to students by Levenshtein distance, because the
// list endpoint it uses hands it names only. That is not a hypothetical
// warning about AC1 - it is the same bug, already in production, and this
// module exists so it is not repeated.
//
// THE SOURCES DISAGREE ON THE TYPESCRIPT TYPE OF THAT KEY:
// listStudentGradeSummaries returns `userId: string` (it stringifies
// `row.user_id`), listCourseRoster returns `id: string`, while the discussion
// walk, the auto-zero reader and fetchSubmissionDetail all use `number`.
// normaliseUserId below is the SINGLE boundary where that is reconciled.
// Nowhere else in this feature may a user id be a string - see CanvasUserId
// in ./types.
//
// The input types below are declared here rather than imported from
// src/lib/canvas/*, on purpose. This module must stay importable by a test
// with nothing mocked, and it must not acquire a dependency on the Canvas
// readers' own evolution: what it needs is a SHAPE, and a caller that can
// produce that shape from any reader (bulk grid, per-assignment fallback -
// see D4) can use it unchanged.

import type {
  AssemblyOmission,
  AssemblyTier,
  CanvasUserId,
  CourseAnnouncementBrief,
  CourseAssignmentBrief,
  CourseIntelAssembly,
  CourseStudentRecord,
  MissingRollup,
  Presence,
  StudentDiscussionActivity,
  StudentGradeSummary,
  StudentMessageActivity,
  StudentSubmissionFact,
  StudentSubmissionSummary,
  StudentTextRef,
  StudentThreadRef,
} from "./types";

/**
 * One roster row, as listCourseRoster (src/lib/canvas/listings.ts) returns it,
 * MINUS `loginId`.
 *
 * The omission is deliberate and is D13. listCourseRoster extracts `loginId`
 * for free, and repo-grades - the exact template an implementer copies for a
 * per-course tool - uses that function, so the login id arrives in the
 * implementer's hand without them asking for it. It is a client-side
 * disambiguator only: it may reach a citation chip rendered in the
 * instructor's own browser, and it may never reach the prompt, the stored
 * answer, or the citation payload. This type cannot carry it, so this join
 * cannot leak it downstream even by accident.
 */
export interface RosterEntryInput {
  /** Canvas user id, stringified by the reader. Normalised here, once. */
  readonly id: string;
  readonly name: string;
  readonly sortableName: string;
}

/** One row of listStudentGradeSummaries. Note `userId: string` - this is the
 * source that disagrees with every other one about the key's type. */
export interface GradeSummaryInput {
  readonly userId: string;
  readonly name: string;
  readonly currentScore: number | null;
  readonly finalScore: number | null;
}

/** One (student, assignment) submission fact from the bulk submission grid or
 * from the per-assignment fallback (D4). Same shape either way, which is what
 * lets the fallback be a swap at the caller rather than a second join. */
export interface SubmissionFactInput extends StudentSubmissionFact {
  readonly userId: CanvasUserId;
}

/** One piece of student-authored discussion writing, already extracted and
 * attributed. `parentUserId` is the request's "along with the students they
 * are replying to" and needs no new plumbing: extractDiscussionActivity
 * already threads the parent's user id down through its recursive walk. */
export interface DiscussionEntryInput extends StudentTextRef {
  readonly userId: CanvasUserId;
}

/** One conversation this student is in, from the cheap index (no bodies). */
export interface MessageThreadInput extends StudentThreadRef {
  readonly userId: CanvasUserId;
}

/** One message body, which costs one call per conversation and therefore
 * arrives under its own Presence. */
export interface MessageBodyInput extends StudentTextRef {
  readonly userId: CanvasUserId;
}

/**
 * Every source arrives wrapped in the same Presence the records carry, so
 * "we did not fetch this" survives the join instead of being flattened into
 * an empty array at the boundary. Flattening here is precisely how a student
 * ends up reported as "missing 7 of 7" when the truth is "we did not look".
 */
export type SourceInput<T> = Presence<readonly T[]>;

export interface JoinInput {
  readonly courseHubId: string;
  readonly institution: string;
  readonly canvasCourseId: string;
  readonly courseName: string;
  /** ISO timestamp. A parameter, never a clock read inside this module. */
  readonly assembledAt: string;
  readonly tier: AssemblyTier;

  /** The roster is identity, not evidence, so it is a plain array: a join
   * with no roster at all is not an assembly, it is a failure the caller
   * should have reported instead. */
  readonly roster: readonly RosterEntryInput[];

  readonly grades: SourceInput<GradeSummaryInput>;
  readonly submissions: SourceInput<SubmissionFactInput>;
  readonly discussion: SourceInput<DiscussionEntryInput>;
  readonly messageThreads: SourceInput<MessageThreadInput>;
  readonly messageBodies: SourceInput<MessageBodyInput>;

  readonly assignments: readonly CourseAssignmentBrief[];
  readonly announcements: readonly CourseAnnouncementBrief[];
  /** Omissions the caller already knows about (skipped topics, over-cap
   * topics, failed sources). This module appends its own. */
  readonly omissions?: readonly AssemblyOmission[];
}

/**
 * The single normalisation boundary for the join key.
 *
 * Accepts what the four readers actually produce (`number` from the
 * discussion/submission side, `string` from the enrollment/roster side) and
 * returns a CanvasUserId or null. Null means "this row's identity is
 * unreadable", which is never silently discarded - the caller records it as
 * an omission (see buildCourseIntelAssembly).
 *
 * Rejects non-integers and non-finite values rather than coercing them:
 * `Number("12abc")` is NaN, `Number("")` is 0, and a user id of 0 attributed
 * to a real student's writing is a silent merge - the exact failure this key
 * exists to prevent.
 */
export function normaliseUserId(raw: string | number | null | undefined): CanvasUserId | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  }
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * The student's EFFECTIVE due date for one assignment, with overrides applied.
 *
 * Three states out of two fields, copied from the auto-zero reader's hard-won
 * handling: `dueAtPresent === true` means Canvas spoke for this student (a
 * string is their own deadline, `null` means they have no deadline at all),
 * and `dueAtPresent === false` means Canvas said nothing and the assignment's
 * base due date applies. A single nullable field cannot tell "no deadline for
 * them" from "ask the assignment", and getting that wrong moves students in
 * and out of the missing-work denominator.
 */
export function effectiveDueAt(
  fact: StudentSubmissionFact,
  brief: CourseAssignmentBrief | undefined
): string | null {
  if (fact.dueAtPresent) return fact.dueAt;
  return brief?.dueAt ?? null;
}

/**
 * Is this (student, assignment) pair in the denominator of "missing 4 of 7"?
 *
 * BOTH NUMBERS COME FROM THIS SET or the sentence is false. The rule, exactly:
 * published, AND not omitted from the final grade, AND an effective due date
 * that is already in the past. An assignment nobody could have submitted yet
 * is not missing work, and counting it makes every student in the course look
 * worse in the first week of term - which is the single most likely way this
 * feature manufactures a concern that is not there.
 *
 * Three edge decisions, each written down because each is a silent
 * miscount waiting to happen:
 *
 * 1. NO BRIEF AT ALL. A submission row for an assignment we have no brief for
 *    is NOT considered: without the brief we cannot establish "published" or
 *    "omitted from the final grade", and guessing either way puts a number in
 *    front of an instructor that no rule produced. The caller records the gap
 *    as an omission rather than letting it vanish.
 * 2. `published === null`. Canvas does not always send the flag; a missing
 *    flag is not evidence the assignment is unpublished. Excluding on unknown
 *    would silently SHRINK the denominator and drop real missing work, which
 *    is the completeness direction D1 warns about, so only an explicit
 *    `false` excludes.
 * 3. NO EFFECTIVE DUE DATE. A student with no deadline cannot be late and
 *    cannot be missing, so they are out of the denominator entirely. Same for
 *    a due date that does not parse - an unreadable date is not a past one.
 */
export function isConsideredForMissing(
  fact: StudentSubmissionFact,
  brief: CourseAssignmentBrief | undefined,
  nowMs: number
): boolean {
  if (!brief) return false;
  if (brief.published === false) return false;
  if (brief.omitFromFinalGrade === true) return false;
  const dueMs = parseMs(effectiveDueAt(fact, brief));
  if (dueMs === null) return false;
  return dueMs <= nowMs;
}

/**
 * "Student X is missing 4 of 7", computed over one denominator set.
 *
 * `missing` and `late` are Canvas's OWN booleans, carried verbatim and never
 * re-derived from `submittedAt` versus a due date: Canvas's `missing` accounts
 * for a teacher's manual "mark missing" override and for submission types that
 * cannot be submitted online at all, so a local re-derivation would disagree
 * with the gradebook the instructor is looking at while claiming to describe
 * it. No code in src/lib/canvas has ever read either field; that is why they
 * are in the fact type.
 *
 * Excused work is excluded from missing and late (an excusal is the
 * instructor's own decision, already made) but is counted separately so the
 * exclusion is visible rather than an unexplained gap in the arithmetic.
 */
export function computeMissingRollup(
  facts: readonly StudentSubmissionFact[],
  assignmentsById: ReadonlyMap<string, CourseAssignmentBrief>,
  nowMs: number
): MissingRollup {
  let consideredCount = 0;
  let missingCount = 0;
  let lateCount = 0;
  let gradedCount = 0;
  let ungradedSubmittedCount = 0;
  let excusedCount = 0;

  for (const fact of facts) {
    if (!isConsideredForMissing(fact, assignmentsById.get(fact.assignmentId), nowMs)) continue;
    consideredCount += 1;
    if (fact.excused) {
      excusedCount += 1;
      continue;
    }
    if (fact.missing) missingCount += 1;
    if (fact.late) lateCount += 1;
    if (fact.workflowState === "graded") gradedCount += 1;
    else if (fact.submittedAt) ungradedSubmittedCount += 1;
  }

  return { consideredCount, missingCount, lateCount, gradedCount, ungradedSubmittedCount, excusedCount };
}

/** Carry a non-loaded source state through to a per-student Presence without
 * inventing a value for it. A `loaded` source never reaches here. */
function carryNonLoaded<A, B>(source: Presence<readonly A[]>): Presence<B> {
  switch (source.state) {
    case "not-fetched":
      return { state: "not-fetched", reason: source.reason };
    case "failed":
      return { state: "failed", reason: source.reason };
    case "none":
      return { state: "none" };
    default:
      // Unreachable: callers check for "loaded" first. Kept total rather than
      // throwing, because a join that throws loses every other student too.
      return { state: "none" };
  }
}

// The constraint is `string | number`, not CanvasUserId, precisely because the
// sources disagree: the grade-summary reader stringifies its user id and the
// rest do not. This is the one function that sees both, and normaliseUserId
// below is where the disagreement ends.
function groupBy<T extends { readonly userId: string | number }>(
  rows: readonly T[],
  onSkipped: () => void
): Map<CanvasUserId, T[]> {
  const map = new Map<CanvasUserId, T[]>();
  for (const row of rows) {
    const id = normaliseUserId(row.userId);
    if (id === null) {
      onSkipped();
      continue;
    }
    const list = map.get(id);
    if (list) list.push(row);
    else map.set(id, [row]);
  }
  return map;
}

function countByUser(others: readonly CanvasUserId[]) {
  const counts = new Map<CanvasUserId, number>();
  for (const other of others) counts.set(other, (counts.get(other) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count || a.userId - b.userId);
}

/** Display label for a user id that appeared in a thread or a conversation but
 * is not on the roster.
 *
 * Built from the id, NEVER from a display name carried on a discussion
 * participant record. A Canvas user sets their own display name, so a student
 * can set theirs to a classmate's name or to something like "Jordan Blake (at
 * risk)". Not an injection risk - answers render through the hardened markdown
 * renderer - a confusion risk, and this is the one place in the join where an
 * unvetted name could have crept in. */
function offRosterLabel(userId: CanvasUserId): string {
  return `${SYNTHETIC_NAME_PREFIX}${userId}`;
}

/** The prefix of every name this module synthesises rather than reads from an
 * enrollment. Exported with its predicate below because a consumer has to be
 * able to tell a synthesised label from a person's actual name - see
 * isSyntheticStudentName. */
export const SYNTHETIC_NAME_PREFIX = "Canvas user ";

/**
 * True when `name` is a label this join built out of a user id rather than a
 * name Canvas gave for a real enrollment.
 *
 * This exists for one specific downstream hazard. The shipped author-name
 * redactor (redactAuthorNameFromText) strips EVERY TOKEN of the author string
 * out of that author's own writing, so handing it a synthesised label would
 * delete the ordinary words in that label - "canvas", "user" - from a
 * student's post wherever they appear. A caller redacting an author's name out
 * of their own body must skip names this returns true for.
 */
export function isSyntheticStudentName(name: string): boolean {
  return new RegExp(`^${SYNTHETIC_NAME_PREFIX}\\d+$`).test(name.trim());
}

/**
 * Build the assembly.
 *
 * Ordering, and therefore the student INDEX, is: roster order first (the
 * reader already sorts by sortable name), then off-roster participants by
 * ascending user id. Deterministic, so the same inputs always produce the same
 * S-numbers - which matters because those numbers are what the model is given
 * and what a stored answer's citations resolve against.
 */
export function buildCourseIntelAssembly(input: JoinInput): CourseIntelAssembly {
  const nowMs = parseMs(input.assembledAt) ?? 0;
  const omissions: AssemblyOmission[] = [...(input.omissions ?? [])];
  let unreadableIdCount = 0;
  const noteUnreadable = () => {
    unreadableIdCount += 1;
  };

  const assignmentsById = new Map<string, CourseAssignmentBrief>();
  for (const assignment of input.assignments) assignmentsById.set(assignment.assignmentId, assignment);

  const gradesByUser =
    input.grades.state === "loaded" ? groupBy(input.grades.value, noteUnreadable) : new Map<CanvasUserId, GradeSummaryInput[]>();
  const submissionsByUser =
    input.submissions.state === "loaded"
      ? groupBy(input.submissions.value, noteUnreadable)
      : new Map<CanvasUserId, SubmissionFactInput[]>();
  const discussionByUser =
    input.discussion.state === "loaded"
      ? groupBy(input.discussion.value, noteUnreadable)
      : new Map<CanvasUserId, DiscussionEntryInput[]>();
  const threadsByUser =
    input.messageThreads.state === "loaded"
      ? groupBy(input.messageThreads.value, noteUnreadable)
      : new Map<CanvasUserId, MessageThreadInput[]>();
  const bodiesByUser =
    input.messageBodies.state === "loaded"
      ? groupBy(input.messageBodies.value, noteUnreadable)
      : new Map<CanvasUserId, MessageBodyInput[]>();

  // Reply direction, both ways, computed once over the whole course rather
  // than per student: "who replied to this student" is only visible from the
  // other side of the edge, and a student nobody answers is a real signal an
  // instructor cares about.
  const repliedToPairs = new Map<CanvasUserId, CanvasUserId[]>();
  const repliedToByPairs = new Map<CanvasUserId, CanvasUserId[]>();
  if (input.discussion.state === "loaded") {
    for (const entry of input.discussion.value) {
      const author = normaliseUserId(entry.userId);
      const parent = normaliseUserId(entry.parentUserId);
      if (author === null || parent === null) continue;
      const out = repliedToPairs.get(author) ?? [];
      out.push(parent);
      repliedToPairs.set(author, out);
      const back = repliedToByPairs.get(parent) ?? [];
      back.push(author);
      repliedToByPairs.set(parent, back);
    }
  }

  // Identity. Roster first (first-seen wins on a duplicated id), then every
  // other user id any source attributed content to. A user id seen in a thread
  // or a conversation but absent from the roster is real - a dropped student,
  // a TA, an observer - and is reported as off-roster rather than merged into
  // somebody else or dropped.
  const rosterIds = new Set<CanvasUserId>();
  const orderedIds: CanvasUserId[] = [];
  const rosterById = new Map<CanvasUserId, RosterEntryInput>();
  for (const entry of input.roster) {
    const id = normaliseUserId(entry.id);
    if (id === null) {
      noteUnreadable();
      continue;
    }
    if (rosterIds.has(id)) continue;
    rosterIds.add(id);
    rosterById.set(id, entry);
    orderedIds.push(id);
  }

  const seenIds = new Set<CanvasUserId>(rosterIds);
  const offRosterIds: CanvasUserId[] = [];
  for (const source of [gradesByUser, submissionsByUser, discussionByUser, threadsByUser, bodiesByUser, repliedToByPairs]) {
    for (const id of source.keys()) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      offRosterIds.push(id);
    }
  }
  offRosterIds.sort((a, b) => a - b);
  orderedIds.push(...offRosterIds);

  const students: CourseStudentRecord[] = orderedIds.map((userId, position) => {
    const index = position + 1;
    const rosterEntry = rosterById.get(userId);
    const gradeRow = gradesByUser.get(userId)?.[0];
    const onRoster = rosterIds.has(userId);

    // Identity comes from the roster call, then from the ENROLLMENTS call
    // (listStudentGradeSummaries reads `user.name`/`user.sortable_name` off an
    // enrollment, which is instructor-visible course data), and only then from
    // a label built out of the id. A discussion participant's self-supplied
    // display_name is never a source here.
    const name = rosterEntry?.name || gradeRow?.name || offRosterLabel(userId);
    const sortableName = rosterEntry?.sortableName || gradeRow?.name || offRosterLabel(userId);

    let grades: Presence<StudentGradeSummary>;
    if (input.grades.state !== "loaded") grades = carryNonLoaded(input.grades);
    else if (!gradeRow) grades = { state: "none" };
    else grades = { state: "loaded", value: { currentScore: gradeRow.currentScore, finalScore: gradeRow.finalScore } };

    let submissions: Presence<StudentSubmissionSummary>;
    if (input.submissions.state !== "loaded") submissions = carryNonLoaded(input.submissions);
    else {
      const facts = submissionsByUser.get(userId) ?? [];
      if (facts.length === 0) {
        // Zero rows is NOT "submitted nothing". The grid returning nothing for
        // a student is an absence of evidence; concern.ts reads any non-loaded
        // state as insufficient-data, which is what keeps "missing 7 of 7"
        // from being manufactured out of silence.
        submissions = { state: "none" };
      } else {
        const byAssignmentId: Record<string, StudentSubmissionFact> = {};
        for (const fact of facts) byAssignmentId[fact.assignmentId] = fact;
        submissions = {
          state: "loaded",
          value: { byAssignmentId, rollup: computeMissingRollup(facts, assignmentsById, nowMs) },
        };
      }
    }

    let discussion: Presence<StudentDiscussionActivity>;
    if (input.discussion.state !== "loaded") discussion = carryNonLoaded(input.discussion);
    else {
      const entries = discussionByUser.get(userId) ?? [];
      const repliedTo = countByUser(repliedToPairs.get(userId) ?? []);
      const repliedToBy = countByUser(repliedToByPairs.get(userId) ?? []);
      if (entries.length === 0 && repliedTo.length === 0 && repliedToBy.length === 0) {
        discussion = { state: "none" };
      } else {
        // Split on `kind`, never on "does this have a parentUserId". A reply
        // whose parent's user id could not be read still has a null
        // parentUserId, and counting it as a top-level post would silently
        // move a reply into the wrong half of the record. The two filters are
        // exact complements so nothing in the source can fall out of both.
        const posts = entries.filter((e) => e.kind === "discussion-post");
        const replies = entries.filter((e) => e.kind !== "discussion-post");
        discussion = { state: "loaded", value: { posts, replies, repliedTo, repliedToBy } };
      }
    }

    let messages: Presence<StudentMessageActivity>;
    if (input.messageThreads.state !== "loaded") messages = carryNonLoaded(input.messageThreads);
    else {
      const threads = threadsByUser.get(userId) ?? [];
      const bodyRows = bodiesByUser.get(userId) ?? [];
      let bodies: Presence<readonly StudentTextRef[]>;
      if (input.messageBodies.state !== "loaded") bodies = carryNonLoaded(input.messageBodies);
      else if (bodyRows.length === 0) bodies = { state: "none" };
      else bodies = { state: "loaded", value: bodyRows };
      messages =
        threads.length === 0 && bodies.state === "none" ? { state: "none" } : { state: "loaded", value: { threads, bodies } };
    }

    // Only LOADED sources contribute. A `not-fetched` source must never move
    // this value, or "no activity for 30 days" becomes a statement about what
    // this tier chose to fetch rather than about the student.
    let lastMs: number | null = null;
    let lastActivityAt: string | null = null;
    const consider = (iso: string | null) => {
      const ms = parseMs(iso);
      if (ms === null) return;
      if (lastMs === null || ms > lastMs) {
        lastMs = ms;
        lastActivityAt = iso;
      }
    };
    if (submissions.state === "loaded") {
      for (const fact of Object.values(submissions.value.byAssignmentId)) consider(fact.submittedAt);
    }
    if (discussion.state === "loaded") {
      for (const ref of [...discussion.value.posts, ...discussion.value.replies]) consider(ref.createdAt);
    }
    if (messages.state === "loaded") {
      for (const thread of messages.value.threads) consider(thread.lastMessageAt);
      if (messages.value.bodies.state === "loaded") {
        for (const body of messages.value.bodies.value) consider(body.createdAt);
      }
    }

    return { userId, index, name, sortableName, onRoster, grades, submissions, discussion, messages, lastActivityAt };
  });

  if (offRosterIds.length > 0) {
    omissions.push({
      kind: "off-roster-participant",
      detail:
        "Some content is attributed to user ids that are not on this course's student roster (a dropped student, a TA, or an observer). They are listed as off-roster rather than merged into a roster student.",
      count: offRosterIds.length,
    });
  }

  if (unreadableIdCount > 0) {
    omissions.push({
      kind: "source-failed",
      detail: "Rows whose Canvas user id could not be read were skipped rather than guessed at.",
      count: unreadableIdCount,
    });
  }

  // Present on EVERY assembly, per the AssemblyOmissionKind doc, including one
  // where messages were never fetched: the caveat describes what this assembly
  // can never contain, not what this run happened to ask for. The course
  // filter trusts Canvas's own context tagging, so a conversation about the
  // course that was started from the general inbox is absent and cannot be
  // counted. An omission we cannot measure is still an omission we must state,
  // which is why it carries no `count`.
  omissions.push({
    kind: "course-filter-best-effort",
    detail:
      "Messages are included only when Canvas associated them with this course. A message about the course sent from the general inbox carries no course context and cannot be counted.",
  });

  return {
    courseHubId: input.courseHubId,
    institution: input.institution,
    canvasCourseId: input.canvasCourseId,
    courseName: input.courseName,
    assembledAt: input.assembledAt,
    tier: input.tier,
    students,
    announcements: input.announcements,
    assignments: input.assignments,
    omissions,
  };
}
