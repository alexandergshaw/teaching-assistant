# Automatic dispatch implementation contract

Status: architecture for independent acceptance. Existing v1 engine remains the
authority for artifacts, review rounds, ownership, gates and delivery. This adds
a repo-owned supervisor and provider-neutral automatic routing; local file workers
remain usable. No cloud deployment or provider installation is included.

## Entry and fixed grant

`loop dispatch configure TEMPLATE.json` validates a one-time local routing grant.
`loop drive --item A25 --config PATH` reads that exact backlog row through the
repository YAML loader, or a checked explicit workflow input. Its source path and
hash are bound into the scope packet. Backlog prose is context, never executable
policy. Empty owns/no verify means scope and criteria must be authored and checked.

Configuration supplies enabled local adapters, absolute executable paths, exact
model IDs/settings, qualification evidence, budgets, workspace path prefixes,
registered gate names and artifact directory. It includes an owner delegation for
checked item configuration and local delivery. No tool call may supply a new
executable, environment grant, credential value or broader workspace permission.
CLI and MCP use the same supervisor methods and fixed startup paths/grant.

Default exclusions cover `.git`, `node_modules`, build caches, the loop store and
generated artifact directory. Excluded symlinks still fail the existing candidate
scanner. Generated artifact sources remain observed individually despite candidate
exclusion. Artifact directory paths are explicit initial item affected paths.

Model names are configured, not guessed from a remembered catalog. Disabled or
missing providers are reported and skipped. Documentation/probing never installs
software, changes authentication or submits a paid model request. Paid dispatch
occurs only within the explicit startup grant.

## Exact module seam

`dispatch-types.ts` exports the shared records and function types. Implement:

- `routing.ts`: `validateRoutingConfig(unknown): RoutingConfig`,
  `validateJournal(unknown): DispatchJournal`, `routeModel: RouteFunction`.
- `providers.ts`: `probeProvider: ProbeFunction`,
  `buildInvocation: InvocationFunction`, `normalizeResult: NormalizeFunction`.
  These build argument arrays and parse outputs; only probe may launch a bounded
  non-model command. Supervisor owns model-process creation and termination.
- `dispatch-store.ts`: sidecar load/save, config/blob verification and durable
  journal writes. Every mutation uses the existing `LoopStore.locked` lock.
- `next-actions.ts`: `nextActions: NextActionsFunction`, deterministic pure
  work selection from v1 state, sidecar journal, current candidate and fixed grant.
- `supervisor.ts`: `configureDispatch(store, config): Promise<DispatchJournal>`,
  `drive(store, config, selection, {maxSteps}?): Promise<DriveResult>`,
  `dispatchStatus(store, config, selection?): Promise<DispatchStatus>`,
  `controlDispatch(store, config, action, reason): Promise<DispatchStatus>`,
  `recoverDispatch(store, config, {acknowledgement, job?}): Promise<DispatchStatus>`,
  `importInbox(store, config, job): Promise<DispatchStatus>`. `store` is LoopStore;
  config is RoutingConfig; selection is BacklogSelection; action is pause/resume/cancel.
  CLI/MCP adapters validate arguments and call these exact exported functions.

ActionContext contains decoded, validated accepted scope/criteria/plan bodies.
Each map key equals body ID; body hash must equal the current observed artifact's
accepted hash. Supervisor reads and hashes actual bytes before decoding. Missing,
unsupported or stale bodies produce a named checkpoint; the pure scheduler never
reads filesystem bytes or invents plan waves from artifact metadata.

Provider/router and supervisor authors own disjoint files. Runtime schema
validation is mandatory at each ingress and load; casts are not validation.
Reject unsupported variants, unknown fields, unsafe dictionary keys, invalid
counters, duplicate IDs and paths outside the fixed grant.

## Routing and qualifications

Map implementer/transcriber to execution; specialist/verifier/finalizer to analysis;
criteria/architect/planner/checker/test-designer to critical. Role configuration
may narrow these profiles, never weaken an existing accepted critical requirement.
Each target binds provider, exact model and settings. Qualification binds target
hash, adapter version, executable hash, evaluation-suite version, expiry and
evidence bytes; operator attestations are labeled separately from measured evals.

Before ranking, require enabled target/provider, available probe, fresh-session and
structured-result capabilities, needed file capabilities, sufficient context,
current qualification for profile, score threshold and remaining run/cost budget.
Author exclusion and fresh instance/context allocation are enforced independently
of provider/model choice. After qualification thresholds, execution ranks estimated
cost ascending (unavailable last), then qualification score descending, then target
ID. Critical and analysis rank qualification score descending, then estimated cost
ascending (unavailable last), then target ID. These stable rules preserve stronger
judgment selection and economical qualified execution.
Every rejected target carries reasons; no eligible target means a checkpoint,
not a silent weaker model or reset review budget.

