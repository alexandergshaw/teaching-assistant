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


## What validateLmsBaseUrl does NOT close (2026-09-06, on delivery)

`src/lib/lms-credential-rules.ts` shipped. It refuses non-https schemes,
userinfo in the authority, any path/query/fragment, loopback across the whole
127.0.0.0/8 range in every encoding, RFC1918, IPv6 unique-local and
link-local, the IPv4-mapped/compatible/NAT64/6to4 forms (decoding the embedded
address and judging it by the same rule a bare literal gets), single-label
hosts, and the .local/.internal/.localhost/.test/.example/.invalid suffixes
with a trailing dot stripped first. It goes past the named ranges to the full
IANA special-purpose registry, and it decides everything off the WHATWG `URL`
parser rather than a regex - which is why the decimal, octal and hex loopback
encodings need no special case at all: `URL` canonicalises them before the
module reads `hostname`. Unparseable input fails CLOSED at every branch.

**Two holes remain open, by design, and they are this module's most important
property: it does not pretend to close them.**

**E-SSRF1 - DNS rebinding. The module never resolves a name.** A hostname that
classifies as public at save time can be repointed at 127.0.0.1 before the
request that carries the bearer token is actually made. Validating the NAME is
not validating the ADDRESS. Closing this belongs to the fetch layer: resolve
explicitly, then re-validate the RESOLVED ADDRESS through the same
classification, using a dispatcher whose connect-time lookup is the thing
being checked. A validator that runs only at save time can never close it.

**E-SSRF2 - redirects. A bare `fetch` follows `Location:` by default.** A
permitted public host can 302 the request, bearer token attached, to any
address this module would have refused. Closing this belongs to the same fetch
wrapper: `redirect: "manual"`, a hop limit, and `validateLmsBaseUrl` re-run on
every hop rather than only the first.

Both are acceptance criteria for whatever performs the outbound request, NOT
for this module. Neither is a defect in it. What WOULD be a defect is any
future code that treats a stored, validated base URL as safe to fetch without
that wrapper - so the wrapper must exist before the first credential is used,
not after.

**Smaller named gap:** Teredo and 6rd IPv6 transition forms are not decoded.
Recorded so it is a known limit rather than an assumed absence.

**One test of mine was wrong and was fixed, not worked around.** The
`maskToken` contract asserted `not.toContain("")` for an empty secret. Every
JavaScript string contains the empty string, so that assertion cannot fail and
guaranteed nothing while looking like a guarantee. It was two properties fused
into one: "a short secret does not appear in its own mask" (which excludes the
empty case) and "every too-short secret masks identically, so the mask is not
a length oracle" (which is where the empty case belonged). Both are now
separately pinned.


---

# Group E pre-code passes (2026-09-06)

Five passes, five separate agents, one role each: architect, UX, admin
capability, site reliability, aesthetics. The data-engineering (DAT) and
cybersecurity (SEC) passes were already recorded above and were not re-run.

Where a pass corrected an earlier claim, the correction is recorded here and
the original is left in place above so the change is visible.

## THE FINDING THAT OUTRANKS EVERYTHING ELSE

**E-CRIT1 (CRITICAL) - `parseNextLink` follows a URL the REMOTE HOST chooses,
with the bearer token attached, and this is a third exfiltration primitive
that neither SEC2's nor SEC3's fix closes.**

`parseNextLink` (`src/lib/canvas-core.ts`) returns whatever URL sits in a
response's `Link: rel="next"` header. VERIFIED by reading it: there is no
host check of any kind. Its callers then dial that URL with
`Authorization: Bearer`. 26 call sites across 11 files.

Why the existing fixes miss it:

- It is NOT a redirect, so SEC2's `redirect: "manual"` does nothing - the app
  constructs the request and attaches the header itself.
- It is NOT one of SEC3's seven attachment sites. This is the PRIMARY READ
  PATH of the entire app.

And it is a reliability defect as well as a security one: the loop's
termination condition is controlled by the remote host, and all but one of
the loops has no page cap. A host returning a `rel="next"` pointing at itself
produces an unbounded loop, which on this platform ends as an opaque kill at
60 seconds with no error and no log row - inside an unattended run, a
`workflow_runs` row with no `finishedAt`, indistinguishable from a slow LLM
step.

