# A29 - acceptance criteria: bulk message to a course roster

Seat: acceptance criteria (`loop-ac`). **Revision 0**, authored 2026-09-21.
Criteria only - no mechanism, no oracle construction, no reuse survey. Every
quantity names the command that produced it; commands ran from the repo root
in the Bash tool.

**The owner's words, verbatim** (`docs/backlog.yml` A29 `title`):

> "for courses that have a live lms connection, i need a feature that sends out
> a bulk email to the students via the email they have in canvas"

Where a criterion below and that sentence diverge, the sentence wins.

**The fork is NOT settled here.** (A) sends through Canvas Inbox; (B) sends real
email to the Canvas-profile address. The orchestrator's default pending the
owner is (A), so the criteria are written for (A), and section 5 marks every
criterion that changes or falls away under (B). Section 1b carries a
measurement that changes what (B) costs - the owner should see it before
answering.

---

## 1. Measurements

### 1a. Re-measured, not inherited from the row

| Fact | Measured 2026-09-21 | Command |
|---|---|---|
| One-recipient Inbox send exists | `createConversation(courseUrl, recipientUserId, body, subject?)` at `src/lib/canvas/inbox.ts:384`; posts ONE `recipients[]`, `context_code=course_<id>`, `force_new=1`; refuses a blank body | `sed -n 370,420p src/lib/canvas/inbox.ts` |
| Its only caller | `sendCanvasMessageAction` (`src/app/actions/messaging.ts:254`, not exported), reached only from `postMessageDraftAction` (`:272`) for a draft of `kind: "message"` | `grep -rn "createConversation" src --include=*.ts --include=*.tsx \| grep -v "\.test\."` |
| Nearest existing fan-out | `draftStudentNudgesAction` (`messaging.ts:32`) saves ONE draft per student; each is posted by its own click at `MessageDraftsTab.tsx:204`. No bulk post exists | `grep -n -i "post all\|bulk\|for (const" src/app/components/MessageDraftsTab.tsx` returned nothing |
| Roster readers | `listStudents` (`src/lib/canvas/listings.ts:248`) and `listCourseRoster` (`:286`) query `/courses/:id/users?enrollment_type[]=student` with NO enrollment-state filter; `listStudentGradeSummaries` (`:318`) queries `/enrollments?type[]=StudentEnrollment&state[]=active`. Two readers, two different state filters | `sed -n 247,330p src/lib/canvas/listings.ts` |
| Roster readers request email | No. Neither `/users` query carries `include[]=email` | same |
| Pagination cap | `CANVAS_PAGINATION_PAGE_CAP = 20` at `per_page=100`, so a read stops silently after 2000 rows; the loop exits with no signal | `grep -rn "CANVAS_PAGINATION_PAGE_CAP\s*=" src` |
| "Live LMS" - configured | `canLms(c)` at `src/lib/courses-table-helpers.ts:603`: true when the Course row has a non-blank `canvasUrl` AND a non-blank `institution`. 11 non-test call sites | `grep -rn "canLms(" src --include=*.ts --include=*.tsx \| grep -v "\.test\." \| wc -l` |
| "Live LMS" - reachable | `LmsConnection` (`src/lib/course-intel/types.ts:346`) is `live` or `unavailable` with reason `no-credential` / `no-lms-course` / `unreachable` / `budget-cut`; `classifyLmsFailure` (`src/lib/course-intel/connection.ts:145`) never returns `live` for a failure | `sed -n 290,350p src/lib/course-intel/types.ts`; `sed -n 40,170p src/lib/course-intel/connection.ts` |
| Canvas throttle handling exists | `src/lib/canvas-throttle.ts:34` (429 or 403) and `:44` (429 only) | `grep -rn -i "429\|rate.limit" src/lib/canvas-throttle.ts` |
| Inbox bodies are plain text by house rule | Every existing Inbox drafter instructs plain text, no markdown (`messaging.ts:120,436,500`) | `grep -n -i "plain text" src/app/actions/messaging.ts` |
| A21's drafter emits MARKDOWN | `src/lib/prompt-announcement-prompt.ts:87`: "message ... written in Markdown", title "no more than ~10 words" | `grep -n -i "markdown" src/lib/prompt-announcement-prompt.ts` |
| A21 persistence precedent | the prompt persists under `ta-canvas-ann-prompt` (`promptAnnouncementTemplate.ts:110`); the drafted title and body do NOT (plain `useState`, `announcements-panel.tsx:77-78`) | `sed -n 60,90p src/app/components/canvas-tab/announcements-panel.tsx` |
| Email-provider dependency | none: 0 matches for resend, nodemailer, @sendgrid/mail, postmark, mailgun, client-ses; canary `"next"` matched 1 | `grep -c -E "resend\|nodemailer\|@sendgrid/mail\|postmark\|mailgun\|client-ses" package.json` |

