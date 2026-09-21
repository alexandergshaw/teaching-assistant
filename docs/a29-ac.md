# A29 - acceptance criteria: bulk email to a course's students

Seat: acceptance criteria (`loop-ac`). **Revision 1 of a cap of 2**, authored
2026-09-21 against a check returning 5 blockers (3 classes), 7 majors, 6
minors, and the orchestrator's rulings 1-5. Criteria only - no mechanism, no
oracle construction, no reuse survey. Every quantity names the command that
produced it; commands ran from the repo root in the Bash tool.

**The owner's words, verbatim** (`docs/backlog.yml` A29 `title`):

> "for courses that have a live lms connection, i need a feature that sends out
> a bulk email to the students via the email they have in canvas"

Where a criterion and that sentence diverge, the sentence wins.

**Default fork (Ruling 1): (B') - real email from the instructor's connected
Outlook, to each student's Canvas address.** Still the owner's call (E1). The
criteria are correct under (B') first. (A) Canvas Inbox and (B) a new email
provider are re-derived per criterion in section 5, not appended as
amendments.

**What changed from revision 0, in one line:** the default moved to (B'); the
per-recipient receipt is re-derived per option, because a BCC send has ONE
outcome; two labels became constructions (an outcome type with no counts, and
a confirm signature); a lost outcome can no longer lead to a silent re-send;
and the address is bound to its source. Full disposition in section 8.

---

## 0. THE STRONGEST ALREADY-EXISTS CASE

**Under (B'), most of A29 already ships.** Measured end to end:

1. An announcement-kind draft carrying a course tile id is created today by
   three callers: the recording take path (`src/app/components/recording/useTakeAnnouncement.ts:815`),
   the weekly kickoff step (`src/lib/workflows/registry/steps.announcements.ts:435`),
   and the generic `save-message-draft` step (`src/lib/workflows/registry/steps.messaging.ts:235`).
   (`grep -rn "saveMessageDraftAction\|createMessageDraft(" src --include=*.ts --include=*.tsx | grep -v "\.test\."`)
2. Drafts > Messages offers "Send by email" on it (`MessageDraftsTab.tsx:222`).
   The click only ARMS; a banner confirm fires it (`MessageDraftsTab.tsx:192-200`).
   The confirm names "N students in COURSE" (`describeMessageDraftRecipients`,
   `src/app/components/message-drafts-helpers.ts:63-86`).
3. `sendMessageDraftByEmailAction` (`src/app/actions/messaging-outlook.ts:128`)
   BCCs every non-blank `studentRepos[].email` on the tile (`:167-178`) in ONE
   Graph `me/sendMail` call from the instructor's own Outlook
   (`src/lib/microsoft-graph.ts:92-138`: `contentType: "Text"`; 403 throws
   `MAIL_SEND_NOT_GRANTED`; anything but 202 throws).
4. The tile's emails come from `import-roster-from-csv`
   (`steps.course-setup.rosters.ts:390`), which for a Canvas gradebook export
   takes the **SIS Login ID from Canvas's own export** when it contains "@"
   (`src/lib/gradebook-csv.ts:200-234`). So revision 0 was wrong to say none
   of these is "the address Canvas holds". It is a Canvas-sourced value, but a
   **snapshot** (stale the moment the roster changes) and a **login id**, which
   is not necessarily the address the student reads.

**So what A29 adds under (B') is small, and the criteria say so rather than
defending a larger build:**
- a **live** address source, in place of the CSV snapshot (P1);
- the **live-LMS gate** (K1, K2). Today "Send by email" is offered for any tile;
- **reachability**: a direct compose for a course. Today the draft only comes
  from a workflow or a recording take;
- a confirm bound to the **recipient list**. `messageDraftArmSignature`
  (`message-drafts-helpers.ts:122-124`) signs id, action, body and title only,
  so an armed "34 students" survives a roster change (K5);
- the loss, re-send and format guarantees (K8-K10) that the existing path lacks.

Whether A29 extends the existing path or builds beside it is the architect's
call. The criteria bind **any send offered as A29**.

---

## 1. Measurements

| Fact | Measured 2026-09-21 | Command |
|---|---|---|
| Canvas one-recipient Inbox send | `createConversation` at `src/lib/canvas/inbox.ts:384`: one `recipients[]`, `force_new=1` | `sed -n 370,420p src/lib/canvas/inbox.ts` |
| Roster readers | `listStudents` (`src/lib/canvas/listings.ts:248`) and `listCourseRoster` (`:286`) query `/users?enrollment_type[]=student`, no state filter. `listCourseRoster` reads `login_id` LIVE (`:305`). `listStudentGradeSummaries` (`:318`) queries `/enrollments?...&state[]=active`. Neither `/users` query requests `include[]=email`. Neither returns an enrollment state | `sed -n 247,330p src/lib/canvas/listings.ts` |
| Pagination cap | `CANVAS_PAGINATION_PAGE_CAP = 20` (`src/lib/canvas-remote-url.ts:156`) at `per_page=100`. Reads stop silently after 2000 rows | `grep -rn "CANVAS_PAGINATION_PAGE_CAP\s*=" src` |
| Configured-LMS predicate | `canLms` (`src/lib/courses-table-helpers.ts:603`), 10 non-test call sites excluding its definition | `grep -rn "canLms(" src --include=*.ts --include=*.tsx \| grep -v "\.test\." \| grep -v "export function canLms" \| wc -l` |
| LMS status vocabulary | `LmsConnectionStatus` (`courses-table-helpers.ts:703`) is `not-linked`, `needs-institution`, `unknown`, `connected`, `failed`. `lmsConnectionStatusFor` (`:718`). The comment at `:671` says canLms says nothing about whether a pull succeeds. `unknown` is "deliberately NOT connected" (`:694-698`) | `sed -n 665,730p src/lib/courses-table-helpers.ts` |
| Arm-then-confirm precedent | pure `messageDraftArmSignature` (`message-drafts-helpers.ts:122`), `isConfirmArmed` (`src/app/components/content-tab/modules/confirmArming.ts:26`), `takePostArmSignature` (`src/app/components/recording/takeAnnouncementArming.ts:28`). `armedActionFor` itself is component-local (`MessageDraftsTab.tsx:240`) | `grep -rn "armedActionFor\|ArmSignature" src --include=*.ts --include=*.tsx` |
| Canvas throttle test | `src/lib/canvas-throttle.ts:34` (429 or 403), `:44` (429 only). Canvas-only | `grep -n "429" src/lib/canvas-throttle.ts` |
| Graph failure shape | 403 is `MAIL_SEND_NOT_GRANTED`, not a throttle (`microsoft-graph.ts:130-132`). Any non-202 throws (`:134-138`). No Graph throttle handling exists | `sed -n 124,140p src/lib/microsoft-graph.ts` |
| A21 drafter output | Markdown (`src/lib/prompt-announcement-prompt.ts:87`). A21's post path converts it to HTML (`src/app/actions/prompt-announcement-post.ts:27`, `createAnnouncementFromMarkdown`) | `sed -n 1,32p src/app/actions/prompt-announcement-post.ts` |
| Plain-text house rule | Inbox reply and nudge drafters instruct plain text (`messaging.ts:120,500`). `:436` is an ANNOUNCEMENT drafter, not an Inbox one | `grep -n -i "plain text" src/app/actions/messaging.ts` |
| A21 storage key | `ta-canvas-ann-prompt` (`promptAnnouncementTemplate.ts:110`) is GLOBAL, not per course. It is not a per-course precedent | same file |
| Model-calling modules | `src/lib/llm.ts` (`:452`, `:608`), `src/lib/github-models.ts` (`:59`, chat completions), plus media modules (`media-likeness.ts`, `media-voice.ts`, `useAvatarVideo.ts`, `avatar-likeness.ts`, `tavus.ts`) | `grep -rln "generativelanguage\|models.github.ai\|models.inference.ai\|api.openai.com\|api.anthropic.com\|chat/completions\|elevenlabs\|tavus" src --include=*.ts \| grep -v "\.test\."` (canary: `llm.ts` expected and present) |
| Email-provider dependency | none (0 matches). Canary `"next"` matched 1 | `grep -c -E "resend\|nodemailer\|@sendgrid/mail\|postmark\|mailgun\|client-ses" package.json` |

**Not measured, recalled only:** Exchange Online sending limits (roughly 30
messages a minute, 500 recipients a message). These are premises for P2 and
external-facts items (section 7), never quantities any criterion relies on.

---

## 2. Leverage line

**Trigger fired: feature work**, so a claim is owed, and **it is thin.**

**Candidate class: GUARANTEED.** At confirm time, the recipient set and the
address set equal the **live** Canvas roster of active students. Every student
the app could not address is named, with the reason. That guarantee is what
the existing CSV-snapshot path cannot give.

**What the app CANNOT say, and must not claim:** which students received the
message. Graph's 202 means Outlook accepted it. Bounces arrive later in the
instructor's mailbox, where the app does not look. There is no "learns who did
not get it" under any option.

**What the instructor does instead today:**
- In this app, the one-confirm whole-tile email in section 0. Its recipient
  list is whatever CSV was last imported.
- Outside it, Outlook with a pasted address list, or Canvas's own compose.
  Whether Canvas can message a whole course natively is external (section 7,
  item 1).

**Inherited, not earned:** drafting (chat-equivalent, and it comes from A21);
delivery through Outlook (section 0); and the roster read (`listCourseRoster`
already serves course-intel, `src/lib/course-intel/canvas-readers.ts:54`).

**The three-way call is the owner's (E4), not mine:**
- **Redesign**: e.g. per-student content merged from course data, the SCALE
  class, which the nudge drafter at `messaging.ts:32` shows is buildable.
- **Accept**: live address source plus reachability, stated as thin.
- **Reject**: in favour of the existing path plus a re-import.

The removal test is L1.

---

## 3. Enforcement key

- **BEHAVIOURAL**: an assertion over library or action code. Node-env, network
  mocked.
- **READING**: needs the owner in a real browser. Listed in section 6.

"Handed over" means the channel's API accepted the request. No criterion
anywhere asserts delivery.

---

## 4. Criteria common to all three options

Each criterion below holds **identically** under (B'), (A) and (B) unless it
says otherwise. Each names its Object, its Instrument, and what it Fails when.

### K1 - not offered for a course without an LMS link
Owner: "for courses that have a live lms connection".
- **Object:** the course's `Course` row, at the A29 send entry point.
- **Instrument:** `lmsConnectionStatusFor`'s local categories (`not-linked`,
  `needs-institution`), not a new definition.
- **Fails when:** the entry point makes any Canvas or mail request for a course
  in either category. Admitting more courses than those categories admit is
  the failure.
- **Enforcement:** BEHAVIOURAL. That the control is absent, or visibly
  unavailable with the category's reason, is READING (OV2).

### K2 - "live" is proven at send time; `unknown` is never `connected`
Owner: "live".
- **Object:** a send attempted when the live roster read fails.
- **Instrument:** the send path with Canvas mocked to fail (a missing
  credential, and an unreachable host). Count the outbound mail and message
  requests.
- **Fails when:**
  - any outbound request is made after the roster read failed;
  - a course with no live result is treated as connected;
  - a missing credential and an unreachable host produce the same reason
    (sending an instructor to reconnect an account that is connected).
- **Enforcement:** BEHAVIOURAL.

### K3 - recipients are the course's active students, each once
Owner: "the students".
- **Object:** the recipient set in the confirm signature (K5) and in the send.
- **Instrument:** a mocked roster containing: an active student; a student in
  two sections; a teacher; a TA; an observer; a designer; Canvas's test
  student; an invited-not-accepted student; a concluded or inactive student.
- **Fails when:**
  - any non-student is included;
  - any active student is missing;
  - any student appears twice;
  - an invited or inactive student is included. Default is to exclude them,
    pending the owner (E2).
- **Requirement this places on the roster read (WHERE is the architect's):**
  it must expose each row's enrollment state and whether the read was
  complete. `listCourseRoster` exposes neither today (section 1).
- **Enforcement:** BEHAVIOURAL.

### K4 - an incomplete roster is never presented as the class
- **Object:** a roster read that stops at the pagination cap.
- **Instrument:** a mocked roster paginating past 20 pages.
- **Fails when:** the confirm offers the set with no incompleteness marker, or
  the send proceeds as if complete. The total is unknowable once the cap
  stops the read. So the pass condition is "marked incomplete, with the count
  read so far" - not a quantified shortfall. Refusing to send also passes.
- **Enforcement:** BEHAVIOURAL on the value. Wording is READING.

### K5 - CONSTRUCTION: a confirm signature that binds everything that matters
Row: a mistaken send to a whole class cannot be recalled. This confirm is not
negotiable.
- **Object:** a pure arm-then-confirm helper. It follows the
  `messageDraftArmSignature` / `isConfirmArmed` precedent, or is a
  server-issued confirmation token (architect's choice).
- **Instrument:** the helper, and the send entry point that consumes its
  output.
- **Fails when:**
  - the signature is unchanged by a change to any of: the course, the
    recipient list (ids AND addresses under (B') and (B)), the subject, the
    body, or the channel;
  - OR the send entry point sends anything whose signature differs from the
    confirmed one;
  - OR a path reaches the channel without a confirmed signature.
- **Also:** the confirm must SHOW the course name, the count from K8's
  summariser, the subject, the full body as it will leave (K10), the channel,
  and the From identity under (B').
- **Enforcement:** BEHAVIOURAL for the helper and the refusal. The display is
  READING (OV2).

### K6 - what is sent is what was confirmed
- **Object:** the outbound requests against the confirmed signature's contents.
- **Instrument:** a send against mocks, with the roster changed (a student
  added, an address changed) between confirm and send.
- **Fails when:** any request reaches an address or recipient not in the
  confirmed list, or carries a different subject or body.
- **Enforcement:** BEHAVIOURAL.

### K7 - one confirmation is spent once
- **Object:** outbound requests per confirmation.
- **Instrument:** the send invoked twice with one confirmed signature.
- **Fails when:** the second invocation makes any outbound request. This is no
  longer conditional: the signature is consumed by the entry point, not by a
  disabled button.
- **Enforcement:** BEHAVIOURAL.

### K8 - CONSTRUCTION: an outcome with no counts, and ONE summariser
Row A28 shipped two disagreeing counts on one screen today.
- **Object:** the send's outcome type, and every place that displays a count.
- **Instrument:**
  - the outcome type's fields: it carries per-recipient and per-batch records
    and **no numeric count field**;
  - one pure summariser, the only export that produces counts;
  - an import check that every module displaying the outcome imports that
    summariser.
- **Fails when:**
  - the type gains a count field;
  - a second function derives a count from the outcome;
  - a displaying module does not import the summariser;
  - or, over a fixture, the summariser's counts do not partition the confirmed
    list exactly (every recipient in exactly one state; the states sum to the
    confirmed count).
- **Enforcement:** BEHAVIOURAL (type, import, and pure function). That no
  component hand-computes a count despite importing the summariser is READING
  (OV3).

### K9 - a lost or partial outcome cannot become a silent re-send
Ruling 4. The row's own hazard: a function killed by the 60s cap returns
nothing, and a reload plus a fresh confirm would re-send to the whole class.
- **Object:** a second send of the same message to the same course after a
  first attempt whose outcome was not "all handed over". That includes an
  outcome that never arrived.
- **Instrument:**
  - a first attempt made to die after its outbound request and before
    returning (the deadline injection);
  - then a fresh confirm and send of the same body to the same course.
- **Fails when:** the second send makes any outbound request without an
  explicit instructor choice that is shown:
  - that a prior attempt exists;
  - when it was made;
  - to how many recipients;
  - that its outcome is unknown or partial.
  Failing to record the prior attempt BEFORE the first outbound request is
  the defect this catches.
- **If a "resend to the rest" is offered:** it never includes a recipient
  whose batch was handed over. It includes an `unknown` recipient only by that
  explicit choice.
- **Enforcement:** BEHAVIOURAL.

### K10 - the body leaves in the channel's own format
- **Object:** the body in each outbound request, and the content type the
  channel declares for it.
- **Instrument:** a body drafted by A21 (Markdown with headings, bold and a
  list), sent through the path.
- **Fails when:** the body's format differs from the declared content type:
  - A plain-text channel fails if it carries HTML tags OR Markdown markup.
    Graph declares `"Text"` today, and a Canvas conversation is plain text
    (premise, section 7).
  - An HTML channel fails if the body is not HTML.
  - It also fails if the confirm shows a different body from the one that
    leaves (K6).
- **Why it is bound to the output:** A21's own post path converts Markdown to
  HTML, so the obvious reuse passes an input-syntax test while sending literal
  `<p><strong>` into a Text email.
- **Enforcement:** BEHAVIOURAL.

### K11 - the body may come from A21; the send path makes no model call
Row: reuse A21 rather than build a second composer.
- **Object:** the transitive import closure of the A29 send entry point.
- **Instrument:** a closure check walled BY CAPABILITY. The allowed network
  capabilities are exactly the Canvas client and the chosen channel's client.
  Any module in the closure that issues a request to any other host fails.
  This is a closed allow-set, not a name denylist, so a new model client such
  as `github-models.ts` is excluded without being named.
- **Fails when:**
  - the closure reaches any model-calling module;
  - OR a typed body cannot be sent without a model call.
- **Drafting stays optional:** A21's existing draft action, called from the
  compose surface, is the reuse. Whether its "course announcement" voice
  suits a private email is E3.
- **Enforcement:** BEHAVIOURAL.

### K12 - the instructor is not choosing blind between this and an announcement
- **Object:** the compose surface.
- **Fails when:** the surface does not state the facts that decide the choice,
  or offers no route to this course's announcement composer. The facts to state:

  | This message | An announcement |
  |---|---|
  | Private to each student | Posted in the course for everyone |
  | Replies go to the instructor privately ((B') Outlook, (A) Canvas Inbox) | Visible to students who enrol later |
  | Does not reach students who enrol later | |
  | (B') and (B): leaves the LMS record | |

- **Enforcement:** READING (OV3). A source-text pin of the sentence would
  over-specify.

### K13 - drafts persist per course; nothing that authorises a send persists
Standing rule: new text inputs persist. Row: a persisted draft sent by mistake
is its own hazard.
- **Object:** what the page restores after a reload.
- **Instrument:** the storage read and write functions, over two courses and
  around a confirm.
- **Fails when:**
  - subject, body and drafting prompt do not persist;
  - OR a draft for course X pre-fills course Y. The key is per course; A21's
    global key is not the precedent here;
  - OR the confirm signature, the in-flight state, or the recipient list is
    restored;
  - OR the persisted body survives the moment of confirm. It is cleared AT
    confirm, not at success, because a killed function never reports success
    (K9 covers a retyped body).
- **Enforcement:** BEHAVIOURAL.

### K14 - no unattended path sends
- **Object:** reachability of the A29 send entry point.
- **Instrument:** a transitive-import check from the directory sets
  `src/lib/workflows/**` and `src/app/api/**` (named sets, not a name list).
- **Fails when:** either set reaches the send. A workflow may produce a draft,
  and a person confirms it (K5).
- **Enforcement:** BEHAVIOURAL.

---

## 5. Criteria that depend on the option, re-derived for each

### P1 - which address is used (Ruling 2, B2)

**(B') and (B)**
- **Object:** every address in the outbound request(s).
- **Instrument:** a fixture where, for one student, the tile's
  `studentRepos[].email`, the live `login_id`, and the live Canvas email all
  differ.
- **Fails when:**
  - any address is not the value of the designated Canvas field, read live
    for this send;
  - a tile or CSV-snapshot address is used;
  - a student whose live record has no usable address is silently skipped.
    Such a student must appear in the outcome as `excluded: no address`.
- **Which Canvas field is the owner's call (E5):**
  - the profile email (`include[]=email`, permission-dependent - section 7);
  - or the live `login_id` when it is email-shaped. This is what the CSV path
    effectively uses today, and it is not necessarily the student's mailbox.
- **Enforcement:** BEHAVIOURAL.

**(A)** Falls away. The recipient is the Canvas user id, and Canvas chooses
the address by the student's notification settings. K3 is the binding
criterion.

### P2 - what a per-recipient receipt can honestly mean (Ruling 2, B1)

**(B') - one Graph call per batch, BCC**
- **Object:** the outcome.
- **Fails when:**
  - the outcome claims a per-student result the API never returned;
  - OR any student is not in exactly one of:
    - `excluded` (with a reason: no address, not active);
    - `in batch k`, where batch k's state is `accepted` (202), `refused` (with
      a reason) or `unknown` (no response).
- **Every student in a batch shares that batch's state.** There is no partial
  outcome inside a batch.
- **Batch size:** if the recipient count exceeds a per-message cap (external,
  section 7), the send is split. Each batch is confirmed as part of one
  signature and reported separately.
- **Enforcement:** BEHAVIOURAL.

**(A) - one Canvas call per student**
- **Fails when:** any student is not in exactly one of `excluded`, `accepted`,
  `refused` (with a reason), `not attempted` or `unknown`.
- **Note:** a class may not finish inside the 60s cap. K9 covers the loss;
  whether the send is a background job is the reliability seat's.

**(B) - depends on the provider**
- Per-message calls give (A)'s states. A batch API gives (B')'s.
- Delivery webhooks, if the provider has them, are a separate item, not this
  one.

### P3 - partial is partial; a refusal is not a throttle (Ruling 2, C9)

**(B')**
- **Instrument:** the Graph client mocked to return 429, 403 and 500 for
  different batches.
- **Fails when:**
  - the overall outcome reads as success while any batch is not `accepted`;
  - OR a 403 is reported as a throttle or retried. It is
    `MAIL_SEND_NOT_GRANTED`, and the reason says "reconnect Outlook to grant
    Mail.Send", as `messaging-outlook.ts:111-115` already does;
  - OR a 429 batch is reported as `accepted`.
- Zero accepted is a failure, not a partial.

**(A)**
- **Instrument:** Canvas mocked with 429 and 403 per `canvas-throttle.ts:34`.
- **Fails when:** a throttled student is reported `accepted`, or the run reads
  as success while any student is not `accepted`.

**(B)**
- The provider's own throttle and refusal codes, under the same two
  conditions.

- **Enforcement:** BEHAVIOURAL.

### P4 - no student sees another student

**(B')**
- **Fails when:** any request puts more than one student address in To or CC.
  BCC, or one message per student, passes.

**(A)**
- **Fails when:** any request carries more than one student recipient in a way
  that can form a group conversation (premise, section 7).

**(B)**
- As (B').

- **Enforcement:** BEHAVIOURAL on the requests. OV1 confirms it in a real
  mailbox or inbox.

### P5 - no delivery claim

**All three options**
- **Object:** the outcome's state names, and the result copy.
- **Fails when:** a state asserts delivery or receipt. The strongest honest
  state is "accepted by Outlook", "accepted by Canvas" or "accepted by the
  provider".
- **(B') and (B) only:** the copy says that bounces arrive in the sending
  mailbox.
- **Enforcement:** BEHAVIOURAL on the type (pin the fact, not a sentence). The
  copy is READING (OV3).

### P6 - the channel precondition

**(B')**
- **Fails when:** a send is attempted without a connected Outlook granting
  Mail.Send for the course's institution. The existing "Connect Outlook for
  <institution>" and "not granted" reasons (`messaging-outlook.ts:103-115`)
  are the vocabulary.
- **Also:** the From identity shown at confirm (K5) is that mailbox.

**(A)**
- Falls away. K2 is the precondition.

**(B)**
- A provider and a verified sender are configured. The owner configures them.

- **Enforcement:** BEHAVIOURAL.

### P7 - (B) and (B') only: addresses do not outlive the send
- **Fails when:** a live-read address is written to any persisted store (the
  tile, a draft payload, a log) beyond the send's own outcome record.
- Whether even the outcome record may hold addresses is E6, because taking
  addresses outside the LMS is a privacy decision.
- **Enforcement:** BEHAVIOURAL (the send path's writes, mocked).
- **(A):** falls away. The app never holds an address.

### L1 - the removal test

**(B') and (B)**
- **Instrument:** a fixture where the tile snapshot and the live Canvas roster
  disagree:
  - a dropped student is still on the tile;
  - a new student is absent from the tile;
  - one student's address has changed.
- **Fails when:** the handed-over address set is not exactly the live set, with
  the no-address student named `excluded`.
- **The deletion that must turn it RED:** swapping the live read for
  `studentRepos[].email`. The asserted set then changes in all three rows.

**(A)**
- **The same fixture over Canvas user ids.** The deletion is replacing the
  live roster with any stored list.

- A test asserting only a total survives the deletion and is not L1.
- **Enforcement:** BEHAVIOURAL. The test seat owns the oracle.

---

## 6. Owner verification (READING claims)

| Id | Claim | Owner | Instrument | Step |
|---|---|---|---|---|
| OV1 | (B'): a real send to a sandbox course with one test student arrives from the instructor's mailbox, BCC'd, at the designated address. A reply comes back to that mailbox. (A): the message arrives in the student's Canvas Inbox as its own conversation, and a reply lands in the instructor's Inbox | Repo owner | Real browser, a Canvas sandbox, the test student's mailbox | Verify, before push |
| OV2 | The control is absent or visibly unavailable (with the status category's reason) on a course without an LMS link. The confirm shows course, count, subject, body as it leaves, channel and From | Repo owner | Real browser | Verify |
| OV3 | No delivery claim in the copy. The message-vs-announcement facts and route are present. No count is hand-computed beside the summariser | Repo owner | Real browser, and reading the diff | Verify |

---

## 7. Escalations and external facts

- **E1 (owner):** (B'), (A) or (B). Default (B') per Ruling 1.
- **E2 (owner):** invited and inactive students. Default: excluded.
- **E3 (owner):** A21's announcement voice for a private email.
- **E4 (owner):** the leverage three-way call (section 2), including "this is
  reachability plus a live address source, not a new feature".
- **E5 (owner, (B') and (B)):** which Canvas field is "the email they have in
  canvas" - the profile email, or the email-shaped login id.
- **E6 (owner, (B') and (B)):** may the outcome record hold addresses at all.
- **External facts (research seat, wave 1)**, each a premise of a criterion:
  1. Canvas `POST /conversations` may accept `course_<id>_students` and
     `bulk_message` / `mode=async`. If so, (A) may already exist natively
     (section 2).
  2. The default enrollment states `/users?enrollment_type[]=student` returns,
     and whether the test student is excluded by type (K3).
  3. Whether a multi-recipient conversation POST can group (P4).
  4. Whether conversation bodies render as plain text (K10).
  5. Which Canvas role permissions expose `include[]=email` (P1).
  6. Exchange Online per-minute and per-message recipient limits and Graph's
     429 behaviour (P2, P3).

---

## 8. Disposition of revision 0 (ids re-derived after all renumbering)

| Rev-0 id | Disposition | Now |
|---|---|---|
| C1 | kept, re-derived on `lmsConnectionStatusFor` categories (M3) | K1 |
| C2 | kept; `unknown` never connected added | K2 |
| C3 | kept; the fenced reader requirement replaced by a stated requirement, WHERE handed to the architect (Ruling 5) | K3 |
| C4 | kept; "shortfall" made measurable as "marked incomplete, count read so far" | K4 |
| C5 | kept; label replaced by a construction (Ruling 3) | K5 |
| C6 | kept; address change added | K6 |
| C7 | kept; made unconditional | K7 |
| C8 | kept; label replaced by a construction (Ruling 3); per-recipient states moved per option | K8 + P2 |
| C9 | kept; re-targeted per option, Graph 403 is not a throttle | P3 |
| C10 | kept; now all options, not (A) only | P5 |
| C11 | folded into K9, no longer conditional | K9 |
| C12 | kept; re-derived per option | P4 |
| C13 | kept; pass condition bound to output format (M1) | K10 |
| C14 | kept; walled by capability, not by name (M6) | K11 |
| C15 | kept | K12 |
| C16 | kept; clear-at-confirm replaces clear-at-success (Ruling 4); the false A21 precedent removed | K13 |
| C17 | kept unchanged | K14 |
| L1 | kept; re-derived. Rev-0's failure injection on a named subset described a response a BCC send never produces | L1 |
| Section 5 (B) table | withdrawn as a form; its rows were re-derived into P1-P7 | P1-P7 |
| (new) | address bound to source (B2) | P1 |
| (new) | lost-outcome re-send (Ruling 4) | K9 |
| (new) | channel precondition | P6 |
| (new) | addresses do not outlive the send | P7 |
| OV1-OV3 | kept, re-derived per option | OV1-OV3 |
| R4 | withdrawn: it fenced a write set, which is not this seat's (Ruling 5). Its requirement lives in K3; it protected no enforcer | K3 |
| E1-E4 | kept; E5 and E6 added | E1-E6 |

---

## 9. Residual register

The orchestrator is correcting the backlog row (M5). This seat did not touch
`docs/backlog.yml`. Until each of these is in it, it is a deletion.

| Id | Requirement | Owner | Instrument | Step |
|---|---|---|---|---|
| R1 | OV1 | Repo owner | Real browser, Canvas sandbox, test student's mailbox | Verify, before push |
| R2 | OV2 | Repo owner | Real browser | Verify |
| R3 | OV3 | Repo owner | Real browser plus the diff | Verify |
| R4 | Delivery (bounces under (B')/(B), notification email under (A)) is outside the app's observation under every option | Repo owner | The test student's mailbox | OV1 |

---

## 10. What I could not determine

- Every item in section 7's external-facts list. The network is blocked and
  there is no key.
- Whether the existing "Send by email" path should itself move to the live
  address source. It is outside A29's words but shares its hazard. That is the
  architect's and owner's call.
- The UI placement of the compose surface. That is the UX seat's.
