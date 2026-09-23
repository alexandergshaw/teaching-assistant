# A29 - orchestrator rulings, 2026-09-21

The check of `docs/a29-ac.md` revision 1 returned NOT CLEAN: 4 blockers (2
repeat, 2 new), 7 majors, 5 minors, and the explicit verdict that the
criteria are not ready for an architecture pass by rewriting alone. Two of the
four blockers are REPEAT classes, so under `docs/loop/iteration-caps.md` they
go to disposal now and the criteria seat is NOT re-dispatched for them. This
file carries the disposals. An architecture pass reads it alongside the
criteria; where they conflict, this file wins.

The owner has not answered the fork. The working default stays (B-prime):
real email from the instructor's connected Outlook.

## RULING 1 - key the double-send guard on the COURSE, never on the body (B2, REPEAT)

K9 refused a re-send of "the same body to the same course" after a partial or
lost outcome. K13 clears the saved body at confirm. Together they guarantee
the body differs on the retry: the function is killed at the 60s cap, the
instructor reloads, the text is gone, they retype or redraft it, and a
one-character difference walks straight past K9. **The two rulings defeat each
other, and the hazard is a whole-class double send.**

**THE GUARD IS KEYED ON THE COURSE HAVING AN UNRESOLVED ATTEMPT, whatever the
body says.** Any send to a course with an unresolved prior attempt is refused
until the instructor resolves that attempt by an explicit choice that shows
them what it was and what is known about its outcome. Relocated to the
architecture and reliability passes as an obligation, with that as the pass
condition.

## RULING 2 - the attempt record is DURABLE (B3, NEW)

K7 and K9 both pass under vitest with a module-level `Set` or `Map`, and a
Vercel function killed at 60s, or the next call landing on another instance,
keeps none of that. The criteria never said the record must survive the
process. **IT MUST: the attempt record is written to durable storage BEFORE
the first outbound request, and read from durable storage by the guard.** A
test that proves the guard with in-memory state proves nothing about the
hazard it names, and the instrument must say how it stands in for a process
that dies.

K5 and K7 also contradict each other: K5 lets the confirm be a client-side
signature the server recomputes from what the client sends, which proves
nothing was confirmed and cannot satisfy K7. **THE CONFIRMATION IS
SERVER-ISSUED** - a token the server mints when it shows the confirm, bound to
course, recipients, subject, body and channel, and consumed once.

## RULING 3 - the remaining labels become constructions (B4, REPEAT)

Four criteria still describe a property instead of making it impossible to
violate. Relocated to the architecture pass, each with its construction:

- **K8, the count.** A component that types the outcome from the action's
  return and shows `recipients.length` passes every clause - exactly the A28
  defect this repo shipped and fixed today. **THE CLIENT RECEIVES ONLY THE
  SUMMARISER'S OUTPUT**, or an opaque collection with no length. The display
  cannot compute a count because it is never given one to compute from.
- **P2, the batch state.** "Every student in a batch shares its state" is
  prose, and K8 permits per-recipient records, so a fixture can fake a
  per-student outcome Graph never returns. **THE TYPE CARRIES STATE PER BATCH,
  NOT PER RECIPIENT**, so the shape is unrepresentable.
- **K9, the informed choice.** A boolean a component always passes as `true`
  satisfies it. **THE CHOICE IS A SERVER-ISSUED RESOLUTION** of the specific
  attempt record, by id - not a flag.
- **K13, cleared at confirm.** A storage helper tested in isolation and never
  called at confirm passes. **RE-LABEL IT A READING CLAIM** unless the
  architecture makes the clear part of consuming the server-issued token.

## RULING 4 - measure requests, not import edges (B1, NEW)

The checker measured the capability walls on day zero and **both are red
against today's tree before a line of A29 exists.** The roster reader reaches
the model client through a dynamic import; the course row reader reaches both
model clients across 416 modules; and a barrel re-export puts
`sendMessageDraftByEmailAction` inside every workflow's import closure despite
zero call sites. An implementer facing a wall that is red on arrival either
copies the readers to escape it or loosens it until it means nothing.

