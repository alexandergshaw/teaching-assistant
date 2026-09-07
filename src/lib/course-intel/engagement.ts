// course-intel: ENGAGEMENT. Missing, late and resubmission - and the three
// outcomes those metrics separate students into.
//
// Read decision D23 (docs/course-student-intelligence-acceptance-criteria.md)
// and ./concern.ts before changing a line of this file. D23 supersedes most of
// D22d, and three ideas in it are load-bearing here:
//
//   D23a THE HOMOGENEITY ASSUMPTION IS WHAT MAKES ABSENCE MEAN SOMETHING. If
//   one tool is the authoritative grader for a kind of work in a course, then
//   for an assessment of that kind that tool's rows are the COMPLETE record.
//   Absence stops being "we did not see it" and becomes "it is not there", and
//   the comparison set upgrades from "students others were graded against" to
//   THE ROSTER. The assumption is the instructor's statement about how they
//   work, so it must be DECLARED rather than inferred - and if rows for an
//   assessment turn up from a tool that is not the declared one, the
//   assumption is VIOLATED for that assessment and its missing count is wrong.
//   That is a reportable state here, never a silently wrong number.
//
//   D23c LATENESS HAS A DEPENDENCY THE OTHER TWO DO NOT, AND IT IS NOT FUDGED.
//   Submission time is THREE-VALUED. A row whose time is unknown is neither
//   late nor on time - it is unknown, and it is reported as unknown. The
//   capture time is explicitly REJECTED as a proxy: that is when the
//   INSTRUCTOR graded, so grading a week after a deadline would mark the whole
//   class late. That exact class of error - a signal that is secretly about
//   the instructor's own cadence - already had to be corrected once in this
//   feature (D22c), and it would be worse here because it looks plausible.
//
//   D23d THREE OUTCOMES, NOT ONE, AND THE THIRD IS THE VALUABLE ONE. Doing
//   well, needing outreach, and ACTIVELY WORKING TO REMEDY. The third is a
//   genuinely different state and not a milder second: outreach sent to a
//   student who is already doing the thing the outreach would ask for is
//   worse than saying nothing. So `recovering` is its own outcome with its own
//   behavioural evidence - late-but-present submissions, resubmissions,
//   recency of activity after a gap - and it is NEVER folded into the concern
//   list as a weaker concern. It is also the first thing that gives the
//   concern set a reason to REMOVE a student, and that reason is COMPUTED
//   here, not noticed by a model.
//
// D1 STANDS UNCHANGED AND MATTERS MORE HERE, NOT LESS. Membership is decided
// in TypeScript, before any model call, from typed identifiers, timestamps and
// booleans. It matters more because these categories carry a RECOMMENDATION
// ABOUT A PERSON: "recovering" suppresses an outreach message and
// "needs-outreach" sends one. This module reads no student-authored text of
// any kind, so no recorded text - hostile or otherwise - can move a student
// between those two buckets.
//
// NOTHING HERE EMITS A NAME OR A LOGIN ID. Rows carry `studentIndex`, and the
// join key (which embeds the canonicalised name - see offline-identity.ts) is
// consumed and discarded. Every label is built in code from typed numbers.
//
// PURE LEAF: no React, no DOM, no node builtins, no clock (`now` is a
// parameter), no randomness.

import type {
  CanvasUserId,
  ConcernSignal,
  EngagementCaveat,
  EngagementCaveatKind,
  EngagementOutcome,
  StudentIdentitySource,
  StudentIndex,
} from "./types";

/**
 * The kinds of work a course grades, at exactly the granularity D23a
 * describes: the instructor declares an authoritative tool per course PER KIND
 * OF WORK, because a course can reasonably grade discussion posts in one tool
 * and assignments in another and still be perfectly homogeneous within each.
 */
export type WorkKind = "assignment" | "discussion-post";

/**
 * The instructor's declaration that ONE tool is the complete record for one
 * kind of work in this course.
 *
 * This is the whole basis of the missing signal, and it is a statement about
 * how the instructor works rather than something this app can observe. Two
 * declarations for the same work kind naming different tools is not a
 * declaration at all - it is a contradiction - and is treated as undeclared.
 */
export interface GradingToolDeclaration {
  readonly workKind: WorkKind;
  /** Opaque and caller-minted. Compared as a trimmed string, never parsed. */
  readonly tool: string;
}

/**
 * One assessment, with the deadline the instructor entered by hand.
 *
 * D23b: the manual deadline is the piece that unblocks two signals rather than
 * one. D22d treated the absent due date as a permanent property of recorded
 * rows; it is a gap the instructor can fill.
 */
