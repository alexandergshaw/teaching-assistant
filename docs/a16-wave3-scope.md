# A16 wave 3 scope: class trends on Repo Grades

Architecture seat, 2026-09-21. Revision 0 was written against `434ad5e` and
landed at `09c712e`. **Revision 1** (this text) answers the round-1 check
under rulings W3-1 to W3-5, against HEAD `5dcaba6`. What the check confirmed
sound is not reopened: the run boundary, the data gap and the collector, the
reuse boundary, the 32-file census, the import trap, the label's source, and
the sizes. Revision 1's changes, by ruling:

- **W3-1:** the pins move from "a correct gate is PRESENT" to "nothing else
  CONTROLS the node". The cohort's null handling moves into the leaf, and the
  hook calls it unconditionally. Rewrites sections 7.4, 8 and 13.
- **W3-2:** the "one shared rubric makes area names comparable" premise was
  false for rubrics that do not parse. Stated in sections 2 and 14, recorded
  as RES-W3-8, no disclosure line added.
- **W3-3:** the cap baseline is a pinned commit SHA. Rewrites section 12.
- **W3-4:** a click that grades nothing no longer clears the previous run's
  trends. Rewrites sections 7.4, 8 and S-5.
- **W3-5:** the residuals are written into `docs/backlog.yml` in substance.
- **RES-W3-7, the label copy, is discharged** here: section 7.3.
- **Owner confirmed Q1-Q3** verbatim ("1-3 are good calls"): the cohort is
  the run, the label names the folder, and there is no leverage claim.

This decides SHAPE for
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
  comparable. Only a run guarantees one shared rubric. **Owner-confirmed (Q1).**
- **Revision 1 correction (ruling W3-2): one shared rubric TEXT does not
  guarantee shared area NAMES.** The names line up only when the rubric
  PARSES. Repo Grades calls `gradeEntries([entry], ...)` once per repo
  (`github-repos.ts:839`). The engine pins areas to
  `extractRubricCriteria(rubric)` (`engine.ts:196`), and when that returns
  nothing, it falls back to the richest RESULT's own areas (`engine.ts:325-337`).
  With one result per call, that fallback lines up areas within ONE repo, never
  across the run. Both parsers need a numeric parenthetical on every
  criterion line:
  - strict: `(\d+...)` then a colon (`rubric.ts:43`);
  - widened: the parenthetical ending the line (`rubric.ts:57-100`).

  So several rubrics parse to `[]` and each repo gets model-invented area
  names:
  - a prose manual rubric;
  - a rubric whose criteria carry no points;
  - a points RANGE like "(18-20 pts)" (the documented limit at
    `rubric.ts:89-95`).

  The effect is that trends FRAGMENT into many one-of-N areas. Nothing is
  falsely merged, because `computeClassTrends` merges only names that
  normalise equal and reports coverage as "N of M" (`class-trends.ts:208`).
  So the output is honest but thin. This applies to the LLM path only. The
  embedded path builds its checks from the same rubric text and instructions
  on every call (`github-repos.ts:813`), so its names repeat. **The cost has
  not been measured. It is RES-W3-8, and no disclosure line is designed around
  it (ruling W3-2).**
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
| **L-state** | `lastRunCohort` `useState`, cleared when a run is attempted (not on an empty-plan click) and set UNCONDITIONALLY after it; the course-switch clear; the render-time `trendsEntry` | `useRepoGradesGradingActions.ts` | WHEN the cohort changes. It decides nothing about content, and not even whether a refused run yields a cohort: the leaf decides that (L-0) | AST pins (A-3 to A-5) plus `tsc` |
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

/** Revision 1 (ruling W3-1): OWNS the null decision. Returns null when
 *  `results` is null (runBulkGrade refused, so no run happened); otherwise a
 *  cohort, INCLUDING for an empty array (a run that graded nothing replaces
 *  the previous run's trends, and repoRunTrendsEntry then shows none). The
 *  hook calls this UNCONDITIONALLY, so the hook holds no condition over the
 *  cohort that a mutation could invert. */
export function buildRepoRunCohort(input: {
  results: readonly GradeResult[] | null;
  folder: string;
  courseId: string;
  course: { name: string } | null;
}): RepoRunCohort | null;

/** null unless: cohort is non-null AND cohort.courseId === liveCourseId AND
 *  hasTrendableResults(entry). The ONE gate for this surface. */
export function repoRunTrendsEntry(cohort: RepoRunCohort | null, liveCourseId: string): GradingRunEntry | null;

/** The visible line above the panel. The copy is fixed in section 7.3 (the UX
 *  pass, which discharges RES-W3-7); the facts are pinned by L-6. */
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

**7.3.1 The label copy: the UX pass, done here per the coordinator's
instruction. This discharges RES-W3-7.**

```
Trends for "<folder>" from the last Grade all run, covering the <n> repos it graded.
Trends for "<folder>" from the last Grade all run, covering the 1 repo it graded.
```

- `<folder>` is `entry.assignmentName`, and `<n>` is
  `gradedResults(entry.run.results).length`. The second line is the exact
  `n === 1` form. There is no zero form, because the gate guarantees at least
  one graded result with areas.
- It is rendered as `<p className={pageStyles.fieldHint}>` directly above the
  panel, with no role and no aria attribute (section 7.4).

Why these words, measured against the surrounding Repo Grades copy:

- **Folder in straight double quotes**, as the view already writes it:
  `index.tsx:849-851` renders `a "<folder>" folder` with `&quot;`, and the
  status line reads `<folder>: nothing to grade - ...` (`:751`). In JSX the
  implementer writes `&quot;` or a template literal, and the unit test
  reads the returned string (L-6).
- **"Grade all"** names the control the instructor just pressed. Its label
  reads "Grade all N repos in <folder>" (`RepoGradesGrid.tsx:352-357`), so the
  words point back at a visible button rather than introducing a new noun
  like "bulk run".
