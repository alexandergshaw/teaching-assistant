// Tests for ./cross-course - what each course contributed to one answer, how
// it was read, and what the deadline cut.
//
// THREE PROPERTIES CARRY THIS FILE, and each is a sentence from D24 rather
// than an implementation detail:
//
//  1. OFFLINE COURSES ARE ASSEMBLED FIRST. Every recorded slice exists before
//     the first Canvas call, so whatever the deadline cuts is live work and a
//     mixed answer's free half is always complete.
//  2. A CROSS-COURSE READ TOUCHES NO STUDENT WRITING. The signals readers are
//     the only thing `readLiveCourseSlice` is given, and the text readers
//     handed alongside them are never called.
//  3. A COUNT THAT COULD NOT BE COMPUTED IS NULL, NEVER ZERO - and a ranking
//     is only allowed to be a superlative when every course was read, read the
//     same way, and produced its numbers.
//
// The fixtures are local rather than imported from a sibling *.test.ts: this
// repo has already been bitten by a cross-test-file import re-running the
// other file's describe blocks.

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";

import {
  LIVE_NOT_IN_BUDGET_DETAIL,
  assembleCrossCourseSlices,
  courseReadMode,
  describeCourseCoverage,
  readLiveCourseSlice,
  readRecordedCourseSlice,
  rollupFromOfflineIntel,
  rollupFromStudentRecords,
  superlativeBasis,
  type CrossCourseSlice,
  type CrossCourseTask,
} from "./cross-course";
import { assembleOfflineCourseIntel, type AssembleOfflineCourseIntelArgs } from "./offline-assembly";
import { DEFAULT_ENGAGEMENT_THRESHOLDS } from "./engagement";
import type { CourseIntelSignalReaders } from "./fetch";
import type { GradingRow } from "@/app/components/grading-recording/grading-row";
import type { GradingAssessmentDeclaration, GradingToolDeclaration } from "@/app/components/grading-recording/useGradingAssessmentDeclarations";
import type { ConcernRow, ConcernThresholds, CourseStudentRecord, LmsConnection, MissingRollup } from "./types";

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const NOW = "2026-06-01T00:00:00.000Z";
const DEADLINE_PAST = "2026-05-01T00:00:00.000Z";
const RECORDING_TOOL = "screen-recording";
const THRESHOLDS: ConcernThresholds = { lowScorePercent: 65, minMissingCount: 2, staleActivityDays: 14 };

const LIVE: LmsConnection = { state: "live" };
const NO_LINK: LmsConnection = { state: "unavailable", reason: "no-lms-course", detail: "No Canvas URL." };
const DOWN: LmsConnection = { state: "unavailable", reason: "unreachable", detail: "Canvas returned 503." };

function missingRollup(over: Partial<MissingRollup> = {}): MissingRollup {
  return {
    consideredCount: 8,
    missingCount: 3,
    lateCount: 2,
    gradedCount: 5,
    ungradedSubmittedCount: 1,
    excusedCount: 0,
    ...over,
  };
}

function studentRecord(over: Partial<CourseStudentRecord> & { userId: number; index: number }): CourseStudentRecord {
  return {
    name: `Student ${over.index}`,
    sortableName: `Student, ${over.index}`,
    onRoster: true,
    identitySource: "lms-roster",
    grades: { state: "loaded", value: { currentScore: 80, finalScore: 80 } },
    submissions: { state: "loaded", value: { byAssignmentId: {}, rollup: missingRollup() } },
    discussion: { state: "not-fetched", reason: "signals tier" },
    messages: { state: "not-fetched", reason: "signals tier" },
    lastActivityAt: NOW,
    ...over,
  };
}

function concernRow(index: number): ConcernRow {
  return {
    studentIndex: index,
    userId: 4000 + index,
    identitySource: "lms-roster",
    signals: [{ kind: "missing-work", label: "3 of 8 assignments missing", value: 3 }],
    sortWeight: 3000,
  };
}

function slice(over: Partial<CrossCourseSlice> & { courseId: string }): CrossCourseSlice {
  return {
    name: `Course ${over.courseId}`,
    connection: LIVE,
    rollup: {
      students: 2,
      studentsMeasured: 2,
      consideredSubmissions: 16,
      missing: 6,
      late: 4,
      graded: 10,
      awaitingGrade: 2,
      concernRows: 1,
      insufficientData: 0,
      clear: 1,
    },
    concernRows: [concernRow(1)],
    students: [{ index: 1, name: "Ada Lovelace", userId: 4001 }],
    ...over,
  };
}

