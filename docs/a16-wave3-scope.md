# A16 wave 3 scope: class trends on Repo Grades

Architecture seat, 2026-09-21, written against `434ad5e`. This decides SHAPE for
A16-5 (`docs/a16-plan.md` section 2, row 3, and section 3.5). It is not a build
brief. Sections 7, 10, 11 and 12 are the build packet. Sections 1-6 and 13-17
are the argument, written for the checker and the orchestrator.

**Headline, four findings. Every one is measured below.**

1. **Repo Grades HAS a run boundary.** It is the column's "Grade all" click. One
   handler, `handleGradeColumn(folder)`, builds one plan over ONE folder and
   resolves ONE rubric. It then awaits one pool run, `runBulkGrade(plan,
   resolved)`. This surface fits A16's shape. It is not another A24.
2. **The data gap sits at the RUN AGGREGATE, not at the result.** Every
   successful target's `gradeRepoAction` returns a full `GradingRun` whose
   `results` carry `rubricAreas`. The hook copies those areas into each cell's
   live state, but the run's only aggregate record, `BulkGradeOutcome`, has no
   `rubricAreas` field. When the run ends, nothing holds the run's results
   together. Wave 3's first job is a collector inside the run. It is not a
   server-side widening like A16-2.
3. **No trends mount exists on this surface.** The absence is canaried, and it
   was found by searching for what the surface would put on screen, not only by
   type name.
4. **The published floor (plan 3.5) missed a CERTAIN edit.** Adding any non-test
   `.ts` file to `repo-grades/` turns red a frozen 32-entry root census in
   `repoGradesFeedbackAndFiles.wiring.test.ts`, and that census is not in the
   floor. Two of the floor's six paths are also withdrawn. The published set is
   eight paths plus a one-path baseline wave (section 10).

---

## 0. What this pass cannot establish

- **No component is rendered by any test here.** vitest is node-env and collects
  only `src/**/*.test.ts` (`vitest.config.*`: `include: ["src/**/*.test.ts"]`,
  `environment: "node"`). Four things below are READING CLAIMS: that the panel
  appears above the grid, that `defaultExpanded` opens it, that the label is
  legible, and that the panel vanishes when it should. No requirement here
  has a render as its only enforcer. Each rendered-behaviour claim is routed to
  the owner (RES-W3-1).
- **Nothing here executes `handleGradeColumn` or `runBulkGrade`.** Both are
  hook-internal and reached only from a `.tsx` onClick. Every claim about what
  the handler passes rests on AST pins (section 11, A-rows) and on `tsc`. The
  unit tests cannot see it. That is why the design pushes every DECISION into a
  pure leaf the unit tests do execute.
- **No `.env`, no key, network blocked** (`vitest.setup.ts`). I did not invoke
  `gradeRepoAction`. The claim that its success branch carries `rubricAreas` is
  a type-and-source claim (section 2).
- **I ran no gate** except one read-only probe of the client-bundle walker
  (section 4.3). I did not run `npm test`, `npm run lint`, `npx tsc --noEmit` or
  `npm run build`: `tsc` has one caller, and this seat writes one doc.

---

## 1. Measurements

Each command below was run from the repo root on 2026-09-21 at `434ad5e`, with
the working tree at ` M docs/css-orphans.md` only. `wc -l` is the Bash tool.
`@(Get-Content).Count` is PowerShell. The two agree on every file measured.

| Quantity | Value | Command |
|---|---|---|
| `repo-grades/index.tsx` | **913** / 913 | `@(Get-Content <f>).Count` / `wc -l <f>` |
| `repo-grades/useRepoGradesGradingActions.ts` | **770** / 770 | same pair |
| `repo-grades/useRepoGradesBulkGrade.ts` | **381** / 381 | same pair |
| `repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts` | **441** / 441 | same pair |
| `repo-grades/repoGrades.wiring.test.ts` | **810** / 810 | same pair |
| `drafted-grades/classTrendsDraft.not-postable.test.ts` | **237** / 237 | same pair |
| `repo-grades/RepoGradesGrid.tsx` | 643 / 643 | same pair |
| `grading-results/classTrendsEntry.ts` | 54 | `@(Get-Content <f>).Count` |
| `grading-recording/GradingRecordingPanel.tsx` (for RES-V-1) | **990** | `@(Get-Content <f>).Count` |
| Ceiling | `LIMIT = 1000` at `src/file-size-ceiling.structure.test.ts:30`, `lineCount > limit` at `:129` | `grep -n "LIMIT = \|ALLOWED_OVERAGE\|lineCount > limit" src/file-size-ceiling.structure.test.ts` |
| `ALLOWED_OVERAGE` entries naming `repo-grades` | **0** | `grep -c "repo-grades" src/file-size-ceiling.structure.test.ts`. Canary: the same file's `grep -n "ALLOWED_OVERAGE"` hits `:64` and `:126` |
| Files in `repo-grades/` | 61 | `ls src/app/components/repo-grades/ \| wc -l` |
| Frozen root census | **32** basenames, asserted `toEqual` | `repoGradesFeedbackAndFiles.wiring.test.ts:293-326`, `it(` at `:329` |
| Canary-3 roots | **6**, at `:213-228`; titles at `:207` ("six files") and `:209-210` | `grep -n "const roots = \[" -B 6 -A 14 <file>` |
| Next `docs/REGRESSION.md` entry | **434** | `grep -ac '^## 434\.' docs/REGRESSION.md` returns 0. Canary: `grep -ac '^## 433\.'` returns 1 |
| `://` in the three edited sources | 0 / 0 / 0 | `grep -c '://' <f>`. Canary: `grep -c 'const ' <f>` returns 60 / 53 / 23 |
| Client-bundle walk over `ClassTrendsPanel.tsx` + `classTrendsEntry.ts` under the repo-grades policy | **0 violations / 0 unallowed / 0 unresolvable** | scratch probe, section 4.3. Canary: the `lib/grade.ts` barrel returns 4 violations / 6 unallowed on the same walk |
| Same walk over today's 32 repo-grades roots | 0 / 0 / 0 | same probe |

---

## 2. The run boundary: YES, and where it is

Every hop was opened.

1. **Reachable control.** Tools tab: `tabs/tab-sections.ts:40` `manual: "Tools"`.
   Rail chip: `manual/manual-rail.ts:88` (`id: "repo-grades"`), and
   `MANUAL_VIEW_ORDER` at `:110-118`. `page.tsx:578-581` renders
   `<RepoGradesTab />`. `index.tsx:881` passes
   `onGradeColumn={handleGradeColumn}`. `RepoGradesGrid.tsx:416-426` is a MUI
   `Button` whose `onClick` calls `onGradeColumn(column.folder)` at `:423`. Its
   label is built at `:352-357` as "Grade all N repos in <folder>", and it is
   `disabled={bulkRunning}`.
2. **One run = one folder, one rubric, one pool.**
   `useRepoGradesGradingActions.ts:747-757` is `handleGradeColumn`. It calls
   `buildBulkGradePlan({ ..., folder, ... })` (`:748`), returns early on an
   empty plan (`:749-753`), resolves ONE rubric (`:755`), then calls
   `void runBulkGrade(plan, resolved)` (`:756`). `buildBulkGradePlan` pushes
   `{ repo: row.repo, folder }` with the single `folder` argument
   (`repoGradesBulkGrade.ts:126`). **Every target in a run shares one folder by
   construction.** `runBulkGrade` (`useRepoGradesBulkGrade.ts:171-378`) holds
   one shared rubric for the whole run (the U12.50 prologue, `:340-354`, and
   `establishSharedRubric`, `:126-142`). It runs a bounded pool (`:360-372`)
   and reports ONCE at the end (`:374-377`).
3. **A second concurrent run is refused** at `:174`
   (`if (runningFolder !== null) return;`).

**So the boundary exists, and it is stronger than the recording surface's.**
The recording table is course-scoped but not assessment-scoped, which is why
wave 2 needed the `cohortLabelSpread` disclosure (plan RES-P-7). A Repo Grades
run cannot span two folders. **Wave 3 has NO mixing disclosure, and none is
owed.** The reason is `repoGradesBulkGrade.ts:126`, not an absence of effort.

**What a run does NOT cover.** RULE 1c (`repoGradesBulkGrade.ts:115-124`) skips
any cell that already carries a score. A run over a column where three cells
were graded one at a time grades only the rest. That matters twice:

- **Which cohort.** Owner answer 3 (backlog A16 note) settled the recording
  surface: a trend covers "the rows that run just graded". I apply the same
  reading here: **the cohort is the run, not the column.** A second reason is
  structural. Cells graded one at a time under the `generate` rubric source get
  a rubric generated per call (`github-repos.ts:833`,
  `rubric.trim() || await generateRubric(...)`), so their area names are not
  comparable. Only a run guarantees one shared rubric. Asked as owner question
  Q1, non-gating, and this default is what gets built.
