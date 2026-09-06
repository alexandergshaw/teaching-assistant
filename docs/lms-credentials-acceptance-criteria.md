# Per-user LMS credentials - acceptance criteria

**Request (2026-09-05):** "users who are logged in need an ability to register
tokens from their own lms instances safely."

This is Group E of the multi-user work
(`docs/multi-user-login-acceptance-criteria.md`). It is the piece that turns a
login into a usable account: without it, an approved instructor can sign in
and reach almost nothing, because every Canvas capability is gated to the
owner.

## Why this exists, in one paragraph

`resolveInstitutionByCode` (`src/lib/canvas-core.ts:165-205`) interpolates a
CLIENT-SUPPLIED institution code into `process.env[CODE_CANVAS_API_TOKEN]`
and `process.env[CODE_CANVAS_URL]`. The code comes from
`localStorage["ta-active-institution"]` (`src/lib/institutions.ts:13-14,29`),
typed by the user into the Settings dropdown. The only thing between that
dropdown and an authenticated Canvas call is the owner guard. So today the
app has exactly one Canvas identity - the owner's - and the client picks
which of the owner's institutions to use. Per-user credentials replace that
with an identity the signed-in user actually owns.

## The security shape, stated up front

Letting a user register a base URL means the SERVER will fetch a URL the USER
chose, while carrying a bearer token. That is a server-side request forgery
primitive, handed to us deliberately. "Safely" in the request is therefore
mostly about three things: what URLs we will talk to, where the token lives,
and who can ever see it again.

---

## E1. The credential is per user, per institution, and encrypted at rest

A new table keyed on `(user_id, institution)` - the exact shape
`microsoft_credentials` already uses (`20260708000000`) - holding the base
URL, the encrypted token, and timestamps. `user_id uuid not null references
auth.users (id) on delete cascade`. RLS enabled, select scoped to
`auth.uid() = user_id`, no client write policy; writes go through the
service-role client behind the account guard. The token is encrypted with the
existing AES-256-GCM helper in `src/lib/crypto.ts` - the same one
`google-credentials.ts` and `microsoft-credentials.ts` already use. No new
crypto is written for this.

## E2. The token is never readable again, by anyone, through any surface

Once saved, no code path returns the plaintext token to a browser: not the
save response, not a list endpoint, not an "edit" form that pre-fills the
field, not an error message. The UI shows a masked form (last four
characters at most) and a "connected" state. Re-entering the token is the
only way to change it. A test pins that the masking helper never reveals the
LEADING characters either - a Canvas token begins with the Canvas user id.

## E3. The base URL is validated as a security boundary, not as input hygiene

`https` only. Refused: loopback in every spelling (`localhost`, `127.0.0.1`,
`127.1`, `[::1]`, `0.0.0.0`), the cloud metadata endpoints
(`169.254.169.254`, `metadata.google.internal`), every RFC1918 range,
link-local, IPv6 private and IPv4-mapped forms, alternate integer/hex/octal
encodings of a loopback address (`2130706433`, `0x7f000001`, `0177.0.0.1`),
hosts with no public form (`intranet`, `*.local`, `*.internal`), credentials
embedded in the authority (`https://canvas.edu@evil.com`), and any path,
query or fragment. Stored in one canonical normalized form so two spellings
of the same host are one credential.

**Validation is re-applied at USE time, not only at save time.** A host that
resolved to a public address when it was saved can resolve to a private one
later; re-checking on every use is what makes the stored value untrusted
data rather than a trusted setting. Where the runtime allows it, the outbound
request also refuses redirects to a host that would not have passed
validation itself.

## E4. A saved credential is proven to work before it is stored

Saving performs a real, read-only call against the given host
(`/api/v1/users/self`) with the supplied token, and stores nothing unless it
succeeds. The user is told which Canvas account the token belongs to, so a
token pasted from the wrong tab is caught immediately rather than three
screens later. A failure distinguishes "that host did not answer",
"that token was rejected" and "that host is not allowed" - three different
fixes.

## E5. The user can see, replace and delete their own credentials

A settings surface listing each registered institution: display name, host,
masked token, when it was added, and when it was last used successfully.
Replace re-runs E4. Delete removes the row immediately and says what stops
working. Deleting is not hidden behind a menu; it is the control someone
reaches for when they think a token leaked.

## E6. Canvas resolution reads the caller's credential, and the env var stops
being reachable by anyone else

`resolveInstitution`, `resolveDefaultInstitution` and
`resolveInstitutionByCode` resolve against the CALLING USER's stored
credentials. The `<CODE>_CANVAS_*` environment variables remain as the
OWNER's own credentials only - a fallback available to `role='owner'` and to
nobody else - so the existing deployment keeps working unchanged while a
member can never reach them. The client-supplied-code-into-`process.env`
lookup is deleted outright.

