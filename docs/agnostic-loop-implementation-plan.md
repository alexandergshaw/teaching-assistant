# Agnostic loop implementation plan

Status: architecture proposal for independent acceptance before implementation.
Source: `docs/LLM_AGNOSTIC_DEV_LOOP.md`; existing repository instructions remain active.

## Delivery and applicability

Deliver a standalone local Node CLI, not an application tab or replacement orchestrator.
Its leverage is durable, mechanically enforced handoffs across model contexts:
a chat cannot atomically arbitrate concurrent assignments or bind gates to actual files.
Diagnostics are CLI status, rejection reasons, and durable event/evidence records.
Architecture, criteria, test design, data, security, reliability and operations apply.
UX is CLI error/action clarity; accessibility is plain machine-readable text;
visual design and live-service research are omitted because there is no rendered surface.

Local delivery does not authorize deployment, external messages or cloud spending.
Manual/file workers enable any provider today; direct SDK adapters are later additions.
Do not claim complete automated conformance for semantic judgments listed below.

## Architecture and implementation waves

Wave A owns pure modules `src/tools/agnostic-loop/types.ts`, `validation.ts`,
`engine.ts`, `scheduler.ts`, and their same-name `.test.ts` files.
Wave B owns `store.ts`, `candidate.ts`, `runner.ts`, `adapter.ts`, `cli.ts`,
and their same-name `.test.ts` files in the same directory.
Wave C integrates `demo.ts`, `conformance.test.ts`, package script `loop`,
`.gitignore` state exclusion, and `docs/AGNOSTIC_LOOP_USAGE.md`.
The coordinator owns root-file edits and queue updates. Waves A/B are parallel
only after the seam below is accepted; B may consume accepted types, never edit A files.
Neither wave changes Next.js modules; its installed-version documentation is inapplicable.
Every runtime module has a caller in its wave or explicit integration wave C.

## Accepted seam to transcribe before parallel implementation

Use JSON-compatible exported types, no classes/enums requiring transpilation.
Identifiers and hashes are nonempty strings; SHA-256 digests are lowercase hex.
Use milliseconds since epoch for times and integer counters; amounts cannot be negative.
Export these minimal contracts from `types.ts` (extensions require coordinator agreement):

```ts
type Worker = { instance: string; context: string; provider: string; model: string;
  settings: Record<string, string>; tools: string[] };
type Candidate = { digest: string; files: Record<string, string>; policyHash: string;
  environmentHash: string; toolHash: string };
type Artifact = { id: string; activity: string; version: number; hash: string;
  path: string; author: Worker; inputs: string[] };
type Residual = { requirement: string; owner: string; instrument: string;
  step: string; closure: string };
type Envelope = { id: string; expectedRevision: number; actor: string;
  type: string; payload: Record<string, unknown> };
type Context = { now: number; candidate: Candidate;
  artifacts: Record<string, Artifact>; evidence: Record<string, Evidence> };
type Evidence = { id: string; assignment: string; worker: Worker; gate: string;
  candidate: Candidate; executable: string; args: string[]; cwd: string;
  started: number; finished: number; exitCode: number | null; outputHash: string;
  outputPath: string; limitations: string[]; kind: 'gate' | 'mutation' };
type Replacement = { start: number; end: number; text: string };
type ApprovedPatch = { originalHash: string; replacements: Replacement[];
  expectedHash: string };
type Operation = { id: string; assignment: string; resource: string;
  status: 'pending' | 'running' | 'terminated' | 'unknown';
  publicationToken: string; pid: number | null; reconciled: boolean };
type VerificationReport = { candidate: Candidate; worker: Worker;
  criteria: Record<string, string[]>; limitations: string[] };
type FinalReport = { candidate: Candidate; verificationArtifact: string;
  regressionEvidence: string[]; wholeChangeReviewArtifact: string;
  residuals: Residual[]; delivery: 'local' };
```

State exports `LoopState` with `schemaVersion: 1`, `revision`, `policy`, `items`,
`activities`, `assignments`, `artifacts`, `evidence`, `decisions`, `operations`,
`verificationReports`, `finalReports`, `events` maps/list. Reports are keyed by
imported artifact ID and their structured contents are bound to its observed bytes.
Nested definitions belong to A, following events below; no arbitrary extension bag.
Policy includes owner, workspace, allowed actions, candidate exclusions, environment
keys, named gate commands, concurrency, run deadline, max assignments and command timeout.
Defaults: concurrency 3, max assignments 100, deadline init-time plus one day,
command timeout 60 seconds, no shipping except local delivery, no paid provider.
These are proposed settings, not measurements. Caller may narrow the grant.

