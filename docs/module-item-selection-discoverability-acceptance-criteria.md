# Selecting every item in a module: making the control findable, and closing the silent mismatch

Chunk C of the module-actions backlog group. Chunks A and B are
`docs/intro-discussion-from-modules-acceptance-criteria.md` and
`docs/current-events-assignment-from-modules-acceptance-criteria.md`.
**C does not start until A is pushed** - two of A's agents hold files in
`src/app/components/content-tab/modules/`.

**The ask, verbatim (2026-08-23):** "i need an easy way to select all items in
a module, wtih one click"

## 0. THE REFRAME - read this before anything else

**The requested feature already exists and is already one click.** Every
module card renders a `Select items` / `Deselect items` button in its head
row that selects every item in that module. It works while the module is
collapsed. It is fully wired and reachable:

- live Canvas modules: `ModuleCard.tsx:338-346`, wired
  `ModulesView.tsx:847` -> `ModuleCard.tsx:49/116/341` ->
  `useModuleSelection.ts:497-509`
- export-sourced modules: `ModuleCard.tsx:204-212`
- repo folders ("Select files"): `RepoFoldersSection.tsx:317-325`

So this chunk builds NO new capability. Per docs/DEV_LOOP.md and this repo's
standing rule, a feature that already exists and merely looks absent means the
real job is fixing why it looks absent. That is what the ACs below do.

**Two corrections to the survey brief, recorded so nobody re-treads them:**
`src/lib/module-selection.ts` is unrelated - it is a text-spec parser
("1,3-5,8") for the COURSE_BUILD run form and nothing in the Modules view
imports it. `expandModuleSelection` lives in
`src/lib/lms-generation/materials.ts:484`, not in the actions file.

## 1. Why it is not findable (the diagnosis this chunk fixes)

Verified by reading, 2026-08-23:

1. **Ten controls in one row.** The module head row carries a drag grip, a
   checkbox, an expand caret, `Select items`, a name field, an item count, two
   reorder arrows, a publish toggle, an external-link icon, and a red
   `Delete`. `Select items` is a `variant="outlined" size="small"` MUI Button -
   visually identical in weight to `Delete`.
2. **It sits beside a checkbox that does something else.** The module checkbox
   (`ModuleCard.tsx:323-329`) toggles only `selectedModules`; it never touches
   `selected`. There is no visual grouping between the two, so the checkbox
   reads as "the selection control for this module" and the button reads as an
   unrelated action.
3. **The global header primes the wrong shape.** `ModulesHeaderBar.tsx:257-264`
   labels its two controls "Items" and "Modules" as CHECKBOXES, training the
   eye to look for a per-module checkbox rather than a button.
4. **No feedback that items were not selected.** Ticking a module shows
   "1 module selected" (`ModulesView.tsx:588-598`), which reads as "and its
   contents".

## 2. The silent mismatch - the actual defect

The two Sets are orthogonal by design and this is deliberate
(`docs/REGRESSION.md:19926-19932`). The defect is not the orthogonality; it is
that NOTHING TELLS THE USER.

**Ticking a module and pressing Publish publishes the module container. Every
item inside stays unpublished.** No copy anywhere distinguishes the two.

Consumers that DO expand a module selection into its items (all via
`expandModuleSelection`): LMS generation (`useLmsGeneration.ts:557,576,580`),
selection download (`useSelectionDownload.ts:328,343,368`), Ask AI
(`useSelectionChatContext.ts:122,131,143`), visualizer coverage
(`useVisualizerCoverage.ts:492,542`).

Consumers that SILENTLY IGNORE a module-only selection - every item-level
Canvas write, because `BulkItemsSection` is not even rendered unless
`selected.size > 0` (`ModulesView.tsx:687`) and every action reads
`selectedItems()`, which is documented LIVE-ONLY and must stay that way
(`useModuleSelection.ts:393-411`): `bulkPublish` (:210), single-item edit
(:269), `bulkSetDue` (:284), `bulkShiftDue` (:295), `bulkStaggerDue` (:322),
`bulkSetPoints` (:349), `bulkRubric` (:416), remove-from-module (:488),
submission-type (:500/:508/:517), `bulkSetDescription` (:549),
`bulkAddQuestionsToQuizzes` (:586), move-to-module (:610),
`bulkDeleteContent` (:624). Thirteen actions.

