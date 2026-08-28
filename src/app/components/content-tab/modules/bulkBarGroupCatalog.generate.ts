// The "Generate" group's own declarations - GENERATE_KIND_LABELS,
// generateKindControl, and generateGroup itself - extracted from
// ./bulkBarGroupCatalog.ts to keep that file under this repo's 1000-line
// ceiling, a STRUCTURAL split only, no behaviour change, same discipline
// bulkBarGroupCatalog.ts's own header describes for ITS split from
// ./bulkBarGroups.ts: "each piece re-exported so every existing import keeps
// compiling unchanged." `generateGroup` is imported back into
// bulkBarGroupCatalog.ts and placed at the same position in the
// `BULK_BAR_GROUPS` array it already occupied, so that file's own contract -
// `BULK_BAR_GROUPS` re-exported from "./bulkBarGroups" with identical
// contents and identical order - holds for every existing consumer
// (BulkBarGroup.tsx, useBulkBarGroups.ts, every Section.tsx,
// bulkBarGroups.test.ts) with no edit of their own.
//
// The Generate group is a self-contained concern to split out precisely
// because it is the one group in this catalog whose members are GENERATED
// rather than hand-written one at a time: `GENERATE_KIND_LABELS` and
// `generateKindControl` exist for no reason other than to produce
// `generateGroup`'s own ten kind buttons, and nothing outside this group
// reaches either of them. `SUBJECT_FIELD_UNPERSISTED` is used solely by this
// group's `generateSubjectField` control, so it moves here whole, comment
// and all.
//
// `ONE_CLICK_UNPERSISTED` is declared HERE, not in the parent, even though
// the parent's sixteen other groups are its heaviest users - the reverse of
// where it reads as "belonging". `bulkBarGroupCatalog.ts` already has to
// import `generateGroup` from this file (that is the entire point of the
// split), so this file cannot also import FROM the parent without creating a
// circular import between the two - and that cycle is not merely untidy, it
// is a real bug: `generateGroup`'s `controls` array is a top-level object
// literal, built eagerly at module-load time, so a constant pulled from a
// partially-initialized parent module gets baked into that array as
// `undefined` before the parent finishes evaluating (proved by running this
// split before this fix - every generate-group control's `unpersistedReason`
// silently came back empty). Declaring the shared constant in this file,
// the LEAF with no dependency on the parent, and having the parent import it
// from here instead, keeps the dependency one-directional and avoids the
// cycle entirely. `bulkBarGroupCatalog.ts` imports it back for its own
// sixteen groups - see that file's own header for the other half of this
// note.
//
// Deliberately a PURE module, same discipline as the parent file itself: no
// React import, no MUI import, no .tsx import of any kind. The ONE
// exception, per the acceptance criteria, is a type-only import of
// GenerationKindId, used to type the ten Generate-row kind buttons so their
// ids cannot drift from the real kind catalog. That import comes from
// @/lib/lms-generation/kinds - the type's real, dependency-free owner - and
// DELIBERATELY NOT from ./useLmsGeneration, which merely re-exports the same
// type but is itself a "use client" React hook. See ./bulkBarGroupCatalog.ts's
// own header comment for the full reasoning; it applies here unchanged.

import type { GenerationKindId } from "@/lib/lms-generation/kinds";
import type { BulkBarControlDef, BulkBarGroupDef } from "./bulkBarGroups";

// Shared with every group bulkBarGroupCatalog.ts declares - exported from
// here rather than there to keep the import direction one-way; see this
// file's own header comment above for why.
export const ONE_CLICK_UNPERSISTED =
  "A one-click action with no state of its own to remember; the selection determines what it targets, not a stored value.";

// docs/announcement-preview-edit-before-post-acceptance-criteria.md, AC 17.
// Read COMPOSE_FIELD_UNPERSISTED above first (its rationale is "free-text
// scratch content for the very next click that consumes it") and confirmed
// it does NOT genuinely fit here before writing this: the Subject field is
// not scratch content consumed by the very next click - it is saved,
// together with the body, into a real `generated_artifacts` version by the
// existing Save-edit control, and reloaded verbatim whenever a later version
// is selected. The risk this field actually carries is the one the AC's own
// "Adjacent defects" section names: per-artifact content belongs to the
// version, not to the browser, and a value restored from a prior session
// would silently attach one course's subject to another course's draft.
const SUBJECT_FIELD_UNPERSISTED =
  "Per-artifact content, not a remembered preference - the subject belongs to the generated version and is reloaded from whichever version is selected, so persisting it would attach one course's subject to another course's draft.";

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

