# Repo grades: pre-populate "Target branch" with "main" - scope

Seat: scope pass (loop-seat, Sonnet). Author: this document. Status: DRAFT, awaiting
the adversarial check. Tree measured at `git rev-parse --short HEAD` = `6977493c`
on 2026-10-12, with the working-tree modifications listed in section 6.

Owner request, verbatim: "for the target branch, populate it with main by default".

Every `file:line` below was opened in this session. Every quantity names its
command in section 10. Where a claim is a READING of code (no component renders
under vitest, there is no `.env`, the network is blocked - `docs/loop/this-repo.md`
section 6) it says so.

## 0. Triage and the headline findings

Leverage claim: none. This is a default value on an existing control, not a new
capability a user reaches (`docs/DEV_LOOP.md` "The loop / Criteria": no claim for a
bug fix, refactor or doc correction; a default tweak is the same class). Fired
trigger recorded: "default value of an existing persisted control".

Diagnostics representation: no new data path, so no NEW diagnostic is claimed. The
one new failure mode this change makes reachable (section 3.2) surfaces through the
existing per-cell `gradeError` path, not a new channel. I did NOT open
`gradingActionSeam.ts:151` (`timeGradingAction`) to see whether it records that
error's class; that is open question R-5.

Seat triage for the BUILD (the scope itself is docs-only, so AC and Test seat are
triaged out FOR THIS DOCUMENT only):

| Seat | Runs? | Trigger |
|---|---|---|
| Acceptance criteria | yes (section 4 is the draft) | always |
| Architect | folded into this scope | change touches 2 production files, one seam (`loadTargetBranch`) |
| Data / storage | yes, folded in section 2 | changes what the ABSENCE of an existing `ta-` key means |
| User experience | yes, folded in section 2.4 | a user-visible default and placeholder |
| Reliability | yes, section 3.2 | a failure mode that is not a thrown error in the UI: a 404 on repos with a non-main default |
| Security | no | no new action, egress, or text reaching a prompt/DOM: the value already passes `normalizeTargetBranch` (`github-repos.ts:720`), and "main" is a valid ref (`github-ref-name.ts:35-50`) |
| Visual / accessibility | no | no layout, markup or focus change; one placeholder string. Reading claim, nothing renders |

Headline findings, each measured below:

1. The target-branch value lives in `useState("")` (`index.tsx:350`) but its REAL
   source is `loadTargetBranch(courseId)` (`repoGradesUiState.ts:465-473`), called
   in a render-phase course-change block (`index.tsx:498`). That loader returns
   `byCourse[courseId] ?? ""` - so "never persisted" and "persisted as empty" are
   INDISTINGUISHABLE in its return value today. A default of "main" must be
   implemented INSIDE the loader (or the deliberate-clear case is lost).
2. Recommendation: "main" is a FIRST-RUN default only. A deliberately cleared
   field (persisted `""`) stays empty on reload (section 2.2).
3. The non-main-default-branch risk is WORSE than "scan against a possibly
   non-existent main". The same value is passed to `ingestRepo` as the ref
   (`github-repos.ts:725`), so on a repo whose default branch is not `main` the
   whole grade returns `{ error }` before any scan runs (section 3.2).
4. For repos whose default branch IS `main`, passing "main" explicitly versus
   `undefined` yields the same tree and the same scan baseline; the only
   observable difference is the note wording (section 3.1).
5. Write set is `index.tsx` + `repoGradesUiState.ts` + two test files, disjoint
   from both concurrent builds by exact path (section 6).

## 1. Where the value lives today (item 1)