**THE INSTRUMENT IS THE REQUESTS A SEND ACTUALLY MAKES**: record every
outbound request during a driven send against an allow-set of hosts - Canvas,
the chosen channel, Supabase and the Microsoft token endpoint, the last two of
which the old allow-set omitted. Import closure measures what is reachable,
not what is called. This goes to measurement first and then the architect.

## RULING 5 - majors, carried as obligations

- **A refused send must not lose the text.** Clearing at confirm loses the
  instructor's text when the send is refused before anything went out -
  Outlook not connected, mail send not granted, the roster read failing at
  send time. Nothing outbound happened, so nothing is cleared.
- **Assert each state's count**, not only that the states partition the set: a
  summariser that swaps accepted and refused passes a partition check.
- **Define the base set once.** P2 puts excluded students into the outcome
  while K3 says inactive students are never included. Say whether the confirm
  count is recipients or roster.
- **Ambiguous failures are `unknown`, never `refused`.** A 5xx, a 504 or a
  network error after the request went out may have delivered. Treating it as
  refused lets "resend to the rest" re-send with no explicit choice.
- **SENT ITEMS KEEPS EVERY ADDRESS.** The existing Graph send sets
  `saveToSentItems: true`, so every BCC address is kept permanently in the
  instructor's own Sent Items. That is a privacy fact the owner has not been
  shown; it goes to the owner as an explicit question, not buried in a
  criterion.
- **Restore the dropped clause:** when the Canvas-profile address cannot be
  read for the instructor's role, that is ONE reason, not N separate "no
  address" rows.
- **Reuse the plain-text drafter.** `draftAnnouncementAction` already asks the
  model for plain text and serves three paths; steering reuse to A21's
  Markdown drafter manufactures the formatting hazard K10 then has to guard.

## RULING 6 - minors

Cite by symbol where the checker found lines off; the grep for course-tile
draft creators returns five sites, three of them announcement kinds; the tile
email is Canvas-sourced only when the import was Canvas's own export, since a
plain CSV takes any address; K1's wording states its failure backwards; P2
under (B-prime) needs an instrument line. The backlog row's stale text - the
old R3, the double meaning of R4, and the leftover "default (A)" - is mine and
I am fixing it.

---

# Round 2 - rulings on the check of `docs/a29-architecture.md`

NOT CLEAN: 7 blockers (4 new, 3 repeat), 7 majors, 5 minors, and the verdict
that it is not buildable as written. The Canvas evidence section is SOUND and
is not reopened: the checker re-fetched both pages live and every quoted
string is verbatim on the page, including the odd `429 Forbidden (Rate Limit
Exceeded)`, the one-simultaneous-request advice, `mode`'s "ignored if ... there
is just one recipient", the batches endpoint returning only running batches,
and the absence of any email statement on the Conversations page. It also
confirmed the document never upgrades a Canvas SOURCE claim to documentation.

## RULING 7 - MY RULING 4 CARRIED A FALSE PREMISE. Corrected here.

Ruling 4 said a barrel re-export puts `sendMessageDraftByEmailAction` inside
every workflow's import closure "despite zero call sites". Measured, both
halves are wrong: no barrel re-exports it, and it HAS a call site at
`MessageDraftsTab.tsx:222`. I have verified that myself.

What survives is the RULING, not its example: measure the REQUESTS a send
makes, not import edges. But the architecture cites Ruling 4's measurement as
settled fact and re-measures nothing, which is how a wrong premise travels.
Re-derive the wall's justification from a measurement taken now.

## RULING 8 - the token authorises the RUN, not the request (B1)

C7 says a consumed token must send nothing; C6 says the pump calls `sendNext`
with that token once per recipient. For any class larger than one student
those cannot both hold, and the document never reconciles them. An implementer
will silently pick one: either the pump ships and the single-use rule is
dropped, or the rule ships and the feature messages ONE STUDENT PER CONFIRM.
Both pass every gate.

