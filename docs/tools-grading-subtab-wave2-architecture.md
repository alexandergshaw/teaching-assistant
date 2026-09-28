# Wave 2 derivation: Recording's two grading surfaces into Tools > Grading

Round 1 of the WAVE-2-DERIVATION activity (row `GRAD-SUBTAB`). This is a NEW
activity with its own two rounds. It closes residual RES-WAVE-1 from
`docs/tools-grading-subtab-waves.md`, which declared wave 2 NOT DISPATCHABLE
because its write set was "estimated, not derived" and re-parenting feasibility
was left open.

DECISION 18 (inner navigation), DECISION 17 (the incremental run is a fill) and
wave 1 as shipped (`f48a4e0`) are NOT reopened.

**Write set: this file only.** No file under `src/` or `supabase/` was opened
for writing. Nothing committed, nothing pushed. `git status --short` at the
start of this pass printed nothing (clean tree, HEAD `f48a4e0`).

**The prior docs are stale on line numbers.** `docs/tools-grading-subtab-waves.md`
and `docs/tools-grading-subtab-architecture.md` were authored on `d223143`, two
commits BEFORE wave 1 shipped. Wave 1 rewrote `manual-rail.ts`, `page.tsx`,
`url-state.ts` and `useAppNavigation.ts`, so every line number those docs cite
in those files has moved. Everything below was re-measured or re-read on the
CURRENT tree (`f48a4e0`); I cite the prior docs only for decisions, never for
line numbers.

**Reasoning-from-reading vs measurement.** Claims tagged [MEASURED] name the
command that produced them. Claims tagged [READING] are traced from source and
cannot be verified here because **no component is rendered by any test in this
repo** (`vitest` is node-env, collects only `src/**/*.test.ts`,
`vitest.setup.ts` throws on real `fetch`). Every claim about what a user sees,
what survives a reload, or what a live capture does on navigation is [READING]
and goes to the owner walk with no proxy proposed.

---

## 0. Instruments, and the command that produced every quantity

| Quantity | Instrument, with the command |
|---|---|
| Line count, counter A | `wc -l < <path>` (Bash) |
| Line count, counter B | `@(Get-Content <path>).Count` (PowerShell) |
| Symbol occurrences, per file, split decl/call/ref and comment/string | `src/tools/symbol-count/count.ts`'s `countSymbolOccurrences`, transpiled with the installed `typescript` and driven over every `.ts`/`.tsx` under `src/` (2772 files) - the driver and its full output are in section 3.1 |
| Source-text readers of a file | `grep -rln "<basename>" src --include=*.test.ts`, then each opened and vetted |
| String-literal / id collision | `grep -rn "\"<id>\"" src --include=*.ts --include=*.tsx` |
| Cited-line reads | `sed -n`, `Read` at the cited lines, on `f48a4e0` |
| Docs gate | `npm run docs:gate` |

Disciplines carried from this repo's recorded failures: `grep -c` was used for
NO count (it counts prose lines); every quantity was re-measured on `f48a4e0`,
not recalled from the prior docs; both counters were run on every file whose
size is load-bearing and they agree (section 1).

---

## 1. Sizes, both counters, on `f48a4e0`

`wc -l` [MEASURED, Bash] and `@(Get-Content).Count` [MEASURED, PowerShell]:

| Path | `wc -l` | `@(Get-Content).Count` | Agree | Role in wave 2 |
|---|---|---|---|---|
| `src/app/components/manual/manual-rail.ts` | 330 | 330 | yes | WRITTEN (grows a few lines) |
| `src/app/page.tsx` | 706 | 706 | yes | WRITTEN (grows ~40-60) |
| `src/app/components/RecordingTab.tsx` | 917 | 917 | yes | WRITTEN (SHRINKS) |
| `src/app/components/grading-recording/GradingRecordingPanel.tsx` | 977 | 977 | yes | **NOT written** (see section 2, 4) |
| `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` | (see note) | - | - | **NOT written** |
| `src/app/components/recording/recording-split.structure.test.ts` | 602 | 602 | yes | WRITTEN (6 canaries) |

**The decomposition worry in the plan is MOOT, and this is the single most
important size finding.** The plan (its 2.2 / 9.2) called wave 2 "partly
decomposition" because `GradingRecordingPanel.tsx` is 977, 23 under the
`LIMIT = 1000` ceiling (`src/file-size-ceiling.structure.test.ts:41` [READING,
adopted from wave 1]). The derivation in sections 2-4 shows **wave 2 does not
open `GradingRecordingPanel.tsx` at all** - it re-parents the panel by moving its
one mount site, not by editing the panel. So its 977 lines are untouched, its
23-line headroom is preserved by NOT writing it, and no extraction is needed.
The file that grows is `page.tsx` (706 -> ~750-770 [READING, estimated from the
edit list in 3.3]), which is ~230 lines under the ceiling. **No wave-2 file is a
ceiling risk, and no wave-2 file needs decomposition.**

---

## 2. The re-parenting feasibility verdict: FEASIBLE, with ONE binding constraint

> **The two Recording grading panels CAN be re-parented into the Tools > Grading
> inner nav. Each takes exactly one prop - `active: boolean` - and consumes no
> React context that RecordingTab provides. The ONE binding constraint is the
> MOUNT LIFECYCLE: both panels require an always-mounted, display-toggled host
> (never a conditional mount), and page.tsx's current `manualView === "grading"`
> branch is a conditional mount. Wave 2 must therefore mount the two panels as
> always-rendered, display-toggled top-level siblings of `RecordingTab`
> (page.tsx:624-631), NOT inside the `manualView === "grading" &&` block. Do
> that, and re-parenting is sound. Do it the naive way, and it silently kills a
> live capture on every navigation.**

