# A29 - ROUND 2 adversarial check of `docs/a29-architecture-small.md`

Fresh checker (`loop-checker`). I did not author this document. Checked against the
working tree at `git diff 914a46f -- docs/a29-architecture-small.md` = 0 lines, so
the file under check is byte-identical to the committed revision 2.

Every quantity below names the command that produced it. Where I count lines I run
both counters, because two line-counting tools in this repo disagree by 42 on one
file.

**One thing about the commit the brief named, found while fetching revision 1.**
`git diff --stat HEAD~1 HEAD -- docs/a29-architecture-small.md` (where HEAD was
`914a46f`) prints **nothing**: the auto-commit hook had already swept revision 2's
content into `a26ad5a`, a `docs(a20)` commit, and `914a46f` re-committed the same
bytes. Revision 1 is `e2f65d1`, not `HEAD~1`
(`git log --oneline -- docs/a29-architecture-small.md` returns exactly two
commits). `git diff --stat e2f65d1 914a46f -- docs/a29-architecture-small.md` =
`1180 insertions(+), 792 deletions(-)`. All revision-1 comparisons below use
`git show e2f65d1:docs/a29-architecture-small.md`.

---

## Part A - the eight items the brief named

### 1. The 103-key correction: measurement CONFIRMED, replacement oracle mostly holds

Re-run, my own command:

```
$ node -e 'const p=new URLSearchParams(); for(let i=0;i<100;i++) p.append("recipients[]", String(1000000+i));
p.append("body","x".repeat(4000)); p.append("subject","A subject line of ordinary length");
p.append("context_code","course_12345");
console.log("distinct keys:", [...new Set(p.keys())].sort().join(","));
console.log("raw keys length:", [...p.keys()].length);
console.log("sorted-keys-length (rev1 oracle):", [...new URLSearchParams(p.toString()).keys()].sort().length);
console.log("getAll recipients length:", p.getAll("recipients[]").length);
console.log("total bytes:", Buffer.byteLength(p.toString(),"utf8"));'
distinct keys: body,context_code,recipients[],subject
raw keys length: 103
sorted-keys-length (rev1 oracle): 103
getAll recipients length: 100
total bytes: 6573
```

**103, 100 and 6573 all reproduce exactly.** The seat's correction is sound and its
byte figure is right.

Does the replacement oracle go red on the defects it exists to catch? Taking S2
clause 1 as written - distinct-key set equality, plus
`expect(keys).not.toContain("force_new")`, plus
`params.getAll("recipients[]")` length N / all `/^\d+$/` / all distinct:

| Defect | Verdict | Why |
|---|---|---|
| `force_new=1` re-appended on the `roster` variant | **RED** | the distinct key set gains a fourth/fifth member, and the by-name assertion fires independently |
| `force_new=0` appended (a harmless-looking edit) | **RED** | same; correct conservative behaviour even though `value_to_boolean("0")` is false in Canvas's own source |
| `group_conversation=true` leaks in | **RED** | extra key in the set |
| `group_conversation=false` added explicitly | **RED** | the document states a MISSING key is equally a failure, so set equality is two-sided |
| a recipient silently dropped | **RED, but not by S2** | see below |

**The drop case is where the oracle is thin.** S2 clause 1 says
`params.getAll("recipients[]")` "has length N" and never says where `N` comes from.
If an implementer writes `expect(getAll(...).length).toBe(audience.canvasUserIds.length)`
the assertion catches a drop **inside the builder** and is blind to a drop in the
reader; if they read `N` back off the emitted params it is a tautology. The only
thing that actually anchors the count to a known truth is **S5's fixture** (7 active,
2 invited, 1 inactive, one student across two sections) and S5's removal test, which
pins the multiset to "exactly the 7 distinct active ids". So: red, via S5, not via
S2. Recorded as MINOR m3.

### 2. The over-100 conflict: the seat's reasoning is CORRECT, and the handling is honest

Both quoted sentences are verbatim in the archive, which is still on disk at this
session's scratchpad (`conv.txt`), so I checked them rather than trusting the page:

```
$ grep -n -i "bulk_message" conv.txt
453:  If the course/group has over 100 enrollments, &#39;bulk_message&#39; and &#39;group_conversation&#39; must be
$ grep -c -i "recipients" conv.txt
23
$ sed -n '474,479p' conv.txt
      group_conversation
      boolean
        Defaults to false.  When false, individual private conversations will be
created with each recipient. If true, this will be a group conversation
(i.e. all recipients may see all messages and replies). Must be set true if
the number of recipients is over the set maximum (default is 100).
```

And the source side, opened by me this pass (`cc.rb`, same scratchpad):

```
$ grep -n "batch_private_messages\|batch_group_messages\|max_group_conversation_size\|ConversationBatch.generate" cc.rb
447:    batch_private_messages = (!group_conversation && @recipients.size > 1) || force_individual_messages
448:    batch_group_messages   = (group_conversation && value_to_boolean(params[:bulk_message])) || value_to_boolean(params[:force_new])
451:    if !batch_group_messages && @recipients.size > Conversation.max_group_conversation_size
467:        batch = ConversationBatch.generate(message,
474:                                           group: batch_group_messages)
```

