// TDD suite for the Canvas jobs diagnostics lib layer
// (docs/canvas-jobs-diagnostics-acceptance-criteria.md section B, AC1-AC4,
// AC19).
//
// The AC2/AC3 SSRF guard is the point of several tests here: progress_url is
// remote-supplied JSON, and a foreign-origin value must be refused BEFORE
// any fetch is issued - not caught after the fact by a failed request. The
// guard itself is the shared `assertCanvasSuppliedUrlIsSameOrigin`
// (src/lib/canvas-remote-url.ts).
//
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

// listContentMigrations reads through fetchAll, and cancelMigrationJob's
// final POST /cancel goes through writeJson - both (fetch-helpers.ts) dial
// Canvas via canvasFetch (real DNS resolution + connection pinning) instead
// of the platform fetch, so stubbing globalThis.fetch alone does not
// intercept either - mocked at the fetch-helpers boundary instead, as
// before.
//
// fetchProgress (used by getMigrationProgress and by cancelMigrationJob's
// own progress check) and cancelMigrationJob's initial GET of the migration
// itself now dial Canvas through canvasGet (src/lib/canvas-fetch-response.ts),
// which itself goes through canvasFetch - migrations.ts never routed them
// through fetch-helpers, so they are mocked at the canvasFetch module
// boundary instead, same as fetch-helpers.canvas-fetch.test.ts. Stubbing
// globalThis.fetch (this file's previous approach for these two) no longer
// intercepts either, which is why every getMigrationProgress/cancelMigrationJob
// test below used to hang until timeout.
//
// Mocked at the fetch-helpers boundary (fetchAll/writeJson) rather than at
// canvasFetch for the first pair: no fixture here spans multiple pages
// (listContentMigrations pagination is already covered by
// fetch-helpers.canvas-fetch.test.ts), and the SSRF guard under test
// (assertCanvasSuppliedUrlIsSameOrigin) runs in migrations.ts itself,
// entirely before any fetchAll/writeJson/canvasGet call - mocking any of
// these boundaries leaves that guard's own tests exercising the real guard
// either way.
vi.mock("./fetch-helpers", async () => {
  const actual = await vi.importActual<typeof import("./fetch-helpers")>("./fetch-helpers");
  return { ...actual, fetchAll: vi.fn(), writeJson: vi.fn() };
});
vi.mock("../canvas-fetch", () => ({ canvasFetch: vi.fn() }));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  listContentMigrations,
  getMigrationProgress,
  cancelMigrationJob,
  classifyMigration,
} from "./migrations";
import { fetchAll, writeJson } from "./fetch-helpers";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";

const mockFetchAll = vi.mocked(fetchAll);
const mockWriteJson = vi.mocked(writeJson);
const mockCanvasFetch = vi.mocked(canvasFetch);

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";
const BASE = "https://canvas.mccneb.edu";

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body - the shape
 * canvasGet's underlying canvasFetch returns for a completed exchange. */
