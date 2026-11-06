"use client";

import { createRepoFeedbackAuthority } from "../app/components/repo-grades/repoFeedbackIdb";
import { createRepoFeedbackIdbAdapter } from "../app/components/repo-grades/repoFeedbackIdbAdapter";
import { createRepoFeedbackPasswordChallenge } from "./repo-feedback-password";

const MAX_TIMER_DELAY = 2_147_483_647;

type Authority = ReturnType<typeof createRepoFeedbackAuthority>;
type Challenge = Parameters<Authority["admit"]>[0];
type Lease = NonNullable<ReturnType<Authority["admit"]>>;
type Storage = ReturnType<typeof createRepoFeedbackIdbAdapter>;
type Target = Parameters<Storage["load"]>[1];
type Checkpoint = Parameters<Storage["save"]>[2];
type PasswordPort = ReturnType<typeof createRepoFeedbackPasswordChallenge>;
type PasswordDependencies = Parameters<typeof createRepoFeedbackPasswordChallenge>[0];
type PasswordResult = Awaited<ReturnType<PasswordPort["signInWithPassword"]>>;
type Identity = PasswordDependencies["baseline"];
type Snapshot = Readonly<{ epoch: symbol; identity: Identity | null }>;
type Baseline = Snapshot & { identity: Identity };
type Status = "locked" | "unavailable" | "signing_in" | "mfa_required" | "unlocked";
type Failure = { status: "locked" | "unavailable" };
type SignInResult = Failure | { status: "rejected" | "unlocked" } |
  { status: "mfa_required"; factorIds: readonly string[] };
type Scope = {
  baseline: Baseline;
  controller: AbortController;
  port: PasswordPort;
  expiresAt: number;
};
type Attempt = Scope & { phase: "password" | "mfa_required" | "mfa"; challenge: Challenge };
type Admission = Scope & { phase: "unlocked"; identity: Identity; lease: Lease };

/**
 * The passive observer atomically returns identity and an epoch unique to the
 * current shared authorization interval. It updates both before notifying
 * synchronously, including on sign-out, recovery, identity changes, and
 * invalidation back to the same identity. No callback performs shared auth.
 * The lifecycle reports pagehide and restoration before feedback can resume.
 * The channel publishes only a revocation signal and reports channel failure.
 * Activation requires live verification of these ports, provider settings,
 * and session revocation behavior. The exact-bearer verifier must never fall
 * back to cookies, a shared session, or a refreshed credential.
 */
type Dependencies = Pick<PasswordDependencies, "supabaseUrl" | "publicKey" | "verifySession"> & {
  shared: {
    snapshot(): Snapshot;
    subscribe(listener: () => void): () => void;
  };
  channel: {
    subscribe(listener: (event: "revoke" | "unavailable") => void): () => void;
    publishRevocation(): void;
  };
  lifecycle: {
    subscribe(listener: (event: "pagehide" | "pageshow") => void): () => void;
  };
  createStorage?: typeof createRepoFeedbackIdbAdapter;
};

function sameIdentity(first: Identity, second: Identity | null) {
  return second !== null && first.accountId === second.accountId && first.sessionId === second.sessionId;
}