export interface EngagementAssessment {
  /** Opaque and caller-minted - an assignment name, a capture-session id,
   *  whatever the recording surface scopes a grading pass by. Blank ids are
   *  ignored: an assessment that cannot be named cannot be a denominator
   *  entry. */
  readonly assessmentId: string;
  readonly workKind: WorkKind;
  /** ISO, instructor-entered. `null` means they have not entered one, and
   *  neither missing nor late is computable for this assessment. */
  readonly deadlineAt: string | null;
}

/**
 * WHEN THE STUDENT SUBMITTED - three-valued, and the third value is the point.
 *
 * D23c ranked three candidate sources and blessed two:
 *   1. the submission timestamp shown on screen, extracted during capture -
 *      the only source that actually answers the question;
 *   2. the instructor marking the row late while grading - cheap, accurate,
 *      and already how they would know;
 *   3. the CAPTURE TIME as a proxy - REJECTED, and it must stay rejected.
 *      There is deliberately no variant here that a capture time could be
 *      written into, so the rejected inference is unavailable rather than
 *      merely discouraged.
 */
export type SubmissionTime =
  /** Source (1). Orders resubmissions and dates remediation. */
  | { readonly state: "known"; readonly submittedAt: string }
  /**
   * Source (2). Lateness is KNOWN, the instant is not - so this row can say
   * whether it was late and can never say when, which means it orders nothing
   * and dates nothing.
   */
  | { readonly state: "instructor-marked"; readonly late: boolean }
  /** Neither source had it. NOT on time and NOT late. */
  | { readonly state: "unknown" };

/**
 * One recorded submission, reduced to the typed facts this module needs.
 *
 * Deliberately NOT a UI row type. Mapping is the caller's job, which keeps
 * this module testable against a frozen fixture rather than a moving surface -
 * the same boundary `OfflineRecordedScore` draws in ./offline-signals.
 *
 * No score field, on purpose. D23d's evidence for recovery is BEHAVIOURAL
 * rather than score-based, and scores are already ./offline-signals' job.
 */
export interface RecordedSubmission {
  readonly assessmentId: string;
  /**
   * The `(name, course)` key from `offlineStudentKey`, or `null` when the
   * captured name resolved to no single student.
   *
   * A null key attributes to nobody and is COUNTED rather than dropped -
   * because one of those rows could belong to the very student the missing
   * computation is about to call absent.
   */
  readonly studentKey: string | null;
  /** Which tool recorded this row. Checked against the declared authoritative
   *  tool for the assessment's work kind - see D23a. */
  readonly tool: string;
  readonly submittedAt: SubmissionTime;
}

/**
 * One student of this course, as this module needs them.
 *
 * Declared STRUCTURALLY rather than imported: `OfflineStudentIdentity`
 * satisfies it as written, and this file stays a leaf with one import.
 *
 * `key` is `null` when the name is not a usable join key in this course -
 * an ambiguous name being the case that matters. Such a student is excluded
 * from every missing count and reported as insufficient-data, because a
 * student who cannot be joined would otherwise look absent from work they
 * actually did.
 */
export interface EngagementStudent {
  readonly index: StudentIndex;
  readonly key: string | null;
  readonly userId: CanvasUserId | null;
  readonly identitySource: StudentIdentitySource;
}

/**
 * Whether MISSING could be computed for one assessment, and if not, why.
 *
 * A UNION, not a number plus a validity flag, because "3 of 8 missing" must be
 * structurally unavailable when the basis for it does not hold. The same
 * discipline `OfflineRecordedRollup` applies to "missing 8 of 8": a boundary
 * that matters should be a compile error rather than a convention.
 */
export type AssessmentMissingState =
  | {
      readonly state: "computed";
      /** Roster students with NO row for this assessment at or after its
       *  deadline. Indices only - never a name. */
      readonly missingStudentIndexes: readonly StudentIndex[];
    }
  /** No authoritative tool declared for this work kind, so absence means
   *  nothing. D23a: the assumption must be declared, not inferred. */
  | { readonly state: "not-declared" }
  /** Rows arrived from a tool other than the declared one. The missing count
   *  for this assessment would be WRONG, so there is none. */
  | { readonly state: "violated"; readonly foreignTools: readonly string[] }
  | { readonly state: "no-deadline" }
  | { readonly state: "not-yet-due" }
  | { readonly state: "no-reference-time" };

export interface AssessmentEngagementReport {
  readonly assessmentId: string;
  readonly workKind: WorkKind;
  readonly declaredTool: string | null;
  readonly missing: AssessmentMissingState;
  readonly rowCount: number;
  readonly unattributedRowCount: number;
  readonly lateRowCount: number;
  readonly onTimeRowCount: number;
  readonly unknownTimeRowCount: number;
}

