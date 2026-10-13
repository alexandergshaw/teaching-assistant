# LLM-agnostic development loop

Status: proposed reusable specification. This document does not implement an
engine or replace this repository's active development instructions.

The repository's local implementation and automatic-dispatch entry points are
documented in `docs/AGNOSTIC_LOOP_USAGE.md`. Routing and provider qualifications
are versioned configuration rather than host-native agent names. A supervisor
launches fresh subprocess workers and admits their results through the existing
evidence gates; terminal and fixed-grant MCP clients invoke the same controller.
The cooperative-worker implementation makes no hostile-process sandbox claim.

The local reference engine and its operator commands are documented in
[Provider-neutral local development loop](AGNOSTIC_LOOP_USAGE.md).

The loop turns authorized work into checked artifacts and verified changes.
It separates responsibilities, persists decisions outside model context, and
advances work using evidence rather than an agent's declaration of completion.
Any provider can supply workers that satisfy the same contracts.

## Normative language and scope

MUST denotes a required invariant. SHOULD denotes a default whose exception
requires a recorded reason. MAY denotes an optional mechanism.
Policy values below are proposed defaults, not measurements of this repository.

The owner grants a run scope: eligible backlog, permitted actions, spending or
time limits, concurrency limit, and shipping authority. The loop MUST stay
inside that grant. Scheduling work does not authorize deployment, external
messages, destructive operations, or access to credentials.

## Non-negotiable principles

- Every authored artifact MUST receive an independent check before use.
- An author MUST NOT check their own artifact. An implementer MUST NOT provide
  the independent verification of their own implementation.
- Completion MUST be established from actual artifacts and executed evidence.
- Every measured quantity MUST name its command or instrument and input revision.
- Criteria MUST describe observable outcomes, with explicit failure conditions.
- Requirements MUST NOT disappear during revision or handoff.
- Decisions, round counts, residuals, and progress MUST survive context loss.
- Parallelism MUST respect both affected files and informational dependencies.
- Review argument is bounded; executable verification is not waived by that bound.
- The queue MUST advance while authorized, eligible work and run budget remain.

## Roles and worker identity

A role is a contract, not a model name or a permanent agent personality.
An assignment binds a role to a worker instance and a fresh context.
The same model MAY occupy different roles through independent instances.

| Role | Required output | Boundary |
|---|---|---|
| Coordinator | Queue selection, assignments, dependency graph, decisions ledger, shipping record | Routes substantive authoring to other workers |
| Criteria author | Observable criteria, scope, failures, verification requirements | Does not select implementation mechanisms or build test oracles |
| Architect | Contracts, boundaries, reuse, data paths, reachable capability | Does not substitute assertions for measured repository facts |
| Specialist | Scoped data, security, reliability, operations, UX, visual, accessibility, research, or baseline artifact | Reports conflicts with accepted inputs |
| Planner | Ordered build waves, exact ownership, callers, instruments and gates | Does not silently change accepted scope |
| Test designer | Independent oracles, cases, controls, mutation plan | Does not derive expected values from the implementation under test |
| Implementer | Production changes and tests from accepted inputs | Changes only assigned paths; requests scope expansion explicitly |
| Checker | Version-specific verdict, defect classes, disposition needs | Reads and reports; does not edit the artifact being checked |
| Verifier | Criterion-by-criterion evidence against the actual change | Does not verify changes they authored |
| Retrospective author/reviewer | Evidence-based recommendations and independent review | Proposes changes; does not silently modify policy |

Coordinator-authored chunking and rulings also require independent checking.
A checker need not receive a second checker solely to review its verdict;
disputed findings go to the coordinator or owner with evidence. Findings MUST
not be softened or invented to influence round accounting.

Capability profiles replace provider-specific tiers:

- Execution: bounded edits, command execution, mechanical transformations.
- Analysis: investigation, specialist reasoning, synthesis and verification.
- Critical judgment: criteria, architecture, test design, planning and checking.

Profile mappings SHOULD use task evaluations, tool reliability, latency and cost.
Price alone MUST NOT establish competence. Critical contracts and independent
checks SHOULD receive the strongest evaluated reasoning available within budget.
The actual provider, model identifier, settings, worker identity, and tool set
MUST be recorded for each assignment. Substitutions require a recorded reason.

## Durable records

