// course-intel: THE OFFLINE SEAM. What the browser actually holds, translated
// into what ./offline-identity, ./offline-signals and ./engagement actually
// consume.
//
// WHY THIS FILE EXISTS AT ALL. Those three modules were built, tested and
// sabotage-checked with ZERO non-test importers. They computed correctly over
// nothing. This module is the one place their inputs are produced, so the
// failure mode being closed here is "shipped dead with every gate green"
// (docs/course-student-intelligence-acceptance-criteria.md D19-D23 describe
// what they compute; nothing described how the recorded rows become their
// inputs).
//
// READ D25f BEFORE TOUCHING THE WORK-KIND MAPPING. Two modules built
// concurrently spell the same idea differently:
//
//   the declarations store (useGradingAssessmentDeclarations.ts):
//       GradingWorkKind = "discussion" | "assignment"
//   the engagement computation (./engagement):
//       WorkKind        = "assignment" | "discussion-post"
//
// A mapper that passes the string through lands every discussion assessment in
// `not-declared`, its missing count silently disappears, and the answer reads
// "no missing work" rather than as an error. That is a confidently wrong
// statement about real students produced by two strings that look
// interchangeable. The two are also GENUINELY DIFFERENT CONCEPTS -
// `StudentTextKind`'s "discussion-post" describes a piece of TEXT while
// `WorkKind` describes a KIND OF WORK being graded - so forcing one spelling
// everywhere is the wrong fix. D25f's ruling is an explicit, total, TESTED
// mapping at the boundary, and that is `SOURCE_WORK_KIND_TRANSLATION` below:
// a `Record` over the SOURCE union, so a future member is a compile error
// rather than a silent miss.
//
// THE NAME COLLISION D25f ALSO NAMES: both modules export a type called
// `GradingToolDeclaration` with different shapes. They are aliased at this
// boundary (`StoredToolDeclaration` / `EngagementToolDeclaration`) so a reader
// of this file always knows which one is meant, and nothing here re-exports
// either under the bare name.
//
// NOTHING HERE EMITS A NAME OR A LOGIN ID. Captured names are consumed by
// `resolveOfflineIdentity` and discarded; what leaves this module is student
// INDEXES, opaque join keys that never reach a prompt (see ./offline-identity
// on why `key` is not prompt-safe), typed counts and typed instants. The
// report carries counts, never the ambiguous names themselves - the
// instructor-facing "which student did you mean" question is answered in the
// UI from the identity index, which already holds the roster spellings.
//
// PURE LEAF: no React, no DOM, no node builtins, no clock (`now` is a
// parameter), no randomness. The two imports that reach into
// src/app/components are a dependency-free leaf (grading-row.ts, which imports
// nothing at all) and TYPE-ONLY imports that are erased at compile time -
// `useGradingAssessmentDeclarations.ts` is a "use client" React hook file and
// no value from it is imported here. src/lib/command-proposal.ts and
// ./offline-identity are the standing precedents for a lib module importing a
// pure leaf out of src/app/components.

import { parseEarnedPossibleScore } from "@/lib/grade/parsing";
import { gradingRowSubmissionTimeStatus } from "@/app/components/grading-recording/grading-row";
import type { GradingRow } from "@/app/components/grading-recording/grading-row";
import type {
  GradingAssessmentDeclaration as StoredAssessmentDeclaration,
  GradingToolDeclaration as StoredToolDeclaration,
  GradingWorkKind,
} from "@/app/components/grading-recording/useGradingAssessmentDeclarations";
import type { ReplyRow } from "@/app/components/recording/discussion-serialization";
import {
  buildOfflineIdentityIndex,
  resolveOfflineIdentity,
  type OfflineIdentityIndex,
  type OfflineIdentityResolution,
  type OfflineStudentRepoRef,
} from "./offline-identity";
import {
  computeOfflineConcernSet,
  type OfflineConcernSet,
  type OfflineRecordedParticipation,
  type OfflineRecordedScore,
} from "./offline-signals";
import {
  computeEngagementSet,
  type EngagementAssessment,
  type EngagementSet,
  type EngagementStudent,
  type EngagementThresholds,
  type GradingToolDeclaration as EngagementToolDeclaration,
  type RecordedSubmission,
  type SubmissionTime,
  type WorkKind,
} from "./engagement";
import type { ConcernThresholds } from "./types";

