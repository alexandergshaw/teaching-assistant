// Client-side persistence for the artifact template store; browser talks to Supabase
// directly. Mirrors src/lib/deck-templates.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";
import type { ArtifactTemplate, ArtifactTemplateKind } from "@/lib/artifact-templates/types";
import {
  coerceAssignmentSpec,
  coerceTestSpec,
  coerceDiscussionSpec,
  coerceQuizSpec,
  coerceClassSessionSpec,
} from "@/lib/artifact-templates/types";
import { isPresetArtifactTemplateId } from "@/lib/artifact-templates/presets";

export async function listArtifactTemplates(
  supabase: SupabaseClient<Database>,
  userId: string,
  kind?: ArtifactTemplateKind
): Promise<ArtifactTemplate[]> {
  const base = supabase.from("artifact_templates").select("*").eq("user_id", userId);
  const filtered = kind ? base.eq("kind", kind) : base;

  const { data: rows, error } = await filtered.order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (rows || []).map(mapArtifactTemplate);
}

export async function upsertArtifactTemplate(
  supabase: SupabaseClient<Database>,
  userId: string,
  template: ArtifactTemplate
): Promise<void> {
  if (isPresetArtifactTemplateId(template.id)) {
    throw new Error("Built-in templates cannot be edited - duplicate it first.");
  }

  const insertRow: Database["public"]["Tables"]["artifact_templates"]["Insert"] = {
    id: template.id,
    user_id: userId,
    kind: template.kind,
    name: template.name,
    description: template.description,
    spec: template.spec as unknown as Json,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("artifact_templates").upsert(insertRow, { onConflict: "id" });

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteArtifactTemplate(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<void> {
  const { error } = await supabase.from("artifact_templates").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

// Every kind now has a designed spec, so each gets its own coercion. An
// unrecognized kind value from the DB still falls through to {} rather than
// guessing which spec it meant.
function coerceArtifactSpec(kind: string, spec: unknown): unknown {
  switch (kind) {
    case "assignment":
      return coerceAssignmentSpec(spec);
    case "test":
      return coerceTestSpec(spec);
    case "discussion":
      return coerceDiscussionSpec(spec);
    case "quiz":
      return coerceQuizSpec(spec);
    case "class-session":
      return coerceClassSessionSpec(spec);
    default:
      return {};
  }
}

// Exported so the row -> template mapping is unit-testable without a live Supabase client.
export function mapArtifactTemplate(
  row: Database["public"]["Tables"]["artifact_templates"]["Row"]
): ArtifactTemplate {
  return {
    id: row.id,
    kind: row.kind as ArtifactTemplateKind,
    name: row.name ?? "",
    description: row.description ?? "",
    spec: coerceArtifactSpec(row.kind, row.spec),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
