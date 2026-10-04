# Repo grader W5: persist graded results across reload - data-seat analysis (fork F3)

Seat: data / storage (`docs/loop/seats.md`, "Data / storage"). Backlog item: A7,
wave W5 (`docs/BACKLOG.md`, the A7 row; `docs/repo-grader-smooth-scope.md`
section 6 fork F3, section 7 residual R4). Authored 2026-10-04 against HEAD
`a5e1b003` (`git rev-parse --short HEAD`).

Status: ANALYSIS ONLY. No production or test code was written. W5 build stays
gated on (a) the owner's F3 answer, (b) a loop-checker pass over THIS document,
and (c) the security seat's ruling on section 4. This document has not been
checked yet.

Every quantity names its instrument. Instruments used:

- `wc -l <file>` for line counts (LF files; `docs/loop/traps-spec.md` says it
  agrees with `@(Get-Content f).Count`).
- `node <script>` over the synthetic fixture in Appendix A for every byte
  figure. These are CHARACTER counts of `JSON.stringify(...).length`, which is
  what `localStorage` quota is spent in (see 1.4 for the unit caveat).
- `grep -n` / reading, with the `file:line` given inline.

---

## 0. What the tree already holds (brief from the tree, not from a doc)

Three facts change the question from "design persistence" to "ratify and
tighten a design that already exists on paper".

1. A peer-checked design for exactly this already exists and was never built.
   `docs/repo-grades-ux-overhaul-acceptance-criteria.md:566-571` (item 45) says
   graded results "survive a reload and a course switch ... persisted per
   course, with the un-restorable states (`grading`, `postStatus: "posting"`)
   unrepresentable in the stored type". Its "Storage design" table
   (`:1750-1765`) names a 14th key `ta-repo-grades-cells`, shape
   `Record<courseId, Record<repo, Record<folder, PersistedCellEdit>>>`, per-cell
   `at`, 500-cell cap evicting oldest, "never filtered against the current
   scan". Its section "Why persisting cellEdits is required, not preferred"
   (`:1767-1784`) gives the reason. NOT built at HEAD:
   `grep -rn "ta-repo-grades-cells" src` returns nothing, and
   `repoGradesStorageKeys.structure.test.ts:17-36` freezes 18 keys, none of them
   `cells`. Those are agent-authored acceptance criteria, not an owner ruling
   (the same status the scope gives AC5 item 25 for F2), which is why F3 is
   still an owner fork.
2. The code comment that justifies today's non-persistence is the thing F3
   would reverse. `src/app/components/repo-grades/index.tsx:178-181`: "never
   persisted to localStorage (a typed but un-posted score surviving a reload
   would be surprising ...)". It was written when a cell was graded one click at
   a time (`docs/repo-grades-ux-overhaul-acceptance-criteria.md:1771-1777`).
   F3=yes means that comment is deleted in the W5 diff.
3. Two sibling stores already persist graded student data to `localStorage`
   and are the house idiom to copy, not reinvent:
   - `src/lib/github-grading-run-store.ts` (key `ta-github-grading-run`,
     `:25`): pure serialize/parse pair, strips `submittedFiles` entirely
     (`:91-124`), parses field by field with no spread or cast (`:127-311`),
     returns "no run" on any malformed blob (`:316-370`), wraps both load and
     persist in try/catch (`:375-404`), and ships a pinned "restored from your
     last run, graded <date>" notice (`:409-418`).
   - `src/app/components/assessment-shared/useAssessmentRowStore.ts:92-107`:
     the two-tier quota fallback (full write, then reduced write, then a
     user-visible `persistError`; never swallowed).

---

## 1. WHAT is in the graded-result state today, and how big it can get

### 1.1 The state and where each field lives

One in-memory store: `const [cellEdits, setCellEdits] =
useState<RepoGradeCellEditsByRepo>(EMPTY_REPO_GRADE_CELL_EDITS)`
(`index.tsx:193`). Type: `Readonly<Record<repo, Readonly<Record<folder,
RepoGradeCellEdit>>>>` (`repoGradesCellEdits.ts:200`), two levels deep, raw repo
full name then raw folder name. Reset to empty on every course change
(`index.tsx:553-557`).

`RepoGradeCellEdit` (`repoGradesCellEdits.ts:55-154`), classified for
persistence:

| Field | Line | Written by | Class |
|---|---|---|---|
| `score: string` | :57 | grade call (`useRepoGradesGradingActions.ts:360`, bulk `useRepoGradesBulkGrade.ts:322-359`), hand edit (`handleScoreChange` `:222`) | KEEP (result) |
| `comment: string` | :66 | grade call sets directly (`:372`); box edits recompose via `applyRepoGradeFeedbackFieldEdit` (`repoGradesCellEdits.ts:190-198`) | KEEP (this is what posts) |
| `strengths`, `improvements`, `resubmitNotice` | :72, :75, :78 | grade call (`:373-375`), box edit (`:237-241`) | KEEP (the three boxes) |
| `grading: boolean` | :83 | grade call start/end | DROP: transient, un-restorable |
| `gradeError: string \| null` | :86 | grade call failure | DROP: a failed cell has no result; restoring an old error misleads |
| `postStatus` | :91 | post fan-out (`:546-562`, `:672-690`), score edit resets to "idle" (`:222`) | KEEP, narrowed (see 2.2): "posting" must not be restorable |
| `postMessage: string \| null` | :94 | post fan-out | KEEP (explains an error/skipped) |
| `rubricAreas: RubricAreaResult[]` | :102 | grade call only (`:376`) | KEEP: it is a POSTING-GUARD INPUT (see 1.2) |
| `generatedScore: string \| null` | :110 | grade call only (`:377`) | KEEP: posting-guard input |
| `generatedComment: string \| null` | :118 | grade call only (`:382`) | KEEP: posting-guard input |
| `submittedFiles: SubmittedFileInfo[]` | :134 | grade call (`:389`) | DROP: the heavy field |
| `submissionTruncated: boolean` | :141 | grade call (`:390`) | KEEP: one boolean, and it is the honesty flag (a restored grade must not look complete if the model saw a cut submission) |
| `codeExecution: CodeRunResult \| null` | :153 | grade call (`:402`) | DROP in v1 (see 2.3 for why persisting it alone is pointless today) |

### 1.2 Why "cheap result fields" is not simply score + feedback + posted