function okResult(body: unknown, status = 200): CanvasFetchResult {
  return { ok: true, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
  mockFetchAll.mockReset();
  mockWriteJson.mockReset();
  mockCanvasFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("classifyMigration (AC4) - pure, exhaustive over documented states", () => {
  it("pre_processing is stuck-no-file, not cancellable, regardless of progress", () => {
    expect(classifyMigration("pre_processing", null).kind).toBe("stuck-no-file");
    expect(classifyMigration("pre_processing", null).cancellable).toBe(false);
    expect(classifyMigration("pre_processing", "queued").kind).toBe("stuck-no-file");
  });

  it("waiting_for_select is parked, not cancellable", () => {
    const v = classifyMigration("waiting_for_select", null);
    expect(v.kind).toBe("parked");
    expect(v.cancellable).toBe(false);
  });

  it("progress queued is cancellable", () => {
    const v = classifyMigration("running", "queued");
    expect(v.kind).toBe("cancellable");
    expect(v.cancellable).toBe(true);
  });

  it("progress running is cancellable and warns about partial import", () => {
    const v = classifyMigration("running", "running");
    expect(v.kind).toBe("running");
    expect(v.cancellable).toBe(true);
    expect(v.sentence.toLowerCase()).toContain("partially imported");
  });

  it("completed (by progress or by migration state) is done, not cancellable", () => {
    expect(classifyMigration("completed", "completed").kind).toBe("done");
    expect(classifyMigration("completed", null).kind).toBe("done");
    expect(classifyMigration("running", "completed").cancellable).toBe(false);
  });

  it("failed (by progress or by migration state) is failed, not cancellable", () => {
    expect(classifyMigration("failed", "failed").kind).toBe("failed");
    expect(classifyMigration("failed", null).kind).toBe("failed");
    expect(classifyMigration("running", "failed").cancellable).toBe(false);
  });

  it("falls back to unknown and names the raw states, never inventing a diagnosis", () => {
    const v = classifyMigration("pre_processed", null);
    expect(v.kind).toBe("unknown");
    expect(v.cancellable).toBe(false);
    expect(v.sentence).toContain("pre_processed");
    expect(v.sentence).toContain("none");
  });

  it("unknown sentence names the actual progress state when one is present", () => {
    const v = classifyMigration("some_future_state", "some_future_progress_state");
    expect(v.sentence).toContain("some_future_state");
    expect(v.sentence).toContain("some_future_progress_state");
  });
});

describe("listContentMigrations (AC1)", () => {
  it("maps fields, drops rows with no numeric id, and sorts newest first", async () => {
    mockFetchAll.mockResolvedValueOnce([
      {
        id: 1,
        migration_type: "course_copy_importer",
        workflow_state: "completed",
        created_at: "2026-01-01T00:00:00Z",
        finished_at: "2026-01-01T00:05:00Z",
        progress_url: `${BASE}/api/v1/progress/501`,
        migration_issues_count: 2,
        migration_issues_url: `${BASE}/api/v1/courses/123/content_migrations/1/migration_issues`,
      },
      {
        // No numeric id - must be dropped entirely.
        migration_type: "zip_file_importer",
        workflow_state: "pre_processing",
      },
      {
        id: 3,
        workflow_state: "running",
        created_at: "2026-03-01T00:00:00Z",
      },
    ]);

    const rows = await listContentMigrations(COURSE_URL);

    expect(rows).toHaveLength(2);
    // Newest first: id 3 (March) before id 1 (January).
    expect(rows.map((r) => r.id)).toEqual([3, 1]);

    const row1 = rows.find((r) => r.id === 1)!;
    expect(row1).toEqual({
      id: 1,
      migrationType: "course_copy_importer",
      workflowState: "completed",
      createdAt: "2026-01-01T00:00:00Z",
      finishedAt: "2026-01-01T00:05:00Z",
      progressUrl: `${BASE}/api/v1/progress/501`,
      migrationIssuesCount: 2,
      migrationIssuesUrl: `${BASE}/api/v1/courses/123/content_migrations/1/migration_issues`,
    });

    // Absent optional fields map to null/0, not undefined.
    const row3 = rows.find((r) => r.id === 3)!;
    expect(row3.migrationType).toBe("");
    expect(row3.finishedAt).toBeNull();
    expect(row3.progressUrl).toBeNull();
    expect(row3.migrationIssuesCount).toBe(0);
    expect(row3.migrationIssuesUrl).toBeNull();
  });

  it("treats a missing createdAt as oldest, not newest", async () => {
    mockFetchAll.mockResolvedValueOnce([
      { id: 1, workflow_state: "completed", created_at: null },
      { id: 2, workflow_state: "completed", created_at: "2026-01-01T00:00:00Z" },
    ]);

    const rows = await listContentMigrations(COURSE_URL);

    expect(rows.map((r) => r.id)).toEqual([2, 1]);
  });

  it("requests the expected endpoint with a bearer token", async () => {
    mockFetchAll.mockResolvedValueOnce([]);

    await listContentMigrations(COURSE_URL);

    expect(mockFetchAll).toHaveBeenCalledTimes(1);
    const [url, ctx] = mockFetchAll.mock.calls[0] as unknown as [string, { token: string }];
    expect(url).toBe(`${BASE}/api/v1/courses/123/content_migrations?per_page=100`);
    // The bearer credential resolveCourse resolved really did reach fetchAll -
    // canvasFetch (not this test) owns turning it into an Authorization
    // header, and that plumbing is fully covered by
    // fetch-helpers.canvas-fetch.test.ts.
    expect(ctx.token).toBe("test-token");
  });
});

describe("getMigrationProgress (AC2) - SSRF guard", () => {
  it("fetches an on-host progress_url through canvasGet (the adapter), not platform fetch, and maps the result", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult({ id: 501, workflow_state: "running", completion: 40, message: null })
    );

    const progress = await getMigrationProgress(COURSE_URL, `${BASE}/api/v1/progress/501`);

    expect(progress).toEqual({ id: 501, workflowState: "running", completion: 40, message: null });
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    expect(mockCanvasFetch.mock.calls[0][0]).toBe(`${BASE}/api/v1/progress/501`);
    // The credential goes to canvasFetch itself, never a caller-built
    // Authorization header.
    expect(mockCanvasFetch.mock.calls[0][2]).toEqual({ token: "test-token" });
  });

  it("maps a missing completion/message to null, not undefined", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ id: 501, workflow_state: "queued" }));

    const progress = await getMigrationProgress(COURSE_URL, `${BASE}/api/v1/progress/501`);

    expect(progress.completion).toBeNull();
    expect(progress.message).toBeNull();
  });

  it("refuses a foreign-origin progress_url and issues NO fetch", async () => {
    await expect(
      getMigrationProgress(COURSE_URL, "https://evil.example.com/api/v1/progress/501")
    ).rejects.toThrow(
      'Refusing to follow a Canvas-supplied URL: expected it to be on https://canvas.mccneb.edu, but it resolved to a different origin (https://evil.example.com). Received "https://evil.example.com/api/v1/progress/501".'
    );
    expect(mockCanvasFetch).not.toHaveBeenCalled();
  });

  it("refuses a progress_url on a different port as a different origin", async () => {
    await expect(
      getMigrationProgress(COURSE_URL, "https://canvas.mccneb.edu:8443/api/v1/progress/501")
    ).rejects.toThrow(
      'Refusing to follow a Canvas-supplied URL: expected it to be on https://canvas.mccneb.edu, but it resolved to a different origin (https://canvas.mccneb.edu:8443). Received "https://canvas.mccneb.edu:8443/api/v1/progress/501".'
    );
    expect(mockCanvasFetch).not.toHaveBeenCalled();
  });

  it("throws a fixed literal - never anything derived from the underlying failure - when Canvas is unreachable", async () => {
    mockCanvasFetch.mockResolvedValueOnce({ ok: false, kind: "unreachable" });

    await expect(getMigrationProgress(COURSE_URL, `${BASE}/api/v1/progress/501`)).rejects.toThrow(
      "Canvas did not respond."
    );
  });
});

