// Per-operation gating for Course Content controls when the active content
// came from a stored LMS export (src/lib/lms-export-source) rather than the
// live Canvas API. See docs/REGRESSION.md entries 260-263 for the selection
// layer, the generation feature and the export read seam this sits next to,
// and this chunk's own entry for the three failure shapes named below.
//
// Deliberately a PURE module, with no React/MUI import at all: every control
// in this folder that needs a "why can't I do this" answer calls into one of
// the functions here rather than hand-rolling its own condition, so the
// wording and the boolean logic are defined ONCE and are exhaustively
// testable without rendering anything (vitest here is node-env and renders no
// component - see contentSourceGating.test.ts's own header).
//
// THREE DISTINCT FAILURE SHAPES, deliberately worded differently:
//   (i)   DATA ABSENT - the item/module on screen has no Canvas identity (no
//         id, contentId, pageUrl, htmlUrl) because it was read from a
//         cartridge, not the live API. `gateOperation` reports this via
//         EXPORT_IDENTITY_REASON, and `fieldAvailable` reports it for the
//         four fields (published, dueAt, pointsPossible, indent) a cartridge
//         does not carry AT ALL - see that function's own comment for why
//         those are omitted rather than gated.
//   (ii)  NO LIVE COURSE - there is no Canvas destination for ANY write, live
//         or export. `gateOperation` reports this via NO_LIVE_COURSE_REASON.
//   (iii) WORKS DEGRADED - a control still does something useful with less
//         information, and says so. `describeDegradedItemRow` is this
//         module's one instance of it: a module-item row from an export
//         still shows a real title and type, it just can't offer any of the
//         write controls `gateOperation` turns off.
//
// (i) and (ii) are INDEPENDENT, not two names for the same thing. A course
// can have both a live Canvas URL and a stored export; viewing the export,
// (ii) is FALSE (Canvas is reachable) but (i) is still TRUE for every item on
// screen (none of them carry a Canvas id). `ContentSourceContext` carries the
// two facts separately for exactly this reason - see its own comment.

import type { ContentSource } from "@/lib/lms-export-source";

export type { ContentSource };

/**
 * The two independent facts a gating decision needs:
 * - `source`: which source the content ON SCREEN right now came from. Drives
 *   failure shape (i).
 * - `hasLiveCourse`: whether THIS course has a live Canvas URL linked at
 *   all, independent of which source is currently displayed. Drives failure
 *   shape (ii).
 *
 * `gateOperation` checks `hasLiveCourse` FIRST: with nowhere at all for a
 * write to land, that is the more fundamental blocker, so it wins the
 * message even when `source` is also "export". The "viewing an export with a
 * live course also linked" case - (ii) false, (i) still true - is what
 * isolates the export-identity wording from the no-course wording; a caller
 * that only ever constructs a context with `hasLiveCourse: true` never sees
 * the no-course reason at all, by construction.
 */
export interface ContentSourceContext {
  source: ContentSource;
  hasLiveCourse: boolean;
}

/**
 * Live Canvas, linked - identical to today's unconditional behaviour before
 * any of this gating existed. Every optional `sourceContext` prop in this
 * folder defaults to this, so a call site that doesn't pass one yet (every
 * one of them, until a source picker exists - see entry 263's Limits) renders
 * and behaves exactly as it did before this file was added.
 */
export const LIVE_CONTENT_SOURCE: ContentSourceContext = { source: "canvas", hasLiveCourse: true };

export interface OperationGate {
  allowed: boolean;
  /** Present only when `allowed` is false. Always meant to be rendered as
   * visible text a control's `aria-describedby` points at - never a
   * `title` tooltip, which does not surface on keyboard focus (see
   * src/app/components/courses/CellMenu.tsx's header comment, the one
   * correct precedent for this in the repo). */
  reason?: string;
}

const ALLOWED: OperationGate = { allowed: true };