### 2.1 The context/provider trace (why the panels are portable) [READING]

Both panels' props, measured:

- `src/app/components/grading-recording/GradingRecordingPanel.tsx:212`:
  `export default function GradingRecordingPanel({ active }: { active: boolean })`.
- `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx:80-84`:
  `interface SnapshotGradingPanelProps { active: boolean }`, and the default
  export takes `{ active }`.

Neither panel is passed ANY of RecordingTab's rich internal state. In
`RecordingTab.tsx` the two mounts are, verbatim [MEASURED, `sed -n`]:

```
:857  <GradingRecordingPanel active={active && recView === "grading"} />
:867  <SnapshotGradingPanel active={active && recView === "snapgrade"} />
```

`active` is the only prop. RecordingTab's `takes`, `pipeline`, refs, recorder,
etc. are threaded into `SourceDevicesPanel`/`StagePanel`/`TakesPanel` by prop -
never into these two.

Context: `grep -nE "useContext|Provider" ` over both panels [MEASURED]. The only
shared-context hook either consumes is `useLlmProvider()`
(`GradingRecordingPanel.tsx:213`, from `@/lib/llm-provider`).
`RecordingTab.tsx` does NOT render any `Context.Provider` around its children -
verified by reading its whole render (`:565-916`): it renders `<TabShell>` with
the strip and the display-toggled panels, no provider. So `useLlmProvider`'s
provider is mounted ABOVE the tab tree (app root / layout), reachable equally
from the Tools > Grading container. `SnapshotGradingPanel` consumes only its own
self-contained hooks (`useSnapshotCapture`, `useSnapshotShots`, ... - all in
`./`), no context at all.

**Conclusion [READING]:** the panels have no RecordingTab-scoped runtime
dependency. Moving their mount does not orphan a provider.

### 2.2 The one binding constraint: the always-mounted lifecycle [READING]

Both panels' own headers declare a mount-lifetime requirement:

- `GradingRecordingPanel.tsx:28-33`: "this panel stays mounted for the whole
  RecordingTab lifetime (RecordingTab.tsx renders it inside the same
  always-mounted, display:none-toggled stack every other inner view uses), so ...
  it registers ONE live RECORDING_LAUNCH_EVENT listener on mount".
- `SnapshotGradingPanel.tsx:8-11`: "kept mounted, display:none'd by RecordingTab
  when another sub-tab is active ... a live MediaStream keeps running behind a
  hidden panel (no pause-on-hide) ... deliberately".

This guarantee is REAL in the tree today. `RecordingTab` itself is mounted
always, display-toggled, at `page.tsx:624-631` [MEASURED]:

```
<div style={{ display: activeTab === "manual" && toolsSection === "manual" && manualView === "recording" ? undefined : "none" }}>
  <RecordingTab active={activeTab === "manual" && toolsSection === "manual" && manualView === "recording"} />
</div>
```

with the comment (`:607-623`) "Turning it into [a conditional render] would
unmount a running screen capture the moment the user looked at another tab, which
is a lost recording rather than a blank pane."

The `manualView === "grading"` branch, by contrast, is a CONDITIONAL MOUNT
inside a ternary [MEASURED, `page.tsx:568-585`]:

```
{manualView === "grading" && (
  <TabShell>
    {gradingView === "repos" ? <RepoGradesTab /> : <GradingTab ... />}
  </TabShell>
)}
```

It unmounts when `manualView` leaves `"grading"`, when `activeTab` leaves
`"manual"` (the whole block is inside `{activeTab === "manual" && (...)}`,
`:480-605`), and the ternary swaps its child on `gradingView` change. That is
the OPPOSITE of what the two capture panels require.

**So the naive move - adding the two panels as more branches of the `:568`
ternary - would unmount a live grading-via-recording capture (and its
RECORDING_LAUNCH_EVENT listener) every time the user clicked another chip, and a
live snapshot MediaStream every time they switched gradingView.** No test would
catch it (nothing renders here), and it directly regresses each panel's stated
guarantee.

**The feasible construction:** mount the two panels as always-rendered,
display-toggled top-level siblings of `RecordingTab` (i.e. after `page.tsx:631`,
OUTSIDE the `{activeTab === "manual" && ...}` block), each gated on
`activeTab === "manual" && toolsSection === "manual" && manualView === "grading"
&& gradingView === "<view>"` for display and passed the same predicate as
`active`. This is a faithful copy of how the panels behave today (RecordingTab is
always-mounted; the panels are display:none-toggled by `recView`, `active=false`
when not selected). The run/repos surfaces (`GradingTab`/`RepoGradesTab`) stay in
the conditional `:568` block unchanged - they have no live capture and do not
need always-mounting, exactly as they do not today.

**This makes wave 2 a bigger `page.tsx` change than the plan's estimate, but a
SMALLER `GradingRecordingPanel.tsx` change (none).** The plan feared the wrong
file.

---

## 3. The derived wave-2 write set

### 3.1 The caller derivation (symbol census)

Instrument: `src/tools/symbol-count/count.ts`'s `countSymbolOccurrences`,
transpiled with the installed `typescript` and run over all `.ts`/`.tsx` under
`src/`. Driver (scratchpad, deleted after): reads `count.ts`, transpiles it,
neutralises its own `createRequire(import.meta.url)("typescript")` (which cannot
resolve from a data-URL module) by injecting `ts` from the repo's
`node_modules/typescript/lib/typescript.js`, then prints every file with
`codeOccurrences > 0`. Output [MEASURED]:

```
FILES SCANNED: 2772

=== GradingRecordingPanel === (codeOccurrences>0)
  src/app/components/grading-recording/GradingRecordingPanel.tsx  code=1 (decl=1 call=0 ref=0) cmt=1 str=0
  src/app/components/RecordingTab.tsx  code=2 (decl=1 call=0 ref=1) cmt=2 str=1

=== SnapshotGradingPanel === (codeOccurrences>0)
  src/app/components/RecordingTab.tsx  code=2 (decl=1 call=0 ref=1) cmt=0 str=1
  src/app/components/snapshot-grading/SnapshotGradingPanel.tsx  code=1 (decl=1 call=0 ref=0) cmt=0 str=0

=== gradingView === (codeOccurrences>0)
  src/app/components/home/useAppNavigation.test.ts  code=2 (decl=0 call=0 ref=2) cmt=1 str=13
  src/app/components/home/useAppNavigation.ts  code=8 (decl=1 call=0 ref=7) cmt=1 str=1
  src/app/components/manual/manual-rail.test.ts  code=5 (decl=0 call=0 ref=5) cmt=0 str=1
  src/app/components/manual/manual-rail.ts  code=12 (decl=2 call=0 ref=10) cmt=0 str=0
  src/app/components/manual/ManualRail.tsx  code=3 (decl=1 call=0 ref=2) cmt=0 str=0
  src/app/components/tabs/tab-rails.test.ts  code=2 (decl=0 call=0 ref=2) cmt=0 str=1
  src/app/page.tsx  code=8 (decl=1 call=0 ref=7) cmt=0 str=0
  src/app/url-state.test.ts  code=8 (decl=0 call=0 ref=8) cmt=3 str=4
  src/app/url-state.ts  code=5 (decl=0 call=0 ref=5) cmt=1 str=1
```

**The caller rule, discharged.** `GradingRecordingPanel` and
`SnapshotGradingPanel` each have code occurrences in exactly TWO files: their own
declaration, and `RecordingTab.tsx` (import binding `decl=1` + the JSX mount
`ref=1`). **`RecordingTab.tsx` is the SOLE caller of each panel.** So moving the
mount is: delete two `ref` sites from `RecordingTab.tsx`, add two to `page.tsx`.
`page.tsx` becomes the new caller and is in the write set. No third caller ships
dead.

The `gradingView` census tells the OTHER half: which of gradingView's readers
wave 2 must touch when it CHANGES THE MEMBER SET. It changes the set (adds two
members); it does NOT change gradingView's plumbing (the state in
`useAppNavigation.ts`, the prop in `ManualRail.tsx`, the param in `url-state.ts`)
- all of that derives from `isGradingView` / `GRADING_VIEWS` (section 3.4). So
of the nine gradingView readers, wave 2 writes only `manual-rail.ts` (the member
list) and `page.tsx` (the render), plus the test canaries in section 4.

### 3.2 Production write set (3 files)

| # | Path | Edit points | Forced by |
|---|---|---|---|
| P1 | `src/app/components/manual/manual-rail.ts` | (i) `GradingView` (`:29`): add two members (recommended `"recording"`, `"snapshots"` - see 3.5). (ii) `GRADING_VIEW_PRESENCE` (`:31`): add the two keys. (iii) `destinations` "Grading" group (`:98-104`): add two `Destination` entries `grading-recording` / `grading-snapshots`. (iv) `resolveStateFromDestinationId` gradingView IIFE (`:301-305`): add two branches (`id === "grading-recording" -> "recording"`, etc.). | (ii) **tsc** (`Record<GradingView, true>` excess/missing property); (iii) **CANARY** at `manual-rail.test.ts:238`/`:372`; (iv) **derived GUARD** at `manual-rail.test.ts:317-323` (proven in 4.2). `getActiveDestinationId` needs NO edit - its grading branch is already the generic `` `grading-${gradingView}` `` (`:220-221`). |
| P2 | `src/app/page.tsx` | (i) launch listener (`:142-152`): branch on `detail.view` - `"grading"` -> `setManualView("grading"); setGradingView("recording")`, `"snapgrade"` -> `setGradingView("snapshots")`, else `setManualView("recording")`; add `setGradingView` to the dep array (`:152`). (ii) grading branch (`:568-585`): guard the `<TabShell>` to render ONLY for `gradingView === "run" || "repos"` (so the two new views do not fall into the `GradingTab` ternary else). (iii) TWO new always-mounted, display-toggled `<div>`s, siblings of `RecordingTab` (after `:631`, OUTSIDE the `activeTab==="manual"` block), mounting `<GradingRecordingPanel active={...} />` and `<SnapshotGradingPanel active={...} />`, each gated on `activeTab==="manual" && toolsSection==="manual" && manualView==="grading" && gradingView==="<view>"`. (iv) add imports of the two panels. | (i) design + **tsc** (exhaustive `detail.view` if narrowed); (ii) **[READING]** correctness (the else-ternary would render `GradingTab` for the new views); (iii) **[READING]** lifecycle (section 2.2) + the NEW always-mounted guard (section 4, I-W2); (iv) tsc (JSX ref needs the import). |
| P3 | `src/app/components/RecordingTab.tsx` | (i) strip literal (`:592`): remove the `["grading", ...]` and `["snapgrade", ...]` tuples (12 -> 10). (ii) remove the two tabpanel `<div>`s: `rec-panel-grading` (`:856-858`) and `rec-panel-snapgrade` (`:866-868`). (iii) `recView` `useState` union (`:62-63`): remove `"grading"`, `"snapgrade"`. (iv) restore guard (`:73`, `:77`): remove the `v === "grading"` / `v === "snapgrade"` arms. (v) launch listener (`:101-109`): guard `setRecView(detail.view)` so `"grading"`/`"snapgrade"` return early. (vi) remove imports (`:30`, `:35`). | (iii)+(v) **tsc**: once the union drops the two members, `setRecView(detail.view)` (where `detail.view: RecordingLaunchView` still includes them) is TS2345, and the union literal type mismatches. (i)(ii)(iv)(vi) are the move; (i)(ii)(iv) are **CANARY**-forced (section 4). |

