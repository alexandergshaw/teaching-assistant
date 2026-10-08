# Regrade a file submission after a batch has been graded - scope + wave plan

Owner request (direct chat, 2026-10-08), verbatim: "i need a way to regrade
file submissions once an overall batch has been graded".

Author: loop-architect (SHAPE pass). This document is the architecture + wave
plan only. It does NOT author the acceptance criteria (loop-ac), the leverage
claim (loop-ac), the oracle/test code (loop-test-author / loop-implementer), or
production code. A fresh loop-checker reads this before any consumer does.

All quantities below name the command that produced them, measured in this
checkout at HEAD ~fa0b6370 on 2026-10-08. Re-measure if the tree has moved.

---

## 0. Surface and scope boundary

- **Surface:** the chat grading sub-tab only - `GradingChatPanel`
  (`src/app/components/grading-chat/GradingChatPanel.tsx`), the `GradingResults`
  table it mounts (`src/app/components/GradingResults.tsx:350`), both driven by
  `useContinuousGradingRun` (`src/app/components/grading-chat/useContinuousGradingRun.ts`).
- **"Batch":** the file submissions dropped/submitted into one chat session,
  each graded into one row keyed by a driver `sourceIndex`.
- **The ask:** RE-GRADE a submission AFTER it already produced a grade (the
  grade looks wrong, or the instructor wants another pass). This is distinct
  from the existing retry-on-FAILURE path, which only re-runs rows whose result
  is `ungraded`.
- **Out of this scope (filed as follow-ups in section 9):** regrade-all /
  regrade-selected; regrading on the three non-chat mounts; picking up a changed
  rubric or harshness on regrade.

**Leverage note for loop-ac (not authored here):** the mechanism this feature
builds is that the app RETAINS the exact request body of every row
(`retainedBodiesRef`, driver `:150`) keyed by a stable `sourceIndex`, and the
merge is keyed by that index so a re-run REPLACES the one row in place. A chat
cannot re-run one past paste and overwrite that exact prior row in a held batch;
it answers again in a new message and the batch's one-row-per-submission
structure is gone. loop-ac owns whether this is EARNED or inherited and owns the
removal test; it is named here only so the criteria seat does not have to
re-derive the mechanism.

---

## 1. What already exists (verified against the tree, every cite opened)

