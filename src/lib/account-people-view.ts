/**
 * The pure view-model behind the owner's account list (docs/multi-user-
 * login-acceptance-criteria.md C1, C2, C7, GC2, GC5, GC7).
 *
 * WHY THIS IS A SEPARATE MODULE FROM THE PAGE. Every rule below is a
 * decision an owner acts on - whom to approve, whose access to revoke - and
 * this repo's vitest is node-environment and collects only test files
 * ending `.test.ts`, never `.test.tsx`, so NO component is ever rendered by
 * the suite. A rule that lives in JSX is a rule nothing can test. So the
 * page owns layout and copy and nothing else: sorting, the allowlist
 * override, name clamping, actor attribution and every action verdict live
 * here, where a test can actually exercise them.
 *
 * THIS MODULE READS NO ENVIRONMENT AND NO AMBIENT STATE. That is deliberate
 * and easy to undo by accident - see the module doc comment on
 * ./account-admin-rules.ts for the concrete failure mode (a `process.env`
 * read that is `undefined` in the browser bundle, silently landing on the
 * permissive branch while the server refuses, which is exactly the
 * "enabled, then rejected" shape this app's UX standard forbids). The same
 * reasoning applies here without modification: `isAllowlisted` arrives
 * already resolved on each `AccountPersonInput`, and `effectiveOwnerCount`
 * arrives already computed on the context, both decided ONCE, server-side,
 * by whatever assembles the page's data. This module never calls
 * `isOwnerEmail`, never reads `process.env`, and never counts owners itself
 * - doing any of those here would let this module's answer disagree with
 * the server action's answer for the same row, which is the one outcome
 * every part of this design exists to prevent.
 *
 * THE ALLOWLIST OVERRIDE CHANGES WHAT IS DISPLAYED, NOT WHAT IS DECIDED.
 * `requireAppOwner`'s break-glass admits an allowlisted address as
 * `owner`/`active` without ever reading or reconciling its stored row, so
 * such a row's `effectiveRole` / `effectiveStatus` here are the override,
 * not the database - otherwise the owner would meet their own account as a
 * pending instructor in their own approval queue (see the GC2 tests). But
 * `canPerformAccountAction` (./account-admin-rules.ts) is given the row's
 * REAL STORED role and status, never the override: its last-owner check,
 * its starting-state preconditions and its own allowlist refusal are all
 * written against the database as it actually is, and feeding it the
 * overridden values would silently change verdicts it was never designed to
 * produce for this row (an allowlisted `instructor`/`pending` row would look
 * to the rules like an already-active owner, which it is not, and never
 * mind that the rules' own allowlist branch would then never see
 * `isAllowlisted: true` attached to the target it actually needs to refuse).
 * Get this backwards and several tests below can still pass by coincidence
 * - see `buildAccountRows` for where this choice is made and why it is safe
 * to get right even though nothing forces it.
 *
 * THE OVERRIDE ITSELF REQUIRES THE SAME TWO CONDITIONS THE BREAK-GLASS DOES.
 * `resolveAccess` (./access.ts) grants `owner` through `OWNER_EMAILS` only
 * when the address is ALSO verified - `isOwnerEmail(email) &&
 * input.emailVerified` (see BUG 1 there). `isAllowlisted` alone is an
 * unconfirmed CLAIM on an address, not a fact about the account: most
 * dangerously, it is exactly the shape of someone claiming an
 * allowlisted-but-not-yet-signed-up address before its real owner ever
 * signs up. This module mirrors that condition exactly: `person.
 * isAllowlisted` on its own no longer drives `effectiveRole` /
 * `effectiveStatus`, the `"allowlist"` ownership badge, or the allowlist
 * protection `canPerformAccountAction`'s rule 3 gives against suspend/
 * demote - all three now also require `person.emailVerified`. An
 * allowlisted-but-unverified row gets its OWN ownership badge
 * (`"allowlistUnverified"`, see `AccountOwnershipBadge`) rather than being
 * folded into `"allowlist"` (which would crown an unverified claim) or
 * `"none"` (which would hide that anything unusual is going on) - the page
 * needs to warn about this row specifically.
 */

