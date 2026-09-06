# Copy sheet: the owner's account list (`/account/people`)

Every user-visible string on that surface, fixed here so the page is a layout
exercise and not a series of small drafting decisions made under time
pressure. Where a string makes a CLAIM about what the system does, the claim
has been checked against the code and the check is recorded underneath it.

REVISED 2026-09-06 after an adversarial review found ten defects in the prior
version, including one false promise (the allowlist badge) and one internal
contradiction (the empty-name placeholder). Every claim this revision touches
was re-checked directly against the code as it stands today, not trusted from
the version being corrected - several of the prior version's checks turned
out to be accurate and are kept; several were wrong and are replaced below,
each with the file and line actually read.

Rules that apply throughout:

- No emojis (enforced repo-wide by a test).
- Never promise a notification. There is no mailer in this repo and the auth
  provider sends only its own four templates, so "they will be emailed" would
  be a lie. Say what the person must be told out-of-band instead.
- Never say "immediately" about session revocation. See C6 below.
- Sentence case for headings and buttons; no terminal full stop on a button.
- Never dump a raw error string at the operator. Where the underlying code
  can fail in more than one distinguishable way, this sheet specifies the
  distinct copy for each way rather than one generic "something went wrong."

---

## Page heading and standfirst

**Heading:** Accounts

**Standfirst:** Everyone who has signed in to this workspace. Approving an
account gives it the same access to connected services that you have.

That second sentence is the honest one-line version of C0 and it belongs
above the list, not only inside the confirmation - an owner scanning the queue
should already know the stakes before they reach for a button.

---

## The C1b limitation note

Rendered as a persistent, low-emphasis note directly under the standfirst.
Not a dismissible banner: the remaining case below is permanent until the
underlying uniqueness constraint changes, so a dismissal would just hide it
from the one person who can act.

> This list is built from account records, and a missing one now usually
> fixes itself the next time that person uses the app again. The one case
> that does not fix itself is two people whose email addresses differ only in
> upper or lower case - the second one to sign up can never get a record
> here, and looking them up in your authentication provider will not help,
> because their account genuinely exists there. If someone says they signed
> up, has tried again, and still is not on this list, search your database
> logs for a warning starting "handle_new_auth_user: could not create
> app_users row" - it names the exact account id and the database error.

**REVISED, checked:** the prior version of this note told the reader to
"check it against your authentication provider" for ANY missing record, and
told them to do nothing else. That advice is now stale for the common case
and useless for the case that remains.

- The insert trigger (`handle_new_auth_user`,
  `supabase/migrations/20261012000000_create_app_users.sql`) still has a
  blanket `exception when others then` that swallows any insert failure so
  sign-up itself never breaks - but as of
  `supabase/migrations/20261013000000_app_users_display_name_at_insert.sql`,
  that handler also `raise warning`s with `new.id`, `sqlerrm`, and `sqlstate`
  before returning, so a swallowed failure now leaves a trace in the
  database logs instead of none.
- `src/lib/supabase/proxy.ts` (the request gate, lines 199-236) now calls
  `ensureAppUserRowExists` for exactly the row-less population, on every
  request such an account makes, before it is ever redirected away - so a
  swallowed insert (anything OTHER than the email collision below) is
  retried automatically and typically resolves on the person's very next
  page load. Checking the auth provider's dashboard for this population now
  tells the owner nothing they could not see here already.
- The email-collision case does NOT self-heal, and checking the provider
  genuinely tells the owner nothing: `ensureAppUserRowExists`
  (`src/lib/supabase/app-users.ts`, lines 978-995, in particular its own doc
  comment) uses "the SAME target-less upsert as ensureAppUser's own
  insert-if-missing step," so it absorbs the identical `lower(email)`
  collision the trigger already swallowed, silently, on every retry. The
  auth-provider record is real and correct for this person - the row that
  cannot be created is the one in `app_users`, which is the table this list
  reads, so a provider lookup finds nothing wrong to report.
