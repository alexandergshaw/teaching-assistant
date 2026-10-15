# Fold PowerPoint Design into Presentations as a tab - acceptance criteria + scope

Status: SCOPE ONLY. Written 2026-10-08 against HEAD `1b818a3a` (`git rev-parse
--short HEAD`). No production code and no test code written. Every quantity names
the command that produced it; every `file:line` cited was opened while writing
this.

Owner request (direct chat, 2026-10-08): "powerpoint design should go in
presentations" + clarification "tabs". Read as: the **PowerPoint Design** view
(`ppt-design`, a top-level Tools/Manual rail chip) becomes a **third tab
(sub-view) UNDER Presentations**, beside Slide Deck Creation and Slide Deck
Pipeline, and **leaves the top-level Tools rail**.

---

## 0. Executive summary - READ THIS FIRST

**What the fold delivers.** The PowerPoint Design surface becomes
`presentationsView === "ppt-design"`, the third child of the Presentations inner
nav, labelled "PowerPoint Design". The Tools rail drops from 9 Manual chips to 8;
Presentations' child strip goes from 2 tabs to 3 (Slide Deck Creation / Slide
Deck Pipeline / PowerPoint Design). **This is a RE-PARENT, not a rewrite** - the
entire `ppt-design` component tree (`src/app/components/ppt-design/`, the
template-fill engine, `TemplateSelector.tsx`, every hook) is untouched; only the
navigation wiring and the mount site in `page.tsx` move.

**What is user-visible.** The owner reaches the exact same PowerPoint Design
builder - template upload, deck generation, download, save-to-Files - by clicking
the "PowerPoint Design" tab inside Presentations instead of a separate top-level
Tools chip. A returning user whose last position was PowerPoint Design (persisted
as `ta-manual-view=ppt-design`, or an old `?manualView=ppt-design` link/bookmark)
lands on Presentations with the PowerPoint Design tab active, not on a dead view.

