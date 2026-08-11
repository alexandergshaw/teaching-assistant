// A DISPLAY view-model for the module tree that either Course Content source
// (live Canvas, or a stored LMS export - src/lib/lms-export-source) can
// populate, so ModuleCard/ModuleItemRow/AddItemRow can render whichever one
// is on screen without widening CanvasModule/CanvasModuleItem themselves.
// Those two stay exactly as they are: they are used across the Canvas WRITE
// layer (useInlineModuleEdits, useDragReorder, useBulkModuleActions, ...),
// where every one of their fields is genuinely guaranteed, and loosening them
// there would silently remove type safety from every writer - see
// docs/REGRESSION.md entry 264 check 9, the reason this file exists instead.
//
// Two pure converters build a DisplayModule[] from each source
// (canvasModulesToDisplay / cartridgeModulesToDisplay). NEITHER FABRICATES A
// SINGLE VALUE: a field its source object does not provide is OMITTED from
// the returned object - a real, verifiable-with-hasOwnProperty absence -
// never defaulted to `undefined`, `null`, `false` or `0`. A fabricated falsy
// value would make a gated control look operable when it structurally cannot
// work, exactly the failure entry 263 check 2's export-read adapter was
// built to avoid at the data layer. This file is the same discipline one
// layer up, at the render boundary.
//
// `raw` carries the EXACT source object through, unchanged, only when
// `source` is "canvas" - not a second, lossier copy of the data, the same
// reference the converter was given. It exists purely so a write control
// (ModuleItemRow/AddItemRow's handler props, all typed against
// CanvasModule/CanvasModuleItem and untouched by this file) can call through
// once contentSourceGating.ts has already allowed the write - see entry 264
// check 8. Every other field on DisplayModule/DisplayModuleItem is read
// directly for RENDERING (title, type, badges, hints) and is never a
// substitute for `raw` at a call site that needs the real object.

import type { ContentSource } from "@/lib/lms-export-source";
import type { CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";
import type { CartridgeModule, CartridgeModuleItem } from "@/lib/cartridge-import";

/**
 * The union of every field either Course Content source can supply for one
 * module item. `title`/`type` are the only two both sources genuinely
 * provide - and `type` can be an empty string on a generic (non-Canvas)
 * cartridge (see cartridge-import.ts's parseGenericCartridge), so it is
 * never itself treated as a presence signal.
 *
 * Every Canvas-only field (the eleven docs/REGRESSION.md entry 263 check 3
 * names beyond title/type) is OPTIONAL and present only when `source` is
 * "canvas". Every cartridge-only field is optional and present only when
 * `source` is "export".
 */
export interface DisplayModuleItem {
  source: ContentSource;
  title: string;
  type: string;

  // Canvas-only (CanvasModuleItem) - never set for an export-sourced item.
  id?: number;
  moduleId?: number;
  position?: number;
  indent?: number;
  published?: boolean;
  pageUrl?: string | null;
  contentId?: number | null;
  dueAt?: string | null;
  pointsPossible?: number | null;
  htmlUrl?: string | null;
  externalUrl?: string | null;

  // Cartridge-only (CartridgeModuleItem) - never set for a live item.
  identifier?: string;
  body?: string;

  /** The exact live object this display item was built from - see this
   * file's header comment. Present only when `source` is "canvas". */
  raw?: CanvasModuleItem;
}

/** The union of every field either source can supply for one module. */
export interface DisplayModule {
  source: ContentSource;
  name: string;
  items: DisplayModuleItem[];

  // Canvas-only (CanvasModule) - never set for an export-sourced module.
  id?: number;
  position?: number;
  published?: boolean;
  itemsCount?: number;

  // Cartridge-only (CartridgeModule) - never set for a live module.
  identifier?: string;

  /** The exact live object this display module was built from - see this
   * file's header comment. Present only when `source` is "canvas". */
  raw?: CanvasModule;
}

// One live Canvas item, tagged for display. Every field is copied from `it`
// as-is (including a genuinely `null` value, e.g. `dueAt: null` for an
// ungraded item - that is a real, present value, not an absence) - nothing
// here is defaulted, recomputed, or dropped.
function canvasItemToDisplay(it: CanvasModuleItem): DisplayModuleItem {
  return {
    source: "canvas",
    title: it.title,
    type: it.type,
    id: it.id,
    moduleId: it.moduleId,
    position: it.position,
    indent: it.indent,
    published: it.published,
    pageUrl: it.pageUrl,
    contentId: it.contentId,
    dueAt: it.dueAt,
    pointsPossible: it.pointsPossible,
    htmlUrl: it.htmlUrl,
    externalUrl: it.externalUrl,
    raw: it,
  };
}

/** One live Canvas module, tagged for display - its items are converted too
 * (never left as raw `CanvasModuleItem[]`), so every row downstream reads
 * one consistent shape regardless of which source is on screen. */
export function canvasModuleToDisplay(m: CanvasModule): DisplayModule {
  return {
    source: "canvas",
    name: m.name,
    items: m.items.map(canvasItemToDisplay),
    id: m.id,
    position: m.position,
    published: m.published,
    itemsCount: m.itemsCount,
    raw: m,
  };
}

/** Order-preserving: `Array.prototype.map` never reorders. */
export function canvasModulesToDisplay(modules: CanvasModule[]): DisplayModule[] {
  return modules.map(canvasModuleToDisplay);
}

// One cartridge item, tagged for display. `identifier`/`body` are assigned
// on the output ONLY when the source object genuinely has that key with a
// defined value - a plain `identifier: it.identifier` would set the
// property to literal `undefined` when absent, which IS a real (if
// undefined-valued) own property, and would pass `toBeUndefined()` while
// still failing a `hasOwnProperty` check meant to catch exactly that
// fabrication (docs/REGRESSION.md entry 263 check 2's own two-test pin on
// the adapter this mirrors). Every Canvas-only field is simply never
// assigned on this branch at all - there is no source value to copy from.
function cartridgeItemToDisplay(it: CartridgeModuleItem): DisplayModuleItem {
  const out: DisplayModuleItem = { source: "export", title: it.title, type: it.type };
  if (it.identifier !== undefined) out.identifier = it.identifier;
  if (it.body !== undefined) out.body = it.body;
  return out;
}

/** One export-sourced module, tagged for display - `identifier` is included
 * under the same "only when genuinely present" rule as the item converter
 * above. `position` is intentionally NOT copied from `CartridgeModule`: it
 * is the cartridge's own module ordering hint, not a Canvas-only identity
 * field this display type tracks, and array order (preserved below) already
 * carries that information for rendering. */
export function cartridgeModuleToDisplay(m: CartridgeModule): DisplayModule {
  const out: DisplayModule = { source: "export", name: m.name, items: m.items.map(cartridgeItemToDisplay) };
  if (m.identifier !== undefined) out.identifier = m.identifier;
  return out;
}

/** Order-preserving: `Array.prototype.map` never reorders. */
export function cartridgeModulesToDisplay(modules: CartridgeModule[]): DisplayModule[] {
  return modules.map(cartridgeModuleToDisplay);
}
