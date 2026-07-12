// Client-side persistence for Workflows-tab custom definitions; browser talks to Supabase.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";
import type { WorkflowDef, WorkflowStepConfig } from "@/lib/workflows/types";

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

function mapWorkflowDef(row: Database["public"]["Tables"]["workflow_defs"]["Row"]): WorkflowDef {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    steps: Array.isArray(row.steps)
      ? (row.steps as unknown as WorkflowStepConfig[])
      : [],
  };
}