The conflict is **real** and the seat reports it correctly. The documented over-limit
rule conditions on the enrollment/recipient count and demands
`group_conversation=true`, whose own documented meaning is the reply-all thread the
design forbids; the source guard at `:451` refuses at the same limit whenever
`batch_group_messages` is false, which is the state both A29 forms are in. So AL1
buys no ceiling, exactly as the document says.

**The handling is honest, not a gap dressed as a decision.** The refusal is decided
in our own code before a byte goes out (S1's cap, S7's `over-recipient-limit`,
section 6 row 4), the class is named as unserved in three separate places
(section 2.3, section 10's non-guarantee 6, section 12 bullet 5), and RS1 records
that Ruling 29's stated justification for keeping AL1 is the thing being corrected
rather than the ruling being overridden. This is the strongest section of the
document and I am not reopening it.

### 3. The allow-pattern: the line is right, the LOAD-BEARING label is not

`src/app/actions/messaging.ts:301`, opened:

```
if (!payload.courseUrl || !payload.recipientUserId || !/^\d+$/.test(payload.recipientUserId)) {
```

Character-for-character what the document quotes. Ruling 9's instruction to move it
inside the builder is correctly carried.

Tracing what actually reaches the builder under the N-id form: the action takes a
course id only (S7's provenance clause); the stored row is read by `getCourse`
(`src/lib/supabase/courses.ts:73-84`, `.eq("user_id", userId).eq("id", id)`,
`.maybeSingle()` - opened, correct); the ids are produced by T2 parsing Canvas's own
enrollments JSON, whose existing in-repo type already declares `user_id?: number`
(`src/lib/canvas/listings.ts:334`, opened). **So the pattern guards app-derived data
whose upstream type is already numeric.** It is a backstop against Canvas returning
something unexpected and against a future caller - a real but narrow role.

The document contradicts itself inside three sentences: S1(a) says the pattern is
"LOAD-BEARING" because "the `roster` variant carries N caller-supplied strings", then
provenance clause 1 immediately says "No client-supplied id reaches the builder,
because no action parameter can carry one." Both cannot be the operative reading.
The label is overstated. Recorded as MAJOR M2, with the constructive point: S1(a)'s
own philosophy is that bad forms should be **unrepresentable**, and `readonly
number[]` (available for free, given `user_id?: number`) makes `"course_3"`,
`"401,402"` and the `uuid:` form unrepresentable rather than rejected - which is the
shape this document argues for everywhere else and then does not use.

### 4. The GUARANTEED provenance claim: I could not break it, and the comparand claim is TRUE

I attacked every route I could find into `recipients[]`:

- **Action parameters.** `send(courseId, subject, body, confirmedCount)` (section 6
  row 6). `subject` and `body` reach the wire but are percent-encoded by
  `URLSearchParams.toString()` and cannot forge a key; S2 clause 1 pins the key set
  either way. `courseId` is scoped by `getCourse`'s `.eq("user_id", ...)`.
- **The confirm.** There is no server-minted token any more and the arm signature
  (T5) is explicitly not consulted by the server (section 5).
- **localStorage.** The two `ta-bulk-msg-*` keys hold subject and body only, and S11
  states the send record's id and the recipient list are never persisted
  client-side.
- **Props.** T6 passes a course, not a roster; T5 is a pure helper.
- **The drift comparand.** This is the one the seat singles out, so I traced it
  against the document's own ordered control flow. Section 6 is ordered and
  first-match-wins: row 4 (over-limit) precedes row 5 (drift) precedes row 6 (send).
  Row 5's outbound column is "none" and its ledger column is "none". The comparand
  appears in exactly one predicate and in the `roster-changed` payload. **The claim
  that it can only suppress a refusal and never change who is messaged is TRUE on
  the design as written**, and the seat's own worst case ("a send to the live active
  roster") is the correct characterisation. RS15 records the residue with an owner,
  an instrument and a step.

The provenance half of the GUARANTEED claim survives. What does not survive is the
**classification** and the **earned/inherited count** - see MAJOR M4.

### 5. Ruling 31's ordered wave: the citation is right, step 4 is NOT a preservation proof

`src/lib/canvas/inbox.ts:406`, opened:

```
$ grep -n "recipients\[\]\|force_new\|context_code\|api/v1/conversations" src/lib/canvas/inbox.ts
400:  params.append("recipients[]", recipientUserId);
405:  params.append("context_code", `course_${courseId}`);
406:  params.append("force_new", "1");
409:    `${baseUrl}/api/v1/conversations`,
```

`:384` opens `createConversation`, `:406` is `params.append("force_new", "1");`. The
cited line says exactly what the design says it says. Step 2's sabotage (delete that
append, watch the by-name assertion go red, restore from a copy not
`git checkout --`) is correctly specified and correctly reasoned.

**Step 4 is not the behaviour-preservation proof the document calls it**, for a
reason that is structural rather than hypothetical:

- Step 3 **deliberately adds behaviour the shipped builder does not have** - S1's
  allow-pattern, applied "in the builder, per value", plus the cardinality and
  distinctness checks. The shipped `createConversation` performs **no** validation of
  `recipientUserId` (I read the whole function; the only guard is
  `if (!body.trim())`). So after step 3, `createConversation(url, "course_5", body)`
  throws where it previously POSTed.
- Step 1's test, written against the shipped builder, cannot contain a case for that
  input, because the shipped builder has no such branch to assert on. So step 4
  passes byte for byte **while the behaviour has changed**, which is precisely what
  step 4 claims to disprove.
- S3 states this outright in the other direction: "`createConversation` keeps its
  name, its signature and its **behaviour**". Against S1 that is false for any
  non-digit recipient. The two constructions contradict each other.

Blast radius is small - `sendCanvasMessageAction` is the only caller
(`grep -rn "sendCanvasMessageAction" src` returns two lines, both in
`src/app/actions/messaging.ts`, at `:254` the definition and `:304` the call), it is
not exported, and its caller already applies `/^\d+$/` at `:301`. So this is a
**MAJOR**, not a blocker: the ordering is still the right ordering, but step 4 must
be stated as "preservation on the paths step 1 covers, plus one new case per branch
step 3 adds", and S3's "keeps its behaviour" must be amended.

Separately: step 2's sabotage proves **one** assertion can fail. The other six
bullets in step 1 (pathname, empty searchParams, `context_code`, the seven status
classes, the empty-body throw) are untested instruments after step 2 completes.
MINOR.

### 6. Every absence needs a canary - four claims have none, and all four are TRUE

I re-ran every absence claim in the document. Results, with my own canaries added
where the document had none:

| Absence claimed | Document's canary | My re-run | Verdict |
|---|---|---|---|
| `createConversation` in `inbox.test.ts` = 0 | `listConversations` = 19 | 0 / 19 | **sound** |
| `group_conversation` + `bulk_message` in `src` = 0 | `recipients[]` = 1 | 0 / 1 | **sound** |
| `force_new` non-test in `src` = 1 | same machinery | 1 | **sound** |
| `bulk_message` in `conv.txt` = 1 hit | `recipients` = 23 | 1 hit at `:453` / 23 | **sound** |
| `BulkCourseMessage` under `workflows` + `api` = 0 | `listCourseHubAction` = 122 files | 0 / 122 | **sound** |
| `\bsent\b` over the six feature files = none | 57 `.tsx` lines tree-wide | exit 1 / 57 | **sound** |
| partial-index `where` lines = 4 | 9 files declare a unique index | 4 / 9 | **sound** |
| wave write-set intersection empty | seeded collision prints | canary shape is correct | **sound** |
| 39 `readdirSync` walkers | `no-emojis` present = 1 | 39 / 1 | **sound** |
| `maxDuration` in `src/app/page.tsx` | **NONE** | exit 1; my canary `grep -rn "maxDuration" src` = **61** | true, canary missing |
| `testTimeout` in `vitest.config.ts` | **NONE** | exit 1; my canary `grep -rn "testTimeout" src --include=*.test.ts` = **79** | true, canary missing |
| `plain text\|markdown` in `conv.txt` | **NONE** | exit 1; my canary `grep -c -i -E "text" conv.txt` = **20** | true, canary missing |
| no `import * as X from "@/app/actions"` anywhere | **NONE** | exit 1 | true, canary missing |

**No absence claim in the document is false.** Four lack canaries; the fourth is the
one that matters, because S9 instrument (b) rests on it - the namespace-import grep
is the document's own stated defeat vector for an identifier-based call-site check,
and it is the one absence it asserts without a control. Recorded as MINOR m1.

### 7. The residual register: one half silently dropped, RS3's closure is legitimate

Revision 1 carried RS1-RS14; revision 2 carries RS1-RS15. Mapping every row:

- **RS1** inverted (fork -> AL1) - carried with consequences, correct.
- **RS2, RS4-RS7, RS9-RS11, RS13, RS14** - present, each with owner, instrument,
  step.
- **RS3 CLOSED** - legitimate. It was a scope question to the owner and Ruling 29
  answered it; the struck row stays visible with its reason. This is disposal (b)
  done correctly.
- **RS12** updated for the new shape.
- **RS15** new, and correctly a residual rather than a claim.
- **RS8 PROMOTED to W1a steps 1-2** - and this is where a requirement was lost.
  Revision 1's RS8 read, verbatim: "**The shipped conversation-POST builder has NO
  test at all.** `src/app/actions/messaging.ts` has no test file, **and**
  `src/lib/canvas/inbox.test.ts` contains zero occurrences of `createConversation`".
  Revision 2's RS8 narrows to "the missing behavioural test for `createConversation`"
  and W1a step 1 writes only `src/lib/canvas/inbox.test.ts`. **The
  `src/app/actions/messaging.ts` half is in no wave, no residual and no owner check.**
  I re-measured it: `ls src/app/actions/ | grep -i messag` returns six entries, none
  of them `messaging.test.ts`; and
  `grep -rln "createConversation\|sendCanvasMessageAction\|postMessageDraftAction\|..." src --include=*.test.ts`
  returns nine files, none under `src/app/actions/`. Section 3.2 still states the
  fact and then never disposes of it. Meanwhile W1a's exemption asserts that
  "`createConversation`'s existing caller chain (`sendCanvasMessageAction` ->
  `postMessageDraftAction`) is live and must stay green" - green against a suite the
  document itself measured does not exist. MAJOR M3.

