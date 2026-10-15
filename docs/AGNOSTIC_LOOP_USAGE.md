# Provider-neutral local development loop

The loop provides an operator CLI and an automatic local supervisor. The manual
file adapter and offline demo make no model calls. Automatic dispatch launches
enabled, qualified local provider CLIs inside an explicit grant and can spend
provider credits. It delivers locally; deployment and external messages are not
authorized by starting a development run.

Run commands from the repository root using Node's installed runtime:

PowerShell examples use `npm.cmd` because the installed `npm.ps1` wrapper can
drop forwarded option names. POSIX shells can use `npm` with the same arguments.

## Automatic setup and dispatch

Automatic dispatch is currently default-disabled and has known failed-gate repair
limitations. Successful-path CLI/MCP fixtures and native Codex transport have been
exercised, but after invalidation a repeated stage-advance event can leave an item
queued without progress, and repair packets lack the preceding gate failure's
diagnostics. Keep generated providers disabled for normal backlog draining until
reliable repair is established. The owner resolved this on 2026-10-13: retain the
disabled default and track failed-gate repair as unfinished. The `--enable` setup
below is reference documentation, not authorization to activate this version or
an assertion that the full lifecycle is accepted. See
`docs/agnostic-dispatch-verification.md` for exact passing and failed instruments.

The supervisor selects the next author/checker role from accepted artifacts and
checked plans, chooses a qualified configured model, launches a fresh subprocess,
imports its bounded result and runs the required gates. Status exposes jobs,
decisions, provider eligibility, budgets and uncertainty. Some invalidation/repair
states currently stall without an explanatory checkpoint; reliable automatic
recovery from execution failure remains unaccepted.
You do not export/import packets or create each stage's events by hand on the
successful path.

Choose the absolute installed executable and exact model ID yourself. Version/help
probes do not install software, authenticate a provider or make paid requests.
Windows script launchers require an explicitly configured executable host plus
`prefixArgs`; a `.cmd` file is not automatically wrapped with `cmd /c`.

For this repository, the preset registers the full `src` test suite (including
structural/file-size gates) and nonincremental TypeScript checking. These broad
gates can be expensive and still do not prove criteria requiring a browser or
live service; checked scope must retain those verification gaps. The proposed
command timeout is twenty minutes, not a measured runtime guarantee. Generated setup is disabled until
explicit qualification/enabling. Review the generated path scope, environment
allowlist, settings, context capacity, attempt/time budget and gate commands.
Provider environment allows named platform/auth-location variables such as
`USERPROFILE`, `APPDATA` and `CODEX_HOME` so configured CLIs can locate existing
login state. No API key variable is automatically granted; add any required
credential-key name only through explicit owner configuration before qualification.
The generic template, without `--preset repository`, intentionally has failing
placeholder gates and must be configured for its target repository.

```powershell
$taskWorkspace = (Get-Location).Path
$taskSetup = Join-Path $taskWorkspace '.agnostic-loop/setup'
$taskState = Join-Path $taskWorkspace '.agnostic-loop/state'
$taskExecutable = 'C:/absolute/path/to/installed/codex.exe'
$taskModel = 'EXACT_MODEL_ID_SELECTED_BY_OWNER'
$taskContext = [int](Read-Host 'Confirmed selected-model context capacity in tokens')
npm.cmd run loop -- dispatch template --preset repository --directory $taskSetup --workspace $taskWorkspace --executable $taskExecutable --model $taskModel --kind codex --context-tokens $taskContext --actor operator --grant --allow-unavailable-usage
$taskConfig = Join-Path $taskSetup 'routing.json'
$taskPolicy = Join-Path $taskSetup 'policy.json'
$taskEvidence = Join-Path $taskSetup 'qualification.txt'
Set-Content -LiteralPath $taskEvidence -Value 'Owner explicitly qualifies the selected model for the listed roles; this is operator policy, not a measured evaluation or live smoke.'
$taskExpires = [DateTimeOffset]::UtcNow.AddHours(3).ToUnixTimeMilliseconds()
npm.cmd run loop -- dispatch qualify --config $taskConfig --actor operator --target local-model --profiles execution,analysis,critical --score 1 --expires $taskExpires --evidence $taskEvidence --enable
npm.cmd run loop -- dispatch configure --config $taskConfig --state $taskState --actor operator --policy $taskPolicy --workspace $taskWorkspace
npm.cmd run loop -- doctor --state $taskState --config $taskConfig --actor operator
npm.cmd run loop -- explain --item A25 --state $taskState --config $taskConfig --actor operator
npm.cmd run loop -- drive --item A25 --state $taskState --config $taskConfig --actor operator
```

