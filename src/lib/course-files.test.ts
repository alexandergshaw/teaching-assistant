// Regression coverage for getCourseZipUrl/downloadCourseZipBlob's error
// wrapping (defect-1 write-up, AC1/AC2): a real Course Build run (556b49f0)
// failed with the bare message "Failed to fetch" - a raw fetch()/supabase-js
// rejection with no indication of WHAT it was trying to fetch. These two
// functions are the actual network boundary the failure came from (see
// step-helpers-server.test.ts / WorkflowsTab.tsx's loadCourseExportData for
// the higher layer that adds the course-tile/export-file-name context on
// top of what this file names - the object path).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCourseZipUrl, downloadCourseZipBlob } from "./course-files";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

function fakeSupabase(createSignedUrl: (path: string) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>) {
  return {
    storage: {
      from: () => ({ createSignedUrl }),
    },
  } as unknown as SupabaseClient<Database>;
}

describe("getCourseZipUrl", () => {
  it("returns the signed URL on success", async () => {
    const supabase = fakeSupabase(async () => ({ data: { signedUrl: "https://storage.example/signed" }, error: null }));
    await expect(getCourseZipUrl(supabase, "u1/c1/file.zip")).resolves.toBe("https://storage.example/signed");
  });

  // AC1/AC2: supabase-js does not throw on a network failure inside
  // createSignedUrl - it catches it internally and returns it as a normal
  // `error` value, whose `message` can be as bare as the browser's own
  // "Failed to fetch". This must not reach the caller unchanged.
  it("wraps a createSignedUrl error with the object path and the underlying message", async () => {
    const supabase = fakeSupabase(async () => ({ data: null, error: { message: "Failed to fetch" } }));
    await expect(getCourseZipUrl(supabase, "u1/c1/file.zip")).rejects.toThrow(
      'Could not get a download link for "u1/c1/file.zip": Failed to fetch'
    );
  });
});

describe("downloadCourseZipBlob", () => {
  const signedUrlSupabase = () =>
    fakeSupabase(async (path) => ({ data: { signedUrl: `https://storage.example/${path}` }, error: null }));

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads a single-object file (no parts) as one blob", async () => {
    const blob = new Blob(["zip-bytes"]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => blob })));

    const result = await downloadCourseZipBlob(signedUrlSupabase(), { path: "u1/c1/file.zip" });
    expect(result).toBe(blob);
  });

  it("reassembles a multi-part file, in part order, into one blob", async () => {
    const fetchSpy = vi.fn(async (url: string) => ({
      ok: true,
      blob: async () => new Blob([url.endsWith("part00") ? "AAA" : "BBB"]),
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await downloadCourseZipBlob(signedUrlSupabase(), {
      path: "u1/c1/file.zip",
      parts: ["u1/c1/file.zip.part00", "u1/c1/file.zip.part01"],
    });

    // Fetched in the SAME order the parts array lists them - reassembly
    // would silently corrupt the zip if this ever reordered them.
    expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual([
      "https://storage.example/u1/c1/file.zip.part00",
      "https://storage.example/u1/c1/file.zip.part01",
    ]);
    const text = await result.text();
    expect(text).toBe("AAABBB");
  });

  // AC1/AC2: the exact category of failure the real run hit - fetch()
  // itself rejecting (a TypeError, "Failed to fetch" in Chrome/Firefox)
  // before any HTTP response exists at all. Must be wrapped with the object
  // path, not left as the bare browser wording.
  it("wraps a fetch() rejection with the object path and the underlying message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );

    await expect(downloadCourseZipBlob(signedUrlSupabase(), { path: "u1/c1/file.zip" })).rejects.toThrow(
      'Could not download "u1/c1/file.zip": Failed to fetch'
    );
  });

  it("wraps an HTTP-level failure (non-ok response) with the object path and status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));

    await expect(downloadCourseZipBlob(signedUrlSupabase(), { path: "u1/c1/file.zip" })).rejects.toThrow(
      'Could not download "u1/c1/file.zip" (HTTP 404).'
    );
  });

  it("wraps a createSignedUrl failure encountered mid-reassembly, naming the failing part specifically", async () => {
    const supabase = fakeSupabase(async (path) =>
      path.endsWith("part01")
        ? { data: null, error: { message: "Failed to fetch" } }
        : { data: { signedUrl: `https://storage.example/${path}` }, error: null }
    );
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["A"]) })));

    await expect(
      downloadCourseZipBlob(supabase, { path: "u1/c1/file.zip", parts: ["u1/c1/file.zip.part00", "u1/c1/file.zip.part01"] })
    ).rejects.toThrow('Could not get a download link for "u1/c1/file.zip.part01": Failed to fetch');
  });

  it("falls back to the bare path when `parts` is present but empty", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, blob: async () => new Blob(["x"]) }));
    vi.stubGlobal("fetch", fetchSpy);

    await downloadCourseZipBlob(signedUrlSupabase(), { path: "u1/c1/file.zip", parts: [] });
    expect(fetchSpy).toHaveBeenCalledWith("https://storage.example/u1/c1/file.zip");
  });
});