The differing error strings at `canvas-core.ts:188` and `:193` are an
enumeration oracle for which institution codes are configured; the
replacement returns one indistinguishable failure.

## E7. The guard on Canvas capability moves from the call site to the credential

Per the architecture note's Part 3, the check lives at the accessor, once,
rather than being spread across the 72 files that transitively reach Canvas.
A caller with no credential gets a clear, actionable failure - "connect your
Canvas account in Settings" - not a thrown env-var message telling them to
set `MCC_CANVAS_API_TOKEN`, which no member can do.

## E8. Empty states stop lying

`InstitutionSwitcher.tsx:19-24` and `chat/InstitutionTypeahead.tsx:105`
currently say "No institutions yet. Add one in Settings" when institutions
actually come from the owner's environment variables and Settings cannot add
one. After this work that sentence becomes TRUE, and it must link to the new
surface. `requireInstitution()`
(`src/lib/institution-resolution.ts:74-80`) currently THROWS rather than
rendering an empty state; a user with no credential yet gets a designed state
instead of a red error string.

## E9. Nothing about the token reaches a log, an error, or telemetry

No token, no fragment of one, in a thrown message, a console line, a
workflow run log, or a persisted deliverable. The describe-helper used for
diagnostics distinguishes present from absent without revealing either.

## E10. The owner's existing setup keeps working, unchanged

With `OWNER_EMAILS` set and the `<CODE>_CANVAS_*` variables present, every
Canvas behavior the app has today is identical for the owner: same
institutions, same courses, same calls. Migrating the owner to a stored
credential is optional, not required.

---

---

## Amendments from the data-engineering pass (2026-09-05)

**DAT1 - the acronym stays the key. No `institutions` table, no foreign key.**
Fourteen storage sites key on the institution acronym, and three of them make
an FK unrunnable: `workflow_defs.scope` and `message_drafts.payload` carry it
inside JSONB, which Postgres cannot foreign-key; `course_hub.institution` is
un-normalized free text from a freeSolo autocomplete, documented as such at
`courses.ts:129-139`, which is why `countCoursesByInstitution` filters in JS
rather than with `.eq()`. There is also nothing to seed a new table FROM - the
acronym registry lives only in each browser's localStorage. And
`institution-removal.ts:6-14` promises the user, in visible copy, that
removing an acronym only HIDES rows because they are keyed by TEXT; an FK
would make that copy a lie in one direction (cascade deletes their knowledge
base) or an error in the other. AMENDED: `lms_credentials.institution text not
null` with no FK, exactly like `microsoft_credentials`. THE NEW ROW IS THE
INSTITUTION RECORD - it already carries the display name and base URL - so
`listConfiguredInstitutionsAction` becomes
`select distinct institution ... where user_id = $1`, the first server-side
registry this app has ever had, and the thing that makes E8's copy true
without touching any of the fourteen.

**DAT2 - a mechanical guard rename would hand every member an enumeration of
the owner's environment.** `listConfiguredInstitutionsAction`
(`course-hub-integrations.ts:177-201`) scans `Object.keys(process.env)` for
`<CODE>_CANVAS_URL` behind `requireOwner()`, and `checkInstitutionsAction`
(`:147-168`) reports per-acronym whether the owner's `_CANVAS_URL`,
`_CANVAS_API_TOKEN`, `_LLM_URL` and `_LLM_API` are set. Renaming their guard to
`requireUser()` without replacing the BODY turns both into probe oracles for
the owner's environment. AMENDED: both are re-pointed at the credential
accessor's list form - owner sees env plus rows, everyone else sees only their
own rows - so exactly one place in the codebase knows the env fallback exists.
Added to the rename wave's brief as a named exception.

**DAT3 - store the mask, never decrypt to render a list.** `token_last_four`
is a stored column so the settings list never calls `decryptSecret` at all.
Four trailing characters are not a credential; the LEADING characters are the
Canvas user id and are never stored. Also stored: `canvas_user_id` and
`canvas_user_name` from E4's mandatory probe, plus `last_verified_at` and
`last_used_at` - the last stamped only on a SUCCESSFUL call, so a resolve that
then 401s never reads as "working".

**DAT4 - the PK is the upsert arbiter.** `primary key (user_id, institution)`,
non-partial, because PostgREST's `.upsert({ onConflict: "user_id,institution" })`
needs a real unique constraint - the 42P10 trap documented in
`20261011000000`'s header and in this repo's own history. No extra index: the
PK's leading column already serves the per-user list.

**DAT5 - two live bugs found in passing, being fixed now.**
`google-credentials.ts:43-45` and `microsoft-credentials.ts:44-45` call
`decryptSecret` uncaught in their read paths, so a rotated key throws a 500
rather than producing a "reconnect" state - and `crypto.ts` has no test file at
all. Copy the module shape for the new store, but not that line.

