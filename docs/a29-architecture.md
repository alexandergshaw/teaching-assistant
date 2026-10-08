# A29 - architecture: bulk course message via Canvas Inbox (OC9 single-token form)

Seat: architecture (`loop-architect`, Opus). A fresh `loop-checker` gates this
document before any A29 implementer builds from it. This seat does not check its
own artifact. This document decides SHAPE; it writes no production code.

**This REPLACES the prior contents of this file in full.** The prior
`docs/a29-architecture.md` (revision 2, disposed 2026-09-22) was authored against
`docs/a29-ac.md` (K1-K14) under the pre-OC9 working model: N per-student POSTs, a
browser pump, a durable attempt ledger, a CAS row claim, a token, a stale sweep
and resume. **OWNER DECISION OC9 and DECISION 1 (both 2026-09-23) remove all of
that.** Section 11 disposes of every prior construction (C1-C15), layer (L1-L7),
wave (W1-W4) and residual (RA1-RA14). A sibling file `docs/a29-architecture-small.md`
embodied the N-EXPLICIT-ID form (Ruling 29); the checked round-2 AC RETIRES the
N-id premise (`docs/a29-acceptance-criteria.md:410`), so that file is superseded
too - see section 11.1.

**Consumes (and only these):**
- `docs/a29-acceptance-criteria.md` - the CHECKED round-2 AC (SHIP): AC-1..AC-10,
  LEV-1, residuals R-1..R-7, OV-1..OV-3, Q-1. Where this document and that one
  diverge, that one wins; where it and the owner's verbatim sentence diverge, the
  sentence wins (`docs/a29-acceptance-criteria.md:22`).
- The tree facts the AC cites, each RE-OPENED against HEAD this pass (section 1).

**Binding owner decisions, not reopened** (`docs/a29-acceptance-criteria.md:24-68`):
- **OC9:** "no courses should exceed 100." One POST to `recipients[]=course_<id>`,
  `group_conversation` absent (default false), `force_new` absent. No per-student
  pump, no ledger, no CAS, no sweep, no resume, no per-student receipt.
- **DECISION 1:** an N=1 (one-student) course REFUSES with a named, counted reason
  and sends nothing (at N=1 Canvas reuses a thread and ignores the subject; no
  instrument here can see that, so the design refuses rather than sends blind).
- **The emitted shape, not Canvas's outcome, is what the code holds.** Whether one
  POST to `course_<id>` expands into N private conversations is Canvas behaviour,
  UNCONFIRMED here (network-blocked, no key: R-7 / OC11) and FALSE at N=1.

**Measurement discipline.** Every quantity names the command that produced it.
Line counts use `@(Get-Content <f>).Count` (PowerShell), the mandated instrument
(`docs/loop/this-repo.md` section 3). Bash-tool commands are shown as `$ ...`,
PowerShell as `PS> ...`. Citations are `file:line` and every cited line was opened
this pass. Measured at HEAD `4e4487e6`, 2026-10-04.

---

## 0. The one-paragraph shape

A bulk course message is **ONE `POST /api/v1/conversations`** carrying exactly one
`recipients[]` value, the course token `course_<id>`, plus `context_code=course_<id>`,
`body` and optional `subject` - with `group_conversation` ABSENT (documented default
false) and `force_new` ABSENT. It is issued by ONE server action, invoked from a
rendered page under `requireUser()`, after a confirm showing course + count +
message. The action takes a course ID, derives the Canvas identity server-side from
the stored course row, reads a LIVE active-student COUNT, and runs a PURE refusal
predicate over that count: **count == 1 REFUSES** (N=1 reason), **count in [2..100]
PERMITS**, **count > 100 REFUSES** (over-100 reason, distinct from N=1). Only a
PERMITTED count reaches the one POST. The send returns ONE three-state outcome -
`accepted` / `refused` / `unknown` - with no per-student field and no delivery
claim. Privacy is held by **an allow-pattern `^course_\d+$` on the emitted recipient
value inside the course builder** and by **the ABSENCE of `force_new` and
`group_conversation`** - the shipped builder's unconditional `force_new=1`
(`inbox.ts:406`) is the Ruling-30 defect this design must not inherit.

---

## 1. Measurements (every quantity names its command, run from repo root)

| Fact | Value | Command / location (opened this pass) |
|---|---|---|
| Shipped single-recipient builder | `createConversation(courseUrl, recipientUserId, body, subject?)`: ONE `recipients[]`, `context_code=course_<id>`, **`force_new=1` UNCONDITIONAL** at `:406`, throws `canvasError` on non-ok, returns `void` | `src/lib/canvas/inbox.ts:384-420` |
| `group_conversation` / `bulk_message` in the builder | absent; only `force_new` is appended | `src/lib/canvas/inbox.ts:399-406` (read directly) |
| Only `recipients[]` append in the tree | 1 | `PS> @(Select-String -Path src/lib/canvas/inbox.ts -Pattern 'recipients\[\]' -AllMatches).Count` -> `1` |
| NO structure test pins `recipients[]`/`group_conversation`/`bulk_message` | 0 matches | `grep -rn 'recipients\[\]\|group_conversation\|bulk_message' src --include=*.structure.test.ts` -> none. A second builder adds no red structure test |
| Existing emitted-value guard | `/^\d+$/.test(payload.recipientUserId)` for the draft `message` kind, in the CALLER not the builder | `src/app/actions/messaging.ts:301`; its sibling for `reply` at `:284` |
| Existing single-student send action | `sendCanvasMessageAction` -> `createConversation`, guarded by `requireOwner()` (deprecated alias for `requireUser()`) | `src/app/actions/messaging.ts:254-269`; call path `postMessageDraftAction` `:300-310` |
| Canvas transport primitives | `canvasRequest(url, init, token)`, `canvasGet(url, token)`, `canvasError(status, inst)`, `resolveInstitution(url)` | `src/lib/canvas-fetch-response.ts:149,159`; `src/lib/canvas-core.ts:101,126` |
| Configured-LMS predicate | `canLms(c) = Boolean((c.canvasUrl??"").trim() && (c.institution??"").trim())` | `src/lib/courses-table-helpers.ts:603-605` (read directly) |
| Server-side course provenance | `getCourse(userId, id)` returns the caller's own row or null | `src/lib/supabase/courses.ts:73` |
| Auth primitives | `requireUser()` (per-user), `requireAppOwner()` (owner-private), `requireOwner()` (deprecated alias) | `src/lib/supabase/auth.ts:328,408,451` |
| Roster readers - no state filter | `listStudents` (`:248`) and `listCourseRoster` (`:286`) query `/users?enrollment_type[]=student&per_page=100`; neither sets a state filter | `src/lib/canvas/listings.ts:248-275,286-315` (read directly) |
| Roster reader - active-enrollment filter | `listStudentGradeSummaries` (`:318`) queries `/enrollments?type[]=StudentEnrollment&state[]=active&per_page=100`; one row per ENROLLMENT (a two-section student appears twice) | `src/lib/canvas/listings.ts:318-323` |
| No Canvas student-count endpoint | none; a count must be a roster/enrollment read's `.length` | `grep -rn "total_students\|student_count" src/lib` -> grading only (AC Measurements) |
| Pagination cap | `CANVAS_PAGINATION_PAGE_CAP = 20` at `per_page=100`; reads stop SILENTLY after ~2000 rows | `PS> Select-String src/lib/canvas-remote-url.ts -Pattern 'CANVAS_PAGINATION_PAGE_CAP\s*='` -> `export const CANVAS_PAGINATION_PAGE_CAP = 20;` |
| Plain-text drafter | `draftAnnouncementAction` "message" kind: "Use plain text ... do not use markdown, headings, or bullet symbols." | `src/app/actions/messaging.ts:436` |
| Markdown drafter (NOT reused) | A21 emits Markdown | `src/lib/prompt-announcement-prompt.ts` (AC row fact `backlog.yml:581`) |
| Mail-provider dependency | none | `grep -c -E "resend\|nodemailer\|@sendgrid/mail\|postmark\|mailgun\|client-ses" package.json` -> 0 |
| Sizes of edited files (`@(Get-Content).Count`) | inbox.ts 432, listings.ts 428, canvas.ts 124, messaging.ts 522, actions.ts 78, courses.ts 289, MessageDraftsTab.tsx 525 | PS loop over the seven files, this pass |