### 1b. WHAT CONTRADICTS THE ROW

1. **"Nothing in the app reads a student email address" is true only of the
   directories the row searched.** The row grepped `src/lib/canvas` and
   `src/lib/course-intel` (canary `createConversation` fired in the same
   directory; the email grep there returned only three "never fetches email"
   comments). Across the tree, student emails ARE read and carried:
   `MessageDraftPayload.recipientEmail` (`src/lib/message-drafts.ts:31`),
   propagated by the nudge path (`messaging.ts:192`), sourced from gradebook
   CSV (`src/lib/gradebook-csv.ts:234,247`) and from the course tile's
   `studentRepos[].email` (`messaging-outlook.ts:167-170`). **None of these is
   the address Canvas holds** - they come from a CSV import - so the row's
   operative claim (nothing reads a Canvas-profile email) survives.
   (`grep -rn "recipientEmail" src | grep -v "\.test\."`)
2. **The app already sends real email, without an email provider.**
   `sendMessageDraftByEmailAction` (`src/app/actions/messaging-outlook.ts:128`)
   sends a draft through the instructor's own connected Outlook via Microsoft
   Graph `me/sendMail` (`src/lib/microsoft-graph.ts:92-122`, `contentType:
   "Text"`), and for an announcement draft it already BCCs the whole tile
   roster (`:167-178`). It is reached from `MessageDraftsTab.tsx:222`. So the
   row's cost list for (B) - "an email provider the app does not have, a
   verified sender domain, bounce handling" - is overstated for a (B') that
   sends from the instructor's connected Outlook: no provider, no domain, and
   bounces land in the instructor's own mailbox. What (B') still needs is
   READING the Canvas-profile address (not requested today, 1a) and a
   connected Outlook with Mail.Send for the institution. **The owner is
   choosing between (A), (B) and this (B'), not two options.**
3. **"Nothing in the app sends to many at once"** holds for sends, not drafts:
   the nudge path already drafts N per-student messages (1a).

---

## 2. Leverage line

**Trigger fired: feature work** (a new capability a user reaches), so a claim
is owed. **Candidate class: GUARANTEED** (`docs/loop/leverage.md`) - the app
holds a per-recipient outcome for every student on the live roster, and every
count it shows is computed from that list, so the instructor learns WHICH
students did not get the message and why; a chat can draft the text but can
neither deliver it nor account for it. **Classes this feature does NOT earn,
stated so no later reader credits them:** drafting is chat-equivalent (and
comes from A21 anyway); delivery to Canvas is inherited (23 of 110 non-test
action files import `@/lib/canvas`: `grep -rl 'from "@/lib/canvas' src/app/actions --include=*.ts | grep -v "\.test\." | wc -l` against `ls src/app/actions/*.ts | grep -v "\.test\." | wc -l`);
the roster read is inherited (`listCourseRoster` already serves course-intel,
`src/lib/course-intel/canvas-readers.ts:54`). **What the instructor does
instead today:** in this app, N separate clicks in Drafts > Messages after the
nudge drafter; outside it, Canvas's own Inbox compose, which (UNVERIFIED here -
external-facts item, section 7) can address a course's students directly. If
that is true, the advantage over Canvas itself is the receipt plus click cost,
and it is thin. **The three-way call is the owner's, not mine:** Redesign
(e.g. per-student content merged from course data - the SCALE class, which the
nudge path already shows is buildable), Accept the thin claim explicitly, or
Reject in favour of Canvas's compose. The removal test is L1.

