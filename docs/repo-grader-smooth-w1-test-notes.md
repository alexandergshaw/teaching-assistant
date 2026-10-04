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

**Scope of that 18/18 run, and the gap it did NOT cover (round-2 fix).** The
reference exercised the LEAF in isolation (the pure REQ-1/REQ-2 oracle only). It
did NOT run the REQ-3 wiring pin against the real `RepoGradesGrid.tsx` slice -
that is exactly WHY the round-1 REQ-3 negative pin
(`not.toContain('alreadyAttempted ? "Re-post" : "Post"')`) was shipped broken:
the banned literal occurs TWICE in the real source, at `:437` (the live code the
extraction removes) AND at `:414` (a JSX doc comment quoting it in prose). The
round-1 pin, run against the raw `ColumnHeaderControls` slice, would RED on the
surviving `:414` comment even after a correct extraction. Measured
2026-10-04 with `grep -n 'alreadyAttempted ? "Re-post" : "Post"'
src/app/components/repo-grades/RepoGradesGrid.tsx` -> lines **414 and 437**. The
revised REQ-3 below is checkable against the REAL slice: it strips comments
first (so the `:414` prose cannot red it) and the extraction deletes the now-
false `:414` comment outright (FIX 1b). Both halves proven satisfiable by the
honest Option-A shape documented in "Consumption convention" below - after
extraction the stripped slice contains `disabled={busy || plan.postable.length
=== 0}`, `postableCount: plan.postable.length`, `bulkProgress.done`, `Posting`,
`: gradeLabel` and `: postLabel`, and does NOT contain `alreadyAttempted ?
"Re-post" : "Post"`, so REQ-3/REQ-7/REQ-8 all go green together on real code.

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
this keeps the leaf pure over exactly the six inputs the oracle enumerates. The
overlays wrapping the leaf's resting labels are a REQUIRED W1 instrument (REQ-7),
not an optional pin - see REQ-7.

The leaf body is transcribed byte-for-byte from current source:
- `gradeLabel`: `RepoGradesGrid.tsx:352-357` (the `restingGradeLabel` ternary).
- `postLabel`: `RepoGradesGrid.tsx:437`
  (`${alreadyAttempted ? "Re-post" : "Post"} ${postableCount} grade(s)`).

### Consumption convention (FROZEN - REQ-8 pins it)

The grid consumes the leaf's return by DESTRUCTURING WITHOUT RENAME, and feeds
each resting label through the transient overlay that stays in the grid:

```ts
const { gradeLabel, postLabel } = repoGradesRunPlanLabels({
  folder: column.folder,
  gradeTargetCount,
  scopedToSelection,
  scanTruncated,
  alreadyAttempted,
  postableCount: plan.postable.length,
});
const gradeAllLabel =
  gradingThisColumn && bulkProgress ? `Grading ${bulkProgress.done} of ${bulkProgress.total}…` : gradeLabel;
// Grade button child: {gradeAllLabel}
// Post button child:  {busy ? "Posting…" : postLabel}
```

The no-rename rule is load-bearing, not stylistic: it makes `: gradeLabel` and
`: postLabel` appear ONLY as the resting arm of each button's overlay ternary
(the destructuring has no colon before the names, and the input object's keys
are different), so REQ-8's consumption pin is exact and a legitimate rename can
never false-red it. This is the one place in these notes where the SPELLING is
the fact (a consumption binding, same exception as a frozen copy literal); the
pure-leaf oracle (REQ-1/REQ-2) still pins facts, never spellings.

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
(both anchors asserted to resolve - `idx > -1`, `end > idx`; verified
`function ColumnHeaderControls` at `RepoGradesGrid.tsx:267`, `export default
function` at `:443`, so the slice spans the whole control, and both anchors
survive an Option-A extraction unchanged). Anchor-resolves is asserted at BOTH
ends, per the slice rule.

**FIX 1a (BLOCKER - comment collision):** the slice MUST be run through the
EXISTING local `stripComments` helper already declared in this file (at
`repoGrades.wiring.test.ts:480`, a function declaration, so it hoists above these
`it`s) BEFORE any content assertion. Reason, measured 2026-10-04: the banned
literal `alreadyAttempted ? "Re-post" : "Post"` occurs TWICE in the real source -
at `:437` (live code the extraction removes) and at `:414`, inside a JSX doc
comment (`{/* ... */}`) that quotes it in prose about "pinned source-text
assertions ... survive verbatim". After an honest Option-A extraction the `:414`
comment still contains the string, so a `not.toContain(...)` against the RAW slice
reds on correct code. `stripComments` turns `{/* ... */}` into `{}` (its block
arm is `/\/\*[\s\S]*?\*\//g`), removing the `:414` occurrence; the pin then reds
only on a RE-INLINE in real code. DO NOT author a new helper named `stripComments`
and DO NOT put these pins in a new `*.test.ts` file - either would add a mention
that `src/tools/strip-comments-agreement.structure.test.ts` enumerates and would
redden that gate repo-wide until classified. This file is ALREADY pinned there as
a SAFE copy (that agreement test's `SAFE_FILES` lists
`src/app/components/repo-grades/repoGrades.wiring.test.ts`), so reusing its
existing local `stripComments` changes nothing for that gate.