- **"covering the N repos it graded"** carries the one fact that could
  mislead: the trends describe THAT run, not the whole column. Already-graded
  cells are skipped (RULE 1c, `repoGradesBulkGrade.ts:115-124`), so the column
  can hold more grades than the trends cover. "Repos" is the grid's own noun
  for a row (the button label and the folder hint both say "repos").
- **Sentence case, one sentence, a period, no exclamation, no emoji.** This
  matches the `fieldHint` lines at `index.tsx:849-857` and the app's
  professional, minimal register. The panel's own heading, "Counted trends,
  per rubric area" (`ClassTrendsPanel.tsx:141`), follows immediately, so the
  label deliberately does not repeat the word "counted".
- **No completeness phrase.** It contains none of "the class", "all
  students", "every student" or "the cohort" (`class-trends.ts:27-32`), so
  L-6(d) passes.
- **Plural rule**: `repo` when `n === 1`, `repos` otherwise. That is the
  view's own rule: `index.tsx:849` uses
  `repo{displayedRows.length === 1 ? "" : "s"}` (and `:852`, `:855`).

**7.4 The other two files' contract changes:**

- `useRepoGradesBulkGrade.ts` changes in four places:
  - `runBulkGrade`'s type becomes
    `(plan: BulkGradePlan, resolved: ResolvedRubric) => Promise<readonly GradeResult[] | null>`.
    `null` means "refused, no run happened" (the `:174` guard). The array
    means "this run's results, complete".
  - **The collector is a `[]` literal declared as a direct statement of
    `runBulkGrade`'s own body** (ruling W3-1(d)), beside `outcomes` (`:181`):
    `const <X>: GradeResult[] = [];`. A collector that outlives a run (a
    `useRef([]).current`, a module-level array, a hook-level `useState`)
    mixes two folders under one label, so any other declaration form is a
    defect, not a style choice.
  - **The push is a DIRECT statement of `gradeOneTarget`'s body** (ruling
    W3-1(c)). It is not nested in any `if`, loop or callback, and it follows
    both early-return `if`s (`:204`, `:216`): `<X>.push(...result.run.results);`.
  - The function returns `<X>` as its last direct statement, after the direct
    statement `await Promise.all(...)` (`:372`). The refusal at `:174` becomes
    `if (runningFolder !== null) return null;`.
- `useRepoGradesGradingActions.ts` changes in five places:
  - `const [lastRunCohort, setLastRunCohort] = useState<RepoRunCohort | null>(null)`.
  - `setLastRunCohort(null)` as a direct statement inside the existing
    `if (courseId !== columnPostingResetForCourse)` block.
  - **`handleGradeColumn` (revision 1, rulings W3-1(a) and W3-4), every new
    statement a DIRECT statement of the handler body, in this order:**
    1. the existing plan build (`:748`);
    2. the existing empty-plan `if` and its `return` (`:749-753`). **It does
       NOT clear the cohort**: nothing ran, so nothing on screen should change
       (W3-4);
    3. `setLastRunCohort(null);`, because a run is about to be attempted;
    4. the existing column lookup and `const resolved = await resolveRubricForColumn(...)`;
    5. `const <r> = await runBulkGrade(plan, resolved);` replaces
       `void runBulkGrade(plan, resolved)`;
    6. `setLastRunCohort(buildRepoRunCohort({ results: <r>, folder, courseId, course }));`,
       UNCONDITIONAL, as the last statement.

    The handler contains no condition over the cohort. The only `if` in it is
    the pre-existing empty-plan return, which precedes every cohort statement.
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
    hint and `<RepoGradesGrid` (`:862`). The `trendsEntry && (...)` binary is
    the DIRECT expression of a JSX expression container that is a DIRECT
    child of the top-level fragment `<>` (`:707`), which the component's only
    `return (` (`:698`) returns. The label `<p>` has **no `role` and no
    `aria-live`**.

**Revision 1 correction on live regions.** Revision 0 said the view has
exactly one live region. That is false. The OUTCOME channel is one region:
`postSummary` at `index.tsx:838`, which the bulk hook's "Never add a second"
comment (`useRepoGradesBulkGrade.ts:89-91`) and
`repoGradesSliceA.guards.test.ts:150-181` protect. But the view already
renders other conditional `role="status"` nodes:

- `index.tsx:814` (the bindings banner);
- six in `RepoGradesStatusBanners.tsx` (`:94`, `:109`, `:121`, `:133`, `:140`, `:147`);
- two in `LinkUsernamesPanel.tsx` (`:356`, `:359`).

Counting `postSummary`, that is **10** rendered `role="status"` nodes in the
view today, all of them conditional. `grep -n 'role="status"'` returns 4, 6
and 3 hits on the three files; three of those hits are comments
(`index.tsx:821`, `:900`, `LinkUsernamesPanel.tsx:141`), each opened. Mounting the panel adds two more, each
user-triggered and transient:

- `ClassTrendsPanel.tsx:164`, shown only while `insight.status === "loading"`
  after the instructor clicks "Get AI reading";
- `ClassTrendsDraftPanel.tsx:110`, the "Copied." confirmation after the Copy
  button.

