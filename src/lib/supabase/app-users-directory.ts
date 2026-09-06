// Joins public.app_users (via listAppUsers, ./app-users.ts) with the auth
// provider's own record of whether each account's email was ever confirmed.
// This is a deliberately separate LEAF module, not an addition to
// ./app-users.ts: that file is already at its 1000-line ceiling (enforced by
// a test), and this join is a distinct concern from anything app-users.ts
// does - app-users.ts answers "what does THIS ROW say", never "what does the
// auth provider say about it", and every one of its existing exports stays
// exactly that shape. Composing the two here, from the outside, is strictly
// better than growing app-users.ts to do it internally: app-users.ts stays
// under its ceiling, and this module can be read, tested and reasoned about
// as one small thing with one job.
//
// WHY THIS MATTERS AT ALL: docs/account-people-view.ts's `AccountPersonInput`
// carries a REQUIRED `emailVerified: boolean` because `resolveAccess`
// (src/lib/access.ts) grants the `OWNER_EMAILS` break-glass only when
// `isOwnerEmail(email) && emailVerified` - an allowlisted address that has
// never confirmed its email is NOT an owner, no matter what the allowlist
// says. `app_users` itself has no column for this: `email_confirmed_at`
// lives on `auth.users`, a schema this app never selects from directly (it
// is not exposed through PostgREST), and the one place that already reads it
// - `ensureAppUser` in ./app-users.ts - reads it, uses it for one request's
// own reconciliation decision, and then discards it; nothing persists it.
// So the owner's account list - which needs this fact for EVERY row, not
// just the one account currently signing in - has to fetch it itself, for
// every account, and that fetch is what this module exists to do.
//
// THE SERVICE-ROLE CLIENT BYPASSES RLS AND CARRIES NO JWT. Both reads below
// go through `createServiceClient()` (./server.ts), exactly like every other
// export in ./app-users.ts: `auth.admin.listUsers` is an admin-only endpoint
// that does not exist on a cookie-bound client at all, and `auth.uid()` is
// null under a service-role connection regardless - there is no session for
// Postgres to read a claim from. Neither read here is gated by, or even
// touches, any row-level security policy; the only access control that
// exists for this module is "who is allowed to call listAccountPeople in the
// first place", which is entirely the caller's responsibility, exactly as
// documented at the top of ./app-users.ts for every export there.
import { createServiceClient } from "./server";
import { listAppUsers, type AppUserRow } from "./app-users";

/**
 * One row for the owner's account list: everything `AppUserRow` carries,
 * plus whether the auth provider has ever confirmed this account's email.
 * Intersected onto `AppUserRow` rather than redeclared field-by-field so this
 * type can never silently drift from what `listAppUsers` actually returns.
 */
export type AccountPersonRecord = AppUserRow & { emailVerified: boolean };

/**
 * Page size requested from `auth.admin.listUsers`. The installed
 * `@supabase/auth-js` (2.106.2, `GoTrueAdminApi.listUsers`'s own doc comment)
 * says plainly: "Defaults to return 50 users per page" - so an unparameterised
 * call is NOT "everyone", it is the first 50 accounts, silently. This module
 * requests the larger size shown in that same doc comment's own "Paginated
 * list of users" example (`{ page: 1, perPage: 1000 }`) - the documented API
 * accepts an explicit `perPage`, and 1000 cuts the number of round trips (and
 * the extra HTTP latency each one carries) by 20x relative to the 50-item
 * default for any deployment with more than a handful of accounts, without
 * this module having to invent a number the library does not itself suggest.
 */
const AUTH_LIST_PAGE_SIZE = 1000;

