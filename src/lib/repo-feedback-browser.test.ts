import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseAuthObserver } from "../context/supabase-auth-observer";
import { createRepoFeedbackBrowser } from "./repo-feedback-browser";
import { readyResponse } from "./supabase/repo-feedback-readiness.test-fixture";

const ORIGIN = "https://app.example.test";
const PROJECT = "https://project.example.test";
const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";
const SHARED_ID = "22222222-2222-2222-2222-222222222222";
const PRIVATE_ID = "33333333-3333-3333-3333-333333333333";
const IDENTITY = { accountId: ACCOUNT_ID, sessionId: PRIVATE_ID };
const CREDENTIALS = { email: "owner@example.test", password: "fixture-password" };
const TARGET = { kind: "current", course: "course" } as const;
const passwordFetch = vi.fn<typeof fetch>();
const sessionFetch = vi.fn<typeof fetch>();
const openDatabase = vi.fn(() => { throw new Error("Fixture unavailable"); });
const channelName = vi.fn<(name: string) => void>();
const cleanups: (() => void)[] = [];

class Channel extends EventTarget {
  static current: Channel;
  readonly postMessage = vi.fn<(data: unknown) => void>();
  readonly close = vi.fn();

  constructor(name: string) {
    super();
    channelName(name);
    Channel.current = this;
  }
}

class Browser extends EventTarget {
  isSecureContext = true;
  location = { origin: ORIGIN, href: `${ORIGIN}/?unrelated=1#other` };
  crypto = { randomUUID };
  BroadcastChannel = Channel;
  fetch: typeof fetch = (input, init) => input === `${ORIGIN}/auth/repo-feedback-readiness`
    ? Promise.resolve(readyResponse(PROJECT)) : sessionFetch(input, init);
}

function jwt(claims: object) {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
}

function token(sessionId: string) {
  return jwt({ sub: ACCOUNT_ID, session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 120, aal: "aal1" });
}

function harness(browser = new Browser()) {
  vi.stubGlobal("window", browser);
  const { port, begin } = createSupabaseAuthObserver();
  const provider = begin();
  provider.onBootstrap({ access_token: token(SHARED_ID), user: { id: ACCOUNT_ID } });
  const snapshot = vi.spyOn(port, "snapshot");
  cleanups.push(provider.close);

  function create() {
    const controller = createRepoFeedbackBrowser(port);
    expect(controller).not.toBeNull();
    cleanups.push(controller!.dispose);
    return controller!;
  }

  return { browser, port, provider, snapshot, create };
}

