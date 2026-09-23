# A29 - architecture, SMALL shape, N-ID FORM PRIMARY

Seat: architecture (`loop-architect`). **Revision 2 of this document, 2026-09-23,
written under `docs/a29-rulings.md` ROUND 5 (Rulings 29-32).** It does not edit
`docs/a29-architecture.md`, which stands as the record of what the over-100 case
would have needed. This document decides SHAPE. It writes no production code.

**What changed in this revision, and why.** Revision 1 of this file made the
**course audience** (`recipients[]=course_<id>`) the primary form and recorded
the N-explicit-id form as a fork (RS1), recommending against shipping the middle
option. **Ruling 29 inverts that.** The N-id form is now primary. The course
audience is recorded as an alternative (AL1) with its `force_new` hazard
attached. The consequences are carried rather than relabelled: **K3 and E2 come
back as behavioural requirements**, **K6's recipient half is restored**, and the
**GUARANTEED leverage claim is re-earned** - stated in section 10 with exactly
what it guarantees and, line by line, what it does not.

**The owner answered OC9 on 2026-09-23, verbatim:**

> "no courses should exceed 100."

**Consumes:** `docs/a29-rulings.md` rounds 1-5 (rulings 1-32, which override
everything below where they conflict); `docs/a29-architecture.md` revision 2
(mined, not repeated); `docs/a29-ac.md` revision 1 (K1-K14, P1-P7, L1, OV1-OV3,
E1-E6); revision 1 of this file.

Every quantity below names the command that produced it. Bash-tool commands are
shown as `$ ...`, PowerShell as `PS> ...`, node as `$ node -e ...`. Citations are
by symbol with a line number only where this pass opened that exact line; every
citation in this revision was re-opened against the tree at
`git status --short` = ` M docs/css-orphans.md` (nothing else modified).
Multi-path test runs are spelled `npm run test:paths -- <p1> <p2> ...` and their
exit code is read from a file, never from a pipe.

**This file was written with the Write tool, not through a shell heredoc**, and
every region carrying a `file:line` citation was re-read after writing. A
Markdown backtick inside text passed inline to `bash -c` is command-substituted
before it reaches the writer, which silently deletes the citation and leaves the
claim standing; two rulings lost their evidence that way and were repaired at
commit 40a17e1.

---

## 0. The one-paragraph shape, and the price, in that order

**The shape.** A bulk course message is **ONE `POST /api/v1/conversations`**
carrying **N `recipients[]` values, each a bare Canvas numeric user id**, with
`group_conversation` **absent** (its documented default is false), `bulk_message`
absent and `force_new` **absent**. Per the documentation, a false
`group_conversation` creates individual private conversations with each
recipient, so no student sees another and no reply-all thread exists. The request
is issued by one server action, from a rendered page, after a confirm. **The N
ids are derived inside that same server invocation from a live Canvas
enrollments read** - they are the distinct user ids of the course's active
`StudentEnrollment` rows, each once. A **single durable row** per (user, course)
is inserted before the POST under a partial unique index and settled after it; an
outcome the app cannot determine leaves that row `open`, which blocks the next
send until the instructor resolves it explicitly.

**The price, stated here rather than buried. ONE request is ONE OUTCOME for the
whole class.** The Conversations API returns one response for the batch, so
there is no per-recipient delivery status and there cannot be one. The word
"receipt" in this document therefore means one specific thing and never the
other:

- **A receipt of ADDRESSEES: yes.** The durable row records the exact set of
  numeric user ids that went on the wire, so the instructor (and a later
  session) can read back who the message was addressed to.
- **A receipt of OUTCOMES: no.** There is no per-student accepted / refused /
  unknown. There is one outcome for the request. Any UI that implies otherwise
  is a defect (S8).

So:

- **What the instructor learns:** that Canvas accepted (or refused, or that the
  outcome is unknown) the whole message, once; exactly how many active students
  the app addressed and **which roster rows it excluded and why**; and the exact
  subject and body that left.
- **What the instructor does NOT learn:** whether any individual conversation
  failed; and whether any email was delivered to anyone.
- **The UI must not imply a per-student RESULT.** No per-student outcome row, no
  "4 of 42", no progress bar over students. S8 enforces the vocabulary.

**What this shape removes from revision 2 of `a29-architecture.md`.** The
per-student pump, the per-recipient ledger table, the claim-one-row CAS, the
stale sweep, the resume machinery, the server-minted token, the six-row poll
classifier, and the browser-driven loop - all withdrawn, each with its hazard
named in S4's table. Five of the six blockers the round-4 check found lived in
that machinery.

---

## 1. The Canvas facts, re-verified this pass

The network is blocked under vitest (`vitest.setup.ts` replaces
`globalThis.fetch` with a throwing stub) and there is no key, so nothing here is
tested against a real Canvas. These facts come from two places, and the
difference between them is load-bearing:

1. **Canvas's PUBLIC API documentation**, fetched live with the WebFetch tool on
   2026-09-23 from <https://canvas.instructure.com/doc/api/conversations.html>,
   and cross-checked against the 2026-09-21 archive of the same page in the
   prior pass's scratchpad (`conv.txt`). Both agree verbatim.
2. **Canvas's own controller SOURCE** (`conversations_controller.rb`, archived as
   `cc.rb`). **This is SOURCE, not documentation, and open-source Canvas is not
   necessarily what an institution's Canvas Cloud runs.** Every source claim
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

**The N-id form and the course form rest on the SAME sentence.** "individual
private conversations will be created with each recipient" is a statement about
`group_conversation`, not about which recipient spelling was used. The N-id form
uses the first spelling the `recipients[]` description names - "user ids ...
numeric IDs" - and it is the spelling the shipped builder already emits.

### 1.2 The over-100 sentence, and what the app now does about it

```
$ grep -n -i "bulk_message" conv.txt
453:  If the course/group has over 100 enrollments, &#39;bulk_message&#39; and &#39;group_conversation&#39; must be
$ grep -c -i "recipients" conv.txt
23        # canary: the pattern machinery works, so a one-hit result is real
```

**One hit, in the prose above the parameter table; `bulk_message` appears
nowhere in the table itself.** Taken literally it says that to message a class
over 100 you must set `group_conversation=true`, and the documentation's own
next sentence says `group_conversation=true` means all recipients may see all
messages and replies. **That is the reply-all shape this design exists to
prevent, so A29 never crosses the line - it refuses at it.**

**Under the N-id form the app knows the count BEFORE it sends, and that is a
strict improvement over revision 1.** The recipient list is assembled
server-side, so the over-limit condition is decidable in our own code, with our
own reason, before a single byte goes out. S1 caps the builder and S7 gives the
refusal a category (`over-recipient-limit`). Under the course form the app knew
nothing until Canvas answered.

The owner's answer means this guard should never fire. **That is the point of
it**: it fires visibly instead of the request doing something unspecified.

**The documented maximum is instance-configurable** ("default is 100"), so the
app's constant is conservative by construction: it refuses at more than 100 even
if an institution raised its own limit. An institution that LOWERED its limit is
not detectable from here and is named in section 12.

**The source reading agrees, and is labelled SOURCE.** From `cc.rb:451` (opened
by the prior pass; not re-fetched this pass, and carried as a source claim, not
as a measurement of this tree):

```ruby
if !batch_group_messages && @recipients.size > Conversation.max_group_conversation_size
  return render_error("recipients", "too many for group conversation")
end
```

With `group_conversation`, `bulk_message` and `force_new` all absent,
`batch_group_messages` is false, so an over-limit request is refused by Canvas
rather than silently becoming a group thread. **A29 does not rely on that.** It
refuses first, on its own count, for its own reason.

### 1.3 `force_new=1` FLIPS THE BATCH TO A GROUP BATCH - the finding, and where it now binds

This is the most valuable thing this row has produced, and it is a defect the
obvious reuse would have shipped.

The shipped builder sends `force_new=1`:

```
$ grep -rn "recipients\[\]\|group_conversation\|bulk_message\|force_new" src --include=*.ts --include=*.tsx
src/lib/canvas/inbox.ts:400:  params.append("recipients[]", recipientUserId);
src/lib/canvas/inbox.ts:406:  params.append("force_new", "1");
```

Two hits in the whole tree, both inside `createConversation`, re-opened this pass
at `src/lib/canvas/inbox.ts:384-419` (the function opens at `:384`,
`recipients[]` at `:400`, `context_code` at `:405`, `force_new` at `:406`, the
POST URL at `:409`). `group_conversation` and `bulk_message` appear **zero**
times anywhere in `src`, including tests.

From `cc.rb:447-448` and `:474` (SOURCE, opened by the prior pass):

```ruby
batch_private_messages = (!group_conversation && @recipients.size > 1) || force_individual_messages
batch_group_messages   = (group_conversation && value_to_boolean(params[:bulk_message])) || value_to_boolean(params[:force_new])
...
batch = ConversationBatch.generate(message, @recipients, mode,
                                   ..., group: batch_group_messages)
```

**`force_new` alone sets `batch_group_messages` to true, and the batch is then
generated with `group: true`.** It also bypasses the over-limit guard at `:451`.
On this source reading, reusing `createConversation` unchanged with a
multi-recipient audience would produce exactly the reply-all shape the whole
design exists to avoid, AND remove the refusal that protects the over-limit
case.

**Where it binds now, and it binds harder than in revision 1.** Revision 1
attached this to the course-audience request. It attaches to **any**
multi-recipient request, which is what the primary form now is:

- **The `roster` variant must not carry `force_new`.** S2's frozen parameter set
  for that variant is the construction that enforces its absence, and the
  absence is asserted **by name**, not only by set equality, so the assertion
  says out loud what the defect was about.
- **The `user` variant keeps sending it, unchanged**, so the shipped
  single-student path does not move. Its frozen set requires `force_new === "1"`.
- **The alternative (AL1, section 2.3) inherits the same prohibition**, already
  written, so if it is ever built the parameter cannot be forgotten.

**Labelled SOURCE, and the design does not depend on settling it.** The
documented description of `force_new` - "Forces a new message to be created, even
if there is an existing private conversation" - is about reusing a private thread
with the same recipient. Omitting the parameter is safe under both readings:
under the documentation it declines a reuse we never wanted, and under the source
it declines a group batch we must not have.

### 1.4 `mode=async` is still not sent, and the reason is now simpler

Revision 2 of `a29-architecture.md` rejected `mode=async` because it returns
nothing a per-recipient receipt could be built from. `mode` is documented as
"ignored if this is a group conversation or there is just one recipient". With N
explicit ids and N greater than 1 it is **not** ignored, so sending it would
genuinely change behaviour - to a shape whose response carries no batch outcome
this design can classify. Sending it is a bet against S3's three-state result,
and S2's frozen parameter set would have to be loosened to allow it. It is not
sent. Its cost is a synchronous request that may be slow, which is what S4
exists to survive, and it is named in the residual register (RS12) as the
measured fallback if OC5 comes back badly.

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
each student's own notification settings decide whether an email is sent, and the
app cannot see them.

**The app can report that Canvas accepted the message. It can never report that
an email arrived.** That sentence is a UI requirement (S8), not a caveat.

### 1.6 Owner checks that survive, are re-aimed, or are withdrawn

| Id | Check | Owner | Instrument | Step |
|---|---|---|---|---|
| OC1 | Does a course message arrive as email at a test student's mailbox, and stop arriving when that student sets Conversation Message to `never`? | Repo owner | Canvas sandbox, test student account, that student's real mailbox | Verify, before push |
| OC2 | Is the instructor's `subject` the email's subject line, or only rendered in the body? | Repo owner | The same test send | Verify, before push |
| OC4 | Does the body render as plain text (no Markdown, no HTML) in the Canvas Inbox and in the email copy? | Repo owner | The same test send | Verify, before push |
| OC5 | What is the platform's unconfigured Server Action duration on this Vercel project, and does one N-id POST for a ~100-student course finish inside it? | Repo owner | The Vercel project settings page, then one real send | **Verify, before push. The design SURVIVES a bad answer (S4) but its usability depends on it** |
| **OC10 (RE-AIMED)** | **Does Canvas's `active` `StudentEnrollment` set match what the instructor means by "the students"?** Specifically: is the Canvas Test Student returned by `/enrollments?type[]=StudentEnrollment`; does a student in two sections return two enrollment rows for one `user_id`; are `invited`, `inactive` and `completed` states returned when state is not filtered | Repo owner | One sandbox course holding one of each, read through the new reader (T2) | Verify, before push. **Narrower than revision 1's OC10**, which asked who Canvas expands a course token into - a question the N-id form no longer asks |
| **OC11** | Does a single POST carrying N numeric ids with `group_conversation` absent show the instructor N separate conversations in their own Canvas Inbox, and show each student a thread with no other student on it? | Repo owner | The sandbox send, read from the instructor's Inbox and from two test students' | **Verify, before push. This is the check that the documented sentence behaves as documented** |
| OC6 | On a course with no LMS link, is the "Message all students" control absent or visibly unavailable **with the status category's reason**? | Repo owner | Real browser | Verify |
| OC7 | Does the confirm show course name, count, **the count's meaning (who is included and who is excluded, by name of the state)**, subject, and the full body as it will leave? | Repo owner | Real browser | Verify |
| OC8 | Is there no delivery claim and no per-student OUTCOME implication in the copy; are the message-vs-announcement facts and the route to the announcement composer present; is no count hand-computed beside the single producer? | Repo owner | Real browser **and reading the diff** | Verify |
| ~~OC3~~ | **WITHDRAWN.** `bulk_message` is never sent under any branch of this design | - | - | - |
| ~~OC9~~ | **CLOSED** by the owner, 2026-09-23 | - | - | - |

