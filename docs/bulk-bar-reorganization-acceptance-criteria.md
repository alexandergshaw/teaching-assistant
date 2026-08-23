# Reorganizing the bulk actions bar, and making "Select items" findable

Chunk E of the Modules-view backlog, MERGED with what was chunk C
(`docs/module-item-selection-discoverability-acceptance-criteria.md`). They are
one chunk because they are one surface: C's fix is to group a control with the
checkbox beside it, and E rebuilds the container that grouping lives in. Doing
C first would mean redoing it.

**The asks, verbatim (2026-08-23):**
- "i need an easy way to select all items in a module, wtih one click"
- "i also need the bulk actions menu to be far more organized and space conscious"

C's own AC document stays where it is and remains the authority for AC1-AC7
of the selection half; this document owns the container, and restates only the
C criteria the reorganization changes.

---

## 0. The measured problem

Counted by reading, 2026-08-23. These are the numbers the redesign has to move.

| | count |
| --- | --- |
| Interactive controls in the bulk bar, worst case (one module + its items selected) | **65** |
| ...plus `ModulesHeaderBar`, which is always on screen in the same sticky header | **~86** |
| `BulkItemsSection` alone | 29 |
| `BulkModulesSection` (Assignment or Quiz path) | 15 |
| Generate row (2 selects + 10 kind buttons + the checkpoints checkbox) | 13 |
| Separate hint / reason / aria-live text blocks | ~20 |
| `.bulkLabel` uppercase micro-headings | 15 |
| `.bulkRow` hairline dividers | 12 |

Six children render inside the bar (`ModulesView.tsx:585-743`) and **four of
them have no visibility gate at all** - Generate, Download, Ask AI and
Visualizer coverage render whenever anything is selected. Only
`BulkModulesSection` and `BulkItemsSection` are gated.

**There is no grid, no media query, and no overflow model.** `.bulkRow` is
`flex-wrap: wrap`; `.bulkHint` is `flex-basis: 100%` so every hint claims a
full line. `.bulkBar { overflow: hidden }` exists only to clip the navy head
inside the border radius. The bar simply grows, pinned above the content it
operates on. The single escape hatch is a 12px `ns-resize` strip
(`ModulesView.tsx:745-752`) that sets `maxHeight`/`overflowY` only after the
user drags it.

---

## 1. Reuse survey - the vocabulary this app already speaks

**The strongest constraint on this chunk is that every primitive it needs
already exists.** Introducing a new one is the failure mode.

| Need | Reuse | Where |
| --- | --- | --- |
| Collapsible group | Native `<details>` + `.adaptDisclosure` - **14 existing sites**, styled once, keyboard-native, zero JS, already carries the card look | `page.module.css:704-742`; e.g. `OrgManagementPanel.tsx:350/407/491/573/665`, `SessionSetupPanel.tsx:130/191`, `GradingTab.tsx:377` |
| A panel of checkboxes/selects behind a trigger | MUI `Popover` - and the repo has WRITTEN DOWN why not `Menu` | `TasksToolbar.tsx:299` (the Columns panel: group headings + ~40 checkboxes); the rule is stated verbatim at `TasksToolbar.tsx:292-298` |
| One-of-N mode selection | `ToggleButtonGroup` | `TasksToolbar.tsx:239-251`, `:258-273` |
| Grouping with hairline separators | `.ccBar` / `.ccBarGroup` / `.ccBarLabel` / `.ccBarDivider` | `page.module.css:4985-5014` - already the grammar `ModulesHeaderBar` uses |
| Indeterminate checkbox | Existing idiom | `OrgManagementPanel.tsx:683` |
| Overflow action menu (actions, not fields) | MUI `Menu` with full a11y | `CellMenu.tsx:120` - `aria-haspopup`, `aria-expanded`, per-item `aria-describedby` reasons, `disabledItemsFocusable` |
| Filtering a long list | `Typeahead` | `src/app/components/ui/Typeahead.tsx` |
| Two-click confirm on a destructive action | `isConfirmArmed` / `selectionSignature` | `confirmArming.ts`, tested |
| Disabled-with-a-reason | `aria-disabled` + visible reason + `aria-describedby`, with a `reasonIds` de-duplicator | `DownloadSelectionSection.tsx:39-52,95-98`; `VisualizerCoverageSection.tsx:87-90,132-137` |