```ts
it("the column header's Post/Re-post label comes from the extracted leaf, fed the SAME plan.postable.length its disabled state uses, so the shown count cannot diverge from the gated count (U8.33)", () => {
  const idx = gridSource.indexOf("function ColumnHeaderControls");
  expect(idx).toBeGreaterThan(-1);
  const end = gridSource.indexOf("\nexport default function", idx);
  expect(end).toBeGreaterThan(idx);
  // FIX 1a: strip comments first - RepoGradesGrid.tsx:413-415 quotes the banned
  // ternary literal in a JSX doc comment, so the RAW slice contains it even
  // after the live :437 usage is extracted. stripComments ({/* ... */} -> {})
  // is the local helper at ~:480 (hoisted). Do NOT define a second one.
  const stripped = stripComments(gridSource.slice(idx, end));
  // disabled still gates on the shared plan's postable count (unchanged fact,
  // real code - survives stripping).
  expect(stripped).toContain("disabled={busy || plan.postable.length === 0}");
  // the count passed to the leaf is the SAME plan.postable.length expression -
  // not candidates.length or any re-derived number (real code).
  expect(stripped).toContain("postableCount: plan.postable.length");
  // the inline label ternary MOVED into the leaf; it must not be re-inlined.
  // Checked on the STRIPPED slice, so the :414 prose cannot red it - only a
  // re-inline in live code can.
  expect(stripped).not.toContain('alreadyAttempted ? "Re-post" : "Post"');
});

it("RepoGradesGrid.tsx derives its run labels from the extracted repoGradesRunPlan leaf", () => {
  expect(usesSharedFunction(gridSource, "repoGradesRunPlanLabels", "./repoGradesRunPlan")).toBe(true);
});
```

**FIX 1b (BLOCKER - delete the now-false comment), an explicit implementer REQ
step:** as part of the extraction the implementer MUST delete or rewrite the
`RepoGradesGrid.tsx:413-415` JSX doc comment. After W1 the inline label moves
into the leaf, so that comment's claim that "repoGrades.wiring.test.ts's pinned
source-text assertions (... `alreadyAttempted ? "Re-post" : "Post"`) survive
verbatim as JSX prop/child text" is FALSE and the comment is independently wrong;
it must not be left behind. The `stripComments` defense (FIX 1a) keeps the pin
green regardless of whether the comment is removed, but the comment is a
correctness defect of its own and is in scope for W1. The two POSITIVE pins
(`disabled={busy || plan.postable.length === 0}`, `postableCount:
plan.postable.length`) are unaffected either way - they pass against real code
(the disabled gate is unchanged; the leaf call feeds the same expression).

- **Object / instrument / direction:** the `ColumnHeaderControls` source slice,
  comment-stripped; substring presence/absence + the existing `usesSharedFunction`
  helper (`:636-639`, canary at `:641-656`); reds if the leaf is not used, if the
  label is re-inlined, if the disabled gate is dropped, or if the count fed to
  the label is any expression other than `plan.postable.length`.

**Sabotages (against the production grid, not the test; all run on the stripped
slice):**
- S3a (PARITY - the U8.33 failure): change the leaf call argument from
  `postableCount: plan.postable.length` to `postableCount: candidates.length`
  (`candidates` IS in scope at `:318`, so this COMPILES - a real mutant). The
  `postableCount: plan.postable.length` pin reds. DISCRIMINATES. Restores GREEN.
- S3b (leaf not actually used): delete the leaf call and re-inline
  `` `${alreadyAttempted ? "Re-post" : "Post"} ${plan.postable.length} grade(s)` ``
  in LIVE code. `usesSharedFunction(... repoGradesRunPlanLabels ...)` reds AND the
  `not.toContain('alreadyAttempted ? "Re-post" : "Post"')` pin reds - the
  re-inline is real code, so stripping does not hide it. DISCRIMINATES (both
  directions covered).
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

