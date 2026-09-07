// Tests for ./cross-course-answer - the whole cross-course answer, end to end,
// with the model call and the credential resolution injected.
//
// THIS IS THE FILE THAT WOULD BE MISSING IF THE ANSWER STAYED IN THE ROUTE.
// The ordering rule D24d turns on - every recorded course assembled before any
// Canvas call, so what a deadline cuts is only ever live work - is BEHAVIOUR,
// and behaviour that exists only inside a Next handler cannot be tested for
// the promise it makes.
//
// The fixtures are local rather than imported from a sibling *.test.ts: this
// repo has already been bitten by a cross-test-file import re-running the
// other file's describe blocks.

import { describe, it, expect, vi } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";

import { buildCrossCourseAnswer, crossCourseAskResponse, type CrossCourseAskArgs } from "./cross-course-answer";
import { parseOfflinePayload } from "./offline-payload";
import { DEFAULT_ENGAGEMENT_THRESHOLDS } from "./engagement";
import type { CourseIntelSignalReaders } from "./fetch";
import type { Course } from "@/lib/supabase/courses";
import type { ConcernThresholds, LmsConnection } from "./types";

const NOW = "2026-06-01T00:00:00.000Z";
const NONCE = "nonce-91b2";
const THRESHOLDS: ConcernThresholds = { lowScorePercent: 65, minMissingCount: 2, staleActivityDays: 14 };
const DOWN: LmsConnection = { state: "unavailable", reason: "unreachable", detail: "Canvas returned 503." };

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "Ethical Hacking",
    courseCode: "CIS4200",
    term: "Fall 2026",
    canvasUrl: null,
    repos: [],
    githubOrg: null,
    textbook: null,
    syllabusId: null,
    institution: null,
    integrations: [],
    roster: "Ada Lovelace\nGrace Hopper",
    notes: null,
    topics: null,
    csvName: null,
    csvData: null,
    rubricName: null,
    rubricData: null,
    startDate: null,
    description: null,
    weeks: null,
    tests: null,
    lms: null,
    dayTime: null,
    modality: null,
    topicOutline: null,
    syllabusTemplateId: null,
    endDate: null,
    breaks: null,
    assignmentDueRule: null,
    email: null,
    emailClient: null,
    classLengthMinutes: null,
    courseProject: emptyCourseProject(),
    materialsFiles: [],
    castletopFiles: [],
    miscFiles: [],
    exportFiles: [],
    materialsZipName: null,
    materialsZipPath: null,
    materialsZipSize: null,
    customTiles: [],
    hiddenTiles: [],
    studentRepos: [],
    updatedAt: NOW,
    ...overrides,
  };
}

/** A course with no Canvas link at all: costs zero Canvas calls, and its slice
 *  is therefore complete no matter what any deadline does. */
const OFFLINE_COURSE = baseCourse({ id: "c-offline", name: "Seminar", canvasUrl: null, institution: null });
/** A course that CAN be read live. */
const LIVE_COURSE = baseCourse({
  id: "c-live",
  name: "Ethical Hacking",
  institution: "ABC",
  canvasUrl: "https://abc.instructure.com/courses/77",
});

function signalReaders(): CourseIntelSignalReaders {
  return {
    listAssignmentBriefs: vi.fn(async () => []),
    listRoster: vi.fn(async () => [{ id: "4021", name: "Ada Lovelace", sortableName: "Lovelace, Ada" }]),
    listGradeSummaries: vi.fn(async () => []),
    listSubmissionGrid: vi.fn(async () => ({ source: "bulk" as const, rows: [] })),
    listTopicBriefs: vi.fn(async () => []),
    listAnnouncements: vi.fn(async () => []),
    listConversationIndex: vi.fn(async () => []),
  };
}

