import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { LookupFunction } from "node:net";

/**
 * Tests for the outbound fetch boundary (docs/lms-credentials-acceptance-
 * criteria.md, E-SSRF1/E-SSRF2, SEC1, SEC2, SEC9, E-CRIT1, E-UX3, E-UX4).
 *
 * `node:dns` and `node:https` are mocked below - this suite never opens a
 * real socket or resolves a real name, per this repo's test hermeticity
 * rule. `node:dns`'s `promises.lookup` and `node:https`'s `request` are the
 * only two functions `canvas-fetch.ts` calls out to the platform through,
 * so mocking exactly those two lets every test drive a REAL code path
 * (validation -> resolve -> classify -> dial -> read) with a controlled
 * network answer, rather than comparing this module's output to itself.
 */

vi.mock("node:dns", () => ({
  promises: { lookup: vi.fn() },
}));
vi.mock("node:https", () => ({
  request: vi.fn(),
}));

import { promises as dnsPromises } from "node:dns";
import type { LookupAddress } from "node:dns";
import * as https from "node:https";
import { canvasFetch, MAX_REDIRECT_HOPS, MAX_RESPONSE_BYTES } from "./canvas-fetch";

/**
 * `dns.promises.lookup` is overloaded (a single-address form and an
 * `{ all: true }` form returning an array); `vi.mocked()` collapses that to
 * one arbitrary overload, which is not the one this suite needs. This
 * narrow local type names only the subset of the vitest mock API actually
 * used below, against the ARRAY-returning overload this module always
 * calls, so every `mockResolvedValue`/`mockRejectedValue` call is checked
 * against the real shape `canvas-fetch.ts` consumes rather than silently
 * widened to `any`.
 */
interface LookupAllMock {
  mockResolvedValue(value: LookupAddress[]): void;
  mockRejectedValue(value: unknown): void;
  mockReset(): void;
}

const lookupMock = dnsPromises.lookup as unknown as LookupAllMock;
const requestMock = vi.mocked(https.request);

/** Minimal stand-in for Node's `ClientRequest` - an EventEmitter with the two methods `canvas-fetch.ts` calls. */
class FakeClientRequest extends EventEmitter {
  ended = false;
  destroyed = false;
  end(): void {
    this.ended = true;
  }
  destroy(): void {
    this.destroyed = true;
  }
}

/** Minimal stand-in for Node's `IncomingMessage` - an EventEmitter with `statusCode`/`headers`. */
class FakeIncomingMessage extends EventEmitter {
  destroyed = false;
  constructor(
    public statusCode: number,
    public headers: Record<string, string> = {}
  ) {
    super();
  }
  destroy(): void {
    this.destroyed = true;
  }
}

