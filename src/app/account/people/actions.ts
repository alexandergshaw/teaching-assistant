"use server";

// Server actions behind the owner-only account list (docs/account-people-copy.md,
// src/lib/account-admin-rules.ts). Every export here is an UNAUTHENTICATED POST
// endpoint (see src/lib/use-server-exports.test.ts's own module comment) that
// takes an account id AND NOTHING ELSE - every other input (who is acting, what
// role they hold, whether the target is allowlisted, how many owners exist) is
// resolved SERVER-SIDE, inside the action, on every single call. A caller-
// supplied role, status, allowlist flag or owner count would make this surface
// trivially defeatable (see account-admin-rules.ts's own module comment for the
// concrete exploit shape), so nothing here ever accepts one.
//
// Each of the five thin exports below performs exactly one job itself - call
// requireAppOwner() and translate a thrown denial into a result the page can
// render without a stack trace - and then hands off to performAccountAction for
// the shared validate/decide/mutate/revalidate pipeline. This split is not
// merely stylistic: src/app/actions/action-guard-coverage.test.ts's OWNER_ONLY
// ratchet scans each EXPORTED function's OWN source text for a literal
// `requireAppOwner(` call, so the guard call has to live textually inside every
// one of these five functions, not just be reachable through a shared helper.
//
// AccountActionResult is a discriminated union, not a thrown error or a bare
// string, so the page can distinguish every failure kind with a `switch` on
// `kind` instead of matching substrings of a message - see this type's own doc
// comment for what each kind means and where it is checked against
// docs/account-people-copy.md.

import { revalidatePath } from "next/cache";
import { requireAppOwner, type AuthorizedUser } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getAppUser,
  setAppUserStatus,
  setAppUserRole,
  countEffectiveOwners,
  type AppUserRow,
} from "@/lib/supabase/app-users";
import { isOwnerEmail } from "@/lib/owner";
import { classifySuspendFailure } from "@/lib/account-suspend-failure";
import {
  canPerformAccountAction,
  type AccountAction,
  type AccountActionContext,
} from "@/lib/account-admin-rules";

/**
 * The path this whole surface lives at. Passed to revalidatePath as a literal
 * path (not a `[param]` pattern needing a `type`) - see that function's own
 * docs (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
 * revalidatePath.md, "Use a literal path when you want to refresh a single
 * page"). This is the narrowest API that actually does the job: the list lives
 * at exactly one URL, there is no dynamic segment to match, and no other route
 * reads these rows, so a broader revalidateTag/layout-wide invalidation would
 * only recompute pages that never needed it.
 */
const PEOPLE_LIST_PATH = "/account/people";

/**
 * Every distinguishable outcome the page needs to render without ever seeing a
 * raw provider or Postgres error string:
 *
 * - `ok`: the mutation happened; the list has been revalidated.
 * - `not_authorized`: requireAppOwner() denied the caller (not signed in, not
 *   active, or active but not the owner). Not reachable through this page's
 *   own UI - the page itself is owner-gated - but a server action is a public
 *   POST endpoint regardless of what UI happens to call it, so this is a real,
 *   not hypothetical, outcome for a direct call.
 * - `invalid_id`: `accountId` was not even shaped like an account id. Refused
 *   before any query runs.
 * - `not_found`: `accountId` is well-formed but no such account exists - the
 *   row was deleted, or never existed, between the list loading and this call.
 * - `refused`: `canPerformAccountAction` said no. `reason` is that verdict's
 *   own string (docs/account-people-copy.md's per-rule refusal text, e.g. "You
 *   cannot suspend your own account.", "This is the last active owner and
 *   cannot be suspended.") - never a provider error, always one of the fixed
 *   strings account-admin-rules.ts hands back. This is the ordinary path for
 *   the "the account, or the number of active owners, changed after this list
 *   loaded" race the copy sheet describes: `activeOwnerCount` is recomputed
 *   fresh on every call (see performAccountAction below), so a button that
 *   rendered enabled can still be refused here against whatever is true right
 *   now.
 * - `suspend_provider_failed` / `suspend_reversed` / `suspend_locked_out`: the
 *   three distinguishable ways a suspend can fail, read directly out of
 *   setAppUserStatus's own doc comment (src/lib/supabase/app-users.ts,
 *   lines 262-301) and specified as three separate user-facing strings in
 *   docs/account-people-copy.md ("Action feedback: ... On failure"). Only
 *   `suspend_locked_out` has no automatic recovery - see
 *   `classifySuspendFailure` in @/lib/account-suspend-failure for how these
 *   three are told apart without a typed error from setAppUserStatus (that
 *   function's own doc comment says pattern-matching the thrown message is
 *   "the only mechanism available today"). It lives in a lib module, not in
 *   this file, so that a test can drive the real setAppUserStatus into all
 *   three failure modes and prove the match still holds - a `"use server"`
 *   file cannot export a pure function for a test to reach.
 * - `failed`: any other failure - a lookup that threw, an owner-count query
 *   that threw, or a non-suspend mutation (approve/restore/promote/demote)
 *   that threw. The copy sheet gives these one generic "Nothing was changed"
 *   string per action; there is nothing else to distinguish for them.
 */
