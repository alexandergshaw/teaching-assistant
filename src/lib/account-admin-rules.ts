/**
 * The admin surface's guard rules for acting on ANOTHER account (AC C2, C2b,
 * C2c, AD7): who may act at all, and which of the five actions
 * (`ACCOUNT_ACTIONS`) is available on a given target row right now.
 *
 * THIS MODULE READS NO ENVIRONMENT AND NO AMBIENT STATE. That is deliberate
 * and easy to undo by accident, so the reasoning is recorded here in full.
 *
 * The same predicate has to run in two places: the server action, where it
 * is the actual control, and the client, where it decides whether a button
 * renders disabled with its reason visible - this repo's UX standard is
 * "disabled with the reason visible", never "enabled then rejected". A
 * single rule can only serve both places if it is pure.
 *
 * An earlier draft had this module read `process.env.OWNER_EMAILS` directly,
 * the same way `./owner`'s `isOwnerEmail` does. That would have been wrong
 * here specifically: Next inlines only `NEXT_PUBLIC_`-prefixed variables, so
 * in a browser bundle that read is `undefined`, which lands on the
 * permissive "no allowlist configured, nothing is protected" branch. The
 * suspend button would then render ENABLED for exactly the account the
 * allowlist rule exists to protect, and the server action would refuse it -
 * the enabled-then-rejected shape the standard forbids, arrived at silently,
 * with every test green, because no test run in Node ever sees the browser
 * bundle's `undefined`. `./signup-rules.ts` carries `import "server-only"`
 * for the identical class of problem; that fix is unavailable here, because a
 * server-only module cannot render a disabled button on the client.
 *
 * So the allowlist decision is made EXACTLY ONCE, server-side (wherever
 * `AccountActionContext` is assembled), and arrives already resolved as
 * `target.isAllowlisted`. This predicate never re-derives it, so it is
 * genuinely pure and genuinely usable from both sides of the boundary.
 *
 * A second thing this shape implies, enforced by the caller rather than
 * here: every field on `AccountActionContext` is a server-derivable fact
 * (looked up from the account row and the current allowlist), so the server
 * action must accept an ACCOUNT ID AND NOTHING ELSE, and build this context
 * itself. An action that trusted a caller-supplied context would be
 * trivially defeated - pass `activeOwnerCount: 99` and the last-owner rule
 * evaporates; pass `isAllowlisted: false` and the allowlist rule never fires.
 * This module cannot enforce that on its own (it has no notion of "caller");
 * it is safe only because nothing upstream of it hands the context across a
 * trust boundary unbuilt.
 */

import type { AccessRole, AccessStatus } from "./access";

/** The five actions the admin surface can perform on another account. */
export const ACCOUNT_ACTIONS = ["approve", "demote", "promote", "restore", "suspend"] as const;

/** One of the five admin actions. Exhaustively covered by `ACCOUNT_ACTIONS`. */
export type AccountAction = (typeof ACCOUNT_ACTIONS)[number];

/**
 * The target row as far as this rule cares. Every field is expected to be
 * resolved server-side before this context is built - see the module doc
 * comment for why `isAllowlisted` in particular must never be re-derived
 * here from an environment read.
 */
export interface AccountActionTarget {
  id: string;
  /**
   * Nullable on purpose: `app_users.email` is nullable (a phone or anonymous
   * sign-in has none), so a target with no email must be handled, not
   * assumed away. This rule does not otherwise inspect the email at all - it
   * exists on the shape only because callers building the context need it
   * for display, and because leaving it off here would force a second,
   * narrower type just for this function.
   */
  email: string | null;
  role: AccessRole;
  status: AccessStatus;
  /**
   * Whether this row's email currently resolves through the `OWNER_EMAILS`
   * break-glass, decided by the caller. See the module doc comment - this is
   * the one field that stands in for an environment read this module is not
   * allowed to make itself.
   *
   * THIS IS NOT `isOwnerEmail(email)`. It is the WHOLE break-glass condition,
   * and the break-glass has two halves (`resolveAccess`, ./access.ts):
   *
   *     isOwnerEmail(email) && emailVerified
   *
   * Supplying only the first half is a real, exploitable mistake rather than
   * an imprecision, so it is spelled out here. `isOwnerEmail` alone is an
   * UNCONFIRMED CLAIM on an address - most dangerously one somebody else
   * claimed by signing up before its real owner did. For such a row
   * `resolveAccess` falls through to the stored record and returns `pending`,
   * and the promotion inside `ensureAppUser` (./supabase/app-users.ts) is
   * gated on the identical flag, so the record never self-corrects either.
   *
   * Passing `true` for that row would hand it this module's allowlist
   * refusals - rule 3 below - and those refusals exist for exactly one
   * reason: reconciliation would otherwise silently undo a suspend or demote
   * on the account's next request. Reconciliation never touches an unverified
   * row, so there is nothing to undo and nothing to protect against. The only
   * thing the refusal would accomplish is showing an operator an unverified
   * account, badged as an owner, that they are not allowed to remove.
   *
   * So callers pass the CONJUNCTION. A caller holding the two halves
   * separately must combine them here, not hope this module does it - it
   * cannot, because it deliberately reads no environment and is never given
   * the verification flag on its own.
   */
  isAllowlisted: boolean;
}