function gradingRow(over: Partial<GradingRow> = {}): GradingRow {
  return {
    id: "g1",
    studentName: "Ada Lovelace",
    nameMatch: "matched",
    rosterCandidates: [],
    submissionText: "",
    state: "ready",
    totalScore: "18/20",
    strengths: "",
    improvements: "",
    overallComment: "",
    error: "",
    userEdited: false,
    course: "course-1",
    assessment: "essay-2",
    ...over,
  };
}

function assessmentDeclaration(over: Partial<GradingAssessmentDeclaration> = {}): GradingAssessmentDeclaration {
  return {
    courseId: "course-1",
    assessmentId: "essay-2",
    assessmentLabel: "Essay 2",
    workKind: "assignment",
    deadline: DEADLINE_PAST,
    ...over,
  };
}

function toolDeclaration(over: Partial<GradingToolDeclaration> = {}): GradingToolDeclaration {
  return { courseId: "course-1", workKind: "assignment", tool: RECORDING_TOOL, ...over };
}

function offlineSources(over: Partial<AssembleOfflineCourseIntelArgs> = {}): AssembleOfflineCourseIntelArgs {
  return {
    courseHubId: "course-1",
    rosterNames: ["Ada Lovelace", "Grace Hopper"],
    studentRepos: [],
    gradingRows: [],
    replyRows: [],
    assessmentDeclarations: [],
    toolDeclarations: [],
    recordingTool: RECORDING_TOOL,
    concernThresholds: THRESHOLDS,
    engagementThresholds: DEFAULT_ENGAGEMENT_THRESHOLDS,
    now: NOW,
    ...over,
  };
}

/**
 * Signal readers plus the two TEXT readers this path must never reach for -
 * ON THE SAME OBJECT.
 *
 * ATTACHING THEM TO THE SAME OBJECT IS THE WHOLE POINT. A spy the module has
 * no reference to cannot be called no matter what the module does, so a test
 * asserting it was not called would pass under every sabotage - which is
 * precisely what happened when these lived on a second object beside the
 * readers. Here they are properties of the value `readLiveCourseSlice` is
 * handed, so a call to either one is observable and the assertion is a
 * statement about what left the machine rather than about the type.
 */
function readersWithTextSpies() {
  const fetchDiscussionTopic = vi.fn(async () => ({ students: [] }));
  const getConversationDetail = vi.fn(async (id: number) => ({ id, subject: "", messages: [] }));
  const signalFns = {
    listAssignmentBriefs: vi.fn(async () => [
      {
        assignmentId: "10",
        name: "Lab",
        dueAt: "2026-05-01T00:00:00.000Z",
        pointsPossible: 20,
        published: true,
        omitFromFinalGrade: false,
      },
    ]),
    listRoster: vi.fn(async () => [{ id: "4021", name: "Ada Lovelace", sortableName: "Lovelace, Ada" }]),
    listGradeSummaries: vi.fn(async () => [
      { userId: "4021", name: "Ada Lovelace", currentScore: 61, finalScore: 61 },
    ]),
    listSubmissionGrid: vi.fn(async () => ({
      source: "bulk" as const,
      rows: [
        {
          userId: 4021,
          assignmentId: "10",
          score: null,
          workflowState: "unsubmitted",
          submittedAt: null,
          excused: false,
          late: false,
          missing: true,
          dueAt: "2026-05-01T00:00:00.000Z",
          dueAtPresent: true,
        },
      ],
    })),
    listTopicBriefs: vi.fn(async () => []),
    listAnnouncements: vi.fn(async () => []),
    listConversationIndex: vi.fn(async () => []),
  };
  const readers = { ...signalFns, fetchDiscussionTopic, getConversationDetail };
  return {
    readers: readers as unknown as CourseIntelSignalReaders,
    signalFns,
    text: { fetchDiscussionTopic, getConversationDetail },
  };
}

// ---------------------------------------------------------------------------
// The ordering rule (D24d).
// ---------------------------------------------------------------------------