`rubricAreas`, `generatedScore` and `generatedComment` look like extra result
text but are inputs to the post path. `repoGradePostCandidateRows` copies all
three into each candidate (`repoGradesPosting.ts:296-300`), then
`buildRepoGradePostPlan` feeds them to `checkRowPostability` (`:347-352`, the
A13 guard that refuses an untouched, unreviewed row) and
`repoGradeBreakdownWillPost` (`:370-376`, which suppresses the rubric breakdown
when the score was hand-edited, using `generatedScore`). Restoring a graded cell
with those three nulled or emptied would silently change what posts: the
breakdown would be dropped (`repoGradeScoreWasEdited(current, null)` is true,
`:185-186`). They must round-trip exactly. This also means `comment` and
`generatedComment` are stored twice on purpose (they differ the moment the
instructor edits a box, which is the whole point of the A13 comparison), so the
duplication must NOT be "optimised" away.

### 1.3 The heavy fields, and a correction to the scope's premise

The scope (R4, `docs/repo-grader-smooth-scope.md:547`) says
`submittedFiles` with `rawBase64` must be dropped. On THIS view's producer the
`rawBase64` part is a no-op and the real weight is `previewContent`:

- This view calls `gradeRepoAction` with a folder path (`useRepoGradesGradingActions.ts:300-309`).
  Its files come from `repoDigestToEmbeddedEntry` (`src/app/actions/github-repos.ts:602-624`),
  which sets `name`, `extension`, `previewContent`, `previewTruncated` and
  `mimeType: "text/plain"` and sets NO `rawBase64`. (`rawBase64` is set by the
  Canvas/zip extraction paths: `src/lib/grade/extraction.ts:458,479,488`,
  `single-file-entry.ts:92,125`. They do not feed this view.) The engine passes
  `submittedFiles` straight through to the result (`src/lib/grade/engine.ts:200`),
  and the cell stores it as-is (`useRepoGradesGradingActions.ts:389`).
- A folder-scoped ingest uses `SCOPED_BUDGET = { maxFiles: 200, maxBytes:
  900_000, perFileBytes: 40_000, maxBlobBytes: 400_000 }`
  (`src/lib/github.digest.ts:181`, selected when `pathPrefix` is given at
  `:268`). So one cell can legitimately hold up to about 900,000 characters of
  source in `previewContent`.
- `codeExecution` streams are each capped at `CODE_RUN_OUTPUT_CAP_CHARS =
  20_000` (`src/lib/code-run-selection.ts:518`): up to 60,000 characters per
  cell across stdout, stderr and compileOutput.

The rule that follows: the persisted shape must not contain `submittedFiles` or
`codeExecution` at all (empty, not truncated). `previewContent` is the field to
name in the build brief, not `rawBase64`.

### 1.4 Size arithmetic

Fixture (Appendix A, run with `node`; every number below is its output).
Parameters are ASSUMPTIONS, stated so a checker can change them:

- Typical lean cell: strengths + improvements 600 chars together, 4 rubric areas
  of 90-char comments, the 87-char `RESUBMIT_NOTICE` (`src/lib/grade/types.ts:15`),
  `comment` and `generatedComment` each the composed text. Basis for the text
  length is a guess; no real graded output exists in this checkout.
- Worst-under-cap lean cell: strengths + improvements 2,200 chars, 6 areas of 90
  chars. Basis: the grading call's output budget is `DEFAULT_MAX_OUTPUT_TOKENS =
  700` (`src/lib/gemini.ts:24`), about 2,800 characters at an assumed 4
  characters per token, for the WHOLE response. That default is env-overridable
  (`GEMINI_MAX_OUTPUT_TOKENS`, `src/lib/gemini.ts:122-127`), and caps for the
  other providers were not measured, so "worst-under-cap" is a bound under the
  default only.
- Course shape: 30 rows (the scope's R4 wording), 1, 4 and 12 folders, every
  cell graded and posted (the densest case).

| Quantity | Chars | Instrument |
|---|---|---|
| One typical lean cell | 2,938 | `node appendix.js`, "cell typical lean" |
| One worst-under-cap lean cell | 8,028 | same, "cell worst-under-cap" |
| One typical cell WITH files (3 files, 6,000 chars total) and 500-char stdout | 9,849 | same |
| One cell carrying 900,000 chars of files (SCOPED_BUDGET ceiling) | 903,267 | same |
| 30 x 1, typical lean | 89,221 | same, "30 x 1" |
| 30 x 4, typical lean | 354,541 | same |
| 30 x 12, typical lean | 1,062,151 | same |
| 30 x 1 / 4 / 12, worst-under-cap lean | 241,921 / 965,341 / 2,894,551 | same |
| 30 x 4, typical WITH files | 1,183,861 | same |
| 30 x 12, typical WITH files | 3,550,111 | same |

Against the quota. The only quota figure in this repo is "roughly 5MB shared
with about a hundred other `ta-` keys"
(`docs/repo-grades-ux-overhaul-acceptance-criteria.md:1778-1780`). It is
recalled, not measured: no browser quota probe was run (section 8). Browsers
differ on whether the limit counts UTF-16 code units or bytes, so two budgets
are shown: B5 = 5,000,000 chars, B2.5 = 2,500,000 chars (the conservative
reading if two bytes per character are charged).

| Scenario | Chars | % of B5 | % of B2.5 |
|---|---|---|---|
| 30 x 4 typical lean | 354,541 | 7.1% | 14.2% |
| 30 x 12 typical lean | 1,062,151 | 21.2% | 42.5% |
| 30 x 12 worst-under-cap lean | 2,894,551 | 57.9% | 115.8% |
| 30 x 4 typical WITH files | 1,183,861 | 23.7% | 47.4% |
| 30 x 12 typical WITH files | 3,550,111 | 71.0% | 142.0% |
| ONE cell at the files ceiling | 903,267 | 18.1% | 36.1% |
| SIX cells at the files ceiling | 5,419,602 | 108.4% | 216.8% |

Reading: dropping `submittedFiles` and `codeExecution` is not an optimisation,
it is the difference between one course fitting and one pathological folder
evicting everything else. Typical files add 829,320 chars to a 30 x 4 course
(1,183,861 - 354,541), 2.34 times the lean size. The prior design's cost note
("roughly 1-2KB per graded cell", `...overhaul-acceptance-criteria.md:1777`) is
low against this fixture's 2.9 KB typical, 8.0 KB worst-under-cap; neither is a
measurement of real output (R-W5-1).

The prior design's "500-cell cap" is not a byte bound: 500 x 2,938 = 1,469,000
chars typical and 500 x 8,028 = 4,014,000 chars worst-under-cap (arithmetic on
the two cell figures above), i.e. up to 80% of B5 or 160% of B2.5 from this one
key. A byte budget is needed (2.4).

Serialisation cost (so a persist-per-change effect is not free): `node`
v22.14.0 on this machine, 50 iterations of `JSON.stringify` / `JSON.parse` on
the 30 x 4 typical-lean blob (342,981 chars in that run): 1.11 ms / 0.67 ms per
op; on the 30 x 12 worst-under-cap blob (2,856,561 chars): 5.99 ms / 3.18 ms.
This is Node, not a browser, and excludes the synchronous `setItem` I/O, so it
is an indication only. It justifies coalescing identical writes (2.4), not a
debounce timer.

### 1.5 An adjacent finding that decides whether W5 can persist reliably

The same origin already holds `ta-repo-grades-log`
(`repoGradesUiState.ts:94`), all courses in ONE key, capped by ENTRY COUNT
(`MAX_REPO_GRADE_LOG_ENTRIES = 500`, `repoGradesLog.ts:108`), not by bytes. At
HEAD a grade-succeeded entry's `detail` carries `Rubric used: <generated
rubric text>` whenever the rubric field was left blank
(`useRepoGradesGradingActions.ts:88-89`, used at `:346-354`; the bulk path has
a duplicate at `useRepoGradesBulkGrade.ts:88-89`, `:390-392`). The prior
design's log estimate (137-227 KB per course) predates that capture (its
"discarded at the destructure" premise, `...overhaul-acceptance-criteria.md:1786-1792`,
is no longer true at HEAD). Fixture arithmetic, 500 entries:

| Log scenario | Per entry | x 500 | % of B5 | % of B2.5 |
|---|---|---|---|---|
| short detail (330 chars) | 533 | 266,500 | 5.3% | 10.7% |
| 3,000-char generated rubric | 3,235 | 1,617,500 | 32.4% | 64.7% |
| 6,000-char generated rubric | 6,235 | 3,117,500 | 62.4% | 124.7% |

6,000 chars is `maxOutputTokens: 1500` for `generateRubric`
(`src/lib/grade/rubric.ts:294`) at the same assumed 4 chars/token. All numbers
are per course, one course in the key. A 30 x 12 typical-lean results blob
(1,062,151) plus the 3,000-char-rubric log (1,617,500) is 2,679,651 chars, 53.6%
of B5 and 107.2% of B2.5. Today every persist in `repoGradesUiState.ts` swallows
its throw (`:252`, `:285`, `:321`, `:345`, `:393`, ...), so the log's failure is
already silent; W5 makes that more likely. This is routed as residual R-W5-2,
not fixed here.

---

## 2. WHAT is dropped, what is kept, the persisted shape, the reconstruction

### 2.1 Persisted shape (typed interface, proposal for the W5 implementer)

```ts
import type { RubricAreaResult } from "@/lib/grade";

