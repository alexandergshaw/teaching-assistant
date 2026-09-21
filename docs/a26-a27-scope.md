# A26 + A27 scope: the lifecycle of `runningFolder`

Architecture seat, 2026-09-21. Scopes backlog rows **A26** (a second "Grade
all" run can start while the first is still resolving its rubric) and **A27**
(a rejected run leaves every "Grade all" button disabled until reload)
together, because both are about when the one-run-at-a-time flag is set and
when it is released. This document decides shape. It is not a build brief:
sections 6, 9 and 10 are the build packet, and the rest is the argument,
written for the checker.

**Read at `e57b1c5`.** HEAD moved to `1fdc622` while this was written.
`git diff --stat e57b1c5 HEAD` shows only `docs/BACKLOG.md`, `docs/backlog.yml`
(the L14 row, hunk `@@ -323,7 +323,7 @@`, zero matches for `A2[67]`) and
`docs/l14-scope.md`. No `src/` path changed, so every citation below holds at
both commits. **Every source file was read from `git show HEAD:<path>`, never
from the working copy.** Another agent was sabotage-verifying A16 wave 3 in
this directory during this pass. Three times the working copy showed a `src/` file
as modified that I had not touched: `useRepoGradesBulkGrade.ts`, then
`useRepoGradesGradingActions.ts`, then `classTrendsFolderEntry.ts`.

**Headline. Every item is measured in section 2.**

1. **Both defects are REAL, and both are now shown by execution, not just by
   reading.** The hooks run in a node test with a fake React (one render = one
   hook call) and a fake `gradeRepoAction`. The race: against a pinned HEAD copy,
   two clicks during a pending rubric fetch sent **6** grading calls for **3**
   repos, each repo graded twice. The stuck flag: one rejected call left
   `bulkRunningFolder === "week-1"` and progress `{done: 2, total: 3}` on every
   later render, with **0** activity-log writes and **0** announcements.
2. **No single mechanism closes both.** Claiming the lock at click time and
   releasing it in a `finally` fixes the **flag**. It does not fix what the
   instructor **sees** in A27: the rejected repo's cell stays "Grading…", and
   the run's log and summary are never written (mutant M2, section 8). It also
   has a trap. Moving the claim ahead of the rubric fetch **without** the
   `finally` creates a NEW stuck path through the fetch (mutant M1). That is
   the "second stale-state path" the backlog rows predicted, and it is now
   measured. The fix needs three parts, and each one is killed by its own
   test: **a ref lock claimed at click, a `finally` release, and a per-target
   `.catch` that turns a rejected call into the existing failed-outcome path.**
3. **Wave 3's detectors trip in exactly four places, and all four were
   measured.** A reference change ran against the 13 test files that read or
   import these hooks, in a scratch copy of HEAD. A-2(a), A-2(b) and A-2(d) in
   `repoGradesClassTrends.wiring.test.ts` go red, and so does the AC item 50
   pin in `repoGradesRubricPicker.wiring.test.ts`. The other 438 tests stay
   green. Section 7 amends each of the four and says why. One amendment
   replaces the pinned expression **because that expression is the A26
   defect**, and it adds a canary that is the defect itself.
4. **The brief's description of wave 3's rules does not match the tree.** There
   is no try, switch or loop detector anywhere in `src/**/*.test.ts`. The only
   "exactly three" rule counts calls to `setLastRunCohort`, not references to
   the collector. Section 12 has the canaried searches.

---

## 1. The four questions, answered

| # | Question | Answer | Where |
|---|---|---|---|
| Q1 | Can the A26 race be shown without a browser? | **Yes, as hook logic.** Measured red on HEAD, green on the reference. What stays unproven is the browser's timing, which is residual RR-1 | 2.2, 8 |
| Q2 | Can a rejected server action be simulated to show the stuck flag? | **Yes.** Measured: flag stuck, progress frozen, log and announcement never written, rejected cell stuck in `grading: true` | 2.2, 8 |
| Q3 | Fix shape, and does one mechanism close both? | **No.** A ref lock claimed at click plus a `finally` closes the flag. A per-target `.catch` is also required to close what the instructor sees. The lock without the `finally` opens a new stuck path | 5, 6 |
| Q4 | What does the instructor see, before and after? | Section 4. In today's A27 the only way out is a reload, and a reload **discards every ungraded-but-scored cell of that run**, because `cellEdits` is not persisted | 4 |

---

## 2. Measurements

### 2.1 Addresses at HEAD (opened with `git show HEAD:<path> | sed -n`)

| Fact | Address |
|---|---|
| `runBulkGrade` declared | `useRepoGradesBulkGrade.ts:174` |
| The refusal guard `if (runningFolder !== null) return null;`. It reads the value captured when the render ran, not a live one | `useRepoGradesBulkGrade.ts:178` |
| The flag is set, after the guard and before any await in this function | `useRepoGradesBulkGrade.ts:182-183` |
| The per-target grading call. No `.catch` and no `try` | `useRepoGradesBulkGrade.ts:201-210` |
| The pool: `await Promise.all(...)` | `useRepoGradesBulkGrade.ts:383` |
| End of the run: `onOutcomes`, `onAnnounce`, `setRunningFolder(null)`, `setProgress(null)`, `return runResults`. The normal path only | `useRepoGradesBulkGrade.ts:385-389` |
| The handler awaits the rubric **before** `runBulkGrade` runs at all | `useRepoGradesGradingActions.ts:773-774` |
| Grade all is disabled **only** by `bulkRunningFolder !== null` | `RepoGradesGrid.tsx:334`, `:421` |
| Label while running: `Grading ${done} of ${total}…` | `RepoGradesGrid.tsx:356-357` |
| `generate` and `manual` return synchronously inside an `async` function | `useRepoGradesRubricSource.ts:652-655` |
| `assignment`, `live` and `export` check a cache before any network call | `useRepoGradesRubricSource.ts:502-503`, `:545-548`, `:605-607` |
| The resolver cannot reject: an outer `try/catch` returns a degraded rubric | `useRepoGradesRubricSource.ts:649-692` |
| `gradeRepoAction`'s server body cannot throw: outer `try` at `:697`, `catch` at `:841`. A rejection on the client can therefore come only from transport or the platform | `src/app/actions/github-repos.ts:652`, `:697`, `:841` |
| The per-cell handler has the same missing `.catch`: `grading: true` at `:264`, uncaught await at `:296-305` | `useRepoGradesGradingActions.ts:257-305` |

**Brief drift, reported rather than adopted.** The brief puts the guard
"around :174". `:174` is the function's first line and the guard is `:178`.
The brief and A27's row put the reset "around :376". At HEAD it is `:387`,
because wave 3 added lines above it. The grid citations `:334` and `:421` are
exact.

**Where the race came from** (`git log -S`). The guard arrived in `e5fb549`.
REGRESSION entry 349 already named its limit at `docs/REGRESSION.md:33453`:
"Real protection ... depends on the button being disabled while
`runningFolder !== null`". The await that opened the gap arrived in `85fa958`
(the rubric picker, AC item 50). From then on the button stays enabled for the
whole rubric fetch.

### 2.2 The probe: the real hooks, executed without a browser

**Setup.** Nothing was placed in the repo.

- `git archive HEAD src vitest.setup.ts` was extracted twice into the session
  scratchpad: `headtree0`, kept pristine, and `headtree`, which gets the
  reference change.
- Byte-identity of the two hook copies with HEAD was confirmed with `cmp`.
- A vitest config in the scratchpad points `@/` at the chosen copy. It swaps
  `react` for a render harness exposing only `useState`/`useRef`, where a
  render is one call of the hook and a setter's write is visible from the
  next render on. It swaps `@/app/actions` for a stub `gradeRepoAction`.
- The probe drives **`handleGradeColumn`**, the function `onGradeColumn`
  reaches from the button, not `runBulkGrade` directly.
- Command: `PROBE_TREE=<copy> npx vitest run --config <scratch>/probe/vitest.probe.config.mjs --reporter=verbose --silent=false`.
- It was run again with React and the actions barrel replaced by in-file
  `vi.mock`/`vi.hoisted`, which is how an in-repo test would do it
  (`<scratch>/probe2`). The verdicts were identical in both forms and against
  both copies.

**Results, pristine HEAD (`headtree0`), as printed:**

| Probe | Printed | Verdict |
|---|---|---|
| A26: click, one macrotask, a new render, a click from that render, then both rubric fetches resolve | `{"flagSeenBySecondClick":null,"resolvesStarted":2,"gradeCalls":6,"perRepo":[2,2,2]}` | **RED: race real** |
| Canary: once the flag IS in a render, a click from that render is refused | `{"flag":"week-1","callsBefore":3,"callsAfterSecondClick":3,"total":3}` | green. The harness can observe a refusal |
| A27: `gradeRepoAction` rejects for `org/b` | `{"rejection":"Error: Failed to fetch","flagAfter":"week-1","progressAfter":{"done":2,"total":3},"recordLogCalls":0,"announceCalls":0,"cellB":{..."grading":true,"gradeError":null...}}` | **RED: stuck** |
| A26b: second call from the SAME render as the first, same task, fetch pending | `{"flag":null,"progress":null}` | RED |
| A27b: the rubric thunk rejects | `{"rejected":true,"flag":null,...}` | **green on HEAD by construction**: HEAD claims the flag only after the fetch. See M1 |
| R-6: the per-cell Grade call rejects | `{"rejected":true,"grading":true,"gradeError":null,"logged":[]}` | RED: the cell stays stuck |

Totals: `Tests 5 failed | 2 passed (7)`. The same 7 on the reference copy:
`Tests 7 passed (7)`. The A26 probe then prints `"resolvesStarted":1,
"gradeCalls":3`, which means the refused click no longer fetches a rubric
either.

**What the harness models, and what it does not.** It models closure capture,
the property the race depends on. It does NOT model React's batching, its
commit timing, or StrictMode double invocation. "A click from a render taken
while the fetch is pending" is a real browser sequence for the network-backed
sources: click 1's own `setLastRunCohort(null)` (`useRepoGradesGradingActions.ts:771`)
and the resolver's `setPendingResolves((c) => c + 1)` (`useRepoGradesRubricSource.ts:520`
for `assignment`, `:565` for `live`) both schedule a render during the
fetch, and that render leaves the button enabled (`RepoGradesGrid.tsx:421`).
That the browser actually delivers the sequence is residual RR-1.

