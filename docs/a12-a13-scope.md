# A12 + A13 scope: the visible state for a row the grader did not grade

Authored by a SCOPING seat, 2026-09-20, against `1083da0` (`git rev-parse
--short HEAD`). Working tree at authoring time carried thirteen modified files
and one untracked file, all under `src/app/components/snapshot-grading/`,
`src/app/components/assessment-shared/` and `src/lib/grade/prompts*`
(`git status --short`) - none of them appears in this document's `owns`, so
this chunk is disjoint from the A11 work in flight.

**Every quantity below names the command that produced it.** Line counts use
`@(Get-Content <path>).Count` from PowerShell, never `Measure-Object -Line`.

**Every claim about what an instructor SEES is a reading claim.** vitest here
is node-env and collects only `src/**/*.test.ts`; no component in this repo is
rendered by any test. Nothing in section 5 or 6 proves a control appears on
screen. Only the owner, in a browser, can confirm that - see RES-4.

---

## 0. Two paths I could not touch, and one that would have blocked this chunk

My brief forbade `src/lib/grade/engine.ts`, `src/lib/grade/prompts.ts`,
`src/app/components/snapshot-grading/`, `src/app/components/assessment-shared/`,
`src/app/components/grading-recording/` and `src/app/actions/grading-submission-*.ts`.
I read `engine.ts` and `types.ts` read-only to trace the row; I wrote nothing.

**One correction the chunk genuinely needs and CANNOT make here, stated loudly
as the brief required.** The not-attempted message the instructor ends up
reading is authored at `src/lib/grade/engine.ts:307` and `:320`. The
count-bound one says, verbatim:

> `Not graded: this run is limited to ${maxSubmissions} submissions. Re-run to grade the rest.`

On `GithubGradingPanel.tsx` that instruction is **false**. The panel's queue is
unchanged by a run (`src/app/components/GithubGradingPanel.tsx:372-378` passes
`queue.map(...)` wholesale), and `gradeStudentEntries` always takes a PREFIX
(`src/lib/grade/engine.ts:191`, `studentSubmissions.slice(0, maxSubmissions)`),
so pressing Grade again re-grades the same first N and drops the same tail.
Correcting that sentence means editing `engine.ts`. **This chunk must not do
it.** It is filed as RES-1 with a receiver and a sequencing constraint. The
disclosure this chunk builds must therefore state the FACT and the COUNT and
must NOT add a second copy of that instruction; see AC-3.

`src/app/actions/grading.ts` is NOT in the forbidden set (the forbidden glob is
`grading-submission-*.ts`, which resolves to `grading-submission-extract.ts`
and `grading-submission-grade.ts` - `ls src/app/actions/ | grep -i grading`).
This chunk does not need it anyway.

---

## 1. What exists today, traced hop by hop

### 1.1 The not-attempted row (A12's machinery) - EXISTS, three producers

Command: `grep -n "buildUngradedRow\|deadlineTailStart\|stoppedBy:\|GRADING_FAILURE_PREFIX" src/lib/grade/engine.ts`

| Hop | `file:line` | What it is |
|---|---|---|
| Factory | `src/lib/grade/engine.ts:146-171` | `buildUngradedRow(entry, outcome, codeRun?, submissionTruncated?)` returns an `UngradedResult` |
| Failure row | `src/lib/grade/engine.ts:256-269` | `kind: "grading-failed"`, message is `GRADING_FAILURE_PREFIX` + the thrown text |
| Deadline tail | `src/lib/grade/engine.ts:297-310` | `kind: "not-attempted"`, `stoppedBy: "run-deadline"` |
| Count-bound tail | `src/lib/grade/engine.ts:311-323` | `kind: "not-attempted"`, `stoppedBy: "submission-count-bound"` |

Fields the row carries (`src/lib/grade/types.ts:140-170`, read directly):
`kind`, `stoppedBy` (not-attempted only), `sourceIndex`, `student`,
`canvasUserId?`, `message`. The row itself
(`src/lib/grade/types.ts:266-269`) is `GradeResultBase` plus
`userId?: never` and `ungraded: UngradedOutcome`. `buildUngradedRow` sets
`totalScore: ""`, `rubricAreas: []`, `improvements: ""`,
`resubmitNotice: ""`, and `strengths = outcome.message`, with
`overallComment = composeOverallComment(strengths, "", "")`
(`engine.ts:151-153`).

Two facts this changes about A12's own wording, both load-bearing:

- **`sourceIndex` is explicitly NOT a re-run key.** `types.ts:143-149` says so
  in terms: it indexes the array `gradeStudentEntries` received, "not an index
  into any caller's own input array... a caller that treats it as a re-run key
  re-runs the wrong student."
- **On the GitHub-repo path the row carries no repo reference at all.**
  `gradeReposAction` builds entries with `repoDigestToEmbeddedEntry`
  (`src/app/actions/github.ts:574-596`), which sets only `student`, `content`,
  `mergedFileCount`, `submittedFiles` - no `gradedRepo`, no `gradedRef`, no
  `userId`. `student` is `label?.trim() || digest.fullName`
  (`github.ts:591`), and `label` is a human student label derived from the
  repo-name prefix (`GithubGradingPanel.tsx:328-332`). So the only identity a
  dropped repo's row carries is a display string that may or may not be a repo
  ref.