export const generateGroup: BulkBarGroupDef = {
  id: "generate",
  label: "Generate",
  disclosure: true,
  defaultOpen: true,
  // Was `null`, correctly, while every declared control here was read-only or
  // reversible-write. Declaring `generatePostToCanvas` below makes I5 require
  // one - and I5 is right to: the preview this group opens ends in a real
  // Canvas write, and an instructor reading only the bar could not previously
  // tell. Worded for the write that is actually reachable from here, not for
  // the generation that precedes it: generating a draft costs a model call
  // and touches nothing, and saying otherwise would overstate the common case
  // (C11's lesson from carryPatternGroup - a tag that overstates is worse
  // than one that understates, because it is the one always-visible sentence
  // describing what this group does).
  //
  // REVISED for docs/announcement-preview-edit-before-post-acceptance-
  // criteria.md (AC 16, "Adjacent defects" section's literal wording): the
  // confirm step this feature adds means the write no longer happens on the
  // FIRST click of "Post to Canvas" (see generatePostToCanvas's own tier
  // comment below, re-derived for the same reason), so the tag now says so.
  // It also does NOT generalize "goes live immediately" to every kind this
  // group can post - C11's rule again: objectives/assignments/resources/
  // introDiscussion all create UNPUBLISHED Canvas objects
  // (kindPostsImmediately, @/lib/lms-generation/kinds), so a blanket
  // immediacy claim would overstate the common case for four of the five
  // "save-and-post" kinds. The immediacy clause is scoped to the one kind it
  // is actually true for.
  consequenceTag: "Post to Canvas, inside the generated-content preview, writes the drafted content into the live course - for an announcement that means every student sees it immediately, after a second confirming click.",
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
    // docs/announcement-preview-edit-before-post-acceptance-criteria.md, AC
    // 1/2/15: the preview modal's Subject text field, offered only for a kind
    // whose title is real, instructor-owned content
    // (BulkBarFacts.generateSubjectEditable - derived from
    // `kindTitleIsContent`, never a hardcoded `kindId === "announcements"`
    // here). "read-only" tier, not "reversible-write": this field edits the
    // modal's local draft only, the same shape `itemsDescriptionText` above
    // has for the body it composes - the WRITE is `generateSaveEdit`,
    // declared immediately below, on `generateSubjectField`'s own
    // reachability fact's strictly broader sibling
    // (`generateSaveEditReachable`), not one this control's own tier absorbs.
    {
      id: "generateSubjectField",
      kind: "textField",
      label: "Subject",
      tier: "read-only",
      visible: (f) => f.generateSubjectEditable,
      persistKey: null,
      unpersistedReason: SUBJECT_FIELD_UNPERSISTED,
    },
    // docs/announcement-preview-edit-before-post-acceptance-criteria.md,
    // "Adjacent defects this diff should close": `Save edit`
    // (useLmsGeneration.ts's `saveEdit`) persists a new `generated_artifacts`
    // version and is reachable only from inside GeneratedPreviewModal.tsx -
    // until now declared NOWHERE in this catalog, precisely the defect
    // `generatePostToCanvas`'s own comment below describes: "a green check on
    // an unexamined path, which is worse than no check." Fixed here on that
    // same control's pattern, one tier down: "reversible-write", not
    // "read-only" - it is a real write, not a draft edit - and not
    // "fan-out-write" either, because unlike a Canvas post it is SCOPED to one
    // artifact and REVERSIBLE (a new version, never an overwrite of anything
    // already posted) - the exact distinction this file's own header comment
    // draws between the ten Generate kind buttons above and every fan-out
    // write in this bar. Gated on `generateSaveEditReachable`
    // (BulkBarFacts, ./bulkBarGroups.ts), derived from `kindSupportsTextEdit`
    // (@/lib/lms-generation/kinds) rather than a hardcoded kind id - a kind
    // whose `structured` payload is authoritative (decks, knowledgeChecks) is
    // excluded automatically, the same derivation `generateSubjectField`'s
    // own gate above uses for `kindTitleIsContent`. Deliberately a BROADER
    // gate than `generateSubjectField`'s: Save edit persists the body alone
    // for every text-editable kind, subject or no subject, so it must not be
    // gated on `generateSubjectEditable` - see
    // BulkBarFacts.generateSaveEditReachable's own doc comment (bulkBarGroups.ts)
    // for why the two facts are not the same one. No textbox/select/checkbox
    // of its own, so its unpersisted reason reuses ONE_CLICK_UNPERSISTED
    // rather than a fresh string, matching every other one-click button in
    // this group (`generatePostCancel`/`generatePostConfirm`/
    // `generatePostToCanvas` below).
    {
      id: "generateSaveEdit",
      kind: "button",
      label: "Save edit",
      tier: "reversible-write",
      visible: (f) => f.generateSaveEditReachable,
      persistKey: null,
      unpersistedReason: ONE_CLICK_UNPERSISTED,
    },
    {
      id: "generatePostToCanvas",
      kind: "button",
      label: "Post to Canvas",
      // THE control this declaration exists for. It lives in
      // GeneratedPreviewModal.tsx, not in the bar, and until now was
      // declared nowhere - so `groupTier`'s reduction never saw it and this
      // group's derived tier topped out at "reversible-write" from the ten
      // kind buttons, while its flow ends in a real Canvas write. The audit
      // therefore asserted, permanently, that the group was safer than it
      // is: a green check on an unexamined path, which is worse than no
      // check. Fixed here on `carryPatternGroup`'s pattern (D17), which was
      // written for this exact shape and then explicitly left this instance
      // standing as out of that chunk's scope.
      //
      // TIER. "fan-out-write", by elimination against this model's own
      // definitions rather than by feel: "reversible-write" PROMISES the
      // write is reversible ("a new version, never an overwrite"), and
      // posting generated content into a live Canvas course is not
      // reversible from this app, so declaring it there would make the tier
      // string itself a false claim; "destructive" is reserved for the four
      // writes carrying a two-click confirm-arm in their owning hook
      // (confirmArming.ts's isConfirmArmed/selectionSignature idiom) - a
      // reservation this control still does not meet even now that it is
      // also two-click. That leaves "fan-out-write".
      //
      // RE-DERIVED for docs/announcement-preview-edit-before-post-
      // acceptance-criteria.md (AC 24 / "Adjacent defects" section): this
      // comment used to close the elimination with "and this one commits on
      // its first click" as the reason it was not "destructive". That
      // sentence is now FALSE - the sibling UI chunk in
      // GeneratedPreviewModal.tsx adds a confirm step (confirmArming.ts's own
      // signature-based arm/disarm model, per that AC's item 12), so the
      // write no longer happens on the first click.
      //
      // The tier does not move, though, because "destructive" is reserved
      // for a DIFFERENT class of write than this one, independent of click
      // count: the four controls at that tier are all DELETES - an
      // undo-shaped mistake where the object existed a moment ago and does
      // not anymore. Posting to Canvas is the opposite shape - it CREATES an
      // announcement that did not exist before, and nothing about a second
      // click changes that class. What actually distinguishes "fan-out-write"
      // from "destructive" in this model is not "how many clicks", it is
      // "which of the two failure shapes the write commits to" - and this
      // control has always been, and remains, an unrecallable CREATE rather
      // than a DELETE. Restated: "fan-out-write" here means "an unconfirmed
      // OR confirmed write this app cannot take back", not merely
      // "unconfirmed"; the confirm step changes how the write is reached, not
      // which of the two write-shape tiers it belongs to.
      tier: "fan-out-write",
      // Reachability, not existence - see BulkBarFacts.generatePostReachable,
      // which ANDs the modal being mounted, the kind offering a post at all,
      // and no `postUnavailableReason` (which replaces the button with a
      // hint). Do not relax this to `f.generationKindsCount > 0`: that would
      // make the group permanently fan-out-write, force it open forever, and
      // show a consequence tag for a write that is not on screen - the
      // over-reporting mirror of the defect this fixes.
      visible: (f) => f.generatePostReachable,
      persistKey: null,
      unpersistedReason: ONE_CLICK_UNPERSISTED,
    },
    // Wave 2D (docs/announcement-preview-edit-before-post-acceptance-
    // criteria.md, AC 15/AC 24): the confirm step's two resolutions are new
    // controls reachable from this flow, and go undeclared here exactly the
    // way `generatePostToCanvas` itself went undeclared before this same
    // section fixed that - "a green check on an unexamined path, which is
    // worse than no check", quoted from that control's own comment above.
    // Both are gated on the SAME fact as `generatePostToCanvas`
    // (`f.generatePostReachable`), never on the confirm step's own local
    // "armed" state, which this pure, hook-free file has no way to read - the
    // `releaseCommit`/`commandApply` precedent above: the write and its
    // confirm/cancel pair live inside the same modal and share the same
    // reachability gate, so all three rise and fall from "visible to
    // groupTier's reduction" together.
    {
      id: "generatePostCancel",
      kind: "button",
      label: "Cancel",
      // Leaves the confirm step with nothing written (AC 13) - dismissing an
      // armed control back to its unarmed state, not a Canvas write of any
      // kind. Same tier as the in-file "Revert" precedent this button copies.
      tier: "read-only",
      visible: (f) => f.generatePostReachable,
      persistKey: null,
      unpersistedReason: ONE_CLICK_UNPERSISTED,
    },
    {
      id: "generatePostConfirm",
      kind: "button",
      label: "Confirm post",
      // The second, distinct click that actually commits (AC 9) - the same
      // unrecallable Canvas write `generatePostToCanvas` above is declared
      // at, reached through its own control now that arming splits one click
      // into two. Declaring this anything other than "fan-out-write" would
      // make THIS control the unexamined path the comment above warns about,
      // even though the button beside it is correctly declared.
      tier: "fan-out-write",
      visible: (f) => f.generatePostReachable,
      persistKey: null,
      unpersistedReason: ONE_CLICK_UNPERSISTED,
    },
  ],
};