### 2.3 Which rubric sources can reach A26 (reading)

| Source | Is there an await gap before `setRunningFolder`? | Reachable by a human double click? |
|---|---|---|
| `generate`, `manual` | Microtasks only (`:652-655`) | No |
| `live`, `export` | A network gap only on a cache MISS. The preview effect (`useRepoGradesRubricSource.ts:701-733`) resolves the same key when the choice changes and fills the cache | Only if Grade all is clicked before that preview fetch returns |
| `assignment` | Keyed per column assignment (`:502-503`), so it is cold on a column's first use | **Yes: the first Grade all on each column** |

This narrows the brief's "only assignment, live and export" claim. It does
not remove the defect: `assignment` is the source the rubric picker exists
to serve.

### 2.4 A comment that would have hidden A26

`useRepoGradesRubricSource.ts:339-343` says the pending-resolve counter
"deliberately disables EVERY column's Grade button while ANY resolve is in
flight". **False in the tree.** `resolving` (`:388`) reaches `index.tsx:746`
as `rubricResolving`, and from there only `RepoGradesControls.tsx:626`, a
textarea placeholder. The command
`git grep -n "rubricResolving" HEAD -- src/app/components/repo-grades/ | grep -v test`
returns only those two files. Neither `RepoGradesGrid.tsx` nor
`RepoGradeCellControl.tsx` receives it. A reader who trusts that comment
concludes A26 is already closed. Requirement R-8 corrects it.