// ---------------------------------------------------------------------------
// D25f: THE WORK-KIND TRANSLATION. Explicit, total, tested - never a
// pass-through.
// ---------------------------------------------------------------------------

/**
 * The one place the declarations store's vocabulary becomes the engagement
 * computation's vocabulary.
 *
 * TOTAL OVER THE SOURCE UNION BY CONSTRUCTION. The annotation is
 * `Record<GradingWorkKind, WorkKind>` on the object LITERAL, so adding a
 * member to `GradingWorkKind` is a missing-key compile error here and a typo
 * is an excess-property compile error - not a row that quietly falls through
 * to `not-declared` at runtime.
 *
 * DO NOT "SIMPLIFY" THIS TO AN IDENTITY. The two unions share the member
 * "assignment" today, which is exactly what makes a pass-through look correct
 * in a fixture that only exercises assignments. `"discussion"` is the member
 * that breaks, and it breaks silently: an unmatched work kind means no
 * declared tool, which means `AssessmentMissingState` is `not-declared`, which
 * means the missing count for every discussion assessment disappears and the
 * answer reads as "no missing work" rather than as an error.
 */
const SOURCE_WORK_KIND_TRANSLATION: Record<GradingWorkKind, WorkKind> = {
  discussion: "discussion-post",
  assignment: "assignment",
};

/** The frozen, exported view of the translation - so a test can read the whole
 *  mapping as a table rather than probing it one member at a time. */
export const ENGAGEMENT_WORK_KIND_BY_SOURCE: Readonly<Record<GradingWorkKind, WorkKind>> =
  Object.freeze(SOURCE_WORK_KIND_TRANSLATION);

/**
 * Every member of the SOURCE union, derived from the translation table rather
 * than restated - so the list cannot drift from the mapping it describes, and
 * so this leaf needs no runtime import of `GRADING_WORK_KINDS` (a value living
 * in a "use client" React file).
 */
export const OFFLINE_SOURCE_WORK_KINDS: readonly GradingWorkKind[] = Object.freeze(
  Object.keys(SOURCE_WORK_KIND_TRANSLATION) as GradingWorkKind[]
);

/** D25f: translate one declared work kind. Visible in the code, tested against
 *  a frozen literal oracle, and total over its input. */
export function toEngagementWorkKind(kind: GradingWorkKind): WorkKind {
  return SOURCE_WORK_KIND_TRANSLATION[kind];
}

// ---------------------------------------------------------------------------
// Free-text readers. Each one names the failure it refuses to commit.
// ---------------------------------------------------------------------------

function trimmed(raw: string | null | undefined): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * How much of a `GradingRow.totalScore` could actually be read.
 *
 * Four outcomes rather than a nullable pair, because "the instructor typed
 * nothing" and "the instructor typed something we cannot read" are different
 * facts about the same missing number, and only the first means "not graded
 * yet".
 */
export type RecordedScoreOutcome =
  /** "18/20" - both halves. */
  | "earned-and-possible"
  /** "18", "95%", "18/0" - a number we can read, and no usable total. */
  | "earned-only"
  /** Non-blank text with no readable number in it at all ("A+", "see comment"). */
  | "unreadable"
  /** Nothing typed. The row was captured but never scored. */
  | "blank";

export interface RecordedScoreReading {
  /** Points awarded, or null when none could be read. NEVER a zero standing in
   *  for an absent score - ./offline-signals treats null as the instructor's
   *  own backlog and a zero as a grade, and they mean opposite things. */
  readonly score: number | null;
  /** Null whenever no POSITIVE total was named. Never fabricated. */
  readonly pointsPossible: number | null;
  readonly outcome: RecordedScoreOutcome;
}

/** The first standalone number in a string. Only ever consulted AFTER
 *  `parseEarnedPossibleScore` has declined, so "18/20" can never reach it. */
