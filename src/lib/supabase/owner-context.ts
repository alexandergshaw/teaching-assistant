import { AsyncLocalStorage } from "node:async_hooks";

/**
 * SECURITY-SENSITIVE MODULE - read this before touching it.
 *
 * Server-only owner-impersonation context for UNATTENDED (Vercel Cron)
 * workflow runs, where there is no browser session to read a session cookie
 * or MFA (AAL2) state from. requireOwner() (see ./auth.ts) checks
 * getImpersonatedOwner() FIRST, before its normal cookie+MFA path, so it
 * authorizes as the given owner for the duration of runAsOwner's callback -
 * this is a deliberate bypass of the cookie+MFA check, not a bug.
 *
 * The bypass is safe ONLY because of who is allowed to call runAsOwner and
 * under what conditions:
 *   - The callers are src/app/api/cron/run-schedules/route.ts (which also runs
 *     the unattended event-trigger loop via src/lib/workflow-trigger-runner.ts),
 *     src/app/api/triggers/[token]/route.ts (the inbound webhook endpoint for
 *     external webhooks), and src/app/api/github/webhook/route.ts (the GitHub
 *     push webhook endpoint).
 *   - Each caller calls runAsOwner ONLY after (a) authenticating the request
 *     against a server-only secret - the cron route verifies an
 *     `Authorization: Bearer <token>` header against the CRON_SECRET env var;
 *     the token-webhook route matches the unguessable per-trigger `webhook_token`
 *     from the URL against an enabled trigger row; the GitHub webhook route
 *     verifies the HMAC signature over the raw body (X-Hub-Signature-256)
 *     against the GITHUB_WEBHOOK_SECRET env var - and (b) resolving the
 *     target user via the Supabase service-role admin API and confirming
 *     isOwnerEmail on the result, i.e. re-checking the exact allowlist
 *     requireOwner() itself enforces on the normal path. All three also gate the
 *     workflow through isHeadlessSafeWorkflow before running it.
 *   - This module exports nothing that a client component could import: it
 *     has no "use client" directive and is never imported by one. Grep
 *     `runAsOwner` before changing that invariant - it must stay imported
 *     only by the two trusted route handlers above (and their
 *     src/lib/workflow-trigger-runner.ts helper) and by
 *     src/lib/workflows/server-runner.ts (which receives the owner as a plain
 *     argument; it never reads request/cookie state itself).
 *   - AsyncLocalStorage scopes the impersonation to the exact async call
 *     tree started inside runAsOwner's callback. It is not global, not
 *     request-wide via middleware, and cannot leak into a concurrent request
 *     that did not call runAsOwner itself.
 *
 * Do NOT add a way to set this context from anything reachable by a browser
 * request UNLESS it carries its own CRON_SECRET-equivalent gate. A Server
 * Action invoked by a client, a public Route Handler with no server-only
 * secret check, middleware, etc. must never reach runAsOwner - doing so would
 * let any request impersonate the app owner. The webhook route qualifies only
 * because the per-trigger token is exactly such a secret and it re-checks the
 * owner allowlist before impersonating.
 */

export interface OwnerIdentity {
  id: string;
  email: string;
}

const ownerStorage = new AsyncLocalStorage<OwnerIdentity>();

/**
 * Run `fn` with `owner` impersonated for every requireOwner() call made -
 * directly or transitively through any awaited call - during its execution.
 * Callers MUST have already verified CRON_SECRET and isOwnerEmail(owner.email)
 * before calling this; it performs no authorization checks of its own.
 */
export function runAsOwner<T>(owner: OwnerIdentity, fn: () => Promise<T>): Promise<T> {
  return ownerStorage.run(owner, fn);
}

/** The currently-impersonated owner, or null outside of runAsOwner. */
export function getImpersonatedOwner(): OwnerIdentity | null {
  return ownerStorage.getStore() ?? null;
}