### 2.5 External facts, read from the installed Next (16.2.6, `package.json:29`)

- `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md:206`:
  "The client currently dispatches and awaits them one at a time." So two
  racing runs do not run in parallel. They interleave in one client queue,
  and the wall time roughly doubles along with the spend.
- `.../10-error-handling.md:340-344`: error boundaries do not catch errors in
  event handlers or async code. Today's A27 rejection is an unhandled
  rejection with no UI at all.

### 2.6 Sizes (`@(Get-Content <file>).Count`, HEAD copy versus reference copy)

| File | HEAD | Reference (code only, comment rewrites excluded) |
|---|---|---|
| `useRepoGradesBulkGrade.ts` | 393 | 397 |
| `useRepoGradesGradingActions.ts` | 796 | 795 |
| `repoGradesClassTrends.wiring.test.ts` | 441 | 452 |
| `repoGradesRubricPicker.wiring.test.ts` | 468 | 468 |

With R-8's comment rewrites added, the estimate for the bulk hook is 410-430,
far from the 1000 ceiling (`src/file-size-ceiling.structure.test.ts`, `LIMIT = 1000`).

---

## 3. Leverage: the trigger fired, and there is no claim to make

Both rows are `kind: 'bug'` (`docs/backlog.yml:471`, `:482`). `DEV_LOOP.md`,
"The loop / Criteria": a bug fix carries no leverage claim. No class from
`docs/loop/leverage.md` is claimed or implied, and no removal test is owed.

---

## 4. What the instructor sees

### A26 today (`assignment` source, first Grade all on a column)

1. They click "Grade all 12 repos in week-1". **Nothing on the button
   changes** for the length of the Canvas rubric fetch: same label, still
   enabled (`RepoGradesGrid.tsx:421`).
2. With no feedback, clicking again is the natural move, and it starts a
   second run. Every repo is graded twice: two GitHub ingests and two model
   calls each (probe: `perRepo [2,2,2]`). Because server functions queue one
   at a time (2.5), the run also takes about twice as long.
3. Each cell shows a score, returns to "Grading…", then shows a **possibly
   different** score from an independent second model call. The activity log
   gets two `grade-succeeded` rows per repo, which may disagree. The status
   line is written twice.
4. The progress label can jump backwards, because both runs write their own
   `done` into one `progress` state.
5. When the first run ends, its `setRunningFolder(null)` (`:387`)
   **re-enables every Grade all button while the second run is still
   grading**, so a third run is reachable.
6. The trends panel shows whichever run finished last.

### A26 after the fix

The next render after the click disables every Grade all button. The
clicked column reads "Grading 0 of 12…" while the rubric loads, then counts
up. A second click is impossible from the UI, and a same-frame duplicate is
refused before it fetches anything. No new copy is introduced.

### A27 today (one repo's grading request fails in transport)

Triggers: a dropped connection, a platform timeout on a long ingest plus
grade, or a deploy during the run. The instructor sees:

- The clicked column frozen at "Grading 2 of 3…" (probe: `progressAfter`).
- **Every** column's Grade all greyed out.
- The failed repo's cell stuck on a disabled "Grading…" button
  (`RepoGradeCellControl.tsx:570`, `:575`; probe: `grading: true`).
- **No error text anywhere**, no status line, no trends, and **nothing from
  this run in the activity log**, including the repos that succeeded (probe:
  `recordLogCalls: 0`).

Reading claim: the other workers keep grading in the background after
`Promise.all` rejects, and their cells fill in, but their outcomes are never
logged. The only way out is a reload. A reload **throws away every score
from the run that was not yet posted**, because `cellEdits` is plain
`useState` (`docs/REGRESSION.md` entry 434, "`cellEdits` not persisting").
The instructor pays for the whole run again.

### A27 after the fix

- The failed repo becomes an ordinary failed outcome. Its cell shows the
  error in the existing `role="alert"` span (`RepoGradeCellControl.tsx:633-636`),
  and its Grade button is live again, so a retry is one click.
- The rest of the run finishes. The log records every repo (probe:
  `grade-succeeded:org/a`, `grade-failed:org/b`, `grade-succeeded:org/c`).
- The status line reads "Bulk grading finished: 2 graded, 1 failed.", from
  the existing `bulkGradeSummaryLine`.
- All buttons re-enable, and trends appear if the leaf's own gate is met.
- If the run throws for any other reason, the `finally` still re-enables the
  buttons (probe A27b).

### R-6: the per-cell sibling

Today a transport failure on one cell's own Grade button leaves that cell on
"Grading…" forever, with no log entry. After the fix it shows the error, logs
`grade-failed` and can be retried (probe R-6).

**Error copy.** The text is `err instanceof Error ? err.message : "Grading failed."`,
matching this folder's own precedent for a rejected server call
(`RepoGradeCellControl.tsx:220-235`: "Surface a failed run ... instead of a
stuck spinner", fallback `"Run failed."`). A raw "Failed to fetch" is
accurate but technical. The UX seat owns any rewording. It must keep the
message non-empty, and it must keep it in `gradeError`, because that is
what the log's `detail` and the retry both read.

---

## 5. The shape

**The one-run invariant belongs to one object, and that object must own
EVERY await of a run, the rubric fetch included.** Today the lock lives in
the bulk hook, but the run starts in the handler: the handler awaits the
rubric and only then asks the hook for the lock. Every later wave builds on
this seam, so it moves: **the rubric fetch goes under the lock.**
`runBulkGrade` takes a thunk that it calls after claiming. The handler still
builds that thunk from `resolveRubricForColumn(column.assignmentId)`, so AC
item 50's reachability (the column's `assignmentId`, resolved once per run)
is kept word for word.

