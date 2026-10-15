# WORKFLOWS-COLLAPSE-IA - acceptance criteria + scope

Owner request, 2026-10-08 (direct chat): "collapse artifact temps, workflows,
automations into one tab, and put drafts into lib tab."

This is an information-architecture re-parent, exactly the shape this repo has
shipped three times (GRAD-SUBTAB, PRES-2 S6.7, TOOLS-IA-REORG / ANNOUNCEMENTS).
It moves surfaces between nav containers and preserves every behaviour; it is
NOT a rewrite or a behaviour merge.

---

## 0. Executive summary

Two asks, built as two independently-green, independently-pushable waves:

- **W1 - Drafts into the Library tab.** The message-drafts surface
  (`workflowsView="drafts"`, rendered by `MessageDraftsTab`) leaves the Tools
  tab's Workflows family and becomes a new `LibrarySection` - **Library > Drafts**
  (`librarySection="drafts"`). Its unread-messages attention badge moves with it:
  off the Tools top-strip tab and onto the Library tab and the Library rail's
  Drafts chip. This mirrors GRAD-SUBTAB wave 3 (which moved the *grades* half of
  Drafts out) almost line for line.

- **W2 - Collapse Artifact Templates + Workflows + Automations into one
  destination.** The existing `manualView="artifact-design"` Manual view GROWS an
  inner nav of three sub-views - **Templates** (the current `ArtifactDesignTab`,
  unchanged), **Workflows** (`WorkflowsTab`), **Automations** (`AutomationsTabView`)
  - exactly the way `presentations` grew from a single destination into a
  two-child inner nav at PRES-2 S6.7. The chip is relabelled (recommended
  **"Automate"**, owner-settable copy). Because the container keeps the
  `artifact-design` param value, a returning `?manualView=artifact-design` user
  lands on Templates with no migration at all. The `workflows`/`automations`
  members of the now-empty Workflows family are aliased into the container; the
  Tools "Workflows" section is dissolved.

**Combined result:** the Tools tab's Workflows family ceases to exist. Its three
members redistribute - Workflows and Automations into the relabelled Artifact
Templates container, Drafts into the Library tab.

**One SHAPE fork for the owner (F1), affecting W2 only.** The owner's word "tab"
is ambiguous between (a) a NEW top-level tab holding the three, and (b) a single
destination inside the existing Tools tab holding the three as an inner nav.
**This scope recommends (b)** and builds the concrete plan on it; (a) is recorded
as the fork with its cost. W1 (Drafts -> Library) is identical under both
readings (F1-INDEPENDENT) so it can be specified without the owner's answer - but
it is NOT fold-independent: it edits `url-state.ts`, `useAppNavigation.ts`,
`page.tsx` and `tab-sections.ts`, which the fold also edits, so W1 rebases onto
the post-fold (committed) tree exactly as W2 does.

**The ppt-design->Presentations fold is LIVE and all counts here are POST-FOLD
(see Section 10).** The first draft of this scope (checker round 1) measured the
fold absent and said so; that measurement was correct at session start but the
tree moved under it - the fold (`docs/ppt-design-into-presentations-scope.md`,
47610 bytes; `ls` confirms) got scoped and BUILT in the working tree while this
scope was being written, modifying 4 of this feature's 6 nav files
(`manual-rail.ts`, `url-state.ts`, `useAppNavigation.ts`, `page.tsx` -
`git status --short` `M`). The fold re-parented `ppt-design` out of
`ManualViewType` into a third `PresentationsView` child, so `MANUAL_VIEW_ORDER`
is now **8** (not 9) and `TOOLS_RAIL_ITEMS` is **11** (not 12). Every quantity,
citation and re-pin count below is re-baselined onto the post-fold tree, and the
re-pin chain is **11 -> 10 (W1) -> 8 (W2)**. The fold MUST land first;
WORKFLOWS-COLLAPSE rebases onto it (Section 10). The fold left `artifact-design`
untouched (it is still a single Manual destination, `manual-rail.ts:159`), so
reading (b)'s container design is unaffected by it.

---

## 1. Acceptance criteria

Written from the owner's words. Mechanism is Section 4-6; oracle construction is
Section 8-9.

**Leverage trigger: no claim.** This is a refactor / IA re-parent that preserves
all behaviour and builds no capability a user reaches that a chat could not
(`DEV_LOOP.md`, "The loop / Criteria" - a refactor records the fired trigger and
makes no claim). The fired trigger is "IA re-parent, behaviour-preserving",
matching how TOOLS-IA-REORG and GRAD-SUBTAB waves were treated. No leverage
paragraph, no removal test.

Each criterion names the object under comparison, the instrument, and the
direction of failure.

### W1 - Drafts in the Library tab

- **AC-W1-1 (reachable new home).** Picking the Library rail's **Drafts** chip
  shows the message-drafts surface (`MessageDraftsTab`). Object: `page.tsx`
  Library branch. Instrument: `topLevelTabs.wiring.test.ts` source-text pin that
  the `librarySection === "drafts"` branch renders `<MessageDraftsTab`. Fails if
  the chip has no render branch (blank pane).
- **AC-W1-2 (registered + ordered).** `LibrarySection` is `files | knowledge |
  drafts`; the Library rail shows a Drafts chip labelled "Drafts". Object:
  `tab-sections.ts` ordered lists. Instrument: `tab-sections.test.ts`
  `LIBRARY_SECTION_ORDER` / `LIBRARY_SECTION_LABELS` pins. Fails on a missing or
  mislabelled member.
- **AC-W1-3 (gone from its old home).** The Tools tab no longer renders a Drafts
  surface, and nothing renders `MessageDraftsTab` under `WorkflowsPanel`. Object:
  `page.tsx` / `WorkflowsPanel.tsx`. Instrument: `topLevelTabs.wiring.test.ts`
  (no `workflowsView === "drafts"` render branch remains after W2; in W1 the
  Workflows family still exists but Drafts has left it - see Section 6).
  Direction: fails if Drafts renders in two places (mirror, not move).
- **AC-W1-4 (badge follows).** The unread message-drafts count
  (`draftsMessagesCount`) is shown on the Library tab and the Library Drafts
  chip, and is NOT shown on the Tools tab. Object: `page.tsx` badge wiring.
  Instrument: `topLevelTabs.wiring.test.ts` source-text pin (reading claim - no
  component renders; the count APPEARING is OW-1, owner-walk). Fails if the Tools
  tab still carries `draftsMessagesCount` or the Library tab does not.
- **AC-W1-5 (no returning user is stranded).** Every persisted/URL value that
  named the old Drafts home lands on Library > Drafts: `ta-tools-section=
  workflows` + `ta-workflows-view=drafts`; `?tab=manual&toolsSection=workflows&
  workflowsView=drafts`; `?tab=workflows&workflowsView=drafts`; `ta-active-tab`
  of `grade-drafts` or `drafts`. Object: the migration resolvers. Instrument: the
  no-stranded-key leaf tests (Section 9, M-D1..M-D4). Fails if any resolves to a
  blank Tools pane or the default tab.
- **AC-W1-6 (the grades pointer still wins).** The pre-existing Drafts > Grades
  pointer (`workflowsView=drafts` + `draftsView=grades`) STILL resolves to Tools
  > Grading > Drafted Grades, NOT to Library > Drafts. Object: resolver ordering.
  Instrument: leaf test M-D5 asserting grades-first precedence. Fails if a
  grades-draft user is bounced to Library.