Replace `A25` with an eligible current `docs/backlog.yml` item. Owner-only and
live-verification rows remain blocked. Its `verify` text is context: workers
cannot turn it into an executable grant. Checked scope selects registered policy
gates. A checked explicit workflow source can instead be fixed at startup with
`--workflow C:/absolute/workflow.json`, containing `schemaVersion: 1`, `id`,
`objective`, `owns`, `verify` and nonempty `requirements`.

The repository preset grants local configuration/delivery only because the
example explicitly supplies `--grant`. Its attempt/time limits still apply when
`--allow-unavailable-usage` permits a provider without usage telemetry; financial
cost stays unknown. No hard dollar limit is implied. Without that flag, unknown
usage keeps reservations and checkpoints. Strong critical judgment and economical
qualified execution require multiple targets with explicit policy/evaluation
qualifications; one qualified target remains usable through distinct contexts.

Configuration is fixed for a configured run. Qualify and enable targets before
configuring; changing provider binary, model, settings or evidence invalidates
qualification rather than silently changing a running grant. Only use a paid
live smoke when separately authorized. Report unavailable/untested providers as
such; successful generic fixture tests establish no live provider access.

```powershell
npm.cmd run loop -- dispatch status --state $taskState --config $taskConfig --actor operator
npm.cmd run loop -- dispatch pause --state $taskState --config $taskConfig --actor operator --reason 'Pause new work'
npm.cmd run loop -- dispatch resume --state $taskState --config $taskConfig --actor operator --reason 'Resume unchanged grant'
npm.cmd run loop -- dispatch cancel --state $taskState --config $taskConfig --actor operator --reason 'Cancel run'
npm.cmd run loop -- dispatch recover --state $taskState --config $taskConfig --actor operator --acknowledgement mark-uncertain
```

Pause permits admitted work to finish and prevents the next launch. Cancellation
fences publication; termination and external side effects still need observation.
Recovery preserves unknown launch reservations and locks. Only after observing
termination and reconciling side effects use the acknowledgement
`operations-stopped-and-side-effects-reconciled` with `--job <observed-job-id>`.
Never remove a lock or retry a launch merely because its PID vanished or its
deadline elapsed. Existing `recover-lock` remains an explicit operator action.

## Fixed-grant MCP connection

An MCP-capable host launches the same Node entry with `mcp`, absolute state/config
paths and a fixed operator identity. Use the absolute Node executable and a file
URL for an absolute Windows loader path; do not run an npm banner on MCP stdout.

```text
node --experimental-strip-types --experimental-default-type=module --experimental-loader file:///C:/absolute/repo/src/tools/backlog/resolve-ts-hook.ts C:/absolute/repo/src/tools/agnostic-loop/cli.ts mcp --state C:/absolute/store --config C:/absolute/routing.json --actor operator --backlog C:/absolute/repo/docs/backlog.yml
```

The stdio bridge follows MCP initialization and newline-delimited JSON-RPC. It
exposes `loop_doctor`, `loop_explain`, `loop_drive`, `loop_status`, pause/resume/
cancel, recovery and inbox import. Tool arguments cannot supply a config path,
executable, credential, state directory or actor. Status/control requests remain
responsive while drive is outstanding. An explicit MCP cancellation notification
for an active drive invokes cancellation under the fixed grant and suppresses its
late reply. A disconnected client alone does not establish termination or revoke
the grant. The cooperative same-user boundary is unchanged by using MCP.

