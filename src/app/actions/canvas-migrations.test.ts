import { describe, it, expect, vi, beforeEach } from "vitest";

// Tests for listMigrationProgressAction (src/app/actions/canvas-migrations.ts).
//
// WHY THIS FILE EXISTS AT ALL, given migrations.test.ts already covers the
// lib: the per-URL isolation in this action is the ONE place where a failed
// progress lookup could quietly lose its reason, and the reason is the whole
// product on a diagnostics screen. An earlier draft of this action collapsed
// every failure to a bare `null`, which made the SSRF guard's refusal
// (getMigrationProgress rejecting a progress_url on a foreign host) render
// identically to an ordinary 404. The lib tests cannot catch that - the lib
// throws correctly in both cases; the information is lost one layer up, here.
//
// requireOwner is mocked so no Supabase session is needed. getMigrationProgress
// is mocked because this file is testing the ISOLATION AND REPORTING around it,
// not its network behaviour (migrations.test.ts owns that, including the origin
// guard itself).
vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn() }));
vi.mock("@/lib/canvas-modules", () => ({
  listContentMigrations: vi.fn(),
  getMigrationProgress: vi.fn(),
  cancelMigrationJob: vi.fn(),
}));

import { listMigrationProgressAction } from "./canvas-migrations";
import { getMigrationProgress } from "@/lib/canvas-modules";

const mockedGetProgress = vi.mocked(getMigrationProgress);

const COURSE = "https://canvas.example.edu/courses/42";
const OK_URL = "https://canvas.example.edu/api/v1/progress/1";
const FOREIGN_URL = "https://evil.example.com/api/v1/progress/2";
const GONE_URL = "https://canvas.example.edu/api/v1/progress/3";

const SSRF_MESSAGE = "Refusing to follow a progress URL that is not on this Canvas host.";
const NOT_FOUND_MESSAGE = "Canvas could not find that resource.";

function progressFor(id: number, state: string) {
  return { id, workflowState: state, completion: null, message: null };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listMigrationProgressAction", () => {
  it("resolves every URL in one call and keys results by their own URL", async () => {
    mockedGetProgress.mockImplementation(async (_course: string, url: string) =>
      progressFor(url === OK_URL ? 1 : 3, url === OK_URL ? "queued" : "running")
    );

    const result = await listMigrationProgressAction(COURSE, [OK_URL, GONE_URL]);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.progress[OK_URL]).toEqual(progressFor(1, "queued"));
    expect(result.progress[GONE_URL]).toEqual(progressFor(3, "running"));
    expect(result.progressErrors).toEqual({});
    expect(mockedGetProgress).toHaveBeenCalledTimes(2);
  });

  it("isolates one failing URL instead of failing the whole call", async () => {
    mockedGetProgress.mockImplementation(async (_course: string, url: string) => {
      if (url === GONE_URL) throw new Error(NOT_FOUND_MESSAGE);
      return progressFor(1, "queued");
    });

    const result = await listMigrationProgressAction(COURSE, [OK_URL, GONE_URL]);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    // The healthy lookup still resolved - one bad URL must not blank the page.
    expect(result.progress[OK_URL]).toEqual(progressFor(1, "queued"));
    expect(result.progress[GONE_URL]).toBeNull();
  });

  it("reports WHY a lookup failed, keyed by the same URL", async () => {
    mockedGetProgress.mockImplementation(async (_course: string, url: string) => {
      if (url === GONE_URL) throw new Error(NOT_FOUND_MESSAGE);
      return progressFor(1, "queued");
    });

    const result = await listMigrationProgressAction(COURSE, [OK_URL, GONE_URL]);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.progressErrors[GONE_URL]).toBe(NOT_FOUND_MESSAGE);
    // A URL that succeeded carries no reason at all, so the UI can tell the
    // two apart without inspecting `progress` as well.
    expect(result.progressErrors[OK_URL]).toBeUndefined();
  });

  it("keeps the SSRF refusal distinguishable from an ordinary lookup failure", async () => {
    // The regression this whole file exists for: both URLs fail, and both
    // would be a bare `null` under the collapsed-to-null design. Only the
    // reason separates a foreign-origin progress_url - a genuine finding -
    // from a migration whose job is simply gone.
    mockedGetProgress.mockImplementation(async (_course: string, url: string) => {
      throw new Error(url === FOREIGN_URL ? SSRF_MESSAGE : NOT_FOUND_MESSAGE);
    });

    const result = await listMigrationProgressAction(COURSE, [FOREIGN_URL, GONE_URL]);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.progress[FOREIGN_URL]).toBeNull();
    expect(result.progress[GONE_URL]).toBeNull();
    expect(result.progressErrors[FOREIGN_URL]).toBe(SSRF_MESSAGE);
    expect(result.progressErrors[GONE_URL]).toBe(NOT_FOUND_MESSAGE);
    expect(result.progressErrors[FOREIGN_URL]).not.toBe(result.progressErrors[GONE_URL]);
  });

  it("falls back to a readable reason when the thrown value is not an Error", async () => {
    mockedGetProgress.mockImplementation(async () => {
      throw "a bare string";
    });

    const result = await listMigrationProgressAction(COURSE, [OK_URL]);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.progressErrors[OK_URL]).toBe("Could not read this job's progress.");
  });

  it("returns empty maps for an empty URL list without calling Canvas", async () => {
    const result = await listMigrationProgressAction(COURSE, []);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.progress).toEqual({});
    expect(result.progressErrors).toEqual({});
    expect(mockedGetProgress).not.toHaveBeenCalled();
  });
});