| Fact | Evidence (opened) |
|---|---|
| The retained body per row | `useContinuousGradingRun.ts:150` `retainedBodiesRef = useRef<Map<number, GradeRunItemRequestBody>>(new Map())`; set per dispatch at `:340` `retainedBodiesRef.current.set(sourceIndex, body)` |
| Retained body of a GRADED row survives | `retainedBodiesRef` is cleared ONLY in `reset()` at `:373` (`retainedBodiesRef.current = new Map()`). Grading a row does not clear it. So a graded row's body is still present and re-dispatchable. |
| `retry()` bails on a graded row | `:360-368`. Guard at `:362` `if (!body \|\| pendingRef.current.has(sourceIndex)) return;` then `:364` `if (!arrived \|\| !arrived.result.ungraded) return;` - the `!arrived.result.ungraded` clause is the exact blocker for regrading a successfully-graded row. |
| `retry()` is NOT wired to any UI | `grep -rn "\.retry(" src --include=*.tsx` returns no component call site (only the driver's own export and the lifecycle test). Unexposed capability, failure-only today. |
| The merge is keyed by `sourceIndex`, last-wins | `incrementalRunPlan.ts:176-186` `mergeArrivedResults` builds `new Map<number, GradeResult>()` and `bySourceIndex.set(item.sourceIndex, item.result)` (overwrite), returns ascending-`sourceIndex`-sorted. Comment `:172-174`: "Duplicate `sourceIndex` entries are LAST-WINS, because `Map.set` overwrites." |
| The hook's arrival recorder also replaces in place | `useContinuousGradingRun.ts:186-190` `recordArrival`: `findIndex(a => a.sourceIndex === arrived.sourceIndex)`; if `>= 0`, `arrivedRef.current[at] = arrived` (replace), else push. Comment `:184-185`: "Last-wins by sourceIndex: a retried row replaces its failed arrival so completedCount never double-counts." |
| `completedCount` is arrival-array LENGTH | `:212` `setCompletedCount(arrivedRef.current.length)`. On a replace the length is unchanged, so a re-dispatch of an already-arrived index does not inflate the count. Pinned by the lifecycle test at `:459-460`. |

Measured line counts (`@(Get-Content <file>).Count`, PowerShell, 2026-10-08):

```
src/app/components/GradingResults.tsx                                   965
src/app/components/grading-chat/useContinuousGradingRun.ts              412
src/app/components/grading-chat/GradingChatPanel.tsx                    400
src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts  624
```

`src/file-size-ceiling.structure.test.ts:41` `LIMIT = 1000`; GradingResults.tsx
is NOT in its ratchet (`grep -n "GradingResults" src/file-size-ceiling.structure.test.ts`
returns nothing), so it may grow up to 1000. 965 + the regrade additions
(~20 lines, section 5) lands near 985 - under the wall, but MEASURE after build
(section 7) and extract only if forced.

---

## 2. CRUX 1 - the driver change (RECOMMENDED: a separate `regrade`, not relaxing `retry`)

**Recommendation: add a distinct `regrade(student: string)` method; leave
`retry`'s failure-only guard untouched.** Reasons:

- `retry`'s `!arrived.result.ungraded` guard (`:364`) is its CONTRACT and is
  pinned by the lifecycle test (`:469-472` "a no-op on a graded row"). Relaxing
  it would change `retry`'s meaning and force that test to be rewritten - which
  is the "a refactor disarms the test" trap. A separate method leaves retry's
  pinned behaviour byte-identical.
- The two intents differ for the instructor: `retry` = "this one FAILED, run it
  again"; `regrade` = "this one succeeded but I want another pass". Distinct
  names keep both readable.

**Why `regrade` takes a STUDENT NAME, not a `sourceIndex`** (this resolves the
mapping crux below, section 4): the only identity a displayed table row owns is
`result.student`, and that value equals the retained body's `entry.student` by
construction (section 4 proves it), so the driver can resolve student ->
sourceIndex internally. Keeping the public key as the student name means
`GradingResults` never has to carry a `sourceIndex` it does not have.

Proposed signature and body (shape only - loop-implementer writes it):

```ts
/** Re-dispatches the retained request body of an ALREADY-ARRIVED row (graded
 *  or failed) so the SAME grading act runs again and REPLACES that row in
 *  place - same sourceIndex, no new row. A no-op if the student is unknown to
 *  this session or that row is already in flight. */
readonly regrade: (student: string) => void;

const regrade = (student: string) => {
  // Resolve student -> sourceIndex from the retained bodies (the labels are
  // unique within a session - see section 4).
  let sourceIndex = -1;
  for (const [idx, body] of retainedBodiesRef.current) {
    if (body.entry.student === student) { sourceIndex = idx; break; }
  }
  if (sourceIndex < 0) return;
  if (pendingRef.current.has(sourceIndex)) return;      // already in flight
  const body = retainedBodiesRef.current.get(sourceIndex);
  if (!body) return;
  pendingRef.current.add(sourceIndex);
  queueRef.current.push(body);
  pump();
};
```

This re-uses `pendingRef`, `queueRef`, `pump()` and `recordArrival` exactly as
`retry` does; the ONLY difference from `retry` is that it does not require the
arrived result to be `ungraded`.

---

## 3. CRUX 2 - in-place replacement: the load-bearing correctness point

The question the brief flagged: when regrading `sourceIndex`, does re-dispatch
UPDATE the one row in place, or append a second row / get refused?

**Finding at the driver layer: it UPDATES IN PLACE, by construction, today.**
A re-dispatched body arrives through the same `.then/.catch/.finally` path as
any dispatch (`:198-215`). On arrival `recordArrival` (`:186-190`) finds the
existing arrival at that `sourceIndex` and overwrites it; `mergeArrivedResults`
(`incrementalRunPlan.ts:176-186`) rebuilds from a `Map` keyed by `sourceIndex`,
last-wins. `completedCount` is `arrivedRef.current.length` (`:212`), unchanged
on a replace. So there is NO duplicate row and NO refusal at the driver. The
lifecycle test already proves this shape for the retry case (`:449-460`: one
arrival replaced by a later arrival at the same index, `results` stays length 1,
`completedCount` stays 1). **No arrival-path change is needed.**

**BUT the user-visible grade is NOT governed by the driver's `results` alone -
and this is where a naive regrade ships invisible.** `GradingResults` renders
each row's values from its own `edits` map, keyed by `result.student`
(`GradingResults.tsx:685` `const edit = edits[result.student] ?? defaultRowEdit(result)`),
not directly from `run.results`. The `edits` map is:

- seeded once, at mount and on run-IDENTITY change only
  (`:222-224` initializer, `:244-254` the `identity !== prevIdentity` block),
  where `identity = runResetKey(runKey, run)`
  (`gradingResultsHelpers.ts:747-749` returns `runKey ?? run`). On the chat
  surface `runKey` is `driver.runKey` = `"grading-chat-0"`, STABLE within a
  session (lifecycle test `:423,430`), so `edits` is re-seeded ONLY at mount,
  never when a later row arrives or a row's result changes.
- `seedEdits` (`gradingResultsHelpers.ts:280-297`) / `loadPersistedEdits`
  (`:631-647`) produce one entry per `run.results` row PRESENT at seed time,
  carrying that row's then-current `totalScore`/comments.

Consequence: for a row that was present when `GradingResults` mounted, or that
the instructor has edited, `edits[student]` SHADOWS `run.results`. A regrade
updates `run.results[thatRow]` in place, but the table keeps reading the OLD
`edits[student]` values -> **the new grade never appears.** This is the trap of
pinning a proxy one step short of the user-visible effect.

**Required fix, and it binds to `GradingResults`, not the driver:** when a
Regrade is initiated for a student, `GradingResults` must DROP that student's
`edits` entry (and `postStatus` entry). With `edits[student]` absent, the row
falls through to `defaultRowEdit(result)` (`:685`), which reads the LIVE
`run.results` row on every render (`defaultRowEdit`,
`gradingResultsHelpers.ts:315-324`, returns `total/overall/strengths/... = result.*`
and `areas: {}`, and the area cells fall back to `area.score` at `:812`). So
once the driver replaces the row in place, the table automatically shows the new
grade. This is the minimal sound mechanism and re-uses the existing fallback
path rather than adding a per-row result-diff effect.

Pass condition (object / instrument / failure direction):
- Object: the row for student S after `regrade(S)` completes, versus the new
  `run.results` entry for S.
- Instrument: the driver lifecycle test (section 6, regrade case) asserts the
  driver replaces in place with no duplicate and no count inflation; a
  `GradingResults` source-text canary (section 6) asserts the Regrade handler
  clears `edits[student]`/`postStatus[student]`.
- Fails if: a second row appears, OR `completedCount`/`results.length` grows on
  re-dispatch, OR the Regrade handler does not clear the shadowing `edits`
  entry. (The felt "the new grade is on screen" is OWNER-WALK - no component
  renders under vitest, section 8.)

---

## 4. CRUX 3 - the opt-in per-row UI control and the row -> sourceIndex mapping

### 4a. The mapping is by STUDENT NAME, and it is a sound bijection

A `GradedResult` carries NO `sourceIndex` - only the `ungraded` branch does
(`types.ts:155` NotAttemptedOutcome, `:169` GradingFailedOutcome;
`GradeResultBase` `:217-276` and `GradedResult` `:282-285` have no such field).
`mergeArrivedResults` discards the index (returns `GradeResult[]`, not pairs).
So the row cannot be mapped to a driver key by a field on the row OR by its
array position:

- **Position is unsound.** The displayed list is `visibleResults`
  (`GradingResults.tsx:530`) = `sortedResults` (a user-sortable projection,
  `useResultsSort(run)`) optionally filtered by the search box. And even
  `run.results` order is ascending-`sourceIndex` rank among ARRIVED rows only -
  while some indices are still pending there are gaps, so position != index
  value. Rejected.

- **Student name is sound.** `result.student === entry.student` on EVERY
  branch: the engine loop destructures `student` from the entry
  (`engine.ts:376` `const { student, ... } = limitedEntries[i]`) and threads it
  unchanged into `finalizeGrade(studentName, ...)` which sets `student: studentName`
  (`engine.ts:174`); the failure row uses `entry.student`
  (`incrementalRunPlan.ts:classifyItemFailure` `:207`, and `engine.ts:314`).
  The route returns `outcome.value.results[0]` from `gradeEntries([entry], ...)`
  (`src/app/api/grade-run-item/route.ts`, POST handler), so the arrived
  `result.student` is the entry's student. And the dispatched entry's student is
  the UNIQUE label `assignUnclaimedLabel` produced
  (`useContinuousGradingRun.ts:327-329`, `takenLabelsRef`), stored on the
  retained body's `entry.student` (`:330`). So student -> sourceIndex is a
  bijection within a session. The lifecycle test already pins the uniqueness
  ("Assignment 1" then "Assignment 1 (2)", `:393-396`).

**Invariant the test seat must pin** (the whole mapping rests on it): for the
chat single-entry path, the arrived `result.student` equals the retained
`body.entry.student`. loop-test-author owns an assertion of this in the regrade
lifecycle case.

### 4b. The control: a default-off `onRegrade` prop on the shared GradingResults

`GradingResults.tsx` is shared by FOUR mounts (`grep -n "<GradingResults" src --include=*.tsx`):

```
src/app/components/GithubGradingPanel.tsx:852
src/app/components/GradingTab.tsx:570
src/app/components/grading-chat/GradingChatPanel.tsx:350   <- chat (the only one passing searchable)
src/app/components/LiveFeedPanel.tsx:433
```

So the control must be OPT-IN and chat-scoped, exactly like the `searchable`
prop that just shipped (`GradingResults.tsx:176-178`). Add:

```ts
/** Opt-in, default off: when provided, each row renders a Regrade control that
 *  re-runs that row's grading in place. Only the chat grading mount passes it.
 *  Receives the row's student (the driver's bijective key - see scope 4a). */
onRegrade?: (student: string) => void;
```

Render a per-row "Regrade" button only when `onRegrade` is provided, in the
existing student-cell action cluster next to "Post to Canvas"
(`GradingResults.tsx:711-722`). Its handler:

```ts
const handleRegradeRow = (student: string) => {
  // Drop the shadowing edit so the row tracks the live run.results entry the
  // driver is about to replace in place (scope section 3). Clear post status
  // too - the posted number is now stale (same reasoning as clearPostStatus
  // on a total edit, :293).
  setEdits((prev) => { const n = { ...prev }; delete n[student]; return n; });
  clearPostStatus(student);
  onRegrade?.(student);
};
```

Wiring from the panel (the caller of the new driver export):

```tsx
<GradingResults ... searchable onRegrade={driver.regrade} />
```

The other three mounts pass nothing, so `onRegrade` is `undefined` there and no
button renders. That is the byte-identity guarantee - no behaviour added to the
non-chat surfaces; proved by `git status --short` (those three files untouched)
plus the optional source canary in section 6.

---

## 5. CRUX 4 (in-flight row state) and CRUX 5 (harshness/rubric reuse)

### 5a. In-flight state while a regrade runs

When `regrade` re-queues, `pendingRef.add(sourceIndex)` and `pump()` increment
`inFlight`; the panel's existing prominent loading block already shows the
aggregate (`GradingChatPanel.tsx:375-389`, `driver.inFlight > 0` ->
"Grading N submissions (C of D done)"). The row itself keeps showing its OLD
grade until the new arrival replaces it in place (`rebuildRun` runs in the
dispatch `.finally`, `:213`). Because `handleRegradeRow` cleared `edits[student]`
(section 4b), the row shows the live `run.results` value: old until arrival,
new after.

**Fork F-INFLIGHT (recommend the lightweight option):**
- (a) Accept the global indicator only; the Regrade button stays enabled. Risk:
  a double-click re-queues - harmless (the `pendingRef.has` guard in `regrade`
  makes the second call a no-op), but the button gives no per-row feedback.
- (b, RECOMMENDED) Disable the row's Regrade button and label it "Regrading..."
  while that row is in flight. This needs the driver to expose which students
  are pending. Add `readonly pendingStudents: ReadonlySet<string>` to the driver
  result (derived from `pendingRef` through `retainedBodiesRef` -> `entry.student`),
  and a `regradingStudents?: ReadonlySet<string>` prop on `GradingResults` that
  disables the button for members, re-using the existing per-row disabled-button
  idiom (`rowPosting`, `codeRunning[result.student]`, `:781`). This is the
  minimize-clicks-friendly, no-surprise option and stays opt-in.

This is a UX-seat call (loop-seat UX pass, wave 3) - recorded as RES-RG-1 if
deferred. Default to (b); (a) is the fallback only if the UX seat decides the
global indicator is enough.

### 5b. Harshness and rubric reuse - regrade re-runs the SAME inputs

A regrade re-dispatches the RETAINED body, which captured, at the original
dispatch, `rubric: header.effectiveRubric`, the frozen `harshness`, and
`commentSplit` (`useContinuousGradingRun.ts:330-339`). The session rubric and
instructions are locked once `sessionReady` (fields disabled,
`GradingChatPanel.tsx:281,300,324`), and harshness is captured once at
`beginSession` and frozen (`:169`, `harshnessRef`). So:

- **Expected behaviour (state in the AC):** regrade = re-run the identical
  grading request. Because the model is non-deterministic, a regrade may return
  a DIFFERENT grade for the same input - that is the point of "another pass".
- **A changed rubric is NOT picked up** (it cannot be edited mid-session) - this
  is correct and intended.
- **A changed harshness is NOT in scope (recommend NO).** Regrade reuses the
  retained body; changing harshness is a NEW session. Making regrade honour a
  new harshness would require un-freezing `harshnessRef` and re-threading it,
  which contradicts the "fields lock once ready" invariant the chat surface
  deliberately enforces. Filed as a follow-up (section 9) if the owner wants it.

---

## 6. Machine-checkable vs owner-walk

**Machine-checkable (must be green in the wave gate and verify):**

1. Driver regrade lifecycle (`useContinuousGradingRun.lifecycle.test.ts`, new
   cases, mirroring W1 oracle 5's shape). Assert, driving the MOCKED
   `dispatchItem` seam:
   - a GRADED row at sourceIndex 0 (arrive `gradedRow("Ada")`), then
     `driver.regrade("Ada")`, re-dispatches `dispatchItem` with the SAME
     `sourceIndex: 0` and the retained body (`rubric`, `pointsPossible`,
     `entry.student` all equal the original) - the regrade-is-not-a-no-op
     counterpart to the retry no-op at `:469-472`;
   - after the regrade arrival, `results.length` stays 1, `completedCount`
     stays 1, and the row's result is the NEW one (no duplicate);
   - `regrade` on an unknown student is a no-op (0 further dispatches);
   - `regrade` on a row already in flight is a no-op (the `pendingRef` guard);
   - the invariant of section 4a: the dispatched regrade body's `entry.student`
     equals the student passed to `regrade`.
   Fails if: a second arrival appears, the count inflates, or the re-dispatch
   carries a different body/sourceIndex. loop-test-author also proves the red
   tests satisfiable with a reference driver and reports any rebuilt mutant.
2. `GradingResults` wiring (source-text canary, since nothing renders): the
   Regrade button is rendered only under an `onRegrade` guard, and its handler
   clears `edits[student]` and calls `onRegrade`. Home: a new describe block in
   `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`
   (same `readFileSync`-over-`../GradingResults.tsx` idiom its FilesCell /
   Browse-all canaries already use, `:270-341`), paired with a positive/negative
   canary proving the pattern discriminates. Fails if the button renders
   unconditionally, or the handler does not drop the shadowing edit.
3. Panel wiring (source-text canary) in
   `src/app/components/grading-chat/GradingChatPanel.structure.test.ts`
   (the chat panel's existing source-pin home): the `<GradingResults` mount
   slice carries `onRegrade={driver.regrade}`. Fails if the panel stops passing
   it. (`resultsMountSlice` ends at the first `/>`, `:134-139`, so the new prop
   is inside the slice.)
4. The non-chat mounts stay unchanged: `git status --short` shows
   `GithubGradingPanel.tsx`, `GradingTab.tsx`, `LiveFeedPanel.tsx` NOT in the
   write set (section 7 wave gate). Optional reinforcing canary: assert each of
   those three mount slices does NOT contain `onRegrade`.
5. The directory's client-bundle and completeness gates still pass:
   `gradingResultsHelpersWiring.test.ts` runs the runtime-import-graph walk over
   `../GradingResults.tsx` (`:147-157`) and the CLIENT_FILES completeness sweep
   (`:236-267`). `onRegrade` is a callback prop - no new import, no new file in
   `grading-results/` - so neither trips. If option (b) of F-INFLIGHT adds a new
   leaf file under `grading-results/`, CLIENT_FILES MUST be bumped in the same
   commit (it will not under the inline plan here).
6. The 1000-line ceiling: `src/file-size-ceiling.structure.test.ts` (walks all
   of `src/`), unconditional in every gate.

**Owner-walk only (no component renders under vitest - `this-repo.md` section 6,
and MEMORY "no component is rendered"):** that the Regrade button is visible and
clickable on a graded chat row; that clicking it visibly replaces that row's
grade in place with no second row; that the in-flight affordance reads correctly;
that the button is absent on the GitHub / classic / Live Feed surfaces. Recorded
as RES-RG-2 (owner, step: live walk of the chat grading sub-tab after a batch).

---

## 7. Wave plan

**Recommendation: ONE wave.** The new export is `driver.regrade`; the
non-negotiable rule is that the wave containing a new export also contains its
CALLER. `regrade`'s caller is `GradingChatPanel` (via `onRegrade={driver.regrade}`),
and `onRegrade` cannot be wired without the `GradingResults` prop + button, which
in turn needs the `edits`-clear fix to be visible at all. Splitting would ship
`driver.regrade` with its caller depending on a prop that lives in a later wave -
dead code with every gate green, the exact failure the rule exists to prevent.
The write set is small and entirely within already-disjoint grading-chat /
grading-results files, so there is no cost to combining.

**Wave 1 (the whole feature):**

Write set:
```
src/app/components/grading-chat/useContinuousGradingRun.ts            (regrade method; F-INFLIGHT(b): pendingStudents)
src/app/components/GradingResults.tsx                                 (onRegrade prop, per-row button, edits/postStatus clear; F-INFLIGHT(b): regradingStudents)
src/app/components/grading-chat/GradingChatPanel.tsx                  (onRegrade={driver.regrade}; F-INFLIGHT(b): regradingStudents={...})
src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts   (regrade lifecycle cases)
src/app/components/grading-chat/GradingChatPanel.structure.test.ts          (panel onRegrade wiring canary)
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts      (GradingResults regrade button + edits-clear canary)
```

Nothing persisted is added (no `ta-` key), so no storage-key structure test is
touched. No sub-tab added, so `recording-split.structure.test.ts` is untouched.

Wave gate (run from PowerShell; multi-path uses the wrapper per `this-repo.md`
section "Running a named set of test files" - a raw `vitest run a b` silently
drops unmatched args):

```
npx tsc --noEmit
npm run lint
npm run test:paths src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts src/app/components/grading-chat/GradingChatPanel.structure.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts src/file-size-ceiling.structure.test.ts
git status --short
```

Pass conditions:
- tsc: no output, exit 0 (object: the typecheck; fails on any output).
- lint: exit 0, NO NEW warning in the files this wave writes, measured against
  the same command before the change - never a literal count (`this-repo.md`
  section 1).
- test:paths: a `COVERED` line for every one of the four argument paths, all
  assertions passing.
- file-size: GradingResults.tsx under 1000. Re-measure
  `@(Get-Content src/app/components/GradingResults.tsx).Count` after build; if it
  lands at ~990+, extract the student-cell action cluster into a
  `grading-results/` leaf - which then ALSO requires bumping CLIENT_FILES in
  `gradingResultsHelpersWiring.test.ts:103-127` in the same commit (the
  completeness sweep at `:236-267` enforces it). Prefer keeping the button inline
  to avoid that churn; 965 + ~20 leaves headroom.
- git status: exactly the six files above; `GithubGradingPanel.tsx`,
  `GradingTab.tsx`, `LiveFeedPanel.tsx` NOT present.

Not trivially revertible: nothing. No migration, no persisted-shape change, no
change to a shared function's signature that another surface reads (`onRegrade`
is a new OPTIONAL prop; the four-mount byte-identity holds because the three
non-chat mounts pass nothing). The smallest safe revert is reverting these six
files together.

---

## 8. What cannot be verified here

- No component renders under vitest, so the visible button, the in-place row
  swap on screen, and the button's absence on the other three surfaces are
  OWNER-WALK, not test-provable (RES-RG-2). Every UI claim in this document is a
  reading claim.
- No live model: the grade a regrade actually returns (and whether a second pass
  differs) is only exercisable through the mocked `dispatchItem` seam; real
  output needs the owner's Vercel-set `GEMINI_API_KEY` (`this-repo.md` section
  6).

---

## 9. Residual register and follow-ups

Each entry names an owner, an instrument, and the step that measures it. Any of
these not carried into `docs/BACKLOG.md` by the push is a deletion.

| id | What | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-RG-1 | F-INFLIGHT final choice: per-row "Regrading..." disabled affordance (b, recommended) vs global indicator only (a) | loop-seat UX pass (wave 3), owner ratifies | source-text canary that the Regrade button is disabled for a `regradingStudents` member | decided in the UX follow-up pass against the as-built diff; if (b), it is in THIS wave's write set |
| RES-RG-2 | Felt regrade: button visible/clickable on a graded chat row, row swaps in place, absent on the 3 non-chat mounts | owner | live walk (no render under vitest) | owner walk of the chat grading sub-tab after grading a batch |
| RES-RG-3 (follow-up) | "Regrade all" / "Regrade selected" | unowned until scoped | n/a | filed as a backlog row; per-row ships first |
| RES-RG-4 (follow-up) | Regrade on the GitHub / classic / Live Feed mounts | unowned until scoped | n/a | filed; opt-in prop makes extending it later cheap |
| RES-RG-5 (follow-up) | Regrade honouring a CHANGED harshness (recommend NO - new session instead) | owner decision | n/a | filed; contradicts the fields-lock invariant, needs a product call |

---

## 10. Forks, each with a recommendation

| Fork | Options | Recommendation |
|---|---|---|
| F-DRIVER | (a) relax `retry`'s `!ungraded` guard; (b) new `regrade` | **(b)** - keeps retry's pinned contract; clearer intent (section 2). |
| F-KEY | row -> driver by (a) position; (b) student name; (c) add sourceIndex to GradedResult | **(b)** - sound bijection (section 4a), zero blast radius; (a) is unsound, (c) touches a ~32-reader shared type for a chat-only feature. |
| F-VISIBLE | after regrade, the row reads from (a) `run.results` by clearing `edits[student]`; (b) a per-row result-diff effect | **(a)** - minimal, re-uses the `defaultRowEdit` fallback; discards manual edits on explicit Regrade, which matches "I want a fresh grade" intent (section 3/4b). |
| F-INFLIGHT | (a) global indicator only; (b) per-row disabled "Regrading..." | **(b)** - no-surprise per-row feedback, re-uses the existing disabled-button idiom; UX seat ratifies (RES-RG-1). |
| F-HARSHNESS | regrade (a) reuses retained harshness; (b) picks up a new one | **(a)** - regrade = re-run the same request; (b) is a new session (section 5b, RES-RG-5). |

---

## 11. Appendix - `owns` derivation (command + pasted output)

The write set is section 7. The source-text READERS of the edited files (tests
that `readFileSync` an edited file, so an edit can redden them even without
being in the write set) were enumerated with:

```
grep -rln "useContinuousGradingRun" src --include=*.ts --include=*.tsx
grep -rln "GradingChatPanel" src --include=*.ts --include=*.tsx
grep -rln 'GradingResults.tsx\|GradingResults"' src --include=*.test.ts
```

Output (2026-10-08):

```
# importers of useContinuousGradingRun
src/app/components/grading-chat/chatSubmissionIntake.ts
src/app/components/grading-chat/GradingChatPanel.structure.test.ts
src/app/components/grading-chat/GradingChatPanel.tsx
src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts
src/app/components/grading-chat/useContinuousGradingRun.ts

# importers of GradingChatPanel
src/app/components/grading-chat/ChatComposer.tsx
src/app/components/grading-chat/GradingChatPanel.structure.test.ts
src/app/components/grading-chat/GradingChatPanel.tsx
src/app/components/tabs/topLevelTabs.wiring.test.ts
src/app/page.tsx

# tests that read GradingResults.tsx as source text (subset that matters here)
src/app/components/grading-chat/GradingChatPanel.structure.test.ts
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
... (20 further *.test.ts read GradingResults.tsx as source; none assert on a
    Regrade control or on onRegrade, so adding an OPTIONAL prop + an
    onRegrade-guarded button leaves every one of them green - confirmed by
    reading gradingResultsHelpersWiring.test.ts, which runs the
    runtime-import-graph walk and the CLIENT_FILES completeness sweep: a
    callback prop adds no import and no file to grading-results/.)
```

Classification:
- **Owned (edited):** the six files in section 7's write set.
- **Reads an edited file as source and MUST run in the wave gate:**
  `useContinuousGradingRun.lifecycle.test.ts`, `GradingChatPanel.structure.test.ts`,
  `gradingResultsHelpersWiring.test.ts` (all in the gate, section 7), plus
  `src/file-size-ceiling.structure.test.ts` (unconditional).
- **Checked-safe (reads an edited file as source, but asserts nothing this
  change touches):** the ~20 other `*.test.ts` that read GradingResults.tsx -
  none references `onRegrade` or a Regrade control; the optional-prop +
  no-new-import shape keeps them green. The full suite (`npm test`) runs them at
  the group regression step regardless.
- **Caller of the new export, in the write set:** `GradingChatPanel.tsx`
  (`onRegrade={driver.regrade}`) - satisfies the "every wave includes the caller
  of each new export" rule.
- **Not affected:** `chatSubmissionIntake.ts` (imports a type from the driver,
  not `regrade`); `topLevelTabs.wiring.test.ts` / `page.tsx` (mount the panel,
  do not read regrade wiring).
