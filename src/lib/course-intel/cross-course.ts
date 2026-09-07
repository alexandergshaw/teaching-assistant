// course-intel: ONE ANSWER OVER MANY COURSES - what each course contributed,
// how it was read, and what the deadline cut.
//
// D24c added a third scope: "what courses have had the least amount of items
// turned in late" names no course and is about all of them. D24d is why that
// is affordable and D24e is why it is dangerous, and this module is where both
// live.
//
// -------------------------------------------------------------------------
// THE COST PROBLEM, AND THE THREE THINGS THAT MAKE IT SURVIVABLE (D24d)
// -------------------------------------------------------------------------
//
// One course's signals tier is roughly 6 to 16 Canvas calls. N live courses is
// N times that against the same 60-second platform cap.
//
//   - SIGNALS ONLY, NEVER STUDENT TEXT. `readLiveCourseSlice` below is handed
//     `CourseIntelSignalReaders` and nothing else, so the expensive per-topic
//     and per-conversation tier is not merely skipped here, it is unreachable
//     by type. That is not a compromise: no phrasing of a cross-course
//     question needs a student's prose, and the text tier exists for
//     single-student questions where it was always the point.
//   - OFFLINE COURSES COST ZERO CANVAS CALLS, so `assembleCrossCourseSlices`
//     builds EVERY course's recorded slice first, before it starts any live
//     read at all. Whatever the deadline cuts is therefore live work, and the
//     recorded half of a mixed answer is always complete - which inverts the
//     usual expectation that offline is the degraded path.
//   - A PER-COURSE SOFT DEADLINE, and BOUNDED CONCURRENCY across live courses
//     (see `CROSS_COURSE_LIVE_CONCURRENCY`) rather than one at a time - strict
//     serialization let the deadline cut courses purely because of the order
//     they happened to be read in, which defeats the point of having a budget
//     at all. A course is not STARTED once the budget is spent. A course that
//     did not fit keeps the recorded slice it already had and is REPORTED,
//     never dropped.
//
// -------------------------------------------------------------------------
// A RANKING THAT SILENTLY OMITS COURSES IS WORSE THAN A LIST THAT DOES (D24e)
// -------------------------------------------------------------------------
//
// "Which courses have the least late work" is a superlative, and the SHAPE of
// a superlative asserts that everything was considered. Two of five courses
// timing out does not make the answer partial - it makes it confidently wrong,
// with nothing in how it reads revealing that.
//
// So this module does two things that are not optional:
//
//   1. `describeCourseCoverage` renders which courses were covered and in
//      which mode ALWAYS, not only when something failed, as a code-authored
//      fact the view renders itself. It is never something the model may
//      mention or forget.
//   2. `superlativeBasis` is "complete" only when every course in the answer
//      had its intended source read, was read the SAME WAY, and produced the
//      counts. Anything else is "partial", and the prompt
//      (./cross-course-prompt) then forbids a bare superlative outright.
//
// WHY "READ THE SAME WAY" IS PART OF IT, and not fussiness. A live course's
// late count is Canvas's own `late` flag over published assignments past their
// due date. A recorded course's late count is measured against deadlines the
// instructor typed, over assessments they declared a tool for. Those are
// different measurements of different denominators. Ranking one against the
// other produces a number-shaped answer with no meaning, which is exactly the
// failure D24e names.
//
// -------------------------------------------------------------------------
// TWO CONTRACT CONSEQUENCES
// -------------------------------------------------------------------------
//
//   - THE CONNECTION MODE IS PER COURSE (D24f). `LmsConnection` was added
//     assuming one course per answer; a cross-course answer mixes live and
//     recorded courses in one response, so every slice carries its own. It is
//     the ONLY place a slice records how it was read - `courseReadMode` below
//     derives the label from it rather than storing a second field that could
//     disagree with the first.
//   - A STUDENT INDEX MUST BE UNAMBIGUOUS WITHIN THE ANSWER, not within one
//     course's assembly (D24g). Each course numbers its own students from 1,
//     so S3 in two courses would collide in one response.
//     ./cross-course-prompt owns the offsetting; this module keeps every
//     slice's indices COURSE-LOCAL so there is exactly one place that shifts
//     them.
//
// NOT A PURE LEAF - `assembleCrossCourseSlices` is an orchestrator and awaits
// work. But it reads no clock and no environment of its own: `now`,
// `withDeadline` and the failure classifier all arrive as parameters, so the
// deadline behaviour this module exists for is testable with no timers.

