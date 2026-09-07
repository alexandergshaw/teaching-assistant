// course-intel: THE ONLY I/O ORCHESTRATOR. Everything else in this feature is
// a pure leaf; this is the file that decides which Canvas calls a question is
// worth, makes them, and turns whatever came back - including what did not -
// into the shapes ./join already knows how to assemble.
//
// TWO STRATA, SPLIT BY FAN-OUT SHAPE RATHER THAN BY STUDENT (D2).
//
//   STRATUM A - SIGNALS. Roster, grade summaries, assignment briefs, the
//   submission grid, the topic inventory, announcements, the conversation
//   index. SEVEN reader calls, roughly 6-16 HTTP requests, and the count is
//   INDEPENDENT OF STUDENT COUNT - no per-assignment loop, no per-topic loop,
//   no /view. It carries ZERO student-authored text, which is why the concern
//   question is the cheapest question this feature answers rather than the
//   most expensive one. That is not a dodge: shipping every student's prose to
//   a model to ask who is struggling is precisely the design AC3 was written
//   to prevent, because it invites the model to read tone and call it concern.
//
//   STRATUM B - TEXT. Fans out per topic and per conversation. This is the
//   entire 60-90 call volume problem, and it lives only here, only when the
//   question's own shape needs prose.
//
// DEPENDENCY INJECTION, NOT DIRECT IMPORTS, and for the same reason ./join
// declares its input shapes rather than importing them: this module must stay
// loadable by a vitest run with nothing mocked (environment "node", so no
// next/headers, no credential resolution, no network), and it must not acquire
// a dependency on the Canvas readers' own evolution. What it needs is a set of
// SHAPES. The route binds the real readers to one course's credentials once
// and hands them over already curried - which also means the concern path's
// central guarantee ("no /view call, no getConversation call") is a property a
// test can assert directly, on the deps object, rather than infer.
//
// PER-ITEM FAILURES ARE OMISSIONS, NOT FATAL. One oversized discussion thread
// throws - canvasFetch enforces a response byte cap and fails rather than
// truncating - and seven of nine topics loading is an answer WITH a stated
// omission. Never a silent success, never a hard error. AC6: an answer built
// from half the replies, presented as though it saw all of them, is worse than
// a refusal, because the instructor cannot tell the difference and will trust
// it.
//
// WHAT THIS FILE DELIBERATELY DOES NOT ADD: the `course-filter-best-effort`
// omission. It belongs on every assembly, and buildCourseIntelAssembly
// (./join) already pushes it unconditionally at the end of every build. Adding
// it here as well would print the same caveat to the instructor twice.

import { mapWithConcurrency } from "../canvas-modules/fetch-helpers";
import { redactSensitiveText } from "../lms-generation/generation-diag";
import { normaliseUserId } from "./join";
import type {
  DiscussionEntryInput,
  GradeSummaryInput,
  MessageBodyInput,
  MessageThreadInput,
  RosterEntryInput,
  SourceInput,
  SubmissionFactInput,
} from "./join";
import type {
  AssemblyOmission,
  CanvasUserId,
  CourseAnnouncementBrief,
  CourseAssignmentBrief,
} from "./types";

// ---------------------------------------------------------------------------
// Budget constants.
// ---------------------------------------------------------------------------

/** In-flight fan-out width. This repo's established idiom (the submission-grid
 * fallback uses 4, the module readers 6) and NOT a tuning knob: Canvas's
 * tolerance for concurrent reads is unverified here, none of these read paths
 * has any 429 retry (the throttle helper is wired to writes only), and a
 * throttled item fails immediately and cheaply as a stated omission. Widening
 * this trades latency for lost items rather than absorbing them. */
export const TEXT_FANOUT_CONCURRENCY = 6;

/** How many reply-bearing discussion topics one question may read. The second
 * of D2's three levers, after the free one (skip topics Canvas already told us
 * have no replies). A per-topic /view is unpaginated and untruncated on this
 * app's side, so this cap is the only thing standing between a busy course and
 * the platform's wall. */
export const DEFAULT_MAX_TEXT_TOPICS = 8;

/** How many of one student's conversations may have their bodies read. One
 * call each, and narrowing to a single student is where naming a student
 * genuinely reduces the call count (it does not for discussions - Canvas has
 * no "one student's entries in a course" endpoint and /view returns the whole
 * thread regardless). */