The engine or operator maintains these records outside conversation history:

- Work item: owner, objective, scope, status, dependencies, authorized actions.
- Activity: stable identity, artifact kind, authors, substantive rounds, verdicts.
- Artifact: identifier, location, content hash, version, author and input hashes.
- Assignment/result: contract, worker identity, timestamps and deliverables.
- Evidence: command, working directory, environment, input hashes, exit status,
  output reference, limitations, claim, dependency basis and reuse justification.
- Decision: authority, selected disposition, reason and affected requirements.
- Owner disposition: original checked hash and verdict, decision authority and
  scope, resulting artifact hash, independent transcription verification and residuals.
- Residual: requirement, owner, instrument, receiving step and closure condition.
- Event: durable transition, reason and references to supporting records.

Artifacts MUST exist and be readable before their results are consumed.
An artifact's ordinary acceptance applies only to the exact checked hash.
Owner-disposed acceptance binds the resulting hash through the disposition record
defined below; it is an explicit alternate acceptance path, not a clean check.
Code evidence MUST identify the tested tree, including uncommitted changes when
present; a commit identifier alone is insufficient in a dirty workspace.

Dependencies form a graph of artifacts, requirements and evidence. Changing an
accepted input MUST mark affected descendants stale. Dependency attribution MUST
include consumed code, configuration, policy, generated inputs, environment and
tool versions/settings, including inputs outside the repository tree.
Evidence defaults to the whole tested candidate: a changed tree hash or consumed
input invalidates it. Scoped reuse is permitted only with a recorded, validated
complete dependency basis and proof that the change is independent of the claim.
An incomplete or uncertain graph MUST invalidate against the whole candidate;
unchanged declared inputs alone do not establish completeness or independence.
Running assignments on stale inputs MUST be cancelled or quarantined;
their results cannot advance state until re-evaluated against current inputs.
The coordinator records impact and regenerates only affected briefs and checks.
Invalidation MUST NOT reset a substantive round budget for the same activity.

## State machine and advancement

Default item path:

```text
queued -> scoped -> criteria-accepted -> design-accepted -> ready-to-build
       -> implemented -> verified -> regression-passed -> shipped
```

Each authoring activity has its own substate:

```text
assigned -> artifact-written -> checked -> accepted
                              -> revision-required -> artifact-written
                              -> owner-decision-required -> owner-disposed-accepted
                                                         -> withdrawn
```

| Item transition | Evidence required |
|---|---|
| queued -> scoped | Request compared with actual tree, queued and running work; bounded scope and dependencies |
| scoped -> criteria-accepted | Checked criteria, instruments or explicitly owned verification gaps |
| criteria-accepted -> design-accepted | Checked relevant design artifacts, specialist triage and current baseline |
| design-accepted -> ready-to-build | Checked plan and test design, ownership proof, resource locks, accepted input hashes |
| ready-to-build -> implemented | Actual diff, caller integration, written tests and wave gate results |
| implemented -> verified | Independent evidence for every criterion, relevant as-built specialist review and mutation results |
| verified -> regression-passed | Required regression and whole-change review on the integrated candidate |
| regression-passed -> shipped | Authorized shipping action or declared local delivery, exact revision, backlog reconciliation and residual report |

Artifact prerequisites in these transitions accept either ordinary acceptance or
owner-disposed acceptance at the exact consumed hash. Withdrawal ends the activity
without producing a consumable artifact. Owner disposition does not establish an
execution gate pass or advance implemented work to verified.

An accepted residual MUST explicitly qualify the delivery claim; an unmet
mandatory gate cannot be concealed by declaring the item verified.
Shipping means the delivery target specified in policy, not necessarily release
to users. Runtime activation MAY remain a separate owner-controlled item.

Side states include blocked, cancelled, stale and budget-exhausted. Each requires
a reason and resumable checkpoint. A failed execution gate returns affected work
to implementation or diagnosis; it never advances the item.
Transitions MUST be validated by the coordinator or deterministic engine, not
inferred from persuasive prose. Event writes SHOULD be atomic and idempotent.

## Workflow and handoffs

### 1. Intake and criteria

Read the durable queue and inspect the real code before asserting absence or reuse.
Find already-built but unreachable behavior before designing a second capability.
Chunk work into bounded deliveries; prioritize unblockers and shared evidence.
Searches establishing absence SHOULD include known-present and known-absent
controls so a broken search cannot masquerade as a clean result.