import { buildCourseIntelAssembly } from "./join";
import { computeConcernSet } from "./concern";
import {
  assembleOfflineCourseIntel,
  type AssembleOfflineCourseIntelArgs,
  type OfflineCourseIntel,
} from "./offline-assembly";
import {
  fetchCourseIntelSignals,
  notFetchedTextBundle,
  type CourseIntelSignalReaders,
} from "./fetch";
import type {
  CanvasUserId,
  ConcernRow,
  ConcernThresholds,
  CourseStudentRecord,
  LmsConnection,
  StudentIndex,
} from "./types";

/**
 * How one course in an answer was actually read. Rendered to the instructor
 * for every course, every time.
 *
 * `recorded` and `lms-unavailable` are BOTH answers built from recorded work,
 * and separating them is the point: the first is a course that never had an
 * LMS to read and is therefore complete, the second is a course whose LMS read
 * was attempted and did not happen. Only the second is a gap.
 */
export type CourseReadMode = "live" | "recorded" | "lms-unavailable";

/** Derived from the connection, never stored beside it: two fields saying the
 *  same thing are two fields that can disagree, and this one decides both what
 *  the instructor is told and whether a superlative is allowed. */
export function courseReadMode(connection: LmsConnection): CourseReadMode {
  if (connection.state === "live") return "live";
  return connection.reason === "no-lms-course" ? "recorded" : "lms-unavailable";
}

/**
 * One course's contribution to a comparison, computed in TypeScript.
 *
 * EVERY COUNT IS NULLABLE AND `null` NEVER MEANS ZERO. A course whose late
 * count could not be computed is not a course with no late work, and rendering
 * the two the same way is the confusion the whole `Presence` design exists to
 * prevent - promoted here to the level a RANKING needs it at, because "the
 * course with the least late work" is precisely the sentence a zero-for-null
 * substitution would make false while looking right.
 */
export interface CourseSignalRollup {
  /** People this course's own list yielded. */
  readonly students: number;
  /** Students whose submission record was actually loaded. THE DENOMINATOR of
   *  every count below, and never assumed equal to `students`. */
  readonly studentsMeasured: number;
  readonly consideredSubmissions: number | null;
  readonly missing: number | null;
  readonly late: number | null;
  readonly graded: number | null;
  readonly awaitingGrade: number | null;
  readonly concernRows: number;
  readonly insufficientData: number;
  readonly clear: number;
}

/** Index-to-name for one course's students, for the instructor's OWN browser.
 *  The model is never shown either field. */
export interface CourseStudentLabel {
  readonly index: StudentIndex;
  readonly name: string;
  readonly userId: CanvasUserId | null;
}

/** One course, as it appears in one answer. */
export interface CrossCourseSlice {
  readonly courseId: string;
  /** For the instructor's own browser and for the coverage statement. NEVER
   *  composed into a prompt - see ./course-scope's header. */
  readonly name: string;
  /** D24f: PER COURSE, because one answer mixes them. */
  readonly connection: LmsConnection;
  readonly rollup: CourseSignalRollup;
  /** COURSE-LOCAL indices. ./cross-course-prompt offsets them into the
   *  answer's own numbering; nothing else may. */
  readonly concernRows: readonly ConcernRow[];
  readonly students: readonly CourseStudentLabel[];
}

function countInsufficient(rows: readonly ConcernRow[]): number {
  return rows.filter((row) => row.signals.some((signal) => signal.kind === "insufficient-data")).length;
}

/**
 * Roll one live course's per-student submission facts up into one row.
 *
 * ALL-OR-NULL, never a partial sum presented as a total: when not one student
 * in the course had their submissions loaded there is no denominator, so every
 * count is null rather than a confident 0. When SOME did, the counts are real
 * and `studentsMeasured` is what they are over - which the rendered line
 * states, so "18 assignments missing" is never read as covering a class of 30
 * when it covers 12 of them.
 */