export const DEFAULT_MAX_TEXT_CONVERSATIONS = 10;

/**
 * How much of the fan-out budget must remain before another item is STARTED.
 *
 * This is what makes the platform cap survivable rather than something the run
 * discovers by dying. A kill at the ceiling cannot be intercepted from inside
 * the handler - no catch, no finally, and NO RESPONSE AT ALL reaches the
 * instructor - so the design has to land before the wall rather than find it.
 * Sized against canvasFetch's own 15s per-request default plus room to finish
 * the items already in flight: below this, starting one more read can only
 * turn a complete answer with a stated omission into no answer whatsoever.
 */
export const TEXT_ITEM_RESERVE_MS = 12_000;

// ---------------------------------------------------------------------------
// What the readers must return. Declared here rather than imported from
// src/lib/canvas/*, mirroring ./join's own reasoning: these are SHAPES, and a
// caller that can produce them from any reader - the bulk submission grid or
// its per-assignment fallback, say - can use this module unchanged.
// ---------------------------------------------------------------------------

/** One roster row, MINUS `loginId`. The omission is D13 and it is enforced by
 * this type: listCourseRoster extracts a login id for free and repo-grades -
 * the template an implementer copies - uses that function, so it arrives in
 * their hand unasked. Every mapping below names its fields explicitly and
 * never spreads, so a login id present on the runtime value is dropped rather
 * than carried. */
export interface RosterRow {
  readonly id: string;
  readonly name: string;
  readonly sortableName: string;
}

export interface GradeSummaryRow {
  readonly userId: string;
  readonly name: string;
  readonly currentScore: number | null;
  readonly finalScore: number | null;
}

export interface AssignmentBriefRow {
  readonly assignmentId: string;
  readonly name: string;
  readonly dueAt: string | null;
  readonly pointsPossible: number | null;
  readonly published: boolean | null;
  readonly omitFromFinalGrade: boolean | null;
}

export interface SubmissionGridRow {
  readonly userId: number;
  readonly assignmentId: string;
  readonly score: number | null;
  readonly workflowState: string;
  readonly submittedAt: string | null;
  readonly excused: boolean;
  readonly late: boolean;
  readonly missing: boolean;
  readonly dueAt: string | null;
  readonly dueAtPresent: boolean;
}

export interface SubmissionGridResult {
  readonly rows: readonly SubmissionGridRow[];
  /** Which path produced the grid. D4: the bulk endpoint has never been
   * exercised against these Canvas instances, and its fallback trigger is
   * exactly the kind of fact that must never be silently absorbed. */
  readonly source: "bulk" | "per-assignment-fallback";
}

export interface TopicBriefRow {
  readonly id: number;
  readonly title: string;
  readonly postedAt: string | null;
  readonly isAnnouncement: boolean;
  /** `null` means Canvas did not report a count - UNKNOWN, never zero. A topic
   * we have no count for is read rather than skipped, because skipping on
   * unknown would silently shrink the evidence. */
  readonly subentryCount: number | null;
  readonly locked: boolean;
}

export interface AnnouncementRow {
  readonly id: number;
  readonly title: string;
  readonly message: string;
  readonly postedAt: string | null;
}

export interface ConversationIndexRow {
  readonly id: number;
  readonly subject: string;
  readonly participantIds: readonly number[];
  readonly messageCount: number;
  readonly lastMessageAt: string | null;
}

export interface DiscussionPostRow {
  readonly text: string;
  readonly createdAt: string | null;
  readonly isReply: boolean;
  readonly parentUserId: number | null;
}

export interface DiscussionStudentRow {
  readonly userId: number;
  readonly discussion?: {
    readonly initialPosts: readonly DiscussionPostRow[];
    readonly replies: readonly DiscussionPostRow[];
  };
}

export interface DiscussionTopicRead {
  readonly students: readonly DiscussionStudentRow[];
}

export interface ConversationMessageRow {
  readonly id: number;
  readonly authorId: number | null;
  readonly body: string;
  readonly createdAt: string | null;
}

export interface ConversationDetailRead {
  readonly id: number;
  readonly subject: string;
  readonly messages: readonly ConversationMessageRow[];
}

/** Stratum A's readers, already bound by the caller to one course's
 * credentials. Nothing here fans out per student, per assignment or per
 * topic. */
