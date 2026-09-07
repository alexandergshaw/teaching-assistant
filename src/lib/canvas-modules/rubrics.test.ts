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
// resolveCourse (via resolveInstitutionByCode) now delegates credential
// resolution to canvas-credentials.ts, which resolves the calling identity
// server-side before ever reading an env var (E-ARCH4). Mocking the identity
// to role: "owner" (E-ARCH6's uniform convention across every one of this
// repo's Canvas test files) keeps the env-var branch this suite's
// vi.stubEnv calls rely on reachable, without a real Supabase call - the
// stored-credential branch is mocked to "no row" (null) so it falls through
// to that owner env branch instead of attempting a real DB read.
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

// resolveAccountId (GET /courses/:id), listAccountRubrics's own manual
// pagination (GET /accounts/:id/rubrics), and getRubric now dial Canvas
// through canvasGet (src/lib/canvas-fetch-response.ts), which itself goes
// through canvasFetch (src/lib/canvas-fetch.ts, real DNS resolution +
// connection pinning) instead of the platform fetch - stubbing
// globalThis.fetch (this file's previous approach) no longer intercepts any
// of them, which is why every account-level test below used to hang until
// timeout. Mocked at the canvasFetch module boundary, same as
// fetch-helpers.canvas-fetch.test.ts, so canvasGet's own
// result-to-Response/throw mapping still runs for real - only the actual
// network dial is faked.
vi.mock("../canvas-fetch", () => ({ canvasFetch: vi.fn() }));