Blast radius TODAY is zero, because only the owner's env-configured hosts
exist. It arms the moment the first user registers a host. **This must land
before the first credential is saved**, on the same logic the AC's own closing
section already states for the fetch wrapper. SEC3's list of seven sites
becomes twenty-four.

## Corrections to claims recorded earlier in this document

- **DAT5 is fully stale.** Both `decryptSecret` call sites it names are now
  wrapped and collapse to "reconnect", and `src/lib/crypto.test.ts` exists.
  Its advice is now vacuous - there is no such line to avoid.
- **SEC8 is half stale.** The version prefix HAS shipped: `encryptSecret`
  emits `v1:iv:tag:ciphertext` and `decryptSecret` accepts both forms. Only
  the `*_PREVIOUS` key on decrypt is outstanding, so the destructive-rotation
  conclusion stands unchanged.
- **SEC13's closing parenthetical is stale** - it names three impersonation
  callers where the file now names four. Nothing to fix.
- **E7's "72 files" is the transitive closure, not the resolvers.** The real
  figure is 104 call lines across 32 files. Two unrelated functions also named
  `resolveInstitution` inflate a naive grep; neither touches credentials.

## A CORRECTION TO A PEER PASS, recorded because accepting it would have been
## expensive

The architect reported that the 1000-line ceiling is "a convention, NOT
enforced by any test". **That is wrong.** `src/file-size-ceiling.structure.test.ts`
exists, sets `LIMIT = 1000`, collects violations and asserts the list is
empty. It was observed failing on `app-users.ts` at 1030 lines earlier the
same day, with the message the test itself composes. The pass searched for
`toBeLessThan(1000)` and `MAX_LINES` and missed `LIMIT = 1000`.

The confusion has a real source worth recording: the test carries an
`ALLOWED_OVERAGE` map of five grandfathered files, each pinned to its
measured line count as a HARD RATCHET rather than an exemption - such a file
may shrink freely but fails the moment it grows past where it already was.
So some files over 1000 lines legitimately pass, which looks like absence of
enforcement and is not.

**The ceiling is enforced. Keep it in every brief.**

## Architecture (the deliverable the implementation wave dispatches against)

**E-ARCH1 - the migration is mechanical, and nothing in the AC says so.** 103
of the 104 resolver call sites are ALREADY inside `async` functions; exactly
one sync encloser exists, a private six-line helper. The whole feature is one
`await` per call site, not a restructure. An implementer who assumes otherwise
will over-engineer the wave.

**E-ARCH2 - `undici` is not installed, and `node:https` is the better answer
anyway.** `lookup` is a real option on both `https.request` and
`https.Agent`, so the wrapper can resolve the host, classify every returned
address, and pin `lookup` to the vetted one - the address checked IS the
address dialled, which closes the DNS-rebinding hole the AC's closing section
leaves open. And `https.request` does not follow redirects at all, so the
redirect hole closes BY CONSTRUCTION rather than by a flag a future caller can
forget. Do not add a dependency to get a weaker guarantee.

**E-ARCH3 - one resolver, one branch, one object.** `resolveCanvasCredential`
returns `{ source, institution, baseUrl, token }` and is the ONLY export of
its module - no `getBaseUrl`, no `getToken`, no `hasCredential`. The fetch
layer takes that object, never `(baseUrl, token)`, so no signature in the
codebase will accept a mismatched pair. SEC5 is enforced by an export-surface
ratchet, because a type cannot express "these two fields came from the same
branch".

**E-ARCH4 - the user id NEVER travels as an argument.** It is resolved
server-side from ambient state (`getImpersonatedOwner()` else `requireUser()`).
A user id that arrives as a parameter is the same defect as a client-supplied
institution code, relocated. The 104 call sites never learn who the user is.

**E-ARCH5 - the address classifier is EXTRACTED, not duplicated.** The
private IPv4/IPv6 rules inside `lms-credential-rules.ts` are exactly what the
fetch layer needs for the RESOLVED address. Two copies that must agree is the
precise failure that module's own header exists to prevent. Extract to a leaf
both import; the existing tests must pass VERBATIM across the move, and no
test may compare the extracted function to the module that now calls it -
that is the tautology this repo has shipped twice.