/**
 * What a gated operation is acting on - just enough to pick accurate,
 * distinct wording per call site without a combinatorial explosion of
 * near-duplicate functions. One subject per genuinely distinct "thing this
 * write needs identity for":
 *   - "item"        a single displayed module item's own edit controls
 *                    (ModuleItemRow: rename, move, remove, change type,
 *                    preview/edit gradable or file).
 *   - "page"        a single displayed page's edit controls.
 *   - "addItem"     adding a NEW item to one specific displayed module
 *                    (AddItemRow) - needs that module's own identity, not
 *                    just any live course.
 *   - "items"       a bulk write across the current item SELECTION
 *                    (BulkItemsSection).
 *   - "modules"     a bulk write across the current module SELECTION, or any
 *                    other write that targets the specific modules currently
 *                    on screen (BulkModulesSection).
 *   - "courseWrite" creates new course-level content with NO dependency on
 *                    any currently-displayed item/module identity (Create
 *                    modules, the syllabus quiz, syllabus generation, a new
 *                    page). Still gated when `source` is "export": the
 *                    result would land in the live course and never appear
 *                    in the static export snapshot on screen, which is its
 *                    own kind of silent no-op.
 *   - "files"       the Files view as a whole - a cartridge has no
 *                    standalone files list at all (entry 263 check 5), so
 *                    this is gated as one unit rather than per file row.
 */
export type GatedSubject = "item" | "page" | "addItem" | "items" | "modules" | "courseWrite" | "files";

const NO_LIVE_COURSE_REASON: Record<GatedSubject, string> = {
  item: "There is no live Canvas course linked, so this item has no Canvas destination to write to.",
  page: "There is no live Canvas course linked, so this page has no Canvas destination to write to.",
  addItem: "There is no live Canvas course linked to add this item to.",
  items: "There is no live Canvas course linked, so the selected items have no Canvas destination to write to.",
  modules: "There is no live Canvas course linked, so the selected modules have no Canvas destination to write to.",
  courseWrite: "There is no live Canvas course linked to create content in.",
  files: "There is no live Canvas course linked to manage files in.",
};

const EXPORT_IDENTITY_REASON: Record<GatedSubject, string> = {
  item: "This item comes from a stored export and has no Canvas identity to write to.",
  page: "This page comes from a stored export and has no Canvas identity to write to.",
  addItem: "This module comes from a stored export and has no Canvas identity to add an item to.",
  items: "The selected items come from a stored export and have no Canvas identity to write to.",
  modules: "The selected modules come from a stored export and have no Canvas identity to write to.",
  courseWrite:
    "You're viewing a stored export - new content would be created in the live Canvas course and wouldn't appear in this list.",
  files: "A stored export has no standalone files list - files only exist as File-type items inside modules.",
};

/** Can this write run, and if not, why - worded for the specific `subject`
 * and the specific one of the two independent failure shapes responsible. */
export function gateOperation(ctx: ContentSourceContext, subject: GatedSubject): OperationGate {
  if (!ctx.hasLiveCourse) return { allowed: false, reason: NO_LIVE_COURSE_REASON[subject] };
  if (ctx.source === "export") return { allowed: false, reason: EXPORT_IDENTITY_REASON[subject] };
  return ALLOWED;
}

/**
 * The four `CanvasModuleItem` fields a `CartridgeModuleItem` does not carry
 * AT ALL (docs/REGRESSION.md entry 263 check 3) - not merely null, absent
 * from the export format as a concept. A disabled toggle or button for one
 * of these would imply a real state exists underneath and simply can't be
 * changed right now; there IS no state underneath, so the correct UI is to
 * render nothing for the control, not to gate it with `gateOperation`.
 *
 * `field` is accepted (rather than hard-coding a bare `source === "canvas"`
 * at each call site) so every call site reads self-documenting, and so a
 * future field whose availability genuinely varies BY FIELD - unlike these
 * four, which are absent uniformly for the whole export format - has a
 * natural extension point here instead of a scattered one-off check.
 */
export type GatedField = "published" | "dueAt" | "pointsPossible" | "indent";

export function fieldAvailable(source: ContentSource, field: GatedField): boolean {
  void field;
  return source === "canvas";
}

