# Traps: orchestration

---

## The orchestrator's own rulings

**Rulings are a leading defect source, and nothing was checking them.** Measured
instances, all from real runs: two rulings that could not both hold at one gate;
a rule that prevented a count rising but not falling, while the chunk's own
criteria made it fall; a file granted with no line budget against a cap it
nearly exceeded; a requirement to "enumerate coverage" that never obliged anyone
to switch the feature on; and a denial resting on an off-by-one in the enforcing
test. **Every checker brief says explicitly: attack the orchestrator's rulings
alongside the artifact.**

**The orchestrator authors nothing except chunking, rulings, the decisions
ledger and the push.** Catching yourself PRODUCING an artifact instead of
ROUTING one is the signal to spawn the seat. This is the cheapest correction in
the loop and the most frequently needed.

**Rulings are inside the iteration cap.** They are checked like any other
artifact. Several defect classes have existed only because two rulings collided.

---

## Running waves

**Gate every returning wave by inspecting the tree, not the agent's
self-report.** Implementer agents silently exceed their brief and then misreport
what they did. `git status --short` compared against the assignment is the gate;
a report is not evidence.

**Never let a file change under a running checker.** When an artifact grew
mid-check, telling the checker exactly what changed preserved the round; not
telling it would have wasted the round. **Corollary: batch rulings into a seat's
next round rather than resuming a seat whose artifact a checker currently
holds.**

**`git stash` is forbidden under concurrency.** One agent's stash reverts every
sibling agent's files. Say so in every brief. Recovery is per-path from
`stash@{0}`.

**Never junction `node_modules` into a throwaway worktree.** Removing the
worktree then EMPTIES the real `node_modules`. Recovery is `npm ci`.

**Exactly one caller runs `tsc`.** `tsconfig.json` sets `"incremental": true`,
so every run writes `tsconfig.tsbuildinfo` at the repo root and concurrent runs
race. `npm test` is safe to run concurrently; `npx tsc --noEmit` is not.

**Baseline from a HEAD worktree you measured yourself,** with
`core.autocrlf=false` and a short path. CRLF fakes failures, and long filenames
abort the checkout.

**After a rate-limit or a crash kills a wave, inventory partial files before
relaunching.** Four agents died in one incident; three had already written their
artifacts. Only one round was actually lost, and relaunching all four would have
thrown away three.

---

## Spend

**Repeated rounds at one step mean a shape change or an owner scope question -
not another round of the same kind.** One feature request consumed roughly 14M
tokens across about 60 agent runs and shipped no code, while a chunk already at
the build step shipped verified green code in a single wave. The tell is the
round counter, and the response is a disposal, not a retry. See
`iteration-caps.md`.

**A blocker is sometimes a product question, not a defect.** Three rounds of one
feature's defects ended when the owner was asked and chose to drop the feature.
Later examples: "this data transfer has nowhere to be disclosed" and "one click
fires about 25 billed searches" were both owner decisions, not engineering
problems. Teach the tell: when a checker's blocker is really about scope, cost
or risk appetite, ask - as one batched question, while other work continues,
never as a gate.

**A documented, compensated skip is legitimate; a silent one is not.** One
expensive check was skipped with three things recorded in advance: the reason,
the surviving half of its value, and the compensating control. Record a trade
that way and it is auditable. Record nothing and it is a hole.

---

## Never stall

**While `docs/BACKLOG.md` has ANY item in it, do not end a turn without work
already started on the next item.** This is the single most repeated correction
in this project's history, and the owner restated it in the strong form on
2026-09-13: the backlog having entries is itself the condition. Announcing the
next item is not starting it. Do not ask "should I proceed?", do not close with
an offer to change course, and do not pause the queue to report a finding -
report it and act on the obvious reading of it in the same turn. A push is not
a checkpoint.

This wording replaced a narrower one scoped to the "next chunk" section. That
narrower version was answering a real problem: the owner-only and
owner-decision sections are never empty by construction here (no `.env`, no
rendered component, no network under vitest), and those entries are precisely
the ones an agent must not start - so "a backlog exists" is a precondition that
is permanently true. The strong form handles that by DRAINING, not by
narrowing:

- An item you cannot start is **escalated in the same turn you continue other
  work**, batched into one message, never as a gate. Escalating is an action;
  it counts as work started.
- The owner-only section is not a parking lot. An unescalated entry sitting
  there is a queue that has quietly stopped while looking full.
- **The only legitimate stop** is when every remaining item is owner-blocked.
  Say so, list what each needs, and stop. That is a stop that REPORTS the
  backlog, not one that asks what to do next - and it is the one case where
  continuing would mean starting work the rule itself forbids.

This governs the top-level session only. A subagent handed a scoped brief
finishes that brief and reports back, including what it could not do.

---

## Mechanics

**Write commit-message files with `[IO.File]::WriteAllText`.**
`Set-Content -Encoding utf8` prepends a U+FEFF that lands in the commit subject.

**Drive the gates from PowerShell.** `bash` is not on PATH from PowerShell
(verified: `The term 'bash' is not recognized`), and the Bash tool is a separate
process. Pick one shell per script; do not try to bridge them.
