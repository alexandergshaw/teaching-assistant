"use client";

// Local UI state + handlers for the LMS Modules bulk bar's "Generate from
// selection" control (chunk 1: two pure-text kinds - anticipated Q&A and
// current events - generated from the current selection and saved as a new
// version in the generated_artifacts store, src/lib/supabase/generated-artifacts.ts
// and its migration supabase/migrations/20261004000000_generated_artifacts.sql).
// NEITHER kind ever writes to Canvas. Calls the sibling-built
// src/app/actions/lms-generation.ts (generateFromSelectionAction,
// refineGeneratedArtifactAction, listGeneratedArtifactVersionsAction) - read
// in full before this hook was finalized.
//
// Mirrors useLmsSyllabusButtons.ts's shape: one `busy` string so the kind
// buttons (and the preview modal's own refine button) cannot double-fire and
// all disable while any one of them runs, and reports success/failure
// through the same `setNote` channel this whole tab already uses.
//
// TWO deliberate departures from useLmsSyllabusButtons, both because this
// feature never touches Canvas:
//   - It never calls the outer ModulesView `setBusy` - that flag gates
//     Canvas-writing controls across the whole tab, and holding it for a
//     30+ second grounded current-events search would block unrelated work
//     for no correctness reason (no Canvas state is shared). This matches
//     how useBulkItemActions/useBulkModuleActions already keep their own
//     bulk-bar-local `opBusy` separate from it.
//   - It never calls `reload()` - reload() re-fetches the Canvas module
//     tree, which this feature never changes.
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

