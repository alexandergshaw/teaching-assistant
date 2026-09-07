// B1 (docs/REGRESSION.md-class defect, ux-audit-grading.md): before this
// fix, a student whose payload produced no params (blank grade AND blank
// comment, or a rubric-only payload whose criteria all failed to
// name-match) was silently `continue`d - not counted in `posted`, not
// pushed to `failures`. Every caller (GradingResults.tsx, repoGradesPosting.ts,
// DraftedGradesTab.tsx via postGradingDraftAction) treated "absent from
// failures" as proof of success, so a row could read "Posted to Canvas" for
// a student whose grade never reached Canvas.
//
// This file pins the fix: a skipped student lands in a THIRD array
// (`skipped`), is never counted in `posted`, is never pushed to `failures`,
// and triggers no network write at all (proven by asserting the exact
// canvasFetch call count - only the (failing, caught) assignment/rubric
// lookup happens, never a PUT to that student's submission).
//
// Wave 6 group 3: every bearer-carrying fetch in grades.ts (and, upstream,
// fetchAssignmentObject in metadata.ts, migrated separately) now goes
// through canvasGet/canvasRequest (src/lib/canvas-fetch-response.ts), which
// call canvasFetch (src/lib/canvas-fetch.ts) - real node:https with a real
// DNS lookup, which a global.fetch stub does NOT intercept. So this file now
// mocks canvasFetch AT THE MODULE BOUNDARY (the same boundary
// announcements.test.ts and fetch-helpers.canvas-fetch.test.ts already
// established for their own migrations), rather than stubbing
// globalThis.fetch - there is no remaining bare-fetch call on this file's
// exercised path for globalThis.fetch to intercept.
//
// Every assertion below preserves the SAME fact the pre-migration version
// checked; only the mocked boundary moved. Nothing here previously asserted
// on an `Authorization: Bearer <token>` header, so there is nothing of that
// shape to convert - the credential is still threaded through (visible as
// canvasFetch's third argument, `{ token }`), just never asserted on by name
// before this migration either.
//
// E-ARCH6/E6: resolveInstitution now reads a per-user credential store
// before ever touching the env vars this file stubs. Following this wave's
// one convention (see grading-queue.ts, inbox.ts, listings.ts's own siblings
// in the same change): mock getEffectiveIdentity to an "owner" identity and
// getLmsCredentialSecret to "no stored row", so resolveCanvasCredential falls
// through to the SAME owner-env branch this file already exercises with
// vi.stubEnv - the env-based resolution path stays alive, byte-identical to
// before this migration, without inventing a second mocking convention.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../supabase/effective-identity", () => ({
  getEffectiveIdentity: vi.fn().mockResolvedValue({
    id: "test-owner",
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

import { postCanvasGrades } from "./grades";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";

const mockCanvasFetch = vi.mocked(canvasFetch);

const ASSIGNMENT_URL = "https://canvas.mccneb.edu/courses/123/assignments/456";

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body - every call
 * on postCanvasGrades's exercised path (the rubric lookup, the discussion
 * lookup, and the submission PUT) reads its response this way, whatever the
 * HTTP status - a 404 here is still a COMPLETED exchange (Canvas answered),
 * distinct from the `kind: "unreachable"` case exercised separately below. */
function okResult(body: unknown, status = 200, headers: Record<string, string> = {}): CanvasFetchResult {
  return { ok: true, status, headers, body: Buffer.from(JSON.stringify(body)) };
}

// Every call whose URL is the bare assignment endpoint (fetchAssignmentObject,
// used only to look up an attached rubric) fails with 404 - caught by
// postCanvasGrades's own try/catch, falling back to grade+comment-only
// posting, exactly as a rubric-less assignment behaves for real. Every OTHER
// call (a submission PUT) succeeds.
function mockNoRubricThenSucceed() {
  mockCanvasFetch.mockImplementation(async (url) => {
    const s = String(url);
    if (s.includes("/assignments/456") && !s.includes("/submissions/")) {
      return okResult({}, 404);
    }
    return okResult({});
  });
  return mockCanvasFetch;
}

describe("postCanvasGrades - B1: a skipped student is never counted as posted", () => {
  beforeEach(() => {
    vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
    mockCanvasFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("a blank grade AND blank comment is reported as skipped - never posted, never failed, and never PUT to Canvas at all", async () => {
    mockCanvasFetch.mockResolvedValue(okResult({}, 404));

    const result = await postCanvasGrades(ASSIGNMENT_URL, [{ userId: 1, grade: "", comment: "" }]);

    expect(result.posted).toBe(0);
    expect(result.failures).toEqual([]);
    expect(result.skipped).toEqual([
      { userId: 1, reason: expect.stringContaining("No grade or comment") },
    ]);
    // Only the (failing, caught) rubric lookup happened - the loop never
    // reached the canvasRequest() call that would PUT this student's
    // submission.
    // SABOTAGE-CHECK ANCHOR: reverting the fix to a bare `continue` (no
    // `skipped.push`) was verified to make the `result.skipped` assertion
    // above fail - `skipped` came back `[]` instead of naming userId 1 - the
    // exact silent drop this fix exists to close. Reverted after confirming
    // the failure.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("a whitespace-only grade AND comment still counts as skipped (trimmed, not a bare truthiness check)", async () => {
    mockCanvasFetch.mockResolvedValue(okResult({}, 404));

    const result = await postCanvasGrades(ASSIGNMENT_URL, [{ userId: 2, grade: "   ", comment: "  " }]);

    expect(result.skipped.map((s) => s.userId)).toEqual([2]);
    expect(result.posted).toBe(0);
    expect(result.failures).toEqual([]);
  });

  it("a student with a real grade posts normally and never appears in `skipped`", async () => {
    const fetchMock = mockNoRubricThenSucceed();

    const result = await postCanvasGrades(ASSIGNMENT_URL, [{ userId: 3, grade: "95" }]);

    expect(result.posted).toBe(1);
    expect(result.skipped).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2); // rubric lookup + one PUT
  });

  it("a comment alone (no grade) is enough to avoid being skipped", async () => {
    mockNoRubricThenSucceed();

    const result = await postCanvasGrades(ASSIGNMENT_URL, [{ userId: 4, comment: "Great work" }]);

    expect(result.skipped).toEqual([]);
    expect(result.posted).toBe(1);
  });

  it("in a mixed batch, a skipped student never bleeds into `posted` or `failures`, and the other two students post independently", async () => {
    mockNoRubricThenSucceed();

    const result = await postCanvasGrades(ASSIGNMENT_URL, [
      { userId: 10, grade: "88" },
      { userId: 11, grade: "", comment: "" },
      { userId: 12, grade: "72" },
    ]);

    expect(result.posted).toBe(2);
    expect(result.failures).toEqual([]);
    expect(result.skipped).toEqual([
      { userId: 11, reason: expect.stringContaining("No grade or comment") },
    ]);
  });

  it("a genuine Canvas failure (404 on the submission PUT) still lands in `failures`, never in `skipped`", async () => {
    mockCanvasFetch.mockImplementation(async (url) => {
      const s = String(url);
      if (s.includes("/assignments/456") && !s.includes("/submissions/")) {
        return okResult({}, 404); // rubric lookup
      }
      return okResult({}, 404); // the PUT itself fails
    });

    const result = await postCanvasGrades(ASSIGNMENT_URL, [{ userId: 5, grade: "80" }]);

    expect(result.posted).toBe(0);
    expect(result.skipped).toEqual([]);
    expect(result.failures).toEqual([
      { userId: 5, error: expect.stringContaining("No submission found") },
    ]);
  });

  // Wave 6 group 3's own property: the grade-POST write is the highest-
  // consequence call site in this migration (a wrong outcome here means a
  // wrong grade in a real gradebook, or a double post), so it is
  // deliberately NOT wrapped in a try/catch that would fold a canvasRequest
  // throw into `failures` (see grades.ts's own module doc comment, "THE
  // GRADE-POST WRITE IS DELIBERATELY NOT WRAPPED IN A CATCH-AND-CONTINUE").
  // canvasFetch-adapter failures ("unreachable", "host-not-allowed") map to
  // a THROW, never a retryable value, specifically because a write that
  // failed mid-flight might have been applied - fetchWithThrottleRetry's own
  // doc comment states the same invariant for the throttle-retry path this
  // function does not use. This test proves postCanvasGrades honors that
  // invariant itself: an unreachable failure on student A's PUT propagates
  // out of postCanvasGrades as a throw, and student B's PUT - a SECOND POST
  // - never happens.
  it("an unreachable failure during a grade POST throws and does NOT result in a second POST", async () => {
    mockCanvasFetch.mockImplementation(async (url) => {
      const s = String(url);
      if (s.includes("/assignments/456") && !s.includes("/submissions/")) {
        return okResult({}, 404); // rubric lookup - not part of the property under test
      }
      return { ok: false, kind: "unreachable" };
    });

    await expect(
      postCanvasGrades(ASSIGNMENT_URL, [
        { userId: 20, grade: "90" },
        { userId: 21, grade: "85" },
      ])
    ).rejects.toThrow("Canvas did not respond.");

    // Exactly two canvasFetch calls total: the (caught) rubric lookup, and
    // the ONE PUT attempt for userId 20 - which failed unreachable and threw
    // immediately. userId 21's write never happened (no second POST), and
    // userId 20's own PUT was not retried either.
    // SABOTAGE-CHECK ANCHOR: wrapping the write back in a try/catch that
    // pushes the caught error into `failures` and `continue`s (the
    // pre-migration shape) was verified to make BOTH assertions above fail -
    // the call rejects(...) assertion fails because postCanvasGrades then
    // resolves instead of throwing, and the call count comes back 3 (rubric
    // lookup + a PUT attempt for EACH of userId 20 and userId 21) instead of
    // 2. Reverted after confirming the failure.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
  });
});
