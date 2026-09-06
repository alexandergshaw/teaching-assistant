# Multi-user login flow - acceptance criteria

**Request (2026-09-05):** "make it so that this site has a login flow for people
who aren't me."

## Where the app actually stands (measured, not assumed)

- Supabase auth is already wired: `src/app/login/page.tsx` signs in with a
  password and steps up through TOTP MFA; `src/context/SupabaseProvider.tsx`
  holds the browser session and subscribes to `onAuthStateChange`.
- Access is gated by an env allowlist. `src/lib/owner.ts#isOwnerEmail` reads a
  comma-separated `OWNER_EMAILS`, and `src/lib/supabase/middleware.ts`
  redirects anyone not on it to `/login`. `requireOwner()` in
  `src/lib/supabase/auth.ts` throws the same way for server actions and is
  called from ~183 files.
- The data layer is ALREADY multi-tenant. 35 of 38 tables carry
  `user_id uuid references auth.users` with RLS policies scoped to
  `auth.uid()`. Only `glossary_terms`, `knowledge_entries` and `rubric_bank`
  are global.
- There is NO sign-up, NO password reset, NO email-confirmation callback route
  (`src/app/auth/**` does not exist), and no way to create an account outside
  the Supabase dashboard.

So this is not "add authentication". It is "add an account lifecycle and a
role/status model on top of authentication that already works, and stop the
env allowlist being the only door".

## Scope decision, and the assumption behind it

Self-service sign-up on this app exposes shared, owner-funded secrets
(`GEMINI_API_KEY`, `GITHUB_TOKEN`, `ELEVENLABS_API_KEY`, and friends) to
strangers. Rather than block on a question, the build ships BOTH doors and
defaults to the safe one:

- `SIGNUP_MODE=approval` (the DEFAULT): anyone can sign up, but a new account
  is `pending` until an owner approves it.
- `SIGNUP_MODE=open`: a confirmed account is active immediately.
- `SIGNUP_MODE=closed`: the sign-up form is hidden and the action refuses.

If the owner wants open sign-up, it is one env var, not a rebuild.

---

## Group A - identity, roles and the gate (foundation)

**A1. A `profiles` row exists for every auth user.**
A new table `public.profiles` keyed on `id uuid primary key references
auth.users(id) on delete cascade`, carrying at least `email`, `full_name`,
`role text check (role in ('owner','member'))`, `status text check (status in
('pending','active','suspended'))`, `created_at`, `updated_at`, `approved_at`,
`approved_by`. RLS on; a user may read and update ONLY their own row, and may
never change their own `role` or `status`. Migration follows the repo's
existing idempotent style (`create table if not exists`, `drop policy if
exists` before each `create policy`) and the `supabase/migrations/` timestamp
naming.

**A2. Profile creation cannot be skipped.** A user who reaches the app with a
session but no profile row gets one created on the spot, with the correct
role/status for the current mode - not an error, not a blank screen. Signing
up, confirming an email, and signing in through any path all converge on the
same row.

**A3. Owner bootstrap can never lock everyone out.** An email listed in
`OWNER_EMAILS` resolves to `role='owner', status='active'`, and is RECONCILED
on every sign-in (adding an email to `OWNER_EMAILS` later promotes that
account). If `OWNER_EMAILS` is empty AND no profile exists yet, the FIRST
account created becomes `owner`/`active`. A deployment can therefore never
reach a state where a pending user exists with nobody able to approve them.

**A4. One access decision, used everywhere.** A single pure module resolves
`(user, profile) -> "anonymous" | "pending" | "suspended" | "active" | "owner"`.
It is imported by the request gate, by the server-action guard, and by the UI;
no second copy of the rule exists. Pure enough to unit-test with no IO.

**A5. The request gate stops asking "is this the owner".** The gate allows any
`active` account, redirects `pending` and `suspended` accounts to `/login` with
a state the page can render a real explanation for (not a silent bounce), and
keeps every existing exemption verbatim: `/login`, `/auth`, `/api/cron`,
`/api/triggers`, plus the existing AAL2/MFA step-up. A signed-out user is
redirected as before.

**A6. `requireOwner()` is split, and no call site is left ambiguous.**
`requireUser()` authorizes any active account; `requireAppOwner()` authorizes
`role='owner'` only. Every one of the ~183 existing `requireOwner()` call
sites is migrated to the correct one of the two, and `requireOwner` no longer
exists as an export. The cron/webhook `runAsOwner` impersonation path keeps
working unchanged and still re-checks that the impersonated identity is a real
owner.

**A7. A pending or suspended account cannot write.** A server action called by
a non-active account throws, with a message naming the reason, and nothing is
persisted. This is checked independently of the request gate - a direct action
POST must not slip past it.

**A8. Nothing regresses for the existing single-owner deployment.** With
`OWNER_EMAILS` set to one address and no other accounts, every behavior the
app has today is unchanged: same routes, same redirects, same MFA step-up,
same data.

**A9. The deprecated `middleware` file convention is retired.** Next 16
deprecates `middleware.ts` in favour of `proxy.ts`
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
Since this work rewrites that file's logic anyway, it moves to the supported
convention, verified against a real build rather than assumed.

---

## Group B - the account surface people actually touch

**B0. WHAT THIS APP CAN AND CANNOT ENFORCE - read before any other B
criterion.** Sign-in, sign-up, password reset and token verification all run
BROWSER-TO-SUPABASE with the public anon key, which is in every page bundle by
construction. This app is not in that request path and cannot be. Therefore:

- `SIGNUP_MODE` and `SIGNUP_ALLOWED_DOMAINS` gate THIS APP'S form. They cannot
  bind `POST /auth/v1/signup`. `SIGNUP_MODE=closed` hides the form; it does
  not close sign-ups.
- No auth operation can be rate-limited by this app. There is no rate-limiting
  primitive in this repo, and Vercel Hobby provides none. The only real limits
  are Supabase's own email-send and request limits, and CAPTCHA - which the
  installed client already threads through `signUp`, `resetPasswordForEmail`
  and `verifyOtp`, so it is available if the operator enables it.
- The enforceable boundary is: the Supabase dashboard sign-up toggle,
  Supabase's own domain allowlist, CAPTCHA, and the fact that a new account is
  created `pending` by a database trigger and can reach nothing.

No criterion below may imply protection this app does not have, and no copy
may either.

**B1. Sign up.** A sign-up form reachable from `/login` in one click,
collecting name, email and password. Client-side validation exists only to
give fast feedback; THE SERVER ACTION'S REFUSAL IS THE ONLY ENFORCEMENT THAT
COUNTS, and the rules module carries `import "server-only"` so a client import
is a build error rather than a silent permissive fallback. A weak password, a
malformed email, and a domain outside `SIGNUP_ALLOWED_DOMAINS` are each refused
with a message that says what to fix. The name is length-bounded and stripped
of control and bidi characters BEFORE it is stored - it reaches the app chrome,
the owner's account list, and the author field of every generated document, and
a browser-path signup can set it without passing through this validation at
all, so the clamp is applied again at the point of use.

**B2. Email confirmation works end to end.** An `/auth/confirm` route handler
verifies the emailed token and lands the user somewhere that says what
happened. Constraints, each of which an obvious implementation gets wrong:

- **It must not perform the verification on a GET.** The `/auth` prefix is
  public for every method and subpath. A `token_hash` design is pure bearer -
  nothing binds the token to the browser redeeming it - so a link built from
  the ATTACKER's own confirmation email, opened by the owner, writes the
  attacker's session into the owner's browser and silently swaps whose tenant
  they are working in. Mail scanners that prefetch links also burn the
  one-shot token before the user clicks. Prefer the PKCE `?code=` shape, whose
  verifier cookie binds the link to the browser that requested it; treat
  "opened on a different device" as a designed state, not a stack trace.
- **It must read the existing session BEFORE verifying** and refuse a swap to
  a different user id, rendering the wrong-account screen instead.
- **Expired and already-used are the SAME observable** - Supabase returns
  `otp_expired` for both - so they collapse into one "this link is no longer
  valid" state with a resend. A missing token stays separate.
- `type` is validated against a literal set, never passed through, and the
  post-verify destination is derived from the verified result rather than from
  a URL parameter.

**B3. Both Supabase email-confirmation settings are handled.** With
confirmations ON the user sees "check your email"; with them OFF they are
signed in immediately - which is safe ONLY because the break-glass now requires
a verified email, and would otherwise be the path to claiming an allowlisted
address. The app detects which happened from the sign-up response rather than
assuming. RECORDED: the only signal separating "we sent a confirmation" from
"this address already has an account" is an empty `identities` array, and the
app deliberately does not branch on it.

**B4. Forgot password, and set a new one.** The request form reports the same
thing from THIS APP whether or not the address exists. That is a property of
our copy, not of the system: a repeat request for a real address hits
Supabase's send-rate limit while an address with no account never sends, and a
real address does a measurably slower SMTP handoff. Both bypass this app
entirely and are accepted, not fixed.