import {
  ACCOUNT_ACTIONS,
  canPerformAccountAction,
  type AccountAction,
  type AccountActionContext,
  type AccountActionVerdict,
} from "./account-admin-rules";
import { clampDisplayName } from "./display-name";
import type { AccessRole, AccessStatus } from "./access";

/**
 * One stored account row, as the page reads it. Every field here is a fact
 * about the database (or, for `isAllowlisted`, a fact the caller resolved
 * against the environment on this module's behalf) - nothing on this shape
 * is itself a judgement. The judgements this module makes (effective role,
 * ownership badge, sort position, action verdicts) all live on `AccountRow`
 * below, derived FROM this input, never folded back into it.
 */
export interface AccountPersonInput {
  id: string;
  /** Nullable: `app_users.email` is nullable (a phone or anonymous sign-in has none). */
  email: string | null;
  /**
   * Self-asserted and unclamped at this layer on purpose - see
   * `clampDisplayName`'s own doc comment for why the clamp has to run again
   * here rather than being trusted from storage.
   */
  displayName: string | null;
  role: AccessRole;
  status: AccessStatus;
  /**
   * `app_users.created_at` is `timestamptz not null default now()` (the
   * create-table migration) and `mapAppUserRow` (./supabase/app-users.ts)
   * types this `string`, never `string | null` - so there is no production
   * caller that can hand this function a missing timestamp, and it is typed
   * to match rather than defensively widened for a case that cannot occur.
   * See `AccountRow.accountRecordCreatedAt` for why this is not named for
   * what most rows happen to mean by it.
   */
  createdAt: string;
  /** When `status` last changed, if this app recorded it. */
  statusChangedAt: string | null;
  /**
   * Who (or what) last changed `status` - an account id, or `null` when the
   * change was not attributed to a person (a migration backfill, a system
   * reconciliation). Resolved to something displayable by
   * `describeStatusActor`, never rendered as this raw id.
   */
  statusChangedBy: string | null;
  /**
   * Whether this row's email currently resolves through the `OWNER_EMAILS`
   * break-glass, decided by the caller exactly once, server-side. See the
   * module doc comment - this is the field that stands in for an
   * environment read this module is not allowed to make itself.
   *
   * On its own this is NOT sufficient for the override below to apply - see
   * `emailVerified`.
   */
  isAllowlisted: boolean;
  /**
   * Whether the auth provider has confirmed this row's own email address -
   * the identical signal `resolveAccess` (./access.ts) requires, ANDed with
   * `isOwnerEmail`, before its break-glass will return `"owner"` for this
   * address at all. REQUIRED, not optional and not defaulted, for the same
   * reason `ResolveAccessInput.emailVerified` is required: an
   * allowlisted-but-unverified row is BUG 1 one layer up - an address that
   * has not proven it belongs to whoever is holding this session, most
   * dangerously one somebody else claimed by creating the account first,
   * before its real owner ever signed up. A permissive default (verified
   * when omitted) would silently render such a claimant as an owner and
   * then, doubly wrong, refuse to let a real owner remove them (see
   * `buildAccountRows` for exactly how). A forgotten caller must fail to
   * compile, not fail open at runtime.
   */
  emailVerified: boolean;
}

/**
 * Everything about the ACTOR (the signed-in owner looking at this list) that
 * this module needs, plus the one piece of global state
 * `canPerformAccountAction`'s last-owner rule depends on.
 */
export interface AccountPeopleViewContext {
  /** The account viewing (and potentially acting on) this list. */
  actorId: string;
  actorRole: AccessRole;
  /**
   * How many accounts are CURRENTLY `role: "owner"` AND `status: "active"`,
   * counting any allowlisted row as an owner even if its stored row has
   * never been reconciled. This must be the caller's EFFECTIVE count, not
   * whatever a plain `COUNT(*) WHERE role = 'owner' AND status = 'active'`
   * would return: that query alone reads zero while an allowlisted owner who
   * has never signed in exists, which would refuse every demotion in the
   * deployment. This module does not recompute it and must not - see the
   * module doc comment.
   */
  effectiveOwnerCount: number;
  /**
   * Email addresses for accounts that might appear as a `statusChangedBy`
   * actor, keyed by account id. A missing key is expected and handled - see
   * `describeStatusActor`.
   */
  actorEmailById: Record<string, string>;
}

