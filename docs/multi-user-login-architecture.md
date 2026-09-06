# Multi-user login - architect pass and UX pass

Companion to `docs/multi-user-login-acceptance-criteria.md`. The AC says WHAT
must be true; this says HOW the system is shaped and how it feels to use.
Written before any code, revised by the audits and the peer sabotage checks.

---

# Part 1 - Architect pass (structure)

## The one-sentence shape

A pure decision module owns the access rule; a thin IO module owns the
`profiles` table; the request gate and the server-action guard are two callers
of the same decision, and neither re-implements it.

## Modules and seams

| Module | Kind | Owns |
| --- | --- | --- |
| `src/lib/access.ts` (new) | PURE, edge-safe | The access decision, the signup-mode contract, the domain allowlist. No IO, no imports of `next/*` or `node:*`. |
| `src/lib/owner.ts` (exists) | PURE | `isOwnerEmail`. Stays as the break-glass env allowlist; `access.ts` imports it rather than copying the rule. |
| `src/lib/supabase/profiles.ts` (new) | SERVER IO | Read/create/reconcile a profile row; list and mutate profiles for the admin surface. The ONLY module that writes `public.profiles`. |
| `src/lib/supabase/auth.ts` (exists) | SERVER IO | `requireUser()` / `requireAppOwner()`. Composes `getUser()` + `getProfile()` + `resolveAccess()`. |
| `src/lib/supabase/proxy.ts` (renamed from `middleware.ts`) | EDGE IO | Session refresh + the redirect decision. Composes the same three pieces. |
| `src/proxy.ts` (renamed from `middleware.ts`) | EDGE entry | Matcher config only. |
| `src/app/login/**` | UI | Every unauthenticated screen, under ONE path prefix. |
| `src/app/auth/confirm/route.ts` (new) | Route Handler | Verifies an emailed token, then redirects. |
| `src/app/account/people/**` (new) | UI + actions | The owner's admin surface. |

## The decision contract

```ts
type AccessRole = "owner" | "member";
type AccessStatus = "pending" | "active" | "suspended";
type AccessDecision =
  | "anonymous"    // no session
  | "pending"      // signed in, awaiting approval
  | "suspended"    // signed in, access revoked
  | "unavailable"  // we could not determine it (profile lookup failed)
  | "active"       // full member access
  | "owner";       // member access plus the admin surface

function resolveAccess(input: {
  email: string | null | undefined;
  profile: { role: AccessRole; status: AccessStatus } | null;
  lookupFailed?: boolean;
}): AccessDecision;
```

Rule order, and why each step is where it is:

1. No email -> `anonymous`. Nothing else can be true without an identity.
2. `isOwnerEmail(email)` -> `owner`, **before any profile is consulted**. This
   is deliberate: it is the break-glass path. ~~If the database is unreachable
   or the owner's profile row is corrupted, the person who pays for the
   deployment can still get in and fix it.~~ **CORRECTED by the SRE pass - the
   first half of that claim was false.** `email` comes from
   `supabase.auth.getUser()`, which is a NETWORK CALL to Supabase. GoTrue and
   PostgREST run against the same Postgres, so a project-level outage takes
   both: `user` is null, `email` is empty, and `resolveAccess` returns
   `anonymous` - not `owner`. There is no configuration of this function that
   lets anyone in when Supabase is down, because nobody can authenticate at
   all.

   What break-glass ACTUALLY covers, which is still worth having and is the
   more likely failure: `app_users` missing, RLS misconfigured, a stale
   PostgREST schema cache - the migration-did-not-apply case, where auth works
   and the table does not. Keep the ordering; the claim is what was wrong.

   Consequence for the gate: `getUser()`'s `error` must be READ, not discarded
   as the current middleware does, and a retryable failure mapped to
   `unavailable` so the designed "we could not check your access, try again"
   screen appears instead of a sign-in form that cannot possibly work.
3. `lookupFailed` -> `unavailable`. Fails CLOSED for everyone but the env
   owner, and is a distinct state from `suspended` so the UI can say "try
   again" instead of accusing someone of being banned.
4. No profile row -> `pending`. A session with no profile is not trusted; the
   row is created by `ensureProfile`, not inferred by the gate.