export interface AccountActionContext {
  /** The account performing the action, not the one being acted on. */
  actorId: string;
  actorRole: AccessRole;
  /** The account the action would be performed on. */
  target: AccountActionTarget;
  /**
   * How many accounts are currently `role: "owner"` AND `status: "active"`,
   * counting the target if the target itself qualifies. Must be a genuine,
   * freshly-counted total - see the last-owner rule below for what happens
   * when it is not.
   */
  activeOwnerCount: number;
}

/**
 * The answer to "may this action proceed, and if not, why". `reason` is
 * REQUIRED on the `false` branch, never optional: the standard this surface
 * follows is "disabled with the reason visible", so a refusal with nothing
 * to show would already be a violation of the contract this type exists to
 * enforce.
 */
export type AccountActionVerdict = { allowed: true } | { allowed: false; reason: string };

const ALLOWED: AccountActionVerdict = { allowed: true };

function refuse(reason: string): AccountActionVerdict {
  return { allowed: false, reason };
}

/**
 * Actions an owner may never perform on their OWN row. `restore` is
 * deliberately absent from this set - see rule 2 below for why letting an
 * owner restore themselves is fine while the other four are not.
 */
const SELF_ACTION_GUARDED = new Set<AccountAction>(["suspend", "demote", "approve", "promote"]);

/** Actions the allowlist and last-owner protections apply to. */
const REMOVES_OWNER_STANDING = new Set<AccountAction>(["suspend", "demote"]);

/**
 * Decides whether `actor` (identified by `context.actorId` /
 * `context.actorRole`) may perform `action` on `context.target`, right now.
 *
 * The checks below run in this fixed order, and the order is load-bearing
 * for which REASON a refusal carries (several of these conditions can be
 * true at once - e.g. an actor's own row can also be the last active owner -
 * and only one reason is ever returned). It is NOT load-bearing for the
 * `allowed` boolean itself: every rule here is a pure AND-refusal, so which
 * one fires first never changes whether the action is ultimately allowed.
 *
 * 1. `actorRole !== "owner"` -> refuse. The floor of this whole surface: a
 *    non-owner can perform none of these five actions, on anyone, ever.
 *
 * 2. The target IS the actor's own row, and `action` is one of `suspend`,
 *    `demote`, `approve`, `promote` -> refuse. Nothing else in this system
 *    forbids self-action - not the database: the belt-and-braces
 *    self-change trigger fires only when `auth.uid() = old.id`, and these
 *    mutations run through the service-role client with no JWT, so
 *    `auth.uid()` is null and the trigger never sees them; and not the
 *    last-owner rule below, which only catches the case where the actor is
 *    the LAST owner, not any owner acting on themselves.
 *
 *    `restore` is excluded from this guard on purpose: it only ever moves a
 *    row TOWARDS access (`suspended` -> `active`), so an owner restoring
 *    their own suspended row is consistent rather than dangerous. The other
 *    four all matter for the same underlying reason: the owner's OWN row is
 *    very often sitting `pending`/`instructor`, because the break-glass
 *    admits them from `OWNER_EMAILS` without ever reading or reconciling
 *    their stored row, so it appears in their own approval queue. One click
 *    on approve or promote would convert an allowlist-derived, freely
 *    revocable ownership into a STORED one that survives the address being
 *    removed from `OWNER_EMAILS` later.
 *
 * 3. `action` is `suspend` or `demote`, and `target.isAllowlisted` -> refuse.
 *    The break-glass resolves an `OWNER_EMAILS` address to `owner` WITHOUT
 *    reading the stored row, and reconciliation rewrites the row on that
 *    account's very next request. Suspending or demoting such a row would
 *    therefore write the database, report success, and change nothing - the
 *    row would read `active`/`owner` again the moment its holder next signs
 *    in - while a provider-level ban (the other half of "suspend" in this
 *    system) DOES take effect, leaving the list showing an `active` account
 *    that can no longer sign in. `approve` and `restore` are deliberately
 *    NOT guarded here (see the dedicated allowlist test group): both move
 *    the row TOWARDS the access the break-glass already grants, so they are
 *    merely redundant with it rather than silently futile.
 *
 * 4. `action` is `suspend` or `demote`, `target.role === "owner"`,
 *    `target.status === "active"`, and `activeOwnerCount` is not a finite
 *    number strictly greater than 1 -> refuse. A deployment with no active
 *    owner has pending accounts nobody can ever approve again, so the LAST
 *    active owner can be neither suspended nor demoted. The count is
 *    trusted only when it is a genuine, finite number greater than 1; a
 *    zero, negative, or `NaN` count REFUSES rather than being read as
 *    "plenty of owners" - a miscount must fail closed, not open. This check
 *    is scoped to a target that is CURRENTLY an active owner: a target whose
 *    `status` is not already `"active"` cannot be reducing the active-owner
 *    headcount by being acted on, so it falls through to rule 5 instead.
 *
 * 5. The action-specific starting state - the state each action actually
 *    transitions FROM - is not the one the target is currently in -> refuse:
 *      - `approve` requires `status === "pending"`.
 *      - `restore` requires `status === "suspended"`.
 *      - `suspend` requires `status === "active"`.
 *      - `promote` requires `status === "active"` AND `role !== "owner"`
 *        (an already-owner target has nothing left to promote to).
 *      - `demote` requires `role === "owner"` (checked on ROLE, not status,
 *        because demote is the one action that transitions role rather than
 *        status).
 *    Suspending a row that is not `active` is the trap worth spelling out:
 *    there is no "previous status" column, so a later `restore` always
 *    writes `active` - meaning restoring a row that was suspended while
 *    `pending` silently APPROVES someone who was never approved, while the
 *    owner who clicked restore believes they only undid a mistake. Requiring
 *    `suspend` to start from `active` closes that off at the source rather
 *    than trying to patch `restore` to remember something it has nowhere to
 *    store.
 *
 * If none of the above refuses, the action is allowed.
 */
