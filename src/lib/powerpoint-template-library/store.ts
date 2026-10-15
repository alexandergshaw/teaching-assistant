import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { assertId, libraryName, TemplateError, type LibraryDefinition, type LibraryMeta, type SavedLibrary } from "./types";

interface LibraryRow { id: string; source_file_id: string; name: string; definition: LibraryDefinition; updated_at: string }
export interface SourceFile { id: string; content: string; fileName: string }
function table(name: string) {
  // The service-client convention for tables not in the generated Database map.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (createServiceClient() as any).from(name);
}
function meta(row: LibraryRow): LibraryMeta {
  return { id: row.id, sourceFileId: row.source_file_id, name: row.name, updatedAt: row.updated_at };
}
export async function getSource(userId: string, id: string): Promise<SourceFile> {
  assertId(id);
  const { data, error } = await table("deck_template_files").select("id,content,file_name").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw new TemplateError("PPT_STORAGE");
  if (!data) throw new TemplateError("PPT_NOT_FOUND");
  return { id: data.id, content: data.content, fileName: data.file_name };
}
export async function listLibraries(userId: string): Promise<LibraryMeta[]> {
  const { data, error } = await table("powerpoint_template_libraries").select("id,source_file_id,name,updated_at").eq("user_id", userId).order("updated_at", { ascending: false });
  if (error) throw new TemplateError("PPT_STORAGE");
  // Joining ownership on read also hides orphaned/foreign references in legacy data.
  const out: LibraryMeta[] = [];
  for (const row of (data ?? []) as LibraryRow[]) {
    try { await getSource(userId, row.source_file_id); out.push(meta(row)); }
    catch (error) { if (!(error instanceof TemplateError) || error.code !== "PPT_NOT_FOUND") throw error; }
  }
  return out;
}
export async function getLibrary(userId: string, id: string): Promise<SavedLibrary> {
  assertId(id);
  const { data, error } = await table("powerpoint_template_libraries").select("id,source_file_id,name,definition,updated_at").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw new TemplateError("PPT_STORAGE");
  if (!data) throw new TemplateError("PPT_NOT_FOUND");
  const row = data as LibraryRow;
  await getSource(userId, row.source_file_id);
  return { ...meta(row), definition: row.definition };
}
export async function saveLibrary(userId: string, id: string | null, sourceFileId: string, name: string, definition: LibraryDefinition): Promise<SavedLibrary> {
  await getSource(userId, sourceFileId);
  const safeName = libraryName(name);
  if (id !== null) {
    const previous = await getLibrary(userId, id);
    if (previous.sourceFileId !== sourceFileId) throw new TemplateError("PPT_INVALID");
  }
  const row = { name: safeName, definition, updated_at: new Date().toISOString() };
  const query = id === null
    ? table("powerpoint_template_libraries").insert({ ...row, id: randomUUID(), user_id: userId, source_file_id: sourceFileId })
    : table("powerpoint_template_libraries").update(row).eq("user_id", userId).eq("id", id).eq("source_file_id", sourceFileId);
  const { data, error } = await query.select("id,source_file_id,name,definition,updated_at").single();
  if (error || !data) throw new TemplateError("PPT_STORAGE");
  return { ...meta(data), definition: data.definition };
}