describe("assembleCrossCourseSlices", () => {
  function task(courseId: string, log: string[], over: Partial<CrossCourseTask> = {}): CrossCourseTask {
    return {
      courseId,
      readRecorded: () => {
        log.push(`recorded:${courseId}`);
        return slice({ courseId, connection: NO_LINK });
      },
      readLive: async () => {
        log.push(`live:${courseId}`);
        return slice({ courseId, connection: LIVE });
      },
      ...over,
    };
  }

  const neverCut = {
    deadlineAtMs: 10_000,
    perCourseWaitMs: 5_000,
    now: () => 0,
    withDeadline: <T,>(work: Promise<T>) => work,
    classifyLiveFailure: () => DOWN,
  };

  it("builds EVERY recorded slice before it starts ANY live read", async () => {
    const log: string[] = [];
    await assembleCrossCourseSlices({ tasks: [task("a", log), task("b", log)], ...neverCut });
    // Not "recorded a, live a, recorded b, live b". The free half of the
    // answer is complete before anything can time out.
    expect(log).toEqual(["recorded:a", "recorded:b", "live:a", "live:b"]);
  });

  it("returns slices in task order, never in completion order", async () => {
    const log: string[] = [];
    const slices = await assembleCrossCourseSlices({ tasks: [task("a", log), task("b", log)], ...neverCut });
    expect(slices.map((s) => s.courseId)).toEqual(["a", "b"]);
  });

  it("keeps a course's recorded slice and REPORTS it when the budget runs out", async () => {
    const log: string[] = [];
    let clock = 0;
    const slices = await assembleCrossCourseSlices({
      tasks: [task("a", log), task("b", log)],
      deadlineAtMs: 100,
      perCourseWaitMs: 5_000,
      // The first live read spends the whole budget, so the second is never
      // STARTED - which is the point: a course that did not fit is reported,
      // not dropped, and not half-read.
      now: () => (clock += 90),
      withDeadline: <T,>(work: Promise<T>) => work,
      classifyLiveFailure: () => DOWN,
    });
    expect(log).toEqual(["recorded:a", "recorded:b", "live:a"]);
    expect(slices.map((s) => s.courseId)).toEqual(["a", "b"]);
    expect(courseReadMode(slices[0].connection)).toBe("live");
    expect(courseReadMode(slices[1].connection)).toBe("lms-unavailable");
    expect(slices[1].connection).toEqual({
      state: "unavailable",
      reason: "unreachable",
      detail: LIVE_NOT_IN_BUDGET_DETAIL,
    });
    // The recorded data is still there. A cut course loses its Canvas read,
    // not its students.
    expect(slices[1].students).toHaveLength(1);
  });

  it("classifies a live failure PER COURSE and keeps that course's recorded data", async () => {
    const log: string[] = [];
    const slices = await assembleCrossCourseSlices({
      tasks: [
        task("a", log),
        { ...task("b", log), readLive: async () => { throw new Error("Canvas returned 503."); } },
      ],
      ...neverCut,
    });
    expect(slices[0].connection).toEqual(LIVE);
    expect(slices[1].connection).toEqual(DOWN);
    expect(slices[1].concernRows).toHaveLength(1);
  });

  it("never overwrites the connection of a course that has no live read at all", async () => {
    const log: string[] = [];
    const slices = await assembleCrossCourseSlices({
      tasks: [{ ...task("a", log), readLive: null }],
      ...neverCut,
    });
    expect(log).toEqual(["recorded:a"]);
    expect(slices[0].connection).toEqual(NO_LINK);
    expect(courseReadMode(slices[0].connection)).toBe("recorded");
  });

  it("caps one course's wait so a slow course cannot spend everyone else's budget", async () => {
    const log: string[] = [];
    const waits: number[] = [];
    await assembleCrossCourseSlices({
      tasks: [task("a", log)],
      deadlineAtMs: 100_000,
      perCourseWaitMs: 1_500,
      now: () => 0,
      withDeadline: <T,>(work: Promise<T>, ms: number) => {
        waits.push(ms);
        return work;
      },
      classifyLiveFailure: () => DOWN,
    });
    expect(waits).toEqual([1_500]);
  });
});

// ---------------------------------------------------------------------------
// Signals only (D24d).
// ---------------------------------------------------------------------------

