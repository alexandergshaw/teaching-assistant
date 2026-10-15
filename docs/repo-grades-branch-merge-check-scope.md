# Scope: Repo-grades target-branch merge check (REPO-GRADES-BRANCH-MERGE-CHECK)

Owner request 2026-10-11, verbatim: "for the repo grading view, add a control
that lets me specify which branch students' changes should have been merged to,
add in a detection for that, and if changes have not been merged to it, then add
a note in the comments and score appropriately."

Backlog row: `docs/BACKLOG.md:245` (REPO-GRADES-BRANCH-MERGE-CHECK, actionable,
filed this session). This is the scope that row names.

This is a SCOPE artifact. It writes no production code. A `loop-checker` reads it
before any build wave. House rules observed: ASCII only, no emojis; the 1000-line
ceiling; vitest is node-env and network-blocked (mock the GitHub client, never
`fetch`); fixtures match the real GitHub API response shape.

---

## 0. The load-bearing finding: most of the DETECTION already ships

Brief from the tree, not from the request. Grepping before asserting either
direction (the more expensive direction here has been "X does not exist"):

**The unmerged-branch detection and the non-accusatory comment ALREADY EXIST**
and are wired into `gradeRepoAction`'s no-submission path. Do not re-build them.

- `src/lib/repo-grade-branch-scan.ts:245` `scanBranchesForUnmergedSubmission(...)`
  - a pure, network-free, injected-fetcher scan that, for a repo whose graded
  branch has no student-authored content under the scoped folder, checks the
  repo's OTHER branches for the same folder and returns a 3-way
  `BranchScanResult` (`:138-168`): `found` (names the branch), `not-found`
  (checked cleanly, nothing anywhere), `undetermined` (404 / 409-empty /
  truncated-tree / rate-limit - never collapsed into a confident negative,
  `:31-39`). Branch cap `MAX_BRANCHES_SCANNED = 10` (`:62`) with `branchesSkipped`
  always reported (`:146,154,167`).
- `src/app/actions/github-repos.ts:766-805` - `gradeRepoAction` already CALLS
  that scan on its no-submission branch (`:752` guard `gradableFiles.length === 0`),
  sets `determination = "no-submission-unmerged-branch"` on a `found`
  (`:789`), and writes a non-accusatory comment naming the branch
  (`:790`: `... "<branch>", which was never merged into the graded branch ...`).
  The accusatory-word ban is pinned by
  `src/app/actions/github-repos.grading.unmerged-branch.test.ts:116-118`.
- `src/lib/grade/types.ts:79` - `GradeDetermination =
  "no-submission" | "no-submission-unmerged-branch"`, a closed union with a
  compile-enforced membership record (`:92-95`) and a coercer (`:121`).

So the request's phrases map onto the tree as follows:

| Owner phrase | Tree state today |
|---|---|
| "add in a detection" | EXISTS: `scanBranchesForUnmergedSubmission` + its wiring |
| "add a note in the comments" | EXISTS: `github-repos.ts:790` reason text, non-accusatory |
| "specify which branch ... should have been merged to" | MISSING: no instructor control; the view hardcodes the graded branch |
| "score appropriately" | PARTIAL / a product decision: today not-merged == no-submission == NO score |
| diagnostic representation of the check | MISSING: the grading diagnostic records only failure-shape classes, not a merge outcome |

**The genuinely new work is therefore small and well-bounded:** a persisted
target-branch CONTROL and its wiring, a first-class (typed, not string-parsed)
merge-check OUTCOME surfaced out of the action, a DIAGNOSTIC entry for it, and a
single product decision on scoring. The heavy, risky GitHub data path is REUSE,
which is the honest reason this feature is low-risk.

### Why "specify the branch" is missing, measured

The view grades whatever `gradeRepoAction`'s 5th positional parameter `branch`
(`github-repos.ts:657`) is. Both of the view's two call sites pass `undefined`:

- `src/app/components/repo-grades/useRepoGradesGradingActions.ts:274` (per-cell
  "Grade", the 5th arg in the `:269-278` call is `undefined`).
- `src/app/components/repo-grades/useRepoGradesBulkGrade.ts:269` ("Grade all",
  the 5th arg in the `:264-273` call is `undefined`).

`undefined` resolves to the repo's default branch inside `ingestRepo` / the scan
(`repo-grade-branch-scan.ts:270` `gradedBranch = explicitBranch || listed.defaultBranch`).
So today the "target branch" is implicitly each repo's default branch, with no
instructor say and nothing on screen stating which branch was graded.

Command that established the two call sites and their 5th arg:
`grep -n "gradeRepoAction(" src/app/components/repo-grades/*.ts` then reading
each call's 5th positional argument (both are `undefined`).

---

## 1. Leverage claim (DEV_LOOP "The loop / Criteria")

**Class: GUARANTEED, compounded with SCALE and ATTRIBUTION.** This feature reads
each student repo's real branch state from GitHub through an authenticated,
server-side call (`scanBranchesForUnmergedSubmission` over `listBranches` +
`getRepoTreeWithMeta`, `github-repos.ts:766-778`) and produces a STRUCTURAL
determination - the student's work is, or is not, present on the instructor's
designated target branch, or the check could not be completed - that the app
attaches to the right repo by construction and holds the target branch constant
across every repo in the run (SCALE: the one target-branch value drives every
`gradeRepoAction` call in the column, `useRepoGrades*`).

What the instructor does instead today: opens each student's repo on GitHub,
eyeballs whether the work landed on `main` or is stranded on an unmerged feature
branch, and types that observation into a comment by hand - per repo, with no
record that the check was even performed.

Why a chat cannot do this: a chat has no authenticated read of a student's
GitHub branch graph; it cannot distinguish "submitted on main" from "submitted on
an unmerged branch" from "submitted nothing", and nothing downstream of its prose
can tell a verified branch fact from a plausible-sounding guess.

**Removal test (one acceptance criterion, the test seat owns the oracle):** the
not-merged determination must disappear if the branch read is removed. Concretely:
delete the `scanBranchesForUnmergedSubmission` call at `github-repos.ts:766` (or
stub its fetchers to a no-op) and the merge-check outcome for a repo whose target
branch is empty but whose work sits on another branch flips from `not-merged`
(naming the branch) to `no-submission` (naming nothing). This is a pure/wiring
assertion over the classifier of AC-5, NOT a render - see AC-9 and section 6.
It is buildable here because the advantage is a typed data fact, not clicks or
latency.

---

## 2. The control (part 1 of 3)

### 2.1 What it is

