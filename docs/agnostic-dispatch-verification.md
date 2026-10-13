# Automatic dispatch verification

Status: initial implementation review closed by owner disposition on 2026-10-13.
Automatic dispatch stays disabled by default; failed-gate repair is unfinished.
Partial verification and the defects below remain recorded. This is not acceptance
of the complete lifecycle or authorization for an experimental release.

## Independence and tested boundaries

This verifier authored acceptance/test-design notes and the CLI/MCP entry files.
It independently inspects provider routing and supervisor implementation, which
other workers authored. The coordinator independently reviewed the entry files;
entry results below are executed evidence and that separate review, not a claim
that their author independently verified their own implementation.

Acceptance source: `docs/agnostic-dispatch-acceptance.md` AD-1 through AD-12.
Architecture source: independently checked `docs/agnostic-dispatch-contract.md`.
The contract's second check closed the missing accepted-body scheduler input and
execution economy ranking defects. Remaining verification concerns are about
actual implementation and instruments, not a new contract review round.

## Executed evidence available

| Instrument | Observed outcome | Limit |
|---|---|---|
| `npm.cmd run test:paths -- src/tools/agnostic-loop/dispatch-entry.test.ts src/tools/agnostic-loop/dispatch-mcp.test.ts` | Exit zero: two files, ten tests. Public CLI and actual stdio MCP each automatically traversed the complete offline role loop in fresh isolated stores with real subprocess workers and gates, without manual stage events. Startup qualification/configuration, legacy CLI, actual status parity, fixed-grant rejection, lifecycle, responsive controls and cancelled request-ID reuse also passed. | Scripted workers establish local orchestration, not model judgment. These tests authored by the entry implementer are executed evidence; independent entry review belongs to the coordinator. |
| Subsequent `npm.cmd run test:paths -- src/tools/agnostic-loop/dispatch-mcp.test.ts` | Exit zero: one file, seven tests, including a real subprocess credential sentinel containing quote/backslash characters. JSON-encoded tool diagnostics expose the redacted value and valid protocol messages. | This focused rerun adds escaped-secret coverage; it is not a second full automatic-drive run. |
| `npx.cmd eslint src/tools/agnostic-loop/dispatch-cli.ts src/tools/agnostic-loop/dispatch-configure.ts src/tools/agnostic-loop/dispatch-example.ts src/tools/agnostic-loop/mcp.ts src/tools/agnostic-loop/dispatch-entry.test.ts src/tools/agnostic-loop/dispatch-mcp.test.ts src/tools/agnostic-loop/cli.ts` | Exit zero after entry review fixes. | Subsequent test/setup edits need the appropriate final checks. |
| `npm.cmd run test:paths -- src/tools/backlog/backlog-file.structure.test.ts src/tools/vitest-paths/gate-commands.structure.test.ts` | Passed. Frozen row count updated for the filed implementation item; wrapper multi-path rejection and legitimate single-path acceptance both retained. | Row closure must update the frozen literal again when the queue is reconciled. |
| Coordinator's `npm.cmd run test:paths src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts src/tools/vitest-paths/gate-commands.structure.test.ts src/tools/backlog` | Initial run reported 286 passing tests and two failures across 22 files. Both failures were the filed-row count and stale all-null verify premise, repaired by the targeted command above, which passed 32 tests. | This is an initial broad run plus targeted repair, not a claimed broad rerun. Later edits remain subject to final gates. |
| Final coordinator `npm.cmd run test:paths src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts src/tools/vitest-paths/gate-commands.structure.test.ts src/tools/backlog` | Exit zero: 22 files, 288 tests. | Structural and queue consistency evidence; no component rendering or automatic repair proof. |
| Coordinator directory gate `npm.cmd run test:paths src/tools/agnostic-loop` | 17 files, 77 tests: 75 passed and two failed. New pause, lifecycle, real admission, capped-review, supervisor mutation and earlier mutation instruments passed in that run. | Runner's first case hit its default test timeout; its focused rerun passed after an explicit test-only timeout. The public CLI/MCP pair hit an actual Windows state-file rename EPERM, not its outer test timeout; its focused rerun passed without a production change. This original directory run remains failed and is recorded alongside the passing focused results. |
| Focused coordinator `npm.cmd run test:paths src/tools/agnostic-loop/runner.test.ts` | Four tests passed after the subprocess test received an explicit test-only timeout. | Corrects the affected timeout instrument; does not retroactively turn the failed directory run into a pass. |
| Focused `npm.cmd run test:paths -- src/tools/agnostic-loop/dispatch-entry.test.ts` after that directory failure | Exit zero: one file, four tests. Both public CLI/MCP complete automatic delivery again. The affected file was rerun without a production or test-timeout workaround for the Windows rename EPERM. | The earlier failed broad run is retained; this is scoped verification of its affected public-entry case. |
| `npx.cmd vitest run src/tools/agnostic-loop/supervisor-mutation.test.ts -t admission` | One passed, four skipped. Strengthened admission mutation requires an actual terminated structured child reply; baseline, harmless control, restored behavior and unchanged production hashes passed. | Single-file focused execution, not a claim that every mutation ran again. The earlier directory execution passed all five mutation cases. |
| Coordinator's `npm.cmd run test:paths -- src/tools/agnostic-loop/dispatch-entry.test.ts src/tools/agnostic-loop/dispatch-mcp.test.ts src/tools/agnostic-loop/providers.test.ts src/tools/agnostic-loop/routing.test.ts` | Passed before the paired full-drive case was added. | Conformance fixtures do not establish live provider access. |
| Coordinator's `npx.cmd tsc --noEmit --incremental false` | Final reported execution exited zero after runtime integration. | The original directory failures were followed by the passing focused reruns above; typechecking itself establishes neither those behavioral outcomes nor rendered UI. |
| Final coordinator `npx.cmd eslint src/tools/agnostic-loop src/tools/backlog/backlog-file.structure.test.ts src/tools/vitest-paths/gate-commands.structure.test.ts` | Exit zero, no warnings after unused-import-only cleanup. | Lint is structural evidence, not reliable repair proof. |
| Coordinator `npm.cmd run backlog:render` and `npm.cmd run backlog:check-generated` | Both passed. Dispatch-path whitespace validation is clean after LF normalization of the owned CLAUDE instructions. | Working-tree consistency, not a committed release or a claim about unrelated backlog work being edited concurrently. |
| Actual Codex `buildInvocation`/`normalizeResult` smoke, isolated temporary repository; report `C:/Users/alexa/AppData/Local/Temp/agnostic-live-JN7tl5/smoke-report.json` | Exit zero and valid structured WorkerOutcome. Native transport returned a session and token telemetry. | Requested `gpt-6.1-sol` with low reasoning is recorded separately from unavailable observed provider/model/settings; monetary cost is unavailable. This was a bounded native transport smoke, not a complete live development loop. |