describe("cancelMigrationJob (AC3)", () => {
  function migrationResult(body: Record<string, unknown>, status = 200): CanvasFetchResult {
    return okResult(body, status);
  }

  it("throws naming the workflow_state when the migration has no progress_url", async () => {
    mockCanvasFetch.mockResolvedValueOnce(migrationResult({ id: 1, workflow_state: "pre_processing" }));

    await expect(cancelMigrationJob(COURSE_URL, 1)).rejects.toThrow(
      /pre_processing.*no job to cancel and no way to delete the migration/
    );
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("throws 'already finished' when the progress is completed, without POSTing cancel", async () => {
    mockCanvasFetch.mockImplementation(async (url: string) => {
      const href = String(url);
      if (href.includes("/content_migrations/1")) {
        return migrationResult({
          id: 1,
          workflow_state: "running",
          progress_url: `${BASE}/api/v1/progress/501`,
        });
      }
      if (href.includes("/progress/501")) {
        return okResult({ id: 501, workflow_state: "completed" });
      }
      throw new Error(`unexpected canvasFetch call: ${href}`);
    });

    await expect(cancelMigrationJob(COURSE_URL, 1)).rejects.toThrow(/already finished/);
    // GET migration + GET progress, but never a third call (the POST cancel,
    // which would go through the mocked writeJson - asserted below).
    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
    expect(mockWriteJson).not.toHaveBeenCalled();
  });

  it("refuses a foreign-origin progress_url and issues no progress or cancel fetch", async () => {
    mockCanvasFetch.mockImplementation(async (url: string) => {
      const href = String(url);
      if (href.includes("/content_migrations/1")) {
        return migrationResult({
          id: 1,
          workflow_state: "running",
          progress_url: "https://evil.example.com/api/v1/progress/501",
        });
      }
      throw new Error(`unexpected canvasFetch call: ${href}`);
    });

    await expect(cancelMigrationJob(COURSE_URL, 1)).rejects.toThrow(
      'Refusing to follow a Canvas-supplied URL: expected it to be on https://canvas.mccneb.edu, but it resolved to a different origin (https://evil.example.com). Received "https://evil.example.com/api/v1/progress/501".'
    );
    // Only the trusted GET of the migration itself - never a fetch to the
    // foreign host, for the state check OR the cancel POST.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    expect(mockWriteJson).not.toHaveBeenCalled();
  });

  it("POSTs /cancel with a message and returns the resulting progress state", async () => {
    mockCanvasFetch.mockImplementation(async (url: string) => {
      const href = String(url);
      if (href.includes("/content_migrations/1")) {
        return migrationResult({
          id: 1,
          workflow_state: "running",
          progress_url: `${BASE}/api/v1/progress/501`,
        });
      }
      if (href.includes("/progress/501")) {
        return okResult({ id: 501, workflow_state: "queued" });
      }
      throw new Error(`unexpected canvasFetch call: ${href}`);
    });
    mockWriteJson.mockResolvedValueOnce({ id: 501, workflow_state: "failed" });

    const result = await cancelMigrationJob(COURSE_URL, 1);

    expect(result).toEqual({ progressState: "failed" });
    // The two trusted GETs (migration, then its progress) went through
    // canvasGet - the adapter, not platform fetch.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
    // The actual cancel POST now goes through the mocked writeJson.
    expect(mockWriteJson).toHaveBeenCalledTimes(1);
    const [url, method, , params] = mockWriteJson.mock.calls[0] as unknown as [
      string,
      string,
      unknown,
      URLSearchParams | undefined,
    ];
    expect(url).toBe(`${BASE}/api/v1/progress/501/cancel`);
    expect(method).toBe("POST");
    expect(params?.toString()).toBe("message=Cancelled+from+the+diagnostics+screen");
  });
});
