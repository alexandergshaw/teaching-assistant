# A29 - architecture, re-scoped SMALL on the owner's OC9 answer

Seat: architecture (`loop-architect`). **New document, 2026-09-23.** It does not
edit `docs/a29-architecture.md`, which stands as the record of what the
over-100 case would have needed. This document decides SHAPE. It writes no
production code.

**The owner answered OC9 on 2026-09-23, verbatim:**

> "no courses should exceed 100."

**Consumes:** `docs/a29-architecture.md` revision 2 (mined, not repeated);
`docs/a29-rulings.md` rounds 1-4 (rulings 1-28); `docs/a29-ac.md` revision 1
(K1-K14, P1-P7, L1, OV1-OV3, E1-E6); `src/lib/canvas/inbox.ts`.

Every quantity below names the command that produced it. Bash-tool commands are
shown as `$ ...`, PowerShell as `PS> ...`, node as `$ node -e ...`. Citations
are by symbol; a line number appears only where this pass opened that exact
line. Multi-path test runs are spelled `npm run test:paths -- <p1> <p2> ...`
and their exit code is read from a file, never from a pipe.

---

## 0. The one-paragraph shape, and the price, in that order

**The shape.** A bulk course message is **ONE `POST /api/v1/conversations`**
carrying exactly one `recipients[]` value, `course_<id>`, with
`group_conversation` **absent** (its documented default is false) and
`force_new` **absent**. Per the documentation, a false `group_conversation`
creates individual private conversations with each recipient, so no student
sees another and no reply-all thread exists. The request is issued by one
server action, from a rendered page, after a confirm. A **live roster read**
runs before it - not to choose recipients, which Canvas does, but to put a
count and an exclusion note in front of the instructor. A **single durable
row** per (user, course) is inserted before the POST under a partial unique
index and settled after it; an outcome the app cannot determine leaves that row
`open`, which blocks the next send until the instructor resolves it explicitly.

**The price, stated here rather than buried.** **ONE request is ONE outcome for
the whole class.** There is no per-student receipt and there cannot be one: the
Conversations API returns no per-recipient status, and the app never learns
which students Canvas actually expanded `course_<id>` into. So:

- **What the instructor learns:** that Canvas accepted (or refused, or that the
  outcome is unknown) the whole message, once; how many active students the
  app counted in the course at the moment of sending; which roster rows the app
  would not have counted and why; and the exact subject and body that left.
- **What the instructor does NOT learn:** which students received it; whether
  any individual conversation failed; whether Canvas included teachers, TAs,
  observers, or invited and inactive students; and whether any email was
  delivered. The first three are new losses relative to revision 2. The fourth
  was always true.
- **The UI must not imply a per-student result.** No per-student row, no "4 of
  42", no progress bar over students. The result surface has exactly one state
  for the send, and S8 enforces the vocabulary.

**What this removes from revision 2.** The per-student pump, the per-recipient
ledger table, the claim-one-row CAS, the stale sweep, the resume machinery, the
server-minted token, the six-row poll classifier, and the browser-driven loop -
all withdrawn, each with its hazard named in section 9. Five of the six
blockers the round-4 check found lived in that machinery.

---

## 1. The Canvas facts, re-verified this pass

The network is blocked under vitest (`vitest.setup.ts` replaces
`globalThis.fetch` with a throwing stub) and there is no key, so nothing here is
tested against a real Canvas. These facts come from two places, and the
difference between them is load-bearing:

1. **Canvas's PUBLIC API documentation**, fetched live with the WebFetch tool on
   2026-09-23 from <https://canvas.instructure.com/doc/api/conversations.html>,
   and cross-checked against the 2026-09-21 archive of the same page in this
   session's scratchpad (`conv.txt`). Both agree verbatim.
2. **Canvas's own controller SOURCE** (`conversations_controller.rb`, archived
   as `cc.rb`). **This is SOURCE, not documentation, and open-source Canvas is
   not necessarily what an institution's Canvas Cloud runs.** Every source claim
   below is labelled.

### 1.1 The documented sentence the whole design rests on

Quoted verbatim from the `group_conversation` row of the parameter table (the
live fetch and the archive return the same words):

> "Defaults to false. When false, individual private conversations will be
> created with each recipient. If true, this will be a group conversation
> (i.e. all recipients may see all messages and replies). Must be set true if
> the number of recipients is over the set maximum (default is 100)."

And `recipients[]`, verbatim:

> "An array of recipient ids. These may be user ids (either numeric IDs or
> UUIDs prefixed with "uuid:"), or course/group ids prefixed with "course_" or
> "group_" respectively"

with the documented worked example including `recipients[]=course_3`.

### 1.2 The over-100 sentence, and why the owner's answer removes it

```
$ grep -n -i "bulk_message" conv.txt
453:  If the course/group has over 100 enrollments, &#39;bulk_message&#39; and &#39;group_conversation&#39; must be
$ grep -c -i "recipients" conv.txt
23        # canary: the pattern machinery works, so a one-hit result is real
```

**One hit, in the prose above the parameter table; `bulk_message` appears
nowhere in the table itself.** That single sentence is the ONLY reason revision
2 refused to send more than one recipient per request: taken literally it says
that to message a class over 100 you must set `group_conversation=true`, and
the documentation's own next sentence says `group_conversation=true` means all
recipients may see all messages and replies.

**The owner's answer removes it.** No course exceeds 100 enrollments, so the
sentence does not apply, `group_conversation` stays at its documented default
of false, and the documented behaviour is individual private conversations.
`bulk_message` is never sent, so OC3 (is `bulk_message` accepted at all?) is
moot and is withdrawn.

**The design fails CLOSED if that answer is ever wrong, and that is measured,
not assumed.** From `cc.rb:451` (SOURCE, opened this pass):

```ruby
if !batch_group_messages && @recipients.size > Conversation.max_group_conversation_size
  return render_error("recipients", "too many for group conversation")
end
```

With `group_conversation`, `bulk_message` and `force_new` all absent,
`batch_group_messages` is false, so a course that DOES exceed the maximum makes
Canvas **refuse the request** rather than silently create a group thread. The
documentation reaches the same place more weakly - it says the flag "must be
set true", i.e. the request is invalid otherwise - and neither documentation
nor source anywhere says an over-limit request becomes a group thread. So the
owner's answer sizes the feature's usefulness; it is not load-bearing for
privacy. A course that grew past 100 produces a refusal the instructor sees,
which S3 maps to `refused` and S8 renders.

### 1.3 THE NEW FINDING: `force_new=1` FLIPS THE BATCH TO A GROUP BATCH

This is the most important thing this pass found, and it is a defect the
obvious reuse would have shipped.

The shipped builder sends `force_new=1`:

```
$ grep -rn "recipients\[\]\|group_conversation\|bulk_message\|force_new" src --include=*.ts --include=*.tsx
src/lib/canvas/inbox.ts:400:  params.append("recipients[]", recipientUserId);
src/lib/canvas/inbox.ts:406:  params.append("force_new", "1");
```

Two hits in the whole tree, both in `createConversation`, opened this pass at
`src/lib/canvas/inbox.ts:384-420`. `group_conversation` and `bulk_message`
appear **zero** times anywhere in `src`, including tests.

From `cc.rb:447-448` and `:474` (SOURCE, opened this pass):

```ruby
batch_private_messages = (!group_conversation && @recipients.size > 1) || force_individual_messages
batch_group_messages   = (group_conversation && value_to_boolean(params[:bulk_message])) || value_to_boolean(params[:force_new])
...
batch = ConversationBatch.generate(message, @recipients, mode,
                                   ..., group: batch_group_messages)
```

**`force_new` alone sets `batch_group_messages` to true, and the batch is then
generated with `group: true`.** It also bypasses the over-limit guard at
`:451` quoted above. On this source reading, reusing `createConversation`
unchanged with `recipients[]=course_<id>` would produce exactly the reply-all
shape the whole design exists to avoid, AND remove the refusal that protects
the over-100 case.

**Consequence, and it is a hard requirement:** the course-audience request
**must not carry `force_new`**. The documented description of `force_new` -
"Forces a new message to be created, even if there is an existing private
conversation" - is about reusing a private thread with the same recipient, which
is meaningless for a whole-course audience; there is nothing to reuse. S2's
frozen parameter set is what enforces its absence, and the existing
single-student path keeps sending it unchanged so its behaviour does not move.

### 1.4 `mode=async` is still not sent, for a NEW reason

Revision 2 rejected `mode=async` because it returns nothing a per-recipient
receipt could be built from. That reason is gone with the receipt. The reason
that replaces it is narrower and is about the documentation, not about us:
`mode` is documented as "ignored if this is a group conversation or there is
just one recipient", and **whether a single `course_<id>` token counts as "just
one recipient" is not answered by the documentation** - the source expands it
before counting, but that is source. Sending an undocumented-in-effect
parameter to shrink a timeout window is a bet, and S2's frozen parameter set
would have to be loosened to allow it. It is not sent. Its cost is a
synchronous request that may be slow, which is what S4 exists to survive, and
it is named in the residual register as the measured fallback if OC5 comes back
badly.

### 1.5 Email delivery - the honest ceiling, unchanged

The Conversations page says nothing about email. Measured against the fetched
page text:

```
$ grep -n -i -E "plain text|markdown" conv.txt
(no output; exit 1)
```

