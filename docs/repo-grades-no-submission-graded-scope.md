# Repo grading: branch-merge outcomes in the grading COMMENT, and a graded zero for genuine absence

Architecture + scope pass. loop-architect seat. This doc decides SHAPE; it edits
no production file. Every quantity names the command that produced it; every
`file:line` below was opened.

## Owner asks (verbatim)

1. "if a repo genuinely has no submission for an assignment and there is not a
   branch out there with a submission, that needs to be put in the comments and
   graded".
2. (live case, coordinator relay) "the comments when something isn't showing up
   on main but is on a branch aren't showing up." Live repo:
   `github.com/python-fall-2026/info-1255-michael-calhoun` - graded via the
   GitHub repo path (not a zip); `main` carries modules 01-07; a later module's
   work is on an unmerged branch. Graded WITHOUT typing a target branch.

These are one mechanism: **the typed `BranchMergeCheck` outcome must reach the
persistent grading COMMENT (and the score), for every outcome, and the scan that
produces it must run on a normal grade of `main` without the instructor typing a
target branch.**

This builds directly on the just-shipped branch-merge work: Wave A `4022f857`,
Wave B `f1a8aaee`. The classifier `src/lib/repo-grade-merge-check.ts` yields
`merged | not-merged | no-submission | unknown`; the scan
`src/lib/repo-grade-branch-scan.ts` reports `found | not-found | undetermined`;
the action `src/app/actions/github-repos.ts` drives both.

---

## 1. CURRENT BEHAVIOUR (investigation 1), cited and opened

### 1.1 A no-submission repo gets NO graded row today