No other residual is contradicted by the revision. Both `owns` lists in 7.1 are
**byte-identical to my own re-run** of the same two greps - twelve files and nine
files, in the same sort order. That claim is true.

### 8. Persistence (S4): no 42P10 exposure, but instrument (d) does not do what it says

**42P10: clean.** The design never upserts. `beginSend` INSERTs and treats `23505`
as the refusal; `settleSend` and `resolveOpenSend` are UPDATEs by id. A partial
unique index is a perfectly good constraint and a useless upsert arbiter, and the
document says exactly that, citing
`supabase/migrations/20261008000000_scheduled_releases.sql` - whose comment I opened
at `:131-133` and whose index is at `:134-136`, both exactly as cited. Correct, and
this is the repo's known hazard handled properly rather than tripped.

**`recipient_ids text[]` and instrument (d): defective.** The instrument says "dump
every row the fake holds, flatten `recipient_ids`, and assert **no stored value
contains `@`**", paired with a structure assertion that no column name matches
`/email|address|login|name/`. Two problems, and they pull in opposite directions so
one of them is guaranteed to bite:

1. **Over-broad.** "no stored value" over every row includes `body` and `subject`,
   which are the instructor's own free text. An instructor writing "reply to me at
   prof@uni.edu" makes the guard red on correct behaviour. The recorded consequence
   in this repo is that the implementer loosens the wall.
