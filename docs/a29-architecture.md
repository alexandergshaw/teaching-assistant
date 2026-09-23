# A29 - architecture: bulk message to a course's students via Canvas Inbox

Seat: architecture (`loop-architect`), 2026-09-22. Revision 1 (first
architecture pass for A29). This document decides SHAPE. It writes no
production code.

**Consumes:** `docs/backlog.yml` A29 (line 495); `docs/a29-ac.md` revision 1
(K1-K14, P1-P7, L1, OV1-OV3, E1-E6); `docs/a29-rulings.md` rulings 1-6, which
OVERRIDE the criteria where they conflict.

**Binding owner decision, verbatim** (`docs/backlog.yml:505`):

> "for bulk email: message on canvas and also use canvas' built in emailer"

That is **option (A)**. Options (B) and (B-prime) are WITHDRAWN. Section 9
disposes of every criterion those options carried.

Every quantity below names the command that produced it. Commands ran from the
repo root: Bash-tool commands are shown as `$ ...`, PowerShell as `PS> ...`.
Two line counters were run against every file this design touches and they
AGREE on all eight (section 3.1), so no 42-line discrepancy applies here.

---

## 0. The one-paragraph shape

A bulk course message is **N separate single-recipient Canvas conversation
POSTs**, one per active student, each issued by its own server-action
invocation, **pumped from the browser**, against a **durable per-course attempt
ledger** that is written before the first outbound request and that both
resumes the run and refuses a second one. The browser never receives a
recipient list; it receives only a summariser's opaque progress object, so no
display can compute a count. Privacy is guaranteed by the **cardinality of
`recipients[]` in each request** (exactly one, enforced by the transport
function's parameter type), not by any Canvas flag - because the two flags that
could control it are described differently by Canvas's public docs and by
Canvas's own source, and that conflict is unresolved (section 2.2).

---

## 1. THE FIVE CANVAS FACTS

Nothing in this checkout can reach Canvas: `vitest.setup.ts` throws on any real
`fetch`, and there is no key. So these came from Canvas's PUBLIC API
documentation, fetched live on 2026-09-22 with the WebFetch tool. A prior run
of this brief had already fetched the same pages on 2026-09-21 and left the raw
HTML plus text in the session scratchpad
(`.../scratchpad/conversations.html`, `conv.txt`, `thr.txt`,
`notification_preferences.txt`); **the live 2026-09-22 re-fetch agreed with
that archive on every point below**, which is why both are cited.

Quotes are short excerpts under the copyright limit, each with its URL.
Where the documentation does not answer, this section says so and routes an
owner check - it does not fill the gap from recall.

### Q1. Does POST /api/v1/conversations accept a whole-course recipient, or a role-filtered one?

**DOCUMENTED: YES for a whole-course recipient. NOT DOCUMENTED for a
role-filtered one.**

Source: <https://canvas.instructure.com/doc/api/conversations.html>, "Create a
conversation", `recipients[]`. The documentation states recipients may be
"course/group ids prefixed with 'course_' or 'group_' respectively", with the
worked example `recipients[]=course_3`.

The role-filtered form `course_<id>_students` appears **nowhere in the public
API documentation for this endpoint**. Canvas's own controller source does
accept it - `allowed_recipient_types = [nil, "students", "observers"]`
(`conversations_controller.rb`, archived in the scratchpad as `cc.rb:431`),
matched against `/\A(course_\d+)(?:_([a-z]+))?$/` at `cc.rb:435`, and gated on
the caller holding `:send_messages_all` on that context. **That is source, not
documentation, and open-source Canvas is not necessarily what an institution's
Canvas Cloud runs.**

**This design uses NEITHER form.** See Q2 for why, and section 2.2 for the
construction that replaces both.

### Q2. THE PRIVACY QUESTION - what do `group_conversation` and `bulk_message` do?

**DOCUMENTED, and it is the load-bearing answer:**
<https://canvas.instructure.com/doc/api/conversations.html>

- `group_conversation` **defaults to false**, and when false, per the docs,
  "individual private conversations will be created with each recipient".
- When true, per the docs, "this will be a group conversation" - and the same
  description says all recipients "may see all messages and replies".
- The docs also say `group_conversation` "Must be set true if the number of
  recipients is over the set maximum (default is 100)".
- The prose above the parameter table adds: if the course or group has over 100
  enrollments, "'bulk_message' and 'group_conversation' must be set to true".

**`bulk_message` IS NOT IN THE PARAMETER TABLE AT ALL.** The prose names it;
the table that defines every other parameter (`recipients[]`, `subject`,
`body`, `force_new`, `group_conversation`, `attachment_ids[]`,
`media_comment_id`, `media_comment_type`, `mode`, `scope`, `filter[]`,
`filter_mode`, `context_code`, `display_from`, `include[]`) does not. Measured:

```
$ grep -n -i "bulk_message" conv.txt
453:  If the course/group has over 100 enrollments, &#39;bulk_message&#39; and &#39;group_conversation&#39; must be
```

One hit, in the prose, none in the table. So **`bulk_message` is an
UNDOCUMENTED parameter that the documentation instructs you to set.**

**THE UNRESOLVED CONFLICT, stated plainly because the design turns on it.**
Taken literally, the documentation says that to message a class of more than
100 you must set `group_conversation=true`, and that `group_conversation=true`
means every recipient may see all messages and replies. Read that way, Canvas
offers no documented way to bulk-message a large class privately.

Canvas's own source says otherwise. In `cc.rb:447-448`:

```ruby
batch_private_messages = (!group_conversation && @recipients.size > 1) || force_individual_messages
batch_group_messages   = (group_conversation && value_to_boolean(params[:bulk_message])) || value_to_boolean(params[:force_new])
```

and either branch routes to `ConversationBatch.generate(...)`, whose
`deliver` (`cb.rb:55-65`) loops **one recipient at a time**:

```ruby
recipient_ids.each_slice(chunk_size) do |ids|
  ids.each do |id|
    conversation = user.initiate_conversation([user_map[id]], !is_group, ...)
```

so a BATCH always produces one conversation per recipient regardless of the
`group` flag. The all-recipients-in-one-thread case is the OTHER branch
(`cc.rb:504`, `initiate_conversation(@recipients, !group_conversation, ...)`),
reached only when neither batch condition holds.

**This design does not adjudicate that conflict, and no test in this repo can.**
It is resolved structurally instead: see C1.

### Q3. What does `mode=async` do, what does it return, and how would the app learn per-recipient outcomes?

**DOCUMENTED.** <https://canvas.instructure.com/doc/api/conversations.html>

- `mode` is "ignored if this is a group conversation or there is just one
  recipient".
- When async, per the docs, "the response will be an empty array", and batch
  status "can be queried via the batches API".
- `GET /api/v1/conversations/batches` "Returns any currently running
  conversation batches for the current user."
- The documented batch object carries `id`, `workflow_state`, `completion`
  (a fraction, e.g. `0.1234`), `tags`, and the root `message`. Corroborated by
  source: `cc.rb:493-495` sets an `X-Conversation-Batch-Id` response header and
  renders `[]` with status 202.

**HOW THE APP WOULD LEARN PER-RECIPIENT SUCCESS OR FAILURE: IT WOULD NOT.**
The batches endpoint documents no per-recipient field, and it returns only
*currently running* batches - so a batch that has finished, or errored, is
simply absent, and absent is indistinguishable from "finished cleanly" and from
"never existed". There is no documented per-recipient status anywhere in the
Conversations API.

**Consequence for the design: `mode=async` is REJECTED.** It is unusable twice
over. It is ignored for a single-recipient request (which is the only request
shape C1 permits), and even where usable it returns nothing P2 could be built
from. Every honest per-recipient signal must come from a per-recipient HTTP
response, which means N synchronous single-recipient requests.

### Q4. What do the docs say about rate limits or throttling?

**DOCUMENTED, but with NO numeric per-endpoint limit.**
<https://canvas.instructure.com/doc/api/file.throttling.html>

- On throttle you receive, in the docs' own words, a
  "429 Forbidden (Rate Limit Exceeded)" response.
- Every request returns `X-Request-Cost`, "a floating point number of the
  amount that request deducted from your remaining quota"; when throttling
  applies, also `X-Rate-Limit-Remaining`.
- Crucially for fan-out shape: "any API client that makes no more than one
  simultaneous request is unlikely to be throttled".
- "Parallel requests are subject to an additional pre-flight penalty", credited
  back when each request finishes.
- No numeric quota, no per-endpoint limit, and **no `Retry-After` header** is
  documented. `src/lib/canvas-throttle.ts:52-54` already records that absence
  and sizes its backoff defensively because of it.

**Consequence: send concurrency is 1, not 4.** This repo's other browser-driven
fan-out uses `COMMAND_APPLY_CONCURRENCY = 4`
(`src/app/components/content-tab/modules/useCommandInterface.ts:165`). A29 does
not copy that number: four is tuned for reads whose failure is a retry, whereas
here a throttled request is one student who did not get the message, and the
documented advice above says one-at-a-time is the shape that avoids the
question entirely. See C6.

### Q5. Does a conversation message produce an email, and on what does that depend?

**NOT ANSWERED BY THE CONVERSATIONS API DOCUMENTATION.** Measured against the
fetched page text:

```
$ grep -n -i -E "plain text|markdown" conv.txt
(no output; exit 1)
$ grep -c -i "recipients" conv.txt
23        # canary: the pattern machinery works, so the absence above is real
```

The Conversations page says nothing about email, nothing about notification
delivery, and nothing about body format. (The only `html` matches on that page
are the doc site's own JavaScript boilerplate - `prettyprint`, `innerHTML`,
`createElement` - not prose about the API.)

**What the documentation DOES establish, on a different page**
(<https://canvas.instructure.com/doc/api/notification_preferences.html>): a
`NotificationPreference` binds a `notification` and its `category` to a
`frequency` on **one communication channel of one user**, and the documented
possible values are "'immediately', 'daily', 'weekly', and 'never'". The
documented example `href` is keyed on an `email` channel. So the documentation
establishes the MECHANISM and establishes that a user can set `never` - it does
not establish that a conversation message enters that mechanism.

**Source corroboration, clearly labelled as NOT documentation.** Canvas's
`notification.rb` (scratchpad `notif.rb`) declares a `conversation_message`
category (`:50`) and a "Conversation Message" notification (`:78`, `:340`),
described at `:515` as "New Inbox messages". Canvas ships an email template for
it whose body renders the message and whose subject is
`"%{user_name} just sent you a message in Canvas."` (scratchpad
`cm_email.erb`).

**Two consequences, and the second is a UI requirement.**

1. The honest ceiling is unchanged and the row already states it: the app can
   report that **Canvas accepted the message**, never that an email arrived.
   Delivery depends on each student's own notification preferences, which this
   app neither reads nor may override. Routed as **OC1**.
2. **The subject the instructor types is NOT the email's subject line.** On the
   source evidence, the conversation subject is rendered inside the email body
   ("Subject: ..."), while the email's own subject is Canvas's sentence about
   who sent it. This is source-only, so it is not asserted as fact - it is
   routed as **OC2**, and until OC2 is answered the confirm surface must not
   describe the subject field as "the email subject" (C11).

### 1.1 What the documentation could NOT tell us - routed, not guessed

| Id | Question | Owner | Instrument | Step |
|---|---|---|---|---|
| OC1 | Does a single-recipient conversation actually arrive as email at a test student's mailbox, and does it stop arriving when that student sets the Conversation Message frequency to `never`? | Repo owner | A Canvas sandbox, a test student account, that student's real mailbox | Verify, before push (this is OV1 re-derived for (A)) |
| OC2 | On a real Canvas, is the instructor's `subject` used as the email's subject line, or only rendered in the body? | Repo owner | The same test send | Verify, before push |
| OC3 | Is `bulk_message` accepted by the institution's Canvas at all, given it is absent from the parameter table? | Repo owner | A Canvas sandbox | Only if C1 is ever reopened - this design never sends it |
| OC4 | Does the conversation body render as plain text (no Markdown, no HTML) in the Canvas Inbox UI and in the email copy? | Repo owner | The same test send | Verify, before push. Until then C10's pass condition is bound to the OUTPUT format the app emits, which is plain text either way |

---

## 2. The two shape decisions everything else is built on

### 2.1 The fan-out is per-student, and the pump is the BROWSER

**The premise in this brief is wrong and the correction changes the design.**
The brief says "the 60-second Vercel cap". For a **Server Action reached from
this app's main page, there is no 60-second cap** - there is the platform
default, whatever that is, and it is smaller.

Measured:

```
$ grep -n "maxDuration" src/app/page.tsx
(no output)
$ wc -l src/app/page.tsx
703 src/app/page.tsx      # canary: the file exists and is non-trivial
```

And the framework rule, read from the installed copy rather than recalled
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`),
under its "Server Actions" heading: it says to set `maxDuration` at the page
level to change the default timeout of all Server Actions used on the page.

So: `src/app/page.tsx` sets none, therefore every Server Action reachable from
it runs on the platform default. **This document does not state that number.**
It is a Vercel dashboard fact, not a repo fact, and naming it from memory is
exactly the error this seat is told not to make. It is routed as **OC5**
(owner; the Vercel project settings page; Verify).

**This repo has already solved this exact problem, and the design copies it
rather than re-deriving it.** `src/app/actions/command-interface.ts:26-32`:

> "the fan-out is driven from the BROWSER, one invocation per row, because
> src/app/page.tsx sets no maxDuration and a server action looping N objects
> dies mid-loop on the platform default - and because 'rewrote 6 of 10 then
> crashed' must be a RENDERED state, not a lost one. This function must NEVER
> loop over rows."

`src/lib/canvas-throttle.ts:76-79` records the same rule from the other side:
"Retry is safe where a loop runs CLIENT-side, one server action per item ...
each item is its own function invocation".

**The design is therefore independent of OC5's unknown number.** One server
invocation issues exactly one Canvas POST. That is safe under any cap that
permits a single HTTP round trip. The N-student wall-clock cost lands in the
browser, which has no cap. A class of 200 at a sequential 400ms round trip is
about 80 seconds of browser time and 200 invocations of roughly 400ms each.

**This also keeps K14 satisfiable, and the alternative would not.** The obvious
escape from a short Server Action cap is a Route Handler, which *can* declare
`maxDuration = 60` (eleven do: `src/app/api/cron/run-schedules/route.ts:56`,
`src/app/api/automations/run-now/route.ts:43`,
`src/app/api/course-intel/ask/route.ts:134`, and others). But K14's instrument
is a transitive-import check from the directory sets `src/lib/workflows/**` and
**`src/app/api/**`**. Putting the send behind a Route Handler makes K14's own
instrument red by construction. The browser-pumped Server Action is the only
shape that satisfies the duration constraint and K14 at the same time.

### 2.2 Privacy is enforced by REQUEST CARDINALITY, not by a Canvas flag

Q2 left `group_conversation` / `bulk_message` in an unresolved conflict between
Canvas's documentation and Canvas's source. A design that picks a reading and
sets a flag is betting a whole class's roster on that bet being right, and
**no test in this repo can settle it** - the network is blocked, so every test
asserts only what request we *sent*, never what Canvas *did* with it.

**So the design never sends a request whose reading is in question.** Every
outbound POST carries exactly ONE `recipients[]` value. Under any reading of
either document, a conversation with one recipient exposes that recipient to
themselves and to nobody else. `group_conversation` is never sent; `mode` is
never sent; `bulk_message` is never sent; `course_<id>` and
`course_<id>_students` are never sent.

This turns P4 from a property into a construction, and the instrument is a
count of request parameters rather than an opinion about Canvas.

**Measured absence, canary-checked, so the claim "this is new" is safe:**

```
$ grep -rn "recipients\[\]\|group_conversation\|bulk_message" src --include=*.ts --include=*.tsx | grep -v "\.test\."
src/lib/canvas/inbox.ts:400:  params.append("recipients[]", recipientUserId);
$ grep -c 'recipients\[\]' src/lib/canvas/inbox.ts
1     # canary: the one known site is found, so the pattern is not silently broken
```

Exactly one `recipients[]` append exists in the whole tree, it is
single-valued, and neither flag appears anywhere. There is no multi-recipient
Canvas send in this codebase today.

---

## 3. What exists, measured

### 3.1 Sizes, both counters

```
$ wc -l <files>
PS> foreach ($f in $files) { @(Get-Content $f).Count }
```

| File | `wc -l` | `@(Get-Content).Count` | Agree? |
|---|---|---|---|
| `src/lib/canvas/inbox.ts` | 432 | 432 | yes |
| `src/lib/canvas/listings.ts` | 428 | 428 | yes |
| `src/app/actions/messaging.ts` | 522 | 522 | yes |
| `src/app/components/courses/useCourseImportActions.ts` | 608 | 608 | yes |
| `src/app/components/courses/CourseRow.tsx` | 694 | 694 | yes |
| `src/app/components/courses/LmsCell.tsx` | 225 | 225 | yes |
| `src/app/components/courses/CoursesTable.tsx` | 792 | 792 | yes |
| `src/lib/courses-table-helpers.ts` | 834 | 834 | yes |

All eight are under the 1000-line ceiling
(`src/file-size-ceiling.structure.test.ts`), and the two counters agree, so the
known 42-line discrepancy does not apply to any file in this write set. The
three closest to the ceiling (`CoursesTable.tsx` 792, `CourseRow.tsx` 694,
`useCourseImportActions.ts` 608) are the reason the surface work in wave 4 adds
a NEW component file rather than growing any of them (section 5, L7).

### 3.2 The transport that exists, and what is wrong with it for A29

`createConversation` (`src/lib/canvas/inbox.ts:384-420`) takes
`(courseUrl, recipientUserId: string, body, subject?)`, appends one
`recipients[]`, appends `context_code=course_<id>` and `force_new=1`, and
returns `Promise<void>`.

Two defects for A29, both measured:

1. **It discards the status.** On a non-ok response it throws
   `canvasError(response.status, institution)`, and `canvasError`
   (`src/lib/canvas-core.ts:101-115`) collapses 401 and 403 into one sentence,
   404 into another, and everything else into
   `Canvas request failed (HTTP ${status})`. It returns a bare `Error`. So the
   caller cannot tell a 429 (retryable, possibly-unknown) from a 400 (refused,
   definitely nothing sent). Ruling 5 requires exactly that distinction.
2. **It cannot express UNKNOWN.** A thrown error and a returned void cannot
   carry "the request left, and we do not know what happened".

Note `force_new=1` is harmless *at one recipient* on the source reading
(`cc.rb:448` makes it take the batch branch, and a batch of one is one
conversation), and is what the shipped single-student path already sends. C1
keeps it and keeps the recipient count at one, so nothing about that behaviour
changes.

Its one call site is `sendCanvasMessageAction`
(`src/app/actions/messaging.ts:255-268`), reached from
`postMessageDraftAction` (`messaging.ts:301-307`).

### 3.3 The roster readers, and what K3/K4 need that they do not give

```
$ sed -n '247,330p' src/lib/canvas/listings.ts
```

- `listStudents` (`:248`) and `listCourseRoster` (`:286`) both query
  `/api/v1/courses/<id>/users?enrollment_type[]=student&per_page=100`. Neither
  requests `include[]=enrollments`, so **neither returns an enrollment state**.
  `listCourseRoster` reads `login_id` live (`:305`).
- `listStudentGradeSummaries` (`:318`) queries
  `/api/v1/courses/<id>/enrollments?type[]=StudentEnrollment&state[]=active&per_page=100`
  - the only reader that filters by state, and it returns one row per
  ENROLLMENT, so a student in two sections appears twice.
- All three cap at `CANVAS_PAGINATION_PAGE_CAP`
  (`src/lib/canvas-remote-url.ts`) and **all three exit the loop silently when
  the cap is hit with `next` still non-null.** Nothing distinguishes "read
  everything" from "stopped at the cap".

K3 needs enrollment state per row; K4 needs to know whether the read was
complete; P4 needs each student exactly once. No existing reader gives any of
the three. That is why L2 (section 5) is a new reader rather than a reuse, and
why it deduplicates by user id.

### 3.4 The durable-store precedent

`supabase/migrations/20261016000000_lms_credential_save_attempts.sql` is a
directly applicable precedent and its header states the reasoning A29 needs
verbatim: an in-memory counter "resets on every cold start and is not visible
to any other concurrently running instance, which on this deployment (Vercel,
serverless) is equivalent to no limit at all." It also records the conventions
this design follows: one owning module, service-role access only, **no RLS
policy for `authenticated`**, and the 42P10 upsert trap. Its owning module is
`src/lib/lms-credential-save-attempts.ts`.

```
$ ls supabase/migrations | wc -l
108
```

Migrations auto-apply via a GitHub Action on push to main, so they must be
written idempotently (`create table if not exists`, `create index if not
exists`).

### 3.5 The drafter - the rulings and the criteria do NOT actually conflict

Ruling 5 says reuse `draftAnnouncementAction` because it "already asks the
model for plain text". `docs/a29-ac.md` section 1 says `messaging.ts:436` is
"an ANNOUNCEMENT drafter, not an Inbox one". Read together these look like a
conflict, so it was measured rather than assumed:

```
$ sed -n '405,440p' src/app/actions/messaging.ts
$ grep -n -i "plain text\|markdown" src/app/actions/messaging.ts
```

`draftAnnouncementAction` is at `messaging.ts:405`, and its own prompt at
`:436` says: `"message": the announcement body ... Use plain text with blank
lines between paragraphs; do not use markdown, headings, or bullet symbols.`

**The ruling is correct and the criteria row was making a narrower, compatible
point.** No conflict. Recorded here so a checker does not re-litigate it.
A21's drafter (`src/lib/prompt-announcement-prompt.ts:87`) emits Markdown and
is NOT reused.

### 3.6 The gate and the surface that exists

```
$ grep -rn "canLms(" src --include=*.ts --include=*.tsx | grep -v "\.test\."
```

11 lines: the definition at `src/lib/courses-table-helpers.ts:603`, two
internal uses at `:614` and `:662`, one component use at
`src/app/components/courses/CourseRow.tsx:145`, and **seven gated actions in
`src/app/components/courses/useCourseImportActions.ts`** (`:320`, `:361`,
`:393`, `:421`, `:454`, `:490`, `:537`), each following the same shape: refuse
with a reason, set a busy key, call a server action, surface the error.

`LmsCell.tsx` already renders an `LmsStatusPill` from `lmsConnectionStatusFor`
(`:44-69`) with exactly K1's categories, and already accepts a `menu?:
ReactNode` for the column's hamburger (`CellMenu.tsx`, which supports
`disabled` + `disabledReason` items and keeps them keyboard-reachable). So K1's
"absent, or visibly unavailable with the category's reason" has an existing
idiom and needs no new pattern.

---

## 4. THE CONSTRUCTIONS

Each names its **Object**, its **Instrument**, and its **direction of failure**.
Every multi-path test run is spelled `npm run test:paths -- <p1> <p2> ...`.

### C1 - one recipient per request, made unrepresentable

Satisfies P4 (re-derived for (A)), and closes Q2's unresolved conflict
structurally.

- **Object:** the URL-encoded body of every `POST /api/v1/conversations` this
  app issues, and the signature of the one function that builds it.
- **Instrument:**
  1. a type check: the single conversation-POST builder takes
     `recipientUserId: string` - never an array, never a `course_` string. A
     caller cannot pass two.
  2. a structure test over the tree: `recipients[]` is appended in **exactly
     one** file and exactly one statement; `group_conversation`,
     `bulk_message`, and `mode` appear in **zero** non-test source files. Run
     with `npm run test:paths -- src/lib/canvas/conversations-post.structure.test.ts`.
  3. a driven-send test: over a 3-student fixture, parse each recorded request
     body with `URLSearchParams` and assert `getAll("recipients[]").length ===
     1` for every request, and that `recipients[0]` never matches
     `/^(course|group)_/`.
- **Fails when:** any request carries more than one `recipients[]`; or any
  `recipients[]` value is a context string; or `group_conversation`,
  `bulk_message` or `mode` appears in any request; or a second
  conversation-POST builder appears anywhere in `src`.
- **Direction of failure:** more than one recipient in one request, or a
  context-shaped recipient, is the failure. Fewer is impossible (the body is
  required).

The existing `createConversation` is **kept as the public name** and
re-implemented as a thin wrapper that calls the new result-returning builder
and throws `canvasError` on a non-ok status, so `sendCanvasMessageAction`'s
behaviour is byte-identical and there is still exactly one place in the tree
that builds this request.

### C2 - the transport returns a THREE-state result, and UNKNOWN is the default for ambiguity

Satisfies Ruling 5's "ambiguous failures are `unknown`, never `refused`".

- **Object:** the return value of the new transport function, per request.
- **Instrument:** the transport called against a mocked `canvasFetch` returning,
  in turn: 201; 400; 403; 404; 429; 500; 502; a thrown `TypeError` (network);
  and a promise that rejects with an abort/timeout.
- **Pass condition, by class:**
  - 2xx -> `accepted`.
  - 400, 404, 422 -> `refused`, carrying the status and a reason. These are
    Canvas declining before acting.
  - 401, 403 -> `refused`, with the credential reason. 403 is NOT treated as a
    throttle here (`src/lib/canvas-throttle.ts:31-45` documents both readings
    and why a user-facing write uses the 429-only predicate).
  - **429, any 5xx, any thrown network error, any timeout -> `unknown`.**
  - Anything not enumerated -> `unknown`. The default arm is `unknown`, not
    `refused`.
- **Direction of failure:** mapping any of {429, 5xx, network, timeout,
  unrecognised} to `accepted` **or** to `refused` is the failure. Mapping a
  400/404/422 to `unknown` is a lesser failure and is also caught.
- **Note:** `canvasError` must NOT be used to produce these results, because it
  discards the status (section 3.2). It stays in the `createConversation`
  wrapper only.

### C3 - the attempt ledger is DURABLE and written BEFORE the first outbound request

Satisfies Ruling 2.

- **Object:** two new Postgres tables and the single module that owns them.
  - `bulk_course_message_attempts`: `id uuid pk`, `user_id uuid` (cascade),
    `course_id`, `canvas_course_url`, `subject`, `body`, `confirm_token`,
    `token_consumed_at`, `state` (`open` | `resolved`), `created_at`,
    `resolved_at`, `resolution` (`completed` | `abandoned` | null),
    `roster_complete boolean`, `excluded_note text`.
  - `bulk_course_message_recipients`: `attempt_id` (cascade),
    `canvas_user_id`, `state` (`pending` | `accepted` | `refused` |
    `unknown` | `excluded`), `reason text`, `attempted_at`. Unique on
    `(attempt_id, canvas_user_id)`, which is a real non-partial unique
    constraint, so it can serve as a PostgREST upsert arbiter without the
    42P10 trap the `lms_credential_save_attempts` header documents.
  - RLS enabled, **no policy for `authenticated`** - same reasoning as
    `20261015000000_lms_credentials.sql` and `20261016000000`: a guard a
    signed-in browser can write is not a guard.
- **Instrument:** a driven-send test with the store mocked at the owning
  module's seam. Assert the ORDER of effects: the attempt row and all recipient
  rows exist in `pending` **before** the first transport call, and each
  recipient row transitions to its terminal state **before** the invocation
  that produced it returns.
- **Fails when:** the first transport call is observed before the ledger write;
  or a recipient's state is returned to the client before it is persisted; or
  the guard or the resume path reads any module-scope `Map`/`Set` rather than
  the store.
- **Direction of failure:** a test that proves the guard with in-memory state
  proves nothing. The instrument must simulate process death: **drop the
  module registry between the first send and the retry** (re-import the modules
  under test with `vi.resetModules()`), keeping only the store. A guard that
  survives that is durable; one that does not is not.

### C4 - the double-send guard is keyed on the COURSE, never on the body

Satisfies Ruling 1 and K9.

- **Object:** the `prepare` step, given a course id.
- **Instrument:** a first attempt killed after its first outbound request
  (`vi.resetModules()`, store retained), then a fresh `prepare` for the same
  course with a **different** subject and a **different** body.
- **Pass condition:** `prepare` returns a REFUSAL carrying the prior attempt's
  id, its creation time, its recipient count, and its per-state counts - all
  produced by the summariser (C5) - and makes **zero** outbound requests.
- **Fails when:** `prepare` mints a token for a course with an `open` attempt;
  or the refusal is keyed on the body, the subject, or any hash of them; or the
  refusal makes an outbound request.
- **Direction of failure:** the body differing must NOT change the outcome.
  That is the whole point: K13 clears the body at confirm, so the retry's body
  always differs.

### C5 - the client never receives a countable collection

Satisfies Ruling 3's K8 construction and the A28 defect.

- **Object:** every value that crosses the server-action boundary toward the
  browser, for the whole feature.
- **Instrument:**
  1. a type-level pin: the action return types reference exactly one exported
     type, `BulkSendSummary`, whose fields are **scalars and rendered strings
     only** - no array, no `Set`, no `Map`, no `length`-bearing field, and no
     recipient identifier. `excludedNote` is `string | null`, ONE rendered
     sentence, never a list.
  2. a structure test asserting that the summary type's declaration contains no
     `[]`, no `Array<`, no `ReadonlyArray<`, and no `Record<`.
  3. an import test: every module that displays any A29 count imports the
     single summariser, and no other module in the feature's file set exports a
     function whose name or return type mentions a count.
- **Fails when:** the summary type gains any collection-typed or
  identifier-bearing field; or a second function derives a count; or a
  displaying module computes one. **A recipient list reaching the browser is
  the failure**, because a list has `.length`.
- **Direction of failure:** the failure is the client being ABLE to compute a
  count, not it computing a wrong one. This is why the pump (C6) asks the
  server for the next recipient instead of iterating a list it holds.

### C6 - the pump: browser-driven, one student per invocation, concurrency 1

Satisfies section 2.1 and Q4.

- **Object:** the loop that advances a send, and the number of Canvas requests
  in flight at once.
- **Instrument:** a driven-send test over a 5-student fixture that records, per
  server-action invocation, the number of transport calls made; plus a
  reachability check that no module under `src/lib/workflows/**` or
  `src/app/api/**` transitively imports the send action (K14's instrument,
  unchanged).
- **Pass condition:** every invocation makes **at most one** transport call;
  the pump issues the next invocation only after the previous one resolves; and
  the run's total invocation count equals the number of non-excluded
  recipients (or fewer, if it stopped).
- **Fails when:** any invocation makes two transport calls (a server-side
  loop); or two invocations are in flight simultaneously; or either forbidden
  directory set reaches the send.
- **Direction of failure:** a server-side loop is the failure, and it is the
  tempting one, because it looks simpler and passes under vitest where nothing
  times out.

### C7 - the confirmation is server-issued, bound, and consumed once

Satisfies Ruling 2's second half, K5 and K7.

- **Object:** the token column on the attempt row, and its consumption.
- **Instrument:** `prepare` then two sends with the same token; and a send with
  a token whose attempt row's stored subject/body/course differ from the
  arguments supplied.
- **Pass condition:** the token is minted server-side at `prepare`; the send
  reads subject, body, course and the recipient set **from the attempt row**,
  never from its own arguments; the first send marks `token_consumed_at`; a
  second send with the same token makes zero outbound requests.
- **Fails when:** any send-path value is taken from a client argument other
  than the attempt id and the token; or the token is recomputed from client
  input; or a consumed token sends anything.
- **Direction of failure:** the send must be UNABLE to send something other
  than what was confirmed, so the construction is "the server reads the payload
  from its own row", not "the server checks a signature the client sent".

**This also discharges K6 by construction.** If the body and recipient set come
from the row, a roster change between confirm and send cannot reach the wire.

### C8 - the roster read exposes enrollment state AND completeness

Satisfies K3, K4 and Ruling 5's "define the base set once".

- **Object:** the new roster reader's return value.
- **Instrument:** a mocked Canvas paginating: (a) normally to `next === null`;
  (b) past the page cap with `next` still non-null; and a page containing an
  active student, a student enrolled in two sections, an invited student, an
  inactive student, a concluded student, a teacher, a TA, an observer, a
  designer, and Canvas's test student.
- **Pass condition:** the reader returns `{ entries, complete }` where
  `complete` is `false` exactly when the loop exited with `next` non-null;
  every entry carries its enrollment state; each user id appears **once**
  (the two-section student is deduplicated); and only student-type enrollments
  are present.
- **Fails when:** `complete` is true after a capped read; or a user id appears
  twice; or a non-student appears; or the state is absent from any entry.
- **Direction of failure:** silently reporting a capped read as complete is the
  failure this exists for. A bulk send that quietly misses students is a
  correctness defect, not a UX one.
- **Base set, defined ONCE:** the **roster** is every row this reader returns.
  The **recipients** are the roster rows whose enrollment state is `active`.
  Every other row is an `excluded` recipient row in the ledger with its reason.
  The confirm count that C5's summariser reports is the RECIPIENT count, and
  the excluded rows are reported by `excludedNote` only. Invited and inactive
  students are excluded by default (E2 unchanged).
- **Endpoint:** `/api/v1/courses/<id>/enrollments?type[]=StudentEnrollment&per_page=100`,
  following `parseNextLink` through `assertCanvasSuppliedUrlIsSameOrigin`
  exactly as every other reader does - **required**, because
  `src/lib/canvas-pagination-guard.structure.test.ts` counts CALL SITES, not
  files, and an unguarded follow fails it. State is NOT filtered in the query;
  it is returned and classified in code, so K3's fixture can exercise every
  state through one path.

### C9 - a refused send does not lose the instructor's text

Satisfies Ruling 5.

- **Object:** the persisted draft, across a refusal.
- **Instrument:** a `prepare` that refuses for each reason in turn - no LMS
  link, roster read failed, an open prior attempt - then read the persisted
  draft.
- **Pass condition:** subject and body are still persisted after every refusal;
  they are cleared only when a token is CONSUMED (the first outbound request of
  that attempt), never at `prepare`, never at display of the confirm.
- **Fails when:** any refusal path clears the draft; or the clear happens
  anywhere other than inside token consumption.
- **Direction of failure:** clearing too early is the failure. K13's "cleared
  at confirm" is re-read as "cleared at consumption", because nothing outbound
  has happened at confirm-display time. **This narrows K13, deliberately;** see
  the disposition table.

### C10 - the body leaves as plain text

Satisfies K10.

- **Object:** the `body` parameter of every outbound request.
- **Instrument:** a send whose body was produced by A21's Markdown drafter
  (headings, bold, a list), plus one hand-written body containing `<p>` and
  `**bold**`.
- **Pass condition:** the bytes on the wire equal the bytes the confirm showed,
  and the app performs **no** Markdown-to-HTML conversion anywhere in the send
  path.
- **Fails when:** the send path imports or calls any Markdown or HTML
  conversion helper; or the wire body differs from the confirmed body.
- **Direction of failure:** the failure is the app CONVERTING. Whether Canvas
  renders Markdown literally is OC4 and is not this test's business; the app's
  job is to send what was shown. The drafter reused is
  `draftAnnouncementAction` (section 3.5), which asks for plain text.

### C11 - the UI states the honest limit, and no state claims delivery

Satisfies P5 and Q5.

- **Object:** the summary type's state names, and the result copy.
- **Instrument:** a structure test over the feature's file set for forbidden
  delivery words in user-facing strings (`delivered`, `received`, `sent to
  their email`, `emailed`), plus a pin that the accepted state's own name is
  Canvas-bounded.
- **Pass condition:** the strongest state available is "Canvas accepted"; the
  result surface carries a sentence saying the app cannot confirm an email
  arrived and that each student's own Canvas notification settings decide
  whether one is sent; and, until OC2 is answered, nothing describes the
  subject field as the email's subject line.
- **Fails when:** any state name or copy asserts delivery or receipt.
- **Direction of failure:** the honest-limit sentence being ABSENT is a
  failure; wording is READING (OC6, owner, real browser, Verify). The
  source-text pin is on the FACT and the forbidden words, never on the
  sentence's spelling - `docs/loop/traps-tests.md`'s over-specification rule.

### C12 - the capability wall measures REQUESTS, not import closure

Satisfies Ruling 4, and re-derives its allow-set for (A).

- **Object:** the set of distinct hosts requested during one complete driven
  send, end to end (prepare, N sends, finish).
- **Instrument:** a recorder installed at the two seams this app actually dials
  through - `canvasFetch` (`src/lib/canvas-fetch.ts`) and the Supabase client
  factory - collecting every URL's host. **Not** `globalThis.fetch`, because
  `vitest.setup.ts` already throws on a real fetch, so a global-level recorder
  measures nothing and would pass vacuously.
- **Allow-set under (A): `{ the resolved Canvas base URL's host, the Supabase
  project host }`. That is all.**
- **Fails when:** any other host is requested. In particular a model host
  (`generativelanguage`, `models.github.ai`) appearing during a SEND is the
  failure K11 exists for. Drafting happens in a separate, earlier action the
  instructor invokes deliberately; it is not in the send path.
- **Direction of failure:** an extra host is the failure; a missing one is not
  (a run that never reaches Supabase has other problems C3 catches).
- **DELIBERATE NARROWING OF RULING 4, stated rather than done silently.**
  Ruling 4's allow-set was "Canvas, the chosen channel, Supabase and the
  Microsoft token endpoint". Under (A) the chosen channel IS Canvas and
  Microsoft Graph is not in the path at all, so the Microsoft entries are
  REMOVED. If a Microsoft host is ever observed during an A29 send, that is a
  failure, not an allowance.
- **Why not import closure:** Ruling 4 measured both import-closure walls RED
  against the tree before a line of A29 existed. An implementer facing a wall
  that is red on arrival loosens it. Requests are what the criterion actually
  cares about.

---

## 5. The layers, and the file that CALLS each one

**THE SURFACE IS A LAYER.** L7 is not a garnish on this design; it is the layer
that makes L1-L6 reachable, and it ships in the same chunk. Every row names the
file that calls the layer above it, so no layer can ship with nothing calling
it.

| L | What it is | New/changed files | **Called by** |
|---|---|---|---|
| L1 | Canvas transport: one single-recipient conversation POST returning a three-state result (C1, C2) | `src/lib/canvas/inbox.ts` (add `postCourseConversation`; re-implement `createConversation` over it), re-export in `src/lib/canvas.ts` | L5's send action |
| L2 | Roster reader with enrollment state + completeness (C8) | `src/lib/canvas/listings.ts` (add `listCourseEnrollmentRoster`), re-export in `src/lib/canvas.ts` | L5's prepare action |
| L3 | Durable attempt ledger: schema + the ONE owning module (C3, C4, C7) | `supabase/migrations/2026<next>_bulk_course_message_attempts.sql`; `src/lib/bulk-course-message/attempts.ts`; row types added to `src/lib/supabase/types.tables-*.ts` | L5, all four actions |
| L4 | Pure summariser - the only producer of any count (C5) | `src/lib/bulk-course-message/summary.ts` | L5 (all four actions return its output); L7 displays it |
| L5 | Server actions: `prepareBulkCourseMessageAction`, `sendNextBulkCourseMessageRecipientAction`, `resolveBulkCourseMessageAttemptAction`, `finishBulkCourseMessageAction` | `src/app/actions/bulk-course-message.ts`; barrel entry in `src/app/actions/index.ts` (or the existing actions barrel) | L6 |
| L6 | The pump hook: browser-side loop, concurrency 1, holds NO recipient list (C6) | `src/app/components/courses/useBulkCourseMessage.ts` | L7 |
| L7 | **THE SURFACE.** A modal: subject, body, an optional "Draft with AI" calling `draftAnnouncementAction`, the message-vs-announcement facts (K12), the server-issued confirm, live progress, the honest-limit sentence (C11), and the prior-attempt resolution choice (C4) | `src/app/components/courses/BulkCourseMessageModal.tsx` (NEW file, so no existing component grows) | **`src/app/components/courses/CourseRow.tsx`**, which renders it and adds the menu item to the LMS column's `CellMenu`, gated on `imports.canLms(course)` at `CourseRow.tsx:145` and disabled with `lmsConnectionStatusFor`'s reason otherwise |

**Where the instructor reaches it, concretely - and the wiring was opened, not
assumed.** Courses tab -> the LMS column's hamburger menu on a course row ->
"Message all students". Two clicks, on a surface the instructor is already on,
in the column whose own status pill already reports the LMS connection.

The exact wiring that exists today:

- `CourseRow.tsx:309-314` renders `<LmsCell ... menu={cellMenuFor("lms")} />`.
- `cellMenuFor` (`CourseRow.tsx:187`) returns
  `<CellMenu label={...} items={[copyItem(column)]} context={course.name} />`.
- So **the LMS cell's menu today holds exactly ONE item**, the copy item
  (`CourseRow.tsx:156`).

W4's change is therefore precise and small: give `cellMenuFor` a second item
for the `lms` column only, whose `disabled` / `disabledReason`
(`CellMenu.tsx`'s `CellMenuItem` fields) are driven by
`imports.canLms(course)` and `lmsConnectionStatusFor`'s category. That is K1's
"absent, or visibly unavailable with the category's reason" discharged with an
idiom already in the file, and `CellMenu` keeps disabled items keyboard-
reachable (`disabledItemsFocusable: true`, documented in its own header), so
the reason is actually announced rather than silently skipped.

Alternative homes considered and rejected: Drafts > Messages
(`MessageDraftsTab.tsx`, 525 lines) is per-draft and carries no course context;
a new tab spends a click and a whole surface on one action.

**Why `useCourseImportActions.ts` is NOT extended.** Its seven `canLms`-gated
actions are all one-shot server calls; A29's is a multi-invocation pump with
its own state machine. Adding it there would push that file from 608 lines
toward the ceiling and mix two lifetimes. The gate check itself is copied from
there (the same refusal sentence), not re-derived.

**A liability this design accepts and names:** `CourseRow.tsx` is 694 lines and
`CoursesTable.tsx` is 792. Wave 4 adds roughly a menu item and a conditional
render to `CourseRow.tsx` - tens of lines, not hundreds. If the as-built
diff puts either file over 900, the extraction is owed **before** the wave is
verified, not after (`src/file-size-ceiling.structure.test.ts`). Recorded as
**RA5**.

---

## 6. The state machine, in one table

| Event | Ledger effect | Outbound | Returned to client |
|---|---|---|---|
| `prepare(courseId, subject, body)` | If an `open` attempt exists for this course: none. Else: read roster (L2), insert attempt (`open`, token) + one recipient row per roster member (`pending` or `excluded`) | roster GETs only | `BulkSendSummary` + token, **or** a refusal carrying the prior attempt's id and ITS summary |
| `sendNext(attemptId, token)` | Server picks one `pending` recipient, marks `token_consumed_at` on first call (clearing the persisted draft, C9), issues L1, writes that recipient's terminal state | exactly one conversation POST | `{ done, summary }` - no ids, no lists |
| `sendNext` when no `pending` remains | attempt -> `resolved`/`completed` | none | `{ done: true, summary }` |
| `resolve(attemptId, "abandon")` | attempt -> `resolved`/`abandoned`; `pending` rows -> `unknown` with reason `abandoned` | none | `summary` |
| `resolve(attemptId, "resume", { includeUnknown })` | mints a NEW token on the SAME attempt; `unknown` rows return to `pending` only if `includeUnknown` | none | `{ token, summary }` |

**Why this discharges K9's "resend to the rest" clause without a separate
mechanism:** resuming iterates `pending` rows only, so an `accepted` recipient
is structurally unreachable by a resume, and an `unknown` one is reachable only
through the explicit `includeUnknown` choice - which is a server-issued
resolution of a specific attempt by id, exactly what Ruling 3 required instead
of a boolean.

**And this is why the guard and the resumability had to be designed together.**
The same ledger is both. A design with a resumable job and a separate
double-send guard would need them to agree about what "already sent" means;
here there is one answer and it is a row's `state`.

---

## 7. `owns` - every file that must be run or read when this lands

Derived, not recalled. The set is (a) the write set, (b) every existing test
that asserts on behaviour being changed, and (c) **every test that reads source
files as TEXT**, because those go red on a file they do not own.

### 7.1 Command for (c), with its output pasted

```
$ grep -rl "readdirSync" src --include=*.test.ts | sort
```

39 files (`| wc -l` -> `39`). Canary: `src/lib/no-emojis.test.ts` is expected in
the set and is present (`grep -c "no-emojis"` -> `1`), so the pattern is not
silently failing.

```
src/app/actions/action-guard-coverage.test.ts
src/app/actions/prompt-announcement-draft.test.ts
src/app/bulkBarCss.test.ts
src/app/components/assessment-shared/assessment-shared.structure.test.ts
src/app/components/canvas-tab/announcements-panel.wiring.test.ts
src/app/components/content-tab/modules/currentEventsAssignments.wiring.test.ts
src/app/components/courses/page-module-css-classes.test.ts
src/app/components/courses/page-module-css-orphan-classes.test.ts
src/app/components/grading-recording/grading-rows.test.ts
src/app/components/grading-recording/submission-kind-callsites.structure.test.ts
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
src/app/components/message-replies/message-replies.structure.test.ts
src/app/components/module-deck-capture/module-deck-capture.structure.test.ts
src/app/components/recording/avatar-script.test.ts
src/app/components/recording/postQuestions.wiring.test.ts
src/app/components/recording/recording-split.structure.test.ts
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts
src/app/components/ui/buttonVariant.test.ts
src/app/components/ui/confirmArmButtons.test.ts
src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts
src/app/components/workflows/th-scope.structure.test.ts
src/file-size-ceiling.structure.test.ts
src/lib/canvas-client-boundary.test.ts
src/lib/canvas-client-boundary.transitive.test.ts
src/lib/canvas-pagination-guard.structure.test.ts
src/lib/client-state-sweep.registry.test.ts
src/lib/grade/grade-result-doors.wiring.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
src/lib/no-emojis.test.ts
src/lib/recording-files.kinds.test.ts
src/lib/session-diagnostic-log.test.ts
src/lib/supabase/impersonation-identity-source.test.ts
src/lib/use-server-exports.test.ts
src/source-bytes.structure.test.ts
src/supabase-migrations.structure.test.ts
src/tools/vitest-paths/gate-commands.structure.test.ts
```

### 7.2 The subset that will actually bind, and what each demands

| Walker | What it will demand of A29's new files |
|---|---|
| `src/app/actions/action-guard-coverage.test.ts` | Every new `"use server"` export in `bulk-course-message.ts` needs its request guard (`requireOwner`, `src/lib/supabase/auth.ts:451`) **in its own body**. Four new actions = four guards. Anything reachable from the root layout and unguarded is the critical class. |
| `src/lib/use-server-exports.test.ts` | `bulk-course-message.ts` may export **only async functions** - no type re-export, no const. |
| `src/lib/canvas-pagination-guard.structure.test.ts` | L2's new `parseNextLink` follow must dial the value `assertCanvasSuppliedUrlIsSameOrigin` RETURNS. It counts call sites, so "this file already guards elsewhere" will not pass it. |
| `src/file-size-ceiling.structure.test.ts` | Every touched file stays under 1000 (section 3.1 and RA5). |
| `src/supabase-migrations.structure.test.ts` | The new migration must be lexically well-formed SQL: **every apostrophe inside a `comment on ...` string doubled**. This is the gate that has no local backstop - migrations auto-apply on push. |
| `src/lib/client-state-sweep.registry.test.ts` | Any module-scope `...Cache` the pump introduces must register or be named with a reason. The persisted `ta-` draft keys must be reachable by the sweep. |
| `src/lib/canvas-client-boundary.test.ts`, `.transitive.test.ts`, `src/lib/module-graph/runtime-import-graph.test.ts` | L6 and L7 are client modules. Nothing in their closure may reach `src/lib/supabase/**` except `lib/supabase/client.ts` (`src/lib/module-graph/client-boundary-policy.ts:19,24`). **L3's owning module must never be imported by L6 or L7** - only by L5. |
| `src/lib/no-emojis.test.ts` | Owns the emoji rule. Do not hand-roll a scan. |
| `src/source-bytes.structure.test.ts` | Owns the escape/BOM/mojibake scan. A `\uXXXX` written through the Write tool lands as the literal character. |
| `src/tools/vitest-paths/gate-commands.structure.test.ts` | Any gate command this feature adds must use the `test:paths` wrapper. |

### 7.3 Behavioural tests to re-run

```
$ grep -rln "createConversation\|sendCanvasMessageAction\|postMessageDraftAction\|listCourseRoster\|listStudents" src --include=*.test.ts | sort
src/lib/canvas.pullback.test.ts
src/lib/canvas/listings.test.ts
src/lib/course-intel/join.test.ts
src/lib/workflows/registry/steps.course-setup.rosters.test.ts
```

Four files, and every one must be in the wave's run, because
`createConversation` is being re-implemented. "Behaviour-preserving" is a claim
a test must check, not a promise. The wave's own command:

```
npm run test:paths -- src/lib/canvas src/lib/canvas.pullback.test.ts src/lib/course-intel/join.test.ts src/lib/workflows/registry/steps.course-setup.rosters.test.ts src/app/components/courses
```

plus the full suite at the chunk's gate.

**MEASURED ABSENCE, and it is a finding for the implementer, not a detail.**
There is **no `src/app/actions/messaging.test.ts`**:

```
$ ls src/app/actions/ | grep -i messag
canvas-inbox.message-replies.test.ts
message-replies.test.ts
message-replies.ts
messaging-outlook.ts
messaging-scheduling.ts
messaging.ts
```

`messaging.ts` - which holds `sendCanvasMessageAction`, `postMessageDraftAction`
and `draftAnnouncementAction`, all three of which A29 touches or reuses - has
**no test file of its own**. So the existing single-student Canvas send has no
behavioural test, and W2's "the wrapper preserves behaviour" claim has nothing
existing to lean on. W2 therefore owes a NEW test for `createConversation`'s
preserved throw-on-non-ok behaviour; it cannot rely on an existing one.

An earlier draft of this document named `src/app/actions/messaging.test.ts` in
the command above. It does not exist, and a raw multi-path `vitest run` would
have dropped that argument and exited 0 - which is exactly why every gate here
is spelled `npm run test:paths -- ...`.

---

## 8. Wave plan

Waves are disjoint by write set. Every wave includes the file that CALLS its
new exports, so no wave can ship a dead library.

| Wave | Write set | Includes its caller? |
|---|---|---|
| **W1 - ledger** | `supabase/migrations/<new>.sql`; `src/lib/bulk-course-message/attempts.ts`; `src/lib/supabase/types.tables-*.ts` (one file); `src/lib/bulk-course-message/attempts.test.ts` | No caller yet by design - this is the only wave that may land without one, and W3 is its caller. If W3 slips, W1 must not be pushed alone. |
| **W2 - Canvas transport + roster** | `src/lib/canvas/inbox.ts`; `src/lib/canvas/listings.ts`; `src/lib/canvas.ts`; `src/lib/canvas/conversations-post.structure.test.ts`; the two readers' tests | `src/lib/canvas.ts` re-export plus the existing `createConversation` caller, which W2 must leave green |
| **W3 - actions + summariser** | `src/app/actions/bulk-course-message.ts`; `src/lib/bulk-course-message/summary.ts`; the actions barrel; their tests | Calls W1 and W2. The barrel is the wiring file and **must be in this list** |
| **W4 - surface** | `src/app/components/courses/useBulkCourseMessage.ts`; `src/app/components/courses/BulkCourseMessageModal.tsx`; **`src/app/components/courses/CourseRow.tsx`**; the pump's test | `CourseRow.tsx` is the file that renders the modal and adds the menu item. **Omitting it ships the feature dead**, which is the failure this repo has already paid for twice |

W1 and W2 are disjoint and may run concurrently. W3 depends on both. W4 depends
on W3. Cap respected: at most 2 concurrent.

**Gate every wave with `git status --short` against the assignment**, and check
no `.claude/worktrees` copy was edited instead of the real tree.

---

## 9. Disposition of `docs/a29-ac.md` revision 1 and `docs/a29-rulings.md`

The owner's decision withdraws two of three option branches, so this is a
restructuring and owes a disposition row for every prior requirement. **The id
column was re-derived LAST, after all numbering above was final.**

| Prior id | Disposition | Now |
|---|---|---|
| K1 (LMS gate) | kept; construction named - `lmsConnectionStatusFor`'s categories via `CourseRow.tsx:145` + `CellMenu` disabled-with-reason | L7, section 5 |
| K2 (live proven at send time) | kept; discharged by C8 + the prepare/send split - a failed roster read means no attempt row, therefore no token, therefore no send | C8, section 6 |
| K3 (active students, each once) | kept; the reader requirement it stated is now built | C8 |
| K4 (incomplete roster) | kept; `complete` is a returned field, not a marker a display invents | C8 |
| K5 (confirm signature) | kept, **re-shaped**: the architect's choice between a pure arm signature and a server token is exercised in favour of the server token, per Ruling 2 | C7 |
| K6 (what is sent is what was confirmed) | kept; discharged BY CONSTRUCTION (payload read from the row, never from the client) | C7 |
| K7 (one confirmation spent once) | kept | C7 |
| K8 (outcome with no counts, one summariser) | kept; **strengthened** - the client also never receives a recipient list, because a list is a count | C5 |
| K9 (lost outcome, no silent re-send) | kept; unified with resumability into one ledger | C3, C4, section 6 |
| K10 (channel's own format) | kept; target is plain text, and the pass condition is "the app converts nothing" | C10 |
| K11 (no model call in the send path) | kept; **instrument replaced** - requests, not import closure, per Ruling 4 | C12 |
| K12 (message vs announcement) | kept, READING | L7; OC6 |
| K13 (drafts persist; nothing authorising persists) | kept, **NARROWED and the narrowing is declared**: "cleared at confirm" becomes "cleared at token consumption", because Ruling 5 forbids losing the text on a refusal and nothing outbound has happened at confirm-display | C9 |
| K14 (no unattended path sends) | kept unchanged; **it is also why a Route Handler was rejected** | C6, section 2.1 |
| P1 (which address) | **WITHDRAWN.** Under (A) the recipient is a Canvas user id and Canvas chooses the address. The app never reads, holds or transmits a student address. Enforcer protected: none that survives - P1's fixture asserted address provenance, which no longer exists. E5 is moot | - |
| P2 (per-recipient receipt) | **kept, and re-derived to (A)'s per-student shape.** Ruling 3's "state per batch, not per recipient" was a (B')/BCC constraint; under (A) each student IS their own request, so per-recipient state is honest here and the batch type is withdrawn with the option | C2, C3 |
| P3 (partial is partial) | kept; re-derived to Canvas statuses only; Graph's 403 clause withdrawn with (B') | C2 |
| P4 (no student sees another) | kept; **promoted from a property to a construction** - request cardinality | C1 |
| P5 (no delivery claim) | kept; strengthened by Q5's finding that delivery depends on a per-student preference the app cannot see | C11 |
| P6 (channel precondition) | **WITHDRAWN** as a separate criterion. Under (A) it collapses into K2/C8 (a live Canvas read), exactly as the criteria themselves predicted. Enforcer protected: the Outlook-connection refusal, which has no referent under (A) | C8 |
| P7 (addresses do not outlive the send) | **WITHDRAWN as unsatisfiable-by-vacuity and replaced.** The app never holds an address, so the original has nothing to assert. Its INTENT is kept: the ledger stores Canvas user ids and never an email address, pinned by C3's column list. E6 is moot | C3 |
| L1 (removal test) | kept; (A)'s variant is the binding one - the same live-vs-stored fixture over Canvas user ids, and the deletion that must turn it red is replacing the live roster read with any stored list (`studentRepos[]`, a tile, a cached attempt) | C8 |
| OV1 | kept, re-derived for (A) | OC1 |
| OV2 | kept | OC6 |
| OV3 | kept | OC6 |
| Ruling 1 (guard on the course) | kept, built | C4 |
| Ruling 2 (durable record; server-issued confirm) | kept, built | C3, C7 |
| Ruling 3 (four labels become constructions) | kept: K8 -> C5; P2's batch-state clause **withdrawn with (B')**; K9's server-issued resolution -> section 6's `resolve`; K13 -> C9, and it is now a construction (the clear IS part of token consumption), so its "re-label it a reading claim" fallback is not needed | C5, C9, section 6 |
| Ruling 4 (measure requests) | kept; allow-set **narrowed** to `{Canvas, Supabase}` and the narrowing declared | C12 |
| Ruling 5 (majors) | "refused send keeps the text" -> C9. "Assert each state's count" -> C5's partition clause. "Define the base set once" -> C8. "Ambiguous = unknown" -> C2. "Reuse the plain-text drafter" -> C10, and the apparent conflict with the criteria was measured and found not to be one (3.5). **Two clauses WITHDRAWN with (B'): Sent Items keeping every BCC address, and the "cannot read the Canvas-profile address" single-reason clause.** Neither has a referent under (A). The Sent Items privacy question the owner was owed is moot for A29 but **still true of the existing Outlook path**, so it is not deleted - it becomes RA4 | C2, C5, C8, C9, C10, RA4 |
| Ruling 6 (minors) | the citation-by-symbol and K1-wording items are absorbed; the tile-email-provenance and P2-under-(B') items are **withdrawn with (B')** | - |
| E1 (which option) | **CLOSED** by the owner, 2026-09-21 | - |
| E2 (invited/inactive) | kept, default excluded, stated once | C8 |
| E3 (A21's voice) | kept, open | RA1 |
| E4 (leverage call) | kept, open | section 10, RA2 |
| E5 (which Canvas address field) | **moot** under (A) | - |
| E6 (may the outcome hold addresses) | **moot** under (A); C3 stores no address | - |

---

## 10. Leverage

**Trigger fired: feature work.** A claim is owed.

**Class claimed: GUARANTEED.** At the moment the instructor confirms, the
recipient set **is** the live Canvas roster of active students for that course,
each exactly once, with the read's completeness stated rather than assumed; and
after the run, every one of those students is in exactly one recorded state that
survives the process dying. Neither half is something an instructor gets from a
chat with an LLM, from Canvas's own Inbox compose (which offers no per-recipient
record and no resumable partial state), or from this app today.

**What the instructor does instead today, measured, not assumed.** In this app:
nothing. There is no multi-recipient Canvas send anywhere in the tree - one
`recipients[]` append, single-valued (section 2.2, canary-checked). Outside it:
Canvas's own Inbox compose to `course_<id>`, which is one action but gives no
record of who it reached and, under the documentation's own reading of
`group_conversation` for a class over 100, may put the whole roster in one
thread.

**What is inherited, not earned:** the drafting (chat-equivalent; it is
`draftAnnouncementAction`, already built), and the transport (one
`createConversation`, already built). The claim rests entirely on the roster
guarantee and the durable per-student ledger.

**The three-way call is the owner's (E4), not mine.** Recorded as RA2:
- **Redesign** toward SCALE - per-student content merged from course data, the
  shape `messaging.ts:120`'s nudge drafter already proves is buildable, which
  would make the per-student fan-out carry something a single broadcast cannot.
- **Accept** the GUARANTEED claim as stated - a live roster and a durable
  ledger, which is a real but modest advantage.
- **Reject** in favour of telling the instructor to use Canvas's own compose.

**The removal test is L1** (kept; section 9): swap the live roster read for any
stored list and the asserted recipient set must change.

---

## 11. Residual register

An entry without an owner, an instrument and a step is a deletion. Each row has
all three. **None of these exists until it is in `docs/BACKLOG.md`** - that is
the orchestrator's step at this chunk's push, and this seat did not write
`docs/backlog.yml`.

| Id | Requirement | Owner | Instrument | Step |
|---|---|---|---|---|
| RA1 | E3: is `draftAnnouncementAction`'s course-announcement voice right for a private Inbox message, or does A29 need its own instruction? | Repo owner | Read one drafted body in the modal | Verify |
| RA2 | E4: the leverage three-way call (section 10) | Repo owner | Section 10's three options | Verify |
| RA3 | OC1-OC6: the six Canvas/platform facts no test here can settle (sections 1.1 and 2.1) | Repo owner | A Canvas sandbox, a test student's mailbox, the Vercel project settings page | Verify, before push |
| RA4 | The EXISTING Outlook path sets `saveToSentItems: true`, so every BCC address is kept permanently in the instructor's Sent Items. Moot for A29 under (A); still true of `sendMessageDraftByEmailAction` | Repo owner | Read `src/app/actions/messaging-outlook.ts` around the Graph call | A separate backlog item, not A29 |
| RA5 | `CourseRow.tsx` is 694 and `CoursesTable.tsx` is 792 (section 3.1). If W4's as-built diff puts either over 900, the extraction is owed before W4 is verified | Whoever implements W4 | `src/file-size-ceiling.structure.test.ts` and both counters | W4's wave gate |
| RA6 | The two existing roster readers disagree on enrollment-state filtering (`listings.ts:248`/`:286` request no state; `:318` requests `state[]=active`). A29 adds a THIRD reader rather than reconciling them, deliberately - reconciling three readers inside this chunk would widen the write set across features that do not need it | Whoever next touches roster reading | A fixture exercising each enrollment state through all three readers | A separate backlog item |
| RA7 | `canvasError` (`canvas-core.ts:101`) discards the HTTP status for every Canvas call in the app, not just this one. A29 routes around it (C2); every other caller still cannot distinguish a throttle from a refusal | Whoever next needs status-level Canvas error handling | `grep -rn "canvasError(" src` and one fixture per status class | A separate backlog item |
| RA8 | `src/app/actions/messaging.ts` has **no test file** (section 7.3), so the shipped single-student Canvas send is untested. W2 re-implements `createConversation` underneath it and must write the preservation test itself rather than assume one exists | W2's implementer | A new test asserting `createConversation` still throws `canvasError` on each non-ok status and still sends one `recipients[]` | W2, before its wave gate |

---

## 12. What I could not determine

Stated plainly rather than filled in. `docs/loop/this-repo.md` section 6 lists
what this environment cannot verify; these are this row's instances.

- **Anything Canvas actually DOES.** The network is blocked and there is no key.
  Every test this design specifies asserts what request the app SENT. Not one
  asserts what Canvas did with it. The `group_conversation` / `bulk_message`
  conflict (Q2) is therefore permanently unsettleable here, which is exactly
  why C1 makes it irrelevant instead of resolving it.
- **Whether `bulk_message` is accepted at all** by any given Canvas, being
  absent from the parameter table (OC3).
- **Whether a conversation message emails a student**, and what the email's
  subject line is (OC1, OC2). Source evidence exists and is labelled as source.
- **The platform's default Server Action duration** (OC5). The design is built
  not to depend on it.
- **Anything about rendered markup, focus order or keyboard behaviour.** No
  component is rendered by any test in this repo. Every UI claim in this
  document (L7's placement, C11's copy, K12's facts) is a READING claim routed
  to OC6, and **no criterion here is enforced only by a render**.
- **Whether `course_<id>_students` would be accepted** for this owner's Canvas
  role. Not used, so not needed.