Consumers that act on the module OBJECT, never its items
(`useBulkModuleActions.ts`): `bulkPublishModules` (:137),
`bulkDeleteModules` (:159), `bulkAddToModules` (:202), `bulkAiGenerate` (:290).

## 3. Acceptance criteria

**AC1 (make the pairing visible).** In the module head row, `Select items` is
grouped with the module checkbox so the two read as one selection cluster,
visually separated from the destructive and navigational controls. It keeps
the existing MUI vocabulary - `Button variant="outlined" size="small"` and
`IconButton size="small"` - and does NOT introduce the raw-`<button>` +
CSS-module vocabulary used in modals. Mixing the two is a known mistake in
this repo. `Delete` must not sit adjacent to `Select items` after the change.

**AC2 (indeterminate state).** The module checkbox gains a real indeterminate
state driven by its ITEM selection: unchecked when none of its items are
selected, indeterminate when some are, checked when all are. Today there is no
indeterminate state anywhere on this view
(`docs/REGRESSION.md:19945-19947`), and the only partial signal is the
all-or-nothing label flip at `ModuleCard.tsx:256` - with 3 of 5 items ticked
the button still reads `Select items`.

The vocabulary already exists in this app and must be reused, not reinvented:
`OrgManagementPanel.tsx:683` (`indeterminate={!allSelected && filtered.some(...)}`).

