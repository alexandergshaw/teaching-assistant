import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { createClient as createServerSupabaseClient } from "./server";
import {
  getAppUser,
  ensureAppUser,
  ensureAppUserRowExists,
  appUserNeedsReconciliation,
  type AppUserRole,
  type AppUserStatus,
  type AppUserRow,
} from "./app-users";
import {
  resolveAccess,
  canUseApp,
  isOwnerDecision,
  type AccessProfile,
  type AccessDecision,
} from "../access";
import { getImpersonatedOwner, type OwnerIdentity } from "./owner-context";

/** BUG 4 FIX: the generic denial message, unchanged from before this fix. */
const NOT_AUTHORIZED_MESSAGE = "Not authorized. Sign in with an approved account.";
/**
 * BUG 4 FIX: distinct from NOT_AUTHORIZED_MESSAGE on purpose - see
 * throwForDecision below. Mirrors how the request gate documents
 * `AccessDecision.unavailable` in ../access.ts: a system failure ("try
 * again"), never a decision about the account ("contact the administrator").
 */
const SERVICE_UNAVAILABLE_MESSAGE =
  "The account service is temporarily unavailable. Please try again in a moment.";

/**
 * BUG 4 FIX: throws the message that matches WHY a decision denies, instead
 * of the single generic "Not authorized" every denial used to throw
 * regardless of cause. `unavailable` means a Supabase outage or a lookup
 * timeout - the exact case ../access.ts's own AccessDecision doc comment
 * says must never be conflated with a decision about the account, and AC A4
 * forbids a second copy of that rule. Every other denying decision
 * (anonymous, pending, suspended) keeps the original message: none of them
 * are a system failure, and this fix is not the place to redesign what each
 * of those tells the caller.
 */
function throwForDecision(decision: AccessDecision): never {
  if (decision === "unavailable") {
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
  }
  throw new Error(NOT_AUTHORIZED_MESSAGE);
}

/**
 * Server-side auth helpers. For client-side auth, use the browser client
 * directly via `createClient()` from "./client".
 */

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

/**
 * What requireUser()/requireAppOwner() (and the deprecated requireOwner()
 * alias) return - a superset of the `{ id, email }` shape every existing
 * call site reads off the result (verified by grep across the ~105 files
 * that still call requireOwner()), so migrating a call site to either
 * function below never changes what that call site's body does with the
 * return value.
 *
 * `role`/`status` are typed OPTIONAL, even though every real implementation
 * below always sets them to a concrete value - never `undefined`. This is
 * purely a TypeScript-ergonomics concession, not a runtime one: dozens of
 * existing *.test.ts files (outside this wave's file scope) already mock
 * `requireOwner()` with `mockResolvedValue({ id, email })`, and a REQUIRED
 * `role`/`status` would make `vi.mocked(requireOwner).mockResolvedValue(...)`
 * fail to type-check in every one of them, which is a much bigger blast
 * radius than this wave is scoped to touch. Optional fields keep those
 * mocks compiling unchanged while the real functions still always populate
 * both.
 */
export interface AuthorizedUser {
  id: string;
  email: string;
  role?: AppUserRole;
  status?: AppUserStatus;
}

/**
 * Resolves the CURRENT signed-in session's access decision - the cookie+MFA
 * path shared by requireUser() and requireAppOwner() when there is no
 * impersonated identity in the ALS store (see ./owner-context.ts). Looks up
 * the caller's app_users row via getAppUser (React cache()-wrapped, so
 * repeat calls within one request collapse to a single query) and resolves
 * the SAME decision (resolveAccess, from ../access) the request gate uses -
 * never a second copy of the rule (AC A4).
 *
 * A lookup ERROR (getAppUser throws) is distinguished from a MISSING row
 * (getAppUser resolves null): the former sets `lookupFailed`, which
 * resolveAccess turns into the `unavailable` decision and denies - it must
 * never fall through to `pending`'s no-profile handling, let alone to
 * allowed, just because "no row" and "couldn't tell" can look similar to a
 * careless caller.
 *
 * BUG 4 FIX: an auth TRANSPORT failure (`getUser()` itself erroring with an
 * AuthRetryableFetchError) is likewise distinguished from an ordinary
 * signed-out visitor via `authFailed`, mirroring the request gate's own
 * computation exactly - see this function's body for why, and
 * throwForDecision (this file, top) for where callers turn `unavailable`
 * into a message that says so instead of "Not authorized".
 *
 * Returns the FULL row (not narrowed to `{ role, status }`) alongside the
 * decision: requireUser() needs the whole thing - specifically
 * `display_name` - to evaluate appUserNeedsReconciliation() below without
 * re-fetching it. `row` is null both for "no row exists" and for "the lookup
 * failed"; the latter is always paired with a denying decision (see above),
 * so requireUser() never actually consults `row` in that case.
 */
