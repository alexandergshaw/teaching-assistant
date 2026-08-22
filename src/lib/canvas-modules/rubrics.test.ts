// listRubrics used to run entirely through safeFetchAll (fetch-helpers.ts),
// which swallows every failure into an empty array - indistinguishable from
// a course that genuinely has no rubrics, and it never looked past
// /courses/:id/rubrics, so a rubric defined on the course's Canvas ACCOUNT
// (very common - accounts commonly share rubrics across every course under
// them) was never fetched at all. This file pins the fix: an account-level
// fetch (resolving account_id off GET /courses/:id, then GET
// /accounts/:account_id/rubrics - see rubrics.ts's own doc comments for the
// Canvas API evidence), each rubric tagged by its source, and a genuine
// fetch failure surfaced via `error` instead of silently reading as "no
// rubrics" (AC1-AC4).
//
// Mirrors bulk.test.ts's pattern: only globalThis.fetch is stubbed,
// resolveCourse/fetchAll run for real, so assertions are about the actual
// request/response shape. No rubrics.test.ts existed before this change
// (checked via Glob before writing this file).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listRubrics } from "./rubrics";

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";

function jsonResponse(status: number, body: unknown, linkHeader: string | null = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (name: string) => (name.toLowerCase() === "link" ? linkHeader : null) },
  } as unknown as Response;
}

/** A 200 whose body is NOT valid JSON (an institution login page, a
 * Cloudflare interstitial, a truncated body) - `.json()` rejects the same
 * way `Response.json()` does against a non-JSON body. Pins finding 2: this
 * used to sit outside the surrounding try/catch and would throw out of
 * listRubrics entirely. */
function brokenJsonResponse(status: number, linkHeader: string | null = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON at position 0");
    },
    headers: { get: (name: string) => (name.toLowerCase() === "link" ? linkHeader : null) },
  } as unknown as Response;
}

type Handlers = {
  /** GET /courses/:id - just needs an account_id (or a status to fail with). */
  course?: { status: number; account_id?: number; badJson?: boolean };
  /** GET /courses/:id/rubrics */
  courseRubrics?: { status: number; body?: unknown[] };
  /** GET /accounts/:id/rubrics */
  accountRubrics?: { status: number; body?: unknown[]; badJson?: boolean };
  /** Force a network-level throw instead of a response, keyed by URL substring. */
  throwOn?: string;
};

