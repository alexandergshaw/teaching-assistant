import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GithubHttpError, asGithubHttpError, EMPTY_GITHUB_HEADERS } from "./github-http-error";
import { ghFetch } from "./github.repos";

global.fetch = vi.fn();
const mockFetch = fetch as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GithubHttpError", () => {
  it("is still an Error, which is what keeps every existing ghFetch caller working", () => {
    const err = new GithubHttpError("boom", 500, EMPTY_GITHUB_HEADERS);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("boom");
  });

  it("carries the status and exposes the headers through the reader", () => {
    const err = new GithubHttpError("boom", 403, new Headers({ "x-ratelimit-remaining": "0" }));
    expect(err.status).toBe(403);
    expect(err.headers.get("x-ratelimit-remaining")).toBe("0");
  });

  it("a real Headers instance satisfies GithubHeaderReader structurally - no adapter needed", () => {
    // This is the property that lets github-rate-limit.ts consume the headers
    // without either module importing the other, and without a DOM lib
    // dependency. If Headers ever stopped satisfying the interface this would
    // be a compile error, but assert the runtime contract too.
    const headers: { get(name: string): string | null } = new Headers({ a: "1" });
    expect(headers.get("a")).toBe("1");
    expect(headers.get("absent")).toBeNull();
  });
});

describe("EMPTY_GITHUB_HEADERS", () => {
  it("returns null for every lookup, so a headerless failure degrades instead of throwing", () => {
    expect(EMPTY_GITHUB_HEADERS.get("x-ratelimit-remaining")).toBeNull();
    expect(EMPTY_GITHUB_HEADERS.get("anything-at-all")).toBeNull();
  });
});

describe("asGithubHttpError", () => {
  it("narrows a GithubHttpError to itself", () => {
    const err = new GithubHttpError("boom", 404, EMPTY_GITHUB_HEADERS);
    expect(asGithubHttpError(err)).toBe(err);
  });

  it("returns null for a plain Error - the case the message-parsing fallback exists for", () => {
    expect(asGithubHttpError(new Error("GitHub forbidden (403)"))).toBeNull();
  });

  it("returns null for non-Error throws rather than crashing on them", () => {
    expect(asGithubHttpError("a thrown string")).toBeNull();
    expect(asGithubHttpError(null)).toBeNull();
    expect(asGithubHttpError(undefined)).toBeNull();
    expect(asGithubHttpError({ status: 403 })).toBeNull();
  });
});

// ── The wiring: ghFetch actually throws the structured error ────────────────
//
// The helper above being correct proves nothing about the live path. These
// tests drive ghFetch itself, because the whole point of the change is that
// the Response's headers survive the throw site.

describe("ghFetch's thrown error", () => {
  it("throws a GithubHttpError carrying the real status and the real response headers", async () => {
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1700000600" },
      })
    );

    const err = await ghFetch("/repos/o/r").then(
      () => null,
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(GithubHttpError);
    const structured = asGithubHttpError(err)!;
    expect(structured.status).toBe(403);
    expect(structured.headers.get("x-ratelimit-remaining")).toBe("0");
    expect(structured.headers.get("x-ratelimit-reset")).toBe("1700000600");
  });

  it("keeps ghError's message BYTE-IDENTICAL, which is what makes the new class backward compatible", async () => {
    // Every one of the ~90 ghFetch/ghJson references across the github.*.ts
    // modules reads only err.message. Pinning the exact string here is the
    // guard that this change did not quietly reword any of them. The fixture
    // is ghError's 403-with-a-GitHub-message branch (github.repos.ts:20).
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "API rate limit exceeded" }), { status: 403 })
    );

    const err = await ghFetch("/repos/o/r").then(
      () => null,
      (e: unknown) => e
    );

    expect((err as Error).message).toBe("GitHub forbidden (403): API rate limit exceeded");
  });

  it("reading the body for the message does not detach the headers", async () => {
    // ghError parses the response body to extract GitHub's own message, which
    // consumes the stream. The headers must still be readable afterwards -
    // this asserts that ordering hazard directly rather than assuming it.
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Validation failed" }), {
        status: 422,
        headers: { "x-ratelimit-remaining": "4999" },
      })
    );

    const err = await ghFetch("/repos/o/r").then(
      () => null,
      (e: unknown) => e
    );

    expect((err as Error).message).toBe("GitHub rejected the request (422): Validation failed.");
    expect(asGithubHttpError(err)!.headers.get("x-ratelimit-remaining")).toBe("4999");
  });

  it("does not throw at all on an ok response", async () => {
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(ghFetch("/repos/o/r")).resolves.toBeInstanceOf(Response);
  });
});