Three parts. Each is necessary, and each is shown necessary by its own
mutant (section 8):

| Part | Closes | Without it (measured) |
|---|---|---|
| **P1 Ref lock, claimed synchronously at click.** `useRef(false)`, tested and set before the first await. `runningFolder` stays as state and is DISPLAY only | A26 | M4, claim after the fetch: A26 red, 6 calls. M3, the lock kept as render state: A26b red, because two calls from one closure both pass |
| **P2 `finally` release** of the lock, `runningFolder` and `progress` | A27's flag, on every exit | M1: A27b red. P1 alone creates the new stuck path through the fetch |
| **P3 Per-target `.catch`** that maps a rejected `gradeRepoAction` to `{ error }`, the existing failed-outcome branch at `:212-216` | A27 as the instructor sees it | M2: A27a red. The cell stays "Grading…", the log is empty, no status line. The flag alone is released |

**Why a ref, when state alone might do.** With P1 claiming `runningFolder` at
click time, the button would disable on the next commit. React 19 flushes a
discrete event's updates before the next event is handled, so a real double
click would probably be refused anyway. "Probably" rests on React's scheduler,
and nothing here can observe it: no component renders. The ref makes the
refusal a property of the code, testable in node, and M3 shows the test that
tells the two apart. It costs one line. Precedent for a lock ref mutated
inside a hook's async callback: `src/app/components/bulk-repo/hooks/useCopilotAgents.ts:74`,
`:103`.

---

## 6. The contract (exact signatures)

`useRepoGradesBulkGrade.ts`. This reference was executed in the scratch copy
(section 8). Comments are omitted here; R-8 lists the ones that must change.

```ts
import { useRef, useState } from "react";

// UseRepoGradesBulkGradeResult
runBulkGrade: (plan: BulkGradePlan, resolveRubric: () => Promise<ResolvedRubric>) => Promise<readonly GradeResult[] | null>;

// inside useRepoGradesBulkGrade
const runLockRef = useRef(false);

const runBulkGrade = async (plan: BulkGradePlan, resolveRubric: () => Promise<ResolvedRubric>): Promise<readonly GradeResult[] | null> => {
  if (runLockRef.current) return null;
  runLockRef.current = true;
  setRunningFolder(plan.targets[0]?.folder ?? null);
  setProgress({ done: 0, total: plan.targets.length });
  try {
    return await gradeBulkPlan(plan, await resolveRubric());
  } finally {
    runLockRef.current = false;
    setRunningFolder(null);
    setProgress(null);
  }
};

// today's body from `const targets = plan.targets` to `return runResults`,
// minus the guard and the four flag/progress lines, which moved above
const gradeBulkPlan = async (plan: BulkGradePlan, resolved: ResolvedRubric): Promise<readonly GradeResult[]> => { ... };

// in gradeOneTarget, the one changed expression
const result = await gradeRepoAction(/* the same eight arguments */)
  .catch((err: unknown) => ({ error: err instanceof Error ? err.message : "Grading failed." }));
```

`useRepoGradesGradingActions.ts`, `handleGradeColumn`: two lines become one.

```ts
const runResults = await runBulkGrade(plan, () => resolveRubricForColumn(column.assignmentId));
```

And at `handleGradeCell` (R-6), the per-cell call gets the same `.catch`
expression.

Unchanged, and checked by the reader run in section 7:

- `establishSharedRubric`'s signature
  (`repoGradesRubricPicker.wiring.test.ts:259-263`).
- The prologue gate `resolved.text.trim() === "" && targets.length > 0`
  (`:254`).
- `describeResolvedRubricForLog(resolved, result.rubric)` (`:391`).
- The eighth `runCodeScoring` argument (`repoGradesCodeExecution.wiring.test.ts:435`).
  The `.catch` sits after the call's closing parenthesis, so the argument
  parse is untouched.
- Every other statement of `handleGradeColumn` (A-3).

**No new module.** A new non-test `.ts` in `repo-grades/` would break the
frozen 33-name root set (`repoGradesFeedbackAndFiles.wiring.test.ts:289-336`,
R-2) and enlarge the runtime-graph closure. Nothing here needs one.

---

## 7. Wave 3's detectors: measured, then disposed

**Measurement.** The 13 test files that read or import the edited hooks,
plus the repo-wide structural gates, were run from the scratch copy:
`NODE_PATH=<repo>/node_modules node <repo>/node_modules/vitest/vitest.mjs run --config <scratch>/probe/vitest.headtree.config.mjs`,
with the working directory set to the copy. `@/app/actions` was aliased to
the stub. That affects only `useRepoGradesBulkGrade.test.ts`, which imports
`establishSharedRubric` and would otherwise pull `@supabase/supabase-js`
from outside the repo.

- Pristine copy: `Test Files 13 passed (13)`, `Tests 442 passed (442)`.
- Reference: `Test Files 2 failed | 11 passed (13)`,
  `Tests 4 failed | 438 passed (442)`.

