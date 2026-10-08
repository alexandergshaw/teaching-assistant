# A29 - acceptance criteria: bulk message to a course's students via Canvas

- Item: A29, area `announcement-composition-surfaces`, kind feature, state
  unscoped (`docs/backlog.yml:571-582`).
- Seat: `loop-ac` (Opus). A fresh `loop-checker` gates this document before any
  later seat consumes it.
- This is the AC round only. No mechanism, no wave plan, no oracle, no code. The
  architect owns shape (extend-vs-new-function, the count read, the confirm
  mechanism); the test seat owns oracle and sabotage; the plan owns wave order.
  Where this document names a code location it is to make a criterion
  satisfiable, never to design the build.
- **This is a RE-SCOPE, not a first version.** The prior criteria
  (`docs/a29-ac.md`, K1-K14 / P1-P7 / L1) were written before OWNER DECISION OC9
  (2026-09-23). OC9 removes most of that build. Section "Disposition of the prior
  version" maps every prior criterion to kept / handed over / withdrawn.

## The owner's words (verbatim, `docs/backlog.yml:575`)

> "for courses that have a live lms connection, i need a feature that sends out a
> bulk email to the students via the email they have in canvas."

Where any criterion below and this sentence diverge, the sentence wins.

## The owner decisions this document codifies (do not reopen)

From `docs/owner-decisions-2026-09-23.md`, the A29 row note
(`docs/backlog.yml:581`), and the round-2 rulings (`docs/a29-rulings-round2.md`)
that DECISION 1 carries; DECISIONS, not rulings, so applying them is
transcription, not a new round (`docs/loop/iteration-caps.md` cap 2).

