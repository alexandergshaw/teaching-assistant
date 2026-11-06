import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listOrgRepos } from "@/lib/github.repos";
import { createDiscoveryTransport } from "./discovery-transport";

const endpoint = "/orgs/classroom/repos";
const api = "https://api.github.com";
const successLimit = 8 * 1024 * 1024;
const errorLimit = 16 * 1024;
const identity = (value: unknown) => value;

let transport: ReturnType<typeof createDiscoveryTransport>;
let deadline: AbortController;

beforeEach(() => {
  vi.stubEnv("GITHUB_TOKEN", "token-for-test");
  deadline = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  transport = createDiscoveryTransport();
});

afterEach(() => {
  transport.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function heldBody(status: number, firstChunk?: Uint8Array) {
  const reading = Promise.withResolvers<void>();
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      controller = stream;
      if (firstChunk) stream.enqueue(firstChunk);
    },
    pull() { reading.resolve(); },
    cancel,
  }, { highWaterMark: 0 });
  return {
    response: new Response(body, { status }), reading: reading.promise, cancel,
    finish(body: string) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  };
}

describe("discovery-only GitHub transport", () => {
  it.each([
    [301, "https://api.github.com/repos/new-owner/new-repo"],
    [302, "https://redirect.invalid/?private=value"],
    [304, null],
    [307, "//redirect.invalid"],
    [308, "/repos/new-owner/new-repo"],
  ])("rejects HTTP %s redirects at the original request", async (status, location) => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const fetcher = vi.fn(async () => new Response(status === 304 ? null : new ReadableStream({ cancel }), {
      status, headers: location ? { Location: location } : {},
    }));
    vi.stubGlobal("fetch", fetcher);
    await expect(transport.getJson(endpoint, identity)).rejects.toMatchObject({
      reason: "redirect-rejected", message: "redirect-rejected",
    });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`${api}${endpoint}`, {
      method: "GET", redirect: "manual", cache: "no-store", signal: expect.any(AbortSignal),
      headers: {
        Authorization: "Bearer token-for-test", Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (status !== 304) expect(cancel).toHaveBeenCalledOnce();
  });

  it("preserves redirect defaults and response handling for a legacy org-list caller", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([{ name: "project", owner: { login: "classroom" } }]));
    vi.stubGlobal("fetch", fetcher);
    await expect(listOrgRepos("classroom")).resolves.toMatchObject([{ fullName: "classroom/project", defaultBranch: "main" }]);
    const [, init] = fetcher.mock.calls[0];
    expect(init?.redirect).toBeUndefined();
    expect(init?.headers).toMatchObject({ Authorization: "Bearer token-for-test" });
  });

  it("rejects a path that resolves to another origin before calling fetch", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(transport.getJson("//redirect.invalid/repos", identity)).rejects.toMatchObject({ reason: "unavailable" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("latches zero quota on a successful response before that response body finishes", async () => {
    const held = heldBody(200);
    held.response.headers.set("x-ratelimit-remaining", "0");
    const fetcher = vi.fn(async () => held.response);
    vi.stubGlobal("fetch", fetcher);
    const initial = transport.getJson(endpoint, identity);
    await held.reading;
    await expect(transport.getJson(endpoint, identity)).rejects.toMatchObject({ reason: "rate-limited" });
    expect(fetcher).toHaveBeenCalledOnce();
    held.finish("[]");
    await expect(initial).resolves.toEqual([]);
  });

  it.each([
    ["Resource not accessible", "access-denied", 3],
    ["You exceeded a secondary rate limit", "rate-limited", 2],
  ])("keeps each in-flight 403 fence until its own classification (%s)", async (message, reason, total) => {
    const first = heldBody(403);
    const second = heldBody(403);
    const fetcher = vi.fn(async () => Response.json([]))
      .mockResolvedValueOnce(first.response).mockResolvedValueOnce(second.response);
    vi.stubGlobal("fetch", fetcher);
    const firstOutcome = transport.getJson(endpoint, identity).catch((error: unknown) => error);
    const secondOutcome = transport.getJson(endpoint, identity).catch((error: unknown) => error);
    await Promise.all([first.reading, second.reading]);

    const waiting = transport.getJson(endpoint, identity).catch((error: unknown) => error);
    first.finish(JSON.stringify({ message: "Resource not accessible" }));
    await expect(firstOutcome).resolves.toMatchObject({ reason: "access-denied" });
    expect(fetcher).toHaveBeenCalledTimes(2);

    second.finish(JSON.stringify({ message }));
    await expect(secondOutcome).resolves.toMatchObject({ reason });
    if (reason === "rate-limited") {
      await expect(waiting).resolves.toMatchObject({ reason });
      await expect(transport.getJson(endpoint, identity)).rejects.toMatchObject({ reason });
    } else {
      await expect(waiting).resolves.toEqual([]);
    }
    expect(fetcher).toHaveBeenCalledTimes(total);
  });

  it.each([
    ["missing", () => null],
    ["invalid JSON", () => "{bad:"],
    ["invalid UTF-8 inside valid JSON", () => new Uint8Array([123, 34, 109, 101, 115, 115, 97, 103, 101, 34, 58, 34, 0xff, 34, 125])],
    ["missing message", () => "{}"],
    ["too large", () => new Uint8Array(errorLimit + 1)],
    ["stream error", () => new ReadableStream({ start: (stream) => stream.error(new Error("private response text")) })],
  ])("stops on an ambiguous 403 with a %s body", async (_label, makeBody) => {
    const fetcher = vi.fn(async () => new Response(makeBody(), { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    for (const path of [endpoint, "/repos/classroom/lab/commits/main"] as const) {
      await expect(transport.getJson(path, identity)).rejects.toMatchObject({ reason: "throttle-unconfirmed", message: "throttle-unconfirmed" });
    }
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([200, 403])("settles a stalled HTTP %s reader and its waiters at the deadline despite a stuck cancel", async (status) => {
    const held = heldBody(status);
    const fetcher = vi.fn(async () => held.response);
    vi.stubGlobal("fetch", fetcher);
    const outcome = transport.getJson(endpoint, identity).catch((error: unknown) => error);
    await held.reading;
    const waiting = status === 403 ? transport.getJson(endpoint, identity).catch((error: unknown) => error) : undefined;
    deadline.abort();
    const reason = status === 403 ? "throttle-unconfirmed" : "deadline-exceeded";
    await expect(outcome).resolves.toMatchObject({ reason });
    if (waiting) await expect(waiting).resolves.toMatchObject({ reason });
    await expect(transport.getJson(endpoint, identity)).rejects.toMatchObject({ reason });
    expect(AbortSignal.timeout).toHaveBeenCalledExactlyOnceWith(40_000);
    expect(held.cancel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("settles stalled fetches and cancels late responses even if fetch ignores abort", async () => {
    const late = Promise.withResolvers<Response>();
    const held = heldBody(200);
    vi.stubGlobal("fetch", vi.fn(() => late.promise));
    const outcome = transport.getJson(endpoint, identity).catch((error: unknown) => error);
    deadline.abort();
    await expect(outcome).resolves.toMatchObject({ reason: "deadline-exceeded" });
    late.resolve(held.response);
    await vi.waitFor(() => expect(held.cancel).toHaveBeenCalledOnce());
  });

  it.each([200, 500])("rejects an oversized streamed HTTP %s response despite a small content-length", async (status) => {
    const limit = status === 200 ? successLimit : errorLimit;
    const held = heldBody(status, new Uint8Array(limit + 1));
    held.response.headers.set("content-length", "1");
    const fetcher = vi.fn(async () => held.response);
    vi.stubGlobal("fetch", fetcher);
    await expect(transport.getJson(endpoint, identity)).rejects.toMatchObject({ reason: "response-too-large" });
    expect(held.cancel).toHaveBeenCalledOnce();
  });

  it("charges bytes rejected by a per-response limit against the shared aggregate", async () => {
    const oversized = new Uint8Array(successLimit + 1);
    const fetcher = vi.fn(async () => new Response(oversized));
    vi.stubGlobal("fetch", fetcher);
    for (let i = 0; i < 3; i += 1) {
      await expect(transport.getJson(endpoint, identity)).rejects.toMatchObject({ reason: "response-too-large" });
    }
    await expect(transport.getJson(endpoint, identity)).rejects.toMatchObject({ reason: "body-budget-exhausted" });
    await expect(transport.getJson(endpoint, identity)).rejects.toMatchObject({ reason: "body-budget-exhausted" });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("charges concurrent response chunks before completion and aborts all readers when error bytes overflow the aggregate", async () => {
    const chunk = new Uint8Array(successLimit);
    const stalled = Array.from({ length: 4 }, () => heldBody(200, chunk));
    const fetcher = vi.fn(async () => new Response(new Uint8Array(errorLimit), { status: 500 }));
    for (const held of stalled) fetcher.mockResolvedValueOnce(held.response);
    vi.stubGlobal("fetch", fetcher);
    const readers = stalled.map(() => transport.getJson(endpoint, identity).catch((error: unknown) => error));
    await Promise.all(stalled.map((held) => held.reading));
    await expect(transport.getJson(endpoint, identity)).rejects.toMatchObject({ reason: "body-budget-exhausted" });
    for (const reader of readers) await expect(reader).resolves.toMatchObject({ reason: "body-budget-exhausted" });
    for (const held of stalled) expect(held.cancel).toHaveBeenCalledOnce();
    await expect(transport.getJson(endpoint, identity)).rejects.toMatchObject({ reason: "body-budget-exhausted" });
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it.each(["parse", "schema"])("discards success when synchronous %s work crosses the deadline", async (phase) => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    transport.dispose();
    transport = createDiscoveryTransport();
    const response = new Response('{"marker":"test payload"}');
    vi.stubGlobal("fetch", vi.fn(async () => response));
    const validate = vi.fn((value: unknown) => {
      if (phase === "schema") now.mockReturnValue(40_000);
      return value;
    });
    if (phase === "parse") {
      const parse = JSON.parse;
      vi.spyOn(JSON, "parse").mockImplementation((text) => {
        if (text === '{"marker":"test payload"}') now.mockReturnValue(40_000);
        return parse(text);
      });
    }
    await expect(transport.getJson(endpoint, validate)).rejects.toMatchObject({ reason: "deadline-exceeded" });
    expect(validate).toHaveBeenCalledTimes(phase === "parse" ? 0 : 1);
  });

  it.each([new Uint8Array([34, 0xc0, 0xaf, 34]), '{"private":1'])("rejects invalid success JSON with a fixed failure", async (body) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
    await expect(transport.getJson(endpoint, identity)).rejects.toMatchObject({ reason: "unavailable", message: "unavailable" });
  });
});