/** What survives to localStorage for ONE graded cell. Enumerated field by
 *  field on write (never spread `...edit`) so a future RepoGradeCellEdit field
 *  cannot leak into storage. NOT present, by design: grading, gradeError,
 *  submittedFiles, codeExecution, any Canvas user id or student identity. */
export interface PersistedRepoGradeCell {
  /** ISO 8601, supplied by the caller (the persister is pure). Eviction key and
   *  the "graded <date>" in the restored notice. Updated only when another
   *  field below changed since the last write. */
  at: string;
  score: string;
  comment: string;
  strengths: string;
  improvements: string;
  resubmitNotice: string;
  /** Narrowed: "posting" is not a member, so an in-flight post is
   *  unrepresentable in storage rather than sanitised on read. */
  postStatus: "idle" | "posted" | "error" | "skipped";
  postMessage: string | null;
  rubricAreas: RubricAreaResult[];
  generatedScore: string | null;
  generatedComment: string | null;
  submissionTruncated: boolean;
}

/** The blob under key "ta-repo-grades-cells":
 *  courseId -> repo full name -> folder name -> cell. Same nesting as
 *  RepoGradeCellEditsByRepo plus the outer course level (the prior design's
 *  shape, kept on purpose so nothing already peer-checked is reopened). */
export type PersistedRepoGradeCellsByCourse = Record<
  string,
  Record<string, Record<string, PersistedRepoGradeCell>>