---

## 3. Disposition

First version of this document; no prior criteria exist, so no disposition
table is owed. The row's pre-established obligations map to criteria as
follows (every one carried, none withdrawn):

| Row obligation | Criteria |
|---|---|
| "Live lms connection" is a gate | C1, C2 |
| Confirm step before a bulk send | C5, C6, C7 |
| Per-recipient result, count agrees with list | C8 |
| Rate limits: partial reported as partial | C9 |
| Who is a recipient | C3, C4 |
| Leverage question | section 2, L1 |
| Reuse A21's composer | C13, C14 |
| When an announcement is the right tool | C15 |
| Persistence, and the mistaken-send hazard | C16 |

---

## 4. The criteria

Each names **Object**, **Instrument**, **Fails when**, and its **Enforcement**:
BEHAVIOURAL (an assertion over library or action code, node-env, network
mocked) or READING (needs the owner in a real browser; see section 6). "Sent"
throughout means the Canvas API accepted the request - under (A) nothing in this
app can observe an email arriving.

### C1 - the feature is not offered for a course without an LMS link
Owner: "for courses that have a live lms connection".
- **Object:** the course the instructor is on, as the app's `Course` row.
- **Instrument:** the app's existing configured-LMS decision, `canLms`
  (`courses-table-helpers.ts:603`) - not a new definition. The send entry
  point, invoked for a course where that decision is false.
- **Fails when:** a course with a blank `canvasUrl` or blank `institution` can
  reach a send, OR the send entry point makes any Canvas request for it.
  Direction: more courses admitted than `canLms` admits is the failure.
- **Enforcement:** BEHAVIOURAL for the refusal at the entry point. That the
  control is hidden or visibly unavailable (with the reason) is READING (OV2).

### C2 - "live" is decided at send time, and a dead connection sends nothing
Owner: "live".
- **Object:** the outcome of a send attempted when the roster cannot be read.
- **Instrument:** the send path with Canvas mocked to fail in each way the app
  already distinguishes (`no-credential`, `unreachable`, per
  `connection.ts`), and a count of outbound message requests.
- **Fails when:** any message request is made after the roster read failed, OR
  the reported reason collapses `no-credential` and `unreachable` into one
  (telling an instructor to reconnect an account that is connected is the
  recorded failure `connection.ts:138-144` exists to stop).
- **Enforcement:** BEHAVIOURAL.

### C3 - recipients are the course's students, each once
Owner: "the students".
- **Object:** the recipient set the confirm step shows and the send uses.
- **Instrument:** a mocked roster response containing, at minimum: an active
  student, a student enrolled in two sections, a teacher, a TA, an observer, a
  designer, Canvas's test student, an invited-not-accepted student, and a
  concluded/inactive (dropped) student. The recipient set is compared against
  the expected ids.
- **Fails when:** any non-student is included (teacher, TA, designer, observer,
  test student); any active student is missing; any student appears twice.
  **Invited and inactive/concluded students: EXCLUDED by default, pending the
  owner (E2).** The criterion binds the OUTPUT set, not the query - which
  enrollment states Canvas returns by default for the readers in 1a is an
  external fact (section 7), and the two existing readers already disagree.
- **Enforcement:** BEHAVIOURAL.

### C4 - an incomplete roster is never presented as the class
- **Object:** a roster read that stops before the last page (1a: the cap stops
  silently at 20 pages).
- **Instrument:** a mocked roster whose pagination runs past the cap.
- **Fails when:** the confirm step offers the truncated set as the whole class
  with no indication, or the send proceeds against it as complete. Refusing,
  or confirming with the shortfall stated, both pass.
