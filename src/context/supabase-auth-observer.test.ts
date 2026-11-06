import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepoFeedbackPrivateAuth } from "../lib/repo-feedback-private-auth";
import { readyResponse } from "../lib/supabase/repo-feedback-readiness.test-fixture";
import { createSupabaseAuthObserver } from "./supabase-auth-observer";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const SESSION = "22222222-2222-2222-2222-222222222222";
const OTHER_ACCOUNT = "33333333-3333-3333-3333-333333333333";
const OTHER_SESSION = "44444444-4444-4444-4444-444444444444";
const NOW = new Date("2026-11-05T00:00:00Z").getTime();

function authSession(accountId = ACCOUNT, sessionId = SESSION, seconds = 60, claims: Record<string, unknown> = {}) {
  const payload = {
    sub: accountId,
    session_id: sessionId,
    exp: Math.floor(Date.now() / 1_000) + seconds,
    ...claims,
  };
  return {
    user: { id: accountId },
    access_token: `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("passive Supabase auth observation", () => {
  it("uses live changes even when bootstrap and INITIAL_SESSION settle afterward", async () => {
    const { port, begin } = createSupabaseAuthObserver();
    const effect = begin();
    const applied = vi.fn();
    const stale = authSession();
    const live = authSession(OTHER_ACCOUNT);
    const bootstrap = Promise.resolve(stale).then((session) => {
      if (effect.onBootstrap(session)) applied(session);
    });
    if (effect.onEvent("SIGNED_IN", live)) applied(live);
    const observed = port.snapshot();
    expect(observed.identity).toEqual({ accountId: OTHER_ACCOUNT, sessionId: SESSION });
    expect(effect.onEvent("INITIAL_SESSION", stale)).toBe(false);
    await bootstrap;
    expect(port.snapshot()).toBe(observed);
    expect(applied).toHaveBeenCalledExactlyOnceWith(live);

    effect.onEvent("SIGNED_OUT", null);
    expect(effect.onBootstrap(stale)).toBe(false);
    expect(effect.onBootstrapFailure()).toBe(false);
    expect(effect.onEvent("INITIAL_SESSION", stale)).toBe(false);
    expect(port.snapshot().identity).toBeNull();
  });

  it.each(["bootstrap", "initial session"])("accepts %s when it wins initialization", (winner) => {
    const { port, begin } = createSupabaseAuthObserver();
    const effect = begin();
    const initial = authSession();
    const stale = authSession(OTHER_ACCOUNT);
    if (winner === "bootstrap") {
      expect(effect.onBootstrap(initial)).toBe(true);
      expect(effect.onEvent("INITIAL_SESSION", stale)).toBe(false);
    } else {
      expect(effect.onEvent("INITIAL_SESSION", initial)).toBe(true);
      expect(effect.onBootstrap(stale)).toBe(false);
    }
    expect(port.snapshot().identity).toEqual({ accountId: ACCOUNT, sessionId: SESSION });
  });

  it("distinguishes a failed bootstrap from a successful null session", async () => {
    const { port, begin } = createSupabaseAuthObserver();
    const effect = begin();
    const initial = port.snapshot();
    const applied = vi.fn();
    await Promise.reject(new Error("Bootstrap unavailable")).then(
      (session) => { if (effect.onBootstrap(session)) applied(session); },
      () => effect.onBootstrapFailure(),
    );
    const unavailable = port.snapshot();
    expect(unavailable.identity).toBeNull();
    expect(unavailable.epoch).not.toBe(initial.epoch);
    expect(applied).not.toHaveBeenCalled();

    const recovered = authSession();
    if (effect.onEvent("INITIAL_SESSION", recovered)) applied(recovered);
    expect(applied).toHaveBeenCalledExactlyOnceWith(recovered);
    expect(port.snapshot().identity).toEqual({ accountId: ACCOUNT, sessionId: SESSION });

    const nextEffect = begin();
    expect(nextEffect.onBootstrap(null)).toBe(true);
    expect(nextEffect.onEvent("INITIAL_SESSION", recovered)).toBe(false);
    expect(port.snapshot().identity).toBeNull();
  });

  it.each(["SIGNED_IN", "SIGNED_OUT"] as const)("fences a failed bootstrap after %s", (event) => {
    const { port, begin } = createSupabaseAuthObserver();
    const effect = begin();
    effect.onEvent(event, event === "SIGNED_IN" ? authSession(OTHER_ACCOUNT) : null);
    const live = port.snapshot();
    const listener = vi.fn();
    port.subscribe(listener);
    expect(effect.onBootstrapFailure()).toBe(false);
    expect(effect.onEvent("INITIAL_SESSION", authSession())).toBe(false);
    expect(port.snapshot()).toBe(live);
    expect(listener).not.toHaveBeenCalled();
  });

  it("publishes frozen snapshots synchronously without retaining the SDK session", () => {
    const { port, begin } = createSupabaseAuthObserver();
    const effect = begin();
    const listener = vi.fn(() => port.snapshot());
    const unsubscribe = port.subscribe(listener);
    const session = authSession(ACCOUNT, SESSION, 60, { name: "Café" });
    effect.onBootstrap(session);
    const observed = port.snapshot();
    expect(listener.mock.results[0].value).toBe(observed);
    expect(Object.isFrozen(observed)).toBe(true);
    expect(Object.isFrozen(observed.identity)).toBe(true);
    session.user.id = OTHER_ACCOUNT;
    session.access_token = "replaced";
    expect(observed.identity).toEqual({ accountId: ACCOUNT, sessionId: SESSION });
    expect(Object.keys(observed)).toEqual(["epoch", "identity"]);
    unsubscribe();
    effect.onEvent("SIGNED_OUT", null);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("reschedules expiry on same-session refresh without rotating its epoch", () => {
    const { port, begin } = createSupabaseAuthObserver();
    const effect = begin();
    effect.onBootstrap(authSession(ACCOUNT, SESSION, 2));
    const initial = port.snapshot();
    const listener = vi.fn(() => port.snapshot());
    port.subscribe(listener);
    vi.advanceTimersByTime(1_000);
    effect.onEvent("TOKEN_REFRESHED", authSession(ACCOUNT, SESSION, 3));
    vi.advanceTimersByTime(1_000);
    expect(port.snapshot()).toBe(initial);
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.results[0].value.identity).toBeNull();
    expect(port.snapshot().epoch).not.toBe(initial.epoch);
  });

  it("invalidates an overdue epoch synchronously before an otherwise matching refresh", () => {
    const { port, begin } = createSupabaseAuthObserver();
    const effect = begin();
    effect.onBootstrap(authSession(ACCOUNT, SESSION, 1));
    const original = port.snapshot();
    const listener = vi.fn(() => port.snapshot());
    port.subscribe(listener);
    vi.setSystemTime(NOW + 1_000);
    expect(listener).not.toHaveBeenCalled();
    effect.onEvent("TOKEN_REFRESHED", authSession());
    const current = port.snapshot();
    expect(current.identity).toEqual(original.identity);
    expect(current.epoch).not.toBe(original.epoch);
    expect(listener.mock.results.map(({ value }) => value.identity)).toEqual([null, original.identity]);
  });

  it("invalidates an overdue epoch on a snapshot without waiting for a timer", () => {
    const { port, begin } = createSupabaseAuthObserver();
    const effect = begin();
    effect.onBootstrap(authSession(ACCOUNT, SESSION, 1));
    const previous = port.snapshot();
    vi.setSystemTime(NOW + 1_000);
    const expired = port.snapshot();
    expect(expired.identity).toBeNull();
    expect(expired.epoch).not.toBe(previous.epoch);
    expect(port.snapshot()).toBe(expired);
  });

  it("does not let a reentrant live change be overwritten during expiry notification", () => {
    const { port, begin } = createSupabaseAuthObserver();
    const effect = begin();
    effect.onBootstrap(authSession(ACCOUNT, SESSION, 1));
    port.subscribe(() => {
      if (port.snapshot().identity === null) effect.onEvent("SIGNED_IN", authSession(OTHER_ACCOUNT));
    });
    vi.setSystemTime(NOW + 1_000);
    expect(effect.onEvent("TOKEN_REFRESHED", authSession())).toBe(false);
    expect(port.snapshot().identity).toEqual({ accountId: OTHER_ACCOUNT, sessionId: SESSION });
  });

  it("revokes continuity on account, session, sign-out, and password-recovery boundaries", () => {
    const { port, begin } = createSupabaseAuthObserver();
    const effect = begin();
    const epochs = [port.snapshot().epoch];
    effect.onBootstrap(authSession());
    epochs.push(port.snapshot().epoch);
    effect.onEvent("SIGNED_IN", authSession(OTHER_ACCOUNT));
    epochs.push(port.snapshot().epoch);
    effect.onEvent("SIGNED_IN", authSession());
    epochs.push(port.snapshot().epoch);
    effect.onEvent("SIGNED_IN", authSession(ACCOUNT, OTHER_SESSION));
    epochs.push(port.snapshot().epoch);
    effect.onEvent("PASSWORD_RECOVERY", authSession(ACCOUNT, OTHER_SESSION));
    epochs.push(port.snapshot().epoch);
    effect.onEvent("SIGNED_OUT", null);
    epochs.push(port.snapshot().epoch);
    expect(new Set(epochs).size).toBe(epochs.length);
    expect(port.snapshot().identity).toBeNull();
  });

  it.each([
    ["invalid token syntax", (): string => "bad-token"],
    ["oversized token", () => `header.${"a".repeat(8_185)}.signature`],
    ["invalid base64", (): string => "header.a.signature"],
    ["invalid JSON", (): string => "header.bm90IGpzb24.signature"],
    ["expired claim", () => authSession(ACCOUNT, SESSION, 0).access_token],
    ["noninteger expiration", () => authSession(ACCOUNT, SESSION, 60.5).access_token],
    ["unrepresentable expiration", () => authSession(ACCOUNT, SESSION, 60, { exp: Number.MAX_SAFE_INTEGER }).access_token],
    ["mismatched subject", () => authSession(OTHER_ACCOUNT).access_token],
    ["missing session ID", () => authSession(ACCOUNT, SESSION, 60, { session_id: undefined }).access_token],
    ["nil session ID", () => authSession(ACCOUNT, "00000000-0000-0000-0000-000000000000").access_token],
  ] as const)("invalidates on %s", (_name, token) => {
    const { port, begin } = createSupabaseAuthObserver();
    const effect = begin();
    effect.onBootstrap(authSession());
    const previous = port.snapshot();
    effect.onEvent("TOKEN_REFRESHED", { user: { id: ACCOUNT }, access_token: token() });
    expect(port.snapshot().identity).toBeNull();
    expect(port.snapshot().epoch).not.toBe(previous.epoch);
    effect.onEvent("TOKEN_REFRESHED", authSession());
    expect(port.snapshot().identity).toEqual(previous.identity);
    expect(port.snapshot().epoch).not.toBe(previous.epoch);
  });

  it("revokes the old effect before unsubscribe and ignores all of its later callbacks", () => {
    const { port, begin } = createSupabaseAuthObserver();
    const first = begin();
    first.onBootstrap(authSession(ACCOUNT, SESSION, 1));
    const previous = port.snapshot();
    first.close();
    const unsubscribe = vi.fn(() => {
      expect(port.snapshot().identity).toBeNull();
      expect(first.onEvent("SIGNED_IN", authSession())).toBe(false);
    });
    unsubscribe();

    const second = begin();
    expect(second.onBootstrap(authSession())).toBe(true);
    const current = port.snapshot();
    expect(current.identity).toEqual(previous.identity);
    expect(current.epoch).not.toBe(previous.epoch);
    expect(first.onBootstrap(null)).toBe(false);
    expect(first.onBootstrapFailure()).toBe(false);
    expect(first.onEvent("INITIAL_SESSION", null)).toBe(false);
    first.close();
    vi.advanceTimersByTime(1_000);
    expect(port.snapshot()).toBe(current);
    second.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("contains listener failures without introducing fetch or browser storage access", () => {
    const fetch = vi.fn();
    const browserAccess = vi.fn(() => { throw new Error("Unexpected browser access"); });
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("window", new Proxy({}, { get: browserAccess }));
    vi.stubGlobal("localStorage", new Proxy({}, { get: browserAccess }));
    vi.stubGlobal("sessionStorage", new Proxy({}, { get: browserAccess }));
    vi.stubGlobal("indexedDB", new Proxy({}, { get: browserAccess }));
    const { port, begin } = createSupabaseAuthObserver();
    const effect = begin();
    const failingListener = vi.fn(() => { throw new Error("A consumer failed"); });
    const listener = vi.fn(() => port.snapshot());
    port.subscribe(failingListener);
    port.subscribe(listener);
    expect(effect.onEvent("SIGNED_IN", authSession())).toBe(true);
    expect(failingListener).toHaveBeenCalledOnce();
    expect(listener.mock.results[0].value).toBe(port.snapshot());
    expect(fetch).not.toHaveBeenCalled();
    expect(browserAccess).not.toHaveBeenCalled();
  });
});

it("keeps the provider on its existing SDK and owner transition entry points", () => {
  const provider = readFileSync(new URL("./SupabaseProvider.tsx", import.meta.url), "utf8");
  expect(provider.match(/supabase\.auth\.\w+\(/g)).toEqual([
    "supabase.auth.onAuthStateChange(",
    "supabase.auth.getSession(",
  ]);
  expect(provider.match(/setCacheOwner\(/g)).toEqual(["setCacheOwner("]);
  expect(provider).toContain("if (effect.onEvent(event, next)) applySession(next);");
  expect(provider).toContain("if (effect.onBootstrap(data.session)) applySession(data.session);");
  expect(provider).toMatch(/function bootstrapFailed\(\) \{\s*effect\.onBootstrapFailure\(\);\s*if \(effect\.isActive\(\)\) setLoading\(false\);\s*\}/);
  expect(provider).toMatch(/effect\.close\(\);\s*sub\.subscription\.unsubscribe\(\);/);
  expect(provider).toContain("authObserver: authObserver.port");
});

it("keeps a private lease through a continuous refresh and revokes it after shared expiry", async () => {
  const { port, begin } = createSupabaseAuthObserver();
  const effect = begin();
  effect.onBootstrap(authSession(ACCOUNT, SESSION, 2));
  const project = "https://isolated.example";
  const privateSession = authSession(ACCOUNT, OTHER_SESSION, 60, { aal: "aal1" });
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json({
    ...privateSession,
    user: { ...privateSession.user, is_anonymous: false },
    refresh_token: "fixture",
    expires_in: 60,
    token_type: "bearer",
  }));
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("window", {
    crypto: { randomUUID },
    fetch: async () => readyResponse(project),
    location: { origin: "https://app.example" },
  });
  const controller = createRepoFeedbackPrivateAuth({
    supabaseUrl: project,
    publicKey: "sb_publishable_test_key",
    verifySession: vi.fn().mockResolvedValue({ accountId: ACCOUNT, sessionId: OTHER_SESSION }),
    shared: port,
    channel: { subscribe: () => () => {}, publishRevocation: vi.fn() },
    lifecycle: { subscribe: () => () => {} },
    createStorage: () => ({ load: vi.fn(), save: vi.fn(), discard: vi.fn() }),
  });
  try {
    await expect(controller.signInWithPassword({ email: "owner@example.test", password: "fixture" }))
      .resolves.toEqual({ status: "unlocked" });
    vi.setSystemTime(NOW + 1_000);
    effect.onEvent("TOKEN_REFRESHED", authSession(ACCOUNT, SESSION, 2));
    expect(controller.getStatus()).toBe("unlocked");
    vi.setSystemTime(NOW + 3_000);
    effect.onEvent("TOKEN_REFRESHED", authSession(ACCOUNT, SESSION, 2));
    expect(controller.getStatus()).toBe("locked");
    expect(fetch).toHaveBeenCalledOnce();
  } finally {
    controller.dispose();
    effect.close();
  }
});