**What P2(i) is, and why the plan missed it.** The launch handoff is a
load-bearing surface the plan's estimate omitted entirely.
`openRecordingTool` / `navigateToRecordingTool`
(`src/lib/recording-launch.ts:298-336`) only DISPATCH `RECORDING_LAUNCH_EVENT`;
they do not switch the tab. The top-level navigation is done by page.tsx's
listener (`:142-152`), which today sets `manualView="recording"` for ANY launch.
The "Grade via recording" Knowledge-base button
(`KnowledgeTab.tsx:466`, `openRecordingTool({ view: "grading", openRubric: true })`)
[MEASURED] and the fab's `navigateToRecordingTool("grading")` both go through it.
After the move, a `"grading"`/`"snapgrade"` launch must land on Tools > Grading,
not Recording - so this listener MUST become view-aware. The panels' OWN
listeners (`GradingRecordingPanel.tsx:499-508`, keyed on view `"grading"`) are
unchanged and stay live because the panel is now always-mounted at its new home.

### 3.3 Test write set (4 files)

| # | Path | Edit | Kind |
|---|---|---|---|
| T1 | `src/app/components/recording/recording-split.structure.test.ts` | the six canaries (section 4.1) | all CANARY |
| T2 | `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` | rewrite the RecordingTab-location assertions (`:63-107`) to the NEW page.tsx always-mounted location, PRESERVING the "never unmounted on tab switch" subject; the RecordingLaunchView assertions (`:110-120`) stay green unchanged | CANARY-carrying-GUARD (section 4.3) |
| T3 | `src/app/components/manual/manual-rail.test.ts` | update the exact-list canaries at `:238-239` and `:372-373` (2 ids/labels -> 4) | CANARY; the derived GRADING_VIEWS guards `:317-330` are GUARDS, do NOT touch |
| T4 | `src/app/components/tabs/topLevelTabs.wiring.test.ts` | AUTHOR the new always-mounted guard(s) for the two moved capture panels, modelled on the existing RecordingTab guard `:473-499` (section 4, I-W2) | new instrument |

### 3.4 What needs NO edit - verified, not assumed

- **`src/app/url-state.ts`** [MEASURED, `grep -n "grading" src/app/url-state.ts`]:
  `normalizeGradingView` (`:221-222`) derives from `isGradingView`;
  `DEFAULT_GRADING_VIEW = normalizeGradingView(null)` (`:275`);
  `GRADING_VIEW_PARAM = "gradingView"` (`:296`); `buildUrlSearch` emits it when
  `manualView === "grading" && gradingView !== DEFAULT_GRADING_VIEW` (`:434-435`);
  `parseUrlState` reads it via `normalizeGradingView(params.get(...))` (`:387`).
  There is NO hardcoded value list. Adding members to `GradingView` flows through
  all of this with zero edits. **NOT in the write set.**
- **`src/lib/recording-launch.ts`** [MEASURED, `sed -n '57,90p'`]: `RecordingLaunchView`
  and `RECORDING_LAUNCH_VIEWS` keep `"grading"` and `"snapgrade"` - the panels'
  own listeners still key on those view values, and the event still carries them.
  Nothing forces an edit. **NOT in the write set.** (Confirmed by `recording-launch.test.ts`
  staying green - it asserts the union/array contain `"snapgrade"`/`"grading"`,
  section 4.4.)
- **`src/app/components/home/useAppNavigation.ts`** [MEASURED, census]: `gradingView`
  state derives via `normalizeGradingView`; the popstate branch for
  `manualView === "grading"` and the `ta-grading-view` persist landed in wave 1
  and pick up new members automatically. **NOT in the write set** - UNLESS the
  optional `ta-rec-view` migration (RES-W2-1) is taken, which would add it.
- **`src/app/components/manual/ManualRail.tsx`** [MEASURED, census `code=3`]: the
  `gradingView: GradingView` prop widens with the type automatically. No edit.
- **`getActiveDestinationId`** (`manual-rail.ts:220-221`): generic
  `` `grading-${gradingView}` ``; no edit.
- **`GradingRecordingPanel.tsx` and `SnapshotGradingPanel.tsx`**: their contract
  (`{ active: boolean }`) and their own launch listeners are unchanged by the
  move. The census shows their only code occurrence is the declaration. **NOT in
  the write set** - which is why no decomposition is needed (section 1).

### 3.5 The two new gradingView members and destination ids (my design call)

Recommended: `GradingView = "run" | "repos" | "recording" | "snapshots"`, with
destinations `grading-recording` (label "Grading (from a recording)") and
`grading-snapshots` (label "Grading (from screenshots)"), matching the labels
the RecordingTab strip uses today (`RecordingTab.tsx:592`).

Collision check [MEASURED, `grep -rn '"grading-recording"|"grading-snapshots"' src`]:
each appears in **0** files as a string literal, so both destination ids are
free. `getDestinationById` is a flat id search (`manual-rail.ts:107-113`), so
freedom of the id is what matters; it is confirmed. The directory
`src/app/components/grading-recording/` is referenced by many tests as a PATH
(e.g. `grading-rows.test.ts:651`, `GradingRecordingPanel.wiring.test.ts:35`)
[MEASURED] - those are file-path reads, NOT nav ids, and wave 2 moves no files,
so they are unaffected.