describe("readLiveCourseSlice", () => {
  it("reads the signals tier and calls NO text reader", async () => {
    const { readers, signalFns, text } = readersWithTextSpies();
    await readLiveCourseSlice({
      courseId: "course-1",
      name: "Ethical Hacking",
      institution: "ABC",
      canvasCourseId: "77",
      promptLabel: "C1",
      assembledAt: NOW,
      readers,
      thresholds: THRESHOLDS,
    });
    for (const reader of Object.values(signalFns)) expect(reader).toHaveBeenCalled();
    expect(text.fetchDiscussionTopic).not.toHaveBeenCalled();
    expect(text.getConversationDetail).not.toHaveBeenCalled();
  });

  it("cannot reach the text tier by construction - the module never imports it", () => {
    // The spy check above proves this call did not fetch prose. This proves
    // no OTHER call in the module can either: `fetchCourseIntelText` is the
    // only way to read a discussion topic or a conversation body, and it is
    // not in this file.
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/lib/course-intel/cross-course.ts"), "utf-8");
    expect(source).toContain("fetchCourseIntelSignals");
    expect(source).not.toContain("fetchCourseIntelText");
  });

  it("labels the assembly with the MARKER it was handed, never a course name", async () => {
    const { readers } = readersWithTextSpies();
    const built = await readLiveCourseSlice({
      courseId: "course-1",
      name: "Ethical Hacking",
      institution: "ABC",
      canvasCourseId: "77",
      promptLabel: "C1",
      assembledAt: NOW,
      readers,
      thresholds: THRESHOLDS,
    });
    // The real name comes back for the BROWSER, on the slice.
    expect(built.name).toBe("Ethical Hacking");
    expect(built.connection).toEqual(LIVE);
  });
});

// ---------------------------------------------------------------------------
// Null is not zero.
// ---------------------------------------------------------------------------

describe("rollupFromStudentRecords", () => {
  it("sums only the students whose submissions were loaded, and says how many", () => {
    const rollup = rollupFromStudentRecords(
      [
        studentRecord({ userId: 1, index: 1 }),
        studentRecord({
          userId: 2,
          index: 2,
          submissions: { state: "not-fetched", reason: "budget" },
        }),
      ],
      [concernRow(1)],
      1
    );
    expect(rollup.students).toBe(2);
    expect(rollup.studentsMeasured).toBe(1);
    expect(rollup.missing).toBe(3);
    expect(rollup.late).toBe(2);
    expect(rollup.consideredSubmissions).toBe(8);
  });

  it("reports NULL, never 0, when no student's submissions were loaded", () => {
    // The single most damaging substitution available in a ranking: a course
    // nothing could be measured for would otherwise win "least late work".
    const rollup = rollupFromStudentRecords(
      [studentRecord({ userId: 1, index: 1, submissions: { state: "failed", reason: "403" } })],
      [],
      0
    );
    expect(rollup.missing).toBeNull();
    expect(rollup.late).toBeNull();
    expect(rollup.consideredSubmissions).toBeNull();
    expect(rollup.graded).toBeNull();
    expect(rollup.awaitingGrade).toBeNull();
  });

  it("counts an insufficient-data row as one", () => {
    const rollup = rollupFromStudentRecords(
      [studentRecord({ userId: 1, index: 1 })],
      [
        {
          ...concernRow(1),
          signals: [{ kind: "insufficient-data", label: "Not enough information", value: null }],
        },
      ],
      0
    );
    expect(rollup.insufficientData).toBe(1);
  });
});