| Fact | Evidence |
|---|---|
| State: `const [targetBranch, setTargetBranch] = useState<string>("")` - plain React state, raw text, initial `""` | `index.tsx:350` (comment `:348-349`: "per course, ta-repo-grades-target-branch. Raw text as typed; trimmed only at the grading call boundary") |
| Persistence key: `ta-repo-grades-target-branch`, one JSON object `{ [courseId]: string }` | `repoGradesUiState.ts:461` (`TARGET_BRANCH_KEY`); parse via `parseFolderByCourse` `:415-428`, which KEEPS empty strings (`typeof value === "string"`, `:422`) |
| Load: `loadTargetBranch(courseId)` returns `""` when `window` is undefined, when `courseId` is blank, when the key/course is absent (`byCourse[courseId] ?? ""`), and when anything throws | `repoGradesUiState.ts:465-473` |
| Persist: `persistTargetBranch(courseId, value)` writes the raw string for that course, preserving other courses; no-op on blank course or no window; swallows write failure | `repoGradesUiState.ts:477-486` |
| When load runs: render-phase, whenever `uiState.courseId !== cellStateResetForCourse` (initially `null`, so on the first render and on every course switch) -> `setTargetBranch(loadTargetBranch(uiState.courseId))` | `index.tsx:473,476,498` |
| When persist runs: ONLY inside the input's `onChange`, `persistTargetBranch(uiState.courseId, e.target.value)`. Nothing writes on load. | `index.tsx:822-825` |
| Call boundary: `targetBranch: targetBranch.trim() \|\| undefined` into `useRepoGradesGradingActions`, forwarded to the per-cell call (`useRepoGradesGradingActions.ts:277-286`, 5th arg) and the bulk hook (`useRepoGradesBulkGrade.ts:270-279`, 5th arg) | `index.tsx:580` |
| Control: `label.headerField` > `span.headerInputLabel` "Target branch" + `<input aria-label="Target branch (merged to)" placeholder="Optional, e.g. main">` | `index.tsx:813-828` |
| Only caller of the load/persist pair: `index.tsx`. No workflow step reads this key; workflow steps pass their own `branch` input to the same action | `grep -rn "loadTargetBranch\|persistTargetBranch" src` (section 10, C4); `steps.grading-repos.grade-repo.ts:383`, `steps.grading-repos.helpers.ts:260`, `steps.grading-repos.ts:252` |

What the value is in each case, TODAY:

| Case | Stored state | `loadTargetBranch` returns | Field shows | Reaches `gradeRepoAction` as |
|---|---|---|---|---|
| (a) first-ever load | key absent | `""` | empty (placeholder visible) | `undefined` |
| (b) reload, persisted value | `{c: "release"}` | `"release"` | `release` | `"release"` |
| (c) reload, deliberately cleared | `{c: ""}` | `""` (via `?? ""`: `""` is not nullish, so the stored empty string is returned as itself) | empty | `undefined` |

(a) and (c) return the same string today, from two different storage states. That
is the whole design problem: the loader currently CANNOT tell them apart from its
output, so a naive `useState("main")` or `|| "main"` would either be overridden by
the render-phase load (`index.tsx:498` replaces state with `""` on the first
render) or would resurrect "main" over a deliberate clear.

Consequence for the existing behaviour the owner may already rely on: a user who
typed a branch, then cleared it, has `{c: ""}` persisted. Under the recommendation
below they stay empty.

## 2. Design (item 2)

### 2.1 Mechanism: the default belongs in the loader, one constant, display-only

- Add `export const DEFAULT_TARGET_BRANCH = "main";` in `repoGradesUiState.ts`
  next to `TARGET_BRANCH_KEY` (`:461`). It does not match the key scan
  (`/"(ta-[a-z0-9-]*)"/g`, `repoGradesStorageKeys.structure.test.ts:15`), so the
  frozen 22-key set (`:25-47`, test K1 `:50`) is unchanged: NO new key.
- Change `loadTargetBranch` so the stored string wins whenever the course has an
  entry (including `""`), and the default is returned in every "nothing was
  stored" case:
  - key absent or course absent -> `DEFAULT_TARGET_BRANCH`
  - blank `courseId` -> `DEFAULT_TARGET_BRANCH` (no course means nothing to read;
    the field shows "main" instead of flipping from empty to "main" on course
    pick)
  - `typeof window === "undefined"` (SSR / node) -> `DEFAULT_TARGET_BRANCH`
  - storage read/parse throws (private mode, corrupt JSON) -> `DEFAULT_TARGET_BRANCH`
    (a read failure is not a deliberate clear)
  - stored `""` -> `""`  (the one case the old `?? ""` and the new code must both
    get right; the mutant `|| DEFAULT` breaks exactly this)
- The default is DISPLAY-ONLY. Nothing writes it on load. Persistence stays
  "only on `onChange`" (`index.tsx:822-825`). Reasons: (i) a write-on-load is the
  class `index.tsx:501-506` already warns about (an effect writing an untouched
  default over real stored data); (ii) a user who never touched the field keeps
  following the constant if it ever changes; (iii) it keeps the stored state a
  faithful record of what the user DID. Cost of being wrong: none visible; if the
  owner prefers write-through it is one `persistTargetBranch` call in the
  `index.tsx:498` block.
- `index.tsx:350`: change the initializer to `useState<string>(DEFAULT_TARGET_BRANCH)`
  and import the constant. Honest note: the render-phase load at `:498` overwrites
  this on the first render, so this edit has NO behavioural effect and a mutant of
  it survives every behavioural test. It is a readability/safety edit (a reader of
  `index.tsx` sees the default; a future refactor that drops the load block does
  not silently revert to empty) pinned by ONE source-text pin (section 5, P8),
  which is a spelling pin and is disclosed as such.

