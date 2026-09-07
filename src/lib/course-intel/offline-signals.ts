// course-intel: OFFLINE CONCERN SIGNALS, computed from recorded work.
//
// Read decision D21 (docs/course-student-intelligence-acceptance-criteria.md)
// and ./concern.ts before changing a line of this file. D21 supersedes D20c,
// and the correction it records is the whole framing of this module:
//
//   Offline, the recording suite is NOT a partial sample of a gradebook that
//   lives elsewhere. There is no elsewhere. With no LMS connection there is no
//   other way to grade, so the recorded rows ARE the gradebook, and they are
//   real grading data the instructor produced themselves.
//
//   The general lesson worth keeping: a source's value cannot be judged
//   independently of what else is available. Every "recording is weaker than
//   the API" finding in D19 was conditioned on the API existing, and none of
//   them survives its absence.
//
// D1 STANDS UNCHANGED AND MATTERS MORE HERE, NOT LESS. Membership on this list
// is decided in TypeScript, from typed numbers, before any model call. The
// model is handed these rows and asked to EXPLAIN them; it is never asked who
// belongs on the list. Offline the data is thinner, which gives a model MORE
// room to invent, not less. This module reads no student-authored text of any
// kind - only assessment ids, scores, points and timestamps - so no recorded
// text, hostile or otherwise, can change who is on this list or what their
// signals say.
//
// NOTHING HERE EMITS A NAME. `OfflineConcernRow` carries `studentIndex` and
// deliberately NOT the student key, because the key embeds the canonicalised
// name (see offline-identity.ts). The rows are prompt-safe as they stand; the
// existing context block owns rendering.
//
// PURE LEAF: no React, no DOM, no node builtins, no clock (`now` is a
// parameter), no randomness.

import type {
  CanvasUserId,
  ConcernSignal,
  ConcernThresholds,
  StudentIdentitySource,
  StudentIndex,
} from "./types";
import type { OfflineStudentIdentity } from "./offline-identity";

/**
 * One recorded grading row, reduced to the typed facts this module needs.
 *
 * Deliberately NOT `GradingRow` itself. That type is a UI row - it carries
 * `totalScore` as a free-text string, feedback prose the instructor may have
 * edited, and (as of D21d) whatever course scoping the recording surface
 * grows. Mapping it into this shape is the caller's job, and keeping the
 * boundary here means this module can be tested with a frozen fixture rather
 * than against a moving surface. `parseEarnedPossibleScore`
 * (src/lib/grade/parsing.ts) is the existing parser for the score string.
 */
export interface OfflineRecordedScore {
  /**
   * Which assessment this row belongs to. Opaque and caller-minted - an
   * assignment name, a capture-session id, whatever the recording surface
   * scopes a grading pass by. Trimmed and compared as a string here; blank
   * rows are ignored, because an assessment that cannot be named cannot be a
   * denominator entry.
   */
  readonly assessmentId: string;
  /**
   * The `(name, course)` key from `offlineStudentKey`, or `null` when the
   * captured name did not resolve to exactly one student.
   *
   * A null key still counts toward the recorded-assessment DENOMINATOR - the
   * instructor did grade that assessment - but attributes to nobody. Counted
   * and reported on the set rather than dropped: an omission we cannot
   * attribute is still an omission the instructor must be told about.
   */
  readonly studentKey: string | null;
  /** Points awarded. `null` means the row was captured but not scored - the
   *  instructor's own backlog, never a zero. */
  readonly score: number | null;
  readonly pointsPossible: number | null;
  /** ISO capture/grading timestamp, or null when none was recorded. */
  readonly recordedAt: string | null;
}

/** One captured discussion row, reduced. Participation only - no text. */
export interface OfflineRecordedParticipation {
  readonly studentKey: string | null;
  readonly kind: "post" | "reply";
  readonly occurredAt: string | null;
}

/**
 * The offline analogue of `MissingRollup`, and a DIFFERENT TYPE on purpose.
 *
 * Every field name here says what it actually is. `MissingRollup.missingCount`
 * means Canvas's own `missing` flag, which accounts for a teacher's manual
 * "mark missing" override and for submission types that cannot be submitted
 * online - none of which is available offline, and none of which means quite
 * what "the instructor recorded no grade for this student on that assessment"
 * means. Reusing the word behind the same field name would make an offline
 * sentence read as a Canvas fact.
 *
 * A UNION, not a flat record with a `neverRecorded` boolean, because the
 * "missing 8 of 8" sentence must be structurally unavailable rather than
 * merely discouraged. A student the recording suite has never seen has NO
 * not-recorded count to read: the field does not exist on their variant. See
 * concern.ts's own note on why that sentence is the single most damaging
 * output this feature could produce, and grading-row.ts's rule that a
 * boundary that matters should be a compile error rather than a convention.
 */