**E-ARCH6 - 22 test files break, and the AC never mentions it.** They use the
repo's deliberate "stub only `globalThis.fetch`, let `resolveCourse` run for
real" idiom. DB-backed resolution kills it in all 22. Mock the identity to
`role: "owner"` uniformly, keeping the env path alive, and say so in EVERY
wave brief - otherwise five agents invent five mocking conventions.

**E-ARCH7 - `listConfiguredInstitutionsAction` has 8 consumers, not one.**
DAT2 reads as a one-line guard swap. Changing it from "the owner's env" to
"the caller's rows" changes what workflow fan-out MEANS for every one of them.

**E-ARCH8 - BLOCK2 must NOT be lifted in this wave.** Group E contains Canvas
only; the GitHub token and the cloned voice/avatar stay uncontained and
per-user GitHub tokens are explicitly deferred. Write the resolver's role
check as if the stopgap were already lifted - that is what makes it a real
guard rather than dead code - and leave the stopgap in place.

## Reliability

**E-REL1 (CRITICAL) - two retried Supabase reads in series exceed the cap, and
unlike GC10 they CANNOT be parallelised.** The credential read cannot start
until the guard has said who the caller is; the dependency is genuine. At
GC10's arithmetic that is 39s + 39s = 78s against a 60s cap before a byte
reaches Canvas. FIX: bound the credential read at 5s (it is a single indexed
PK lookup, the gate's shape, not the account-list scan's) and call
`.retry(false)` on it - a real API in the installed version. A credential read
has a correct answer on failure, and that answer does not improve with three
retries. 78s becomes ~44s.

**E-REL2 (HIGH) - nothing bounds any Canvas call today.** Fourteen
`AbortSignal.timeout` uses exist in the repo and NONE is on a Canvas fetch.
The bounds, argued: validation probe 10s no retry (matching the repo's only
external-host precedent); attended read 15s with 429-only retry; unattended
read `min(15s, deadline - now)`, reusing the deadline the runner already
carries; and - the number that actually keeps the function inside the cap - a
25s budget plus a 20-page hard cap on any paginated operation, because
per-request bounds do not bound a loop. NEVER retry a network-layer failure
against a user-supplied host.

**E-REL3 (CRITICAL) - "no credential yet" would trip the only alert channel
this deployment has, on every tick, forever. This is GC8 resurrected and
worse.** A step failure becomes `status: "error"`, the Actions workflow greps
for that and exits nonzero, and its failure email is the only outbound alert
that exists. "This user has not connected Canvas" is a legitimately persistent
state - and unlike GC8, THE RECIPIENT CANNOT ACT: the alert goes to the owner,
and the fix requires the member to paste a token the owner can never see.
FIX: classify both "no credential" and "credential rejected" as `"skipped"`,
which the route already does for "account is not active" for exactly this
reason; put the state on the schedule's own row; notify the CREDENTIAL'S OWNER
in-app via the existing nav badge. Add NO new Actions alert.

**E-REL4 (HIGH) - the SEC13 ordering constraint is asymmetric.** Too loose (a
non-owner impersonated identity reaching the env fallback) means a member's
unattended run spends the OWNER'S token - and both `lms-wipe` and
`post-grades` are headless-safe, so that is destructive writes in the owner's
real courses, unattended, with no undo. Too tight breaks every existing owner
schedule at once on deploy - loud, immediate, recoverable. Bias toward too
tight. The credential accessor's own owner check must ship in the SAME DEPLOY
as any relaxation of the impersonation branch.

**E-REL5 (HIGH) - key rotation destroys every credential for every user across
three providers, and the operator cannot see it happen.** A rotated key is
currently INDISTINGUISHABLE from "never connected" on every surface. Land the
`*_PREVIOUS` key BEFORE the first credential is stored - the version tag is
already on every row, so it is a one-file change with no data migration - and
write the rotation runbook, which does not exist anywhere.

**E-REL6 - the durable diagnostic must be COLUMNS, not prose.** With no log
aggregation, a `console.error` is gone before anyone reports the problem.
Store `last_failure_at` and `last_failure_kind` constrained to a CLOSED ENUM
of four values: no credential / unreadable / rejected / host unreachable. An
enum cannot leak a token; free text is precisely how the log leak happens.
Rows 2 and 3 are the pair that matters, because they produce the same
user-visible symptom and a log line cannot separate them after the fact.