5. `status === "suspended"` -> `suspended`; `status === "pending"` -> `pending`.
6. `status === "active" && role === "owner"` -> `owner`, else `active`.

The function is total, takes no clock and no environment beyond
`isOwnerEmail`, and every branch is reachable from a unit test with a plain
object.

## Where the profile row comes from (the reconciliation seam)

Two mechanisms, deliberately belt-and-braces, because a missing profile is the
one failure that turns into "signed up successfully, permanently locked out":

- **A database trigger** on `auth.users` insert writes a minimal row
  (`role='member'`, `status` from the deployment default). It cannot be skipped
  by any code path, including an account created from the Supabase dashboard
  or by `auth.admin.inviteUserByEmail`.
- **`ensureProfile()` in the application**, called from `requireUser()` when
  the lookup returns nothing, and on every sign-in to reconcile
  `OWNER_EMAILS`. This is what lets the owner add an email to `OWNER_EMAILS`
  after the fact and have that account become an owner without touching SQL.

The trigger cannot read `OWNER_EMAILS` (the database does not have it), so the
trigger sets the floor and the application does the promotion. Recorded here
because a reader will otherwise ask why both exist.

**First-run bootstrap** lives in `ensureProfile`, not in `resolveAccess`: if
`OWNER_EMAILS` is empty and `profiles` is empty, the first row inserted is
`owner`/`active`. It needs a count, so it cannot live in the pure module.

## Read cost, and the alternative that lost

`requireUser()` gains one indexed primary-key select on top of the
`auth.getUser()` call it already makes. ~~Some server actions call it more than
once per request, so `getProfile` is wrapped in React's `cache()` to collapse
repeats within a single request.~~ **CORRECTED by the SRE pass: `cache()` does
not memoize where this claim needed it to.** Verified against the installed
React: the non-`react-server` build exports `cache` as a pure pass-through with
zero memoization, and the real implementation memoizes only while
`ReactSharedInternals.A` is set, which happens during an RSC render. Outside
one, the dispatcher allocates a fresh `Map` per call. So dedup works inside a
Server Component tree and does NOT work in a Route Handler, in the proxy, or
in a Server Action body - which was the case cited.

The good news in the same finding: because the fallback is a fresh `Map` and
not a process-global, there is no cross-user cache leak. That would have been
the catastrophic version of being wrong about this.

Keep the `cache()` wrapper (it is harmless and correct where it does apply),
delete the claim, and accept the cost: a page navigation makes two extra
Supabase round trips. At single-digit users that is imperceptible. If it ever
shows up in a real trace, the fix is an `AsyncLocalStorage`-scoped memo - an
idiom this repo already owns in `src/lib/supabase/owner-context.ts` - not a
module-scope map.

**Alternative considered and rejected for now:** a Supabase custom access token
hook that stamps `role` and `status` into the JWT, removing the query
entirely. Rejected because registering the hook is a dashboard action outside
this repository, so the code would depend on manual configuration that a fresh
deployment would not have - and the failure mode is silent (every user reads
as having no role). Revisit when the query shows up in a real trace. The
`resolveAccess` signature takes a profile-shaped object precisely so the JWT
claim can be swapped in later without touching a single caller.

## The `requireOwner()` split

`requireOwner()` is deleted as an export and replaced by two:

- `requireUser()` - any `active` or `owner` account. The DEFAULT, because every
  table is already `user_id`-scoped with RLS, so a member acting on their own
  data is the normal case.
- `requireAppOwner()` - `owner` only. Reserved for call sites that spend or
  reach an OWNER-PRIVATE resource through a shared server secret, plus the
  admin surface.

The migration of ~183 call sites is mechanical EXCEPT for choosing which of
the two each site gets. That choice comes from the shared-secret audit, not
from a blanket rename; the audit's list becomes an explicit allowlist in the
implementer brief. A site that is not on the list becomes `requireUser()`.

Both return the same shape (`{ id, email, role, status }`), a superset of the
`{ id, email }` that every existing call site reads, so no call site's usage of
the return value changes.