- **AC-W1-7 (MessageDrafts cross-link still lands).** The "Saved to drafts" link
  (`MESSAGE_DRAFTS_NAV_EVENT`, `MessageThreadRow.tsx`) lands on Library > Drafts.
  Object: `page.tsx` event listener. Instrument: `topLevelTabs.wiring.test.ts`
  source-text pin that the `ANNOUNCEMENTS_NAV`-style listener sets
  `setLibrarySection("drafts")` + `setActiveTab("files")`. Fails if it still sets
  `toolsSection="workflows"`.

### W2 - The Automate container (recommended reading b)

- **AC-W2-1 (one destination, three sub-views).** The relabelled container
  (`manualView="artifact-design"`) has an inner nav of exactly Templates,
  Workflows, Automations, in that order. Object: `manual-rail.ts`
  `getInnerDestinations("artifact-design")`. Instrument: `manual-rail.test.ts`
  inner-destinations pin. Fails on a missing/extra/mis-ordered sub-view.
- **AC-W2-2 (each sub-view reaches its real surface).** Templates renders
  `ArtifactDesignTab`, Workflows renders `WorkflowsTab`, Automations renders
  `AutomationsTabView` - the same components as today, re-parented, not rewritten.
  Object: `page.tsx` container branch. Instrument: `topLevelTabs.wiring.test.ts`
  source-text pins for each `automateView === "<x>"` render branch. Fails on a
  blank pane for any sub-view.
- **AC-W2-3 (behaviour-preserving default).** A returning `?manualView=
  artifact-design` / `ta-manual-view=artifact-design` user with no `automateView`
  lands on Templates - the exact screen they had before. Object: the
  `automateView` default. Instrument: leaf test M-A1/M-A2 + `manual-rail.test.ts`
  `getActiveDestinationId("artifact-design", ...)` default pin. Fails if the
  default is anything but Templates.
- **AC-W2-4 (Workflows/Automations not stranded).** Every persisted/URL value
  that named the old Workflows or Automations chips lands on the container's
  matching sub-view, with `toolsSection` forced to `manual`:
  `?toolsSection=workflows&workflowsView=workflows|automations`;
  `ta-tools-section=workflows` + `ta-workflows-view=workflows|automations`;
  `?tab=workflows` (bare) and `?tab=workflows&workflowsView=workflows|automations`.
  Object: the automate pointer resolver. Instrument: leaf tests M-W1..M-W4, M-T1.
  Fails if any resolves to a blank pane, the Workflows section, or the default.
- **AC-W2-5 (the Workflows section is gone, not vestigial).** No rail chip writes
  `toolsSection="workflows"`; the live `ToolsSection` set no longer accepts it as
  a resting state (a stored `workflows` is redirected, never rendered). Object:
  `tab-sections.ts` + `tab-rails.ts`. Instrument: `tab-sections.test.ts` /
  `tab-rails.test.ts` re-pins (Section 8). Fails if a stored `workflows`
  toolsSection lands on an empty pane.
- **AC-W2-6 (the param contract holds).** No existing `?manualView=` link breaks;
  no rail-item id reaches the query string; `workflowsView` is retired only by
  ALIAS (every old value still resolves), never by silent deletion. Object:
  `url-state.ts` build/parse. Instrument: the `tab-rails.test.ts` "no view param
  renamed/retired" oracle, re-pinned to reflect `workflowsView`'s retirement with
  its alias coverage. Fails if an old link lands anywhere but its new home.
- **AC-W2-7 (inner nav is named).** The container's inner nav has a distinct
  accessible name fed from `getInnerNavAriaLabel`. Object: `manual-rail.ts`
  `INNER_NAV`. Instrument: `manual-rail.test.ts` parity test (has-destinations
  IFF has-aria-label; all distinct). Reading claim - OW-2 is the owner-walk.
  Fails if the container has destinations but no aria name, or a duplicate name.

### Cross-cutting

- **AC-X-1 (tree stays green per wave).** After each wave: `npx tsc --noEmit`
  exit 0 no output; `npm run lint` exit 0 with no NEW warning in the wave's files
  (baseline four: `this-repo.md:107`); `npm run build` prints
  `Compiled successfully`; the full suite passes. Instrument: the gates
  (`this-repo.md` section 1). Fails on any gate regression.
- **AC-X-2 (no file crosses the 1000-line ceiling).** Instrument:
  `src/file-size-ceiling.structure.test.ts`. See the live risk on `page.tsx`
  (931 lines) in Section 3 / Residual R-4.
