# Scope: extend the Session Diagnostic Log to cover all grading

Owner request, direct chat 2026-10-08: "update that diag to cover all grading."
Today grading is explicitly NOT instrumented, so when the owner records a
session and grading lags or fails, the downloaded log shows nothing about
grading. The owner has been downloading these logs to diagnose a zip-upload
lag; the log itself names grading as uncovered.

This is a SCOPE + WAVE PLAN. No production code here. Every quantity names the
command that produced it. HEAD ~08252c9a.

---

## 0. Two corrections to the brief, measured against the tree

Both reinforce the architecture rather than changing it; recorded because
"brief from the tree, not the doc" is a repo rule and a checker will re-walk
these.

1. **`src/lib/accommodations.ts` is NOT an example record call site - it is the
   opposite, a MUST-NOT-record site.** Its header (`src/lib/accommodations.ts:60-64`)
   reads, verbatim: "NOTHING IN THIS FILE MAY EVER REACH
   recordSessionDiagnosticEntry OR ANY OTHER DIAGNOSTIC SURFACE
   (src/lib/session-diagnostic-log.ts). ... This module does not import that
   module, and nothing below should ever be changed to call it." It is
   disability-related student data and runs server-side. The grep that lists it
   as an "importer" (section 10's command) matches that prose, not an import.
   The real example record call sites are `src/app/account/diagnostics/page.tsx:97`
   (`recordSessionDiagnosticEntry`) and, through the surface wrapper,
   `src/app/components/content-tab/contentDiagnosticLog.ts:170-181`.

2. **The grading work the owner wants timed happens SERVER-SIDE, but the log is
   browser-only by contract** (section 1). That is not a contradiction once the
   seam is placed correctly - but the client surfaces split into TWO shapes, and
   claiming a single "every surface awaits its server call" shape was the
   round-1 error (see the corrected claim below). The two shapes:
   - **Awaited call in a client hook** (the majority): chat, repo-grades,
     drafted-grades, post-to-Canvas, and `fetchCanvasMetaAction`. Each `await`s a
     Server Action from `"use client"` code; the instrument is the elapsed time
     of that await, recorded in the browser. These are the live seams #1-#3 and
     #7-#14 (section 6), confirmed sound.
   - **A React form-action dispatch, NOT an awaited promise** (the main grading
     tab's whole-run grade - the owner's actual main-tab zip lag). `submitWholeRun`
     (`GradingTab.tsx:172-176`) is `startTransition(() => formAction(fd))`; the
     whole-run `gradeAction` (`src/app/actions/grading.ts:714`) is dispatched
     through React's `useActionState`, so there is no promise the component can
     `await`. The instrument here is a CLIENT timer from dispatch to settle,
     keyed on the `useActionState` `pending`/`state` the component already holds
     (section 6, seam W). Both shapes record a browser-observed elapsed time; the
     difference is WHERE the end-of-call signal comes from (a resolved promise vs
     the `pending` flag clearing / a new `state` arriving).

   **CORRECTED CLAIM-1 (round-1 said the opposite and it was false):** NOT
   "every grading surface is driven from a client hook that already awaits."
   Every grading surface the owner reaches TODAY is driven from `"use client"`
   code, but the main-tab whole-run path dispatches a form action it cannot
   await; it is timed via the dispatch->settle effect, not by wrapping an await.

---

## 1. THE SHAPE DECISION: every grading seam is client-side, by contract

This is the load-bearing decision; everything else follows from it.

`src/lib/session-diagnostic-log.ts` holds module-scope mutable state
(`storedEntries`, `:172`). Its header states the contract (`:36-42`):
"Module-scope mutable state in a module reachable from a Server Action or a
route handler would be shared across REQUESTS, and therefore across users - one
instructor's failures landing in another's download. Nothing server-side may
import this module." Two more contracts bind grading specifically:

- **NO STUDENT PERSONAL DATA** (`:44-49`): every entry is an infra call
  succeeding or failing; no field names a student. Grading touches submissions,
  names and labels, so this contract is now live pressure, not theoretical.
- The browser-only contract is enforced by
  `session-diagnostic-log.test.ts:622-649`, which scans `src/app/api`,
  `src/app/actions`, and every `"use server"` file for the literal
  `session-diagnostic-log`.

**Consequence:** the server-side grading code CANNOT be instrumented by
importing the recorder into it. That rules out, as instrumentation hosts:
`src/app/actions/grading.ts` (`"use server"`, `:1`), `src/lib/grade/extraction.ts`
and `src/lib/grade/engine.ts` (server-only lib, reached only from actions/engine),
and `src/app/api/grade-run-item/route.ts` (a route handler). Every record call
lands in a `"use client"` file.

**The enforcement gap, stated so the design closes it rather than inherits it.**
The server-import scan (`:640-649`) reads each server file's OWN text for the
specifier; it does NOT walk the import graph. So a server lib module importing
the recorder (e.g. if someone "instrumented" `extraction.ts`) would pass the
test while being a real cross-request-state bug - and a server file importing
the NEW grading wrapper (section 2) would also pass, because its text would
contain `gradingDiagnosticLog`, not `session-diagnostic-log`. The design must
(a) place every grading record call only in `"use client"` files, and (b)
extend the scan to also ban the grading-wrapper specifier from server files.
See section 8 (machine-checkable) and section 9 fork F4.

---

## 2. ONE grading surface, not several (fork F1)

**Recommendation: ONE surface, `"grading"`.** The current gap line lumps them -
`SESSION_DIAGNOSTIC_NOT_COVERED[1]` (`:108`) reads "Grading, rubrics, drafted
grades and repo grading." - and the content-tab precedent
(`contentDiagnosticLog.ts`) is exactly this shape: one surface value, one
wrapper module owning the operation vocabulary, recording THROUGH the core. A
reader distinguishes chat vs main-tab vs repo grading by the OPERATION, which is
the right axis; splitting into `grading` / `repo-grading` / `drafted` surfaces
multiplies the coverage rows and the per-surface drop accounting for no reader
benefit and three times the honest-coverage bookkeeping.

The alternative (several surfaces) is a real option only if the owner wants the
download's per-area attempt counts (`summarizeSessionDiagnosticLog.bySurface`,
`:294`) to separate repo grading from chat grading at the top level. Recommend
NO: the operation axis already carries that, and the per-operation count is the
natural place for it.