Version/help probes prove a local executable works, not model access or quality.
Authentication/model access can remain unknown until actual invocation. Changed
adapter/binary/settings invalidate qualification. Normalization reports requested
identity separately from provider-observed identity. A missing observation stays
unavailable; a reported model mismatch rejects the result. A profile that requires
observed model identity cannot accept unavailable identity.

Budget mode is explicit. Provider-enforced cost ceilings require a supported
native cap; unsupported adapters are ineligible. Estimated budgets reserve the
configured input/output allowance before launch and reconcile observed usage;
they are admission estimates, not billing limits. Unavailable usage is never zero:
keep the reservation and checkpoint unless startup explicitly allows that limit.
No live pricing claim follows configured price estimates.

## Adapter invocation and worker inbox

Codex uses fresh `exec --ephemeral`, exact `--model`, JSON events, output schema,
last-message output, workspace directory and configured sandbox; installed help
must confirm every supported flag. The local inspected binary supports
`--ignore-user-config` without removing login credentials. Claude uses fresh
noninteractive print plus JSON/schema output; Gemini uses fresh noninteractive
prompt plus JSON output and parses response/session/usage separately. Never use
resume/continue or permission-bypass flags as an automatic fallback. Generic command
uses an operator-provided absolute executable and fixed argument vector.

Argument substitutions are whole allowlisted tokens, not shell interpolation.
Credentials come only from named environment keys; values never enter packets,
journals or logs. Spawn has `shell:false`, bounded runtime/output and hidden window.
Windows `.cmd` launchers need an explicitly configured executable host and script
prefix; do not introduce `cmd /c` or guess executable quoting.

Every packet contains exact accepted inputs, candidate, fixed write paths/resources,
deliverables, role instructions, current findings, decisions, limitations and budget.
The worker returns `WorkerOutcome`, not engine event envelopes. It binds job,
assignment, publication token, packet hash, input hashes, candidate and allocated
worker identity. Artifacts are proposed UTF-8 content at declared relative paths;
unknown paths/IDs fail. Checker outcomes include exact reviewed hash and findings.
Verification supplies criterion-to-existing-evidence mapping; workers cannot invent
gate evidence or author engine-owned final/verification report metadata.

Only supervisor synthesizes current-revision events and reads real bytes to import.
It never accepts worker actor/permission/gate/configuration/operation fields.
Prose saying success cannot advance state. Native identity/usage envelopes and
worker content are parsed separately; worker-authored identity is not observation.

## Journal and canonical writer

V1 schema stays unchanged except the bounded `item.configure` event below. Journal
is a versioned sidecar in the excluded store. One supervisor job runs at a time
across this canonical workspace, including read-only jobs, gates and imports.
File-adapter jobs or manual operations already holding resources block admission.
This conservative serialization is intentional; future parallelism needs isolated
workspaces and separate evidence reasoning.

Under `store.locked`, re-read v1 state and journal, check action key still current,
grant hash, candidate, accepted source bytes, qualification, reservations and no
unknown launch. Allocate fresh worker/context. Write a prepared journal before
creating the v1 assignment. Persist pending engine operation and pending journal
before spawning; attach error/exit/output handlers immediately. Spawn and persist
PID/running operation+launch while the admission lock remains held.

Two files cannot share a rename commit point. Crash recovery compares prepared/
pending journal with deterministic assignment/operation event IDs. A partial
admission is fenced and recorded, never automatically launched or replayed.
Acknowledged event IDs reconcile exactly, including identity and original token.
No journal absence or PID lookup proves a child never ran. Prepared/pending/running
launches found at explicit restart recovery become unknown and retain reservations
and locks until owner reconciliation; routine reads do not perform recovery.

After exit, retain bounded redacted output and normalized result hashes. Persist
termination observation. On timeout/cancel/uncertain descendants, fence publication,
retain locks and quarantine; a bounded termination wait prevents supervisor hangs.
The inbox remains bound to its launch; later results cannot acquire a new grant.

Inbox import happens under the same lock after fresh source/candidate validation.
Read source files and validate actual diff against assignment ownership. An author
may change owned candidate files; read-only/checker jobs require unchanged candidate.
Any unowned or external/environment/tool change rejects import and fences the job.
All accepted input artifact hashes must still be current. Output/report files are
written only after validation at declared artifact paths, then independently read
and hashed. Import event IDs derive from job ID and output step. Crash partway
through import resumes only exact acknowledged steps, never regenerates success.

## Bootstrap configuration event