**THE TOKEN AUTHORISES THE ATTEMPT.** It is minted at confirm, bound to
course, recipients, subject and body, and consumed when the attempt reaches a
terminal state - not on the first outbound request. What must be single-use is
the CONFIRM, not each invocation. State the invariant in those terms and give
it an instrument that drives N invocations, since the contradiction survived
because nothing exercises a multi-invocation pump.

AND FIX C9 WITH IT: clearing the draft "when a token is consumed (the first
outbound request)" destroys the instructor's text at the moment the run
becomes unable to continue.

## RULING 9 - the recipient guard is an ALLOW-PATTERN on the emitted value (B4)

The privacy guarantee rests on "the transport takes one recipient id, so the
Canvas docs-versus-source conflict cannot arise". As specified it does not
hold: a `string` carries two. `"401,402"` passes the type check, passes
`getAll("recipients[]").length === 1`, and passes the `/^(course|group)_/`
denylist - as do `section_12` and the `uuid:` form THE DESIGN ITSELF QUOTES
from the `recipients[]` description. An enumerated two-prefix denylist over an
unrestricted value is the shape this repo has recorded failing again and
again.

**THE SHIPPED CODE ALREADY HAS THE RIGHT GUARD AND THE DESIGN DROPPED IT.**
`src/app/actions/messaging.ts:301` validates `/^\d+$/` on the emitted value
before calling `createConversation` - I have verified it. Put an ALLOW-PATTERN
on the emitted value INSIDE the builder, and pin that, not a count plus two
prefixes at the test.

## RULING 10 - the request recorder must sit where an unexpected host is visible (B2)

C12 installs the recorder at `canvasFetch` and the Supabase client factory,
and then fails when "any other host is requested". A recorder at those two
seams can only ever see those two hosts, so the failure arm is unreachable and
the instrument measures nothing.

The stated reason for rejecting a global recorder is backwards: `vitest.setup.ts`
replaces `globalThis.fetch` with a throwing stub, and its own header says a
test that installs its own `vi.stubGlobal` never sees it. A recording
`vi.stubGlobal` is therefore the ONLY seam that can observe a model host.
Install it there.

## RULING 11 - three requirements are marked kept and have no instrument (B3, B6, M5)

The disposition table reports these as discharged and they point at nothing:

- **C5 has no partition clause.** Ruling 5's "assert each state's count" and
  K8's own fixture bullet both route into text that does not exist - a `grep`
  for "partition" finds only the citation. So the summariser may swap accepted
  and refused and stay green. Write the assertion over a fixture, per state.
- **K1, the LMS gate, has no construction, no instrument and no direction of
  failure** - it points at a JSX prop in a repo where no component is rendered
  by any test. It is the criterion taken straight from the owner's own words.
  It needs a SERVER-SIDE assertion: the entry point makes no Canvas request for
  a course in either excluded category.
- **K2's third failure clause** - a missing credential and an unreachable host
  producing the same reason - is marked discharged by constructions that do
  not mention reason-distinguishability. Map it or route it.

A requirement whose instrument is missing is deleted, whatever the table says.

## RULING 12 - no wall may be red on arrival (B5)

C1's structure test requires `mode` to appear in ZERO non-test source files.
Measured: 444 occurrences, because `mode` is an ordinary identifier in this
tree. That is Ruling 4's own class, reproduced inside the construction the
privacy guarantee rests on - and the recorded consequence is that the
implementer loosens the wall rather than fixing it, unrecorded.

Scope the assertion to the conversation-POST builder, or pin the emitted
parameter names rather than tree-wide token absence. RUN EVERY NEW WALL
AGAINST THE TREE BEFORE WRITING IT DOWN.

## RULING 13 - name the real caller, and the barrel is not one (B7)