The reset screen must run the TOTP step BEFORE the new-password fields for an
account with an enrolled factor, because a recovery link yields an ordinary
`authenticated` session at aal1, not a scoped one-purpose token. RECORDED AND
NOT CLOSABLE HERE: the holder of a recovery link can skip every screen and use
that session directly against PostgREST and Storage, because no RLS policy
consults `app_users`. No copy may imply the link is only good for setting a
password.

**B5. Every account state has a designed screen, and `state` is not trusted.**
`pending`, `suspended`, `confirm your email`, `link no longer valid`,
`we could not check your access` and `signed in as the wrong account` each
render purposeful copy and a way forward - never the current dead-end sentence.

But `?state=` is attacker-authored: anyone can send
`/login?state=suspended` and the victim reads an alarming message on the real
domain with a real certificate. It is mapped through an exhaustive switch over
the decision union whose default renders the plain sign-in card, is NEVER
interpolated into copy, and renders nothing for `active`/`owner`, which the
gate cannot produce. Same for `next`, which is never displayed as text.

**B5b. The sign-in error must not enumerate accounts.** Supabase distinguishes
`invalid_credentials`, `email_not_confirmed` and `user_banned` - and since
suspension now bans the account, the third is the normal suspended state. The
page currently renders `error.message` verbatim, which is how that reaches the
screen. All three map to ONE generic failure. "Access paused" is reachable only
AFTER a successful password authentication, via the gate's `state`. This
resolves the direct conflict between B4 and B5.

**B6. Sign out, and identity in the chrome.** The signed-in person's name or
email is visible in the app chrome and sign-out is reachable from it.

Sign-out performs a FULL DOCUMENT LOAD, not a client navigation, because the
module registry survives the latter. REGRESSION entry 189's cache is already
handled; these three are not, and each is load-bearing here:
`hubCache` (`useCoursesData.ts:51`, module-scope and seeded into `useState`
initializers, so the next user sees the previous user's courses with no
loading flash), `ta-active-institution` (`institutions.ts:15`, which selects
WHICH owner-funded Canvas token gets used), and the `ta-backup` IndexedDB
directory handle (`backup-dir.ts:13-15`, a granted OS folder - the next user's
recordings would be written into the previous user's directory with no prompt,
because the grant is per-origin, not per-account). The owner-change sweep
covers the `ta-`/`ta:`/`ta_` localStorage namespaces and both IndexedDB
databases, and a test fails when a new module-scope cache is added without
registering it.

**B6b. `safeNextPath` is re-applied on every READ.** Today its only caller is
the gate, which WRITES the parameter. The value round-trips through the
address bar and emailed links; nothing binds what comes back to what the gate
wrote. Every read site re-validates: the `/auth/confirm` handler on ALL
branches including no-token and error, the sign-in page's post-success
navigation, `/login/reset`, and any link rendered from it. The token or code is
stripped from the URL before navigating away so it cannot leak by `Referer`.

**B7. The auth screens reuse the app's existing visual language.** Same tokens
and classes as `src/app/login/login.module.css`; no new design vocabulary, no
emojis, keyboard-operable, with visible focus and `role="alert"` errors, and
labels tied to inputs.

**B8. Control state persists.** Any new persistent APP control state uses the
repo's `ta-` localStorage convention. The earlier wording - "auth screens
deliberately persist nothing sensitive" - was false of the client these
screens must use: `@supabase/ssr` writes the session AND the PKCE code-verifier
to non-httpOnly cookies via `document.cookie` on every one of them. That is a
known and accepted exception, recorded here rather than contradicted by the
criterion.

---

## Group C - the owner's admin surface

**C1. An owner can see who has an account.** A page under `/account` lists
every profile with email, name, role, status and when they signed up, sorted
newest first, with the pending ones surfaced first.

**C2. Approve, suspend, restore, promote, demote.** Each is one click with an
immediate optimistic state and a real error path. An owner cannot demote or
suspend themselves into a state where no owner remains.

**C3. Non-owners cannot reach it.** The page and every action behind it are
gated by `requireAppOwner()`, and the check is on the server - hiding the nav
entry is not the control.

**C4. It is discoverable.** The owner does not have to know the URL.

---

## Group D - tenant containment (filled in from the audits in flight)

**D1. No cross-tenant read or write.** Every service-role (RLS-bypassing)
query that touches user data filters by the calling user's id. Any that does
not is a defect fixed in this work.

**D2. The three global tables have a stated, enforced story.**
`glossary_terms`, `knowledge_entries` and `rubric_bank` are either shared
libraries by design (documented, read-only to members) or become per-user -
decided on the evidence, not left ambiguous.

**D3. Storage object paths are per-user.** Two users uploading the same
filename must not collide or overwrite.

**D4. Owner-only capabilities stay owner-only.** Any feature that spends or
reaches an OWNER-private resource through a shared server secret - in
particular `GITHUB_TOKEN` against the owner's repositories - is gated to
`role='owner'` or moved to a per-user credential. A member must not be able to
read or write the owner's repos through the app.

**D5. Documented.** README gains the env contract (`OWNER_EMAILS`,
`SIGNUP_MODE`, `SIGNUP_ALLOWED_DOMAINS`), the Supabase dashboard settings this
depends on (email confirmations, SMTP, redirect URLs), and the note that
Supabase's built-in email sender is rate-limited and needs real SMTP before
strangers use it. README currently instructs the reader to "disable public
sign-ups" in Supabase (`README.md:51-55`) - the exact opposite of this
feature, so that section is rewritten, not appended to.

**D6. Route handlers stop relying on the gate alone.** `api/prose`,
`api/research`, `api/parse-calendar` and `api/ai-chat` have no in-route
authorization today and are protected only by the request gate. Each gains an
explicit `requireUser()` so a pending account cannot reach an LLM-spending
endpoint by calling it directly.

---

## B0 IS TIGHTER THAN IT SAYS, AND THE SCREENS MUST NOT GIVE THAT BACK

B0 says sign-up runs browser-to-Supabase, so `SIGNUP_MODE` and
`SIGNUP_ALLOWED_DOMAINS` cannot be enforced. That is true of what an ATTACKER
can do and false of what the app's own form does: the shipped `signUpAction`
calls `signUp` from the SERVER, which it must, because `validateSignup` carries
`import "server-only"` and cannot run anywhere else.

So the real picture is two paths, not one:

- **Through our form:** the server action runs first, so the mode, the domain
  allowlist, the password rules and the name clamp are ALL genuinely enforced.
- **Straight to `POST /auth/v1/signup` with the public anon key:** none of them
  are, and nothing this app can do changes that. The backstop remains the
  `pending` default.

**The constraint this puts on the screens wave, and it is easy to get wrong:**
the sign-up page MUST call the server action. If it calls
`supabase.auth.signUp` from the browser because that is what the existing
sign-in page does, every one of those checks silently stops running - with no
test failure, no type error and no build error, because the module boundary is
the only thing enforcing it. That is the same shape as the `server-only`
finding: an invisible failure whose only symptom is that a control quietly
does nothing.

Recorded because the implementer who wrote the action noticed the tension and
asked, rather than assuming.

**New env var:** `SIGNUP_EMAIL_REDIRECT_URL`, chosen by that implementer and
not yet in the README (Group D). It must not be `window.location.origin`,
which would make every preview deployment mint confirmation links to itself.
Supabase's dashboard `Site URL` is the separate fallback used when it is
omitted, and on an unconfigured project that is `http://localhost:3000`.

---

## GROUP B RESHAPED BY THE DATA PASS (2026-09-06)

**DB1 - `app_users.display_name` is NULL for every row that has ever
existed.** Nothing in this repo writes `user_metadata`: the trigger inserts
`(id, email)` only, and the one sign-up helper takes no `options`. So
`nameFromAuthMetadata` has never had anything to read.

Worse, there is a PERMANENT window: `reconcileAppUserRow` runs AFTER
`requireUser()`'s deny, so a `pending` or `suspended` account never reaches it.
**The account queued for approval is exactly the account whose name can never
be written** - and the pending queue is the one screen where a human name is
the entire point. The owner would triage a list of blank names and email
addresses.

AMENDED: the name is written by the TRIGGER, at insert time, from
`new.raw_user_meta_data->>'full_name'`, length-bounded in SQL. That is the only
change that closes the window, it puts a name on the row at t0, and it leaves
`ensureAppUser`'s never-overwrite rule intact. The sign-up action's job is
therefore to pass a normalised name into `signUp({ options: { data } })` so the
trigger has something to copy.