- **The completeness wording already handles it.** `class-trends.ts:17-24`
  defines its cohort as "the graded results in hand" and says so in every
  string ("Across the N submissions graded so far", `:242`). The Drafted Grades
  mount already ships under that definition over runs that skip already-graded
  work. Wave 3 adds one guard: the label shows the run's graded count
  (section 7.3), so the instructor can see the trends cover that run and not
  the whole column.

---

## 3. Where the run's data lives, and the gap

| Where | Carries `rubricAreas`? | Evidence |
|---|---|---|
| `gradeRepoAction` success return | **Yes**, as `run: GradingRun` | `github-repos.ts:661-669`. Embedded path returns at `:830`, LLM path at `:840`. Both engines populate areas: `embedded-grader/index.ts:201`, `grade/engine.ts:113` |
| Per-cell live state (`cellEdits`) | Yes, copied field by field | `useRepoGradesBulkGrade.ts:243` (`rubricAreas: first?.rubricAreas ?? []`), inside the one `onCellUpdate` at `:224-268` |
| The run's aggregate (`outcomes`) | **No** | `BulkGradeOutcome` is `{repo, folder, status, score, detail}` (`repoGradesBulkGrade.ts:144-159`). The graded push is `useRepoGradesBulkGrade.ts:295` |
| Anything after the run | **Nothing** | `runBulkGrade` returns `Promise<void>` (`:154`, `:171`). `handleGradeColumn` discards it with `void` (`useRepoGradesGradingActions.ts:756`) |
| Persistence | **None, for any of it** | `cellEdits` is `useState` (`index.tsx:180`) and is reset on course switch (`:540-542`). `loadRepoGradesUiState` et al. persist the UI state, mapping, log, folder and rubric choice, but no cell grades (`grep -n "export function persist\|export function load" repoGradesUiState.ts`) |

**The wave-2 trap in this surface's form.** One tempting build reads
`cellEdits` at render time, restricted to the run's target cells. That is the
"live row array at render" shape plan 5.5 forbids, and here it is wrong three
more ways:

- cells hold decomposed fields, not a `GradeResult`, so a re-assembly is a
  mapping, the exact home of wave 2's N6/N7/N10 survivors;
- a later one-cell regrade would silently rewrite a "run" trend;
- a pre-grade cell carries `rubricAreas: []`.

The collector below carries the action's own `GradeResult` objects BY
REFERENCE. It does no mapping at all, so there is nothing to transpose or
blank.

**`student` on these results is the repo's full name, not a roster student.**
`repoDigestToEmbeddedEntry` sets `student: label?.trim() || digest.fullName`
(`github-repos.ts:618-619`). The trends panel never reads `.student`
(`ClassTrendsPanel.tsx` has 0 hits for `\.student\b`), and the insight route
anonymises (`class-trends-insight.ts:59-69`). This matters only to N13b's
per-student attribution. It is routed as RES-W3-4.

---

## 4. Is there already a trends mount here? No. Measured three ways

**4.1 By identifier.** A Grep-tool search for
`ClassTrendsPanel|hasTrendableResults|toClassTrendsEntry|computeClassTrends`
over `src/` returns 18 files, none under `repo-grades/`. Canary: the same
search finds `GradingResults.tsx` and `GradingRecordingPanel.tsx`, the two
known mounts. The Grep tool, not a bash grep, per the A23 note's warning about
shell escaping.

**4.2 By what the surface would put on screen**, which is plan RES-P-5's
instrument:

- `grep -rlic "trend" src/app/components/repo-grades/` returns nothing.
- `grep -rniE "average|median|\bmean\b|distribution|summary of|per area|per-area"`
  over `repo-grades/*.tsx` returns nothing. Canary: `grep -rlniE "per rubric area"`
  over `drafted-grades/` finds `ClassTrendsPanel.tsx`.
- Repo Grades does not render `GradingResults` at all. Every
  `GradingResults` mention in `index.tsx` and `RepoGradesGrid.tsx` is a comment
  (`:191`, `:410`). `grep -rn "import GradingResults" src/app/components` finds
  only `GithubGradingPanel.tsx:18`, `GradingTab.tsx:18` and
  `LiveFeedPanel.tsx:22`.
- Repo Grades does not feed Drafted Grades. `grep -rn "GradingDraftPayload"`
  inside `repo-grades/` returns only prose. Canary: the same pattern finds 5
  files elsewhere.

**Not a duplicate of `GithubGradingPanel`'s trends.** That panel is the
`github` MODE of `GradingTab` (`GradingTab.tsx:18`) and already has trends via
`GradingResults` (A16-1). Repo Grades is a different surface: a Tools-rail
chip, a grid, a different hook stack. Both grade repo folders. Only one has
trends.

**4.3 The client-bundle consequence of mounting the panel, probed rather than
assumed.** `index.tsx` is a root of the A23 walk
(`repoGradesFeedbackAndFiles.wiring.test.ts:337-350`: zero violations, zero
unallowed, zero unresolvable). Importing `ClassTrendsPanel` pulls that panel's
whole closure into the walk. I ran the walk from a scratch vitest config
(pointing at the real `walkRuntimeGraph` and `client-boundary-policy`
exports) with roots `ClassTrendsPanel.tsx` and `classTrendsEntry.ts`. Result:
`{"v":[],"u":[],"x":[]}`. Canary on the same run: root `src/lib/grade.ts`
gives `4 6`, so the walk fires. Baseline: today's `directoryRoots(repo-grades)`
gives `0 0 0`. **The mount keeps R-1/R-3/R-4 green.** The scratch files live
in the session scratchpad, not the repo.

---

## 5. The shape: four layers, and THE SURFACE IS ONE OF THEM

| Layer | Object | File | What it owns | Tested by |
|---|---|---|---|---|
| **L-leaf** | `buildRepoRunCohort`, `repoRunTrendsEntry`, `repoRunTrendsLabel` | NEW `repo-grades/classTrendsFolderEntry.ts` | Every DECISION: what the cohort holds, when trends show, what they are labelled | Unit tests BY VALUE (section 11, L-rows) |
| **L-run** | the collector inside `runBulkGrade`, and its return value | `useRepoGradesBulkGrade.ts` | Accumulating THIS run's `GradeResult`s, and handing them back only after the pool drains | AST pins (A-1, A-2) plus `tsc` |
| **L-state** | `lastRunCohort` `useState`, cleared at click and set after the run; the course-switch clear; the render-time `trendsEntry` | `useRepoGradesGradingActions.ts` | WHEN the cohort changes. It decides nothing about content | AST pins (A-3 to A-5) plus `tsc` |
| **L-surface** | the gated `<ClassTrendsPanel>` and its label, above the grid | `repo-grades/index.tsx` | That the instructor SEES it, next to the run | AST pins (A-6 to A-8) plus `tsc`. Visibility itself is RES-W3-1 |

**How the user reaches it, click by click:**

1. Tools
2. Repo Grades chip
3. pick a course (already required to see the grid)
4. "Grade all N repos in <folder>"

When the run finishes, trends open above the grid, labelled with the folder
and the count. **Zero added clicks** over today's run. Repeat use is the same:
one click per run.

**Why the state lives in the actions hook, not the bulk hook or `index.tsx`.**
`useRepoGradesGradingActions.ts` is the one object that already holds all four
inputs the cohort needs:

