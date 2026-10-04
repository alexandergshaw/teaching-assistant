# Repo grader smoothing - W1 test notes and oracles (A7 / RULING X-1)

Status: TEST NOTES ONLY. No production code, no test code. Authored by the
test-notes + oracle seat (Opus), 2026-10-04, from the SHIP-checked scope
`docs/repo-grader-smooth-scope.md`. To be adversarially checked before build.

W1 under test: extract the run-plan LABEL derivation from
`RepoGradesGrid.tsx` into a NEW pure leaf `repo-grades/repoGradesRunPlan.ts`
(+ `.test.ts`), make `RepoGradesGrid.tsx` call the leaf (behavior-preserving),
and retarget the wiring pins in `repoGrades.wiring.test.ts` that the extraction
moves. The leaf becomes the ONE source of the Grade/Post label strings so the
future Run bar (W3) and the column header can never render different text
(U8.33 "number shown equals number run").

## Instrument limits (binding on every claim below)

- Nothing renders under vitest (node-env, collects only `src/**/*.test.ts`).
  Every claim here is either a PURE-FUNCTION check, a SOURCE-TEXT wiring check,
  or ARGUED. No label is "rendered and seen". Tagged MACHINE vs ARGUED/OWNER
  per requirement.
- Line counts: `wc -l` (equals `@(Get-Content).Count` here) -
  `RepoGradesGrid.tsx` 643 (headroom 357; extraction REDUCES it),
  `repoGrades.wiring.test.ts` 810 (headroom 190). Measured 2026-10-04.
- `postCanvasGradesAction(` paren-anchored count in
  `useRepoGradesGradingActions.ts` = **2** (lines 554, 674); the bare token
  count is **5** (import + 2 comments + 2 calls). `grep -c` commands run
  2026-10-04. Use the PAREN anchor, never the bare token (folded caution).
- `window.confirm(` at `useRepoGradesGradingActions.ts:522` precedes the
  `:554` bulk post call (verified by line order). W1 does NOT touch the hook.
- `repoGradesRunPlan.ts` does NOT yet exist (verified `ls`, absent).

## Satisfiability (seat obligation #1 - DISCHARGED)

The red tests are satisfiable by a behavior-preserving extraction. A reference
leaf transcribed byte-for-byte from the CURRENT `RepoGradesGrid.tsx:352-357`
(grade label) and `:437` (post label) scored **18/18 green** against the frozen
oracle below. A sabotaged copy (drop `all `, misspell `Re-post`->`Repost`) went
**6 RED**, proving the oracle discriminates. Reference and sabotage scripts:
`scratchpad/ref-runplan.mjs`, `scratchpad/ref-sabotage.mjs` (not committed).

---

## THE FORK that must be settled before build (surfaced, not resolved)

The scope says the leaf is "extracted from `RepoGradesGrid.tsx:314-357`" AND
that W1 edits only `repoGrades.wiring.test.ts:696-712`. Those two instructions
pick DIFFERENT extraction boundaries, because lines 314-357 contain the plan
CALLS (`buildRepoGradePostPlan` 318/324, `buildBulkGradePlan` 349,
`repoGradePostCandidateRows` 318) that OTHER wiring pins assert live in
`RepoGradesGrid.tsx`:

- `:665-667` asserts `usesSharedFunction(gridSource, "buildRepoGradePostPlan", "./repoGradesPosting")` is true.
- `:673-676` asserts `usesSharedFunction(gridSource, "repoGradePostCandidateRows", "./repoGradesPosting")` is true (grid half).

**Option A - thin LABEL leaf (RECOMMENDED).** The leaf is a pure function of
(counts, flags) -> label strings. The grid keeps computing the plan/counts and
passes them in. Breaks ONLY the three source-text pins at `:696-712`, exactly
what the scope's wave bullet authorizes. `:665-676` stay green and now act as a
GUARD that the implementer did not accidentally move the plan calls.

**Option B - full count+label leaf.** The leaf computes counts AND labels from
primitive inputs; parity is by construction. Stronger single-source, but it
moves the plan calls into the leaf, so the GRID halves of `:665-667` and
`:673-676` ALSO go red and must retarget to read the leaf source - which the
scope did NOT list - and it forces `pointsPossibleForColumn` (a grid-LOCAL
helper at `RepoGradesGrid.tsx:73`, used again by the cell path at `:613`) to be
exported from the leaf or duplicated.

**Recommendation: Option A.** Three converging reasons, each measured:
1. It is what the scope's wave bullet literally authorizes (edit `:696-712`
   only); `:665-676` stay green.
