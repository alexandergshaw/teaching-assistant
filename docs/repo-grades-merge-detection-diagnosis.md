# Diagnosis: repo-grades "detect unmerged work" feature - why the owner sees it as absent/inert

Investigation only. No production file was edited. Owner report, verbatim:
"where is the feature to detect when something hasn't been merged? it's not
working". Referenced student repo: python-fall-2026/info-1255-toria-mcgowan,
work under `main/assignments` (i.e. the work IS on the default branch `main`).

## VERDICT

**BUILT-BUT-WRONG-SIGNAL**, with a secondary **BUILT-BUT-UNREACHABLE** layer.

The capability was built (two waves, marked FEATURE COMPLETE) and the data path
is wired end to end: a target-branch control exists, it threads into the action,
the action classifies a 4-way merge outcome and records it in the diagnostic
seam. It is NOT dead at the plumbing level. But it does not do what the owner
expects, for two compounding reasons:

1. WRONG SIGNAL (primary). The "not merged" detection fires ONLY when the graded
   branch/folder is COMPLETELY EMPTY of student-authored files. It cannot detect
   "this assignment's work sits on an unmerged branch" whenever the graded folder
   already contains any non-scaffolding file. For the owner's own repo (work
   present under `main/assignments`) the result is always `merged` and nothing is
   shown - which reads as "the feature does nothing".
2. UNREACHABLE RESULT (secondary). The typed `branchMergeCheck` outcome is never
   rendered on the grid cell. It reaches only the diagnostic log. The only
   user-visible trace is a sentence folded into `reason`, and `reason` is shown
   only transiently (a post-summary banner) and only on the no-submission path.
   A `merged` or a normally-graded result surfaces nothing. The control itself
   has no visible label (placeholder only), so it is easy to miss.

## 1. Scope doc summary (docs/repo-grades-branch-merge-check-scope.md)

Specified three parts: (1) a persisted per-course target-branch control in the
sticky header; (2) reuse of the EXISTING `scanBranchesForUnmergedSubmission`
no-submission detection, surfaced as a new typed 4-way outcome
`BranchMergeCheck` = merged | not-merged | no-submission | unknown; (3) grading
integration - distinct non-accusatory notes per state, scoring reading A (note +
instructor-visible flag, NO automatic score change), plus a diagnostic entry and
a target-branch security validator.

Marked SHIPPED. `docs/BACKLOG.md:260` records: Wave 1 `41cde1e3` (validator +
classifier + diagnostic), Wave 2 `146afdcd` "FEATURE COMPLETE" (the control,
per-course persistence, both call sites threaded). Owner-walk items left open:
"the live GitHub merge detection against real repos + the real send of the note."
The scope's own operational definition (section 3.1) is the root of the wrong
signal: it defines "merged to X" as "gradable content exists under the scoped
folder on branch X", and its negative relies entirely on the no-submission path.
The scope explicitly DEFERRED the compare/ancestor API and merged-PR detection
(section 8 residuals) as "presence covers the ask".

## 2. Ground truth in code (every claim cited)

### 2.1 Detection capability EXISTS

- `src/lib/repo-grade-branch-scan.ts:245` `scanBranchesForUnmergedSubmission(...)`
  - pure, injected-fetcher scan returning a 3-way `BranchScanResult`
  (found / not-found / undetermined).
- `src/lib/repo-grade-merge-check.ts` - `classifyBranchMergeCheck` +
  `describeBranchMergeNote` (the 4-way typed outcome and per-state note text).
- `src/lib/github-ref-name.ts:1` - `normalizeTargetBranch` / `encodeRefSegment`
  (the security validator). Wired.

### 2.2 Wiring is present (NOT dead plumbing)

- Control: `src/app/components/repo-grades/index.tsx:808-822` renders
  `targetBranchControl` (a text input) unconditionally into the sticky header;
  `RepoGradesStickyHeader.tsx:33,37,68` accepts and renders the prop.
- State + persistence: `index.tsx:350` `useState("")`,
  `index.tsx:818` `persistTargetBranch(...)`; `repoGradesUiState.ts:461,468,480`
  `TARGET_BRANCH_KEY = "ta-repo-grades-target-branch"`, per-course.