All edited files are far under the 1000-line ceiling
(`src/file-size-ceiling.structure.test.ts`).

---

## 2. THE SEND (AC-1, AC-4): a NEW SIBLING BUILDER, not a flag

### 2.1 Decision: add `createCourseConversation`, leave `createConversation` byte-for-byte unchanged

- **Object:** the function that emits the course POST, and the diff to the shipped
  builder.
- **Decision:** add a sibling `createCourseConversation(courseUrl, body, subject?)`
  in `src/lib/canvas/inbox.ts`; re-export it from `src/lib/canvas.ts` beside
  `createConversation` (`src/lib/canvas.ts:100`). **`createConversation` is not
  edited.** Rejected alternative: a boolean flag on `createConversation`. Reasons a
  flag is wrong here, each measured:
  1. **Three behaviours fork at once.** The recipient VALUE (`course_<id>` vs a bare
     numeric id), the emitted-value GUARD (`^course_\d+$` vs `^\d+$`), and
     `force_new` (OMIT vs the shipped unconditional append at `inbox.ts:406`) all
     differ. A flag threads three conditionals through one function whose existing
     caller must stay identical.
  2. **The non-regression proof is a diff, not a test, with a sibling.**
     `createConversation`'s only non-test caller is `sendCanvasMessageAction`
     (`messaging.ts:262`). If `createConversation` is untouched, its emitted request
     is provably unchanged by inspection (zero diff). A flag would require a test
     proving the default branch still appends `force_new=1` and still applies
     `^\d+$` - a regression surface the sibling does not create.
  3. **No structure test forces a single builder.** `recipients[]` appears once in
     the tree today and NO `*.structure.test.ts` pins that count (section 1), so a
     second `recipients[]` append turns no committed gate red. The "exactly one
     conversation builder" property the prior revision valued was a measured fact,
     not an enforced one.

### 2.2 What `createCourseConversation` emits, and the guard inside it

