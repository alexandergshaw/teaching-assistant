// The bulk bar's group literals (17 as of docs/scheduled-publishing-from-
// modules-acceptance-criteria.md, F6/F7/F10, the FINAL contract for that
// document), extracted from ./bulkBarGroups.ts to
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
// This file was ITSELF split a second time, for the same reason: the
// "Generate" group's declarations (GENERATE_KIND_LABELS, generateKindControl,
// generateGroup) moved out to ./bulkBarGroupCatalog.generate.ts once this
// file grew past the ceiling again, and `generateGroup` is imported back
// here so `BULK_BAR_GROUPS`, below, still lists it in the same position. See
// that file's own header for why the Generate group in particular was the
// piece to extract.
//
// Deliberately a PURE module, no React import, no MUI import, no .tsx
// import of any kind - same discipline as ./bulkBarGroups.ts itself,
// ./contentSourceGating.ts and src/lib/course-tasks-catalog.ts. This file no
// longer carries the one type-only exception the acceptance criteria
// describes (a GenerationKindId import, used to type the ten Generate-row
// kind buttons) - that exception moved with the Generate group itself to
// ./bulkBarGroupCatalog.generate.ts, which states the same reasoning
// unchanged: import from @/lib/lms-generation/kinds, the type's real,
// dependency-free owner, and DELIBERATELY NOT from ./useLmsGeneration, which
// merely re-exports the same type but is itself a "use client" React hook.
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

import type { BulkBarGroupDef } from "./bulkBarGroups";
import { generateGroup, ONE_CLICK_UNPERSISTED } from "./bulkBarGroupCatalog.generate";

// ---------------------------------------------------------------------------
// The catalog

const ITEM_TYPE_UNPERSISTED =
  "Applies to whatever is selected right now; the selection itself, not a remembered value, determines the target, and a stale saved value here would silently point at the wrong items after a reload.";

const MODAL_OPENER_UNPERSISTED =
  "Opens an existing editor/modal; there is no value on this control itself to remember between reloads.";

const COMPOSE_FIELD_UNPERSISTED =
  "Free-text scratch content for the very next click that consumes it; carrying it across a reload risks silently reapplying old text to a different selection.";

// Imported from ./bulkBarGroupCatalog.generate.ts, not declared here, even
// though this file's own sixteen other groups are its heaviest users - see
// that file's own header comment for why the ownership is reversed from
// where it reads as "belonging": this file already has to import
// `generateGroup` from there, so importing this constant in the other
// direction too would create a circular import between the two files, which
// is a real bug here, not merely untidy - see that file's header for the
// mechanism (a top-level object literal that bakes in `undefined` from a
// partially-initialized circular dependency).

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