## Administration

**E-ADM1 - the AC is thorough about STORING a credential and silent about
DISPOSING of one.** No criterion covers suspension, demotion, deletion,
institution removal, key rotation or revocation-at-source.

**E-ADM2 - suspension does not, cannot and should not revoke the token, and
the dialog must say so.** This app cannot revoke a Canvas token; only Canvas
can. A criterion phrased as "suspension revokes the credential" would be the
same class of lie the suspend copy already had to be rewritten to remove. Do
NOT auto-delete on suspend either - a suspended member cannot sign in to
re-enter a token, so that silently converts a reversible action into a
partly irreversible one, against copy that promises restoration.

**E-ADM3 - demotion silently breaks Canvas, and the shipped dialog says the
opposite.** It currently promises the target "keeps their access to the
workspace - only the ability to manage other accounts is removed". Under
SEC13 that is FALSE for an owner who never migrated off the env fallback.
Worse, the same demotion happens with no dialog and no human at all when an
address leaves the allowlist. The dialog must branch on whether the target has
a stored credential.

**E-ADM4 - account deletion does not exist, so credentials accumulate with no
janitor.** The cascade E1 copies is armed but unreachable from inside the app.
Every instructor who ever worked here leaves behind a live encrypted bearer
credential, indefinitely, with no expiry and no review. That is not a neutral
default; it is a decision to retain third-party credentials forever.

**E-ADM5 - admin CRUD, argued.** READ: the plaintext token NO, never (an
owner who can read it can act as the member in Canvas with nothing
distinguishing the two, which destroys the accountability this feature
exists to create). The MASK also NO - it serves no purpose the existence flag
does not, and an owner-facing list of every member's last-four is an aggregate
oracle. The HOST **yes**, and it is a security control: validation never
resolves a name, so an owner seeing `canvas.attacker-college.edu` is the only
human check. The CANVAS IDENTITY yes - it answers "which Canvas identity does
this app act as", the question asked when Canvas's own audit log shows a grade
change. CREATE and UPDATE: **no**, both require the owner to hold the member's
plaintext. DELETE: **yes**, with a tombstone that holds no ciphertext, because
it is the only disposal lever the product can offer and the member must be
able to learn an administrator did it - otherwise it is indistinguishable from
a key rotation.

**E-ADM6 - the sixth action has three specific traps.** A frozen literal
canary pins the five action names and must be bumped in the same commit (do
not let it be "fixed" by reading the array back into itself, which disarms it
permanently). The dialog machinery had an unchecked cast to a four-member
union - FIXED 2026-09-06, replaced with a named type plus a type guard, so a
sixth confirming action now fails to compile instead of rendering a dialog
with an undefined title. And the rule needs a fact the target shape does not
carry, which must be SERVER-DERIVED inside the action.

**E-ADM7 - allowlist protection must NOT apply to a credential action.** That
rule exists because reconciliation would silently undo the write.
Reconciliation touches role, status, display name and email - NEVER
credentials. So the action is genuinely effective on an allowlisted row, and
refusing it would remove the operator's ability to clean up the account most
likely to hold the most powerful token in the deployment. Say why in the doc
comment, because this is exactly the guard someone later "simplifies" by
pattern-matching the other destructive actions.

**E-ADM8 - two shipped strings become FALSE the day this ships.** The approve
dialog states "Per-account credentials do not exist yet, so this access cannot
currently be narrowed" - the string the copy sheet itself calls the most
important on that surface. After Group E, approving grants the app but NOT the
owner's Canvas token. The replacement must stay precise: the GitHub token, the
cloned voice and the avatar likeness are STILL shared, and a blanket
"credentials are now per-account" would be the more dangerous lie.