No live Claude Code or Gemini CLI verification is claimed. Availability probes,
operator qualification, protocol fixtures and live model execution are separate
evidence classes. Operator qualification authorizes a configured choice; it does
not constitute an evaluation of semantic judgment.

## Criterion map and outstanding evidence

| Criterion | Current evidence basis | Outstanding before complete verification |
|---|---|---|
| AD-1 automatic progression | Supervisor's real generic-child positive fixture and both public CLI/MCP entry paths reach declared local delivery on the successful path. Supervisor mutation instruments passed in the directory run; affected public-entry rerun passed after Windows EPERM. | Failed-gate re-entry is defective: an earlier stage-advance event can replay as a no-op after invalidation resets the item, preventing continued automatic progress. Owner disposition retains this as unfinished work with activation disabled by default. |
| AD-2 independence and review bound | Fresh worker/context allocation plus independent checker/verifier engine gates; the executed capped-review restart fixture preserves two defective checks and dispatches no third checker. | Native model semantic judgment is not established by scripted-worker identities or the successful transport smoke. |
| AD-3 qualified routing | Literal routing tests distinguish judgment-first critical selection, economy-first qualified execution, missing/expired qualification, binary/settings drift and unsupported monetary caps. | Unavailable-provider, context exhaustion and attempt/deadline branches are not exercised by the current routing tests; see AD-9. |
| AD-4 identities | Native normalization tests preserve missing/mismatched observations; actual Codex smoke observes session/tokens but not model/settings. Lifecycle execution rejects an observed settings mismatch. | Automatic supervisor observed-model mismatch and reused-session rejection are not separately evidenced by the current tests. |
| AD-5 real transport | Real generic subprocess probes/invocation, strict outcome validation, nonzero/malformed/native tool-failure tests and actual Codex smoke. | Final automatic result-integration rejection coverage and explicit unsupported provider status. |
| AD-6 atomic launch and uncertainty | Executed lifecycle/admission/pause instruments exercise running-job pause/cancel, a genuine child-spawn-before-PID controller crash, unknown recovery without relaunch, retained reservations, and separately a synthetic pending snapshot. The pause-during-gate case prevents the not-yet-spawned model process, preserves accepted implementation and permits later owner resume. | These are cooperative registered-process observations. Hostile descendants and uncertain external side effects still require explicit owner reconciliation; no OS termination guarantee is established. |
| AD-7 inbox admission | Executed lifecycle tests admit a fresh inbox across unrelated store revisions, make acknowledged replay idempotent, reject changed replay bytes and fence a cancelled token. | Additional wrong-launch/packet/input/candidate variants are not all independently executed in the automatic sidecar path. |
| AD-8 ownership and canonical evidence | Executed lifecycle test rejects an actual unowned file creation; canonical gates and one-writer serialization remain enforced. | Automatic unowned deletion/escape, changed configuration and a cancelled late-writing child are not individually established by that creation test. Cooperative excluded inputs remain a declared trust boundary. |
| AD-9 budgets | Routing tests reject unsupported monetary caps and unavailable prior usage; recorded reservations survive synthetic pending recovery and actual interrupted launch. | Current routing tests do not execute deadline/maxJobs exhaustion, insufficient context or unavailable-provider branches. Automatic attempt/time boundary instruments remain outstanding. Unknown dollars cannot be reported as zero. |
| AD-10 CLI/MCP parity | Real public entry status matches CLI; schemas reject client config/grant overrides; protocol fixtures exercise lifecycle and responsive control. Both public entry paths complete successful-path automatic drive without per-role manual events, including the focused rerun. | Coordinator entry review supplies independent implementation review; reliable failed-gate repair remains a separate defect. |
| AD-11 diagnostics | CLI/MCP status reconstructs durable jobs/checkpoints and fixed startup grant; doctor labels probe/qualification limits. MCP and native-result escaped-secret fixtures passed; the native fixture removes raw credential material and scans the saved controller directory. | The invalidation/re-entry counterexample lacks an explanatory checkpoint. Native identity and dollars remain unavailable where the transport does not report them. |
| AD-12 delivery gates | Engine-owned verification/final reports bind candidate, criterion evidence and local target; successful-path fixtures have actual gate logs. Failed/invalidation re-entry does not produce a shipped item. | Reliable repair/regression after a failed gate is not established. Preserve the defect and owner disposition; do not generalize successful-path delivery into complete lifecycle acceptance. |