// docs/scheduled-publishing-from-modules-acceptance-criteria.md, F7. F7
// explicitly overrides an earlier, more general requirement in the SAME
// document (AC9: "any new textbox/select persists per course under a `ta-`
// key") by pointing at a concrete precedent already in this bar:
// `itemsDueDate`, above, is an IDENTICAL datetime-local control in this same
// bulk bar and is `persistKey: null` under ITEM_TYPE_UNPERSISTED. F7's own
// words: "Follow the neighbour, and cite it, so `auditGroupModel`'s I6 is
// satisfied by precedent rather than by a new rationale." This constant does
// exactly that - it is ITEM_TYPE_UNPERSISTED's own reasoning, restated with
// the citation F7 asks for, rather than a freshly-invented one for a control
// that is, in every load-bearing respect, the same shape as its neighbour.
const RELEASE_DATE_UNPERSISTED =
  "Follows itemsDueDate, the identical datetime-local control already in this bulk bar: the release instant applies to whatever is selected right now, not a remembered value, and a value restored from a previous session would silently point at the wrong items after a reload (F7, docs/scheduled-publishing-from-modules-acceptance-criteria.md). F7 explicitly overrides that same document's earlier AC9, which asked every new textbox/select in this bar to persist - this is the one control where that general requirement is superseded by a cited, precedent-based exception rather than a fresh rationale.";

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
  // Extended for docs/rubric-bulk-action-acceptance-criteria.md, AC5: the
  // "generate and associate" control below is folded into THIS existing
  // group's own consequence sentence rather than declaring a second one -
  // see that control's own comment for why this joins "grading" instead of
  // becoming a sixteenth group.
  consequenceTag:
    "Set points / Associate rubric apply to every selected item at once; Generate & associate rubric additionally creates a new Canvas rubric (one per distinct point total in the selection) and associates it to every eligible item.",
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
    /**
     * docs/rubric-bulk-action-acceptance-criteria.md AC5. JOINS the existing
     * "grading" group rather than declaring a sixteenth one: chunk B's D5
     * gave four reasons `currentEvents` needed its own group (see that
     * group's own comment above), and three of the four do not hold here -
     * this group's `consequenceTag` already names a rubric-related fan-out
     * write and is merely extended, not duplicated; this control persists
     * nothing at all, so there is no hidden-input-outlives-visibility hazard
     * `addToEach`'s own comment warns about; and this is one more way to
     * write a rubric onto the selection, not an unrelated capability sharing
     * a home of convenience the way `currentEvents`/`carryPattern` are. The
     * fourth reason (canary hygiene: a new group would move a DIFFERENT
     * canary than the one this chunk is supposed to move) is exactly why
     * this joins "grading" INSTEAD of getting its own group - the AC5 canary
     * is this section's OWN 29 -> 30 visible-control count moving, which
     * only happens if the control lands inside a group BulkItemsSection
     * already owns, not a new sixteenth entry in BULK_BAR_GROUPS.
     *
     * "fan-out-write", not "destructive": like `itemsAssociateRubric`
     * immediately above, this creates/associates rather than overwriting or
     * deleting existing content, and AC3's bounded orphan-rubric risk is
     * reported (never auto-deleted), not a destructive action the way
     * `itemsDeleteButton` is.
     */
    { id: "itemsGenerateAssociateRubric", kind: "button", label: "Generate & associate rubric", tier: "fan-out-write", visible: (f) => f.itemCount > 0, persistKey: null, unpersistedReason: ONE_CLICK_UNPERSISTED },
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

/**
 * "Carry pattern forward" - docs/carry-module-pattern-forward-acceptance-
 * criteria.md, chunk D (sections 5 and 6 are the contract; section 6 wins
 * over section 5 wherever they disagree). Carries one module's item shape -
 * type, order/nesting, points, submission types, the relative due date, and
 * rubric ASSOCIATION - onto N other modules, regenerating each item's body
 * per target rather than copying it verbatim. A new sibling group, not
 * folded into `addToEach` or `currentEvents`, for the same canary-hygiene
 * reason currentEvents was its own group (see that group's own comment
 * above): this group's `consequenceTag` names exactly the one write IT can
 * perform, and folding it into an existing group would move that group's
 * own canaries instead of a new, dedicated one.
 *
 * D14: the TEMPLATE (source) module is chosen by `carryTemplateSelect`, a
 * plain select in the bar, seeded to the lowest-numbered selected module -
 * not a "use as template" button on the module row, which would escape
 * `pruneSelectionForModules` and repeat the exact shape of lie entry 329
 * point 3 records (a control whose visual state is not the state it
 * writes). With exactly one module selected there are no targets and the
 * group refuses with that reason stated (a runtime concern, owned by the
 * hook wiring this group up - out of this file's own scope, which is
 * declaring the control, not arming it); with zero the group is not visible
 * at all, matching every other module-scoped group's own `visible` here.
 *
 * D16: the target list is DELIBERATELY NOT pre-filtered to exclude the
 * source here or anywhere in this file. module-pattern-plan.ts's own
 * `excludedSourceTargetId` guard is what enforces the exclusion, and
 * filtering the source out of the UI list a second time would mean that
 * guard never runs in production, decaying into dead code exercised only by
 * its own unit test - the reachability lesson this repo has already
 * recorded once.
 *
 * D17 IS WHY THIS GROUP EXISTS AS DATA AT ALL, NOT MERELY AS THREE BUTTONS.
 * `carryApplyButton` - the group's actual fan-out write - lives INSIDE the
 * review modal (D19: it renders at ModulesView root via
 * ModulesViewSecondaryModals.tsx, because `.bulkBarBody`'s own
 * `max-height: min(60vh, 640px)` ceiling, entry 329's own space fix, cannot
 * host a targets-by-items grid), not in the bar itself. If that control were
 * declared `visible: () => false`, or simply omitted from this group's
 * `controls` array, it would never be a VISIBLE member of this group under
 * ANY facts - `groupTier`'s reduction (bulkBarGroups.ts) only ever looks at
 * `control.visible(facts)`-true controls - so the group's DERIVED tier would
 * stay `read-only` forever, `mayCollapse` would return `true` forever, and
 * the bar would offer a false sense of safety for the single most
 * destructive path it contains. The fix: `carryApplyButton` declares
 * `visible: (f) => f.carryReviewOpen`, so the group's derived tier is
 * `read-only` while the review is closed and rises to `fan-out-write` the
 * instant it opens, tracking REACHABILITY of the write rather than mere
 * presence of a module selection - see bulkBarGroups.test.ts for the theorem
 * this is pinned as (with an in-place sabotage), not merely a declaration
 * that happens to be true today.
 *
 * THE SAME HOLE EXISTED, SHIPPED, IN THE GENERATE GROUP BELOW - recorded
 * here when this group was written, deliberately left standing as out of
 * that chunk's scope, and CLOSED on 2026-08-24 by declaring
 * `generatePostToCanvas` with `visible: (f) => f.generatePostReachable`, on
 * exactly this group's pattern. `GeneratedPreviewModal.tsx`'s "Post to
 * Canvas" button writes directly to Canvas; until it was declared,
 * `groupTier`'s reduction could not see it, so `generateGroup`'s derived
 * tier topped out at "reversible-write" from the ten kind buttons and the
 * audit asserted in perpetuity that the group was safer than it is. The fix
 * also forced `generateGroup` to gain the `consequenceTag` I5 had never
 * demanded of it. Left in place rather than deleted, because the shape
 * generalises: ANY control this bar owns but renders elsewhere is invisible
 * to the derivation until something declares it, and that invisibility is
 * silent and green.
 */
