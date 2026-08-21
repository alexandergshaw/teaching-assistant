// The pure selection-payload/label helpers extracted from
// useLmsGeneration.ts to keep that file under this repo's 1000-line
// ceiling - a STRUCTURAL split only, no behaviour change. Re-exported from
// useLmsGeneration.ts so every existing import of that file keeps compiling
// unchanged. See useLmsGeneration.test.ts for the executable coverage of
// every export here.

import type { SelectedMaterialItem, LiveSelectedItem, ExportSelectedItem, RepoSelectedItem } from "@/lib/lms-generation/materials";
import { DEFAULT_MODULE_LABEL } from "@/lib/lms-generation/default-module-label";

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
 * "" - the action's own default (DEFAULT_MODULE_LABEL) is reproduced here
 * so the label shown while composing the request matches what gets saved.
 * WAVE 11B DEFECT 3 fix: this used to hand-spell "the selected material"
 * twice below rather than importing the shared constant - this function is
 * the PRODUCER of moduleLabel values that intro-script-prompt.ts's
 * isGenericModuleLabel later has to recognise, so a hand-spelled copy here
 * was the drift direction that mattered most.
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
  if (items.length === 0) return DEFAULT_MODULE_LABEL;
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
    return nameById.get(items[0].moduleId) ?? DEFAULT_MODULE_LABEL;
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
