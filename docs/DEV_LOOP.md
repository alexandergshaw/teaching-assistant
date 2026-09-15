# The dev loop

The core card. It says what runs, when, and at which tier. It does not restate
the other cards - point a brief at a named section instead of pasting it, since
the orchestrator's output is the most expensive text in the system.

| Card | What it holds |
|---|---|
| `docs/loop/this-repo.md` | The measured facts: gate commands and what passing looks like, test framework and its hard limits, the structural gates that turn an innocuous change red, shell quirks, what cannot be verified here at all, tier-to-model mapping and cost |
| `docs/loop/seats.md` | Per-seat briefs: what each seat produces and what its checker must ask |
| `docs/loop/wave-dispatch.md` | Which seats run in which dependency wave, why fanning all of them out at once duplicates work, and what sequencing does and does not cost |
| `docs/loop/parallel-disjointness.md` | When two items may run SIMULTANEOUSLY: file-set disjointness computed rather than eyeballed, informational independence, the 2-3 cap, and the shared resources that no file list shows |
| `docs/loop/iteration-caps.md` | How many rounds an artifact gets, the four legal disposals, the checker output contract, the anti-gaming rules |
| `docs/loop/traps-tests.md` | Tests and mutation |
| `docs/loop/traps-spec.md` | Specification and measurement |
| `docs/loop/traps-search.md` | Search and false absence |
| `docs/loop/traps-orchestration.md` | Orchestration, spend, and the orchestrator's own rulings |
| `docs/BACKLOG.md` | The queue: what is owed, by whom, and measured how. Read at step 0, appended at disposal, reconciled at the push |
| `.claude/agents/` | Tier definitions. Tier lives here, never in a per-call override |

---

## The core principle

**The implementer and the verifier are never the same agent, and neither are the
author and the checker of ANY artifact.** Authoring - criteria, design, plans,
code - runs on the cheaper tier; a FRESH peer on the stronger tier adversarially
checks everything a model authors. Nothing ships until it provably meets stated
acceptance criteria. The strength goes into checking rather than authoring
because a checked mistake is caught and an unchecked one ships.

**The orchestrator authors nothing except chunking, rulings, the decisions
ledger and the push.** Catching yourself producing an artifact instead of
routing one is the signal to spawn the seat.

---

## Tiers

Set in `.claude/agents/`, not per call, so a per-call override cannot silently
re-tier a seat. Full mapping, model IDs and prices in `this-repo.md` section 8.

| Agent | Model | Used for |
|---|---|---|
| `loop-checker` | opus | The adversarial check over each artifact |
| `loop-top` | opus | Only where a mistake is inherited by everything downstream and is NOT itself checked: the chunking, and a seam every wave is built against |
| `loop-seat` | sonnet | Acceptance criteria, design seats, plans, test notes, verification, remediation, root-cause analysis |
| `loop-implementer` | sonnet | Code, fixes, tests written from notes, mechanical sweeps |

**The principle, to reason from if the numbers change: spend the strong tier
where there is no backstop, not where the work is verifiable.** A seat is
checked by a fresh peer before anyone acts on its output, so a seat mistake is
caught. Nothing checks the checker, and little checks the top tier, so those are
where a mistake ships. That is the whole argument, and it does not depend on
today's prices.

Opus is exactly 2.5x Sonnet per token, at any mix of input and output: input is
$5 against $2, output $25 against $10, and both ratios are 2.5. So the cost of
this policy is easy to reason about without knowing the input/output split of
any particular run.

---

## Step 0, before anything else