const carryPatternGroup: BulkBarGroupDef = {
  id: "carryPattern",
  label: "Carry pattern forward",
  disclosure: true,
  defaultOpen: true,
  // Step-10 review, C11: the previous wording ("creating and, where offered,
  // overwriting items") advertised an overwrite capability that does not
  // exist on any path - carry-module-pattern.ts's apply action returns
  // "overwrite-not-implemented" for an "overwrite" decision, and
  // useCarryModulePattern.ts hardcodes `onExisting: "skip"`, so nothing ever
  // OFFERS an overwrite for this control to perform. A consequence tag that
  // overstates what a control does is worse than one that understates it -
  // this is the one always-visible sentence telling the instructor what
  // Apply does. Drop the overwrite clause entirely rather than soften it to
  // "may overwrite in future" or similar; state only what is true today.
  consequenceTag:
    "Apply performs a fan-out write - creating items across every target module chosen in the review - reachable only from inside that review, not from the bar itself.",
  visible: (f) => f.moduleCount > 0,
  controls: [
    {
      id: "carryTemplateSelect",
      kind: "select",
      label: "Use this module as the template",
      tier: "read-only",
      visible: (f) => f.moduleCount > 0,
      persistKey: null,
      // Follows the postModuleChoice precedent exactly, cited rather than
      // reinvented: lmsGenerationModuleTarget.ts's own "NO NEW `ta-`
      // LOCALSTORAGE KEY FOR THE POST TARGET" comment (AC10) states this
      // reasoning for a select with the same shape - its only correct value
      // is a function of the CURRENT selection, not something to persist. A
      // value restored from a previous session would look like a real
      // template choice while actually naming a module from a selection
      // that no longer exists, which is the exact stale-but-answered-
      // looking default that precedent's own AC6 exists to reject.
      unpersistedReason:
        "Follows the postModuleChoice precedent (lmsGenerationModuleTarget.ts's own \"NO NEW ta- LOCALSTORAGE KEY FOR THE POST TARGET\" comment, AC10): this select's only correct value is a function of the CURRENT module selection (seeded to the lowest-numbered selected module), not something to persist. A value restored from a previous session would look like a real template choice while naming a module from a selection that no longer exists.",
    },
    {
      id: "carryReviewButton",
      kind: "button",
      label: "Review carry plan",
      tier: "read-only",
      // Opens the review modal (D19) and writes nothing itself - the plan it
      // shows is derived with useMemo (D21), not committed until
      // carryApplyButton, inside that same modal, is clicked.
      visible: (f) => f.moduleCount > 0,
      persistKey: null,
      unpersistedReason: MODAL_OPENER_UNPERSISTED,
    },
    {
      id: "carryApplyButton",
      kind: "button",
      label: "Apply",
      tier: "fan-out-write",
      // D17 - THE control this whole group's design exists to get right.
      // Visible only while the review modal that hosts it is open. Do not
      // change this to `f.moduleCount > 0` (or any predicate true whenever
      // the GROUP itself is visible): that would make this control a
      // permanent, unconditional member of `groupTier`'s reduction and
      // defeats the reason it is gated on `carryReviewOpen` at all - see
      // this group's own header comment above for the failure this
      // predicate exists to prevent.
      visible: (f) => f.carryReviewOpen,
      persistKey: null,
      unpersistedReason: ONE_CLICK_UNPERSISTED,
    },
  ],
};

