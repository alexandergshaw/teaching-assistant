// Persistence for public.app_users - the account/role/status table that
// backs the request gate, the server-action guard, and the owner's admin
// surface. ensureAppUser is reconciled against from requireUser()
// (src/lib/supabase/auth.ts) - but only when appUserNeedsReconciliation
// (below) says the row could actually need a change; requireUser() already
// holds the verified email and the account row from its own authorization
// check, so it evaluates that PURE predicate itself before ever calling
// ensureAppUser, rather than calling ensureAppUser unconditionally the way
// this used to work. See ensureAppUser's own doc comment for exactly when
// reconciliation performs a write versus when it is a no-op, and
// appUserNeedsReconciliation's doc comment for the cost this split actually
// saves. See supabase/migrations/20261012000000_create_app_users.sql for the
// schema, the RLS policy set, and the trigger that creates a row at sign-up
// time.
//
// THIS MODULE PERFORMS NO AUTHORIZATION OF ITS OWN. It answers "what is
// this user's role and status" and writes rows on request. Deciding WHO is
// allowed to call setAppUserStatus/setAppUserRole, and what a caller does
// with a "pending" or "suspended" result, is entirely the responsibility of
// the code that calls into this module - it is not decided here. The one
// place this module DOES enforce a rule is ensureAppUser's OWNER_EMAILS
// reconciliation, and that is a data-integrity invariant ("an allowlisted
// email is always the owner, and one removed from the list is not"), not an
// access-control decision about the current request.
//
// THIS IS THE ONLY MODULE THAT WRITES public.app_users. Every write - the
// insert-if-missing in ensureAppUser, and the status/role mutations for the
// admin surface - goes through the service-role client
// (createServiceClient), which bypasses the table's RLS. That is
// deliberate, not an oversight: the migration grants `authenticated` a
// single SELECT-only policy and nothing else (see that file's header for
// why an update/delete policy on this table is a privilege-escalation
// hazard), so a cookie-bound client could never perform these writes even
// if this module tried to use one. Reads also go through the service-role
// client rather than the cookie-bound one: a cookie-bound read of another
// user's row is silently filtered to "no rows" by RLS, which is
// indistinguishable from "this account was never created" - exactly the
// ambiguity getAppUser's null-vs-throw split below exists to prevent. RLS
// on this table exists for defense in depth (see the migration), not as
// this module's access-control mechanism.
//
// getAppUser returns null for "no row" and THROWS for "the query itself
// failed" - two different control-flow shapes, not two values of the same
// return type, precisely so a caller cannot collapse them by accident. A
// caller that treated a database error as "no row" would then treat an
// unrelated outage as "this account does not exist yet", and depending on
// what it does with that ("pending" is a plausible fallback) that reads as
// merely inconvenient - until the same confusion is made in the other
// direction and an outage reads as "active". Throwing on error forces every
// caller to make that failure-mode decision explicitly instead of getting a
// misleading value.
//
// This is a server-only module: it must never be imported from a Client
// Component, and never imported by anything that ends up in a client
// bundle. It has no "use client" directive and never will.

import { cache } from "react";
import { createServiceClient } from "./server";
import type { Database } from "./types";
import { isOwnerEmail } from "../owner";
import { clampDisplayName } from "../display-name";

export type AppUserStatus = "pending" | "active" | "suspended";
export type AppUserRole = "owner" | "instructor";

export interface AppUserRow {
  id: string;
  /**
   * BUG 5 FIX: nullable, matching the migration's own `email text` column (no
   * `not null`) - a phone or anonymous auth.users account has no email at
   * all, and app_users.email is copied from it verbatim. This used to be
   * typed `string`, which type-checked but let a caller dereference
   * `row.email.toLowerCase()` (or similar) with no null check and throw at
   * runtime on exactly that kind of account. Every consumer in this module
   * and in ./auth.ts now treats it as possibly null.
   */
  email: string | null;
  displayName: string | null;
  status: AppUserStatus;
  role: AppUserRole;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Stamped by setAppUserStatus AND setAppUserRole on every write either
   * makes - unlike approvedAt/approvedBy, which stamp only the transition
   * onto 'active'. Null for a row never touched by either function. */
  statusChangedAt: string | null;
  statusChangedBy: string | null;
  /** GC1 FIX: set ONLY by setAppUserRole granting role='owner' - never by
   * setAppUserStatus or reconciliation. ownerDemotionNeeded gates on THIS,
   * not statusChangedBy - see that function's doc comment for why. */
  roleGrantedBy: string | null;
}

// Intersected in, not added to the generated Database type (types.tables-b.ts,
// outside this change's file set) - matches this file's typed-mapper idiom.
type DbAppUserRow = Database["public"]["Tables"]["app_users"]["Row"] & { role_granted_by: string | null };
type DbAppUserInsert = Database["public"]["Tables"]["app_users"]["Insert"];
type DbAppUserUpdate = Database["public"]["Tables"]["app_users"]["Update"] & { role_granted_by?: string | null };

/**
 * Map a raw app_users row (snake_case, as it comes back from Supabase) into
 * the camelCase shape the rest of the app reads. Exported so the mapping is
 * unit-testable without a live Supabase client - mirrors mapRecordingFile in
 * src/lib/recording-files.ts.
 */
export function mapAppUserRow(row: DbAppUserRow): AppUserRow {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    status: row.status as AppUserStatus,
    role: row.role as AppUserRole,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    statusChangedAt: row.status_changed_at,
    statusChangedBy: row.status_changed_by,
    roleGrantedBy: row.role_granted_by,
  };
}

/**
 * Uncached read by primary key - see getAppUser for the cached, exported
 * version. `signal` is optional and, when supplied, is attached via
 * postgrest-js's own `.abortSignal()` (see getAppUserWithTimeout below for
 * why the request gate needs one and getAppUser's other caller does not).
 * On abort, postgrest-js resolves normally with `{ data: null, error }`
 * rather than throwing - see PostgrestTransformBuilder.abortSignal's own
 * documented contract - so a timeout falls straight into the same `if
 * (error) throw` branch as any other query failure below, with no separate
 * handling required.
 */