- Threading to the action: `index.tsx:580` `targetBranch: targetBranch.trim() ||
  undefined`; `useRepoGradesGradingActions.ts:282` passes it as the 5th positional
  arg to `gradeRepoAction`; `useRepoGradesBulkGrade.ts:275` likewise.
- Action: `github-repos.ts:710-712` validates and resolves `targetBranch`;
  `:715` passes it into `ingestRepo`; `:780-792` runs the scan on the
  no-submission path; `:824-830` and `:837-838` compute `branchMergeCheck` and
  return it on all three non-error branches (`:832,:863,:873`).
- Diagnostic: `gradingActionSeam.ts:66-71` `classifyMergeCheckResult` reads
  `branchMergeCheck.status` into the grading diagnostic.

### 2.3 Reachability - WHERE THE CHAIN IS BROKEN

- BROKEN LINK A (result not rendered). `useRepoGradesGradingActions.ts:296-305`:
  on the no-submission return the hook sets only `gradeError: null` and calls
  `setPostSummary(... result.reason)`. It never reads `result.branchMergeCheck`.
  The success path (`:307` onward, the cell-edit write `:317-338`) also never
  reads `branchMergeCheck`. So the typed merge outcome reaches the diagnostic log
  and nothing else. There is NO persistent per-cell "Not merged to main"
  indicator - contrary to the scope's reading A / AC-10 ("the typed flag on the
  cell"). The only user-visible trace is the `reason` sentence, shown transiently
  in the post-summary banner, and only when `noSubmission` is true.
- BROKEN LINK B (control invisible). `index.tsx:810-820` is a bare `<input>` with
  `aria-label="Target branch (merged to)"` and `placeholder="Optional, e.g.
  main"` but NO visible caption. `repoGradesWaveASticky.structure.test.ts:253`
  asserts the view does NOT contain the visible text. A user who never types a
  branch gets `targetBranch = undefined`, i.e. today's behavior byte-identical
  (`index.tsx:580`, `github-repos.ts:712`) - no merge check ever runs.

### 2.4 The WRONG-SIGNAL root cause (the load-bearing finding)

The merge check is gated entirely behind the no-submission branch:
`github-repos.ts:765-766` `const gradableFiles = gradedDigest.files.filter((f)
=> !isScaffoldingFile(f.path)); if (gradableFiles.length === 0) {`. The scan at
`:780` and the no-submission `classifyBranchMergeCheck` at `:824` run ONLY inside
this block. On the success path, `:837-838` hard-codes `gradedTargetHadSubmission:
true, scan: null`, which `classifyBranchMergeCheck` maps to `merged` by
construction - WITHOUT ever looking at other branches.

Consequence: if the graded folder on the target branch holds ANY non-scaffolding
file (starter code, a prior assignment, a partial commit, an instructions file
that was not excluded), `gradableFiles.length > 0`, the scan never runs, and the
outcome is unconditionally `merged`. The scan also only distinguishes "some
student content exists on another branch" from "none anywhere"
(`repo-grade-branch-scan.ts:284-301`); it does not compare the target branch's
content against the other branch, so "the assignment folder on main is stale and
the real work is on an unmerged feature branch" is undetectable.

This is exactly the owner's situation: work is under `main/assignments`, so the
graded folder is non-empty, the outcome is `merged`, and nothing is shown. The
feature is inert for the realistic unmerged-PR case (student has a PR open
against main that was never merged, while main still carries scaffolding/old
work).

## 3. Ref the grader reads (point 4)

`gradeRepoAction`'s 5th positional parameter `branch` -> validated to
`targetBranch` (`github-repos.ts:710-712`) -> passed as the 4th arg of
`ingestRepo` (`:715`) -> `getRepoTreeWithMeta(owner, repo, ref)` and
`getFileText(..., ref)` with `ref || defaultBranch` (`github.files.ts:33`, per
scope section 3.4). So: a non-empty target branch IS the graded ref; an empty
target grades each repo's DEFAULT branch. The scan's `gradedBranch =
explicitBranch || listed.defaultBranch` (`repo-grade-branch-scan.ts:270`) matches.
There is no compare/ancestor call anywhere (`grep "/compare/" src/lib` is empty;
scope section 3.1 confirms it was deferred). "Merged" is therefore
presence-on-the-graded-ref, never a git-ancestry fact.

## 4. Recommended minimal fix path

Two independent defects; both are worth fixing, the signal one is primary.

