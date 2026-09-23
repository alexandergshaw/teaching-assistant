# A29 - orchestrator rulings, round 2, 2026-09-23

The round-2 check of `docs/a29-architecture-small.md` returned NOT BUILDABLE AS
WRITTEN: 4 blockers, 7 majors, 7 minors. Two of the four are mine and one is a
genuine new finding about Canvas. The rest go back to the seat.

Not reopened - the check re-measured and confirmed: the 103-key correction
(reproduced exactly, 103 raw keys, 100 `getAll`, 6573 bytes), the over-100
conflict and its handling, every one of roughly twenty-five `file:line`
citations with ZERO errors, both line counters agreeing on all eleven files in
section 3.1, both `owns` lists reproducing byte-identically, and the absence of
any raw multi-path `vitest` call. It also judged the already-exists case not to
hold at this revision, which is the right answer.

One piece of repo bookkeeping worth recording because it will recur: the check
found `git diff --stat HEAD~1 HEAD -- docs/a29-architecture-small.md` prints
NOTHING at `914a46f`. The auto-commit hook had already swept revision 2 into
`a26ad5a`, a commit titled for A20, and `914a46f` re-committed identical bytes.
Revision 1 is `e2f65d1`. THE LESSON IS NOT ABOUT THIS FILE: a commit subject in
this repo does not reliably tell you what a commit carries, so a diff against
`HEAD~1` can be empty for work that certainly happened. Diff against the named
revision, not against the parent.

## RULING 17 - B1 IS THE FINDING OF THE PASS, and it stops W1a

A course with ONE active student takes a DIFFERENT CANVAS CODE PATH, and the
design does not know it. The check read it out of Canvas own controller: with
N=1, `group_conversation` absent and `force_new` absent, `batch_private_messages`
is false (`cc.rb:447/456/503`) and control reaches `initiate_conversation`, which
the documentation says REUSES an existing thread and IGNORES THE SUBJECT
(`conv.txt:448-450`, `:465-466`). The design quotes neither sentence.

This matters beyond the edge case, and the reason is the shape of the defect
rather than its size. K6 says every student gets their own private conversation
carrying this message with this subject. At N=1 the wire is well-formed, the
POST succeeds, the ledger records a success - and the student may receive the
message appended to an unrelated older thread under a subject nobody chose. No
instrument in the design can see it, because every instrument asserts on what we
EMITTED and this defect lives in what Canvas DID with it.

**Ruled: the N=1 branch is designed before W1a lands, not after.** It is small -
one branch - and it must state which parameter makes N=1 behave like N>1, or
state that no parameter does and the feature refuses a one-student course with a
named reason rather than silently reusing a thread. Do not guess which: see
Ruling 20.

A one-student course is not exotic. An independent study, a late-add section, or
a course where exactly one student remains after the exclusion filter all reach
it - and the exclusion filter is the design's own, so the app can produce N=1
from a roster of thirty without anyone choosing it.

## RULING 18 - B2 IS MINE. The word denylist was the wrong instrument.

Ruling 26 forbade the bare token `sent` in the disclosure copy, to stop the
receipt claiming delivery it cannot observe. The check found that S8's forbidden
word forbids S8's OWN REQUIRED SENTENCE - the copy has to say the instructor may
"decide whether one is sent".

The instrument is wrong, not the requirement. A word denylist cannot separate
"Sent 5 of 11", which asserts an unobserved delivery, from "whether one is
sent", which describes a choice. **Ruling 26 is WITHDRAWN and replaced: what is
forbidden is a SENTENCE THAT ATTRIBUTES A DELIVERY OUTCOME TO A NAMED STUDENT OR
TO A COUNT OF STUDENTS.** The instrument is a frozen copy sheet - the exact
sentences, reviewed once - not a scan for a token. That is the shape this repo
already uses for copy elsewhere, and it is the shape that survives a rewrite.

I am recording why I reached for a denylist, because it is a recurring error and
not a typo: a token scan is CHEAP TO WRITE AND RUNS FOREVER, which makes it feel
like a stronger control than a reviewed sheet. It is not. It measures spelling,
and the requirement is about meaning. This is the same class as every
presence-not-meaning pin this project has had to unwind.

## RULING 19 - B3 and B4 go back to the seat, named, without re-dispatch debate

