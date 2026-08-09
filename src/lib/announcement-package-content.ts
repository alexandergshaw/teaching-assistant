// Package-source twin of fetchModuleContentForWeeks
// (src/lib/canvas-modules/module-content.ts), for "draft each scheduled
// weekly announcement from that week's content in an uploaded course
// cartridge or export"
// (docs/weekly-announcement-package-io-acceptance-criteria.md AC1 items
// 7/8).
//
// The live fetcher walks a Canvas course over the network and returns a
// Map<number, WeekModuleContent>; this file does the same week-to-module
// resolution and materials formatting for an ALREADY-PARSED
// CartridgeCourseData.modules array, so draftPackageAnnouncementsAction
// (src/app/actions/weekly-announcement-drafting.ts) can hand its output to
// exactly the same buildWeeklyAnnouncementInstruction / draftWeeklyAnnouncements
// pipeline draftModuleAnnouncementsAction already uses, with the drafter none
// the wiser about which source produced the Map. There is deliberately no
// network, no error handling for a broken fetch, and no try/catch around the
// whole function the way the live fetcher has one - a parsed cartridge cannot
// fail to "read" once parseCartridgeBlob has already returned it.
//
// Client-bundle safe by construction: only `import type` from
// @/lib/cartridge-import (erased at compile time - isolatedModules is on in
// tsconfig.json, so this really does vanish from the emitted JS) and from
// @/lib/canvas-modules/module-content (so WeekModuleContent's shape here
// can never drift from the live path's), plus the already-pure
// @/lib/announcement-module-content. No next/headers, no
// @/lib/supabase/server, no @/app/actions, no fetch, no jszip - this file is
// imported by the attended registry step alongside cartridge-import.ts and
// common-cartridge.ts, both of which are already client-bundled by other
// registry steps (docs/weekly-announcement-package-io-acceptance-criteria.md
// AC6 item 38).
import type { CartridgeModule, CartridgeModuleItem } from "@/lib/cartridge-import";
import type { WeekModuleContent } from "@/lib/canvas-modules/module-content";
import {
  selectModuleForWeek,
  formatModuleMaterials,
  MODULE_MATERIALS_CAP,
  type ModuleContent,
  type ModuleContentItem,
} from "@/lib/announcement-module-content";

// AC1 item 8: a CartridgeModuleItem carries no due date and no points at
// all - not "unknown", structurally absent - so formatModuleMaterials'
// header line for a packaged source never renders the "(N points, due Mon
// D)" suffix a live Canvas item can carry. That is a data limit of the
// export format, not a bug - but it is deliberately NOT recorded in
// `notes` below. See the note on `notes` semantics in the function doc
// comment: the "drafted from the uploaded package" wording AC1 item 8
// asks for is produced by the CALLER's success branch
// (draftPackageAnnouncementsAction in
// src/app/actions/weekly-announcement-drafting.ts), never here, because
// `notes` means something else entirely and provenance would collide with
// it.

/**
 * Maps one parsed cartridge item onto the same ModuleContentItem shape the
 * live Canvas fetch layer produces. `dueAt`/`pointsPossible` are always null
 * here (AC1 item 8: a CartridgeModuleItem carries neither at all) - there is
 * no "unresolved" state to distinguish, unlike the live path's Canvas items,
 * which really can lack a due date. `body` collapses `undefined`
 * (resolveCartridgeItemBodies' "never resolved" state -
 * cartridge-import-shared.ts:35-44) to `""`, matching ModuleContentItem.body's
 * non-optional `string`.
 */
function toModuleContentItem(item: CartridgeModuleItem): ModuleContentItem {
  return {
    type: item.type,
    title: item.title,
    body: item.body ?? "",
    dueAt: null,
    pointsPossible: null,
  };
}

/**
 * Resolves each requested week's module content from an already-parsed
 * cartridge/export, mirroring fetchModuleContentForWeeks' per-week output
 * exactly: `selectModuleForWeek` (UNCHANGED - CartridgeModule satisfies its
 * `T extends { name: string }` bound directly) decides which module, if any,
 * a week resolves to; a week with no matching module gets the identical
 * "None matched" note and `matchedBy: "none"` the live path produces, so a
 * report reading either source's notes cannot tell them apart for that case.
 * `formatModuleMaterials` (UNCHANGED, same MODULE_MATERIALS_CAP) renders the
 * matched module's items; `weeks.length === 0` returns an empty Map before
 * touching `modules` at all, matching the live fetcher's own "no work for no
 * weeks" short circuit.
 *
 * `notes` on the returned WeekModuleContent means exactly what it means on
 * the live path (src/lib/canvas-modules/module-content.ts): PROBLEMS ONLY,
 * never provenance, and empty on a clean match. The live fetcher only ever
 * pushes a real fetch/read failure onto `notes`; a module that matched but
 * has nothing readable in it still gets `notes: []` there, because nothing
 * actually went wrong - selectModuleForWeek did its job and there simply
 * was no content. This function used to violate that contract by stamping
 * every matched week with a provenance note ("drafted from the uploaded
 * package"), which the caller (draftPackageAnnouncementsAction) re-purposes
 * as the REASON a week produced nothing when drafting fails - so a
 * matched-but-empty module produced a note that claimed both "nothing was
 * drafted" and "it WAS drafted from the package" in the same breath. This
 * function therefore never populates `notes` for a matched week; there is
 * no failure mode it can observe here that the live path's `notes` would
 * also record for a clean match. Package provenance is surfaced by the
 * caller's own success-note branch instead, where it cannot be mistaken for
 * a failure reason.
 */
export function packageModuleContentForWeeks(
  modules: CartridgeModule[],
  weeks: number[],
  weekCount: number
): Map<number, WeekModuleContent> {
  const out = new Map<number, WeekModuleContent>();
  if (weeks.length === 0) return out;

  for (const week of weeks) {
    const selection = selectModuleForWeek(modules, week, weekCount);

    if (!selection.module) {
      out.set(week, {
        week,
        moduleName: null,
        materials: "",
        matchedBy: "none",
        truncated: false,
        // Byte-identical wording to fetchModuleContentForWeeks'
        // (src/lib/canvas-modules/module-content.ts:182) own no-match note,
        // so AC1 item 7's "falls back exactly as the live path does"
        // extends to the note text, not just matchedBy.
        notes: [`No module matched week ${week} - reported no content rather than guessing one.`],
      });
      continue;
    }

    const targetModule = selection.module;
    const contentItems: ModuleContentItem[] = targetModule.items.map(toModuleContentItem);
    const moduleContent: ModuleContent = { name: targetModule.name, items: contentItems };
    const { text, truncated } = formatModuleMaterials(moduleContent, MODULE_MATERIALS_CAP);

    out.set(week, {
      week,
      moduleName: targetModule.name,
      materials: text,
      matchedBy: selection.matchedBy,
      truncated,
      // PROBLEMS ONLY (see the doc comment above) - empty on every matched
      // week, whether or not the module actually had readable content.
      // DEFECT 3 fix: this used to be [PACKAGE_SOURCE_NOTE], which the
      // caller could splice into a "nothing was drafted" message as if it
      // were the reason - self-contradicting for a matched-but-empty
      // module.
      notes: [],
    });
  }

  return out;
}
