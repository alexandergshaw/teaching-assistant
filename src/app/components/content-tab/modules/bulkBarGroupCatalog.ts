// The bulk bar's 13 group literals, extracted from ./bulkBarGroups.ts to
// keep that file under this repo's 1000-line ceiling - a STRUCTURAL split
// only, no behaviour change, same discipline lmsGenerationKindHelpers.ts's
// own header describes: "each piece re-exported so every existing import
// keeps compiling unchanged". `BULK_BAR_GROUPS` is re-exported from
// "./bulkBarGroups" (see that file's own re-export block, just after its
// imports) so BulkBarGroup.tsx, useBulkBarGroups.ts, every Section.tsx and
// bulkBarGroups.test.ts keep importing everything - the types, TIER_RANK,
// the four functions, and this array - from "./bulkBarGroups" with no
// change of their own. This file's every doc comment moved here verbatim
// from where it used to live in ./bulkBarGroups.ts.
//
// Deliberately a PURE module, no React import, no MUI import, no .tsx
// import of any kind - same discipline as ./bulkBarGroups.ts itself,
// ./contentSourceGating.ts and src/lib/course-tasks-catalog.ts. The ONE
// exception, per the acceptance criteria, is a type-only import of
// GenerationKindId, used to type the ten Generate-row kind buttons so their
// ids cannot drift from the real kind catalog. That import comes from
// @/lib/lms-generation/kinds - the type's real, dependency-free owner -
// and DELIBERATELY NOT from ./useLmsGeneration, which merely re-exports the
// same type but is itself a "use client" React hook. `import type` erases
// at compile time either way, so there is no RUNTIME coupling through
// either path today, but importing from the hook puts a client-hook edge in
// this file's module graph, one `import type` -> `import` typo away from
// making this leaf un-testable in a node suite. Import from the leaf.
//
// THE 65-CONTROL RECONCILIATION (worth reading before editing this file):
// docs/bulk-bar-reorganization-acceptance-criteria.md section 0 counts 65
// interactive controls for ONE specific worst-case render (one module
// selected, its items also selected, an Assignment-shaped "Add to each" in
// progress, a completed visualizer scan with both covered concepts and
// creatable gaps). This file's control catalog is bigger than 65, because it
// declares every control that CAN exist across every mutually exclusive
// `bulkAddType` branch (File vs Assignment vs Quiz vs ...), not just the ones
// visible in that one scenario. `visible(facts)` is what collapses the full
// catalog back down to 65 for that specific fact combination - see
// bulkBarGroups.test.ts for the per-group visible-count reconciliation.

import type { GenerationKindId } from "@/lib/lms-generation/kinds";
import type { BulkBarControlDef, BulkBarGroupDef } from "./bulkBarGroups";

// ---------------------------------------------------------------------------
// The catalog

const ITEM_TYPE_UNPERSISTED =
  "Applies to whatever is selected right now; the selection itself, not a remembered value, determines the target, and a stale saved value here would silently point at the wrong items after a reload.";

const MODAL_OPENER_UNPERSISTED =
  "Opens an existing editor/modal; there is no value on this control itself to remember between reloads.";

const COMPOSE_FIELD_UNPERSISTED =
  "Free-text scratch content for the very next click that consumes it; carrying it across a reload risks silently reapplying old text to a different selection.";

const ONE_CLICK_UNPERSISTED =
  "A one-click action with no state of its own to remember; the selection determines what it targets, not a stored value.";

// Finding 8 (step-10 review): COMPOSE_FIELD_UNPERSISTED's "Free-text scratch
// content" wording was applied to eight controls that are not free text at
// all - six mode/value inputs for the SAME compose flow (a select, a
// datetime, or a number), and two selects that name an entry in a list that
// can shrink between sessions, which already has a real, correct reason
// written out in useBulkModuleActions.ts (see moduleAddFileExistingSelect's
// and moduleAddRubricSelect's own comments there). These two new constants
// give each family its own accurate wording instead of reusing the
// free-text one.
const COMPOSE_VALUE_UNPERSISTED =
  "A choice or value for the batch of items the next \"Add\" click creates - not free text, but consumed just as immediately; a value restored from a prior compose session (a past due date, a stale point count, a leftover item type or file format) would silently apply to a different batch of new items the instructor never configured this way.";

