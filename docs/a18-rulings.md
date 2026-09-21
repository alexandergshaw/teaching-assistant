# A18 - orchestrator rulings, 2026-09-21

Both blockers from the check of `docs/a18-ac.md` revision 1 are REPEAT classes.
Under `docs/loop/iteration-caps.md` a repeat goes to DISPOSAL NOW, not to a
third attempt, so these close by ruling and the AC seat is not re-dispatched.
The criteria document stands as written except where a ruling below overrides
it. An implementer reads THIS FILE ALONGSIDE the criteria, and where they
conflict, this file wins.

## RULING 1 - A9's mutation set extends in two directions

BL-1 and BL-2 are one defect seen twice: the only criterion that EXECUTES
ranges over less than the requirements it certifies.

A9 as written reverts each of the seven defect loci to its current defective
wording and requires red. That demonstrates only the ABSENCE half. A1's own
direction-of-failure paragraph already forbids this - "both directions must be
reachable; an absence-only check goes green on an empty task line" - so A9
contradicts a criterion in its own document.

**A9's mutation set is now the union of three sets, and all three must go red:**

- **(i) The positive direction.** For each required fact in A1-A4, delete that
  fact alone and require red. This is what stops a literal blocklist of
  today's defective substrings from passing: such a blocklist goes green if
  `${scope}` is dropped, if A2's five safety facts collapse, if A3's seven
  collapse, or if A4's operative facts vanish.
- **(ii) The protected set.** P1-P5 and both A7b correct nouns.
- **(iii) The existing reversion set**, O1-O7, unchanged.

THE EVIDENCE THAT (ii) IS NOT THEORETICAL. The checker started from a correct
A1-A5 fix and then applied the exact cheat A6 and A7b exist to refuse - a
`/\brecord\b/` sweep over both prompt modules, destroying `background record`,
`the record of what was on screen`, `READ ALOUD while recording`,
`watch the recording` and `read aloud while re-recording`. Measured:
`npx vitest run` over all six consumer files returned **236 passed (236)**.
The owner's explicitly protected wording and both anti-injection nouns were
destroyed silently, with every landed A18 enforcer green.

## RULING 2 - R-7 names its own object

R-7's claim is about the SIX LANDED `f9f29c1` ENFORCERS. Its instrument was
"A9's mutation run, extended to the P-set", which reaches only two of them -
AC-1, AC-2, AC-5 and AC-6's enforcers are in neither the O-set nor the P-set.
An instrument that ranges over a different object than the requirement is the
same deletion with extra steps.

**R-7 now names the six enforcers explicitly as its object**, independent of
A9's mutation run over the prompt modules.

## RULING 3 - MJ-5 is a Reduce, and it goes to the owner

The check makes the strongest already-exists argument this row has: not one of
the 17 record-family hits across the tool's four user-facing files is a
rendered string, so the INSTRUCTOR-FACING harm the row's title names is fully
discharged by `f9f29c1`. Everything A1-A9 governs is MODEL-FACING prompt text,
and no instrument in this checkout can show whether a drafted announcement or
script still says "the recorded walkthrough".

That is a scope call only the owner can make. It is batched to the owner
alongside E1 and R-3/R-4, and it is NOT a gate.

**MY RULING PENDING THAT ANSWER - BUILD PROCEEDS.** Two reasons. The row's
title says STOP REFERENCING A SCREEN RECORDING, without restricting itself to
rendered strings. And O6 (`walkthrough-script-prompt.ts:174`) tells the model
that "the recording occasionally reads it wrong" - attributing THIS APP'S OWN
OCR ERROR to a recording that does not exist, which is a quality bug on its
own terms and not merely an inaccuracy of wording.

## RULING 4 - corrections the criteria document carries as-is

Not worth a revision round; an implementer should simply know them.

- **MJ-1 is half right and its correction is mine.** The artifact says the
  backlog row still reads `state: 'unscoped'`. It reads `'scoped'` - I
  reconciled it at `7dca53f` and corrected my own note at `c1df738`, both
  before the artifact was saved. R-2 must not order that work redone.
  `owns: []` and `verify: null` ARE still stale and stay in the residual.
