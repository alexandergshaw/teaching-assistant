# The dev loop

The core card. It says what runs, when, and at which tier. It does not restate
the other cards - point a brief at a named section instead of pasting it, since
the orchestrator's output is the most expensive text in the system.

| Card | What it holds |
|---|---|
| `docs/loop/this-repo.md` | The measured facts: gate commands and what passing looks like, test framework and its hard limits, the structural gates that turn an innocuous change red, shell quirks, what cannot be verified here at all, tier-to-model mapping and cost |
| `docs/loop/seats.md` | Per-seat briefs: what each seat produces and what its checker must ask |
| `docs/loop/iteration-caps.md` | How many rounds an artifact gets, the four legal disposals, the checker output contract, the anti-gaming rules |
| `docs/loop/traps-tests.md` | Tests and mutation |
| `docs/loop/traps-spec.md` | Specification and measurement |
| `docs/loop/traps-search.md` | Search and false absence |
| `docs/loop/traps-orchestration.md` | Orchestration, spend, and the orchestrator's own rulings |
| `.claude/agents/` | Tier definitions. Tier lives here, never in a per-call override |

---

## The core principle

**The implementer and the verifier are never the same agent, and neither are the
author and the checker of ANY artifact.** A cheap model writes the bulk of the
code; a stronger model sets criteria and gates quality; a FRESH peer
adversarially checks everything a model authors. Nothing ships until it provably
meets stated acceptance criteria.

**The orchestrator authors nothing except chunking, rulings, the decisions
ledger and the push.** Catching yourself producing an artifact instead of
routing one is the signal to spawn the seat.

---

## Tiers

Set in `.claude/agents/`, not per call, so a per-call override cannot silently
re-tier a seat. Full mapping, model IDs and prices in `this-repo.md` section 8.

| Tier | Model | Used for |
|---|---|---|
| top | `fable` | Only where a mistake is inherited by everything downstream: the chunking, and a seam every wave depends on |
| seat | `opus` | Acceptance criteria, design seats, plans, test notes, verification, remediation, root-cause analysis |
| checker | `opus` | The adversarial check over each artifact |
| implementer | `sonnet` | Code, fixes, tests written from notes, mechanical sweeps |

Opus is 2.5x Sonnet and 5x Haiku per token; Fable is 2x Opus.

---

## Step 0, before anything else

1. **Compare against work already done, queued, or in flight.** The requested
   feature is sometimes already built and merely unreachable - if so, say that
   and start the reachability work in the same turn.
2. **Re-chunk the whole queue.** Never append to a flat list. Priority order:
   file-set disjointness, unblockers first, same-evidence items together, each
   chunk independently pushable.
3. **Prove disjointness by EXACT PATH against the real tree.** Then run a third
   check: every caller, and every assertion that passes *because of* the
   behaviour being changed, classified owned / adopted / checked-safe.
4. **Triage which seats run, per chunk, recording the trigger that fired.** When
   unsure, the seat runs. The trigger table is in `seats.md`.

---

## The loop

**Criteria.** Write acceptance criteria from the owner's words. Keep only what a
user experiences and the failures the tests must catch - mechanism belongs to
the architect, global-invariant accounting to the plan, oracle construction to
the test seat.

**Design seats, concurrent.** Architecture; user experience; data and storage;
visual and aesthetic; operability and admin; security; reliability;
accessibility. Plus external-facts research when the plan rests on anything
outside the repo, and a baseline seat when the area has no regression coverage.
Briefs and checker questions in `seats.md`.

**Checks.** Every model-authored artifact is checked by a fresh peer before its
consumer reads it - adversarial brief, "break it", default to defective when
uncertain. Group checks along the seams the seats already share, so one checker
can see cross-seat contradictions. A clean check ends the chain. Findings go
back to the author, then a DELTA re-check carrying the change, the artifact's
new inventions (attack those hardest), and a "confirmed sound - do not
re-litigate" list. Round budgets and disposals: `iteration-caps.md`.

**Baseline.** Before hand-off, record the target area's current behaviour in
`docs/REGRESSION.md`. Skip only if the doc already covers it - check with
`grep -a`.

**Build.** Implementers code from the criteria verbatim plus the plan, the
ledger, and failing tests. Waves are disjoint by write set, and every wave
includes the file that CALLS each new export.

**Gate the wave on the tree.** `git status --short` against the assignment, plus
a check that no `.claude/worktrees` copy was edited instead of the real tree. A
report is not evidence.

**Verify.** A different agent reads the diff, runs the gates, exercises every
criterion, and rules on every triaged-out seat's trigger against the built diff.

**Follow-up design seats** against the as-built diff, not the plan.

**Tests.** Unit tests from the test seat's notes, then a sabotage pass that
mutates each unit and proves the test can fail.

**Accessibility**, then a final review over the whole diff.

**Regression**, batched per group: one pass per backlog group, its own push,
never per feature and never several groups rolled together.

**Root-cause analysis** for anything that failed, then fix and re-run until
clean.

**Push.** The loop ends at the push.

---

## Standing rules

- **Never stop for permission while a backlog exists.** Finish a chunk, push it,
  and start the next in the same turn. Details and the failure behind it in
  `traps-orchestration.md`.
- **Minimize clicks** on any user surface, without trading away confirmation
  steps.
- **Regression always happens.** Scale the effort; never scale it to zero.
- **Ship as often as safely possible.** Shared files are the trap.
- **Steps that execute are never capped.** Tests, sabotage passes, verification
  against the built diff and regression run until clean. Only steps that argue
  are capped.
- **Every rule needs the failure it prevents.** A rule with no instance behind
  it is one somebody invented; delete it.