`runAsOwner` impersonation is untouched. It already re-checks `isOwnerEmail`
before impersonating, and `requireAppOwner()` must honour it the same way
`requireOwner()` did - a cron-run workflow keeps whatever access it had.

## Failure modes, and what happens on each

| Failure | Behavior |
| --- | --- |
| Profile lookup throws / times out | `unavailable`. Env owner still gets in; everyone else sees a retry screen. Never fails open. |
| Session present, no profile row | `pending`, and `ensureProfile` creates the row on the next server action. |
| `OWNER_EMAILS` unset on an established deployment | Owners come from `profiles.role` alone. The env var is an override, not the source of truth. |
| Supabase email sending is rate-limited (the built-in sender allows very few per hour) | Sign-up still succeeds; the "check your email" screen offers a resend and says what to do if nothing arrives. Documented in the README as needing real SMTP. |
| A member is suspended mid-session | The next request through the gate redirects them; server actions throw. No stale-session grace period. |
| Two owners, one demotes the other, then themselves | Refused. `setProfileRole` counts remaining owners inside the mutation and rejects the last demotion. |

## What this deliberately does NOT abstract

- No general RBAC or permission table. Two roles, one status enum, both
  hard-coded. A third role would be a one-line union change; a permission
  matrix would be speculative.
- No per-user API keys for Gemini/ElevenLabs/HeyGen. The approval gate is the
  containment for shared spend in this pass; per-user credentials are a
  follow-up the `profiles` table is shaped to accept.
- No organisation/team layer. Users are individuals.
- No audit log table. `approved_at` / `approved_by` on the profile is the
  minimum provenance; a full log is speculative.

## Extension points the next feature will want

- `profiles` is the join point for per-user credentials (a `user_credentials`
  table keyed on the same id).
- `AccessDecision` is a closed union, so adding `invited` forces the compiler
  to walk every consumer.
- `resolveAccess` taking a profile-shaped object (not a database row) is what
  makes the JWT-claim optimisation a drop-in later.

---

# Part 2 - UX pass (experience)

## The five people who hit these screens

1. A stranger who found the URL. Must be able to tell what this is and either
   sign up or leave. Must never see "your account is not approved" as their
   first and only sentence.
2. A colleague the owner invited. Signs up, confirms an email, and waits. The
   waiting has to feel like a queue, not a wall.
3. An approved member returning. Sign in, maybe MFA, done. This path must not
   get one click longer than it is today.
4. The owner. Everything above, plus approving people, and never being locked
   out of their own deployment.
5. The same browser, two accounts. Sign out has to actually leave.

## Click cost (the standard this repo holds)

| Task | Clicks/fields today | Target |
| --- | --- | --- |
| Existing member signs in | email, password, submit (+ MFA) | UNCHANGED. Not one interaction longer. |
| Stranger creates an account | impossible | 1 click from `/login` to the form, then name/email/password, submit |
| Recover a password | impossible | 1 click from `/login`, then email, submit |
| Owner approves someone | impossible | 1 click from the pending row |

The sign-up and forgot links live on the sign-in card itself. No modal, no
accordion, no second page of chrome - the card swaps content and the URL
changes so back works and a link can be shared.

## Route shape, and why one prefix

Every unauthenticated screen lives under `/login`:

- `/login` - sign in (+ the existing MFA step)
- `/login/signup` - create an account
- `/login/forgot` - request a reset email
- `/login/reset` - set a new password (reached from the emailed link)
- `/auth/confirm` - route handler, no UI

This is a UX decision AND a safety decision: the gate's public-path exemption
stays a single prefix, so a future auth screen cannot ship unreachable because
someone forgot to add it to the exemption list. Route-group folders keep the
shared card layout and CSS module in one place.

## Every state, and what it says

