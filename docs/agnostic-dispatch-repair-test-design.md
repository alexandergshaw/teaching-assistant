# Failed-gate repair regression design

Status: source-grounded draft for fresh independent check. This is a new test-design
activity for the unfinished `LLM-AGNOSTIC-AUTO-DISPATCH` backlog row. It does not
reopen the closed implementation review. The owner's 2026-10-13 decision remains:
automatic dispatch stays disabled by default; reliable failed-gate repair is
unfinished. No test has been executed for this brief and no passing result is
claimed. No paid provider, authentication change or activation is required.

## Observed source seam

`next-actions.ts` builds stage-advance keys from item, destination status and kinds.
`supervisor.ts` commits these as `dispatch:${action.key}`. `commitEvent` in
`supervisor-inbox.ts` returns unchanged state when an identical event is already
acknowledged. Meanwhile `engine.ts`'s `artifact.invalidate` resets affected items
to queued, invalidates dependent acceptance and preserves substantive rounds.
Consequently an already accepted scope can cause the same scoped advance to be
proposed again after implementation invalidation, with no state progress.

`supervisor-process.ts` runs verifier/final-report gates before provider spawn.
A known failed gate cancels/reconciles that assignment, invalidates accepted
implementation waves and records a `retryable-execution:` rejection. `drive`
already retries these failures; an unconditional-stop repair is not the task.
The next packet's `evidence` currently includes only its new assignment's evidence,
while `workflow.ts`'s task instructions contain no prior execution diagnostic.
The failed evidence's `outputHash`/`outputPath` reference actual output bytes in
the store. Those bytes, their identity and their bounded redacted representation
must reach the repair handoff; a generic statement that a gate failed is inadequate.

## Exact test ownership

The regression author may create only:

- `src/tools/agnostic-loop/supervisor-repair.test.ts`
- `src/tools/agnostic-loop/supervisor-repair-fixtures.ts`
- `src/tools/agnostic-loop/supervisor-repair-mutation.test.ts`

Runtime sources are read-only during instrument authoring. Reuse ordinary exports
from `supervisor`, `store`, `dispatch-store`, `supervisor-inbox`, `json` and the
non-test `supervisor-fixtures` helper; never import another test file. A later
repair implementation needs its own checked path grant. Likely seams are
`next-actions.ts`, `workflow.ts`, `supervisor.ts`, `supervisor-process.ts` and
`supervisor-inbox.ts`; this brief does not authorize their modification or weaken
engine review rules. Packet typing/validation changes, if needed, belong to that
later plan rather than an invented test-only protocol.

## Instruments and frozen oracles

R1: acknowledged advance after observed invalidation. Use `supervisorFixture`,
real `drive` and real generic child processes to obtain accepted scope, criteria,
plan and a checked implementation wave. Stop with a bounded `maxSteps` before
verification; select state by actual accepted wave and scheduler stage, rather
than silently assuming a fixed number of steps. Through `store.locked` and
`commitEvent`, apply one owner `artifact.invalidate` to that accepted wave. Save
the resulting state, reopen with `new LoopStore(directory)` and drive again.
Assert queued reset really occurred, scope acceptance survived, the prior scoped
advance really exists, and the next bounded drive actually leaves queued state.
Require a later repaired candidate to reach local delivery or an explicit legal
owner-needed disposition, never repeated unchanged advance actions. Compare
revision, item stage, accepted hashes and action keys across the bounded steps.
An idempotent duplicate import remains a no-op; successful re-entry must not make
arbitrary duplicate events effective. This instrument is a direct observed
invalidation fixture, not evidence of a real failed-gate lifecycle.

R2: real verifier gate failure and diagnostic-dependent repair. Build a separate
generic worker and fixed Node gate script before `configureDispatch`; bind their
actual probe/qualification hashes using the existing fixture APIs. The initial
implementation writes a literal valid baseline. Its wave gate succeeds. On the
first verifier assignment the real gate emits the literal sentinel
`REPAIR_EXPECTED: write repaired-output`, exits nonzero, and records normal engine
evidence. Keep deterministic gate control state outside the candidate workspace,
under the isolated temporary fixture root. Do not mutate executable/script bytes
after qualification. This is explicit test instrumentation, not production gate
state or a simulated `Evidence` insertion.