const FIRST_NUMBER = /-?\d+(?:\.\d+)?/;

/**
 * Reads `GradingRow.totalScore`, which is FREE TEXT.
 *
 * `parseEarnedPossibleScore` (src/lib/grade/parsing.ts) is this repo's shipped
 * parser for the "earned / possible" spelling and is reused rather than
 * re-implemented. It REJECTS a non-positive `possible` - "18/0", "5/-2" - and
 * that rejection is why this function has a second stage instead of stopping
 * there:
 *
 *   - `pointsPossible` must be null for those, never the fabricated 0 or -2
 *     that a naive read would carry into a percentage;
 *   - but `score` must NOT also collapse to null, because a null score is what
 *     keeps an assessment OUT of ./offline-signals' denominator (an assessment
 *     enters it only once at least one row for it carries a real score). Losing
 *     the 18 would quietly shrink every student's missing count - the same
 *     silent-disappearance failure D25f describes, arriving through a parser
 *     rather than a spelling.
 *
 * So a readable number with no usable total is `earned-only`, which
 * ./offline-signals already has the right home for: it counts as scored, and
 * lands in `unscalablePointsCount` rather than being folded into the average at
 * some assumed denominator.
 */
export function readRecordedScore(totalScore: string | null | undefined): RecordedScoreReading {
  const text = trimmed(totalScore);
  if (!text) return { score: null, pointsPossible: null, outcome: "blank" };

  const pair = parseEarnedPossibleScore(text);
  if (pair) return { score: pair.earned, pointsPossible: pair.possible, outcome: "earned-and-possible" };

  const bare = text.match(FIRST_NUMBER);
  if (bare) {
    const earned = Number.parseFloat(bare[0]);
    if (Number.isFinite(earned)) return { score: earned, pointsPossible: null, outcome: "earned-only" };
  }
  return { score: null, pointsPossible: null, outcome: "unreadable" };
}

/**
 * A standalone four-digit run - the anchor a text must carry before its parsed
 * instant is believed. See `readDisplayedTimestamp` for why.
 */
const EXPLICIT_YEAR = /\b\d{4}\b/;

/**
 * Reads a timestamp that was DISPLAYED rather than emitted by an API.
 *
 * `ReplyRow.postedAt` is "the LMS's own timestamp, as displayed" and is not
 * reliably ISO; an instructor-entered deadline is whatever a datetime control
 * or a keyboard produced. A value that cannot be read becomes NULL, never a bad
 * instant, and never a nearby instant borrowed from somewhere else.
 *
 * In particular `ReplyRow.firstSeenAt` (a ms epoch) is NEVER substituted: that
 * is when WE saw the post, not when the student posted it. Using it would make
 * every recency signal secretly a fact about the instructor's own capture
 * cadence, which is the D22c/D23c failure this feature has already had to
 * correct once.
 *
 * `Date.parse` ALONE IS NOT THE VALIDATOR, and this was measured rather than
 * assumed: `Date.parse("end of week 3")` does not return NaN here - it returns
 * a real instant in March 2001, interpreted in the machine's own timezone. A
 * mapper that trusted it would hand `./engagement` a deadline that has
 * comfortably passed, and every roster student with no row for that assessment
 * would be reported missing on the strength of a sentence fragment. So a parsed
 * instant is believed only when the source text also carries an explicit
 * four-digit year, which every real ISO or LMS-displayed timestamp does and
 * which prose like "end of week 3", "last Tuesday" or "Week 12" does not. A
 * two-digit year ("5/1/26") is refused for the same reason: which century it
 * means is a guess, and null is the honest answer.
 *
 * Returns a canonical ISO string so no downstream reader re-parses a locale
 * spelling and lands on a different instant. `new Date(ms)` is arithmetic on a
 * number `Date.parse` already validated, not a clock read.
 */