`gradeRepoAction` (`src/app/actions/github-repos.ts:654-906`) returns a
DISCRIMINATED union. When `gradableFiles.length === 0` (nothing student-authored
on the graded ref after excluding instructions + `.gitkeep`,
`github-repos.ts:765-766`) it returns the `noSubmission` branch
(`:832`): `{ noSubmission: true, fullName, reason, ... , determination?,
branchMergeCheck? }` - **there is no `run`, so there is no score and no
GradeResult at all** (the branch's own doc comment, `:676-701`). So the answer
to "does today's no-submission path produce a graded row?" is **(c) it skips
grading** - it produces a sentinel, not a row.

The three consumers of that sentinel today:

- **Per-cell** `useRepoGradesGradingActions.ts:296-314`: on `"noSubmission" in
  result` it sets `grading:false`, writes `mergeStatus`/`mergeFoundOnBranch`
  (the badge), and announces `result.reason` through the aria-live region
  (`setPostSummary`, `:312`). **It never writes `comment`/`strengths`/`score`.**
  The cell stays `status === "ungraded"` (`repoGradesRows.ts:54-57,117-121`), the
  feedback boxes stay empty, nothing is postable. **This is exactly why the owner
  "sees no comment": the reason text is a transient status announcement, not the
  persistent feedback field.**
- **Bulk** `useRepoGradesBulkGrade.ts:294-303`: same shape - sets the badge
  fields, pushes an outcome with `status:"no-submission"`, `score:""`, writes no
  comment.
- **Workflow** `steps.grading-repos.grade-repo.ts:392-404` (`gradeOrgRepos`) and
  `steps.grading-repos.helpers.ts:278-290` (`gradeTileRepos`): `continue` past
  the repo after logging a `no-submission` log entry (`buildRepoGradingLogEntry`,
  `outcome:"no-submission"`). **The repo never enters `results`, so it never
  enters the saved draft** - the G0-2 finding in
  `docs/no-submission-and-requirement-checking-acceptance-criteria.md:39-45`.

### 1.2 The Canvas path already does what the repo path does not

`buildZeroGradingEntry` (`src/lib/grade-zeros.ts:63-121`) produces real `0`
GradeResults with `determination:"no-submission"` and a composed comment for
Canvas non-submitters. The GitHub repo path was left half-finished: it DETECTS
no-submission and the unmerged branch, but never produces the `0` row G1/G3
specified. **The owner's ask 1 is finishing G1/G3 on the repo path.**

### 1.3 Not-merged renders a BADGE but writes no comment (GAP 1, confirmed)

Wave B renders the badge at `RepoGradeCellControl.tsx:396-403` from
`edit.mergeStatus === "not-merged"`. `edit.mergeStatus`/`edit.mergeFoundOnBranch`
(`repoGradesCellEdits.ts:155-162`) are the ONLY merge signal written to the cell.
`describeBranchMergeNote` (`repo-grade-merge-check.ts:49-60`) already composes the
right per-status sentence - but its output reaches the comment NOWHERE: on the
no-submission path it is appended to `reason` (`github-repos.ts:827-830`), which
the client only announces (1.1). **Confirmed: a not-merged outcome produces a
badge and a transient announcement, never a persistent comment.**

### 1.4 The success-path scan is opt-in on a typed target (GAP 2, confirmed)

Two scan sites in `gradeRepoAction`:

- No-submission path (`github-repos.ts:780-792`): the scan runs
  **UNCONDITIONALLY**, with `targetBranch` possibly `undefined`.
  `scanBranchesForUnmergedSubmission` resolves `gradedBranch = explicitBranch ||
  listed.defaultBranch` (`repo-grade-branch-scan.ts:283`), so it checks other
  branches even with no typed target.
- Success path (`github-repos.ts:843-868`): gated on **`if (targetBranch)`**
  (`:844`). With no typed target, `mergedCheck` stays `undefined` and the
  success `run` branches carry `branchMergeCheck: undefined` (`:892,:902`).

**Conflict with the original brief, reported per the refuse-a-ruling rule.** The
original brief stated "the branch scan only runs when a target branch is set."
The tree disagrees: on the NO-SUBMISSION path the scan runs regardless of target
(`:780`, no guard). Only the SUCCESS path is target-gated (`:844`). So "genuinely
absent across branches" is already knowable without a typed target - the brief's
premise is false for the live case, and the live case (module absent from `main`)
hits the no-submission path where the scan already runs. The owner "sees nothing"
there because of GAP 1 (no comment), not because the scan did not run. GAP 2 is a
real but SEPARATE gap: a module PRESENT on `main` that also has newer/other work
on an unmerged branch is never detected without a typed target.

---

## 2. THE SIGNAL (investigation 2): precise definitions from the tree

Let the graded ref be `main` (the default branch) when no target is typed, else
the typed target. Let `scan` be `scanBranchesForUnmergedSubmission`'s result.

- **MERGED / PRESENT**: the graded ref folder has gradable content. Outcome (a).
  `classifyBranchMergeCheck` -> `merged` (`repo-grade-merge-check.ts:35-37`) when
  `scan.kind==="not-found"` and `gradedTargetHadSubmission`.
- **NOT-MERGED**: `scan.kind==="found"` - another branch holds a candidate path
  the graded ref lacks (`repo-grade-merge-check.ts:30-33`; the path-set DIFFERENCE
  via `gradedRefPaths`, `repo-grade-branch-scan.ts:205-210,295-297`). Splits by
  whether the graded ref folder has content:
  - **NOT-MERGED, graded ref EMPTY** (the live case: module absent from `main`,
    present on branch X). No-submission path.
  - **NOT-MERGED, graded ref HAS content** (present on `main` AND newer/other work
    on branch X). Success path. This is the case GAP 2 unlocks.
- **GENUINELY ABSENT EVERYWHERE**: graded ref empty AND `scan.kind==="not-found"`
  (every checkable branch read cleanly, nothing on any; `classifyBranchMergeCheck`
  -> `no-submission`, `:35-37`). Outcome (c).
- **UNKNOWN**: `scan.kind==="undetermined"` - a 404/409/truncated/rate-limit on a
  branch that mattered (`repo-grade-branch-scan.ts:166-177`, G3d). Cannot assert
  absence.

**No-target wording.** Because the scan runs against the default branch even with
no typed target, the signal is sound without a target; only the NOTE WORDING must
not claim a target the instructor did not set (see 4.3).

---

## 3. THE SHAPE: a server route, so every consumer inherits one surface

**Decision (act-on-recommended): the decision lives in `gradeRepoAction`
(server). Genuinely-absent and not-merged-empty return a graded `run` (a `0`
GradeResult with the branch note folded into its comment); the success path folds
the note into the real grade's comment and always carries `branchMergeCheck`.**

Why this shape and not a per-consumer client fix (the load-bearing choice every
later wave is built against):

- **The surface is the EXISTING `run` branch.** All three consumers already have
  a `result.run.results[0]` success path that copies `score` + all four comment
  fields onto the cell / into the draft (`useRepoGradesGradingActions.ts:316-375`,
  `useRepoGradesBulkGrade.ts:305-361`, `gradeOrgRepos` `:406-441`, `gradeTileRepos`
  `helpers.ts:292-327`). Returning a graded `run` makes the comment and score
  appear with **no new client branch** - the "the surface is a layer" trap
  (`MEMORY: verify-reachability`) is paid once, on the server.
- A client route would need a zero-factory in THREE places and could not fold a
  comment into the Canvas-persisted field the workflow draft saves.
- `determination` already travels on `GradeResult` and is already carried through
  all three persistence allowlists + the coverage test
  (`grade-result-allowlist-coverage.test.ts:78,166,203`), so **no new GradeResult
  field is added** - nothing in G1c's three-allowlist tax applies.

The zero GradeResult is produced with **NO model call** (G2b): deterministic
score `"0"` and a composed comment. This is the leverage (section 9).

---

## 4. THE GRADED RESULT and THE COMMENT (investigation 3)

### 4.1 Score

`totalScore = "0"` (bare), `determination = "no-submission"`. Reasons, all
pre-decided: G1 (a 0 with an explicit comment), G1a (the fact is its own field,
never encoded in the score string - six sites take the first number in the score
text, `grading.ts:491`, `repoGradesPosting.ts:150`), G1b (no `"0/0"`; repo
grading has no `pointsPossible` at grade time, so bare `"0"`). Verified postable:
`resolvePostScore("0", pp)` hits the bare-number branch and returns
`{ok:true, score:0, rescaled:false}` (`repoGradePostScore.ts:58-62`), and
`repoGradePostability` then gates only on binding/assignment/folder
(`repo-grade-postability.ts:49-88`). So a bound repo's `0` posts as `0`; an
unbound repo's `0` shows + saves to a draft but is not postable until bound -
exactly right.

`rubricAreas: []`, `submittedFiles: []`, `mergedFileCount: 0`, `codeExecution`
unset (nothing was run).

### 4.2 Comment, driven by `BranchMergeCheck.status`, folded into the feedback field

The comment is `composeOverallComment(strengths, improvements, resubmitNotice)`
(`grade/types.ts:28-37`, G2a), with the four fields populated per status. The
distinct per-status sentence is `describeBranchMergeNote` (ALREADY distinct per
status, `repo-grade-merge-check.ts:49-60`) - GAP 1's fix is to route its text
into the GradeResult's comment fields instead of into transient `reason`.

| Status | Score | `strengths` (factual) | note folded in | badge |
|---|---|---|---|---|
| merged / present | real grade | model's | NONE (a) | none |
| not-merged, ref empty | `0` | "Nothing was submitted in `<folder>`..." | branch note (b) | yes |
| not-merged, ref has content | real grade | model's | branch note APPENDED (b) | yes |
| no-submission (absent everywhere) | `0` | "Nothing was submitted in `<folder>`..." | absent-everywhere note (c) | none |
| unknown | see 6, fork C | - | uncertainty caveat | none |

(b) vs (c) are made distinct by `describeBranchMergeNote` itself:
`not-merged` -> names branch X and "never merged into `<ref>`" (`:51-52`);
`no-submission` -> "No branch of this repository has submitted work... nothing
was found on the target or any other branch checked" (`:53-54`). Keep the badge
for not-merged (coordinator) AND write the comment.

### 4.3 No-target note wording

`describeBranchMergeNote` currently words every note as "the branch you set as the
target" (`:51-56`). When no target was typed the graded ref is the DEFAULT branch
and that phrasing over-claims. `BranchMergeCheck` must carry the effective graded
branch name and WHETHER it was an explicit target; `describeBranchMergeNote` words
"the branch you set as the target `<X>`" only when explicit, else "the default
branch `<main>`". This is a change to `repo-grade-merge-check.ts` and its FROZEN
oracle `repo-grade-merge-check.test.ts` (both in the write set).

### 4.4 Folding the note into a REAL grade (success path, not-merged)

A pure helper `appendBranchNoteToResult(result, note)` returns a new GradeResult
with `note` appended to `improvements` and `overallComment` recomposed via
`composeOverallComment` (never mutates; never re-authors `strengths`). Lives in
`src/lib/grade-zeros.ts` beside `buildZeroGradingEntry` (G0-2: "do not write a
second one beside it" - reuse the one composition home). The success `run` branch
in `gradeRepoAction` applies it to `result.run.results[0]` when
`branchMergeCheck.status === "not-merged"` (and optionally an uncertainty line on
`unknown`).

### 4.5 The zero factory

`buildRepoNoSubmissionResult({ student, folder, note })` in `grade-zeros.ts`
returns ONE `GradeResult` (not a `GradingRunEntry` - `gradeRepoAction` wraps it in
a `run` like its embedded/LLM branches do, `github-repos.ts:891-892,901-902`):
`totalScore:"0"`, `determination:"no-submission"`, `rubricAreas:[]`,
`submittedFiles:[]`, `mergedFileCount:0`, `strengths` = the folder-absence fact,
`improvements` = resubmission guidance, `resubmitNotice = RESUBMIT_NOTICE`,
`overallComment = composeOverallComment(...)`, `feedback = formatFeedback(...)`.
Reuses `composeOverallComment`/`RESUBMIT_NOTICE`/`formatFeedback` from the barrel
(the same helpers `buildZeroGradingEntry` uses, `grade-zeros.ts:6`). Repo-specific
wording (it CAN name the branch scan), distinct from the Canvas deadline wording -
consistent with `grade-zeros.ts:53-57`'s own note that its wording is deliberately
generic.

---

## 5. GAP 2: run the scan on a normal grade, against the default branch

Change `github-repos.ts:844` from `if (targetBranch)` to always run the
success-path scan, fetching the graded tree with the effective ref:
`getRepoTreeWithMeta(owner, repo, targetBranch)` already resolves to the DEFAULT
branch when `targetBranch` is `undefined` (`github.files.ts:35`:
`ref && ref.trim() ? ref.trim() : (await getRepo(...)).defaultBranch`), and the
scan internally excludes `explicitBranch || listed.defaultBranch`
(`repo-grade-branch-scan.ts:283`). So dropping the gate is sufficient; no new
branch-resolution logic. `classifyBranchMergeCheck` is then called with the
effective branch name and `targetWasExplicit = targetBranch !== undefined`.

### 5.1 Reliability reconciliation (RES-4), measured bounds

The scan now runs on **every graded repo**. Added GitHub calls per graded repo:
`getRepoTreeWithMeta(default)` = `getRepo` + 1 tree = 2; `listBranches` = 2
(`repo-grade-branch-scan.ts` header, `getRepo` + 1 page); up to
`MAX_BRANCHES_SCANNED = 10` branch-tree fetches (`repo-grade-branch-scan.ts:62`).
Worst case ~14 calls/repo; a real course repo has a handful of branches, so
typically ~6-7. GitHub authenticated budget is 5000/hr - not the bind.

The bind is Vercel's 60s per invocation (MEMORY: deployment-vercel-hobby):
- **Per-cell** and **bulk**: each `gradeRepoAction` is its own server-action
  invocation over ONE repo (ingest + grade + a few branch trees) - far under 60s.
  Bulk fans out at `BULK_GRADE_CONCURRENCY = 3` (`repoGradesBulkGrade.ts:143`); the
  scan's own internal concurrency is `DEFAULT_TREE_SCAN_CONCURRENCY = 5`.
- **Unattended workflow**: many repos in ONE invocation, already bounded by
  `repoGradingStopAt` (`steps.grading-repos.grade-repo.ts:77-79`, deadline - 8s)
  and reporting `notReached`. The extra per-repo scan reduces repos-per-tick but
  is deadline-safe and reported - no 60s breach.

The `MAX_BRANCHES_SCANNED = 10` cap IS the cost bound and already reports
`branchesSkipped` (`github-repos.ts:814-818`). **No 60s risk for any single repo.**

---

## 6. FORKS, each with the recommended reading acted on

- **FORK A - score value.** RECOMMEND bare `"0"` + `determination:"no-submission"`
  (section 4.1). Reject `"0/N"` (no N without building a rubric - extra surface,
  and the GUARANTEED leverage wants no model call). Reject a marker STRING (G1a:
  six sites parse the first number). ACTED ON in 4.1.
- **FORK B - no-target wording / behaviour.** The brief's premise (scan needs a
  typed target) is FALSE on the no-submission path (1.4). RECOMMEND: treat
  `scan.kind==="not-found"` as genuinely-absent and grade the `0` REGARDLESS of a
  typed target; word the note "the default branch `<main>`" when not explicit
  (4.3). ACTED ON.
- **FORK C - UNKNOWN (undetermined scan).** RECOMMEND: do NOT auto-zero a
  graded-ref-empty repo when `scan.kind==="undetermined"`; keep today's ungraded
  `{ noSubmission:true }` with the honest "other branches could not be checked"
  caveat (`github-repos.ts:807-813`, G3d, and section 8's "a 0 is a real grade").
  A success-path grade with real content + `unknown` keeps its real grade and may
  carry a one-line uncertainty note. Rationale: the owner's condition is
  conjunctive ("genuinely no submission AND no branch out there"); zeroing on
  UNCONFIRMED absence risks a false zero on work sitting on an unscanned/404/
  rate-limited branch. ACTED ON (unknown -> ungraded, residual RES-1).
- **FORK D - not-merged, graded ref EMPTY: zero or leave ungraded?** RECOMMEND
  graded `0` + branch-naming comment (coordinator (b) "graded per whatever is on
  the graded ref (likely nothing)"; G3 "still counts as not submitting, still 0").
  This does NOT conflict with the original brief's "not-merged must not be zeroed":
  that clause is honored as "not-merged must not be given the ABSENT-EVERYWHERE
  treatment" - it keeps its own branch-naming comment (b), distinct from (c). The
  SUCCESS-path not-merged (real content on `main`) is NOT zeroed - it keeps its
  real grade + an appended note. ACTED ON.
- **FORK E - change an existing row vs create one.** From the tree (1.1): there is
  NO row today (cell ungraded, workflow `continue`, bulk score ""). This CREATES a
  graded row where there is none, via the server route (section 3). ACTED ON.
- **FORK F - scan always vs scan-only-on-typed-target (GAP 2).** RECOMMEND
  scan-always against the default branch (section 5), bounded by the existing
  10-branch cap; it is 60s-safe per repo. A default-ON per-run toggle
  (`ta-repo-grades-scan-branches`, absent reads true, mirroring
  `applyNamingDeduction` at `repoGradesUiState.ts:180,259`) is an OPTIONAL cost
  escape hatch - filed as RES-2, NOT in the core waves, to avoid churning
  `gradeRepoAction`'s pinned argument arity
  (`repoGradesRubricPicker.wiring.test.ts`). ACTED ON (always-on core; toggle
  residual).

---

## 7. WRITE SET, WAVES, line counts

Line counts, `@(Get-Content <f>).Count` (PowerShell), 2026-10-12:

```
943  src/app/actions/github-repos.ts
121  src/lib/grade-zeros.ts
 60  src/lib/repo-grade-merge-check.ts
536  src/lib/workflows/registry/steps.grading-repos.grade-repo.ts
451  src/lib/workflows/registry/steps.grading-repos.helpers.ts
646  src/app/components/repo-grades/useRepoGradesGradingActions.ts
455  src/app/components/repo-grades/useRepoGradesBulkGrade.ts
```

**1000-cap caution (`src/file-size-ceiling.structure.test.ts`, LIMIT=1000):**
`github-repos.ts` is at **943**. The GAP-1/GAP-2/zero-return changes add an
estimated 20-40 lines; the plan seat MUST re-measure post-change with
`@(Get-Content).Count` and, if it crosses ~985, extract the no-submission branch's
body into a helper (e.g. the zero/note assembly moved to `grade-zeros.ts`), rather
than raising any ceiling. No other file is near the cap.

**Wave 1 (pure, structure) - the classifier contract + comment helpers:**
- `src/lib/repo-grade-merge-check.ts`: `BranchMergeCheck` carries `gradedBranch`
  (effective name) and `targetWasExplicit:boolean`; `classifyBranchMergeCheck`
  sets them; `describeBranchMergeNote` words the note per `targetWasExplicit`
  (4.3). Type-only + pure - no caller needed in this wave is a VIOLATION of the
  "every wave includes the caller" rule UNLESS this is folded into Wave 2 (it has
  no runtime caller of its own). RECOMMEND folding Wave 1 into Wave 2 (one wave),
  since the classifier change has no independent caller.
- `src/lib/grade-zeros.ts`: `buildRepoNoSubmissionResult` (4.5) +
  `appendBranchNoteToResult` (4.4) + repo comment constants.

**Wave 2 (server behaviour) - `gradeRepoAction`:**
- No-submission path: build `branchMergeCheck` ALWAYS (not only when target set);
  on `not-found` (absent everywhere) and `found` (not-merged, ref empty) return a
  graded `run` via `buildRepoNoSubmissionResult` with `describeBranchMergeNote`
  folded into its comment, carrying `branchMergeCheck`; on `undetermined` keep
  `{ noSubmission:true }` (FORK C).
- Success path: drop `if (targetBranch)` (GAP 2); on `not-merged` apply
  `appendBranchNoteToResult`; always carry `branchMergeCheck`.
- Its caller is reached by the existing per-cell/bulk/workflow success paths - no
  client production change needed (3).

**Wave 3 (workflow diagnostics nuance) - optional, same commit as Wave 2 or a
follow-up:** `gradeOrgRepos` (`steps.grading-repos.grade-repo.ts`) and
`gradeTileRepos` (`steps.grading-repos.helpers.ts`): when the success-path result
carries `determination==="no-submission"`, log `buildRepoGradingLogEntry` with
`outcome:"no-submission"` (preserving the report nuance) while still pushing the
`0` result into `results`. Without this the log reads `graded - 0` (the fact still
survives on the persisted `determination`); with it the unattended report keeps
its no-submission accounting. RECOMMEND include (honest diagnostics rep, section
9); small edit.

**Tests (test-author seat; the set below is a FLOOR, re-derive with the command
in section 10):** the frozen oracle for `buildRepoNoSubmissionResult` /
`appendBranchNoteToResult`; `repo-grade-merge-check.test.ts` (oracle, now with
`gradedBranch`/`targetWasExplicit`); `github-repos.grading.test.ts`,
`github-repos.grading.unmerged-branch.test.ts`,
`github-repos.branch-merge-check.test.ts` (server behaviour); the repo-grades
wiring/bulk tests and the workflow step tests that ADOPT the old `noSubmission`
behaviour.

**Client hooks are NOT in the production write set** (`useRepoGradesGradingActions
.ts`, `useRepoGradesBulkGrade.ts`): their success paths already copy comment +
score and set the badge from `branchMergeCheck` (3). Their `"noSubmission" in
result` branch still fires for the `unknown` case only. Confirm at Verify that
neither needs an edit; if the owner later wants the toggle (RES-2) they re-enter.

---

## 8. ACCEPTANCE CRITERIA (object / instrument / direction of failure)

All GitHub calls MOCKED (`BranchScanFetchers` injection,
`repo-grade-branch-scan.ts:125-128`; `canvasFetch`/`ghJson` never hit the network,
MEMORY: tests-are-network-blocked). No component renders (this-repo.md section 6)
- every assertion below is on a pure function or a server-action return, never on
rendered markup.

- **AC1 - genuinely absent -> graded zero + comment.** Object: `gradeRepoAction`
  return for an empty graded-ref folder with `scan.kind==="not-found"`.
  Instrument: the action's return + `buildRepoNoSubmissionResult`. FAIL if the
  return is `{ noSubmission:true }` (no `run`), or `run.results[0].totalScore !==
  "0"`, or `determination !== "no-submission"`, or `overallComment` does not state
  no submission was found anywhere.
- **AC2 - not-merged (ref empty: module on branch X, absent from main) -> a
  COMMENT, not just a badge.** Object: the same return. Instrument: the action's
  return. FAIL if `run.results[0].overallComment` does not NAME branch X and say
  it was not merged into the graded ref, or `branchMergeCheck.status !==
  "not-merged"` (badge still set), or the comment is identical to AC1's
  absent-everywhere wording (b must differ from c).
- **AC3 - the scan runs WITHOUT a typed target.** Object: `gradeRepoAction(repo,
  ..., branch=undefined, folder)` on the success path (graded ref has content) for
  a repo whose mocked `listBranches` returns a branch carrying a path the graded
  tree lacks. Instrument: the injected fetchers' call record + the return. FAIL if
  `branchMergeCheck` is `undefined` (scan did not run) or `status !== "not-merged"`
  or the real grade's `overallComment` lacks the appended branch note.
- **AC4 - not-merged on a PRESENT module is NOT zeroed.** Object: success-path
  return with real graded-ref content + `scan.kind==="found"`. Instrument: return.
  FAIL if `totalScore === "0"` or `determination === "no-submission"` (it must keep
  its real grade) - direction opposite to AC1.
- **AC5 - unknown is not zeroed (FORK C).** Object: empty graded-ref +
  `scan.kind==="undetermined"`. Instrument: return. FAIL if a `run` with a `0` is
  returned; it must stay `{ noSubmission:true }` with the uncertainty caveat.
- **AC6 - reliability call-count pin (RES-4).** Object: the injected
  `BranchScanFetchers` call counts for one success-path grade with no typed target
  over a repo with B branches. Instrument: counting mock. FAIL if `fetchTree` is
  called more than `min(B-1, MAX_BRANCHES_SCANNED)` times, or `listBranches` more
  than once, i.e. the per-repo GitHub-call budget is exceeded.
- **AC7 - no-target wording does not over-claim.** Object:
  `describeBranchMergeNote` with `targetWasExplicit:false`. Instrument:
  `repo-grade-merge-check.test.ts` oracle. FAIL if the sentence says "the branch
  you set as the target" when no target was explicit.
- **AC8 - removal test (leverage, section 9).** Object: `gradeRepoAction` on a
  genuinely-absent input. Instrument: a unit test asserting `run.results[0]`
  exists with `totalScore==="0"` AND that NO model call was made (no `gradeEntries`
  / `generateRubric` on this path). Deletion that removes the advantage: revert the
  no-submission branch to `{ noSubmission:true }` -> `"run" in result` is false ->
  the assertion flips RED.

---

## 9. Leverage + diagnostics representation

**Leverage claim (AC seat writes the final one).** Class **GUARANTEED**
(`docs/loop/leverage.md:44`): a genuinely-absent submission is scored `0` with a
reason, deterministically and with NO model call - a chat, handed an empty folder,
produces prose and can award full marks (the measured G0-1 failure,
`no-submission-...-criteria.md:30-37`). The app GUARANTEES the `0`-with-reason by
construction. Removal test = AC8 (buildable at the server level; it does not
depend on a rendered component, so it is a real removal test, not a "chat could
not do this" tautology).

**Diagnostics representation (DEV_LOOP rule).** The feature's diagnostic is the
`determination:"no-submission"` field on the produced GradeResult (observable in
the saved draft and persisted run) plus the workflow log entry recording the
graded repo as a no-submission outcome (Wave 3). The failure it makes visible: a
repo graded `0` for absence is distinguishable from a repo graded `0` by the
model, everywhere downstream, without parsing prose.

---

## 10. `owns` file list, derived with a stated command

Derivation command (Bash tool, repo root, 2026-10-12), output pasted:

```
grep -rln "noSubmission" src --include=*.ts | grep -v '\.test\.ts$'   # consumers
grep -rln "noSubmission" src --include=*.test.ts                      # adopters
grep -rln "buildZeroGradingEntry" src --include=*.ts                  # zero home
```

Non-test consumers of the `noSubmission` sentinel (behaviour changes for these):
```
src/app/actions/github-repos.ts            <- EDITED (Wave 2)
src/app/actions/github.ts                  <- NOT edited (separate chat/GithubGradingPanel path, G0-1; RES-3)
src/app/components/repo-grades/repoGradesBulkGrade.ts         <- read as source by tests; not edited
src/app/components/repo-grades/useRepoGradesBulkGrade.ts      <- behaviour changes via server; likely NOT edited
src/app/components/repo-grades/useRepoGradesGradingActions.ts <- behaviour changes via server; likely NOT edited
src/lib/github-grading-run-store.ts        <- persists determination (already); not edited
src/lib/repo-grading-log.ts                <- "no-submission" log kind (already); not edited
src/lib/workflows/registry/steps.grading-repos.grade-repo.ts <- EDITED (Wave 3)
src/lib/workflows/registry/steps.grading-repos.helpers.ts    <- EDITED (Wave 3)
src/lib/workflows/registry/steps.grading-repos.ts            <- re-exports; not edited
src/app/components/drafted-grades/repoGradingLogPanel.helpers.ts <- reads log kinds; not edited
src/app/components/grading-recording/grading-extraction-prompt.ts <- unrelated noSubmission string; not edited
src/app/actions/grading-submission-extract.ts               <- unrelated; not edited
```

Tests that READ the changed behaviour as source text or assert the old
`noSubmission` path (ADOPTED - must be re-pointed by the test-author; this is a
FLOOR, re-run the grep):
```
src/app/actions/github-repos.grading.test.ts
src/app/actions/github-repos.grading.unmerged-branch.test.ts
src/app/actions/github-repos.branch-merge-check.test.ts
src/app/components/repo-grades/repoGrades.wiring.test.ts
src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts
src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts
src/lib/workflows/registry/steps.grading-repos.grade-repo.test.ts
src/lib/github-grading-run-store.test.ts
src/lib/grade-result-allowlist-coverage.test.ts   <- determination sentinel; verify unchanged
src/lib/repo-grading-log.test.ts
src/lib/repo-grade-merge-check.test.ts            <- oracle, EDITED (gradedBranch/targetWasExplicit)
src/lib/grade-zeros.test.ts                       <- new-factory oracle lands here or a sibling
```

Gate for any wave: `npm run test:paths <p1> <p2> ...` (never a raw multi-path
`vitest`, MEMORY: test-paths-wrapper), plus
`src/file-size-ceiling.structure.test.ts` UNCONDITIONALLY (this-repo.md section 1).

## 11. Reuse list (symbol, file:line, what it gives us), half opened

- `composeOverallComment` `grade/types.ts:28-37` - the ONE comment composer (G2a).
- `RESUBMIT_NOTICE` `grade/types.ts:15-16`; `formatFeedback` via the barrel
  (`grade-zeros.ts:6`) - identical composition every producer uses.
- `describeBranchMergeNote` `repo-grade-merge-check.ts:49-60` - distinct per-status
  sentence; extended for `targetWasExplicit`.
- `classifyBranchMergeCheck` `repo-grade-merge-check.ts:22-45` - the 4-way typed
  outcome; extended to carry `gradedBranch`/`targetWasExplicit`.
- `scanBranchesForUnmergedSubmission` `repo-grade-branch-scan.ts:258` - unchanged;
  already resolves the default branch and bounds at `MAX_BRANCHES_SCANNED`.
- `getRepoTreeWithMeta` `github.files.ts:33-43` - defaults to the default branch
  when `ref` is blank (verified), so GAP 2 needs no new resolution.
- `resolvePostScore` `repoGradePostScore.ts:54-84` - confirms bare `"0"` posts as 0.
- `GradeDetermination` + its allowlist membership `grade/types.ts:79-103` - the
  field already exists and is already validated/persisted; no new field.
- Do NOT reuse `buildZeroGradingEntry` directly - it returns a Canvas-shaped
  `GradingRunEntry` keyed on `nonSubmitters` with Canvas userIds
  (`grade-zeros.ts:34-42`), the wrong shape for one repo with no `pointsPossible`.
  Reuse its COMPOSITION home (same module) instead (G0-2).

## 12. What cannot be verified here; residual register

Cannot be verified in this environment (this-repo.md section 6, state not fill):
real GitHub responses (branch trees, 404/409/rate-limit) - only mocked; whether a
posted `0` actually reaches the live Canvas gradebook; the cell badge + comment
RENDERING (no component renders under vitest); real per-repo wall-clock on Vercel.

Residual register (owner / instrument / step; absent any one = a deletion):

- **RES-1 (FORK C): `unknown` repos stay ungraded.** Owner: repo owner (product
  call - zero-on-uncertainty is riskier than leave-ungraded). Instrument: AC5.
  Step: Verify of Wave 2. Backlog row required.
- **RES-2 (FORK F): optional default-ON scan toggle.** Owner: repo owner (cost
  escape hatch for very large orgs). Instrument: a `ta-repo-grades-scan-branches`
  wiring test if built. Step: a follow-up wave if the owner hits cost. Backlog row.
- **RES-3: the chat GithubGradingPanel path (`gradeReposAction`, `github.ts:602`)
  never got the no-submission branch at all (G0-1).** A separate surface from the
  Repo Grades view this scope targets. Owner: orchestrator (scope decision - is it
  in the owner's "repo grader"?). Instrument: `grep -n noSubmission
  src/app/actions/github.ts`. Step: the next repo-grading chunk. Backlog row.
- **RES-4: the always-on scan's real cost is unmeasurable here** (no live GitHub).
  Owner: repo owner, on a live run. Instrument: AC6 pins the mocked call count;
  real latency is an owner walk on prod. Step: owner walk after ship.
- **RES-5: whether N disjoint branch findings + a 0 read coherently to a student
  is an owner walk** (no render here). Owner: repo owner. Instrument: none
  mechanical. Step: owner walk.

Every residual above must be filed in `docs/BACKLOG.md` under the repo-grading
area ("What it costs an instructor to get from rubric to graded...") at disposal,
or it does not exist (iteration-caps Residual rule).
