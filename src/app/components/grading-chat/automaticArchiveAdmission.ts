import type { RecoverableGroup } from "@/lib/grade/large-zip-subset";

/** Auto-submit only when every source group is fully accounted for. */
export function automaticArchiveAdmission(incoming: boolean, groups: readonly RecoverableGroup[], admitted: readonly RecoverableGroup[], completeNested: (group: RecoverableGroup) => boolean = () => false): boolean {
  return incoming && admitted.length > 0 && admitted.length === groups.length && groups.every((group) => !group.reason || (group.reason === "nested archive" && completeNested(group)));
}