One run-level, per-course target-branch text input: the branch the instructor
says students' changes should have been merged to (e.g. `main`). Recommended and
chosen reading, per the owner's "simplest that meets the ask" steer and the
`prefer-most-extensive-scope` memory read against actual need: **a SINGLE
run-level target branch per course, not per-assignment.** Justification: the
request is singular ("which branch"), every existing grading control in this view
is a single global/per-course value rather than per-column (README flag, bulk
scope, run-code flag - `repoGradesUiState.ts:68,74,90`), and a per-assignment
target branch would let two columns of one run disagree about the target with no
way to see it from the grid (the exact failure the run-code flag's comment warns
about, `repoGradesUiState.ts:85-89`). Per-assignment is recorded as a withdrawn
alternative in the residual register (section 8), not silently dropped.

Empty is the default and means "unchanged from today": pass `undefined` as the
branch, grade the default branch, no merge determination surfaced beyond what G3
already does. A non-empty value is the target branch.

### 2.2 Persistence (standing rule: persist-ui-control-state)

A new `ta-` key in `repoGradesUiState.ts`, stored PER COURSE (one course's target
branch means nothing to another), mirroring `FOLDER_KEY`'s per-course
string-by-course shape exactly (`repoGradesUiState.ts:389-429`
`parseFolderByCourse` / `loadFolderSelection` / `persistFolderSelection`):

- Key literal: `const TARGET_BRANCH_KEY = "ta-repo-grades-target-branch";`
- Stored blob: `Record<courseId, string>` (same parser shape as `FOLDER_KEY`).
- `loadTargetBranch(courseId): string` / `persistTargetBranch(courseId, value)`
  - `typeof window` guarded, blank-courseId no-op, best-effort try/catch, exactly
  like the folder pair. Default `""`.
- Value stored verbatim (a raw branch name); normalization (trim) happens at the
  call boundary, not in storage, matching how the folder value is stored raw and
  interpreted by a separate module.

Do NOT fold this into `RepoGradesUiState` / `persistRepoGradesUiState`'s flat
blob unless the build wave finds that cheaper; the per-course keyed shape is
required because this value is course-scoped (a branch convention can differ by
course), and the flat blob is for course-INDEPENDENT controls. (If the build
instead adds it to the flat `RepoGradesUiState`, it must be course-reset the same
way `courseId` switching clears other per-course state - that is strictly more
wiring, so the per-course keyed pair is recommended.)

### 2.3 Placement - COORDINATE, do not collide

Target placement is the sticky working header
(`RepoGradesStickyHeader.tsx:52-69`, the `.stickyWorkingHeader` div), consistent
with the in-flight consolidation (see section 7). The header already takes
injected control nodes as props (`gradeSetControl?: ReactNode`,
`RepoGradesStickyHeader.tsx:24`, rendered `:56`), and the MODULE-PICKER-HEADER item is adding
a second (`folderControl?: ReactNode`,
`docs/repo-grades-module-picker-header-scope.md:189-190`). The target-branch
control follows the SAME node-prop idiom: a `targetBranchControl?: ReactNode`
prop built in `index.tsx` and threaded into the header. **This placement makes
the build serialize after the two header items (section 7); it does not change
the control's design.**

The control is a `<label>` + text `<input>` using the header's existing
`.headerField` / `.headerInputLabel` / `.headerInput` classes
(`RepoGradesStickyHeader.tsx:57-67`, the search box's own classes) so no new
styling is invented. Label copy: "Target branch (merged to)"; placeholder:
`main`; `aria-label` naming it. No keyboard handler is added, so the MUI
`slotProps` hazard and the `useRecorder` `r`/`p`/`m` collision do not apply (plain
`<input>`, no `onKeyDown`).

---

## 3. The detection (part 2 of 3) - the load-bearing data path

### 3.1 Operational definition of "changes merged to branch X"

**Recommended and chosen operational definition:** the target branch X is the
branch that gets GRADED. "The student's changes were merged to X" means
"gradable, non-scaffolding student content exists under the scoped folder on
branch X." This is determined by the EXISTING grading read (if a grade is
produced from X, the work is on X), and its negative is determined by the
EXISTING `scanBranchesForUnmergedSubmission` on the no-submission path.

Why this definition and not the GitHub compare/ancestor API or the merged-PR API:

- **Compare API (`/repos/{o}/{r}/compare/{base}...{head}` -> `ahead_by` /
  `status`) or an ancestor check:** more precise about "merged" in the git sense,
  but there is NO existing helper (`grep -rn "/compare/" src/lib` returns
  nothing; `github.branches.ts:32` has `listCommits` only). It also requires
  knowing the student's work-branch HEAD (the `head`), which is itself the thing
  the scan has to discover first, and it adds a new authenticated GitHub call
  whose path interpolates a branch name - a GITHUB-URL-TRAVERSAL surface
  (section 3.4). Deferred, recorded as a residual (section 8), because the owner's
  ask is satisfied by presence-on-the-target-branch and the compare API buys
  precision the request does not call for.
- **Merged-PR API (`listPullRequests`, `github.pulls.ts:40`):** a student can
  merge without a PR, or push to the target branch directly, so PR-presence has
  false negatives against the owner's actual question ("did the changes reach the
  branch"). Also a larger call (50 per page, closed+open). Deferred likewise.
- **Target-branch presence (chosen):** reuses `listBranches` +
  `getRepoTreeWithMeta` already injected at `github-repos.ts:772-776`, costs
  nothing new on the merged path (the grade read already proves presence), and on
  the empty-target path costs exactly what G3 already costs (`listBranches` = 2
  calls + one tree per OTHER branch, capped at 10; `repo-grade-branch-scan.ts:22-29`).

### 3.2 The 4-way outcome and where it is computed

Introduce a PURE classifier in a NEW leaf
`src/lib/repo-grade-merge-check.ts` (a plain `.ts`, so it is unit-testable - no
component is rendered by any test here, so logic must not live inline in a
`.tsx`, and `github-repos.ts` is already 881 lines and must not absorb it). Its
signature maps the facts the action already has to a typed outcome:

```
export type BranchMergeStatus = "merged" | "not-merged" | "no-submission" | "unknown";

export interface BranchMergeCheck {
  status: BranchMergeStatus;
  /** The instructor's designated target branch, echoed for the comment/diagnostic. */
  targetBranch: string;
  /** Set only when status === "not-merged": the OTHER branch the work was found on. */
  foundOnBranch?: string;
  /** Set only when status === "unknown": the honest reason the check could not complete. */
  undeterminedReason?: string;
}

/** PURE. No network. Maps (was the graded target branch gradable?) plus the
 *  no-submission branch-scan result to the one typed outcome. */
export function classifyBranchMergeCheck(args: {
  targetBranch: string;        // "" when the instructor set no target -> caller skips entirely
  gradedTargetHadSubmission: boolean;
  scan: BranchScanResult | null; // null when gradedTargetHadSubmission (scan never ran)
}): BranchMergeCheck;
```

