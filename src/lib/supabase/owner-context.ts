import { AsyncLocalStorage } from "node:async_hooks";
import { getAppUser, type AppUserRole, type AppUserStatus } from "./app-users";
import { resolveAccess, canUseApp, type AccessProfile } from "../access";

/**
 * SECURITY-SENSITIVE MODULE - read this before touching it.
 *
 * Server-only owner-impersonation context for UNATTENDED (Vercel Cron)
 * workflow runs, where there is no browser session to read a session cookie
 * or MFA (AAL2) state from. requireUser()/requireAppOwner() (see ./auth.ts)
 * check getImpersonatedOwner() FIRST, before their normal cookie+MFA path, so
 * they authorize as the given identity for the duration of runAsOwner's
 * callback - this is a deliberate bypass of the cookie+MFA check, not a bug.
 *
 * The bypass is safe ONLY because of who is allowed to call runAsOwner and
 * under what conditions:
 *   - The callers are FOUR, across three route handlers plus one shared
 *     helper - grep `runAsOwner(` before assuming a different count, this
 *     comment has been wrong about the count before:
 *       - src/app/api/cron/run-schedules/route.ts (time-based schedules)
 *       - src/app/api/triggers/[token]/route.ts (the inbound webhook endpoint
 *         for external per-trigger-token webhooks)
 *       - src/app/api/github/webhook/route.ts (the GitHub push webhook
 *         endpoint)
 *       - src/lib/workflow-trigger-runner.ts (the unattended event-trigger
 *         loop - called BY the cron route above for its own tick, but a
 *         direct caller of runAsOwner in its own right, not merely a helper
 *         invoked inside someone else's impersonation scope)
 *   - Each caller calls runAsOwner ONLY after (a) authenticating the request
 *     against a server-only secret - the cron route verifies an
 *     `Authorization: Bearer <token>` header against the CRON_SECRET env var;
 *     the token-webhook route matches the unguessable per-trigger `webhook_token`
 *     from the URL against an enabled trigger row; the GitHub webhook route
 *     verifies the HMAC signature over the raw body (X-Hub-Signature-256)
 *     against the GITHUB_WEBHOOK_SECRET env var - and (b) resolving the
 *     target user via the Supabase service-role admin API and passing the
 *     result - including that SAME admin-API user's `email_confirmed_at`,
 *     as `resolveImpersonationIdentity`'s required `emailVerified` argument -
 *     through resolveImpersonationIdentity (below), which re-checks the
 *     account's LIVE role/status via app_users using the SAME resolveAccess()
 *     decision the request gate and the server-action guard use (AC A4) -
 *     never a hand-rolled copy of that rule, and never simply "is this the
 *     owner" (see the AM3 note below). All four also gate the workflow
 *     through isHeadlessSafeWorkflow before running it. SECURITY: an
 *     UNVERIFIED address must never be impersonated as owner - `emailVerified`
 *     is what stands between "this address is on OWNER_EMAILS" and "Supabase
 *     has actually confirmed this account owns that address"; a caller that
 *     passes anything other than the real `Boolean(user.email_confirmed_at)`
 *     (in particular, a hard-coded `true`) reopens BUG 1 (see
 *     src/lib/access.ts's own `emailVerified` doc comment) for whichever of
 *     the four unattended entry points it is.
 *   - This module exports nothing that a client component could import: it
 *     has no "use client" directive and is never imported by one. Grep
 *     `runAsOwner(` before changing that invariant - it must stay imported
 *     only by the three trusted route handlers above and
 *     src/lib/workflow-trigger-runner.ts.
 *   - AsyncLocalStorage scopes the impersonation to the exact async call
 *     tree started inside runAsOwner's callback. It is not global, not
 *     request-wide via the request proxy, and cannot leak into a concurrent
 *     request that did not call runAsOwner itself.
 *
 * Do NOT add a way to set this context from anything reachable by a browser
 * request UNLESS it carries its own CRON_SECRET-equivalent gate. A Server
 * Action invoked by a client, a public Route Handler with no server-only
 * secret check, the request proxy, etc. must never reach runAsOwner - doing
 * so would let any request impersonate another user. The webhook routes
 * qualify only because their per-request secret (CRON_SECRET, the per-trigger
 * token, the HMAC) is exactly such a gate, and they still re-check the
 * impersonated account's live status before impersonating it.
 *
 * WHY THE IDENTITY CARRIES role/status, NOT JUST id/email (AC AM3 vs a
 * privilege-escalation the naive fix for AM3 introduces): AM3 amends the
 * four re-checks above from "is the owner" to "is an ACTIVE account", so a
 * member's own scheduled workflow can fire instead of being marked "owner is
 * not allowlisted" forever. But requireAppOwner() (./auth.ts) honours
 * whatever sits in this ALS store IMMEDIATELY, before any other check - so
 * without carrying role/status here too, a member's merely-active identity
 * would be honoured by requireAppOwner() exactly as if it were the real
 * owner, and a member's own headless-safe workflow (attach a webhook
 * trigger, POST the trigger token) would reach the owner's Canvas/GitHub
 * credentials. Carrying role/status on OwnerIdentity itself is what keeps
 * "active" from silently meaning "owner". See resolveImpersonationIdentity
 * below for how they are derived in the first place.
 *
 * WHAT THE CHECKS ACTUALLY ARE, AS SHIPPED (this paragraph replaces an
 * earlier one that described a state the code never reached): BOTH
 * requireUser() and requireAppOwner() currently require `role === "owner"`
 * on an impersonated identity, not just an active status. That is stricter
 * than AM3 above describes, and it is deliberate - it is BLOCK2 in
 * docs/multi-user-login-acceptance-criteria.md, honouring R10 over AM3 as a
 * STOPGAP.
 *
 * The reason: carrying role/status here closes the escalation only if
 * something enforces the role, and the only enforcement point was
 * requireAppOwner(), which has no call sites yet - so a merely-active
 * identity in this store would still have passed requireUser(), and
 * requireOwner() now delegates to requireUser() at ~496 invocations. Until
 * the credential accessors carry their own capability checks (Group E), the
 * containment lives here instead.
 *
 * THE COST, so nobody "fixes" this back without knowing what they are
 * buying: a non-owner's scheduled workflows and webhook triggers do not
 * fire. That costs nothing while no member accounts exist, and it is the
 * whole point while the guard split is incomplete. Loosen this ONLY together
 * with the resource-level guards, never on its own.
 */

