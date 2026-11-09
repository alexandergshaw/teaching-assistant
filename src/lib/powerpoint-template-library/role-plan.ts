import { validateAssignments } from "./analysis";
import { SLIDE_ROLES, type SlideRole, type SourceSlide } from "./types";

type SlotGroup = { slide: number; paragraphs: readonly { id: string }[] };
type RequestedSlide = { role: SlideRole; bulletCount: number };
export type RolePlan =
  | { ok: true; assignments: Array<{ outputIndex: number; sourceId: string; sourceOrdinal: number; paragraphIds: string[] }> }
  | { ok: false; error: string };

/**
 * Plan an exact, one-to-one role match without modifying a PowerPoint file.
 * The caller must load the library and source under the same authenticated
 * owner, derive groups from that source, and verify the source has not changed.
 * This plan deliberately does not clone or remove slides or infer output roles.
 */
export function planRoleAwareSlides(rawDefinition: unknown, source: SourceSlide[], groups: readonly SlotGroup[], requested: readonly RequestedSlide[]): RolePlan {
  if (!Array.isArray(source) || !Array.isArray(groups) || !Array.isArray(requested) || !source.length || source.some((slide, index) => !slide || typeof slide.id !== "string" || !slide.id || typeof slide.text !== "string" || slide.ordinal !== index + 1) || new Set(source.map((slide) => slide.id)).size !== source.length) {
    return { ok: false, error: "Could not safely identify the source slides." };
  }
  let definition;
  try {
    if (!rawDefinition || typeof rawDefinition !== "object" || (rawDefinition as { version?: unknown }).version !== 1) throw new Error("Invalid version");
    definition = validateAssignments(rawDefinition, source);
  }
  catch { return { ok: false, error: "The saved classifications do not match this source. Reopen and review the library." }; }
  if (requested.length !== source.length || groups.length !== source.length) {
    return { ok: false, error: "Role-based fill currently requires the same number of generated and source slides." };
  }
  const byOrdinal = new Map<number, SlotGroup>();
  const paragraphIds = new Set<string>();
  for (const group of groups) {
    if (!group || !Number.isInteger(group.slide) || group.slide < 1 || group.slide > source.length || byOrdinal.has(group.slide) || !Array.isArray(group.paragraphs)) {
      return { ok: false, error: "Could not safely identify the source slide slots." };
    }
    for (const paragraph of group.paragraphs) {
      if (!paragraph || typeof paragraph.id !== "string" || !paragraph.id || paragraphIds.has(paragraph.id)) return { ok: false, error: "Could not safely identify the source slide slots." };
      paragraphIds.add(paragraph.id);
    }
    byOrdinal.set(group.slide, group);
  }
  const assignments: Array<{ outputIndex: number; sourceId: string; sourceOrdinal: number; paragraphIds: string[] }> = [];
  const used = new Set<string>();
  for (let index = 0; index < requested.length; index++) {
    const slide = requested[index];
    if (!slide || !SLIDE_ROLES.includes(slide.role) || !Number.isSafeInteger(slide.bulletCount) || slide.bulletCount < 0) {
      return { ok: false, error: `Choose a valid role and bullet count for generated slide ${index + 1}.` };
    }
    const match = definition.slides.find((candidate) => {
      const slots = byOrdinal.get(candidate.ordinal)?.paragraphs;
      return !used.has(candidate.id) && candidate.role === slide.role && Boolean(candidate.text.trim()) && slots?.length === slide.bulletCount + 1;
    });
    if (!match) return { ok: false, error: `No unused ${slide.role} source slide has the required editable slots for generated slide ${index + 1}.` };
    const slots = byOrdinal.get(match.ordinal)!;
    used.add(match.id);
    assignments.push({ outputIndex: index, sourceId: match.id, sourceOrdinal: match.ordinal, paragraphIds: slots.paragraphs.map((paragraph) => paragraph.id) });
  }
  return { ok: true, assignments };
}