**`Accordion`, `Drawer`, and `MenuList`-as-overflow-menu have ZERO sites.**
Each would be new vocabulary. Do not introduce them.

**Dead code this chunk should delete:** roughly 130 lines of `page.module.css`
styling a raw-`<button>` bulk bar that no longer exists - `.bulkClear`,
`.bulkBtn`, `.bulkBtnPrimary`, `.bulkBtnDanger`, `.bulkInput`, `.bulkSelect`
(`:4833-4847`, `:4876-4964`), `.ccBarBtn`, `.ccBarSelect`, `.ccBarCheck`
(`:5016-5059`). A repo-wide grep for each returns zero references. Keeping
`.bulkBtnDanger` is actively misleading: the next implementer will assume it is
the house danger style.

---

## 2. The load-bearing constraints

**E1. The bar lives inside a `position: sticky` + `backdrop-filter` container
(`page.module.css:5065-5080`), which is a stacking context AND the containing
block for `position: fixed` descendants.** Anything `position: fixed` rendered
from inside it paints at the header's size, not the viewport's. Four section
files carry a header comment about this, and `generatedPreviewModal.wiring.test.ts`
ENFORCES it by failing any header-rendered component containing
`styles.previewBackdrop`, `createPortal`, `position: fixed`, or a
`Dialog`/`Modal`/`Popover` shell import.

This rules out a self-rendered overlay. It does NOT rule out MUI
`Popover`/`Menu`, which portal to `document.body` and escape the containing
block - and `ModulesHeaderBar.tsx:418-424` already relies on exactly that
(a `TextField select` is itself a portaled popup and works fine here). Any new
portaled surface must have its z-index verified against `.ccStickyHeader`'s
`z-index: 30`.

**E2. `visualizerCoverage.wiring.test.ts:56` pins the bar's child ORDERING
contractually**, and `:145`/`:157` forbid a `Popover` inside that one section
file. Both are legitimate. A redesign that reorders or re-nests the children
WILL fail them, and they must be updated deliberately, preserving the intent
(the row is part of the selection bar, not a floating panel) with a different
assertion - not deleted.

**E3. Roughly a third of the bar's vertical footprint is explanatory prose, and
every word of it is load-bearing BY POLICY.** `DownloadSelectionSection.tsx:39-65`
and `VisualizerCoverageSection.tsx:35-44` both argue at length that reasons and
disclosures must be ALWAYS-VISIBLE TEXT, never a `title` tooltip, because a
`title` is unreachable by keyboard and unannounced. **A space-saving redesign
may relocate a hint; it may not convert one into a tooltip.**

---

## 3. Acceptance criteria

**AC1 (group by CONSEQUENCE, not by frequency).** This is the organizing
principle and it overrides tidiness. Today only 4 of 21 write controls have a
confirm step, and three unconfirmed, single-click, fan-out Canvas mutations sit
at the same visual weight as `Publish`:
- `Remove` (`BulkItemsSection.tsx:456`) - removes items from their module
- `Add` (`BulkModulesSection.tsx:195`) - creates one Canvas item in EVERY
  selected module
- `Set description` (`BulkItemsSection.tsx:241`) - OVERWRITES every selected
  item's body

A reorganization that collapses by usage would bury these. Destructive and
fan-out writes stay at full weight, outside any collapsed container, and
visually separated from read-only actions.

**AC2 (the 15 group headings become real groups).** `.bulkLabel` spans -
`Items`, `Content`, `Due dates`, `Grading`, `Submission type`, `Move`,
`Modules`, `Add to each`, `Generate`, `Download`, and the rest - are visual
only. A screen-reader user tabbing 65 controls hears 65 flat labels: "Set",
"Apply", "Move", "Add", "Edit", "Clear", "New". Each group becomes a real
`role="group"` + `aria-labelledby` (or `fieldset`/`legend`) container.

**This single change is both the accessibility fix and the space fix** - a real
group is the thing that can then collapse. Do them as one change, not two.

**AC3 (collapse with the existing disclosure idiom).** Groups that are not
in-flight collapse using `<details>` + `.adaptDisclosure`. Default-open state
is chosen per group by AC1's consequence rule, and persists per course under a
`ta-`-prefixed key (repo invariant). Read-only groups (Download, Ask AI,
Visualizer scan) may default closed; groups containing unconfirmed writes may
not.