0. **Read `docs/BACKLOG.md` first.** It is the only durable record of what is
   queued, so "compare against work already queued" is not answerable without
   it. A residual, a relocated finding or an owed debt that is not in it does
   not exist - `iteration-caps.md` already rules that a residual without an
   owner, an instrument and a step is a deletion, and a residual with all three
   that lives only in a scratchpad is the same deletion with extra steps.
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
the test seat. When the chunk builds or changes a capability a user reaches -
not a bug fix, a refactor, a doc correction or an owner verification - the
document opens with a LEVERAGE CLAIM: one paragraph naming which advantage
class it claims, what the user does instead today, and what that costs them.
"Saves time" is not a claim. The claim refuses nothing and gates nothing: it
produces a claim, a removal test (the test seat's, below) and, at Verify, a
finding. Classes derived from this tree, the classes deliberately struck as
inherited, and the worked negative example are in `docs/loop/leverage.md`.

**Design seats, in DEPENDENCY WAVES - never all at once.** Wave 1 is structure
and state (architect + reuse survey, data and storage) plus anything that only
reads and reports (baseline, external-facts research). Wave 2 is constraints
(security, reliability, operability and admin). Wave 3 is experience (user
experience, visual and aesthetic, accessibility). Within a wave, run in
parallel; between waves, **regenerate the briefs** so later seats build on what
earlier ones established instead of re-deriving it. Fanning all six out at once
produced three duplicate discoveries and one moot section in a single measured
stage - see `wave-dispatch.md`. Briefs and checker questions in `seats.md`.

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
criterion, rules on every triaged-out seat's trigger against the built diff,
and re-judges the leverage claim against what actually shipped - a feature is
usually conceived WITH a real advantage and ships without it, which is why
this half is the load-bearing one. A claim the built diff no longer supports
is a FINDING, recorded like any other residual with the scope decision
belonging to the owner. It is never a refusal and never silently dropped.

**Follow-up design seats** against the as-built diff, not the plan.

**Tests.** Unit tests from the test seat's notes, then a sabotage pass that
mutates each unit and proves the test can fail.

**Accessibility**, then a final review over the whole diff.

**Regression**, batched per group: one pass per backlog group, its own push,
never per feature and never several groups rolled together.

**Root-cause analysis** for anything that failed, then fix and re-run until
clean.

**Record disposals as they happen; reconcile the backlog at the push.** A
disposal is not recorded until it is in `docs/BACKLOG.md` - residuals and
relocations are created during the check rounds, often many waves before the
push, and step 0 already rules that one living only in a scratchpad is a
deletion with extra steps. So append at disposal time. The push then reconciles
and closes, pushed no later than the chunk's own push:

- **Confirm every residual the chunk produced is present**, each with its
  owner, its instrument and its step. A design pass that ends with five residuals and a
  push that records none has deleted five requirements while reporting success.
- **Add what was relocated or deferred** - findings routed out of scope, items
  a disposal handed to a later chunk, and debts a ruling created ("the next
  feature touching this file owes the extraction before its own code").
- **Strike what this chunk closed**, and name the discharging commit in the
  push's own commit message - not in the backlog, which holds no history. An
  entry that stays open after the work landed teaches the next session to redo
  it; a "closed" section teaches them to read a changelog nobody trims.
- **Record what only the owner can settle**, separately from what an agent can:
  anything that needs a live key, a real browser, a production tick or a
  product decision. This environment has no `.env`, renders no component and
  blocks the network, so that list is never empty and pretending otherwise is
  how a residual becomes a silent assumption.

**Every backlog entry names the commit that created it, and every quantity and
quoted rule in it names the command or `file:line` that produced it.** The
commit hash alone is an auditability token nobody is required to spend: the
first version of this file named a commit on an entry whose line count was
remembered rather than measured (891 against a real 900) and whose quoted rule
had been deleted from the document it cited. Both passed every gate, because
nothing in the suite reads `docs/`.

---

## Standing rules

- **While `docs/BACKLOG.md` has ANY item in it, the loop does not stop.**
  Owner's rule, 2026-09-13, and it supersedes the narrower "actionable work"
  wording this line used to carry. Finish a chunk, push it, and start the next
  in the same turn. A push is not a checkpoint.

  The narrower version existed for a real reason and the reason still holds -
  the owner-only and owner-decision sections are never empty by construction
  (no `.env`, no rendered component, no network under vitest), and those
  entries are exactly the ones an agent must NOT start. So the rule resolves
  that tension by DRAINING rather than stopping:

  - **A turn ends only after the loop has either ADVANCED an actionable item
    or ESCALATED a blocked one.** Escalating is a step, not a pause - that is
    what lets the rule bind the whole file instead of a favoured section.
  - **A blocked item is escalated ONCE, not every turn.** Once surfaced it
    stays listed and silent until the owner answers or the blocker clears.
    This clause is what keeps the rule FINITE: without it, "escalating counts
    as progress" degenerates into re-asking the same unanswerable question
    every cycle - spinning wearing a decision's clothes, and more annoying
    than silence. If you catch the loop re-surfacing an item the owner has
    already seen, that is the bug.
  - **Owner-only items are listed so they are not forgotten, never so they are
    picked up.** The backlog says this in its own text, because an agent
    reading a list of open items will otherwise reasonably try to close them.
  - **Escalate the DECISION, not the task.** "I need you to decide X" is
    actionable; "I am blocked on X" invites a round trip asking what you need.
    A good escalation carries four things: what is blocked, what would unblock
    it (the exact command, credential or judgement), what it costs to leave it,
    and a recommendation where you legitimately have one.
  - **Closing an item DELETES it.** History lives in the git log, not in the
    file. A backlog that only ever grows turns this rule into an infinite loop
    of low-value work.
  - **The one legitimate stop** is when every remaining item is either closed
    or already escalated and awaiting someone else. Say so, list what each one
    needs, and stop. That branch is reachable, and it is what makes "never
    stops" a bounded rule rather than a promise of an infinite loop.

  Two failures this rule creates if applied carelessly, both worse than
  stopping: **reclassifying a blocked item as actionable** to keep going, and
  then **fabricating a result for it**. An item marked "needs a live key" must
  produce "still needs a live key", never an inferred answer presented as
  measured. The pressure not to stop is exactly what makes an agent reach for
  work it cannot finish.

  The never-stop mandate is the owner's grant and is revocable. Surface cost as
  it accrues rather than presenting a total at the end.

  Details and the failure behind it in `traps-orchestration.md`.
- **Disjoint backlog items are worked SIMULTANEOUSLY, not in sequence.**
  Owner's rule, 2026-09-13. The queue is not a single file - if two entries
  touch non-overlapping file sets, they run as concurrent subagents in the same
  turn. Standing consent; do not ask. "The current chunk is mid-flight" is a
  reason to check disjointness, never a reason to idle a second item.

  **What "disjoint" means is stricter than the word sounds, and
  `parallel-disjointness.md` is the authority.** Two items may run together
  only if they are disjoint in BOTH senses: their file sets do not intersect,
  AND neither establishes a fact the other designs against. An item's file set
  is **the files it edits PLUS the tests asserting on the behaviour it
  changes** - a one-line change to a shared helper edits one file and can break
  forty. Intersect the sets mechanically (`sort | uniq -d`) and paste the
  output; empty is the only pass. Pair every search with a canary, because
  `grep -P` is broken here and reports clean without checking.

  **Cap a wave at 2-3 items.** Beyond that they rediscover each other's
  findings; this repo's own four-seat fan-out produced two internally-sound
  design passes that directly contradicted each other.

  The gate is unchanged and non-negotiable: each agent gets an explicit file
  list, and `git status --short` is checked against it. Concurrency is what
  makes an over-reaching agent expensive - one agent outside its list can
  revert a sibling's work. Also shared, and not visible in any file list:
  `npx tsc --noEmit` has ONE caller (it races on `tsconfig.tsbuildinfo`), no
  two agents may sabotage-verify on the tree at once, `git stash` reverts every
  sibling's files, and `docs/BACKLOG.md` is a file like any other - if an agent
  may write it, the orchestrator may not, in that window.
- **The backlog is the queue, not a diary.** It records what is OWED and by
  whom, never what happened - `docs/REGRESSION.md` holds behaviour and the git
  log holds history. The instance behind this rule: the first version of
  `BACKLOG.md` shipped a "closed this session" section, which duplicated the
  commit bodies badly and had no rule telling anyone to trim it.
- **Minimize clicks** on any user surface, without trading away confirmation
  steps.
- **Regression always happens.** Scale the effort; never scale it to zero.
- **Ship as often as safely possible.** Shared files are the trap.
- **Steps that execute are never capped.** Tests, sabotage passes, verification
  against the built diff and regression run until clean. Only steps that argue
  are capped.
- **Every rule needs the failure it prevents.** A rule with no instance behind
  it is one somebody invented; delete it.
