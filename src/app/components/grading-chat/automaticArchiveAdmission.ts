import type { RecoverableGroup } from "@/lib/grade/large-zip-subset";

/** Auto-submit only fully supported groups; the handoff records the rest. */
export function automaticArchiveAdmission(incoming: boolean, groups: readonly RecoverableGroup[], admitted: readonly RecoverableGroup[], completeNested: (group: RecoverableGroup) => boolean = () => false): boolean {
  if (!incoming || !admitted.length) return false;
  const source = new Map(groups.map((group) => [group.label, group]));
  if (source.size !== groups.length || new Set(admitted.map((group) => group.label)).size !== admitted.length) return false;
  return admitted.every((group) => { const actual = source.get(group.label); return actual === group && (!actual.reason || (actual.reason === "nested archive" && completeNested(actual))); });
}
