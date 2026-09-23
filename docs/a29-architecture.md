# A29 - architecture: bulk message to a course's students via Canvas Inbox

Seat: architecture (`loop-architect`). **Revision 2 of a cap of 2**, authored
2026-09-22 against a check returning 7 blockers (4 new, 3 repeat), 7 majors and
5 minors, and the verdict "not buildable as written". This document decides
SHAPE. It writes no production code.

**Consumes:** `docs/backlog.yml` A29; `docs/a29-ac.md` revision 1 (K1-K14,
P1-P7, L1, OV1-OV3, E1-E6); `docs/a29-rulings.md` **rounds 1 and 2** (rulings
1-15, round 2 committed at `128eca6`), which OVERRIDE the criteria and override
this document's revision 1 where they conflict.

**Binding owner decision, verbatim** (`docs/backlog.yml`, A29 `note`):

> "for bulk email: message on canvas and also use canvas' built in emailer"

That is **option (A)**. Options (B) and (B-prime) are WITHDRAWN. Section 9
disposes of every criterion those options carried.

Every quantity below names the command that produced it. Bash-tool commands are
shown as `$ ...`, PowerShell as `PS> ...`. Citations are **by symbol**, per
Ruling 6 and Ruling 15/M6; a line number appears only where this revision
opened that exact line.

**What revision 1 got right and this revision does not rebuild:** section 1,
the Canvas evidence. The checker re-fetched both pages live and confirmed every
quoted string verbatim, and confirmed that no Canvas SOURCE claim is anywhere
upgraded to documentation. Section 1 is reproduced unchanged.

**Revision 1's two findings that survived and are still findings:**
`canvasError` collapses HTTP statuses (RA7), and `src/app/actions/messaging.ts`
has no test file (RA8).

---

## 0. The one-paragraph shape

A bulk course message is **N separate single-recipient Canvas conversation
POSTs**, one per active student, each issued by its own server-action
invocation, **pumped from the browser**, against a **durable per-course attempt
ledger** written before the first outbound request. **One confirm mints one
attempt and one token; the token authorises the whole attempt and is spent when
the attempt reaches a terminal state.** Each invocation **CAS-claims one
recipient row** server-side, so two browser tabs cannot both send to the same
student. The browser never receives a recipient list - only a summariser's
scalar output - so no display can compute a count. Privacy is guaranteed by an
**allow-pattern on the emitted recipient value inside the one builder** plus a
**frozen emitted-parameter set**, not by a Canvas flag and not by a denylist.

---

## 1. THE FIVE CANVAS FACTS

*(Unchanged from revision 1; confirmed verbatim by the round-2 checker's own
live re-fetch.)*

Nothing in this checkout can reach Canvas: `vitest.setup.ts` replaces
`globalThis.fetch` with a throwing stub, and there is no key. So these came from
Canvas's PUBLIC API documentation, fetched live with the WebFetch tool on
2026-09-22, agreeing with the 2026-09-21 archive in the session scratchpad
(`conversations.html`, `conv.txt`, `thr.txt`, `notification_preferences.txt`).

Quotes are short excerpts under the copyright limit, each with its URL. Where
the documentation does not answer, this section says so and routes an owner
check - it does not fill the gap from recall.

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
(`conversations_controller.rb`, archived in the scratchpad as `cc.rb`), gated on
the caller holding `:send_messages_all` on that context. **That is source, not
documentation, and open-source Canvas is not necessarily what an institution's
Canvas Cloud runs.**

**This design uses NEITHER form.**

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
the table that defines every other parameter does not. Measured:

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

Canvas's own source says otherwise. In `conversations_controller.rb`:

```ruby
batch_private_messages = (!group_conversation && @recipients.size > 1) || force_individual_messages
batch_group_messages   = (group_conversation && value_to_boolean(params[:bulk_message])) || value_to_boolean(params[:force_new])
```

and either branch routes to `ConversationBatch.generate(...)`, whose `deliver`
loops **one recipient at a time**:

```ruby
recipient_ids.each_slice(chunk_size) do |ids|
  ids.each do |id|
    conversation = user.initiate_conversation([user_map[id]], !is_group, ...)
```

so a BATCH always produces one conversation per recipient regardless of the
`group` flag. The all-recipients-in-one-thread case is the OTHER branch
(`initiate_conversation(@recipients, !group_conversation, ...)`), reached only
when neither batch condition holds.

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
  (a fraction), `tags`, and the root `message`. Corroborated by source, which
  sets an `X-Conversation-Batch-Id` response header and renders `[]` with 202.

**HOW THE APP WOULD LEARN PER-RECIPIENT SUCCESS OR FAILURE: IT WOULD NOT.**
The batches endpoint documents no per-recipient field, and it returns only
*currently running* batches - so a batch that has finished, or errored, is
simply absent, and absent is indistinguishable from "finished cleanly" and from
"never existed". There is no documented per-recipient status anywhere in the
Conversations API.

**Consequence: `mode=async` is REJECTED.** Unusable twice over: ignored for a
single-recipient request (the only shape C1 permits), and even where usable it
returns nothing P2 could be built from.

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
  documented. `src/lib/canvas-throttle.ts` (`CANVAS_THROTTLE_BASE_DELAY_MS`'s
  doc comment) already records that absence and sizes its backoff defensively
  because of it.

**Consequence: send concurrency is 1, not 4.** This repo's other browser-driven
fan-out uses `COMMAND_APPLY_CONCURRENCY = 4`
(`src/app/components/content-tab/modules/useCommandInterface.ts`). A29 does not
copy that number: four is tuned for reads whose failure is a retry, whereas
here a throttled request is one student who did not get the message.

**But client-side concurrency 1 is a promise, not a guarantee** - see C6 and
Ruling 14.

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
category and a "Conversation Message" notification, described as "New Inbox
messages". Canvas ships an email template for it whose body renders the message
and whose subject is `"%{user_name} just sent you a message in Canvas."`
(scratchpad `cm_email.erb`).

**Two consequences, and the second is a UI requirement.**

1. The honest ceiling: the app can report that **Canvas accepted the message**,
   never that an email arrived. Routed as **OC1**.
2. **The subject the instructor types may not be the email's subject line.** On
   the source evidence the conversation subject is rendered inside the email
   body, while the email's own subject is Canvas's sentence about who sent it.
   Source-only, so routed as **OC2**; until OC2 is answered the confirm surface
   must not describe the subject field as "the email subject" (C11).

### 1.1 Owner checks - DEFINED HERE, one per check

Revision 1 referenced an `OC6` five times and defined it nowhere, collapsing
three distinct checks into one undefined id (Ruling 15/M4). Split:

