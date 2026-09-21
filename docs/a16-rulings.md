# A16 - orchestrator rulings, 2026-09-21

The check of `docs/a16-plan.md` returned DEFECTIVE: 6 blockers (4 new, 2
repeat), 5 majors, 8 minors. The plan's central contribution survived intact
and is not reopened - A16-1 and A16-2 shipped on 2026-09-20, the panel is on
five of seven grading surfaces, and the check traced all three render paths
itself rather than taking the plan's word. What follows binds the revision.
Where this file and the plan conflict, this file wins.

## RULING 1 - the write-set membership rule, stated ONCE and applied to BOTH sides

B3 is the blocker with the widest blast radius, because it is the one that
authorises or forbids concurrent dispatch.

The plan inflates every A16 wave's write set with three whole-repo structural
gates (`file-size-ceiling`, `source-bytes`, `no-emojis`) - three of the six
"shared paths" that made waves 2 and 3 non-disjoint - and then reads A18's set
narrowly, as edits only. Two different rules at one gate. Under the wide
reading NO TWO ITEMS IN THIS REPO CAN EVER BE DISJOINT, since `no-emojis`
asserts over the whole tree; under the narrow one the A16 waves may be
disjoint after all. The asymmetry alone produced both conclusions.

**THE RULE: A WRITE SET CONTAINS ONLY FILES A WAVE EDITS.** Whole-repo
structural gates are RUN by every wave and OWNED by none. They are listed
under the wave's gate commands, never in its write set. Re-derive both
intersections under this rule and state what changes - I expect waves 2 and 3
to collide on exactly one real path, which the plan already identified as the
only genuine write collision among the six.

## RULING 2 - re-derive the intersections from the PUBLISHED sets

B2 and B4 are one class seen twice: the derivation's inputs were not the ones
it names.

- The six-path intersection includes a path that is in wave 3's published set
  and in NEITHER of waves 1 or 2. The published sets intersect at five.
- The stated canary counts 19 paths on one side. No published set has 19.
- A18's side was derived from `docs/a18-scope.md`, which the plan's own thesis
  says is history; that range holds eight file rows and the plan enumerated
  five, dropping both server-action files.

The A18 conclusion is right by luck, not by derivation. **A18'S LIVE SET IS IN
`docs/a18-ac.md` REVISION 1, AS OVERRIDDEN BY `docs/a18-rulings.md`** - two
rounds of rulings that postdate the plan. Re-derive from those. The canary
proves `uniq -d` fires; it says nothing about what was fed to it, which is
exactly the hazard this repo has recorded before.

## RULING 3 - `docs/css-orphans.md` is exempt, and the exemption is written here

B1. The wave gate is `git status --short` shows only paths in the wave's list,
and that file has been dirty all session from outside the loop. The plan
excuses it by pointing at a section that says nothing about it - a dangling
pointer is not an exemption, and an implementer facing it either fails the
gate or "cleans up" another agent's file, which is the recorded class where
one agent's repo-wide git operation reverted every sibling's work.

**`docs/css-orphans.md` IS EXEMPT FROM EVERY A16 GATE. DO NOT STAGE IT, DO NOT
REVERT IT, DO NOT MENTION IT IN A REPORT EXCEPT TO SAY IT WAS LEFT ALONE.**
The gate reads: every path printed is in the wave's list, OR is
`docs/css-orphans.md`.

## RULING 4 - both hand-overs now have receivers, created before A16 closes

B5 and B6 are one class: a residual or hand-over pointing at nothing. Both
are disposed by creation rather than by argument, and both rows exist as of
this commit.

- **A24** - trends on snapshot grading, the owner's SECOND named strip tool.
  The plan's factual ruling is not reopened: there is no run boundary there,
  the check re-verified it with a canary, and A16 was right not to mount the
  panel. But the plan's step for it was "A16-4's own scoping, before any
  wave", which is self-referential - nothing schedules it, and closing A16
  would delete the only record of half the owner's ask.
- **A25** - cross-assignment trend accumulation, excluded by owner answer 1
  and handed to "a new backlog row" that did not exist.

## RULING 5 - the entry META contract is the plan's weakest clause. SPECIFY IT.

M4, accepted, and it is the silent-green failure on this row.

The wave-2 gate pins the cohort's DEPENDENCY SET - the setter must mention
none of `assessmentLabel`, `assessmentId`, `filterText`, `sort`,
`gradingRows.rows` - and leaves the entry META unpinned. But the panel passes
`assignmentName` down to the draft panel, and the adapter must supply
`courseName`, `assignmentName` and `canvasUrl` from somewhere the plan never
names.