| Detector | File:line | On the reference | Disposition |
|---|---|---|---|
| A-1 (push is direct, after two ifs) | `repoGradesClassTrends.wiring.test.ts:116-133` | green | **Kept unchanged.** P3 adds no statement to `gradeOneTarget` |
| A-2(a) (first statement is `if (runningFolder !== null) return null;`) | `:139-150` | **red** | **AMENDED.** The pinned condition IS the A26 defect: a stale render read. New pass: `runBulkGrade`'s first direct statement is an `if` whose condition is `<X>.current`, where `<X>` is bound by `const <X> = useRef(...)` in the file, and whose then-branch returns `null`. S-20's intent (the refusal returns `null`) is kept. **New canary:** the HEAD guard, as a fixture, must FAIL the detector. Both were built in the scratch copy and proven: `Tests 54 passed (54)` over the two amended files on the reference, and M3 turns (a) red |
| A-2(b) (collector `const runResults = []`) | `:162-164` | **red** | **AMENDED: retarget only.** The same rule, read from `gradeBulkPlan`'s body instead of `runBulkGrade`'s. The collector did not change. The function holding it did |
| A-2(c) (`runResults` never reassigned, whole file) | `:165-172` | green | Kept unchanged |
| A-2(d) (last statement returns `runResults` after `await Promise.all`) | `:173-180` | **red** | **AMENDED: retarget only**, to `gradeBulkPlan`. S-3 is still killed there |
| Canary S-26 | `:181-191` | green | Kept (it parses its own fixture) |
| A-3, A-3 canary S-24 | `:204-267` | green | **Kept unchanged.** The handler keeps one `if`, the clear stays before the first await, the final set stays unconditional and last, and `const runResults = await runBulkGrade(...)` is kept. A-3(c) checks only the callee name |
| A-4, A-5 (including `setLastRunCohort` called exactly 3 times, `:305`) | `:271-307` | green | Kept unchanged |
| A-6 to A-8 (`index.tsx`) | `:364-441` | green | Kept unchanged. `index.tsx` is not edited |
| RubricPicker AC item 50 pin `/runBulkGrade\(plan, resolved\)/` | `repoGradesRubricPicker.wiring.test.ts:196-200` | **red** | **AMENDED** to `/runBulkGrade\(plan, \(\) => resolveRubricForColumn\(column\.assignmentId\)\)/`. The other assertion in that `it`, `resolveRubricForColumn\(column\.assignmentId\)`, stays. The title's "before starting the bulk run" becomes "as the run's first step, under its lock". AC item 50's substance, the column's `assignmentId` reaching the resolver once per run, is exactly what the new text pins. **Rejected alternative:** passing a Promise as `resolved` would keep the old text matching while inverting its meaning, and would start the fetch before the lock check. That is gaming a pin |

**No guard is loosened without a named replacement.** A-2(a) loses its
`runningFolder` identifier and gains the ref condition plus a canary
(the old spelling must fail). The behavioural tests A26 and A26b become its
primary enforcers. A-2(b) and (d) keep every clause.

`docs/a16-wave3-scope.md` section 13.2 records wave 3's decisions and is not
rewritten. The amended test's header cites this document, so a reader of
the test finds the amendment.

---

## 8. Instruments: the behavioural tests, and the mutants that prove they bite

**The first deliverable is the failing test** (Q1). The new file
`src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts` is
written first and watched red on HEAD for A26, A26b, A27, A27a and R-6. It
ships with the fix. The test seat owns the oracle, and this section fixes
what it must measure. The harness, proven in `<scratch>/probe2` against both
copies:

```ts
const h0 = vi.hoisted(() => {
  const slots: Array<{ value: unknown }> = []; let cursor = 0;
  return {
    begin: () => { cursor = 0; },                    // one "render" = one hook call
    useState: (init: unknown) => { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof init === "function" ? (init as () => unknown)() : init }; const s = slots[i]; return [s.value, (n: unknown) => { s.value = typeof n === "function" ? (n as (p: unknown) => unknown)(s.value) : n; }]; },
    useRef: (init: unknown) => { const i = cursor++; if (!slots[i]) slots[i] = { value: { current: init } }; return slots[i].value; },
  };
});
vi.mock("react", () => ({ useState: h0.useState, useRef: h0.useRef, default: { useState: h0.useState, useRef: h0.useRef } }));
vi.mock("@/app/actions", () => ({ gradeRepoAction: vi.fn(), postCanvasGradesAction: vi.fn() }));
```

Rules for the test seat, each tied to a failure seen here:

- **Drive `handleGradeColumn` and `handleGradeCell`,** the functions the
  buttons reach (`seats.md`, Test seat practice 3), never `runBulkGrade` alone.
  A26 exists only because of the await in the handler.
- **Fixtures come from the emitted shape.** Rows are built the way
  `repoGradesBulkGrade.test.ts:27-40` builds them. The success payload carries
  `run.results[0]` with every field `gradeOneTarget` reads (`:230-275`) and a
  `rubric`.
- **The rubric thunk and `gradeRepoAction` are controlled deferreds.** A test
  that resolves either at once collapses the window it is measuring. That is
  why the canary exists.
- `vitest.setup.ts` blocks the network, and both actions are mocked, so no
  path can leave the process.
- No helper is imported from another `*.test.ts`.

| Test | Pass condition (object; instrument; direction) | HEAD | Reference |
|---|---|---|---|
| A26 | Object: `gradeRepoAction` call count after click 1, a new render, click 2 from that render, then both fetches resolve. Instrument: the mock's call list. Direction: RED if count > number of targets | red (6 vs 3) | green (3) |
| A26b | Object: `bulkRunningFolder` of the render taken with no tick after click 1, and the call count when click 2 reuses click 1's closure. Instrument: harness render plus mock. Direction: RED if the flag is null or count > targets | red | green |
| Canary | Object: the same harness, with the flag already committed. Direction: RED if a refusal is NOT observed. Proves the harness can see one | green | green |
| A27 | Object: `bulkRunningFolder` and `bulkProgress` of a render after a run in which one call rejects. Direction: RED if either is non-null | red | green |
| A27a | Object: the same run. The rejected cell's `grading` is `false` and its `gradeError` is non-empty. The log holds exactly one entry per target, the rejected one as `grade-failed`. `setPostSummary` is called exactly once. Direction: RED on any mismatch | red | green |
| A27b | Object: `bulkRunningFolder` and `bulkProgress` after the rubric thunk rejects. Direction: RED if either is non-null | **green by construction** (HEAD never claims before the fetch) | green. **Its red is M1.** Report it as the test that guards P1's own new path, not as a red-first test |
| R-5 (count) | Object: the resolver's call count per started run, and its argument. Direction: RED unless exactly 1 per started run with argument `"42"` (the fixture column's `assignmentId`), and 0 for a refused click | 2 for two clicks | 1 |
| R-6 | Object: a cell's `grading`/`gradeError` and the log after its per-cell call rejects | red | green |

