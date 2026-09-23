# A38 - orchestrator rulings, 2026-09-23

The check of `docs/a38-scope.md` returned DEFECTIVE: 6 blockers, 3 majors, 6
minors, and not buildable as written. Two calls are mine and no revision
resolves them; they are Rulings 1 and 2. The rest go back to the seat.

Not reopened - the check re-measured and confirmed: all thirteen line counts,
the bound proof, the one-call-site census, the dead-badge find (with a positive
control), fence 1, fence 4, the 19-key oracle, and all three A26 lock claims.
It also judged the feature-already-exists case WEAK, which is the right answer.

## RULING 1 - NO OVERAGE RATCHET. The panel owes an extraction first.

The panel is 990 lines against a 1000 limit with no overage entry, the scope
sets a hard cap of +9, and the check measured the realistic cost at 14-16 -
while section 3.1 has already fenced off both extraction candidates.

The tempting move is an `ALLOWED_OVERAGE` entry. **Refused.** That list is how
a ceiling dies: every entry is permanent, and a ceiling with exceptions stops
being measured. A16 faced this exact wall on this exact file and answered it
correctly - wave 1 extracted first, measured 966 to 918, with the comment
floor rising rather than falling. A38 does the same: **an extraction wave
precedes the feature, scoped on its own, and the feature's budget is measured
against the post-extraction count, not against 990.**

If the extraction genuinely cannot find the lines - which A16's pass proved is
possible to establish honestly - then say so and the feature waits, rather than
buying room by weakening the gate that protects the file.

## RULING 2 - THE SPEND CAP IS BUILT, not filed as a residual

Section 4.1 refused a per-row attempt count because "a reload clears it - a
false green". Section 4.2 of the same document then designs a PERSISTED per-row
field for exactly that reason. The objection is answered inside the artifact
that raised it.

**So the aggregate-spend cap is built on the mechanism 4.2 already establishes:
a per-row count that survives a reload because it rides the same wire the
digest does.** This matters more than a residual because A38 REMOVES BY
CONSTRUCTION the only cap on what one screen can spend - the bound is
per-invocation, and a one-row press is always under it. Shipping the button
without a cap is shipping an unbounded spend control, and "the owner will
notice" is not a cap.

What I am NOT ruling: the shape of the cap's refusal - a hard stop, a confirm
above N, or a disclosure - is the seat's to design and the owner's to accept.
Measure what N should be rather than choosing a round number.

## RULING 3 - the five structural defects go back to the seat, named

- **B1**: the ONE requirement A38 exists for - the sentence A34 deleted - has
  no file in any write set. The action and its test must be in wave 1 or the
  ship is a button with both deleted sentences still saying nothing is
  available.
- **B2 and M9**: the offer sentence is FALSE after a reload, because the rubric
  is not persisted while rows are - so twenty rows offer a control that is not
  rendered. And the wave-2 hint then warns on EVERY graded row after every
  reload, since the current digest is the digest of an empty rubric. This is
  `a31-rulings.md` RULING 1 reintroduced by the document that cites it, which
  is the second time this family has shipped its own replacement false.
- **B3**: the layer diagram and the eligible-set table disagree, and the line
  budget is derived from the disagreement. Re-derive the prop set from section
  4.4's own table, then re-cost.
- **B4**: the badge reuse has no write path in its write set, and the only
  reachable mutator BLANKS a graded row's feedback - permanently when the
  action returns an error. A pure state-only mutator is the fix and its file
  must be in the wave that needs it.
- **B5**: fence 3 is quoted from the wrong function. The live gate also bans
  the one spelling the sibling canary recommends, so the design as stated would
  turn the build red on the spelling an implementer is steered toward.
- **B6**: the hash ruling rests on a false absence - it IS already imported
  from a client component, shipped - and the residual's baseline is off by one.
  The document's own opening rule demands a canary before an absence; this
  grep had none.
- **M7**: the owns derivation is a filename grep and cannot see repo-wide
  walkers. Thirty-nine files walk directories rather than naming them, and
  wave 1 adds a new client file importing a server module.

## RULING 4 - minors, carried

The `userEdited` refusal is cited three times to a doc comment; the real
refusal is in a file in no write set, and the no-confirm argument rests on it.
"Five engine entry points" is inherited, not measured. The `grading` grep
returns eight, not four, though the claim it supports is right. The +9 cap and
"RED at 1001" disagree by one on the number the whole shape turns on. The lock
is three lines, not two - and it introduces a FOURTH non-success exit from the
handler that does not clear the cohort, which the wiring test pins at three
and is blind to.

## RULING 5 - minor 13 is mine, and it was worse than stale

The scope escalated two loop cards as carrying a stale constant. It was right,
and I corrected both in the same commit that landed the scope - so its
escalation read as stale on arrival. But my correction to `seats.md` was
**spliced into the middle of a sentence**: it asserted the coincidence never
existed and then ran on into the clause that only made sense if it did. The
passage did not parse.

Rewritten whole at this commit, and the lesson is recorded in the card itself:
the example failed in exactly the shape the card warns about - two numbers
asserted to collide, neither re-measured. THE QUESTION SURVIVED ITS EXAMPLE.
A patch that leaves a sentence half-arguing its old claim is worse than the
stale claim, because a reader cannot tell which half to believe.
