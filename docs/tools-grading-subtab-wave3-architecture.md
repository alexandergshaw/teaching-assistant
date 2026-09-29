# Wave 3 derivation: Drafted Grades into Tools > Grading

Round 1 of the WAVE-3-DERIVATION activity (row `GRAD-SUBTAB`). This is a NEW
activity with its own two rounds. It closes residual RES-WAVE-2 from
`docs/tools-grading-subtab-waves.md`, which declared wave 3 NOT DISPATCHABLE
because "its write set was NOT derived and feasibility is not established:
absorbing `DraftedGradesTab` crosses `ToolsRailItem`'s `toolsSection`
discriminant ... and may force `WorkflowsPanel`'s own nav to change."

DECISION 18 (inner navigation), DECISION 17 (the incremental run is a fill),
and waves 1 (`f48a4e0`) and 2 (`2d77fbf`) as shipped are NOT reopened.

**Write set: this file only.** No file under `src/` or `supabase/` was opened
for writing. Nothing committed, nothing pushed. `git status --short` at the
start of this pass printed nothing on my account (see the hand-back for the
end-state, which will show a concurrent migration implementer's files - I did
not touch them). HEAD at the start of this pass is `33a08c8` [MEASURED,
`git rev-parse --short HEAD`], which is past wave 2 (`2d77fbf` / `32a0145`).

**The prior docs are stale on line numbers.** Waves 1 and 2 rewrote
`manual-rail.ts`, `page.tsx`, `url-state.ts` and `useAppNavigation.ts`, so every
line the architecture and wave-plan docs cite in those files has moved.
Everything below was re-measured or re-read on `33a08c8`; I cite the prior docs
only for the mechanism (DECISION 18, the INNER_NAV / RETIRED_GRADING_POINTERS /
resolveGradingPointer pattern), never for line numbers.

**Reasoning-from-reading vs measurement.** Claims tagged [MEASURED] name the
command that produced them. Claims tagged [READING] are traced from source and
cannot be verified here because **no component is rendered by any test in this
repo** (`vitest` is node-env, collects only `src/**/*.test.ts`;
`vitest.setup.ts` throws on real `fetch`). Every claim about what a user sees,
what survives a reload, or what a screen reader announces is [READING] and goes
to the owner walk with no proxy proposed.

---

## 0. Instruments, and the command that produced every quantity

| Quantity | Instrument, with the command |
|---|---|
| Line count, counter A | `wc -l < <path>` (Bash) |
| Line count, counter B | `@(Get-Content <path>).Count` (PowerShell) |
| Symbol / value occurrences per file | `grep -rn "<needle>" src --include=*.ts --include=*.tsx`, each hit opened at its `file:line`; **never `grep -c`** (counts prose lines) and **never `grep -P`** (exits 0 without checking here) |
| Source-text readers of a file | `grep -rln "<basename>" src --include=*.test.ts`, each opened and vetted |
| Cited-line reads | `Read` / `sed -n` at the cited lines, on `33a08c8` |
| Docs gate | `npm run docs:gate` |

Disciplines carried from this repo's recorded failures: every quantity was
re-measured on `33a08c8`, not recalled from the prior docs; both line counters
were run on every file whose size is load-bearing and they agree (section 1);
every absence claim below was paired with a positive control in the same grep.

---

## 1. Sizes, both counters, on `33a08c8`

`wc -l` [MEASURED, Bash] and `@(Get-Content).Count` [MEASURED, PowerShell] agree
on every file:

| Path | `wc -l` | `@(Get-Content).Count` | Agree | Role in wave 3 |
|---|---|---|---|---|
| `src/app/components/manual/manual-rail.ts` | 338 | 338 | yes | WRITTEN (grows ~6 lines) |
| `src/app/url-state.ts` | 462 | 462 | yes | WRITTEN |
| `src/app/components/home/useAppNavigation.ts` | 717 | 717 | yes | WRITTEN (grows a few; 283 under ceiling) |
| `src/app/page.tsx` | 769 | 769 | yes | WRITTEN (grows ~10-20; 231 under ceiling) |
| `src/app/components/home/WorkflowsPanel.tsx` | 83 | 83 | yes | WRITTEN (SHRINKS) |
| `src/app/components/DraftedGradesTab.tsx` | 898 | 898 | yes | **NOT written** (mount relocated, file untouched - section 3.4) |
| `src/app/components/tabs/tab-rails.ts` | 192 | 192 | yes | **NOT written** (section 2.3) |
| `src/app/components/tabs/tab-sections.ts` | 191 | 191 | yes | **NOT written** (section 2.3) |

**No wave-3 file is a ceiling risk.** The only mechanical ceiling is
`const LIMIT = 1000` (`src/file-size-ceiling.structure.test.ts:41` [READING,
adopted from wave 1]). The largest file wave 3 writes is `page.tsx` at 769, and
its net movement is small (it gains a render branch and a badge line, and does
not gain a component definition - `DraftedGradesTab.tsx` is not opened).
`WorkflowsPanel.tsx` SHRINKS (its Grades/Messages tablist is removed).

---

## 2. THE FEASIBILITY VERDICT: FEASIBLE, and the crossing is the whole cost

> **Drafted Grades CAN be re-parented into the Tools > Grading inner nav.
> `DraftedGradesTab` takes exactly one prop (`onOpenWorkflow`), holds NO live
> capture resource, and consumes only app-root React contexts - so it moves as
> a plain CONDITIONAL MOUNT, unlike wave 2's capture panels. The real cost is
> not the mount; it is the `toolsSection` CROSSING. Drafted Grades sits two
> levels deep in the `workflows` family (`toolsSection==="workflows"` ->
> `workflowsView==="drafts"` -> `draftsView==="grades"`); its new home is in the
> `manual` family (`toolsSection==="manual"` -> `manualView==="grading"` ->
> `gradingView==="drafts"`). This forces THREE things waves 1-2 never touched:
> (a) `WorkflowsPanel`'s own Grades/Messages subnav must change, because
> removing "grades" from a two-member subnav leaves it degenerate; (b) the
> retired-pointer machinery must gain a `toolsSection` dimension, because for the
> first time a retired grading pointer originates OUTSIDE `toolsSection==="manual"`;
> and (c) the badge that currently sits on the "Grades" subnav button must be
> relocated. Each is derived below. None is a blocker; (b) concentrates the
> risk, at the exact seam (the initial-load initializers) that was wave 1's
> shipped blocker.**

### 2.1 How Drafted Grades is reached today [MEASURED]

Not from the survey's say-so - traced in the tree on `33a08c8`:

- **Mount:** `WorkflowsPanel.tsx:77` -
  `{draftsView === "grades" && <DraftedGradesTab onOpenWorkflow={onOpenWorkflow} />}`,
  inside `{workflowsView === "drafts" && (...)}` (`:46`). `WorkflowsPanel` is the
  SOLE mount of `DraftedGradesTab` in production [MEASURED,
  `grep -rn "DraftedGradesTab" src --include=*.tsx` returns the import at
  `WorkflowsPanel.tsx:5` and the one JSX use at `:77`; the only other
  production hit is `page.tsx`'s `useDraftedGradesInbox` chain, which is the
  count hook, not the tab].
- **The chain of discriminants** [MEASURED, `page.tsx:637`]:
  `{toolsSection === "workflows" && <WorkflowsPanel ... />}`. So the full path is
  `activeTab==="manual"` (Tools tab) -> `toolsSection==="workflows"` ->
  `workflowsView==="drafts"` -> `draftsView==="grades"`.
- **The governing `toolsSection` discriminant:** `ToolsSection = "manual" |
  "workflows"` (`tab-sections.ts:66`). `DraftsView = "grades" | "messages"`
  (`url-state.ts:86`) is a level BELOW the flattened Tools rail - it is the
  innermost nav, the Grades/Messages tablist inside the Drafts view
  (`WorkflowsPanel.tsx:49-74`), NOT a rail chip. `TOOLS_RAIL_ITEMS`
  (`tab-rails.ts:132-149`) enumerates `manual:${ManualViewType}` and
  `workflows:${WorkflowsView}`; there is no rail chip for `draftsView` at all.

**This is the crossing named in RES-WAVE-2, confirmed in the tree.** Waves 1-2
moved views WITHIN the `manual` family (LMS rail members, Recording strip
members). Wave 3 is the only one that pulls a view ACROSS `ToolsSection`, from
`workflows` to `manual`.

### 2.2 Q2 - Is `DraftedGradesTab` a live resource? NO. Conditional mount. [READING/MEASURED]

- **Props:** `export default function DraftedGradesTab({ onOpenWorkflow })`
  [MEASURED, `WorkflowsPanel.tsx:77` passes only `onOpenWorkflow`; the component
  header at `DraftedGradesTab.tsx:1-60` imports show no other prop threaded].
- **No live capture:** [MEASURED]
  `grep -n "getUserMedia\|MediaRecorder\|MediaStream\|WebSocket\|EventSource\|addEventListener\|setInterval"
  src/app/components/DraftedGradesTab.tsx` returns EMPTY. It uses only
  `useEffect`/`useState` (`DraftedGradesTab.tsx:3`) plus data hooks. Contrast
  wave 2's panels, whose own headers declared a live `MediaStream` /
  `RECORDING_LAUNCH_EVENT` listener requiring an always-mounted host.
- **Contexts are app-root, not RecordingTab-scoped:** it consumes
  `useSupabase()` (`DraftedGradesTab.tsx:6`, from `@/context/SupabaseProvider`)
  and `useDraftedGradesInbox()` (`:16`). The latter is a React CONTEXT
  (`DraftedGradesInbox.tsx`: `createContext` + `DraftedGradesInboxProvider`
  [MEASURED, `sed -n '1,40p'`]). Both providers are mounted above the whole tab
  tree, so moving the mount from `WorkflowsPanel` to `page.tsx` (which is inside
  the same providers - it renders `WorkflowsPanel` today) orphans nothing.

**Conclusion [READING]:** `DraftedGradesTab` moves as a plain conditional mount.
It does NOT need wave 2's always-mounted, display-toggled sibling treatment, and
it MUST NOT be given it (an always-mounted DraftedGradesTab would run its data
effects behind every other tab for no benefit). The
`topLevelTabs.wiring.test.ts` I-W2 guard for the two capture panels
(`:516-564`) [MEASURED] targets `<GradingRecordingPanel`/`<SnapshotGradingPanel`
by name only, so it neither requires nor forbids anything about
`DraftedGradesTab` - it stays green and untouched.

### 2.3 `tab-rails.ts` and `tab-sections.ts` need NO edit - verified

- `ToolsSection` stays `"manual" | "workflows"` (`tab-sections.ts:66`). Grading
  is a `manual`-family view; Drafted Grades becomes a `gradingView` under it, NOT
  a new section. So no `ToolsSection` member is added or removed.
- `TOOLS_RAIL_ITEMS` (`tab-rails.ts:132-149`) is derived from
  `MANUAL_VIEW_ORDER` and `WORKFLOWS_VIEW_ORDER`. Wave 3 changes NEITHER order
  list: `"grading"` is already in `MANUAL_VIEW_ORDER` (`manual-rail.ts:135-143`),
  and `"drafts"` stays in `WORKFLOWS_VIEW_ORDER` (`tab-sections.ts:109`) because
  the Drafts view survives (it renders Message Drafts). So the Tools rail's chip
  set is UNCHANGED. `ToolsRailItem` / `toolsStateFromRailItem` widen over no new
  member. **Neither file is in the write set.**

This is the key relief on the feasibility fear: the crossing does NOT require
editing the discriminant type or the rail derivation. It requires editing the
RESOLUTION of that discriminant on the read paths (section 3.3) and the
degenerate leftover subnav (section 3.2).

### 2.4 Q4 - Does `GradingView` need a fifth member? YES, and it flows through

Following the wave-2 pattern exactly. `GradingView = "run" | "repos" |
"recording" | "snapshots"` (`manual-rail.ts:33`) gains a fifth member. The
wave-2 architecture proved the mechanism auto-covers a new member with no
hardcoded value list to edit: `GRADING_VIEWS = Object.keys(GRADING_VIEW_PRESENCE)`
(`manual-rail.ts:36`), and the derived guard
`manual-rail.test.ts:322-333` iterates `GRADING_VIEWS`, forcing the resolver
branch (section 4.2). `url-state.ts` derives everything from `isGradingView` /
`GRADING_VIEWS` with NO value list [MEASURED,
`grep -n "grading" src/app/url-state.ts`: `normalizeGradingView` at `:349`-area
derives from `isGradingView`; `GRADING_VIEW_PARAM` at the params block;
`buildUrlSearch` emits it via `state.gradingView !== DEFAULT_GRADING_VIEW`
(`:434`)]. So the member addition ripples through url-state and
useAppNavigation's `gradingView` plumbing WITHOUT edits there for the member
itself. `getActiveDestinationId` needs NO edit - its grading branch is already
the generic `` `grading-${gradingView}` `` (`manual-rail.ts:227`).