- **Object (a):** the value emitted as `recipients[]`.
- **Instrument (a) - the allow-pattern, INSIDE the builder** (Ruling 9 shape, AC-1):
  the builder's first statement derives the course id from `courseUrl`
  (`courseUrl.match(/\/courses\/(\d+)/)`, as `createConversation` already does at
  `inbox.ts:393`), forms the single token `course_<id>`, and asserts it matches
  `/^course_\d+$/` before it reaches the wire. A mocked-`canvasFetch` capture asserts
  EXACTLY ONE `recipients[]` value, matching `^course_\d+$`.
  - **Direction of failure:** more than one `recipients[]` value; a comma-joined
    string (`"course_1,course_2"`); an enumerated roster list; or a value not of the
    course form. Each FAILS. A test asserting only "a POST happened" survives all of
    these and is NOT this instrument (this is LEV-1's territory too - R-6).
  - **This is a NET-NEW guard, tight to the course form.** It does NOT loosen the
    `^\d+$` guard at `messaging.ts:301`; that guard protects the single-student draft
    path and `course_123` must keep FAILING it. The AC's phrase "gain an allow-pattern
    `^course_\d+$`" is satisfied by a guard with the course form in the COURSE builder,
    never by widening the numeric guard to accept both (which would let a course token
    through the single-student path - a regression).

- **Object (b):** the SET of parameters every course POST carries.
- **Instrument (b) - the frozen emitted-parameter set** (AC-4), over a recorded
  request: `[...new URLSearchParams(body).keys()].sort()` must equal exactly
  `["body","context_code","recipients[]"]` or, with a subject,
  `["body","context_code","recipients[]","subject"]` - and nothing else. In
  particular **NO `force_new` and NO `group_conversation`**. Plus a URL clause: the
  recorded request's `pathname` is `/api/v1/conversations` and its query string is
  empty (so `?mode=async` and friends cannot hide in the URL).
  - **Direction of failure:** an EXTRA key in the body or query - `force_new`,
    `group_conversation`, `bulk_message`, `mode`, anything - FAILS. `force_new`
    reappearing is the exact Ruling-30 defect (Canvas treats `force_new` as
    sufficient to make a multi-recipient send a GROUP batch), so reusing the shipped
    builder as-is for a course audience is what this catches.

### 2.3 The builder returns a THREE-STATE result, read from the HTTP status directly

- **Object:** the builder's return value for the one request.
- **Decision:** `createCourseConversation` returns
  `{ status: "accepted" } | { status: "refused"; reason: string } | { status: "unknown"; reason: string }`,
  mapping from `response.ok`/`response.status` DIRECTLY, NOT via `canvasError`
  (`canvas-core.ts:101` collapses the status, which is why the shipped builder cannot
  express this - RA7). Mapping (AC-7, Ruling 26):
  - 2xx -> `accepted`.
  - 400, 404, 422 -> `refused` (status + reason).
  - 401, 403 -> `refused` (credential reason; 403 is NOT a throttle).
  - **429, any 5xx, any thrown network error, any timeout -> `unknown`.** The default
    arm is `unknown`.
- **Instrument:** the builder against a mocked `canvasFetch` returning each of {201,
  400, 403, 404, 422, 429, 500, 502, a thrown `TypeError`, a rejected/aborted
  promise}; assert the class mapping above.
- **Direction of failure:** mapping any ambiguous outcome (429/5xx/network/timeout)
  to `accepted` OR `refused` is the failure; mapping a definite 4xx to `unknown` is a
  lesser failure and is also caught.

---

## 3. THE REFUSAL PREDICATE (AC-2 + AC-3): one PURE function over the count

- **Object:** a pure function `classifyRecipientCount(count: number)` that decides
  send-vs-refuse, and the refusal value it produces. It lives in a new pure module
  (`src/lib/bulk-course-message/refusal.ts`), imports nothing from Canvas or the DB,
  and takes a `number`.
- **Shape of the value:**
  ```
  type SendDecision =
    | { decision: "send"; count: number }
    | { decision: "refuse"; count: number; kind: "one-student" | "over-max"; reason: string };
  ```
  - `count === 1` -> `refuse`, `kind: "one-student"`, a reason naming that Canvas
    reuses a thread and ignores the subject at N=1 (DECISION 1).
  - `count >= 2 && count <= 100` -> `send`.
  - `count > 100` -> `refuse`, `kind: "over-max"`, a reason naming the over-100 cap
    (OC9) and carrying the count.
  - `count <= 0` -> `refuse`, `kind: "over-max"`? NO - a count of 0 is a distinct
    real case (invited-only course). It REFUSES with `kind: "one-student"`? Also no.
    **A zero count is refused as a THIRD leaf, folded into `one-student`'s LOW-bound
    family only if the test seat agrees; the safe default is: `count < 1` refuses
    with the low-bound reason (nothing to send), `count === 1` refuses with the N=1
    reason.** The predicate never PERMITS a count below 2. (See residual A-R1: the
    zero-vs-one distinction is a test-seat oracle call; both refuse, neither sends.)
- **Instrument (AC-2/AC-3):** a boundary table on the pure predicate - count 0, 1, 2,
  100, 101 - asserting: 0 refuse; 1 refuse `one-student`; 2 send; 100 send; 101 refuse
  `over-max`. The refusal carries the actual count and the two `kind`s are DISTINCT
  (a reader can tell which bound was hit).
- **Direction of failure:** count > 100 producing a `send`; count 100 refused
  (off-by-one); count 1 permitted; count 1 and count 101 producing the same `kind`;
  the refusal omitting the count. The direction that must not be rewarded: a refusal
  that silently drops to a partial send (there is no partial - one POST or none).
- **The seam AC-2/AC-3 mock:** the predicate takes a `number`, so the boundary tests
  call it directly with the literal count - no Canvas, no DB. The COUNT's derivation
  (section 4) is a separate, separately-mocked concern. This split is deliberate: the
  boundary logic is pure and total; the count's trustworthiness is section 4's.

---

## 4. THE COUNT SOURCE (R-1): a new thin ACTIVE-enrollment count reader

### 4.1 Decision: `countActiveCourseStudents`, querying the `state[]=active` enrollment shape, deduped by user id

- **The requirement (AC-2/AC-3):** "the count must be the active-student count."
- **The two existing readers, and why neither is used as-is:**
  - `listStudents`/`listCourseRoster` (`listings.ts:248,286`) query
    `/users?enrollment_type[]=student` with **NO state filter**. Their `.length`
    counts students regardless of enrollment state, so it can OVERCOUNT invited or
    inactive enrollees. That is not the active-student count the AC names.
  - `listStudentGradeSummaries` (`listings.ts:318-323`) queries
    `/enrollments?type[]=StudentEnrollment&state[]=active` - the only reader whose
    filter NAMES active - but it returns one row per ENROLLMENT (a two-section student
    twice) and carries `grades`, so counting through it couples the predicate to grade
    fields and double-counts people.
- **Decision:** add a thin reader `countActiveCourseStudents(code, courseId): Promise<number>`
  in `src/lib/canvas/listings.ts`, re-exported from `src/lib/canvas.ts`. It queries
  the SAME active shape as `:323`
  (`/enrollments?type[]=StudentEnrollment&state[]=active&per_page=100`), follows
  `parseNextLink` through `assertCanvasSuppliedUrlIsSameOrigin` (required - the
  pagination-guard structure test counts call sites, `canvas-pagination-guard.structure.test.ts`),
  and returns the count of **DISTINCT `user_id`s** (dedup via a `Set`, because the
  endpoint returns one row per enrollment). It returns a `number`, not a grade array.
- **Justification, stated against the tree, not recalled:**
  1. The AC names "active student"; only `state[]=active` names active, so the
     enrollment endpoint's filter is the correct one and the `/users` readers are not.
  2. The refusal bounds (N=1, N>100) are about PEOPLE; dedup by `user_id` makes the
     count people, not enrollment rows (`listings.ts:318` returns per-enrollment rows).
  3. A grade-free thin reader avoids coupling the predicate to `listStudentGradeSummaries`'s
     grade shape and avoids its double-count.

### 4.2 Pagination and failure cannot cause a false PERMIT

- **The ~2000 cap does not threaten either bound.** At `CANVAS_PAGINATION_PAGE_CAP = 20`
  x `per_page=100` the read stops after ~2000 rows. 100 << 2000, so the high bound is
  decided inside one or two pages. A course over 2000 active students reads as ~2000,
  which is still > 100 and still REFUSES - a silent cap cannot turn a > 100 course into
  a PERMIT. The low bound (N=1) is far under the cap. So the cap is irrelevant to the
  decision and this is stated rather than guarded.
- **A FAILED count read sends nothing (AC-5).** The count read IS the liveness proof:
  it is the Canvas request AC-5 needs anyway. If it throws, the predicate is never
  reached and no POST is made (section 5).

### 4.3 The seam, and the honest limit

- **Seam for AC-2/AC-3:** the predicate consumes the returned `number`; a separate
  test for the reader mocks `canvasGet` to return N active-enrollment rows (including a
  two-section duplicate) and asserts the deduped count and the paginated follow.
- **Honest limit (R-7 / OC11):** whether Canvas's `course_<id>` recipient expansion
  messages EXACTLY the deduped active-student set this reader counts is Canvas
  behaviour I cannot verify here (network-blocked, no key). The count is a PRE-FLIGHT
  estimate - the closest measurable proxy for who Canvas will message, and the one the
  AC names. The design does not assert the expansion equals the count; it uses the
  count only to decide the two refusal bounds. Routed to owner verification (A-R2).

---

## 5. LIVE-LMS GATE + DISTINGUISHABLE REASONS (AC-5)

- **Object:** the course's stored row at the send entry point, and the send path when
  the count read fails.
- **Construction:**
  1. The action takes a course ID (not a URL), and derives identity server-side:
     `getCourse(userId, courseId)` (`courses.ts:73`, whose query is
     `.eq("user_id", userId).eq("id", id)`), so the row is the caller's own or null.
     A null row refuses with zero outbound requests. This closes the
     server-side-location-but-client-determined-value hole (a caller cannot send a
     linked-looking course).
  2. `canLms(row)` (`courses-table-helpers.ts:603`) gates: false -> refuse, with the
     category (`not-linked` when `canvasUrl` empty, `needs-institution` when
     `institution` empty) as a KIND, zero Canvas requests.
  3. "Live" (actually reachable) is proven by `countActiveCourseStudents` succeeding.
     Two FAILURE categories, set where the failure is CAUGHT (Ruling 26, category not
     string compare):
     - credential resolution throws before the wire (`resolveInstitution` ->
       `CANVAS_CREDENTIAL_REQUIRED_MESSAGE`) -> `kind: "no-credential"`.
     - the transport rejects (network/DNS) -> `kind: "canvas-unreachable"`.
- **Instrument:** the action invoked directly (node-env, store + `canvasGet` mocked):
  (1) row with no `canvasUrl`; (2) `canvasUrl` and no `institution`; (3) both present
  but credential resolution throws; (4) both present but `canvasGet` rejects with a
  network error; (5) both present and the read succeeds. Count outbound conversation
  POSTs per call.
- **Pass condition:** cases 1-4 make ZERO conversation POSTs; cases 1-2 make zero
  Canvas requests at all; `kind` is `not-linked` / `needs-institution` /
  `no-credential` / `canvas-unreachable` respectively, each distinct; case 5 proceeds
  to the predicate. The admitted set is exactly the complement of `canLms`'s two
  excluded categories - the action refuses on the shared `canLms` predicate and does
  not define a second one.
- **Direction of failure:** a course failing `canLms` reaching any Canvas request;
  a conversation POST after the count read failed; `no-credential` and
  `canvas-unreachable` collapsing to the same reason (sending the instructor to
  reconnect an account that is connected). A test comparing only `reasonA !== reasonB`
  is also a failure - it passes on two equally useless strings (Ruling 26); the test
  pins the KIND.
- **Display half is READING/OWNER (OV-2):** the control absent / visibly unavailable
  with the reason on a course without a live link. Nothing renders under vitest.

---

## 6. AUTH (AC, Ruling 17): `requireUser()` written EXPLICITLY

- The new send action calls `requireUser()` (`auth.ts:328`) in its own body, written
  literally - NOT the deprecated `requireOwner()` alias (`auth.ts:451`), which is a
  "deliberately less restrictive" temporary alias.
- **Justification:** Canvas credentials are per-user (keyed on the caller's own user
  id), so each signed-in instructor sends to their own courses with their own token;
  nothing in A29 reaches an owner-private shared secret. `requireAppOwner()`
  (`auth.ts:408`) is reserved for owner-private capabilities and is not this.
- `src/app/actions/action-guard-coverage.test.ts` (an `owns` walker, section 10) will
  require each new `"use server"` export to carry its guard in its own body; writing
  `requireUser()` explicitly satisfies it without inheriting the alias.

---

## 7. OUTCOME TYPE + COPY (AC-6, AC-7)

- **Object:** the send's outcome type and the result copy.
- **Construction:** the action returns ONE
  `BulkCourseMessageOutcome =
    { status: "accepted" }
    | { status: "refused"; kind: RefusalKind; reason: string }
    | { status: "unknown"; reason: string }`
  where `RefusalKind` is the closed union `"not-linked" | "needs-institution" |
  "no-credential" | "canvas-unreachable" | "one-student" | "over-max" |
  "canvas-refused"`, with a `satisfies Record<RefusalKind, string>` copy map so adding
  a kind without copy fails `tsc`. **There is NO per-student field, NO array, NO
  `length`-bearing field, NO recipient identifier.** The three-state from the builder
  (section 2.3) flows straight through for the `accepted`/`canvas-refused`/`unknown`
  arms; the predicate and gate supply the refusal arms before any POST.
- **Instrument (AC-7):**
  - [MACHINE] a type-level pin: the outcome type references no array/`Set`/`Map`/`length`
    field and no per-student receipt; an ambiguous 5xx/timeout after the request went
    out is `unknown`, never `refused` (section 2.3's mapping test covers this).
  - [READING] a source-text scan over the feature's user-facing string literals for
    the forbidden delivery words, matched case-insensitively on a word boundary:
    `delivered`, `received`, `emailed`, `sent`. The strongest honest copy is
    "Canvas accepted the request". (Measured green on arrival over the feature's
    existing files - the new files do not exist yet.)
- **Direction of failure:** the outcome type gaining a per-student delivery field; any
  state name or copy asserting a student received or was emailed the message; an
  ambiguous failure recorded as `refused`.
- **The private-conversation OUTCOME is Canvas's and UNCONFIRMED** (R-7 / OC11). The
  code holds only the EMITTED SHAPE; `accepted` means "Canvas accepted the request",
  never "a student received an email" (OV-3).

---

## 8. PLAIN-TEXT BODY (AC-9) + NO MODEL/MAIL HOST ON THE SEND (AC-6)

**Note on the brief's citation.** The task brief cited "AC-8" for the plain-text body;
the checked AC assigns plain text to **AC-9** and the confirm to **AC-8**
(`docs/a29-acceptance-criteria.md:320,337`). This document binds to the AC's numbering
and does not adopt the slip.

### 8.1 Plain text (AC-9)

- **Object:** the `body` value in the emitted request when the body came from a drafter.
- **Construction:** the send path performs NO Markdown-to-HTML conversion; the body on
  the wire equals the confirmed body. The only drafter the surface wires is
  `draftAnnouncementAction` (`messaging.ts:436`), which already instructs the model to
  emit plain text with no markdown. As a belt-and-suspenders pin (and to cover the case
  the owner later wires A21's Markdown drafter, E3/R-5), a drafted body passes through a
  pure `canvasInboxPlainText(body)` normalizer (new module
  `src/lib/bulk-course-message/plain-text.ts`) that strips Markdown emphasis/heading/list
  markers and any HTML tags while keeping the text. A FREE-TYPED body is taken as-is.
- **Instrument (AC-9):** given a body containing Markdown markup (heading, bold, a
  list) fed through the drafter path, assert the emitted `body` carries neither raw
  Markdown markup nor HTML tags. **The oracle for `canvasInboxPlainText` is the test
  seat's (A-R3)** - a frozen input/output table, pinned on the FACT (no `#`, `*`, `_`,
  backtick, `<tag>`), never on a hand-chosen spelling (`source-text-tests-overspecify`).
- **Direction of failure:** literal Markdown or HTML tags in the emitted body. Fires
  only when a drafter feeds the body.
- **Honest risk, named:** a normalizer can mangle legitimate text (e.g. a literal `#1`).
  It is kept conservative and is a SEPARATE pure module with its own oracle, NOT a
  reuse of `markdownToHtml`/`markdown-lite` (which are not interchangeable and are
  renderers, not strippers). If the owner prefers to rely solely on
  `draftAnnouncementAction`'s plain-text output and drop the normalizer, the AC-9
  instrument still passes because that drafter emits no markup - the normalizer is the
  robustness margin, not the mechanism.

### 8.2 No external egress on the send (AC-6)

- **Object:** the outbound requests the send path actually makes.
- **Instrument:** drive the full action against a recording `vi.stubGlobal('fetch', ...)`
  AND a `canvasFetch` mock (both seams - `vitest.setup.ts`'s throwing stub is bypassed
  by a test's own `stubGlobal`, and `canvasFetch` dials `node:https`, so each seam is
  blind to what the other sees; the recorded host set is their union). Assert every
  outbound host is only Canvas + Supabase (+ the token endpoint the send needs). No
  mail-provider host, no model host.
- **Direction of failure:** any request during a driven send reaching a mail or model
  host; a body that cannot be sent without a model call. Drafting via
  `draftAnnouncementAction` is OPTIONAL and a separate, earlier action; the SEND path
  makes no model call. The instrument must be sabotage-checked (add one
  `fetch("https://example.com")` in the send path and confirm red).
- Measured support: `package.json` carries no mail-provider dependency (section 1), so
  this is a pin against a future regression, not a description.

---

## 9. CONFIRM + DOUBLE-SUBMIT GUARD (AC-8, R-2)

- **Object:** what the instructor sees before the irreversible send, and the guard
  against a double-click.
- **Construction:** the confirm surface shows the course name, the recipient COUNT
  (the exact number `countActiveCourseStudents` returned and the predicate used), and
  the message body/subject as it will leave. The send does not fire without that
  confirm. A LIGHT double-submit guard: the confirm control is disabled while the one
  request is in flight (a client in-flight flag), and the action issues exactly one
  POST. OC9 removed the durable ledger / server token / CAS, so there is NO server-side
  idempotency key - the residual hazard is a double-click, not partial state, and the
  in-flight disable is sized to it (R-2).
- **Instrument:** [READING/OWNER] (nothing renders under vitest, OV-2) the confirm
  shows all three; the count shown equals the count the predicate used; a double-click
  on confirm issues one POST (owner browser check).
- **Direction of failure:** a send firing without a confirm showing all three; the
  count shown differing from the predicate's; a double-click issuing two POSTs.

---

## 10. NO UNATTENDED PATH SENDS (AC-10) + the `owns` dependency

- **Object:** whether any unattended caller can reach the send action.
- **Instrument [MACHINE]:** a new structure test
  `src/lib/bulk-course-message/unattended-callers.structure.test.ts` walks every
  non-test `.ts`/`.tsx` under `src/lib/workflows/**` and `src/app/api/**` as SOURCE
  TEXT and asserts none contains the send action's identifier (e.g.
  `sendBulkCourseMessageAction`). A call requires the callee's name in the calling
  module, so an identifier check is strictly stronger than an edge check and is immune
  to the barrel (Ruling 19 - the import-edge instrument is withdrawn because every
  workflow imports the actions barrel; `src/app/actions.ts` is 54 `export *` lines).
  The test ALSO asserts no `import * as ... from "@/app/actions"` exists in the tree
  (name-indexed dispatch would route around an identifier check), failing loudly if
  that assumption ever breaks. It carries `vi.setConfig({ testTimeout: 30_000 })` (it
  is a whole-tree walker; the config sets no global timeout).
- **Green on arrival and after:** `grep -rn "BulkCourseMessage" src/lib/workflows src/app/api`
  -> none today; the wave write sets (section 12) write NO path under either forbidden
  directory, and this test lives OUTSIDE them.
- **Step-registry canary:** `src/lib/workflows/headless.test.ts` pins
  `HEADLESS_SAFE_STEP_TYPES.size`; A29 adds no step type, so that number is unchanged
  before and after. A wave that bumps it has added an unattended path.
- **Degradation clause (AC-10):** the identifier structure test IS buildable here, so
  this is MACHINE, not a reading-only degrade. The test seat confirms the exact
  identifier list before the test is written.
- **Direction of failure:** a workflow step or route handler reaching the send. NOT a
  failure: A29 appearing in some module's import closure (it does the moment it is
  barrel-exported, and that carries no information).

