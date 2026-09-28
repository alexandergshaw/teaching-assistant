# Adversarial check: docs/tools-grading-subtab-architecture.md

Round 1 of at most two for the ARCHITECTURE activity (row GRAD-SUBTAB). Fresh
checker; did not author the artifact. Read-only pass: this file is the only
write. No file under `src/`, no other doc, and the architecture itself were not
edited. Nothing committed or pushed.

**Verdict at the end. BUILDABLE. 0 blockers, 4 residuals, 8 named attacks run
and returned empty (reported as run).**

The disposal this pass had to discharge was RELOCATE: derive the edit surface
and the asserting-test set with the architect's OWN instruments and report what
the AC's hand tables missed. **It derived; it did not re-present.** A 2772-file
symbol census, an exact-equality string-literal census, and a 1166-file
source-text reader scan drive the surface, and 3.4 reports eleven missed edit
points (the four RULING A named plus seven new, M5-M11). The longer-hand-table
failure the disposal existed to prevent did not occur.

---

## 0. Instruments this check used

| Quantity | Command |
|---|---|
| Line counts, counter A | `wc -l <path>` (Bash) |
| Symbol / id / string presence | `grep -rIl -- "<needle>" src` with a positive control in the same run |
| Backlog row location | `awk 'NR==N'` and `grep -aon "<phrase>" docs/BACKLOG.md` (the artifact's own commands, run verbatim) |
| Decision / plan citations | `grep -n`, `sed -n` on the cited docs |
| Docs gate | `npm run docs:gate` |
| Tree state | `git status --short` |

`git status --short` at the start of this check: **clean.** `npm run docs:gate`
with the artifact present: **3 files passed, 49 tests passed, all COVERED** -
the artifact's section 14 (deferred to a hand-back that never came) is verified
here as passing. No emoji/BOM/NUL issue.

**Tree-state note that frames three findings.** The architecture states it ran
at HEAD `98e76b2` (clean). The tree is now at `baf6444`; two commits landed
after authoring - `67da31b` (docs/loop) and `baf6444` ("backlog: ... give the
Grading work a home row"). `baf6444` reorganized `docs/BACKLOG.md`. Every `src/`
size and citation I re-measured is still exact (below), so the load-bearing
derivation is current; only the `docs/BACKLOG.md` line numbers drifted.

---

## 1. The four rulings, each checked against the tree

### RULING A - derive every edit point; a tree edit point absent from the list is a blocker. RETURNED EMPTY.

I searched production (non-test) references to every symbol the change touches,
independently of the artifact's pasted census:

- `grep -rn "repo-grades|RepoGradesTab"` and `"GradingTab|isContentView|normalizeContentView"` over `src` excluding `*.test.ts`. Every CODE (non-comment) reference resolves to a file already in E1-E7's write set: `manual-rail.ts`, `ManualRail.tsx`, `content-tab/constants.ts`, `ContentTab.tsx`, `url-state.ts`, `useAppNavigation.ts`, `page.tsx`. `actions.ts:69 export * from "./actions/repo-grades"` is a module path, not a nav value - correctly out of scope (the design moves no files).
- `tab-rails.ts` is correctly ruled out: `TOOLS_RAIL_ITEMS` derives from `MANUAL_VIEW_ORDER` with `label: MANUAL_VIEW_LABELS[view]` (`:132-140`, confirmed), and every `ManualViewType` occurrence in it is a type position (`ToolsRailItemId` `:116`, `ToolsRailItem` `:126-128`, `toolsRailItemFor`/`toolsStateFromRailItem` `:163-192`) that widens automatically. No edit needed - confirmed at those lines.

The four RULING A starting points all resolve at the cited lines:
`ManualRail.tsx:48` aria-label ternary (confirmed verbatim);
`getActiveDestinationId`/`resolveStateFromDestinationId` both `(manualView, buildView, contentView)` today (`manual-rail.ts:160-164`, `:183-188`, the second returning exactly three fields at `:188`); `url-state.ts`'s `UrlNavState` (`:290-311`, twelve fields), `parseUrlState` (`:337-350`), `buildUrlSearch` (`:367-417`, `contentView` gated on `manualView === "content"` at `:389`); `useAppNavigation.ts:38-45`'s second hand union (confirmed).

The seven new misses (M5-M11) all resolve: `useAppNavigation.ts:474-487`
(twelve-field `buildUrlSearch` literal), `:510-523` (dep array),
`:188` (`saved === "grading"` legacy migration), `ContentTab.tsx:772`
render branch and `:67/:73` prop, `content-tab/constants.ts`, the `repo-grades`
retired-pointer family, and the leftover destination at `manual-rail.ts:85-90`.

**No production edit point exists in the tree that is absent from the surface.
The derivation is complete for production.** EMPTY.

### RULING B - the silent-green build. RETURNED EMPTY; the check's B6.2 correction is CORRECT.

- **6.1 (aria "LMS views").** Prevented by construction: `:48`'s ternary becomes `getInnerNavAriaLabel(manualView)`, and both that function and `getInnerDestinations` read the one `INNER_NAV` table (5.2), so "has inner destinations" and "has an accessible name" are the same set by a `Record` literal, not two lists. I1 (parity) and I2 (source-text) are node-env-safe and each can fail on a named mutation. The visible half is correctly routed to OW-A1 with no proxy. `ManualRail.tsx:41`'s early return must additionally narrow the now-`string|null` label (React's `aria-label` is `string|undefined`); the artifact names this as E2(iv), so it is not a missed edit.
- **6.2 (gradingView URL param).** The artifact DISAGREES with the check and is right. I verified the frozen oracle at `tab-rails.test.ts:284-337`: `EXPECTED_PARAM_NAMES` is twelve (`:288-301`), `emittedParamNames()` drives eight states (`:306-327`), `:336` asserts exact-set equality. Its five-outcome accounting holds: a required `gradingView` field makes `DEFAULT_STATE` (`:270-283`) a tsc error (T18), but tsc does NOT force `EXPECTED_PARAM_NAMES` or the driving states, so "field + parse line, no emit branch, oracle untouched" stays 12-vs-12 GREEN. Hence I3 (directional round trip) AND I4 (oracle extension) are both required, and the artifact says which failure each alone permits. Correct and load-bearing.
- **6.3 (Back/Forward).** Construction declined with a stated reason (a derived setter-loop would change `buildView`/`contentView` restores as a side effect - RES-ARCH-3). I5 isolates the popstate slice between `const onPopState = () => {` (`:526`) and `window.addEventListener("popstate"` (`:600`) and derives from `INNER_NAV`; today it passes with `course-planning` (`:581`) and `content` (`:582`) and goes red on an omitted `grading` branch. Can fail. The overruled-scope instruction is real at `url-state.ts:5-13`. Behavioural half routed to OW-A2.

No instrument runs a raw multi-path `vitest`/`npm test`: the wave-1 gate spells
every multi-path run `npm run test:paths -- <paths>` (`:1121`, `:1127-1130`),
I1-I5 each run one path, and `npm test` takes no path args. EMPTY.

### RULING C - size against both ceilings; prefer a cut not writing GradingTab.tsx. RETURNED EMPTY.

`wc -l` re-measured: `GradingTab.tsx` **617**, `GradingRecordingPanel.tsx`
**977**, and every one of the 21 named files matches the artifact's 1.1 table
(`manual-rail.ts` 241, `ManualRail.tsx` 65, `page.tsx` 703, `url-state.ts` 417,
`useAppNavigation.ts` 638, `ContentTab.tsx` 895, `content-tab/constants.ts` 28,
`tab-rails.ts` 192). The AC-check independently confirmed 617/977 on
`@(Get-Content).Count` too. `GradingTab.tsx` is genuinely out of the wave-1
write set (its mount JSX moves within `page.tsx`, `:543-552` -> the new
`manualView === "grading"` branch; the file is never opened - confirmed the eight
props are all `page.tsx` locals). `GradingRecordingPanel.tsx`'s 23-line headroom
against the only mechanical ceiling (`LIMIT = 1000`) is correctly priced as
wave 2's concern. EMPTY.

### RULING D - CartridgeDropPanel double mount decided, not deferred. RETURNED EMPTY.

Both mounts confirmed: `GradingTab.tsx:614` `<CartridgeDropPanel />` and
`FilesTab.tsx:852` `{filesView === "submissions" && <CartridgeDropPanel />}`.
Section 7 decides both stay, `CartridgeDropPanel.tsx` is in no write set, no
third mount is added, and the GradingTab-internal mount travels with its host
(wave 1 does not write `GradingTab.tsx`). No orphan, no triplicate. The long-run
question is routed to RES-ARCH-4. Decided. EMPTY.

---

## 2. The per-test CANARY-OR-GUARD audit (the wave-1 hazard)

Spot-checked twelve of the 35 entries at their cited lines; every classification
holds and none is a guard mislabelled as a canary:

- T1 `manual-rail.test.ts:34` (`getDestinationById("lms-grading")` defined) - CANARY, confirmed.
- T2 `:56` (`getActiveDestinationId("content","new","grading")`) - CANARY + tsc, confirmed.
- T4 `:138` `validateLmsViewsCompleteness()` zero errors - GUARD, correct: the function checks BOTH directions (`manual-rail.ts:228-238`), so leaving either the member or the destination behind produces a named error. This is the correct construction that replaces the AC's vacuous sub-assertion (the check's B5).
- T8 `:293-319` repo-grades describe - CANARY -> removal+alias, confirmed. (Nit: the "3 RED, 2 tsc errors" split is imprecise - `:297`, `:308`, `:313` are tsc errors, so nearer three; non-load-bearing since the whole describe is rewritten.)
- T9 `contentTab.wiring.test.ts:49-60` - the `extractRenderChain` anchor `'view === "grading" ? ('` throws at -1; re-anchor on `'view === "announcements" ? ('`. Confirmed at `ContentTab.tsx:772-778`: grading is the first branch, announcements the second, and the remaining seven views all fall between announcements and the version-control anchor. CANARY, correct.
- T10 `:72` `LMS_VIEWS.length === 8` -> 7. CANARY, confirmed.
- T11 `:36` `SELF_HOSTING_VIEWS` still holds `"grading"` - the "silent" call is correct: `:73`/`:74` stay green (eligible count is 5 both ways), so the stale entry must be named in the brief per the loosened-guard corollary. Confirmed.
- T20 `topLevelTabs.wiring.test.ts:309-320` - GUARD (derived), loops `MANUAL_VIEW_ORDER` requiring a `manualView === "<view>"` branch in the manual slice. Correct: this IS AC3's instrument already in the tree; adoption not authoring.
- T21 `:274-285` (one `role="tablist"`, no `MANUAL_VIEW_ORDER`) and T22 `:209-226` (exactly one `<TabRail` per merged branch) - GUARDs that force the shape. Confirmed; the shape derivation in section 2 is sound.
- B5 model, course-intel loop `:352-357` - confirmed TRUE-today with the id present (the loop fixes `contentView="modules"`), so the AC's analogous sub-assertion could not fail. The drop-and-replace is correct.

Claim "T1-T35 read at cited lines" is credible.

---

## 3. Residuals (all self-correcting or routed; none blocks)

| id | Finding | Class | Disposal |
|---|---|---|---|
| C-R1 | **Stale `docs/BACKLOG.md` citation from tree drift.** The artifact (authored at `98e76b2`) cites `docs/BACKLOG.md:133` as row A40's owner path and claims to verify it via `awk 'NR==133' ... grep -ao "Tools > LMS > Grading..."`. On the current tree (`baf6444`) that phrase is at **`:134`**, and `awk 'NR==133'` returns NO MATCH (`:133` is now row A32). RES-ARCH-5's substance still holds (A40 still carries a nav path wave 1 invalidates); only the line number is off by one. | quantity stale after external commit | RESIDUAL - a citation repair (`AGENTS.md`: not a new round). Refresh 133 -> 134 wherever it appears (1.3, 5.5 comment, RES-ARCH-5, AC6 discussion). |
| C-R2 | Section 12 states none of RES-ARCH-1..10 is a row in `docs/BACKLOG.md` "yet." `baf6444` has since filed the **GRAD-SUBTAB home row at `:159`**, which explicitly folds "the AC-check R2/R8/R9, and A40 forward pointer." The architecture's disclaimer (backlog is out of its write set) remains correct, but the backlog seat should reconcile RES-ARCH-1..10 against that home row rather than filing duplicates. | record reconciliation | RESIDUAL - backlog seat, at the push. |
| C-R3 | E6(v) cross-references "(see 6.3)" for the retired-pointer aliases; the alias table is in **5.5**, not 6.3 (6.3 is Back/Forward). | trivial internal cross-ref | RESIDUAL - fix on next touch. |
| C-R4 | The `contentView=grading` URL redirect and the `ta-content-view=grading` / `ta-active-tab=grading` storage redirects live in `useAppNavigation.ts`'s initializer (which has raw-param access, so `parseUrlState`'s independent-fields contract is genuinely untouched - the B4 disposal holds). But their instrument is source-text/owner-walk only (the initializer needs a render), and the artifact names T3/T30 only for the pure-function pointers. The initializer-side application logic is specified by the alias table but not by exact initializer steps. | source-text-only pointer, honestly routed | RESIDUAL - already routed to OW-A3 (hop 11); the implementer builds the initializer read from `RETIRED_GRADING_POINTERS`. Not a design gap. |

Empty attacks beyond the four rulings, run and empty: new-symbol/id absence
(`grading-run`, `grading-repos`, `gradingView`, `ta-grading-view`,
`GRADING_VIEWS`, `normalizeGradingView`, `getInnerNavAriaLabel`,
`RETIRED_GRADING_POINTERS` each 0 files, control `LMS_VIEWS` 8 - matches 5.4 and
section 0); styles reuse (`styles.manualSubnav`/`lessonInnerTabs`/`lessonInnerTab`
exist and are used at `ManualRail.tsx:44-56` - EMPTY); a39 citations still
correct on the current tree (`:1253-1256`, `:1305-1310`, `:1314-1318` - the
`incrementalRunPlan.ts:99` inside a39 is a39's own stale cite, flagged
RES-ARCH-9; the real line is `:104`, confirmed); DECISION 17 `:106`, DECISION 18
`:144` confirmed; I1-I5 each carry object, instrument, pass condition, direction
and a named mutation - specified enough for two implementers.

---

## 4. Verdict, and stopping point

**BUILDABLE.** 0 blockers, 4 residuals. The RELOCATE disposal is discharged: the
edit surface and asserting-test set are instrument-derived, the eleven misses are
reported, all four rulings are satisfied in substance, and the one substantive
disagreement with the AC-check (B6.2) is correct. A clean check ends the chain
(`iteration-caps.md:136`); do not order a confirmation round.

Per the checker contract: for each finding, the class name and NEW/REPEAT are in
the table above. None is a blocker, so none triggers a disposal; C-R1 is the only
one touching a measured quantity and it is a citation repair caused by the tree
moving under the artifact, not a derivation error.

**Stopping point: measurement.** What remains is (a) the citation refresh in C-R1
and the backlog reconciliation in C-R2, both mechanical; and (b) the owner-walk
items (OW-A1/A2/A3) and RES-ARCH-1..10, which are routed with owners and
instruments. Nothing needs an orchestrator ruling and no design defect remains.
The next activity (the wave plan consuming this architecture) is a new activity
with its own two rounds.

**What I checked:** every `src/` `file:line` the artifact points at that bears on
the four rulings (manual-rail.ts, ManualRail.tsx, tab-rails.ts, url-state.ts,
useAppNavigation.ts, page.tsx, ContentTab.tsx, and the render/popstate/dep-array
regions); the CANARY-OR-GUARD call on twelve of 35 tests at their cited lines;
both the frozen-param oracle and the render-chain anchor in full; `wc -l` on the
ten size-load-bearing files; new-symbol absence with a control;
DECISION 17/18, the a39 write sets, and `INCREMENTAL_ROUTE_ENABLED`;
`npm run docs:gate`; `git status --short`.

**What I did not check:** `@(Get-Content).Count` on all 21 files (I ran `wc -l`;
the AC-check verified the second counter on the three size-critical files);
whether wave 2 can re-parent the Recording panels (the artifact defers it, RES);
anything needing a rendered component, a live key or a browser - no instrument
for those in this checkout.