What the documentation establishes on a different page
(<https://canvas.instructure.com/doc/api/notification_preferences.html>) is that
a `NotificationPreference` binds a notification's category to a frequency on one
communication channel of one user, with documented values including 'never'. So
each student's own notification settings decide whether an email is sent, and
the app cannot see them.

**The app can report that Canvas accepted the message. It can never report that
an email arrived.** That sentence is a UI requirement (S8), not a caveat.

### 1.6 Owner checks that survive, are new, or are withdrawn

| Id | Check | Owner | Instrument | Step |
|---|---|---|---|---|
| OC1 | Does a course message arrive as email at a test student's mailbox, and stop arriving when that student sets Conversation Message to `never`? | Repo owner | Canvas sandbox, test student account, that student's real mailbox | Verify, before push |
| OC2 | Is the instructor's `subject` the email's subject line, or only rendered in the body? | Repo owner | The same test send | Verify, before push |
| OC4 | Does the body render as plain text (no Markdown, no HTML) in the Canvas Inbox and in the email copy? | Repo owner | The same test send | Verify, before push |
| OC5 | What is the platform's unconfigured Server Action duration on this Vercel project, and does one `course_<id>` POST for a ~100-student course finish inside it? | Repo owner | The Vercel project settings page, then one real send | **Verify, before push. The design SURVIVES a bad answer (S4) but its usability depends on it** |
| **OC10 (NEW)** | **WHO does Canvas include when it expands `course_<id>`?** Teachers, TAs, observers, designers, the test student, invited and inactive students - each a yes or no | Repo owner | One sandbox send to a course holding one of each, then read every mailbox / Inbox | **Verify, before push. This is the check that decides whether the feature does what the owner asked for** |
| **OC11 (NEW)** | Does the Canvas Inbox show the instructor N separate conversations (one per student) rather than one thread, for a real course-audience send? | Repo owner | The sandbox send, read from the instructor's own Canvas Inbox | Verify, before push |
| OC6 | On a course with no LMS link, is the "Message all students" control absent or visibly unavailable **with the status category's reason**? | Repo owner | Real browser | Verify |
| OC7 | Does the confirm show course name, count, the count's meaning, subject, and the full body as it will leave? | Repo owner | Real browser | Verify |
| OC8 | Is there no delivery claim and no per-student implication in the copy; are the message-vs-announcement facts and the route to the announcement composer present; is no count hand-computed beside the single producer? | Repo owner | Real browser **and reading the diff** | Verify |
| ~~OC3~~ | **WITHDRAWN.** `bulk_message` is never sent under any branch of this design | - | - | - |
| ~~OC9~~ | **CLOSED** by the owner, 2026-09-23 | - | - | - |

**OC10 is the sharpest open question in this document** and it is the one no
test here can settle. Section 2.2 states what the design does about it.

---

## 2. The two shape decisions

### 2.1 ONE request, in ONE server action, and no browser pump

Revision 2's browser-driven pump existed for one reason: N requests at
concurrency 1 take unbounded wall-clock time, and a Server Action runs on the
platform's unconfigured default duration (OC5, still unknown). **N is now 1**,
so a single server invocation issues a single HTTP round trip, which is safe
under any cap that permits one at all. The pump, its hook, its poll classifier,
its `MAX_WAIT_POLLS` and its `retryAfterMs` clamp are all withdrawn.

Two facts from revision 2 that still bind and are NOT re-argued here, only
restated so an implementer does not re-derive them wrongly:

- **Vercel Hobby's hard cap is 60 seconds and a route asking for more fails the
  build.** Nothing in A29 may declare `maxDuration` above 60. Measured this
  pass: `src/app/page.tsx` declares no `maxDuration`
  (`$ grep -n "maxDuration" src/app/page.tsx` -> no output; exit 1), so every
  Server Action reachable from it runs on the platform default, which is
  smaller than 60 and is not a repo fact.
- **A Route Handler is still the wrong home**, and after Ruling 19 the argument
  rests only on callers, not on import edges: two scheduled GitHub Actions
  workflows `curl` routes under `src/app/api/**` with no human present, so an
  HTTP route is a surface a scheduler can hit while a Server Action is invoked
  from a rendered page under `requireUser()`. That is what K14 protects (S9).

**The risk this shape newly carries, named rather than hidden:** the one request
is synchronous, and Canvas creates up to ~100 conversations inside it. If that
exceeds the platform's default duration, our invocation dies while Canvas keeps
working, and the outcome is UNKNOWN. That is not an exotic edge; it is the
likeliest failure this feature has. S4 is the whole answer to it, and OC5 is
the measurement that says how often it fires.

### 2.2 The recipient is `course_<id>`, and THE APP NO LONGER CHOOSES WHO

This is the consequence the brief's framing does not fully carry, and it is
reported rather than adopted silently.

The brief states that the live roster read still matters "for the CONFIRM's
count and for who is excluded". **The first half holds. The second does not.**
With `recipients[]=course_<id>`, Canvas expands the audience server-side from
its own enrollment data. The app cannot include a student Canvas omits, and
cannot omit one Canvas includes. So:

- **K3** ("recipients are the course's active students, each once") is no longer
  satisfiable by this app. It is HANDED OVER to OC10.
- **E2** (invited and inactive students excluded by default) is MOOT. There is
  no mechanism to exclude anyone.
- **K6** ("what is sent is what was confirmed") survives only for the subject
  and the body, which the app does control. For the recipient set it is
  WITHDRAWN: the confirm's count is read at time T and Canvas expands at T+1.
- The `excludedNote` is no longer a statement about who will not be messaged.
  It is a statement about **which roster rows the app did not count**, and the
  copy must say exactly that (S8).

**THE FORK THIS OPENS, with a recommendation, because the owner owns it.**
The same documented sentence - `group_conversation` false creates individual
private conversations with each recipient - applies equally to a request
carrying **N explicit numeric user ids**. The source branch is identical:
`batch_private_messages = (!group_conversation && @recipients.size > 1)`, which
is true either way, and `ConversationBatch.generate(..., group: false)` is
reached either way. It is still ONE request. It costs no extra machinery. And
it restores what the course form gives up:

| | `recipients[]=course_<id>` (this design) | N explicit `recipients[]=<numeric id>` |
|---|---|---|
| Requests | 1 | 1 |
| Documented? | Yes, with a worked example | Yes, the same sentence |
| Who decides the audience | **Canvas** | **The app** |
| K3 (active students, each once) | unsatisfiable; OC10 | satisfiable and BEHAVIOURAL |
| E2 (exclude invited/inactive) | moot | implementable |
| The confirm's count | a disclosure | **binding** |
| Over-100 handling | Canvas refuses (source reading) | the app can refuse on its own count, before sending |
| Emitted recipient values | one `course_<id>` token | N values, each `^\d+$` - the guard already shipped at `src/app/actions/messaging.ts:301` |
| Leverage class | none earned (section 10) | **GUARANTEED** earned back |

**Recommendation: build the course form now, as briefed, and treat the N-id
form as the answer to a bad OC10.** The two differ by one variant of one
closed union (S1) and one entry in one frozen parameter set (S2) - the seam is
deliberately placed so that switching is a small, visible change rather than a
redesign. Recorded as **RS1**, with OC10 as its instrument. This document does
not adopt the N-id form unilaterally, and it does not pretend the course form
satisfies K3.

---

## 3. What exists, measured

### 3.1 Sizes, both counters

```
$ wc -l <files>
PS> foreach ($f in $files) { "{0}`t{1}" -f @(Get-Content $f).Count, $f }
```

| File | `wc -l` | `@(Get-Content).Count` | Agree? |
|---|---|---|---|
| `src/lib/canvas/inbox.ts` | 432 | 432 | yes |
| `src/lib/canvas/listings.ts` | 428 | 428 | yes |
| `src/lib/canvas.ts` | 124 | 124 | yes |
| `src/app/actions/messaging.ts` | 522 | 522 | yes |
| `src/app/actions.ts` | 77 | 77 | yes |
| `src/app/components/courses/CourseRow.tsx` | 694 | 694 | yes |
| `src/app/components/courses/CoursesTable.tsx` | 792 | 792 | yes |
| `src/app/components/courses/LmsCell.tsx` | 225 | 225 | yes |
| `src/lib/courses-table-helpers.ts` | 834 | 834 | yes |
| `src/lib/supabase/types.tables-c.ts` | 125 | 125 | yes |
| `src/app/components/courses/useCourseImportActions.ts` | 608 | 608 | yes |

All eleven under the 1000-line ceiling
(`src/file-size-ceiling.structure.test.ts`), and both counters agree on every
row, so the known 42-line discrepancy does not apply here.

### 3.2 The transport that exists

`createConversation` (`src/lib/canvas/inbox.ts:384-420`, opened this pass) takes
`(courseUrl, recipientUserId: string, body, subject?)`, parses the course id out
of `courseUrl` with `/\/courses\/(\d+)/`, appends `recipients[]`, `body`,
optional `subject`, `context_code=course_<id>` and `force_new=1`, and returns
`Promise<void>`, throwing `canvasError(response.status, institution)` on a
non-ok response.

Four defects for A29, all measured:

1. **It emits `force_new`** - section 1.3. Fatal for a course audience.
2. **No allow-pattern on the emitted recipient.** The `^\d+$` check lives in a
   CALLER (`src/app/actions/messaging.ts:301`, seen this pass with its text),
   not in the builder, so any other caller inherits no guard at all.
3. **It discards the status.** `canvasError` (`src/lib/canvas-core.ts`)
   collapses statuses into sentences and returns a bare `Error`, so a caller
   cannot tell a 429 from a 400. Carried as RS7.
4. **It cannot express UNKNOWN.** A throw and a `void` cannot carry "the
   request left and we do not know what happened", which is exactly the state
   S4 is built around.

**It has no test.** `src/lib/canvas/inbox.test.ts` exists and covers
`listConversations` and `getConversation`:

```
$ grep -c "createConversation" src/lib/canvas/inbox.test.ts
0
$ grep -n "describe(" src/lib/canvas/inbox.test.ts | head -4
73:describe("listConversations", ...
84:  describe("with no opts - must stay byte-identical to today ...
188:  describe("with opts - the M15 widening", ...
345:describe("getConversation - SEC10: ...
```

Zero. And `src/app/actions/messaging.ts` - which holds
`sendCanvasMessageAction`, `postMessageDraftAction` and
`draftAnnouncementAction` - has no test file at all
(`$ ls src/app/actions/ | grep -i messag` returns
`canvas-inbox.message-replies.test.ts`, `message-replies.test.ts`,
`message-replies.ts`, `messaging-outlook.ts`, `messaging-scheduling.ts`,
`messaging.ts`). **So "behaviour-preserving" has nothing existing to lean on,
and W1 owes a new test for the shipped single-student shape.** Carried as RS8.

### 3.3 The roster readers, and why A29 adds one

Opened this pass in `src/lib/canvas/listings.ts`:

- `listStudents` (`:248`) and `listCourseRoster` (`:286`) both dial
  `/api/v1/courses/<id>/users?enrollment_type[]=student&per_page=100`
  (`:250`, `:288`). Neither requests `include[]=enrollments`, so **neither
  returns an enrollment state**.
- `listStudentGradeSummaries` (`:318`) dials
  `/api/v1/courses/<id>/enrollments?type[]=StudentEnrollment&state[]=active&per_page=100`
  (`:323`) - the only reader filtering by state, returning one row per
  ENROLLMENT, so a student in two sections appears twice, and it returns grade
  fields A29 has no use for.
- All three cap at `CANVAS_PAGINATION_PAGE_CAP`
  (`src/lib/canvas-remote-url.ts:156` = `20`) and exit the loop silently when
  the cap is hit with `next` still non-null.

No existing reader gives state, completeness and once-per-student together,
which is the whole content of the confirm. That is why T2 adds one.

**All three take an institution `code`, resolved by `resolveInstitutionByCode`
(`src/lib/canvas-core.ts:174`), while `createConversation` takes a `courseUrl`
resolved by `resolveInstitution` (`:126-137`).** Both values come from the same
stored course row, so the action supplies each its own.

**One simplification the owner's answer buys:** 20 pages at `per_page=100` is
2000 rows, and no course exceeds 100 enrollments, so the page cap cannot be hit
for a single course's roster. `complete` stays a returned field anyway - it
costs one boolean, and the direction of failure (silently reporting a capped
read as complete) is exactly the class that bites - but its consequence is now
strictly weaker: an undercount misleads the confirm, it does not change who
receives the message. Said plainly rather than left for a reader to infer.

### 3.4 The durable-row precedents, measured

```
$ grep -rn -A2 "create unique index" supabase/migrations/*.sql | grep -i "where"
supabase/migrations/20260812000000_create_workflow_triggers.sql-64-  where webhook_token is not null;
supabase/migrations/20260922000000_avatar_likenesses.sql-53-  on public.avatar_likenesses (user_id) where is_default;
supabase/migrations/20261004000000_generated_artifacts.sql-113-  on public.generated_artifacts (course_id, kind) where is_current;
supabase/migrations/20261008000000_scheduled_releases.sql-136-  where status = 'pending';
$ grep -rc "create unique index" supabase/migrations/*.sql | grep -v ":0" | wc -l
9        # canary: 9 files declare a unique index at all, so the 4 above are a subset, not the total
```

**A methodology note, because this pass hit it:** the single-line form of this
grep (`grep "create unique index" | grep "where"`) returns **nothing**, because
every one of these statements puts its `where` on a later line. A name-shaped
search answered a shape-shaped question and reported a clean absence. The `-A2`
form plus the denominator canary is what makes the four real.

`scheduled_releases_pending_target_idx`
(`supabase/migrations/20261008000000_scheduled_releases.sql:132-136`, opened
this pass) is A29's shape exactly, and its own header states A29's reasoning:

> "One pending row per target ... Deliberately partial: a 'done' or 'failed'
> row must never block scheduling that same target again later."

`20261016000000_lms_credential_save_attempts.sql` records the two conventions
this design follows - one owning module, service-role access only, **no RLS
policy for `authenticated`** - and the 42P10 trap: a PostgREST
`.upsert({ onConflict })` needs a real non-partial unique constraint.
**A29 never upserts. It INSERTs and lets the insert fail, so 42P10 does not
apply** - a partial index cannot be an upsert arbiter but is a perfectly good
constraint, which is all this needs.

```
$ ls supabase/migrations | wc -l
108
$ ls supabase/migrations | tail -1
20261020000000_institution_accommodations.sql
```

So the new migration is `20261021000000_bulk_course_message_sends.sql`.
Migrations auto-apply via a GitHub Action on push to main, so it must be
idempotent (`create table if not exists`, `create index if not exists`).

### 3.5 The gate and the surface that exist

Opened this pass in `src/lib/courses-table-helpers.ts`:

```ts
// :603-605
export function canLms(c: Course): boolean {
  return Boolean((c.canvasUrl ?? "").trim() && (c.institution ?? "").trim());
}
// :718-732
export function lmsConnectionStatusFor(c, liveCheck?, liveError?): LmsConnectionStatus {
  const hasUrl = Boolean((c.canvasUrl ?? "").trim());
  if (!hasUrl) return { kind: "not-linked" };
  const hasInstitution = Boolean((c.institution ?? "").trim());
  if (!hasInstitution) return { kind: "needs-institution" };
  if (liveError) return { kind: "failed", reason: liveError };
  if (liveCheck) return { kind: "connected", ... };
  return { kind: "unknown" };
}
```

`liveCheck` and `liveError` are the browser's per-course live-check results,
which a server action does not have. **Given only a stored row, exactly two of
the five categories are decidable server-side** (`not-linked`,
`needs-institution`), and `canLms` is precisely their complement - read off both
bodies above, not inherited. S7 refuses on that shared predicate.

The stored row is read by `getCourse` (`src/lib/supabase/courses.ts:73-84`,
opened this pass), whose query is `.eq("user_id", userId).eq("id", id)` - so the
row is the caller's own or it is `null`, and a `null` row is itself a refusal
with zero outbound requests. **The action takes a course ID only; `canvasUrl`
and `institution` come from that row and from nowhere else.**

The surface wiring, opened this pass. `src/app/components/courses/CourseRow.tsx`:

```tsx
// :186-188
const cellMenuFor = (column: CellColumnId) => (
  <CellMenu label={CELL_COLUMN_LABELS[column]} items={[copyItem(column)]} context={course.name} />
);
// :309-314
<LmsCell course={course} onSave={...} liveCheck={lmsLiveCheck} liveError={lmsLiveError} menu={cellMenuFor("lms")} />
```

So the LMS cell's menu holds exactly ONE item today, and `LmsCell` renders it
at `LmsCell.tsx:148` behind a `menu?: ReactNode` prop (`:30-32`, `:69`).
`CellMenu` exposes `disabled` and `disabledReason` on each item
(`CellMenu.tsx:49`, `:58`), renders the reason as the item's secondary text
(`:155`), and sets `disabledItemsFocusable: true` (`:137`) so a disabled item
stays keyboard-reachable and its reason is announced rather than skipped.

**That is the display half of K1 and it is a READING claim (OC6). The gate
itself is S7, server-side.**

### 3.6 The drafter

`draftAnnouncementAction` (`src/app/actions/messaging.ts:405-413`, opened this
pass) takes `(instruction, provider)` and returns `{ title, message }`. Its
prompt instructs, at `:436`:

> "message": the announcement body, addressed directly to students. Use plain
> text with blank lines between paragraphs; do not use markdown, headings, or
> bullet symbols.

**That is the drafter A29 reuses. A21's drafter
(`src/lib/prompt-announcement-prompt.ts`) emits Markdown and is NOT reused** -
steering to it manufactures the formatting hazard S10 would then have to guard.
Whether an announcement voice suits a private Inbox message is RS2 (was RA1).

Note for the implementer: `draftAnnouncementAction` calls `requireOwner()`
(`:410`), the deprecated alias. **A29 writes `requireUser()` explicitly in its
own three actions** - the alias is a `return requireUser()` whose own doc
comment calls it "DELIBERATELY LESS RESTRICTIVE", and
`src/app/actions/action-guard-coverage.test.ts:406` rejects relying on it for
anything owner-scoped. A29 is not owner-scoped: Canvas credentials are
per-user, so `requireUser()` is the right guard and it is written, not
inherited.

---

## 4. THE CONSTRUCTIONS

Ids are **S1-S11**, deliberately a fresh series so no id collides with revision
2's `C1-C15`, the criteria's `K/P/L`, or the owner checks' `OC`. Each names its
**Object**, its **Instrument**, and its **direction of failure**.

**One standing note on new whole-tree walkers.** `vitest.config.ts` sets no
global `testTimeout` (`$ grep -n testTimeout vitest.config.ts` -> no output;
exit 1), so a NEW walker inherits the 5-second default. Every whole-tree walker
this feature adds must carry `vi.setConfig({ testTimeout: 30_000 })` of its own.
The existing walkers already carry it (measured in
`src/app/actions/action-guard-coverage.test.ts:13`), so a 5000ms timeout in one
of THOSE is a finding, not a flake.

### S1 - the audience is a CLOSED UNION, and the emitted value passes an allow-pattern

Carries C1's first half, P4, and Ruling 9 with its predicate changed.

- **Object:** (a) the shape a caller can ask the builder for; (b) the string the
  builder emits as `recipients[]`.

- **Construction (a) - THE UNION, and it is stronger than a string check:**

  ```ts
  export type ConversationAudience =
    | { kind: "user"; canvasUserId: string }
    | { kind: "course" };
  ```

  **The `course` variant carries NO caller-supplied data.** The builder already
  parses the course id out of `courseUrl` to build `context_code`
  (`src/lib/canvas/inbox.ts:393-397`, opened this pass); the course recipient is
  built from that same parsed id. So `course_3_students`, `course_3,course_4`,
  `section_12` and `group_4` are not rejected values - **they are
  unrepresentable**, because there is no parameter that could carry them. The
  only caller-supplied recipient value left anywhere in the tree is the numeric
  user id on the legacy single-student path.

- **Instrument (b) - THE ALLOW-PATTERN ON THE EMITTED VALUE**, the builder's
  first statement after computing it, retained as defence in depth so a future
  variant cannot skip it:

  ```ts
  const CONVERSATION_RECIPIENT_ALLOW = /^(?:\d+|course_\d+)$/;
  ```

  **Accept/reject table, produced by running the pattern, not by reading it:**

  ```
  $ node -e 'const p=/^(?:\d+|course_\d+)$/; for (const c of [...]) console.log(JSON.stringify(c), p.test(c))'
  ```

  | Input | Verdict | Why it is in the table |
  |---|---|---|
  | `"401"` | **accept** | the legacy single-student form |
  | `"course_3"` | **accept** | the new course form - this is the predicate change |
  | `"course_03"` | **accept** | leading zeros are a valid numeric id spelling; harmless, and recorded so it is not mistaken for a leak |
  | `"401,402"` | reject | the comma-joined form that defeated revision 1's count-plus-denylist |
  | `"course_3,course_4"` | reject | the same attack in the new form |
  | `"course_3_students"` | reject | the undocumented role-filtered form |
  | `"section_12"` | reject | a recipient form the design never uses |
  | `"group_4"` | reject | documented, never wanted |
  | `"uuid:W9GQ"` | reject | the form the documentation itself names |
  | `"COURSE_3"` | reject | the pattern is case-sensitive |
  | `"course_"` | reject | prefix with no id |
  | `"401 402"`, `" 401 "`, `"course_3 "` | reject | whitespace in any position |
  | `"401\n"`, `"401\n402"`, `"401\r"` | reject | **the newline-anchor attack. Verified by running it, not recalled: JavaScript's `$` without the `m` flag matches only end-of-input, unlike some other engines** |
  | `""` | reject | empty |
  | `"4e1"`, `"+401"`, `"0x191"` | reject | numeric-looking non-digits |
  | U+0664 U+0665 U+0666 (Arabic-Indic digits, written here as code points because the Write tool materializes an escape into the literal character) | reject | `\d` without `u` is `[0-9]` here - confirmed by running it |

- **Direction of failure:** anything other than a bare run of digits, or
  `course_` followed by a bare run of digits, reaching the wire is the failure.
  **It is an ALLOW-pattern: a form nobody thought of is rejected by default.** A
  denylist of prefixes is explicitly not acceptable; it is what Ruling 9 struck.

### S2 - the FROZEN emitted-parameter set, per variant, covering the URL as well as the body

Carries C1's second half, Ruling 12 and Ruling 26. **This is the construction
that enforces section 1.3's `force_new` finding.**

- **Object:** the SET of parameter names every outbound conversation POST
  carries, in the body AND in the query string.
- **Instrument:** during a driven send, for every recorded conversation POST,
  all three of these hold.

  1. **Body, `user` variant** - `[...new URLSearchParams(body).keys()].sort()`
     equals exactly

     ```
     ["body", "context_code", "force_new", "recipients[]"]              // no subject
     ["body", "context_code", "force_new", "recipients[]", "subject"]
     ```

  2. **Body, `course` variant** - the same expression equals exactly

     ```
     ["body", "context_code", "recipients[]"]                           // no subject
     ["body", "context_code", "recipients[]", "subject"]
     ```

     **`force_new` is ABSENT and its absence is the point** (section 1.3).

  3. **URL, both variants** - `new URL(u).pathname` equals
     `/api/v1/conversations` and `[...new URL(u).searchParams.keys()]` is empty.

  **Green on arrival, measured by opening the builder** (`createConversation`,
  `src/lib/canvas/inbox.ts:408-416`): the request is built as
  `canvasRequest(\`${baseUrl}/api/v1/conversations\`, { method: "POST", ...,
  body: params.toString() }, token)`. The URL carries no query string today and
  all five parameters go in the body, so clause 3 and clause 1 both pass against
  the shipped builder before a line of A29 exists.

- **Direction of failure:** an EXTRA key, in the body or in the query string, is
  the failure. This catches `mode`, `group_conversation`, `bulk_message`, and -
  newly and most importantly - `force_new` on the course variant. A MISSING key
  is equally a failure, which is what keeps the legacy path byte-identical.

- **The tree-wide walls, each measured before being written down:**

  ```
  $ grep -rn "group_conversation\|bulk_message" src --include=*.ts --include=*.tsx | wc -l
  0
  $ grep -rn "force_new" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l
  1
  ```

  Zero and one. So a structure test may require `group_conversation` and
  `bulk_message` to stay at **zero** outside the frozen-set test itself, and
  `force_new` to stay at **exactly one non-test occurrence, in
  `src/lib/canvas/inbox.ts`**. Both are green on arrival, which Ruling 12
  requires and which revision 1's `mode` ban failed (444 occurrences). **`mode`
  is still NOT banned tree-wide**; clause 3 is what covers it.

### S3 - the transport returns a THREE-state result, and ambiguity defaults to `unknown`

Carries C2 and Ruling 5's "ambiguous failures are `unknown`, never `refused`".
It is the input S4 needs and the reason `createConversation`'s `void` return
cannot be reused.

- **Object:** the return value of the new transport function.

  ```ts
  export type ConversationPostResult =
    | { status: "accepted"; httpStatus: number; institution: CanvasInstitution }
    | { status: "refused"; httpStatus: number; institution: CanvasInstitution; reason: string }
    | { status: "unknown"; httpStatus: number | null; institution: CanvasInstitution; reason: string; cause?: unknown };
  ```

  (`CanvasInstitution` is already exported from `src/lib/canvas-core.ts:49`.)

- **Instrument:** the transport called against a mocked `canvasFetch` returning,
  in turn: 201; 400; 401; 403; 404; 422; 429; 500; 502; a thrown `TypeError`;
  and a promise rejecting with an abort/timeout.
- **Pass condition, by class:**
  - 2xx -> `accepted`.
  - 400, 404, 422 -> `refused`, carrying the status and a reason.
  - 401, 403 -> `refused`, with the credential reason. 403 is NOT a throttle -
    `src/lib/canvas-throttle.ts` documents both readings and why a user-facing
    write uses the 429-only predicate `isCanvasRateLimitStatus`.
  - **429, any 5xx, any thrown network error, any timeout -> `unknown`.**
  - Anything not enumerated -> `unknown`. **The default arm is `unknown`.**
- **Direction of failure:** mapping any of {429, 5xx, network, timeout,
  unrecognised} to `accepted` **or** to `refused` is the failure, because both
  release S4's block. Mapping a 400/404/422 to `unknown` is a lesser failure
  (it blocks when it need not) and is also caught.
- **`createConversation` keeps its name, its signature and its behaviour**, and
  is re-implemented as a thin wrapper: `accepted` returns; `refused` or
  `unknown` with an `httpStatus` throws `canvasError(httpStatus, institution)`;
  `unknown` with no `httpStatus` rethrows `cause`. **That is a behaviour claim a
  test must check, and there is no existing test to lean on (3.2), so W1 writes
  one.**

### S4 - ONE durable send record, written BEFORE the POST, and an unknown outcome NEVER self-resolves

Carries C3, C4, C7's single-use half, and Rulings 1, 2, 20, 21 and 28.
**This is the whole answer to the brief's question, and the answer is: yes, a
guard is still owed - but its hazard has changed and its construction shrinks
from two tables, a CAS claim and a sweep to one table and one index.**

**The hazard, restated for one request.** A single request either happened or
did not - from Canvas's side. From the app's side there are three outcomes, and
the third is the hazard:

1. **Double click / two tabs / two devices.** Two invocations in flight. No
   partial state, but two whole-class sends.
2. **Refused (4xx).** Nothing went out. No hazard; the instructor retries.
3. **UNKNOWN.** Our invocation was killed by the platform's unconfigured
   duration while Canvas was synchronously creating up to 100 conversations
   (2.1), or the response was 5xx, or the socket dropped. **Canvas may have
   created every conversation, or none.** The instructor's natural next move -
   reload, send again - messages the whole class twice.

Hazard 3 is inherently cross-process: a killed Vercel function keeps nothing,
and the retry may land on another instance.
`20261016000000_lms_credential_save_attempts.sql` states exactly this in its
own header - an in-memory counter "resets on every cold start and is not
visible to any other concurrently running instance, which on this deployment
(Vercel, serverless) is equivalent to no limit at all". **So an in-memory guard
is not a guard, and `localStorage` is not one either**: it survives a reload and
is shared across tabs of one browser, but a cleared store, a second device or a
second browser defeats it, and it is client-writable - `20261015000000_lms_credentials.sql`'s
own reasoning, that a guard a signed-in browser can write is not a guard.
A disabled button and a `ta-` key are UI niceties here, never the guard.

- **Object:** one Postgres table and the single module owning it.

  ```sql
  create table if not exists public.bulk_course_message_sends (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references auth.users (id) on delete cascade,
    course_id         text not null,
    canvas_course_url text not null,
    subject           text,
    body              text not null,
    recipient_count   integer not null,
    roster_complete   boolean not null,
    state             text not null default 'open',   -- 'open' | 'resolved'
    outcome           text,                            -- 'accepted' | 'refused' | 'unknown' | null
    outcome_detail    text,
    resolution        text,                            -- 'auto' | 'dismissed' | 'retried' | null
    created_at        timestamptz not null default now(),
    settled_at        timestamptz
  );

  create unique index if not exists bulk_course_message_sends_open_idx
    on public.bulk_course_message_sends (user_id, course_id)
    where state = 'open';

  alter table public.bulk_course_message_sends enable row level security;
  ```

  - **No RLS policy for `authenticated`**, service-role access only - the
    `lms_credentials` convention (3.4).
  - **No column whose name matches `/email|address|login|name/`.** The app never
    reads or holds a student address under this design, and the table must not
    become the place one appears. Instrumented below.
  - **`state` stays TWO-VALUED, and Ruling 28 is why.** If "sent but outcome
    unknown" were a third state value, the row would fall out of the index's
    `where state = 'open'` predicate and **stop blocking**, reintroducing
    exactly what Ruling 21 closed. The outcome lives in `outcome`, never in
    `state`.
  - Idempotent DDL, because migrations auto-apply on push to main. **No
    apostrophe inside any `comment on ...` string unless doubled** -
    `src/supabase-migrations.structure.test.ts` is the gate with no local
    backstop.
  - Row types go in `src/lib/supabase/types.tables-c.ts`, beside
    `LmsCredentialSaveAttemptsRow` (`:67-83`, opened this pass), in the same
    Row/Insert/Update triple shape, and **every read goes through an explicitly
    typed mapper** - a bare typed select collapses to `never` here.

- **The owning module, `src/lib/bulk-course-message/sends.ts`, four functions:**
  - `beginSend(...)` -> `{ ok: true; id }` | `{ ok: false; conflict: BulkSendRecord }`.
    **It INSERTs and lets the index arbitrate**; a unique violation (PostgREST
    `23505`) is the refusal, after which it re-reads the winning open row. It
    never reads-then-writes, and it never upserts, so the 42P10 trap does not
    apply (3.4).
  - `settleSend(id, outcome, detail)` - for `accepted` and `refused`, sets
    `state='resolved'`, `resolution='auto'`, `settled_at`. **For `unknown`, sets
    `outcome='unknown'` and `settled_at` and leaves `state='open'`.**
  - `readOpenSend(userId, courseId)` -> `BulkSendRecord | null`.
  - `resolveOpenSend(id, choice: "dismiss" | "retried")` - sets
    `state='resolved'` and `resolution`, scoped `.eq("user_id", userId)`.

- **Instrument (a) - the ORDER of effects.** A driven send against a faithful
  in-memory store fake asserts the row exists with `state='open'` **before** the
  first transport call, and reaches its terminal state **before** the action
  returns. **Fails when** the transport call is observed before the insert.
- **Instrument (b) - THE CONSTRAINT, and a sequential test cannot see it.** Two
  `sendBulkCourseMessageAction` calls for the same `(user, course)` issued
  against the store fake with its insert barrier held, then released together.
  **Pass:** exactly one row exists, exactly one conversation POST was made, and
  the loser gets a refusal carrying the winner's record. **Fails when** two rows
  exist, which is what a read-then-write produces.
- **Instrument (c) - THE UNKNOWN BLOCK, which is Ruling 21 at one request.**
  Drive a send whose transport returns `unknown`. Then drop the module registry
  (`vi.resetModules()`, store retained - simulating the process death this
  guard exists for) and call `sendBulkCourseMessageAction` for the same course
  with a **different** subject and a **different** body. **Pass:** zero outbound
  requests; the refusal carries `kind: "open-send"`, the prior row's id, its
  `created_at`, its `recipient_count`, and **its own subject and body, not the
  caller's**; and the row is still `open` afterwards.
  **Fails when** the body differing changes the outcome (Ruling 1), or when the
  refusal echoes the caller's text instead of the stored row's (Ruling 25).
- **Instrument (d) - NO ADDRESS IS EVER STORED.** After a complete driven send
  against the store fake, dump every row the fake holds and assert **no stored
  value contains `@`**. **The fixture is what makes this real and it is
  mandatory:** the roster fixture the send consumes must carry `login_id` and
  `email` values on the Canvas rows, both of which
  `/api/v1/courses/<id>/enrollments` can return. Paired with a structure
  assertion that the migration's `create table` block declares no column
  matching `/email|address|login|name/`. **The sabotage that must turn it red:**
  copy `entry.email` onto the insert.
- **Direction of failure:** the failure this construction exists for is a second
  whole-class send after an unknown outcome. Its mirror - a row wrongly stuck
  `open` after an `accepted` response - costs the instructor one click to
  dismiss and is the safe direction.

**What is deliberately NOT here, each with the hazard it served:**

| Withdrawn from revision 2 | The hazard it served | Why that hazard is gone |
|---|---|---|
| `bulk_course_message_recipients` table | per-student state | There is no per-student outcome to hold (section 0) |
| The select-then-update-BY-ID CAS claim (Ruling 23) | two invocations claiming the same student | There are no rows to claim; one invocation does all the work |
| The stale sweep and its caller (Ruling 24) | a killed invocation wedging rows at `sending` | A killed invocation leaves ONE row at `open`, which is the desired state - it blocks until resolved. Nothing needs reclaiming |
| The server-minted token (Ruling 8) | authorising N invocations from one confirm | There is one invocation. The guard is the row and `requireUser()` |
| The six-row poll classifier, `MAX_WAIT_POLLS`, `retryAfterMs` (Ruling 22) | "nothing claimable but rows still sending" | Unreachable: there is no second invocation to observe an in-flight first one |
| The browser pump hook (C6) | unbounded wall-clock over N requests | N is 1 |

### S5 - the roster read gives state and completeness, and the count is a DISCLOSURE

Carries C8 and K4, and is where K3 is handed over rather than kept.

- **Object:** the new reader's return value, and what the confirm says the
  number means.
- **Endpoint:**
  `/api/v1/courses/<id>/enrollments?type[]=StudentEnrollment&per_page=100`,
  following `parseNextLink` through `assertCanvasSuppliedUrlIsSameOrigin` -
  **required**, because `src/lib/canvas-pagination-guard.structure.test.ts`
  counts CALL SITES, not files (`GUARD_MARKER` at `:76`, the assertion at
  `:131`). State is NOT filtered in the query; it is returned and classified in
  code, so one fixture exercises every state through one path.
- **Pass condition:** the reader returns `{ entries, complete }`; `complete` is
  `false` exactly when the loop exited with `next` non-null; every entry carries
  its enrollment state; **each user id appears once**; only student-type
  enrollments are present.
- **Instrument:** a mocked Canvas paginating (a) normally to `next === null` and
  (b) past `CANVAS_PAGINATION_PAGE_CAP` with `next` still non-null; and a page
  containing an active student, a student enrolled in two sections, an invited
  student, an inactive student, a concluded student, a teacher, a TA, an
  observer, a designer, and Canvas's test student.
- **Fails when:** `complete` is true after a capped read; a user id appears
  twice; a non-student appears; a state is missing from any entry.
- **Direction of failure:** silently reporting a capped read as complete.

- **WHAT THE COUNT MEANS, and this is a requirement on the copy, not a note.**
  The number in the confirm is **"active students this app counted in Canvas
  just now"**. It is **not** a list of who will be messaged, because Canvas
  expands `course_<id>` itself (2.2). The `excludedNote` is **"roster rows this
  app did not count, and why"** - never "students who will not receive it".
  S8's forbidden-word instrument covers the delivery half; **this clause is
  enforced by OC7 and OC8 as READING claims**, because no component is rendered
  by any test here and this seat does not propose a criterion whose only
  enforcer would be a render.

- **WHAT HAPPENS IF THE ROSTER READ FAILS BUT THE SEND COULD STILL GO.** It
  could: the POST does not need the roster. **The design REFUSES anyway**, and
  the reasoning is re-derived rather than inherited from K2, whose original
  reason (the roster drives the send) is no longer true. The reason that
  replaces it: **the count is the only thing the instructor's confirmation was
  informed by.** If the app cannot produce it at send time, the thing they
  confirmed against is no longer known to hold, and the cost of refusing is one
  retry. The alternative considered and rejected was to send with
  `recipient_count = null` - rejected because it makes the durable record
  useless for the resolution surface ("a send to ? students, outcome unknown")
  at exactly the moment it matters most.
  - **Instrument:** `sendBulkCourseMessageAction` on an admitted course with the
    roster reader mocked to throw. **Pass:** zero conversation POSTs, zero
    ledger writes, and a refusal whose `kind` is `canvas-unreachable` or
    `no-credential` per S7.

- **The removal test (L1, re-derived).** The deletion: replace the live roster
  read with any stored value - `course.studentRepos.length`, a cached count, a
  constant. **The assertion whose observed value changes:** over a fixture where
  the stored tile lists 5 students and the live Canvas enrollments list 7 active
  plus 2 invited, the confirm's `recipientCount` is **7**, its `excludedNote`
  names 2 invited rows, and `roster_complete` is true. Swap in the stored list
  and `recipientCount` becomes 5 and `excludedNote` becomes empty - both
  observed values change. **A test asserting only that a number is returned
  survives the deletion and is not L1.**

### S6 - the client receives scalars only, from ONE producer

Carries C5, shrunken to what one outcome needs. The A28 defect it exists for -
two disagreeing counts on one screen - is unchanged by the re-scope.

- **Object:** every value crossing the server-action boundary toward the
  browser.
- **Construction:** the action return types reference exactly one exported
  type whose fields are **scalars and rendered strings only**:

  ```ts
  export type BulkSendSummary = {
    courseName: string;
    recipientCount: number;
    rosterComplete: boolean;
    excludedNote: string | null;   // ONE rendered sentence, never a list
    outcome: "accepted" | "refused" | "unknown" | null;
    outcomeDetail: string | null;
  };
  ```

  **No array, no `Set`, no `Map`, no `length`-bearing field, no recipient
  identifier, and no per-student anything.** The browser is never given a
  collection, so no display can compute a count.
- **Instrument:** (1) a structure test asserting the type's declaration contains
  no `[]`, no `Array<`, no `ReadonlyArray<`, no `Record<`; (2) the single
  producer of `recipientCount` is the roster reader's dedup, and no second
  function derives it.
- **Direction of failure:** the type gaining a collection-typed or
  identifier-bearing field; a second function deriving a count; a recipient list
  reaching the browser, because a list has `.length`.
- **Honest limit, stated rather than hidden:** a text scan cannot decide types,
  so a component that copies `summary.recipientCount` into a differently-named
  local and does arithmetic on THAT defeats any source-text scan. What it
  cannot defeat is the type itself: the client is never given a second number to
  add. Carried as RS13.

### S7 - the LMS gate and every refusal are SERVER-SIDE, derived from the stored row, and carry a CLOSED kind

Carries C13 and C14, and Ruling 11's second and third clauses and Ruling 26.

- **PROVENANCE:** the actions take a **course ID only** and derive identity from
  `getCourse(userId, courseId)` (3.5). A caller cannot send a linked-looking
  course.
- **The refusal is a closed discriminated union**, with a human sentence beside
  it; the component chooses its copy from `kind` and no branch reads the
  sentence:

  ```ts
  kind: "not-linked" | "needs-institution" | "no-credential"
      | "canvas-unreachable" | "canvas-refused" | "roster-incomplete"
      | "open-send" | "no-active-students"
  ```

  plus a `satisfies Record<RefusalKind, string>` copy map so adding a kind
  without copy fails `tsc` rather than rendering blank.
- **Instrument (a) - the gate.** The action invoked directly (node-env, Canvas
  and the store mocked) **three times**, with the stored row set to: (1) no
  `canvasUrl`; (2) a `canvasUrl` and no `institution`; (3) both present. Count
  outbound requests and ledger writes per call.
  **Pass:** cases 1 and 2 make **zero** outbound requests and **zero** ledger
  writes and refuse with that category as a `kind`; case 3 is admitted. **Only
  two of the five `LmsConnectionStatus` categories are server-decidable (3.5),
  so requiring a case per category would be over-specification by three** - a
  test asserting a distinction the object under test cannot make.
  **Direction of failure:** admitting more courses than `canLms` admits, and any
  outbound request for an excluded course even if the action later returns an
  error. **The check is on REQUESTS MADE, not on the value returned.**
- **Instrument (b) - the two failures an instructor must be able to tell
  apart.** `prepare` on an admitted course, twice: (a) credential resolution
  mocked to throw - `resolveInstitution` (`src/lib/canvas-core.ts:126-137`)
  throws `CANVAS_CREDENTIAL_REQUIRED_MESSAGE` before any HTTP request; (b)
  `canvasFetch` mocked to reject with a network error, which can only happen
  after the credential resolved.
  **Pass:** `kindA === "no-credential"` and `kindB === "canvas-unreachable"` -
  **the CATEGORY is pinned, the sentence is not.** `reasonA !== reasonB` is
  explicitly NOT the assertion; two equally useless strings satisfy it.
  **Direction of failure:** the two producing the same `kind` - it sends an
  instructor to reconnect an account that is connected. A test that only
  compares strings is also a failure of this construction, because it passes
  when both kinds are absent.
- **Why the categories are assignable rather than parsed:** the two failures
  have different PRODUCERS. The category is set where the failure is caught,
  never parsed out of a message.
- **The display half stays READING** (OC6); the gate does not depend on it.

### S8 - no delivery claim, no per-student implication, and the honest limit is present

Carries C11, P5 and Q5, with one clause added by section 0.

- **Object:** the summary type's state names and the result copy.
- **Instrument:** a structure test over the feature's file set for forbidden
  words in user-facing string literals, matched case-insensitively on a word
  boundary: `delivered`, `received`, `emailed`, **`sent`**.

  **`sent` is in the list because a progress line reading "Sent 5 of 11" passes
  a phrase-based list while claiming a delivery the app cannot observe.**

  **Green on arrival, measured over the feature's existing file set:**

  ```
  $ grep -n -i -E '\bsent\b' src/app/components/courses/CourseRow.tsx src/app/actions.ts \
      src/lib/canvas/inbox.ts src/lib/canvas/listings.ts src/lib/canvas.ts \
      src/lib/supabase/types.tables-c.ts
  (no output; exit 1)
  $ grep -rn -i -E '\bsent\b' src --include=*.tsx | wc -l
  57        # canary: the word exists elsewhere, so the pattern is not silently broken
  ```

- **Pass condition:** the strongest state available is "Canvas accepted"; the
  result surface carries a sentence saying the app cannot confirm an email
  arrived and that each student's own Canvas notification settings decide
  whether one is sent; and, until OC2 is answered, nothing describes the subject
  field as the email's subject line.
- **NEW clause, from section 0:** **no state name, count or control may imply a
  per-student result.** There is exactly one outcome. A source-text pin can
  catch the forbidden words; it cannot catch a progress bar, so the per-student
  clause is routed to **OC8** as a READING claim and is stated here as a design
  requirement rather than pretended into a test.
- **Direction of failure:** the honest-limit sentence being ABSENT is a failure;
  its wording is READING. The pin is on the FACT and the forbidden words, never
  on a sentence's spelling.

### S9 - the capability wall measures REQUESTS, and no unattended module CALLS the send

Carries C12 and C15 and applies Ruling 19 - the import instrument is withdrawn
and stays withdrawn.

- **Object:** (a) the set of distinct hosts requested during one complete driven
  send; (b) whether any module under the two unattended directories names the
  send.

- **Instrument (a) - TWO seams, both necessary:**
  1. **A recording `vi.stubGlobal("fetch", ...)`.** `vitest.setup.ts`'s own
     header says a test that installs its own `vi.stubGlobal` never sees the
     throwing stub, so this is the **only** seam that can observe a model host.
  2. **The `canvasFetch` mock.** The same header states that `canvasFetch` dials
     through `node:https` rather than `fetch`, so the global recorder cannot see
     Canvas requests at all - seam 1 alone would record an empty Canvas set and
     pass vacuously.

  The recorded host set is the union. **Allow-set: `{ the resolved Canvas base
  URL's host, the Supabase project host }`. That is all.**
  **Fails when** any other host appears - in particular a model host
  (`generativelanguage`, `models.github.ai`) during a SEND. Drafting is a
  separate, earlier action the instructor invokes deliberately.
  **The instrument must itself be sabotage-checked** by adding one
  `fetch("https://example.com")` inside the send path and confirming the test
  goes red, because the specific defect revision 1 shipped was a failure arm
  that could never fire.

- **Why import closure cannot be the instrument, measured this pass:**

  ```
  $ grep -c "^export" src/app/actions.ts
  54
  ```

  54 `export *` lines over the whole actions directory, so any module importing
  anything from `@/app/actions` pulls a model-calling drafter into its closure.
  A29's own write set adds a 55th. Import closure cannot distinguish a send from
  a draft in this tree, for any module.

- **Instrument (b) - a CALL-SITE check, which is a question about identifiers.**
  A structure test walks every non-test `.ts`/`.tsx` under `src/lib/workflows/**`
  and `src/app/api/**` and asserts none contains the identifier
  `sendBulkCourseMessageAction` or `previewBulkCourseMessageAction` - the only
  two exports that can produce an outbound Canvas POST. A call requires the
  callee's name in the calling module.
  - **Green on arrival AND green after, both measured:**

    ```
    $ grep -rn "BulkCourseMessage" src/lib/workflows src/app/api
    (no output; exit 1)
    $ grep -rln "listCourseHubAction" src/lib/workflows src/app/api | wc -l
    122       # canary: the same walk DOES find an action name in those directories
    ```

    Zero today, with a canary proving the walker reaches those files. Green
    after, because section 8's waves write no path under either directory.
  - **The one way an identifier check can be defeated, checked rather than
    assumed:**

    ```
    $ grep -rn 'import \* as [A-Za-z_$]* from "@/app/actions"' src --include=*.ts --include=*.tsx
    (no output; exit 1)
    ```

    No module namespace-imports the actions barrel, so there is no name-indexed
    dispatch to route around the check. **The test asserts that absence too, in
    the same file**, so the assumption fails loudly instead of rotting.

- **Instrument (c) - the workflow step registry, already executing.** An
  unattended sender would have to be a workflow STEP.
  `src/lib/workflows/headless.test.ts:186` pins
  `HEADLESS_SAFE_STEP_TYPES.size` at **154**. A29 adds no step type, so that
  number must be 154 before and after. A wave that bumps it has added an
  unattended path and must say why.

- **Direction of failure:** a workflow step or a route handler reaching the
  send. **Explicitly NOT a failure:** A29 appearing in some module's import
  closure. It will, the moment it is exported from the barrel, and that fact
  carries no information.

### S10 - the body leaves as plain text

Carries C10 and K10.

- **Object:** the `body` parameter of every outbound request.
- **Instrument:** a send whose body was produced by A21's Markdown drafter
  (headings, bold, a list), plus one hand-written body containing `<p>` and
  `**bold**`.
- **Pass condition:** the bytes on the wire equal the bytes on the stored row,
  and the send path performs **no** Markdown-to-HTML conversion anywhere.
- **Fails when:** the send path imports or calls any Markdown or HTML conversion
  helper; or the wire body differs from the stored body.
- **Direction of failure:** the failure is the app CONVERTING. Whether Canvas
  renders Markdown literally is OC4. The drafter reused is
  `draftAnnouncementAction` (3.6), which asks the model for plain text.

### S11 - the instructor's text cannot be lost

Carries C9, K13 and Ruling 25, simplified because there is one request.

- **Construction:** subject and body live in two places. **Client:** per-course
  `ta-` localStorage keys - `ta-bulk-msg-subject-<courseId>` and
  `ta-bulk-msg-body-<courseId>` - satisfying the standing rule that every new
  text input persists across reloads, and per-course so a draft for course X
  cannot pre-fill course Y. **Server:** on the `bulk_course_message_sends` row
  from `beginSend` onward (S4), which is what makes the unknown-outcome case
  recoverable.
- **Instrument:**
  1. A refusal that writes no row (no LMS link, roster read failed): the local
     draft is untouched and the refusal carries no text.
  2. **The reload case.** Drive a send to `unknown`, drop the module registry,
     then call the send again for the same course with a **different** subject
     and body. **Pass:** the refusal carries the FIRST send's subject and body
     verbatim - this is S4's instrument (c) plus one assertion, and it is the
     executing form of "the modal repopulates".
  3. An `accepted` outcome: the local draft is cleared **then, and only then**.
  4. A `refused` or `unknown` outcome: the local draft is **kept**.
- **Direction of failure:** any path that clears the local draft while the
  server does not hold the same text, and a refusal that returns the caller's
  own text instead of the stored row's.
- **Never persisted client-side:** the send record's id, and anything that
  authorises a send.
- **What this does NOT give the instructor, stated rather than implied:** the
  text comes back only when something calls `preview` or `send` for that
  course. A reload that never opens the modal shows no sign that a send is
  unresolved. Closing that needs a per-course badge in the courses fan-out; this
  pass does not invent one. Carried as RS14.

---

## 5. The layers, and the file that CALLS each one

**THE SURFACE IS A LAYER.** T6 is not a garnish; it is the layer that makes
T1-T5 reachable, and it ships in the same chunk. Ids are `T1-T6` so as not to
collide with the criteria's `L1`.

| T | What it is | New/changed files | **Called by** |
|---|---|---|---|
| T1 | Canvas transport: the closed audience union, the emitted-value allow-pattern, the per-variant parameter set, the three-state result (S1, S2, S3) | `src/lib/canvas/inbox.ts` (add `postConversation`, re-implement `createConversation` over it); re-export in `src/lib/canvas.ts` | T4's send action; `sendCanvasMessageAction` (existing, unchanged) for the `user` variant |
| T2 | Roster reader with enrollment state, completeness and once-per-student (S5) | `src/lib/canvas/listings.ts` (add `listCourseEnrollmentRoster`); re-export in `src/lib/canvas.ts` | T4's preview and send actions |
| T3 | The durable send record: migration (incl. the partial unique index) + the ONE owning module + row types (S4) | `supabase/migrations/20261021000000_bulk_course_message_sends.sql`; `src/lib/bulk-course-message/sends.ts`; `src/lib/supabase/types.tables-c.ts` | T4, all three actions |
| T4 | Server actions: **THREE** - `previewBulkCourseMessageAction`, `sendBulkCourseMessageAction`, `resolveBulkCourseMessageSendAction`. Guard: **`requireUser()` written explicitly** (3.6) | `src/app/actions/bulk-course-message.ts`; one `export * from "./actions/bulk-course-message";` line in `src/app/actions.ts` | **`src/app/components/courses/BulkCourseMessageModal.tsx`** (T6) |
| T5 | Pure client helper: the arm signature, the `RefusalKind` copy map, and `canOfferBulkMessage(course)` | `src/app/components/courses/bulkCourseMessage.ts` | T6 |
| T6 | **THE SURFACE.** A modal: subject, body, optional "Draft with AI" calling `draftAnnouncementAction`, the message-vs-announcement facts (K12/OC8), the confirm, the honest-limit sentence (S8), the unresolved-send resolution choice (S4) | `src/app/components/courses/BulkCourseMessageModal.tsx` (NEW) | **`src/app/components/courses/CourseRow.tsx`** |

**`src/app/actions.ts` is a barrel and is NOT counted as a caller.** Ruling 13.

**Why there is no hook file.** Revision 2's `useBulkCourseMessage.ts` existed to
run the pump. With one request there is nothing to pump, so the modal calls the
three actions directly. The logic that genuinely needs testing - the arm
signature and the refusal-to-copy map - lives in T5, a plain `.ts` leaf,
because vitest collects only `src/**/*.test.ts` and **no component is rendered
by any test here**, so anything left inline in the `.tsx` cannot be tested at
all.

**The arm signature is NOT the confirm, and the distinction matters.** Ruling 2
struck a client-side signature the server recomputes from what the client sends,
because that proves nothing was confirmed. T5's signature is a pure
`bulkMessageArmSignature(courseId, subject, body)` in the shipped
`messageDraftArmSignature` / `isConfirmArmed` idiom, and its only job is to
disarm the confirm when the instructor edits the text after arming. **The
server's guard is S4's row plus `requireUser()`**, and it does not consult the
signature.

**Where the instructor reaches it, wiring opened rather than assumed.** Courses
tab -> the LMS column's hamburger menu on a course row -> "Message all
students". `cellMenuFor` (`CourseRow.tsx:186-188`) holds exactly one item
today; W2 gives it a second item for the `lms` column only, whose `disabled` /
`disabledReason` are driven by `canLms` and `lmsConnectionStatusFor`'s category,
and `CellMenu`'s `disabledItemsFocusable: true` keeps the disabled item
keyboard-reachable so the reason is announced (3.5). **Click counting is the UX
seat's, not this seat's** - this section names the reach path only.

Alternative homes considered and rejected: Drafts > Messages
(`MessageDraftsTab.tsx`) is per-draft and carries no course context; a new tab
spends a whole surface on one action.
`useCourseImportActions.ts` (608 lines) is not extended: its seven `canLms`-gated
actions are one-shot server calls with no durable record and no confirm, and
adding A29 would mix two lifetimes and push the file toward the ceiling. The
gate check is copied from there, not re-derived.

**A design constraint with a reason: T6 adds NO class to
`src/app/page.module.css`.** It styles with MUI components and `sx` props only.
Two reasons, both measured concerns rather than taste: that stylesheet is a
shared file no wave should touch for one modal, and
`src/app/components/courses/page-module-css-classes.test.ts` and its
`-orphan-classes` sibling both read it as source text, which would pull two more
walkers into this feature's `owns` set for no benefit.

**A liability this design accepts and names:** `CourseRow.tsx` is 694 and
`CoursesTable.tsx` is 792 (3.1). W2 adds roughly a menu item and a conditional
render to `CourseRow.tsx`. If the as-built diff puts either over 900, the
extraction is owed **before** the wave is verified. Carried as RS5.

---

## 6. The state machine - TOTAL, and it is six rows

Ruling 22 requires every reachable combination to have an outcome. With one
request there are six, and they are ordered; the first match wins.

| # | Event and condition | Outbound | Ledger effect | Returned |
|---|---|---|---|---|
| 1 | `preview(courseId)`, stored row fails `canLms` | **none** | **none** | refusal, `kind: "not-linked"` or `"needs-institution"` (S7) |
| 2 | `preview`, an `open` row exists for (user, course) | **none** | **none** | refusal, `kind: "open-send"`, carrying that row's id, `created_at`, `recipient_count`, `outcome`, **and its subject and body** (S11) |
| 3 | `preview`, admitted | roster GETs only | **none** | `{ courseName, recipientCount, rosterComplete, excludedNote }`; or refusal `no-active-students` when the count is 0; or `no-credential` / `canvas-unreachable` when the roster read fails (S7) |
| 4 | `send(courseId, subject, body)`, gate passes, roster read succeeds, INSERT wins | **exactly one** conversation POST | `beginSend` INSERT (`open`) **before** the POST; `settleSend` after: `accepted`/`refused` -> `resolved`; **`unknown` -> stays `open`** | `BulkSendSummary` with `outcome` set |
| 5 | `send`, INSERT loses the unique index | **none** | **none** | refusal, `kind: "open-send"`, carrying the winner's record - identical in shape to row 2, so two tabs confirming at once see the run that actually exists rather than starting a second one |
| 6 | `resolve(sendId, "dismiss" \| "retried")`, the row is `open` and `.eq("user_id", ...)` matches | **none** | `state='resolved'`, `resolution` set | `{ ok: true }` |

**Row 4's `unknown` arm is where the guard lives**, and it is the only way a row
stays `open` past its own invocation. Only row 6 clears it, and only the
instructor can trigger row 6. **The app never discharges an unknown outcome on
the instructor's behalf** - Ruling 21, at one request.

**Why `refused` does NOT block, which is a change from revision 2 and is stated
on the record.** Revision 2 kept `refused` in the blocking set because a partial
outcome of 5 accepted and 3 refused meant a naive retry would re-message the
five. **There is no partial outcome now.** A `refused` response means Canvas
took nothing, so the natural retry is correct and requiring a click to clear it
would spend a click for nothing. `accepted` resolves itself for the same
reason: there is nothing left to decide.

**What the instructor sees for an unresolved row, and why both choices are
explicit:** "A message to <course> on <date> for <N> students did not report
back. Canvas may have sent it. Its text was: <subject/body>." Two controls -
**"It went out, clear this"** (`dismiss`) and **"Send again anyway"**
(`retried`, which resolves the row and lets the next send through, and does not
itself send). Neither is a default, and neither is a boolean a component can
always pass as true (Ruling 3): both are a server-issued resolution of a
specific row by id.

---

## 7. `owns` - every file that must be run or read when this lands

Derived, not recalled: (a) the write set; (b) every existing test asserting on
changed behaviour; (c) **every test that reads source files as TEXT**, because a
test that greps a string it does not own is how a correct change goes red.

### 7.1 The commands, with their output pasted

```
$ grep -rl "readdirSync" src --include=*.test.ts | sort | wc -l
39
$ grep -rl "readdirSync" src --include=*.test.ts | grep -c "no-emojis"
1        # canary: src/lib/no-emojis.test.ts is expected and present
```

39 whole-tree walkers exist. The subset that reads THIS feature's files as text,
measured directly:

```
$ grep -rln "canvas/inbox\|canvas/listings\|courses/CourseRow\|app/actions.ts\|types.tables-c" src --include=*.test.ts | sort
src/app/actions/canvas-inbox.message-replies.test.ts
src/app/components/courses/lmsConnectionPill.wiring.test.ts
src/app/components/courses/useCourseImportActions.test.ts
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
src/app/components/message-replies/message-canvas-match.test.ts
src/app/components/message-replies/message-draft-loop.test.ts
src/app/components/repo-grades/repoGradePostScore.test.ts
src/lib/canvas-pagination-guard.structure.test.ts
src/lib/canvas/grading-queue.test.ts
src/lib/canvas/inbox.test.ts
src/lib/client-state-sweep.registry.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
```

And the behavioural set, over the symbols this feature changes:

```
$ grep -rln "createConversation\|sendCanvasMessageAction\|postMessageDraftAction\|listCourseRoster\|listStudents\|canLms\|lmsConnectionStatusFor" src --include=*.test.ts | sort
src/app/components/courses/lmsConnectionPill.wiring.test.ts
src/app/components/courses/useCourseImportActions.test.ts
src/lib/canvas.pullback.test.ts
src/lib/canvas/listings.test.ts
src/lib/course-intel/join.test.ts
src/lib/courses-table-helpers.exports.test.ts
src/lib/courses-table-helpers.lms-connection-status.test.ts
src/lib/courses-table-helpers.lms-render-sources.test.ts
src/lib/workflows/registry/steps.course-setup.rosters.test.ts
```

**`src/lib/canvas/inbox.test.ts` appears in the first list and NOT in the
second, and that is the finding**: it reads `canvas/inbox` but contains zero
occurrences of `createConversation` (3.2). The builder being re-implemented has
no behavioural test anywhere. W1 writes one (RS8).

### 7.2 The walkers that will actually bind

| Walker | What it demands of A29's new files |
|---|---|
| `src/app/actions/action-guard-coverage.test.ts` | Each of the **three** new `"use server"` exports needs its request guard **in its own body**, and per 3.6 that guard is `requireUser()` written explicitly. `GUARD_CALL` at `:61`, and `:406` rejects relying on the `requireOwner` alias |
| `src/lib/use-server-exports.test.ts` | `bulk-course-message.ts` may export **only async functions** - no type re-export, no const. This is the one that `next build` alone otherwise catches |
| `src/lib/canvas-pagination-guard.structure.test.ts` | T2's `parseNextLink` follow must dial the value `assertCanvasSuppliedUrlIsSameOrigin` RETURNS (`GUARD_MARKER`, `:76`). It counts CALL SITES, not files |
| `src/file-size-ceiling.structure.test.ts` | Every touched file stays under 1000 (3.1, RS5) |
| `src/supabase-migrations.structure.test.ts` | The new migration must be lexically well-formed SQL: **every apostrophe inside a string literal doubled** (`:156`), nothing left open at EOF (`:147`). **This is the gate with no local backstop - migrations auto-apply on push** |
| `src/lib/client-state-sweep.registry.test.ts` | Any module-scope cache the feature introduces must register or carry a defended reason (`:133`); the two `ta-` draft keys must be sweepable |
| `src/lib/canvas-client-boundary.test.ts`, `.transitive.test.ts`, `src/lib/module-graph/runtime-import-graph.test.ts` | T5 and T6 are client modules. Nothing in their closure may reach `src/lib/supabase/**` except `lib/supabase/client.ts`. **T3's owning module must never be imported by T5 or T6 - only by T4** |
| `src/lib/no-emojis.test.ts` | Owns the emoji rule. Do not hand-roll a scan |
| `src/source-bytes.structure.test.ts` | Owns the escape/BOM/mojibake scan. A `\uXXXX` written through the Write tool lands as the literal character |
| `src/tools/vitest-paths/gate-commands.structure.test.ts` | Any gate command this feature adds must use the `test:paths` wrapper (`package.json:18`) |
| `src/lib/workflows/headless.test.ts` | `HEADLESS_SAFE_STEP_TYPES.size` stays **154** (`:186`). A29 adds no step type |

**One walker goes the other way, and it is new (S9).**
`src/lib/bulk-course-message/unattended-callers.structure.test.ts` reads every
non-test file under `src/lib/workflows/**` and `src/app/api/**` as source text.
Nothing under those directories is in A29's write set, so it is green on arrival
and stays green - but **A29 thereby owns a read dependency on two directories it
does not write**, and a later chunk adding a workflow step that calls the send
turns it red. That is intended. It carries its own
`vi.setConfig({ testTimeout: 30_000 })` (section 4).

---

## 8. Wave plan

Waves are disjoint by write set, and **every wave contains the file that CALLS
each of its new exports, or states the no-caller exemption explicitly.**

| Wave | Write set (exact paths) | **Contains its caller?** |
|---|---|---|
| **W1a - Canvas libs** | `src/lib/canvas/inbox.ts`; `src/lib/canvas/listings.ts`; `src/lib/canvas.ts`; `src/lib/canvas/inbox.test.ts`; `src/lib/canvas/listings.test.ts`; `src/lib/canvas/conversations-post.structure.test.ts` (new) | **PARTIAL - explicit exemption.** `createConversation`'s existing caller chain (`sendCanvasMessageAction` -> `postMessageDraftAction`) is live and must stay green, and `src/lib/canvas.ts` is the re-export wiring file. But `postConversation`'s **`course` variant** and `listCourseEnrollmentRoster` have **no caller until W2**. **W1a may not be pushed alone** |
| **W1b - the ledger** | `supabase/migrations/20261021000000_bulk_course_message_sends.sql`; `src/lib/bulk-course-message/sends.ts`; `src/lib/bulk-course-message/sends.test.ts`; `src/lib/supabase/types.tables-c.ts` | **NO - explicit exemption.** Nothing calls it until W2. **W1b may not be pushed alone** |
| **W2 - actions + THE SURFACE** | `src/app/actions/bulk-course-message.ts`; `src/app/actions.ts`; `src/app/components/courses/bulkCourseMessage.ts`; `src/app/components/courses/BulkCourseMessageModal.tsx`; `src/app/components/courses/CourseRow.tsx`; `src/lib/bulk-course-message/unattended-callers.structure.test.ts`; their tests | **YES.** `BulkCourseMessageModal.tsx` calls all three actions and `CourseRow.tsx` renders the modal and adds the menu item. **Omitting `CourseRow.tsx` ships the feature dead with every gate green** |

**W1a and W1b are disjoint and run concurrently; W2 depends on both.** Cap
respected: at most 2 concurrent. Disjointness computed, not eyeballed, with a
canary proving the pipeline reports a real collision:

```
$ cat w1.txt w2.txt | sort | uniq -d
(no output - empty intersection)
$ printf '%s\n' src/lib/canvas.ts >> w2.txt; cat w1.txt w2.txt | sort | uniq -d
src/lib/canvas.ts        # canary: a seeded collision DOES print, so the empty result above is real
```

**Wave gate commands.** Each wave runs only its own paths, and **the exit code
is read from a file, never from a pipe** (`| tail` makes `$?` the exit code of
`tail`):

```
# W1a
npm run test:paths -- src/lib/canvas src/lib/canvas.pullback.test.ts > w1a.log 2>&1; echo $? > w1a.code
# W1b
npm run test:paths -- src/lib/bulk-course-message src/supabase-migrations.structure.test.ts > w1b.log 2>&1; echo $? > w1b.code
# W2
npm run test:paths -- src/lib/bulk-course-message src/app/actions/bulk-course-message.test.ts src/app/components/courses > w2.log 2>&1; echo $? > w2.code
```

Log and code files go in the scratchpad, **never in the repo root**. The full
suite runs at the chunk's gate regardless, and so do `npx tsc --noEmit`,
`npm run lint` and the `Compiled successfully` line from `npm run build` - the
last is the only gate that catches a `"use server"` module exporting a
non-async binding.

**Gate every wave with `git status --short` against the assignment**, and check
that no `.claude/worktrees` copy was edited instead of the real tree.

---

## 9. Disposition - every prior requirement, kept / handed over / withdrawn

Prior ids are revision 2's constructions `C1-C15` and the criteria they carried.
**The "Now" column was re-derived LAST, after S1-S11, T1-T6, W1a/W1b/W2,
OC10/OC11 and RS1-RS14 were all final.**

| Prior | Carried criterion / ruling | Disposition | Now |
|---|---|---|---|
| C1 (a) one recipient, allow-pattern | P4, Ruling 9 | **KEPT, predicate widened.** `course_<id>` is a different recipient FORM, not a list of ids. Strengthened from a string check to a closed union in which the course form carries no caller data at all | **S1** |
| C1 (b) frozen parameter set | Ruling 12, Ruling 26 | **KEPT and EXTENDED** to two variants, because the course variant must NOT carry `force_new` (1.3). The tree-wide walls re-measured: `group_conversation`/`bulk_message` at 0, `force_new` at exactly 1 | **S2** |
| C2 three-state transport result | Ruling 5 | **KEPT unchanged.** `unknown` is now the single most load-bearing value in the design | **S3** |
| C3 durable ledger before the first request | Ruling 2, Ruling 20 | **KEPT, reduced from two tables to one.** The attempt row survives; the per-recipient table is withdrawn below | **S4** |
| C3 instrument (c) no address stored | P7 | **KEPT verbatim**, including the fixture that must carry addresses or the assertion cannot fail | **S4** instrument (d) |
| C4 double-send guard keyed on the course | Ruling 1, K9 | **KEPT.** The hazard changed from "a partial outcome" to "an unknown outcome on one request", and the construction shrank to one INSERT under one partial unique index | **S4** |
| C5 no countable collection, one summariser | K8, Ruling 3, Ruling 11 | **KEPT, shrunken.** The partition-per-state assertion is **WITHDRAWN with the states it partitioned** - there are no per-student states to partition. The scalars-only type pin survives, and so does the A28 defect it guards | **S6** |
| C6 the pump, by-id claim, stale sweep | Ruling 14, 23, 24 | **WITHDRAWN entirely.** Hazards each named in S4's table. No enforcer is left unowned: the two-tab race it protected is now covered by S4's unique index, whose instrument (b) is the same barrier test | - |
| C7 the token authorises the attempt | Ruling 8 | **WITHDRAWN.** It authorised N invocations from one confirm; N is 1. **Its protected enforcer - "one confirm produces one send" - is HANDED OVER to S4's unique index**, which is strictly stronger because it binds across tabs and processes, which a token in a row never did | **S4** |
| C8 roster read: state + completeness | K3, K4, Ruling 5's base set | **KEPT as a reader; its MEANING is downgraded.** The reader is unchanged, but it no longer determines recipients - only the disclosure | **S5** |
| K3 (active students, each once) | the owner's word "the students" | **HANDED OVER to the owner.** With `course_<id>` the app cannot include or exclude anyone; Canvas expands the audience. Receiver: repo owner. Obligation: **OC10** must establish who Canvas includes, and the answer decides RS1 | **OC10**, RS1 |
| K6 (what is sent is what was confirmed) | - | **SPLIT.** Kept for subject and body, which the server holds on the row and reads back (S4, S11). **WITHDRAWN for the recipient set**, which the app does not determine (2.2) | **S4**, **S11** |
| E2 (invited/inactive excluded) | owner default | **WITHDRAWN as moot.** No exclusion mechanism exists. The excluded ROWS are still reported as a disclosure (S5) | **S5** |
| C9 the text cannot be lost | K13, Ruling 25 | **KEPT.** The read path is simpler: the refusal carries the stored row's text, and there is no resume to destroy | **S11** |
| C10 plain text on the wire | K10 | **KEPT unchanged** | **S10** |
| C11 honest limit, no delivery claim | P5, Q5 | **KEPT and EXTENDED** with a per-student clause: the UI must not imply a per-student result (section 0) | **S8** |
| C12 capability wall over REQUESTS | K11, Ruling 4, 7, 10 | **KEPT unchanged**, both seams and the sabotage check | **S9** |
| C13 server-side LMS gate | K1, Ruling 11, 26 | **KEPT unchanged**, including the three-case enumeration and the server-derived provenance | **S7** |
| C14 distinct refusal categories | K2, Ruling 11, 26 | **KEPT**, merged into S7 because both are now clauses of one closed `kind` union | **S7** |
| C15 no unattended module CALLS the send | K14, Ruling 19 | **KEPT unchanged**; the two guarded identifiers are renamed to A29's new two exports | **S9** |
| K2's first clause (no outbound after a failed roster read) | K2 | **KEPT, with its reasoning REPLACED.** The old reason (the roster drives the send) is false now; the new reason is that the count is what the instructor confirmed against (S5) | **S5** |
| Section 6.1's six-row pump classifier | Ruling 22 | **WITHDRAWN**, replaced by section 6's six-row event table, which is total over the events that now exist | section 6 |
| Section 5's L6 pump hook | Ruling 13 | **WITHDRAWN.** The modal calls the actions; the testable logic moved to T5, a plain `.ts` leaf | **T5**, **T6** |
| `finishBulkCourseMessageAction` | Ruling 25 | **Stayed deleted.** Three actions, not four | **T4** |
| OC3 (`bulk_message` accepted?) | - | **WITHDRAWN.** Never sent under any branch | - |
| OC9 (how many courses over 100?) | Ruling 18, 27 | **CLOSED** by the owner, 2026-09-23. This document is its consequence | - |
| OC1, OC2, OC4, OC5 | Q5, 2.1 | **KEPT.** OC5 is sharper now: it decides how often the unknown outcome fires (2.1) | 1.6 |
| OC6, OC7, OC8 | OV2, OV3, K12 | **KEPT**, with OC7 extended to include what the count MEANS and OC8 extended to the per-student implication | 1.6 |
| RA1, RA5, RA6, RA7, RA8, RA9, RA10, RA11, RA13, RA14 (revision 2's residuals) | - | **CARRIED**, renumbered RS2-RS14 in section 11 with their original ids named. RA12 (the "77") is **CLOSED**: its instrument is withdrawn with the import check, so no future artifact needs the number | section 11 |
| RA2 / E4 (the leverage three-way call) | - | **KEPT and RE-ARGUED**, because the answer changed. Section 10 | **RS3** |
| Ruling 21 (no self-resolution) | - | **KEPT in a reduced form**, and its own extension to `refused` is **withdrawn with its reason stated**: there is no partial outcome for a retry to duplicate (section 6) | **S4**, section 6 |
| Ruling 28 (state stays two-valued) | - | **KEPT and still load-bearing.** The outcome lives in `outcome`, never in `state`, or the row falls out of the index predicate and stops blocking | **S4** |

---

## 10. Leverage - and the honest answer to "is A29 still worth building"

**Trigger fired: feature work.** A claim is owed, and per `docs/loop/leverage.md`
an honest "thin" is a legitimate answer that the owner disposes of, not the
agent.

### What Canvas already does, for free

Per the documentation this design quotes (1.1), Canvas's own compose sends one
message to `course_<id>` with `group_conversation` at its default false and
creates individual private conversations with each recipient. **For every course
this owner has, that is the entire send.** Zero build, no group thread.

### Revision 2's claim, and why it is WITHDRAWN

Revision 2 claimed the **GUARANTEED** class: "at confirm time the recipient set
IS the live Canvas roster of active students, each exactly once". **That claim
is false under this design.** The app does not determine the recipient set;
Canvas expands `course_<id>` from its own data (2.2). A claim whose mechanism
has been removed is struck, not restated more emphatically.

### What honestly remains, mechanism by mechanism

| Candidate | Is it a mechanism? | Verdict |
|---|---|---|
| The live-roster count in the confirm | Yes - a real Canvas read the instructor does not have to do | **Real, but it is a DISCLOSURE, not a guarantee.** It tells the instructor roughly how many people this will reach. It does not bind the send. Whether Canvas's own compose already shows a count is **not determined here** (no browser, no key) |
| Course context / staying in one place | No - this is click cost | Real and worth naming as click cost, explicitly not dressed up as integration. `leverage.md` struck this class as free to any feature with a UI |
| The AI drafter beside the composer | Yes, but **INHERITED**: `draftAnnouncementAction` already exists and already serves three paths | Not earned by A29 |
| The unknown-outcome guard (S4) | Yes - a durable record read back by a later act, which is the CORPUS shape | **Thin.** It is read back only to block a duplicate. It is also a hazard this feature creates for itself by sending from a serverless function; Canvas's own compose runs in Canvas |
| SCALE / INTEGRATION / CAPTURE / LIVE-LOOP | No | One request, attended by construction (S9), no device input, no ambient layer |

### The verdict

**As briefed - the `course_<id>` form - the claim is THIN, and the thin part is
click cost plus a count the instructor could otherwise read in Canvas.** The
GUARANTEED class is withdrawn. Nothing in the taxonomy is earned. That is a
legitimate answer and it is the one the measurement supports.

**But the fork in 2.2 changes the answer, and that is why it is in this
document rather than in a footnote.** With N explicit numeric recipient ids -
still ONE request, still the same documented sentence, still no group thread -
the app determines the recipient set, and **GUARANTEED is earned back**: the
recipients ARE the live active roster, each once, with the read's completeness
stated, and S5's removal test (swap the live read for any stored list; the
asserted count and note both change) becomes a test of a real advantage rather
than of a label on a screen.

**The three-way call is the owner's (RS3), and this seat does not default it:**

- **Redesign** - build the N-id form (2.2). One variant of one union, one entry
  in one frozen set. This is the option that gives A29 a mechanism.
- **Accept** - ship the `course_<id>` form and state in the criteria that the
  advantage is click cost plus a disclosure, so a later reader does not credit
  it with a roster guarantee it does not have.
- **Reject** - use Canvas's own compose. **Given the owner's answer, this is a
  genuinely reasonable call**, and it is the one that revision 2's own section
  10 predicted would become reasonable if the number came back low. It did.

**My recommendation, since a recommendation is owed and only the owner can
decide:** do not ship the `course_<id>` form as the product. Either take the
Redesign (the N-id form, which earns the claim and costs almost nothing extra
on top of this design) or take the Reject. Shipping the middle option means
building six files and a migration for a count and two fewer context switches,
while handing the recipient decision to Canvas - and OC10 could still come back
saying it messages the teaching team.

**The removal test, whichever way the fork goes, is S5's**, stated there with
the exact deletion and the exact assertion whose observed value changes.

---

## 11. Residual register

An entry without an owner, an instrument and a step is a deletion. Each row has
all three. **None of these exists until it is in `docs/BACKLOG.md`** - the
orchestrator's step at this chunk's push. This seat wrote no backlog file.

| Id | Was | Requirement | Owner | Instrument | Step |
|---|---|---|---|---|---|
| **RS1** | NEW | **The recipient-form fork (2.2).** `course_<id>` hands the audience to Canvas; N numeric ids keeps it. The delta is one union variant and one frozen-set entry | Repo owner (scope) | Section 2.2's table, and **OC10's answer** | Verify, before push. If OC10 says Canvas includes the teaching team, this becomes a defect, not a preference |
| **RS2** | RA1 | Is `draftAnnouncementAction`'s course-announcement voice right for a private Inbox message? | Repo owner | Read one drafted body in the modal | Verify |
| **RS3** | RA2 / E4 | The leverage three-way call (section 10), with this seat's recommendation recorded | Repo owner | Section 10's three options | Verify |
| **RS4** | RA3 | OC1, OC2, OC4, OC5, OC6, OC7, OC8, **OC10**, **OC11** - the nine checks no test here can settle (1.6) | Repo owner | Canvas sandbox, a test student's mailbox, the Vercel settings page, a real browser | Verify, before push |
| **RS5** | RA5 | `CourseRow.tsx` 694, `CoursesTable.tsx` 792 (3.1). If W2 puts either over 900, the extraction is owed before W2 verifies | W2's implementer | `src/file-size-ceiling.structure.test.ts`, both counters | W2's wave gate |
| **RS6** | RA6 | Two existing roster readers disagree on enrollment-state filtering; A29 adds a THIRD rather than reconciling them, deliberately | Whoever next touches roster reading | A fixture exercising each state through all three | A separate backlog item |
| **RS7** | RA7 | `canvasError` discards the HTTP status for every Canvas call in the app. A29 routes around it (S3); every other caller still cannot tell a throttle from a refusal | Whoever next needs status-level Canvas error handling | `grep -rn "canvasError(" src`, one fixture per status class | A separate backlog item |
| **RS8** | RA8, SHARPENED | **The shipped conversation-POST builder has NO test at all.** `src/app/actions/messaging.ts` has no test file, and `src/lib/canvas/inbox.test.ts` contains zero occurrences of `createConversation` (3.2, 7.1). W1a's "behaviour-preserving" claim has nothing to lean on | W1a's implementer | A new test asserting `createConversation` still emits `["body","context_code","force_new","recipients[]"]` and still throws `canvasError` per non-ok status | **W1a, before its wave gate** |
| **RS9** | RA9 | `requireOwner` is a deprecated alias for `requireUser()`, deliberately less restrictive. A29 writes `requireUser()` explicitly; the other call sites still inherit the alias - including `draftAnnouncementAction` at `src/app/actions/messaging.ts:410`, which A29 calls | Repo owner / the requireOwner-split wave | The alias's own doc comment; `grep -rc "requireOwner" src` | A separate backlog item |
| **RS10** | RA10 | Ruling 7's correction is half wrong: `src/app/actions.ts` DOES re-export `sendMessageDraftByEmailAction` via `export *`. Neither ruling's example should be cited again | Orchestrator | The four-line grep in revision 2's C12 | Before the next artifact cites either ruling's example |
| **RS11** | RA11 | `vitest.config.ts` sets no global `testTimeout`, so any NEW whole-tree walker inherits the 5s default. One is added here (S9's) | W2's implementer | `grep -n "testTimeout" src/lib/bulk-course-message/unattended-callers.structure.test.ts` | W2, before its wave gate |
| **RS12** | NEW | **`mode=async` as the measured fallback.** If OC5 shows one `course_<id>` POST does not finish inside the platform default, the options are `mode=async` (undocumented in effect for a course token, 1.4) or an owner-configured route. Neither is adopted now | Repo owner + whoever acts on OC5 | OC5's timing, then one sandbox send with `mode=async` | After OC5 |
| **RS13** | RA13 | S6's scalars-only guarantee is defeated by a component copying a field into a differently-named local. What it cannot defeat: the client is never given a second number to add | The test seat | S6's type-level pin, which does not depend on a name | Test notes, before the tests are written |
| **RS14** | RA14 | **The unresolved-send state has no discovery surface.** The text and the block come back only when something calls `preview` or `send` for that course; a reload that never opens the modal shows no sign. Closing it needs a per-course badge; this pass does not invent one | Repo owner (scope) | Open the modal after an unknown-outcome send and observe whether anything on the Courses tab said so | Verify |

---

## 12. What I could not determine

- **Anything Canvas actually DOES.** The network is blocked under vitest and
  there is no key. Every test specified here asserts what request the app SENT.
  Not one asserts what Canvas did with it.
- **WHO Canvas includes when it expands `course_<id>`** - teachers, TAs,
  observers, designers, the test student, invited and inactive students
  (**OC10**). This is the single largest open question in the design, it decides
  whether the feature does what the owner asked for, and it is why RS1 exists.
  It is not filled in from recall and it is not inferred from the source.
- **Whether the instructor's Canvas Inbox shows N conversations or one thread**
  for a real course-audience send (**OC11**). The documentation says individual
  private conversations; nothing here can observe it.
- **Whether a conversation message emails a student, and the email's subject
  line** (OC1, OC2). Source evidence exists and is labelled as source.
- **The platform's default Server Action duration, and how long one
  `course_<id>` POST takes** (OC5). The design SURVIVES a bad answer by
  construction (S4's unknown state), but its usability depends on it, and
  guessing the number would be the difference between "rare edge case" and "the
  normal path".
- **Whether `force_new` really flips a course-audience batch to a group batch.**
  Section 1.3 is read off Canvas's own controller source, which is **not
  documentation** and is not necessarily what an institution's Canvas Cloud
  runs. The design's response is to not send the parameter at all, which is safe
  under both readings, so the design does not depend on settling it.
- **Whether Canvas's own compose shows the instructor a recipient count**, which
  is what would size section 10's one surviving disclosure against the free
  alternative. No browser, no key.
- **Anything about rendered markup, focus order or keyboard behaviour.** No
  component is rendered by any test in this repo. Every UI claim here - T6's
  placement, S8's copy, S5's "what the count means", the message-vs-announcement
  facts - is a READING claim routed to OC6, OC7 or OC8, and **no criterion in
  this document is enforced only by a render**, which is why K1 lives in S7's
  server-side assertion.
