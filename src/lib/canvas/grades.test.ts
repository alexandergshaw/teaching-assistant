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
// fetch call count - only the (failing, caught) assignment/rubric lookup
// happens, never a PUT to that student's submission).
//
// Follows announcements.test.ts's own precedent: globalThis.fetch is
// stubbed directly (not canvas-core), so the real resolveInstitution/
// parseCanvasUrl/canvasError run - closer to the real request shape this
// function actually builds.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postCanvasGrades } from "./grades";

const ASSIGNMENT_URL = "https://canvas.mccneb.edu/courses/123/assignments/456";

function fakeResponse(opts: { ok: boolean; status?: number; body?: unknown }): Response {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    json: async () => opts.body ?? {},
  } as unknown as Response;
}

// Every call whose URL is the bare assignment endpoint (fetchAssignmentObject,
// used only to look up an attached rubric) fails with 404 - caught by
// postCanvasGrades's own try/catch, falling back to grade+comment-only
// posting, exactly as a rubric-less assignment behaves for real. Every OTHER
// call (a submission PUT) succeeds.
function mockNoRubricThenSucceed() {
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockImplementation(async (url) => {
    const s = String(url);
    if (s.includes("/assignments/456") && !s.includes("/submissions/")) {
      return fakeResponse({ ok: false, status: 404 });
    }
    return fakeResponse({ ok: true, body: {} });
  });
  return fetchMock;
}

describe("postCanvasGrades - B1: a skipped student is never counted as posted", () => {
  beforeEach(() => {
    vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("a blank grade AND blank comment is reported as skipped - never posted, never failed, and never PUT to Canvas at all", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(fakeResponse({ ok: false, status: 404 }));

    const result = await postCanvasGrades(ASSIGNMENT_URL, [{ userId: 1, grade: "", comment: "" }]);

    expect(result.posted).toBe(0);
    expect(result.failures).toEqual([]);
    expect(result.skipped).toEqual([
      { userId: 1, reason: expect.stringContaining("No grade or comment") },
    ]);
    // Only the (failing, caught) rubric lookup happened - the loop never
    // reached the fetch() that would PUT this student's submission.
    // SABOTAGE-CHECK ANCHOR: reverting the fix to a bare `continue` (no
    // `skipped.push`) was verified to make the `result.skipped` assertion
    // above fail - `skipped` came back `[]` instead of naming userId 1 - the
    // exact silent drop this fix exists to close. Reverted after confirming
    // the failure.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a whitespace-only grade AND comment still counts as skipped (trimmed, not a bare truthiness check)", async () => {
    vi.mocked(fetch).mockResolvedValue(fakeResponse({ ok: false, status: 404 }));

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
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (url) => {
      const s = String(url);
      if (s.includes("/assignments/456") && !s.includes("/submissions/")) {
        return fakeResponse({ ok: false, status: 404 }); // rubric lookup
      }
      return fakeResponse({ ok: false, status: 404 }); // the PUT itself fails
    });

    const result = await postCanvasGrades(ASSIGNMENT_URL, [{ userId: 5, grade: "80" }]);

    expect(result.posted).toBe(0);
    expect(result.skipped).toEqual([]);
    expect(result.failures).toEqual([
      { userId: 5, error: expect.stringContaining("No submission found") },
    ]);
  });
});