export interface CourseIntelSignalReaders {
  readonly listAssignmentBriefs: () => Promise<readonly AssignmentBriefRow[]>;
  readonly listRoster: () => Promise<readonly RosterRow[]>;
  readonly listGradeSummaries: () => Promise<readonly GradeSummaryRow[]>;
  readonly listSubmissionGrid: (assignmentIds: readonly string[]) => Promise<SubmissionGridResult>;
  readonly listTopicBriefs: () => Promise<readonly TopicBriefRow[]>;
  readonly listAnnouncements: () => Promise<readonly AnnouncementRow[]>;
  readonly listConversationIndex: () => Promise<readonly ConversationIndexRow[]>;
}

/** Stratum B's readers - the two that fan out, and the two a concern question
 * must never touch. */
export interface CourseIntelTextReaders {
  readonly fetchDiscussionTopic: (topicId: string) => Promise<DiscussionTopicRead>;
  readonly getConversationDetail: (conversationId: number) => Promise<ConversationDetailRead>;
}

// ---------------------------------------------------------------------------
// Results.
// ---------------------------------------------------------------------------

export interface CourseIntelSignalsBundle {
  readonly roster: readonly RosterEntryInput[];
  readonly grades: SourceInput<GradeSummaryInput>;
  readonly submissions: SourceInput<SubmissionFactInput>;
  readonly messageThreads: SourceInput<MessageThreadInput>;
  readonly assignments: readonly CourseAssignmentBrief[];
  readonly announcements: readonly CourseAnnouncementBrief[];
  readonly omissions: readonly AssemblyOmission[];
  /** The topic inventory. Stratum A's own product and the thing the text tier
   * decides from WITHOUT ever calling /view - which is what makes skipping
   * empty topics free. */
  readonly topics: readonly TopicBriefRow[];
  /** The conversation index, kept so the text tier can pick the conversations
   * one student is actually in rather than reading the whole inbox. */
  readonly conversations: readonly ConversationIndexRow[];
  /** Null when the grid was never read (the assignment list failed first).
   * Surfaced rather than folded into an omission: the fallback firing is not
   * missing data, it is a different, slower path, and the instructor's answer
   * is complete either way. */
  readonly submissionGridSource: SubmissionGridResult["source"] | null;
}

export interface CourseIntelTextBundle {
  readonly discussion: SourceInput<DiscussionEntryInput>;
  readonly messageBodies: SourceInput<MessageBodyInput>;
  readonly omissions: readonly AssemblyOmission[];
}

/** The reason string attached to a `not-fetched` Presence when a question's
 * own shape means the text tier never ran. Never rendered as "none found" -
 * see Presence in ./types for why those two must stay distinguishable. */
export const TEXT_NOT_FETCHED_REASON =
  "this question was answered from Canvas grade and submission signals alone, so no student writing was read";

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/**
 * A caught value, made safe to show an instructor and to persist.
 *
 * Run through redactSensitiveText because a Canvas or transport failure can
 * carry a request URL, and this app sends its model API key as a URL query
 * parameter - so a URL in an error string is itself a secret. Truncated after
 * redaction, never before: slicing first can cut a secret in half and leave
 * the front of it in the message.
 */
function describeFailure(err: unknown): string {
  const raw = err instanceof Error ? err.message : "an unexpected error";
  return redactSensitiveText(raw.trim(), 200) || "an unexpected error";
}

/**
 * Resolve `work`, or reject once `ms` have passed.
 *
 * WHY THIS EXISTS AT ALL: the LLM client in this repo has NO fetch timeout of
 * any kind, and its retry ladder can sleep roughly nine seconds of backoff
 * across five attempts on top of however long five network round trips take -
 * against a 60-second platform cap, with nothing upstream bounding it. It also
 * takes no AbortSignal, so nothing can cancel it.
 *
 * SO BE PRECISE ABOUT WHAT THIS DOES. It bounds the CALLER'S WAIT, not the
 * work. The abandoned request keeps running until the function ends; what
 * changes is that the caller gets to return a worded error instead of being
 * killed by the platform with no response at all. Claiming a cancellation this
 * cannot perform would be the kind of guarantee that fails silently.
 *
 * Promise.race subscribes to `work`, so a late rejection is still handled and
 * never surfaces as an unhandled rejection.
 *
 * Lives here rather than in the route because this is the feature's I/O
 * module, and because a bound that only exists inside a Next route handler
 * cannot be tested for the behaviour it promises.
 */
