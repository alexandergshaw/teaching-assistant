# Adversarial check: docs/tools-grading-subtab-waves.md

Round 1 of at most two for the WAVE-PLAN activity (row GRAD-SUBTAB). Fresh
checker; did not author the plan. Read-only over the plan, the architecture, the
architecture check, and the source. This file is the only write. No file under
`src/`, no other doc, and neither the plan nor the architecture were edited.
Nothing committed or pushed.

**Verdict at the end. WAVE 1 IS DISPATCHABLE. 0 blockers, 3 residuals, all six
named attacks run - five returned EMPTY, one returned a self-contradicted
sentence that the plan's own table overrides (non-load-bearing).**

The consumer of this plan is an implementer, so the question was: would building
WAVE 1 exactly as written land green and correct, and are waves 2 and 3 honestly
deferred rather than hidden. Yes to both.

---

## 0. Instruments, and the command behind every quantity

| Quantity | Command |
|---|---|
| Line count, counter A | `wc -l <path>` (Bash) |
| Line count, counter B | `@(Get-Content <path>).Count` (PowerShell) |
| Symbol / consumer search | `Grep` (ripgrep) over `src/**/*.{ts,tsx}`, reading matches (not `grep -c`, not `grep -P`) |
| `"use server"` check | `head -1 <path>` over the 7 production files |
| Backlog / a39 citations | `grep -an`, `sed -n` on the cited docs |
| Tree state | `git status --short`, `git log --oneline` |
| Docs gate | `npm run docs:gate` |

`git status --short` at the start of this check: **clean.**

**Tree-state note that frames two residuals.** The plan states throughout that it
ran at HEAD `d223143` (clean). The tree is now at `65cd1a8`
("docs(grad-subtab): wave plan authored, and unstale the home row") - the
auto-commit hook that saved the plan moved HEAD one commit past `d223143`. Every
`src/` size and every a39 citation I re-measured is still exact (below), so the
load-bearing derivation is current; only the HEAD SHA and one residual drifted.
This is the repo's own "trust the working tree, not git bookkeeping" situation.

---

## 1. Attack 1 - Wave 1's write set is the whole ballgame. RETURNED EMPTY.

The plan's three claims, each verified independently:

**(a) The 13-path write set exists.** All 13 present
(`for f in ...; [ -f ]` returned OK for all 13). Sizes re-measured on BOTH
counters, agree on all seven production files and match the plan's 1.1 table
exactly: `manual-rail.ts` 241/241, `ManualRail.tsx` 65/65,
`content-tab/constants.ts` 28/28, `ContentTab.tsx` 895/895, `url-state.ts`
417/417, `useAppNavigation.ts` 638/638, `page.tsx` 703/703
(`wc -l` and `@(Get-Content).Count`). Largest wave-1 file is `page.tsx` at 703,
297 under the 1000 ceiling. No ceiling risk.

**(b) No proper subset compiles.** Sound. Verified the tsc-forcing edges: the
required `UrlNavState.gradingView` field makes `DEFAULT_STATE` a tsc error in two
test files (`tab-rails.test.ts:270-283`, `url-state.test.ts:33-46`); the
`ContentView` member removal is a TS2367 at `ContentTab.tsx:772` and an
assignability error at `manual-rail.ts:212`; the `ManualViewType` swap flows
through `normalizeManualView`'s return into `useState<ManualView>`. Six of seven
production files and two of six test files are tsc-forced. A split would push a
non-compiling intermediate.

**(c) Every new export's caller is inside the set - no eighth "ships dead" file.**
This is the failure this loop keeps hitting; I derived the closure rather than
trusting the plan's table.