export type AccountActionResult =
  | { kind: "ok" }
  | { kind: "not_authorized" }
  | { kind: "invalid_id" }
  | { kind: "not_found" }
  | { kind: "refused"; reason: string }
  | { kind: "suspend_provider_failed" }
  | { kind: "suspend_reversed" }
  | { kind: "suspend_locked_out" }
  | { kind: "failed" };

/**
 * `app_users.id` is `auth.users.id` - a Postgres `uuid` - written back verbatim
 * by every writer in src/lib/supabase/app-users.ts. A server action is an
 * unauthenticated POST endpoint, so `accountId` must be checked against this
 * shape BEFORE it ever reaches a query, rather than trusted because the
 * exported function's TypeScript signature says `string` (a type annotation
 * enforces nothing at the wire).
 */
const ACCOUNT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isWellFormedAccountId(value: unknown): value is string {
  return typeof value === "string" && ACCOUNT_ID_PATTERN.test(value);
}

/**
 * The WHOLE break-glass condition `AccountActionTarget.isAllowlisted` requires
 * - `isOwnerEmail(email) && emailVerified` - never `isOwnerEmail(email)` alone
 * (see that field's own doc comment in account-admin-rules.ts for why supplying
 * only the first half is an exploitable mistake, not merely an imprecision).
 *
 * `src/lib/supabase/app-users-directory.ts` is being built in parallel to
 * supply this verification signal directly; as of this action file it does not
 * exist yet, so this resolves it independently via the same admin API call
 * `ensureAppUser` already makes for the identical purpose
 * (`supabase.auth.admin.getUserById`, read against `email_confirmed_at` -
 * src/lib/supabase/app-users.ts lines 728-741 and 802). Short-circuits on
 * `isOwnerEmail` first so the admin round trip is only ever paid for a row that
 * could possibly be allowlisted at all - the overwhelming majority of rows
 * never are.
 *
 * Fails CLOSED in the safe direction on an unresolvable lookup: `error` or a
 * missing `user` returns `false` (not allowlisted), never `true`. Getting this
 * wrong as `false` when the row actually is allowlisted only costs a suspend or
 * demote that reconciliation quietly reverses on that account's next request
 * (see ensureAppUser's own doc comment) - harmless churn. Getting it wrong as
 * `true` when the row is not actually verified would be the real mistake this
 * field's own doc comment warns about: handing allowlist protection to an
 * unverified claimant. Only the safe direction is reachable here.
 */
