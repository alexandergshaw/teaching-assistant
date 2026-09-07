// TDD suite for the transport migration of getMigrationState and
// getSelectiveData - the only two call sites in copy.ts that used to dial
// the platform `fetch` directly with a hand-built Authorization header.
// createCourseCopy/submitSelectiveImport/selectCopyTypes already read
// through fetch-helpers.ts's writeJson, unaffected by this change and
// already covered by fetch-helpers.canvas-fetch.test.ts.
//
// Both now dial Canvas through canvasGet (src/lib/canvas-fetch-response.ts),
// which itself goes through canvasFetch (src/lib/canvas-fetch.ts, real DNS
// resolution + connection pinning). Mocked at the canvasFetch module
// boundary, same as fetch-helpers.canvas-fetch.test.ts, so canvasGet's own
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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getMigrationState, getSelectiveData } from "./copy";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";

const mockCanvasFetch = vi.mocked(canvasFetch);

const CONTEXT_COURSE_URL = "https://canvas.mccneb.edu/courses/123";
const DEST_COURSE_ID = "456";
const MIGRATION_ID = 789;

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body - the shape
 * canvasGet's underlying canvasFetch returns for a completed exchange. */
function okResult(body: unknown, status = 200): CanvasFetchResult {
  return { ok: true, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}

const UNREACHABLE: CanvasFetchResult = { ok: false, kind: "unreachable" };

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
  mockCanvasFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getMigrationState - migrated to canvasGet (the shared adapter), never platform fetch", () => {
  it("GETs the content_migrations endpoint with the resolved bearer credential, not a caller-built header", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ id: MIGRATION_ID, workflow_state: "running" }));

    const state = await getMigrationState(CONTEXT_COURSE_URL, DEST_COURSE_ID, MIGRATION_ID, "MCC");

    expect(state).toBe("running");
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url, init, credential] = mockCanvasFetch.mock.calls[0];
    expect(url).toBe(`https://canvas.mccneb.edu/api/v1/courses/${DEST_COURSE_ID}/content_migrations/${MIGRATION_ID}`);
    expect(Object.keys(init.headers ?? {})).not.toContain("Authorization");
    expect(credential).toEqual({ token: "test-token" });
  });

  it("defaults workflow_state to an empty string when absent", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ id: MIGRATION_ID }));

    const state = await getMigrationState(CONTEXT_COURSE_URL, DEST_COURSE_ID, MIGRATION_ID, "MCC");

    expect(state).toBe("");
  });

  it("throws canvasError's mapped message on a non-ok status, unchanged from before the migration", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 404));

    await expect(getMigrationState(CONTEXT_COURSE_URL, DEST_COURSE_ID, MIGRATION_ID, "MCC")).rejects.toThrow(
      "Canvas could not find that resource. Check the URL and that the token's account can see it."
    );
  });

  it("throws a fixed literal - never anything derived from the underlying failure - when Canvas is unreachable", async () => {
    mockCanvasFetch.mockResolvedValueOnce(UNREACHABLE);

    await expect(getMigrationState(CONTEXT_COURSE_URL, DEST_COURSE_ID, MIGRATION_ID, "MCC")).rejects.toThrow(
      "Canvas did not respond."
    );
  });
});

describe("getSelectiveData - migrated to canvasGet (the shared adapter), never platform fetch", () => {
  it("GETs the selective_data endpoint and maps the selectable tree", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([
        { property: "copy[all_assignments]", title: "Assignments", type: "assignment", count: 3, sub_items: [] },
        { property: "", title: "No property - dropped" },
      ])
    );

    const nodes = await getSelectiveData(CONTEXT_COURSE_URL, DEST_COURSE_ID, MIGRATION_ID, "MCC");

    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url] = mockCanvasFetch.mock.calls[0];
    expect(url).toBe(
      `https://canvas.mccneb.edu/api/v1/courses/${DEST_COURSE_ID}/content_migrations/${MIGRATION_ID}/selective_data`
    );
    // Entries with no property key are filtered, same as before the migration.
    expect(nodes).toEqual([
      { property: "copy[all_assignments]", title: "Assignments", type: "assignment", count: 3, subItems: [] },
    ]);
  });

  it("throws canvasError's mapped message on a non-ok status, unchanged from before the migration", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 401));

    await expect(getSelectiveData(CONTEXT_COURSE_URL, DEST_COURSE_ID, MIGRATION_ID, "MCC")).rejects.toThrow(
      "Canvas rejected the request: the API token is missing, invalid, or lacks access to this course (MCC_CANVAS_API_TOKEN)."
    );
  });

  it("throws a fixed literal - never anything derived from the underlying failure - when Canvas is unreachable", async () => {
    mockCanvasFetch.mockResolvedValueOnce(UNREACHABLE);

    await expect(getSelectiveData(CONTEXT_COURSE_URL, DEST_COURSE_ID, MIGRATION_ID, "MCC")).rejects.toThrow(
      "Canvas did not respond."
    );
  });
});