An implementer who writes `assignmentName={assessmentLabel}` PASSES EVERY
STATED GATE - and `assessmentLabel` is the freeSolo autocomplete's
`onInputChange` value, written on every keystroke. The instructor would watch
the panel's heading mutate as they type: the exact mid-keystroke failure owner
answer 3 exists to forbid, arriving through the one door the gate left open,
and invisible here because nothing renders under vitest.

**The revision must state where each of the three meta fields comes from, and
the wave-2 gate must pin the META source the same way it pins the cohort's.**

## RULING 6 - strike the mixing sentence from the A16-4 exclusion

M5. The plan excludes snapshot grading partly because mounting there "would
ship the cross-assignment mixing owner answer 1 put out of scope" - while its
own RES-P-7 ACCEPTS exactly that on the recording surface and discloses it
instead. If mixing is disclosable on one surface it is disclosable on the
other. ONLY THE RUN-BOUNDARY ARGUMENT IS LOAD-BEARING. Strike the mixing
sentence so no later round cites it as precedent; A24 records both halves.

## RULING 7 - corrections carried, not re-rounded

- **M1**: the lint baseline is called "confirmed" in one section and "not
  run" in another. I ran it: 4 problems, 0 errors, 4 warnings - but the second
  is at `84:10`, not `:83`. An off-by-one is the tell that a figure was
  transcribed rather than measured, and this one is a HARD PASS CONDITION
  ("exactly 4 warnings; a fifth is this wave's regression").
- **M2**: the A8-R discharge overstates what landed - three lines, not
  fifteen, and the scope doc budgeted up to twelve more for a hinge comment
  that `grep` says was never written. IF THOSE TWELVE ARE STILL OWED, wave 1's
  gate fails: 55 free against 46 + 12. Settle whether they are owed BEFORE
  wave 1, not during it.
- **M3**: the 9-line margin contradicts its only cited precedent, which priced
  the same React Compiler workaround on the same file at 20 lines, "named, not
  rounded". Halving it needs a reason or it needs to be 20.
- Minors to carry: the auto-drain effect is `:507-519` with the comment at
  `:496-506`; the store is `src/lib/github-grading-run-store.ts` and the read
  is `:356`; floor enforcement is `:168`; the readdir enumeration is missing
  hits and lists one that is not there; the modal-adoption test counts only
  dialog sites and would not move for a plain extracted `.tsx` - which is the
  second proof it does not belong in the intersection.
- The plan's tree state and backlog citations are already stale: HEAD has
  moved several times and the row now reads `state: 'planned'`. `owns: []` and
  `verify: null` are still genuinely stale and stay in the residual.

## What is NOT reopened

The check re-measured every load-bearing quantity and found the plan right on
all but three. Do not rebuild: the reshaping claim and its three render paths,
the shape decision and the non-recursive `readdirSync` that makes the strip
counts safe, the 966-line measurement and the discharged "hard blocker", every
A16-3 edit point, the five canary-3 roots and the `it()` title that names
them, the git-bookkeeping finding, and the absence of a layer-B silent-green
in the adapter's four inert fields.

---

# Round 2 - rulings on the check of plan revision 1

DEFECTIVE: 3 blockers, 4 majors, 3 minors. Two of three blockers are REPEAT
classes, so neither gets another attempt at the same mechanism - both are
disposed BY CONSTRUCTION below.

The measurement is clean and is not reopened. The check re-derived ALL SIX
intersections from the published sets and they reproduce; the self-intersection
canaries return each set's own cardinality, so the instrument fires on the sets
actually named. The 934 target, its 46-line addition table and its 32-line
precedent are real. Section 1 reproduces in full. Every wave-2 edit point, the
five canary-3 roots, the `it()` title, the button-variant entry and the
file-size gate's line-counting semantics are exact. The twelve hinge lines are
settled as NOT OWED, by the right argument. And the check confirmed A16-3 is
genuinely unbuilt: the recording panel renders its own table and imports
nothing from `grading-results/`.

## RULING 8 - `assignmentName` is snapshotted AT RUN TIME. The shipped pattern is the answer.

BL-1 and BL-2 are one defect: the plan made `assignmentName` a pure function of
the cohort rows' `assessment` field and called the attack closed BY
CONSTRUCTION. Purity does not launder provenance. The check traced what the
plan did not: `row.assessment` IS THE SAME LIVE CONTROL'S VALUE, stamped onto
rows at capture time and then never re-adopted. Two reachable failures, both
passing every gate and both invisible because nothing renders:

