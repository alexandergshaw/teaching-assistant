// TDD suite for the transport migration of setOneDueDate's "Discussion"
// branch - the only call site in due-dates.ts that used to dial the
// platform `fetch` directly with a hand-built Authorization header, to look
// up a discussion's graded assignment_id before writing its due date. The
// Assignment/Quiz branches, and the Discussion branch's own follow-up write,
// already read through fetch-helpers.ts's writeJson - unaffected by this
// change and already covered by fetch-helpers.canvas-fetch.test.ts.
//
// The Discussion lookup now dials Canvas through canvasGet
// (src/lib/canvas-fetch-response.ts), which itself goes through canvasFetch
// (src/lib/canvas-fetch.ts, real DNS resolution + connection pinning).
// Mocked at the canvasFetch module boundary, same as
// fetch-helpers.canvas-fetch.test.ts, so canvasGet's own
// result-to-Response/throw mapping still runs for real - only the actual
// network dial is faked.
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
vi.mock("../canvas-fetch", () => ({ canvasFetch: vi.fn() }));

// The Assignment/Quiz branches, and the Discussion branch's follow-up write,
// go through writeJson (fetch-helpers.ts) - mocked at that boundary, same as
// gradables.test.ts/pages.test.ts, since this suite is about which endpoint
// setOneDueDate addresses and what it sends, not about fetch-helpers' own
// pagination/retry (already covered elsewhere).
vi.mock("./fetch-helpers", async () => {
  const actual = await vi.importActual<typeof import("./fetch-helpers")>("./fetch-helpers");
  return { ...actual, writeJson: vi.fn() };
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setDueDates } from "./due-dates";
import { writeJson } from "./fetch-helpers";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";

const mockWriteJson = vi.mocked(writeJson);
const mockCanvasFetch = vi.mocked(canvasFetch);

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body - the shape
 * canvasGet's underlying canvasFetch returns for a completed exchange. */
function okResult(body: unknown, status = 200): CanvasFetchResult {
  return { ok: true, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}

const UNREACHABLE: CanvasFetchResult = { ok: false, kind: "unreachable" };

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
  mockWriteJson.mockReset();
  mockCanvasFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("setDueDates - Assignment/Quiz branches write directly via writeJson, unaffected by this migration", () => {
  it("PUTs assignment[due_at] to the assignments endpoint", async () => {
    mockWriteJson.mockResolvedValueOnce({});

    const result = await setDueDates(COURSE_URL, [{ type: "Assignment", contentId: 42, dueAt: "2026-09-01T00:00:00Z" }], "MCC");

    expect(result).toEqual({ updated: 1, failures: [] });
    expect(mockWriteJson).toHaveBeenCalledTimes(1);
    const [url, method, , params] = mockWriteJson.mock.calls[0] as unknown as [
      string,
      string,
      unknown,
      URLSearchParams | undefined,
    ];
    expect(url).toBe("https://canvas.mccneb.edu/api/v1/courses/123/assignments/42");
    expect(method).toBe("PUT");
    expect(params?.get("assignment[due_at]")).toBe("2026-09-01T00:00:00Z");
    expect(mockCanvasFetch).not.toHaveBeenCalled();
  });

  it("PUTs quiz[due_at] to the quizzes endpoint", async () => {
    mockWriteJson.mockResolvedValueOnce({});

    await setDueDates(COURSE_URL, [{ type: "Quiz", contentId: 901, dueAt: null }], "MCC");

    const [url, , , params] = mockWriteJson.mock.calls[0] as unknown as [
      string,
      string,
      unknown,
      URLSearchParams | undefined,
    ];
    expect(url).toBe("https://canvas.mccneb.edu/api/v1/courses/123/quizzes/901");
    expect(params?.get("quiz[due_at]")).toBe("");
  });
});

describe("setDueDates - Discussion branch: migrated to canvasGet (the shared adapter) for the graded-lookup, never platform fetch", () => {
  it("looks up the discussion's assignment_id via canvasGet, then writes the due date to that assignment", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ assignment_id: 555 }));
    mockWriteJson.mockResolvedValueOnce({});

    const result = await setDueDates(
      COURSE_URL,
      [{ type: "Discussion", contentId: 77, dueAt: "2026-09-01T00:00:00Z" }],
      "MCC"
    );

    expect(result).toEqual({ updated: 1, failures: [] });
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url, init, credential] = mockCanvasFetch.mock.calls[0];
    expect(url).toBe("https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics/77");
    expect(Object.keys(init.headers ?? {})).not.toContain("Authorization");
    expect(credential).toEqual({ token: "test-token" });

    expect(mockWriteJson).toHaveBeenCalledTimes(1);
    const [writeUrl, method, , params] = mockWriteJson.mock.calls[0] as unknown as [
      string,
      string,
      unknown,
      URLSearchParams | undefined,
    ];
    expect(writeUrl).toBe("https://canvas.mccneb.edu/api/v1/courses/123/assignments/555");
    expect(method).toBe("PUT");
    expect(params?.get("assignment[due_at]")).toBe("2026-09-01T00:00:00Z");
  });

  it("reports a per-item failure (not a thrown error out of the batch) when the discussion is not graded", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ assignment_id: null }));

    const result = await setDueDates(COURSE_URL, [{ type: "Discussion", contentId: 77, dueAt: null }], "MCC");

    expect(result.updated).toBe(0);
    expect(result.failures).toEqual([
      { contentId: 77, error: "This discussion is not graded, so it has no due date." },
    ]);
    expect(mockWriteJson).not.toHaveBeenCalled();
  });

  it("reports a per-item failure with canvasError's mapped message on a non-ok lookup status, unchanged from before the migration", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 404));

    const result = await setDueDates(COURSE_URL, [{ type: "Discussion", contentId: 77, dueAt: null }], "MCC");

    expect(result.failures).toEqual([
      {
        contentId: 77,
        error: "Canvas could not find that resource. Check the URL and that the token's account can see it.",
      },
    ]);
  });

  it("reports a per-item failure with a fixed literal - never anything derived from the underlying failure - when Canvas is unreachable", async () => {
    mockCanvasFetch.mockResolvedValueOnce(UNREACHABLE);

    const result = await setDueDates(COURSE_URL, [{ type: "Discussion", contentId: 77, dueAt: null }], "MCC");

    expect(result.failures).toEqual([{ contentId: 77, error: "Canvas did not respond." }]);
  });

  it("one failing item never blocks the rest of the batch", async () => {
    mockCanvasFetch.mockResolvedValueOnce(UNREACHABLE).mockResolvedValueOnce(okResult({ assignment_id: 555 }));
    mockWriteJson.mockResolvedValue({});

    const result = await setDueDates(
      COURSE_URL,
      [
        { type: "Discussion", contentId: 1, dueAt: null },
        { type: "Discussion", contentId: 2, dueAt: null },
      ],
      "MCC"
    );

    expect(result.updated).toBe(1);
    expect(result.failures).toEqual([{ contentId: 1, error: "Canvas did not respond." }]);
  });
});
