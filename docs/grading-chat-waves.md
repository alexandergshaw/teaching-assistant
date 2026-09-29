# Wave plan: the Grading chat surface (GRADING-CHAT)

Seat: Wave plan (`loop-plan`). This is the LAST design activity before the build.
A fresh `loop-checker` reads this before any implementer is dispatched.

Consumes, and builds on rather than re-derives:
- `docs/grading-chat-architecture.md` (the SHAPE: R1 driver, R3 taxonomy, R4
  bound, the mount, storage) and its check `docs/grading-chat-architecture-check.md`
  (verdict SOUND ENOUGH, one BLOCKER on `pointsPossible`).
- `docs/grading-chat-security.md` (F1 route guard, F4 input bounds, F2/F3/F5).
- `docs/grading-chat-reliability.md` (RES-GC-8 partial-grade, RES-GC-9 wedge,
  RES-GC-11 disclosure floor, RES-GC-13 pacing, observability).
- `docs/grading-chat-ux.md` (layout order, slotProps split, Send focus, copy,
  append-vs-reset).
- `docs/grading-chat-acceptance-criteria.md` (AC-1..17, AC-L).

Read-only pass: the ONLY file this pass writes is this document. No `src/` file
was opened for writing; nothing committed, nothing pushed.

---

## 0. Instruments - every quantity names its command

| Quantity | Instrument |
|---|---|
| Line count A | `wc -l < <path>` (Bash, Git Bash) |
| Line count B | `@(Get-Content <path>).Count` (PowerShell) |
| Source-text / importing test readers of a file | `grep -rln "<basename>" src --include=*.test.ts` (each opened) |
| Symbol occurrence / decl-call split | `src/tools/symbol-count/count.ts` (never `grep -c`) |
| Guard/seam citations | `Read` / `grep -n` at the cited line, on HEAD `759f6c60` + working tree |
| Tree state | `git status --short` |
| Docs gate (this file) | `npm run docs:gate` |

**Both counters, on the working tree, for every file this wave touches or the
plan relies on** (agree on all; command shown above):

| Path | `wc -l` | `@(Get-Content).Count` | Role in this wave |
|---|---|---|---|
| `src/app/page.tsx` | 804 | 804 | EDIT P2 (mount, grows ~14) |
| `src/app/components/manual/manual-rail.ts` | 360 | 360 | EDIT P1 (enumeration, grows ~6) |
| `src/app/components/manual/manual-rail.test.ts` | 558 | 558 | EDIT T1 (canary 5->6) |
| `src/app/components/tabs/topLevelTabs.wiring.test.ts` | 634 | 634 | EDIT T2 (new I-chat-mount) |
| `src/app/components/grading/incrementalRunPlan.ts` | 299 | 299 | REUSE (import), NOT written |
| `src/app/components/grading/useIncrementalGradingRun.ts` | 299 | 299 | REUSE (model), NOT written |
| `src/app/api/grade-run-item/route.ts` | 206 | 206 | REUSE (POST target), NOT written |
| `src/lib/grade/run-header.ts` | 60 | 60 | REUSE (import in N2), NOT written |
| `src/lib/grade/single-file-entry.ts` | 133 | 133 | REUSE (import in N2 only), NOT written |
| `src/lib/grade/repo-content.ts` | 134 | 134 | REUSE (import in N2), NOT written |
| `src/app/components/grading-results/RowFeedbackBoxes.tsx` | 159 | 159 | REUSE (import in N4), NOT written |
| `src/app/components/GradingResults.tsx` | 918 | 918 | REUSE (import in N4), NOT written - **near ceiling; must NOT be edited** |
| `src/app/actions/grading-incremental.ts` | 230 | 230 | REUSE (model), NOT written |

