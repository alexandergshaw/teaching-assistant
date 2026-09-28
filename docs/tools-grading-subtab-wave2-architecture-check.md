# Check: wave-2 derivation for Tools > Grading (GRAD-SUBTAB)

Adversarial check of `docs/tools-grading-subtab-wave2-architecture.md`, round 1 of
the WAVE-2-DERIVATION activity. Fresh checker; did not author the derivation.
Consumer is an implementer. Read-only: no source, code, or other doc was edited;
nothing committed or pushed. The one file written is this check.

**Tree.** HEAD `facfaf3`. `git diff --name-only f48a4e0 HEAD` = only `docs/`
(`BACKLOG.md`, `backlog.yml`, the derivation). No `src/` change since `f48a4e0`,
so the derivation's measurements on `f48a4e0` are valid against the current tree.
`git status --short` at start and end: empty. `npm run docs:gate`: PASS (3 files,
49 tests).

## Verdict

**WAVE 2 IS DISPATCHABLE TO AN IMPLEMENTER as derived.** 0 blockers. 3 residuals.
The central feasibility claim (always-mounted, display-toggled top-level siblings)
is CORRECT and correctly handled. The one-wave call is sound.

Counts: BLOCKER 0, RESIDUAL 3.

## The named attacks, each run to source

### Attack 1 - the always-mounted constraint (the whole feasibility claim): HOLDS

Verified from source, labelled reasoning-from-reading (nothing renders here):

- RecordingTab's own mount at `page.tsx:624-631` IS always-mounted / display-
  toggled (verbatim match to the derivation's quote; predicate
  `activeTab==="manual" && toolsSection==="manual" && manualView==="recording"`).
