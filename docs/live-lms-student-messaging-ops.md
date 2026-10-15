# Live-LMS student messaging - W2: security / reliability / ops design

Companion to `docs/live-lms-student-messaging-scope.md` (the scope; its wave W2,
section 7, and its residual RES-LMS-5). Backlog row LIVE-LMS-STUDENT-MESSAGING.
Seat: security + reliability + operability design pass (loop-seat). Read-only: no
production code, no tests written. Consumer: the W3/W4 plan, test and build seats.

Tree state measured: `git rev-parse --short HEAD` -> `5e0e3ee7` (the scope was
written at c8586eeb; every file cited below was re-opened at this HEAD). All line
counts: `@(Get-Content <file>).Count` in PowerShell (never Measure-Object -Line).
Every `file:line` below was opened directly; the few things I did NOT open are
named in section 9.

REVISION 2 (applies the round-1 check aa106868; see section 11 for exactly what
changed and what was left intact). Re-verified at HEAD `7a668112`
(`git rev-parse --short HEAD`): `git diff --stat 5e0e3ee7 HEAD -- src/lib/canvas-core.ts
src/lib/supabase/auth.ts src/lib/session-diagnostic-log.ts src/lib/canvas/inbox.ts
src/lib/canvas-credentials.ts` printed nothing, so every `file:line` into those files
below is unchanged since the first pass. (In this document `canvas-core.ts` means
`src/lib/canvas-core.ts` and `auth.ts` means `src/lib/supabase/auth.ts`.)

This pass triggers four seats from `docs/loop/seats.md` triage: Security (new
server actions, new egress), Reliability (a batch job with a non-error failure
mode), Operability (owner-configured limits, audit), and it OWES a Data/storage
pass (section 3, R6 ledger) that has not run - recorded as residual R-W2-7.

---

## 0. Premises corrected from the tree (read before the design)

The brief and the scope each carried a statement the tree does not support. The
design below is built on the tree, not on those statements.