export function rollupFromStudentRecords(
  students: readonly CourseStudentRecord[],
  concernRows: readonly ConcernRow[],
  clearCount: number
): CourseSignalRollup {
  let measured = 0;
  let considered = 0;
  let missing = 0;
  let late = 0;
  let graded = 0;
  let awaiting = 0;

  for (const student of students) {
    if (student.submissions.state !== "loaded") continue;
    const rollup = student.submissions.value.rollup;
    measured += 1;
    considered += rollup.consideredCount;
    missing += rollup.missingCount;
    late += rollup.lateCount;
    graded += rollup.gradedCount;
    awaiting += rollup.ungradedSubmittedCount;
  }

  const none = measured === 0;
  return {
    students: students.length,
    studentsMeasured: measured,
    consideredSubmissions: none ? null : considered,
    missing: none ? null : missing,
    late: none ? null : late,
    graded: none ? null : graded,
    awaitingGrade: none ? null : awaiting,
    concernRows: concernRows.length,
    insufficientData: countInsufficient(concernRows),
    clear: clearCount,
  };
}

/**
 * Roll one recorded course's assembly up into the same shape.
 *
 * MISSING AND LATE ARE GATED ON A REAL DENOMINATOR, and this is the honest
 * half of the offline story rather than a limitation to apologise for.
 * ./engagement computes them against assessments the instructor DECLARED a
 * deadline and an authoritative tool for; with no declaration, absence of a
 * row means nothing at all (D23a), and summing the zeros it emits would put a
 * course at the TOP of a "least late work" ranking for the sole reason that
 * nothing about it was measurable. So both are null unless at least one
 * assessment was soundly considered.
 *
 * `awaitingGrade` is ALWAYS null offline: a recorded row is work that was
 * graded, so there is no such thing here as a submission awaiting a grade, and
 * a 0 would read as an instructor with no backlog rather than as a question
 * this path cannot answer.
 */
export function rollupFromOfflineIntel(intel: OfflineCourseIntel): CourseSignalRollup {
  const rows = intel.concerns.rows;
  const considerable = intel.engagement.consideredAssessmentIds.length > 0;

  let missing = 0;
  let late = 0;
  let considered = 0;
  let measured = 0;
  if (considerable) {
    for (const row of intel.engagement.rows) {
      missing += row.metrics.missingCount;
      late += row.metrics.lateCount;
      considered += row.metrics.missingConsideredCount;
      if (row.metrics.missingConsideredCount > 0) measured += 1;
    }
  }

  const gradedRows = Math.max(
    0,
    intel.report.gradingRowCount - intel.report.gradingRowsOutsideCourseCount
  );

  return {
    students: intel.identity.students.length,
    studentsMeasured: measured,
    consideredSubmissions: considerable ? considered : null,
    missing: considerable ? missing : null,
    late: considerable ? late : null,
    graded: gradedRows,
    awaitingGrade: null,
    concernRows: rows.length,
    insufficientData: countInsufficient(rows),
    clear: intel.concerns.clearCount,
  };
}

// ---------------------------------------------------------------------------
// Building one course's slice.
// ---------------------------------------------------------------------------

export interface ReadLiveCourseSliceArgs {
  readonly courseId: string;
  readonly name: string;
  readonly institution: string;
  readonly canvasCourseId: string;
  /**
   * What the assembly records as this course's name.
   *
   * A MARKER, NOT A NAME, at every call site in this feature: the assembly's
   * `courseName` has exactly one consumer, ./context-block, which renders it
   * straight into the signals block a third-party model reads. See
   * ./course-scope's header for why a course name there is both a disclosure
   * and a false precision.
   */
  readonly promptLabel: string;
  readonly assembledAt: string;
  /**
   * SIGNALS READERS ONLY. The absence of the text readers is D24d's guarantee
   * made structural: this function cannot fetch a discussion topic or a
   * conversation body, because it was never given anything that could.
   */
  readonly readers: CourseIntelSignalReaders;
  readonly thresholds: ConcernThresholds;
}

/** Read one course live, at the signals tier, and roll it up. Throws whatever
 *  the readers throw - the orchestrator classifies it. */