**OC10 no longer gates the feature's meaning.** Under revision 1 it decided
whether the feature did what the owner asked; under the N-id form the app chooses
the recipients, so OC10 asks a narrower calibration question. Its worst answer
(the Test Student is returned as active) costs one extra addressee that is not a
person, and it is a one-line fix in T2's classifier, not a redesign.

---

## 2. The three shape decisions

### 2.1 ONE request, in ONE server action, and no browser pump

Revision 2's browser-driven pump existed for one reason: N requests at
concurrency 1 take unbounded wall-clock time, and a Server Action runs on the
platform's unconfigured default duration (OC5, still unknown). **The number of
REQUESTS is now 1** - N is the number of recipient values inside that one
request, not the number of round trips - so a single server invocation issues a
single HTTP round trip. The pump, its hook, its poll classifier, its
`MAX_WAIT_POLLS` and its `retryAfterMs` clamp are all withdrawn.

Two facts from revision 2 that still bind and are NOT re-argued here, only
restated so an implementer does not re-derive them wrongly:

- **Vercel Hobby's hard cap is 60 seconds and a route asking for more fails the
  build.** Nothing in A29 may declare `maxDuration` above 60. Measured this pass:
  `src/app/page.tsx` declares no `maxDuration`
  (`$ grep -n "maxDuration" src/app/page.tsx` -> no output; exit 1), so every
  Server Action reachable from it runs on the platform default, which is smaller
  than 60 and is not a repo fact.
- **A Route Handler is still the wrong home**, and after Ruling 19 the argument
  rests only on callers, not on import edges: two scheduled GitHub Actions
  workflows `curl` routes under `src/app/api/**` with no human present, so an
  HTTP route is a surface a scheduler can hit while a Server Action is invoked
  from a rendered page under `requireUser()`. That is what K14 protects (S9).

**The risk this shape newly carries, named rather than hidden:** the one request
is synchronous, and Canvas creates up to 100 conversations inside it. If that
exceeds the platform's default duration, our invocation dies while Canvas keeps
working, and the outcome is UNKNOWN. That is not an exotic edge; it is the
likeliest failure this feature has, and **the N-id form does not make it better
or worse than the course form** - Canvas does the same expansion work either way.
S4 is the whole answer to it, and OC5 is the measurement that says how often it
fires.

### 2.2 THE APP CHOOSES WHO. This is the inversion Ruling 29 required.

Revision 1 sent `recipients[]=course_<id>` and let Canvas expand the audience
server-side. Ruling 29 inverts it, and the reasons are carried in full rather
than compressed into a label:

- The course audience **hands the recipient set to Canvas**, so the app cannot
  say who it reached. That withdraws the roster count as a binding, moots the
  exclusion criteria, and withdraws the leverage claim outright.
- That, not the owner's course sizes, is what made the feature thin - and it is
  **a mechanism choice we control**, not a fact about the owner's courses.
- The N-id form is **ONE request under the SAME documented sentence** (1.1),
  differs by **one union variant and one frozen-set entry**, and restores a real
  count, real exclusions and a per-addressee record.
- Rejection is not the answer either: the owner asked for this feature in words,
  twice.

**What comes back, and each now has an executing instrument rather than an owner
check:**

| Requirement | Revision 1 disposition | Now |
|---|---|---|
| **K3** - recipients are the course's active students, each once | HANDED OVER to OC10; unsatisfiable by the app | **BACK, and BEHAVIOURAL.** The emitted `recipients[]` set is exactly the distinct active-`StudentEnrollment` user ids from the send-time read (S5 pass condition; S2 clause 2) |
| **E2** - invited and inactive students excluded by default | WITHDRAWN as moot; "no exclusion mechanism exists" | **BACK, and BEHAVIOURAL.** The reader classifies state and only `active` enters the recipient list; `invited`, `inactive` and `completed` are counted into `excludedNote` (S5) |
| **K6** - what is sent is what was confirmed | SPLIT; withdrawn for the recipient set | **RECIPIENT HALF RESTORED, with its limit stated** (2.4) |
| **Leverage: GUARANTEED** | WITHDRAWN outright | **RE-EARNED**, with what it does and does not guarantee enumerated (section 10) |
| **The confirm's count** | a disclosure | **BINDING on the send** - it is the size of the set the send actually emits, produced by the same reader (S5, S6) |

**What does NOT come back, and must not be implied:** a per-recipient OUTCOME.
One request, one response, one outcome (section 0). The restored receipt is a
record of ADDRESSEES, held durably server-side (S4), not a record of deliveries.

### 2.3 AL1 - the course-audience form, recorded as the alternative

Ruling 29 requires the course form kept as the recorded alternative with its
`force_new` hazard attached. It is recorded here in full so that adopting it
later is an edit, not a redesign - and so that its hazard cannot be forgotten.

**What it is.** `recipients[]=course_<id>`, exactly one value, `group_conversation`
absent, `bulk_message` absent, **`force_new` absent** (1.3). Its frozen parameter
set is already written as S2 variant (c), so the prohibition ships with the
specification rather than with whoever builds it.

**What it buys.** Canvas expands the audience from its own enrollment data, so
the app does not need a correct roster read, does not need to agree with Canvas
about what "active" means, and cannot undercount a student its reader missed.

**What it costs.** Everything in 2.2's table, reversed: K3 unsatisfiable, E2
moot, K6's recipient half withdrawn, the count demoted to a disclosure, and the
GUARANTEED claim withdrawn. That is the cost that made revision 1 thin.

**A CORRECTION TO THE REASON THE RULING GAVE, reported rather than adopted
silently.** Ruling 29 keeps AL1 "since a course crossing 100 would need it".
**Measured against the documentation quoted at 1.1 and 1.2, AL1 does not by
itself unlock a course over 100.** The documented sentence conditions on "the
number of recipients", and the over-limit rule is that `group_conversation` must
be set true - which produces the reply-all thread the design forbids. Under the
source reading at `cc.rb:451`, a course token with `force_new` absent is refused
at the same limit. So:

- Under the N-id form, a course over 100 is refused **by the app, before
  sending, with its own reason** (1.2, S7 `over-recipient-limit`).
- Under AL1, a course over 100 is refused **by Canvas**, with whatever reason
  Canvas returns, mapped through S3 to `refused`.
- **Neither form sends privately to a course over 100.** The only documented
  route to that is `group_conversation=true`, which this design forbids in both
  forms.

I have therefore recorded AL1 with the reason **corrected**: its value is that it
removes the app's dependence on its own roster read, not that it raises the
recipient ceiling. The over-100 case remains **unserved by A29 in any form**, and
that is now stated in section 12 rather than left implied. I am not overriding
the ruling - AL1 is kept, exactly as instructed - only its stated justification
is one the documentation does not support, and the difference matters if someone
later reaches for AL1 expecting it to solve a class of 120.

**Its instruments if it is ever adopted:** OC11 (does a course token produce N
private conversations) and the re-aimed-back OC10 (who does Canvas include).
Carried as RS1.

### 2.4 The confirm-to-send window - K6's recipient half, and its honest limit

K6's recipient half is restored, and restoring it honestly means naming what it
does not cover.

**The construction.** `preview` reads the roster and returns a count. `send`
performs **its own** roster read inside the same invocation that POSTs, and emits
exactly what that read produced. So:

- **The emitted set is always a live read**, never a stored list, never a cached
  count, never anything the client supplied. That is the guarantee (section 10).
- **The confirm's number is the size of the same reader's output**, produced by
  the same function, so the instructor is not shown one algorithm's count and
  sent another's.

**The limit, and it is real.** The roster can change between the preview's read
at time T and the send's read at time T+1. The send detects that: the client
passes back the `recipientCount` it was shown, the server compares it with its
own fresh read, and a mismatch is **refused** with `kind: "roster-changed"`
carrying both numbers, so the instructor re-confirms against the new set.

**Why that comparand does not violate Ruling 2**, which struck a client-side
signature the server recomputes from what the client sends. It is not an
authorisation and it authorises nothing. A client that lies about the number can
only **suppress a refusal** it would otherwise have caused - it can never change
who is messaged, because the recipient list is derived server-side from Canvas's
own response and never from the request. The worst a lying client achieves is
what a client that never previewed at all would get: a send to the live active
roster. Carried as RS15 so the limit is on the record rather than assumed away.

---

## 3. What exists, measured

### 3.1 Sizes, both counters