The implementation repair child accepts no secret side-channel, gate counter or
parent instruction identifying the correction. It reads only its actual stdin
packet and requires a prior-failure record with the correct gate, failed assignment,
nonzero exit, candidate digest and output identity, plus the exact bounded sentinel
from verified output bytes. Its source write changes the baseline to the literal
`repaired-output`; post-repair gates independently read the file and demand that
literal. Capture the actual packets and child markers outside the candidate.
Assert a failed verifier gate existed before the repair child launch, the packet
contains that specific earlier failure rather than current-assignment success,
the same implementation activity is reused, a fresh child/context performs repair,
successful current-candidate gate evidence replaces stale evidence, independent
checking occurs, and local delivery eventually records the repaired bytes.
Every repaired wave and every reauthored downstream artifact must publish
deterministic changed content, bound to the repaired candidate digest or an
explicit semantic repair version. Do not reuse the generic fixture's constant
`Accepted ` plus kind content: `engine.ts` rejects checking the same artifact
hash again. Before dispatching each new review, assert its artifact hash differs
from the preceding reviewed hash for that activity, and assert the new content
actually names the repaired candidate or repair version. These assertions apply
to successful R2/R3 variants as well as budget-exhaustion variants; incrementing
metadata alone is insufficient. Keep unchanged accepted upstream artifacts
unchanged, and do not revise the frozen oracle to accommodate duplicate content.
Increase the fixed fixture job budget at configuration time to admit the extra
repair/checking work; do not change the bound mid-run. Current source is expected
to fail R1 and R2 at named invariant assertions, not to pass this design.

R3: real regression gate failure. Repeat R2 with the first final-report gate as
the failure point, after verified state and accepted whole-change review exist.
Assert downstream verification/final acceptance cannot be consumed after candidate
repair. Require new current-candidate verification and mandatory regression
evidence before shipping. Share fixture construction with R2, but independently
assert the failure was on a final-report assignment rather than a verifier.

R4: bounded progress stop explains itself. Reuse R1's real persisted state and
call `drive` with a positive finite `maxSteps`. If no progress can be made, require
a persisted item checkpoint naming the blocked action/stage and its prerequisite
or exhausted limit; `dispatchStatus` after store reopen must expose it. A bare
steps count, empty checkpoint, repeated identical action, or success prose does
not explain the failure. A healthy partial drive intentionally stopped at its
configured step limit may report that limit as such; it must not claim delivery.
Use a separate zero-step read case so a status-only request is not mistaken for
failed execution. The exact checkpoint wording is not the oracle.

R5: repair budgets survive restart. In R2 and R3, snapshot implementation activity
IDs, authors, reviews and rounds before failure and immediately after invalidation.
Assert rounds/reviews do not decrease. Reopen the store after the known gate has
terminated and its assignment has reconciled, before the repair dispatch; resume
with the identical fixed config and source selection. Observe fresh worker/context
identity, the same activity and the same remaining review budget. A fixture whose
activity already has the full substantive review allowance must become
owner-needed, with no additional checker or renamed replacement activity. Prove
that exhausted variant using real authored/checker outcomes with changed repair
artifact bytes, not manual reduction/reset of rounds. Unknown live operations
remain a separate uncertainty checkpoint and must not be relabeled known failure.

## Isolation and mutation controls

For each instrument first demonstrate the known defect as a named invariant
failure on current runtime. That expected-red record is distinct from a final
passing test suite. After the separately authorized runtime repair, execute the
same instrument against isolated copies with baseline, harmless comment change,
targeted production mutant and restored baseline. Record source hashes before and
after; never sabotage the canonical working tree. Follow the existing
`supervisor-mutation.test.ts` approach: copy non-test runtime sources, invoke real
Node child harnesses with the repository TS loader as a file URL, and give each
bounded child a timeout. Syntax errors, module resolution, credential access,
timeout or fixture setup failures do not count as mutation detection.

The re-entry mutant restores the old advance identity/replay behavior and must
fail R1's progress oracle. The diagnostic mutant removes the prior failed-output
handoff and must fail R2/R3's packet oracle before the worker can repair. The
checkpoint mutant drops the persisted blocked explanation and must fail R4 after
store reopen. The budget mutant resets rounds or replaces the activity and must
fail R5's identity/budget oracle. Require all variants to exercise the intended
branch; the harmless and restored runs must succeed. Where a production fix has
redundant guards, mutate the whole relevant seam rather than declaring an
ineffective single-line mutant detected. No assertion is removed or changed
between variants.

## Execution and closure boundaries

Proposed regression command, once authored:

`npm.cmd run test:paths src/tools/agnostic-loop/supervisor-repair.test.ts src/tools/agnostic-loop/supervisor-repair-mutation.test.ts`

Also run nonincremental TypeScript checking and scoped lint after implementation,
then the existing loop suite once the new regression is green. Record every
quantity with its producing command. The tests are local tooling/process tests;
they render no component and establish no browser behavior or live provider
capability. New test files must respect source/file-size/encoding/no-emoji gates.

This seam covers failed-gate re-entry, bounded diagnostics, explanatory stopping,
review budget and restart behavior. Other unresolved conformance obligations in
the verification report remain separate unless a specific obligation is needed
to preserve this repair seam. Passing these fixtures cannot by itself close every
AD-1..AD-12 obligation or enable automatic dispatch. The coordinator must reconcile
the backlog and activation disposition after fresh independent verification.