| State | Headline | Body | Action |
| --- | --- | --- | --- |
| Sign in | Welcome back | Sign in to your teaching workspace. | Sign in / Create an account / Forgot password |
| MFA step | Two-factor authentication | Enter the 6-digit code from your authenticator app. | Verify / Back to sign in (unchanged) |
| Sign up, confirmations ON | Check your email | We sent a confirmation link to {email}. Open it to finish setting up your account. | Resend / Back to sign in |
| Sign up, confirmations OFF, approval mode | You are in the queue | Your account is created. An administrator has to approve it before you can start. We will email you. | Sign out |
| Sign up, open mode | (no screen - straight into the app) | | |
| Sign up, closed mode | No form at all. The sign-in card says sign-ups are closed. | | |
| Pending (returning) | Waiting for approval | Your account was created on {date} and is waiting for an administrator. | Sign out / Check again |
| Suspended | Access paused | Access for {email} has been paused. Contact the administrator of this workspace. | Sign out |
| Unavailable | We could not check your access | Something went wrong reaching the account service. This is not a problem with your account. | Try again / Sign out |
| Confirm link expired | That link has expired | Confirmation links are valid for a short time. Request a new one. | Resend / Back to sign in |
| Reset password | Choose a new password | (strength requirement stated UP FRONT, not after a failed submit) | Save and sign in |

Every one of these has a way forward. The current single dead-end sentence
("this account is not approved for access") is the specific defect this table
exists to kill.

## Copy rules

- Second person, no exclamation marks, no emojis (repo rule).
- Never blame the user for a system state ("Access paused", not "You are
  banned").
- Never leak whether an email has an account. `/login/forgot` says "If there is
  an account for that address, we have sent a link" in all cases, including
  when the address is malformed-but-plausible.
- Password requirements are stated before the field is submitted, not
  discovered by failing.

## Keyboard, focus, and errors

- Every input has a real `<label for>`; no placeholder-as-label.
- Autocomplete tokens are correct and are what make password managers work:
  `email`, `current-password`, `new-password`, `one-time-code`, `name`.
- Tab order follows visual order; the primary button is the form's submit so
  Enter works from any field.
- Errors render in a `role="alert"` region that already exists on the login
  card, and focus moves to it on failure so a screen-reader user hears it.
- The state-explanation screens are headings, not paragraphs of muted text, so
  they appear in the heading outline.
- Visible focus rings come from the app's existing focus-ring treatment (see
  `src/app/focusRing.wiring.test.ts`), not a new one.

## Identity in the chrome

The app is about to have more than one user, so "who am I signed in as" stops
being a rhetorical question. The top bar shows the signed-in person and holds
sign-out. Sign-out must clear per-user module caches - `REGRESSION.md` entry
189 documents a real leak where one user's course tiles rendered for the next
user in the same tab, because sign-out is a client navigation and the module
registry survives it. Any cache added by this work inherits that requirement.

## The admin surface

- Pending accounts sort to the top with a count badge; there is nothing to do
  on the page most days, and the empty state should say so plainly.
- Approve is one click, optimistic, with the row settling into its new state.
- Destructive-ish actions (suspend, demote) confirm; approve does not.
- The action that would remove the last owner is disabled with the reason
  visible, not enabled-then-rejected.
- Reachable from the account navigation, owner-only in the nav AND on the
  server.

## What persists

Nothing sensitive. No remembered email, no remembered mode. The repo's
`ta-` localStorage convention applies to app controls; auth screens
deliberately opt out, and that is a decision, not an omission.

---

# Part 3 - Reconciliation with the data-engineering pass

The data-engineering pass ran concurrently with Parts 1 and 2. Where it
disagreed with the architect pass, this is how it was resolved and why. A
silent divergence between the two would be a planning defect.

**RESOLVED 1 - the table is `app_users`, not `profiles`.** The architect pass
said `profiles`; the data pass said `app_users`. The data pass wins on
evidence: "profile" is already taken in this schema
(`course_hub.instructor_profile`, migration `20260920000000`), so a
`profiles` table would read as the instructor's teaching profile, which is a
different thing. Roles are `owner | instructor` rather than `owner | member`,
for the same domain-fit reason. Every reference to `profiles` in Parts 1 and 2
means `app_users`.

