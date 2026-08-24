// Pure read-only queries over the current item selection, extracted out of
// useBulkItemActions.ts (which was at 999 of this repo's 1000-line ceiling)
// so they are directly testable without a React render - the same "extract
// the pure core" answer this repo's own useCarryModulePattern.test.ts header
// names for the identical node-env/no-component constraint. Neither function
// here touches state; both are re-derived fresh from their inputs every call.
import type { BulkKind, CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";
import { itemKey } from "../utils";

/** One selected gradable item's data, reduced to what useBulkItemActions.ts's
 *  pre-fill effect needs: shared deadline / points across the selection. */
export interface SelectedGradable {
  type: string;
  contentId: number;
  dueAt: string | null;
  pointsPossible: number | null;
}

/**
 * The selected gradable items (Assignment/Quiz/Discussion with a real
 * contentId) plus the data useBulkItemActions.ts's pre-fill effect needs to
 * decide whether the selection shares one deadline / points value.
 */
export function computeSelectedGradables(modules: CanvasModule[], selected: ReadonlySet<string>): SelectedGradable[] {
  const arr: SelectedGradable[] = [];
  for (const mod of modules) {
    for (const it of mod.items) {
      if (
        selected.has(itemKey(mod.id, it.id)) &&
        ["Assignment", "Quiz", "Discussion"].includes(it.type) &&
        typeof it.contentId === "number"
      ) {
        arr.push({ type: it.type, contentId: it.contentId, dueAt: it.dueAt, pointsPossible: it.pointsPossible });
      }
    }
  }
  return arr;
}

/**
 * Group selected items' ids by kind, for the per-kind bulk endpoints
 * (bulkUpdateAction/bulkDeleteAction). `usePageSlug` switches a Page item's
 * id from its numeric contentId (never used for Pages) to its slug
 * (`pageUrl`), matching the per-kind endpoint's own id shape for that kind.
 */
export function groupIdsByKind(
  items: Array<{ item: CanvasModuleItem; moduleId: number }>,
  kinds: BulkKind[],
  usePageSlug = false
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const { item } of items) {
    if (!kinds.includes(item.type as BulkKind)) continue;
    const id =
      item.type === "Page"
        ? usePageSlug
          ? item.pageUrl
          : null
        : item.contentId != null
          ? String(item.contentId)
          : null;
    if (id) (map[item.type] ??= []).push(id);
  }
  return map;
}
