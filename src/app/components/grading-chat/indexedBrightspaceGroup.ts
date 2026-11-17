import { latestBrightspaceAttempt } from "@/lib/grade/brightspace-latest-attempt";
import { recoverableGroupReason, type RecoverableGroup } from "@/lib/grade/large-zip-subset";

export function indexedBrightspaceGroup(group: RecoverableGroup, indexComplete: boolean, rows?: readonly { readonly stem: string; readonly submitted: string }[]): RecoverableGroup {
  if (!/^\d+-\d+$/.test(group.label)) return group;
  if (!rows) return indexComplete || group.members.length > 1 ? { ...group, reason: "held for review" } : group;
  const attempt = latestBrightspaceAttempt(group.members.map((member) => member.path), rows);
  if (!attempt) return { ...group, reason: "held for review" };
  if (!attempt.earlier.length) return group;
  const members = group.members.filter((member) => attempt.latest.includes(member.path));
  return { ...group, members, reason: recoverableGroupReason(members), historicalPaths: attempt.earlier };
}