Which paths can actually produce these rows:

- `gradeReposAction` (`src/app/actions/github.ts:603`) calls
  `gradeEntries(entries, instructions, effectiveRubric, provider)` at
  `github.ts:753` - four arguments, **no `options`**, so `deadlineMs` is
  undefined and only the count-bound tail can fire there.
- `gradeAction` (`src/app/actions/grading.ts:705`) threads `deadlineMs` only
  from a `runDeadlineMs` FormData field supplied by unattended workflow callers
  (`grading.ts:727-730`), so the attended GradingTab path also sees only the
  count-bound tail.
- The bound is `DEFAULT_MAX_SUBMISSIONS = 40` at `src/lib/gemini.ts:32`
  (`sed -n '28,36p' src/lib/gemini.ts`). A12's `instrument` field is correct
  here and its title's citation of `:25` is stale, as the row itself says.

**The repo-grades grid cannot produce these rows at all.** Its bulk path is a
client-side worker pool calling `gradeRepoAction` one repo per call
(`src/app/components/repo-grades/useRepoGradesBulkGrade.ts:40,193`), and the
per-cell path is a single `gradeRepoAction` call
(`useRepoGradesGradingActions.ts:38,283`). One entry per call never reaches a
bound of 40 and never sees a deadline. This narrows A12 to exactly the surfaces
that render a multi-entry `GradingRun`.

### 1.2 `checkRowPostability` (A13-1's machinery) - EXISTS, two return shapes

`src/lib/grade/postable.ts:104-126` (whole file read, 126 lines by
`@(Get-Content src/lib/grade/postable.ts).Count`). It returns exactly
`{ postable: true }` or `{ postable: false; reason: string }`
(`postable.ts:90-92`). It refuses only when all four clauses hold:
producer score blank AND every producer rubric-area score blank AND submitted
score blank AND submitted comment byte-identical to the producer's
`overallComment` (`postable.ts:107-113`).

**The two states nest but are not equal, and this decides the surface's
vocabulary.** An untouched ungraded row satisfies all four clauses (its
`totalScore` is `""`, its `rubricAreas` is `[]` so `every` is vacuously true,
and `defaultRowEdit` seeds `overall` from `result.overallComment`
- `src/app/components/grading-results/gradingResultsHelpers.ts:315-324`), so
every untouched ungraded row is also `postable: false`. The converse fails:

- A **rescued ungraded row** (instructor typed a score) becomes
  `postable: true` and is STILL ungraded - and because `UngradedResult.userId`
  is `never`, `canPostRow` at `GradingResults.tsx:579` is false, so no Post
  button ever appears for it. Today the instructor types a score into a
  not-attempted row and nothing happens, with no explanation. That dead end is
  currently invisible and is part of what this chunk must state.
- A **failed-to-parse GRADED row** with a real `userId` is `postable: false`
  and is not ungraded. That is A13's original case.

Two states, one surface. They must be rendered as two labels, not one.

### 1.3 The review table - established exactly, by opening it