| Id | Check | Owner | Instrument | Step |
|---|---|---|---|---|
| OC1 | Does a single-recipient conversation arrive as email at a test student's mailbox, and stop arriving when that student sets Conversation Message to `never`? (OV1 re-derived for (A)) | Repo owner | Canvas sandbox, test student account, that student's real mailbox | Verify, before push |
| OC2 | Is the instructor's `subject` used as the email's subject line, or only rendered in the body? | Repo owner | The same test send | Verify, before push |
| OC3 | Is `bulk_message` accepted by the institution's Canvas at all, given it is absent from the parameter table? | Repo owner | Canvas sandbox | Only if C1 is reopened - this design never sends it |
| OC4 | Does the conversation body render as plain text (no Markdown, no HTML) in the Canvas Inbox UI and in the email copy? | Repo owner | The same test send | Verify, before push |
| OC5 | What is the platform's unconfigured Server Action duration on this Vercel project? | Repo owner | The Vercel project settings page | Verify. **The design does not depend on the answer** (section 2.1) |
| **OC6** | **(was OV2, K1's display half)** On a course with no LMS link, is the "Message all students" control absent or visibly unavailable **with the status category's reason**? | Repo owner | Real browser | Verify |
| **OC7** | **(was OV2, K5's display half)** Does the confirm show course name, count, subject, and the full body as it will leave? | Repo owner | Real browser | Verify |
| **OC8** | **(was OV3 + K12)** Is there no delivery claim in the copy; are the message-vs-announcement facts and the route to the announcement composer present; is no count hand-computed beside the summariser? | Repo owner | Real browser **and reading the diff** (the last clause is a diff check, not a browser check - which is the instrument mismatch revision 1 hid) | Verify |
| OC9 | **How many of your courses exceed 100 students?** See section 10 - this decides whether A29's advantage is modest or empty | Repo owner | The owner's own course list | **Asked NOW, alongside the work, not after it** |

---

## 2. The two shape decisions everything else is built on

### 2.1 The fan-out is per-student, and the pump is the BROWSER

**Revision 1 phrased this as "there is no 60-second cap". That is wrong and
Ruling 15/M3 is right.** Corrected, precisely:

- **Vercel Hobby's hard cap IS 60 seconds**, and a route asking for more **fails
  the build**. `src/app/api/course-intel/ask/route.ts`'s header states it: prod
  is Hobby, "whose hard cap is 60s regardless of what a route asks for, and a
  value above 60 makes the deployment FAIL TO BUILD there." **So nothing in
  A29 may declare `maxDuration` above 60.** As revision 1 was phrased, an
  implementer could have set 300 and broken the deploy.
- **The real distinction is that an UNCONFIGURED Server Action gets the
  platform DEFAULT, which is smaller than 60 and is not a repo fact.** This
  document does not name that number from memory; it is OC5.

Measured, and this is the part that decides the shape:

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

`src/app/page.tsx` sets none, so every Server Action reachable from it runs on
the unconfigured default. The same conclusion is stated independently in
`src/app/api/course-intel/ask/route.ts`'s header: every Server Action reachable
from that page is "capped by whatever the platform's unconfigured default
happens to grant, never an explicit, confirmed ceiling."

**This repo has already solved this, and the design copies it.**
`src/app/actions/command-interface.ts`'s header (Task 2,
`applyCommandProposalRowAction`):

> "the fan-out is driven from the BROWSER, one invocation per row, because
> src/app/page.tsx sets no maxDuration and a server action looping N objects
> dies mid-loop on the platform default - and because 'rewrote 6 of 10 then
> crashed' must be a RENDERED state, not a lost one. This function must NEVER
> loop over rows."

`src/lib/canvas-throttle.ts` (`CANVAS_BULK_THROTTLE_BUDGET_MS`'s surrounding
doc comment) records the same rule from the other side: "Retry is safe where a
loop runs CLIENT-side, one server action per item ... each item is its own
function invocation".

**The design is therefore independent of OC5's unknown number.** One server
invocation issues exactly one Canvas POST - safe under any cap permitting a
single HTTP round trip. The N-student wall-clock cost lands in the browser,
which has no cap.

**This also keeps K14 satisfiable, and the alternative would not.** The obvious
escape from a short Server Action cap is a Route Handler, which can declare
`maxDuration` (up to 60, per above). Measured:

```
$ grep -rln "export const maxDuration" src/app/api | wc -l
12
```

**Twelve**, not the eleven revision 1 claimed without a command (Ruling 15/M7).
But K14's instrument is a transitive-import check from `src/lib/workflows/**`
and **`src/app/api/**`**. Putting the send behind a Route Handler makes K14's
own instrument red by construction. The browser-pumped Server Action is the
only shape satisfying the duration constraint and K14 together.

### 2.2 Privacy is enforced inside the builder, on the emitted value

Q2 left `group_conversation` / `bulk_message` in an unresolved conflict between
Canvas's documentation and Canvas's source. **No test in this repo can settle
it** - the network is blocked, so every test asserts only what request we
*sent*, never what Canvas *did*.

So the design never sends a request whose reading is in question: every
outbound POST carries exactly ONE `recipients[]`, and that one value is a bare
numeric Canvas user id. Under any reading of either document, a conversation
with one numeric-id recipient exposes that recipient to themselves and nobody
else.

**Revision 1's version of this did not hold, and Ruling 9 is right.** It relied
on a `string` parameter type, a `getAll("recipients[]").length === 1` count, and
a `/^(course|group)_/` denylist. `"401,402"` passes all three. So do
`section_12` and the `uuid:` form **this document's own Q1 quotes from the
`recipients[]` description**. An enumerated denylist over an unrestricted value
is the shape this repo has recorded failing repeatedly.

**The shipped code already has the right guard and revision 1 dropped it.**
`src/app/actions/messaging.ts:301`, inside `postMessageDraftAction`:

```ts
if (!payload.courseUrl || !payload.recipientUserId || !/^\d+$/.test(payload.recipientUserId)) {
  return { error: "Invalid or missing recipient for message." };
}
```

Opened and read this revision. Note **where** it sits: in the CALLER, not in
`createConversation`. So any other caller - including A29's - inherits no guard
at all. C1 moves an allow-pattern INSIDE the builder.

**Measured absence, canary-checked:**

```
$ grep -rn "recipients\[\]\|group_conversation\|bulk_message" src --include=*.ts --include=*.tsx | grep -v "\.test\."
src/lib/canvas/inbox.ts:400:  params.append("recipients[]", recipientUserId);
$ grep -c 'recipients\[\]' src/lib/canvas/inbox.ts
1     # canary: the one known site is found, so the pattern is not silently broken
```

Exactly one `recipients[]` append in the whole tree, single-valued, and neither
flag appears anywhere. There is no multi-recipient Canvas send in this codebase
today.

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

All eight under the 1000-line ceiling
(`src/file-size-ceiling.structure.test.ts`), and the two counters agree, so the
known 42-line discrepancy does not apply here. The three closest to the ceiling
are why wave 4 adds a NEW component file rather than growing any of them.

### 3.2 The transport that exists, and what is wrong with it for A29

`createConversation` (`src/lib/canvas/inbox.ts`) takes
`(courseUrl, recipientUserId: string, body, subject?)`, appends one
`recipients[]`, appends `context_code=course_<id>` and `force_new=1`, and
returns `Promise<void>`.

Three defects for A29, all measured:

1. **No allow-pattern on the emitted recipient.** Section 2.2.
2. **It discards the status.** On a non-ok response it throws
   `canvasError(response.status, institution)`, and `canvasError`
   (`src/lib/canvas-core.ts`) collapses 401 and 403 into one sentence, 404 into
   another, and everything else into `Canvas request failed (HTTP ${status})`,
   returning a bare `Error`. So the caller cannot tell a 429 from a 400.
   Ruling 5 requires exactly that distinction.
3. **It cannot express UNKNOWN.** A throw and a void cannot carry "the request
   left, and we do not know what happened".

`force_new=1` is harmless *at one recipient* on the source reading (it takes the
batch branch, and a batch of one is one conversation), and is what the shipped
single-student path already sends. C1 keeps it.

Its one call site is `sendCanvasMessageAction` (`src/app/actions/messaging.ts`),
reached from `postMessageDraftAction`.

### 3.3 The roster readers, and what K3/K4 need that they do not give

Cited by symbol, all in `src/lib/canvas/listings.ts`:

- `listStudents` and `listCourseRoster` both query
  `/api/v1/courses/<id>/users?enrollment_type[]=student&per_page=100`. Neither
  requests `include[]=enrollments`, so **neither returns an enrollment state**.
  `listCourseRoster` reads `login_id` live.
- `listStudentGradeSummaries` queries
  `/api/v1/courses/<id>/enrollments?type[]=StudentEnrollment&state[]=active&per_page=100`
  - the only reader filtering by state, returning one row per ENROLLMENT, so a
  student in two sections appears twice.
- All three cap at `CANVAS_PAGINATION_PAGE_CAP`
  (`src/lib/canvas-remote-url.ts`) and **all three exit the loop silently when
  the cap is hit with `next` still non-null.**

No existing reader gives enrollment state, completeness, or once-per-student.
That is why L2 is a new reader, and why it deduplicates by user id.

### 3.4 The durable-store and row-claim precedents

**The ledger.** `supabase/migrations/20261016000000_lms_credential_save_attempts.sql`
states A29's own reasoning verbatim: an in-memory counter "resets on every cold
start and is not visible to any other concurrently running instance, which on
this deployment (Vercel, serverless) is equivalent to no limit at all." It also
records the conventions this design follows: one owning module
(`src/lib/lms-credential-save-attempts.ts`), service-role access only, **no RLS
policy for `authenticated`**, and the 42P10 upsert trap.

```
$ ls supabase/migrations | wc -l
108
```

Migrations auto-apply via a GitHub Action on push to main, so they must be
idempotent (`create table if not exists`, `create index if not exists`).

**THE ROW CLAIM (Ruling 14), and the precedent is exact.**
`claimScheduledRelease` (`src/lib/scheduled-releases.ts:459-477`), opened this
revision:

```ts
const { data, error } = await table(supabase)
  .update({ status: "claimed", claimed_at: now.toISOString(), ... })
  .eq("id", release.id)
  .eq("status", "pending")
  .eq("release_at", release.releaseAt)
  .select("id");
if (error) throw new Error(error.message);
return Array.isArray(data) && data.length > 0;
```

A compare-and-swap: the caller learns from `data.length > 0` whether **it** won.
The same file carries the matching stale sweep
(`recoverStaleScheduledRelease`, CAS'd on `status` still being `"claimed"`) and
the state machine `pending -> claimed -> done | failed` with
`STALE_CLAIM_MS`. A29 reuses this idiom wholesale; it is C6's construction.

### 3.5 The drafter - the rulings and the criteria do NOT conflict

Measured: `draftAnnouncementAction` (`src/app/actions/messaging.ts`) instructs
the model: `"message": the announcement body ... Use plain text with blank
lines between paragraphs; do not use markdown, headings, or bullet symbols.`

Ruling 5 is correct; the criteria row was making a narrower, compatible point.
Recorded so a checker does not re-litigate it. A21's drafter
(`src/lib/prompt-announcement-prompt.ts`) emits Markdown and is NOT reused.

### 3.6 The gate and the surface that exists

```
$ grep -rn "canLms(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l
11
```

The definition (`canLms`, `src/lib/courses-table-helpers.ts`), two internal uses
in the same file, one component use in `CourseRow.tsx`, and **seven gated
actions in `src/app/components/courses/useCourseImportActions.ts`**, each
following the same shape: refuse with a reason, set a busy key, call a server
action, surface the error.

The checker confirmed independently that `canLms` is exactly the complement of
`lmsConnectionStatusFor`'s two excluded categories (`not-linked`,
`needs-institution`), which is what lets K1 be stated on either without drift.

### 3.7 THE GUARD THAT IS NOT WHAT ITS NAME SAYS - a new finding this revision

`requireOwner` (`src/lib/supabase/auth.ts`) is **deprecated and is a thin alias
for `requireUser()`**. Its own doc comment, opened this revision:

> "Kept as a thin alias so the ~105 existing source files that still import
> requireOwner() keep compiling ... Until that wave lands, this alias is
> DELIBERATELY LESS RESTRICTIVE than the requireOwner() it replaces for those
> specific call sites - a tracked, temporary state, not an oversight."

Revision 1 told the implementer to use `requireOwner`. **A29 must choose
explicitly between `requireUser()` and `requireAppOwner()` and write the chosen
one**, not inherit a deprecated alias whose meaning is scheduled to change.

**The choice, and its reasoning:** `requireUser()`. Canvas credentials are
per-user (`lms_credentials`, keyed on the caller's own user id), so each signed-
in instructor sends to their own courses with their own token; nothing in A29
reaches an owner-private shared secret. That is the same reasoning the alias's
doc comment gives for delegating to `requireUser()` in the majority case.
Written explicitly so the follow-up wave does not have to guess. Recorded as
**RA9** so the decision is visible rather than buried.

---

## 4. THE CONSTRUCTIONS

Each names its **Object**, its **Instrument**, and its **direction of failure**.
Every multi-path test run is spelled `npm run test:paths -- <p1> <p2> ...`, and
its **exit code is read from a file, never from a pipe** (`| tail` makes `$?`
the exit code of `tail`).

**Note on running these gates:** backlog row L15 records that whole-tree walkers
time out under vitest's unconfigured 5-second default when the box is loaded -
25 failures in one run has been observed, and `grep -n testTimeout
vitest.config.ts` still exits 1 today (measured this revision). **If
`src/source-bytes.structure.test.ts` or `src/file-size-ceiling.structure.test.ts`
fails at 5000ms, re-run it alone before believing it.**

### C1 - one numeric recipient per request, and a FROZEN emitted-parameter set

Satisfies P4 (re-derived for (A)), Ruling 9 (B4) and Ruling 12 (B5).

**Revision 1's version of this construction was defective twice: the guard did
not hold (Ruling 9), and its wall was red on arrival 444 times (Ruling 12).
Both are measured below before being written down.**

- **Object:** (a) the value the one builder emits as `recipients[]`; (b) the
  SET of parameter names every outbound conversation POST carries.

- **Instrument (a) - THE ALLOW-PATTERN, INSIDE THE BUILDER:**
  the builder's first statement rejects any `recipientUserId` not matching
  `/^\d+$/` - the same pattern `postMessageDraftAction` already applies
  (`src/app/actions/messaging.ts:301`), moved from one caller into the builder
  so **every** caller inherits it. Unit-tested over:
  `"401"` (accept); `"401,402"`, `"401 402"`, `"course_3"`, `"course_3_students"`,
  `"section_12"`, `"uuid:W9GQ..."`, `"group_4"`, `""`, `" 401 "`, `"401\n402"`,
  `"4e1"`, `"+401"`, `"0x191"` (all reject).
  - **Direction of failure:** anything other than a bare run of digits reaching
    the wire is the failure. It is an ALLOW-pattern: a form nobody thought of
    is rejected by default. A denylist of prefixes is explicitly NOT acceptable
    and is the thing Ruling 9 struck.

- **Instrument (b) - THE FROZEN PARAMETER SET, over recorded requests, not the
  tree:** during a driven send, for every recorded conversation POST,
  `[...new URLSearchParams(body).keys()].sort()` must equal exactly

  ```
  ["body", "context_code", "force_new", "recipients[]"]      // no subject
  ["body", "context_code", "force_new", "recipients[]", "subject"]
  ```

  and nothing else, ever.
  - **Direction of failure:** an EXTRA key is the failure. This catches `mode`,
    `group_conversation`, `bulk_message`, and every parameter nobody has
    thought of, **without banning any token tree-wide.**

- **WHY THE TREE-WIDE VERSION WAS STRUCK, measured before writing:**

  ```
  $ grep -rn "\bmode\b" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l
  444
  $ grep -rl "\bmode\b" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l
  200
  ```

  444 occurrences across 200 files - `mode: "course-long"`, `filter_mode`,
  "failure mode". Revision 1's "`mode` appears in zero non-test source files"
  was red on arrival, which is Ruling 4's own class reproduced inside the
  construction the privacy guarantee rests on. The recorded consequence is that
  the implementer loosens the wall, unrecorded.

- **What DOES survive as a tree-wide wall, because it is green on arrival:**

  ```
  $ grep -rn "group_conversation\|bulk_message" src --include=*.ts --include=*.tsx | wc -l
  0
  ```

  Zero, including tests. So a structure test may require these two tokens to
  stay at zero outside the frozen-set test itself. `mode` may not.

- **Also:** exactly one conversation-POST builder exists in `src`
  (`grep -c 'recipients\[\]'` over the tree returns 1). `createConversation`
  keeps its public name and is re-implemented as a thin wrapper over the new
  result-returning builder, throwing `canvasError` on a non-ok status, so
  `sendCanvasMessageAction`'s behaviour is unchanged and there is still exactly
  one place that builds this request.

### C2 - the transport returns a THREE-state result, and UNKNOWN is the default for ambiguity

Satisfies Ruling 5's "ambiguous failures are `unknown`, never `refused`".

- **Object:** the return value of the new transport function, per request.
- **Instrument:** the transport called against a mocked `canvasFetch` returning,
  in turn: 201; 400; 403; 404; 422; 429; 500; 502; a thrown `TypeError`
  (network); and a promise rejecting with an abort/timeout.
- **Pass condition, by class:**
  - 2xx -> `accepted`.
  - 400, 404, 422 -> `refused`, carrying the status and a reason.
  - 401, 403 -> `refused`, with the credential reason. 403 is NOT treated as a
    throttle (`src/lib/canvas-throttle.ts` documents both readings and why a
    user-facing write uses the 429-only predicate `isCanvasRateLimitStatus`).
  - **429, any 5xx, any thrown network error, any timeout -> `unknown`.**
  - Anything not enumerated -> `unknown`. **The default arm is `unknown`.**
- **Direction of failure:** mapping any of {429, 5xx, network, timeout,
  unrecognised} to `accepted` **or** to `refused` is the failure. Mapping a
  400/404/422 to `unknown` is a lesser failure and is also caught.
- **Note:** `canvasError` must NOT produce these results (it discards the
  status, 3.2). It stays in the `createConversation` wrapper only.

### C3 - the attempt ledger is DURABLE and written BEFORE the first outbound request

Satisfies Ruling 2.

- **Object:** two new Postgres tables and the single module owning them.
  - `bulk_course_message_attempts`: `id uuid pk`, `user_id uuid` (cascade),
    `course_id`, `canvas_course_url`, `subject`, `body`, `confirm_token`,
    `state` (`open` | `resolved`), `resolution` (`completed` | `abandoned` |
    null), `created_at`, `resolved_at`, `roster_complete boolean`,
    `excluded_note text`.
  - `bulk_course_message_recipients`: `attempt_id` (cascade),
    `canvas_user_id`, `state` (`pending` | `sending` | `accepted` | `refused`
    | `unknown` | `excluded`), `reason text`, `claimed_at`, `settled_at`.
    **Unique on `(attempt_id, canvas_user_id)`** - a real non-partial unique
    constraint, so it can serve as a PostgREST upsert arbiter without the
    42P10 trap `lms_credential_save_attempts`'s header documents.
  - RLS enabled, **no policy for `authenticated`** - same reasoning as
    `20261015000000_lms_credentials.sql`: a guard a signed-in browser can write
    is not a guard.
  - **`body` and `subject` live HERE, server-side, from `prepare` onward.** That
    is what makes C9 possible.
- **Instrument:** a driven-send test with the store mocked at the owning
  module's seam. Assert the ORDER of effects: the attempt row and all recipient
  rows exist (`pending` / `excluded`) **before** the first transport call, and
  each recipient row reaches its terminal state **before** the invocation that
  produced it returns.
- **Fails when:** the first transport call is observed before the ledger write;
  or a recipient's state is returned to the client before it is persisted; or
  the guard or the resume path reads any module-scope `Map`/`Set`.
- **Direction of failure:** a test proving the guard with in-memory state
  proves nothing. The instrument must simulate process death: **drop the module
  registry between the first send and the retry** (`vi.resetModules()`, then
  re-import the modules under test), keeping only the store. A guard surviving
  that is durable; one that does not is not.

### C4 - the double-send guard is keyed on the COURSE, never on the body

Satisfies Ruling 1 and K9.

- **Object:** the `prepare` step, given a course id.
- **Instrument:** a first attempt killed after its first outbound request
  (`vi.resetModules()`, store retained), then a fresh `prepare` for the same
  course with a **different** subject and a **different** body.
- **Pass condition:** `prepare` returns a REFUSAL carrying the prior attempt's
  id, its creation time, and its per-state counts - all produced by the
  summariser (C5) - and makes **zero** outbound requests.
- **Fails when:** `prepare` mints a token for a course with an `open` attempt;
  or the refusal is keyed on the body, the subject, or any hash of them; or the
  refusal makes an outbound request.
- **Direction of failure:** the body differing must NOT change the outcome.

### C5 - the client never receives a countable collection, AND the summariser partitions per state

Satisfies Ruling 3's K8 construction, the A28 defect, and **Ruling 11's first
clause - revision 1 marked Ruling 5's "assert each state's count" as kept and
wrote no such assertion anywhere.**

- **Object:** (a) every value crossing the server-action boundary toward the
  browser; (b) the summariser's numbers.

- **Instrument (a) - nothing countable reaches the client:**
  1. a type-level pin: the action return types reference exactly one exported
     type, `BulkSendSummary`, whose fields are **scalars and rendered strings
     only** - no array, no `Set`, no `Map`, no `length`-bearing field, no
     recipient identifier. `excludedNote` is `string | null`, ONE rendered
     sentence, never a list.
  2. a structure test asserting the summary type's declaration contains no
     `[]`, no `Array<`, no `ReadonlyArray<`, no `Record<`.
  3. a check that every module displaying an A29 count imports the single
     summariser. **This proves import, not use** (Ruling 15 minor), so it is
     paired with (4).
  4. a check that **no module in the feature's file set other than the
     summariser contains an arithmetic or `.length` expression over an A29
     value.** The import check alone would pass a component that imports the
     summariser and then counts something itself.

- **Instrument (b) - THE PARTITION ASSERTION, per state, over a frozen fixture.**
  A fixture of **11 recipients** with a deliberately ASYMMETRIC, ALL-DISTINCT
  distribution, so that swapping any two states changes at least one number:

  | State | Count in fixture |
  |---|---|
  | `accepted` | 5 |
  | `refused` | 3 |
  | `unknown` | 2 |
  | `excluded` | 1 |
  | `pending` | 0 |

  The assertion is on **each state's own count against its own frozen literal**
  - `expect(s.accepted).toBe(5)`, `expect(s.refused).toBe(3)`,
  `expect(s.unknown).toBe(2)`, `expect(s.excluded).toBe(1)`,
  `expect(s.pending).toBe(0)` - and **then** on the total equalling 11.

- **Direction of failure:**
  - The summary type gaining any collection-typed or identifier-bearing field.
  - A second function deriving a count.
  - **A summariser that swaps `accepted` and `refused`.** This is the mutation
    the instrument exists for, and it is why the counts are all distinct: a
    sum-only or partition-only check passes the swap, which is exactly Ruling
    5's complaint and exactly what revision 1 shipped by writing nothing.
  - A recipient list reaching the browser, because a list has `.length`.

### C6 - the pump: browser-driven, one student per invocation, and the row is CLAIMED SERVER-SIDE

Satisfies section 2.1, Q4, and **Ruling 14 (M1) - revision 1's concurrency 1
was a client-side promise that binds nothing across tabs.**

- **Object:** (a) the loop advancing a send; (b) which invocation gets which
  recipient row.

- **Instrument (a) - the pump:** a driven-send test over a 5-student fixture
  recording, per server-action invocation, the number of transport calls; plus
  K14's reachability check that no module under `src/lib/workflows/**` or
  `src/app/api/**` transitively imports the send action.
  - **Pass condition:** every invocation makes **at most one** transport call;
    the pump issues the next invocation only after the previous resolves.
  - **Direction of failure:** a server-side loop is the failure, and it is the
    tempting one - it looks simpler and passes under vitest where nothing times
    out.

- **Instrument (b) - THE CAS CLAIM, and this is the one revision 1 lacked:**
  `sendNext` claims its recipient with a conditional update, exactly
  `claimScheduledRelease`'s idiom (3.4):

  ```
  update recipients set state = 'sending', claimed_at = now
   where attempt_id = $1 and state = 'pending'
   ... returning one row
  ```

  and proceeds **only if a row came back**. A caller that claims nothing
  reports `done` for itself and asks again.
  - **Test:** drive **two concurrent pumps against one attempt** over a
    3-student fixture, with the store's claim serialised. Assert that the union
    of transport calls contains **each `canvas_user_id` exactly once**, and
    that the total transport call count is exactly 3 - not 6.
  - **Direction of failure:** the same student receiving two POSTs is the
    failure. A test with a single pump cannot see it, which is why the
    two-pump fixture is mandatory and not optional.

- **The stale claim, which also gives `unknown` a real producer:** a row left
  in `sending` past `STALE_CLAIM_MS` (the invocation died) is swept to
  `unknown` with reason `interrupted`, CAS'd on the state still being
  `sending` - mirroring `recoverStaleScheduledRelease`. Without this a killed
  invocation wedges the attempt forever.

### C7 - THE TOKEN AUTHORISES THE ATTEMPT; what is single-use is the CONFIRM

Satisfies Ruling 8 (B1). **This replaces revision 1's C7, which was
self-contradictory: it said a consumed token sends nothing while C6 called
`sendNext` with that token once per recipient. For any class over one student
those cannot both hold, and an implementer would have silently resolved it
either by dropping the rule or by shipping a feature that MESSAGES ONE STUDENT
PER CONFIRM. Both passed every gate revision 1 specified.**

- **THE INVARIANT, stated in Ruling 8's terms:**
  **one confirm mints exactly one attempt; one attempt carries exactly one
  token; the token authorises every invocation of that attempt and is spent
  when the attempt reaches a terminal state - never on an individual request.**

- **Object:** the token column on the attempt row, and its lifetime.
- **Instrument, and it must DRIVE N INVOCATIONS** - the contradiction survived
  revision 1 because nothing exercised a multi-invocation pump:
  1. `prepare` over a **7-student** fixture, then a complete pump.
     **Pass:** all 7 invocations succeed with the same token, 7 transport
     calls, and the attempt ends `resolved`/`completed`.
     **This single test would have failed revision 1's C7 outright.**
  2. After the attempt is terminal, one more `sendNext` with the same token:
     **zero** transport calls.
  3. `sendNext` with a token not matching the attempt row's: zero transport
     calls, at any point in the run.
  4. A second `prepare` for the same course while the attempt is `open`:
     refused by C4, so no second token can exist for that course.
- **Pass condition:** the token is minted server-side at `prepare`; every
  `sendNext` reads subject, body, course and recipient set **from the attempt
  row**, never from its own arguments; the token is valid exactly while the
  attempt is `open`.
- **Direction of failure:** **both** arms are failures and both must be tested:
  a token still authorising work after the attempt is terminal, **and** a token
  ceasing to authorise work while the attempt is still open (which silently
  truncates a class to one student).

**This also discharges K6 by construction.** If body and recipient set come from
the row, a roster change between confirm and send cannot reach the wire.

### C8 - the roster read exposes enrollment state AND completeness

Satisfies K3, K4 and Ruling 5's "define the base set once".

- **Object:** the new roster reader's return value.
- **Instrument:** a mocked Canvas paginating (a) normally to `next === null` and
  (b) past the page cap with `next` still non-null; and a page containing an
  active student, a student enrolled in two sections, an invited student, an
  inactive student, a concluded student, a teacher, a TA, an observer, a
  designer, and Canvas's test student.
- **Pass condition:** the reader returns `{ entries, complete }` where
  `complete` is `false` exactly when the loop exited with `next` non-null; every
  entry carries its enrollment state; each user id appears **once**; only
  student-type enrollments are present.
- **Fails when:** `complete` is true after a capped read; or a user id appears
  twice; or a non-student appears; or the state is absent from any entry.
- **Direction of failure:** silently reporting a capped read as complete is the
  failure this exists for.
- **Base set, defined ONCE:** the **roster** is every row this reader returns.
  The **recipients** are the roster rows whose enrollment state is `active`.
  Every other row becomes an `excluded` recipient row with its reason. The
  confirm count the summariser reports is the RECIPIENT count; excluded rows are
  reported by `excludedNote` only. Invited and inactive are excluded by default
  (E2 unchanged).
- **Endpoint:** `/api/v1/courses/<id>/enrollments?type[]=StudentEnrollment&per_page=100`,
  following `parseNextLink` through `assertCanvasSuppliedUrlIsSameOrigin` -
  **required**, because `src/lib/canvas-pagination-guard.structure.test.ts`
  counts CALL SITES, not files. State is NOT filtered in the query; it is
  returned and classified in code, so K3's fixture exercises every state through
  one path.

### C9 - the instructor's text CANNOT be lost, because the server holds it

Satisfies Ruling 5's "a refused send must not lose the text" and **Ruling 8's
second half - revision 1 cleared the draft "when a token is consumed (the first
outbound request)", which destroys the text at the exact moment the run becomes
unable to continue.**

- **Object:** where the instructor's subject and body live across every outcome.
- **Construction:** from `prepare` onward the text lives on the **attempt row**
  (C3), server-side and durable. The browser's `ta-`-keyed localStorage draft is
  a convenience copy only.
- **Instrument:**
  1. `prepare` refused for each reason in turn - no LMS link, roster read
     failed, an open prior attempt: **pass** if the local draft is untouched
     (no attempt row was written, so the server holds nothing).
  2. A run killed mid-pump, then a reload: **pass** if the modal repopulates
     subject and body **from the attempt row**.
  3. `resolve(..., "abandon")`: **pass** if the modal repopulates from the
     attempt row before the row is closed.
  4. `resolve` reaching `completed`: **pass** if the local draft is cleared
     **then, and only then**.
- **Direction of failure:** **any path that clears the local draft while the
  server does not hold the same text is the failure.** That single sentence is
  the invariant; the four cases above are its instances. Revision 1 failed case
  2 by construction.
- **K13's other half is unchanged and still holds:** the token, the in-flight
  state and the recipient set are **never** persisted client-side.

### C10 - the body leaves as plain text

Satisfies K10.

- **Object:** the `body` parameter of every outbound request.
- **Instrument:** a send whose body was produced by A21's Markdown drafter
  (headings, bold, a list), plus one hand-written body containing `<p>` and
  `**bold**`.
- **Pass condition:** the bytes on the wire equal the bytes on the attempt row,
  and the send path performs **no** Markdown-to-HTML conversion anywhere.
- **Fails when:** the send path imports or calls any Markdown or HTML conversion
  helper; or the wire body differs from the stored body.
- **Direction of failure:** the failure is the app CONVERTING. Whether Canvas
  renders Markdown literally is OC4. The drafter reused is
  `draftAnnouncementAction` (3.5), which asks for plain text.

### C11 - the UI states the honest limit, and no state claims delivery

Satisfies P5 and Q5.

- **Object:** the summary type's state names, and the result copy.
- **Instrument:** a structure test over the feature's file set for forbidden
  delivery words in user-facing strings (`delivered`, `received`, `sent to their
  email`, `emailed`), plus a pin that the accepted state's own name is
  Canvas-bounded.
- **Pass condition:** the strongest state available is "Canvas accepted"; the
  result surface carries a sentence saying the app cannot confirm an email
  arrived and that each student's own Canvas notification settings decide
  whether one is sent; and, until OC2 is answered, nothing describes the subject
  field as the email's subject line.
- **Fails when:** any state name or copy asserts delivery or receipt.
- **Direction of failure:** the honest-limit sentence being ABSENT is a failure;
  wording is READING (OC8). The source-text pin is on the FACT and the forbidden
  words, never on a sentence's spelling.

### C12 - the capability wall measures REQUESTS, at a seam that can SEE an unexpected host

Satisfies Ruling 4, **Ruling 10 (B2)** and **Ruling 7**.

**Revision 1's recorder was placed where its own failure arm was unreachable
(Ruling 10), and it cited Ruling 4's measurement as settled fact while Ruling 7
has since shown that measurement's example to be wrong. Both are fixed here, the
second by re-measuring rather than re-citing.**

- **Object:** the set of distinct hosts requested during one complete driven
  send (prepare, N sends, finish).

- **Instrument - TWO seams, and both are necessary:**
  1. **A recording `vi.stubGlobal("fetch", ...)`.** `vitest.setup.ts`'s own
     header says a test that installs its own `vi.stubGlobal` "never sees" the
     throwing stub. So this is the **only** seam that can observe a model host,
     and revision 1's reason for rejecting it was backwards.
  2. **The `canvasFetch` mock.** The same header states the other half:
     "`canvasFetch` dials through `node:https` rather than `fetch`, so a test
     that mocks neither could still reach the network through that path." So
     the global recorder **cannot see Canvas requests at all** - seam 1 alone
     would record an empty Canvas set and pass vacuously in the other
     direction.

  The recorded host set is the union of both seams.

- **Allow-set under (A): `{ the resolved Canvas base URL's host, the Supabase
  project host }`. That is all.**
- **Fails when:** any other host appears. In particular a model host
  (`generativelanguage`, `models.github.ai`) appearing during a SEND is the
  failure K11 exists for. Drafting is a separate, earlier action the instructor
  invokes deliberately.
- **Direction of failure:** an extra host is the failure. **The instrument must
  itself be sabotage-checked** by adding a single `fetch("https://example.com")`
  inside the send path and confirming the test goes red - because the specific
  defect revision 1 shipped was a failure arm that could never fire.

- **THE JUSTIFICATION, RE-DERIVED FROM A MEASUREMENT TAKEN NOW (Ruling 7).**
  Ruling 4 justified this wall with an example - "a barrel re-export puts
  `sendMessageDraftByEmailAction` inside every workflow's import closure despite
  zero call sites". Ruling 7 corrected it. **Measured this revision, and the
  correction is itself half wrong, so neither value is adopted silently:**

  ```
  $ grep -rn "sendMessageDraftByEmailAction" src --include=*.ts --include=*.tsx | grep -v "\.test\."
  src/app/actions/messaging-outlook.ts:128:export async function sendMessageDraftByEmailAction(...)
  src/app/components/message-drafts-helpers.ts:23:   *  sendMessageDraftByEmailAction BCCs for an announcement, ...
  src/app/components/MessageDraftsTab.tsx:12:  sendMessageDraftByEmailAction,
  src/app/components/MessageDraftsTab.tsx:222:      const res = await sendMessageDraftByEmailAction(draft.id);
  ```

  - Ruling 4's "**zero call sites**" is **wrong** - there is one, at
    `MessageDraftsTab.tsx:222`. Ruling 7 is right about that.
  - Ruling 7's "**no barrel re-exports it**" is **also wrong**.
    `src/app/actions.ts:66` is `export * from "./actions/messaging-outlook"`,
    which re-exports it - and `MessageDraftsTab.tsx:9-14` imports it **from
    that barrel** (`from "../actions"`), not from the defining module. Opened
    and read this revision.
  - **Reported, not resolved silently.** The orchestrator owns the correction
    to Ruling 7. The wall's conclusion is unaffected either way.

  **The justification that replaces the broken example, measured now:**

  ```
  $ wc -l src/app/actions.ts
  77 src/app/actions.ts
  $ grep -c "^export" src/app/actions.ts
  54
  $ sed -n '65,67p' src/app/actions.ts
  export * from "./actions/messaging";
  export * from "./actions/messaging-outlook";
  export * from "./actions/messaging-scheduling";
  ```

  `src/app/actions.ts` is 54 export lines of `export *` over the whole actions
  directory. **So any module importing anything from `@/app/actions` - the
  repo's normal idiom, used by `MessageDraftsTab.tsx` itself - pulls
  `draftAnnouncementAction`, a model-calling path, into its import closure.**
  Import closure therefore cannot distinguish a send from a draft in this tree
  at all, for any module, regardless of what A29 does. That is the live reason
  the wall must measure requests, and it does not depend on Ruling 4's example
  or Ruling 7's correction of it.

### C13 - K1: the LMS gate is a SERVER-SIDE refusal, not a JSX prop

Satisfies **Ruling 11's second clause.** K1 is the criterion taken straight from
the owner's own words, and revision 1 gave it no construction, no instrument and
no direction of failure - it pointed at a `menu={...}` prop in a repo where **no
component is rendered by any test.** A criterion whose only enforcer would be a
render is exactly what this seat is forbidden to propose.

- **Object:** `prepareBulkCourseMessageAction`, called with a course in each LMS
  connection category.
- **Instrument:** the action invoked directly (node-env, Canvas and the store
  mocked) once per category of `lmsConnectionStatusFor`: `not-linked`,
  `needs-institution`, `unknown`, `connected`, `failed`. Count the outbound
  requests and the ledger writes per call.
- **Pass condition:**
  - `not-linked` and `needs-institution`: **zero** outbound requests, **zero**
    ledger writes, and a refusal naming that category's reason.
  - The admitted set is exactly the complement of those two, which is precisely
    what `canLms` computes - so the action refuses on the shared predicate and
    does not define a second one.
- **Direction of failure:** **admitting more courses than `canLms` admits is the
  failure**, and any outbound request for an excluded course is the failure even
  if the action later returns an error. The check is on REQUESTS MADE, not on
  the value returned.
- **The display half stays READING** and is OC6 - but the gate itself no longer
  depends on it.

### C14 - K2's third clause: a missing credential and an unreachable host give DIFFERENT reasons

Satisfies **Ruling 11's third clause.** Revision 1 marked K2 "discharged by C8 +
the prepare/send split", and neither mentions reason-distinguishability.

- **Object:** the refusal reason `prepare` returns when the roster read fails.
- **Instrument:** `prepare` on a `connected` course, twice:
  (a) with credential resolution mocked to fail as "no credential for this
  institution"; (b) with `canvasFetch` mocked to fail as unreachable/DNS.
- **Pass condition:** **the two reasons are not equal strings**, and each is
  routed from the failure it came from; zero outbound conversation POSTs in
  both; zero ledger writes in both.
- **Direction of failure:** the two producing the **same** reason is the
  failure - it sends an instructor to reconnect an account that is connected.
  Asserting `reasonA !== reasonB` pins the fact without pinning either
  spelling, which is the over-specification trap.

---

## 5. The layers, and the file that CALLS each one

**THE SURFACE IS A LAYER.** L7 is not a garnish; it is the layer that makes
L1-L6 reachable, and it ships in the same chunk.

| L | What it is | New/changed files | **Called by** |
|---|---|---|---|
| L1 | Canvas transport: one single-recipient conversation POST, allow-patterned recipient, three-state result (C1, C2) | `src/lib/canvas/inbox.ts` (add `postCourseConversation`; re-implement `createConversation` over it); re-export in `src/lib/canvas.ts` | L5's send action |
| L2 | Roster reader with enrollment state + completeness (C8) | `src/lib/canvas/listings.ts` (add `listCourseEnrollmentRoster`); re-export in `src/lib/canvas.ts` | L5's prepare action |
| L3 | Durable ledger: schema + the ONE owning module, incl. the CAS claim and the stale sweep (C3, C4, C6, C7) | `supabase/migrations/2026<next>_bulk_course_message_attempts.sql`; `src/lib/bulk-course-message/attempts.ts`; row types in **`src/lib/supabase/types.tables-c.ts`** (the exact file, not a glob) | L5, all four actions |
| L4 | Pure summariser - the only producer of any count (C5) | `src/lib/bulk-course-message/summary.ts` | L5; L7 displays it |
| L5 | Server actions: `prepareBulkCourseMessageAction`, `sendNextBulkCourseMessageRecipientAction`, `resolveBulkCourseMessageAttemptAction`, `finishBulkCourseMessageAction`. Guard: **`requireUser()` written explicitly** (3.7) | `src/app/actions/bulk-course-message.ts`; one `export * from "./actions/bulk-course-message";` line in **`src/app/actions.ts`** | **`src/app/components/courses/useBulkCourseMessage.ts`** (L6) |
| L6 | The pump hook: browser-side loop, concurrency 1, holds NO recipient list (C6) | `src/app/components/courses/useBulkCourseMessage.ts` | L7 |
| L7 | **THE SURFACE.** A modal: subject, body, optional "Draft with AI" calling `draftAnnouncementAction`, the message-vs-announcement facts (K12), the confirm, live progress, the honest-limit sentence (C11), the prior-attempt resolution choice (C4) | `src/app/components/courses/BulkCourseMessageModal.tsx` (NEW file) | **`src/app/components/courses/CourseRow.tsx`** |

**Two corrections from revision 1 (Ruling 13):**

- The actions barrel is **`src/app/actions.ts`**, measured. There is no
  `src/app/actions/index.ts`:
  ```
  $ ls src/app/actions/index.ts
  ls: cannot access 'src/app/actions/index.ts': No such file or directory
  $ ls src/app/actions.ts
  src/app/actions.ts
  ```
  Revision 1 named a file that does not exist and hedged it.
- **A barrel is not a caller.** L5's real caller is
  `useBulkCourseMessage.ts`, and section 8 puts it in the same wave.

**The row types file is `types.tables-c.ts`**, not a three-file glob
(Ruling 15 minor) - disjointness needs exact paths:

```
$ ls src/lib/supabase/types.tables-*.ts
src/lib/supabase/types.tables-a.ts
src/lib/supabase/types.tables-b.ts
src/lib/supabase/types.tables-c.ts
```

`types.tables-c.ts` is the file that already carries
`lms_credential_save_attempts`, the table this ledger is modelled on, so the new
rows go beside it.

**Where the instructor reaches it, and the wiring was opened, not assumed.**
Courses tab -> the LMS column's hamburger menu on a course row -> "Message all
students". Two clicks, on a surface the instructor is already on, in the column
whose status pill already reports the LMS connection.

The wiring that exists today, in `CourseRow.tsx`: it renders
`<LmsCell ... menu={cellMenuFor("lms")} />`, and `cellMenuFor` returns
`<CellMenu label={...} items={[copyItem(column)]} context={course.name} />` - so
**the LMS cell's menu today holds exactly ONE item**, the copy item.

W4's change is therefore precise and small: give `cellMenuFor` a second item for
the `lms` column only, whose `disabled` / `disabledReason` (`CellMenuItem`'s
fields in `CellMenu.tsx`) are driven by `canLms` and `lmsConnectionStatusFor`'s
category. `CellMenu` keeps disabled items keyboard-reachable
(`disabledItemsFocusable: true`, documented in its own header), so the reason is
announced rather than silently skipped. **That is the DISPLAY half of K1 and it
is READING (OC6); the gate itself is C13, server-side.**

Alternative homes considered and rejected: Drafts > Messages
(`MessageDraftsTab.tsx`, 525 lines) is per-draft and carries no course context;
a new tab spends a click and a whole surface on one action.

**Why `useCourseImportActions.ts` is NOT extended.** Its seven `canLms`-gated
actions are one-shot server calls; A29's is a multi-invocation pump with its own
state machine. Adding it would push that file from 608 toward the ceiling and
mix two lifetimes. The gate check is copied from there, not re-derived.

**A liability this design accepts and names:** `CourseRow.tsx` is 694 and
`CoursesTable.tsx` is 792. W4 adds roughly a menu item and a conditional render
to `CourseRow.tsx`. If the as-built diff puts either over 900, the extraction is
owed **before** the wave is verified. Recorded as **RA5**.

---

## 6. The state machine, in one table

| Event | Ledger effect | Outbound | Returned to client |
|---|---|---|---|
| `prepare(courseId, subject, body)` | If an `open` attempt exists for this course: none. Else: read roster (L2), insert attempt (`open`, token, **subject and body**) + one recipient row per roster member (`pending` or `excluded`) | roster GETs only | `BulkSendSummary` + token, **or** a refusal carrying the prior attempt's id and ITS summary |
| `sendNext(attemptId, token)` | **CAS-claims** one `pending` row to `sending`; if none claimed, reports done. Issues L1 for the claimed row; writes that row's terminal state | exactly one conversation POST, or none | `{ done, summary }` - no ids, no lists |
| `sendNext` when nothing claimable and none `sending` | attempt -> `resolved`/`completed`; token spent | none | `{ done: true, summary }` |
| stale sweep | a row `sending` past `STALE_CLAIM_MS` -> `unknown`, reason `interrupted`, CAS'd on `sending` | none | - |
| `resolve(attemptId, "abandon")` | attempt -> `resolved`/`abandoned`; `pending` -> `unknown` reason `abandoned`; **subject and body returned so the modal can repopulate** (C9) | none | `summary` + the text |
| `resolve(attemptId, "resume", { includeUnknown })` | mints a NEW token on the SAME attempt; `unknown` rows return to `pending` only if `includeUnknown` | none | `{ token, summary }` |

**Why this discharges K9's "resend to the rest" without a separate mechanism:**
resuming iterates `pending` rows only, so an `accepted` recipient is
structurally unreachable by a resume, and an `unknown` one is reachable only
through the explicit `includeUnknown` choice - a server-issued resolution of a
specific attempt by id, exactly what Ruling 3 required instead of a boolean.

**And this is why the guard and the resumability had to be designed together.**
The same ledger is both. There is one answer to "already sent" and it is a row's
`state`.

**One interaction Ruling 14 named and this table must answer explicitly:**
`resolve(..., "resume")` mints a new token while the original tab may still be
pumping. The old token is no longer the attempt's token, so the old tab's next
`sendNext` is refused by C7's arm 3 - and even if it were not, the CAS claim
(C6) guarantees no recipient is POSTed twice. **Two independent mechanisms, and
the test in C6 drives both tabs.**

---

## 7. `owns` - every file that must be run or read when this lands

Derived, not recalled: (a) the write set, (b) every existing test asserting on
changed behaviour, (c) **every test reading source files as TEXT**.

### 7.1 Command for (c), with its output pasted

```
$ grep -rl "readdirSync" src --include=*.test.ts | sort
```

39 files (`| wc -l` -> `39`). Canary: `src/lib/no-emojis.test.ts` is expected
and present (`grep -c "no-emojis"` -> `1`).

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

### 7.2 The subset that will actually bind

| Walker | What it demands of A29's new files |
|---|---|
| `src/app/actions/action-guard-coverage.test.ts` | Each of the four new `"use server"` exports needs its request guard **in its own body** - and per 3.7 that guard is `requireUser()` written explicitly, not the deprecated `requireOwner` alias |
| `src/lib/use-server-exports.test.ts` | `bulk-course-message.ts` may export **only async functions** - no type re-export, no const |
| `src/lib/canvas-pagination-guard.structure.test.ts` | L2's new `parseNextLink` follow must dial the value `assertCanvasSuppliedUrlIsSameOrigin` RETURNS. It counts call sites |
| `src/file-size-ceiling.structure.test.ts` | Every touched file stays under 1000 (3.1, RA5). **L15 class: re-run alone if it times out at 5000ms** |
| `src/supabase-migrations.structure.test.ts` | The new migration must be lexically well-formed SQL: **every apostrophe inside a `comment on ...` string doubled.** This is the gate with no local backstop - migrations auto-apply on push |
| `src/lib/client-state-sweep.registry.test.ts` | Any module-scope `...Cache` the pump introduces must register or be named with a reason; the `ta-` draft keys must be sweepable |
| `src/lib/canvas-client-boundary.test.ts`, `.transitive.test.ts`, `src/lib/module-graph/runtime-import-graph.test.ts` | L6 and L7 are client modules. Nothing in their closure may reach `src/lib/supabase/**` except `lib/supabase/client.ts` (`FORBIDDEN_PATH_PREFIXES` / `BROWSER_SAFE_MODULES` in `src/lib/module-graph/client-boundary-policy.ts`). **L3's owning module must never be imported by L6 or L7** - only by L5 |
| `src/lib/no-emojis.test.ts` | Owns the emoji rule. Do not hand-roll a scan |
| `src/source-bytes.structure.test.ts` | Owns the escape/BOM/mojibake scan. **L15 class: re-run alone if it times out** |
| `src/tools/vitest-paths/gate-commands.structure.test.ts` | Any gate command this feature adds must use the `test:paths` wrapper |

### 7.3 Behavioural tests to re-run

```
$ grep -rln "createConversation\|sendCanvasMessageAction\|postMessageDraftAction\|listCourseRoster\|listStudents" src --include=*.test.ts | sort
src/lib/canvas.pullback.test.ts
src/lib/canvas/listings.test.ts
src/lib/course-intel/join.test.ts
src/lib/workflows/registry/steps.course-setup.rosters.test.ts
```

Four files, all in the run, because `createConversation` is being
re-implemented. "Behaviour-preserving" is a claim a test must check.

**MEASURED ABSENCE, and it is a finding.** There is **no
`src/app/actions/messaging.test.ts`**:

```
$ ls src/app/actions/ | grep -i messag
canvas-inbox.message-replies.test.ts
message-replies.test.ts
message-replies.ts
messaging-outlook.ts
messaging-scheduling.ts
messaging.ts
```

`messaging.ts` - holding `sendCanvasMessageAction`, `postMessageDraftAction` and
`draftAnnouncementAction` - has **no test file of its own**. So the existing
single-student Canvas send has no behavioural test, and W2's
"behaviour-preserving" claim has nothing existing to lean on. W2 owes a NEW
test. Recorded as RA8.

---

## 8. Wave plan

Waves are disjoint by write set. **Each row answers the question actually
asked** - does this wave contain the file that CALLS its new exports - or states
the no-caller exemption explicitly (Ruling 13).

| Wave | Write set (exact paths) | **Contains its caller?** |
|---|---|---|
| **W1 - ledger** | `supabase/migrations/2026<next>_bulk_course_message_attempts.sql`; `src/lib/bulk-course-message/attempts.ts`; `src/lib/supabase/types.tables-c.ts`; `src/lib/bulk-course-message/attempts.test.ts` | **NO - explicit exemption.** Nothing calls it until W3. W1 therefore **may not be pushed alone**; it lands in the same push as W3 or not at all |
| **W2 - Canvas transport + roster** | `src/lib/canvas/inbox.ts`; `src/lib/canvas/listings.ts`; `src/lib/canvas.ts`; `src/lib/canvas/conversations-post.structure.test.ts`; `src/lib/canvas/listings.test.ts`; a new test for `createConversation` (RA8) | **YES** - `createConversation`'s existing caller chain (`sendCanvasMessageAction` -> `postMessageDraftAction`) is live and must stay green; `src/lib/canvas.ts` is the re-export wiring file |
| **W3 - actions + summariser + THE PUMP** | `src/app/actions/bulk-course-message.ts`; `src/lib/bulk-course-message/summary.ts`; `src/app/actions.ts`; **`src/app/components/courses/useBulkCourseMessage.ts`**; their tests | **YES** - `useBulkCourseMessage.ts` is the file that CALLS all four actions, and it is in this wave. **`src/app/actions.ts` is a barrel and is NOT counted as the caller** |
| **W4 - surface** | `src/app/components/courses/BulkCourseMessageModal.tsx`; **`src/app/components/courses/CourseRow.tsx`** | **YES** - `CourseRow.tsx` renders the modal and adds the menu item. Omitting it ships the feature dead |

**Change from revision 1:** the pump hook moved from W4 into W3, because it is
L5's caller and Ruling 13 requires the caller to ship with the exports.

W1 and W2 are disjoint and may run concurrently. W3 depends on both; W4 on W3.
Cap respected: at most 2 concurrent.

**Wave gate commands.** Each wave runs only its own directories, and the exit
code is read from a file (Ruling: never from a pipe):

```
# W2
npm run test:paths -- src/lib/canvas src/lib/canvas.pullback.test.ts > w2.log 2>&1; echo $? > w2.code
# W3
npm run test:paths -- src/lib/bulk-course-message src/app/actions/bulk-course-message.test.ts src/app/components/courses/useBulkCourseMessage.test.ts > w3.log 2>&1; echo $? > w3.code
```

Log and code files go in the scratchpad, never the repo. Revision 1's single
"wave's own command" spanned two waves' directories (Ruling 15 minor); these do
not. **The full suite runs at the chunk's gate regardless.**

**Gate every wave with `git status --short` against the assignment**, and check
no `.claude/worktrees` copy was edited instead of the real tree.

---

## 9. Disposition of the criteria and the rulings

The owner's decision withdraws two of three option branches, so this is a
restructuring. **The id column was re-derived LAST, after all numbering was
final.** Rows changed by round 2 are marked **[R2]**.

| Prior id | Disposition | Now |
|---|---|---|
| K1 (LMS gate) | kept; **[R2] given a SERVER-SIDE construction, instrument and failure direction.** Revision 1 pointed it at a JSX prop in a repo that renders no component - Ruling 11 | **C13**; display half OC6 |
| K2 (live proven at send time) | kept; clauses 1-2 by C8 + the prepare/send split. **[R2] clause 3 (missing credential vs unreachable host) given its own instrument** - Ruling 11 | C8 + **C14** |
| K3 (active students, each once) | kept | C8 |
| K4 (incomplete roster) | kept; `complete` is a returned field | C8 |
| K5 (confirm signature) | kept, re-shaped to a server token per Ruling 2 | C7 |
| K6 (what is sent is what was confirmed) | kept; discharged BY CONSTRUCTION (payload read from the row) | C7 |
| K7 (one confirmation spent once) | kept; **[R2] restated per Ruling 8 - the CONFIRM is single-use, not each invocation** | C7 |
| K8 (no counts, one summariser) | kept; strengthened - the client never receives a list either. **[R2] the missing partition/per-state assertion written** - Ruling 11 | C5 |
| K9 (lost outcome, no silent re-send) | kept; unified with resumability into one ledger | C3, C4, section 6 |
| K10 (channel's own format) | kept | C10 |
| K11 (no model call in the send path) | kept; instrument replaced (requests, not import closure). **[R2] recorder moved to a seam that can see the failure** - Ruling 10 | C12 |
| K12 (message vs announcement) | kept, READING. **[R2] now has a defined id** | **OC8** |
| K13 (drafts persist; nothing authorising persists) | kept. **[R2] the clear point moved off "first outbound request"** - Ruling 8. The text is durable server-side from prepare, so it cannot be lost | **C9** |
| K14 (no unattended path sends) | kept unchanged; also why a Route Handler was rejected | C6, 2.1 |
| P1 (which address) | **WITHDRAWN.** Under (A) the recipient is a Canvas user id; the app never reads, holds or transmits an address. Enforcer protected: none survives - P1's fixture asserted address provenance, which no longer exists. E5 moot | - |
| P2 (per-recipient receipt) | kept, re-derived to (A)'s per-student shape. Ruling 3's "state per batch" was a BCC constraint; under (A) each student IS their own request | C2, C3 |
| P3 (partial is partial) | kept; re-derived to Canvas statuses only; the Graph 403 clause withdrawn with (B') | C2 |
| P4 (no student sees another) | kept; **[R2] the construction rebuilt** - revision 1's type + count + two-prefix denylist did not hold (Ruling 9) | **C1** |
| P5 (no delivery claim) | kept; strengthened by Q5 | C11 |
| P6 (channel precondition) | **WITHDRAWN** as separate. Under (A) it collapses into K2/C8. Enforcer protected: the Outlook-connection refusal, which has no referent under (A) | C8 |
| P7 (addresses do not outlive the send) | **WITHDRAWN as vacuous and replaced.** The app never holds an address. Its INTENT is kept: the ledger stores Canvas user ids and never an address, pinned by C3's column list. E6 moot | C3 |
| L1 (removal test) | kept; (A)'s variant binds - the live-vs-stored fixture over Canvas user ids; the deletion that must turn it red is replacing the live roster read with any stored list | C8 |
| OV1 | kept, re-derived for (A) | OC1 |
| OV2 | kept; **[R2] SPLIT** - its two halves had different instruments | **OC6 + OC7** |
| OV3 | kept; **[R2] merged with K12 and its instrument corrected to "browser AND diff"** | **OC8** |
| Ruling 1 (guard on the course) | kept, built | C4 |
| Ruling 2 (durable record; server-issued confirm) | kept, built | C3, C7 |
| Ruling 3 (labels to constructions) | K8 -> C5; P2's batch clause withdrawn with (B'); K9's server-issued resolution -> section 6; K13 -> C9 | C5, C9, section 6 |
| Ruling 4 (measure requests) | kept; allow-set narrowed to `{Canvas, Supabase}`, declared. **[R2] its EXAMPLE re-measured and both it and Ruling 7's correction found half wrong; justification re-derived from `src/app/actions.ts`** | C12 |
| Ruling 5 (majors) | "refused send keeps the text" -> C9. **[R2] "assert each state's count" -> C5, which revision 1 marked kept and never wrote.** "Base set once" -> C8. "Ambiguous = unknown" -> C2. "Reuse the plain-text drafter" -> C10. Two clauses WITHDRAWN with (B') - Sent Items, and the single "no address" reason; the Sent Items privacy question is still true of the existing Outlook path, so it becomes RA4 | C2, C5, C8, C9, C10, RA4 |
| Ruling 6 (cite by symbol) | **[R2] applied throughout** - revision 1 had six citations off by one to four lines | - |
| **Ruling 7** (Ruling 4's false premise) | **[R2] acted on by re-measuring, and the re-measurement contradicts Ruling 7's own first half.** Reported in C12, not resolved silently | C12, RA10 |
| **Ruling 8** (token authorises the run) | **[R2] built.** C7 rewritten; its instrument drives 7 invocations; C9 rewritten with it | C7, C9 |
| **Ruling 9** (allow-pattern on the emitted value) | **[R2] built** from the shipped guard at `messaging.ts:301`, moved inside the builder | C1 |
| **Ruling 10** (recorder seam) | **[R2] built**, at `vi.stubGlobal` **and** `canvasFetch`, both necessary | C12 |
| **Ruling 11** (three missing instruments) | **[R2] all three written**: C5's partition, C13's server-side gate, C14's distinct reasons | C5, C13, C14 |
| **Ruling 12** (no wall red on arrival) | **[R2] built.** The `mode` ban struck (444 measured); replaced by a frozen emitted-parameter set. The two tokens measured at 0 survive as tree-wide walls | C1 |
| **Ruling 13** (name the real caller) | **[R2] built.** `src/app/actions.ts` (not `index.ts`); the pump moved into W3; W1's no-caller exemption stated | section 5, section 8 |
| **Ruling 14** (two-tab race) | **[R2] built** on `claimScheduledRelease`'s CAS idiom, with a two-pump test | C6 |
| **Ruling 15** (carried) | **[R2] all five addressed**: the 60s phrasing corrected (2.1); OC6 split into OC6/OC7/OC8; citations by symbol; twelve route handlers with a command; the types glob replaced by the exact path; wave commands split per wave; the import test paired with a use check (C5 a4). The "required-body non-sequitur" is removed - C1 no longer argues from it | throughout |
| E1 (which option) | **CLOSED** by the owner | - |
| E2 (invited/inactive) | kept, default excluded | C8 |
| E3 (A21's voice) | kept, open | RA1 |
| E4 (leverage call) | kept, open | section 10, RA2 |
| E5, E6 | **moot** under (A) | - |

---

## 10. Leverage - and THE QUESTION THE OWNER GETS NOW

**Ruling 15's closing note is right and revision 1 buried this. It goes first.**

### THE QUESTION (OC9): how many of your courses have more than 100 students?

Per the documentation this design quotes (Q2), **Canvas's own compose already
does most of this for a class of 100 or fewer**: one message to `course_<id>`
with `group_conversation` at its default false creates "individual private
conversations ... with each recipient". No group thread, no roster exposure, one
action, zero build.

**So the size of A29's advantage is a function of one number the owner has and
this seat does not:**

- **If most courses are at or under 100:** A29 adds the live-roster guarantee
  and the durable per-student ledger over a native path that already works
  safely. That is a real but **modest** advantage, and "use Canvas's compose" is
  a legitimate answer.
- **If courses routinely exceed 100:** the native path is where the documented
  `group_conversation=true` requirement bites, and the docs-versus-source
  conflict (Q2) becomes a live roster-exposure risk the instructor cannot
  evaluate. A29's per-student construction is then **the only safe path**, and
  the advantage is large.

**Asked now, alongside the work, not after it.** It does not gate the build:
under either answer the shape in this document is correct, because C1's
single-recipient construction is the safe shape at any class size.

### The leverage claim

**Trigger fired: feature work.** A claim is owed.

**Class claimed: GUARANTEED.** At confirm time, the recipient set **is** the
live Canvas roster of active students for that course, each exactly once, with
the read's completeness stated rather than assumed; and after the run every one
of those students is in exactly one recorded state that survives the process
dying and survives a second browser tab.

**What the instructor does instead today, measured.** In this app: nothing -
there is no multi-recipient Canvas send in the tree (2.2, canary-checked).
Outside it: Canvas's own compose, which gives no per-recipient record, no
resumable partial state, and - above 100 - the documented group-thread
requirement.

**What is inherited, not earned:** the drafting (chat-equivalent; it is
`draftAnnouncementAction`, already built) and the transport (one
`createConversation`, already built). The claim rests entirely on the roster
guarantee and the durable ledger.

**The three-way call is the owner's (E4).** Recorded as RA2:
- **Redesign** toward SCALE - per-student content merged from course data, the
  shape the nudge drafter in `src/app/actions/messaging.ts` already proves is
  buildable.
- **Accept** the GUARANTEED claim as stated.
- **Reject** in favour of Canvas's own compose - **which OC9's answer may well
  make the right call.**

**The removal test is L1:** swap the live roster read for any stored list and
the asserted recipient set must change.

---

## 11. Residual register

An entry without an owner, an instrument and a step is a deletion. Each row has
all three. **None exists until it is in `docs/BACKLOG.md`** - the orchestrator's
step at this chunk's push. This seat did not write `docs/backlog.yml`.

| Id | Requirement | Owner | Instrument | Step |
|---|---|---|---|---|
| RA1 | E3: is `draftAnnouncementAction`'s course-announcement voice right for a private Inbox message? | Repo owner | Read one drafted body in the modal | Verify |
| RA2 | E4: the leverage three-way call (section 10) | Repo owner | Section 10's three options | Verify |
| RA3 | OC1-OC9: the nine checks no test here can settle (1.1) | Repo owner | Canvas sandbox, test student's mailbox, the Vercel settings page, the owner's own course list | Verify, before push. **OC9 asked now** |
| RA4 | The EXISTING Outlook path sets `saveToSentItems: true`, keeping every BCC address permanently in the instructor's Sent Items. Moot for A29; still true of `sendMessageDraftByEmailAction` | Repo owner | Read `src/app/actions/messaging-outlook.ts` around the Graph call | A separate backlog item |
| RA5 | `CourseRow.tsx` 694, `CoursesTable.tsx` 792 (3.1). If W4 puts either over 900, the extraction is owed before W4 verifies | W4's implementer | `src/file-size-ceiling.structure.test.ts`, both counters | W4's wave gate |
| RA6 | Two existing roster readers disagree on enrollment-state filtering (`listStudents`/`listCourseRoster` vs `listStudentGradeSummaries`). A29 adds a THIRD rather than reconciling them, deliberately | Whoever next touches roster reading | A fixture exercising each state through all three | A separate backlog item |
| RA7 | `canvasError` discards the HTTP status for every Canvas call in the app. A29 routes around it (C2); every other caller still cannot distinguish a throttle from a refusal | Whoever next needs status-level Canvas error handling | `grep -rn "canvasError(" src`, one fixture per status class | A separate backlog item |
| RA8 | `src/app/actions/messaging.ts` has **no test file** (7.3), so the shipped single-student send is untested and W2's preservation claim has nothing to lean on | W2's implementer | A new test asserting `createConversation` still throws `canvasError` per non-ok status and still sends one `recipients[]` | W2, before its wave gate |
| RA9 | **`requireOwner` is a deprecated alias for `requireUser()`, DELIBERATELY less restrictive** (3.7). A29 writes `requireUser()` explicitly. The ~105 other call sites still inherit the alias | Repo owner / the requireOwner-split wave | The alias's own doc comment in `src/lib/supabase/auth.ts`; `grep -rc "requireOwner" src` | A separate backlog item |
| RA10 | **Ruling 7's own correction is half wrong**: `src/app/actions.ts:66` DOES re-export `sendMessageDraftByEmailAction` via `export *`, and its sole call site imports it through that barrel (C12). Ruling 4's "zero call sites" is wrong and Ruling 7's "no barrel re-exports it" is also wrong; the ruling's conclusion is unaffected | Orchestrator | The four-line grep pasted in C12 | Before the next artifact cites either ruling's example |
| RA11 | **L15 applies to this chunk's gates.** `grep -n testTimeout vitest.config.ts` exits 1 today, so whole-tree walkers run at vitest's 5s default and go falsely red under concurrent load | Orchestrator (a one-line config decision, per the L15 row) | That grep | Before this chunk's waves run concurrently |

---

## 12. What I could not determine

- **Anything Canvas actually DOES.** The network is blocked and there is no key.
  Every test specified here asserts what request the app SENT. Not one asserts
  what Canvas did with it. The `group_conversation` / `bulk_message` conflict
  (Q2) is permanently unsettleable here, which is why C1 makes it irrelevant.
- **Whether `bulk_message` is accepted at all** by any given Canvas (OC3).
- **Whether a conversation message emails a student**, and the email's subject
  line (OC1, OC2). Source evidence exists and is labelled as source.
- **The platform's default Server Action duration** (OC5). The design does not
  depend on it. **The 60-second figure that IS known is Vercel Hobby's hard
  cap for a Route Handler, above which the build fails** (2.1).
- **How many of the owner's courses exceed 100 students** (OC9) - the number
  that sizes this feature's whole advantage.
- **Anything about rendered markup, focus order or keyboard behaviour.** No
  component is rendered by any test in this repo. Every UI claim here (L7's
  placement, C11's copy, K12's facts) is READING, routed to OC6/OC7/OC8, and
  **no criterion is enforced only by a render** - which is why K1 moved to
  C13's server-side assertion.
- **Whether `course_<id>_students` would be accepted** for this owner's Canvas
  role. Not used, so not needed.