**This is a UX/wording call, mine, not the owner's** - the exact member strings
and labels are RES-W2-2, owned by a UX seat. The DERIVATION does not depend on
the wording; it depends only on the id being `` `grading-${member}` `` and free.

### 3.6 The `owns` list (source-text readers, run-in-gate but not written)

A test that reads a wave-2-edited file AS SOURCE TEXT goes red on a change it
does not import. Instrument: `grep -rln "<basename>" src --include=*.test.ts`,
each opened. Readers of the three written production files [MEASURED]:

Readers of `RecordingTab.tsx` (11):
```
src/app/components/canvas-tab/announcements-panel.wiring.test.ts
src/app/components/message-replies/message-replies.structure.test.ts
src/app/components/module-deck-capture/module-deck-capture.structure.test.ts
src/app/components/module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts
src/app/components/recording/recording-split.structure.test.ts        (WRITTEN, T1)
src/app/components/recording/recording-tab-header.structure.test.ts
src/app/components/snapshot-grading/snapshot-grading.structure.test.ts (WRITTEN, T2)
src/app/components/ui/buttonVariant.test.ts
src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts
src/file-size-ceiling.structure.test.ts
src/lib/recording-launch.test.ts
```
Readers of `page.tsx` (10):
```
src/app/bulkBarCss.test.ts
src/app/components/content-tab/modules/generatedPreviewModal.wiring.test.ts
src/app/components/courses/page-module-css-classes.test.ts
src/app/components/courses/page-module-css-orphan-classes.test.ts
src/app/components/repo-grades/repoGradesSliceA.guards.test.ts
src/app/components/tabs/topLevelTabs.wiring.test.ts                    (WRITTEN, T4)
src/app/focusRing.wiring.test.ts
src/lib/canvas-credentials.exports.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
src/lib/visualizer.test.ts
```
Readers of `manual-rail.ts` (5):
```
src/app/components/canvas-tab/announcements-panel.wiring.test.ts
src/app/components/contentTab.wiring.test.ts
src/app/components/home/useAppNavigation.test.ts
src/app/components/manual/manual-rail.test.ts                         (WRITTEN, T3)
src/app/components/tabs/topLevelTabs.wiring.test.ts                   (WRITTEN, T4)
```
Plus the panel-file source-text readers that PROVE the panels were not touched
(they must stay green): `grading-recording/grading-rows.test.ts`,
`grading-recording/GradingRecordingPanel.wiring.test.ts`,
`grading-recording/GradingRecordingPanel.assessment.test.ts`,
`grading-recording/GradingAssessmentDeclarationControls.test.ts`,
`grading-recording/GradingCaptureSettings.wiring.test.ts`,
`grading-recording/markLate.wiring.test.ts`,
`snapshot-grading/snapshot-autofire.structure.test.ts`,
`snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts` [MEASURED,
the "reads RecordingTab for grading/snapgrade wiring" scan].

**Counts to VERIFY in the gate (not resolved here, flagged rather than guessed).**
Three readers of `RecordingTab.tsx` assert frozen counts whose subject I did not
fully open: `message-replies.structure.test.ts:113` (`distinctKeys.size).toBe(15)`),
`walkthrough-announcement.structure.test.ts:352` (`occurrences.length).toBe(2)`)
and `:467` (`reads.length).toBe(1)`) [MEASURED, `grep`]. They are almost
certainly counting each feature's OWN keys/occurrences (localStorage keys and
panels wave 2 does not touch), not the grading/snapgrade strip entries, so they
should stay green - but a count that reads a file wave 2 edits is exactly the
"correct change goes red" class, so the wave-2 gate MUST run them and the brief
must treat a red there as a canary-or-guard call, not a wave-2 bug on sight.
Filed as RES-W2-3.

---

## 4. The asserting-test set, with the per-test CANARY-OR-GUARD call

CANARY = freezes a fact the change legitimately alters (update it). GUARD = tells
you the design is wrong (if it goes red, change the design).

### 4.1 The six recording-split canaries - all CANARY, none a GUARD

Read in full at `recording-split.structure.test.ts:120-266` [MEASURED]. Each
freezes RecordingTab's strip shape, which wave 2 legitimately shrinks by two
entries. None protects a property the move violates.

| Line | Assertion [MEASURED] | After wave 2 | Call |
|---|---|---|---|
| `:143` | `expect(entries).toHaveLength(12)` (strip tuples) | 10 | CANARY (12 -> 10) |
| `:150-152` | the `it("...dedicated grading entry in the strip...")` matching `/["grading", ...]/` | the entry is removed | CANARY - delete this `it` block |
| `:169-176` | restore-guard loop asserts `v === "<value>"` for a list INCLUDING `"grading"` (NOT `"snapgrade"`) | `"grading"` gone from the guard | CANARY - drop `"grading"` from the loop list |
| `:196-198` | `expect(matches).toHaveLength(11)` (`role="tabpanel"`) | 9 | CANARY (11 -> 9) |
| `:209-234` | aria-controls resolves for a `keys` list INCLUDING `"grading"` and `"snapgrade"`; `panelTargets.size).toBe(11)` | drop both keys | CANARY (size 11 -> 9; drop `id="rec-panel-grading"`/`-snapgrade` checks) |
| `:236-266` | aria-labelledby loop for a list INCLUDING `"grading"` (NOT `"snapgrade"`) | `"grading"` gone | CANARY - drop `"grading"` from the loop |

Note the pre-existing asymmetry: this file tracks `"grading"` in five of the six
places but `"snapgrade"` only in the strip count (`:143`) and the aria-controls
keys (`:219`). Wave 2 updates each where it actually appears. All six updates
land in T1 (in the write set).