```
$ for f in <files>; do printf "%s\t%s\n" "$(wc -l < $f | tr -d ' ')" "$f"; done
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
row, so the known 42-line discrepancy does not apply here. **Both counters were
re-run this pass**, not carried from revision 1.

### 3.2 The transport that exists

`createConversation` (`src/lib/canvas/inbox.ts:384-419`, opened this pass) takes
`(courseUrl, recipientUserId: string, body, subject?)`, parses the course id out
of `courseUrl` with `/\/courses\/(\d+)/`, appends `recipients[]` (`:400`),
`body`, optional `subject`, `context_code=course_<id>` (`:405`) and
`force_new=1` (`:406`), POSTs to `${baseUrl}/api/v1/conversations` (`:409`), and
returns `Promise<void>`, throwing `canvasError(response.status, institution)` on
a non-ok response.

Five defects for A29, all measured:

1. **It emits `force_new`** - section 1.3. Fatal for any multi-recipient
   audience, which is what the primary form now is.
2. **It takes exactly ONE recipient.** The signature is `recipientUserId:
   string`; there is no way to express N. T1 adds one.
3. **No allow-pattern on the emitted recipient.** The `^\d+$` check lives in a
   CALLER - `src/app/actions/messaging.ts:301`, re-opened this pass, whose text
   is `if (!payload.courseUrl || !payload.recipientUserId ||
   !/^\d+$/.test(payload.recipientUserId)) {` - not in the builder, so any other
   caller inherits no guard at all. **Ruling 9 requires that pattern moved INSIDE
   the builder**, and under the N-id form it stops being defence in depth and
   becomes load-bearing (S1).
4. **It discards the status.** `canvasError` (`src/lib/canvas-core.ts`) collapses
   statuses into sentences and returns a bare `Error`, so a caller cannot tell a
   429 from a 400. Carried as RS7.
5. **It cannot express UNKNOWN.** A throw and a `void` cannot carry "the request
   left and we do not know what happened", which is exactly the state S4 is built
   around.

**It has no test, and Ruling 31 makes that a wave step rather than a residual.**

```
$ grep -c "createConversation" src/lib/canvas/inbox.test.ts
0
$ grep -c "listConversations" src/lib/canvas/inbox.test.ts
19        # canary: the same file DOES contain a symbol, so 0 is a real absence
```

Zero, with a canary. And `src/app/actions/messaging.ts` - which holds
`sendCanvasMessageAction`, `postMessageDraftAction` and `draftAnnouncementAction`
- has no test file at all (`$ ls src/app/actions/ | grep -i messag` returns
`canvas-inbox.message-replies.test.ts`, `message-replies.test.ts`,
`message-replies.ts`, `messaging-outlook.ts`, `messaging-scheduling.ts`,
`messaging.ts`). **So "behaviour-preserving" has nothing existing to lean on.**
Section 8 makes writing that test **W1a step 1, before any edit to the builder**.

### 3.3 The roster readers, and why A29 adds one

Opened this pass in `src/lib/canvas/listings.ts`:

- `listStudents` (`:248`) and `listCourseRoster` (`:286`) both dial
  `/api/v1/courses/<id>/users?enrollment_type[]=student&per_page=100`
  (`:250`, `:288`). Neither requests `include[]=enrollments`, so **neither
  returns an enrollment state**. Both are therefore unusable as the recipient
  source: they cannot exclude an invited or inactive student, which is E2.
- `listStudentGradeSummaries` (`:318`) dials
  `/api/v1/courses/<id>/enrollments?type[]=StudentEnrollment&state[]=active&per_page=100`
  (`:323`) - the only reader filtering by state, returning one row per
  ENROLLMENT (`user_id?: number` at `:334`), so a student in two sections appears
  twice, and it returns grade fields A29 has no use for.
- All three cap at `CANVAS_PAGINATION_PAGE_CAP`
  (`src/lib/canvas-remote-url.ts:156` = `20`, opened this pass) and exit the loop
  silently when the cap is hit with `next` still non-null.

No existing reader gives state, completeness and once-per-student together -
which is now not merely the content of the confirm but **the content of the
send**. That is why T2 adds one, and why it is load-bearing rather than
decorative.

**All three take an institution `code`, resolved by `resolveInstitutionByCode`
(`src/lib/canvas-core.ts:174`), while `createConversation` takes a `courseUrl`
resolved by `resolveInstitution` (`:126`).** Both values come from the same
stored course row, so the action supplies each its own.

**What the owner's answer buys, restated for the new shape:** 20 pages at
`per_page=100` is 2000 rows, and no course exceeds 100 enrollments, so the page
cap cannot be hit for a single course's roster. `complete` stays a returned field
anyway, and **under the N-id form its consequence is stronger, not weaker**: a
capped read no longer merely misleads the confirm, it would **omit students from
the send**. So `complete === false` is a REFUSAL (`roster-incomplete`, S7), not a
note. This is a direct reversal of revision 1's reasoning and is stated as such.

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

**A methodology note, because the prior pass hit it:** the single-line form of
this grep (`grep "create unique index" | grep "where"`) returns **nothing**,
because every one of these statements puts its `where` on a later line. A
name-shaped search answered a shape-shaped question and reported a clean absence.
The `-A2` form plus the denominator canary is what makes the four real.

`scheduled_releases_pending_target_idx`
(`supabase/migrations/20261008000000_scheduled_releases.sql:134-136`, re-opened
this pass) is A29's shape exactly, and its own comment at `:131-133` states A29's
reasoning:

> "One pending row per target - see header (AC5). Deliberately partial: a
> 'done' or 'failed' row must never block scheduling that same target again
> later."

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
// lmsConnectionStatusFor opens at :718
//   no canvasUrl                -> { kind: "not-linked" }
//   no institution              -> { kind: "needs-institution" }
//   liveError                   -> { kind: "failed", reason: liveError }
//   liveCheck                   -> { kind: "connected", ... }
//   otherwise                   -> { kind: "unknown" }
```

`liveCheck` and `liveError` are the browser's per-course live-check results,
which a server action does not have. **Given only a stored row, exactly two of
the five categories are decidable server-side** (`not-linked`,
`needs-institution`), and `canLms` is precisely their complement - read off both
bodies, not inherited. S7 refuses on that shared predicate.

The stored row is read by `getCourse` (`src/lib/supabase/courses.ts:73-84`,
re-opened this pass), whose query is `.eq("user_id", userId).eq("id", id)` with
`.maybeSingle()` - so the row is the caller's own or it is `null`, and a `null`
row is itself a refusal with zero outbound requests. **The action takes a course
ID only; `canvasUrl` and `institution` come from that row and from nowhere
else.**

The surface wiring, re-opened this pass. `src/app/components/courses/CourseRow.tsx`:

```tsx
// :186-188
const cellMenuFor = (column: CellColumnId) => (
  <CellMenu label={CELL_COLUMN_LABELS[column]} items={[copyItem(column)]} context={course.name} />
);
// the lms cell's menu prop, at :314
menu={cellMenuFor("lms")}
```

So every column's menu holds exactly ONE item today, and `LmsCell` renders it at
`LmsCell.tsx:148` behind a `menu?: ReactNode` prop (`:30-32`, `:69`). `CellMenu`
exposes `disabled` and `disabledReason` on each item (`CellMenu.tsx:49`, `:58`),
renders the reason as the item's secondary text (`:155`), and sets
`disabledItemsFocusable: true` (`:137`) so a disabled item stays
keyboard-reachable and its reason is announced rather than skipped - its own
comment at `:22-35` records why.

**That is the display half of K1 and it is a READING claim (OC6). The gate itself
is S7, server-side.**

### 3.6 The drafter

`draftAnnouncementAction` (`src/app/actions/messaging.ts:405-413`, re-opened this
pass) takes `(instruction, provider: LlmProvider = "gemini")` and returns
`{ title, message } | { error }`. Its prompt instructs, at `:436`:

> "message": the announcement body, addressed directly to students. Use plain
> text with blank lines between paragraphs; do not use markdown, headings, or
> bullet symbols.

**That is the drafter A29 reuses. A21's drafter
(`src/lib/prompt-announcement-prompt.ts`) emits Markdown and is NOT reused** -
steering to it manufactures the formatting hazard S10 would then have to guard.
Whether an announcement voice suits a private Inbox message is RS2.

Note for the implementer: `draftAnnouncementAction` calls `requireOwner()` at
`:410` (opened this pass), the deprecated alias. **A29 writes `requireUser()`
explicitly in its own three actions** - the alias is a `return requireUser()`
whose own doc comment calls it deliberately less restrictive, and
`src/app/actions/action-guard-coverage.test.ts:406` (opened this pass) carries
the message `"... must not rely on requireOwner( - it delegates to requireUser()
and would admit any active account, not just the owner"`. A29 is not
owner-scoped: Canvas credentials are per-user, so `requireUser()` is the right
guard and it is written, not inherited.

---

## 4. THE CONSTRUCTIONS

Ids are **S1-S11**, the same series as revision 1 of this file, so a reader
holding revision 1 can diff them directly. No id collides with
`a29-architecture.md`'s `C1-C15`, the criteria's `K/P/L`, or the owner checks'
`OC`. Each names its **Object**, its **Instrument**, and its **direction of
failure**.

**One standing note on new whole-tree walkers.** `vitest.config.ts` sets no
global `testTimeout` (`$ grep -n testTimeout vitest.config.ts` -> no output;
exit 1), so a NEW walker inherits the 5-second default. Every whole-tree walker
this feature adds must carry `vi.setConfig({ testTimeout: 30_000 })` of its own.
The existing walkers already carry it, so a 5000ms timeout in one of THOSE is a
finding, not a flake.

### S1 - the audience is a CLOSED UNION, and every emitted value passes an allow-pattern

Carries P4 and Ruling 9, with the union's variants changed by Ruling 29.

- **Object:** (a) the shape a caller can ask the builder for; (b) every string
  the builder emits as a `recipients[]` value; (c) how many of them there are.

- **Construction (a) - THE UNION:**

  ```ts
  export type ConversationAudience =
    | { kind: "user"; canvasUserId: string }
    | { kind: "roster"; canvasUserIds: readonly string[] };
  ```

  Two variants. `section_12`, `group_4`, `course_3_students` and the `uuid:` form
  are not rejected values - **they are unrepresentable**, because no variant has
  a field that could carry them. **Ruling 29's "one union variant"**: AL1 would
  add `| { kind: "course" }` and nothing else.

  **An honest weakening relative to revision 1, stated rather than buried.**
  Revision 1's `course` variant carried NO caller-supplied data at all - the
  builder parsed the course id out of `courseUrl` itself - so the allow-pattern
  there was pure defence in depth. **The `roster` variant carries N
  caller-supplied strings, so the allow-pattern is now LOAD-BEARING.** Two things
  compensate, and both are checkable:
  1. **Provenance.** The only caller of the `roster` variant is T4's send action,
     whose own input is a course id (S7). The ids it passes come from T2's reader
     parsing Canvas's own JSON. No client-supplied id reaches the builder,
     because no action parameter can carry one.
  2. **The pattern below**, applied per value inside the builder, which is the
     last thing before `params.toString()`.

- **Instrument (b) - THE ALLOW-PATTERN ON EVERY EMITTED VALUE**, applied in the
  builder, per value:

  ```ts
  const CONVERSATION_RECIPIENT_ALLOW = /^\d+$/;
  ```

  **This is the pattern already shipped at `src/app/actions/messaging.ts:301`
  (3.2), moved INSIDE the builder** - which is exactly what Ruling 9 instructed
  and what revision 1 widened away from. Because the course spelling is no longer
  emitted by the primary form, the pattern is **tighter than revision 1's**
  `/^(?:\d+|course_\d+)$/`, and `course_3` is now a REJECT.

  **Accept/reject table, produced by running the pattern, not by reading it:**

  ```
  $ node -e 'const p=/^\d+$/; for (const c of [...]) console.log(JSON.stringify(c), p.test(c))'
  ```

  | Input | Verdict | Why it is in the table |
  |---|---|---|
  | `"401"` | **accept** | the only form the design emits |
  | `"0401"` | **accept** | leading zeros are a valid numeric id spelling; harmless, and recorded so it is not mistaken for a leak |
  | `"course_3"` | reject | **the predicate change from revision 1.** The primary form never emits it; AL1 would need its own entry |
  | `"course_03"`, `"course_"`, `"COURSE_3"` | reject | the same, in every spelling |
  | `"401,402"` | reject | the comma-joined form that defeated the original count-plus-denylist |
  | `"course_3,course_4"` | reject | the same attack in the course form |
  | `"course_3_students"` | reject | the undocumented role-filtered form |
  | `"section_12"` | reject | a recipient form the design never uses |
  | `"group_4"` | reject | documented, never wanted |
  | `"uuid:W9GQ"` | reject | the form the documentation itself names |
  | `"401 402"`, `" 401 "` | reject | whitespace in any position |
  | `"401\n"`, `"401\n402"`, `"401\r"` | reject | **the newline-anchor attack. Verified by running it, not recalled: JavaScript's `$` without the `m` flag matches only end-of-input, unlike some other engines** |
  | `""` | reject | empty |
  | `"4e1"`, `"1e3"`, `"+401"`, `"-401"`, `"0x191"` | reject | numeric-looking non-digits |
  | U+0664 U+0665 U+0666 (Arabic-Indic digits, written here as code points because the Write tool materializes an escape into the literal character) | reject | `\d` without `u` is `[0-9]` here - confirmed by running it |

- **Instrument (c) - CARDINALITY AND DISTINCTNESS, in the builder.** For the
  `roster` variant the builder throws before emitting anything when the array is
  empty, when any two values are equal after the pattern check, or when the
  length exceeds `CONVERSATION_RECIPIENT_MAX = 100`. For the `user` variant it
  emits exactly one.

  - **The cap's provenance:** the documented default maximum (1.1), used as a
    conservative constant. A29 refuses at more than 100 even where an institution
    raised its own limit, and cannot detect one that lowered it (section 12).
  - **Why the builder AND the action both hold it:** the action refuses first
    with a user-facing category (S7 `over-recipient-limit`, `no-active-students`)
    so the instructor gets a sentence; the builder throws so a future caller that
    skips the action cannot get past it. Two instruments, one for the user and
    one for the tree.

- **Direction of failure:** anything other than a bare run of digits reaching the
  wire; a duplicate id reaching the wire (which would message one student twice
  and is K3's "each once"); an empty emission; more than 100 values.
  **It is an ALLOW-pattern: a form nobody thought of is rejected by default.** A
  denylist of prefixes is explicitly not acceptable; it is what Ruling 9 struck.

### S2 - the FROZEN emitted-parameter set, PER VARIANT, covering the URL as well as the body

Carries Ruling 12, Ruling 26 and **Ruling 30**. **This is the construction that
enforces section 1.3's `force_new` finding rather than leaving it remembered.**

- **Object:** the SET of parameter names every outbound conversation POST
  carries, in the body AND in the query string, **and the multiplicity of
  `recipients[]`**.

- **A CORRECTION TO REVISION 1'S EXPRESSION, and it would have shipped a wrong
  assertion.** Revision 1 wrote the instrument as
  `[...new URLSearchParams(body).keys()].sort()`. Under the N-id form that
  expression yields **N duplicate `recipients[]` entries**, so the equality it
  asserts is false for every real send. Measured:

  ```
  $ node -e 'const p=new URLSearchParams(); for(let i=0;i<100;i++) p.append("recipients[]", String(1000000+i));
             p.append("body","x".repeat(4000)); p.append("subject","A subject line of ordinary length");
             p.append("context_code","course_12345");
             console.log("distinct keys:", [...new Set(p.keys())].sort().join(","));
             console.log("raw keys length:", [...p.keys()].length);
             console.log("getAll recipients length:", p.getAll("recipients[]").length);
             console.log("total bytes:", Buffer.byteLength(p.toString(),"utf8"));'
  distinct keys: body,context_code,recipients[],subject
  raw keys length: 103
  getAll recipients length: 100
  total bytes: 6573
  ```

  **The key set is taken over `new Set(params.keys())`, and multiplicity is
  asserted separately with `getAll`.** The same run also measures the body: 6573
  bytes for 100 recipients plus a 4000-character body, so wire size is not a
  constraint here and no chunking is needed.

- **Instrument:** during a driven send, for every recorded conversation POST, all
  four of these hold.

  1. **Body, `roster` variant - THIS IS THE ONE THAT BINDS BY DEFAULT (Ruling
     30).** `[...new Set(new URLSearchParams(body).keys())].sort()` equals exactly

     ```
     ["body", "context_code", "recipients[]"]                           // no subject
     ["body", "context_code", "recipients[]", "subject"]
     ```

     **`force_new` is ABSENT, and its absence is asserted BY NAME as its own
     expectation** - `expect(keys).not.toContain("force_new")` beside the set
     equality - so the assertion that fails names the parameter the defect was
     about (1.3). Plus: `params.getAll("recipients[]")` has length N, every value
     matches `/^\d+$/`, and `new Set(values).size === values.length`.

  2. **Body, `user` variant - unchanged, and that is the point.** The same
     expression equals exactly

     ```
     ["body", "context_code", "force_new", "recipients[]"]              // no subject
     ["body", "context_code", "force_new", "recipients[]", "subject"]
     ```

     with `params.get("force_new") === "1"` and
     `params.getAll("recipients[]").length === 1`. **This clause is green against
     the shipped builder before a line of A29 exists, and it is what W1a step 1
     writes first (section 8).**

  3. **Body, `course` variant - WRITTEN NOW, BUILT ONLY IF AL1 IS ADOPTED (2.3).**

     ```
     ["body", "context_code", "recipients[]"]                           // no subject
     ["body", "context_code", "recipients[]", "subject"]
     ```

     with `params.getAll("recipients[]").length === 1`, that one value matching
     `/^course_\d+$/`, and `force_new` absent by name. Recorded here so the
     hazard travels with the specification.

  4. **URL, every variant** - `new URL(u).pathname` equals
     `/api/v1/conversations` and `[...new URL(u).searchParams.keys()]` is empty.

  **Green on arrival for clauses 2 and 4, measured by opening the builder**
  (`src/lib/canvas/inbox.ts:409`): the request is built against
  `${baseUrl}/api/v1/conversations` with all five parameters in the body and no
  query string.

- **Direction of failure:** an EXTRA key, in the body or in the query string, is
  the failure. This catches `mode`, `group_conversation`, `bulk_message`, and -
  newly and most importantly - `force_new` on the `roster` variant. A MISSING key
  is equally a failure, which is what keeps the legacy path byte-identical. A
  `recipients[]` multiplicity other than N, or a duplicate inside it, is a
  failure of clause 1 specifically.

- **The tree-wide walls, each re-measured this pass before being written down:**

  ```
  $ grep -rn "group_conversation\|bulk_message" src --include=*.ts --include=*.tsx | wc -l
  0
  $ grep -rn "force_new" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l
  1
  $ grep -rn 'recipients\[\]' src --include=*.ts --include=*.tsx | wc -l
  1        # canary: the pattern machinery finds a real occurrence, so the 0 above is a real absence
  ```

  Zero and one, with a canary. So a structure test may require
  `group_conversation` and `bulk_message` to stay at **zero** outside the
  frozen-set test itself, and `force_new` to stay at **exactly one non-test
  occurrence, in `src/lib/canvas/inbox.ts`**. Both are green on arrival, which
  Ruling 12 requires and which the original `mode` ban failed (444 occurrences).
  **`mode` is still NOT banned tree-wide**; clause 4 is what covers it.

### S3 - the transport returns a THREE-state result, and ambiguity defaults to `unknown`

Carries Ruling 5's "ambiguous failures are `unknown`, never `refused`". It is the
input S4 needs and the reason `createConversation`'s `void` return cannot be
reused.

- **Object:** the return value of the new transport function.

  ```ts
  export type ConversationPostResult =
    | { status: "accepted"; httpStatus: number; institution: CanvasInstitution }
    | { status: "refused"; httpStatus: number; institution: CanvasInstitution; reason: string }
    | { status: "unknown"; httpStatus: number | null; institution: CanvasInstitution; reason: string; cause?: unknown };
  ```

  (`CanvasInstitution` is already exported from `src/lib/canvas-core.ts:49`,
  opened this pass.)

- **Instrument:** the transport called against a mocked `canvasFetch` returning,
  in turn: 201; 400; 401; 403; 404; 422; 429; 500; 502; a thrown `TypeError`; and
  a promise rejecting with an abort/timeout.
- **Pass condition, by class:**
  - 2xx -> `accepted`.
  - 400, 404, 422 -> `refused`, carrying the status and a reason. **An over-limit
    refusal from Canvas lands here** (1.2), though S1's cap should have refused
    first.
  - 401, 403 -> `refused`, with the credential reason. 403 is NOT a throttle -
    `src/lib/canvas-throttle.ts` documents both readings and why a user-facing
    write uses the 429-only predicate `isCanvasRateLimitStatus`.
  - **429, any 5xx, any thrown network error, any timeout -> `unknown`.**
  - Anything not enumerated -> `unknown`. **The default arm is `unknown`.**
- **Direction of failure:** mapping any of {429, 5xx, network, timeout,
  unrecognised} to `accepted` **or** to `refused` is the failure, because both
  release S4's block. Mapping a 400/404/422 to `unknown` is a lesser failure (it
  blocks when it need not) and is also caught.
- **`createConversation` keeps its name, its signature and its behaviour**, and
  is re-implemented as a thin wrapper over the `user` variant: `accepted`
  returns; `refused` or `unknown` with an `httpStatus` throws
  `canvasError(httpStatus, institution)`; `unknown` with no `httpStatus` rethrows
  `cause`. **That is a behaviour claim a test must check, and there is no
  existing test to lean on (3.2), which is why W1a step 1 exists (section 8).**

### S4 - ONE durable send record, written BEFORE the POST, and an unknown outcome NEVER self-resolves

Carries Rulings 1, 2, 20, 21, 28 and **Ruling 32**. **A guard is still owed, its
hazard has changed, and its construction is the cheapest one named: one table,
one partial unique index, four functions, unknown leaves the row open.**

**The hazard, restated for one request as Ruling 32 requires.** A single request
either happened or did not - from Canvas's side. From the app's side there are
three outcomes, and the third is the hazard:

1. **Double click / two tabs / two devices.** Two invocations in flight. No
   partial state, but two whole-class sends.
2. **Refused (4xx).** Nothing went out. No hazard; the instructor retries.
3. **UNKNOWN. An unknown outcome on ONE synchronous request that can create up to
   a hundred conversations inside a server action, on an UNMEASURED duration
   default (OC5).** Our invocation is killed while Canvas is still working, or
   the response is 5xx, or the socket drops. **Canvas may have created every
   conversation, or none.** The instructor's natural next move - reload, send
   again - messages the whole class twice.

Hazard 3 is inherently cross-process: a killed Vercel function keeps nothing, and
the retry may land on another instance.
`20261016000000_lms_credential_save_attempts.sql` states exactly this in its own
header - an in-memory counter "resets on every cold start and is not visible to
any other concurrently running instance, which on this deployment (Vercel,
serverless) is equivalent to no limit at all". **So an in-memory guard is not a
guard, and `localStorage` is not one either**: it survives a reload and is shared
across tabs of one browser, but a cleared store, a second device or a second
browser defeats it, and it is client-writable -
`20261015000000_lms_credentials.sql`'s own reasoning, that a guard a signed-in
browser can write is not a guard. A disabled button and a `ta-` key are UI
niceties here, never the guard.

- **Object:** one Postgres table and the single module owning it.

  ```sql
  create table if not exists public.bulk_course_message_sends (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references auth.users (id) on delete cascade,
    course_id         text not null,
    canvas_course_url text not null,
    subject           text,
    body              text not null,
    recipient_ids     text[] not null,
    recipient_count   integer not null,
    excluded_summary  text,
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

  - **`recipient_ids` is NEW in this revision and it is the addressee receipt**
    (section 0). It holds the exact numeric ids that went on the wire, written in
    the same insert, so a later session can read back who was addressed. **It is
    not an outcome per recipient** and nothing may present it as one.
  - **No RLS policy for `authenticated`**, service-role access only - the
    `lms_credentials` convention (3.4).
  - **No column whose name matches `/email|address|login|name/`.** The app never
    reads or holds a student address under this design. `recipient_ids` holds
    Canvas numeric ids, which are not addresses - instrument (d) still asserts no
    stored value contains `@`, and that assertion is now MORE load-bearing,
    because this revision does store a per-student identifier.
  - **`state` stays TWO-VALUED, and Ruling 28 is why.** If "sent but outcome
    unknown" were a third state value, the row would fall out of the index's
    `where state = 'open'` predicate and **stop blocking**, reintroducing exactly
    what Ruling 21 closed. The outcome lives in `outcome`, never in `state`.
  - Idempotent DDL, because migrations auto-apply on push to main. **No
    apostrophe inside any `comment on ...` string unless doubled** -
    `src/supabase-migrations.structure.test.ts:156` is the gate (`"doubles every
    apostrophe inside a string literal"`, opened this pass) and `:147` catches a
    string left open at EOF. There is no local backstop.
  - Row types go in `src/lib/supabase/types.tables-c.ts`, beside
    `LmsCredentialSaveAttemptsRow` (opens at `:67`, opened this pass), in the same
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
  - `resolveOpenSend(id, choice: "dismiss" | "retried")` - sets `state='resolved'`
    and `resolution`, scoped `.eq("user_id", userId)`.

- **Instrument (a) - the ORDER of effects.** A driven send against a faithful
  in-memory store fake asserts the row exists with `state='open'` **and with
  `recipient_ids` already populated** before the first transport call, and
  reaches its terminal state before the action returns. **Fails when** the
  transport call is observed before the insert, or when `recipient_ids` is
  written after the POST - which would lose the receipt in exactly the unknown
  case it exists for.
- **Instrument (b) - THE CONSTRAINT, and a sequential test cannot see it.** Two
  `sendBulkCourseMessageAction` calls for the same `(user, course)` issued against
  the store fake with its insert barrier held, then released together. **Pass:**
  exactly one row exists, exactly one conversation POST was made, and the loser
  gets a refusal carrying the winner's record. **Fails when** two rows exist,
  which is what a read-then-write produces.
- **Instrument (c) - THE UNKNOWN BLOCK, which is Ruling 21 at one request.**
  Drive a send whose transport returns `unknown`. Then drop the module registry
  (`vi.resetModules()`, store retained - simulating the process death this guard
  exists for) and call `sendBulkCourseMessageAction` for the same course with a
  **different** subject and a **different** body. **Pass:** zero outbound
  requests; the refusal carries `kind: "open-send"`, the prior row's id, its
  `created_at`, its `recipient_count`, and **its own subject and body, not the
  caller's**; and the row is still `open` afterwards. **Fails when** the body
  differing changes the outcome (Ruling 1), or when the refusal echoes the
  caller's text instead of the stored row's (Ruling 25).
- **Instrument (d) - NO ADDRESS IS EVER STORED.** After a complete driven send
  against the store fake, dump every row the fake holds, flatten
  `recipient_ids`, and assert **no stored value contains `@`**. **The fixture is
  what makes this real and it is mandatory:** the roster fixture the send
  consumes must carry `login_id` and `email` values on the Canvas rows, both of
  which `/api/v1/courses/<id>/enrollments` can return. Paired with a structure
  assertion that the migration's `create table` block declares no column matching
  `/email|address|login|name/`. **The sabotage that must turn it red:** copy
  `entry.email` onto the insert, or into `recipient_ids`.
- **Direction of failure:** the failure this construction exists for is a second
  whole-class send after an unknown outcome. Its mirror - a row wrongly stuck
  `open` after an `accepted` response - costs the instructor one click to dismiss
  and is the safe direction.

**What is deliberately NOT here, each with the hazard it served:**

| Withdrawn from `a29-architecture.md` rev 2 | The hazard it served | Why that hazard is gone |
|---|---|---|
| `bulk_course_message_recipients` table | per-student state | There is no per-student OUTCOME to hold (section 0). The addressee list is one column, not a table |
| The select-then-update-BY-ID CAS claim (Ruling 23) | two invocations claiming the same student | There are no rows to claim; one invocation does all the work |
| The stale sweep and its caller (Ruling 24) | a killed invocation wedging rows at `sending` | A killed invocation leaves ONE row at `open`, which is the desired state - it blocks until resolved. Nothing needs reclaiming |
| The server-minted token (Ruling 8) | authorising N invocations from one confirm | There is one invocation. The guard is the row and `requireUser()` |
| The six-row poll classifier, `MAX_WAIT_POLLS`, `retryAfterMs` (Ruling 22) | "nothing claimable but rows still sending" | Unreachable: there is no second invocation to observe an in-flight first one |
| The browser pump hook | unbounded wall-clock over N requests | There is one request |

### S5 - the roster read DETERMINES THE RECIPIENTS, and the count BINDS

Carries K3, K4, E2 and K6's recipient half. **This is the construction Ruling 29
restored, and it is the largest single change in this revision: revision 1 called
this reader a disclosure, and it is now the source of the send itself.**

- **Object:** the reader's return value; the set the builder emits; and what the
  confirm's number means.
- **Endpoint:**
  `/api/v1/courses/<id>/enrollments?type[]=StudentEnrollment&per_page=100`,
  following `parseNextLink` through `assertCanvasSuppliedUrlIsSameOrigin` -
  **required**, because `src/lib/canvas-pagination-guard.structure.test.ts` counts
  CALL SITES, not files (`GUARD_MARKER = "assertCanvasSuppliedUrlIsSameOrigin"` at
  `:76`, the assertion `"never dials a remote-supplied next link without
  assertCanvasSuppliedUrlIsSameOrigin nearby"` at `:131`, both opened this pass).
  State is NOT filtered in the query; it is returned and classified in code, so
  one fixture exercises every state through one path **and the excluded rows are
  countable**, which E2 needs.
- **Pass condition:**
  - the reader returns `{ entries, complete }`; `complete` is `false` exactly when
    the loop exited with `next` non-null; every entry carries its `user_id` and
    its enrollment state; **each user id appears once**; only student-type
    enrollments are present;
  - **the recipient set is exactly `entries.filter(state === "active").map(user_id)`,
    deduped** - K3;
  - **`invited`, `inactive` and `completed` entries are excluded from that set and
    counted into `excludedSummary`** - E2;
  - **`recipientCount === recipients.length`, produced by this function and by no
    other** - K4, and it is the number the confirm shows and the number the send
    emits.
- **Instrument:** a mocked Canvas paginating (a) normally to `next === null` and
  (b) past `CANVAS_PAGINATION_PAGE_CAP` with `next` still non-null; and a page
  containing an active student, **the same student's second section enrollment**,
  an invited student, an inactive student, a concluded student, a teacher, a TA,
  an observer, a designer, and Canvas's test student. **The assertion is on the
  emitted `recipients[]` values**, not only on the reader's return, so the two
  cannot drift.
- **Fails when:** `complete` is true after a capped read; a user id appears twice
  in the emitted set; a non-student appears; an `invited` or `inactive` id appears
  in the emitted set; a state is missing from any entry; the emitted set and
  `recipientCount` disagree.
- **Direction of failure:** an id in the emitted set that should not be there
  (a student messaged who should not have been) is the worst; an id missing is
  next; silently reporting a capped read as complete is what produces the second.

- **A capped read is now a REFUSAL, not a note** (`roster-incomplete`, S7),
  reversing revision 1 for the reason at 3.3: an incomplete read no longer merely
  misleads the confirm, it omits students from the send.

- **WHAT THE COUNT MEANS, and this is a requirement on the copy.** The number in
  the confirm is **"active students this app will message"** - it binds. The
  `excludedNote` is **"roster rows excluded, and why"**, naming the state
  (invited / inactive / completed). **This clause is enforced by OC7 and OC8 as
  READING claims**, because no component is rendered by any test here and this
  seat does not propose a criterion whose only enforcer would be a render. **The
  binding itself is NOT a reading claim** - it is the pass condition above,
  asserted on the emitted values.

- **WHAT HAPPENS IF THE ROSTER READ FAILS. The design REFUSES, and under this
  revision the reason is no longer re-derived - it is structural.** Ruling 32
  said the refusal keeps its behaviour with its reason replaced, and revision 1's
  replacement reason was "the count is the only thing the instructor's
  confirmation was informed by". **Under the N-id form there is a stronger reason
  and it supersedes that one: without the roster read there are no recipients at
  all.** The send is not merely uninformed, it is impossible. The alternative
  revision 1 considered (send with `recipient_count = null`) is not even
  representable now.
  - **Instrument:** `sendBulkCourseMessageAction` on an admitted course with the
    roster reader mocked to throw. **Pass:** zero conversation POSTs, zero ledger
    writes, and a refusal whose `kind` is `canvas-unreachable` or `no-credential`
    per S7.

- **The removal test (L1), re-derived for the restored mechanism.** The deletion:
  replace the live enrollments read with any stored value -
  `course.studentRepos`, a cached list, a client-supplied array. **The assertion
  whose observed value changes:** over a fixture where the stored tile lists 5
  students and the live Canvas enrollments return 7 active, 2 invited and 1
  inactive (one of the 7 appearing twice across sections), the emitted
  `recipients[]` multiset is **exactly the 7 distinct active ids**,
  `recipientCount` is **7**, `excludedNote` names 2 invited and 1 inactive, and
  `roster_complete` is true. Swap in the stored list and the **emitted wire
  values** change - not just a number on a screen. **That is the difference from
  revision 1's removal test**, which observed only a count and a note, and it is
  why the claim is earned rather than asserted (section 10).

### S6 - the client receives scalars and rendered strings only, from ONE producer

Carries the A28 defect - two disagreeing counts on one screen - which the
re-scope does not change.

- **Object:** every value crossing the server-action boundary toward the browser.
- **Construction:** the action return types reference exactly one exported type
  whose fields are **scalars and pre-rendered strings only**:

  ```ts
  export type BulkSendSummary = {
    courseName: string;
    recipientCount: number;
    recipientsRendered: string | null;  // ONE server-rendered sentence, never an array
    rosterComplete: boolean;
    excludedNote: string | null;        // ONE rendered sentence, never a list
    outcome: "accepted" | "refused" | "unknown" | null;
    outcomeDetail: string | null;
  };
  ```

  **No array, no `Set`, no `Map`, no `length`-bearing field, and no per-student
  anything.** The browser is never given a collection, so no display can compute a
  count.
- **How the addressee receipt reaches the instructor without reopening A28.**
  `recipient_ids` lives on the row (S4) and is rendered **server-side** into
  `recipientsRendered`. The browser gets one string and one number, both from one
  producer. Handing the client the array would give it a second `.length` to
  disagree with `recipientCount`, which is the A28 defect exactly.
- **Instrument:** (1) a structure test asserting the type's declaration contains
  no `[]`, no `Array<`, no `ReadonlyArray<`, no `Record<`; (2) the single producer
  of `recipientCount` is the reader's dedup (S5), and no second function derives
  it.
- **Direction of failure:** the type gaining a collection-typed field; a second
  function deriving a count; a recipient list reaching the browser, because a list
  has `.length`.
- **Honest limit, stated rather than hidden:** a text scan cannot decide types, so
  a component that copies `summary.recipientCount` into a differently-named local
  and does arithmetic on THAT defeats any source-text scan. What it cannot defeat
  is the type itself: the client is never given a second number to add. Carried as
  RS13.

### S7 - the LMS gate and every refusal are SERVER-SIDE, derived from the stored row, and carry a CLOSED kind

Carries K1, K2, Ruling 11's second and third clauses and Ruling 26.

- **PROVENANCE:** the actions take a **course ID only** and derive identity from
  `getCourse(userId, courseId)` (3.5). A caller cannot send a linked-looking
  course, and **cannot supply a recipient** (S1's provenance clause).
- **The refusal is a closed discriminated union**, with a human sentence beside
  it; the component chooses its copy from `kind` and no branch reads the sentence:

  ```ts
  kind: "not-linked" | "needs-institution" | "no-credential"
      | "canvas-unreachable" | "canvas-refused" | "roster-incomplete"
      | "open-send" | "no-active-students"
      | "over-recipient-limit"   // NEW this revision - S1's cap, 1.2
      | "roster-changed"         // NEW this revision - 2.4
  ```

  plus a `satisfies Record<RefusalKind, string>` copy map so adding a kind without
  copy fails `tsc` rather than rendering blank.
- **Instrument (a) - the gate.** The action invoked directly (node-env, Canvas and
  the store mocked) **three times**, with the stored row set to: (1) no
  `canvasUrl`; (2) a `canvasUrl` and no `institution`; (3) both present. Count
  outbound requests and ledger writes per call.
  **Pass:** cases 1 and 2 make **zero** outbound requests and **zero** ledger
  writes and refuse with that category as a `kind`; case 3 is admitted. **Only two
  of the five `LmsConnectionStatus` categories are server-decidable (3.5), so
  requiring a case per category would be over-specification by three** - a test
  asserting a distinction the object under test cannot make.
  **Direction of failure:** admitting more courses than `canLms` admits, and any
  outbound request for an excluded course even if the action later returns an
  error. **The check is on REQUESTS MADE, not on the value returned.**
- **Instrument (b) - the two failures an instructor must be able to tell apart.**
  `prepare` on an admitted course, twice: (a) credential resolution mocked to
  throw - `resolveInstitution` (`src/lib/canvas-core.ts:126`) throws before any
  HTTP request; (b) `canvasFetch` mocked to reject with a network error, which can
  only happen after the credential resolved.
  **Pass:** `kindA === "no-credential"` and `kindB === "canvas-unreachable"` -
  **the CATEGORY is pinned, the sentence is not.** `reasonA !== reasonB` is
  explicitly NOT the assertion; two equally useless strings satisfy it.
  **Direction of failure:** the two producing the same `kind` - it sends an
  instructor to reconnect an account that is connected. A test that only compares
  strings is also a failure of this construction, because it passes when both
  kinds are absent.
- **Instrument (c) - the two NEW kinds, each with zero outbound requests.**
  (i) a roster fixture returning 101 active students -> `over-recipient-limit`,
  zero POSTs, zero ledger writes; (ii) a send whose passed-back `recipientCount`
  is 7 while the send-time read returns 8 -> `roster-changed` carrying both
  numbers, zero POSTs, zero ledger writes.
  **Direction of failure:** either case reaching a POST. **For (i) the mirror
  failure matters too** - refusing at 100 exactly, when the documented maximum is
  100 and not 99 - so the fixture runs at 99, 100 and 101 and only 101 refuses.
- **Why the categories are assignable rather than parsed:** the failures have
  different PRODUCERS. The category is set where the failure is caught, never
  parsed out of a message.
- **The display half stays READING** (OC6); the gate does not depend on it.

### S8 - no delivery claim, no per-student OUTCOME implication, and the honest limit is present

Carries P5 and Q5.

- **Object:** the summary type's state names and the result copy.
- **Instrument:** a structure test over the feature's file set for forbidden words
  in user-facing string literals, matched case-insensitively on a word boundary:
  `delivered`, `received`, `emailed`, **`sent`**.

  **`sent` is in the list because a progress line reading "Sent 5 of 11" passes a
  phrase-based list while claiming a delivery the app cannot observe.**

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
  result surface carries a sentence saying the app cannot confirm an email arrived
  and that each student's own Canvas notification settings decide whether one is
  sent; and, until OC2 is answered, nothing describes the subject field as the
  email's subject line.
- **The per-student clause, sharpened for this revision.** The UI **may** name the
  addressees - that is the restored receipt, and `recipientsRendered` is how it
  arrives (S6). The UI **may not** imply a per-student RESULT: no per-student
  accepted/refused/unknown, no "4 of 42", no progress bar over students. A
  source-text pin catches the forbidden words; it cannot catch a progress bar, so
  the per-student-outcome clause is routed to **OC8** as a READING claim and is
  stated here as a design requirement rather than pretended into a test.
- **Direction of failure:** the honest-limit sentence being ABSENT is a failure;
  its wording is READING. The pin is on the FACT and the forbidden words, never on
  a sentence's spelling.

### S9 - the capability wall measures REQUESTS, and no unattended module CALLS the send

Carries K11, K14 and Ruling 19 - the import instrument is withdrawn and stays
withdrawn.

- **Object:** (a) the set of distinct hosts requested during one complete driven
  send; (b) whether any module under the two unattended directories names the
  send.

- **Instrument (a) - TWO seams, both necessary:**
  1. **A recording `vi.stubGlobal("fetch", ...)`.** `vitest.setup.ts`'s own header
     says a test that installs its own `vi.stubGlobal` never sees the throwing
     stub, so this is the **only** seam that can observe a model host.
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
  `fetch("https://example.com")` inside the send path and confirming the test goes
  red, because the specific defect the original shipped was a failure arm that
  could never fire.

- **Why import closure cannot be the instrument, re-measured this pass:**

  ```
  $ grep -c "^export" src/app/actions.ts
  54
  ```

  54 `export *` lines over the whole actions directory, so any module importing
  anything from `@/app/actions` pulls a model-calling drafter into its closure.
  A29's own write set adds a 55th. Import closure cannot distinguish a send from a
  draft in this tree, for any module.

- **Instrument (b) - a CALL-SITE check, which is a question about identifiers.** A
  structure test walks every non-test `.ts`/`.tsx` under `src/lib/workflows/**`
  and `src/app/api/**` and asserts none contains the identifier
  `sendBulkCourseMessageAction` or `previewBulkCourseMessageAction` - the only two
  exports that can produce an outbound Canvas POST. A call requires the callee's
  name in the calling module.
  - **Green on arrival AND green after, both re-measured this pass:**

    ```
    $ grep -rn "BulkCourseMessage" src/lib/workflows src/app/api | wc -l
    0
    $ grep -rln "listCourseHubAction" src/lib/workflows src/app/api | wc -l
    122       # canary: the same walk DOES find an action name in those directories
    ```

    Zero today, with a canary proving the walker reaches those files. Green after,
    because section 8's waves write no path under either directory.
  - **The one way an identifier check can be defeated, checked rather than
    assumed:**

    ```
    $ grep -rn 'import \* as [A-Za-z_$]* from "@/app/actions"' src --include=*.ts --include=*.tsx
    (no output; exit 1)
    ```

    No module namespace-imports the actions barrel, so there is no name-indexed
    dispatch to route around the check. **The test asserts that absence too, in the
    same file**, so the assumption fails loudly instead of rotting.

- **Instrument (c) - the workflow step registry, already executing.** An
  unattended sender would have to be a workflow STEP.
  `src/lib/workflows/headless.test.ts:186` pins `HEADLESS_SAFE_STEP_TYPES.size` at
  **154** (`expect(HEADLESS_SAFE_STEP_TYPES.size).toBe(154);`, opened this pass).
  A29 adds no step type, so that number must be 154 before and after. A wave that
  bumps it has added an unattended path and must say why.

- **Direction of failure:** a workflow step or a route handler reaching the send.
  **Explicitly NOT a failure:** A29 appearing in some module's import closure. It
  will, the moment it is exported from the barrel, and that fact carries no
  information.

### S10 - the body leaves as plain text

Carries K10.

- **Object:** the `body` parameter of every outbound request.
- **Instrument:** a send whose body was produced by A21's Markdown drafter
  (headings, bold, a list), plus one hand-written body containing `<p>` and
  `**bold**`.
- **Pass condition:** the bytes on the wire equal the bytes on the stored row, and
  the send path performs **no** Markdown-to-HTML conversion anywhere.
- **Fails when:** the send path imports or calls any Markdown or HTML conversion
  helper; or the wire body differs from the stored body.
- **Direction of failure:** the failure is the app CONVERTING. Whether Canvas
  renders Markdown literally is OC4. The drafter reused is
  `draftAnnouncementAction` (3.6), which asks the model for plain text.

### S11 - the instructor's text cannot be lost

Carries K13 and Ruling 25, simplified because there is one request.

- **Construction:** subject and body live in two places. **Client:** per-course
  `ta-` localStorage keys - `ta-bulk-msg-subject-<courseId>` and
  `ta-bulk-msg-body-<courseId>` - satisfying the standing rule that every new text
  input persists across reloads, and per-course so a draft for course X cannot
  pre-fill course Y. **Server:** on the `bulk_course_message_sends` row from
  `beginSend` onward (S4), which is what makes the unknown-outcome case
  recoverable.
- **Instrument:**
  1. A refusal that writes no row (no LMS link, roster read failed, over the
     limit, roster changed): the local draft is untouched and the refusal carries
     no text.
  2. **The reload case.** Drive a send to `unknown`, drop the module registry, then
     call the send again for the same course with a **different** subject and body.
     **Pass:** the refusal carries the FIRST send's subject and body verbatim -
     this is S4's instrument (c) plus one assertion, and it is the executing form
     of "the modal repopulates".
  3. An `accepted` outcome: the local draft is cleared **then, and only then**.
  4. A `refused` or `unknown` outcome: the local draft is **kept**.
- **Direction of failure:** any path that clears the local draft while the server
  does not hold the same text, and a refusal that returns the caller's own text
  instead of the stored row's.
- **Never persisted client-side:** the send record's id, the recipient id list,
  and anything that authorises a send.
- **What this does NOT give the instructor, stated rather than implied:** the text
  comes back only when something calls `preview` or `send` for that course. A
  reload that never opens the modal shows no sign that a send is unresolved.
  Closing that needs a per-course badge in the courses fan-out; this pass does not
  invent one. Carried as RS14.

---

## 5. The layers, and the file that CALLS each one

**THE SURFACE IS A LAYER.** T6 is not a garnish; it is the layer that makes T1-T5
reachable, and it ships in the same chunk. Ids are `T1-T6` so as not to collide
with the criteria's `L1`.

| T | What it is | New/changed files | **Called by** |
|---|---|---|---|
| T1 | Canvas transport: the closed audience union, the emitted-value allow-pattern and cardinality cap, the per-variant parameter set, the three-state result (S1, S2, S3) | `src/lib/canvas/inbox.ts` (add `postConversation`, re-implement `createConversation` over it); re-export in `src/lib/canvas.ts` | T4's send action; `sendCanvasMessageAction` (existing, unchanged) for the `user` variant |
| T2 | Roster reader with enrollment state, completeness, once-per-student, and the active/excluded split (S5) | `src/lib/canvas/listings.ts` (add `listCourseEnrollmentRoster`); re-export in `src/lib/canvas.ts` | T4's preview and send actions |
| T3 | The durable send record: migration (incl. the partial unique index and `recipient_ids`) + the ONE owning module + row types (S4) | `supabase/migrations/20261021000000_bulk_course_message_sends.sql`; `src/lib/bulk-course-message/sends.ts`; `src/lib/supabase/types.tables-c.ts` | T4, all three actions |
| T4 | Server actions: **THREE** - `previewBulkCourseMessageAction`, `sendBulkCourseMessageAction`, `resolveBulkCourseMessageSendAction`. Guard: **`requireUser()` written explicitly** (3.6) | `src/app/actions/bulk-course-message.ts`; one `export * from "./actions/bulk-course-message";` line in `src/app/actions.ts` | **`src/app/components/courses/BulkCourseMessageModal.tsx`** (T6) |
| T5 | Pure client helper: the arm signature, the `RefusalKind` copy map, and `canOfferBulkMessage(course)` | `src/app/components/courses/bulkCourseMessage.ts` | T6 |
| T6 | **THE SURFACE.** A modal: subject, body, optional "Draft with AI" calling `draftAnnouncementAction`, the message-vs-announcement facts (K12/OC8), the confirm showing the binding count and the excluded note, the honest-limit sentence (S8), the unresolved-send resolution choice (S4) | `src/app/components/courses/BulkCourseMessageModal.tsx` (NEW) | **`src/app/components/courses/CourseRow.tsx`** |

**`src/app/actions.ts` is a barrel and is NOT counted as a caller.** Ruling 13.

**Why there is no hook file.** The pump is gone, so there is nothing to pump and
the modal calls the three actions directly. The logic that genuinely needs testing
- the arm signature and the refusal-to-copy map - lives in T5, a plain `.ts` leaf,
because vitest collects only `src/**/*.test.ts` and **no component is rendered by
any test here**, so anything left inline in the `.tsx` cannot be tested at all.

**The arm signature is NOT the confirm, and the distinction matters.** Ruling 2
struck a client-side signature the server recomputes from what the client sends,
because that proves nothing was confirmed. T5's signature is a pure
`bulkMessageArmSignature(courseId, subject, body)` in the shipped
`messageDraftArmSignature` / `isConfirmArmed` idiom, and its only job is to disarm
the confirm when the instructor edits the text after arming. **The server's guard
is S4's row plus `requireUser()`**, and it does not consult the signature. The
separate `recipientCount` comparand (2.4) is likewise not an authorisation - it
can only cause a refusal.

**Where the instructor reaches it, wiring opened rather than assumed.** Courses tab
-> the LMS column's hamburger menu on a course row -> "Message all students".
`cellMenuFor` (`CourseRow.tsx:186-188`) builds every column's menu with exactly
one item today, and the LMS cell takes it at `:314`; W2 gives it a second item for
the `lms` column only, whose `disabled` / `disabledReason` are driven by `canLms`
and `lmsConnectionStatusFor`'s category, and `CellMenu`'s
`disabledItemsFocusable: true` keeps the disabled item keyboard-reachable so the
reason is announced (3.5). **Click counting is the UX seat's, not this seat's** -
this section names the reach path only.

Alternative homes considered and rejected: Drafts > Messages
(`MessageDraftsTab.tsx`) is per-draft and carries no course context; a new tab
spends a whole surface on one action. `useCourseImportActions.ts` (608 lines) is
not extended: its seven `canLms`-gated actions are one-shot server calls with no
durable record and no confirm, and adding A29 would mix two lifetimes and push the
file toward the ceiling. The gate check is copied from there, not re-derived.

**A design constraint with a reason: T6 adds NO class to
`src/app/page.module.css`.** It styles with MUI components and `sx` props only.
Two reasons, both measured concerns rather than taste: that stylesheet is a shared
file no wave should touch for one modal, and
`src/app/components/courses/page-module-css-classes.test.ts` and its
`-orphan-classes` sibling both read it as source text, which would pull two more
walkers into this feature's `owns` set for no benefit.

**A liability this design accepts and names:** `CourseRow.tsx` is 694 and
`CoursesTable.tsx` is 792 (3.1). W2 adds roughly a menu item and a conditional
render to `CourseRow.tsx`. If the as-built diff puts either over 900, the
extraction is owed **before** the wave is verified. Carried as RS5.

---

## 6. The state machine - TOTAL, and it is eight rows

Ruling 22 requires every reachable combination to have an outcome. With one
request there are eight, and they are ordered; the first match wins. **Two rows
are new in this revision** and both come from the app now owning the recipient
set.

| # | Event and condition | Outbound | Ledger effect | Returned |
|---|---|---|---|---|
| 1 | `preview(courseId)`, stored row fails `canLms` | **none** | **none** | refusal, `kind: "not-linked"` or `"needs-institution"` (S7) |
| 2 | `preview`, an `open` row exists for (user, course) | **none** | **none** | refusal, `kind: "open-send"`, carrying that row's id, `created_at`, `recipient_count`, `outcome`, **and its subject and body** (S11) |
| 3 | `preview`, admitted | roster GETs only | **none** | `{ courseName, recipientCount, recipientsRendered, rosterComplete, excludedNote }`; or refusal `no-active-students` when the active count is 0; or `roster-incomplete` when the read was capped (S5); or `no-credential` / `canvas-unreachable` when the roster read fails (S7) |
| **4 (NEW)** | `send`, gate passes, roster read succeeds, **active count > 100** | **none** | **none** | refusal, `kind: "over-recipient-limit"`, carrying the count (S1 cap, 1.2). **Never fires for this owner's courses, and that is the point** |
| **5 (NEW)** | `send`, gate passes, roster read succeeds, **the send-time count differs from the confirmed count** | **none** | **none** | refusal, `kind: "roster-changed"`, carrying both numbers (2.4) |
| 6 | `send(courseId, subject, body, confirmedCount)`, all checks pass, INSERT wins | **exactly one** conversation POST carrying N ids | `beginSend` INSERT (`open`, with `recipient_ids`) **before** the POST; `settleSend` after: `accepted`/`refused` -> `resolved`; **`unknown` -> stays `open`** | `BulkSendSummary` with `outcome` set |
| 7 | `send`, INSERT loses the unique index | **none** | **none** | refusal, `kind: "open-send"`, carrying the winner's record - identical in shape to row 2, so two tabs confirming at once see the run that actually exists rather than starting a second one |
| 8 | `resolve(sendId, "dismiss" \| "retried")`, the row is `open` and `.eq("user_id", ...)` matches | **none** | `state='resolved'`, `resolution` set | `{ ok: true }` |

**Row 6's `unknown` arm is where the guard lives**, and it is the only way a row
stays `open` past its own invocation. Only row 8 clears it, and only the
instructor can trigger row 8. **The app never discharges an unknown outcome on the
instructor's behalf** - Ruling 21, at one request.

**Why `refused` does NOT block, restated because the reason survived the
re-scope.** Revision 2 of `a29-architecture.md` kept `refused` in the blocking set
because a partial outcome of 5 accepted and 3 refused meant a naive retry would
re-message the five. **There is still no partial outcome.** A `refused` response
means Canvas took nothing, so the natural retry is correct and requiring a click
to clear it would spend a click for nothing. `accepted` resolves itself for the
same reason: there is nothing left to decide.

**What the instructor sees for an unresolved row, and why both choices are
explicit:** "A message to <course> on <date>, addressed to <N> students, did not
report back. Canvas may have created them. Its text was: <subject/body>." Two
controls - **"It went out, clear this"** (`dismiss`) and **"Send again anyway"**
(`retried`, which resolves the row and lets the next send through, and does not
itself send). Neither is a default, and neither is a boolean a component can always
pass as true (Ruling 3): both are a server-issued resolution of a specific row by
id.

---

## 7. `owns` - every file that must be run or read when this lands

Derived, not recalled: (a) the write set; (b) every existing test asserting on
changed behaviour; (c) **every test that reads source files as TEXT**, because a
test that greps a string it does not own is how a correct change goes red.

### 7.1 The commands, with their output pasted

```
$ grep -rl "readdirSync" src --include=*.test.ts | wc -l
39
$ grep -rl "readdirSync" src --include=*.test.ts | grep -c "no-emojis"
1        # canary: src/lib/no-emojis.test.ts is expected and present
```

39 whole-tree walkers exist. The subset that reads THIS feature's files as text,
re-measured this pass:

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

**Both lists are byte-identical to revision 1's, re-run rather than copied** - the
write set did not change shape under the re-scope, only what the code does.

**`src/lib/canvas/inbox.test.ts` appears in the first list and NOT in the second,
and that is the finding**: it reads `canvas/inbox` but contains zero occurrences
of `createConversation` (3.2). The builder being re-implemented has no behavioural
test anywhere. **Ruling 31 makes writing it W1a step 1** (section 8), not a
residual.

### 7.2 The walkers that will actually bind

| Walker | What it demands of A29's new files |
|---|---|
| `src/app/actions/action-guard-coverage.test.ts` | Each of the **three** new `"use server"` exports needs its request guard **in its own body**; `GUARD_CALL` at `:61` is `/\brequire(Owner\|User\|AppOwner)\s*\(/`, and `:406` rejects relying on the `requireOwner` alias (both opened this pass), so per 3.6 that guard is `requireUser()` written explicitly |
| `src/lib/use-server-exports.test.ts` | `bulk-course-message.ts` may export **only async functions** - no type re-export, no const. This is the one that `next build` alone otherwise catches |
| `src/lib/canvas-pagination-guard.structure.test.ts` | T2's `parseNextLink` follow must dial the value `assertCanvasSuppliedUrlIsSameOrigin` RETURNS (`GUARD_MARKER` at `:76`, assertion at `:131`). It counts CALL SITES, not files |
| `src/file-size-ceiling.structure.test.ts` | Every touched file stays under 1000 (3.1, RS5) |
| `src/supabase-migrations.structure.test.ts` | The new migration must be lexically well-formed SQL: **every apostrophe inside a string literal doubled** (`:156`), nothing left open at EOF (`:147`). **This is the gate with no local backstop - migrations auto-apply on push** |
| `src/lib/client-state-sweep.registry.test.ts` | Any module-scope cache the feature introduces must register or carry a defended reason (`:133`); the two `ta-` draft keys must be sweepable |
| `src/lib/canvas-client-boundary.test.ts`, `.transitive.test.ts`, `src/lib/module-graph/runtime-import-graph.test.ts` | T5 and T6 are client modules. Nothing in their closure may reach `src/lib/supabase/**` except `lib/supabase/client.ts`. **T3's owning module must never be imported by T5 or T6 - only by T4** |
| `src/lib/no-emojis.test.ts` | Owns the emoji rule. Do not hand-roll a scan |
| `src/source-bytes.structure.test.ts` | Owns the escape/BOM/mojibake scan. A `\uXXXX` written through the Write tool lands as the literal character |
| `src/tools/vitest-paths/gate-commands.structure.test.ts` | Any gate command this feature adds must use the `test:paths` wrapper (`package.json:18`, opened this pass) |
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

### 8.1 W1a IS ORDERED, AND ITS FIRST STEP IS A TEST. This is Ruling 31.

**`createConversation` has no behavioural test (3.2, 7.1), and that blocks
reuse.** The `force_new` defect is exactly what a parameter-level test catches and
a reading does not - it was found by reading Canvas's controller source, which is
not a method that scales. So W1a runs in this order, and the order is the
requirement:

1. **STEP 1, BEFORE ANY EDIT TO `src/lib/canvas/inbox.ts`.** Write, in
   `src/lib/canvas/inbox.test.ts`, a behavioural test of the SHIPPED
   `createConversation`, **against the EMITTED PARAMETERS**:
   - `[...new Set(new URLSearchParams(body).keys())].sort()` equals
     `["body","context_code","force_new","recipients[]"]`, and the same with
     `"subject"` when a subject is passed;
   - `params.get("force_new") === "1"` - asserted by name;
   - `params.getAll("recipients[]")` has length 1 and equals the id passed in;
   - `params.get("context_code")` equals `course_<the id parsed from courseUrl>`;
   - `new URL(requestedUrl).pathname === "/api/v1/conversations"` and its
     `searchParams` are empty;
   - a non-ok response throws, one case per status class (400, 401, 403, 404, 422,
     429, 500);
   - an empty body throws before any request is made.
   It mocks `canvasFetch`, **never real `fetch`** - `vitest.setup.ts` throws on a
   real fetch, and a live 401 has previously made a sabotage check pass here.
2. **STEP 2 - PROVE THE TEST CAN FAIL, before trusting it.** Delete the
   `force_new` append at `src/lib/canvas/inbox.ts:406`, run the file, confirm the
   `force_new` assertion goes RED, restore from a **copy** (not
   `git checkout --`, which reverts to the index and destroys the chunk's
   uncommitted work). Record the before/after counts. A test written against code
   that already passes it is not yet an instrument.
3. **STEP 3** - add `postConversation`, the `ConversationAudience` union, the
   allow-pattern, the cardinality cap and the three-state result (S1, S2, S3);
   re-implement `createConversation` as the `user`-variant wrapper.
4. **STEP 4 - RUN STEP 1's TEST UNCHANGED.** It must still pass, byte for byte, on
   the same assertions. **That is the behaviour-preservation proof**, and it is the
   whole reason step 1 comes before step 3 rather than after: a test written after
   the refactor is a tautology (this repo has shipped that failure - consolidating
   two implementations makes the test comparing them vacuous).
5. **STEP 5** - add `listCourseEnrollmentRoster` (S5) and the `roster`-variant
   frozen-set test (S2 clause 1) in
   `src/lib/canvas/conversations-post.structure.test.ts`.

### 8.2 The waves

| Wave | Write set (exact paths) | **Contains its caller?** |
|---|---|---|
| **W1a - Canvas libs** (ordered, 8.1) | `src/lib/canvas/inbox.ts`; `src/lib/canvas/listings.ts`; `src/lib/canvas.ts`; `src/lib/canvas/inbox.test.ts`; `src/lib/canvas/listings.test.ts`; `src/lib/canvas/conversations-post.structure.test.ts` (new) | **PARTIAL - explicit exemption.** `createConversation`'s existing caller chain (`sendCanvasMessageAction` -> `postMessageDraftAction`) is live and must stay green, and `src/lib/canvas.ts` is the re-export wiring file. But `postConversation`'s **`roster` variant** and `listCourseEnrollmentRoster` have **no caller until W2**. **W1a may not be pushed alone** |
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

**Wave gate commands.** Each wave runs only its own paths, **through the
`test:paths` wrapper because each names two or more paths** - a raw multi-path
`vitest` run silently drops any argument it does not match and exits 0 - and **the
exit code is read from a file, never from a pipe** (`| tail` makes `$?` the exit
code of `tail`):

```
# W1a
npm run test:paths -- src/lib/canvas src/lib/canvas.pullback.test.ts > w1a.log 2>&1; echo $? > w1a.code
# W1b
npm run test:paths -- src/lib/bulk-course-message src/supabase-migrations.structure.test.ts > w1b.log 2>&1; echo $? > w1b.code
# W2
npm run test:paths -- src/lib/bulk-course-message src/app/actions/bulk-course-message.test.ts src/app/components/courses > w2.log 2>&1; echo $? > w2.code
```

Log and code files go in the scratchpad, **never in the repo root**. The full suite
runs at the chunk's gate regardless, and so do
`npx tsc --noEmit --incremental false` (never the bare form, never with file
arguments), `npm run lint`, and the `Compiled successfully` line from
`npm run build` - the last is the only gate that catches a `"use server"` module
exporting a non-async binding.

**Gate every wave with `git status --short` against the assignment**, and check
that no `.claude/worktrees` copy was edited instead of the real tree.

---

## 9. Disposition - every prior requirement, kept / handed over / withdrawn

Two tables, because this revision restructures a prior version of ITSELF as well
as inheriting from `a29-architecture.md` revision 2. **The "Now" column in both
was re-derived LAST, after S1-S11, T1-T6, W1a/W1b/W2, OC10/OC11 and RS1-RS15 were
all final.**

### 9.1 What Ruling 29 REVERSED in revision 1 of this file

This is the table the ruling required: it carries the consequences rather than
flipping a label.

| Revision 1 said | Ruling | Now | Where |
|---|---|---|---|
| `recipients[]=course_<id>` is the primary form | 29 | **REVERSED.** N explicit numeric ids is primary | 0, 2.2, S1 |
| The N-id form is a fork (RS1), recommended but not adopted | 29 | **ADOPTED.** RS1 now holds the course-audience form as the alternative instead | 2.3, RS1 |
| **K3** HANDED OVER to OC10, "no longer satisfiable by this app" | 29 | **BACK, and BEHAVIOURAL.** The emitted set is exactly the distinct active-student ids from the send-time read | **S5** pass condition; **S2** clause 1 |
| **E2** WITHDRAWN as moot, "no exclusion mechanism exists" | 29 | **BACK, and BEHAVIOURAL.** `invited`/`inactive`/`completed` are excluded from the emitted set and counted into the note | **S5** |
| **K6** recipient half WITHDRAWN | 29 | **RESTORED, with its limit stated**: the emitted set is always a live send-time read; drift from the confirm is refused, best-effort | **2.4**, **S5**, RS15 |
| The leverage claim is WITHDRAWN outright; GUARANTEED not earned | 29 | **RE-EARNED**, with what it does and does not guarantee enumerated line by line | **section 10** |
| The confirm's count is a DISCLOSURE | 29, 32 | **BINDING on the send** (it is the size of the emitted set). Ruling 32's "the count is a disclosure" applied to the course form and is superseded for the N-id form by the ruling that took the N-id form; the DISCLOSURE reading survives only inside AL1 | **S5**, **S6**, 2.3 |
| A capped roster read is a note, "an undercount misleads the confirm, it does not change who receives" | 29 | **REVERSED to a REFUSAL** - it now omits students from the send | **S5**, S7 `roster-incomplete` |
| The allow-pattern is `/^(?:\d+\|course_\d+)$/`, defence in depth | 29, 30 | **TIGHTENED to `/^\d+$/` and made LOAD-BEARING**, because the roster variant carries caller data where the course variant carried none | **S1** |
| The frozen set's key expression is `[...keys()].sort()` | 30 | **CORRECTED** - that yields N duplicates under the N-id form. Distinct key set plus a separate `getAll` multiplicity assertion | **S2** |
| The `course` variant's frozen set is the one that binds | 30 | **The `roster` variant's set binds by default**; the `course` set is written but unbuilt | **S2** clauses 1 and 3 |
| RS8 - the builder has no test - is a RESIDUAL | 31 | **PROMOTED to W1a step 1**, with a sabotage step proving it can fail, before any edit to the builder | **8.1** |
| OC10 decides whether the feature does what the owner asked | 29 | **RE-AIMED and demoted.** It now calibrates the reader's state classification; its worst answer is a one-line fix | **1.6** |
| The double-send guard, its hazard, and its construction | 32 | **CARRIED UNCHANGED**: one table, one partial unique index, four functions, unknown leaves the row open; in-memory and localStorage disqualified with the in-repo reasoning | **S4** |
| The roster-read-failure refusal keeps its behaviour, reason replaced | 32 | **BEHAVIOUR KEPT; the replacement reason is itself superseded by a stronger one** - without the read there are no recipients at all | **S5** |

### 9.2 `a29-architecture.md` revision 2's constructions

| Prior | Carried criterion / ruling | Disposition | Now |
|---|---|---|---|
| C1 (a) one recipient, allow-pattern | P4, Ruling 9 | **KEPT, and the predicate returns to the shipped one.** N values, each `^\d+$`, deduped, capped at 100, checked inside the builder | **S1** |
| C1 (b) frozen parameter set | Ruling 12, 26, 30 | **KEPT and EXTENDED** to three variants with the roster variant binding by default, and the key-set expression corrected | **S2** |
| C2 three-state transport result | Ruling 5 | **KEPT unchanged.** `unknown` is the single most load-bearing value in the design | **S3** |
| C3 durable ledger before the first request | Ruling 2, 20 | **KEPT, one table not two**, plus a `recipient_ids` column that is the addressee receipt | **S4** |
| C3 instrument (c) no address stored | P7 | **KEPT, and STRENGTHENED**: the flatten now covers `recipient_ids`, because this revision does store a per-student identifier | **S4** (d) |
| C4 double-send guard keyed on the course | Ruling 1, 32, K9 | **KEPT.** One INSERT under one partial unique index | **S4** |
| C5 no countable collection, one summariser | K8, Ruling 3, 11 | **KEPT, shrunken.** The partition-per-state assertion stays **WITHDRAWN with the states it partitioned** - there are no per-student outcomes to partition. The scalars-only pin survives and now also covers the receipt, which is rendered server-side | **S6** |
| C6 the pump, by-id claim, stale sweep | Ruling 14, 23, 24 | **WITHDRAWN entirely.** Hazards each named in S4's table. No enforcer is left unowned: the two-tab race is covered by S4's unique index, whose instrument (b) is the same barrier test | - |
| C7 the token authorises the attempt | Ruling 8 | **WITHDRAWN.** It authorised N invocations from one confirm; there is one invocation. **Its protected enforcer - "one confirm produces one send" - is HANDED OVER to S4's unique index**, which is strictly stronger because it binds across tabs and processes | **S4** |
| C8 roster read: state + completeness | K3, K4, E2 | **KEPT, and its MEANING is UPGRADED** - it determines the recipients, not just the disclosure. This is the reversal of revision 1's downgrade | **S5** |
| C9 the text cannot be lost | K13, Ruling 25 | **KEPT.** The refusal carries the stored row's text; there is no resume to destroy | **S11** |
| C10 plain text on the wire | K10 | **KEPT unchanged** | **S10** |
| C11 honest limit, no delivery claim | P5, Q5 | **KEPT and SHARPENED**: naming addressees is allowed (it is the receipt); implying a per-student OUTCOME is not | **S8** |
| C12 capability wall over REQUESTS | K11, Ruling 4, 7, 10, 19 | **KEPT unchanged**, both seams and the sabotage check | **S9** |
| C13 server-side LMS gate | K1, Ruling 11, 26 | **KEPT unchanged**, including the three-case enumeration and the server-derived provenance | **S7** |
| C14 distinct refusal categories | K2, Ruling 11, 26 | **KEPT and EXTENDED** by two kinds, each with its own zero-outbound instrument | **S7** |
| C15 no unattended module CALLS the send | K14, Ruling 19 | **KEPT unchanged**; the two guarded identifiers are A29's new two exports | **S9** |
| K2's first clause (no outbound after a failed roster read) | K2, Ruling 32 | **KEPT; its reason is now structural** rather than re-derived: no read means no recipients | **S5** |
| Section 6.1's six-row pump classifier | Ruling 22 | **WITHDRAWN**, replaced by section 6's eight-row event table, total over the events that now exist | section 6 |
| The pump hook | Ruling 13 | **WITHDRAWN.** The modal calls the actions; the testable logic lives in T5, a plain `.ts` leaf | **T5**, **T6** |
| `finishBulkCourseMessageAction` | Ruling 25 | **Stayed deleted.** Three actions, not four | **T4** |
| OC3 (`bulk_message` accepted?) | - | **WITHDRAWN.** Never sent under any branch | - |
| OC9 (how many courses over 100?) | Ruling 18, 27 | **CLOSED** by the owner, 2026-09-23 | - |
| OC1, OC2, OC4, OC5 | Q5, 2.1 | **KEPT.** OC5 decides how often the unknown outcome fires | 1.6 |
| OC6, OC7, OC8 | OV2, OV3, K12 | **KEPT**, with OC7 extended to the count's meaning under a BINDING count, and OC8 to the per-student-outcome implication | 1.6 |
| RA1, RA3, RA5-RA11, RA13, RA14 | - | **CARRIED** as RS2, RS4, RS5-RS7, RS9-RS11, RS13, RS14 - **except RA8, which became RS8 and is PROMOTED out of the register into W1a step 1** (Ruling 31, 8.1). RA12 (the "77") stays **CLOSED**: its instrument is withdrawn with the import check | section 11, **8.1** |
| RA2 / E4 (the leverage three-way call) | Ruling 29 | **ANSWERED BY THE OWNER, not by this seat.** Ruling 29 took the Redesign branch; section 10 states the claim that branch earns. RS3 is closed | **section 10** |
| Ruling 21 (no self-resolution) | - | **KEPT in a reduced form**, and its extension to `refused` stays **withdrawn with its reason stated**: there is no partial outcome for a retry to duplicate | **S4**, section 6 |
| Ruling 28 (state stays two-valued) | - | **KEPT and still load-bearing.** The outcome lives in `outcome`, never in `state`, or the row falls out of the index predicate and stops blocking | **S4** |
| Ruling 30 (per-variant frozen set) | - | **APPLIED, and the default reassigned** to the roster variant | **S2** |
| Ruling 31 (the builder's missing test) | - | **APPLIED as a wave step, not a residual**, with a sabotage step | **8.1** |

---

## 10. Leverage - the claim, re-earned, and exactly what it does not cover

**Trigger fired: feature work.** A claim is owed. Revision 1 withdrew it because
the course-audience form had no mechanism to claim. **Ruling 29 restored the
mechanism, so the claim is restored - and a restored claim has to be stated
precisely enough to be attacked, which is what this section does.**

### The class, and what it rests on

**Class: GUARANTEED** (`docs/loop/leverage.md`) - an output property the code holds
regardless of what the model returns, including by making no model call at all.

**The claim, in one paragraph.** When an instructor sends a course-wide message,
the `recipients[]` values that leave this app are **exactly the distinct Canvas
user ids of the course's active `StudentEnrollment` rows, read live from Canvas
inside the same server invocation that posts them, each id exactly once, with
invited, inactive and completed enrollments excluded and counted, and with an
incomplete read refusing rather than under-sending.** No stored roster, no cached
count, and no client-supplied identifier can reach the wire: the action's only
recipient-bearing input is a course id, the ids are parsed from Canvas's own
response, and the builder's allow-pattern, dedup and cap are the last statements
before the body is serialised. **What the instructor does instead today** is open
Canvas's own compose, type a recipient token or pick names by hand, and take on
faith that the audience it expands to is the one they meant - with no record
afterwards of who was addressed.

### Is it EARNED or INHERITED? The count that decides it

`leverage.md`'s failure mode B: grep the mechanism against every comparable
module. The mechanism here is "the emitted recipient set is derived from a live
read in the same invocation". Measured:

```
$ grep -rn 'recipients\[\]' src --include=*.ts --include=*.tsx | wc -l
1
$ grep -rn "force_new" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l
1
```

**One** conversation-POST builder exists in the whole tree, it takes exactly one
recipient, and it has no live-read provenance at all - the id arrives from a
stored message draft through `src/app/actions/messaging.ts:301`. There is no
shared import, no route wrapper and no platform default that gives a module this
property. **A29 has to build it, so the class is earned, not inherited.**

### The removal test

**S5's**, and it is a removal test by `leverage.md`'s own procedure - state the
deletion, then trace the assertion:

- **The deletion:** replace `listCourseEnrollmentRoster`'s live call with any
  stored value (`course.studentRepos`, a cached list, a client-supplied array).
- **The assertion whose observed value changes:** the **emitted
  `recipients[]` multiset**. Over S5's fixture - stored tile lists 5, live Canvas
  returns 7 active (one across two sections), 2 invited, 1 inactive - the wire
  carries the 7 distinct active ids before the deletion and the 5 stored ones
  after. The count and the note change too, but **the wire values are the
  assertion**, which is what makes this a removal test rather than a test of a
  label on a screen. Revision 1's version observed only the count, and
  `leverage.md` names that exact shape as a candidate that looks like a removal
  test and is not.

### What it does NOT guarantee - enumerated, because a claim this shape invites over-reading

1. **NOT that the set equals what the confirm showed.** The confirm's number came
   from the preview's read; the send performs its own. Drift is refused
   best-effort against a client-supplied comparand (2.4), which a lying client can
   suppress - it can only suppress the REFUSAL, never change who is messaged
   (RS15).
2. **NOT that Canvas accepted, created, or delivered anything.** One request, one
   outcome, and `unknown` is a first-class value (S3, S4). **No email claim ever**
   (S8, 1.5).
3. **NOT a per-student OUTCOME.** The receipt is a record of ADDRESSEES (section
   0). Anything presenting it as per-student delivery is a defect.
4. **NOT that "active StudentEnrollment" is what the instructor means by "the
   students".** That is OC10 - a calibration question this environment cannot
   settle, with a one-line fix if the answer is bad.
5. **NOT completeness beyond the page cap.** `complete === false` refuses (S5),
   which converts the unknown into a visible one rather than guaranteeing it away.
6. **NOT anything about a course over 100.** A29 refuses there, in every form
   (1.2, 2.3). The class is not served; it is declined.
7. **NOT click cost.** `leverage.md` struck that class as free to any feature with
   a UI. Staying on the Courses tab is real and is worth naming as click cost - it
   is explicitly NOT part of this claim and must not be dressed up as integration.
8. **NOT the AI drafter.** `draftAnnouncementAction` already exists and already
   serves three paths, so it is INHERITED, not earned (3.6).

### The other candidates, judged

| Candidate | Mechanism? | Verdict |
|---|---|---|
| The durable send record (S4) | Yes - a record read back by a later act, the CORPUS shape | **Real but secondary.** It is read back to block a duplicate and to return the addressee list. It is also a hazard this feature creates for itself by sending from a serverless function; Canvas's own compose runs in Canvas |
| The addressee receipt (`recipient_ids`) | Yes - CORPUS. Canvas's compose leaves the instructor no queryable record of who a batch addressed | **Real, and new in this revision.** Second to GUARANTEED, and it exists only because the app chose the recipients |
| Course context / one place | No - click cost | Struck class. Named, never credited |
| SCALE / INTEGRATION / CAPTURE / LIVE-LOOP | No | One request, attended by construction (S9), no device input, no ambient layer |

### The verdict

**The claim is EARNED, not thin.** It names a mechanism (live-read-derived
recipient set with enforced dedup, exclusion and cap), it has a removal test whose
assertion is on the wire values, and the mechanism exists nowhere else in this tree
(one builder, one recipient, no provenance). **RS3, the three-way leverage call, is
CLOSED** - Ruling 29 took the Redesign branch, which is the branch that gives the
feature a mechanism, and this section is its consequence rather than a fresh fork.

**The honest residue**, so this is not read as more than it is: the GUARANTEED
class covers what leaves the app, and nothing beyond that boundary. Everything
after the POST - acceptance, creation, threading, email - is unguaranteed by
construction and is named as such in S8 and section 12.

---

## 11. Residual register

An entry without an owner, an instrument and a step is a deletion. Each row has
all three. **None of these exists until it is in `docs/BACKLOG.md`** - the
orchestrator's step at this chunk's push. This seat wrote no backlog file.

| Id | Was | Requirement | Owner | Instrument | Step |
|---|---|---|---|---|---|
| **RS1** | RS1, **INVERTED** | **AL1, the course-audience form (2.3)**, held as the recorded alternative with its `force_new` prohibition already written into S2 clause 3. Adopting it withdraws K3, E2, K6's recipient half and the leverage claim. **Its stated justification is corrected**: it does NOT raise the 100 ceiling | Repo owner (scope) | Section 2.3's cost list; OC10 and OC11 if adopted | Verify. Adopt only if the roster read proves untrustworthy in the sandbox |
| **RS2** | RA1 | Is `draftAnnouncementAction`'s course-announcement voice right for a private Inbox message? | Repo owner | Read one drafted body in the modal | Verify |
| ~~RS3~~ | RA2 / E4 | **CLOSED.** The leverage three-way call was answered by Ruling 29 (Redesign). Section 10 states the earned claim | - | - | - |
| **RS4** | RA3 | OC1, OC2, OC4, OC5, OC6, OC7, OC8, OC10, OC11 - the nine checks no test here can settle (1.6) | Repo owner | Canvas sandbox, a test student's mailbox, the Vercel settings page, a real browser | Verify, before push |
| **RS5** | RA5 | `CourseRow.tsx` 694, `CoursesTable.tsx` 792 (3.1). If W2 puts either over 900, the extraction is owed before W2 verifies | W2's implementer | `src/file-size-ceiling.structure.test.ts`, both counters | W2's wave gate |
| **RS6** | RA6 | Two existing roster readers disagree on enrollment-state filtering; A29 adds a THIRD rather than reconciling them, deliberately. **Sharper now**: A29's reader is the only one whose output reaches a send, so a later reconciliation must not silently re-point it | Whoever next touches roster reading | A fixture exercising each state through all three | A separate backlog item |
| **RS7** | RA7 | `canvasError` discards the HTTP status for every Canvas call in the app. A29 routes around it (S3); every other caller still cannot tell a throttle from a refusal | Whoever next needs status-level Canvas error handling | `grep -rn "canvasError(" src`, one fixture per status class | A separate backlog item |
| ~~RS8~~ | RA8 | **PROMOTED, NOT DROPPED.** Ruling 31: the missing behavioural test for `createConversation` is now **W1a step 1** with a sabotage step (8.1), not a residual | W1a's implementer | `src/lib/canvas/inbox.test.ts`, asserting the emitted parameters | **W1a, steps 1-2, before any edit to the builder** |
| **RS9** | RA9 | `requireOwner` is a deprecated alias for `requireUser()`, deliberately less restrictive. A29 writes `requireUser()` explicitly; other call sites still inherit the alias - including `draftAnnouncementAction` at `src/app/actions/messaging.ts:410`, which A29 calls | Repo owner / the requireOwner-split wave | The alias's own doc comment; `grep -rc "requireOwner" src` | A separate backlog item |
| **RS10** | RA10 | Ruling 7's correction is half wrong: `src/app/actions.ts` DOES re-export `sendMessageDraftByEmailAction` via `export *`. Neither ruling's example should be cited again | Orchestrator | The four-line grep in `a29-architecture.md` rev 2's C12 | Before the next artifact cites either ruling's example |
| **RS11** | RA11 | `vitest.config.ts` sets no global `testTimeout`, so any NEW whole-tree walker inherits the 5s default. One is added here (S9's) | W2's implementer | `grep -n "testTimeout" src/lib/bulk-course-message/unattended-callers.structure.test.ts` | W2, before its wave gate |
| **RS12** | RS12 | **`mode=async` as the measured fallback.** If OC5 shows one N-id POST does not finish inside the platform default, the options are `mode=async` - which with N > 1 is NOT ignored and returns nothing S3 can classify (1.4) - or an owner-configured route. Neither is adopted now | Repo owner + whoever acts on OC5 | OC5's timing, then one sandbox send with `mode=async` | After OC5 |
| **RS13** | RA13 | S6's scalars-only guarantee is defeated by a component copying a field into a differently-named local. What it cannot defeat: the client is never given a second number to add, and the receipt arrives pre-rendered | The test seat | S6's type-level pin, which does not depend on a name | Test notes, before the tests are written |
| **RS14** | RA14 | **The unresolved-send state has no discovery surface.** The text and the block come back only when something calls `preview` or `send` for that course; a reload that never opens the modal shows no sign. Closing it needs a per-course badge; this pass does not invent one | Repo owner (scope) | Open the modal after an unknown-outcome send and observe whether anything on the Courses tab said so | Verify |
| **RS15** | NEW | **The confirm-to-send drift check is best-effort** (2.4). Its comparand is client-supplied, so a lying client suppresses the `roster-changed` refusal - it cannot change who is messaged. Closing it properly needs a server-held preview snapshot, which collides with S4's partial unique index on `state = 'open'` | Repo owner (scope) | S7 instrument (c)(ii); the collision is S4's index predicate | A separate backlog item, if the owner wants the confirm to bind strictly |

---

## 12. What I could not determine

- **Anything Canvas actually DOES.** The network is blocked under vitest and there
  is no key. Every test specified here asserts what request the app SENT. Not one
  asserts what Canvas did with it.
- **Whether a single POST carrying N numeric ids with `group_conversation` absent
  really produces N private conversations** (**OC11**). The documented sentence at
  1.1 says it does, for "each recipient", and the N-id form uses the recipient
  spelling that sentence's own parameter description names first. Nothing here can
  observe it. **This is now the sharpest open question in the design**, having
  replaced revision 1's "who does Canvas expand a course token into".
- **Whether Canvas's `active` `StudentEnrollment` set matches the instructor's
  "the students"** (**OC10**) - in particular whether the Canvas Test Student is
  returned by `type[]=StudentEnrollment` (a distinct `StudentViewEnrollment` type
  should exclude it, but that is a reading of the type filter, not a measurement),
  and whether a cross-listed student returns two rows for one `user_id` (the
  reader dedups either way, S5).
- **The instance's configured `max_group_conversation_size`.** The documentation
  says the default is 100 and that it is a set maximum. An institution that RAISED
  it makes A29's cap conservative, which is harmless. **An institution that
  LOWERED it is not detectable from here**, and A29 would send N ids over that
  limit and receive a refusal it maps through S3.
- **The over-100 case is not served by A29 in any form**, and section 2.3 records
  why, including the correction to Ruling 29's stated reason for keeping AL1. The
  only documented route to a private send above the maximum is
  `group_conversation=true`, which is the reply-all shape the design forbids.
- **Whether a conversation message emails a student, and the email's subject
  line** (OC1, OC2). Source evidence exists and is labelled as source.
- **The platform's default Server Action duration, and how long one N-id POST
  takes** (OC5). The design SURVIVES a bad answer by construction (S4's unknown
  state), but its usability depends on it, and guessing the number would be the
  difference between "rare edge case" and "the normal path".
- **Whether `force_new` really flips a multi-recipient batch to a group batch.**
  Section 1.3 is read off Canvas's own controller source, which is **not
  documentation** and is not necessarily what an institution's Canvas Cloud runs.
  The design's response is to not send the parameter at all on any multi-recipient
  variant, which is safe under both readings, so the design does not depend on
  settling it.
- **Anything about rendered markup, focus order or keyboard behaviour.** No
  component is rendered by any test in this repo. Every UI claim here - T6's
  placement, S8's copy, S5's "what the count means", the message-vs-announcement
  facts - is a READING claim routed to OC6, OC7 or OC8, and **no criterion in this
  document is enforced only by a render**, which is why K1 lives in S7's
  server-side assertion and why K3 and E2 came back as assertions on the EMITTED
  WIRE VALUES rather than on anything a screen shows.