/**
 * Who or what last changed a row's status, as something the page can render
 * WITHOUT ever having a raw account id in hand to print by accident. A
 * plain formatted string could not carry this guarantee: nothing would stop
 * a future edit from interpolating the id into it as a fallback "at least
 * show something" case. A discriminated union has no branch that carries an
 * id, so there is nothing for such a mistake to reach for.
 *
 * `"never"` is produced by `buildAccountRows`, not by `describeStatusActor`
 * below - see that function's own comment for why it cannot tell the
 * difference itself. It exists because `{ kind: "system" }` used to be
 * returned for two genuinely different situations: reconciliation (or the
 * migration backfill) recording a change with no human attribution, AND a
 * brand-new row that has never had ANY status change recorded at all
 * (`statusChangedAt` and `statusChangedBy` both null from the moment the
 * row was created). Reporting "Automatically" for a row nothing has ever
 * happened to would attribute an event that never occurred - a fresh
 * pending account has no history to summarise, not a system-authored one.
 */
export type StatusActor =
  | { kind: "system" }
  | { kind: "person"; email: string }
  | { kind: "unknown" }
  | { kind: "never" };

/**
 * Resolves a `statusChangedBy` id to something an owner-facing list can
 * print.
 *
 * - `null`, or a string that is empty or all whitespace, is the SYSTEM,
 *   never "somebody": the backfill and any automated reconciliation record
 *   no actor at all, and reporting one anyway would invent an accountable
 *   person where there was none (C7's "reconciliation is not a person").
 * - An id present in `actorEmailById` resolves to that person's email.
 * - An id that is present but NOT in the map resolves to `unknown` -
 *   DELIBERATELY, not to the id itself. The id is a real, valid account id
 *   (the actor row was simply not included in whatever query built
 *   `actorEmailById`, or has since been deleted); it is not garbage input.
 *   But a uuid rendered in an owner-facing list is not an attribution, it
 *   reads like one while conveying nothing a person can act on, so this
 *   function refuses to be the path by which one leaks into the UI. The
 *   union's `unknown` branch carries no field at all, so there is nothing
 *   left on it for a caller to print instead.
 *
 * `hasOwnProperty` is checked explicitly rather than a bare `actorEmailById
 * [actorId]` lookup: a bracket lookup for an id that happens to collide with
 * an inherited `Object.prototype` member (`"constructor"`, `"toString"`)
 * would return that inherited value instead of `undefined`, which could
 * misreport a real account as `unknown` or, worse, resolve to something
 * that is not a string at all. `actorEmailById` is caller-assembled, not
 * user input, but an id is still an opaque string as far as this function
 * is concerned, and the guard costs nothing.
 *
 * This function only ever resolves an ACTOR id - it has no visibility into
 * `statusChangedAt`, so it cannot itself distinguish "an unattributed change
 * happened" from "no change has ever happened" (both arrive here as a null
 * `actorId`, and both currently return `{ kind: "system" }`). That
 * distinction is made by `buildAccountRows`, which has both fields and
 * substitutes `{ kind: "never" }` before ever calling this function - see
 * `StatusActor`'s own comment.
 */
export function describeStatusActor(
  actorId: string | null,
  actorEmailById: Readonly<Record<string, string>>
): StatusActor {
  if (typeof actorId !== "string" || actorId.trim() === "") {
    return { kind: "system" };
  }

  if (Object.prototype.hasOwnProperty.call(actorEmailById, actorId)) {
    const email = actorEmailById[actorId];
    if (typeof email === "string") {
      return { kind: "person", email };
    }
  }

  return { kind: "unknown" };
}

/** `AccessStatus === "pending"` sorts to group 0 (top); everything else to group 1. */
function statusSortGroup(status: AccessStatus): 0 | 1 {
  return status === "pending" ? 0 : 1;
}