async function fetchAppUserRow(userId: string, signal?: AbortSignal): Promise<AppUserRow | null> {
  const supabase = createServiceClient();
  const query = supabase.from("app_users").select("*").eq("id", userId);
  const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle();

  if (error) {
    throw new Error(`Could not read app_users row ${userId}: ${error.message}`);
  }
  if (!data) return null;
  return mapAppUserRow(data as DbAppUserRow);
}

/**
 * Read one account by id. Returns null when no row exists; THROWS when the
 * query itself fails - see this file's header for why those are
 * deliberately different control-flow shapes, not two values of one return
 * type. A caller that cannot tell the difference will be tempted to fail
 * open on an outage, and failing open here means an unapproved stranger
 * gets in.
 *
 * Wrapped in React's cache() so repeated calls with the same userId within
 * one request collapse to a single query - the guard this backs runs at
 * many call sites per request. Because of that memoization, do not use this
 * export where a freshly-written row must be observed within the same
 * request (e.g. immediately after a write in this same module) - use the
 * uncached fetchAppUserRow-based helpers (ensureAppUser, setAppUserStatus,
 * setAppUserRole) for that, which all read their own fresh row back from
 * the write itself rather than calling this cached export.
 */
export const getAppUser = cache(fetchAppUserRow);

/**
 * Same lookup as getAppUser, bounded by a caller-supplied timeout via
 * AbortSignal.timeout() instead of running unbounded - fixes the request
 * gate having no timeout at all (src/lib/supabase/proxy.ts, see its own
 * PROFILE_LOOKUP_TIMEOUT_MS comment for the exact value and why). A proxy
 * file cannot set `runtime` or `maxDuration`, so without this a Supabase
 * project that is slow but not fully down would hang every single request
 * until the PLATFORM's own function timeout kills it - worse than the
 * fail-closed redirect the gate is designed to give instead. A timed-out
 * lookup surfaces exactly like any other query failure (see
 * fetchAppUserRow's own comment on why abort does not need separate
 * handling), so a caller treats this identically to getAppUser: catch, and
 * treat the failure as `lookupFailed`.
 *
 * Deliberately NOT wrapped in React's cache() the way getAppUser is: a
 * fresh AbortSignal is a distinct object on every call, so it would never
 * hit as a cache key anyway, and the gate calls this at most once per
 * request.
 */
export async function getAppUserWithTimeout(userId: string, timeoutMs: number): Promise<AppUserRow | null> {
  return fetchAppUserRow(userId, AbortSignal.timeout(timeoutMs));
}

/**
 * All accounts, pending ones first (AC C1's admin surface wants pending
 * accounts to sort to the top regardless of when they were created), newest
 * first within each of those two groups. Service-role client: this reads
 * every user's row, which no RLS-respecting client could do under the
 * single own-row SELECT policy this table grants.
 */
export async function listAppUsers(): Promise<AppUserRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("app_users").select("*");

  if (error) {
    throw new Error(`Could not list app_users: ${error.message}`);
  }

  const rows = (data ?? []).map((row) => mapAppUserRow(row as DbAppUserRow));
  return rows.sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * ban_duration passed to auth.admin.updateUserById to suspend an account -
 * see setAppUserStatus below. The installed GoTrueAdminApi (@supabase/auth-js
 * 2.106.2) has no "ban forever" value, only a fixed duration or 'none' to
 * lift one, so a suspension is modeled as a duration long enough to be
 * effectively permanent. 100 years, in the unit format
 * AdminUserAttributes.ban_duration documents (a decimal number plus a unit
 * suffix - "ns" | "us"/"µs" | "ms" | "s" | "m" | "h") - the same value
 * Supabase's own updateUserById() reference example uses for "ban a user for
 * 100 years".
 */
const SUSPEND_BAN_DURATION = "876000h";
/** Passed to lift a ban - see setAppUserStatus. Documented on
 * AdminUserAttributes.ban_duration: "Setting the ban duration to 'none'
 * lifts the ban on the user." */
const LIFT_BAN_DURATION = "none";