/** One student's engagement numbers. Every count states its own basis. */
export interface EngagementMetrics {
  /** Assessments where missing was SOUNDLY computable and this student had no
   *  row at all. */
  readonly missingCount: number;
  /** The "of 8" for `missingCount`. BOTH NUMBERS COME FROM THE SAME SET or
   *  the sentence is false - the denominator rule from the live path. */
  readonly missingConsideredCount: number;
  readonly lateCount: number;
  readonly onTimeCount: number;
  /** Neither late nor on time. Reported, never rounded into either. */
  readonly unknownTimeCount: number;
  /** Assessments this student has more than one row for. Needs no timestamp. */
  readonly resubmittedAssessmentCount: number;
  /** Of those, how many could not be ORDERED because some row's time is
   *  unknown. We can say a resubmission happened and not which came first. */
  readonly unorderedResubmissionCount: number;
  /** Dated remediation actions - a late-but-present submission, or a
   *  resubmission that could be ordered - at any time. */
  readonly datedRemediationCount: number;
  /** Those inside the recovery window. THIS is what separates recovering from
   *  disengaged. */
  readonly recentRemediationCount: number;
  readonly daysSinceLastDatedAction: number | null;
  /** Days of silence immediately before the most recent dated action, or null
   *  when there is no earlier dated action to measure from. */
  readonly gapBeforeLastActionDays: number | null;
}

export interface EngagementRow {
  readonly studentIndex: StudentIndex;
  /** Only from a cached `student_repos[].canvasUserId`. Never synthesised -
   *  see D19f and OfflineConcernRow's own doc. */
  readonly userId: CanvasUserId | null;
  readonly identitySource: StudentIdentitySource;
  readonly outcome: EngagementOutcome;
  /** Built in code from typed numbers. The model EXPLAINS these; it never
   *  chooses them. */
  readonly signals: readonly ConcernSignal[];
  readonly metrics: EngagementMetrics;
  /** Ordering only. Never shown as a score, never described to the model as a
   *  ranking - see ConcernRow's doc in ./types. */
  readonly sortWeight: number;
}

export interface EngagementSet {
  /** Every student examined, sorted. */
  readonly rows: readonly EngagementRow[];
  /**
   * THE CONCERN LIST, and a recovering student is NOT in it.
   *
   * That exclusion is the whole point of D23d and is enforced structurally by
   * partitioning on `outcome` rather than by a threshold a caller could tune
   * until the two buckets overlap.
   */
  readonly needsOutreach: readonly EngagementRow[];
  /** Actively working to remedy. Its own category, with its own evidence. */
  readonly recovering: readonly EngagementRow[];
  readonly doingWell: readonly EngagementRow[];
  /** Reported rather than omitted, and never counted as doing well. */
  readonly insufficientData: readonly EngagementRow[];
  readonly assessments: readonly AssessmentEngagementReport[];
  /** Assessment ids whose missing count was computed, in input order, so a
   *  caller can state what "of 8" actually refers to. */
  readonly consideredAssessmentIds: readonly string[];
  readonly caveats: readonly EngagementCaveat[];
  readonly thresholds: EngagementThresholds;
}

/**
 * The instructor's dials, persisted from their own controls so the judgement
 * is theirs and reproducible rather than a constant buried in a prompt.
 *
 * Deliberately NOT an extension of `ConcernThresholds`: there is no score
 * threshold here, because D23d's evidence is behavioural. Folding a score
 * dial in would invite exactly the score-based reading of recovery that D23d
 * rules out.
 */
export interface EngagementThresholds {
  /** This many missing assessments, or more, is a concern signal. */
  readonly minMissingCount: number;
  /** This many late submissions, or more. A separate dial from missing
   *  because, unlike in ./concern, lateness here is a first-class measured
   *  fact rather than a borrowed flag. */
  readonly minLateCount: number;
  /** How recent a dated remediation action must be to count toward recovery. */
  readonly recoveryWindowDays: number;
  /** How many dated, in-window remediation actions make a student RECOVERING
   *  rather than needing outreach. */
  readonly minRecoveryActions: number;
  /** Silence of at least this many days before a recent action makes that
   *  action "activity after a gap". */
  readonly gapDays: number;
}

/**
 * Defaults, not the rule.
 *
 * `minMissingCount` and `minLateCount` are 2 for ./concern's reason: a single
 * missed deadline is ordinary, and a threshold that flags most of a class
 * teaches an instructor to ignore the list.
 *
 * `minRecoveryActions` IS 1, AND THAT IS THE MOST CONSEQUENTIAL NUMBER HERE.
 * The distinction D23d draws is EFFORT VERSUS SILENCE - "three late and two
 * resubmissions" against "three missing and silence" - not a large amount of
 * effort against a small one. Requiring a second action would put a student
 * who has just started turning work in again back into the disengaged bucket,
 * which is the precise error D23d names. The strictness lives in what COUNTS
 * as an action instead: it must be remediation, it must be dated, and it must
 * be recent.
 *
 * Fourteen days for both windows, matching `staleActivityDays`: a fortnight
 * spans more than one class week on any schedule.
 */