- **B3, the table is not total.** A `send` with ZERO active recipients has no row
  in the eight-row state table: it reaches row 6, INSERTs an `open` row, and then
  the builder throws before any POST - leaving the course wedged with no refusal
  kind and no defined return. A state table that omits a reachable state is not a
  table, it is a list of the cases we thought of. Add the row, and give it a
  refusal kind that fires BEFORE the ledger row is written.
- **B4, three requirements marked KEPT whose instruments do not reach them.**
  (i) Ruling 21's client half - nothing stops the modal auto-resolving, and
  section 12 falsely claims no criterion is render-only, which is a false
  sentence about coverage and this repo has shipped enough of those.
  (ii) `resolveOpenSend(id, choice)` drops the `.eq("user_id", ...)` that section
  6 row 8 requires. **This is not a residual candidate and must not be filed as
  one.** Under service-role with RLS enabled and zero policies, that clause is
  the ONLY tenancy control in the path - its absence is one user resolving
  another user's send.
  (iii) The store fake's uniqueness predicate is never pinned to the migration's,
  so the fake can be right while the database is wrong.

## RULING 20 - THE OWNER MEASUREMENT IS WORTH ASKING FOR, and it is cheap

The check proposes one measurement that would settle B1 and OC11 together,
BEFORE W1a rather than after: a single authenticated `curl` of
`POST /api/v1/conversations` with two numeric ids and no `group_conversation`,
against the owner sandbox. Two ids answers OC11 (does one POST with N ids
produce N private conversations, or one group thread), and the N=1 variant
answers B1.

**Escalated to the owner as a batched item, never as a gate.** Work continues
under the design's stated assumption in the meantime. What I will NOT do is
build the N=1 branch on a guess about which parameter fixes it and then discover
the guess was wrong at integration - which is exactly why Ruling 17 stops at
"design the branch" and not "implement this specific branch".

## RULING 21 - the load-bearing claim is overstated, and the fix is a type

The seat calls the digits-only allow-pattern LOAD-BEARING rather than defence in
depth. The check found the document contradicts that three sentences later in
its own provenance clause: the ids come from the app own live read, so nothing
untrusted reaches the pattern.

Both are half right, and the resolution is neither. **Ruled: carry the recipient
ids as `readonly number[]`, which is already the in-repo type (`user_id?: number`),
and the bad forms become UNREPRESENTABLE rather than rejected.** S1(a) argues for
exactly this and then does not apply it. Keep the runtime pattern as well - it
costs nothing - but stop describing it as the thing standing between caller data
and the wire, because that sentence is false and a future reader would trust it.

## RULING 22 - instrument (d) is defective in both directions

Over-broad on `body`, because instructor free text legitimately contains `@`, so
the instrument fails on correct data. Blind to `excluded_summary`, which the
check names as the rendered column MOST likely to carry a `login_id` from the
fixture the design itself mandates. An instrument that fires on correct input
and stays silent on the defect it exists to catch is worse than no instrument:
it will be tuned until it is quiet, and the quiet will be mistaken for safety.

Re-scope it to the columns that are rendered, and assert on the SHAPE of an
address rather than on one character.

## RULING 23 - S2's "length N" is a tautology, and S3's preservation claim is false

Two instrument defects the check separates correctly and the seat must not
merge. S2 asserts the emitted `recipients[]` has length N with `N` unbound, so
read back off the emitted params it can never fail - the real removal test is
S5's fixture, and S2 must either bind `N` to the fixture or stop claiming to
catch a dropped recipient.

And Ruling 31's step 4 is NOT a behaviour-preservation proof as written, because
step 3 deliberately adds validation the shipped builder has no branch for - so
step 1's test cannot have covered it, and S3's "keeps its behaviour" is false
against S1. Split it: step 4 re-runs step 1 unchanged as the proof for the
BEHAVIOUR THAT EXISTED, and the added validation gets its own test written after
step 3, watched failing first. A refactor that adds behaviour is not a refactor,
and calling it one is how a preservation proof turns into a tautology.

## RULING 24 - the half of RS8 that was dropped is restored

`src/app/actions/messaging.ts` still has NO test file, and W1a's exemption leans
on that chain being green. A residual that is half-promoted and half-dropped is
worse than one that is open, because the register now reads as resolved. Restore
it with its own owner, instrument and step.