export function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  const signal = AbortSignal.timeout(ms);
  const timeout = new Promise<never>((_, reject) => {
    const fail = () =>
      reject(new Error(`${label} did not finish within ${Math.round(ms / 1000)} seconds`));
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  });
  return Promise.race([work, timeout]);
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function settledReason(result: PromiseSettledResult<unknown>): string | null {
  return result.status === "rejected" ? describeFailure(result.reason) : null;
}

/** Newest first, with an unknown date sorted last rather than treated as very
 * old - an item Canvas gave no timestamp for is not evidence of age. */
function byRecencyDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? 1 : -1;
}

// ---------------------------------------------------------------------------
// Stratum A.
// ---------------------------------------------------------------------------

export interface FetchSignalsArgs {
  readonly readers: CourseIntelSignalReaders;
}

/**
 * Read every signal source for one course.
 *
 * TWO ROUND TRIPS, NOT SEVEN. The assignment list and the roster go first
 * because the rest depend on them: the submission grid's fallback path needs
 * assignment ids, and every rollup denominator needs the briefs. Then the
 * remaining five run concurrently, since they are genuinely independent and
 * every existing Canvas pipeline in this repo runs its independent reads one
 * after another for no reason.
 *
 * ONLY THE ROSTER IS FATAL. ./join's own JoinInput documents why the roster is
 * a plain array while everything else arrives wrapped in a Presence: an
 * assembly with no roster is not a degraded assembly, it is a failure the
 * caller should have reported instead. Every other source degrades to a
 * `failed` Presence plus a stated omission, so a course whose inbox read is
 * refused still gets a complete grades-and-submissions answer that says the
 * messages are missing (D17: a single-source failure is not a whole-answer
 * failure).
 */
