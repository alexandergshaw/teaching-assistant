// Client-side persistence for Common Resources (Starter module reusable items);
// browser talks to Supabase.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";

export interface CommonResourceItem {
  id: string;
  type: "file" | "page";
  title: string;
  /** recording_files id when type = "file" */
  fileId?: string;
  /** page body text when type = "page" */
  body?: string;
}

export async function loadCommonResources(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<CommonResourceItem[]> {
  const { data: row, error } = await supabase
    .from("common_resources")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!row) {
    return [];
  }

  const mapped = mapCommonResources(row);
  return mapped.filter((item): item is CommonResourceItem => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const raw = item as Record<string, unknown>;
    return (
      typeof raw.id === "string" &&
      typeof raw.title === "string" &&
      (raw.type === "file" || raw.type === "page")
    );
  });
}

export async function saveCommonResources(
  supabase: SupabaseClient<Database>,
  userId: string,
  items: CommonResourceItem[]
): Promise<void> {
  const { error } = await (supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("common_resources") as any)
    .upsert({
      user_id: userId,
      items: items as unknown as Json,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (error) {
    throw new Error(error.message);
  }
}

function mapCommonResources(
  row: Database["public"]["Tables"]["common_resources"]["Row"]
): unknown[] {
  return Array.isArray(row.items) ? row.items : [];
}