export interface OwnerIdentity {
  id: string;
  email: string;
  role: AppUserRole;
  status: AppUserStatus;
}

const ownerStorage = new AsyncLocalStorage<OwnerIdentity>();

/**
 * Run `fn` with `owner` impersonated for every requireUser()/requireAppOwner()
 * call made - directly or transitively through any awaited call - during its
 * execution. Callers MUST have already verified their own server-only secret
 * and resolved `owner` via resolveImpersonationIdentity (or an equivalent
 * live role/status check) before calling this; it performs no authorization
 * checks of its own.
 */
export function runAsOwner<T>(owner: OwnerIdentity, fn: () => Promise<T>): Promise<T> {
  return ownerStorage.run(owner, fn);
}

/** The currently-impersonated identity, or null outside of runAsOwner. */
export function getImpersonatedOwner(): OwnerIdentity | null {
  return ownerStorage.getStore() ?? null;
}

/**
 * Resolves the impersonation identity for an unattended run's target user,
 * given their id, their VERIFIED auth email (from
 * `supabase.auth.admin.getUserById` - never a caller-supplied value; see
 * app-users.ts's ensureAppUser for the same rule applied to account
 * creation), and whether that address is itself confirmed
 * (`Boolean(user.email_confirmed_at)` from that SAME admin-API user - see
 * `emailVerified`'s own parameter doc below). Returns null when the account
 * may not be impersonated at all - this covers both a profile-lookup failure
 * (fails closed via resolveAccess's `unavailable` decision, which never
 * falls through to allowed) and an account that is not currently usable
 * (pending, suspended, or deleted since the schedule/trigger/webhook
 * subscription was created).
 *
 * This is the ONE place all four runAsOwner callers (see this file's header)
 * compute the identity to impersonate, so the live-status re-check they each
 * need is the SAME resolveAccess() decision used everywhere else in the app
 * (AC A4) rather than four independently hand-maintained copies of it - the
 * exact kind of drift that let one of the four skip the re-check entirely in
 * an earlier draft of this design. Each caller already holds the target
 * user's full auth user (id/email/`email_confirmed_at`) from its own
 * `auth.admin.getUserById` call; this function only adds the app_users
 * lookup (via getAppUser, which uses its own service-role client - see
 * app-users.ts) and the decision on top of that.
 *
 * SECURITY: an unverified address cannot be impersonated as owner. `email`
 * alone is a self-reported claim as far as the `OWNER_EMAILS` break-glass is
 * concerned - `resolveAccess`'s `emailVerified` gate (src/lib/access.ts) is
 * the ONLY thing standing between "an address that happens to be on
 * OWNER_EMAILS" and "an account Supabase has actually confirmed owns that
 * address". Passing anything other than the caller's real
 * `email_confirmed_at` (in particular, hard-coding `true`) would reopen BUG 1
 * for every one of the four unattended entry points this function serves:
 * cron schedules, the per-trigger webhook token route, the GitHub push
 * webhook, and the unattended event-trigger loop.
 */
export async function resolveImpersonationIdentity(
  userId: string,
  email: string | null | undefined,
  emailVerified: boolean
): Promise<OwnerIdentity | null> {
  let profile: AccessProfile | null = null;
  let lookupFailed = false;
  try {
    const row = await getAppUser(userId);
    profile = row ? { role: row.role, status: row.status } : null;
  } catch {
    lookupFailed = true;
  }

  const decision = resolveAccess({ email, profile, lookupFailed, emailVerified });
  if (!canUseApp(decision)) {
    return null;
  }

  const role: AppUserRole = decision === "owner" ? "owner" : (profile?.role ?? "instructor");
  return { id: userId, email: email ?? "", role, status: "active" };
}
