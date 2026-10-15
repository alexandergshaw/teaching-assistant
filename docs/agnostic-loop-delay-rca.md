# Continuous loop delay: root cause and bounded correction

The requested continuous controller is still unbuilt. The delay has two distinct
causes: an unnecessarily broad serial preparation barrier, followed by mandatory
test commands whose measured runtime cannot fit their configured deadline.
Independent checking found real defects; removing that checking is not the fix.

## Evidence and responsibility

The native journal at
`.agnostic-loop/continuous-feature-run-20261013/state/dispatch-journal.json`
records preparation beginning at 21:02:11 UTC on 2026-10-13. The first fifteen
launches were scope, criteria, design including revision, plan, security and
reliability author/check activities. The final admitted reliability check began
at 22:18:52 UTC. These times were produced by reading each job's `created` and
`finished` Unix milliseconds with PowerShell `ConvertFrom-Json` and
`DateTimeOffset.FromUnixTimeMilliseconds`. The plan author alone occupied 12.08
minutes by `(finished-created)/60000`. No implementation launch occurred in that
sequence. The owner redirected to implementation at approximately 22:21 UTC.

`src/tools/agnostic-loop/next-actions.ts` makes this behavior structural:
`design-accepted` traverses every checked plan `specialistKinds`, then test design,
before advancing to `ready-to-build`. Only that latter state schedules an
implementation wave. Its outstanding-launch guard and the run's
`policy.json` concurrency of one serialize these activities. The checked plan
could describe dependency waves, but readiness is currently a whole-item barrier.
The orchestrator chose a large feature containing both prerequisite repair and
the controller, and chose the specialist list. Those choices inherited this
barrier rather than delivering a small checked buildable wave promptly. This is
both a scheduler limitation and an orchestration error, not evidence that all
independent checks are wasteful.

The same run `policy.json` registers identical commands for verification and
regression and fixes `commandTimeout` at 1,200,000 milliseconds. The isolated
repair evidence at
`C:/Users/alexa/.codex/worktrees/continuous-repair-build/teaching-assistant/.agnostic-loop/repair-evidence/`
retains the actual logs and command transcriptions. The broad verification
command (`npm.cmd run test:paths src/tools/agnostic-loop` plus the named structural
canaries in `tool-output-transcriptions.json`) and all-source regression
(`npm.cmd run test:paths src`) each exited 124 at that fixed ceiling. Neither is
a passing gate.

Those commands include expensive nested real-process tests. The repair file's
six tests passed in both aggregates, consuming 935,050 and 976,060 milliseconds
according to their Vitest output. The repair mutation file serially repeats
baseline, harmless control, effective mutant and restored baseline for multiple
defects; the corrected two-control diagnostic run alone took 959.92 seconds
(`corrected-mutations.log`). A broad command including both cannot reliably
finish in twenty minutes. Repeating the same aggregate cap does not improve
coverage; it repeatedly loses complete aggregate reporting. Existing failures
remain failures even where a later named diagnostic passes.

The public CLI/MCP diagnostic has a concrete separate failure: Windows `EPERM`
renaming a temporary state file onto `state.json`, recorded in
`entry-failure-diagnostic.log`. `store.ts` uses fsync and atomic rename. The log
does not identify which process held the file, so blaming antivirus, OneDrive or
the sandbox specifically would be speculation. Durability must not be removed to
make a test green. The named supervisor diagnostic subsequently passed in
141.99 seconds; that does not discharge the failed aggregate. No retained timing
instrument isolates fsync, provider probing, blob verification or candidate
scanning, so they are investigation targets rather than quantified root causes.

The root also treated ordinary stage progression as adequate progress and left
the observer reporting preparation while the actual feature stayed unbuilt.
An app heartbeat cannot discharge continuous-controller implementation. The
initial provider window was consumed without controller code; the owner's
bounded extension is conditional on required gates passing and must not be
activated early or used to reset consumed work or review rounds.

## Immediate implementation brief

Implement one bounded scheduler correction, independently check it, then resume
the actual controller build. Do not add another broad planning chain.

1. Add an optional checked per-wave readiness contract to the existing plan
   parser and `next-actions.ts`: a wave declares the exact accepted artifacts
   and specialist/test-design obligations its code consumes. Existing plans
   retain their current strict behavior. A wave becomes buildable only when all
   its declared prerequisites are independently accepted and its dependencies
   are accepted. Unsettled obligations remain mandatory before whole-item
   verification or publication. Reject unknown, omitted mandatory, contradictory
   or unaccepted prerequisite references; readiness is not an owner bypass.
2. Add durable preparation elapsed-time/progress accounting to supervisor
   status and a configured prebuild budget checkpoint. Report first admitted
   job time, current phase, first implementation admission, first observed owned
   source-byte change and elapsed preparation time. Admission alone does not
   prove code was written; exclude generated artifacts and preparation docs from
   the source-change signal. Exceeding a fixed configured preparation allowance must
   checkpoint before another preparation launch, with accepted readiness and
   remaining obligations visible. Restart preserves the clock, job expenditure,
   substantive rounds and unknown-launch reservations. A checkpoint cannot
   manufacture accepted artifacts or renew a grant. A genuinely checked ready
   wave may proceed despite the preparation checkpoint; the checkpoint prevents
   further preparation spend, not independently authorized build work. Preserve
   preparation consumption across invalidation as well as process restart.
3. Correct gate composition through an explicitly reviewed configuration
   activity, not silent substitution: enumerate all originally required tests
   in disjoint bounded shards and retain their exact predicates. Each shard
   creates real evidence bound to the same frozen candidate. Aggregate success
   requires every shard, no missing or duplicate coverage, and still requires
   final independent verification and regression. Distinct verification and
   regression purposes must not silently share evidence. Persist intermediate
   diagnostic output so an exhausted aggregate retains the actual failing
   stack. Do not change the active immutable grant or call old timeouts green.

Meaningful detecting tests must prove: a checked prerequisite wave dispatches
implementation before an unrelated pending specialist; a required unaccepted
artifact prevents that dispatch; remaining obligations prevent delivery; legacy
plans still require their full barrier; a restarted over-budget preparation run
cannot admit another author; an active/unknown job remains reserved; and a
missing, stale-candidate or failed shard prevents aggregate acceptance. Use a
small real child worker for the dispatch proof, keeping independent author and
checker identities. Test scheduler decisions directly for combinatorial cases
rather than replaying the entire twenty-role happy path for each assertion.

The scheduler author must enumerate exact owned source/test paths before writing;
the fresh checker checks this brief and the resulting diff. The work gets at
most two substantive rounds. The continuous controller still needs its own real
worker and local bare-Git publication/restart proofs before activation. The
existing repair implementation is frozen under completed review; it is not a
license for another substantive repair round.

## Cleanup residual

The isolated repair checkout has a `node_modules` junction to canonical
dependencies. This contradicts `docs/loop/traps-orchestration.md`'s explicit
"Never junction `node_modules` into a throwaway worktree" warning. The root
authorized this setup. Preserve both checkout and target now; do not recursively
remove or archive the checkout. Owner: orchestrator. Instrument: inspect the
resolved junction and target, then perform a separately bounded cleanup that
removes only the link with a verified link-only operation and confirms canonical
dependencies remain intact. This cleanup must not compete with active tests.
