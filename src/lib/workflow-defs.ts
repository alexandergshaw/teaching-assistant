// Client-side persistence for Workflows-tab custom definitions; browser talks to Supabase.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";
import type { WorkflowDef, WorkflowStepConfig, WorkflowScope } from "@/lib/workflows/types";

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
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

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
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    steps: Array.isArray(row.steps)
      ? (row.steps as unknown as WorkflowStepConfig[])
      : [],
    // Drop an empty scope object so def.scope stays undefined when nothing is set.
    ...(scope && Object.keys(scope).length > 0 ? { scope } : {}),
  };
}