- Rows minted while the box read `Essa` carry `assessment: "Essa"` for good. A
  run over only those rows has exactly one distinct value, so the rule emits
  `Essa` INTO STUDENT-ADDRESSED COPY and into a model prompt. That is the
  harm owner answer 3 forbids, arriving one hop upstream of the door revision
  1 closed.
- Worse, and this is the silent-green: the label is seeded from localStorage
  and rows are minted before it is typed, so any such row carries `undefined`
  PERMANENTLY and is persisted that way. Under the plan's own counting, ONE
  legacy row forces `""` for every future run on that table - the heading reads
  "A note on this assignment" and the prompt reads "(untitled assignment)"
  forever, on the one surface A16-3 exists to serve.

**THE ANSWER IS ALREADY IN THIS TREE AND THE PLAN DID NOT CITE IT.**
`GithubGradingPanel.tsx:861` captures `lastGradedFolder` INSIDE THE GRADE
HANDLER - a run-time snapshot of the live control, with a comment saying it is
tied to what this run covered even if the box has since been edited. That is
identical in kind to the `courseName` treatment the plan already accepts at
`:612`. **Do the same for `assignmentName`, and state why the asymmetry is
gone.** The two detectors in the wave-2 gate currently name `assessmentLabel`
and would make the precedented solution FAIL - rewrite them to permit a
run-time capture and to forbid a render-time read.

BL-2 is the same defect seen at the gate: the implementation clause and its
gate state DIFFERENT membership rules, and they disagree on the cell
`{label, undefined}`. That is Ruling 1's class again - state the rule ONCE and
apply it to the clause, the unit test and the sabotage together. The sabotage
that certifies the leaf does not kill under one of the two rules.

## RULING 9 - scope the gate to the wave's own paths. I fixed an instance where the class was the problem.

BL-3, and it is NEW, and it is mine. Ruling 3 exempted one filename; the class
is "a whole-repo gate combined with concurrency authorised by the same
document". The plan copied my narrow exemption verbatim while independently
authorising wave 1 to run beside A18 - and a concurrent wave dirties paths in
no other wave's set and in no exemption, so EVERY A16 WAVE GATE FAILS. Not
hypothetical: at the moment of the check, `git status --short` printed a
concurrent A18 agent's live work, and a wave dispatched then would have failed
its own gate and pushed the implementer toward exactly the cleanup Ruling 3
existed to prevent.

**THE GATE IS NOW PATH-SCOPED: `git status --short -- <the wave's published
paths>`, or a diff against a pre-wave snapshot.** Pass: every path printed is
in this wave's published set. The `css-orphans` exemption stays as a belt, but
it is no longer load-bearing. Concurrency authorisation stands.

## RULING 10 - reuse the shipped meta type and gate predicate

MJ-3, accepted, and the plan never asked the reuse question in 893 lines.
`grading-results/classTrendsEntry.ts` ALREADY exports `ClassTrendsEntryMeta`,
`toClassTrendsEntry` and `hasTrendableResults` - and `hasTrendableResults` is
already unit-tested over the enumerated product the plan demands for its NEW
predicate. Two predicates gating the same panel on different surfaces is the
recorded class where consolidating them later makes the comparing test a
tautology.

**Wave 2 REUSES `ClassTrendsEntryMeta` and `hasTrendableResults`.** If the
cohort genuinely needs a different predicate, the plan must say what the
difference IS and why one predicate cannot serve both - a do-not-reuse
justification, in writing, or reuse.

## RULING 11 - republish A18's set before any dispatch

MJ-1. The plan's A18 set is stale by two files, and the grep supporting it is
falsified at HEAD - round 3 widened A8 to six files in the SAME COMMIT as the
revision, so the plan was honest when written. The check re-derived against the
live six-file set and the concurrency conclusion SURVIVES, all three
intersections still empty, informational independence intact.

But it survived by luck for the second consecutive round on this exact
question, which is the class Ruling 2 named. **Re-publish A18's live set from
`docs/a18-ac.md` as overridden by all three rounds of `docs/a18-rulings.md`,
and re-derive rather than re-assert.**

## RULING 12 - the module-deck-capture hand-over is disposed here, by reduction

MJ-4. RES-P-2's owner is "the implementer of the next chunk that writes
`module-deck-capture/`" and a grep returns ZERO for that string in the backlog,
with a canary proving the instrument fires. Nothing schedules it - a deletion
by the register's own sentence, and the same class Ruling 4 closed one commit
ago by creating A24 and A25.

It does not need a row: the object is a stale comment citation in a file A16
never touches. **Disposed as a REDUCTION**: owner ME, instrument the grep the
check ran, step the next A16 wave gate, recorded in the A16 backlog row so it
survives the plan. Small blast radius is a reason to reduce, never a reason to
leave the receiver dangling.

