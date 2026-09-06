# Rolling back the multi-user login work

Written for GC9. The short version is the first heading, because by the time
anyone reads this they are probably in a hurry.

---

## UNDO THROUGH THE SURFACE BEFORE YOU REVERT THE CODE

A `git revert` removes the pages and leaves every effect they had:

- **Approvals persist.** `app_users.status` stays `active`. The gate keeps
  admitting that account, and `requireOwner()` still means "any active
  account" at approximately 496 invocations, so the account keeps its reach
  into the owner's Canvas token, the GitHub token, the cloned voice and the
  avatar likeness.
- **Promotions are sticky, by design - but only a HUMAN promotion, and only
  one made after the `role_granted_by` column existed.** `role_granted_by`
  is stamped by
  `setAppUserRole` alone (`src/lib/supabase/app-users.ts`), and
  `ownerDemotionNeeded` refuses to demote a row only when that column is
  non-null (same file). Two cases it does NOT cover, both worth knowing
  before you rely on "sticky" during an incident:
  - **Ownership granted by reconciliation stays demotable.** The
    `OWNER_EMAILS` break-glass promotion inside `ensureAppUser` never
    stamps `role_granted_by` - only `setAppUserRole` does - so an
    allowlist-derived owner is demoted the moment its email leaves
    `OWNER_EMAILS`, exactly as intended.
  - **A human promotion made before `role_granted_by` existed is not
    protected either, until its next sign-in after that migration
    deploys.** The migration that added the column
    (`supabase/migrations/20261014000000_app_users_role_granted_by.sql`)
    backfills nothing - every pre-existing row, including one a human
    genuinely promoted through the admin surface, starts at `null`. Its own
    header calls this out as a deliberate, one-time reopening of the exact
    bug `role_granted_by` exists to close: such a row is demotable by
    reconciliation again on that account's very next sign-in after this
    migration deploys, and stays protected only once someone re-promotes it
    through the surface after that. A rollback can land in exactly that
    window - check whether this migration has run and whether the account
    in question has signed in since, rather than assuming "promoted" means
    "protected."
- **Bans live at the authentication provider,** not in this repository. No
  code change touches them.

So the ordering is not a preference. The admin surface is the ONLY thing that
moves the database and the auth provider together. Once it is gone, undoing a
suspension means going to the provider's own dashboard, and undoing an
approval or a promotion means writing SQL directly against the table - see
below.

**Procedure:**

1. Suspend or demote whoever should not have access, using the surface, while
   it still exists.
2. Confirm the list shows what you expect.
3. Only then revert the code.

**The SQL, if the surface is already gone.** Read against the real schema
(`supabase/migrations/20261012000000_create_app_users.sql`), not guessed.
Both statements below were checked against the BEFORE UPDATE trigger
`app_users_prevent_self_role_status_change` (same migration, lines 245-257):
it refuses a role/status change only when `auth.uid() = old.id` - a
signed-in user changing their OWN row through a request carrying their own
JWT. Run from the Supabase SQL editor, or any other direct connection with
no request context, `auth.uid()` is null, so the trigger's own condition is
false and it does NOT block either statement below.

Revoke an approval (the same end state `setAppUserStatus`'s suspend
transition would leave, done by hand):

```sql
update public.app_users
set status = 'suspended',
    status_changed_at = now(),
    status_changed_by = null
where id = '<uuid>';
```

This does NOT ban the account at the auth provider. `resolveAccess` reading
`status = 'suspended'` denies it at this app's own gate immediately, but the
account's already-issued access token and its ability to sign in again at
the auth layer are both untouched by this statement - only
`setAppUserStatus`'s own call to `auth.admin.updateUserById` does that, and
no SQL against this table can reach it. If the account must actually be
locked out, you still need the provider's dashboard for that half.

Revoke a promotion (the same end state `setAppUserRole`'s demote transition
would leave, done by hand):

```sql
update public.app_users
set role = 'instructor',
    role_granted_by = null,
    status_changed_at = now(),
    status_changed_by = null
where id = '<uuid>';
```

`role_granted_by` is cleared in the same statement, exactly like
`setAppUserRole` clears it on a real demote - leaving it set would
misattribute a later, unrelated promotion of the same row as still
human-granted (see the "Promotions are sticky" note above).
`status_changed_by` is left `null` rather than a real actor id: the admin
surface renders a null actor as "Automatically" (`docs/account-people-copy.md`,
the C7 section) - the honest label for a change made by hand while the
surface does not exist. Substitute your own `auth.users` id there only if
you want the list to attribute this to you once the surface comes back.

Both statements are destructive to the ADMIN RECORD of what happened (they
overwrite `status_changed_at`/`status_changed_by`, and the second clears
`role_granted_by`), and neither one reaches the auth provider. Substitute the
target account's `auth.users.id` for `<uuid>` - not the email: the table's
primary key is the id, and `email` is nullable.

---

## The mode that makes this unsafe

**If the last owner has been suspended, the break-glass buys at most however
long their current access token has left to live - not "cannot save you",
but "will not save you for long."**

