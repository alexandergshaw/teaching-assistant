"use server";

import { requireUser } from "@/lib/supabase/auth";
import { getLibrary, getSource } from "@/lib/powerpoint-template-library/store";
import { decodeSource } from "@/lib/powerpoint-template-library/inventory";
import { fillRoleAwareTemplate, RoleFillRefusal } from "@/lib/powerpoint-template-library/role-fill";
import { SLIDE_ROLES, type SlideRole } from "@/lib/powerpoint-template-library/types";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";

/** A library ID, not client-provided classifications, is the authority. */
export async function fillRoleAwarePowerPointAction(libraryId: string, sourceFileId: string, deck: unknown): Promise<{ base64: string; name: string } | { error: string }> {
  try {
    const user = await requireUser();
    if (!deck || typeof deck !== "object") return { error: "Generate a deck and assign every slide a role." };
    const input = deck as { presentationTitle?: unknown; slides?: unknown };
    if (typeof input.presentationTitle !== "string" || input.presentationTitle.length > 500 || !Array.isArray(input.slides) || !input.slides.length || input.slides.length > 80) return { error: "Generate a deck and assign every slide a role." };
    const slides: Array<{ title: string; bullets: string[]; role: SlideRole }> = [];
    for (const value of input.slides) {
      if (!value || typeof value !== "object") return { error: "Review the generated slide roles and content." };
      const slide = value as Record<string, unknown>;
      if (typeof slide.title !== "string" || !slide.title.trim() || !Array.isArray(slide.bullets) || !slide.bullets.every((bullet) => typeof bullet === "string") || typeof slide.role !== "string" || !SLIDE_ROLES.includes(slide.role as SlideRole)) return { error: "Review the generated slide roles and content." };
      if ((slide.notes != null && (typeof slide.notes !== "string" || slide.notes.trim())) || (slide.code != null && (typeof slide.code !== "string" || slide.code.trim())) || slide.graphic) return { error: "Role-aware template fill cannot preserve slide notes, code or graphics. Use another export option." };
      slides.push({ title: slide.title, bullets: slide.bullets as string[], role: slide.role as SlideRole });
    }
    if (JSON.stringify(slides).length > 24000) return { error: "The generated deck is too large for role-aware template fill." };
    const library = await getLibrary(user.id, libraryId);
    if (library.sourceFileId !== sourceFileId) return { error: "The selected library and source no longer match. Choose the library again." };
    const source = await getSource(user.id, library.sourceFileId);
    const bytes = await fillRoleAwareTemplate(decodeSource(source.content), library.definition, slides);
    const latestLibrary = await getLibrary(user.id, libraryId);
    const latestSource = await getSource(user.id, sourceFileId);
    if (latestLibrary.sourceFileId !== sourceFileId || latestLibrary.updatedAt !== library.updatedAt || JSON.stringify(latestLibrary.definition) !== JSON.stringify(library.definition) || latestSource.content !== source.content) {
      return { error: "The saved library changed while preparing the deck. Reopen it and try again." };
    }
    const base64 = bytes.toString("base64");
    if (base64.length > UPLOAD_WIRE_BUDGET_BYTES) return { error: "The filled deck is too large to return. Use a smaller template." };
    return { base64, name: input.presentationTitle.trim() || library.name };
  } catch (error) { return { error: error instanceof RoleFillRefusal ? error.message : "Could not fill this library with the selected roles. Check the library and slide capacity, then retry." }; }
}