**Does this need an accessibility ruling? I judge not, and I route the
question rather than settle it.** Several polite status regions on one page
are allowed. The failure mode is two announcements RACING. Both new regions
appear only after a click inside the panel, while `postSummary` changes only
on a grade or post action, so a collision needs two different user actions
within one announcement. The same two regions already ship on four other
mounts (Drafted Grades and the three `GradingResults` hosts) without a ruling.
Still, this is a judgement about screen-reader behaviour, and nothing here
renders. It goes to the accessibility pass (DEV_LOOP's design wave 3) as a
named check, RES-W3-10, not to the owner.

`repoGradesRubricPicker.wiring.test.ts:199` asserts `/runBulkGrade\(plan, resolved\)/`
inside `handleGradeColumn`, and `const <r> = await runBulkGrade(plan, resolved)`
still matches it. So that file is green WITHOUT an edit, which is a stronger
condition than listing it.

---

## 8. The stale-cohort branches, enumerated by opening the handler and the hook

**The construction (revision 1): a clear when a run is attempted, an
UNCONDITIONAL set after it, and the null decision in the leaf.** The handler
body is: the plan; the pre-existing empty-plan return; `setLastRunCohort(null)`;
the awaited resolve and run; then
`setLastRunCohort(buildRepoRunCohort({ results: <r>, ... }))`. Every one of
those is a direct statement of the handler body. The hook has no `if`, `?:`
or `&&` over the cohort, so the refused-run case (`<r> === null`) is decided
by the leaf, whose unit test sees it by value (L-0).

Revision 0's handler had `if (<r> !== null) setLastRunCohort(...)`. The check
showed that `if (r?.length === 0)` in that position passes both `tsc` and a
presence pin, and sets the cohort ONLY on empty runs, so the panel never
renders. That is wave 2's first failure, in a new shape. Moving the decision
into the leaf removes the node that mutation needed.

The branches are still enumerated, because a construction is a claim until
someone opens every exit:

| # | Branch | Site | Cohort after | Held by |
|---|---|---|---|---|
| 1 | **Empty plan: "nothing to grade"** (for example, the column just graded, whose button now reads "Nothing to grade in <folder>" and stays enabled) | `useRepoGradesGradingActions.ts:749-753` | **UNCHANGED.** The previous run's trends stay on screen, because nothing ran (ruling W3-4). Revision 0 cleared them, and its S-5 made clearing mandatory | A-3a (the clear FOLLOWS the empty-plan `if`), S-5 (rewritten) |
| 2 | `resolveRubricForColumn` rejects | `:755`. Documented "Never throws" at `useRepoGradesRubricSource.ts:644`; not relied on | null, cleared before the await; the final set never runs | construction |
| 3 | Concurrent run refused | `useRepoGradesBulkGrade.ts:174` returns `null`, and `buildRepoRunCohort({ results: null, ... })` returns null | null | L-0, A-2a, S-20 |
| 4 | `runBulkGrade` rejects (server-action transport failure reaching `Promise.all`) | `:372` | null; the final set never runs. **Pre-existing, not wave 3's to fix, stated so nobody reads it as a wave-3 defect:** `setRunningFolder(null)` and `setProgress(null)` (`:376-377`) run only after `Promise.all` resolves and sit in no `finally`. So on a rejection `runningFolder` stays set. Every column's Grade all button is `disabled={bulkRunning}` (`RepoGradesGrid.tsx:421`), where `bulkRunning = bulkRunningFolder !== null` (`:334`), so all of them stay disabled until the view remounts. Routed as RES-W3-9 | construction |
| 5 | Run completes, every target failed or empty | per-target branches `:204-208`, `:216-220` | a cohort with no trendable result (`[]`, or only failures), so the leaf's entry is null and no panel shows. The previous run's trends are gone, because a run DID happen | L-0 (empty array gives a cohort, not null), L-3 cells c3/c5 |
| 6 | Run completes, partial success | `:222-296` | a cohort of the successes only | L-1, L-3 c6 |
| 7 | **Course switch** | render-phase branch `useRepoGradesGradingActions.ts:195-199`, which runs on the same `courseId` change as `index.tsx:540-542` | null | A-4, S-8 |
| 8 | **Course switched MID-RUN**: run A started, course B selected, run A completes and sets | after the `:195-199` clear | a cohort stamped `courseId = A`, which the leaf HIDES on B (L-3 c1). Switching back to A re-fires the reset branch and clears it | L-3 c1, S-9 |

**Branch 1 is ruling W3-4's default, and it is also the owner's to overturn.**
The coordinator is putting it to the owner. If the owner wants the click to
clear, the only change is swapping steps 2 and 3 of section 7.4, and the
A-3a order direction with it.

Branch 8 is why the leaf takes the live `courseId`. That is a VALIDITY check,
not data: the live id never reaches the entry. The signature cannot even
receive the live course name, so the rule "never read a live control into the
meta" holds by construction.

**Unmount between runs is load-bearing, stated because it is easy to miss.**
`ClassTrendsPanel` keeps `insight` (the Ask-AI reading) in local state
(`:89`) and does not reset it on a new `entry`. Its only entry-keyed hook is
`useMemo` at `:91`. The clear at step 3 makes React commit a render with
`trendsEntry === null`, which UNMOUNTS the panel. The clear runs
synchronously in the click's task, before the first `await`, and the set runs
after at least one `await`, so the two are separate commits. An empty-plan
click (branch 1) neither clears nor sets, so the mounted panel and its
insight state correctly survive it: they still describe the run on screen. The next run then mounts a fresh instance.
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
the file. **The gate FAILS if the addition exceeds the cap, even under 1000.**

**The base is a PINNED COMMIT, not `HEAD` (ruling W3-3, revision 1).**
Revision 0 used `git show HEAD:<f>`, and HEAD moved twice during this scope's
own lifetime (`434ad5e` to `09c712e` to `5dcaba6`, per `git log -4`). A
mid-wave commit of the wave's own files would make the addition read ZERO, so
the gate could not fail. The instrument is now:

```powershell
# AT DISPATCH, by the orchestrator, before the implementer starts:
git rev-parse HEAD | Out-File -Encoding ascii "$S\w3b-base.txt"
# AT THE GATE:
$B = (Get-Content "$S\w3b-base.txt").Trim()
git merge-base --is-ancestor $B HEAD; $?            # must be True: the base is in HEAD's history
git show "${B}:<f>" | Out-File -Encoding utf8 "$S\base-<name>.txt"   # the base copy; git show fails if it does not exist
@(Get-Content "$S\base-<name>.txt").Count                        # before-count
```

The before-count is `git show <B>:<f>`, piped to a file in `$S` and counted
with `@(Get-Content <that file>).Count`. It is never counted with
`Measure-Object -Line`, which disagrees by 42 on one file in this repo
(`traps-spec.md`). The after-count is `@(Get-Content <f>).Count` on the
working tree, and `wc -l` must agree. For the three NEW paths,
`git cat-file -e <B>:<f>` must FAIL, and their base is 0.

The gate also fails:
- if `$S\w3b-base.txt` is missing;
- if the base is not an ancestor of HEAD;
- if the base does not equal the SHA the dispatch message recorded.

The "Now" column below was measured at `5dcaba6`, and all five existing files
are byte-unchanged since `434ad5e` (`git diff --stat 434ad5e 5dcaba6` touches
only `docs/` and a backlog test). The implementer re-measures at `<B>`.

| File | Now | Estimated addition | Cap | After, at cap |
|---|---|---|---|---|
| `index.tsx` | 913 | 2 imports, 1 destructure, 6-8 mount and label, 4-6 hinge comment = 13-17 | **+20** | 933 |
| `useRepoGradesGradingActions.ts` | 770 | 2 imports, 1 state, 1 reset clear, 3 handler (clear, awaited run, unconditional set), 1 const, 1 return key, 3 interface, 6-10 comments = 18-22 | **+30** | 800 |
| `useRepoGradesBulkGrade.ts` | 381 | 1 import, 1 collector, 1 push, 1 return, type changes 2, 6-8 comments = 12-14 | **+20** | 401 |
| `repoGradesFeedbackAndFiles.wiring.test.ts` | 441 | 1 root line plus the two "32"s rewritten in place | **+3** | 444 |
| `classTrendsDraft.not-postable.test.ts` | 237 | 1 root, 3-4 comment, title rewritten in place | **+8** | 245 |
| `classTrendsFolderEntry.ts` [NEW] | 0 | 3 functions, 1 interface, header | **<= 120** total | 120 |
| `classTrendsFolderEntry.test.ts` [NEW] | 0 | L-0 to L-7 | **<= 340** total | 340 |
| `repoGradesClassTrends.wiring.test.ts` [NEW] | 0 | A-1 to A-8, the control-path helper, and detector canaries for S-22 to S-26 | **<= 450** total | 450 |

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
| L-0 | `buildRepoRunCohort`'s null decision (ruling W3-1(a)) | frozen literal cells: `results: null` returns `null`; `results: []` returns a NON-null cohort with `results.length === 0`; `results: [r]` returns a non-null cohort | the leaf inverts the null test (S-28), collapses empty into null (branch 5 would then leave the previous run's trends on screen after a run that graded nothing), or turns null into an empty cohort |
| L-1 | `buildRepoRunCohort(...).results` | same length as input, and `results[i]` is `toBe` input `[i]` for two DISTINCT result objects with different `totalScore` and `rubricAreas` | any element is rebuilt, dropped, reordered or added |
| L-2 | `buildRepoRunCohort` meta | on distinctive inputs (folder `"loops-and-arrays"`, course name `"Course Xy-7"`, courseId `"c-42"`): `folder === "loops-and-arrays"`, `courseName === "Course Xy-7"`, `courseId === "c-42"`; with `course: null`, `courseName === ""` | any two fields transposed, or any value not from its own input key |
| L-3 | `repoRunTrendsEntry(cohort, liveId) !== null` | **frozen literal truth table**, not computed through `hasTrendableResults` (that would be a tautology): c0 null cohort -> false; c1 course mismatch with trendable -> false; c2 match with one graded result carrying areas -> true; c3 match with only ungraded -> false; c4 match with graded but zero areas -> false; c5 match with empty results -> false; c6 match with one graded-with-areas plus one ungraded -> true | any cell flips. This kills negation of either guard and removal of the course check (S-9, S-10) |
| L-4 | the non-null entry's fields | `assignmentName === cohort.folder`, `courseName === cohort.courseName`, `canvasUrl === ""`, and `entry.run.results[i]` is `toBe` `cohort.results[i]`, on the distinctive values of L-2 | the folder and the course name transposed inside the leaf (S-11), or results re-mapped |
| L-5 | the counted output | `computeClassTrends(entry).totalResults` equals the literal graded count of the fixture (1 for c6; 3 for a three-graded fixture) | the leaf lets a fabricated or duplicated result through |
| L-6 | `repoRunTrendsLabel(entry)` | **Every fixture folder name contains NO digit** (`"loops-and-arrays"`, `"linked-lists"`), because revision 0's `"hw3-loops-Zq"` held a `3` and made (b) pass even with the count omitted. Checks: (a) contains `entry.assignmentName`; (b) contains the graded count as a numeral: `"3"` for the three-graded fixture and `"1"` for c6, each asserted after `split(folder).join("")` removes the folder, so no other text can supply the digit; (c) for two entries identical except folder A vs B, `label(A).split(A).join(B) === label(B)`; (d) `containsForbiddenCompletenessPhrase(label) === false`; (e) the singular form for n = 1 (`/\b1 repo\b/` matches and `/\b1 repos\b/` does not) | the label drops the folder (S-15) or the count (S-29), shows a wrong count, reads a value from anywhere but the entry, misuses the plural, or claims completeness. **Only these facts are pinned, never the full sentence** (`source-text-tests-overspecify`); section 7.3.1 fixes the words, and the implementer matches them |
| L-7 | the leaf's own source, AST | imports `hasTrendableResults` and `toClassTrendsEntry` from `"../grading-results/classTrendsEntry"`; declares no function or const whose name matches `/trendable/i`; declares no interface or type alias whose name matches `/Meta\b/`; the value-import specifier set is a subset of `{"@/lib/grade/types", "../grading-results/classTrendsEntry"}`; it has no import from `./repoGrades*` | a second predicate (S-19), a second meta type, or a new edge (S-17 is also caught by canary 3) |