export type OfflineRecordedRollup =
  | {
      readonly kind: "never-recorded";
      /**
       * How many assessments the instructor graded in this course, for
       * ANYBODY. Context - "you have graded 8 assessments and this student
       * appears in none of them" - and explicitly not a count of this
       * student's missing work.
       */
      readonly recordedAssessmentCount: number;
    }
  | {
      readonly kind: "recorded";
      /**
       * The "of 8". Assessments this instructor actually recorded a grade for
       * in this course.
       *
       * BOTH NUMBERS COME FROM THIS SAME SET or the sentence is false - the
       * denominator rule from the live path, unchanged. An assessment nobody
       * has been graded on yet is not missing work for anyone, which is why
       * an assessment enters this set only once at least one row for it
       * carries a real score.
       */
      readonly recordedAssessmentCount: number;
      /** The "3". Assessments in the denominator with NO recorded row at all
       *  for this student. */
      readonly notRecordedForStudentCount: number;
      /** Assessments where a row was captured for this student but left
       *  unscored. The instructor's backlog, not the student's - kept
       *  separate for MissingRollup's own reason. */
      readonly capturedUnscoredCount: number;
      /** Assessments with a real recorded score for this student. */
      readonly scoredCount: number;
      /** Mean percent across scored assessments with a positive points
       *  possible, or null when none could be scaled. */
      readonly averagePercent: number | null;
      /**
       * How many assessments `averagePercent` was actually computed over.
       *
       * A separate field rather than `scoredCount`, because rendering the
       * average "across 3 graded assessments" when it was computed over 2 is
       * the same class of false sentence as a missing count drawn from a
       * different denominator than its total.
       */
      readonly averagedAssessmentCount: number;
      /** Scored assessments whose points possible was absent or not positive.
       *  Excluded from `averagePercent` and reported rather than silently
       *  folded in at some assumed denominator. */
      readonly unscalablePointsCount: number;
      /** Captured discussion posts and replies attributed to this student. */
      readonly discussionPostCount: number;
      readonly discussionReplyCount: number;
    };

/**
 * One row of the offline concern set.
 *
 * NOT `ConcernRow`, and the reason is a real contract gap rather than a style
 * choice: `ConcernRow.userId` is a non-optional `CanvasUserId`, and offline
 * most students have no trustworthy id at all. D19f named this exact problem
 * for `CourseIntelAnswerRecord.citedStudents` and D20f widened it. Emitting a
 * borrowed or synthesised id to satisfy the type would launder a screen-read
 * name into the one field the whole design treats as ground truth, so this
 * type carries `userId: CanvasUserId | null` and says how it knows.
 */
export interface OfflineConcernRow {
  readonly studentIndex: StudentIndex;
  /** Only from a cached `student_repos[].canvasUserId`. Never synthesised. */
  readonly userId: CanvasUserId | null;
  readonly identitySource: StudentIdentitySource;
  readonly signals: readonly ConcernSignal[];
  /** Ordering only. Never shown as a score, never described to the model as a
   *  ranking - see ConcernRow's own doc in ./types. */
  readonly sortWeight: number;
  readonly rollup: OfflineRecordedRollup;
}

export interface OfflineConcernSet {
  readonly rows: readonly OfflineConcernRow[];
  /** Students examined and found to have no concern signal. A count rather
   *  than a list, because naming them serves nobody. */
  readonly clearCount: number;
  readonly thresholds: ConcernThresholds;
  /** The denominator set itself, in first-seen order, so a caller can state
   *  what "of 8" actually refers to. */
  readonly recordedAssessmentIds: readonly string[];
  /** Recorded rows whose captured name resolved to no single student -
   *  ambiguous, unmatched, or captured with no course. Real work that
   *  attributes to nobody, and stated rather than dropped. */
  readonly unattributedScoreCount: number;
  readonly unattributedParticipationCount: number;
}

const MS_PER_DAY = 86_400_000;

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Whole days between two instants, floored, never negative - the same
 *  clock-skew treatment concern.ts applies. */
function wholeDaysSince(thenMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - thenMs) / MS_PER_DAY));
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/** Percent formatted the way a gradebook does - "61%" rather than "61.0%".
 *  Copied deliberately from concern.ts so an offline label and a live label
 *  never disagree about how a number looks. */
function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function trimmedAssessmentId(raw: string): string {
  return typeof raw === "string" ? raw.trim() : "";
}

