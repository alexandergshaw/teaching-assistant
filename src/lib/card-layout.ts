// Client-side persistence for Course Card Layout (per-user tile groups/order);
// browser talks to Supabase.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";

export interface CardLayoutGroup {
  id: string;
  label: string;
  tiles: string[];
}

/** Default card layout with built-in tile groups. Tile keys are the card's built-in tiles;
 * the UI appends unknown/new built-ins to their default group and renders per-course custom tiles by their groupId. */
export const DEFAULT_CARD_LAYOUT: CardLayoutGroup[] = [
  { id: "codebase", label: "Codebase", tiles: ["organization", "codebases"] },
  { id: "content", label: "Content", tiles: ["syllabus", "textbook", "description"] },
  { id: "schedule", label: "Schedule & LMS", tiles: ["startDate", "weeks", "tests", "lms"] },
  { id: "class", label: "Class", tiles: ["integrations", "roster"] },
  { id: "generated", label: "Generated", tiles: ["topics", "csv", "materials"] },
];

export async function loadCardLayout(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<CardLayoutGroup[]> {
  const { data: row, error } = await supabase
    .from("course_card_layout")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!row) {
    return [];
  }

  const mapped = mapCardLayout(row);
  const groups: CardLayoutGroup[] = [];
  for (const entry of mapped) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== "string" || typeof raw.label !== "string" || !Array.isArray(raw.tiles)) {
      continue;
    }
    groups.push({
      id: raw.id as string,
      label: raw.label as string,
      tiles: (raw.tiles as unknown[]).filter((t): t is string => typeof t === "string"),
    });
  }
  return groups;
}

export async function saveCardLayout(
  supabase: SupabaseClient<Database>,
  userId: string,
  groups: CardLayoutGroup[]
): Promise<void> {
  const { error } = await (supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("course_card_layout") as any)
    .upsert({
      user_id: userId,
      groups: groups as unknown as Json,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (error) {
    throw new Error(error.message);
  }
}

function mapCardLayout(
  row: Database["public"]["Tables"]["course_card_layout"]["Row"]
): unknown[] {
  return Array.isArray(row.groups) ? row.groups : [];
}
