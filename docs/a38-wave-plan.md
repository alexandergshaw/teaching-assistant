# A38 wave plan: grade ONE submission on the recording grader + confirm-above-N spend cap

- Item: A38, area `grading-run-survival-and-disclosure`, kind feature.
- Seat: `loop-plan` (Opus). A fresh `loop-checker` gates this document before any
  A38 implementer builds from it. This seat does not check its own artifact.
- Consumes, both CHECKED SHIP: `docs/a38-acceptance-criteria.md` (AC-1..8, LEV-1,
  the pure-unit instrument preconditions, RES-A38AC-2/7) and `docs/a38-scope.md`
  **revision 3** (esp. section 4.5/4.6 the three pure units, section 5.2 the flow
  and the min binding, section 6.x the waves it sketches, section 11 security,
  section 12 open rulings). This plan REFINES the scope's three-wave sketch into a
  concrete, disjoint-per-review, dependency-ordered cut. It does not reopen owner
  decisions or the `N = min(totalCount, maxSubmissions)` binding.
- Produces: (1) the wave table with derived write sets, exports, callers,
  pure-vs-surface and independent-gateability; (2) where the three pure units and
  the bound-reader land, with the carried `requireUser()` correction;
  (3) the panel ceiling / extraction plan; (4) the disjointness computation, both
  senses, pasted; (5) per-wave gates; (6) line-shift obligations; (7) residuals.

All quantities name the command that produced them. Line counts use BOTH `wc -l`
(Git Bash) and `@(Get-Content <file>).Count` (PowerShell), the mandated
instrument (`docs/loop/this-repo.md` section 3); where they agree it is stated.
Measured at HEAD, 2026-09-29.

---

## 0. Three facts this plan settles before the cut, because they set the ordering

1. **The carried correction: `getEffectiveGradeBoundAction` uses `requireUser()`,
   NOT `requireOwner()`.** Scope rev 3 section 5.2 (`:899`), section 6.4 (`:1060`),
   section 11 (`:1436`) and section 13 (`:1478`) all guard the new reader with
   `requireOwner()`. That is wrong for the honest reason measured below, and this
   plan binds wave 2 to `requireUser()`. See section 2.

2. **The three A38 waves are NOT disjoint from each other - they share the panel,
   so they are STRICTLY SEQUENTIAL, one implementer at a time, never a parallel
   fan-out.** This is the same-path computation of section 5, pasted from the
   Bash tool, not eyeballed. The "disjoint write sets" the seat brief asks for is
   satisfied in the sense that matters here: each wave is independently REVIEWABLE
   and independently GATEABLE (caller-complete within itself), and A38 as a whole
   is disjoint from any concurrently-dispatched sibling item. Concurrency WITHIN
   A38 is impossible and idle sequencing is the correct, unavoidable cost.

3. **The panel is at the ceiling and wave 0 must extract before wave 1 adds.**
   Measured, both tools agreeing (no 42-line discrepancy on this file):
   ```
   wc -l src/app/components/grading-recording/GradingRecordingPanel.tsx        -> 977
   PS> @(Get-Content src/app/components/grading-recording/GradingRecordingPanel.tsx).Count -> 977
   grep -n "LIMIT" src/file-size-ceiling.structure.test.ts                     -> 41:const LIMIT = 1000;
   ```
   1000 is legal, 1001 is red (`docs/a38-scope.md:178-181`). Headroom is +23.
   Wave 0 extracts `GradingCaptureStatus.tsx` (scope section 2.3) BEFORE any
   feature line is added; wave 1's budget is set from the MEASURED post-extraction
   count at the P-8 gate, never from the projection. See section 3.

---

## 1. The single measured correction to the tree, and what did not need re-measuring

Re-measured at HEAD (2026-09-29), commands shown. The scope's rev-3 measurements
were spot-checked and hold; only the additions below are load-bearing for the cut.

- Panel size 977 (both tools, above). Table 289 / Row 329
  (`@(Get-Content ...).Count`), action 214, `auth.ts` 474.
- `handleGradeAll` and its whole-table build are where the scope says:
  ```
  grep -n "const handleGradeAll = useCallback\|gradingRows.rawRows.map\|classifyGradingResult(\|gradeCapturedSubmissionsAction(" src/app/components/grading-recording/GradingRecordingPanel.tsx
  621:  const handleGradeAll = useCallback(async () => {
  638:      const submissions = gradingRows.rawRows.map((r) => ({
  651:      const result = await gradeCapturedSubmissionsAction(
  677:        const classified = classifyGradingResult(r);
  ```
- `grading-dispatch.ts` **ALREADY EXISTS** and exports `checkGradingReadiness`
  (`grep -rn "grading-dispatch" src ... -> GradingRecordingPanel.tsx:130 imports
  checkGradingReadiness; grading-dispatch.test.ts:2`). So it is an EDITED file in
  waves 1 and 2, not a new one. `grade-lock.ts` and `useGradingRowGrade.ts` do NOT
  exist (`ls ... -> No such file or directory`) - they are NEW.