2. **Under-scoped, if narrowed to the flattened column.** `excluded_summary` is a
   server-rendered sentence built from roster entries - and the design *mandates* a
   fixture whose Canvas rows carry `login_id` and `email`. That column passes the
   `/email|address|login|name/` column-name filter and is exactly where a rendered
   student identifier would land. Flattening `recipient_ids` does not reach it.

The instrument needs an explicit column list that includes `excluded_summary` and
excludes `body`/`subject`. MAJOR M5.

Two further S4 findings are in Part B: the `resolveOpenSend` signature (B4-ii) and
the store fake's unpinned uniqueness predicate (B4-iii).

---

## Part B - findings not in the brief's list

### The silent-green failure, named specifically

This can be built, pass `npx tsc --noEmit`, `npm run lint`, the
`Compiled successfully` line, all 20,200 vitest tests and every structure test, and
still be wrong in three ways no gate here can see:

1. **Canvas can create one group thread instead of N private ones** and every
   specified test still passes, because every test asserts what request the app
   SENT. The document is honest about this (section 12 calls OC11 the sharpest open
   question) - but see m2: its own quoted source answers it, and it declines to say
   so.
2. **The one-active-student course takes a different Canvas code path entirely** -
   BLOCKER B1 below.
3. **The modal can auto-resolve an open row** and the entire durable guard becomes
   decorative, with every server-side instrument still green - BLOCKER B4-i below.

**Gate/instrument multi-path check, as briefed.** Every multi-path run in the
document is spelled `npm run test:paths -- <paths>` (three wave gates, section 8.2)
and each reads its exit code with `echo $? > wNx.code` rather than through a pipe.
I read `src/tools/vitest-paths/cli.ts` to confirm the wrapper accepts a directory
argument (`probe` returns `"dir"` for a directory and `null` - a PRE-CHECK FAILURE -
for a non-existent path), and confirmed `src/lib/canvas.pullback.test.ts` and
`src/supabase-migrations.structure.test.ts` both exist so the pre-check will not
refuse. **No raw multi-path `vitest` or `npm test` command appears anywhere in the
document.** That is clean.

### The weakest requirement

Asked as the brief asks it - which single clause is most likely to be implemented
exactly as written and still produce a bad result - the answer is **S8's forbidden-word
scan**, and it is bad enough to be a blocker (B2).

---

## Blockers

### B1 - the N=1 course takes the reuse path, and the subject is silently dropped

**NEW.** Class: *a construction specified for the general case whose boundary case
enters a different code path with different documented semantics, invisible to every
instrument because every instrument asserts only what was sent.*

Section 0 states the design's central promise: "a false `group_conversation` creates
individual private conversations with each recipient". S1's cardinality check rejects
only the empty array and lengths above 100. **There is no N=1 branch**, and a course
with exactly one active student is entirely ordinary (a seminar; a course where one
student is active and the rest are `invited`, which E2 now filters out).

From the controller source the document itself quotes, at lines I opened myself:

```
447:    batch_private_messages = (!group_conversation && @recipients.size > 1) || force_individual_messages
448:    batch_group_messages   = (group_conversation && value_to_boolean(params[:bulk_message])) || value_to_boolean(params[:force_new])
456:      if batch_private_messages || batch_group_messages
503:      else
504:        @conversation = @current_user.initiate_conversation(@recipients, !group_conversation, subject: params[:subject], context_type:, context_id:)
```

With the `roster` variant at N=1: `group_conversation` absent -> false, so
`batch_private_messages` is false (`@recipients.size > 1` fails);
`force_new` absent -> `batch_group_messages` is false. The `if` at `:456` is false,
and control reaches the **`else` at `:503`** - `initiate_conversation`, not
`ConversationBatch.generate`.

That is the path the API documentation describes in its own opening sentence,
verbatim from `conv.txt:448-450`: "Create a new conversation with one or more
recipients. **If there is already an existing private conversation with the given
recipients, it will be reused.**" And `conv.txt:465-466`, the `subject` row of the
parameter table: "The subject of the conversation. **This is ignored when reusing a
conversation.** Maximum length is 255 characters."