W3 names `src/app/actions/index.ts`, which does not exist, hedged as "(or the
existing actions barrel)". And the wave table answers the wrong question: asked
"includes its caller?", W3 answers that it calls W1 and W2. The actions it
exports are called from `useBulkCourseMessage.ts`, which is in W4. Ruling 4's
own text says a barrel re-export exists despite zero call sites, so a barrel
cannot be the caller.

Name the file that CALLS each export, and put it in the wave that ships it -
or state the no-caller exemption explicitly, as W1 does.

## RULING 14 - the two-tab race (M1)

Concurrency 1 is enforced by the pump awaiting its own promise, which binds
nothing across tabs, and `sendNext` picks a pending recipient with no
conditional claim - so two invocations select the same row and both POST. The
double-send guard fires only at prepare, and the resume path mints a new token
on the SAME attempt while the original tab may still be pumping. CLAIM THE
RECIPIENT ROW SERVER-SIDE - a conditional update that only one caller can win.

## RULING 15 - carried

- **M3**: "there is no 60-second cap" is wrong as phrased and contradicts three
  in-repo statements, including `ask/route.ts:57-59`: Vercel Hobby's hard cap
  IS 60s, and a higher value fails the build. The correct distinction is that
  an unconfigured Server Action gets the platform DEFAULT, which is smaller and
  which this seat rightly declined to name from memory. Say exactly that; as
  written an implementer may set 300 somewhere and fail the deploy.
- **M4**: OC6 is referenced five times and defined nowhere, absorbing K12, OV2
  and OV3 - three distinct owner checks collapsed into one undefined id with a
  mismatched instrument. Define it or split it.
- **M6**: six citations are off by one to four lines, after Ruling 6 told this
  chain to cite by symbol. Cite by symbol.
- **M7**: "eleven route handlers" is twelve, and names no command, in a
  document whose own opening sentence requires one.
- Minors: the types-tables glob is three files and disjointness needs exact
  paths; the "wave's own command" spans two waves' directories; the
  required-body reasoning is a non-sequitur; the import test proves import and
  not use.

## What the owner gets, and it is not a blocker

The already-exists case is real and the document engages it honestly: for a
course at or under 100 students, Canvas's own compose already sends one
message to `course_<id>` as individual private conversations, per the
documentation this design quotes. What A29 adds is the live-roster guarantee
and the durable per-student ledger. THE NUMBER THAT DECIDES WHETHER THAT IS
THIN OR EMPTY is how many of this owner's courses exceed 100 students - the
only cohort where Canvas's native path carries the group-thread risk. Put that
in front of the owner with the question, rather than after it.

---

# Round 3 - correcting my correction, and one finding worth more than the row

## RULING 16 - RULING 7 WAS ITSELF HALF WRONG. Verified twice, by me.

Ruling 4 claimed a barrel re-export put `sendMessageDraftByEmailAction` in
every workflow's closure "despite zero call sites". Ruling 7 corrected that to
"no barrel re-exports it, and it has a call site". **Both are wrong, and the
architecture seat caught it.** Measured, and I have now opened both files
myself: `src/app/actions.ts:66` is `export * from "./actions/messaging-outlook"`,
which DOES re-export it, and `MessageDraftsTab.tsx:9-14` imports it FROM THAT
BARREL, not from the defining module. So Ruling 4 was wrong about the call
site and Ruling 7 was wrong about the barrel.

The conclusion is unaffected - measure the requests a send makes, not import
edges - and the seat did the right thing: it replaced the example with a
justification that depends on NEITHER value. `src/app/actions.ts` is 54
`export *` lines over the whole actions directory, so any module importing
anything from `@/app/actions` pulls a model-calling drafter into its closure.
Import closure cannot tell a send from a draft in this tree, for any module.

THE LESSON, and it is about me: I corrected a measurement with another
unverified measurement, in the file that overrides everything downstream. A
correction needs the same instrument as the thing it corrects. Two rounds of
this row have now been spent on one four-line fact.

## RULING 17 - `requireOwner` is a deprecated alias and A29 must not use it