export const DEFAULT_ENGAGEMENT_THRESHOLDS: EngagementThresholds = Object.freeze({
  minMissingCount: 2,
  minLateCount: 2,
  recoveryWindowDays: 14,
  minRecoveryActions: 1,
  gapDays: 14,
});

const MS_PER_DAY = 86_400_000;

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Whole days between two instants, floored, never negative - the same
 *  clock-skew treatment ./concern and ./offline-signals apply. */
function wholeDaysSince(thenMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - thenMs) / MS_PER_DAY));
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function trimmed(raw: string): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/** Late, on time, or unknown. Never a boolean - see SubmissionTime. */
type Lateness = "late" | "on-time" | "unknown";

function classifyLateness(time: SubmissionTime, deadlineMs: number | null): Lateness {
  // The instructor's own mark is a direct statement and needs no deadline to
  // compare against. It is the D23c fallback, and it is authoritative.
  if (time.state === "instructor-marked") return time.late ? "late" : "on-time";
  if (time.state === "unknown") return "unknown";
  const submittedMs = parseMs(time.submittedAt);
  // An unparseable timestamp is unknown, never optimistically on time.
  if (submittedMs === null || deadlineMs === null) return "unknown";
  return submittedMs > deadlineMs ? "late" : "on-time";
}

/** The dating instant of a row, or null when it has none. `instructor-marked`
 *  deliberately has none: it knows lateness, not when. */
function datedMs(time: SubmissionTime): number | null {
  return time.state === "known" ? parseMs(time.submittedAt) : null;
}

interface RowFact {
  readonly lateness: Lateness;
  readonly datedMs: number | null;
}

export interface ComputeEngagementArgs {
  /** This course's students. Every one is examined - a student with nothing
   *  computable is REPORTED as such, never omitted. */
  readonly students: readonly EngagementStudent[];
  readonly assessments: readonly EngagementAssessment[];
  readonly submissions: readonly RecordedSubmission[];
  /** What the instructor declared about how they grade. Without one for a work
   *  kind, missing is NOT computed for assessments of that kind. */
  readonly declarations: readonly GradingToolDeclaration[];
  readonly thresholds: EngagementThresholds;
  /** ISO. A parameter, never a clock read inside this module, so the same
   *  inputs always produce the same set. */
  readonly now: string;
}

/**
 * Compute the engagement set.
 *
 * WHICH SIGNALS QUALIFY A STUDENT AS A CONCERN, and why the list is shorter
 * than the signal vocabulary:
 *
 *   QUALIFYING - missing-work and late-work. Both are dialled by the
 *   instructor's own thresholds.
 *
 *   EVIDENCE ONLY - resubmission, unknown-submission-time, ungraded-gap,
 *   recent-activity-after-gap. None of them creates a concern. A resubmission
 *   is somebody doing MORE work, not less; an unknown time is our gap; the
 *   ungraded gap is the instructor's own backlog. Letting any of them qualify
 *   would put students on an outreach list for the tool's shortcomings.
 *
 * THE RECOVERY RULE, stated once so it can be argued with:
 *
 *   A student is RECOVERING when they have at least one qualifying concern
 *   signal AND at least `minRecoveryActions` dated remediation actions inside
 *   the recovery window. A remediation action is a late-but-present submission
 *   or an orderable resubmission - the two behaviours that mean "working to
 *   remedy" rather than "still absent".
 *
 *   The first clause matters: a student with no concern signal is DOING WELL,
 *   not recovering. Recovery is only meaningful as an alternative to concern,
 *   and it is where a student LEAVES the concern list.
 *
 *   The dated-and-recent requirement is the one place this module refuses to
 *   be generous, and the asymmetry is deliberate. Recovery SUPPRESSES an
 *   outreach message. Suppressing outreach on the strength of an undated
 *   action - work that might be from last term - is the failure that hurts a
 *   real person, and it is silent. A false "needs outreach" costs a message
 *   that a recovering student can absorb, and the row carries its remediation
 *   evidence either way, so an instructor reading "3 missing, 2 resubmissions,
 *   submission times unknown" does not write to them as though they had
 *   vanished.
 */