- **MJ-2**: section 1b's certification sentence says 11 hits, four comments,
  seven emitted, while listing five comment line numbers. Measured 12 lines
  (5 comment + 7 emitted), or **16 occurrences** - `:158`, `:171`, `:174`
  and `:219` each carry two. THE PARTITION IS RIGHT; ONLY ITS ARITHMETIC IS
  WRONG. **CORRECTED 2026-09-21: THIS LINE FIRST SAID 14, WHICH REPEATED THE
  VERY ERROR IT WAS CORRECTING** - I counted only the double-carrying lines
  the check happened to name and did not re-derive the rest. The test notes
  had 16 right independently. A document that OVERRIDES the criteria by its
  own terms is the worst possible place to carry a miscount, because nothing
  downstream is allowed to disagree with it.
- **MJ-3**: R-1's "3 of 505" is a ratio across two populations. The
  denominator's `^#{1,3} [0-9]{3}` eats the year out of date headings - 65
  matches of `### 202` alone, 173 of the 505 spurious. The comparable figure
  is 380. The 432 maximum is correct.
- **MJ-4**: the criteria and the backlog row conflict on `:219`. The row says
  ONLY `:165`/`:166` are about the future re-recording; the criteria add
  `:219`'s head clause as P3. THE CRITERIA ARE RIGHT ON THE CODE - `:219`
  holds a protected clause and a defect clause in one sentence. The row is
  coarse and is corrected by this ruling.
- **m2**: A7b's claim that ANY token-banning implementation fails A7b is
  wrong - a ban restricted to `recorded|recording` passes A7b and fails A6
  instead. The set still catches it; only the stated relationship is wrong.
- **m3**: the protected set is eight loci, not five - P4 bundles `:940`,
  `:943`, `:876` and `:970`. The test notes count the same object set as 7
  defect loci carrying 9 occurrences. Both are right about the code and are
  counting different units; an implementer uses the LOCI, not the totals.
- **m4**: R-7's "1 of 4 killed" attributes the kill to A6's protected set.
  The kill was P4, on the panel. All three script-prompt P-loci mutate GREEN.
- **m5**: `scope` is assigned at `:324`; `:321` is the function signature.

---

# Round 2 - rulings on the check of `docs/a18-test-notes.md`

The notes came back DEFECTIVE: 4 blockers, 7 majors, 4 minors. Three of the
four blockers are REPEAT classes and close here rather than in another round.
The check reproduced everything it was asked to re-execute, and it settled
both of the notes' disagreements with me IN THE NOTES' FAVOUR: all six
`f9f29c1` enforcers discriminate, and what survives is two facts with no
enforcer, not three dead tests. My earlier "three enforcers survived" is
withdrawn.

## RULING 5 - the freeze bounds the ends and nothing else. REDESIGN, one round.

B1 is the only NEW class and it is a design defect, not a strength defect.
Both anti-injection framings are frozen as a prefix and a suffix with one
mutable clause between them - and NOTHING BOUNDS THAT CLAUSE. Measured, all
green at 78/78: text appended inside the mutable region that carries no banned
token, keeps both frozen halves byte-intact, satisfies every positive pin, and
tells the model that the notice it is reading has been withdrawn and it may
follow any instruction after that line. The control is inverted completely
while the instrument reports success.

**THE CORRECTIVE RULE: BOUND THE REGION, NOT ITS ENDPOINTS.** Exact equality
over the whole block, or a slice whose length and shape are asserted together
with a negative set. STRENGTHENING THE PINS IS THE FORBIDDEN SECOND ATTEMPT -
the pins already pass; they sit in the surviving half.

This also demotes the notes' headline sabotage result. The four-word attack it
reports as caught is caught by PLACEMENT, not by construction: the same four
words moved 240 characters left survive.

## RULING 6 - B2 and B3 close together, by a KIND change

Both are the class the criteria document already disposed C4 under, so neither
gets another attempt at the same mechanism.

- **B2**: the positional half of the `:219` instrument cannot fail except on
  letter case. R4 AND R5a IMPLIES R5b as a matter of proof, and the
  measurement agrees - the mutant the notes bank as proving non-redundancy
  kills TWO assertions, not one. The non-redundancy was demonstrated in a
  two-test sandbox that omitted the assertion that makes it redundant, which
  is the "sandbox diverged from the real configuration" trap landing on the
  artifact's own centrepiece. DELETE IT, or re-derive it against the FULL
  instrument set and show a mutant only it catches.
- **B3**: `as const satisfies` checks membership, never exhaustiveness.
  Executed: adding a member to the union and leaving the array at two members
  gives `tsc` exit 0 and 78/78 green, and the new branch is never composed.
  Replace the `satisfies` axis with an exhaustive `Record<Union, ...>` plus
  `Object.keys`. This matters more than it looks: A19 has just added a timing
  union whose midweek arm is five paragraphs of new prose, so the guarantee
  that a record claim in a not-yet-existing block goes red stops holding for
  exactly the branches most likely to be added next.