**DAT6 - the type files are nearly full.** `types.tables-a.ts` is 955 lines and
`types.tables-b.ts` 911, against a 1000-line ceiling. This table fits in `-b`;
the one after it forces a `types.tables-c.ts`.

---

## Amendments from the cybersecurity pass (2026-09-05)

**SEC1 - E3's re-validation closes nothing. The validation never resolves
DNS.** Every rule in E3, and every assertion in
`src/lib/lms-credential-rules.test.ts`, is about the SHAPE of a hostname. An
attacker registers `canvas.attacker-college.edu` with an A record pointing at
`127.0.0.1` or a private address: it is https, is not a loopback spelling, is
not an IP literal, has a public form, carries no userinfo, has no path - it
passes. Re-checking the same STRING at use time catches an operator who
repointed DNS permanently and does not narrow the rebinding window at all,
because validation and use are two independent `getaddrinfo` calls and the
attacker owns the TTL. AMENDED: resolve the host
(`dns.promises.lookup(host, { all: true })`) and reject if ANY returned
address is private or reserved, at save AND at use; then dial through a
dispatcher whose `connect.lookup` re-applies the address check, so the address
that was validated is the address that is connected. That needs `undici` as a
real dependency or this one call routed through `node:https` with a `lookup`
option. The cost is stated here rather than hidden behind "where the runtime
allows it".

**SEC2 - redirects are followed by default and the target is never
re-checked.** Every Canvas call uses bare `fetch` with no `redirect` option
(`canvas-modules/fetch-helpers.ts:33,91,109`; `canvas/inbox.ts:81` - the exact
call E4 specifies). Node strips `Authorization` across a cross-origin redirect,
so the token is not stolen this way, but the app becomes an unauthenticated
read proxy into whatever the redirect names, and the body comes back. E3's
hedge "where the runtime allows it" is false modesty: the runtime allows it and
this repo already does it in production (`src/lib/github.actions.ts:236-246`
uses `redirect: "manual"`). AMENDED to a hard requirement: one `canvasFetch`
wrapper, `redirect: "manual"`, at most three hops, full host AND address
re-validation on each `Location` before following, plus a timeout.

**SEC3 - a live token-exfiltration primitive, latent today, armed by this
feature.** `src/lib/canvas/announcements.ts:142-146` fetches a URL taken
verbatim out of a Canvas JSON response WITHOUT credentials, and on failure
retries the same URL WITH `Authorization: Bearer <token>`. That is a fresh
request, not a redirect, so nothing strips it. A hostile Canvas host returns
`{"attachment":{"url":"https://collector.evil/x"}}`, answers 404 to the first
attempt, and receives the token on the second - and failing the first attempt
is free. Six more sites attach the bearer to a Canvas-supplied URL:
`canvas-modules/office.ts:54`, `office-accessibility.ts:58`,
`file-preview.ts:38`, `canvas/submissions.ts:97`,
`canvas/submission-detail.ts:105`. The guard already exists and is applied to
exactly one of the seven - `assertProgressUrlIsSameOrigin`
(`canvas-modules/migrations.ts:150`), whose header comment names this exact
risk. AMENDED: promote it to a shared module, apply it at all seven, and never
retry-with-credentials a URL that already failed without them. Unreachable
today because only the owner's env hosts exist; reachable the moment a user
can register a host.

**SEC4 - E2 and E9 have nothing enforcing them.** The repo's universal action
idiom is `return { error: err.message }` - 473 occurrences across 82 files in
`src/app/actions/`. And the run-log redactor only covers `inputs` and
`fieldValues` (`run-logging.ts:329,255`); `error`, `summary` and `progress`
pass through raw (`:321-323`), persist, and render into a downloadable log.
Worse, the Canvas token pattern
(`run-input-redaction.ts:120`) is ANCHORED, so it can only match a value that
IS the token, never one embedded in prose. AMENDED: an unanchored global
scrubber at the single chokepoint, `canvasError` stays status-only as a pinned
invariant, and a test proves a token planted in a step error never survives to
`buildRunLogText`. `redactSensitiveText`
(`lms-generation/generation-diag.ts:73`) is the model to copy.

**SEC5 - base URL and token must come from ONE branch.** They are two
independent lookups today (`canvas-core.ts:183-184` and `:185`), each with its
own fallback. Add a stored-credential branch to each and an owner with a token
env var but no URL env var, resolving a stored row, gets
`{ baseUrl: user-chosen, token: owner's }`. AMENDED: the resolver returns one
tagged union `{ source: "stored" | "env", baseUrl, token }` built in a single
branch, so the two fields can never disagree on provenance.