export async function fetchCourseIntelSignals(args: FetchSignalsArgs): Promise<CourseIntelSignalsBundle> {
  const { readers } = args;
  const omissions: AssemblyOmission[] = [];

  const [rosterSettled, assignmentsSettled] = await Promise.allSettled([
    readers.listRoster(),
    readers.listAssignmentBriefs(),
  ]);

  if (rosterSettled.status === "rejected") {
    throw new Error(`the course roster could not be read (${describeFailure(rosterSettled.reason)})`);
  }

  // Explicit field-by-field, never a spread: the runtime value from
  // listCourseRoster carries a login id, and RosterRow does not declare one.
  // A spread would put it on the assembly and, from there, one careless step
  // from a prompt. See D13, and RosterRow's own doc above.
  const roster: RosterEntryInput[] = rosterSettled.value.map((row) => ({
    id: row.id,
    name: row.name,
    sortableName: row.sortableName,
  }));

  const assignmentRows = settledValue(assignmentsSettled);
  const assignmentsFailure = settledReason(assignmentsSettled);
  const assignments: CourseAssignmentBrief[] = (assignmentRows ?? []).map((row) => ({
    assignmentId: row.assignmentId,
    name: row.name,
    dueAt: row.dueAt,
    pointsPossible: row.pointsPossible,
    published: row.published,
    omitFromFinalGrade: row.omitFromFinalGrade,
  }));
  if (assignmentsFailure) {
    omissions.push({
      kind: "source-failed",
      detail: `The course's assignment list could not be read (${assignmentsFailure}), so no assignment context and no missing-work counts are in this answer.`,
    });
  }

  const assignmentIds = assignments.map((a) => a.assignmentId);
  const pointsByAssignment = new Map<string, number | null>(
    assignments.map((a) => [a.assignmentId, a.pointsPossible])
  );

  // The grid is SKIPPED, not attempted, when the assignment list failed. Both
  // numbers in "missing 4 of 7" come from the denominator set, and that set is
  // established from the briefs (published, not omitted from the final grade,
  // due date already past). With no briefs, isConsideredForMissing considers
  // nothing, and every student would render as "0 of 0 assignments missing" -
  // a sentence that reads like good news and is really "we did not look". The
  // Presence type exists to keep those two apart; this is the branch that
  // honours it.
  const gridPromise: Promise<SubmissionGridResult | null> = assignmentsFailure
    ? Promise.resolve(null)
    : readers.listSubmissionGrid(assignmentIds);

  const [gradesSettled, gridSettled, topicsSettled, announcementsSettled, conversationsSettled] =
    await Promise.allSettled([
      readers.listGradeSummaries(),
      gridPromise,
      readers.listTopicBriefs(),
      readers.listAnnouncements(),
      readers.listConversationIndex(),
    ]);

  // Grades.
  let grades: SourceInput<GradeSummaryInput>;
  const gradesFailure = settledReason(gradesSettled);
  if (gradesFailure) {
    grades = { state: "failed", reason: gradesFailure };
    omissions.push({
      kind: "source-failed",
      detail: `Course scores could not be read from Canvas (${gradesFailure}).`,
    });
  } else {
    grades = {
      state: "loaded",
      value: (settledValue(gradesSettled) ?? []).map((row) => ({
        userId: row.userId,
        name: row.name,
        currentScore: row.currentScore,
        finalScore: row.finalScore,
      })),
    };
  }

  // Submissions.
  let submissions: SourceInput<SubmissionFactInput>;
  let submissionGridSource: SubmissionGridResult["source"] | null = null;
  const gridFailure = settledReason(gridSettled);
  if (assignmentsFailure) {
    submissions = {
      state: "failed",
      reason: "the course's assignment list could not be read, so submissions could not be placed against their assignments",
    };
  } else if (gridFailure) {
    submissions = { state: "failed", reason: gridFailure };
    omissions.push({
      kind: "source-failed",
      detail: `Submission records could not be read from Canvas (${gridFailure}).`,
    });
  } else {
    const grid = settledValue(gridSettled);
    submissionGridSource = grid?.source ?? null;
    submissions = {
      state: "loaded",
      value: (grid?.rows ?? []).map((row) => ({
        userId: row.userId,
        assignmentId: row.assignmentId,
        score: row.score,
        // Not on the submission row - it is a property of the assignment, and
        // taking it from the brief keeps one source of truth for it.
        pointsPossible: pointsByAssignment.get(row.assignmentId) ?? null,
        workflowState: row.workflowState,
        submittedAt: row.submittedAt,
        late: row.late,
        missing: row.missing,
        excused: row.excused,
        dueAt: row.dueAt,
        dueAtPresent: row.dueAtPresent,
      })),
    };
  }

  // Topics.
  const topicsFailure = settledReason(topicsSettled);
  const topics = settledValue(topicsSettled) ?? [];
  if (topicsFailure) {
    omissions.push({
      kind: "source-failed",
      detail: `The course's discussion topics could not be listed (${topicsFailure}), so no discussion writing is in this answer.`,
    });
  }

  // Announcements. Class context, attributable to nobody (AC2).
  const announcementsFailure = settledReason(announcementsSettled);
  const announcements: CourseAnnouncementBrief[] = (settledValue(announcementsSettled) ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    postedAt: row.postedAt,
    text: row.message,
  }));
  if (announcementsFailure) {
    omissions.push({
      kind: "source-failed",
      detail: `The course's announcements could not be read (${announcementsFailure}).`,
    });
  }

  // Conversations - the cheap index only. Identity and counts, no bodies.
  const conversationsFailure = settledReason(conversationsSettled);
  const conversations = settledValue(conversationsSettled) ?? [];
  let messageThreads: SourceInput<MessageThreadInput>;
  if (conversationsFailure) {
    messageThreads = { state: "failed", reason: conversationsFailure };
    omissions.push({
      kind: "source-failed",
      detail: `The course's Canvas messages could not be listed (${conversationsFailure}).`,
    });
  } else {
    const rosterIds = new Set<CanvasUserId>();
    for (const entry of roster) {
      const id = normaliseUserId(entry.id);
      if (id !== null) rosterIds.add(id);
    }
    const threads: MessageThreadInput[] = [];
    const offRoster = new Set<CanvasUserId>();
    for (const conversation of conversations) {
      for (const rawId of conversation.participantIds) {
        const userId = normaliseUserId(rawId);
        if (userId === null) continue;
        if (!rosterIds.has(userId)) {
          // EVERY conversation contains the instructor themselves, and the
          // list endpoint carries no self id to subtract. Attributing these
          // ids anyway would put the instructor on their own course's concern
          // list as a student with no submissions - so participants who are
          // not enrolled students are counted and reported rather than
          // rendered as people.
          offRoster.add(userId);
          continue;
        }
        threads.push({
          userId,
          conversationId: conversation.id,
          subject: conversation.subject,
          lastMessageAt: conversation.lastMessageAt,
          messageCount: conversation.messageCount,
        });
      }
    }
    messageThreads = { state: "loaded", value: threads };
    if (offRoster.size > 0) {
      omissions.push({
        kind: "off-roster-participant",
        detail:
          "Some message participants are not enrolled students in this course - the instructor's own account, a TA, an observer, or a student who has since dropped. Their messages are counted here but are not reported as a student's activity.",
        count: offRoster.size,
      });
    }
  }

  return {
    roster,
    grades,
    submissions,
    messageThreads,
    assignments,
    announcements,
    omissions,
    topics,
    conversations,
    submissionGridSource,
  };
}

