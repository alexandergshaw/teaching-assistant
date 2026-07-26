"use server";

import type { ArtifactTemplate, ArtifactTemplateKind } from "@/lib/artifact-templates/types";
import { ARTIFACT_TEMPLATE_PRESETS, isPresetArtifactTemplateId } from "@/lib/artifact-templates/presets";
import {
  listArtifactTemplates,
  upsertArtifactTemplate,
  deleteArtifactTemplate,
} from "@/lib/artifact-templates";
import { createServiceClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/supabase/auth";

// ── Artifact Templates (user-level store shared by the assignment / test /
// discussion / quiz / class-session families) ──────────────────────────────

/** List all saved artifact templates for the owner, presets first. */
export async function listArtifactTemplatesAction(
  kind?: ArtifactTemplateKind
): Promise<{ templates: ArtifactTemplate[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const presets = kind
      ? ARTIFACT_TEMPLATE_PRESETS.filter((t) => t.kind === kind)
      : ARTIFACT_TEMPLATE_PRESETS;
    const userTemplates = await listArtifactTemplates(supabase, user.id, kind);
    return { templates: [...presets, ...userTemplates] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list templates." };
  }
}

/** Load an artifact template by id or name (including presets). */
export async function getArtifactTemplateAction(
  idOrName: string,
  kind?: ArtifactTemplateKind
): Promise<{ template: ArtifactTemplate } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const key = String(idOrName ?? "").trim();
    const presets = kind
      ? ARTIFACT_TEMPLATE_PRESETS.filter((t) => t.kind === kind)
      : ARTIFACT_TEMPLATE_PRESETS;
    const userTemplates = await listArtifactTemplates(supabase, user.id, kind);
    // Also let presets resolve by id/name so a workflow can target a built-in template.
    const pool = [...presets, ...userTemplates];
    const found =
      pool.find((t) => t.id === key) ||
      pool.find((t) => t.name.trim().toLowerCase() === key.toLowerCase());
    if (!found) return { error: `No artifact template matches "${key}".` };
    return { template: found };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the template." };
  }
}

/** Save (create or update) an artifact template. Built-in presets cannot be edited. */
export async function saveArtifactTemplateAction(
  template: ArtifactTemplate
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (isPresetArtifactTemplateId(template.id)) {
      return { error: "Built-in templates cannot be edited - duplicate it first." };
    }
    if (!template.name.trim()) return { error: "Enter a template name." };
    const supabase = createServiceClient();
    await upsertArtifactTemplate(supabase, user.id, template);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the template." };
  }
}

/** Delete an artifact template. Built-in presets cannot be deleted. */
export async function deleteArtifactTemplateAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    if (isPresetArtifactTemplateId(id)) {
      return { error: "Built-in templates cannot be edited - duplicate it first." };
    }
    const supabase = createServiceClient();
    await deleteArtifactTemplate(supabase, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the template." };
  }
}