import { useState } from "react";
import type { LlmProvider } from "@/lib/llm";
import type { CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";
import type { GeneratedArtifact } from "@/lib/supabase/generated-artifacts";
// The kind registry: a dependency-free leaf (no "@/app/actions" or Supabase
// import - see its own header comment), so a client hook can safely import
// it directly rather than duplicating its ids/labels and risking drift.
// GenerationKindId is "qa" | "currentEvents" here - NOT the
// "anticipated-qa" / "current-events" strings, which are the DB
// generated_artifacts.kind values (GENERATION_KIND_CONFIGS[id].artifactKind),
// a different vocabulary this hook never needs to spell itself.
import { GENERATION_KIND_CONFIGS, GENERATION_KIND_IDS, type GenerationKindId } from "@/lib/lms-generation/kinds";
import { expandModuleSelection, type LiveSelectedItem } from "@/lib/lms-generation/materials";
import {
  generateFromSelectionAction,
  refineGeneratedArtifactAction,
  listGeneratedArtifactVersionsAction,
} from "../../../actions/lms-generation";
import { itemKey, type ItemSource } from "../utils";

// ── Kinds (chunk 1: exactly these two, both pure text) ─────────────────────

export type { GenerationKindId };

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
 * The selection payload generateFromSelectionAction needs: fully-resolved
 * SelectedMaterialItem entries (materials.ts), not bare ids -
 * `selectedItems()` (useModuleSelection.ts) already carries the full
 * CanvasModuleItem, so no server round trip is needed to resolve one.
 * Filters to "live"-sourced items defensively - nothing in this app
 * produces an "export"-sourced selection key today (see
 * docs/REGRESSION.md #261 check 4), so this is forward-looking, not a live
 * gap, mirroring pruneSelectionForModules' own defensive handling of a
 * source it cannot act on.
 */
export function buildSelectedMaterialItems(
  selectedItems: Array<{ item: CanvasModuleItem; moduleId: number; source: ItemSource }>
): LiveSelectedItem[] {
  const out: LiveSelectedItem[] = [];
  for (const s of selectedItems) {
    if (s.source !== "live") continue;
    out.push({ source: "live", key: itemKey(s.moduleId, s.item.id), moduleId: s.moduleId, item: s.item });
  }
  return out;
}

/**
 * The `moduleLabel` generateFromSelectionAction folds into the saved prompt
 * text (and, for "qa", passes straight through as generateLectureQaAction's
 * moduleName argument): the single module's name when every selected item
 * belongs to one module, or a spanning summary otherwise. Never returns ""
 * - the action's own default ("the selected material") is reproduced here
 * so the label shown while composing the request matches what gets saved.
 */
export function buildModuleLabel(
  items: Array<{ moduleId: number }>,
  modules: Array<{ id: number; name: string }>
): string {
  if (items.length === 0) return "the selected material";
  const nameById = new Map(modules.map((m) => [m.id, m.name] as const));
  const uniqueModuleIds = Array.from(new Set(items.map((i) => i.moduleId)));
  if (uniqueModuleIds.length === 1) {
    return nameById.get(uniqueModuleIds[0]) ?? "the selected material";
  }
  return `${items.length} item${items.length === 1 ? "" : "s"} across ${uniqueModuleIds.length} modules`;
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

export function generationSuccessNote(kindLabel: string, version: number, selectionLabel: string): string {
  return `Generated "${kindLabel}" (version ${version}) from ${selectionLabel}. Saved to this course's generated content - nothing was written to Canvas.`;
}

export function refineSuccessNote(kindLabel: string, version: number): string {
  return `Created a new version of "${kindLabel}" (version ${version}) from your instructions. Saved to this course's generated content - nothing was written to Canvas.`;
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
export type ListVersionsCall = (input: { courseUrl: string; kind: GenerationKindId }) => Promise<
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
 */
export async function loadVersionsForPreview(
  listVersions: ListVersionsCall,
  courseUrl: string,
  kindId: GenerationKindId,
  fallback: GeneratedArtifact
): Promise<GeneratedArtifact[]> {
  const result = await listVersions({ courseUrl, kind: kindId });
  if ("error" in result || result.versions.length === 0) return [fallback];
  return result.versions;
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
  preview: GenerationPreviewState | null;
  closePreview: () => void;
  /** Switch which already-loaded version the modal displays - no network
   * call, every version's text is already in `preview.versions`. */
  selectVersion: (version: number) => void;
  instructions: string;
  setInstructions: (v: string) => void;
  refine: () => void;
  refining: boolean;
}

export function useLmsGeneration(
  courseUrl: string,
  provider: LlmProvider,
  selectedItems: () => Array<{ item: CanvasModuleItem; moduleId: number; source: ItemSource }>,
  selectedModules: Set<number>,
  modules: CanvasModule[],
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void
): UseLmsGenerationReturn {
  const [busy, setBusy] = useState<GenerationBusy>("");
  const [preview, setPreview] = useState<GenerationPreviewState | null>(null);
  const [instructions, setInstructions] = useState("");
  const [refining, setRefining] = useState(false);

  const kinds = offerableGenerationKinds(selectedItems().length, selectedModules.size);

  const generate = (kindId: GenerationKindId) => {
    if (!canStartGeneration(busy)) return;
    const materialItems = buildSelectedMaterialItems(selectedItems());
    const moduleIds = Array.from(selectedModules);
    if (materialItems.length === 0 && moduleIds.length === 0) return;
    // Client-side expansion is used ONLY to build the display-facing
    // moduleLabel/selectionLabel below (this hook already holds the current
    // `modules` tree for buildModuleLabel) - the actual generation still
    // sends `items` and `moduleIds` separately and lets
    // generateFromSelectionAction expand modules against a FRESH Canvas
    // read server-side (see that action's own header comment), so a stale
    // client tree can never affect what gets generated, only this label.
    const expandedForLabel = expandModuleSelection(materialItems, moduleIds, modules);
    const moduleLabel = buildModuleLabel(expandedForLabel, modules);
    const selectionLabel = selectionSummaryLabel(expandedForLabel.length, moduleIds.length);

    void (async () => {
      setBusy((prev) => nextGenerationBusy(prev, { type: "start", kind: kindId }));
      setNote(null);
      const result = await generateFromSelectionAction({
        courseUrl,
        kind: kindId,
        items: materialItems,
        moduleIds,
        moduleLabel,
        provider,
      });
      if ("error" in result) {
        setBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
        setNote({ kind: "error", text: result.error });
        return;
      }

      const kindLabel = kindLabelFor(kindId);
      const versions = await loadVersionsForPreview(listGeneratedArtifactVersionsAction, courseUrl, kindId, result.artifact);
      setPreview({ kindId, kindLabel, versions, selectedVersion: result.artifact.version, notes: result.notes });
      setInstructions("");
      setBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
      setNote({
        kind: "success",
        text: generationSuccessNote(kindLabel, result.artifact.version, selectionLabel),
      });
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
    const currentText = preview.versions.find((v) => v.version === preview.selectedVersion)?.text ?? "";

    void (async () => {
      setBusy((prev) => nextGenerationBusy(prev, { type: "start", kind: kindId }));
      setRefining(true);
      setNote(null);
      const result = await refineGeneratedArtifactAction({
        courseUrl,
        kind: kindId,
        currentText,
        instructions: instructions.trim(),
        provider,
      });
      if ("error" in result) {
        setBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
        setRefining(false);
        setNote({ kind: "error", text: result.error });
        return;
      }

      const versions = await loadVersionsForPreview(listGeneratedArtifactVersionsAction, courseUrl, kindId, result.artifact);
      setPreview({ kindId, kindLabel, versions, selectedVersion: result.artifact.version, notes: [] });
      setInstructions("");
      setBusy((prev) => nextGenerationBusy(prev, { type: "finish" }));
      setRefining(false);
      setNote({ kind: "success", text: refineSuccessNote(kindLabel, result.artifact.version) });
    })();
  };

  return { busy, kinds, generate, preview, closePreview, selectVersion, instructions, setInstructions, refine, refining };
}