- The single-row path is still absent (no `gradeAttempts`, `gradedRubricDigest`,
  `useGradingRowGrade`, `createGradeLock`, `getEffectiveGradeBoundAction`,
  `buildSingleSubmission`, `grade-lock` source symbol outside docs).
- `ConfirmArmButtons` is already imported and used IN `GradingTableRow.tsx`
  (`:50` import, `:182` render), so the confirm idiom is reusable in-file
  (fence 3: pass `idleVariant="text"`, never `idleVariant="contained"`).
- The two wave-2 exact-set canaries, measured:
  - `grading-row-serialization.test.ts` `EXPECTED_WIRE_KEYS` is **19** keys
    (`:707` open, `:731` close: `id` ... `submissionKind`), asserted at `:735`
    and `:740`. Wave 2 takes it to **21** (`gradedRubricDigest`, `gradeAttempts`)
    in the SAME commit that adds the fields.
  - `GradingRecordingPanel.wiring.test.ts` pins **three** cohort-clearing
    branches today (`:349` readiness refusal, `:355` error-in-result, `:361`
    catch). Wave 1 adds a **fourth** (the lock-refusal exit, scope section 4.5).
- `grading-rows.ts`: `applyGradingResultToRow` at `:175`, `classifyGradingResult`
  at `:274`; `setGradingRowState` does not yet exist (new in wave 1).

---

## 2. The `requireUser()` correction, measured and bound

**Fact.** `requireOwner()` is a deprecated bare alias:
```
grep -nE "export async function (requireUser|requireAppOwner|requireOwner)" src/lib/supabase/auth.ts
328:export async function requireUser(): Promise<AuthorizedUser> {
408:export async function requireAppOwner(): Promise<AuthorizedUser> {
451:export async function requireOwner(): Promise<AuthorizedUser> {
sed -n '451,454p' src/lib/supabase/auth.ts
export async function requireOwner(): Promise<AuthorizedUser> {
  return requireUser();
}
```
`requireOwner()` returns `requireUser()` verbatim; `auth.ts:439-449` documents it
as a tracked temporary alias, and the ones that reach an owner-private secret must
migrate to `requireAppOwner()` explicitly.

**Ruling for wave 2's new reader.** `getEffectiveGradeBoundAction` MUST call
`requireUser()` directly, not `requireOwner()`. Reasons:

- The bound it returns is a non-sensitive config integer
  (`getGeminiMaxSubmissions()` -> `process.env.GRADE_MAX_SUBMISSIONS` or
  `DEFAULT_MAX_SUBMISSIONS = 40`, `gemini.ts:32,129`). It is not an
  owner-private secret, so `requireAppOwner()` would be oddly MORE restrictive
  than grading itself is.
- The grading action beside it, `gradeCapturedSubmissionsAction`, guards with
  `await requireOwner()` (`grading-submission-grade.ts:141`) = `requireUser()`.
  A reader that only exposes a bound the grade path already honors must be no more
  restrictive than that path. `requireUser()` is the honest, matching level.
- Writing `requireUser()` rather than the deprecated alias is the correct target
  of the auth migration, not a new debt.

This plan does NOT migrate the existing `gradeCapturedSubmissionsAction` guard
(out of A38's charter; wave 1 only corrects that file's stale HEADER comment,
scope section 7.2). The asymmetry - existing action uses the alias, new reader uses
the honest name - is intentional and strictly no-more-restrictive.

**Security obligations for wave 2's action (reworded from the scope's
"confirm its `requireOwner` guard holds" to `requireUser`):**

- Guard test: `grading-submission-grade.test.ts` asserts
  `getEffectiveGradeBoundAction` calls `requireUser()` (an unauthenticated caller
  throws), and returns the bound with `getGeminiMaxSubmissions` mocked low (the
  `:288-331` pattern) - this is AC-3's N=min instrument half.
- `action-guard-coverage.test.ts` must include `getEffectiveGradeBoundAction` in
  its guarded-surface set. That test already recognises `requireUser()` as a
  valid guard (`BARE_REQUIRE_USER_CALL = /\brequireUser\s*\(/` at `:71`, and its
  `:64-68` note states `requireOwner()` is a bare `return requireUser()` alias),
  so a `requireUser()`-guarded action is accepted with no matcher change.
- `use-server-exports.test.ts` (walks `"use server"` files): the action module
  keeps exporting ONLY async functions - the new reader is `async`.
- Only a config integer egresses; no model-authored text reaches the DOM
  (scope section 11).

---

## 3. The panel ceiling and the extraction plan

