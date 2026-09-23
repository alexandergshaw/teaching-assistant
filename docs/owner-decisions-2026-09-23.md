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

## DECISION 4 - A24: the disclosure names NO assignment. Use the digest.

The question was whether the class-trends disclosure line may NAME the
assignments a cohort spans, or whether "more than one assignment" is enough.
**The owner chose the digest.**

What this settles:

- Nothing identifying is stored. The digest is a derived, non-reversible value,
  so the whole persistence argument that dominated round 1 - and the privacy
  rule the scope wrongly believed forbade it - stops mattering. No assignment
  text, no new control, no new `ta-snap-*` key, no key-canary bump.
- `cohortLabelSpread`'s equivalent needs only `Set` distinctness over the
  digest, which is the cheapest thing that answers the question the line asks.
- **The cost the round-2 revision found, which does NOT go away**, and which the
  wave plan must carry: a per-row field is not free even without a key canary.
  `snapshot-row-serialization.test.ts:93-113` is an exact 17-key
  `Object.keys(result).sort()` assertion on `toWire`, with a second exact set at
  `:379-392`, so an 18th field turns both red. That is a feature, not an
  obstacle - `snapshot-row-serialization.ts:60`'s `as unknown as` cast means tsc
  will NOT flag a field added to the type and forgotten in the codec, so those
  assertions are the only place a forgotten cohort field fails loudly. The wave
  that adds the field bumps them deliberately and proves the failure first.

What this does NOT settle: whether the digest's confirmable-match weakness
matters. A digest lets someone holding a candidate assignment text confirm a
match; it does not let them recover the text. The revision recorded this as a
judgement rather than a defect, and the owner has now chosen the digest with
that recorded - so it is accepted, not overlooked.

## DECISION 5 - A32: per-slot schedule, not one panel-level field

The question was whether a scheduled post time belongs to each draft slot or to
the panel as a whole. **The owner chose per-slot.**

What this settles, and the trap that comes with it:

- The control is per-slot, which matches what the panel is for: drafting several
  announcements meant for several different moments. A panel-level field would
  force one time onto drafts that exist precisely because they are for different
  weeks.
- **The precedent is `choose-timing`, NOT the `edit` action** that round 1
  named. The revision found the real one: `useAnnouncementDraftSlots.ts:238`,
  action type at `announcement-draft-slots.ts:364`, reducer case at `:408`,
  structure test at `:745-763`. Follow that shape rather than inventing a third.
- **THE NAMING HAZARD, which must be designed against rather than discovered.**
  `AnnouncementDraftSlot.tsx:117` already renders a per-slot select labelled
  **"Timing"** - and it is not a schedule at all. It is content framing
  ("Beginning of week" / "Midweek check-in", `AnnouncementTiming` at
  `walkthrough-announcement-prompt.ts:64`). A per-slot Canvas schedule control
  would sit directly beside it. Two adjacent controls, one named "Timing", the
  other governing when Canvas actually posts, is the five-labels-for-one-act
  defect `docs/a17-discovery.md` measured in this app today - reproduced
  deliberately this time. The design must name both controls so an instructor
  can tell which one decides when students see the announcement.
- Ruling carried from the check and NOT reopened: the scheduled time is **not
  persisted** (Branch A). A stale restored timestamp combined with the silent
  non-future fallthrough is the worst available combination.
- REQ-A32-1 still binds: ONE exported predicate returning immediate, scheduled
  or invalid, read by the consequence copy, all three labels and the post
  decision - so a past-dated pick cannot say "scheduled" while publishing
  immediately and irrevocably to every student.

## DECISION 6 - A39: the per-item call is a Route Handler at maxDuration = 60

The question was what the unconfigured Server Action duration ceiling actually is
on this Hobby deployment, with the recommendation to stop depending on the answer.
**The owner chose: switch the per-item call to a Route Handler at
`maxDuration = 60`.**

What this settles:

- The ceiling becomes DECLARED rather than discovered. The architecture's own
  citation (`course-intel/ask/route.ts:47-50`) already says a Server Action has
  no declarable ceiling, and records three routes that moved off Server Actions
  for exactly this - so this follows an in-repo precedent rather than inventing
  one.
- The client pool STAYS. Section 4.1's table treated "Route Handler with
  maxDuration" and "client pool" as exclusive and they are not: the pool is what
  resets the clock per call, the route handler is what gives each call a
  confirmed ceiling. The combination was always the only candidate with both.
- 60s is the Hobby hard cap, so `maxDuration = 60` is the ceiling, not a choice
  within a range. One item must complete inside it; the design says what happens
  when one does not, and that is now a per-item failure the pool can report
  rather than a whole run dying mid-loop.
- Everything a Server Action gave for free must be re-established explicitly in
  the handler: the auth guard, the identity, and the input validation. A route
  handler is reachable by anything that can reach the origin, so this is the
  security consequence of the decision and not a detail. `requireUser()` or its
  equivalent belongs in the handler, and the action-guard coverage test that
  pins the guarded surface list is in the write set.

What this does NOT settle: whether the Server Action form is preserved for any
other caller. If something else depends on it, that is a separate answer.