### 2.2 FORK-1 (the critical fork): first-run default, or hard default?

Recommendation, ACTED ON in this scope as my reading: **first-run default only.**
A persisted `""` is respected on reload.

Why:
- The field already has a meaningful empty state with its own semantics: blank ->
  `undefined` -> "each repo's own default branch" (`index.tsx:580`;
  `github.digest.ts:276` `ref || info.defaultBranch`; `repo-grade-branch-scan.ts:299`
  `explicitBranch || listed.defaultBranch`). Under a HARD default there is no way
  to select that state at all - clearing the box would snap back to "main" on the
  next reload - so the one escape for a repo whose default is not `main`
  (section 3.2) would be removed by the change meant to help.
- It follows the app's own persist-control-state convention: the persisted value
  is the user's choice, and the absence of a value is the only thing a default may
  fill.
- Cost of being wrong in the other direction (owner actually wants a hard default):
  a one-token change in the loader (`??` -> `||`), two test flips. Cost of a hard
  default being wrong: a user cannot opt out and a master-default repo cannot be
  graded from the UI at all. The asymmetry favours first-run.

Edge to state plainly: existing users who never touched the field get "main" on
next load (that is the request). Existing users who typed and then cleared it keep
empty and must retype "main" if they want it. I judge that correct (it is their
recorded choice) but it is the one place the owner's "by default" and "respect a
clear" can look inconsistent, so it is in the owner question (section 8, Q2).

### 2.3 Course-keyed, not global

Storage is per course (`repoGradesUiState.ts:480-482`), so each course gets its
own first-run "main" and its own deliberate clear. Unchanged.

### 2.4 Placeholder and caption once pre-filled

- The placeholder is only painted while the input is empty. After this change
  that is exactly the "deliberately cleared" state. "Optional, e.g. main" is then
  misleading: it suggests blank is a mistake to be fixed with "main", the
  opposite of what blank now means.
- Recommendation (FORK-2, acted on as my reading): change the placeholder to
  `Blank = each repo's default branch`. ASCII, no emoji. It tells a user who
  cleared the field what they selected, and it is the discoverable escape for
  non-main repos. No test pins the placeholder string: `grep -rn "Optional, e.g. main" src`
  returns only `index.tsx:820` (section 10, C5); two `docs/` files quote it as
  history, not as a pin.
- Caption `Target branch` and `aria-label="Target branch (merged to)"` stay
  byte-identical: both are pinned (`repoGradesWaveASticky.structure.test.ts:254,255,258`).
- Not changed: no helper text, no extra markup. Reading claim: placeholder text is
  not a substitute for a label, but the label is already the visible caption.

## 3. Interaction with grading (item 3)

### 3.1 Explicit "main" versus `undefined` on a repo whose default branch IS main

The value reaches the server as `branch` (`github-repos.ts:669`), is validated by
`normalizeTargetBranch` ("main" passes: no forbidden chars, no dot-segments,
`github-ref-name.ts:35-50`), and becomes `targetBranch = "main"` instead of
`undefined` (`github-repos.ts:722`). Every consumer of it, and what changes:

| Consumer | `undefined` | `"main"` on a main-default repo | Same? |
|---|---|---|---|
| Digest ingest: `ingestRepo(..., targetBranch)` `github-repos.ts:725` -> `const branch = ref \|\| info.defaultBranch` `github.digest.ts:276` -> `getRepoTreeWithMeta(owner, repo, branch)` `:277` | resolves default = main | `"main"` | same tree |
| No-submission branch scan: `scanBranchesForUnmergedSubmission(..., targetBranch, ...)` `github-repos.ts:789-801`; `gradedBranch = explicitBranch \|\| listed.defaultBranch` `repo-grade-branch-scan.ts:299`; candidates = every branch except `gradedBranch` `:300` | `gradedBranch` = default = main | `"main"` | same candidate set |
| Success-path scan: `getRepoTreeWithMeta(owner, repo, targetBranch)` `github-repos.ts:849` then the same scan `:851-864`; `getRepoTreeWithMeta` resolves `ref && ref.trim() ? ref.trim() : (await getRepo(...)).defaultBranch` `github.files.ts:35` | default tree = main's | main's | same gradedRefPaths |
| Classified outcome: `targetBranch: successScan?.gradedBranch \|\| targetBranch \|\| ""` `github-repos.ts:870` | `gradedBranch` = "main" | "main" | same |
| `targetWasExplicit` `github-repos.ts:806,871` | `false` | `true` | DIFFERENT (wording only) |