**Recommended member string and label (my call, RES-W3-1):** `GradingView`
gains `"drafts"`; destination `grading-drafts`, label "Drafted Grades",
description matching today's surface. Collision check [MEASURED,
`grep -rn '"grading-drafts"' src` returns 0 files] - the id is free.
`getDestinationById` is a flat id search (`manual-rail.ts:113-119`), so a free
id is what matters. The member string and label are a UX/wording call; the
DERIVATION depends only on the id being `` `grading-${member}` `` and free.

---

## 3. THE DERIVED WAVE-3 WRITE SET

### 3.0 Q1 - the intended end state, and the ONE genuine fork

**End state (recommended):** Drafted Grades is reachable ONLY at
Tools > Grading > Drafted Grades (`toolsSection==="manual"`,
`manualView==="grading"`, `gradingView==="drafts"`). It is MOVED, not mirrored,
per DECISION 18 ("The surfaces MOVE into it; they are not mirrored from it"). The
Workflows > Drafts view no longer offers a Grades sub-view; it shows Message
Drafts. An old pointer at Drafts > Grades redirects to the new home (section
3.3).

**The fork the derivation surfaces (RES-W3-FORK), stated so every answer
terminates.** Removing "grades" from the two-member `DraftsView` leaves the
Grades/Messages tablist degenerate (one item). Two clean dispositions:

- **(E-full) Retire `draftsView` entirely.** `WorkflowsPanel`'s
  `workflowsView==="drafts"` renders `<MessageDraftsTab>` directly, no tablist;
  the `DraftsView` type, `DRAFTS_VIEW_PARAM`, `DRAFTS_VIEW_KEY`, the
  `useAppNavigation` state, its popstate branch and the `buildUrlSearch` drafts
  branch are deleted. Cleanest end state, matches the repo's stated aversion to
  "a registration describing a screen that no longer exists"
  (`tab-sections.ts:82-84`). Largest test churn (many `draftsView` fixtures).
- **(E-min) Keep `draftsView` as a dormant single member `"messages"`.** Remove
  only the Grades button/render and the tablist; render `<MessageDraftsTab>`
  directly. `DraftsView = "messages"`, `normalizeDraftsView` default becomes
  `"messages"`. Smaller diff, but leaves a one-member union that is never
  switched - the vestige the repo dislikes.

**I recommend E-full.** It is the faithful end state and the retirement is
tsc-guided. BUT the choice touches the MESSAGE-drafts nav, which is not itself a
grading surface, so it is a legitimate owner call, not a pure derivation. Both
ship Drafted Grades in Tools > Grading with old pointers redirected; the retired
pointer (3.3) is identical under either. **If the round-2 check disputes the
disposition, this is the terminating owner question - "retire `draftsView`
entirely, or keep it as a dormant `messages`-only value?" - not a third round.**
The write set below is written for E-full and notes at each point what E-min
omits.

### 3.1 Production write set - the "move IN" half

| # | Path | Edit points | Forced by |
|---|---|---|---|
| P1 | `src/app/components/manual/manual-rail.ts` | (i) `GradingView` (`:33`): add `"drafts"`. (ii) `GRADING_VIEW_PRESENCE` (`:35`): add `drafts: true`. (iii) `destinations` "Grading" group (`:102-110`): add `{ id: "grading-drafts", label: "Drafted Grades", description: "..." }`. (iv) `resolveStateFromDestinationId` gradingView IIFE (`:307-313`): add `if (id === "grading-drafts") return "drafts";`. (v) `RETIRED_GRADING_POINTERS` (`:244-255`): add the drafts-grades entry (section 3.3). (vi) `GradingPointerTarget` (`:236-239`): add a `toolsSection` dimension OR a companion, so a pointer can express "land in the manual family" (section 3.3). | (ii) **tsc** (`Record<GradingView, true>` missing property); (iii) **CANARY** at `manual-rail.test.ts:238`/`:377`; (iv) **derived GUARD** at `manual-rail.test.ts:322-333`; (v)(vi) design + the retired-pointer instrument (section 4). `getActiveDestinationId` needs NO edit. |
| P4a | `src/app/page.tsx` | (i) import `DraftedGradesTab`. (ii) add a SEPARATE conditional sibling of the run/repos block: `{manualView === "grading" && gradingView === "drafts" && <DraftedGradesTab onOpenWorkflow={openWorkflow} />}` - NOT inside the run/repos `<TabShell>` (DraftedGradesTab self-wraps its own `<TabShell>`, `DraftedGradesTab.tsx:421`), NOT an always-mounted sibling (section 2.2). `openWorkflow` is in scope (`page.tsx:632` passes it to WorkflowsPanel). (iii) add a `refreshDrafts()` trigger for the new location, mirroring the existing effect (`page.tsx:219-224`) that refreshes on `workflowsView === "drafts"`. | (ii) [READING] correctness + the new mount instrument (I-drafts-mount, section 4); (iii) [READING] badge freshness. The run/repos ternary guard (`:594`) needs NO edit - `"drafts"` is neither run nor repos, so it is already excluded, and the R-1 guard (`topLevelTabs.wiring.test.ts:572-585`) stays green. |

### 3.2 Production write set - the "remove OUT + collapse" half