### 13.2 Wiring rows, AST. Instrument: `npx vitest run src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts`

| ID | Object (file, then region) | Pass | RED when |
|---|---|---|---|
| A-1 | `useRepoGradesBulkGrade.ts`: the arrow bound to `gradeOneTarget` | an `ExpressionStatement` whose call is `<X>.push(...result.run.results)`: the callee is a `PropertyAccessExpression` named `push` on Identifier `<X>`, with a single `SpreadElement` argument of `result.run.results`. **CONTROL-PATH RULE: that statement's PARENT is the arrow's own body `Block`**. It is not inside an `if`, a loop, a callback or a nested block, and it follows both early-return `IfStatement`s (`"error" in result`, `"noSubmission" in result`) among the body's direct statements | the push is deleted (S-1) or nested under any condition (S-25), or its argument is anything but the spread. Moving it into an early-return branch is ALSO a `tsc` error (S-2, kept) |
| A-2 | the same file: the arrow bound to `runBulkGrade` | (a) its FIRST direct statement is `if (runningFolder !== null) return null;`, where the then-branch's `ReturnStatement` expression is the `null` keyword; (b) among its DIRECT statements is `const <X> = [];`: a `VariableStatement` with `const`, one declarator named `<X>` (the A-1 identifier), an initializer that is an `ArrayLiteralExpression` with zero elements, and an optional type annotation; (c) `<X>` is never the left side of an assignment anywhere in the file; (d) its LAST direct statement is `return <X>;`, preceded among the direct statements by an `ExpressionStatement` whose expression is `await Promise.all(...)` | the refusal returns anything but `null` (S-20); the collector outlives the run (a `useRef([]).current`, a module array or hook state), which mixes two folders under one label (S-26); the collector is reassigned; or it is returned before the pool drains (S-3) |
| A-3 | `useRepoGradesGradingActions.ts`: the arrow bound to `handleGradeColumn` | **CONTROL-PATH RULE: every statement named here is a DIRECT statement of the handler's body `Block`, and the body contains EXACTLY ONE `IfStatement`**: the pre-existing `plan.targets.length === 0` return, whose then-block contains no `setLastRunCohort`. (a) Exactly one `setLastRunCohort(null)` direct statement, which comes AFTER that `IfStatement` and BEFORE the first direct statement containing `await`; (b) exactly one other `setLastRunCohort(` call in the handler, which is the handler's LAST direct statement. Its sole argument is `buildRepoRunCohort(<ObjectLiteral>)`, and it is not wrapped in a `ConditionalExpression`, a `&&` / `\|\|` / `??` binary or an `if`; (c) the object literal binds `results` to the Identifier `<r>` declared by a preceding DIRECT `const <r> = await runBulkGrade(plan, resolved);`, and binds `folder`, `courseId` and `course` each to the same-named Identifier (shorthand or `k: k`), with no other properties | the attempt-time clear is deleted (S-4) or moved above the empty-plan `if` (S-5, revision 1 direction); the set is wrapped in any condition (S-7, revised, and S-24); the results come from anything but the awaited run (S-6); or keys are transposed or blanked (S-18) |
| A-4 | the same file: the `IfStatement` whose condition is `courseId !== columnPostingResetForCourse` | a `setLastRunCohort(null)` `ExpressionStatement` whose parent is that `if`'s then-`Block` (control-path rule) | the course-switch clear is deleted (S-8) or nested |
| A-5 | the same file: the component-level `VariableDeclaration` `trendsEntry` | its `VariableStatement` is a DIRECT statement of the hook function's body; its initializer is `repoRunTrendsEntry(lastRunCohort, courseId)`, both arguments bare Identifiers; the returned object literal includes `trendsEntry`; `hasTrendableResults` is referenced NOWHERE in this file; `setLastRunCohort` is called in exactly three places in the file (A-3a, A-3b, A-4) | an entry built from `cellEdits` or another live array (S-12); a second gate in the hook; a fourth writer of the cohort |
| A-6 | `index.tsx`: the JSX tree | `import ClassTrendsPanel from "../drafted-grades/ClassTrendsPanel"`, and **exactly one** `<ClassTrendsPanel` element in the file, with an `entry` initializer that is the bare Identifier `trendsEntry` (no `NonNullExpression`) and a `defaultExpanded` attribute. **CONTROL-PATH RULE, from that element up to the render root, with every node checked and anything else failing.** The element's ancestors are, in order: the wrapper `JsxElement` (optionally a `ParenthesizedExpression`), then exactly one `BinaryExpression` with operator `&&` whose LEFT operand is the bare Identifier `trendsEntry` and whose RIGHT operand contains the element, then a `JsxExpression` whose `expression` IS that binary, then the top-level `JsxFragment`, then the `ParenthesizedExpression` of a `ReturnStatement` that is a DIRECT statement of the default-exported component function's body. Any other `JsxExpression`, `ConditionalExpression`, `BinaryExpression`, `CallExpression`, `IfStatement` or function on that path fails | the tag is deleted (S-13, the leverage removal test); it is mounted ungated via `trendsEntry!` (S-14); the guard is negated (S-16, also a `tsc` kill, kept); **a correct gate has a negated gate nested inside it** (S-22, which `tsc` does NOT catch, because the variable narrows to `never`); or **a correct gate sits under an unrelated condition** (S-23) |
| A-7 | `index.tsx`: the label | exactly one `CallExpression` `repoRunTrendsLabel(trendsEntry)` in the file. Its parent is a `JsxExpression`, whose parent is a `<p>` `JsxElement` whose parent is THE SAME wrapper `JsxElement` as A-6's; from there up, the same path as A-6. `repoRunTrendsLabel` is imported from `"./classTrendsFolderEntry"`; the `<p>` carries no `role` and no `aria-*` attribute | **the label is never written** (S-15b, the wave-2 P20 class one prop over, closed from the start); the label is gated separately; or a new live region is added |
| A-8 | `index.tsx`: source positions and binding | A-6's `JsxExpression` starts after the `postSummary` status region's `JsxExpression` and before the one containing `<RepoGradesGrid`, as siblings in the top-level fragment; `hasTrendableResults` is referenced nowhere in `index.tsx`; `trendsEntry` is bound by the destructuring pattern of the `useRepoGradesGradingActions({` call and by nothing else | the mount is moved away from the run; a duplicate gate at the mount; a locally built entry |

