import { randomUUID } from "node:crypto";
import { AuthClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepoFeedbackPrivateAuth } from "./repo-feedback-private-auth";
import { readyResponse } from "./supabase/repo-feedback-readiness.test-fixture";

type Dependencies = Parameters<typeof createRepoFeedbackPrivateAuth>[0];
type Snapshot = ReturnType<Dependencies["shared"]["snapshot"]>;
type CreateStorage = NonNullable<Dependencies["createStorage"]>;
type Storage = ReturnType<CreateStorage>;

const PROJECT = "https://isolated.example";
const SHARED = {
  accountId: "11111111-1111-1111-1111-111111111111",
  sessionId: "22222222-2222-2222-2222-222222222222",
};
const PRIVATE = { ...SHARED, sessionId: "33333333-3333-3333-3333-333333333333" };
const OTHER_ACCOUNT = { ...SHARED, accountId: "44444444-4444-4444-4444-444444444444" };
const FACTOR = "55555555-5555-5555-5555-555555555555";
const CHALLENGE = "66666666-6666-6666-6666-666666666666";
const TARGET = { kind: "current", course: "course" } as const;
const CHECKPOINT = { revision: 0 };
const VALUE: readonly [] = [];
const DRAFT = { status: "saved", checkpoint: CHECKPOINT, revision: 1, value: VALUE } as const;
const COMMITTED = { status: "committed", checkpoint: { revision: 1 } } as const;
const CREDENTIALS = { email: "owner@example.test", password: "test-only-password" };
const TOTP = { factorId: FACTOR, code: "012345" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function bearer(identity = PRIVATE, aal = "aal1", seconds = 60) {
  const claims = { sub: identity.accountId, session_id: identity.sessionId, aal, exp: Math.floor(Date.now() / 1000) + seconds };
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
}

function passwordResponse(token: string, mfa = false, accountId = PRIVATE.accountId) {
  return Response.json({
    access_token: token,
    refresh_token: "test-only-refresh-token",
    expires_in: 60,
    token_type: "bearer",
    user: { id: accountId, is_anonymous: false, factors: mfa ? [{ id: FACTOR, factor_type: "totp", status: "verified" }] : [] },
  });
}

function challengeResponse() {
  return Response.json({ id: CHALLENGE, type: "totp", expires_at: Math.floor(Date.now() / 1000) + 60 });
}

const fetchMock = vi.fn<typeof fetch>();
const disposeAfterTest: (() => void)[] = [];

function harness(initial: Snapshot["identity"] = SHARED) {
  let snapshot: Snapshot = { epoch: Symbol(), identity: initial };
  let sharedChanged!: () => void;
  let channelChanged!: Parameters<Dependencies["channel"]["subscribe"]>[0];
  let pageChanged!: Parameters<Dependencies["lifecycle"]["subscribe"]>[0];
  const unsubscribeShared = vi.fn();
  const unsubscribeChannel = vi.fn();
  const unsubscribePage = vi.fn();
  const publishRevocation = vi.fn();
  const verifySession = vi.fn<Dependencies["verifySession"]>().mockResolvedValue(PRIVATE);
  const storage = {
    load: vi.fn<Storage["load"]>().mockResolvedValue(DRAFT),
    save: vi.fn<Storage["save"]>().mockResolvedValue(COMMITTED),
    discard: vi.fn<Storage["discard"]>().mockResolvedValue(COMMITTED),
  };
  const createStorage = vi.fn<CreateStorage>(() => storage);
  const readSnapshot = vi.fn(() => snapshot);
  const controller = createRepoFeedbackPrivateAuth({
    supabaseUrl: PROJECT,
    publicKey: "sb_publishable_test_key",
    verifySession,
    shared: {
      snapshot: readSnapshot,
      subscribe(listener) { sharedChanged = listener; return unsubscribeShared; },
    },
    channel: {
      subscribe(listener) { channelChanged = listener; return unsubscribeChannel; },
      publishRevocation,
    },
    lifecycle: { subscribe(listener) { pageChanged = listener; return unsubscribePage; } },
    createStorage,
  });
  disposeAfterTest.push(controller.dispose);
  return {
    controller, storage, verifySession, readSnapshot, publishRevocation, unsubscribeShared, unsubscribeChannel, unsubscribePage,
    authority: createStorage.mock.calls[0][0],
    shared(identity: Snapshot["identity"], notify = true) {
      snapshot = { epoch: Symbol(), identity };
      if (notify) sharedChanged();
    },
    channel: channelChanged,
    page: pageChanged,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", {
    crypto: { randomUUID },
    fetch: async () => readyResponse(PROJECT),
    location: { origin: "https://app.example", href: "https://app.example/#access_token=test-callback&refresh_token=test-refresh" },
  });
});