So for a one-active-student course, A29 as specified: appends the message to whatever
private thread already exists with that student, and **silently drops the subject the
instructor confirmed**. K6 ("what is sent is what was confirmed") is violated on the
wire. The durable row records `outcome: accepted` and a one-addressee receipt, and
the instructor is told the send succeeded.

This is also exactly what `force_new=1` exists to prevent on the shipped
single-student path - the design removes it from the `roster` variant for the
multi-recipient hazard (correctly) without noticing that at N=1 the multi-recipient
hazard does not exist and the reuse hazard does.

No specified instrument can see it: S2 asserts the emitted parameters, S5 asserts the
emitted values, S3 classifies the HTTP status. All pass.

The document had both quotes in hand. Neither appears in it.

### B2 - S8's forbidden-word list forbids S8's own required sentence

**REPEAT-OF-"no wall may be red against the content it governs"** (the class Ruling
12 created; corrective rule: run every new wall against the real content before
writing it down - the same rule fixes both).

S8's instrument bans, "matched case-insensitively on a word boundary":
`delivered`, `received`, `emailed`, **`sent`** - the last added by Ruling 26.

S8's pass condition, in the same construction, requires: "the result surface carries
a sentence saying the app cannot confirm an email arrived **and that each student's
own Canvas notification settings decide whether one is sent**".

The required sentence contains `sent` on a word boundary. The required copy fails the
required scan. An implementer has three moves and all three are bad: omit the honest
sentence (fails the pass condition and deletes the one requirement S8 exists for),
write it and go red (loosens the wall - the recorded consequence), or contort the
copy around a word the subject matter is about.

The scan is undecidable in a second way, which is the same defect Ruling 26 struck
elsewhere in this chain ("bans arithmetic over an A29 value, which no text scan can
decide"): S8 scopes the ban to **"user-facing string literals"**, and no source-text
scan can decide which literals are user-facing.

Measured as green on arrival over the feature's six existing files
(`grep -n -i -E '\bsent\b' <six files>` -> exit 1; canary
`grep -rn -i -E '\bsent\b' src --include=*.tsx | wc -l` = **57**). It is green only
because none of the required copy has been written yet.

The corrective direction: ban the delivery **claim pattern** ("sent to", "N sent",
"was sent"), not the bare token - a word-level denylist cannot distinguish
"Sent 5 of 11" from "whether one is sent", which is the whole distinction the
requirement is about. **This finding lands on Ruling 26 as much as on the seat**: the
ruling issued the bare token and the seat adopted it without running it against its
own pass condition.

### B3 - the state machine is not total, and the uncovered event fires after the INSERT

**REPEAT-OF-"a totality claim that is not total"** (the class Ruling 22 created;
corrective rule: enumerate every reachable combination and give each an outcome -
the same rule fixes both).

Section 6 opens "The state machine - TOTAL, and it is eight rows" and claims the
first match wins. It is not total.

- **There is no row for `send` with zero active recipients.** Row 3's
  `no-active-students` refusal is specified for `preview` only. Rows 4 and 5 test the
  over-limit and the drift comparand; a caller that never previewed and passes
  `confirmedCount = 0` against a live count of 0 passes both. The document explicitly
  contemplates that caller: "The worst a lying client achieves is what a client that
  never previewed at all would get". Control reaches **row 6**.
- Row 6 orders `beginSend` INSERT (`state='open'`, with `recipient_ids`) **before**
  the POST - S4 instrument (a) pins that order. S1 then says the builder "throws
  before emitting anything when the array is empty".
- So the sequence is: INSERT an `open` row, throw, no POST, no `settleSend`. The
  return value is undefined by the document, no `RefusalKind` covers it, and the row
  now holds the partial unique index on `(user_id, course_id) WHERE state='open'`.
  **The course is blocked until the instructor manually resolves a send that never
  happened.**

The same hole swallows any other builder throw between INSERT and POST - a duplicate
surviving S5's dedup, or a `user_id` that fails the allow-pattern. S4's own safe-
direction argument ("a row wrongly stuck open costs one click") covers a *settled*
send, not one that emitted nothing; and there is no refusal for the instructor to
read that explains it.

This is Ruling 22's exact failure mode ("an implementer guesses, and both guesses are
wrong"), reproduced inside the construction written to satisfy it.

### B4 - three requirements are marked KEPT and their instruments do not reach them

**REPEAT-OF-"a requirement marked kept whose instrument does not exist or does not
reach it"** (the class Ruling 11 created; corrective rule: give it an instrument or
route it - the same rule fixes all three instances, so they are one class).

**(i) Ruling 21's client half has no enforcer at all, and section 12 denies it.**
Section 9.2 lists "Ruling 21 (no self-resolution) - **KEPT in a reduced form**". The
server half is real and instrumented (S4 `settleSend` leaves `state='open'` for
`unknown`; instrument (c) drives it across `vi.resetModules()`). The client half is
not. `resolveOpenSend` resolves whatever it is told; nothing stops T6 calling
`resolveBulkCourseMessageSendAction(id, "dismiss")` on mount, or on the same click
that starts the next send. That single line turns the whole S4 guard into decoration,
and **every server-side instrument stays green**, because each one drives the actions
directly in node-env where no component is rendered.

It is not routed either: OC6 covers the gate's display, OC7 the confirm's contents,
OC8 the delivery/per-student copy. None covers auto-resolution. And section 12 closes
with "**no criterion in this document is enforced only by a render**" - which is
false for exactly this criterion. Ruling 3 already ruled on the mechanism-shaped
version of this ("a boolean a component always passes as `true` satisfies it"); the
resolution is by id, so the form is satisfied and the enforcement is not.