/**
 * Approve, suspend, or restore an account. Stamps updated_at and
 * status_changed_at/status_changed_by always, and additionally stamps
 * approved_at/approved_by only when the transition LANDS ON 'active' - a
 * suspend or a no-op re-save of an already-active row must not overwrite an
 * existing approval record with the current instant and a possibly-different
 * approver.
 *
 * BUG-4 FIX (this table's `status` column enforces nothing by itself - every
 * RLS policy in this schema keys on auth.uid() alone, and the browser talks
 * directly to PostgREST/Storage, so writing 'suspended' here with nothing
 * else is UI-only and the account's live session keeps working). This
 * function additionally bans (status 'suspended') or unbans (any other
 * status) the actual Supabase account, via
 * `auth.admin.updateUserById(id, { ban_duration })` - read against the
 * INSTALLED @supabase/auth-js (2.106.2) typings
 * (node_modules/@supabase/auth-js/dist/main/GoTrueAdminApi.d.ts) rather than
 * assumed. It is the only method in that installed admin surface that can
 * act on an arbitrary account BY ID for this purpose:
 * `auth.admin.signOut(jwt, scope)` - the other candidate - takes the
 * ACCOUNT'S OWN LIVE JWT as its first argument (it POSTs that jwt as the
 * caller's Authorization header to Supabase's own /logout endpoint), not a
 * user id, and nothing in this module (or this table) holds a copy of any
 * user's access token to pass it. So signOut cannot be driven from an owner
 * action against someone else's id at all with what this codebase has
 * available.
 *
 * The ban/unban call happens BEFORE the app_users write. If THAT call fails,
 * its error is thrown immediately without ever touching the row - a suspend
 * or restore that never changed the real Supabase account is therefore never
 * reported as a success, and the stored status is left exactly as it was, so
 * the UI and the account stay consistent with each other on that failure.
 *
 * BUG 1 FIX: the OTHER failure - the ban/unban call SUCCEEDS but the
 * following `.update(...).select().single()` then fails - used to leave the
 * real account already changed at the provider while the row kept saying
 * whatever it said before, with NOTHING to notice the drift: nothing in this
 * repository ever reads `banned_until` (the admin list renders straight from
 * this row), so a suspend that "failed" here rendered as a healthy, active
 * account while the account was actually banned for 100 years at the
 * provider - and it could be UNRECOVERABLE from inside the app, because
 * calling this same function again to reverse it hits the identical
 * `.single()` failure mode (e.g. a row missing entirely, because the insert
 * trigger absorbed a `lower(email)` collision). On a SUSPEND whose row write
 * fails, this function now reverses the ban it just applied - before
 * re-throwing - so the account's provider state goes back to matching its
 * own (unchanged, because the write failed) row, exactly like the
 * ban-failure branch above already guarantees. The thrown error says the
 * account may be locked out, and says so more urgently if that reversal ALSO
 * fails, since that is the one case with no automatic recovery left.
 *
 * The other direction (approve/restore, which LIFTS a ban) is deliberately
 * NOT reversed on the same kind of failure: that call is harmless even when
 * the account was never banned at all (an approve of a `pending` account has
 * no ban to lift), so re-banning on a mere row-write failure would risk
 * actively banning an account that was never suspended - a worse outcome
 * than the failure being handled. Nothing is lost by skipping it either: the
 * app_users row, not the provider ban, is what `resolveAccess`
 * (src/lib/access.ts) actually gates on, so an account left unbanned with a
 * stale `pending`/`suspended` row stays denied by that row check regardless;
 * it only regains the provider ban's own separate layer of defense in depth
 * once the write is retried and succeeds.
 *
 * HONESTY NOTE, because this matters for what "suspended" actually promises:
 * banning blocks future sign-in and refresh-token grants at Supabase's own
 * token endpoint. It does NOT invalidate an access token already issued -
 * that token is a self-contained JWT that PostgREST/Storage verify purely by
 * signature and expiry, with no callback to the auth server, so it keeps
 * working for whatever lifetime it has left after this call returns. A
 * suspended account's access ends within that remaining window, not
 * instantly. That is a real limit of the installed admin API's surface, not
 * an oversight in this function.
 *
 * GC1 FIX: never writes `role_granted_by` - only setAppUserRole may, so this
 * function's ordinary actions never look like a human granting ownership.
 */
export async function setAppUserStatus(
  id: string,
  status: AppUserStatus,
  approvedBy: string | null
): Promise<AppUserRow> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { error: banError } = await supabase.auth.admin.updateUserById(id, {
    ban_duration: status === "suspended" ? SUSPEND_BAN_DURATION : LIFT_BAN_DURATION,
  });
  if (banError) {
    const verb = status === "suspended" ? "suspend" : "restore";
    throw new Error(`Could not ${verb} the Supabase session for app_users ${id}: ${banError.message}`);
  }

  const update: DbAppUserUpdate = {
    status,
    updated_at: now,
    status_changed_at: now,
    status_changed_by: approvedBy,
    ...(status === "active" ? { approved_at: now, approved_by: approvedBy } : {}),
  };

  const { data, error } = await supabase
    .from("app_users")
    .update(update as Database["public"]["Tables"]["app_users"]["Update"])
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (status === "suspended") {
      // BUG 1 FIX: the ban above already landed - reverse it before
      // re-throwing. See this function's own doc comment for the full
      // reasoning on why only THIS direction is compensated.
      const { error: liftError } = await supabase.auth.admin.updateUserById(id, {
        ban_duration: LIFT_BAN_DURATION,
      });
      if (liftError) {
        throw new Error(
          `Could not set status for app_users ${id}: ${error.message}. The account was already banned at ` +
            `the provider, and reversing that ban ALSO failed (${liftError.message}) - the account may be ` +
            `locked out at the provider with no automatic recovery. This needs manual intervention at the ` +
            `auth provider (lift the ban on user ${id} directly).`
        );
      }
      throw new Error(
        `Could not set status for app_users ${id}: ${error.message}. The provider-side ban has been ` +
          `reversed so the account is not left locked out while this write keeps failing - retry once the ` +
          `underlying error is resolved.`
      );
    }

    throw new Error(`Could not set status for app_users ${id}: ${error.message}`);
  }
  return mapAppUserRow(data as DbAppUserRow);
}

/**
 * Promote or demote an account between 'owner' and 'instructor'. Stamps
 * status_changed_at/status_changed_by (changedBy is the acting owner's id) -
 * a promotion or demotion is exactly as much of an account-state change as a
 * suspend or restore, and BUG-3 was that only the approve transition left
 * any record of who acted. Unlike setAppUserStatus, a role change never
 * needs to touch the account's Supabase session (role is an app-level
 * concept here, not something GoTrue's admin API bans or unbans).
 *
 * GC1 FIX: the ONLY function that ever writes `role_granted_by`. Promoting
 * to 'owner' stamps it with `changedBy`; demoting CLEARS it to null instead -
 * a stale value would mislead a later, unrelated promotion into inheriting a
 * "human granted this" marker it never earned.
 */