2. `pointsPossibleForColumn` is dual-use grid-local (`:73`, called at `:323`
   AND `:613`) - Option B cannot move it without churn the scope did not budget.
3. The resulting oracle is tautology-proof: the leaf is a pure string function
   of DIRECT count/flag inputs, so expected values are hand-frozen literals and
   the oracle never re-derives a count via a shared function (the
   refactor-disarms-tests trap). Option B's leaf would have to construct rows
   with counts known independently of `buildBulkGradePlan` to stay honest.

This is a terminating fork: pick A or B. Every requirement below is written for
**Option A**; the Option B delta is in the final section so either choice is
buildable. The frozen-literal oracle (REQ-1/REQ-2) is IDENTICAL under both.

---

## The leaf contract (Option A)

New file `src/app/components/repo-grades/repoGradesRunPlan.ts`:

```ts
export interface RepoGradesRunPlanInput {
  folder: string;
  gradeTargetCount: number;    // gradePlan.targets.length, computed by caller
  scopedToSelection: boolean;  // bulkSelectionOnly && selected.size > 0
  scanTruncated: boolean;
  alreadyAttempted: boolean;
  postableCount: number;       // plan.postable.length, computed by caller
}
export interface RepoGradesRunPlanLabels {
  gradeLabel: string;  // RESTING grade label - no "Grading X of Y..." overlay
  postLabel: string;   // RESTING post label  - no "Posting..." overlay
}
export function repoGradesRunPlanLabels(input: RepoGradesRunPlanInput): RepoGradesRunPlanLabels;
```

The transient overlays (`Grading ${done} of ${total}...`, `Posting...`) stay in
`RepoGradesGrid.tsx` as render-state concerns and are NOT inputs to the leaf -
this keeps the leaf pure over exactly the six inputs the oracle enumerates.

The leaf body is transcribed byte-for-byte from current source:
- `gradeLabel`: `RepoGradesGrid.tsx:352-357` (the `restingGradeLabel` ternary).
- `postLabel`: `RepoGradesGrid.tsx:437`
  (`${alreadyAttempted ? "Re-post" : "Post"} ${postableCount} grade(s)`).

---

## REQ-1 (MACHINE) - frozen grade-label oracle

- **Object:** `repoGradesRunPlanLabels(input).gradeLabel`.
- **Instrument:** `repoGradesRunPlan.test.ts` asserts byte-equality against a
  hand-authored frozen-literal table (below). Expected strings are literals,
  NOT computed by any shared function - so the generator and the oracle do not
  share an axis.
- **Direction:** any byte difference (missing `all `, wrong pluralization,
  suffix placement, folder interpolation) reds.
- **Construction of coverage:** the input axes are the product
  {gradeTargetCount in {0,1,2,3}} x {scopedToSelection in {false,true}} x
  {scanTruncated in {false,true}}; the table below is the enumerated subset that
  exercises every branch of the ternary at `:352-357` (zero branch; `all N`
  branch; `N selected` branch; singular vs plural `repo`/`repos`; suffix
  present/absent; suffix SUPPRESSED in the zero branch).

Frozen table (folder = `week-05`), proven green by the reference:

| gradeTargetCount | scopedToSelection | scanTruncated | expected gradeLabel |
|---|---|---|---|
| 0 | false | false | `Nothing to grade in week-05` |
| 0 | true  | true  | `Nothing to grade in week-05` |
| 1 | false | false | `Grade all 1 repo in week-05` |
| 1 | false | true  | `Grade all 1 repo in week-05 (scan incomplete)` |
| 2 | false | false | `Grade all 2 repos in week-05` |
| 2 | false | true  | `Grade all 2 repos in week-05 (scan incomplete)` |
| 1 | true  | false | `Grade 1 selected repo in week-05` |
| 3 | true  | false | `Grade 3 selected repos in week-05` |
| 3 | true  | true  | `Grade 3 selected repos in week-05 (scan incomplete)` |

The two `gradeTargetCount: 0` rows are load-bearing: they lock that the zero
branch emits a BARE `Nothing to grade in {folder}` with NO scan-incomplete
suffix and NO selection wording, even when `scanTruncated`/`scopedToSelection`
are true. A naive refactor that appends the suffix unconditionally passes every
other row and reds here.

**Sabotages (each goes RED on mutation, GREEN on restore - all discriminate):**
- S1a: in the leaf, `` `all ${gradeTargetCount}` `` -> `` `${gradeTargetCount}` ``.
  Rows with scopedToSelection=false, count>0 red (expected `Grade all N...`,
  got `Grade N...`). DISCRIMINATES. (Proven: 4 grade rows red in the sabotage run.)