| # | Brief / scope said | Tree says | Evidence (command or file:line) |
|---|---|---|---|
| P1 | assert via `institutionForUrl` | It is a MODULE-PRIVATE function: `function institutionForUrl` with no `export`. Only caller is `resolveInstitution`. The assertion must go through the exported `resolveInstitution` (async, also reads the credential) or W4 must add an export. | `canvas-core.ts:60` (definition), `canvas-core.ts:131` (only use); `grep -rn institutionForUrl src` returned exactly those two lines |
| P2 | "mapWithConcurrency exists, listings imports it :37" | `submissions-grid.ts:37` imports it, not `listings.ts` (its imports are `listings.ts:5-7`: canvas-core, canvas-remote-url, canvas-fetch-response). The server copy in `fetch-helpers.ts` has NO error isolation: one rejecting `fn` rejects `Promise.all`, so every other result is lost. | `canvas-modules/fetch-helpers.ts:192-204`; `listings.ts:5-7` |
| P3 | `createConversation` sends to "an institution" chosen by code | It sends to the institution whose HOST matches the course URL in the hardcoded registry, and that registry has ONE entry (MCC). A credentialed institution that is not in `CANVAS_INSTITUTIONS` can be READ (via `resolveInstitutionByCode`) but a send through `createConversation` throws the generic credential-required error. | `canvas-core.ts:55-57`, `canvas-core.ts:126-137`, `inbox.ts:391`; read path `canvas-core.ts:174-201` |
| P4 | recipient is "a student id" | `recipientUserId` is appended RAW to `recipients[]`. A value such as `course_123` turns the per-student send into a course broadcast. The builder next door validates its recipient (`COURSE_RECIPIENT_PATTERN`); this one validates nothing. | `inbox.ts:400` (raw append), `inbox.ts:427` (the sibling's pattern) |
| P5 | "inside Vercel 60s maxDuration" | `maxDuration` is honoured for Server Actions ONLY at page level, and `src/app/page.tsx` declares none and cannot (the repo records that a value above 60 fails the Hobby build). So a Server Action here has the platform's UNCONFIGURED default, not 60s. Route Handlers can declare 60. | `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md:16-18`; `app/api/course-intel/ask/route.ts:47-61`, `:134`; `actions/command-interface.ts:26-32` |
| P6 | readers are safe to fan out | `listings.ts` readers STOP SILENTLY at 20 pages (`while (next && pagesFetched < CAP)` exits with `next` still set and no signal). `submissions-grid.ts` THROWS at the same cap. | `listings.ts:292`, `:327`, `:365`; `submissions-grid.ts:225-229`; `canvas-remote-url.ts:156` (`= 20`) |
| P7 | `requireAppOwner` is "the owner gate" | It is, and ALSO runs an AAL2 step-up check and honours an impersonated owner identity (the unattended runners). Both matter below. | `auth.ts:193-200`, `auth.ts:408-434` (impersonation branch `:409-415`) |
| P8 | an existing per-student send action can be reused | `sendCanvasMessageAction` is NOT exported and is guarded by the deprecated `requireOwner()` (an alias of `requireUser()`). Nothing to reuse. | `actions/messaging.ts:254-269`; `auth.ts:451-453` |
| P9 | `createConversation` returns the 3-state result | It returns `Promise<void>` and throws on non-ok; the wrapper cannot recover the HTTP status except by parsing human error strings (see R5). | `inbox.ts:384-420`; `canvas-core.ts:101-115`; `canvas-fetch-response.ts:131-137` |

The proposed new names in this doc (`sendStudentConversation`,
`live_message_sends`, `live-messaging*`) are absent from the tree:
`grep -rn "sendStudentConversation\|live_message_sends\|live-messaging" src supabase .github`
exited 1 with no output. (The only `LiveMessag` hits in `src` are an unrelated
`liveMessage` state variable in `AiChatFab.tsx:185`.)

Baseline of the five existing tests this design leans on, at HEAD, through the
wrapper (`npm run test:paths <5 paths>`), all green before any change:

```
COVERED src/lib/session-diagnostic-log.test.ts files=1 passed=35
COVERED src/lib/canvas/inbox.test.ts files=1 passed=35
COVERED src/app/actions/action-guard-coverage.test.ts files=1 passed=15
COVERED src/app/components/bulk-course-message/bulk-course-message.wiring.test.ts files=1 passed=35
COVERED src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts files=1 passed=6
```

---

## 1. Decision register

Each decision says who owns it. "Design" = this pass decides and the checker may
attack it. "Owner" = a policy/ops call; a recommended default is given, it is
NOT a measured or Canvas-documented fact.

| ID | Decision | Recommended | Kind | Cost if wrong |
|---|---|---|---|---|
| D1 | Send primitive: a NEW typed-outcome sender `sendStudentConversation` in `inbox.ts` (P1-option) vs literally wrapping `createConversation` (P2-option) | New sender. `createConversation` stays byte-unchanged (its shape is pinned by `inbox.test.ts:503`). | Design (deviates from scope F1's "wrap") | If the checker prefers a literal wrap, use the drift-pinned message table in R5 section "Fallback"; no other section changes |
| D2 | Durable per-recipient ledger (a Supabase table) vs browser-only ledger | Durable ledger; ids + status + digest only, no names, no bodies | Owner + Data seat | Without it a reload mid-batch loses which students were messaged and the owner can double-send; the browser-only fallback (tier 0, R6) keeps the same state machine with weaker durability |
| D3 | HTTP 429 on the student POST -> `refused` (retryable) | Yes, the ONE deliberate divergence from `createCourseConversation` (R5) | Design | If Canvas ever applies a write and still answers 429, a retry duplicates a student message; fallback is mapping 429 -> `unknown` (one-line change, pinned by P7) |
| D4 | Send is reachable only for hosts in `CANVAS_INSTITUTIONS` (today: MCC) | Keep (fail closed, Send disabled with a stated reason for other credentialed institutions). Do NOT widen the host registry inside a messaging feature. | Owner (ties to RES-LMS-7) | A second institution is readable but unsendable until it is registered |
| D5 | Free-text columns (Student search) are NOT persisted across reload | Not persisted (names must not sit in localStorage) - an exception to the persist-every-control habit | Owner confirm | Search text is lost on reload; a persisted name is PII at rest in the browser |
| D6 | Limits (section 6, table L) | The defaults listed there | Owner/ops | Tunable constants in one leaf; no migration needed to change them |
| D7 | Typed confirmation (type the institution code) before Send | Not required by default; the count-labelled confirm button + digest is the gate | Owner | A one-click confirm is a lower bar for an irreversible act |
| D8 | (REVISION 2, Finding 1) How a stuck `sending` row is kept from becoming a double send | BOTH: step Z persists stale `sending` -> stored `unknown` (so the stored status is truthful), AND the duplicate lookup treats `sending` of any age as possibly-sent | Design (round-1 check finding) | Reconcile-only leaves the young-`sending` window open; lookup-only leaves the ledger lying until retention. One of the two alone is the fallback; each is pinned separately (P33a, P33b) |

---

## 2. SECURITY

### S1. The one-institution send guarantee

**What the check found, restated from the tree.** The guarantee does not live in a
single-code input type: `createConversation` derives the institution from the
course URL's HOST (`inbox.ts:391` -> `canvas-core.ts:126-137` ->
`institutionForUrl` `canvas-core.ts:60-68`), never from a code field. So a type
`{institutionCode; targets[]}` constrains nothing by itself. The guarantee is
therefore built from CONSTRUCTION first and a runtime ASSERTION second.

**Construction (the bad state made unrepresentable).**
- The wire type carries NO URL and NO host: `targets: {courseId: string;
  recipientUserId: string; body: string}[]` plus ONE `institutionCode` and one
  `subject`. The server derives every course URL itself:
  `courseUrl = <baseUrl from resolveInstitutionByCode(code)>/courses/<courseId>`.
  A client cannot name a second institution because there is no field to name it in.
- Ids are numeric-only strings, so a `course_<n>` / group / list recipient cannot be
  expressed (closes P4; precedent `inbox.ts:427`).
- The validated result is returned as a branded `ValidatedBatch`; the send loop and
  the per-recipient unit accept ONLY that type, so the assertion cannot be skipped by
  a later caller (the seat checklist's "construction over assertion", `seats.md`
  Acceptance-criteria checker, second bullet: replace the assertion with a
  CONSTRUCTION that makes the bad state unrepresentable).

**The runtime assertion `assertSingleInstitutionBatch(input)`** (server-only leaf,
imported by the action file; NOT itself an export of the "use server" file).
Order is fixed; ANY failure in steps 1-6 refuses the WHOLE batch and nothing is sent:

1. `code = institutionCode.trim().toUpperCase()` must match
   `/^[A-Z0-9][A-Z0-9_-]{0,15}$/`. (The client registry accepts any non-empty string,
   `institutions.ts:68-77`, and the list lives in localStorage `institutions.ts:14`,
   so the server treats the code as untrusted input.) -> `invalid-institution`.
2. `1 <= targets.length <= MAX_BATCH_RECIPIENTS` -> `batch-size`.
3. Per target: `courseId` and `recipientUserId` each `/^\d{1,12}$/`; `body` a
   non-blank string `<= BODY_MAX_CHARS`; `subject <= SUBJECT_MAX_CHARS`; no unresolved
   `{{token}}` left in subject or body (a template that was not fully rendered must
   never leave the building) -> `invalid-target` with an OFFENDER COUNT only.
4. `(courseId, recipientUserId)` unique within the batch -> `duplicate-target`.
5. Resolve ONE credential by code: `resolveInstitutionByCode(code)`
   (`canvas-core.ts:174-201`). Throw equal by identity to
   `CANVAS_CREDENTIAL_REQUIRED_MESSAGE` -> `not-connected`; any other throw ->
   `unavailable` (never reported as "not connected": that tells the owner to
   reconnect an account that is merely unreachable - the four-state rule the
   course-intel route already follows, `app/api/course-intel/ask/route.ts:92-111`).
6. For each DISTINCT `courseId`: build `courseUrl` as above and call
   `resolveInstitution(courseUrl)` (`canvas-core.ts:126`); require
   `result.institution.code === code`. A thrown credential-required error here means
   the derived host is not in `CANVAS_INSTITUTIONS` -> `institution-not-sendable`
   (this is P3 surfacing as a clean, fail-closed refusal). A resolved but different
   code -> `institution-mismatch`. Cost: one credential read per distinct course
   (a handful), bounded by the credential read's own 5s ceiling
   (`canvas-credentials.ts:107`).
   - Alternative that avoids the extra credential reads: W4 exports
     `institutionForUrl` (a one-word change at `canvas-core.ts:60`, pure, no I/O).
     Then `canvas-core.test.ts` and `canvas-client-boundary*.test.ts` join the wave
     gate. Default: do NOT edit the shared file; use `resolveInstitution`.
7. One more fail-closed check that belongs to the guarantee because numeric ids are
   instance-scoped: every `courseId` must appear in the owner's active teacher
   courses for `code`, read live at this step (`listActiveTeacherCourses`
   `listings.ts:133`, one paged read, bounded by the 25s unit budget in R7) ->
   `course-not-in-institution`. A stale selection carried from institution A into
   institution B can otherwise name an id that exists in both numeric spaces.

Prepare and Start run steps 1-7. The per-recipient unit (R6) runs steps 1-6 on a
one-element batch BEFORE the ledger claim, so a unit invoked directly (not through
Start) is held to the same host/institution guarantee. (Its code, courseId and userId
are read from the claimed ledger row, not supplied by the client - Finding 2 note under
I-BIND-3.) Step 7 is deliberately not
repeated per unit (it is a paged read; 57 of them would be waste); its guarantee
reaches the unit through the digest instead, because the digest covers code,
courseId and userId (I-BIND-3, P20): a unit whose courseId was not in the Prepared
set cannot reproduce the ledger digest and is refused.

**Error shape** (precedent: `bulk-course-message.ts:19-49`, a discriminated union
with fixed copy in a non-exported `satisfies Record<Kind, string>` table):

```
type LiveSendRefusalKind =
  | "not-authorized" | "invalid-institution" | "not-connected" | "unavailable"
  | "institution-not-sendable" | "institution-mismatch" | "course-not-in-institution"
  | "invalid-target" | "duplicate-target" | "batch-size" | "digest-mismatch"
  | "ledger-unavailable";
type LiveSendRefusal = { status: "refused"; kind: LiveSendRefusalKind;
                         reason: string /* fixed copy */; count?: number };
```
The copy never echoes a host, a URL, an id or a Canvas string (the enumeration-oracle
rule in `canvas-core.ts:117-125` and `canvas-credentials.ts:54-71`). `count` is an
offender count and nothing else. The union is exported as a TYPE only; the copy table
is not exported (a "use server" module may export only async functions - the rule
`src/lib/use-server-exports.test.ts` enforces).

**Source-text boundary (pins P3, P5, P18).** Precedent for the pattern:
`classTrendsDraft.not-postable.test.ts` (value-import walker with a prefix predicate,
`:46-58`, canary structure `:150-256`) and the AST scanners in
`bulk-course-message.wiring.test.ts` (`findFunction` `:50`, the broadcast builder's
body scan `:408-414`). The walker alone is the WRONG instrument here and I am not
copying it unchanged: `inbox.ts` itself exports the broadcast
(`createCourseConversation`), so any value-import of `@/lib/canvas/inbox` reaches it
at module granularity. The pin must be symbol-level:
- the walled set = every file matching `src/app/actions/live-messaging*.ts` and
  `src/lib/live-messaging/**` (derived by a glob in the test, with a non-vacuity
  assertion `length >= 1` and a planted-fixture canary);
  - **Glob completeness is NOT proven by that floor (round-1 check, LOW).** `length >= 1`
    shows the glob matched something, not that it matched everything that can reach a
    send; a send-reaching action named outside these two patterns is invisible to
    P3/P10/P11/P12/P18. Obligation: the plan/W3 seat MUST replace the glob-by-pattern
    with a pin of the walled glob to the ACTUAL built file set, re-derived after W3
    names its files (not predicted now), and the verify seat re-rules that set against
    the built diff (`git diff --name-only <base>..HEAD` filtered to files that reference
    any of `sendStudentConversation`, `requireAppOwner`, `sendLiveMessageAction`; any
    file in that result outside the walled set is a finding). The `>= 1` floor and the
    planted-fixture canary stay as they are for now. Measured at HEAD `7a668112`:
    `ls src/lib/live-messaging` lists 12 files (six W1/W3-logic leaf modules plus their six tests: connected-institutions,
    enrollment-aggregator, enrollment-readers, pager, table-filter-model,
    template-substitution) and `ls src/app/actions | grep -i live`
    lists only `live-class*` (unrelated), so no `live-messaging*.ts` action file exists
    yet - the action half of the glob is currently empty and must be filled by W4.
- the NAMED imports from `@/lib/canvas/inbox` across the walled set equal exactly
  `["sendStudentConversation"]` (AST import-specifier extraction, as
  `valueImportSpecifiers` in the two precedents does);
- the identifiers `createConversation` and `createCourseConversation` and the barrel
  specifier `@/lib/canvas` (whose `canvas.ts:100` re-exports `createConversation`)
  appear in no file of the walled set (AST identifiers/specifiers, not substrings -
  comments may legitimately mention them);
- inside `inbox.ts`, the AST body of `sendStudentConversation` appends exactly the
  parameter keys `{recipients[], body, subject, context_code, force_new}` and no
  string literal beginning `course_` is ever appended to `recipients[]`.

### S2. Owner gating - every entry point

All live Canvas reads and every send-side action call `requireAppOwner()`
(`auth.ts:408`), never `requireOwner()` (deprecated alias of `requireUser()`,
`auth.ts:451-453`) and never a bare `requireUser()`. The brief mandates this; note it
is STRICTER than the sibling feature (`sendBulkCourseMessageAction` uses
`requireUser`, `bulk-course-message.ts:105`, because credential containment sits in
`resolveCanvasCredential`, `canvas-credentials.ts:183-187`). The stricter gate is the
right call for an irreversible student-facing send and is a deliberate cost: an
instructor account holding its own stored credential cannot use this feature.

Enumerated entry points (names illustrative; the plan seat fixes them - the INVARIANT
is "the exported-async-function set of the live-messaging action file(s) equals the
pinned set below, each guarded"):

| # | Action | Purpose | Reaches |
|---|---|---|---|
| A1 | `listLiveInstitutionsAction(codes)` | connected / sendable flags per registered code (S5) | credential resolver, host registry |
| A2 | `listLiveCoursesAction(code)` | active teacher courses with term | Canvas read |
| A3 | `loadLiveCourseUnitAction(code, courseId, unit)` where unit is `roster`/`grades`/`sections`/`missing` | one reader for one course (R7) | Canvas read |
| A4 | `prepareLiveMessageBatchAction(input)` | server dry-run: assertion, caps, reconcile (R6 step Z), duplicate-suspect lookup (R6 predicate DUP), returns digest; sends nothing | Canvas read, ledger write (reconcile only), ledger read |
| A5 | `startLiveMessageBatchAction(input, expectedDigest)` | reconcile + RE-RUN the duplicate lookup at insert time (the authoritative guard; Prepare's is advisory), then creates the ledger rows (pending) | ledger write |
| A6 | `sendLiveMessageAction(batchId, recipientKey, subject, body)` (REVISION 2: `subject` added, Finding 2) | ONE recipient: claim, POST, settle. `code`, `courseId`, `userId` are read from the claimed LEDGER row, never from the client; `subject` and `body` come from the call, are digested against that row (I-BIND-3), and are the strings POSTed | ledger write, the only Canvas POST |
| A7 | `getLiveMessageBatchAction(batchId)` | reconcile stale `sending` (R6 step Z), then poll: per-recipient statuses (keys + status, no names) | ledger write (reconcile only), ledger read |
| A8 | `requeueRefusedLiveMessagesAction(batchId)` | refused -> pending again (explicit, bounded attempts) | ledger write |

Pins (P10-P12):
- **P10** the set of `export async function` names in the walled action files, derived
  with the same extraction as `action-guard-coverage.test.ts:118-143`, equals the
  pinned list; EACH body textually contains `requireAppOwner(` and neither
  `requireOwner(` nor `requireUser(` (same semantics as the OWNER_ONLY messages
  `:401-412`); the first awaited statement of each body is the guard. W4 also adds all
  eight names to the `OWNER_ONLY` map (`action-guard-coverage.test.ts:297`) with a
  per-name reason, so a later edit to `requireUser()` fails an existing ratchet, not
  only the new pin.
- **P11** the action files contain no `export const`, `export default`, `export {`
  or arrow-function exports. (An `export const f = async () =>` passes
  `use-server-exports.test.ts` yet is invisible to the guard ratchet's
  `/^export async function/` regex at `action-guard-coverage.test.ts:127` - a live
  unguarded endpoint; this is the blind spot `seats.md` Security checker names.)
- **P12** the send path is walled off from unattended execution:
  `requireAppOwner` honours the impersonated-owner branch (`auth.ts:409-415`), so an
  unattended runner that imported the send action would pass the gate with no human
  and no confirm. AST scan of `src/lib/workflows/**`, `src/app/api/cron/**`,
  `src/app/api/triggers/**`, `src/app/api/automations/**` for any value import of the
  walled set: must be empty. No new headless-safe step type is added
  (`headless.test.ts` stays untouched and green).
- **AAL2.** `assertAal2StepUp` (`auth.ts:193-200`) can throw
  "Multi-factor authentication required..." partway through a long batch. The unit
  catches it around the guard and returns `refused/not-authorized`; the client treats
  it as a PAUSE (never a retry loop, never counted as a student outcome). Nothing is
  sent on that path because the guard is the first statement.

### S3. PII, binding, storage, egress

**Data flowing.** Student names, ids, scores, missing counts (live read); a rendered
per-student message body (send). Where each may go:

| Data | Canvas | Supabase | Browser localStorage | Any other endpoint |
|---|---|---|---|---|
| names, grades, missing counts, section | read from | NEVER stored | NEVER stored (memory only) | NEVER |
| rendered body (has grade etc.) and rendered subject | sent to | NEVER stored (only a sha256 digest covering both) | NEVER stored | NEVER |
| template (subject + body with tokens, no student data) | - | - | stored: `ta-` draft key | NEVER |
| selection | - | - | stored as opaque keys `courseId:userId` per institution code | NEVER |
| ledger row: batch id, code, courseId, userId, digest, status, http status, attempt, timestamps | - | stored (D2) | active batch id only | NEVER |

**Binding-correctness invariant (the attribution guarantee, the scope's L6).**
- I-BIND-1: `render(template, row)` is a pure function of exactly those two arguments.
  It reads no module-scope value, no other row, no cache.
- I-BIND-2: the batch builder maps rows -> messages with no shared mutable
  accumulator, so permuting the input rows permutes the outputs identically.
- I-BIND-3 (the only server-checkable half): each recipient's body is digested as
  `sha256(code \n courseId \n userId \n subject \n body)` at Prepare/Start and the
  per-recipient unit refuses (`digest-mismatch`, zero POSTs) when the subject and body it
  receives do not reproduce the ledger digest for THAT recipient key. A body swapped
  between recipients by an indexing bug is therefore rejected server-side even though the
  server cannot know what a "correct" grade is. REVISION 2 (Finding 2): the five digest
  inputs come from two places and A6's signature carries both halves - `code`, `courseId`
  and `userId` are read from the claimed ledger row (`institution`, `course_id`,
  `recipient_id` columns, R6), while `subject` and `body` are ARGUMENTS of A6 (`sendLiveMessageAction(batchId,
  recipientKey, subject, body)`). Before this revision A6 took no `subject`, so it could
  neither recompute this digest (P20) nor POST the subject the sender takes
  (`inbox.ts:399-406` appends `subject`); the two are now reconciled. The subject is
  NOT stored: the ledger keeps only the digest (no subject column, R6 ledger). Because the digest
  carries `body`, per-recipient uniqueness does not depend on the subject being unique.
  Data class of the subject: it is template text and non-PII IF the subject accepts no
  tokens; if the template UI lets the subject contain tokens (S1 step 3 already anticipates
  "unresolved token in subject or body"), the RENDERED subject can carry a student value
  and is then body-class data - in transit only, never stored, never logged (P18),
  never persisted client-side (P17). The rule is written for the worse case so it holds
  either way.
- I-BIND-4: an unresolved token is never rendered as `null`/`undefined`/`NaN`/`{{x}}`.
  `render` returns `{ok:false, missing:[...]}` and that row is excluded from the send
  (listed in Preview), never sent with a blank.
Pins P13-P16 (section 4). The scope's removal test (scope section 9) is P13: replace
per-row resolution with a first-row snapshot and the "bodies differ at exactly the
bound tokens" assertion must go red.

**Cross-institution leak review.**
- Draft: view-level (one `ta-` key), contains the TEMPLATE only. It carries no
  institution data by construction (tokens are unresolved until render), so persisting
  it across a switch leaks nothing. A draft may contain wording the owner wrote for one
  institution; the confirm dialog and Preview header therefore always show the
  institution code (S4).
- Selection: persisted per institution as `{v:1, byInstitution:{MCC:["c:u",...]}}`,
  written by an explicit field-by-field writer (not an object spread - the
  `seats.md` Data checker's spread question). On load it is INTERSECTED with the
  currently loaded dataset's keys; ids not in the dataset are dropped, never trusted.
  Canvas ids are instance-scoped integers, so the same `courseId:userId` string can
  exist in two institutions: the send payload builder takes the ACTIVE code and reads
  only that code's entry (P16), and the server re-checks course membership (S1 step 7).
- Cross-tab: `ta-active-institution` is shared across tabs and changes on a `storage`
  event (`institutions.ts:116-133`). A confirm dialog open in tab 1 while tab 2 switches
  institution must not send to the new one: the dialog holds a FROZEN code taken at
  Prepare, the Start payload uses the frozen code, and Start is blocked while
  `active !== frozen` (part of the P19 truth table).
- Persisted `ta-` keys, as an exact set pinned by P17: the draft (subject + body
  TEMPLATE), the per-institution selection (opaque keys), the active batch id (an
  opaque uuid, for the post-reload poll, R6), plus the existing active-institution key.
  Filter state on categorical/numeric columns may persist (the L3 idiom); nothing else.
- Not persisted: free-text Student search (D5), any rendered preview, any dataset, any
  per-student value. Dataset cache is hook/component state, not a module-scope `let`
  (precedent assertion `bulk-course-message.wiring.test.ts:427-429`; also the lint
  idiom in the `hubCache` memory) - so unmount drops it.

**Egress inventory.** Exactly two: (1) Canvas via `canvasRequest`/`canvasGet` to the
resolved credential's own `baseUrl` (SSRF/redirect/DNS-pin guards inherited,
`canvas-fetch.ts:316-324`, `canvas-fetch-response.ts:149-156`); (2) the app's own
Supabase ledger. Pin P18: no file in the walled set imports `lib/llm*`, `lib/gemini*`,
`lib/embedded*`; references the identifiers `fetch`, `XMLHttpRequest`, `sendBeacon`;
or contains a `console.` call (a log line interpolating a name or body is the
cheapest PII leak, and the unit's outcome travels in its return value, not a log).
Nothing in this feature calls a model; if a later wave adds "draft with AI", it must
pass its own review, because P18 will go red.

### S4. Preview + explicit confirm (mandatory, irreversible)

The Send control is the end of a gate, not a button. `canStartSend(state)` is a pure
leaf (P19) that returns `{ok:true}` only when ALL hold:
1. a Preview was rendered for THIS frozen snapshot (the exact bodies a person could
   have read), not for an earlier selection or template;
2. `prepareLiveMessageBatchAction` returned `ready` for that snapshot, with digest D;
3. the dataset age at Prepare is `<= DATASET_MAX_AGE_MS` (default 10 minutes; the
   passive cache TTL is shorter, R7, so an in-use dataset is always fresh enough);
4. `active institution === frozen institution`;
5. `1 <= recipients <= MAX_BATCH_RECIPIENTS` after Prepare's exclusions;
6. no send is already in flight for this snapshot (single-flight).
The confirm dialog states the institution code, the recipient count, how many were
excluded (and why), and the button label carries the count ("Send N messages to
<CODE>"). Start requires `expectedDigest`; the server recomputes the digest from the
Start payload and refuses on mismatch (`digest-mismatch`, zero rows created), so a
selection or template edit between Preview and Confirm cannot ride through.
Nothing auto-sends: the only call site of `startLiveMessageBatchAction` is inside the
confirm handler (AST reference-count pin P19b, a reading-claim approximation - no
component renders under vitest, `this-repo.md` section 2). Retry of refused rows
(A8) is a new outward send and passes through a fresh confirm showing its own count.
Whether to ALSO require typing the institution code is D7 (default: no).

### S5. Connected-institution resolution (scope W2 row)

`listLiveInstitutionsAction(codes)` takes the client's registered codes (each passes
the S1-step-1 pattern, at most 20), and for each returns
`{code, connected, sendable}`:
- `connected` = `resolveCanvasCredential(code)` (`canvas-credentials.ts:189`) resolves.
  The credential-required error, compared BY IDENTITY to
  `CANVAS_CREDENTIAL_REQUIRED_MESSAGE`, means `connected:false`; any other throw means
  `connected: "unknown"` (not "false" - a Supabase blip must not read as a revoked
  credential). A resolved credential proves a stored row/env pair EXISTS, not that the
  token still works; the first table read is the liveness probe and its failure is
  shown as a per-course failure (R7).
- `sendable` = `resolveInstitution("<baseUrl>/courses/1")` resolves with the same code
  (i.e. the host is in `CANVAS_INSTITUTIONS`), reproducing S1 step 6 without a batch.
  Today only MCC can be true (P3, D4). The switcher shows non-sendable institutions as
  read-only with the stated reason.

---

## 3. RELIABILITY / OPS

### R5. The send OUTCOME PARTITION (check finding F1)

**Why a naive wrap collapses.** `createConversation` returns `void` on any `response.ok`
(2xx) and throws `canvasError(status)` otherwise (`inbox.ts:417-419`); `canvasError`
special-cases only 401/403/404 and folds every other status into
`"Canvas request failed (HTTP N)."` (`canvas-core.ts:101-115`); and a transport failure
is thrown by `canvasFetchResultToResponse` as `"Canvas did not respond."` /
`"Canvas request refused: <reason>"` (`canvas-fetch-response.ts:131-137`). A wrap
therefore sees only {returned, threw-a-string}. It cannot tell a provable non-delivery
from a possible delivery without parsing prose, and it cannot even apply the
200/201-only acceptance rule because `void` covers all 2xx.

**Design (D1): `sendStudentConversation(courseUrl, recipientUserId, body, subject?)
-> Promise<StudentSendResult>` added to `inbox.ts` (500 lines at HEAD,
`@(Get-Content src/lib/canvas/inbox.ts).Count`; ceiling 1000).** It is
`createConversation`'s request, byte for byte, with the outcome made explicit, and a
hard PHASE BOUNDARY the wrap cannot express:

```
phase A (nothing has left the process)        any throw/invalid input -> refused
  - body non-blank, courseId parseable, recipientUserId /^\d+$/ , resolveInstitution(courseUrl)
phase B (the request may have been applied)   any throw            -> unknown
  - canvasRequest(POST /api/v1/conversations, form body identical to inbox.ts:399-406)
phase C (classify the answer)                 by response.status
```
`StudentSendResult` = `{status:"accepted"}` | `{status:"refused"; code; httpStatus?}`
| `{status:"unknown"; code; httpStatus?}` where `code` is one of an ENUMERATED set
(`ok`, `refused-pre-send`, `refused-http`, `refused-rate-limited`, `unknown-http`,
`unknown-no-response`) - no Canvas free text is carried anywhere (SEC4,
`canvas-fetch-response.ts:45-53`), so the result is PII-safe and testable by equality.

**The mapping (total over every HTTP status).**

| Observation | Class | Why |
|---|---|---|
| phase A failure (blank body, unparseable course, non-numeric recipient, credential/institution resolution throws) | refused `refused-pre-send` | nothing was sent |
| 200, 201 | accepted | mirrors `inbox.ts:480` (NOT "any 2xx": a 202/204 is `unknown`) |
| 400, 401, 403, 404, 422 | refused `refused-http` | mirrors `inbox.ts:481` |
| 429 | refused `refused-rate-limited` (retryable) | DELIBERATE DIVERGENCE (D3): `createCourseConversation` lets 429 fall to `unknown` (`:484`). The repo's own throttle comment states a 429/403 "is returned by Canvas BEFORE the write is applied" (`canvas-throttle.ts:153-156`); that is a repo-recorded belief about Canvas, not verified here (R-W2-1). |
| any other status: 5xx incl. 502/503/504, 3xx (redirect cap exhausted returns the real 3xx, `canvas-fetch.ts:326-330`), 408, 409, 202, 204, 1xx | unknown `unknown-http` | a gateway timeout after the application server accepted the POST is exactly the case that must not read as non-delivery (`inbox.ts:439-442`) |
| phase B throw: `unreachable` (timeout mid-flight, connection reset) | unknown `unknown-no-response` | indistinguishable from "delivered, answer lost"; the union cannot separate DNS-failure from timeout (`canvas-fetch.ts:151-154`) |
| phase B throw: `host-not-allowed` | unknown `unknown-no-response` | CONSERVATIVE: after a redirect hop the first POST may have reached Canvas, and the redirect loop REPLAYS the same method and body (`canvas-fetch.ts:316-324`); `createCourseConversation` also folds it into `unknown` (`inbox.ts:485-486`). Systematic misconfiguration is bounded by the circuit breaker (R6), not by claiming non-delivery. |
| throw while reading/handling the response after the POST completed | unknown | same reason |

Rules the result carries to the UI/job:
- `accepted` and `unknown` are TERMINAL for any automatic action; only `refused` is
  eligible for an explicit retry (R6). `unknown` is never auto-retried and never
  worded as sent or delivered (copy pin P30, precedent forbidden-word scan
  `bulk-course-message.wiring.test.ts:132-154`).
- The mapping is a pure function `classifyConversationPostStatus(status)` exported from
  the leaf and called by `sendStudentConversation`, so it is tested without a network.

**Pins P6-P9.** P6: for every integer status 100..599 the function returns exactly one
class (totality), with `accepted` exactly `{200,201}` and `refused` exactly
`{400,401,403,404,422,429}`. P7 (differential): drive the REAL `createCourseConversation`
and `sendStudentConversation` through the mocked `canvasRequest` harness already used
by `inbox.test.ts` for every status 100..599; the set of statuses where their classes
differ equals exactly `{429}` - a deliberate divergence stated as a test, not a
comment. P8: phase boundary - a pre-send input failure yields `refused` with ZERO
`canvasRequest` calls; a `canvasRequest` rejection yields `unknown`, never `refused`.
P4 (parity): the sender's POST body is string-equal to `createConversation`'s for the
same inputs, so it introduces no new request shape.

**Fallback (only if D1 is overruled): literal wrap of `createConversation`.** The wrap
must default every unrecognised throw to `unknown` and may only claim `refused` for an
exact-match list, built FROM the real producers rather than copied literals:
`A message needs a body.` and `Could not read a course from that URL...` (phase A,
`inbox.ts:390,395`) and `CANVAS_CREDENTIAL_REQUIRED_MESSAGE` -> refused;
`canvasError(401|403|404, inst).message` -> refused; `canvasError(s, inst).message`
matching `HTTP (\d{3})` -> classify `s` by the table above; `Canvas did not respond.`
and `/^Canvas request refused:/` -> unknown; return without throw -> accepted (unable
to enforce 200/201-only - record that weakness). Pin P9: for each producer, call the
REAL `canvasError`/`canvasFetchResultToResponse` and assert the wrap classifies its
output as the table says, so message drift reddens the test instead of silently
collapsing refused/unknown.

### R6. The send as a JOB

**Why not a synchronous batch action (P5).** A Server Action has the platform's
unconfigured default duration; the repo already learned this and moved every fan-out to
the browser, one invocation per item, "This function must NEVER loop over rows"
(`actions/command-interface.ts:26-32`; same convention
`content-tab/modules/useCommandInterface.ts:13-20`, concurrency
`COMMAND_APPLY_CONCURRENCY = 4` at `:165`). **Why not GitHub Actions / Vercel Cron:**
the send needs the interactive AAL2 session (`auth.ts:193-200`) and a human confirm;
unattended runners authenticate by impersonation, which S2/P12 deliberately walls off
from this path. **Why not a Route Handler with `maxDuration = 60`:** it would give an
explicit ceiling (`course-intel/ask/route.ts:134`) but loses the guard ratchet's
coverage (it scans `export async function` in "use server" modules,
`action-guard-coverage.test.ts:118-143`); recorded as the alternative if R-W2-2 shows
the Server Action default is too short.

**Shape: client-orchestrated, ledger-backed kickoff + work + poll.** Unit of work is
ONE recipient, so a platform kill loses at most one outcome and that one resolves to
`unknown`, never to a silent double-send.

```
Prepare (A4)  : reconcile stale 'sending' (Z), duplicate lookup (DUP), returns digest D, excluded[] ;
                writes ONLY the Z reconcile; creates no recipient row, sends nothing
Start   (A5)  : verifies D, reconcile (Z) + re-run DUP, inserts one 'pending' row per recipient -> batchId (kickoff)
Work    (A6)  : per recipient  read row -> digest check -> claim -> POST -> settle   (client pool, limit L)
Poll    (A7)  : reconcile (Z), then statuses by key ; used on reload and to reconcile a lost response
Requeue (A8)  : refused -> pending (explicit, attempt < MAX_ATTEMPTS)
```

**Recipient state machine.** `pending -> sending -> accepted | refused | unknown`.
- **Claim (the idempotency core).** After A6 has read its row and passed the digest
  check (below), it runs an atomic conditional update
  `status: pending -> sending` for exactly (batchId, recipientKey), `attempt += 1`,
  `claimed_at = now()` (DB clock), returning the affected row (exact shape: requirement
  CLAIM below). Zero rows affected means someone else holds it or it is
  terminal: A6 returns `{kind:"skipped", current}` and makes NO POST. A poll retry, a
  double click, two tabs, or the client re-invoking after a timeout all land here. The
  Canvas POST happens only after a successful claim. (Typed-row mapper rule applies:
  map rows through an explicit mapper, memory `supabase-types-never-rows`.)
- **Fail closed on the ledger.** If the claim write errors or exceeds its 3s race
  ceiling, A6 returns `refused/ledger-unavailable` and sends nothing. A claim that
  actually landed after the race timed out leaves the row `sending`, which is then
  reconciled to a persisted `unknown` (step Z) - the conservative direction (nothing was
  sent, but we do not claim it).
- **Settle.** After classification A6 writes the final status with the same ceiling, as a
  CONDITIONAL update (`... WHERE id = $id AND status = 'sending'`) so a late settle can
  never overwrite a row step Z has already moved to `unknown`. If the settle write
  fails (or matches zero rows), the unit still RETURNS the real result to the client, and
  the row is `sending`/`unknown` in the ledger - which the duplicate guard now treats as
  POSSIBLY SENT (predicate DUP below). This is the exact window round-1 Finding 1
  identified: an accepted POST whose settle write failed.
- **Stale `sending` - display AND persistence (REVISION 2, Finding 1).** A pure
  `effectiveStatus(row, now)` still renders a row that has been `sending` for longer
  than `SENDING_STALE_MS` as `unknown` (P22), but that is DISPLAY ONLY and the round-1
  check showed it is not enough: nothing persisted it, so after a reload the stored
  status stayed `sending` and the duplicate guard (which keyed on stored
  `accepted`/`unknown`) skipped it. Two changes, BOTH required (defence in depth):
  - **Step Z, the reconcile write.** A real write that persists stale `sending` to
    stored `unknown` BEFORE any duplicate lookup or resend. Requirement RECONCILE below.
  - **Predicate DUP covers `sending` itself.** The duplicate lookup treats a `sending`
    row of ANY age as possibly-sent, so the young-`sending` window (a settle failed
    less than `SENDING_STALE_MS` ago, or another tab is mid-send) is closed without
    waiting for step Z to age out.

**Data-seat requirements handed over (REVISION 2; these are load-bearing, not
housekeeping - see R-W2-7).** Names are illustrative; the PREDICATES and the
ATOMICITY are the requirement. All run as the owner (`owner_id = $o` is part of every
WHERE) and map rows through an explicit typed mapper.

- **Requirement RECONCILE (step Z).** One statement, idempotent, run at A4, at A5 (before
  the insert) and at A7:
  `UPDATE live_message_sends SET status = 'unknown', code = 'unknown-stale-claim',
  settled_at = now() WHERE owner_id = $o AND status = 'sending' AND claimed_at <
  now() - $SENDING_STALE_MS * interval '1 millisecond'`.
  The comparison uses the DB clock (`now()`), never a client timestamp, and the
  `SENDING_STALE_MS` literal must be the SAME constant `effectiveStatus` uses (one
  constants leaf, P22), so display and persistence cannot disagree. It touches no
  other status; it is safe to run concurrently with itself and with A6 (A6's settle is
  conditional on `status = 'sending'`, above). A row reconciled to `unknown` here is a
  terminal state for automatic action, exactly as an `unknown` returned by the
  sender (retry matrix). `unknown-stale-claim` is a LEDGER-level code only (the
  sender's result codes, R5, are unchanged); the diagnostic fold counts it as
  `unknown` (R8). If the reconcile write itself fails, A4/A5 fail closed
  (`refused/ledger-unavailable`): a duplicate check that could not reconcile must not
  proceed to a send.
- **Requirement DUP (the cross-batch duplicate lookup predicate).** Executed AFTER
  RECONCILE, at A4 (advisory, drives the confirm dialog) and again at A5 (authoritative,
  server-side, so a stale Preview cannot ride through). A recipient `(code, courseId,
  userId)` with digest `D` is EXCLUDED unless explicitly overridden when ANY row exists:
  `owner_id = $o AND institution = $code AND course_id = $c AND recipient_id = $u AND
  body_digest = $D AND status IN ('accepted', 'unknown', 'sending') AND
  COALESCE(settled_at, claimed_at, created_at) > now() - $DUP_WINDOW_MS * interval
  '1 millisecond'`. Notes: (1) `sending` is in the set at ANY age, which is the
  Finding 1 fix on the lookup side; after RECONCILE only young `sending` rows remain
  `sending`, and those are in flight or just-failed-to-settle, both possibly sent.
  (2) `pending` and `refused` are NOT in the set: a `pending` row was never POSTed and
  a `refused` one is provably not delivered (the reload-and-rebuild path depends on
  old `pending` rows not blocking). (3) The `COALESCE` age expression is a requirement
  on WHICH timestamp bounds the window; the Data seat may choose a cleaner column
  but must keep a `sending` row that has never settled inside the window. (4) The
  `body_digest` match is what keeps an intentionally different message to the same
  student allowed. (5) The supporting index is the existing
  `(owner_id, institution, course_id, recipient_id, body_digest)` index; it must lead
  with those columns so this lookup is index-served.
- **Requirement CLAIM (the atomic claim query shape).** One statement, returning the
  affected row, no read-then-write:
  `UPDATE live_message_sends SET status = 'sending', attempt = attempt + 1, claimed_at =
  now() WHERE owner_id = $o AND batch_id = $b AND course_id = $c AND recipient_id = $r AND
  status = 'pending' AND body_digest = $D RETURNING *`.
  Zero rows returned means skipped (someone else holds it, it is terminal, or the digest
  differs): NO POST. Folding `body_digest = $D` into the claim means a body that does not
  reproduce the stored digest cannot claim at all, so a digest mismatch never leaves a
  stuck `sending` row behind (A6 first reads the row to learn code/course/user,
  recomputes `D`, and refuses with no write on mismatch; the claim's own digest condition
  is the belt-and-braces second check). `claimed_at` is set here and only here.
- **Known race this requirement does NOT close (recorded as R-W2-11).** Under
  READ COMMITTED two concurrent batches of the SAME digest each claim their OWN
  `pending` row, so neither claim sees the other and both POST (two tabs confirming the
  same Preview at once). RECONCILE+DUP close the reload-and-resend path and any
  sequential duplicate; they cannot close two simultaneous Starts without a database
  construct. The Data seat chooses: an advisory lock keyed on a hash of
  `(owner_id, institution, course_id, recipient_id, body_digest)` taken inside an RPC
  that performs DUP + insert, or a documented acceptance. A partial unique index on the
  non-terminal statuses is NOT a drop-in: it cannot express the 24h window (`now()` is
  not immutable in an index predicate) and it conflicts with the explicit "Resend
  anyway" override. The single-flight `canStartSend` condition (S4 item 6) and the
  frozen-snapshot digest narrow the same-browser case only.
- **Per-recipient body binding.** A6 receives `(batchId, recipientKey, subject, body)`
  (REVISION 2: `subject` added), takes `institution`, `course_id`, `recipient_id` from the
  claimed ledger row, recomputes `sha256(code \n courseId \n userId \n subject \n body)`
  and compares it with the ledger row's `body_digest` (I-BIND-3); mismatch ->
  `refused/digest-mismatch`, zero POSTs. Subjects and bodies are never stored.
- **Cross-batch duplicate guard (REVISION 2 - predicate corrected, Finding 1).** After
  step Z, Prepare looks up the ledger for the same `(code, courseId, userId,
  bodyDigest)` in stored status `accepted`, `unknown` OR `sending` within `DUP_WINDOW_MS`
  (default 24h) - the exact predicate is requirement DUP above - and EXCLUDES those
  recipients by default, listing them in the confirm dialog ("already messaged or
  possibly messaged"), with an explicit per-row override. The first version keyed only
  on stored `accepted`/`unknown`, so a row stuck in `sending` (settle write failed after
  an accepted POST) was invisible to it: after a reload the owner re-ran
  Preview/Confirm, Start inserted a fresh `pending` row under a NEW `batch_id` (the
  `(batch_id, course_id, recipient_id)` unique key cannot collide across batches), it was
  claimed and POSTed, and the student received a SECOND message. Start (A5) re-runs the
  same lookup server-side; the override is an explicit per-recipient flag in the Start
  payload, never a default. This is what makes "reload mid-batch, rebuild, send again"
  safe without a stored body: the same rendered text has the same digest (P31, P33).
  The simultaneous-Start case it cannot close is R-W2-11.

**Retry matrix.**

| State | Automatic | Owner action |
|---|---|---|
| `accepted` | never resent | none |
| `unknown` | never resent, never retried | per-row "Resend anyway" behind a confirm that says Canvas may already have delivered it (owner decision, section 6; default allowed) |
| `refused` | none | "Retry failed" (A8) - fresh confirm; at most `MAX_ATTEMPTS` (default 3) total attempts per recipient |
| `sending` | never resent; older than `SENDING_STALE_MS` it is persisted to `unknown` by step Z, younger it is still treated as possibly-sent by DUP | none until it is `unknown`; then as `unknown` |
| `pending` | within the SAME page session, resumes in order on "Resume" | "Stop" halts dispatch; in-flight units finish; the rest stay `pending` |

**Reload mid-batch.** Rendered bodies exist only in page memory (S3), so after a reload
nothing can continue the old batch's `pending` rows. What survives is the ledger and
one opaque `ta-` key holding the active batch id (so a poll can show what happened
before the reload). To finish the job the owner re-runs Preview and Confirm; step Z
first persists any stale `sending` row to `unknown`, then Prepare's duplicate guard
(above, predicate DUP) excludes every recipient already `accepted`, `unknown` or
`sending` for the same digest, so the new batch covers only what was not sent. The
old batch's `pending` rows are displayed as "not attempted" and are removed by
retention.

**Concurrency and ordering.** A pure pool `runPool(items, limit, worker, shouldStop)`
in `src/lib/live-messaging/` with two contracts the existing helpers lack: the worker
NEVER throws (it returns a result value, so one failure cannot discard the other 56;
contrast `fetch-helpers.ts:192-204`, P24) and `shouldStop` is checked before each
dispatch. It is a new leaf rather than an import of the client-side helper
`bulkRubricGenerateSummary.ts:181` (no stop signal, no error isolation, and a
cross-feature component-directory dependency) or the server copy (lives under
`canvas-modules`, which the client-boundary test keeps out of client-reachable modules:
`canvas-client-boundary.transitive.test.ts:212`, whose title I read; its body I did
not). Default `L = 3` (D6). Note P5's sibling concern: whether Next serializes
concurrent Server Action calls from one client (making effective `L = 1`) is NOT
established here (R-W2-4); safety does not depend on it, only wall-clock does.

**Circuit breaker (pure, P25).** `shouldPause(recentResults)` is true when the last
`K = 3` COMPLETED results are all non-accepted, or when any result is
`not-authorized` or `ledger-unavailable`. A pause stops dispatch, keeps in-flight
units, and shows the reason. This bounds the damage of a revoked token (every unit
`refused-http 401`), a Canvas outage (every unit `unknown-no-response`) and the
host-misconfiguration case in R5, to at most a handful of rows needing attention
rather than 57. Resume is an explicit click.

**Per-unit timing arithmetic (for A6, from cited constants; the first three are
design ceilings, the rest are existing code).**
claim race 3s + THREE credential reads at 5s each (S1 step 5, S1 step 6, and the
sender's own `resolveInstitution` in phase A; each bounded by
`canvas-credentials.ts:107`) + POST 15s (`canvas-fetch.ts:161`; the `canvasRequest`
adapter passes no override, `canvas-fetch-response.ts:154`) + settle race 3s =
3 + 15 + 15 + 3 = 36s worst case, EXCLUDING `getEffectiveIdentity`, which is not
bounded here (R-W2-8). A cheap reduction, available to the build seat: let the sender
accept an already-resolved `{institution, token, baseUrl}` from S1 step 6 and skip its
own phase-A resolution (default path unchanged), which gives 31s. Whether 31s or 36s
fits inside the Server Action default is exactly the open R-W2-2. If it does not, the failure is a lost response for ONE recipient, which the
poll reconciles from the ledger or resolves to `unknown`; the design never depends on
the limit for safety, only for completeness. Total wall-clock for N=57 at `L=3` is
`ceil(57/3) = 19` rounds times typical unit latency; typical latency is UNMEASURED
(needs a live Canvas) so no total is claimed.

**Progress contract.** Counts `{pending, sending, accepted, refused, unknown}` plus
per-recipient `{key, status, code, httpStatus}` (no names; the client joins keys to its
own rows). Identity P26: `accepted + refused + unknown + notAttempted = N` at all times,
where `notAttempted` is `pending` plus rows skipped by Stop/pause.

**Ledger (hand-off to the Data seat; D2).** Illustrative table `live_message_sends`:
`id uuid`, `owner_id uuid`, `batch_id uuid`, `institution text`, `course_id text`,
`recipient_id text`, `body_digest text`, `status text check in
('pending','sending','accepted','refused','unknown')`, `code text`, `http_status
smallint null`, `attempt smallint`, `created_at`, `claimed_at`, `settled_at`.
Unique `(batch_id, course_id, recipient_id)` (WITHIN a batch only - it is not a
cross-batch guard, which is why Finding 1 existed); index for the duplicate lookup on
`(owner_id, institution, course_id, recipient_id, body_digest)`. `code` takes the
sender's enumerated result codes (R5) plus the ledger-only `unknown-stale-claim`
(requirement RECONCILE); a `digest-mismatch` refusal writes nothing, so it has no
ledger code. The Data seat must also size an index or
accept a scan for requirement RECONCILE's predicate `(owner_id, status, claimed_at)`
(partial on `status = 'sending'` is the natural shape; the Data seat decides). NO name,
subject, body or score column. Retention default 90 days via the existing sweep pattern
(`.github/workflows/sweep-orphan-uploads.yml`, `app/api/cron/sweep-orphan-uploads`
exist; I did not open them) - the answer to "what deletes this" must be stated by the
Data seat, "nothing" included. `supabase-migrations.structure.test.ts` joins the W4
gate (migrations auto-apply on push). The closest precedent migration is
`20260817000000_create_message_drafts.sql` (exists per glob; NOT opened here).
**Tier 0 fallback if D2 is refused:** the same state machine in a `ta-` localStorage
ledger keyed by batch id, claim = write `sending` before the call. It survives reload
in one browser and nothing else; it cannot see a platform kill in another tab/device.

### R7. The live table read

The read is bounded in units; each unit is ONE Server Action invocation (A3), driven
from the browser by the same pool with `L_read = 2` (D6), so a failure is local and the
page renders progressively.

- **Units.** `listLiveCoursesAction` once, then per course four independent units:
  `roster`, `grades`, `sections`, `missing`. Cells depend on their own unit only:
  Student/ids on `roster`, grade on `grades`, Section on `sections`, # Missing on
  `missing`. A failed unit leaves THAT column's cell in an "unavailable" state; every
  other cell of the row renders. (Reader mapping: scope section 5.)
- **Unit result type:** `{ok:true,data} | {ok:false, kind: "no-credential" |
  "canvas-refused" | "timeout" | "too-large" | "unavailable"}`; no Canvas free text.
- **Per-unit budget.** A server-side race returns `timeout` after `UNIT_BUDGET_MS`
  (default 25s - the figure E-REL2 quotes, "a 25s budget plus a 20-page hard cap",
  `canvas-remote-url.ts:144-147`). A race abandons, it does not cancel (precedent
  `canvas-credentials.ts:150-164`); the abandoned read ends with the invocation.
- **Pagination and truncation.** Page cap 20 (`canvas-remote-url.ts:156`). The
  `listings.ts` readers stop SILENTLY at the cap (P6). Without editing that shared file,
  the unit marks `truncated` when a reader returns `>= 20 * 100` rows (assumes
  `per_page=100`, which the readers request, `listings.ts:288,323`) and the UI says the
  list may be incomplete (P28). `listCourseSubmissionGrid` THROWS at page 21
  (`submissions-grid.ts:225-229`) -> unit kind `too-large`.
- **Known functional limit (illustrative arithmetic, assumptions stated, NOT measured).**
  The bulk submission endpoint pages over SUBMISSIONS, not students: with `per_page=100`
  a course of S students and A assignments needs `ceil(S*A/100)` pages. S=30, A=40 ->
  1200 rows -> 12 pages (fits). S=100, A=40 -> 4000 rows -> 40 pages -> exceeds the cap
  of 20 and the `missing` unit fails `too-large` for that course. If the first bulk page
  is non-OK the reader falls back to a per-assignment fan-out at its own concurrency 4
  (`submissions-grid.ts:42,233-245`), which multiplies in-flight requests with the
  outer pool - the unit budget above is what bounds that. Illustrative request count at
  S=30, A=40, 8 courses: `(1 roster + 1 grades + 1 sections + 12 grid) * 8 = 120`
  requests, `L_read = 2` units in flight. Instrument that will replace the
  illustration: a mocked-client fixture in W1 plus an owner walk on real courses
  (R-W2-5).
- **Cache / TTL stance.** NO server-side cache (a module-scope cache on the server is
  shared across requests and users - the hazard `session-diagnostic-log.ts:37-42`
  already documents). Client-side: in-memory hook state keyed `(code, courseId, unit)`
  with `fetchedAt`; `CACHE_TTL_MS` default 5 min passive reuse; explicit Refresh per
  table and per course. Never written to localStorage. The send gate uses the stricter
  `DATASET_MAX_AGE_MS` (S4). Invariant (P27b): `CACHE_TTL_MS <= DATASET_MAX_AGE_MS`.
- **States.** Per unit: `idle | loading | ok | empty | failed(kind) | truncated`.
  Table: `no-live-institution | loading | partial | failed | empty | ok`, derived by a
  pure `summarizeTableLoad(units)` (P27) with two rules that exist to prevent a lie:
  a failed unit is NEVER shown as zero rows, and "empty" requires every unit `ok` or
  `empty`. A `partial` table shows "N of M courses/readings unavailable" with a Retry
  that re-runs only the failed units. Select-all selects LOADED rows only; the confirm
  count (S4) is computed from loaded, rendered-OK rows. Copy and layout are the UX
  seat's; the state names and these two rules are this pass's contract.
- **Row-level send eligibility** is a function of the rendered row: a row whose
  required token is unresolved (e.g. `grade` null because the `grades` unit failed) is
  excluded from the send and listed in Preview (I-BIND-4), so a failed read can never
  become a blank in a message to a student.

### R8. Diagnostics (check finding F2)

**Constraints, restated from the tree.** The log is browser-only and the server cannot
import it (`session-diagnostic-log.ts:37-42`); the enforcing scan is a SUBSTRING scan
(`text.includes`) over `src/app/api`, `src/app/actions` and every file carrying the
directive (`session-diagnostic-log.test.ts:693-702,726-755`). Consequences: (a) the
new server files must not even MENTION `session-diagnostic-log`,
`gradingDiagnosticLog`, `chatSeamDiagnostic`, `gradingActionSeam`, or the new wrapper's
name in a comment; (b) the new client wrapper's specifier must be ADDED to
`BROWSER_ONLY_SPECIFIERS` (`:702`) or a server file importing the wrapper would pass
the scan while sharing cross-request state. No student data in any entry
(`session-diagnostic-log.ts:44-49`).

**Schema decision (keeps `session-diagnostic-log.test.ts` green).** `SessionDiagnosticEntry`
has no counts field; it has `classificationStudentCount`, documented as "Students found
in a classified zip upload" (`:148-150`) but written to a CSV column headed just
`Students` (`:389,442`). Three options, evaluated against the existing assertions:

| Option | Edit | Existing tests |
|---|---|---|
| A. (recommended) reuse the generic `Students` column: ONE ENTRY PER OUTCOME CLASS per batch, `classificationStudentCount` = how many recipients | surface registration + a comment update on `:148`; no field, no parse change, no CSV column | unchanged by construction |
| B. add `outcomeCounts?: {accepted;refused;unknown}` | new field, `parseOneEntry` round-trip (`:505-535`), 3 new CSV columns | APPENDING columns breaks three existing row-suffix assertions: `endsWith(",2360,")` and `endsWith(",,")` at `session-diagnostic-log.test.ts:611-612` and `endsWith(",5,23")` at `:642`. Columns inserted BEFORE `Duration (ms)` would keep them green, at the price of reordering an exported CSV. |
| C. encode counts in `label`/`error` | none | `label` is a stable machine-vocabulary string (`:132-137`) and `error` is empty on success (`:237`); counts become unqueryable prose |

Recommended A. Per finished (or stopped) batch the client records exactly THREE entries
via a new wrapper `messagingDiagnosticLog.ts` (mirrors
`grading/gradingDiagnosticLog.ts:1-82`: one surface value, the wrapper owns the
operation vocabulary, every record goes through the core so scrub/cap/drop accounting
stay in one place):

| operation | label | outcome | `classificationStudentCount` | `error` |
|---|---|---|---|---|
| `send_batch_accepted` | Messages accepted by Canvas | success | accepted | "" |
| `send_batch_refused` | Messages refused by Canvas | failure iff count > 0 | refused | enumerated codes only, e.g. `2x refused-http, 1x refused-rate-limited` |
| `send_batch_unknown` | Messages with unconfirmed delivery | failure iff count > 0 | unknown | e.g. `3x unknown-no-response` |

All three are always emitted (a zero count is a recorded zero, not an absence), so
`accepted + refused + unknown + notAttempted = N` is checkable from the log (P26) and
`summarizeSessionDiagnosticLog` counts the failed classes in its `failed` total
(`:313-324`). `institution` = the code; `course` = "" for a multi-course batch (course
names are not personal data, so a per-course read entry may carry one). Table reads
record one entry per UNIT: `fetch_unit` (label by unit kind, `course` = course name,
`outcome` = success/failure, `error` = the enumerated unit kind), plus `list_courses`
and `prepare_batch`. Surface edits in `session-diagnostic-log.ts`: add `"messaging"`
to the `SessionDiagnosticSurface` union (`:73`), `SURFACES` (`:75`), the labels record
(`:77-81`) and `COVERAGE_BY_SURFACE` (`:92-99`) - tsc enforces the record is total.
Tests that stay green unchanged: the coverage floor `>= 3` (`:418`), the frozen
`NOT_COVERED toHaveLength(5)` (`:425`), the three CSV suffix assertions above. W4 adds
tests for the new surface row and the wrapper. `SessionLogSection.tsx` indexes labels by
`entry.surface` (`:81`) so it needs no edit once the record is total. Best-effort
caveat stated in the coverage row: a page closed mid-batch cannot emit; the ledger is
the durable record.

The failure this representation makes visible: how many of N sends were refused, and
how many have UNCONFIRMED delivery - the number the owner must go and check in Canvas.

---

## 4. Pin catalogue (every assertion: object, instrument, direction, mutant)

Instrument key: `vitest` = pure/mocked test via `npm run test:paths <paths>` (multi-file)
or `npx vitest run <path>` (single); `AST` = TypeScript `ts.createSourceFile` scan in
the style of `bulk-course-message.wiring.test.ts` (reading-claim approximation: no
component is rendered, `this-repo.md` section 2). "Red when" is the direction of
failure; "Mutant" is the edit that must flip it (the test seat builds these; any mutant
that survives is reported, and a rebuilt mutant is declared as such).

| Pin | Object under comparison | Instrument | Red when | Mutant that must flip it |
|---|---|---|---|---|
| P1 | batch with one target whose derived host resolves to a different code -> result vs `refused/institution-mismatch`, and `canvasRequest` call count vs 0 | vitest, mocked `resolveInstitution`/`canvasRequest` (never `fetch`; `tests-are-network-blocked`) | any POST occurs, or any non-refusal returned | delete S1 step 6 |
| P2 | `recipientUserId` in {`course_5`, `1,2`, `12abc`, ``, `99999999999999`} vs `invalid-target` and zero POSTs | vitest | any accepted | loosen the regex to `/^.+$/` |
| P3 | named imports from `@/lib/canvas/inbox` across the walled set vs `["sendStudentConversation"]` | AST over a globbed set (`length>=1`, planted-fixture canary) | set differs in either direction | add `createCourseConversation` to an import |
| P4 | sender POST body vs `createConversation` POST body, same inputs | vitest on the `inbox.test.ts:503` harness | strings differ | change `force_new` to `0` in the sender |
| P5 | param keys appended in `sendStudentConversation` body vs `{recipients[],body,subject,context_code,force_new}` | AST (`findFunction` idiom, `bulk wiring :50,:408`) | set differs | append `group_conversation` |
| P6 | `classifyConversationPostStatus` for every status 100..599 | vitest, axes = the integer range (a source independent of the table) | not exactly one class, or accepted set != {200,201} | map 202 to accepted |
| P7 | classes from real `createCourseConversation` vs `sendStudentConversation` over 100..599 | vitest, mocked `canvasRequest` | differing-status set != exactly {429} | map 503 to refused (set gains 503) |
| P8 | phase boundary: input failure -> refused with 0 calls; `canvasRequest` rejection -> unknown | vitest | a rejection yields refused, or a pre-send failure makes a call | wrap phase A inside the phase-B try |
| P9 | (only if D1 overruled) wrap classification of REAL `canvasError`/adapter messages | vitest, messages produced by the real functions | any unrecognised/drifted message classified `refused` | reword a `canvasError` string |
| P10 | exported-async set of the walled action files vs the pinned list; each body has `requireAppOwner(` first, no `requireOwner(`/`requireUser(` | AST + the extraction at `action-guard-coverage.test.ts:118-143`; plus OWNER_ONLY registration | set differs, or a guard is missing/weaker | swap A6's guard for `requireUser()` |
| P11 | action files contain `export const`/`export default`/`export {`/arrow exports | AST | any present | add `export const x = async () => {}` |
| P12 | value imports of the walled set from workflows/cron/triggers/automations trees | AST over those directories | any import | import A6 from a workflow step |
| P13 | per-row render: for rows with sentinel-distinct values, each body contains its own values and none of the others'; bodies differ at exactly the bound tokens | vitest; sentinels from a table independent of the generator | any cross-contamination or equal bodies | resolve tokens once from row 0 (the scope's removal test) |
| P14 | render of a row with a null/NaN/missing field | vitest | output contains `null`, `undefined`, `NaN` or `{{` | `String(value)` coercion |
| P15 | order invariance of the batch builder | vitest, shuffled inputs | outputs not permuted identically | shared accumulator |
| P16 | selection builder with two institutions holding colliding `c:u` keys | vitest | active code's payload contains the other code's key | read the union of both maps |
| P17 | persisted JSON for the draft/selection keys: field whitelist; `ta-` key set in the walled UI directory equals the pinned set | vitest on the writers + AST key scan (idiom `bulk wiring :419-428`) | any key outside the whitelist (name, grade, body, search text) or an unpinned `ta-` key | spread a row into the selection writer |
| P18 | forbidden imports/identifiers/`console.` in the walled set | AST | any hit | add `console.log(body)` |
| P19 | `canStartSend` over the full product of its six conditions (2^6) | vitest, product enumerated by a constructor, expected = all-true only | any not-all-true state returns ok | drop the institution-equality condition |
| P19b | `startLiveMessageBatchAction` referenced in exactly one file, inside the confirm handler | AST (reading claim) | zero or more than one reference | call it from an effect |
| P20 | Start with a mutated body or SUBJECT vs expected digest; A6 called with (a) a body != ledger digest and (b) a subject != the subject digested at Start (REVISION 2, Finding 2) | vitest, mocked ledger; expected digest recomputed by an independent `sha256(code \n courseId \n userId \n subject \n body)` helper in the test | rows created or POST made in any of the three cases | skip the digest compare; or compute the A6 digest without `subject` (flips case b only) |
| P21 | A6 invoked twice, and concurrently via `Promise.all`, for one key | vitest, mocked ledger with a conditional-update emulation | `canvasRequest` calls != 1, or second result is not `skipped` | claim as plain update with no `status='pending'` condition |
| P22 | `effectiveStatus(row, now)` for `sending` older/younger than `SENDING_STALE_MS`; and the constant it reads is the SAME export the reconcile statement uses (REVISION 2) | vitest, injected clock; AST/import check that both consumers read one constants-leaf export | stale `sending` shown as anything but `unknown`, or two different stale thresholds | return the raw status; or hard-code a second literal in the reconcile |
| P23 | ledger claim rejects or times out | vitest | any POST occurs | proceed on claim failure |
| P24 | `runPool` with one throwing-then-returning worker among 57 | vitest | any result lost or the pool rejects | remove the worker's try/catch |
| P25 | `shouldPause` truth table (K=3 non-accepted; not-authorized; ledger-unavailable) | vitest | table mismatch | use `K=4` |
| P26 | `accepted+refused+unknown+notAttempted = N`; the three diagnostic entries sum to N | vitest | identity fails | drop `unknown` from the fold |
| P27 | `summarizeTableLoad`: partial vs failed vs empty vs ok on constructed unit sets; a failed unit never reads as zero rows | vitest | any lie | treat `failed` as `empty` |
| P27b | `CACHE_TTL_MS <= DATASET_MAX_AGE_MS` (read from the constants leaf) | vitest | inequality fails | swap the constants |
| P28 | reader returning 2000 rows -> `truncated` | vitest | not flagged | threshold `> 2000` |
| P29 | `messaging` surface: coverage row present; wrapper specifier in `BROWSER_ONLY_SPECIFIERS`; entry fields carry only counts/enumerated codes; the existing `session-diagnostic-log.test.ts` stays green | vitest + AST; `npm run test:paths` over the touched test files | any missing | omit the specifier from the scan list |
| P30 | string literals in unknown/refused copy vs the forbidden-word set at `bulk-course-message.wiring.test.ts:132` (delivered, received, emailed, sent) | AST string-literal scan (idiom `:132-154`) | match in an unknown/refused state's copy | write "Message sent" for `unknown` |
| P31 | Prepare with a settled `accepted` row of equal digest inside the window; and with the same row OUTSIDE the window | vitest, mocked ledger | recipient not excluded inside, or excluded outside | ignore the window |
| P33a | REVISION 2 (Finding 1), predicate DUP in isolation (no reconcile run): ledger holding, for the same `(code, course, user, digest)`, one row each in `accepted`, `unknown`, `sending` YOUNGER than `SENDING_STALE_MS`, `sending` OLDER than it, plus control rows `pending`, `refused` and an equal-status row with a DIFFERENT digest -> which are returned as "possibly sent" | vitest, ledger emulation applying the exact DUP predicate (rows built from a table independent of the implementation) | `sending` (either age) not returned; or `pending`/`refused`/other-digest returned | duplicate-guard status set `('accepted','unknown')` (ignores `sending`) |
| P33b | REVISION 2 (Finding 1), step Z in isolation: ledger with a `sending` row claimed `SENDING_STALE_MS + 1` ago and one claimed `SENDING_STALE_MS - 1` ago -> the emulated ledger's STORED status afterwards (an observed write, not `effectiveStatus`) | vitest, ledger emulation with a write log, injected DB-clock | stale row still stored `sending`; young row changed; any other status touched | make the reconcile display-only (compute `unknown` without issuing the update) |
| P33c | REVISION 2 (Finding 1), the incident end to end: A6 on key K with `canvasRequest` resolving 200 and the settle write REJECTING; then (new page session) A4 and A5 for the same digest including K | vitest, mocked `canvasRequest` + failing-settle ledger emulation | K re-inserted as `pending`, or a second `canvasRequest` call for K, in A5 or after | the pre-revision pair together: remove the step Z call AND take `sending` out of the DUP status set (each defence alone leaves this pin green BY DESIGN; P33a and P33b are the single-mutant pins) |
| P33d | REVISION 2, A5 re-runs DUP (not only A4) and fails closed on a failed reconcile | vitest | Start inserts a duplicate that A4 had not seen, or proceeds when the reconcile write errors | drop the DUP lookup from A5; or swallow the reconcile error |
| P33e | REVISION 2, claim and settle shapes: the claim carries `status = 'pending' AND body_digest = $D`; the settle carries `status = 'sending'`; a late settle after reconcile does not overwrite | vitest, ledger emulation (extends P21) | claim succeeds on a non-pending or wrong-digest row; settle overwrites `unknown` | drop the `status = 'sending'` condition from the settle |
| P32 | no module-scope `let|var *cache` in the walled UI directory | AST/regex (idiom `bulk wiring :427-429`) | present | add `let hubCache` |

Caveat on P33a-e and P21 (a limit stated, not hidden). These pins drive the
implementation's REAL query-building code against a recording client (the typed-mapper
pattern) and apply the recorded filters in an in-memory emulation. They prove the
predicates the code ASKS FOR; they cannot prove Postgres evaluates them as intended or
that the update is atomic under READ COMMITTED, because no live database exists in this
environment (`this-repo.md` section 6). An emulation written from the same reading of
the requirement as the implementation would agree with it by construction, so the
emulation's expected rows must come from a literal table in the test, not from a
re-implementation of DUP. The real-database confirmation is owed by R-W2-7 (migration
Action run plus an owner check on a throwaway course) and the simultaneous-Start case
is R-W2-11.

---

## 5. W3/W4 implications (owns, callers, gates)

Edits this design adds to existing files, with HEAD line counts
(`@(Get-Content <f>).Count`): `src/lib/canvas/inbox.ts` 500 (+ the sender and the pure
classifier, estimate +90, no ceiling risk; ceiling is 1000 and the estimate is mine,
unmeasured), `src/lib/canvas/inbox.test.ts` 523, `src/lib/session-diagnostic-log.ts`
545 and `.test.ts` 755, `src/app/actions/action-guard-coverage.test.ts` 647. NOT
touched under the recommended choices: `canvas-core.ts` (234), `listings.ts` (455),
`submissions-grid.ts` (264), `createConversation` (pinned by `inbox.test.ts:503`).
New: the action file(s), the pure leaves (`assert...`, `classify...`, `runPool`,
`canStartSend`, `summarizeTableLoad`, `shouldPause`, `effectiveStatus`, the constants
leaf), the diagnostics wrapper, a migration (Data seat), their tests.

Callers (the surface is a layer): A1-A3 are called by the table hook (W3), A4-A8 by the
send hook invoked from the confirm handler (W4); the wrapper is called by both hooks;
the classifier is called by the sender; the sender by A6. A wave that adds an export
without its caller ships dead code with every gate green (`seats.md`, Architect).

Wave-gate canaries to run in addition to the new tests, always through
`npm run test:paths <p1> <p2> ...` (never a raw multi-path vitest):
`src/file-size-ceiling.structure.test.ts`, `src/lib/no-emojis.test.ts`,
`src/source-bytes.structure.test.ts`, `src/lib/use-server-exports.test.ts`,
`src/app/actions/action-guard-coverage.test.ts`,
`src/lib/session-diagnostic-log.test.ts`, `src/lib/canvas/inbox.test.ts`,
`src/app/components/bulk-course-message/bulk-course-message.wiring.test.ts` (it parses
`inbox.ts`), `src/supabase-migrations.structure.test.ts` (ledger migration), and
`src/lib/workflows/headless.test.ts` (to prove the headless-safe count did not move).
Derivation command for tests that name the feature strings (the scope's section 7
command): `grep -rln "SuccessTracking\|live-messaging\|sendLiveMessages\|MessagingModal"
src --include=*.test.ts` returned NO test files at HEAD (exit 1). The enumeration is a
floor: the plan seat re-derives it after W3 names its files.

---

## 6. Owner decisions and recommended defaults (table L)

Every value is a recommended default, not a Canvas-documented limit and not measured.
They live in ONE constants leaf (precedent: `canvas-throttle.ts:47-60,116`), so
changing one is a one-file edit with no migration.

| Constant | Default | Meaning / basis |
|---|---|---|
| `MAX_BATCH_RECIPIENTS` | 250 | table pager shows 200 rows (scope); bounded blast radius; payload `250 * BODY_MAX_CHARS` bytes stays far under the 10mb action body limit (`next.config.ts:13-14`) |
| `SUBJECT_MAX_CHARS` / `BODY_MAX_CHARS` | 200 / 10000 | app-side sanity caps, NOT Canvas limits (Canvas limits not verified here) |
| `L` (send pool) | 3 | repo precedent runs 4 for writes under a stated ~12-concurrent throttle belief (`useCommandInterface.ts:160-165`); 3 is one step more cautious for irreversible sends |
| `L_read` | 2 | reads multiply per course (R7) |
| `K` (breaker) | 3 | consecutive non-accepted results |
| `MAX_ATTEMPTS` | 3 | per recipient, refused only |
| `SENDING_STALE_MS` | 120000 | well above the 36s unit worst case (R6); ONE export read by both `effectiveStatus` and the step Z reconcile (P22) |
| `UNIT_BUDGET_MS` | 25000 | E-REL2 figure quoted at `canvas-remote-url.ts:144-147` |
| `CACHE_TTL_MS` / `DATASET_MAX_AGE_MS` | 5 min / 10 min | invariant `TTL <= max age` |
| `DUP_WINDOW_MS` | 24h | duplicate-suspect window |
| ledger retention | 90 days | Data seat/owner |

Owner-only calls (each with the default above): D2 (durable ledger), D3 (429 handling),
D4 (MCC-only send), D5 (no persisted search text), D7 (typed confirm), "Resend
anyway" for `unknown` (default: allowed, per row, with a warning confirm), and the
table above.

---

## 7. Residual register (owner / instrument / step; a missing one is a deletion)

| ID | Not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-W2-1 | Canvas semantics of `POST /conversations`: does a 429 always precede the write; does a non-enrolled recipient answer 4xx; can a 5xx have applied | repo owner | live test course, deliberate cases (throttle burst, non-enrolled id), then read the Canvas Sent folder | owner walk after the W4 push (extends RES-LMS-6) |
| R-W2-2 | Effective duration of a Server Action on the Hobby deployment (P5); the 36s (31s optimised) unit worst case may not fit | repo owner / ops | a deployed throwaway action that waits N seconds, or the Vercel function config page | before W4 ships; if too short, switch A6 to a Route Handler with `maxDuration = 60` (design alternative in R6) |
| R-W2-3 | Canvas rate-limit behaviour at `L = 3` on a real token | repo owner | observed 429/403 count during a 57-recipient owner walk, via the P26 diagnostic entries | owner walk after W4 |
| R-W2-4 | Whether Next serializes concurrent Server Action calls from one client (effective `L`) | repo owner | timestamps of overlapping calls in the Browser pane network log, real browser | owner walk after W4 |
| R-W2-5 | `missing` unit on large courses (`S*A > 2000`) fails `too-large`; real S, A and latency unmeasured | W1 implementer, then owner | a mocked-client fixture at S*A just under and over 2000; then real courses | W1 build; owner walk |
| R-W2-6 | `sections` reader and the `>= 2000 rows` truncation heuristic | W1 implementer | mocked-client mapping test (RES-LMS-4) and P28 | W1 build |
| R-W2-7 | LOAD-BEARING (REVISION 2), not housekeeping: the Data/storage pass now owns the double-send guard's SQL. It must settle (a) requirement DUP, the exact cross-batch duplicate-lookup predicate over stored `accepted`/`unknown`/`sending` inside the window, (b) requirement RECONCILE, the persisting write stale `sending` -> stored `unknown` on the DB clock, run at A4/A5/A7, (c) requirement CLAIM, the atomic `pending -> sending` update including `claimed_at = now()` and `body_digest = $D`, and the settle's `status = 'sending'` condition, (d) the indexes serving DUP and RECONCILE, plus ledger DDL, RLS, typed mapper, retention, the DATA pass (triggered by "anything persisted"). Without (a)-(c) the central "reload-and-resend safe / never double-send" claim is unproven | Data seat (Wave 1 re-run), then migration reviewer | `supabase-migrations.structure.test.ts` + a mapper test + P33a-e (query-builder level, emulation caveat in section 4); migrations auto-apply on push to main, so the Action run is the real check that the DDL applies; the predicates' behaviour in Postgres needs an owner check on a throwaway course (force a failed settle, reload, re-Preview, confirm the recipient is excluded) | before the W4 build brief is written; the (a)-(c) shapes in R6 are the REQUIREMENT the Data seat must satisfy or explicitly amend, and the W4 brief must not be written until it has |
| R-W2-11 | Simultaneous Starts of the same digest (two tabs confirming one Preview at once) can each claim their own `pending` row and both POST: RECONCILE+DUP close sequential/reload duplicates, not this race | Data seat (choose advisory-lock RPC vs documented acceptance), then repo owner | for the lock option: a test that two concurrent A5 calls on one digest insert one set of rows (emulation caveat applies); for acceptance: the owner decision recorded in the Data seat's note | with R-W2-7, before the W4 build brief |
| R-W2-8 | `getEffectiveIdentity` latency is unbounded in the unit arithmetic | ops | timing of the identity read on a real session | owner walk after W4 |
| R-W2-9 | All UI/keyboard/copy claims (confirm focus, button label, partial banner, Resume/Stop, unknown wording) are reading claims | Wave 3 UX + accessibility seats; then owner | reading plus P30; owner browser walk | Wave 3; owner walk |
| R-W2-12 | The symbol-level pin's walled glob is non-vacuous (`length >= 1`) but not proven COMPLETE; a send-reaching action named outside `live-messaging*` / `src/lib/live-messaging/**` is invisible to P3/P10/P11/P12/P18 | plan/W3 seat (pins the glob to the built file set), then the verify seat | the built diff (`git diff --name-only <base>..HEAD`) filtered to files referencing `sendStudentConversation` / `requireAppOwner` / `sendLiveMessageAction`, compared with the pinned set | after W3 names its files (plan seat), and again at verify |
| R-W2-10 | An audit view of past sends (the ledger makes one possible; no surface is designed) | repo owner (admin capability) | owner decision whether a "message log" surface is wanted | backlog item if wanted |

---

## 8. Disposition of the scope's W2 obligations

(REVISION 2 is an in-place correction, not a restructuring: no requirement was removed;
section 11 lists what was added or changed.) No prior W2 version exists, so no prior requirement is
dropped. Mapping of what the scope assigned to W2 (scope section 7 row W2) and to the
reliability/data seats (section 6 last paragraph, RES-LMS-5):

| Scope obligation | Status | Where |
|---|---|---|
| send-boundary pin design | kept, strengthened (construction + assertion + symbol-level pin) | S1, P1-P5 |
| the job design | kept (client-orchestrated ledger-backed kickoff/work/poll) | R6 |
| owner-gating plan | kept | S2, P10-P12 |
| connected-institution resolution | kept | S5 |
| timeout arithmetic against payload and cap (RES-LMS-5) | kept as arithmetic with stated assumptions; the platform limit itself remains open | R6, R7, R-W2-2 |
| diagnostics for fetch + send | kept | R8, P26, P29 |
| data seat items: byte sizes, TTL, retention | handed over to the Data seat (receiver) with the obligation to settle DDL, mapper, retention | R6 ledger, R-W2-7 |
| scope F1 "wrap createConversation" | changed (D1): new sender; the wrap is the documented fallback | R5 |

## 9. What I could not determine (not filled in)

- Real Canvas behaviour for any status, rate limit, recipient validation or latency (no
  `.env`, network blocked: `this-repo.md` section 6). Every such claim is a residual.
- The Server Action's effective duration limit on the deployment (R-W2-2).
- Whether Next serializes concurrent Server Action invocations (R-W2-4). The Next docs
  tree was searched for sequential/queue wording and the only hit was form submissions
  before hydration (`01-getting-started/07-mutating-data.md:169`); absence of text is
  not evidence of behaviour.
- Files named but NOT opened: `supabase/migrations/20260817000000_create_message_drafts.sql`,
  `.github/workflows/sweep-orphan-uploads.yml`, `app/api/cron/sweep-orphan-uploads/route.ts`,
  the body of `canvas-client-boundary.transitive.test.ts` (title only),
  `app/actions/shared.ts:662` `mapWithConcurrency`, `lms-credentials.ts`, and
  `getEffectiveIdentity`.
- Rendering, focus, keyboard and copy: nothing is rendered by any test here; every UI
  statement in S4/R7 is a design contract, not a verified behaviour.
- No reference implementation was built for these pins, so "satisfiable" is argued, not
  demonstrated; the test seat owes that (`seats.md`, Test seat practice 1).

## 10. Commands run (provenance)

- `git rev-parse --short HEAD` -> `5e0e3ee7`.
- `@(Get-Content <f>).Count` (PowerShell): inbox.ts 500, canvas-core.ts 234,
  session-diagnostic-log.ts 545, its test 755, action-guard-coverage.test.ts 647,
  inbox.test.ts 523, listings.ts 455, submissions-grid.ts 264, messaging.ts 540,
  canvas-fetch-response.ts 161, canvas-fetch.ts 490.
- `npm run test:paths` over the five paths listed in section 0 -> 5 COVERED, 126 passed.
- `grep -rn institutionForUrl src` -> `canvas-core.ts:60`, `canvas-core.ts:131`.
- `grep -rn "sendStudentConversation\|live_message_sends\|live-messaging" src supabase .github` -> exit 1.
- `grep -rln "SuccessTracking\|live-messaging\|sendLiveMessages\|MessagingModal" src --include=*.test.ts` -> exit 1 (no files).
- Grep of `node_modules/next/dist/docs/.../maxDuration.md` for "Server Actions" -> `:16-18`.
- Constants read directly: `DEFAULT_TIMEOUT_MS = 15_000` (`canvas-fetch.ts:161`),
  `MAX_RESPONSE_BYTES` 5 MiB (`:181`), `CANVAS_PAGINATION_PAGE_CAP = 20`
  (`canvas-remote-url.ts:156`), `CREDENTIAL_READ_TIMEOUT_MS = 5_000`
  (`canvas-credentials.ts:107`), `FALLBACK_CONCURRENCY = 4` (`submissions-grid.ts:42`),
  `MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES = 500` (`session-diagnostic-log.ts:178`),
  `serverActions.bodySizeLimit "10mb"` (`next.config.ts:13-14`).

- REVISION 2 commands: `git rev-parse --short HEAD` -> `7a668112`;
  `git diff --stat 5e0e3ee7 HEAD -- src/lib/canvas-core.ts src/lib/supabase/auth.ts
  src/lib/session-diagnostic-log.ts src/lib/canvas/inbox.ts src/lib/canvas-credentials.ts`
  -> empty; `wc -l src/lib/canvas/inbox.ts src/lib/session-diagnostic-log.ts` -> 500, 545
  (matches the first-pass `@(Get-Content).Count` figures); `ls src/lib/live-messaging` -> 12
  files; `ls src/app/actions | grep -i live` -> `live-class*` only; lines re-opened at HEAD:
  `canvas-core.ts:60,131`, `supabase/auth.ts:193-200,408-415,451-453`, `inbox.ts:384-386,
  399-406,417-419`, `session-diagnostic-log.ts:37-42`.

---

## 11. Revision log - round-1 check aa106868 (what changed, what was left intact)

Applied as a transcription of three accepted findings; nothing outside them was
reopened.

| Finding | Severity | Change | Where |
|---|---|---|---|
| 1. Double-send hole: duplicate guard keyed on stored `accepted`/`unknown` and ignored a row stuck in `sending` (settle write failed after an accepted POST; after reload the owner re-runs Preview/Confirm, Start inserts a fresh `pending` row under a NEW batch_id, it is claimed and POSTed) | HIGH | (1) Step Z: a real write persisting stale `sending` -> stored `unknown` before any duplicate check, run at A4, A5, A7 (requirement RECONCILE). (2) Predicate DUP now includes `sending` of ANY age (requirement DUP), run at A4 (advisory) and re-run at A5 (authoritative). (3) Requirement CLAIM states the atomic claim shape incl. `claimed_at` and `body_digest`; settle made conditional on `status = 'sending'`. (4) New pins P33a-e; P22 and P31 extended. (5) R-W2-7 re-stated as load-bearing; new residual R-W2-11 for simultaneous Starts. Decision D8 records "both, not either". | R6 (state machine, DUP/RECONCILE/CLAIM requirements, retry matrix, reload, ledger), A4/A5/A7 rows in S2, section 4, D8, section 7 |
| 2. Subject contradiction: I-BIND-3 digest includes `subject`, the send POSTs `subject`, but A6 took no `subject` | MEDIUM | A6 signature is now `sendLiveMessageAction(batchId, recipientKey, subject, body)`; `code`/`courseId`/`userId` come from the claimed ledger row; subject is not stored (digest only); data-class of a rendered subject stated for the worse case (tokens allowed -> body-class, transit only). P20 extended with a subject case. Schema unchanged (it already had no subject column). | S2 table A6, S3 I-BIND-3 + data table, R6 binding bullet, P20 |
| 3. Walled glob only floor-checked | LOW | Note added: plan/W3 seat MUST pin the glob to the actual built file set, verify seat re-rules it against the built diff; floor `>= 1` and planted-fixture canary kept as-is. New residual R-W2-12. Measured current state recorded. | S1 source-text boundary, R-W2-12 |

Left intact (not reopened, per the instruction): the broadcast-hole fix (numeric-only
recipient ids, `course_` never appended); the new-sender decision D1 and the outcome
partition R5 including the 429 deviation D3 and pins P6-P8; the symbol-level
one-institution pin (named imports equal exactly `["sendStudentConversation"]`) and S1
steps 1-7; owner gating S2 and P10-P12; S3 binding invariants I-BIND-1/2/4 and egress
P18; S4 preview/confirm; S5; the diagnostics option A (R8); the maxDuration analysis
(P5 premise, R-W2-2); the live-read design R7; table L values other than the added
sharing note on `SENDING_STALE_MS`. The wave-gate canary list in section 5 is unchanged.

Not determined (unchanged in kind): whether Postgres evaluates DUP/RECONCILE/CLAIM as
written and whether CLAIM is atomic under concurrency - no live database exists here, so
P33a-e prove the predicates the code asks for, not their execution (section 4 caveat;
R-W2-7, R-W2-11).
