# Provider-neutral development loop acceptance criteria

## Leverage claim and scope

This local CLI earns CORPUS and GUARANTEED leverage: an operator can resume a
development activity in another process while deterministic rules reject stale
evidence, self-review, and unauthorized advancement regardless of worker prose.
Today a chat operator must manually reconstruct handoffs and remember these rules.
The removal test disables transition enforcement in an isolated mutation: an
otherwise rejected self-check or stale-evidence promotion must then succeed, and
the corresponding conformance test must fail. Persistence alone is insufficient.

The delivery is a usable local engine, operator CLI, provider-neutral file/manual
adapter, example policy and deterministic demonstration. Website integration,
network model calls, live credentials and hostile-process sandboxing are outside
this delivery. The architect owns mechanism choices and implementation boundaries.

## Acceptance criteria

1. **Durable operator entry point.** Documented commands initialize a run, inspect
   it, add work, issue role assignments, export handoffs, import results, perform
   checks and record delivery. A new process reconstructs accepted state, pending
   assignments, review counts, decisions, locks and evidence from durable records.
   A restart test interrupts a pending activity and resumes without losing it or
   duplicating an acknowledged event.

2. **Atomic, concurrent-safe mutations.** Two independent CLI processes attempting
   conflicting writes against the same observed revision cannot both commit.
   Duplicate request identifiers have an explicit idempotent outcome; conflicting
   reuse is rejected. Malformed, truncated or inconsistent persistent records
   fail closed without advancing state. Tests exercise process concurrency and
   interruption/recovery rather than only sequential in-memory calls.

3. **Explicit item transitions.** The CLI enforces the specification's queued to
   shipped progression and its artifact acceptance prerequisites. Skipping a
   prerequisite, claiming success without required deliverables, or supplying an
   obsolete artifact fails with a named reason and leaves state unchanged.
   Delivery can mean declared local delivery; it cannot imply production release.

4. **Independent role identities.** Assignment and result records bind role,
   worker instance, context identity and actual provider/model. The author cannot
   check its artifact; an implementer cannot independently verify its changes.
   Reusing the originating worker or context for that check is rejected. Distinct
   instances of the same provider/model remain usable. Missing identities and
   attempts to substitute identities between assignment and result are rejected.

5. **Versioned handoffs.** Exported packets contain the objective, current accepted
   inputs and hashes, decision authority, allowed paths/actions, dependencies,
   resources, required deliverables and budget. A consumer cannot advance using
   a packet whose inputs or policy have become stale. The demonstration exports
   packets and imports results through the production CLI path.

6. **Bounded substantive review.** The first defective check allows one revision;
   a second defective check requires an owner disposition. Findings include
   severity, defect mechanism and new/repeat classification. A third substantive
   check, activity rename, stale-input invalidation or restart cannot reset that
   budget. Mechanical transcription and execution-gate reruns are distinguishable
   from substantive review and do not consume its rounds.

7. **Consumable owner disposition.** Owner disposition binds the checked artifact
   hash/verdict, authorized decision scope, resulting hash and residuals. A
   distinct mechanical verifier can accept faithful application without a third
   substantive review. An outside-scope alteration, ambiguous decision or missing
   residual owner/instrument/receiving step prevents acceptance. Withdrawal
   produces no consumable artifact. Disposition cannot bypass mandatory gates.

8. **Actual bytes and candidate identity.** Artifact/evidence promotion compares
   real file bytes with recorded hashes; forged hashes or files changed after
   import are rejected. Candidate identity includes dirty/uncommitted files,
   not merely a commit identifier. Tests modify actual temporary workspace files
   between evidence generation and attempted advancement and observe rejection.

9. **Conservative invalidation.** Evidence binds the tested candidate and consumed
   policy, configuration, generated inputs, environment and tool settings.
   Changing an undeclared workspace configuration or relevant environment input
   invalidates whole-candidate evidence when completeness is unproven. Scoped
   reuse is allowed only through an explicit validated completeness/independence
   basis; otherwise it is rejected or conservatively invalidated. A worker's
   unsupported assertion of independence cannot authorize reuse. Secrets need
   not appear as plaintext in stored evidence.

10. **Ownership and dependency conflicts.** Assignment admission checks normalized
    affected paths, including callers/tests, resource locks, accepted dependencies
    and informational independence. Overlapping paths, traversal, absolute paths
    outside permitted roots, aliases escaping roots, shared resources and unsettled
    upstream dependencies reject unsafe concurrent assignments. Disjoint,
    independent work can proceed while another item needs an owner decision.
    Imported results cannot add permissions or silently broaden their write set.

11. **Pause, cancellation and uncertainty.** Explicit pause prevents new dispatch;
    cancellation immediately fences publication by that assignment. Its late
    result cannot advance state. Locks remain held until outstanding registered
    operations are quiescent; restoration before that is rejected. Unknown
    operations/side effects quarantine affected resources. A successor may use an
    isolated workspace only when it does not share the uncertain resource;
    external uncertainty must be reconciled before retry. A controlled late-write
    fixture demonstrates fencing and lock retention without claiming hostile
    shell processes can be sandboxed or forcibly made safe by this engine.

12. **Bounded scheduling.** Authorized budgets, pause/cancel state, dependencies,
    stale inputs and locks determine eligibility. Exhaustion records a resumable
    checkpoint and forbids additional dispatch or invented success. A deterministic
    next-work command selects eligible work, explains ineligible items and does not
    repeatedly escalate an unchanged owner block. Tests show independent work
    remains eligible, safe defaults are labeled coordinator assumptions, and an
    explicit owner pause is honored rather than treated as a request to replace work.

13. **Provider-neutral usable adapter.** The manual/file adapter exports a complete
    handoff and validates imported structured results. Actual model/provider and
    usage-or-unavailable status remain recorded, without a vendor SDK or live key.
    Substituting provider labels does not change invariant outcomes. Remote text
    is untrusted data: it cannot create owner authority, permissions, gate commands
    or dependency proofs. The trusted local operator/adapter boundary is explicit;
    authenticity and mechanical decision verification are not inferred from prose.

14. **Fail-closed runtime validation and gates.** Every externally supplied record,
    CLI argument and persisted record is validated at runtime; a TypeScript cast
    is not validation. Unsupported fields/variants, invalid numbers and missing
    identities fail without mutation. Executable gates come from trusted policy
    with bounded commands, actions, workspace and environment exposure. Worker
    text cannot execute arbitrary commands. Gate results record exit status,
    candidate identity and limitations, without secret stdout/stderr in CLI output
    or durable evidence. Failure or missing evidence cannot advance verification.

15. **End-to-end proof and diagnostics.** One documented offline demo traverses
    accepted criteria/design/plan, implementation, independent verification,
    regression and local delivery through actual engine commands. It also shows
    two-round disposition and a rejected unsafe promotion; its output identifies
    status, pending role, stale inputs, failed gates, locks and remaining budget.
    Diagnostics are CLI-visible; no website diagnostic integration is required.

16. **Meaningful conformance and limits.** Automated tests cover the failures above
    with independent expectations, a passing baseline, a deliberate detectable
    mutation, restoration and final success. They run without runtime keys.
    Verification records exact executed commands and their results, including the
    repository file-size gate and relevant structural scans. Mocked tests and the
    CLI demonstration establish local protocol behavior, not rendered component
    behavior, live model quality or production credentials. Delivery documentation
    names remaining limits, trusted boundaries and unsupported adapter capabilities.