The seat found what revision 1 told it to use: `requireOwner` in
`src/lib/supabase/auth.ts:451` is an alias for `requireUser()`, and its own
doc comment says it is "DELIBERATELY LESS RESTRICTIVE than the requireOwner()
it replaces ... a tracked, temporary state, not an oversight". A29 writes
`requireUser()` explicitly instead, with its reasoning stated: the Canvas
credentials are per-user and nothing here reaches an owner-private secret.
That is correct and it stands.

**ROUGHLY 105 OTHER CALL SITES STILL INHERIT THE ALIAS**, which is backlog row
R2's territory, not A29's. A29 does not widen to fix them; it records the
finding so R2's scoping starts from a measurement rather than from the name.

## RULING 18 - the owner question moves to the front, and it is answerable

OC9 now opens the section rather than trailing the leverage claim, which is
right: for a class at or under 100 students Canvas's own compose already sends
individual private conversations, per the documentation this design quotes. How
many of the owner's courses exceed 100 students decides whether A29's advantage
is modest or empty, and "use Canvas's compose" is a legitimate answer if the
number is low. It does NOT gate the build - the single-recipient shape is
correct at any class size - so the build proceeds while the question rides
alongside.

---

# Round 4 - disposal. Six blockers, four repeats, no third authoring round.

Revision 2's check returned NOT CLEAN: 6 blockers (2 new, 4 repeat), 6 majors,
4 minors. Under `docs/loop/iteration-caps.md` the repeats go to disposal now.
What the check verified sound is NOT reopened: the token-and-pump closure and
its seven-student instrument, the recipient allow-pattern (it attacked every
form I could think of and more - comma-joined, whitespace, newline-anchored,
unicode digits, array coercion, ledger-sourced - and the guard holds), both
recorder seams verified by opening both files, C5's asymmetric fixture, and
every line citation in the revision.

## RULING 19 - K14's IMPORT INSTRUMENT IS WITHDRAWN. This is the ruling I owed.

The check asked the one question only I can answer: can a transitive-import
criterion mean anything in this tree? Measured, by me: `src/app/actions.ts` is
54 export lines over the whole actions directory, and **77 workflow modules
import that barrel**. So every workflow already imports every action, and the
instant A29 is exported there - which its own write set mandates - K14 is red
on arrival, exactly the class Ruling 12 exists to stop.

The document cannot have it both ways, and the check is right that it asserts
both: section 2.1 rejects a Route Handler BECAUSE it would make K14 red, while
C12 concludes that import closure cannot distinguish a send from a draft in
this tree at all. The second is true, so the first is not an argument.

**THE IMPORT INSTRUMENT IS WITHDRAWN AND THE REQUIREMENT SURVIVES.** No module
under `src/lib/workflows/**` or `src/app/api/**` may CALL the send - and the
instrument is a CALL-graph check over those directories, or the request
recorder, never an import edge. AND SECTION 2.1 MUST BE RE-ARGUED WITHOUT IT:
the browser-pumped shape may still be right on duration grounds alone, but it
no longer has K14 to lean on. State that honestly rather than keeping a
conclusion whose premise has been withdrawn.

## RULING 20 - the attempt is created under a database constraint (blocker 1)

Two tabs confirming at once both read "no open attempt" and both insert, and
the blast radius is the WHOLE CLASS TWICE. This is Ruling 14's mechanism at a
worse seam. **A PARTIAL UNIQUE INDEX on `(user_id, course_id) WHERE state =
'open'`** - a constraint only one caller can win, not a read-then-write check.
Note the recorded 42P10 trap: a partial index cannot be a PostgREST upsert
arbiter, but it works perfectly as a CONSTRAINT, which is what this needs.

## RULING 21 - an attempt with unresolved rows does NOT self-resolve (blocker 2)

The pump currently marks an attempt resolved when nothing is claimable,
unconditionally - so an attempt ending with two unknown rows releases the
course guard automatically, and a fresh full-roster send is permitted. That is
Ruling 1's hazard restored by the very machinery meant to serve it, in exactly
the partial-outcome case Ruling 1 was written for.

