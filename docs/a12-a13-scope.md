# A12 + A13 scope: the visible state for a row the grader did not grade

**Round 3.** Authored by the SCOPING seat, 2026-09-20, against `ce2123f`
(`git rev-parse --short HEAD`). Round 1 was checked NOT CLEAN (3 blockers, 5
majors, all NEW classes) and produced round 2 - a normal revision round under
`docs/loop/iteration-caps.md`. Round 2 was checked NOT CLEAN (3 blockers), one
of which needed an orchestrator ruling before the artifact could be revised
coherently. **RULING R has landed** (quoted in full where it is applied,
section 0.1) and the other two round-2 blockers were DESIGN BLOCKERS this
round reconstructs: AC-6's scope narrows to `kind === "not-attempted"`
(section 5, section 6), and AC-3b - found NOT CONSTRUCTIBLE AS WRITTEN - is
replaced by a construction that is (section 5.1, section 6). Per
`iteration-caps.md` cap 2 ("per artifact: two revisions, then a disposal
round"), round 1 -> round 2 was this artifact's first revision and round 2 ->
round 3 (this document) is its **second and final revision**. If round 3 is
not checked clean, the next round is a disposal round: no new requirements,
only dispositions.

Section 0 (round 1 -> round 2, unchanged, not re-litigated) and section 0.1
(round 2 -> round 3, new) are both disposition tables the caps card's entry
gate 3 requires, and the checker audits both before reading anything else.
Section 0 is carried verbatim from round 2; only section 0.1 is new.

**Every quantity below names the command that produced it.** Line counts use
`@(Get-Content <path>).Count` from PowerShell, never `Measure-Object -Line`
(`docs/loop/this-repo.md` section 3: the two instruments disagree by 42 on one
file in this repo). From the Bash tool, `wc -l` agrees with `Get-Content
.Count` (both instruments, same file, this round: 963 for
`gradingResultsHelpers.test.ts`).

**Every claim about what an instructor SEES is a reading claim.** vitest here
is node-env and collects only `src/**/*.test.ts`; no component in this repo is
rendered by any test. Nothing in section 7 or 8 proves a control appears on
screen. Only the owner, in a browser, can confirm that - RES-4.

**I did not run `npx tsc --noEmit`.** Other agents are active and
`tsconfig.tsbuildinfo` has exactly one legal caller, the wave gate
(`docs/loop/this-repo.md` section 2). Every criterion below whose instrument is
tsc says so and names the wave gate as its step. **I did run** `npx vitest run
src/app/components/grading-results/gradingResultsHelpers.test.ts` against the
UNMODIFIED file, to establish this round's baseline before proposing edits to
it: `Test Files  1 passed (1)`, `Tests  90 passed (90)`. That baseline is what
the wave gate must still show, plus this round's new tests, once the edits in
section 5.1 land. I also verified the two new regexes this round proposes
(section 5.1) by direct execution - `node -e` scripts against representative
and adversarial fixtures, not by inspection - and pasted the output where each
regex is introduced.

**Paths I did not open and did not edit:** everything under
`src/app/components/snapshot-grading/` and
`src/app/components/assessment-shared/` - an A11 remediation is live there.
`git status --short` at this round's authoring time shows exactly one modified
path, `docs/a16-scope.md`, which does not appear in this document's `owns` -
re-measured this round; round 2's authoring-time snapshot (fifteen modified
paths) is stale and superseded, not re-quoted.

---

## 0. Disposition table - every round-1 requirement

Round 1 carried 5 acceptance criteria, 4 guarantees, 5 non-guarantees, 9
sabotages and 7 residuals. All 30 are below. **Nothing is dropped silently; a
withdrawal names its reason and any enforcer it was protecting.**