## RULING 13 - carried

- The transcription slips are in the two sections that settle the membership
  rule and the hinge-line question: Set A's block is `:86-101` with the array
  at `:89-99`, the composer re-assertion `:103-108`, Set B `:110-119`, and the
  two `readdirSync` calls `:642-643`. Every load-bearing fact in those
  sections is exact; only the ranges slipped. Re-cite by symbol.
- The `modalAdoption` conclusion is RIGHT and its stated reason does not
  establish it: the predicate is a five-way OR, and the check settled it by
  measuring all five markers on the panel at zero with canaries. Carry the
  measurement, not the one-marker argument.
- RES-P-11 is SETTLED, not a residual: `loadStoredGithubGradingRun` is `:354`,
  `try {` is `:356`, and the `getItem` is `:357`. THE PLAN'S MEASUREMENT WAS
  RIGHT AND MINE WAS THE `try {`. Since this file wins where they conflict, my
  wrong number currently governs - so it is corrected here, and the residual
  is closed rather than carried with a step that names nothing scheduled.
- The disposition table collapses the check's eight minors into one unenumerated
  row. Enumerate them; a true claim that cannot be checked is not a disposition.

## What is NOT reopened

Everything listed as reproducing at the top of this round, plus the honesty of
the owner-verification routing - the check attacked that specifically and found
the four reading claims correctly routed, with real owners, instruments and
steps. Its objection was narrower and is Ruling 8: BL-1 was routed NOWHERE, and
it is not a reading claim at all but a traceable source-level fact that can be
instrumented today by asserting on the field's PROVENANCE rather than on the
adapter's call expression.

---

# Round 3 - rulings on the check of plan revision 2

DEFECTIVE: 3 blockers, 4 majors, 4 minors. One blocker is a REPEAT and is
disposed by construction below; one is a design decision I make here; ONE IS
MINE - Ruling 9 produced a gate that cannot fail.

Revision 2's measurement is excellent and the check could not break it: it
re-executed every load-bearing quantity and found exactly ONE wrong (the
apply-loop range). The intersections, both canaries, the symbol re-citations,
the six-marker modal measurement and the A18 re-derivation all reproduce. The
Ruling 10 import is verified SAFE - the only non-local edge is `import type`,
which the runtime-import-graph walker erases outright, and the check also
tested the hazard nobody asked about (a sibling directory's consumer census is
non-recursive, so a new importer cannot move it). None of that is reopened.

## RULING 14 - THE COHORT'S ROWS. My rulings named three fields and never named the fourth.

B1, and it is the third silent-green on this row. Ruling 5 named the three
meta fields and Ruling 8 fixed `assignmentName` - AND NOBODY EVER NAMED
`rows`, which is the field that decides whether the panel appears at all.

The boxed rule says the rows are captured inside the handler. It never says
WHICH rows, and two of the plan's own sabotages positively endorse the
pre-grade array, objecting only to the timing of the read. Measured, that
array cannot be anything else: it is a memo over React state, the row updater
returns a NEW row that lands on a later render, and the rubric-areas field is
documented as empty on a row never successfully graded and never persisted.

So on a first run every captured row carries a pending state and no rubric
areas, the shipped gate predicate returns false, and **THE PANEL NEVER
RENDERS. A16-3 SHIPS DEAD** - with the leaf's own unit tests perfectly green,
because they run over an implementer-authored fixture. The corroborating tell
is in the gate itself: its mapping row enumerates row states that only exist
BEFORE grading, which is evidence the plan expected the stale array.

**THE CONSTRUCTION, since this class gets no further attempt at the
mechanism:** the rule names the row source as THIS RUN'S CLASSIFIED RESULTS
MERGED ONTO THEIR ROWS, buildable inside the apply loop. And the gate gets a
row NO FIXTURE CAN SATISFY VACUOUSLY: assert the captured cohort carries at
least one row with non-empty rubric areas, plus a sabotage that captures the
pre-grade array at the top of the handler and MUST kill.

## RULING 15 - the detector region is the comment-stripped render body minus the handler

B2, NEW, and the plan walked into it while citing the file that solves it.

Both provenance pins read RAW SOURCE, and the plan MANDATES a 10-14 line hinge
comment at the capture and a 6-8 line one at the mount - comments whose
SUBJECT is the very identifiers the pins look for. Consequences measured:

- The POSITIVE pin is satisfied by the mandated comment alone, so the sabotage
  that deletes the identifier from the call does NOT kill. A tautology, and
  this repo has recorded that shape twice.