Criteria identify the object, observable outcome, instrument and failure direction.
They distinguish automated, manual, mocked and unavailable evidence. A repository
MAY require a feature advantage claim: what the app provides beyond a generic
LLM chat, and an instrument that fails when that advantage is removed.
Observability and diagnostics obligations belong in criteria where applicable.

### 2. Design in dependency waves

Default order is structure/state, then constraints, then experience:

1. Architecture, reuse, data/storage, baseline and external-facts research.
2. Security, reliability, operational and administrative constraints.
3. UX, visual design and accessibility.

The actual dependency graph overrides category names. List facts each role needs
and who establishes them. Merge mutually dependent concerns or extract a shared
contract into an earlier activity. Check artifacts before downstream use.
Regenerate each later brief from accepted earlier artifacts and new decisions;
mark findings binding or informative. Workers MUST report conflicting inputs
rather than silently reconcile them. Record why each specialist ran or was omitted.

### 3. Plan and design tests before governed implementation

The planner and test designer consume checked criteria and design. Planning MAY
iterate with test design within the same bounded review rules. Both artifacts
MUST be accepted before the build they govern begins.

This is an explicit generic choice: the source workflow contains both
build-from-failing-tests guidance and post-build test-seat ordering. This proposal
places initial oracle and instrument design before build; post-build work checks
and strengthens instruments against actual behavior without inventing new scope.

The plan names files, affected callers/tests, dependencies, rollback concerns,
gates and ownership. Each build wave MUST integrate callers for new runtime
exports. Type-only modules are a documented exception. Overlapping sequential
waves are valid; correctness takes precedence over artificial disjointness.

Test expectations MUST come from independent requirements or reference facts,
not the implementation's own constants or copied control flow. Every important
assertion names a defect it should detect. Red tests SHOULD be proven satisfiable
using an isolated reference implementation where feasible. Otherwise record how
satisfiability was established and any limitation. Drive production entry paths
rather than bypassing structural gates for test convenience.

### 4. Build and gate actual changes

Implementers receive current criteria, design, plan, test notes and decisions.
Tests written before production changes SHOULD demonstrate the expected failure.
Inspect actual changed paths against ownership; verify the intended workspace.
Unexpected edits, stale inputs or missing callers prevent wave acceptance.
Worker reports supplement the diff and command evidence; they cannot replace them.

### 5. Independently verify and challenge instruments

The verifier reads the actual diff, executes gates, and maps every criterion to
evidence or an explicitly authorized residual. Revisit omitted specialist triggers
against the build. Relevant specialists review the as-built behavior.
A green mocked suite MUST NOT be represented as proof of real browser interaction,
live services or actual model output unless those were exercised.

Run deliberate mutations in isolated workspaces. Record baseline success, intended
defect, expected failing instrument, observed failure, restoration and final success.
Use a harmless control that should survive and a detectable control that should fail.
A mutant that fails for an unrelated reason is invalid evidence. A surviving mutant
requires distinguishing a bad mutation from a coverage gap; report rebuilt mutants.
Shared-tree mutation requires exclusive locks, a verified backup and restoration
checks before sibling measurements resume. Isolation SHOULD be the default.

### 6. Regression and delivery

Run required regression on the integrated candidate, grouped according to repository
policy. A fresh final review checks the whole change and cross-artifact consistency.
Failures get diagnosis, fixes and affected evidence reruns. Any subsequent change
invalidates evidence under the conservative dependency rules before shipping.
Final advancement MUST validate every required claim against the delivered
candidate and current consumed inputs, with either evidence executed on that
candidate or an explicit validated dependency-completeness and independence proof.
Delivery records what changed, the exact revision, verification limits and all
residuals. Reconcile the queue: close discharged items and persist new obligations.
History remains in the event ledger; open queues SHOULD remain concise.

## Review budget and owner decisions

Each substantive authoring activity gets at most two author/check rounds: initial
artifact and check, then revision and check. A clean check ends immediately.
Mechanical reruns, citation repairs and transcription of accepted decisions do not
consume a round. Renaming an artifact or reopening the same question does not reset it.

