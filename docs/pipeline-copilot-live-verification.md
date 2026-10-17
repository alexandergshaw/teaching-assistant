# Pipeline publication and Copilot live verification

Observed 2026-10-17. Destination requested by the owner: `main`. This record
separates implementation gates, a synthetic private-repository experiment and the
production browser walk. Reviewed source is integrated on `main` and its production
deployment is ready. The authenticated production workflow still awaits sign-in.

## Implemented contract

`src/lib/presentations/repository-template-source.ts` resolves authorized raw or
saved-library originals. `repository-template.ts` uses the shared download
paragraph-fill sources. `repository-snapshot.ts` includes the filled PPTX,
original, frozen renderer and disclosure. Template publication has an independent
SHIP disposition: current generated titles/bullets match download behavior;
original assets and notes are preserved; generated notes/code/graphics remain in
JSON and that limit is disclosed.

`src/lib/presentations/copilot-tasks.ts` verifies the signed package, pins
`presentation-snapshot-<commit>`, refuses source-branch conflicts, accepts actual
GitHub task URLs and reads task lifecycle status. Follow-up requires completed or
idle state and a verified generated branch; it sends the prior `head_ref` without
merging. Failed/cancelled/timed-out tasks with no worker session can report their
terminal lifecycle but cannot be continued. The panel and owner-authenticated
actions call these paths. Dispatch is explicitly configured and default-off.

GitHub's [June 4, 2026 changelog](https://github.blog/changelog/2026-06-04-agent-tasks-rest-api-now-available-for-copilot-pro-pro-and-max/)
confirms public-preview API availability for Pro, Pro+ and Max as well as token
family support. Older Business/Enterprise-only reference wording does not define
current plan availability. Neither source proves this deployment's token access.

## Local gates

The final integrated command passed exit 0 with **13 files and 145 tests**:

```powershell
npm.cmd run test:paths -- src/lib/presentations/copilot-tasks.test.ts src/lib/presentations/repository-template-source.test.ts src/lib/presentations/repository-template-renderer.test.ts src/lib/presentations/repository-snapshot.test.ts src/lib/presentations/repository-publish.test.ts src/app/actions/presentation-repository.test.ts src/app/components/presentations/pipeline/repository-confirmation.test.ts src/app/components/presentations/pipeline/repository-diagnostic.test.ts src/app/actions/action-guard-coverage.test.ts src/app/actions/action-guard-coverage-github-cohort.test.ts src/lib/use-server-exports.test.ts src/file-size-ceiling.structure.test.ts src/app/components/presentations/pipeline/copilot-task-state.test.ts
```

After the lifecycle-recovery delta, independent code review returned SHIP and this
command passed with **5 files and 97 tests**:

```powershell
npm.cmd run test:paths -- src/lib/presentations/copilot-tasks.test.ts src/app/components/presentations/pipeline/copilot-task-state.test.ts src/app/actions/presentation-repository.test.ts src/app/components/presentations/pipeline/repository-diagnostic.test.ts src/file-size-ceiling.structure.test.ts
```

`npx.cmd tsc --noEmit --incremental false --pretty false` passed after the delta. `npm.cmd run docs:gate` passed with **3 files and
49 tests**, covering no-emoji, source-byte and gate-command structure checks. Its
first sandbox attempt hit Node path-resolution EPERM; the permitted rerun outside
the sandbox passed. `git diff --check` passed for the authored documents. Tests
render no components and do not establish browser behavior or provider execution.

`npm.cmd run build` reported a successful compile in 30.1 seconds and completed
its TypeScript stage in 61 seconds, then exited 1 during prerender of
`/account/diagnostics` because this local checkout lacks the Supabase URL/API key.
That is compile/typecheck evidence, not a successful whole build. Standalone
`npx.cmd tsc --noEmit --incremental false --pretty false` passed. Full
`npm.cmd run lint` included an ignored local auth-probe script error. Source lint
was checked separately with
`npx.cmd eslint src --quiet --format json --output-file .agnostic-loop/lint-errors.json`:
12 errors were reported in `src/app/components/grading-chat/useContinuousGradingRun.ts`
for `react-hooks/refs`.
`git diff 1e84577c -- src/app/components/grading-chat/useContinuousGradingRun.ts`
was empty. In a clean prior worktree at `1e84577c`, the following command reported
the same 12 `react-hooks/refs` errors, confirming that baseline. Full lint is not
green.

```powershell
npx.cmd eslint src/app/components/grading-chat/useContinuousGradingRun.ts --quiet --format json --output-file .agnostic-loop/lint-baseline-grading.json
```

The changed/new source scope passed exit 0 with:

```powershell
$pipelineChanged = @(git diff --name-only -- src)
$pipelineNew = @(git ls-files --others --exclude-standard -- src)
npx.cmd eslint @pipelineChanged @pipelineNew
```

## Synthetic live observations

The local operator instrumentation is `.agnostic-loop/template-live.mjs` and
`.agnostic-loop/copilot-live.mjs`, with results saved in
`.agnostic-loop/template-live-state.json` and `.agnostic-loop/copilot-live-state.json`.
These are local experiment scripts/data, not committed regression tests. They use
synthetic content and an existing Git Credential Manager operator credential;
that does not prove the app's production token or authenticated browser action.

Template publication and standalone render parity were measured by:

```powershell
node.exe --experimental-strip-types --experimental-loader ./.agnostic-loop/live-loader.mjs .agnostic-loop/template-live.mjs
```

The script builds a valid synthetic **2-slide** template/package, runs the frozen
renderer, compares uncompressed PPTX ZIP parts and publishes through the app
publisher module. Its `groups.length` and `rendererProof` results report **24
compared parts with no mismatches**. Original template SHA-256:
`c027e1d2336b9965b639e167a47074098db36621728535584036eeaff4da9a74`.

The initial Copilot proof passed using:

```powershell
$env:COPILOT_PROOF_STATE='.agnostic-loop/template-live-state.json'
node.exe --experimental-strip-types --experimental-loader ./.agnostic-loop/live-loader.mjs .agnostic-loop/copilot-live.mjs assert-proof
```