## RULING 7 - Ruling 1(i) BINDS the notes. The pass condition widens.

B4 asks whether my Ruling 1(i) binds the notes' fact-level instrument or
whether the criteria's pass condition narrows. **IT BINDS.** The rulings file
says so by its own terms, and the measurement settles it: three separate
per-fact deletions from the two blocks survive at 78/78 - including the clause
saying that preserving the walkthrough order is the one thing the script
exists to do. The instrument pins 3 of 5 operative facts in one block and 2 of
4 in the other. Widen it to A4's full operative set.

## RULING 8 - C7c is the weakest clause on the row and is redrawn with B1

The check names it independently of B1 and the two findings meet: implemented
exactly as written, C7c REJECTS THE MINIMAL CORRECT FIX (deleting the false
clause outright fails a frozen prefix that ends in a trailing space, and fails
a non-empty-middle assertion the criteria never required) while ACCEPTING an
outright inversion of the control it protects. It is also strictly weaker than
its stated twin, which has three positive pins it lacks, inside a criterion
that says the two carry equal weight. A freeze on a whitespace boundary is not
a freeze on a fact.

## RULING 9 - the protected blocks need the same treatment as the defect blocks

M3, accepted. P1/P2 are protected by token count in both directions, with no
residual. Measured: a protected block replaced wholesale by a sentence that
INVERTS it passes 78/78, while a semantically neutral synonym swap goes red on
8 tests. That is the wrong sensitivity in both directions. A multiset cannot
express "unchanged in force"; the notes built a rewording instrument for the
defect blocks and none for the protected ones.

## RULING 10 - corrections carried, not re-rounded

- **M4**: R-8's instrument is the probe already measured non-discriminating -
  `REGRESSION.md` does not index by row id at all. Use the commit hash.
- **M5**: three positive presence regexes, not five, and the block is
  `:517-578` - the range the criteria document had already corrected.
- **M6**: the finding is right and its instrument works, but it is attributed
  to a superseded revision; the document an implementer reads already says
  those loci have no enforcer.
- **M7**: the commanded test count of 80 is unfollowable - the notes do not
  determine the `it()` decomposition, and a faithful build produced 78. A
  commanded count from an under-determined construction invites a fabricated
  match. DROP THE COUNT; keep the red-then-green requirement.
- **m1**: the house-idiom argument is STRONGER than the notes state - 13
  occurrences across 9 files, and the two omitted production files are the
  most relevant ones.
- **m2**: three of nine residuals carry a column that is not a measurement.
  A null result, a contingency and a document are not instruments.

## What is NOT in scope for the revision

The check re-executed everything I asked and found the notes' core sound:
section 0's partition, both frozen literal pairs byte-identical to HEAD, the
three new instruments for the live holes (including the reflow control staying
green), the reference implementation satisfiable at `tsc` exit 0, and the
predicted synonym survivor. Do not rebuild what measured clean.

## A PROCESS FINDING, and it is about how this loop runs rather than about A18

The criteria check left its sabotage LIVE IN THE SHARED TREE - two modified
prompt modules, the full record-family sweep, uncommitted. The next agent
found them at its start. Nothing was lost (the modules are byte-identical to
HEAD now, and the sabotage reached no commit), and it happened to be the
strongest validation of the notes' construction available. But concurrent
agents share this checkout, an auto-commit hook bundles whatever is dirty, and
a sabotage left live is one `git add -A` away from shipping. RESTORE-BEFORE-
REPORT IS NOT OPTIONAL, and the proof of restoration belongs in the report.

---

# Round 3 - rulings on the check of test notes revision 2

Revision 2 came back DEFECTIVE: 4 blockers (2 new, 2 repeat), 6 majors, 4
minors. The check executed everything it reported and found the artifact's
core sound - ALL NINE FROZEN LITERALS ARE BYTE-IDENTICAL TO HEAD modulo
exactly the intended removal, in both directions, which is the single thing
most likely to have been wrong and is the strongest part of the work. Section
2's partition, both `tsc` claims, the red-then-green direction and every
subsidiary count reproduce. None of that is reopened.

## RULING 11 - A8 WIDENS TO SIX FILES. This contradiction is mine, not the seat's.

Blocker 2, and the check is right that two full ruling rounds passed over it.