/** Flushes pending microtasks (promise chains) without advancing any timer. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

const credential = { token: "1234~abcdefghij" };

beforeEach(() => {
  lookupMock.mockReset();
  requestMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("canvasFetch - the SSRF boundary (steps 1-2)", () => {
  it("refuses a loopback host before ever touching DNS or the socket", async () => {
    const result = await canvasFetch("https://127.0.0.1/api/v1/users/self", {}, credential);
    expect(result).toEqual({
      ok: false,
      kind: "host-not-allowed",
      reason: expect.any(String),
    });
    expect(lookupMock).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("validates the RAW origin, not a URL with a path substituted for the origin check", async () => {
    // A path/query on the actual request URL must not itself be refused -
    // only the origin's shape is checked (SEC12: validate the raw origin,
    // not a normalized or path-bearing form).
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    let captured: https.RequestOptions | undefined;
    requestMock.mockImplementation((options, callback) => {
      captured = options as https.RequestOptions;
      const req = new FakeClientRequest();
      queueMicrotask(() => {
        const res = new FakeIncomingMessage(200, { "content-type": "application/json" });
        (callback as (res: unknown) => void)(res);
        res.emit("data", Buffer.from("{}"));
        res.emit("end");
      });
      return req as unknown as ReturnType<typeof https.request>;
    });

    const result = await canvasFetch(
      "https://canvas.example.edu/api/v1/users/self?x=1",
      {},
      credential
    );

    expect(result.ok).toBe(true);
    expect(captured?.path).toBe("/api/v1/users/self?x=1");
  });

  it("refuses the whole answer when ANY resolved address is special-purpose, even if others are public", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 }, // public
      { address: "127.0.0.1", family: 4 }, // private - poisons the whole answer
    ]);

    const result = await canvasFetch("https://canvas.example.edu/api/v1/users/self", {}, credential);

    expect(result).toEqual({
      ok: false,
      kind: "host-not-allowed",
      reason: expect.any(String),
    });
    // The point of SEC1 is that a mixed answer is never partially trusted -
    // this module must never have dialled anything.
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("refuses when DNS resolves to nothing at all", async () => {
    lookupMock.mockResolvedValue([]);
    // A short timeoutMs here only to keep the real-timer padding this
    // outcome deliberately incurs (SEC9/E-UX4, exercised precisely with
    // fake timers further below) from making this particular test slow.
    const result = await canvasFetch(
      "https://canvas.example.edu/api/v1/users/self",
      { timeoutMs: 20 },
      credential
    );
    expect(result).toEqual({
      ok: false,
      kind: "unreachable",
      failure: { phase: "dns", code: "ENODATA", host: "canvas.example.edu", failedAfterMs: expect.any(Number) },
    });
  });
});

describe("canvasFetch - address pinning (step 3): the address checked is the address dialled", () => {
  it("passes a lookup function that ignores the hostname argument and always answers with the vetted address", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    requestMock.mockImplementation(() => {
      // Never resolve the response in this test - only the captured
      // `lookup` option is inspected.
      return new FakeClientRequest() as unknown as ReturnType<typeof https.request>;
    });

    void canvasFetch("https://canvas.example.edu/api/v1/users/self", {}, credential);
    await flushMicrotasks();

    expect(requestMock).toHaveBeenCalledTimes(1);
    const options = requestMock.mock.calls[0][0] as https.RequestOptions;
    const lookup = options.lookup as LookupFunction;
    expect(typeof lookup).toBe("function");

    // This is the concrete proof pinning "pins": call the captured lookup
    // with an ARBITRARY, attacker-shaped hostname - if pinning worked, the
    // callback still receives the address this module already vetted, not
    // a re-resolution of the hostname the caller passed in. What this
    // CANNOT prove: that Node's real socket-connect internals actually
    // honor the `lookup` option end to end - that is Node's own documented
    // contract (verified separately against @types/node and the Node docs,
    // not exercised by any unit test here), and that a genuine TCP
    // handshake occurs against that address, which would require a real
    // network call this suite deliberately does not make.
    const answer = await new Promise<[unknown, string, number]>((resolve) => {
      lookup("attacker-controlled-name.invalid", { family: 0 }, (err, address, family) => {
        resolve([err, address as string, family as number]);
      });
    });
    expect(answer).toEqual([null, "93.184.216.34", 4]);

    // Also verify SNI and the Host header still name the REAL hostname -
    // pinning the connection to a bare address must not blank out which
    // certificate/virtual host is expected.
    expect(options.servername).toBe("canvas.example.edu");
    expect((options.headers as Record<string, string>).Host).toBe("canvas.example.edu");
  });

  it("pins an IPv6 answer's family through to the lookup callback", async () => {
    lookupMock.mockResolvedValue([
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
    requestMock.mockImplementation(() => new FakeClientRequest() as unknown as ReturnType<typeof https.request>);

    void canvasFetch("https://canvas.example.edu/api/v1/users/self", {}, credential);
    await flushMicrotasks();

    const options = requestMock.mock.calls[0][0] as https.RequestOptions;
    const lookup = options.lookup as LookupFunction;
    const answer = await new Promise<[unknown, string, number]>((resolve) => {
      lookup("irrelevant", {}, (err, address, family) => resolve([err, address as string, family as number]));
    });
    expect(answer).toEqual([null, "2606:2800:220:1:248:1893:25c8:1946", 6]);
  });
});

describe("canvasFetch - completed exchanges are handed back raw (E-UX3: not collapsed here)", () => {
  function respondWith(status: number, body: string, headers: Record<string, string> = {}) {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    requestMock.mockImplementation((_options, callback) => {
      const req = new FakeClientRequest();
      queueMicrotask(() => {
        const res = new FakeIncomingMessage(status, headers);
        (callback as (res: unknown) => void)(res);
        res.emit("data", Buffer.from(body));
        res.emit("end");
      });
      return req as unknown as ReturnType<typeof https.request>;
    });
  }

  it("hands back a 401 (token rejected) without deciding that it was rejected", async () => {
    respondWith(401, JSON.stringify({ errors: [{ message: "Invalid access token." }] }), {
      "content-type": "application/json",
    });
    const result = await canvasFetch("https://canvas.example.edu/api/v1/users/self", {}, credential);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(401);
      expect(result.body.toString("utf-8")).toContain("Invalid access token");
    }
  });

  it("hands back a 200 HTML page (the marketing-site outcome) without deciding it is not Canvas", async () => {
    respondWith(200, "<html><body>Welcome to State College</body></html>", {
      "content-type": "text/html",
    });
    const result = await canvasFetch("https://canvas.example.edu/api/v1/users/self", {}, credential);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(200);
      expect(result.headers["content-type"]).toBe("text/html");
    }
  });

  it("hands back a genuine 200 Canvas JSON response", async () => {
    respondWith(200, JSON.stringify({ id: 42, name: "Ada Lovelace" }), {
      "content-type": "application/json; charset=utf-8",
    });
    const result = await canvasFetch("https://canvas.example.edu/api/v1/users/self", {}, credential);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.parse(result.body.toString("utf-8"))).toEqual({ id: 42, name: "Ada Lovelace" });
    }
  });
});

describe("canvasFetch - redirects (step 4)", () => {
  it("follows a same-origin redirect and re-validates it before dialling", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    let call = 0;
    requestMock.mockImplementation((options, callback) => {
      call += 1;
      const req = new FakeClientRequest();
      queueMicrotask(() => {
        if (call === 1) {
          const res = new FakeIncomingMessage(302, { location: "/api/v1/users/self/redirected" });
          (callback as (res: unknown) => void)(res);
          res.emit("end");
        } else {
          const path = (options as https.RequestOptions).path;
          const res = new FakeIncomingMessage(200, { "content-type": "application/json" });
          (callback as (res: unknown) => void)(res);
          res.emit("data", Buffer.from(JSON.stringify({ path })));
          res.emit("end");
        }
      });
      return req as unknown as ReturnType<typeof https.request>;
    });

    const result = await canvasFetch("https://canvas.example.edu/api/v1/users/self", {}, credential);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.parse(result.body.toString("utf-8"))).toEqual({
        path: "/api/v1/users/self/redirected",
      });
    }
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(lookupMock).toHaveBeenCalledTimes(2); // re-resolved and re-classified on the second hop too
  });

  it("refuses a cross-origin redirect rather than following it with the credential attached", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    requestMock.mockImplementation((_options, callback) => {
      const req = new FakeClientRequest();
      queueMicrotask(() => {
        const res = new FakeIncomingMessage(302, {
          location: "https://attacker.example.com/steal",
        });
        (callback as (res: unknown) => void)(res);
        res.emit("end");
      });
      return req as unknown as ReturnType<typeof https.request>;
    });

    const result = await canvasFetch("https://canvas.example.edu/api/v1/users/self", {}, credential);
    expect(result).toEqual({
      ok: false,
      kind: "host-not-allowed",
      reason: expect.any(String),
    });
    // Only the first, same-origin hop was ever dialled - the redirect
    // target never received a request, so it never received the token.
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("stops following after the hop cap and hands back the last redirect response as-is", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    requestMock.mockImplementation((_options, callback) => {
      const req = new FakeClientRequest();
      queueMicrotask(() => {
        const res = new FakeIncomingMessage(302, {
          location: "https://canvas.example.edu/next",
        });
        (callback as (res: unknown) => void)(res);
        res.emit("end");
      });
      return req as unknown as ReturnType<typeof https.request>;
    });

    const result = await canvasFetch("https://canvas.example.edu/start", {}, credential);
    // One initial dial plus MAX_REDIRECT_HOPS follows = MAX_REDIRECT_HOPS + 1 dials.
    expect(requestMock).toHaveBeenCalledTimes(MAX_REDIRECT_HOPS + 1);
    expect(result).toEqual({ ok: true, status: 302, headers: expect.any(Object), body: expect.any(Buffer) });
  });
});

describe("canvasFetch - the byte cap (step 5)", () => {
  it("aborts and reports unreachable once the response exceeds the byte cap, before it is ever parsed", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    let destroyedReq: FakeClientRequest | undefined;
    requestMock.mockImplementation((_options, callback) => {
      const req = new FakeClientRequest();
      destroyedReq = req;
      queueMicrotask(() => {
        const res = new FakeIncomingMessage(200, { "content-type": "application/json" });
        (callback as (res: unknown) => void)(res);
        res.emit("data", Buffer.alloc(MAX_RESPONSE_BYTES + 1));
      });
      return req as unknown as ReturnType<typeof https.request>;
    });

    const result = await canvasFetch(
      "https://canvas.example.edu/api/v1/users/self",
      { timeoutMs: 20 },
      credential
    );
    expect(result).toEqual({
      ok: false,
      kind: "unreachable",
      failure: { phase: "body", code: "BYTE_CAP", host: "canvas.example.edu", failedAfterMs: expect.any(Number) },
    });
    expect(destroyedReq?.destroyed).toBe(true);
  });
});

describe("canvasFetch - SEC9/E-UX4: only the network-layer outcome is padded to the timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("pads an INSTANT DNS failure out to the full timeout before resolving unreachable", async () => {
    lookupMock.mockRejectedValue(
      Object.assign(new Error("getaddrinfo ENOTFOUND canvas.example.edu"), { code: "ENOTFOUND" })
    );

    const resultPromise = canvasFetch(
      "https://canvas.example.edu/api/v1/users/self",
      { timeoutMs: 5000 },
      credential
    );
    let settled = false;
    void resultPromise.then(() => {
      settled = true;
    });

    // The underlying failure was immediate (a rejected promise, not a real
    // hung socket), so if this resolved before the deadline, the port-scan
    // oracle SEC9 exists to close would still be open.
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(await resultPromise).toEqual({
      ok: false,
      kind: "unreachable",
      failure: { phase: "dns", code: "ENOTFOUND", name: "Error", host: "canvas.example.edu", failedAfterMs: 0 },
    });
  });

  it("does NOT pad a host-not-allowed refusal - it is decided by our own code, not the network", async () => {
    const resultPromise = canvasFetch("https://127.0.0.1/api/v1/users/self", { timeoutMs: 5000 }, credential);
    // No timer advance at all: a refusal decided before any DNS lookup or
    // socket exists must not wait for anything.
    const result = await resultPromise;
    expect(result).toEqual({ ok: false, kind: "host-not-allowed", reason: expect.any(String) });
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("does NOT pad a completed HTTP exchange", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    requestMock.mockImplementation((_options, callback) => {
      const req = new FakeClientRequest();
      queueMicrotask(() => {
        const res = new FakeIncomingMessage(200, { "content-type": "application/json" });
        (callback as (res: unknown) => void)(res);
        res.emit("data", Buffer.from("{}"));
        res.emit("end");
      });
      return req as unknown as ReturnType<typeof https.request>;
    });

    const resultPromise = canvasFetch(
      "https://canvas.example.edu/api/v1/users/self",
      { timeoutMs: 5000 },
      credential
    );
    let settled = false;
    void resultPromise.then(() => {
      settled = true;
    });
    // Flush the queued microtask that delivers the response without
    // advancing the fake clock at all.
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
  });
});

describe("canvasFetch - pinnedLookup answers in the shape the socket layer asks for (AC-8)", () => {
  async function captureLookup(
    addr: LookupAddress
  ): Promise<LookupFunction> {
    lookupMock.mockResolvedValue([addr]);
    requestMock.mockImplementation(() => new FakeClientRequest() as unknown as ReturnType<typeof https.request>);
    void canvasFetch("https://canvas.example.edu/api/v1/users/self", {}, credential);
    await flushMicrotasks();
    const options = requestMock.mock.calls[0][0] as https.RequestOptions;
    return options.lookup as LookupFunction;
  }

  /** Calls the lookup and returns every raw callback argument, unmodified. */
  function callLookup(lookup: LookupFunction, hostname: string, opts: object): Promise<unknown[]> {
    return new Promise((resolve) => {
      (lookup as unknown as (h: string, o: object, cb: (...args: unknown[]) => void) => void)(
        hostname,
        opts,
        (...args: unknown[]) => resolve(args)
      );
    });
  }

  it("with { all: true } returns an ARRAY holding ONLY the one pinned address (SSRF pin preserved)", async () => {
    const lookup = await captureLookup({ address: "93.184.216.34", family: 4 });
    const args = await callLookup(lookup, "attacker-controlled-name.invalid", { all: true });
    expect(args).toHaveLength(2);
    expect(args[0]).toBeNull();
    const list = args[1] as LookupAddress[];
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({ address: "93.184.216.34", family: 4 });
    // Not a shape-only pin: the family must be a real IP family, never 0.
    expect([4, 6]).toContain(list[0].family);
    // No second resolution happened to produce that answer.
    expect(lookupMock).toHaveBeenCalledTimes(1);
  });

  it("with { all: true } normalises the family exactly as the single form does (IPv6 stays 6)", async () => {
    const lookup = await captureLookup({ address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 });
    const args = await callLookup(lookup, "x", { all: true });
    expect(args[1]).toEqual([{ address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 }]);
  });

  it("without all it keeps the single-address fallback triple", async () => {
    const lookup = await captureLookup({ address: "93.184.216.34", family: 4 });
    expect(await callLookup(lookup, "x", { family: 0 })).toEqual([null, "93.184.216.34", 4]);
    expect(await callLookup(lookup, "x", { all: false })).toEqual([null, "93.184.216.34", 4]);
    expect(await callLookup(lookup, "x", {})).toEqual([null, "93.184.216.34", 4]);
  });
});