export function computeEngagementSet(args: ComputeEngagementArgs): EngagementSet {
  const { thresholds } = args;
  const nowMs = parseMs(args.now);
  const caveats: EngagementCaveat[] = [];

  // THE DECLARATION MAP. A work kind with two conflicting declarations has no
  // declaration: a contradiction is not a statement about how the instructor
  // works, and resolving it by picking one would be exactly the guess D23a
  // says must not be made.
  const declaredTools = new Map<WorkKind, string>();
  const contradicted = new Set<WorkKind>();
  for (const declaration of args.declarations) {
    const tool = trimmed(declaration.tool);
    if (!tool) continue;
    const existing = declaredTools.get(declaration.workKind);
    if (existing !== undefined && existing !== tool) contradicted.add(declaration.workKind);
    else if (existing === undefined) declaredTools.set(declaration.workKind, tool);
  }
  for (const kind of contradicted) declaredTools.delete(kind);

  // The assessment list is authoritative. A row naming an assessment that is
  // not on it is used for NOTHING - it could be from another course entirely -
  // and is counted rather than silently dropped.
  const assessments: EngagementAssessment[] = [];
  const seenAssessmentIds = new Set<string>();
  for (const assessment of args.assessments) {
    const id = trimmed(assessment.assessmentId);
    if (!id || seenAssessmentIds.has(id)) continue;
    seenAssessmentIds.add(id);
    assessments.push({ ...assessment, assessmentId: id });
  }

  const rowsByAssessment = new Map<string, RecordedSubmission[]>();
  let orphanRowCount = 0;
  for (const submission of args.submissions) {
    const id = trimmed(submission.assessmentId);
    if (!id || !seenAssessmentIds.has(id)) {
      orphanRowCount += 1;
      continue;
    }
    const bucket = rowsByAssessment.get(id);
    if (bucket) bucket.push(submission);
    else rowsByAssessment.set(id, [submission]);
  }

  // Only a joinable student can be found PRESENT, so only a joinable student
  // may be reported missing. An ambiguous name excluded here would otherwise
  // look absent from work they actually did.
  const joinableKeys = new Set<string>();
  let ambiguousStudentCount = 0;
  for (const student of args.students) {
    if (student.key === null) ambiguousStudentCount += 1;
    else joinableKeys.add(student.key);
  }

  // Per student, per assessment. Facts only - the classification of a row
  // never depends on which student it belongs to.
  const factsByStudent = new Map<string, Map<string, RowFact[]>>();
  const assessmentReports: AssessmentEngagementReport[] = [];
  const consideredAssessmentIds: string[] = [];
  const notDeclaredIds: string[] = [];
  const violatedIds: string[] = [];
  const noDeadlineIds: string[] = [];
  const notYetDueIds: string[] = [];
  let unattributedRowCount = 0;
  let unknownTimeRowCount = 0;

  for (const assessment of assessments) {
    const id = assessment.assessmentId;
    const rows = rowsByAssessment.get(id) ?? [];
    const declaredTool = declaredTools.get(assessment.workKind) ?? null;
    const deadlineMs = parseMs(assessment.deadlineAt);

    const foreignTools: string[] = [];
    const presentKeys = new Set<string>();
    let assessmentUnattributed = 0;
    let lateRowCount = 0;
    let onTimeRowCount = 0;
    let unknownRowCount = 0;

    for (const row of rows) {
      const tool = trimmed(row.tool);
      if (declaredTool !== null && tool !== declaredTool && !foreignTools.includes(tool)) {
        foreignTools.push(tool);
      }
      const lateness = classifyLateness(row.submittedAt, deadlineMs);
      if (lateness === "late") lateRowCount += 1;
      else if (lateness === "on-time") onTimeRowCount += 1;
      else unknownRowCount += 1;

      if (row.studentKey === null || !joinableKeys.has(row.studentKey)) {
        assessmentUnattributed += 1;
        continue;
      }
      presentKeys.add(row.studentKey);
      let byAssessment = factsByStudent.get(row.studentKey);
      if (!byAssessment) {
        byAssessment = new Map<string, RowFact[]>();
        factsByStudent.set(row.studentKey, byAssessment);
      }
      const fact: RowFact = { lateness, datedMs: datedMs(row.submittedAt) };
      const facts = byAssessment.get(id);
      if (facts) facts.push(fact);
      else byAssessment.set(id, [fact]);
    }

    unattributedRowCount += assessmentUnattributed;
    unknownTimeRowCount += unknownRowCount;

    // ORDER MATTERS. An undeclared assumption is the primary reason and
    // dominates every other: without it, absence means nothing at all, so
    // there is nothing for a deadline to make meaningful.
    let missing: AssessmentMissingState;
    if (declaredTool === null) {
      missing = { state: "not-declared" };
      notDeclaredIds.push(id);
    } else if (foreignTools.length > 0) {
      missing = { state: "violated", foreignTools };
      violatedIds.push(id);
    } else if (deadlineMs === null) {
      missing = { state: "no-deadline" };
      noDeadlineIds.push(id);
    } else if (nowMs === null) {
      missing = { state: "no-reference-time" };
    } else if (nowMs < deadlineMs) {
      missing = { state: "not-yet-due" };
      notYetDueIds.push(id);
    } else {
      const missingStudentIndexes: StudentIndex[] = [];
      for (const student of args.students) {
        if (student.key === null || presentKeys.has(student.key)) continue;
        missingStudentIndexes.push(student.index);
      }
      missing = { state: "computed", missingStudentIndexes };
      consideredAssessmentIds.push(id);
    }

    assessmentReports.push({
      assessmentId: id,
      workKind: assessment.workKind,
      declaredTool,
      missing,
      rowCount: rows.length,
      unattributedRowCount: assessmentUnattributed,
      lateRowCount,
      onTimeRowCount,
      unknownTimeRowCount: unknownRowCount,
    });
  }

  const missingIndexCounts = new Map<StudentIndex, number>();
  for (const report of assessmentReports) {
    if (report.missing.state !== "computed") continue;
    for (const index of report.missing.missingStudentIndexes) {
      missingIndexCounts.set(index, (missingIndexCounts.get(index) ?? 0) + 1);
    }
  }

  const rows: EngagementRow[] = [];
  for (const student of args.students) {
    rows.push(
      buildRow({
        student,
        facts: student.key === null ? undefined : factsByStudent.get(student.key),
        missingCount: missingIndexCounts.get(student.index) ?? 0,
        missingConsideredCount: consideredAssessmentIds.length,
        thresholds,
        nowMs,
      })
    );
  }

  rows.sort(
    (a, b) =>
      outcomeRank(b.outcome) - outcomeRank(a.outcome) ||
      b.sortWeight - a.sortWeight ||
      a.studentIndex - b.studentIndex
  );

  const needsOutreach = rows.filter((row) => row.outcome === "needs-outreach");
  const recovering = rows.filter((row) => row.outcome === "recovering");
  const doingWell = rows.filter((row) => row.outcome === "doing-well");
  const insufficientData = rows.filter((row) => row.outcome === "insufficient-data");

  const anyMissingReported = rows.some((row) => row.metrics.missingCount > 0);
  if (anyMissingReported) {
    // D23f, UNCONDITIONAL whenever a missing count is reported. The tool sees
    // only what was GRADED, so a student waiting on the instructor is
    // indistinguishable from one who did not submit. This is the one place the
    // design can call an honest student missing, and it must be stated as data
    // rather than left for the instructor to remember.
    caveats.push({
      kind: "ungraded-gap",
      detail:
        "Missing means no graded row by the deadline. A student who submitted and is waiting on you to grade it looks the same as one who did not submit, so any of these may be work you have not marked yet.",
    });
  }
  pushIdCaveat(caveats, "assumption-not-declared", notDeclaredIds, (n) =>
    `Missing work was not computed for ${plural(n, "assessment")}: no single grading tool is declared as the complete record for that kind of work, so a student having no row there means nothing.`
  );
  pushIdCaveat(caveats, "assumption-violated", violatedIds, (n) =>
    `Missing work was not computed for ${plural(n, "assessment")}: rows arrived from a tool other than the declared one, so the assumption that one tool holds the complete record does not hold and any missing count would be wrong.`
  );
  pushIdCaveat(caveats, "no-deadline", noDeadlineIds, (n) =>
    `${plural(n, "assessment")} has no deadline entered, so neither missing nor late work was computed for ${n === 1 ? "it" : "them"}.`
  );
  pushIdCaveat(caveats, "deadline-not-passed", notYetDueIds, (n) =>
    `${plural(n, "assessment")} is not past its deadline yet, so nobody is missing work on ${n === 1 ? "it" : "them"}.`
  );
  if (nowMs === null) {
    caveats.push({
      kind: "no-reference-time",
      detail: "The reference time could not be read, so nothing that depends on a date was computed.",
    });
  }
  if (unattributedRowCount > 0) {
    caveats.push({
      kind: "unattributed-rows",
      detail: `${plural(unattributedRowCount, "recorded row")} could not be attributed to a student in this course. One of them may belong to a student reported as missing work.`,
      count: unattributedRowCount,
    });
  }
  if (orphanRowCount > 0) {
    caveats.push({
      kind: "orphan-rows",
      detail: `${plural(orphanRowCount, "recorded row")} names an assessment that is not in this course's assessment list, and was not used.`,
      count: orphanRowCount,
    });
  }
  if (unknownTimeRowCount > 0) {
    caveats.push({
      kind: "unknown-submission-times",
      detail: `${plural(unknownTimeRowCount, "submission")} has no known submission time. Those are neither late nor on time, and a capture time is never used in their place because that records when you graded, not when the student submitted.`,
      count: unknownTimeRowCount,
    });
  }
  if (ambiguousStudentCount > 0) {
    caveats.push({
      kind: "ambiguous-name",
      detail: `${plural(ambiguousStudentCount, "student")} could not be joined to recorded work, and so is excluded from every missing count rather than reported absent from work they may have done.`,
      count: ambiguousStudentCount,
    });
  }

  return {
    rows,
    needsOutreach,
    recovering,
    doingWell,
    insufficientData,
    assessments: assessmentReports,
    consideredAssessmentIds,
    caveats,
    thresholds,
  };
}

