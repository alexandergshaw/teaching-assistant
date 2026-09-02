// The "Scheduled release" group's own declarations (RELEASE_DATE_UNPERSISTED
// and scheduledReleaseGroup itself), extracted from ./bulkBarGroupCatalog.ts
// to keep that file under this repo's 1000-line ceiling - a STRUCTURAL split
// only, no behaviour change, same discipline that file's own header describes
// for its two earlier splits (from ./bulkBarGroups.ts, and of the "Generate"
// group into ./bulkBarGroupCatalog.generate.ts): "each piece re-exported so
// every existing import keeps compiling unchanged." `scheduledReleaseGroup`
// is imported back into bulkBarGroupCatalog.ts and placed at the same
// (last) position in the `BULK_BAR_GROUPS` array it already occupied, so that
// file's own contract - `BULK_BAR_GROUPS` re-exported from "./bulkBarGroups"
// with identical contents and identical order - holds for every existing
// consumer (BulkBarGroup.tsx, useBulkBarGroups.ts, every Section.tsx,
// bulkBarGroups.test.ts) with no edit of their own.
//
// "Scheduled release" is the group pulled out this third time because its own
// header comment already establishes it as a fully self-contained sibling -
// "copied exactly from commandInterfaceGroup (G7) and carryPatternGroup
// (D17)... because this group is the same shape as both" - so nothing outside
// this group reaches RELEASE_DATE_UNPERSISTED, and nothing inside it reaches
// back into any group left behind in the parent file. It is also the LAST
// entry in BULK_BAR_GROUPS, so moving it changes no other group's position
// and cannot land inside any existing slice-from-open-tag test's target range
// (see bulkBarGroupCatalog.ts's own comment on BULK_BAR_GROUPS for why that
// matters).
//
// MODAL_OPENER_UNPERSISTED below is a LOCAL duplicate of the constant of the
// same name declared in bulkBarGroupCatalog.ts, not an import of it: that
// file already has to import `scheduledReleaseGroup` from this one (the
// entire point of the split), so this file importing anything back FROM the
// parent would create a circular import between the two - the exact hazard
// bulkBarGroupCatalog.generate.ts's own header comment documents for
// `ONE_CLICK_UNPERSISTED` (a top-level object literal built eagerly at
// module-load time would bake in `undefined` from a partially-initialized
// circular dependency). Unlike `ONE_CLICK_UNPERSISTED` - shared by every
// group in the parent, so moving its single declaration into a leaf and
// importing it back is the natural fix - `MODAL_OPENER_UNPERSISTED`'s wording
// is needed by exactly one control here (`releaseReview`) plus several
// controls that stay behind in the parent, so a small local duplicate (never
// exported, scoped to this file only) is the lower-disruption fix: it avoids
// touching every other group's import in bulkBarGroupCatalog.ts for the sake
// of the one group moving out. `ONE_CLICK_UNPERSISTED` itself is imported
// from ./bulkBarGroupCatalog.generate.ts below, exactly as bulkBarGroupCatalog.ts
// already does for its own sixteen groups - that import is not circular,
// since bulkBarGroupCatalog.generate.ts imports from neither this file nor
// the parent.
//
// Deliberately a PURE module, same discipline as bulkBarGroupCatalog.ts and
// bulkBarGroupCatalog.generate.ts: no React import, no MUI import, no .tsx
// import of any kind.

import type { BulkBarGroupDef } from "./bulkBarGroups";
import { ONE_CLICK_UNPERSISTED } from "./bulkBarGroupCatalog.generate";

const MODAL_OPENER_UNPERSISTED =
  "Opens an existing editor/modal; there is no value on this control itself to remember between reloads.";

// docs/scheduled-publishing-from-modules-acceptance-criteria.md, F7. F7
// explicitly overrides an earlier, more general requirement in the SAME
// document (AC9: "any new textbox/select persists per course under a `ta-`
// key") by pointing at a concrete precedent already in this bar:
// `itemsDueDate` (bulkBarGroupCatalog.ts's own `dueDatesGroup`) is an
// IDENTICAL datetime-local control in this same bulk bar and is
// `persistKey: null` under that file's own ITEM_TYPE_UNPERSISTED. F7's own
// words: "Follow the neighbour, and cite it, so `auditGroupModel`'s I6 is
// satisfied by precedent rather than by a new rationale." This constant does
// exactly that - it is ITEM_TYPE_UNPERSISTED's own reasoning, restated with
// the citation F7 asks for, rather than a freshly-invented one for a control
// that is, in every load-bearing respect, the same shape as its neighbour.
const RELEASE_DATE_UNPERSISTED =
  "Follows itemsDueDate, the identical datetime-local control already in this bulk bar: the release instant applies to whatever is selected right now, not a remembered value, and a value restored from a previous session would silently point at the wrong items after a reload (F7, docs/scheduled-publishing-from-modules-acceptance-criteria.md). F7 explicitly overrides that same document's earlier AC9, which asked every new textbox/select in this bar to persist - this is the one control where that general requirement is superseded by a cited, precedent-based exception rather than a fresh rationale.";

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
export const scheduledReleaseGroup: BulkBarGroupDef = {
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