- Both panels hold live capture that a conditional mount destroys:
  `GradingRecordingPanel.tsx:26-35` (header: stays mounted for RecordingTab
  lifetime, ONE live `RECORDING_LAUNCH_EVENT` listener; `useDiscussionCapture()`
  at :219; own listener at :499-508 keyed `detail.view !== "grading"`);
  `SnapshotGradingPanel.tsx:8-11` (header: "a live MediaStream keeps running
  behind a hidden panel (no pause-on-hide) ... deliberately").
- The `manualView === "grading"` branch at `page.tsx:568-585` IS a conditional
  ternary mount, nested inside `{activeTab === "manual" && (...)}` (:480-605). A
  naive mount there unmounts on tab-leave, on manualView-leave, and swaps on
  gradingView change - it kills the capture. The derivation's diagnosis is exact.
- The proposed construction (top-level display-toggled siblings after :631,
  OUTSIDE the `activeTab==="manual"` block, each gated on the full grading
  predicate, passed the same predicate as `active`) faithfully replicates
  RecordingTab's own always-mounted pattern. Sound.
- The I-W2 guard modelled on `topLevelTabs.wiring.test.ts:473-499` would catch a
  regression to the conditional form: that model does a one-render-site check
  (:480) plus the immediate-wrapper display-toggle regex
  (`/style=\{\{...display:..."none"...\}\}\s*>\s*<RecordingTab/`, :492) plus the
  guard-term check (:497-499). A `{guard && <Panel/>}` conditional cannot satisfy
  the immediate-wrapper regex. A faithful I-W2 for the two panels catches the
  named mutation.

Owner-walk step needed to confirm in a browser: OW-W2-2 as written - start a
capture on Grading (from a recording), navigate to another Tools chip / another
top-level tab / change gradingView, return, confirm the capture is still live.
Not over-engineered: the constraint is real.

### Attack 2 - the no-context claim: HOLDS

- `GradingRecordingPanel.tsx:212` = `{ active }: { active: boolean }`;
  `SnapshotGradingPanel.tsx:80-84` = `SnapshotGradingPanelProps { active }`.
- `grep -nE "useContext|\.Provider|createContext"` on both panels: EMPTY.
- Same grep on `RecordingTab.tsx`: EMPTY - RecordingTab renders no Provider.
- Mount sites `RecordingTab.tsx:857/:867` pass only `active`.

Bonus (immaterial to the conclusion, noted for accuracy - RESIDUAL R-3):
`useLlmProvider` is a `useSyncExternalStore` hook (`src/lib/llm-provider*`), NOT
React context - there is no provider to be "mounted above the tab tree" as the
derivation's 2.1 phrases it. This makes the panel strictly MORE portable than
claimed. `SnapshotGradingPanel` does not use it at all (grep EMPTY). Conclusion
unaffected.

### Attack 3 - write-set closure and the caller rule: HOLDS

- Sole production caller: `grep` for imports and JSX mounts of either panel over
  non-test `.tsx/.ts` returns `RecordingTab.tsx` only (mounts at :857/:867).
  Moving re-points one caller; no third caller ships dead.
- The "no edit" claims, each re-verified against the tree, all correct:
  - `url-state.ts`: `grep -nE "[Gg]rading"` shows `normalizeGradingView`
    (:221-222) derives from the imported `isGradingView`; `DEFAULT_GRADING_VIEW`
    (:275); param read/emit at :387/:434-435. **`GRADING_VIEW_VALUES` does not
    exist anywhere in `src` (grep EMPTY)** - the architecture E5(iv) planned a
    hardcoded list; wave 1 did NOT add it. There is no hardcoded grading-value
    list, so new members flow through with zero edits. This was the highest-risk
    "no edit" claim; it holds.
  - `useAppNavigation.ts`: gradingView state (:338-361), persist (:482-483),
    popstate (:659) all go through `normalizeGradingView` / `resolveGradingPointer`
    / a widened setter; no hardcoded grading-value list. `setGradingView` is
    already destructured in `page.tsx` (used at :511), so P2(i) can use it.
  - `ManualRail.tsx`: renders `getInnerDestinations(manualView)` data-driven
    (:48-56); `gradingView: GradingView` prop widens automatically. The 4-item
    inner nav (OW-W2-1) appears with no ManualRail edit.
  - `recording-launch.ts`: `RecordingLaunchView` / `RECORDING_LAUNCH_VIEWS` keep
    `"grading"`/`"snapgrade"` (:57-84); untouched, panels' listeners still key on
    them.
  - Both panel files: sole occurrence is their own declaration; unchanged.

### Attack 4 - the two plan corrections: HOLDS

- 4a (decomposition moot): `GradingRecordingPanel.tsx` is 977 on `wc -l`; not
  edited by wave 2, so 977/977 preserved (23-line headroom intact). page.tsx is
  706 (`wc -l`); wave-2 adds ~15-25 lines and RecordingTab shrinks - projected
  well under `LIMIT = 1000` (`file-size-ceiling.structure.test.ts:41`). No ceiling
  risk. The derivation's ~750-770 estimate is high but on the safe side.
- 4b (launch handoff omission): REAL. `page.tsx:142-152` sets
  `setManualView("recording")` for ANY launch, ignoring `detail.view`. The only
  live grading launcher is `KnowledgeTab.tsx:467` (`view: "grading"`) plus the
  fab's `navigateToRecordingTool("grading")`; after the move both must land on
  Tools > Grading, so the listener must become view-aware (P2(i)). Correct catch.
- 4b (7th structure test): REAL. `snapshot-grading.structure.test.ts` is absent
  from the plan (its 5.2) and architecture (its 4.2), which named only the six
  recording-split canaries. It pins `SnapshotGradingPanel` to RecordingTab at
  :63-107; the RecordingLaunchView half (:110-121) stays green because
  recording-launch.ts is untouched. Correct catch and correct handling.
- P3(v) tsc mechanism verified: dropping `"grading"`/`"snapgrade"` from the
  recView union (:62-63) makes `setRecView(detail.view)` (:105) a TS2345 since
  `detail.view: RecordingLaunchView` still carries both; the early-return guard
  narrows `detail.view` to exactly the 10-member recView union, so it both fixes
  behaviour and satisfies tsc. Sound.

### Attack 5 - the six recording canaries plus the 7th: HOLDS

All six `recording-split.structure.test.ts` entries verified at the cited lines
and all are CANARY (none guards the always-mounted lifecycle - that property is
not asserted anywhere in this file):

- :143 `toHaveLength(12)` strip tuples -> 10.
- :150-152 dedicated-grading `it` matching `/["grading", ...]/` -> delete block.
- :169-176 restore-guard loop list (:173) INCLUDES `"grading"`, NOT `"snapgrade"`
  -> drop `"grading"`.
- :196-198 `toHaveLength(11)` `role="tabpanel"` -> 9.
- :209-234 aria-controls keys (:213-226) include both; `panelTargets.size` 11
  (:230) -> 9, drop both keys.
- :236-266 aria-labelledby loop list (:261) INCLUDES `"grading"`, NOT
  `"snapgrade"` -> drop `"grading"`.

The pre-existing grading/snapgrade asymmetry the derivation notes is real. The
7th (`snapshot-grading.structure.test.ts`) is correctly a CANARY-carrying-GUARD:
:63-107 (location) are canaries that move; the GUARD subject "never unmounted on
tab switch" lives in the :74 `it` description and is preserved in the rewrite to
the new page.tsx location; :110-121 stay green. Confirmed no grading-recording
directory test pins `GradingRecordingPanel`'s mount to RecordingTab (grep of
`src/app/components/grading-recording/*.test.ts` for RecordingTab/mount: none),
so its always-mounted property at the new home is covered ONLY by the to-be-
authored I-W2 - which the derivation states.