- the clicked `folder` (the handler's argument);
- `course` (param, `:128-130`);
- `courseId` (param);
- the course-switch reset idiom, `columnPostingResetForCourse` (`:195-199`),
  which is render-phase and not an effect. `repoGrades.wiring.test.ts:373`
  bans the literal `useEffect` from this file.

The bulk hook sees the results but not the course. `index.tsx` has the course
but is 913 lines, and the handler is not there. This placement changes **no**
argument list: the `useRepoGradesGradingActions({...})` call text, which
`repoGradesCodeExecution.wiring.test.ts:361-366` slices and asserts on, is
untouched.

---

## 6. Reuse: asked explicitly, answered per symbol

The question: what does wave 2's leaf, or anything else shipped, already do
that wave 3 needs? A duplicated predicate is the recorded class where
consolidating later turns the comparing test into a tautology
(`refactor-disarms-tests`).

| Symbol | Where | Verdict | Why |
|---|---|---|---|
| `hasTrendableResults(entry)` | `grading-results/classTrendsEntry.ts:52-54` | **REUSE, and it is the only gate** | Same `GradingRunEntry` input. `repoRunTrendsEntry` CALLS it. No second trendable predicate anywhere in wave 3 (L-7) |
| `toClassTrendsEntry(run, meta)` | `:44-46` | **REUSE** | Builds `{...meta, run}`. Wave 3 builds the `GradingRun` and hands it over |
| `ClassTrendsEntryMeta` | `:35-39` | **REUSE, type-only** | No second meta type (L-7) |
| `ClassTrendsPanel` | `drafted-grades/ClassTrendsPanel.tsx`, prop `entry: GradingRunEntry` at `:80`, `defaultExpanded` at `:86` | **REUSE unchanged** | Its closure is client-safe under this directory's policy (section 4.3) |
| `gradedResults` | `lib/grade/types.ts:180` | **REUSE** for the label's count | The same function `computeClassTrends` uses for `totalResults` (`class-trends.ts:272`), so the label and the panel agree by construction. `types.ts`'s only import is type-only (`:1`) |
| `containsForbiddenCompletenessPhrase` | `class-trends.ts:37-40` | **REUSE in the leaf TEST only** | Polices the label's copy with the module's own rule |
| `buildRunCohort` | `grading-recording/classTrendsRunCohort.ts:98-152` | **DO NOT REUSE** | It exists to MERGE a `GradingRecordingResult` through `classifyGradingResult` onto an identity projection. Repo Grades already receives finished `GradeResult`s. Reusing it would mean converting them back to a recording shape: a lossy mapping, the N6/N7/N10 home |
| `toRunCohortEntry` / `runCohortMeta` | `:157-171` | **DO NOT REUSE** | Typed on `RunCohort`, whose rows carry a recording `assessment` label. Generalising it would put two surfaces' cohorts under one type for three lines of shared code. The shared part (`toClassTrendsEntry`) is already shared |
| `cohortLabelSpread` | `:178-181` | **DO NOT REUSE, no analogue** | A run cannot span two folders (section 2) |
| wave 2's `stripComments` / regex region pins | `GradingRecordingPanel.wiring.test.ts:46`, `:171` | **DO NOT COPY the approach** | The two shipped survivor classes were negation and transposition (wave-2 verify section 5.4), and region-plus-regex pins are what they survived. Wave 3's wiring pins use the COMPILER PARSER instead. Precedent in this same directory: `repoGradesFeedbackAndFiles.wiring.test.ts:40` (`createRequire(...)("typescript")`) and its R-5e AST visit (`:381-402`). An AST sees `!x` as a `PrefixUnaryExpression` and sees which identifier is bound to which key. It never sees comments at all |
| `lastGradedFolder` capture | `GithubGradingPanel.tsx:398` (set in the grade handler), `:861` (passed as `assignmentName`), `:775` (the folder shown on screen) | **REUSE THE RULE, not code** | Capture what the run covered inside the handler. Wave 3's folder is the handler's own argument, which is stronger than a text box: it comes from the clicked column (`RepoGradesGrid.tsx:423`), not from a live control |

---

## 7. The contract (exact signatures)

`src/app/components/repo-grades/classTrendsFolderEntry.ts`, new. It is a
canary-3 root (section 10) and makes no network, storage or React call.

```ts
import { gradedResults, type GradeResult, type GradingRun, type GradingRunEntry } from "@/lib/grade/types";
import { hasTrendableResults, toClassTrendsEntry } from "../grading-results/classTrendsEntry";

export interface RepoRunCohort {
  readonly results: readonly GradeResult[]; // this run's results, elements BY REFERENCE
  readonly folder: string;                  // the clicked column's folder
  readonly courseId: string;                // the hook's courseId at click
  readonly courseName: string;              // course?.name at click, "" when null
}

export function buildRepoRunCohort(input: {
  results: readonly GradeResult[];
  folder: string;
  courseId: string;
  course: { name: string } | null;
}): RepoRunCohort;

/** null unless: cohort is non-null AND cohort.courseId === liveCourseId AND
 *  hasTrendableResults(entry). The ONE gate for this surface. */
export function repoRunTrendsEntry(cohort: RepoRunCohort | null, liveCourseId: string): GradingRunEntry | null;

/** The visible line above the panel: names entry.assignmentName and the count
 *  gradedResults(entry.run.results).length. Copy is the UX seat's; the facts
 *  are pinned by L-6. */
export function repoRunTrendsLabel(entry: GradingRunEntry): string;
```

**7.1 Import constraints on the leaf.** These are load-bearing, and one
of them has a trap.

- Value-import specifiers are exactly `"@/lib/grade/types"` and
  `"../grading-results/classTrendsEntry"`. Nothing else (L-7).
- **No import from `./repoGradesBulkGrade`, `./repoGradesPosting` or
  `./repoGradesCellEdits`, type or value.** The signature takes `folder: string`
  rather than a `BulkGradePlan` for this reason.
  `repoGradesBulkGrade.ts:42` value-imports `./repoGradesPosting`, and
  `repoGradesPosting.ts:64` value-imports `@/lib/canvas-url`.
  `classTrendsDraft.not-postable.test.ts:58` bans the prefix `lib/canvas`,
  matched character by character with no slash (`:67-70`), by design. So a
  value import of `BulkGradePlan` would turn canary 3 red on a correct
  implementation. That is a reading claim. Sabotage S-17 demonstrates it
  in-wave.
- Double-quoted specifiers only. Canary 3's scanner
  (`classTrendsDraft.not-postable.test.ts:95`) matches `from "..."` only, so a
  single-quoted import would escape it. That is the A23 family, recorded there
  and not reopened here.

**7.2 `repoRunTrendsEntry`'s body**, stated so the checker can hold the
implementation to it:

1. If `cohort` is null, return null.
2. If `cohort.courseId !== liveCourseId`, return null.
3. Otherwise build `run` as `{ results: [...cohort.results], rubricAreaNames: [], fullCreditChecklist: [] }`.
4. Set `entry = toClassTrendsEntry(run, { courseName: cohort.courseName, assignmentName: cohort.folder, canvasUrl: "" })`.
5. Return `hasTrendableResults(entry) ? entry : null`.

`canvasUrl: ""` and empty `rubricAreaNames` match wave 2, and no trends
consumer reads either. Over the seven consumer files (ClassTrendsPanel,
ClassTrendsDraftPanel, class-trends, class-trends-draft, class-trends-insight,
the route, classTrendsDraftState), `grep -c canvasUrl` is 0 in all but the
route, which only coerces it (`route.ts:80`). `assignmentName` is read (1, 3,
0, 5, 2, 4, 0), so the instrument fires.

**7.3 Why the label exists: a finding this surface has and the recording
surface did not.** `ClassTrendsPanel` never shows WHICH assignment it
describes. Its heading is the fixed "Counted trends, per rubric area"
(`:141`), and `assignmentName` reaches the screen only inside the draft
panel's student-addressed opening (`ClassTrendsPanel.tsx:206`,
`class-trends-draft.ts:185`). The recording panel has one table. Repo Grades
has one COLUMN PER FOLDER. Unlabelled trends above a multi-column grid do not
say which column they belong to, and that is the unlabelled-effect class.
`GithubGradingPanel.tsx:775` is the shipped precedent for showing what a run
covered. The label is inside the same gate as the panel, so it can never
appear without it or disagree with it.

**7.4 The other two files' contract changes:**

- `useRepoGradesBulkGrade.ts` changes in four places:
  - `runBulkGrade`'s type becomes
    `(plan: BulkGradePlan, resolved: ResolvedRubric) => Promise<readonly GradeResult[] | null>`.
    `null` means "refused, no run happened" (the `:174` guard). The array
    means "this run's results, complete".
  - A local collector is declared beside `outcomes` (`:181`).
  - `gradeOneTarget`'s success branch, after both early returns (`:204`,
    `:216`), pushes `...result.run.results`.
  - The function returns the collector after `await Promise.all(...)` (`:372`).
- `useRepoGradesGradingActions.ts` changes in five places:
  - `const [lastRunCohort, setLastRunCohort] = useState<RepoRunCohort | null>(null)`.
  - `setLastRunCohort(null)` inside the existing
    `if (courseId !== columnPostingResetForCourse)` block.
  - In `handleGradeColumn`, `setLastRunCohort(null)` becomes the FIRST
    statement. Then `const <r> = await runBulkGrade(plan, resolved)` replaces
    `void runBulkGrade(plan, resolved)`. Then
    `if (<r> !== null) setLastRunCohort(buildRepoRunCohort({ results: <r>, folder, courseId, course }))`.
  - `const trendsEntry = repoRunTrendsEntry(lastRunCohort, courseId)` in the
    hook body.
  - `trendsEntry: GradingRunEntry | null` added to
    `UseRepoGradesGradingActionsResult` and to the returned object.
