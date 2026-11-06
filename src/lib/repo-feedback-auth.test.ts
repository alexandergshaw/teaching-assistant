import { describe, expect, it, vi } from "vitest";
import { createRepoFeedbackAuth } from "./repo-feedback-auth";

type Dependencies = Parameters<typeof createRepoFeedbackAuth>[0];
type SharedEvent = Parameters<Parameters<Dependencies["shared"]["subscribe"]>[0]>[0];
type PrivateClient = ReturnType<Dependencies["createPrivateClient"]>;
type Storage = ReturnType<NonNullable<Dependencies["createStorage"]>>;
const identity = { accountId: "account-a", sessionId: "session-fresh" };
const session = { ...identity, accessToken: "access-secret", refreshToken: "refresh-secret" };
const restored = { ...session, sessionId: "session-restored", accessToken: "old-token" };
const refreshed = { ...session, accessToken: "refreshed-token", refreshToken: "refreshed-secret" };
const credentials = { email: "test@example.test", password: "password-secret" };
const target = { kind: "current", course: "course-a" } as const;
const checkpoint = { revision: 0 };
const saved = { status: "saved", revision: 0, checkpoint, value: [] } as const;
const authenticated = { status: "authenticated", session } as const;
const verified = { status: "verified", identity } as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
}

function setup({ failChannel = false } = {}) {
  let sharedSession: typeof session | null = restored;
  let onShared: ((event: SharedEvent) => void) | undefined;
  let onChannel: Parameters<Dependencies["channel"]["subscribe"]>[0] | undefined;
  let onLifecycle: Parameters<Dependencies["lifecycle"]["subscribe"]>[0] | undefined;
  const emitShared = (event: SharedEvent) => onShared?.(event);
  const emitChannel = (event: "revoke" | "unavailable") => onChannel?.(event);
  const emitLifecycle = (event: "pagehide" | "pageshow") => onLifecycle?.(event);
  const replaceShared = (value: typeof sharedSession) => { sharedSession = value; };
  const privateClient = {
    signInWithPassword: vi.fn<PrivateClient["signInWithPassword"]>().mockResolvedValue(authenticated),
    verifyMfa: vi.fn<PrivateClient["verifyMfa"]>().mockResolvedValue(authenticated),
    dispose: vi.fn(),
  };
  const storage = {
    load: vi.fn<Storage["load"]>().mockResolvedValue(saved),
    save: vi.fn<Storage["save"]>().mockResolvedValue({ status: "committed", checkpoint }),
    discard: vi.fn<Storage["discard"]>().mockResolvedValue({ status: "committed", checkpoint }),
  };
  const deps = {
    createPrivateClient: vi.fn<Dependencies["createPrivateClient"]>().mockReturnValue(privateClient),
    verifySession: vi.fn<Dependencies["verifySession"]>().mockResolvedValue(verified),
    createStorage: () => storage,
    shared: {
      subscribe: vi.fn<Dependencies["shared"]["subscribe"]>((listener) => {
        onShared = listener;
        listener({ type: "INITIAL_SESSION", identity: sharedSession });
        return () => { onShared = undefined; };
      }),
      installSession: vi.fn<Dependencies["shared"]["installSession"]>(async (candidate) => {
        sharedSession = candidate;
        emitShared({ type: "SIGNED_IN", identity: candidate });
        return candidate;
      }),
      readSession: vi.fn<Dependencies["shared"]["readSession"]>(async () => sharedSession),
      signOut: vi.fn<Dependencies["shared"]["signOut"]>().mockResolvedValue(true),
    },
    channel: {
      subscribe: vi.fn<Dependencies["channel"]["subscribe"]>((listener) => {
        if (failChannel) throw new Error("BroadcastChannel unavailable");
        onChannel = listener;
        return () => { onChannel = undefined; };
      }),
      publishRevocation: vi.fn(),
    },
    lifecycle: {
      subscribe: vi.fn<Dependencies["lifecycle"]["subscribe"]>((listener) => {
        onLifecycle = listener;
        return () => { onLifecycle = undefined; };
      }),
    },
  };
  const auth = createRepoFeedbackAuth(deps);
  return { auth, deps, privateClient, storage, emitShared, emitChannel, emitLifecycle, replaceShared };
}

