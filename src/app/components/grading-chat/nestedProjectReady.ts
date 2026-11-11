import type { RecoverableGroup } from "@/lib/grade/large-zip-subset";
import type { ProjectInventoryFile } from "@/lib/grade/brightspace-project-inventory";
const safeCompanion = /\.(?:txt|md|py|ipynb|csv|pdf|docx|html|c|cc|cpp|cxx|h|hpp|user|recipe|log|command)$/i;
/** Preselect only groups the bounded project builder can preserve. */
export function projectReady(group: RecoverableGroup, files: Readonly<Record<string, readonly ProjectInventoryFile[]>>): boolean {
  if (group.reason !== "nested archive" || !/^\d+-\d+$/.test(group.label)) return false;
  return group.members.every((member) => {
    if (!member.nestedArchive) return member.declaredBytes <= 40 * 1024 * 1024 && safeCompanion.test(member.path);
    const inventory = files[member.path]; if (!inventory || inventory.some((item) => item.disposition === "needs-review")) return false;
    const retained = inventory.filter((item) => item.disposition === "retain");
    return retained.some((item) => /\.(?:c|cc|cpp|cxx|h|hpp|py|js|ts)$/i.test(item.path)) && retained.reduce((total, item) => total + item.declaredBytes, 0) <= 40 * 1024 * 1024;
  });
}
