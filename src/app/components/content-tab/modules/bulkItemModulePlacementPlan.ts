// Pure planning cores for useBulkItemActions.ts's "Shift up/down" and "Move
// to module" controls, extracted out of that file (which was at 999 of this
// repo's 1000-line ceiling) so the position math is directly testable
// without a React render - the same "extract the pure core" answer this
// repo's own useCarryModulePattern.test.ts header names for the identical
// node-env/no-component constraint. Both callers (bulkShiftModules /
// bulkMoveToModule in useBulkItemActions.ts) still decide validation,
// messaging, and the actual Canvas write themselves - only the "which item
// goes to which module at which position" arithmetic moved here.
import type { CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";

/**
 * "Shift up/down" (useBulkItemActions.ts's `bulkShiftModules`): plan moving
 * every selected item `delta` modules along the module list (negative =
 * toward the top). Each item's target is clamped to the first and last
 * module, so an item already at the edge in that direction is simply
 * excluded from the returned plan (the caller reads that as "nothing left to
 * move" when the plan is empty). Items land at the end of their target
 * module; when several items move into the same module, their relative
 * selection order is preserved via the running `appended` count per target.
 */
export function planModuleShiftMoves(
  items: Array<{ item: CanvasModuleItem; moduleId: number }>,
  modules: CanvasModule[],
  delta: number
): Map<number, { srcModuleId: number; targetModuleId: number; position: number }> {
  const moduleIndex = new Map<number, number>();
  modules.forEach((mod, idx) => moduleIndex.set(mod.id, idx));

  const appended = new Map<number, number>();
  const plan = new Map<number, { srcModuleId: number; targetModuleId: number; position: number }>();
  for (const { item, moduleId } of items) {
    const srcIdx = moduleIndex.get(moduleId);
    if (srcIdx === undefined) continue;
    const targetIdx = Math.min(modules.length - 1, Math.max(0, srcIdx + delta));
    if (targetIdx === srcIdx) continue; // already at the top/bottom in this direction
    const target = modules[targetIdx];
    const n = appended.get(target.id) ?? 0;
    plan.set(item.id, { srcModuleId: moduleId, targetModuleId: target.id, position: target.items.length + n + 1 });
    appended.set(target.id, n + 1);
  }
  return plan;
}

/**
 * "Move to module" (useBulkItemActions.ts's `bulkMoveToModule`): plan
 * appending every selected item that is not already in `targetModuleId` to
 * the end of that module, in selection order. `targetItemCount` is the
 * target module's current item count (`target.items.length`), passed in
 * rather than the whole module object since positioning is all this
 * function needs.
 */
export function planMoveToModulePositions(
  items: Array<{ item: CanvasModuleItem; moduleId: number }>,
  targetModuleId: number,
  targetItemCount: number
): Map<number, number> {
  let appended = 0;
  const plan = new Map<number, number>();
  for (const { item, moduleId } of items) {
    if (moduleId === targetModuleId) continue; // already in the target module
    plan.set(item.id, targetItemCount + appended + 1);
    appended += 1;
  }
  return plan;
}
