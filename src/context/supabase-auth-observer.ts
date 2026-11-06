import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const MAX_JWT_LENGTH = 8_185;
const MAX_TIMER_DELAY = 2_147_483_647;
const JWT = /^[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

type ObservedSession = Pick<Session, "access_token"> & { user: Pick<Session["user"], "id"> };
type Identity = Readonly<{ accountId: string; sessionId: string }>;
type Snapshot = Readonly<{ epoch: symbol; identity: Identity | null }>;

export type SupabaseAuthObserver = {
  snapshot(): Snapshot;
  subscribe(listener: () => void): () => void;
};

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length === 36 && UUID.test(value) && value !== NIL_UUID;
}

// Unverified claims only track continuity of the existing provider session.
// Authorization and verification of a private session are separate boundaries.
function readContinuity(session: ObservedSession | null) {
  const token = session?.access_token;
  if (typeof token !== "string" || token.length > MAX_JWT_LENGTH) return null;
  const match = JWT.exec(token);
  if (!match || match[0] !== token) return null;

  try {
    const binary = atob(match[1].replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return null;

    const { sub, session_id: sessionId, exp } = claims as Record<string, unknown>;
    if (!isId(sub) || sub !== session?.user?.id || !isId(sessionId) ||
      typeof exp !== "number" || !Number.isSafeInteger(exp)) return null;

    const expiresAt = exp * 1_000;
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return null;
    return { identity: Object.freeze({ accountId: sub, sessionId }), expiresAt };
  } catch {
    return null;
  }
}

export function createSupabaseAuthObserver() {
  const listeners = new Set<() => void>();
  let current: Snapshot = Object.freeze({ epoch: Symbol(), identity: null });
  let active: symbol | undefined;
  let expiresAt: number | undefined;
  let cancelExpiry: (() => void) | undefined;

  function publish(identity: Identity | null) {
    current = Object.freeze({ epoch: Symbol(), identity });
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue;
      try {
        listener();
      } catch {
        // A consumer must not break delivery to other listeners or the provider.
      }
    }
  }

  function invalidate() {
    cancelExpiry?.();
    cancelExpiry = undefined;
    expiresAt = undefined;
    publish(null);
  }

  function expire() {
    if (expiresAt !== undefined && expiresAt <= Date.now()) invalidate();
  }

  function scheduleExpiry(deadline: number) {
    cancelExpiry?.();
    expiresAt = deadline;
    const timer = setTimeout(() => {
      if (cancelExpiry !== cancel) return;
      if (deadline <= Date.now()) expire();
      else scheduleExpiry(deadline);
    }, Math.min(MAX_TIMER_DELAY, Math.max(0, deadline - Date.now())));
    function cancel() { clearTimeout(timer); }
    cancelExpiry = cancel;
  }

  const port: SupabaseAuthObserver = {
    snapshot() {
      expire();
      return current;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };

  function begin() {
    const lifetime = Symbol();
    let initialized = false;
    let generation = 0;
    active = lifetime;
    invalidate();

    const isActive = () => active === lifetime;

    function accept(event: AuthChangeEvent | "BOOTSTRAP" | "BOOTSTRAP_FAILED", session: ObservedSession | null) {
      if (!isActive()) return false;
      const previousGeneration = generation;
      expire();
      if (!isActive() || previousGeneration !== generation) return false;
      if (initialized && (event === "INITIAL_SESSION" || event === "BOOTSTRAP" ||
        event === "BOOTSTRAP_FAILED")) return false;

      // A failed bootstrap settles no session. The SDK's initial callback
      // can still initialize this lifetime unless a live event has won.
      if (event !== "BOOTSTRAP_FAILED") initialized = true;
      const acceptedGeneration = ++generation;
      const continuity = event === "SIGNED_OUT" ? null : readContinuity(session);
      if (continuity) {
        const { identity, expiresAt } = continuity;
        scheduleExpiry(expiresAt);
        if (event === "PASSWORD_RECOVERY" || current.identity?.accountId !== identity.accountId ||
          current.identity.sessionId !== identity.sessionId) publish(identity);
      } else {
        invalidate();
      }
      return isActive() && generation === acceptedGeneration;
    }

    return {
      isActive,
      onEvent: (event: AuthChangeEvent, session: ObservedSession | null) => accept(event, session),
      onBootstrap: (session: ObservedSession | null) => accept("BOOTSTRAP", session),
      onBootstrapFailure: () => accept("BOOTSTRAP_FAILED", null),
      close() {
        if (!isActive()) return;
        active = undefined;
        invalidate();
      },
    };
  }

  return { port, begin };
}
