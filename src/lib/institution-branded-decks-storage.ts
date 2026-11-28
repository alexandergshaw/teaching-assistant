import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { INSTITUTION_BRANDED_DECKS_BUCKET, type InstitutionBrandedDeck, type InstitutionDeckExtension } from "./institution-branded-decks";
import type { InstitutionDirectoryDeckRow } from "./supabase/types.institution-directory";

type Client = SupabaseClient<Database>;

export function institutionDeckPath(area: "staging" | "files", owner: string, acronym: string, id: string, extension: InstitutionDeckExtension): string {
  return `${area}/${owner}/${acronym}/${id}.${extension}`;
}

export function publicInstitutionDeck(row: InstitutionDirectoryDeckRow): InstitutionBrandedDeck {
  return { id: row.id, acronym: row.acronym, name: row.file_name, size: row.size_bytes, extension: row.extension };
}

export async function institutionExists(client: Client, owner: string, acronym: string): Promise<boolean> {
  const { data, error } = await client.from("institution_directory_profiles").select("acronym").eq("user_id", owner).eq("acronym", acronym).maybeSingle();
  if (error) throw new Error("Institution lookup failed.");
  return !!data;
}

export async function listInstitutionDeckRows(client: Client, owner: string, acronym?: string): Promise<InstitutionDirectoryDeckRow[]> {
  const rows: InstitutionDirectoryDeckRow[] = [];
  const count = 200;
  for (let offset = 0; ; offset += count) {
    let query = client.from("institution_directory_decks").select("*").eq("user_id", owner);
    if (acronym !== undefined) query = query.eq("acronym", acronym);
    const { data, error } = await query.order("created_at").order("id").range(offset, offset + count - 1);
    if (error) throw new Error("Institution slide deck lookup failed.");
    rows.push(...data);
    if (data.length < count) return rows;
  }
}

export async function getInstitutionDeckRow(client: Client, owner: string, acronym: string, id: string) {
  const { data, error } = await client.from("institution_directory_decks").select("*")
    .eq("user_id", owner).eq("acronym", acronym).eq("id", id).maybeSingle();
  if (error) throw new Error("Institution slide deck lookup failed.");
  return data;
}

/** Only exact owned paths from registered metadata are removed. */
export async function removeInstitutionDeckObjects(client: Client, owner: string, rows: InstitutionDirectoryDeckRow[]): Promise<void> {
  if (!rows.length) return;
  const bucket = client.storage.from(INSTITUTION_BRANDED_DECKS_BUCKET);
  for (let offset = 0; offset < rows.length; offset += 100) {
    const { error } = await bucket.remove(rows.slice(offset, offset + 100).map((row) => institutionDeckPath("files", owner, row.acronym, row.id, row.extension)));
    if (error) throw new Error("Institution slide deck cleanup failed.");
  }
}