async function resolveSessionAccess() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  // BUG 4 FIX: this used to throw immediately on `error || !user`, with the
  // SAME generic "Not authorized" message for both a benign signed-out
  // visitor AND a Supabase transport failure - exactly the conflation
  // ../access.ts's own `unavailable` decision exists to prevent, and a
  // second, undocumented copy of the rule the request gate
  // (src/lib/supabase/proxy.ts) already gets right. `getUser()` returns
  // `{ data: { user: null }, error }` for both cases; only an
  // AuthRetryableFetchError (a network failure, or a 5xx from Supabase
  // itself) is a real outage worth calling `unavailable` - mirrors the
  // gate's own `authFailed` computation exactly, so both enforcement points
  // agree (AC A4).
  const authFailed = Boolean(getUserError && isAuthRetryableFetchError(getUserError));

  let row: AppUserRow | null = null;
  let lookupFailed = false;
  if (user) {
    try {
      row = await getAppUser(user.id);
    } catch {
      lookupFailed = true;
    }
  }

  const profile: AccessProfile | null = row ? { role: row.role, status: row.status } : null;
  const decision = resolveAccess({
    email: user?.email,
    profile,
    lookupFailed,
    authFailed,
    // BUG 1 FIX: see resolveAccess's ResolveAccessInput.emailVerified doc
    // comment, and the matching wiring in src/lib/supabase/proxy.ts - the
    // request gate and this server-action guard must supply the SAME
    // signal from the SAME field so they can never disagree about who is
    // let into the OWNER_EMAILS break-glass (AC A4).
    emailVerified: Boolean(user?.email_confirmed_at),
  });
  return { supabase, user, decision, row };
}

/**
 * The AAL2/MFA step-up check, shared by requireUser() and requireAppOwner(),
 * run AFTER the role/status check - the same ordering the original
 * requireOwner() used: a pending/suspended account is refused for what it is
 * before anything about its MFA state is even consulted.
 */
async function assertAal2StepUp(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
): Promise<void> {
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    throw new Error("Multi-factor authentication required. Finish the second step at sign-in.");
  }
}

function identityFrom(impersonated: OwnerIdentity): AuthorizedUser {
  return {
    id: impersonated.id,
    email: impersonated.email,
    role: impersonated.role,
    status: impersonated.status,
  };
}

/**
 * Best-effort call into ensureAppUser() so an authorized, non-impersonated
 * request reconciles its own app_users row (create-if-missing, OWNER_EMAILS
 * promote/demote, display_name fill - see ensureAppUser's own doc comment
 * in ./app-users.ts for the exact rule; it is not repeated here). Called
 * from requireUser() only - see that function for why requireAppOwner() and
 * the impersonation path are deliberately excluded.
 *
 * GATED BY appUserNeedsReconciliation() (./app-users.ts) FIRST - a pure,
 * in-memory check over `row` (the account row resolveSessionAccess already
 * fetched) and `email` (the verified email resolveSessionAccess already
 * has), with no I/O of its own. THE REAL COST: ensureAppUser cannot tell
 * whether anything needs to change without first issuing TWO network round
 * trips of its own - `supabase.auth.admin.getUserById` (an admin API call,
 * to re-verify the email) and then `fetchAppUserRow` (an uncached row read)
 * - so calling it unconditionally, as this function used to, cost two extra
 * round trips on every one of requireUser()'s ~1000 call sites, not the
 * "one extra read" an earlier version of this comment claimed. Because this
 * function already holds everything appUserNeedsReconciliation needs,
 * calling ensureAppUser at all is skipped outright on the already-correct,
 * overwhelmingly common case: that case now costs ZERO extra round trips,
 * down from two. A request where reconciliation genuinely might be needed
 * (a missing row, an OWNER_EMAILS promote/demote, or a possibly-empty
 * display_name - see appUserNeedsReconciliation's own doc comment for why
 * that last one is a conservative, not exact, check) still calls
 * ensureAppUser and pays its normal two-round-trip cost, exactly as before -
 * this is an optimization for the common case, not a change to what
 * eventually gets reconciled.
 *
 * FAILURE HANDLING: deliberately swallows any error rather than letting it
 * propagate out of requireUser(). The access DECISION for this request was
 * already computed above, from the row (or explicit lack of one) that
 * resolveSessionAccess actually read - a transient failure writing the
 * RECONCILED row back must not retroactively turn an already-authorized
 * request into a denial. This includes ensureAppUser's own "genuinely
 * missing row" failure mode (its insert did not succeed, so it has no row
 * at all to hand back and must throw): even then there is nothing to roll
 * back here, because THIS request's access was never conditioned on that
 * write succeeding - the only way a decision is reached with no stored row
 * is resolveAccess's OWNER_EMAILS break-glass (see ../access.ts), which is
 * independent of the stored row by design. The write is simply retried on
 * this account's next request.
 */