- **Enforcement:** BEHAVIOURAL on the outcome value; the wording is READING.

### C5 - no message leaves without an explicit confirm step, and it shows what will happen
Row: "a mistaken send to a whole class cannot be recalled". Minimise clicks, but
this confirm step is not negotiable.
- **Object:** the confirm step and the send entry point behind it.
- **Instrument:** the send entry point's input: it sends only to an explicit
  recipient list and body handed to it; there is no entry point that sends to
  "the course" without that list.
- **Fails when:** any path reaches Canvas without passing a confirmation of
  THIS recipient list and THIS body. The confirm step must show at least:
  the course name, the recipient count, the subject, the full body exactly as
  it will be sent (after any C13 conversion), and the channel ("Canvas Inbox;
  Canvas emails each student according to their own notification settings").
- **Enforcement:** BEHAVIOURAL that the entry point requires the confirmed list
  and body. That the confirm step displays the five items is READING (OV2).

### C6 - what is sent is what was confirmed
- **Object:** each outbound message request vs the confirmed list and body.
- **Instrument:** the recorded requests of a send against a mocked Canvas, with
  the roster changed (a student added) between confirm and send.
- **Fails when:** a request goes to anyone not in the confirmed list (the added
  student included), or carries a subject or body differing from the
  confirmed one.
- **Enforcement:** BEHAVIOURAL.

### C7 - one confirmation, at most one message per student
- **Object:** outbound requests per recipient for one confirmation.
- **Instrument:** the send invoked twice for the same confirmation (the
  double-click / double-submit case).
- **Fails when:** any recipient receives more than one request.
- **Enforcement:** BEHAVIOURAL if the architect's construction lives in library
  or action code; if it lives only in a disabled button, this becomes READING
  and a residual (R3) - the architect must say which.

### C8 - a per-recipient result, and no count that disagrees with it
Row: one screen here showed two "graded" counts that disagreed (A28).
- **Object:** the send's outcome.
- **Instrument:** a send over a mocked roster with failures injected on a named
  subset.
- **Fails when:** any confirmed recipient is absent from the outcome or appears
  in it twice; any recipient lacks exactly one state from {sent, failed with a
  reason, not attempted, outcome unknown}; any count shown anywhere is not
  derived from that list; or sent + failed + not attempted + unknown does not
  equal the confirmed count. "Not attempted" covers a run cut short (this
  deployment caps a function at 60s - Vercel Hobby, per the owner's recorded
  deployment note); "unknown" covers a request whose response never came back
  and which Canvas may have delivered.
- **Enforcement:** BEHAVIOURAL.

### C9 - partial is partial
Row: "a partial failure must be reported as partial, never as success".
- **Object:** the overall outcome label.
- **Instrument:** the same mocked send, with Canvas throttling (429, and 403
  per `canvas-throttle.ts:34`) on some recipients.
- **Fails when:** the outcome is reported as success while any recipient is not
  `sent`; or a throttled recipient is reported `sent`. Zero sent is a failure,
  not a partial.
- **Enforcement:** BEHAVIOURAL.

### C10 - under (A), nothing claims an email arrived
Owner: "email". Under (A) the app can observe only that Canvas accepted the
message.
- **Object:** the outcome's states and the result copy.
- **Instrument:** the outcome type's members.
- **Fails when:** a state asserts delivery by email or receipt by the student.
- **Enforcement:** BEHAVIOURAL on the type (pin the fact: no member claims
  email delivery); the copy is READING (OV3). **Changes under (B)** - section 5.

### C11 - if a resend is offered, it never re-messages a student who got it
Not requested by the owner; binding only IF the design offers a resend.
- **Object:** the recipient list of a resend after a partial outcome.
- **Instrument:** the resend over a prior outcome with all four states present.
- **Fails when:** a `sent` recipient is included, or an `unknown` recipient is
  included without the instructor choosing it (they may already have it), or a
  resend is offered after the prior outcome was lost (e.g. a reload) such that
  it would cover the whole class again.
- **Enforcement:** BEHAVIOURAL.

### C12 - no student sees another student
- **Object:** each outbound message.
- **Instrument:** the recorded requests of a send.
- **Fails when:** any single message is addressed to more than one student in a
  way that shows recipients to each other or pools their replies (a group
  conversation). Each student gets their own conversation; replies reach only
  the instructor.
- **Enforcement:** BEHAVIOURAL on the requests. That Canvas does not group them
  on its side is an external fact (section 7) and an owner check (OV1).

### C13 - the student reads plain text, not markup
- **Object:** the body in each outbound request, when drafted by A21 (which
  emits Markdown, 1a).
- **Instrument:** a body containing headings, bold and a list, sent through the
  path.
- **Fails when:** Markdown syntax reaches the request unchanged, or the confirm
  step shows a different body from the one sent (C6). Converting or refusing
  both pass. Premise to confirm: Canvas renders conversation bodies as plain
  text (section 7).
- **Enforcement:** BEHAVIOURAL.

### C14 - the body can come from A21's drafter, and no second drafter is built
Row: "reuse it rather than building a second composer".
- **Object:** the modules this item adds.
- **Instrument:** a transitive-import check over the added modules against the
  walled set `src/lib/llm*` and `src/lib/gemini*`, excepting the path through
  A21's existing draft action; and a send with a typed body.
- **Fails when:** an added module reaches a model client by any other path, OR
  a typed body cannot be sent without a model call (typing is always
  sufficient; drafting is optional).
- **Enforcement:** BEHAVIOURAL. A21's system prompt frames the text as "a
  course announcement" (`prompt-announcement-prompt.ts:87`); whether that voice
  is acceptable for a message is E3, not a criterion.

### C15 - the instructor is not choosing blind between message and announcement
Row: "an announcement already reaches every student".
- **Object:** the bulk-message surface.
- **Fails when:** the surface does not state the difference in the terms that
  decide the choice - a message is private to each student, replies come back
  privately to the instructor's Inbox, and it does NOT reach students who
  enrol later; an announcement is posted in the course for everyone, including
  later enrolments - OR it offers no route to the announcement composer for
  this course.
- **Instrument / Enforcement:** READING (OV3). No test here renders the
  surface, and a source-text pin of the sentence would over-specify.

### C16 - drafts persist per course; nothing that authorises a send persists
Standing rule: new text inputs persist across reloads. Row: a persisted draft
later sent by mistake is its own hazard.
- **Object:** what the page restores after a reload.
- **Instrument:** the storage read/write functions (A21's precedent is a pure
  leaf), exercised with two courses and with a completed send.
- **Fails when:** a new text input (subject, body, drafting prompt) does not
  persist; OR a draft written for course X pre-fills course Y; OR any of the
  confirmation, the in-flight state, or the recipient list is restored (after
  a reload a send needs a fresh roster read and a fresh confirm); OR the body
  of a send whose outcome was all `sent` is still restored, ready to send again.
- **Enforcement:** BEHAVIOURAL.

### C17 - no unattended path sends
Memory rule: side effects are draft/review-then-commit when unattended.
- **Object:** the bulk send's reachability.
- **Instrument:** a transitive-import check from the walled sets
  `src/lib/workflows/**` and `src/app/api/**` to the bulk-send module - a
  named directory set, not a denylist of names.
- **Fails when:** either set can reach the send. A workflow may at most produce
  a draft that a person then confirms.
- **Enforcement:** BEHAVIOURAL.

### L1 - the removal test for the leverage claim
- **Object:** the outcome's named failed set.
- **Instrument:** a mocked roster of N students with failures injected on a
  named subset S.
- **Fails when:** the outcome's failed set is not exactly S with a reason per
  member. **The deletion that must turn it RED:** replacing the per-recipient
  record with one aggregate success/failure around the whole run. The failed
  set then cannot be named, so this assertion's observed value changes. A test
  that asserts only a total passes under that deletion and is not L1.
- **Enforcement:** BEHAVIOURAL. Test seat owns the oracle.

---

## 5. Under (B): what changes or falls away

| Criterion | Under (B) or (B') |
|---|---|
| C1 | Also requires a working send channel for the institution (for (B'), connected Outlook with Mail.Send - `messaging-outlook.ts:112-115` already distinguishes "not granted") |
| C2 | Also fails when the Canvas-profile email cannot be read for the instructor's role; that is its own reason, not `unreachable` |
| C3 | Adds a per-student `failed: no address visible` state; a student with no readable address is a failed recipient, never silently skipped |
| C5 | The channel line names email and the From identity (the instructor's mailbox under (B')) |
| C8, C9 | `sent` means the mail server accepted it; bounces arrive later, out of band - the outcome must not claim delivery |
| C10 | Falls away in its (A) form; replaced by "no state claims the student received it" |
| C12 | Addresses go one message per student or BCC; never To/CC with more than one student |
| C13 | Holds; Graph sends `contentType: "Text"` today (`microsoft-graph.ts`) |
| C15 | Adds: email leaves the LMS record, and replies go to the instructor's mailbox, not the Canvas Inbox |
| New, (B) only | Student addresses read from Canvas are not persisted by the app beyond the send. Taking addresses outside the LMS is a privacy decision the owner makes (E1), not a default |
| C4, C6, C7, C11, C14, C16, C17, L1 | Unchanged |

---

## 6. Owner verification (READING claims)

| Id | Claim | Owner | Instrument | Step |
|---|---|---|---|---|
| OV1 | A real send to a sandbox course with one test student arrives in that student's Canvas Inbox, as its own conversation; the notification email arrives under default settings; a reply lands in the instructor's Canvas Inbox | Repo owner | Real browser, a live Canvas sandbox course | Verify, before push |
| OV2 | The control is absent or visibly unavailable (with reason) on a non-LMS course; the confirm step shows course, count, subject, full body, channel | Repo owner | Real browser | Verify |
| OV3 | Result copy makes no email-delivery claim; message-vs-announcement copy and route are present (C10, C15) | Repo owner | Real browser | Verify |

---

## 7. Escalations and external facts

- **E1 (owner) - the fork: (A), (B), or (B')** from 1b item 2. Default pending
  the owner: (A).
- **E2 (owner) - invited and inactive students.** Default: excluded (C3).
- **E3 (owner) - A21's "announcement" voice** for a private message: accept, or
  a later item adjusts the framing.
- **E4 (owner) - the leverage three-way call** (section 2).
- **External-facts research (seat, wave 1)**, each a premise of a criterion:
  whether Canvas's Inbox compose already addresses all students of a course
  (section 2); which enrollment states `/users?enrollment_type[]=student`
  returns by default and whether the test student is excluded by type (C3);
  whether a multi-recipient POST can produce a group conversation (C12);
  whether conversation bodies render as plain text (C13); and under (B), which
  role permissions expose a user's email.

---

## 8. Residual register

**None of these is in `docs/BACKLOG.md` yet, and this seat was briefed to touch
no other file - so until the orchestrator appends them, each is a deletion.**

| Id | Requirement | Owner | Instrument | Step |
|---|---|---|---|---|
| R1 | OV1-OV3 above | Repo owner | Real browser + Canvas sandbox | Verify, before the push |
| R2 | Canvas notification delivery by email under (A) is outside the app's observation entirely | Repo owner | A test student's own email inbox | OV1 |
| R3 | C7, if the architect places the guard only in the component | Repo owner | Real browser, double-click on confirm | Verify |
| R4 | The two roster readers' differing state filters (1a) - pre-existing, outside A29's write set | Architect | `sed -n 247,330p src/lib/canvas/listings.ts` | Architect pass |

---

## 9. What I could not determine

- Canvas API behaviour (section 7) - network is blocked and no key exists here.
- Whether any institution's Canvas role exposes student emails (matters only
  under (B)/(B')).
- Where in the UI the feature belongs - that is the UX seat's.
