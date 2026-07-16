// Client-side persistence for PowerPoint Design tab custom templates; browser talks to Supabase.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";
import type { DeckTemplate, DeckSlide, DeckLoopGroup } from "@/lib/decks/types";

export async function listDeckTemplates(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<DeckTemplate[]> {
  const { data: rows, error } = await supabase
    .from("deck_templates")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (rows || []).map(mapDeckTemplate);
}

export async function upsertDeckTemplate(
  supabase: SupabaseClient<Database>,
  userId: string,
  template: DeckTemplate
): Promise<void> {
  const { error } = await (supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("deck_templates") as any)
    .upsert({
      id: template.id,
      user_id: userId,
      name: template.name,
      description: template.description,
      slides: template.slides as unknown as Json,
      loops: template.loops as unknown as Json,
      audience: template.audience,
      tone: template.tone,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteDeckTemplate(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("deck_templates")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

// Exported so the row -> template mapping is unit-testable without a live Supabase client.
export function mapDeckTemplate(row: Database["public"]["Tables"]["deck_templates"]["Row"]): DeckTemplate {
  const slides = Array.isArray(row.slides)
    ? (row.slides as unknown as DeckSlide[])
    : [];
  const loops = Array.isArray(row.loops)
    ? (row.loops as unknown as DeckLoopGroup[])
    : [];

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    audience: row.audience ?? "",
    tone: row.tone ?? "",
    slides,
    loops,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
