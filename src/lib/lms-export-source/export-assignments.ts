// Flatten an export's modules into a picker-ready list of assignment-like
// items (AC B4/C2 in
// docs/github-grading-folder-and-assignment-acceptance-criteria.md). An
// export has no flat assignment list of its own - assignments exist only as
// `CartridgeModuleItem`s sitting inside `CartridgeModule.items` - so this is
// the pure flatten/filter step a picker builds on. A LEAF module: no
// `@/app/actions` import, no Supabase client import, so it can be unit
// tested with plain in-memory fixtures and reused from any UI that already
// has `CartridgeModule[]` in hand (e.g. `ExportCourseContent.modules`).

import type { CartridgeModule, CartridgeModuleItem } from "@/lib/cartridge-import-shared";

/**
 * One assignment-like module item, flattened out of its module for display
 * in a `<select>`-style picker.
 */
export interface ExportAssignmentOption {
  /** The owning module's `CartridgeModule.name`, for the "grouped by module" picker (AC B4). */
  moduleTitle: string;
  /** The item's own `CartridgeModuleItem.title`. */
  itemTitle: string;
  /**
   * Stable, unique key across the WHOLE returned list - a `moduleIndex:
   * itemIndex` composite, not `CartridgeModuleItem.identifier` (optional on
   * some cartridge flavours - see that field's own doc comment in
   * cartridge-import-shared.ts) and not title (two items, in the same
   * module or different ones, can share a title). This is what a `<select>`
   * uses as its option value.
   */
  key: string;
  /**
   * `CartridgeModuleItem.body`, unresolved (missing) or blank (whitespace
   * only) collapsed to `null`. NEVER falls back to `itemTitle` - AC B4
   * requires a picker to say plainly when there is no body rather than
   * silently substituting the title as if it were instructions.
   */
  body: string | null;
  /** `false` when `body` is `null` - lets a consumer branch without re-deriving the same blank/whitespace check. */
  hasBody: boolean;
}

/**
 * Filters `modules` down to assignment-like items and flattens them,
 * preserving module order and then item order within each module.
 *
 * Filtered on `CartridgeModuleItem.type === "Assignment"` - the literal
 * string Canvas's own `course_settings/module_meta.xml` puts in
 * `<content_type>` for an assignment item (see `parseModuleMetaWithRefs` in
 * cartridge-import.ts, and the same string used throughout this codebase for
 * a Canvas assignment module item, e.g. `canvas-url.ts`'s
 * `moduleItemContentUrl`). This is the REAL field `CartridgeModuleItem`
 * declares for an item's kind - no new field is invented here. Per this
 * package's own header comment (index.ts), `type` is frequently blank ("")
 * on a non-Canvas / generic-cartridge export, so a generic export's
 * assignments will not be found by this filter; that is an existing,
 * already-documented fidelity gap (docs/REGRESSION.md entry 261), not
 * something this function papers over.
 */
export function exportAssignmentOptions(modules: CartridgeModule[]): ExportAssignmentOption[] {
  const options: ExportAssignmentOption[] = [];
  modules.forEach((courseModule, moduleIndex) => {
    courseModule.items.forEach((item: CartridgeModuleItem, itemIndex) => {
      if (item.type !== "Assignment") return;
      const body = item.body && item.body.trim() ? item.body : null;
      options.push({
        moduleTitle: courseModule.name,
        itemTitle: item.title,
        key: `${moduleIndex}:${itemIndex}`,
        body,
        hasBody: body !== null,
      });
    });
  });
  return options;
}

/** Look up a previously-listed option by its `key`, or `null` if `key` no longer matches anything in `options`. */
export function findExportAssignment(options: ExportAssignmentOption[], key: string): ExportAssignmentOption | null {
  return options.find((option) => option.key === key) ?? null;
}
