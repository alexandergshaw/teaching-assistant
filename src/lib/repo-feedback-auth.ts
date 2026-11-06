import { createRepoFeedbackAuthority } from "../app/components/repo-grades/repoFeedbackIdb";
import { createRepoFeedbackIdbAdapter } from "../app/components/repo-grades/repoFeedbackIdbAdapter";

type Authority = ReturnType<typeof createRepoFeedbackAuthority>;
type Challenge = Parameters<Authority["admit"]>[0];
type Lease = NonNullable<ReturnType<Authority["admit"]>>;
type Storage = ReturnType<typeof createRepoFeedbackIdbAdapter>;
type Target = Parameters<Storage["load"]>[1];
type Checkpoint = Parameters<Storage["save"]>[2];
type Identity = Readonly<{ accountId: string; sessionId: string }>;
type Session = Identity & Readonly<{ accessToken: string; refreshToken: string }>;
type Verification = { status: "verified"; identity: Identity } | { status: "denied" | "unavailable" };
type PasswordResult =
  | { status: "rejected" | "unavailable" }
  | { status: "mfa_required"; identity: Identity }
  | { status: "authenticated"; session: Session };
type MfaResult = Exclude<PasswordResult, { status: "mfa_required" }>;
type PrivateClient = {
  signInWithPassword(credentials: { email: string; password: string }): Promise<PasswordResult>;
  verifyMfa(code: string): Promise<MfaResult>;
  dispose(): void;
};
type SharedEvent =
  | { type: "SIGNED_OUT" | "PASSWORD_RECOVERY" }
  | {
    type: "INITIAL_SESSION" | "SIGNED_IN" | "TOKEN_REFRESHED" | "USER_UPDATED" | "MFA_CHALLENGE_VERIFIED";
    identity: Identity | null;
  };
type Status = "locked" | "unavailable" | "signing_in" | "mfa_required" | "unlocked";
type SignInResult = { status: Exclude<Status, "signing_in"> | "rejected" };
type OperationFailure = { status: "locked" | "unavailable" };
type Attempt = {
  controller: AbortController;
  challenge: Challenge;
  baseline: Identity | null;
  phase: "password" | "mfa_required" | "mfa" | "verify" | "install";
  identity?: Identity;
  client?: PrivateClient;
};
type Admission = { controller: AbortController; identity: Identity; lease: Lease };

/**
 * Trusted ports for the dark controller. Create an isolated, memory-only
 * password client per attempt. It must resolve required MFA against its own
 * password session and must not restore, refresh, persist, or publish sessions.
 * Dispose releases local resources without signing out the shared session.
 *
 * Shared auth events must report changes synchronously to subscribers.
 * Shared installation must honor cancellation before publishing credentials,
 * including while queued. A provider unable to guarantee this must leave
 * the controller unavailable. Readback returns the current shared session.
 * Transport failures throw or report unavailable. Keep credentials inside
 * these ports and send only a revocation signal across tabs.
 */
type Dependencies = {
  createPrivateClient(signal: AbortSignal): PrivateClient;
  verifySession(accessToken: string, signal: AbortSignal): Promise<Verification>;
  shared: {
    subscribe(listener: (event: SharedEvent) => void): () => void;
    installSession(session: Session, signal: AbortSignal): Promise<Identity | null>;
    readSession(signal: AbortSignal): Promise<Session | null>;
    // Bound the remote request. Settle only when no late write to shared auth can follow.
    signOut(): Promise<boolean>;
  };
  channel: {
    subscribe(listener: (event: "revoke" | "unavailable") => void): () => void;
    publishRevocation(): void;
  };
  lifecycle: {
    // Report pagehide and persisted pageshow (BFCache restoration).
    subscribe(listener: (event: "pagehide" | "pageshow") => void): () => void;
  };
  createAuthority?: typeof createRepoFeedbackAuthority;
  createStorage?: (authority: Authority) => Storage;
};

function sameIdentity(first: Identity | null | undefined, second: Identity | null | undefined) {
  return first && second
    ? first.accountId === second.accountId && first.sessionId === second.sessionId
    : first === second;
}

function copyIdentity(identity: Identity): Identity {
  return { accountId: identity.accountId, sessionId: identity.sessionId };
}

function validIdentity(identity: Identity | null | undefined): identity is Identity {
  return typeof identity?.accountId === "string" && identity.accountId.length > 0 &&
    typeof identity.sessionId === "string" && identity.sessionId.length > 0;
}

function validSession(session: Session | null): session is Session {
  return validIdentity(session) && typeof session.accessToken === "string" && session.accessToken.length > 0 &&
    typeof session.refreshToken === "string" && session.refreshToken.length > 0;
}