- **AC-X-3 (the new persisted key is in the frozen list).** `ta-automate-view`
  (W2's inner-nav key) is added to `EXPECTED_TA_KEYS` in the SAME commit.
  Instrument: `componentStorageKeys.structure.test.ts`
  (`src/app/components/componentStorageKeys.structure.test.ts:132,237`). Fails if
  the key is introduced without bumping the frozen list.

---

## 2. Brief from the tree (confirmations, every citation opened)

All four PARSE claims in the dispatch confirmed against the current tree:

- **"artifact temps" = Artifact Templates = `manualView="artifact-design"`.**
  POST-FOLD citations: `MANUAL_VIEW_LABELS["artifact-design"] = "Artifact
  Templates"` (`src/app/components/manual/manual-rail.ts:230`); it is a
  single-destination Manual view today - destination at `manual-rail.ts:159`,
  `getInnerDestinations("artifact-design")` returns null, pinned at
  `manual-rail.test.ts:382-384` (the fold did not touch this block). Rendered by
  `<ArtifactDesignTab />` under `manualView === "artifact-design"`
  (`src/app/page.tsx:663-665`). `ArtifactDesignTab.tsx` is a one-line re-export
  of `./artifact-design` (`src/app/components/ArtifactDesignTab.tsx:1`). Note:
  `ppt-design` is NO LONGER a `manualView` - the fold moved it to
  `PresentationsView = "slide-deck" | "pipeline" | "ppt-design"`
  (`manual-rail.ts:57`), rendered inside the presentations branch
  (`page.tsx:678-685`). This feature must NOT touch `ppt-design`.
- **"workflows" + "automations" = two of three `WorkflowsView`.** `WorkflowsView
  = "workflows" | "automations" | "drafts"` (`tab-sections.ts:105`); labels
  Workflows / Automations / Drafts (`tab-sections.ts:111-115`); order
  (`tab-sections.ts:110`). Rendered by `WorkflowsPanel` under
  `toolsSection === "workflows"` (`page.tsx:740-742`); `WorkflowsPanel` dispatches
  to `WorkflowsTab` / `AutomationsTabView` / `MessageDraftsTab`
  (`WorkflowsPanel.tsx:36-38`).
- **"drafts" = `WorkflowsView="drafts"`,** label "Drafts"
  (`tab-sections.ts:115`); rendered by `<MessageDraftsTab onOpenWorkflow={...} />`
  (`WorkflowsPanel.tsx:38`). The attention badge rides `TOOLS_RAIL_DRAFTS_ID =
  workflowsRailItemId("drafts")` (`tab-rails.ts:163`), carrying
  `draftsMessagesCount` (`page.tsx:401-410`).
- **"lib tab" = the Library top-level tab,** value `"files"`, label "Library"
  (`tab-sections.ts:36,42`); `LibrarySection = "files" | "knowledge"`
  (`tab-sections.ts:67`).

`MessageDraftsTab` can mount under Library intact: it self-wraps `<TabShell>`
(`MessageDraftsTab.tsx:294,523`), takes an optional `onOpenWorkflow`
(`MessageDraftsTab.tsx:27`), and holds no live capture resource - a plain
conditional mount, exactly like `DraftedGradesTab` (`page.tsx:727-729`).

---

## 3. Measured ground truth (every quantity names its command)

Line counts via `@(Get-Content <file>).Count` in PowerShell (the mandated
instrument - `this-repo.md:195`), re-measured against the POST-FOLD working tree:

```
  931  src/app/page.tsx
  843  src/app/components/home/useAppNavigation.ts          (fold +17)
  517  src/app/url-state.ts                                 (fold +10)
 1000  src/app/url-state.test.ts                            (ceiling - unchanged by fold)
  567  src/app/components/home/useAppNavigation.test.ts     (fold +60)
  458  src/app/components/manual/manual-rail.ts             (fold -3)
  707  src/app/components/manual/manual-rail.test.ts
  199  src/app/components/tabs/tab-sections.ts
  155  src/app/components/tabs/tab-sections.test.ts
  196  src/app/components/tabs/tab-rails.ts
  384  src/app/components/tabs/tab-rails.test.ts
  738  src/app/components/tabs/topLevelTabs.wiring.test.ts
  525  src/app/components/MessageDraftsTab.tsx
   32  src/lib/rec-view-migration.ts   (the migration-leaf precedent)
```

These are working-tree counts with the fold applied but uncommitted. The
IMPLEMENTER MUST re-measure against committed HEAD at build time
(`@(Get-Content <file>).Count`) once the fold has landed - the fold is in flight
and its line counts are not final.

Two of these are load-bearing constraints:

- **`src/app/url-state.test.ts` is at exactly 1000 - the hard ceiling**
  (`src/file-size-ceiling.structure.test.ts`, `LIMIT = 1000`, `this-repo.md:173`).
  It cannot grow by one line. `tab-rails.test.ts:265-268` records this exact fact
  as the reason the D26 URL oracle was put in `tab-rails.test.ts` instead. **Every
  new url-state migration test in this feature MUST go in a NEW test file**
  (proposed `src/app/url-state.automate-collapse.test.ts`), never appended to
  `url-state.test.ts`.
- **`src/app/page.tsx` is at 931 - 69 lines of headroom.** W2 adds a container
  inner-nav mount block and W1 adds a Library Drafts branch, while W2 removes the
  `toolsSection === "workflows"` / `<WorkflowsPanel>` block. Net may stay under
  1000 but is not guaranteed. The wave gate MUST measure `page.tsx` with
  `@(Get-Content src/app/page.tsx).Count`; if it crosses, the extraction is
  Residual R-4, not a `maxLines` bump (`this-repo.md:173` - never raise the
  ceiling to fit a file that grew).

Counts of the Tools rail POST-FOLD (the pins W2 moves):

- `TOOLS_RAIL_ITEMS` has **11** items - **8** Manual + 3 Workflows - pinned
  `expect(TOOLS_RAIL_ITEMS).toHaveLength(11)` (`tab-rails.test.ts:67`,
  `topLevelTabs.wiring.test.ts:387`, both already re-pinned by the fold) and by
  exact id list (`tab-rails.test.ts:54-66`, headed "the eight Manual views then
  the three Workflows views").
- `MANUAL_VIEW_ORDER` has **8** members (`manual-rail.ts:213-222`), pinned
  `manual-rail.test.ts` (the fold re-pinned this block). W2 keeps it at 8
  (relabel `artifact-design`, no add/remove).
- `WORKFLOWS_VIEW_ORDER` has 3, pinned `tab-sections.test.ts:99` (the fold did
  NOT touch `tab-sections.ts`). W1 drops it to 2 (drafts out); W2 retires it
  entirely.

**The re-pin chain for the rail length is therefore `11 -> 10 (W1) -> 8 (W2)`,
NOT `12 -> 11 -> 9`:** post-fold 11 (8 Manual + 3 Workflows); W1 removes
`workflows:drafts` -> 10 (8 Manual + 2 Workflows); W2 absorbs
`workflows:workflows`/`workflows:automations` into the `artifact-design`
container and dissolves the family -> 8 (8 Manual + 0 Workflows). The implementer
re-measures `MANUAL_VIEW_ORDER.length` against committed HEAD before pinning,
because the fold is still in flight.

Environment limits that bind this feature (`this-repo.md` section 6):
**No component is rendered by any test here.** Every rail, chip, badge, inner-nav
and keyboard claim is a reading claim or an owner-walk. `vitest` is node-env and
collects only `src/**/*.test.ts`. The pre-push gate runs NO vitest
(`this-repo.md:30-40`), so every structural canary this feature touches must be
in the wave gate explicitly.

---

## 4. The SHAPE decision (fork F1) and the recommendation

The three items live in TWO families today: `artifact-design` is a Manual view
(`toolsSection="manual"`); `workflows`/`automations` are `WorkflowsView` members
(`toolsSection="workflows"`). Collapsing them is a new grouping. Two readings:

### Reading (a) - a NEW top-level tab

A fifth `ActiveTab` in the strip holding the three as its own rail/inner nav,
relocating them OUT of the Tools tab entirely.

- Cost: adds a top-level tab (`TAB_ORDER` 4 -> 5), reversing the D24/D25
  direction that deliberately cut six tabs to four (`tab-sections.ts:1-3`). Needs
  a new `ActiveTab` value, a new top-strip `<Tab>`, a new section family, a new
  rail, new `isActiveTab`/`resolveTabDestination`/`buildUrlSearch` branches, and
  relocating artifact-design out of `MANUAL_VIEW_ORDER`. Largest blast radius; no
  shipped precedent in this tree for adding a top-level tab (Course Intel was
  promoted because it is cross-course - `manual-rail.test.ts:534-548` - a
  different argument).
- Only argument for it: the owner's literal word "tab", and the parallel "lib
  tab" being a top-level tab.

### Reading (b) - a single Tools destination with an inner nav  [RECOMMENDED]

Keep `manualView="artifact-design"` as the container value, relabel its chip, and
grow it an inner nav of Templates / Workflows / Automations - the EXACT move
`presentations` made at PRES-2 S6.7 (single destination -> two-child inner nav,
`manual-rail.test.ts:387-447`), with the cross-family absorption of
Workflows/Automations handled by retired-pointer aliases the way GRAD-SUBTAB
absorbed `repo-grades` and Drafts > Grades
(`manual-rail.ts:336-356`, `RETIRED_GRADING_POINTERS`).

**Why (b):**

1. **Thrice-shipped shape, lowest shape-risk.** Grading, Presentations and
   Announcements are all "one chip, inner nav, cross-family absorption via
   aliases". The migration machinery, the test pins and the mount pattern all
   exist to copy. This seat exists to prevent shape errors; the safest shape is
   the one already proven here.
2. **It honours the D24/D25 fewer-tabs direction** instead of reversing it.
3. **It keeps `artifact-design` alive (the task's own D26 preference):**
   "do NOT rename/retire the underlying `manualView="artifact-design"` ... if
   avoidable - migrate/alias them." Reusing `artifact-design` as the container
   value means a returning `?manualView=artifact-design` user needs NO migration
   - they land on Templates, the exact screen they had.
4. **"One tab" reads naturally as "one sub-tab"** in this tree's own vocabulary:
   the comments call these containers "the Grading sub-tab", "artifact-design
   subtab", "presentations subtab" (`manual-rail.test.ts:368,399,454`).

**The container, concretely (reading b):**

- Container value: `manualView="artifact-design"` (unchanged param value).
- Chip label: **"Automate"** (recommended; collides with no sub-view label).
  THIS IS OWNER-SETTABLE COPY, cheap to change - not a structural decision.
- Inner-nav param: a NEW `automateView: "templates" | "workflows" | "automations"`,
  key `ta-automate-view`, default **"templates"** (behaviour-preserving - see
  AC-W2-3). New param, not an overload of `workflowsView`, following the
  `gradingView`/`presentationsView`/`announcementsView` precedent; `workflowsView`
  is retired-with-alias, which is the non-breaking mechanism the D26 note means.
- Sub-view labels: "Artifact Templates" (preserve the recognisable name),
  "Workflows", "Automations".
- Home sub-view: Templates.

**Fork disposition.** Per `docs/loop/leverage.md` and AGENTS.md SHAPE 5, the
three-way shape call is the owner's, filed as a backlog row by the orchestrator
with this recommendation and started on reading (b). F1 affects W2 ONLY. W1
(Drafts -> Library) is identical under both readings, so it is the work to START
regardless of the answer. If the owner later picks (a), the W1 work and the
inner-nav sub-view components are reused unchanged; only the container's MOUNTING
LEVEL (a new top-level tab vs the artifact-design chip) is rebuilt - the cost of
being wrong is the W2 container plumbing (`tab-sections`/`tab-rails`/`page.tsx`
top-level wiring), roughly one wave, not the migrations or the sub-views.

---

## 5. Mechanism - file by file

Component re-use (vetted, opened): `ArtifactDesignTab` (`page.tsx:22`, re-export
`ArtifactDesignTab.tsx:1`), `WorkflowsTab` (`WorkflowsPanel.tsx:3`),
`AutomationsTabView` (`WorkflowsPanel.tsx:4`), `MessageDraftsTab`
(`WorkflowsPanel.tsx:5`, self-wraps TabShell), `TabRail`/`ManualRail`
(`page.tsx:45,47`). Do-not-reuse: `WorkflowsPanel` itself is deleted after W2
(its only remaining job - the workflows/automations/drafts dispatch - is absorbed
by the container and the Library branch). Migration-leaf precedent to copy:
`src/lib/rec-view-migration.ts` (32 lines, pure, node-env unit-testable).

### W1 - Drafts into Library

- **`tab-sections.ts`:** `LibrarySection = "files" | "knowledge" | "drafts"`;
  `LIBRARY_SECTION_ORDER = ["files", "knowledge", "drafts"]` (append);
  `LIBRARY_SECTION_LABELS.drafts = "Drafts"`. `WorkflowsView` loses `"drafts"` ->
  `"workflows" | "automations"`; `WORKFLOWS_VIEW_ORDER`/`_LABELS` drop drafts.
- **`url-state.ts`:** `normalizeWorkflowsView` loses `drafts` from its set
  (derived from `WORKFLOWS_VIEW_ORDER`, so automatic). `buildUrlSearch` /
  `parseUrlState` gain the Library `drafts` branch. `resolveTabDestination`:
  `"grade-drafts"`/`"drafts"` tab values now resolve to `{tab:"files",
  librarySection:"drafts"}` (today `url-state.ts:119` -> Workflows). The new
  drafts->Library pointer (M-D1..M-D4) added as a pure resolver, ORDERED AFTER the
  existing `drafts-view:grades` grading pointer (M-D5 / AC-W1-6).
- **`useAppNavigation.ts`:** `librarySection` initializer gains the
  stored-`workflows`+`drafts` migration (M-D2) symmetric to the existing
  toolsSection migration at `:175-181`. The `workflowsView` initializer loses its
  `grade-drafts`/`drafts` -> `drafts` branch (`:352-354`). `MESSAGE_DRAFTS_NAV_EVENT`
  listener in `page.tsx` -> `setLibrarySection("drafts"); setActiveTab("files")`
  (today `page.tsx:260-268` sets `workflowsView="drafts"`, `toolsSection=
  "workflows"`). The drafts-refresh effect `workflowsDraftsShowing`
  (`page.tsx:279`) -> `activeTab==="files" && librarySection==="drafts"`.
- **`page.tsx`:** add `librarySection === "drafts" && <MessageDraftsTab
  onOpenWorkflow={openWorkflow} />` to the Library branch (`page.tsx:858-884`);
  `libraryRailOptions` gains `count: draftsMessagesCount` for drafts
  (`page.tsx:414-418`). Top-strip badges (`page.tsx:520`): `files` tab ->
  `filesInbox + draftsMessagesCount`; `manual` tab -> `draftsGradesCount` (was
  `draftsInbox`). Remove `drafts` from `WorkflowsPanel`'s render set
  (`WorkflowsPanel.tsx:38`).
- **`drafts-nav.ts`:** comments updated to name the new home (prose only; the
  event name and shape are unchanged).

### W2 - The Automate container

- **`manual-rail.ts`:** add `AutomateView = "templates" | "workflows" |
  "automations"` with presence-record/order/labels/`isAutomateView` guard
  (mirror `PresentationsView`, `:55-68`). Relabel
  `MANUAL_VIEW_LABELS["artifact-design"]` -> "Automate". Convert the
  `artifact-design` entry in `destinations` (`:159-164`) from a `name:null`
  single destination into an inner-nav group (mirror the presentations group at
  `:173-179`): group "Automate" with destinations `artifact-design` (label
  "Artifact Templates", the Templates home), `artifact-design-workflows`,
  `artifact-design-automations`. Add `"artifact-design"` to `InnerNavViewType`
  (`:257`) and to `INNER_NAV` (`:259-265`) with `ariaLabel` "Automate views".
  `getActiveDestinationId` / `resolveStateFromDestinationId` gain an `automateView`
  trailing-optional param (default "templates") and the `artifact-design-*`
  branches (mirror the presentations handling at `:314-315,393,425-429`). Add
  `RETIRED_AUTOMATE_POINTERS` (keyed by raw stored/URL value) mapping
  `workflows`/`automations`/`active-tab:workflows` to
  `{manualView:"artifact-design", automateView:<x>}` (mirror
  `RETIRED_GRADING_POINTERS`, `:336-356`).
- **`tab-sections.ts`:** retire `WorkflowsView` entirely (no live members). Narrow
  the LIVE `ToolsSection` to `"manual"` so a stored `"workflows"` is never a
  resting render state; keep recognition of the string in the migration layer
  (see `tab-rails`/`url-state`). `RETIRED_TAB_DESTINATIONS.workflows` is replaced
  by the automate-pointer path (a bare `?tab=workflows` carries no sub-view, so it
  needs the pointer that sets manualView+automateView, not a plain
  `TabDestination` - M-T1).
- **`tab-rails.ts`:** `ToolsRailItem` loses its `workflows` variant;
  `TOOLS_RAIL_ITEMS` is the 8 Manual views only; `TOOLS_RAIL_DRAFTS_ID` is
  removed (the badge is Library's now); `toolsStateFromRailItem` /
  `toolsRailItemFor` lose the workflows branch.
- **`url-state.ts`:** add `normalizeAutomateView`/`isAutomateView`,
  `AUTOMATE_VIEW_PARAM = "automateView"`, the `automateView` field on
  `UrlNavState`, and build/parse handling. `workflowsView` is removed from
  `UrlNavState` and from `buildUrlSearch` emission; the raw `workflowsView` param
  is still READ by `parseUrlState` only to feed the automate/drafts pointers
  (same shape as the retired `draftsView` raw-read, `url-state.ts:310-314,408`).
  The automate + drafts pointers force `toolsSection="manual"` (there is no
  other live value).
- **`useAppNavigation.ts`:** add `automateView` state + `ta-automate-view` persist
  effect (mirror `presentationsView`, `:433-443,576-578`); its initializer maps
  the stored/URL `workflows`/`automations` migrations (M-W3/M-W4). Remove
  `workflowsView` state and its effect. The popstate handler's
  `toolsSection === "workflows"` arm (`:769-771`) is replaced by the container's
  `automateView` restore under `manualView === "artifact-design"` (mirror
  presentations at `:764`).
- **`page.tsx`** (POST-FOLD line numbers; implementer re-checks against committed
  HEAD): replace the `toolsSection === "workflows"` / `<WorkflowsPanel>` block
  (`:740-741`) with the container's inner-nav mounts inside the existing
  `manualView === "artifact-design"` branch (`:663-665`): `automateView ===
  "templates"` -> `<ArtifactDesignTab />`, `=== "workflows"` -> `<WorkflowsTab />`,
  `=== "automations"` -> `<AutomationsTabView onOpenWorkflow={openWorkflow} />`.
  Do NOT touch the adjacent `manualView === "presentations"` branch
  (`:678-685`), which the fold now owns (it renders PowerPointDesign/Pipeline/
  PresentationsTab by `presentationsView`).
  `openWorkflow`/`handleWorkflowScheduled` (`:371-383`) and the CoursesTab
  `onNavigate("workflows")` arm (`:555-559`) re-point to `setManualView(
  "artifact-design"); setAutomateView("workflows"); setToolsSection("manual")`.
  `toolsRailOptions` loses the `TOOLS_RAIL_DRAFTS_ID` count branch
  (`:401-410`); delete the `WorkflowsPanel` import.

---

## 6. The migration register (no stranded key)

Every value a returning user can carry, with its new home, the resolver, and the
test. Ordering is load-bearing: the grades pointer is checked FIRST.

| Id | Raw value carried | New home | Where resolved |
|---|---|---|---|
| M-D5 | `workflowsView=drafts` + `draftsView=grades` (URL/stored) | Tools > Grading > Drafted Grades (UNCHANGED) | existing `RETIRED_GRADING_POINTERS["drafts-view:grades"]` - must be matched BEFORE M-D1..M-D4 |
| M-D1 | `?...&toolsSection=workflows&workflowsView=drafts` | Library > Drafts | drafts->Library pointer, `parseUrlState` |
| M-D2 | `ta-tools-section=workflows` + `ta-workflows-view=drafts` (+ no grades) | Library > Drafts | `useAppNavigation` librarySection initializer |
| M-D3 | `?tab=workflows&workflowsView=drafts` | Library > Drafts | `parseUrlState` (overrides the bare `?tab=workflows` default) |
| M-D4 | `ta-active-tab=grade-drafts` or `drafts` | Library > Drafts | `resolveTabDestination` + initializer |
| M-A1 | `?manualView=artifact-design` (no automateView) | Automate > Templates | FREE - artifact-design stays a Manual view, default automateView=templates |
| M-A2 | `ta-manual-view=artifact-design` | Automate > Templates | FREE - same |
| M-W1 | `?...&toolsSection=workflows&workflowsView=workflows` | Automate > Workflows (toolsSection forced manual) | `RETIRED_AUTOMATE_POINTERS` |
| M-W2 | `?...&toolsSection=workflows&workflowsView=automations` | Automate > Automations | `RETIRED_AUTOMATE_POINTERS` |
| M-W3 | `ta-tools-section=workflows` + `ta-workflows-view=workflows` | Automate > Workflows | `useAppNavigation` manualView+automateView initializers |
| M-W4 | `ta-tools-section=workflows` + `ta-workflows-view=automations` | Automate > Automations | same |
| M-T1 | `?tab=workflows` (bare, no workflowsView) | Automate > Workflows | automate pointer (replaces `RETIRED_TAB_DESTINATIONS.workflows`) |

`?tab=workflows` defaults to the Workflows sub-view (not Templates) so the retired
tab value still names the screen it always meant. `ta-active-tab=workflows`
(`useAppNavigation.ts:278`) similarly -> Automate > Workflows.

**The resolver precedence rule, stated as the one that fails silently if wrong:**
a raw `workflowsView=drafts` with `draftsView=grades` is BOTH a grades pointer and
a drafts-to-Library candidate. Grades MUST win (AC-W1-6). The existing resolver
(`resolveGradingPointer`, `url-state.ts:374-389`) already matches
`rawWorkflowsView === "drafts" && rawDraftsView === "grades"` first; the new
drafts->Library branch is ADDED AFTER it and guarded on `rawDraftsView !==
"grades"`.

---

## 7. Wave plan and write set per wave

**Prerequisite: the ppt-design->Presentations fold lands (commits) first.** The
fold modifies `manual-rail.ts`, `url-state.ts`, `useAppNavigation.ts` and
`page.tsx` - 4 of this feature's 6 files - so BOTH waves below rebase onto the
post-fold committed tree. The implementer re-measures `MANUAL_VIEW_ORDER.length`
and all shifted line citations against committed HEAD at build time; the counts
in this doc are the current (uncommitted) working-tree snapshot (Section 3).

Two sequential build waves (plus baseline). They SERIALIZE with each other AND
with the fold (shared files) - this is ordering, not a parallelism question.
Each wave leaves the tree green and is its own push. The rail-length re-pin
chain is **11 -> 10 (W1) -> 8 (W2)** (Section 3).

**W0 - Baseline (before hand-off).** Record the current Tools-Workflows-family /
Library behaviour in `docs/REGRESSION.md` (check `grep -a` first - the area is
partly covered by the D25/D26 and GRAD-SUBTAB entries; write a disposition table
if partial, per the Baseline seat). Write set: `docs/REGRESSION.md`.

**W1 - Drafts into Library.** Write set (production): `tab-sections.ts`,
`url-state.ts`, `useAppNavigation.ts`, `page.tsx`, `drafts-nav.ts`. Migration leaf:
new `src/lib/workflows-drafts-library-migration.ts` (pure, node-env testable) OR
inline in url-state - recommend the leaf, mirroring `rec-view-migration.ts`, so
the resolver is unit-testable in isolation and its caller (url-state +
useAppNavigation) lands in the SAME wave (the leaf's caller must ship with it -
`seats.md` Architect rule). Tests re-pinned/added (Section 8): `tab-sections.test.ts`,
`tab-rails.test.ts`, `topLevelTabs.wiring.test.ts`, `manual-rail.test.ts` (only if
WorkflowsView order pins are referenced - they are not), new
`src/app/url-state.automate-collapse.test.ts` (NOT url-state.test.ts - it is at
1000), `drafts-nav.test.ts`, the leaf's own test.

**W2 - The Automate container.** Write set (production): `manual-rail.ts`,
`tab-sections.ts`, `tab-rails.ts`, `url-state.ts`, `useAppNavigation.ts`,
`page.tsx`. Migration leaf: extend the W1 leaf (or a sibling
`src/lib/workflows-automate-migration.ts`) with `RETIRED_AUTOMATE_POINTERS`
resolution, caller in the same wave. `ArtifactDesignTab`/`WorkflowsTab`/
`AutomationsTabView` are re-parented (no edits to those components). Delete
`WorkflowsPanel.tsx`. Tests re-pinned/added: `manual-rail.test.ts`,
`tab-sections.test.ts`, `tab-rails.test.ts`, `topLevelTabs.wiring.test.ts`,
`componentStorageKeys.structure.test.ts` (ADD `ta-automate-view` to
`EXPECTED_TA_KEYS`, same commit - AC-X-3), the url-state collapse test file.

**Disjointness within the feature:** W1 and W2 overlap on `tab-sections.ts`,
`url-state.ts`, `useAppNavigation.ts`, `page.tsx`, so they cannot run in parallel
- they are strictly sequential. Not a defect; it is one feature.

**Wave-gate command (2+ test files -> `npm run test:paths`, never a raw
multi-path vitest - `this-repo.md:52-66`):**

```
npm run test:paths src/app/components/manual/manual-rail.test.ts src/app/components/tabs/tab-sections.test.ts src/app/components/tabs/tab-rails.test.ts src/app/components/tabs/topLevelTabs.wiring.test.ts src/app/url-state.test.ts src/app/url-state.automate-collapse.test.ts src/app/components/home/useAppNavigation.test.ts src/lib/drafts-nav.test.ts src/app/components/componentStorageKeys.structure.test.ts src/file-size-ceiling.structure.test.ts
```

Plus `npx tsc --noEmit`, `npm run lint`, and the `Compiled successfully` build
check. `src/file-size-ceiling.structure.test.ts` is included UNCONDITIONALLY
(`this-repo.md:42-49`) - it is the only thing that catches `page.tsx` crossing
1000 at push, and the pre-push gate runs no vitest.

---

## 8. Frozen tests that go RED, and how they are re-pinned

These are the oracles the change must update. Each is a deliberate frozen literal
(`tab-rails.test.ts:289-292`), so each MUST be re-pinned by hand in the wave that
changes it - never auto-derived (deriving from the module it checks would agree
with the change and prove nothing).

- **`tab-rails.test.ts:54-67`** - POST-FOLD the exact 11-id Tools rail list (8
  Manual + 3 Workflows) + `toHaveLength(11)` at `:67`. W1: drops
  `workflows:drafts` -> 10. W2: drops `workflows:workflows`,
  `workflows:automations` -> 8 Manual ids only. Re-pin both times.
- **`tab-rails.test.ts:93,113-121,123-131,134-166,168-188`** - every assertion
  built on `WORKFLOWS_VIEW_ORDER` / the workflows family / `TOOLS_RAIL_DRAFTS_ID`
  / `toolsStateFromRailItem`'s workflows branch. W2 removes the workflows family;
  these blocks are rewritten to the Manual-only rail (the `splits every chip into
  one of two sections` test at `:123-126` becomes one-section).
- **`tab-rails.test.ts:289-385`** - the "no view param renamed or retired" oracle.
  `EXPECTED_PARAM_NAMES` (`:299-313`) loses `workflowsView` and GAINS
  `automateView` + (W1) nothing new for drafts (librarySection already emitted).
  The `workflowsView` read-back assertions (`:357,362`) are replaced by
  `automateView` read-backs AND by migration-alias assertions proving the old
  `workflowsView=` values still resolve (retired-with-alias, not deleted -
  AC-W2-6). This is the B6.2 accounting shape the block exists to catch, so the
  retirement is recorded in-comment the way `draftsView`'s was (`:294-298`).
- **`tab-sections.test.ts:48-51,58-69,97-102`** - `TOOLS_SECTION_ORDER`,
  `WORKFLOWS_VIEW_ORDER`/`_LABELS`, `LIBRARY_SECTION_ORDER`. W1: Library order
  gains `drafts`; WorkflowsView order drops `drafts`. W2: ToolsSection live set
  narrows to `["manual"]`; WorkflowsView block removed (genuine retirement,
  recorded in-comment).
- **`tab-sections.test.ts:111-145`** - `RETIRED_TAB_DESTINATIONS` names exactly
  four; `?tab=workflows` resolution. W2: the `workflows` tab value now resolves
  via the automate pointer (manualView+automateView), so this block moves to
  assert the pointer path, not a plain `TabDestination`.
- **`manual-rail.test.ts:203-213**` - `MANUAL_VIEW_ORDER` (stays 9; no change).
- **`manual-rail.test.ts:368-385`** - the `artifact-design subtab` block:
  `getInnerDestinations("artifact-design")` flips from `toBeNull()` to the
  three-item list; the label pin "Artifact Templates" moves to the Templates
  inner destination; the chip label pin becomes "Automate". Re-pinned exactly as
  the presentations block was (`:387-447`).
- **`manual-rail.test.ts:282-299`** - the inner-nav parity test auto-covers the
  new `artifact-design` entry (it loops `MANUAL_VIEW_ORDER`); add an explicit
  distinct-name assertion for "Automate views".
- **`topLevelTabs.wiring.test.ts:240-255`** - "renders both halves of every
  merged tab": the `manual` row's second half `toolsSection === "workflows"` is
  removed (W2) and the `files` row gains `librarySection === "drafts"` (W1). The
  "exactly one TabRail per merged tab" test (`:211-228`) is unaffected.
- **`topLevelTabs.wiring.test.ts:319-367`** - WorkflowsPanel source-text canaries:
  W2 DELETES `WorkflowsPanel.tsx`, so the block that reads it
  (`WORKFLOWS_PANEL` path, `:80`) must be removed, and the "every Workflows chip
  has a render branch in WorkflowsPanel" test (`:358-367`) is replaced by "every
  automateView sub-view has a render branch in page.tsx".
- **`topLevelTabs.wiring.test.ts:387`** - `toHaveLength(11)` -> 10 (W1) -> 8 (W2).
- **`componentStorageKeys.structure.test.ts:131,132,237`** - add `ta-automate-view`
  to `EXPECTED_TA_KEYS` in the W2 commit (AC-X-3). The `:131` comment "Frozen at
  82 keys" is bumped to 83 in the same commit (cosmetic - the test compares the
  sorted list, so adding the key is what actually matters; the fold adds no key,
  so the count is 82 before W2).
- **`url-state.test.ts` (fold-independent, the CEILING BLOCKER)** - the file is at
  **exactly 1000** and holds **45 `workflowsView` match-occurrences** across ~40
  lines (`(Select-String -Path src/app/url-state.test.ts -Pattern workflowsView |
  Measure-Object).Count` = 45; lines 12,13,39,165,169,193,194,258-269,420,424,
  468,472,518,521,586,595-600,626-631,671-680,737-739,768-786,932-966). W2's
  retirement of `workflowsView` makes the fixture field (`DEFAULT_STATE`, `:39`)
  and every round-trip/normalizer assertion referencing it false. With ZERO
  headroom, any net-positive rewrite crosses the ceiling. **Budget/relocation
  plan, mandatory:** W2 DELETES the `workflowsView`-specific blocks from
  `url-state.test.ts` (the `normalizeWorkflowsView`/`isWorkflowsView` describe
  block at `:258-269`; the `workflowsView` field in `DEFAULT_STATE` at `:39`; the
  round-trips at `:165-194,420-424,468-472,518-521,586,595-600,671-680,768-786,
  932-966`) and relocates each still-wanted assertion, rewritten to `automateView`
  + alias coverage, into the new sibling `src/app/url-state.automate-collapse.test.ts`.
  Because retirement REMOVES lines from `url-state.test.ts`, the net effect there
  is a SHRINK; the implementer still measures `@(Get-Content
  src/app/url-state.test.ts).Count <= 1000` after the wave as the gate. W1's drafts
  assertions (`:165,169,193,194` etc.) are relocated the same way in W1.
- **`url-state.announcements.test.ts:16`** - its fixture carries
  `workflowsView: "workflows"`; after W2 removes the field from `UrlNavState`
  this is a `tsc` error. W2 removes the field from this fixture (file is 50 lines
  - ample headroom).
- **`useAppNavigation.test.ts`** (567 lines) - `workflowsView` at lines
  42,47,179,181,313,315,317,344,351,382: the `WorkflowsView` import/aliases
  (`:42,47`), the Drafts>Grades localStorage initializer pins (`:179,181` - the
  `ta-tools-section=workflows`+`ta-workflows-view=drafts`+`ta-drafts-view=grades`
  block), and the `workflowsView` localStorage initializer pins (`:313-317,344,
  351,382`). W1 rewrites the drafts initializer pins; W2 removes the
  `workflowsView` state pins and its import. The `WORKFLOWS_VIEW_KEY` constant
  pin (`:154`) and the `resolveGradingPointer(null, null, "drafts", "grades")`
  pin (`:315-323`) are the grades-survival anchors - see the note below.

NEW instrument files: `src/app/url-state.automate-collapse.test.ts` (migration
aliases + drafts->Library + the relocated+rewritten `workflowsView` assertions,
since `url-state.test.ts` is at the 1000 ceiling) and the migration leaf's own
`*.test.ts`.

**Grades-pointer survival (W2 design constraint, must be stated or it breaks).**
The Drafts > Grades migration (`ta-workflows-view="drafts"` + `ta-drafts-view=
"grades"` -> Tools > Grading, `resolveGradingPointer(..., "drafts", "grades")`,
`useAppNavigation.test.ts:315-323`) reads the RAW `workflowsView` URL param and
the RAW `WORKFLOWS_VIEW_KEY` = `"ta-workflows-view"` localStorage value. W2
retires `workflowsView` from `UrlNavState` and stops EMITTING it - but the raw
param and the raw `ta-workflows-view` key MUST still be READ, exactly as the
already-retired `draftsView` / `DRAFTS_VIEW_PARAM` is kept read-only for the same
pointer (`url-state.ts:310-314`; `WORKFLOWS_VIEW_KEY` pinned at
`useAppNavigation.test.ts:154`). The same raw `ta-workflows-view="drafts"` read
is also what the new W1 drafts->Library migration (M-D2) keys off - and the
grades branch is matched FIRST (M-D5 / AC-W1-6). So retiring `workflowsView` as a
STATE field does not retire the `ta-workflows-view` KEY as a migration input; W2
keeps the key alive for grades detection and W1 keeps it alive for drafts
detection.

---

## 9. Instruments (object / instrument / direction of failure)

All machine-checkable instruments are source-text or pure-function - **vitest
renders NOTHING here**, so the rendering, the badge appearing, and the keyboard
story are owner-walks, stated as such.

| Instrument | Object under comparison | Produces | Fails when |
|---|---|---|---|
| Order/label pins (`tab-sections.test.ts`, `tab-rails.test.ts`, `manual-rail.test.ts`) | the registries vs frozen literals | exact-set equality | a member is added/removed/mislabelled without re-pinning |
| no-orphan-view (`topLevelTabs.wiring.test.ts` render-branch pins) | each rail chip vs its `page.tsx` render branch | branch-exists per view | a chip has no render branch (ships dead / blank pane) |
| no-stranded-key leaf tests (M-A1..M-W4, M-D1..M-D5, M-T1) | each persisted/URL value vs its resolved home | resolved `{manualView, automateView}` / `{tab, librarySection}` | any value resolves to a blank pane or the default |
| grades-precedence pin (M-D5) | drafts+grades vs drafts-only | which pointer matches first | the drafts->Library branch is checked before the grades pointer |
| migration-leaf removal sabotage | the resolver vs a reference input | RED on removal | deleting the pointer branch leaves the test green (dead guard - the `classTrendsDraft` lesson) |
| badge-follows pin (`topLevelTabs.wiring.test.ts`) | `page.tsx` badge wiring source text | Library carries `draftsMessagesCount`, Tools does not | the count stays on Tools or is absent from Library (reading claim; OW-1 confirms visually) |
| inner-nav aria pin (`manual-rail.test.ts` parity) | `INNER_NAV` destinations vs aria names | has-destinations IFF has-aria + all distinct | the container has destinations but no/duplicate aria name (reading claim; OW-2) |
| `file-size-ceiling.structure.test.ts` | every `src/` file vs LIMIT=1000 | pass/fail | `page.tsx` crosses 1000 (Residual R-4) |
| `componentStorageKeys.structure.test.ts` | the `ta-` key set vs `EXPECTED_TA_KEYS` | exact-set | `ta-automate-view` added without bumping the list |

**Cannot be verified in this environment (owner-walk, named steps):**

- OW-1: the Drafts count actually appears on the Library tab/chip and is gone from
  Tools. Steps: save a message draft; observe the Library tab badge; confirm Tools
  shows no message-draft badge.
- OW-2: the Automate inner nav renders, is keyboard-reachable, and is announced by
  its aria name. Steps: open Automate; Tab through Templates/Workflows/Automations;
  confirm each pane paints the right surface.
- OW-3: round-trip a returning session - set each old location in localStorage,
  reload, confirm the landing screen. (The leaf tests prove the RESOLVER; only a
  real reload proves the mount.)

No render-based requirement is proposed (`this-repo.md` section 6).

---

## 10. CRITICAL SEQUENCING

**The ppt-design->Presentations fold is scoped and BUILT - re-measured.**
Checker round 1 flagged that round-1's "the fold does not exist" claim was stale.
Re-measured on the current tree:

- `ls docs/ppt-design-into-presentations-scope.md` -> exists, 47610 bytes, dated
  2026-10-08 15:00.
- `git status --short` of this feature's 6 nav files shows 4 modified by the
  fold: `manual-rail.ts`, `url-state.ts`, `useAppNavigation.ts`, `page.tsx`
  (uncommitted working-tree edits).
- The build is already present: `ManualViewType` no longer contains `ppt-design`
  (`manual-rail.ts:15-23`, 8 members); `PresentationsView = "slide-deck" |
  "pipeline" | "ppt-design"` (`manual-rail.ts:57`); the rail pins
  `tab-rails.test.ts:67` and `topLevelTabs.wiring.test.ts:387` are already
  re-pinned to 11; `page.tsx:678-685` renders PowerPointDesign inside the
  presentations branch; a `legacyPptDesignView` migration exists
  (`manual-rail.ts:385,424`).

Round-1's measurement was correct at session start (the file genuinely did not
exist then); the tree moved while this scope was being written - the
concurrent-work / auto-commit reality the repo warns about (MEMORY: trust the
working tree, not git bookkeeping). Everything in this doc is now re-baselined
onto the post-fold tree.

**Serialization requirement.** The fold edits `manual-rail.ts`, `url-state.ts`,
`useAppNavigation.ts`, `page.tsx` - 4 of this feature's 6 files - the SAME set
WORKFLOWS-COLLAPSE edits (it also restructures `MANUAL_VIEW_ORDER`, the Tools
rail and the `page.tsx` Tools branch). **The two MUST serialize - they cannot run
as concurrent subagents** (`this-repo.md:277-304` / the disjointness rule forbids
parallel on an intersecting set; one agent outside its list reverts the other's
work).

**Order: the ppt-design fold lands (commits) FIRST; WORKFLOWS-COLLAPSE rebases
onto it.** This REVERSES round-1's "collapse first" recommendation, which was
backwards because it assumed the fold was unscoped. The fold is built and in
flight now; WORKFLOWS-COLLAPSE is scoped but not yet built. So the fold commits
first, and both WORKFLOWS-COLLAPSE waves rebase onto the post-fold committed tree
(re-pin chain 11 -> 10 -> 8). WORKFLOWS-COLLAPSE touches `artifact-design`,
`workflows`, `automations`, `drafts` - never `ppt-design` - so there is no
content conflict with the fold, only a line-number/count rebase the implementer
resolves by re-measuring `MANUAL_VIEW_ORDER.length` and the cited lines against
committed HEAD.

**Disjointness from other active work - confirmed by path:**

- Current working tree (`git status --short`), beyond the fold's 4 nav-file
  edits: `syllabus-upload.ts`, `chatSubmissionIntake.ts`, `office-edit.ts`,
  `syllabus-upload-source.ts`, `office-edit.zip-caps.test.ts`. **None of those
  five is one of this feature's six nav files.** The fold's own edits to
  `manual-rail.ts`/`url-state.ts`/`useAppNavigation.ts`/`page.tsx` are the
  serialize-first dependency above, not a disjoint-parallel item.
- **grading-chat** (`src/app/components/grading-chat/*`, the in-flight
  `chatSubmissionIntake.ts`): its surface is `gradingView="chat"` under
  `manualView="grading"` (`page.tsx:827-836`) - a different Manual view, never
  touched here. Disjoint.
- **presentations-pipeline / presentations-template** (`src/lib/presentations/*`,
  `src/app/components/presentations/*`, `office-edit.ts`, `decks/*`): the deck
  engine and the `presentations` Manual view, never touched here. Its W1
  "template picker on the presentations page" is "likely superseded" and lives in
  `PresentationsTab`, not the nav IA. Disjoint from the six nav files.

---

## 11. The `owns` file list (derived, output pasted)

Command (importers of the edited modules):

```
grep -rln --include=*.ts --include=*.tsx -E "components/manual/manual-rail|components/tabs/tab-sections|components/tabs/tab-rails|from \"\.\./\.\./url-state\"|from \"\./url-state\"|home/useAppNavigation" src | sort
```

Output:

```
src/app/components/home/WorkflowsPanel.tsx
src/app/components/home/useAppNavigation.test.ts
src/app/components/home/useAppNavigation.ts
src/app/components/manual/ManualRail.tsx
src/app/components/manual/manual-rail.ts
src/app/components/tabs/tab-rails.test.ts
src/app/components/tabs/topLevelTabs.wiring.test.ts
src/app/components/tasks/tasksUiState.ts
src/app/page.tsx
src/app/url-state.announcements.test.ts
src/app/url-state.test.ts
src/app/url-state.ts
src/lib/rec-view-migration.test.ts
```

Command (tests that read a touched file AS SOURCE TEXT - the ones that redden on a
change they do not import):

```
grep -rln --include=*.test.ts -E "page\.tsx|ManualRail\.tsx|WorkflowsPanel\.tsx|useAppNavigation\.ts|TasksTab\.tsx" src | sort
```

Output (the ones this feature's edits actually reach are starred):

```
  src/app/actions/action-guard-coverage.test.ts
  src/app/components/componentStorageKeys.structure.test.ts        *  (ta-automate-view -> EXPECTED_TA_KEYS)
  src/app/components/courses/page-module-css-classes.test.ts
  src/app/components/home/useAppNavigation.test.ts                 *
  src/app/components/manual/manual-rail.test.ts                    *
  src/app/components/repo-grades/repoGradesSliceA.guards.test.ts
  src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
  src/app/components/tabs/topLevelTabs.wiring.test.ts              *
  src/app/components/tasks/columnOrder.test.ts
  src/app/components/tasks/taskCellAttachments.wiring.test.ts
  src/app/components/tasks/tasksUiState.test.ts
  src/app/components/tasks/tasksUxFixes.wiring.test.ts
  src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts
  src/lib/canvas-credentials.exports.test.ts
  src/lib/course-tasks-view.reorder.test.ts
  src/lib/drafts-nav.test.ts                                       *
  src/lib/knowledge-return.test.ts
  src/lib/module-graph/runtime-import-graph.test.ts               ?  (import-graph; re-run if imports change)
  src/lib/recording-launch.test.ts
  src/lib/visualizer.test.ts
  src/tools/strip-comments-agreement.structure.test.ts            ?  (reddens if a new wiring test names the comment-strip helper literal - use `withoutLineComments`, MEMORY)
```

**Callers to rewire** (each navigates into Workflows/Drafts and must point at the
new home - derived via `grep -rln -E "MESSAGE_DRAFTS_NAV_EVENT|onOpenWorkflow|workflowsView"`):
`page.tsx` (`openWorkflow`, `handleWorkflowScheduled`, the two event listeners,
the refresh effect, the badges), `MessageThreadRow.tsx` (via `drafts-nav.ts`),
`FilesTab.tsx` / `FileList.tsx` / `DraftedGradesTab.tsx` / `AutomationsTabView.tsx`
(all pass `onOpenWorkflow` through to `openWorkflow` - unchanged call sites, but
`openWorkflow`'s BODY changes), `TakeAnnouncementPanel.tsx` (announcements-nav,
unaffected). `src/lib/workflows/run-form-options-cache.ts` matched on the word
"workflowsView" in an unrelated context - confirm it is not the nav param before
assuming it is owned.

---

## 12. Residual register (owner / instrument / step)

Each entry names an owner, an instrument, and the measuring step. A residual not
in `docs/BACKLOG.md` does not exist - the orchestrator files these on filing the
WORKFLOWS-COLLAPSE row.

- **R-1 (fork F1, owner-decision).** Reading (a) new top-level tab vs (b) Tools
  container. Owner: repo owner. Instrument: the decision itself; if (a), a new
  `topLevelTabs.wiring.test.ts` tab-strip pin. Step: orchestrator files the fork
  row, starts reading (b) and W1; applies the owner's answer when it arrives
  (SHAPE 5 - the row's `owns` is this scope's W2 container plumbing).
- **R-2 (collapse the now-single-member `toolsSection`).** After W2, the live
  `ToolsSection` is `"manual"` only; the discriminant is vacuous. This scope
  deliberately does NOT rip it out of `url-state`/`useAppNavigation`/`page.tsx`
  (bounded blast radius; `page.tsx` is at 931). Owner: the next IA change touching
  these files AFTER WORKFLOWS-COLLAPSE (the ppt-design fold lands BEFORE this
  feature - Section 10 - so it is not the candidate). Instrument: `tab-sections.test.ts`
  (the "has no label map for the Tools sections" block already anticipates this
  direction). Step: a follow-up wave that removes `toolsSection` from the Tools
  tab's state, re-pinning the section tests.
- **R-3 (container chip label copy).** "Automate" is a recommendation. Owner: repo
  owner (copy decision). Instrument: `manual-rail.test.ts` label pin. Step: change
  the one label literal + its pin if the owner prefers another word.
- **R-4 (`page.tsx` 1000-line ceiling).** If W2's mounts push `page.tsx` over
  1000, extract (candidate: a `ToolsManualPanel` wrapper for the
  `toolsSection==="manual"` inner block, mirroring `WorkflowsPanel`'s former role).
  Owner: W2 implementer. Instrument: `src/file-size-ceiling.structure.test.ts`
  measured with `@(Get-Content src/app/page.tsx).Count` in the wave gate. Step:
  extract in the same wave if it crosses; never raise `maxLines`.
- **R-5 (owner-walks OW-1/OW-2/OW-3).** Owner: repo owner. Instrument: the running
  app (no component renders under vitest). Step: the three named walks in Section
  9. These are not deletions - they are the verification this environment cannot
  perform, recorded so they are not mistaken for covered.

---

## 13. What this scope does NOT change (behaviour-preservation guardrails)

- `ArtifactDesignTab`, `WorkflowsTab`, `AutomationsTabView`, `MessageDraftsTab`,
  `DraftedGradesTab` - re-parented, never edited. Any diff inside them is a
  finding.
- `manualView="grading"` and every other Manual view - untouched. `ppt-design`
  is NO LONGER a `manualView` post-fold (it is `PresentationsView="ppt-design"`,
  rendered in the presentations branch `page.tsx:678-685`); this feature must not
  touch the presentations branch or `ppt-design` at all - the fold owns it
  (Section 10).
- The `drafts-view:grades` grading pointer and Tools > Grading > Drafted Grades -
  untouched (AC-W1-6).
- `MESSAGE_DRAFTS_NAV_EVENT` / `ANNOUNCEMENTS_NAV_EVENT` / `RECORDING_LAUNCH_EVENT`
  / `KNOWLEDGE_RETURN_EVENT` names and shapes - unchanged; only the drafts
  listener's destination moves.
- The URL param NAMES of every surviving view - unchanged (`manualView`,
  `contentView`, `gradingView`, `presentationsView`, `announcementsView`,
  `tasksView`, `librarySection`, `kbInstitution`, `kbPage`). `workflowsView` is
  retired by ALIAS only.
```