| # | Path | Edit points | Forced by |
|---|---|---|---|
| P5 | `src/app/components/home/WorkflowsPanel.tsx` | (i) remove the `import DraftedGradesTab` (`:5`). (ii) remove the Grades/Messages tablist (`:48-75`) and render `<MessageDraftsTab onOpenWorkflow={onOpenWorkflow} />` directly for `workflowsView === "drafts"`. (iii) props: drop `draftsView`, `onDraftsViewChange`, `draftsGradesCount` (E-full also drops the `DraftsView` type import); `draftsMessagesCount` is no longer badged on a button - see the badge decision (section 3.5). | (ii)/(iii) **CANARY** at `topLevelTabs.wiring.test.ts:316` (tablist count 1 -> 0) and the "leaving only the Drafts subnav" `it` at `:308`; **tsc** once WorkflowsPanel's prop type drops the fields and page.tsx stops passing them. The derived guard `topLevelTabs.wiring.test.ts:343-352` (every `WORKFLOWS_VIEW_ORDER` member has a `workflowsView === "<view>"` branch) STAYS GREEN because the `workflowsView === "drafts"` branch remains - GUARD, do not remove that branch. |
| P4b | `src/app/page.tsx` | (i) the `<WorkflowsPanel>` mount (`:621-632`): drop `draftsView`, `onDraftsViewChange`, `draftsGradesCount` props. (ii) the `MESSAGE_DRAFTS_NAV_EVENT` listener (`:208-217`): under E-full, remove `setDraftsView("messages")` (the launch just sets `workflowsView="drafts"`); under E-min, keep it. (iii) `nav` destructure (`:75`): drop `draftsView, setDraftsView` under E-full. (iv) the Tools-rail badge accounting (`:333-336`) - section 3.5. | (i)(iii) **tsc** once WorkflowsPanel/useAppNavigation drop the fields; (ii) follows E-full; (iv) [READING] badge correctness. |
| P2 | `src/app/url-state.ts` | (i) `resolveGradingPointer` (`:349-359`): extend to recognise the drafts-grades shape (section 3.3) - add `rawWorkflowsView`, `rawDraftsView` params. (ii) `parseUrlState` (`:361-393`): pass the two new raw params to `resolveGradingPointer`, and apply the pointer to `toolsSection` (`:381`) so a resolved grading pointer forces `toolsSection: "manual"`. (iii) `DraftsView` (`:86`) + `normalizeDraftsView`/`isDraftsView`/`DRAFTS_VIEW_VALUES` (`:225-232`) + `DEFAULT_DRAFTS_VIEW` (`:273`) + `DRAFTS_VIEW_PARAM` (`:297`) + the `UrlNavState.draftsView` field (`:316`) + `parseUrlState`'s `draftsView` line (`:388`) + `buildUrlSearch`'s drafts branch (`:438-443`): under E-full, delete `draftsView` throughout; under E-min, drop `"grades"` and flip the default to `"messages"`. | (i)(ii) design + the retired-pointer instrument; (iii) **tsc** cascade from the `DraftsView` change. |
| P3 | `src/app/components/home/useAppNavigation.ts` | (i) the three `resolveGradingPointer(urlParams.get("manualView"), urlParams.get("contentView"))` call sites (`:196` manualView initializer, `:352` gradingView initializer, and via `parseUrlState` on the popstate path) gain the two new raw params. (ii) the `toolsSection` initializer must honour a resolved grading pointer -> force `"manual"` (so the manualView/gradingView URL branches, gated on `toolsSection === "manual"` at `:186`/`:344`, actually run for a drafts-grades URL). (iii) the localStorage migration branches: the manualView initializer (`:200-227`) and gradingView initializer (`:356-361`) gain a stored-drafts-grades migration (a stored `ta-tools-section=workflows` + `ta-workflows-view=drafts` + `ta-drafts-view=grades` -> grading/drafts) OR route it through the shared pointer helper. (iv) `draftsView` state (`:304-318`), its persist effect (`:474`), its popstate branch (`:663`), and its return-object entries (`:558`, `:595`, `:703-704`): under E-full, delete; `DRAFTS_VIEW_KEY` (`:57`) deleted. | (i) **tsc** (signature change ripples to all callers); (ii)(iii) the retired-pointer crossing (this is the risk seat - section 3.3); (iv) **tsc** cascade from the `DraftsView` change and the WorkflowsPanel prop drop. |

**The caller rule, discharged.** The file that MOUNTS `DraftedGradesTab` at its
new home is `page.tsx` (P4a), and it is in the write set. The file that STOPS
mounting it is `WorkflowsPanel.tsx` (P5), also in the write set. `DraftedGradesTab`
ships live at its new home, and dead at its old one, by construction - not by a
green gate over an unreached surface (MEMORY: verify-reachability-not-just-correctness).

### 3.3 THE RETIRED-POINTER TREATMENT, all read paths (Q3 + the old entry's fate)

This is the crossing's hardest part and the seat that was wave 1's shipped
blocker (the initial-load path). What a returning user carries when they last
sat on Drafts > Grades:

- **URL (canonical):** `?tab=manual&toolsSection=workflows&workflowsView=drafts&draftsView=grades`.
- **URL (legacy):** `?tab=workflows&workflowsView=drafts&draftsView=grades` (`tab=workflows`
  is already a RETIRED_TAB_VALUE -> `manual`/`workflows`, `tab-sections.ts:172-177`).
- **localStorage:** `ta-tools-section=workflows` + `ta-workflows-view=drafts` +
  `ta-drafts-view=grades` [MEASURED, `DRAFTS_VIEW_KEY = "ta-drafts-view"`,
  `useAppNavigation.ts:57`].

**The identifying signal is the pair `(workflowsView==="drafts",
draftsView==="grades")`.** Unlike every wave-1 pointer, it is NOT keyed on a
`manualView` or `contentView` value, and its SOURCE is `toolsSection==="workflows"`
while its TARGET is `toolsSection==="manual"`. Two facts follow:

1. **`resolveGradingPointer` must see the new params.** Today it takes
   `(rawManualView, rawContentView)` (`url-state.ts:349-352`). Extend it to
   `(rawManualView, rawContentView, rawWorkflowsView, rawDraftsView)` and add a
   lookup: when `rawWorkflowsView === "drafts" && rawDraftsView === "grades"`,
   return the drafts-grades target. Keep it ONE helper (the repo's
   no-drift rule, `url-state.ts:343-348`); all three read paths call it.
2. **The pointer must now carry / force `toolsSection`.** `GradingPointerTarget`
   is `{ manualView, gradingView }` (`manual-rail.ts:236-239`) - no
   `toolsSection`, because every wave-1 pointer already originated in
   `toolsSection==="manual"`. Add `toolsSection: "manual"` to the target (or make
   the read paths force `toolsSection: "manual"` whenever a grading pointer
   resolves). Then:
   - `parseUrlState` (`url-state.ts:381`): `toolsSection: gradingPointer ?
     "manual" : (isToolsSection(rawToolsSection) ? rawToolsSection :
     destination.toolsSection)`.
   - `useAppNavigation` `toolsSection` initializer: same override, so the
     downstream manualView/gradingView URL branches (gated on
     `toolsSection === "manual"`, `:186`/`:344`) actually fire.

Three read paths, all in the write set (the wave-1 blocker was that the
initial-load path bypassed the alias resolution that the popstate path had):

| Read path | Where | What it must do |
|---|---|---|
| popstate / Back-Forward + first-load URL parse | `parseUrlState` (`url-state.ts:377`, `:381`, `:383`, `:387`) | pass the new params; force `toolsSection:"manual"`; the existing `manualView`/`gradingView` override already applies |
| initial-load, manualView | `useAppNavigation.ts:196` (URL) + `:200-227` (localStorage) | URL branch runs once `toolsSection` is forced manual; add a stored-drafts-grades localStorage migration |
| initial-load, gradingView | `useAppNavigation.ts:352` (URL) + `:356-361` (localStorage) | same; a resolved pointer names `gradingView: "drafts"` |

The retired-pointer entry (P1(v)):

```ts
// Drafts > Grades (workflowsView=drafts + draftsView=grades) is now
// Tools > Grading > Drafted Grades - and it crosses toolsSection, so the
// target must carry it.
"drafts-view:grades": { toolsSection: "manual", manualView: "grading", gradingView: "drafts" },
```