interface StudentAssessmentState {
  /** The last scored row supplied for this (student, assessment), or null
   *  when every row for it was captured unscored. */
  scored: OfflineRecordedScore | null;
  seen: boolean;
}

export interface ComputeOfflineConcernSetArgs {
  /** This course's students, from `buildOfflineIdentityIndex`. Every one of
   *  them is examined - a student with nothing recorded is REPORTED as such,
   *  never omitted. */
  readonly students: readonly OfflineStudentIdentity[];
  readonly scores: readonly OfflineRecordedScore[];
  readonly participation: readonly OfflineRecordedParticipation[];
  /** The INSTRUCTOR's thresholds, persisted from their own controls, so the
   *  judgement is theirs and reproducible. */
  readonly thresholds: ConcernThresholds;
  /** ISO timestamp. A parameter, never a clock read inside this module, so
   *  the same inputs always produce the same set. */
  readonly now: string;
}

/**
 * Compute the offline concern set from recorded work.
 *
 * WHICH SIGNALS CREATE A ROW - the same split concern.ts makes, for the same
 * reasons:
 *
 *   QUALIFYING - missing-work (read here as "no recorded work on N of M
 *   assessments you graded"), low-score, no-recent-activity,
 *   insufficient-data.
 *
 *   CONTEXT ONLY - ungraded-backlog. Attached to a row that already
 *   qualified, never a trigger. A captured-but-unscored row is the
 *   INSTRUCTOR's backlog, and letting it qualify would put the whole class on
 *   the list the first time a capture pass is left half-scored.
 *
 *   NO OFFLINE ANALOGUE - late-work. Nothing in any recorded row carries a
 *   due date, so lateness is not computable and is not guessed at.
 *
 * INSUFFICIENT DATA IS A ROW, NOT AN OMISSION, and offline it says something
 * specific and useful: the instructor has not graded this student yet. It is
 * NEVER rendered as "missing 8 of 8" - that is the zero-versus-no-data
 * confusion the whole design exists to prevent, and the never-recorded rollup
 * variant has no count to render it from.
 */