function allowPassword() {
  const bearer = token(PRIVATE_ID);
  passwordFetch.mockImplementation(async () => Response.json({
    access_token: bearer,
    refresh_token: "fixture-refresh-token",
    expires_in: 120,
    token_type: "bearer",
    user: { id: ACCOUNT_ID, is_anonymous: false },
  }));
  return bearer;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function responseStream(body: UnderlyingSource<Uint8Array>) {
  return new Response(new ReadableStream(body), { headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PROJECT);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_fixture");
  vi.stubGlobal("fetch", passwordFetch);
  vi.stubGlobal("indexedDB", { open: openDatabase });
  passwordFetch.mockReset();
  sessionFetch.mockReset();
  channelName.mockReset();
  openDatabase.mockClear();
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("browser feedback binding", () => {
  it("constructs locked and subscribes passively without reading drafts or authenticating", async () => {
    const app = harness();
    const controller = app.create();
    expect(controller.getStatus()).toBe("locked");
    expect(await controller.load(TARGET)).toEqual({ status: "locked" });
    expect(app.snapshot).not.toHaveBeenCalled();
    expect(openDatabase).not.toHaveBeenCalled();
    expect(passwordFetch).not.toHaveBeenCalled();
    expect(sessionFetch).not.toHaveBeenCalled();
    expect(channelName).toHaveBeenCalledExactlyOnceWith("repo-feedback-revocation-v1");
  });

  it("sends a bodyless same-origin POST with only the exact private bearer", async () => {
    const controller = harness().create();
    const bearer = allowPassword();
    const body = new TextEncoder().encode(`{\n"sessionId":"${PRIVATE_ID}", "accountId":"${ACCOUNT_ID}"}`);
    sessionFetch.mockImplementation(async () => responseStream({
      start(stream) {
        stream.enqueue(body.subarray(0, 19));
        stream.enqueue(body.subarray(19));
        stream.close();
      },
    }));
    expect(await controller.signInWithPassword(CREDENTIALS)).toEqual({ status: "unlocked" });
    expect(await controller.load(TARGET)).toEqual({ status: "storage_error" });
    expect(openDatabase).toHaveBeenCalledOnce();
    expect(sessionFetch).toHaveBeenCalledTimes(2);
    for (const request of sessionFetch.mock.calls) {
      expect(request).toEqual([`${ORIGIN}/auth/repo-feedback-session`, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}` },
        credentials: "omit",
        mode: "same-origin",
        redirect: "error",
        cache: "no-store",
        referrer: "",
        referrerPolicy: "same-origin",
        signal: expect.any(AbortSignal),
      }]);
    }
    expect(passwordFetch.mock.calls[0][0]).toBe(`${PROJECT}/auth/v1/token?grant_type=password`);
  });

  it("requires a browser secure context and the application's public project settings", () => {
    const { port, browser } = harness();
    vi.stubGlobal("window", undefined);
    expect(createRepoFeedbackBrowser(port)).toBeNull();
    vi.stubGlobal("window", browser);
    browser.isSecureContext = false;
    expect(createRepoFeedbackBrowser(port)).toBeNull();
    browser.isSecureContext = true;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.example.test/other");
    expect(createRepoFeedbackBrowser(port)).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PROJECT);
    for (const key of ["", "sb_publishable_", "sb_secret_fixture", jwt({ role: "service_role" })]) {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", key);
      expect(createRepoFeedbackBrowser(port)).toBeNull();
    }
    expect(channelName).not.toHaveBeenCalled();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", jwt({ role: "anon" }));
    const controller = createRepoFeedbackBrowser(port);
    expect(controller?.getStatus()).toBe("locked");
    controller?.dispose();
  });

  it.each([
    ["extra fields", () => Response.json({ ...IDENTITY, accessToken: "fixture" })],
    ["duplicate keys", () => new Response(`{"accountId":"${ACCOUNT_ID}","accountId":"${ACCOUNT_ID}","sessionId":"${PRIVATE_ID}"}`, {
      headers: { "Content-Type": "application/json" },
    })],
    ["invalid UUID", () => Response.json({ ...IDENTITY, sessionId: "invalid" })],
    ["wrong identity", () => Response.json({ ...IDENTITY, sessionId: SHARED_ID })],
    ["malformed JSON", () => new Response("{", { headers: { "Content-Type": "application/json" } })],
    ["invalid UTF-8", () => responseStream({ start(stream) { stream.enqueue(Uint8Array.of(0xc0, 0xaf)); stream.close(); } })],
    ["wrong media type", () => new Response(JSON.stringify(IDENTITY))],
    ["redirect status", () => Response.redirect("https://elsewhere.example.test")],
    ["redirected success", () => Object.defineProperty(Response.json(IDENTITY), "redirected", { value: true }) as Response],
    ["denial status", () => Response.json(IDENTITY, { status: 401 })],
  ] as const)("fails closed for %s", async (_, makeResponse) => {
    const controller = harness().create();
    allowPassword();
    sessionFetch.mockResolvedValueOnce(makeResponse());
    expect(await controller.signInWithPassword(CREDENTIALS)).toEqual({ status: "unavailable" });
    expect(await controller.load(TARGET)).toEqual({ status: "locked" });
    expect(openDatabase).not.toHaveBeenCalled();
  });

  it("returns a fixed failure without reporting a transport exception", async () => {
    const controller = harness().create();
    const bearer = allowPassword();
    const error = vi.spyOn(console, "error");
    const warn = vi.spyOn(console, "warn");
    sessionFetch.mockRejectedValueOnce(new Error(`Fixture rejection for ${bearer}`));
    expect(await controller.signInWithPassword(CREDENTIALS)).toEqual({ status: "unavailable" });
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("cancels an overflowing response without trusting a small Content-Length", async () => {
    const controller = harness().create();
    allowPassword();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const response = responseStream({
      start(stream) { stream.enqueue(new Uint8Array(600)); stream.enqueue(new Uint8Array(600)); },
      cancel,
    });
    response.headers.set("Content-Length", "1");
    sessionFetch.mockResolvedValueOnce(response);
    expect(await controller.signInWithPassword(CREDENTIALS)).toEqual({ status: "unavailable" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });

  it("times out a stalled body, cancels it and releases the reader", async () => {
    vi.useFakeTimers();
    const controller = harness().create();
    allowPassword();
    const started = deferred<void>();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const response = responseStream({ pull() { started.resolve(); }, cancel });
    sessionFetch.mockResolvedValueOnce(response);
    const result = controller.signInWithPassword(CREDENTIALS);
    await started.promise;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await result).toEqual({ status: "unavailable" });
    expect(sessionFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });

  it("aborts on owner disposal and cancels a fetch response arriving after disposal", async () => {
    const controller = harness().create();
    allowPassword();
    const started = deferred<void>();
    const late = deferred<Response>();
    sessionFetch.mockImplementationOnce(() => { started.resolve(); return late.promise; });
    const result = controller.signInWithPassword(CREDENTIALS);
    await started.promise;
    controller.dispose();
    expect(await result).toEqual({ status: "locked" });
    expect(sessionFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    const cancel = vi.fn();
    late.resolve(responseStream({ cancel }));
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
    expect(controller.getStatus()).toBe("locked");
  });

  it("revokes on the real observer's epoch change, pagehide and pageshow", async () => {
    const { browser, provider, create } = harness();
    const controller = create();
    allowPassword();
    sessionFetch.mockImplementation(async () => Response.json(IDENTITY));
    expect(await controller.signInWithPassword(CREDENTIALS)).toEqual({ status: "unlocked" });
    provider.onEvent("PASSWORD_RECOVERY", { access_token: token(SHARED_ID), user: { id: ACCOUNT_ID } });
    expect(controller.getStatus()).toBe("locked");
    expect(await controller.signInWithPassword(CREDENTIALS)).toEqual({ status: "unlocked" });
    browser.dispatchEvent(new Event("pagehide"));
    expect(await controller.signInWithPassword(CREDENTIALS)).toEqual({ status: "locked" });
    browser.dispatchEvent(new Event("pageshow"));
    expect(await controller.signInWithPassword(CREDENTIALS)).toEqual({ status: "unlocked" });
    browser.dispatchEvent(new Event("pageshow"));
    expect(controller.getStatus()).toBe("locked");
    expect(Channel.current.postMessage).not.toHaveBeenCalled();
  });

  it("publishes only revocation and never rebroadcasts an incoming revocation", async () => {
    const controller = harness().create();
    const channel = Channel.current;
    allowPassword();
    sessionFetch.mockImplementation(async () => Response.json(IDENTITY));
    expect(await controller.signInWithPassword(CREDENTIALS)).toEqual({ status: "unlocked" });
    channel.dispatchEvent(new MessageEvent("message", { data: "revoke" }));
    expect(controller.getStatus()).toBe("locked");
    expect(channel.postMessage).not.toHaveBeenCalled();
    controller.revoke();
    expect(channel.postMessage).toHaveBeenCalledExactlyOnceWith("revoke");
  });

  it.each(["malformed", "messageerror", "publish"] as const)("permanently revokes and closes on channel %s", async (kind) => {
    const controller = harness().create();
    const channel = Channel.current;
    allowPassword();
    sessionFetch.mockImplementation(async () => Response.json(IDENTITY));
    expect(await controller.signInWithPassword(CREDENTIALS)).toEqual({ status: "unlocked" });
    if (kind === "publish") {
      channel.postMessage.mockImplementationOnce(() => { throw new Error("Fixture publish failure"); });
      controller.revoke();
    } else if (kind === "messageerror") {
      channel.dispatchEvent(new MessageEvent("messageerror"));
    } else {
      channel.dispatchEvent(new MessageEvent("message", { data: { type: "revoke", sessionId: PRIVATE_ID } }));
    }
    expect(controller.getStatus()).toBe("unavailable");
    expect(await controller.signInWithPassword(CREDENTIALS)).toEqual({ status: "unavailable" });
    expect(passwordFetch).toHaveBeenCalledOnce();
    controller.dispose();
    expect(channel.close).toHaveBeenCalledOnce();
    expect(channel.postMessage.mock.calls).toEqual(kind === "publish" ? [["revoke"]] : []);
  });

  it("stays unavailable when opening the channel fails", () => {
    const { create, browser, port } = harness();
    const subscribe = vi.spyOn(port, "subscribe");
    const pageListener = vi.spyOn(browser, "addEventListener");
    channelName.mockImplementationOnce(() => { throw new Error("Fixture creation failure"); });
    const controller = create();
    expect(controller.getStatus()).toBe("unavailable");
    expect(pageListener).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("closes the channel and removes both listeners if channel registration fails partway", () => {
    const { create } = harness();
    const remove = vi.spyOn(Channel.prototype, "removeEventListener");
    vi.spyOn(Channel.prototype, "addEventListener").mockImplementation(function (this: Channel, type, listener, options) {
      EventTarget.prototype.addEventListener.call(this, type, listener, options);
      if (type === "messageerror") throw new Error("Fixture registration failure");
    });
    const controller = create();
    expect(controller.getStatus()).toBe("unavailable");
    expect(remove.mock.calls.map(([type]) => type)).toEqual(["message", "messageerror"]);
    expect(Channel.current.close).toHaveBeenCalledOnce();
  });

  it("releases partially installed page listeners and the channel if page registration fails", () => {
    const { create, browser } = harness();
    const remove = vi.spyOn(browser, "removeEventListener");
    vi.spyOn(browser, "addEventListener").mockImplementation((type, listener, options) => {
      EventTarget.prototype.addEventListener.call(browser, type, listener, options);
      if (type === "pageshow") throw new Error("Fixture registration failure");
    });
    const controller = create();
    expect(controller.getStatus()).toBe("unavailable");
    expect(remove.mock.calls.map(([type]) => type)).toEqual(["pagehide", "pageshow"]);
    expect(Channel.current.close).toHaveBeenCalledOnce();
  });

  it("disposes the observer, channel and lifecycle listeners once", () => {
    const { create, browser, port } = harness();
    const releaseObserver = vi.fn(port.subscribe(() => {}));
    vi.spyOn(port, "subscribe").mockReturnValueOnce(releaseObserver);
    const controller = create();
    const channel = Channel.current;
    const removeChannel = vi.spyOn(channel, "removeEventListener");
    const removePage = vi.spyOn(browser, "removeEventListener");
    controller.dispose();
    controller.dispose();
    controller.revoke();
    expect(releaseObserver).toHaveBeenCalledOnce();
    expect(removeChannel.mock.calls.map(([type]) => type)).toEqual(["message", "messageerror"]);
    expect(removePage.mock.calls.map(([type]) => type)).toEqual(["pagehide", "pageshow"]);
    expect(channel.close).toHaveBeenCalledOnce();
    expect(channel.postMessage).not.toHaveBeenCalled();
  });

  it("keeps the binding outside runtime callers and the legacy auth path", () => {
    const root = resolve(__dirname, "..");
    const callers = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.test\.|^repo-feedback-browser\.ts$/.test(entry.name))
      .filter((entry) => /repo-feedback-browser|createRepoFeedbackBrowser/.test(readFileSync(resolve(entry.parentPath, entry.name), "utf8")))
      .map((entry) => entry.name);
    expect(callers).toEqual([]);
    const source = readFileSync(resolve(__dirname, "repo-feedback-browser.ts"), "utf8");
    expect(source).not.toMatch(/['"]\.\/repo-feedback-auth['"]/);
  });
});
