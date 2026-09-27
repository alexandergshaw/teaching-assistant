# A39 build check - orchestrator rulings, 2026-09-27

The build check of waves 2 and 3a-i returned DEFECTIVE: 3 blockers, 4 majors,
3 minors. The code does what wave 2 said. **What it does not have is an
instrument that can fail** - and two of the defects land on MY OWN DECISIONS,
which is the part of this I most want recorded.

I verified the two that are mine before ruling. `grep -ohE '"ta-[a-zA-Z0-9-]+"'
src/app/components/*.tsx | sort -u | wc -l` returns **75** against a canary of 0,
and `rubricProvenance.test.ts:57-60`'s `mutatedStoreValue` is a dead local literal
never written to any store. Both hold.

## RULING 55 - THE CLASS IS A REPEAT AND GETS ONE CORRECTIVE RULE, not three patches

Blockers 1 and 2 are the same class the W2-5 residual was: **an instrument that
reports on something adjacent to its claim.** The checker deliberately did not
relabel them to buy anything, and it is right that one rule closes both.

- **W2-3, the "removal test", cannot fail.** Its mutated-store value is a dead
  literal, so `not.toContain(...)` is true by construction. It cannot even be
  fixed in place without a `window` stub, because the memory module returns `{}`
  under node - and `rubric-memory.test.ts:33-45` already has that stub. So the
  fix is available and was not used.
- **The claimed mechanism is deletable with wave 2's OWN 29-file gate green.**
  Remove all three stamp sites and 734 tests pass. With the stamps gone the
  provenance line disappears from the product entirely, and nothing asserts that
  grading produces the pair.

**Ruled: a requirement whose subject is a PRODUCED VALUE needs an assertion that
executes the producer.** Not a pure-function test over a hand-built fixture -
those are necessary and they are not sufficient, and this wave shipped only
those. Three uncapped instruments close all three blockers and they are
dispatched now, not filed: an executing assertion that grading stamps the pair,
sabotage-proven by deleting a stamp site; a real W2-3 using the `window` stub
that already exists; and one hand-off assertion per direction across the
extraction seam.

**And the rule that would have caught it at review time, which I am adopting for
every future wave: "paste the RED output" is not satisfied by a description of a
sabotage. If the red output does not exist, the instrument does not exist.** The
checker says this plainly about W2-3 and it is the single most useful sentence in
the report.

## RULING 56 - blocker 3: an extraction can split an anchor's subject

NEW class, and it costs DECISION 7 some of its premise. Two repointed anchors now
bind to a leaf's internal prop names, so the panel-to-leaf SEAM is unasserted:
disconnecting the auto-grade checkbox passes 166 tests across every panel reader,
and killing the Read button passes 93. Before the extraction, case (i) was RED.

DECISION 7 accepted no-oracle `.tsx` leaves on the premise that "the three
instruments that remain" hold. Two of them now measure the leaf's inside rather
than the join. **Ruled: every extraction owes one hand-off assertion per
direction across each seam it creates** - the prop goes out, the callback comes
back - and that is added to the extraction pattern so wave 3a-ii and any future
one inherits it rather than rediscovering it.

## RULING 57 - MAJOR 1 is a scope call and I am making it: state the limit

`engine.ts` is not the only producer of a rendered run. The `"other"` and
`"embedded"` providers never stamp the pair, both are user-selectable from the
same surface, and both have the rubric text in scope - so provenance renders as
**nothing, silently, on two of three paths**. The plan enumerated engine return
sites and never asked whether engine was the only producer, which is the
reachability question this project keeps relearning.

**Ruled: stamp the two non-Gemini producers.** Not disposal (b). A provenance
feature that is silently absent on two of three paths is worse than one that is
absent everywhere, because the instructor cannot tell which they are looking at -
and the row's leverage claim is stated over grading generally, not over one
provider. If stamping them turns out to need a seam change, come back and say so
rather than widening quietly.

## RULING 58 - MAJOR 2: the structural claim is unenforced, and the type argument is false

`Pick<GradingRun, ...>`'s `rubricUsed` is `string | undefined`, so a store-derived
literal typechecks. Nothing pins the signature, nothing guards the mount, and the
mount file already imports the store loader - so `<RubricProvenance run={{ ...run,
rubricUsed: rubric }} />` is one line, in that file, passing 54 tests.

So the wave's own words - "holds STRUCTURALLY ... cannot see the storage shape even
if sabotaged into trying" - overstate it. It holds by CONVENTION today. Ruled: pin
the signature, or stop calling it structural. I prefer the pin; the sentence is
what I put in the row, so correcting the sentence is correcting my own record.

## TO THE OWNER - two of your decisions have defects in how I recorded them

Both are mine, not the implementers'.

**DECISION 4's safety net does not exist.** I told you the exact 17-key assertions
were "the only place a forgotten cohort field fails loudly", and that the wave
must bump them deliberately. The bump was real but it belongs to A24's commit, not
wave 2 - and the claim is FALSE in the direction that matters: `toWire` is an
explicit literal, so a field added to the TYPE alone never reaches
`Object.keys(result)`, and there is no row-level exhaustiveness guard at all
(`grep -rnE "Exclude<keyof (SnapshotAssessmentRow|SnapshotRow)"` exits 1, while
the same shape against `GradingRun` exits 0). The codec's own header already says
this. **Either a three-line `Exclude<keyof ...>` guard gets built - wave 2 shows
exactly how, for the other type - or the sentence is corrected and the gap
accepted.** I recommend building it: it is three lines and it is the difference
between a guard and a belief.

**DECISION 9's trigger cannot fire.** I recorded "when a SIXTH key lands in that
directory, the canary is written then". Measured: that directory already holds
**75** distinct `ta-` keys. The trigger is long past, so as written the transition
rule is dead on arrival - and the residual's own instrument cannot reproduce the
baseline it claims. The decision's substance is fine; my wording made it
unmeasurable. **Ruled as a fix rather than a question: one trigger, worded against
a command that counts the right set, placed where an editor of those keys will see
it.** But you should know the rule you approved was not enforceable as I wrote it.

## What is sound and is NOT reopened

Both deliberate guards ARE enforced, each proven red: the empty-scope guard, and
the label naming the scope it came from. W2-4 fails in both halves, including a
`tsc` TS2322 - the one instrument in the row that provably fails. `86d932c`'s
closure assertion is sound, nine trails against nine, sabotage red, positive
control unable to pass empty. All three fold caps are present and per-tag pinned,
including the third field an earlier check found uncapped. The extraction
arithmetic is honest on both counters. The 386-line overage stands as I ruled it.
