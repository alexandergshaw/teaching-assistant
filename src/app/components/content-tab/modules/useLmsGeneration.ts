"use client";

// Local UI state + handlers for the LMS Modules bulk bar's "Generate from
// selection" control. Chunk 1 shipped two pure-text kinds - anticipated Q&A
// and current events - generated from the current selection and saved as a
// new version in the generated_artifacts store, src/lib/supabase/generated-artifacts.ts
// and its migration supabase/migrations/20261004000000_generated_artifacts.sql.
// Chunk 3a adds a THIRD kind, "decks" - still no Canvas write (the Canvas
// commit is a separate, later chunk) but the first kind that is NOT
// pure-text-only-and-fast: see generateDeckApi's own comment below for why
// it is the one kind that does NOT call generateFromSelectionAction. Calls
// the sibling-built src/app/actions/lms-generation.ts
// (generateFromSelectionAction, refineGeneratedArtifactAction,
// listGeneratedArtifactVersionsAction) and, for decks only,
// src/app/api/lms-generation/deck/route.ts - both read in full before this
// hook was finalized/extended.
//
// CHUNK 3b (docs/lms-module-content-generation-acceptance-criteria.md) adds
// FOUR MORE kinds - objectives, assignments, knowledgeChecks, announcements -
// that also POST to Canvas (kinds.ts's `commitMode: "save-and-post"`), on top
// of the save-a-version behaviour every kind already has. Posting is a
// SEPARATE, explicitly pressed action from the preview modal (P1), never a
// side effect of generating - see `post` below, and GENERATION_KIND_CONFIGS'
// `commitMode` (via `kindOffersPost`), which is what decides whether the
// modal even offers the "Post to Canvas" control for the kind on screen.
//
// Mirrors useLmsSyllabusButtons.ts's shape: one `busy` string so the kind
// buttons (and the preview modal's own refine/post buttons) cannot
// double-fire and all disable while any one of them runs, and reports
// success/failure through the same `setNote` channel this whole tab already
// uses.
//
// TWO departures from useLmsSyllabusButtons, both scoped to
// GENERATION-and-REFINE only - `generate`/`refine` never write to Canvas, for
// any kind, so both departures still hold for them exactly as chunk 1 left
// them:
//   - Neither calls the outer ModulesView `setBusy` - that flag gates
//     Canvas-writing controls across the whole tab, and holding it for a
//     30+ second grounded current-events search would block unrelated work
//     for no correctness reason (no Canvas state is shared). This matches
//     how useBulkItemActions/useBulkModuleActions already keep their own
//     bulk-bar-local `opBusy` separate from it.
//   - Neither calls `reload()` - reload() re-fetches the Canvas module tree,
//     which generating/refining a version never changes.
// `post` (chunk 3b, posting kinds only) is NOT covered by either departure -
// see its own comment below: it DOES hold the outer `setBusy` for its
// duration (a real Canvas write, gating the rest of the tab's Canvas-writing
// controls the same way every other write already does) and DOES call
// `reload()` on completion, so the newly created/updated page, assignment,
// quiz or announcement is reflected in the module tree - precisely what lets
// the instructor's very next step ("select that new module, generate the
// rest") work at all.
//
// VERSION HISTORY IS THE REAL STORED HISTORY, NOT A SESSION ACCUMULATOR.
// Earlier, this hook could only reach listGeneratedArtifactVersions'
// SERVER-side accessor indirectly, so it kept its own `sessionVersions`
// state and every version the hook itself created (this page load, this
// browser tab) accumulated there - a version from an earlier session was
// unreachable. lms-generation.ts now exports
// listGeneratedArtifactVersionsAction (a real Server Action, safe to call
// from a client hook), so `generate`/`refine` below call it right after a
// successful save and use ITS result as `preview.versions` - the loader is
// what populates the preview, never a locally-accumulated array. A page
// reload therefore does not lose the trail: the next generate/refine on
// this course+kind re-fetches the full stored history, which includes every
// version ever saved, not merely what this page load produced.
//
// Pure logic (offerability, the busy-state transition, the selection
// payload, the module label, the version loader, and the note text) is
// exported from this same file rather than a separate module, matching
// useBulkModuleActions.ts's own OrphanNote/describeOrphans precedent - see
// useLmsGeneration.test.ts for the executable half of this file (vitest
// here is node-env and renders no component, so the hook's React wiring
// itself is verified by reading only).

import { useEffect, useState } from "react";
import type { LlmProvider } from "@/lib/llm";
import type { CanvasModule } from "@/lib/canvas-modules";
import type { CartridgeModule } from "@/lib/cartridge-import";
import type { GeneratedArtifact } from "@/lib/supabase/generated-artifacts";
// NEW_MODULE_TARGET_VALUE's one owner is this dependency-free lib (see the
// re-export a few lines down for why) - imported normally (not `export ...
// from`) because resolvePostModuleTarget below still references it directly
// as a local binding, which a pure re-export does not create.
import { NEW_MODULE_TARGET_VALUE } from "@/lib/syllabus-ack-quiz-target";
// The kind registry: a dependency-free leaf (no "@/app/actions" or Supabase
// import - see its own header comment), so a client hook can safely import
// it directly rather than duplicating its ids/labels and risking drift.
// GenerationKindId is "qa" | "currentEvents" | "decks" here - NOT the
// "anticipated-qa" / "current-events" / "deck" strings, which are the DB
// generated_artifacts.kind values (GENERATION_KIND_CONFIGS[id].artifactKind),
// a different vocabulary this hook never needs to spell itself.
import { GENERATION_KIND_CONFIGS, GENERATION_KIND_IDS, kindSupportsTextEdit, type GenerationKindId } from "@/lib/lms-generation/kinds";
// Chunk 3d (docs/lms-script-generation-acceptance-criteria.md, S13): the one
// source of truth for the lecture-script length select's offered options,
// default, and coercion - shared with the server so a stale/hand-edited
// stored value (or an out-of-range wire value) resolves the same way on
// both sides. See that file's own header comment.
import { SCRIPT_LENGTH_OPTIONS, resolveScriptMinutes } from "@/lib/lms-generation/script-length";
import {
  expandModuleSelection,
  type SelectedMaterialItem,
  type LiveSelectedItem,
  type ExportSelectedItem,
  type RepoSelectedItem,
} from "@/lib/lms-generation/materials";
// The commit PLANNER (chunk 3b) - a dependency-free leaf like kinds.ts (see
// that file's own header comment on why the executor cannot live there
// either). `ModuleTarget`/`resolvePostModuleTarget` below turn this section's
// own module-target UI state into the shape planModuleTarget (that file, not
// called from here - the sibling-built commit executor, commit-execute.ts,
// calls it) expects; `PostSummary` is what
// postGeneratedArtifactAction's (src/app/actions/lms-generation.ts) success
// case resolves to.
import type { ModuleTarget, PostSummary } from "@/lib/lms-generation/commit-plan";
import {
  resolveDeckTemplateSelection,
  type DeckGenerationRequest,
  type DeckGenerationSuccess,
  type DeckGenerationFailure,
} from "@/lib/lms-generation/deck";
import {
  artifactDownloadFormats,
  artifactDownloadFilename,
  artifactDownloadFormatLabel,
  buildArtifactDownloadBlob,
} from "@/lib/lms-generation/artifact-download";
import type { ArtifactDownloadFormat } from "@/lib/lms-generation/artifact-download";
import { DECK_PRESETS } from "@/lib/decks/presets";
import type { DeckTemplate } from "@/lib/decks/types";
import { listDeckTemplatesAction } from "@/app/actions";
import {
  generateFromSelectionAction,
  refineGeneratedArtifactAction,
  listGeneratedArtifactVersionsAction,
  postGeneratedArtifactAction,
  saveEditedGeneratedArtifactAction,
} from "../../../actions/lms-generation";
import { liveModuleIdsFromKeys } from "../utils";
import { triggerFileDownload } from "../../course-planning/utils";
import { gateOperation, LIVE_CONTENT_SOURCE, type ContentSourceContext } from "../contentSourceGating";