**AN ATTEMPT WITH ANY UNKNOWN OR NON-TERMINAL ROW ENDS IN A STATE THAT STILL
BLOCKS**, and only the instructor's explicit resolution clears it - the choice
that shows them what was sent and what is unknown. The pump may never
discharge that on their behalf.

## RULING 22 - the state machine must be TOTAL (major)

There is no row for "nothing claimable and at least one row still sending" -
precisely what a killed invocation leaves. An implementer guesses, and both
guesses are wrong: done completes an attempt holding a non-terminal row, so
the summariser's states stop partitioning the set; not-done spins the pump.
Enumerate every reachable combination and give each an outcome.

## RULING 23 - the claim names ONE ROW, and its test uses a real fake (blocker 6)

The cited precedent pins a row it already knows (`.eq("id", release.id)`), and
tells the caller whether it won. The design writes a claim with **no row
identity and no limit**, which through PostgREST updates EVERY pending row: the
first invocation flips all N to sending, POSTs to one, and reports done -
**one student messaged, six stranded**, swept to unknown by a sweep with no
caller, on an attempt that then auto-resolves as completed.

**THE CLAIM SELECTS A SPECIFIC RECIPIENT AND UPDATES BY ITS ID**, conditional
on its state. AND THE TEST CHANGES KIND: the defect lives in the SQL, at the
one seam every specified instrument replaces with a hand-written mock that
returns one row by construction. **A FAITHFUL IN-MEMORY FAKE OF THE STORE, not
a seam mock** - a mock that cannot express the defect is not an instrument.

## RULING 24 - the sweep gets a caller, and not the forbidden one (blocker 5)

The stale sweep is load-bearing twice - it produces unknown, and it is what
stops a dead invocation wedging an attempt - and no wave contains a caller. Its
only cited precedent runs from a cron Route Handler, inside the directory set
the requirement forbids. As written, NOTHING reclaims a row whose pump died.
Name a caller that is not in the forbidden set: the pump itself, sweeping on
start, is the obvious candidate and needs no new surface.

## RULING 25 - delete the phantom action, and give C9 a read path (blocker 4)

`finishBulkCourseMessageAction` appears twice in 1462 lines and is defined
nowhere, while the pump already performs the terminal transition - and the
document nonetheless requires the implementer to give it a guard. DELETE IT.

And C9's central case - reload after a kill, repopulate subject and body from
the attempt row - is unsatisfiable by the defined interface: only the ABANDON
path returns the text, and abandoning destroys the run you were resuming.
**THE REFUSAL FROM prepare CARRIES THE SUBJECT AND BODY**, so the modal can
repopulate without abandoning.

## RULING 26 - majors carried

- The frozen parameter set reads only the POST body, so a query parameter is
  invisible - and `mode` is no longer banned anywhere. Cover the URL too.
- **C13's provenance is unspecified**: if the server takes the course URL from
  the request, the gate is server-side in location and client-determined in
  value. Derive the course identity server-side from the stored row. And three
  of its five categories are not server-distinguishable at all, so once-per-
  category is over-specified by three - fix the enumeration.
- **C14 is the weakest clause in the document**: reasonA not equal to reasonB
  is satisfied by two equally useless strings. The requirement is that an
  instructor can tell a missing credential from an unreachable host - pin the
  CATEGORY, not string inequality.
- C11's forbidden-word list omits "sent", so "Sent 5 of 11" passes while
  claiming delivery the app cannot observe. Add it.
- C5's instrument (a)(4) bans arithmetic "over an A29 value", which no text
  scan can decide and which `subject.trim().length === 0` trips on sight.
  Scope it to values of the summary type.
- P7's replacement has no executing instrument.

## RULING 27 - the owner question goes out with the build, not after it

Five of the six blockers live in ledger and pump machinery that exists only to
serve the advantage OC9 questions. That is not a reason to stop - the
single-recipient shape is correct at any class size - but it IS a reason to put
the question in front of the owner now rather than at the push.