---

## 11. Disposition of the prior version

**Ids re-derived LAST, after all renumbering.** The prior `docs/a29-architecture.md`
(revision 2) was the pre-OC9 ledger/pump design. OC9 and DECISION 1 withdraw the bulk
of it. "Withdrawn with an enforcer" names what that enforcer protected and who, if
anyone, now holds it.

| Prior id | What it was | Disposition under OC9 / DECISION 1 | Now |
|---|---|---|---|
| C1 | allow-pattern + frozen param set (recipient = numeric id; `force_new` IN the set) | **KEPT, RE-DERIVED.** Pattern becomes `^course_\d+$`; the frozen set now EXCLUDES `force_new` and `group_conversation` | section 2.2, AC-1/AC-4 |
| C2 | three-state transport result (per request) | **KEPT, RE-DERIVED** for ONE request | section 2.3, AC-7 |
| C3 | durable attempt ledger (2 tables, partial unique index) | **WITHDRAWN by OC9.** Enforcer protected: double-send guard + resumability. Double-send -> light client guard (R-2); resumability -> withdrawn (one POST, no partial state) | - / R-2 |
| C4 | double-send guard keyed on course via the index | **WITHDRAWN by OC9.** Replaced by the light in-flight guard | section 9, R-2 |
| C5 | summariser partition; no countable collection to client | **WITHDRAWN by OC9** (one outcome, no per-student counts). Its "no array/list to the client" intent survives as the outcome-type pin | section 7, AC-7 |
| C6 | browser pump + CAS row claim + stale sweep | **WITHDRAWN by OC9** (no pump, no per-student rows). Enforcers protected: two-tab race, partial-state recovery - both dissolve because there is no per-student state to race | - |
| C7 | token authorises the attempt | **WITHDRAWN by OC9** (no ledger, no token) | - |
| C8 | roster reader with enrollment state + completeness; enumerate recipients | **REDUCED to count-only.** The app no longer enumerates recipients (Canvas expands `course_<id>`); the active-enrollment filter survives for COUNT accuracy | section 4, R-1 |
| C9 | server holds the instructor's text; refusal read path | **WITHDRAWN by OC9** (no durable attempt row). Client draft + confirm hold the text; per-course control persistence -> UX seat | R-4 |
| C10 | body leaves as plain text | **KEPT** (+ the normalizer pin) | section 8.1, AC-9 |
| C11 | honest limit; no delivery claim; forbidden words incl. `sent` | **KEPT** | section 7, AC-7 |
| C12 | request recorder (no model/mail host), two seams | **KEPT** | section 8.2, AC-6 |
| C13 | server-side LMS gate; provenance from the stored row; 3 server-distinguishable cases | **KEPT** | section 5, AC-5 |
| C14 | distinct reasons: no-credential vs unreachable, category not string | **KEPT** | section 5, AC-5 |
| C15 | no unattended CALL (identifier check, step-registry canary) | **KEPT** | section 10, AC-10 |
| section 6 | the total per-student state machine (6 rows) | **WITHDRAWN by OC9** (no per-student states; one POST, one outcome) | - |
| L1-L7 | ledger / summariser / 3 actions / pump hook / surface layers | **RESTRUCTURED.** L1 transport KEPT/re-derived; L2 roster -> count reader; L3/L4 (ledger/summariser) withdrawn; L5 three actions -> ONE action; L6 pump hook withdrawn; L7 surface KEPT, re-homed (section 13) | section 12 |
| W1-W4 | 4 waves (ledger, transport+roster, actions+pump, surface) | **RESTRUCTURED** to 3 waves | section 13 |
| RA5 | `CourseRow.tsx`/`CoursesTable.tsx` size liability (surface on the LMS cell menu) | **WITHDRAWN:** the surface is no longer on `CourseRow` (section 13 recommends a dedicated compose surface). New size residual A-R4 for the surface host | A-R4 |
| RA6 | two roster readers disagree on state filter | **KEPT** as the count-source residual | R-1 |
| RA7 | `canvasError` collapses HTTP status app-wide | **KEPT.** A29 routes around it in `createCourseConversation` (section 2.3); every other caller still cannot tell a throttle from a refusal | A-R5 |
| RA8 | `messaging.ts` has no test file; the shipped send is untested | **KEPT.** W1 owes a behavioural test proving `createConversation` is unchanged (its diff is zero; the test pins the emitted shape) | section 13 W1 |
| RA9 | `requireUser()` written explicitly, not the deprecated alias | **KEPT** | section 6 |
| RA1 | A21's voice for a private message | **KEPT** | R-5 |
| RA2 | the leverage three-way call | **KEPT**; the class call is the owner's | section 15, LEV-1 |
| RA14 | reload has no discovery surface | **WITHDRAWN** with the ledger (no durable attempt to rediscover) | - |
| RA10, RA12, RA13 | ruling-number / barrel-count / scan-rename corrections | **MOOT** under the re-scope (RA13 withdrawn with C5; RA10/RA12 are orchestrator ledger items unaffected by shape) | - |