**An alias is a REDIRECT, not a synonym** (`tab-sections.ts:157-160`): the
first URL sync rewrites the address bar to the canonical
`?tab=manual&manualView=grading&gradingView=drafts` shape. This is already true
of wave 1's pointers via `buildUrlSearch`; the drafts-grades pointer converges
the same way once `toolsSection`/`manualView`/`gradingView` are set to the target.

**Is the treatment needed? YES.** Without it, a stored `ta-drafts-view=grades`
would (E-full) have no matching value or (E-min) normalize to `"messages"`,
landing the user on Drafts > Messages - a silent wrong landing, the exact class
`RETIRED_GRADING_POINTERS` exists to prevent. `resolveGradingPointer` reads the
RAW string, so it still detects `"grades"` even after `"grades"` leaves the
`DraftsView` type.

### 3.4 What needs NO edit - verified, not assumed

- **`DraftedGradesTab.tsx`** - the mount relocates; the file is not opened. Its
  props (`{ onOpenWorkflow }`) and its own `ta-drafts-collapsed`/`-course`/
  `-search`/`-sort` keys are unchanged, so `componentStorageKeys.structure.test.ts:144-147`
  [MEASURED] stays green. This is the wave-1 precedent (GradingTab moved by
  relocating its caller, its file untouched).
- **`tab-rails.ts` / `tab-sections.ts`** - section 2.3.
- **`src/lib/drafts-nav.ts`** - targets Messages only (`openMessageDrafts` sets
  `workflowsView=drafts`, `draftsView=messages` [MEASURED, `drafts-nav.ts:37-38`,
  `page.tsx:211`]). No grades launch exists. Under E-full, `page.tsx`'s listener
  drops the `setDraftsView` line, but `drafts-nav.ts` itself is unchanged. **NOT
  in the write set.**
- **`getActiveDestinationId`, `getInnerNavAriaLabel`, the `INNER_NAV` table** -
  the Grading group's `ariaLabel` stays "Grading tools" (`manual-rail.ts:178`);
  adding a destination to the group does not change it. **The "Grading tools"
  accessible name is NOT regressed** (a wave-3 constraint), verified: no edit
  touches `INNER_NAV`.

### 3.5 Q3 continued - the badge (a real consequence, not a launch/deep-link)

`draftsGradesCount` currently badges the "Grades" subnav button
(`WorkflowsPanel.tsx:59`); `draftsMessagesCount` badges the "Messages" button
(`:71`). Removing the tablist removes BOTH in-panel badges. The counts come from
`useDraftedGradesInbox()` at `page.tsx:69` (independent of the tab's mount), and
the Tools RAIL supports a per-chip count (`page.tsx:333-336`: the Drafts chip
carries `draftsInbox`). So the badge relocation is mechanical:

- The **Grading** rail chip (`manualRailItemId("grading")`) should carry
  `draftsGradesCount` (reusing the `:333-336` count mechanism the Drafts chip
  uses).
- The **Drafts** rail chip's count (`:336`, currently `draftsInbox` =
  grades+messages) should become `draftsMessagesCount` only, since grading drafts
  no longer live under Drafts.
- The top-level "Tools" tab badge (`page.tsx:447`, `draftsInbox`) can stay
  grades+messages - both are still Tools work.

**The exact rendering (which chip, whether the inner "Drafted Grades" item also
badges) is a UX call - RES-W3-2, owned by the wave-3 UX seat.** I default the
above (badge the Grading chip with the grades count) so the wave is dispatchable;
the inner-nav destination renderer has no badge support today, so badging the
inner item would be new nav-rendering work the UX seat should scope.

Nothing ELSE reaches Drafts > Grades [MEASURED]: `setDraftsView` calls are
`page.tsx:211` (messages), `page.tsx:624` (the `onDraftsViewChange` prop), and
`WorkflowsPanel.tsx:55`/`:67` (the two buttons). The only "navigate to grades"
affordance is the Grades button itself, which this wave removes. No launch
handler, deep link, or stored view id points at grades specifically.

### 3.6 The `owns` list (source-text readers, run-in-gate but not all written)

A test that reads a wave-3-edited file AS SOURCE TEXT can go red on a change it
does not import. Instrument: `grep -rln "<basename>" src --include=*.test.ts`,
each opened [MEASURED, section 0]. Readers of the FIVE written production files:

```
WorkflowsPanel.tsx:  topLevelTabs.wiring.test.ts (WRITTEN, T4)
page.tsx:            action-guard-coverage.test.ts, manual-rail.test.ts,
                     repoGradesSliceA.guards.test.ts, snapshot-grading.structure.test.ts,
                     topLevelTabs.wiring.test.ts (WRITTEN), canvas-credentials.exports.test.ts,
                     drafts-nav.test.ts, knowledge-return.test.ts,
                     runtime-import-graph.test.ts, visualizer.test.ts
url-state.ts:        tab-sections.test.ts   (plus url-state.test.ts by symbol - WRITTEN, T2)
useAppNavigation.ts: useAppNavigation.test.ts (WRITTEN, T5), manual-rail.test.ts,
                     topLevelTabs.wiring.test.ts (WRITTEN)
manual-rail.ts:      announcements-panel.wiring.test.ts, contentTab.wiring.test.ts,
                     useAppNavigation.test.ts (WRITTEN), manual-rail.test.ts (WRITTEN, T1),
                     snapshot-grading.structure.test.ts, topLevelTabs.wiring.test.ts (WRITTEN)
```

Also `DraftedGradesTab.tsx` source-text readers (must stay GREEN - the file is
NOT edited, only its mount relocates): `classTrends.wiring.test.ts`,
`classTrendsDraft.not-postable.test.ts`, `rubricBreakdownPercent.wiring.test.ts`,
`canvas/grades.test.ts` [MEASURED]. And the CSS-orphan pair (section 4.6).

**Readers that name a file as a PATH, not content, are unaffected** because wave
3 moves NO files: `runtime-import-graph.test.ts`, `action-guard-coverage.test.ts`
build paths and import graphs; `WorkflowsPanel`/`DraftedGradesTab` keep their
locations. Confirmed by the wave-1/wave-2 precedent (same class ruled out there).

---

## 4. THE ASSERTING-TEST SET, per-test CANARY-OR-GUARD, and the instruments

CANARY = freezes a fact the change legitimately alters (update it, in the write
set of the wave that reddens it). GUARD = tells you the design is wrong (if it
reddens, change the design).

### 4.1 manual-rail.test.ts (T1)