**E-ADM9 - DAT1 conflicts with the shipped institution-removal flow, and
nobody has resolved which wins.** Removal's own copy promises the user that
removing an acronym deletes nothing and that re-adding restores everything.
If that promise holds, a credential-derived institution list re-materialises
the acronym immediately and the control is a no-op. If removal deletes the
credential row, the copy is a lie. There is a third state nobody named: a
credential orphaned from every institution-scoped UI while remaining fully
usable by the resolver. RESOLUTION: the acronym registry is a DISPLAY FILTER,
the credential row is the CONNECTION; removal never touches a credential; the
credentials list shows every credential regardless of the local registry.

## UX

**E-UX1 - the flow to optimise is not the one from the Settings menu.** The
user who shows up is one who hit a dead end. The deep-link plumbing already
exists on the integrations page, so a dead-end link can arrive prefilled and
scrolled: ONE click plus one keypress. The cold path is three clicks, matching
the existing Outlook benchmark exactly.

**E-UX2 - it joins `/account/integrations` as the FIRST section, not a new
page.** That page is already a per-school connect/disconnect list. And the
dependency runs one way: after DAT1, you cannot connect Outlook for a school
until Canvas is connected for it. On one page with Canvas first, that ordering
is visible; across two pages it is inferred from a dead end.

**E-UX3 - E4 has FOUR outcomes, not three, and the missing one is the most
common real failure.** A user pastes the school's marketing site instead of
its Canvas host. It is a valid public https host so the classifier accepts it;
it answers so it is not unreachable; it returns HTML so it is not a rejected
token. Folded into "token rejected", that user goes and generates a SECOND
token and fails identically. It needs its own sentence. The cost is stated
plainly: keeping the outcomes distinct hands a signed-in user a reachability
probe of public hosts - and that trade is CONDITIONAL on SEC9's rate limit
shipping in the same change. If it does not, the outcomes collapse.

**E-UX4 - only the network-layer outcome needs time-flattening.** SEC9 read
literally means a constant-time save for every result, which is a bad
interaction and wasteful. The oracle only distinguishes network-layer outcomes
from each other, so pad ONLY that branch to the full timeout; our own code's
refusals already carry distinct text and padding them adds nothing.

**E-UX5 - the row's identity is the CANVAS ACCOUNT, not the mask.** E5 lists
five fields unranked and an implementer will make the masked token prominent.
Four trailing characters are useless for recognition six weeks later; a name
is not. The Canvas account is the only field that answers "is this the right
token".

**E-UX6 - render the mask as WORDS, not asterisks.** "Ends in 1a2b" carries
identical information and reads as words; a run of asterisks is announced as
eight punctuation events or as nothing, depending on verbosity. The no-suffix
case must not be a visually distinct placeholder, or it reintroduces the
length oracle the reveal-threshold constant exists to remove.

**E-UX7 - three sentences the AC never asks for and which matter most.** The
old token stays in use until the new one verifies (true by construction, and
the sentence that lets somebody rotate at 11pm without a knot in their
stomach); on failure nothing changed; and replacing or deleting here does NOT
revoke the token in Canvas - no revocation call exists anywhere in this
repository, so somebody rotating after a suspected leak would otherwise walk
away believing the leaked token is dead.

**E-UX8 - E8's `requireInstitution` instruction is a NULL instruction.** It
asks a pure, import-free function with no view to render a state. Making it
not throw just moves the throw. The real work is the pattern this repo already
uses correctly: export a recognisable message constant, throw it from the
accessor, and catch it BY IDENTITY at each surface, rethrowing everything else
so a real outage is never disguised.

**E-UX9 - the app currently tells end users to "Set env".** The per-acronym
status chip renders "Set env" for an unconfigured school - an instruction only
the deployment owner can perform, and `title`-only so keyboard users never see
the explanation. Its sibling "Ready" is a second lie that survives this
feature unless changed: the check tests only that two environment strings are
present and never contacts Canvas, so a typo'd token reports ready.

**E-UX10 - one string inverts from true to false.** The knowledge tab
currently carries the ONLY string in the app that states the real constraint -
that registering an acronym does not grant Canvas access. It becomes the app's
newest lie the moment this ships, and must be deleted in the same change.

**E-UX11 - a shared visually-hidden helper DOES exist.** A comment shipped
today claimed otherwise; it has been corrected. The utility is a
`CSSProperties` object consumed by seventeen files.

## Aesthetics

