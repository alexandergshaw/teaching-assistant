import type { SupabaseAuthObserver } from "@/context/supabase-auth-observer";

type Identity = Readonly<{ accountId: string; sessionId: string }>;
export type BundleLease = Readonly<{ signal: AbortSignal }>;

/** Continuity observations are not authorization. The verifier must independently
 * obtain a fresh server-verified owner identity and session for this attempt. */
export function createBundleAuthority(observer: SupabaseAuthObserver, verifyOwnerSession: () => Promise<Identity | null>) {
  let active: { lease: BundleLease; identity: Identity; controller: AbortController } | undefined;
  let generation = 0;
  function revoke() { generation++; const previous = active; active = undefined; previous?.controller.abort(); }
  const unsubscribe = observer.subscribe(revoke);
  return {
    async admit(): Promise<BundleLease | null> {
      revoke(); const attempt = generation, snapshot = observer.snapshot();
      if (!snapshot.identity) return null;
      let verified: Identity | null;
      try { verified = await verifyOwnerSession(); } catch { return null; }
      if (attempt !== generation || observer.snapshot() !== snapshot || !verified || verified.accountId !== snapshot.identity.accountId || verified.sessionId !== snapshot.identity.sessionId) return null;
      const controller = new AbortController(), lease = Object.freeze({ signal: controller.signal });
      active = { lease, identity: { accountId: verified.accountId, sessionId: verified.sessionId }, controller }; return lease;
    },
    resolve(lease: BundleLease): string | null {
      return active?.lease === lease && !lease.signal.aborted ? active.identity.accountId : null;
    },
    identity(lease: BundleLease): Identity | null { return active?.lease === lease && !lease.signal.aborted ? active.identity : null; },
    revoke,
    close() { revoke(); unsubscribe(); },
  };
}