Protocol references: [stdio transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
[lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle),
[tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).
A host with terminal access can invoke the CLI directly. A host with neither
terminal nor an MCP connection cannot dispatch; an open chat is not a supervisor.

## Manual adapter and offline demonstration

Manual mode makes the active host responsible for the entire handoff chain.
Exporting a packet, launching a worker, or seeing its report does not deliver the
requested implementation. The file adapter has no host-agent completion callback
and cannot resume a chat after its turn ends. Do not describe a bootstrap script
that exports a packet and exits as a running supervisor.

For an authorized implementation request, keep the host's implementation turn
active: use its completion-wait tool, inspect the actual owned files, import the
worker's actual output, consume its result with the packet's identity/token,
finish the assignment, and admit the independent next role. Continue the checked
workflow and required gates through local delivery. A status question or other
interrupt changes the foreground; answer it and return to the active chain.
Worker completion is a handoff to the host, never permission to end the chain.
Preserve fresh checker contexts, truthful requested/observed model identity and
the substantive two-round cap. Do not manufacture acceptance from worker prose.

At manual-run admission, retain the exact executable, argument array (including
the loader URL spelling), working directory and names of policy-observed
environment variables in the host's durable handoff record. Keep secret values
out of that record. Reuse that launch recipe after an interrupt: reconstructing
an equivalent loader URL can change the pinned tool hash. A stale tool/environment
error requires diagnosis of the admitted recipe; it is not permission to weaken
the engine's freshness checks or refresh a provider grant.

Before ending the active implementation turn or claiming delivery, assert every
requested item explicitly, separately for each store:

```powershell
node --experimental-strip-types --experimental-default-type=module --experimental-loader ./src/tools/backlog/resolve-ts-hook.ts src/tools/agnostic-loop/manual-handoff.ts C:/absolute/store ITEM_ID
```

The read-only guard verifies the stored snapshot and immutable blobs without a
whole-candidate scan. Exit `2` means delivery is pending and lists retained work;
exit `1` means the assertion is unproven (including missing/invalid state or an
unknown item). Only exit `0` attests that every named item has a recorded `shipped`
status and no retained assignment, uncertain operation or recorded outstanding
need. It does not independently re-verify the candidate or authorize delivery.
Run normal gates and engine transitions first. Include all requested item IDs;
passing for a subset does not complete the request.

This command is an operator preflight, not an automatically installed Stop hook
or a scheduler. The existing backlog dispatch-marker Stop hook cannot prove a
worker result was consumed, and its presence does not establish coverage in a
different host. If the host cannot wait or durably resume, state that limitation
and the exact outstanding handoff; do not promise unattended continuation. A
reminder does not import results, admit an independent checker or repair this gap.

```powershell
npm.cmd run loop -- demo <empty-directory>
npm.cmd run loop -- status --state <empty-directory>/.agnostic-loop
npm.cmd run loop -- next --state <empty-directory>/.agnostic-loop
```

The demonstration creates an isolated `project/` candidate and a sibling
`.agnostic-loop/` store. It refuses a nonempty destination. Generated handoffs
and event/result packets are outside the workspace. Source artifacts are inside
`project/artifacts/`, an explicitly excluded directory; the store separately
preserves their immutable content. Their actual source bytes remain checked on
consumption even though they do not alter the code candidate. Source drift makes
an artifact stale and unusable; the immutable copy remains available for audit.

## Operator and worker boundary

The local operator controls policy, command allowlists and owner decisions.
Worker packets cannot grant additional actions, create trusted execution
evidence or authorize owner dispositions. The filesystem is the trust boundary:
this CLI is not a sandbox against a hostile worker with direct write access.
Provider and model identities are recorded attestations in the file adapter.

Each checker uses a distinct worker instance and context from the artifact's
authors. Each implementation verifier is similarly independent. The engine
binds acceptance to imported immutable bytes, rather than trusting a worker's
reported hash. Whole-candidate evidence includes environment and policy hashes;
any relevant change requires new evidence.

## Artifact and execution flow

The demo leaves complete runnable policy, event, handoff and result fixtures in
its destination. Inspect `policy.json`, `event-*.json`, `*-packet.json` and
`result-*.json` alongside `project/artifacts/`. Every mutation uses a fresh CLI
process. The primary item reaches `shipped` with local delivery; a separate
example rejects self-review and accepts an exact owner patch after two defective
rounds. The demonstration uses independent worker identities for each role.

For a new run, create a policy JSON matching this shape. Replace the workspace,
Node executable and deadline with actual absolute paths and a future Unix time
in milliseconds. Gate arguments are fixed trusted policy, never worker output.

```json
{
  "owner": "operator",
  "workspace": "C:/absolute/project",
  "allowedActions": ["read", "write", "review", "run", "import"],
  "candidateExclusions": ["artifacts"],
  "environmentKeys": [],
  "externalFiles": [],
  "gates": {
    "behavior": {
      "executable": "C:/absolute/node.exe",
      "args": ["-e", "require('node:assert/strict').equal(require('node:fs').readFileSync('output.txt','utf8'),'HELLO\\n')"],
      "resources": ["workspace"]
    }
  },
  "concurrency": 3,
  "deadline": 1792000000000,
  "maxAssignments": 100,
  "commandTimeout": 10000
}
```

```powershell
npm.cmd run loop -- init --workspace C:/absolute/project --state C:/absolute/store --policy policy.json
```

An event envelope carries a unique request ID and the revision observed in
`status`. Preserve identical bytes when retrying an acknowledged request.
Conflicting reuse of an ID or a stale revision is rejected. `--actor` is the
trusted operator identity, not an authority claimed inside a worker packet.

An explicitly authorized manual run may use owner-only `policy.continue` through
the same `apply` CLI or `LoopStore.transact(event)`. Its payload is
`{priorPolicyHash, deadline, maxExtensionMs, authorization, reason,
gateArgumentCorrections: [{gate, index, previous, replacement}]}`. Bind
`priorPolicyHash` to the exact current `status.candidate.policyHash`; use a unique
durable owner authorization reference and the authorized window in milliseconds
(for example, `2700000` for an authorized 45-minute verification window). Set an
absolute future deadline within that window from application time and later than
the prior deadline. Corrections bind exact existing argument positions and bytes.
The store observes manual mode under its lock; caller observations cannot assert
it. Either native dispatch marker rejects the operation, as do any retained
assignment ownership or unterminated/unreconciled operations. The event preserves
all statuses, review rounds, failures, consumed assignments and remaining budgets;
the changed policy hash makes prior candidate evidence stale. It grants no native
provider changes or acceptance. An identical event retry is idempotent; a fresh
event cannot reuse a consumed authorization reference.

```json
{
  "id": "create-transform",
  "expectedRevision": 0,
  "actor": "operator",
  "type": "item.create",
  "payload": {
    "id": "transform",
    "objective": "Uppercase input without altering the original",
    "owner": "operator",
    "affectedPaths": ["input.txt", "output.txt", "artifacts/criteria.txt"],
    "dependencies": [],
    "criteria": ["uppercase"],
    "requiredArtifacts": {},
    "requiredGates": ["behavior"],
    "triage": {"reliability": "Local protocol exercise"}
  }
}
```

```powershell
npm.cmd run loop -- apply create-transform.json --state C:/absolute/store --actor operator
```

The following payloads replace `type` and `payload` in that envelope, with a
new ID and current revision each time. Stage requirements also enforce scope,
criteria, design, plan, test-design and implementation artifact kinds even
when the item supplies no additional requirements.

```json
{
  "type": "activity.create",
  "payload": {"id": "criteria", "item": "transform", "kind": "criteria", "requirements": ["uppercase"], "dependencies": []}
}
```

```json
{
  "type": "assignment.start",
  "payload": {
    "id": "criteria-author", "item": "transform", "activity": "criteria", "role": "criteria",
    "worker": {"instance": "author-1", "context": "context-1", "provider": "manual", "model": "chosen-model", "settings": {}, "tools": ["file"]},
    "inputs": {}, "writePaths": ["artifacts/criteria.txt"], "affectedPaths": ["artifacts/criteria.txt"],
    "resources": [], "allowedActions": ["read", "write", "import"], "deadline": 1792000000000,
    "deliverables": ["criteria"]
  }
}
```

Worker result files use the actual assignment's worker identity and publication
token copied from its exported packet. For example:

```json
{
  "schemaVersion": 1, "id": "finish-author", "expectedRevision": 4,
  "assignment": "criteria-author",
  "worker": {"instance": "author-1", "context": "context-1", "provider": "manual", "model": "chosen-model", "settings": {}, "tools": ["file"]},
  "publicationToken": "actual-token-from-packet",
  "event": {"type": "assignment.finish", "payload": {"assignment": "criteria-author"}},
  "usage": "unavailable"
}
```

After finishing the author, issue a checker assignment with a distinct instance
and context. Its result's event is `review.record`, with payload fields
`assignment`, `artifact`, the observed `hash`, `verdict` (`clean` or `defective`)
and `findings`. A clean review has an empty findings array; defects carry
`severity`, `mechanism`, `classification` (`new` or `repeat`) and `need`.

The remaining demo fixtures show every stage advance, verifier criterion map,
final report and exact owner disposition with their real candidate hashes.
They are generated by public CLI commands rather than privileged demo shortcuts.

```powershell
npm.cmd run loop -- packet <assignment-id> <packet-output.json> --state <store> --actor operator
npm.cmd run loop -- import <assignment-id> <artifact-id> <worker-output-file> --state <store> --actor operator
npm.cmd run loop -- result <worker-result.json> --state <store> --actor operator
npm.cmd run loop -- run <assignment-id> <policy-gate-name> --state <store> --actor operator
```

The packet is a durable handoff. Retain it with the worker's output and actual
identity. A gate name selects a fixed executable and argument array from trusted
policy; worker prose cannot supply a shell command. Output is bounded and
secret values are sanitized before durable storage.

Two defective substantive reviews require an owner disposition. The owner
approves an exact byte patch and complete residual obligations; a fresh worker
checks faithful transcription without adding a third substantive round.
Mandatory executable gates still apply.

Pause and cancellation are explicit operator controls. Cancellation fences
publication immediately but does not prove outstanding commands or their
descendants stopped. Locks stay held through uncertainty, and reconciliation
is required before reuse. Do not restore shared files while an operation can
still write to them.

After a restart, explicitly classify pending/running operations as uncertain:

```powershell
npm.cmd run loop -- recover-operations --state <store> --actor operator
npm.cmd run loop -- reconcile-operation <operation-id> --state <store> --actor operator --acknowledgement operations-stopped-and-side-effects-reconciled
```

The acknowledgement records the operator's observation; it does not kill or
discover processes. Only use it after establishing termination and resolving
external side effects. Then apply `assignment.quiesce` with payload
`{"assignment":"cancelled-id","quarantine":false}` and
`assignment.reconcile` with payload
`{"assignment":"cancelled-id","resolution":"Restoration and side effects checked"}`.
These are separate from operation reconciliation and release the retained work
ownership only after all registered operations are reconciled.

`artifact.invalidate` uses payload
`{"artifact":"artifact-id","reason":"Upstream assumption changed"}`; it
revokes acceptance without resetting the substantive review budget.
`item.unblock` uses payload
`{"item":"item-id","resolution":"Required dependency supplied"}`; it clears
a recorded block without claiming any missing verification passed. Both use
the normal event envelope and trusted owner `--actor`.

If an interrupted process left `lock.json`, read its exact token, establish the
original owner stopped, and use `recover-lock --token <observed-token>
--acknowledgement operations-stopped-and-side-effects-reconciled --state <store>
--actor operator`. Automatic
stale-lock removal is deliberately unsupported.

## Verification limits

The local demo and tests establish durable local protocol behavior with real
subprocesses and files. They do not establish worker semantic judgment, true
provider identity, hostile-process isolation, reliable process-tree termination,
live service behavior or rendered component behavior. No component is rendered
by this repository's tests.