Export `createState(policy: unknown): LoopState`, `validateState(value: unknown): LoopState`,
`validateEvent(value: unknown): Envelope`, `applyEvent(state, event, context): LoopState`,
and `nextAssignments(state, context): { eligible: string[]; blocked: Record<string,string[]> }`.
Functions reject invalid data by throwing `Error` with actionable messages;
pure functions never read files, run commands or mutate their arguments.
`applyEvent` increments revision once and stores the event; repeated event ID with
identical contents returns unchanged state, conflicting contents fail, before CAS check.

## Events and state requirements

`item.create`: stable ID, objective, owner, exact affected paths, dependencies,
criterion IDs, required artifact kinds and gates, specialist triage with reasons.
Reject cycles, duplicate IDs, unsafe paths and scope outside policy.
`activity.create`: stable item/kind/requirement IDs, dependencies and status;
renaming artifacts does not create a new round budget for the same activity.
`assignment.start`: item/activity/role, actual Worker, accepted artifact IDs,
exact write/affected paths, resource names, allowed actions, deadline, deliverables.
Inputs bind exact versions/hashes; baseline candidate and policy are engine stamped.
Reject stale/missing acceptance, shared input dependencies and overlapping affected
paths/resources with running or quarantined assignments, or exhausted run budget.
Read-only checkers still reserve any commands' shared resources.
`artifact.submit`: imported content reference and current assignment, validated by IO;
requires matching author identity, write permission, current inputs and publication token.
No worker-supplied digest becomes trusted without re-reading bytes.
`review.record`: checker assignment, exact artifact hash, verdict, findings with
severity/mechanism/new-or-repeat/disposition need. Checker instance AND context differ
from all activity authors. Only fresh current artifact can be checked.
Clean verdict accepts that hash; defective first check permits one revision;
defective second check requires owner disposition. No third substantive review.
`decision.record`: owner actor only, original checked hash/verdict, exact scope,
disposition, ApprovedPatch, resulting imported artifact, residuals and rationale.
Patch offsets are UTF-8 byte positions in the original immutable blob, sorted,
non-overlapping and within its length; replacement text is encoded UTF-8. IO applies
the owner-approved patch to the original blob and independently computes expectedHash.
Reject supplied expectedHash or resulting bytes that disagree with the computed result.
No replacement may introduce any change beyond this exact authorized patch.
Disposition is bounded acceptance, relocation, owned residual or withdrawal.
`transcription.verify`: fresh checker assignment, decision ID, resulting hash,
pass/fail and semantic fidelity attestation. Mechanical scope is deterministic equality
of observed resulting bytes/hash with the approved patch result, not checker prose.
Pass consumes owner disposition without
incrementing substantive rounds; failure permits only reapplication of same decision.
Semantic fidelity remains independent human/worker judgment, explicitly attested.
`assignment.finish`: verifies required deliverables, unchanged accepted inputs,
identity, ownership diff and no outstanding operations, then releases resources.
`assignment.cancel`: immediately fences publication, retains locks and records reason.
`assignment.quiesce`: trusted operator attests stopped operations; optional quarantine
remains. Unknown operations cannot be asserted safe by cancelled worker.
`assignment.reconcile`: operator records restoration/side-effects resolution before reuse.
`operation.start`: persist pending Operation before spawning; bind assignment publication
token and resource. Spawn is permitted only after a fresh locked CAS check confirms
the assignment remains running/current and token matches. Persist pid/running with
another checked update; cancellation between launch and update immediately terminates
the child or marks unknown. Pending/running operations found after restart become
unknown and quarantine their resources; PID reuse cannot establish termination.
`operation.finish`: trusted runner records observed termination and exit status;
`operation.unknown`: runner/operator records uncertain termination and quarantine.
Neither event releases assignment locks. Quiescence requires all operations terminated
and reconciliation complete; cancelled or unknown workers cannot publish these events.
`evidence.record`: accepts only engine-captured command execution records from Context.
`verification.record`: verifier assignment plus VerificationReport bound to an imported
report artifact; requires one nonempty evidence list per item criterion, no unknown
criteria, all evidence current and passing, and full required gate coverage.
Verifier instance AND context differ from every implementation author; checking the
report also requires a fresh independent checker and exact report artifact acceptance.
`final.record`: FinalReport bound to an imported final artifact; requires accepted
independent verification report, accepted whole-change review, all required regression
gates on the report candidate, complete residuals, and current candidate equality.
`item.advance`: one edge of queued/scoped/criteria-accepted/design-accepted/
ready-to-build/implemented/verified/regression-passed/shipped, with artifact and gate IDs.
Verified requires an accepted VerificationReport with full criterion-evidence mapping;
regression-passed and shipped require a FinalReport at the same exact current candidate.
Generic accepted design artifacts cannot substitute for these report contracts.
All prerequisites checked; verifier differs from implementation authors. Required gate
evidence must exit zero on current candidate; owner decisions never waive execution.
`item.block` and `item.escalate` persist exact needs; independent eligible work remains.
`run.pause`/`run.resume`/`run.cancel` are owner-authorized scheduling controls.