**DB2 - B6's prefix sweep is provably insufficient, and I wrote it that way.**
A sweep over `ta-`/`ta:`/`ta_` misses 16 keys defined in
`components/course-planning/types.ts` - including `adapt_instructorName` and
`adapt_instructorEmail`, which are the PREVIOUS USER'S NAME AND EMAIL sitting
in the next user's form. It also misses the second IndexedDB database,
`teaching-assistant-files`, which holds raw uploaded `File` blobs.

AMENDED: the sweep is an explicit KEEP-LIST, not a prefix scan. Everything in
`localStorage` is removed except a named set of DEVICE preferences; both
IndexedDB databases are deleted; and the canary test asserts the KEEP set and
the registered-clearer count rather than a prefix, so a new key is opt-in to
survive rather than accidentally swept or accidentally missed.

**DB3 - B6 and B8 contradict each other, and the sweep breaks the theme.**
The owner-change sweep treats `null -> userId` as a change, so any `ta-` control
persisted on a signed-out auth screen is wiped the instant sign-in succeeds -
which makes B8's "use the `ta-` convention" and B6's sweep mutually exclusive
on exactly the screens Group B is building. Resolved by B8's rewrite: the auth
screens persist nothing. Separately, `ta-theme` is a DEVICE preference read by
the anti-FOUC bootstrap; sweeping it flashes the app to light mode on every
sign-in and sign-out. It is the first entry in the KEEP list.

**DB4 - my "ACCEPTED DEVIATION" cost claim was wrong.**
`getAuthenticatorAssuranceLevel()` is NOT a network round trip - with no `jwt`
argument it decodes the stored access token locally. So moving it earlier does
NOT cost a denied account "one extra round trip per request"; it costs a JWT
decode. The deviation stands, but for a different reason than recorded, and the
record is corrected rather than left flattering.

**DB5 - the same `app_users` row is read TWICE per server-action interaction,
and the gate's lookup is now the app's highest-frequency query.** The gate
reads it uncached (deliberately, so a fresh value is seen) and the guard reads
it through React `cache()`, whose scope does not extend to the proxy. Two
queries, same key, same request. And the matcher covers RSC PREFETCHES, so
every hovered link costs one more. Recorded as accepted for now - the fix is a
request-scoped memo the proxy can share, which is not Group B's job - but it is
the number to watch, not the AAL call.

**DB6 - the recovery goes in the GATE, not on a screen.** Two passes reached
this independently by different routes: `ensureAppUserRowExists` can only fire
from `requireUser()`, and a row-less account is redirected by the gate before
any server code runs. The admin pass proposed a server action on the pending
screen; the data pass proposed moving it into the gate. THE GATE WINS: it fires
automatically for exactly the denied population, needs no UI to cooperate, and
cannot be forgotten by a later screen rewrite. Best-effort, never blocking the
redirect.

**DB7 - the email-collision lockout is unrecoverable, and the recovery written
for it absorbs the collision identically.** The trigger's target-less
`on conflict do nothing` discards the insert; the user sees the ordinary
"waiting for approval" screen; the owner never sees them because the queue
reads `app_users`; and `ensureAppUserRowExists` uses the same target-less
upsert, so even when it becomes reachable it cannot help. Reachable through the
email-correction lag, which `emailUpdateNeeded`'s own comment predicts. Group B
must not pretend to fix this - it must ensure the pending screen shows the
signed-in ADDRESS, so the person can at least tell the owner something the
owner can act on.

**DB8 - a smaller bug found in passing:** the email correction issues a plain
`UPDATE` with no conflict handling, so a legitimate email move onto an address
another row holds raises 23505 and is swallowed and re-logged on every request,
forever.

---

## GROUP B RESHAPED BY THE RELIABILITY PASS (2026-09-06)

**RB1 - THE EMAILED LINK IS REPLACED BY A TYPED CODE, AND `/auth/confirm` IS
DELETED FROM THE PLAN.** B2's PKCE reasoning was right about session-swap and
WRONG about availability, in the same bullet. Supabase's default template emits
a link to GoTrue's OWN `/auth/v1/verify?token=...`, which consumes the one-shot
token and THEN redirects to us with `?code=`. The burn happens one hop
UPSTREAM, at a host this deployment does not control, so `/auth/confirm` never
sees the token and no implementation of it can help. PKCE binds the EXCHANGE;
nothing binds the VERIFY.

Who this breaks: any mail gateway that fetches URLs in transit - Defender Safe
Links, Proofpoint, Barracuda - which is near-universal on `.edu` addresses,
i.e. this app's entire audience. The user clicks, gets `otp_expired`, is shown
"resend", and the gateway burns the resent link too. A deterministic loop with
no escape for password reset.

DECISION: switch the two email templates to `{{ .Token }}` - a six-digit code -
and take a typed code redeemed with `verifyOtp`. Nothing in the email is
consumable by a GET, so scanner burn, prefetch, double-click and retry all stop
being possible at once, rather than being handled one at a time.

This makes Group B SMALLER. It deletes: the `/auth/confirm` route handler, its
GET-versus-POST CSRF design, the session-swap check, the `next` re-validation
on that handler, the cross-device PKCE failure state, and every finding in the
verifier-slot family below. The one-code-input screen replaces all of it. Two
dashboard template edits, no deploy.

**RB2 - the verifier-slot problems this decision removes**, recorded so nobody
reintroduces the link flow without knowing what comes back with it: there is
ONE PKCE verifier slot per browser, and `exchangeCodeForSession` deletes it on
EVERY path including failure - so a network blip during the exchange returns a
retryable-LOOKING error whose retry can never succeed. Starting a reset while a
sign-up confirmation is outstanding overwrites the sign-up's verifier. Opening a
link twice fails the second time. Every one of these surfaces as the SAME error
the design was going to label "opened on a different device", so all of them
would have been misdiagnosed.

**RB3 (CRITICAL) - the feature would ship dead.** The README currently
instructs the operator to keep Supabase's "Allow new users to sign up" OFF, and
the README correction lives in Group D - AFTER this chunk. So on Group B's
deploy day the documented, followed state is sign-ups disabled, `signUp`
returns 422 `signup_disabled`, and nothing detects it. AMENDED: the README
sign-up paragraphs move INTO Group B, and `signup_disabled` gets its OWN
state - it is the one provider error B5b must NOT flatten, because it is a
property of the INSTANCE, not of an account, so the enumeration argument does
not apply to it.

**RB4 - real SMTP is a Group B PRECONDITION, not a Group D note.** The
architecture note claims "sign-up still succeeds; the screen offers a resend".
Both halves are wrong: the mailer limit rejects `POST /signup` itself with
`over_email_send_rate_limit`, so the "check your email" screen is never
reached - and the resend button posts through the same limiter, so the offered
remedy IS the failing call. With the built-in sender, the third sign-up in an
hour cannot create an account and nobody can reset a password for the rest of
it. Add a distinct state for that error and a cooldown on resend.

**RB5 - `Site URL`, not just Redirect URLs.** The README documents Redirect
URLs only. Site URL is a separate field and is what GoTrue uses when the client
sends no `redirectTo` - and the repo's one sign-up helper sends none, so an
unconfigured project mints links to `http://localhost:3000`. Pass an explicit
redirect from an env var, NOT `window.location.origin`, which would make every
preview deployment mint links to itself.

**RB6 (highest value per line in the whole pass) - the browser Supabase client
has no timeout at all.** The gate bounds its calls at 5s; the browser client
passes no `global.fetch`, and auth-js constructs no AbortController. So a
degraded Supabase leaves "Signing in..." disabled forever, with no error and no
way to tell whether the write landed - and Group B adds three more screens on
that client, two of which write. The fix is the same four-line wrapper the
proxy already uses, at a browser-appropriate timeout, and it repairs the
EXISTING login page for free. Also: `setSubmitting(false)` belongs in a
`finally`, because `signUp` re-throws anything that is not an `AuthError`.

**RB7 - the client and the gate now disagree about one failure.** The login
page discards the error from `getAuthenticatorAssuranceLevel()`, so on failure
it skips the MFA branch and pushes into the app - while the gate, which now
fails CLOSED on exactly that condition, bounces the user straight back with
`state=unavailable`. Group B is already editing this file for B5b; fix it in
the same pass.

**RB8 - "We will email you" is a promise nothing can keep.** There is no mailer
dependency in this repo; GoTrue sends only its own four auth templates. And no
pending queue is visible to anyone, because Group C does not exist. So a person
signs up, is told they are queued and will be emailed, and neither half is
true. DELETE that sentence. The cheapest real signal reuses machinery that
already works: the unattended-runs workflow already curls a `CRON_SECRET`-
guarded endpoint every 15 minutes and already fails the job on a body-level
error count. One more route returning `{ pendingCount, oldestPendingAgeHours }`
and one `jq` line turns "someone has been waiting three days" into the one
outbound alert channel this deployment has.

