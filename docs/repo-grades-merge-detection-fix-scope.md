# Scope: fix the repo-grades branch-merge-detection feature (REPO-GRADES-MERGE-DETECTION-FIX)

This is a SCOPE artifact. It writes no production code. A `loop-checker` reads it
before any build wave. ASCII only, no emojis. House rules: the 1000-line ceiling;
vitest is node-env, network-blocked, renders NO component (mock the GitHub
client, never `fetch`); fixtures match the real GitHub API response shape. Every
quantity below names the command that produced it; every `file:line` cited was
opened in this session.

Inputs read in full: `docs/repo-grades-merge-detection-diagnosis.md`,
`docs/repo-grades-branch-merge-check-scope.md` (the original scope, SHIPPED as
waves `41cde1e3` + `146afdcd`, `docs/BACKLOG.md:260`),
`docs/repo-grades-table-header-cleanup-scope.md` (the concurrent repo-grades
build this one must serialize against).

---

## 0. Verified root-cause restatement (I opened every line I cite)

The diagnosis verdict is CONFIRMED against the tree. The two defects:

### 0.1 WRONG SIGNAL (primary) - CONFIRMED

- `src/app/actions/github-repos.ts:765-766`: `const gradableFiles =
  gradedDigest.files.filter((f) => !isScaffoldingFile(f.path)); if
  (gradableFiles.length === 0) {`. The branch scan (`:780-792`
  `scanBranchesForUnmergedSubmission`) and the no-submission classifier call
  (`:824-826` `classifyBranchMergeCheck({ ... gradedTargetHadSubmission: false,
  scan })`) run ONLY inside this `gradableFiles.length === 0` block.
- `src/app/actions/github-repos.ts:837-839` (the SUCCESS path, folder non-empty):
  `const mergedCheck = targetBranch ? classifyBranchMergeCheck({ targetBranch,
  gradedTargetHadSubmission: true, scan: null }) : undefined;`.
- `src/lib/repo-grade-merge-check.ts:28`: `if (gradedTargetHadSubmission || scan
  === null) return { status: "merged", targetBranch };`.

So any graded folder holding one non-scaffolding file -> `gradableFiles.length >
0` -> the `:766` block is skipped -> `:837-839` passes `gradedTargetHadSubmission:
true, scan: null` -> classifier line 28 returns `merged` BY CONSTRUCTION, never
reading another branch. The owner's repo (work under `main/assignments`) is
non-empty, so its outcome is unconditionally `merged`. CONFIRMED.

### 0.2 UNREACHABLE RESULT (secondary) - CONFIRMED, with one correction

- `src/app/components/repo-grades/useRepoGradesGradingActions.ts:296-305` (no-sub
  return) sets only `{ grading: false, gradeError: null }` and
  `setPostSummary(... result.reason)`. `:317-338` (success return) writes
  `score`/`comment`/`strengths`/... but NEVER reads `result.branchMergeCheck`.
- `src/app/components/repo-grades/useRepoGradesBulkGrade.ts:294-298` and
  `:310-338` likewise never read `result.branchMergeCheck`.
- So the typed outcome reaches only the diagnostic log. There is NO persistent
  per-cell badge. CONFIRMED.
- The target-branch control is unlabeled:
  `src/app/components/repo-grades/index.tsx:808-822` is a bare `<input>` with
  `aria-label="Target branch (merged to)"` + `placeholder="Optional, e.g. main"`,
  no visible caption. `repoGradesWaveASticky.structure.test.ts:253` asserts
  `W_INDEX` does NOT match `/>Target branch \(merged to\)</`. CONFIRMED.

**Correction to the diagnosis's FIX-2 write set.** The diagnosis proposed the
diagnostic seam needs extending. It does NOT. `gradingActionSeam.ts:55-74,164`
ALREADY reads `branchMergeCheck.status` (`classifyMergeCheckResult:69`) and
records a fixed text-free class (`MERGE_CHECK_FAILURE_CLASSES:60`). The original
AC-8 (diagnostic representation) SHIPPED in Wave 1. FIX 2 is therefore ONLY the
per-cell badge + the control label - no `gradingActionSeam.ts` change. Under FIX
1, the SAME already-wired diagnostic will begin reporting `not-merged` on the
success path too (it reads the field, which FIX 1 now sets correctly), at zero
diagnostic-code cost - re-judged at Verify, not re-built.

### 0.3 The load-bearing SHAPE finding the diagnosis's "presence-only" wording hides

`scanBranchesForUnmergedSubmission` returns `found` iff ANY other branch (not the
graded one, capped at `MAX_BRANCHES_SCANNED = 10`,
`repo-grade-branch-scan.ts:62`) has a blob that passes `isCandidateSubmissionPath`
(non-scaffolding, non-README, under the scoped folder - `:81-86,195-198`). It does
NOT compare that branch's content against the GRADED ref's content; it has no
reference to the graded ref at all on the `found`/`not-found` axis
(`:284-301`).

Consequence that MUST drive the FIX-1 definition: a bare hoist (run the existing
scan on the success path, map `found -> not-merged`) flags `not-merged` for EVERY
non-empty repo that merely has a second folder-bearing branch - including a repo
whose assignment work IS fully on the target and whose other branch is a stale
draft. That is a false positive on the owner's own merged repo if it has any such
branch, and it defeats the fix. Reading A is therefore defined below as a
PATH-SET DIFFERENCE, which requires the scan to know the graded ref's candidate
paths - a signature change, not a call-site move.

---

## 1. Leverage claim and diagnostics representation

**Leverage: NO NEW claim owed - this is a bug fix of a shipped capability**
(`DEV_LOOP.md` "Criteria": a bug fix carries none). The original scope already
made the claim (section 1: GUARANTEED + SCALE + ATTRIBUTION - a structural, by-
construction determination of merged-ness a chat cannot produce). That claim is
currently FALSE in the built product: the signal is wrong (0.1) and unreachable
(0.2), so the advantage ships inert. These two fixes are precisely what make the
existing claim TRUE. The Verify half re-judges the ORIGINAL claim against the
built diff (`DEV_LOOP.md` "Verify"); trigger recorded, no new claim.

