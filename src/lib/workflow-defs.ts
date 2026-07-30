// Client-side persistence for Workflows-tab custom definitions; browser talks to Supabase.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";
import type { WorkflowDef, WorkflowStepConfig, WorkflowScope, PresetOverrideDelta } from "@/lib/workflows/types";

export async function listWorkflowDefs(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<WorkflowDef[]> {
  const { data: rows, error } = await supabase
    .from("workflow_defs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (rows || []).map(mapWorkflowDef);
}

export async function upsertWorkflowDef(
  supabase: SupabaseClient<Database>,
  userId: string,
  def: WorkflowDef
): Promise<void> {
  const { error } = await (supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("workflow_defs") as any)
    .upsert({
      id: def.id,
      user_id: userId,
      name: def.name,
      description: def.description,
      steps: def.steps as unknown as Json,
      scope: (def.scope ?? {}) as unknown as Json,
      // Non-null only for a preset override (see preset-overrides.ts's
      // toStoredDef) - this is what a preset id in `id` above actually
      // MEANS: not a duplicate row, the current user's delta over that
      // preset. Explicitly null (not omitted) so re-saving a workflow that
      // used to be a preset override as a plain one (should that ever
      // happen) clears any stale delta rather than leaving it behind.
      preset_overrides: (def.presetOverrideDelta ?? null) as unknown as Json,
      updated_at: new Date().toISOString(),
      // The primary key is (user_id, id) - see migration
      // 20260916000000_workflow_defs_preset_overrides.sql - so two users can
      // each own their own override of the same preset id.
    }, { onConflict: "user_id,id" });

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteWorkflowDef(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("workflow_defs")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

// Exported so the row -> def mapping (including the scope round-trip) is
// unit-testable without a live Supabase client.
export function mapWorkflowDef(row: Database["public"]["Tables"]["workflow_defs"]["Row"]): WorkflowDef {
  const scope =
    row.scope && typeof row.scope === "object" && !Array.isArray(row.scope)
      ? (row.scope as unknown as WorkflowScope)
      : undefined;
  // Present only on a preset-override row (see preset-overrides.ts); a plain
  // custom workflow's `preset_overrides` column is null. This is the RAW
  // delta - allWorkflows (presets.ts) is what resolves it against the
  // current code preset, so this mapper stays a pure row -> def shape
  // translation, matching everything else in this file.
  const presetOverrideDelta =
    row.preset_overrides &&
    typeof row.preset_overrides === "object" &&
    !Array.isArray(row.preset_overrides)
      ? (row.preset_overrides as unknown as PresetOverrideDelta)
      : undefined;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    steps: Array.isArray(row.steps)
      ? (row.steps as unknown as WorkflowStepConfig[])
      : [],
    // Drop an empty scope object so def.scope stays undefined when nothing is set.
    ...(scope && Object.keys(scope).length > 0 ? { scope } : {}),
    ...(presetOverrideDelta ? { presetOverrideDelta } : {}),
  };
}