// ── Kinds (chunk 1: exactly these two, both pure text) ─────────────────────

export type { GenerationKindId };
// Re-exported so GeneratedPreviewModal.tsx can pull every hook-facing
// type through this one module, matching how it already gets
// GenerationBusy/GenerationPreviewState/etc. rather than reaching into
// lib/lms-generation/* directly (see that file's own import block).
export type { ArtifactDownloadFormat };

export interface GenerationKindDef {
  id: GenerationKindId;
  label: string;
}

// Derived from GENERATION_KIND_CONFIGS rather than hand-rolled, so this
// hook's id/label pairs can never drift from the registry the actual
// generators are keyed on.
export const GENERATION_KINDS: readonly GenerationKindDef[] = GENERATION_KIND_IDS.map((id) => ({
  id,
  label: GENERATION_KIND_CONFIGS[id].label,
}));

export function kindLabelFor(kindId: GenerationKindId): string {
  return GENERATION_KIND_CONFIGS[kindId].label;
}

/**
 * Whether `kindId` is one of chunk 3b's "save-and-post" kinds - i.e. whether
 * the preview modal should offer "Post to Canvas" for it at all (P1: shown
 * ONLY for a posting kind) and whether the success-note copy for it needs to
 * talk about posting (P6). A thin wrapper over the registry's own
 * `commitMode` rather than a hand-maintained kind list, so this can never
 * drift from kinds.ts as new kinds are added.
 */
export function kindOffersPost(kindId: GenerationKindId): boolean {
  return GENERATION_KIND_CONFIGS[kindId].commitMode === "save-and-post";
}

/**
 * Whether posting `kindId` needs a module target at all - true for a
 * "module-item" placement (objectives/assignments/knowledgeChecks: linked
 * into a module the instructor picks or names, P5), false for a
 * "course-level" one (announcements: a Canvas announcement is a course-level
 * discussion topic, never a module item - kinds.ts's own
 * GenerationCommitMeta doc comment). Drives whether the modal's module-target
 * picker even renders, and whether `post` resolves/sends a `target` at all -
 * postGeneratedArtifactAction's own `target` field is optional precisely for
 * this reason (src/app/actions/lms-generation.ts).
 */
export function kindNeedsModuleTarget(kindId: GenerationKindId): boolean {
  return GENERATION_KIND_CONFIGS[kindId].commitMeta?.placement === "module-item";
}

/**
 * AC3 (defect fix, docs/REGRESSION.md - the live "generate from an export
 * selection" defect): whether posting `kindId` to Canvas is unavailable
 * right now, and why - null when it can be posted. Generation itself has no
 * Canvas dependency (this whole fix is what makes it work from a stored
 * export), but POSTING is a real Canvas write, and an export selection has
 * no live Canvas connection to write to at all
 * (contentSourceGating.ts: `hasLiveCourse` is hardcoded false whenever the
 * active selection is export-sourced). Reuses gateOperation's own
 * "courseWrite" wording VERBATIM rather than inventing a generation-specific
 * reason - posting a generated artifact IS a courseWrite in exactly
 * gateOperation's sense (it creates new content in the live course with no
 * dependency on any item/module identity already on screen), the same class
 * of write ModulesView.tsx's own NewAssignmentPanel gate already refuses for
 * an export selection. `kindOffersPost`/`kindNeedsModuleTarget` above are
 * UNTOUCHED by this - they stay pure functions of the kind id alone; this is
 * a separate, additional check layered on top; a kind that never offered
 * posting in the first place (qa/currentEvents/decks) has nothing to explain
 * being unavailable, so this returns null for those regardless of `ctx`.
 */
export function postUnavailableReasonFor(kindId: GenerationKindId, ctx: ContentSourceContext): string | null {
  if (!kindOffersPost(kindId)) return null;
  const gate = gateOperation(ctx, "courseWrite");
  return gate.allowed ? null : (gate.reason ?? null);
}

// ── Pure logic (exported for unit tests) ────────────────────────────────────

/**
 * Which generation kinds to offer for a given selection: individually-
 * selected ITEMS, or whole selected MODULES. generateFromSelectionAction
 * accepts both (moduleIds are expanded to their items server-side - see
 * materials.ts's expandModuleSelection and lms-generation.ts's own header
 * comment), so a module-only selection - the natural way to say "generate
 * from this week" - offers the same kinds an item selection does. Offers
 * nothing only when BOTH counts are zero. `moduleCount` defaults to 0 so
 * every existing call site that only ever checked items keeps compiling and
 * behaving identically. Kept as its own function (rather than an inline
 * check at the render site) because it is a clean, pure, sabotage-checkable
 * unit.
 */
export function offerableGenerationKinds(itemCount: number, moduleCount = 0): readonly GenerationKindDef[] {
  return itemCount > 0 || moduleCount > 0 ? GENERATION_KINDS : [];
}

export type GenerationBusy = "" | GenerationKindId;

export type GenerationBusyEvent = { type: "start"; kind: GenerationKindId } | { type: "finish" };

/**
 * The busy-state transition shared by the two generate buttons AND the
 * preview modal's refine button - mirrors useLmsSyllabusButtons' own single
 * `busy: "" | "quiz" | "syllabus"` string, so a generate for one kind, a
 * refine of that same kind, and the OTHER kind's generate button can never
 * run concurrently. "start" while something is already running is a
 * NO-OP - it returns the CURRENT (already-running) kind unchanged, not the
 * newly-requested one, so a caller that skips the `canStartGeneration` guard
 * before dispatching still cannot start a second concurrent write.
 */
export function nextGenerationBusy(current: GenerationBusy, event: GenerationBusyEvent): GenerationBusy {
  if (event.type === "finish") return "";
  if (current !== "") return current;
  return event.kind;
}

export function canStartGeneration(busy: GenerationBusy): boolean {
  return busy === "";
}

/**
 * Normalize `useModuleSelection.selectedMaterialItems()`'s already-
 * discriminated, already-keyed entries into generateFromSelectionAction's
 * `items` input. Used to filter down to `source === "live"` only
 * (`if (s.source !== "live") continue`) - the bug docs/REGRESSION.md entry
 * 262 check 10 was CORRECTED to record: gatherSelectionMaterials and
 * gatherExportItem (materials.ts) already handled an export-sourced entry
 * correctly, so this filter was the ONLY thing standing between an
 * export-sourced selection and a real generation - it silently discarded
 * every one before it ever reached the server. Both sources now pass
 * through unchanged; a fresh array is still returned (not the same
 * reference) so a caller can't accidentally mutate the hook's own selection
 * result through this function's output.
 */