- Nav-mechanism consumers (`ManualRail`, `resolveStateFromDestinationId`,
  `getActiveDestinationId`, `getInnerDestinations`, `ManualView`,
  `normalizeManualView`, `isManualViewType`): Grep over `src/**/*.{ts,tsx}`
  returns 11 files - the 7 production + 4 test files, all in the 13-path set,
  PLUS `tab-rails.ts`. `tab-rails.ts` is the only non-set consumer and it needs
  NO edit: I read all 192 lines - every `ManualViewType` occurrence is a
  type position (`ToolsRailItemId`/`ToolsRailItem` template-literal types
  `:116/:126-128`, `toolsRailItemFor`/`toolsStateFromRailItem` `:163-192`),
  `TOOLS_RAIL_ITEMS` derives from `MANUAL_VIEW_ORDER` with
  `MANUAL_VIEW_LABELS[view]` (`:132-140`), and the file carries NO `"grading"`
  or `"repo-grades"` string literal. It widens automatically. Confirmed.
- `resolveStateFromDestinationId` sole production caller: `page.tsx:506`
  (read directly). `getActiveDestinationId` sole production caller:
  `ManualRail.tsx:38`. `ManualRail` sole production caller: `page.tsx:501`. All
  in set.
- ContentView-`"grading"` consumers: `ContentTab.tsx:772` (`view === "grading"`)
  and `content-tab/constants.ts:3`, both in set, plus tests in set.
  `KnowledgeTab.tsx:467` carries `view: "grading"` but it is an
  `openRecordingTool({ view: "grading", ... })` dispatch (the recording-tool
  `recView`, not `ContentView`) - out of scope, does not break when `"grading"`
  leaves `ContentView`. Verified by reading `:466-479`.
- `"repo-grades"` string-literal consumers: production `useAppNavigation.ts:45`,
  `manual-rail.ts`, `page.tsx:578` - all in set. The two non-set hits
  (`runtime-import-graph.test.ts:396` a directory path,
  `repoGradesFeedbackAndFiles.wiring.test.ts:54` a path segment) are unaffected
  because the design moves no files.
- `GradingTab` / `RepoGradesTab` render sites: only `page.tsx` mounts them; both
  already imported there. The new branch renders existing components.
- New ids `grading-run`/`grading-repos` and new symbols (`GradingView`,
  `getInnerNavAriaLabel`, `RETIRED_GRADING_POINTERS`, etc.): 0 pre-existing
  files (architecture census, spot-confirmed) - no collision, no external
  caller.

**No production edit point and no new export's caller sits outside the 13-path
set. The write set is complete.** EMPTY.

---

## 2. Attack 2 - the pinned-path constraint (GradingTab.tsx). RETURNED EMPTY.

`GradingTab.tsx` is pinned by `autoGradeTransition.wiring.test.ts:16` (path) and
`:412-417` (frozen `editsSurface="canvas"` two-path set). The plan claims wave 1
only relocates the mount JSX within `page.tsx:543-552` and never opens the file.

Verified by reading `page.tsx:490-582`. The `<GradingTab ...>` mount at
`:543-552` passes eight props, and every one is a `page.tsx` local referenced
directly in that JSX block: `formAction`, `pending`, `state`, `testState`,
`copiedKey`, `onCopy={handleCopy}`, `onOpenPreview={handleOpenPreview}`,
`resultsSectionFallbackRef`. None is threaded through `ContentTab`. Relocating
the whole block into a sibling `manualView === "grading"` branch in the same
`page.tsx` render keeps every prop in scope. `GradingTab.tsx` is never opened;
its 617 lines and the frozen canvas set are untouched. The gate enforces this by
`git status --short` going RED if the path appears (plan 2.4 / 3.1 pass table).
EMPTY.

T23/T24 positional guards, checked specifically: both anchor on `indexOf` of a
string, so line shifts elsewhere in the file do not move the window - only an
insertion WITHIN the sliced window would. The plan gives the correct placement
rules (T24: put the `gradingView` state block after `tasksView`, never between
the `contentView` initializer and `const [workflowsView`; T23: insert nothing
between the first-sync guard and its `replaceState`). Read
`useAppNavigation.test.ts:38-62`: the T24 slice is bounded by
`const [contentView, setContentViewState] = useState<ContentView>(` and
`const [workflowsView`, and its assertions (`toMatch` for the VIEW_KEY
delegation, `not.toMatch(/saved === "pages"/)`) would survive the plan's
placement; the rule is if anything over-cautious. Guards stay green. EMPTY.