`docs/a18-ac.md` A8 names exactly four files and goes RED if any other `src/`
file appears. But the same document's R-6 instructs the test seat to close the
privacy-disclosure gap, which can only be done in
`walkthrough-announcement.structure.test.ts`, and the P5 guard needs
`src/app/actions/walkthrough-announcement.test.ts`. A faithful implementer
either fails the wave gate or silently drops the one residual the seat was
told to close.

**A8'S WRITE SET IS NOW SIX FILES**: the two prompt modules, their two sibling
tests, `src/app/components/.../walkthrough-announcement.structure.test.ts` and
`src/app/actions/walkthrough-announcement.test.ts`. NO PRODUCTION FILE BEYOND
THE TWO PROMPT MODULES. The direction of failure is unchanged for everything
else.

The seat's error was smaller and is still an error: it printed a six-file list
under A8's own heading and closed with A8's phrase, relabelling a conflict
instead of surfacing it. SURFACING A CONTRADICTION BETWEEN TWO CLAUSES OF THE
DOCUMENT YOU ARE BUILDING AGAINST IS PART OF THE JOB.

## RULING 12 - bound the governed REGION by completeness, not by freezing everything

Blocker 1 is a REPEAT of Ruling 5, so the mechanism does not get another
attempt - but the check moved the object, and it is right. Ruling 5 said bound
the region, not its endpoints. Revision 2 bounded the BLOCK THAT STATES THE
NOTICE and left THE REGION THE NOTICE GOVERNS unbounded. Measured: the
withdrawal sentence inserted into the very next segment is ALL GREEN, and the
A18 defect itself - asserting a screen recording happened - reappears with no
record-family token, ALL GREEN, twice. Only 15% of the announcement prompt's
instruction text is bounded; the other 85% rests on the token blocklist that
A7b exists to call insufficient.

**THE RULING: A COMPLETENESS ASSERTION OVER SEGMENTS.** For a fixed fixture,
the composed prompt's segment list must be asserted COMPLETE - every segment
is accounted for, and each is either (a) frozen by equality, or (b) carries
its fact pins AND the negative set. A segment that appears, disappears or is
added fails the completeness assertion. That bounds the governed region
without converting the whole prompt into one byte-frozen literal.

**I AM NOT ORDERING WHOLE-PROMPT EQUALITY**, because the check also measured
that equality already rejects legitimate changes, and freezing 100% of the
prompt multiplies that cost. If the seat judges completeness insufficient,
that is a stated, owned residual - NOT a claim that the trap is answered.

**R-4 IS RE-OPENED.** Revision 2 closed it "by construction" on the strength
of a position-level fix; the class is alive one segment away. A class-level
residual cannot be closed by a position-level fix.

## RULING 13 - the oracle the notes assert they supply must actually be in them

Blocker 3. Section 5.7 says the protected block's three bullets are
"transcribed whole" and THEY ARE NOWHERE IN THE DOCUMENT. It is the longest
block, the only one with escaped double quotes, module-private so it cannot be
imported, and section 10 forbids both `readFileSync` and exporting a constant
to make a test easier. So the implementer must hand-copy from the code under
test - which is precisely the compare-to-self failure the notes forbid twice
on the same page - and the cheapest repair on a mismatch is to paste the
received value.

**TRANSCRIBE THE LITERAL INTO 5.7.** And state the general rule it violates:
**REPAIR-BY-PASTE IS BANNED.** When a frozen literal mismatches, the repair is
to decide whether the CHANGE was intended and rewrite the literal
deliberately, never to paste the received value. Put that sentence in the
notes where the implementer will hit it.

## RULING 14 - delete the control that cannot fire, and state the real cost

Blocker 4, a REPEAT of Ruling 6's class, so it closes here.

The no-op reflow control is offered as the proof that equality does not
over-specify. It CANNOT FAIL: no assertion reads either module's source, so a
source reflow is unobservable in principle. It tests that the mutation was a
no-op. Delete it, per the rule already applied to the positional assertion.

Replace it with the check's measured rejection list as the DECLARED COST, and
widen the declared bound, which currently says "a semantically neutral synonym
swap". Measured rejections include an ADDITION of a fourth bullet to a
protected block, which is not a rewording at all and satisfies the criterion
in full, and a known-good improvement COPIED FROM THE APP'S OWN SIBLING PROMPT
that the script prompt lacks. Also name the compounding mechanism the notes
never state: on every future legitimate edit the cheapest repair is the paste
Ruling 13 bans.

