# Bounded gate composition

This is an executable follow-on brief, not another feature design chain. The
readiness implementation proceeds independently. Do not change the active policy,
activate the conditional provider extension, or reinterpret failed historical
evidence as success.

## Concrete fault

`workflow.ts` currently gives `item.requiredGates` to both the verification and
final-report author. The feature policy defines identical verification and
regression commands. Each runs the entire expensive loop suite, including
serial real-process mutation controls. `runner.ts` gives each command the fixed
policy timeout. Actual broad and all-source runs exited 124 at 1,200,000ms;
repair alone consumed 935,050/976,060ms and a two-control mutation diagnostic
consumed 959.92s. Evidence is retained in the repair checkout's
`.agnostic-loop/repair-evidence`. Retrying the same aggregate is not a remedy.

The path wrapper in `src/tools/vitest-paths/cli.ts` reads its JSON report only
after synchronous Vitest completion, then removes it. `paths-gate.ts` rejects
missing reports, nonzero exits and paths without passed assertions. Keep those
properties. `runner.ts` retains output only when the operation returns; an outer
interruption can therefore leave no trusted persisted partial diagnostic.

## Small implementation

1. Add optional phase metadata to registered policy gates: verification,
   regression, or legacy-all. Omission preserves existing behavior. In the actual
   caller `workflow.ts:taskFor`, select verification-phase gates for verifier and
   regression-phase gates for finalizer, retaining legacy-all for both. No gate
   gets counted in both phases by reusing another worker's success. Wave gates
   remain exactly the checked plan's gates. Update the actual acceptance consumer
   `engine.ts:gates/verifyReport/verifyFinal` consistently: implemented/verified
   require verification and legacy-all gates; final regression requires its own
   regression and legacy-all gates plus the accepted verifier report's observed
   verification-phase evidence. Audit their union against every required gate.
   This explicitly composed coverage does not invent a finalizer execution of a
   verifier's command. Existing policies retain the original all-gates checks.
   The grant still explicitly names all admitted gates and resources.
2. Introduce a pure full-coverage manifest validator. A reviewed new policy
   records the static complete expected test-file set, disjoint shard membership
   and test-configuration hash. After installing that immutable policy, the
   trusted caller captures and durably records the full candidate in a separate
   controller-owned execution record. The candidate includes the policy hash,
   so it must never be embedded in that same policy. Derive the expected set from
   the separately captured candidate's
   files using the repository's actual `vitest.config.ts` inclusion
   `src/**/*.test.ts`, limited only by explicitly recorded original gate roots.
   Require every expected test exactly once across the composed phases, reject
   omissions, duplicates, nonexistent paths and ambiguous directory arguments.
   Each shard invokes the unchanged path wrapper with explicit test files.
   Reject changed Vitest configuration until the manifest is regenerated and
   independently checked. Never mutate the policy or rebaseline the execution
   candidate between shards. Never infer full coverage from a directory name or
   an author's list alone.
3. Split the serial repair mutation test file mechanically into independently
   runnable control files with shared helper code. Keep each original baseline,
   harmless, mutant, restored and source-hash predicate intact. Merely assigning
   the original long file to one shard still exceeds the cap. The checker must
   compare original and moved test identities/predicates and verify that the
   manifest contains every control. Retain original failed logs. Do not expand
   semantic repair changes or start a third repair revision under this label.
4. Persist bounded, redacted partial runner diagnostics during command execution
   into an operation-specific controller-owned diagnostic location. On timeout,
   retain the latest verified snapshot and unknown-operation reservation. This
   diagnostic is never successful Evidence. The normal completed immutable
   output blob and actual exit/candidate checks remain the sole gate Evidence.
   Redaction must handle secrets split across stream chunks; buffer or mask
   ambiguous suffixes rather than writing raw chunks. Preserve output limits,
   cancellation fencing, descendant uncertainty and resource locks.

All successful shards must have known observed completion, reconciled operations,
exit zero, the exact executable/argv/cwd, the frozen candidate including policy,
environment and tool binding, and verified output blobs. A missing, failing,
unknown, corrupt or stale-candidate shard prevents whole-item delivery. Independent
verification consumes the complete verification shard results; final regression
executes the remaining explicitly composed regression/integration shards. The
checked phase composition must justify where each original instrument runs; the
config change is visible and reviewed, not silent evidence substitution.

## Exact proposed write set and detecting tests

Source: `types.ts`, `validation.ts`, `engine.ts` acceptance consumer, new
`gate-composition.ts`, `workflow.ts`
actual phase-selection caller, `runner.ts`, and new `gate-diagnostics.ts`, all
under `src/tools/agnostic-loop`. Coordinate `workflow.ts` adoption with the
readiness author: no simultaneous edits. Test-source decomposition includes the
existing `supervisor-repair-mutation.test.ts` and explicitly enumerated new
per-control files/helper; no repair runtime source changes. New tests:
`gate-composition.test.ts`, `gate-diagnostics.test.ts`, and a focused actual
phase-selection test in the existing workflow test file or a new named file.

Use a tiny real child which writes a unique marker and exits. Prove distinct
phase selection invokes each composed test once; legacy gates still run in both
roles. Pure manifest tests cover missing, duplicate, unlisted, stale-candidate
and changed-configuration inputs. Gate audit tests corrupt one output blob,
change the candidate between shards, inject nonzero exit or unknown termination,
and require refusal. A child that prints a sentinel then waits past a short
deadline proves persisted partial diagnostics and retained unknown reservation;
chunk-boundary secret output must remain redacted. These focused tests should not
replay the twenty-role happy path per assertion.

Fresh independent check before adoption; at most two substantive rounds. The
original immutable run cannot be edited into the new contract. Only a separately
reviewed explicit new configuration may use it, preserving consumed work,
existing substantive histories, fixed grants and the owner's conditional budget.