export function createRepoFeedbackAuth(deps: Dependencies) {
  let attempt: Attempt | undefined;
  let admitted: Admission | undefined;
  let proof: { challenge: Challenge; token: symbol; identity: Identity } | undefined;
  let sharedIdentity: Identity | null = null;
  let unavailable = false;
  let hidden = false;
  let disposed = false;
  let signingOut = false;
  const unsubscribe: (() => void)[] = [];
  const authority = (deps.createAuthority ?? createRepoFeedbackAuthority)((challenge, token) =>
    proof && proof.challenge === challenge && proof.token === token
      ? { account: proof.identity.accountId, session: proof.identity.sessionId }
      : null);
  const storage = (deps.createStorage ?? createRepoFeedbackIdbAdapter)(authority);

  function disposePrivate(current: Attempt) {
    const client = current.client;
    current.client = undefined;
    try {
      client?.dispose();
    } catch {
      // Cleanup never exposes SDK errors.
    }
  }

  function lock() {
    const pending = attempt;
    const previous = admitted;
    attempt = undefined;
    admitted = undefined;
    proof = undefined;
    authority.revoke();
    previous?.controller.abort();
    if (pending) {
      pending.controller.abort();
      disposePrivate(pending);
    }
  }

  function getStatus(): Status {
    if (unavailable) return "unavailable";
    if (admitted) return "unlocked";
    if (attempt?.phase === "mfa_required") return "mfa_required";
    return attempt ? "signing_in" : "locked";
  }

  function onSharedEvent(event: SharedEvent) {
    if (event.type === "SIGNED_OUT" || event.type === "PASSWORD_RECOVERY") {
      sharedIdentity = null;
      lock();
      return;
    }
    if (!("identity" in event)) {
      lock();
      return;
    }
    sharedIdentity = validIdentity(event.identity) ? copyIdentity(event.identity) : null;
    if (attempt) {
      const expected = attempt.phase === "install" ? attempt.identity : attempt.baseline;
      if (!sameIdentity(sharedIdentity, expected)) lock();
    } else if (admitted && !sameIdentity(sharedIdentity, admitted.identity)) {
      lock();
    }
  }

  function disable() {
    unavailable = true;
    lock();
  }

  function releaseSubscriptions() {
    for (const release of unsubscribe.splice(0).reverse()) {
      try {
        release();
      } catch {
        // A failed unsubscribe cannot make the controller usable.
      }
    }
  }

  try {
    unsubscribe.push(deps.channel.subscribe((event) => {
      if (event === "unavailable") disable();
      else lock();
    }));
    unsubscribe.push(deps.lifecycle.subscribe((event) => {
      hidden = event === "pagehide";
      lock();
    }));
    unsubscribe.push(deps.shared.subscribe(onSharedEvent));
  } catch {
    disable();
    releaseSubscriptions();
  }

  const isAttempt = (current: Attempt) => attempt === current && !current.controller.signal.aborted;
  const isAdmission = (current: Admission) => admitted === current &&
    !current.controller.signal.aborted && !current.lease.signal.aborted;
  const blocked = (): OperationFailure => ({ status: unavailable ? "unavailable" : "locked" });

  function fail(current: Attempt, status: "locked" | "rejected" | "unavailable"): SignInResult {
    if (!isAttempt(current)) return blocked();
    lock();
    return { status };
  }

  async function finishSignIn(current: Attempt, session: Session): Promise<SignInResult> {
    if (!validSession(session) || (current.identity && !sameIdentity(current.identity, session))) {
      return fail(current, "rejected");
    }
    const candidate = {
      ...copyIdentity(session), accessToken: session.accessToken, refreshToken: session.refreshToken,
    };
    const signal = current.controller.signal;
    current.identity = copyIdentity(candidate);
    current.phase = "verify";
    const verification = await deps.verifySession(candidate.accessToken, signal);
    if (!isAttempt(current)) return blocked();
    if (verification.status === "unavailable") return fail(current, "unavailable");
    if (verification.status !== "verified" || !sameIdentity(candidate, verification.identity)) {
      return fail(current, "rejected");
    }

    current.phase = "install";
    const installed = await deps.shared.installSession(candidate, signal);
    if (!isAttempt(current)) return blocked();
    if (!installed) return fail(current, "unavailable");
    if (!sameIdentity(current.identity, installed)) return fail(current, "locked");
    const readback = await deps.shared.readSession(signal);
    if (!isAttempt(current)) return blocked();
    if (!validSession(readback) || !sameIdentity(current.identity, readback)) return fail(current, "locked");

    disposePrivate(current);
    if (!isAttempt(current)) return blocked();
    proof = { challenge: current.challenge, token: Symbol(), identity: current.identity };
    const lease = authority.admit(current.challenge, proof.token);
    proof = undefined;
    if (!isAttempt(current)) return blocked();
    if (!lease) return fail(current, "unavailable");
    attempt = undefined;
    sharedIdentity = current.identity;
    admitted = { controller: current.controller, identity: current.identity, lease };
    return { status: "unlocked" };
  }

  async function signInWithPassword(credentials: { email: string; password: string }): Promise<SignInResult> {
    if (unavailable || hidden || disposed || signingOut) return blocked();
    lock();
    const current: Attempt = {
      controller: new AbortController(),
      challenge: authority.beginSignIn(),
      baseline: sharedIdentity,
      phase: "password",
    };
    attempt = current;
    try {
      current.client = deps.createPrivateClient(current.controller.signal);
      if (!isAttempt(current)) {
        disposePrivate(current);
        return blocked();
      }
      const result = await current.client.signInWithPassword(credentials);
      if (!isAttempt(current)) return blocked();
      if (result.status === "mfa_required") {
        if (!validIdentity(result.identity)) return fail(current, "rejected");
        current.identity = copyIdentity(result.identity);
        current.phase = "mfa_required";
        return { status: "mfa_required" };
      }
      if (result.status === "authenticated") return await finishSignIn(current, result.session);
      return fail(current, result.status);
    } catch {
      return fail(current, "unavailable");
    }
  }

  async function verifyMfa(code: string): Promise<SignInResult> {
    const current = attempt;
    if (current?.phase !== "mfa_required" || !current.client) return blocked();
    current.phase = "mfa";
    try {
      const result = await current.client.verifyMfa(code);
      if (!isAttempt(current)) return blocked();
      if (result.status === "authenticated") return await finishSignIn(current, result.session);
      return fail(current, result.status);
    } catch {
      return fail(current, "unavailable");
    }
  }

  async function signOut(): Promise<{ status: "signed_out" | "unavailable" }> {
    if (disposed || signingOut) return { status: "unavailable" };
    signingOut = true;
    try {
      lock();
      try {
        deps.channel.publishRevocation();
      } catch {
        disable();
      }
      const remoteConfirmed = await deps.shared.signOut();
      return { status: remoteConfirmed && !unavailable ? "signed_out" : "unavailable" };
    } catch {
      return { status: "unavailable" };
    } finally {
      signingOut = false;
    }
  }

  async function readShared(current: Admission) {
    const session = await deps.shared.readSession(current.controller.signal);
    if (!isAdmission(current)) return null;
    if (!validSession(session) || !sameIdentity(current.identity, session)) {
      lock();
      return null;
    }
    return session;
  }

  function withVerifiedSession<Result extends { status: string }>(
    operation: (lease: Lease) => Promise<Result>,
  ): Promise<Result | OperationFailure>;
  function withVerifiedSession<Result extends { status: string }>(
    operation: (lease: Lease) => Promise<Result>,
    mutation: true,
  ): Promise<Result | OperationFailure | { status: "unknown" }>;
  async function withVerifiedSession<Result extends { status: string }>(
    operation: (lease: Lease) => Promise<Result>,
    mutation = false,
  ): Promise<Result | OperationFailure | { status: "unknown" }> {
    const current = admitted;
    if (!current || !isAdmission(current)) return blocked();
    let started = false;
    try {
      const session = await readShared(current);
      if (!session || !isAdmission(current)) return blocked();
      const token = session.accessToken;
      const verification = await deps.verifySession(token, current.controller.signal);
      if (!isAdmission(current)) return blocked();
      if (verification.status === "unavailable") return { status: "unavailable" };
      if (verification.status !== "verified" || !sameIdentity(current.identity, verification.identity)) {
        lock();
        return blocked();
      }
      const confirmed = await readShared(current);
      if (!confirmed || !isAdmission(current)) return blocked();
      if (confirmed.accessToken !== token) return { status: "unavailable" };
      started = true;
      const result = await operation(current.lease);
      if (isAdmission(current) && await readShared(current) && isAdmission(current)) return result;
      return mutation ? { status: "unknown" } : blocked();
    } catch {
      if (started && mutation) return { status: "unknown" };
      return isAdmission(current) ? { status: "unavailable" } : blocked();
    }
  }

  return {
    getStatus,
    signInWithPassword,
    verifyMfa,
    signOut,
    load: (target: Target) => withVerifiedSession((lease) => storage.load(lease, target)),
    save: (target: Target, expected: Checkpoint, value: unknown) =>
      withVerifiedSession((lease) => storage.save(lease, target, expected, value), true),
    discard: (target: Target, expected: Checkpoint) =>
      withVerifiedSession((lease) => storage.discard(lease, target, expected), true),
    dispose() {
      disposed = true;
      lock();
      releaseSubscriptions();
    },
  };
}