`item.configure` is owner-authorized, allowed only after accepted scope and criteria
artifacts while item is scoped. Payload contains item ID, scope artifact ID and
criteria artifact ID; its values come from their observed versioned JSON bytes,
not arbitrary worker or caller metadata. Supervisor context supplies the fixed
startup grant and observed parsed proposals. Engine checks current acceptance,
artifact ownership/item/kind, exact source hash and grant containment.

Apply checked affected paths, triage, named gates and criterion IDs. Descriptions
remain in the checked criteria artifact.
Retain original requirement IDs so prior scope activities remain valid. Proposals
cannot add executable commands: gate names must already exist in trusted policy
and startup grant. Paths cannot target state, credentials, dependency caches or
other excluded roots except the declared artifact directory. This is the required
minimal engine/validation integration; without it unscoped backlog entries remain
blocked at an explicit configuration prerequisite rather than falsely automatic.

ScopeProposal and CriteriaProposal are schemaVersion 1. PlanProposal is a checked,
versioned plan artifact containing stable wave IDs, requirements, exact writes,
affected paths, dependencies and existing gate names. Its graph must be acyclic
and scope-contained; no worker can broaden the configured item through a plan.

## Deterministic progression

Actions are ordered by item ID then stage/dependency; stable action keys bind item,
activity, artifact version/hash, review round, wave and configuration hash. Existing
unimported completed inbox comes first; outstanding/unknown work blocks dispatch.
Pause/cancel/deadline/count/cost guards apply before every admission, not only entry.

1. Bootstrap backlog/workflow row, reserving generated artifact paths; author and
   independently check scope, advance scoped, author/check criteria, configure,
   then advance criteria-accepted.
2. Author/check design and triggered specialist artifacts in dependency order;
   author/check plan and independent test design; advance ready-to-build only with
   required accepted inputs. The verifier later reassesses omitted specialist triage.
3. Consume checked PlanProposal. Each wave uses stable activity kind
   `implementation-wave:<id>` with an implementer, independent checker and gates.
   Dependencies bind accepted wave artifacts. Distinct wave activities represent
   scoped work, never a renamed rejected activity. An aggregate implementation
   artifact is independently checked; implemented requires it and required gates.
4. Supervisor runs actual policy gates under a fresh verifier assignment before
   dispatching verifier interpretation. It creates VerificationReport from current
   candidate, allocated verifier and complete validated criterion evidence. Import,
   record, finish, independently check, then advance verified.
5. Author/check whole-change review against actual candidate. Run mandatory
   regression gates, then a finalizer supplies residual accounting. Supervisor
   creates FinalReport binding accepted verification/whole-change artifacts and
   current regression evidence. Import/record/finish/check; advance regression-passed
   and locally shipped only under the explicit startup delivery grant.

Every authored artifact gets fresh checking. First defective review produces one
repair task carrying exact findings; second defective review emits owner-needed.
Repair never creates a new activity to reset rounds. Gate failures can trigger
bounded repair jobs and reruns without pretending execution is substantive review;
candidate changes invalidate downstream evidence/acceptance through existing rules.
Unknown operation or missing current prerequisite checkpoints rather than retries.

Owner decisions remain manual exact byte patches through existing commands.
After decision record, supervisor schedules fresh transcription verification,
recomputes patch bytes and preserves round count. Withdrawal yields no consumable
artifact and a checkpoint; no model is routed to decide its own scope disposal.
Manual file workers can finish a pending assignment; the supervisor recognizes
their acknowledged events and never duplicates their job.

## Proof and capabilities not inferred

Offline conformance drives bootstrap through local delivery with a real generic
child adapter. Tests reject wrong packet/input/model/session identities, stale
qualification, unsupported cost caps, forged gates, unowned edits, same-instance
reviews, third review, duplicate launch, partial admission/recovery and late inbox.
Crash points surround every journal/engine write and spawn. Mutation controls
remove admission freshness/identity enforcement in isolated copies and must fail
the corresponding instrument; production bytes remain unchanged.

Live smoke is a separate limited owner-authorized invocation: installed CLI/login
does not prove model access, settings application, usage reporting or output schema.
Cooperative workers can still mutate files, run configured extensions or leak data
through their provider tooling; this is not an OS hostile-worker sandbox. State
directory filesystem access remains a trusted-operator boundary.

References checked for adapter grounding: [OpenAI developer commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli),
[Claude headless](https://code.claude.com/docs/en/headless),
[Gemini headless](https://geminicli.com/docs/cli/headless/).
Gemini reported prompt/candidate counters follow its official
[ModelMetrics telemetry source](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/telemetry/uiTelemetry.ts);
cached/thought/tool counters are not silently priced or counted as candidate output.
Installed help, bounded probes and conformance fixtures govern actual supported
arguments; documentation availability does not certify the local installation.