**AC4 (a height ceiling that does not depend on a hidden drag handle).** The
bar gets a max height with internal scrolling, independent of
`ta-content-header-height`. The existing drag handle keeps working and keeps
its persisted value; it stops being the ONLY way to stop the bar from eating
the page.

**AC5 (MUI only).** Every control stays MUI - `Button variant="outlined"
size="small"`, `IconButton size="small"`, `TextField size="small"`, `Checkbox`.
Do NOT introduce the raw-`<button>` + CSS-module vocabulary. The bar is
currently 100 percent MUI with zero raw buttons; the CSS-module classes that
remain live are layout and typography only. Mixing the two is a known mistake
here.

**AC6 (delete the dead CSS).** Section 1's ~130 lines, verified by grep before
removal.

**AC7 (the selection half - restated from chunk C).** In the module head row,
`Select items` is grouped with the module checkbox so the two read as one
selection cluster, separated from the destructive and navigational controls;
`Delete` must not sit adjacent to `Select items` afterwards. The module
checkbox gains a real indeterminate state driven by its ITEM selection, and the
button's label distinguishes none/some/all - both derived from ONE predicate so
they cannot disagree. **The module checkbox's semantics do NOT change** - see
C's AC3 for the settled reasoning (a stale module key would silently resurrect
a deselected item in four consumers).

**AC8 (say what is selected, and what that does not cover).** The count
currently reads "N modules, M items selected", which reads as "and their
contents". When the selection contains modules but NO items, the bar states
that item actions need items selected and names the control that does it.
Thirteen item-level bulk actions silently ignore a module-only selection; this
chunk DISCLOSES that, it does not rewire them.

**AC9 (nothing loses its persistence).** Exactly two bulk-bar controls persist
today - the "Add to each" submission type (`ta-modules-bulkadd-stype`) and the
generate row's video length - plus the new checkpoints checkbox. Twenty-two
others do not, several with no defended reason. This chunk MUST NOT drop the
three that work. It MAY add persistence to others; any control it deliberately
leaves unpersisted needs a written reason, following the precedent at
`useVisualizerCoverage.ts:447` (which carries its reason AND a test pinning the
absence).

**AC10 (the confirm asymmetry).** The two armed `Delete` buttons swap their
label but have no `aria-live` banner, while the two armed visualizer writes
have one - the higher-consequence pair is the quieter. Give the deletes the
same three-signal treatment `VisualizerCoverageSection.tsx:16-34` documents:
label swap, colocated `role="status" aria-live="polite"`, and the note.

**AC11 (near-dead controls).** Report, do not silently delete: `Edit in detail`
/ `Edit page` (single-item affordances inside a BULK bar, duplicating
`ModuleItemRow`'s own Edit), `Add to selected quizzes` (permanently disabled
until a sibling modal has been used), rubric selects that render as disabled
"No rubrics" at full control width, and the `gateOperation` branches both bulk
sections carry that are documented as unreachable in the product today. Each is
a candidate for removal, and each removal is a separate decision the AC must
record.

---

## 3a. AC12 - a context box on every LLM-driven bulk action

**Added 2026-08-23 at the repo owner's request, verbatim:** "for all actions
taken on the bulk action bar that involve an llm, give me a textbox i can use
to provide additional context/commands"

Folded into this chunk rather than built after it: it adds a control to the
exact sections this chunk is restructuring, and building it separately means
touching those files twice and re-threading the same props.

**AC12a (which actions are in scope).** Every bulk-bar action that sends a
prompt to a model. Enumerate them in the group model (`kind: "textarea"` with
a `feeds` pointing at each LLM action) rather than in prose, so the list is
auditable:
- the ten kind buttons in the Generate row (`qa`, `currentEvents`, `decks`,
  `objectives`, `assignments`, `knowledgeChecks`, `announcements`, `scripts`,
  `resources`, `introDiscussion`)
- `Generate with AI` in `BulkModulesSection` - **which ALREADY HAS one**
  (`bulkAiPrompt`, `BulkModulesSection.tsx:398-411`). Do not add a second.
- `Ask AI` opens a chat that has its own input. Out of scope; adding a second
  input for the same conversation would be worse, not better.

**AC12b (one box per group, not one per button).** The Generate row has ten
LLM buttons; ten textboxes would be absurd. ONE context box for the Generate
group, applied to whichever kind is pressed. Its label makes that explicit -
it is context for the next generation, not for a particular button.