/**
 * Hard ceiling on how many pages `fetchAuthEmailVerificationById` will read
 * before giving up. `auth.admin.listUsers` is genuinely paginated - see this
 * file's own comment on `AUTH_LIST_PAGE_SIZE` - so looping on its `nextPage`
 * cursor with NO upper bound would turn one bad response (a `nextPage` that
 * never goes null, whether from a provider bug, a future API change, or a
 * malicious/misconfigured auth backend) into a request that never returns at
 * all: an availability bug in exactly the code that is supposed to help an
 * owner see who has access.
 *
 * 20 pages at `AUTH_LIST_PAGE_SIZE` (1000) each is up to 20,000 auth
 * accounts read before this function gives up - this app's realistic
 * deployment size (an institution's instructors and staff) is nowhere close
 * to that, so hitting this cap is a signal that something is actually wrong
 * (a pagination contract change, a provider returning corrupt `nextPage`
 * values, or a genuine runaway loop), not evidence of a legitimately large
 * roster that this module simply failed to plan for.
 *
 * WHAT HAPPENS WHEN THE CAP IS HIT: this function THROWS rather than
 * returning whatever it managed to collect. Silently truncating here would
 * be actively worse than an outage: `listAccountPeople`'s join treats "no
 * auth record for this id" as "not verified" (see that function's own
 * comment), so a truncated page walk would make every account past the cut
 * line look exactly like an account that never confirmed its email at all -
 * indistinguishable, to the owner reading the list, from "this person never
 * signed up." A hard failure that surfaces as an error is diagnosable; a
 * quietly short list is not.
 */
const MAX_AUTH_LIST_PAGES = 20;

/**
 * Reads every `auth.users` account through the admin API and returns a map
 * from user id to "has this account's email ever been confirmed", paging
 * until `auth.admin.listUsers` reports no further page (`nextPage === null`)
 * or `MAX_AUTH_LIST_PAGES` is reached - see that constant's own comment for
 * why a page cap exists at all and why hitting it throws instead of
 * returning a partial map.
 *
 * JOIN KEY IS THE USER ID, NEVER THE EMAIL. `app_users.email` is nullable
 * (a phone or anonymous sign-in has none - see `AppUserRow.email`'s own
 * comment in ./app-users.ts) and, separately, this schema has a KNOWN
 * case-insensitive collision scenario on email (see app-users.ts's own
 * `app_users_email_lower_idx` discussion): two different accounts can
 * legitimately disagree on the casing of "the same" address, or share an
 * address after a case-only rename. Matching on email here would make one
 * account's verification status answer for a different account entirely.
 * The user id is the one identifier both `app_users` and `auth.users` agree
 * on unconditionally - it is `app_users`'s own primary key, copied from
 * `auth.users.id` at insert time and never altered after - so it is the only
 * safe join key.
 *
 * WHICH CONFIRMATION FIELD IS AUTHORITATIVE: the installed `User` type
 * (node_modules/@supabase/auth-js/dist/main/lib/types.d.ts) exposes TWO
 * candidates - `email_confirmed_at` (this account's EMAIL specifically) and
 * `confirmed_at` (set once ANY contact method - email OR phone - has been
 * confirmed). This function uses `email_confirmed_at` exclusively, for the
 * same reason `ensureAppUser` already does (./app-users.ts, its own
 * `UNVERIFIED-EMAIL FIX` comment): the fact this join exists to answer is
 * specifically "was THIS EMAIL address confirmed", because that is the exact
 * predicate `resolveAccess`'s `OWNER_EMAILS` break-glass consults
 * (`isOwnerEmail(email) && emailVerified`, src/lib/access.ts). `confirmed_at`
 * would give a false positive for an account that confirmed a PHONE number
 * but never proved it controls the allowlisted email address at all - a
 * strictly more permissive (and here, wrong) signal.
 *
 * A missing, null, or otherwise falsy `email_confirmed_at` (including the
 * field being entirely absent from the response) reads as unconfirmed:
 * `Boolean(...)` on a genuine ISO timestamp string is `true`, and on
 * `undefined`/`null`/`""` is `false` - there is no partially-confirmed state
 * this field can hold that `Boolean` would misclassify.
 */
async function fetchAuthEmailVerificationById(): Promise<Map<string, boolean>> {
  const supabase = createServiceClient();
  const verifiedById = new Map<string, boolean>();

  let page: number | undefined = 1;
  for (let pagesRead = 0; pagesRead < MAX_AUTH_LIST_PAGES; pagesRead++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: AUTH_LIST_PAGE_SIZE,
    });

    if (error) {
      throw new Error(`Could not list auth users (page ${page}): ${error.message}`);
    }

    for (const user of data.users) {
      verifiedById.set(user.id, Boolean(user.email_confirmed_at));
    }

    if (data.nextPage === null) {
      return verifiedById;
    }
    page = data.nextPage;
  }

  throw new Error(
    `Auth user listing did not finish within ${MAX_AUTH_LIST_PAGES} pages of ` +
      `${AUTH_LIST_PAGE_SIZE} - refusing to return a possibly-truncated account list. ` +
      `This almost certainly means auth.admin.listUsers's pagination contract changed, ` +
      `or the auth provider is returning a "next page" that never terminates - a genuine ` +
      `deployment of this app should never have enough accounts to reach this cap. Raise ` +
      `MAX_AUTH_LIST_PAGES only after confirming which of those is actually true.`
  );
}

