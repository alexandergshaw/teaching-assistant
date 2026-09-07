import { describe, it, expect } from "vitest";
import {
  ENGAGEMENT_WORK_KIND_BY_SOURCE,
  OFFLINE_SOURCE_WORK_KINDS,
  assembleOfflineCourseIntel,
  mapOfflineAssemblyInputs,
  readDisplayedTimestamp,
  readParticipationKind,
  readRecordedScore,
  readSubmissionTime,
  toEngagementWorkKind,
  type AssembleOfflineCourseIntelArgs,
  type OfflineAssemblySources,
} from "./offline-assembly";
import { DEFAULT_ENGAGEMENT_THRESHOLDS } from "./engagement";
import type { GradingRow } from "@/app/components/grading-recording/grading-row";
import type {
  GradingAssessmentDeclaration,
  GradingToolDeclaration as StoredToolDeclaration,
} from "@/app/components/grading-recording/useGradingAssessmentDeclarations";
import type { ReplyRow } from "@/app/components/recording/discussion-serialization";
import type { ConcernThresholds } from "./types";

// FROZEN LITERAL ORACLES. Every expectation below is spelled out here rather
// than derived from the module under test - a test that computes its
// expectation the same way the implementation does agrees with any change,
// including a wrong one.
const COURSE = "course-1";
const OTHER_COURSE = "course-2";
const NOW = "2026-06-01T00:00:00Z";
const DEADLINE_PAST = "2026-05-01T00:00:00Z";
const RECORDING_TOOL = "screen-recording";

/** `offlineStudentKey(COURSE, name)`'s output, written out. */
const ADA_KEY = "course-1::ada lovelace";
const GRACE_KEY = "course-1::grace hopper";

/** ./engagement's own `WorkKind` union, as literals. If this set and the
 *  module's translation ever disagree, the translation is wrong. */
const ENGAGEMENT_WORK_KINDS: ReadonlySet<string> = new Set(["assignment", "discussion-post"]);

const CONCERN_THRESHOLDS: ConcernThresholds = { lowScorePercent: 65, minMissingCount: 2, staleActivityDays: 14 };

function gradingRow(over: Partial<GradingRow> = {}): GradingRow {
  return {
    id: "g1",
    studentName: "Ada Lovelace",
    nameMatch: "matched",
    rosterCandidates: [],
    submissionText: "submission",
    state: "ready",
    totalScore: "18/20",
    strengths: "",
    improvements: "",
    overallComment: "",
    error: "",
    userEdited: false,
    course: COURSE,
    assessment: "essay-2",
    ...over,
  };
}

function replyRow(over: Partial<ReplyRow> = {}): ReplyRow {
  return {
    id: "d1",
    author: "Ada Lovelace",
    post: "post text",
    reply: "",
    userEdited: false,
    state: "ready",
    error: null,
    firstSeenAt: 1_800_000_000_000,
    order: 0,
    course: COURSE,
    ...over,
  };
}

function assessmentDeclaration(over: Partial<GradingAssessmentDeclaration> = {}): GradingAssessmentDeclaration {
  return {
    courseId: COURSE,
    assessmentId: "essay-2",
    assessmentLabel: "Essay 2",
    workKind: "assignment",
    deadline: DEADLINE_PAST,
    ...over,
  };
}

function toolDeclaration(over: Partial<StoredToolDeclaration> = {}): StoredToolDeclaration {
  return { courseId: COURSE, workKind: "assignment", tool: RECORDING_TOOL, ...over };
}

function sources(over: Partial<OfflineAssemblySources> = {}): OfflineAssemblySources {
  return {
    courseHubId: COURSE,
    rosterNames: ["Ada Lovelace", "Grace Hopper"],
    studentRepos: [],
    gradingRows: [],
    replyRows: [],
    assessmentDeclarations: [],
    toolDeclarations: [],
    recordingTool: RECORDING_TOOL,
    ...over,
  };
}