const FOREIGN_KEY_UNPERSISTED =
  "Names an entry in a list that can shrink or change between sessions (an existing file, or a rubric); a restored id could silently attach the wrong object, or one deleted since, to every selected module. Matches the real reason recorded in useBulkModuleActions.ts next to the state this control reads.";

const RUBRIC_NEAR_DEAD = {
  why: "Renders as a full-width, disabled \"No rubrics\" select whenever the course has none, rather than being omitted or replaced with a short sentence.",
  recommendation: "Collapse to a single inline sentence when rubricsCount is 0 instead of a full-width disabled select.",
};

/** BulkItemsSection's "Items" row (29 controls total in that file - see this
 * file's header for the reconciliation). Publish/Unpublish are fan-out-write
 * per D2's correction, not the benign baseline the acceptance criteria's own
 * first draft assumed. */
const itemsGroup: BulkBarGroupDef = {
  id: "items",
  label: "Items",
  disclosure: true,
  defaultOpen: true,
  consequenceTag: "Publish/Unpublish apply to every selected item at once; a later Unpublish cannot restore a mixed prior state.",
  visible: (f) => f.itemCount > 0,
  controls: [
    { id: "itemsPublish", kind: "button", label: "Publish", tier: "fan-out-write", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    { id: "itemsUnpublish", kind: "button", label: "Unpublish", tier: "fan-out-write", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    {
      id: "itemsEditInDetailOrPage",
      kind: "button",
      label: "Edit in detail / Edit page",
      tier: "read-only",
      visible: (f) => f.itemCount === 1 && f.singleItemEditKind !== "none",
      persistKey: null,
      unpersistedReason: MODAL_OPENER_UNPERSISTED,
      nearDead: {
        why: "A single-item affordance stranded inside a BULK bar, duplicating the Edit control ModuleItemRow already renders for the same item.",
        recommendation: "Remove once confirmed nobody relies on reaching this specific editor from the bulk bar rather than the row.",
      },
    },
  ],
};

/** BulkItemsSection's "Content" row. "Set description" is one of the three
 * fan-out writes AC1's own text names explicitly (it overwrites the body of
 * every selected item); "Add to selected quizzes" is fan-out too (appends
 * questions to every selected quiz), not merely a lower-weight sibling. */
const contentGroup: BulkBarGroupDef = {
  id: "content",
  label: "Content",
  disclosure: true,
  defaultOpen: true,
  consequenceTag: "Set description overwrites the description/body on every selected item at once.",
  visible: (f) => f.itemCount > 0,
  controls: [
    { id: "itemsDescriptionText", kind: "textField", label: "Description", tier: "read-only", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: COMPOSE_FIELD_UNPERSISTED },
    { id: "itemsSetDescription", kind: "button", label: "Set description", tier: "fan-out-write", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    { id: "itemsEditQuestions", kind: "button", label: "Edit questions", tier: "read-only", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: MODAL_OPENER_UNPERSISTED },
    {
      id: "itemsAddToSelectedQuizzes",
      kind: "button",
      label: "Add to selected quizzes",
      tier: "fan-out-write",
      // Always RENDERED once the group is visible - only its disabled state
      // depends on bulkItemsQuestionsCount (see BulkItemsSection.tsx's own
      // `disabled={opBusy || bulkItemsQuestions.length === 0}`). Gating
      // `visible` on that count instead would under-count this row against
      // the acceptance criteria's own 29, which counts it unconditionally.
      visible: (f) => f.itemCount > 0,
      persistKey: null,
      unpersistedReason: ONE_CLICK_UNPERSISTED,
      nearDead: {
        why: "Disabled on first render of every selection until the sibling Edit-questions modal has produced at least one question, so it is inert far more often than not.",
        recommendation: "Consider opening the Edit-questions modal directly from this button when it would otherwise be disabled, instead of shipping an inert twin control.",
      },
    },
  ],
};

const dueDatesGroup: BulkBarGroupDef = {
  id: "dueDates",
  label: "Due dates",
  disclosure: true,
  defaultOpen: true,
  consequenceTag: "Due-date writes (Set / Shift / Stagger) apply to every selected gradable at once.",
  visible: (f) => f.itemCount > 0,
  controls: [
    { id: "itemsDueDate", kind: "textField", label: "Due date", tier: "read-only", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ITEM_TYPE_UNPERSISTED },
    { id: "itemsSetDue", kind: "button", label: "Set", tier: "fan-out-write", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    { id: "itemsShiftDaysNumber", kind: "textField", label: "Days to shift", tier: "read-only", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ITEM_TYPE_UNPERSISTED },
    { id: "itemsShiftDueButton", kind: "button", label: "Shift days", tier: "fan-out-write", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    { id: "itemsStaggerOffset", kind: "textField", label: "Stagger interval", tier: "read-only", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ITEM_TYPE_UNPERSISTED },
    { id: "itemsStaggerUnit", kind: "select", label: "Stagger interval unit", tier: "read-only", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ITEM_TYPE_UNPERSISTED },
    { id: "itemsStaggerButton", kind: "button", label: "Stagger", tier: "fan-out-write", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
  ],
};

const gradingGroup: BulkBarGroupDef = {
  id: "grading",
  label: "Grading",
  disclosure: true,
  defaultOpen: true,
  consequenceTag: "Set points / Associate rubric apply to every selected item at once.",
  visible: (f) => f.itemCount > 0,
  controls: [
    { id: "itemsPoints", kind: "textField", label: "Points", tier: "read-only", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ITEM_TYPE_UNPERSISTED },
    { id: "itemsSetPoints", kind: "button", label: "Set points", tier: "fan-out-write", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    {
      id: "itemsRubricSelect",
      kind: "select",
      label: "Rubric",
      tier: "read-only",
      visible: (f) => f.itemCount > 0,
      persistKey: null,
      unpersistedReason: ITEM_TYPE_UNPERSISTED,
      nearDead: RUBRIC_NEAR_DEAD,
    },
    { id: "itemsAssociateRubric", kind: "button", label: "Associate", tier: "fan-out-write", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    { id: "itemsEditRubric", kind: "button", label: "Edit", tier: "read-only", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: MODAL_OPENER_UNPERSISTED },
    { id: "itemsNewRubric", kind: "button", label: "New rubric", tier: "read-only", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: MODAL_OPENER_UNPERSISTED },
  ],
};

const submissionTypeGroup: BulkBarGroupDef = {
  id: "submissionType",
  label: "Submission type",
  disclosure: true,
  defaultOpen: true,
  consequenceTag: "Apply changes the submission type on every selected assignment at once.",
  visible: (f) => f.itemCount > 0,
  controls: [
    { id: "itemsSubTypeSelect", kind: "select", label: "Submission type", tier: "read-only", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ITEM_TYPE_UNPERSISTED },
    { id: "itemsApplySubType", kind: "button", label: "Apply", tier: "fan-out-write", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
  ],
};

/** BulkItemsSection's "Move" row, including "Remove" (AC1's second named
 * fan-out write) and "Delete from Canvas" (destructive, already two-click
 * confirmed via confirmDeleteContent/isConfirmArmed). Kept as ONE group
 * rather than splitting Delete out on its own: `groupTier`'s max-over-
 * members rule already forces this whole group to render at destructive
 * weight and stay force-open, which is what AC1 actually requires - a
 * separate group would only be justified by a DOM restructuring this file
 * does not own (that decision belongs to whichever wave edits the JSX). */
const moveGroup: BulkBarGroupDef = {
  id: "move",
  label: "Move",
  disclosure: true,
  defaultOpen: true,
  consequenceTag: "Delete from Canvas is irreversible; Move/Remove apply to every selected item at once.",
  visible: (f) => f.itemCount > 0,
  controls: [
    { id: "itemsModuleShiftNumber", kind: "textField", label: "Modules to shift by", tier: "read-only", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ITEM_TYPE_UNPERSISTED },
    { id: "itemsShiftUp", kind: "button", label: "Shift up", tier: "fan-out-write", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    { id: "itemsShiftDown", kind: "button", label: "Shift down", tier: "fan-out-write", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    { id: "itemsTargetModuleSelect", kind: "select", label: "Module to move items into", tier: "read-only", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ITEM_TYPE_UNPERSISTED },
    { id: "itemsMoveButton", kind: "button", label: "Move", tier: "fan-out-write", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    { id: "itemsRemoveButton", kind: "button", label: "Remove", tier: "fan-out-write", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    {
      id: "itemsDeleteButton",
      kind: "button",
      label: "Delete from Canvas",
      tier: "destructive",
      visible: (f) => f.itemCount > 0,
      // Already persists nothing AND needs no unpersistedReason exemption
      // for a value - it has none - but I6 still requires the field, so the
      // reason is stated for consistency with every other control here.
      persistKey: null,
      unpersistedReason: ONE_CLICK_UNPERSISTED,
    },
  ],
};

/** BulkModulesSection's "Modules" row - whole-module publish/unpublish/
 * delete. Delete already carries a two-click confirm (confirmDeleteModules). */
const modulesGroup: BulkBarGroupDef = {
  id: "modules",
  label: "Modules",
  disclosure: true,
  defaultOpen: true,
  consequenceTag: "Delete removes the selected modules and everything inside them; Publish/Unpublish apply to every selected module at once.",
  visible: (f) => f.moduleCount > 0,
  controls: [
    { id: "modulesPublish", kind: "button", label: "Publish", tier: "fan-out-write", visible: (f) => f.moduleCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    { id: "modulesUnpublish", kind: "button", label: "Unpublish", tier: "fan-out-write", visible: (f) => f.moduleCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    { id: "modulesDelete", kind: "button", label: "Delete", tier: "destructive", visible: (f) => f.moduleCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
  ],
};

/**
 * BulkModulesSection's "Add to each" flow, merged from six conditionally-
 * rendered `bulkRow`s into one group with nested `moduleAdd*` members (see
 * BulkBarGroupId's own doc comment in ./bulkBarGroups.ts for why).
 * `moduleAddButton` ("Add") is AC1's third named fan-out write (creates one
 * new Canvas item in EVERY selected module) and is what pins this whole
 * group's derived tier to fan-out-write regardless of which `bulkAddType`
 * branch is active. "Generate with AI" is a real, scoped, reversible write
 * (see its own entry below), not read-only - it never itself reaches
 * Canvas, but it does call a model and spend quota.
 */
const addToEachGroup: BulkBarGroupDef = {
  id: "addToEach",
  label: "Add to each",
  disclosure: true,
  defaultOpen: true,
  consequenceTag: "Add creates one new Canvas item in every selected module at once.",
  visible: (f) => f.moduleCount > 0,
  controls: [
    { id: "moduleAddTypeSelect", kind: "select", label: "Type of item to add", tier: "read-only", visible: (f) => f.moduleCount > 0, persistKey: null, unpersistedReason: COMPOSE_VALUE_UNPERSISTED },
    { id: "moduleAddPattern", kind: "textField", label: "Name pattern", tier: "read-only", visible: (f) => f.moduleCount > 0, persistKey: null, unpersistedReason: COMPOSE_FIELD_UNPERSISTED },
    // CORRECTED at the wave-2 gate, 2026-08-23. This entry declared
    // `persistKey: null` with COMPOSE_FIELD_UNPERSISTED, and both halves were
    // wrong: it is a select, not free text, and it is `bulkAddSubType` in
    // useBulkModuleActions.ts, which has persisted under this key for some
    // time and is one of the three controls AC9 itself names as ALREADY
    // WORKING. 2F caught the contradiction and - correctly - refused to
    // "fix" the code to match the spec, which would have deleted working
    // persistence to satisfy a wrong catalog row. The catalog was the thing
    // that was wrong, so the catalog is what changed.
    //
    // The key is deliberately NOT per-course, unlike its newer siblings
    // scriptMinutes and deckTemplate which interpolate courseUrl. That is a
    // real inconsistency, but changing it now would silently discard every
    // instructor's stored value on first load, so it stays as-is and is
    // recorded here instead.
    { id: "moduleAddSubTypeSelect", kind: "select", label: "Submission type for the new assignments", tier: "read-only", visible: (f) => f.moduleCount > 0 && f.bulkAddType === "Assignment", persistKey: "ta-modules-bulkadd-stype" },
    { id: "moduleAddButton", kind: "button", label: "Add", tier: "fan-out-write", visible: (f) => f.moduleCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    { id: "moduleAddFileFormatSelect", kind: "select", label: "Format of the generated file", tier: "read-only", visible: (f) => f.moduleCount > 0 && f.bulkAddType === "File", persistKey: null, unpersistedReason: COMPOSE_VALUE_UNPERSISTED },
    { id: "moduleAddFileExistingSelect", kind: "select", label: "Existing file to add to each module", tier: "read-only", visible: (f) => f.moduleCount > 0 && f.bulkAddType === "File", persistKey: null, unpersistedReason: FOREIGN_KEY_UNPERSISTED },
    { id: "moduleAddDiscardFile", kind: "button", label: "Discard AI file", tier: "read-only", visible: (f) => f.moduleCount > 0 && f.bulkAddType === "File" && f.bulkAddFileContentPresent, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    { id: "moduleAddDue", kind: "textField", label: "First due date for the new items", tier: "read-only", visible: (f) => f.moduleCount > 0 && ["Assignment", "Quiz", "Discussion"].includes(f.bulkAddType), persistKey: null, unpersistedReason: COMPOSE_VALUE_UNPERSISTED },
    { id: "moduleAddStaggerOffset", kind: "textField", label: "Stagger interval between modules", tier: "read-only", visible: (f) => f.moduleCount > 0 && ["Assignment", "Quiz", "Discussion"].includes(f.bulkAddType), persistKey: null, unpersistedReason: COMPOSE_VALUE_UNPERSISTED },
    { id: "moduleAddStaggerUnit", kind: "select", label: "Stagger interval unit", tier: "read-only", visible: (f) => f.moduleCount > 0 && ["Assignment", "Quiz", "Discussion"].includes(f.bulkAddType), persistKey: null, unpersistedReason: COMPOSE_VALUE_UNPERSISTED },
    { id: "moduleAddPoints", kind: "textField", label: "Points for the new items", tier: "read-only", visible: (f) => f.moduleCount > 0 && ["Assignment", "Quiz"].includes(f.bulkAddType), persistKey: null, unpersistedReason: COMPOSE_VALUE_UNPERSISTED },
    { id: "moduleAddRubricSelect", kind: "select", label: "Rubric for the new items", tier: "read-only", visible: (f) => f.moduleCount > 0 && f.bulkAddType === "Assignment", persistKey: null, unpersistedReason: FOREIGN_KEY_UNPERSISTED, nearDead: RUBRIC_NEAR_DEAD },
    { id: "moduleAddBody", kind: "textField", label: "Description / body / file content for the new items", tier: "read-only", visible: (f) => f.moduleCount > 0 && ["Assignment", "Quiz", "Discussion", "Page", "File"].includes(f.bulkAddType), persistKey: null, unpersistedReason: COMPOSE_FIELD_UNPERSISTED },
    { id: "moduleAddQuestionsEdit", kind: "button", label: "Edit questions", tier: "read-only", visible: (f) => f.moduleCount > 0 && f.bulkAddType === "Quiz", persistKey: null, unpersistedReason: MODAL_OPENER_UNPERSISTED },
    { id: "moduleAddQuestionsClear", kind: "button", label: "Clear", tier: "read-only", visible: (f) => f.moduleCount > 0 && f.bulkAddType === "Quiz" && f.bulkAddQuestionsCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    { id: "moduleAddAiPrompt", kind: "textField", label: "AI prompt for the new content", tier: "read-only", visible: (f) => f.moduleCount > 0 && f.bulkAddType !== "SubHeader", persistKey: null, unpersistedReason: COMPOSE_FIELD_UNPERSISTED },
    // "Generate with AI" is a real, scoped, reversible write (calls a model
    // to draft the description/file content above, spends quota) even
    // though it never itself reaches Canvas - only the later "Add" click
    // does. See ./bulkBarGroups.ts's header comment on why "reversible-write"
    // is a distinct tier from "read-only" rather than being folded into it.
    { id: "moduleAddAiGenerate", kind: "button", label: "Generate with AI", tier: "reversible-write", visible: (f) => f.moduleCount > 0 && f.bulkAddType !== "SubHeader", persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
  ],
};

/**
 * BulkModulesSection's "Current events assignment" group - docs/current-
 * events-assignment-from-modules-acceptance-criteria.md section 3b/D5. A NEW
 * sibling of `addToEach`, not folded into it, for four reasons D5 states:
 * `consequenceTag` is per-group and `addToEach`'s already names exactly one
 * write; `addToEach`'s own `bulkAddPoints`/`bulkAddRubricId` state outlives
 * its field's visibility (the hidden-input hazard W3 names); `addToEach`'s
 * own comment says its members are "one coherent flow, never usable
 * independently", which a zero-input one-click generator is not part of; and
 * canary hygiene - a separate group moves the group-count canary and leaves
 * the `modules + addToEach = 15` visible-control canary alone, so nothing
 * would otherwise prove the capability landed in the right bucket.
 *
 * The button is named "Create one per module", not "Current events" (W4):
 * the Generate row already has a "Current events" button that produces an
 * INSTRUCTOR research report at reversible-write tier, and two
 * near-identically named controls with opposite consequences in one bar is
 * exactly what this group model exists to prevent. The GROUP carries the
 * noun; the BUTTON carries the verb.
 *
 * This group's tier is fan-out-write BY DERIVATION, not by declaration: its
 * one control is visible whenever the group itself is (`visible` is
 * identical on both), so `groupTier` always resolves to that control's own
 * "fan-out-write" tier, which makes `mayCollapse` always false and
 * `groupOpen` return true at its very first line - see bulkBarGroups.test.ts
 * for the test that pins this as a theorem, not a declaration.
 */
const currentEventsGroup: BulkBarGroupDef = {
  id: "currentEvents",
  label: "Current events assignment",
  disclosure: true,
  defaultOpen: true,
  consequenceTag:
    "One click creates a new graded Canvas assignment inside EVERY selected module - one per module, each with its own generated prompt.",
  visible: (f) => f.moduleCount > 0,
  controls: [
    {
      id: "moduleCurrentEventsButton",
      kind: "button",
      label: "Create one per module",
      tier: "fan-out-write",
      visible: (f) => f.moduleCount > 0,
      persistKey: null,
      unpersistedReason: ONE_CLICK_UNPERSISTED,
    },
  ],
};

/** GenerateFromSelectionSection - never writes to CANVAS by itself (its own
 * header comment: "some kinds can be posted afterward as a separate,
 * explicit step"), but every kind button IS a reversible-write, not
 * read-only: each one calls a model, spends quota, and persists a new
 * `generated_artifacts` version - a real write, just scoped to one artifact
 * and reversible (a new version, never an overwrite), unlike a fan-out
 * write across the whole selection. See ./bulkBarGroups.ts's header comment
 * for why that distinction is load-bearing rather than pedantic. Kind
 * button ids are typed against the real GenerationKindId union, the one
 * permitted non-type import exception this file makes, so a kind added to
 * or removed from @/lib/lms-generation/kinds surfaces here as a type error
 * rather than a silent drift. */
const GENERATE_KIND_LABELS: Record<GenerationKindId, string> = {
  qa: "Q&A",
  currentEvents: "Current events",
  decks: "Slide deck",
  objectives: "Objectives",
  assignments: "Assignments",
  knowledgeChecks: "Knowledge checks",
  announcements: "Announcements",
  scripts: "Video script",
  resources: "Resources",
  introDiscussion: "Intro discussion",
};

function generateKindControl(kindId: GenerationKindId): BulkBarControlDef {
  return {
    id: `generateKind_${kindId}`,
    kind: "button",
    label: GENERATE_KIND_LABELS[kindId],
    tier: "reversible-write",
    // offerableGenerationKinds does not vary per kind (GenerateFromSelectionSection.tsx's
    // own header comment) - every kind shares this one condition. D6 names
    // this exact fact as the likeliest regrouping error: a naive
    // `visible: (f) => f.itemCount > 0` would silently kill all ten (and the
    // rest of this group) for a module-only selection, which works today.
    visible: (f) => f.generationKindsCount > 0,
    persistKey: null,
    unpersistedReason: ONE_CLICK_UNPERSISTED,
  };
}

const generateGroup: BulkBarGroupDef = {
  id: "generate",
  label: "Generate",
  disclosure: true,
  defaultOpen: true,
  consequenceTag: null,
  visible: (f) => f.generationKindsCount > 0,
  controls: [
    {
      id: "generateDeckTemplateSelect",
      kind: "select",
      label: "Deck template",
      tier: "read-only",
      visible: (f) => f.generationKindsCount > 0 && f.offersDeck,
      // Wave 0 closed the one AC9 violation the acceptance criteria's D2
      // table named ("the deck-template templateId is unpersisted with no
      // reason anywhere") - it now persists via deckTemplateKey(courseUrl)
      // in useLmsGeneration.ts, the same per-course interpolation
      // scriptMinutesKey/discussionCheckpointsKey use below.
      persistKey: "ta-lms-deck-template",
    },
    {
      id: "generateScriptLengthSelect",
      kind: "select",
      label: "Video length",
      tier: "read-only",
      visible: (f) => f.generationKindsCount > 0 && f.offersScript,
      persistKey: "ta-lms-script-minutes",
    },
    {
      id: "generateCheckpointsCheckbox",
      kind: "checkbox",
      label: "Use Canvas discussion checkpoints",
      tier: "read-only",
      visible: (f) => f.generationKindsCount > 0 && f.offersIntroDiscussion,
      persistKey: "ta-lms-discussion-checkpoints",
    },
    ...(Object.keys(GENERATE_KIND_LABELS) as GenerationKindId[]).map(generateKindControl),
    { id: "generateDownloadDiagLog", kind: "button", label: "Download diagnostic log", tier: "read-only", visible: (f) => f.generationKindsCount > 0 && f.hasDiagLog, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
  ],
};

const DOWNLOAD_UNPERSISTED =
  "No textbox/select/checkbox on this control - a one-click download with no state to remember (DownloadSelectionSection.tsx's own header comment).";

/** DownloadSelectionSection - AC8: a READ, never a write, by that file's own
 * header comment; `gateOperation` is deliberately not called there and
 * neither control ever reaches Canvas. */
const downloadGroup: BulkBarGroupDef = {
  id: "download",
  label: "Download",
  disclosure: true,
  defaultOpen: false,
  consequenceTag: null,
  visible: (f) => f.moduleCount > 0 || f.itemCount > 0,
  controls: [
    { id: "downloadImscc", kind: "button", label: "Course export (.imscc)", tier: "read-only", visible: (f) => f.moduleCount > 0 || f.itemCount > 0, persistKey: null, unpersistedReason: DOWNLOAD_UNPERSISTED },
    { id: "downloadZip", kind: "button", label: "Files (.zip)", tier: "read-only", visible: (f) => f.moduleCount > 0 || f.itemCount > 0, persistKey: null, unpersistedReason: DOWNLOAD_UNPERSISTED },
  ],
};

/** AskAiSelectionSection - a read, per that file's own header comment. */
const askAiGroup: BulkBarGroupDef = {
  id: "askAi",
  label: "Ask AI",
  disclosure: true,
  defaultOpen: false,
  consequenceTag: null,
  visible: (f) => f.moduleCount > 0 || f.itemCount > 0,
  controls: [
    {
      id: "askAiButton",
      kind: "button",
      label: "Ask AI",
      tier: "read-only",
      visible: (f) => f.moduleCount > 0 || f.itemCount > 0,
      persistKey: null,
      unpersistedReason: "No textbox/select/checkbox on this control - a one-click open with no state to remember (AskAiSelectionSection.tsx's own header comment).",
    },
  ],
};

/**
 * VisualizerCoverageSection - the one group whose tier is a genuine function
 * of facts, not just of which mutually-exclusive input branch is active
 * (D1's own reason ./bulkBarGroups.ts has a `groupTier` function at all
 * rather than a per-group constant): read-only before a scan has produced
 * anything to act on, destructive once Link and/or Create become offerable,
 * because both already carry a two-click confirm-arm (`linkArmed`/
 * `createArmed`) for a write this app cannot undo from here - Create
 * commits to a GitHub repo this project does not own.
 */
const visualizerCoverageGroup: BulkBarGroupDef = {
  id: "visualizerCoverage",
  label: "Visualizer coverage",
  disclosure: true,
  defaultOpen: false,
  consequenceTag: "Link/Create write into Canvas or the visualizer app's own external repository once armed.",
  visible: (f) => f.moduleCount > 0 || f.itemCount > 0,
  controls: [
    { id: "visualizerScan", kind: "button", label: "Scan for visualizer coverage", tier: "read-only", visible: (f) => f.moduleCount > 0 || f.itemCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    // Precedent named directly in the acceptance criteria: useVisualizerCoverage.ts:447
    // mirrors useLmsGeneration's own un-persisted post-target choice - a
    // saved module could silently point at content that no longer matches
    // the current scan.
    {
      id: "visualizerModuleChoiceSelect",
      kind: "select",
      label: "Link into module",
      tier: "read-only",
      visible: (f) => f.coverageScanned && f.coveredCount > 0,
      persistKey: null,
      unpersistedReason: "Mirrors useLmsGeneration's own un-persisted post-target choice (useVisualizerCoverage.ts:447) - a stored module target could silently outlive the scan it was chosen for.",
    },
    { id: "visualizerLink", kind: "button", label: "Link covered concepts into module", tier: "destructive", visible: (f) => f.coverageScanned && f.coveredCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
    { id: "visualizerCreate", kind: "button", label: "Create pages in the visualizer's GitHub repo", tier: "destructive", visible: (f) => f.coverageScanned && f.creatableGapsCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
  ],
};

/** The bar's own count-and-Clear line (`ModulesView.tsx`'s `bulkBarHead`) -
 * not a `.bulkLabel` span, never a `<details>` (`disclosure: false`), always
 * open. Modeled here anyway because "Clear" is a real interactive control
 * and section 0's own 65-count includes it. */
const headGroup: BulkBarGroupDef = {
  id: "head",
  label: "Selection",
  disclosure: false,
  defaultOpen: true,
  consequenceTag: null,
  visible: (f) => f.moduleCount > 0 || f.itemCount > 0,
  controls: [
    { id: "headClearSelection", kind: "button", label: "Clear", tier: "read-only", visible: (f) => f.moduleCount > 0 || f.itemCount > 0, persistKey: null, unpersistedReason: "Clearing the selection is a one-off action; there is nothing about it worth remembering across a reload." },
  ],
};

/**
 * All fourteen groups, in the bar's rendered order. ORDER HERE IS NOT THE
 * BAR'S DOM ORDER CONTRACT - `visualizerCoverage.wiring.test.ts:56` and
 * `askAiSelection.wiring.test.ts:46-76` pin the six section components'
 * render order directly in `ModulesView.tsx` (D2's correction: there are
 * two such ordering tests, not one), and this file has no opinion on that;
 * it is simply a convenient, readable order for the data itself.
 * `currentEventsGroup` is placed immediately after `addToEachGroup` per
 * docs/current-events-assignment-from-modules-acceptance-criteria.md
 * section 3b/D8's second trap: two existing tests slice from a group's
 * open tag to the first `</BulkBarGroup>`, so a group inserted BETWEEN
 * `addToEach` and another group would land inside those slices.
 */
export const BULK_BAR_GROUPS: BulkBarGroupDef[] = [
  headGroup,
  itemsGroup,
  contentGroup,
  dueDatesGroup,
  gradingGroup,
  submissionTypeGroup,
  moveGroup,
  modulesGroup,
  addToEachGroup,
  currentEventsGroup,
  generateGroup,
  downloadGroup,
  askAiGroup,
  visualizerCoverageGroup,
];
