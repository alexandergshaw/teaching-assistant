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
//
// canvasGraphql now dials `/api/graphql` through canvasRequest
// (src/lib/canvas-fetch-response.ts), which itself goes through canvasFetch
// - the SAME boundary the classic REST fallback (createClassicDiscussion ->
// writeJson, fetch-helpers.ts) already dials through, so both legs' 429-then-
// success sequences below are mocked at that one canvasFetch boundary,
// keyed by URL, rather than one at globalThis.fetch and one at canvasFetch.
// NOT mocked at fetch-helpers/graphql.ts themselves, because this test's
// entire point is that both legs' real throttle-retry loops
// (fetchWithThrottleRetry) actually run and draw down the SAME shared budget
// from each other. Mocking either module directly would replace its retry
// loop with a single resolved value and make the "exactly one shared budget,
// split 500ms + 500ms across both legs" assertion below pass vacuously
// regardless of whether the real sharing behaviour works at all.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../canvas-throttle", async () => {
  const actual = await vi.importActual<typeof import("../canvas-throttle")>("../canvas-throttle");
  return { ...actual, createThrottleBudget: vi.fn(actual.createThrottleBudget) };
});

// resolveCourse now calls resolveCanvasCredential (src/lib/canvas-credentials.ts),
// which asks getEffectiveIdentity() who the caller is and only falls back to
// the env-configured pair below for an identity whose role is literally
// "owner" (SEC13, docs/lms-credentials-acceptance-criteria.md). Mocked at the
// identity/credential-store boundary exactly like canvas-credentials.test.ts
// mocks it, with role "owner" and no stored row, so resolveCanvasCredential's
// real env-fallback logic still runs for real - only the ambient-identity
// lookup and the credential store are faked.
vi.mock("../supabase/effective-identity", () => ({
  getEffectiveIdentity: vi.fn().mockResolvedValue({
    id: "owner-1",
    email: "owner@example.edu",
    role: "owner",
    status: "active",
  }),
}));
vi.mock("../lms-credentials", () => ({
  getLmsCredentialSecret: vi.fn().mockResolvedValue(null),
  recordLmsCredentialFailure: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../canvas-fetch", () => ({ canvasFetch: vi.fn() }));

import { createGradedDiscussion, type NewGradedDiscussion } from "./graded-discussion";
import { createThrottleBudget, CANVAS_BULK_THROTTLE_BUDGET_MS } from "../canvas-throttle";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";

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
const mockCanvasFetch = vi.mocked(canvasFetch);

function canvasFetchStatus(status: number): CanvasFetchResult {
  return { ok: true, status, headers: {}, body: Buffer.from("{}") };
}

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
  createThrottleBudgetSpy.mockClear();
  mockCanvasFetch.mockReset();
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
    // Both legs - the GraphQL checkpoints mutation and the classic REST
    // fallback - now dial Canvas through canvasFetch, so both are mocked at
    // that one boundary, keyed by URL.
    mockCanvasFetch.mockImplementation(async (url) => {
      const href = String(url);
      if (href.endsWith("/api/graphql")) {
        graphqlAttempts += 1;
        if (graphqlAttempts === 1) {
          return canvasFetchStatus(429);
        }
        return {
          ok: true,
          status: 200,
          headers: {},
          body: Buffer.from(
            JSON.stringify({ errors: [{ message: "discussion_checkpoints feature flag must be enabled" }] })
          ),
        };
      }
      if (href.includes("/discussion_topics")) {
        restAttempts += 1;
        if (restAttempts === 1) {
          return canvasFetchStatus(429);
        }
        return { ok: true, status: 200, headers: {}, body: Buffer.from(JSON.stringify({ id: 555 })) };
      }
      throw new Error(`Unexpected canvasFetch to ${href}`);
    });

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