**Mutants of the reference, each run through all 7 probes** (script
`<scratch>/mutate.py`, which restores from a `cp` backup and confirms with
`cmp`):

| Mutant | Edit | Killed by (measured) | Survives |
|---|---|---|---|
| M1 no `finally` | release moved to after an un-guarded `await` | **A27b only** | the other 6 |
| M2 no `.catch` | P3 removed, `finally` kept | **A27a only** | the other 6. The flag IS released, which is why A27 alone is not enough |
| M3 state guard | `if (runningFolder !== null) return null;` with the claim still at click | **A26b only** (and amended A-2(a)) | A26, because the render between clicks already shows the flag |
| M4 claim after fetch | lock and flag set after `await resolveRubric()` | **A26 and A26b** | the other 5 |

No mutant was rebuilt. Each one produces a state that type-checks and runs
(the probes executed it). The build wave's sabotage pass re-runs M1-M4
against the real test file, plus S-20 (the refusal returns `[]`), which
amended A-2(a) must still kill.

---

## 9. Write set, `owns`, and the run-only readers

**Derivation, run at `1fdc622`:**

```
git grep -l -E "useRepoGradesBulkGrade|useRepoGradesGradingActions" HEAD -- 'src/**/*.test.ts'
  -> 11 files; per file, readFileSync count / import count:
src/app/components/recording/useTakeAnnouncement.test.ts          readFileSync=0 import=0  (comment mention only)
src/app/components/repo-grades/repoGrades.wiring.linking.test.ts  readFileSync=5 import=0
src/app/components/repo-grades/repoGrades.wiring.test.ts          readFileSync=7 import=0
src/app/components/repo-grades/repoGradesCellEdits.test.ts        readFileSync=0 import=0  (comment mention only)
src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts readFileSync=2 import=0
src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts readFileSync=2 import=0
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts readFileSync=3 import=0
src/app/components/repo-grades/repoGradesRubricPicker.wiring.test.ts readFileSync=2 import=0
src/app/components/repo-grades/repoGradesSliceA.guards.test.ts    readFileSync=2 import=0
src/app/components/repo-grades/repoGradesSliceB.guards.test.ts    readFileSync=2 import=0
src/app/components/repo-grades/useRepoGradesBulkGrade.test.ts     readFileSync=0 import=1
git grep -l "directoryRoots(.*repo-grades\|REPO_GRADES_DIR" HEAD -- 'src/**/*.test.ts'
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
```

R-8 also puts `useRepoGradesRubricSource.ts` in the set, for a comment-only
fix. Its readers were already found by the same grep:
`repoGradesRubricPicker.wiring.test.ts:61-66` reads it defensively,
`stripJsComments` is applied before the pattern checks, and the
`useEffect` check at `:445` parses code. A comment edit does not reach any
of them.

**Write set (8 paths):**

| # | Path | Class |
|---|---|---|
| WS-1 | `src/app/components/repo-grades/useRepoGradesBulkGrade.ts` | P1, P2, P3; R-8 comments |
| WS-2 | `src/app/components/repo-grades/useRepoGradesGradingActions.ts` | the handler's one line; R-6. **This is the caller of the changed `runBulkGrade` signature** |
| WS-3 | `src/app/components/repo-grades/useRepoGradesRubricSource.ts` | R-8 only. Comment-only correction of `:339-343` |
| WS-4 | `src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts` | NEW. Section 8 |
| WS-5 | `src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts` | A-2(a)(b)(d) amendments plus the A26 canary |
| WS-6 | `src/app/components/repo-grades/repoGradesRubricPicker.wiring.test.ts` | the AC item 50 pin amendment |
| WS-7 | `docs/REGRESSION.md` | baseline entry (W0), then the AC entry at regression |
| WS-8 | `docs/backlog.yml` and the rendered `docs/BACKLOG.md` | row state; residuals RR-1 to RR-3 filed. Orchestrator-owned |

**Run-only, and green without an edit** (measured on the reference in
section 7): `repoGrades.wiring.test.ts`, `repoGrades.wiring.linking.test.ts`,
`repoGradesCodeExecution.wiring.test.ts`, `repoGradesFeedbackAndFiles.wiring.test.ts`,
`repoGradesSliceA.guards.test.ts`, `repoGradesSliceB.guards.test.ts`,
`useRepoGradesBulkGrade.test.ts`, `runtime-import-graph.test.ts`,
`file-size-ceiling.structure.test.ts`, `source-bytes.structure.test.ts`,
`use-server-exports.test.ts`.

**Not run here, owed by the build wave's gate:**

- `src/lib/no-emojis.test.ts`: it scans `docs/`, and the scratch copy had none.
- `npm run lint`: flat config ignores files outside the base path. The ref
  pattern has lint-clean precedent at `useCopilotAgents.ts:74,103`.
- `npx tsc --noEmit`: one caller, the wave gate. The type reasoning is in
  section 6. `.catch` widens the union with `{ error: string }`, which the
  existing `"error" in result` branch already narrows.
- `npm run build`.

**Sequencing: NOT disjoint from A16 wave 3's in-flight verification.** WS-1,
WS-2, WS-5 and WS-7 are the paths that verification is exercising right now.
This chunk's build starts only after A16 wave 3's verify has finished and
pushed (`parallel-disjointness.md`). It also rebases on whatever that
verification changed in WS-5.

---

## 10. Waves

