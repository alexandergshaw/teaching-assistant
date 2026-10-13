# Automatic agnostic-loop dispatch acceptance and test design

## Leverage claim and delivery

This extension earns INTEGRATION and CORPUS leverage by turning an authorized
durable queue into actual worker launches and checked handoffs without a person
relaying each role's prompt and result. Today the operator selects a role,
exports a packet, starts a worker and imports its response. The new mechanism
continues in a local supervisor independently of an open chat, and another
process can inspect or resume it. Persistence inherited from the existing loop
alone does not establish this claim: removing automatic launch must prevent the
end-to-end fixture from completing without manual dispatch.

Delivery covers the local supervisor, automatic role/model routing, subprocess
adapters, CLI and a local MCP bridge over the same controller behavior. Native
host spawn integration is optional. Codex, Claude Code and Gemini CLI wrappers
are version-tested integrations; a generic protocol-command adapter supports
other workers. An uninstalled, unauthenticated or untested provider is reported
as unavailable or unverified, never implied to work by a fake-worker test.

The v1 trust boundary is cooperative workers: path checks and tool declarations
are accident controls, not an OS sandbox. There is one canonical writer; readers
do not overlap candidate writes. Concurrent independent read-only assignments
are allowed. Roles requiring enforceable confinement or complete descendant
tracking are ineligible when an adapter cannot provide it. Sequential dispatch
throughout v1 is sufficient; read-only concurrency is not a delivery requirement.
No app UI change is
required. CLI/MCP diagnostics represent this feature's behavior and failures.

## Acceptance criteria

| ID | Observable outcome and failure condition |
|---|---|
| AD-1 | Starting an authorized queue run automatically progresses a new eligible item through checked scope/criteria/design/plan/test design, implementation, independent verification, regression, whole-change review and declared local delivery. Role-specific artifacts and actual successful gates govern progress. Missing or defective inputs prevent downstream launch; worker completion prose never substitutes for acceptance. No operator issues individual assignments or imports fixture results during the positive run. |
| AD-2 | Each authored artifact reaches a distinct checker instance and fresh context; implementation reaches an independent verifier. Same-model instances are permitted. A fresh worker receives bounded current handoff inputs rather than an author's prior conversation/session. Two defective substantive checks escalate to an owner disposition with durable counts; automatic retries, restart or new assignment IDs cannot buy a third round. Independent eligible work continues during that decision. |
| AD-3 | Only enabled, authorized, available and role-qualified provider/model configurations can launch. Qualification comes from recorded evaluation or explicit versioned policy; discovery alone is insufficient. Required tools/context and remaining budget also filter eligibility. Critical-judgment roles select the highest qualified judgment ranking; execution roles prefer the economical qualified option according to policy. Ties have a documented stable ordering. No eligible candidate produces a named block, never a silent downgrade. |
| AD-4 | Every launch records selection reasons, policy/role versions, pinned settings, requested provider/model and adapter-observed identity or its explicit unavailability. Observable identity mismatch rejects that result for advancement and exposes the mismatch; unknown identity is not presented as authenticated identity. Any permitted operator attestation is explicitly policy-authorized and labeled. Discovery, qualification, live conformance and identity observation remain distinguishable diagnostics. |
| AD-5 | The supervisor launches a real subprocess with the bounded packet and consumes validated structured results. Launch failure, unsupported CLI version/protocol, truncated output, tool failure and missing deliverables produce inspectable failures without fabricated completion. Provider prose cannot create permissions, owner decisions, trusted gate evidence or broader scope. A provider wrapper must pass protocol conformance; live access is evidenced separately. |
| AD-6 | Controller admission serializes authority/resource/budget validation through launch and observed-handle registration. Pause/cancel winning admission prevents launch. Pause after admitted spawn permits that running work to finish but prevents subsequent dispatch. Cancellation after spawn fences publication and requires termination or explicit uncertainty reconciliation. Crash between spawn and registration yields an uncertain operation, retained locks and reservation, and explicit reconciliation before reuse. Restart never blindly relaunches, refunds unknown consumption or double-reserves an acknowledged launch. PID alone is not sufficient recovered process identity. |
| AD-7 | Worker results bind assignment, launch, publication token, accepted input hashes and candidate. The controller accepts a fresh independent result despite unrelated store revisions, constructing its own current-revision event after locked validation. Identical replay is idempotent; conflicting replay, stale candidate/input, cancelled token or mismatched launch is rejected. Results cannot supply an owner-authorized event by substituting actor fields. |
| AD-8 | Actual write drift, including extra creation/deletion and escaped paths, prevents integration and downstream acceptance even if the worker reports its allowed paths. Integrated changes and verification refer to the canonical candidate. Candidate mutation cannot overlap read-only evidence work; late writes after cancellation remain quarantined until quiescence. Cooperative limitations and unresolved external side effects stay visible. |
| AD-9 | Attempts, concurrency and time grants bound admission; exhaustion leaves a durable checkpoint and prevents further launch. Known usage and uncertain/unknown usage remain distinct; unknown dollars never become zero. Hard monetary-limit claims require an adapter-enforced bound admitted against a reservation. Otherwise diagnostics explicitly describe attempt/time limits and unavailable financial enforcement. Failed or uncertain launches follow recorded accounting rather than freeing budget automatically. |
| AD-10 | CLI and MCP expose equivalent run, inspect, pause/cancel, result and recovery semantics using the same authorized controller behavior. Equivalent actions on equivalent fresh state produce equivalent normalized status and durable outcomes. Neither entry point can gain host permissions, credentials, provider access or owner authority merely from worker/client text. A host without terminal/MCP access receives an explicit unsupported connection outcome; a no-tool chat cannot dispatch. |
| AD-11 | Diagnostics explain pending role, selected/rejected models and reasons, current item/activity/candidate, review budget, provider/version/identity status, reservations/usage limits, launch/process uncertainty, stale inputs, failed gates, locks and exact owner action needed. CLI/MCP status after supervisor restart reconstructs these from durable records. Secret sentinels in credentials, environment and subprocess output do not appear in exposed diagnostics or saved logs. |
| AD-12 | Final delivery binds actual integrated candidate, required verification/regression evidence, whole-change review and residuals. Automatic routing never waives existing loop gates or a mandatory check because providers or budget are unavailable. Pausing or ending the authorized run preserves completed and unresolved work without replacement dispatch. Delivery means the policy's local target, not production deployment or external messaging. |

