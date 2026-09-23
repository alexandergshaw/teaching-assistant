# Owner decisions, 2026-09-23

Three questions reached the owner under the new two-rounds-then-ask rule
(`AGENTS.md`, "Two rounds, then ask"). All three were answered in one message.
Recorded here because a decision that lives only in a chat transcript does not
exist, and because each one closes a blocker that no further round could.

**These are DECISIONS, not rulings.** A revision that applies them is not a new
round - `docs/loop/iteration-caps.md` cap 2 says a revision applying already-
accepted rulings does not count. A29 and A38 therefore proceed.

## DECISION 1 - A29: design a named refusal for one-student courses, and ship
## without the measurement

The question was whether to run one authenticated `curl` against the owner's
Canvas sandbox to learn what a single-recipient POST actually does, or to design
a refusal and ship without knowing. **The owner chose: design the refusal, ship
without knowing.**

What this settles, and what it deliberately does not:

- The N=1 branch REFUSES, with a named reason the instructor can read. It does
  not attempt a send it cannot predict the outcome of. This is the right shape
  under uncertainty: the failure mode the round-2 check found is a message
  appended to an unrelated thread under a subject nobody chose, which is
  invisible to every instrument the design has, and refusing is the only
  response that cannot produce it.
- OC11 stays open. The design must NOT read this decision as "Canvas expands N
  ids into N private conversations, confirmed" - it is a decision to proceed
  without that confirmation, which is a different thing. Anywhere the design
  depends on the unconfirmed behaviour, the assumption stays visible at the
  point the code depends on it, per round-2 Ruling 17.
- The refusal is a REAL refusal, not a silent skip. A course that cannot be
  messaged must say so, name why, and leave nothing half-done - which means it
  fires BEFORE the ledger row is written, exactly like the zero-recipient row
  Ruling 19 added.

A one-student course is not exotic: the design's own exclusion filter can
produce N=1 from a roster of thirty, so this path will be reached.

## DECISION 2 - A38: the spend cap is a CONFIRM ABOVE N

The question was the cap's shape - a hard stop, a confirm above N, or a
disclosure only. **The owner chose: confirm above N.**

What this settles:

- Above N, the instructor is asked and may proceed. The control is not removed
  and no press is silently refused, so an instructor who genuinely wants to
  spend is not blocked by a tool second-guessing them.
- Below N, nothing is asked. A confirm that fires on every press trains the
  instructor to dismiss it, which is worse than no confirm at all - so N must be
  high enough that reaching it is genuinely unusual.
- N is still derived, not chosen round, and round-2 Ruling 9 binds: it comes
  from what ONE bulk press can actually spend, which is
  `min(totalCount, maxSubmissions)`, NOT `totalCount`. The earlier value
  exceeded one press by `totalCount - 40` exactly in the overflow case A38
  exists for.
- Round-2 Ruling 6 also still binds: the count increments when the call is
  DISPATCHED, not when it is classified, so a failed call that burned a model
  call is counted. A confirm-above-N built on a success-only counter would let
  an instructor re-press a failing row indefinitely without ever reaching N,
  which is the exact case a spend cap exists for.

This decision does NOT settle the confirm's copy. The rule from A31 Ruling 1
binds it: a sentence may assert only what holds on every caller and every
reachable state.

## DECISION 3 - A39: DROP the rubric non-persistence policy

The question was whether to keep the written policy that the rubric is never
persisted (`RubricInputModal.tsx:29-34`, repeated at
`SnapshotGradingPanel.tsx:143-149`). **The owner chose: drop it.**

This is the largest of the three decisions and the one with the widest blast
radius, because the policy is stated IN THE SOURCE in two places and both
statements become false the moment it changes. Consequences the architecture
pass must carry:

- **The stated policy must be deleted where it is asserted, not merely
  contradicted elsewhere.** Two source comments currently tell a reader the
  rubric is deliberately not persisted. Leaving them while shipping persistence
  is how a future pass "restores" the old behaviour believing it was intended.
- **Persisting is not the same as making it cheap to reach**, and the census's
  finding was about REACHING. A stored rubric that costs more interactions to
  retrieve than to re-paste is worse than not storing it, so the retrieval
  interaction is part of this decision's delivery, not a follow-up.
- **The existing precedent is a warning, not a template.** Repo Grades already
  persists a rubric - as ONE GLOBAL VALUE for every assignment
  (`ta-repo-grades-rubric`). Copying that shape would silently apply one
  assignment's rubric to another, which is a correctness defect wearing a
  convenience feature's clothes. Key it to something the app actually knows.
- **This is now the app's clearest advantage over a chat, and it is narrow.**
  The research pass established that a chat CAN persist a rubric via Projects,
  so persistence alone is not leverage. What a chat cannot do is say WHICH
  rubric version produced a given grade. If the rubric is persisted without
  recording which version graded which submission, this decision buys
  convenience and no leverage at all.
- Every new control persists under a `ta-` prefixed key, and the relevant
  exact-key-set canary tests must be bumped in the same commit.

A40 is entangled with this: the cartridge panel's rubric field was filed partly
as a persistence defect, and the filing pass established that the dropped policy
never covered that field anyway. That row does not change shape, but it can now
be scoped without waiting.