export function buildSelectedMaterialItems(selectedItems: SelectedMaterialItem[]): SelectedMaterialItem[] {
  return [...selectedItems];
}

/**
 * The `moduleLabel` generateFromSelectionAction folds into the saved prompt
 * text (and, for "qa", passes straight through as generateLectureQaAction's
 * moduleName argument): the single module's name when every selected item
 * belongs to one LIVE module, or a spanning summary otherwise. Never returns
 * "" - the action's own default ("the selected material") is reproduced
 * here so the label shown while composing the request matches what gets
 * saved.
 *
 * MIXED (live + export) AND PURE-EXPORT SELECTIONS: an export-sourced item
 * carries a `moduleRef` (a manifest string), not a Canvas `moduleId` - there
 * is no course-title-like name to look up for it (materials.ts's own
 * ExportSelectedItem carries no name field at all). Rather than inventing
 * one or silently ignoring export items when counting "how many modules",
 * `locations` counts DISTINCT live-module-ids-and-export-module-refs
 * together (tagged so a live id and an export ref can never collide even
 * when numerically identical, e.g. live module 1 vs. export module "1") and
 * only names a single module by its real Canvas name when the WHOLE
 * selection resolves to exactly one live module. Any export involvement, or
 * a span across more than one location, falls back to the generic
 * "N items across M modules" summary - honest under a name-shaped generic
 * label is better than a fabricated or wrong module name.
 */
export function buildModuleLabel(
  items: ReadonlyArray<
    | Pick<LiveSelectedItem, "source" | "moduleId">
    | Pick<ExportSelectedItem, "source" | "moduleRef">
    | Pick<RepoSelectedItem, "source" | "moduleRef">
  >,
  modules: Array<{ id: number; name: string }>
): string {
  if (items.length === 0) return "the selected material";
  const nameById = new Map(modules.map((m) => [m.id, m.name] as const));
  // Tagged per source so two locations can never collide across sources even
  // when their identifiers are numerically identical (live module 1 vs export
  // module "1" vs a repo folder named "1").
  //
  // The parameter type is DERIVED from the three real arms via Pick rather
  // than hand-written, which is what this signature used to do. That
  // hand-written copy listed only live and export, so the moment the union
  // grew its third arm (docs/REGRESSION.md entry 298, the repo source) it
  // stopped accepting what its only caller already passes -
  // `buildSelectedMaterialItems` has always returned the full union. Deriving
  // it means a fourth source breaks this line loudly at the arm that is
  // missing, instead of silently drifting. Picking only the fields actually
  // read also keeps this function callable with minimal literals - a full
  // SelectedMaterialItem is assignable to its own Pick, so both the real
  // caller and the tests' small fixtures satisfy it without either side
  // fabricating a `key` and an `item` this function never looks at.
  const locations = new Set(
    items.map((it) =>
      it.source === "live" ? `live:${it.moduleId}` : it.source === "export" ? `export:${it.moduleRef}` : `repo:${it.moduleRef}`
    )
  );
  if (locations.size === 1 && items[0].source === "live") {
    return nameById.get(items[0].moduleId) ?? "the selected material";
  }
  return `${items.length} item${items.length === 1 ? "" : "s"} across ${locations.size} module${locations.size === 1 ? "" : "s"}`;
}

/** "1 item" / "N items", or "M modules, N items" once a whole-module
 * selection contributed - for the client-side success toast. Distinct from
 * buildModuleLabel, which names WHICH module(s) rather than how much was
 * used. `itemCount` is the TOTAL resolved item count (individually-selected
 * items plus every item inside a selected module, already deduped - see
 * expandModuleSelection), so "41 items" reflects what generation actually
 * used, not merely how many rows the instructor clicked. `moduleCount`
 * defaults to 0 so every existing call site keeps its old "N items" wording
 * unchanged. */
export function selectionSummaryLabel(itemCount: number, moduleCount = 0): string {
  if (itemCount <= 0) return "the current selection";
  const itemPart = `${itemCount} item${itemCount === 1 ? "" : "s"}`;
  if (moduleCount <= 0) return itemPart;
  return `${moduleCount} module${moduleCount === 1 ? "" : "s"}, ${itemPart}`;
}

/**
 * P6: the note text for a successful generate. Takes the KIND ID (not the
 * label directly - the label is still resolved from it via kindLabelFor)
 * because the sentence itself now depends on the kind: the three original
 * "save-version" kinds keep the EXACT sentence they always have (their tests
 * assert it verbatim), while a "save-and-post" kind gets an accurate
 * replacement - generating alone still never touches Canvas (do not
 * overcorrect into implying it does), but the instructor still needs to know
 * posting is available as a separate step.
 */
export function generationSuccessNote(kindId: GenerationKindId, version: number, selectionLabel: string): string {
  const kindLabel = kindLabelFor(kindId);
  const base = `Generated "${kindLabel}" (version ${version}) from ${selectionLabel}. Saved to this course's generated content`;
  return kindOffersPost(kindId)
    ? `${base} - not yet posted to Canvas. Use "Post to Canvas" below when you're ready.`
    : `${base} - nothing was written to Canvas.`;
}

/** Same split as generationSuccessNote, for a refine's own success note. */
export function refineSuccessNote(kindId: GenerationKindId, version: number): string {
  const kindLabel = kindLabelFor(kindId);
  const base = `Created a new version of "${kindLabel}" (version ${version}) from your instructions. Saved to this course's generated content`;
  return kindOffersPost(kindId)
    ? `${base} - not yet posted to Canvas. Use "Post to Canvas" below when you're ready.`
    : `${base} - nothing was written to Canvas.`;
}

/**
 * E12 (chunk 3e): the note text for a successful manual edit save - same
 * split as generationSuccessNote/refineSuccessNote above (a "save-and-post"
 * kind still needs the "not yet posted" reminder; editing is offered for
 * SOME of those kinds too - objectives and assignments carry no
 * `renderStructured`, so kindSupportsTextEdit and kindOffersPost overlap for
 * them - never only the "save-version" ones). Deliberately says "saved your
 * edit" rather than reusing generationSuccessNote/refineSuccessNote's own
 * wording verbatim, so a note in the UI never claims a model produced text
 * the instructor typed themselves.
 */
export function editSuccessNote(kindId: GenerationKindId, version: number): string {
  const kindLabel = kindLabelFor(kindId);
  const base = `Saved your edit as a new version of "${kindLabel}" (version ${version}). Saved to this course's generated content`;
  return kindOffersPost(kindId)
    ? `${base} - not yet posted to Canvas. Use "Post to Canvas" below when you're ready.`
    : `${base} - nothing was written to Canvas.`;
}