export async function readLiveCourseSlice(args: ReadLiveCourseSliceArgs): Promise<CrossCourseSlice> {
  const signals = await fetchCourseIntelSignals({ readers: args.readers });
  const emptyText = notFetchedTextBundle();
  const assembly = buildCourseIntelAssembly({
    courseHubId: args.courseId,
    institution: args.institution,
    canvasCourseId: args.canvasCourseId,
    courseName: args.promptLabel,
    assembledAt: args.assembledAt,
    tier: "signals",
    roster: signals.roster,
    grades: signals.grades,
    submissions: signals.submissions,
    discussion: emptyText.discussion,
    messageThreads: signals.messageThreads,
    messageBodies: emptyText.messageBodies,
    assignments: signals.assignments,
    announcements: signals.announcements,
    omissions: signals.omissions,
  });

  const concerns = computeConcernSet({
    students: assembly.students,
    thresholds: args.thresholds,
    now: assembly.assembledAt,
  });

  return {
    courseId: args.courseId,
    name: args.name,
    connection: { state: "live" },
    rollup: rollupFromStudentRecords(assembly.students, concerns.rows, concerns.clearCount),
    concernRows: concerns.rows,
    students: assembly.students.map((student) => ({
      index: student.index,
      name: student.name,
      userId: student.userId,
    })),
  };
}

export interface ReadRecordedCourseSliceArgs {
  readonly name: string;
  /** Which of D20a's states this course is in when no live read is attempted.
   *  Overwritten by the orchestrator for any course that HAS a live read. */
  readonly connection: LmsConnection;
  /** Passed through whole rather than re-spelled field by field, so this
   *  module cannot drift from the offline assembly's own contract. */
  readonly sources: AssembleOfflineCourseIntelArgs;
}

/**
 * Build one course's slice from the instructor's own recorded work.
 *
 * ZERO LMS CALLS AND SYNCHRONOUS, which is the property the whole ordering in
 * `assembleCrossCourseSlices` rests on: this cannot time out, cannot fail
 * against a network, and therefore cannot be the thing a deadline cuts.
 */
export function readRecordedCourseSlice(args: ReadRecordedCourseSliceArgs): CrossCourseSlice {
  const intel = assembleOfflineCourseIntel(args.sources);
  return {
    courseId: args.sources.courseHubId,
    name: args.name,
    connection: args.connection,
    rollup: rollupFromOfflineIntel(intel),
    concernRows: intel.concerns.rows,
    students: intel.identity.students.map((student) => ({
      index: student.index,
      name: student.name,
      userId: student.userId,
    })),
  };
}

// ---------------------------------------------------------------------------
// The orchestration.
// ---------------------------------------------------------------------------

/**
 * The detail carried by a course whose live read the budget cut.
 *
 * Reported as `budget-cut`, NOT `unreachable`. `unreachable` means an attempt
 * was made and something about reaching Canvas went wrong - a real,
 * investigable fault. A course the deadline stopped this request from even
 * starting is neither faulty nor unreachable, and reporting it as the former
 * sends an instructor to debug a network problem that was never there.
 * `budget-cut` says nothing about the remote host, so unlike `unreachable` it
 * is free to carry a plain, specific detail (see types.ts's header on that
 * member).
 */
export const LIVE_NOT_IN_BUDGET_DETAIL =
  "This course was not read from Canvas because the request ran out of its time budget first.";

const BUDGET_CUT_CONNECTION: LmsConnection = Object.freeze({
  state: "unavailable",
  reason: "budget-cut",
  detail: LIVE_NOT_IN_BUDGET_DETAIL,
});

export interface CrossCourseTask {
  readonly courseId: string;
  /** Zero LMS calls, and the reason a cut answer is still a complete one for
   *  every course that costs nothing. */
  readonly readRecorded: () => CrossCourseSlice;
  /** Null when this course has no LMS link at all, in which case the recorded
   *  slice IS the answer for it and nothing was cut. */
  readonly readLive: (() => Promise<CrossCourseSlice>) | null;
}

export interface AssembleCrossCourseArgs {
  /** In the instructor's own list order. The C-marker for a course is its
   *  position here, so the order must not depend on how fast anything read. */
  readonly tasks: readonly CrossCourseTask[];
  /** Absolute epoch milliseconds. A live read is not STARTED at or after this
   *  instant - the "stop before the wall" half of D24d, which is what turns a
   *  platform kill with no response at all into an answer with a stated gap. */
  readonly deadlineAtMs: number;
  /** The longest any single course may hold the whole request up. */
  readonly perCourseWaitMs: number;
  readonly now: () => number;
  readonly withDeadline: <T>(work: Promise<T>, ms: number, label: string) => Promise<T>;
  /** Turns a thrown live failure into the state it actually was. Injected
   *  because the classifier compares against a server-only credential constant
   *  BY IDENTITY (see ./connection). */
  readonly classifyLiveFailure: (error: unknown) => LmsConnection;
}