### FIX 1 (primary - the wrong signal). RECOMMENDED READING: extend detection to
compare the target branch against other branches EVEN WHEN the graded folder is
non-empty, using the GitHub compare/ancestor API that the scope deferred
(section 8 residual: "Compare-API / ancestor merge precision").

- New pure leaf `src/lib/github-compare.ts` (+ a `/compare/{base}...{head}`
  helper in the github client, routed through `encodeRefSegment`) that, for each
  non-target branch with content under the scoped folder, asks whether that
  branch is already contained in the target (ahead_by === 0) or has unmerged
  commits touching the folder.
- Run it on the SUCCESS path too (hoist the merge check out from under the
  `gradableFiles.length === 0` guard at `github-repos.ts:766`), so a graded,
  non-empty target can still be flagged `not-merged` when an unmerged branch
  holds newer work for the folder.
- This is the fork the owner should rule on, because it adds authenticated GitHub
  calls per repo (cost/rate-limit) and a precision choice (presence vs git
  ancestry). The two readings:
  - (A) Presence-only, hoisted: cheap, reuses the existing scan, flags
    "work for this folder also exists on branch X not merged to <target>" without
    git-ancestry precision. RECOMMENDED if the owner wants it working now.
  - (B) Compare/ancestor-precise: a new API call per candidate branch, exact
    "merged in the git sense" - more correct, more cost. RECOMMENDED only if (A)'s
    false positives (e.g. a branch that was merged by squash) prove noisy.
  Recommend starting (A) (hoist + reuse the scan) because it ships the owner's
  intent with zero new API surface; escalate to (B) only on measured noise.

### FIX 2 (secondary - reachability). Render the typed `branchMergeCheck` on the
cell and give the control a visible label.

- In `useRepoGradesGradingActions.ts:317-338` and the bulk equivalent, read
  `result.branchMergeCheck` and write a persistent cell flag (e.g. a
  `mergeStatus` field) alongside `score`/`comment`; render a badge like
  "Not merged to main (work on <branch>)" in `RepoGradesGrid.tsx` /
  `RepoGradesStatusBanners.tsx`. This is what AC-10/reading A specified and is
  currently missing.
- Add a visible caption to the target-branch input at `index.tsx:809-821` (and
  relax `repoGradesWaveASticky.structure.test.ts:253`), so the control is
  discoverable rather than a bare placeholder box.

### Proposed write set

FIX 1 (needs an owner ruling on A vs B first):
- `src/lib/github-compare.ts` (NEW, only under reading B)
- `src/lib/github.repos.ts` or `src/lib/github.files.ts` (NEW compare helper,
  reading B only)
- `src/app/actions/github-repos.ts` (hoist the merge check above the
  `gradableFiles.length === 0` guard; call the extended detection on the success
  path)
- `src/lib/repo-grade-merge-check.ts` (map the new "non-empty target but unmerged
  branch exists" input)
- test files mirroring `github-repos.branch-merge-check.test.ts` +
  `repo-grade-merge-check.test.ts`

FIX 2 (no owner ruling needed; pure surfacing of an already-built outcome):
- `src/app/components/repo-grades/useRepoGradesGradingActions.ts`
- `src/app/components/repo-grades/useRepoGradesBulkGrade.ts`
- `src/app/components/repo-grades/RepoGradesGrid.tsx` (and/or
  `RepoGradesStatusBanners.tsx`)
- `src/app/components/repo-grades/index.tsx` (visible label)
- `src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts`
  (relax the no-visible-label assertion)
- `src/app/components/repo-grades/repoGrades.wiring.test.ts` (pin the cell render)

## 5. Residuals / cannot-verify-here

- The LIVE GitHub behavior for the owner's repo cannot be confirmed here (no
  `.env`, no `GITHUB_TOKEN`, network blocked under vitest, no component rendered).
  To confirm FIX 1 is needed rather than a misconfiguration, the owner should
  confirm: (a) whether they ever typed a value into the (unlabeled) target-branch
  box, and (b) for one failing student, whether that student's assignment work is
  on an unmerged branch/PR while `main/<folder>` is non-empty - which is the exact
  scenario the current gate (`github-repos.ts:766`) cannot detect.
- Whether a target branch that does not exist in a given repo resolves to
  `unknown`/`{error}` or a false `no-submission` is still an owner-walk residual
  (scope section 8, undischarged).
