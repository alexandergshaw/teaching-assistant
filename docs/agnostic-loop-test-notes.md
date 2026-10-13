# Agnostic loop test design

Sources: `agnostic-loop-acceptance.md`, `agnostic-loop-implementation-plan.md`,
and `LLM_AGNOSTIC_DEV_LOOP.md`. These expected outcomes derive from those contracts,
not engine constants or implementation branches. Architecture is under review;
these notes require outcomes without changing its exported seam.

## Instruments and independent oracles

Pure tests supply explicit JSON-compatible state/events and fixed time. Assert
observable status, accepted hash, review count, lock ownership and rejection;
also assert original state remains unchanged on failure. IO tests use fresh
temporary workspaces, actual bytes and real Node child processes. CLI tests invoke
the production entry point as subprocesses, consume JSON, and inspect persisted
state after restart. Never replace hashing, command execution or store commits
with mocks in conformance tests. Literal expected transitions come from the spec.

| AC | Instrument | Expected case and defect falsified |
|---|---|---|
| 1, 2 | Store + CLI subprocess | Restart with pending assignment preserves identity, rounds and locks; replay acknowledged request commits no second event. |
| 2 | Two processes at one revision | Exactly one conflicting event commits; loser reports conflict, resulting state is valid and contains one winner. |
| 2, 14 | Corrupt disk + CLI | Truncate snapshot, alter event/schema or corrupt referenced blob; load fails with no replacement or advancement. |
| 3 | Pure + demo | Each next edge succeeds with prerequisites; skipped edge, obsolete artifact and missing deliverable fail unchanged. |
| 4 | Pure + result import | Same author instance OR context cannot check; implementer cannot verify; distinct identities using same provider succeed. |
| 5, 8 | Packet/import + disk | Export references actual accepted hashes; edit accepted input bytes after export and reject consumer, even if result repeats old hash. |
| 6 | Pure + persisted restart | Two defective reviews require owner disposition; rename/recreate same requirement, invalidation and reload permit no third check. |
| 7 | Pure + real imports | Bound owner decision plus distinct transcription verifier yields consumable resulting hash, preserving round count. |
| 7 | Negative owner attacks | Non-owner, wrong checked hash, missing residual fields, scope mismatch, ambiguous authority and mandatory-gate waiver fail. Withdrawal yields no consumable artifact. |
| 7 | Exact patch bytes | Applying recorded owner patch establishes expected bytes; imported differing hash or outside-scope edit fails despite verifier pass prose. |
| 8, 9 | Candidate + actual gate | Dirty source, undeclared config, policy, generated input or relevant environment change makes prior evidence unusable; unchanged commit is insufficient. |
| 9 | Pure + IO | Unsupported scoped-reuse assertion fails; no worker statement can establish dependency completeness. |
| 10 | Admission + import | Case-equivalent paths, traversal, escaped absolute path, symlink alias, common resource and unsettled dependency reject collision; disjoint independent work succeeds. |
| 10 | Actual finish diff | Owned edit succeeds; extra file creation/change/delete fails even when worker write-set claims ownership. |
| 11 | Controlled child + CLI | Cancel before delayed write: publication immediately fails and locks persist through late operation; restoration and conflicting successor fail. |
| 11 | Quarantine/reconcile | Unknown operation keeps resource quarantined; cancelled worker cannot self-quiesce; isolated work cannot share uncertain external resource. |
| 11 | Operation lifecycle restart | Persist start before launch; restart after start without finish marks uncertainty, retains locks and rejects reuse; unknown operation requires reconciliation. |
| 12 | Fixed-time scheduler | Deadline, count exhaustion, pause and cancel block new assignment; checkpoint remains; resume cannot manufacture success. |
| 12 | Scheduler + restart | Independent item selected while another needs owner; unchanged escalation not repeated; safe reading recorded as assumption. |
| 13, 14 | File adapter subprocess | Provider label substitution preserves outcomes; spoofed identity, unknown fields/variant, missing identity and invalid counters fail without mutation. |
| 14 | Actual bounded runner | Unknown gate/arbitrary executable rejected; trusted gate records exit/candidate; nonzero, timeout, missing evidence or invented evidence ID cannot verify. |
| 14 | Before/after candidate | Gate edits workspace during execution: reject usable pass even with exit zero; output hash and limitation remain inspectable. |
| 14 | Result authority attacks | Worker JSON cannot create owner decision, permissions, trusted evidence, command or completeness proof; asserted success does not promote. |
| 15, 16 | Full CLI demo | Accepted criteria/design/plan/test design, build, independent verification, regression and local delivery traverse public commands with a rejected unsafe promotion. |
| 3, 15 | Coverage-bound report | Missing criterion, wrong candidate, unknown/stale evidence or author-as-verifier report fails; accepted independent report with complete criterion map succeeds. |

## Persistence and command fixtures

Idempotency expectations use actual saved result/event bytes: identical ID/content
returns existing revision; same ID with changed payload fails. A fresh process
replays the result, rather than an in-memory duplicate only. Concurrent mutation
tests synchronize processes before commit and assert revision/event counts on disk.
Interrupted writes leave either old or committed valid state, never partial state.
An orphan lock requires explicit operator recovery; tests must not delete it as
automatic success. Record acknowledged lock ownership and preserve unrelated lock.

Use trusted policy gates invoking Node with fixed argument arrays and no shell.
Fixtures include exit-zero, nonzero, timeout, delayed write and write-then-zero.
Hash real candidate before and after each operation. Secret sentinel environment
and output values must not appear in durable evidence or CLI output; hash metadata
alone is permitted. Test path containment on the host and do not assume POSIX-only
case behavior. Failed commands and imports leave the item at its previous stage.

## Mutation protocol, isolated from the production tree

Copy only necessary runtime/fixture files into a temporary directory. First run
the selected behavioral instrument against the unmodified copy and require pass.
Harmless control: change an unused fixture comment and require the instrument
still passes. Detectable control: disable self-review rejection in that copy;
the test requiring unchanged rejection must fail because self-review succeeds.
Second invariant mutation: disable current-candidate comparison; change config
bytes after a real gate and require stale-promotion test fails because it advances.
Reject mutation evidence failing from syntax, dependency or setup errors. Restore
copied bytes from verified baseline and rerun to pass; confirm production hashes
are unchanged. A surviving mutant is a coverage gap until explained, not a pass.

## Satisfiability, gates and limits

Full end-to-end public CLI demo is the positive reference for mutually satisfiable
contracts; every rejection fixture differs in a named relevant input. Expected
values are never computed by calling the implementation being asserted. Record
baseline, mutant failure cause, restoration and final exact command outcomes.
Run planned scoped tests, structural file-size/source-byte/no-emoji tests, scoped
ESLint, nonincremental typecheck and the offline CLI demo. The coordinator records
actual commands and results; these notes assert no measurements in advance.

Semantic scope fidelity, specialist adequacy and provider identity remain explicit
independent attestations. Local cancellation tests establish registered-operation
fencing, not an OS sandbox or reliable hostile descendant termination. No component
is rendered by these tests; no browser, live model or production service claim follows.