Command: `grep -rn "import GradingResults" src/ --include=*.tsx` returns three
importers: `GithubGradingPanel.tsx:18` (A12's GitHub-repo path),
`GradingTab.tsx:18` (the Canvas/zip path) and `LiveFeedPanel.tsx:22`.
**`src/app/components/GradingResults.tsx` is THE review table for both rows.**

What it renders per row today (`GradingResults.tsx:574-831`, read in full):

| Column | Line | What an ungraded row shows |
|---|---|---|
| Student | `:584-685` | name; SpeedGrader link only if `userId`; Post button only if `canPostRow` (`:579`), so **absent**; code-run label and Run code button |
| Files | `:686-759` | whatever `submittedFiles` carries |
| Per-criterion | `:760-803` | `rubricAreas` is `[]`, so `areaMap` misses every canonical name and each cell renders the literal `"-"` (`:799`) |
| Grade | `:804-820` | a TextField seeded from `totalScore`, i.e. **empty and editable** |
| Feedback | `:821-830` | `RowFeedbackBoxes`, whose `strengths` box holds `ungraded.message` |

So a dropped repo renders as a row with blank criteria, an empty editable
grade box, no Post button, and the reason buried inside a feedback textarea
alongside real feedback from other students. Nothing marks it as a distinct
state, and `useResultsSort`'s default sorts by student name, so it lands
alphabetically in the middle of the graded rows rather than at the end.

**Zero rendering of the ungraded flag, with a canary.** Command:
`grep -rn -i "ungraded" src/app/components --include=*.tsx | grep -v "\.test\."`
returns 14 lines. The instrument works (it hits real code). Every hit is one
of three non-matches: `course-intel/CourseIntelAnswer.tsx` (a Canvas
"ungraded backlog" concern signal, unrelated), `repo-grades/index.tsx:393`,
`RepoGradesGrid.tsx:251,260` and `RepoGradeCellControl.tsx:15` (the grid's OWN
cell status union `"ungraded" | "missing-folder" | "scan-error"` at
`repoGradesRows.ts:69`, a different concept), and `GradingResults.tsx:256-260`,
which is a **comment**. No production `.tsx` reads `GradeResult.ungraded`.

**The refusal reason is computed and then thrown away at the surface. This is
the sharpest defect in this pass and neither row names it.**
`GradingResults.tsx:392` stores the A13 refusal as
`{ status: "skipped", message: check.reason }`, and `:300`, `:325`, `:339`
and `:355` do the same on the bulk path. The renderer at `:621-627` is:

```
{status.status === "posted"
  ? "Posted to Canvas"
  : status.status === "posting"
    ? "Posting..."
    : status.status === "skipped"
      ? "Not posted - no grade or comment to send"
      : `Failed: ${status.message ?? ""}`}
```

The `"skipped"` branch (`:626`) renders a **hardcoded string and discards
`status.message`**. So an instructor who presses Post on a failed row is told
"no grade or comment to send" - which reads as their own omission - instead of
"this looks like a failed or unparsed grading result." `postable.ts:100-103`
says the predicate returns a reason "so a caller can surface why a row was
refused instead of dropping it silently". The one UI caller drops it.

The same line also discards the OTHER reason source: `fanOutGradingPostResult`
returns Canvas's own per-student skip reason
(`gradingResultsPostOutcome.test.ts:26-39` asserts
`{ status: "skipped", message: "No grade or comment to send for this student." }`),
and that message never reaches the screen either.

### 1.4 A re-run control for a single row - EXISTS on one surface, not the one A12 needs

Command: `grep -rn "Not graded\|Re-run\|Retry\|retry" src/app/components --include=*.tsx | grep -v "\.test\."`
(canary: it returns real controls elsewhere, e.g. `CopyRepoPanel.tsx:742` and
`InSessionBanner.tsx:177,212`, so a zero in the grading tables is a real
absence, not a broken instrument).

- **`RepoGradeCellControl.tsx` already has both halves of A13-2.** It renders
  the postability refusal reason at `:617`
  (`{!postability.postable && <span className={styles.postReason}>{postability.reason}</span>}`),
  and it has a per-cell "Grade" re-grade button at `:572-575` plus a
  Post/Retry/Re-post button whose label is decided at `:323-324`. The
  `checkRowPostability` call feeding that reason is at `:288-298`.
- **`GradingResults.tsx` has neither.** Its only per-row action is
  Post to Canvas (`:599-607`), gated on a `userId` an ungraded row cannot have.
- `gradeOneSubmissionAction` is defined at `src/app/actions/grading.ts:597` and
  called from exactly one place, `steps.grading-singles.ts:238`
  (`grep -rn "gradeOneSubmissionAction" src/`) - A13's row is accurate on this
  point. But its signature is `(code, courseId, assignmentId, userId, provider)`
  (`grading.ts:597-603`) and it calls `fetchSubmissionDetail`: it is
  **Canvas-only**, and `GradingResults` holds none of those four values (its
  props are `run`, `canvasUrl`, `copiedKey`, `onCopy`, `onOpenPreview`,
  `filesRetained?`, `onPosted?`, `banner?`, `sectionRef?` -
  `GradingResults.tsx:92-128`). It cannot re-run a GitHub repo at all.

### 1.5 The reuse target for run-level disclosure

`GithubGradingPanel.tsx` already renders three run-level notices built by pure,
tested helpers in a plain `.ts` leaf: `describeGithubGradingTruncation`
(`src/lib/github-grading-run-store.ts:432-449`, which takes
`Array<Pick<GradeResult, "student" | "submissionTruncated">>`),
`describeGithubGradingNoSubmission` (`:468-474`) and
`describeGithubGradingUndetermined` (`:495-501`), rendered at
`GithubGradingPanel.tsx:786`, `:814` and `:834` as
`<p role="status" className={styles.fieldHint}>`. That is the house pattern and
this chunk copies its SHAPE (pure leaf + `role="status"` + existing
`styles.fieldHint`) rather than inventing one. It does not extend that
particular leaf, because that leaf is GitHub-specific and the surface serves
three callers.

---

## 2. One chunk or two

**ONE CHUNK - DISCLOSURE - covering both rows, on one surface. RE-RUN is cut
off at a seam that is proven below and handed over as RES-2, not withdrawn.**

### Why disclosure is one chunk and not two

A12 and A13 are the same defect: `GradingResults.tsx` renders a row the tool
did not grade exactly like one it did. They differ only in which producer set
the state (`engine.ts`'s tails versus `postable.ts`'s predicate), and both
producers already ship. Scoping them apart would put two classifications of
the same row in two chunks touching the same 916-line file, which is the
collision this repo merges rows to avoid. One chunk, one leaf, one surface.

### The seam: why cutting re-run off does not halve a correctness property

State the two properties precisely:

- **P1 (disclosure).** For every row in the table, the surface states whether
  the tool produced a grade for it, and when it did not, which of the three
  reasons applies and what the instructor can do about it.
- **P2 (single-row re-dispatch).** The instructor can re-run exactly the rows
  in P1's "no" set without re-running the rest.

P1 is decidable entirely from data already on the row - `result.ungraded`
(`types.ts:268`) and `checkRowPostability(...)` (`postable.ts:104`) - plus the
`edits` map `GradingResults.tsx` already holds. It needs no new action, no new
identity, no change to any producer, and no prop from any parent. It is
complete and reachable the moment it renders.

P2 is not a half of P1; it is a different capability, and it is not buildable
today without work P1 does not need:

1. **No re-run key exists on the GitHub path.** Section 1.1: the row carries
   only `student`, which is `label || digest.fullName`. Mapping it back to a
   `QueueRow` (`GithubGradingPanel.tsx:51`) requires assuming
   `parseRepoRef(q.repoRef)` re-renders as `digest.fullName` - an assumption I
   did not prove and will not hand to an implementer as fact.
2. **The Canvas path's only single-row action is the wrong shape.** Section
   1.4: `gradeOneSubmissionAction` needs `code`/`courseId`/`assignmentId`,
   none of which reach `GradingResults`.
3. **Three parents, three different mechanisms.** A re-run prop would have to
   be implemented separately in `GithubGradingPanel.tsx`, `GradingTab.tsx` and
   `LiveFeedPanel.tsx`, which is three write sets this chunk does not own.

The one property that could plausibly span the seam - "a re-run must clear the
stale disclosure" - does not exist until P2 exists, so deferring P2 cannot cut
it. **The seam holds.**

### The specific hazard the seam creates, and how the chunk closes it

Shipping disclosure without per-row re-run risks telling the instructor to do
something the surface does not support. Section 0 shows the engine's own
message already does exactly that on `GithubGradingPanel`, and this chunk
cannot edit the engine. So the chunk's own copy must be surface-truthful and
must not repeat the engine's instruction. AC-3 below is that constraint, and
the engine's false sentence is RES-1.

This is the inverse of the recurrence the brief cited. "The surface is a layer"
failed when a library and an endpoint shipped with nothing between them. Here
the surface IS the deliverable and the machinery is already on disk; the thing
deferred is a further action, not the surface.

---

## 3. The guarantee, and the non-guarantee

### Guaranteed - held by the code regardless of what any model returns

- **G1. Classification is total and type-closed.** `UngradedOutcome` is a
  two-member discriminated union (`types.ts:172`) over `"not-attempted"` and
  `"grading-failed"`, and `NotAttemptedOutcome.stoppedBy` is a two-member
  string union (`types.ts:142`). A third reason must add a member there
  (`types.ts:137-138` says so), which makes an exhaustive `switch` in the new
  leaf a compile error the day a fourth state appears. The classifier
  therefore covers its states **by construction**, not by a hand-written list
  of four.
- **G2. The state is computed, never parsed out of prose.** `isUngraded`
  (`types.ts:176`) tests field presence and `checkRowPostability` compares
  strings the app itself produced. No branch in the new leaf reads model text.
  The model can return anything; which label renders does not change.
- **G3. The reason string reaching the screen is the one the refusing code
  authored.** Fixing `GradingResults.tsx:626` to render `status.message` means
  the displayed text is `postable.ts:122-124`'s own literal or Canvas's own
  skip reason, never a UI restatement that can drift from the refusal.
- **G4. Nothing new becomes postable.** The chunk adds no call to
  `postCanvasGradesAction` and changes neither `canPostRow` (`:579`) nor
  `gradableResults` (`:261-264`). `src/lib/grade/grade-result-doors.wiring.test.ts`
  (7 tests, `npx vitest run src/lib/grade/grade-result-doors.wiring.test.ts`
  -> `Test Files 1 passed (1) / Tests 7 passed (7)`) continues to hold over
  every door.

### NOT guaranteed - state these, do not let a green suite imply otherwise

- **N1. That any of it renders.** No component is rendered by any test here.
  Every section-5 assertion is either a pure-function test on the leaf or a
  source-text read of `GradingResults.tsx`. A source-text pin proves the
  characters are in the file; it does **not** prove a badge appears, is
  legible, is announced, or survives a real run. Owner observation only -
  RES-4.
- **N2. That the reason is USEFUL.** `GRADING_FAILURE_PREFIX` plus a thrown
  message (`engine.ts:264`) is a developer string. The chunk guarantees the
  instructor sees it instead of a misleading substitute; it does not guarantee
  the instructor can act on it.
- **N3. That the instructor can recover a dropped repo in one click.** That is
  P2, deferred - RES-2.
- **N4. That the engine's "Re-run to grade the rest" sentence is true.** It is
  not, on `GithubGradingPanel` - section 0, RES-1. This chunk cannot fix it.
- **N5. Contrast, focus order and announcement of the new badge.** No test in
  this repo computes contrast or renders a live region. If the badge uses
  `var(--danger)` or `var(--warning-ink)`, both are redefined in the
  `html[data-theme="dark"]` block and the ratio must be read from both
  definitions by a Wave-3 seat - RES-5.

---

## 4. `owns` - exact paths

### Production (2 files)

| Path | Now | Role |
|---|---|---|
| `src/app/components/grading-results/ungradedDisclosure.ts` | does not exist | NEW pure leaf: `classifyRow(result, edit) -> RowDisclosure` and `describeUngradedRun(results) -> string \| null`. No React, no I/O, importable by a `.test.ts`. Must contain the token `ungraded` (it will, structurally). |
| `src/app/components/GradingResults.tsx` | **916** lines (`@(Get-Content src/app/components/GradingResults.tsx).Count`) | The caller. Renders the per-row label, renders the run-level notice, and fixes `:626` to render `status.message`. |

`GradingResults.tsx` is the file that CALLS every export the new leaf adds, so
the wave contains its own caller. No parent component is edited: disclosure
needs no new prop.

### Test (1 new file)

| Path | Role |
|---|---|
| `src/app/components/grading-results/ungradedDisclosure.test.ts` | NEW. The chunk's whole oracle and its whole `verify`. Holds the pure-function tests over the leaf AND the two source-text wiring assertions over `GradingResults.tsx`. One file, so `verify` is single-path (L14). |

### Callers, fixtures and oracles that could break - classified

Derived with `grep -rln "GradingResults" src/ --include=*.test.ts` (15 files)
and `grep -rln "readdirSync\|walkTsxFiles\|walkFiles\|walkDir" src/ --include=*.test.ts`
(**33 files**). **Both lists are FLOORS.** The implementer must re-derive them
with its own instrument and report what these missed.

| File | Class | Why |
|---|---|---|
| `src/app/components/GithubGradingPanel.tsx`, `GradingTab.tsx`, `LiveFeedPanel.tsx` | checked-safe | The three importers. No prop change, so none is edited. If a wave DOES need a prop, all three enter `owns` and this table is wrong - say so rather than editing one. |
| `src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts` | **adopted - highest break risk** | `tableRowsAreDrivenBySortedResults` (`:66-73`) requires the literal `sortedResults.map(` in the source. Rewriting the tbody as `sortedResults.filter(...).map(` turns it RED. Also pins the three icons, `ResultsTableHeaderRow` props and `FeedbackExpandModal` wiring. |
| `src/app/components/rubricBreakdownPercent.wiring.test.ts` | adopted | Requires `formatScorePercent` to stay referenced in `GradingResults.tsx` (`:92-93`). Removing the per-area percent while restructuring turns it RED. |
| `src/app/components/grading-results/gradingResultsPostOutcome.test.ts` | adopted | 103 lines, 7 tests (`npx vitest run ...` -> `Test Files 1 passed (1) / Tests 7 passed (7)`). Pins `fanOutGradingPostResult`'s `{status:"skipped", message}` shape - the same message `:626` must start rendering. |
| `src/app/components/grading-results/gradingResultsHelpers.test.ts`, `sortGradeRows.test.ts` | checked-safe | `defaultRowEdit`/`parseEarnedPoints`/sorting are read, not changed. |
| `src/lib/grade/grade-result-doors.wiring.test.ts` | checked-safe, walker | Requires every caller of `postCanvasGradesAction` to reference `ungraded`. `GradingResults.tsx` passes today only via the COMMENT at `:256-260` - do not delete that comment unless real code replaces it. Whole-tree walker: L15 applies. |
| `src/file-size-ceiling.structure.test.ts` | **budget gate**, walker | `LIMIT = 1000` at `:30`; `GradingResults.tsx` is NOT in `ALLOWED_OVERAGE` (`sed -n '64,80p'` lists four files, none of them this one). **Headroom is 84 lines.** Never add an entry to that list to fit this chunk. |
| `src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts` | checked-safe, walkers | Always. `no-emojis` also scans `docs/`, so this file is under it. |
| `src/app/components/courses/page-module-css-classes.test.ts` and `page-module-css-orphan-classes.test.ts` | **conditional - both or neither** | Only bite if a NEW class is added to `src/app/page.module.css`. The orphan test pins today's orphan count and fails when it RISES; the sibling fails on a `styles.x` with no rule. **The design avoids both by reusing `styles.fieldHint` and an existing colour token.** If a new class is genuinely needed, both files enter `owns`. |
| `src/app/components/ui/buttonVariant.test.ts`, `confirmArmButtons.test.ts`, `modalAdoption.wiring.test.ts`, `modalAdoptionWiring.attributes.test.ts` | checked-safe, walkers | Only bite if the chunk adds a `<Button variant="contained">` or a modal. It adds neither. |
| `src/lib/grade/postable.test.ts` | checked-safe | 14 tests (`npx vitest run src/lib/grade/postable.test.ts` -> `Test Files 1 passed (1) / Tests 14 passed (14)`). `postable.ts` is not edited. |
| `src/lib/grade/engine.ungraded.test.ts` | **must not be touched** | Owned by the forbidden `engine.ts`. |

### Explicitly NOT owned

`src/lib/grade/engine.ts`, `types.ts`, `postable.ts`; everything under
`src/app/components/repo-grades/` (section 1.1 - it cannot produce these rows,
and section 1.4 - it already renders the reason and a re-grade control);
`src/app/actions/github.ts`; `src/app/actions/grading.ts`;
`src/lib/github-grading-run-store.ts`.

---

## 5. `verify` - one command

```
npx vitest run src/app/components/grading-results/ungradedDisclosure.test.ts
```

Single-path, so a renamed or missing sole path exits 1 with
"No test files found" - the runner-decidable case backlog L14 records, and the
only case `closure-runner.ts:31` can adjudicate, since it reads the `Tests`
line and never the `Test Files` line. **No multi-path list is used anywhere in
this chunk**, because L14 measured that a path matching nothing is silently
dropped and the run still exits 0.

**Pass condition, naming all three things `traps-spec.md` requires:**

- **Object under comparison:** the set of disclosure outcomes this chunk
  claims, enumerated below as AC-1..AC-5, each evaluated against
  `src/app/components/grading-results/ungradedDisclosure.ts` and
  `src/app/components/GradingResults.tsx` as they sit on disk.
- **Instrument, per quantity:** (a) for AC-1/AC-2/AC-3, direct calls to the
  leaf's exported functions from the test file - real execution, no source
  reading; (b) for AC-4/AC-5, `readFileSync` over
  `src/app/components/GradingResults.tsx` with a CR-tolerant unanchored
  comment strip and a canary block proving each matcher distinguishes a
  known-good from a known-bad fixture BEFORE the real file is read; (c) for
  the size budget, `@(Get-Content src/app/components/GradingResults.tsx).Count`
  at the wave gate, compared against `LIMIT = 1000`.
- **Direction of failure:** RED if ANY row of the AC table below is
  unsatisfied. The condition ranges over the whole table - a partial fix that
  satisfies four of five is a FAIL, not a pass with a note. (This is the A8
  defect `traps-spec.md` records: a pass condition narrower than the table it
  sits under goes green on a partial fix.)

**Acceptance criteria the condition ranges over:**

| id | Criterion |
|---|---|
| AC-1 | `classifyRow` returns a distinct outcome for each of: a graded postable row; a graded row refused by `checkRowPostability`; `ungraded.kind === "grading-failed"`; `stoppedBy === "submission-count-bound"`; `stoppedBy === "run-deadline"`. Five inputs, five distinct outcomes. |
| AC-2 | A rescued ungraded row (an ungraded row whose `edit.total` carries a real score) classifies as its own outcome and its copy states that it cannot be posted from this table - the dead end named in section 1.2. |
| AC-3 | No string returned by the leaf contains the substring `Re-run to grade the rest`, and no returned string instructs the instructor to press a control that does not exist on this surface. Section 0 / RES-1. |
| AC-4 | `GradingResults.tsx`'s `"skipped"` status branch renders `status.message`. The literal `"Not posted - no grade or comment to send"` no longer appears in the file as the skipped branch's whole output. |
| AC-5 | `GradingResults.tsx` imports from `./grading-results/ungradedDisclosure` and calls both exported functions - the reachability hop, so the leaf cannot ship dead. |

**Fixtures come from the emitted shape.** Every `GradeResult` fixture in the
test file is built by the same field set `buildUngradedRow` emits
(`engine.ts:151-171`), transcribed field by field with a comment naming that
line range - not invented. A fixture using a shape no producer emits proves
nothing (`traps-tests.md`).

**On the source-text half.** `stripComments` in the new test file must be the
CR-tolerant UNANCHORED form required by backlog L13: split on a CR-tolerant
line-feed pattern (`/\r?\n/`), strip an unanchored line-comment pattern per
line, rejoin. The anchored multiline form (caret, optional whitespace, comment
pattern, `m` flag) is CR-safe but **trailing-comment-blind**, and L13 records
an EXECUTED defeat against it - live code replaced by a void statement plus the
same code as a trailing comment left every assertion green. Note the known
cost of the unanchored form, stated rather than hidden: it also eats a `//`
inside a string literal such as a URL. The test file must carry a CR canary
built with `String.fromCharCode(13)` so no tool can materialise the escape.

**On the walker timeout (L15).** The new test file reads exactly TWO named
files by path. It performs no `readdirSync` and no tree walk, so it is not
exposed to the 5000ms default that made `src/source-bytes.structure.test.ts`
flake red at 9588ms under load. The walkers this chunk must keep green
(`file-size-ceiling`, `no-emojis`, `source-bytes`, `grade-result-doors`) are
pre-existing and are the wave gate's problem, not `verify`'s: if one of them
reports "Test timed out in 5000ms", re-run that file alone before treating it
as a regression.

---

## 6. Sabotages - each naming the file that goes red

Procedure for every entry, both directions, in this order: **(1) run the named
file on the correct code and record GREEN with its counts; (2) apply the
mutation; (3) re-run and record RED with the failing test name; (4) restore
and re-run to GREEN.** A sabotage that is red in both directions discriminates
nothing and must be replaced.

**Restore by copy, not by `git checkout --`.** These files are uncommitted
mid-chunk; `git checkout -- <path>` reverts to the index and destroys the
chunk's work. Copy the file aside first and copy it back.

| # | Mutation | File that goes RED | Guards |
|---|---|---|---|
| S1 | In `ungradedDisclosure.ts`, make the `"run-deadline"` branch return the same outcome as `"submission-count-bound"`. | `ungradedDisclosure.test.ts` | AC-1: the two `stoppedBy` values are distinguished, not collapsed. |
| S2 | In `ungradedDisclosure.ts`, return the graded-postable outcome for a row where `isUngraded(result)` is true. | `ungradedDisclosure.test.ts` | AC-1: an ungraded row is never classified as an ordinary graded row - the whole defect. |
| S3 | In `ungradedDisclosure.ts`, drop the rescued-ungraded branch so a scored ungraded row falls through to postable. | `ungradedDisclosure.test.ts` | AC-2: the invisible dead end stays named. |
| S4 | In `ungradedDisclosure.ts`, add `"Re-run to grade the rest."` to the count-bound copy. | `ungradedDisclosure.test.ts` | AC-3: the surface never repeats the engine's false instruction. |
| S5 | In `GradingResults.tsx`, revert `:626` to the hardcoded `"Not posted - no grade or comment to send"`. | `ungradedDisclosure.test.ts` | AC-4: the refusal reason reaches the screen. **This is the one sabotage that reproduces today's live defect exactly**, so it doubles as proof the test would have caught the shipped bug. |
| S6 | In `GradingResults.tsx`, delete the call to the leaf's run-level function while leaving the import. | `ungradedDisclosure.test.ts` | AC-5 reachability: an import without a call ships the leaf dead with tsc, lint and every other test green. |
| S7 | In `GradingResults.tsx`, add 90 lines (any filler) to push it from 916 to 1006. | `src/file-size-ceiling.structure.test.ts` | The budget is enforced, not assumed. Proves the 84-line headroom is a real wall. |
| S8 | In `GradingResults.tsx`, delete the comment at `:256-260` **and** any real `ungraded` reference the chunk added. | `src/lib/grade/grade-result-doors.wiring.test.ts` | Proves the door walker still binds this file after the edit, and proves it is currently satisfied by a comment - which is why N1 is a non-guarantee. |
| S9 | In `ungradedDisclosure.test.ts`, replace a live assertion's subject with a trailing-comment copy of itself (the L13 mode-2 shape). | `ungradedDisclosure.test.ts` | Proves the chosen `stripComments` is not trailing-comment-blind. If this stays GREEN, the helper is the anchored form and must be replaced. |

S9 is deliberately a sabotage of the TEST's own instrument, not of the
implementation - it is the only way to prove the comment-stripping half is
live, and `traps-tests.md`'s "sabotage the implementation, not the test" rule
is about assertions, not about instruments. Every other entry mutates
production code.

---

## 7. Residual register

Each entry names an owner, an instrument and the step that will measure it. An
entry missing any of the three is a deletion, and I have called none of these
one.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-1 | `engine.ts:320`'s `"Re-run to grade the rest."` is FALSE on `GithubGradingPanel` (section 0): the queue is unpruned and `slice(0, maxSubmissions)` re-takes the same prefix. Also `engine.ts:307` for the deadline case. | The next chunk that legitimately owns `src/lib/grade/engine.ts` - sequencing constraint: it must not run concurrently with the A11 work holding that area. | A pure-function assertion in that chunk's own test over the emitted message string, plus a re-read of `GithubGradingPanel.tsx:360-378` to confirm the queue is still unpruned. | That chunk's `verify`. Filed to `docs/backlog.yml` as a new row at this chunk's push. |
| RES-2 | P2, single-row re-dispatch (A13-2's re-run half and A12's "re-runnable" claim). Blocked on: no repo re-run key on the GitHub path (section 1.1), `gradeOneSubmissionAction`'s Canvas-only signature (section 1.4), and three parents with three mechanisms. | A follow-on scoping seat, after this chunk's push. | An architect pass that opens `GithubGradingPanel.tsx:51,299,328-332,372-378` and decides whether `student` can be mapped to a `QueueRow`, plus a decision on whether `gradeOneSubmissionAction` gains a repo variant. | A new backlog row created at this chunk's push, carrying section 1.1's and 1.4's measurements so the next seat starts ahead. |
| RES-3 | Whether `parseRepoRef(q.repoRef)` re-renders exactly as `digest.fullName`, which is what any `student` -> `QueueRow` mapping rests on. **I did not prove this and it must not be assumed.** | RES-2's receiver. | Open `parseRepoRef` and `ingestRepo`'s `fullName` assignment and compare, or add a pure test over both. | RES-2's architect pass. |
| RES-4 | Nothing in this chunk proves the new label or notice RENDERS, is legible, or is announced. No component is rendered by any test here (`docs/loop/this-repo.md` section 6). | The repo owner. | A browser, a real grading run with the bound set below the queue size via `GRADE_MAX_SUBMISSIONS`. | An owner observation after deploy, recorded in `docs/REGRESSION.md` with the rest of this chunk's entry. |
| RES-5 | Contrast of whichever colour token the new label uses, in BOTH themes. `--danger` is `#dc2626` at `src/app/globals.css:60` and `#f87171` inside the `html[data-theme="dark"]` block at `:301`, and that exact token has already silently taken two rules from 4.83:1 to 2.77:1 while passing every gate. | The Wave-3 visual/accessibility seat for this chunk. | Open both theme definitions of the chosen token and state the ratio in each. No test in this repo computes contrast. | The Wave-3 seat, before the follow-up review. |
| RES-6 | Whether the review CSV (`buildCsvContent`, called at `GradingResults.tsx:494`) should carry an ungraded column. It is not a gradebook door - `grade-result-doors.wiring.test.ts:34-39` seeds only `postCanvasGradesAction`, `buildCanvasGradebookCsv`, `buildMoodleGradebookCsv`, `fillGradebookCsv` - so today an ungraded row exports with a blank score and the reason inside the comment. Deliberately out of scope; not silently absorbed. | The repo owner (a product call: is the export a review artefact or a gradebook artefact). | Reading `buildCsvContent`'s column list against one exported file. | Escalated at this chunk's push, batched, not gating. |
| RES-7 | `grade-result-doors.wiring.test.ts` is satisfied by a COMMENT (`referencesUngradedFlag` at `:67-69` does no comment stripping, and `GradingResults.tsx` passes today purely on `:256-260`). The guard therefore proves awareness of the identifier, not handling of the state. | A later hardening chunk, or the same seat that next touches that oracle. | Strip comments before the awareness check, then re-run - if callers drop out, they were passing on a comment. | Filed as a backlog row at this chunk's push. Not fixed here: tightening a shared whole-tree oracle mid-chunk risks reddening files this chunk does not own. |

---

## 8. What contradicts the rows' own text

Both rows have been corrected before. Five corrections, each measured.

1. **A13's note is wrong that no re-run control and no reason rendering exist
   "anywhere".** `src/app/components/repo-grades/RepoGradeCellControl.tsx:617`
   renders `checkRowPostability`'s refusal reason, and `:572-575` is a per-cell
   re-grade button. Both halves of A13-2 already ship on the repo-grades grid.
   The by-name sweep in A12's `instrument` field
   (`not-attempted`/`isUngraded`/`.ungraded`) could not see it, because that
   component reaches the same fact through `postability.reason` and mentions
   none of those identifiers. That is exactly `traps-search.md`'s recorded
   identifier-family false absence, repeated. **The gap is one surface,
   `GradingResults.tsx`, not "the review table and the repo-grades
   equivalents".**

2. **A12's defect cannot occur on the repo-grades grid at all**, so
   "the repo-grades equivalents" is not merely already-done there, it is
   inapplicable. Both repo-grades grading paths call `gradeRepoAction` with one
   entry per call (`useRepoGradesBulkGrade.ts:193`,
   `useRepoGradesGradingActions.ts:283`); one entry never reaches a bound of
   40 and never sees a deadline (`gradeReposAction` passes no `options` -
   `github.ts:753`).

3. **A13 says "GradeResult carries no id field... so whether a failed/ungraded
   row can be re-dispatched... is still to be established". Half of that is now
   established, in the direction that makes it harder, not easier.** The
   ungraded row does carry identity - `sourceIndex`, `student`,
   `canvasUserId?` (`types.ts:143-159`) - but `types.ts:143-149` states
   outright that `sourceIndex` is not a re-run key for any caller's array, and
   on the GitHub path `student` is a display label with no repo reference
   attached (section 1.1). The identity that exists is the wrong identity.

4. **Neither row names the strongest live defect.** `GradingResults.tsx:626`
   renders a hardcoded string for the `"skipped"` status and discards
   `status.message`, which is where both the A13 refusal reason (`:392`,
   `:300`, `:325`, `:339`, `:355`) and Canvas's own skip reason
   (`fanOutGradingPostResult`) are stored. The A13-1 fix computes a reason
   whose entire purpose is to be surfaced (`postable.ts:100-103`) and the one
   UI caller drops it, substituting a message that blames the instructor. It is
   a two-line fix inside this chunk's `owns` and it is sabotage S5.

5. **A12's title still says "the same visible-state gap A13-2 owes", which is
   right, but its framing of the fix as UI-only is incomplete.** The
   count-bound message the instructor will read is authored in `engine.ts` and
   is false on the surface A12 is about. The disclosure is UI-only; the
   disclosure being TRUE is not. RES-1.

**One thing both rows get right and I confirmed rather than assumed:**
`gradeOneSubmissionAction` is at `src/app/actions/grading.ts:597` and its only
caller is `src/lib/workflows/registry/steps.grading-singles.ts:238`
(`grep -rn "gradeOneSubmissionAction" src/`), and
`src/lib/grade/types.ts` has no `id` field on `GradeResult`.
