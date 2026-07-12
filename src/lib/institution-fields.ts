// Client-side persistence for per-institution common fields (the small editable
// field set shown above each institution's course cards); browser talks to Supabase.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";

export interface InstitutionField {
  id: string;
  label: string;
  type: "text" | "date" | "url";
  value: string;
}

/** Seeded on first open; the UI merges these with saved fields by id so new
 * defaults appear for existing users. */
export const DEFAULT_INSTITUTION_FIELDS: InstitutionField[] = [
  { id: "startDate", label: "Course start date", type: "date", value: "" },
  { id: "outlookUrl", label: "Outlook URL", type: "url", value: "" },
];

export async function loadInstitutionFields(
  supabase: SupabaseClient<Database>,
  userId: string,
  acronym: string
): Promise<InstitutionField[]> {
  const { data: row, error } = await supabase
    .from("institution_fields")
    .select("*")
    .eq("user_id", userId)
    .eq("acronym", acronym)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!row) {
    return [];
  }

  const mapped = mapInstitutionFields(row);
  const fields: InstitutionField[] = [];
  for (const entry of mapped) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== "string" || typeof raw.label !== "string") {
      continue;
    }
    fields.push({
      id: raw.id as string,
      label: raw.label as string,
      type: raw.type === "date" || raw.type === "url" ? raw.type : "text",
      value: typeof raw.value === "string" ? (raw.value as string) : "",
    });
  }
  return fields;
}

export async function saveInstitutionFields(
  supabase: SupabaseClient<Database>,
  userId: string,
  acronym: string,
  fields: InstitutionField[]
): Promise<void> {
  const { error } = await (supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("institution_fields") as any)
    .upsert({
      user_id: userId,
      acronym,
      fields: fields as unknown as Json,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,acronym" });

  if (error) {
    throw new Error(error.message);
  }
}

function mapInstitutionFields(
  row: Database["public"]["Tables"]["institution_fields"]["Row"]
): unknown[] {
  return Array.isArray(row.fields) ? row.fields : [];
}
