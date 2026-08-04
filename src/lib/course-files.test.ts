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

  // AC4 (run 6729e3f5): a bare "Failed to fetch" reached the run log with no
  // inner context at all - neither existing guard (this error-value branch,
  // or downloadCourseZipBlob's fetch() try/catch) fired, which meant
  // createSignedUrl must have THROWN rather than returned an `error` value.
  // There was previously no try/catch around this specific await, so the
  // rejection escaped completely unwrapped.
  it("wraps a createSignedUrl THROW (not a returned error) with the object path and the underlying message", async () => {
    const supabase = fakeSupabase(async () => {
      throw new TypeError("Failed to fetch");
    });
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
  // path, not left as the bare browser wording. maxAttempts:1 isolates this
  // wrapping behavior from the retry loop, covered separately below.
  it("wraps a fetch() rejection with the object path and the underlying message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );

    await expect(
      downloadCourseZipBlob(signedUrlSupabase(), { path: "u1/c1/file.zip" }, { maxAttempts: 1, retryDelayMs: 0 })
    ).rejects.toThrow('Could not download "u1/c1/file.zip" after 1 attempt: Failed to fetch');
  });

  // AC3 (real runs 556b49f0, 6729e3f5, 90415cd8): a network failure WHILE
  // streaming the response body - after res.ok already resolved true, so
  // the earlier fetch() try/catch is not what fires here - throws from
  // res.blob() itself. The browser reports this with the SAME bare
  // "Failed to fetch"/"NetworkError" wording as a connection-establishment
  // failure, so it reads identically in a run log unless this read is
  // ALSO wrapped, which it previously was not. maxAttempts:1 isolates the
  // wrapping from the retry loop, same as the fetch() test above.
  it("wraps a res.blob() rejection (a mid-stream network drop, after res.ok was already true) with the object path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => {
          throw new TypeError("Failed to fetch");
        },
      }))
    );

    await expect(
      downloadCourseZipBlob(signedUrlSupabase(), { path: "u1/c1/file.zip" }, { maxAttempts: 1, retryDelayMs: 0 })
    ).rejects.toThrow('Could not download "u1/c1/file.zip" after 1 attempt: Failed to fetch');
  });

  // SABOTAGE CHECK (confirmed by hand, restoring immediately after): reverting
  // the try/catch around `await res.blob()` back to a bare `pieces.push(await
  // res.blob())` makes the test above fail - the TypeError escapes
  // downloadCourseZipBlob completely unwrapped (the assertion on the
  // "Could not download..." message text fails because the rejection is the
  // bare "Failed to fetch" instead), reproducing the exact unguarded-path
  // defect AC3 asks to close.

  it("wraps an HTTP-level failure (non-ok response) with the object path, status, and attempt count", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));

    await expect(downloadCourseZipBlob(signedUrlSupabase(), { path: "u1/c1/file.zip" })).rejects.toThrow(
      'Could not download "u1/c1/file.zip" (HTTP 404) after 1 attempt.'
    );
  });

  // Mitigation (defect-2, run 756544e0): a bare fetch() rejection at
  // connection-establishment is exactly the transient-network shape a retry
  // of an idempotent GET on an immutable object can safely paper over.
  describe("retry policy", () => {
    it("retries a transient fetch() rejection and succeeds once a later attempt gets a response", async () => {
      const blob = new Blob(["zip-bytes"]);
      const fetchSpy = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce({ ok: true, blob: async () => blob });
      vi.stubGlobal("fetch", fetchSpy);

      const result = await downloadCourseZipBlob(
        signedUrlSupabase(),
        { path: "u1/c1/file.zip" },
        { retryDelayMs: 0 }
      );

      expect(result).toBe(blob);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("retries a 5xx response and succeeds once a later attempt returns ok", async () => {
      const blob = new Blob(["zip-bytes"]);
      const fetchSpy = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({ ok: true, blob: async () => blob });
      vi.stubGlobal("fetch", fetchSpy);

      const result = await downloadCourseZipBlob(
        signedUrlSupabase(),
        { path: "u1/c1/file.zip" },
        { retryDelayMs: 0 }
      );

      expect(result).toBe(blob);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("gives up once the bound is reached and reports the attempt count", async () => {
      const fetchSpy = vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      });
      vi.stubGlobal("fetch", fetchSpy);

      await expect(
        downloadCourseZipBlob(signedUrlSupabase(), { path: "u1/c1/file.zip" }, { maxAttempts: 3, retryDelayMs: 0 })
      ).rejects.toThrow('Could not download "u1/c1/file.zip" after 3 attempts: Failed to fetch');
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    // An HTTP 4xx is a permanent verdict on the request as sent - a 404
    // will never become a 200, so retrying it would only delay an
    // unavoidable failure. Confirms exactly one fetch(), not maxAttempts.
    it("does not retry an HTTP 404 - it is a permanent failure, not a transient one", async () => {
      const fetchSpy = vi.fn(async () => ({ ok: false, status: 404 }));
      vi.stubGlobal("fetch", fetchSpy);

      await expect(
        downloadCourseZipBlob(signedUrlSupabase(), { path: "u1/c1/file.zip" }, { maxAttempts: 3, retryDelayMs: 0 })
      ).rejects.toThrow('Could not download "u1/c1/file.zip" (HTTP 404) after 1 attempt.');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("re-signs the URL on every attempt instead of reusing the one from a failed attempt", async () => {
      let signCalls = 0;
      const supabase = fakeSupabase(async (path) => {
        signCalls += 1;
        return { data: { signedUrl: `https://storage.example/${path}?attempt=${signCalls}` }, error: null };
      });
      const fetchSpy = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["x"]) });
      vi.stubGlobal("fetch", fetchSpy);

      await downloadCourseZipBlob(supabase, { path: "u1/c1/file.zip" }, { retryDelayMs: 0 });

      expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual([
        "https://storage.example/u1/c1/file.zip?attempt=1",
        "https://storage.example/u1/c1/file.zip?attempt=2",
      ]);
    });

    // Instrumentation: when it finally fails, the message must say which
    // part of a multi-part file was being fetched (not just the bare path),
    // so a chunked file's failure is distinguishable from a single-object
    // one at a glance in the run log.
    it("reports which part failed, and out of how many, in a multi-part file", async () => {
      const fetchSpy = vi.fn(async (url: string) => {
        if (url.endsWith("part01")) throw new TypeError("Failed to fetch");
        return { ok: true, blob: async () => new Blob(["A"]) };
      });
      vi.stubGlobal("fetch", fetchSpy);

      await expect(
        downloadCourseZipBlob(
          signedUrlSupabase(),
          {
            path: "u1/c1/file.zip",
            parts: ["u1/c1/file.zip.part00", "u1/c1/file.zip.part01", "u1/c1/file.zip.part02"],
          },
          { maxAttempts: 2, retryDelayMs: 0 }
        )
      ).rejects.toThrow('Could not download "u1/c1/file.zip.part01" (part 2/3) after 2 attempts: Failed to fetch');
    });

    // Instrumentation: the entry's original size (as recorded at upload
    // time - CourseMaterialFile.size flows in structurally, no call site
    // needs to change) rides along in the error when the caller has it, so
    // a future occurrence can be checked against CHUNK_SIZE / the
    // parts-vs-single boundary instead of staying a bare path.
    it("carries the entry's size in the error when the caller supplies it", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new TypeError("Failed to fetch");
        })
      );

      await expect(
        downloadCourseZipBlob(
          signedUrlSupabase(),
          { path: "u1/c1/file.zip", size: 94500000 },
          { maxAttempts: 1, retryDelayMs: 0 }
        )
      ).rejects.toThrow('Could not download "u1/c1/file.zip" [size 94500000 bytes] after 1 attempt: Failed to fetch');
    });
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