/**
 * A row's `createdAt` reduced to a number usable for descending sort: a
 * valid ISO instant becomes its millisecond timestamp, and an unparsable
 * value becomes negative infinity so it always sorts as the OLDEST possible
 * row (last within its group) rather than throwing or floating to the top.
 * `Date.parse` failures return `NaN`, and `NaN` is excluded from
 * `Number.isFinite`, so a malformed timestamp must not let a row jump the
 * queue. `createdAt` cannot be `null` at this module's boundary any more -
 * see `AccountPersonInput.createdAt`'s own comment - but a corrupt STRING
 * (hand-edited data, a future column widening) is still a real possibility
 * and must still fail closed rather than throw.
 */
function createdAtSortRank(createdAt: string): number {
  const parsed = Date.parse(createdAt);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/** Descending numeric compare (larger first) that is well-defined for +/-Infinity, unlike `b - a`. */
function compareDescending(a: number, b: number): number {
  if (a === b) {
    return 0;
  }
  return a > b ? -1 : 1;
}

/**
 * The final, exhaustive tiebreak: plain UTF-16 code-unit order on `id`.
 * `localeCompare` is deliberately avoided - its collation depends on the
 * ICU data available in whatever environment happens to run this code, so
 * the SAME two rows could sort in different relative order on a server with
 * different ICU support than a developer's machine. Every account id here
 * is already a uuid, so there is no human-readable ordering to respect
 * anyway; a fixed, environment-independent order is strictly better.
 */
function compareIds(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/**
 * Pending rows above everything else, newest first within each group, and a
 * total, environment-independent tiebreak so that two rows sharing a
 * timestamp always land in the same relative order no matter what order
 * they were supplied in. That last property is not cosmetic: the migration
 * backfill gives every pre-existing row the SAME `createdAt` (see
 * `AccountRow.accountRecordCreatedAt`'s doc comment), so on a freshly
 * migrated deployment most of the list is one large tied group. Relying on
 * `Array.prototype.sort`'s stability alone would have made the visible
 * order depend on whatever order the query happened to return rows in
 * (itself not guaranteed by Postgres without an `ORDER BY`), which would
 * reorder the list between renders and could move a row out from under an
 * owner's pointer mid-click. Sorting on `id` as the last tiebreak removes
 * that dependency entirely.
 */
export function sortAccountPeople(people: readonly AccountPersonInput[]): AccountPersonInput[] {
  return [...people].sort((a, b) => {
    const groupDelta = statusSortGroup(a.status) - statusSortGroup(b.status);
    if (groupDelta !== 0) {
      return groupDelta;
    }

    const timeCompare = compareDescending(createdAtSortRank(a.createdAt), createdAtSortRank(b.createdAt));
    if (timeCompare !== 0) {
      return timeCompare;
    }

    return compareIds(a.id, b.id);
  });
}

/**
 * Why an owner badge is showing on this row, so the page can name the
 * reason rather than just showing a badge:
 *   - `"allowlist"`: this row reads as owner/active SOLELY because its
 *     email resolves through `OWNER_EMAILS` AND is verified, whatever its
 *     stored row says.
 *   - `"allowlistUnverified"`: this row's email resolves through
 *     `OWNER_EMAILS` but has NOT been confirmed by the auth provider, so -
 *     unlike `"allowlist"` - nothing here is actually true yet:
 *     `resolveAccess` (./access.ts) will not grant this address `owner`
 *     until it is verified, and `canPerformAccountAction` extends this row
 *     NONE of the allowlist's suspend/demote protection (see
 *     `buildAccountRows` for both). The row renders its ordinary STORED
 *     role/status, exactly like `"none"` would - but folding it into
 *     `"none"` would hide from the owner that this address is one email
 *     confirmation away from claiming a permanent seat, which is the one
 *     fact this badge exists to surface.
 *   - `"stored"`: the stored row itself is `owner`/`active` - a genuine,
 *     reconciled owner, not (or not only) an allowlist artifact.
 *   - `"none"`: not currently an owner by any path.
 * A row can never be more than one of these: the allowlist checks run
 * first, so an allowlisted-and-verified row that ALSO happens to be stored
 * as `owner`/`active` still reports `"allowlist"` - the badge names the
 * more surprising, more load-bearing fact (this row's ownership survives a
 * database outage) rather than the merely confirmatory one.
 */
export type AccountOwnershipBadge = "allowlist" | "allowlistUnverified" | "stored" | "none";

/**
 * One row of the owner's account list: every field the page needs to render
 * it, and nothing it would have to compute itself.
 */
export interface AccountRow {
  id: string;
  email: string | null;
  /** Already clamped - see `buildAccountRows` for why this must be re-applied here, not trusted from storage. */
  displayName: string;
  /** The role exactly as stored in `app_users`, ignoring the allowlist override. */
  storedRole: AccessRole;
  /** The status exactly as stored in `app_users`, ignoring the allowlist override. */
  storedStatus: AccessStatus;
  /** `storedRole`, unless the allowlist override applies, in which case `"owner"`. */
  effectiveRole: AccessRole;
  /** `storedStatus`, unless the allowlist override applies, in which case `"active"`. */
  effectiveStatus: AccessStatus;
  /**
   * True when the stored row disagrees with what is actually true for this
   * account (i.e. the allowlist override changed something). The page uses
   * this to surface the discrepancy rather than silently hiding it - an
   * owner debugging why reconciliation has not run for their own account
   * needs to see that the database still says `pending`.
   */
  storedDiffersFromEffective: boolean;
  ownership: AccountOwnershipBadge;
  /** True when this row is the signed-in owner's own account. */
  isSelf: boolean;
  /**
   * When this account row was created - named for what the column actually
   * holds, not for what it usually means. The migration backfill inserts no
   * `created_at` for a pre-existing account, so every backfilled row shares
   * the single instant the migration ran; for those rows this is a
   * migration timestamp, not a signup timestamp. A field called
   * `signedUpAt` would assert something false for every one of them, so
   * this module does not use that name anywhere, including as a property
   * nobody reads (see the test asserting this property is absent).
   * Non-nullable - see `AccountPersonInput.createdAt`'s own comment.
   */
  accountRecordCreatedAt: string;
  /** Passed through verbatim - a system timestamp, not user-authored content, so it needs no clamping. */
  statusChangedAt: string | null;
  statusChangedByActor: StatusActor;
  /** A verdict for every one of `ACCOUNT_ACTIONS`, keyed by action - never a subset. */
  actions: Record<AccountAction, AccountActionVerdict>;
}

/**
 * Builds the sorted, judged view of every row in `people`.
 *
 * THREE DECISIONS HERE ARE THE WHOLE POINT OF THIS FUNCTION EXISTING, RATHER
 * THAN THIS BEING A ONE-LINE MAP OVER `canPerformAccountAction`:
 *
 * 1. `effectiveRole` / `effectiveStatus` (and `ownership`) apply the
 *    allowlist override - a VERIFIED allowlisted row DISPLAYS as
 *    `owner`/`active` regardless of what is stored, because that is what is
 *    actually true for the account (see the module doc comment's GC2
 *    discussion). `person.isAllowlisted` alone is NOT enough to trigger
 *    this - see decision 3 below and the module doc comment's "THE OVERRIDE
 *    ITSELF REQUIRES..." paragraph.
 *
 * 2. The `AccountActionContext` built for `canPerformAccountAction` uses the
 *    STORED `role` and `status` on `target`, NOT `effectiveRole` /
 *    `effectiveStatus`. This is intentional and is not the obvious choice -
 *    it would be easy to instead pass the "truer" effective values through,
 *    since they are already computed right here. That would be wrong:
 *    `canPerformAccountAction`'s rules (the last-owner count, each action's
 *    required starting status, and its OWN allowlist refusal for suspend/
 *    demote) are written against the row as the database actually holds it.
 *    Substituting the override here would feed it a starting state that
 *    does not match any real row transition - an allowlisted
 *    `instructor`/`pending` row would look like an already-`active` `owner`
 *    with nothing left to approve or promote. The verdicts on `actions`
 *    must answer "what does the RULES module say about this account's real
 *    stored state", exactly once, computed by that module and only that
 *    module - this function's job is to hand it the correct inputs, never
 *    to re-derive or improve on its answer.
 *
 * 3. `target.isAllowlisted`, unlike `role`/`status` above, is NOT simply
 *    `person.isAllowlisted` passed through - it is gated on
 *    `person.emailVerified` exactly like decision 1's display override,
 *    using the SAME computed flag (`verifiedAllowlist` below), because it
 *    guards the same underlying fact. `canPerformAccountAction`'s rule 3
 *    refuses suspend/demote on an allowlisted row ONLY because
 *    reconciliation would silently undo the action the moment that account
 *    next loads a page - and reconciliation itself will not touch an
 *    unverified row (`ownerPromotionNeeded`'s caller in
 *    ./supabase/app-users.ts gates on the identical `emailVerified` check).
 *    Passing the raw, unverified claim through here would refuse a
 *    suspend/demote that would actually stick, on a row this module already
 *    knows is not really protected - the exact defect BUG 1 (one layer up)
 *    describes: an unverified claimant shown to the operator as an owner
 *    they cannot remove. Get this backwards (pass `person.isAllowlisted`
 *    raw, or gate it on nothing) and the allowlisted+unverified tests below
 *    catch it - they exist specifically because nothing else does.
 *
 * `activeOwnerCount` on the context handed to `canPerformAccountAction` is
 * `context.effectiveOwnerCount` as supplied - not recomputed from `people` -
 * per the module doc comment: this module has no way to know which rows are
 * allowlisted owners who have never signed in, so it must not attempt its
 * own count.
 */
export function buildAccountRows(
  people: readonly AccountPersonInput[],
  context: AccountPeopleViewContext
): AccountRow[] {
  return sortAccountPeople(people).map((person): AccountRow => {
    const storedRole = person.role;
    const storedStatus = person.status;

    // BUG 1, one layer up - see AccountPersonInput.emailVerified and the
    // module doc comment. isAllowlisted alone is an unconfirmed CLAIM on an
    // address, not a fact about the account; both the display override and
    // the rules module's allowlist protection require it be verified too.
    const verifiedAllowlist = person.isAllowlisted && person.emailVerified;

    const effectiveRole: AccessRole = verifiedAllowlist ? "owner" : storedRole;
    const effectiveStatus: AccessStatus = verifiedAllowlist ? "active" : storedStatus;

    const ownership: AccountOwnershipBadge = verifiedAllowlist
      ? "allowlist"
      : person.isAllowlisted
        ? "allowlistUnverified"
        : effectiveRole === "owner" && effectiveStatus === "active"
          ? "stored"
          : "none";

    const actionContext: AccountActionContext = {
      actorId: context.actorId,
      actorRole: context.actorRole,
      activeOwnerCount: context.effectiveOwnerCount,
      target: {
        id: person.id,
        email: person.email,
        // STORED, not effective - see this function's doc comment.
        role: storedRole,
        status: storedStatus,
        // Gated on verification too, and for the same reason as the display
        // override above - see decision 3 in this function's doc comment.
        isAllowlisted: verifiedAllowlist,
      },
    };

    const actions = {} as Record<AccountAction, AccountActionVerdict>;
    for (const action of ACCOUNT_ACTIONS) {
      actions[action] = canPerformAccountAction(action, actionContext);
    }

    return {
      id: person.id,
      email: person.email,
      // Re-clamped here, not trusted from storage: `user_metadata` (and
      // therefore whatever seeded `display_name`) is writable straight from
      // the browser with the public anon key, so a value can reach this
      // field without `validateSignup` (./signup-rules.ts) ever running -
      // see `clampDisplayName`'s own doc comment for the full reasoning.
      displayName: clampDisplayName(person.displayName),
      storedRole,
      storedStatus,
      effectiveRole,
      effectiveStatus,
      storedDiffersFromEffective: storedRole !== effectiveRole || storedStatus !== effectiveStatus,
      ownership,
      isSelf: person.id === context.actorId,
      accountRecordCreatedAt: person.createdAt,
      statusChangedAt: person.statusChangedAt,
      // A row with no status change recorded at all (both fields null) gets
      // its own actor kind rather than being reported as the system - see
      // StatusActor's own comment for why a brand-new pending row must not
      // be attributed to a reconciliation event that never happened.
      statusChangedByActor:
        person.statusChangedAt === null && person.statusChangedBy === null
          ? { kind: "never" }
          : describeStatusActor(person.statusChangedBy, context.actorEmailById),
      actions,
    };
  });
}