**Every control-path detector ships with canaries built from the check's own
mutants** (S-22 to S-26). Each is a fixture string parsed with the same
helper, and each must return false. The canaries are:

- a correct gate wrapping a negated one;
- `{model && trendsEntry && (...)}`;
- `{flag ? (trendsEntry && ...) : null}`;
- `if (r?.length === 0) setLastRunCohort(...)`;
- `if (first) X.push(...)`;
- `const X = useRef<GradeResult[]>([]).current`.

The intended shape must return true.

**Revision 0 got this wrong, and the correction is a change of approach, not
a stronger pin (ruling W3-1).** Revision 0 said that A-6 asked the question
structurally and that "every form of negation fails". That was false as
written. Its detectors asked whether a correct gate was PRESENT somewhere
above the node. The check built replicas and showed five shapes that pass
both that detector and `tsc`:

- a negated gate nested INSIDE the correct one, where `trendsEntry` narrows to
  `never` and `never` is assignable to anything;
- a correct gate under an unrelated, usually-false condition;
- `if (r?.length === 0)` around the cohort set, which sets the cohort only on
  EMPTY runs and brings back wave 2's first failure;
- a push under a spurious condition;
- a collector held across runs.

Revision 1 asks the opposite question: **does anything OTHER than the one
designated gate stand between this node and the root?** That question is
answered by enumerating the whole path, not by finding one ancestor. For the
cohort set, the construction removes the condition entirely: the null decision
lives in the leaf (L-0), where a unit test sees it by value.