/**
 * Every `app_users` account, each carrying whether its email has ever been
 * confirmed by the auth provider - the shape the owner's account list needs
 * to decide `AccountPersonInput.emailVerified` (src/lib/account-people-view.ts)
 * for every row, not just the one signing in.
 *
 * THE TWO READS RUN CONCURRENTLY, VIA `Promise.all` - NOT ONE AFTER THE
 * OTHER. This is a hard requirement, not a micro-optimisation, and getting it
 * backwards is a real availability bug, documented at
 * docs/multi-user-login-acceptance-criteria.md under GC10: `AbortSignal.
 * timeout()` (used by createServiceClient's bounded fetch, ./server.ts)
 * rejects with a `DOMException` named `"TimeoutError"`, and
 * `@supabase/postgrest-js` only treats a failure as non-retryable when its
 * name is `"AbortError"` - so a timed-out `listAppUsers` read (a `.select()`,
 * a retryable GET) is silently retried up to 3 more times with fresh
 * timeouts and exponential backoff, roughly 39 seconds worst case for THAT
 * ONE read alone (see ./server.ts's own `SERVER_FETCH_TIMEOUT_MS` comment for
 * the full derivation). This app is deployed on Vercel Hobby, which caps a
 * function at 60 seconds total. Awaiting `listAppUsers()` and THEN awaiting
 * `fetchAuthEmailVerificationById()` would sum their worst cases instead of
 * overlapping them - two reads that individually fit inside the platform
 * cap, composed sequentially into one that does not, so the request dies
 * with the owner seeing no account list at all rather than a merely slow
 * one. `Promise.all` bounds the combined wait to whichever read is slower,
 * not their sum, which is the only way both reads can share the same 60
 * second budget safely. Do not replace this with two `await`s in sequence.
 *
 * JOINING ON AN ACCOUNT THAT ONLY EXISTS ON ONE SIDE:
 *
 * - An `app_users` row with NO matching auth user (an id that
 *   `fetchAuthEmailVerificationById`'s map has no entry for - a deleted auth
 *   account, or any other drift between the two tables) resolves to
 *   `emailVerified: false`. This fails CLOSED, on purpose: the one thing this
 *   field exists to gate is the `OWNER_EMAILS` break-glass display in
 *   src/lib/account-people-view.ts, and treating an account this module
 *   cannot actually confirm as verified would be the exact failure mode BUG 1
 *   (one layer up, see that module's own doc comment) exists to prevent - an
 *   unconfirmed or unverifiable claim rendered, and protected, as a genuine
 *   owner. Absence of proof is treated as absence of verification, never the
 *   reverse.
 *
 * - An `auth.users` account with NO `app_users` row is simply never produced
 *   by this function at all: the base list here is `listAppUsers()`, which
 *   reads `app_users`, not `auth.users` - `fetchAuthEmailVerificationById`'s
 *   map is consulted only for ids that `listAppUsers` already returned, never
 *   iterated on its own. This is deliberate, not an oversight: an
 *   `app_users` row is what every other part of this app (the request gate,
 *   the admin surface, `resolveAccess`'s stored-row path) treats as "this is
 *   an account", and an auth identity with no such row yet is exactly the gap
 *   `ensureAppUserRowExists` (./app-users.ts) exists to close - it is created
 *   on that account's very next denied request. So a same-request auth user
 *   with no row is not a case this module silently drops; it is a case
 *   handled by a different, already-existing recovery path, and will appear
 *   here itself as soon as that path runs.
 */
export async function listAccountPeople(): Promise<AccountPersonRecord[]> {
  const [people, verifiedById] = await Promise.all([
    listAppUsers(),
    fetchAuthEmailVerificationById(),
  ]);

  return people.map((person): AccountPersonRecord => ({
    ...person,
    emailVerified: verifiedById.get(person.id) ?? false,
  }));
}
