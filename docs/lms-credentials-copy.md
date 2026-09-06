# Copy sheet: the per-user Canvas credentials surface

Every user-visible string the Canvas section of `/account/integrations` needs
(E-UX2 - it joins that page as the first section, not a new page), fixed here
in the same shape as `docs/account-people-copy.md`, for the same reason: where
a string makes a CLAIM about what the system does, the claim is checked
against the code and the check is recorded underneath it. This document does
not implement the page - it specifies the strings the pure modules
(`src/lib/lms-credential-view.ts`, `src/lib/lms-credential-probe-outcome.ts`,
`src/lib/lms-credential-save-limit.ts`) do not themselves carry, because those
modules produce judgments (which outcome, which row shape), not prose.

Rules that apply throughout, several load-bearing enough to restate from
`docs/lms-credentials-acceptance-criteria.md` directly:

- No emojis (enforced repo-wide by a test - `src/lib/no-emojis.test.ts`).
- Never name an environment variable at a member. A signed-in member cannot
  set one - only the deployment owner can - so an instruction built around one
  is not actionable for the person reading it.
- Never print a token, a fragment of one, or its length, anywhere: not a
  success message, not a failure message, not a hover title.
- Never say "secure" or "encrypted end-to-end." Say what is actually
  checkable instead (see E-UX7 below for the concrete example this rule
  exists to prevent).
- Ellipsis is three ASCII periods ("..."), never U+2026 - this repo
  byte-scans every file it ships.
- Plain ASCII punctuation throughout this document itself: a hyphen with
  spaces around it ("...host - never...") in place of an em or en dash, and
  straight quotes. Matches `docs/lms-credentials-acceptance-criteria.md`'s
  own style, not an arbitrary extra rule invented here.
- Sentence case for headings and buttons; no terminal full stop on a button
  label.
- Where the underlying code can fail in more than one distinguishable way,
  this sheet gives distinct copy for each way, never one generic "something
  went wrong."

---

## Vocabulary this page already has, reused rather than reinvented

`src/app/account/integrations/page.tsx` (read in full before writing anything
below) already runs a Google Calendar section and a per-school Outlook
section on this exact page, sharing `../security/security.module.css`. Its
existing vocabulary: pill text "Active" / "Not connected"; buttons "Connect
{name}" (primary), "Reconnect" (secondary), "Disconnect" (remove); a
`.rowDetail` line under a connected row; a `.tip` paragraph at the foot of the
page; `.emptyState` for "nothing to show yet"; `.loadingRow` + a spinner while
a status fetch is in flight.

The Canvas section reuses this vocabulary where the concept is the same and
diverges only where AES-3 explicitly requires a different word:

- Pill text is **"Connected"**, not "Active" - matching this feature's own
  vocabulary elsewhere (`docs/lms-credentials-acceptance-criteria.md` E2: "a
  masked form... and a 'connected' state"), and matching AES-5's own naming
  of the two pill states as `.pill` ("connected") / `.pillPending` ("needs
  re-entry").
- The re-verify button is **"Replace"**, not "Reconnect" - E5's own wording
  ("Replace re-runs E4") is followed literally rather than borrowed from the
  Outlook section, because "Replace" also has to cover pasting a genuinely
  DIFFERENT token (a rotated one, or correcting a paste from the wrong
  account), not only re-authenticating the same one - "Reconnect" reads as
  the latter only.
- The delete button is **"Delete"**, matching AES-3's `.remove` -> "Delete"
  naming and E5's own wording ("Delete removes the row immediately"), not
  "Disconnect" - see the Delete section below for why the stronger word is
  deliberate here.

---

## The empty state

Rendered in place of the credential list when this user has not connected
Canvas for any school yet.

> You have not connected a Canvas account for any school yet. Add one below
> to let this app read and update that school's Canvas data on your behalf.

**Checked:** `buildLmsCredentialRows` (`src/lib/lms-credential-view.ts`)
returns `[]` for an empty input array with no special-cased "empty" output of
its own - deciding there is nothing to show, and what to say about it, is
correctly left to the page, which is exactly why this sheet specifies the
sentence rather than the pure module. Mirrors
`docs/account-people-copy.md`'s own "No account records exist yet" empty
state in tone and in NOT reusing the word "signed up" for a fact that is
really about registration, not authentication.

---

## "I do not have a token yet"

Shown as a persistent hint near the add-credential form, not only on error.

> Need a Canvas access token? In Canvas, go to Account, then Settings, scroll
> to Approved Integrations, and choose New Access Token. Canvas shows you the
> token exactly once when you create it - copy it right away and paste it
> here.

**Deliberately words, never a link, and this is a security decision, not a
style one.** A clickable link would have to be built from SOMETHING - either
a hardcoded generic Canvas URL (wrong the moment an institution is
self-hosted or uses a non-default path) or, worse, constructed from the host
the user just typed into THIS SAME FORM (`https://${theHostTheyTyped}/profile/settings`).
The second option means building a URL out of unvalidated input on the exact
page whose entire subject is not trusting a user-supplied host -
`validateLmsBaseUrl` (`src/lib/lms-credential-rules.ts`) exists precisely
because this app must not act on an LMS host before it has been checked, and
a clickable link bypasses that check entirely by handing the browser a
navigable URL nothing here has classified. Nothing in this repository
verifies a Canvas host's real path structure either way (grepped
`src/lib/canvas-core.ts` and `src/lib/canvas-fetch.ts`: neither ever
constructs a `/profile/settings`-shaped URL for any purpose), so there is
also no code this claim could be checked against even if the safety concern
did not apply. Plain words carry the same information with none of the risk.

**What is and is not verified here:** the menu path ("Account > Settings >
Approved Integrations > New Access Token") describes Canvas's own,
standard-installation UI as of this writing - it is a fact about a third
party's product, not about this codebase, so it cannot be "checked" against
`src/` the way the rest of this sheet's claims are. An institution running a
heavily customized Canvas skin, or a future Canvas UI change, could make this
sentence stale without anything in this repository changing at all. Flagged
as a known limitation rather than silently assumed accurate forever.

---

## Token expiry

A permanent note near the form, not a warning that appears only once
something has already broken.

> Canvas access tokens can be set to expire when you create them. This app
> has no way to detect that a token has expired or is about to - if Canvas
> calls for this school suddenly start failing, check whether the token you
> registered has an expiration date that has passed, and register a new one
> if so.

**Checked:** `docs/lms-credentials-acceptance-criteria.md`'s own "Explicitly
deferred" section names "automatic token-expiry detection" as out of scope.
Consistent with that, `LmsCredentialFailureKind`
(`src/lib/lms-credentials.ts`) has no `"expired"` member - an expired token
presents to this app identically to any other bad token, a plain 401, which
`classifyCanvasProbeOutcome` (`src/lib/lms-credential-probe-outcome.ts`) maps
to `"rejected"`, the same outcome a mistyped or revoked token produces. This
app genuinely cannot and does not tell the three apart, so the copy does not
pretend otherwise.

---

## The verification outcomes

E4 names three; E-UX3 corrects that to four; this feature's own rate limit
(SEC9) and its own persistence step add two more that are not Canvas outcomes
at all. All six are `LmsCredentialProbeOutcome["kind"]`
(`src/lib/lms-credential-probe-outcome.ts`) - a page renders exactly one of
these per attempt, never a generic catch-all.

### 1. `"verified"` (not a failure - the success case)

> Connected as {canvasUserName, or "Canvas user " + canvasUserId if Canvas
> did not return a name}.

**Checked:** `classifyCanvasProbeOutcome` only reaches `"verified"` after
parsing a 200 response body as a Canvas self-record with a usable `id`
(`extractCanvasSelfIdentity`, same file) - this is E4's own requirement ("The
user is told which Canvas account the token belongs to, so a token pasted
from the wrong tab is caught immediately").

### 2. `"rejected"` - Canvas said no

> Canvas did not accept that token. Copy a fresh access token from Canvas and
> paste it here.

Never "invalid token" or "authentication failed" - the fix is specific
(get a new token), and the sentence says so instead of describing the
symptom. **Checked:** `classifyCompletedExchange`
(`src/lib/lms-credential-probe-outcome.ts`) reaches this branch only on HTTP
401 or 403 - a completed exchange, not a network failure - matching E4's own
"that token was rejected."

### 3. `"not-canvas"` - the host answered, but it is not Canvas (E-UX3)

> We reached that address, but it does not look like a Canvas site. Check the
> host - it should be your school's Canvas address (often something like
> https://canvas.yourschool.edu), not the school's main website.

This is the outcome E-UX3 added and the one that matters most: it points the
user at the HOST, not the token, which is the actual mistake in the
marketing-site case. **Checked:** `classifyCompletedExchange` reaches this
branch for a completed exchange that is neither 401/403 nor a valid 200
Canvas self-record - including a 200 with an HTML or wrong-shaped JSON body,
and (a deliberate collapse, documented in that module's own header) a 404,
429, or 5xx of any kind, since this module has no reliable way to tell "this
is Canvas, having a bad moment" from "this is not Canvas at all," and getting
that guess wrong in the optimistic direction is worse than the reverse.

### 4. `"host-not-allowed"` - refused by this app's own rules

> {the outcome's own `reason` string, rendered verbatim}

**Render the `reason` field exactly as given - do not paraphrase it a second
time.** It already comes from `validateLmsBaseUrl`'s own `REASON` constants
(`src/lib/lms-credential-rules.ts`) or `canvasFetch`'s own same-origin
redirect refusal text (`src/lib/canvas-fetch.ts`), both already written for
this exact audience and both already exercised by their own modules' test
suites. A second, independently-worded copy of the same idea living in this
document is precisely the "two copies that must agree" drift
`lms-credential-rules.ts`'s own header warns about for a different pair of
rules - the fix here is the same one: there is exactly one place this text is
authored, and it is not this file.

### 5. `"unreachable"` - the network layer never got an answer

> We could not reach that host. Check the address is correct, or try again in
> a few minutes.

Deliberately does not distinguish DNS failure, connection refused, TLS
failure, or a timeout - SEC9's whole point is that timing and wording must
not let a user tell these apart, because doing so turns this form into a
port scanner against the public internet. **Checked:**
`unreachableAtDeadline` (`src/lib/canvas-fetch.ts`) collapses every one of
those causes into the single `{ kind: "unreachable" }` result before this
outcome is ever produced, and pads every one of them to the same fixed
deadline regardless of how quickly the real failure actually occurred.

### 6. `"rate-limited"` - too many recent attempts (SEC9)

> You have tried to connect several times in a row. Wait a few minutes and
> try again.

**Checked:** `mayAttemptLmsCredentialSave`
(`src/lib/lms-credential-save-limit.ts`) refuses the 6th attempt inside a
rolling 10-minute window (`LMS_CREDENTIAL_SAVE_LIMIT_MAX_ATTEMPTS = 5`,
`LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS = 600000`). The message deliberately
does not quote an exact retry time computed from the decision's `retryAtMs` -
a page MAY compute a friendlier "try again in about N minutes" from that
field if it wants to, but the copy itself must not imply a precision (an
exact second) this is not a promise about.

### Two outcomes beyond E4's four - needed because this feature's own design introduces them, not asked for by the AC's enumerated list

Recorded here in the open, the same way `docs/account-people-copy.md` records
strings the sheet did not originally have and the build needed anyway - both
of these follow directly from decisions made while building the pure
modules, not from a new requirement.

**`"rejected"` is already outcome 2 above** - not repeated here.

**`"save-failed"` - the probe succeeded, but saving it did not.**

> That token checked out, but we could not save the connection. Nothing was
> stored - please try again.

This must never borrow any of outcomes 1 through 4's wording. The user did
everything right; the token is proven good; the failure is this app's own
database write, not Canvas and not their input. Saying "nothing was stored"
is load-bearing - without it, a user who sees a failure after already reading
"Connected as ..." on their screen for a moment could reasonably believe the
credential is half-saved. **Checked:** `saveLmsCredential`
(`src/lib/lms-credentials.ts`) throws on a write failure rather than
returning a partial result, so a caller reaching this outcome knows nothing
was written - a thrown `Error`, not a row with some fields set.

---

## E-UX7's three sentences

Not asked for by any single AC bullet, and the ones an implementer is most
likely to skip because nothing forces them into existence the way a status
string does. Shown together, once, near the Replace and Delete controls -
not buried in a tooltip.

> The token you are replacing keeps working until the new one is confirmed.
> If the new one fails to verify, nothing changes - your current connection
> is untouched.
>
> Replacing or deleting a connection here does not revoke the token in
> Canvas itself. If you are rotating a token because it may have leaked, also
> delete or regenerate it from inside Canvas - this app has no way to do that
> for you.

**Checked, sentence by sentence:**

- **"The token you are replacing keeps working until the new one is
  confirmed."** `saveLmsCredential` (`src/lib/lms-credentials.ts`) is only
  ever called by the save flow AFTER `classifyCanvasProbeOutcome` has already
  returned `"verified"` for the NEW token - there is no step anywhere that
  clears or marks the existing row before the new one is proven. The old row
  is a live, working credential right up until the single `upsert` call that
  replaces it succeeds.
- **"If the new one fails to verify, nothing changes."** Direct consequence
  of the same fact: any outcome other than `"verified"` never reaches
  `saveLmsCredential` at all, so the existing stored row - encrypted token,
  `token_last_four`, `canvas_user_id`, everything - is never touched.
- **"Replacing or deleting a connection here does not revoke the token in
  Canvas itself."** Verified by grep, not assumed: `grep -rn "revoke" -i
  src/` (case-insensitive, whole repository) returns exactly one file with
  any match at all beyond this feature's own new code -
  `src/lib/google-credentials.ts:126`, a code comment about a Google refresh
  token possibly being "revoked" BY GOOGLE, externally, with no call this app
  makes. Every other "revoke" hit across the codebase is `URL.revokeObjectURL`
  in unrelated blob-handling code (video/caption/file-preview components),
  which frees a browser object URL and has nothing to do with credentials.
  There is no Canvas token-revocation endpoint call anywhere in `src/lib/canvas-fetch.ts`,
  `src/lib/canvas-core.ts`, or `src/lib/lms-credentials.ts` - `deleteLmsCredential`
  (`src/lib/lms-credentials.ts`) only ever runs a `delete` against this app's
  own `lms_credentials` table. Canvas's own token record on the institution's
  server is untouched by anything this app does.

**Never say "secure" or "encrypted end-to-end" here or anywhere on this
surface** - this is the concrete case that rule exists to prevent. The
honest, checkable claim is "the OLD token still works until the new one is
proven" and "nothing here reaches into Canvas to revoke anything" - both
demonstrated above by reading the actual call graph, not asserted as a
property of encryption, which addresses none of it.

---

## The Replace flow

**Button:** Replace

**Confirmation is not required before submitting a new token** - unlike
delete, replace has no destructive moment until the moment the new token is
already proven to work (see E-UX7 above), so there is nothing to confirm in
advance. What runs is E4's own probe again, using `classifyCanvasProbeOutcome`
exactly as a first-time save does; render the outcome using the six-outcome
table above, unchanged.

**On success:**

> Connected as {canvasUserName or the Canvas-user-id fallback}. This replaces
> your previous connection for {institution}.

**Checked:** `saveLmsCredential`'s own doc comment
(`src/lib/lms-credentials.ts`) confirms `token_last_four`, `canvas_user_id`,
`canvas_user_name` and `last_verified_at` are all recomputed from the fresh
token on every call, including a replace - the row a page reads immediately
afterward reflects the NEW token in full, never a stale mix of old and new
fields.

---

## The Delete flow

**Button:** Delete (matches AES-3's `.remove` -> the stronger word, not
"Disconnect" - see the vocabulary section above)

**Confirmation dialog**, because E5 explicitly wants this control easy to
reach, not hidden behind a menu - but reachable is not the same as
consequence-free:

**Title:** Delete this Canvas connection?

**Body:**

> This removes your saved Canvas connection for {institution} from this app.
> Anything here that reads or updates {institution}'s Canvas data on your
> behalf will stop working until you connect again.
>
> This does NOT revoke the token in Canvas, and does NOT remove
> {institution} from your list of schools - only the connection itself. If
> you are deleting this because the token may have leaked, also delete or
> regenerate it from inside Canvas.

**Buttons:** Cancel / Delete connection

**Checked:**

- **"Removes your saved Canvas connection... immediately"** matches
  `deleteLmsCredential`'s own doc comment (`src/lib/lms-credentials.ts`):
  "no soft delete, no tombstone" - a hard `delete` against the row, not a
  status flag a page has to interpret.
- **"Does NOT revoke the token in Canvas"** - the same grep result cited
  under E-UX7 above.
- **"Does NOT remove {institution} from your list of schools"** - the
  acronym registry (`src/lib/institutions.ts`, browser `localStorage`) and
  the credential row (`public.lms_credentials`, per-user server storage) are
  two independent stores with no code path connecting a delete in one to the
  other. This mirrors the resolution the data-engineering pass gave for the
  REVERSE question (DAT1/E-ADM9's amendment: "the acronym registry is a
  DISPLAY FILTER, the credential row is the CONNECTION; removal never
  touches a credential") - applied here in the other direction, which the AC
  does not spell out explicitly but which is the same underlying fact: two
  independent stores mean neither ever silently touches the other, in
  either direction.

---

## The needs-re-entry state (AES-5's second pill)

Shown on a row whose `needsReentry` is `true`
(`src/lib/lms-credential-view.ts`) - a stored credential whose last diagnostic
outcome was `"rejected"` or `"unreadable"`, never `"host_unreachable"` (see
that module's own doc comment for why: a network hiccup is not something a
fresh token fixes, and re-badging it as "needs re-entry" would send a user
through the Replace flow for a problem no token can solve).

**Pill text:** Needs reconnecting

**Row detail line (not a hover-only title - E-UX9 names exactly this failure
mode for a different string, and this sheet does not repeat it):**

> Canvas stopped accepting this connection. Replace it with a current token
> to restore access.

Deliberately does not say WHY (rejected vs. unreadable/decrypt failure) - a
member cannot act differently on the two (both are fixed the same way: paste
a fresh token), and `LmsCredentialFailureKind`'s own design
(`src/lib/lms-credentials.ts`) already treats `"unreadable"` (this process
could not decrypt the stored value) as something that "collapses into the
same... 'please reconnect'" state as "not connected" for exactly this reason
- a caller that cannot tell the two apart cannot accidentally treat one as
more fixable than the other, and neither should the copy.

---

## E-UX9 / E-UX10 - three strings that lie today, and their replacements

### Lie 1 - "Set env" (`src/app/components/TopBar.tsx:180`)

```
{st ? (st.canvasConfigured ? "Ready" : "Set env") : "..."}
```

An instruction only the deployment owner can act on, shown to every
member who opens this menu, with its only explanation (line 174-179's
`title={... "Canvas configured" / "missing env" ...}`) sitting in a hover
tooltip a keyboard-only or touch user never sees at all.

**Replacement:** stop describing the ENVIRONMENT and describe the VIEWER'S
OWN ACCESS instead - the fact this feature actually makes true per-user.

> {connected: "Connected"} / {not connected: "Not connected"}

with a VISIBLE (not title-only) secondary line for the not-connected case:

> Connect your own Canvas account for {code} in Settings, then Integrations.

Never named as an env var, never phrased as an instruction the reader cannot
carry out themselves - this is the exact fix E-UX9 asks for, applied to the
literal string it names.

### Lie 2 - "Ready" (same line, same file)

The sibling half of the same chip: `canvasConfigured` is `!!process.env[...URL]
&& !!process.env[...API_TOKEN]` (`src/app/actions/course-hub-integrations.ts`,
`checkInstitutionsAction`, lines 159-160) - two environment strings being
non-empty, never an actual call to Canvas. A typo'd token reports "Ready"
exactly as confidently as a working one.

**Replacement:** the same "Connected" / "Not connected" pair above already
fixes this, because it stops asking "are two env strings present" and starts
asking "does the current viewer have a working, E4-verified connection" -
which for a stored per-user credential IS a claim this app can actually back,
since E4's probe is what LED to the row existing at all.

**What this sheet cannot specify:** exactly how the code computing this
chip's state should be re-derived per-viewer (own stored row, or - for an
owner - the env fallback per E10) is an implementation question for whoever
edits `TopBar.tsx` and `course-hub-integrations.ts`, neither of which are in
this change's file set. This sheet specifies the STRINGS the corrected logic
must produce, not the logic itself.

### Lie 3 - the KnowledgeTab sentence (`src/app/components/KnowledgeTab.tsx:527`)

```
Registering an acronym here does not grant Canvas access - that still needs
the institution's server-side env vars, configured separately.
```

True today (env vars are the ONLY path to Canvas access), and false the
moment this feature ships: a member can now also grant themselves real
Canvas access for that acronym by connecting their own credential, with no
env var involved at all.

**The AC's own instruction is to delete this sentence outright** ("must be
deleted in the same change"). This sheet's recorded disagreement, argued
rather than silently overridden: the FIRST half of the sentence ("registering
an acronym here does not grant Canvas access") remains true after this
ships - adding an acronym to the local list still does not, by itself,
connect Canvas; a separate step still does. Deleting the whole sentence loses
that still-true, still-useful warning along with the now-false second half.
Proposed replacement, keeping the true half and fixing the false one:

> Registering an acronym here only adds it to your list - it does not
> connect Canvas by itself. Connect your own Canvas account for this school
> in Settings, then Integrations.

**If the AC's literal instruction is preferred instead, deleting the
sentence with no replacement is also consistent with E-UX10** - this sheet
states both options rather than picking silently, because it is a real
disagreement about scope (keep a true half vs. follow the instruction as
written), not a drafting error either way.

---

## What this sheet could not fully justify from the code

**The exact minute-count phrasing for the rate-limit message** ("wait a few
minutes") is deliberately vague rather than computed, because the module
(`src/lib/lms-credential-save-limit.ts`) returns a `retryAtMs` instant, not a
duration, and turning that into "N minutes" requires a `now` reading this
document does not have. If a page wants a precise countdown, it can compute
one from `retryAtMs`; this sheet does not specify that number itself.

**The Canvas navigation path** ("Account, then Settings, scroll to Approved
Integrations, then New Access Token") describes Canvas's own standard UI, not
this codebase, and is flagged in its own section above as something this
repository's tests cannot verify or keep from going stale.

**Whether "Needs reconnecting" is the ideal pill word**, as opposed to
"Needs attention" or similar: chosen to match this app's own existing
"reconnect" vocabulary (`google-credentials.ts`, `microsoft-credentials.ts`,
`lms-credentials.ts` doc comments, and the Outlook section's own "Reconnect"
button on this same page all already use the verb "reconnect" for the
identical concept), not derived from any single cited requirement.