// ---------------------------------------------------------------------------
// Stratum B.
// ---------------------------------------------------------------------------

export interface FetchTextArgs {
  readonly readers: CourseIntelTextReaders;
  readonly signals: CourseIntelSignalsBundle;
  /** The one student the question is about. Every text-tier shape is
   * per-student (D7), so there is no whole-course text path to build. */
  readonly subjectUserId: CanvasUserId;
  /**
   * Absolute epoch milliseconds. New fan-out work stops being STARTED as this
   * approaches - see TEXT_ITEM_RESERVE_MS. Not a timeout on work already in
   * flight: nothing here can cancel a request canvasFetch has already dialled,
   * and pretending otherwise would be the kind of guarantee that fails
   * silently.
   */
  readonly deadlineMs: number;
  readonly maxTopics?: number;
  readonly maxConversations?: number;
  /** The clock, as a parameter - the same discipline ./join and ./concern
   * already keep. A test can then drive the deadline deterministically instead
   * of racing a real one. */
  readonly now?: () => number;
}

interface FanOutOutcome<T> {
  readonly value: T | null;
  readonly failure: string | null;
  readonly skippedForDeadline: boolean;
}

/**
 * Run one fan-out item, or refuse to start it.
 *
 * THE DEADLINE CHECK HAPPENS BEFORE THE CALL, which is the whole point. A
 * platform kill mid-run delivers no response at all - not a partial one, not
 * an error - so the only workable design is to stop starting work while there
 * is still time to answer with what has already arrived. An item refused here
 * becomes a stated omission; an item that runs past the wall becomes a blank
 * screen.
 */
async function runFanOutItem<T>(
  run: () => Promise<T>,
  now: () => number,
  deadlineMs: number
): Promise<FanOutOutcome<T>> {
  if (now() + TEXT_ITEM_RESERVE_MS > deadlineMs) {
    return { value: null, failure: null, skippedForDeadline: true };
  }
  try {
    return { value: await run(), failure: null, skippedForDeadline: false };
  } catch (err) {
    return { value: null, failure: describeFailure(err), skippedForDeadline: false };
  }
}

/**
 * Read the text tier for one student.
 *
 * THE THREE LEVERS, IN THE ORDER THEY ARE WORTH APPLYING (D2):
 *
 *  1. SKIP TOPICS CANVAS ALREADY SAID HAVE NO REPLIES. Free - the count rides
 *     the Stratum A topic inventory - and it settles at runtime the question
 *     the survey could not settle from source. Only a literal 0 skips: `null`
 *     is "Canvas did not report a count", and skipping on unknown would
 *     silently shrink the evidence.
 *  2. CAP AT THE MOST RECENT REPLY-BEARING TOPICS. A /view response is
 *     unpaginated and untruncated on this app's side, so a busy term's worth
 *     of threads is the one input that can grow without bound.
 *  3. FAN OUT CONCURRENTLY. These calls are independent and every existing
 *     Canvas pipeline in this repo makes them one at a time.
 *
 * NARROWING TO ONE STUDENT DOES NOT REDUCE THE DISCUSSION CALL COUNT and it is
 * worth being clear about that rather than implying otherwise: Canvas has no
 * "one student's entries in a course" endpoint, /view returns the whole
 * thread, and the cost is per TOPIC either way. Narrowing cuts the MESSAGE
 * side sharply (only conversations that student is in), and it cuts prompt
 * SIZE everywhere, because ./context-block renders only the students in scope.
 *
 * Other students' entries ARE kept in the assembly even though only the
 * subject's are ever rendered into a prompt. They are what make "nobody has
 * replied to this student" computable - a real signal an instructor cares
 * about that is only visible from the other side of the edge.
 */
