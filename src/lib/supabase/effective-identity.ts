import { requireUser, type AuthorizedUser } from "./auth";
import { getImpersonatedOwner, type OwnerIdentity } from "./owner-context";

/**
 * SECURITY-SENSITIVE MODULE - read this before touching it, and read
 * ./owner-context.ts's own module preamble first: this file sits on top of
 * the containment that file describes and must not weaken it.
 *
 * getEffectiveIdentity() answers exactly one question - "who is this request
 * acting as" - for the Canvas per-user-credential resolver
 * (docs/lms-credentials-acceptance-criteria.md, E-ARCH3/E-ARCH4) and for
 * whatever future per-user resource accessor is built the same way. Its
 * entire reason to exist: THE CALLER NEVER PASSES A USER ID IN. A user id
 * that arrives as a function argument is a parameter the caller controls -
 * the exact defect `resolveInstitutionByCode` had (a client-supplied
 * institution code interpolated straight into an env-var lookup), just
 * relocated from "which institution" to "which user". Resolving identity from
 * ambient server-side state instead means the ~104 downstream Canvas call
 * sites this feature touches never get a chance to lie about who they are.
 *
 * WHAT IT DOES: the impersonated identity (an unattended cron/webhook/trigger
 * run - see owner-context.ts) when one is present, otherwise the cookie
 * session's requireUser() result. This is the SAME fallback order
 * requireUser()/requireAppOwner() already use internally
 * (getImpersonatedOwner() first, the cookie+MFA path second) - this module
 * does not invent a new rule, it exposes the identity that rule resolves to,
 * for a caller (the credential resolver) that needs the identity ITSELF
 * rather than a yes/no authorization decision.
 *
 * WHY THIS MODULE DOES NOT DELEGATE THE IMPERSONATION CASE TO requireUser(),
 * AND WHY THAT IS DELIBERATE (E-ARCH8): requireUser() and requireAppOwner()
 * both still enforce BLOCK2 - the STOPGAP recorded in owner-context.ts's own
 * preamble and in auth.ts's BUG 2 comment - which honours an impersonated
 * identity ONLY when role === "owner" AND status === "active"
 * (docs/multi-user-login-acceptance-criteria.md, "DEPLOY GATE"). That stopgap
 * is deliberately NOT lifted here, and this file must not loosen auth.ts to
 * lift it. But if THIS module re-implemented the same owner-only check, the
 * credential resolver's own role==='owner' check (guarding the
 * <CODE>_CANVAS_* env-var fallback, per
 * docs/lms-credentials-acceptance-criteria.md SEC13) would be dead code: an
 * identity could never reach it with role !== "owner" in the first place, so
 * a role check on an always-owner value proves nothing. This module therefore
 * reads getImpersonatedOwner() directly and maps WHATEVER identity is there,
 * unconditionally - written as though the AC's AM3 amendment ("any active
 * account may be impersonated", not "must be owner") already governed
 * impersonation everywhere. That is already true one layer down:
 * resolveImpersonationIdentity (owner-context.ts) already resolves and stores
 * a non-owner active account's identity via runAsOwner. It is only
 * requireUser()/requireAppOwner()'s OWN gate that additionally insists on
 * role === "owner" before honouring whatever resolveImpersonationIdentity
 * produced.
 *
 * THE CONSEQUENCE, TRACED, WHILE BLOCK2 REMAINS IN auth.ts (do not "fix" this
 * without first reading owner-context.ts's own cost paragraph): a member's
 * own unattended run (a scheduled workflow, an event trigger, a webhook) gets
 * impersonated with role !== "owner". The MOMENT that run's call tree reaches
 * any of the ~1000 existing call sites still calling requireUser() or the
 * requireOwner() alias directly - which today is effectively every one of
 * them, since nothing yet calls this function except the Canvas credential
 * resolver being built alongside it - that call throws
 * NOT_AUTHORIZED_MESSAGE and the run fails loudly, immediately, before doing
 * anything else. This module does not change that: it does not touch
 * auth.ts, and it has no callers of its own yet. So TODAY, a member's
 * unattended run does not reach a point where it could spend the owner's
 * Canvas token - it is refused outright, first, by the stopgap this file
 * leaves untouched. The moment a call site is migrated to call
 * getEffectiveIdentity() INSTEAD of requireUser(), that call site alone stops
 * enforcing BLOCK2 for itself - which is exactly why SEC13/E-REL4 require the
 * credential resolver to carry its OWN role==='owner' gate on the identity
 * this function returns, before ever touching an env var, landing in the SAME
 * deploy as any such migration. This module supplies the identity; it is not
 * the guard, and it must never grow into one.
 *
 * MEMOISATION: the two branches are asymmetric on purpose.
 *   - The impersonation branch (getImpersonatedOwner()) is a synchronous
 *     AsyncLocalStorage.getStore() read - already O(1), with no I/O, so
 *     there is nothing to memoise and no cache to add here.
 *   - The session branch (requireUser()) internally calls getAppUser(),
 *     which IS wrapped in React's cache() (see auth.ts's
 *     resolveSessionAccess doc comment) so repeat calls collapse to one
 *     query per request - but ONLY inside a React Server Component render.
 *     cache() does not dedupe inside a plain Route Handler or any other
 *     non-RSC context; calling requireUser() twice there issues the lookup
 *     twice. That is an existing property of requireUser() this module
 *     inherits by delegating to it, not something introduced or fixed here -
 *     getEffectiveIdentity() is a thin composition, not a second place to
 *     cache.
 * The asymmetry is correct, not accidental: the impersonation branch never
 * needed memoisation because it was already free, and the session branch's
 * memoisation was always conditional on an RSC render tree - wrapping this
 * function's own body in cache() would not extend that guarantee to a Route
 * Handler, because requireUser() would still issue its own fresh lookups
 * underneath.
 *
 * MAPPING (OwnerIdentity -> AuthorizedUser): both shapes carry exactly
 * { id, email, role, status } - see auth.ts's identityFrom(), which makes the
 * SAME mapping for requireUser()/requireAppOwner()'s own impersonation
 * branch. AuthorizedUser types role/status as OPTIONAL only for the
 * pre-existing mock-compatibility reason documented on that interface, never
 * because a real caller can omit them; every value returned here is filled
 * honestly from the impersonated identity, with nothing invented and nothing
 * dropped. There is no OwnerIdentity field AuthorizedUser lacks, and no
 * AuthorizedUser field that has to be guessed.
 *
 * NOTHING LEFT TO RE-CHECK: resolveImpersonationIdentity (owner-context.ts)
 * is the only place an OwnerIdentity is ever constructed, and it returns null
 * for a profile-lookup failure or a non-usable (pending/suspended/deleted)
 * account, always stamping status: "active" on whatever it does return. By
 * the time getImpersonatedOwner() can return a non-null value here, that
 * value has already passed a live resolveAccess() decision - this module
 * composes two existing reads, it does not re-implement that check. (If a
 * future caller ever managed to place a non-active identity into the ALS
 * store some other way, this function would map it through unchanged rather
 * than silently gating on status - re-adding a status check here would be
 * exactly the kind of second, drifting copy of the access rule AC A4
 * forbids; the fix for that scenario belongs at whatever populates the ALS
 * store, not here.)
 */
export async function getEffectiveIdentity(): Promise<AuthorizedUser> {
  const impersonated = getImpersonatedOwner();
  if (impersonated) {
    return identityFromOwner(impersonated);
  }
  return requireUser();
}

function identityFromOwner(owner: OwnerIdentity): AuthorizedUser {
  return {
    id: owner.id,
    email: owner.email,
    role: owner.role,
    status: owner.status,
  };
}