Checkers return verdict, severities, defect mechanisms, NEW or REPEAT classification,
and whether the remainder needs rulings, design, measurement or nothing. A repeated
mechanism requires changing kind or disposing of the claim, not merely strengthening
the same prose. Restructuring MUST map prior requirements to kept, transferred or
withdrawn, including any enforcers they protect.

After a defective second check, the coordinator MUST ask a terminating owner
question: the unresolved fork, each round's conclusion and why they differ,
recommendation, risk of being wrong, and work continuing independently.
Every answer MUST end that activity through acceptance of bounded scope, relocation
to a named measurement step, an owned residual, or explicit withdrawal.
The answer does not authorize another substantive round. Transcription applies only
the accepted decision. To produce a consumable artifact, an owner disposition MUST
bind the original checked hash and verdict, the owner's authority and exact decision
scope, the resulting hash, and all residuals with their owners and instruments.
An independent worker verifies only that the resulting artifact faithfully applies
that decision and preserves everything outside its scope. This mechanical check
does not reopen substantive review or reset its budget. A mismatch prevents
acceptance; correction may transcribe the existing decision, but ambiguity or a
required new decision returns to the owner rather than a third substantive review.
Once this check passes, the resulting hash is owner-disposed-accepted and may satisfy
downstream artifact prerequisites, with its disposition and residuals attached.
A withdrawal instead produces no accepted artifact. A later genuinely different
activity has its own budget. Owner decisions cannot waive platform permissions,
bypass mandatory execution gates, or silently remove safety gates. Disposition
acceptance records a decision; required tests, verification and regression still run.

Execution of tests, verification, mutation and regression has no two-round cap.
Repeated identical execution failures MUST trigger root-cause diagnosis, not blind
retries. Execution still obeys the authorized run budget; exhausted budget leaves a
checkpoint, not an invented pass. A diagnosis document itself follows author/check
rules. Residuals MUST have owner, instrument and receiving step at disposal time.

## Scheduling, safe defaults and stopping

Compute affected sets from code: edited paths, callers, assertions, fixtures and
directory-wide scans. Mechanically intersect exact normalized paths before each
concurrent wave. Also test informational independence and shared resources such as
build caches, ports, databases, queue documents and repository-wide commands.
Coupled work MUST be sequenced, merged or preceded by an accepted shared contract.
Concurrency SHOULD initially be capped at three work items; policy sets the value.

During an authorized queue run, completing a chunk MUST trigger the next eligible
assignment while reporting progress. An unrelated foreground request does not
cancel that grant. Cancellation MUST immediately revoke the worker's publication
authority; late results and writes cannot be promoted as accepted artifacts.
Track and cancel outstanding commands and tool operations, and retain their locks
until termination and workspace quiescence are established. Inspect the actual diff
for incomplete edits or mutations and restore only after quiescence; rejecting a
result or marking a worker cancelled does not prove its operations have stopped.
If quiescence cannot be established, quarantine the workspace and retain its locks.
A successor MUST use an isolated workspace and cannot share the uncertain resource.
Reconcile unknown side effects before retrying any affected operation, especially
external actions; an isolated checkout does not resolve uncertain external effects.
Then restart safely or choose other eligible work.
Explicit owner cancellation or pause MUST be honored without replacement dispatch.

A safe reversible default MUST be acted on and recorded as the coordinator's reading,
not an owner ruling. Questions travel alongside work, with bounded rework stated.
Credentials or activation dependencies SHOULD gate runtime rather than prevent a
safe disabled build. An item is truly owner-blocked only when no authorized safe
default or disabled build can proceed, or required infrastructure is unavailable.

Open recommendations MUST become durable queue items with owner, paths, filing event
and restatement tally. Proposed anti-displacement default: within two delivery
commits of filing, a commit MUST touch the recommended item’s owned paths. Planning
or filing alone does not count. For non-code work, policy MUST define an equivalent
artifact-progress deadline. A breached deadline takes priority at the next safe dispatch.

Escalate blocked items once with exact action needed, cost of delay and available
recommendation. Continue independent work. Re-escalate only on meaningful change.
Stop when the grant ends, the owner cancels/pauses, budget expires, or every remaining
item is blocked and already escalated. State which condition applies and preserve
running-work disposition and checkpoints. Continuous work is not infinite consent.

## Assignment and result protocol