`route.ts` is 206 (not the architecture's 192) because F1 already landed in the
working tree - see section 1. `GradingResults.tsx` at 918 is the results table
this surface reuses UNCHANGED; a wave that edited it would risk the 1000 ceiling
for no reason. It is a hard do-not-edit.

---

## 1. State of the two concurrent items this plan must account for

**F1 (security route guard) has ALREADY LANDED in the working tree.** [MEASURED,
`grep -n "requireUser\|requireAppOwner" src/app/api/grade-run-item/route.ts` and
`git diff src/app/api/grade-run-item/route.ts`]:

- `route.ts:3` now imports `requireAppOwner`; `route.ts:147` calls
  `await requireAppOwner();` in the POST guard. The old `requireUser()` is gone.
- The diff is uncommitted (the concurrent F1 implementer is mid-flight), touching
  `src/app/api/grade-run-item/route.ts` and `src/app/api/grade-run-item/route.test.ts`.

**Consequence for this plan: this wave CONSUMES the tightened guard and does NOT
re-tighten it.** The two new chat "use server" actions (N2) are specified
`requireAppOwner()` (matching `prepareGradingRunAction`), and the route they
dispatch to is now `requireAppOwner()` too - the whole grading call graph is
owner-gated and consistent. F1 (SEC-GC-2 / R7) is therefore closed for this
wave's purposes; it is NOT in this wave's write set and this wave must NOT edit
`route.ts` (see the disjointness computation, section 4).

**L13 (one snapshot-grading test) is in flight** on
`src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts`
and `docs/css-orphans.md`. Neither is in this write set. Note `route.test.ts`
mentions "grading-chat" only in F1-provenance COMMENTS
(`route.test.ts:19,281,316`) - not a dependency on this wave.

Full tree at plan time [MEASURED, `git status --short`]:
```
 M docs/css-orphans.md
 M src/app/api/grade-run-item/route.test.ts
 M src/app/api/grade-run-item/route.ts
 M src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts
```

---

## 2. The cut: ONE wave, with a pre-planned panel decomposition and a hard split trigger

**Verdict: ONE wave.** The surface is a LAYER (architecture section 10.1), and its
reuse spine (route, plan leaf, extractors, results table) already exists. What is
new - the pure leaf, the intake action, the driver, the panel, the mount - is
tsc- and reachability-coupled in a single chain: mount -> panel -> driver ->
action -> leaf. Any layer-by-layer split ships an export whose only caller is in
the next wave, which is precisely this repo's recorded failure ("two live server
actions whose ONLY CALLER was in the next wave... two POST endpoints shipped with
no surface"; "a library and an endpoint with no surface between them"). Every
export's caller lives in this one wave (caller table, section 3).

**Why NOT a layer split, stated concretely so the checker can verify the trap:**
- N1 alone (the pure leaf) exports `buildTextEntry` (runtime, not type-only) whose
  callers are N2 and N3 - so N1 is not independently gateable and the type-only
  exception (`seats.md`) does not apply.
- N2 alone exports two live server actions (`prepareChatSubmissionAction`,
  `resolveChatRunHeaderAction`) whose only caller is N3 - the exact "two POST
  endpoints with no surface" failure.

**The one real risk of one wave is the panel's size, and it is handled by
construction, not by hope.** `GradingChatPanel.tsx` carries the heaviest folded
load (three input regions, three composer modes, results-table wiring, the
disclosure floor, focus retention, per-state copy, append-vs-reset). The
architecture estimated ~300-420 and flagged a `ChatComposer.tsx` split as a
contingency it handed to this seat. This plan **pre-plans that decomposition**
(section 6): the composer is authored as its own client leaf `ChatComposer.tsx`
(N4b) from the start, imported by `GradingChatPanel.tsx` (N4a) - caller in wave -
so the panel stays under a hard sub-ceiling by design. Both files ship in this
one wave; the split is not a separate wave.

**Concurrency verdict:** this wave runs as ONE implementer dispatch (its files are
mutually coupled; there is no disjoint sub-partition that keeps every export's
caller in-wave). It is concurrency-SAFE against the in-flight F1/L13/css-orphans
work (section 4), so it may run alongside them; it does not need to wait, but it
does need F1's guard to remain `requireAppOwner()` (it does - section 1).

**A risk-isolation FALLBACK exists but is NOT recommended and is NOT concurrent.**
The architecture's 1a/1b cut by submission KIND (1a text-only spine + mount +
driver; 1b file/zip/url intake) keeps each half reachable end to end. If the
owner wants smaller diffs, it is legal - but 1a and 1b write the SAME four
production files (N1-N4), so they are strictly SEQUENTIAL (same-path collision,
never concurrent), and 1a already builds the panel + mount + disclosure, so it
does not reduce the ceiling risk. Recommend one wave; record 1a/1b as the fallback
only.

---

## 3. The wave: write set, exports, callers, gateability

Write set derived by opening each file the architecture names and confirming the
caller of every export is present. NEW = file does not exist (confirmed: `grep
-rln 'grading-chat' src --include=*.test.ts` returns only the F1 comment in
`route.test.ts`; no `grading-chat` source file exists).

| # | Path | New/edit | Exports it introduces | Where those exports are called (in-wave) | Independently gateable? |
|---|---|---|---|---|---|
| N1 | `src/app/components/grading-chat/chatSubmissionIntake.ts` | NEW (pure client-safe leaf) | `ChatSubmissionInput`, `IntakeOutcome` (WITH `pointsPossible`, section 5.1), `buildTextEntry(input, ordinal)` (with the F4 label bound, section 5.7) | N2 (server) and N3 (driver) import the types + `buildTextEntry` | No alone (runtime export `buildTextEntry`); gateable in-wave |
| N2 | `src/app/actions/grading-chat-intake.ts` | NEW ("use server") | `prepareChatSubmissionAction`, `resolveChatRunHeaderAction`; `buildRepoUrlEntry` is module-private (NOT exported) | N3 (driver) calls both actions | No alone (live actions); gateable in-wave. **BUILD gate required** |
| N3 | `src/app/components/grading-chat/useContinuousGradingRun.ts` | NEW ("use client") | `useContinuousGradingRun` hook (seam in architecture 2.4, refined section 5) | N4a (panel) calls the hook | No alone; gateable in-wave |
| N4a | `src/app/components/grading-chat/GradingChatPanel.tsx` | NEW ("use client") | `GradingChatPanel` (default export) | P2 (page.tsx) mounts it | No alone; gateable in-wave |
| N4b | `src/app/components/grading-chat/ChatComposer.tsx` | NEW ("use client") | `ChatComposer` (the three-mode composer, section 6) | N4a imports it | No alone; gateable in-wave |
| P1 | `src/app/components/manual/manual-rail.ts` | EDIT | none (adds a `GradingView` member + destination + resolver branch) | its own derived guards; P2 reads `gradingView` | Yes (self-guarded) |
| P2 | `src/app/page.tsx` | EDIT | none (imports + mounts N4a) | is the SOLE mount of `GradingChatPanel` | Yes |
| T1 | `src/app/components/manual/manual-rail.test.ts` | EDIT | I-inner canary 5->6 ids/labels + title/description | - | - |
| T2 | `src/app/components/tabs/topLevelTabs.wiring.test.ts` | EDIT | new I-chat-mount (models `assertAlwaysMounted`, `:520-548`) | - | - |
| T3a | `src/app/components/grading-chat/chatSubmissionIntake.test.ts` | NEW | I-taxonomy (pure leaf) | - | - |
| T3b | `src/app/actions/grading-chat-intake.test.ts` | NEW | I-intake-action (mocked extractors, network blocked) | - | - |
| T4 | `src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts` | NEW | I-continuous-driver (no-render `vi.mock("react")`, mocked seam) | - | - |
| T5 | `src/app/components/grading-chat/GradingChatPanel.structure.test.ts` | NEW | source-text canaries: disclosure copy present, Send `.focus()` present | - | - |