- The NEGATIVE pin goes RED ON A CORRECT IMPLEMENTATION, because the mount's
  mandated comment names what it forbids. The plan even documents what an
  implementer does next: finds it red and LOOSENS IT rather than fixing it.
- And the negative pin is evadable one hop: a render-body `const` one line
  above the mount is outside the pinned expression, so "never read from a live
  control at render time" - the load-bearing half of Ruling 8 - is not
  detectable at all.

**THE REGION IS: the comment-stripped render body, EXCLUDING the handler's
body.** That region is computable, and once wave 2 lands it contains ZERO
legitimate occurrences of the three identifiers. The repo's own detectors
already strip comments and SAY SO in the file the plan cites by symbol -
"comments naming the rule do not count, and are stripped before this check
runs". Carry the lesson, not just the citation. Broad-and-noisy over the whole
file was correctly rejected; the middle was available and unbuilt.

## RULING 16 - RULING 9 WAS WRONG. The gate must be a snapshot diff.

B3, and it is mine. I scoped the wave gate to the wave's own paths to fix a
real false-failure under concurrency, and I disarmed it: `git status --short
-- <the wave's paths>` CAN ONLY PRINT PATHS IN THE PATHSPEC, so "every path
printed is in the wave's set" is true BY CONSTRUCTION. There is no input on
which it fails. The check proved it by running the form and getting silence -
silence it would produce whether or not the file had been edited.

That is worse than the problem it solved, because this gate's recorded purpose
in this project is that implementer subagents can silently exceed their brief
and misreport. And it quietly deleted the only instrument for four other
stated pass conditions - every "green WITHOUT being edited" clause, and the
membership rule itself, whose whole point is that run-only files are not
written. A wave that edits a structural gate to make itself green now passes
both the gate and the suite.

**THE GATE IS A SNAPSHOT DIFF, and the alternative I offered is withdrawn:
capture `git status --short` REPO-WIDE immediately before dispatch, run it
repo-wide again after, and FAIL ON ANY PATH THAT IS NEW OR CHANGED AND NOT IN
THE WAVE'S PUBLISHED SET.** That keeps out-of-set detection while ignoring
whatever a concurrent wave was already touching, which is the whole of Ruling
9's motivation. The two forms were never equivalent and I should not have
written them as alternatives.

## RULING 17 - majors, each with a required change

- **M1**: wave 1 can pass its gate BY DELETING 32 COMMENT LINES. The only
  condition is a line count plus an unchanged suite, and the plan measured this
  file at 298 comment lines. Nothing asserts the new leaf exists, is imported
  or is called. Add the gate row: the panel imports from the leaf and
  references its exports, AND the comment-line count did not fall.
- **M2**: wave 1 is the least specified wave and the only one with no scoping
  pass, while wave 3 - less risky - gets one. The plan concedes the extraction
  target is an architecture decision and then dispatches it as a build wave.
  This repo's recorded failure is exactly here. NAME THE TARGET OR GIVE WAVE 1
  ITS OWN SCOPING PASS.
- **M3**: `student: row.studentName` is called a requirement and has no gate
  row, while its negative twin gets a dedicated one. The type forces A value,
  not the RIGHT one - an adapter emitting an empty string passes everything
  and silently breaks N13b later. Add the positive assertion.
- **M4**: the empty-label outcome is THE DEFAULT PATH, not an edge case - the
  readiness check gates on the rubric and the row count, so the assessment box
  is optional. Revision 2 says that failure "disappears", which is true only
  of its permanence. The common case renders the exact strings Ruling 8 used
  to DESCRIBE the silent-green, and it is unrouted. Route it.

## RULING 18 - minors

Pick one on the re-export contradiction (5.4 says re-exported through the leaf,
5.5 says exports reduce to three, and the gate goes red if the leaf exports its
own predicate - an implementer following 5.4 trips it). The apply loop is
`:581-586`; the cited range excludes both the apply call and the closing brace,
and it is cited BY LINE in a plan whose own section forbids that - the third
off-by-one on this row. RES-P-2 describes itself as already done while its own
instrument returns zero, and no wave's set contains the backlog file, so only
the orchestrator step can perform it - that is mine, and it is noted. Add the
unlisted consumer-census test to the run-only list; harmless, but unchecked.

## Scope of the next pass

MECHANICAL AND BOUNDED, like A18's round 3. Rulings 14 through 18 are a named
row source plus its non-vacuous assertion, a computable detector region, a
snapshot-diff gate, four gate rows and a handful of citations. NOT a third
attempt at any mechanism. Do not rebuild anything listed as reproducing above.