/**
 * The command interface - docs/llm-command-interface-acceptance-criteria.md
 * section 10, THE FINAL CONTRACT (sections 1-9 record an earlier design pass
 * G1-G17 correct; where this comment disagrees with anything in sections
 * 1-9, section 10 wins). One free-text box, submitted as a COMMAND to a
 * model that proposes rewriting titles/descriptions-or-bodies/module names
 * on the CURRENT selection, or creating new modules - reviewed in a modal
 * before anything reaches Canvas, per this repo's draft/review/commit rule.
 *
 * G7 - THE TIER, AND WHY THIS GROUP EXISTS AS DATA AT ALL, NOT MERELY AS
 * THREE CONTROLS. Two separate mistakes G7 exists to prevent, both already
 * paid for once each in this bar's history:
 *
 * 1. The tier is `fan-out-write`, NOT `destructive`. `destructive`
 *    (./bulkBarGroups.ts's own header comment) is reserved for the four
 *    writes that already carry a two-click confirm-arm in their owning hook
 *    (item delete, module delete, visualizer link, visualizer create). This
 *    control carries no confirm-arm of its own - its safeguard is the
 *    proposal review, not a second click - so it is `fan-out-write`, the
 *    same tier as `carryApplyButton`, its nearest analogue (an LLM-driven,
 *    multi-object Canvas write behind a review modal). `fan-out-write`
 *    already buys never-collapses plus a mandatory `consequenceTag` (I3/I5
 *    below); arming a control with a two-click confirm is a decision
 *    independent of its tier, not a consequence of declaring one.
 * 2. Never-collapse and the consequence tag do NOT follow merely from
 *    declaring `commandApplyButton`'s tier `fan-out-write` - believing that
 *    is REGRESSION entry 331 point 5's defect, and it would repeat here
 *    against the highest-consequence control this bar has ever added.
 *    `groupTier` (./bulkBarGroups.ts) reduces over controls whose
 *    `visible(facts)` is true; `commandApplyButton` renders INSIDE the
 *    proposal review modal (D19's own precedent: `.bulkBarBody`'s
 *    max-height ceiling cannot host a per-object review), not in the bar
 *    itself, so an unconditionally-visible declaration would never be seen
 *    by that reduction - the group would sit at `read-only`, stay
 *    collapsible, and `auditGroupModel`'s I5 would stop requiring a
 *    `consequenceTag`, asserting in perpetuity that this bar's most
 *    dangerous path is safe. The fix, copied exactly from
 *    `carryApplyButton` (D17 above): declare a dedicated fact,
 *    `commandProposalOpen` (BulkBarFacts, ./bulkBarGroups.ts), and gate
 *    `commandApplyButton` on it. The group's derived tier is then
 *    `read-only`/`reversible-write` while the review is closed and rises to
 *    `fan-out-write` the instant it opens, tracking REACHABILITY of the
 *    write rather than mere presence of a selection.
 *
 * G15 - AVAILABILITY AND PERSISTENCE.
 * - Availability: visible whenever anything is selected - a module alone,
 *   an item alone, or any mix - matching `download`/`askAi`/
 *   `visualizerCoverage`'s own `visible: (f) => f.moduleCount > 0 ||
 *   f.itemCount > 0`. Section 10's G15 corrects section 2's AC2, which
 *   framed this as exposing a NEW asymmetry; it is established precedent,
 *   not a new one.
 * - Persistence: `commandBox` is `persistKey: null`, deliberately
 *   CONTRADICTING section 8's AC8 (which asked for a `ta-`-prefixed
 *   persisted key) - section 10 overrides section 8 where they disagree, and
 *   this is one of the places they do. Do not "fix" this back to a
 *   persisted key. Every other free-text compose field in this bar
 *   (`itemsDescriptionText`, `moduleAddAiPrompt`, `moduleAddBody`, ...) is
 *   already `persistKey: null` under `COMPOSE_FIELD_UNPERSISTED` -
 *   "carrying it across a reload risks silently reapplying old text to a
 *   different selection" - and that reasoning is STRONGER here than for any
 *   of them: those fields feed the NEXT click's compose buffer, but this one
 *   is submitted as a COMMAND that a model turns directly into a live
 *   Canvas write. Reapplying stale text to a different selection would not
 *   just misinform a draft, it would misdirect an actual rewrite of
 *   existing course content.
 *
 * The `consequenceTag` states G1's re-verified fact rather than this
 * document's earlier, wrong "no undo in Canvas" claim: a page rewrite is
 * fully revertible from Canvas's own page history (`simply_versioned`,
 * unlimited), while an assignment, quiz or discussion rewrite has no
 * reachable undo at all - the inverse of what "no undo" would suggest, and
 * the reason the tag names the one type that is safer than the other three
 * rather than treating all rewrites as equally dangerous.
 */