describe("dark repo feedback auth controller", () => {
  it("starts every instance locked without calling a remote auth or storage port", async () => {
    const { auth, deps, storage, emitShared } = setup();
    for (const type of ["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED", "MFA_CHALLENGE_VERIFIED"] as const) {
      emitShared({ type, identity });
      expect(auth.getStatus()).toBe("locked");
    }
    expect(await auth.verifyMfa("000000")).toEqual({ status: "locked" });
    expect(await auth.load(target)).toEqual({ status: "locked" });
    expect(await auth.save(target, checkpoint, [])).toEqual({ status: "locked" });
    expect(await auth.discard(target, checkpoint)).toEqual({ status: "locked" });
    expect(deps.createPrivateClient).not.toHaveBeenCalled();
    expect(deps.verifySession).not.toHaveBeenCalled();
    expect(deps.shared.readSession).not.toHaveBeenCalled();
    expect(deps.shared.installSession).not.toHaveBeenCalled();
    expect(storage.load).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
    expect(storage.discard).not.toHaveBeenCalled();
    expect(Object.keys(auth).sort()).toEqual([
      "discard", "dispose", "getStatus", "load", "save", "signInWithPassword", "signOut", "verifyMfa",
    ]);
  });

  it("admits a fresh password result despite same-session events arriving inside installation", async () => {
    const { auth, deps, privateClient, storage, emitShared, replaceShared } = setup();
    expect(await auth.signInWithPassword(credentials)).toEqual({ status: "unlocked" });
    expect(privateClient.dispose).toHaveBeenCalledOnce();
    expect(deps.verifySession).toHaveBeenNthCalledWith(1, session.accessToken, expect.any(AbortSignal));
    expect(deps.shared.installSession).toHaveBeenCalledWith(session, expect.any(AbortSignal));
    expect(await auth.load(target)).toEqual(saved);
    replaceShared(refreshed);
    emitShared({ type: "TOKEN_REFRESHED", identity });
    expect(await auth.save(target, checkpoint, [])).toEqual({ status: "committed", checkpoint });
    expect(await auth.discard(target, checkpoint)).toEqual({ status: "committed", checkpoint });
    expect(deps.verifySession.mock.calls.map(([token]) => token)).toEqual([
      session.accessToken, session.accessToken, refreshed.accessToken, refreshed.accessToken,
    ]);
    expect(storage.load).toHaveBeenCalledOnce();
    expect(storage.save).toHaveBeenCalledOnce();
    expect(storage.discard).toHaveBeenCalledOnce();
  });

  it("requires private MFA and binds its successful result to the original password session", async () => {
    const { auth, deps, privateClient, emitShared } = setup();
    privateClient.signInWithPassword.mockResolvedValue({ status: "mfa_required", identity });
    expect(await auth.signInWithPassword(credentials)).toEqual({ status: "mfa_required" });
    emitShared({ type: "MFA_CHALLENGE_VERIFIED", identity: restored });
    expect(auth.getStatus()).toBe("mfa_required");
    expect(await auth.load(target)).toEqual({ status: "locked" });
    expect(deps.verifySession).not.toHaveBeenCalled();
    expect(deps.shared.installSession).not.toHaveBeenCalled();
    expect(await auth.verifyMfa("123456")).toEqual({ status: "unlocked" });
    expect(privateClient.verifyMfa).toHaveBeenCalledWith("123456");

    expect(await auth.signInWithPassword(credentials)).toEqual({ status: "mfa_required" });
    privateClient.verifyMfa.mockResolvedValue({ status: "authenticated", session: restored });
    expect(await auth.verifyMfa("123456")).toEqual({ status: "rejected" });
    expect(auth.getStatus()).toBe("locked");
    expect(deps.shared.installSession).toHaveBeenCalledOnce();
  });

  it("never publishes a late password result from a superseded attempt", async () => {
    const { auth, deps, privateClient } = setup();
    const late = deferred<typeof authenticated>();
    privateClient.signInWithPassword.mockReturnValueOnce(late.promise);
    const stale = auth.signInWithPassword(credentials);
    expect(await auth.signInWithPassword(credentials)).toEqual({ status: "unlocked" });
    const staleSignal = deps.createPrivateClient.mock.calls[0][0];
    expect(staleSignal.aborted).toBe(true);
    late.resolve(authenticated);
    expect(await stale).toEqual({ status: "locked" });
    expect(auth.getStatus()).toBe("unlocked");
    expect(deps.shared.installSession).toHaveBeenCalledOnce();
  });

  it("aborts late MFA after recovery and blocks concurrent MFA submissions", async () => {
    const { auth, deps, privateClient, emitShared } = setup();
    const late = deferred<typeof authenticated>();
    privateClient.signInWithPassword.mockResolvedValue({ status: "mfa_required", identity });
    privateClient.verifyMfa.mockReturnValue(late.promise);
    expect(await auth.signInWithPassword(credentials)).toEqual({ status: "mfa_required" });
    const pending = auth.verifyMfa("123456");
    expect(await auth.verifyMfa("123456")).toEqual({ status: "locked" });
    emitShared({ type: "PASSWORD_RECOVERY" });
    expect(deps.createPrivateClient.mock.calls[0][0].aborted).toBe(true);
    late.resolve(authenticated);
    expect(await pending).toEqual({ status: "locked" });
    expect(deps.shared.installSession).not.toHaveBeenCalled();
  });

  it("aborts late server verification after logout without installing the private session", async () => {
    const { auth, deps, emitShared } = setup();
    const late = deferred<typeof verified>();
    deps.verifySession.mockReturnValue(late.promise);
    const pending = auth.signInWithPassword(credentials);
    await vi.waitFor(() => expect(deps.verifySession).toHaveBeenCalledOnce());
    emitShared({ type: "SIGNED_OUT" });
    expect(deps.verifySession.mock.calls[0][1].aborted).toBe(true);
    late.resolve(verified);
    expect(await pending).toEqual({ status: "locked" });
    expect(deps.shared.installSession).not.toHaveBeenCalled();
  });

  it("ignores an installation result after a competing shared session event", async () => {
    const { auth, deps, emitShared } = setup();
    const late = deferred<typeof identity>();
    deps.shared.installSession.mockImplementationOnce(() => {
      emitShared({ type: "SIGNED_IN", identity });
      emitShared({ type: "TOKEN_REFRESHED", identity: restored });
      return late.promise;
    });
    const pending = auth.signInWithPassword(credentials);
    await vi.waitFor(() => expect(deps.shared.installSession).toHaveBeenCalledOnce());
    expect(deps.shared.installSession.mock.calls[0][1].aborted).toBe(true);
    late.resolve(identity);
    expect(await pending).toEqual({ status: "locked" });
    expect(deps.shared.readSession).not.toHaveBeenCalled();
  });

  it.each([
    { accountId: "different-account", sessionId: identity.sessionId },
    { accountId: identity.accountId, sessionId: "different-session" },
  ])("requires both account and session from the server, installation, and shared readback", async (other) => {
    const { auth, deps, storage } = setup();
    deps.verifySession.mockResolvedValueOnce({ status: "verified", identity: other });
    expect(await auth.signInWithPassword(credentials)).toEqual({ status: "rejected" });
    expect(deps.shared.installSession).not.toHaveBeenCalled();

    deps.shared.installSession.mockResolvedValueOnce(other);
    expect(await auth.signInWithPassword(credentials)).toEqual({ status: "locked" });
    expect(deps.shared.readSession).not.toHaveBeenCalled();

    deps.shared.readSession.mockResolvedValueOnce({ ...session, ...other });
    expect(await auth.signInWithPassword(credentials)).toEqual({ status: "locked" });
    expect(await auth.load(target)).toEqual({ status: "locked" });
    expect(storage.load).not.toHaveBeenCalled();
  });

  it("blocks transient verification failures without clearing drafts or invalidating checkpoints", async () => {
    const { auth, deps, storage } = setup();
    expect(await auth.signInWithPassword(credentials)).toEqual({ status: "unlocked" });
    expect(await auth.load(target)).toEqual(saved);
    deps.verifySession.mockRejectedValueOnce(new Error("private access-secret upstream error"));
    expect(await auth.save(target, checkpoint, [])).toEqual({ status: "unavailable" });
    deps.verifySession.mockResolvedValueOnce({ status: "unavailable" });
    expect(await auth.discard(target, checkpoint)).toEqual({ status: "unavailable" });
    expect(storage.save).not.toHaveBeenCalled();
    expect(storage.discard).not.toHaveBeenCalled();
    expect(auth.getStatus()).toBe("unlocked");
    expect(await auth.save(target, checkpoint, [])).toEqual({ status: "committed", checkpoint });
  });

  it("locks on definitive denial and keeps credentials and error details outside public state", async () => {
    const { auth, deps, privateClient, storage } = setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      privateClient.signInWithPassword.mockRejectedValueOnce(new Error(credentials.password));
      expect(await auth.signInWithPassword(credentials)).toEqual({ status: "unavailable" });
      expect(deps.shared.installSession).not.toHaveBeenCalled();
      expect(deps.shared.signOut).not.toHaveBeenCalled();
      expect(await auth.signInWithPassword(credentials)).toEqual({ status: "unlocked" });
      deps.verifySession.mockResolvedValueOnce({ status: "denied" });
      expect(await auth.load(target)).toEqual({ status: "locked" });
      expect(auth.getStatus()).toBe("locked");
      expect(storage.load).not.toHaveBeenCalled();
      expect(JSON.stringify(auth)).toBe("{}");
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
      consoleLog.mockRestore();
    }
  });

  it("rejects verification for a token rotated before the operation and accepts the next verified token", async () => {
    const { auth, deps, storage, replaceShared, emitShared } = setup();
    expect(await auth.signInWithPassword(credentials)).toEqual({ status: "unlocked" });
    deps.verifySession.mockImplementationOnce(async () => {
      replaceShared(refreshed);
      emitShared({ type: "TOKEN_REFRESHED", identity });
      return verified;
    });
    expect(await auth.load(target)).toEqual({ status: "unavailable" });
    expect(storage.load).not.toHaveBeenCalled();
    expect(await auth.load(target)).toEqual(saved);
    expect(deps.verifySession).toHaveBeenLastCalledWith(refreshed.accessToken, expect.any(AbortSignal));
  });

  it("withholds an in-flight read after pagehide and locks when restored from BFCache", async () => {
    const { auth, storage, emitLifecycle } = setup();
    expect(await auth.signInWithPassword(credentials)).toEqual({ status: "unlocked" });
    const late = deferred<typeof saved>();
    storage.load.mockReturnValueOnce(late.promise);
    const pending = auth.load(target);
    await vi.waitFor(() => expect(storage.load).toHaveBeenCalledOnce());
    emitLifecycle("pagehide");
    expect(storage.load.mock.calls[0][0].signal.aborted).toBe(true);
    expect(await auth.signInWithPassword(credentials)).toEqual({ status: "locked" });
    emitLifecycle("pageshow");
    late.resolve(saved);
    expect(await pending).toEqual({ status: "locked" });
    expect(await auth.load(target)).toEqual({ status: "locked" });
  });

  it("rechecks a silently switched shared account before returning an operation result", async () => {
    const { auth, storage, replaceShared } = setup();
    expect(await auth.signInWithPassword(credentials)).toEqual({ status: "unlocked" });
    storage.load.mockImplementationOnce(async () => {
      replaceShared({ ...session, accountId: "different-account" });
      return saved;
    });
    expect(await auth.load(target)).toEqual({ status: "locked" });
    expect(storage.load.mock.calls[0][0].signal.aborted).toBe(true);
  });

  it("suppresses a possibly committed mutation if a session switch invalidates its result", async () => {
    const { auth, storage, emitShared } = setup();
    expect(await auth.signInWithPassword(credentials)).toEqual({ status: "unlocked" });
    storage.save.mockImplementationOnce(async () => {
      emitShared({ type: "SIGNED_IN", identity: restored });
      return { status: "committed", checkpoint };
    });
    expect(await auth.save(target, checkpoint, [])).toEqual({ status: "unknown" });
    expect(storage.save.mock.calls[0][0].signal.aborted).toBe(true);
  });

  it("revokes locally and publishes a credential-free peer signal before calling remote sign-out", async () => {
    const local = setup();
    const peer = setup();
    expect(await local.auth.signInWithPassword(credentials)).toEqual({ status: "unlocked" });
    expect(await peer.auth.signInWithPassword(credentials)).toEqual({ status: "unlocked" });
    await peer.auth.load(target);
    const lease = peer.storage.load.mock.calls[0][0];
    local.deps.channel.publishRevocation.mockImplementation(() => {
      expect(local.auth.getStatus()).toBe("locked");
      peer.emitChannel("revoke");
    });
    const remote = deferred<boolean>();
    local.deps.shared.signOut.mockImplementation(() => {
      expect(peer.auth.getStatus()).toBe("locked");
      expect(lease.signal.aborted).toBe(true);
      return remote.promise;
    });
    const pending = local.auth.signOut();
    expect(await local.auth.signInWithPassword(credentials)).toEqual({ status: "locked" });
    expect(local.deps.channel.publishRevocation).toHaveBeenCalledExactlyOnceWith();
    remote.resolve(true);
    expect(await pending).toEqual({ status: "signed_out" });
    expect(local.auth.getStatus()).toBe("locked");
    expect(peer.auth.getStatus()).toBe("locked");
  });

  it("fails closed when the channel is missing or fails during use and still attempts remote sign-out", async () => {
    const missing = setup({ failChannel: true });
    expect(await missing.auth.signInWithPassword(credentials)).toEqual({ status: "unavailable" });
    expect(missing.deps.createPrivateClient).not.toHaveBeenCalled();
    expect(await missing.auth.signOut()).toEqual({ status: "unavailable" });
    expect(missing.deps.shared.signOut).toHaveBeenCalledOnce();

    const failed = setup();
    expect(await failed.auth.signInWithPassword(credentials)).toEqual({ status: "unlocked" });
    failed.emitChannel("unavailable");
    expect(await failed.auth.load(target)).toEqual({ status: "unavailable" });
    expect(await failed.auth.signOut()).toEqual({ status: "unavailable" });
    expect(failed.deps.shared.signOut).toHaveBeenCalledOnce();
  });

  it("attempts remote sign-out so a peer can receive shared logout even when broadcast fails", async () => {
    const local = setup();
    const peer = setup();
    expect(await local.auth.signInWithPassword(credentials)).toEqual({ status: "unlocked" });
    expect(await peer.auth.signInWithPassword(credentials)).toEqual({ status: "unlocked" });
    await peer.auth.load(target);
    const lease = peer.storage.load.mock.calls[0][0];
    local.deps.channel.publishRevocation.mockImplementation(() => {
      expect(local.auth.getStatus()).toBe("locked");
      throw new Error("closed");
    });
    local.deps.shared.signOut.mockImplementation(async () => {
      expect(local.deps.channel.publishRevocation).toHaveBeenCalledOnce();
      expect(peer.auth.getStatus()).toBe("unlocked");
      peer.emitShared({ type: "SIGNED_OUT" });
      return true;
    });
    expect(await local.auth.signOut()).toEqual({ status: "unavailable" });
    expect(local.deps.shared.signOut).toHaveBeenCalledOnce();
    expect(local.auth.getStatus()).toBe("unavailable");
    expect(peer.auth.getStatus()).toBe("locked");
    expect(lease.signal.aborted).toBe(true);
  });

  it.each([
    { name: "an unconfirmed response", signOut: async () => false },
    { name: "an error", signOut: () => { throw new Error("private upstream error"); } },
    { name: "a timeout", signOut: async () => { throw new DOMException("private timeout", "TimeoutError"); } },
  ])("keeps both leases revoked after $name from remote sign-out", async ({ signOut }) => {
    const local = setup();
    const peer = setup();
    expect(await local.auth.signInWithPassword(credentials)).toEqual({ status: "unlocked" });
    expect(await peer.auth.signInWithPassword(credentials)).toEqual({ status: "unlocked" });
    local.deps.channel.publishRevocation.mockImplementation(() => { peer.emitChannel("revoke"); });
    local.deps.shared.signOut.mockImplementation(signOut);
    expect(await local.auth.signOut()).toEqual({ status: "unavailable" });
    expect(await local.auth.load(target)).toEqual({ status: "locked" });
    expect(await peer.auth.load(target)).toEqual({ status: "locked" });
  });

  it("disposes subscriptions and revokes permanently for the instance", async () => {
    const { auth, deps, storage } = setup();
    expect(await auth.signInWithPassword(credentials)).toEqual({ status: "unlocked" });
    await auth.load(target);
    auth.dispose();
    expect(storage.load.mock.calls[0][0].signal.aborted).toBe(true);
    expect(await auth.signInWithPassword(credentials)).toEqual({ status: "locked" });
    expect(await auth.load(target)).toEqual({ status: "locked" });
    expect(deps.createPrivateClient).toHaveBeenCalledOnce();
  });
});