These abbreviated YAML examples describe records, not implemented commands.
Hashes and identifiers are illustrative placeholders.

```yaml
assignment:
  id: task-17-build-1
  item: task-17
  activity: task-17-implementation
  role: implementer
  capability: execution
  objective: Reject an expired session through the production request path.
  inputs: [{artifact: criteria-17, version: 1, hash: "<digest>"}]
  decisions: [{id: decision-8, authority: coordinator-assumption}]
  criteria: [AC-17-1]
  workspace: "<isolated-workspace>"
  write_paths: [src/session.ts, src/session.test.ts]
  dependencies: [task-17-test-design-accepted]
  locks: [session-fixture]
  allowed_actions: [read-files, edit-owned-files, run-listed-gates]
  gates: ["<repository test command>"]
  deliverables: [diff, gate-evidence]
  budget: {deadline: "<timestamp>", max_cost: "<authorized-value>"}
result:
  assignment: task-17-build-1
  worker: {instance: worker-31, provider: "<provider>", model: "<actual-id>"}
  status: complete
  artifacts: [{id: diff-17, location: "<path>", hash: "<digest>"}]
  evidence:
    - {criterion: AC-17-1, command: "<test command>", tree: "<digest>",
       consumed_inputs: "<code/config/policy/generated/environment/tool digests>",
       dependency_basis: whole-candidate, reuse_justification: none,
       exit_status: 0, output: "<log-path>", limitation: mocked-clock}
  findings: []
  residuals: []
```

The coordinator validates schema, identity, ownership, hashes, permissions and
evidence before advancement. A complete result is not independent verification.
Checker results additionally require checked artifact hash, verdict, round and
classified findings. Partial, blocked, cancelled and failed results preserve work.

## Engine, adapters and repository policy

The generic engine owns state, records, dependency invalidation, role separation,
review budgets, locks, permissions, cancellation and transition validation.
Provider adapters own request formatting, tool translation, usage accounting and
transport errors. They MUST preserve role contracts and report truncation, tool
failures and missing capabilities; retries cannot silently duplicate side effects.
Provider context limits MUST be handled through versioned handoffs, not lost rules.

Repository policy supplies installed-version guidance, commands, specialist triggers,
structural limits, baseline/regression grouping, environment gaps, terminology,
delivery targets and any feature advantage requirements. Policy MUST be versioned
and referenced in assignments. It MUST NOT weaken universal independence or evidence
invariants under the guise of choosing a model. Existing repository instructions
continue to govern this checkout until adoption is explicitly authorized.

## Retrospectives and adoption

On owner request or an authorized cadence, a retrospective author reviews a defined
event/commit range. Recommendations cite defects, repeated work, cost and quality
effects, with instruments for testing the claimed improvement. An independent
reviewer rejects unsupported savings or weakened safeguards. Accepted recommendations
enter the queue and traverse the same loop; policy updates receive checked versions.

Adopt incrementally:

1. Use role contracts, saved handoffs, independent checks and a durable ledger manually.
2. Add a CLI for record validation, hashes, transitions, locks and budget enforcement.
3. Add one worker adapter and exercise a small real change plus deliberate failures.
4. Add providers only after contract conformance; enable bounded queue runs last.

An engine claiming conformance MUST demonstrate rejection of self-checks, stale
artifact evidence, missing deliverables, unauthorized paths and dependency races.
It MUST demonstrate whole-candidate invalidation when dependency attribution is
incomplete, scoped reuse only with validated completeness and independence proof,
and rejection of evidence after an undeclared configuration or environment change.
It MUST demonstrate two-round escalation without budget reset, consumable
owner-disposed acceptance binding both hashes without a third substantive round,
rejection of out-of-scope transcription and mandatory-gate bypass, mutation
isolation/restoration, missing residual rejection, budget exhaustion and restart
from checkpoints. Cancellation conformance MUST include an outstanding late-writing
command: publication is fenced, locks retained until quiescence, an uncertain
workspace quarantined, a successor isolated and unknown side effects reconciled
before retry. Restoration before quiescence MUST be rejected.
It MUST also demonstrate that independent queue work continues during a blocked
decision and that safe defaults advance without fabricated runtime verification.
Adapter substitution MUST preserve these outcomes. Quality, cost and throughput
claims require named instruments and recorded runs, not model reputation.