async function isAllowlistedTarget(accountId: string, email: string | null): Promise<boolean> {
  if (!isOwnerEmail(email)) {
    return false;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.getUserById(accountId);
  if (error || !data?.user) {
    return false;
  }
  return Boolean(data.user.email_confirmed_at);
}

/**
 * Tells apart the three suspend failure shapes setAppUserStatus can throw,
 * plus a catch-all - see AccountActionResult's own doc comment for what each
 * one means, and docs/account-people-copy.md's "Action feedback... On failure"
 * section for the exact user-facing copy each is meant to drive.
 *
 * The decision itself lives in `@/lib/account-suspend-failure` rather than
 * here, and that move is deliberate: this is a `"use server"` file, which may
 * export only async functions, so a pure classifier defined HERE is
 * unreachable from any test. The coupling it encodes - a substring match
 * against another module's thrown wording - is exactly the kind that decays
 * silently, so it needs a test that runs the real `setAppUserStatus` and
 * classifies the message it actually produces. See
 * `src/lib/account-suspend-failure.test.ts`, which does that and which fails
 * if app-users.ts is reworded. A `"use server"` file may freely IMPORT, so
 * this costs nothing.
 */
function suspendFailureResult(err: unknown): AccountActionResult {
  return { kind: classifySuspendFailure(err) };
}

/**
 * The shared validate/decide/mutate/revalidate pipeline for all five actions,
 * run only once the caller has already been through requireAppOwner() - `actor`
 * is that call's own return value, passed in rather than re-derived, so this
 * function performs no authorization of its own and is not itself an exported
 * "use server" entry point (see this file's module comment for why the guard
 * call has to stay textually inside each of the five exports instead of living
 * only here).
 *
 * Steps 2-5 of this file's brief, run in this fixed order:
 *
 * 2. Validate `accountId` (isWellFormedAccountId) before any query.
 * 3. Read the target row fresh, recompute `activeOwnerCount` fresh
 *    (`countEffectiveOwners` - never `countActiveOwners`, and never a value
 *    carried from an earlier render: see that function's own doc comment,
 *    "callers must invoke this INSIDE the mutation they are guarding"),
 *    resolve `isAllowlisted` as the full break-glass conjunction, and call
 *    `canPerformAccountAction` with the context built from all three. Refuses
 *    with the rule's own reason if it says no - this function never
 *    re-derives or second-guesses that verdict.
 * 4. Perform the change via setAppUserStatus/setAppUserRole.
 * 5. Revalidate the list.
 */
async function performAccountAction(
  action: AccountAction,
  accountId: unknown,
  actor: AuthorizedUser
): Promise<AccountActionResult> {
  if (!isWellFormedAccountId(accountId)) {
    return { kind: "invalid_id" };
  }

  let target: AppUserRow | null;
  try {
    target = await getAppUser(accountId);
  } catch {
    return { kind: "failed" };
  }
  if (!target) {
    return { kind: "not_found" };
  }

  let activeOwnerCount: number;
  try {
    activeOwnerCount = await countEffectiveOwners();
  } catch {
    return { kind: "failed" };
  }

  const isAllowlisted = await isAllowlistedTarget(accountId, target.email);

  const context: AccountActionContext = {
    actorId: actor.id,
    actorRole: actor.role ?? "owner",
    target: {
      id: target.id,
      email: target.email,
      role: target.role,
      status: target.status,
      isAllowlisted,
    },
    activeOwnerCount,
  };

  const verdict = canPerformAccountAction(action, context);
  if (!verdict.allowed) {
    return { kind: "refused", reason: verdict.reason };
  }

  try {
    switch (action) {
      case "approve":
        await setAppUserStatus(accountId, "active", actor.id);
        break;
      case "restore":
        await setAppUserStatus(accountId, "active", actor.id);
        break;
      case "suspend":
        await setAppUserStatus(accountId, "suspended", actor.id);
        break;
      case "promote":
        await setAppUserRole(accountId, "owner", actor.id);
        break;
      case "demote":
        await setAppUserRole(accountId, "instructor", actor.id);
        break;
    }
  } catch (err) {
    return action === "suspend" ? suspendFailureResult(err) : { kind: "failed" };
  }

  revalidatePath(PEOPLE_LIST_PATH);
  return { kind: "ok" };
}

/**
 * Approve a pending account - the transition that removes the containment
 * (docs/account-people-copy.md's C0: "will get the same access to connected
 * services that you have"). Refused by canPerformAccountAction unless the
 * target is currently `pending`; an owner may not approve their own row (rule
 * 2 - their own row is often sitting pending under the OWNER_EMAILS
 * break-glass, and approving it would convert a freely-revocable allowlist
 * grant into a stored one).
 */
export async function approveAccountAction(accountId: string): Promise<AccountActionResult> {
  let actor: AuthorizedUser;
  try {
    actor = await requireAppOwner();
  } catch {
    return { kind: "not_authorized" };
  }
  return performAccountAction("approve", accountId, actor);
}

/**
 * Suspend an active account - bans the account at the auth provider, then
 * writes `status: "suspended"`. Refused unless the target is currently
 * `active`; refused for an owner's own row; refused for an allowlisted row
 * (rule 3 - reconciliation would silently undo it); refused for the last
 * active owner (rule 4). See AccountActionResult's own doc comment for the
 * three distinguishable ways the mutation itself can fail.
 */
export async function suspendAccountAction(accountId: string): Promise<AccountActionResult> {
  let actor: AuthorizedUser;
  try {
    actor = await requireAppOwner();
  } catch {
    return { kind: "not_authorized" };
  }
  return performAccountAction("suspend", accountId, actor);
}

/**
 * Restore a suspended account back to active - lifts the provider ban, then
 * writes `status: "active"`. Refused unless the target is currently
 * `suspended`. Deliberately exempt from the self-action guard (rule 2): it
 * only ever moves a row TOWARDS access, so an owner restoring their own
 * suspended row is consistent rather than dangerous.
 */
export async function restoreAccountAction(accountId: string): Promise<AccountActionResult> {
  let actor: AuthorizedUser;
  try {
    actor = await requireAppOwner();
  } catch {
    return { kind: "not_authorized" };
  }
  return performAccountAction("restore", accountId, actor);
}

/**
 * Grant `role: "owner"` to an active instructor account. Refused unless the
 * target is currently `active` and not already an owner; refused for an
 * owner's own row (rule 2); refused for the last-active-owner condition does
 * not apply here (promote only ever adds an owner, never removes one).
 */
export async function promoteAccountAction(accountId: string): Promise<AccountActionResult> {
  let actor: AuthorizedUser;
  try {
    actor = await requireAppOwner();
  } catch {
    return { kind: "not_authorized" };
  }
  return performAccountAction("promote", accountId, actor);
}

/**
 * Demote an owner account to `role: "instructor"`. Refused unless the target
 * currently holds `role: "owner"`; refused for an owner's own row (rule 2);
 * refused for an allowlisted row (rule 3); refused for the last active owner
 * (rule 4).
 */
export async function demoteAccountAction(accountId: string): Promise<AccountActionResult> {
  let actor: AuthorizedUser;
  try {
    actor = await requireAppOwner();
  } catch {
    return { kind: "not_authorized" };
  }
  return performAccountAction("demote", accountId, actor);
}
