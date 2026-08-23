// Dedicated throttle-BUDGET test for graded-discussion.ts (step-10 fixer
// round, finding N3) - kept separate from graded-discussion.test.ts, which
// deliberately mocks nothing under canvas-throttle, so that file's own
// convention stays intact. Mirrors fetch-helpers.throttle.test.ts's own
// separation of throttle-retry concerns from its sibling's main behavioural
// suite.
//
// What changed and what this pins: canvasGraphql (graphql.ts) now accepts an
// optional shared ThrottleBudget on its context, exactly like writeJson
// (fetch-helpers.ts) already did. createGradedDiscussion builds exactly ONE
// ThrottleBudget per call and passes the SAME object to both canvasGraphql
// and createClassicDiscussion (writeJson) - so when the checkpoints mutation
// falls back to the classic REST create IN THE SAME CALL, both writes draw
// from one shared retry-time allowance instead of each getting its own fresh
// one. Before this fix, createGradedDiscussion never called
// createThrottleBudget at all - the classic fallback's writeJson call always
// got unbounded per-call retry, independent of whatever the GraphQL attempt
// had already spent.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../canvas-throttle", async () => {
  const actual = await vi.importActual<typeof import("../canvas-throttle")>("../canvas-throttle");
  return { ...actual, createThrottleBudget: vi.fn(actual.createThrottleBudget) };
});

import { createGradedDiscussion, type NewGradedDiscussion } from "./graded-discussion";
import { createThrottleBudget, CANVAS_BULK_THROTTLE_BUDGET_MS } from "../canvas-throttle";

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";

const BASE_FIELDS: NewGradedDiscussion = {
  title: "Introduce Yourself",
  message: "<p>Tell us about yourself.</p>",
  pointsPossible: 20,
  initialPostPoints: 10,
  repliesPoints: 10,
  initialPostAt: "2026-09-10T23:59:00.000Z",
  repliesDueAt: "2026-09-13T23:59:00.000Z",
  requiredReplyCount: 2,
  published: false,
  useCheckpoints: true,
};

const createThrottleBudgetSpy = vi.mocked(createThrottleBudget);

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
  createThrottleBudgetSpy.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("createGradedDiscussion: shared throttle budget across GraphQL + classic writes in one call (step-10 N3)", () => {
  it("SABOTAGE TARGET: builds exactly ONE budget per call, and a retry spent on the GraphQL leg is NOT restored for the classic fallback that follows it", async () => {
    vi.useFakeTimers();

    let graphqlAttempts = 0;
    let restAttempts = 0;
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.endsWith("/api/graphql")) {
        graphqlAttempts += 1;
        if (graphqlAttempts === 1) {
          return { ok: false, status: 429, json: async () => ({}) } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            errors: [{ message: "discussion_checkpoints feature flag must be enabled" }],
          }),
        } as unknown as Response;
      }
      if (href.includes("/discussion_topics")) {
        restAttempts += 1;
        if (restAttempts === 1) {
          return { ok: false, status: 429, json: async () => ({}) } as unknown as Response;
        }
        return { ok: true, status: 200, json: async () => ({ id: 555 }) } as unknown as Response;
      }
      throw new Error(`Unexpected fetch to ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = createGradedDiscussion(COURSE_URL, BASE_FIELDS);
    // Two sequential single retries at the 500ms base delay - the GraphQL
    // leg's 429, then (after it falls back) the classic leg's 429.
    await vi.advanceTimersByTimeAsync(2000);

    const result = await pending;
    expect(result.path).toBe("classic");
    expect(result.id).toBe(555);
    expect(graphqlAttempts).toBe(2);
    expect(restAttempts).toBe(2);

    // Exactly one budget for the whole call - not one per write.
    expect(createThrottleBudgetSpy).toHaveBeenCalledTimes(1);
    const budget = createThrottleBudgetSpy.mock.results[0].value;
    // Both legs' one retry each drew from the SAME object: 500ms for the
    // GraphQL leg's retry, then another 500ms for the classic leg's retry -
    // 1000ms total gone from the one shared allowance. If each write had its
    // own fresh budget instead, this would still read the full starting
    // amount (or createThrottleBudgetSpy would have been called twice).
    expect(budget.remainingMs).toBe(CANVAS_BULK_THROTTLE_BUDGET_MS - 1000);
  });
});