**Caller rule discharged:** N1<-N2/N3, N2<-N3, N3<-N4a, N4b<-N4a, N4a<-P2, P1
self-guarded + read by P2. No export ships without its caller in this wave. No
type-only exception is claimed (N1 has runtime `buildTextEntry`).

**Enumeration edits in P1** (each forced; citations `grep -n` on
`manual-rail.ts`): `GradingView` union at `:38` (add `"chat"`);
`GRADING_VIEW_PRESENCE` at `:40-46` (add `chat: true`, tsc-forced by
`Record<GradingView, true>`); the Grading destinations group at `:113-122` (add a
6th `{ id: "grading-chat", label, description }`, canary-forced by T1);
`resolveStateFromDestinationId`'s gradingView IIFE at `:328-336` (add
`if (id === "grading-chat") return "chat";`, derived-guard-forced by
`manual-rail.test.ts:323-337`). No edit to `getActiveDestinationId` (generic
template), `INNER_NAV`, or `getInnerNavAriaLabel` ("Grading tools" name
preserved).

**Mount edit in P2** [MEASURED, `page.tsx` read at `:685-729`]: add ONE
always-rendered display-toggled `<div>` wrapping `<GradingChatPanel>` immediately
after the `SnapshotGradingPanel` div (closes at `:729`, before the
`activeTab === "files"` block at `:731`), display-gated and `active` on
`activeTab === "manual" && toolsSection === "manual" && manualView === "grading"
&& gradingView === "chat"`. This is the always-mounted capture idiom
(`:685-729`), NOT the drafts plain-conditional idiom (`:649-650`). NO edit to the
run/repos ternary at `:617-624` ("chat" is neither run nor repos, so I-R-1 at
`topLevelTabs.wiring.test.ts:576-591` stays green). NO edit to the drafts
conditional.

---

## 4. Disjointness, both senses, pasted

### 4.1 Same-path (the easy sense)

This wave's write set (production + tests):
```
src/app/components/grading-chat/chatSubmissionIntake.ts          (N1, new)
src/app/actions/grading-chat-intake.ts                           (N2, new)
src/app/components/grading-chat/useContinuousGradingRun.ts       (N3, new)
src/app/components/grading-chat/GradingChatPanel.tsx             (N4a, new)
src/app/components/grading-chat/ChatComposer.tsx                 (N4b, new)
src/app/components/manual/manual-rail.ts                         (P1, edit)
src/app/page.tsx                                                 (P2, edit)
src/app/components/manual/manual-rail.test.ts                    (T1, edit)
src/app/components/tabs/topLevelTabs.wiring.test.ts              (T2, edit)
src/app/components/grading-chat/chatSubmissionIntake.test.ts     (T3a, new)
src/app/actions/grading-chat-intake.test.ts                      (T3b, new)
src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts (T4, new)
src/app/components/grading-chat/GradingChatPanel.structure.test.ts (T5, new)
```

In-flight concurrent set [MEASURED, `git status --short`, section 1]:
```
docs/css-orphans.md
src/app/api/grade-run-item/route.ts
src/app/api/grade-run-item/route.test.ts
src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts
```

**Intersection by exact path: EMPTY.** No file appears in both lists. The wave
must NOT edit `route.ts` (it only READS it as the POST target), NOT edit
`route.test.ts`, NOT edit the snapshot test, NOT edit `css-orphans.md`.

### 4.2 Informational (the sense that is invisible until integration)

Does this wave design against a fact the in-flight work is chartered to change,
or vice versa? Computed from each side's stated write set:

- **route.ts (F1):** F1 changes ONLY the guard (`requireUser` -> `requireAppOwner`),
  not the grading contract (still `gradeEntries([entry], ...)`, one `GradeResult`
  out, same `GradeRunItemRequestBody` body incl. `pointsPossible` at
  `incrementalRunPlan.ts:64`). This wave designs against the CONTRACT (dispatch one
  entry, receive one result), not against the guard value. The one fact this wave
  DOES rely on - that the route is owner-gated so the chat's owner-gated actions
  are consistent - is the fact F1 ESTABLISHES, not one it removes. No conflict; the
  dependency runs the right direction (this wave consumes F1's result).
- **snapshot test (L13):** touches only
  `snapshot-role-setrole-callsites.structure.test.ts`. This wave's gate runs a
  DIFFERENT snapshot file, `snapshot-grading.structure.test.ts` (a page.tsx
  reader). They are distinct files; L13 changes no fact this wave reads.
- **css-orphans.md:** documentation; changes no code fact.

**No informational collision.** Neither side pins a fact the other is chartered
to change.

### 4.3 The reader sets the gate must carry (derived, not inherited)

`grep -rln "<basename>" src --include=*.test.ts`, each confirmed:

- **`page.tsx` readers:** `action-guard-coverage.test.ts`, `useAppNavigation.test.ts`,
  `manual-rail.test.ts` (T1), `repoGradesSliceA.guards.test.ts`,
  `snapshot-grading.structure.test.ts`, `topLevelTabs.wiring.test.ts` (T2),
  `canvas-credentials.exports.test.ts`, `drafts-nav.test.ts`,
  `knowledge-return.test.ts`, `runtime-import-graph.test.ts`, `visualizer.test.ts`.
- **`manual-rail` readers:** `announcements-panel.wiring.test.ts`,
  `contentTab.wiring.test.ts`, `useAppNavigation.test.ts`, `manual-rail.test.ts`
  (T1), `snapshot-grading.structure.test.ts`, `topLevelTabs.wiring.test.ts` (T2),
  **`tab-rails.test.ts`**.

**Correction to the architecture's gate list:** the architecture's owns list
(section 10.4) OMITTED `src/app/components/tabs/tab-rails.test.ts`, which imports
`MANUAL_VIEW_LABELS`/`MANUAL_VIEW_ORDER` from `manual-rail` (`tab-rails.test.ts:22`).
The enumeration edit does not touch those symbols, so it is expected GREEN, but it
imports a file this wave edits and MUST be in the gate. It is added to the
`test:paths` list (section 8).

---

## 5. The seven folded requirements: placement in a wave file + a test

Every requirement is placed in a specific write-set file and a specific test.
Order of the list follows the brief.

| # | Requirement | Production file | Test (object -> direction of failure) |
|---|---|---|---|
| 1 | **BLOCKER-1: `pointsPossible` threads through the intake seam.** `IntakeOutcome`'s entries variant gains `pointsPossible: number \| null`; the Canvas branch of `prepareChatSubmissionAction` fills it from `extractCanvasEntries`'s sibling field (`extraction.ts:178`, `return { entries, pointsPossible }`); the driver copies it into every dispatched `GradeRunItemRequestBody.pointsPossible` (the slot already exists, `incrementalRunPlan.ts:64`). | N1 (type), N2 (Canvas fill), N3 (thread to body) | T3b: mock `extractCanvasEntries` -> `{entries, pointsPossible: 100}`; assert the intake outcome carries `pointsPossible === 100`. T4: assert a Canvas-URL submission's dispatched body (the mocked `dispatchItem` argument) carries `pointsPossible === 100`. RED when the field is dropped and a Canvas body dispatches with `null`. |
| 2 | **F1: consume the tightened route guard; do NOT re-tighten.** N2's actions are `requireAppOwner()`; the route is already `requireAppOwner()` (section 1). No `route.ts` edit. | N2 (actions use `requireAppOwner`) | T3b: assert both actions call `requireAppOwner` (mocked). RED if either uses `requireUser`. `route.ts` itself is covered by `action-guard-coverage.test.ts` in the gate, unedited. |
| 3 | **RES-GC-8: partial-grade-to-the-ceiling** (recommended reading). A multi-entry event whose expansion would carry `dispatchedCount` past `maxEntries` dispatches the first `maxEntries - dispatchedCount` entries and refuses ONLY the remainder with a named, count-bearing reason - mirroring `engine.ts:204` clip + `types.ts:140-142` disclosure. **Placement refinement, reported not silently reconciled (section 9):** the reliability doc located the clip at the action's return shape; the action has NO session `dispatchedCount`, so the clip MUST live in the driver's `submit()`, which knows it. The mechanism (clip-not-whole-refuse) is unchanged. | N3 (driver `submit()` clips) | T4: a 41-entry Canvas event with `maxEntries = 40` produces 40 dispatched + one partial refusal; assert `results.length` reaches 40 and a `partial` outcome names the clipped count. RED when the whole event is refused (zero rows) or silently truncated. |
| 4 | **RES-GC-9: the pool must not wedge** after `INCREMENTAL_CONCURRENCY` (3) failures. `pump()` must decrement `inFlight` and re-invoke `pump()` on BOTH the resolved and rejected path of every dispatch (a `.finally` that always decrements-and-pumps, with failure classification via `classifyItemFailure` separate). First-ever production use of this route (reliability section 1) - weight it. | N3 (driver `pump()`) | T4, named `repeated-failure-does-not-wedge`: mocked `dispatchItem` rejects 3 times consecutively, then a 4th `submit` is asserted to still call `dispatchItem`. RED when `pump()` omits `.catch`/`.finally` on any path and the 4th dispatch never fires. |
| 5 | **RES-GC-11: reload/crash disclosure floor.** A persistent on-screen warning that an in-flight/accumulated run is ephemeral (in-memory, lost on reload/tab-close). | N4a (panel renders the warning) | T5: source-text canary that the panel module contains the disclosure copy constant. RED when the disclosure string is absent. Visibility itself is OWNER-WALK (nothing renders). |
| 6 | **UX specifics:** layout order Instructions -> Rubric -> Results -> Composer reusing `.field`/`.form`/`.ghActions`/`.adaptRow`; URL-mode `onKeyDown` copies the Canvas-URL TOP-LEVEL pattern (`GradingTab.tsx:393`), text-mode uses `slotProps.input` (`AiChatWindow.tsx:575`), NOT `htmlInput`; Send `.focus()` back to the composer (RES-GC-UX-3); per-state copy strings (ux section 4); append-vs-reset (the chat appends `driver.results`, never resets the table - the load-bearing leverage). | N4a (layout, copy, results wiring, disclosure), N4b (composer: modes, slotProps split, Send focus) | T5: source-text canary that the Send handler calls `.focus()` on the composer ref after clearing (RES-GC-UX-3). T4 (behavioural, the leverage half): after N submits, `driver.results` has grown to N rows and was never reset to 1 - RED when a submit resets accumulated results. Layout/look/keyboard-firing are OWNER-WALK. |
| 7 | **F4: bound the inputs, degrade gracefully** (like `boundedItemTitle`, `accessibility.ts:31-33`, not fail-closed at the route). Gap 1: `resolveChatRunHeaderAction` bounds `assignmentInstructions`/`rubric` to 20000 chars (route's `MAX_INSTRUCTIONS_CHARS`/`MAX_RUBRIC_CHARS`) before `generateRubric` spends a model call. Gap 2: `buildTextEntry`'s label defaulter slices to `MAX_STUDENT_CHARS` (500) AFTER defaulting, so an overlong label degrades, not 400s. | N2 (Gap 1), N1 (Gap 2) | T3b: oversized instructions -> a bounded/refused outcome before any `generateRubric` call (mock it; assert not called or input pre-bounded). T3a: `buildTextEntry` with a 600-char label -> `student.length === 500`, non-empty, not thrown. RED when either bound is absent. |

**Note on observability (reliability section 6):** the recommended per-item
`console.error` rows belong in `route.ts`, which this wave must NOT edit. Routed to
the F1/operability owner as a residual (RES-GC-12b, section 10), explicitly out of
this wave.

---

## 6. Per-file line estimates + the GradingChatPanel split trigger

Estimates are [READING] (the files do not exist); the split is enforced by a
measured trigger, not by the estimate.

| Path | Estimate [READING] | Budget (hard sub-ceiling) | Headroom to 1000 |
|---|---|---|---|
| N1 `chatSubmissionIntake.ts` | ~70-110 | 300 | ample |
| N2 `grading-chat-intake.ts` | ~170-220 (RES-GC-8 clip is in N3, not here; F4 Gap1 + `buildRepoUrlEntry` add ~30) | 400 | ample |
| N3 `useContinuousGradingRun.ts` | ~200-260 (pump wedge-safety + RES-GC-8 clip + pointsPossible threading) | 400 | ample |
| N4a `GradingChatPanel.tsx` | ~220-320 (layout, results wiring, disclosure, per-state copy; composer extracted to N4b) | **550** | the one to watch |
| N4b `ChatComposer.tsx` | ~150-230 (three modes, SegmentedToggle, slotProps split, Send focus, accept list) | 400 | ample |
| P2 `page.tsx` | 804 -> ~818 | n/a | ~182 under |
| P1 `manual-rail.ts` | 360 -> ~366 | n/a | ample |
| T1 `manual-rail.test.ts` | 558 -> ~566 | n/a | ample |
| T2 `topLevelTabs.wiring.test.ts` | 634 -> ~672 | n/a | ample |

**The GradingChatPanel split trigger (mechanical, applied during the build):**
this plan already extracts the composer into N4b `ChatComposer.tsx` up front, which
is expected to keep N4a well under budget. If, at any measurement during the build,
`GradingChatPanel.tsx` exceeds **550 lines by EITHER counter** (`wc -l` AND
`@(Get-Content).Count`, since two tools here disagree by 42 on one file), extract
the results-table wiring block into a second client leaf
`src/app/components/grading-chat/ChatResultsTable.tsx` (imported by N4a - caller in
wave) IN THIS SAME WAVE, not a later one. Do NOT let N4a cross 1000; do NOT edit
`GradingResults.tsx` (918, the reused table) to make room. The
`file-size-ceiling.structure.test.ts` gate is the backstop.

---

## 7. Line-shift obligations

- **P2 (page.tsx):** inserting the chat sibling after `:729` shifts every line
  below 729 downward (~14 lines). Do any GATED instruments or in-flight artifacts
  pin page.tsx by line number past 729? **No.** T2's I-chat-mount and the existing
  I-W2/I-R-1 use `indexOf`/regex, not line numbers (`topLevelTabs.wiring.test.ts:522-589`).
  The other page.tsx readers assert content/imports, not source line offsets. No
  in-flight artifact (F1 = route.ts, L13 = snapshot test) pins page.tsx. **No
  re-pin owed.**
- **P1 (manual-rail.ts):** the enumeration edit shifts line numbers in
  manual-rail.ts. T1 and the other manual-rail readers assert content (ids,
  labels, resolver behaviour), not source line offsets. **No re-pin owed.**
- **This document** cites `manual-rail.ts` / `page.tsx` line numbers as they stand
  on the working tree; once P1/P2 land, those citations move. This is a design doc
  consumed BEFORE the build (by the checker, then the implementer), not a gated
  instrument, so no self-re-pin is owed - but the implementer should anchor edits
  by the quoted code, not by these line numbers (memory: stale-citation class).

---

## 8. The gate (one wave -> one gate)

Run from PowerShell, repo root, after all edits. Every path confirmed present on
the working tree.

```
git status --short
npx tsc --noEmit --incremental false
npm run lint
npm run test:paths -- src/app/components/manual/manual-rail.test.ts src/app/components/tabs/topLevelTabs.wiring.test.ts src/app/components/tabs/tab-rails.test.ts src/app/components/grading-chat/chatSubmissionIntake.test.ts src/app/actions/grading-chat-intake.test.ts src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts src/app/components/grading-chat/GradingChatPanel.structure.test.ts src/app/actions/action-guard-coverage.test.ts src/app/components/home/useAppNavigation.test.ts src/app/components/repo-grades/repoGradesSliceA.guards.test.ts src/app/components/snapshot-grading/snapshot-grading.structure.test.ts src/lib/canvas-credentials.exports.test.ts src/lib/drafts-nav.test.ts src/lib/knowledge-return.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/lib/visualizer.test.ts src/app/components/canvas-tab/announcements-panel.wiring.test.ts src/app/components/contentTab.wiring.test.ts src/lib/use-server-exports.test.ts src/file-size-ceiling.structure.test.ts
npm test
npm run build
wc -l <each written production path>   AND   @(Get-Content <each>).Count
```

Multi-file runs use `npm run test:paths -- <paths>`, NEVER a raw multi-path
`vitest`/`npm test` (silently drops unmatched args; enforced by
`gate-commands.structure.test.ts`; memory: test-paths-wrapper). `npx tsc --noEmit
--incremental false` carries the flag because the bare form races on
`tsconfig.tsbuildinfo`. `npm test` runs the FULL suite as the belt against any
reader not derived in section 4.3 (and it runs `no-emojis.test.ts`, covering
AC-16's emoji half).

**`npm run build` IS required this wave** - N2 is a NEW `"use server"` file, and
`next build` is the ONLY gate that catches a `"use server"` module exporting a
non-async binding or re-exporting a type (memory: use-server-no-type-reexport).
Pass condition: the `Compiled successfully` line, NEVER exit 0 (the prerender tail
fails with no `.env`). `use-server-exports.test.ts` (in `test:paths`) covers the
part it scans.

**Pass conditions, each naming object / instrument / direction:**

| Object | Instrument | Direction of failure (RED when...) |
|---|---|---|
| write set | `git status --short` vs the section-4.1 list | any other path appears - specifically RED if `route.ts`, `route.test.ts`, `GradingResults.tsx`, `GradingTab.tsx`, `useIncrementalGradingRun.ts`, `incrementalRunPlan.ts`, or the snapshot L13 file appear (must NOT be edited) |
| type graph | `npx tsc --noEmit --incremental false` | P1 presence-map key undone, or a seam signature mismatch (incl. `pointsPossible` on the body) |
| `"use server"` shape | `npm run build` `Compiled successfully` + `use-server-exports.test.ts` | N2 exports a non-async binding or re-exports a type |
| client-bundle boundary | `runtime-import-graph.test.ts` | N1 (client-safe leaf) or N3/N4 reach a server-only module directly (section 9's N1 constraint) |
| lint | `npm run lint` | exit non-zero, or a NEW warning in a written file (measured vs the same command before the change) |
| Grading inner nav = 6 | `manual-rail.test.ts` (I-inner) | the Grading group is not exactly 6 ids/labels |
| resolver completeness | derived loop `manual-rail.test.ts:323-337` | `"chat"` has no resolver branch |
| "Grading tools" name | `manual-rail.test.ts:281` | the accessible name regresses (expected GREEN) |
| chat panel ALWAYS-MOUNTED | I-chat-mount (T2) | `GradingChatPanel` is a conditional render, >1 render site, or its wrapper omits a required guard term |
| run/repos ternary scope | I-R-1 `topLevelTabs.wiring.test.ts:576-591` | the run/repos clause is widened (expected GREEN - "chat" not added) |
| taxonomy + driver + action | T3a/T3b/T4/T5 | any folded-requirement mutation in section 5 |
| written file sizes | both counters | any written file > 1000; `GradingChatPanel.tsx` > 550 triggers the section-6 split |

---

## 9. Corrections and conflicts reported (not silently reconciled)

1. **N1 must NOT re-export `classifyGradingUpload`** (architecture section 3.1/N1
   contents proposed it "for client classification"). [MEASURED,
   `sed -n '1,26p' src/lib/grade/single-file-entry.ts`]: `single-file-entry.ts:23`
   imports `extractTextFromBuffer` from `../office-extract` and uses `Buffer`
   (`:74`) - server-only. Re-exporting `classifyGradingUpload` from that module
   into the client-safe pure leaf N1 would drag `office-extract` into the client
   bundle, a violation `runtime-import-graph.test.ts` is built to catch.
   **Resolution:** classification runs SERVER-side only, inside N2's
   `prepareChatSubmissionAction` (which imports `single-file-entry.ts` freely). The
   client composer sends the `File` and lets the server refuse `"unsupported"` with
   a named reason (AC-8 unchanged). The composer's `accept=` filter uses the
   extension LIST, not `classifyGradingUpload` (see RES-GC-UX-5). N1 stays pure:
   only `ChatSubmissionInput`, `IntakeOutcome`, `buildTextEntry`. This REMOVES a
   client-bundle reachability defect; it changes no user-facing behaviour.

2. **RES-GC-8 clip placement moves from the action to the driver.** The reliability
   doc (section 2) located the partial-grade clip in `prepareChatSubmissionAction`'s
   return shape; the action has no session `dispatchedCount` and cannot compute the
   remaining capacity. The clip therefore lives in the driver's `submit()`
   (section 5, req 3), which knows `dispatchedCount`. The MECHANISM
   (clip-to-ceiling, not whole-event refusal; 40 rows + one named partial refusal,
   never zero) is identical. Reported as a placement refinement within the
   recommended reading, not a mechanism conflict.

3. **F1 already landed** (section 1). This wave consumes it and does not re-tighten
   `route.ts`. If, at dispatch time, `route.ts` has reverted to `requireUser()`, that
   is a NEW guard asymmetry (R7) to report - not something this wave fixes - and the
   chat actions remain `requireAppOwner()` regardless.

4. **`tab-rails.test.ts` added to the gate** - a manual-rail importer the
   architecture's owns list omitted (section 4.3).

---

## 10. Residual register (owner, instrument, step - all three, or it is a deletion)

None of these is a `docs/BACKLOG.md` row yet; filing them is the orchestrator's
job. Until filed, they do not exist.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-GC-13 | Pace `pump()` dispatches drawn from a NON-EMPTY backlog with `getGeminiInterRequestDelayMs()` (mirror `engine.ts:288`'s guard), never a lone submission - so AC-L is unaffected and a bulk zip/Canvas expansion is not 3x batch speed | reliability + architect (owns the seam) | driver test: N queued entries space by the delay; a lone submission with empty queue does not | implementer wave when `pump()` is written; NOT a blocker, but rate-limit exposure is unmitigated until it lands |
| RES-GC-10 | Optional lightweight `{sourceIndex, student, totalScore}` receipt per completed row (excluding feedback text + base64), so a reload shows what was graded | data seat + owner | a `ta-` key round-trip test on the receipt list only | follow-up wave; not required to ship |
| RES-GC-12b | Per-item `console.error` rows on `route.ts`'s timedout/failed/catch branches (reliability section 6) - route.ts is NOT this wave's write set | F1/operability owner (the route.ts editor) | re-open `route.ts` post-edit; the model file `class-trends-insight/route.ts:165` convention | the operability/R7 wave, not this one |
| RES-GC-12 | No session-level (multi-request) grading log convention exists; whether one is wanted and where it lives is undecided | data/operability seat + owner | none yet; owner's answer sets it | owner scope call; per-item logging (RES-GC-12b) is the required half |
| RES-GC-7 | Persist a COMPLETED chat run to a durable store (Supabase/drafts); the run is in-memory only | data seat + owner | a durable-run store + typed mapper (grading-drafts precedent) | follow-up; out of wave scope |
| RES-GC-UX-1 | Session-ceiling copy should name attempted-count vs limit (folded via RES-GC-8's partial outcome, which carries the counts) | UX + owner | the driver `submit()` partial outcome's counts read into the refusal string | implementer wave, copy-only |
| RES-GC-UX-2 | Queue depth ("N grading now, M waiting") not surfaced; the seam exposes `inFlight`/`dispatchedCount`/`completedCount` | UX + visual seat | a status-line addition using existing seam fields | visual pass on the as-built diff |
| RES-GC-UX-4 | The unsupported-file refusal copy is genuinely NEW (no byte-identical source); confirm wording with owner | UX + owner | owner review of the sentence at ship | owner walk |
| RES-GC-UX-5 | The composer file-mode `accept` list would be a THIRD hand-synced copy of `SINGLE_SUBMISSION_EXTENSIONS`/`STUDENT_SUBMISSIONS_ACCEPT` (`GradingTab.tsx:47-57`) unless extracted | implementer / architect (extraction is a design call) | grep for a third literal copy once the composer lands | build wave |
| RES-GC-3 | Text client fast-path (skip the server round trip) vs routing text through `prepareChatSubmissionAction` for one validation seam (recommended) | UX + reliability | driver test on text dispatch shape | not a blocker; wave ships routing text through the action |
| RES-GC-5 | `maxEntries` default 40 (`getGeminiMaxSubmissions()`) - right for a large class? | owner | AC-11 assertion at whatever bound is set | owner input; wave ships at 40 with RES-GC-8 partial-grade |
| RES-GC-1 | Mount lifecycle: always-mounted (built) vs plain conditional (loses an in-flight run on nav) | architect (built always-mounted); owner may reduce | I-chat-mount, flipped to a conditional assertion if chosen | owner confirms at the walk |
| SEC-GC-1 | F2: grading prompt has no role separation between instructor and student text (shared `prompts.ts`/`engine.ts`, out of this write set) | security seat + owner | a prompt-shape test asserting a delimiter boundary | separate cross-surface hardening pass |
| SEC-GC-5 | Whether any non-owner "instructor" account is intended to use Grading (bears on F1's scope) | owner | none in-repo (scope question) | ask alongside R7 |

---

## 11. The two owner forks, isolated (build the recommended reading)

- **R2 (blank rubric):** BUILD `synthesizeRubricWhenBlank: true` in
  `resolveChatRunHeaderAction` (synthesize from instructions; matches the zip flow,
  `grading-incremental.ts:159-161`). Owner alternatives slot without redesign: flip
  the one boolean to `false` (no-rubric), or add one `if (!rubric.trim()) return
  refused` guard in `beginSession` (refuse). Terminating question if disputed:
  "Blank rubric on chat: SYNTHESIZE (recommended), grade with NO rubric, or
  REFUSE?" Every answer flips one argument or adds one guard.
- **R3 (URL scope):** BUILD Canvas (`extractCanvasEntries`) + GitHub repo
  (`fetchGradableRepoContent` + the thin module-private `buildRepoUrlEntry` mapper,
  N2). Arbitrary URLs REFUSED with a named reason (F3 confirms both built paths
  resolve their fetch target from app-configured values, not the pasted host). The
  arbitrary-URL fetcher (new egress, SSRF surface) is a SEPARATE owner-gated layer,
  NOT in these waves. Terminating question if the owner wants arbitrary URLs: "Fund
  a security-reviewed arbitrary-URL fetcher, or keep Canvas/GitHub-only?" - the
  recommended reading ships either way; the fetcher is purely additive.

Both forks are additive; neither bleeds into the core cut. No terminating question
is owed on the WAVE CUT itself - the one-wave decision is settled by the caller
rule (section 2), not by a fork.

---

## 12. Owner-walk list (nothing renders under vitest; no proxy proposed)

| id | Item | Instrument |
|---|---|---|
| OW-GC-1 | Tools > Grading shows a 6th "Chat" item rendering a chat-styled surface (three input regions + a growing table); inner tablist name still "Grading tools" | open the app; screen reader on the tablist |
| OW-GC-2 | Instructions + rubric set ONCE, then submissions one at a time, each -> one row per gradable student with per-criterion scores + copyable did-right/did-wrong boxes; rubric/instructions never re-entered (AC-17) | walk a multi-submission session |
| OW-GC-3 | A later submission's grading STARTS while an earlier one is still grading (felt concurrency, AC-6/AC-L) | drop several quickly; watch rows appear out of lockstep |
| OW-GC-4 | Text, single file, zip, Canvas URL, GitHub repo URL each grade; an unsupported file and an arbitrary URL each refuse with a named reason | exercise each kind |
| OW-GC-5 | The three panel controls survive a reload (AC-15); an in-flight run survives switching Tools chips and back (always-mounted) | reload; start a run, switch chips, return |
| OW-GC-6 | Copy controls copy the right box's text with many rows on screen (AC-13) | copy from several rows |
| OW-GC-7 | The disclosure floor (RES-GC-11) is VISIBLE before a reload loses the run, not only after | reload mid-session; confirm the warning was on screen first |
| OW-GC-8 | The `maxEntries` ceiling shows a partial-grade + named refusal at the boundary (RES-GC-8), never zero rows for a 41-student Canvas URL | drive a session past 40 with one bulk event |

---

## 13. What I could not determine (stated, not filled in)

1. **Anything a user sees or any runtime lifecycle** - no component renders. The
   always-mounted, disclosure-visibility, focus-firing, layout, and reload claims
   are enforced at SOURCE level where possible (I-chat-mount, T5 canaries) and are
   OWNER-WALK otherwise.
2. **`GradingChatPanel.tsx`'s final size** - the file does not exist; the estimate
   is [READING] and the 550 split trigger (section 6) is the enforced control.
3. **The real model's behaviour** - no key; rubric synthesis and grading are
   mock-only. The SHAPE is testable; the model's output is owner-walk.
4. **Whether office-extract is transitively client-hostile beyond the `Buffer`
   usage I measured** - I confirmed the module-level server-only import
   (`single-file-entry.ts:23`) that forces the N1 correction (section 9); I did not
   trace `office-extract`'s full dependency closure. The correction holds
   regardless (N1 imports neither).
5. **Whether the owner prefers one wave or the 1a/1b fallback** - I recommend one
   wave; the fallback is sequential and does not reduce the ceiling risk.

## 14. Gate run on this document

**Run:** `npm run docs:gate`. Result reported in the hand-back.