- The trigger's warning line is the one diagnostic that names the failing
  row: `raise warning 'handle_new_auth_user: could not create app_users row
  for auth.users id %: % (SQLSTATE %)', new.id, sqlerrm, sqlstate;`
  (`20261013000000_app_users_display_name_at_insert.sql`). This app has no
  UI over Postgres logs, so the note asks the owner to go find that line
  directly (Supabase's own log explorer, or `psql`) - it does not pretend
  this app can show it to them.

---

## Column headings

| Column | Heading | Why not the obvious wording |
| --- | --- | --- |
| Name | Name | Self-asserted; see the name cell note below. |
| Email | Email address | See the email cell note below for the no-address case. |
| Role | Role | |
| Status | Status | |
| Created | Account record created | NOT "signed up". See GC7 below. |
| Last change | Last status change | |

**GC7, checked:** the backfill migration inserts no `created_at`, so every
row that existed before the migration carries the instant the migration ran,
not the instant that person signed up. "Signed up" would be false for exactly
the accounts an owner is most likely to be reasoning about. "Account record
created" is true for every row without needing a footnote. Re-checked against
`src/lib/account-people-view.ts`: the field is named `accountRecordCreatedAt`
for this exact reason, and `account-people-view.test.ts` (lines 175-180)
pins that the row type never carries a property named `signedUpAt`.

---

## The name cell

The value is clamped at render (`clampDisplayName`) and wrapped in `<bdi>`.

When the clamped name is empty, render exactly this placeholder, never the
email address and never an em-dash on its own:

> (no name)

**FIXED - this used to contradict itself:** the prior version told the
implementer to "render the em-dash placeholder" and then quoted a
parenthetical string that is not an em-dash. Only one of those can be built;
this sheet picks the parenthetical and drops every mention of an em-dash
placeholder. Reason for picking it over a bare em-dash: a lone "-" character
announces as nothing at all to a screen reader (some announce it as "dash,"
most announce nothing), while "(no name)" reads as actual words - and this
cell sits in an approval queue, where an owner using assistive technology
needs to be told the name is missing, not left to infer it from silence.

**Why not fall back to the email:** the email is already its own column.
Substituting it makes two columns show the same value and hides the fact that
the account has no name at all - which is itself a signal worth seeing in an
approval queue.

---

## The email cell

`app_users.email` is nullable in SQL (`email text`, no `not null` - see
`supabase/migrations/20261012000000_create_app_users.sql`'s column comment:
"a phone-auth or anonymous account has no email in auth.users") and typed
`string | null` in `AppUserRow.email` and `AccountPersonInput.email`
(`src/lib/supabase/app-users.ts` line 77; `src/lib/account-people-view.ts`
line 70). `account-people-view.test.ts` (lines 297-301) exercises a row built
with `email: null` and asserts it renders without throwing, so this is not a
theoretical shape.

When `email` is null, render:

> (no email on file)

Deliberately a different placeholder text from the name cell's "(no name)",
even though both are parenthetical for the same screen-reader reason given
above: the two facts are not the same ("nobody gave a name" is unremarkable
for a phone sign-in; "this account has no email address at all" is the more
unusual fact for a workspace whose sign-in is otherwise email-based) and
collapsing them to identical text would make an owner scanning the row have
to check which column they were looking at to know what was actually true.

---

## The allowlist badge (GC2)

**FIXED - this section previously asserted something false.** It said the
stored role and status "do not apply" for any allowlisted row because
ownership "is decided before the database is read." That is only true for
HALF of what "allowlisted" can mean, and the sheet did not say which half.

**Checked, and this is the finding that forced the rewrite:**
`resolveAccess` (`src/lib/access.ts`, line 168) grants the break-glass `owner`
decision only when `isOwnerEmail(email) && input.emailVerified` are BOTH
true - see that function's own doc comment (lines 71-98) for why
`emailVerified` is a required, non-defaultable input. `ensureAppUser`'s
promotion branch (`src/lib/supabase/app-users.ts`, line 811:
`if (ownerPromotionNeeded(current, isOwner) && emailVerified)`) gates the
STORED row's promotion to `owner`/`active` on the exact same signal. So an
allowlisted address that has never confirmed its email:

- does NOT get the break-glass `owner` decision (falls through to whatever
  its stored row actually says - ordinarily `instructor`/`pending`, the same
  as any other new signup);
- is NEVER promoted by reconciliation, no matter how many requests it makes,
  because the promotion branch that would do it is gated on the same
  `emailVerified` flag; and
- is exactly the shape the review is warning about: someone who is not the
  real owner of that address could have signed up with it first, and this
  account sits in the pending queue looking like any other stranger - which
  is what it actually is, until the real owner of that address confirms it.

The prior version's badge would have shown this row as "Owner via
OWNER_EMAILS," hiding its true `pending` status and giving the owner no
reason to be suspicious of it. That is the false promise. This section now
specifies THREE cases instead of one.

**Case A - allowlisted and email confirmed** (the row the break-glass
actually grants ownership to). Replaces the rendered role and status, exactly
as the prior version described:

**Badge text:** Owner via OWNER_EMAILS

**Tooltip / secondary line:**

> This address is an owner because it is in the `OWNER_EMAILS` environment
> variable and has confirmed it can receive mail. That is decided before the
> database is read, so it does not depend on the stored role and status shown
> in the muted line below.

When the stored row disagrees with this (an owner who has not yet made a
request anywhere else in the app since being added to `OWNER_EMAILS`, or
since this migration ran), show the stored values in a muted secondary line
rather than hiding them:

> Stored record still says instructor / pending. This corrects itself
> automatically the next time this account is used elsewhere in the app.

Deliberately "elsewhere in the app," not "loads this page": `requireAppOwner`
- this page's own guard - never calls the reconciliation that fixes the
stored row (see the "stale common case" note below for the full trace). The
correction happens on this account's next `requireUser()`-backed action, of
which there are roughly 118 call sites across the app; it is not something
viewing this list, by itself, ever triggers.

**Case B - allowlisted and email NOT confirmed.** A warning, not a badge that
reads as settled fact:

**Badge text:** Owner allowlist - not confirmed

**Tooltip / secondary line (warning):**

> This address is listed in `OWNER_EMAILS`, but nobody has confirmed they can
> receive mail at it. Until that happens, this account is NOT an owner - the
> role and status shown are its real, current values, and this app cannot
> promote it early. If this is not the address's real owner, they will
> continue to hold this account until the real owner confirms the address
> themselves or you remove it from `OWNER_EMAILS`.

**Known limitation, recorded rather than hidden:** `canPerformAccountAction`
(`src/lib/account-admin-rules.ts`, rule 3, lines 155-166) refuses suspend and
demote on any row where `target.isAllowlisted` is true, with no way to
express "allowlisted but unverified" in its input shape at all
(`AccountActionTarget` has no verification field). As documented today, that
means this row's suspend and demote controls render disabled with the same
"protected by the owner allowlist" reason as a genuinely-confirmed allowlisted
owner - even though this account is not actually an owner yet. This sheet
does not invent a control the code does not have: it is not this page's job
to decide whether `isAllowlisted` should be assembled differently for an
unverified address (that decision belongs to whoever builds the still-unbuilt
page and wires `AccountActionTarget.isAllowlisted`), so the warning text above
says plainly that removing the address from `OWNER_EMAILS` - not a button on
this row - is the available remedy today.

**Placeholder name, to be confirmed:** as of this writing,
`src/lib/account-people-view.ts`'s `AccountOwnershipBadge` type is
`"allowlist" | "stored" | "none"` - it does not yet carry a distinct value
for Case B, and `AccountPersonInput` does not yet carry an `emailVerified` (or
similarly named) field at all. That module is being extended, in parallel
with this document, to add exactly that signal and a distinct case. This
sheet specifies Case B against the CONCEPT ("this row is allowlisted, and the
auth account behind it has not confirmed its email"); whoever wires this copy
to the finished module must confirm the literal case name it emits rather
than assuming it matches any name used here.

**Case C - not allowlisted at all.** No badge; see "The stored owner case,"
immediately below, which is the row this case actually refers to when the
stored role and status already say `owner`/`active`.

---

## The stored owner case (GC2 / GC8, previously unnamed)

**FIXED - this case existed in code with no copy at all.** `buildAccountRows`
(`src/lib/account-people-view.ts`, lines 378-382) emits
`ownership: "stored"` for a row that is NOT allowlisted but whose stored role
and status are already `owner`/`active` - the row an owner created by
clicking "Make owner" on someone, or a pre-existing stored owner untouched by
the allowlist. The prior version of this document named only the allowlist
badge, leaving this case for the page to invent a string for.

**No badge, and no muted secondary line.** The Role and Status columns render
their ordinary values ("Owner" / "Active") exactly as any other row's would.
There is nothing to override and nothing to warn about: for this row, the
stored values already ARE the truth, which is the entire reason
`storedDiffersFromEffective` (same file) is false for it.

---

## Action buttons

Each of the five is rendered for every row. A control the rules refuse is
DISABLED WITH ITS REASON VISIBLE - never hidden, and never enabled and then
rejected. The reason string comes from `canPerformAccountAction`; the strings
below are the button labels only. See "Action feedback," after the
confirmation dialogs below, for what each button shows while its request is
in flight, once it succeeds, and if it fails or is refused after the click.

| Action | Label | Confirmation needed |
| --- | --- | --- |
| approve | Approve | Yes - the C0 dialog |
| suspend | Suspend | Yes - the C6 dialog |
| restore | Restore | No |
| promote | Make owner | Yes - short dialog |
| demote | Remove owner | Yes - short dialog |

"Make owner" and "Remove owner" rather than "Promote"/"Demote": the latter
pair reads as a judgement about the person; the former states what changes.

---

## C0 - the approve confirmation

This is the most important string on the surface. Approving is the act that
removes the containment.

**Title:** Approve this account?

**Body (email present):**

> `{email}` will get the same access to connected services that you have.
> That includes your Canvas token, your GitHub token with read and write
> access to private repositories, your cloned voice, and your avatar
> likeness.
>
> Per-account credentials do not exist yet, so this access cannot currently
> be narrowed. Approve only someone you would give those credentials to
> directly.

**Body (no email on file - see "The email cell" above for why this shape is
real, not hypothetical):**

> This account will get the same access to connected services that you have.
> That includes your Canvas token, your GitHub token with read and write
> access to private repositories, your cloned voice, and your avatar
> likeness.
>
> Per-account credentials do not exist yet, so this access cannot currently
> be narrowed. Approve only someone you would give those credentials to
> directly.

**Always shown, both cases (FIXED - satisfies the top-of-document rule that
was previously stated but never actually followed by any string on this
page):**

> Approving sends no email or notification of any kind. If this person is
> expecting to hear back from you, you need to tell them yourself.

**Second paragraph, shown only when the address is unconfirmed (GC6):**

> This address has not been confirmed. Nobody has proved they can receive
> mail at it.

**Buttons:** Cancel / Approve account

**Checked:** `requireOwner()` currently means "any active account," confirmed
at exactly 118 call sites by direct grep of `src/` (not the "~496" figure
elsewhere in this project's history, which counts something broader) - the
`requireOwner()` alias itself (`src/lib/supabase/auth.ts`, lines 451-453) is
one of those 118 and simply delegates to `requireUser()`. That is survivable
today only because no code path can set a non-owner active. This surface is
that code path. The dialog does not promise that per-user credentials are
coming; it states that they do not exist.

**Note on the GC6 paragraph:** it renders only if the page can actually tell.
`email_confirmed_at` is read by `ensureAppUser` and thrown away - nothing
persists it - so until a column exists, this paragraph cannot be shown
per-row. If it cannot be shown, the FIRST paragraph still stands alone and
correct; do not soften it to compensate.

---

## C6 - the suspend confirmation

**FIXED - this used to promise something the code cannot do, and then
contradict its own promise in the next sentence.** It said the person "will
be signed out and blocked from signing in again," then said an already-open
session keeps working - which is the opposite of "signed out." Rewritten so
both sentences agree, and so neither overstates what actually happens.

**Title:** Suspend this account?

**Body (email present):**

> `{email}` will not be able to sign in again once this completes. If they
> are already signed in somewhere, that session is not forced out - it keeps
> working until it naturally expires, which is a setting on your Supabase
> project, not something this app controls or can shorten from here.
>
> You can restore the account afterwards.

**Body (no email on file):**

> This account will not be able to sign in again once this completes. If it
> is already signed in somewhere, that session is not forced out - it keeps
> working until it naturally expires, which is a setting on your Supabase
> project, not something this app controls or can shorten from here.
>
> You can restore the account afterwards.

**Buttons:** Cancel / Suspend account

**Checked:** `setAppUserStatus` (`src/lib/supabase/app-users.ts`, lines
306-320) bans at the auth provider BEFORE writing the row, so a failed ban is
never reported as a successful suspend. That function's own doc comment (the
paragraph headed "HONESTY NOTE," lines 293-301) is direct about the rest:
banning "blocks future sign-in and refresh-token grants... It does NOT
invalidate an access token already issued... that token keeps working for
whatever lifetime it has left." The same doc comment (lines 249-255)
separately confirms `auth.admin.signOut` "cannot be driven from an owner
action against someone else's id at all with what this codebase has
available" - so nothing in this function, or anywhere else in this module,
signs anyone out. NOTHING in this codebase can force out an existing session
today; the dialog above does not claim otherwise.

**On "up to an hour" (dropped, not merely softened):** the prior version
asserted a specific duration and then told a future editor not to change the
wording "without changing the token lifetime first," as if this repository
controls that setting. Grepped for a token lifetime constant across `src/`,
`supabase/`, and this app's env contract: there is none. The access-token
lifetime is a Supabase project setting (JWT expiry), configured in that
project's dashboard, not in this codebase - which is exactly why the body
above names it as "a setting on your Supabase project" instead of stating a
number this app does not actually know or control, and drops the old
instruction about "changing it first," which implied a lever this app does
not have.

---

## Promote and demote confirmations

**Promote title:** Make this account an owner?

**Body (email present):**

> `{email}` will be able to approve, suspend and remove other accounts,
> including yours.

**Body (no email on file):**

> This account will be able to approve, suspend and remove other accounts,
> including yours.

**Demote title:** Remove owner access?

**Body (email present):**

> `{email}` keeps their access to the workspace - only the ability to manage
> other accounts is removed.

**Body (no email on file):**

> This account keeps its access to the workspace - only the ability to
> manage other accounts is removed.

The demote body exists to stop an owner reading "Remove owner" as "remove
this person" - it names what is kept, not only what is lost. (Reworded
slightly from the prior version, which read "will keep their account and
their access to the workspace" - a phrase that breaks when the subject
becomes "This account will keep their account." The new wording says the
same thing without repeating "account" as both subject and object, and reads
correctly in both the email and no-email forms.)

**Checked (fix 5, all four dialogs above):** `AppUserRow.email` is typed
`string | null` (`src/lib/supabase/app-users.ts`, line 77, "BUG 5 FIX:
nullable, matching the migration's own `email text` column") and
`AccountPersonInput.email` matches it (`src/lib/account-people-view.ts`, line
70). `account-people-view.test.ts` (lines 296-301) is titled "handles a row
with no email at all" and builds exactly that shape. Every dialog above that
used to interpolate `{email}` as its grammatical subject now has a fallback
sentence that reads correctly with no address at all, rather than rendering
an empty backtick pair as the subject of a sentence.

---

## Attribution (C7)

**FIXED - the prior table was wrong in both directions**, and missed a
fourth, common case entirely.

| Case | Rendered as |
| --- | --- |
| `statusChangedAt` is null (the row has never been touched by either function) | Never changed |
| `statusChangedAt` is set and `statusChangedBy` is null | Automatically |
| `statusChangedBy` resolves to a known account | that account's email address |
| `statusChangedBy` is set but unresolvable | An administrator |

Never render the raw id. `describeStatusActor` returns a discriminated union
specifically so that printing it is not possible by accident.

Deciding "Never changed" versus "Automatically" needs BOTH fields, not just
`statusChangedBy` alone: `describeStatusActor` (`src/lib/account-people-
view.ts`, lines 172-188) only ever sees `statusChangedBy`, and a row that has
never been touched has that field null for the same reason a
reconciliation-only row does - the caller must check `statusChangedAt` first
and render "Never changed" whenever it is null, falling back to the table
above only once it is set.

**"Automatically" is correct rather than evasive** for its one case: the
demotion branch of `ensureAppUser`'s reconciliation
(`src/lib/supabase/app-users.ts`, line 887:
`update.status_changed_by = update.role === "owner" ? current.statusChangedBy
: null`) always writes a null actor when it demotes a stale allowlist-granted
owner - a real "system" actor row would need a migration, and this is a
genuine statement that no person did this.

**What was wrong, and is now recorded rather than silently fixed:** the prior
version claimed "reconciliation's writes stamp a null actor deliberately" as
a blanket rule. That line above is true only for the DEMOTION branch. Read
against the PROMOTION branch of the same function (lines 811-820, and the
comment block at lines 865-877 headed "BUG 2 FIX"): when reconciliation
promotes an allowlisted address back to `owner`/`active`, it deliberately
PRESERVES whatever actor the row already carried
(`update.status_changed_by = update.role === "owner" ? current.statusChangedBy
: null` - the SAME line, but the OWNER branch of that ternary is the one that
matters here) rather than overwriting it with null, specifically so an
owner's earlier suspend of that row is not erased from the record when
reconciliation later reverses it.

The consequence the review is right to flag: this list can genuinely render
"Last status change: a few seconds ago - owner@example.edu" for a change that
`owner@example.edu` did not make just now and which undid their own earlier
suspend of that account. The email shown is not wrong - that person really is
the last human who touched this row's status - but the freshly-updated
timestamp next to it invites the reader to assume they acted just now, and
they did not.

**This sheet does not attempt to fix that ambiguity, and says so rather than
papering over it:** doing so would need a signal this data model does not
have - something like "was this write reconciliation re-touching an existing
attribution, or a fresh human action" - and no such field exists on
`AppUserRow` or `AccountRow` today (the closest candidate, `role_granted_by`,
only ever concerns the ROLE column, per `setAppUserRole`'s own comment in
`app-users.ts`, and is not populated by this status-only demote-then-promote
sequence at all). Inventing a new column or field is outside what a copy
sheet can specify. This is recorded here as an accepted, known limitation of
the "Last status change" cell: it names a real actor and a real time, but the
combination of the two does not always mean what it appears to mean.

---

## Action feedback: busy, success, refusal, and failure

**NEW SECTION.** The prior version specified three failure/empty states (see
below) and named nothing for what happens between clicking a button and one
of those three landing. Five real states were missing entirely: a request in
flight, a request that succeeded, a request the server refused because the
account changed underneath it between page load and click, a request that
failed outright, and the list itself still loading. Each is specified here.

### While a request is in flight

The clicked button's own label is replaced and every action on that row is
disabled for the duration - not a separate "reason," because "busy" is
self-explanatory the way "disabled with the reason visible" is not:

| Action | Busy label |
| --- | --- |
| approve | Approving... |
| suspend | Suspending... |
| restore | Restoring... |
| promote | Making owner... |
| demote | Removing owner... |

### On success

A brief, transient confirmation - not a modal, nothing that needs dismissing:

| Action | Confirmation (email present) | Confirmation (no email on file) |
| --- | --- | --- |
| approve | `{email}` approved. | Account approved. |
| suspend | `{email}` suspended. | Account suspended. |
| restore | `{email}` restored. | Account restored. |
| promote | `{email}` is now an owner. | Account is now an owner. |
| demote | Owner access removed from `{email}`. | Owner access removed. |

### Refused because the account changed after the page loaded

This is unavoidable, not a bug to route around: the last-owner count
(`activeOwnerCount` on `AccountActionContext`,
`src/lib/account-admin-rules.ts`) is recomputed freely-fresh inside the
mutation itself (`countEffectiveOwners`, `src/lib/supabase/app-users.ts`,
lines 453-475, whose own doc comment says callers "must invoke this INSIDE
the mutation they are guarding, never carry a value forward from an earlier
render") precisely because two owners in two tabs, or one owner in two tabs,
each seeing a stale count of two, could otherwise leave a deployment with
none. So the button an owner sees as enabled is only ever advisory; the real
answer is decided at the moment of the click, on the server, against
whatever is true right then.

> This could not be completed. The account, or the number of active owners,
> changed after this list loaded - for example, someone else acted first, or
> this was the last active owner by the time the change reached the server.
> Reload the list to see the current state, then try again if it still
> applies.

### On failure

The generic case, for approve, restore, promote, and demote:

| Action | Failure copy (email present) | Failure copy (no email on file) |
| --- | --- | --- |
| approve | Could not approve `{email}`. Nothing was changed. Try again, or reload the list if the problem continues. | Could not approve this account. Nothing was changed. Try again, or reload the list if the problem continues. |
| restore | Could not restore `{email}`. Nothing was changed. Try again, or reload the list if the problem continues. | Could not restore this account. Nothing was changed. Try again, or reload the list if the problem continues. |
| promote | Could not make `{email}` an owner. Nothing was changed. Try again, or reload the list if the problem continues. | Could not make this account an owner. Nothing was changed. Try again, or reload the list if the problem continues. |
| demote | Could not remove owner access from `{email}`. Nothing was changed. Try again, or reload the list if the problem continues. | Could not remove owner access from this account. Nothing was changed. Try again, or reload the list if the problem continues. |

**Suspend has three distinguishable failure shapes, not one, and this is the
most alarming state this system can produce.** Read directly out of
`setAppUserStatus` (`src/lib/supabase/app-users.ts`, lines 306-363):

1. **The provider ban call itself fails** (lines 314-320): the row is never
   touched. Nothing changed.

   > Could not suspend `{email}`. The account could not be blocked at the
   > sign-in provider, and nothing here was changed. Try again, or reload the
   > list if the problem continues.

2. **The ban succeeds, the row write fails, and reversing the ban succeeds**
   (lines 337-357, the second `throw` in that block): the account's provider
   state is put back to match its unchanged row.

   > Could not finish suspending `{email}`. The block has already been undone,
   > so the account can still sign in as before. Try again, or reload the
   > list if the problem continues.

3. **The ban succeeds, the row write fails, and reversing the ban ALSO
   fails** (lines 344-352, the function's own comment: "the account may be
   locked out at the provider with no automatic recovery"). This has no
   automatic recovery, and the copy must say so plainly and say what to do,
   without printing the raw thrown error:

   > `{email}` could not be suspended here, and this app could not undo the
   > block it had already put in place at the sign-in provider. The account
   > may be locked out with nobody able to fix it from this list. Go to your
   > Supabase project's dashboard (Authentication, then Users), find this
   > account, and remove the ban directly. Retrying from here will not help
   > until that is done.

**Implementation note, not a copy decision:** distinguishing these three
requires the server action calling `setAppUserStatus` to tell them apart.
`setAppUserStatus` currently communicates the difference only through the
wording of the `Error` it throws (compare the three `throw new Error(...)`
call sites above), not through a structured error type or code. Whoever
writes that action must either pattern-match on the thrown message (fragile,
but the only mechanism available today) or - preferably, as a follow-up
outside this document's scope - have `setAppUserStatus` throw a typed error
so the three cases can be told apart without string matching. This document
specifies the three user-facing strings; it cannot specify how the calling
code tells them apart, because that is not a copy decision.

---

## Loading, empty, and failure states

**While the list has not loaded yet (NEW - previously unspecified):**

> Loading accounts...

Rendered with `aria-live="polite"` so assistive technology announces it once
rather than on every re-render, alongside whatever loading treatment (a
skeleton, a spinner) the page uses elsewhere.

**No accounts at all (FIXED):** No account records exist yet.

Changed from "Nobody has signed in to this workspace yet." The trigger that
creates a row (`handle_new_auth_user`) fires on INSERT into `auth.users` -
that is, at account creation (sign-up, an admin invite, a dashboard-created
user), not at first successful sign-in. A person who signed up and has never
signed in already has a row, and this list already argues (see GC7, above)
that its own "Created" column must say "account record created," not "signed
up," for exactly this kind of reason. "Nobody has signed in" was inconsistent
with that same argument applied to the empty-list case.

**Nobody pending:** No accounts are waiting for approval.

**The list failed to load:**

> The account list could not be loaded. This does not affect anyone's
> existing access.

That second sentence matters. An owner who sees a failed admin screen has to
know whether the failure is also an outage for everyone else, and it is not.

---

## The pending count in the navigation (GC8)

A live count, not a since-last-seen delta - a pending account does not stop
mattering because somebody looked at it once.

**Label:** `{n} waiting` with the entry, and the accessible name
`Accounts, {n} waiting for approval`.

Render nothing when the count is zero. A zero badge is noise that trains the
reader to ignore the badge that is not zero.

---

## Deferred: clearing a member's MFA factors (C5)

**NEW - recording an absence as a decision, not an oversight.** AC C5
describes an administrator capability to clear a member's own MFA factors
when they are locked out and cannot reach their own authenticator. Checked
across `src/`: there is no `auth.admin.mfa.*` call, no server action, and no
button anywhere in this codebase that acts on ANOTHER account's MFA factors.
The only MFA-factor code that exists is self-service - `src/app/account/
security/page.tsx` calls `supabase.auth.mfa.unenroll` against the signed-in
user's OWN session (lines 91 and 103), and `src/app/login/page.tsx` /
`src/app/login/reset/page.tsx` only ever call `listFactors` for the signed-in
user's own factors.

This list has no button for it, and none is specified here, because there is
no capability behind one to specify copy for.

Both `src/app/login/page.tsx` and `src/app/account/security/page.tsx`
currently tell a locked-out member to use the Supabase dashboard directly
(security page, line 222: "you would have to remove the factor from the
Supabase dashboard"). That copy is accurate today and this document does not
change it. But per AC C5, the intent once this capability exists is for that
copy to instead name the administrator. Anyone changing either of those two
strings to say "ask your administrator" or similar MUST NOT ship that change
before this capability actually exists in code - doing so would recreate the
exact false promise this whole revision exists to remove from this page.


---

## Strings added during the build, and why the sheet did not have them

Recorded after the fact rather than quietly invented in the page. Each of
these was a real gap: the implementer needed a string, the sheet had none, and
a gap filled silently is how two surfaces end up wording the same thing
differently.

**The non-owner denial page.** Not in the sheet at all, because the sheet was
written before anyone traced who can actually REACH this route. The request
gate admits any ACTIVE account, so an ordinary member who follows a shared
link or types the URL gets here and is refused by `requireAppOwner()`. There
is no `error.tsx` or `global-error.tsx` anywhere under `src/app`, so an
uncaught refusal renders the framework's generic server-exception screen - a
correct denial presented as a crash.

> **Accounts**
>
> Managing accounts is limited to the workspace owner, so this page is not
> available to you. Nothing is wrong with your account.
>
> [Back to your account settings]

It does NOT name the owner or say how many owners exist: that is information
about other people's roles, and a member who cannot open this page has no need
of it. "Nothing is wrong with your account" is load-bearing - without it, a
member who has just been approved reads this as their approval having failed.

**Only the owner-only refusal is caught.** A service outage or an auth
transport failure is rethrown, deliberately. Rendering "you are not the owner"
for a real fault would tell the ACTUAL owner they had lost their own access
and would hide the outage that caused it. The refusal is recognised by
comparing against `OWNER_ONLY_MESSAGE`, exported from
`src/lib/supabase/auth.ts` and imported by the page - never a copied literal,
so the two cannot drift apart.

**Confirm-button labels for promote and demote.** The sheet gave dialog bodies
but only named confirm labels for approve and suspend. The action table's own
labels are reused: **Make owner** and **Remove owner**. Reusing them is the
point - a dialog whose button says something different from the control that
opened it makes the reader check they clicked the right thing.

**Suspend's generic failure.** The sheet specified the three DISTINGUISHABLE
suspend failures and missed the fourth branch - the catch-all for anything
`classifySuspendFailure` does not recognise. It takes the same generic
"nothing was changed" phrasing the other four actions use, with "suspend"
substituted. This branch exists because the classification is a substring
match against another module's wording, so an unrecognised message is always
possible; see `src/lib/account-suspend-failure.ts`.

**`not_found`, `not_authorized` and `invalid_id`.** Result kinds the sheet did
not anticipate. `not_found` renders the stale-refusal text, which fits it
literally - the account was deleted between the list loading and the click.
The other two render the generic per-action failure: both are unreachable
through this page's own UI (the page is owner-gated and builds its own ids),
so they exist only for a direct POST to the action endpoint, where a
descriptive message would tell a prober more than it tells anyone legitimate.

**The actions column header.** The sheet names the six data columns and not
the seventh. It is a header for a column of controls, so it takes a plain
label rather than a data-column name.