**RB9 - rollback, and the one mode that makes it unsafe.** Reverting Group B
alone is a Vercel instant rollback, and residual rows are `pending` and inert -
EXCEPT under `SIGNUP_MODE=open`, where a code revert leaves live accounts with
real access and requires a manual status reset. There is no in-app account
deletion and Group C does not add one, so removing accounts strangers created
means the Supabase dashboard by hand. Write the two SQL statements into this
document as a named procedure, the way the migration wrote its own drop order.

---

## GROUP B PRE-BUILD THREAT MODEL (2026-09-06): criteria that must be REWRITTEN

The security pass on the account screens found that eight criteria promise
things that cannot be delivered, and two defects in code that has ALREADY
SHIPPED. The shipped ones are being fixed immediately; the criteria are
rewritten here.

**SHIPPED-CODE FIX 1 (CRITICAL) - the break-glass never checked that the email
is VERIFIED.** `resolveAccess` returns `owner` from `isOwnerEmail(email)`
alone. Nothing consults `email_confirmed_at`. So anyone who can create a
Supabase account bearing an allowlisted address becomes the owner. Not
reachable for the CURRENT owner - they already hold an `auth.users` row with
that address, so GoTrue refuses a duplicate - but fully reachable for any
allowlisted address that has NOT yet signed up. Add a co-instructor to
`OWNER_EMAILS` before they create their account and whoever knows the address
can claim it first. `emailVerified` becomes a REQUIRED input, so a caller that
forgets it is a compile error rather than a silent default in either
direction, and it gates the break-glass ONLY - an unverified email still
resolves through the normal stored-row path, or a deployment with
confirmations off would lock everyone out.

**SHIPPED-CODE FIX 2 (HIGH) - `signup-rules.ts` fails OPEN in a client
component.** It reads bare `process.env.SIGNUP_MODE` and
`SIGNUP_ALLOWED_DOMAINS`, neither `NEXT_PUBLIC_`, so in the browser both are
`undefined`: the mode falls back to `approval` (so `closed` closes nothing)
and the empty allowlist is deliberately read as "no restriction" (so the
domain rule becomes a no-op). Every gate stays green because the tests run in
node. B1 asking for client-side validation is exactly what triggers it.
`import "server-only"` makes it a build error instead.

### The eight criteria being rewritten

**B1** - "validates on the client AND refuses on the server" is reworded so
the server refusal is the only enforcement that counts, and so that neither
`SIGNUP_MODE` nor `SIGNUP_ALLOWED_DOMAINS` is described as binding GoTrue's
own `/auth/v1/signup`. The enforceable boundary is the Supabase dashboard
toggle, Supabase's own domain allowlist, and CAPTCHA. `SIGNUP_MODE=closed`
hides this app's form; it does not close sign-ups.

**B2** - "an expired link and an already-used link" are the SAME observable:
GoTrue returns `otp_expired` for both. Collapsed into one "this link is no
longer valid" state with a resend. "Missing token" stays separate, because it
genuinely is distinguishable and it is the cleanest exploit if mishandled.

**B3** - "with confirmations OFF they are signed in immediately" was the
trigger for the critical above. It is supported only once the break-glass
requires a verified email. Also recorded: the ONLY signal separating
"confirmation sent" from "this address already has an account" is
`identities.length === 0`, and the app deliberately does not branch on it.

**B4** - "always reports the same thing whether or not the address exists" is
not keepable as a SYSTEM property, only as a property of this app's copy. Two
oracles bypass the app entirely: a repeat reset request for a real address
returns `over_email_send_rate_limit` while an address with no account never
sends and never rate-limits, and a real address does an inline SMTP handoff
that is measurably slower. Rewritten to promise uniform copy and to name both
residuals as accepted.

**B4 vs B5 - a direct conflict, now resolved.** B5 wants a designed
"suspended" screen; B4 wants no enumeration. They meet at the sign-in error,
and suspension now bans the account, so GoTrue returns `user_banned` - which
leaks both existence and status. Resolution: `user_banned`,
`email_not_confirmed` and `invalid_credentials` all render ONE generic
sign-in failure, and "Access paused" is reachable only AFTER a successful
password authentication, via the gate's `state`. The login page must stop
rendering `error.message` verbatim, which is how the leak reaches the screen
today.