export async function fetchCourseIntelText(args: FetchTextArgs): Promise<CourseIntelTextBundle> {
  const { readers, signals, subjectUserId } = args;
  const now = args.now ?? Date.now;
  const maxTopics = args.maxTopics ?? DEFAULT_MAX_TEXT_TOPICS;
  const maxConversations = args.maxConversations ?? DEFAULT_MAX_TEXT_CONVERSATIONS;
  const omissions: AssemblyOmission[] = [];

  const rosterIds = new Set<CanvasUserId>();
  for (const entry of signals.roster) {
    const id = normaliseUserId(entry.id);
    if (id !== null) rosterIds.add(id);
  }

  // ---- topics -------------------------------------------------------------

  // Announcement replies are reachable with the existing reader (an
  // announcement IS a discussion topic and its id IS a topic id) and are CUT
  // from this feature by D11 - announcements are usually locked for comment
  // and each one costs a call to discover that. Reported rather than dropped
  // in silence, using the nearest kind the shared AssemblyOmissionKind
  // vocabulary offers: that union lives in ./types, is consumed by four
  // modules, and inventing a kind here would be a contract change smuggled in
  // as a detail string.
  const announcementTopicsWithReplies = signals.topics.filter(
    (topic) => topic.isAnnouncement && (topic.subentryCount === null || topic.subentryCount > 0)
  );
  if (announcementTopicsWithReplies.length > 0) {
    omissions.push({
      kind: "topic-over-cap",
      detail:
        "Replies to announcements were not read. They are reachable, but announcements are usually closed for comment and each one costs a separate read to find that out.",
      count: announcementTopicsWithReplies.length,
    });
  }

  const discussionTopics = signals.topics.filter((topic) => !topic.isAnnouncement);
  const emptyTopics = discussionTopics.filter((topic) => topic.subentryCount === 0);
  if (emptyTopics.length > 0) {
    omissions.push({
      kind: "topic-skipped-no-replies",
      detail:
        "Discussion topics that Canvas reports as having no replies were not read. Reading them could not have added anything.",
      count: emptyTopics.length,
    });
  }

  const replyBearing = discussionTopics
    .filter((topic) => topic.subentryCount !== 0)
    .sort((a, b) => byRecencyDesc(a.postedAt, b.postedAt));
  const selectedTopics = replyBearing.slice(0, maxTopics);
  if (replyBearing.length > selectedTopics.length) {
    omissions.push({
      kind: "topic-over-cap",
      detail: `Only the ${selectedTopics.length} most recent discussion topics with replies were read; ${
        replyBearing.length - selectedTopics.length
      } older one(s) were not.`,
      count: replyBearing.length - selectedTopics.length,
    });
  }

  const topicResults = await mapWithConcurrency(
    [...selectedTopics],
    TEXT_FANOUT_CONCURRENCY,
    async (topic) => ({
      topic,
      outcome: await runFanOutItem(
        () => readers.fetchDiscussionTopic(String(topic.id)),
        now,
        args.deadlineMs
      ),
    })
  );

  const discussionEntries: DiscussionEntryInput[] = [];
  let topicsFailed = 0;
  let topicsSkippedForTime = 0;
  let firstTopicFailure: string | null = null;
  for (const { topic, outcome } of topicResults) {
    if (outcome.skippedForDeadline) {
      topicsSkippedForTime += 1;
      continue;
    }
    if (outcome.failure !== null || !outcome.value) {
      topicsFailed += 1;
      if (firstTopicFailure === null) firstTopicFailure = outcome.failure;
      continue;
    }
    for (const student of outcome.value.students) {
      const userId = normaliseUserId(student.userId);
      if (userId === null || !rosterIds.has(userId)) continue;
      const activity = student.discussion;
      if (!activity) continue;
      const ordered = [...activity.initialPosts, ...activity.replies];
      ordered.forEach((post, position) => {
        discussionEntries.push({
          userId,
          // Opaque and source-qualified. The model never sees it - it sees a
          // [T3] marker resolved by index, because titles are not unique and
          // neither are names.
          id: `topic:${topic.id}:u${userId}:${position}`,
          kind: post.isReply ? "discussion-reply" : "discussion-post",
          container: topic.title,
          createdAt: post.createdAt,
          parentUserId: post.parentUserId === null ? null : normaliseUserId(post.parentUserId),
          text: post.text,
        });
      });
    }
  }

  if (topicsFailed > 0) {
    omissions.push({
      kind: "topic-failed",
      detail: `${topicsFailed} discussion topic(s) could not be read${
        firstTopicFailure ? ` (${firstTopicFailure})` : ""
      }. Everything else in this answer is complete.`,
      count: topicsFailed,
    });
  }
  if (topicsSkippedForTime > 0) {
    omissions.push({
      kind: "topic-over-cap",
      detail: `${topicsSkippedForTime} discussion topic(s) were not read because this request ran out of its time budget. Ask again to read them.`,
      count: topicsSkippedForTime,
    });
  }

  // ---- conversations ------------------------------------------------------

  const subjectConversations = signals.conversations
    .filter((conversation) =>
      conversation.participantIds.some((id) => normaliseUserId(id) === subjectUserId)
    )
    .sort((a, b) => byRecencyDesc(a.lastMessageAt, b.lastMessageAt));
  const selectedConversations = subjectConversations.slice(0, maxConversations);
  if (subjectConversations.length > selectedConversations.length) {
    omissions.push({
      kind: "conversation-not-fetched",
      detail: `Only the ${selectedConversations.length} most recent message threads with this student were read; ${
        subjectConversations.length - selectedConversations.length
      } older one(s) were not.`,
      count: subjectConversations.length - selectedConversations.length,
    });
  }

  const conversationResults = await mapWithConcurrency(
    [...selectedConversations],
    TEXT_FANOUT_CONCURRENCY,
    async (conversation) => ({
      conversation,
      outcome: await runFanOutItem(
        () => readers.getConversationDetail(conversation.id),
        now,
        args.deadlineMs
      ),
    })
  );

  const messageBodies: MessageBodyInput[] = [];
  let conversationsFailed = 0;
  let conversationsSkippedForTime = 0;
  let firstConversationFailure: string | null = null;
  for (const { conversation, outcome } of conversationResults) {
    if (outcome.skippedForDeadline) {
      conversationsSkippedForTime += 1;
      continue;
    }
    if (outcome.failure !== null || !outcome.value) {
      conversationsFailed += 1;
      if (firstConversationFailure === null) firstConversationFailure = outcome.failure;
      continue;
    }
    for (const message of outcome.value.messages) {
      const userId = normaliseUserId(message.authorId);
      // The instructor's own messages in the thread are theirs, not a
      // student's writing, and framing them as student-authored evidence
      // would be a small lie with a large downstream effect - the framing
      // header tells the model everything in STUDENT CONTENT was written by
      // third parties whose claims are never findings.
      if (userId === null || !rosterIds.has(userId)) continue;
      if (!message.body.trim()) continue;
      messageBodies.push({
        userId,
        id: `conversation:${conversation.id}:m${message.id}`,
        kind: "message",
        container: outcome.value.subject || conversation.subject,
        createdAt: message.createdAt,
        // A conversation is a thread, not a reply tree: Canvas's message
        // objects carry no parent author, so this is null rather than
        // guessed at from position.
        parentUserId: null,
        text: message.body,
      });
    }
  }

  if (conversationsFailed > 0) {
    omissions.push({
      kind: "conversation-failed",
      detail: `${conversationsFailed} message thread(s) could not be read${
        firstConversationFailure ? ` (${firstConversationFailure})` : ""
      }.`,
      count: conversationsFailed,
    });
  }
  if (conversationsSkippedForTime > 0) {
    omissions.push({
      kind: "conversation-not-fetched",
      detail: `${conversationsSkippedForTime} message thread(s) were not read because this request ran out of its time budget. Ask again to read them.`,
      count: conversationsSkippedForTime,
    });
  }

  return {
    discussion: { state: "loaded", value: discussionEntries },
    messageBodies: { state: "loaded", value: messageBodies },
    omissions,
  };
}

/**
 * The text-tier shape a question that never asked for prose must carry.
 *
 * `not-fetched`, never `none`. A student with no discussion posts and a
 * student whose posts this tier chose not to read are different facts, and
 * ./context-block renders them differently on purpose ("none found" versus
 * "not fetched (reason)"). Collapsing them is how a quiet student gets
 * reported as absent from a course they were never looked at in.
 */
export function notFetchedTextBundle(reason: string = TEXT_NOT_FETCHED_REASON): CourseIntelTextBundle {
  return {
    discussion: { state: "not-fetched", reason },
    messageBodies: { state: "not-fetched", reason },
    omissions: [],
  };
}