| Test / line | Assertion [MEASURED] | Call |
|---|---|---|
| `:238-245` `getInnerDestinations("grading")` ids | 4 ids | **CANARY** - add `"grading-drafts"` (5 ids) |
| `:377-390` grading subtab: ids AND labels exact-list | 4 ids / 4 labels | **CANARY** - add `"grading-drafts"` / "Drafted Grades" |
| `:322-333` derived guard over `GRADING_VIEWS` (resolve + round-trip) | iterates `GRADING_VIEWS` | **GUARD (derived)** - do NOT touch; auto-covers `"drafts"` and goes RED if the P1(iv) resolver branch is omitted (5th arg is `"run"`, so a member with no branch falls back to `"run" != "drafts"` -> RED) |
| `:252-256` `getInnerDestinations` null for single-view subtabs | version-control/recording/ppt-design | **GUARD** - unaffected |

### 4.2 The derived resolver GUARD is the caller-rule enforcer for P1(iv)

`manual-rail.test.ts:322-333` is green today and reddens on exactly the omitted
resolver branch. It is why P1(iv) is non-silent. **Do NOT write a second one.**

### 4.3 url-state.test.ts (T2) and useAppNavigation.test.ts (T5)

Many `draftsView` fixtures reddened by the `DraftsView` change - all CANARY:
- `url-state.test.ts:43` `DEFAULT_STATE.draftsView: "grades"`; `:321-331`
  `normalizeDraftsView`/`isDraftsView` (`"grades"`->`"grades"`, `null`->`"grades"`);
  `:469-479`, `:684-712`, `:772`, `:803-823` parse/build `draftsView` cases
  [MEASURED, `grep -n "draftsView\|DraftsView"`]. Under E-full these are DELETED
  or rewritten; under E-min they change `"grades"`->`"messages"` defaults.
- **NEW instrument I-retired-drafts (T2, url-state.test.ts):** a URL/parse of
  `?tab=manual&toolsSection=workflows&workflowsView=drafts&draftsView=grades`
  resolves to `{ toolsSection:"manual", manualView:"grading", gradingView:"drafts" }`,
  and `buildUrlSearch` of that state emits the canonical
  `?tab=manual&manualView=grading&gradingView=drafts` (the redirect). Modelled on
  the existing wave-1 retired-pointer round trips.
- **useAppNavigation.test.ts (T5):** `resolveGradingPointer` unit tests
  (`:262-270` [MEASURED]) gain the drafts-grades case; the wiring assertions
  (`:273-319`) that pin the initializers' `resolveGradingPointer(...)` call shape
  gain the two new raw args (CANARY - the source-text regex at `:297`/`:319`
  must be updated to the new signature).

### 4.4 tab-rails.test.ts (T3)

- `:280` `DEFAULT_STATE.draftsView: "grades"` - **CANARY** (tsc-forced by the
  `DraftsView` change; E-full deletes the field).
- `:288-301` + `:336` `EXPECTED_PARAM_NAMES` frozen oracle over emitted params:
  under E-full, `"draftsView"` LEAVES the emitted set, so it must leave
  `EXPECTED_PARAM_NAMES` too (CANARY, both sides move together, or `:336` reddens);
  under E-min it stays. This is the wave-1 B6.2 accounting shape - a driving
  state added/removed must match the frozen list.

### 4.5 topLevelTabs.wiring.test.ts (T4)

| Test / line | Assertion [MEASURED] | Call |
|---|---|---|
| `:308-317` "leaving only the Drafts subnav": `WorkflowsPanel` has exactly one `role="tablist"` (`:316` `toBe(1)`) and no `onWorkflowsViewChange` | 1 tablist | **CANARY** - `toBe(0)` once the Grades/Messages tablist is removed; the `it` title becomes stale ("no subnav") |
| `:343-352` every `WORKFLOWS_VIEW_ORDER` member has a `workflowsView === "<view>"` branch in WorkflowsPanel | derived loop | **GUARD (derived)** - do NOT touch; keep the `workflowsView === "drafts"` branch (it renders MessageDraftsTab) |
| `:330-341` every `MANUAL_VIEW_ORDER` member has a `manualView === "<view>"` branch in page.tsx | derived loop | **GUARD (derived)** - stays green; `"grading"` already has a branch |
| `:516-564` I-W2 always-mounted guard for the two capture panels | names the two panels | **GUARD** - unaffected; DraftedGradesTab is not named |
| `:572-585` R-1: grading branch renders GradingTab/RepoGradesTab ONLY for run/repos | regex `gradingView === "run" ... "repos"` | **GUARD** - stays green because the drafts mount is a SEPARATE conditional, not added to the run/repos clause. Do NOT add `"drafts"` to that clause. |
| **NEW instrument I-drafts-mount (T4)** | page.tsx renders `<DraftedGradesTab` for `gradingView === "drafts"` | new source-text assertion |

### 4.6 The instruments an implementer must build (each with direction + mutation)

| id | Instrument | Object | Direction of failure | Named mutation that reddens it |
|---|---|---|---|---|
| I-inner (update T1) | `getInnerDestinations("grading")` exact 5-id/label list (`manual-rail.test.ts:238`/`:377`) | the destinations array | RED when the Grading group is not exactly 5 ids/labels | omit the `grading-drafts` destination -> RED |
| I-resolve (existing GUARD, 4.2) | derived `GRADING_VIEWS` loop (`manual-rail.test.ts:322-333`) | resolver + getActiveDestinationId | RED when a member has no resolver branch | omit the `id === "grading-drafts"` resolver branch -> RED (falls back to `"run"`) |
| I-drafts-mount (NEW, T4) | page.tsx source: a `gradingView === "drafts"` conditional mounting `<DraftedGradesTab` | `page.tsx` source | RED when the drafts mount is missing (blank pane on the Drafted Grades chip) | delete the page.tsx drafts conditional -> RED |
| I-no-mirror (NEW, T4) | WorkflowsPanel source: no `<DraftedGradesTab` and no `draftsView === "grades"` render | `WorkflowsPanel.tsx` source | RED when the old mount survives (DECISION 18 mirroring) | leave the Grades render in WorkflowsPanel -> RED |
| I-retired-drafts (NEW, T2) | parse+build round trip for `draftsView=grades` across all three read paths | url-state + useAppNavigation | RED when the pointer is not applied or `toolsSection` is not flipped to `"manual"` | remove the `"drafts-view:grades"` RETIRED_GRADING_POINTERS entry, or fail to force `toolsSection:"manual"` -> RED (a returning user lands on Drafts > Messages) |
| I-tablist (canary, T4) | `WorkflowsPanel` tablist count (`topLevelTabs.wiring.test.ts:316`) | WorkflowsPanel source | RED (1 vs 0) until the count canary is updated | (canary; its update lands in the write set) |