export function computeOfflineConcernSet(args: ComputeOfflineConcernSetArgs): OfflineConcernSet {
  const { students, thresholds } = args;
  const nowMs = parseMs(args.now);

  // THE DENOMINATOR. An assessment enters it only when at least one row for it
  // carries a real score: an assessment captured but graded for nobody yet is
  // not missing work for anyone, exactly as an assignment not yet due is not
  // missing work in the live path.
  const recordedAssessmentIds: string[] = [];
  const recordedAssessments = new Set<string>();
  for (const row of args.scores) {
    const id = trimmedAssessmentId(row.assessmentId);
    if (!id || row.score === null || recordedAssessments.has(id)) continue;
    recordedAssessments.add(id);
    recordedAssessmentIds.push(id);
  }

  // Per student, per assessment. Input order is capture order, so a later row
  // for the same (student, assessment) supersedes an earlier one - a
  // re-capture corrects a misread, it does not add a second grade.
  const byStudent = new Map<string, Map<string, StudentAssessmentState>>();
  const lastRecordedMsByStudent = new Map<string, number>();
  const postsByStudent = new Map<string, number>();
  const repliesByStudent = new Map<string, number>();
  let unattributedScoreCount = 0;
  let unattributedParticipationCount = 0;
  // The most recent recorded activity anywhere in this course that we could
  // ATTRIBUTE. Unattributed rows are excluded deliberately: an unattributed
  // row might belong to the very student we are about to call quiet.
  let courseLastRecordedMs: number | null = null;

  const noteActivity = (key: string, iso: string | null) => {
    const ms = parseMs(iso);
    if (ms === null) return;
    const prev = lastRecordedMsByStudent.get(key);
    if (prev === undefined || ms > prev) lastRecordedMsByStudent.set(key, ms);
    if (courseLastRecordedMs === null || ms > courseLastRecordedMs) courseLastRecordedMs = ms;
  };

  for (const row of args.scores) {
    const id = trimmedAssessmentId(row.assessmentId);
    if (!id) continue;
    if (row.studentKey === null) {
      unattributedScoreCount += 1;
      continue;
    }
    let assessments = byStudent.get(row.studentKey);
    if (!assessments) {
      assessments = new Map<string, StudentAssessmentState>();
      byStudent.set(row.studentKey, assessments);
    }
    const state = assessments.get(id) ?? { scored: null, seen: false };
    state.seen = true;
    if (row.score !== null) state.scored = row;
    assessments.set(id, state);
    noteActivity(row.studentKey, row.recordedAt);
  }

  for (const row of args.participation) {
    if (row.studentKey === null) {
      unattributedParticipationCount += 1;
      continue;
    }
    const bucket = row.kind === "post" ? postsByStudent : repliesByStudent;
    bucket.set(row.studentKey, (bucket.get(row.studentKey) ?? 0) + 1);
    noteActivity(row.studentKey, row.occurredAt);
  }

  const rows: OfflineConcernRow[] = [];
  let clearCount = 0;

  for (const student of students) {
    const key = student.key;
    const assessments = key === null ? undefined : byStudent.get(key);
    const posts = key === null ? 0 : postsByStudent.get(key) ?? 0;
    const replies = key === null ? 0 : repliesByStudent.get(key) ?? 0;
    const seenAtAll = (assessments !== undefined && assessments.size > 0) || posts > 0 || replies > 0;

    const rollup: OfflineRecordedRollup = seenAtAll
      ? buildRecordedRollup(recordedAssessmentIds, assessments, posts, replies)
      : { kind: "never-recorded", recordedAssessmentCount: recordedAssessmentIds.length };

    const signals: ConcernSignal[] = [];
    let qualifies = false;

    if (rollup.kind === "recorded" && rollup.recordedAssessmentCount > 0) {
      const notRecorded = rollup.notRecordedForStudentCount;
      if (notRecorded > 0 && notRecorded >= thresholds.minMissingCount) {
        qualifies = true;
        signals.push({
          // BENT. The live meaning of `missing-work` is Canvas's own `missing`
          // flag, which is not available here and means something slightly
          // different. The label carries the real meaning, and both numbers
          // come from the same denominator set.
          kind: "missing-work",
          label: `No recorded work on ${notRecorded} of ${rollup.recordedAssessmentCount} assessments graded in this course`,
          value: notRecorded,
        });
      }
    }

    const averagePercent = rollup.kind === "recorded" ? rollup.averagePercent : null;
    if (averagePercent !== null && averagePercent <= thresholds.lowScorePercent) {
      qualifies = true;
      const averagedCount = rollup.kind === "recorded" ? rollup.averagedAssessmentCount : 0;
      signals.push({
        // BENT. Live, `low-score` is the course score Canvas computed across
        // the whole gradebook. Offline it is the mean of what this instructor
        // recorded, and the label says so and says across how many - the
        // count the average was computed over, not every scored row.
        kind: "low-score",
        label: `Recorded average: ${formatPercent(averagePercent)} across ${plural(averagedCount, "graded assessment")}`,
        value: averagePercent,
      });
    }

    // NO-RECENT-ACTIVITY, AND THE EXTRA CONDITION THAT MAKES IT HONEST.
    //
    // Offline, "days since last activity" is as much a fact about the
    // instructor's capture cadence as about the student: an instructor who
    // graded nothing for three weeks would otherwise put their entire class on
    // this list, which is precisely the false precision concern.ts refuses to
    // manufacture. So the signal also requires that this course has recorded
    // activity for SOMEONE ELSE more recent than this student's own - which
    // makes it a statement about the student relative to their classmates
    // rather than about the calendar.
    const studentLastMs = key === null ? undefined : lastRecordedMsByStudent.get(key);
    let quietDays = 0;
    if (studentLastMs !== undefined && nowMs !== null) {
      quietDays = wholeDaysSince(studentLastMs, nowMs);
      const othersMoreRecent = courseLastRecordedMs !== null && courseLastRecordedMs > studentLastMs;
      if (quietDays >= thresholds.staleActivityDays && othersMoreRecent) {
        qualifies = true;
        signals.push({
          // BENT. Live, this is "no activity in this course" from the LMS.
          // Offline it can only mean "nothing was recorded for them", and the
          // label states the comparison that makes it meaningful.
          kind: "no-recent-activity",
          label: `Nothing recorded for this student in ${plural(quietDays, "day")}, while other students have more recent recorded work`,
          value: quietDays,
        });
      }
    }

    // The honest answer, and a first-class row so the student is REPORTED
    // rather than omitted. Three shapes, all of them "we do not know", and
    // never "missing all of them".
    const nothingKnown =
      rollup.kind === "never-recorded" ||
      (rollup.recordedAssessmentCount === 0 && averagePercent === null && studentLastMs === undefined);
    if (student.identitySource === "ambiguous-name") {
      qualifies = true;
      signals.push({
        kind: "insufficient-data",
        label:
          "Not enough information: more than one student in this course has this name, so no recorded work can be attributed until you say which is meant",
        value: null,
      });
    } else if (nothingKnown) {
      qualifies = true;
      signals.push({
        kind: "insufficient-data",
        label:
          rollup.kind === "never-recorded"
            ? "Not enough information: you have not recorded any graded work for this student in this course yet"
            : "Not enough information about this student's recorded work in this course",
        value: null,
      });
    }

    if (!qualifies) {
      clearCount += 1;
      continue;
    }

    // Context-only, attached to an already-qualifying row. Never a trigger.
    if (rollup.kind === "recorded" && rollup.capturedUnscoredCount > 0) {
      signals.push({
        // BENT, but mildly: live, `ungraded-backlog` is "submitted, awaiting a
        // grade". Offline it is "captured, not yet scored", which is the same
        // statement about the instructor's own queue.
        kind: "ungraded-backlog",
        label: `${plural(rollup.capturedUnscoredCount, "captured submission")} not yet scored`,
        value: rollup.capturedUnscoredCount,
      });
    }

    rows.push({
      studentIndex: student.index,
      userId: student.userId,
      identitySource: student.identitySource,
      signals,
      sortWeight: computeOfflineSortWeight({ rollup, averagePercent, quietDays, thresholds, signals }),
      rollup,
    });
  }

  rows.sort((a, b) => b.sortWeight - a.sortWeight || a.studentIndex - b.studentIndex);

  return {
    rows,
    clearCount,
    thresholds,
    recordedAssessmentIds,
    unattributedScoreCount,
    unattributedParticipationCount,
  };
}