| Evidence from `assert-proof` / saved `liveProof` | Observed value |
| --- | --- |
| Private test repository | [Template proof repository](https://github.com/alexandergshaw/ta-pipeline-template-proof-20261017-a022af8c) |
| Verified snapshot | `2c28ab2cf53f83af3bb67f498f4280e181c4301282c7ec48f7fefa5b28b0316a` |
| Published source commit | `ca05ce9d13ffaaa12c1911b2a6d426ae5e282229` |
| Dedicated source branch | `presentation-snapshot-ca05ce9d13ffaaa12c1911b2a6d426ae5e282229`, still at the source commit |
| Default head after deliberate movement | `4efa83f559780d343fa101327c69eb3c38e0c1b7` |
| Initial task | [d77552e7-91a2-4dd0-94a6-93ead1b363d2](https://github.com/alexandergshaw/ta-pipeline-template-proof-20261017-a022af8c/tasks/d77552e7-91a2-4dd0-94a6-93ead1b363d2), `completed` |
| Worker checkout recorded before edits | `6c9cfd3fc42ad5ed0898176cc912602c286f08ed` |
| Checkout and published source tree | `b013d21af1bcb0a55c775b3436a0a002e25c5166`, identical |
| Generated head | `96fe27133c6cc2ef85588c0bb931b77ca80d5262` |
| Preserved snapshot inputs | 17 files, Git blob SHA equality, no mismatches |
| Generated PR | [PR 1](https://github.com/alexandergshaw/ta-pipeline-template-proof-20261017-a022af8c/pull/1), base is the dedicated source at the published commit |
| Adapter status refresh | `completed` |

The worker checked out GitHub's initial-plan commit rather than the exact source
commit; the verifier independently fetched that checkout and proved its tree
identical to the frozen source. It also checked generated-head ancestry, unchanged
snapshot blob identities, source-ref immobility, existence of `index.html`, PR
base and the adapter's signed-package-verifying status refresh. This establishes
source-tree identity rather than claiming identical checkout commit IDs. It does
not independently validate every hash value written inside `VERIFICATION.json`.

An earlier raw-SHA base attempt in the separate Copilot proof repository produced
a failed task with no session. A branch probe worked, motivating the dedicated
pinned source contract. That failed experiment is retained in
`copilot-live-state.json`; it is not the successful template task above.

The actual adapter accepted explicit follow-up task
[e4c60045-7f7f-42fd-94b6-2bac88119bea](https://github.com/alexandergshaw/ta-pipeline-template-proof-20261017-a022af8c/tasks/e4c60045-7f7f-42fd-94b6-2bac88119bea)
with the same prior generated `head_ref` and frozen source. Instrument:
`copilot-live.mjs followup` with the same loader/state environment above.
GitHub marked that task `completed`, but it produced no new commit or contextual
revision: the generated head stayed at
`96fe27133c6cc2ef85588c0bb931b77ca80d5262`. The following command failed with
`Requested contextual revision missing`:

```powershell
node.exe --experimental-strip-types --experimental-loader ./.agnostic-loop/live-loader.mjs .agnostic-loop/copilot-live.mjs assert-followup
```

The same `COPILOT_PROOF_STATE` environment above applies. Worker logs record
`action=fix-pr-comment`, no prior session state and no tool calls
(`.agnostic-loop/followup-worker-log.txt:807`, `:837`, `:862`, `:876`).
This is a failed live continuation proof despite the completed lifecycle status.
The continuation envelope was corrected to identify the prior task, branch and
observed commit and require implementing the owner request even without PR review
comments. A fresh actual task then passed the same `assert-followup` command
above (exit 0). The saved `followupProof` records:

| Corrected follow-up evidence | Observed value |
| --- | --- |
| Task | [54886e66-c2c5-4e97-a868-3a9dc95ab2b0](https://github.com/alexandergshaw/ta-pipeline-template-proof-20261017-a022af8c/tasks/54886e66-c2c5-4e97-a868-3a9dc95ab2b0), `completed` |
| Checkout before edits | `96fe27133c6cc2ef85588c0bb931b77ca80d5262`, exactly the prior generated head |
| New generated head | `f3aa1a99d82251f6a51fdcae4866903b0f929df6` |
| Output branch / PR | `copilot/create-static-index-html` / existing PR 1 |
| Frozen source | `ca05ce9d13ffaaa12c1911b2a6d426ae5e282229`, unchanged dedicated source |
| Snapshot inputs | 17 Git blobs identical, no mismatches |
| Requested contextual revision | Present in `index.html` |
| Prior app at checkout | Blob matched the prior generated app |
| Adapter status refresh | `completed` |

The assertion also checks ancestry from the prior generated head, retention of the
same PR/source, and the recorded pre-edit checkout. This proves continuation from
the previous application without merge, rather than a second project. For reviewed
integration, change the generated PR base to the default branch instead of merging
into the frozen source branch.

## Completion conditions still open

- Owner/browser verifier: sign in to the actual production app and exercise the
  owner-authenticated review, template publication/download, task submission and
  status/continuation controls with the production credential. This walk awaits
  user sign-in. Existing deployment Secret values could not be exported by the
  Vercel environment tool, so the operator credential is not production-token
  proof. Check focus, keyboard use, disclosure, reload recovery and changed-deck
  warnings in the browser.

## Production configuration

The owner-authorized production flag was saved successfully with:

```powershell
vercel.cmd env add PRESENTATION_COPILOT_TASKS_ENABLED production --value true --no-sensitive --yes --project prj_YBBKRoqM8boCsbBDGaAUX60gv0yz --scope team_FKpR3juJEstRHMFvlNSCmbPc
```

Vercel reported `Added Config Production`. The flag was saved before the ready
production build recorded below. Source dispatch still defaults off when the
variable is absent. Configuration and deployment do not prove production token
access or the signed-in app flow.

## Main delivery and production deployment

Reviewed source commit `777bd7a67b1b8ca4e5e71a8276885ee9fcbdaa15` was pushed to
`origin/main`. The read-only `src/tools/agnostic-loop/main-delivery.ts` check,
using `.agnostic-loop/pipeline-delivery-evidence.json`, workspace `.` and target
`origin/main`, returned `complete: true` and `mismatches: []`. Its evidence covered
24 owned paths and compared committed file bytes and modes. This confirms the
reviewed source delivery at that commit; this document receives a later evidence
transcription commit.

The production inspect command exited 0 and reported READY:

```powershell
vercel.cmd inspect teaching-assistant-im92a64bb-alexandergshaws-projects.vercel.app --scope team_FKpR3juJEstRHMFvlNSCmbPc --wait --timeout 3m
```

Deployment ID: `dpl_6yGCTd2jkMJZGvUC1XJDvVoAeYr9`. A read-only
`GET /v4/aliases/teaching-assistant-pi.vercel.app` returned that same deployment;
the project production target was READY and its aliases included
[teaching-assistant-pi.vercel.app](https://teaching-assistant-pi.vercel.app).

The collaboration host delivery checklist is fulfilled, backed by independent
live proof and the main-delivery check. The explicit engine assertion was also
attempted:

```powershell
node.exe --experimental-strip-types --experimental-default-type=module --experimental-loader ./src/tools/backlog/resolve-ts-hook.ts src/tools/agnostic-loop/manual-handoff.ts .agnostic-loop/pipeline-copilot-live-store PRESENTATION-PIPELINE-COPILOT-REPO
```

It exited 1 with `Manual handoff unproven`: the supervisor store is absent for
this collaboration item. The engine assertion is unavailable; it is not a failed
worker result or failed source delivery, and no engine state was manufactured.
The production browser remains anonymous: no signed-in
owner publication, actual production task, keyboard/focus walk or downloaded PPTX
usability has been proved. Those are the remaining owner sign-in checks above.