**Adding `"grading"` to the surface type forces its coverage row by
construction** (the honest-coverage invariant): `SessionDiagnosticSurface`
(`:73`) feeds `COVERAGE_BY_SURFACE: Readonly<Record<SessionDiagnosticSurface,
string>>` (`:91`), a FULL record keyed by surface, so `tsc` fails until the row
exists. It also forces `SURFACES` (`:75`) and
`SESSION_DIAGNOSTIC_SURFACE_LABELS` (`:77`, also a full Record).

---

## 3. Operation vocabulary

Owned by a new client wrapper module, `src/app/components/grading/gradingDiagnosticLog.ts`
(mirrors `contentDiagnosticLog.ts`), as a closed union + a labels record. The
label is the human string shown in the download; it NEVER carries a student
name or submission text (section 7).

| `operation` | `label` | Recorded at (client seam) |
|---|---|---|
| `resolve_header` | "Resolve run header" | chat `beginSession` -> `resolveChatRunHeaderAction` |
| `generate_rubric` | "Generate rubric" | GitHub `generateRubricFromRepoAction` (rubric generation that is its own awaited call) |
| `prepare_submission` | "Prepare submission" | chat `submit` -> `prepareChat/CompositeSubmissionAction` (intake + zip extract - a real LIVE grading-ingest timing) |
| `grade_whole_run` | "Grade (whole run)" | main tab whole-run `gradeAction`, timed CLIENT-side from `submitWholeRun` dispatch to `useActionState` settle (**the owner's main-tab zip lag TODAY** - section 6 seam W) |
| `grade_item` | "Grade submission" | per-student POST to `/api/grade-run-item` - LIVE on the chat path (chat seam #3); also the main-tab bulk zip once the bulk-zip build routes it through the chat pump (section 11). The GradingTab incremental-route POST (dead seam #5) is unreachable until RULING 116. |
| `prepare_run` | "Prepare grading run" | main tab `prepareGradingRunAction` - UNREACHABLE until RULING 116 (incremental route only; dead seam #4). NOT instrumented in any live wave. |
| `grade_repo` | "Grade repository" | repo-grades `gradeRepoAction` (one entry per call) |
| `grade_repos` | "Grade repository cohort" | GitHub panel `gradeReposAction` |
| `resolve_tier2` | "Load checklist / sample answer" | main tab `completeGradingRunHeaderAction` (non-blocking) - UNREACHABLE until RULING 116 (incremental route only; dead seam #6). NOT instrumented in any live wave. |
| `derive_checklist` | "Derive assignment checklist" | drafted-grades `deriveAssignmentChecklistAction` |
| `fetch_canvas_meta` | "Fetch Canvas assignment details" | `fetchCanvasMetaAction` (chat + main tab + checklist panel) |
| `post_grades` | "Post grades to Canvas" | `postCanvasGradesAction` (results + repo-grades) |
| `post_draft` | "Post drafted grade" | `postGradingDraftAction` |

This vocabulary is a floor; a build wave may add an operation to the already
-covered surface without any coverage-honesty change (section 5), so the list
can grow as seams land.

---

## 4. The durationMs decision, and its blast radius (fork F2)

**Recommendation: ADD an optional `durationMs?: number` to the entry.** It is
the highest-value part for the owner's actual need - a lag is invisible today
because an entry records only outcome, never elapsed time. A slow zip ingest or
a slow grade then appears as a long-duration entry.

Backward-compatible (optional field, absent on every existing caller). Blast
radius, each with the exact site and the test that will go red if it is missed:

1. **Entry shape** `SessionDiagnosticEntry` (`:126`): add `durationMs?: number`.
2. **Args** `RecordSessionDiagnosticArgs` (`:198`): add `durationMs?: number`.
3. **Record fn** `recordSessionDiagnosticEntry` (`:216-234`): copy it onto the
   stored entry CONDITIONALLY (`...(args.durationMs !== undefined ? {
   durationMs: args.durationMs } : {})`), never as an explicit `undefined`
   key - see trap in point 6.
4. **CSV** `ENTRY_CSV_HEADER` (`:373`) + the per-entry row (`:415-426`): add a
   "Duration (ms)" column. The summary/coverage blocks are untouched.
5. **JSON** `formatSessionDiagnosticLogJson` (`:437-455`): `...log` already
   spreads each entry, so `durationMs` serializes automatically; `summary` and
   `coverage` are unaffected. No code change required, but a test must pin it.
6. **Round-trip parser** `parseOneEntry` (`:487-511`) - **THE TRAP.** The
   existing round-trip test asserts `parseSessionDiagnosticLogEntries(parsed.entries)
   .toEqual([...state.entries])` (`session-diagnostic-log.test.ts:547`). If a
   stored entry carries `durationMs` and the parser drops it, the round-trip
   goes RED. So `parseOneEntry` must read `durationMs` as an optional number
   (present-and-numeric -> keep; absent -> omit; present-and-non-numeric ->
   drop the field, not the entry). The test seat must add a durationMs entry to
   the round-trip case. Keeping the record fn conditional (point 3) is what
   keeps `toEqual` honest for entries with no duration.
7. **On-screen line** `SessionLogSection.tsx:80-86` (`describeEntryLine`):
   OPTIONAL but recommended - append ` (2360 ms)` when `durationMs` is present,
   so the owner sees the slow entry without downloading. This file is the only
   consumer render that composes the entry line; no test renders it (no
   component renders under vitest, `this-repo.md:134`), so this is a reading
   claim verified by code, not a test.

`contentDiagnosticLog.ts` needs NO change: its view maps session entries into
`ContentDiagnosticLogEntry` (`:192-207`), which has no `durationMs`, so the
content-tab CSV/JSON (its own `ENTRY_CSV_HEADER`, `:294`) is unaffected and its
own round-trip (`:375-387`) is unaffected. The `lms-content` and `diagnostics`
callers simply never pass a duration.

---

## 5. The honest-coverage invariant: exact wording, and the ATOMICITY constraint

The module's own rule (`:103-114`): an entry removed from
`SESSION_DIAGNOSTIC_NOT_COVERED` "without its surface being added above turns a
truthful gap into a false claim of coverage." The inverse also bites: **adding
the `"grading"` surface (and thus its COVERAGE row saying "Yes, instrumented")
BEFORE any real grading call records is itself a false claim** - the download's
grading section would read empty, i.e. "grading never failed," the exact lie
`SessionLogSection.tsx:146-150` and the module header forbid.

Therefore:

- **The surface/coverage change and the FIRST real grading call sites are
  ATOMIC - one wave, one commit.** You cannot declare the surface without
  claiming coverage (the type forces the row), so the declaration must ride with
  recording that makes the claim true.
- **Coverage is narrowed incrementally, never prematurely removed.** The first
  grading wave covers the chat operations PLUS the main-tab whole-run grade (the
  owner's zip-lag, timed CLIENT-side - seam W). Its coverage row names exactly
  those; the NOT_COVERED grading line is EDITED, not deleted, to name only the
  still-uncovered grading parts. Each later seam moves its part from the edited
  NOT_COVERED line to the coverage row, until the last seam removes the line.

**Proposed COVERAGE_BY_SURFACE["grading"] wording (first wave):**
> "Chat grading and the main grading tab's whole-run grade (zip and Canvas):
> resolving the chat run header, preparing a chat submission (including its zip
> extract), each chat submission graded, fetching Canvas assignment details, and
> the main-tab whole-run grade's total time from dispatch to result - each
> operation's outcome and elapsed time as seen by the browser."

**What the first wave does NOT claim, stated so the coverage row stays honest.**
The GradingTab *incremental* route (`prepare_run`, its per-item grade, and
`resolve_tier2` - dead seams #4/#5/#6) is NOT user-reachable: `routeGradingRun`
returns `"whole-run"` unconditionally because `INCREMENTAL_ROUTE_ENABLED = false`
(`incrementalRunPlan.ts:110,132`, RULING 116). It is dead code, NOT a distinct
user-visible grading path, so it is neither claimed as covered nor listed as an
uncovered user-visible gap - it is carried as RES-GDIAG-1 (section 11), to be
instrumented in the same change that ever makes the route reachable. The
coverage row therefore says nothing the live surface does not deliver.

**Proposed replacement NOT_COVERED grading line (first wave), kept until the
repo-grades/drafted/post seams land:**
> "Posting grades back to Canvas, posting drafted grades, and the repo-grades
> grid's own per-repository grading."

Delete the line entirely only in the wave that lands `post_grades`,
`post_draft`, `grade_repo` and `grade_repos`.

**The coverage test must flip in the SAME wave as the surface.**
`session-diagnostic-log.test.ts:426` asserts the uncovered list contains the
keyword `"grading"`:
```
for (const area of ["recording", "grading", "workflow", "chat", "files"]) {
  expect(declared, ...).toContain(area);
}
```
Once grading is covered (even partially, if the edited NOT_COVERED line still
contains the word "grading" via "repo-grades ... grading", the keyword still
appears - verify the exact wording keeps or drops it deliberately). The test
seat must decide this against the final wording: if the edited line retains the
substring "grading", `:426` stays green unchanged; when the line is finally
removed, `:426` must drop `"grading"` from its keyword list AND the test must
add a positive assertion that `"grading"` appears among
`SESSION_DIAGNOSTIC_COVERAGE` surface labels. Floors at `:418-419`
(`COVERAGE.length >= 2`, `NOT_COVERED.length >= 4`) stay satisfied.

**The count transitions, corrected (round-1 NIT: the 6 -> 5 belongs to W3, not
W2).** In W2 the `"grading"` COVERAGE row is ADDED, so coverage goes 2 -> 3; the
NOT_COVERED grading entry is EDITED (narrowed text), not deleted, so
NOT_COVERED stays at 6. In W3, when the last live grading seam lands and the
grading entry is DELETED, NOT_COVERED goes 6 -> 5. (Measured:
`SESSION_DIAGNOSTIC_NOT_COVERED` has 6 entries, `:107-114`.) A W2 that dropped
the count to 5 would be deleting the grading gap while still leaving posting /
drafted / repo grading uncovered - the false-claim this invariant forbids.

---

## 6. Enumerated instrumentation points

All client-side. The LIVE awaited-call seams (every row below except W) are:
wrap the existing awaited server call with a start/end timer and record
`{ surface: "grading", operation, label, outcome, durationMs, institution?,
course? }` AROUND the call - never gate it, never change its arguments or its
result. Seam W is the one exception in SHAPE (a form-action dispatch->settle
effect, not an await) and is specified in full below the table.
`institution`/`course` are supplied only where the client already holds them (a
Canvas URL is a `course`, already allowed by the `diagnostics` surface's own
use; an institution acronym where present); otherwise `""`.

LIVE seams are instrumented in the waves below. The three UNREACHABLE rows
(#4/#5/#6) are kept in the table ONLY to document WHY they are not live seams;
they are NOT in any live wave (see RES-GDIAG-1, section 11).

| # | File:line (host, all `"use client"`) | Call | operation | success / failure signal |
|---|---|---|---|---|
| **W** | `GradingTab.tsx:172-176` (`submitWholeRun` dispatch) + a NEW timing effect keyed on the existing `pending`/`state` props (`:54-55`) | main-tab whole-run `gradeAction` via `useActionState` (**the owner's zip lag TODAY**) | `grade_whole_run` | on settle: `state.error` present -> failure; else `state.run` present -> success. See full spec below. **LIVE.** |
| 1 | `grading-chat/useContinuousGradingRun.ts:233` | `resolveChatRunHeaderAction` | `resolve_header` | header `kind:"ok"` vs `kind:"refused"` (`:234`). **LIVE.** |
| 2 | `useContinuousGradingRun.ts:307-309` | `prepareChat/CompositeSubmissionAction` | `prepare_submission` | `outcome.kind` ok vs `"refused"` (`:310`). **LIVE.** |
| 3 | `useContinuousGradingRun.ts:205-222` | `dispatchItem` (POST `/api/grade-run-item`) | `grade_item` | `.then` (success) vs `.catch` (`:209`, `classifyItemFailure`) in the `.finally` seam. **LIVE.** |
| 4 | `grading/useIncrementalGradingRun.ts:246` | `prepareGradingRunAction` | `prepare_run` | **UNREACHABLE until RULING 116.** `startReview` returns via `beginWholeRun` (`:229-232`) before `:246` whenever `INCREMENTAL_ROUTE_ENABLED = false` (`incrementalRunPlan.ts:110,132`). NOT a live seam. |
| 5 | `useIncrementalGradingRun.ts:193` | `postGradeRunItem` | `grade_item` | **UNREACHABLE until RULING 116** (same gate as #4 - the pool at `:193` only runs on the incremental branch). NOT a live seam. |
| 6 | `useIncrementalGradingRun.ts:171` | `completeGradingRunHeaderAction` | `resolve_tier2` | **UNREACHABLE until RULING 116** (fired inside `runPool`, incremental branch only). NOT a live seam. |
| 7 | `GithubGradingPanel.tsx:372` | `gradeReposAction` | `grade_repos` | `r` shape (`"error" in r`). **LIVE.** |
| 8 | `GithubGradingPanel.tsx:353` | `generateRubricFromRepoAction` | `generate_rubric` | `r` shape. **LIVE.** |
| 9 | `repo-grades/useRepoGradesBulkGrade.ts:282` | `gradeRepoAction` (per target) | `grade_repo` | the `.catch` at `:291` maps to `{error}`. **LIVE.** |
| 10 | `GradingResults.tsx:413` and `:491` | `postCanvasGradesAction` | `post_grades` | result `posted`/`skipped`/error (state-changing - high value). **LIVE.** |
| 11 | `repo-grades/index.tsx` + `RepoGradesGrid.tsx` | `postCanvasGradesAction` | `post_grades` | same. **LIVE.** |
| 12 | `DraftedGradesTab.tsx:310` | `postGradingDraftAction` | `post_draft` | `res` shape. **LIVE.** |
| 13 | `drafted-grades/AssignmentChecklistPanel.tsx:73` | `deriveAssignmentChecklistAction` | `derive_checklist` | `res` shape. **LIVE.** |
| 14 | `AssignmentChecklistPanel.tsx:53`, `GradingTab.tsx:140`, `GradingChatPanel.tsx:200` | `fetchCanvasMetaAction` | `fetch_canvas_meta` | `result`/`meta` shape. **LIVE.** (GradingTab site corrected 156 -> 140: the `await fetchCanvasMetaAction(url)` in `handleRetrieveCanvas` is at `GradingTab.tsx:140`.) |

**Seam W, the promoted main-tab whole-run timing - full spec.** This captures
the owner's main-tab zip lag TODAY, because every main-tab grade is a whole-run
dispatch while `INCREMENTAL_ROUTE_ENABLED = false`. The mechanism is entirely in
`GradingTab.tsx` (`"use client"`), in three parts:

1. **Start, at the single dispatch door.** EVERY whole-run dispatch funnels
   through `submitWholeRun` (`GradingTab.tsx:172-176`): the form `onSubmit` ->
   `startReview` -> `beginWholeRun` -> `submitWholeRun`, and the Live Feed
   `handleAutoGrade` (`:201-216`) -> `beginWholeRun` -> `submitWholeRun`. So a
   single `const wholeRunStartRef = useRef<number | null>(null)` set to
   `performance.now()` inside `submitWholeRun` immediately BEFORE
   `formAction(fd)` captures the start of every whole-run grade with no second
   call site to miss. Setting a ref is not React state, so it adds no render and
   trips no `react-hooks` rule.
2. **End, on the `useActionState` settle.** A `useEffect` keyed on `[pending,
   state]` (both already props, `:54-55`). `pending` goes `true` on dispatch and
   back to `false` when `gradeAction` settles; `state` is replaced with the new
   result. The effect records ONLY on the settle edge and ONLY if a start was
   captured: `if (!pending && wholeRunStartRef.current !== null) { record(...);
   wholeRunStartRef.current = null; }`. On mount `pending` is `false` and the ref
   is `null`, so nothing records. The duration is `performance.now() -
   wholeRunStartRef.current`. The effect calls the browser-only recorder (module
   state), NOT React `setState`, so it adds no render and no `set-state-in-effect`
   lint violation (MEMORY: setState-in-effect idiom).
3. **Outcome + the decision as a PURE, unit-testable leaf.** Because NO component
   renders under vitest (`this-repo.md:134`), the effect itself cannot be unit
   tested by rendering. So the DECISION moves into a pure function in the grading
   wrapper (section 3): `decideWholeRunDiagnostic({ startedAtMs, settledAtMs,
   state }): GradingDiagnosticRecord | null` - returns `null` when `startedAtMs`
   is `null` (no whole-run in flight), else a record with `operation:
   "grade_whole_run"`, `outcome` = failure when `state.error` is set else
   success, and `durationMs = settledAtMs - startedAtMs`. The effect is a thin
   caller of this leaf. The leaf is machine-checked (section 8); the effect's
   wiring (that it calls the leaf on the real settle edge) is a reading claim,
   the same class as `SessionLogSection.tsx`'s render - a requirement whose only
   enforcer would be a render is NOT proposed here (the leaf carries the testable
   obligation).

Behaviour unchanged: the timer reads `performance.now()` around a dispatch that
already happens; no `await` is added, `formAction` is not wrapped or delayed, and
the grade's arguments and result are untouched.

**Reachability note, re-anchored (round-1 said this flows through seam #4/#5,
which are DEAD).** `LiveFeedPanel.tsx`'s "auto-grade" does NOT call a grade
action itself; it hands off to `GradingTab`'s `handleAutoGrade` (`:201-216`),
which dispatches through `beginWholeRun` -> `submitWholeRun` - the SAME whole-run
door as the form submit. So Live Feed auto-grade is covered by seam W (the
whole-run timing), NOT by the incremental hook. Build must confirm the hand-off
is `beginWholeRun`/`submitWholeRun` and not a second dispatcher.

---

## 7. What MUST NOT change

- **Grading behavior and latency.** Every record call wraps an existing await
  (or, for seam W, reads a timestamp around an existing form-action dispatch);
  it never gates, retries, reorders, or changes the arguments or the result of
  the grade. No `await` is added to the critical path - the timer reads
  `performance.now()`/`Date.now()` before and after a call that already happens.
  Seam W records from a `useEffect` and a ref, NOT from React `setState`, so it
  adds no render. (The non-blocking tier-2 call at
  `useIncrementalGradingRun.ts:166-183`, dead seam #6, is NOT instrumented by
  this item, so there is no non-blocking seam to preserve here; if it is ever
  instrumented when RULING 116 lands, it must stay non-blocking.)
- **No student personal data in any field.** `label` is the fixed operation
  label from section 3, never a student name. `error` carries only the server
  action's own error string (already scrubbed + capped by
  `sanitizeSessionDiagnosticError`, `:157`), never submission content; the
  per-item `classifyItemFailure` message must be checked to carry no student
  text. `course` may hold a Canvas URL (already permitted); `institution` an
  acronym. A per-student count is permitted; a per-student identity is not.
- **The browser-only contract.** No server file (`src/app/api/**`,
  `src/app/actions/**`, any `"use server"`) imports the recorder or the grading
  wrapper. Section 1, enforced by section 8's extended scan.
- **The scrub-then-cap order** (`:51-58`) and the entry-count cap
  (`MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES = 500`, `:170`) are untouched; grading
  traffic simply shares the cap. Note: a large batch can now push toward the
  500 cap faster - the cap already drops oldest-first and counts drops
  (`:228-233`), so this is honest, not silent; no change needed, but the AC/UX
  seat should confirm 500 is still adequate for a long grading session
  (owner-walk).
- **No emojis** anywhere (repo rule; `src/lib/no-emojis.test.ts`).

---

## 8. Machine-checkable vs owner-walk

**Machine-checkable (unit-testable; no component renders here):**
- The core registry: `"grading"` in `SessionDiagnosticSurface` forces a
  `COVERAGE_BY_SURFACE` row (tsc), and `SURFACES`/labels entries. Pinned by a
  new assertion that `SESSION_DIAGNOSTIC_COVERAGE` contains a `grading` row.
- durationMs serialize/round-trip: record an entry with `durationMs`, build the
  log, `formatSessionDiagnosticLogJson` -> `JSON.parse` ->
  `parseSessionDiagnosticLogEntries` equals the stored entries (extends the
  existing case at `session-diagnostic-log.test.ts:524-548`). CSV contains the
  "Duration (ms)" column and the value. An entry with NO duration round-trips
  without a spurious `durationMs` key (pins the conditional store, section 4
  point 3/6).
- The honest-coverage flip: the coverage-keyword test (`:411-429`) updated to
  match the chosen final wording; `SESSION_DIAGNOSTIC_COVERAGE.length` and
  `SESSION_DIAGNOSTIC_NOT_COVERED.length` floors.
- The grading wrapper's recorder: `recordGradingDiagnosticEntry` writes a
  `surface:"grading"` entry readable back via
  `readSessionDiagnosticSurfaceEntries("grading")` (mirror of
  `contentDiagnosticLog.test.ts`).
- **Browser-only, extended:** the server-import scan
  (`session-diagnostic-log.test.ts:640-649`) is widened to also fail if any
  server file references the grading wrapper's specifier
  (`gradingDiagnosticLog`). One added `candidates` substring check.
- A sample instrumentation wiring test per the content-tab precedent: a pure
  seam test that, given a resolving/rejecting fake action, records the right
  operation + outcome + a numeric duration (drive the CHAT hook's injected
  `dispatchItem` seam, `useContinuousGradingRun.ts:78` - the no-render lifecycle
  harness that hook already supports, `:28-29`). This proves recording happens
  WITHOUT rendering a component. (Note: round-1 cited
  `useIncrementalGradingRun.ts:49`'s `submitWholeRun` injection as a drivable
  seam; it is NOT exercised in a live wave - the incremental hook's branch past
  `:246` is dead, section 6. The whole-run timing is tested through the pure
  leaf below instead.)
- **Seam W's decision leaf:** `decideWholeRunDiagnostic({ startedAtMs,
  settledAtMs, state })` (section 6 part 3) is pure and unit-tested with no
  render: `startedAtMs: null` -> returns `null` (no spurious record on an
  unrelated state change); a started + error state -> a `grade_whole_run`
  failure record with `durationMs = settledAtMs - startedAtMs`; a started +
  `state.run` success state -> a success record. This is the machine-checkable
  obligation for seam W; the effect that calls it on the real `pending` edge is
  the reading claim below.

**Owner-walk / reading-claim only (this environment renders no component, has no
`.env`, no API keys, blocks the network - `this-repo.md:245-264`):**
- That seam W's `useEffect` in `GradingTab.tsx` actually calls the decision leaf
  on the real `pending`-settle edge with the ref-captured start (reading claim:
  no component renders under vitest; the leaf itself is unit-tested above).
- That a real recorded session's downloaded file actually shows a long-duration
  `grade_whole_run` entry for the real zip-upload lag the owner is chasing. The
  unit tests prove a duration is recorded and serialized; only the owner can
  confirm the live capture reflects the real lag.
- Whether the 500-entry cap is adequate for the owner's longest grading session.
- The on-screen duration rendering in `SessionLogSection.tsx` (reading claim).

---

## 9. Forks, with recommendations

- **F1 - one surface vs several.** Recommend ONE (`"grading"`). Section 2.
- **F2 - add durationMs vs not.** Recommend ADD (optional). Section 4. This is
  the owner's actual need; without it the request is only half-served.
- **F3 - coverage flip: smallest honest set vs all-grading at once.** Recommend
  SMALLEST honest set first (chat + main tab = the zip-lag), with the
  NOT_COVERED grading line narrowed, not deleted, and later seams migrating
  their parts. Section 5. Rationale: ships the owner's diagnosability sooner and
  keeps every intermediate state honest; the alternative waits on all 14 seams
  (several of which sit in files other in-flight work is editing, section 10).
- **F4 - close the server-import enforcement gap or leave it.** Recommend CLOSE
  it (extend the scan to the wrapper specifier, section 8). It is a one-line
  test change and the gap is a real cross-request-state footgun that no current
  test catches.
- **F5 - GradingResults.tsx (996 lines) headroom.** Measured
  `wc -l src/app/components/GradingResults.tsx` = 996; ceiling is 1000
  (`src/file-size-ceiling.structure.test.ts:41`). Two `post_grades` sites here
  (`:413`,`:491`) plus an import cannot be added inline without breaching the
  ceiling. Recommend the wrapper expose a thin timing helper so each site is a
  near-net-zero edit, and MEASURE with `@(Get-Content ...).Count` at build; if
  it still breaches, a small extraction precedes the seam. DraftedGradesTab.tsx
  (901) and GithubGradingPanel.tsx (901) have headroom; flagged for measurement
  all the same.

None of these needs an owner answer to START the recommended reading: F1/F2/F3
have clear recommendations the build can proceed on, and the owner redirects if
wrong. The only genuinely owner-shaped question is whether the coverage wording
(section 5) should claim more than the first wave delivers - and the
recommendation (narrow, honest) is the safe default.

---

## 10. Wave plan, serialization, and the `owns` list

### Serialization (the shared-file constraint, from the brief, re-measured)

The core change (`src/lib/session-diagnostic-log.ts` + its test) is DISJOINT
from every grading file and can land first. The instrumentation call sites land
in grading files that other in-flight work touches:
- the zip-lag fix is in `src/lib/grade/extraction.ts` (server, disjoint from
  these client seams - no collision);
- submission-labels work is in the chat composer/driver
  (`useContinuousGradingRun.ts` and the chat panel - a REAL collision with seam
  #1-#3), so the chat seams serialize behind it;
- **`GradingTab.tsx` carries an UNCOMMITTED working-tree modification** (`git
  status --short` at HEAD ~fbd8a958 shows `M src/app/components/GradingTab.tsx`).
  Seam W and seam #14's GradingTab site both edit this file, so they serialize
  behind that modification committing. The build MUST re-measure
  `@(Get-Content src/app/components/GradingTab.tsx).Count` against the committed
  state before adding seam W (current measured count 618, ceiling 1000 -
  `@(Get-Content).Count`; ample headroom for a ref + a one-line start capture +
  a ~6-line effect, but re-measure because the file is mid-edit).

The repo-grades, drafted and post seams are in files no listed in-flight work
edits and can proceed in parallel.

### Waves

**Wave 1 - durationMs, core only (disjoint, lands first).**
Write set: `src/lib/session-diagnostic-log.ts`, `src/lib/session-diagnostic-log.test.ts`,
`src/app/account/diagnostics/SessionLogSection.tsx` (optional on-screen
duration). No surface/coverage change. Fully backward-compatible and honest on
its own (durations simply start appearing for the two existing surfaces, which
pass none, so no behaviour change there either). Ships independently of all
grading work.

**Wave 2 - the grading surface + the first LIVE seams, ATOMIC. Dead seams
#4/#5/#6 are NOT in this wave.**
Write set:
- `src/lib/session-diagnostic-log.ts` (+ test): add `"grading"` surface,
  SURFACES, label, COVERAGE row, narrow (do not delete) the NOT_COVERED grading
  line, flip the coverage test, extend the server-import scan.
- `src/app/components/grading/gradingDiagnosticLog.ts` (NEW) + its test: the
  operation vocabulary (incl. `grade_whole_run`), `recordGradingDiagnosticEntry`,
  and the pure `decideWholeRunDiagnostic` leaf (section 6 part 3, section 8).
- **Seam W (`GradingTab.tsx`)** - the main-tab whole-run timing (ref in
  `submitWholeRun` + the `pending`/`state` effect calling the leaf). This is the
  seam that captures the owner's main-tab zip lag TODAY. Serializes behind the
  uncommitted `GradingTab.tsx` modification (serialization note above).
- Seams #1-#3 (`useContinuousGradingRun.ts`) - the chat operations, serialized
  behind the submission-labels work.
- `fetch_canvas_meta` seam (#14) rides with whichever file owns it (GradingTab
  site with seam W; chat-panel site with the chat seams).

Cut, by the two collisions, into:
- **Wave 2a (main tab):** core registry change + the NEW wrapper + seam W + the
  GradingTab `fetch_canvas_meta` site. Self-sufficient honest coverage - the
  whole-run grade (the owner's lag) is covered, the NOT_COVERED grading line
  names the still-uncovered chat/repo/post parts. Lands once GradingTab.tsx's
  in-flight modification commits.
- **Wave 2b (chat):** seams #1-#3 + the chat-panel `fetch_canvas_meta` site,
  adding the chat operations to the already-covered surface with no
  coverage-honesty change. Lands behind submission-labels.

Seams #4/#5/#6 (the GradingTab incremental route) are OMITTED: they are dead
code until RULING 116 (section 6). Instrumenting them is RES-GDIAG-1, carried to
whenever the route is made reachable.

**Wave 3 - the remaining grading seams (adds operations to a covered surface).**
Write set: `GithubGradingPanel.tsx` (#7,#8), `useRepoGradesBulkGrade.ts` (#9),
`GradingResults.tsx` (#10, subject to F5), `repo-grades/index.tsx` +
`RepoGradesGrid.tsx` (#11), `DraftedGradesTab.tsx` (#12),
`AssignmentChecklistPanel.tsx` (#13). These files are pairwise disjoint from each
other EXCEPT the two repo-grades files (#9,#11) which should land together. This
wave DELETES the narrowed NOT_COVERED grading line and widens the coverage row
wording to name posting and repo grading. Each sub-group is independently
pushable; cut into 2-3-item concurrent sub-waves by disjoint file set.

### `owns` / impact list

Command (run from repo root, worktree excluded):
```
grep -rln "session-diagnostic-log" src --include=*.ts --include=*.tsx | grep -v ".claude/worktrees" | sort
```
Output (2026-10-08):
```
src/app/account/diagnostics/SessionLogSection.tsx
src/app/account/diagnostics/page.tsx
src/app/components/ContentTab.tsx
src/app/components/content-tab/contentDiagnosticLog.test.ts
src/app/components/content-tab/contentDiagnosticLog.ts
src/lib/accommodations.test.ts
src/lib/accommodations.ts
src/lib/session-diagnostic-log.test.ts
src/lib/session-diagnostic-log.ts
```
Reading notes on this list:
- `accommodations.ts` / `accommodations.test.ts` match the BAN comment
  (section 0 correction 1), not an import - do not touch them, and the extended
  server-import scan must keep passing them (they must NOT import either module).
- `ContentTab.tsx`, `contentDiagnosticLog.ts`/`.test.ts` consume the core but
  need NO change (section 4): the durationMs field is absent from their view
  shape and their callers pass none.
- The files that read the core AS SOURCE TEXT and can go red on a correct
  change: `src/lib/session-diagnostic-log.test.ts` (the server-import scan walks
  all of `src`, and the coverage/round-trip assertions), plus the repo-wide
  structure canaries that scan every file regardless of import:
  `src/file-size-ceiling.structure.test.ts` (1000-line ceiling - F5),
  `src/source-bytes.structure.test.ts` (no BOM/NUL), `src/lib/no-emojis.test.ts`.
  Every wave gate and verify must include `file-size-ceiling.structure.test.ts`
  unconditionally (`this-repo.md:42-49`), and run the named test set with
  `npm run test:paths <p1> <p2> ...` (never a raw multi-path vitest -
  `this-repo.md:52-66`).
- This grep lists importers of the CORE module only. The seam files (section 6),
  incl. `GradingTab.tsx` for seam W, import the NEW wrapper
  (`gradingDiagnosticLog.ts`), so they are NOT in this list - they are the
  section-6 write set, enumerated there. `GradingTab.tsx` is a seam-W write
  target subject to the same repo-wide structure canaries above (its 618-line
  count is re-measured at build, serialization note, section 10).

### Disposition table

No prior SHIPPED version of this artifact exists (`docs/grading-diagnostics-coverage-scope.md`
is new this session; `git status` showed it untracked at HEAD). There is no
prior scope to map kept/handed-over/withdrawn against. The related in-flight
docs are `docs/submission-labels-scope.md` (untracked; the chat composer/driver
work seam #1-#3 serialize behind) - not a predecessor of this item, a
serialization neighbour.

**Round-2 re-anchor (this revision), recorded so the checker can trace what
moved and why.** A loop-checker returned the round-1 draft DEFECTIVE on one
blocker: the headline seam was DEAD CODE. Applied, per orchestrator ruling:
- **Seams #4/#5/#6 (GradingTab incremental route): KEPT in the table as
  documentation, REMOVED from every live wave.** Reason: `routeGradingRun`
  returns `"whole-run"` unconditionally while `INCREMENTAL_ROUTE_ENABLED = false`
  (`incrementalRunPlan.ts:110,132`, RULING 116), so `startReview` never reaches
  them (`useIncrementalGradingRun.ts:229-232`). Their instrumentation is handed
  to RES-GDIAG-1 (the change that makes the route reachable).
- **Round-1 RES-GDIAG-1 ("whole-run has no client await") PROMOTED to IN SCOPE
  as seam W** (Wave 2a). It is timed CLIENT-side from `submitWholeRun` dispatch
  to `useActionState` settle. This is the seam that actually captures the
  owner's main-tab zip lag; it replaces the dead seam #4 as "the owner's lag".
- **Claim-1 (section 0) CORRECTED:** not "every surface awaits its server call";
  the main-tab whole-run path is a form-action dispatch, timed by an effect.
- **NIT fixed:** the NOT_COVERED 6 -> 5 transition is W3 (entry deleted), not W2
  (entry edited); W2 keeps 6.
- **Cross-scope FINDING (conflict with the ruling's wording, reported):** the
  ruling said the bulk-zip build "ENABLES INCREMENTAL_ROUTE_ENABLED" and the
  dead seams should be "folded into" it. The tree disagrees -
  `docs/bulk-zip-grading-scope.md:140-158,302-304` explicitly keeps
  `INCREMENTAL_ROUTE_ENABLED = false`, does NOT revive GradingTab's incremental
  route, and routes the bulk zip through the CHAT pump instead. So the dead
  seams are NOT folded into bulk-zip (that build never hosts them); they stay
  RES-GDIAG-1 against RULING 116. This is the ruling's OWN contingency branch
  ("if it routes through the chat pump instead, chat seams #1-#3 cover it"),
  adopted because it is what the bulk-zip scope actually does. See RES-GDIAG-1.

---

## 11. Residual register

Each entry has an owner, an instrument, and the step that measures it. These
belong in `docs/BACKLOG.md` when this item is chunked; a residual that is not in
the backlog does not exist.

- **RES-GDIAG-1 - the GradingTab incremental-route seams (#4/#5/#6) are
  unreachable until RULING 116 is resolved.** (Round-1's RES-GDIAG-1 - "whole-run
  has no client await" - is RESOLVED: promoted to seam W, Wave 2a. This entry now
  carries the dead incremental seams the round-2 blocker exposed.) Owner: whoever
  resolves RULING 116 and flips `INCREMENTAL_ROUTE_ENABLED` to `true`
  (`incrementalRunPlan.ts:110`; `docs/ruling-116.md`). Instrument: the no-render
  lifecycle wiring test the hook already supports
  (`useIncrementalGradingRun.lifecycle.test.ts`, harness at
  `useIncrementalGradingRun.ts:11-18`), asserting a resolving/rejecting fake
  `prepareGradingRunAction`/`postGradeRunItem`/`completeGradingRunHeaderAction`
  records `prepare_run`/`grade_item`/`resolve_tier2` with a numeric duration.
  Step: add seams #4/#5/#6 in the SAME change that makes `routeGradingRun` return
  `"incremental"`, so the route never ships reachable-but-uninstrumented. Until
  then the route is dead code, not a user-visible coverage gap (section 5).
  **Explicitly NOT folded into the bulk-zip build:**
  `docs/bulk-zip-grading-scope.md:140-158,302-304` keeps the flag `false` and
  routes bulk zip through the chat pump, so that build never hosts these seams.
  Cited: `incrementalRunPlan.ts:110,132`; `useIncrementalGradingRun.ts:171,193,246,229-232`.
- **RES-GDIAG-1b - main-tab bulk zip, once bulk-zip lands, is covered by the
  CHAT seams, not by a new seam.** The bulk-zip build routes the main-tab bulk
  zip through `useContinuousGradingRun` (`docs/bulk-zip-grading-scope.md:140-158`),
  which the LIVE chat seams #1-#3 already instrument, so the bulk-zip main-tab
  path records `resolve_header`/`prepare_submission`/`grade_item` automatically
  when it ships. Owner: the bulk-zip build. Instrument: the chat seam #1-#3
  wiring test (section 8). Step: when bulk-zip lands, confirm the main-tab bulk
  flow dispatches through `useContinuousGradingRun` (not a new dispatcher) so the
  chat seams cover it; no new grading seam is required. Cited:
  `docs/bulk-zip-grading-scope.md:91-107,142-144`.
- **RES-GDIAG-2 - 500-entry cap adequacy for a long grading session.** Owner:
  the owner (owner-walk; no live session here). Instrument: a real recorded
  grading session's downloaded file. Step: owner confirms the cap did not drop
  entries they needed, or the AC/UX seat proposes a raise. Cited:
  `session-diagnostic-log.ts:170,228-233`.
- **RES-GDIAG-3 - live capture reflects the real zip-upload lag.** Owner: the
  owner (owner-walk). Instrument: the downloaded session log after reproducing
  the lag. Step: owner verifies a long-duration `grade_whole_run` entry appears
  (seam W - the LIVE main-tab whole-run path; NOT the dead `prepare_run`, which
  is unreachable per RES-GDIAG-1). This is the acceptance the whole item exists
  for and cannot be verified in this environment.
- **RES-GDIAG-4 - GradingResults.tsx (996) ceiling headroom (F5).** Owner: the
  implementer of Wave 3's `post_grades` seam. Instrument:
  `@(Get-Content src/app/components/GradingResults.tsx).Count` and
  `src/file-size-ceiling.structure.test.ts`. Step: measure after the seam; if
  >= 1000, extract before landing.

---

## 12. Leverage trigger

This item EXTENDS an existing owner-facing diagnostic capability (the session
log download), it does not build a new user-reachable capability - closest to a
reliability/observability change. Per `DEV_LOOP.md` "The loop / Criteria", the
leverage claim is required for a chunk that builds or changes a capability a
user reaches, not for a bug fix, refactor or observability plumbing. **Fired
trigger: observability extension of an existing capability - thin but real
mechanism, class call left to the AC seat/owner.** The honest mechanism, stated
for the AC seat to weigh (not defaulted here): the app records elapsed time
around its OWN server round-trips and emits them in a downloadable, re-parseable
file (`formatSessionDiagnosticLogJson` round-trip, `:437`) - a chat window
cannot instrument the app's operations or time its server calls, so a lag that
is "nothing" in a chat is a long-duration row here. If the AC seat treats this
as a leverage claim, the removal test is the durationMs serialize/round-trip
assertion (section 8): delete the duration recording and that assertion goes
red. If it treats this as observability plumbing with no claim, record that as
the fired trigger and move on. The three-way call (claim / accept-as-plumbing /
reject) is the owner's, per `leverage.md:112-123`.