## REQ-7 (MACHINE) - transient overlays stay in the grid (promoted from optional to REQUIRED)

FIX 2 (checker recommendation, ADOPTED). The transient overlays -
`Grading ${bulkProgress.done} of ${bulkProgress.total}…` (grade button,
`RepoGradesGrid.tsx:357`) and `Posting…` (post button, `:437`) - are the ONE
label behavior the frozen oracle (REQ-1/REQ-2, which test RESTING labels only)
does not cover, and W1 is behavior-preserving over them. So this is a REQUIRED
W1 instrument, not a residual.

- **Object:** the `ColumnHeaderControls` source slice (same anchors as REQ-3),
  comment-stripped.
- **Instrument:** source-text PRESENCE pins. Nothing renders under vitest
  (node-env, `src/**/*.test.ts` only), so this is a source-text presence pin,
  NOT a render assertion - it proves the overlay EXPRESSIONS remain in the grid
  path, not that any pixel is drawn.
- **Direction:** reds if the grade-progress overlay or the `Posting…` overlay is
  dropped from the column header (e.g. the implementer folds `busy`/`bulkProgress`
  into the leaf and loses the transient text).

```ts
it("the transient Grade/Post overlays stay in RepoGradesGrid.tsx's column header (not folded into the pure leaf) - W1 is behavior-preserving over them", () => {
  const idx = gridSource.indexOf("function ColumnHeaderControls");
  expect(idx).toBeGreaterThan(-1);
  const end = gridSource.indexOf("\nexport default function", idx);
  expect(end).toBeGreaterThan(idx);
  const stripped = stripComments(gridSource.slice(idx, end));
  // "Grading ${done} of ${total}…" progress overlay (grade button).
  expect(stripped).toContain("bulkProgress.done");
  // "Posting…" in-flight overlay (post button). Substring avoids pinning the
  // non-ASCII ellipsis.
  expect(stripped).toContain("Posting");
});
```

**WHY this is NOT deferrable to W3:** W3 adds the Run bar and verifies the BAR's
labels; it does not re-verify the COLUMN HEADER overlay. So if W1 silently drops
the column-header overlay, no later wave would catch it - it would ship green.
That is the whole reason to make it a required W1 pin rather than a residual.

**Sabotages (against the production grid, run on the stripped slice):**
- S7a: remove the `gradingThisColumn && bulkProgress ? \`Grading ...\` :` overlay
  wrapper (so the grade button renders the bare leaf `gradeLabel`). The
  `toContain("bulkProgress.done")` pin reds. DISCRIMINATES. GREEN on restore.
- S7b: remove the `busy ? "Posting…" :` wrapper. The `toContain("Posting")` pin
  reds. DISCRIMINATES. GREEN on restore.

Neither sabotage is red-in-both or green-in-both: each reds exactly on dropping
its own overlay and is green otherwise.

## REQ-8 (MACHINE) - the button children CONSUME the leaf output (close the "call then re-inline" gap)

FIX 3 (checker recommendation, ADOPTED). REQ-3's `usesSharedFunction(...,
"repoGradesRunPlanLabels", ...)` proves the leaf is imported AND called, but NOT
that its return value is used. An extraction could call
`repoGradesRunPlanLabels({...})`, discard the result, and re-inline a label via a
NON-MATCHING spelling (string concat, a differently-ordered template) while
`usesSharedFunction` still passes AND REQ-3's exact-literal `not.toContain` is
evaded. This pin closes that gap: the Grade and Post button children must render
the leaf's returned bindings.

- **Object:** the `ColumnHeaderControls` source slice (same anchors), stripped.
- **Instrument:** source-WIRING presence pins on `: gradeLabel` and
  `: postLabel`, the resting arm of each button's overlay ternary under the
  FROZEN no-rename consumption convention (see "Consumption convention" above).
  Machine-checkable.
- **Direction:** reds if either button child stops referencing the leaf's
  returned label (a re-inline leaves the resting arm as some other expression).

```ts
it("the Grade and Post button children CONSUME the leaf's returned labels (gradeLabel/postLabel), so an extraction cannot call the leaf and then re-inline a label via a non-matching spelling while usesSharedFunction still passes", () => {
  const idx = gridSource.indexOf("function ColumnHeaderControls");
  expect(idx).toBeGreaterThan(-1);
  const end = gridSource.indexOf("\nexport default function", idx);
  expect(end).toBeGreaterThan(idx);
  const stripped = stripComments(gridSource.slice(idx, end));
  // Frozen no-rename convention: ": gradeLabel" / ": postLabel" appear ONLY as
  // the resting arm of each button's overlay ternary - never in the
  // destructuring (no colon before the names) nor the input object (different
  // keys). A re-inlined label makes the arm some other expression and reds.
  expect(stripped).toContain(": gradeLabel");
  expect(stripped).toContain(": postLabel");
});
```

**This is distinct from the OWNER/W3 render residual (W1-R1).** REQ-8 is a
machine-checkable SOURCE-WIRING pin ("the child's expression IS the leaf
binding"); it does NOT and cannot prove the right pixels render - that stays
deferred to the owner/W3 verify as W1-R1. Nothing renders under vitest.

**Sabotages (against the production grid, run on the stripped slice):**
- S8a: keep the leaf call but re-inline the POST label in the child, e.g.
  `{busy ? "Posting…" : \`${alreadyAttempted ? "Re-post" : "Post"} ${plan.postable.length} grade(s)\`}`,
  discarding the leaf's `postLabel`. `: postLabel` disappears -> reds (and S3b's
  `not.toContain` also reds here, by the exact-literal path). DISCRIMINATES.