const commandInterfaceGroup: BulkBarGroupDef = {
  id: "commandInterface",
  label: "Command",
  disclosure: true,
  defaultOpen: true,
  consequenceTag:
    "Apply rewrites titles, descriptions/bodies and module names directly in Canvas from text this app's model authored, and can create new modules - reachable only from inside the proposal review, not from the bar itself. A page rewrite can be reverted from Canvas's own page history; an assignment, quiz or discussion rewrite cannot.",
  visible: (f) => f.moduleCount > 0 || f.itemCount > 0,
  controls: [
    {
      id: "commandBox",
      kind: "textField",
      label: "Command",
      tier: "read-only",
      // The box itself writes nothing - typing into it touches nothing
      // beyond this device. It becomes consequential only once submitted,
      // which is what commandReview/commandApply below are for.
      visible: (f) => f.moduleCount > 0 || f.itemCount > 0,
      persistKey: null,
      unpersistedReason:
        COMPOSE_FIELD_UNPERSISTED +
        " Stronger here than for itemsDescriptionText/moduleAddAiPrompt/moduleAddBody: the text this box holds is submitted as a COMMAND that a model turns directly into a Canvas write, so silently reapplying stale text to a different selection would not just misinform the next generation, it would misdirect a live rewrite of existing course content. See this group's own header comment (G15) for why section 10 overrides section 8's AC8 on this exact point.",
    },
    {
      id: "commandReview",
      kind: "button",
      label: "Review proposal",
      // A real, scoped, reversible write - it calls a model to turn the
      // command into a structured proposal and spends quota, the same
      // distinction moduleAddAiGenerate's own comment draws - but reaches
      // no further than that model call and the review modal it opens;
      // nothing commits to Canvas until commandApply, below, is clicked.
      tier: "reversible-write",
      visible: (f) => f.moduleCount > 0 || f.itemCount > 0,
      persistKey: null,
      unpersistedReason: MODAL_OPENER_UNPERSISTED,
    },
    {
      id: "commandApply",
      kind: "button",
      label: "Apply",
      tier: "fan-out-write",
      // G7 - THE control this whole group's design exists to get right.
      // Visible only while the proposal review modal that hosts it is open.
      // Do not change this to `f.moduleCount > 0 || f.itemCount > 0` (or any
      // predicate true whenever the GROUP itself is visible): that would
      // make this control a permanent, unconditional member of `groupTier`'s
      // reduction and defeats the reason it is gated on
      // `commandProposalOpen` at all - see this group's own header comment
      // above (G7) for the failure this predicate exists to prevent, and
      // carryApplyButton above for the precedent this declaration copies.
      visible: (f) => f.commandProposalOpen,
      persistKey: null,
      unpersistedReason: ONE_CLICK_UNPERSISTED,
    },
  ],
};