- S1b: `` repo${gradeTargetCount === 1 ? "" : "s"} `` -> `` repos ``. The
  count=1 rows red. DISCRIMINATES.
- S1c: move `${scanTruncated ? " (scan incomplete)" : ""}` into the zero branch
  (or drop it from the non-zero branch). The truncated rows and/or the
  (count=0, truncated) row red. DISCRIMINATES.

## REQ-2 (MACHINE) - frozen post-label oracle

- **Object:** `repoGradesRunPlanLabels(input).postLabel`.
- **Instrument:** same test, same frozen-literal style.
- **Direction:** any byte difference (`Re-post` spelling, `grade(s)` literal,
  count placement) reds.

Frozen table:

| alreadyAttempted | postableCount | expected postLabel |
|---|---|---|
| false | 0 | `Post 0 grade(s)` |
| false | 1 | `Post 1 grade(s)` |
| false | 2 | `Post 2 grade(s)` |
| false | 3 | `Post 3 grade(s)` |
| true  | 0 | `Re-post 0 grade(s)` |
| true  | 3 | `Re-post 3 grade(s)` |

Note `grade(s)` is a FIXED literal at every count (no pluralization on the post
side - verified at `:437`). The `postableCount: 0` rows are the resting text of
the DISABLED Post button (`disabled={busy || plan.postable.length === 0}`); the
button still renders this child, so the leaf must produce it.

**Sabotages:**
- S2a: `"Re-post"` -> `"Repost"`. The alreadyAttempted=true rows red.
  DISCRIMINATES. (Proven: 2 post rows red in the sabotage run.)
- S2b: `grade(s)` -> `grades`. Every post row red. DISCRIMINATES.

## REQ-3 (MACHINE) - the grid wires label AND disabled to ONE count (retarget of :696-712)