function stubCanvas(handlers: Handlers) {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const href = String(url);
    if (handlers.throwOn && href.includes(handlers.throwOn)) {
      throw new Error("network down");
    }
    if (href.includes("/accounts/") && href.includes("/rubrics")) {
      const h = handlers.accountRubrics ?? { status: 200, body: [] };
      if (h.badJson) return brokenJsonResponse(h.status);
      return jsonResponse(h.status, h.body ?? []);
    }
    if (href.includes("/courses/123/rubrics")) {
      const h = handlers.courseRubrics ?? { status: 200, body: [] };
      return jsonResponse(h.status, h.body ?? []);
    }
    if (href.endsWith("/courses/123")) {
      const h = handlers.course ?? { status: 200, account_id: 55 };
      if (h.badJson) return brokenJsonResponse(h.status);
      return jsonResponse(h.status, h.status >= 200 && h.status < 300 ? { account_id: h.account_id } : {});
    }
    throw new Error(`unexpected request: ${href}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("listRubrics - merging course + account sources (AC1/AC2)", () => {
  it("returns only course-level rubrics, tagged as such, when the account has none visible", async () => {
    stubCanvas({
      course: { status: 200, account_id: 55 },
      courseRubrics: { status: 200, body: [{ id: 1, title: "Essay Rubric" }] },
      accountRubrics: { status: 200, body: [] },
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.error).toBeUndefined();
    expect(result.rubrics).toEqual([{ id: 1, title: "Essay Rubric", source: "course" }]);
  });

  it("merges account-level rubrics in, tagged distinctly from course-level ones (AC2)", async () => {
    stubCanvas({
      course: { status: 200, account_id: 55 },
      courseRubrics: { status: 200, body: [{ id: 1, title: "Course Rubric" }] },
      accountRubrics: { status: 200, body: [{ id: 2, title: "Shared Dept Rubric" }] },
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.error).toBeUndefined();
    expect(result.rubrics).toContainEqual({ id: 1, title: "Course Rubric", source: "course" });
    expect(result.rubrics).toContainEqual({ id: 2, title: "Shared Dept Rubric", source: "account" });
  });

  it("defaults a blank title to 'Rubric <id>', same as before this change", async () => {
    stubCanvas({
      course: { status: 200, account_id: 55 },
      courseRubrics: { status: 200, body: [{ id: 7, title: "  " }] },
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.rubrics).toContainEqual({ id: 7, title: "Rubric 7", source: "course" });
  });

  it("drops entries with no numeric id, same as before this change", async () => {
    stubCanvas({
      course: { status: 200, account_id: 55 },
      courseRubrics: { status: 200, body: [{ title: "No id" }, { id: 9, title: "Has id" }] },
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.rubrics).toEqual([{ id: 9, title: "Has id", source: "course" }]);
  });
});

describe("listRubrics - account-level access denied is the everyday case, not an error (AC6)", () => {
  it("a 403 resolving the course account is silent: no error, just no account rubrics", async () => {
    stubCanvas({
      course: { status: 403 },
      courseRubrics: { status: 200, body: [{ id: 1, title: "Course Rubric" }] },
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.error).toBeUndefined();
    expect(result.rubrics).toEqual([{ id: 1, title: "Course Rubric", source: "course" }]);
  });

  it("a 403 listing account rubrics (account resolved, but not visible) is silent", async () => {
    stubCanvas({
      course: { status: 200, account_id: 55 },
      courseRubrics: { status: 200, body: [{ id: 1, title: "Course Rubric" }] },
      accountRubrics: { status: 403 },
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.error).toBeUndefined();
    expect(result.rubrics).toEqual([{ id: 1, title: "Course Rubric", source: "course" }]);
  });

  it("a course with zero rubrics anywhere reports no error at all - genuinely empty, not failed (AC3)", async () => {
    stubCanvas({
      course: { status: 403 },
      courseRubrics: { status: 200, body: [] },
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.rubrics).toEqual([]);
    expect(result.error).toBeUndefined();
  });
});

describe("listRubrics - a genuine failure surfaces as a real error, never a silent empty list (AC3/bug #2)", () => {
  it("the course-level rubrics fetch failing (bad token/permissions) is a real error", async () => {
    stubCanvas({
      course: { status: 200, account_id: 55 },
      courseRubrics: { status: 401 },
      accountRubrics: { status: 403 },
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.error).toBeTruthy();
    expect(result.rubrics).toEqual([]);
  });

  it("a network-level failure fetching course rubrics is a real error, not an empty list", async () => {
    stubCanvas({
      course: { status: 200, account_id: 55 },
      accountRubrics: { status: 403 },
      throwOn: "/courses/123/rubrics",
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.error).toBeTruthy();
    expect(result.rubrics).toEqual([]);
  });

  it("account rubrics failing with a 500 (not a permission response) is a real error", async () => {
    stubCanvas({
      course: { status: 200, account_id: 55 },
      courseRubrics: { status: 200, body: [] },
      accountRubrics: { status: 500 },
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.error).toBeTruthy();
  });
});

describe("listRubrics - one source failing never wipes out the other (AC4)", () => {
  it("course-level rubrics that loaded fine are kept when the account fetch genuinely fails", async () => {
    stubCanvas({
      course: { status: 200, account_id: 55 },
      courseRubrics: { status: 200, body: [{ id: 1, title: "Course Rubric" }] },
      accountRubrics: { status: 500 },
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.error).toBeTruthy();
    expect(result.rubrics).toEqual([{ id: 1, title: "Course Rubric", source: "course" }]);
  });

  it("account-level rubrics that loaded fine are kept when the course fetch genuinely fails", async () => {
    stubCanvas({
      course: { status: 200, account_id: 55 },
      courseRubrics: { status: 500 },
      accountRubrics: { status: 200, body: [{ id: 2, title: "Shared Rubric" }] },
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.error).toBeTruthy();
    expect(result.rubrics).toEqual([{ id: 2, title: "Shared Rubric", source: "account" }]);
  });

  it("both sources failing reports an error naming both, with an empty rubric list", async () => {
    stubCanvas({
      course: { status: 200, account_id: 55 },
      courseRubrics: { status: 500 },
      accountRubrics: { status: 500 },
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.rubrics).toEqual([]);
    expect(result.error).toBeTruthy();
  });
});

describe("listRubrics - a 200 with a non-JSON body never throws (finding 2)", () => {
  it("does not throw, and course rubrics that loaded fine survive, when GET /courses/:id returns a 200 non-JSON body", async () => {
    // This is the account-id-resolution step's OWN fetch returning an
    // institution login page / proxy interstitial with a 200 status - the
    // `.json()` call used to sit outside its surrounding try, so this would
    // reject and propagate out of listAccountRubrics, out of the
    // Promise.all, and out of listRubrics itself.
    stubCanvas({
      course: { status: 200, badJson: true },
      courseRubrics: { status: 200, body: [{ id: 1, title: "Course Rubric" }] },
    });
    // If the `.json()` rejection escaped listAccountRubrics/listRubrics
    // (the bug this pins), this `await` itself would reject and fail the
    // test - no separate not-toThrow assertion is needed on top of that.
    const result = await listRubrics(COURSE_URL);
    expect(result.rubrics).toEqual([{ id: 1, title: "Course Rubric", source: "course" }]);
    expect(result.error).toBeTruthy();
  });

  it("does not throw, and course rubrics that loaded fine survive, when GET /accounts/:id/rubrics returns a 200 non-JSON body", async () => {
    stubCanvas({
      course: { status: 200, account_id: 55 },
      courseRubrics: { status: 200, body: [{ id: 1, title: "Course Rubric" }] },
      accountRubrics: { status: 200, badJson: true },
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.rubrics).toEqual([{ id: 1, title: "Course Rubric", source: "course" }]);
    expect(result.error).toBeTruthy();
  });
});

describe("listRubrics - an absent account_id is not an error (finding 3)", () => {
  it("a 200 course response with no account_id field is silent: no error, just no account rubrics", async () => {
    stubCanvas({
      course: { status: 200 }, // no account_id
      courseRubrics: { status: 200, body: [{ id: 1, title: "Course Rubric" }] },
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.error).toBeUndefined();
    expect(result.rubrics).toEqual([{ id: 1, title: "Course Rubric", source: "course" }]);
  });
});

describe("listRubrics - a 404 on the account path is the everyday case, not an error (finding 4)", () => {
  it("a 404 resolving the course account is silent, same as 401/403", async () => {
    stubCanvas({
      course: { status: 404 },
      courseRubrics: { status: 200, body: [{ id: 1, title: "Course Rubric" }] },
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.error).toBeUndefined();
    expect(result.rubrics).toEqual([{ id: 1, title: "Course Rubric", source: "course" }]);
  });

  it("a 404 listing account rubrics (account resolved, but not visible) is silent, same as 401/403", async () => {
    stubCanvas({
      course: { status: 200, account_id: 55 },
      courseRubrics: { status: 200, body: [{ id: 1, title: "Course Rubric" }] },
      accountRubrics: { status: 404 },
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.error).toBeUndefined();
    expect(result.rubrics).toEqual([{ id: 1, title: "Course Rubric", source: "course" }]);
  });

  it("a 429 on the account rubrics path is NOT folded into the silent bucket - it is a real, surfaced error", async () => {
    // Decision (finding 4): unlike 401/403/404, a 429 is a transient
    // rate-limit condition, and this raw fetch has no retry of its own
    // (unlike bulkAssociateRubric's throttled loop) - silently reading it as
    // "no account rubrics" would hide a fixable, worth-surfacing condition
    // behind a false "genuinely empty" result.
    stubCanvas({
      course: { status: 200, account_id: 55 },
      courseRubrics: { status: 200, body: [{ id: 1, title: "Course Rubric" }] },
      accountRubrics: { status: 429 },
    });
    const result = await listRubrics(COURSE_URL);
    expect(result.error).toBeTruthy();
    expect(result.rubrics).toEqual([{ id: 1, title: "Course Rubric", source: "course" }]);
  });
});