| Wave | Seat | Writes | Gate |
|---|---|---|---|
| W0 | Baseline | WS-7: a new entry, "Repo Grades bulk-run lifecycle at `<HEAD>`, before A26/A27". Entry 434 covers the guard and the end-of-run order, but at pre-wave-3 addresses (`:174`, `:374-377`, `Promise<void>`) that have since moved. The new entry maps each of its claims to the current address, as the A9 baseline did, and records section 2.2's measured probe values as today's behaviour. **After** A16's own regression entry, if one is owed, because both append to one file | `grep -a` for the new heading; the entry cites only addresses it opened |
| W1 | Test seat, then implementer | WS-4 | watched RED on HEAD for A26, A26b, A27, A27a, R-6 |
| W2 | Implementer | WS-1, WS-2, WS-3, WS-5, WS-6 in ONE wave. WS-2 is the caller of WS-1's changed signature and cannot land apart from it | section 9's readers green unedited; WS-4 green; M1-M4 and S-20 watched failing and restored; lint, `tsc` (single caller) and build |
| Verify, regression, push | per `DEV_LOOP.md` | WS-7 AC entry, WS-8 | `git status --short` equals WS-1 to WS-8 exactly, `docs/css-orphans.md` excepted |

---

## 11. Requirements

| ID | Requirement | Object; instrument; direction |
|---|---|---|
| R-1 | A click claims the run before any await. The render after the click shows every Grade all disabled, and a second invocation starts no run | Call count and `bulkRunningFolder`; WS-4 tests A26 and A26b; RED if count > targets or the flag is null |
| R-2 | The refusal reads a ref, never render state | `runBulkGrade`'s first statement; amended A-2(a) plus canary, and A26b; RED on M3 |
| R-3 | The lock, `runningFolder` and `progress` are released on every exit, including a rejecting rubric fetch | The flag and progress after a rejection; A27 and A27b; RED on M1 |
| R-4 | A rejected grading call becomes an ordinary failed outcome: the cell is released with an error, the run finishes, every target is logged, one status line is written | A27a; RED on HEAD and on M2 |
| R-5 | The rubric is still fetched exactly once per started run, from the column's `assignmentId`, and never for a refused click | Resolver call count and argument; WS-4 plus the amended AC item 50 pin; RED unless 1 per started run and 0 per refused click |
| R-6 | The per-cell Grade path gets P3 as well | R-6 test; RED on HEAD. **Separable:** it widens A27 past its literal row text by one expression in a file already in the set. If struck, its disposal is a new backlog row carrying this test as its instrument, not a silent drop |
| R-7 | Wave 3's detectors are disposed exactly as section 7 says, and every run-only reader in section 9 stays green unedited | The listed vitest runs; RED if any unlisted reader changes or goes red |
| R-8 | Comments the change makes false are rewritten in the same wave: `useRepoGradesBulkGrade.ts:25-31` ("each worker catches nothing itself (gradeRepoAction never throws ..."), `:51-57` ("This file does not import or call the resolver itself"), `:151-156`, `:160-168`, `:175-177`; and `useRepoGradesRubricSource.ts:339-343` (the pending-resolve counter disables no Grade button) | **Reading only, stated as such.** No test can check that a comment is true. The verifier opens each address. A stale one is a finding |

---

## 12. Rulings in the brief that the tree disagrees with

| The brief says | The tree says | Command |
|---|---|---|
| Wave 3 has a rule that "the collector identifier is referenced exactly three times" | The only exact-three assertion in the wave-3 wiring test is `countCallsTo(actionsHookFile, "setLastRunCohort")).toBe(3)` at `:305`. It counts cohort writers, not the collector | `git grep -n "toBe(3)\|toHaveLength(3)" HEAD -- src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts` |
| Wave 3 has "no try, switch or loop in certain bodies" | No detector for any of those node kinds exists in any test file. What exists: A-1's rule that the push is a direct statement, and A-3's "exactly one IfStatement". A `try` wrapper breaks A-2(b) and (d) indirectly, by moving the collector and the return out of the direct statements, which is what section 7 measured | canary `git grep -c "isIfStatement" HEAD -- 'src/**/*.test.ts'` gives 7 in the wave-3 test; `git grep -c -E "isTryStatement\|TryStatement\|isSwitchStatement\|isForStatement\|isForOfStatement\|isForInStatement\|isWhileStatement\|isDoStatement" HEAD -- 'src/**/*.test.ts'` gives no output |
| "the handler's direct statements are exactly a listed set in order" | Close, but not literal. A-3 pins one `if`; the clear after it and before the first await; the last statement; and the `runResults` declaration. It does not enumerate the full list, which is why the handler may lose its `const resolved` line here without tripping A-3 | `repoGradesClassTrends.wiring.test.ts:204-256` |
| Guard "around :174"; reset "around :376" | `:178`; `:387` | 2.1 |

Neither value was adopted silently. Where a rule was cited that does not
exist, this document measured against the rules that do.

---

## 13. Decisions and rejected alternatives

| ID | Decision | Rejected, and why |
|---|---|---|
| D-1 | The lock is a ref, and `runningFolder` is display only | A state lock claimed at click. It survives every test except the same-closure one (M3), and its safety would rest on React's discrete-event flush, which is not observable here |
| D-2 | The rubric fetch runs under the lock, through a thunk | (a) Disable Grade all on `rubricResolving`: it covers only network misses, is still a render read, and would also grey Grade all during unrelated preview fetches (`:701-733`). (b) Export a `claim()` for the handler: it needs a second `if` (A-3 allows one) and a handler `finally` (A-3(b) needs the final set last), and still fetches on refusal. (c) Pass a Promise: it games the AC item 50 pin (section 7) and fetches before the lock check |
| D-3 | `runBulkGrade` is the locked entry point, and `gradeBulkPlan` holds the pool | Keeping the name `runBulkGrade` on the pool body, so A-2(b)(d) need no retarget, would point the handler's call-site name at the unlocked body. A reader tracing `runBulkGrade` from the handler would miss the lock |
| D-4 | P3 is `.catch` on the call, reusing the `{ error }` branch | `Promise.allSettled`: A-2(d) pins `Promise.all`, and it would still leave the rejected cell in `grading: true`. A `try` inside `gradeOneTarget` is legal under A-1 but longer, for the same effect |
| D-5 | **Accepted limit, stated rather than parked.** After P3, the only way a worker can still reject mid-pool is a success payload that breaks its own type (`runResults.push(...result.run.results)`, `:306`). If that happens, the `finally` releases the lock while sibling workers drain. They cannot write into a later run's outcomes or collector, which are per-run closures (`:185`, `:189`), but they can still update cells. Every other callback in the pool is a setState updater or a pure function (`recordLog`, `index.tsx:610-613`) and cannot throw synchronously | An abort flag threaded through the workers: it adds surface for a failure that only a broken server contract can produce |
| D-6 | A refused click returns `null` without fetching | Unchanged `null` semantics, so the leaf's `buildRepoRunCohort({ results: null })` behaves as wave 3 specified |
| D-7 | No new copy while the rubric loads: "Grading 0 of N…" | "Preparing rubric…" is a UX-seat option, not required for correctness |