afterEach(() => {
  for (const dispose of disposeAfterTest.splice(0)) dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("private feedback authorization", () => {
  it("starts locked on every construction and uses the exact private bearer before each storage operation", async () => {
    const app = harness();
    const setSession = vi.spyOn(AuthClient.prototype, "setSession");
    const signOut = vi.spyOn(AuthClient.prototype, "signOut");
    const refresh = vi.spyOn(AuthClient.prototype, "refreshSession");
    const token = bearer();
    expect(app.controller.getStatus()).toBe("locked");
    expect(await app.controller.load(TARGET)).toEqual({ status: "locked" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(app.storage.load).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(passwordResponse(token));
    expect(await app.controller.signInWithPassword(CREDENTIALS)).toEqual({ status: "unlocked" });
    expect(app.controller.getStatus()).toBe("unlocked");
    expect(await app.controller.load(TARGET)).toEqual(DRAFT);
    expect(await app.controller.save(TARGET, CHECKPOINT, VALUE)).toEqual(COMMITTED);
    expect(await app.controller.discard(TARGET, CHECKPOINT)).toEqual(COMMITTED);
    expect(app.verifySession.mock.calls.map(([jwt]) => jwt)).toEqual([token, token, token, token]);
    const [lease] = app.storage.load.mock.calls[0];
    expect(Object.keys(lease)).toEqual(["signal"]);
    expect(app.authority.resolve(lease, TARGET)).toEqual([SHARED.accountId, "current", TARGET.course]);
    expect(app.storage.save).toHaveBeenCalledExactlyOnceWith(lease, TARGET, CHECKPOINT, VALUE);
    expect(app.storage.discard).toHaveBeenCalledExactlyOnceWith(lease, TARGET, CHECKPOINT);
    expect(harness().controller.getStatus()).toBe("locked");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(setSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps MFA pending until the same private session is upgraded and verifies only the upgraded bearer", async () => {
    const app = harness();
    const original = bearer();
    const upgraded = bearer(PRIVATE, "aal2");
    fetchMock.mockResolvedValueOnce(passwordResponse(original, true));
    expect(await app.controller.signInWithPassword(CREDENTIALS)).toEqual({ status: "mfa_required", factorIds: [FACTOR] });
    expect(await app.controller.load(TARGET)).toEqual({ status: "locked" });
    expect(await app.controller.verifyTotp({ ...TOTP, code: "00000" })).toEqual({ status: "rejected" });
    expect(app.controller.getStatus()).toBe("mfa_required");
    expect(app.verifySession).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(challengeResponse()).mockResolvedValueOnce(passwordResponse(upgraded));
    expect(await app.controller.verifyTotp(TOTP)).toEqual({ status: "unlocked" });
    expect(await app.controller.load(TARGET)).toEqual(DRAFT);
    expect(app.verifySession.mock.calls.map(([jwt]) => jwt)).toEqual([upgraded, upgraded]);
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({ Authorization: `Bearer ${original}` });
  });

  it.each([SHARED, OTHER_ACCOUNT])("refuses a private session with invalid identity %j", async (identity) => {
    const app = harness();
    fetchMock.mockResolvedValueOnce(passwordResponse(bearer(identity), false, identity.accountId));
    expect((await app.controller.signInWithPassword(CREDENTIALS)).status).toMatch(/^(rejected|unavailable)$/);
    expect(app.controller.getStatus()).toBe("locked");
    expect(app.verifySession).not.toHaveBeenCalled();
    expect(await app.controller.load(TARGET)).toEqual({ status: "locked" });
    expect(app.storage.load).not.toHaveBeenCalled();
  });

  it("cannot sign in without a shared baseline", async () => {
    const app = harness(null);
    expect(await app.controller.signInWithPassword(CREDENTIALS)).toEqual({ status: "locked" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels password admission on A-B-A even if the exact verifier resolves successfully later", async () => {
    const app = harness();
    const entered = deferred<AbortSignal>();
    const verified = deferred<typeof PRIVATE>();
    app.verifySession.mockImplementationOnce((_token, signal) => { entered.resolve(signal); return verified.promise; });
    fetchMock.mockResolvedValueOnce(passwordResponse(bearer()));
    const pending = app.controller.signInWithPassword(CREDENTIALS);
    const signal = await entered.promise;
    app.shared(OTHER_ACCOUNT);
    app.shared(SHARED);
    expect(signal.aborted).toBe(true);
    verified.resolve(PRIVATE);
    expect(await pending).toEqual({ status: "locked" });
    expect(app.controller.getStatus()).toBe("locked");
  });

  it("checks the snapshot between MFA requests before sending the code", async () => {
    const app = harness();
    fetchMock.mockResolvedValueOnce(passwordResponse(bearer(), true));
    expect((await app.controller.signInWithPassword(CREDENTIALS)).status).toBe("mfa_required");
    const response = deferred<Response>();
    fetchMock.mockImplementationOnce(() => response.promise);
    const pending = app.controller.verifyTotp(TOTP);
    app.shared(OTHER_ACCOUNT, false);
    app.shared(SHARED, false);
    response.resolve(challengeResponse());
    expect(await pending).toEqual({ status: "locked" });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${PROJECT}/auth/v1/token?grant_type=password`, `${PROJECT}/auth/v1/factors/${FACTOR}/challenge`,
    ]);
    expect(app.verifySession).not.toHaveBeenCalled();
  });

  it("fails closed when private revalidation denies admission or the shared snapshot changes during verification", async () => {
    const app = harness();
    fetchMock.mockResolvedValueOnce(passwordResponse(bearer()));
    await app.controller.signInWithPassword(CREDENTIALS);
    app.verifySession.mockResolvedValueOnce(null);
    expect(await app.controller.load(TARGET)).toEqual({ status: "unavailable" });
    expect(app.controller.getStatus()).toBe("locked");
    fetchMock.mockResolvedValueOnce(passwordResponse(bearer()));
    await app.controller.signInWithPassword(CREDENTIALS);
    const entered = deferred<AbortSignal>();
    const verified = deferred<typeof PRIVATE>();
    app.verifySession.mockImplementationOnce((_token, signal) => { entered.resolve(signal); return verified.promise; });
    const pending = app.controller.save(TARGET, CHECKPOINT, VALUE);
    const signal = await entered.promise;
    app.shared(SHARED);
    expect(signal.aborted).toBe(true);
    verified.resolve(PRIVATE);
    expect(await pending).toEqual({ status: "locked" });
    expect(app.storage.load).not.toHaveBeenCalled();
    expect(app.storage.save).not.toHaveBeenCalled();
  });

  it("checks identity inside the adapter and suppresses a read completed under a stale lease", async () => {
    const app = harness();
    fetchMock.mockResolvedValueOnce(passwordResponse(bearer()));
    await app.controller.signInWithPassword(CREDENTIALS);
    const entered = deferred<Parameters<Storage["load"]>[0]>();
    const result = deferred<Awaited<ReturnType<Storage["load"]>>>();
    app.storage.load.mockImplementationOnce((lease) => { entered.resolve(lease); return result.promise; });
    const pending = app.controller.load(TARGET);
    const lease = await entered.promise;
    app.shared(OTHER_ACCOUNT, false);
    app.shared(SHARED, false);
    expect(app.authority.resolve(lease, TARGET)).toBeNull();
    expect(lease.signal.aborted).toBe(true);
    result.resolve(DRAFT);
    expect(await pending).toEqual({ status: "locked" });
  });

  it.each(["save", "discard"] as const)("reports unknown for a dispatched %s when cross-tab revocation wins", async (operation) => {
    const app = harness();
    fetchMock.mockResolvedValueOnce(passwordResponse(bearer()));
    await app.controller.signInWithPassword(CREDENTIALS);
    const entered = deferred<Parameters<Storage["save"]>[0]>();
    const result = deferred<Awaited<ReturnType<Storage["save"]>>>();
    app.storage[operation].mockImplementationOnce((lease) => { entered.resolve(lease); return result.promise; });
    const pending = operation === "save"
      ? app.controller.save(TARGET, CHECKPOINT, VALUE)
      : app.controller.discard(TARGET, CHECKPOINT);
    const lease = await entered.promise;
    app.channel("revoke");
    expect(lease.signal.aborted).toBe(true);
    result.resolve(COMMITTED);
    expect(await pending).toEqual({ status: "unknown" });
    expect(app.publishRevocation).not.toHaveBeenCalled();
  });

  it("revokes a lease at expiry without waiting for another controller or adapter call", async () => {
    vi.useFakeTimers();
    const app = harness();
    const expiresAt = (Math.floor(Date.now() / 1000) + 2) * 1000;
    fetchMock.mockResolvedValueOnce(passwordResponse(bearer(PRIVATE, "aal1", 2)));
    await app.controller.signInWithPassword(CREDENTIALS);
    expect(await app.controller.load(TARGET)).toEqual(DRAFT);
    const [lease] = app.storage.load.mock.calls[0];
    await vi.advanceTimersByTimeAsync(expiresAt - Date.now());
    expect(lease.signal.aborted).toBe(true);
    expect(app.controller.getStatus()).toBe("locked");
    expect(await app.controller.load(TARGET)).toEqual({ status: "locked" });
    expect(app.verifySession).toHaveBeenCalledTimes(2);
  });

  it("locks on pagehide and BFCache restoration, then requires a fresh sign-in", async () => {
    const app = harness();
    fetchMock.mockResolvedValueOnce(passwordResponse(bearer()));
    await app.controller.signInWithPassword(CREDENTIALS);
    await app.controller.load(TARGET);
    const [lease] = app.storage.load.mock.calls[0];
    app.page("pagehide");
    expect(lease.signal.aborted).toBe(true);
    expect(await app.controller.signInWithPassword(CREDENTIALS)).toEqual({ status: "locked" });
    app.page("pageshow");
    expect(await app.controller.load(TARGET)).toEqual({ status: "locked" });
    expect(fetchMock).toHaveBeenCalledOnce();
    fetchMock.mockResolvedValueOnce(passwordResponse(bearer()));
    expect(await app.controller.signInWithPassword(CREDENTIALS)).toEqual({ status: "unlocked" });
    app.controller.revoke();
    expect(app.publishRevocation).toHaveBeenCalledExactlyOnceWith();
    expect(app.controller.getStatus()).toBe("locked");
  });

  it("fails closed on unavailable observation or channel and unsubscribes on disposal", async () => {
    const app = harness();
    fetchMock.mockResolvedValueOnce(passwordResponse(bearer()));
    await app.controller.signInWithPassword(CREDENTIALS);
    app.readSnapshot.mockImplementationOnce(() => { throw new Error("internal auth error"); });
    expect(await app.controller.load(TARGET)).toEqual({ status: "unavailable" });
    const other = harness();
    other.channel("unavailable");
    expect(await other.controller.signInWithPassword(CREDENTIALS)).toEqual({ status: "unavailable" });
    other.controller.dispose();
    expect(other.unsubscribeShared).toHaveBeenCalledOnce();
    expect(other.unsubscribeChannel).toHaveBeenCalledOnce();
    expect(other.unsubscribePage).toHaveBeenCalledOnce();
  });
});
