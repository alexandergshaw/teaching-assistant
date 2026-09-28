# GRAD-SUBTAB wave 2 - as-built verify (adversarial)

Verify pass over the UNCOMMITTED wave-2 diff (`git --no-pager diff -- src/app/`,
7 files) against `docs/tools-grading-subtab-wave2-architecture.md`. I did not
author the diff. Nothing here was committed or pushed; my only write is this doc.

**VERDICT: WAVE 2 LANDS AS-IS.** Zero blockers. Three residuals, all pre-flagged
by the spec or non-load-bearing. Every high-value attack ran and returned clean.

Quantities name their command. Runtime claims (live capture surviving
navigation) are labelled reasoning-from-reading and routed to the owner walk -
nothing renders under this vitest.

---

## Attack results

### 1. The always-mounted constraint - CLEAN
Both panels are always-rendered, display-toggled top-level siblings of
RecordingTab, OUTSIDE the `activeTab === "manual"` block (which closes at
`page.tsx:631`), mirroring RecordingTab's own mount at `page.tsx:650-657`:
- `GradingRecordingPanel` at `page.tsx:670-681` - `<div style={{ display: ... gradingView === "recording" ? undefined : "none" }}>`
- `SnapshotGradingPanel` at `page.tsx:683-694` - same idiom, `gradingView === "snapshots"`

Neither is inside the `manualView === "grading"` ternary. This is the exact
construction section 2.2 of the spec required to avoid killing a live capture.

Instrument I-W2 (`topLevelTabs.wiring.test.ts:465-512`) genuinely discriminates
[MEASURED, `node` against real `src/app/page.tsx`]:
- real file, `GradingRecordingPanel`: regex matches TRUE; `SnapshotGradingPanel`: TRUE
- conditional-render mutant (`{guard && <Panel/>}`): FALSE (would go red)
- exactly one render site each [MEASURED, `src.match(/<GradingRecordingPanel/g).length === 1`, same for Snapshot]
The "proven red" claim (moving the mount into the ternary fails I-W2) is
confirmed by direct regex test, not just trusted.
(Note to future readers: `new RegExp` strings written through a bash `<<'EOF'`
heredoc mangle their backslashes here - the memory rule "heredoc halves
backslashes" bit me mid-check and produced a spurious FALSE; the Write-tool /
literal-regex reruns are the trustworthy ones.)

### 2. The R-1 branch guard - CLEAN
`page.tsx:594`: `{manualView === "grading" && (gradingView === "run" || gradingView === "repos") && (` guards the `<TabShell>` holding GradingTab/RepoGradesTab.
So for `gradingView` in {recording, snapshots} the ternary renders nothing and
only the always-mounted panel shows - no double surface for one chip.

R-1 source assertion (`topLevelTabs.wiring.test.ts:521-536`) discriminates
[MEASURED, `node`]: matches the real branch TRUE; a dropped-clause mutant FALSE.

Reachability of the inner nav while `gradingView` is recording/snapshots: intact.
`ManualRail` renders whenever `toolsSection === "manual"` (`page.tsx:513-533`),
independent of `manualView`/`gradingView`, so the four Grading chips stay
navigable even when the TabShell content is R-1-suppressed. [READING, traced;
covered by `manual-rail.test.ts` getInnerDestinations + owner walk OW-W2-1]

### 3. The view-aware launch handoff - CLEAN (with a coverage residual)
- `page.tsx:149-171`: listener branches on `detail.view` - `"grading"` ->
  setManualView("grading")+setGradingView("recording"); `"snapgrade"` ->
  +setGradingView("snapshots"); else -> setManualView("recording"). Each branch
  carries setToolsSection("manual")+setActiveTab("manual"). `setGradingView`
  added to the dep array (`:171`).
- `RecordingTab.tsx:108`: `if (detail.view === "grading" || detail.view === "snapgrade") return;` before `setRecView(detail.view)`.

Both sides verified by reading:
- a grading launch -> page.tsx routes it; RecordingTab early-returns (no
  double-handling); the panel's own listener (always-mounted, unchanged) opens
  the rubric. [READING]
- a recording/discussions/etc launch -> page.tsx else-branch -> Recording;
  RecordingTab `setRecView(detail.view)` still reaches it. [READING]

tsc mechanism confirmed [MEASURED, `npx tsc --noEmit --incremental false`, exit 0]:
the shrunk 10-member recView union compiles WITH the early-return guard (the
guard narrows `detail.view` to the 10 members before `setRecView`). Drop the
guard and `setRecView(detail.view)` is TS2345, as the derivation claimed.

RESIDUAL R-A (= spec RES-W2-4): the page.tsx launch grading/snapgrade routing
has NO automated assertion - the wave added I-W2 and R-1 but not a source-text
check on the listener's grading branch. Correctness rests on [READING] + owner
walk OW-W2-3. Not a defect (code reads correct); a coverage gap the spec
explicitly permitted ("accept OW-W2-3 as the sole check").

