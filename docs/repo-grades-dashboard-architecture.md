# Repo Grades dashboard architecture

This file transcribes the independently checked round-2 architecture. Its authority is the accepted [Repo Grades dashboard criteria](repo-grades-dashboard-criteria.md). It applies only the already-accepted eligibility and no-submission rulings; it does not reopen the design activity.

The architecture is startup discovery, an immutable per-commit plan, durable account-wide admission, the existing repo evaluator, persisted evaluation history, and a class dashboard. There is no LMS grade source or automatic posting.

## Authorization and discovery

Every startup, planning, evaluation, and retry action calls `requireAppOwner()`. Automatic targets derive from courses fetched with the authorized user ID. A browser-supplied organization or repository is not authorization. Ownership and saved configuration are revalidated before dispatch.

Startup eligibility is exactly an owned course with a saved, nonblank GitHub organization, regardless of selected course, current week, or course activity status (criteria 1 and 12). A mapping-only course remains visible and available for manual work, but is explicitly not configured for startup processing. Discovery uses the eligible course's saved repo scope. Current UI prefix, student selection, assignment mapping, folder selector, and search do not silently restrict startup work or initial dashboard coverage.

Add a complete-or-unknown organization reader. `src/lib/github.repos.ts` currently filters before returning from `listOrgRepos`, so returned length cannot reliably detect its page cap. Preserve raw pagination completeness before filtering. A full final allowed page is unknown unless exhaustion is proven. Use `getRepoTreeWithMeta` directly because `getRepoTree` discards truncation. Failed, malformed, or truncated inventory cannot establish a completed course or repo checkpoint.

Use existing folder-discovery rules and their existing grid columns. Discovery coverage and evaluation completion remain separate signals.

## Immutable inputs and terminal outcomes

Resolve the configured grading source branch/ref, or the repo's default branch when absent, to a HEAD SHA once. Use that SHA for folder inventory, ingestion, file reads, README instructions, rubric-generation source, and supplementary source fetches. Every such read carries the SHA explicitly (criteria 2 and 6).

The source SHA is separate from `targetBranch`, which belongs to merge checking. Other-branch merge or submission observations are labeled mutable supplementary facts and cannot establish immutable-input completeness.

`ingestRepo` inserts the live repository description into prompt text. Automatic immutable evaluation must omit that description or freeze it explicitly as configuration input; it must not describe live metadata as commit-derived.

Automatic ingestion refuses evaluation after required-file fetch failure, tree truncation, file-size/count/byte truncation, or unreadable relevant content. Grading-input truncation discovered later produces an incomplete evaluation, never a successful checkpoint. A provisional result may be displayed with its limitation, while the previous complete grade remains available (criteria 7 and 8).

The existing `gradeRepoAction` no-submission path can construct a zero-grade run. The automatic adapter must turn this into a distinct terminal `no-submission` check, with no zero score and no graded result, only when complete discovery and required reads establish that no student-authored submission exists. Store that check for the commit to suppress repeated automatic attempts, and reconsider after a new commit. Do not alter manual zero semantics as an incidental part of this adaptation. A genuine evaluated zero remains a score (criteria 8 and 12).

## Per-course configuration

Persist an account/course/folder profile containing provider, actual model identity, grader version, instructions/rubric policy, resolved rubric provenance, grading source ref, README choice, naming-deduction setting, and code-execution setting. Never copy the current global UI textarea or rubric selection across classes (criteria 4 through 6).

Initial automatic defaults are folder README instructions, generation of a shared rubric where no per-course manual rubric exists, and explicit `runCode: false`. Code execution requires a persisted per-course opt-in. Omitting this argument is unsafe because the existing LLM grading path uses `runCode !== false`.

Persist the resolved rubric before fan-out and reuse it for the course/folder cohort, including after interruption. No Canvas rubric lookup or silent fallback is introduced. Missing required instructions or rubric inputs produce a visible setup error. Unrelated folders do not accidentally share a generated rubric.

A successful unchanged SHA is not automatically re-evaluated because configuration changed. Display that settings changed since evaluation and expose explicit reevaluation. The profile fingerprint distinguishes history and prevents mismatched pending work; it is not an independent automatic-spend trigger (criterion 3). A later changed commit uses the current course configuration.

## Durable lifecycle and account-wide admission

Use dedicated durable tables for profiles, repo snapshots, task attempts, and stripped evaluation results. Browser saved cells and `grading_drafts` do not provide atomic per-commit admission.

Automatic target identity is user, course, exact repo, source ref, SHA, and folder. Attempts additionally reference the effective profile version. Keep task lifecycle separate from immutable result data. States distinguish pending, claimed, succeeded, no-submission, partial/incomplete, failed, and unknown.