## RULING 15 - wire the exhaustiveness axis, or it compiles and iterates nothing

M-1. The `Record<Union, true>` form gives the type error on union growth, which
is what Ruling 6 asked for - but the GUARANTEE was that a record claim in a
not-yet-existing block goes red, and that holds only if the inventory
assertion EXECUTES ONCE PER AXIS VALUE. No sentence says so. Say it.

And apply the same rule to the dimensions that have no axis at all: the
researched-resources arms, the outline arms, and the notes and coverage
blocks. Two of at least five branch dimensions were axised.

## RULING 16 - carried, not re-rounded

- **M-2**: R-8 dropped half of the AC's R-1. Both halves stand: no commit-hash
  entry in `REGRESSION.md`, AND the stale 427 against a measured 763 at
  `:41936`. Fixing an instrument is not licence to drop a requirement.
- **M-3**: four further non-discriminating assertions beyond the ones section
  12 admits, including one that makes a LANDED assertion dead. Name them all;
  a self-report that is 60% complete reads as 100%.
- **M-4**: the target test file's own header says never pin a whole sentence
  verbatim, citing the same recorded class. The notes append whole-block
  equality to that file without quoting the comment or arguing against it.
  THE ARGUMENT MUST BE MADE TO THAT COMMENT, IN THE DIFF - amend it or delete
  it deliberately, with the reasoning attached.
- **M-5**: section 7's mutant table has no "Killed by" column, unlike section
  9's. Counts without attribution are not independently checkable. Add it.
- **M-6**: `segments()` is used throughout and never defined, and the two
  plausible definitions give different segment sets while A1 asserts
  positionally. One line.
- **m-1** eight edits, five one-word not seven; **m-2** P5 is `:533-534`, an
  off-by-one inherited from the criteria; **m-3** the owner force-check covers
  two blocks and leaves A1(a), A4 and A5 unread by anyone; **m-4** eleven of
  the twelve insurance regexes are undetermined, and they are the sole backstop
  at exactly the future-edit moment R-3 names.

## Scope of the next pass

MECHANICAL AND BOUNDED. Rulings 11 through 16 are transcription, deletion,
completeness and attribution - not a third attempt at a mechanism. Do not
rebuild what measured clean: the nine literals, the partition, the `tsc`
axes, the red-then-green direction, or the `:219` line-level expression.

---

# Round 4 - disposal of the Ruling 12 class. No fourth revision.

The check of revision 3 returned DEFECTIVE with 4 blockers, ALL FOUR REPEAT
classes. Under `docs/loop/iteration-caps.md` they route to disposal now, and
the test-author seat is NOT re-dispatched. What follows is the disposal; an
implementer builds from the notes AS AMENDED BY THIS SECTION.

The check re-ran everything with a collection-proving runner, on the explicit
assumption that the seat's self-reported runner bug had contaminated the
artifact. **IT HAD NOT.** Every figure it could re-run reproduced: the 13-row
table exact on all four columns with every head exactly 40 characters, all
nine G-verdicts, the byte-identical protected literal including its quoting,
all eight reference edits applying exactly once, 95/95 landed assertions green
under the fix with a firing canary, four sampled landed mutants exact, ten
sampled construction mutants red. That is a clean bill on the artifact's
measurement, and it is not reopened.

## RULING 17 - the completeness oracle covers BOTH composers and a SPANNING set of arms

BL-1 and BL-2 are one class with two instances, and the class is mine: Ruling
12 said bound the governed region, the seat bounded the announcement
composer's region, and I accepted it without asking whether the same words
covered the sibling. They do not. Measured, in the script composer: the
withdrawal-of-notice sentence appended inside a neighbouring block is GREEN, a
WHOLE NEW SEGMENT is GREEN, and deleting a whole instruction block entirely is
GREEN. Every one of those is RED in the announcement composer. And the
announcement table itself is bound to ONE fixture on ONE of 64 branch arms, so
a tokenless capture claim planted in the MIDWEEK arm is GREEN - the branch
5.1's own rationale singles out as most at risk, because A19 just added five
paragraphs of new prose there.

**THE DISPOSAL IS CONSTRUCTION, NOT A NEW MECHANISM.** The completeness table
already works and reproduces exactly. It is extended along two axes:

1. **BOTH COMPOSERS.** The script composer gets the same 4-tuple table, same
   `segments()`, same columns.