### 4. The six recording canaries + the 7th - CLEAN (with a ceiling residual)
`recording-split.structure.test.ts` [MEASURED, 54 tests pass via `npm run test:paths`]:
strip 12->10 (`:143` toHaveLength(10)), tabpanels 11->9 (`:196`), panelTargets
11->9 (`:235`), restore-guard and aria loops drop grading/snapgrade. The two
"NOT include" assertions are NEGATIVE (`not.toMatch`), not deletions-to-go-green.

`snapshot-grading.structure.test.ts` [MEASURED, 74 tests pass]: the RecordingTab
location assertions were REWRITTEN to page.tsx, not deleted. The "never unmounted
on tab switch" subject survives - the consolidated block asserts import
(`:72`), render (`:78`), display-toggle wrapper regex (`:82-99`), AND all four
guard terms (`activeTab`/`toolsSection`/`manualView === "grading"`/
`gradingView === "snapshots"`). The `RecordingLaunchView` describe (`:125-166`)
is untouched and green (recording-launch.ts unchanged). No fact dropped.

RESIDUAL R-B: `snapshot-grading.structure.test.ts` is EXACTLY 1000 lines
[MEASURED, `wc -l` = 1000 and `@(Get-Content).Count` = 1000, agree]. The ceiling
gate is `lineCount > limit` with `LIMIT = 1000` (`file-size-ceiling.structure.test.ts:41,138`),
so 1000 passes [MEASURED, gate green] but with ZERO headroom - the next added
line fails the repo-wide ceiling. Carry for the next editor.

### 5. The panels were not edited - CLEAN
`git status --short` = exactly the 7 expected files. No `GradingRecordingPanel.tsx`,
`SnapshotGradingPanel.tsx`, `GradingTab.tsx`, `url-state.ts`, `useAppNavigation.ts`,
`recording-launch.ts`, or `ManualRail.tsx`. Sizes [MEASURED, `wc -l`]:
`GradingRecordingPanel.tsx` 977 (unchanged, 23 under ceiling), `SnapshotGradingPanel.tsx` 953.
No scope breach.

### 6. The new grading members flow through - CLEAN
`manual-rail.ts`: `GradingView` widened to run|repos|recording|snapshots (`:29`),
`GRADING_VIEW_PRESENCE` gains both keys (`:31`), two destinations added
(`:107-108`), two resolver branches (`:310-311`). `getActiveDestinationId`
grading branch is the generic `` `grading-${gradingView}` `` (`:227`) - no edit
needed, works for new members.
- Collision [MEASURED, `grep -rn '"grading-recording"|"grading-snapshots"' src`]:
  each id appears only in manual-rail.ts. Free.
- The derived `GRADING_VIEWS` loop (`manual-rail.test.ts:322-338`) iterates
  `Object.keys(GRADING_VIEW_PRESENCE)` (now 4), so it auto-covers recording/
  snapshots; it would go red if a resolver branch were omitted. [MEASURED, 66
  tests pass; the loop is genuinely derived, not a hardcoded 2.]

---

## Other residuals

RESIDUAL R-C (= spec RES-W2-1): a stored `ta-rec-view = "grading"/"snapgrade"`
becomes invalid; RecordingTab's restore guard drops it to `"record"` (graceful,
not a wrong-tab bounce - `ta-rec-view` is not a URL param). No migration added
(useAppNavigation.ts not in the diff). Spec recommended SKIP; degrades cleanly.

RES-W2-3 (frozen-count readers) is DISCHARGED, not carried: all readers of the
two edited production files are green [MEASURED, `npm run test:paths`]:
message-replies (10), walkthrough-announcement (62), module-deck-capture (12),
ModuleDeckCapturePanel.wiring (34), recording-tab-header (5), useAppNavigation
(19), url-state (84), tab-rails (29), announcements-panel.wiring (16),
GradingRecordingPanel.wiring (58).

---

## Owner walk (un-observable here, no proxy)
OW-W2-1 four inner Grading items each render their surface; OW-W2-2 a live
capture SURVIVES switching chips/gradingView and back (the core [READING] claim
of section 2.2, enforced at source by I-W2 + the rewritten snapshot test, but
behaviourally settled only by the owner); OW-W2-3 "Grade via recording" and the
fab land on the right inner surface with the rubric modal; OW-W2-4 tablist
accessible name.

---

## Gates run
- `npx tsc --noEmit --incremental false` -> exit 0 [MEASURED]
- `npm run test:paths -- <16 paths across two runs>` -> all green (269 + 329) [MEASURED]
- `npm run docs:gate` -> exit 0, 49 tests (no-emojis, source-bytes) [MEASURED]
- `git status --short` -> the 7 expected files only [MEASURED]

Sizes [MEASURED, both counters agree]: page.tsx 769/769, RecordingTab.tsx
909/909, manual-rail.ts 338, snapshot-grading.structure.test.ts 1000/1000.

## Stopping point
Nothing is left at the ruling or design level; the design is sound and the
instruments are proven-red. What remains is MEASUREMENT that cannot run here -
the runtime lifecycle (OW-W2-2) and the launch landing (OW-W2-3), which are the
owner walk by construction, plus the launch-routing coverage gap R-A the owner
may or may not want closed with a test.