**SEC6 - E1's RLS shape hands the browser the ciphertext and its exact
length.** Copying `microsoft_credentials` copies a whole-row SELECT for
`authenticated`, and RLS cannot exclude a column. AES-256-GCM is CTR-based, so
ciphertext length equals plaintext length - a signed-in browser can read every
stored token's exact length straight from PostgREST, which directly
contradicts the masking contract, and can bulk-exfiltrate ciphertext so a
later key disclosure retroactively decrypts it. AMENDED: no SELECT policy for
`authenticated` on this table at all (every read is server-side anyway, per
E2).

**SEC7 - bind the ciphertext to its row.** `encryptSecret`/`decryptSecret`
(`src/lib/crypto.ts:27-47`) use no additional authenticated data, so a
ciphertext written for user A decrypts cleanly out of user B's row - verified.
The repo already ships the enabling defect
(`artifact-templates.ts:52,63` upsert and delete by id alone through the
service-role client). AMENDED: `setAAD(\`${userId}:${institution}\`)`, so a
blob in the wrong row fails to authenticate instead of yielding a working
token.

**SEC8 - key rotation currently destroys every credential.**
`crypto.ts:32` emits `iv:tag:ct` with no key identifier, and decrypting with a
rotated key throws an error indistinguishable from tampering. So the standard
response to a suspected key compromise is a one-way destruction of every
stored credential across all three providers. AMENDED: a version prefix and a
`*_PREVIOUS` key accepted on decrypt only; any decrypt failure maps to
"reconnect your Canvas account", never the raw crypto message. Note the
variable is still named `GOOGLE_TOKEN_ENC_KEY` while now covering Google,
Microsoft and Canvas secrets for every tenant.

**SEC9 - E4's three-way error IS the oracle.** There is no rate limiting
anywhere in this app, no `AbortSignal.timeout` on any Canvas fetch, and no
response-size cap (`await response.json()` unbounded at
`fetch-helpers.ts:39,104,110`). "Host did not answer" versus "token rejected",
timed, is a port scanner - a closed port RSTs in milliseconds, a filtered port
hangs. AMENDED: a per-user save rate limit, a FIXED timeout applied identically
to every outcome so latency carries no signal, a read cap, and every
network-layer outcome collapsed into one message. The token-rejected and
host-not-allowed distinction stays - those are decided by our own code.

**SEC10 - `selfIdCache` is keyed on base URL, not on the token.**
`canvas/inbox.ts:77-87` caches the Canvas "self" id per base URL, with a
comment stating the invariant this feature breaks. Two users on one
institution would be told they are the same Canvas person for the life of a
warm process. AMENDED: key on `${userId}:${baseUrl}`, or delete the cache.

**SEC11 - trailing-dot hostnames bypass every name-based rule.**
`new URL("https://localhost.").hostname` is `"localhost."` - not normalized -
so `metadata.google.internal.` fails an `.endsWith(".internal")` check while
resolving normally. IPv4 literals DO normalize, so the gap is exactly where
E3's name rules live. AMENDED: strip one trailing dot from the PARSED hostname
before every name comparison, and add the trailing-dot spellings to the tests.

**SEC12 - validate the raw parse, normalize only afterwards.** The
alternate-encoding tests pass for free (`new URL()` already normalizes
`2130706433`, `0x7f000001`, `0177.0.0.1`). The cases that need real work:
IPv4-mapped IPv6 arrives COMPRESSED and bracketed (`[::ffff:7f00:1]`), so a
string match on `::ffff:127.` misses it; and `normalizeLmsBaseUrl`'s expected
output is the origin, which silently DROPS userinfo - so normalizing before
validating turns `https://canvas.example.edu@evil.example.com` into a clean
`https://evil.example.com`. Also: display the PUNYCODE hostname in E4's
confirmation and E5's list, so a homograph registration shows as
`xn--pple-43d.com`.

**SEC13 - the env fallback must be gated on the IMPERSONATED identity.** Once
the impersonation re-checks become "is an active account" (AD2), a member's
unattended run reaching "no stored credential, fall back to env" spends the
OWNER's Canvas token - and `lms-wipe` and `post-grades` are both headless-safe
(`workflows/headless.ts:27`). AMENDED: the env fallback is conditioned on
`role === "owner"` of the impersonated identity, checked INSIDE the resolver,
throwing rather than falling back for anyone else, with a test pinning that a
non-owner identity can never receive an env-sourced token. Also
`owner-context.ts:16-19` names three callers when there are four
(`workflow-trigger-runner.ts:62-63` is missing) - its own comment tells the
reader to grep before changing the invariant, and the grep no longer matches
the prose.

## Explicitly deferred

Per-user GitHub tokens (the same shape, a separate chunk); LMS platforms
other than Canvas; OAuth against Canvas instead of a personal access token
(better, but it needs a developer key registered per institution, which is an
institutional act this app cannot perform on the user's behalf); and
automatic token-expiry detection.