/**
 * P6's third and fourth places: the preview modal's own header meta line
 * repeats generationSuccessNote/refineSuccessNote's Canvas claim a THIRD
 * time, for whichever version is currently on screen (not necessarily the
 * one a generate/refine just produced - the instructor may have switched to
 * an older version via the version picker). Same split, phrased for "this is
 * the state of what's on screen" rather than "this is what this action just
 * did": deliberately NOT "nothing has been posted" (unlike the two notes
 * above) - unlike those two, which report on the generate/refine call that
 * just ran, this line has no way to know whether THIS SPECIFIC version was
 * posted at some earlier point (posting does not mark the artifact row in
 * any way this client can see), so it states the always-true fact - posting
 * is a separate, explicit step - rather than reasserting a Canvas state that
 * could by then be stale.
 */
export function previewMetaText(kindId: GenerationKindId, version: number): string {
  return kindOffersPost(kindId)
    ? `Version ${version} - saved to this course's generated content. Posting to Canvas is a separate, explicit step below.`
    : `Version ${version} - saved to this course's generated content. Nothing was written to Canvas.`;
}

/** P5: the sentinel TextField option value for "create a new module by name"
 * in the post-target select, distinct from every real Canvas module id
 * (always a positive number, so a non-numeric sentinel can never collide).
 *
 * Owned by src/lib/syllabus-ack-quiz-target.ts (docs/syllabus-ack-quiz-
 * module-target-acceptance-criteria.md, AC4) - a dependency-free lib must
 * not reach into a "use client" hook, so the constant moved there. Imported
 * above (not `export ... from`, which creates no local binding) and
 * re-exported here so every existing consumer of THIS module
 * (GeneratedPreviewModal.tsx, useLmsGeneration.test.ts) keeps compiling with
 * no import change of its own. */
export { NEW_MODULE_TARGET_VALUE };

/**
 * Turn the post-target picker's own UI state - a single select where one
 * option means "create a new module by name" (P5), plus that name's own text
 * field, shown only when the sentinel is picked - into the `ModuleTarget`
 * commit-plan.ts's `planModuleTarget` expects. Blank/no selection and a
 * blank new-module name are both refused here, with the same wording
 * `planModuleTarget` itself would use for the latter - surfaced before the
 * post call is ever made rather than only after a round trip.
 */
export function resolvePostModuleTarget(
  choice: string,
  newModuleName: string
): { ok: true; target: ModuleTarget } | { ok: false; reason: string } {
  if (choice === NEW_MODULE_TARGET_VALUE) {
    const name = newModuleName.trim();
    if (!name) return { ok: false, reason: "Enter a name for the new module." };
    return { ok: true, target: { kind: "new", name } };
  }
  const moduleId = Number(choice);
  if (!choice || !Number.isFinite(moduleId)) {
    return { ok: false, reason: "Choose where to post this - an existing module, or a new one." };
  }
  return { ok: true, target: { kind: "existing", moduleId } };
}

/** id/name pairs for the post-target module select - the tab's already-
 * loaded live module tree, narrowed the same way deckTemplateOptionsFrom
 * narrows DeckTemplate for its own picker. */
export interface PostModuleOption {
  id: number;
  name: string;
}

export function postModuleOptionsFrom(modules: CanvasModule[]): PostModuleOption[] {
  return modules.map((m) => ({ id: m.id, name: m.name }));
}

/**
 * P4: turn a completed post's PostSummary into the two-valued `setNote`
 * shape this whole tab already reports through. Mirrors
 * useBulkModuleActions.ts's own `describeOrphans` precedent exactly: a
 * PARTIAL result (the orphan case - created but not linked, or partly
 * landed) is reported with `kind: "error"`, never `"success"` - P4's "never a
 * bare success when it was not linked" - but with `summary.text`, which
 * already names what WAS created, never a bare "failed" either. Only a TRUE
 * "success" status gets `kind: "success"`.
 */
export function postResultNote(summary: PostSummary): { kind: "success" | "error"; text: string } {
  return { kind: summary.status === "success" ? "success" : "error", text: summary.text };
}

/** e.g. "v3 (current) - 2026-08-11". The date is sliced from the ISO
 * timestamp rather than run through `toLocaleDateString` so the label is
 * deterministic across locales/timezones - it is asserted verbatim in
 * useLmsGeneration.test.ts. */
export function versionOptionLabel(artifact: { version: number; isCurrent: boolean; createdAt: string }): string {
  const date = artifact.createdAt.slice(0, 10);
  return `v${artifact.version}${artifact.isCurrent ? " (current)" : ""} - ${date}`;
}

/** The structural subset of listGeneratedArtifactVersionsAction's return
 * shape loadVersionsForPreview needs - injected so this stays a plain,
 * DI-testable function like this file's other pure exports, rather than
 * requiring a vi.mock of the real Server Action to test. */
export type ListVersionsCall = (input: { courseUrl: string; kind: GenerationKindId; courseId?: string }) => Promise<
  { versions: GeneratedArtifact[] } | { error: string; courseNotLinked?: true }
>;

/**
 * The REAL, server-stored version history for `courseUrl` + `kindId` -
 * this is the loader referenced in this file's header comment: what
 * populates `preview.versions` after every successful generate/refine, in
 * place of the old locally-accumulated `sessionVersions` array. Fails
 * forward to `[fallback]` (the version the caller just created/refined,
 * already known to be saved) rather than leaving the preview empty, so a
 * listing hiccup immediately after a successful save never hides the
 * version that IS, in fact, already in the database.
 *
 * `courseId` (AC1/AC2 defect fix): an export selection's course_hub row id,
 * threaded through unchanged - undefined for a live selection, which keeps
 * resolving by `courseUrl` alone (listGeneratedArtifactVersionsAction's own
 * source-aware resolution, src/app/actions/lms-generation.ts).
 */
export async function loadVersionsForPreview(
  listVersions: ListVersionsCall,
  courseUrl: string,
  kindId: GenerationKindId,
  fallback: GeneratedArtifact,
  courseId?: string
): Promise<GeneratedArtifact[]> {
  const result = await listVersions({ courseUrl, kind: kindId, courseId });
  if ("error" in result || result.versions.length === 0) return [fallback];
  return result.versions;
}

/**
 * Calls the deck Route Handler (src/app/api/lms-generation/deck/route.ts)
 * rather than generateFromSelectionAction (a Server Action) - deck
 * generation can run several sequential LLM calls (see that route's own
 * header comment) and routinely exceeds what a Server Action can spend on
 * this page (src/app/page.tsx sets no `maxDuration`). Mirrors
 * AccessibilityProvider.tsx's own `a11yApi` exactly: a non-JSON response (an
 * auth redirect to the login page, a platform timeout page) is treated as a
 * clean error instead of letting `JSON.parse` throw "Unexpected token '<'".
 * This is what makes a mid-generation timeout fail safely - the route never
 * writes a version until generation fully succeeds (its own header comment),
 * so a timeout here is guaranteed to mean nothing was saved, never a
 * truncated deck.
 */
async function generateDeckApi(
  payload: DeckGenerationRequest
): Promise<DeckGenerationSuccess | DeckGenerationFailure> {
  try {
    const res = await fetch("/api/lms-generation/deck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.headers.get("content-type")?.includes("application/json")) {
      return {
        error:
          res.status === 401 || res.status === 403
            ? "Your session expired - sign in again."
            : `Deck generation failed or timed out (HTTP ${res.status}). Try a smaller selection or a simpler template.`,
      };
    }
    return (await res.json()) as DeckGenerationSuccess | DeckGenerationFailure;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error" };
  }
}