---

## 14. Seat triage for this chunk (the trigger that fired)

| Seat | Runs? | Trigger |
|---|---|---|
| Acceptance criteria | yes | never triaged out |
| Architect | this document | more than two existing files touched |
| User experience | yes | a visible change: disable timing, the label during the fetch, a new error string in a cell. Owes the error copy and the "misleading" three |
| Data / storage | out | nothing persisted. `cellEdits` is `useState` (REGRESSION 434) |
| Visual | out | no layout, spacing or colour change. The existing error span is reused |
| Operability | out | nothing to configure, audit or revoke |
| Security | out | no new server action or egress. The new DOM text is a platform error message rendered as a React text child in an existing span (escaped), not user- or model-authored |
| Reliability | yes | a resource that must be released, on every exit. Sections 5 and 13 are its input |
| Accessibility | yes, reading only | the button becomes disabled at click time, so a focused button loses focus earlier than today. A run with N transport failures fires N `role="alert"` spans, as the existing `{ error }` path already does. Every claim is a reading claim |
| External facts | done inline | 2.5, read from installed files |
| Baseline | yes | entry 434 covers the area at moved addresses |
| Test seat | yes | never triaged out. Section 8 fixes what it must measure |

---

## 15. Disposition of prior requirements

No prior version of this document exists. What it inherits:

| Prior item | Disposition |
|---|---|
| A26's row instrument: "establish whether the race is real rather than fix it" | **Kept → R-1, R-2**, discharged in its first half by section 2.2 (measured red). The row's own sequence is honoured: WS-4 is written and watched red before any fix |
| A27's row instrument: "reproduce it before fixing it" | **Kept → R-3, R-4**, same |
| RES-W3-6 (`docs/a16-wave3-scope.md:1075`), handed to A26 | **Kept → R-1, R-2, R-5.** Its note that trends are last-completion-wins stops mattering once a second run cannot start |
| RES-W3-9 (`:1078`): "The fix's own test must execute the rejection" | **Kept → R-3, R-4**, whose tests execute it |
| REGRESSION 349's limit (`docs/REGRESSION.md:33453`): the guard depends on the button being disabled | **Discharged by R-1/R-2**: the guard no longer depends on it |
| Wave 3 A-2(a), (b), (d) and RubricPicker AC item 50 | **Amended**, section 7. Every other wave-3 detector: **kept unchanged** |

---

## 16. Residual register

Each entry exists only once it is in `docs/BACKLOG.md`. Filing them is the
orchestrator's job at this chunk's push, in the owner-only section where
marked. Until then this list is a hand-off, not a record.

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RR-1 | That a real double click on a cold `assignment` column starts ONE run, and that the button visibly disables with "Grading 0 of N…" right after the click. The harness models closures only; batching, commit timing and StrictMode are not modelled | Repo owner (owner-only) | Real browser after deploy: the DevTools Network panel shows exactly N grading POSTs for N targets, and the button state is seen by eye | Post-deploy owner verification (`DEV_LOOP.md`, "Record what only the owner can settle") |
| RR-2 | The actual text a real transport failure puts in the cell (offline, platform timeout, version skew), and whether it reads acceptably | Repo owner (owner-only), with the UX seat's copy decision | DevTools offline toggle during a run | The same post-deploy verification |
| RR-3 | `classTrendsFolderEntry.ts:52-54` says a refused run leaves "nothing about the previous run's cohort" changed. The handler has already cleared that cohort at `useRepoGradesGradingActions.ts:771`, before `runBulkGrade` is called. The comment is inaccurate and the behaviour is harmless. It is outside this write set, and the file is under A16's verification right now | Orchestrator, routing it to A16 wave 3's verify findings | Reading the two addresses | A16 wave 3 verify. If that has closed, a new doc-correction row at this chunk's push |

Not residuals, because they are gate steps with owners: lint, `tsc`,
`no-emojis`, build (the W2 gate).

---

## 17. What I could not determine

- **Browser timing** (RR-1), and whether React 19 commits the click's update
  before a second physical click. Nothing renders here.
- **The real rejection message** (RR-2). The probe's "Failed to fetch" is
  what the stub threw, not a measured platform string.
- **Whether a single real `gradeRepoAction` can exceed the platform's
  duration cap** on this deployment, which is the likeliest A27 trigger.
  There are no keys, no deployment access, and no route-level `maxDuration`
  for server actions was found (`grep -rn "export const maxDuration" src/app`
  lists only API routes).
- **`tsc`, lint and build on the reference.** Not run: `tsc` has one caller,
  and lint ignores files outside the base path. They are owed by W2.
- **The working copy's state** while the A16 verifier works. Everything
  here was read from `HEAD`, and the probes ran on `git archive` copies,
  never on the working tree.

## 18. Tree state at hand-off

This pass wrote exactly one path in the repository: `docs/a26-a27-scope.md`.
No source file was edited. All probe, mutant and scratch-copy material is in
the session scratchpad, not the tree.
