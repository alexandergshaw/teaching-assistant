# Manual host handoff stall: 2026-10-15

The manual file adapter did not own a completion supervisor. The host treated
dispatching implementation workers as sufficient reason to end its active
implementation turn. Their reports subsequently needed host imports, assignment
finish and independent checker admission. Those steps were not scheduled by the
bootstrap script. This is a host handoff failure; no native continuous-repair
acceptance, provider fault or runtime delivery follows from these observations.

## Evidence and causal boundaries

The evidence directory is
`.agnostic-loop/manual-handoff-stall-fix-20261015/`. Its `capture.ps1` reads the
frozen implementation reports, implementation packets and immutable assignment
start event files from the `powerpoint-template-library` and
`document-template-abstraction` managed workspaces. It does not read their
changing state stores while the coordinator admits checkers. `evidence.json`
records file paths, SHA256 values, filesystem UTC write times and packet fields.
Reproduce metadata with `Get-Item`, hashes with `Get-FileHash -Algorithm SHA256`
and parsed fields with `Get-Content -Raw | ConvertFrom-Json`, as in that script.

- Both exported implementation packets have revision `72` and an assignment
  status of `running`; their immutable `assignment.start` envelopes expect
  revision `71`. These numbers come from `capture.ps1` packet/event parsing.
  They describe the exported handoff, not a claim about current state.
- Report filesystem last-write times, from `capture.ps1` / `Get-Item`, are
  `2026-10-15T13:27:36.0012401Z` (PowerPoint) and
  `2026-10-15T13:23:47.6218723Z` (document). Filesystem times establish file
  availability, not exact host completion or idle duration. No elapsed stall
  estimate is asserted.
- The coordinator's session observation is that both host workers completed
  while the stores still showed the exported running assignment, and the
  coordinator only resumed imports/checker admission after the owner's status
  request. This is attributed host evidence, not reconstructed from report
  timestamps. The RCA worker did not race live stores to independently measure it.
- `.agnostic-loop/template-tools-20261015/operate.mjs`, branch
  `contracts-and-build`, loops across scope, criteria, design, plan and test-design
  and registers the same actual coupled contract checks in both rounds. The role
  and round cardinalities are obtained by reading that branch, not independent
  substantive reviews invented for every registration. It then starts the
  implementation assignment, exports its packet, reads state and exits. There
  is no host-worker wait, result watcher or next-role launch in that branch.
- `src/tools/agnostic-loop/cli.ts` captures context before manual commands;
  `store.ts` captures it again in mutations, and `context()` calls
  `captureCandidate`. Repeated bootstrap events therefore repeat candidate work.
  This is visible overhead, not measured proof of what dominated elapsed time.
- `.claude/settings.json` attaches only `backlog:stop-guard` to its Stop hook.
  `src/tools/backlog/dispatch-guard.ts` compares dispatch/stop markers. It cannot
  establish result consumption, and that Claude configuration is no evidence
  of a Codex host callback. A worker launch can satisfy its narrow purpose while
  the end-to-end request remains undelivered.

The initiating cause was the host ending an ongoing implementation turn at a
dispatch boundary. The enabling gap was presenting manual packet glue without
an explicit host completion obligation or delivery assertion. Expensive contract
registration amplified the delay but did not cause the absent handoff. Stronger
never-stall prose alone and periodic reminders cannot import a worker result.

During recovery the coordinator reported imports reaching revision `73`, followed
by `assignment environment/tool stale` on finish: an equivalent loader URI had
been reconstructed with different argument spelling. That is a separate recovery
hazard, attributed to the coordinator's observation. Preserve the exact admitted
launcher and environment recipe; retain freshness enforcement. This fix neither
changes grants nor substitutes a new engine identity for the admitted one.
The coordinator recovered the original recipe from the host transcript:
`C:/Program Files/nodejs/node.exe` with argument array
`["--experimental-strip-types","--experimental-default-type=module","--experimental-loader","./src/tools/backlog/resolve-ts-hook.ts",".agnostic-loop/template-tools-20261015/operate.mjs"]`,
working directory set to the respective feature workspace. Environment hashes
matched; changing the relative loader spelling to an equivalent absolute file URL
changed `execArgv` and correctly failed the pinned tool identity. The coordinator
owns reusing that exact recipe and recording it in each run's ignored launcher
record. This RCA does not claim recovery completed merely because the recipe
was found.

## Concrete change and regression instrument

`manual-handoff.ts` is a read-only executable completion assertion over the
existing validated engine store and immutable blob checks. It requires explicit
item selection and rejects unknown or empty selections. Pending item states,
retained assignments, unreconciled operations, owner-needed activities and recorded
needs refuse a successful delivery assertion, even when a report exists. It
performs no candidate scan, provider launch, event import, acceptance or recovery.

`docs/AGNOSTIC_LOOP_USAGE.md` now owns the manual host sequence: wait, inspect,
import actual bytes/result, finish, independently admit the next role, continue
gates and delivery. Interrupts return to this chain; they do not terminate it.
It requires the explicit assertion before ending the active implementation turn
or claiming delivery and preservation of the exact launcher recipe. The trap
card points to that operational sequence instead of inventing another scheduler.
`AGENTS.md` links that guard from the existing agnostic entry so a fresh host
encounters the obligation before using manual packet glue.

Run the narrow regression instrument from the repository root:

```powershell
npm.cmd run test:paths -- src/tools/agnostic-loop/manual-handoff.test.ts
```

The named test command exercises the public executable with real store files,
asserts nonzero pending/invalid selection outcomes and unchanged input bytes,
and includes a shipped-state positive control. Additional cases distinguish
author completion and verification from delivery, aggregate explicit requests,
and preserve uncertainty/owner-disposition boundaries. Fixture shipped markers
are test inputs; they are not acceptance recorded for either real feature run.

After the coordinator restored the admitted launcher and admitted checkers, the
coordinator authorized a read-only live assertion against both stores.
`live-guard-observations.json` records exact arguments, capture times and native
`$LASTEXITCODE`: both were `2`, with revision `75`, `ready-to-build` and
`implementation-checker-1` running. These fields are produced by the public
guard command above with each actual store and item, captured at
`2026-10-15T15:49:16.6645944Z` and `2026-10-15T15:49:17.3165779Z` respectively.
This distinguishes a real next-role handoff from completed delivery. These are
point-in-time snapshots; the coordinator continues mutating the stores.

## Limits and residual ownership

The guard is invoked by the active operator. No automatic Codex Stop-hook
attachment, host completion callback or durable wakeup is claimed. It cannot
force a host that never invokes it to continue. The coordinator owns invoking
the guard and consuming actual worker completions during this implementation
request; observe that through the host's completion tools and real engine
imports. If the host lacks durable continuation, it must state the exact missing
capability and outstanding handoff instead of promising autonomous completion.

Native continuous repair remains a separate unaccepted project. No service,
grant, timer, provider dispatch or acceptance record is changed here. Fresh
independent review of this artifact is the coordinator's next admission. It
shares the existing substantive two-round cap; a clean result ends the chain.
These Node tests render no application component and prove no browser behavior.