`OWNER_EMAILS` resolves an allowlisted address to `owner` without reading its
row (`src/lib/access.ts`, `resolveAccess` - the break-glass check runs before
the profile is even read). Get the mechanism right here, because the wrong
version of this claim is worse than none: `resolveAccess` does not check ban
status at all, and does not need to, because it only ever runs against a
request that has already produced a verified email from an already-valid
session - and banning an account does NOT invalidate a session already
issued.

**Verified against `setAppUserStatus`'s own honesty note
(`src/lib/supabase/app-users.ts`):** banning at the auth provider blocks NEW
sign-ins and refresh-token grants. It does not touch an access token already
handed out - that token is a self-contained JWT verified by signature and
expiry alone, with no callback to the auth server. So a just-suspended
allowlisted owner is not cut off the instant the ban lands: for as long as
their current token has left to live, `resolveAccess`'s break-glass keeps
resolving them to `owner`, exactly as before. `docs/account-people-copy.md`
(the C6 section) records the same fact for the suspend button's own copy and
puts a number on that window - "up to an hour" - so treat this document and
that one as describing the same mechanism; they must not disagree about it.
The account only actually loses access once its current token expires and a
refresh is attempted, which is where the ban finally bites.

Once that window closes, recovery is at the auth provider's own dashboard:
lift the ban there, then sign in. Nothing in this repository can do it.

**What actually keeps a deployment from reaching this state is three
independent guards in `account-admin-rules.ts`'s `canPerformAccountAction`,
not one:**

- **The self-action refusal.** An owner can never suspend, demote, approve,
  or promote their OWN row. On a single-owner deployment this is what stops
  that owner from suspending themselves by mistake.
- **The last-active-owner refusal.** Suspending or demoting the last
  `role: owner` / `status: active` row is refused outright, regardless of
  who the actor is.
- **The allowlist refusal.** Suspending or demoting a row whose email is
  currently on `OWNER_EMAILS` is refused outright, for anyone who tries -
  not only the owner acting on themselves. The break-glass would just
  re-promote the row on its next reconciled request anyway, so the surface
  treats it as protected rather than let a click lie about what it did.

This document previously credited only the first of these as "the single
strongest argument" against this state. That undersold the allowlist
refusal specifically: it is the one that makes an allowlisted owner's row
unreachable through this surface full stop, not only when they try to act
on themselves - which makes it the guard most likely to look redundant, and
get removed, by someone who has only ever read the self-action rule. All
three are load-bearing; do not simplify away the one this document used to
leave out.

---

## What each artifact leaves behind if reverted

| Artifact | Reverting the code removes | It leaves |
| --- | --- | --- |
| `/account/people` and its actions | the surface | every approval, suspension, promotion and ban it made |
| The proxy gate (`src/proxy.ts`) | route protection | nothing - but the app becomes open to anyone who can reach it |
| `app_users` migrations | nothing (migrations are forward-only here) | the table, its rows, its trigger and its policy |
| The sign-out sweep | the sweep | whatever is already in the previous user's browser |
| Owner-aware navigation | the nav entry | the route, which is still reachable by typing the URL and is still guarded server-side |

**There is no down-migration convention in this repository.** Migrations
auto-apply via a GitHub Action on push to `main` and are never reversed. A
column added by this work stays. Plan on that rather than around it.

**If the `app_users` table itself is ever meant to go, there IS rollback
machinery for it - it is just not a migration.** This document previously
said the table "stays" with no further comment, which omitted the ONE piece
of rollback machinery this repository actually owns for this feature.
`supabase/migrations/20261012000000_create_app_users.sql` hand-documents the
exact drop order in its own header (around lines 152-154), because this
migration also left behind the repo's first trigger on `auth.users`:

```sql
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_auth_user();
drop table if exists public.app_users;
```

The order matters because the function that trigger calls inserts INTO
`app_users` on every new sign-up - browser sign-up, a Supabase dashboard
invite, `auth.admin.inviteUserByEmail` - all of them, project-wide, per the
migration's own comment. Drop the table first and that insert starts
failing inside the trigger on every subsequent sign-up, anywhere. The
trigger's own exception-swallow (`exception when others then return new`,
same migration) keeps that failure from surfacing as a visible error - a
new sign-up still completes - but it also means every account created from
that point on silently gets no `app_users` row at all, forever, until a
further migration removes the trigger and function too. That is a quiet,
ongoing loss of the exact approval/role machinery this document is about,
not a loud one - which is exactly why the order is worth getting right the
first time rather than counting on the swallow to catch the mistake.

---

## Reverting the gate specifically

`src/proxy.ts` is the file that decides who gets in. Two failure modes worth
knowing before touching it:

1. **Reverting it opens the app.** There is no second gate behind it for most
   routes. Server actions have their own guards, but pages do not.