| Round-1 item | Disposition | Where it went |
|---|---|---|
| AC-1 (five inputs, five outcomes) | **REVISED** -> AC-1 | M3: "by construction" was false - it was a hand-written list of five. Split into AC-1 (runtime enumeration, five cases, instrument = the leaf's own tests) and AC-7 (compile-time `never` arm, instrument = `npx tsc --noEmit` at the wave gate). M4: the `"run-deadline"` outcome is relabelled TYPE-CLOSURE-ONLY, not observable on this surface. |
| AC-2 (rescued ungraded row) | **KEPT** -> AC-2 | Unchanged in substance. Its copy now comes from the frozen set AC-3 introduces. |
| AC-3, clause 1 (no `Re-run to grade the rest` substring) | **KEPT** -> AC-3a | Computable today; it stays as an executable assertion over the frozen copy set. |
| AC-3, clause 2 ("no returned string instructs the instructor to press a control that does not exist on this surface") | **WITHDRAWN as a criterion, REPLACED by a construction** -> AC-3b | B2. No instrument in this repo can compute a property of arbitrary prose (`seats.md`, Acceptance-criteria checker question 2). It protected nothing today - no enforcer existed for it, which is precisely the defect. Replaced by freezing the leaf's entire emitted copy set as literals in the test file and asserting set equality, so any new sentence is a diff a human reads. The prose obligation survives as a REVIEW obligation on that frozen set, named in section 6, not as a green-able assertion. |
| AC-4 (skipped branch renders `status.message`) | **REVISED** -> AC-4 | B1. Round 1 permitted `{status.message}` with `message` optional (`GradingResults.tsx:77`), which renders an EMPTY warning-coloured div - strictly worse than today's wrong-but-present text. Now requires a DEFINED fallback, and moves the whole expression into the leaf as `describeSkippedStatus(message?: string): string` so it is executable rather than source-text-only. |
| AC-5 (import + calls both exports) | **REVISED** -> AC-5 | M2. "Calls" is not "renders". Now requires the classifier's outcome to reach a rendered attribute inside the tbody map's JSX region, pinned by a frozen literal attribute name. |
| G1 ("classification is total and type-closed... by construction") | **REVISED** | M3. "By construction" withdrawn as a description of the runtime branch set. Restated as two separate claims with two separate instruments - see G1 and G1b in section 7. |
| G2 (state computed, never parsed out of prose) | **KEPT** | Unchanged. |
| G3 (the reason string reaching the screen is the refusing code's own) | **REVISED** | B1. Now includes the fallback, and its instrument changes from a source-text pin to a direct call on `describeSkippedStatus`. |
| G4 (nothing new becomes postable) | **KEPT** | Unchanged. |
| N1 (nothing proves it renders) | **KEPT** | Unchanged; strengthened by AC-5's attribute, which gives the owner something nameable to look for. |
| N2 (the reason may not be useful) | **KEPT** | Unchanged. |
| N3 (no one-click recovery) | **KEPT** | RES-2. |
| N4 ("the engine's Re-run sentence is not true") | **REVISED and PARTLY DISCHARGED** | Minor: softened from "FALSE" to "false for the action the sentence names", because the queue is user-editable and persisted, so an instructor who edits the queue and presses Grade again does get different work done - what is false is that pressing Grade again, unchanged, grades the rest. And it is no longer purely a residual: B3 moved the SURFACE-LEVEL correction inside `owns` (AC-6). Only the engine's own emitted string stays as RES-1. |
| N5 (contrast/focus/announcement) | **KEPT** | RES-5. |
| S1 (collapse the two `stoppedBy` branches) | **KEPT** -> S1 | |
| S2 (classify an ungraded row as graded-postable) | **KEPT** -> S2 | |
| S3 (drop the rescued branch) | **KEPT** -> S3 | |
| S4 (add the engine's instruction to the count-bound copy) | **KEPT** -> S4 | Now reds via the frozen-set equality of AC-3b as well as AC-3a's substring test - two independent kills. |
| S5 (revert `:626` to the hardcoded literal) | **KEPT, and JOINED by S5b** | B1: S5 alone did not discriminate, because it also reds against the blank-message version. S5b empties the message and proves the fallback, so the pair separates "wrong text", "right text" and "no text". |
| S6 (import without call) | **REVISED** -> S6 | M2: the mutation is now "render the classifier's outcome outside the tbody region", which is the shape AC-5 actually forbids. |
| S7 (push the file to 1006 lines) | **KEPT** -> S7 | |
| S8 (delete the `ungraded` comment and the added reference) | **KEPT** -> S8 | |
| S9 (trailing-comment defeat of `stripComments`) | **KEPT** -> S9 | Its surface shrinks - AC-4's source-text half became a pure-function call - but AC-5 still reads source, so the instrument is still live and still needs its control. |
| RES-1 (the engine's message) | **REVISED - owner changed** | Minor: round 1's owner was "the next chunk that owns `engine.ts`", a chunk that does not exist, which makes it a deletion by the caps card's own rule. The owner is now the backlog row filed at this chunk's push, which does exist the moment it is written. Scope also narrows: the on-screen correction is AC-6 here, so RES-1 is only the engine's emitted literal. |
| RES-2 (single-row re-dispatch, P2) | **KEPT** | |
| RES-3 (`parseRepoRef` vs `digest.fullName`) | **KEPT** | |
| RES-4 (nothing proves it renders) | **KEPT** | |
| RES-5 (contrast in both themes) | **KEPT** | |
| RES-6 (CSV ungraded column) | **KEPT** | |
| RES-7 (`grade-result-doors` satisfied by a comment) | **KEPT** | |
| Section 4 owns list | **REVISED** | Minor: `src/lib/client-state-sweep.registry.test.ts` was omitted and is added as a conditional. The `ungraded` grep count 14 is corrected to **16**. |
| Section 1.1's `slice` citation `engine.ts:191` | **CORRECTED to `engine.ts:192`** | Re-measured: `grep -n "studentSubmissions.slice" src/lib/grade/engine.ts`. |
| Section 5's single-path argument | **KEPT and UPGRADED from a choice to a policy** | L14 was RULED 2026-09-20: single-path verify is repo policy. Section 6 now states the ruled cost rather than arguing the option. |
| Section 2's AC-3 mitigation of the on-screen engine sentence | **WITHDRAWN** | B3. It could not reach the strengths box and was therefore a mitigation in name only. Replaced by AC-6, a real correction inside `owns`. |
| A12's premise "nothing in the review table shows that row's reason" | **NEWLY CORRECTED** | M5. Round 1 did not list this among its corrections. It is correction 6 in section 2. |

Nothing above is marked "handed over" except RES-1's narrowed remainder and
RES-2/3, which name their receivers in section 9.

---

## 0.1 Disposition table - every round-2 requirement the round-2 check touched

Round 2's check was NOT CLEAN: 3 blockers. One is RULING R, quoted below in
full and then applied. The other two are the design blockers this round
reconstructs. Every other round-2 id is accounted for below, either KEPT
UNCHANGED or KEPT WITH AN ADDENDUM (a note added alongside it, not a rewrite
of its substance) - listed exhaustively so no id is silently skipped:

- **KEPT UNCHANGED, not re-opened, omitted from the table below:** AC-1, AC-2,
  AC-3a, AC-4, AC-5, AC-7, G1, G1b, G2, G3, G4, N1, N2, N3, N4, N5, S1, S2, S3,
  S4, S5, S5b, S5c, S6, S6b, S8, S9, RES-1..RES-7, section 4's seam argument.
- **KEPT WITH AN ADDENDUM - substance unchanged, a note added because Ruling R
  or the AC-6/AC-3b reconstruction touches something adjacent to it (each
  addendum is at the id's own location, not duplicated here):** AC-8 (a
  second, independent instrument now also covers it - R1-R4), G5 (restated
  with the new `kind` boundary explicit), N6 (no longer newly introduced,
  relabelled), S7 (unchanged in substance; S7b is its sibling on the second
  file, not a revision of S7 itself), S10, S11, S12 (unchanged - AC-6's
  byte-comparison condition they guard gained a `kind` guard, but the
  mutations and their kills are identical), S13 (a second instrument named
  alongside the existing one), S14 (unchanged).

Re-stating a fully unchanged row's substance here would be re-litigating it,
which the caps card forbids at this artifact's final revision - hence the
compact list above rather than one full row per id.

**RULING R, verbatim from the orchestrator, landed 2026-09-20: "REGISTER THE
LEAF AND NARROW THE PATTERN; DO NOT DUPLICATE."** Four parts, all inside
`gradingResultsHelpers.test.ts`'s `"grading-results client files stay
client-bundle-safe"` describe block (`:824-889`, read this round), which
therefore moves from the "adopted, must stay green, never edited" class into
this chunk's `owns`: (1) register the new leaf in `CLIENT_FILES`; (2) narrow
the `@/lib/grade/` ban to exempt `@/lib/grade/types` specifically, rather than
duplicating a parallel guard or a local copy of `composeOverallComment`-style
duplication to route around it; (3) add a guard that `types.ts` stays
import-free, so the exemption cannot quietly become false; (4) add a
completeness assertion to `CLIENT_FILES` so a future file cannot escape by
omission. Section 5.1 is the construction; the acceptance criteria are R1-R4
in section 6.

| Round-2 item | Disposition | Where it went |
|---|---|---|
| AC-3b (frozen copy set over `classifyRow` alone) | **WITHDRAWN as written, REPLACED by a reconstructed AC-3b** -> AC-3b (section 6) | Round-2 check: NOT CONSTRUCTIBLE AS WRITTEN, two independent reasons. (1) The bound (`maxSubmissions`) exists only inside `engine.ts`'s message template; `classifyRow(result, edit)` has no run and no count in its signature, so the leaf could state the count only by parsing it out of `result.ungraded.message` - forbidden by G2 ("computed, never parsed out of prose") and, measured this round, structurally impossible without a template: `grep -rn "maxSubmissions" src/lib/grade/types.ts` returns nothing, and `GradingRun` (`types.ts:308-318`, read this round) carries no such field, so no typed channel exists today without editing the fenced-off `engine.ts`. (2) AC-3b as written collected strings from `classifyRow` alone, never from `correctUngradedFeedbackSeed` - the function whose output actually lands in the instructor's textarea - so a fresh false instruction could ship inside `owns` with AC-3b fully green. **Disposal: (d) DELETE the count requirement** (section 5's "must state... the count" is withdrawn; no enforcer protected it, since AC-3b's own instrument never existed until this round) **and (a) RELOCATE the coverage gap to a new criterion, AC-3c**, which ties `correctUngradedFeedbackSeed`'s output to the SAME frozen record `classifyRow` reads, by construction, rather than by a second enumeration. |
| AC-6 (byte-comparison over `isUngraded(result)`) | **REVISED** -> AC-6 (section 6) | Round-2 check: `engine.ts:152`'s `buildUngradedRow` sets `strengths = outcome.message` for **both** members of `UngradedOutcome` (verified again this round: `engine.ts:264`'s `grading-failed` branch sets `message: `${GRADING_FAILURE_PREFIX}${message}``, a real per-submission diagnostic, not a false instruction), so AC-6 driven over `isUngraded` mandates overwriting a `grading-failed` row's only diagnostic with a frozen `not-attempted` literal - the opposite of what this chunk exists to fix. Narrowed to `result.ungraded?.kind === "not-attempted"`; the `grading-failed` behaviour (unconditionally unchanged) is now its own clause, protected by new sabotage S15. |
| Section 5, "What the corrected copy must say" ("must state the fact and the count") | **WITHDRAWN, count clause only** | Same finding as AC-3b above. The fact and the action both survive; the count does not, because nothing on `classifyRow`'s signature can supply it without either parsing prose (forbidden) or editing `engine.ts` (fenced off for this chunk). Stated as a deliberate, reasoned trade, not a silent drop. |
| `gradingResultsHelpers.test.ts`'s classification in the "Callers, fixtures and oracles" table (round 2: "adopted, upgraded from checked-safe") | **REVISED - moves into `owns`** | Ruling R part 0 (its own framing): the file the ruling edits is this one. Section 5.1 is new; the old table row is corrected in section 5. |
| Section 3.3's "No landed test catches this" | **CORRECTED - now stale, superseded** | True when round 2 was written (no test enforced the leaf's import path). False after Ruling R lands: `gradingResultsHelpers.test.ts`'s `it.each(CLIENT_FILES)` now runs over the leaf once registered (section 5.1), and AC-8's build-gate instrument keeps its own independent check (S13) - two instruments on the same hazard, not a replacement of one by the other. |

Nothing above is marked "handed over" to a party outside this chunk; Ruling
R's obligations and both design reconstructions are discharged inside `owns`
by this same round.

---

## 1. Confirmed sound by the round-1 check - carried, not re-derived

The check ruled these correct. I did not re-open them and I am not
re-litigating them; they are inputs to this round.

1. **`RepoGradeCellControl.tsx:617` already renders the refusal reason** and
   `:566-575` is a per-cell Grade button. Both halves of A13-2 already ship on
   the repo-grades grid.
2. **Both repo-grades grading paths pass ONE repo per call**
   (`useRepoGradesBulkGrade.ts:193`; `useRepoGradesGradingActions.ts:283` ->
   `gradeRepoAction` -> `gradeEntries([entry])` at `github.ts:839`), so A12's
   defect genuinely cannot occur there.
3. **Three importers of `GradingResults`**, confirmed.
4. **`GradingResults.tsx:626` discards `status.message`**; all five setters
   carry `check.reason`; `fanOutGradingPostResult` always sets a message for a
   skip; there is **no student-facing leak**, because this is the instructor's
   own review table and the error branch at `:627` already renders
   `status.message` today.
5. **Re-run is genuinely unbuildable here.** `repoDigestToEmbeddedEntry` sets
   only `student`/`content`/`mergedFileCount`/`submittedFiles` -
   `buildUngradedRow` DOES carry `gradedRepo`/`gradedRef`
   (`src/lib/grade/engine.ts:176-177`, read directly this round), so the row is
   empty of repo identity only because the ENTRY is. `sourceIndex` is
   disclaimed as a re-run key at `types.ts:143-149`, and
   `gradeOneSubmissionAction` needs four values `GradingResultsProps` does not
   have.
6. **ONE CHUNK IS RIGHT and the seam holds.** Section 4 keeps round 1's
   argument unchanged and does not re-argue it.

---

## 2. Six corrections to the two rows' own text

Corrections 1-5 are round 1's, kept. Correction 6 is new and is M5.

1. **A13's note is wrong that no re-run control and no reason rendering exist
   anywhere** - `RepoGradeCellControl.tsx:617` and `:566-575`. The by-name
   sweep in A12's `instrument` field could not see it because that component
   reaches the same fact through `postability.reason`. That is
   `traps-search.md`'s recorded identifier-family false absence, repeated.
2. **A12's defect cannot occur on the repo-grades grid at all** - one entry per
   call never reaches a bound of 40 and never sees a deadline.
3. **A13's "whether a failed/ungraded row can be re-dispatched is still to be
   established" is now established in the direction that makes it harder.** The
   row carries `sourceIndex`, `student`, `canvasUserId?`, and `types.ts:143-149`
   states outright that `sourceIndex` is not a re-run key. The identity that
   exists is the wrong identity.
4. **Neither row names the strongest live defect**: `GradingResults.tsx:626`
   renders a hardcoded string for `"skipped"` and discards `status.message`.
5. **A12's framing of the fix as UI-only is incomplete.** The disclosure is
   UI-only; the disclosure being TRUE is not.
6. **NEW - A12's central premise "nothing in the review table shows that row's
   reason" is PARTLY FALSE, and the honest reframe changes both the copy and
   the value claim.** The reason IS on screen today, under the wrong label, in
   an editable textarea. The chain, every hop opened this round:

   | Hop | `file:line` | What it does |
   |---|---|---|
   | Engine | `src/lib/grade/engine.ts:152` | `const strengths = outcome.message;` inside `buildUngradedRow` |
   | Seed (LIVE path) | `src/app/components/grading-results/gradingResultsHelpers.ts:290` | `seedEdits` sets `strengths: result.strengths` for every student in the run |
   | Seed (fallback path) | `gradingResultsHelpers.ts:318` | `defaultRowEdit` sets the same field the same way |
   | State | `GradingResults.tsx:164`, `:183` | `edits` is initialised and reset from `loadGradingResultsEdits(canvasUrl, run)` |
   | Render | `RowFeedbackBoxes.tsx:115`, `:141-144` | maps every `FEEDBACK_FIELDS` member (`gradingResultsHelpers.ts:216`) into a `<TextField multiline value={edit[field]}>` labelled from `FEEDBACK_FIELD_META` |
   | Label | `gradingResultsHelpers.ts:257` | `strengths.fieldLabel` is `"What Went Well"` |

   Command for the hop list:
   `grep -n "const strengths = outcome.message" src/lib/grade/engine.ts`;
   `grep -n "export function seedEdits" src/app/components/grading-results/gradingResultsHelpers.ts`;
   `grep -n "FEEDBACK_FIELDS.map\|value={edit\[field\]}" src/app/components/grading-results/RowFeedbackBoxes.tsx`.

   So a count-bound row on `GradingResults.tsx` shows, TODAY, in an editable
   textarea labelled **What Went Well**, the string
   `Not graded: this run is limited to 40 submissions. Re-run to grade the rest.`
   (`engine.ts:320`), and the deadline row shows `engine.ts:307`'s equivalent.

   **A correction the check's own chain needs, and it does not weaken B3.** The
   check cited `defaultRowEdit` (`:315-324`) as the seeder. `defaultRowEdit` is
   NOT on the live path for the rendered box: `loadGradingResultsEdits` returns
   `seedEdits(run)` or `loadPersistedEdits`, both of which key on every
   current-run student (`gradingResultsHelpers.ts:574-606`), so
   `edits[result.student]` is always defined and the `?? defaultRowEdit(result)`
   at `GradingResults.tsx:576` never fires for a row in the current run.
   `defaultRowEdit` is still the seeder for the post and CSV payload paths
   (`:287`, `:308`, `:388`). **Both functions seed `strengths` from
   `result.strengths` identically**, so B3's conclusion is unchanged - but AC-6
   has to attach where the LIVE value is produced, and section 5 says where.

   **What this changes about the value claim.** The gap is not "the reason is
   absent". It is **MISLABELLED AND UNMARKED**: the reason is presented as the
   student's strengths, in an editable box, with no marker on the row, and the
   sentence it contains names an action that does not do what it says on this
   surface. The chunk's deliverable is therefore a correction plus a marker,
   not a disclosure of something hidden.

   **Softened wording, as the check required.** The engine sentence is not
   unconditionally false: `GithubGradingPanel`'s queue is user-editable and
   persisted, so an instructor who prunes the queue and presses Grade again
   does grade the rest. What is false is **the action the sentence names** -
   pressing Grade again, unchanged, re-takes the same prefix
   (`src/lib/grade/engine.ts:192`, `studentSubmissions.slice(0, maxSubmissions)`;
   `GithubGradingPanel.tsx:372-378` passes `queue.map(...)` wholesale) and
   drops the same tail.

---

## 3. What exists today - the deltas from round 1 only

Round 1's section 1 is accurate except where section 0 dispositions it. Only
the corrected and newly-measured facts are repeated here.

### 3.1 Corrected quantities

| Round-1 claim | Corrected | Command |
|---|---|---|
| `gradeStudentEntries` slices at `engine.ts:191` | `engine.ts:192` | `grep -n "studentSubmissions.slice" src/lib/grade/engine.ts` |
| The `ungraded` sweep of `src/app/components/**/*.tsx` returns 14 lines | **16** | `grep -rn -i "ungraded" src/app/components --include=*.tsx \| grep -v "\.test\." \| wc -l` |
| (the two missed) | `RepoGradesGrid.tsx:619` (`cell.status === "ungraded"`, the grid's own status union) and one further `CourseIntelAnswer.tsx` prose hit | same command, listed |

The conclusion the sweep supports is unchanged and re-checked: **no production
`.tsx` reads `GradeResult.ungraded`.** The only `GradingResults.tsx` hits are
the comment at `:256-260`. The instrument fires on real code (it returns 16
lines), so the zero is a real absence, not a broken search.

### 3.2 `"run-deadline"` is not observable on the surface this chunk builds (M4)

`deadlineMs` reaches `gradeStudentEntries` only through `gradeAction`'s
`runDeadlineMs` FormData field (`src/app/actions/grading.ts:727-730`). Command:
`grep -rn "runDeadlineMs" src/ | grep -v "\.test\."`. Every setter of that
field is a server-side workflow registry step:

- `src/lib/workflows/registry/steps.grading-run.ts:478` and `:539`
- `src/lib/workflows/registry/steps.grading-draft-flow.ts:265`
- `src/lib/workflows/registry/steps.grading-cartridge.ts:105`

None of the three `GradingResults` importers is on that path. So on this
surface four of the five outcomes are observable and one - `"run-deadline"` -
is reachable only by a server-side unattended run.

**Building the branch is still correct**, because `stoppedBy` is a two-member
union (`src/lib/grade/types.ts:142`) and an unhandled member is a type error.
**Presenting five outcomes as five observable states is not**, and round 1 did.
AC-1 now labels it.

**Bounded uncertainty, stated rather than filled in:** I did not rule out that
a run PRODUCED by one of those workflow steps could later be restored into
`LiveFeedPanel` or `GradingTab` and rendered. I did not trace the restore path,
and this environment cannot execute one. It does not change the build - the
branch ships either way - so it is recorded here as an unknown rather than as a
residual, since nothing is being deferred.

### 3.3 The import hazard nothing in round 1 named (M1)

The new leaf must **value-import `isUngraded` from `@/lib/grade/types`**, never
from the `@/lib/grade` barrel.

`gradingResultsHelpers.ts:58-70` records the mechanism in its own words: the
barrel drags `grade.ts -> grade/rubric.ts -> research/rubric-bank.ts ->
research/db.ts -> src/lib/supabase/server.ts -> next/headers` into the client
bundle, and `next build` fails to compile while `npx tsc --noEmit`, `npx
eslint` and `npx vitest run` all stay green. That file avoids the hazard by
keeping a LOCAL DUPLICATE of `composeOverallComment` rather than importing it.

**No landed test catches this - CORRECTED this round, per section 0.1.**
`src/lib/canvas-client-boundary.test.ts` guards only `@/lib/canvas` and
`@/lib/canvas-modules`, only DIRECT imports, and only in files carrying
`"use client"` - its own header at `:65-70` and `:36-45` says both limits
explicitly, and that part of this paragraph still holds. But a DIFFERENT
landed test does cover this directory:
`gradingResultsHelpers.test.ts:824-889`'s `"grading-results client files stay
client-bundle-safe"` guard, which round 1 and round 2 both failed to name.
Ruling R (section 0.1, section 5.1) requires registering the new leaf in that
guard's `CLIENT_FILES` list, so after this chunk lands the hazard named in
this section IS caught by a landed test - two independent instruments on one
hazard, the guard test at `verify`-adjacent scope and `npm run build` (AC-8,
below) at the wave gate.

**Safe precedent, opened:** `src/app/components/grading-recording/grading-row.ts:44`
value-imports `{ composeOverallComment, RESUBMIT_NOTICE } from "@/lib/grade/types"`
and ships.

**The gate is `npm run build`**, and its pass signal is the
compiled-successfully line, not the exit code (`docs/loop/this-repo.md` section
1 - the build exits 1 in the prerender tail in this checkout because there is
no `.env`). This is AC-8 and its step is the wave gate.

---

## 4. One chunk, and the seam - unchanged from round 1

The check confirmed this. Restated in two sentences, not re-argued.

**ONE CHUNK - CORRECT AND MARK - covering both rows, on one surface.**
**P2 (single-row re-dispatch) is cut off at a seam and handed over as RES-2.**

P1 (the row states whether the tool graded it, why not, and what the instructor
can actually do on this surface) is decidable entirely from `result.ungraded`,
`checkRowPostability(...)` and the `edits` map `GradingResults.tsx` already
holds. P2 needs a re-run key the GitHub path does not carry, an action whose
signature `GradingResults` cannot satisfy, and three different mechanisms in
three parents.

One property could have spanned the seam - "a re-run must clear the stale
disclosure" - and it does not exist until P2 exists.

---

## 5. `owns` - exact paths, and where AC-6 attaches

### Production (2 files)

| Path | Now | Role |
|---|---|---|
| `src/app/components/grading-results/ungradedDisclosure.ts` | does not exist | NEW pure leaf. No React, no I/O, no module-scope mutable cache. Value-imports `isUngraded` from `@/lib/grade/types` ONLY (section 3.3) and `applyFeedbackFieldEdit` from `./gradingResultsHelpers`. |
| `src/app/components/GradingResults.tsx` | **916** lines (`@(Get-Content src/app/components/GradingResults.tsx).Count`) | The caller. |

**The leaf's four exports:**

| Export | Signature | Why it is in the leaf and not the component |
|---|---|---|
| `UNGRADED_DISCLOSURE_COPY` | a frozen `Record` keyed by outcome shape - at minimum `"submission-count-bound"` and `"run-deadline"` (the two `stoppedBy` members), plus whatever `classifyRow` needs for its other states (AC-2's rescued row, the `grading-failed` label) | AC-3b/AC-3c's construction: the emitted set is a value a test can compare, not a property of prose - REVISED this round to drop count-interpolation (section 0.1) and to be the single source both `classifyRow` and `correctUngradedFeedbackSeed` read, rather than two independently authored copies. |
| `classifyRow` | `(result: GradeRow, edit: RowEdit) => RowDisclosure` | AC-1/AC-2. `RowDisclosure` carries a discriminated `state` key and the copy for it. |
| `describeSkippedStatus` | `(message?: string) => string` | AC-4/B1. Moving the `:626` ternary arm into a function is what makes the fallback EXECUTABLE - a component expression is not, because no component renders here. |
| `correctUngradedFeedbackSeed` | `(result: GradeRow, edit: RowEdit) => RowEdit` | AC-6/B3. See below. |

### Where AC-6 attaches, precisely

`GradingResults.tsx:164` and `:183` are the only two places `edits` is
initialised or reset from a run, and both call `loadGradingResultsEdits`
(`gradingResultsHelpers.ts:596`). The chunk wraps both:

```
loadGradingResultsEdits(canvasUrl, run)   ->   correctUngradedSeeds(run, loadGradingResultsEdits(canvasUrl, run))
```

where `correctUngradedSeeds` maps `correctUngradedFeedbackSeed` over the run's
rows. **The replacement condition is a byte comparison guarded by a
discriminant, not a heuristic - REVISED this round (section 0.1: round-2's
version drove this from `isUngraded(result)` alone, which reaches both
`UngradedOutcome` members):**

> Replace `edit.strengths` when **`result.ungraded?.kind === "not-attempted"`**
> AND `edit.strengths` is either exactly `result.ungraded.message` or a member
> of `UNGRADED_DISCLOSURE_COPY`. **Otherwise - including every
> `kind === "grading-failed"` row, unconditionally - return `edit` unchanged.**

The kind guard is load-bearing, not a defensive extra: `engine.ts:152`
(`buildUngradedRow`) sets `strengths = outcome.message` for **both** members of
`UngradedOutcome`, so an untouched `grading-failed` row's `edit.strengths`
ALSO equals `result.ungraded.message` today, by the same pass-through - the
first half of the byte comparison is satisfied by both kinds alike. Only the
`kind` check keeps the correction from also overwriting
`engine.ts:264`'s real diagnostic (`` `${GRADING_FAILURE_PREFIX}${message}` ``,
carrying the actual thrown error - this repo's only per-submission failure
detail) with a `not-attempted` template. `GradingFailedOutcome` has no
`stoppedBy` field (`types.ts:162-169`, read this round), so the guard is also
what keeps the lookup below type-safe: TypeScript narrows `result.ungraded` to
`NotAttemptedOutcome` inside the guarded branch, and `.stoppedBy` is illegal
outside it. Sabotage: S15.

Three properties this gets, each of which a weaker attachment point loses:

- **No divergence between screen, store and CSV.** Correcting at the render
  call to `RowFeedbackBoxes` (`GradingResults.tsx:822-829`) would show the
  instructor one string while `buildCsvContent` (`:494`) exported another.
  Correcting the seed corrects one object that all three read.
- **A typed edit is never overwritten.** A rescued row whose instructor typed
  into the box matches neither branch of the condition.
- **Idempotent across the persisted store.** `edits` is persisted
  (`persistGradingResultsEdits`, `gradingResultsHelpers.ts:608`), so a stored
  blob can hold either the engine's sentence (written before this chunk) or the
  leaf's own (written after). The membership test covers both, so a reload
  neither double-corrects nor leaves an old sentence behind.

`overall` must be recomputed in the same step or it disagrees with its parts;
`applyFeedbackFieldEdit` (`gradingResultsHelpers.ts:331`) is the existing
function that does exactly this and its doc comment says it is the only writer
of `overall`. Use it; do not recompose by hand.

**What the corrected copy must say - REVISED this round (section 0.1).** It is
the leaf's own authorship and the checker should read it as copy, not as
mechanism. It must state the fact, must not contain
`Re-run to grade the rest`, and must say what re-running actually does on this
surface - that pressing Grade again with the queue unchanged re-grades the
same first N, so the queue has to be narrowed first. **It must NOT attempt to
state the specific count** (round 2 required this; round 2's check found it
not constructible, section 0.1's AC-3b entry). `classifyRow`'s signature is
`(result: GradeRow, edit: RowEdit)` - no run, no count - and `GradingRun`
(`types.ts:308-318`) carries no `maxSubmissions` field
(`grep -rn "maxSubmissions" src/lib/grade/types.ts` returns nothing, run this
round), so the only way to put a number in the copy would be parsing one out
of `result.ungraded.message`, which G2 forbids and which would also make the
emitted string vary per run - defeating AC-3b's frozen-literal shape outright.
The two `stoppedBy` values get their own frozen literal each (one for
`"submission-count-bound"`, one for `"run-deadline"`), neither containing a
number, and section 6's AC-3b freezes both, plus AC-3c ties
`correctUngradedFeedbackSeed`'s replacement to the same two literals by
construction (section 5.1).

`GradingResults.tsx` calls every export the leaf adds, so the wave contains its
own caller. No parent component is edited; no new prop.

### Test (1 new file, 1 edited file)

| Path | Role |
|---|---|
| `src/app/components/grading-results/ungradedDisclosure.test.ts` | NEW. The chunk's whole oracle and its whole `verify`. Pure-function tests over the leaf, plus the source-text wiring assertions over `GradingResults.tsx`. |
| `src/app/components/grading-results/gradingResultsHelpers.test.ts` | **EDITED, per Ruling R (section 0.1).** Not new, not merely adopted. Baseline this round: `npx vitest run` on the unmodified file - `Test Files 1 passed (1)`, `Tests 90 passed (90)` - and `@(Get-Content ...).Count` / `wc -l` both **963** lines. The exact edit and its measured line budget are in section 5.1. |

### Callers, fixtures and oracles that could break - classified

Derived with `grep -rln "GradingResults" src/ --include=*.test.ts` (15 files)
and `grep -rlE "readdirSync|walkTsxFiles|walkFiles|walkDir" src/ --include=*.test.ts`
(**33 files**). **Both lists are FLOORS** (`traps-spec.md`: the orchestrator's
enumeration is never the set). The implementer must re-derive both with its own
instrument and report what these missed.

| File | Class | Why |
|---|---|---|
| `GithubGradingPanel.tsx`, `GradingTab.tsx`, `LiveFeedPanel.tsx` | checked-safe | The three importers. No prop change. If a wave DOES need a prop, all three enter `owns` and this row is wrong - say so rather than editing one. |
| `grading-results/gradingResultsExtraction.wiring.test.ts` | **adopted - highest break risk** | `tableRowsAreDrivenBySortedResults` (`:66-73`) requires the literal `sortedResults.map(` in the source. Rewriting the tbody as `sortedResults.filter(...).map(` turns it RED. |
| `rubricBreakdownPercent.wiring.test.ts` | adopted | Requires `formatScorePercent` to stay referenced in `GradingResults.tsx` (`:92-93`). |
| `grading-results/gradingResultsPostOutcome.test.ts` | adopted | Pins `fanOutGradingPostResult`'s `{status:"skipped", message}` shape - the same message `:626` must start rendering. |
| `sortGradeRows.test.ts` | adopted | AC-6 now calls `applyFeedbackFieldEdit`. That function is not edited, but this chunk becomes a consumer of its `overall`-recomposition contract, so a future change to it breaks this chunk. This file's tests must stay green and the implementer must not edit them. |
| `grading-results/gradingResultsHelpers.test.ts` | **REVISED this round - moved OUT of this table, INTO `owns` (section 5.1)** | Round 2 classified it "adopted, upgraded from checked-safe" - wrong after Ruling R, which requires editing its `CLIENT_FILES`/`BANNED_IMPORT_PATTERNS` guard directly. Kept here only as a pointer so a reader scanning this table does not conclude the file is merely adopted. |
| `src/lib/grade/grade-result-doors.wiring.test.ts` | checked-safe, walker | Requires every caller of `postCanvasGradesAction` to reference `ungraded`. `GradingResults.tsx` passes today only via the COMMENT at `:256-260` - do not delete it unless real code replaces it. RES-7. |
| `src/file-size-ceiling.structure.test.ts` | **budget gate**, walker | `LIMIT = 1000` at `:30` (`sed -n '28,32p'`). `ALLOWED_OVERAGE` at `:64` lists four files (`sed -n '64,90p'`), none of them `GradingResults.tsx`. **Headroom is 84 lines** (1000 - 916). Never add an entry to that list to fit this chunk. |
| **`src/lib/client-state-sweep.registry.test.ts`** | **NEW ROW - conditional, walker** | Omitted in round 1. `collectModuleScopeCaches` (`:61-74`) walks all of `SRC_DIR` via `readdirSync` (`:49`). `:116-121` asserts the registered-file set equals an exact FIVE-file list (`EXPECTED_REGISTERED_FILES`, `:101-107`), and `:123-133` requires every OTHER module-scope cache to be registered or listed in `DELIBERATELY_UNREGISTERED` (`:86-96`). **A module-scope memo in the "pure leaf" trips the third test.** The design forbids one; this row is what makes that a gate rather than an intention. |
| `src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts` | checked-safe, walkers | Always. `no-emojis` also scans `docs/`, so this file is under it. |
| `courses/page-module-css-classes.test.ts`, `page-module-css-orphan-classes.test.ts` | **conditional - both or neither** | Only bite if a NEW class lands in `src/app/page.module.css`. The design avoids both by reusing `styles.fieldHint` and an existing token. If a new class is genuinely needed, both files enter `owns`. |
| `ui/buttonVariant.test.ts`, `confirmArmButtons.test.ts`, `modalAdoption.wiring.test.ts`, `modalAdoptionWiring.attributes.test.ts` | checked-safe, walkers | Only bite on a `<Button variant="contained">` or a modal. The chunk adds neither. |
| `src/lib/grade/postable.test.ts` | checked-safe | `postable.ts` is not edited. |
| `src/lib/grade/engine.ungraded.test.ts` | **must not be touched** | Owned by the out-of-scope `engine.ts`. |

### Explicitly NOT owned

`src/lib/grade/engine.ts`, `types.ts` (read by the new guard test in section
5.1, never edited - S14 already established the precedent of never touching
this file even transiently, and the guard's sabotage-equivalent is an in-string
canary rather than a live mutation of it, section 8), `postable.ts`;
`src/app/components/grading-results/gradingResultsHelpers.ts` (read and called,
never edited - distinct from `gradingResultsHelpers.test.ts`, which IS owned,
section 5.1); everything under `src/app/components/repo-grades/`;
`src/app/actions/github.ts`; `src/app/actions/grading.ts`;
`src/lib/github-grading-run-store.ts`; everything under
`src/app/components/snapshot-grading/` and `assessment-shared/` (live A11 work).

---

## 5.1 Ruling R, applied - the exact edit and its measured line budget

All four parts live in the one describe block Ruling R names
(`:824-889`). Every regex below was verified this round by direct execution
(`node -e`), not by inspection - output pasted under each one.

### Part 1 + 4 together: register the leaf, and make omission impossible

```
const CLIENT_FILES = [
  "./gradingResultsHelpers.ts",
  "./RowFeedbackBoxes.tsx",
  "./SubmittedFilesPanel.tsx",
  "./icons.tsx",
  "./useResultsSort.ts",
  "./ResultsTableHeaderRow.tsx",
  "./FeedbackExpandModal.tsx",
  "./ungradedDisclosure.ts",        // NEW - Ruling R part 1
  "../GradingResults.tsx",
];
```

Then, appended inside the same describe block, the completeness assertion
(part 4):

```
it("CLIENT_FILES lists every non-test .ts/.tsx file in this directory (Ruling R part 4)", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));
  const localFiles = readdirSync(dir).filter((n) => /\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts"));
  for (const name of localFiles) expect(CLIENT_FILES).toContain(`./${name}`);
});
```

Measured this round, with the leaf not yet built, so the real directory
listing does not yet include it - `node -e` against
`fs.readdirSync("src/app/components/grading-results")` filtered the same way:

```
[
  "./FeedbackExpandModal.tsx", "./gradingResultsHelpers.ts", "./icons.tsx",
  "./ResultsTableHeaderRow.tsx", "./RowFeedbackBoxes.tsx",
  "./SubmittedFilesPanel.tsx", "./useResultsSort.ts"
]
```

Seven files, all seven already in `CLIENT_FILES` - so this assertion is GREEN
today, before this chunk lands, which is the correct starting state (S19
proves the direction of failure). Once `ungradedDisclosure.ts` exists on disk,
this same assertion is what makes part 1's registration non-optional: if the
leaf is created but the array entry above is omitted or later deleted, this
test reds immediately, on the real file listing, with no reliance on anyone
remembering to add a case for it. `readdirSync` needs adding to this file's
existing `import { readFileSync } from "node:fs";` (becomes
`import { readFileSync, readdirSync } from "node:fs";`, same line, no line
count change).

### Part 2: narrow the ban, exempting `@/lib/grade/types` only

```
const BANNED_IMPORT_PATTERNS: RegExp[] = [
  /from ["']@\/lib\/grade["']/,
  /from ["']@\/lib\/grade\/(?!types["'])/,   // narrowed - Ruling R part 2
  /from ["']@\/lib\/supabase\/server["']/,
  /from ["']next\/headers["']/,
];
```

Verified this round with `node -e` against six fixtures, all matching the
required direction:

```
"import { generateRubric } from \"@/lib/grade/rubric\";" -> true OK
"import { X } from '@/lib/grade/rubric';" -> true OK
"import type { UngradedOutcome } from \"@/lib/grade/types\";" -> false OK
"import type { UngradedOutcome } from '@/lib/grade/types';" -> false OK
"import { X } from \"@/lib/grade/typesFoo\";" -> true OK
"import { X } from \"@/lib/grade\";" -> false OK
```

The negative lookahead bans every submodule of `@/lib/grade/` except the exact
specifier `@/lib/grade/types` (both quote styles); a near-miss like
`@/lib/grade/typesFoo` is still banned, so the exemption is not a prefix match.
The existing canary test (`:865-881`) gets two more lines proving the
exemption in both quote styles, alongside its existing positive cases -
extending an existing test rather than adding a new one:

```
expect(BANNED_IMPORT_PATTERNS.some((p) => p.test('import type { X } from "@/lib/grade/types";'))).toBe(false);
expect(BANNED_IMPORT_PATTERNS.some((p) => p.test("import type { X } from '@/lib/grade/types';"))).toBe(false);
```

### Part 3: guard that `types.ts` stays import-free

The exemption in part 2 is sound only as long as `src/lib/grade/types.ts`
itself carries no VALUE import - a type-only import is erased at compile time
and pulls in no runtime code, so it cannot smuggle `next/headers` back in
through the exemption. Measured this round: `types.ts` has exactly one
`import` occurrence, `import type { CodeRunResult } from "../code-runner";`
at `:1` (`grep -n "import" src/lib/grade/types.ts`), and this pattern
distinguishes it from a value import, verified by `node -e`:

```
real file matches (should be false): false
known-bad line matches (should be true): true
known-good type-only line matches (should be false): false
side-effect import matches (should be true): true
namespace import matches (should be true): true
```

```
const VALUE_IMPORT_PATTERN = /^import(?!\s+type\b)\s/m;

it("types.ts stays import-free, so the exemption above stays sound (Ruling R part 3)", () => {
  expect(VALUE_IMPORT_PATTERN.test('import { x } from "@/lib/supabase/server";')).toBe(true);
  expect(VALUE_IMPORT_PATTERN.test('import type { CodeRunResult } from "../code-runner";')).toBe(false);
  const source = readFileSync(
    fileURLToPath(new URL("../../../lib/grade/types.ts", import.meta.url)),
    "utf8"
  );
  expect(source).not.toMatch(VALUE_IMPORT_PATTERN);
});
```

The relative path resolves from this test file
(`src/app/components/grading-results/`) up three levels to `src/`, then into
`lib/grade/types.ts` - the same `new URL(relativePath, import.meta.url)`
idiom the file's existing `CLIENT_FILES` reads already use, just aimed
outside this directory instead of inside it.

**Because `types.ts` is fenced off (not owned by this chunk, and S14 already
established the precedent of never touching it even transiently), this
guard's sabotage-equivalent is the in-string canary above (a known-bad STRING,
not a real file mutation) - consistent with `traps-search.md`'s "every
absence claim needs a canary," not a live mutation of an out-of-scope file.**

### Measured line budget

Base measurement this round: `@(Get-Content
src/app/components/grading-results/gradingResultsHelpers.test.ts).Count` (and
`wc -l`, agreeing) = **963**. `file-size-ceiling.structure.test.ts`'s
`LIMIT = 1000` (`:30`) applies to this file - it is NOT in `ALLOWED_OVERAGE`
(`grep -n "gradingResultsHelpers" src/file-size-ceiling.structure.test.ts`
returns nothing, checked this round) - so it is a live, uncushioned wall,
exactly like `GradingResults.tsx`'s.

Every snippet above was written to a scratch file exactly as drafted and
measured with `wc -l` against the equivalent original block (both agree with
`@(Get-Content).Count` per this-repo.md; neither was estimated):

| Addition | Measured lines | Command |
|---|---|---|
| `BANNED_IMPORT_PATTERNS` block, narrowed in place (6 lines before, 6 lines after - the exemption comment moved inline rather than added as its own lines) | net **+0** | `wc -l` on both the original 6-line block and the drafted 6-line replacement |
| Canary block addition (the 2 new `expect` lines quoted above, no added comment) | **+2** | `wc -l` on the drafted addition |
| "types.ts stays import-free" block (1 const line, 1 blank line, then a 9-line `it(...)` including the multi-line `readFileSync` call) | **+11** | `wc -l` on the drafted block |
| Completeness assertion `it` (5 lines total: open, 3 body statements, close) | **+5** | `wc -l` on the drafted block |
| `CLIENT_FILES` new entry | **+1** | direct count |

**Total measured addition: 19 lines** (0+2+11+5+1). `963 + 19 = 982`, leaving
**18 lines** of headroom under the 1000-line ceiling (the exact same
instrument as `GradingResults.tsx`'s 84-line headroom, section 5). The
"types.ts stays import-free" block is the largest single piece and is written
with a wrapped `readFileSync` call for readability; an implementer who writes
it on one line saves roughly 3 lines, which only widens the margin. Budget
this wave's actual diff (blank lines between tests, any additional comment)
at up to 30 new lines as a conservative cap - `963 + 30 = 993`, still 7 lines
under - and if the real
diff exceeds that, the implementer reports the overage rather than absorbing
it silently; this is not a wall to discover at the wave gate. Sabotage S7b
proves the wall is real for this file specifically, the same way S7 does for
`GradingResults.tsx`.

---

## 6. `verify`, and the acceptance criteria the pass condition ranges over

```
npx vitest run src/app/components/grading-results/ungradedDisclosure.test.ts
```

**Single-path, because single-path is repo POLICY, not a choice this artifact
makes.** L14 was ruled 2026-09-20. The reason it wins: a single path is
decidable by the existing runner - a missing sole path exits 1 with
"No test files found", covered by an executing test at
`src/tools/backlog/closure-runner.test.ts:33-42` (read this round; the `it(`
title is at `:35` and the `runVerify("npx vitest run src/does-not-exist.test.ts")`
assertion at `:37-39`). A multi-path list is silently dropped and still exits 0,
and `closure-runner.ts:31` reads the `Tests` line, never the `Test Files` line.

**THE RULED COST, stated here as the ruling requires every row to state it:**
this chunk's guarantees do not all live in that one file. AC-7 (the `never`
arm) and AC-8 (the client-bundle boundary) have no vitest instrument at all,
and the budget gate lives in `file-size-ceiling.structure.test.ts`. **Ruling R
adds a fourth: R1-R4 (section 6, below) live in
`gradingResultsHelpers.test.ts`, a SECOND test file this chunk edits, and
`verify`'s single path never runs it.** Those four lean on the WAVE GATE,
which runs `npm test` over the whole suite and so runs
`gradingResultsHelpers.test.ts` (baseline this round: 90/90 passing, section
5.1) alongside everything else. That is acceptable **because the closure is
verify AND wave gate, never verify alone** - and it is stated rather than
hidden, because a verify that looks like the whole closure is exactly the L14
failure in a different costume.

**L15 - load sensitivity is a CLASS, not one file.** It has a second instance
(`recording-files.kinds.test.ts`), and both instances share the mechanism: a
test that re-reads a directory per assertion against vitest's unconfigured
5000ms default. **This chunk's `verify` reads exactly TWO named files by path**
(`ungradedDisclosure.ts` by import, `GradingResults.tsx` by `readFileSync`),
performs no `readdirSync` and walks no tree, **so it is not in the class.**
Keep it that way: if a later round wants a tree-wide assertion, it belongs in
the wave gate's walkers, not in this file. The four walkers this chunk must
keep green (`file-size-ceiling`, `no-emojis`, `source-bytes`,
`grade-result-doors`, plus the conditional `client-state-sweep.registry`) are
pre-existing and ARE in the class - if one reports "Test timed out in 5000ms",
re-run that file alone before treating it as a regression.

### Pass condition - the three things `traps-spec.md` requires

- **Object under comparison:** the set of acceptance criteria AC-1..AC-8 plus
  AC-3c and R1-R4 (all below), evaluated against
  `src/app/components/grading-results/ungradedDisclosure.ts`,
  `src/app/components/GradingResults.tsx` and
  `src/app/components/grading-results/gradingResultsHelpers.test.ts` as they
  sit on disk - REVISED this round (section 0.1) to add the third file, which
  Ruling R moved into `owns`.
- **Instrument, per quantity:**
  - AC-1, AC-2, AC-3a, AC-3b, AC-3c, AC-4, AC-6: **direct calls** to the
    leaf's exported functions from the test file. Real execution, no source
    reading.
  - AC-5: `readFileSync` over `src/app/components/GradingResults.tsx` with the
    CR-tolerant unanchored comment strip described below, plus a canary block
    proving each matcher separates a known-good from a known-bad fixture BEFORE
    the real file is read.
  - AC-7: `npx tsc --noEmit`, **at the wave gate only** - it has exactly one
    legal caller in this repo.
  - AC-8: `npm run build`, graded on the compiled-successfully line and NOT on
    the exit code, at the wave gate.
  - R1-R4: **direct calls and `readFileSync` inside
    `gradingResultsHelpers.test.ts` itself**, run via `npm test` at the wave
    gate (not `verify` - see the ruled cost above).
  - Size budget: `@(Get-Content src/app/components/GradingResults.tsx).Count`
    AND `@(Get-Content .../gradingResultsHelpers.test.ts).Count`, both at the
    wave gate, both compared against `LIMIT = 1000` - REVISED this round to
    add the second file (section 5.1).
- **Direction of failure:** RED if ANY row of the table below is unsatisfied.
  The condition ranges over the WHOLE table - a partial fix that satisfies
  most of it is a FAIL, not a pass with a note. No prose anywhere in this
  document exempts a row; if a checker finds one that appears to, the prose is
  the defect and the table wins.

### Acceptance criteria

| id | Criterion | Instrument |
|---|---|---|
| AC-1 | `classifyRow` returns a distinct `state` for each of: a graded postable row; a graded row refused by `checkRowPostability`; `ungraded.kind === "grading-failed"`; `stoppedBy === "submission-count-bound"`; `stoppedBy === "run-deadline"`. **Four of these five are observable on this surface; `"run-deadline"` is built for type closure only (section 3.2) and the test says so in a comment naming that section.** | leaf calls |
| AC-2 | A rescued ungraded row (ungraded, and `edit.total` carries a real score) classifies as its own `state`, and its copy states that it cannot be posted from this table. | leaf calls |
| AC-3a | No member of `UNGRADED_DISCLOSURE_COPY` contains the substring `Re-run to grade the rest`. | leaf calls |
| AC-3b | **RECONSTRUCTED this round (section 0.1) - round 2's version was NOT CONSTRUCTIBLE.** The test file holds a FROZEN LITERAL copy of every string `UNGRADED_DISCLOSURE_COPY` can hold - written out in the test, never imported from the leaf, and containing NO interpolated count (the count is not constructible here; section 5's "What the corrected copy must say"). The test drives `classifyRow` over the enumerated product of its inputs (five outcome shapes x the rescued-edit variants AC-2 needs), collects every string on every returned `RowDisclosure`, and asserts `new Set(collected)` equals `new Set(frozenLiterals)` - **both directions**. A new sentence anywhere in `classifyRow` is then a set diff a human must read and approve, which is the review this repo can actually perform. | leaf calls |
| AC-3c | **NEW this round (section 0.1) - closes round 2's second AC-3b hole: the frozen set covered `classifyRow` alone and never the string that actually lands in the instructor's textarea.** For each `stoppedBy` value in `NotAttemptedOutcome`'s two-member union, `correctUngradedFeedbackSeed`'s replacement `strengths` is BYTE-IDENTICAL to `UNGRADED_DISCLOSURE_COPY[stoppedBy]` - the SAME frozen member AC-3b already enumerates, read by construction rather than independently authored. Exhaustive over both members of a closed union, not a hand-picked sample. | leaf calls |
| AC-4 | `describeSkippedStatus(m)` returns a NON-EMPTY string for every one of `undefined`, `""`, `"   "`, and a real reason; and for a real reason it returns that reason (not a substitute). `GradingResults.tsx`'s `"skipped"` arm calls it, and the literal `"Not posted - no grade or comment to send"` no longer appears in `GradingResults.tsx` as that arm's whole output. | leaf calls + source text |
| AC-5 | **Rendered, not merely called.** Inside the tbody map region of `GradingResults.tsx` - the source between the index of `sortedResults.map(` and the index of the closing `</tr>` - the attribute `data-ungraded-state=` occurs at least once, inside a JSX interpolation, and `classifyRow` is called within that same region. The attribute name is pinned as a FROZEN LITERAL IN THE TEST FILE, never imported from the component or the leaf (an assertion reading a value the implementation also reads proves nothing - `traps-tests.md`). It is a contract, not an implementation spelling: it also gives RES-4's browser check something nameable to look for. | source text |
| AC-6 | **B3, NARROWED this round (section 0.1) - round 2's version was scoped to `isUngraded(result)`, which reaches BOTH `UngradedOutcome` members and mandated overwriting a `grading-failed` row's own diagnostic.** `correctUngradedFeedbackSeed(result, edit)`: when `result.ungraded?.kind === "not-attempted"` AND `edit.strengths` is exactly `result.ungraded.message` or a member of `UNGRADED_DISCLOSURE_COPY`, returns an edit with `strengths` replaced by `UNGRADED_DISCLOSURE_COPY[result.ungraded.stoppedBy]` (AC-3c ties this to the frozen set); returns an edit whose `strengths` is unchanged when the instructor has typed anything else; is IDEMPOTENT; recomputes `overall` via `applyFeedbackFieldEdit` rather than a stale composition; and - the new clause - **returns `edit` completely unchanged, unconditionally, when `result.ungraded?.kind === "grading-failed"`**, even if `edit.strengths` happens to equal `result.ungraded.message` (which it does by default, per `engine.ts:152`'s pass-through - the same condition shape that fires for `not-attempted`, which is exactly why the `kind` guard is load-bearing rather than redundant). And `GradingResults.tsx` applies it at BOTH `loadGradingResultsEdits` call sites - if the source shows one wrapped and one bare, RED. | leaf calls + source text |
| AC-7 | The leaf's `stoppedBy` switch has an exhaustive arm typed `never`, so a third union member is a compile error. | `npx tsc --noEmit`, **wave gate only** |
| AC-8 | The leaf value-imports from `@/lib/grade/types`, not from `@/lib/grade`, and the build still reports its compiled-successfully line. | `npm run build`, **wave gate**; plus a source-text check in the test file that the specifier `"@/lib/grade"` followed immediately by a closing quote does not appear in the leaf. **A second, independent instrument now also covers this** (section 0.1, section 5.1): `gradingResultsHelpers.test.ts`'s `it.each(CLIENT_FILES)`, once the leaf is registered - see R1-R4 below, which is a distinct set of criteria, not a restatement of AC-8. |

### Ruling R acceptance criteria (R1-R4)

Live in `gradingResultsHelpers.test.ts`, not in the leaf's own test file; run
by `npm test` at the wave gate (the ruled cost, above), never by `verify`.
Each corresponds 1:1 to one of Ruling R's four numbered parts (section 0.1).

| id | Criterion | Instrument |
|---|---|---|
| R1 | `CLIENT_FILES` contains the literal `"./ungradedDisclosure.ts"`. | source text (array literal) |
| R2 | `BANNED_IMPORT_PATTERNS`'s second entry matches `"@/lib/grade/rubric"` (both quote styles) and does NOT match `"@/lib/grade/types"` (both quote styles) - all four cases exercised, not just the two round 2's version already covered. | direct `RegExp.test` calls, verified this round by `node -e` (section 5.1) |
| R3 | `VALUE_IMPORT_PATTERN` does not match the real contents of `src/lib/grade/types.ts`, and the canary proves the same pattern DOES match a known-bad value-import line and does NOT match the file's real type-only import line. | `readFileSync` on `types.ts` (read-only, never edited - S14's precedent) plus direct `RegExp.test` calls |
| R4 | For every `.ts`/`.tsx` file in `src/app/components/grading-results/` whose name does not end `.test.ts`, `CLIENT_FILES` contains `./<that filename>`. | `readdirSync` on the real directory at test run time, so a future file is caught automatically (section 5.1) |

**Direction of failure, stated separately from AC-1..AC-8's table because R1-R4
run in a different file at a different gate:** RED if any of R1-R4 fails,
exactly as for the AC table. R4 is the one built to catch an omission the
other three cannot: R1-R3 protect the mechanism Ruling R specifies; R4 protects
against a FUTURE file skipping the mechanism entirely.

**The review obligation AC-3b carries, which is not a test and is not
pretending to be one.** Freezing the copy set makes a new instruction VISIBLE;
it cannot make it WRONG. So the artifact's checker, and the verify pass after
the build, each read the frozen set and ask one question per member: does this
sentence name an action the instructor can perform on THIS surface? That is a
human judgement with a bounded input - the frozen set shrank this round
(section 0.1: no per-run count, so no per-count variants) to roughly four to
six strings - rather than an unbounded property of model prose. Round 1 wrote
it as a criterion and it had no instrument at all; this is the honest
downgrade.

**Fixtures come from the emitted shape.** Every `GradeResult` fixture in the
test file is built from the field set `buildUngradedRow` emits
(`engine.ts:152-171`, which includes `codeExecution`, `gradedRepo`, `gradedRef`
and `submissionTruncated`), transcribed field by field with a comment naming
that line range - not invented. A fixture using a shape no producer emits
proves nothing (`traps-tests.md`).

**On the source-text half.** `stripComments` in the new test file must be the
CR-tolerant UNANCHORED form required by backlog L13: split on `/\r?\n/`, strip
an unanchored line-comment pattern per line, rejoin. The anchored multiline
form is CR-safe but trailing-comment-blind, and L13 records an EXECUTED defeat
against it. Stated rather than hidden: the unanchored form also eats a `//`
inside a string literal such as a URL. The test file carries a CR canary built
with `String.fromCharCode(13)` so no tool can materialise the escape into a
real byte (`traps-search.md`: Write/Edit materialise `\uXXXX` escapes, and
`src/source-bytes.structure.test.ts` owns that scan).

---

## 7. The guarantee, and the non-guarantee

### Guaranteed - held by the code regardless of what any model returns

- **G1. The runtime branch set is an ENUMERATION of five, not a construction.**
  Said plainly because round 1 said the opposite. AC-1 is a hand-written list
  of five cases, which is exactly the shape `traps-tests.md` warns about, and
  its control is S1/S2/S3.
- **G1b. Future states are caught at COMPILE time, and that half IS a
  construction.** `UngradedOutcome` is a two-member discriminated union
  (`types.ts:172`) and `NotAttemptedOutcome.stoppedBy` is a two-member string
  union (`types.ts:142`); `types.ts:137-138` says a third reason must be added
  there. A `never` arm therefore makes a third member a compile error. Its
  instrument is `npx tsc --noEmit` and its step is the wave gate (AC-7), not
  `verify` - `verify` cannot see it.
- **G2. The state is computed, never parsed out of prose.** `isUngraded`
  (`types.ts:176-178`) tests field presence; `checkRowPostability` compares
  strings the app itself produced. No branch in the leaf reads model text.
- **G3. The reason reaching the screen is the refusing code's own, and is never
  blank.** `describeSkippedStatus` returns `postable.ts`'s own literal or
  Canvas's own skip reason when one exists, and a defined fallback when none
  does. Round 1's version permitted a blank.
- **G4. Nothing new becomes postable.** The chunk adds no call to
  `postCanvasGradesAction` and changes neither `canPostRow` (`:579`) nor
  `gradableResults` (`:261-264`).
- **G5 (B3, NARROWED this round - section 0.1). The engine's instruction no
  longer reaches the screen uncorrected on this surface, for a `not-attempted`
  row whose box the instructor has not edited.** Bounded honestly, twice over:
  it is corrected in the SEED, so a row whose stored edit is neither the
  engine message nor a frozen leaf string is left alone by design (a typed
  edit, overwriting it would be worse); and it does NOT extend to a
  `grading-failed` row - that row's `engine.ts:264` diagnostic is left alone
  unconditionally, by construction (AC-6's `kind` guard), because it is real
  per-submission information, not a false instruction.
- **G6 (new, Ruling R - section 0.1).** The `@/lib/grade/` client-bundle ban's
  exemption for `@/lib/grade/types` is not merely asserted safe; it is GUARDED
  by construction. R3 makes the exemption's precondition (`types.ts` carries no
  value import) an executing assertion against the real file, not a one-time
  observation recorded in this document. If a future edit adds a value import
  to `types.ts`, R3 reds before the exemption can silently become false.

### NOT guaranteed - state these; do not let a green suite imply otherwise

- **N1. That any of it renders.** No component is rendered by any test here.
  Every AC-5 assertion is a source-text read: it proves the characters are in
  the file, not that a badge appears, is legible, is announced, or survives a
  real run. Owner observation only - RES-4.
- **N2. That the reason is USEFUL.** `GRADING_FAILURE_PREFIX` plus a thrown
  message is a developer string. The chunk guarantees the instructor sees it
  instead of a misleading substitute; not that they can act on it.
- **N3. That the instructor can recover a dropped repo in one click.** RES-2.
- **N4. That the engine's own emitted string is corrected.** It is not; only
  the string the instructor reads on this surface is. An unattended run's
  report, and any other consumer of `ungraded.message`, still carries
  `engine.ts:307`/`:320` verbatim. RES-1.
- **N5. Contrast, focus order and announcement of the new marker.** No test
  here computes contrast or renders a live region. RES-5.
- **N6.** That the `"run-deadline"` copy is ever seen. Section 3.2: it is
  built for type closure and is not reachable from the three importers by any
  path I traced.
- **N7 (new this round - section 0.1).** That the corrected copy states the
  run's specific submission count or time limit. It deliberately does not:
  `classifyRow`/`correctUngradedFeedbackSeed`'s signatures carry no run and no
  count, `GradingRun` (`types.ts:308-318`) has no `maxSubmissions` field, and
  building one would mean either parsing a number out of prose (G2 forbids it)
  or editing the fenced-off `engine.ts`. The corrected copy states the fact and
  the category (bound-stopped vs. deadline-stopped) and what re-running does;
  it does not echo the number. Not a residual - a stated, reasoned withdrawal
  (section 0.1), not a deferred proof.

---

## 8. Sabotages - each naming the file that goes RED

**Procedure for every entry, both directions, in this order: (1) run the named
file on the correct code and record GREEN with its counts; (2) apply the
mutation; (3) re-run and record RED with the failing test name; (4) restore and
re-run to GREEN.** A sabotage that is red in both directions discriminates
nothing and must be replaced.

**Restore by copy, not by `git checkout --`.** These files are uncommitted
mid-chunk; `git checkout -- <path>` reverts to the index and destroys the
chunk's work. Copy the file aside first and copy it back.

**Two of these run at the wave gate, not in `verify`**, and are marked. The
wave gate is the single legal `tsc` caller and no two agents may sabotage-verify
on the tree at once.

| # | Mutation | File that goes RED | Guards |
|---|---|---|---|
| S1 | Make the `"run-deadline"` branch return the same `state` as `"submission-count-bound"`. | `ungradedDisclosure.test.ts` | AC-1: the two `stoppedBy` values are distinguished, not collapsed. |
| S2 | Return the graded-postable outcome for a row where `isUngraded(result)` is true. | `ungradedDisclosure.test.ts` | AC-1: an ungraded row is never classified as an ordinary graded row - the whole defect. |
| S3 | Drop the rescued-ungraded branch so a scored ungraded row falls through to postable. | `ungradedDisclosure.test.ts` | AC-2. |
| S4 | Add `"Re-run to grade the rest."` to the count-bound copy. | `ungradedDisclosure.test.ts` | AC-3a AND AC-3b - two independent kills, and the pair is the point: if only AC-3a reds, the frozen set was imported from the leaf instead of written out, and AC-3b is a tautology. |
| S5 | In `GradingResults.tsx`, revert the `"skipped"` arm to the hardcoded `"Not posted - no grade or comment to send"`. | `ungradedDisclosure.test.ts` | AC-4, the WRONG-TEXT direction. This reproduces today's live defect exactly, so it doubles as proof the test would have caught the shipped bug. |
| **S5b** | **NEW (B1).** In `ungradedDisclosure.ts`, make `describeSkippedStatus` return its argument directly (`(m) => m ?? ""`). | `ungradedDisclosure.test.ts` | AC-4, the NO-TEXT direction. S5 alone does not discriminate - it reds against the blank version too - so without S5b "renders the message" is satisfied by an empty warning-coloured div. The pair separates wrong text, right text and no text. |
| **S5c** | **NEW.** Make `describeSkippedStatus` return the fallback UNCONDITIONALLY, discarding a real reason. | `ungradedDisclosure.test.ts` | AC-4's other half: the fallback must not swallow a reason that exists. Without this, S5b is satisfiable by always returning the fallback - which is today's defect with a new string. |
| S6 | **REVISED (M2).** Move the `data-ungraded-state` attribute out of the tbody map region - render it once above the table instead, keeping the import and the call. | `ungradedDisclosure.test.ts` | AC-5: a per-row classification rendered once per RUN is not a per-row marker, and round 1's "calls the function" criterion accepted it. |
| **S6b** | **NEW.** Delete the call to the leaf's run-level function while leaving the import. | `ungradedDisclosure.test.ts` | Round 1's S6, kept as the dead-leaf control: an import without a call ships the leaf dead with tsc, lint and every other test green. |
| **S10** | **NEW (B3).** Make `correctUngradedFeedbackSeed` return `edit` unchanged. | `ungradedDisclosure.test.ts` | AC-6: the engine's sentence goes back to the What Went Well box. This is B3's kill control and the artifact fails its round if this stays GREEN. |
| **S11** | **NEW (B3).** Make `correctUngradedFeedbackSeed` replace `strengths` unconditionally for an ungraded row, ignoring the equality test. | `ungradedDisclosure.test.ts` | AC-6's other direction: a rescued row's typed feedback must survive. Without this, AC-6 is satisfiable by a function that destroys instructor work. |
| **S12** | **NEW.** In `GradingResults.tsx`, wrap only the `:164` call site and leave `:183` bare. | `ungradedDisclosure.test.ts` | AC-6's second half. `:183` runs on every run refresh, so a one-site fix looks correct until the run changes - a defect no single-render reading would show. |
| **S15** | **NEW this round (section 0.1) - AC-6's narrowing control.** Widen the guard from `result.ungraded?.kind === "not-attempted"` to `result.ungraded !== undefined`, and read `.stoppedBy` off `result.ungraded` via a type assertion (`(result.ungraded as NotAttemptedOutcome).stoppedBy`) so it still compiles. | `ungradedDisclosure.test.ts` | AC-6's new clause: a `grading-failed` fixture whose `edit.strengths` equals its own `result.ungraded.message` (true by default, per `engine.ts:152`'s pass-through for BOTH kinds) has its diagnostic overwritten with a `not-attempted` template. This is the exact defect round 2's check found and the exact reason AC-6 was narrowed - without S15, a re-widened guard passes every other sabotage. |
| **S16** | **NEW this round (section 0.1) - AC-3c's kill control.** Hand-author a second, slightly different copy of the count-bound string directly inside `correctUngradedFeedbackSeed` instead of reading `UNGRADED_DISCLOSURE_COPY["submission-count-bound"]`. | `ungradedDisclosure.test.ts` | AC-3c: proves the replacement text is drawn from the SAME frozen member `classifyRow` reads, not a second, independently authored string that could drift - the exact hole round 2's check found in AC-3b. |
| S7 | Add 90 lines of filler to `GradingResults.tsx`, pushing it from 916 to 1006. | `src/file-size-ceiling.structure.test.ts` | The 84-line headroom is a real wall, not an assumption. |
| **S7b** | **NEW this round (section 0.1/5.1).** Add ~40 lines of filler to `gradingResultsHelpers.test.ts`, pushing it from 963 to over 1000. | `src/file-size-ceiling.structure.test.ts` | The 18-line measured headroom (section 5.1) is a real wall for this SECOND file too, not in `ALLOWED_OVERAGE` and not assumed. |
| S8 | Delete the comment at `GradingResults.tsx:256-260` **and** every real `ungraded` reference the chunk added. | `src/lib/grade/grade-result-doors.wiring.test.ts` | Proves the door walker still binds this file after the edit, and proves it is currently satisfied by a COMMENT - which is why RES-7 exists. |
| S9 | In `ungradedDisclosure.test.ts`, replace a live AC-5 assertion's subject with a trailing-comment copy of itself (the L13 mode-2 shape). | `ungradedDisclosure.test.ts` | Proves the chosen `stripComments` is not trailing-comment-blind. If this stays GREEN, the helper is the anchored form and must be replaced. |
| **S13** | **NEW (M1/AC-8), WAVE GATE.** Change the leaf's import to `from "@/lib/grade"`. | `npm run build` - the compiled-successfully line disappears | Proves the client-bundle hazard is real for THIS file rather than inherited from `gradingResultsHelpers.ts`'s comment. `npx tsc --noEmit`, `npm run lint` and `npm test` must all still be GREEN on the mutant - that contrast IS the finding, and recording it is the point. **REVISED this round (section 0.1): with Ruling R landed, `gradingResultsHelpers.test.ts`'s `it.each(CLIENT_FILES)` ALSO reds on this exact mutation** (the leaf is now registered), giving a second, faster-feedback instrument for the same hazard at `npm test` rather than only at `npm run build`. Run both; a mutant caught by one and not the other is itself a finding. |
| **S14** | **NEW (M3/AC-7), WAVE GATE.** Widen the leaf's switch parameter to a local alias adding a third `stoppedBy` member. | `npx tsc --noEmit` goes from no output to an error on the `never` arm | Proves G1b is a construction rather than a claim. `types.ts` is NOT edited - the widening is local to the leaf and reverted. |
| **S17** | **NEW this round (Ruling R part 2, R2's kill control).** Revert the narrowed pattern to round 2's unqualified form, `/from ["']@\/lib\/grade\//`. | `gradingResultsHelpers.test.ts`'s `it.each(CLIENT_FILES)`, on `./ungradedDisclosure.ts` | Proves the narrowing is load-bearing for the leaf's own registration, not merely a documented intention: without it, the leaf's own `@/lib/grade/types` import trips the guard that Ruling R exists to let it pass. |
| **S19** | **NEW this round (Ruling R part 1+4, R1/R4's kill control).** Delete the `"./ungradedDisclosure.ts"` line from `CLIENT_FILES` while the leaf file still exists on disk. | `gradingResultsHelpers.test.ts`'s completeness assertion (R4) | Proves R4 actually enforces R1's registration rather than merely restating it: a real file present without a corresponding entry reds immediately, with no dependence on anyone noticing the omission by eye. |

**R3 (types.ts stays import-free) has no live-mutation sabotage, by design
(section 5.1).** `types.ts` is fenced off - not owned by this chunk, and S14
already established the precedent of never touching it even transiently. R3's
canary (section 5.1: the pattern fires on a known-bad value-import STRING and
not on the file's real type-only import line) is the sabotage-equivalent for
this one criterion, per `traps-search.md`'s "every absence claim needs a
canary."

S9 is deliberately a sabotage of the TEST's own instrument rather than of the
implementation. That is the only way to prove the comment-stripping half is
live, and `traps-tests.md`'s "sabotage the implementation, not the test" rule is
about assertions, not about instruments. Every other entry mutates production
code.

---

## 9. Residual register

Each entry names an owner, an instrument and the step that will measure it. An
entry missing any of the three is a deletion and I have called none of these
one.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-1 | **Narrowed (see section 0).** `engine.ts:320`'s `"Re-run to grade the rest."` and `engine.ts:307`'s deadline equivalent are false for the action they name on `GithubGradingPanel` - the queue is unpruned and `slice(0, maxSubmissions)` (`engine.ts:192`) re-takes the same prefix. AC-6 corrects what the instructor READS on `GradingResults.tsx`; the emitted string itself, and every other consumer of it, is not corrected. | **The backlog row filed at this chunk's push.** Round 1 named "the next chunk that owns `engine.ts`", which does not exist - a residual owned by a non-existent chunk is the deletion the caps card forbids. The filed row is the owner and carries the sequencing constraint: it must not run concurrently with work holding `src/lib/grade/`. | A pure-function assertion in that row's own test over the emitted message string, plus a re-read of `GithubGradingPanel.tsx:360-378` to confirm the queue is still unpruned. | That row's own `verify`. |
| RES-2 | P2, single-row re-dispatch. Blocked on: no repo re-run key on the GitHub path; `gradeOneSubmissionAction`'s Canvas-only signature; three parents with three mechanisms. | A follow-on scoping seat, after this chunk's push. | An architect pass opening `GithubGradingPanel.tsx:51,299,328-332,372-378` to decide whether `student` maps to a `QueueRow`, plus a decision on whether `gradeOneSubmissionAction` gains a repo variant. | A new backlog row created at this chunk's push, carrying this artifact's measurements so the next seat starts ahead. |
| RES-3 | Whether `parseRepoRef(q.repoRef)` re-renders exactly as `digest.fullName`, which any `student` -> `QueueRow` mapping rests on. **Not proven; must not be assumed.** | RES-2's receiver. | Open `parseRepoRef` and `ingestRepo`'s `fullName` assignment and compare, or add a pure test over both. | RES-2's architect pass. |
| RES-4 | Nothing here proves the marker or the corrected copy RENDERS, is legible, or is announced. No component is rendered by any test (`docs/loop/this-repo.md` section 6). AC-5's `data-ungraded-state` attribute is what makes this checkable in a browser rather than by impression. | The repo owner. | A browser, a real grading run with the bound set below the queue size via `GRADE_MAX_SUBMISSIONS`, inspecting a dropped row's What Went Well box and its `data-ungraded-state`. | An owner observation after deploy, recorded in `docs/REGRESSION.md` with the rest of this chunk's entry. |
| RES-5 | Contrast of whichever colour token the marker uses, in BOTH themes. `--danger` is `#dc2626` at `src/app/globals.css:60` and `#f87171` inside the `html[data-theme="dark"]` block at `:301`, and that exact token has already silently taken two rules from 4.83:1 to 2.77:1 while passing every gate. | The Wave-3 visual/accessibility seat for this chunk. | Open both theme definitions of the chosen token and state the ratio in each. No test here computes contrast. | The Wave-3 seat, before the follow-up review. |
| RES-6 | Whether the review CSV (`buildCsvContent`, called at `GradingResults.tsx:494`) should carry an ungraded column. It is not a gradebook door - `grade-result-doors.wiring.test.ts:34-39` seeds only `postCanvasGradesAction`, `buildCanvasGradebookCsv`, `buildMoodleGradebookCsv`, `fillGradebookCsv` - so an ungraded row exports today with a blank score and the reason inside the comment. **AC-6 changes what that comment SAYS**, which makes the question live rather than theoretical. | The repo owner (a product call: is the export a review artefact or a gradebook artefact). | Reading `buildCsvContent`'s column list against one exported file. | Escalated at this chunk's push, batched, not gating. |
| RES-7 | `grade-result-doors.wiring.test.ts` is satisfied by a COMMENT (`referencesUngradedFlag` at `:67-69` does no comment stripping; `GradingResults.tsx` passes today purely on `:256-260`). The guard proves awareness of the identifier, not handling of the state. | A later hardening chunk, or the seat that next touches that oracle. | Strip comments before the awareness check, then re-run - if callers drop out, they were passing on a comment. | Filed as a backlog row at this chunk's push. Not fixed here: tightening a shared whole-tree oracle mid-chunk risks reddening files this chunk does not own. |

---

## 10. What I could not determine

Stated rather than filled in, per `docs/loop/this-repo.md` section 6.

- **Whether anything renders.** No component is rendered by any test here.
  RES-4.
- **Whether a workflow-produced run carrying a `"run-deadline"` row can be
  restored into `LiveFeedPanel` or `GradingTab`.** I traced the setters of
  `runDeadlineMs` (section 3.2) but did not trace the run-restore path, and
  this checkout cannot execute one. It does not change what gets built.
- **The tsc and build results for AC-7, AC-8, S13 and S14.** I did not run
  `npx tsc --noEmit` (other agents are active; it has one legal caller) and I
  did not run `npm run build`. Both are named as wave-gate instruments with
  named sabotages, not asserted as passing.
- **The actual run of R1-R4, S7b, S15, S16, S17 and S19.** These criteria and
  sabotages do not exist in the tree yet - I designed and verified their
  MECHANISM this round (the regexes by direct `node -e` execution, pasted
  where introduced; the file-listing and line-budget claims by real
  `readdirSync`/`wc -l` runs against the actual directory and file, also
  pasted), but none of them has been written into
  `gradingResultsHelpers.test.ts` or executed as a vitest test. That is the
  implementer's wave, gated by `npm test` as stated throughout section 6.
- **Contrast of any token.** RES-5. No test in this repo computes it.