export function readDisplayedTimestamp(raw: string | null | undefined): string | null {
  const text = trimmed(raw);
  if (!text) return null;
  if (!EXPLICIT_YEAR.test(text)) return null;
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * `GradingRow`'s three-valued submission time, kept three-valued.
 *
 * D23c, and grading-row.ts's own doc comment: "unknown" is NOT "on time", and a
 * "known" status whose `submittedAt` is absent or unreadable is "unknown"
 * rather than a definite-looking answer. There is deliberately no path here
 * that could produce a `known` instant from anything other than
 * `row.submittedAt` - the capture time is not a field on this row type at all,
 * so the rejected D23c proxy is unavailable rather than merely discouraged.
 *
 * "marked-late" maps to `instructor-marked` with `late: true`. There is no
 * `marked-on-time` member on `GradingRowSubmissionTimeStatus`, so
 * `instructor-marked` with `late: false` is unreachable from a `GradingRow`
 * and is not synthesised here to look symmetrical.
 */
export function readSubmissionTime(row: GradingRow): SubmissionTime {
  const status = gradingRowSubmissionTimeStatus(row);
  switch (status) {
    case "marked-late":
      return { state: "instructor-marked", late: true };
    case "known": {
      const submittedAt = readDisplayedTimestamp(row.submittedAt);
      return submittedAt === null ? { state: "unknown" } : { state: "known", submittedAt };
    }
    case "unknown":
      return { state: "unknown" };
    default: {
      // Exhaustive: a new GradingRowSubmissionTimeStatus member is a compile
      // error here rather than a row that silently reads as unknown.
      const unhandled: never = status;
      return unhandled;
    }
  }
}

export interface ParticipationKindReading {
  readonly kind: OfflineRecordedParticipation["kind"];
  /** False when the row's thread position was never recorded. Counted and
   *  reported, so a caller can say the post/reply split is partial rather than
   *  presenting it as measured. */
  readonly positionKnown: boolean;
}

/**
 * `ReplyRow.threadPosition` to `OfflineRecordedParticipation.kind`.
 *
 * The target is two-valued and the source has a third state ("unknown", which
 * renders identically to absent - discussion-serialization.ts's T1a). Only an
 * explicitly recorded "reply" is reported as a reply; "root", "unknown" and
 * absent all report as a post, which is what the discussion capture table's
 * unit IS when nothing narrower was recorded.
 *
 * DROPPING the unrecorded ones was considered and rejected. Both consumers use
 * participation for RECENCY, and ./offline-signals' `no-recent-activity` fires
 * on how long ago a student's most recent recorded activity was - so silently
 * discarding a real captured post would make that student look quieter than
 * they are, which is a worse error than an imprecise post/reply split (neither
 * count feeds any signal). `positionKnown` is returned so the imprecision is
 * counted and stated instead of hidden.
 */
export function readParticipationKind(row: ReplyRow): ParticipationKindReading {
  if (row.threadPosition === "reply") return { kind: "reply", positionKnown: true };
  return { kind: "post", positionKnown: row.threadPosition === "root" };
}

// ---------------------------------------------------------------------------
// The report. Typed facts only - counts and instants, never a name.
// ---------------------------------------------------------------------------

/** How the captured names on one source's rows resolved. Mirrors
 *  `GradingRowNameMatch`'s four outcomes so no state is collapsed. */
export interface OfflineNameOutcomeCounts {
  readonly matched: number;
  /** ATTRIBUTES NOTHING. A question for the instructor, never a pick - the row
   *  joins to no student and is counted as unattributed by both consumers. */
  readonly ambiguous: number;
  readonly unmatched: number;
  /** There was no list to check against. Our gap, not the student's, and never
   *  reported as `unmatched`. */
  readonly noRoster: number;
}

export interface OfflineAssemblyReport {
  /** The course every row was scoped against. Blank means NO course scope, in
   *  which case nothing is adopted at all - see `belongsToCourse`. */
  readonly courseHubId: string;
  /** The caller's statement about which tool produced the grading rows. Blank
   *  makes every declared assessment read as `violated` rather than silently
   *  agreeing with the declaration. */
  readonly recordingTool: string;

  readonly gradingRowCount: number;
  /** Rows tagged with another course, or with none at all. NEVER adopted into
   *  the course in scope - that is how one class's work gets attributed to
   *  another. */
  readonly gradingRowsOutsideCourseCount: number;
  /** In-course rows naming no assessment. Not usable as a denominator entry or
   *  as a submission, and counted rather than dropped silently. Expect this to
   *  be every row until a capture-time assessment source exists - see
   *  grading-row.ts's own honest finding on `assessment`. */
  readonly gradingRowsWithoutAssessmentCount: number;
  readonly gradingRowNames: OfflineNameOutcomeCounts;
  readonly scoreReadings: Readonly<Record<RecordedScoreOutcome, number>>;
  readonly submissionTimesKnownCount: number;
  readonly submissionTimesInstructorMarkedLateCount: number;
  readonly submissionTimesUnknownCount: number;
  /** Rows whose status said "known" and whose `submittedAt` could not be read.
   *  They degrade to unknown, never to on time. */
  readonly unreadableSubmittedAtCount: number;
  /**
   * Emitted scores carrying no recorded-at instant.
   *
   * Currently always equal to the number of emitted scores, because
   * `GradingRow` carries no capture timestamp of any kind. Stated as a
   * measurable number rather than a comment so that if the row type ever gains
   * one and this mapper is updated, the gap visibly closes.
   */
  readonly scoresWithNoRecordedTimeCount: number;

  readonly replyRowCount: number;
  readonly replyRowsOutsideCourseCount: number;
  readonly replyRowNames: OfflineNameOutcomeCounts;
  readonly replyRowsWithUnknownThreadPositionCount: number;
  /** Rows whose `postedAt` was present and unreadable. Their participation
   *  carries a null instant; `firstSeenAt` is never used in its place. */
  readonly replyRowsWithUnreadablePostedAtCount: number;

  readonly assessmentCount: number;
  readonly assessmentsWithoutDeadlineCount: number;
  /** A deadline was entered and could not be read. Distinct from "none
   *  entered", which ./engagement cannot tell apart on its own. */
  readonly assessmentsWithUnreadableDeadlineCount: number;
  readonly assessmentsDroppedWithoutIdCount: number;
  readonly declaredToolCount: number;
}

// ---------------------------------------------------------------------------
// Mapping.
// ---------------------------------------------------------------------------

export interface OfflineAssemblySources {
  /** The course_hub row id every row is scoped against. */
  readonly courseHubId: string;
  /** One entry per DISTINCT roster student - `buildOfflineIdentityIndex`'s own
   *  contract, inherited unchanged. */
  readonly rosterNames: readonly string[];
  readonly studentRepos: readonly OfflineStudentRepoRef[];
  readonly gradingRows: readonly GradingRow[];
  readonly replyRows: readonly ReplyRow[];
  readonly assessmentDeclarations: readonly StoredAssessmentDeclaration[];
  readonly toolDeclarations: readonly StoredToolDeclaration[];
  /**
   * Which tool recorded `gradingRows`, in the instructor's own vocabulary -
   * the same free text they typed into the authoritative-tool declaration.
   *
   * REQUIRED, and deliberately NOT defaulted to the declared tool. Defaulting
   * would make D23a's violation check vacuous: the recorded tool would agree
   * with the declaration by construction, `foreignTools` would always be empty,
   * and a half-migrated assessment would produce a confident missing list -
   * which D23a names as the worst outcome available here.
   */
  readonly recordingTool: string;
}

export interface OfflineAssemblyInputs {
  readonly identity: OfflineIdentityIndex;
  /** ./engagement's student shape, with the roster spelling STRIPPED. The name
   *  is display-only and this module hands it to nobody. */
  readonly students: readonly EngagementStudent[];
  readonly scores: readonly OfflineRecordedScore[];
  readonly participation: readonly OfflineRecordedParticipation[];
  readonly assessments: readonly EngagementAssessment[];
  readonly submissions: readonly RecordedSubmission[];
  readonly declarations: readonly EngagementToolDeclaration[];
  readonly report: OfflineAssemblyReport;
}

function emptyNameCounts(): { matched: number; ambiguous: number; unmatched: number; noRoster: number } {
  return { matched: 0, ambiguous: 0, unmatched: 0, noRoster: 0 };
}

function tallyName(
  counts: { matched: number; ambiguous: number; unmatched: number; noRoster: number },
  resolution: OfflineIdentityResolution
): void {
  switch (resolution.outcome) {
    case "matched":
      counts.matched += 1;
      return;
    case "ambiguous":
      counts.ambiguous += 1;
      return;
    case "unmatched":
      counts.unmatched += 1;
      return;
    case "no-roster":
      counts.noRoster += 1;
      return;
    default: {
      const unhandled: never = resolution.outcome;
      return unhandled;
    }
  }
}

/**
 * D21d: does a recorded row belong to the course in scope?
 *
 * EXACT EQUALITY ONLY, and never a `??` fallback - grading-row.ts's own
 * `gradingRowMatchesCourse` rule, restated here because this module also has to
 * answer it for `ReplyRow`. A row carrying no course is UNATTRIBUTED and
 * matches nothing; coalescing it into whichever course happens to be open is
 * exactly the misattribution course scoping exists to prevent. A blank
 * `courseHubId` matches nothing either, so an assembly built with no course
 * adopts no rows rather than adopting all of them.
 */
function belongsToCourse(rowCourse: string | undefined, courseHubId: string): boolean {
  return courseHubId !== "" && rowCourse === courseHubId;
}

/**
 * Translate the browser's own tables into the three modules' input shapes.
 *
 * Separated from `assembleOfflineCourseIntel` so the translation can be tested
 * on its own, against the emitted shapes, without any of the three
 * computations in the way.
 */
export function mapOfflineAssemblyInputs(sources: OfflineAssemblySources): OfflineAssemblyInputs {
  const courseHubId = trimmed(sources.courseHubId);
  const recordingTool = trimmed(sources.recordingTool);

  const identity = buildOfflineIdentityIndex({
    courseHubId,
    rosterNames: sources.rosterNames,
    studentRepos: sources.studentRepos,
  });

  // Identity is resolved ONLY through ./offline-identity, never by a name
  // comparison written here. The cache is keyed on the raw captured string and
  // exists so a table with many rows per student resolves each distinct name
  // once; it changes no outcome.
  const resolutions = new Map<string, OfflineIdentityResolution>();
  const resolve = (readName: string): OfflineIdentityResolution => {
    const cached = resolutions.get(readName);
    if (cached) return cached;
    const resolved = resolveOfflineIdentity(identity, readName);
    resolutions.set(readName, resolved);
    return resolved;
  };
  /** Only a `matched` outcome carries a key. `ambiguous` attributes NOTHING -
   *  it is a question for the instructor, and both consumers count a null key
   *  as an unattributed row rather than dropping it. */
  const keyFor = (resolution: OfflineIdentityResolution): string | null =>
    resolution.outcome === "matched" ? resolution.key : null;

  const gradingRowNames = emptyNameCounts();
  const replyRowNames = emptyNameCounts();
  const scoreReadings: Record<RecordedScoreOutcome, number> = {
    "earned-and-possible": 0,
    "earned-only": 0,
    unreadable: 0,
    blank: 0,
  };

  const scores: OfflineRecordedScore[] = [];
  const submissions: RecordedSubmission[] = [];
  let gradingRowsOutsideCourseCount = 0;
  let gradingRowsWithoutAssessmentCount = 0;
  let submissionTimesKnownCount = 0;
  let submissionTimesInstructorMarkedLateCount = 0;
  let submissionTimesUnknownCount = 0;
  let unreadableSubmittedAtCount = 0;

  for (const row of sources.gradingRows) {
    if (!belongsToCourse(row.course, courseHubId)) {
      gradingRowsOutsideCourseCount += 1;
      continue;
    }
    const resolution = resolve(row.studentName);
    tallyName(gradingRowNames, resolution);
    const studentKey = keyFor(resolution);

    const assessmentId = trimmed(row.assessment);
    if (!assessmentId) {
      // Real work, locatable to a course and (sometimes) a student, but to no
      // assessment - so it can be neither a denominator entry nor a submission
      // against a deadline. Counted here rather than emitted with a blank id,
      // which both consumers would drop without counting.
      gradingRowsWithoutAssessmentCount += 1;
      continue;
    }

    const reading = readRecordedScore(row.totalScore);
    scoreReadings[reading.outcome] += 1;
    scores.push({
      assessmentId,
      studentKey,
      score: reading.score,
      pointsPossible: reading.pointsPossible,
      // `GradingRow` carries no capture timestamp, and the student's own
      // submission time is NOT one - it answers a different question, and
      // labelling it "recorded at" would turn ./offline-signals' "nothing
      // recorded for this student in N days" into a false sentence.
      recordedAt: null,
    });

    const declaredStatus = gradingRowSubmissionTimeStatus(row);
    const submittedAt = readSubmissionTime(row);
    if (declaredStatus === "known" && submittedAt.state !== "known") unreadableSubmittedAtCount += 1;
    if (submittedAt.state === "known") submissionTimesKnownCount += 1;
    else if (submittedAt.state === "instructor-marked") submissionTimesInstructorMarkedLateCount += 1;
    else submissionTimesUnknownCount += 1;

    submissions.push({ assessmentId, studentKey, tool: recordingTool, submittedAt });
  }

  const participation: OfflineRecordedParticipation[] = [];
  let replyRowsOutsideCourseCount = 0;
  let replyRowsWithUnknownThreadPositionCount = 0;
  let replyRowsWithUnreadablePostedAtCount = 0;

  for (const row of sources.replyRows) {
    if (!belongsToCourse(row.course, courseHubId)) {
      replyRowsOutsideCourseCount += 1;
      continue;
    }
    const resolution = resolve(row.author);
    tallyName(replyRowNames, resolution);

    const { kind, positionKnown } = readParticipationKind(row);
    if (!positionKnown) replyRowsWithUnknownThreadPositionCount += 1;

    const occurredAt = readDisplayedTimestamp(row.postedAt);
    if (occurredAt === null && trimmed(row.postedAt) !== "") replyRowsWithUnreadablePostedAtCount += 1;

    participation.push({ studentKey: keyFor(resolution), kind, occurredAt });
  }

  const assessments: EngagementAssessment[] = [];
  const seenAssessmentIds = new Set<string>();
  let assessmentsWithoutDeadlineCount = 0;
  let assessmentsWithUnreadableDeadlineCount = 0;
  let assessmentsDroppedWithoutIdCount = 0;

  for (const declaration of sources.assessmentDeclarations) {
    if (!belongsToCourse(declaration.courseId, courseHubId)) continue;
    const assessmentId = trimmed(declaration.assessmentId);
    if (!assessmentId) {
      assessmentsDroppedWithoutIdCount += 1;
      continue;
    }
    if (seenAssessmentIds.has(assessmentId)) continue;
    seenAssessmentIds.add(assessmentId);

    const deadlineText = trimmed(declaration.deadline);
    let deadlineAt: string | null = null;
    if (!deadlineText) {
      assessmentsWithoutDeadlineCount += 1;
    } else {
      deadlineAt = readDisplayedTimestamp(deadlineText);
      if (deadlineAt === null) assessmentsWithUnreadableDeadlineCount += 1;
    }

    assessments.push({
      assessmentId,
      // D25f. Never `declaration.workKind`.
      workKind: toEngagementWorkKind(declaration.workKind),
      deadlineAt,
    });
  }

  const declarations: EngagementToolDeclaration[] = [];
  for (const declaration of sources.toolDeclarations) {
    if (!belongsToCourse(declaration.courseId, courseHubId)) continue;
    const tool = trimmed(declaration.tool);
    // "" is the store's own "not yet declared". Passing it through would
    // declare the empty tool as authoritative and make every row foreign.
    if (!tool) continue;
    declarations.push({
      // D25f. Never `declaration.workKind`. This is the half that lands every
      // discussion assessment in `not-declared` when it is passed through.
      workKind: toEngagementWorkKind(declaration.workKind),
      tool,
    });
  }

  // The roster spelling is dropped here and travels no further. ./engagement
  // needs the index, the join key, the cached id and how we know it - nothing
  // else about a person.
  const students: EngagementStudent[] = identity.students.map((student) => ({
    index: student.index,
    key: student.key,
    userId: student.userId,
    identitySource: student.identitySource,
  }));

  const report: OfflineAssemblyReport = {
    courseHubId,
    recordingTool,
    gradingRowCount: sources.gradingRows.length,
    gradingRowsOutsideCourseCount,
    gradingRowsWithoutAssessmentCount,
    gradingRowNames,
    scoreReadings,
    submissionTimesKnownCount,
    submissionTimesInstructorMarkedLateCount,
    submissionTimesUnknownCount,
    unreadableSubmittedAtCount,
    scoresWithNoRecordedTimeCount: scores.length,
    replyRowCount: sources.replyRows.length,
    replyRowsOutsideCourseCount,
    replyRowNames,
    replyRowsWithUnknownThreadPositionCount,
    replyRowsWithUnreadablePostedAtCount,
    assessmentCount: assessments.length,
    assessmentsWithoutDeadlineCount,
    assessmentsWithUnreadableDeadlineCount,
    assessmentsDroppedWithoutIdCount,
    declaredToolCount: declarations.length,
  };

  return { identity, students, scores, participation, assessments, submissions, declarations, report };
}

// ---------------------------------------------------------------------------
// Running the three modules.
// ---------------------------------------------------------------------------

export interface AssembleOfflineCourseIntelArgs extends OfflineAssemblySources {
  /** The INSTRUCTOR's own dials for ./offline-signals, persisted from their own
   *  controls. Required rather than defaulted, so the judgement is visibly
   *  theirs at every call site. */
  readonly concernThresholds: ConcernThresholds;
  /** The INSTRUCTOR's own dials for ./engagement. `DEFAULT_ENGAGEMENT_
   *  THRESHOLDS` is exported from that module for a caller with none stored. */
  readonly engagementThresholds: EngagementThresholds;
  /** ISO. A parameter, never a clock read inside this module, so the same
   *  inputs always produce the same assembly. */
  readonly now: string;
}

export interface OfflineCourseIntel {
  readonly courseHubId: string;
  readonly identity: OfflineIdentityIndex;
  readonly concerns: OfflineConcernSet;
  readonly engagement: EngagementSet;
  readonly report: OfflineAssemblyReport;
}

/**
 * The whole offline path, end to end: the browser's recorded tables in, the
 * three computed sets out.
 *
 * TWO DENOMINATORS, ON PURPOSE, and a reader must not average them. The two
 * computations answer different questions from the same rows:
 *
 *   ./offline-signals counts against the assessments the instructor has
 *   ACTUALLY GRADED SOMEBODY ON - the weak, relative reading D22d settled for,
 *   which needs no declaration and no deadline and is available immediately;
 *
 *   ./engagement counts against the assessments the instructor has DECLARED a
 *   deadline and an authoritative tool for - D23a's absolute reading, measured
 *   against the roster, which is stronger and is unavailable until those
 *   declarations exist.
 *
 * Both sets are returned so a caller can state which basis an answer used. They
 * will legitimately disagree, and neither is a correction of the other.
 */
export function assembleOfflineCourseIntel(args: AssembleOfflineCourseIntelArgs): OfflineCourseIntel {
  const inputs = mapOfflineAssemblyInputs(args);

  const concerns = computeOfflineConcernSet({
    students: inputs.identity.students,
    scores: inputs.scores,
    participation: inputs.participation,
    thresholds: args.concernThresholds,
    now: args.now,
  });

  const engagement = computeEngagementSet({
    students: inputs.students,
    assessments: inputs.assessments,
    submissions: inputs.submissions,
    declarations: inputs.declarations,
    thresholds: args.engagementThresholds,
    now: args.now,
  });

  return {
    courseHubId: inputs.report.courseHubId,
    identity: inputs.identity,
    concerns,
    engagement,
    report: inputs.report,
  };
}