/** id/name pairs for the deck template picker - deliberately narrower than
 * the full DeckTemplate (GenerateFromSelectionSection only ever needs to
 * list and select by id). Built-in presets first (DECK_PRESETS is
 * synchronous, zero-network, so the dropdown is never empty even before the
 * instructor's saved templates below finish loading), then this user's own
 * saved deck_templates rows, in listDeckTemplatesAction's own order. */
export interface DeckTemplateOption {
  id: string;
  name: string;
}

export function deckTemplateOptionsFrom(templates: DeckTemplate[]): DeckTemplateOption[] {
  return templates.map((t) => ({ id: t.id, name: t.name }));
}

/** S13: PER COURSE, following useLmsSyllabusButtons.ts's own read-on-init /
 * write-on-change `ta-` idiom (moduleChoiceKey/readStored, that file's
 * :45-54) - `courseUrl` is what uniquely identifies a course here, same as
 * every other `ta-` key in this tab.
 *
 * Exported (unlike moduleChoiceKey's own, deliberately private, precedent)
 * because it is the one piece of this control's persistence that a
 * node-environment test can actually reach: vitest here has no DOM
 * (vitest.config.ts: environment: "node"), so `window` is undefined and the
 * read-on-init/write-on-change effect itself is unexercisable end to end in
 * this test file - the same limit this file's own header comment already
 * states for every other piece of this hook's React wiring. See
 * useLmsGeneration.test.ts's own "script length persistence" describe block. */
export function scriptMinutesKey(courseUrl: string): string {
  return `ta-lms-script-minutes-${courseUrl}`;
}
function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

// ── Hook ─────────────────────────────────────────────────────────────────

export interface GenerationPreviewState {
  kindId: GenerationKindId;
  kindLabel: string;
  /** Newest-first. The REAL stored history for this course+kind (via
   * loadVersionsForPreview/listGeneratedArtifactVersionsAction) - not
   * merely what this page load has produced. */
  versions: GeneratedArtifact[];
  selectedVersion: number;
  /** Materials-gathering notes from the generate call that produced the
   * newest version (omitted descriptions, truncation, per-item fetch
   * failures) - empty after a refine, which does not re-gather materials. */
  notes: string[];
}

export interface UseLmsGenerationReturn {
  busy: GenerationBusy;
  /** Offerable kinds for the CURRENT selection - see offerableGenerationKinds. */
  kinds: readonly GenerationKindDef[];
  generate: (kindId: GenerationKindId) => void;
  /** Decks only - the template picker's options (built-in presets first,
   * then this user's saved deck_templates) and the currently-selected id.
   * Every other kind ignores these. */
  templates: readonly DeckTemplateOption[];
  templateId: string;
  setTemplateId: (id: string) => void;
  /** Scripts only - the length select's offered options (in minutes), and
   * the currently-selected value, persisted per course (S13). Every other
   * kind ignores these, the same way every other kind ignores
   * `templates`/`templateId` above. */
  scriptLengthOptions: readonly number[];
  scriptMinutes: number;
  setScriptMinutes: (minutes: number) => void;
  preview: GenerationPreviewState | null;
  closePreview: () => void;
  /** Switch which already-loaded version the modal displays - no network
   * call, every version's text is already in `preview.versions`. */
  selectVersion: (version: number) => void;
  instructions: string;
  setInstructions: (v: string) => void;
  refine: () => void;
  refining: boolean;
  /** Formats downloadable for the version CURRENTLY ON SCREEN (AC 1 of
   * docs/generated-artifact-download-acceptance-criteria.md) -
   * `preview.versions.find(v => v.version === preview.selectedVersion)`, run
   * through artifactDownloadFormats. Empty when there is no preview open. */
  downloadFormats: readonly ArtifactDownloadFormat[];
  /** The format currently being built, or null when no download is in
   * flight - drives the preview modal's "Preparing..." progress label and
   * disables the download control while set (AC 7). */
  downloading: ArtifactDownloadFormat | null;
  /** Build and trigger a browser download of the selected version in
   * `format`. A pure client-side read of already-saved data - never writes
   * anything anywhere (AC 8) and never closes the preview, including on
   * failure (AC 6). No-op while `!preview`, while a generate/refine is
   * running (`busy !== ""`), or while another download is already in flight
   * (AC 7). */
  download: (format: ArtifactDownloadFormat) => void;
  /** Whether the previewed kind can be posted at all (kindOffersPost of
   * `preview.kindId`) - `false` (and every post-related field below
   * meaningless) whenever `preview` is null or the previewed kind is one of
   * the three "save-version" kinds. Drives whether the modal shows "Post to
   * Canvas" at all (P1). */
  offersPost: boolean;
  /** Whether the previewed kind's post even needs a module target
   * (kindNeedsModuleTarget) - false for a "course-level" kind
   * (announcements today), which has no module-target picker to show at
   * all. Meaningless whenever `offersPost` is false. */
  postNeedsModuleTarget: boolean;
  /** id/name pairs for the post-target module select - this tab's own
   * already-loaded live module tree (see postModuleOptionsFrom). */
  postModuleOptions: readonly PostModuleOption[];
  /** The post-target select's own value - either a module id (as a string,
   * matching a TextField select's own value convention) or
   * NEW_MODULE_TARGET_VALUE. */
  postModuleChoice: string;
  setPostModuleChoice: (v: string) => void;
  /** The new module's name - relevant, and shown by the caller, only while
   * postModuleChoice === NEW_MODULE_TARGET_VALUE. */
  postNewModuleName: string;
  setPostNewModuleName: (v: string) => void;
  /** Post the version currently on screen (`preview.selectedVersion`) to
   * Canvas, into whatever `postModuleChoice`/`postNewModuleName` currently
   * resolve to (P5) - see this function's own body comment for the full
   * flow, including C1's tab-wide `setBusy`/`reload()` wiring. No-op while
   * `!preview`, the previewed kind does not offer posting, a generate/
   * refine/post is already running, or the module-target selection does not
   * yet resolve (resolvePostModuleTarget's own validation, surfaced through
   * `setNote` instead of silently doing nothing in that one case, since it is
   * the one guard the instructor can fix by typing rather than by waiting). */
  post: () => void;
  /** Whether the post triggered by `post` is in flight - mirrors `refining`,
   * so the post button's own label can read "Posting..." (this file's
   * existing progress-word convention) distinctly from `busy` alone, which a
   * concurrent generate of the same kind would also set. */
  posting: boolean;
  /** AC3/AC4 (defect fix): why posting the previewed kind is unavailable
   * right now, or null when it can be posted - see postUnavailableReasonFor's
   * own doc comment. Null whenever `preview` is null or the previewed kind
   * never offered posting in the first place. */
  postUnavailableReason: string | null;
  /** E1 (chunk 3e): whether the previewed kind's saved text IS the whole
   * artifact, so an edit control can be offered for it at all
   * (kindSupportsTextEdit) - false whenever `preview` is null or the
   * previewed kind is "decks"/"knowledgeChecks", whose `structured` payload
   * is the authoritative half (kinds.ts's own doc comment). */
  canEditText: boolean;
  /** Save the modal's own local draft as a NEW version (E2/E3) - never an
   * overwrite. No-op whenever `!preview`, the previewed kind cannot be
   * edited, another generate/refine/post/save is already running, or `text`
   * is blank (E5) - each guard reported through `setNote`, matching every
   * other entry point in this hook. On success, copies `refine`'s own tail
   * exactly (E12): re-fetch via `loadVersionsForPreview`, then `setPreview`
   * with the new version selected. On failure, `preview` is left untouched -
   * the modal's own draft state survives a failed save unmodified (E13). */
  saveEdit: (text: string) => void;
  /** Whether the save triggered by `saveEdit` is in flight - mirrors
   * `refining`/`posting`, so the Save button's own label can read
   * "Saving..." distinctly from `busy` alone. */
  savingEdit: boolean;
}