---

## 3. Attack 3 - the canary-or-guard assignment. Classifications sound; one non-load-bearing internal contradiction.

Spot-checked the hazard lines the task named, at source:

- `contentTab.wiring.test.ts:36` `SELF_HOSTING_VIEWS = new Set(["grading",...])`
  - T11 CANARY (silent), CORRECT. With `"grading"` gone from `LMS_VIEWS`,
    `courseTabEligible` at `:71-74` is 5 regardless of whether the stale entry
    stays, so removing it is genuinely silent (read `:66-75`). The plan
    correctly flags it must be named in the brief (loosened-guard corollary).
- `contentTab.wiring.test.ts:49-60` `extractRenderChain` anchor
  `'view === "grading" ? ('` throws at -1 - T9 CANARY, re-anchor on
  `'view === "announcements" ? ('`. CORRECT (read `:49-60`; announcements is the
  next branch).
- `contentTab.wiring.test.ts:72` `LMS_VIEWS.length` 8 - T10 CANARY, ->7.
  CORRECT.
- `manual-rail.test.ts:34/56/116-120` - T1/T2/T3 CANARY, confirmed against the
  source functions.
- `manual-rail.test.ts:138` `validateLmsViewsCompleteness()` zero errors - T4
  GUARD, CORRECT. Read `manual-rail.ts:221-241`: the function checks BOTH
  directions (member-without-destination and destination-without-member), so it
  is genuinely the enforcer that forces the member and the destination to move
  together. Not a canary. The plan's do-not-touch call is right.

Every classification the task flagged holds; none is a guard mislabelled as a
canary or vice versa. Every CANARY update lands in a file that is in the 13-path
write set (verified: the six test files holding canaries are all in the set), so
no wave lands red. The GUARD set (T4, T7, T13-16, T20-25, T31-34) stays green
and untouched.