Recorded in full in the aesthetics section appended separately above. The four
operative predictions: the orphan ratchet asserts EQUALITY so a falling count
is as red as a rising one, and E8 points an implementer straight at three
orphaned classes whose wiring would drop it; no `@mui/material` import may
appear in any file this feature adds under the account area (grep-checkable,
and there are currently zero); the validate action goes BELOW the fields
because the input and the buttons are different control heights; and the mask
is never ellipsised and never given a `title`.

## What every pass agreed on without being asked

Nothing in this feature will ever be rendered by a test. Four of the five
passes said so independently and scoped their findings accordingly. Every
accessibility property, every visual requirement and every piece of copy here
is verified by reading, once, or not at all.


---

## Amendments from the aesthetics pass (2026-09-06)

Requirements, not advice: each is a line an implementer is held to at the
follow-up conformance pass. Every token and class named below was read out of
the file cited. Three of the pass's own claims were independently re-verified
by the orchestrator before being recorded here, and all three held.

### The four drift predictions - the operative part

**AES-D1 (CRITICAL) - the orphan ratchet is an EQUALITY assert, and E8 points
an implementer straight at it.** `page-module-css-orphan-classes.test.ts:340`
is `expect(totalOrphanCount, message).toBe(PINNED_ORPHAN_CEILING)` - VERIFIED.
Falling below the pin is exactly as red as rising above it. The specific
hazard: `TopBar.module.css` declares `.instInput`, `.instAddBtn` and
`.instRemove`, and `TopBar.tsx` references none of them - VERIFIED, each
declared and referenced zero times, because that block renders MUI
`TextField`/`Button`/`IconButton` with `sx` instead. E8 requires making "add
one in Settings" true, which leads directly to that block. Wiring those three
up drops the measured count to 117 and REDDENS THE SUITE FOR EVERY SIBLING
AGENT mid-wave.

Requirement: any change that moves the measured count moves
`PINNED_ORPHAN_CEILING` in the SAME commit, with the regenerated
`docs/css-orphans.md` committed alongside it. Every class this feature adds
must be referenced by a file importing that same stylesheet.

**AES-D2 (HIGH) - no `@mui/material` import may appear in any file this
feature adds under `src/app/account/`.** VERIFIED: `grep -rln "@mui/material"
src/app/account src/app/login` returns ZERO files today - the whole account
and login area is MUI-free. MUI 9's `<Button loading>` is the obvious way to
build "Validate and save", 207 files already import it, and it would sit at
MUI's default height beside `.input`'s 40px while disabling with no
`aria-busy`. This is a grep-checkable requirement precisely so it can be
enforced without rendering anything.

**AES-D3 (HIGH) - the validate action goes BELOW the fields, never inline
beside the input.** `.input` is `--control-height-lg` (40px); `.primary`,
`.secondary` and `.remove` are `--control-height-md` (34px). Every existing
account page dodges this by putting the action in `.row` beneath the field.
The natural reading of E4 - "paste your token [Validate]" on one line - puts a
34px button against a 40px input, breaking the one-height-per-cluster rule by
6px, invisibly to every gate. Not a token gap: both heights exist and are
correct for their own clusters.

**AES-D4 (HIGH) - the mask is never ellipsised and never given a `title`.**
`maskToken` returns a fixed-width `********` or `********` plus the last four
characters. The standing truncation idiom (single-line cells ellipsise with a
`title`) would cut the only informative characters AND move the mask into a
hover tooltip, where it cannot be selected and does not exist on touch. It
renders in `.secret`, min-width-sized for 12 monospace characters.

**AES-D5 (MEDIUM) - E8's inline link will ship invisible.** `globals.css` sets
`a { color: inherit; text-decoration: none; }`, so a bare link dropped into
either institution hint inherits the muted colour with no underline - a link
nobody can see, and no gate can catch it. It must carry the existing
`.linkButton` class (already live, so reusing it moves no count). JSX-only
change in those two components; neither authors a new rule.

**AES-D6 (MEDIUM) - punycode renders in full.** SEC12 requires showing the
punycode host so a homograph registration reads as such. That string looks
like corruption and the instinct is to shorten it. It wraps instead; a row
growing to two lines is correct here, because this list is `.factor` rows and
not a table.

### Structure and vocabulary