All are structure / source-text / pure-function instruments - none renders a
component. Each is green today (or after its canary update) and reddens on
exactly its named mutation.

**Counts to VERIFY in the gate (flagged, not guessed) - RES-W3-3.** The
CSS-class pair `page-module-css-classes.test.ts` / `page-module-css-orphan-classes.test.ts`
reads `page.tsx`/`WorkflowsPanel` for CSS-class usage. Removing the
Grades/Messages tablist drops uses of `lessonInnerTab`, `lessonInnerTabActive`,
`manualSubnav`, `tabLabelWrap`, `navBadge` from WorkflowsPanel. Those classes are
used ELSEWHERE too (`page-module-css-classes.test.ts:189` notes TasksTab uses
`lessonInnerTab`), so they likely do not become orphans - but a class that
becomes unused would redden the orphan test. **The wave-3 gate MUST run both,
and a red there is a canary-or-guard call, not a wave-3 bug on sight.**

---

## 5. ONE WAVE or CUT?

**Recommend ONE wave.** The edits are tsc- and canary-coupled across the two
halves: adding `"drafts"` to `GradingView` forces the derived guard and the
resolver branch and the page.tsx render; removing `"grades"` from `DraftsView`
tsc-forces WorkflowsPanel, url-state and useAppNavigation; the two halves share
`page.tsx` and `manual-rail.ts`'s `RETIRED_GRADING_POINTERS`/`GradingPointerTarget`.
No proper subset delivers a coherent state that also satisfies DECISION 18
("moved, not mirrored").

**A 3a/3b cut is available as a risk-isolation option, and its intermediate
compiles:**
- **3a (move IN + retired pointer):** add `gradingView="drafts"`, its
  destination, resolver, page.tsx mount, and the drafts-grades retired pointer
  (with the `toolsSection` crossing). End of 3a: Drafted Grades reachable at
  Tools > Grading AND still at Drafts > Grades (temporarily MIRRORED), old
  pointers redirect. Gateable, pushable - but a mirrored intermediate, which is
  a transient tension with DECISION 18 (acceptable only if 3b follows in the
  same group).
- **3b (remove OUT + collapse subnav + badge):** remove the Grades sub-view,
  collapse the Drafts subnav (E-full or E-min), relocate the badge.