## Independent instruments and expected results

Tests use fixed, independently authored fixture outputs and literal expected role
sequences derived from these criteria. Do not compute expected routing by calling
the router, or generate expected acceptance by replaying the engine under test.
Use temporary actual workspaces, durable controller records, real Node subprocess
workers and synchronization barriers. Do not mock process launch, persistence,
candidate hashing or result admission in end-to-end conformance instruments.

| Instrument | Criteria | Required observation and defect detected |
|---|---|---|
| Public queue-run subprocess | AD-1, AD-2, AD-5, AD-12 | Scripted workers emit predetermined role-specific artifacts/results; the public runner alone dispatches them and ends at local delivery with real executed gate logs. Assert the predetermined role order, accepted hashes, checker/verifier independence and final candidate. No test driver applies intermediate engine events after initial queue/grant setup. A missing test-design artifact or failed regression prevents later launch/delivery. |
| Open-chat removal and restart | AD-1, AD-11 | Start the runner from a terminal process, close/disconnect the initiating client, then inspect from another process while it continues. Separately restart the supervisor at a durable checkpoint and resume. Completion requires no per-role chat relaying. Deleting automatic launch must make the completion assertion fail. |
| Fresh-context and capped-review workers | AD-2 | Workers record received packet/session identifiers in test-only sidecars. Assert distinct contexts and no replay of prior conversation; same-model author/check succeeds with distinct instances. Deliberately defective outputs consume the substantive budget, stop at owner-needed and allow independent read-only work. Restart preserves the exhausted count. |
| Literal routing matrix | AD-3, AD-4 | Independently list eligible, unqualified, disabled, unavailable, insufficient-tool/context and over-budget models. Assert the critical role chooses stronger qualified judgment over cheaper execution; execution chooses the economical qualified option. Unqualified discovered strongest model loses; no qualified critical candidate blocks. Test stable ties, explicit qualification and configured substitutions. |
| Real transport failure fixtures | AD-4, AD-5 | Actual children return valid JSON, malformed/truncated JSON, wrong observed model, missing deliverable, nonzero exit and timed-out output. Assert each exact diagnostic and no inappropriate advancement. Generic conformance must not turn an untested native wrapper into a verified provider. |
| Barrier-controlled launch admission | AD-6, AD-9 | Arrange pause immediately before admission and assert no child-start marker or reservation. Arrange pause after admitted spawn and assert tracked running work may finish while no next worker launches. Separately cancel after spawn and assert fenced publication plus termination/reconciliation. Kill the supervisor after child start but before handle persistence; restart observes unknown state with no second start marker, no extra charge/reservation and no expiry-based unlock. |
| Result inbox and unrelated revision | AD-7 | Run independent read-only assignments sequentially, advancing unrelated store state between each packet and result admission. Each fresh result is admitted without requiring concurrent jobs. Replay identical bytes across restart produces no second event; changed bytes with reused ID, changed input/candidate, wrong launch and revoked token all fail without promotion. |
| Canonical candidate and drift | AD-8, AD-12 | Writer fixture edits an owned file, then separate cases create/delete an unowned file and attempt a path escape. Only owned changes integrate. Changing actual canonical config after a successful gate invalidates evidence. A waiting reader cannot overlap a writer; a delayed cancelled write retains quarantine instead of racing a successor. |
| Exhaustion and telemetry | AD-9 | Fixed-time and bounded-attempt cases stop at the boundary and resume only under an authorized renewed grant. Known metering, unknown metering and enforced monetary reservation are separate cases. Unknown result reports unavailable dollars; uncertain launch retains accounting. No test infers provider billing from process exit. |
| CLI/MCP paired invocation | AD-10, AD-11 | Exercise the public CLI subprocess and actual local MCP request/response boundary against equivalent initialized stores. Normalize generated IDs/timestamps only; compare statuses, rejection reasons, selected roles/models and durable transitions. Test unauthorized recovery and missing host connection through each relevant boundary. |
| Secret and authority attacks | AD-5, AD-10, AD-11 | Inject recognizable secret sentinels and forged owner/gate/permission fields in subprocess outputs. Search real durable files plus CLI/MCP responses for sentinels; assert absence and explicit rejected authority. This demonstrates protocol controls, not protection against a hostile same-user process. |
| Enabled-provider live smoke | AD-4, AD-5 | For each enabled installed/authenticated wrapper, record exact executable/version/settings, actual launch, observed identity availability, bounded request and accepted structured reply. Unsupported/no-auth/no-network cases are unavailable or unverified with an owned activation residual; fixture conformance is not live evidence. |

## Mutation and delivery evidence

Use isolated copies only. Establish a passing instrument, introduce the named
defect, require failure from its behavioral assertion, restore verified bytes and
require the same instrument to pass. A harmless unused fixture-comment change
must survive. Setup, syntax or import failures do not count as detected defects.

Required detectable mutations remove automatic launch (AD-1 leverage), permit a
discovered unqualified critical model (AD-3), move launch outside revocation-safe
admission (AD-6), accept revoked/stale results (AD-7), or release unknown-operation
reservation/locks on restart (AD-6/AD-9). The test designer maps each mutation to
the corresponding production entry-path assertion once that path exists.

The implementer/planner names actual test paths and invocation commands before
execution. The verifier records every executed command, input revision, output
and limit; these criteria claim no passing measurements. Scoped subprocess,
adapter, routing and bridge tests supplement existing loop conformance and
required repository structural/type/lint gates. Fake workers establish local
automation and protocol behavior; they do not establish live provider access,
model quality, billing, hostile-descendant termination or an OS sandbox. No
component is rendered by these tests, and no browser behavior is claimed.
