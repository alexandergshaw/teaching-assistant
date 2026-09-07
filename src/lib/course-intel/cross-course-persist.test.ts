import { describe, it, expect, vi } from "vitest";
import { persistCrossCourseAnswer, type CrossCoursePersistInput } from "./cross-course-persist";

// ============================================================================
// A minimal stand-in for crossCourseAskResponse's own successful body -
// see ./cross-course-answer.ts, which this module is meant to be called
// right after.
// ============================================================================

function okBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: "ok",
    answerMarkdown: "Of the three courses I could read, C2 has the least late work.",
    citedStudents: [{ index: 1, userId: 5001, identitySource: "lms-roster" }],
    entryId: null,
    persistError: null,
    ...overrides,
  };
}

const BASE_ARGS = {
  status: 200,
  courseIds: ["course-1", "course-2", "course-3"],
  question: "Which of my courses has the least late work?",
  assembledAt: "2026-09-01T00:00:00Z",
  describeError: (err: unknown) => (err instanceof Error ? err.message : "an unexpected error"),
  logError: () => {},
};

describe("persistCrossCourseAnswer - success path", () => {
  it("calls persist with the full covered-course set, the raw question and the answer text", async () => {
    const persist = vi.fn().mockResolvedValue("entry-1");

    await persistCrossCourseAnswer({ ...BASE_ARGS, body: okBody(), persist });

    expect(persist).toHaveBeenCalledTimes(1);
    const input = persist.mock.calls[0][0] as CrossCoursePersistInput;
    expect(input.courseIds).toEqual(["course-1", "course-2", "course-3"]);
    expect(input.question).toBe("Which of my courses has the least late work?");
    expect(input.answerMarkdown).toBe("Of the three courses I could read, C2 has the least late work.");
    expect(input.citedStudents).toEqual([{ index: 1, userId: 5001, identitySource: "lms-roster" }]);
    expect(input.assembledAt).toBe("2026-09-01T00:00:00Z");
  });

  it("sets entryId from persist's return and leaves persistError null", async () => {
    const persist = vi.fn().mockResolvedValue("entry-1");

    const result = await persistCrossCourseAnswer({ ...BASE_ARGS, body: okBody(), persist });

    expect(result.status).toBe(200);
    expect(result.body.entryId).toBe("entry-1");
    expect(result.body.persistError).toBeNull();
  });

  it("carries every other field of the original body through unchanged", async () => {
    const persist = vi.fn().mockResolvedValue("entry-1");
    const body = okBody({ scope: "all-courses", coverageComplete: false });

    const result = await persistCrossCourseAnswer({ ...BASE_ARGS, body, persist });

    expect(result.body.scope).toBe("all-courses");
    expect(result.body.coverageComplete).toBe(false);
  });

  it("falls back to an empty answerMarkdown and citedStudents when the body carries the wrong shape", async () => {
    const persist = vi.fn().mockResolvedValue("entry-1");
    const body = okBody({ answerMarkdown: 12345, citedStudents: "not-an-array" });

    await persistCrossCourseAnswer({ ...BASE_ARGS, body, persist });

    const input = persist.mock.calls[0][0] as CrossCoursePersistInput;
    expect(input.answerMarkdown).toBe("");
    expect(input.citedStudents).toEqual([]);
  });
});

describe("persistCrossCourseAnswer - persist failure", () => {
  it("reports persistError and leaves entryId null when persist throws, without altering the answer", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("write timed out"));
    const logError = vi.fn();

    const result = await persistCrossCourseAnswer({ ...BASE_ARGS, body: okBody(), persist, logError });

    expect(result.status).toBe(200);
    expect(result.body.entryId).toBeNull();
    expect(result.body.persistError).toBe("write timed out");
    expect(result.body.answerMarkdown).toBe(okBody().answerMarkdown);
    expect(logError).toHaveBeenCalledTimes(1);
  });
});

describe("persistCrossCourseAnswer - non-success result is a no-op", () => {
  it("never calls persist and returns the body unchanged when status is not 200", async () => {
    const persist = vi.fn();
    const errorBody = { status: "error", phase: "model", error: "The AI did not return an answer." };

    const result = await persistCrossCourseAnswer({ ...BASE_ARGS, status: 502, body: errorBody, persist });

    expect(persist).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 502, body: errorBody });
  });

  it("never calls persist when status is 200 but the body's own status is not \"ok\"", async () => {
    const persist = vi.fn();
    const body = { status: "needs-course-disambiguation", message: "..." };

    const result = await persistCrossCourseAnswer({ ...BASE_ARGS, status: 200, body, persist });

    expect(persist).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 200, body });
  });
});