**What the fold SUPERSEDES.** This request is fork option **A2** of
`docs/presentations-template-ooxml-scope.md`'s R-SURFACE fork (that scope's
section 0 names it: "(A2) fold PPT Design into Presentations so you reach the
existing control there"). Folding `ppt-design` in makes the uploaded-`.pptx`
template-fill engine reachable on the Presentations page **through the PowerPoint
Design tab**. Therefore the template-A scope's **W1** - a separate
`TemplateFilePicker.tsx` added to the Slide Deck sub-view
(`docs/presentations-template-ooxml-scope.md:460-493`) - is **rendered
unnecessary**: the owner reaches template-fill via the new tab, not a duplicated
picker. That scope already anticipated this collapse
(`docs/presentations-template-ooxml-scope.md:540-544`: "If that lands... W1 (A1)
becomes redundant - this is exactly fork option A2"). The template-A work that
**remains independent of the fold**: **W0** (the capped-read security fix on the
untrusted `.pptx` upload, R-CAP) and **W2** (the T3 OOXML slide-clone for
over-length decks). Neither touches a fold file.

**What the fold does NOT change.** No LLM path, no persisted data shape, no
Supabase table, no deck-generation behaviour. It is pure navigation IA plus one
retired-value migration. There is no new user-reachable capability, so there is
no leverage claim to make (section 1, trigger recorded).

**The honest ceiling.** `docs/loop/this-repo.md:132-139,262-264` and `AGENTS.md`:
no component is rendered by any test here. Every claim in this scope about what
paints on screen, what a tab strip shows, or focus/keyboard behaviour is a
reading claim or an owner-walk. The machine instruments below pin the
registration, the migration decision, and the source-text render wiring - not
that any pane paints.

---

## 1. Acceptance criteria (owner words -> checkable)

Owner's words: "powerpoint design should go in presentations" + "tabs". Nouns:
POWERPOINT DESIGN (the `ppt-design` view), GO IN PRESENTATIONS (re-parent under
`manualView === "presentations"`), TABS (as a sibling sub-view in the
Presentations inner nav).

**Leverage claim: NONE - trigger recorded.** Per `docs/loop/seats.md` AC brief
("On a bug fix, a refactor, a doc correction or an owner verification there is no
claim to make; record that as the fired trigger") and `docs/loop/leverage.md`
(failure mode: dressing click-cost as integration). This is a navigation
re-parent of an already-reachable surface - the PowerPoint Design builder, the
template-fill engine and every advantage they already carry are unchanged and
already shipped. The only user-facing delta is **click-cost / discoverability**:
PowerPoint Design and the two Presentations deck builders now sit in one child
strip instead of two separate top-level chips. Stated as click-cost explicitly,
never as a new mechanism. No removal test is owed (`leverage.md:179-183`: a
reorg's advantage is navigation, which nothing in this node-env suite renders).

| # | Criterion | How it is checked | Instrument |
|---|---|---|---|
| AC-1 | `presentationsView` accepts a third member `"ppt-design"`; `isPresentationsView("ppt-design")` is true; the member list is derived from the presence record, not hand-restated. | `PRESENTATIONS_VIEWS` contains `"ppt-design"`; `isPresentationsView("ppt-design") === true`. | I-UNION (machine) |
| AC-2 | The Presentations inner nav shows exactly three destinations in order: Slide Deck Creation, Slide Deck Pipeline, PowerPoint Design. | `getInnerDestinations("presentations")` maps to `["presentations-slide-deck","presentations-pipeline","presentations-ppt-design"]` with labels `["Slide Deck Creation","Slide Deck Pipeline","PowerPoint Design"]`. | I-INNER (machine) |
| AC-3 | `ppt-design` is GONE from the top-level Tools rail: absent from `MANUAL_VIEW_ORDER`, `MANUAL_VIEW_LABELS`, the top-level `destinations` groups, and `isManualViewType("ppt-design")` is false. | The removal-block assertions (section 6), modelled on the `course-intel`/`repo-grades` removal blocks. | I-RAILGONE (machine) |
| AC-4 | The PowerPoint Design surface renders under `manualView === "presentations"` when `presentationsView === "ppt-design"`, and is NO LONGER rendered by a top-level `manualView === "ppt-design"` branch. | Source-text over `page.tsx`: the presentations branch renders `PowerPointDesignTab` gated on `presentationsView === "ppt-design"`; no `{activeTab === ... manualView === "ppt-design"}` branch remains; exactly one `<PowerPointDesignTab` mount site. | I-MOUNT (machine, source-text) + owner-walk (render) |
| AC-5 | A returning user with `ta-manual-view = "ppt-design"` (or `ta-active-tab = "ppt-design"`) lands on `manualView === "presentations"` with `presentationsView === "ppt-design"`, not on Build Courses and not on a blank pane. | The pure migration leaf resolves `"ppt-design"` to `{ manualView: "presentations", presentationsView: "ppt-design" }`; the `useAppNavigation` initializers consult it. | I-MIGRATE-LEAF (machine) + I-NAV-INIT (machine, source-text) |
| AC-6 | An old `?manualView=ppt-design` URL (link or bookmark) resolves to `manualView=presentations&presentationsView=ppt-design`, and the first URL sync rewrites the address bar to that canonical form. | `parseUrlState("?tab=manual&manualView=ppt-design")` returns `manualView: "presentations", presentationsView: "ppt-design"`; `buildUrlSearch` of that round-trips to the canonical string. | I-URL-MIGRATE (machine) |
| AC-7 | A persisted/legacy destination id `"ppt-design"` resolves to Presentations + the PowerPoint Design sub-view (NOT a fall-back to the current view - unlike `course-intel`, this is a re-parent, so the surface still exists). The new id `"presentations-ppt-design"` round-trips to the same state. | `resolveStateFromDestinationId("ppt-design", ...)` -> `{ manualView: "presentations", presentationsView: "ppt-design" }`; `resolveStateFromDestinationId("presentations-ppt-design", ...)` the same; `getActiveDestinationId("presentations", ..., "ppt-design")` -> `"presentations-ppt-design"`. | I-DESTID (machine) |
| AC-8 | The PowerPoint Design functionality is preserved intact: the component, its template-fill engine and its persistence are not edited by the fold. | `git status --short` shows no edit to `src/app/components/ppt-design/**`; the only reference change to `PowerPointDesignTab.tsx` is its mount site, not its implementation. | I-NOEDIT (machine, tree) |

---

## 2. Ground truth (quoted code)

### 2.1 The Tools rail and the `ppt-design` top-level chip (what leaves)

`ManualViewType` is a nine-member union including `"ppt-design"`
(`src/app/components/manual/manual-rail.ts:14-23`). `MANUAL_VIEW_ORDER` lists the
nine in display order with `"ppt-design"` at index 4
(`manual-rail.ts:215-225`); `MANUAL_VIEW_LABELS["ppt-design"] = "PowerPoint
Design"` (`:233`). The top-level `destinations` array holds a single-destination
group `{ id: "ppt-design", label: "PowerPoint Design", description: "Create
presentation slides" }` (`:154-158`). `getActiveDestinationId` has a branch
`else if (manualView === "ppt-design") return "ppt-design"` (`:310-311`).
`resolveStateFromDestinationId` has `if (id === "ppt-design") return
"ppt-design"` inside its `manualView` IIFE (`:391`). `getInnerDestinations` and
`getInnerNavAriaLabel` return null for `ppt-design` (it is a single-destination
view, `:267-273` comment; `INNER_NAV` at `:259-265` has no `ppt-design` key).

The flattened Tools rail is built from `MANUAL_VIEW_ORDER` + `WORKFLOWS_VIEW_ORDER`
(`src/app/components/tabs/tab-rails.ts`, `@(Get-Content).Count` = 196). The chip
`"manual:ppt-design"` is item 5 of 12 (`tab-rails.test.ts:54-68`).

### 2.2 The Presentations inner nav (what gains a tab)

`PresentationsView = "slide-deck" | "pipeline"` is a two-member presence-record
union (`manual-rail.ts:55-68`): `PRESENTATIONS_VIEW_PRESENCE` (`:57-60`),
`PRESENTATIONS_VIEWS` derived from its keys (`:61-63`), `isPresentationsView`
(`:66-68`). The "Presentations" destinations group holds two entries,
`presentations-slide-deck` and `presentations-pipeline` (`:173-179`).
`INNER_NAV.presentations = { groupName: "Presentations", ariaLabel:
"Presentations views" }` (`:263`), so `getInnerDestinations("presentations")`
returns that group's destinations and `getInnerNavAriaLabel("presentations")`
returns "Presentations views". `getActiveDestinationId`'s presentations arm:
`presentationsView === "pipeline" ? "presentations-pipeline" :
"presentations-slide-deck"` (`:314-315`). `resolveStateFromDestinationId`'s
presentationsView IIFE maps `presentations-pipeline` -> `pipeline`,
`presentations-slide-deck` -> `slide-deck` (`:425-429`).

### 2.3 The mount in page.tsx (what moves)

`PowerPointDesignTab` is imported at `src/app/page.tsx:21` (which re-exports
`./components/ppt-design` via the one-line
`src/app/components/PowerPointDesignTab.tsx`). Two mount sites exist today:

- The top-level PowerPoint Design branch, `page.tsx:663-667`:
  `{manualView === "ppt-design" && (<TabShell><PowerPointDesignTab /></TabShell>)}`.
- The Presentations branch, `page.tsx:684-688`:
  `{manualView === "presentations" && (<TabShell>{presentationsView === "pipeline" ? <PipelineTab /> : <PresentationsTab />}</TabShell>)}`.

The fold DELETES the first and extends the ternary in the second.

### 2.4 The URL + localStorage nav chain (what the migration wires)

- `url-state.ts` (`@(Get-Content).Count` = 507): `presentationsView` is a full
  URL param - `normalizePresentationsView` (`:234-236`, reuses
  `isPresentationsView`), parsed at `:429`, emitted only under
  `manualView === "presentations"` and when non-default at `:479-481`.
  `normalizeManualView` (`:198-200`) reuses `isManualViewType`, so a value it
  rejects falls back to `"course-planning"`. `resolveGradingPointer` (`:374-389`)
  is the proven shape for "a retired manualView value that maps to
  manualView+subview", wired into `parseUrlState` at `:409,424,428`.
- `useAppNavigation.ts` (`@(Get-Content).Count` = 826): the `manualView`
  initializer (`:196-281`) handles the URL branch via `resolveGradingPointer`
  (`:232-239`), the stored `ta-manual-view` via `isManualViewType` (`:253,268`),
  and the legacy `ta-active-tab === "ppt-design"` via `if (saved ===
  "ppt-design") return "ppt-design"` (`:274`). The `presentationsView`
  initializer (`:433-443`) is a URL-branch-then-stored-value shape gated on
  `manualView === "presentations"`, with `PRESENTATIONS_VIEW_KEY =
  "ta-presentations-view"` (`:61`). The popstate handler restores
  `presentationsView` under `parsed.manualView === "presentations"`
  (`:764`); the URL-sync effect lists `presentationsView` in its deps (`:695`).

### 2.5 The retired-value precedents

- `RETIRED_GRADING_POINTERS` (`manual-rail.ts:336-356`): a `Record<string,
  GradingPointerTarget>` keyed by the RAW stored/URL value, each giving
  `{ manualView, gradingView }`. `repo-grades` -> `{ grading, repos }` (`:343`).
  Consumed by `resolveStateFromDestinationId` (`:374-384`), `resolveGradingPointer`
  (`url-state.ts:374-389`), and the three `useAppNavigation` initializers.
- `src/lib/rec-view-migration.ts` (`@(Get-Content).Count` = 32): a PURE LEAF (no
  React, nothing server-only, node-env testable) exporting `legacyRecViewRedirect(
  storedRecView, manualView)` -> `{ manualView: "announcements", announcementsView:
  "recording" } | null`. Its test (`rec-view-migration.test.ts`, 19 lines)
  asserts the mapping and the null cases, and that the result passes
  `isManualViewType` / `isAnnouncementsView`.

---

## 3. The fold mechanism (SHAPE decisions)

### 3.1 Union / presence / label (manual-rail.ts)

Add `"ppt-design"` to `PresentationsView` (`:55`) and to
`PRESENTATIONS_VIEW_PRESENCE` (`:57-60`) - the derived `PRESENTATIONS_VIEWS`,
`PRESENTATIONS_VIEW_SET` and `isPresentationsView` then cover it with no
hand-restated second list (the construction `manual-rail.ts:61-68` already
guarantees this). Add a third destination to the "Presentations" group
(`:173-179`): `{ id: "presentations-ppt-design", label: "PowerPoint Design",
description: "Create presentation slides" }` (reuse the current `ppt-design`
label and description verbatim, `:156`). **`INNER_NAV.presentations` is
unchanged** - the ariaLabel "Presentations views" names the strip, not the count,
so a third tab needs no ariaLabel change (the parity/distinctness tests at
`manual-rail.test.ts:282-299` loop `MANUAL_VIEW_ORDER` and still hold).

### 3.2 Remove the top-level chip (manual-rail.ts)

Remove `"ppt-design"` from the `ManualViewType` union (`:19`), from
`MANUAL_VIEW_ORDER` (`:220`), from `MANUAL_VIEW_LABELS` (`:233`), and delete the
top-level single-destination group (`:154-158`). Remove the `getActiveDestinationId`
arm (`:310-311`). After removal `isManualViewType("ppt-design")` is false (it is
derived from `MANUAL_VIEW_ORDER` at `:245-249`), matching the `course-intel`/
`repo-grades`/`live-class` precedents. `MANUAL_VIEW_ORDER` becomes eight entries;
the Tools rail becomes 8 + 3 = 11 chips.

### 3.3 getActiveDestinationId - the presentations arm gains ppt-design

Extend the presentations arm (`:314-315`) to a three-way:
`presentationsView === "ppt-design" ? "presentations-ppt-design" :
presentationsView === "pipeline" ? "presentations-pipeline" :
"presentations-slide-deck"`.

### 3.4 resolveStateFromDestinationId - two ids resolve to the sub-view

- The new id `"presentations-ppt-design"` already enters the `manualView`
  IIFE's `id.startsWith("presentations-")` branch (`:393`) -> `manualView =
  "presentations"`. Add a `presentationsView` IIFE arm (`:425-429`): `if (id ===
  "presentations-ppt-design") return "ppt-design"`.
- The LEGACY raw id `"ppt-design"` (`:391`, currently `return "ppt-design"`):
  **retire it to the pointer path.** It must resolve to `manualView =
  "presentations"` AND `presentationsView = "ppt-design"` - NOT the course-intel
  "fall back to current" shape, because the surface still exists under a new
  parent. Route it through the migration leaf (section 3.6): if
  `legacyPptDesignView(id)` is non-null, set `manualView` and `presentationsView`
  from it. Mirror the `RETIRED_GRADING_POINTERS` alias branch
  (`:374-384`) in placement.

### 3.5 The mount (page.tsx)

Delete the top-level branch (`:663-667`). Extend the presentations ternary
(`:686`) to a three-way: `presentationsView === "ppt-design" ?
<PowerPointDesignTab /> : presentationsView === "pipeline" ? <PipelineTab /> :
<PresentationsTab />`. The import at `:21` stays (now consumed inside the
presentations branch). **Net line change to `page.tsx` is slightly negative**
(delete a 5-line block, add one ternary arm), so the 931-line file moves away
from, not toward, the 1000 ceiling. The `topLevelTabs.wiring.test.ts:345-356`
loop requires a `manualView === "<view>"` branch for every `MANUAL_VIEW_ORDER`
member; since `ppt-design` leaves that list, removing its branch keeps that test
green, and the `manualView === "presentations"` branch it still requires is
untouched.

### 3.6 The migration (D26 "a view param is a presentation over existing params")

**DECISION: RETIRE `manualView = "ppt-design"`, do not keep it as an alias.** The
canonical state is `manualView=presentations` + `presentationsView=ppt-design`;
the raw value `"ppt-design"` is a legacy pointer, never re-emitted. This mirrors
`repo-grades` exactly (rejected by `isManualViewType`, resolved via a pointer,
rewritten to canonical on first sync).

**Mechanism: a new pure leaf `src/lib/ppt-view-migration.ts`** (mirroring
`rec-view-migration.ts`), exporting a single decision function:

```
export interface LegacyPptDesignRedirect {
  manualView: "presentations";
  presentationsView: "ppt-design";
}
export function legacyPptDesignView(raw: string | null): LegacyPptDesignRedirect | null;
// returns the redirect only when raw === "ppt-design", else null
```

Pure, node-env testable, no React, no server import. Type-imports are not needed
(the literals are self-contained), so there is NO import cycle with
`manual-rail.ts`. Wired at every channel the retired value can arrive through:

1. `url-state.ts` `parseUrlState` - after reading `rawManualView`, if
   `legacyPptDesignView(rawManualView)` is non-null, set `manualView` and
   `presentationsView` from it (place beside the `gradingPointer` handling at
   `:424,429`). Also force `toolsSection: "manual"` is unnecessary here -
   unlike the Drafts>Grades pointer, `ppt-design` already originated in the
   manual family, so no cross-family override is needed (contrast
   `manual-rail.ts:347-355`).
2. `manual-rail.ts` `resolveStateFromDestinationId` - the legacy id branch
   (section 3.4).
3. `useAppNavigation.ts` `manualView` initializer - the URL branch (`:221-240`)
   and the stored-value path: replace the `ta-active-tab === "ppt-design"` arm
   (`:274`) with a redirect to `"presentations"`, and add a `ta-manual-view ===
   "ppt-design"` check BEFORE `isManualViewType` (mirroring the `repo-grades`
   check at `:260-262`) returning `"presentations"`.
4. `useAppNavigation.ts` `presentationsView` initializer (`:433-443`) - needs
   **BOTH a URL sub-case AND a stored sub-case**, exactly like the `gradingView`
   initializer (`:381-416`), which handles a migrated value in its URL branch
   (`resolveGradingPointer` at `:390-396`) IN ADDITION to the stored arm
   (`:399-403`). The failure this guards (the checker's blocker): on a cold-load
   bookmark `?manualView=ppt-design`, channel 3 resolves the `manualView` closure
   to `"presentations"`, so the URL-branch condition at `:439`
   (`manualView === "presentations"`) is TRUE, and `:440` returns
   `normalizePresentationsView(urlParams.get("presentationsView"))` =
   `normalizePresentationsView(null)` = `"slide-deck"` BEFORE any stored-arm check
   runs - the user lands on Slide Deck Creation, not PowerPoint Design, and it
   ships silently green because nothing renders the hook. So:
   - **URL sub-case** - inside the URL branch (`:439-441`), BEFORE the
     `normalizePresentationsView(urlParams.get("presentationsView"))` return, add:
     `if (legacyPptDesignView(urlParams.get("manualView"))) return "ppt-design";`
   - **Stored sub-case** - BEFORE the stored fallback return (`:442`,
     `return normalizePresentationsView(localStorage.getItem(PRESENTATIONS_VIEW_KEY))`),
     add: `if (legacyPptDesignView(localStorage.getItem(MANUAL_VIEW_KEY))) return "ppt-design";`
     (mirrors the `repo-grades -> "repos"` stored arm at `:399-403`; a user who was
     on the old top-level ppt-design has no `ta-presentations-view` value, so the
     bare fallback would otherwise return `"slide-deck"`).

   Both sub-cases are required: the URL sub-case fixes the cold-load bookmark
   (AC-6 live), the stored sub-case fixes the returning user with no URL
   (`ta-manual-view=ppt-design`, AC-5 live). A channel-4 wired for only one is the
   "lands on the wrong tab from one entry point" bug.

**Why a leaf and not a `PresentationsPointer` table in manual-rail.ts.** Both are
defensible; the leaf is chosen because (a) the owner request names the
`rec-view-migration.ts` precedent, (b) a single raw value (`"ppt-design"`) does
not need a keyed table, and (c) a leaf is independently unit-testable without
touching the manual-rail module graph. The checker should confirm the leaf is
reached from all four channels above (a migration wired at only some channels is
the classic "lands on a dead view from one entry point" bug).

**One pre-existing wrinkle, flagged not fixed (R-TABALIAS).** `url-state.ts:120-122`
handles the OLD TOP-LEVEL tab value `?tab=ppt-design` -> `DEFAULT_DESTINATION`
(Manual tab, which defaults to `course-planning`). This is a different value from
the `manualView=ppt-design` param and ALREADY does not preserve the PowerPoint
Design surface (it predates this fold). `resolveTabDestination` returns a
`TabDestination` that carries no `manualView`/`presentationsView`, so it cannot
express "land on presentations/ppt-design" without a wider change. Leave `:120-122`
as-is; record R-TABALIAS. The common returning-user paths (`ta-manual-view`,
`?manualView=`) ARE migrated.

---

## 4. Wave plan + write set

One wave. The fold is a single atomic IA change: the union, the rail removal, the
mount, and the migration must land together or an intermediate state ships a dead
chip or a blank pane. Line counts: `@(Get-Content <f>).Count` (PowerShell,
2026-10-08, HEAD `1b818a3a`), equal to `wc -l` on this checkout
(`docs/loop/this-repo.md:184-195`).

### Production write set

| File | Now | Edit |
|---|---|---|
| `src/app/components/manual/manual-rail.ts` | 461 | Add `ppt-design` to `PresentationsView` + presence (3.1); add `presentations-ppt-design` destination (3.1); remove `ppt-design` from `ManualViewType`/`MANUAL_VIEW_ORDER`/`MANUAL_VIEW_LABELS`/top-level `destinations`/`getActiveDestinationId` (3.2); extend presentations arm of `getActiveDestinationId` (3.3); retire the legacy id + add the `presentations-ppt-design` presentationsView arm in `resolveStateFromDestinationId` (3.4). Est. net +10 to +20 lines (safe vs 1000). |
| `src/app/url-state.ts` | 507 | Wire `legacyPptDesignView` into `parseUrlState` (3.6.1). Est. +6 lines. |
| `src/app/page.tsx` | 931 | Delete top-level ppt-design branch; extend presentations ternary (3.5). Est. net -3 lines. |
| `src/app/components/home/useAppNavigation.ts` | 826 | Remove `"ppt-design"` from the local `ManualView` type alias (`:47`); wire `legacyPptDesignView` into the `manualView` and `presentationsView` initializers and replace the `ta-active-tab === "ppt-design"` arm (3.6.3-4). Est. +8 lines. |
| `src/lib/ppt-view-migration.ts` | NEW | The pure migration leaf (3.6). ~25 lines. |

**The caller of the new export is in the same wave** (`seats.md` non-negotiable):
`legacyPptDesignView` is called from `url-state.ts`, `manual-rail.ts` and
`useAppNavigation.ts`, all in this wave - it cannot ship dead.

### Not edited, confirmed by tree (AC-8)

`src/app/components/ppt-design/**` (the whole surface, incl. `index.tsx` 826,
`TemplateSelector.tsx`, the engine files), `src/app/components/PowerPointDesignTab.tsx`
(the 1-line re-export), `src/app/components/presentations/index.tsx`,
`ArtifactCard.tsx`, `panel-logic.ts`, `pipeline/**`. `git status --short` must
show none of these touched.

### Gate (one wave, PowerShell)

Frozen/new tests (section 5) via the wrapper, never raw `vitest run a b`
(`docs/loop/this-repo.md:52-66`; `test-paths` memory):

```
npm run test:paths `
  src/app/components/manual/manual-rail.test.ts `
  src/app/components/tabs/tab-rails.test.ts `
  src/app/components/tabs/topLevelTabs.wiring.test.ts `
  src/app/url-state.test.ts `
  src/app/url-state.ppt-design.test.ts `
  src/app/components/home/useAppNavigation.test.ts `
  src/lib/ppt-view-migration.test.ts
```

Plus the unconditional canaries (`docs/loop/this-repo.md:42-49`):
`src/file-size-ceiling.structure.test.ts`, `src/lib/no-emojis.test.ts`,
`src/source-bytes.structure.test.ts`; then `npx tsc --noEmit`, `npm run lint`
(exit 0, no NEW warning in the files this wave writes - measured against the same
command before the change, `docs/loop/this-repo.md:26,104-108`), `npm run build`
compile-line only (`docs/loop/this-repo.md:69-96`); and `git status --short`
against the exact write set with no `.claude/worktrees` copy edited
(`stale worktree shadows Glob` memory; `docs/loop/this-repo.md:268-275`).

**Ceiling note:** `src/app/url-state.test.ts` is EXACTLY 1000 lines
(`@(Get-Content).Count`), at `LIMIT = 1000`
(`src/file-size-ceiling.structure.test.ts:41`). Adding one line fails the ceiling.
Therefore **ALL new `ppt-design` url-state assertions** (the URL migration
I-URL-MIGRATE AND the new presentationsView `ppt-design` cases) go in a SIBLING
file `src/app/url-state.ppt-design.test.ts`, and `url-state.test.ts` takes
**ZERO line-adding edits** (section 5). The precedent is
`src/app/url-state.announcements.test.ts`, which already splits url-state coverage
this way (`no-cross-test-file imports` memory: duplicate the small `DEFAULT_STATE`
fixture, never import it from `url-state.test.ts`). Measure after any edit with
`@(Get-Content src/app/url-state.test.ts).Count` and confirm `<= 1000`.

### Reversibility

Fully reversible: revert the four edited files to HEAD and delete the leaf +
sibling test. No migration SQL, no persisted-shape change (`presentationsView`
already persists under `ta-presentations-view`; the fold only adds an accepted
value). The retired-pointer removal is observable on revert (an old
`?manualView=ppt-design` link would stop migrating), not silent.

---

## 5. Frozen tests to re-freeze (and the one new file)

Every pin below reads source or a pure value - no render. Each names the file,
the current pin, and the required change.

**`src/app/components/manual/manual-rail.test.ts`** (679 lines, room):
- `:72-74` `getActiveDestinationId("ppt-design", ...)` -> `"ppt-design"`: DELETE
  (ppt-design is no longer a `ManualViewType`; the call no longer type-checks).
- `:178` `allDests` `toContain("ppt-design")`: CHANGE to `"presentations-ppt-design"`
  (the destination id moved into the Presentations group).
- `:203-213` `MANUAL_VIEW_ORDER` `.toEqual([...])`: REMOVE `"ppt-design"`; the
  array is now eight entries. Update the "nine subtabs" wording to eight.
- `:269-273` single-view `getInnerDestinations` block: REMOVE the
  `getInnerDestinations("ppt-design")).toBeNull()` line (ppt-design is no longer a
  top-level view; it is an inner destination of presentations).
- `:388-390` comment naming `ppt-design` among single-destination views: update.
- `:413-418` the presentations inner-destinations `.toEqual`: CHANGE to three
  entries `["presentations-slide-deck","presentations-pipeline","presentations-ppt-design"]`
  with labels `[...,"PowerPoint Design"]`.
- ADD a `ppt-design` reachability test in the presentations block: a new
  `presentationsView === "ppt-design"` reaches `"presentations-ppt-design"` via
  `getActiveDestinationId` and `resolveStateFromDestinationId("presentations-ppt-design",...)`
  returns `{ manualView: "presentations", presentationsView: "ppt-design" }`
  (AC-2, AC-7).
- ADD a "ppt-design top-level removal" block modelled on the `course-intel`
  removal block (`:549-578`) BUT with the re-parent twist (AC-3, AC-7): gone from
  `MANUAL_VIEW_ORDER`/`MANUAL_VIEW_LABELS`/`destinations`; `isManualViewType("ppt-design")
  === false`; and crucially the legacy id `"ppt-design"` resolves to
  `{ presentations, ppt-design }` (NOT fall back to the current view - that is the
  difference from `course-intel`, which was deleted; this surface MOVED).

**`src/app/components/tabs/tab-rails.test.ts`** (385 lines, room):
- `:54-68` `TOOLS_RAIL_ITEMS.map(id).toEqual([...])`: REMOVE `"manual:ppt-design"`;
  change `.toHaveLength(12)` -> `11`. Update the "nine Manual views" wording to
  eight.
- `:68,93,106,388` the "twelve"/`toHaveLength(12)` assertions and comments: ->
  eleven / 11. (`:93` is derived `MANUAL_VIEW_ORDER.length + WORKFLOWS_VIEW_ORDER.length`
  and auto-adjusts, but its sibling literal pins at `:68`/`:388` must change.)

**`src/app/components/tabs/topLevelTabs.wiring.test.ts`** (739 lines, room):
- `:388` `TOOLS_RAIL_ITEMS.toHaveLength(12)` -> `11`; update the "Nine Manual +
  three Workflows" comment (`:385-387`) to eight.
- `:345-356` (loops `MANUAL_VIEW_ORDER` requiring a `manualView === "<view>"`
  branch in page.tsx): NO literal change - it auto-adjusts when `ppt-design`
  leaves the list. Confirm green after `page.tsx` drops the branch.

**`src/app/url-state.test.ts`** (EXACTLY 1000 lines = AT CEILING - make **ZERO
line-adding edits**; every new `ppt-design` url-state assertion goes in the
sibling file below):
- `:984-997` presentationsView block: LEAVE AS-IS. Do NOT add a `ppt-design`
  normaliser case or round-trip here - that coverage lives in the sibling
  (adding even one line fails `file-size-ceiling.structure.test.ts:41`,
  `LIMIT = 1000`). If the implementer must touch this block at all, any edit must
  be net-neutral or net-negative in line count; measure after with
  `@(Get-Content src/app/url-state.test.ts).Count` and confirm `<= 1000`.
- `:73-74` `normalizeActiveTab("ppt-design") === "manual"`: UNCHANGED - this is
  the legacy TOP-LEVEL tab value (R-TABALIAS), a different value from the
  `manualView` param; it stays resolving to the Manual tab.

**`src/app/url-state.ppt-design.test.ts`** (NEW sibling - holds ALL new
`ppt-design` url-state coverage; I-URL-MIGRATE, AC-6, plus the presentationsView
`ppt-design` cases that could not grow `url-state.test.ts`):
- `normalizePresentationsView("ppt-design") === "ppt-design"` (the new member
  through the normaliser).
- A round-trip of `presentationsView: "ppt-design"` under
  `manualView: "presentations"`:
  `buildUrlSearch` -> `"?tab=manual&manualView=presentations&presentationsView=ppt-design"`,
  and `parseUrlState` of that returns `presentationsView: "ppt-design"`; dropped
  elsewhere (not emitted when `manualView !== "presentations"`).
- `parseUrlState("?tab=manual&manualView=ppt-design")` returns
  `manualView: "presentations", presentationsView: "ppt-design"` (and
  `toolsSection: "manual"`). Modelled on the `repo-grades` migration block
  (`url-state.test.ts:876-894`).
- `buildUrlSearch` of that parsed state round-trips to
  `"?tab=manual&manualView=presentations&presentationsView=ppt-design"` (the
  canonical rewrite - an alias is a redirect, not a synonym).
- The retired value never leaks for a non-manual tab
  (`parseUrlState("?tab=courses&manualView=ppt-design").tab === "courses"`).
- Duplicate the small `DEFAULT_STATE` fixture locally (never import from
  `url-state.test.ts` - `no-cross-test-file imports` memory).

**`src/app/components/home/useAppNavigation.test.ts`** (507 lines, room -
I-NAV-INIT, AC-5):
- The positional guards at `:363-370` and `:388-397,483-484` pin the
  `presentationsView` useState block ending at `const [focusCourseId`. The
  migration logic goes INSIDE the existing `manualView` and `presentationsView`
  initializers (not a new useState), so these positional guards are NOT churned -
  confirm the block boundaries still resolve.
- ADD a source-text test: the `manualView` initializer contains a
  `ppt-design` redirect to `"presentations"` (and the `ta-active-tab ===
  "ppt-design"` arm no longer returns `"ppt-design"`); the `presentationsView`
  initializer returns `"ppt-design"` for the migrated parent. Pin the wiring
  (`legacyPptDesignView(` reached), mirroring the existing `resolveGradingPointer`
  pins.

**`src/lib/ppt-view-migration.test.ts`** (NEW pure leaf - I-MIGRATE-LEAF, AC-5):
modelled on `rec-view-migration.test.ts` (19 lines): `legacyPptDesignView("ppt-design")`
equals `{ manualView: "presentations", presentationsView: "ppt-design" }`;
`isPresentationsView(result.presentationsView) === true`;
`isManualViewType(result.manualView) === true`; null for `"presentations"`,
`"pipeline"`, `""`, `null`, and any non-`ppt-design` value.

---

## 6. Sequencing (the presentations cluster)

Four presentations-area items are in flight. This section states what must
serialize, what may parallelize, and what the fold SUPERSEDES. Disjointness is by
exact path; intersect with `sort | uniq -d` at build time and paste the output
(`docs/loop/parallel-disjointness.md`; empty is the only pass).

### The fold's file set
`manual-rail.ts`, `url-state.ts`, `page.tsx`, `useAppNavigation.ts`,
`ppt-view-migration.ts` (new); tests `manual-rail.test.ts`, `tab-rails.test.ts`,
`topLevelTabs.wiring.test.ts`, `url-state.test.ts`, `url-state.ppt-design.test.ts`
(new), `useAppNavigation.test.ts`, `ppt-view-migration.test.ts` (new).

### 6.1 PRESENTATIONS-PIPELINE regen sub-view (reading B, scoped+revised) - DISJOINT, parallel OK
`docs/presentations-pipeline-regen-subview-scope.md` chose reading **B2: a
full-screen mode INSIDE `PipelineTab`, NOT a third `presentationsView**`
(`:46-52`), explicitly to AVOID the IA files: "AVOIDS editing any of the IA files
the Tools reorg touched (`manual-rail.ts`, `url-state.ts`, `page.tsx`,
`useAppNavigation.ts`)" (`:51-52`), and "Neither wave needs to touch
`manual-rail.ts` + `url-state.ts` + `page.tsx` + `useAppNavigation.ts`" (`:522`).
Its write set is `pipeline/panel-logic.ts`, `pipeline/panel-logic.test.ts`,
`pipeline/SlideRegenView.tsx` (new), `pipeline/PipelineTab.tsx` (`:448-525`).
**Intersection with the fold's set: EMPTY.** They parallelize. The only nominal
overlap the pipeline-regen scope flags - `manual-rail.test.ts` pinning
`presentations-pipeline` (`:184-186`) - is a READ for its checker, not an edit;
the fold edits `manual-rail.test.ts` but keeps `presentations-pipeline` present
(it adds a third tab, does not remove the second). No conflict.

### 6.2 PRESENTATIONS-TEMPLATE Reading A (OOXML) - W1 SUPERSEDED, W0/W2 independent
`docs/presentations-template-ooxml-scope.md`:
- **W1 (A1): the fold SUPERSEDES it.** W1 adds a separate `TemplateFilePicker.tsx`
  to the Slide Deck sub-view to reach the template-fill engine
  (`:460-493`). The fold delivers A2 - the owner reaches the SAME engine via the
  new PowerPoint Design tab. Building both ships two controls for one capability.
  **Recommendation: do NOT build template-A W1; let the fold deliver
  reachability.** The template-A scope already flags this collapse
  (`:540-544`). This is the orchestrator's call to record against the R-SURFACE
  fork row that scope filed; the fold does not itself withdraw it, but makes W1
  redundant. If the owner wants a template picker ALSO on the Slide Deck
  sub-view (not just via the PowerPoint Design tab), W1 survives as a separate
  convenience - that is an owner decision, not a fold prerequisite.
- **W0 (capped-read security fix, R-CAP): independent.** Edits
  `deck-template-files.ts` + new `pptx-caps.ts` (`:447-458`). No fold file.
  Parallel.
- **W2 (T3 OOXML slide-clone): independent.** Edits `office-template-fill.ts`,
  `deck-template-files.ts`, new `pptx-slide-clone.ts`/`opc-validate.ts`
  (`:495-516`). No fold file. Parallel.
- **File-set intersection with the fold: EMPTY** for W0 and W2. W1's file set
  (`presentations/index.tsx`, `ArtifactCard.tsx`, `panel-logic.ts`,
  `TemplateFilePicker.tsx`) also does not intersect the fold's files - but W1 is
  the one the fold makes moot, so the relationship is supersession, not a merge.

### 6.3 PRESENTATIONS-TEMPLATE W1's Slide Deck files vs the fold's page.tsx/manual-rail - no overlap
Template-A W1 touches `presentations/index.tsx`, `ArtifactCard.tsx`,
`panel-logic.ts` (the Slide Deck sub-view internals). The fold touches
`page.tsx`, `manual-rail.ts`, `url-state.ts`, `useAppNavigation.ts` (the IA). The
two sets are disjoint by exact path. Even if W1 WERE built, it would not collide
with the fold at the file level; the conflict is purely conceptual (two reach
paths to one engine). Confirmed: the fold does not edit any
`presentations/`-directory file.

### 6.4 Serialization verdict
- The fold runs **in parallel** with pipeline-regen (6.1), template-A W0 and
  template-A W2 (6.2) - three disjoint sets, within the 2-3 concurrent-item cap
  (`docs/loop/parallel-disjointness.md`); pick at most 2-3 to run at once.
- The fold **supersedes** template-A W1 (6.2); recommend W1 not be built.
- No fold prerequisite blocks any of the three independent items, and none blocks
  the fold.

### 6.5 Fold-set serialization rule (governs any future IA item)
**Any item that edits a file in the FOLD SET - `manual-rail.ts`, `url-state.ts`,
`page.tsx`, `useAppNavigation.ts`, or the new `src/lib/ppt-view-migration.ts` (or
their paired IA tests `manual-rail.test.ts`, `tab-rails.test.ts`,
`topLevelTabs.wiring.test.ts`, `url-state.test.ts`, `url-state.ppt-design.test.ts`,
`useAppNavigation.test.ts`) MUST serialize with this fold, not run concurrently
with it.** Land the fold FIRST - it is one atomic, reversible wave - and rebase
the other item onto the post-fold tree. Rationale: these five files are the shared
IA spine (the view unions, the URL contract, the single render page, the nav
hook); two concurrent agents editing any of them race the wave gate and one can
revert the other's work (`docs/loop/parallel-disjointness.md`; `no git stash under
concurrency` memory). This binds the **workflows-collapse IA item** being scoped
in parallel - if it touches any fold-set file, it waits for the fold's push.
Items that touch ONLY `presentations/`-directory files (template-A W1) or
`pipeline/` files (pipeline-regen) or `decks/`/`actions/` files (template-A
W0/W2) are outside the fold set and parallelize (6.1-6.3).

---

## 7. Instruments (object / instrument / direction of failure)

Node-env vitest, network blocked (`vitest.setup.ts`). No render here, so the tab
STRIP showing three tabs and the pane painting PowerPoint Design are OWNER-WALKS;
the machine instruments pin registration, migration decision and source-text
wiring.

- **I-UNION (AC-1).** Object: `PRESENTATIONS_VIEWS` and `isPresentationsView`.
  Instrument: `PRESENTATIONS_VIEWS` contains `"ppt-design"`;
  `isPresentationsView("ppt-design") === true`; `isPresentationsView("bogus") ===
  false`. Direction: RED if the member is absent or the guard rejects it.
- **I-INNER (AC-2).** Object: `getInnerDestinations("presentations")`.
  Instrument: ids equal `["presentations-slide-deck","presentations-pipeline","presentations-ppt-design"]`,
  labels end with `"PowerPoint Design"`. Direction: RED if the third tab is
  missing, mis-ordered or mislabelled.
- **I-RAILGONE (AC-3).** Object: `MANUAL_VIEW_ORDER`, `MANUAL_VIEW_LABELS`,
  `destinations`, `isManualViewType`, `TOOLS_RAIL_ITEMS`. Instrument: none
  contain `ppt-design` as a top-level chip; `isManualViewType("ppt-design") ===
  false`; `TOOLS_RAIL_ITEMS` length 11 with no `"manual:ppt-design"`. Direction:
  RED if a dead top-level chip survives.
- **I-MOUNT (AC-4, source-text over `page.tsx`).** Object: the presentations
  render branch after `withoutLineComments` (`docs/loop/this-repo.md:179`).
  Instrument: the branch renders `PowerPointDesignTab` gated on
  `presentationsView === "ppt-design"`; `page.tsx` contains no `{activeTab ===
  "manual" && ... manualView === "ppt-design"}` top-level branch; exactly one
  `<PowerPointDesignTab` mount site. Direction: RED if the surface ships at two
  sites, at none, or still as a top-level branch.
- **I-MIGRATE-LEAF (AC-5, pure).** Object: `legacyPptDesignView`. Instrument:
  `"ppt-design"` -> `{ presentations, ppt-design }`; result passes
  `isManualViewType`/`isPresentationsView`; null for every other input.
  Direction: RED if the mapping is wrong or a non-`ppt-design` value redirects.
- **I-NAV-INIT (AC-5/AC-6, source-text over `useAppNavigation.ts`).** Object: the
  `manualView` and `presentationsView` initializer bodies, sliced by their own
  `const [<name>, set...] = useState` openers so each assertion is bounded to one
  initializer (the `branchSlice`/positional idiom this repo's wiring tests already
  use, e.g. `useAppNavigation.test.ts:388-397`). Instrument - PLACEMENT, not mere
  textual presence (a grep for `legacyPptDesignView(` passes on the stored arm
  alone and cannot catch the channel-4 ordering bug):
  - In the `manualView` initializer slice: a `ppt-design` redirect to
    `"presentations"` is present, and no arm returns `"ppt-design"` as a
    `manualView`; the `ta-active-tab === "ppt-design"` arm no longer returns
    `"ppt-design"`.
  - In the `presentationsView` initializer slice: `legacyPptDesignView(` appears
    **inside the URL branch** (the `manualView === "presentations"` block) and
    **BEFORE** that block's `normalizePresentationsView(urlParams.get("presentationsView"))`
    return - pin by index:
    `slice.indexOf('legacyPptDesignView(urlParams.get("manualView"))')` is
    `> -1` and `< slice.indexOf('normalizePresentationsView(urlParams.get("presentationsView"))')`.
    AND a second `legacyPptDesignView(` appears before the stored
    `normalizePresentationsView(localStorage.getItem(PRESENTATIONS_VIEW_KEY))`
    return (the stored sub-case).
  Direction: RED if either sub-case is missing OR if the URL-branch check sits
  after the `normalizePresentationsView` return (the exact placement that returns
  `"slide-deck"` on a cold-load `?manualView=ppt-design` bookmark). This placement
  pin is what makes R-PERSIST-DEFAULT's claim true.
- **I-URL-MIGRATE (AC-6, in the sibling test file).** Object: `parseUrlState` +
  `buildUrlSearch`. Instrument: `?manualView=ppt-design` parses to
  presentations/ppt-design and round-trips to the canonical string; does not leak
  on a non-manual tab. Direction: RED if an old link lands on Build Courses or
  stays legacy in the address bar.
- **I-DESTID (AC-7).** Object: `resolveStateFromDestinationId` +
  `getActiveDestinationId`. Instrument: both `"ppt-design"` (legacy) and
  `"presentations-ppt-design"` (new) resolve to `{ presentations, ppt-design }`;
  `getActiveDestinationId("presentations", ..., "ppt-design")` ->
  `"presentations-ppt-design"`. Direction: RED if a persisted destination id dead-ends
  or round-trips wrong.
- **I-NOEDIT (AC-8, tree).** Object: `git status --short`. Instrument: no path
  under `src/app/components/ppt-design/`, nor `PowerPointDesignTab.tsx`'s body,
  nor any `presentations/` file is modified. Direction: RED (manual gate) if the
  fold edited the surface it was only meant to re-parent.

**Owner-walks (no render here):** the Presentations strip shows three tabs in
order and the PowerPoint Design tab paints the builder (AC-2/AC-4 render half); a
returning user actually lands on the PowerPoint Design tab (AC-5 live); an old
bookmark opens it (AC-6 live). State these as owner-walks, not machine claims
(`docs/loop/this-repo.md:262-264`).

---

## 8. Residual register (residual / owner / instrument / measuring step)

Each must be filed in `docs/BACKLOG.md` to exist (`DEV_LOOP.md` step 0;
`iteration-caps.md` residual definition). Missing an owner, an instrument or a
step, it is a deletion.

- **R-TABALIAS - `?tab=ppt-design` (legacy top-level tab value) still lands on
  Manual's default (course-planning), not on presentations/ppt-design**
  (`url-state.ts:120-122`, section 3.6 wrinkle). Owner: repo owner. Instrument: a
  `parseUrlState("?tab=ppt-design")` test asserting the landing. Step: a follow-up
  that widens `TabDestination` to carry a manualView/presentationsView, if the
  owner cares about this very old alias. Low value (the common
  `ta-manual-view`/`?manualView=` paths ARE migrated).
- **R-W1-SUPERSEDE - template-A W1 (`TemplateFilePicker.tsx` on the Slide Deck
  sub-view) is made redundant by this fold** (section 6.2). Owner: repo owner
  (decides whether a Slide-Deck-local picker is still wanted in ADDITION to the
  PowerPoint Design tab). Instrument: the template-A R-SURFACE fork row
  (`docs/presentations-template-ooxml-scope.md:602-606`). Step: record the fold as
  delivering A2 against that fork row; do not dispatch template-A W1 unless the
  owner wants the extra control.
- **R-CONSOLIDATE-CLOSE - the "two deck surfaces with overlapping template
  concerns" residual the template-A scope filed (its R-CONSOLIDATE,
  `docs/presentations-template-ooxml-scope.md:631-634`) is partially DISCHARGED by
  this fold** (ppt-design and the Presentations deck builders now live in one
  child strip). Owner: repo owner. Instrument: the Presentations inner-nav having
  all three deck surfaces (I-INNER). Step: on the fold's push, note which part of
  R-CONSOLIDATE this closes; any remaining duplication (two separate deck
  *builders* under one strip) stays open as its own row.
- **R-PERSIST-DEFAULT - a returning user whose `ta-presentations-view` holds a
  value while they were last on a DIFFERENT manualView is unaffected** (the
  migration only fires for the `ppt-design` manualView value). Owner: fold
  implementer. Instrument: I-NAV-INIT (the presentationsView initializer only
  returns `ppt-design` when the parent resolved to presentations via the
  migration). Step: the fold's `useAppNavigation.test.ts` additions. (Listed to
  make explicit that the migration does not clobber an unrelated stored
  presentationsView.)

---

## 9. Dispatch list for the orchestrator

1. Fresh `loop-checker` on THIS scope before any seat consumes it. Challenge
   hardest: (a) that the migration leaf is wired at ALL FOUR channels
   (`parseUrlState`, `resolveStateFromDestinationId`, and both `useAppNavigation`
   initializers incl. the `ta-active-tab` arm) - a channel left unmigrated is the
   dead-view bug; (b) that `url-state.test.ts` at exactly 1000 lines does not grow
   past the ceiling (the sibling-file decision, section 4); (c) that removing
   `ppt-design` from `MANUAL_VIEW_ORDER` leaves `topLevelTabs.wiring.test.ts:345-356`
   green because `page.tsx` also drops the branch (re-open both); (d) that the
   legacy id resolves to presentations/ppt-design rather than falling back to the
   current view (the re-parent-vs-delete distinction from `course-intel`).
2. After the check clears: `loop-test-author` for the re-freezes (section 5) and
   the three new/edited test files, incl. the sabotage list (remove one migration
   channel -> I-NAV-INIT or I-URL-MIGRATE RED; leave the top-level branch in
   page.tsx -> I-MOUNT RED).
3. Build the single wave; gate per section 4. Baseline the current PowerPoint
   Design reach path into `docs/REGRESSION.md` first if not covered (`grep -a`).
4. Verify against the built diff: every AC, the triaged-out seats' triggers, and
   the recorded no-leverage decision.
5. File R-TABALIAS, R-W1-SUPERSEDE, R-CONSOLIDATE-CLOSE, R-PERSIST-DEFAULT as
   backlog rows; bump the row count per row. Record against the template-A
   R-SURFACE fork that the fold delivers A2.