## RULING 28 - the 77, and two of my rulings colliding

RA12 says my 77 is not reproducible. It reproduces with MY instrument -
grep -rln for the quoted specifier over src/lib/workflows, excluding tests,
returns 77 - and the seat 75 comes from a different pattern; the unquoted form
returns 84. THREE DEFENSIBLE NUMBERS FOR ONE CLAIM, which is the whole reason
this loop requires a quantity to name its command. The conclusion is untouched
and the seat was right to adopt neither silently. Record all three with their
commands rather than picking one.

AND RULINGS 20 AND 21 COLLIDED, WHICH THE SEAT CAUGHT AND I DID NOT: making
pump-finished-with-unresolved-rows a third state value would drop the attempt
out of the partial unique index on state = open, so it would stop blocking -
reintroducing exactly what Ruling 21 closed. Its resolution stands: state stays
two-valued and the fact lives in a timestamp column. Its extension stands too -
REFUSED blocks as well as UNKNOWN, since 5 accepted and 3 refused is a partial
outcome and auto-resolving it lets the natural retry re-message the five.

---

# Round 5 - the small shape, and the ruling the re-scope earned

## RULING 29 - TAKE THE N-ID FORM. Not the course audience, not rejection.

The re-scope offers three ends: ship the course-audience form as briefed (thin),
redesign to N explicit numeric ids in one request, or reject and tell the owner
to use Canvas own compose. It recommends redesign or rejection and says do not
ship the middle. It is right, and the choice is REDESIGN.

Why not rejection: the owner asked for this feature in words, twice, and the
thing that makes it thin is a mechanism choice we control, not a fact about
their courses.

Why not the course audience: it hands the recipient set to Canvas, so the app
cannot say who it reached. That withdraws the roster count as a binding, moots
the exclusion criteria, and withdraws the leverage claim outright - and it is
the variant that made the whole feature thin. The N-id form is ONE request
under the SAME documented sentence, differs by one union variant and one
frozen-set entry, and restores a real count, real exclusions and a per-recipient
receipt.

## RULING 30 - force_new IS THE PRIVACY DEFECT, and it ships today

The re-scope found, and I have confirmed by opening the file, that
`createConversation` appends `force_new=1` UNCONDITIONALLY
(`src/lib/canvas/inbox.ts:406`, which I opened). Canvas own controller source treats
force_new as sufficient on its own to make a batch a GROUP batch - so reusing
the shipped builder with a multi-recipient audience would create exactly the
reply-all thread this design exists to prevent, AND bypass the over-limit
refusal.

**THE COURSE-AUDIENCE REQUEST MUST NOT CARRY force_new, and the frozen
parameter set is split per variant so the difference is enforced rather than
remembered.** This is labelled SOURCE, not documentation, and the design does
not depend on settling it: omitting the parameter is safe under both readings.
Note the second-order effect the re-scope measured - without force_new, a
course that DID exceed 100 makes Canvas refuse rather than silently create a
group thread, which is the safe direction.

## RULING 31 - the builder has NO behavioural test, and that blocks reuse

`src/lib/canvas/inbox.test.ts` exists and contains ZERO occurrences of
`createConversation` - I confirmed it. The function this feature re-implements
or extends has never been tested. Any wave that touches it writes that test
FIRST, against the emitted parameters, because the force_new finding is
precisely the kind of thing a parameter-level test catches and a reading does
not.

## RULING 32 - carried

The double-send guard is still owed and its hazard has changed: not partial
state but an UNKNOWN outcome on one synchronous request that can create up to
a hundred conversations inside a server action on an unmeasured duration
default. The cheapest construction named - one table, one partial unique index,
four functions, unknown leaves the row open - stands. In-memory and
localStorage are disqualified with the in-repo reasoning that says so. The
count is a DISCLOSURE, not a binding, and the refusal when the roster read
fails keeps its behaviour with its reason replaced: the count is the only thing
the instructor confirmation was informed by.