**AC12c (reuse the refine channel's vocabulary, do not invent a second).** The
preview modal ALREADY takes free-text instructions for REFINE
(`instructions` in `useLmsGeneration`, consumed by
`refineGeneratedArtifactAction`). This AC is the same idea moved EARLIER - the
instructor should not have to generate a wrong draft first in order to say
what they wanted. Wording, placeholder and behaviour should read as the same
feature at two points in the flow, and the implementer must read the refine
path before writing this one.

**AC12d (the wire).** The context string is threaded to
`generateFromSelectionAction` as one new optional input field, and from there
into each kind's generator alongside the materials text. It is OPTIONAL
everywhere: an empty box must produce a request byte-identical to today's, so
every existing generation behaves exactly as it does now. Pin that with a
frozen-literal test - this repo has been bitten by a "widen a shared shape for
one new caller" change altering every other caller's output.

**AC12e (it persists).** Repo invariant: a new textbox persists across reloads
under a `ta-`-prefixed key, per course. Follow the `scriptMinutes` idiom, and
put the persistence in the HOOK, never in a `Section.tsx` - see D3.

**AC12f (it is saved with the artifact).** `generated_artifacts` already has a
`prompt` column carrying a RECONSTRUCTED description of what was asked (see
`buildPrompt` on every kind config and `GenerationPromptMeta`'s doc comment).
The instructor's own context belongs in that audit trail, so a later reader of
the version history can see why a version differs from its predecessor. Append
it to what `buildPrompt` already produces; do not replace that text.

**AC12g (it does not become a second scope mechanism).** The box is free text
handed to a model. It must not be parsed, pattern-matched, or given special
tokens, and nothing downstream may branch on its contents. If a future need
wants structured control, that is a separate, designed input - not this box
growing a syntax.

### AC12h-AC12l - the box is also a COMMAND that modifies the selection

**Added 2026-08-23, extending the above at the repo owner's request, verbatim:**
"also make it so that this textbox is available even if i just select a module
or an item, and make it so that i can submit the textbox as a command to an
llm to modify the selected module or item"

This turns one control into two capabilities: CONTEXT for a generation
(AC12a-g), and a COMMAND that edits what is already selected. They share a box
and nothing else - one produces a new artifact, the other rewrites existing
Canvas content.

**AC12h (availability).** The box renders whenever ANYTHING is selected - a
module alone, an item alone, or any mix. It is NOT gated on the Generate row
being offerable. Note the existing asymmetry this exposes: the Generate row is
offered for a module-only selection, but the item-level bulk actions are not
(the bar's own AC8 mismatch). The box must work for both, so it cannot live
inside either bulk section - it belongs to the bar itself, in its own group.

**AC12i (submitting it as a command is a DRAFT-THEN-COMMIT action, not a
write).** This project has a standing classifying rule for exactly this: an
action with side effects gets draft / review / commit, never fire-and-forget.
An LLM rewriting N Canvas objects in place is the highest-consequence action
this bar would contain - Canvas has no undo, and `Set description` already
demonstrates the failure mode (a single unconfirmed click overwriting every
selected body).

So: submitting the command produces a PROPOSAL per selected object - what it
is now, what it would become - which the instructor reviews and then applies.
Nothing reaches Canvas on the first click. Under the consequence model
(section 3b/D1) the command control is tier `destructive`, its group is
force-open and never collapsible, and it carries an always-visible
`consequenceTag`.

**AC12j (what it may modify).** Only fields this app can already both READ and
WRITE, because a proposal must show the current value to be reviewable:
- item title, and the description/body of an assignment, quiz, discussion or
  page (read via `getGradable` / `getPage`, written via `updateGradable` /
  `updatePage`)
- module name (read from the loaded tree, written via `updateModule`)

Explicitly OUT of scope, and the reason must be stated in the UI rather than
silently skipped: points, due dates, submission type, rubric association, and
publish state. Those have dedicated controls in this same bar, and a
free-text command that silently changed a due date would be indistinguishable
from the dedicated control having been used. A command that asks for one of
these is reported as unsupported in the proposal, not quietly dropped.

**AC12k (per-object failure is per-object).** The proposal and the apply step
both continue past a failure and report it per object, reusing the existing
`ModuleContentResult` / `describeOrphans` vocabulary rather than a new one. A
model returning nothing usable for one item must not abort the other nine, and
"the model returned nothing for item 3" must remain distinguishable from
"Canvas rejected the write for item 3".

**AC12l (one box, two buttons, no mode switch).** The group holds the textarea
plus two clearly-labelled actions - one that uses the text as context for the
next generation (AC12b), one that submits it as a command against the
selection. No toggle, no mode state: a mode would be one more thing to get
wrong and would make the two behaviours indistinguishable at a glance, which
is precisely the confusion AC8 already exists to fix. The two buttons sit at
different consequence tiers and must be styled accordingly - they are not a
pair of equals.

**AC12m (the command may also CREATE ENTIRELY NEW MODULES).** Added
2026-08-23, verbatim: "and make it so that the llm that gets called through
this textbox can also generate entirely new modules".

So the command has three possible outcomes, and which one a given instruction
produces must be visible in the proposal BEFORE anything is written: modify
what is selected (AC12j), create new modules, or both.

- **Reuse `planBulkModuleCreation` (`src/lib/bulk-module-plan.ts:151`).** It
  already takes the existing module list plus a desired set and returns a
  per-module decision including `"already-present"` with the existing id -
  case/trim-insensitive, the repo's canonical idempotency idiom for module
  creation. Its own header documents at length WHY it exists: Canvas offers no
  idempotency key for module creation, so a name pre-check is the only dedupe.
  An LLM-driven creator that skips it will duplicate every module on a second
  run. **Do not write a second planner.**
- Module TITLES go through `composeModuleTitle`
  (`src/lib/module-title.ts:140`), which is idempotent for a fixed week and
  strips a redundant leading label - the function that exists precisely
  because a generated title fed back in once produced
  "Module 08: Module 08: Module 08". A model asked for module names WILL
  produce "Module 3: ..." strings; run them through it.
- The proposal lists each module as CREATE or ALREADY EXISTS, with its
  resolved final title, before the instructor applies.
- Position/ordering of new modules is out of scope for this chunk: append.
- Creating a module and then populating it is NOT in scope here. The bar
  already has "Add to each" for that, and chunk D covers carrying a module's
  pattern into other modules. A command that asks for populated modules
  creates the modules and says plainly that their contents were not created.

**NOTE FOR THE ARCHITECT - READ THIS BEFORE DESIGNING.** AC12 has grown across
three requests in one session from "a context textbox" to a general
instruction interface with three outcomes: context for a generation, an
in-place rewrite of selected Canvas content, and creation of new modules. That
is no longer a control on a reorganized bar; it is its own feature with its own
proposal/apply pipeline, its own idempotency rules, and by far the highest
consequence of anything in this bar.

**The recommended split, unless the architecture shows otherwise:**
- **Chunk E keeps** the reorganization (AC1-AC11) plus AC12a-g, the CONTEXT
  half. That is a textarea, one optional wire field, persistence, and an audit
  line - small, additive, and it makes every existing generation better
  immediately.
- **AC12h-AC12m becomes its own chunk**, with its own acceptance criteria, its
  own architecture pass, and its own push. It needs a proposal data model, a
  review surface, per-object failure reporting, and a hard draft-then-commit
  guarantee over an instructor's live course content.

Shipping the context half on a reorganized bar, and giving the command half
the design attention an irreversible LLM rewrite deserves, is a better outcome
than folding all three into one wave. If the architect disagrees, it should
say so with reasons rather than silently attempting all of it.

## 3b. ARCHITECTURE AND AC AMENDMENTS (step 4 output, 2026-08-23)

FINAL CONTRACT. Where this disagrees with anything above, this wins.

### D0. COLLAPSE IS NOT THE SPACE FIX - the premise correction

Applying AC1's consequence rule honestly, **only 4 of 13 top-level groups can
ever collapse and only 3 may default closed.** Everything containing an
unconfirmed fan-out or destructive write is force-open by rule. Collapse buys
three summary lines. That is the correct outcome of AC1 and must NOT be
softened to win space.

The space comes from four things, and **the two largest are not in this AC**:

1. **`.bulkHint { flex-basis: 100% }` (`page.module.css:4967`) is why each of
   ~23 hints claims a whole line.** Change to `flex: 1 1 240px; min-width:
   240px` so a short reason sits BESIDE its control. Pure CSS, no behaviour
   change, no E3 violation (still always-visible text, never a tooltip). **The
   single highest-value line in the chunk.**
2. **`.bulkLabel { flex: 0 0 76px }` (`:4862`) is 76px of dead gutter on 12+
   rows.** Once each group has a real heading the per-row label is redundant:
   delete the span and the gutter, and fewer rows wrap.
3. AC4's height ceiling - the unconditional fix.
4. Three read-only groups defaulting closed.

### D1. The group model is DATA, in a new pure leaf

`src/app/components/content-tab/modules/bulkBarGroups.ts` - no React, no MUI,
no `.tsx` import. Precedents: `contentSourceGating.ts` (same folder, same
discipline) and `src/lib/course-tasks-catalog.ts`. It exports
`ConsequenceTier`, `BulkBarFacts`, `BulkBarGroupRuntime`, `BulkBarControlDef`,
`BulkBarGroupDef`, `BULK_BAR_GROUPS`, and four pure functions:

- `groupTier(g, facts)` - **DERIVED as the max over VISIBLE members, never
  declared.** A declared tier can drift from what a group contains, which is
  the exact failure AC1 exists to prevent.
- `mayCollapse(g, facts)` - false at fan-out or destructive.
- `groupOpen(g, facts, runtime, persisted)` - force-open beats persistence
  beats default. Force-open triggers: `busy`, `armed`, `hasUnavailableReason`.
  **This is AC3's undefined "not in-flight", now defined.**
- `auditGroupModel()` - returns `[]` for a sound model; a test asserts that.
  Enforces eight invariants including I5 (every high-tier group has an
  always-visible `consequenceTag`) and I6 (`persistKey: null` requires a
  written `unpersistedReason`), which mechanises AC9.

The visualizer group is read-only before a scan and destructive after, so the
tier MUST be a function of facts. AC3 did not cover a runtime tier change.

### D2. Corrections to this document's own claims

| AC line | Correction |
| --- | --- |
| AC1 "three unconfirmed fan-out writes" | There are **17** unconfirmed writes of 21 total. The three named are the WORST, not the only ones. An implementer reading it literally would give three full weight and collapse fourteen. |
| AC1 treats `Publish` as the benign baseline | It is not. For a MIXED selection, `Unpublish` does not restore what `Publish` flattened - the prior distribution is unrecoverable from this bar. All four Publish/Unpublish controls are `fan-out-write`. |
| AC9 "twenty-two others" | Unauditable as a number. Of 65 controls ~41 are buttons with no state; the stateful set is ~24, minus 3 persisted = **21**. Replace the number with the enumerated list the model now supplies for free. The one clear present-day violation: the deck-template `templateId` is unpersisted with **no reason anywhere**. |
| AC6 "roughly 130 lines" | 148. And `.bulkBarHead` (`:4815-4825`) sits BETWEEN two deletion ranges and is pinned by `focusRing.wiring.test.ts:543-549` for its `--focus-ring-color` override. Do not delete it. |
| E1 "enforces ... createPortal, position: fixed, Dialog/Modal/Popover" | Overstated. The auto-discovering loop checks ONLY `styles.previewBackdrop`; the `position: fixed` and import bans are scoped to `VisualizerCoverageSection.tsx` alone. The repo-wide protection is thinner than claimed. |
| E2 "reorders or re-nests WILL fail" | Re-nesting will NOT - the assertions are `indexOf` comparisons over source text, blind to nesting. Only REORDERING fails. This is why the wrappers go inside the section files. |
| E2 names one ordering test | There are **two**. `askAiSelection.wiring.test.ts:46-76` pins the same chain and the same anchor. |
| AC3 persistence "a ta- key" | ONE key: `ta-modules-bulkbar-groups-${courseUrl}`, a JSON id-to-boolean map read through a tolerant resolver (the `resolveScriptMinutes` precedent). |
| AC7's summary | NOT exhaustive. C's AC6 (consolidate the three implementations of "select every item in this container") and C's AC7 (the search-scope decision) carry real files and real work and are in scope. |
| AC5 vs AC3 | Not a collision: AC5 governs CONTROLS, `<details>` is layout, `.adaptDisclosure` has 14 sites. Stated so step 10 does not raise it. |
| AC11 | Each near-dead control carries `nearDead: {why, recommendation}` in the model, so the report IS the model and a test pins the set. |
| AC8 vs AC7 | AC8's "name the control" and AC7's three-state label are two strings for one control. Derive AC8's sentence from the same constant. |

### D3. The unmount question - answered, and a forward rule

**A native `<details>` does NOT unmount its body**; the browser hides it and
React keeps it mounted. So no control stops mounting under collapse - **as
long as nobody writes `{open && <body/>}`. That is a hard rule.** Cost: no
render saving, only space. The ask was space; record it in Limits.

Independently, all three working persistence effects live in hooks called
unconditionally from `ModulesView`, outside the bar's own gate, so collapse
cannot break them. The risk is FORWARD: **all new `ta-` persistence goes in
`useBulkItemActions.ts` / `useBulkModuleActions.ts`, never in a `Section.tsx`**,
and the group-open state lives in `useBulkBarGroups.ts` called once from
`ModulesView`, not inside the 13+ `BulkBarGroup` instances.

### D4. Two traps that make a correct change fail its tests

1. **No arrow-function props at the six section render sites in
   `ModulesView.tsx`.** `askAiSelection.wiring.test.ts:113` slices the tag with
   `indexOf(">", start)`; an `onToggle={(id) => ...}` puts a `>` inside the tag
   and silently truncates the slice, failing assertions against correct code.
   Thread bare identifiers: `groups={bulkBarGroups}` `facts={bulkBarFacts}`.
2. **No apostrophes in comments inside JSX tags in the `ccStickyHeader`
   block.** `generatedPreviewModal.wiring.test.ts:107-121` records that one
   apostrophe throws and two silently truncate the depth walk, making every
   `not.toContain` pass vacuously. This has bitten once already.

### D5. The wave split

**Wave 0 - clear the ceiling (required, not optional).** `useLmsGeneration.ts`
995 and `useLmsGeneration.test.ts` exactly 1000, and AC9's new reason + test
for `templateId` has nowhere to land.
- **0A** `useLmsGeneration.ts` + new `lmsGenerationTypes.ts` (extract the type
  block, re-export - the `lmsGenerationKindHelpers.ts` structural-split
  precedent). Do NOT attempt to extract `refine`/`saveEdit`/`post`/`download`;
  they close over fifteen setters.
- **0B** `useLmsGeneration.test.ts` + new `lmsGenerationNotes.test.ts` and
  `lmsGenerationModuleTarget.test.ts`, split along existing describe blocks.

**Wave 1 - contracts and the selection half (4 concurrent).**
1A `bulkBarGroups.ts` + test. 1B `BulkBarGroup.tsx`, `useBulkBarGroups.ts` +
test. 1C `page.module.css` + new `bulkBarCss.test.ts` (AC6's grep test).
1D the whole selection half: new `moduleItemSelection.ts` + test,
`ModuleCard.tsx`, `useModuleSelection.ts`, `RepoFoldersSection.tsx`, new
`moduleCard.selection.wiring.test.ts`. **1D must not edit
`useModuleSelection.pruning.test.ts`** - it stays green as written, which is
the proof the consolidation preserved the key formats.

**Wave 2 - the sections (6 concurrent).** 2A `ModulesView.tsx` + the two
ordering wiring tests + new `bulkBar.wiring.test.ts`. 2B `BulkItemsSection.tsx`
+ new groups test. 2C `BulkModulesSection.tsx` + new wiring test (the "no test
file exists" gap). 2D the three read rows. 2E `VisualizerCoverageSection.tsx`.
2F `useBulkItemActions.ts` + `useBulkModuleActions.ts`.

**Every `<BulkBarGroup>` wrapper lives INSIDE its section file**, never in
`ModulesView.tsx`. That keeps the six render tags byte-identical, which is what
saves both ordering tests. **Neither bulk section may be split into one file
per group** - `bulkItemsSection.rubricSource.wiring.test.ts` anchors on four
in-file constructs and exists precisely because that file was once unpinned.

2A owns the test that polices 2E's file: 2A may not weaken
`visualizerCoverage.wiring.test.ts:145-161`.

### D6. Reachability risks, named

Four sections (Generate, Download, Ask AI, Coverage) have **no visibility gate
at all** today - they render because the bar renders. The likely regrouping
error is `visible: (f) => f.itemCount > 0`, which silently kills all four for a
MODULE-ONLY selection, which works today. **Pin
`visible(moduleCount: 1, itemCount: 0) === true` for all four.**

Also at risk: `Edit in detail`/`Edit page` (visibility is an anonymous IIFE
returning null on two branches - the easiest control in the bar to drop
unnoticed, and also AC11's top removal candidate, so it could vanish by
accident and be recorded as a decision); the six `bulkAddType`-conditional
predicates in `BulkModulesSection`, a file with **no test at all**; and both
sections' `sectionGate` refusal branch, which **must render as a static,
non-collapsible group** - never a `<details>`, or the refusal reason hides.

`descSharedState`'s "loading" fires on SELECTION CHANGE, not user action - if
`itemContent` were collapsible a collapsed group would hide an in-flight
fetch. It is not collapsible, because `Set description` makes the group
fan-out. **That is the tier rule paying for itself**, and it belongs in the
REGRESSION entry as the reason the rule is not merely tidy.

### D7. Rejected, with reasons - do not relitigate on preference

- **Popover anywhere in this bar** - four independent reasons: z-index 1300
  paints over the top bar with no precedent here and no way to verify it (no
  component is ever rendered); one section's tests ban the import outright; a
  Popover UNMOUNTS its content on close, which is the exact hazard `<details>`
  avoids; and closed content leaves the tab order and find-in-page, so E3's
  always-visible reasons become discoverable only by opening it.
- **ToggleButtonGroup mode switch** (the largest possible space win) - imposes
  mutual exclusivity on a selection that is not mutually exclusive, hides half
  the applicable actions, and makes AC8's module-vs-item mismatch LESS visible.
- **Tabs** - the repo's tab idiom is raw-`<button>` + CSS modules, which AC5
  forbids here.
- **MUI Accordion** - zero sites; new vocabulary duplicating `<details>`.
- **Splitting either bulk section into one file per group** - see D5.
- **Reordering the bar** (read-only to the bottom, destructive to the top) -
  breaks both ordering tests for cosmetic gain; AC1's separation is achieved by
  tier-driven styling, the `consequenceTag`, and collapsed summary lines. NEW
  EVIDENCE reopens this; a preference does not.
- **A compose/commit split** (fields collapsible, buttons static) - the largest
  win available under AC1, rejected because it separates every button from its
  field, doubles the group count, and invents a grammar with no precedent.

### D8. Nested scrollers

AC4's ceiling puts an `overflow-y: auto` bar inside `.ccHeaderBody`, which the
drag handle also makes scrollable. Two nested scrollers is a real artefact.
Acceptable (AC4 keeps the handle working) but it belongs in Limits rather than
being discovered at step 10.

## 4. Non-goals

- No change to which Set any bulk action reads. AC8 discloses the mismatch;
  rewiring thirteen actions is its own chunk.
- No change to the module checkbox's semantics (AC7).
- No new bulk action. B, D and F each add one, AFTER this lands.
- No conversion of any always-visible reason or hint into a tooltip (E3).

---

## 5. Testing reality - state it plainly

`vitest.config.ts:13-14`: node environment, collects only `src/**/*.test.ts`.
**No component is ever rendered.** Nothing in this chunk's suite can prove that
a group collapses, that an indeterminate checkbox paints, that the bar scrolls
at its ceiling, that tab order is sane, or that a screen reader announces a
group name. Every UI claim will be source-text only, and the REGRESSION entry
must say so rather than implying coverage that does not exist.

Genuinely testable: the three-state selection predicate, the persistence key
functions, the group model as data (if the groups are declared as a structure
rather than inline JSX - which is the design that makes them testable at all),
and the dead-CSS deletion (a grep-based test that the removed class names have
no references).

Existing coverage to respect: `BulkModulesSection.tsx` has **no test at all**
(15 controls); `BulkItemsSection.tsx` has one narrow rubric-source guard;
`visualizerCoverage.wiring.test.ts` is thorough and pins ordering (E2).
Source-text assertions must pin the FACT and the ORDERING, never the spelling -
this repo has been bitten twice, most recently in this same feature area.

---

## 6. Gates

```
npx tsc --noEmit
npx eslint <touched files>
npx vitest run
npx next build      # compile line only
```

No emojis (`src/lib/no-emojis.test.ts` owns the rule; never hand-roll a scan,
and note this area just had a mojibake incident - ASCII only in comments).
1000-line ceiling counted with `@(Get-Content path).Count`.
**`useLmsGeneration.ts` is at 995 and `useLmsGeneration.test.ts` at exactly
1000. Both must be SPLIT before this chunk touches them.**
Baseline entering this chunk: 618 test files / 12338 tests, all passing.