// listCourseRubrics is the ONLY thing in this file that reads through
// fetchAll (fetch-helpers.ts). Mocked at the fetch-helpers boundary
// (fetchAll itself) rather than at canvasFetch: this suite is about the
// MERGE logic between the course-level and account-level sources
// (AC1/AC2/AC4) and about which failures are silent vs real (AC3/AC6) -
// none of that lives inside fetch-helpers.ts, and no fixture here spans
// multiple course-rubrics pages (fetchAll's own pagination is already
// covered by fetch-helpers.canvas-fetch.test.ts).
vi.mock("./fetch-helpers", async () => {
  const actual = await vi.importActual<typeof import("./fetch-helpers")>("./fetch-helpers");
  return { ...actual, fetchAll: vi.fn() };
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listRubrics, getRubric } from "./rubrics";
import { fetchAll } from "./fetch-helpers";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";
import { CANVAS_PAGINATION_PAGE_CAP } from "../canvas-remote-url";

const mockFetchAll = vi.mocked(fetchAll);
const mockCanvasFetch = vi.mocked(canvasFetch);

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body - the shape
 * canvasGet's underlying canvasFetch returns for a completed exchange. */
function okResult(body: unknown, status = 200, headers: Record<string, string> = {}): CanvasFetchResult {
  return { ok: true, status, headers, body: Buffer.from(JSON.stringify(body)) };
}

/** A 200 whose body is NOT valid JSON (an institution login page, a
 * Cloudflare interstitial, a truncated body). canvasGet hands the caller a
 * REAL Response built from this body, so its `.json()` rejects the same way
 * a genuine non-JSON body would - no stubbed `.json()` needed. Pins finding
 * 2: this used to sit outside the surrounding try/catch and would throw out
 * of listRubrics entirely. */
function badJsonResult(status: number, headers: Record<string, string> = {}): CanvasFetchResult {
  return { ok: true, status, headers, body: Buffer.from("<html>not json</html>") };
}

const UNREACHABLE: CanvasFetchResult = { ok: false, kind: "unreachable" };

type Handlers = {
  /** GET /courses/:id - just needs an account_id (or a status to fail with). */
  course?: { status: number; account_id?: number; badJson?: boolean };
  /** GET /courses/:id/rubrics */
  courseRubrics?: { status: number; body?: unknown[] };
  /** GET /accounts/:id/rubrics */
  accountRubrics?: { status: number; body?: unknown[]; badJson?: boolean };
  /** Force a network-layer "unreachable" canvasFetch result instead of a
   * completed exchange, keyed by URL substring - the canvasFetch-mock
   * equivalent of the old raw-fetch "throw" fixture. */
  throwOn?: string;
};

function stubCanvas(handlers: Handlers) {
  // resolveAccountId and listAccountRubrics's own pagination - now dialled
  // through canvasGet -> canvasFetch, mocked at the canvasFetch boundary.
  mockCanvasFetch.mockImplementation(async (url: string): Promise<CanvasFetchResult> => {
    const href = String(url);
    if (handlers.throwOn && href.includes(handlers.throwOn)) {
      return UNREACHABLE;
    }
    if (href.includes("/accounts/") && href.includes("/rubrics")) {
      const h = handlers.accountRubrics ?? { status: 200, body: [] };
      if (h.badJson) return badJsonResult(h.status);
      return okResult(h.body ?? [], h.status);
    }
    if (href.endsWith("/courses/123")) {
      const h = handlers.course ?? { status: 200, account_id: 55 };
      if (h.badJson) return badJsonResult(h.status);
      return okResult(h.status >= 200 && h.status < 300 ? { account_id: h.account_id } : {}, h.status);
    }
    throw new Error(`unexpected canvasFetch request: ${href}`);
  });

  // listCourseRubrics's one GET (/courses/:id/rubrics) - now behind fetchAll,
  // mocked directly (see this file's header comment for why).
  mockFetchAll.mockImplementation(async (url: string) => {
    const href = String(url);
    if (handlers.throwOn && href.includes(handlers.throwOn)) {
      throw new Error("network down");
    }
    if (href.includes("/courses/123/rubrics")) {
      const h = handlers.courseRubrics ?? { status: 200, body: [] };
      if (h.status >= 200 && h.status < 300) return h.body ?? [];
      throw new Error(`Canvas request failed (HTTP ${h.status}).`);
    }
    throw new Error(`unexpected fetchAll request: ${href}`);
  });
}

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
  mockFetchAll.mockReset();
  mockCanvasFetch.mockReset();
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

// E-CRIT1: listAccountRubrics's manual pagination is a SEPARATE guarded loop
// from fetchAll's (fetch-helpers.ts already proves fetchAll's own guard in
// fetch-helpers.canvas-fetch.test.ts) - this loop needs its own coverage.
// Every candidate is verified same-origin against ctx.baseUrl BEFORE it is
// ever dialled, and the DIALLED string is the guard's return value, never
// the raw header candidate.
describe("listAccountRubrics pagination - the same-origin guard on its own manual Link-header loop", () => {
  it("follows a same-origin Link header across pages and dials the guard's resolved string, not the raw relative header", async () => {
    const rawNext = "/api/v1/accounts/55/rubrics?per_page=100&page=2";
    const resolvedNext = "https://canvas.mccneb.edu/api/v1/accounts/55/rubrics?per_page=100&page=2";

    mockCanvasFetch.mockImplementation(async (url: string): Promise<CanvasFetchResult> => {
      const href = String(url);
      if (href.endsWith("/courses/123")) return okResult({ account_id: 55 });
      if (href === "https://canvas.mccneb.edu/api/v1/accounts/55/rubrics?per_page=100") {
        return okResult([{ id: 1, title: "Page 1 Rubric" }], 200, { link: `<${rawNext}>; rel="next"` });
      }
      if (href === resolvedNext) {
        return okResult([{ id: 2, title: "Page 2 Rubric" }], 200, {});
      }
      throw new Error(`unexpected canvasFetch request: ${href}`);
    });
    mockFetchAll.mockResolvedValue([]);

    const result = await listRubrics(COURSE_URL);

    expect(result.error).toBeUndefined();
    expect(result.rubrics).toEqual([
      { id: 1, title: "Page 1 Rubric", source: "account" },
      { id: 2, title: "Page 2 Rubric", source: "account" },
    ]);
  });

  it("refuses a cross-origin Link header instead of ever dialling it, surfacing a real error (never a silent empty list)", async () => {
    mockCanvasFetch.mockImplementation(async (url: string): Promise<CanvasFetchResult> => {
      const href = String(url);
      if (href.endsWith("/courses/123")) return okResult({ account_id: 55 });
      if (href.includes("/accounts/55/rubrics")) {
        return okResult([{ id: 1, title: "Page 1 Rubric" }], 200, {
          link: '<https://evil.example.com/api/v1/accounts/55/rubrics?page=2>; rel="next"',
        });
      }
      throw new Error(`unexpected canvasFetch request: ${href}`);
    });
    mockFetchAll.mockResolvedValue([]);

    const result = await listRubrics(COURSE_URL);

    expect(result.error).toMatch(/different origin/);
    // The refusal never dialled a second page, so nothing from that page
    // (real or otherwise) can appear.
    expect(result.rubrics).toEqual([]);
    // /courses/123 (resolveAccountId) + the one account-rubrics page - never
    // a call to the evil host.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
    expect(mockCanvasFetch.mock.calls.map((c) => String(c[0]))).not.toContain(
      "https://evil.example.com/api/v1/accounts/55/rubrics?page=2"
    );
  });

  it("caps its own loop at CANVAS_PAGINATION_PAGE_CAP pages even if the remote host keeps paginating forever", async () => {
    mockCanvasFetch.mockImplementation(async (url: string): Promise<CanvasFetchResult> => {
      const href = String(url);
      if (href.endsWith("/courses/123")) return okResult({ account_id: 55 });
      return okResult([{ id: 1, title: "Rubric" }], 200, {
        link: '<https://canvas.mccneb.edu/api/v1/accounts/55/rubrics?per_page=100>; rel="next"',
      });
    });
    mockFetchAll.mockResolvedValue([]);

    const result = await listRubrics(COURSE_URL);

    expect(result.error).toMatch(/exceeded/);
    // The one /courses/123 call, plus exactly CANVAS_PAGINATION_PAGE_CAP
    // account-rubrics pages - never one more.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(CANVAS_PAGINATION_PAGE_CAP + 1);
  });
});

describe("getRubric - migrated to canvasGet (the shared adapter), never platform fetch", () => {
  it("fetches the rubric and maps its criteria/ratings", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult({
        id: 9,
        title: "Essay Rubric",
        data: [
          {
            description: "Thesis",
            points: 10,
            ratings: [
              { description: "Strong", points: 10 },
              { description: "Weak", points: 0 },
            ],
          },
        ],
      })
    );

    const result = await getRubric(COURSE_URL, 9);

    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    expect(mockCanvasFetch.mock.calls[0][0]).toBe("https://canvas.mccneb.edu/api/v1/courses/123/rubrics/9");
    // The credential goes to canvasFetch itself, never a caller-built
    // Authorization header.
    expect(mockCanvasFetch.mock.calls[0][2]).toEqual({ token: "test-token" });
    expect(result.id).toBe(9);
    expect(result.title).toBe("Essay Rubric");
    expect(result.criteria[0].description).toBe("Thesis");
    expect(result.criteria[0].ratings.map((r) => r.description)).toEqual(["Strong", "Weak"]);
  });

  it("throws canvasError's mapped message on a non-ok status, unchanged from before the migration", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 404));

    await expect(getRubric(COURSE_URL, 9)).rejects.toThrow(
      "Canvas could not find that resource. Check the URL and that the token's account can see it."
    );
  });

  it("throws a fixed literal - never anything derived from the underlying failure - when Canvas is unreachable", async () => {
    mockCanvasFetch.mockResolvedValueOnce(UNREACHABLE);

    await expect(getRubric(COURSE_URL, 9)).rejects.toThrow("Canvas did not respond.");
  });
});