/**
 * How many live courses may be read from Canvas at once.
 *
 * BOUNDED, NOT UNBOUNDED. Fanning every live course out simultaneously would
 * make this feature's burst load on one instructor's Canvas token scale with
 * however many courses they happen to teach, which is not a cost this app may
 * impose on somebody else's rate limit merely because it can. Three is chosen
 * over a lower number because the live budget is normally several multiples of
 * one course's own per-course wait: three in flight lets a second wave of
 * courses start as soon as the first finishes, inside the same window that
 * strict sequencing would have spent reading only the first two or three
 * courses in the list. Three over four or five for the same reason the cap
 * exists at all - it is meant to stay a small, fixed number, not creep upward
 * every time this file is revisited.
 */
export const CROSS_COURSE_LIVE_CONCURRENCY = 3;

/** One course's live read, queued for the bounded worker pool below. Only
 *  courses that HAVE a live read at all are ever queued - a course with none
 *  keeps the connection `assembleCrossCourseSlices` already gave it in step 1
 *  and is never touched by this pool. */
interface QueuedLiveRead {
  readonly courseId: string;
  readonly run: () => Promise<CrossCourseSlice>;
}

/**
 * Run every queued live read, at most `CROSS_COURSE_LIVE_CONCURRENCY` at a
 * time, writing each result (or classified failure) into `slices` as it lands.
 *
 * A FIXED-SIZE POOL OF PULL WORKERS, not a fixed batch size. A worker that
 * finishes early immediately pulls the next queued course rather than waiting
 * for its batch-mates, so a slow course never idles a slot that a faster one
 * could have used - and the deadline check happens fresh, per course, right
 * before that course's own read starts, exactly as it did when this ran one
 * course at a time.
 *
 * COMPLETION ORDER IS NEVER OBSERVED HERE. `slices` is a map keyed by course
 * id and the caller re-reads it in the answer's own list order once every
 * worker is done, so which course happens to finish first changes nothing
 * about what the instructor sees.
 */