Reading claim, not run: with identical trees and an identical candidate set the
`found` / `not-found` / `undetermined` outcomes are identical; the single
difference is `targetWasExplicit`, which `describeGradedRef` turns into wording
(`repo-grade-merge-check.ts:56-61`): `"main" (the target branch you set)` instead
of `the default branch "main"`. For a user who never typed anything that
sentence is slightly untrue. That wording code is in the no-submission build's
write set (`docs/repo-grades-no-submission-graded-scope.md:326-358` Wave 1 rewords
the note per `targetWasExplicit`), so it is NOT mine to edit; filed as residual
R-2 with an owner.

Also unchanged: the concurrent no-submission work already makes the success-path
scan run when no target is typed (`docs/repo-grades-no-submission-graded-scope.md:364-365`:
"Success path: drop `if (targetBranch)`"). So defaulting to "main" does not
introduce the scan; it only makes the graded ref explicit.

### 3.2 The risk: a repo whose default branch is not "main" (measured by reading)

The brief assumed the failure was "scan against a possibly non-existent main". The
code is stricter than that. The chain for a repo whose default branch is `master`
and a target of `"main"` (a ref that does not exist there):

1. `gradeRepoAction` passes the ref into the ingest FIRST: `github-repos.ts:725`
   `ingestRepo(parsed.owner, parsed.repo, { pathPrefix }, targetBranch)`.
2. `github.digest.ts:276-277`: `branch = ref || info.defaultBranch` -> `"main"`;
   `getRepoTreeWithMeta(owner, repo, "main")`.
3. `github.files.ts:35,39`: the ref is non-blank so the default is NOT consulted;
   it requests `/repos/{o}/{r}/git/trees/main?recursive=1`.
4. `github.repos.ts:39-49`: a non-ok response throws `GithubHttpError` with
   `ghError(404)` = `"GitHub resource not found (404). Check the owner/repo and the
   token's access."` (`github.repos.ts:24`).
5. Nothing in `ingestRepo` catches it; `gradeRepoAction`'s outer catch returns
   `{ error: err.message }` (`github-repos.ts:910-911`).
6. Both client call sites turn that into a cell error: per-cell
   `setRepoGradeCellEdit(..., { grading: false, gradeError: result.error })`
   (`useRepoGradesGradingActions.ts:288-291`), bulk `onCellUpdate(..., { gradeError })`
   (`useRepoGradesBulkGrade.ts:282-285`).

So: the grade fails BEFORE any scan, with a message that blames the owner/repo
and token rather than the target branch. It is LOUD (a visible per-cell error), not
silent, and it can NOT produce a false `no-submission` or a false `merged` - the
no-submission path is never reached. That answers the "false no-submission" half of
the inherited residual RES-9
(`docs/repo-grades-merge-detection-fix-scope.md:680`) by reading; the live-GitHub
half stays owner-walk.

Also checked: existing tests do not pin an explicit non-existent target
(`grep -n "non-existent\|nonexistent\|404" src/app/actions/github-repos.*.test.ts`
hits only an unrelated `listBranches` rejection, `...unmerged-branch.test.ts:182-183`,
section 10 C6). So the 404-on-missing-target behaviour is currently UNPINNED.

How likely it bites: only a repo whose default branch is not `main` AND a user who
leaves the pre-filled value. Whether the owner has any such repos is unknown to me
(it depends on live data; not determinable here).

### 3.3 Options for the risk, with cost, and the recommended reading