- S8b: re-inline the GRADE label's resting arm via a differently-spelled concat
  that keeps NO exact banned literal (so S3's `not.toContain` would NOT catch
  it). `: gradeLabel` disappears -> reds. DISCRIMINATES. This is the case REQ-8
  exists for and REQ-3 alone cannot catch.

Both sabotages red exactly on their own re-inline and are green otherwise - not
red-in-both, not green-in-both.

## Implementer wiring (what to add to repoGrades.wiring.test.ts)

Near the existing source reads (`:57-70`), add:

```ts
const RUN_PLAN_PATH = join(process.cwd(), "src/app/components/repo-grades/repoGradesRunPlan.ts");
const runPlanSource = readFileSync(RUN_PLAN_PATH, "utf8");
```

Do NOT import any helper from another `*.test.ts` (it re-runs that file's
describe blocks). The leaf test defines its own frozen table inline and imports
ONLY the production leaf (`import { repoGradesRunPlanLabels } from "./repoGradesRunPlan";`
- a production import, not a cross-test import). No `/s` regex. No emojis.

**On `stripComments` (changed in round 2).** REQ-3/REQ-7/REQ-8 run their slice
assertions through `stripComments`. This MUST be the local helper ALREADY
declared in `repoGrades.wiring.test.ts` (at `:480`, hoisted). Do NOT define a
second one, do NOT rename it, and do NOT put these pins in a new file: this file
is pinned as a SAFE copy by `src/tools/strip-comments-agreement.structure.test.ts`
(its `SAFE_FILES` lists this path), and a new definition or a new mentioning
file would redden that agreement gate until classified. The NEW leaf test
(`repoGradesRunPlan.test.ts`) tests a pure function only - it has no source-text
slice, so it must NOT mention `stripComments` at all (a mention there is a new
unclassified file and reddens the same gate).

---

## Executable here vs argued

- **MACHINE (executable under vitest / tsc / lint):** REQ-1, REQ-2 (pure leaf
  oracle); REQ-3, REQ-4, REQ-5, REQ-7, REQ-8 (source-text + regex-count wiring
  on the comment-stripped grid slice); REQ-6 (suite + tsc + lint before/after).
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
| W1-R5 | ~~Transient overlays kept in the grid~~ PROMOTED to REQ-7 (round 2) | test seat | REQ-7 required source-text presence pins | PROMOTED - no longer a residual |

W1-R5 note (round-2 resolution): this was an OPTIONAL pin in round 1. The checker
recommended promoting it and the orchestrator adopted it, so the overlay
preservation is now REQ-7, a REQUIRED W1 instrument (see REQ-7 for why it is not
deferrable to W3). It is a source-text PRESENCE check on the stripped
`ColumnHeaderControls` slice (`bulkProgress.done` and `Posting`), not a render
assertion and not an exact-spelling pin, so it does not over-specify. This row is
kept only to record the promotion; there is no residual left here.

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
5. The round-2 fixes carry over unchanged in KIND: every grid-slice pin
   (REQ-3's `not.toContain`, REQ-7's overlay presence, REQ-8's consume) still
   runs on the comment-stripped slice via the existing local `stripComments`
   (FIX 1a), and the `:413-415` comment is still deleted (FIX 1b). REQ-8's
   resting-arm literals become `: result.gradeLabel` / `: result.postLabel` (or
   the chosen result binding) under Option B's no-overlay-in-leaf shape, since
   Option B's leaf returns the resting labels the same way. Option A is ruled;
   this item exists only so the contingency section stays consistent.