The read-only startup preview preserves the source ref in target and attempt provenance. It checks prior receipts for the same owner, course, case-insensitive repository, exact folder, and SHA across refs. Terminal receipts take precedence, followed by unknown or claimed attempts that may still represent active work. Before enabling startup, durable admission must enforce this same cross-ref protection under the account lock. The preview alone cannot authorize a claim.

Atomic admission enforces account-wide capacity shared with manual repo evaluation, excludes a concurrent claim for the same evaluation identity, creates a server-owned claim token and attempt generation, and rechecks course ownership and configuration. Ordinary startup cannot claim succeeded, unknown, or already claimed work.

All settlement happens server-side and compares the claim token and attempt generation. Browser responses never declare durable success. Save successful cells independently. A repo-level completed checkpoint may advance transactionally only when its complete captured inventory has complete successful or conclusive no-submission outcomes. No-submission checks remain distinct from successful graded-cell watermarks (criteria 7 through 10).

Failed or uncertain attempts retain previous results. Stale claimed work becomes unknown, never automatically pending. Unknown reservations must be reconciled explicitly before releasing capacity if the old execution might still be active. Do not claim cancellation of provider-side work. An explicit retry creates a new attempt; reopening the app does not blindly replay uncertain or incomplete paid work.

If the source branch advances during evaluation, results remain attached to the captured SHA. They cannot mark the newer SHA complete or overwrite newer results. The newer commit remains eligible on a subsequent app-start check.

## Bounded execution and shared manual admission

Process a bounded target per request, not an entire class. Stop dispatching after app/account teardown. Already-dispatched server work can settle only against its original authorized identity and attempt generation.

A ledger wrapper alone is insufficient. `src/lib/llm.ts` currently sends model requests without a signal and retries ambiguous network failures. Automatic evaluation needs an explicit deadline/abort signal, bounded retry delays, and no automatic retry after ambiguous model transport failure. Propagate that policy through rubric generation and grading. `Promise.race` alone does not cancel or bound the underlying work.

Model timeout or lost response is unknown. Retry only proven safe pre-dispatch failures or clearly refused responses under the fixed execution policy. Existing provider and budget limits remain effective. This design does not claim exactly-once provider execution after an ambiguous crash.

Extract the reusable evaluator from `gradeRepoAction` into a server-only implementation leaf. The existing action and automatic execution use it after shared admission. Adopt `gradeReposAction` as well: it calls grading directly and otherwise bypasses admission. Existing workflow callers of `gradeRepoAction` inherit the shared protection. Do not create an independent automatic pool beside the current hook (criterion 9).

Manual grading preserves its existing semantics and participates in account-wide capacity. Automatic course-discovery restrictions do not unexpectedly prohibit legitimate manual repo references. Conflicting manual/automatic targets are visibly busy or queued, not dispatched concurrently. Shared admission must land before startup is enabled.

## Results, isolation, cleanup, and diagnostics

Store automatic results separately from instructor-edited browser cells. Show the latest complete evaluation, its commit/date, any pending/error status, and the saved instructor override or review conflict. Never replace edited scores or feedback silently, nor erase an older complete result on failed refresh. Historical saved entries absent from the latest scan remain visible (criteria 11 and 12).

Enable RLS on new public ledger tables and allow only own-row SELECT to authenticated clients. Revoke browser mutation privileges. Mutating RPCs are service-role-only, with EXECUTE revoked from PUBLIC, anon, and authenticated. Server ownership checks precede calls; database mutations verify the course/user relationship. No new credentials are required. Missing migration or unavailable durable storage fails closed before spending; there is no browser-only coordination fallback.

Retain only scores, structured rubric results, bounded feedback, completeness markers, commit/configuration provenance, and fixed outcome codes. Exclude credentials, submitted files, execution output, raw exceptions, and arbitrary URLs. Delete ledger data on course/account deletion. Prune superseded detailed results while retaining compact successful-commit and attempt receipts needed to prevent replay. Never prune active/unknown claims as cleanup.

Diagnostics cover discovery, checkpoint/result read-back, scheduling, evaluation, persistence, and recovery. Use fixed operations, outcomes, and failure categories with capped counts and elapsed time. Exclude identities, URLs, source code, prompts/rubrics, feedback, credentials, exceptions, and individual scores (criterion 14).

## Sequential implementation waves

### Wave A: immutable discovery and execution context

Create:

- `src/lib/repo-grades-dashboard/types.ts`
- `src/lib/repo-grades-dashboard/discovery.ts`
- `src/lib/repo-grades-dashboard/discovery.test.ts`
- `src/lib/repo-grades-dashboard/execution-policy.ts`
- `src/lib/repo-grades-dashboard/execution-policy.test.ts`
- `src/lib/repo-grade-evaluator.ts`

Adopt narrowly:

- `src/lib/github.repos.ts`: completeness-preserving listing.
- `src/lib/github.digest.ts`: immutable automatic-input and completeness contract.
- `src/app/actions/github-repos.ts`: evaluator extraction, separate source SHA, and automatic no-submission adaptation.
- `src/lib/grade/rubric.ts`, `src/lib/grade/engine.ts`, and `src/lib/llm.ts`: bounded execution-policy propagation.
- Relevant existing tests for those production paths.

The first executable proof changes mocked HEAD during evaluation while every inventory/file/README/rubric source read stays at the captured SHA. Any omitted or failed input prevents complete success. Complete no-submission produces a terminal check and no grade. This bounded first wave has no automatic startup caller.

### Wave B: durable ledger and shared admission

Create:

- `src/lib/repo-grades-dashboard/ledger.ts`
- `src/lib/repo-grades-dashboard/ledger.test.ts`
- `src/lib/repo-grades-dashboard/state.ts`
- `src/lib/repo-grades-dashboard/state.test.ts`
- `src/lib/supabase/types.repo-grades-dashboard.ts`
- The migration generated by `supabase migration new repo_grade_evaluations`; use its actual generated filename.
- `src/lib/repo-grades-dashboard/ledger.migration.test.ts`

Adopt `src/app/actions/github-repos.ts`, `src/app/actions/github.ts`, relevant manual-action tests, and the action guard registry. Prove competing claims, stale settlement, account capacity, own-course isolation, ambiguous-response retention, and manual/automatic mutual admission. Startup remains disabled until these pass.

### Wave C: planner, runner, and profiles

Create:

- `src/lib/repo-grades-dashboard/profile.ts`
- `src/lib/repo-grades-dashboard/profile.test.ts`
- `src/lib/repo-grades-dashboard/runner.ts`
- `src/lib/repo-grades-dashboard/runner.test.ts`
- `src/app/actions/repo-grades-dashboard.ts`
- `src/app/actions/repo-grades-dashboard.test.ts`

Prove nonblank-organization eligibility, mapping-only exclusion from automatic work, first-baseline evaluation, unchanged successful SHA skipping despite configuration changes, changed-SHA dispatch, partial restart without repeating successful cells, frozen cohort rubric, explicit code-execution false, missing-migration fail-closed behavior, and absence of LMS/posting calls.

### Wave D: app startup and dashboard

Create:

- `src/app/components/repo-grades-dashboard/RepoGradesStartup.tsx`
- `src/app/components/repo-grades-dashboard/useRepoGradesStartup.ts`
- `src/app/components/repo-grades-dashboard/RepoGradesDashboard.tsx`
- `src/app/components/repo-grades-dashboard/dashboard-model.ts`
- `src/app/components/repo-grades-dashboard/dashboard-model.test.ts`
- `src/app/components/repo-grades-dashboard/dashboard.wiring.test.ts`
- `src/app/components/repo-grades-dashboard/dashboard.module.css`
- `src/lib/repo-grades-dashboard/diagnostics.ts`
- `src/lib/repo-grades-dashboard/diagnostics.test.ts`

Adopt narrowly:

- `src/app/page.tsx`
- `src/app/components/repo-grades/index.tsx`
- `src/app/components/repo-grades/useRepoGradesGradingActions.ts`
- `src/app/components/repo-grades/useRepoGradesBulkGrade.ts`
- `src/app/components/repo-grades/repoGradesResultsStore.ts`
- `src/app/components/repo-grades/repoGradesUiState.ts`
- `src/lib/session-diagnostic-log.ts`
- Corresponding existing tests.

App startup is independent of selected tab. Guard callbacks and results against account and generation changes. Preserve independent local-storage errors, semantic table headers, stable focus, and permanent status announcements. Stop controls explain that they stop future scheduling and do not promise cancellation of already-running provider work.

## Dirty-file preservation and verification obligations

Existing uncommitted versions of `src/app/actions/github-repos.ts`, `src/app/page.tsx`, `repoGradesUiState.ts`, `RepoGradesControls.tsx`, compiler wiring tests, and session-diagnostic-log files must be preserved through narrow edits, with current diffs captured before adoption.

Use the gates in `docs/loop/this-repo.md`, including exact-path test invocation, relevant action guard and wholesale-auth canaries, file-size/source-bytes/server-export/emoji checks, serialized typecheck, lint against the dirty baseline, and the repository build check. Independent verification consumes each wave's real diff and results.

Remaining obligations are measurements, not reopened design alternatives:

- Implementer and independent verifier: exercise live database atomicity, RLS, and migration deployment before claiming production coordination.
- Implementer and independent verifier: exercise actual provider deadline and ambiguous-response behavior before claiming bounded automatic execution.
- Browser verifier: check rendered table, keyboard, focus, and announcements before claiming accessible runtime behavior. Repository node tests render no component.
- Runtime verifier: exercise configured GitHub access and immutable-source behavior against real repositories before claiming live integration verified.

The architecture seat performed read-only inspection before this transcription. It ran no tests, network requests, or paid evaluations.