- `index.tsx` changes in three places:
  - it destructures `trendsEntry`;
  - it imports `ClassTrendsPanel` (default, `"../drafted-grades/ClassTrendsPanel"`)
    and `repoRunTrendsLabel`;
  - it renders
    `{trendsEntry && ( <div> <p className={pageStyles.fieldHint}>{repoRunTrendsLabel(trendsEntry)}</p> <ClassTrendsPanel entry={trendsEntry} defaultExpanded /> </div> )}`
    after the `postSummary` status region (`:837-841`) and before the folder
    hint and `<RepoGradesGrid` (`:862`). **No `role`, no `aria-live`.** The
    view has exactly one live region (`useRepoGradesBulkGrade.ts:89-91`: "Never
    add a second"), and `repoGradesSliceA.guards.test.ts:150-181` guards it.

`repoGradesRubricPicker.wiring.test.ts:199` asserts `/runBulkGrade\(plan, resolved\)/`
inside `handleGradeColumn`, and `const <r> = await runBulkGrade(plan, resolved)`
still matches it. So that file is green WITHOUT an edit, which is a stronger
condition than listing it.

---

## 8. The stale-cohort branches, enumerated by opening the handler and the hook

**The construction is "clear first, set last, one setter".** `setLastRunCohort(null)`
is the first statement of `handleGradeColumn`, and exactly one non-null set
exists, after the awaited run. So a branch that leaves early leaves the cohort
null by construction, and does not depend on each exit remembering to clear.
The branches are still enumerated, because a construction is a claim until
someone opens every exit:

| # | Branch | Site | Cohort after | Held by |
|---|---|---|---|---|
| 1 | Empty plan: "nothing to grade" | `useRepoGradesGradingActions.ts:749-753` | null (cleared at click, then return) | A-3 order pin, S-5 |
| 2 | `resolveRubricForColumn` rejects | `:755`. Documented "Never throws" at `useRepoGradesRubricSource.ts:644`; not relied on | null | construction |
| 3 | Concurrent run refused | `useRepoGradesBulkGrade.ts:174`, returns `null` | null, no set | A-2's refusal row, S-20 |
| 4 | `runBulkGrade` rejects (server-action transport failure reaching `Promise.all`) | `:372` | null. The set is after the await and never runs | construction |
| 5 | Run completes, every target failed or empty | per-target branches `:204-208`, `:216-220` | a cohort with no trendable result, so the leaf returns null and no panel shows. The previous run's trends are gone | L-3 cells c3/c5, A-3 |
| 6 | Run completes, partial success | `:222-296` | a cohort of the successes only | L-1, L-3 c6 |
| 7 | **Course switch** | render-phase branch `useRepoGradesGradingActions.ts:195-199`, which runs on the same `courseId` change as `index.tsx:540-542` | null | A-4, S-8 |
| 8 | **Course switched MID-RUN**: run A started, course B selected, run A completes and sets | after the `:195-199` clear | a cohort stamped `courseId = A`, which the leaf HIDES on B (L-3 c1). Switching back to A re-fires the reset branch and clears it | L-3 c1, S-9 |

Branch 8 is why the leaf takes the live `courseId`. That is a VALIDITY check,
not data: the live id never reaches the entry. The signature cannot even
receive the live course name, so the rule "never read a live control into the
meta" holds by construction.

**Unmount between runs is load-bearing, stated because it is easy to miss.**
`ClassTrendsPanel` keeps `insight` (the Ask-AI reading) in local state
(`:89`) and does not reset it on a new `entry`. Its only entry-keyed hook is
`useMemo` at `:91`. The click-time clear makes React commit a render with
`trendsEntry === null`, which UNMOUNTS the panel. The clear happens
synchronously at click and the set happens after at least one `await`, so the
two are separate commits. The next run then mounts a fresh instance.
Without the clear, run 2 would show run 1's AI reading under run 2's counts.
The recording surface gets the same property from its own three clears.

---

## 9. Plan 5.5's question asked of this surface: the capture rule

| Meta field | Source | Captured when | Live-control hazard? |
|---|---|---|---|
| `assignmentName` | `folder`, the handler's own argument | at click | **None.** It is the clicked column's key (`RepoGradesGrid.tsx:423`), not a typed value, and cannot change mid-run |
| `courseName` | `course?.name ?? ""` from the handler's closure | at click (the closure of the render the click happened in) | Bounded. A mid-run switch is branch 8, hidden by the leaf |
| `courseId` | the hook's `courseId` param | at click | used only for branch 8's validity check |
| `canvasUrl` | `""` | n/a | none |

`courseName` reaches no rendered string and no prompt. Across the seven
consumer files, `grep -c courseName` is 0 everywhere except the route's
coercion, where it is 1. So transposing it is low-harm. It is still pinned
(A-3c), because the same binding error on `folder` would put a course name into
student-addressed copy (`class-trends-draft.ts:185`) and a model prompt
(`class-trends-insight.ts:154`), which is wave 2's N4.

**Transposition is closed by TYPE plus a named-key AST pin, not by a mention
test.** The call is `buildRepoRunCohort({ results: <r>, folder, courseId, course })`.
`course` is an object, and `results` is an array. The two strings are `folder`
and `courseId`, and A-3c requires each key to be bound to the same-named
identifier. So `{ folder: courseId, courseId: folder }` compiles and still
fails A-3c.

---

## 10. Waves and write sets

**Two waves, sequential. W3A before W3B.** W3A is the baseline, and a baseline
written after the change is not a baseline (plan 4.2's wave 0 x wave 1 rule).

**W3A, the baseline. PUBLISHED SET (1 path):**

```
docs/REGRESSION.md
```

Entry **434**. `docs/REGRESSION.md` entry 433's "Not baselined here" section
names the Repo Grades folder-entry surface explicitly as out of its scope
(`awk '/^## 433\./,0' docs/REGRESSION.md`, its lines 154-160), so DEV_LOOP's
skip condition is not met. The entry records what the code does today, read
from source, at the sites W3B changes:

- `handleGradeColumn`'s four steps and its `void` discard;
- `runBulkGrade`'s `Promise<void>`, its refusal guard, and its end-of-run
  order (`onOutcomes`, `onAnnounce`, `setRunningFolder(null)`, `setProgress(null)`);
- `BulkGradeOutcome`'s five fields;
- RULE 1c's already-graded skip;
- `cellEdits` not persisting;
- both course-reset branches;
- the canaried absence of any trends mount on the view.

`grep -a` is mandatory on that file.

**W3B, the build. PUBLISHED SET (8 paths).** A write set contains only files
the wave edits (plan 3.0).

| ID | Path | Class | Why it is written |
|---|---|---|---|
| WS-1 | `src/app/components/repo-grades/classTrendsFolderEntry.ts` [NEW] | certain | the leaf |
| WS-2 | `src/app/components/repo-grades/classTrendsFolderEntry.test.ts` [NEW] | certain | the L-rows |
| WS-3 | `src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts` [NEW] | certain | the A-rows. A new file, because `repoGrades.wiring.test.ts` is 810 lines |
| WS-4 | `src/app/components/repo-grades/useRepoGradesBulkGrade.ts` | certain | L-run |
| WS-5 | `src/app/components/repo-grades/useRepoGradesGradingActions.ts` | certain | L-state; CALLS `buildRepoRunCohort` and `repoRunTrendsEntry` |
| WS-6 | `src/app/components/repo-grades/index.tsx` | certain | L-surface; CALLS `repoRunTrendsLabel` and renders the panel |
| WS-7 | `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts` | **certain** | `FROZEN_REPO_GRADES_ROOTS` (`:293-326`) is asserted `toEqual` against `directoryRoots(repo-grades)` (`:329-335`). WS-1 is a new non-test `.ts` in that directory, so R-2 goes red on a CORRECT implementation unless `"classTrendsFolderEntry.ts"` is added. The comment at `:289-292` ("32 non-test") and the `it()` title at `:329` ("32 frozen basenames") both become 33 in the same edit, or the test's own description is false |
| WS-8 | `src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` | certain | a SEVENTH canary-3 root: the leaf's entry is built in render and handed to the panel, never posted, exactly as `classTrendsEntry.ts` and `classTrendsRunCohort.ts` (`:222`, `:227`). The `describe` at `:207` says "six files" and the `it()` at `:209-210` lists the names; both are edited. Keep `{ timeout: 30000 }` (`:211`) |

**The caller rule, per export.** `buildRepoRunCohort` and `repoRunTrendsEntry`
are called from WS-5, and `repoRunTrendsLabel` from WS-6, all in W3B. The new
return shape of `runBulkGrade` is consumed by WS-5, in W3B. No type-only
module is involved, so `seats.md`'s single exception is not invoked.

**10.1 Intersections, computed from the published sets.** The sets were
written verbatim to the session scratchpad. `w1` is wave 1's fixed ten plus
its published destination `GradingCaptureSettings.tsx`, per
`docs/a16-wave1-scope.md`. `w2` is plan 3.4. `a18` is plan 3.6 / A18 ruling 11.

```
w3a = 1 paths / w3b = 8 paths / a18 = 6 paths / w2 = 6 paths / w1 = 11 paths
w3b x a18:   (empty)
w3a x a18:   (empty)
w3b x w1:    (empty)
w3a x w3b:   (empty)
w3b x w2:    src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
canary: cat w3b w3b | sort | uniq -d | wc -l -> 8 ; same for a18 -> 6
```

- **w3b x w2 is not a live conflict.** Wave 2 landed at `cbe84e2`, and
  `git log -2 -- <that file>` shows `cbe84e2` as the last writer. Plan 4.2
  already sequenced wave 2 before wave 3.
- **A18** is informationally independent: two `src/lib` prompt modules and
  four tests, none of which read anything W3B touches. Its production change
  landed at `d62aea3`. **May run concurrently.**
- **Existence:** all five non-NEW W3B paths and all six A18 paths return `ok`
  under `[ -f ]`. The three NEW paths return `absent`.

**10.2 Live work that no file list shows. The concurrency answer is not "none".**

- **A23** landed code in WS-7 (`4dad288`, `38f0e95`), and its row is still open
  with an owner decision owed at the push: the re-ban question over twelve
  `lib/grade` modules. Any A23 follow-up that edits `client-boundary-policy.ts`
  or WS-7 collides with W3B by exact path (WS-7) or informationally (the policy
  W3B's R-1 relies on). **Do not run W3B concurrently with any A23 follow-up.**
  A23's `owns` is `[]`, so this cannot be computed mechanically. It is stated
  here instead.
- **N13b** redefines `AreaTrend` (plan section 8), so it FOLLOWS wave 3, as the
  plan already orders.
- **N13a** edits `class-trends-draft.ts`, which W3B does not write.
  Independent.
- **Waves 0-2** have landed (`2e34886`, `61b229f`, `cbe84e2`, `434ad5e`).

---

## 11. The `owns` derivation, and every file that reads an edited file AS SOURCE

The command, output pasted:

```bash
echo "## A"; grep -rlE "(/|\")(index\.tsx|useRepoGradesGradingActions\.ts|useRepoGradesBulkGrade\.ts)[\"\`]" src --include=*.test.ts \
  | xargs grep -lE "readFileSync|read\(" | xargs grep -lE "repo-grades|REPO_GRADES" | sort
echo "## B"; grep -rl "readdirSync" src --include=*.test.ts | xargs grep -l "repo-grades" | sort
echo "## C"; grep -rl "const roots = \[" src --include=*.test.ts | xargs grep -l "classTrendsEntry.ts" | sort
```
```
## A: test files naming an edited file as a path string
src/app/components/repo-grades/repoGrades.wiring.linking.test.ts
src/app/components/repo-grades/repoGrades.wiring.test.ts
src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts
src/app/components/repo-grades/repoGradesRubricPicker.wiring.test.ts
src/app/components/repo-grades/repoGradesSliceA.guards.test.ts
src/app/components/repo-grades/repoGradesSliceB.guards.test.ts
## B: test files that readdirSync and mention repo-grades
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
## C: canary-3 roots file
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
```

Canary for pipeline A: the same pattern over `repoGradesSliceA.guards.test.ts`
alone returns that file, which reads `${REPO_GRADES}/index.tsx` at `:53`. So
the template-string form is matched. I opened each hit and classified it:

| Reader | What it asserts on an edited file | W3B effect | Class |
|---|---|---|---|
| `repoGrades.wiring.test.ts` | the hook contains no `useEffect` literal (`:373`); `handleGradeCell` / `handlePostColumn` slices (`:392-440`); index log wiring and the index reset branch (`:781-809`) | W3B adds no effect, and touches neither those slices nor the index reset branch | **run-only, green without edit** |
| `repoGrades.wiring.linking.test.ts` | index `<LinkUsernamesPanel` placement (`:83`), `handleLinkUsernames` (`:186`) | untouched | run-only |
| `repoGradesCodeExecution.wiring.test.ts` | the index call args of `useRepoGradesGradingActions({` up to `});` (`:361-366`); exactly one `gradeRepoAction(` per hook; the bulk call's 8 args (`:441`), inside a body located by the literal marker `rubricArg: string): Promise<{ rubricUsed: string \| null }> =>` (`:437-439`) | the args object is unchanged; the gradeRepoAction calls are unchanged. **Constraint on WS-4: `gradeOneTarget`'s signature text stays byte-identical** (it is that marker), and the `// U12.50` comment that ends `repoGradesFeedbackAndFiles`'s `gradeOneTarget` slice (`:253`) stays in place | run-only |
| `repoGradesFeedbackAndFiles.wiring.test.ts` | the `gradeOneTarget` slice's five `first?.` fields (`:250-261`); frozen roots (`:293-335`); the A23 walk (`:337-350`) | the slice still contains all five. **Roots: CERTAIN edit (WS-7).** Walk: stays 0/0/0 (section 4.3) | **WS-7** |
| `repoGradesRubricPicker.wiring.test.ts` | `runBulkGrade(plan, resolved)` inside `handleGradeColumn` (`:199`); `columns:` lookup (`:228-234`); bulk-hook rubric gates (`:207`, `:254-260`, `:387-391`) | the regex still matches; the gates are untouched | run-only |
| `repoGradesSliceA.guards.test.ts` | the index has a visible `role="status"` region rendering `postSummary` (`:175-180`); no own tab container (`:245`) | the label adds no role; the status region is untouched | run-only |
| `repoGradesSliceB.guards.test.ts` | the hook uses `mergeRepoGradeLiveScores` and defines no `withLiveScores` (`:106`, `:116`) | untouched | run-only |
| `runtime-import-graph.test.ts` | the repo-grades closure explodes past 50 violations with the wall removed (`:381-384`) | monotone: adding a root cannot lower it | run-only |
| `classTrendsDraft.not-postable.test.ts` | canary 3 | **seventh root** | **WS-8** |
| `gradingResultsHelpersWiring.test.ts` | the grading-results census; its two `readdirSync`s are non-recursive (plan 3.0) | W3B adds nothing to `grading-results/` or `components/` | run-only |

Run-only gates owned by no wave (plan 9.0), which must be green WITHOUT an edit:

- `src/file-size-ceiling.structure.test.ts`
- `src/source-bytes.structure.test.ts`
- `src/lib/no-emojis.test.ts`
- `src/app/components/ui/modalAdoption.wiring.test.ts`: W3B adds no Dialog,
  and `ClassTrendsPanel` is imported, not declared, in `index.tsx`.

---

## 12. File sizes and the per-file ADDITION caps

RES-V-1's lesson: wave 2 added 72 lines against a 46-line budget, and nothing
measured a wave's own addition. So each cap below is a gate row. The object is
the file. The instrument is `git show HEAD:<f> | wc -l` against
`@(Get-Content <f>).Count` after the wave. **The gate FAILS if the addition
exceeds the cap, even under 1000.**

| File | Now | Estimated addition | Cap | After, at cap |
|---|---|---|---|---|
| `index.tsx` | 913 | 2 imports, 1 destructure, 6-8 mount and label, 4-6 hinge comment = 13-17 | **+20** | 933 |
| `useRepoGradesGradingActions.ts` | 770 | 2 imports, 1 state, 1 reset clear, 3 handler, 1 const, 1 return key, 3 interface, 6-10 comments = 18-22 | **+30** | 800 |
| `useRepoGradesBulkGrade.ts` | 381 | 1 import, 1 collector, 1 push, 1 return, type changes 2, 6-8 comments = 12-14 | **+20** | 401 |
| `repoGradesFeedbackAndFiles.wiring.test.ts` | 441 | 1 root line plus the two "32"s rewritten in place | **+3** | 444 |
| `classTrendsDraft.not-postable.test.ts` | 237 | 1 root, 3-4 comment, title rewritten in place | **+8** | 245 |
| `classTrendsFolderEntry.ts` [NEW] | 0 | 3 functions, 1 interface, header | **<= 120** total | 120 |
| `classTrendsFolderEntry.test.ts` [NEW] | 0 | L-1 to L-7 | **<= 320** total | 320 |
| `repoGradesClassTrends.wiring.test.ts` [NEW] | 0 | A-1 to A-8 plus detector canaries plus a small AST helper | **<= 380** total | 380 |

**No extraction is owed.** `index.tsx` ends at 933 at worst, 67 under the
ceiling. Plan 5.6 flagged it as "wave 3's own squeeze point, inheriting the
extract-before-adding rule". Measured against this feature's additions, that
rule does not fire. Sizing the feature, not the limit, is the whole point.

---

## 13. Pass conditions

Each row names the object, the instrument, and the direction of failure.
Every source-text row uses the TypeScript parser (section 6), never a regex
over raw text. **Each AST detector ships with a canary `describe` that proves
it returns false on the named mutant and true on the intended shape.** The
precedent is the seven canary describes in
`gradingResultsExtraction.wiring.test.ts` (plan 5.5.1). Helpers are DUPLICATED
into WS-3, never imported from another `*.test.ts`
(`no-cross-test-file-imports`).

### 13.1 Leaf rows, BY VALUE. Instrument: `npx vitest run src/app/components/repo-grades/classTrendsFolderEntry.test.ts`

| ID | Object | Pass | RED when |
|---|---|---|---|
| L-1 | `buildRepoRunCohort(...).results` | same length as input, and `results[i]` is `toBe` input `[i]` for two DISTINCT result objects with different `totalScore` and `rubricAreas` | any element is rebuilt, dropped, reordered or added |
| L-2 | `buildRepoRunCohort` meta | on distinctive inputs (folder `"hw3-loops-Zq"`, course name `"Course Xy-7"`, courseId `"c-42"`): `folder === "hw3-loops-Zq"`, `courseName === "Course Xy-7"`, `courseId === "c-42"`; with `course: null`, `courseName === ""` | any two fields transposed, or any value not from its own input key |
| L-3 | `repoRunTrendsEntry(cohort, liveId) !== null` | **frozen literal truth table**, not computed through `hasTrendableResults` (that would be a tautology): c0 null cohort -> false; c1 course mismatch with trendable -> false; c2 match with one graded result carrying areas -> true; c3 match with only ungraded -> false; c4 match with graded but zero areas -> false; c5 match with empty results -> false; c6 match with one graded-with-areas plus one ungraded -> true | any cell flips. This kills negation of either guard and removal of the course check (S-9, S-10) |
| L-4 | the non-null entry's fields | `assignmentName === cohort.folder`, `courseName === cohort.courseName`, `canvasUrl === ""`, and `entry.run.results[i]` is `toBe` `cohort.results[i]`, on the distinctive values of L-2 | the folder and the course name transposed inside the leaf (S-11), or results re-mapped |
| L-5 | the counted output | `computeClassTrends(entry).totalResults` equals the literal graded count of the fixture (1 for c6; 3 for a three-graded fixture) | the leaf lets a fabricated or duplicated result through |
| L-6 | `repoRunTrendsLabel(entry)` | (a) contains `entry.assignmentName`; (b) contains the literal graded count as a numeral (1 for c6, 3 for the three-graded fixture); (c) for two entries identical except folder A vs B, `label(A).split(A).join(B) === label(B)`, so the folder is the only folder-dependent part; (d) `containsForbiddenCompletenessPhrase(label) === false` | the label drops the folder (S-15), shows a wrong count, reads a value from anywhere but the entry, or claims completeness. **The copy's spelling is not pinned** (`source-text-tests-overspecify`). The UX seat writes the words; the facts are pinned here |
| L-7 | the leaf's own source, AST | imports `hasTrendableResults` and `toClassTrendsEntry` from `"../grading-results/classTrendsEntry"`; declares no function or const whose name matches `/trendable/i`; declares no interface or type alias whose name matches `/Meta\b/`; the value-import specifier set is a subset of `{"@/lib/grade/types", "../grading-results/classTrendsEntry"}`; it has no import from `./repoGrades*` | a second predicate (S-19), a second meta type, or a new edge (S-17 is also caught by canary 3) |

### 13.2 Wiring rows, AST. Instrument: `npx vitest run src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts`

| ID | Object (file, then region) | Pass | RED when |
|---|---|---|---|
| A-1 | `useRepoGradesBulkGrade.ts`: the arrow bound to `gradeOneTarget` | there is an `ExpressionStatement` whose call is `<X>.push(...result.run.results)`: the callee is a `PropertyAccess` named `push`, and its single argument is a `SpreadElement` of `result.run.results`. That statement sits AFTER the `IfStatement` whose condition is `"noSubmission" in result` | the push is deleted (S-1), or its argument is anything but the spread of `result.run.results`. Moving it into either early-return branch is a `tsc` error, because `result.run` does not exist there (S-2) |
| A-2 | the same file: the arrow bound to `runBulkGrade` | (a) the `IfStatement` whose condition is `runningFolder !== null` returns the `null` keyword; (b) the body's last `ReturnStatement` returns the Identifier `<X>` from A-1 (same name), and it sits after the statement containing `await Promise.all(` | the refusal returns an array (S-20); the collector is returned before the pool drains (S-3); or a different array is returned |
| A-3 | `useRepoGradesGradingActions.ts`: the arrow bound to `handleGradeColumn` | (a) a `setLastRunCohort(null)` call precedes the first `buildBulkGradePlan(` call; (b) EXACTLY ONE `setLastRunCohort(` call has a non-`null` argument, and it follows the `VariableDeclaration` `<r> = await runBulkGrade(plan, resolved)`; (c) that argument is `buildRepoRunCohort(<ObjectLiteral>)`, where `results` is bound to Identifier `<r>`, and `folder`, `courseId` and `course` are each bound to the same-named Identifier (shorthand or `k: k`), with no other properties | the click-time clear is deleted (S-4) or moved after the empty-plan return (S-5); the set happens before the run; the results come from anything but the awaited run (S-6); or keys are transposed or blanked (S-18). **Negating the non-null check is `tsc`'s kill, not this row's** (S-7): `results: <r>` is `readonly GradeResult[] \| null` inside a negated branch |
| A-4 | the same file: the `IfStatement` whose condition is `courseId !== columnPostingResetForCourse` | its then-block contains a `setLastRunCohort(null)` call | the course-switch clear is deleted (S-8) |
| A-5 | the same file: the component-level `VariableDeclaration` `trendsEntry` | the initializer is `repoRunTrendsEntry(lastRunCohort, courseId)`, both arguments bare Identifiers; the returned object literal includes `trendsEntry`; `hasTrendableResults` is referenced NOWHERE in this file | an entry built from `cellEdits` or another live array (S-12); a second gate in the hook |
| A-6 | `index.tsx`: the JSX tree | there is an `import ClassTrendsPanel from "../drafted-grades/ClassTrendsPanel"`, AND a `<ClassTrendsPanel` element whose `entry` initializer is the bare Identifier `trendsEntry` (no `NonNullExpression`) and which carries `defaultExpanded`. **Walking up from that element**, an ancestor `BinaryExpression` with operator `&&` has as its LEFT operand the bare Identifier `trendsEntry`, and a `PrefixUnaryExpression` `!` there is rejected | the tag is deleted (S-13 and the leverage removal test); the mount is ungated via `trendsEntry!` (S-14); or the guard is negated. Negation is also `tsc`'s kill: `entry={trendsEntry}` narrowed to `null` does not type-check (S-16) |
| A-7 | `index.tsx`: the same `&&` expression's right operand | it contains a `CallExpression` `repoRunTrendsLabel(trendsEntry)` rendered as JSX-expression content; `repoRunTrendsLabel` is imported from `"./classTrendsFolderEntry"`; there is no `role` or `aria-live` attribute on the label's element | **the label is never written** (S-15b): the wave-2 P20 class, one prop over, and closed from the start this time; or a second live region |
| A-8 | `index.tsx`: source positions | the `&&` expression of A-6 starts before the `<RepoGradesGrid` element and after the `postSummary` status region; `hasTrendableResults` is referenced nowhere in `index.tsx`; the `trendsEntry` binding comes from the `useRepoGradesGradingActions({` call's destructuring pattern | the mount is moved away from the run (under the log panel, for example); a duplicate gate at the mount; or a locally built entry |

**Why AST and not regex, stated as a measured fact.** Wave 2's
`classTrendsMountIsGated` regex, `/hasTrendableResults\([^)]*\)\s*&&(...)/`,
did not see a leading `!` (wave-2 verify N1), and its fix is a
character-before check that `hasTrendableResults(x) === false &&` would still
pass. A-6 asks the question structurally: is the left operand of the gating
`&&` the Identifier itself? Every form of negation (`!x`, `x === null`,
`x == null`, `!!x ? ... :`) fails that test, because none of them is a bare
Identifier.

### 13.3 Gate rows (W3B), in addition to plan 9.0's standing snapshot diff

| Instrument | Pass |
|---|---|
| plan 9.0's repo-wide `git status --short` snapshot diff, both files in the session scratchpad | every new or changed path is one of WS-1 to WS-8; no path under `.claude/worktrees/`; `docs/css-orphans.md` ignored and not staged |
| section 12's eight caps | every addition at or under its cap, measured by BOTH counters with the SAME number |
| `npx vitest run <WS-2>` and `npx vitest run <WS-3>`, one path per invocation (a multi-path run silently drops a non-matching path, plan 9.2) | green |
| `npx vitest run <WS-7>` | green, with R-2 at **33** and R-1/R-3/R-4 at 0/0/0 |
| `npx vitest run <WS-8>` | green with **seven** roots; the `describe` and `it()` titles name all seven |
| one `npx vitest run` per run-only reader in section 11 (seven repo-grades tests, `runtime-import-graph.test.ts`, `gradingResultsHelpersWiring.test.ts`) | green, **without being edited**. A red one means W3B did something it said it would not |
| the four run-only structural gates (section 11, last list) | green without edit |
| `npm run lint` | no MORE warnings than the count measured on the pre-change tree in this same wave. Wave-2 verify N5/N8 showed that a new warning is the only signal some mutants leave, so a rising count is a failure here, not noise |
| `npm test` | exit 0; totals not below the pre-change count measured in this wave |
| `npx tsc --noEmit`, the wave gate's single caller | no output, exit 0 |
| `npm run build` | `Compiled successfully` present. Do not gate on the exit code (prerender tail) |

### 13.4 Sabotages, watched failing and restored

Procedure is plan 9.3's: a `cp` backup in the scratchpad, never
`git checkout --`, identical counts after restore, and vitest output piped
through `tr -d '\000'`.

| # | Mutation (implementation only) | Killed by |
|---|---|---|
| S-1 | delete the collector push | A-1 |
| S-2 | move the push into the `"noSubmission"` branch | `tsc` (`result.run` does not exist on that variant). **Demonstrate it** |
| S-3 | `return <X>` before `await Promise.all(...)` | A-2b |
| S-4 | delete the click-time `setLastRunCohort(null)` | A-3a |
| S-5 | move it below the empty-plan `return` | A-3a (order) |
| S-6 | `buildRepoRunCohort({ results: [], ... })` | A-3c |
| S-7 | `if (<r> === null) setLastRunCohort(buildRepoRunCohort({ results: <r>, ... }))` | `tsc`. **Demonstrate it** |
| S-8 | delete the course-switch clear | A-4 |
| S-9 | the leaf drops its `courseId` comparison | L-3 c1 |
| S-10 | the leaf returns `hasTrendableResults(entry) ? null : entry` | L-3 c2, c3, c6 |
| S-11 | the leaf sets `assignmentName: cohort.courseName` | L-4 |
| S-12 | the hook passes something other than `lastRunCohort` (for example a cohort re-derived from `cellEdits`) | A-5 |
| S-13 | delete the `<ClassTrendsPanel .../>` element | A-6. **This is the leverage removal test** (section 14) |
| S-14 | render `<ClassTrendsPanel entry={trendsEntry!} ...>` outside the `&&` | A-6 |
| S-15 | the label omits the folder | L-6a |
| S-15b | delete the label element entirely | A-7 |
| S-16 | `!trendsEntry && (...)` | A-6 AND `tsc` (TS2322). **Demonstrate both** |
| S-17 | `import { type BulkGradePlan } from "./repoGradesBulkGrade"` rewritten as a value import `import { BulkGradePlan }` in the leaf | canary 3 in WS-8 (`lib/canvas-url` via `repoGradesPosting.ts:64`) AND L-7. Proves the seventh root is load-bearing |
| S-18 | `{ results: <r>, folder: courseId, courseId: folder, course }` | A-3c. Types pass, so this is the pure-transposition mutant |
| S-19 | declare `const isTrendable = ...` in the leaf and gate on it | L-7 |
| S-20 | the refusal guard returns `[]` | A-2a |
| S-21 | add `import { callLlm } from "@/lib/llm"` to the leaf | canary 3 (WS-8) |

S-2, S-7 and S-16 are killed by `tsc` alone, or by `tsc` alongside one row.
`tsc` has one caller, so these three run in the verification pass, one at a
time, and never concurrently with another agent's sabotage.

---

## 14. Leverage: the trigger fired, and there is no new claim to make

**Trigger:** W3B builds a capability a user reaches, on a surface that has none
today (`DEV_LOOP.md`, "The loop / Criteria").

**The honest answer: wave 3 earns no categorical advantage over a chat window.**

- **SCALE** is the candidate the surface tempts. A Repo Grades run pins ONE
  rubric across N repos (`establishSharedRubric`,
  `useRepoGradesBulkGrade.ts:126-142`, gated at `:340-354`), which is what
  makes the area names comparable across the cohort at all. But that
  mechanism was earned by U12.50 long before A16, and wave 3 builds nothing
  that holds it. Failure mode B was already run for A16:
  `docs/a16-scope.md` section 11 measured 14 batching files and withdrew SCALE
  as inherited. Wave 3 cannot re-earn it by pointing at a sibling's code.
- **GUARANTEED** is inherited from layer A (`computeClassTrends` is pure and
  counted) and layer B (`kind: "inferred"`). Wave 3's job is not to weaken it:
  L-5 and canary 3's seventh root.
- **What wave 3 actually is:** reachability and click cost. Counted trends
  appear beside the run that produced them, with zero added clicks, where
  today they are unreachable from this surface at all.

**Removal test, traced per `leverage.md:146-149`.** The deletion is the
`<ClassTrendsPanel` element in `index.tsx` (S-13). The assertion whose
observed value changes is A-6: PASS before, FAIL after. Trends still compute,
but they are unreachable from Repo Grades again, which is the pre-wave-3
world.

**The three-way call is the owner's, and it has not been made.**
`docs/a16-scope.md` section 11 wrote "A16 takes ... Accept the cost
explicitly". That sentence was authored by a SEAT. `grep -ci leverage
docs/a16-rulings.md` returns **0**, against a canary
`grep -c '^## RULING' docs/a16-rulings.md` of **24**. I find no owner ruling
recording the call. **Owner question Q2, non-gating.** My recommendation is to
accept the cost explicitly, as the scope did, because waves 1-2 already
shipped on that reading. The build proceeds on it, and Q2 rides alongside.

---

## 15. Disposition of prior requirements

This artifact restructures plan 3.5's floor and answers plan section 12's open
questions for wave 3. The id column was re-derived LAST, after all numbering in
sections 10-13 was fixed.

| Prior requirement | Source | Disposition | Receiver / id / reason |
|---|---|---|---|
| `repo-grades/index.tsx` in the set | plan 3.5 path 1 | **Kept** | WS-6 |
| `repo-grades/RepoGradesGrid.tsx` in the set | plan 3.5 path 2 | **Withdrawn** | The mount lives in `index.tsx`. The grid already routes its "Grade all" button to `onGradeColumn(column.folder)` (`RepoGradesGrid.tsx:423`), which needs no change. It protected no enforcer. It is now a file no W3B reader edits |
| `classTrendsFolderEntry.ts` [NEW] | plan 3.5 path 3 | **Kept**, name retained | WS-1 |
| `classTrendsFolderEntry.test.ts` [NEW] | plan 3.5 path 4 | **Kept** | WS-2 |
| `repo-grades/repoGrades.wiring.test.ts` in the set | plan 3.5 path 5 | **Withdrawn as a write, kept as a run-only gate** | 810 lines, so the new pins go to WS-3. Every existing assertion in it keeps running green without edit (section 11), so no enforcer is lost |
| `classTrendsDraft.not-postable.test.ts` in the set | plan 3.5 path 6 | **Kept** | WS-8, seventh root |
| (not in the floor) the frozen root census | missed by plan 3.5 | **Added** | WS-7, a certain edit |
| (not in the floor) the two hooks | missed by plan 3.5 | **Added** | WS-4, WS-5 |
| (not in the floor) the wiring test | missed by plan 3.5 | **Added** | WS-3 |
| (not in the floor) the baseline | missed by plan 3.5 | **Added** | W3A, `docs/REGRESSION.md` entry 434 |
| "a folder-entry adapter leaf; caller `index.tsx` or `RepoGradesGrid.tsx`" | plan section 2, row 3 | **Kept, refined** | Callers are WS-5 (`buildRepoRunCohort`, `repoRunTrendsEntry`) and WS-6 (`repoRunTrendsLabel`) |
| "Whether repo-grades can produce a `GradingRun` without inventing one" | plan section 12 | **Answered** | Sections 2-3: yes, from the action's own results, by reference |
| "Whether wave 3 also needs a run-time capture rule" | plan section 12 | **Answered** | Section 9: the folder is the handler's argument, the course is captured at click, and the live `courseId` is a validity check only |
| "Not specified beyond 9.0 and the run-only gates" | plan 9.4 | **Replaced** | Section 13 |
| RES-P-5: "Wave 3's published set is a FLOOR ... re-derive by what a grading surface puts ON SCREEN" | plan section 10 | **Discharged** | Section 4.2's surface-shaped searches; section 11's derivation, which found WS-7 |
| RES-V-1: the halved margin on `GradingRecordingPanel.tsx`, whose step reads "Wave 3's scoping pass, which ... inherits the reduced margin" | wave-2 verify section 9 | **Handed over. Its step points at the wrong wave** | Wave 3 does not write `GradingRecordingPanel.tsx` (not in WS-1 to WS-8). Re-measured: **990** (`@(Get-Content).Count`), so 10 lines of headroom. **Receiver: the orchestrator.** Obligation: record it in `docs/backlog.yml` with the step "before dispatch of any wave whose set contains `GradingRecordingPanel.tsx`". Until then it is a deletion (section 16) |
| RES-V-2: the raw-source caller guard | wave-2 verify section 9 | **Closed elsewhere** | `434ad5e` moved `importsAndRendersGradingCaptureSettings` to `STRIPPED_SOURCE` and added a commented-out canary (`git show 434ad5e`). Its stated step ("wave 3, since A16-5 touches this panel") was false: A16-5 does not touch that panel |
| RES-V-5: `runCohortMeta`'s `it.each` duplicate cell | wave-2 verify section 9 | **Closed elsewhere** | `434ad5e`, `classTrendsRunCohort.test.ts:208` ("THREE cells, not four") |
| RES-V-7, RES-V-8: the region canaries in `GradingRecordingPanel.wiring.test.ts` | wave-2 verify section 9 | **Handed over. Their step names a wave that does not exist** | "The next wave that writes this test file". W3B does not write it. **Receiver: the orchestrator**, to record them in the backlog |

---

## 16. Residual register

Each entry names an owner, an instrument and the step that will measure it.
**None of these is in `docs/backlog.yml` yet.** This seat's write set is this
one document, and that file has concurrent writers. `grep -c "RES-W3\|RES-V"
docs/backlog.yml` returns 0 (canary: `grep -c "RES-P" docs/backlog.yml`
returns 1). **Until the orchestrator records them, every row below is a
deletion,** by DEV_LOOP step 0's own rule.

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| **RES-W3-1** | Nothing renders. Four things are unverified: that the label and panel appear ABOVE the grid after a run; that `defaultExpanded` opens it; that the label is legible and names the right column; and that the panel UNMOUNTS at the next click (section 8's load-bearing unmount) | The repo owner | A real browser with env vars: run "Grade all" on two different columns in turn, and watch the panel close at the second click and reopen with the second folder's name | Owner verification after the W3B push |
| **RES-W3-2** | Trends vanish on reload. This is CONSISTENT with the grid: `cellEdits` is not persisted either (`index.tsx:180`), so the graded cells vanish too. That is unlike the recording surface, where rows persist and trends do not (plan RES-P-6). No upgrade path short of persisting `cellEdits` | The repo owner | Grade a column, reload, and confirm that cells and trends both reset | Owner verification after the W3B push |
| **RES-W3-3** | After a run, a one-cell regrade or a hand edit leaves the trends describing the run's CAPTURED results. This follows plan 5.5's "tied to what this run covered" rule, and the same question was left unruled on the recording surface (RES-V-6) | The repo owner, a product decision | A real browser: regrade one cell of a graded column and read the trends | Owner verification after the W3B push; ask it together with RES-V-6 |
| **RES-W3-4** | `student` on every cohort result is the repo's full name (`github-repos.ts:619`), not the bound roster student. That is invisible today and matters when N13b adds per-student attribution | The N13b scoping seat | `grep -n "student:" src/app/actions/github-repos.ts`, plus N13b's own criteria on which name a Repo Grades attribution shows | N13b's scoping pass, which already follows A16 |
| **RES-W3-5** | The Ask-AI request carries every graded repo's `submittedFiles` preview content. `ClassTrendsPanel.tsx:101` posts `JSON.stringify({ entry })` whole, while the model uses only areas and `overallComment` (`class-trends-insight.ts:59-69`). The request size against the host's body limit is unmeasured. The same exposure already ships on `GithubGradingPanel` via A16-1. If it overflows, the panel shows its error state, not a crash (`ClassTrendsPanel.tsx:103`, `:118`) | The repo owner | A real browser: the network tab's request size for "Ask AI" after a large-org run | Owner verification after the W3B push. A projection fix belongs to `ClassTrendsPanel.tsx` and serves every mount, so it would be its own row, not wave 3's |
| **RES-W3-6** | A pre-existing race, found in passing and NOT executed. `runBulkGrade`'s refusal guard reads `runningFolder` from the hook's render closure (`useRepoGradesBulkGrade.ts:168`, `:174`), and `handleGradeColumn` awaits `resolveRubricForColumn` (`useRepoGradesGradingActions.ts:755`) before calling it. The grid disables the buttons only once `runningFolder` is set (`RepoGradesGrid.tsx:421`). So two clicks inside one resolve window can both pass the guard. The trends consequence is benign (last completion wins, correctly labelled). The rate-limit consequence is what `BULK_GRADE_CONCURRENCY` exists to prevent | **The orchestrator**, to file a bug row | A reading claim today. The fix's own test would need the guard extracted to a ref-based or pure check | Its own row's scoping |
| **RES-W3-7** | The label's copy. The facts are pinned by L-6; its words and whether the count reads naturally are not | The UX seat (A16 wave 3's UX pass, DEV_LOOP design wave 3) | Reading, plus L-6 | The UX pass, before W3B is dispatched |
| **RES-V-1** | See section 15: 10 lines of headroom on `GradingRecordingPanel.tsx`, with no gate on a wave's own additions | The orchestrator | Plan 5.4's commands | **No step exists until recorded**: before any wave whose set contains that file |
| **RES-V-3, -4, -6, -7, -8** | The wave-2 verify residuals, none of which is in the backlog (count 0 above). Their steps name waves or files outside W3B | The orchestrator | `docs/a16-wave2-verify.md` section 9, each row's own instrument | **No step exists until recorded** |

---

## 17. Owner questions: batched, non-gating, each with the default being built

- **Q1. Does a Repo Grades trend cover the RUN, or the whole COLUMN?** The
  default being built is the run. It is the recording surface's owner answer 3,
  applied here, and only a run guarantees one shared rubric (section 2).
  Choosing the column instead would read already-graded cells from `cellEdits`,
  which reintroduces the mapping this design avoids. So it is a real redesign,
  not a flag.
- **Q2. The leverage call** (section 14). The default being built is
  "accept the cost explicitly": click cost and reachability, no categorical
  claim.
- **Q3. Should the trends' assignment name be the FOLDER or the mapped Canvas
  assignment's title?** The default being built is the folder, following the
  precedent at `GithubGradingPanel.tsx:861`, because the mapping is optional
  per column and the folder is what the run covered. The title would read
  better in the student-addressed draft opening (`class-trends-draft.ts:185`).

---

## 18. What I could not determine

- **Whether the panel, the label and the unmount behave as read.** Nothing
  renders (RES-W3-1).
- **Whether `tsc` kills S-2, S-7 and S-16 as argued.** The narrowing argument
  is sound, and wave-2 verify's N3 is the same shape, killed by TS2345. I did
  not run `tsc`, because it has one caller. The wave gate demonstrates it.
- **Whether S-17 turns canary 3 red.** This is read from
  `repoGradesBulkGrade.ts:42`, `repoGradesPosting.ts:64` and
  `classTrendsDraft.not-postable.test.ts:58`, `:67-70`, `:95-111`. I did not run
  the mutant, because this seat writes no source file.
- **The Ask-AI request size for a real org** (RES-W3-5). No data and no network.
- **Whether `gradeRepoAction` ever returns more than one result per call.** It
  grades one entry per call (`github-repos.ts:819`, `:839`), so one is expected, and the
  cell reads only `results[0]` (`useRepoGradesBulkGrade.ts:222`). The collector
  spreads ALL of them, so a hypothetical second result would enter the trends
  while the cell shows only the first. I did not trace `gradeEntries` for a
  multi-result case on a one-entry input.
- **Whether the owner has ruled on leverage anywhere other than
  `docs/a16-rulings.md` and the A16 row.** Those are the two places I searched.

---

## 19. Tree state at hand-off

`git status --short` before writing this file returned ` M docs/css-orphans.md`
only. It was left alone, as instructed. After writing: ` M docs/css-orphans.md`
and `?? docs/a16-wave3-scope.md`. The scratch probe files are under the
session scratchpad, not the repo.
