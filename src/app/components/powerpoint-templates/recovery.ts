import { SLIDE_ROLES, type LibraryDefinition, type SlideRole } from "@/lib/powerpoint-template-library/types";

export type PowerPointRecovery = { name: string; sourceId: string; sourceDigest: string; savedId: string | null; roles: { id: string; role: SlideRole }[]; needsFile: boolean };
export const recoveryKey = (userId: string) => `ta-ppt-template-recovery:${userId}`;
export function recoverySnapshot(name: string, sourceId: string, sourceDigest: string, savedId: string | null, definition: LibraryDefinition | null, needsFile: boolean): PowerPointRecovery {
  return { name, sourceId, sourceDigest, savedId, roles: definition?.slides.map(({ id, role }) => ({ id, role })) ?? [], needsFile };
}
export function parseRecovery(raw: string): PowerPointRecovery | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const item = value as Record<string, unknown>;
    if (typeof item.name !== "string" || item.name.length > 160 || typeof item.sourceId !== "string" || item.sourceId.length > 100 || typeof item.sourceDigest !== "string" || (item.sourceId ? !/^[a-f0-9]{64}$/.test(item.sourceDigest) : item.sourceDigest !== "") || !(item.savedId === null || (typeof item.savedId === "string" && item.savedId.length <= 100)) || typeof item.needsFile !== "boolean" || !Array.isArray(item.roles) || item.roles.length > 80) return null;
    const roles: PowerPointRecovery["roles"] = [];
    for (const value of item.roles) {
      if (!value || typeof value !== "object") return null;
      const role = value as Record<string, unknown>;
      if (typeof role.id !== "string" || role.id.length > 240 || !SLIDE_ROLES.includes(role.role as SlideRole) || roles.some((entry) => entry.id === role.id)) return null;
      roles.push({ id: role.id, role: role.role as SlideRole });
    }
    return { name: item.name, sourceId: item.sourceId, sourceDigest: item.sourceDigest, savedId: item.savedId as string | null, roles, needsFile: item.needsFile };
  } catch { return null; }
}
export function applyRecoveredRoles(definition: LibraryDefinition, roles: PowerPointRecovery["roles"]): LibraryDefinition | null {
  if (!roles.length) return definition;
  if (roles.length !== definition.slides.length || definition.slides.some((slide) => !roles.some((role) => role.id === slide.id))) return null;
  return { ...definition, slides: definition.slides.map((slide) => ({ ...slide, role: roles.find((entry) => entry.id === slide.id)!.role })) };
}