**B6** - REGRESSION 189's cache is already handled. The three that are NOT,
and that sign-out must actually clear: `hubCache`
(`useCoursesData.ts:51`, module-scope, seeded into `useState` initializers, so
the next user sees the previous user's courses with no loading flash),
`ta-active-institution` (`institutions.ts:15`, which feeds the env-var Canvas
token lookup, so user B inherits which owner-funded token gets used), and the
`ta-backup` IndexedDB directory handle (`backup-dir.ts:13-15`, a granted OS
folder - user B's recordings would be written into user A's folder with no
prompt, because the grant is per-origin, not per-account).

**B8** - "auth screens deliberately persist nothing sensitive" is FALSE of the
client these screens must use: `@supabase/ssr` persists the session and the
PKCE code-verifier to non-httpOnly cookies via `document.cookie` on every one
of them. Rescoped to app control state, with the Supabase-managed cookies
named as a known exception.

**NEW CRITERION - `safeNextPath` must be re-applied on every READ.** Today its
only caller is `loginRedirectFor`, the side that WRITES the parameter. The
value round-trips through the address bar, emailed links, and anything anyone
chooses to send; nothing binds what comes back to what the gate wrote. Every
read site re-validates: the `/auth/confirm` handler on ALL branches including
the no-token and error ones, the sign-in page's post-success navigation,
`/login/reset`, and any link rendered from the parameter.

### Three Group B design constraints, decided now rather than discovered later

**`/auth/confirm` must not act on a GET.** The `/auth` prefix is exempt for
every method and subpath. With a `token_hash` design, `verifyOtp` is pure
bearer - nothing binds the token to the browser redeeming it - so a link
crafted from the ATTACKER's own confirmation email, opened by the owner,
writes the attacker's session into the owner's browser and silently swaps
whose tenant the owner is working in. Mail scanners that prefetch links also
burn the one-shot token before the user clicks. Use the PKCE `?code=` shape,
which requires a verifier cookie and therefore binds the link to the browser
that requested it; handle "opened on a different device" as a designed state,
not a stack trace. Whichever shape, read the existing session BEFORE verifying
and refuse a swap to a different user id.

**A recovery link yields a full, MFA-less session.** It is an ordinary
`authenticated` session, not a scoped one-purpose token, and the browser talks
directly to PostgREST and Storage where no policy consults `app_users`. The
app-side mitigation is real but partial: `/login/reset` must run the TOTP step
before the password fields for an MFA-enrolled account. The residual - a
recovery link holder using the raw session against the database without ever
touching a screen - is NOT closable by Group B, and no copy may imply the link
is only good for setting a password.

**`state` is attacker-authored copy on the real login card.** Anyone can send
`/login?state=suspended`, and the victim sees an alarming message on the
genuine domain with a genuine certificate. It must be mapped through an
exhaustive switch whose default renders the plain sign-in card, never
interpolated, and the same for `next`.

---

## ACCEPTED DEVIATION: the MFA check now fails closed, and runs earlier

The AAL step-up check discarded its error, so a failed call left `aal` null,
the step-up condition was skipped, and the request PROCEEDED. Every other
failure in the gate fails closed; this one guarded the strongest control in
the app and did the opposite. It was pre-existing, and it became
deterministically reachable the moment a bounded fetch was added to that
client - a slow Supabase now produces a timeout rather than an eventual
answer, so a degraded auth service would silently disable second-factor
enforcement for every account that has one.

Fixed by folding a failed determination into the same `authFailed` flag the
single `resolveAccess` call already takes, so it denies through the one
decision path rather than a second copy.

**The property that had to survive, and did:** an account with NO enrolled
factor must never be locked out (REGRESSION 398 B2 records this and calls it
easy to invert by accident). It survives because auth-js's
`getAuthenticatorAssuranceLevel` returns a true discriminated union: every
error path yields `{ data: null, error }`, and every success path - including
"no session" and "no factor enrolled", which return `nextLevel: "aal1"` -
yields `{ data: <object>, error: null }`. So `error` is truthy if and only if
the call genuinely failed, and a no-factor account can never be mistaken for
one. The implementation branches on the single result object rather than
destructuring, because destructuring breaks that narrowing.

**The deviation I am accepting:** the AAL check now runs for any authenticated
user reaching that block, where it previously ran only after access was
already granted. Two consequences. A `pending` or `suspended` account now
costs one extra round trip per request. And an account that is both denied AND
hits an AAL failure surfaces as `state=unavailable` rather than
`state=pending`/`suspended`.

Accepted rather than re-ordered. The alternative - resolve a preliminary
decision, deny early, then check AAL and re-resolve on failure - is cleaner
and preserves both properties, but it costs a second invocation of
`resolveAccess` and another implementation round trip to buy an extra network
call for accounts that are already being turned away, plus a state label that
only differs when two failures coincide. Recorded here so the ordering is a
decision rather than an accident, and so the cleaner shape is on the record if
the extra call ever matters.

---

## DEPLOY GATE: TWO BLOCKERS (2026-09-05, follow-up security pass)

The verdict on this change set is NOT SAFE TO DEPLOY as written, and
conditionally safe for a deployment that stays single-owner only after
blocker 1. Recording both, because the second one corrects reasoning of mine
that was wrong.

**BLOCK1 - removing an email from `OWNER_EMAILS` no longer revokes access.**
The demote branch writes `role` and deliberately not `status`
(`app-users.ts`, "status is deliberately absent from this branch"), and a test
pins that omission. But the promote branch writes `status='active'`. So an
address that is, or ever WAS, on the allowlist becomes a permanently `active`
account: `resolveAccess` returns `active` for any active row without
consulting the allowlist at all, and there is no admin surface to suspend
them because `setAppUserStatus` has no callers. A co-instructor added for one
term and removed keeps full access forever, including their unattended
schedules and webhook triggers.

This is worse than a missing capability: today, removing an address from
`OWNER_EMAILS` is instant, total revocation, and REGRESSION entry 398 point
B1 pins that as a property any replacement must keep. This change set loses
it silently.

FIX: when demoting, also set `status='pending'` for a row that carries no
explicit human approval (`approved_at` null), so an account that was only
ever active by virtue of the allowlist returns to pending when the allowlist
drops it, while an explicitly approved member is untouched. Compose this with
FU1: a row with `status_changed_by` set was promoted deliberately and is not
demoted at all.

**BLOCK2 - the escalation is closed at an enforcement point that does not
exist, and my earlier "confirmed closed" was wrong.** I reported the
impersonation escalation as closed because `OwnerIdentity` now carries
role/status and `requireAppOwner()` checks the role. It does. But
`requireAppOwner()` has ZERO call sites - the role check lives inside a
function nothing calls - while `requireUser()`'s impersonation branch checks
only `status`. So an active non-owner can still POST their own webhook
trigger token at the public `/api/triggers/[token]`, have it impersonate
them, and reach the owner's Canvas token, `GITHUB_TOKEN` and media identity
through the 496 `requireOwner()` invocations that now mean "any active
account".

The mechanism is right; it is simply not wired to a single capability. AC R7
said the classification must happen "in the same pass that splits the guard",
and it did not.

FIX for this chunk, deliberately the stopgap and not the full answer: revert
`requireUser()`'s impersonation branch to require `role === "owner"`,
honouring R10 over AM3. Members' unattended automations then do not fire -
which costs nothing today, because there are no members - and the proper
containment lands with the credential accessors in Group E. Chosen over
wiring `requireAppOwner()` into the accessors now because that is the 107
call-site async refactor, and it belongs with the feature that makes it
correct rather than being rushed to unblock a push.

**BLOCK3 - the README now tells an operator to do something unsafe.** It
dropped "disable public sign-ups in Supabase" and documents `SIGNUP_MODE` and
`SIGNUP_ALLOWED_DOMAINS` as live controls. Nothing reads them:
`signup-rules.ts` is imported only by its own test. An operator who follows
the new README enables the email provider and configures the SMTP it now
mandates, and anyone can then loop `POST /auth/v1/signup` against the public
anon key - creating `auth.users` rows, firing the trigger, and burning the
owner's mail quota. No access is granted, but it is unauthenticated write
amplification the old instruction prevented. Restore the instruction and mark
both env vars as not yet wired.

**What the pass confirmed as sound**, by enumeration rather than assertion:
the gate has no fail-open input it could construct (transport failure,
timeout, unknown status, no email, `/loginish`, `/login/../x` all resolve
correctly, and in the right order); `ensureAppUser` cannot be influenced by
caller input, because the email is re-read from the admin API rather than
trusted, which is what prevents self-promotion; the concurrent-request race
resolves to a no-op; the migration has no injection surface and its policies
are inert for `anon`; and no new log line or error string carries a token,
an email or a session identifier.

---

## FOLLOW-UP FINDINGS ON THE AS-BUILT CODE (2026-09-05)

**FU1 - "Promote" is a control that would have lied, and it is my
contradiction, not the implementer's.** C2 gives an owner a promote action.
The reconciliation rule I specified demotes any stored `role='owner'` row
whose email is not on a non-empty `OWNER_EMAILS`, and it runs from
`requireUser()` on every authorized request. So: an owner promotes someone,
the row says `owner`, and that account's very next page load demotes it back
to `instructor` - silently, with no error and no attribution stamp. The only
durable route to ownership would have been editing an env var and
redeploying. Two rules I wrote, each defensible alone, that cannot both hold.

RESOLVED, and the resolution uses columns AD8 already added: reconciliation
demotes only a row whose owner status came from RECONCILIATION ITSELF - that
is, one with no `status_changed_by`. An explicit promotion through
`setAppUserRole` stamps that column, so reconciliation leaves it alone. This
keeps all three properties that matter: `OWNER_EMAILS` still grants ownership
automatically; removing an address still revokes an ownership that was only
ever granted by that allowlist (the fail-closed revocation property from H4);
and an owner can promote someone without a redeploy, with that promotion
attributable and reversible from the same surface.

Why not the simpler option: dropping promote/demote entirely and making
`OWNER_EMAILS` the sole source of ownership would also be consistent, and it
is what AM2 says about BOOTSTRAP. It was rejected because it makes granting a
colleague admin rights require an env var edit and a deploy, which is exactly
the kind of friction this whole feature exists to remove. Recorded so the
choice is visible rather than assumed.

**FU2 - suspending an `OWNER_EMAILS` account produces a state that reads
backwards.** The account is genuinely banned at the auth provider, but
reconciliation force-writes its stored row back to `owner`/`active` on the
next request that still carries a valid token. The admin list then shows
`active` for an account that cannot sign in, and the affordance offered for
an `active` row is "suspend", not "restore". This is AD7's case, and AD7's
module (`src/lib/account-admin-rules.ts`) is the one that has a committed
test file and no implementation. It ships in the next chunk, and until it
does, the controls it guards do not exist either - so nothing is reachable.

**FU3 - `countActiveOwners` is wrong in both directions.** It counts stored
rows with `role='owner' AND status='active'`. An `OWNER_EMAILS` owner who has
not signed in since the migration is stored `instructor`/`pending`, so the
count reads zero while a real owner exists, and C2's last-owner guard would
refuse every demotion. It also counts a stored owner that reconciliation is
about to demote. The last-owner rule must fold in `isOwnerEmail`, not rely on
this count alone.

**FU4 - `app_users.email` is nullable in SQL and typed `string` in
TypeScript.** Admin code doing `row.email.toLowerCase()` compiles and throws
at runtime on a phone or anonymous account. Fix the type before any admin
code dereferences it.

**FU5 - reconciliation's own role and status writes are unattributable.**
`setAppUserStatus` and `setAppUserRole` stamp `status_changed_at`/`_by`, but
`ensureAppUser`'s promote and demote branches stamp neither - which is the
exact gap AD8 existed to close.

**FU6 - two TDD test files are committed against modules that do not exist**
(`account-admin-rules`, `lms-credential-rules`), so the suite cannot be green.
They are Group C and Group E work. They stay OUT of the Group A commit rather
than being deleted - writing the test first is the point - and land with
their implementations.

**FU7 - the README has a stale reference to "middleware"** after both
middleware files were deleted, and AM6's requirement to note the Edge-to-Node
runtime change there is not met.

**Confirmed shipped by this pass** (traced to code, not taken on trust): the
impersonation fix with one shared `resolveImpersonationIdentity` used by all
four callers and `requireAppOwner` checking `role`; the target-less upsert;
the 5s profile-lookup timeout; the GitHub webhook exemption; the removal of
the hardcoded author; the migration's null-email and collision tolerance; and
the corrected `grading_dismissals` precedent claim.

---

## A9 VERIFIED (2026-09-05) - and the obvious check is the wrong one

A9's whole risk was a silent failure: a misplaced proxy file produces no error
and leaves the app with no gate at all. So it was verified positively, against
a real build, and the result is worth recording because the first check LOOKED
like a catastrophic failure and was not.

**The misleading evidence.** `.next/server/middleware-manifest.json` is EMPTY
(`{"middleware":{}}`), and there is no build artifact anywhere whose filename
contains "proxy". Read that alone and you would conclude the gate never
compiled. It is a legacy manifest that this version no longer populates.

**The actual evidence, all four agreeing:**

1. The build's own route table prints `f Proxy (Middleware)`.
2. `.next/server/functions-config-manifest.json` contains a `/_middleware`
   entry whose `originalSource` matcher is character-for-character the one
   exported from `src/proxy.ts`.
3. `.next/server/middleware.js` exists as a compiled entrypoint, written by
   that build.
4. The compiled server chunk contains this gate's own marker strings
   (`isPublicPath`, `api/github/webhook`) - so it is OUR code in the artifact,
   not a stale bundle from the old `src/middleware.ts`.

**Two things this also settles.** That `/_middleware` entry records
`"runtime": "nodejs"`, confirming REL4's Edge-to-Node change as a fact rather
than a doc reading. And the `next/headers` bundling worry from REL4 did not
materialise: the build compiles the proxy graph without complaint.

**A note for whoever verifies this next.** The first build attempt failed at
the prerender stage with "Your project's URL and API key are required" - the
known env-dependent tail this repo's push gate deliberately skips - and left a
half-written manifest behind. That is what produced the misleading empty
manifest. To get a complete build locally, supply placeholder
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` values; they are
only needed to prerender `/_not-found`.

**NO LONGER OWED - the live probe was run (2026-09-06).** A production build
with placeholder Supabase credentials, served on a local port, probed with
`redirect: "manual"` so the raw status and `Location` are visible. Observed:

```
307  /                       -> /login?state=anonymous&next=%2F
307  /knowledge              -> /login?state=anonymous&next=%2Fknowledge
307  /account/security       -> /login?state=anonymous&next=%2Faccount%2Fsecurity
307  /courses?tab=modules    -> /login?state=anonymous&next=%2Fcourses%3Ftab%3Dmodules
200  /login
404  /login/signup
405  /api/github/webhook
500  /api/cron/run-schedules
307  /loginish               -> /login?state=anonymous&next=%2Floginish
307  /api/cronjobs           -> /login?state=anonymous&next=%2Fapi%2Fcronjobs
```

Five separate criteria fall out of that one run, none of them provable from a
green build:

- **A9** - the gate actually runs. An unauthenticated request to an app route
  returns 307 to `/login`, so the proxy is not merely compiled and matched.
- **R2** - the destination survives, query string and all.
  `/courses?tab=modules` round-trips as
  `next=%2Fcourses%3Ftab%3Dmodules`, properly encoded. The old gate did
  `url.search = ""` and discarded it.
- **R3** - the dead webhook is alive. `/api/github/webhook` returns 405
  (method not allowed, because the handler is POST-only) rather than a 307 to
  `/login`. Reaching the handler at all is the whole fix: GitHub does not
  follow redirects, so every push it sent was previously swallowed.
- **A5's whole-segment matching** - `/loginish` and `/api/cronjobs` are BOTH
  gated. A bare `startsWith` check, which is what the baseline used, would
  have exempted both.
- **The public prefix covers the unbuilt screens** - `/login/signup` returns
  404, not a redirect, so the sign-up route Group B will add is already
  reachable through the exemption rather than needing a new one.

`state=anonymous` rather than `unavailable` is correct here and worth saying
why: the probe sends no session cookie, so `getUser()` legitimately reports no
user rather than failing, and "not signed in" is a different fact from "we
could not determine who you are" - which is the distinction `authFailed` was
added for.

---

## AC amendments from the site-reliability pass (2026-09-05)

**REL1 - A SEQUENCING CONSTRAINT, not a code change: Group E must land before
any instructor is approved.** Once the impersonation re-check becomes "is an
active account" (AD2), an instructor's unattended run satisfies
`requireOwner()` through `runAsOwner` with NO cookie and NO MFA
(`auth.ts:37-40`), and therefore reaches `resolveInstitutionByCode`, which
interpolates a client-supplied code straight into
`process.env[CODE_CANVAS_API_TOKEN]`. The per-user-credentials work (E6)
deletes exactly that lookup. So the safe order is: ship the login work with
`SIGNUP_MODE=approval` and approve NOBODY, ship Group E, then approve people.
Free to honour now; expensive once ten instructors have built schedules.

**REL2 - the gate must not throw.** `getAppUser` throws by design, and the
gate has no try/catch and no timeout. An unhandled throw in the proxy is a 500
on EVERY request - strictly worse than the fail-closed redirect this design
chose. A proxy file cannot set `runtime` or `maxDuration`, so a slow-but-up
Supabase hangs every request until the platform kills it. AMENDED:
`AbortSignal.timeout(...)` plus a try/catch mapping any failure to
`lookupFailed: true`. The repo already owns the idiom at
`course-hub-integrations.ts:52`.

**REL3 - `ensureAppUser` can wedge an account permanently, invisibly.** It
upserts with `{ onConflict: "id" }`, which does NOT absorb a violation of the
unique `lower(email)` index - that raises 23505 and `ensureAppUser` throws,
forever. The user then has no row, so the gate reads `pending` and shows them
the queue screen; and because the admin list reads `app_users`, the owner's
pending queue is EMPTY. Neither side can diagnose it. AMENDED: drop the
`onConflict` target so PostgREST emits a target-less DO NOTHING, matching what
the trigger already does.

**REL4 - Edge-to-Node is an improvement, and AM6 was too pessimistic.** AM6
flagged the runtime change as a cost. The SRE pass makes the opposite case and
it is more convincing: edge middleware doing a PostgREST read means a hop from
a random PoP to one Supabase region, while a Node proxy runs in the
deployment's fixed region. The architecture note's own reason for avoiding a
read at the gate ("the gate runs at the edge where that is a latency tax") is
written against a premise this move removes. Expect a slower first request,
a faster warm one. STILL TO VERIFY IN A REAL BUILD: `app-users.ts` imports
`./server`, which has a top-level `import { cookies } from "next/headers"`, so
the proxy graph may drag `next/headers` into the proxy bundle. That is the
specific thing A9's build check must look at.

**REL5 - the failures that are currently invisible.** A Canvas token that
starts returning 401 inside an unattended run is persisted correctly and
delivered to nobody: the cron heartbeat still reads "healthy" (a step error
never becomes a tick error), and the Files nav badge increments identically to
a perfect run because it counts unattended deliverables by volume and never by
status. The app actively reassures while every run fails. Also invisible: a
`workflow_runs` row stuck at "running" forever when a function is killed
(no lease, no sweep - unlike schedules, which do have a reaper), and a
migration that did not apply. There is no error tracking, no APM, no
healthcheck route and no outbound alert channel in this repo, so "we would
notice" is not available as an assumption anywhere in this design.

**REL6 - the cheapest fix on the list, taken now.** The cron route returns
HTTP 200 with per-schedule `status` fields that can be `"error"`, and the
GitHub Actions job only fails on a non-200. A 200 full of errors turns the run
green. Two lines of YAML, routing into GitHub's default failure email - the
only outbound alert channel this deployment has.

**REL7 - accepted, knowingly.** No error tracking (humans are the monitoring
at this scale). No down migrations, with ONE bought exception: a written drop
order for the `auth.users` trigger. The un-memoized per-request read. The
migration/deploy race, which is self-healing and minutes long. A ceiling of
roughly 20 scheduled runs per hour across the whole deployment, which degrades
as lateness rather than failure - the fix when it comes is a paid plan, not
code. And the deferred LLM quotas, which are reasonable ONLY while
`SIGNUP_MODE` fails closed to `approval`; if that ever becomes `open`, this
stops being an accepted risk and becomes an open one.

---

## AC amendments from the admin-capability pass (2026-09-05)

**AD1 - SUSPENSION DOES NOT SUSPEND ANYONE. This is the feature's core
promise failing silently, and it is the highest-severity finding in the whole
design.** `status` is enforced only at this app's request gate and server-action
guards. NOTHING in `app_users` is consulted by any RLS policy: every table and
storage policy keys on `auth.uid()` alone. The browser holds a live Supabase
session (`src/context/SupabaseProvider.tsx`) and talks DIRECTLY to PostgREST and
Storage - migration `20260718000000:3` says so outright ("browser uploads
directly to Storage"). So a suspended account's refresh token keeps minting
valid JWTs indefinitely and retains full read AND write access to its own 40
tables and 4 buckets. Suspending someone removes the UI and nothing else.
AMENDED: the suspend action must revoke the session server-side -
`auth.admin.signOut(userId)` and/or
`auth.admin.updateUserById(id, { ban_duration })` on the service-role client,
which is already reachable (`createServiceClient`, proven by the four existing
`auth.admin.getUserById` call sites). CHECKABLE: after suspension, a request
carrying the suspended user's prior access token is refused by Supabase itself,
not merely by this app.

**AD2 - AM3 and R10 contradict each other, and I wrote both.** AM3 amends the
four impersonation re-checks to "is an ACTIVE account"; R10 says they "stay
owner-bound". Both were marked binding, and an implementer would have picked
one at random. RESOLVED IN FAVOUR OF AM3: the re-check becomes "the
impersonated identity is an ACTIVE account". R10's actual intent - that the
codemod must not sweep these into an unconditional `requireUser()` with no
status check at all - is preserved and restated that way. The security
property is unchanged: impersonation is still gated on a server-only secret
(CRON_SECRET, the per-trigger token, the HMAC) and still impersonates the
trigger row's OWN user, never a global owner. Under R10 as written, an
instructor's schedule would have been marked `skipped, "owner is not
allowlisted"` forever with no surface explaining why.

**AD3 - AM1 cited a precedent that does not exist.** AM1 said
`grading_dismissals` "enables RLS with zero policies". It does not:
`supabase/migrations/20260623000000:17-23` has a
`for all using (auth.uid() = user_id) with check (...)` policy. The AM1
CONCLUSION stands (one select policy, no insert/update/delete for
`authenticated`, plus the before-update trigger) but the justification was
wrong and would have misled the next reader. Corrected here.

**AD4 - the migration can break sign-up itself.** `app_users.email` is
`not null` with a unique index on `lower(email)`, but `auth.users.email` is
nullable (phone and anonymous providers), and a duplicate lower-cased address
raises inside `handle_new_auth_user`. A trigger exception ROLLS BACK the
`auth.users` insert, so either case turns sign-up into an opaque 500 rather
than a handled error. AMENDED: the trigger tolerates a null email and a
collision without aborting the account creation.

**AD5 - R4 promises an admin capability that C1-C4 never specify.** R4 says
"the owner's admin surface can clear a member's MFA factors". Nothing in
Group C provides it, and there is no `admin.deleteFactor` call anywhere in
`src/`. Lost-MFA is the one lockout a member cannot resolve for themselves -
both the login page and the security page currently tell them to use the
Supabase dashboard, which they cannot reach. AMENDED: C5 - an owner can clear
a member's MFA factors, and the copy points at the workspace administrator.

**AD6 - a client component has no way to know it is an owner.** `isOwnerEmail`
is imported by zero `.tsx` files and `SupabaseProvider` exposes only
`{ supabase, session, user, loading }`. C4 ("discoverable") is unsatisfiable
without new plumbing. AMENDED: the provider carries the access decision, and
the nav entry renders from it - while C3's server-side check remains the
actual control.

**AD7 - suspend and demote silently no-op on an `OWNER_EMAILS` account.**
The break-glass rule means an allowlisted email resolves to `owner` whatever
the stored row says, so suspending one writes the database, updates the UI,
and changes nothing. AMENDED: those controls are DISABLED for an allowlisted
account with the reason shown, matching the design's own "disabled with the
reason visible, not enabled-then-rejected" rule.

**AD8 - revocations are unattributable.** `approved_at`/`approved_by` capture
only the approve transition; suspend, restore, promote and demote - the three
that revoke access and the one that grants full ownership - leave no record of
who did it. And `approved_by ... on delete set null` means deleting the
approving owner erases the only provenance there is. AMENDED: two columns,
`status_changed_at` and `status_changed_by`. The architect pass called an
audit log speculative; that judgment was right about a LOG and wrong about
these two columns, which cannot be retrofitted with history.

**AD9 - admin impersonation stays out, and that is now a recorded decision.**
`src/lib/supabase/owner-context.ts:43-49` forbids exactly the shape an
admin-initiated impersonation would take: browser-reachable, session
-authenticated, no server-only secret. It would also bypass MFA by
construction (`auth.ts:37-40` returns the impersonated identity BEFORE the
AAL2 check) and grant unbounded write across every table and bucket. If
support access is ever needed it gets its own consent-gated, time-boxed,
read-only mechanism - never a relaxation of that preamble.

**AD10 - a read-only consumption count is pulled forward; enforcement is not.**
Deferring quotas because `SIGNUP_MODE=approval` gates the exposure is sound
for the EXPOSURE and unsound for VISIBILITY: once five instructors are
approved, the owner has no way to see that one of them burned the shared
Gemini budget. Rows per user in `ai_chat_messages` and `workflow_runs` are
already indexed by user. The number ships; the limit does not.

**Deferred, with reasons recorded:** account deletion (nobody can delete an
account today either, so its absence is not a regression, but it means a
departing instructor's data has no removal path); invite / admin-create /
bulk-create; the per-account detail view; email correction and admin-triggered
password reset; data export and ownership re-assignment.

---

## AC amendments from the adversarial review (2026-09-05)

The review ran against the AC before any code was written. These are the
findings ACCEPTED, and they overrule what is written above.

**AM1 - A1 was unimplementable. Column-level protection is not an RLS
policy.** A1 said a user "may read and update ONLY their own row, and may
never change their own `role` or `status`". Postgres RLS is ROW level:
`for update using (auth.uid() = id)` permits
`update app_users set role='owner' where id = auth.uid()`. An implementer
following A1 literally would have passed every stated criterion and shipped
self-service privilege escalation. AMENDED: `app_users` has exactly one
policy, `for select using (auth.uid() = id)`. No insert/update/delete policy
for `authenticated` at all (precedent: `grading_dismissals`,
`20260623000000`, enables RLS with zero policies). All writes go through the
service-role client behind an application-level owner check, plus a
`before update` trigger that raises if a caller changes their own role or
status. CHECKABLE FORM: an authenticated session running
`update app_users set role='owner' where id = auth.uid()` fails; the same
session running `update app_users set display_name='x'` succeeds.

**AM2 - A3's first-account bootstrap is DELETED.** A3 said the first account
becomes owner when `OWNER_EMAILS` is empty. Today an unset or unpropagated
`OWNER_EMAILS` locks everyone out - recoverable, harmless, and a contract the
README states deliberately (`README.md:45-47`, "Fails closed"). Under the
bootstrap, the same misconfiguration - an env var that did not reach the
deployment, a typo, a preview branch - hands the deployment, its service-role
data and every shared API key to the first stranger who finds the URL. It also
raced: two concurrent sign-ups both observe "no accounts yet". AMENDED:
ownership comes from `OWNER_EMAILS` and nowhere else. A deployment with no
allowlist has no owner and therefore approves nobody, which is the SAME
fail-closed state the app has today, not a new one. The TDD test that asserted
the bootstrap has been rewritten to assert its absence.

**AM3 - A6's impersonation re-check must NOT stay owner-bound.** A6 said the
`runAsOwner` callers keep re-checking `isOwnerEmail`. Follow that and a
member can build a workflow, schedule it, watch it appear in the Automate
panel, and it will never fire: `api/cron/run-schedules/route.ts:270` marks it
`skipped, "owner is not allowlisted"`, and `api/triggers/[token]/route.ts:64`
returns 404 for a member's own webhook. Automation would be silently
owner-only with no visible reason. AMENDED: those four re-checks become "the
impersonated identity is an ACTIVE account", not "is an owner". The security
property is preserved - impersonation is still per-user and still gated on a
server-only secret - and members' automations work. New criterion: a member's
unattended schedule fires and produces a run row.

**AM4 - sign-out must be a full document load, and the cache problem is far
bigger than entry 189.** B6 cited REGRESSION entry 189, which is the leak that
was already FIXED. Its mechanism (`registerOwnerScopedCache`) has two
subscribers app-wide. Still leaking across a sign-out, because sign-out is a
client navigation that never tears down the JS module registry: `hubCache` in
`useCoursesData.ts:51` (course list, seeded `state:"idle"` so the next user
sees it with no loading flash), `useCourseImportActions.ts:38`,
`recording-launch.ts:167`, `workflow-schedule-handoff.ts:21`,
`useKbSelection.ts:69`, `knowledge-return.ts:47`; server-side,
`canvas/inbox.ts:77` caches the Canvas "self" id keyed on BASE URL rather than
token, so two users on one institution are told they are the same person;
plus 285 `ta-` localStorage keys (none carrying a user id, including
per-student scores and written feedback in
`ta-grading-results-edits:${canvasUrl}`), and two IndexedDB stores - one of
which, `backup-dir.ts:13-15`, persists a granted OS directory handle, so a
second user's recordings would be written into the first user's folder with no
prompt. AMENDED: sign-out performs `window.location.assign("/login")`, and
the owner-change sweep clears the `ta-`/`ta:`/`ta_` localStorage namespaces and
both IndexedDB databases. A test enumerates the module-scope caches and fails
when an unregistered one appears.

**AM5 - the counts in this document were wrong.** Not "~183 call sites": 183
files MENTION `requireOwner`, of which 78 are tests that mock it. The real
figures are 105 source files and 485 invocations, plus 78 test files whose
mocks must be retargeted. Not "35 of 38 tables": 43 tables, 39 user-scoped,
4 global - `cron_heartbeat` was missed. And the three global tables use
`using (true)` with no `to` clause, so they are readable by the `anon` role,
not merely by authenticated users - `glossary_terms` holds definitions
extracted from the instructor's own course materials.

**AM6 - A9 changes the runtime, and its real failure mode is misplacement.**
Verified in the installed Next 16.2.6: `src/proxy.ts` IS supported
(`dist/lib/constants.js:289-290`, `dist/build/utils.js:1131-1149`), and a
misnamed export fails CLOSED - a build error in production, a 500 at runtime,
and an explicit error if both files exist. But proxy defaults to the NODE
runtime while middleware defaults to EDGE, so this moves the auth gate off the
edge and changes per-request latency and the deploy artifact; A9 called it a
rename. The one silent catastrophe is MISPLACEMENT: only `proxy.*` and
`src/proxy.*` are scanned, so a file at `src/app/proxy.ts` yields no error and
an app with no gate at all. AMENDED: A9's verification is positive, not "a
real build" - an unauthenticated request to `/` must return a 307 to `/login`
after the move, `src/middleware.ts` is deleted in the same commit, and the
runtime change is noted in the README.

**AM7 - D1 is the real containment work, not a footnote.**
`createServiceClient()` (which bypasses RLS) is invoked 125 times across 46
non-test files, versus 5 uses of the RLS-respecting client in
`src/app/actions`. This app does not rely on RLS for reads at all: the actual
tenancy boundary is the guard returning `user.id` and every helper being
passed it. So the opening claim that "the data layer is ALREADY multi-tenant"
is true of the schema and NOT of the runtime path. D1 becomes its own group
with an enumerated file list and a mechanical check.

**AM8 - states with no criterion at all.** Added: account deletion (nothing in
`src/` calls `admin.deleteUser`; cascade covers the 39 user-scoped tables but
NOT storage objects, NOT null-owner `ai_chat_messages` rows, and NOT
third-party state - Tavus replicas, ElevenLabs voices, stored OAuth refresh
tokens); session expiry mid-action; MFA lockout, which B5 missed and which
today is documented as "remove the factor from the Supabase dashboard" - a
place a member cannot reach; and `/account` itself, which 404s today, so C1
creates a route the AC never named.

**AM9 - child-table foreign keys are not ownership-checked.**
`course_task_attachments.course_id -> course_hub(id)` has
`with check (auth.uid() = user_id)` only, so a user may insert their own row
pointing at another user's `course_id`. Same shape in
`workflow_run_steps.run_id`, `institution_page_attachments.page_id`,
`avatar_videos`, `course_task_defs`. Not a read leak; a write into another
tenant's id space. Recorded as a follow-up, not fixed in the first chunk.

**REJECTED - the "unfalsifiable criteria" rewrite of A6.** The review wanted
A6 to enumerate the owner-only call sites and pin them with a test. That was
right about the defect and wrong about the fix: I derived the classification
mechanically from the import graph and 72 of 103 files transitively reach a
shared secret, so per-call-site gating locks members out of their own course
list. The containment moved to the credential accessors instead - see Part 3
of the architecture note. A6 is now a straight one-to-one rename with no
per-site judgment, which removes the unfalsifiable criterion entirely rather
than making it testable.

---

## AC revisions from the auth-touchpoint audit (2026-09-05)

These were added after the audit; they are requirements, not notes.

**R1. The hardcoded author name goes.** `src/lib/author.ts:12` defines
`DEFAULT_AUTHOR = "Alex Shaw"`, and `resolveDocumentAuthor()` falls back to it
when `NEXT_PUBLIC_DOC_AUTHOR` and the user's metadata are both absent. Every
.docx and .pptx a second user generates would be stamped with the owner's
name. Resolution becomes per-user (profile full name, then user metadata,
then the env default, then a neutral fallback), and the hardcoded personal
name is removed from the codebase.

**R2. The gate preserves where the user was going.** The current gate does
`url.search = ""` (`src/lib/supabase/middleware.ts`), throwing away the
destination, so an expired session always lands you on the home page. The
rewritten gate carries a `next` parameter and the sign-in flow returns the
user there, validated as a same-origin relative path so it cannot be used as
an open redirect.

**R3. The GitHub webhook exemption is missing.** `/api/cron` and
`/api/triggers` are exempt from the gate but `/api/github/webhook` is not,
even though it is the same kind of caller (no session, authenticated by an
HMAC signature over the raw body). Every push GitHub sends is 307-redirected
to `/login` before reaching the handler. Found while rewriting this file;
fixed here because it is one line in the exact function being rewritten.

**R4. MFA recovery copy stops pointing at the Supabase dashboard.**
`src/app/login/page.tsx:66` and `src/app/account/security/page.tsx:221-224`
tell the user to fix a lost authenticator "from the Supabase dashboard". A
member has no dashboard access. The copy directs them to the workspace
administrator, and the owner's admin surface can clear a member's MFA factors.

**R5. Two repo ratchets constrain the CSS.** New auth screens reuse
`src/app/login/login.module.css` and the account area's shared
`src/app/account/security/security.module.css` rather than adding
stylesheets: `page-module-css-orphan-classes.test.ts` pins an orphan-class
ceiling of 137, and `focusRing.wiring.test.ts` forbids `--focus-ring-color`
on the `.page` rule of the login and account stylesheets. Both must still
pass.

**R7. THE FINDING THAT RESHAPES THIS WORK: Canvas runs on the owner's token,
and the client picks which one.** `src/lib/canvas-core.ts:165-205`
(`resolveInstitutionByCode`) interpolates a client-supplied institution code
into `process.env[CODE_CANVAS_API_TOKEN]` / `process.env[CODE_CANVAS_URL]`.
The code comes from `localStorage["ta-active-institution"]`
(`src/lib/institutions.ts:13-14,29`), typed by the user in the Settings
dropdown. The only thing between that dropdown and an authenticated Canvas
call is `requireOwner()`. Relax that guard to "any signed-in account" and
every approved member gets instructor-level access to the OWNER's real Canvas
courses: post and delete announcements, read the roster, read grades and
submissions, message students. The same env-lookup-by-client-string pattern
also lets a caller enumerate which institution codes exist, from the
differing error strings at `:188` versus `:193`.

The same class of defect exists for identity, not just data:
`HEYGEN_AVATAR_ID` is the owner's face (`src/app/actions/media-avatar.ts:31`),
and `ELEVENLABS_VOICE_ID` is the owner's cloned voice, used as the DEFAULT
fallback for any member with no clone of their own
(`src/app/actions/media-voice.ts:261`); `synthesizeNarrationAction` passes a
client-supplied `voiceIdOverride` straight through (`:293`). And
`GITHUB_TOKEN` reaches the owner's private repositories for read
(`getFileTextAction`), write (`commitFileAction`) and permanent out-of-band
access (`setRepoCollaboratorAction`).

**Consequence for the plan.** A6's call-site classification is no longer
bookkeeping - it IS the containment. Every capability that spends or reaches
an owner-private resource through a shared server secret gets
`requireAppOwner()` in the same pass that splits the guard. Canvas included,
which means an approved member cannot use Canvas features until the follow-up
chunk gives them their own credentials. That is the correct trade: a member
with no Canvas access is a smaller failure than a member with MINE.

**R8. Sixteen server actions and four route handlers have no guard at all.**
`actions/llm-content.ts` (9 exports), `actions/unsplash.ts` (2),
`actions/course-tools-selection.ts` (2), `actions/course-guides.ts`,
`actions/course-planning-schedule.ts`, `actions/instructor-notes.ts`,
`actions/knowledge-check.ts`, `actions/weekly-significance.ts`, plus
`api/ai-chat`, `api/parse-calendar`, `api/prose`, `api/research`. Today the
request gate is their only protection, which is why nobody noticed. They each
get an explicit guard in this work, because a `pending` account must not be
able to spend the owner's inference budget by POSTing directly.

**R9. The OAuth gates get LOOSER, not tighter.**
`api/google/oauth/start|callback` and `api/microsoft/oauth/start|callback`
check `isOwnerEmail` today. The credential storage underneath is already
correctly per-user (`google_credentials`, `microsoft_credentials`, both
keyed on `user_id` with RLS and AES-GCM at rest), so these four become
`requireUser()` - otherwise a member could never connect their own calendar
or mail. This is the one place where the migration must NOT default to the
stricter guard.

**R10. The four impersonation re-checks stay owner-bound.**
`api/cron/run-schedules:270`, `api/triggers/[token]:64`,
`api/github/webhook:105` and `lib/workflow-trigger-runner.ts:63` each
re-check `isOwnerEmail` before calling `runAsOwner`. The codemod must not
sweep these into `requireUser()`. Nothing browser-reachable can impersonate
the owner today, and that must still be true afterwards.

**R6. There is no existing auth test to lean on.** `src/lib/owner.ts`,
`src/lib/supabase/middleware.ts` and `src/lib/supabase/auth.ts` have zero
direct test coverage; the ~60 files that mock `requireOwner` only test their
own error handling. The access decision, the gate's routing table and the
guard split therefore ship WITH tests written before the implementation, and
those tests are the regression baseline for this area.