- **AES-1.** The surface imports `security.module.css` and reuses its `.page`,
  `.card`, `.title`, `.subtitle`, `.section`, `.sectionTitle`. Any second
  stylesheet is LAYOUT ONLY: no `.page`, no colour, no button. Precedent is
  already recorded in `people.module.css`'s own header.
- **AES-2.** The credential list is `.factor` rows reusing the Integrations
  shape - NOT `people.module.css`'s `.table`, whose `min-width: 720px` inside
  `.card`'s `max-width: 48rem` would force a horizontal scrollbar at every
  viewport for a five-field row.
- **AES-3.** Button vocabulary is `security.module.css` exclusively:
  `.primary` for the single submit, `.secondary` for Cancel and Replace,
  `.remove` for Delete. Exactly one `.primary` renders at a time.
- **AES-4.** Delete is always visible with a text label - never an overflow
  menu (E5 refuses it), never hover-revealed, never icon-only. Note there is
  NO visually-hidden utility class anywhere in this repo, so every label is
  visible text.
- **AES-5.** Status pills: `.pill` for connected, `.pillPending` for needs
  re-entry, and NO pill at all while validating - a success-coloured pill is a
  settled fact, and the row does not enter the list until the probe returns.
  No fourth pill is added.
- **AES-6.** Focus ring: declare nothing. `security.module.css`'s `.page`
  declares no `--focus-ring-color` and `focusRing.wiring.test.ts` asserts
  exactly that. No new `.page` rule is authored.

### States

- **AES-7.** The empty state uses `.emptyState` and contains NO `--danger-*`
  token, no `role="alert"`, no `.error` class and no dashed border. `.tip`'s
  dashed border reads as unfinished, so it is not reused as an empty state.
- **AES-8.** Loading is `.loadingRow` + `.spinner`, left-aligned, never
  `.emptyState` - a centred muted paragraph while data is in flight IS the
  failure E8 names.
- **AES-9.** Validating must not look like saved: no pill, the submit keeps
  `.primary` and is `disabled` (one disabled treatment only), the spinner sits
  in the same `.row` the result banner will occupy so nothing shifts on
  resolve.
- **AES-10.** E4's three failures differ in TEXT only - one banner, one
  colour, one shape. No per-field red border; `.input` has no error variant
  and adding one would move the orphan count.
- **AES-11.** "Never used" is a rendered phrase, not a blank cell - the shape
  the account list already uses for "Never changed".
- **AES-12.** The spinner writes `animation: var(--ta-spin-animation)`, never
  a bare `ta-spin` ident: Lightning CSS scopes the name reference inside a
  module and the ring renders motionless.
- **AES-13.** Ellipsis spelling: three ASCII periods, matching the newer file,
  keeping the change free of non-ASCII in a repo that byte-scans every file.
  A real divergence exists in the tree and is settled here, not invented.

### Gaps reported rather than patched

- No `--success-border` token exists; `.notice` works around it with a
  `color-mix`. Reuse `.notice`; do not re-derive that mix.
- No select/combobox class exists. A `<select className={styles.input}>`
  inherits height and border but renders a native chevron with no right
  padding. If an institution picker is needed, REPORT the gap - do not author
  a chevron, an `appearance: none`, or a background-image data URI.
- No monospace input class, deliberately. `.secret` carries the mono
  treatment for the read-only mask; `.input` stays as authored.
- No visually-hidden utility class anywhere in the repo.

### Ratchets that move with this work

`PINNED_ORPHAN_CEILING` only if the measured count changes (equality, so
either direction). The two modal-adoption pins move by one each ONLY if a
ModalShell dialog ships - `window.confirm` is equally legal here and moves
neither; shipping a dialog without moving both is not.

### What the pass could not verify

Whether the mask's 12px monospace is legible enough for the four revealed
characters at typical zoom, and the actual painted height delta in AES-D3
(derived from the two token values, not measured). Both are stated as
token-level facts so they remain checkable by reading.


## Wave 1 delivery notes (2026-09-06)