### 11.1 The sibling file `docs/a29-architecture-small.md`

That file (revision 2, 2026-09-23) made the **N-EXPLICIT-ID form** primary - one POST
carrying N bare numeric `recipients[]`, derived from a live enrollments read, with a
durable row per (user, course). **The checked round-2 AC RETIRES the N-id premise**
(`docs/a29-acceptance-criteria.md:410`: "RETIRED by OC9: the app emits a SINGLE
`course_<id>` recipient token, NOT an enumerated id list"). So that file is superseded
by THIS one; its durable-row guard is the same ledger OC9 removed (disposition = C3/C4
above: withdrawn, replaced by the light double-submit guard R-2). I do not re-dispose
its S-numbered requirements line by line - it is a different file and not in my input
set - but I name the one enforcer worth carrying so none is silently lost. The
orchestrator should mark `docs/a29-architecture-small.md` superseded.

---

## 12. The layers, and the file that CALLS each one

**THE SURFACE IS A LAYER** (`verify-reachability-not-just-correctness`): L5 is what
makes L1-L4 reachable, and it ships in the same chunk.

| L | What it is | New/changed files | Called by |
|---|---|---|---|
| L1 | Course send builder: one `course_<id>` POST, `^course_\d+$` guard, frozen param set (no `force_new`/`group_conversation`), three-state result (sections 2) | `src/lib/canvas/inbox.ts` (add `createCourseConversation`; `createConversation` UNCHANGED); re-export in `src/lib/canvas.ts` | L4's send action |
| L2 | Active-student count reader (section 4) | `src/lib/canvas/listings.ts` (add `countActiveCourseStudents`); re-export in `src/lib/canvas.ts` | L4's send action |
| L3 | Pure refusal predicate (section 3) + pure plain-text normalizer (section 8.1) | `src/lib/bulk-course-message/refusal.ts`, `src/lib/bulk-course-message/plain-text.ts` | L4; L5 (normalizer at draft-accept) |
| L4 | ONE server action `sendBulkCourseMessageAction(courseId, subject, body)`: `requireUser()` explicit; `getCourse` provenance; `canLms` gate; count read; predicate; the one POST; the three-state outcome type (sections 5-7) | `src/app/actions/bulk-course-message.ts`; one `export * from "./actions/bulk-course-message";` line in `src/app/actions.ts` | L5 (the surface) |
| L5 | **THE SURFACE** (Q-1 fork, section 13.3): subject, body, optional plain-text "Draft with AI", confirm showing course+count+message, the honest-limit copy, the result outcome | the surface component (host per Q-1) + its wiring file | the page/tab that mounts it |

`src/app/actions.ts` is a barrel and is NOT counted as L4's caller; L5 is. The barrel
file is `src/app/actions.ts` (78 lines), NOT `src/app/actions/index.ts` (does not
exist).

---

## 13. Wave cut (disjoint write sets, caller rule, gates)

Three waves. Write set = the files a wave EDITS plus the tests that read those files
(including AS SOURCE TEXT). The pure/transport layer shares the `src/lib/canvas.ts`
re-export wiring file, so one wave owns it.

### 13.1 The cut

| Wave | Write set (exact paths) | Pure/surface | Contains its caller? | Independently gateable? |
|---|---|---|---|---|
| **W1 - pure send-builder + predicate + count + normalizer** | `src/lib/canvas/inbox.ts`; `src/lib/canvas/listings.ts`; `src/lib/canvas.ts`; `src/lib/bulk-course-message/refusal.ts`; `src/lib/bulk-course-message/plain-text.ts`; `src/lib/canvas/inbox.test.ts` (RA8 - new, pins `createConversation` unchanged + `createCourseConversation`'s emitted shape); `src/lib/canvas/listings.test.ts`; `src/lib/bulk-course-message/refusal.test.ts`; `src/lib/bulk-course-message/plain-text.test.ts` | PURE (mocked `canvasFetch`/`canvasGet`) | builder/predicate/count/normalizer in-wave caller = their tests; production caller = W2 (named) | YES (vitest, node-env) |
| **W2 - the action + the unattended gate** | `src/app/actions/bulk-course-message.ts`; `src/app/actions.ts`; `src/app/actions/bulk-course-message.test.ts`; `src/lib/bulk-course-message/unattended-callers.structure.test.ts` | action (mocked store/Canvas) | in-wave caller = its test; production caller = W3 (named) | YES (vitest) |
| **W3 - the surface** | the surface component + its single wiring/mount file (host per Q-1, section 13.3) | surface (owner-verify) + reading/nav (vitest) | YES - the mount file is the caller of the surface, in this wave | machine part (nav/reading) YES; render/confirm/count-display OWNER (OV-2) |

### 13.2 Order, disjointness and the one-push rule

- **W1 depends only on shipped primitives** (`canvasRequest`/`canvasGet`/`resolveInstitution`,
  the leaf types). It is first.
- **W2 depends on W1** (imports `createCourseConversation`, `countActiveCourseStudents`,
  `classifyRecipientCount`, `canvasInboxPlainText`). Sequential after W1.
- **W3 depends on W2** (mounts the action's surface). Sequential last.
- **Exact-path disjointness:** no path appears in two write sets (W1 is all `src/lib/**`
  canvas + bulk-course-message; W2 adds `src/app/actions/**` + the structure test; W3 is
  the surface files only). An implementer re-runs `cat <sets> | sort | uniq -d` ->
  empty, with the duplicate-a-set canary.
- **Caller rule:** W1 and W2 each ship a pure/action library whose production caller
  lands in a NAMED later wave. The chunk lands as ONE push, so no export reaches main
  without its caller by end of chunk. **W1 and W2 may not be pushed alone.** This is
  the S1-S5 / PRES-1 wave-3 precedent (a pure piece consumed by its test in-wave and by
  a later wave that names the caller).
- **Concurrency guards** (`parallel-disjointness`): the waves are sequential here (each
  depends on the prior), so the batch-of-3 cap is not exercised; still, exactly one
  actor runs `npx tsc --noEmit` at a time, no `git add -A`/`git stash`, explicit paths
  only, and `docs/BACKLOG.md`/`docs/REGRESSION.md` are the orchestrator's.

### 13.3 The surface (Q-1, owner fork) - both readings, a recommendation, and why the send logic is surface-independent

Q-1 (`docs/a29-acceptance-criteria.md:433`): which surface hosts the control -
(a) a new action on the existing Messages / message-drafts surface
(`src/app/components/MessageDraftsTab.tsx`, 525 lines), or (b) its own new compose
surface under the announcement-composition area.

**The send logic is identical under either reading, and this is the load-bearing
claim.** L1-L4 (the builder, the count reader, the pure predicate, the normalizer, the
action, the outcome type) take a `courseId`, a `subject` and a `body` and name no
surface. Everything machine-checked here (AC-1..AC-7, AC-9, AC-10) is tested at L1-L4
with Canvas and the store mocked, with no component rendered. The surface only (i)
collects subject/body (optionally via the plain-text drafter), (ii) calls
`sendBulkCourseMessageAction(courseId, subject, body)`, and (iii) renders the confirm
(AC-8) and the outcome (AC-7). So **only W3's host file differs between (a) and (b);
W1 and W2 are byte-identical either way.**

**Recommendation: (b), a dedicated compose surface under announcement-composition.**
Reasons:
1. **Irreversibility isolation.** A whole-class send is irreversible (AC-8); hosting it
   beside per-draft single-student messaging in `MessageDraftsTab` raises the mis-click
   blast radius from one student to a whole class.
2. **The confirm needs a course -> live-count -> confirm flow** (AC-8 shows the count;
   AC-5 gates on `canLms` and a live read). A dedicated surface owns that flow cleanly;
   `MessageDraftsTab`'s per-draft model has no course-count step to reuse.
3. **Area fit.** The backlog area is `announcement-composition-surfaces`; a dedicated
   surface sits in its own area rather than overloading the Messages/drafts surface.
4. **Persistence (R-4).** A dedicated surface persists its own `ta-`-keyed controls
   without entangling `MessageDraftsTab`'s existing draft persistence.

**Cost of being wrong is one file.** If the owner prefers (a), only W3's host file
changes; L1-L4 and all their tests are unchanged. **Q-1 is the owner's call** and only
W3 depends on it (A-R6). This seat does not finalize it.

### 13.4 Gates per wave

Each runs only its own paths; a gate naming two or more test files uses
`npm run test:paths -- <p1> <p2> ...` (never a raw multi-path `vitest`), and the exit
code is read from a file, never a pipe.

```
# W1
npm run test:paths -- src/lib/canvas/inbox.test.ts src/lib/canvas/listings.test.ts src/lib/bulk-course-message/refusal.test.ts src/lib/bulk-course-message/plain-text.test.ts > w1.log 2>&1; echo $? > w1.code
# W2
npm run test:paths -- src/app/actions/bulk-course-message.test.ts src/lib/bulk-course-message/unattended-callers.structure.test.ts > w2.log 2>&1; echo $? > w2.code
# W3 (machine part)
npm run test:paths -- <the surface's reading/nav test(s)> > w3.log 2>&1; echo $? > w3.code
```

Plus, each wave: `npx tsc --noEmit` (no output); `npm run lint` (exit 0, no NEW warning
in the wave's files); the build compile-line `Compiled successfully` (NOT the exit
code, per the push-without-full-build gate); `git status --short` vs the assignment;
no `.claude/worktrees` copy edited. **Chunk gate before the single push:** the full
suite, `src/lib/no-emojis.test.ts` and `src/source-bytes.structure.test.ts` green over
the new files, and the unattended-callers walker carries its own 30s timeout.

---

## 14. `owns` - the file list, derived with the command whose output is pasted

Three parts: (a) the write set (section 13); (b) behavioural tests that call the
symbols W1/W2 touch; (c) every test that reads source files AS TEXT (a string one of
these greps could turn red is how a correct change goes red).

### 14.1 (c) source-text walkers

```
$ grep -rl "readdirSync" src --include=*.test.ts | sort        # 50 files (| wc -l -> 50)
```
Canary: `src/lib/no-emojis.test.ts` present (`| grep -c no-emojis.test.ts -> 1`). The
walkers that will BIND A29's new files:

| Walker | What it demands of A29's new files |
|---|---|
| `src/app/actions/action-guard-coverage.test.ts` (+ `-github-cohort`, `guard-overtightening`, `wholesale-auth-mock-population.structure`) | the ONE new `"use server"` export carries `requireUser()` in its own body (section 6) |
| `src/lib/use-server-exports.test.ts` | `bulk-course-message.ts` exports only async functions - no type re-export, no const |
| `src/lib/canvas-pagination-guard.structure.test.ts` | L2's `parseNextLink` follow dials the value `assertCanvasSuppliedUrlIsSameOrigin` RETURNS (counts call sites) |
| `src/file-size-ceiling.structure.test.ts` | every touched file < 1000 (section 1); carries a 30s timeout - a 5000ms failure is a finding |
| `src/supabase-migrations.structure.test.ts`, `.rls-coverage.structure`, `src/sql-citations.structure.test.ts` | **A29 adds NO migration** (OC9 removed the ledger), so these stay green and out of the write set - noted so an implementer does not add one |
| `src/lib/client-state-sweep.registry.test.ts` + `componentStorageKeys.structure.test.ts` | the surface's `ta-` keys must be registered/sweepable; no unregistered module-scope cache |
| `src/lib/canvas-client-boundary.test.ts`, `.transitive`, `.runtime-graph`, `src/lib/module-graph/runtime-import-graph.test.ts` | the surface is a client module; nothing in its closure reaches `src/lib/supabase/**` except the client; L4 (the action, server-only) must never be imported by the surface except as a server action |
| `src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts` | own the emoji/escape/BOM scans - do not hand-roll |
| `src/tools/vitest-paths/gate-commands.structure.test.ts` | any gate command A29 adds uses the `test:paths` wrapper |

**One walker A29 ADDS and owns** (section 10):
`src/lib/bulk-course-message/unattended-callers.structure.test.ts` reads every non-test
file under `src/lib/workflows/**` and `src/app/api/**` as source text. Nothing there is
in A29's write set, so it is green on arrival; a later chunk adding a workflow step that
calls the send turns it red - intended. It carries `vi.setConfig({ testTimeout: 30_000 })`.

### 14.2 (b) behavioural callers of the symbols W1/W2 touch

```
$ grep -rln "createConversation\|listStudentGradeSummaries\|listStudents\|listCourseRoster\|canLms" src --include=*.test.ts | sort
src/app/actions/action-guard-coverage-github-cohort.test.ts
src/app/actions/canvas-inbox.guard.test.ts
src/app/components/courses/useCourseImportActions.test.ts
src/lib/canvas.pullback.test.ts
src/lib/canvas/listings.test.ts
src/lib/course-intel/join.test.ts
src/lib/courses-table-helpers.exports.test.ts
src/lib/courses-table-helpers.lms-connection-status.test.ts
src/lib/courses-table-helpers.lms-render-sources.test.ts
src/lib/workflows/registry/steps.course-setup.rosters.test.ts
```
All must stay green. `createConversation` is NOT edited (section 2.1), so the
`createConversation`/`sendCanvasMessageAction` callers (`canvas-inbox.guard.test.ts`,
`canvas.pullback.test.ts`) are preservation checks with zero diff to lean on - which is
exactly why W1 adds the RA8 behavioural test pinning the unchanged emitted shape.
`canLms` is reused unchanged, so its callers (`courses-table-helpers.*`) are untouched.

---

## 15. Leverage (LEV-1) - the claim, and the class call is the owner's

**Trigger fired: feature work**, so a claim is owed; A29 earns the GUARANTEED class
(`docs/a29-acceptance-criteria.md:105`). The delivery channel is INHERITED
(`createConversation` exists; any action can reach Canvas). What A29 EARNS is a
code-held safety SHAPE the shipped builder lacks: one request carries the whole class
as a single `course_<id>` token with `group_conversation` not true and **no
`force_new`** (the shipped builder appends it unconditionally, `inbox.ts:406`), and it
REFUSES by a counted, named reason at BOTH bounds - over 100 (OC9) and at N=1 (DECISION
1) - rather than silently creating a reply-all thread or appending to an unrelated
thread under a subject nobody chose. That earned property is the EMITTED SHAPE and the
two-bound refusal; the per-recipient-conversation OUTCOME is Canvas's, UNCONFIRMED
(R-7) and FALSE at N=1, so it is NOT the claim. In a plain LLM chat the human is the
transport: it can draft text but cannot send to a Canvas course, cannot emit a
privacy-shaped send, and has no structural cap turning an oversized OR a one-student
class into a named refusal.

- **LEV-1 (removal test, owned by the test seat, R-6):**
  - Object: the request the A29 send builder emits for a course, vs that request with
    its individual-private-conversation EMITTED-SHAPE construction removed.
  - Instrument: a pure unit test with `canvasFetch` mocked to capture URL + body;
    assert `recipients[]` is EXACTLY ONE value matching `^course_\d+$`, no
    `group_conversation=true|1`, no `force_new`.
  - Direction of failure: RED when `force_new` is added back, OR `group_conversation`
    is set true, OR the single token is replaced by an enumerated list. A test
    asserting only "a POST happened" survives all three and is NOT LEV-1.
- **The class call (accept / redesign for more / reject in favour of Canvas's own
  compose) is the owner's, not this seat's** (RA2). Under OC9's "no course exceeds 100"
  answer, Canvas's native compose already creates individual private conversations for
  a class <= 100, so the earned advantage over the native path is the live-count
  refusal guard, not the private-fan-out itself.

---

## 16. Residual register

Each names owner, instrument, and the step that will measure it. A residual not in
`docs/BACKLOG.md` does not exist (`docs/DEV_LOOP.md` step 0); this seat does not write
the backlog under concurrency, so the orchestrator owes each a row. The AC's R-1..R-7
and OV-1..OV-3 are carried; architecture-specific residuals are prefixed `A-R`.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-1 | Count source. RESOLVED here: a new `countActiveCourseStudents` on the `state[]=active` enrollment shape, deduped by `user_id` (section 4). What survives: the two existing readers still disagree on state filtering (`listings.ts:248/286` vs `:318`); A29 adds a third rather than reconciling them | Whoever next touches roster reading | A fixture per enrollment state across all readers | A separate backlog item |
| R-2 | Light double-submit guard for the single synchronous send (OC9 removed the ledger/CAS; the hazard is a double-click). RESOLVED as a client in-flight disable (section 9); no server idempotency key | Architect (placed) + repo owner | Owner double-clicks confirm in a real browser | W3 + Verify |
| R-3 | The instructor is not choosing blind between this message and an announcement | UX seat | Copy + a route to the announcement composer | W3 UX pass |
| R-4 | Compose-surface controls persist per course under `ta-` keys; nothing authorising a send persists | UX seat | Source-text test for `ta-` keys + mount-effect hydration | W3 UX pass |
| R-5 | Whether A21's course-announcement (Markdown) voice suits a private class message (E3) | Repo owner | Read a real draft | Post-deploy owner verification |
| R-6 | LEV-1 removal-test construction (the leverage oracle) | Test seat | Mocked-`canvasFetch` request-capture oracle | Test seat, after Build + Verify |
| R-7 / OC11 | Canvas facts nothing here can measure: whether `POST /conversations` expands `course_<id>` into N private conversations, whether the email goes out per student preference, rate limits | Repo owner (research) | Live authenticated call against a sandbox | External-facts / Verify, before push |
| OV-1..OV-3 | The owner-verification claims (private arrival, control absence, both refusals shown, no delivery claim in copy) | Repo owner | Real browser + Canvas sandbox + a test student mailbox | Verify, before push |
| A-R1 | The predicate's ZERO-count leaf (invited-only course): both 0 and 1 refuse and neither sends; whether 0 gets its own reason or folds into the N=1 low-bound family is an oracle call | Test seat | The boundary table in `refusal.test.ts` (add a count-0 row) | Test notes, before W1's tests |
| A-R2 | The pre-flight count may not equal Canvas's actual `course_<id>` expansion set; the refusal bounds are decided on the count, not the expansion (section 4.3) | Repo owner | A sandbox send of a known-size class; compare who Canvas messaged to the counted set | Verify, before push (with R-7) |
| A-R3 | `canvasInboxPlainText` oracle (what markup is stripped, kept conservative) | Test seat | A frozen input/output table pinned on the fact, not a spelling | Test notes, before W1's tests |
| A-R4 | W3's surface host size (whichever Q-1 host): if an edit to an existing host (reading (a)) pushes it over the ceiling, the extraction is owed before W3 verifies | W3 implementer | `@(Get-Content <host>).Count` vs 1000 at the W3 gate | W3 wave gate |
| A-R5 | `canvasError` collapses the HTTP status app-wide; A29 routes around it in `createCourseConversation`, every other Canvas caller still cannot tell a throttle from a refusal | Whoever next needs status-level Canvas error handling | `grep -rn "canvasError(" src`; one fixture per status class | A separate backlog item |
| A-R6 | Q-1 surface placement (section 13.3): recommended (b), a dedicated compose surface; only W3's host file depends on it | Repo owner | Section 13.3's two readings | Owner confirms before W3; L1-L4 unaffected |

---

## 17. What I could not determine

- **Anything Canvas actually DOES.** Network blocked, no key. Every machine instrument
  here asserts what the app EMITTED, never what Canvas did. The `group_conversation` /
  `bulk_message` semantics, the `course_<id>` expansion (R-7/OC11/A-R2), and whether a
  conversation message emails a student (OV-3) are all owner verification.
- **Whether the pre-flight active count equals the recipient set Canvas expands
  `course_<id>` to** (A-R2). The design uses the count only for the two refusal bounds,
  not as an assertion about the expansion.
- **Whether `draftAnnouncementAction`'s voice (or A21's Markdown) suits a private class
  message** (R-5, E3) - a reading/owner judgement.
- **Anything about rendered markup, focus order or keyboard behaviour.** No component is
  rendered by any test here. Every UI claim (the confirm, the control absence, the copy)
  is READING, routed to OV-2, and NO criterion is enforced only by a render - the LMS
  gate is server-side (section 5), not a JSX prop.
- **The N=1 Canvas behaviour itself** (thread reuse, subject ignored) - DECISION 1
  chose to refuse rather than measure it; this design holds that refusal and does not
  fill the gap from recall.