/** Builds the `recorded` variant for a student the recording suite HAS seen.
 *  Never called for a never-recorded student, which is what keeps the
 *  not-recorded count off their row entirely. */
function buildRecordedRollup(
  recordedAssessmentIds: readonly string[],
  assessments: ReadonlyMap<string, StudentAssessmentState> | undefined,
  discussionPostCount: number,
  discussionReplyCount: number
): OfflineRecordedRollup {
  let notRecordedForStudentCount = 0;
  for (const id of recordedAssessmentIds) {
    if (!assessments?.get(id)?.seen) notRecordedForStudentCount += 1;
  }

  let scoredCount = 0;
  let capturedUnscoredCount = 0;
  let unscalablePointsCount = 0;
  let percentTotal = 0;
  let percentCount = 0;
  if (assessments) {
    for (const state of assessments.values()) {
      if (!state.seen) continue;
      if (state.scored === null) {
        capturedUnscoredCount += 1;
        continue;
      }
      scoredCount += 1;
      const possible = state.scored.pointsPossible;
      const score = state.scored.score;
      if (score === null || possible === null || !Number.isFinite(possible) || possible <= 0 || !Number.isFinite(score)) {
        unscalablePointsCount += 1;
        continue;
      }
      percentTotal += (score / possible) * 100;
      percentCount += 1;
    }
  }

  return {
    kind: "recorded",
    recordedAssessmentCount: recordedAssessmentIds.length,
    notRecordedForStudentCount,
    capturedUnscoredCount,
    scoredCount,
    averagePercent: percentCount > 0 ? percentTotal / percentCount : null,
    averagedAssessmentCount: percentCount,
    unscalablePointsCount,
    discussionPostCount,
    discussionReplyCount,
  };
}

/**
 * ORDERING ONLY. Never shown to anyone, never described to the model as a
 * ranking, never rendered as a score - concern.ts's rule, unchanged.
 *
 * The relative order matches the live weighting so the two paths do not sort
 * differently for no reason: unrecorded work outranks how far below the
 * instructor's own line an average sits, which outranks days of silence. The
 * hundreds place the live function gives to late work is unused here, because
 * lateness has no offline analogue and nothing else is promoted into its slot.
 *
 * A row whose ONLY signal is insufficient-data sorts below every signalled row
 * (weight -1). Not because it matters less, but because "we do not know" is a
 * different KIND of statement from "this student has no recorded work", and
 * interleaving them would read as a ranking that says otherwise.
 */
function computeOfflineSortWeight(args: {
  rollup: OfflineRecordedRollup;
  averagePercent: number | null;
  quietDays: number;
  thresholds: ConcernThresholds;
  signals: readonly ConcernSignal[];
}): number {
  const onlyInsufficient = args.signals.every((s) => s.kind === "insufficient-data");
  if (onlyInsufficient) return -1;
  const notRecorded = args.rollup.kind === "recorded" ? args.rollup.notRecordedForStudentCount : 0;
  const scoreGap =
    args.averagePercent !== null && args.averagePercent <= args.thresholds.lowScorePercent
      ? Math.max(0, Math.round(args.thresholds.lowScorePercent - args.averagePercent))
      : 0;
  return notRecorded * 1000 + scoreGap * 10 + args.quietDays;
}