/**
 * Failure shape (iii), WORKS DEGRADED, for a module item row. An export item
 * still renders a real title and type - `CartridgeModuleItem` carries both,
 * and Canvas-format exports carry a real per-item `identifier` too (entry 261
 * check 6) - so the row is never actually empty, it is just missing every
 * write control `gateOperation(ctx, "item")` turns off. Returns null on the
 * live source, so a caller can render this unconditionally without its own
 * `source === "export"` check.
 */
export function describeDegradedItemRow(ctx: ContentSourceContext): string | null {
  if (ctx.source !== "export") return null;
  return "Shown from a stored export - title and type only. Editing needs the live Canvas course.";
}

// ── AC4 (docs/modules-cartridge-import-upload-acceptance-criteria.md): the
// "Upload to Canvas" gate - pushing a Common Cartridge into the LIVE Canvas
// course as a content migration. This is DELIBERATELY the one write in this
// folder that does NOT reuse `gateOperation(ctx, "courseWrite")`, and the
// difference is load-bearing, not an oversight.
//
// `gateOperation`'s courseWrite wording blocks a write on `source ===
// "export"` because that write's RESULT would land in the live course and
// never appear in the static export snapshot currently on screen - a silent
// no-op from the instructor's point of view (see this file's own
// EXPORT_IDENTITY_REASON.courseWrite sentence). "Upload to Canvas" breaks
// that assumption on purpose: pushing the VERY EXPORT you are looking at
// into the live course is not a mismatched write, it is the single most
// valuable use of this feature - an instructor who only has a stored
// cartridge, with no live course populated yet, wants exactly this. Reusing
// `gateOperation(ctx, "courseWrite")` here would block that case outright and
// ship the capability dead.
//
// So `gateCartridgeUpload` is gated on ONE fact only: `ctx.hasLiveCourse`.
// `ctx.source` never enters the decision - not even to pick different
// wording, since there is exactly one way this can be unavailable (nowhere
// live to write to at all).

/**
 * AC4's named gate for "Upload to Canvas". `allowed: false` only when there
 * is no live Canvas course linked at all; `allowed: true` otherwise,
 * INCLUDING `ctx.source === "export"` - see this section's header comment for
 * why that inclusion is the point of this function rather than a gap in it.
 *
 * Implemented by calling `gateOperation` with `source` forced to `"canvas"`
 * (never the caller's real `ctx.source`), so the only branch that can ever
 * fire is the `!hasLiveCourse` one: the exact same check, and the exact same
 * `NO_LIVE_COURSE_REASON.courseWrite` sentence, "Create modules"/"Syllabus
 * quiz" already use for the identical fact - reusing it here means the two
 * can never drift apart into two slightly different ways of saying "there is
 * nowhere to write to."
 */
export function gateCartridgeUpload(ctx: ContentSourceContext): OperationGate {
  return gateOperation({ source: "canvas", hasLiveCourse: ctx.hasLiveCourse }, "courseWrite");
}

/**
 * AC20's companion note for the export source: even though `gateCartridgeUpload`
 * ALLOWS the upload while viewing a stored export (see above), the write
 * still lands in the live Canvas course, not in the static export snapshot on
 * screen - so without this sentence, an instructor who just watched an
 * upload complete could reasonably expect the module list in front of them
 * to have changed, and it will not until the export is re-read from Canvas.
 *
 * Unlike `describeDegradedItemRow`, this is not about a control being
 * unavailable (the upload IS allowed here, by design) - it is purely an
 * expectation-setting note. Returns null on the live source, so
 * `CartridgeToCanvasModal.tsx` can render it unconditionally without its own
 * `source === "export"` check (AC4's own instruction for this function).
 */
export function describeCartridgeUploadOnExport(ctx: ContentSourceContext): string | null {
  if (ctx.source !== "export") return null;
  return (
    "This upload writes into the live Canvas course - the stored export you're viewing here will not change " +
    "until it is re-read from Canvas."
  );
}