**RESOLVED 2 - the trigger is required, not belt-and-braces.** The architect
pass proposed a trigger AND an application-level upsert, describing the
trigger as insurance. The data pass showed the trigger is load-bearing:
sign-up happens in the BROWSER via `supabase.auth.signUp`, so no server code
is guaranteed to run at account creation, and the gate runs at the edge where
a service-role write per request is both a latency tax and a security
smell. Without the trigger the gate would have to treat "no row" as allowed -
the exact fail-open this design refuses. So: the trigger creates the row
(`security definer` with `set search_path = ''`, the repo's first of each,
which is a deliberate and documented exception), and the application layer
only ever RECONCILES an existing row against `OWNER_EMAILS`.

**SUPERSEDES RESOLVED 3 (below) - the capability check goes at the SECRET, not
at the call site.** The architect pass and the shared-secret audit both assumed
each of the ~103 guard call sites would be classified as `requireUser()` or
`requireAppOwner()`. I derived that classification mechanically from the import
graph (seeded at `canvas-core.ts`, `github.repos.ts`, the three media action
modules and `grading-engine.ts`) and the result kills the approach: **72 of 103
files transitively reach a shared owner-funded secret**, including
`src/lib/supabase/courses.ts` (the user's own course list) and
`src/app/actions/knowledge-base.ts`. Gating those to the owner would leave an
approved member with a login and a blank app. Narrowing the list by hand across
72 files is exactly the error-prone judgment call that ships a hole.

So the check moves to the resource:

- `resolveInstitution`, `resolveDefaultInstitution` and `resolveInstitutionByCode`
  (`src/lib/canvas-core.ts`) become async and assert Canvas access before
  returning a token. ~~44 call sites, nearly all already inside async
  functions.~~ **CORRECTED by the data-engineering pass: 107 call sites across
  40 files.** The 44 omitted the 79 sites of `resolveCourse`, the synchronous
  wrapper over the other two. The qualitative claim survives and is stronger
  than stated: exactly TWO of the 107 sit inside a synchronous function
  (`canvas-core.ts:227` inside `resolveCourse` itself, and `inbox.ts:72`
  inside `resolveInbox`), and every caller of those two is already async. So
  the refactor is 107 `await`s and two function signatures, not 44 of
  anything. Plan against 107.

  **And no call site gains a PARAMETER, only an `await`.** The accessor reads
  the caller's identity exactly the way `requireOwner` already does -
  `getImpersonatedOwner()` from the AsyncLocalStorage store first, then the
  cookie-bound client - because every path into `canvas-core` has already
  established an identity before it arrives (a server action that called the
  guard, or `runAsOwner` for the unattended paths). Threading a `userId` down
  through 79 `resolveCourse` call sites would force signature changes on 40
  files' public exports, which is precisely the scattering this seam exists to
  prevent.
- `githubToken()` is consulted from exactly ONE place, `ghFetch`
  (`src/lib/github.repos.ts:32`), so GitHub needs a single assertion.
- The three media env fallbacks (`HEYGEN_AVATAR_ID`, `ELEVENLABS_VOICE_ID`,
  the Tavus key) assert at their own read sites.

**What this buys.** The `requireOwner` -> `requireUser` sweep becomes a straight
one-to-one mechanical rename with no per-site judgment at all, which removes the
single largest source of error in the plan. The containment lives once, next to
the thing it protects, where it cannot be forgotten by the next feature that
adds a Canvas call. And the follow-up chunk extends the SAME function with "or
the caller has their own credential row" rather than re-touching 72 files.

**Cost, stated honestly.** Making three synchronous resolvers async is a real
refactor with 44 call sites and their transitive callers. It is worth it: the
alternative is a hand-maintained list of 72 files that must stay correct
forever.

**RESOLVED 3 - `requireOwner()` still splits, and the data pass's objection
does not apply.** The data pass recommended keeping the name, on the finding
that 268 of 433 call sites discard the return value and the remaining 165
read only `user.id` - so no call site NEEDS to change. That is a finding about
the return SHAPE, and it is good news: it is why the split is cheap. It is not
an argument about which guard each site should get. The shared-secret audit
settles that independently: `GITHUB_TOKEN` reaches the owner's private repos,
`HEYGEN_AVATAR_ID` is the owner's face, and the Canvas token is the owner's
gradebook. Those sites must be `requireAppOwner()`, and a single-named guard
cannot express that. Both passes are adopted: the return shape is unchanged
(so no call site's BODY changes), and the guard NAME at each site is chosen
from the audit's classification.

**RESOLVED 4 - upserts need a stored generated column, not a partial index.**
The data pass caught that every writer to the three global tables uses
PostgREST `.upsert()`, and adding a nullable `user_id` to the conflict target
fails at runtime with 42P10. Migration `20261011000000` already documents this
trap in its header, and the repo already knows it
(memory: "upsert cannot infer a partial index"). The `owner_key` stored
generated column idiom from that migration is reused verbatim rather than
reinvented.

**RESOLVED 5 - storage needs no work at all.** The architect pass listed
per-user object paths as an open question (AC D3). The data pass closed it:
all four buckets are already `${userId}/...` namespaced with matching
`(storage.foldername(name))[1] = auth.uid()::text` policies, and filenames
within a user's folder are `crypto.randomUUID()` or a row id, never
user-supplied. D3 is satisfied by the code as it stands. Verified, not
assumed - and the AC records it as verified rather than quietly dropping it.

**NOT RESOLVED, DEFERRED WITH A REASON - per-user spend quotas.** The data
pass wants a per-user quota on the shared LLM and media keys before sign-up
opens. It is right that none exists. It is deferred out of the first chunk
because `SIGNUP_MODE` defaults to `approval` and nothing is approved by
default, so the exposure requires a deliberate act by the owner. It is
recorded as the top item of the follow-up chunk, not dropped.

## Pre-existing defects the audits surfaced

These are not caused by the login work. They are cross-tenant defects that are
harmless today (one user) and become live the moment a second account exists,
so they are fixed in the same chunk that creates the second account.

1. **`accessibility_scans` has no RLS and is not even a migration.**
   `src/lib/supabase/accessibility_scans.sql` creates the table with
   `user_id uuid not null` but no foreign key, no
   `enable row level security`, and no policies, on the stated reasoning that
   "writes use the service-role key, so RLS is optional". Under Supabase's
   default grants to `authenticated`, a table with RLS disabled is readable
   AND writable by any signed-in browser session holding the anon key. The
   file also lives outside `supabase/migrations/`, so the GitHub Action that
   applies migrations has never applied it.
2. **`deleteArtifactTemplate` deletes by id alone.**
   `src/lib/artifact-templates.ts:59-67` issues
   `.delete().eq("id", id)` through the service-role client, called from
   `src/app/actions/artifact-templates.ts:86` behind a bare guard with no
   user id in scope - while the other three actions in that same file all
   pass `user.id`. Any authenticated user could delete any other user's
   template by id.
3. **`upsertArtifactTemplate` conflicts on `id` only**
   (`src/lib/artifact-templates.ts:52`), so a caller supplying an id owned by
   someone else overwrites their row and reassigns its `user_id`.
4. **`verifyKnowledgeEntry(id)` and `deleteKnowledgeEntry(id)`**
   (`src/lib/research/db.ts:313,329`) take only an id. Harmless while the
   table is deliberately global; a cross-tenant delete the moment `user_id`
   is added without scoping the calls - which this work does.
5. **`/api/github/webhook` is unreachable.** Covered as AC R3.

## Empty states that become wrong, not just empty

A second user starts with nothing, and two surfaces respond by telling them to
do something they cannot do:

- `InstitutionSwitcher.tsx:19-24` and `chat/InstitutionTypeahead.tsx:105` say
  "No institutions yet. Add one in Settings" - but institutions are derived
  from the OWNER's environment variables
  (`actions/course-hub-integrations.ts:182-196`), so Settings cannot add one.
- `GithubRepoPicker.tsx:111`, `VersionControlTab.tsx:112` and
  `content-tab/modules/RepoFoldersSection.tsx:248` say "Set the GITHUB_TOKEN
  environment variable" - advice a non-owner cannot act on, and misleading
  because the token IS set; they simply are not allowed to use it.
- `requireInstitution()` (`src/lib/institution-resolution.ts:74-80`) THROWS
  rather than rendering an empty state, so a new user with no courses gets a
  red error string from a Canvas-touching workflow step.

These are the honest-copy half of AC B5, applied to the main app rather than
the auth screens.