export function useLmsGeneration(
  courseUrl: string,
  provider: LlmProvider,
  selectedMaterialItems: () => SelectedMaterialItem[],
  selectedModules: Set<string>,
  modules: CanvasModule[],
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  /** The tab-wide Canvas-writing busy flag (ModulesView.tsx's own `busy`
   * state) - C1: held ONLY while `post` is in flight, never while
   * generate/refine run (see this file's own header comment for why those
   * two departures still stand). Named `setBusy` to match
   * useLmsSyllabusButtons.ts's own outer-flag parameter exactly; this hook's
   * OWN internal busy state is `setLocalBusy` below, the same split that
   * file already uses, for the same reason - a hook-local `busy` and the
   * tab-wide flag are two different things that happen to share a shape. */
  setBusy: (b: boolean) => void,
  /** Re-fetch the Canvas module tree - C1: called once `post` completes (any
   * outcome that reached a real PostSummary, not only "success" - see
   * `post`'s own comment for why), never after a plain generate/refine. */
  reload: () => void,
  /** A parsed course-export tree, when one is available - optional and
   * trailing so every existing caller (ModulesView.tsx does not thread
   * ContentTab's exportContentRef this far down yet - see
   * docs/REGRESSION.md entry 263's own "Limits" section) compiles unchanged.
   * Needed for the CLIENT-side half of expandModuleSelection's live/export
   * split - see that function's own header comment (materials.ts) for why
   * export module expansion cannot happen server-side at all. */
  exportModules?: CartridgeModule[] | null,
  /** An export selection's course_hub row id - the generation counterpart of
   * useSelectionDownload.ts's own `courseId` param (see ModulesView.tsx's
   * `exportCourseId` prop doc comment for the full threading story from
   * ContentTab). Undefined for a live selection. AC1/AC2 defect fix: this is
   * what lets generation identify an export-sourced course at all -
   * previously `courseUrl` alone (always "" for an export selection) was the
   * ONLY identifier sent, so `resolveLmsCourseRowAction("")` could never
   * match and every generation kind failed with "No saved course is linked
   * to ." */
  exportCourseId?: string,
  /** Which Course Content source is active, and whether a live Canvas course
   * is linked - see contentSourceGating.ts. Defaults to LIVE_CONTENT_SOURCE
   * so every existing caller compiles and behaves unchanged; only `post`'s
   * own courseWrite gate (AC3) reads this - see postUnavailableReasonFor. */
  sourceContext: ContentSourceContext = LIVE_CONTENT_SOURCE
): UseLmsGenerationReturn {
  // `setLocalBusy` - see this hook's own `setBusy` PARAMETER doc comment
  // above for why the outer tab-wide flag and this hook-local one need
  // distinct names now that both exist in the same scope.
  const [busy, setLocalBusy] = useState<GenerationBusy>("");
  const [preview, setPreview] = useState<GenerationPreviewState | null>(null);
  const [instructions, setInstructions] = useState("");
  const [refining, setRefining] = useState(false);
  const [downloading, setDownloading] = useState<ArtifactDownloadFormat | null>(null);
  const [posting, setPosting] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [postModuleChoice, setPostModuleChoice] = useState("");
  const [postNewModuleName, setPostNewModuleName] = useState("");
  // Seeded synchronously with the built-in presets (DECK_PRESETS is a pure,
  // zero-network const), so the deck template picker is never empty even
  // before the effect below finishes loading this user's own saved
  // deck_templates rows - see resolveDeckTemplateSelection's own doc comment
  // (deck.ts) for the refusal path this feeds when nothing is selected.
  const [templates, setTemplates] = useState<DeckTemplate[]>(DECK_PRESETS);
  const [templateId, setTemplateId] = useState<string>(DECK_PRESETS[0]?.id ?? "");
  // S13: scripts-only length select, persisted per course. Read through
  // resolveScriptMinutes so a stale/hand-edited/unoffered stored value falls
  // back to DEFAULT_SCRIPT_MINUTES instead of rendering an unselectable
  // option - same reasoning as scriptMinutesKey's own doc comment above.
  const [scriptMinutes, setScriptMinutes] = useState<number>(() =>
    resolveScriptMinutes(readStored(scriptMinutesKey(courseUrl)))
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(scriptMinutesKey(courseUrl), String(scriptMinutes));
  }, [courseUrl, scriptMinutes]);

  // setState-in-effect idiom (this repo's own convention): an inline async
  // IIFE with a `cancelled` flag, setState only after the await - never a
  // synchronous setState reached directly from the effect body.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listDeckTemplatesAction();
      if (cancelled || "error" in result) return;
      setTemplates([...DECK_PRESETS, ...result.templates]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const kinds = offerableGenerationKinds(selectedMaterialItems().length, selectedModules.size);

  const finishGenerateError = (message: string) => {
    setLocalBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
    setNote({ kind: "error", text: message });
  };

  const finishGenerateSuccess = async (
    kindId: GenerationKindId,
    artifact: GeneratedArtifact,
    notes: string[],
    selectionLabel: string
  ) => {
    const kindLabel = kindLabelFor(kindId);
    const versions = await loadVersionsForPreview(listGeneratedArtifactVersionsAction, courseUrl, kindId, artifact, exportCourseId);
    setPreview({ kindId, kindLabel, versions, selectedVersion: artifact.version, notes });
    setInstructions("");
    setLocalBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
    setNote({ kind: "success", text: generationSuccessNote(kindId, artifact.version, selectionLabel) });
  };

  const generate = (kindId: GenerationKindId) => {
    if (!canStartGeneration(busy)) return;
    const materialItems = buildSelectedMaterialItems(selectedMaterialItems());
    const moduleKeys = Array.from(selectedModules);
    if (materialItems.length === 0 && moduleKeys.length === 0) return;

    // LIVE and EXPORT module selections are expanded differently - see
    // expandModuleSelection's own header comment (materials.ts) for the full
    // rationale. Two calls to that SAME pure function, each isolating one
    // half of the work:
    //   - `expandedForLabel` passes this hook's own (possibly stale) client
    //     `modules` tree AND `exportModules`, to build ONLY the
    //     display-facing moduleLabel/selectionLabel below - never sent
    //     anywhere, so staleness here cannot change what gets generated
    //     (docs/REGRESSION.md entry 262 check 5).
    //   - `itemsForServer` passes an EMPTY live tree, so it expands ONLY the
    //     export half of the selection into real items right now - there is
    //     no server-side fetch path for a course export (entry 263 check 7).
    //     Any live module key contributes nothing to this call; it is sent
    //     instead as `moduleIds` below, which generateFromSelectionAction
    //     (or, for decks, the deck Route Handler) expands itself server-side
    //     from a FRESH read, never this stale client tree.
    const expandedForLabel = expandModuleSelection(materialItems, moduleKeys, modules, exportModules ?? undefined);
    const moduleLabel = buildModuleLabel(expandedForLabel, modules);
    const selectionLabel = selectionSummaryLabel(expandedForLabel.length, moduleKeys.length);

    const itemsForServer = expandModuleSelection(materialItems, moduleKeys, [], exportModules ?? undefined);
    const moduleIds = Array.from(liveModuleIdsFromKeys(moduleKeys));

    // DECKS run through the Route Handler, not generateFromSelectionAction -
    // see generateDeckApi's own comment for why. Refused client-side first
    // (no network call) when no template is picked, mirroring the
    // zero-selection check just above; the route enforces the identical
    // rule server-side too (defense in depth, same named reason either way -
    // see resolveDeckTemplateSelection, deck.ts).
    if (kindId === "decks") {
      const templateResolution = resolveDeckTemplateSelection(templateId);
      if (!templateResolution.ok) {
        setNote({ kind: "error", text: templateResolution.reason });
        return;
      }
      void (async () => {
        setLocalBusy((prev) => nextGenerationBusy(prev, { type: "start", kind: kindId }));
        setNote(null);
        const result = await generateDeckApi({
          courseUrl,
          courseId: exportCourseId,
          items: itemsForServer,
          moduleIds,
          moduleLabel,
          templateId: templateResolution.templateId,
          provider,
        });
        if ("error" in result) {
          finishGenerateError(result.error);
          return;
        }
        await finishGenerateSuccess(kindId, result.artifact, result.notes, selectionLabel);
      })();
      return;
    }

    void (async () => {
      setLocalBusy((prev) => nextGenerationBusy(prev, { type: "start", kind: kindId }));
      setNote(null);
      const result = await generateFromSelectionAction({
        courseUrl,
        courseId: exportCourseId,
        kind: kindId,
        items: itemsForServer,
        moduleIds,
        moduleLabel,
        provider,
        // S7/S12: sent unconditionally, not only for kindId === "scripts" -
        // the server ignores it for every other kind (GenerateFromSelectionInput's
        // own doc comment, src/app/actions/lms-generation.ts), and sending it
        // unconditionally keeps this call site a flat object literal rather
        // than a per-kind conditional spread for a field only one branch
        // reads server-side.
        targetMinutes: scriptMinutes,
      });
      if ("error" in result) {
        finishGenerateError(result.error);
        return;
      }
      await finishGenerateSuccess(kindId, result.artifact, result.notes, selectionLabel);
    })();
  };

  const closePreview = () => {
    setPreview(null);
    setInstructions("");
  };

  const selectVersion = (version: number) => {
    setPreview((prev) => (prev ? { ...prev, selectedVersion: version } : prev));
  };

  const refine = () => {
    if (!preview || !canStartGeneration(busy) || !instructions.trim()) return;
    const { kindId, kindLabel } = preview;
    const currentVersion = preview.versions.find((v) => v.version === preview.selectedVersion);
    const currentText = currentVersion?.text ?? "";

    void (async () => {
      setLocalBusy((prev) => nextGenerationBusy(prev, { type: "start", kind: kindId }));
      setRefining(true);
      setNote(null);
      const result = await refineGeneratedArtifactAction({
        courseUrl,
        courseId: exportCourseId,
        kind: kindId,
        currentText,
        // Sent unconditionally for EVERY kind, and no longer decks-only on
        // the server either. `currentStructured` is what the decks AND
        // knowledgeChecks refine branches revise instead of `currentText`
        // (re-parsing rendered text back into slides/questions is the lossy
        // round-trip kinds.ts rejects); `currentTitle` is what objectives,
        // assignments and announcements carry forward, because their titles
        // are not derivable from the revised text and postGeneratedArtifactAction
        // falls back to the generic kind label without one. Dropping either
        // here silently degrades a posted page/assignment/announcement's title
        // and makes a refined knowledge check unpostable - see
        // refineGeneratedArtifactAction's own branches.
        currentTitle: currentVersion?.title,
        currentStructured: currentVersion?.structured,
        instructions: instructions.trim(),
        provider,
      });
      if ("error" in result) {
        setLocalBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
        setRefining(false);
        setNote({ kind: "error", text: result.error });
        return;
      }

      const versions = await loadVersionsForPreview(
        listGeneratedArtifactVersionsAction,
        courseUrl,
        kindId,
        result.artifact,
        exportCourseId
      );
      setPreview({ kindId, kindLabel, versions, selectedVersion: result.artifact.version, notes: [] });
      setInstructions("");
      setLocalBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
      setRefining(false);
      setNote({ kind: "success", text: refineSuccessNote(kindId, result.artifact.version) });
    })();
  };

  /**
   * E1-E13 (chunk 3e, docs/generated-artifact-editing-acceptance-criteria.md):
   * save hand-edited text as a NEW version - never an overwrite (E2), and
   * refused here too (E4, defense in depth) for a kind whose `structured`
   * payload is the authoritative half, even though the modal never offers
   * the control for one (kindSupportsTextEdit - "decks"/"knowledgeChecks").
   *
   * `text` comes from the CALLER (the modal's own local `draft` state - see
   * GeneratedPreviewModal.tsx's own E9 comment for how it stays seeded to
   * the right version) - this trusts it as-is rather than re-deriving it
   * from `preview`, unlike `refine`'s own `currentText` lookup, because the
   * whole point of an edit is that the caller's text may already differ
   * from what is stored.
   *
   * Copies `refine`'s own success tail EXACTLY (E12): re-fetch through
   * `loadVersionsForPreview`, then `setPreview` with the new version
   * selected - `currentText` in the modal (and `selectedPreviewVersion`
   * below) are both derived from `preview` on every render, so replacing it
   * is what makes the modal show the new version with no second reload
   * anywhere in this file.
   */
  const saveEdit = (text: string) => {
    if (!preview || !canStartGeneration(busy) || !kindSupportsTextEdit(preview.kindId)) return;
    // E5: refused here too, not only via the Save button's own disabled
    // state - the same defense-in-depth posture generate/refine already
    // apply to their own upfront guards.
    if (!text.trim()) {
      setNote({ kind: "error", text: "Cannot save an empty edit." });
      return;
    }
    const { kindId, kindLabel } = preview;
    const currentVersion = preview.versions.find((v) => v.version === preview.selectedVersion);

    void (async () => {
      setLocalBusy((prev) => nextGenerationBusy(prev, { type: "start", kind: kindId }));
      setSavingEdit(true);
      setNote(null);
      const result = await saveEditedGeneratedArtifactAction({
        courseUrl,
        courseId: exportCourseId,
        kind: kindId,
        text,
        currentTitle: currentVersion?.title,
      });
      if ("error" in result) {
        // E13: `preview` is left untouched on a failed save - the modal's
        // own draft state is never cleared by this hook, so the instructor's
        // typing survives a network error intact.
        setLocalBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
        setSavingEdit(false);
        setNote({ kind: "error", text: result.error });
        return;
      }

      const versions = await loadVersionsForPreview(
        listGeneratedArtifactVersionsAction,
        courseUrl,
        kindId,
        result.artifact,
        exportCourseId
      );
      setPreview({ kindId, kindLabel, versions, selectedVersion: result.artifact.version, notes: [] });
      setLocalBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
      setSavingEdit(false);
      setNote({ kind: "success", text: editSuccessNote(kindId, result.artifact.version) });
    })();
  };

  /**
   * P1/P2/P5 (chunk 3b): post the version currently on screen to Canvas.
   * NOT reachable unless the previewed kind offers it (kindOffersPost) - the
   * modal only renders the "Post to Canvas" control in that case (P1: "shown
   * ONLY when the previewed kind's commitMode is save-and-post"), but this
   * still guards the same way generate/refine do, defensively.
   *
   * P2 ("the artifact is saved before anything is posted") is already true
   * by construction here: `post` only ever operates on an ALREADY-SAVED
   * `preview.versions` entry (found by `preview.selectedVersion`, the exact
   * version `download` above already targets) - there is no path from this
   * hook that posts freshly-generated, not-yet-saved content.
   *
   * C1: unlike generate/refine, this DOES hold the outer tab-wide `setBusy`
   * for its duration (a real Canvas write) and DOES call `reload()` once the
   * server call returns a real PostSummary - on "success" AND "partial" AND
   * "failed" alike, not only "success": even a "failed" summary can follow a
   * step that changed nothing, but reloading unconditionally here costs one
   * harmless extra fetch and removes any need for this hook to duplicate
   * summarizePostOutcome's own classification of which failures created
   * something and which did not. `reload()` is skipped only on a genuine
   * top-level `error` (course not linked, a thrown exception before any
   * Canvas call was attempted) - see postGeneratedArtifactAction's own
   * GenerationFailure return, reused here as-is.
   */
  const post = () => {
    if (!preview || !canStartGeneration(busy) || !kindOffersPost(preview.kindId)) return;

    // AC3/AC4 (defect fix): posting writes to Canvas, so it stays refused
    // for an export selection - reusing gateOperation's own "courseWrite"
    // wording (postUnavailableReasonFor above), never a new message. Checked
    // here, defensively, the same way the module-target validation just
    // below is - even though the modal is expected to show this reason
    // instead of a working control (GeneratedPreviewModal's own
    // `postUnavailableReason` prop), a click must never reach
    // postGeneratedArtifactAction and fail with a raw Canvas error.
    const postGateReason = postUnavailableReasonFor(preview.kindId, sourceContext);
    if (postGateReason) {
      setNote({ kind: "error", text: postGateReason });
      return;
    }

    // "course-level" kinds (announcements) need no module target at all - a
    // Canvas announcement has no module to choose (kindNeedsModuleTarget's
    // own doc comment) - so the picker's own UI state is neither read nor
    // required for them, and `target` is left `undefined`, matching
    // postGeneratedArtifactAction's own optional `target` field
    // (lms-generation.ts).
    let target: ModuleTarget | undefined;
    if (kindNeedsModuleTarget(preview.kindId)) {
      const targetResolution = resolvePostModuleTarget(postModuleChoice, postNewModuleName);
      if (!targetResolution.ok) {
        setNote({ kind: "error", text: targetResolution.reason });
        return;
      }
      target = targetResolution.target;
    }

    const artifact = preview.versions.find((v) => v.version === preview.selectedVersion);
    if (!artifact) return;
    const { kindId } = preview;

    void (async () => {
      setLocalBusy((prev) => nextGenerationBusy(prev, { type: "start", kind: kindId }));
      setPosting(true);
      setBusy(true);
      setNote(null);
      const result = await postGeneratedArtifactAction({
        courseUrl,
        courseId: exportCourseId,
        kind: kindId,
        artifactId: artifact.id,
        target,
      });
      setLocalBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
      setPosting(false);
      setBusy(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      setNote(postResultNote(result.summary));
      reload();
    })();
  };

  // The version the preview modal currently has ON SCREEN - AC 1 of
  // docs/generated-artifact-download-acceptance-criteria.md: "not the newest
  // version, not the current-marked one", whatever `selectedVersion` points
  // at. Shared by `downloadFormats` (below) and `download` so both always
  // agree on which row is being offered/built - mirrors `refine`'s own
  // `currentVersion` lookup a few lines up.
  const selectedPreviewVersion = preview?.versions.find((v) => v.version === preview.selectedVersion);

  const downloadFormats = selectedPreviewVersion ? artifactDownloadFormats(selectedPreviewVersion) : [];

  const download = (format: ArtifactDownloadFormat) => {
    // Three independent no-op guards (AC 7): no preview to download from, a
    // generate/refine already running, or a download already in flight -
    // matches this hook's other entry points' own upfront-guard style
    // (generate/refine above).
    if (!preview || busy !== "" || downloading !== null) return;
    const artifact = selectedPreviewVersion;
    // Defensive only: downloadFormats/artifactDownloadFormats would already
    // have excluded `format` from what the UI offers if this were false, so
    // this branch should be unreachable in practice.
    if (!artifact) return;
    const { kindLabel } = preview;

    void (async () => {
      setDownloading(format);
      try {
        const blob = await buildArtifactDownloadBlob(artifact, kindLabel, format);
        const filename = artifactDownloadFilename(artifact, kindLabel, format);
        triggerFileDownload(blob, filename);
      } catch (e) {
        // Surfaces through the SAME setNote channel generate/refine already
        // use (AC 6) - never an unhandled rejection, and the preview modal
        // is never closed here, so the instructor's place in the version
        // history is not lost just because a download failed.
        const message = e instanceof Error ? e.message : String(e);
        setNote({
          kind: "error",
          text: `Could not build the ${artifactDownloadFormatLabel(format)} download: ${message}`,
        });
      } finally {
        setDownloading(null);
      }
    })();
  };

  return {
    busy,
    kinds,
    generate,
    templates: deckTemplateOptionsFrom(templates),
    templateId,
    setTemplateId,
    scriptLengthOptions: SCRIPT_LENGTH_OPTIONS,
    scriptMinutes,
    setScriptMinutes,
    preview,
    closePreview,
    selectVersion,
    instructions,
    setInstructions,
    refine,
    refining,
    downloadFormats,
    downloading,
    download,
    offersPost: preview ? kindOffersPost(preview.kindId) : false,
    postNeedsModuleTarget: preview ? kindNeedsModuleTarget(preview.kindId) : false,
    postModuleOptions: postModuleOptionsFrom(modules),
    postModuleChoice,
    setPostModuleChoice,
    postNewModuleName,
    setPostNewModuleName,
    post,
    posting,
    postUnavailableReason: preview ? postUnavailableReasonFor(preview.kindId, sourceContext) : null,
    canEditText: preview ? kindSupportsTextEdit(preview.kindId) : false,
    saveEdit,
    savingEdit,
  };
}