**One internal contradiction, non-load-bearing (RESIDUAL R-3).** Plan section 5
opens: "All of T1-T35 are turned RED (or tsc-error) BY WAVE 1." That is false as
written and is contradicted by the plan's own 5.1 table, which correctly marks
roughly sixteen of the 35 as GUARDs that stay GREEN and do-not-touch. The
operative claim - every CANARY update belongs to wave 1 and its file is in the
write set - is governed by the table, which is correct, so the overstatement
changes no action. It should be reworded ("every CANARY among T1-T35 is turned
red by wave 1") so the next reader is not told to expect a red guard.

---

## 4. Attack 4 - disjointness vs A39. RETURNED EMPTY (one real gate-coupling, correctly a scheduling note).

A39 W6 landed at `de1e84e` (confirmed: `git log --oneline -1 de1e84e`). Re-read
both A39 write sets on the current tree:

- W6 (`docs/a39-fill-waves.md:1253-1256`): `grading-incremental.ts`,
  `grading-incremental.test.ts`, `useIncrementalGradingRun.ts`,
  `useIncrementalGradingRun.lifecycle.test.ts`.
- W7 (`:1305-1310`): `incrementalRunPlan.ts`, `incrementalRunPlan.test.ts`.

Wave 1's 13 paths live under `src/app/components/manual/`, `content-tab/`,
`ContentTab.tsx`, `url-state`, `home/useAppNavigation`, `page.tsx`, `tabs/`.
A39's live under `src/app/actions/` and `src/app/components/grading/`.
Intersection is empty by exact path. The plan's `uniq -d` = EMPTY reproduces.

The one coupling is a GATE coupling, not a masked collision: wave 1 turns
assertions red mid-flight and shares the single-caller `npx tsc`, so its gate
window must not overlap A39 W7's. The plan correctly notes W7 is owner-blocked
(its Group B is "NOT GATEABLE IN THIS REPO" - the flag flip), so no agent runs
W7 concurrently in this checkout. Scheduling note, not a reason to idle. EMPTY.

Incidental confirmation for attack 5: A39 W6's `grading-incremental.ts` IS a
`"use server"` module (the doc row says "a second `"use server"` export"), which
is exactly why A39 keeps the build gate - and why wave 1, touching no such file,
can drop it.

---

## 5. Attack 5 - the dropped build gate. RETURNED EMPTY.

`head -1` over the 7 production files: `ManualRail.tsx`, `ContentTab.tsx`,
`useAppNavigation.ts`, `page.tsx` open with `"use client"`; `manual-rail.ts`,
`content-tab/constants.ts`, `url-state.ts` open with an import or a comment.
**No wave-1 production file is a `"use server"` module**, so the build's
load-bearing catch (a non-async or type-reexporting `"use server"` export)
cannot apply. Dropping `npm run build` from the required gate is sound; the plan
keeps it as optional defense-in-depth with the correct `Compiled successfully`
pass line (never exit 0, no `.env`). EMPTY.

---

## 6. Attack 6 - are waves 2 and 3 honestly deferred? SOUND.

Confirmed against the architecture's own words:

- **Wave 2 write set** - architecture 9.2 literally: "Write set (estimated, not
  derived - wave 2's own derivation is owed when its brief is written)", and 10.3
  leaves the `RecordingTab.tsx:857` `active={active && recView === "grading"}`
  re-parenting feasibility undetermined. The plan carries only the six frozen
  canaries the architecture DID pin (4.2) and refuses to paste an estimated file
  list into a gate. The plan is not declining derivation the architecture
  supplied - the architecture did not supply it.
- **Wave 2 is partly decomposition, and the plan says so.** `GradingRecordingPanel.tsx`
  is 977 on both counters (`wc -l` / `@(Get-Content).Count`), 23 under the 1000
  ceiling and IS checked (not under `recording/`). The plan (2.2) prices wave 2
  as a frozen-canary problem AND names the 23-line budget with "wave 2 must not
  grow it". `RecordingTab.tsx` (917) is ceiling-excluded and shrinks. Honest.
- **Wave 3** - architecture 9.3/10.4: absorbing `DraftedGradesTab` crosses the
  `toolsSection` discriminant of `ToolsRailItem` (`tab-rails.ts:126-128`,
  confirmed at those lines) and may force `WorkflowsPanel`'s own nav to change;
  feasibility "is not established." The plan defers it on exactly that ground.

The deferral is honest, not lazy. The waves are sequential (must-not-run-
concurrently) by dependency, so their non-dispatchability today costs the queue
nothing.

---

## 7. Environment / owner walk. Present and correctly named.

vitest is node-env, renders no component, and `vitest.setup.ts` throws on real
`fetch`, so no gate proves markup, accessible name, focus or keyboard. The plan
routes those to OW-A1..A4 (section 7). Confirmed each names its object:
OW-A1 names the inner tablist accessible name **"Grading tools"** (explicitly
"not 'LMS views'"); OW-A2 names reload persistence AND Back-then-Forward; OW-A3
names the old-bookmark / stored-pointer landing (the `?manualView=repo-grades`,
`contentView=grading`, `ta-*` cases). The silent-green aria hazard has an
in-repo source-text instrument (I2: `aria-label={getInnerNavAriaLabel(` present,
`"LMS views"` absent, in `topLevelTabs.wiring.test.ts`) and the render half is
correctly OW-A1 with no proxy. Matches the environment ceiling.

Multi-path runs are spelled `npm run test:paths -- <12 paths>` (plan 3.1),
never a raw multi-path `vitest`/`npm test`; `npm test` is run separately and
takes no path args. No gate silently drops a path.

---

## 8. Residuals (none blocks)

| id | Finding | Class | NEW / REPEAT | Disposal |
|---|---|---|---|---|
| R-1 | The plan cites HEAD `d223143` throughout (sections 0, 2.1, 4.2, etc.); the tree is now at `65cd1a8` because the auto-commit hook saved the plan one commit past its authoring point. All load-bearing quantities (7 sizes on both counters, a39 cites, 13-path existence) re-measured and still exact. | quantity/citation stale after external (auto-)commit | REPEAT-OF the architecture check's C-R1 class (same corrective rule: refresh the SHA, do not re-derive) | RESIDUAL - a citation refresh, not a round. |
| R-2 | Plan RES-WAVE-3 says `docs/BACKLOG.md:159` (GRAD-SUBTAB home row) is stale ("parked/UNCHECKED"). It is NOT stale on the current tree: `65cd1a8` ("unstale the home row") rewrote that note - it now reads "ARCHITECTURE CHECK LANDED CLEAN 2026-09-28 AT d223143 ... the parked/UNCHECKED wording earlier in this note is now SUPERSEDED", and records the wave plan under round-1 check. RES-WAVE-3 is already discharged; carrying it as open teaches the next session to redo it (the architecture's own 1.4 warns of exactly this). | discharged residual still listed after tree drift | REPEAT-OF R-1's class | RESIDUAL - drop RES-WAVE-3 or mark it discharged. |
| R-3 | Plan section 5 says "All of T1-T35 are turned RED ... BY WAVE 1", contradicted by the plan's own 5.1 table (~16 of 35 are green do-not-touch GUARDs). Non-load-bearing: the actionable content (which canaries to update, all in the write set) is governed by the table, which is correct. | internal contradiction, non-load-bearing prose | NEW | RESIDUAL - reword to "every CANARY among T1-T35". |

The one foreseeable OWNER SCOPE call the plan flags (section 10: ship wave 1
alone and file 2/3 as future items, vs. derive all five surfaces before closing
the row) is correctly NON-BLOCKING - the plan is correct under either answer
(it ships wave 1 now and files 2/3 as derivation-owed), and the A40 obligation
it depends on (RES-ARCH-5) is already self-recorded in the A40 row at
`docs/BACKLOG.md:134` ("If and when its wave 1 ships, this row instrument text
must be updated"). I do not convert it into a blocker.

---

## 9. Verdict, deferral, stopping point

**WAVE 1 IS DISPATCHABLE TO AN IMPLEMENTER as written.** 0 blockers, 3
residuals, all cosmetic/tree-drift. The 13-path write set is complete and
closed (no eighth caller file), no proper subset compiles, `GradingTab.tsx` is
provably never opened, the canary/guard assignment is sound with every canary in
the write set, disjointness from A39 holds by exact path with the only coupling
a correct scheduling note, and the dropped build gate is justified by a verified
absence of `"use server"` in the write set.

**Shortest fix list: none required to dispatch.** Optional, before or at the
wave-1 push: (R-1) refresh the HEAD SHA to `65cd1a8`; (R-2) mark RES-WAVE-3
discharged; (R-3) reword "All of T1-T35 are turned RED".

**Waves 2 and 3 deferral is SOUND** - the architecture genuinely left both
underived (9.2 "estimated, not derived"; 10.3/10.4 feasibility open), and the
plan defers on those exact grounds rather than declining supplied work.

**Stopping point: measurement.** What remains is the three tree-drift/prose
refreshes above (mechanical) and the owner-walk items OW-A1..A4 plus the carried
RES-ARCH/RES-WAVE residuals, all routed with owners and instruments. Nothing
needs an orchestrator ruling and no design defect remains. A clean check ends
the chain; do not order a round-2 check on this plan.

---

## 10. Gates run on this document

**Run:** `npm run docs:gate`. Result in the hand-back report.
`git status --short` in the hand-back. No file under `src/` opened for writing;
nothing committed or pushed.