async function runLiveReads(
  queue: readonly QueuedLiveRead[],
  slices: Map<string, CrossCourseSlice>,
  args: Pick<AssembleCrossCourseArgs, "deadlineAtMs" | "perCourseWaitMs" | "now" | "withDeadline" | "classifyLiveFailure">
): Promise<void> {
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < queue.length) {
      const job = queue[cursor];
      cursor += 1;

      const fallback = slices.get(job.courseId);
      if (!fallback) continue;

      const remainingMs = args.deadlineAtMs - args.now();
      if (remainingMs <= 0) continue;

      try {
        const live = await args.withDeadline(
          job.run(),
          Math.min(args.perCourseWaitMs, remainingMs),
          "Reading a course from Canvas"
        );
        slices.set(job.courseId, live);
      } catch (err) {
        slices.set(job.courseId, { ...fallback, connection: args.classifyLiveFailure(err) });
      }
    }
  }

  const workerCount = Math.min(CROSS_COURSE_LIVE_CONCURRENCY, queue.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

/**
 * Build every course's slice for one answer.
 *
 * THE ORDER IS THE DESIGN, not an implementation detail:
 *
 *   1. EVERY recorded slice, first, for every course. Free, local, and
 *      synchronous, so the answer already holds everything that costs nothing
 *      before a single Canvas call is made - concurrency below only ever
 *      applies to step 2, and cannot reorder step 1 ahead of it.
 *   2. Then the live courses, up to `CROSS_COURSE_LIVE_CONCURRENCY` at a time,
 *      each still bounded by `perCourseWaitMs` and none STARTED past
 *      `deadlineAtMs`.
 *
 * BOUNDED CONCURRENCY, NOT SEQUENTIAL AND NOT UNBOUNDED. Reading live courses
 * one at a time made the deadline bite far too early - with a handful of live
 * courses, serialization alone cut most of them before their turn ever came
 * up, which is a self-inflicted version of the exact problem D24d exists to
 * survive. Fanning all of them out at once would remove that cost but replace
 * it with a burst against one instructor's Canvas token sized to however many
 * courses they teach, which is not this app's rate limit to spend. A small
 * fixed pool (see `runLiveReads`) is the middle path: several courses make
 * real progress at once, and the pool's SIZE never depends on how many courses
 * are in this answer.
 *
 * A course is still never half-read by this. Each course's own read is one
 * call to `readLive`, awaited whole; concurrency is across DIFFERENT courses,
 * never within one, so a course that completes is completely read and a course
 * that does not fit is still wholly reported as cut, exactly as D24e requires.
 *
 * A COURSE IS NEVER DROPPED. A live read that fails or that does not fit keeps
 * the recorded slice built in step 1 and carries the connection saying why -
 * so its students still appear, its recorded work still counts, and the
 * coverage statement still names it as a course whose LMS was not read.
 *
 * A LIVE COURSE'S PLACEHOLDER IS THE CUT STATE, set here rather than trusted
 * from the caller: if the read never happens, "not read from Canvas within the
 * budget" is the true state, so the pessimistic value is the one that must
 * survive a bug rather than the one that must be remembered.
 */
export async function assembleCrossCourseSlices(
  args: AssembleCrossCourseArgs
): Promise<readonly CrossCourseSlice[]> {
  const slices = new Map<string, CrossCourseSlice>();
  for (const task of args.tasks) {
    const recorded = task.readRecorded();
    slices.set(task.courseId, task.readLive ? { ...recorded, connection: BUDGET_CUT_CONNECTION } : recorded);
  }

  const queue: QueuedLiveRead[] = [];
  for (const task of args.tasks) {
    if (task.readLive) queue.push({ courseId: task.courseId, run: task.readLive });
  }
  await runLiveReads(queue, slices, args);

  const ordered: CrossCourseSlice[] = [];
  for (const task of args.tasks) {
    const slice = slices.get(task.courseId);
    if (slice) ordered.push(slice);
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// The coverage statement (D24e).
// ---------------------------------------------------------------------------

/**
 * Whether the courses in this answer may be compared with a bare superlative.
 *
 * "complete" needs THREE things, and dropping any one of them produces the
 * confidently-wrong answer D24e is about:
 *   - every course had the source it was meant to have actually read (nothing
 *     is `lms-unavailable`);
 *   - every course was read the SAME WAY (see this file's header: a live late
 *     count and a recorded late count measure different things over different
 *     denominators);
 *   - every course actually produced the counts, rather than a null a reader
 *     could mistake for a zero and therefore for the winner.
 */
export type SuperlativeBasis = "complete" | "partial";

export function superlativeBasis(slices: readonly CrossCourseSlice[]): SuperlativeBasis {
  if (slices.length === 0) return "partial";
  const firstMode = courseReadMode(slices[0].connection);
  const complete = slices.every((slice) => {
    const mode = courseReadMode(slice.connection);
    return (
      mode !== "lms-unavailable" &&
      mode === firstMode &&
      slice.rollup.missing !== null &&
      slice.rollup.late !== null
    );
  });
  return complete ? "complete" : "partial";
}

/**
 * One sentence per course, always, naming it and how it was read.
 *
 * RENDERED WHETHER OR NOT ANYTHING FAILED. That is the whole point: a coverage
 * note that only appears when something went wrong is a note nobody has
 * learned to look for, and the reader of a five-course ranking cannot tell a
 * complete one from a three-course one without it.
 *
 * Composed HERE, in code, from typed values and the course's own name - never
 * left to the model to mention. The names in these strings are bound for the
 * instructor's own browser and never for a prompt.
 */
export function describeCourseCoverage(
  slices: readonly { readonly name: string; readonly connection: LmsConnection }[]
): string[] {
  return slices.map((slice) => {
    const name = slice.name.trim() || "Untitled course";
    const detail = slice.connection.state === "unavailable" ? slice.connection.detail.trim() : "";
    switch (courseReadMode(slice.connection)) {
      case "live":
        return `${name}: read live from Canvas.`;
      case "recorded": {
        const lead = `${name}: read from the work you recorded in this browser. This course has no Canvas link, so nothing was missed.`;
        return detail ? `${lead} ${detail}` : lead;
      }
      case "lms-unavailable": {
        const lead = `${name}: Canvas was NOT read for this course, so only the work you recorded in this browser was used.`;
        return detail ? `${lead} ${detail}` : lead;
      }
    }
  });
}