**Diagnostics representation: ALREADY MET, no new work** (0.2 correction). The
merge-check diagnostic shipped in Wave 1 (`gradingActionSeam.ts:55-74,164`). FIX
1 makes it report `not-merged` on the success path for free. FIX 2 is a pure
surfacing of an existing typed field (badge) + a label; a presentational change
with no new data path - the one legitimate "none owed", stated and justified per
`DEV_LOOP.md`.

---

## 2. FIX 1 (PRIMARY) - Reading A, presence-only path-set difference

Reading A is the CHOSEN reading (owner's steer via the diagnosis: ship it working
now, zero new GitHub API). It is NOT re-litigated here. Reading B (compare/ancestry
API) is recorded as RES-1 and is NOT part of this build.

### 2.1 Operational definition of "not merged to target X", folder non-empty

Grounded in the real scan code (`repo-grade-branch-scan.ts:81-86,195-212,270-301`):

> A repo whose graded target branch X holds gradable content is classified
> **not-merged** when, among the repo's OTHER branches (excluding X, capped at 10),
> at least one branch has a blob that (a) passes `isCandidateSubmissionPath`
> (non-scaffolding, non-README, under the scoped folder) AND (b) whose exact path
> string is NOT present in the graded ref's own candidate-path set. The named
> `foundOnBranch` is that branch.

Equivalently: "some OTHER branch carries folder work the graded target ref does
not have." The comparison is by exact path string (git paths are case-sensitive),
after both sides are filtered through the SAME `isCandidateSubmissionPath` with the
SAME normalized prefix - the scan owns that normalization so the two sides cannot
drift (the coercion-changes-set-membership trap: one validator, one home).

The empty-folder case is UNCHANGED and is the degenerate instance of the same
rule: the graded ref's candidate-path set is empty, so every candidate path on any
other branch is "not present on the graded ref" -> today's `found` behavior
exactly.

### 2.2 What presence-only CANNOT detect (stated honestly, not filled in)

- **FALSE NEGATIVE - stale same-path.** Branch X has `a.py` with newer content
  than the target's stale `a.py`. Same path on both -> no path the target lacks ->
  classified `merged`, though the target is stale. Presence compares PATHS, never
  CONTENT (the scan fetches trees only, no blobs - `repo-grade-branch-scan.ts:70-73`
  G3c). Undetectable under Reading A.
- **FALSE POSITIVE - stale extra file / squash-merge.** A fully-merged repo that
  keeps a stale branch with one extra path (a scratch file, or a feature branch
  whose commits were squash-merged into the target as different paths) is flagged
  `not-merged`, naming that branch. Defensible (there genuinely IS unmerged folder
  content on another branch) and non-accusatory, but it is noise if common.