Wave 0 is scope section 2.3's extraction of `GradingCaptureStatus.tsx` (the
`<video>` preview, the timer/count/extracting/catching-up status column, the
throttled visually-hidden live region, the `stalled` notice, the readings-merged
hint, plus `fmt()`). It is the LAST unpinned panel block the scope could find
(scope section 2.3's per-block pin table; RES-A38-6). It is a PURE MOVE - no
behaviour change, no new state, every read becomes a prop, hooks stay in the panel
(scope section 2.4).

- Projected net: -62 lines -> panel ~915 (scope section 2.3/6.3). **This is a
  PROJECTION over a block measured at the revision-2 HEAD; the wave-0 implementer
  RE-MEASURES the block line numbers before extracting and the panel count after,
  with `PS> @(Get-Content ...).Count` at the P-8 gate.** RES-A38WP-1.
- Wave 1 adds ~24 lines to the panel (scope section 6.3) -> ~939. Wave 2 adds ~6
  -> ~945. All under 1000, all PROJECTIONS; P-8 is the authority at each gate.
- **Ruling 1's escape, carried not resolved:** if wave 0's measured result leaves
  under ~50 lines of headroom for wave 1's ~24 plus wave 2's ~6, a SECOND
  extraction is scoped and the feature waits (scope section 2.3, section 6.1 gate;
  round-2 Ruling 7). This plan does not pre-authorise wave 1 past a thin margin.

No `.ts/.tsx` A38 touches is projected over 1000; the two new leaf files
(`grade-lock.ts`, `useGradingRowGrade.ts`) and `grading-dispatch.ts` additions are
small. P-8 measures each touched file at each wave gate.

---

## 4. The wave cut (write sets derived, exports, callers, pure/surface, gateable)

Write set = the files a wave EDITS/ADDS plus the tests that read those files AS
SOURCE TEXT (filename-named) or that DISCOVER them by walking a directory. The
walker set is scope section 6.5's derivation, inherited and not re-derived here
(the scope pasted both the filename grep and the 12 walkers whose root reaches
A38's new files); this plan names, per wave, which of them the wave's files newly
enter.

| Wave | Write set (edited/new source + owned tests) | Exports | Caller of each export | Pure/surface | Independently gateable? |
|---|---|---|---|---|---|
| **0 - extraction (pure move)** | NEW `GradingCaptureStatus.tsx`; EDIT `GradingRecordingPanel.tsx` | `GradingCaptureStatus` component + ~9 props | `GradingRecordingPanel.tsx` mounts it (IN THIS WAVE) | surface move; behaviour unchanged | YES - the full section 6.5 suite green with NO test edited (P-0), + P-8 |
| **1 - single-row path, end to end** | EDIT `grading-dispatch.ts`, `grading-rows.ts`, `useGradingRows.ts`, `GradingRecordingPanel.tsx`, `GradingTable.tsx`, `GradingTableRow.tsx`, `grading-submission-grade.ts` (header comment only); NEW `grade-lock.ts`, `useGradingRowGrade.ts`; OWNED tests `grading-dispatch.test.ts`, `grading-rows.test.ts`, `GradingRecordingPanel.wiring.test.ts`, `grading-submission-grade.test.ts`, NEW `grade-lock.test.ts`, NEW `useGradingRowGrade.wiring.test.ts` | `buildSingleSubmission` (Unit 1), `gradingRowGradeAction` (eligibility), `createGradeLock` (Unit 3), `setGradingRowState`, `markRowState`, `useGradingRowGrade` | each pure unit is called by `useGradingRowGrade` (IN THIS WAVE); the hook is called by `GradingRecordingPanel.tsx` (IN THIS WAVE); the shared lock is also claimed by `handleGradeAll` (IN THIS WAVE) | pure-logic units = vitest; hook composition = reading/wiring vitest + owner runtime; button/offer render = owner | YES - caller-complete within the wave |
| **2 - rubric provenance + spend cap** | EDIT `grading-row.ts`, `grading-dispatch.ts`, `grading-rows.ts`, `grading-row-serialization.ts`, `grading-submission-grade.ts`, `GradingRecordingPanel.tsx`, `useGradingRowGrade.ts`, `GradingTable.tsx`, `GradingTableRow.tsx`; OWNED tests `grading-row-serialization.test.ts`, `grading-submission-grade.test.ts`, `action-guard-coverage.test.ts`, `grading-dispatch.test.ts`, `grading-rows.test.ts`, `grading-row.test.ts` | `recordGradeDispatch`, `beginGradeAttempt` (Unit 2), `computeGradeConfirmThreshold`, `sumGradeAttempts`, `requiresGradeConfirm`, `getEffectiveGradeBoundAction` (requireUser) | counter/threshold leaves called by `useGradingRowGrade` + `GradingRecordingPanel.tsx` (IN THIS WAVE); `getEffectiveGradeBoundAction` fetched on mount by `GradingRecordingPanel.tsx` (IN THIS WAVE) | pure-logic (counter, threshold, wire round-trip, divergence condition, mocked-bound action) = vitest; confirm/hint render + disabled states = owner | YES - caller-complete within the wave |

**Dependency order and why each ordering is necessary:**

- **0 -> 1 -> 2, strictly sequential.** Wave 0 must precede wave 1 because wave 1
  adds ~24 lines to a panel that is 977/1000 - the ceiling forbids the addition
  before the extraction (Ruling 1). Wave 1 must precede wave 2 because wave 2's
  counter (`beginGradeAttempt`), digest and confirm all UPGRADE wave 1's hook,
  its dispatch write, and its row props - wave 2 edits the same hook, panel, row,
  table, `grading-dispatch.ts`, `grading-rows.ts` and action that wave 1 creates
  or edits (section 5's ten-path intersection).
- **No two A38 waves may run concurrently.** All three share
  `GradingRecordingPanel.tsx`; waves 1 and 2 share ten paths (section 5). A
  parallel fan-out here is the exact `no-git-stash-under-concurrency` /
  `wave-gate-git-status` hazard - two implementers on the same panel. One
  implementer, one wave at a time, gate between each.
- **Splitting the pure leaves into their own earlier wave was considered and
  rejected.** It would ship `buildSingleSubmission` / `createGradeLock` /
  `gradingRowGradeAction` with no PRODUCTION caller (only their tests) until a
  later wiring wave - a dead export, and the exact "shipped but uncited" trap the
  seat brief names. Since the files overlap anyway (no concurrency is bought), the
  split adds a wave and a dead-export window for zero reviewability gain. Keeping
  each wave caller-complete is the stronger cut.

**The caller rule, satisfied.** Every export above has its production caller in
the SAME wave (the "Caller of each export" column). No wave uses the type-only
exception (`seats.md`); all three emit runtime code, so each names its in-wave
caller explicitly. The whole A38 chunk lands as its own pushes (one per wave gate,
per the loop's per-wave discipline), so no export ships without its caller.

---

## 5. Disjointness computation (BOTH senses), pasted

**Sense one - exact path.** Bash tool, HEAD 2026-09-29 (`w0`,`w1`,`w2` are the
three write sets of section 4, source + owned tests):

```
$ comm -12 <(sort w0) <(sort w1)
src/app/components/grading-recording/GradingRecordingPanel.tsx
$ comm -12 <(sort w0) <(sort w2)
src/app/components/grading-recording/GradingRecordingPanel.tsx
$ comm -12 <(sort w1) <(sort w2)
src/app/actions/grading-submission-grade.test.ts
src/app/actions/grading-submission-grade.ts
src/app/components/grading-recording/GradingRecordingPanel.tsx
src/app/components/grading-recording/GradingTable.tsx
src/app/components/grading-recording/GradingTableRow.tsx
src/app/components/grading-recording/grading-dispatch.test.ts
src/app/components/grading-recording/grading-dispatch.ts
src/app/components/grading-recording/grading-rows.test.ts
src/app/components/grading-recording/grading-rows.ts
src/app/components/grading-recording/useGradingRowGrade.ts
$ cat w0 w0 | sort | uniq -d          # canary: a duplicated set must print its paths
src/app/components/grading-recording/GradingCaptureStatus.tsx
src/app/components/grading-recording/GradingRecordingPanel.tsx
```

The intersections are NON-EMPTY. This is the finding, not a defect: the three A38
waves share files, so they are strictly sequential (section 0.2). The canary
confirms the instrument prints overlaps when they exist, so the empty result
between, e.g., wave 0 and A38's non-panel files is a real absence.

**What this means for the queue.** A38's entire write set is confined to
`src/app/components/grading-recording/*`, `src/app/actions/grading-submission-grade*`,
and `src/app/actions/action-guard-coverage.test.ts`. Any item dispatched
CONCURRENTLY with A38 must avoid every path in `w0 U w1 U w2`. That disjointness
check is the orchestrator's at dispatch time; this plan states the set so it can
be made.

**Sense two - informational.** Does any wave design against a fact another wave
is chartered to change? Computed from each wave's stated write set:

| Wave | Facts it assumes to start | Established by | Coupled? |
|---|---|---|---|
| 0 | the capture-status block is the last UNPINNED panel block; behaviour is pure-movable | scope section 2.3 (measured pins) + shipped panel | No incoming; ESTABLISHES the post-extraction panel size/shape wave 1 consumes |
| 1 | the post-extraction panel (wave 0), `checkGradingReadiness` in `grading-dispatch.ts`, `classifyGradingResult`/`applyGradingResultToRow` in `grading-rows.ts`, `ConfirmArmButtons` in the row, the action's one-element-array tolerance (`slice(0, maxSubmissions)`, `maxSubmissions>=1`) | wave 0 + shipped tree | Directional on wave 0; ESTABLISHES the hook, the shared lock, the row props wave 2 consumes |
| 2 | wave 1's `useGradingRowGrade`, its `setGradingRowState` dispatch write (upgraded to `beginGradeAttempt`), the row's 3 props (extended by 2), the action module, `fnv1aHash` in `generation-diag`, `getGeminiMaxSubmissions` server-only | wave 1 + shipped tree | Directional on wave 1 |

No wave designs against a fact a CONCURRENT wave changes, because there are no
concurrent waves. Each downstream wave designs against the PRIOR wave's landed
output, which is why the order is forced. The one informational hazard the scope
already caught and dissolved: wave 2's spend count must NOT be threaded through
`classifyGradingResult` (which runs only on success), or a failing row never
counts toward N (round-2 Ruling 6) - wave 2 writes the count via
`beginGradeAttempt` BEFORE the await, and `classifyGradingResult` carries only the
digest (scope section 4.6 Unit 2, section 6.4).

**Concurrency guard, stated even though no A38 wave is concurrent:** no A38 wave
runs `git add -A` or `git stash`; each stages the EXPLICIT paths of its write set
(`no-git-stash-under-concurrency`). `docs/BACKLOG.md` and `docs/REGRESSION.md` are
the orchestrator's, never written by an A38 wave. Every wave gate reads
`git status --short` against its write set (`wave-gate-git-status`) and confirms no
`.claude/worktrees` copy was edited (`stale-worktree-shadows-glob`).

---

## 6. The three pure units and the bound-reader - where each lands

Per scope section 4.6 and RES-A38AC-2; this repo's vitest is `environment: "node"`
and drives NO hook, so AC-1/AC-3/AC-8's MACHINE instruments need each behaviour in
a plain, node-callable unit.

| Unit / reader | File (home) | Test file | Wave | AC / instrument |
|---|---|---|---|---|
| **Unit 1** `buildSingleSubmission(row): {id, studentName, submissionText, submissionKind}` - returns ONE submission (the element type of the action's `submissions` array, `grading-submission-grade.ts:132`), not an array; multiplicity is unrepresentable at the builder | `grading-dispatch.ts` (existing leaf) | `grading-dispatch.test.ts` | 1 | AC-1 (stronger form: signature admits one row + direct-call id proof); P-1 |
| eligibility `gradingRowGradeAction(row, rubricPresent): {gradeable, label}` (pending/failed/ready eligible; grading disabled) | `grading-dispatch.ts` | `grading-dispatch.test.ts` | 1 | P-6 (`failed` MUST be eligible - the bound-overflow remedy) |
| `setGradingRowState(row, state): {...row, state}` (state-only write - B4; the AC-3 error-outcome entry point) | `grading-rows.ts` | `grading-rows.test.ts` | 1 | AC-3 counter-survives-error, P-7 |
| **Unit 3** `createGradeLock(): GradeLock {acquire(): boolean; release(): void; isHeld(): boolean}` - atomic check-and-set, mutates nothing on refusal | NEW `grade-lock.ts` | NEW `grade-lock.test.ts` | 1 | AC-8 (acquire / refuse-while-held / release / acquire-succeeds), P-4 + sabotage |
| **Unit 2** `recordGradeDispatch(count?): number` and `beginGradeAttempt(row): {...row, state:"grading", gradeAttempts: recordGradeDispatch(...)}` - the ONE pre-await mutation, so the count survives an error | `grading-dispatch.ts` | `grading-dispatch.test.ts` | 2 | AC-3 (increments on DISPATCH, Ruling 6) |
| threshold leaves `computeGradeConfirmThreshold(totalCount, effectiveBound): Math.min(totalCount, effectiveBound ?? totalCount)`, `sumGradeAttempts(rows)`, `requiresGradeConfirm(total, n): total >= n` | `grading-dispatch.ts` | `grading-dispatch.test.ts` | 2 | AC-3 N=min, P-13 |
| **bound-reader** `getEffectiveGradeBoundAction(): Promise<{bound: number}>` returning `getGeminiMaxSubmissions()`, guarded by **`requireUser()`** (section 2) | `grading-submission-grade.ts` (same `"use server"` module) | `grading-submission-grade.test.ts` + `action-guard-coverage.test.ts` | 2 | AC-3 N=min server half; security obligations section 2 |

The thin hook `useGradingRowGrade` (NEW, wave 1) holds one `createGradeLock()`
instance in a `useRef` and returns it so `handleGradeAll` shares the SAME lock; it
composes the pure units and adds only the state setters and the `await` - no logic
a test must reach through it (scope section 4.6). Its wiring test
(`useGradingRowGrade.wiring.test.ts`, reading-only) pins the composition (one-element
array literal `[buildSingleSubmission(row)]`, `beginGradeAttempt` before the await,
shared lock, `classifyGradingResult` reuse); the MACHINE assertions live in the
pure-unit tests, never in a driven hook.

**The single-row CALLER (wave 1), per the brief:** the per-row control sends
exactly `[buildSingleSubmission(row)]` - one row, a one-element array literal, never
`gradingRows.rawRows`. Grade-all is preserved unchanged and still builds from the
whole table (`:638`, AC-2); no path silently regrades a prefix (A31/A34 invariant,
AC-4). The per-row lock is the same instance `handleGradeAll` claims, released in
`finally`, acquired only AFTER the readiness refusal returns, so a refused press
holds nothing and never deadlocks (AC-8; scope section 4.5's corrected snippet).

---

## 7. Gates per wave

Every wave also runs the repo-wide gates once: `npx tsc --noEmit --incremental false`
(no output); `npm run lint` (exit 0, no NEW warning in the wave's files); the build
COMPILE-LINE `Compiled successfully` (not the exit code, per `push-without-full-build`);
and gates on the tree (`git status --short` vs the write set; no `.claude/worktrees`
copy edited). Any command naming two or more test files uses
`npm run test:paths -- <p1> <p2> ...`, never a raw multi-path `vitest`
(`test-paths-wrapper`; `docs/loop/this-repo.md` section 1). Exit code is read from a
file, never from a pipe.

**Wave 0 gate (a pure move is only proven by the WHOLE suite passing unchanged).**
P-0 + P-8:
- The full scope-section-6.5 VERIFY GATE (the 37-path `npm run test:paths -- ...`
  command pasted at `docs/a38-scope.md:1158`) is GREEN with **no test file edited
  in wave 0**. A pass means the capture-status behaviour moved with zero assertion
  changed; RED anywhere means the move was not a move.
- `PS> @(Get-Content src/app/components/grading-recording/GradingRecordingPanel.tsx).Count`
  and `@(Get-Content .../GradingCaptureStatus.tsx).Count` - both <= 1000; the panel
  number SETS wave 1's budget (Ruling 7). Pass = panel measurably below the pre-wave
  977 with the projected ~50+ headroom; if not, escalate the second extraction.
- New file joins the walkers `file-size-ceiling.structure.test.ts`,
  `no-emojis.test.ts`, `source-bytes.structure.test.ts`, and (being under
  `SECTION_4_DIRS`) `buttonVariant.test.ts` - all green.

**Wave 1 gate.** Focused, then item-level:
```
npm run test:paths -- src/app/components/grading-recording/grading-dispatch.test.ts src/app/components/grading-recording/grade-lock.test.ts src/app/components/grading-recording/grading-rows.test.ts src/app/components/grading-recording/useGradingRowGrade.wiring.test.ts src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts src/app/actions/grading-submission-grade.test.ts src/app/components/ui/buttonVariant.test.ts src/app/components/ui/confirmArmButtons.test.ts src/app/components/grading-recording/submission-kind-callsites.structure.test.ts src/lib/use-server-exports.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/lib/canvas-client-boundary.transitive.test.ts src/lib/grade/grade-result-doors.wiring.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts
```
Pass looks like: P-1 (`buildSingleSubmission` returns one submission, id === row's;
call site wraps `[...]`, never `rawRows`); P-2 (hook routes `result.results[0]`
through the shared `classifyGradingResult`); P-4 (`grade-lock.test.ts`
acquire/refuse-while-held/release/acquire-succeeds + sabotage RED); P-5 (fourth
cohort-clear pin present; both paths share the lock); P-6 (`failed` eligible); P-7
(state round-trip blanks no scored field). AC-2: grade-all's whole-table assertions
UNCHANGED (a loosened one is a fail). Fence 3: no `variant="contained"`,
`variantFor(`, `idleVariant="contained"` in the new/edited markup. Then
`npx tsc --noEmit`, the build compile-line, `git status --short` == wave 1's set.

**Wave 2 gate.** Focused, then the FULL section-6.5 verify gate as item regression:
```
npm run test:paths -- src/app/components/grading-recording/grading-dispatch.test.ts src/app/components/grading-recording/grading-rows.test.ts src/app/components/grading-recording/grading-row.test.ts src/app/components/grading-recording/grading-row-serialization.test.ts src/app/actions/grading-submission-grade.test.ts src/app/actions/action-guard-coverage.test.ts src/lib/use-server-exports.test.ts src/app/components/ui/confirmArmButtons.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts
```
Pass looks like: P-11 (`fromWire(toWire(row))` preserves both new fields;
`EXPECTED_WIRE_KEYS` 19 -> 21 in the same commit); P-12 (divergence hint does NOT
fire on a legacy row with `undefined`/`""` digest, watched RED without the non-empty
guard - M9); P-13 (`computeGradeConfirmThreshold(200,3)===3`,
`(2,40)===2`, `(200,null)===200`; `getEffectiveGradeBoundAction` returns the low
bound with `getGeminiMaxSubmissions` mocked); the `requireUser()` guard test and
`action-guard-coverage` inclusion (section 2). Then run the full scope-section-6.5
37-path verify gate GREEN, `npx tsc --noEmit`, the build compile-line,
`git status --short` == wave 2's set.

**Sabotage (test seat, mandatory, per unit):** `grade-lock.ts` always-`true`
`acquire()` or dropped `release()` -> `grade-lock.test.ts` RED (P-4);
`beginGradeAttempt` moved after the await / refunding on error -> AC-3 counter test
RED; drop the digest non-empty guard -> P-12 RED.

---

## 8. Line-shift and revertibility obligations this plan creates

- **Wave 0 shifts every panel line below the extraction point.** The scope's
  section 2.3 block addresses and THIS plan's citations
  (`handleGradeAll:621`, `submissions:638`, `classify:677`) are revision-2/HEAD
  addresses that MOVE after wave 0. DELTA: unknown until measured (net ~-62).
  OWNER: the wave-0 implementer re-measures the block before extracting; the wave-1
  briefer/implementer re-derives every panel line from the post-wave-0 tree, never
  from these citations. The wiring-test pins locate handlers by LITERAL text over
  a balanced body (`GradingRecordingPanel.wiring.test.ts:186-191`), so they survive
  the shift - but any citation-by-line does not. RES-A38WP-1.
- **Wave 1 adds the fourth cohort-clearing pin** to
  `GradingRecordingPanel.wiring.test.ts` in the SAME commit as the lock-refusal
  exit (scope section 4.5). Three pins today (`:349,:355,:361`); leaving the fourth
  unpinned ships a panel exit that strands the previous run's trends on a click
  that did nothing. OWNER: wave-1 implementer.
- **Wave 2 bumps two exact-set canaries in the same commit as the fields:**
  `EXPECTED_WIRE_KEYS` 19 -> 21 (`grading-row-serialization.test.ts:707-731`,
  asserted `:735,:740`), and `action-guard-coverage` gains
  `getEffectiveGradeBoundAction`. A field added without the wire-key bump goes RED;
  that is the intended coupling, not a hazard, but it MUST be one commit. OWNER:
  wave-2 implementer.
- **Not trivially revertible:** wave 2's two wire keys (revert leaves them in
  stored JSON - `fromWire` ignores extras, so safe but not cleaned),
  `classifyGradingResult`'s new second parameter (two production callers), and
  `getEffectiveGradeBoundAction` (a `"use server"` export + the panel mount fetch,
  revert both files together). Wave 0 (pure move) and wave 1's remainder revert per
  file (scope section 9).

---

## 9. Pure-logic (vitest) vs surface (owner-verification) split

- **Machine-checkable here (vitest, node, mocked action/`callLlm`):** wave 1's
  `buildSingleSubmission`, `gradingRowGradeAction`, `createGradeLock`,
  `setGradingRowState`, the hook-composition READING pins (P-1,2,4,5,6,7); wave 2's
  `recordGradeDispatch`/`beginGradeAttempt`, `computeGradeConfirmThreshold`/
  `sumGradeAttempts`/`requiresGradeConfirm`, the wire round-trip, the divergence-hint
  CONDITION, and `getEffectiveGradeBoundAction` with the bound mocked (P-11,12,13);
  wave 0's whole-suite-unchanged proof (P-0) and the line counts (P-8).
- **OWNER-VERIFICATION only (nothing renders under this vitest; no API key;
  network blocked):** the per-row button rendering, its three disabled reasons
  (no rubric -> absent; this row grading -> `Grading...`; lock held elsewhere ->
  disabled), the offer line's appearance beside the control, the arm/confirm dialog
  above N arming/announcing/cancelling, the divergence hint appearing, the
  `Grading` badge, wave 0's moved live region still announcing, non-interleave at
  runtime, and whether a real single-row call returns useful feedback (model
  QUALITY). These are RES-A38-5 and RES-A38AC-4/5 (scope section 10, AC residuals).
  No requirement in this plan names a render as its enforcer.

---

## 10. Residual register (owner, instrument, step - missing one is a deletion)

Inherited residuals are NOT re-owned here; they stay filed under the AC and scope
and the orchestrator carries them to `docs/BACKLOG.md`. This plan adds two of its
own and RE-STATES the open items it does not close.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-A38WP-1 | Wave 0's post-extraction line counts are PROJECTIONS (~915 panel, from a rev-2-HEAD block); the real numbers set wave 1's budget and gate the second-extraction escape | Wave-0 implementer | `PS> @(Get-Content .../GradingRecordingPanel.tsx).Count` at the P-8 gate, vs 1000 and vs the ~50-line headroom wave 1+2 need | Measured at the wave-0 gate BEFORE wave 1 is briefed; feature waits if thin (Ruling 1 / round-2 Ruling 7) |
| RES-A38WP-2 | Round-2 Rulings 7, 10, 11 are OPEN and this plan does not close them (scope section 12): Ruling 7 (state the wave-0 extraction gate as ONE derived number - partly overtaken by section 3's projection but still owed a single stated gate number at wave 0); Ruling 10 (the offer sentence's split placement vs P-9's "same conditional expression"); Ruling 11 (button-reasoning correction, design unchanged) | Repo owner / next A38 activity | The scope's section 12 statement of each; P-9's reachability pin for Ruling 10 | Not this plan; recorded so the next A38 activity does not treat them settled |
| RES-A38WP-3 | OQ-1 (cap applies per-row only) and OQ-2 (one-row-under-bound is INTENDED) are AC open questions; the scope adopted the recommended readings (per-row-only count, section 5.1; overflow remedy intended, section 4.1) and this plan builds to them | Repo owner | AC OQ-1/OQ-2 terminating answers | Owner confirmation; a "both" answer for OQ-1 would add a grade-all guard to wave 2 (a one-value change), a "guard it" for OQ-2 adds a single-row cap to AC-5 |

**Carried, already filed (not re-owned):** RES-A38-2 (bulk press discloses no
count), RES-A38-4 (`fmt` duplicated across four panels), RES-A38-5 (all UI claims
are reading claims - owner browser), RES-A38-6 (panel headroom after A38),
RES-A38-7 (wider non-persistence class); and the AC residuals RES-A38AC-1..7. All
must land as `docs/BACKLOG.md` rows via the orchestrator (this seat writes no
backlog under concurrency).

---

## 11. Disposition table

Not applicable: this is the FIRST wave plan for A38. `docs/a38-scope.md` rev 3 is
the architecture artifact it consumes, not a prior plan, so there is no prior wave
plan to map to kept / handed-over / withdrawn. The one place this plan OVERRIDES
the scope - `getEffectiveGradeBoundAction`'s guard, `requireOwner` -> `requireUser`
- is stated inline in section 2 and section 6 rather than in a disposition row, with
the measurement (`auth.ts:451` is a bare `return requireUser()` alias) that forces it.

---

## 12. Instruments used in this pass

Reproducible from the repo root at HEAD, 2026-09-29.
```
wc -l src/app/components/grading-recording/GradingRecordingPanel.tsx        -> 977
PS> @(Get-Content .../GradingRecordingPanel.tsx).Count                      -> 977 (agrees)
PS> @(Get-Content .../GradingTable.tsx).Count                              -> 289
PS> @(Get-Content .../GradingTableRow.tsx).Count                           -> 329
PS> @(Get-Content src/app/actions/grading-submission-grade.ts).Count        -> 214
PS> @(Get-Content src/lib/supabase/auth.ts).Count                          -> 474
grep -nE "export async function (requireUser|requireAppOwner|requireOwner)" src/lib/supabase/auth.ts -> :328,:408,:451
sed -n '451,453p' src/lib/supabase/auth.ts                                 -> requireOwner returns requireUser()
grep -n "BARE_REQUIRE_USER_CALL" src/app/actions/action-guard-coverage.test.ts -> :71 (requireUser recognised)
grep -n "handleGradeAll = useCallback|rawRows.map|classifyGradingResult(" .../GradingRecordingPanel.tsx -> :621,:638,:677
ls .../grade-lock.ts .../useGradingRowGrade.ts                             -> No such file (NEW)
ls .../grading-dispatch.ts                                                 -> exists (EDITED)
EXPECTED_WIRE_KEYS (grading-row-serialization.test.ts:707-731)             -> 19 keys (-> 21 wave 2)
cohort-clear pins (GradingRecordingPanel.wiring.test.ts)                   -> :349,:355,:361 (three; +1 wave 1)
comm -12 / uniq -d over w0,w1,w2 (section 5)                               -> panel shared by all; w1 INT w2 = 10 paths; canary prints dups
```
Files opened directly for this pass: `docs/a38-acceptance-criteria.md`;
`docs/a38-scope.md` (full, both pages); `docs/pres-2-s6-plan.md` (house format);
`src/app/components/grading-recording/GradingRecordingPanel.tsx`,
`GradingTable.tsx`, `GradingTableRow.tsx`, `grading-rows.ts` (targeted),
`grading-row-serialization.test.ts`, `GradingRecordingPanel.wiring.test.ts`
(targeted); `src/app/actions/grading-submission-grade.ts`,
`action-guard-coverage.test.ts`; `src/lib/supabase/auth.ts`.

Line counts use `@(Get-Content).Count`, the mandated PowerShell instrument; an
implementer re-measures before trusting any headroom, since it and
`Measure-Object -Line` disagree by up to 42 on one file in this repo
(`docs/loop/this-repo.md` section 3). On `GradingRecordingPanel.tsx` both tools
returned 977, so the extraction arithmetic rests on an agreed number.