export async function setAppUserRole(
  id: string,
  role: AppUserRole,
  changedBy: string | null
): Promise<AppUserRow> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const update: DbAppUserUpdate = {
    role,
    updated_at: now,
    status_changed_at: now,
    status_changed_by: changedBy,
    role_granted_by: role === "owner" ? changedBy : null,
  };

  const { data, error } = await supabase
    .from("app_users")
    .update(update as Database["public"]["Tables"]["app_users"]["Update"])
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Could not set role for app_users ${id}: ${error.message}`);
  }
  return mapAppUserRow(data as DbAppUserRow);
}

/**
 * How many accounts are currently STORED role='owner' AND status='active'.
 *
 * GC5 NOTE: undercounts the real owner population - an OWNER_EMAILS address
 * that never signed in has no active row, invisible here even though it can
 * sign in as owner via the break-glass path. See countEffectiveOwners below
 * for "how many distinct owners exist"; this stays for existing callers.
 */
export async function countActiveOwners(): Promise<number> {
  const supabase = createServiceClient();
  const { count, error } = await supabase
    .from("app_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner")
    .eq("status", "active");

  if (error) {
    throw new Error(`Could not count active owners: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * GC5 FIX: the EFFECTIVE owner count - DISTINCT owner identities this
 * deployment has, whether or not each has signed in. The union of (a) stored
 * role='owner'/status='active' rows (countActiveOwners' own set) and (b)
 * every OWNER_EMAILS address - a UNION, not a sum, so an address in both
 * counts once, never twice.
 *
 * (a) alone undercounts: an OWNER_EMAILS address that never signed in has no
 * reconciled row, yet resolveAccess (src/lib/access.ts) grants it 'owner'
 * from the allowlist alone - a real owner countActiveOwners cannot see. A
 * SUSPENDED stored row still counts too: resolveAccess's break-glass check
 * returns 'owner' BEFORE the stored profile is read (its own doc comment,
 * step 3), so every OWNER_EMAILS address is added unconditionally.
 *
 * Emails are trimmed/lower-cased exactly like isOwnerEmail (src/lib/owner.ts)
 * - duplicated here because owner.ts exposes only a single-email predicate,
 * not the parsed allowlist. A stored row with a null email (BUG 5) is added
 * under a synthetic `id:<row id>` key so it still counts once.
 *
 * Deliberately uncached, with its own query - callers must invoke this
 * INSIDE the mutation they are guarding, never carry a value forward from an
 * earlier render.
 */
export async function countEffectiveOwners(): Promise<number> {
  const allowlisted = (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("role", "owner")
    .eq("status", "active");

  if (error) {
    throw new Error(`Could not count effective owners: ${error.message}`);
  }

  const identities = new Set<string>(allowlisted);
  for (const row of (data ?? []) as { id: string; email: string | null }[]) {
    identities.add(row.email ? row.email.trim().toLowerCase() : `id:${row.id}`);
  }
  return identities.size;
}

/**
 * Best-effort human name pulled from the VERIFIED auth user's own metadata
 * (`full_name`, then `name`) - the same two fields, in the same order,
 * src/lib/author.ts checks for the generated-document author fallback.
 * Duplicated here rather than imported: author.ts is a pure formatting
 * helper with its own unrelated fallback chain (a deployment-wide env var,
 * then a neutral default) that has nothing to do with what this module
 * writes to app_users.display_name, so importing it here for two lines of
 * metadata-reading would couple two modules that otherwise have no reason
 * to know about each other.
 *
 * BUG 2 FIX (AC B1): every candidate is run through `clampDisplayName`
 * (../display-name.ts) - the same clamp `validateSignup` (../signup-rules.ts)
 * applies to the form path. `user_metadata` is NOT this app's form: it is
 * written by `@supabase/supabase-js` calls the browser makes directly against
 * Supabase Auth with the public anon key, so `full_name`/`name` can carry
 * arbitrary length, control characters, or a bidi override with nothing of
 * this app's ever standing in the way - a name that reaches `app_users` by
 * this route bypasses `validateSignup` entirely, so clamping only in that one
 * place would leave this, the actual write path, wide open. `clampDisplayName`
 * is already total (returns `""` for anything unusable), so the old
 * `typeof candidate === "string" && candidate.trim()` guard is folded into it
 * rather than duplicated here.
 */
function nameFromAuthMetadata(user: { user_metadata?: unknown } | null | undefined): string | null {
  const meta = user?.user_metadata as { full_name?: unknown; name?: unknown } | undefined;
  for (const candidate of [meta?.full_name, meta?.name]) {
    const clamped = clampDisplayName(candidate);
    if (clamped) return clamped;
  }
  return null;
}

/**
 * The OWNER_EMAILS promotion half of the reconciliation rule: does `row`
 * need to become role='owner', status='active'? Extracted to its own named
 * function - rather than left as an inline expression inside ensureAppUser -
 * so appUserNeedsReconciliation (below) and ensureAppUser share the exact
 * same boolean, not two hand-written copies of it that could silently drift
 * apart.
 */
function ownerPromotionNeeded(row: Pick<AppUserRow, "role" | "status">, isOwner: boolean): boolean {
  return isOwner && !(row.role === "owner" && row.status === "active");
}

/**
 * The demotion half - see ownerPromotionNeeded above. `ownerEmailsConfigured`
 * is passed in rather than re-read from process.env here, so a single
 * decision (one call to appUserNeedsReconciliation, or one reconciliation
 * pass inside ensureAppUser) reads OWNER_EMAILS exactly once and both halves
 * of that decision agree on the same snapshot of it.
 *
 * FU1 GATE (docs/multi-user-login-acceptance-criteria.md, FU1): reconciliation
 * may demote a stored role='owner' row ONLY when its owner-hood came from
 * reconciliation itself, never a human's explicit grant - otherwise an
 * owner's promotion of a colleague would be silently reverted on their very
 * next request.
 *
 * GC1 FIX: the test is `roleGrantedBy === null`, NOT the original FU1 gate's
 * `statusChangedBy === null` - that column is ALSO the audit stamp
 * setAppUserStatus writes on approve/suspend/restore, so gating on it made a
 * merely-suspended-or-approved row look promoted, permanently disarming
 * revocation. `roleGrantedBy` is written ONLY by setAppUserRole granting
 * 'owner', so non-null means a human genuinely promoted this row.
 */
function ownerDemotionNeeded(
  row: Pick<AppUserRow, "role" | "roleGrantedBy">,
  isOwner: boolean,
  ownerEmailsConfigured: boolean
): boolean {
  return !isOwner && ownerEmailsConfigured && row.role === "owner" && row.roleGrantedBy === null;
}

/** The display_name fill half - see ownerPromotionNeeded above. */
function displayNameFillNeeded(row: Pick<AppUserRow, "displayName">): boolean {
  return !row.displayName;
}

/**
 * BUG 7 FIX: does the stored row's email differ from the CURRENT verified
 * auth email? `app_users.email` is written once, at insert time (the
 * trigger, or ensureAppUser's own insert-if-missing step below), and never
 * updated again otherwise - so a Supabase email change leaves this column
 * permanently stale. That is worse than a cosmetic staleness: the stale
 * value keeps occupying the unique `lower(email)` index
 * (`app_users_email_lower_idx`), so a DIFFERENT account that later, and
 * legitimately, changes ITS OWN email to this now-vacated address collides
 * against a row it has nothing to do with and gets no app_users row of its
 * own at all - which is BUG 3's failure mode again, fed by a different
 * cause.
 */
function emailUpdateNeeded(row: Pick<AppUserRow, "email">, verifiedEmail: string): boolean {
  return row.email !== verifiedEmail;
}

/**
 * Pure decision: could ensureAppUser's reconciliation possibly need to write
 * anything for this stored row / verified-email pair? This is the single
 * place the reconciliation RULE lives - both this function and ensureAppUser
 * consult the four named checks above rather than either one re-deriving
 * its own copy of "does this need to change".
 *
 * This exists so a caller that ALREADY holds the verified email and the
 * account row - which requireUser() (src/lib/supabase/auth.ts) does, from
 * its own authorization check - can decide whether calling ensureAppUser is
 * even worth doing, without paying ensureAppUser's own cost of finding that
 * out. That cost is two network round trips, not one: before ensureAppUser
 * can compare anything it first calls `supabase.auth.admin.getUserById` (an
 * admin API call, to re-verify the email) and then `fetchAppUserRow` (an
 * uncached row read) - so calling it unconditionally on every one of
 * requireUser()'s ~1000 call sites cost two extra round trips per request,
 * every request, even the overwhelmingly common case where the row is
 * already fully correct and nothing was ever going to change. Consulting
 * this predicate first - a pure, in-memory function with no I/O of its own -
 * turns that steady-state cost into ZERO extra round trips: ensureAppUser is
 * called only for a request where this returns true.
 *
 * A `false` return is a firm guarantee: no promote, no demote, no
 * display_name fill, and no email correction (BUG 7) could possibly apply,
 * so skipping ensureAppUser entirely is safe. `true` is NOT a guarantee that
 * ensureAppUser will actually write
 * anything - see displayNameFillNeeded above: this function cannot see
 * whether the verified auth user's metadata actually has a name to offer
 * (only ensureAppUser, which re-reads that metadata itself, knows that), so
 * it conservatively answers "might need reconciliation" whenever the stored
 * display_name is empty even if there turns out to be nothing to fill it
 * with. That is a false positive, never a false negative: at worst it costs
 * one redundant call to ensureAppUser (the same two round trips this used to
 * cost on every request), never a missed reconciliation - and it stops
 * recurring entirely once any request has filled the name in.
 */
export function appUserNeedsReconciliation(row: AppUserRow | null, email: string): boolean {
  if (!row) return true;

  const isOwner = isOwnerEmail(email);
  const ownerEmailsConfigured = (process.env.OWNER_EMAILS ?? "").trim() !== "";

  return (
    ownerPromotionNeeded(row, isOwner) ||
    ownerDemotionNeeded(row, isOwner, ownerEmailsConfigured) ||
    displayNameFillNeeded(row) ||
    emailUpdateNeeded(row, email)
  );
}

/**
 * Guarantee a usable row exists for this account, then reconcile it against
 * OWNER_EMAILS (AC A3's break-glass path) IN BOTH DIRECTIONS, and fill in a
 * missing display_name. Consulted from requireUser()
 * (src/lib/supabase/auth.ts) on every authorized, non-impersonated request -
 * but only when appUserNeedsReconciliation (above) says reconciliation could
 * possibly be needed; requireUser() checks that PURE predicate itself first
 * and skips calling this function entirely otherwise, which is what keeps
 * the overwhelmingly common case (an already-correct row) from paying this
 * function's own cost (an admin API call plus an uncached row read) at all.
 * ensureAppUser remains independently correct when called directly, by any
 * caller, with no such pre-check - it re-verifies everything itself rather
 * than trusting that a caller already confirmed reconciliation was
 * necessary; the invariant that matters most here is the one stated last: an
 * already-reconciled row must cost this function's own one read (plus the
 * admin lookup) and ZERO writes. Steps:
 *
 * 0. Read the VERIFIED email (and metadata name). `input` deliberately
 *    carries no `email` field: this function re-reads it itself, via
 *    `auth.admin.getUserById(input.id)`, rather than trusting a
 *    caller-supplied value. Nothing binds an arbitrary email to `input.id`,
 *    so a caller that accepted a form field or a `user_metadata` value and
 *    forwarded it here would let anyone grant themselves role='owner' by
 *    simply typing an allowlisted address - the write below has no other
 *    check standing between that email and full ownership. `input.displayName`
 *    is honoured only as an explicit override of the metadata-derived name
 *    (no current caller passes one; this exists for a future caller that
 *    has a more specific name to hand, e.g. one collected in an onboarding
 *    form).
 * 1. Read the current row FIRST, before writing anything. This is the read
 *    that makes the "no write on every request" invariant possible at all:
 *    once `current` is non-null, the insert-if-missing step below never
 *    runs, so a request against an account that already has a row costs
 *    exactly one SELECT, not a write attempt on every single call (this
 *    used to run the insert-if-missing upsert unconditionally, before
 *    checking whether a row already existed - harmless to the DATA thanks
 *    to ON CONFLICT DO NOTHING, but a wasted write statement issued on every
 *    one of requireUser()'s ~1000 call sites).
 * 2. Insert-if-missing, ONLY when step 1 found no row. Ordinarily the
 *    handle_new_auth_user trigger (see the migration) has already created
 *    the row by the time any application code runs; this upsert exists only
 *    to cover an account that predates the trigger. It is a plain
 *    ON CONFLICT DO NOTHING, never an overwrite of an existing row.
 * 3. Compute a SINGLE update object covering every field that needs to
 *    change (role/status for the OWNER_EMAILS reconciliation, display_name
 *    for the fill-in), and issue AT MOST ONE update call - never two
 *    separate writes for two conditions that both apply to the same
 *    request. If nothing needs to change, no update call happens at all.
 *    - An allowlisted email is FORCED to role='owner', status='active'
 *      whenever the stored row is not already exactly that, regardless of
 *      whatever pending/suspended state it was in. This is what lets an
 *      owner add an email to OWNER_EMAILS after the fact and have that
 *      account promoted on its next sign-in without touching SQL, and it is
 *      deliberately unconditional on prior state: the break-glass path must
 *      never be blocked by the approval workflow it exists to bypass.
 *      UNVERIFIED-EMAIL FIX: this promotion is additionally gated on the
 *      VERIFIED auth email's `email_confirmed_at` (re-read in step 0, from
 *      the admin API, never a caller-supplied value) - an allowlisted but
 *      not-yet-confirmed address is left with whatever role/status it
 *      already had, exactly mirroring resolveAccess's own break-glass gate
 *      in src/lib/access.ts. Only the promotion is gated this way; a row
 *      that is already role='owner' is never re-litigated by this check (see
 *      the demotion branch immediately below, which reasons from `isOwner`
 *      alone).
 *    - A stored role='owner' row whose email is NOT on the (non-empty)
 *      allowlist is demoted to 'instructor', and (BUG 1 FIX) its status is
 *      ALSO reset to 'pending' unless a human has explicitly approved this
 *      account (see ownerDemotionNeeded's and this function's own inline
 *      comments on the demotion branch for the full reasoning and why
 *      `approved_by`, not `approved_at`, is the field that decides this).
 *      `isOwnerEmail` already reads `OWNER_EMAILS` fresh on every call, so an
 *      owner removed from the env var immediately loses the LIVE break-glass
 *      elevation; without this demotion the STORED row would keep reading
 *      role='owner' forever, which is a live privilege the moment any code
 *      trusts the stored role instead of re-deriving it (as the admin
 *      surface's "who is an owner" listing does). Demotion itself is further
 *      gated (see ownerDemotionNeeded) to a row that reconciliation itself
 *      promoted - an owner explicitly promoted by another owner through the
 *      admin surface is never silently reverted here.
 *    - When OWNER_EMAILS is UNSET or empty, nothing is demoted. An env var
 *      that never reached the deployment (a typo, a missing config, a
 *      preview branch) must not be indistinguishable from "revoke every
 *      owner" - that mirrors isOwnerEmail's own fail-closed-on-empty
 *      contract, applied to demotion instead of grant.
 *    - Every promotion or demotion this function performs (BUG 6 FIX) also
 *      stamps `status_changed_at`/`status_changed_by` - null actor, see the
 *      inline comment at that stamp for why - and a promotion additionally
 *      carries `approved_by` forward (see the promotion branch).
 *    - `display_name` is filled in only when the stored row's is currently
 *      empty AND a name resolved from step 0. An existing display_name is
 *      NEVER overwritten by this function - a user who set their own name
 *      (however that happens) owns it from then on; this only covers the
 *      account that has never had one recorded at all, which is the gap
 *      that left every generated document falling back to a neutral author
 *      (see src/app/api/automations/run-now/route.ts's own comment on why
 *      it reads this field).
 *    - `email` is corrected (BUG 7 FIX) whenever it differs from the
 *      verified auth email read in step 0 - see emailUpdateNeeded's own doc
 *      comment.
 */
export async function ensureAppUser(input: {
  id: string;
  displayName?: string | null;
}): Promise<AppUserRow> {
  const supabase = createServiceClient();

  const { data: authRes, error: authError } = await supabase.auth.admin.getUserById(input.id);
  if (authError || !authRes?.user) {
    throw new Error(
      `Could not verify the auth identity for ${input.id}: ${authError?.message ?? "no such user"}`
    );
  }
  const email = authRes.user.email;
  if (!email) {
    throw new Error(`Auth user ${input.id} has no email on file; cannot ensure an app_users row.`);
  }
  const resolvedDisplayName =
    typeof input.displayName === "string" && input.displayName.trim()
      ? input.displayName.trim()
      : nameFromAuthMetadata(authRes.user);

  let current = await fetchAppUserRow(input.id);

  if (!current) {
    const insertRow: DbAppUserInsert = {
      id: input.id,
      email,
      display_name: resolvedDisplayName,
    };

    // BUG FIX: no `onConflict` target. `{ onConflict: "id" }` makes PostgREST
    // emit `ON CONFLICT (id) DO NOTHING`, which absorbs a duplicate primary
    // key but does NOT absorb a violation of the separate unique
    // `lower(email)` index this table also carries (see the migration's
    // app_users_email_lower_idx) - two auth.users rows whose emails differ
    // only in case then raise 23505 HERE, and ensureAppUser throws, forever,
    // on every request for that account: the account has no row, so the gate
    // reads it as `pending`, and because the admin surface's pending queue
    // also reads app_users, the account never appears there either - neither
    // side can diagnose it. Omitting the option entirely, rather than naming
    // both columns, makes PostgREST emit a TARGET-LESS `ON CONFLICT DO
    // NOTHING`, which Postgres defines as absorbing a violation of ANY unique
    // or exclusion constraint on the table - the exact behavior
    // handle_new_auth_user's own trigger already relies on (see
    // supabase/migrations/20261012000000_create_app_users.sql: `insert ...
    // on conflict do nothing`, no target named there either). This insert
    // exists only to cover an account that predates that trigger (see this
    // function's own doc comment, step 2), so it must absorb the same
    // conflicts the trigger does, not a narrower set.
    const { error: insertError } = await supabase
      .from("app_users")
      .upsert(insertRow, { ignoreDuplicates: true });

    if (insertError) {
      throw new Error(`Could not ensure app_users row for ${input.id}: ${insertError.message}`);
    }

    current = await fetchAppUserRow(input.id);
    if (!current) {
      throw new Error(`app_users row for ${input.id} is missing immediately after ensureAppUser's own insert`);
    }
  }

  const isOwner = isOwnerEmail(email);
  // UNVERIFIED-EMAIL FIX (distinct from this file's own "BUG 1 FIX" below,
  // which is about the demotion branch's status reset): mirrors
  // resolveAccess's ResolveAccessInput.emailVerified gate on the OWNER_EMAILS
  // break-glass (see src/lib/access.ts) - this function re-reads the auth
  // user from the admin API above, so it already has `email_confirmed_at` on
  // hand. Without this, reconciliation could write role='owner' for an
  // allowlisted-but-unverified address even on a request the gate itself
  // refused to authorize as owner (the gate's own decision never depended on
  // this write succeeding - see requireUser()'s reconcileAppUserRow doc
  // comment - so nothing else stood between an unverified claim and a stored
  // owner row). Gates the PROMOTION branch only, immediately below - an
  // unverified address that already holds a stored role='owner' row (e.g.
  // its verification state briefly flapped) is left exactly as-is: `isOwner`
  // itself is NOT redefined in terms of this flag, so the demotion branch's
  // own `!isOwner` check is unaffected and cannot misread "not yet verified"
  // as "not on the allowlist" and demote someone still on it.
  const emailVerified = Boolean(authRes.user.email_confirmed_at);
  // Not on the allowlist: a stale role='owner' row is demoted only when
  // OWNER_EMAILS is actually configured - see appUserNeedsReconciliation's
  // and ownerDemotionNeeded's doc comments for why an unset/empty allowlist
  // must change nothing here.
  const ownerEmailsConfigured = (process.env.OWNER_EMAILS ?? "").trim() !== "";

  const update: DbAppUserUpdate = {};

  if (ownerPromotionNeeded(current, isOwner) && emailVerified) {
    update.role = "owner";
    update.status = "active";
    update.approved_at = current.approvedAt ?? new Date().toISOString();
    // BUG 6 FIX: preserve a genuine prior human approver rather than leaving
    // the field untouched. A row that has never been explicitly approved by
    // anyone (current.approvedBy is already null) stays null - see this
    // function's doc comment, step 3a, for why that null is this function's
    // sentinel for "the system did this", not an oversight.
    update.approved_by = current.approvedBy;
  } else if (ownerDemotionNeeded(current, isOwner, ownerEmailsConfigured)) {
    update.role = "instructor";
    // BUG 1 FIX: `status` used to be deliberately absent from this branch -
    // demotion left it untouched, which is exactly BLOCKER 1
    // (docs/multi-user-login-acceptance-criteria.md, "DEPLOY GATE"): an
    // address that is, or ever WAS, on OWNER_EMAILS became a permanently
    // active account, because resolveAccess (../access.ts) reads
    // status='active' at face value without ever re-consulting the
    // allowlist, and nothing else could ever flip it back. `status` is now
    // ALSO reset to 'pending' - but only when this account was never
    // explicitly approved by a human owner (current.approvedBy is null,
    // never set by setAppUserStatus's approve transition - see that
    // function above). An account a human DID explicitly approve keeps its
    // active status; only the allowlist-granted role reverts. Deliberately
    // checks `approved_by`, not `approved_at`: the promotion branch above
    // stamps `approved_at` on every allowlist-driven promotion too (to
    // preserve a genuine prior approval date, or else record when
    // reconciliation itself granted access), so by the time a row is ever
    // eligible for demotion its `approved_at` is essentially always
    // non-null - checking it here would defeat this exact fix for the
    // scenario it exists to catch (a co-instructor added to OWNER_EMAILS for
    // one term and then removed, per docs/REGRESSION.md entry 398 point B1).
    // `approved_by` is null in that scenario and non-null only when a human
    // genuinely clicked "approve" through the admin surface, which is the
    // distinction this fix actually needs.
    if (current.approvedBy === null) {
      update.status = "pending";
    }
  }

  // BUG 6 FIX: stamp status_changed_at/status_changed_by on every role or
  // status write this function makes, exactly like setAppUserStatus and
  // setAppUserRole (above) stamp theirs on every write THEY make - this used
  // to be the one writer of role/status that left no record at all of what
  // changed or when. The actor defaults to `null`, not a fabricated id: both
  // `approved_by` and `status_changed_by` are `uuid references
  // auth.users(id)` (see the migration), so a synthetic non-human sentinel
  // string cannot be written there without violating that foreign key, and
  // there is no dedicated "system" row in auth.users to point at instead
  // (adding one is a schema change outside this fix's scope). A non-null
  // `status_changed_at` paired with a null `status_changed_by` is this
  // module's honest, self-documenting substitute for "OWNER_EMAILS
  // reconciliation did this, not a person."
  //
  // BUG 2 FIX: that sentinel must not OVERWRITE a genuine human actor. The
  // promotion branch above can fire against a row an owner just suspended
  // (setAppUserStatus stamps status_changed_by with that owner's real id) -
  // reconciliation then runs on that account's very next request (its token
  // is still valid) and promotes it straight back via the OWNER_EMAILS
  // break-glass path. Force-writing `null` here would silently erase the
  // owner's own action from the record: the admin surface renders a null
  // actor as "automatically", so the owner's deliberate suspend would read
  // as a system event with no way to tell it apart from a genuine one.
  // Preserving `current.statusChangedBy` when it is already non-null fixes
  // that; when it is null (the common case - a row reconciliation itself
  // promoted, or one that has never been touched by a human), this writes
  // exactly the same `null` as before.
  //
  // GC1 FOLLOW-ON: no longer symmetric with promotion. The OLD gate meant
  // demotion could only fire when `statusChangedBy` was already null; the
  // new `roleGrantedBy` gate lets it fire on a row whose `statusChangedBy`
  // is non-null (e.g. suspended, then later demoted) - preserving that would
  // misattribute reconciliation's own action, so demotion always writes
  // `null`; only promotion preserves it.
  if (update.role !== undefined || update.status !== undefined) {
    update.status_changed_at = new Date().toISOString();
    update.status_changed_by = update.role === "owner" ? current.statusChangedBy : null;
  }

  if (displayNameFillNeeded(current) && resolvedDisplayName) {
    update.display_name = resolvedDisplayName;
  }

  // BUG 7 FIX: keep app_users.email in step with the VERIFIED auth email
  // (never a caller-supplied value - see step 0 above) rather than leaving
  // whatever was written at insert time. See emailUpdateNeeded's own doc
  // comment for why a stale value here is not merely cosmetic.
  if (emailUpdateNeeded(current, email)) {
    update.email = email;
  }

  if (Object.keys(update).length === 0) {
    return current;
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("app_users")
    .update(update as Database["public"]["Tables"]["app_users"]["Update"])
    .eq("id", input.id)
    .select()
    .single();

  if (error) {
    throw new Error(`Could not reconcile app_users ${input.id}: ${error.message}`);
  }
  return mapAppUserRow(data as DbAppUserRow);
}

/**
 * BUG 3 FIX: create a bare app_users row for `userId` when one does not
 * exist yet - and ONLY that; no OWNER_EMAILS promote/demote, no
 * display_name fill, no email correction. This is the insert-only entry
 * point requireUser() (src/lib/supabase/auth.ts) calls for a request that
 * resolveSessionAccess found to have NO row at all, immediately BEFORE that
 * request is denied.
 *
 * WHY A SEPARATE FUNCTION, NOT A CALL INTO ensureAppUser: requireUser()
 * throws on a denied decision before it ever reaches reconcileAppUserRow
 * (full reconciliation runs only AFTER `canUseApp(decision)` passes) - so an
 * account with no row at all resolves to 'pending' and is denied without
 * ensureAppUser ever running for it, which is exactly the account the
 * migration's own trigger comment promises will be recovered
 * ("ensureAppUser inserts the missing row itself on that account's very next
 * request" - supabase/migrations/20261012000000_create_app_users.sql,
 * on handle_new_auth_user's exception-swallow). That promise was false: the
 * recovery path could never fire for the one case it exists to cover.
 * Calling the FULL ensureAppUser from inside a denied branch would be worse
 * than not fixing this at all - it would also promote/demote and stamp
 * display_name/email for a request this application has explicitly decided
 * not to trust yet, and it throws outright on a verified user with no email
 * (BUG 5 made that a real, not hypothetical, account shape). This function
 * performs exactly the recovery the trigger's comment describes and nothing
 * more:
 *
 *   - Re-reads the row (uncached) in case one was created between
 *     resolveSessionAccess's own lookup and this call - never overwrites an
 *     existing row.
 *   - Re-verifies the identity via `auth.admin.getUserById`, exactly like
 *     ensureAppUser does, rather than trusting a caller-supplied email -
 *     nothing here could grant elevated access even if that verification
 *     were skipped (the insert always leaves role/status at their column
 *     defaults, 'instructor'/'pending'), but re-deriving the email from the
 *     verified identity keeps this function honest to the same rule
 *     ensureAppUser follows.
 *   - Tolerates a null email (BUG 5) instead of throwing - a phone or
 *     anonymous account legitimately has none, and the row this function
 *     creates for such an account is exactly what the trigger itself would
 *     have inserted (`insert (id, email) values (new.id, new.email)`, no
 *     null check either).
 *   - Uses the SAME target-less upsert as ensureAppUser's own
 *     insert-if-missing step (see that function's inline comment) so a
 *     case-differing duplicate email is absorbed the same way here too.
 *
 * PRESERVES THE "a denied request performs no OTHER reconciliation write"
 * property: an account that ALREADY has a row (pending or suspended) is
 * completely untouched by this function - the early `if (existing) return`
 * below is what keeps this narrower than ensureAppUser, not merely a
 * micro-optimization. requireUser() itself only calls this when its own
 * `row` lookup came back null, so that gate is enforced at both call sites.
 *
 * Best-effort, like reconcileAppUserRow in ./auth.ts: any failure here is
 * swallowed by the caller and simply retried on this account's next denied
 * request - it must never change what the CURRENT request's own decision
 * throws.
 */
export async function ensureAppUserRowExists(userId: string): Promise<void> {
  const existing = await fetchAppUserRow(userId);
  if (existing) return;

  const supabase = createServiceClient();
  const { data: authRes, error: authError } = await supabase.auth.admin.getUserById(userId);
  if (authError || !authRes?.user) {
    return;
  }

  const insertRow: DbAppUserInsert = {
    id: userId,
    email: authRes.user.email ?? null,
    display_name: nameFromAuthMetadata(authRes.user),
  };

  await supabase.from("app_users").upsert(insertRow, { ignoreDuplicates: true });
}