Mapping (the frozen oracle, section 6.3). This is a TOTAL 4-way classification;
the owner refinement 2026-10-11 ("the github grader should distinguish a branch
being present but NOT merged, from NO branch being present, and grade
accordingly") is satisfied by `not-merged` and `no-submission` being DISTINCT
states with DISTINCT comment copy (section 4.1), not one state with a flag:

| Input | Output `status` | Owner's distinction |
|---|---|---|
| `gradedTargetHadSubmission === true` (`scan === null`) | `merged` (work is on the target branch) | merged |
| graded target empty, `scan.kind === "found"` | `not-merged`, `foundOnBranch = scan.branch` | BRANCH PRESENT but not merged to the target |
| graded target empty, `scan.kind === "not-found"` | `no-submission` (no branch anywhere holds the work) | NO branch present with the work |
| graded target empty, `scan.kind === "undetermined"` | `unknown`, `undeterminedReason = scan.reason` | could not determine |

The owner's two states map one-to-one onto the scan's own `found` vs `not-found`
kinds (`repo-grade-branch-scan.ts:138-168`) - the scan already yields them; the
new work is only to carry them forward as distinct TYPED states with distinct
notes and flags, never collapsing them. `merged` and `unknown` remain their own
states (a total 4-way). The oracle (6.3) pins a `found` fixture and a `not-found`
fixture to different `status` values AND different note text (section 4.1), so a
build that collapses the two fails.

This is the SURFACE between the detection and everything downstream, and the
surface is a layer: it is a typed field, never a substring a parser reads out of
the `reason` string (the repo has shipped the opposite failure - a fact smuggled
into a score string - and G1a in the existing tests exists to prevent exactly
that, `github-repos.grading.unmerged-branch.test.ts:96-99`).

**All three non-error returns carry it (NIT, required).** `gradeRepoAction` calls
`classifyBranchMergeCheck` and returns `branchMergeCheck?: BranchMergeCheck` on
ALL THREE of its non-error return branches when a non-empty (and validated -
section 3.4) `targetBranch` was passed: the no-submission return
(`github-repos.ts:805`), the embedded-engine success return (`:830`), and the
gemini/LLM success return (`:840`). Setting it only on the gemini path would ship
an embedded merged grade with no `branchMergeCheck` and nothing would fail - so
the section 6.2 wiring test covers the EMBEDDED merged path explicitly, not only
the gemini one. The field is absent (undefined) on every branch when the
instructor set no target, so today's callers and today's behavior are
byte-identical. The `null` scan input (merged path, no scan ran) maps to `merged`
by construction, keeping the classifier total.

The existing `determination` field and reason text are KEPT unchanged (handed
over, not withdrawn - section 8); `branchMergeCheck` is additive. The existing
`no-submission-unmerged-branch` determination and the `branchMergeCheck.status`
of `not-merged` describe the same fact from two fields; the build must set them
consistently (an acceptance criterion, AC-6) and a wiring test pins it.

### 3.3 The unknown / error partition (must not crash a run)

Every could-not-determine state is already partitioned per student by the scan
(`repo-grade-branch-scan.ts:31-39,164`) and surfaced as `unknown`, never a
confident `no-submission`. The action never throws on this path
(`github-repos.ts` wraps the whole body in try/catch, `:697`, returning
`{ error }`; the scan itself "never throws", `repo-grade-branch-scan.ts:242`).
The bulk path isolates per-repo failures already
(`useRepoGradesBulkGrade.ts:8,29-31`). No new crash surface is introduced; the
new classifier is pure and total (every `BranchScanResult.kind` is mapped; a
`null` scan maps to `merged`). AC-7 pins the never-crash partition.

### 3.4 Security - the validation plan (discharged here; the security pass confirmed and corrected it)

The target branch is INSTRUCTOR-controlled (typed by the app owner), not
student-controlled, which already lowers the threat relative to the student-URL
class. The security pass CORRECTED the specifics this scope first gave, and the
corrected plan below is the one the build implements.

**Where the value actually reaches GitHub (corrected).** The target branch does
NOT reach `listBranches` - that function takes no branch argument
(`github.repos.ts:155`). It reaches GitHub through `ingestRepo` (passed as its
4th `branch` arg, `github-repos.ts:701`), which calls:
- `getRepoTreeWithMeta(owner, repo, ref)` -> `encodeURIComponent(branch)` at
  `github.files.ts:37`, and
- `getFileText(owner, repo, path, ref)` -> `encodeURIComponent(ref)` at
  `github.files.ts:52`.
`encodeURIComponent` ALREADY neutralizes `../` and a leading `/` (both become
`%2F`), so the naive "reject `..`/leading-`/`" framing was wrong. The residual
hole, MEASURED: a bare `.` or `..` SEGMENT survives (`encodeURIComponent` leaves
dots untouched, and the WHATWG URL parser inside `fetch` then collapses the
dot-segment) - a branch of `..` yields
`.../git/trees/?recursive=1`, which escapes the `trees/` position and climbs one
level to `/repos/o/r/git/`, a wasted AUTHENTICATED 404. **LOW risk (a wasted call,
not a token leak), but validation is REQUIRED** so the bad state is
unrepresentable rather than merely improbable. Note `github.files.ts:33`
(`ref || (await getRepo).defaultBranch`) treats a whitespace-only `"  "` as
truthy, so a blank-but-present string must NEVER be forwarded - it would grade a
branch literally named with spaces.

**The fix - a NEW pure leaf `src/lib/github-ref-name.ts`** (a plain `.ts`, NOT a
`"use server"` file, so it can export sync helpers and be unit-tested; no
component renders here so this logic must live in a leaf):

- `normalizeTargetBranch(raw: string): { ok: true; branch: string } | { ok: false; error: string }`:
  trim; a blank/whitespace input returns `{ ok: true, branch: "" }` meaning
  UNSET (the caller forwards `undefined`, never a whitespace string); reject
  control chars, space, and `~ ^ : ? * [ \`; split on `/` and reject any segment
  that is empty, `.`, `..`, or starts with `.`; reject a value containing `..`,
  `@{`, a trailing `.`, a trailing `.lock`, or exactly `@`; ACCEPT internal `/`
  (`feature/x`, `release/v1.2`) and a literal `%` or `#` (do NOT reject `%2F` -
  it is a legal literal ref and encoding handles it). This mirrors git's own
  `check-ref-format` rules, narrowed to what a branch name can be.
- `encodeRefSegment(ref: string): string` = `encodeURIComponent` but throws (or
  returns an error) on `.`/`..` after trim - the belt-and-braces guard at the
  call boundary.

**Wire at TWO boundaries plus the control:**
- **Layer A (the all-callers boundary):** `getRepoTreeWithMeta` and `getFileText`
  (`github.files.ts:37,52`) call `encodeRefSegment` instead of raw
  `encodeURIComponent`. This also covers the three workflow callers that reach
  these functions, not just the grading path.
- **Layer B (the action):** `gradeRepoAction`, as its FIRST step after
  `requireAppOwner()` (`github-repos.ts:698`), calls `normalizeTargetBranch` on
  the incoming target; on `{ ok: false }` it returns `{ error }` having made ZERO
  GitHub calls; on `{ ok: true }` it passes the trimmed value (or `undefined`
  when blank) into `ingestRepo` / the scan.
- **Layer C (the control, Wave 2):** the sticky-header input uses the SAME
  `normalizeTargetBranch` for inline UX validation only - it is not a security
  boundary (Layer B is), just an early "that is not a valid branch name" hint.

**Explicitly OUT of Wave 1 scope** (do NOT widen): the `parseRepoRef` owner/repo
traversal surface and the ~10 OTHER `encodeURIComponent(ref)` call sites across
`src/lib/github*.ts`. These are real but separate; filed as backlog row
PARSEREPOREF-TRAVERSAL plus a residual (section 8). Wave 1 hardens only the two
boundaries the target branch actually traverses.

### 3.5 Data / reliability (discharged here; reliability pass confirmed)

Rate limits and caller discipline: the merged path adds ZERO GitHub calls
(presence is proven by the grade read already performed). The empty-target path
adds exactly the existing G3 scan cost, already bounded
(`MAX_BRANCHES_SCANNED = 10`, one call per other branch, `branchesSkipped`
reported) and already gated to the no-submission branch only (G3a,
`repo-grade-branch-scan.ts:17-19`), so it never multiplies across a roster of
submitting students. `requireAppOwner()` already guards `gradeRepoAction`
(`github-repos.ts:698`). The build must confirm no second GitHub call is spent to
learn the target branch (the scan resolves it from its own `listBranches`,
`repo-grade-branch-scan.ts:41-47,270`); instrument I-3 asserts a rejected target
costs zero calls. No new call exists under the chosen reading - the compare/PR
readings (section 8 residual) would add one, and are deferred.

---

## 4. The grading integration (part 3 of 3)

### 4.1 The note in the comments - DISTINCT copy per state (owner refinement)

A branch-naming non-accusatory sentence already exists on the no-submission path
(`github-repos.ts:790`) and the view announces it
(`useRepoGradesGradingActions.ts:294` per-cell `setPostSummary`, and the bulk
path's `onAnnounce`). The owner refinement requires the TWO distinct states to
read differently, so the build produces DISTINCT note copy per
`branchMergeCheck.status`, each threading the instructor's target branch name:

- **`not-merged` (branch present, not merged):** names the found-on branch AND
  the target, e.g. `The work exists on the branch "feature-x", which was never
  merged into "main" (the branch you set as the target). Merging or re-pointing
  it to "main" would let it be graded.` (refines today's `:790` text to name the
  target rather than "the graded branch").
- **`no-submission` (no branch present with the work):** states that NO branch
  held submitted work, e.g. `No branch of this repository has submitted work for
  "main" (the branch you set as the target) - nothing was found on the target or
  any other branch checked.`
- **`unknown`:** the existing honest could-not-check caveat (`:796`), naming the
  target.
- **`merged`:** no added note (a normal grade; the merge is implicit in the
  grade existing).

All copy stays non-accusatory; the existing word-ban test
(`github-repos.grading.unmerged-branch.test.ts:116-118`) extends to every new
sentence. AC-4 pins that the two states produce DIFFERENT note text (not one
template with a slot), each naming the target branch, with the `not-merged` note
additionally naming the found-on branch - so a build that collapses them fails.

### 4.2 "Score appropriately" - THE OWNER FORK (terminating question)

Today the not-merged case is a no-submission outcome: NO score is produced
(`github-repos.ts:805` returns `{ noSubmission: true, ... }`, no `totalScore`
field; pinned by `github-repos.grading.unmerged-branch.test.ts:92,99`). "Score
appropriately" is a product decision on the penalty and is the OWNER's call. The
plan ACTS ON THE RECOMMENDED READING now; the fork rides alongside as a
terminating question (every answer ends the activity).

**Recommended reading, acted on in the plan: (A) note + instructor-visible flag,
no automatic score change.** Rationale: it is the safest (the instructor decides
the penalty, nothing silently changes a number they cannot see), it matches the
existing shipped G3 behavior exactly ("still counts as not submitting, but this
should be flagged in comments" - the owner's own earlier framing, cited in
`grade/types.ts:62-63`), and it needs no change to the score path - only the new
typed `branchMergeCheck` flag surfaced to the grid so the instructor sees
"Not merged to main (work on <branch>)" on the cell and acts. Under (A), "score
appropriately" = the work that is not on the target branch is treated as not
submitted on that branch (its current, defensible behavior), and the instructor
awards manual credit if they choose.

**The terminating fork put to the owner (each answer ends the activity):**

- **(A) Note + instructor-visible flag only, no automatic score change.**
  [RECOMMENDED - safest; matches shipped G3; no score-path change.] The build
  ships this reading. Cost if the owner wanted B or C instead: the score-path and
  one test are rewritten (small, localized to `github-repos.ts`'s no-submission
  branch and the grid cell).
- **(B) Note + an automatic deduction the owner configures.** Requires a new
  persisted "unmerged penalty" control and a score-path change that applies it;
  larger surface, a silent-number-change risk the instructor must be able to see.
- **(C) Note + score the merge criterion as failed in the rubric.** Requires the
  rubric to carry a merge criterion and the engine to fail it; couples this
  feature to rubric shape, the largest surface.

Framing for the owner, in their terms: "The tool can either just FLAG a repo
whose work was not merged to your target branch and leave the number to you (A),
or it can automatically DEDUCT points you configure (B), or score a merge item as
failed (C). I am shipping A - it changes no number you cannot see and matches how
the existing unmerged-branch note already behaves. If you want B or C, say which
and I will rewrite the score path; A ships either way and B/C replace it."

The question is shaped so EVERY answer terminates: A = done as built; B/C = the
build swaps the score path for the named one and ships. The answer is not a new
round.

---

## 5. Diagnostics representation (DEV_LOOP b907ff8e, owner 2026-10-11)

This feature ADDS a data path (the branch read) with real failure modes (branch
missing, API error, truncated listing). It therefore OWES a diagnostic. The
existing grading diagnostic seam
(`src/app/components/grading/gradingActionSeam.ts`) records only a failure CLASS
derived from result SHAPE (`classifyGradingActionResult:43`,
`GRADING_ACTION_FAILURE_CLASSES:25`) and treats a `noSubmission` result as a
success (it has no `error`/`failures`/`skipped`, so `classify` returns null,
`:43-52`). So a not-merged or unknown outcome is INVISIBLE in diagnostics today.

**The diagnostic to add (AC-8):** record the merge-check outcome per
`grade_repo` action as one of the fixed, text-free classes derived from
`branchMergeCheck.status` SHAPE (never its branch-name text - the seam's
NO-STUDENT-DATA rule, `gradingActionSeam.ts:10-14`): `merged`, `not-merged`,
`unknown`, or absent (no target set / today's behavior). Mechanism recommendation:
extend `GradingActionDecision` with an optional `mergeCheck?: BranchMergeStatus`
populated from the result shape the same way `classifyGradingActionResult`
reads shape, OR add a dedicated fixed-class field. The build chooses the minimal
extension; the AC requires only that the outcomes are distinguishable in the
diagnostic log and that NO branch name or repo path is recorded. Because
`branchMergeCheck` is set on ALL THREE non-error returns (section 3.2), the
diagnostic reads the SAME field regardless of engine - an embedded merged grade
and a gemini merged grade both record `merged`, and a `not-merged` outcome is
recorded whether it arose on the no-submission return or not. The failure it
makes visible: a run in which many repos come back `not-merged` or `unknown`
(a class forgot to merge their PRs, or GitHub was rate-limiting the scan) is
observable instead of silent.

A pure presentational change would be allowed to carry no diagnostic, but this is
a new data path, so the absence is NOT justified - the diagnostic is required.

---

## 6. Machine-checkable instruments

vitest here is node-env, collects only `src/**/*.test.ts`, renders no component,
and throws on real `fetch` (`vitest.setup.ts`). Every instrument below is a pure
function, a source-text pin, or a mocked-client wiring test. The real GitHub call
is owner-walk only.

Each gate that names two or more test files is written
`npm run test:paths <p1> <p2> ...` (never a raw multi-path `vitest` - it silently
drops unmatched args).

### 6.1 Pure merge-detection decision function (the primary instrument)

`src/lib/repo-grade-merge-check.test.ts` drives `classifyBranchMergeCheck`
(section 3.2) over FIXTURE inputs - `BranchScanResult` values and the
`gradedTargetHadSubmission` boolean - asserting the 4-way outcome against the
frozen oracle (6.3). No network, no mock needed (the function is pure and takes
the scan result as data). Object under comparison: the `BranchMergeCheck`
returned. Instrument: `classifyBranchMergeCheck`. Failure direction: any input
row whose returned `status` / `foundOnBranch` / `undeterminedReason` differs from
the frozen table fails.

- Single path, so `npx vitest run src/lib/repo-grade-merge-check.test.ts` is
  allowed (nothing to drop).

### 6.2 Wiring tests over the action and the view (mock the GitHub client)

`src/app/actions/github-repos.branch-merge-check.test.ts` - mirrors the mocking
posture of `github-repos.grading.unmerged-branch.test.ts` EXACTLY (mock
`@/lib/github`'s `listBranches` / `getRepoTreeWithMeta`, `@/lib/grade`,
`requireAppOwner`; `:17-56`), never `fetch`. Asserts:

- A non-empty `targetBranch` with gradable content on it returns
  `branchMergeCheck.status === "merged"` and `targetBranch` echoed, and a real
  grade is still produced (merged path unchanged) - asserted on BOTH the gemini
  success return AND the EMBEDDED success return (`provider: "embedded"`), since
  the field is set on all three non-error returns (section 3.2) and covering only
  gemini would miss an embedded merged grade shipping with no `branchMergeCheck`.
- An empty target branch with work on another branch returns
  `branchMergeCheck.status === "not-merged"`, `foundOnBranch` set, AND the
  existing `determination === "no-submission-unmerged-branch"` (AC-6: the two
  fields agree), AND the note names the found-on branch and the target.
- An empty target branch with NO work on any branch returns
  `branchMergeCheck.status === "no-submission"` with NO `foundOnBranch`, a
  DIFFERENT note from the not-merged case (AC-4), and `determination` unset - the
  distinct-states owner refinement, pinned as its own case so a collapse of
  not-merged and no-submission fails here.
- An undetermined scan returns `status === "unknown"` with
  `undeterminedReason`, and `determination` stays unset (the existing G3d rule).
- `targetBranch === ""` (no target set) returns `branchMergeCheck === undefined`
  - today's behavior byte-identical (removal-test-adjacent: proves the feature is
  opt-in).

### 6.2a Security instruments (the validator, Wave 1)

New file `src/lib/github-ref-name.test.ts` and
`src/lib/github.files.ref-traversal.test.ts`:

- **I-1 (pure validator table)** over `normalizeTargetBranch` / `encodeRefSegment`:
  REJECT `..`, `./`, `//`, `x/..`, `x/.`, `x/.lock` trailing, `a..b`, a leading
  `.` segment, `@{`, exactly `@`, a control char, a space; ACCEPT `feature/x`,
  `release/v1.2`, `a%2Fb`, `a#b`; NORMALIZE `"  main "` -> `main`; `""` and
  `"  "` -> `{ ok: true, branch: "" }` (unset). Object: the validator's return;
  failure direction: any row whose `ok`/`branch`/`error` differs.
- **I-2 (URL-level)** over `getRepoTreeWithMeta` with `vi.stubGlobal("fetch", ...)`
  and `GITHUB_TOKEN="t"` - mock `fetch` (and `getRepo`), NOT `@/lib/github` - and
  assert the request URL's `new URL(u).pathname` is the NORMALIZED path for a
  benign ref and that a `..` ref is REJECTED before any `fetch`. Do NOT assert
  `not.toContain("../")` - that is green on the `..` bug (the dot-segment is
  already collapsed by the URL parser), which is the exact false-pass the
  validator exists to prevent.
- **I-3 (action boundary)** over `gradeRepoAction`: a target of `".."` returns
  `{ error }` and makes ZERO GitHub calls (the mocked `listBranches` /
  `getRepoTreeWithMeta` / `ingestRepo` are never invoked).

Five sabotages the test seat must prove each kill: S1 drop the dot-reject in
`encodeRefSegment`; S2 pass the raw branch at `github.files.ts:37`; S3 drop the
`normalizeTargetBranch` call in the action; S4 make the validator reject ANY `/`
(over-rejection - `feature/x` must still pass); S5 drop the `.trim`.

Gate for the two-plus security files:
`npm run test:paths src/lib/github-ref-name.test.ts src/lib/github.files.ref-traversal.test.ts`.

`src/app/components/repo-grades/repoGrades.wiring.test.ts` (the existing
source-text guard file for this view) gains assertions that BOTH call sites pass
the target branch in the 5th positional slot (replacing the pinned `undefined`)
and that the target-branch control is rendered only from the header node, never
from an effect - the same source-reading idiom that file already uses
(`useRepoGradesGradingActions.ts:26-28` describes it).

Gate for the two-plus files:
`npm run test:paths src/lib/repo-grade-merge-check.test.ts src/app/actions/github-repos.branch-merge-check.test.ts src/app/components/repo-grades/repoGrades.wiring.test.ts`.

### 6.3 Frozen oracle for the detection decision

Hand-written literal table, never computed from the implementation (mirrors
`repo-grade-branch-scan.test.ts:8-10`'s own frozen-literal posture). Fixtures use
the SAME `BranchScanResult` shape the real scan emits (`repo-grade-branch-scan.ts:138-168`):

```
// target "main", gradable content on it:
{ in: { targetBranch: "main", gradedTargetHadSubmission: true,  scan: null },
  out: { status: "merged", targetBranch: "main" } }

// target "main" empty, work found on "feature-x":
{ in: { targetBranch: "main", gradedTargetHadSubmission: false,
        scan: { kind: "found", branch: "feature-x", branchesChecked: 1, branchesSkipped: 0 } },
  out: { status: "not-merged", targetBranch: "main", foundOnBranch: "feature-x" } }

// target "main" empty, nothing on any branch:
{ in: { targetBranch: "main", gradedTargetHadSubmission: false,
        scan: { kind: "not-found", branchesChecked: 2, branchesSkipped: 0 } },
  out: { status: "no-submission", targetBranch: "main" } }

// target "main" empty, scan could not determine:
{ in: { targetBranch: "main", gradedTargetHadSubmission: false,
        scan: { kind: "undetermined", reason: "a rate limit was hit", branchesChecked: 1, branchesSkipped: 0 } },
  out: { status: "unknown", targetBranch: "main", undeterminedReason: "a rate limit was hit" } }
```

The axes (the 4 `scan.kind` values + the boolean) come from
`repo-grade-branch-scan.ts`'s union, a DIFFERENT source than the oracle table
(the seat requirement that generator and expected table not share hardcoded
axes). Every row is killable by a mutation: swapping any output `status` to
another member fails exactly one row; dropping the `gradedTargetHadSubmission`
short-circuit makes the merged row fail.

**Division of labor for the distinct-states refinement.** The PURE classifier
produces only the distinct `status` (and `foundOnBranch`/`undeterminedReason`) -
the `found` row (`not-merged`) and the `not-found` row (`no-submission`) are
already different `status` values here, so collapsing them fails this oracle. The
distinct NOTE TEXT per state is composed in the ACTION (section 4.1), not in the
pure function, so the note-distinctness pin lives in the 6.2 action wiring test
(the `not-merged` case and the `no-submission` case assert different note
strings), not in this pure oracle. Both halves together satisfy the owner
refinement: distinct typed state (here) and distinct instructor-visible note
(6.2).

### 6.4 Source-text pins (threading and no-smuggle)

- The not-merged fact lives in a typed field, never in the score string: a pin
  asserts the no-submission return still has no `totalScore` key
  (extends `github-repos.grading.unmerged-branch.test.ts:99`) and that
  `branchMergeCheck` is a sibling field, not substring-encoded into `reason`.
- The new `ta-repo-grades-target-branch` key is covered by
  `repoGradesUiState.test.ts` (round-trip load/persist per course, stale-course
  isolation), mirroring the folder-selection tests.

### 6.5 Structural canaries the build must run in its wave gate

- `src/file-size-ceiling.structure.test.ts` UNCONDITIONALLY (walks all of `src/`;
  `github-repos.ts` is 881 and grows - keep the new classifier in its own leaf so
  it does not approach 1000). Measured sizes, `@(Get-Content <f>).Count`
  2026-10-11: `github-repos.ts` 881, `index.tsx` 828,
  `useRepoGradesGradingActions.ts` 624, `useRepoGradesBulkGrade.ts` 441,
  `RepoGradesStickyHeader.tsx` 73, `repoGradesUiState.ts` 590,
  `repo-grade-branch-scan.ts` 302, `grade/types.ts` 542, `gradingActionSeam.ts`
  117. None is pushed near 1000 by this feature's expected additions, but the
  gate runs regardless.
- If `grade/types.ts` gains a type (it should NOT need to - `BranchMergeStatus`
  belongs in the new `repo-grade-merge-check.ts` leaf, not the determination
  union), any `*.structure.test.ts` over grade types runs too. The recommended
  design adds NO member to `GradeDetermination` (the union stays closed at its
  two members); the new status is a separate type in a separate leaf.

---

## 7. Wave cut + sequencing / collision map

### 7.1 Write-set intersection against in-flight repo-grades work

The in-flight items and their write sets (from their scope docs, cited):

| Item | State | Touches (relevant to this feature) |
|---|---|---|
| REPO-GRADING-REMOVE-ACTIVITY-LOG | SHIPPED `cef512f0` | `index.tsx`, `useRepoGradesGradingActions.ts`, `repoGradesUiState.ts` (now landed - a baseline, not a live race) |
| REPO-GRADES-MODULE-PICKER-HEADER | checking now | `index.tsx`, `RepoGradesStickyHeader.tsx` (adds `folderControl?: ReactNode`), `RepoGradesControls.tsx` (`docs/repo-grades-module-picker-header-scope.md:189-195`) |
| REPO-GRADES-STATUS-PROMINENCE | checking now | `index.tsx`, `RepoGradesStickyHeader.tsx`; explicitly NOT the hooks (`docs/repo-grades-status-prominence-scope.md:181-199`) |
| repo-page overhaul | scoping | sticky header is the consolidation target |

This feature's write set, split by wave:

- **Wave 1 (server + detection + diagnostic + security validator) - file-DISJOINT
  from the header items:**
  - `src/lib/repo-grade-merge-check.ts` (NEW - pure classifier + types)
  - `src/lib/repo-grade-merge-check.test.ts` (NEW)
  - `src/lib/github-ref-name.ts` (NEW - `normalizeTargetBranch` /
    `encodeRefSegment`, section 3.4)
  - `src/lib/github-ref-name.test.ts` (NEW - I-1)
  - `src/lib/github.files.ts` (Layer A: `getRepoTreeWithMeta` + `getFileText`
    call `encodeRefSegment`, `:37,52`)
  - `src/lib/github.files.ref-traversal.test.ts` (NEW - I-2)
  - `src/app/actions/github-repos.ts` (Layer B: `normalizeTargetBranch` first
    step after `requireAppOwner()`; the `classifyBranchMergeCheck` call +
    `branchMergeCheck` on ALL THREE non-error returns, `:805,:830,:840`; thread
    the validated target branch into `ingestRepo` / the scan's `explicitBranch`)
  - `src/app/actions/github-repos.branch-merge-check.test.ts` (NEW - includes I-3)
  - `src/app/components/grading/gradingActionSeam.ts` (diagnostic extension) +
    its test
  - Intersection with the three header items: EMPTY (none of them touches
    `github.files.ts`, the two new lib leaves, `github-repos.ts`, or
    `gradingActionSeam.ts`). Confirm at build time with `git status --short` and
    the printed `sort | uniq -d` intersection.
- **Wave 2 (control + persistence + wiring) - COLLIDES on `index.tsx` and
  `RepoGradesStickyHeader.tsx`; MUST serialize after MODULE-PICKER-HEADER and
  STATUS-PROMINENCE land:**
  - `src/app/components/repo-grades/repoGradesUiState.ts` (new `ta-` key + pair)
  - `src/app/components/repo-grades/repoGradesUiState.test.ts`
  - `src/app/components/repo-grades/index.tsx` (state + persistence wiring +
    build the `targetBranchControl` node + pass target branch into both hooks'
    params)
  - `src/app/components/repo-grades/RepoGradesStickyHeader.tsx` (new
    `targetBranchControl?: ReactNode` prop + render slot)
  - `src/app/components/repo-grades/useRepoGradesGradingActions.ts` (5th arg)
  - `src/app/components/repo-grades/useRepoGradesBulkGrade.ts` (5th arg)
  - `src/app/components/repo-grades/repoGrades.wiring.test.ts`

### 7.2 The serialization order and why

1. Wave 1 is file-DISJOINT from the header items (it touches `github.files.ts`,
   `github-repos.ts`, two new lib leaves, and `gradingActionSeam.ts`, none of
   which any in-flight repo-grades item touches). But file-disjoint is not the
   same as concurrent here: Wave 1 SERIALIZES on the shared full-test / single
   `tsc` caller (`this-repo.md`: exactly one caller runs `tsc`; no two agents
   sabotage-verify on the tree at once), so **Wave 1 builds AFTER the
   module-picker build has committed**, not alongside it - even though their file
   sets do not intersect. (Prove file-disjointness at dispatch anyway:
   `git status --short` plus `sort`+`uniq -d` over Wave 1's file list against the
   two header scopes' file lists; empty intersection is the only pass.)
2. Wave 2 serializes AFTER both REPO-GRADES-MODULE-PICKER-HEADER and
   REPO-GRADES-STATUS-PROMINENCE have landed on main, because all three edit
   `RepoGradesStickyHeader.tsx` and `index.tsx`. Running Wave 2 concurrently with
   either would have one agent's edits revert the other's (the concurrency hazard
   this repo has shipped). After they land, re-cite Wave 2's line/anchor targets
   against the THEN-current `index.tsx` / `RepoGradesStickyHeader.tsx` (both will
   have moved), because the header items relocate the folder control into the
   header and change the surrounding line numbers.
3. Wave 2 depends on Wave 1 (it passes the target branch to an action that must
   already accept it and return `branchMergeCheck`), so even absent the header
   collision, Wave 1 precedes Wave 2.

### 7.3 Not trivially revertible

- `github-repos.ts`'s `gradeRepoAction` return SHAPE gains an optional field.
  Optional + absent-by-default = low blast radius, but it is a public action
  signature consumed by both hooks; the smallest safe revert is removing the
  field and the classifier call together.
- The new `ta-repo-grades-target-branch` localStorage key is a new persisted
  shape; reverting leaves orphaned keys in users' browsers (harmless, read-only,
  never resurrected into a non-existent control). State this to the data pass.

---

## 8. Residual register (owner / instrument / step each - or it is a deletion)

| Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|
| Compare-API / ancestor merge precision (git-sense "merged", not just presence on the branch) | build team, only if owner escalates | a new `/compare/{base}...{head}` helper + its pure classifier test | Deferred; NOT built under the chosen reading. Filed as backlog note under REPO-GRADES-BRANCH-MERGE-CHECK; a future row if the owner wants PR/compare precision. Protects nothing today (presence covers the ask). |
| Merged-PR detection (`listPullRequests`) | same | PR-merged-at fixture test | Deferred, same as above; false-negative-prone, named so it is not silently assumed covered. |
| Per-assignment target branch (withdrawn alternative to run-level) | owner | n/a | WITHDRAWN with reason (section 2.1): the request is singular, every sibling control is single-valued, per-column target invites silent cross-column disagreement. No enforcer removed (never existed). |
| Scoring policy B/C (automatic deduction / rubric-fail) | OWNER (the section 4.2 fork) | if chosen: a score-path wiring test | Ships as reading A; B/C are the owner's terminating answer, applied as transcription not a new round. |
| Security validation of the target-branch string before it reaches a GitHub call | Wave 1 build (`github-ref-name.ts` Layers A+B) | I-1 validator table, I-2 URL-level, I-3 action-boundary (section 6.2a); S1-S5 sabotages | DISCHARGED IN-PLAN (section 3.4). The delta-checker + the test seat confirm the five sabotages kill against the built diff; not a deferred pass. |
| `parseRepoRef` owner/repo traversal + the ~10 OTHER `encodeURIComponent(ref)` call sites in `src/lib/github*.ts` | build team | per-site encode guard + a URL-level test per site | DEFERRED, explicitly OUT of Wave 1 (section 3.4). Filed as backlog row PARSEREPOREF-TRAVERSAL. Real but separate; Wave 1 hardens only the two boundaries the target branch traverses, so widening it is scope creep. |
| Absent-target-branch edge: a target branch that does not exist in a given repo - does `ingestRepo` THROW (becoming `{ error }`) or return an empty digest (becoming no-submission)? | OWNER / Wave 1 build to confirm behavior | an action wiring test with `getRepoTreeWithMeta` rejecting a 404 for the target ref | Owner-walk to confirm the live GitHub behavior; the build must ensure a non-existent target branch resolves to a clear `unknown`/`{ error }`, NOT a false `no-submission`. Flagged so it is not assumed covered. |
| Rate-limit / no-extra-call discipline on the target-branch path | Wave 1 build + reliability reading-claim | I-3 call-count assertion (merged path adds 0 GitHub calls) | DISCHARGED IN-PLAN (section 3.5); confirmed against the built diff by the delta-checker. |
| Live GitHub behavior (real branch graph, real rate limits, real auth) | OWNER | owner-walk only | Cannot be verified here: no `.env`, no GITHUB_TOKEN, network blocked under vitest, no component rendered. Stated, not filled in. |

All residuals that are backlog-bound are recorded under REPO-GRADES-BRANCH-MERGE-CHECK
in `docs/BACKLOG.md` at disposal/push time; a residual not in the backlog does not
exist.

---

## 9. Acceptance criteria (embedded)

Each criterion names the object under comparison, the instrument, and the failure
direction. These are the owner's words made measurable; mechanism (section 3),
oracle construction (section 6.3), and invariant accounting live in their own
seats.

- **AC-1 (control exists + persists).** The repo-grades view shows a target-branch
  text control in the sticky working header, and its value survives a reload,
  per course. Instrument: `repoGradesUiState.test.ts` round-trip over
  `ta-repo-grades-target-branch` keyed by courseId; `repoGrades.wiring.test.ts`
  source-pin that the control is rendered from the header node. Fails if the key
  is absent, course-leaky, or the control is not threaded through the header.
- **AC-2 (opt-in, default unchanged).** With the target-branch control empty, the
  view passes `undefined` as `gradeRepoAction`'s 5th arg and no
  `branchMergeCheck` is produced - byte-identical to today. Instrument:
  `github-repos.branch-merge-check.test.ts` (empty-target case ->
  `branchMergeCheck === undefined`); `repoGrades.wiring.test.ts`. Fails if an
  empty target changes any existing behavior.
- **AC-3 (target branch is graded).** With a non-empty target branch, both the
  per-cell and bulk grading paths grade that branch (pass it as the 5th arg).
  Instrument: `repoGrades.wiring.test.ts` source-pin on both call sites
  (`useRepoGradesGradingActions.ts`, `useRepoGradesBulkGrade.ts`). Fails if either
  call site still hardcodes `undefined`.
- **AC-4 (the two states have DISTINCT non-accusatory notes - owner refinement).**
  The `not-merged` note (branch present) names the target branch AND the found-on
  branch; the `no-submission` note (no branch present) states no branch held the
  work and names the target; the two are DIFFERENT strings, not one template with
  a slot; neither contains a banned accusatory word. Instrument:
  `github-repos.branch-merge-check.test.ts` asserting the two notes differ and
  each names its branches, extending the word-ban at
  `github-repos.grading.unmerged-branch.test.ts:116-118`. Fails if the notes are
  equal, omit a branch name, or contain a banned word.
- **AC-5 (detection is a typed, DISTINCT 4-way outcome, on all three returns).**
  `classifyBranchMergeCheck` returns exactly one of `merged` / `not-merged` /
  `no-submission` / `unknown` for every input, matching the frozen oracle (6.3),
  with `not-merged` (branch present) and `no-submission` (no branch) as DISTINCT
  states (the owner refinement); `unknown` carries the honest reason and never
  reads as a confident negative. The resulting `branchMergeCheck` is set on ALL
  THREE non-error returns of `gradeRepoAction` (`:805,:830,:840`), not only the
  gemini path. Instrument: `repo-grade-merge-check.test.ts` against the frozen
  table (distinct states) + `github-repos.branch-merge-check.test.ts` asserting
  the field on the embedded AND gemini success returns. Fails if any oracle row
  differs, if the two states collapse, or if any non-error return omits the field.
- **AC-5b (target-branch validation, security).** A target branch containing a
  `.`/`..` segment (or other invalid ref) is rejected by `normalizeTargetBranch`
  before any GitHub call; `getRepoTreeWithMeta`/`getFileText` route the ref
  through `encodeRefSegment`; a blank/whitespace target forwards as `undefined`
  (never a space-named branch). Instrument: I-1 validator table, I-2 URL-level,
  I-3 action-boundary (zero GitHub calls on `".."`); the S1-S5 sabotages each
  kill. Fails if a dot-segment ref reaches `fetch`, if a whitespace string is
  forwarded, or if a valid `feature/x` is over-rejected.
- **AC-6 (the two fields agree).** `branchMergeCheck.status === "not-merged"` iff
  the result's `determination === "no-submission-unmerged-branch"`. Instrument:
  `github-repos.branch-merge-check.test.ts`. Fails if one is set without the
  other.
- **AC-7 (never crashes a run).** A branch-missing / 409 / truncated / rate-limit
  scan yields `unknown` for that repo and the surrounding run continues; the
  action returns a value, never throws. Instrument:
  `github-repos.branch-merge-check.test.ts` (the four could-not-determine cases,
  mirroring `github-repos.grading.unmerged-branch.test.ts:145-192`). Fails if any
  case throws or returns a confident `no-submission`.
- **AC-8 (diagnostic representation).** Each `grade_repo` action with a target set
  records a merge-check outcome in the grading diagnostic as a fixed, text-free
  class (`merged` / `not-merged` / `no-submission` / `unknown`), never a branch
  name or repo path, reading the `branchMergeCheck` field set on all three
  non-error returns (so an embedded merged grade records `merged` too, not
  silence). Instrument: `gradingActionSeam`'s test over the extended decision; the
  NO-STUDENT-DATA shape rule (`gradingActionSeam.ts:10-14`). Fails if the outcome
  is invisible, engine-dependent, or if any branch/repo text is recorded.
- **AC-9 (leverage removal test).** Removing the branch read (stub the scan
  fetchers / delete the `scanBranchesForUnmergedSubmission` call) flips the
  empty-target case from `not-merged` (naming a branch) to `no-submission`
  (naming nothing). Instrument: `repo-grade-merge-check.test.ts` /
  `github-repos.branch-merge-check.test.ts`. The test seat owns the exact
  deletion-and-assertion; this is a pure/wiring assertion, not a render.
- **AC-10 (score follows the recommended reading).** Under reading A, a not-merged
  repo produces NO automatic score change beyond today's no-submission behavior;
  the not-merged fact is surfaced to the instructor (the typed flag on the cell),
  who decides any penalty. Instrument: `github-repos.branch-merge-check.test.ts`
  (no `totalScore` on the no-submission branch, extending
  `github-repos.grading.unmerged-branch.test.ts:99`). Fails if a score is silently
  injected. (Superseded only by an explicit owner answer of B or C.)

---

## 10. Seats required before build (triage)

- **Security:** RAN - the required pass strengthened and corrected this scope; its
  plan is folded into section 3.4 (the `github-ref-name.ts` validator, the two
  boundaries, the five sabotages) and is a Wave 1 build obligation, not a deferred
  pass. The delta-checker + test seat confirm S1-S5 kill against the built diff.
  Trigger fired: new argument reaching a credential path.
- **Data / reliability:** RAN - folded into section 3.5 (zero new calls on the
  merged path; the empty-target path reuses the already-bounded G3 scan; I-3
  asserts the call count). Confirmed against the built diff by the delta-checker.
  Trigger fired: a failure mode that is not a thrown error (scan undetermined).
- **Architect:** this document is the architect pass (shape: the typed
  `branchMergeCheck` surface as a layer; the new pure leaf; the wave cut).
- **Test seat:** REQUIRED (owns the frozen oracle 6.3, the removal test AC-9, and
  the sabotage proof that each assertion can fail). Runs after build+verify per
  the loop.
- **UX / visual / a11y (Wave 3):** the control is one labeled text input reusing
  existing header classes - run the Wave-3 trio against the as-built diff; findings
  are reading claims (no component renders).
- **Acceptance criteria:** this document embeds them (section 9); the dedicated
  `loop-ac` pass re-judges them against the owner's words.