**(ii) `resolveOpenSend`'s declared signature drops the only tenancy guard it has.**
S4 declares `resolveOpenSend(id, choice: "dismiss" | "retried")` and then says in
prose "scoped `.eq("user_id", userId)`" - a parameter the signature does not have.
Section 6 row 8 states the requirement correctly ("the row is `open` and
`.eq("user_id", ...)` matches"). This matters more than a typo because the same S4
block specifies "**No RLS policy for `authenticated`**, service-role access only":
with RLS enabled and zero policies, the service-role client bypasses row-level
security entirely, so `.eq("user_id", ...)` is the **only** tenancy control on this
table. An implementer who writes the declared signature ships an IDOR on a UUID that
releases another account's send guard. Sibling functions show the seat knows the
shape - `readOpenSend(userId, courseId)` takes it. No instrument anywhere in S4 or S7
drives a cross-tenant resolve.

**(iii) The store fake's uniqueness predicate is never pinned to the migration's.**
Ruling 23 required "a faithful in-memory fake of the store, not a seam mock", and S4
instrument (b) turns on the fake enforcing the partial unique index. Nothing pins the
fake's predicate to the DDL's `where state = 'open'`. There is no local database
(`docs/loop/this-repo.md` section 6) and
`src/supabase-migrations.structure.test.ts` is lexical only - I opened `:147` (the
unterminated-literal test) and `:156` (the apostrophe-doubling test) and neither
reads an index predicate. So the fake can enforce `(user_id, course_id)`
unconditionally while the migration ships the partial form, or the reverse, and
instrument (b) is green either way. Instrument (b) then proves a property of the
fake. The cheap fix is a structure assertion pinning the migration's predicate text
and constructing the fake from the same constant.

---

## Majors

**M1 - the wave gate commands do not run the `owns` set section 7 derived.**
Section 7 is careful and correct; section 8.2 then does not use it.

- W2's gate is `npm run test:paths -- src/lib/bulk-course-message
  src/app/actions/bulk-course-message.test.ts src/app/components/courses`. Section
  7.2's own "walkers that will actually bind" table names, for W2's write set:
  `src/app/actions/action-guard-coverage.test.ts` (three new `"use server"` exports,
  `GUARD_CALL` at `:61`, the alias rejection at `:406` - both opened, both as cited),
  `src/lib/use-server-exports.test.ts`, `src/lib/no-emojis.test.ts`,
  `src/source-bytes.structure.test.ts`,
  `src/tools/vitest-paths/gate-commands.structure.test.ts`,
  `src/lib/client-state-sweep.registry.test.ts` (`:133`, opened, as cited),
  `src/lib/canvas-client-boundary.test.ts` and
  `src/lib/module-graph/runtime-import-graph.test.ts`. **None of those paths is
  matched by any of W2's three filters.** W2's gate can pass with the guard-coverage
  walker red.
- W1a's gate is `src/lib/canvas src/lib/canvas.pullback.test.ts`. As a substring
  filter `src/lib/canvas` does reach `src/lib/canvas-pagination-guard.structure.test.ts`
  and the other `src/lib/canvas-*` files. It does not reach
  `src/app/actions/canvas-inbox.message-replies.test.ts`, which section 7.1's own
  first list names as reading `canvas/inbox` as source text.

The document's answer ("the full suite runs at the chunk's gate regardless") is true
and is not the point: the wave gate exists to catch an over-reaching implementer
before the next wave builds on them.

**M2 - S1's LOAD-BEARING label contradicts its own provenance clause, and the union
uses a rejectable type where an unrepresentable one is free.** Detail in item 3
above. The corrective direction is `readonly number[]` (or a branded id), which makes
`"course_3"`, `"401,402"`, the whitespace/newline forms and the `uuid:` form
unrepresentable rather than rejected - the construction S1(a) itself argues for two
paragraphs earlier. The accept/reject table stays useful as a backstop; the claim of
load-bearing does not survive the provenance clause printed beneath it.

**M3 - half of RS8 was dropped between revisions with no disposal.** Detail in item 7
above. `src/app/actions/messaging.ts` still has no test file, W1a's exemption leans on
that chain being "green", and neither the residual register nor any wave nor any
owner check now carries it.

**M4 - the leverage claim's class is stretched and its earned/inherited measurement
discriminates nothing.** Two separate problems in section 10:

- **The denominator is 1.** `leverage.md`'s failure mode B says to grep the mechanism
  "against every comparable module" and judge inherited if the count "clusters near
  all of them"; its own struck rows use denominators of 352, 135 and a few hundred.
  Section 10 measures `grep -rn 'recipients\[\]' src` = 1 and concludes earned. A
  test with n=1 returns no information. The comparable set for the stated mechanism
  ("the emitted set is derived from a live read in the same invocation") is modules
  that read a roster live and act on it in the same server invocation; I measured
  `grep -rln "listStudents\|listCourseRoster\|listStudentGradeSummaries" src
  --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l` = **16**, including
  `src/app/actions/accommodations.ts`, `src/app/actions/canvas-inbox.ts` and
  `src/lib/workflows/registry/steps.course-setup.rosters.ts`. The claim may still be
  earned on the narrower ground that none of them emits the read into a message
  transport - but that argument is not the one the document makes, and the count it
  does report cannot support it.
- **The class does not fit.** `leverage.md` defines GUARANTEED as "an output property
  the code holds **regardless of what the model returns**, including by making no
  model call at all". A29's send path makes no model call - and neither does any of
  the 16 above, nor any of the non-LLM Canvas actions in this tree, so "no model
  call" is inherited here, not earned. The real mechanism is recipient-set
  provenance, which is not about a model at all. `leverage.md` is explicit about what
  to do: "the first time a future feature's checked, non-marketing claim does not fit
  any row, **add a row** with its own `file:line` once the feature is built, rather
  than stretching an existing category." The document stretches.

The removal test itself (S5's, asserting on the emitted wire multiset) is sound and I
am not reopening it - it is a genuine improvement on revision 1's count-only version
and it satisfies `leverage.md`'s state-the-deletion-then-trace-the-assertion
procedure.

**M5 - instrument (d)'s no-`@` assertion is over-broad on `body` and blind to
`excluded_summary`.** Detail in item 8 above.

**M6 - nothing deletes a `bulk_course_message_sends` row, and the document does not
say so.** The table stores the full message `body`, the `subject`, the
`recipient_ids` and `excluded_summary` per send, indefinitely. The only deletion path
is `on delete cascade` from `auth.users`. The data seat's checker question in
`docs/loop/seats.md` ("What deletes this data, and when? 'Nothing' is an answer, but
it must be stated") is unanswered, and for a table holding message bodies and
per-student identifiers that is a privacy statement the design owes.

**M7 - step 4 is not a behaviour-preservation proof, and S3's "keeps its behaviour"
is false against S1.** Detail in item 5 above.

---

## Minors

- **m1** - four absence claims with no canary (`maxDuration` in `src/app/page.tsx`,
  `testTimeout` in `vitest.config.ts`, `plain text|markdown` in `conv.txt`, and the
  namespace-import grep). All four are TRUE - I re-ran each with a canary (61, 79,
  20, and exit 1 respectively). The fourth is the load-bearing one, since S9
  instrument (b) names it as its own defeat vector.
- **m2** - section 12 calls OC11 "the sharpest open question", but the document's own
  quoted controller block answers it at the SOURCE level: with N > 1,
  `group_conversation` absent and `force_new` absent, `cc.rb:447` makes
  `batch_private_messages` true and `:474` passes `group: batch_group_messages` =
  false, so the batch is generated as private. The document applies SOURCE
  asymmetrically - authoritative enough to delete `force_new` from the design,
  not authoritative enough to reduce the uncertainty it calls sharpest. Say both, or
  neither.
- **m3** - S2 clause 1's `getAll("recipients[]")` "has length N" leaves `N` unbound;
  only S5's fixture anchors it to a known truth.
- **m4** - S2's tree-wide wall is written as permission ("a structure test **may**
  require...") with no id, no owner and no wave write set. A construction nobody owns
  is not a construction.
- **m5** - RS11 says "One [new whole-tree walker] is added here (S9's)". S2's
  tree-wide wall would be a second, and it inherits the same 5s default.
- **m6** - `src/lib/canvas/conversations-post.structure.test.ts` (W1a step 5) is a
  driven-send behavioural test carrying a `.structure.test.ts` name; in this tree
  that suffix names source-text walkers and
  `src/file-size-ceiling.structure.test.ts`'s siblings are all of that kind.
- **m7** - "A CORRECTION TO REVISION 1'S EXPRESSION, and it would have shipped a
  wrong assertion" is true only under the N-id form; under revision 1's own course
  variant (one `recipients[]` value) `[...keys()].sort()` returned three or four keys
  and was correct. The document qualifies this correctly in its next sentence; the
  commit message does not.

---

## What I verified sound and am not reopening

Stated in one line each, so a later round does not re-litigate them:

- **Every `file:line` citation I opened resolves and says what the document says.**
  I opened, and confirmed: `src/lib/canvas/inbox.ts:384/400/405/406/409`;
  `src/app/actions/messaging.ts:301/405/410` and the `:436` prompt line;
  `src/lib/canvas/listings.ts:248/250/286/288/318/323/334`;
  `src/lib/canvas-remote-url.ts:156` (= 20);
  `src/lib/courses-table-helpers.ts:603/718`;
  `src/lib/supabase/courses.ts:73-84`;
  `src/app/components/courses/CourseRow.tsx:186-188/314`;
  `LmsCell.tsx:30-32/69/148`; `CellMenu.tsx:22-35/49/58/137/155`;
  `src/lib/canvas-pagination-guard.structure.test.ts:76/131`;
  `src/app/actions/action-guard-coverage.test.ts:61/406`;
  `src/supabase-migrations.structure.test.ts:147/156`;
  `src/lib/canvas-core.ts:49/126/174`; `package.json:18`;
  `src/lib/supabase/types.tables-c.ts:67`;
  `src/lib/client-state-sweep.registry.test.ts:133`;
  `src/lib/workflows/headless.test.ts:186` (= 154);
  `supabase/migrations/20261008000000_scheduled_releases.sql:131-136`;
  `cc.rb:447-448/451/474`; `conv.txt:453` and the `group_conversation` table row.
  **Zero citation errors found.** After Ruling 15's M6 and Ruling 6, that is worth
  saying.
- **Both line counters agree on all eleven files in 3.1**, re-run by me in both
  shells (`wc -l` from Bash and `@(Get-Content $f).Count` from PowerShell on four of
  them): 432 / 428 / 124 / 522 / 77 / 694 / 792 / 225 / 834 / 125 / 608. The 42-line
  discrepancy does not apply here.
- **Both `owns` lists in 7.1 reproduce byte-identically**, twelve files and nine.
- **The disposition table (9.1) is accurate about revision 1.** I checked five rows
  against `git show e2f65d1:...`: the allow-pattern was `/^(?:\d+|course_\d+)$/` at
  rev1 `:595`; the key expression was `[...new URLSearchParams(body).keys()].sort()`
  at rev1 `:638`; the capped read was a note (rev1 `:883-885`); OC10 was the check
  "that decides whether the feature does what the owner asked for" (rev1 `:225`); RS8
  was a residual (rev1 `:1537`). All eleven S-ids survive the restructuring with the
  same numbering.
- **The 42P10 hazard is handled correctly**, not tripped: no upsert anywhere, insert
  plus `23505`.
- **The drift comparand cannot change who is messaged** - traced against the ordered
  state table, the claim is true.
- **Ruling 10's recorder lesson is correctly applied**: two seams, the reason for
  each given from `vitest.setup.ts`'s own header (I read the file: `canvasFetch`
  dials `node:https` and is invisible to a `fetch` stub, and a test's own
  `vi.stubGlobal` never sees the throwing stub), plus a mandatory sabotage check on
  the instrument itself.
- **No raw multi-path `vitest`/`npm test` appears anywhere**; all three wave gates use
  `npm run test:paths --` and read the exit code from a file.
- **The already-exists case.** I argued the strongest version and it does not hold at
  this revision. Canvas's own compose can send one message to `course_<id>` as
  individual private conversations under 100, which is what made revision 1 thin -
  but the N-id form buys three things Canvas's compose does not: a server-decided
  recipient set with stated exclusions, a durable addressee record queryable by a
  later session, and a refusal path that fires before anything goes out. The owner's
  "no courses should exceed 100" removes the only cohort where Canvas's native path
  was outright unsafe, so the remaining advantage is real and modest. **Reframing the
  build as reachability work is not warranted.**

---

## Verdict

**NOT BUILDABLE AS WRITTEN.**

| Severity | Count |
|---|---|
| Blocker | 4 |
| Major | 7 |
| Minor | 7 |

Blockers by class, per the caps card's output contract:

| Id | Class | NEW / REPEAT |
|---|---|---|
| B1 | A construction specified for the general case whose boundary case enters a different code path with different documented semantics, invisible to every instrument because every instrument asserts only what was sent | **NEW** |
| B2 | A wall that is red against the content it is required to govern | **REPEAT-OF-"no wall may be red on arrival"** (Ruling 12's class; same corrective rule - run the wall against the real content before writing it down) |
| B3 | A totality claim that is not total; the uncovered event leaves a durable row wedged | **REPEAT-OF-"the state machine must be TOTAL"** (Ruling 22's class) |
| B4 | A requirement marked KEPT whose instrument does not exist or does not reach it (three instances: Ruling 21's client half, `resolveOpenSend`'s tenancy scope, the store fake's unpinned predicate) | **REPEAT-OF-"marked kept with no instrument"** (Ruling 11's class) |

I have not relabelled anything to buy a round. B2, B3 and B4 are repeats because the
same corrective rule that closed the earlier instance closes these; B1 is genuinely
new and is the one finding in this check that no prior ruling anticipated.

Three of the four blockers are REPEAT classes, so under `docs/loop/iteration-caps.md`
they go to **disposal now** and the architecture seat is not re-dispatched for them.

## Stopping point

**RULINGS**, and then design for one item only.

- **B2 is a ruling defect as much as a seat defect.** Ruling 26 issued the bare token
  `sent` and the seat adopted it without running it against S8's own pass condition.
  The orchestrator owns replacing the token with a claim pattern, or exempting the
  negated form. No amount of revision by the seat fixes a word it was told to ban.
- **B3 and B4 are disposals against Rulings 22 and 11 respectively** - each needs the
  orchestrator to say whether the missing rows and the missing instruments are
  written now, relocated to the test seat, or carried as residuals with owners. Note
  that B4-ii is not a residual candidate: a tenancy scope missing from a declared
  signature under a service-role client with no RLS policy is a correctness
  requirement, not a measurement gap.
- **B1 is the one item that needs DESIGN**, and it is small: one branch decision for
  N = 1 (send `force_new` on a single-recipient roster request, or route N = 1
  through the `user` variant, or refuse below 2 with a stated reason), plus the two
  documentation sentences it rests on quoted into section 1.
- **Measurement remains owed** on OC1, OC2, OC4, OC5, OC6, OC7, OC8, OC10 and OC11 -
  correctly recorded as RS4, correctly owner-only, and not blocked by anything above.
  I would add one cheap item to that list ahead of W1a rather than after it: a single
  authenticated `curl` of `POST /api/v1/conversations` with two numeric ids and no
  `group_conversation` against the owner's sandbox settles OC11 and B1 together, for
  less than the cost of one wave.