**E-CRIT1's guard: USE THE RETURNED STRING, NOT THE CANDIDATE.**
`assertCanvasSuppliedUrlIsSameOrigin` accepts a RELATIVE candidate (a Link
header may legitimately carry one) and resolves it against the base before
checking. For a relative candidate the returned string and the input therefore
DIFFER, and the resolved absolute form is the one that is safe to dial. Every
one of the 26 call sites in the later wave must fetch what the guard RETURNED.
Dialling the original candidate would pass the check and then request
something else - the exact checker-and-fetcher-disagree shape this whole
boundary exists to prevent.

**Why an empty string is refused before parsing.** `new URL("", base)`
resolves successfully to the base itself. Accepting it would silently turn a
caller bug into an apparently-safe pagination link back to page one, looping
forever on the first page instead of failing.

**The redirect rule went beyond SEC2, deliberately.** `canvasFetch` follows a
redirect only when its origin equals the ORIGINAL request's origin - not
merely when the target re-validates as a public host. SEC2's literal wording
("re-validate before following") would still permit a validated-but-different
host to receive the bearer token. Same class of bug as E-CRIT1, closed at the
redirect layer too.

**A mixed DNS answer is refused whole.** If any address returned for a host is
special-purpose, the request is refused and `https.request` is never called.
A partially-private answer is exactly the shape a rebinding attack produces,
so it is never partially trusted.

**What the DNS-pinning test can and cannot prove.** It captures the `lookup`
function actually handed to `https.request`, calls it with an
attacker-supplied hostname, and asserts it still returns the vetted address -
proving the function structurally ignores its hostname argument. It CANNOT
prove Node's socket layer honours `lookup` end to end; that rests on Node's
documented contract and is not exercisable without a real network call, which
these tests deliberately avoid.

**The failure-kind enum is THREE values, not four.** The operator's diagnostic
vocabulary has four states, but the fourth - no credential for this
institution - is ROW ABSENCE. There is no row to stamp it on, so permitting it
in the column's domain would leave a value the application cannot produce and
somebody eventually writes by hand. The CHECK constraint and the TypeScript
type agree on three.


## Wave 2 decisions (2026-09-06)

**E-UX10 was WRONG and is corrected here.** That amendment said the knowledge
tab's constraint sentence must be DELETED outright once per-user credentials
ship. It should not be. The sentence has two halves and only one of them goes
false:

- "Registering an acronym here does not grant Canvas access" - STILL TRUE.
  Registering an acronym is a browser-local act; connecting a credential is a
  separate, deliberate one. This half is a genuinely useful warning and
  deleting it removes the only place the distinction is stated.
- "that still needs the institution's server-side env vars, configured
  separately" - FALSE the day this ships, and it names an environment
  variable at a user who cannot set one.

So: keep the first half, replace the second with the real remedy. Credit to
the pure-modules pass for refusing to delete a true sentence on a doc's say-so
and flagging it instead of choosing silently.

**The export ratchet permits ONE value export beside the resolver.**
`CANVAS_CREDENTIAL_REQUIRED_MESSAGE` is allowed alongside
`resolveCanvasCredential`. A literal reading of SEC5 ("exactly one export plus
types") would forbid it and thereby forbid E-UX8's catch-by-identity pattern.
Confirmed as correct: a message string carries no base URL and no token and
cannot be used to reconstruct a mismatched pair, so the invariant the ratchet
exists to protect is untouched, while accessor-shaped exports
(`getBaseUrl`, `getToken`, `hasCredential`) stay hard-blocked and are named as
forbidden in the test.

**The credential read is now bounded AND non-retrying at the query builder.**
The resolver could only race the read against a timer from its own module,
which bounds its return but leaves an abandoned read retrying server-side.
`.abortSignal()` and `.retry(false)` are both real APIs in the installed
postgrest-js and are now applied where the query is actually built, with tests
that fail if either is removed. This is the fix that turns a ~39-second
degraded read into 5, and it is the difference between two serial reads
fitting inside the platform cap and the request dying with no page.

**The mask has two producers and they cannot drift.** The stored
`token_last_four` column and `maskToken` would normally be kept in step by
copying the latter's constants. They are not copied: the view derives the
revealed suffix by calling the REAL `maskToken` twice - once with an empty
string to obtain pure filler, once with the candidate - and diffing, then
verifies the result is a genuine suffix before trusting it. A change to the
reveal threshold or the filler cannot desynchronise them.