async function reconcileAppUserRow(userId: string, row: AppUserRow | null, email: string): Promise<void> {
  if (!appUserNeedsReconciliation(row, email)) {
    return;
  }

  try {
    await ensureAppUser({ id: userId });
  } catch (err) {
    console.error(
      `requireUser(): ensureAppUser reconciliation failed for ${userId}; continuing with the already-authorized decision.`,
      err
    );
  }
}

/**
 * Authorize a server action for any ACTIVE account, either role. This is the
 * DEFAULT guard: every table in this app is already user_id-scoped, so a
 * member acting on their own data is the normal case, not a privileged one.
 * Throws when the caller is not signed in, is pending/suspended, or when the
 * account lookup itself fails (fails closed - see resolveSessionAccess).
 * Preserves the existing AAL2/MFA step-up.
 *
 * SECURITY: checks getImpersonatedOwner() FIRST, exactly like the original
 * requireOwner() did - see src/lib/supabase/owner-context.ts's module
 * preamble for the full writeup of why that bypass is safe.
 *
 * BUG 2 FIX (docs/multi-user-login-acceptance-criteria.md, "DEPLOY GATE",
 * BLOCK2 - deliberately a stopgap, not the final design): an impersonated
 * identity is honoured here ONLY when it is BOTH `status === "active"` AND
 * `role === "owner"`. AM3's amendment ("the four impersonation re-checks
 * become 'is an ACTIVE account', not 'is an owner'") is NOT yet safe to
 * carry out, because the enforcement point it depends on does not exist as a
 * call site: `requireAppOwner()` is reserved for owner-private capabilities,
 * but `requireOwner()` - the ~496-invocation deprecated alias just below -
 * delegates to THIS function, not to requireAppOwner(), and most of those
 * call sites have not yet been reclassified (AC A6/R7 is a follow-up wave,
 * not this one). If this function honoured a merely-active impersonated
 * identity, an active non-owner could attach their own webhook trigger,
 * POST its token at the public /api/triggers/[token], have it impersonate
 * them, and reach every owner-private capability still gated by the
 * requireOwner() name - Canvas, GITHUB_TOKEN, the cloned voice/avatar (AC
 * R7). Reverted to the STRICTER, owner-only check here - honouring R10 over
 * AM3, exactly as BLOCK2 prescribes - until the credential accessors (AC
 * Group E) do the real containment at the resource itself. This costs
 * nothing today: there are no members yet (REL1). DO NOT loosen this back to
 * a status-only check without first confirming every requireOwner() call
 * site that reaches a shared owner secret has been moved to
 * requireAppOwner() - see the CANARY test in ./auth.test.ts guarding exactly
 * this.
 *
 * Also reconciles the caller's OWN app_users row (see reconcileAppUserRow
 * above) once the request is authorized - but ONLY on this, the cookie+MFA
 * path, never on the impersonation branch above: an unattended cron/webhook
 * run must not perform account writes on behalf of the identity it is
 * impersonating (that identity's row belongs to a real signed-in person who
 * is not the one making this request). This is also why the reconciliation
 * call sits AFTER the impersonation branch's early return, not before it.
 * That reconciliation is itself gated by appUserNeedsReconciliation() using
 * the row and email this function already resolved - see
 * reconcileAppUserRow's own doc comment for the round-trip cost this avoids.
 *
 * BUG 3 FIX: a DENIED decision with NO app_users row at all (`row === null`,
 * and the lookup did not merely fail) now creates that bare row via
 * ensureAppUserRowExists BEFORE throwing - see that function's own doc
 * comment in ./app-users.ts for why this was previously unreachable and why
 * it is a narrower operation than full reconciliation. This preserves the
 * property that a denied request with an EXISTING row performs no
 * reconciliation write at all: the check is `!row`, not merely `!canUseApp`.
 *
 * BUG 4 FIX: throws a message distinguishable by decision - see
 * throwForDecision (top of file) - instead of the single generic message
 * every denial used to throw regardless of cause.
 */