The risky part - the `toolsSection`-crossing retired pointer at the initial-load
seat - is entirely in 3a, so the cut concentrates the risk in the smaller,
earlier wave if the owner prefers to land the crossing first and clean up
second. **I recommend one wave; the 3a/3b split is a risk-isolation option, not
a requirement** (mirroring wave 2's stance).

**No wave writes `GradingTab.tsx`** (the standing GRAD-SUBTAB constraint) - it is
not in any wave-3 edit point, and `git status --short` proves it.

---

## 6. Gate

Run from PowerShell, repo root, after the edits. Every path confirmed present on
`33a08c8` [MEASURED, the reader scan in 3.6 opened each].

```
git status --short
npx tsc --noEmit --incremental false
npm run lint
npm run test:paths -- src/app/components/manual/manual-rail.test.ts src/app/url-state.test.ts src/app/components/home/useAppNavigation.test.ts src/app/components/tabs/topLevelTabs.wiring.test.ts src/app/components/tabs/tab-rails.test.ts src/app/components/tabs/tab-sections.test.ts src/app/components/contentTab.wiring.test.ts src/app/components/canvas-tab/announcements-panel.wiring.test.ts src/app/components/snapshot-grading/snapshot-grading.structure.test.ts src/app/components/componentStorageKeys.structure.test.ts src/lib/client-state-sweep.test.ts src/lib/drafts-nav.test.ts src/lib/knowledge-return.test.ts src/app/components/courses/page-module-css-classes.test.ts src/app/components/courses/page-module-css-orphan-classes.test.ts src/app/components/drafted-grades/classTrends.wiring.test.ts src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts src/app/components/rubricBreakdownPercent.wiring.test.ts src/lib/canvas/grades.test.ts src/lib/module-graph/runtime-import-graph.test.ts
npm test
wc -l <each written production path>   and   @(Get-Content <each>).Count
```

Multi-path runs are `npm run test:paths -- <paths>`, never a raw multi-path
`vitest`/`npm test` (which silently drops unmatched args - enforced by
`src/tools/vitest-paths/gate-commands.structure.test.ts`, MEMORY: test-paths-wrapper).
`npx tsc --noEmit --incremental false` carries the flag because the bare form
races on `tsconfig.tsbuildinfo` under concurrency and has ONE caller.

**Pass conditions, each naming object / instrument / direction:**

| Object | Instrument | Direction of failure |
|---|---|---|
| the write set | `git status --short` vs the P1-P5 + T1-T5 list | RED when any other path appears - specifically RED if `GradingTab.tsx`, `DraftedGradesTab.tsx`, `tab-rails.ts` or `tab-sections.ts` appears (they must NOT be edited) |
| type graph | `npx tsc --noEmit --incremental false` | RED on the tsc-forced edits left undone (P1(ii) presence map; the `DraftsView` cascade in P2/P3/P5; the `resolveGradingPointer` signature ripple) |
| lint | `npm run lint` | RED on a NEW warning in a written file (measured against the same command before the change, never an absolute count); exhaustive-deps RED if P4a(iii)'s refresh effect omits a dep |
| `getInnerDestinations("grading")` | `manual-rail.test.ts` in the `test:paths` run | RED when the Grading group is not exactly 5 ids/labels (I-inner) |
| resolver completeness | derived loop `manual-rail.test.ts:322-333` | RED when a `GRADING_VIEWS` member has no resolver branch (I-resolve) |
| DraftedGrades reachable at the new home / dead at the old | I-drafts-mount + I-no-mirror (`topLevelTabs.wiring.test.ts`) | RED when the page.tsx drafts mount is missing, or the WorkflowsPanel mount survives |
| the retired pointer, all 3 read paths | I-retired-drafts (`url-state.test.ts` + `useAppNavigation.test.ts`) | RED when a `draftsView=grades` pointer does not land on `manual`/`grading`/`drafts` |
| `DraftedGradesTab.tsx` UNTOUCHED | the drafted-grades tests in the gate + `git status --short` | RED (unexpected) if the file changed |
| written file sizes | both counters | RED above 1000; page.tsx ~780-790 after, ~210 under |

`npm run build` is NOT required: no wave-3 production file is a `"use server"`
module ([READING] - `page.tsx`, `WorkflowsPanel.tsx`, `manual-rail.ts`,
`url-state.ts`, `useAppNavigation.ts` are client/leaf modules). Run as
defense-in-depth is fine (pass condition: the `Compiled successfully` line, never
exit 0 - the prerender tail fails with no `.env`).

---

## 7. The owner walk (non-gateable, [READING] / owner)

No component renders here, so the entire visible/runtime half is the owner's
final step. No proxy is proposed.

| id | Item | Owner | Instrument | Step |
|---|---|---|---|---|
| OW-W3-1 | Tools > Grading's inner nav shows a "Drafted Grades" item that renders the drafted-grades surface; the inner tablist's accessible name is still "Grading tools" | repo owner | open the app, Tools > Grading, click Drafted Grades; screen reader on the inner tablist | after wave 3 lands |
| OW-W3-2 | An OLD bookmark / stored pointer at Drafts > Grades lands on Tools > Grading > Drafted Grades, and the address bar rewrites to the canonical shape | repo owner | open `?tab=manual&toolsSection=workflows&workflowsView=drafts&draftsView=grades` and `?tab=workflows&workflowsView=drafts&draftsView=grades`; and a session with `ta-tools-section=workflows`/`ta-workflows-view=drafts`/`ta-drafts-view=grades` in storage; then Back/Forward | same sitting - this is the [READING] crossing claim of section 3.3 that no test here can settle end to end |
| OW-W3-3 | Workflows > Drafts now shows Message Drafts directly (no degenerate single-item tablist), and Message Drafts is still reachable from the message-replies "Saved to drafts" link | repo owner | Tools rail Drafts chip; the MessageThreadRow "Saved to drafts" link | same sitting |
| OW-W3-4 | The grading-drafts attention badge appears on the Grading chip (not the Drafts chip), and the Drafts chip badges message drafts only | repo owner | create a pending grading draft and a pending message draft; read both chips | same sitting - RES-W3-2 |

---

## 8. Residual register

Each row names owner, instrument, next step. A row missing any of the three is a
DELETION. **None of these is a row in `docs/BACKLOG.md` yet** - that file is not
in my write set - so until the backlog seat files them (or folds them into the
GRAD-SUBTAB home row) they DO NOT EXIST. Stated plainly.

| id | Residual | Owner | Instrument | Next step |
|---|---|---|---|---|
| RES-W3-FORK | `draftsView` disposition: retire entirely (E-full) vs keep dormant `messages`-only (E-min). A genuine fork touching the message-drafts nav. | repo owner (if round-2 disputes it) | the `DraftsView` type + `WorkflowsPanel` render + the `draftsView` fixtures | the terminating owner question in section 3.0; every answer ships |
| RES-W3-1 | The new member string `"drafts"` and label "Drafted Grades" are MY default. | wave-3 UX seat | `manual-rail.test.ts:238`/`:377` exact-list + the collision census | the UX pass on the as-built diff |
| RES-W3-2 | The badge relocation (which chip carries grading-drafts count; whether the inner item badges) is MY default (Grading chip carries `draftsGradesCount`, Drafts chip carries `draftsMessagesCount`). | wave-3 UX seat | the `toolsRailOptions` count map (`page.tsx:333-336`) | the UX pass |
| RES-W3-3 | The two CSS-orphan tests and any RecordingTab-adjacent frozen counts read `page.tsx`/`WorkflowsPanel` as source; likely green, but they read files wave 3 edits. | wave-3 implementer | run them in the wave-3 gate (they are in section 6's list) | the gate settles it; a red is a canary-or-guard call, not a bug on sight |
| RES-W3-4 | `GradingPointerTarget` gains a `toolsSection` dimension - the FIRST retired grading pointer to cross `toolsSection`. Future pointers may need other section values (e.g. `courses`); the shape should be checked before a third crossing is added. | architect, next cross-section pointer | the `GradingPointerTarget` type + `resolveGradingPointer` | before any further cross-section retired pointer |
| RES-W3-5 | `useAppNavigation.ts` (717) grows a few lines with the crossing; still ~280 under the ceiling, but it is the file every nav addition grows (carried from RES-ARCH-7). | architect, next nav chunk | both counters after wave 3 | extraction owed before it passes 800 |

Carried unchanged (still open, not discharged here): RES-WAVE-2 is CLOSED by
this pass (feasibility established: FEASIBLE, this document). RES-W2-1
(`ta-rec-view` migration), RES-ARCH-8 (trap card `GradingRecordingPanel` line),
RES-ARCH-9 (`INCREMENTAL_ROUTE_ENABLED` line drift) remain open and untouched.

---

## 9. The leverage line: trigger FIRED, NO CLAIM, declined not omitted

`docs/loop/seats.md` / `docs/loop/leverage.md` owe a claim when a chunk builds or
changes a capability a user reaches. **Wave 3 adds no mechanism.** Drafted Grades
exists and is reachable today from Workflows > Drafts > Grades; wave 3 relocates
its mount and its nav entry and redirects the old pointer. The only advantage it
could name is CLICK COST / discoverability, which `leverage.md:66` lists among
the STRUCK classes ("Free to any feature with a UI at all ... not a categorical
advantage over a chat"). So: trigger recorded, claim declined. I am not
defaulting the three-way call - this is a relocation, not a feature. Claiming the
retired-pointer redirect as leverage would be the failing shape `leverage.md`
exists to catch (it keeps an EXISTING capability reachable).

---

## 10. What I could not determine

Stated plainly rather than filled in.

1. **Anything a user sees, or any lifecycle/redirect behaviour at runtime** - no
   component renders here. Section 3.3's crossing claim (a `draftsView=grades`
   pointer lands on Tools > Grading across all three read paths) is enforced at
   the SOURCE/pure-function level by I-retired-drafts, and confirmed
   behaviourally only by OW-W3-2. The initial-load path was wave 1's shipped
   blocker; I have specified all three read paths, but only the owner walk can
   confirm the live redirect.
2. **Whether the CSS-orphan tests and any adjacent frozen counts stay green
   (RES-W3-3)** - the wave-3 gate settles it; I did not open every subject.
3. **The `draftsView` disposition fork (RES-W3-FORK)** - a genuine design fork
   the owner may settle; both readings ship. Not a blocker: the write set above
   is E-full and notes what E-min omits.
4. **The click-cost delta of the consolidation** - measurable, not measured;
   wave-3 UX seat's, counted twice (first use, repeat use).

---

## 11. Gates run on this document

**Run:** `npm run docs:gate`. Result in the hand-back report.

**NOT run:** every instrument in sections 4, 6, 7. My write set is one document.
I-inner/I-drafts-mount/I-no-mirror/I-retired-drafts and the canary updates do not
exist yet and I did not create them; T1-T5 and the existing canaries were re-read
at their cited lines but none was executed against a modified tree. No file under
`src/` was opened for writing, nothing was committed, nothing was pushed.
`git status --short` is reported in the hand-back.