## Limits and disposition

No component is rendered by these tests. No browser focus/keyboard behavior,
production service behavior, hostile-process confinement or guaranteed descendant
termination is established. The automatic loop is cooperative and sequential;
same-user controller access is a trusted-operator boundary. Attempt/time bounds
remain distinct from provider-enforced monetary bounds.

Required negative instruments listed above remain verification work, not silently
accepted residuals or implied passes. Runtime activation of an unavailable provider
may be an owner task; its offline adapter behavior is still buildable and testable.
Final delivery must retain any genuinely unverified obligations with owner,
instrument and receiving step, and cannot conceal an unmet mandatory gate.

The current implementation can continue retryable execution failures within the
same drive; the older unconditional-stop finding does not describe current source.
Two concrete defects remain: the repair packet lacks the preceding gate failure's
diagnostics, and an acknowledged stage-advance event is reused after invalidation,
returning unchanged state instead of re-entering the stage.

The latter was exercised with the engine author's isolated
`agnostic-advance-reentry-proof.mjs`, invoked by Node with `--experimental-strip-types`,
`--experimental-default-type=module` and the repository `resolve-ts-hook.ts` loader.
A real drive accepted scope and reached scoped state. An independently checked
fixture wave was then invalidated, resetting the item to queued while retaining
scope. Subsequent drive steps repeatedly proposed advance but neither item state
nor revision changed; no checkpoint explained the stall, and the item did not ship.
This is an actual invalidation/re-entry counterexample, not a claimed complete
failed-gate repair scenario.

The owner answered the corrected disposition question on 2026-10-13: "Keep it
disabled by default; record failed-gate repair as unfinished." This closes the
initial implementation review without another revision/check round. It supersedes
the earlier question based on the stale unconditional-stop finding and does not
claim every failure has an explanatory checkpoint. The failed directory run and
its focused reruns remain recorded separately.

Verification verdict for the full declared automatic lifecycle: **defective**.
Successful-path automatic routing/dispatch and the listed protocol controls are
established, but AD-1/AD-12 reliable failed-gate recovery is not accepted. The
existing generated setup remains disabled by default under the resolved decision.
The coordinator owns the unfinished work in `docs/backlog.yml` row
`LLM-AGNOSTIC-AUTO-DISPATCH`. Its receiving step is a separately scoped repair
activity before normal activation; its instruments must detect stalled re-entry,
missing failure handoff and the remaining conformance gaps. No further answer is
pending for this closed implementation activity.

## Pre-push validation, 2026-10-13

The coordinator ran `npm.cmd run lint`: it exited one with React ref-access
errors in `src/app/components/grading-chat/useContinuousGradingRun.ts`.
`git diff HEAD -- src/app/components/grading-chat/useContinuousGradingRun.ts eslint.config.mjs package-lock.json`
returned no changes. These are pre-existing failures, also acknowledged by the
existing grading-chat backlog notes; they are not a passing global lint claim.

The scoped command
`npx.cmd eslint src/tools/agnostic-loop src/lib/grade/rubric-origin-scope.ts src/lib/grade/rubric-origin.ts src/lib/grade/rubric-memory.ts src/lib/cartridge-drops.ts src/lib/cartridge-drops.origin.test.ts src/lib/grade/rubric-origin-namespace.test.ts src/app/components/grading-chat/chatSetupMemory.ts src/tools/backlog/backlog-file.structure.test.ts src/tools/vitest-paths/gate-commands.structure.test.ts`
exited zero with no output.

`npm.cmd run build` compiled successfully and finished TypeScript checking, then
exited one while prerendering `/account/diagnostics` because Supabase URL/API key
configuration is absent. This satisfies only the documented compile-line check;
it is not a successful complete production build.

`npm.cmd run test:paths src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts src/tools/backlog/backlog-file.structure.test.ts src/tools/vitest-paths/gate-commands.structure.test.ts`
exited zero with five files and 57 passing tests after backlog reconciliation.