describe("canvasFetch - the failure facts carry the phase (AC-2, AC-3, AC-4)", () => {
  class FakeSocket extends EventEmitter {
    constructor(public connecting: boolean | undefined = true) {
      super();
    }
  }

  /** Scripts one request: emits the given socket events, then the error. */
  async function failWith(
    socketEvents: ("connect" | "secureConnect")[],
    err: Error,
    socketConnecting: boolean | undefined = true
  ) {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    requestMock.mockImplementation(() => {
      const req = new FakeClientRequest();
      queueMicrotask(() => {
        const socket = new FakeSocket(socketConnecting);
        req.emit("socket", socket);
        for (const ev of socketEvents) socket.emit(ev);
        req.emit("error", err);
      });
      return req as unknown as ReturnType<typeof https.request>;
    });
    return canvasFetch("https://canvas.example.edu/api/v1/users/self", { timeoutMs: 20 }, credential);
  }

  const abort = () => Object.assign(new Error("The operation was aborted"), { name: "AbortError", code: "ABORT_ERR" });

  it("ECONNREFUSED after only 'socket' is phase connect with the code kept", async () => {
    const result = await failWith([], Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    expect(result).toMatchObject({ ok: false, kind: "unreachable", failure: { phase: "connect", code: "ECONNREFUSED" } });
  });

  it("the same AbortError lands in three different phases", async () => {
    const connect = await failWith([], abort());
    const tls = await failWith(["connect"], abort());
    const request = await failWith(["connect", "secureConnect"], abort());
    const phases = [connect, tls, request].map((r) => (r.ok === false && r.kind === "unreachable" ? r.failure?.phase : undefined));
    expect(phases).toEqual(["connect", "tls", "request"]);
  });

  it("a certificate error after 'connect' is phase tls with the code token kept", async () => {
    const result = await failWith(
      ["connect"],
      Object.assign(new Error("self signed"), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" })
    );
    expect(result).toMatchObject({ failure: { phase: "tls", code: "DEPTH_ZERO_SELF_SIGNED_CERT" } });
  });

  it("a reused keep-alive socket (connecting === false) counts connect and TLS as already reached", async () => {
    const result = await failWith([], abort(), false);
    expect(result).toMatchObject({ failure: { phase: "request" } });
  });

  it("the facts never include the error message, a hostile code, or a URL", async () => {
    const result = await failWith(
      [],
      Object.assign(new Error("boom 1234~abcdefghij ?access_token=secret"), {
        code: "ECONNREFUSED 10.0.0.1 token=abc",
      })
    );
    const json = JSON.stringify(result);
    expect(json).not.toContain("1234~abcdefghij");
    expect(json).not.toContain("access_token");
    expect(json).not.toContain("10.0.0.1");
    expect(result).toMatchObject({ failure: { phase: "connect" } });
    expect((result as { failure: { code?: string } }).failure.code).toBeUndefined();
  });

  it("a stream error after the response head is phase body", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    requestMock.mockImplementation((_options, callback) => {
      const req = new FakeClientRequest();
      queueMicrotask(() => {
        const res = new FakeIncomingMessage(200);
        (callback as (res: unknown) => void)(res);
        res.emit("error", Object.assign(new Error("closed"), { code: "ECONNRESET" }));
      });
      return req as unknown as ReturnType<typeof https.request>;
    });
    const result = await canvasFetch("https://canvas.example.edu/x", { timeoutMs: 20 }, credential);
    expect(result).toMatchObject({ failure: { phase: "body", code: "ECONNRESET" } });
  });
});