This is the parity fact the ORIGINAL `:696-712` protected ("the Post/Re-post
button relabels using the SAME `plan.postable.length` the button's disabled
state also uses, so they cannot disagree"). After extraction the label text
lives in the leaf, so the pin follows the FACT, not the moved spelling.

Replace the single `it(...)` at `:696-712` with the block below. It KEEPS the
existing `function ColumnHeaderControls` .. `\nexport default function` slice
(both anchors already asserted to resolve - `idx > -1`, `end > idx`; verified
`function ColumnHeaderControls` at `RepoGradesGrid.tsx:267`, `export default
function` at `:443`, so the slice spans the whole control). Anchor-resolves is
asserted at BOTH ends, per the slice rule.

```ts
it("the column header's Post/Re-post label comes from the extracted leaf, fed the SAME plan.postable.length its disabled state uses, so the shown count cannot diverge from the gated count (U8.33)", () => {
  const idx = gridSource.indexOf("function ColumnHeaderControls");
  expect(idx).toBeGreaterThan(-1);
  const end = gridSource.indexOf("\nexport default function", idx);
  expect(end).toBeGreaterThan(idx);
  const body = gridSource.slice(idx, end);
  // disabled still gates on the shared plan's postable count (unchanged fact).
  expect(body).toContain("disabled={busy || plan.postable.length === 0}");
  // the label count passed to the leaf is the SAME plan.postable.length
  // expression - not candidates.length or any re-derived number.
  expect(body).toContain("postableCount: plan.postable.length");
  // the inline label ternary MOVED into the leaf; it must not be re-inlined.
  expect(body).not.toContain('alreadyAttempted ? "Re-post" : "Post"');
});

it("RepoGradesGrid.tsx derives its run labels from the extracted repoGradesRunPlan leaf", () => {
  expect(usesSharedFunction(gridSource, "repoGradesRunPlanLabels", "./repoGradesRunPlan")).toBe(true);
});
```

- **Object / instrument / direction:** the `ColumnHeaderControls` source slice;
  substring presence/absence + the existing `usesSharedFunction` helper
  (`:636-639`, canary at `:641-656`); reds if the leaf is not used, if the
  label is re-inlined, if the disabled gate is dropped, or if the count fed to
  the label is any expression other than `plan.postable.length`.

**Sabotages (against the production grid, not the test):**
- S3a (PARITY - the U8.33 failure): change the leaf call argument from
  `postableCount: plan.postable.length` to `postableCount: candidates.length`
  (`candidates` IS in scope at `:318`, so this COMPILES - a real mutant). The
  `postableCount: plan.postable.length` pin reds. DISCRIMINATES. Restores GREEN.
- S3b (leaf not actually used): delete the leaf call and re-inline
  `` `${alreadyAttempted ? "Re-post" : "Post"} ${plan.postable.length} grade(s)` ``.
  `usesSharedFunction(... repoGradesRunPlanLabels ...)` reds AND the
  `not.toContain('alreadyAttempted ? "Re-post" : "Post"')` pin reds.
  DISCRIMINATES (both directions covered).
- S3c (disabled gate dropped): change
  `disabled={busy || plan.postable.length === 0}` to `disabled={busy}`. The
  `toContain("disabled={busy || plan.postable.length === 0}")` pin reds.
  DISCRIMINATES. (Guards a safety-adjacent fact: Post must stay disabled when
  nothing is postable.)

## REQ-4 (MACHINE) - the leaf touches no dangerous action (W1 safety)

- **Object:** the new `repoGradesRunPlan.ts` source.
- **Instrument:** add to `repoGrades.wiring.test.ts` a `runPlanSource`
  readFileSync (see "Implementer wiring" below) and:

```ts
it("repoGradesRunPlan.ts is a pure label leaf - it calls no Canvas-writing or grading action", () => {
  expect(runPlanSource).not.toContain("postCanvasGradesAction(");
  expect(runPlanSource).not.toContain("gradeRepoAction(");
});
```

- **Direction:** reds if the leaf ever gains a call to either action.
- **Sabotage:** add a `postCanvasGradesAction(` reference anywhere in the leaf
  -> reds. DISCRIMINATES. This is the only guard specific to the NEW file;
  the existing `:678-688` pins already cover the grid and cell paths and must
  stay green (W1 does not move those calls).

## REQ-5 (MACHINE) - AC1 guard preservation regression (paren-anchored, folded caution)

W1 must not add or drop any post call anywhere. Add this regression pin (reuses
the already-present `hookSource`, `gridSource`, plus `runPlanSource`):

```ts
it("the only two postCanvasGradesAction call sites remain, in the hook alone (AC1, paren-anchored)", () => {
  const countCalls = (s: string) => (s.match(/postCanvasGradesAction\(/g) ?? []).length;
  expect(countCalls(hookSource)).toBe(2);   // useRepoGradesGradingActions.ts:554,674
  expect(countCalls(gridSource)).toBe(0);
  expect(countCalls(runPlanSource)).toBe(0);
});
```

- **Instrument:** a PAREN-anchored regex count (`/postCanvasGradesAction\(/g`),
  NOT `grep -c "postCanvasGradesAction"` (which returns 5 here: import + two
  comments + two calls - folded TEST-SEAT CAUTION). Direction: reds if the hook
  count leaves 2 or either other file gains a call.
- **Sabotage:** add a third `postCanvasGradesAction(` call to the hook -> hook
  count 3, reds. DISCRIMINATES. (The window.confirm->:554 ordering guard is a
  W3 concern - W1 does not touch the hook, so no new confirm instrument is owed
  here; note it as carried-forward, not deleted.)

## REQ-6 (MACHINE) - whole wiring suite stays green (behavior preservation)

- **Object:** every pre-existing assertion in `repoGrades.wiring.test.ts` (and
  the sibling suites listed below).
- **Instrument:** run the full set BEFORE and AFTER the extraction with the
  path wrapper (multi-path MUST use `test:paths`, never a raw multi-path
  vitest, which silently drops unmatched args):

```
npm run test:paths -- \
  src/app/components/repo-grades/repoGrades.wiring.test.ts \
  src/app/components/repo-grades/repoGradesRunPlan.test.ts \
  src/app/components/repo-grades/repoGrades.wiring.linking.test.ts \
  src/app/components/repo-grades/repoGradesUiState.test.ts \
  src/file-size-ceiling.structure.test.ts \
  src/source-bytes.structure.test.ts \
  src/lib/no-emojis.test.ts
```

- **Direction:** before = green; after = green. If the implementer drifts
  toward Option B (moves a plan call into the leaf), `:665-667` / `:673-676`
  go RED - which CORRECTLY flags an unauthorized boundary change under Option A.
  That is a feature of this instrument, not noise.
- Plus `npx tsc --noEmit` (ONE caller only - it races on
  `tsconfig.tsbuildinfo`) and `npm run lint`, each compared before vs after
  against the same command (watch `preserve-manual-memoization`, R6).

## Implementer wiring (what to add to repoGrades.wiring.test.ts)

Near the existing source reads (`:57-70`), add:

```ts
const RUN_PLAN_PATH = join(process.cwd(), "src/app/components/repo-grades/repoGradesRunPlan.ts");
const runPlanSource = readFileSync(RUN_PLAN_PATH, "utf8");
```

Do NOT import any helper from another `*.test.ts` (it re-runs that file's
describe blocks). The leaf test defines its own frozen table inline and imports
ONLY the production leaf (`import { repoGradesRunPlanLabels } from "./repoGradesRunPlan";`
- a production import, not a cross-test import). Do not name any comment-strip
helper `stripComments` (none is needed here). No `/s` regex. No emojis.

---

## Executable here vs argued

- **MACHINE (executable under vitest / tsc / lint):** REQ-1, REQ-2 (pure leaf
  oracle); REQ-3, REQ-4, REQ-5 (source-text + regex-count wiring); REQ-6 (suite
  + tsc + lint before/after).
- **ARGUED (not executable here):** "the column header and the future Run bar
  render identical text." Nothing renders. The argument is: the leaf oracle
  pins the leaf's output (REQ-1/2) AND REQ-3 pins that the grid uses that
  output fed the shared count; W3 will pin the bar the same way. Labeled ARGUED,
  not asserted as verified.
- **OWNER (unchanged by W1):** clicks (AC4), scroll (AC5), cursor (AC6), Post
  reachability (AC7). W1 is behavior-preserving and moves no control, so these
  are untouched here and remain owner-verified at the W3 baseline/verify. Not a
  W1 deletion - carried forward.

## Residual register (owner / instrument / step)

| Id | Not proven by W1 | Owner | Instrument | Step |
|---|---|---|---|---|
| W1-R1 | Column header renders the leaf's text (nothing renders) | owner | DevTools / visual at the view | W3 verify (same render pass as AC5) |
| W1-R2 | Option A vs B boundary choice | orchestrator/owner | this doc's FORK section | settle before build; default A |
| W1-R3 | Scope said edit `:696-712` only; Option B also needs `:665-667` + `:673-676` grid halves retargeted | orchestrator | diff of those pins vs the chosen option | build (A: no change; B: apply the delta below) |
| W1-R4 | window.confirm->:554 ordering + AC1 full guard set | W3 test notes | paren-anchored count + confirm-precedes-call slice | W3 (hook is W3's surface; W1 does not touch it) |
| W1-R5 | Transient overlays ("Grading X of Y...", "Posting...") kept in the grid | test seat | optional light presence pin on `gridSource` | build - see note below |

W1-R5 note (optional pin): the overlays are the only label behavior NOT covered
by the frozen oracle (which tests resting labels), and nothing renders, so if
the implementer folds `busy`/`bulkProgress` into the leaf the overlay could be
lost silently. A light guard - `expect(body).toContain("bulkProgress.done")`
and `expect(body).toContain("Posting")` within the ColumnHeaderControls slice -
preserves them. Recommended, not mandatory; it is a presence check, not an
exact-spelling pin, to avoid over-specification.

---

## Option B delta (only if the owner picks the full count+label leaf)

The frozen oracle (REQ-1/REQ-2 tables) is UNCHANGED in VALUES. Changes:

1. The leaf computes counts internally and returns
   `{ gradeLabel, postLabel, gradeTargetCount, postableCount, alreadyAttempted, pointsPossible }`.
   Grid uses `result.postableCount === 0` for disabled and `result.postLabel`
   for the child - parity by construction (no `plan.postable.length` reused
   expression), so REQ-3's `postableCount: plan.postable.length` pin is replaced
   by: `expect(body).toContain("result.postableCount === 0")` and
   `expect(body).toContain("result.postLabel")` (or the chosen result binding).
2. Retarget the GRID halves of the existing pins (hook halves UNCHANGED):
   - `:665-667` -> `usesSharedFunction(runPlanSource, "buildRepoGradePostPlan", "./repoGradesPosting")` toBe true.
   - `:673-676` grid line -> `usesSharedFunction(runPlanSource, "repoGradePostCandidateRows", "./repoGradesPosting")` toBe true.
3. `pointsPossibleForColumn` (`RepoGradesGrid.tsx:73`, dual-use at `:323` and
   `:613`) must be exported from the leaf and imported back by the grid for the
   cell path, OR duplicated with a citation comment (this directory's
   duplicate-with-citation convention). Flag to the architect either way.
4. The leaf oracle must now CONSTRUCT rows whose target/postable counts are
   known INDEPENDENTLY of `buildBulkGradePlan`/`buildRepoGradePostPlan` (do not
   call those to compute the expected count - that is the tautology trap). The
   expected strings stay the hand-frozen literals above. This coupling to the
   count functions' row semantics is the concrete cost of Option B and the
   reason Option A is recommended.