export async function requireUser(): Promise<AuthorizedUser> {
  const impersonated = getImpersonatedOwner();
  if (impersonated) {
    if (impersonated.status !== "active" || impersonated.role !== "owner") {
      throw new Error(NOT_AUTHORIZED_MESSAGE);
    }
    return identityFrom(impersonated);
  }

  const { supabase, user, decision, row } = await resolveSessionAccess();
  if (!canUseApp(decision)) {
    if (user && !row && decision !== "unavailable") {
      await ensureAppUserRowExists(user.id).catch((err) => {
        console.error(
          `requireUser(): ensureAppUserRowExists recovery failed for ${user.id}; the row is retried on this account's next request.`,
          err
        );
      });
    }
    throwForDecision(decision);
  }
  if (!user) {
    // Unreachable in practice: resolveAccess never returns an authorized
    // decision without a verified email, and a verified email cannot exist
    // without a signed-in `user`. Thrown defensively (never a non-null
    // assertion on `user` below) so a future change to resolveAccess's
    // contract fails loudly here instead of reading `user.id` off `null`.
    throw new Error(NOT_AUTHORIZED_MESSAGE);
  }
  await assertAal2StepUp(supabase);
  await reconcileAppUserRow(user.id, row, user.email ?? "");

  return {
    id: user.id,
    email: user.email ?? "",
    role: decision === "owner" ? "owner" : "instructor",
    status: "active",
  };
}

/**
 * Authorize a server action for role==='owner' ONLY. Reserved for call sites
 * that spend or reach an OWNER-PRIVATE resource through a shared server
 * secret (Canvas, GitHub, the cloned voice/avatar, ...) plus the admin
 * surface - see docs/multi-user-login-architecture.md Part 3 for why the
 * actual containment for most capabilities lives at the secret itself rather
 * than at every call site, which is why requireAppOwner() is reserved for a
 * smaller list than "everything that used to call requireOwner()".
 *
 * SECURITY: honours an impersonated identity ONLY when its `role` is
 * literally "owner" - see requireUser() above and
 * src/lib/supabase/owner-context.ts for why that check exists at all: an
 * impersonated identity that is merely "active" (a member's own scheduled
 * workflow, per AC AM3) must never be treated as the owner here. This is
 * currently the SAME effective check requireUser()'s own impersonation
 * branch makes (BUG 2's stopgap fix) - not a redundancy to remove, but a
 * fact that will stop being true the moment BUG 2's fix is superseded by the
 * real Group E containment, at which point this function remains the one
 * enforcement point that must still say "owner", full stop.
 *
 * BUG 4 FIX: throws a message distinguishable by decision - see
 * throwForDecision (top of file).
 */
export async function requireAppOwner(): Promise<AuthorizedUser> {
  const impersonated = getImpersonatedOwner();
  if (impersonated) {
    if (impersonated.role !== "owner") {
      throw new Error(NOT_AUTHORIZED_MESSAGE);
    }
    return identityFrom(impersonated);
  }

  const { supabase, user, decision } = await resolveSessionAccess();
  if (!isOwnerDecision(decision)) {
    throwForDecision(decision);
  }
  if (!user) {
    // See the matching guard in requireUser() above for why this is
    // defensive rather than asserted away.
    throw new Error(NOT_AUTHORIZED_MESSAGE);
  }
  await assertAal2StepUp(supabase);

  return {
    id: user.id,
    email: user.email ?? "",
    role: "owner",
    status: "active",
  };
}

/**
 * @deprecated Use requireUser() (any active account) or requireAppOwner()
 * (owner only) instead. Kept as a thin alias so the ~105 existing source
 * files that still import requireOwner() keep compiling and working;
 * reclassifying each of those call sites into the correct one of the two
 * functions above is a separate wave, not this one (see
 * docs/multi-user-login-acceptance-criteria.md A6 and
 * docs/multi-user-login-architecture.md's "The requireOwner() split").
 * Delegates to requireUser() - "any active account" - because that is what
 * the majority of those call sites actually need; the minority that reach an
 * owner-private shared secret are the ones the follow-up wave must move to
 * requireAppOwner() explicitly. Until that wave lands, this alias is
 * DELIBERATELY LESS RESTRICTIVE than the requireOwner() it replaces for
 * those specific call sites - a tracked, temporary state, not an oversight.
 */
export async function requireOwner(): Promise<AuthorizedUser> {
  return requireUser();
}

export async function getCurrentSession() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = await createServerSupabaseClient();
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithPassword(email: string, password: string) {
  const supabase = await createServerSupabaseClient();
  return supabase.auth.signUp({ email, password });
}