/**
 * Scheduled release - docs/scheduled-publishing-from-modules-acceptance-
 * criteria.md, F6/F7/F10 (the "Post-design corrections" section is THE FINAL
 * CONTRACT; where it disagrees with anything earlier in that document, F6-
 * F10 win). One datetime-local input plus a two-step draft/review/commit
 * flow, per this project's standing rule for side effects: `releaseDate`
 * composes the requested release instant, `releaseReview` builds a plan
 * (per target, whether Canvas will accept or refuse hiding it - F10's
 * refusal-before-commit decision) and opens a review modal, and
 * `releaseCommit`, INSIDE that modal, is the one control that actually
 * writes.
 *
 * F10 - THE TARGET SET. Releases target BOTH the selected modules and their
 * items (module + one target per contained item, deduped on (kind, id) for
 * anything selected both ways) - the superset that is correct regardless of
 * which level actually governs student visibility, chosen specifically
 * because F9's experiment that would answer that question is still unrun.
 *
 * F4/F10 - THE CONSEQUENCE THIS TAG EXISTS TO SURFACE. Delivering "students
 * see nothing until release" requires UNPUBLISHING anything already
 * published, IMMEDIATELY at commit time - not at the release instant.
 * Committing this control therefore hides the selected modules and items
 * from students right now, before the scheduled instant, and they regain
 * visibility only when the release actually fires (AC0b: within roughly 15
 * minutes of the requested time, not on it). This is the single most
 * surprising behaviour in the whole feature - an instructor scheduling
 * "publish next Monday" would reasonably expect nothing to change today: the
 * opposite is true, and `consequenceTag` is where that is disclosed before
 * the click, not after.
 *
 * F6 - THE TIER, AND WHY THIS GROUP EXISTS AS DATA AT ALL, NOT MERELY AS
 * THREE CONTROLS. Two decisions, copied exactly from `commandInterfaceGroup`
 * (G7) and `carryPatternGroup` (D17) above, because this group is the same
 * shape as both:
 *
 * 1. The tier is `fan-out-write`, NOT `destructive`. `destructive`
 *    (./bulkBarGroups.ts's own header comment) is reserved for the four
 *    writes that already carry a two-click confirm-arm in their OWNING HOOK
 *    (item delete, module delete, visualizer link, visualizer create). F6
 *    says to arm `releaseCommit` anyway - and it should be - but arming and
 *    tier are independent decisions: arming is the sibling hook's job
 *    (confirmArming.ts's isConfirmArmed/selectionSignature idiom), not a
 *    reason to relabel the tier. Do not "upgrade" this to `destructive`
 *    later on the theory that arming it makes it belong there - `destructive`
 *    is reserved for controls that carry that arm ALREADY, in their own
 *    hook, as a structural property of the model; adding an arm to a
 *    `fan-out-write` control does not change what tier it is declared at,
 *    any more than declaring a tier arms a control. F6 states this
 *    explicitly for exactly this reason.
 * 2. Never-collapse and the consequence tag do NOT follow merely from
 *    declaring `releaseCommit`'s tier `fan-out-write` - believing that is
 *    REGRESSION entry 331 point 5's defect, paid for once already at entry
 *    337, and it would repeat here against a control that hides an
 *    instructor's live content from students the instant it is clicked.
 *    `groupTier` (./bulkBarGroups.ts) reduces over controls whose
 *    `visible(facts)` is true; `releaseCommit` renders INSIDE the release
 *    review modal, not in the bar itself, so an unconditionally-visible
 *    declaration would never be seen by that reduction - the group would sit
 *    at read-only, stay collapsible, and `auditGroupModel`'s I5 would stop
 *    requiring a `consequenceTag`. The fix, copied exactly from
 *    `carryApplyButton`/`commandApply`: declare a dedicated fact,
 *    `releaseReviewOpen` (BulkBarFacts, ./bulkBarGroups.ts), and gate
 *    `releaseCommit` on it. The group's derived tier is then `read-only`
 *    while the review is closed (neither `releaseDate` nor `releaseReview`
 *    escalates it - see their own tiers below) and rises to `fan-out-write`
 *    the instant the review opens, tracking REACHABILITY of the write rather
 *    than mere presence of a selection.
 *
 * Availability and persistence, per F7/F10:
 * - Availability: visible whenever anything is selected - matching
 *   `download`/`askAi`/`visualizerCoverage`/`commandInterface`'s own
 *   `visible: (f) => f.moduleCount > 0 || f.itemCount > 0`.
 * - Persistence: `releaseDate` is `persistKey: null`, per F7's explicit
 *   citation of `itemsDueDate` above (an IDENTICAL datetime-local control in
 *   this same bar) - see RELEASE_DATE_UNPERSISTED's own comment for why F7
 *   overrides this document's own earlier, more general AC9.
 */
