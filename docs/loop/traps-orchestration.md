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

## Release-state claims

**Do not infer that a feature is visible in the app from source code, a feature
branch, or a successful migration workflow.** In the 2026-10-16 template-tools
incident, the code existed on a pushed feature branch and the database
migrations later landed on `main`; I told the owner where to find the tools
without checking whether the app deployment contained that code or served it
on the domain they were using. Their screenshot showed only the existing
PowerPoint Design tab.

Before saying a feature is live, verify and record that its exact commit is on
the production branch and is the commit served by a `READY` deployment for the
intended domain. Before naming its route or navigation location, also open that
deployed app and verify the relevant route or nav item is exposed. A READY
deployment and matching domain do not prove that the UI exposes the feature. If
browser or authenticated access is unavailable, state that UI visibility and
location are unverified; do not name a location as though you confirmed it. A
migration workflow proves only the database step; it does not prove that
application code was merged, built, deployed, or exposed in the UI. Keep these
states separate in reports: **implemented** (code on a branch), **migrated**
(database migration applied), and **live** (the exact production commit is
served by a READY deployment on the intended domain, with relevant UI exposure
verified). If any evidence is missing, state which release stage is unverified.

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

**A launched worker is not a completed implementation request.** In the manual
agnostic adapter, the host owns completion waits, actual output/result imports,
assignment finish and independent next-role admission until local delivery.
The 2026-10-15 template runs exported implementation packets and then had no
completion supervisor; reports existed while the host had ended its turn.
Answer an interrupt and return to that chain in the same active turn. A dispatch
marker can pass while this handoff remains unconsumed. Use the explicit manual
delivery assertion and exact saved launcher recipe in
`docs/AGNOSTIC_LOOP_USAGE.md`; its exit code is evidence only when invoked, not
an automatic host wakeup. If no wait/resume capability exists, report the missing
capability and outstanding handoff instead of promising background delivery.
Evidence and limits: `docs/agnostic-manual-handoff-rca.md`.

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

- **A turn ends only after the loop has ADVANCED an actionable item or
  ESCALATED a blocked one.** Escalating is a step, not a pause.
- **A blocked item is escalated ONCE, not every turn.** Once surfaced it stays
  listed and silent until the owner answers or the blocker clears. This is the
  clause that keeps the rule finite. Without it, "escalating counts as
  progress" becomes re-asking the same unanswerable question every cycle -
  spinning wearing a decision's clothes. A loop re-surfacing an item the owner
  has already seen is a bug, not diligence.
- **Escalate the DECISION, not the task.** "Decide X" is actionable; "I am
  blocked on X" invites a round trip asking what you need. Carry four things:
  what is blocked, what would unblock it (exact command, credential or
  judgement), what it costs to wait, and a recommendation where you have one.
- The owner-only section is not a parking lot, and it is not a worklist either.
  Those entries are listed so they are not FORGOTTEN, never so they are picked
  up.
- **Closing an item deletes it.** History is the git log. A backlog that only
  grows makes this rule an infinite loop of low-value work.
- **The only legitimate stop** is when every remaining item is closed or
  already escalated and awaiting someone else. Say so, list what each needs,
  and stop. That branch is reachable, which is what makes "never stops"
  bounded rather than a promise of perpetual motion.

The two failures this rule CREATES, both worse than stopping: reclassifying a
blocked item as actionable in order to keep going, and then fabricating a
result for it. An item marked "needs a live key" must produce "still needs a
live key" - never an inferred answer presented as measured. The pressure not to
stop is precisely what makes an agent reach for work it cannot finish.

The mandate is the owner's grant, revocable. Surface cost as it accrues.

This governs the top-level session only. A subagent handed a scoped brief
finishes that brief and reports back, including what it could not do.

---

## Mechanics

**Write commit-message files with `[IO.File]::WriteAllText`.**
`Set-Content -Encoding utf8` prepends a U+FEFF that lands in the commit subject.

**Drive the gates from PowerShell.** `bash` is not on PATH from PowerShell
(verified: `The term 'bash' is not recognized`), and the Bash tool is a separate
process. Pick one shell per script; do not try to bridge them.