### 4.2 The derived GRADING_VIEWS guards - GUARD (derived), do NOT touch

`manual-rail.test.ts:317-330` [MEASURED, Read]:
```
for (const view of GRADING_VIEWS) {
  const state = resolveStateFromDestinationId(`grading-${view}`, "recording", "new", "modules", "run");
  expect(state.gradingView).toBe(view);            // :320-322
}
... expect(getActiveDestinationId("grading","new","modules",view)).toBe(`grading-${view}`);  // :328
```
It iterates `GRADING_VIEWS`, so it AUTOMATICALLY covers the two new members once
they are in the list. The 5th argument (currentGradingView) is `"run"`, so for a
new member `"recording"` with NO resolver branch, `state.gradingView` falls back
to `"run"` != `"recording"` -> **RED**. This is the enforcer that makes P1(iv)
(the resolver branches) non-silent: it is the caller-rule guard for the resolver.
Do NOT write a second one. It is green today and goes red on exactly the omitted
branch.

### 4.3 snapshot-grading.structure.test.ts - CANARY-carrying-GUARD, WRITTEN

This is a **seventh structure test the plan did not know about** (the plan and
architecture named only the six recording-split canaries). It pins
`SnapshotGradingPanel`'s location to RecordingTab [MEASURED, `:63-107`]:

- `:64-67` RecordingTab imports the panel; `:70-71` RecordingTab renders
  `<SnapshotGradingPanel`; `:74-75` the panel receives
  `active={active && recView === "snapgrade"}` - "the same always-mounted,
  display:none-toggled idiom every sibling inner view uses, never unmounted on
  tab switch"; `:79-89` `"snapgrade"` in the recView union; `:92-102` in the
  restore guard; `:105-106` in the strip.

**Call:** the assertions that bind it to `RecordingTab.tsx` / `recView` / the
recording strip are CANARIES - the location legitimately moves. But the SUBJECT
they encode - mounted, reachable, and **always-mounted / never unmounted on tab
switch** - is a GUARD that MUST SURVIVE the move, rewritten against the new
page.tsx location. Wave 2 rewrites `:63-107` to assert the panel is imported and
rendered by `page.tsx`, gated on `manualView === "grading" && gradingView ===
"snapshots"`, inside a `display`-toggled always-rendered element (the shape
`topLevelTabs.wiring.test.ts:473-499` uses for RecordingTab). If an implementer
put it in the conditional `:568` ternary instead, this rewritten test SHOULD go
red - which is the protection we want. The `RecordingLaunchView` assertions
(`:110-120`) stay unchanged and green (`recording-launch.ts` untouched).

### 4.4 recording-launch.test.ts - GREEN, GUARD, do NOT touch

`recording-launch.test.ts:21-40`, `:472-500` [MEASURED] assert
`parseRecordingLaunch({ view: "grading" })` round-trips and that
`navigateToRecordingTool("grading")` / `openRecordingTool({view:"grading",openRubric:true})`
dispatch the event with the right `detail`. Wave 2 leaves `recording-launch.ts`
untouched and keeps `"grading"`/`"snapgrade"` in the launch union, so these stay
green. Do not touch. They are the proof that the launch event still reaches the
panels' own listeners after the move.

### 4.5 The instruments an implementer must build

| id | Instrument | Object | Direction of failure | Named mutation that must turn it red |
|---|---|---|---|---|
| I-W2 (NEW) | always-mounted guard for the two moved panels (T4, in `topLevelTabs.wiring.test.ts`, modelled on `:473-499`) | `page.tsx` source | RED when `<GradingRecordingPanel` / `<SnapshotGradingPanel` is NOT wrapped in a `style={{ ... display: ... "none" ... }}`-toggled element, i.e. is a conditional render | put either panel inside the `manualView === "grading" &&` ternary (`:568`) instead of an always-rendered display-toggled sibling -> RED |
| I-snap (rewrite of T2) | the rewritten snapshot-grading reachability assertions | `page.tsx` source | RED when `SnapshotGradingPanel` is not mounted by page.tsx with the always-mounted idiom at `manualView==="grading" && gradingView==="snapshots"` | delete the page.tsx snapshot mount -> RED |
| I-inner (update of T3) | `getInnerDestinations("grading")` exact list (`:238`/`:372`) | the destinations array | RED when the Grading group is not exactly the 4 ids/labels | omit a new destination entry -> RED |
| I-resolve (existing, 4.2) | the derived GRADING_VIEWS loop | resolver + getActiveDestinationId | RED when a member has no resolver branch | omit the `grading-recording` resolver branch -> RED |
| I-strip (update of T1) | the six recording-split canaries | RecordingTab source | RED when the strip/tabpanels still carry grading/snapgrade | leave a strip tuple behind -> RED (count 12 vs 10) |

All are structure/source-text or pure-function instruments - none renders a
component. Each is green today (or after the canary update) and goes red on
exactly its named mutation.

---

## 5. One wave or cut? ONE WAVE.