Cross-checks that returned run-and-empty (the valuable result):
- `buttonVariant.test.ts` reads RecordingTab (`SECTION_4_EXTRA_FILES`, :105) but
  RecordingTab is ABSENT from `FROZEN_PRIMARY_SITES` (expected 0) and wave-2
  edits add no `variant="contained"` site; `GradingRecordingPanel.tsx: 3` (:168)
  is an unedited file. Safe.
- `recording-launch.test.ts` never reads RecordingTab source or asserts
  `setRecView`; it registers its own handler and checks dispatched events
  (:383-499). P3(v) does not touch it. Derivation 4.4 correct.
- destination-id collision: `grep '"grading-recording"|"grading-snapshots"'` in
  `src` returns only `markLate.wiring.test.ts:28`, a DIRECTORY path segment (not a
  nav id); `"grading-snapshots"` is 0. Both nav ids are free, as the derivation's
  3.5 states.
- the derived `GRADING_VIEWS` guard (`manual-rail.test.ts:317-330`) auto-covers
  new members: first assertion (:318-323, 5th arg `"run"`) goes RED on a missing
  resolver branch; the generic `getActiveDestinationId` template keeps the
  round-trip half green. I-resolve is real. No collision with the ManualViewType
  `"recording"`/`"version-control"` checks because the `grading-` prefix is tested
  first-loser (`id.startsWith("grading-")`, manual-rail.ts:280).

## Residuals (none blocking)

- **RESIDUAL R-1 - correctness-critical edit with no gate instrument (class:
  reachability-verified-only-by-owner-walk).** P2(ii) - guarding the `:568`
  branch to render ONLY for `gradingView === "run" || "repos"` - is correctness-
  critical: without it, `gradingView === "recording"` renders BOTH `GradingTab`
  (the ternary else at :572) AND the new always-mounted `GradingRecordingPanel`.
  Grep confirms NO test asserts the `:568` guard shape, and the derivation
  commissions none; it labels P2(ii) `[READING]` but, unlike P2(i)/RES-W2-4, gives
  it no residual row and no instrument. OW-W2-1 ("each renders its surface") is the
  only net. Recommend the derivation add a cheap source-text assertion in T4 (the
  `:568` grading branch guard includes the `gradingView` restriction), symmetric
  to I-W2. Residual, not a blocker: the edit is specified and its necessity argued.

- **RESIDUAL R-2 - terse edit-list shorthand for a branch body.** P2(i)'s
  "`snapgrade` -> `setGradingView("snapshots")`" omits the required
  `setManualView("grading")` and the shared `setToolsSection("manual")` /
  `setActiveTab("manual")`. Intent is unambiguous from the design, and the impact
  is low because NO entry point dispatches a `"snapgrade"` launch today (grep:
  none - the branch is defensive-only), and RES-W2-4 already flags the listener's
  lack of a test. The brief should spell the full grading/snapgrade branch bodies
  so the implementer does not under-set the landing.

- **RESIDUAL R-3 - one imprecise mechanism description.** 2.1 calls
  `useLlmProvider`'s provider "mounted above the tab tree (app root/layout)"; it
  is a `useSyncExternalStore`, not context. Strengthens the portability
  conclusion; fix the wording for the next reader.

## The one-wave call

Sound. The derivation recommends ONE WAVE (the risky page.tsx always-mounted
construction is shared once) and honestly offers 2a/2b as a risk-isolation option,
noting the intermediate compiles - unlike wave 1, where no proper subset compiled.
The tsc/canary coupling (member set -> derived guard -> resolver; shrunk recView
union -> listener guard) is real and verified. The 2a/2b compilability is the
derivation's `[READING]` claim; I did not deep-audit the split because one wave is
recommended and the split does not affect the recommended path.

## Stopping point

Nothing unresolved at the level of **rulings** (the derivation reopens no settled
decision; DECISION 17/18 and wave 1 untouched) or **design** (feasibility,
write-set closure, canary calls all verified sound). The residuals are
**measurement/coverage** gaps that the environment ceiling (no component renders)
forces onto the owner walk; R-1 is the only one worth folding into a round-2
transcription (add the P2(ii) instrument + residual row). None blocks dispatch.