- The note copy and badge therefore state only the verifiable fact ("this folder
  also has content on branch X that is not on <target>"), never "the work was not
  merged in the git sense."

These two are the trigger for RES-1 (Reading B). If measured noise is high, the
owner escalates to compare/ancestry; that is NOT this build.

### 2.3 The scan signature change (the surface, and it is a layer)

`scanBranchesForUnmergedSubmission` (`repo-grade-branch-scan.ts:245-252`) gains ONE
optional input carrying the graded ref's raw paths:

```
export interface ScanBranchesForSubmissionOptions {
  concurrency?: number;
  maxBranches?: number;
  now?: () => number;
  /** Raw paths of the graded ref's own files. A candidate blob on another
   *  branch counts as "found" only when its exact path is NOT among these
   *  (after the same isCandidateSubmissionPath + normalizedPrefix filter).
   *  Omitted / empty => today's behavior (any candidate path qualifies). */
  gradedRefPaths?: readonly string[];
}
```

- The scan computes `gradedCandidatePaths: Set<string>` ONCE, at the top, by
  filtering `gradedRefPaths` through `isCandidateSubmissionPath(path,
  normalizedPrefix)` and storing the exact surviving path strings.
- `checkOneBranch` (`:175-212`) changes its `hasCandidate` test (`:195-197`) to:
  `result.entries.some((e) => e.type === "blob" &&
  isCandidateSubmissionPath(e.path, normalizedPrefix) &&
  !gradedCandidatePaths.has(e.path))`.
- Everything else (the four `undetermined` partitions `:184-210`, the cap, the
  `branchesSkipped` reporting, the never-throws contract `:242-243`) is UNCHANGED.

Backward compatibility: omitting `gradedRefPaths` (or passing `[]`) yields an empty
set, so no path is excluded -> byte-identical to today for the no-submission
caller. Object under comparison: the `BranchScanResult`. Instrument:
`repo-grade-branch-scan.test.ts`. Failure direction: a fixture whose only other
branch holds exactly the graded ref's paths must return `not-found`; it returns
`found` if the set-exclusion is dropped.

### 2.4 The classifier change (`src/lib/repo-grade-merge-check.ts`)

The signature is UNCHANGED (`targetBranch`, `gradedTargetHadSubmission`, `scan`).
Only the body changes, so the type contract consumed by the action and the
diagnostic is stable. The new total mapping:

```
export function classifyBranchMergeCheck(args): BranchMergeCheck {
  const { targetBranch, gradedTargetHadSubmission, scan } = args;
  if (scan === null) return { status: "merged", targetBranch };   // scan did not run
  switch (scan.kind) {
    case "found":
      return { status: "not-merged", targetBranch, foundOnBranch: scan.branch };
    case "not-found":
      return gradedTargetHadSubmission
        ? { status: "merged", targetBranch }
        : { status: "no-submission", targetBranch };
    case "undetermined":
      return gradedTargetHadSubmission
        ? { status: "merged", targetBranch }
        : { status: "unknown", targetBranch, undeterminedReason: scan.reason };
  }
}
```

Why these three non-empty-target rows:
- `found` -> `not-merged` on BOTH paths: the found-extra-path fact is the same
  signal regardless of whether the target also has content. `foundOnBranch` carries
  the branch for the badge/note.
- `not-found` + submission present -> `merged`: no other branch has folder work the
  target lacks; the target has the work; it is merged.
- `undetermined` + submission present -> `merged`, NOT `unknown`: the PRIMARY fact
  (gradable work is present on the target, and it was graded) is certain. The
  secondary scan uncertainty (could not read other branches) must not downgrade a
  legitimately-graded submission to `unknown` or alarm on every rate-limit. (This
  is a deliberate choice; its limitation - a genuinely-unmerged branch that the
  scan could not reach reads as `merged` - is RES-2.)

No new status member, no new field on `BranchMergeCheck` - the 4-way union
(`repo-grade-merge-check.ts:8`) is unchanged, so the diagnostic class set
(`gradingActionSeam.ts:55,60`) and the badge variants need nothing new. The
distinct NOTE per state already exists (`describeBranchMergeNote:41-52`) and is
UNCHANGED.

### 2.5 The action change (`src/app/actions/github-repos.ts`)

Two edits, both small; `github-repos.ts` is **914** lines
(`@(Get-Content src/app/actions/github-repos.ts).Count`), headroom 86.

1. **No-submission path (`:780-826`): pass `gradedRefPaths`.** On this path the
   graded folder is empty, so `gradableFiles` is empty; passing
   `{ ..., gradedRefPaths: [] }` (or omitting it) is behavior-identical. Prefer
   passing `gradableFiles.map((f) => f.path)` explicitly for one call shape across
   both sites - it is `[]` here anyway.
2. **Success path (new, replacing `:837-839`): run the scan, then classify.**
   Replace the `scan: null` shortcut with an actual scan over the OTHER branches,
   reusing the SAME injected fetchers already constructed at `:786-791`
   (`listBranches`, and `getRepoTreeWithMeta` wrapped as `fetchTree`) - no new
   GitHub client surface:

```
let mergedCheck: BranchMergeCheck | undefined;
if (targetBranch) {
  const successScan = await scanBranchesForUnmergedSubmission(
    parsed.owner, parsed.repo, pathPrefix, targetBranch,
    { listBranches, fetchTree: async (o, r, b) => {
        const { entries, truncated } = await getRepoTreeWithMeta(o, r, b);
        return { entries, truncated };
      } },
    { gradedRefPaths: gradableFiles.map((f) => f.path) }
  );
  mergedCheck = classifyBranchMergeCheck({
    targetBranch, gradedTargetHadSubmission: true, scan: successScan,
  });
}
```

`mergedCheck` is then returned UNCHANGED on both success returns (`:863`
embedded, `:873` gemini) as `branchMergeCheck: mergedCheck`. The never-throws
contract holds: the scan never throws (`:242-243`), and the whole body is already
in try/catch (`:704,:874`).

**Reading A does NOT inject the note into a graded comment** (minimal, lower-risk).
On the success-path `not-merged` case the work WAS graded; the signal surfaces via
(a) the typed `branchMergeCheck` field -> badge (FIX 2) and (b) the already-wired
diagnostic. `describeBranchMergeNote` continues to be appended to `reason` ONLY on
the no-submission path (`:827-830`), where a `reason` banner exists. Weaving a note
into a graded comment is RES-3 (a later, larger surface).

### 2.6 Reliability - the cost the hoist adds (MUST be surfaced; it changes the original scope's own reliability argument)

The original scope's reliability pass (section 3.5) rested on the scan running
ONLY on the no-submission path, so it "never multiplies across a roster of
submitting students." **FIX 1 breaks that premise by design**: the success path
now runs the scan for every submitting repo WHEN A TARGET IS SET.

- Added GitHub calls per submitting repo with a target set:
  `listBranches` (2 calls: `getRepo` + one branches page,
  `repo-grade-branch-scan.ts:21-23`) + one tree fetch per OTHER branch, capped at
  `MAX_BRANCHES_SCANNED = 10` (`:62`). Worst case `2 + 10 = 12` authenticated calls
  per repo; a realistic course repo (a handful of branches) is `2 + ~2`.
- For a bulk run of N submitting repos: ~`N * (2 + min(branches, 10))` extra calls,
  all against the authenticated limit (5000/hr). N=30, 3 branches: ~120 calls -
  well within budget for one run; a very large roster with many stale branches is
  the worst case and the `MAX_BRANCHES_SCANNED` cap plus `branchesSkipped`
  reporting (`:276-277`) is what bounds it. This is inherent to Reading A - there
  is no cheaper way to learn another branch's folder state - and Reading B would
  add MORE (a `/compare` call per candidate branch on top). Recorded as RES-4.
- The opt-in is the target-branch value being set; an empty target runs NO scan on
  the success path (`if (targetBranch)`), byte-identical to today.

### 2.7 Security - unchanged, already discharged

The hoisted success-path scan reaches GitHub through the SAME
`getRepoTreeWithMeta` already hardened in Wave 1 (`github.files.ts` routes the ref
through `encodeRefSegment`, `docs/BACKLOG.md:260`), and `targetBranch` has already
passed `normalizeTargetBranch` at the action's first step (`github-repos.ts:710`).
No new value reaches a credential path; no security re-pass triggered.

---

## 3. FIX 2 (SECONDARY, no fork) - reachability

Surfaces the already-produced typed outcome. Four parts: cell-edit field, both
hooks, the badge render, persistence. The control LABEL is handed to the concurrent
cleanup build (section 5) - it is NOT in this write set.

### 3.1 The cell-edit field

`src/app/components/repo-grades/repoGradesCellEdits.ts` (264 lines): add to
`RepoGradeCellEdit` (`:55-154`):

```
/** The typed merge-check outcome gradeRepoAction returned for this cell's last
 *  grade, or null when no target branch was set / not yet graded. Set ONLY by a
 *  grading call (both hooks), never by hand - the same discipline as
 *  generatedScore/rubricAreas. Drives the per-cell "Not merged" badge. */
mergeStatus: BranchMergeStatus | null;
/** The other branch named when mergeStatus === "not-merged" (for the badge's
 *  title/aria), else null. */
mergeFoundOnBranch: string | null;
```

Import `BranchMergeStatus` from `@/lib/repo-grade-merge-check` (a plain `.ts`
leaf - client-bundle-safe, no server import; confirm with the existing
client-bundle guard idiom the file already documents at `:46-52`). Add both to
`defaultRepoGradeCellEdit()` (`:159-177`) as `null`.

### 3.2 Both hooks write it from `result.branchMergeCheck`

- `useRepoGradesGradingActions.ts`: on the success return (`:317-338`
  `setRepoGradeCellEdit`) add `mergeStatus: result.branchMergeCheck?.status ??
  null, mergeFoundOnBranch: result.branchMergeCheck?.foundOnBranch ?? null`. On the
  no-submission return (`:296-305`) the cell is currently reset to untouched; add
  the SAME two fields there so a `not-merged`/`no-submission`/`unknown` outcome
  shows a badge even with no score. (This INTENTIONALLY changes that cell from
  "byte-identical untouched" to "carries a merge badge" - that IS the reachability
  the owner reported missing; note it against the S1 comment at `:298-301`.)
- `useRepoGradesBulkGrade.ts`: the same two writes on its success
  `onCellUpdate(...)` (`:310-338`) and its no-submission `onCellUpdate(...)`
  (`:295`).

### 3.3 The badge render - in `RepoGradeCellControl.tsx`, NOT `RepoGradesGrid.tsx`

**SHAPE correction to the task's write set.** The task named `RepoGradesGrid.tsx`.
The graded RESULT (score, comment, rubric) renders in
`RepoGradeCellControl.tsx` (651 lines), which `RepoGradesGrid.tsx:627-636` mounts
for every gradeable cell and ALREADY receives the cell `edit`
(`edit={getRepoGradeCellEdit(...)}`, `:630`). The badge belongs beside the score,
so it renders in `RepoGradeCellControl.tsx` reading `edit.mergeStatus` -
`RepoGradesGrid.tsx` needs NO change (it already passes `edit`). This is the
architecturally-correct home AND it removes the collision the task flagged:
`RepoGradeCellControl.tsx` is explicitly OUT of the cleanup write set (that scope
defers it, `docs/repo-grades-table-header-cleanup-scope.md` RES-7). The only files
FIX 2 then shares with cleanup are `repo-grades.module.css` and
`repoGrades.wiring.test.ts` (section 5).

Render rule: when `edit.mergeStatus === "not-merged"`, show a worded pill badge
reading `Not merged to <targetBranch>` (the target is on the cell via... see note
below), with the found-on branch in its `title`/visually-adjacent text. Show
nothing for `merged`, `null`; `unknown` is RES-5 (optional subtle caveat, not
built now). The badge is text-first, never colour-only.

Note on the target-branch name for the badge text: `BranchMergeCheck.targetBranch`
is NOT currently carried onto the cell. Two readings, RECOMMENDED acted on:
- **(RECOMMENDED) badge text "Not merged to target branch"** (no interpolated
  name) - zero extra cell field, the target is visible in the header control. The
  `foundOnBranch` (already added, 3.1) names the other branch in the title.
- (alt) add `mergeTargetBranch: string | null` to the cell edit and interpolate
  `Not merged to "<X>"`. One more persisted field. Recorded as the lower-priority
  half of RES-5; the owner can ask for the interpolated name.

### 3.4 CSS - reuse the existing pill, ZERO new rules by default (the 994 ceiling)

`repo-grades.module.css` is **994** lines
(`@(Get-Content src/app/components/repo-grades/repo-grades.module.css).Count`),
ceiling 1000 (`src/file-size-ceiling.structure.test.ts:41` `const LIMIT = 1000`),
headroom **6**. A dedicated badge rule group (`.bindingBadge*` is ~13 lines,
`:239-275`) does NOT fit in 6. The existing worded-pill idiom
(`.bindingBadgeConfirmed/Suggested/Ambiguous/Unbound`, `:239-275`:
`display:inline-flex; border-radius: var(--radius-pill); font-size: xs;
font-weight: 600`, distinguished by TEXT and theme-adaptive surface tokens, "never
by colour alone", `:223-225`) is the reuse target.

This is the sequencing-dependent fork, resolved in section 5:
- Under the RECOMMENDED series (FIX 2 lands AFTER cleanup), cleanup is CSS-net-
  negative (lands near 983, `docs/repo-grades-table-header-cleanup-scope.md:285`),
  so FIX 2 adds a DEDICATED `.mergeBadgeNotMerged` class (~10-12 lines, mirroring
  `.bindingBadgeAmbiguous` warning-surface tokens), re-measured with
  `@(Get-Content).Count` to confirm < 1000. Clean, no binding coupling.
- Fallback (FIX 2 lands BEFORE cleanup): reuse `styles.bindingBadgeAmbiguous`
  directly on the merge badge span - ZERO new CSS, respects the 6-line headroom.
  Cost: a `binding`-named class on a non-binding badge (a smell), and coupling to
  CSS that cleanup Reading B could delete (cleanup Reading A, recommended, keeps
  it). Recorded in RES-6.

### 3.5 Persistence - persist the badge

The cell result persists (`repoGradesResultsStore.ts:71 toPersisted`,
`PersistedRepoGradeCell:23`). A badge that vanished on reload while the score
stayed would be inconsistent. RECOMMENDED: persist `mergeStatus` +
`mergeFoundOnBranch` - add both to `PersistedRepoGradeCell` (`:23`),
`toPersisted` (`:71`), `parseCell` (`:102`, with `strOrNull`-style validation),
and `fromPersisted` (`:180`). `defaultRepoGradeCellEdit()` has them `null`, so
`isDefaultCell` (`:288-289`) still treats an untouched cell as default. Cost of
NOT persisting (drop them in `toPersisted` like `submittedFiles`, `:11`): badge
gone on reload - acceptable but inconsistent; recorded as the alternative in RES-6.

---

## 4. Write set

### Wave A - FIX 1 (server + detection). DISJOINT from the cleanup build.

- `src/lib/repo-grade-merge-check.ts` (52) - classifier body (2.4)
- `src/lib/repo-grade-merge-check.test.ts` (70) - frozen-oracle rows (6.1)
- `src/lib/repo-grade-branch-scan.ts` (302) - `gradedRefPaths` option (2.3)
- `src/lib/repo-grade-branch-scan.test.ts` (352) - path-set-difference rows (6.2)
- `src/app/actions/github-repos.ts` (914) - hoist + success-path scan (2.5)
- `src/app/actions/github-repos.branch-merge-check.test.ts` (215) - the adopted-
  assertion rewrites (6.3)

Intersection with the cleanup write set
(`docs/repo-grades-table-header-cleanup-scope.md` section 6:
`RepoGradesGrid.tsx`, `RepoGradesControls.tsx`, `index.tsx`, `repoGradesRows.ts`,
`repoGradeStudentName.ts`, `RepoGradesFolderPicker.tsx`,
`RepoGradesStickyHeader.tsx`, `repo-grades.module.css`, and its tests): **EMPTY**.
Confirm at build with `git status --short` and a pasted
`sort | uniq -d` over the two file lists; empty is the only pass.

### Wave B - FIX 2 (reachability). SERIALIZES after the cleanup build (section 5).

- `src/app/components/repo-grades/repoGradesCellEdits.ts` (264) - field (3.1)
- `src/app/components/repo-grades/repoGradesCellEdits.test.ts` (254) - default pin
- `src/app/components/repo-grades/useRepoGradesGradingActions.ts` (635) - write (3.2)
- `src/app/components/repo-grades/useRepoGradesBulkGrade.ts` (448) - write (3.2)
- `src/app/components/repo-grades/RepoGradeCellControl.tsx` (651) - badge (3.3)
- `src/app/components/repo-grades/repoGradesResultsStore.ts` (365) - persist (3.5)
- `src/app/components/repo-grades/repoGradesResultsStore.test.ts` (377) - round-trip
- `src/app/components/repo-grades/repo-grades.module.css` (994) - badge class (3.4)
- `src/app/components/repo-grades/repoGrades.wiring.test.ts` (896) - render + both-
  hook source pins (6.4); edits here MUST be net-neutral/negative (near its own
  budget)

NOT in Wave B (handed to cleanup, section 5): `index.tsx`,
`repoGradesWaveASticky.structure.test.ts`.

Intersection of Wave B with the cleanup write set: `repo-grades.module.css` and
`repoGrades.wiring.test.ts` ONLY. Both force Wave B to serialize AFTER cleanup; see
section 5.

---

## 5. CRITICAL coordination with `docs/repo-grades-table-header-cleanup-scope.md`

That scope is a concurrent repo-grades build (owner requests 2026-10-12, "checking
now"). The overlap is BROADER than the task's framing (which named only
`RepoGradesGrid.tsx`); the full picture:

| Shared concern | This fix | Cleanup scope | Resolution |
|---|---|---|---|
| The per-cell result surface | FIX 2 renders the badge in `RepoGradeCellControl.tsx` (3.3) | cleanup edits `RepoGradesGrid.tsx`, DEFERS `RepoGradeCellControl.tsx` (RES-7) | No collision - different files. The task's `RepoGradesGrid.tsx` concern DISSOLVES by rendering in the correct home. |
| The target-branch control LABEL | diagnosis assigns it to FIX 2 | cleanup CH-H2 (`:222`) ALREADY designs exactly this caption + FORK-4 rewords `repoGradesWaveASticky.structure.test.ts:250-256` in the same commit | HAND IT TO CLEANUP. FIX 2 does NOT touch `index.tsx` or the structure test. See below. |
| `repo-grades.module.css` (994, headroom 6) | FIX 2 wants a badge class (3.4) | cleanup is CSS-net-negative, lands near 983 (`:285`) | FIX 2 serializes AFTER cleanup -> budget exists for a dedicated class. |
| `repoGrades.wiring.test.ts` (896) | FIX 2 adds render + hook pins | cleanup edits it (binding/sort/hint pins) | Serialize; FIX 2's edits net-neutral/negative. |

### 5.1 The label hand-off (resolves the index.tsx + structure-test collision)

The control-label requirement (visible caption + reword
`repoGradesWaveASticky.structure.test.ts:253`) is DISCHARGED BY cleanup CH-H2 +
FORK-4, which already specify a `<span className={styles.headerInputLabel}>Target
branch</span>` caption keeping `aria-label="Target branch (merged to)"`, with the
structure-test reword in the same commit. Assigning it there makes FIX 2 and
cleanup DISJOINT on `index.tsx` and the structure test - the cleanest resolution.
FIX 2's AC for "control is discoverable" (AC-F8) is satisfied by the built state
cleanup produces. Recorded as a cross-scope dependency (RES-7), with the fallback:
if cleanup is withdrawn or drops CH-H2, FIX 2 RE-ABSORBS the caption +
`repoGradesWaveASticky.structure.test.ts` reword, and the CSS-budget fork (3.4)
flips to the fallback (reuse the pill class, zero new CSS).

### 5.2 Series order (what lands first and why)

1. **Wave A (FIX 1) lands FIRST** - it is the PRIMARY fix of a feature the owner
   reported broken, and it is DISJOINT from cleanup (section 4), so nothing gates
   it but the shared single-`tsc`/full-test runner (`docs/loop/this-repo.md`: one
   `tsc` caller, no two sabotage-verifies on the tree at once). It can run disjoint-
   concurrent with cleanup in file terms, serialized only on that runner.
2. **Cleanup lands SECOND** - frees CSS budget, does the caption (CH-H2) and the
   structure-test reword (FORK-4).
3. **Wave B (FIX 2) lands LAST** - after both A (it reads the field A now sets
   correctly) and cleanup (CSS budget freed; caption done; `RepoGradesGrid.tsx`,
   CSS, and `repoGrades.wiring.test.ts` have all settled). Re-cite Wave B's line
   targets against the THEN-current files - cleanup moves line numbers in CSS and
   `repoGrades.wiring.test.ts`.

Rationale for FIX 2 after cleanup rather than before: the ONLY thing lost by
deferring FIX 2 is the badge's visibility; the CORRECTNESS fix (Wave A) is not
delayed, and without Wave A the badge would surface a wrong signal anyway. Deferring
buys a dedicated, semantically-correct badge class (no binding coupling) and full
disjointness on the header. If the owner wants the badge shipped before cleanup
lands, take the 3.4 fallback (reuse the pill class) and FIX 2 may precede cleanup -
but it then re-absorbs the label (5.1) and collides on `index.tsx`.

---

## 6. Acceptance criteria and instruments

No component renders under vitest. Every instrument is a pure function, a frozen
oracle, a mocked-client wiring test, or a source-text pin. Multi-file gates use
`npm run test:paths <p1> <p2> ...` (a raw multi-path `vitest` drops unmatched args,
`docs/loop/this-repo.md`).

### 6.1 FIX 1 - the frozen oracle (primary instrument), `repo-grade-merge-check.test.ts`

Hand-written literal table, axes drawn from `repo-grade-branch-scan.ts`'s union (a
DIFFERENT source than the oracle). Object: the `BranchMergeCheck` returned.
Instrument: `classifyBranchMergeCheck`. Failure: any row whose
`status`/`foundOnBranch`/`undeterminedReason` differs.

KEPT rows (unchanged from the shipped oracle - verify they still pass):
```
{ in:{ targetBranch:"main", gradedTargetHadSubmission:true,  scan:null },                                          out:{ status:"merged", targetBranch:"main" } }
{ in:{ targetBranch:"main", gradedTargetHadSubmission:false, scan:{kind:"found", branch:"feature-x", branchesChecked:1, branchesSkipped:0} }, out:{ status:"not-merged", targetBranch:"main", foundOnBranch:"feature-x" } }
{ in:{ targetBranch:"main", gradedTargetHadSubmission:false, scan:{kind:"not-found", branchesChecked:2, branchesSkipped:0} },                 out:{ status:"no-submission", targetBranch:"main" } }
{ in:{ targetBranch:"main", gradedTargetHadSubmission:false, scan:{kind:"undetermined", reason:"a rate limit was hit", branchesChecked:1, branchesSkipped:0} }, out:{ status:"unknown", targetBranch:"main", undeterminedReason:"a rate limit was hit" } }
```
NEW rows (the hoist - submission present AND a real scan ran):
```
{ in:{ targetBranch:"main", gradedTargetHadSubmission:true, scan:{kind:"found", branch:"old-draft", branchesChecked:1, branchesSkipped:0} }, out:{ status:"not-merged", targetBranch:"main", foundOnBranch:"old-draft" } }   // THE FIX
{ in:{ targetBranch:"main", gradedTargetHadSubmission:true, scan:{kind:"not-found", branchesChecked:2, branchesSkipped:0} },                 out:{ status:"merged", targetBranch:"main" } }
{ in:{ targetBranch:"main", gradedTargetHadSubmission:true, scan:{kind:"undetermined", reason:"a rate limit was hit", branchesChecked:1, branchesSkipped:0} }, out:{ status:"merged", targetBranch:"main" } }
```
Single path -> `npx vitest run src/lib/repo-grade-merge-check.test.ts` is allowed.

**Sabotages (test-author owns; each must kill):**
- SB1: revert the body to `if (gradedTargetHadSubmission || scan===null) return
  merged` -> the THE FIX row returns `merged`; RED. (The whole-fix canary.)
- SB2: `found` -> `merged` -> the two `found` rows RED.
- SB3: `not-found` on submission-present -> `no-submission` -> the merged `not-found`
  row RED.
- SB4: `undetermined` on submission-present -> `unknown` -> that row RED.

### 6.2 FIX 1 - the scan path-set difference, `repo-grade-branch-scan.test.ts`

Object: `BranchScanResult`. Instrument: `scanBranchesForUnmergedSubmission` with
injected fetchers (no network). New rows:
- Target non-empty; the ONLY other branch holds exactly the graded ref's paths
  (pass `gradedRefPaths` = those paths) -> `not-found`. **SB5** (load-bearing):
  drop the `!gradedCandidatePaths.has(e.path)` exclusion -> the branch is wrongly
  `found`; RED. This is the sabotage that proves presence-only is a DIFFERENCE, not
  a bare presence.
- Target non-empty; another branch holds an EXTRA candidate path -> `found`, naming
  it.
- `gradedRefPaths` omitted / `[]` -> existing behavior preserved (the shipped rows
  still pass) - the backward-compat canary.

Gate (two+ files): `npm run test:paths src/lib/repo-grade-merge-check.test.ts
src/lib/repo-grade-branch-scan.test.ts`.

### 6.3 FIX 1 - action wiring, `github-repos.branch-merge-check.test.ts` (ADOPTED ASSERTIONS)

These existing assertions pass TODAY only because the success path never scans.
FIX 1 changes the behaviour under them, so they are rewritten, not merely extended:

- **REWRITE `:111-114` and `:119-122`** ("gemini"/"embedded success return carries
  merged"): the mock must now supply `listBranches` + `getRepoTreeWithMeta` for the
  hoisted success-path scan, set so no other branch has an extra path (scan returns
  `not-found`) -> `branchMergeCheck.status === "merged"` still holds AND a real
  grade is still produced. Object: the resolved result. Failure: RED if the scan is
  not invoked on the success path, or the status is wrong.
- **ADD (the reachability-of-signal case):** success path, target non-empty, graded,
  and another branch has an extra folder path -> `branchMergeCheck.status ===
  "not-merged"`, `foundOnBranch` set, a real `run` IS produced (the grade stands -
  reading A, no score change), and the determination is UNSET. This is the case the
  owner reported missing.
- **REWRITE `:209-213` (AC-6 iff -> one-directional).** The hoist makes `not-merged`
  reachable on the success path where `determination` is undefined, so the iff is
  false. New pin: `result.determination === "no-submission-unmerged-branch"`
  IMPLIES `result.branchMergeCheck?.status === "not-merged"` (one direction only),
  AND a success-path `not-merged` has `determination === undefined`. Object: the two
  fields. Failure: RED if the no-submission-unmerged-branch determination ever
  coexists with a non-`not-merged` status, or the test still asserts the reverse
  implication.
- **KEEP unchanged** (the no-submission path is untouched by FIX 1): `:84-102`
  (validation / zero-call), `:137-195` (empty-target not-merged / no-submission /
  unknown / note-text-differs), `:195-205` (no-target byte-identical).

Gate: `npm run test:paths src/lib/repo-grade-merge-check.test.ts
src/app/actions/github-repos.branch-merge-check.test.ts`.

### 6.4 FIX 2 - reachability instruments

- **AC-F1 (cell carries the outcome).** Object: `RepoGradeCellEdit` /
  `defaultRepoGradeCellEdit`. Instrument: `repoGradesCellEdits.test.ts` - default
  has `mergeStatus: null`, `mergeFoundOnBranch: null`. Failure: RED if absent.
- **AC-F2 (both hooks write it, from the field, both returns).** Object: the two
  hooks' source. Instrument: `repoGrades.wiring.test.ts` source-pins that each hook
  reads `result.branchMergeCheck?.status` into the cell edit on BOTH the success and
  the no-submission return (the EMBEDDED-vs-gemini lesson from the original scope:
  cover both returns, not one). Failure: RED if either hook, or either return,
  omits it.
- **AC-F3 (the badge renders - the reachability pin).** Object:
  `RepoGradeCellControl.tsx` source. Instrument: `repoGrades.wiring.test.ts`
  source-pin that a badge element is rendered gated on `edit.mergeStatus ===
  "not-merged"` and reads `edit.mergeFoundOnBranch` for its title. This is a SOURCE
  pin, never a render (no component renders here); the actual pixels are AC-F9
  (owner walk). Failure: RED if `mergeStatus` is read nowhere in the cell control.
- **AC-F4 (persistence round-trip).** Object: `PersistedRepoGradeCell` round-trip.
  Instrument: `repoGradesResultsStore.test.ts` - a cell with `mergeStatus:
  "not-merged"`, `mergeFoundOnBranch: "feature-x"` survives
  `toPersisted` -> `parseStoredCells` -> `fromPersisted` unchanged; a stored cell
  missing the fields parses to `null` (back-compat). Failure: RED if the field is
  dropped or a legacy blob fails to parse.
- **AC-F8 (control is discoverable).** Object: the built `index.tsx` target-branch
  node. Instrument: satisfied by cleanup CH-H2 (5.1) - the caption is present and
  `repoGradesWaveASticky.structure.test.ts` is reworded there. FIX 2 does not pin
  it. Failure (at Verify): the control has no visible caption in the shipped tree.
- **AC-F9 (owner walk).** In the repo-grades grid, a graded repo whose work is
  unmerged to the set target shows a persistent "Not merged" badge on its cell that
  survives reload; a merged repo shows none. Instrument: owner walk only (RES-8).

### 6.5 Structural canaries the build runs in its wave gate

- `src/file-size-ceiling.structure.test.ts` UNCONDITIONALLY, both waves. Measured
  now, `@(Get-Content <f>).Count` 2026-10-12: `github-repos.ts` 914 (headroom 86),
  `repo-grades.module.css` 994 (headroom 6 - the binding constraint, section 3.4),
  `RepoGradeCellControl.tsx` 651, `repoGrades.wiring.test.ts` 896 (edits net <= 0).
  Re-measure the CSS with the SAME command after any edit; do NOT trust an estimate.
- No `ta-` storage key is added or removed by this fix (the control + its key
  shipped in Wave 2 `146afdcd`) -> `repoGradesStorageKeys.structure.test.ts`
  unchanged; `FROZEN_KEYS` unchanged. No new root file in `src/app/components/
  repo-grades/` -> `FROZEN_REPO_GRADES_ROOTS` unchanged (no directory-canary bump).
- `src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts`,
  `npx tsc --noEmit`, `npm run lint` (no NEW warning in written files).

---

## 7. Disposition of the original scope's acceptance criteria this fix touches

Re-derived LAST, after the design above settled. The original scope (section 9)
shipped AC-1..AC-10; this fix changes only these:

| Original AC | Disposition under this fix |
|---|---|
| AC-5 (typed 4-way outcome, frozen oracle) | KEPT + EXTENDED. Union and signature unchanged; the oracle GAINS three submission-present rows (6.1). The shipped four rows still pass. |
| AC-6 (determination iff not-merged) | MODIFIED to one-directional implication (6.3). The iff is no longer true once `not-merged` is reachable on the success path. Enforcer rewritten in the same commit; the fact it protects (the two fields never silently disagree) is preserved as the implication + the success-path "determination unset" case. |
| AC-9 (leverage removal test) | KEPT, unchanged (the empty-target removal behaviour is untouched by FIX 1). |
| AC-10 (reading A, no score change) | KEPT + STRENGTHENED. Now also asserted on the SUCCESS-path not-merged case: the grade stands, no score change, the fact is surfaced (badge). |
| AC-1 (control persists), AC-2 (opt-in), AC-3 (both call sites), AC-4 (distinct notes), AC-7 (never crashes), AC-8 (diagnostic) | UNCHANGED - shipped and not touched by this fix. AC-8's diagnostic now additionally reports success-path `not-merged` for free (0.2 correction). |

No prior requirement is WITHDRAWN; no enforcer is deleted without a replacement.

---

## 8. Residual register (owner / instrument / step each - or it is a deletion)

A residual not in `docs/BACKLOG.md` does not exist; the orchestrator files these
under REPO-GRADES-MERGE-DETECTION-FIX at disposal/push.

| ID | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| RES-1 | Reading B: compare/ancestry API (`/compare/{base}...{head}`) for git-sense "merged", escalated only if Reading A's presence-only proves noisy (2.2 false positives). NOT built. | build team, only if owner escalates | a new `/compare` helper + its pure classifier test | Deferred; filed as a note under this row. Protects nothing today - Reading A covers the ask. Triggered by measured false-positive noise (owner walk). |
| RES-2 | Classifier maps submission-present + `undetermined` scan to `merged` (2.4): a genuinely-unmerged branch the scan could not reach reads as `merged`. | owner | the oracle row (6.1) documents the choice | Stated choice, not a defect; revisit only with Reading B. |
| RES-3 | The success-path `not-merged` note is NOT woven into the graded comment (2.5) - only badge + diagnostic surface it. | owner | if wanted: a wiring test the comment carries the note | Deferred; larger surface (grade-comment composition). A later row if the owner wants the note in the comment. |
| RES-4 | FIX 1 runs the branch scan on the SUCCESS path (2.6), adding up to ~`2 + min(branches,10)` authenticated GitHub calls per submitting repo with a target set - this REVISES the original scope's section-3.5 "no multiply across a roster" argument. Bounded by `MAX_BRANCHES_SCANNED = 10` + `branchesSkipped`. | build + reliability reading-claim at Verify | a call-count assertion on the success path; owner-walk for live rate limits | Verify re-judges against the built diff; live limits are owner-walk (no network here). |
| RES-5 | Badge for `unknown` (optional caveat) and interpolating the target-branch NAME into the badge text (3.3) - neither built. | owner | if wanted: a cell-field + source pin | A later batched decision; recommended default is the plain "Not merged to target branch" text. |
| RES-6 | CSS fork (3.4): dedicated `.mergeBadgeNotMerged` vs reuse `.bindingBadgeAmbiguous`; and persistence fork (3.5): persist vs ephemeral. Recommended = dedicated class (post-cleanup budget) + persist. | owner / build | `@(Get-Content repo-grades.module.css).Count` post-edit; the AC-F4 round-trip | Resolved at build per the series (section 5); the fallback is the pill reuse. |
| RES-7 | Cross-scope dependency (5.1): the control LABEL + the `repoGradesWaveASticky.structure.test.ts:253` reword are DISCHARGED BY cleanup CH-H2/FORK-4. If cleanup is withdrawn or drops CH-H2, FIX 2 re-absorbs them and the CSS fork flips to the fallback. | orchestrator | `git log`/diff shows cleanup landed CH-H2; AC-F8 at Verify | Confirm cleanup landed the caption before FIX 2 ships; else re-scope FIX 2's write set to add `index.tsx` + the structure test. |
| RES-8 | All rendered appearance (AC-F9): the badge's look, the reload-persistence, light/dark, <700px. | owner | owner walk | post-ship. No component renders under vitest; no browser here. |
| RES-9 (owner-walk, inherited) | Live GitHub behaviour for the owner's actual repo: does the hoisted success-path scan now flag their unmerged case, and does a non-existent target branch resolve to a clear `unknown`/`{error}` not a false `no-submission`? (original scope RES, undischarged) | OWNER | owner-walk only | Cannot verify here: no `.env`, no `GITHUB_TOKEN`, network blocked, no component rendered. Stated, not filled in. |

---

## 9. Default ON - no dark ship

This fix introduces NO feature flag. The feature is live the moment each wave
lands: FIX 1 corrects the classifier/scan unconditionally; FIX 2 renders the badge
and (via cleanup CH-H2) the label unconditionally. The natural per-run opt-in is
the instructor TYPING a target branch into the (now-labeled, discoverable) control -
which is the user explicitly requesting the check, and is what gates the added
GitHub cost (2.6, RES-4). An empty target runs no scan and is byte-identical to
today. There is no disabled flag to flip, so there is nothing dark to ship.

---

## 10. Seats required before build (triage)

- **Architect:** this document is the architect pass (the SHAPE calls: the scan
  path-set signature, the classifier body, the badge's home in
  `RepoGradeCellControl.tsx`, the series order, the label hand-off).
- **Reliability:** RE-RUN against this fix (RES-4) - FIX 1 changes the original
  scope's own reliability premise (the scan now runs on the success path). Trigger
  fired: a known-cost change to a GitHub-call path. Folded here; Verify confirms the
  call-count assertion against the built diff.
- **Security:** NOT triggered (2.7) - no new value reaches a credential path; the
  reused `getRepoTreeWithMeta` is already hardened and `targetBranch` already
  validated.
- **Test seat:** REQUIRED - owns the 6.1 oracle rows, the load-bearing SB5
  (path-set, not bare presence) and SB1 (whole-fix canary), and the AC-F3 badge-
  render pin. Runs after build+verify per the loop.
- **UX / visual / a11y (Wave 3, FIX 2):** the badge is one worded pill reusing the
  existing idiom - run the trio against the as-built diff; findings are reading
  claims (no component renders). Coordinate with cleanup's own Wave 3 (same CSS).
- **Acceptance criteria:** section 6 embeds them; the dedicated `loop-ac` pass
  re-judges against the owner's words ("detect when something hasn't been merged").