describe("rollupFromOfflineIntel", () => {
  it("reports missing and late as NULL when no assessment was soundly considered", () => {
    // No declaration and no deadline means absence of a row means nothing
    // (D23a). Summing the zeros ./engagement emits would put the least
    // measurable course at the TOP of a "least missing work" ranking.
    const intel = assembleOfflineCourseIntel(offlineSources({ gradingRows: [gradingRow()] }));
    expect(intel.engagement.consideredAssessmentIds).toEqual([]);
    const rollup = rollupFromOfflineIntel(intel);
    expect(rollup.missing).toBeNull();
    expect(rollup.late).toBeNull();
    expect(rollup.consideredSubmissions).toBeNull();
    // What it CAN say, it says: the recorded rows are real work.
    expect(rollup.graded).toBe(1);
    expect(rollup.students).toBe(2);
  });

  it("reports a real missing count once the instructor has declared a tool and a deadline", () => {
    const intel = assembleOfflineCourseIntel(
      offlineSources({
        gradingRows: [gradingRow()],
        assessmentDeclarations: [assessmentDeclaration()],
        toolDeclarations: [toolDeclaration()],
      })
    );
    expect(intel.engagement.consideredAssessmentIds).toEqual(["essay-2"]);
    const rollup = rollupFromOfflineIntel(intel);
    // Ada has a row; Grace does not, and the deadline has passed.
    expect(rollup.missing).toBe(1);
    expect(rollup.consideredSubmissions).toBe(2);
  });

  it("never claims work is awaiting a grade offline", () => {
    const rollup = rollupFromOfflineIntel(assembleOfflineCourseIntel(offlineSources()));
    expect(rollup.awaitingGrade).toBeNull();
  });

  it("does not count rows tagged with another course as this course's graded work", () => {
    const intel = assembleOfflineCourseIntel(
      offlineSources({ gradingRows: [gradingRow(), gradingRow({ id: "g2", course: "course-2" })] })
    );
    expect(rollupFromOfflineIntel(intel).graded).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The superlative rule (D24e).
// ---------------------------------------------------------------------------

describe("superlativeBasis", () => {
  it("is complete when every course was read the same way and produced its numbers", () => {
    expect(superlativeBasis([slice({ courseId: "a" }), slice({ courseId: "b" })])).toBe("complete");
  });

  it("is partial when one course's LMS was not read", () => {
    expect(
      superlativeBasis([
        slice({ courseId: "a" }),
        slice({ courseId: "b", connection: { state: "unavailable", reason: "unreachable", detail: "" } }),
      ])
    ).toBe("partial");
  });

  it("is partial when the courses were read DIFFERENT ways", () => {
    // A live late count and a recorded late count measure different things
    // over different denominators. Ranking one against the other produces a
    // number-shaped answer with no meaning.
    expect(superlativeBasis([slice({ courseId: "a" }), slice({ courseId: "b", connection: NO_LINK })])).toBe(
      "partial"
    );
  });

  it("is complete when every course is recorded-only - those ARE comparable", () => {
    // "Same way" is the rule, not "live". Two courses with no LMS at all were
    // both measured against the instructor's own declarations, so ranking them
    // against each other is sound - and refusing to would make the feature
    // useless for an instructor who does not use an LMS at all.
    expect(
      superlativeBasis([
        slice({ courseId: "a", connection: NO_LINK }),
        slice({ courseId: "b", connection: NO_LINK }),
      ])
    ).toBe("complete");
  });

  it("is partial when a course produced no counts at all", () => {
    const blank = slice({ courseId: "b" });
    expect(
      superlativeBasis([
        slice({ courseId: "a" }),
        { ...blank, rollup: { ...blank.rollup, late: null } },
      ])
    ).toBe("partial");
  });

  it("is partial for an empty answer", () => {
    expect(superlativeBasis([])).toBe("partial");
  });
});

describe("describeCourseCoverage", () => {
  it("names EVERY course even when nothing failed", () => {
    // D24e's actual requirement, and the one most easily lost: a coverage note
    // that only appears when something went wrong is a note nobody has learned
    // to look for.
    const lines = describeCourseCoverage([
      { name: "Ethical Hacking", connection: LIVE },
      { name: "Computer Networking", connection: LIVE },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Ethical Hacking");
    expect(lines[1]).toContain("Computer Networking");
    for (const line of lines) expect(line).toContain("read live from Canvas");
  });

  it("distinguishes a course with no LMS from a course whose LMS was not read", () => {
    const [noLink, notRead] = describeCourseCoverage([
      { name: "Seminar", connection: NO_LINK },
      { name: "Databases", connection: DOWN },
    ]);
    expect(noLink).toContain("nothing was missed");
    expect(notRead).toContain("NOT read");
    expect(notRead).toContain("Canvas returned 503.");
  });
});

describe("readRecordedCourseSlice", () => {
  it("carries the instructor's own course name for the browser and the connection it was given", () => {
    const built = readRecordedCourseSlice({
      name: "Ethical Hacking",
      connection: NO_LINK,
      sources: offlineSources(),
    });
    expect(built.courseId).toBe("course-1");
    expect(built.name).toBe("Ethical Hacking");
    expect(built.connection).toEqual(NO_LINK);
    expect(built.students.map((s) => s.name)).toEqual(["Ada Lovelace", "Grace Hopper"]);
  });
});