function askArgs(over: Partial<CrossCourseAskArgs> = {}): CrossCourseAskArgs {
  return {
    courseRows: [OFFLINE_COURSE, LIVE_COURSE],
    payload: parseOfflinePayload({ gradingRows: [], replyRows: [] }),
    questionForModel: "what courses have had the least amount of items turned in late",
    scopeKind: "all-courses",
    extraNotes: [],
    concernThresholds: THRESHOLDS,
    engagementThresholds: DEFAULT_ENGAGEMENT_THRESHOLDS,
    assembledAt: NOW,
    nonce: NONCE,
    deadlineAtMs: 100_000,
    perCourseWaitMs: 10_000,
    now: () => 0,
    withDeadline: <T,>(work: Promise<T>) => work,
    makeSignalReaders: async () => signalReaders(),
    classifyLiveFailure: () => DOWN,
    askModel: async () => "C1 has the least late work.\nSTUDENTS CITED: none",
    stripSentinel: (text: string) => text.split("\n").filter((l) => !/^STUDENTS CITED:/i.test(l.trim())).join("\n").trim(),
    describeError: (err) => (err instanceof Error ? err.message : "an unexpected error"),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// The ordering rule, end to end.
// ---------------------------------------------------------------------------

describe("buildCrossCourseAnswer", () => {
  it("assembles the course with no LMS before it resolves any credential", async () => {
    const order: string[] = [];
    await buildCrossCourseAnswer({
      ...askArgs(),
      courses: [
        {
          courseId: "c-offline",
          name: "Seminar",
          rosterNames: ["Ada Lovelace"],
          studentRepos: [],
          live: null,
          notLinkedDetail: "No institution set.",
        },
        {
          courseId: "c-live",
          name: "Ethical Hacking",
          rosterNames: ["Grace Hopper"],
          studentRepos: [],
          live: {
            institution: "ABC",
            canvasCourseId: "77",
            makeReaders: async () => {
              order.push("credentials:c-live");
              return signalReaders();
            },
          },
          notLinkedDetail: "",
        },
      ],
      askModel: async () => {
        order.push("model");
        return "done\nSTUDENTS CITED: none";
      },
    });
    // Credentials for the live course are resolved only after both recorded
    // slices exist, and the model is asked last.
    expect(order).toEqual(["credentials:c-live", "model"]);
  });

  it("says outright that a multi-course answer was not saved to any history", async () => {
    const answer = await buildCrossCourseAnswer({
      ...askArgs(),
      courses: [
        {
          courseId: "c-offline",
          name: "Seminar",
          rosterNames: ["Ada Lovelace"],
          studentRepos: [],
          live: null,
          notLinkedDetail: "No institution set.",
        },
      ],
    });
    expect(answer.notes.some((note) => note.includes("not saved to any single course's history"))).toBe(true);
  });

  it("says when this browser sent no recorded work at all", async () => {
    const answer = await buildCrossCourseAnswer({
      ...askArgs(),
      payload: parseOfflinePayload(undefined),
      courses: [
        {
          courseId: "c-offline",
          name: "Seminar",
          rosterNames: ["Ada Lovelace"],
          studentRepos: [],
          live: null,
          notLinkedDetail: "No institution set.",
        },
      ],
    });
    // Deliberately a different sentence from "this course has nothing
    // recorded in it".
    expect(answer.notes.some((note) => note.includes("sent no recorded work at all"))).toBe(true);
  });

  it("reports every row the model did not write about (D1's receipt)", async () => {
    const answer = await buildCrossCourseAnswer({
      ...askArgs(),
      courses: [
        {
          courseId: "c-offline",
          name: "Seminar",
          // Two roster students with nothing recorded: both get an
          // insufficient-data row, and the model below mentions neither.
          rosterNames: ["Ada Lovelace", "Grace Hopper"],
          studentRepos: [],
          live: null,
          notLinkedDetail: "No institution set.",
        },
      ],
      askModel: async () => "Nothing to report.\nSTUDENTS CITED: none",
    });
    expect(answer.context.concernRows.length).toBeGreaterThan(0);
    expect(answer.unexplainedStudentIndices).toEqual(answer.context.concernRows.map((r) => r.studentIndex));
  });

  it("sends the model the question it was given and no course name", async () => {
    let sent = "";
    await buildCrossCourseAnswer({
      ...askArgs(),
      courses: [
        {
          courseId: "c-offline",
          name: "Ethical Hacking",
          rosterNames: ["Ada Lovelace"],
          studentRepos: [],
          live: null,
          notLinkedDetail: "No institution set.",
        },
      ],
      questionForModel: "what students are struggling in C1?",
      askModel: async (turns) => {
        sent = turns.map((t) => t.parts.map((p) => ("text" in p ? p.text : "")).join("\n")).join("\n\n");
        return "ok\nSTUDENTS CITED: none";
      },
    });
    expect(sent).toContain("what students are struggling in C1?");
    expect(sent).not.toContain("Ethical Hacking");
    expect(sent).not.toContain("Ada Lovelace");
  });
});

// ---------------------------------------------------------------------------
// The HTTP shape.
// ---------------------------------------------------------------------------

describe("crossCourseAskResponse", () => {
  it("returns the coverage for every course, plus whether it is comparable", async () => {
    const result = await crossCourseAskResponse(askArgs());
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.coverageLines).toHaveLength(2);
    // One course has no LMS and one was read live, so the two were not read
    // the same way and a bare superlative is not allowed.
    expect(body.coverageComplete).toBe(false);
    expect((body.courses as { name: string }[]).map((c) => c.name)).toEqual(["Seminar", "Ethical Hacking"]);
  });

  it("never persists a multi-course answer to one course's history", async () => {
    const body = (await crossCourseAskResponse(askArgs())).body as Record<string, unknown>;
    expect(body.entryId).toBeNull();
    expect(body.persistError).toBeNull();
    expect((body.coverageNotes as string[]).join(" ")).toContain("not saved to any single course's history");
  });

  it("carries the caller's own notes ahead of its own", async () => {
    const body = (
      await crossCourseAskResponse(askArgs({ extraNotes: ["Two of your courses match \"Ethical Hacking\"."] }))
    ).body as Record<string, unknown>;
    expect((body.coverageNotes as string[])[0]).toContain("Two of your courses match");
  });

  it("degrades a failed course rather than failing the answer", async () => {
    const result = await crossCourseAskResponse(
      askArgs({
        makeSignalReaders: async () => {
          throw new Error("Canvas returned 503.");
        },
      })
    );
    expect(result.status).toBe(200);
    const courses = (result.body as Record<string, unknown>).courses as { mode: string }[];
    expect(courses.map((c) => c.mode)).toEqual(["recorded", "lms-unavailable"]);
  });

  it("reports a model failure as the model phase, with no upstream detail", async () => {
    const result = await crossCourseAskResponse(
      askArgs({
        askModel: async () => {
          throw new Error("provider said 429 for https://api.example/x?key=SECRET");
        },
      })
    );
    expect(result.status).toBe(502);
    const body = result.body as Record<string, unknown>;
    expect(body.phase).toBe("model");
    // A provider's error body can echo the request that produced it, and this
    // app sends its API key as a URL query parameter.
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });
});