const scheduledReleaseGroup: BulkBarGroupDef = {
  id: "scheduledRelease",
  label: "Scheduled release",
  disclosure: true,
  defaultOpen: true,
  consequenceTag:
    "Commit unpublishes the selected modules and their items from Canvas immediately - students lose access right away, not at the release instant - and they regain visibility only when the release fires, within roughly 15 minutes of the requested time.",
  visible: (f) => f.moduleCount > 0 || f.itemCount > 0,
  controls: [
    {
      id: "releaseDate",
      kind: "textField",
      label: "Release date and time",
      // Composing the instant touches nothing beyond this device; it becomes
      // consequential only once reviewed and committed, below.
      tier: "read-only",
      visible: (f) => f.moduleCount > 0 || f.itemCount > 0,
      persistKey: null,
      unpersistedReason: RELEASE_DATE_UNPERSISTED,
    },
    {
      id: "releaseReview",
      kind: "button",
      label: "Review release plan",
      // Builds the per-target plan (F10: which targets, whether Canvas will
      // accept or refuse hiding each one) and opens the review modal -
      // writes nothing itself, the same shape as carryReviewButton/
      // commandReview's own "opens a modal, writes nothing" half; unlike
      // commandReview it calls no model and spends no quota, so it stays at
      // "read-only" rather than "reversible-write" (matches
      // carryReviewButton exactly, not commandReview).
      tier: "read-only",
      visible: (f) => f.moduleCount > 0 || f.itemCount > 0,
      persistKey: null,
      unpersistedReason: MODAL_OPENER_UNPERSISTED,
    },
    {
      id: "releaseCommit",
      kind: "button",
      label: "Commit",
      tier: "fan-out-write",
      // F6/D17/G7 - THE control this whole group's design exists to get
      // right. Visible only while the review modal that hosts it is open.
      // Do not change this to `f.moduleCount > 0 || f.itemCount > 0` (or any
      // predicate true whenever the GROUP itself is visible): that would
      // make this control a permanent, unconditional member of `groupTier`'s
      // reduction and defeats the reason it is gated on `releaseReviewOpen`
      // at all - see this group's own header comment above (F6) for the
      // failure this predicate exists to prevent, and carryApplyButton/
      // commandApply above for the precedent this declaration copies.
      visible: (f) => f.releaseReviewOpen,
      persistKey: null,
      unpersistedReason: ONE_CLICK_UNPERSISTED,
    },
  ],
};

// generateGroup - the ten kind buttons, the deck/script/checkpoint controls,
// and the whole Save-edit / Post-to-Canvas / Confirm-post flow - lives in
// ./bulkBarGroupCatalog.generate.ts, imported above and placed in
// BULK_BAR_GROUPS below at the exact position it has always occupied. See
// that file's own header for why the Generate group was the piece pulled out
// this second time, and its own comments for the full reasoning behind every
// declaration it carries.

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
 * All seventeen groups, in the bar's rendered order. ORDER HERE IS NOT THE
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
 * `carryPatternGroup` is placed immediately after `currentEventsGroup`, for
 * the same reason - both are module-scoped action groups, and appending
 * rather than inserting keeps every existing slice-from-open-tag test's
 * target group exactly where it already was. `commandInterfaceGroup` is
 * appended LAST, after `visualizerCoverageGroup`, for the same reason again:
 * it is not module-scoped only (visible for a module OR item selection, like
 * `download`/`askAi`/`visualizerCoverage`), so there is no existing sibling
 * pair it belongs beside, and appending at the very end cannot land inside
 * any existing slice-from-open-tag test's target range no matter which
 * group that test targets. `scheduledReleaseGroup` is appended LAST of all,
 * after `commandInterfaceGroup`, for the identical reason stated a second
 * time: it too is visible for a module OR item selection with no existing
 * sibling pair, so appending after the group that made this same argument
 * first keeps every prior slice-from-open-tag test's target range untouched
 * exactly as commandInterfaceGroup's own arrival did.
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
  carryPatternGroup,
  generateGroup,
  downloadGroup,
  askAiGroup,
  visualizerCoverageGroup,
  commandInterfaceGroup,
  scheduledReleaseGroup,
];