>;
```

That is 12 fields. A cell is written only when it holds something worth
keeping: `score !== "" || comment !== "" || rubricAreas.length > 0 ||
postStatus !== "idle" || generatedScore !== null`. A cell that only ever held
`grading: true` is not written (`setRepoGradeCellEdit` creates entries for
those, `repoGradesCellEdits.ts:220-234`).

Serialization rule for the one state that cannot be stored: if `postStatus` is
`"posting"` at persist time it is written as `"error"` with `postMessage` =
"A reload interrupted this post. Check the Canvas gradebook before re-posting."
The post call may or may not have reached Canvas, and posting is neither
reversible nor idempotent (`RepoGradesGrid.tsx:24-27`; a repeat post duplicates
a student-visible comment). "error" keeps the row postable (postability does not
read `postStatus`, `repoGradesPosting.ts:255-335`) while telling the truth. It
must not map to "idle" (would hide that a post may have happened) and must not
be dropped.

### 2.2 Reconstruction on reload

| Piece | Source after reload |
|---|---|
| Rows, columns, folder presence, `status` ("ungraded"/"missing-folder"/"scan-error"), bindings, `canvasUserId` | Re-derived from the org scan by the pure `buildRepoGradeGridModel` (`repoGradesRows.ts:203-217`), exactly as today. The persisted blob carries NO identity: the post path reads `row.binding.canvasUserId` live (`repoGradesPosting.ts:294`), so a re-bound student can never be posted to by a stale stored id. |
| Folder-to-assignment mapping | Its own key `ta-repo-grades-assignment-map`, unchanged (`repoGradesUiState.ts:45`). |
| The 12 persisted fields | Restored from storage into a `RepoGradeCellEdit` via a typed mapper, with `grading: false`, `gradeError: null`, `submittedFiles: []`, `codeExecution: null` re-supplied (the pattern of `github-grading-run-store.ts:252-254`). |
| `submittedFiles`, `codeExecution` | NOT re-fetched. They return only by pressing Grade on that cell, which is a model call. The Grade button is always rendered (`RepoGradeCellControl.tsx:572-575`), so the recovery path exists and costs one call. |
| The score-edit-resets-posted rule (B5) | Unchanged: it is a writer (`:222`), not state. |

Where restore plugs in: the existing course-change block already resets
`cellEdits` and restores the log in one render-phase branch
(`index.tsx:553-574`). The restore is `setCellEdits(restore(loadCells(courseId)))`
in place of `setCellEdits(EMPTY_REPO_GRADE_CELL_EDITS)` at `:555`. The scan has
not loaded at that moment (`model` is null), so no filtering against the roster
is possible or wanted there (2.4, "filter on read").

### 2.3 A reachability finding the UX seat must see: restored cells lose three controls

In `RepoGradeCellControl.tsx` the "Browse files" button (`:604-615`), the Run
control and the grading-time code-run summary (`:476-506`, the
`displayedCodeRun` block sits INSIDE the `edit.submittedFiles.length > 0 &&`
gate that opens at `:476`) are all gated on `submittedFiles.length > 0`. So a
restored cell shows score, three boxes, rubric areas and post state, and shows
no Browse files, no Run, and no code-run line. Persisting `codeExecution` alone
therefore buys nothing today: the gate hides it. The comment at
`repoGradesCellEdits.ts:142-151` says an execution-influenced grade "must be
visible to the instructor who has to defend it". Two ways to honour that, both
OUT of this document's authority:

- (v1, recommended) persist nothing of the code run; the restored banner (2.5)
  says "files and code-run output are not kept; Grade a cell again to see
  them".
- (v1.1) persist a summary-only `codeRunSummary` (language, entryPoint, ran,
  exitCode, timedOut, neededStdin; no stdout/stderr/compileOutput), a few
  hundred characters, and move that one line out of the files gate. Needs the UX
  seat and a change to `RepoGradeCellControl.tsx`.

### 2.4 Key, scoping, eviction and staleness

Key: one new quoted literal, `ta-repo-grades-cells`, in
`repoGradesUiState.ts` next to the other 18 (the prior design's name, kept).
Reasons it is one key and not `ta-repo-grades-cells-<courseId>`:

- The key canary derives its set with `/"(ta-[a-z0-9-]*)"/g` over
  `repoGradesUiState.ts` only (`repoGradesStorageKeys.structure.test.ts:13-15`).
  A key assembled in a template literal, or declared in a different file, is
  invisible to it. A per-course key would silently escape the canary.
- It matches the three existing per-course blobs (`ASSIGNMENT_MAP_KEY` `:45`,
  `LOG_KEY` `:94`, `FOLDER_KEY` `:109`).
- Cost of one key: every persist is read-modify-write of all courses, and a
  quota failure affects all courses. Mitigated by the byte budget below.

Identity scoping: course id, then repo, then folder. Not assignment id: the
folder-to-assignment mapping is a separate, user-editable key, and a result is
a result for a folder's content. Consequence, stated honestly: if the
instructor remaps a folder to a different Canvas assignment after posting, a
restored "posted" marker describes the OLD assignment. This is identical to
in-session behaviour today (`handleAssignmentChange`, `index.tsx:420-437`, does
not touch `cellEdits`), so persistence extends the lifetime of an existing
condition rather than creating one. Stamping `postedAssignmentId` at post time
(three writers: `useRepoGradesGradingActions.ts:546-562`, `:672-690`, and the
fan-out) would close it; recommended as v1.1, residual R-W5-5.

Eviction (byte budget, proposal): constant `RESULTS_MAX_CHARS = 1,000,000`
(20% of B5, 40% of B2.5; an arbitrary proposal, the implementer may change it
but it must be a named, test-pinned constant). On write, if
`JSON.stringify(blob).length` exceeds it, drop cells in ascending `at` order
until it fits. At the fixture's cell sizes that is 340 typical cells
(1,000,000 / 2,938) or 124 worst-under-cap cells (1,000,000 / 8,028). A
30 x 12 course (360 cells) at typical size does not fit whole; the oldest folders
fall off first. That is a stated limit of the localStorage option, not a bug.
Quota fallback, copying `useAssessmentRowStore.ts:92-107`: if `setItem` throws,
evict the oldest 25% of cells and retry once; if that throws, report
"saved results could not be stored" to the user (a visible `persistError`) and
keep working in memory. Never throw into render, never swallow silently (the
existing view-state persisters swallow, `repoGradesUiState.ts:252`; that is
acceptable for a control value and not for model spend).

Write coalescing: persist from an effect keyed on `cellEdits`, guarded by the
same `cellStateResetForCourse === uiState.courseId` condition the log effect
uses (`index.tsx:576-595`, the first-commit hazard closure), and skip the write
when the serialized current-course slice equals the last string written (a ref).
`grading` toggles and keystrokes in unrelated fields then cost a compare, not a
write. `at` is refreshed only for a cell whose persisted fields changed.

Staleness policy. What a restored result can be stale against, and the policy:

| Axis | Detectable now? | Policy |
|---|---|---|
| Student pushed new commits after grading | No. The cell carries no commit sha and `repoDigestToEmbeddedEntry` sets no `gradedRef` (`github-repos.ts:618-623`). | Show the graded-at date; never auto-regrade; the instructor presses Grade. Residual R-W5-4. |
| Rubric or instructions changed since grading | No per-cell fingerprint is stored. A client-side hash is not free: `rubricFingerprint` imports `node:crypto` (`src/lib/research/rubric-fingerprint.ts:14`); whether it bundles client-side was NOT verified, do not depend on it. | Same: graded-at date. Residual R-W5-4. |
| Course changed | Yes: results are keyed by course id; restore happens in the course-change branch (`index.tsx:553`). | Per-course isolation by key. |
| Repo or folder no longer in the current scan (org prefix filter changed, repo deleted) | Yes, after the scan settles. | FILTER ON READ, never delete on read. A persisted cell with no matching row is simply not displayed and stays in storage. This is the prior design's settled rule (`...overhaul-acceptance-criteria.md:1634-1655`: a write-back of a filtered result erased real data). A narrower org prefix must not destroy graded work for the repos it hides. |
| Student re-bound to a different Canvas user | Yes: identity is not persisted, it is read live at post time. | Nothing stored to go stale. |
| Age | Yes (`at`). | Eviction by byte budget (above). No TTL in v1: a TTL would delete model spend on a date rather than on pressure. Owner may add one. |

Canary and file impact when W5 builds (counts are what the repo's own gates pin
today, `repoGradesStorageKeys.structure.test.ts:21-39`, `K1` title "frozen 18"):

- `repoGradesStorageKeys.structure.test.ts`: FROZEN_KEYS 18 -> 19 and the K1 test
  title, same commit. The new key must live in `repoGradesUiState.ts` or K1 does
  not see it. `componentStorageKeys.structure.test.ts` is non-recursive
  (`:11-19`) and never sees this directory; this directory's own canary is the
  only one that applies.
- If the pure serialize/parse/restore code is a new leaf file (recommended: the
  pattern of `repoGradesLog.ts` plus wrappers in `repoGradesUiState.ts`), the R-2
  frozen-roots list in `repoGradesFeedbackAndFiles.wiring.test.ts:304-346` goes
  35 -> 36 in the same commit. The W1 wave left main red by missing exactly this
  (`docs/BACKLOG.md`, A7 row, "W1-GATE MISS").
- `repoGradesUiState.ts` is 606 lines, `index.tsx` is 960, ceiling 1000
  (`wc -l`; `src/file-size-ceiling.structure.test.ts:30`). index.tsx has 40
  lines of headroom, so the restore branch, the persist effect and the deleted
  `:178-181` comment must land as a hook in the new leaf area, with a net index.tsx
  change of a few lines. The scope already says W5 requires an extraction first.

### 2.5 The restored-results notice

A restored grade must never read as a fresh one. Copy the sibling's pattern
(`github-grading-run-store.ts:409-418`): a pure function in the leaf with the
wording pinned by a node-env test, since no component renders under vitest. A
proposal, not a requirement on the wording: "Restored N graded cell(s), most
recent graded <date>. Files and code-run output are not kept; Grade a cell again
to see them." Shown only when at least one restored cell matches a displayed row.
Pair it with a "Discard saved results for this course" control behind
`window.confirm` that clears the course slice from storage and from state, since
without it a stale restored batch can only be overwritten cell by cell. Whether
that control ships in v1 is a UX-seat call; the data requirement is only that a
clear path exists and removes both copies.

---

## 3. FAILURE MODES and SAFETY

| # | Failure | Required behaviour | Evidence it can be held |
|---|---|---|---|
| F-1 | `setItem` throws `QuotaExceededError` (or private-mode throws on any set) | Caught (catch, never by `err.name`, the precedent's own discipline, `useAssessmentRowStore.ts:26`). Evict oldest 25% and retry once; then visible `persistError`; state stays in memory. Never rethrown into render. | House idiom exists; this repo's persisters currently swallow silently, so the visible-error half is NEW and must be tested. |
| F-2 | Corrupt JSON, wrong type, hand-edited blob | Parse never throws. Drop a bad CELL, keep its siblings (cells are independent; unlike `github-grading-run-store.ts` where one bad result voids the run, a run being whole is a different invariant). Bad whole blob -> empty. | `parseLogByCourse` / `parseAssignmentMapByCourse` precedent (`repoGradesUiState.ts:311-324, 359-372`). |
| F-3 | A typed select or a raw cast of parsed JSON | Forbidden. Every field read out by hand with `typeof` checks, `postStatus` checked against the 4-member union, `rubricAreas` rebuilt element by element, nothing spread. This is the `mapRecordingFile` / "supabase typed rows collapse to never" lesson applied to `JSON.parse`'s `unknown`: map through an explicitly typed mapper. | `github-grading-run-store.ts:141-311`. |
| F-4 | Raw repo/folder names as plain-object keys | The parser builds containers with `Object.create(null)` or a `Map` and reads with an own-property check. A folder literally named `constructor` or `__proto__` must not resolve to an inherited member. Pre-existing, by reading and not run: `getRepoGradeCellEdit` does `edits[repo]?.[folder] ?? default` (`repoGradesCellEdits.ts:209`), so a folder named `constructor` under a repo that has any edit returns `Object`. The same hazard is recorded for the mapping lookup (`...overhaul-acceptance-criteria.md:1733-1741`). Not fixed by W5; persistence must not widen it. | Reading. |
| F-5 | Unknown or old shape version | No `v` field: the new blob is parsed additively (new optional fields default, required ones strict). A breaking change renames the key, which the canary then forces to be a visible decision. (Do NOT add a `v` key to any EXISTING blob: `parseAssignmentMapByCourse`/`parseLogByCourse` treat every top-level key as a course id, `...overhaul-acceptance-criteria.md:1760-1765`.) | Reading. |
| F-6 | A persisted result no longer matches roster/rubric | See the staleness table in 2.4: filter on read for roster, graded-at date for rubric and repo content. Residuals R-W5-3, R-W5-4. | |
| F-7 | PRECONDITION. Course switch while a grade or bulk run is in flight | At HEAD nothing stops it: the course select is disabled only for `coursesLoading || courses.length === 0` (`RepoGradesControls.tsx:368`), and `useRepoGradesBulkGrade.ts` carries no course id (`grep -n courseId` on it returns nothing). In-flight workers keep calling `setCellEdits` (`useRepoGradesGradingActions.ts:732-734`) and their writes land in the NEW course's state. Today that is transient. Under W5 the persist effect writes the current course's state under the current course id, so course A's grades become durably stored under course B. Requirement: no write produced by course A's run may be persisted under course B. Options: (L) lock the course select while any grade/bulk/post is in flight (the prior design's U5.22, `...overhaul-acceptance-criteria.md:1682-1693`); (R) capture the course id at call time and drop or reroute a late write whose captured id no longer matches. Recommend (L) (smaller, already specified) with a lifecycle test, and (R) only if (L) is declined. | The hazard is by reading; the course-select code and the hook were opened. |
| F-8 | Two tabs open | Last writer wins at course granularity: a tab that did not see the other's grading overwrites it on its next persist. No `storage` listener exists. Accepted limitation; not testable here. | Reading. |
| F-9 | Session end | `ta-repo-grades-cells` is NOT in the sweep keep-list (`DEVICE_PREFERENCE_KEYS = ["ta-theme"]`, `src/lib/client-state-sweep.ts:45`; `shouldKeepLocalStorageKey` `:140-144`), so it is erased on an owner change by `setCacheOwner` -> `sweepClientState()` (`src/lib/workflows/run-form-options-cache.ts:182-212`, called from `src/context/SupabaseProvider.tsx:60,76`). A plain reload keeps it (same-owner marker, `:190-193`). Whether a token-refresh failure emits a sign-out event that also sweeps was NOT verified; if it does, graded results are lost on session expiry exactly as every other `ta-` key already is. | Opened; the Supabase event behaviour was not. |

Never persisted, restated because each is a separate leak route: `submittedFiles`
and `codeExecution` (student source and program output), any Canvas user id, any
rubric text (a per-cell generated rubric can be about 6,000 chars,
`rubric.ts:294`; keeping it is the separate U9.44 feature,
`...overhaul-acceptance-criteria.md:560-565`, and would add 30 distinct rubrics
x up to 6,000 chars to the budget).

Behaviour change to flag for the UX and security seats: the per-cell Post button
requires an arming click only while `postStatus === "idle"`
(`RepoGradeCellControl.tsx:332, 586-595`). A restored "posted" or "error" cell
is therefore a one-click re-post, where after a reload today it is an armed
first-post. That is the same state a cell is in mid-session after its first post,
and the column-level Post still carries the `window.confirm`
(`useRepoGradesGradingActions.ts:522`), so it is parity with in-session behaviour,
not a new bypass; it is flagged because the reload is what used to reset the
arming.

---

## 4. Privacy and the seats that must rule

Student-identifying data at rest in browser storage: the repo full name is the
row key and normally embeds the student's GitHub username, next to a score and
free-text feedback. This is NOT a new class for this app:

- `ta-repo-grades-log` already stores repo + folder + score + free-text detail,
  including `Feedback: <text>` (`useRepoGradesGradingActions.ts:347`) and the
  generated rubric, per course, up to 500 entries (`repoGradesLog.ts:85-108`).
- `ta-github-grading-run` stores whole graded runs (student, score, comments)
  (`github-grading-run-store.ts:25-124`).

What W5 ADDS over those: the full strengths/improvements prose, the per-criterion
rubric comments, and the posted marker, per repo per folder, for every graded
cell. Mitigation that already exists: the owner-change sweep (F-9). What it does
not cover: a shared machine where the instructor never signs out and never
changes owner; the data stays readable by any script on the origin until then
(same as the log). A hand-edited blob can set a score or a posted flag, but that
equals the instructor typing it: posting still goes through `checkRowPostability`
and the confirm, and the server action is the real boundary. No new trust
boundary is crossed (reading claim).

FLAGGED, not decided here:

- SECURITY SEAT: rule on the privacy delta above (student identifiers plus
  feedback prose at rest in the browser) and on whether "swept on sign-out" is
  sufficient retention control, before any W5 code. `docs/loop/seats.md` runs
  security in wave 2; this document is wave 1 input to it.
- OWNER: F3 itself includes accepting that delta (section 5).

---

## 5. THE F3 DECISION INPUT

This is analysis, not a build. W5 build stays gated on the owner's F3 answer,
a loop-checker pass over this document, and the security seat's section 4 ruling.

### 5.1 The options compared

| Option | What | Cost | Verdict |
|---|---|---|---|
| A. Per-course `localStorage`, lean shape (this document) | Key `ta-repo-grades-cells`, 12 fields, byte-budgeted, filter on read | New leaf + wrappers, one canary key (18 -> 19), probably R-2 35 -> 36, one hook extraction out of `index.tsx` (960/1000), F-7 precondition. Per-device, swept on sign-out, quota-limited (1.4). No migration, no DB. | Recommended if F3 = yes |
| B. A Supabase table | Per user, per course; cross-device, no browser quota, survives the sweep | Migration (stored generated column for any nullable uniqueness key, idempotent RLS, `docs/loop/seats.md` Data checker), a server action, an explicitly typed row mapper (typed selects collapse to `never`). Student feedback prose moves server-side, which needs its own security ruling. Not verifiable here: no live database, RLS and migration application are unprovable (`docs/loop/this-repo.md` section 6). | Not recommended for v1: nothing in this checkout can prove it works |
| C. Do not persist | Ship W1-W3 as built | See 5.2 | The F3 = no outcome |

### 5.2 Cost of being wrong

F3 = YES (persist), and wrong:

- Stale results mistaken for current. A restored grade for a repo the student has
  since changed, or against a rubric since edited, is posted. Posting is neither
  reversible nor idempotent (`RepoGradesGrid.tsx:24-27`). Mitigations (graded-at
  date, Grade always available, column confirm) reduce but do not detect it
  (R-W5-4). The likelihood is not measurable here.
- Silent partial persistence if the visible `persistError` half is not built:
  the instructor trusts a reload that then loses cells (1.4, 1.5).
- A real privacy delta (section 4) and a reversal of the documented non-persistence
  comment (`index.tsx:178-181`).
- Build cost: roughly the files named in 2.4 plus the F-7 lock; no estimate of
  effort is claimed.

F3 = NO, and wrong:

- Every reload discards graded work. Model spend per reload is small: at
  `gemini.ts:55-58`'s own estimate of at most about $0.025 per submission
  (a comment in source, 2026 prices, input only, not a billed figure), a 30-repo
  column is at most about $0.75. The larger loss is the instructor's own
  review: hand-edited scores and feedback boxes, which cannot be bought back.
- `buildBulkGradePlan`'s only guard against re-spend ("already graded",
  `repoGradesBulkGrade.ts:116-122`) is defeated by reload: one click on Grade
  all re-grades everything, and overwrites nothing only because the scores are
  already gone.
- The posted marker is lost on reload, so a column that was posted shows "Post N"
  again (`RepoGradesGrid.tsx:327`, `RepoGradesRunBar.tsx:63` read
  `postStatus !== "idle"`). The log still shows what was posted; the grid does
  not.

### 5.3 Recommendation

F3 = YES, Option A, lean shape, with three conditions that the build owes before
it ships: (1) the security seat's ruling on section 4; (2) the F-7 course-switch
lock (or routing); (3) the visible `persistError` and the restored-results
banner. Reason: the money is small, but the review work and the double-post
guard are not, and the shape that makes it safe (12 fields, nothing heavy,
nothing identifying) is cheap to hold. This is MY reading, not an owner ruling;
nothing has been started on it (analysis only).

### 5.4 The one owner question (every answer terminates the activity)

F3: persist graded results across reload?

- YES: W5 is built as Option A as specified in sections 2 to 3, gated on the
  security ruling; this accepts student identifiers plus feedback prose at rest in
  browser storage (already true of the activity log), and accepts that files and
  code-run output are not kept (re-grade to see them).
- NO: W5 is not built; the scope ships W1-W3 as they stand and the reload cost in
  5.2 stays documented; this document is retained as the record.

Either answer ends this item. The implementer-level choices (the byte budget
constant, the 25% eviction step, the banner wording, v1 vs v1.1 for
`codeRunSummary` and `postedAssignmentId`) are defaults in this document and are
NOT part of the question.

---

## 6. Proposed data-layer pass conditions (for the test seat, not written here)

Each names the object compared, the instrument, and the direction of failure.

| Id | Object | Instrument | Fails when |
|---|---|---|---|
| P1 | The key set of the persisted cell produced from a full `RepoGradeCellEdit` | `Object.keys(toPersisted(edit))` against a frozen 12-element literal | the set gains OR loses a member (a leaked field, or a dropped guard input) |
| P2 | Serialized length of one cell carrying `submittedFiles` with a 900,000-char `previewContent` and a 60,000-char `codeExecution` | `JSON.stringify(blob).length` of the persisted blob | length exceeds the lean-cell figure plus a small margin (heavy field leaked); also assert a unique marker string placed in `previewContent` is absent from the serialized text |
| P3 | `buildRepoGradePostPlan` output before and after `restore(persist(edit))` | call the real function on both candidate rows | the two plans differ in `postable`, `skipped` or the rubric breakdown (a guard input did not round-trip) |
| P4 | `postStatus` after `parse(serialize(cell with "posting"))` | the parser | the result is "posting", or "idle", or the cell is dropped (it must be "error" with the interrupted message) |
| P5 | A blob with one malformed cell among valid ones, and a non-JSON string | the parser | it throws, or it drops a VALID sibling, or it returns a partial cell |
| P6 | A fake storage whose `setItem` throws once, then always | the persister | it throws into the caller, or reports success while nothing was stored, or fails to retry after evicting |
| P7 | A repo with a folder named `constructor` and one named `__proto__` | the parser plus `getRepoGradeCellEdit` on the restored state | an inherited member is returned as a cell |
| P8 | A late write from a stale course id during a simulated run | the lifecycle seam | the write is persisted under a different course id than it was produced for |
| P9 | The key canary and the roots canary | `npm run test:paths src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts` | either count differs from the frozen literal after the new key and file |

A sabotage requirement for the test seat: P1 and P2 must each be shown to fail
against a mutant that spreads `...edit` into the stored object.

---

## 7. Disposition of prior requirements

This document restructures nothing of its own, but it reconciles the prior
design (`docs/repo-grades-ux-overhaul-acceptance-criteria.md` item 45 and its
Storage design table) and the scope's R8/R4. Nothing is silently dropped.

| Prior requirement | Source | Disposition |
|---|---|---|
| Graded results survive reload and course switch, per course | U9.45 `:566-571`; scope R8 | KEPT as the F3=yes outcome (this doc, 2.1-2.4) |
| Un-restorable states unrepresentable in the stored type | U9.45 | KEPT and strengthened: `postStatus` union excludes "posting"; a "posting" at persist time is written as "error" with the interrupted message (2.1) |
| Key `ta-repo-grades-cells`, shape `courseId -> repo -> folder -> cell`, per-cell `at` | Storage design table `:1757` | KEPT unchanged |
| 500-cell cap evicting oldest | same | CHANGED to a byte budget; reason: 500 cells is up to 4,014,000 chars worst-under-cap (1.4), not a bound. The 500-cell cap is superseded, not lost: the budget evicts oldest-first the same way |
| Never filter against the current scan | same, `:1634-1655` | KEPT (filter on read) |
| Persist the "posted" marker | scope R8 `:317-321` | KEPT: `postStatus` and `postMessage` are persisted |
| Drop `submittedFiles` `rawBase64` | scope R4 | KEPT and CORRECTED: also `previewContent`, the heavy field on this view's producer; `rawBase64` is absent on this path (1.3) |
| Cost "roughly 1-2KB per graded cell" | `...overhaul-acceptance-criteria.md:1777` | REPLACED by the fixture figures (2.9 KB typical, 8.0 KB worst-under-cap), both still assumption-bound (R-W5-1) |
| Log "137-227KB per course" | `:1778` | REPLACED: stale at HEAD because the generated rubric is now logged (1.5); routed as R-W5-2 |
| Disable the course select during a run | U5.22, `:1682-1693` | HANDED to the W5 implementer and the UX seat as the F-7 precondition, with option (R) as the data-layer alternative |
| Per-cell `rubricText` (U9.44) | `:560-565` | WITHDRAWN from W5 (a separate review-surface feature; adding it would add up to 6,000 chars per cell to the budget); not enforced by anything today |
| Scope R4 "byte length of a realistic 30-row JSON" | scope `:547` | NOT DISCHARGED: this is a synthetic fixture. Real byte length is residual R-W5-1 |

---

## 8. Residual register

| Id | Not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-W5-1 | Real per-cell and per-course size (the fixture text lengths are assumptions), and the real browser quota and its unit. Never measured: no browser quota probe, no real graded output in this checkout | owner | DevTools snippet in Appendix B, run in the real app after one real graded run | before the W5 build brief sets `RESULTS_MAX_CHARS`; re-run at W5 verify |
| R-W5-2 | The activity log can reach 1.6 to 3.1 million chars per course (1.5) and silently stops being written on quota | orchestrator to route; owner of the fix is the next chunk touching `repoGradesLog.ts` | a byte-length assertion over a 500-entry fixture with a generated-rubric detail | filed as its own backlog row before W5 ships persistence; W5 verify re-reads it |
| R-W5-3 | Whether a token-refresh failure emits a sign-out event that sweeps all `ta-` keys (F-9) | owner | sign in, let the session expire in a real browser, check `localStorage` | owner walk; before W5 is advertised as surviving a session |
| R-W5-4 | No detection of a repo changed or rubric edited since grading (2.4 staleness table) | W5 UX seat / owner | per-cell commit sha and rubric fingerprint, if the owner wants detection; today only the graded-at date | W5 UX pass; a follow-up wave if wanted |
| R-W5-5 | `postedAssignmentId` not stamped, so a remap after posting leaves a stale "posted" (parity with in-session) | W5 implementer | a test that remaps then restores and asserts the marker's assignment | v1.1 wave; recorded against W5 |
| R-W5-6 | Restored cells show no Browse files, Run, or code-run line (2.3) | UX seat | read `RepoGradeCellControl.tsx:476-506, 604-615` after the W5 diff | W5 follow-up UX pass |
| R-W5-7 | Multi-tab last-writer-wins (F-8) | accepted | none available here (no browser) | none; accepted limitation |
| R-W5-8 | Security ruling on student identifiers and feedback prose at rest | security seat | read of this document plus `client-state-sweep.ts` | before any W5 code |

R-W5-2 and R-W5-8 are the two that can block the build. All others are known
limits that ship with a stated owner.

---

## 9. What I could not determine

- No real graded output, quota, or browser measurement was possible (no `.env`,
  no rendered component, no live database; `docs/loop/this-repo.md` section 6).
  Every byte figure is a synthetic-fixture figure under stated assumptions.
- The localStorage quota unit (chars vs bytes) and total are recalled from the
  prior design, not measured.
- Whether `node:crypto` in `rubric-fingerprint.ts` bundles client-side.
- Whether Supabase emits a sign-out event on a failed token refresh.
- The display consequence of F-7 (whether course A's repos can appear in course
  B's grid) was not traced; the durable-write path was.
- No test was run. The document is not read by any test except the no-emoji and
  source-bytes scans; the gate below covers only those.

## 10. Commands that produced this document's measured facts

- `git rev-parse --short HEAD` -> `a5e1b003`.
- `wc -l` -> `index.tsx` 960, `repoGradesUiState.ts` 606,
  `useRepoGradesGradingActions.ts` 825, `repoGradesCellEdits.ts` 264,
  `repoGradesStorageKeys.structure.test.ts` 66.
- `grep -rn "ta-repo-grades-cells" src` -> no match; the key does not exist.
- `grep -n "courseId" src/app/components/repo-grades/useRepoGradesBulkGrade.ts` ->
  no match.
- `node` over Appendix A -> every figure in 1.4 and 1.5.
- Docs gate (this doc is the only changed file; the wrapper takes the three paths
  one per argument):
  `npm run test:paths src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/tools/vitest-paths/gate-commands.structure.test.ts`
  (the `docs:gate` script, `package.json:22`). Wrapper per-argument lines, run
  2026-10-04 before the commit: `COVERED src/lib/no-emojis.test.ts files=1
  passed=18`, `COVERED src/source-bytes.structure.test.ts files=1 passed=3`,
  `COVERED src/tools/vitest-paths/gate-commands.structure.test.ts files=1
  passed=28`. These prove only that the document has no emoji or stray bytes;
  nothing in the suite reads its claims.

---

## Appendix A: size fixture (run with `node`)

```js
const NOTICE = "You are welcome to resubmit this assignment, and I will regrade it with no late penalty.";
const rep = (s, n) => { let o = ""; while (o.length < n) o += s + " "; return o.slice(0, n).trim(); };
// X = chars of strengths+improvements together; areas = rubric areas of 90 chars each
function cell(X, areas, files, code) {
  const st = rep("The solution reads clearly and the functions are well named.", Math.floor(X / 2));
  const im = rep("Consider handling the empty input case and adding a unit test.", Math.ceil(X / 2));
  const comment = [st, im, NOTICE].join(" ");
  return {
    score: "18/20", comment, strengths: st, improvements: im, resubmitNotice: NOTICE,
    grading: false, gradeError: null, postStatus: "posted", postMessage: null,
    rubricAreas: Array.from({ length: areas }, (_, i) => ({ area: "Criterion " + (i + 1) + " name", score: "4/5", comment: rep("Met most expectations here.", 90) })),
    generatedScore: "18/20", generatedComment: comment, submissionTruncated: false,
    submittedFiles: files ? Array.from({ length: 3 }, (_, i) => ({ name: "week-1/f" + i + ".py", extension: "py", previewContent: "x".repeat(files / 3), previewTruncated: false, mimeType: "text/plain" })) : [],
    codeExecution: code ? { language: "python", files: ["a.py"], ran: true, exitCode: 0, stdout: "o".repeat(code), stderr: "" } : null,
  };
}
const blob = (rows, folders, mk) => { const b = {}; for (let r = 0; r < rows; r++) { const k = "myorg/student-name-" + String(r).padStart(2, "0"); b[k] = {}; for (let f = 0; f < folders; f++) b[k]["week-" + (f + 1)] = mk(); } return JSON.stringify(b).length; };
const one = (c) => JSON.stringify(c).length;
console.log("cell typical lean   (X=600, 4 areas):", one(cell(600, 4, 0, 0)));
console.log("cell worst-under-cap (X=2200, 6 areas):", one(cell(2200, 6, 0, 0)));
console.log("cell typical WITH files 6000 + code 500:", one(cell(600, 4, 6000, 500)));
console.log("cell with 900000 of files:", one(cell(600, 4, 900000, 0)));
for (const f of [1, 4, 12]) console.log("30 x " + f, "typical lean:", blob(30, f, () => cell(600, 4, 0, 0)), "| worst-under-cap:", blob(30, f, () => cell(2200, 6, 0, 0)), "| typical WITH files:", blob(30, f, () => cell(600, 4, 6000, 500)));
const entry = (d) => JSON.stringify({ at: "2026-10-04T12:00:00.000Z", kind: "grade-succeeded", courseId: "12345", courseName: "CS 101 Intro", repo: "myorg/student-name-00", folder: "week-1", assignmentId: "999", score: "18/20", detail: d }).length;
console.log("log entry, short detail (330 chars):", entry("d".repeat(330)), "x500 =", 500 * entry("d".repeat(330)));
console.log("log entry, 6000-char generated rubric:", entry("Graded by gemini | Rubric used: " + "r".repeat(6000)), "x500 =", 500 * entry("Graded by gemini | Rubric used: " + "r".repeat(6000)));
console.log("log entry, 3000-char generated rubric:", entry("Graded by gemini | Rubric used: " + "r".repeat(3000)), "x500 =", 500 * entry("Graded by gemini | Rubric used: " + "r".repeat(3000)));
```

Output captured 2026-10-04: typical lean cell 2938; worst-under-cap 8028;
typical with files 9849; 900,000-char-files cell 903267; 30x1 89221 / 241921 /
296551; 30x4 354541 / 965341 / 1183861; 30x12 1062151 / 2894551 / 3550111;
log entries 533 (x500 = 266500), 6235 (x500 = 3117500), 3235 (x500 = 1617500).

## Appendix B: owner DevTools snippet for R-W5-1 (NOT RUN)

Paste on any page of the running app origin. It lists the largest `ta-` keys
by character count and probes the quota with a temporary key it then removes.
It has not been run: no real app session is available here.

```js
(() => {
  const rows = [];
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const n = (localStorage.getItem(k) || "").length;
    total += k.length + n;
    rows.push([k, n]);
  }
  rows.sort((a, b) => b[1] - a[1]);
  console.table(rows.slice(0, 15));
  let lo = 0, hi = 20000000;
  const probe = "ta-quota-probe";
  while (hi - lo > 100000) {
    const mid = Math.floor((lo + hi) / 2);
    try { localStorage.setItem(probe, "x".repeat(mid)); lo = mid; } catch { hi = mid; }
  }
  localStorage.removeItem(probe);
  console.log(JSON.stringify({ totalCharsKeysPlusValues: total, additionalCharsAccepted: lo, ta_repo_grades_log: (localStorage.getItem("ta-repo-grades-log") || "").length }));
})();
```