function pushIdCaveat(
  caveats: EngagementCaveat[],
  kind: EngagementCaveatKind,
  ids: readonly string[],
  detail: (count: number) => string
): void {
  if (ids.length === 0) return;
  caveats.push({ kind, detail: detail(ids.length), count: ids.length, assessmentIds: ids });
}

/** Outcome ordering. Concern first, then recovery, then the students who are
 *  fine, and "we do not know" last - because it is a different KIND of
 *  statement rather than a milder one, exactly as ./concern sorts it. */
function outcomeRank(outcome: EngagementOutcome): number {
  switch (outcome) {
    case "needs-outreach":
      return 3;
    case "recovering":
      return 2;
    case "doing-well":
      return 1;
    case "insufficient-data":
      return 0;
  }
}

function buildRow(args: {
  student: EngagementStudent;
  facts: ReadonlyMap<string, RowFact[]> | undefined;
  missingCount: number;
  missingConsideredCount: number;
  thresholds: EngagementThresholds;
  nowMs: number | null;
}): EngagementRow {
  const { student, facts, missingCount, missingConsideredCount, thresholds, nowMs } = args;

  let lateCount = 0;
  let onTimeCount = 0;
  let unknownTimeCount = 0;
  let resubmittedAssessmentCount = 0;
  let unorderedResubmissionCount = 0;
  let datedRemediationCount = 0;
  let recentRemediationCount = 0;
  const datedActionMs: number[] = [];
  const windowMs = Math.max(0, thresholds.recoveryWindowDays) * MS_PER_DAY;

  if (facts) {
    for (const group of facts.values()) {
      for (const fact of group) {
        if (fact.lateness === "late") lateCount += 1;
        else if (fact.lateness === "on-time") onTimeCount += 1;
        else unknownTimeCount += 1;
        if (fact.datedMs !== null) datedActionMs.push(fact.datedMs);
      }

      // RESUBMISSION NEEDS NO TIMESTAMP - it is a multiplicity fact. ORDERING
      // does, and refusing to order is not a shortcoming to be worked around:
      // picking a first submission from partially dated rows would invent the
      // one fact the instructor would actually act on.
      const orderable = group.every((fact) => fact.datedMs !== null);
      if (group.length > 1) {
        resubmittedAssessmentCount += 1;
        if (!orderable) unorderedResubmissionCount += 1;
      }

      // Which rows count as REMEDIATION. A late-but-present submission always
      // does. A resubmission only does when the group can be ordered, because
      // otherwise the row we would be crediting might be the original.
      const earliestMs = orderable
        ? group.reduce(
            (min, fact) => (fact.datedMs !== null && fact.datedMs < min ? fact.datedMs : min),
            Number.POSITIVE_INFINITY
          )
        : null;
      let earliestClaimed = false;
      for (const fact of group) {
        if (fact.datedMs === null) continue;
        let remediation = fact.lateness === "late";
        if (!remediation && earliestMs !== null && group.length > 1) {
          // Everything after the earliest dated row in a multi-row group is a
          // resubmission. Ties claim the earliest slot once, so two rows at the
          // same instant still yield exactly one resubmission.
          if (fact.datedMs > earliestMs) remediation = true;
          else if (earliestClaimed) remediation = true;
          else earliestClaimed = true;
        }
        if (!remediation) continue;
        datedRemediationCount += 1;
        if (nowMs !== null && nowMs - fact.datedMs <= windowMs) recentRemediationCount += 1;
      }
    }
  }

  datedActionMs.sort((a, b) => a - b);
  const lastDatedMs = datedActionMs.length > 0 ? datedActionMs[datedActionMs.length - 1] : null;
  const previousDatedMs = datedActionMs.length > 1 ? datedActionMs[datedActionMs.length - 2] : null;
  const daysSinceLastDatedAction =
    lastDatedMs !== null && nowMs !== null ? wholeDaysSince(lastDatedMs, nowMs) : null;
  const gapBeforeLastActionDays =
    lastDatedMs !== null && previousDatedMs !== null ? wholeDaysSince(previousDatedMs, lastDatedMs) : null;

  const metrics: EngagementMetrics = {
    missingCount,
    missingConsideredCount,
    lateCount,
    onTimeCount,
    unknownTimeCount,
    resubmittedAssessmentCount,
    unorderedResubmissionCount,
    datedRemediationCount,
    recentRemediationCount,
    daysSinceLastDatedAction,
    gapBeforeLastActionDays,
  };

  const signals: ConcernSignal[] = [];
  let concerned = false;

  if (missingCount > 0 && missingCount >= thresholds.minMissingCount) {
    concerned = true;
    signals.push({
      kind: "missing-work",
      // Both numbers come from the same set - the assessments whose missing
      // state is `computed`. Rendering them from two different sets would make
      // this sentence false while looking right.
      label: `No submission by the deadline on ${missingCount} of ${plural(missingConsideredCount, "assessment")}`,
      value: missingCount,
    });
  }
  if (lateCount > 0 && lateCount >= thresholds.minLateCount) {
    concerned = true;
    signals.push({
      kind: "late-work",
      label: `${plural(lateCount, "submission")} after the deadline`,
      value: lateCount,
    });
  }

  // EVIDENCE, NEVER A TRIGGER. See computeEngagementSet's own doc for why each
  // of these would put students on an outreach list for the tool's gaps.
  if (resubmittedAssessmentCount > 0) {
    signals.push({
      kind: "resubmission",
      label:
        unorderedResubmissionCount > 0
          ? `${plural(resubmittedAssessmentCount, "assessment")} with more than one submission (${unorderedResubmissionCount} of them cannot be put in order, because some submission times are unknown)`
          : `${plural(resubmittedAssessmentCount, "assessment")} resubmitted`,
      value: resubmittedAssessmentCount,
    });
  }
  if (unknownTimeCount > 0) {
    signals.push({
      kind: "unknown-submission-time",
      label: `${plural(unknownTimeCount, "submission")} with no known submission time, so neither on time nor late`,
      value: unknownTimeCount,
    });
  }
  if (missingCount > 0) {
    signals.push({
      kind: "ungraded-gap",
      label: "Missing here means no graded row by the deadline, so some of it may be work you have not marked yet",
      value: null,
    });
  }
  if (
    daysSinceLastDatedAction !== null &&
    daysSinceLastDatedAction <= thresholds.recoveryWindowDays &&
    gapBeforeLastActionDays !== null &&
    gapBeforeLastActionDays >= thresholds.gapDays
  ) {
    signals.push({
      kind: "recent-activity-after-gap",
      label: `Submitted ${plural(daysSinceLastDatedAction, "day")} ago after ${plural(gapBeforeLastActionDays, "day")} with nothing submitted`,
      value: gapBeforeLastActionDays,
    });
  }

  // NOTHING COMPUTABLE. A student who cannot be joined, or one for whom no
  // assessment yielded a sound missing state and who has no rows, is REPORTED
  // as unknown rather than quietly counted among the students who are fine.
  const nothingKnown =
    student.key === null ||
    student.identitySource === "ambiguous-name" ||
    ((facts === undefined || facts.size === 0) && missingConsideredCount === 0);
  if (nothingKnown) {
    signals.push({
      kind: "insufficient-data",
      label:
        student.key === null || student.identitySource === "ambiguous-name"
          ? "Not enough information: more than one student in this course has this name, so no recorded work can be attributed until you say which is meant"
          : "Not enough information: nothing recorded for this student, and no assessment in this course has a declared grading tool and a passed deadline to measure against",
      value: null,
    });
  }

  // THE FORK. Concern first, then - and only then - the question of whether
  // this student is already remedying it. A student with no concern signal is
  // DOING WELL, not recovering: recovery only means anything as an alternative
  // to outreach, and it is where a student LEAVES the concern list.
  let outcome: EngagementOutcome;
  if (nothingKnown) outcome = "insufficient-data";
  else if (!concerned) outcome = "doing-well";
  else if (recentRemediationCount >= thresholds.minRecoveryActions) outcome = "recovering";
  else outcome = "needs-outreach";

  return {
    studentIndex: student.index,
    userId: student.userId,
    identitySource: student.identitySource,
    outcome,
    signals,
    metrics,
    sortWeight: missingCount * 1000 + lateCount * 100 + unknownTimeCount * 10 + resubmittedAssessmentCount,
  };
}