export function createRepoFeedbackPrivateAuth(deps: Dependencies) {
  let state: Attempt | Admission | undefined;
  let proof: { challenge: Challenge; identity: Identity } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unavailable = false;
  let hidden = false;
  let disposed = false;
  const unsubscribe: (() => void)[] = [];
  const authority = createRepoFeedbackAuthority((challenge, candidate) =>
    proof && proof.challenge === challenge && proof === candidate
      ? { account: proof.identity.accountId, session: proof.identity.sessionId }
      : null);
  const storage = (deps.createStorage ?? createRepoFeedbackIdbAdapter)({
    ...authority,
    resolve(lease, target) {
      const current = state;
      if (current?.phase !== "unlocked" || current.lease !== lease || !isCurrent(current)) return null;
      const key = authority.resolve(lease, target);
      return isCurrent(current) ? key : null;
    },
  });

  function lock() {
    const previous = state;
    state = undefined;
    proof = undefined;
    clearTimeout(timer);
    authority.revoke();
    previous?.controller.abort();
    previous?.port.dispose();
  }

  function disable() {
    unavailable = true;
    lock();
  }

  function isCurrent(current: Scope) {
    if (state !== current || current.controller.signal.aborted) return false;
    try {
      const observed = deps.shared.snapshot();
      if (state !== current) return false;
      if (observed.epoch === current.baseline.epoch && sameIdentity(current.baseline.identity, observed.identity) &&
        Date.now() < current.expiresAt) return true;
      lock();
    } catch {
      disable();
    }
    return false;
  }

  function scheduleExpiry(current: Scope) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (isCurrent(current)) scheduleExpiry(current);
    }, Math.min(MAX_TIMER_DELAY, current.expiresAt - Date.now()));
  }

  function releaseSubscriptions() {
    for (const release of unsubscribe.splice(0).reverse()) {
      try {
        release();
      } catch {
        // A failed unsubscribe cannot restore a lease.
      }
    }
  }

  try {
    unsubscribe.push(deps.channel.subscribe((event) => {
      if (event === "revoke") lock();
      else disable();
    }));
    unsubscribe.push(deps.lifecycle.subscribe((event) => {
      hidden = event === "pagehide";
      lock();
    }));
    unsubscribe.push(deps.shared.subscribe(() => {
      if (state) isCurrent(state);
    }));
  } catch {
    disable();
    releaseSubscriptions();
  }

  const blocked = (): Failure => ({ status: unavailable ? "unavailable" : "locked" });

  function getStatus(): Status {
    if (state) isCurrent(state);
    if (unavailable) return "unavailable";
    if (state?.phase === "unlocked" || state?.phase === "mfa_required") return state.phase;
    return state ? "signing_in" : "locked";
  }

  function finish(attempt: Attempt, result: PasswordResult): SignInResult {
    if (!isCurrent(attempt)) return blocked();
    if (result.status === "rejected" && attempt.phase === "mfa") {
      // The port rejects invalid submissions locally before consuming the factor.
      attempt.phase = "mfa_required";
      return { status: "rejected" };
    }
    if (result.status === "mfa_required" && result.expiresAt > Date.now()) {
      attempt.phase = "mfa_required";
      attempt.expiresAt = result.expiresAt;
      scheduleExpiry(attempt);
      return { status: "mfa_required", factorIds: result.factorIds };
    }
    if (result.status === "verified" && result.expiresAt > Date.now() &&
      result.identity.accountId === attempt.baseline.identity.accountId &&
      result.identity.sessionId !== attempt.baseline.identity.sessionId) {
      proof = { challenge: attempt.challenge, identity: result.identity };
      const lease = authority.admit(attempt.challenge, proof);
      proof = undefined;
      if (lease && isCurrent(attempt)) {
        const admission: Admission = {
          ...attempt, phase: "unlocked", identity: result.identity, expiresAt: result.expiresAt, lease,
        };
        state = admission;
        scheduleExpiry(admission);
        return { status: "unlocked" };
      }
    }
    if (!isCurrent(attempt)) return blocked();
    lock();
    return { status: result.status === "rejected" ? "rejected" : "unavailable" };
  }

  async function signInWithPassword(credentials: Parameters<PasswordPort["signInWithPassword"]>[0]): Promise<SignInResult> {
    if (unavailable || hidden || disposed) return blocked();
    lock();
    let observed: Snapshot;
    try {
      observed = deps.shared.snapshot();
    } catch {
      disable();
      return blocked();
    }
    if (!observed.identity || typeof observed.epoch !== "symbol") return blocked();
    const baseline = { epoch: observed.epoch, identity: { ...observed.identity } };
    const controller = new AbortController();
    const port = createRepoFeedbackPasswordChallenge({
      supabaseUrl: deps.supabaseUrl,
      publicKey: deps.publicKey,
      verifySession: deps.verifySession,
      baseline: baseline.identity,
      signal: controller.signal,
      isCurrent: () => state?.controller === controller && isCurrent(state),
    });
    const attempt: Attempt = { phase: "password", challenge: authority.beginSignIn(), controller, baseline, port, expiresAt: Infinity };
    state = attempt;
    try {
      return finish(attempt, await port.signInWithPassword(credentials));
    } catch {
      return finish(attempt, { status: "unavailable" });
    }
  }

  async function verifyTotp(submission: Parameters<PasswordPort["verifyTotp"]>[0]): Promise<SignInResult> {
    const attempt = state;
    if (attempt?.phase !== "mfa_required" || !isCurrent(attempt)) return blocked();
    attempt.phase = "mfa";
    try {
      return finish(attempt, await attempt.port.verifyTotp(submission));
    } catch {
      return finish(attempt, { status: "unavailable" });
    }
  }

  function run<Result>(operation: (lease: Lease) => Promise<Result>): Promise<Result | Failure>;
  function run<Result>(operation: (lease: Lease) => Promise<Result>, mutation: true): Promise<Result | Failure | { status: "unknown" }>;
  async function run<Result>(operation: (lease: Lease) => Promise<Result>, mutation = false): Promise<Result | Failure | { status: "unknown" }> {
    const admission = state;
    if (admission?.phase !== "unlocked" || !isCurrent(admission)) return blocked();
    let started = false;
    try {
      const result = await admission.port.revalidate(admission.controller.signal);
      if (!isCurrent(admission)) return blocked();
      if (result.status !== "verified" || !sameIdentity(admission.identity, result.identity) ||
        result.expiresAt !== admission.expiresAt) {
        lock();
        return { status: "unavailable" };
      }
      started = true;
      const outcome = await operation(admission.lease);
      if (isCurrent(admission)) return outcome;
      return mutation ? { status: "unknown" } : blocked();
    } catch {
      if (mutation && started) return { status: "unknown" };
      return isCurrent(admission) ? { status: "unavailable" } : blocked();
    }
  }

  return {
    getStatus,
    signInWithPassword,
    verifyTotp,
    load: (target: Target) => run((lease) => storage.load(lease, target)),
    save: (target: Target, expected: Checkpoint, value: unknown) => run((lease) => storage.save(lease, target, expected, value), true),
    discard: (target: Target, expected: Checkpoint) => run((lease) => storage.discard(lease, target, expected), true),
    revoke() {
      if (disposed) return;
      lock();
      try {
        deps.channel.publishRevocation();
      } catch {
        disable();
      }
    },
    dispose() {
      disposed = true;
      lock();
      releaseSubscriptions();
    },
  };
}