### 13.3 Gate rows (W3B), in addition to plan 9.0's standing snapshot diff

| Instrument | Pass |
|---|---|
| plan 9.0's repo-wide `git status --short` snapshot diff, both files in the session scratchpad | every new or changed path is one of WS-1 to WS-8; no path under `.claude/worktrees/`; `docs/css-orphans.md` ignored and not staged |
| section 12's eight caps, against the PINNED base `<B>` from `$S\w3b-base.txt`, never `HEAD` (ruling W3-3) | `<B>` exists, is an ancestor of HEAD and equals the SHA recorded at dispatch; every addition is at or under its cap, measured by BOTH counters with the SAME number |
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
| S-4 | delete the attempt-time `setLastRunCohort(null)` | A-3a |
| S-5 | **Rewritten under ruling W3-4.** Move the clear ABOVE the empty-plan `if`, which was revision 0's behaviour: a "Nothing to grade" click would wipe the trends of the run that just finished | A-3a (order: the clear must FOLLOW the `IfStatement`) |
| S-6 | `buildRepoRunCohort({ results: [], ... })` | A-3c |
| S-7 | **Revised, stated rather than silently kept.** Revision 0's mutant `if (<r> === null) setLastRunCohort(buildRepoRunCohort({ results: <r>, ... }))` was a `tsc` kill because `results` did not accept `null`. **Ruling W3-1(a) makes `results` nullable, so this mutant now TYPE-CHECKS, and its `tsc` kill is gone.** It is killed by A-3b (the set must be an unconditional direct statement) and by A-3's one-`if` count. That is a deliberate trade: the condition no longer exists to mutate | A-3b |
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
| S-22 | inside the correct gate, render `{!trendsEntry && <ClassTrendsPanel entry={trendsEntry} defaultExpanded />}` (the check's replica: passes revision 0's detector AND `tsc`, via `never`) | A-6 control path (an extra `JsxExpression` and `BinaryExpression` between the element and the wrapper) |
| S-23 | `{model && trendsEntry && (...)}`, or the correct gate inside `{someFlag ? (...) : null}` | A-6 (the gating `&&`'s left operand is not the bare `trendsEntry`, or a `ConditionalExpression` is on the path) |
| S-24 | wrap the final set in `if (<r>?.length === 0) { ... }` (the check's replica: the cohort is set only on EMPTY runs, so the panel never renders) | A-3 (a second `IfStatement`; the set is no longer a direct statement) |
| S-25 | wrap the push in `if (first) { ... }` | A-1 control path |
| S-26 | replace the collector with `const <X> = collectorRef.current;` held across runs by `useRef<GradeResult[]>([])` | A-2b (the initializer is not an empty array literal) |
| S-28 | the leaf returns `input.results === null ? cohort : null` | L-0 |
| S-29 | the label omits the count | L-6b, now that the fixture folders hold no digit |

S-2 and S-16 keep their `tsc` kills, as the round-1 check confirmed. S-7's
`tsc` kill is retired by ruling W3-1(a), as the S-7 row says, and A-3b
replaces it. **S-22 is the case `tsc` provably cannot see**, which is why A-6
exists at all. `tsc` has one caller, so the `tsc`-killed mutants run in the
verification pass, one at a time, and never concurrently with another agent's
sabotage.

---

## 14. Leverage: the trigger fired, and there is no new claim to make

**Trigger:** W3B builds a capability a user reaches, on a surface that has none
today (`DEV_LOOP.md`, "The loop / Criteria").

**The honest answer: wave 3 earns no categorical advantage over a chat window.**

- **SCALE** is the candidate the surface tempts. A Repo Grades run pins ONE
  rubric across N repos (`establishSharedRubric`,
  `useRepoGradesBulkGrade.ts:126-142`, gated at `:340-354`). Revision 0 said
  this "makes the area names comparable across the cohort at all". **That
  holds only when the rubric parses** (ruling W3-2, section 2, RES-W3-8). On
  the LLM path with an unparseable rubric, each repo's areas are reconciled
  only against themselves (`engine.ts:325-337`). Either way, that
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

**The three-way call is the owner's, and it is now MADE.** Revision 0 found
that it had been made only by a seat (`docs/a16-scope.md` section 11): `grep
-ci leverage docs/a16-rulings.md` returned 0 against a canary of 24 `## RULING`
headings. The owner then confirmed Q2 verbatim ("1-3 are good calls"), as
recorded in the A16 row at `5dcaba6`. **Wave 3 accepts the cost explicitly:
it is a reachability and click-cost change with no categorical claim.**

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


### 15.1 Revision 1's own disposition: revision 0's items, re-derived after renumbering

| Revision 0 item | Disposition | Where now |
|---|---|---|
| A-1 (push present after the no-submission `if`) | **Kept and tightened** (W3-1(c)): the push must be a direct statement | A-1 |
| A-2 (refusal returns `null`; collector returned after the pool) | **Kept and tightened** (W3-1(d)): the collector is a `const` empty-array literal declared directly in `runBulkGrade`, and it is never reassigned | A-2 |
| A-3 (click-time clear first; one conditional set) | **Replaced** (W3-1(a), W3-4): the clear FOLLOWS the empty-plan `if`, the set is unconditional and last, and the handler has exactly one `if` | A-3 |
| A-4, A-5, A-8 | **Kept**. A-4 and A-5 gain direct-statement and writer-count clauses | A-4, A-5, A-8 |
| A-6 (an ancestor `&&` whose left operand is the bare identifier) | **Replaced** (W3-1(b)): the whole path from element to render root is enumerated | A-6 |
| A-7 | **Kept**, now bound to A-6's wrapper and path | A-7 |
| L-1 to L-7 | **Kept**. L-2 and L-6 fixtures lose their digits; L-6 gains (e) | L-1 to L-7 |
| (new) | **Added**: the leaf's null decision | L-0 |
| S-5 (clear moved below the empty-plan return, killed) | **Inverted** (W3-4): clearing ABOVE it is now the mutant | S-5 |
| S-7 (a `tsc` kill) | **Kill re-homed**: `tsc` no longer sees it once `results` is nullable; A-3b kills it | S-7 |
| (new) | **Added**: the check's replicas S-22 to S-26, plus S-28 and S-29 | 13.4 |
| RES-W3-6 | **Handed over** to row A26, with the checker's by-reading finding cross-referenced | 16 |
| RES-W3-7 | **Discharged** | 7.3.1 |
| (new) | **Added**: RES-W3-8 to RES-W3-11 | 16 |
| Section 12's `git show HEAD:<f>` base | **Replaced** (W3-3) by a pinned SHA | 12 |
| "the view has exactly one live region" (section 7.4) | **Withdrawn as false**; corrected, and routed as RES-W3-10 | 7.4, 16 |
| "one shared rubric makes area names comparable" (sections 2, 14) | **Withdrawn as a general claim** (W3-2); true only for a rubric that parses | 2, 14, RES-W3-8 |

---

## 16. Residual register

Each entry names an owner, an instrument and the step that will measure it.
**Revision 1 wrote every open entry below into `docs/backlog.yml` IN
SUBSTANCE**, under ruling W3-5:

- the A16 row's note, for RES-W3-1 to -3, -5, and -8 to -11, and for RES-V-1,
  -3, -4, -6, -7 and -8;
- the N13b row's note, for RES-W3-4.

RES-W3-6 already has its own row, A26. RES-W3-7 is discharged in section
7.3.1. The instrument proving the recording is the pair of `grep` counts in
section 19.

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| **RES-W3-1** | Nothing renders, so five Repo Grades behaviours are unverified: (1) the label and panel appear ABOVE the grid, below the status line, after a Grade all run; (2) `defaultExpanded` opens the panel; (3) the label names the folder of the column just graded and the right count; (4) starting a second run UNMOUNTS the first run's panel, discarding its AI reading (section 8); (5) a "Nothing to grade" click leaves the panel in place (W3-4) | The repo owner | A real browser with env vars: grade column A, read the label; click column A's button again ("Nothing to grade in A"), and the panel must stay; grade column B, and the panel must close at the click and reopen labelled B | Owner verification after the W3B push |
| **RES-W3-2** | Trends vanish on reload. This is CONSISTENT with the grid: `cellEdits` is not persisted either (`index.tsx:180`), so the graded cells vanish too. That is unlike the recording surface, where rows persist and trends do not (plan RES-P-6). No upgrade path short of persisting `cellEdits` | The repo owner | Grade a column, reload, and confirm that cells and trends both reset | Owner verification after the W3B push |
| **RES-W3-3** | After a run, a one-cell regrade or a hand edit leaves the trends describing the run's CAPTURED results, per plan 5.5's "tied to what this run covered" rule. The same question is unruled on the recording surface (RES-V-6) | The repo owner, a product decision | A real browser: regrade one cell of a graded column and read the trends | Owner verification after the W3B push, asked together with RES-V-6 |
| **RES-W3-4** | `student` on every cohort result is the repo's full name (`github-repos.ts:619`), not the bound roster student. That is invisible today and matters once N13b adds per-student attribution | The N13b scoping seat | `grep -n "student:" src/app/actions/github-repos.ts`, plus N13b's own criterion on which name a Repo Grades attribution shows | N13b's scoping pass, which already follows A16. **Recorded in the N13b row** |
| **RES-W3-5** | The Ask-AI request carries every graded repo's `submittedFiles` preview content. `ClassTrendsPanel.tsx:101` posts `JSON.stringify({ entry })` whole, while the model reads only areas and `overallComment` (`class-trends-insight.ts:59-69`). The size against the host's request-body limit is unmeasured. The same exposure already ships on `GithubGradingPanel` via A16-1 | The repo owner | A real browser: the network tab's request size for "Get AI reading" after a large-org run | Owner verification after the W3B push. A projection fix would belong to `ClassTrendsPanel.tsx` and serve every mount, so it would be its own row |
| **RES-W3-6** | The concurrent-run race | Row **A26** | A26's own instrument | A26's scoping. **Cross-reference, recorded rather than fixed:** the round-1 check established the race as REAL BY READING. The buttons disable only on `runningFolder` (`RepoGradesGrid.tsx:334`, `:421`), which `runBulkGrade` sets (`useRepoGradesBulkGrade.ts:178`) only after `handleGradeColumn` has awaited the rubric (`useRepoGradesGradingActions.ts:755`). Only the `assignment`, live-LMS and `export` rubric sources have a real network await in that window; `generate` and `manual` return at once (`useRepoGradesRubricSource.ts:652-655`). Wave 3 does not change this, and its trends consequence is last-completion-wins, correctly labelled |
| **RES-W3-7** | The label copy | UX pass | Reading, plus L-6 | **DISCHARGED** in section 7.3.1 |
| **RES-W3-8** | **Trends fragment when the rubric does not parse** (ruling W3-2, section 2). The LLM path calls `gradeEntries` once per repo, and with `extractRubricCriteria` returning `[]` the engine reconciles each result's areas only against themselves (`engine.ts:325-337`). A prose rubric, a rubric without points, or a points range can therefore yield model-invented, repo-specific area names, many one-of-N trends and few merged ones. It is honest but thin. **The cost is unmeasured, and no disclosure is designed** | **The W3B verification seat** measures; the owner decides whether any disclosure is warranted | A unit test in the verification pass, network-blocked as usual. (1) `extractRubricCriteria` returns `[]` for three fixtures: prose, no points, and a range. (2) Two `gradeEntries([entry], ...)` calls with `callLlm` MOCKED, never `fetch`, to return differently worded areas for the same criteria. (3) Both results go through the real `buildRepoRunCohort` and `repoRunTrendsEntry`. (4) Report `computeClassTrends(entry).areas.length` and each area's `resultsWithArea`, next to the same run with a parseable rubric | The W3B verification pass. The finding goes to the owner with the numbers attached |
| **RES-W3-9** | **Pre-existing, not wave 3's.** A rejected `runBulkGrade` (a server-action transport failure reaching `Promise.all`, `useRepoGradesBulkGrade.ts:372`) never runs `setRunningFolder(null)` or `setProgress(null)` (`:376-377`), because they are in no `finally`. Every column's Grade all button then stays disabled (`RepoGradesGrid.tsx:334`, `:421`) until the view remounts | **The orchestrator**, to file a bug row. It sits beside A26 in the same hook, and is a different defect | A reading today: `sed -n '171,378p' useRepoGradesBulkGrade.ts` shows no `try` or `finally`. The fix's own test must execute the rejection | Its own row's scoping |
| **RES-W3-10** | **Status regions on one screen.** Revision 0 wrongly claimed one live region. The view renders 10 conditional `role="status"` nodes today (section 7.4), and the panel adds two transient, click-triggered ones (`ClassTrendsPanel.tsx:164`, `ClassTrendsDraftPanel.tsx:110`). I judge no ruling is needed, because announcements collide only across two separate user actions and the same regions ship on four other mounts. That is a screen-reader judgement nothing here can observe | The accessibility seat | Reading, plus the owner's screen reader if the seat asks for one | W3B's accessibility step (DEV_LOOP "Accessibility") |
| **RES-W3-11** | **Ruling W3-4's default**: a "Nothing to grade" click keeps the previous run's trends. The coordinator made it and is putting it to the owner | The repo owner | The owner's answer | The coordinator's next batched owner question. If overturned, section 8's note names the two-line swap and the A-3a direction flip |
| **RES-V-1** | 10 lines of headroom on `GradingRecordingPanel.tsx` (990, `@(Get-Content).Count`), and no gate on a wave's own additions | The orchestrator | Plan 5.4's commands | Before dispatch of any wave whose set contains that file. **Recorded in the A16 row** |
| **RES-V-3, -4, -6, -7, -8** | The wave-2 verify residuals. Each is written in substance into the A16 row, with its owner, its instrument and a step that names an existing trigger | as in `docs/a16-wave2-verify.md` section 9 | as there | **Recorded in the A16 row**; see it for each step |

---

## 17. Owner questions: ANSWERED

The owner confirmed all three verbatim ("1-3 are good calls"), as recorded in
the A16 row at `5dcaba6`:

- **Q1:** the cohort is the RUN, not the column.
- **Q2:** no leverage claim; the cost is accepted explicitly.
- **Q3:** the label names the FOLDER, not the mapped Canvas title.

One new question is the coordinator's to ask, not mine: RES-W3-11.

---

## 18. What I could not determine

- **Whether the panel, the label and the unmount behave as read.** Nothing
  renders (RES-W3-1).
- **The five control-path mutants (S-22 to S-26) were not executed by me.**
  The check executed replicas of them against revision 0's detectors. The
  revision-1 detectors' kills are claims until the W3B verification runs them.
  Each detector ships with fixture canaries of exactly those shapes, so the
  detector's own test proves it discriminates before the real file is read.
- **`tsc`:** the check demonstrated the kills of S-2 and S-16. S-7's `tsc`
  kill is retired by ruling W3-1(a), as stated in its row. I did not run
  `tsc` (one caller).
- **Whether S-17 turns canary 3 red.** This is read from
  `repoGradesBulkGrade.ts:42`, `repoGradesPosting.ts:64` and
  `classTrendsDraft.not-postable.test.ts:58`, `:67-70`, `:95-111`. The check
  found the `import type` form safe.
- **The fragmentation cost** (RES-W3-8) and **the Ask-AI request size**
  (RES-W3-5). Neither is measured.
- **Whether `gradeRepoAction` ever returns more than one result per call.** It
  grades one entry per call (`github-repos.ts:819`, `:839`), so one is
  expected, and the cell reads only `results[0]`
  (`useRepoGradesBulkGrade.ts:222`). The collector spreads ALL of them. I did
  not trace `gradeEntries` for a multi-result case on a one-entry input.

---

## 19. Tree state at hand-off

Revision 0 landed at `09c712e`. Revision 1 edits three tracked files:

- this document;
- `docs/backlog.yml`, the A16 and N13b notes only, under ruling W3-5;
- `docs/BACKLOG.md`, regenerated by `npm run backlog:render`, never hand-edited.

`docs/css-orphans.md` was left alone. The final `git status --short` and the
backlog gate results are in this revision's report.
