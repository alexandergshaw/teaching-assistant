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
