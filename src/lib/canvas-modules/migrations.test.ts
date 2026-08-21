// TDD suite for the Canvas jobs diagnostics lib layer
// (docs/canvas-jobs-diagnostics-acceptance-criteria.md section B, AC1-AC4,
// AC19). Only globalThis.fetch is stubbed - resolveCourse/canvas-core run
// for real, matching the pattern in module-content.test.ts, so these tests
// also pin the real request shape (URLs, headers) and not just a mock's
// idea of it.
//
// The AC2/AC3 SSRF guard is the point of several tests here: progress_url is
// remote-supplied JSON, and a foreign-origin value must be refused BEFORE
// any fetch is issued - not caught after the fact by a failed request.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  listContentMigrations,
  getMigrationProgress,
  cancelMigrationJob,
  classifyMigration,
} from "./migrations";

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";
const BASE = "https://canvas.mccneb.edu";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
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
    const fetchMock = vi.fn(async () =>
      jsonResponse([
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
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

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
    const fetchMock = vi.fn(async () =>
      jsonResponse([
        { id: 1, workflow_state: "completed", created_at: null },
        { id: 2, workflow_state: "completed", created_at: "2026-01-01T00:00:00Z" },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const rows = await listContentMigrations(COURSE_URL);

    expect(rows.map((r) => r.id)).toEqual([2, 1]);
  });

  it("requests the expected endpoint with a bearer token", async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await listContentMigrations(COURSE_URL);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string | URL, RequestInit | undefined];
    expect(String(url)).toBe(`${BASE}/api/v1/courses/123/content_migrations?per_page=100`);
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-token" });
  });
});

describe("getMigrationProgress (AC2) - SSRF guard", () => {
  it("fetches an on-host progress_url and maps the result", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ id: 501, workflow_state: "running", completion: 40, message: null })
    );
    vi.stubGlobal("fetch", fetchMock);

    const progress = await getMigrationProgress(COURSE_URL, `${BASE}/api/v1/progress/501`);

    expect(progress).toEqual({ id: 501, workflowState: "running", completion: 40, message: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps a missing completion/message to null, not undefined", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 501, workflow_state: "queued" }));
    vi.stubGlobal("fetch", fetchMock);

    const progress = await getMigrationProgress(COURSE_URL, `${BASE}/api/v1/progress/501`);

    expect(progress.completion).toBeNull();
    expect(progress.message).toBeNull();
  });

  it("refuses a foreign-origin progress_url and issues NO fetch", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getMigrationProgress(COURSE_URL, "https://evil.example.com/api/v1/progress/501")
    ).rejects.toThrow("Refusing to follow a progress URL that is not on this Canvas host.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a progress_url on a different port as a different origin", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getMigrationProgress(COURSE_URL, "https://canvas.mccneb.edu:8443/api/v1/progress/501")
    ).rejects.toThrow("Refusing to follow a progress URL that is not on this Canvas host.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("cancelMigrationJob (AC3)", () => {
  function migrationResponse(body: Record<string, unknown>) {
    return jsonResponse(body);
  }

  it("throws naming the workflow_state when the migration has no progress_url", async () => {
    const fetchMock = vi.fn(async () =>
      migrationResponse({ id: 1, workflow_state: "pre_processing" })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(cancelMigrationJob(COURSE_URL, 1)).rejects.toThrow(
      /pre_processing.*no job to cancel and no way to delete the migration/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws 'already finished' when the progress is completed, without POSTing cancel", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/content_migrations/1")) {
        return migrationResponse({
          id: 1,
          workflow_state: "running",
          progress_url: `${BASE}/api/v1/progress/501`,
        });
      }
      if (href.includes("/progress/501")) {
        return jsonResponse({ id: 501, workflow_state: "completed" });
      }
      throw new Error(`unexpected fetch: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(cancelMigrationJob(COURSE_URL, 1)).rejects.toThrow(/already finished/);
    // GET migration + GET progress, but never a third call (the POST cancel).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses a foreign-origin progress_url and issues no progress or cancel fetch", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/content_migrations/1")) {
        return migrationResponse({
          id: 1,
          workflow_state: "running",
          progress_url: "https://evil.example.com/api/v1/progress/501",
        });
      }
      throw new Error(`unexpected fetch: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(cancelMigrationJob(COURSE_URL, 1)).rejects.toThrow(
      "Refusing to follow a progress URL that is not on this Canvas host."
    );
    // Only the trusted GET of the migration itself - never a fetch to the
    // foreign host, for the state check OR the cancel POST.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("POSTs /cancel with a message and returns the resulting progress state", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("/content_migrations/1") && (!init || !init.method)) {
        return migrationResponse({
          id: 1,
          workflow_state: "running",
          progress_url: `${BASE}/api/v1/progress/501`,
        });
      }
      if (href.includes("/progress/501") && (!init || !init.method)) {
        return jsonResponse({ id: 501, workflow_state: "queued" });
      }
      if (href === `${BASE}/api/v1/progress/501/cancel` && init?.method === "POST") {
        expect(init.body).toBe("message=Cancelled+from+the+diagnostics+screen");
        return jsonResponse({ id: 501, workflow_state: "failed" });
      }
      throw new Error(`unexpected fetch: ${href} ${init?.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelMigrationJob(COURSE_URL, 1);

    expect(result).toEqual({ progressState: "failed" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