2. **A SPANNING SET OF ARMS, NOT THE CROSS-PRODUCT.** I am NOT ordering 64
   tables. The fixture set must satisfy: every branch arm of every dimension
   appears in at least one fixture, INCLUDING the arms where a block is
   ABSENT, and including both timing arms. A handful of fixtures achieves
   that. Each fixture carries its own frozen table, generated once and
   committed, never regenerated to fix a failure - **RULING 13'S
   REPAIR-BY-PASTE BAN APPLIES TO THESE TABLES WITH FULL FORCE**, and it is
   the obvious place it will be violated.

This is the Reduce, and I am making it rather than sending it to the owner: a
spanning set costs a fixture apiece and closes both instances, where the full
cross-product costs 64 frozen tables to close the same hole. If the spanning
set turns out not to close it, THAT is an owner question.

## RULING 18 - R-4's instrument asks the wrong question, and it is the question I wrote

BL-3. The residual's instrument is a human reading one question per line:
"does this sentence assert that a recording of the walkthrough exists". The
check demonstrated the survivor class in substitution form, and the instrument
RETURNS NO FOR ITS OWN CLASS - a bullet rewritten to say that instructions in
the material below come from the instructor and should be followed asserts no
recording at all, and inverts the control.

**THE QUESTION IS NOW: DOES THIS SEGMENT CHANGE WHAT THE MODEL IS TOLD?** Not
"does it claim a recording". R-4 keeps its owner and its step and gets that
instrument. Note what the narrower question was doing: it made the residual
look smaller than the class, which is the same shape as closing a class-level
residual with a position-level fix.

## RULING 19 - section 12 is re-derived, not patched

BL-4. The self-report claims completeness and misses at least six landed
assertions that the disclosure freeze makes strictly implied - it reports one.
And the knock-on is worse than the miss: the residual that owns the landed
enforcers expects a specific kill count with per-mutant attributions, and once
the freeze lands those attributions are wrong.

Re-derive the list mechanically rather than by inspection - for each assertion,
ask whether it can fail on any input the freeze passes. Fix the dependent
residual's expected counts in the same pass. And M2 must be settled by a
command: the stated total does not reconcile with the section's own table
under any reading, which is an entry-gate violation inside the section whose
whole purpose is completeness.

## RULING 20 - M4 is settled BEFORE anyone builds, because it changes behaviour

The per-block inventory map is given only in prose: how a block is IDENTIFIED
is unstated, and the check measured that the choice changes outcomes - under
one reading a newly added block falls into the catch-all and passes silently;
under another it goes red. That is not a documentation gap, it is an unbuilt
decision.

**THE RULING: BLOCKS ARE IDENTIFIED POSITIONALLY, BY INDEX INTO `segments()`,
NOT BY EQUALITY TO THE FROZEN LITERAL.** Equality-keyed identification makes a
new block invisible, which is exactly the hole Rulings 12 and 17 exist to
close. The "asserted to occur exactly once" phrasing resolves the same way:
once PER PROMPT.

## RULING 21 - carried corrections

- **M1**: the script-composer axis is wrong IN KIND. One dimension is not a
  branch at all (pure concatenation), and another is two independent inputs
  with four combinations, one of which DROPS A WHOLE SEGMENT. An implementer
  building the stated axis never reaches the arm where a block is absent - the
  case the inventory exists to cover. Re-derive the axes by measurement.
- **M3**: sections 6 and 7 measure revision 2's instrument set while section 6
  makes reproducing those numbers a pass condition. The directions all
  reproduce; the counts cannot, for the seat or for an implementer. **DROP THE
  COUNTS AS A PASS CONDITION AND KEEP THE DIRECTIONS** - the same disposal
  Ruling 10 already applied to the commanded test count, now applied to the
  mutation table.
- **M5**: "at least six" and "all six" in consecutive sentences, with no
  command behind either. The composer has further conditionals the enumeration
  omits. State what was measured.
- **m1**: section 8 says every row is measured; one row has no mutant id and
  no count, and its measurement belongs to the check, not the seat. Attribute
  it.
- **m2**: 7.5 contradicts itself in one paragraph - a permitted control is
  listed among rejections, and "all killed by the completeness assertion" is
  false for the two survivors. Fix the sentence, not the table.
- **m3/m4**: the twelve-vs-thirty-seven scope confusion in R-3, and both
  REGRESSION numbers cited to one line when they are on two.

## What the implementer builds

The notes as written, amended by Rulings 17 through 21. The table construction,
the nine literals, `segments()`, the repair-by-paste ban, the six-file write
set and the declared-cost list all stand as written and measured.