1. **The channel is the Canvas conversation, and that IS Canvas's emailer**
   (owner, 2026-09-21, verbatim: "message on canvas and also use canvas built in
   emailer"). A Canvas Inbox conversation is delivered to each student by email
   through Canvas's own notification system. There is no separate Canvas
   send-an-email endpoint, and **no student email address is ever read or handled
   by the app** - which removes the address-source question entirely.
2. **OC9 (owner, 2026-09-23, verbatim): "no courses should exceed 100."** A
   single POST to `/api/v1/conversations` with `recipients[]=course_<id>` and
   `group_conversation` at its default of `false` is the EMITTED SHAPE the code
   holds - one `course_<id>` recipient token, no `group_conversation`, no
   `force_new` - so the app exposes no roster and opens no reply-all thread. That
   one POST is INTENDED to become individual private conversations, one per
   recipient, but the N-conversations expansion is Canvas's behaviour, is
   UNCONFIRMED here (network-blocked, no key: R-7 / OC11), and is FALSE at N=1
   (DECISION 1, item 4). So the design holds the emitted shape; it does NOT assert
   the per-recipient-conversation OUTCOME as code-held or unconditional. Under 100
   that one POST is the whole send. So there is NO per-student pump, NO durable
   attempt ledger, NO CAS, NO stale sweep, NO resume machinery, and NO per-student
   receipt.
3. **The over-100 named refusal (OC9, owner, 2026-09-23).** Above 100 recipients
   the feature REFUSES with a counted, named reason - it does not fan out per
   student and does not flip to `bulk_message` / `group_conversation`. This is the
   HIGH-bound refusal; it is DISTINCT from the N=1 LOW-bound refusal in item 4,
   and both are kept.
4. **DECISION 1 - the one-student (N=1) named refusal (owner, 2026-09-23;
   `docs/owner-decisions-2026-09-23.md:12-39`, carrying RULING 17,
   `docs/a29-rulings-round2.md:24-50`).** The owner was asked whether to measure
   single-recipient Canvas behaviour first (one authenticated `curl`) or to design
   a refusal and ship without knowing, and chose: design the refusal, ship without
   the measurement. At N=1, with `group_conversation` ABSENT and `force_new`
   ABSENT, Canvas's `batch_private_messages` is false and control reaches
   `initiate_conversation`, which REUSES an existing thread and IGNORES THE SUBJECT
   - a defect no instrument here can see, because every instrument asserts on what
   was EMITTED and this lives in what Canvas DID. So an N=1 course REFUSES with a
   named, counted reason and sends nothing; it does not attempt a send whose
   outcome it cannot predict. Per DECISION 1's visible-assumption rule, the
   unconfirmed N-conversations expansion (OC11) is NOT read as confirmed anywhere
   the design depends on it.

## Environment ceilings that bind every criterion

Measured facts, not assumptions (`docs/loop/this-repo.md`; commands in
"Measurements" below):

- NO component is rendered by any test here (vitest is node-env,
  `include: ["src/**/*.test.ts"]`). Every claim about a control appearing, a
  confirm dialog, or a click landing is a READING or OWNER-VERIFICATION claim -
  never machine-checkable. Each such criterion says so.
- Tests are network-blocked; `vitest.setup.ts` throws on real `fetch`. The send
  LOGIC (the emitted request shape, the refusal predicate, the outcome type) is
  machine-checkable only with **`canvasFetch` / `canvasGet` mocked, never real
  fetch** (`AGENTS.md` memory `tests-are-network-blocked.md`).
- No API key, no Canvas sandbox reachable here. Whether Canvas actually expands
  `course_<id>` into N private conversations, and whether a student's
  notification preference turns the copy into an email, is OWNER-VERIFICATION.

## Measurements (every quantity names its command, run from repo root)

| Fact | Value | Command / location |
|---|---|---|
| Shipped one-recipient builder | `createConversation(courseUrl, recipientUserId, body, subject?)` POSTs `/api/v1/conversations` with ONE `recipients[]`, a `context_code=course_<id>`, and **`force_new=1` UNCONDITIONALLY** | `src/lib/canvas/inbox.ts:384-420`; `force_new` at `:406` (read directly) |
| No `group_conversation` in the builder | absent (only `force_new` is appended) | `grep -n "group_conversation\|force_new" src/lib/canvas/inbox.ts` -> one hit, `:406` |
| Existing recipient guard | `/^\d+$/` on the emitted `recipientUserId` for the `message` kind | `grep -n '/\^\\d+\$/' src/app/actions/messaging.ts` -> `:284` (reply), `:301` (message). `course_<id>` FAILS this pattern - the A29 builder needs an allow-pattern that admits the course form |
| Existing send action | `sendCanvasMessageAction` calls `createConversation`, guarded by `requireOwner()` (a deprecated alias for `requireUser()`, Ruling 17) | `src/app/actions/messaging.ts:254-268` |
| Configured-LMS predicate | `canLms(c)` = `Boolean(canvasUrl.trim() && institution.trim())` | `src/lib/courses-table-helpers.ts:603-605` (read directly) |
| Roster readers (the only count source) | `listStudents` (`:248`) and `listCourseRoster` (`:286`) query `/users?enrollment_type[]=student&per_page=100`; `listStudentGradeSummaries` (`:318`) queries `/enrollments?...&state[]=active`. Neither `/users` query sets `include[]=email` or returns an enrollment state | `sed -n 244,330p src/lib/canvas/listings.ts` (read directly) |
| No Canvas student-count endpoint in the tree | none - a course-level count must be derived from the roster read's `.length` | `grep -rn "total_students\|student_count\|totalStudents\|studentCount" src/lib` -> only grading modules, no Canvas course count |
| Pagination cap | `CANVAS_PAGINATION_PAGE_CAP = 20` at `per_page=100`; roster reads stop SILENTLY after ~2000 rows | `grep -rn "CANVAS_PAGINATION_PAGE_CAP\s*=" src` -> `src/lib/canvas-remote-url.ts:156` |
| Student email read anywhere | none: no `include[]=email` request in the tree | `grep -rn "include\[\]=email" src --include=*.ts` -> 0 |
| Mail-provider dependency | none (0). Canary `"next"` = 1 | `grep -c -E "resend\|nodemailer\|@sendgrid/mail\|postmark\|mailgun\|client-ses" package.json` |
| Import-edge instruments are red on arrival | actions barrel `src/app/actions.ts` has 54 `export * from` lines; workflow modules importing that barrel = 148 (Ruling 28 records the count is instrument-dependent - 77/84/148 by pattern; the conclusion is unaffected) | `grep -c "^export \* from" src/app/actions.ts`; `grep -rln 'from "@/app/actions"' src/lib/workflows --include=*.ts \| wc -l` |

## Leverage claim (one paragraph, one removal-test criterion)

**Trigger fired: feature work**, so a claim is owed. A29 earns the GUARANTEED
class (`docs/loop/leverage.md:44`). The delivery channel itself is INHERITED, not
earned - `createConversation` already exists and any action can reach Canvas. What
A29 EARNS is a code-held safety SHAPE the shipped builder actively lacks: the send
is constructed so that ONE request carries the whole class as a single
`course_<id>` recipient with `group_conversation` not `true` and - critically -
**no `force_new`** (which the shipped builder appends unconditionally,
`inbox.ts:406`); and it REFUSES by a counted, named reason at BOTH bounds - above
100 recipients (OC9) and at N=1 (DECISION 1) - rather than silently creating a
reply-all group thread or appending to an unrelated thread under a subject nobody
chose. That emitted shape is INTENDED to become individual private conversations,
one per recipient, but that N-conversations expansion is Canvas's behaviour, is
UNCONFIRMED here (network-blocked, no key: R-7 / OC11) and is FALSE at N=1 - so the
earned property is the EMITTED SHAPE and the two-bound refusal, which the code
holds regardless of what any model returns or what the instructor types, NOT a
guaranteed per-recipient-conversation outcome. In a plain LLM chat the human is the
transport: the chat can draft the text, but it cannot send to a Canvas course at
all, cannot emit a send shaped to keep each student's thread private, and has no
structural cap that turns an oversized OR a one-student class into a named refusal
instead of a roster-exposing or thread-reusing accident. The class call (accept the
earned safety shape as the leverage, redesign for more, or reject) is the human's to
confirm, not this seat's to finalize.

- **LEV-1 (removal test, owned by the test seat).**
  - Object under comparison: the request the A29 send builder emits for a course,
    versus that request with its individual-private-conversation EMITTED-SHAPE
    construction removed (the emitted shape, NOT Canvas's unconfirmed delivery
    outcome - R-7 / OC11, FALSE at N=1).
  - Instrument: a pure unit test with `canvasFetch` mocked to capture the emitted
    URL + body; assert the emitted `recipients[]` is EXACTLY ONE value matching
    the course form (`^course_\d+$`), that no `group_conversation=true` (or `=1`)
    is present, and that no `force_new` parameter is present.
  - Direction of failure: RED when the construction is removed - i.e. when
    `force_new` is added back, OR `group_conversation` is set true, OR the single
    `course_<id>` token is replaced by an enumerated roster list (multiple
    `recipients[]`, or a comma-joined string). Each of those removals is exactly
    what re-exposes the roster / creates a reply-all thread, so each must turn
    LEV-1 RED. A test asserting only that "a POST happened" survives all three
    removals and is NOT LEV-1.
  - Named to the test seat because oracle construction is theirs
    (`docs/loop/seats.md:59`). See residual R-6.

## Numbered acceptance criteria

Each names Object / Instrument / Direction of failure, and its class:
[MACHINE] pure or mocked-`canvasFetch`/`canvasGet` testable; [READING] verified
by reading source only; [OWNER] verified only by the owner in the deployed app
against a Canvas sandbox.

### AC-1 - the send is ONE POST to a single course recipient token [MACHINE + OWNER]
- Owner's words: "sends out a bulk email to the students"; OC9: one POST to
  `recipients[]=course_<id>`.
- Object: the single request the A29 send builder emits for a course whose
  recipient count is in the PERMITTED band ([2..100]) - the refusal bounds (N=1,
  AC-3; N>100, AC-2) emit no request.
- Instrument: [MACHINE] a request-builder unit test with `canvasFetch` mocked to
  capture the emitted request; assert exactly ONE POST to `/api/v1/conversations`
  carrying exactly ONE `recipients[]` value, that value matching the course form
  (`^course_\d+$`), plus `context_code=course_<id>`, the `body`, and the
  `subject`. The single-recipient allow-pattern (OC9) is enforced on the EMITTED
  value inside the builder (Ruling 9's shape), so a comma-joined string
  (`"course_1,course_2"`), a second `recipients[]`, or an enumerated roster list
  FAILS. [OWNER] a real send to a sandbox course reaches each test student.
- Direction of failure: FAILS if more than one `recipients[]` value is emitted;
  FAILS if the single value is not the course form; FAILS if the builder fans out
  per student (one POST per roster entry) instead of one course POST; FAILS
  (owner) if a sandbox student does not receive it.
- Note: the shipped `createConversation` (`inbox.ts:384`) sends to ONE numeric
  user id and appends `force_new=1`. Whether A29 extends it or adds a
  course-recipient variant is the architect's call; this criterion binds the
  emitted payload, not the function count.

### AC-2 - above 100 recipients, a NAMED, COUNTED refusal - no fan-out [MACHINE + OWNER]
- Owner's words / OC9 (the over-100 cap): "no courses should exceed 100"; above
  100, refuse with a counted, named reason. This is the HIGH-bound refusal; the
  LOW-bound N=1 refusal is AC-3, and both are produced by the one boundary
  predicate.
- Object: a pure predicate over the recipient COUNT that decides send-vs-refuse,
  and the refusal value it produces.
- Instrument: [MACHINE] a boundary test on the predicate with the count source
  mocked: at count 100 it PERMITS the send; at count 101 it REFUSES; the refusal
  carries the actual count and a named reason (not a bare boolean, not a silent
  no-op). The PERMIT band is [2..100] - the N=1 end is refused by AC-3, so this
  predicate does not permit a one-student course. Because the count source in this
  tree is the LENGTH of the live roster read (there is no Canvas course-count
  endpoint - see Measurements), the test supplies that length via a mocked
  `canvasGet` roster page (or the count directly, architect's seam). [OWNER] a
  sandbox course over 100 shows the named refusal and sends nothing.
- Direction of failure: FAILS if a count > 100 produces any outbound send; FAILS
  if the over-100 path flips to `bulk_message` or `group_conversation=true`
  instead of refusing; FAILS if the refusal omits the count or the reason; FAILS
  if 100 exactly is refused (off-by-one the wrong way). The direction that must
  not be rewarded: a refusal that silently drops to a partial send. (The N=1 end
  of the predicate is AC-3's direction, not restated here.)
- Reconciliation of the count source: 100 is far under the ~2000 pagination cap,
  so one roster page settles it; but the count is only as trustworthy as the
  roster read. Whether an incomplete/failed roster read blocks the send is AC-5's
  territory, not this predicate's. The count SOURCE (roster-read length, no
  endpoint) is a measured tree fact routed to the architect - see residual R-1;
  it is NOT an owner fork (the tree forces it).

### AC-3 - a one-student (N=1) course REFUSES with a named, counted reason [MACHINE + OWNER]
- Owner's words / DECISION 1 (`docs/owner-decisions-2026-09-23.md:12-39`, carrying
  RULING 17, `docs/a29-rulings-round2.md:24-50`): design a named refusal for
  one-student courses and ship without the measurement. At N=1, omitting
  `group_conversation` and `force_new` makes Canvas's `batch_private_messages`
  false, so control reaches `initiate_conversation`, which REUSES an existing
  thread and IGNORES THE SUBJECT - the individual-private-conversation outcome is
  FALSE at N=1, and no emitted-request instrument can see it (the defect lives in
  what Canvas DID, not what the app EMITTED).
- Object: the same send-vs-refuse boundary predicate as AC-2, at its LOW bound -
  the decision it makes at a recipient count of 1, and the refusal value it
  produces there.
- Instrument: [MACHINE] a boundary test on the predicate with the count source
  mocked: at count 1 it REFUSES; at count 2 it PERMITS; at a count in [2..100] it
  PERMITS; at a count > 100 it REFUSES (the AC-2 end). The N=1 refusal is a REAL
  refusal - it carries the actual count (1) and a named reason DISTINCT from the
  over-100 reason, makes NO outbound POST, and leaves nothing persisted (OC9
  removed the durable ledger, so there is no half-done state to leave; the refusal
  precedes any side effect). The count source is the roster-read length (R-1),
  supplied via a mocked `canvasGet` roster page or the count directly (architect's
  seam). [OWNER] a real one-student sandbox course shows the named refusal and
  sends nothing (OV-2).
- Direction of failure: FAILS if an N=1 course produces ANY outbound send; FAILS
  if N=1 is PERMITTED (treated like a count in [2..100]); FAILS if the N=1 refusal
  omits the count or is indistinguishable from the over-100 reason (a reader must
  be able to tell WHICH bound was hit); FAILS if any side effect precedes the
  refusal. The direction that must not be rewarded: an N=1 course that silently
  sends and appends to an unrelated thread under a subject nobody chose.
- Note: this is NET-NEW from DECISION 1 - the prior version (`docs/a29-ac.md`) had
  no N=1 concept, so it carries no prior-id row in the disposition table. A
  one-student course is not exotic (RULING 17, `docs/a29-rulings-round2.md:47-50`):
  an independent study or a late-add / near-empty section reaches N=1. Under the
  OC9 `course_<id>` form the app does not enumerate or exclude recipients (K3 /
  E2), so the count the predicate reads is simply the course's active-student
  count.

### AC-4 - NO roster exposure, NO reply-all: the individual-private-conversation EMITTED SHAPE by construction [MACHINE]
- Owner intent + OC9: emitting `recipients[]=course_<id>` with `group_conversation`
  at its default of `false` and no `force_new` is the EMITTED SHAPE that keeps the
  send from exposing a roster or opening a reply-all thread. The
  per-recipient-private-conversation OUTCOME this shape is intended to produce is
  Canvas's behaviour, is UNCONFIRMED here (R-7 / OC11), and is FALSE at N=1 (AC-3)
  - so this criterion binds the emitted PARAMETERS, NOT the delivered outcome.
- Object: the parameters the send builder emits, specifically the two that would
  turn a course send into a group/reply-all thread.
- Instrument: [MACHINE] a builder unit test (same mocked-`canvasFetch` capture as
  AC-1) asserting the emitted request contains NO `group_conversation=true` (or
  `=1`) AND NO `force_new` parameter. This is a pin, so a regression that adds
  either one FAILS.
- Direction of failure: FAILS if `group_conversation` is emitted true/`1`; FAILS
  if `force_new` is emitted (the shipped `createConversation` sets `force_new=1`
  at `inbox.ts:406`, and Canvas source treats `force_new` as sufficient on its
  own to make a multi-recipient batch a GROUP batch, Ruling 30 - so reusing the
  shipped builder AS-IS for a course audience is the exact defect this criterion
  catches).
- Note: AC-4 and LEV-1 overlap deliberately. AC-4 is the standing pin on the two
  dangerous parameters; LEV-1 is the removal test the test seat owns. Both must
  hold; neither replaces the other.

### AC-5 - not offered without a LIVE LMS connection; a failed read sends nothing [MACHINE + READING]
- Owner's words: "for courses that have a live lms connection".
- Object: the course's `Course` row at the send entry point, and the send path
  when the live roster read fails.
- Instrument: [MACHINE] the gate reuses `canLms` (`courses-table-helpers.ts:603`,
  the configured-LMS predicate the row names) - a course failing `canLms` reaches
  no Canvas request. [MACHINE] with `canvasGet` mocked to FAIL the roster read (a
  missing credential, and separately an unreachable host), assert NO outbound
  conversation POST is made, and that "not connected" and "connected but
  unreachable" produce DISTINGUISHABLE reasons (the category, not just two
  non-equal strings - Ruling 26). [READING/OWNER] the control is absent or
  visibly unavailable, with the reason, on a course without a live link.
- Direction of failure: FAILS if a course failing `canLms` reaches any Canvas
  request; FAILS if a send POST is made after the roster read failed; FAILS if a
  missing credential and an unreachable host report the same reason (sending the
  instructor to reconnect an account that is actually connected).
- Note: `canLms` proves the connection is CONFIGURED; "live" (actually reachable)
  is proven at send time by the roster read - needed anyway for AC-2's count -
  succeeding. The architect owns where the gate sits.

### AC-6 - the send goes through the app's Canvas path only; no external egress, no model call [MACHINE]
- Owner: "canvas built in emailer" + standing rule `in-house-ai-only.md`.
- Object: the outbound requests the send path actually makes.
- Instrument: [MACHINE] measure the REQUESTS the send makes, not import edges
  (Ruling 4 / Ruling 19 - import-edge instruments are red on arrival here: the
  actions barrel is 54 `export *` lines pulled into 148 workflow modules, see
  Measurements). Drive the send against a recording `vi.stubGlobal('fetch', ...)`
  (Ruling 10 - the only seam that can observe an unexpected host under
  `vitest.setup.ts`) and assert every outbound request hits only the allowed
  hosts: Canvas, plus Supabase and the token endpoint the send genuinely needs.
  No mail-provider host, no model host is contacted.
- Direction of failure: FAILS if any outbound request during a driven send
  reaches a mail provider or a model host; FAILS if a body cannot be sent without
  a model call. (Drafting the body via A21 is OPTIONAL and separate; the SEND
  path makes no model call.)
- Confirms in-house: package.json carries no mail-provider dependency
  (Measurements), so this is a pin against a future regression, not a
  description.

### AC-7 - one request, one outcome: report "Canvas accepted", never "delivered" [MACHINE + READING]
- OC9 honest limit: one request means one outcome for the whole class, no
  per-student receipt; whether an email actually goes out depends on each
  student's Canvas notification preferences, which the app cannot see.
- Object: the send's outcome type and the result copy.
- Instrument: [MACHINE] the outcome type carries NO per-student receipt and NO
  claim beyond "Canvas accepted the request" vs "Canvas refused (with reason)" vs
  "unknown" (an ambiguous 5xx/timeout after the request went out is `unknown`,
  never `refused` - Ruling 26). Pin the FACT in the type, not a sentence.
  [READING] the result copy contains no word asserting delivery/receipt -
  "delivered", "received", "emailed", "sent to N" are forbidden (Ruling 26 added
  "sent"); the strongest honest phrasing is "Canvas accepted".
- Direction of failure: FAILS if the outcome type has a per-student delivery
  field; FAILS if any state name or copy asserts a student received or was
  emailed the message; FAILS if an ambiguous failure is recorded as `refused`.

### AC-8 - a confirm shows course, count and message before the irreversible send [READING + OWNER]
- OC9 survivor: "the confirm step showing course, count and the message"; a
  mistaken whole-class send cannot be recalled.
- Object: what the instructor sees before the send fires.
- Instrument: [READING/OWNER] the confirm surface shows the course name, the
  recipient count (from AC-2's count source), and the message body/subject as it
  will leave; the send does not fire without that confirm. Nothing renders under
  vitest, so this is a reading claim and an owner check (OV-2).
- Direction of failure: FAILS (owner) if a send can fire without a confirm
  showing all three; FAILS if the count shown is not the one the refusal
  predicate used.
- Note: OC9 removed the durable ledger / server-issued-token / CAS machinery, so
  the heavy confirm construction from the prior version (K5) is withdrawn. A
  light guard against a double-submit of the same synchronous send is a real
  residual (R-2), owned by the architect and an owner browser check - not a
  durable ledger.

### AC-9 - a drafted body leaves as plain text, not literal Markdown [MACHINE]
- Row fact (`backlog.yml:581`): the A21 drafter emits MARKDOWN while Canvas Inbox
  bodies are plain text, so reusing it as-is puts literal `**` / `#` into
  students' messages.
- Object: the `body` value in the emitted request when the body came from a
  drafter.
- Instrument: [MACHINE] given a body containing Markdown markup (headings, bold,
  a list), assert the emitted `body` carries neither raw Markdown markup nor HTML
  tags - it is plain text (matching the channel's declared format).
- Direction of failure: FAILS if literal Markdown or HTML tags appear in the
  emitted body. Only fires when a drafter feeds the body; a free-typed body is
  plain text already.

### AC-10 - no unattended path sends [MACHINE or READING]
- A whole-class send is irreversible; it must be human-initiated.
- Object: whether any unattended caller can reach the send.
- Instrument: [MACHINE if buildable] a CALL-graph check that no module under
  `src/lib/workflows/**` or `src/app/api/**` CALLS the send action (Ruling 19 -
  the import-edge instrument is WITHDRAWN because every workflow already imports
  the actions barrel; only a call-graph check or the request recorder means
  anything). If no call-graph instrument is buildable in this tree, this degrades
  to a [READING] claim (source review) - the test seat rules which, and records a
  residual if reading-only.
- Direction of failure: FAILS if a workflow step or a route handler invokes the
  send without a human confirm. A workflow may DRAFT text; a person confirms and
  sends (AC-8).

## Owner verification (READING/OWNER claims - nothing renders under vitest)

| Id | Claim | Owner | Instrument | Step |
|---|---|---|---|---|
| OV-1 | A real send to a sandbox course (<=100) reaches each test student's Canvas Inbox as its OWN private conversation (no student sees another), and a reply lands in the instructor's Inbox | Repo owner | Real browser + Canvas sandbox + a test student account | Verify, before push |
| OV-2 | The control is absent/visibly-unavailable (with the reason) on a course without a live link; the confirm shows course, count and message; an over-100 course AND a one-student (N=1) course each show their own named refusal (distinguishable by which bound was hit) and send nothing | Repo owner | Real browser | Verify |
| OV-3 | No delivery claim in the copy; whether the notification email actually arrives is outside the app's observation | Repo owner | A test student's own email inbox | Verify |

## Disposition of the prior version (`docs/a29-ac.md`; ids re-derived LAST)

The prior version was written under the working default of real Outlook email to
each student's address, with a per-student fan-out, a durable attempt ledger, a
pump, a CAS claim, a stale sweep and resume. OC9 and the channel decision remove
all of that. The final two rows are not `docs/a29-ac.md` criteria; they trace the
two round-1 rulings about recipient shape (Ruling 29 / Ruling 30) through to their
OC9 disposition, so the retirement of the enumerated-id form is confirmable (I2).

| Prior id | Disposition | Now |
|---|---|---|
| K1 (no LMS link -> not offered) | KEPT, re-derived on `canLms` + a server-side no-request assertion (Ruling 11) | AC-5 |
| K2 (live proven at send; `unknown` != connected) | KEPT; folded into "failed roster read sends nothing; not-connected vs unreachable" | AC-5 |
| K3 (recipients are active students, each once) | WITHDRAWN: the app no longer enumerates recipients; Canvas expands `course_<id>`. Protected correctness now handed to Canvas by the course form. The roster read's enrollment-state filter survives only for COUNT accuracy | handed to architect (R-1); enforcer was to-be-built, none lost |
| K4 (incomplete roster never presented as the class) | REDUCED: relevant only to the count now; folded into the count-source residual | R-1 |
| K5 (server-issued confirm token, consumed once) | WITHDRAWN: durable ledger/CAS removed by OC9. A light confirm survives (course/count/message) and a light double-submit guard is a residual | AC-8 + R-2 |
| K6 (what is sent is what was confirmed) | WITHDRAWN with the token machinery | AC-8 (light) |
| K7 (one confirmation spent once) | WITHDRAWN with the token machinery | R-2 |
| K8 (outcome type with no counts, one summariser) | WITHDRAWN: one request, one outcome, no per-student counts (OC9) | AC-7 |
| K9 (lost/partial outcome not a silent re-send) | WITHDRAWN: the durable-ledger hazard is removed; the residual double-submit hazard remains | R-2 |
| K10 (body leaves in the channel's format) | KEPT (light): plain-text body | AC-9 |
| K11 (send path makes no model call) | KEPT; import instrument -> request recorder (Ruling 4/19) | AC-6 |
| K12 (message-vs-announcement clarity) | HANDED to the UX seat (READING) | R-3 |
| K13 (drafts persist per course; nothing authorising a send persists) | HANDED to the UX seat, standing rule `persist-ui-control-state.md` | R-4 |
| K14 (no unattended path sends) | KEPT; call-graph instrument, import edge withdrawn (Ruling 19) | AC-10 |
| P1 (which address is used) | WITHDRAWN: no student address is read or handled under the Canvas channel (OC9) | none - requirement dissolved |
| P2 (per-recipient receipt) | WITHDRAWN: one request, one outcome (OC9) | AC-7 |
| P3 (partial is partial; refusal not a throttle) | REDUCED into the one-outcome accepted/refused/unknown distinction | AC-7 |
| P4 (no student sees another) | KEPT, re-derived as the by-construction pin | AC-4 |
| P5 (no delivery claim) | KEPT | AC-7 |
| P6 (channel precondition) | WITHDRAWN: Outlook-specific; the Canvas precondition is AC-5 | AC-5 |
| P7 (addresses do not outlive the send) | WITHDRAWN: no address is ever held (OC9) | none - requirement dissolved |
| L1 (removal test) | KEPT, re-derived for the course-form construction | LEV-1 |
| OV1-OV3 | KEPT, re-derived for the Canvas channel | OV-1..OV-3 |
| E1 (option A/B/B') | SETTLED by the owner: Canvas Inbox (A) | codified above |
| E2 (invited/inactive students) | MOOT: Canvas expands `course_<id>`; the app does not choose recipients | - |
| E3 (A21 voice for a private message) | survives as an owner/UX judgement | R-5 |
| E5, E6 (address field, address retention) | MOOT: no address handled | - |
| Ruling 29 (round 1): TAKE THE N-ID FORM - enumerate N explicit numeric student ids in one request (`docs/a29-rulings.md:480-497`) | RETIRED by OC9: the app emits a SINGLE `course_<id>` recipient token, NOT an enumerated id list; this withdraws the app-side recipient enumeration, the app-chosen exclusions, and the per-recipient receipt the N-id form carried. Trace row for I2; the substance is already codified above (OC9) | AC-1 / AC-4 (the `course_<id>` emitted form); the N=1 outcome gap the course form leaves is closed by AC-3 |
| Ruling 30 (round 1): `force_new` is the privacy defect - the course request MUST NOT carry it (`docs/a29-rulings.md:499-515`) | CARRIED: enforced as "no `force_new`" | AC-4 pin + LEV-1 removal test |

## Residual register

Each carries owner, instrument, and the step that will measure it. A residual
missing any of the three is a deletion. **These must be filed as rows in
`docs/BACKLOG.md` by the orchestrator** (this seat does not write the backlog
under concurrency); until then they exist only here, which
`docs/loop/iteration-caps.md` counts as not yet real.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-1 | The <=100 count source: no Canvas course-count endpoint exists; the count is the LENGTH of the live roster read (`listStudents`/`listCourseRoster`), whose enrollment-state filter and ~2000-row silent pagination cap affect count accuracy. Two roster readers use different enrollment-state filters (`listings.ts:248/286` vs `:318`). This is forced by the tree, NOT an owner fork | Architect | A fixture per enrollment state; the roster read wired as the count source | Architect pass |
| R-2 | A light double-submit guard for the single synchronous whole-class send (OC9 removed the durable ledger/CAS; the residual hazard is a double-click, not partial state) | Architect + repo owner | Architect places the guard; owner double-clicks confirm in a real browser | Architect pass + Verify |
| R-3 | The instructor is not choosing blind between this message and an announcement (which reaches enrollees-later, is public) | UX seat | Copy + a route to the announcement composer | Wave-3 UX pass |
| R-4 | Compose-surface controls (subject, body, drafting prompt) persist per course under `ta-` keys; nothing authorising a send persists | UX seat | Source-text test for `ta-` keys + mount-effect hydration (`persisted-details-open-hydration.md`) | Wave-3 UX pass |
| R-5 | Whether A21's course-announcement voice suits a private class message (E3) | Repo owner | Read a real draft | Post-deploy owner verification |
| R-6 | LEV-1 removal-test construction (the leverage oracle) | Test seat | Mocked-`canvasFetch` request-capture oracle | Test seat, after Build and Verify (`docs/loop/seats.md:59`) |
| R-7 | Canvas API facts nothing here can measure (network blocked, no key): whether `POST /conversations` expands `course_<id>` into N private conversations, whether the notification email actually goes out per student preference, Canvas rate limits on the one request | Repo owner (research) | Live authenticated call against a sandbox | External-facts / owner verification, before push |

## Open questions for the owner (each phrased to terminate)

- **Q-1 (surface placement).** Which composition surface hosts the bulk-class
  message control: (a) a new action on the existing Messages / message-drafts
  surface (`MessageDraftsTab.tsx`), or (b) its own new compose surface under the
  announcement-composition area? Every answer terminates: the criteria above bind
  ANY surface offered as A29; this only fixes where the button lives, which the UX
  seat then designs against.

  Nothing else is open. The over-100 refusal (OC9), the N=1 refusal (DECISION 1),
  the `group_conversation=false` / no-`force_new` construction, the Canvas-Inbox
  channel, and "no address is ever read" are DECIDED (OC9, DECISION 1, the channel
  decision) and are not re-asked. The count source is forced by the tree (R-1),
  not an owner choice.

## Out of scope for this document (routed, per `docs/loop/seats.md:77-84`)

- Mechanism (extend `createConversation` vs a new course-recipient builder, where
  the gate and confirm sit, how the count is read) -> architect.
- Wave ordering and write-set disjointness -> plan.
- Oracle, fixtures, sabotage, the LEV-1 construction -> test seat.
- Server-action hardening (A29 uses `requireUser()` explicitly, not the
  deprecated `requireOwner` alias, Ruling 17), the reliability of the one
  synchronous POST against the duration ceiling, and prompt-injection on any
  drafted body -> the wave-2 design seats.
