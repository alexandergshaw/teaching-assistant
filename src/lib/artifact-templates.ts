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

  // SCOPED UPDATE, THEN INSERT - deliberately NOT `.upsert(row, { onConflict:
  // "id" })`, which is what this used to be and which was a cross-tenant
  // takeover. `template.id` arrives from the CLIENT, the caller holds a
  // service-role client (RLS bypassed, auth.uid() null), and the action's
  // guard is requireOwner() - which is now an alias for requireUser(), i.e.
  // any active account. So passing another user's template id made the
  // upsert match THEIR row by primary key and rewrite it with this caller's
  // user_id: their template destroyed, and reassigned to the attacker, in one
  // call. Ids are guessable enough to matter - run logs print uuids in the
  // clear on purpose.
  //
  // The update is filtered on BOTH id and user_id, so a foreign id matches
  // nothing. If nothing was updated the row is either new (insert succeeds) or
  // owned by someone else (insert fails on the primary key, and refusing is
  // the correct outcome - never silently take it over).
  const { data: updated, error: updateError } = await supabase
    .from("artifact_templates")
    .update(insertRow)
    .eq("id", template.id)
    .eq("user_id", userId)
    .select("id");

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (updated && updated.length > 0) {
    return;
  }

  const { error } = await supabase.from("artifact_templates").insert(insertRow);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Delete one of THIS USER'S templates.
 *
 * `userId` is required and filtered on, and that is the whole point of the
 * parameter: this used to be `.delete().eq("id", id)` with no owner filter at
 * all, called with a service-role client that bypasses RLS, behind a guard
 * (requireOwner) that is now an alias for requireUser. Any active account
 * could therefore delete any other account's template by supplying its id.
 * Filtering on user_id makes a foreign id match zero rows, which Supabase
 * reports as a successful no-op - correct here, because the caller learns
 * nothing about whether that id exists for somebody else.
 */
export async function deleteArtifactTemplate(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<void> {
  const { error } = await supabase.from("artifact_templates").delete().eq("id", id).eq("user_id", userId);

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