## Persistence, authority and command execution

Store directory defaults `.agnostic-loop/`; immutable content/log blobs and one
`state.json` contain records plus append-only logical event history. Atomic state
replacement gives event+snapshot a single commit point. Acquire exclusive `wx` lock;
write same-directory temp, flush, close, rename; release only the acquired lock.
Never automatically break stale locks. Report recovery action and require an explicit
operator acknowledgement with checked lock ownership. CAS rejects lost updates.
Validate persisted schema and artifact/log hashes on load; corruption fails closed.
State remains local trusted operator data, not a tamper-proof remote authorization service.
Workers cannot grant themselves owner authority through submitted JSON; CLI operator
supplies actor outside worker result packets. Filesystem access is the trust boundary.

Candidate snapshot hashes every regular file beneath workspace except explicit immutable
policy exclusions for state, `.git`, dependencies and build caches. Reject symlinks,
traversal and case-colliding paths; resolve containment before reads/writes.
Include policy, configured external files, full command environment digest and runtime
version/settings. Hash secret-bearing environment values without storing plaintext.
Never assert scoped completeness: all evidence is whole-candidate, and ANY relevant
candidate change invalidates it and fences affected assignments. Exclusions and unavailable
external dependencies are visible limitations, not claims of measured independence.
Assignments authoring code may change owned paths; accepted input artifacts must remain
current, and actual finish diff must stay in ownership. Their build change is not itself
stale-input failure, but invalidates earlier code evidence.

Runner uses allowlisted executable+argument arrays, `shell: false`, bounded output,
explicit environment and cwd, and records start/end candidates. A changed candidate
during a command prevents passing evidence. Register operation before launch and retain
resource ownership through exit using the persisted operations protocol above.
Cancellation kills tracked child; unproven descendants
quarantine workspace, so restoration/reuse is forbidden until operator reconciliation.
No claim of OS-level malicious-worker sandbox or process-tree kill reliability on Windows.
No command adapter in this delivery: file adapter exports versioned assignment packets
and imports results only through engine validation, recording actual identity as attested.
File adapter cannot discover provider identity independently; policy reports that limit.

## CLI and exercised usage

`npm run loop -- init --workspace <path> --state <path> --policy <json>` creates a grant.
`status`, `next`, `apply <event.json>`, `import <assignment> <artifact-id> <path>`,
`packet <assignment> <output-path>`, `result <result.json>`,
`run <assignment> <gate>`, and `demo <isolated-directory>` are actual commands.
CLI refreshes candidates before apply; no bare event fabricates artifacts or evidence.
`import` computes metadata and submits through apply; `run` captures evidence then applies.
Usage document supplies complete JSON fixtures for create item/activity, author/checker
assignments, import, review, all stage advances and final local delivery.
Demo operates only in an empty/new isolated directory, creates a small text transformation
candidate, progresses accepted criteria/design/plan/test design through independent
verification/regression/local delivery, and shows named rejected invariant violations.
No hidden bypass grants demo acceptance; every event uses public validation.

## Test design and coverage boundaries

Before production changes, A writes fail-first behavioral tests from these requirements;
B writes IO tests with temporary directories and real child Node processes.
Conformance tests drive CLI and file adapter, not private shortcuts, and assert:
self-check/self-verification rejected, malformed/unknown events rejected, stale hashes
rejected, unowned edits rejected, CAS/idempotency correct, path/resource race rejected,
whole-candidate config/environment invalidation, missing deliverables/residuals rejected,
round count survives reload, owner disposal consumable without third review,
mandatory gate waiver rejected, deadline/assignment budgets and paused scheduling enforced,
cancelled late-writing operation fenced with retained lock, quarantine/reconciliation,
and independent work selected while another item needs owner decision.
Mutation protocol requires baseline/control/failure/restoration/final evidence; demo
executes isolated mutation and checks restoration hashes. No shared-tree mutations.
Semantic completeness, specialist triggers, scope fidelity, oracle independence, external
side effects, provider identity and model quality remain explicit operator obligations.
Scoped evidence reuse is unsupported and rejected; conservative mode conforms safely.

Wave gates: `npm run test:paths src/tools/agnostic-loop src/file-size-ceiling.structure.test.ts
src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts` plus scoped ESLint.
Coordinator runs `npx tsc --noEmit --incremental false`, CLI demo and backlog consistency.
Run full suite once integrated if feasible; report commands and observed outcomes.
No browser/UI claims are made. Each source file stays under the existing structural ceiling.