export function canPerformAccountAction(
  action: AccountAction,
  context: AccountActionContext
): AccountActionVerdict {
  const { actorId, actorRole, target, activeOwnerCount } = context;

  // 1. Only an owner may act on this surface at all.
  if (actorRole !== "owner") {
    return refuse("Only an owner can manage accounts.");
  }

  const isSelf = actorId === target.id;

  // 2. An owner may not suspend, demote, approve, or promote their OWN row.
  if (isSelf && SELF_ACTION_GUARDED.has(action)) {
    switch (action) {
      case "suspend":
        return refuse("You cannot suspend your own account.");
      case "demote":
        return refuse("You cannot demote your own account.");
      case "approve":
        return refuse("You cannot approve your own account.");
      case "promote":
        return refuse("You cannot promote your own account.");
      default:
        return refuse("You cannot perform this action on your own account.");
    }
  }

  // 3. An allowlisted account cannot be suspended or demoted - see rule 3
  // in the doc comment above for why the control would otherwise silently
  // change nothing.
  if (REMOVES_OWNER_STANDING.has(action) && target.isAllowlisted) {
    return refuse(
      action === "suspend"
        ? "This account is protected by the owner allowlist and cannot be suspended."
        : "This account is protected by the owner allowlist and cannot be demoted."
    );
  }

  // 4. The last active owner cannot be suspended or demoted. A zero,
  // negative, or NaN count refuses rather than reading as "plenty of
  // owners" - see rule 4 above.
  const hasSpareOwner = Number.isFinite(activeOwnerCount) && activeOwnerCount > 1;
  if (
    REMOVES_OWNER_STANDING.has(action) &&
    target.role === "owner" &&
    target.status === "active" &&
    !hasSpareOwner
  ) {
    return refuse(
      action === "suspend"
        ? "This is the last active owner and cannot be suspended."
        : "This is the last active owner and cannot be demoted."
    );
  }

  // 5. Each action requires the state it actually transitions from.
  switch (action) {
    case "approve":
      return target.status === "pending"
        ? ALLOWED
        : refuse("Only a pending account can be approved.");
    case "restore":
      return target.status === "suspended"
        ? ALLOWED
        : refuse("Only a suspended account can be restored.");
    case "suspend":
      return target.status === "active"
        ? ALLOWED
        : refuse("Only an active account can be suspended.");
    case "promote":
      if (target.role === "owner") {
        return refuse("This account is already an owner.");
      }
      return target.status === "active"
        ? ALLOWED
        : refuse("Only an active account can be promoted.");
    case "demote":
      return target.role === "owner"
        ? ALLOWED
        : refuse("Only an owner account can be demoted.");
    default: {
      // Exhaustiveness guard: ACCOUNT_ACTIONS is the sole source of truth for
      // AccountAction, so this branch is unreachable for any value the type
      // system allows through. If a future action is added to the array
      // without a case above, this still fails closed instead of throwing.
      const exhaustive: never = action;
      return refuse(`Unrecognised account action: ${String(exhaustive)}`);
    }
  }
}