**AC3 (the module checkbox's semantics do NOT change).** The module checkbox
keeps toggling `selectedModules` only. It never writes to `selected`.

SETTLED BY THE REPO OWNER, 2026-08-23. This was raised, briefly reversed, and
then reverted on their instruction within the same session. It is recorded
here in full so it is not re-proposed a third time - by a future session, by a
reviewer, or by an implementer who thinks the checkbox "obviously" should
select contents.

The case FOR changing it: it is the affordance a user reaches for first.

The case AGAINST, which is why it stays:

1. **A stale module key would silently resurrect a deselected item.** If a
   module key meant "all its items", then ticking a module (module key + 5
   item keys) and then unticking ONE item leaves the module key in place, so
   `expandModuleSelection` re-adds that item at generation, download, Ask-AI
   and coverage time. The user's deselection is undone silently, in four
   consumers, with nothing on screen showing it. Preventing that would require
   a new cross-Set invariant ("a module key is present only if every one of
   its items is") enforced along every path that can change either Set -
   the module checkbox, `Select items`, an individual item checkbox,
   `selectByKind`, `toggleAll`, and a module's items changing under a reload.
   That is a large, subtle surface for a discoverability fix, and it cannot be
   verified here: no component is ever rendered by this repo's test suite
   (section 5).
2. The orthogonality is deliberate and documented
   (`docs/REGRESSION.md:19926-19932`), and four consumers are written against
   it.

**What was checked and turned out NOT to be a reason** - recorded because the
first draft of this document gave it as the primary objection and it was
wrong: double-counting is NOT a risk. `expandModuleSelection`
(`materials.ts`) seeds `const seenKeys = new Set(items.map((e) => e.key))`
and every expansion arm skips a key already in that set, so a module key and
its item keys both being present yields each item exactly once. Verified by
reading, 2026-08-23. Anyone reopening this should reopen it on reason 1, not
on double-counting.

So the fix for discoverability is legibility - AC1, AC2, AC4, AC5 - not new
semantics. `Select items` remains the one control that selects a module's
contents, and the chunk's job is to make that obvious at a glance.

**AC4 (say what is actually selected).** The selection summary distinguishes
modules from items in plain language, and when the selection contains modules
but NO items it states that item actions need items selected, naming the
control that does it. The wording must survive as a REASON, not collapse into
a generic count.

**AC5 (label the partial case).** The `Select items` label reflects the three
states, not two: none selected, some selected, all selected. Derive it from
the same predicate that drives AC2 so the button and the checkbox can never
disagree.

**AC6 (consolidate three implementations).** "Select every item in this
container" exists three times: `useModuleSelection.toggleModuleItems`
(`:497-509`, live), a local closure `toggleItemsInModule`
(`ModuleCard.tsx:175-183`, export - separate because the hook's version is
Canvas-only), and `toggleAllFilesInFolder` (`RepoFoldersSection.tsx:320`,
repo). Consolidate onto one implementation parameterised by source.

Preserve exactly, or the consolidation is a regression:
- export-sourced instructor-added items are deliberately EXCLUDED (they have
  no `identifier`) - `ModuleCard.tsx:152-164`
- the three key formats and their prefix guards (`utils.ts:74-206`); the
  trailing colon in `liveModuleKeyPrefix` is load-bearing (the 1-vs-12
  collision guard, pinned at `useModuleSelection.pruning.test.ts:316`)
- `expandModuleSelection` (`materials.ts:497-520`) HAND-WRITES the same key
  templates as string literals rather than importing the helpers, deliberately
  (that file keeps zero client imports). Two independent definitions of one
  format now exist. Do NOT unify them here, but pin their agreement with a
  test against a frozen literal - per this repo's rule, consolidating two
  implementations disarms the test that compared them, so the oracle must be a
  frozen literal and not either implementation.

**AC7 (the search-scope asymmetry - decide it explicitly).**
`toggleAll` is filter-scoped (`useModuleSelection.ts:451-453`) but per-module
`toggleModuleItems` iterates `m.items` RAW (`:498`), so with an active search
it selects hidden items too. This is documented as deliberate
(`docs/REGRESSION.md:19939-19943`). Either keep it and say so in the control's
tooltip, or make it filter-scoped - but the behaviour must be STATED, because
silently selecting invisible items is how a bulk delete surprises someone.

## 4. Non-goals

- No change to what the module checkbox writes (AC3).
- No new bulk action, and no change to which actions honour which Set. The
  mismatch in section 2 is DISCLOSED by AC4, not resolved by rewiring thirteen
  actions - that is a separate, larger decision.
- No change to `expandModuleSelection` or to `materials.ts`.

## 5. Testing reality - state it plainly

`vitest.config.ts:13-14` collects only `src/**/*.test.ts` in a NODE
environment. No jsdom, no testing-library, no setup files. **No component is
ever rendered.** Nothing in this chunk's suite can prove anything about
checkbox markup, indeterminate rendering, button labels, or click behaviour.
Every UI finding comes from reading, and the REGRESSION entry must say so
rather than implying coverage that does not exist.

What that leaves as genuinely testable: the pure Set transforms, the
three-state predicate behind AC2/AC5, the consolidated selector from AC6, and
the key-format oracle. Extract the predicate and the selector as PURE
EXPORTED functions precisely so they are testable at all - today
`toggleModuleItems`, `toggleModuleSelected`, `toggleAll`, `toggleAllModules`,
`selectByKind`, `clearSelection`, `selectedItems()` and both label-flip
predicates are closures inside the hook and are **entirely untested**.

The repo's only existing way to assert on JSX is a source-text "wiring" test
that `readFileSync`s a `.tsx` and regexes it
(`ModulesHeaderBar.wiring.test.ts:28-36`). No such test targets
`ModuleCard.tsx` today. If one is added here it must pin the FACT and the
ORDERING, never the spelling - source-text assertions have twice forced
contorted implementations in this repo.

## 6. Gates

```
npx tsc --noEmit
npx eslint <touched files>
npx vitest run
npx next build      # compile line only
```

No emojis (`src/lib/no-emojis.test.ts` owns the rule). 1000-line ceiling,
counted with `@(Get-Content path).Count`. Note `useLmsGeneration.ts` is
already at exactly 1000 lines after chunk A - if this chunk needs to touch it,
the file must be split first.