**Wave 2 is ONE wave.** The edits are tsc- and canary-coupled: `manual-rail.ts`'s
`GradingView` member set forces the derived GRADING_VIEWS guard to cover the new
members, which forces the resolver branches; `page.tsx` renders those members;
`RecordingTab.tsx`'s shrunk `recView` union tsc-forces its launch-listener guard;
the recording-split and snapshot-grading canaries move with the strip. No proper
subset delivers a coherent, gateable state that also satisfies DECISION 18 ("the
surfaces MOVE into it").

**It CAN be cut into 2a/2b along the two panels if smaller diffs are wanted, and
the intermediate compiles** - 2a moves grading-via-recording (GradingView gains
`"recording"`, its destination, its always-mounted page.tsx mount; RecordingTab
drops the grading strip entry/tabpanel; recording-split canaries 12->11, 11->10),
leaving `"snapgrade"` in RecordingTab; 2b moves snapshot-grading (adds
`"snapshots"`, rewrites snapshot-grading.structure.test.ts, recording-split
11->10, 10->9). Each is independently gateable and shippable. But the risky part
- the always-mounted page.tsx construction and I-W2 - is identical for both, so
doing them together shares that structural change once. **Recommend one wave;
the 2a/2b split is available as a risk-isolation option, not a requirement.**

The prior plan's wave 3 (Drafted Grades) is untouched by this pass and remains
NOT DISPATCHABLE (RES-WAVE-2 in the plan).

---

## 6. Gate

Run from PowerShell, repo root, after the edits. Every path confirmed present on
`f48a4e0`.

```
git status --short
npx tsc --noEmit --incremental false
npm run lint
npm run test:paths -- src/app/components/recording/recording-split.structure.test.ts src/app/components/snapshot-grading/snapshot-grading.structure.test.ts src/app/components/manual/manual-rail.test.ts src/app/components/tabs/topLevelTabs.wiring.test.ts src/app/components/home/useAppNavigation.test.ts src/app/url-state.test.ts src/app/components/tabs/tab-rails.test.ts src/app/components/canvas-tab/announcements-panel.wiring.test.ts src/app/components/contentTab.wiring.test.ts src/app/components/recording/recording-tab-header.structure.test.ts src/app/components/message-replies/message-replies.structure.test.ts src/app/components/module-deck-capture/module-deck-capture.structure.test.ts src/app/components/module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/app/components/ui/buttonVariant.test.ts src/file-size-ceiling.structure.test.ts src/lib/recording-launch.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts src/app/components/grading-recording/grading-rows.test.ts src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
npm test
wc -l <each written production path>   and   @(Get-Content <each>).Count
```

Multi-path runs are spelled `npm run test:paths -- <paths>`, never a raw
multi-path `vitest`/`npm test` (which silently drops unmatched args - this repo's
own `src/tools/vitest-paths/gate-commands.structure.test.ts` enforces it).
`npx tsc --noEmit --incremental false` carries the flag because the bare form
races on `tsconfig.tsbuildinfo` under concurrency.

**Pass conditions, each naming object / instrument / direction:**

| Object | Instrument | Direction of failure |
|---|---|---|
| the write set | `git status --short` vs the P1-P3 + T1-T4 list | RED when any other path appears - specifically RED if `GradingRecordingPanel.tsx` or `SnapshotGradingPanel.tsx` appears (they must NOT be edited), or `GradingTab.tsx`/`repo-grades/index.tsx` appear |
| type graph | `npx tsc --noEmit --incremental false` | RED on the tsc-forced edits left undone (P1(ii) presence map; P3(iii)/(v) the shrunk recView union vs `setRecView(detail.view)`) |
| lint | `npm run lint` | RED on a NEW warning in a written file; exhaustive-deps RED if P2(i) omits `setGradingView` from the listener deps |
| `getInnerDestinations("grading")` | inside the `test:paths` run (`manual-rail.test.ts`) | RED when the Grading group is not exactly the 4 ids/labels (I-inner) |
| resolver completeness | derived loop (`manual-rail.test.ts:317-323`) | RED when a GRADING_VIEWS member has no resolver branch (I-resolve) |
| RecordingTab strip | `recording-split.structure.test.ts` | RED on a leftover strip/tabpanel entry (counts 10 / 9 / 9) |
| the two panels are ALWAYS-MOUNTED at the new home | I-W2 (`topLevelTabs.wiring.test.ts`) + rewritten `snapshot-grading.structure.test.ts` | RED when either panel is a conditional render rather than a display-toggled always-rendered element |
| the panel files are UNTOUCHED | the panel-dir tests in the gate + `git status --short` | RED (unexpected) if a panel file changed - which would also risk the 977-line ceiling on `GradingRecordingPanel.tsx` |
| written file sizes | both counters | RED above 1000; page.tsx ~750-770 after, ~230 under |

`npm run build` is NOT required: no wave-2 production file is a `"use server"`
module ([READING] - `page.tsx`, `RecordingTab.tsx`, `manual-rail.ts` are client
/ leaf modules), so the build's load-bearing catch cannot apply. Run as
defense-in-depth is fine (pass condition: the `Compiled successfully` line, never
exit 0 - the prerender tail fails with no `.env`).

---

## 7. The owner walk (non-gateable, [READING] / owner)

No component renders here, so the entire visible/runtime half is the owner's
final step. No proxy is proposed.

| id | Item | Owner | Instrument | Step |
|---|---|---|---|---|
| OW-W2-1 | Tools > Grading's inner nav shows FOUR items (Submissions, Repo Grades, Grading (from a recording), Grading (from screenshots)); each renders its surface | repo owner | open the app, Tools > Grading, click each inner item | after wave 2 lands |
| OW-W2-2 | A live grading-via-recording capture (or snapshot MediaStream) SURVIVES switching to another Tools chip and back, and switching gradingView and back - i.e. the always-mounted move actually preserved the lifecycle | repo owner | start a capture on Grading (from a recording), switch to Submissions, switch to the LMS chip, come back; confirm the capture is still live | same sitting - this is the [READING] claim of section 2.2 that no test here can settle |
| OW-W2-3 | "Grade via recording" (Knowledge base) and the fab's grading entry land on Tools > Grading > the right inner surface, with the rubric modal opening | repo owner | click "Grade via recording" with pages selected; use the fab's grading entry | same sitting - exercises P2(i) launch re-point + the panel's own listener |
| OW-W2-4 | The Grading inner tablist's accessible name is still "Grading tools" (wave 1), unchanged; the four items read correctly to a screen reader | repo owner | screen reader on the inner tablist | same sitting |

---

## 8. Residual register

Each row names owner, instrument, next step. A row missing any of the three is a
DELETION. **None of these is a row in `docs/BACKLOG.md` yet** - that file is not
in my write set - so until the backlog seat files them (or folds them into the
GRAD-SUBTAB home row) they DO NOT EXIST. Stated plainly.

| id | Residual | Owner | Instrument | Next step |
|---|---|---|---|---|
| RES-W2-1 | `ta-rec-view = "grading"`/`"snapgrade"` in a user's storage becomes invalid after wave 2; RecordingTab's restore guard drops it to `"record"` (NOT a wrong-tab bounce - the top-level tab is governed by `ta-active-tab`/`ta-manual-view`, and `recView` is NOT a URL param, verified: `url-state.ts` has no `recView`). A migration to redirect it to Tools > Grading is OPTIONAL, not load-bearing. If taken, it adds `useAppNavigation.ts` + two `RETIRED_GRADING_POINTERS` keys to the write set. | wave-2 implementer (if owner wants it) | a `useAppNavigation` init read of `ta-rec-view` + a unit test | the owner decides include/skip; I recommend SKIP (degrades gracefully) unless the owner wants exact continuity |
| RES-W2-2 | The two new gradingView member strings and their labels are MY default (`"recording"`/`"snapshots"`, labels copied from the RecordingTab strip). | wave-2/wave-3 UX seat | the exact-list assertion at `manual-rail.test.ts:238`/`:372` + the collision census | the UX pass on the as-built diff |
| RES-W2-3 | Three frozen counts in RecordingTab.tsx readers whose subject I did not fully open: `message-replies.structure.test.ts:113` (size 15), `walkthrough-announcement.structure.test.ts:352` (len 2)/`:467` (len 1). Likely green (per-feature keys, not the strip), but they read a file wave 2 edits. | wave-2 implementer | run them in the wave-2 gate (they are in section 6's list) | the gate settles it before commit; a red is a canary-or-guard call, not a wave-2 bug on sight |
| RES-W2-4 | The launch-listener re-point (P2(i)) has NO structure test asserting `detail.view === "grading"` routes to `manualView="grading"` (only the panels' own listeners and the dispatch are tested). Its correctness is [READING] + OW-W2-3. | wave-2 test-author | a source-text assertion on the page.tsx listener's grading branch, OR accept OW-W2-3 as the sole check | add the assertion in T4, or record the owner-walk-only status |
| RES-W2-5 | `GradingRecordingPanel.tsx` is 977/977, 23 under the ceiling, and wave 2 does NOT edit it - but any FUTURE edit has almost no headroom. Not wave 2's problem; carried so the next editor knows. | whoever next edits that file | both counters on that path | before any edit that adds > ~20 lines |

Carried unchanged from the plan (still open, not discharged here): RES-WAVE-2
(wave 3 feasibility), RES-ARCH-8 (the trap card states `GradingRecordingPanel`
at 964; measured 977 - still stale), RES-ARCH-9 (`INCREMENTAL_ROUTE_ENABLED`
line-number drift).

---

## 9. The leverage line: trigger FIRED, NO CLAIM, declined not omitted

`docs/loop/seats.md` owes a claim when a chunk builds or changes a capability a
user reaches. **Wave 2 adds no mechanism.** Both grading surfaces
(grading-via-recording, snapshot grading) exist and are reachable today from the
Recording tab; wave 2 relocates their mount and their nav entry. The only
advantage it could name is CLICK COST / discoverability, which
`docs/loop/leverage.md:66` lists among the STRUCK classes ("Free to any feature
with a UI at all ... not a categorical advantage over a chat"). So: trigger
recorded, claim declined. I am not defaulting the three-way call - this is a
relocation, not a feature. (The launch re-point and the always-mounted move keep
an EXISTING capability reachable; claiming them would be the failing shape
`leverage.md:85-98` exists to catch.)

---

## 10. What I could not determine

Stated plainly rather than filled in.

1. **Anything a user sees, or any lifecycle behaviour at runtime** - no component
   renders here. Section 2.2's core claim (the panels survive navigation ONLY if
   mounted always-rendered/display-toggled) is [READING], enforced at the SOURCE
   level by I-W2 and the rewritten snapshot test, and confirmed behaviourally
   only by OW-W2-2.
2. **Whether the three flagged frozen counts (RES-W2-3) actually stay green** -
   the wave-2 gate settles it; I did not open their full subjects.
3. **Whether the owner wants the `ta-rec-view` migration (RES-W2-1)** - a genuine
   fork, but NOT a blocker: wave 2 is correct and shippable either way (skip =
   graceful degradation to Recording > Record; include = exact continuity at the
   cost of adding `useAppNavigation.ts` to the write set). Because every answer
   terminates and neither blocks the wave, this is a residual, not an
   owner-question that stops the activity.

---

## 11. Gates run on this document

**Run:** `npm run docs:gate`. Result in the hand-back report.

**NOT run:** every instrument in sections 4, 6, 7. My write set is one document.
I-W2 and the canary updates do not exist yet and I did not create them; T1-T4 and
the recording-split canaries were re-read at their cited lines but none was
executed against a modified tree. No file under `src/` was opened for writing,
nothing was committed, nothing was pushed. `git status --short` is reported in
the hand-back.