2. **A revert that restores `src/middleware.ts` does NOT silently do
   nothing.** An earlier version of this document claimed it would; that was
   checked against the INSTALLED Next.js (16.2.6) rather than assumed, and
   it was wrong. Two things are true instead, and neither of them is "looks
   fine and is ungated":
   - The build's convention scan looks for BOTH `middleware.<ext>` and
     `proxy.<ext>` at the project root (or `src/`) on every build -
     `node_modules/next/dist/build/index.js:613-614` builds a detection
     regex for each, and the scan loop at lines 626-639 records a match for
     either name (lines 630 and 633).
     `node_modules/next/dist/lib/constants.js:287-290` still
     defines both filename constants. Middleware was renamed and
     deprecated, not removed from the convention
     (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`,
     "Version history": "v16.0.0 - Middleware is deprecated and renamed to
     Proxy").
   - **If the revert restores `middleware.ts` while `proxy.ts` still
     exists** (both files present), the build throws a hard error naming
     both paths and refuses to build at all -
     `node_modules/next/dist/build/index.js:640-649`, error code `E900`.
     This fails loudly, at build time, before anything ships.
   - **If the revert restores `middleware.ts` and removes `proxy.ts`** (the
     shape an actual `git revert` of the proxy-introducing commit
     produces), Next.js finds `middleware.ts` and runs it as the gate. It
     logs a one-time deprecation warning
     (`node_modules/next/dist/build/index.js:651`) but the gate keeps
     running - the app is not ungated by this. What DOES change, and won't
     show up in a warning: middleware defaults to the Edge runtime where
     `proxy.ts` defaults to Node
     (`docs/multi-user-login-acceptance-criteria.md`, amendment AM6), so
     this also moves the gate's runtime and its latency profile, not only
     its filename. `docs/multi-user-login-acceptance-criteria.md`'s AM6
     already documents the both-files build error; this document used to
     describe an outcome that contradicted it.

   Verify with an actual anonymous request regardless of which of the two
   outcomes above applies - a build warning is easy to miss in a deploy
   log, and the runtime change is worth confirming either way.

**Verification after any gate change:**

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" -I https://teaching-assistant-pi.vercel.app/
```

Expect a `307` to `/login` with the original path encoded in `next`. A `200`
means the gate is not running.

---

## Partial rollback: keeping the login, dropping the admin surface

This is the likely case - the login flow is wanted, the account management is
not yet trusted. It is safe, with one caveat.

Reverting only `/account/people` and its actions leaves:

- the gate, the roles, the sign-out sweep and the login screens intact;
- no way to approve anyone, so the pending queue stops moving;
- `ensureAppUser` still reconciling allowlisted owners on every request, so
  the deployment owner keeps their own access.

**Caveat:** nobody can be approved, which means the deployment stays
single-user. That is the pre-existing behaviour, so it is a real rollback
target rather than a broken half-state - but say so out loud, because a
pending account with no way to approve it looks like a bug to whoever signed
up.

**This conclusion depends on the sign-up mode, and sign-up has shipped
(`src/app/login/signup/page.tsx`, linked from the sign-in screen) - so check
it, don't assume it.** `src/lib/signup-rules.ts` defines three modes read
from `SIGNUP_MODE` - `open`, `approval` (the fallback for anything unset or
unrecognised), and `closed` - and `initialStatusForSignup()` says `open`
should activate a brand-new account immediately, with no approval step at
all. If that were actually wired into the write path, this section's
conclusion would be false under `SIGNUP_MODE=open`: new accounts would keep
becoming usable throughout the outage this section is describing, admin
surface or not.

**Verified that, as the code is actually wired right now, it is not wired in
at all - `decideInitialAccount` and `initialStatusForSignup` have zero call
sites anywhere outside `signup-rules.ts` itself.** The sign-up server action
(`src/app/actions/auth-signup.ts`) never calls either one; its own header
comment says, in capitals, that it never writes `role` and does not persist
`status` either. Every new account is created only by the database trigger
(`handle_new_auth_user`, the same migration as the table), which always
defaults a new row to `status = 'pending'` - the column default - regardless
of `SIGNUP_MODE`. So today, the only two ways an account becomes usable are
the `OWNER_EMAILS` break-glass and an owner's explicit approval through the
admin surface - exactly what this section assumes - and the caveat above
holds.

**But say so carefully, because this is a landmine, not a settled fact.**
`signup-rules.ts`'s own comments describe `open` mode as if it does activate
accounts immediately - read that file alone and you would reasonably
conclude otherwise. It does not, only because nothing currently calls the
function that would make it so. If a future change wires
`decideInitialAccount`'s result into `auth-signup.ts`'s write path - which
is the obviously-intended use of code that already exists and does nothing
today - this section's conclusion breaks silently, with no test in this
repository positioned to catch it. Re-check this reasoning against
`src/app/actions/auth-signup.ts` at rollback time rather than trusting this
paragraph to still be true.

---

## What is NOT recoverable through any of this

- **A leaked credential.** If an approved account read the Canvas or GitHub
  token, revoking their app access does not revoke what they took. Rotate the
  token at its source. This is the reason C0's confirmation is worded the way
  it is.
- **Anything a third party already holds.** Voice clones and avatar likenesses
  live at the provider. Removing an account here does not reach them.