function assembleArgs(over: Partial<AssembleOfflineCourseIntelArgs> = {}): AssembleOfflineCourseIntelArgs {
  return {
    ...sources(),
    concernThresholds: CONCERN_THRESHOLDS,
    engagementThresholds: DEFAULT_ENGAGEMENT_THRESHOLDS,
    now: NOW,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// D25f. The work-kind translation.
// ---------------------------------------------------------------------------

describe("the work-kind translation (D25f)", () => {
  it("is the frozen table, spelled out", () => {
    expect(ENGAGEMENT_WORK_KIND_BY_SOURCE).toEqual({
      discussion: "discussion-post",
      assignment: "assignment",
    });
  });

  it("translates a discussion declaration to the engagement spelling, never through", () => {
    expect(toEngagementWorkKind("discussion")).toBe("discussion-post");
    // The sabotage this test exists for: a mapper that passes the string
    // through. It looks correct for "assignment" and is silently wrong for
    // "discussion".
    expect(toEngagementWorkKind("discussion")).not.toBe("discussion");
    expect(toEngagementWorkKind("assignment")).toBe("assignment");
  });

  it("is exhaustive over the source union, and every value is a real engagement work kind", () => {
    // COUNT CANARY. Adding a member to GradingWorkKind is already a compile
    // error in the translation table; this makes it a red test too, so the
    // oracle above is updated in the same commit.
    expect(OFFLINE_SOURCE_WORK_KINDS.length).toBe(2);
    expect([...OFFLINE_SOURCE_WORK_KINDS].sort()).toEqual(["assignment", "discussion"]);
    for (const kind of OFFLINE_SOURCE_WORK_KINDS) {
      expect(ENGAGEMENT_WORK_KINDS.has(toEngagementWorkKind(kind))).toBe(true);
    }
  });

  it("emits only engagement work kinds on both the assessment and the declaration path", () => {
    // The declaration path is the half D25f names: it is what decides whether
    // an assessment has a declared tool at all.
    const inputs = mapOfflineAssemblyInputs(
      sources({
        assessmentDeclarations: [
          assessmentDeclaration({ assessmentId: "week-3", workKind: "discussion" }),
          assessmentDeclaration({ assessmentId: "essay-2", workKind: "assignment" }),
        ],
        toolDeclarations: [
          toolDeclaration({ workKind: "discussion" }),
          toolDeclaration({ workKind: "assignment" }),
        ],
      })
    );
    for (const assessment of inputs.assessments) {
      expect(ENGAGEMENT_WORK_KINDS.has(assessment.workKind)).toBe(true);
    }
    for (const declaration of inputs.declarations) {
      expect(ENGAGEMENT_WORK_KINDS.has(declaration.workKind)).toBe(true);
    }
    expect(inputs.assessments.map((a) => a.workKind)).toEqual(["discussion-post", "assignment"]);
    expect(inputs.declarations.map((d) => d.workKind)).toEqual(["discussion-post", "assignment"]);
  });

  it("THE TRAP: a discussion declaration reaches a discussion assessment and its missing count is COMPUTED", () => {
    const result = assembleOfflineCourseIntel(
      assembleArgs({
        assessmentDeclarations: [
          assessmentDeclaration({ assessmentId: "week-3", workKind: "discussion", deadline: DEADLINE_PAST }),
        ],
        toolDeclarations: [toolDeclaration({ workKind: "discussion" })],
        // Ada has a row. Grace (roster index 2) does not, and it is past the
        // deadline, so Grace is missing that discussion post.
        gradingRows: [gradingRow({ assessment: "week-3" })],
      })
    );

    const report = result.engagement.assessments[0];
    // A pass-through emits "discussion" here. That is the one assertion that
    // catches a sabotage which casts BOTH sides through, since two matching
    // wrong strings still line up with each other.
    expect(report.workKind).toBe("discussion-post");
    expect(report.declaredTool).toBe(RECORDING_TOOL);
    // The failure D25f describes: not-declared, missing count gone, and the
    // answer reads "no missing work" rather than as an error.
    expect(report.missing.state).not.toBe("not-declared");
    expect(report.missing.state).toBe("computed");
    expect(report.missing.state === "computed" && report.missing.missingStudentIndexes).toEqual([2]);
    expect(result.engagement.consideredAssessmentIds).toEqual(["week-3"]);

    const grace = result.engagement.rows.find((row) => row.studentIndex === 2);
    expect(grace?.metrics.missingCount).toBe(1);
    expect(grace?.metrics.missingConsideredCount).toBe(1);
    expect(result.engagement.caveats.map((c) => c.kind)).not.toContain("assumption-not-declared");
  });

  it("still declines a work kind nobody declared a tool for", () => {
    const result = assembleOfflineCourseIntel(
      assembleArgs({
        assessmentDeclarations: [assessmentDeclaration({ assessmentId: "week-3", workKind: "discussion" })],
        // Declared for assignments only. The discussion assessment must NOT
        // borrow it.
        toolDeclarations: [toolDeclaration({ workKind: "assignment" })],
        gradingRows: [gradingRow({ assessment: "week-3" })],
      })
    );
    expect(result.engagement.assessments[0].declaredTool).toBeNull();
    expect(result.engagement.assessments[0].missing.state).toBe("not-declared");
  });
});

// ---------------------------------------------------------------------------
// Course and assessment attribution.
// ---------------------------------------------------------------------------

describe("unattributed rows", () => {
  it("excludes a row tagged with no course or another course, and never adopts it", () => {
    const inputs = mapOfflineAssemblyInputs(
      sources({
        gradingRows: [
          gradingRow({ id: "g-none", course: undefined }),
          gradingRow({ id: "g-other", course: OTHER_COURSE }),
          gradingRow({ id: "g-mine" }),
        ],
        replyRows: [
          replyRow({ id: "d-none", course: undefined }),
          replyRow({ id: "d-other", course: OTHER_COURSE }),
          replyRow({ id: "d-mine" }),
        ],
      })
    );

    expect(inputs.scores).toHaveLength(1);
    expect(inputs.submissions).toHaveLength(1);
    expect(inputs.participation).toHaveLength(1);
    expect(inputs.report.gradingRowsOutsideCourseCount).toBe(2);
    expect(inputs.report.replyRowsOutsideCourseCount).toBe(2);
    // The name on an out-of-course row is never even resolved.
    expect(inputs.report.gradingRowNames.matched).toBe(1);
    expect(inputs.report.replyRowNames.matched).toBe(1);
  });

  it("adopts nothing at all when there is no course in scope", () => {
    const inputs = mapOfflineAssemblyInputs(
      sources({
        courseHubId: "",
        gradingRows: [gradingRow({ course: undefined })],
        replyRows: [replyRow({ course: undefined })],
        assessmentDeclarations: [assessmentDeclaration({ courseId: "" })],
      })
    );
    expect(inputs.scores).toHaveLength(0);
    expect(inputs.submissions).toHaveLength(0);
    expect(inputs.participation).toHaveLength(0);
    expect(inputs.assessments).toHaveLength(0);
    expect(inputs.report.gradingRowsOutsideCourseCount).toBe(1);
  });

  it("excludes an in-course row that names no assessment, and counts it", () => {
    const inputs = mapOfflineAssemblyInputs(
      sources({
        gradingRows: [gradingRow({ assessment: undefined }), gradingRow({ id: "g2", assessment: "   " })],
      })
    );
    expect(inputs.scores).toHaveLength(0);
    expect(inputs.submissions).toHaveLength(0);
    expect(inputs.report.gradingRowsWithoutAssessmentCount).toBe(2);
  });

  it("keeps a declaration for another course out of this course's assessment list", () => {
    const inputs = mapOfflineAssemblyInputs(
      sources({
        assessmentDeclarations: [
          assessmentDeclaration({ courseId: OTHER_COURSE, assessmentId: "their-essay" }),
          assessmentDeclaration({ assessmentId: "essay-2" }),
        ],
        toolDeclarations: [toolDeclaration({ courseId: OTHER_COURSE }), toolDeclaration()],
      })
    );
    expect(inputs.assessments.map((a) => a.assessmentId)).toEqual(["essay-2"]);
    expect(inputs.declarations).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The free-text score.
// ---------------------------------------------------------------------------

describe("readRecordedScore", () => {
  it("reads both halves when the text names a total", () => {
    expect(readRecordedScore("18/20")).toEqual({
      score: 18,
      pointsPossible: 20,
      outcome: "earned-and-possible",
    });
    expect(readRecordedScore("Total: 8 / 10")).toEqual({
      score: 8,
      pointsPossible: 10,
      outcome: "earned-and-possible",
    });
  });

  it("yields pointsPossible null when the text names no total, and never fabricates one", () => {
    expect(readRecordedScore("18")).toEqual({ score: 18, pointsPossible: null, outcome: "earned-only" });
    expect(readRecordedScore("95%")).toEqual({ score: 95, pointsPossible: null, outcome: "earned-only" });
  });

  it("yields pointsPossible null for a non-positive total, keeping the earned value", () => {
    // parseEarnedPossibleScore rejects a non-positive `possible`. The rejected
    // 0 must not become a denominator, and the 18 must not vanish - a null
    // score is what keeps an assessment out of the offline denominator, so
    // dropping it would silently shrink every student's missing count.
    expect(readRecordedScore("18/0")).toEqual({ score: 18, pointsPossible: null, outcome: "earned-only" });
    expect(readRecordedScore("5/-2")).toEqual({ score: 5, pointsPossible: null, outcome: "earned-only" });
  });

  it("distinguishes nothing typed from something unreadable", () => {
    expect(readRecordedScore("")).toEqual({ score: null, pointsPossible: null, outcome: "blank" });
    expect(readRecordedScore("   ")).toEqual({ score: null, pointsPossible: null, outcome: "blank" });
    expect(readRecordedScore(undefined)).toEqual({ score: null, pointsPossible: null, outcome: "blank" });
    expect(readRecordedScore("A+")).toEqual({ score: null, pointsPossible: null, outcome: "unreadable" });
    expect(readRecordedScore("see comment")).toEqual({
      score: null,
      pointsPossible: null,
      outcome: "unreadable",
    });
  });

  it("carries the null total through to the emitted score row", () => {
    const inputs = mapOfflineAssemblyInputs(sources({ gradingRows: [gradingRow({ totalScore: "18" })] }));
    expect(inputs.scores[0].pointsPossible).toBeNull();
    expect(inputs.scores[0].score).toBe(18);
    expect(inputs.report.scoreReadings).toEqual({
      "earned-and-possible": 0,
      "earned-only": 1,
      unreadable: 0,
      blank: 0,
    });
  });

  it("never invents a recorded-at instant for a grading row", () => {
    // GradingRow carries no capture timestamp, and the student's own
    // submission time answers a different question.
    const inputs = mapOfflineAssemblyInputs(
      sources({
        gradingRows: [
          gradingRow({ submissionTimeStatus: "known", submittedAt: "2026-05-02T00:00:00Z" }),
        ],
      })
    );
    expect(inputs.scores[0].recordedAt).toBeNull();
    expect(inputs.report.scoresWithNoRecordedTimeCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The displayed timestamp.
// ---------------------------------------------------------------------------

describe("readDisplayedTimestamp and ReplyRow.postedAt", () => {
  it("normalises a readable instant and refuses an unreadable one", () => {
    expect(readDisplayedTimestamp("2026-05-01T12:00:00Z")).toBe("2026-05-01T12:00:00.000Z");
    expect(readDisplayedTimestamp("yesterday at 3pm")).toBeNull();
    expect(readDisplayedTimestamp("")).toBeNull();
    expect(readDisplayedTimestamp(undefined)).toBeNull();
  });

  it("refuses prose that bare Date.parse turns into a real instant", () => {
    // MEASURED, not assumed. Date.parse("end of week 3") does NOT return NaN
    // in this runtime - it returns a March 2001 instant, in the machine's own
    // timezone. Trusting it would hand ./engagement a long-past deadline built
    // out of a sentence fragment, and report the whole roster missing.
    expect(Number.isNaN(Date.parse("end of week 3"))).toBe(false);
    expect(readDisplayedTimestamp("end of week 3")).toBeNull();
    expect(readDisplayedTimestamp("Week 12")).toBeNull();
    // A two-digit year is a guess about the century, so it is refused too.
    expect(readDisplayedTimestamp("5/1/26")).toBeNull();
    // Everything carrying a real four-digit year still reads.
    expect(readDisplayedTimestamp("May 1, 2026 12:00:00 UTC")).toBe("2026-05-01T12:00:00.000Z");
  });

  it("an unparseable postedAt becomes null and NEVER firstSeenAt", () => {
    const firstSeenAt = 1_800_000_000_000;
    const inputs = mapOfflineAssemblyInputs(
      sources({ replyRows: [replyRow({ postedAt: "yesterday at 3pm", firstSeenAt })] })
    );
    expect(inputs.participation[0].occurredAt).toBeNull();
    // firstSeenAt is when WE saw it, not when the student posted. Spelled out
    // so a fallback to it is red rather than merely different.
    expect(inputs.participation[0].occurredAt).not.toBe(new Date(firstSeenAt).toISOString());
    expect(inputs.report.replyRowsWithUnreadablePostedAtCount).toBe(1);
  });

  it("an absent postedAt is null and is not counted as unreadable", () => {
    const inputs = mapOfflineAssemblyInputs(sources({ replyRows: [replyRow({ postedAt: undefined })] }));
    expect(inputs.participation[0].occurredAt).toBeNull();
    expect(inputs.report.replyRowsWithUnreadablePostedAtCount).toBe(0);
  });

  it("carries a readable postedAt through as the participation instant", () => {
    const inputs = mapOfflineAssemblyInputs(
      sources({ replyRows: [replyRow({ postedAt: "2026-05-01T12:00:00Z", firstSeenAt: 1_800_000_000_000 })] })
    );
    expect(inputs.participation[0].occurredAt).toBe("2026-05-01T12:00:00.000Z");
  });

  it("maps the thread position, and counts the rows that never recorded one", () => {
    expect(readParticipationKind(replyRow({ threadPosition: "reply" }))).toEqual({
      kind: "reply",
      positionKnown: true,
    });
    expect(readParticipationKind(replyRow({ threadPosition: "root" }))).toEqual({
      kind: "post",
      positionKnown: true,
    });
    expect(readParticipationKind(replyRow({ threadPosition: undefined }))).toEqual({
      kind: "post",
      positionKnown: false,
    });
    const inputs = mapOfflineAssemblyInputs(
      sources({
        replyRows: [
          replyRow({ id: "d1", threadPosition: "reply" }),
          replyRow({ id: "d2", threadPosition: "unknown" }),
          replyRow({ id: "d3" }),
        ],
      })
    );
    expect(inputs.participation.map((p) => p.kind)).toEqual(["reply", "post", "post"]);
    expect(inputs.report.replyRowsWithUnknownThreadPositionCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Submission time stays three-valued.
// ---------------------------------------------------------------------------

describe("submission time", () => {
  it("keeps unknown as unknown, and never as on time", () => {
    expect(readSubmissionTime(gradingRow())).toEqual({ state: "unknown" });
    expect(readSubmissionTime(gradingRow({ submissionTimeStatus: "unknown" }))).toEqual({ state: "unknown" });

    const result = assembleOfflineCourseIntel(
      assembleArgs({
        assessmentDeclarations: [assessmentDeclaration()],
        toolDeclarations: [toolDeclaration()],
        gradingRows: [gradingRow()],
      })
    );
    expect(result.engagement.assessments[0].unknownTimeRowCount).toBe(1);
    expect(result.engagement.assessments[0].onTimeRowCount).toBe(0);
    expect(result.engagement.assessments[0].lateRowCount).toBe(0);
    expect(result.engagement.caveats.map((c) => c.kind)).toContain("unknown-submission-times");
  });

  it("keeps the instructor's late mark as a verdict with no instant", () => {
    expect(readSubmissionTime(gradingRow({ submissionTimeStatus: "marked-late" }))).toEqual({
      state: "instructor-marked",
      late: true,
    });
    // The row's own submittedAt is ignored for this status - there is no
    // timestamp to carry, only a verdict.
    expect(
      readSubmissionTime(gradingRow({ submissionTimeStatus: "marked-late", submittedAt: "2026-05-02T00:00:00Z" }))
    ).toEqual({ state: "instructor-marked", late: true });
  });

  it("degrades a known status with an unreadable instant to unknown, never to on time", () => {
    expect(readSubmissionTime(gradingRow({ submissionTimeStatus: "known", submittedAt: "last Tuesday" }))).toEqual({
      state: "unknown",
    });
    expect(readSubmissionTime(gradingRow({ submissionTimeStatus: "known", submittedAt: undefined }))).toEqual({
      state: "unknown",
    });
    const inputs = mapOfflineAssemblyInputs(
      sources({ gradingRows: [gradingRow({ submissionTimeStatus: "known", submittedAt: "last Tuesday" })] })
    );
    expect(inputs.report.unreadableSubmittedAtCount).toBe(1);
    expect(inputs.report.submissionTimesUnknownCount).toBe(1);
    expect(inputs.report.submissionTimesKnownCount).toBe(0);
  });

  it("carries a readable instant through as known", () => {
    expect(
      readSubmissionTime(gradingRow({ submissionTimeStatus: "known", submittedAt: "2026-05-02T00:00:00Z" }))
    ).toEqual({ state: "known", submittedAt: "2026-05-02T00:00:00.000Z" });
  });
});

// ---------------------------------------------------------------------------
// Identity.
// ---------------------------------------------------------------------------

describe("identity", () => {
  it("attributes NOTHING for an ambiguous name", () => {
    const result = assembleOfflineCourseIntel(
      assembleArgs({
        // Two real students who share a name. Never merged, never picked.
        rosterNames: ["Alex Chen", "Alex Chen"],
        assessmentDeclarations: [assessmentDeclaration()],
        toolDeclarations: [toolDeclaration()],
        gradingRows: [gradingRow({ studentName: "Alex Chen" })],
      })
    );

    const inputs = mapOfflineAssemblyInputs(
      sources({
        rosterNames: ["Alex Chen", "Alex Chen"],
        gradingRows: [gradingRow({ studentName: "Alex Chen" })],
      })
    );
    expect(inputs.scores[0].studentKey).toBeNull();
    expect(inputs.submissions[0].studentKey).toBeNull();
    expect(inputs.report.gradingRowNames).toEqual({ matched: 0, ambiguous: 1, unmatched: 0, noRoster: 0 });

    // Nobody is credited with the row, and nobody is reported missing on the
    // strength of a name that matched two people.
    const assessment = result.engagement.assessments[0];
    expect(assessment.unattributedRowCount).toBe(1);
    expect(assessment.missing.state === "computed" && assessment.missing.missingStudentIndexes).toEqual([]);
    expect(result.engagement.caveats.map((c) => c.kind)).toContain("ambiguous-name");
    expect(result.engagement.caveats.map((c) => c.kind)).toContain("unattributed-rows");
    expect(result.concerns.unattributedScoreCount).toBe(1);
    for (const student of result.identity.students) {
      expect(student.identitySource).toBe("ambiguous-name");
      expect(student.key).toBeNull();
    }
  });

  it("resolves a matched name to that student's key, and reports the four outcomes apart", () => {
    const inputs = mapOfflineAssemblyInputs(
      sources({
        gradingRows: [
          gradingRow({ id: "g1", studentName: "Ada Lovelace" }),
          gradingRow({ id: "g2", studentName: "Hopper, Grace" }),
          gradingRow({ id: "g3", studentName: "Nobody Here" }),
        ],
      })
    );
    expect(inputs.scores.map((s) => s.studentKey)).toEqual([ADA_KEY, GRACE_KEY, null]);
    expect(inputs.report.gradingRowNames).toEqual({ matched: 2, ambiguous: 0, unmatched: 1, noRoster: 0 });
  });

  it("reports no-roster apart from unmatched", () => {
    const inputs = mapOfflineAssemblyInputs(
      sources({ rosterNames: [], gradingRows: [gradingRow({ studentName: "Ada Lovelace" })] })
    );
    expect(inputs.report.gradingRowNames).toEqual({ matched: 0, ambiguous: 0, unmatched: 0, noRoster: 1 });
    expect(inputs.scores[0].studentKey).toBeNull();
  });

  it("prefers a cached Canvas id and marks it cached-canvas-id, not course-roster-name", () => {
    const inputs = mapOfflineAssemblyInputs(
      sources({ studentRepos: [{ student: "Ada Lovelace", canvasUserId: "12345" }] })
    );
    expect(inputs.students[0]).toEqual({
      index: 1,
      key: ADA_KEY,
      userId: 12345,
      identitySource: "cached-canvas-id",
    });
    expect(inputs.students[1]).toEqual({
      index: 2,
      key: GRACE_KEY,
      userId: null,
      identitySource: "course-roster-name",
    });
    // A hand-typed non-id degrades to a name match rather than a fabricated id.
    const typed = mapOfflineAssemblyInputs(
      sources({ studentRepos: [{ student: "Ada Lovelace", canvasUserId: "not-an-id" }] })
    );
    expect(typed.students[0].userId).toBeNull();
    expect(typed.students[0].identitySource).toBe("course-roster-name");
  });

  it("hands no student name onward", () => {
    const inputs = mapOfflineAssemblyInputs(sources());
    // The roster spelling stays on the identity index (which the UI resolves
    // locally) and never reaches the engagement student shape.
    expect(Object.keys(inputs.students[0]).sort()).toEqual(["identitySource", "index", "key", "userId"]);
  });
});

// ---------------------------------------------------------------------------
// The declared tool, the deadline, and the assembly as a whole.
// ---------------------------------------------------------------------------

describe("declarations", () => {
  it("detects a tool violation rather than agreeing with the declaration by construction", () => {
    // The recording tool is a REQUIRED caller statement. If it were defaulted
    // to the declared tool, this state would be unreachable and a
    // half-migrated assessment would produce a confident missing list.
    const result = assembleOfflineCourseIntel(
      assembleArgs({
        assessmentDeclarations: [assessmentDeclaration()],
        toolDeclarations: [toolDeclaration({ tool: "canvas-speedgrader" })],
        gradingRows: [gradingRow()],
        recordingTool: RECORDING_TOOL,
      })
    );
    const assessment = result.engagement.assessments[0];
    expect(assessment.missing.state).toBe("violated");
    expect(assessment.missing.state === "violated" && assessment.missing.foreignTools).toEqual([RECORDING_TOOL]);
    expect(result.engagement.caveats.map((c) => c.kind)).toContain("assumption-violated");
  });

  it("treats an undeclared tool string as no declaration at all", () => {
    const inputs = mapOfflineAssemblyInputs(sources({ toolDeclarations: [toolDeclaration({ tool: "  " })] }));
    expect(inputs.declarations).toHaveLength(0);
    expect(inputs.report.declaredToolCount).toBe(0);
  });

  it("separates no deadline entered from a deadline that cannot be read", () => {
    const inputs = mapOfflineAssemblyInputs(
      sources({
        assessmentDeclarations: [
          assessmentDeclaration({ assessmentId: "a1", deadline: "" }),
          assessmentDeclaration({ assessmentId: "a2", deadline: "end of week 3" }),
          assessmentDeclaration({ assessmentId: "a3", deadline: DEADLINE_PAST }),
        ],
      })
    );
    expect(inputs.assessments.map((a) => a.deadlineAt)).toEqual([null, null, "2026-05-01T00:00:00.000Z"]);
    expect(inputs.report.assessmentsWithoutDeadlineCount).toBe(1);
    expect(inputs.report.assessmentsWithUnreadableDeadlineCount).toBe(1);
  });

  it("drops an assessment declaration with no usable id, and counts it", () => {
    const inputs = mapOfflineAssemblyInputs(
      sources({ assessmentDeclarations: [assessmentDeclaration({ assessmentId: "   " })] })
    );
    expect(inputs.assessments).toHaveLength(0);
    expect(inputs.report.assessmentsDroppedWithoutIdCount).toBe(1);
  });
});

describe("assembleOfflineCourseIntel", () => {
  it("runs all three modules over the same rows and returns both denominators", () => {
    const result = assembleOfflineCourseIntel(
      assembleArgs({
        assessmentDeclarations: [assessmentDeclaration()],
        toolDeclarations: [toolDeclaration()],
        gradingRows: [gradingRow({ studentName: "Ada Lovelace", totalScore: "18/20" })],
        replyRows: [replyRow({ postedAt: "2026-05-20T00:00:00Z" })],
      })
    );

    expect(result.courseHubId).toBe(COURSE);
    expect(result.identity.students.map((s) => s.index)).toEqual([1, 2]);
    // ./offline-signals: the denominator is what the instructor actually
    // graded somebody on.
    expect(result.concerns.recordedAssessmentIds).toEqual(["essay-2"]);
    // ./engagement: the denominator is what the instructor DECLARED.
    expect(result.engagement.consideredAssessmentIds).toEqual(["essay-2"]);
    expect(result.engagement.assessments[0].rowCount).toBe(1);
    expect(result.report.gradingRowCount).toBe(1);
    expect(result.report.replyRowCount).toBe(1);
  });

  it("reports a student the recording suite has never seen rather than calling them missing everything", () => {
    const result = assembleOfflineCourseIntel(
      assembleArgs({ gradingRows: [gradingRow({ studentName: "Ada Lovelace" })] })
    );
    const grace = result.concerns.rows.find((row) => row.studentIndex === 2);
    expect(grace?.rollup.kind).toBe("never-recorded");
    expect(grace?.signals.map((s) => s.kind)).toEqual(["insufficient-data"]);
  });
});
