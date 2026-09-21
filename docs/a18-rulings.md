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
  (5 comment + 7 emitted), or 14 occurrences since `:171` and `:174` each
  carry two. THE PARTITION IS RIGHT; ONLY ITS ARITHMETIC IS WRONG.
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