| | What | Write-set cost | Failure mode left |
|---|---|---|---|
| R1 (RECOMMENDED, acted on) | Literal "main" default (as asked). Escape = clear the field (respected, section 2.2) and the placeholder says what blank means (section 2.4). | none beyond section 6 | A user with a master-default repo sees a per-cell 404 until they clear the field; message is misleading (R-1) |
| R2 | R1 plus a client-side per-repo fallback: when the field equals `DEFAULT_TARGET_BRANCH`, pass `undefined` for a repo whose own `defaultBranch` (already on every row, `repoGradesRows.ts:102,168`; from the scan, `repo-grade-tree-scan.ts:139,240`) is not `main` | `useRepoGradesGradingActions.ts` + `useRepoGradesBulkGrade.ts` (+ tests). Both are "NOT in the production write set" of the no-submission build but it says they re-enter if needed (`...no-submission-graded-scope.md:388-391`), so serialise behind it | Cannot distinguish a user who TYPED "main" from the default; in the rare case "main" exists as a non-default branch on a master repo, R2 grades the default branch instead - a silent wrong-ref, worse than a loud 404 |
| R3 | R1 plus a SERVER fix: on an explicit target that does not exist, return a clear `{ error: 'Branch "main" does not exist in owner/repo' }` (or fall back with a note) | `github-repos.ts` (943+ lines, in the concurrent build's write set) - cannot be done now | none, but it is the right long-term fix; it is residual R-1 |

Recommendation: R1 now; R3 as a follow-up row after the no-submission build lands
(its message fix is the actual defect); R2 only if the owner says they have
non-main repos (Q1). I recommend against R2 as the default because its failure is
silent.

Terminating question to the owner (every answer ends this activity; section 8, Q1).

## 4. Acceptance criteria (draft; AC seat owns the final wording)

Each states object, instrument, direction of failure.

- AC-1 First run shows "main". Object: `loadTargetBranch("course-1")` on empty
  storage. Instrument: `repoGradesUiState.test.ts` assertion `toBe(DEFAULT_TARGET_BRANCH)`
  and a separate frozen-literal assertion `toBe("main")` (so changing the constant
  and the test together cannot pass). Fails if the loader returns `""`.
- AC-2 A persisted value is respected. Object: `loadTargetBranch` after
  `persistTargetBranch("course-1", "release")` and after `" main "` (raw, untrimmed,
  as the existing round-trip test does). Fails if the default overwrites a stored
  string.
- AC-3 A deliberate clear is respected. Object: `loadTargetBranch` after
  `persistTargetBranch("course-1", "")`. Instrument: `toBe("")`, and the stored JSON
  `toEqual({ "course-1": "" })`. Fails if it returns "main" (the `|| DEFAULT` mutant).
- AC-4 Course-keyed. Object: course-1 cleared, course-2 untouched -> course-1 `""`,
  course-2 "main". Fails if one course's clear leaks.
- AC-5 Defaults on every "nothing readable" path: blank course, no `window`,
  storage `getItem` throws, corrupt JSON in the key. Each returns "main". Fails
  if any returns `""` (the old behaviour) - note the existing tests at
  `repoGradesUiState.test.ts:499-501,519-520,527-528` assert `""` for three of these
  and MUST be rewritten, not deleted (disposition in section 7).
- AC-6 No write on load. Object: `fakeStorage.getItem("ta-repo-grades-target-branch")`
  after `loadTargetBranch("course-1")` on empty storage. Fails (non-null) if a
  write-through mutant exists.
- AC-7 Value that reaches the grading call. Object: `(loadTargetBranch(c)).trim() || undefined`,
  the exact boundary expression at `index.tsx:580`: first run -> `"main"`; after a
  clear -> `undefined`. The expression itself is already source-pinned
  (`repoGrades.wiring.test.ts:877-879` AC-2). Fails if either composition breaks.
- AC-8 Index wiring. Object: `index.tsx` source: imports `DEFAULT_TARGET_BRANCH`;
  state initializer uses it; the placeholder no longer reads `Optional, e.g. main`
  and states blank = repo default. Instrument: wiring-test source pins (section 5).
  Reading-level pin, see disclosure at 2.1.
- AC-9 Nothing else moved. Object: the frozen 22-key set (`repoGradesStorageKeys.structure.test.ts:50`),
  caption/aria-label pins (`repoGradesWaveASticky.structure.test.ts:250-259`), the
  AC-1/AC-2/AC-3 target-branch wiring pins (`repoGrades.wiring.test.ts:866-895`) all
  stay green UNCHANGED. Fails if any must be edited to pass.
- AC-10 Rendered appearance (field shows "main", clearing it empties it and stays
  empty after reload, placeholder visible only when empty). NOT provable here.
  Instrument: owner walk. Listed so no criterion above is credited with it.

## 5. Source pins and sabotage mutations

Pins (all in existing files; no new test file, so the directory frozen-roots canary
`FROZEN_REPO_GRADES_ROOTS`, `repoGradesFeedbackAndFiles.wiring.test.ts:304`, is not
touched - it lists non-test roots only):

- P1..P6, P7 in `repoGradesUiState.test.ts` (behavioural, against the real loader
  via the existing `FakeStorage` harness `:25-60`): AC-1 to AC-6.
- P7: `DEFAULT_TARGET_BRANCH` is exactly `"main"` (frozen literal).
- P8 (spelling pin, disclosed): in `repoGrades.wiring.test.ts`, inside the existing
  `target-branch control wiring` describe (`:866`), `indexSource` matches
  `/useState<string>\(DEFAULT_TARGET_BRANCH\)/` and does not contain
  `Optional, e.g. main`. Per memory "source-text tests over-specify": this pins the
  fact (the initializer is the constant) not extra spelling; if the owner drops it
  the behavioural pins still hold.
- P9: composition (AC-7).

Sabotage mutations (each must turn a named pin red; a mutant that survives is
reported, not banked):

| # | Mutation | Expected red | Note |
|---|---|---|---|
| M1 | loader: `byCourse[courseId] \|\| DEFAULT_TARGET_BRANCH` (falsy-coalesce) | P3 (deliberate clear) | the central mutant for FORK-1 |
| M2 | loader returns `DEFAULT_TARGET_BRANCH` unconditionally | P2, P3, P4 | proves stored values are read |
| M3 | loader keeps `?? ""` (revert) | P1 | |
| M4 | blank-course branch returns `""` | P5 | |
| M5 | no-window branch returns `""` | P5 | |
| M6 | catch branch returns `""` | P5 | |
| M7 | loader writes the default back to storage | P6 | |
| M8 | `DEFAULT_TARGET_BRANCH = "master"` | P7 and P1's literal assertion | constant+test cannot move together |
| M9 | `index.tsx:350` back to `useState<string>("")` | P8 only | EXPECTED to survive every behavioural test (render-phase load overrides it, section 2.1); this is a rebuilt-instrument disclosure, not a kill owed |
| M10 | placeholder reverted to `Optional, e.g. main` | P8 | |
| M11 | `index.tsx:580` changed to `targetBranch.trim()` (drop `\|\| undefined`) | existing `repoGrades.wiring.test.ts:877-879` | proves the existing pin still guards the boundary |

The "reference implementation green in an isolated tree" practice
(`seats.md` Test seat practice 1) is the TEST seat's obligation for the build; this
scope did not build one, and no production file was edited.

## 6. Write set, coordination, ceiling (item 4)

Default ON; no dark ship (a default value cannot be gated meaningfully, and a flag
would add a second source of truth for a one-string default).

Write set (4 files):

| File | Edit | Lines now (`@(Get-Content <f>).Count`) |
|---|---|---|
| `src/app/components/repo-grades/repoGradesUiState.ts` | add `DEFAULT_TARGET_BRANCH`; loader returns it on every nothing-stored path; doc comment on `:463-464` corrected ("`\"\"` when never persisted" becomes false) | 647 |
| `src/app/components/repo-grades/index.tsx` | import the constant (`:37` area); `:350` initializer; `:820` placeholder; refresh comment `:348-349` | 881 |
| `src/app/components/repo-grades/repoGradesUiState.test.ts` | rewrite the three `""`-asserting tests (`:499-501,519-520,527-528`) and add P1-P7 | 779 |
| `src/app/components/repo-grades/repoGrades.wiring.test.ts` | P8 inside the existing describe `:866-896` | 919 |

Ceiling note: `src/file-size-ceiling.structure.test.ts` LIMIT = 1000. Estimated
deltas are small (index.tsx about +3 lines -> about 884; UiState about +12 ->
about 659; UiState test about +45 -> about 824; wiring test about +8 -> about 927).
These are ESTIMATES; the implementer must re-measure with `@(Get-Content <f>).Count`
(never `Measure-Object -Line`) and the ceiling test must run in the wave gate
unconditionally (`this-repo.md` section 1).

Every wave includes the caller of each new export: the one new export,
`DEFAULT_TARGET_BRANCH`, is called by `index.tsx` (same wave) and by the loader in
its own file. Single wave, one implementer (the loader semantics and the tests that
pin them are mutually dependent).

Disjointness, stated explicitly, by exact path against the real tree:

- vs the no-submission build (`docs/repo-grades-no-submission-graded-scope.md:326-388`):
  its production write set is `github-repos.ts`, `grade-zeros.ts`,
  `repo-grade-merge-check.ts`, `steps.grading-repos.grade-repo.ts`,
  `steps.grading-repos.helpers.ts`, and "Client hooks are NOT in the production
  write set". None of my four files appears. `git status --short` on 2026-10-12
  shows `github-repos.ts`, `repo-grade-branch-scan.ts`, `repo-grade-merge-check.ts`
  and their tests already modified (section 10, C1); none of `index.tsx`,
  `repoGradesUiState.ts`, either of my test files is modified.
- vs the header-inline build (`docs/repo-grades-header-controls-inline-scope.md:310-335`):
  its write set is `repo-grades.module.css`, `RepoGradesStickyHeader.tsx`,
  `RepoGradesFolderPicker.tsx`, `RepoGradesGradeSetTypeahead.tsx` and a new
  `repoGradesHeaderInline.structure.test.ts`; "Not edited: `index.tsx` (881)". It
  documents a CONDITIONAL re-entry: if its accessibility seat rejects the focus-order
  change, the fallback needs `index.tsx` in ITS write set (`:483`, R-2 of that doc).
  So disjoint now, with one contingent overlap on `index.tsx`; if that fallback
  fires, the two builds touch `index.tsx` in different regions (`:813-828` field is
  mine; its slots are the `:802-812,829` region) and must be serialised, not run
  concurrently. Residual R-4.
- Tests that assert on behaviour I change: only `repoGradesUiState.test.ts`
  (rewritten) and `repoGrades.wiring.test.ts` (extended, existing AC-1..AC-3 pins
  unchanged). The sticky structure test (`repoGradesWaveASticky.structure.test.ts:250-259`)
  and the key canary (`repoGradesStorageKeys.structure.test.ts:50`) are checked-safe
  (neither caption/aria-label nor a `ta-` key changes).

Wave gate (per-argument lines for the 2+ file check, via the wrapper):

```
npm run test:paths src/app/components/repo-grades/repoGradesUiState.test.ts src/app/components/repo-grades/repoGrades.wiring.test.ts src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```
plus `npx tsc --noEmit` (single caller) and `npm run lint` (pass condition: exit 0
and no NEW warning in the four written files, measured against a pre-change run -
`this-repo.md` lint row). The report must quote the wrapper's per-argument lines.
All eight paths were confirmed to exist (section 10, C7). `git status --short`
against the four-file list is the wave gate; also confirm no `.claude/worktrees`
copy was edited.

## 7. Disposition of existing requirements this change touches

No prior version of this document exists, so there is no restructuring table. The
existing tests whose expectations flip, mapped so none is silently dropped:

| Existing test (file:line) | Today asserts | Disposition |
|---|---|---|
| `repoGradesUiState.test.ts:499-501` "defaults to an empty string when nothing is stored" | `""` | KEPT as P1, assertion flipped to "main" (renamed) |
| `:519-520` blank courseId `loadTargetBranch("")` | `""` | KEPT as P5a, flipped to "main"; the no-op half (`persistTargetBranch("", ...)` writes nothing, `:517-519`) is KEPT unchanged |
| `:523-529` "returns empty without window, and swallows a write failure" | `""` without window | KEPT, split: write-failure half unchanged; no-window half flipped to "main" (P5b) |
| `:508-515` course-keyed test | `loadTargetBranch("course-3")).toBe("")` | KEPT, flipped to "main" (third course untouched = default) |
| `:502-507` raw round trip | `" main "` verbatim | KEPT unchanged (AC-2) |
| `repoGrades.wiring.test.ts:870-895` AC-1..AC-3 | pins | KEPT unchanged (AC-9) |

## 8. Forks, recommendations, and the owner question

Acted on as MY reading (not owner rulings), per the AGENTS.md "recommendation on an
open fork is a backlog item" rule; the filing is the orchestrator's step.

- FORK-1 first-run default vs hard default: first-run (section 2.2).
- FORK-2 placeholder: `Blank = each repo's default branch` (section 2.4).
- FORK-3 write-through of the default on load: no (section 2.1).
- FORK-4 non-main default branch: R1 now, R3 follow-up (section 3.3).

One batched question, shaped so EVERY answer terminates this scope (the scope ships
as written with the answer applied; nothing reopens):

> Q1. Do any of your course repos have a default branch other than `main` (for
> example `master`)? NO / unsure -> ship as written (R1). YES -> ship as written AND
> add R2 (per-repo fallback in the two grading hooks) as a second wave, accepting
> its rare silent wrong-ref case. What is already running on the recommended
> reading: this scope's whole write set is R1; answering YES costs the R2 wave
> (2 hook files + tests) on top, no rework of R1.
>
> Q2. Confirm "clear stays cleared": a user who emptied the field on a past visit
> keeps it empty (they must retype "main"). If you instead want "main" to always
> come back after an empty reload, it is a one-token loader change and two test
> flips, and the field then cannot be left blank at all.

## 9. Residual register

Every entry has owner, instrument, and the step that measures it.

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-1 | A missing target branch returns the misleading `"GitHub resource not found (404). Check the owner/repo and the token's access."` and fails the whole grade (section 3.2). Unpinned today. | server-side fix: the build that next owns `github-repos.ts` after the no-submission build lands (backlog row to be filed by the orchestrator, area repo-grades) | a `gradeRepoAction` test with `getRepoTreeWithMeta` mocked to reject 404 for the explicit ref, asserting `{ error }` names the branch and no grade/scan call follows | after the no-submission build's push; Verify step of that row |
| R-2 | With the field pre-filled, `targetWasExplicit` is `true` for a user who typed nothing, so notes read `"main" (the target branch you set)` (`repo-grade-merge-check.ts:56-61`). | the no-submission build (it owns that wording and `targetWasExplicit`) | read the built note for a never-typed run; either accept the wording or have the classifier receive an "is untouched default" signal | that build's Verify; if the owner minds, a follow-up row |
| R-3 | Live behaviour: field shows "main", survives reload, stays empty after a clear, placeholder visible only when empty; dark/light and <700px layout; whether the owner has non-main repos. No component renders, no `.env`, no network. | OWNER | owner walk in a real browser against real repos | post-ship (AC-10) |
| R-4 | Contingent overlap: header-inline's accessibility fallback may add `index.tsx` to its write set (`repo-grades-header-controls-inline-scope.md:483`). | orchestrator (sequencing) | `git status --short` and the two write sets re-intersected (`sort \| uniq -d`, empty = pass) before dispatching either | before dispatching whichever build starts second |
| R-5 | I did not open `gradingActionSeam.ts:151` `timeGradingAction`, so I do not know whether a 404 `gradeError` from this change is classified in the diagnostics. | the Verify seat | open `gradingActionSeam.ts:151-175` and `classifyMergeCheckResult`; state whether grade_repo errors carry a class | Verify of the build |
| R-6 | Hydration: `index.tsx:498` loads during render, so a stored value differing from the server-rendered "main" (a cleared or custom value) hits the same hydration-mismatch class persisted values already hit. Not measured (nothing renders). | OWNER (browser console on reload) | owner walk: reload with a cleared value, watch for a hydration warning | post-ship (AC-10) |
| R-7 | The inherited merge-detection residual RES-9 (`repo-grades-merge-detection-fix-scope.md:680`) is narrowed by section 3.2's reading (no false no-submission on a missing target; it is a hard `{ error }`), but the live-GitHub half remains. | OWNER | owner walk with a live token | unchanged from its own row |

## 10. Commands run (every quantity above)

Working directory: repo root. Shell noted per command.

- C1 `git status --short -- src/app/components/repo-grades docs/BACKLOG.md` (PowerShell via `git -C`) returned empty (no repo-grades file modified); `git status --short | grep -E "repo-grades/|github-repos|repo-grade-"` (Bash) listed `github-repos*.test.ts`, `github-repos.ts`, `repo-grade-branch-scan*`, `repo-grade-merge-check*`. Canary: the same grep matches `github-repos.ts`, so it is not vacuous.
- C2 Line counts: PowerShell `@(Get-Content <f>).Count` -> `index.tsx` 881, `repoGradesUiState.ts` 647, `repoGradesUiState.test.ts` 779, `repoGrades.wiring.test.ts` 919. (881 matches the header-inline scope's own count at `repo-grades-header-controls-inline-scope.md:59`.)
- C3 `git rev-parse --short HEAD` -> `6977493c`.
- C4 `grep -n "loadTargetBranch\|persistTargetBranch\|TARGET_BRANCH" -r src --include=*.ts --include=*.tsx | grep -v "repoGradesUiState.test.ts\|repoGradesUiState.ts"` -> `index.tsx:37,44,498,824` and `repoGrades.wiring.test.ts:872,873` only.
- C5 `grep -rn "Optional, e.g. main" src docs --include=*.ts --include=*.tsx --include=*.md` -> `index.tsx:820` plus two docs quotations.
- C6 `grep -n "non-existent\|nonexistent\|does not exist\|404"` over the three `github-repos.*.test.ts` files -> only `grading.test.ts:260` (an empty/nonexistent FOLDER) and `unmerged-branch.test.ts:182-183` (a `listBranches` rejection).
- C7 `[ -f <p> ]` over the eight gate paths -> all `OK`.
- C8 `grep -rn "gradeRepoAction(" src --include=*.ts --include=*.tsx | grep -v "\.test\."` -> five production call sites: two UI hooks (pass the field) and three workflow steps (pass their own `branch`).
- Files opened and read (not just grepped): `docs/DEV_LOOP.md`, `docs/loop/seats.md`, `repoGradesUiState.ts:380-510`, `index.tsx:100-170,335-365,470-600,800-845`, `github-repos.ts:664-913`, `repo-grade-branch-scan.ts:255-338`, `repo-grade-merge-check.ts` (all), `github.digest.ts:255-330`, `github.files.ts:20-59`, `github.repos.ts:1-60,150-170`, `github-ref-name.ts` (all), `repoGradesUiState.test.ts:1-80,495-532`, `repoGrades.wiring.test.ts:855-919`, `repoGradesStorageKeys.structure.test.ts:1-60`, `repoGradesWaveASticky.structure.test.ts:240-270`, both concurrent scope docs' write-set sections.
- NOT opened, so not asserted: `docs/loop/traps-spec.md`, `traps-tests.md` (read only the seat card and `this-repo.md` sections 1 and 6-7), `gradingActionSeam.ts`, and the render-time/hydration behaviour of `RepoGradesTab`.
