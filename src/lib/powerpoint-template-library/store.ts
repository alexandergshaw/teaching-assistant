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
const LIBRARY_PAGE_SIZE = 200;
const LIBRARY_LIST_LIMIT = 5000;
export async function listLibrariesWithCompleteness(userId: string): Promise<{ libraries: LibraryMeta[]; truncated: boolean; snapshotUncertain: boolean }> {
  const rows: LibraryRow[] = [];
  let total: number | null = null;
  const seen = new Set<string>();
  for (let start = 0; start < LIBRARY_LIST_LIMIT; start += LIBRARY_PAGE_SIZE) {
    const { data, error, count } = await table("powerpoint_template_libraries").select("id,source_file_id,name,updated_at", { count: "exact" }).eq("user_id", userId).order("updated_at", { ascending: false }).order("id", { ascending: false }).range(start, start + LIBRARY_PAGE_SIZE - 1);
    if (error || !Array.isArray(data) || !Number.isSafeInteger(count) || count < 0 || (total !== null && total !== count)) throw new TemplateError("PPT_STORAGE");
    total = count;
    const expected = Math.min(LIBRARY_PAGE_SIZE, Math.max(0, count - start));
    if (data.length !== expected) throw new TemplateError("PPT_STORAGE");
    for (const row of data as LibraryRow[]) { if (seen.has(row.id)) throw new TemplateError("PPT_STORAGE"); seen.add(row.id); rows.push(row); }
    if (start + data.length >= count) break;
  }
  // Check ownership without downloading full PowerPoint files. Bound each IN
  // query so it stays below common database row and URL limits.
  const ids: string[] = [];
  for (const id of new Set(rows.map((row) => row.source_file_id))) {
    try { assertId(id); ids.push(id); }
    catch (error) { if (!(error instanceof TemplateError) || error.code !== "PPT_NOT_FOUND") throw error; }
  }
  const owned = new Set<string>();
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100);
    const result = await table("deck_template_files").select("id").eq("user_id", userId).in("id", batch);
    if (result.error) throw new TemplateError("PPT_STORAGE");
    for (const source of (result.data ?? []) as { id: string }[]) owned.add(source.id);
  }
  return { libraries: rows.filter((row) => owned.has(row.source_file_id)).map(meta), truncated: (total ?? 0) > LIBRARY_LIST_LIMIT, snapshotUncertain: (total ?? 0) > LIBRARY_PAGE_SIZE };
}
export async function listLibraries(userId: string): Promise<LibraryMeta[]> { return (await listLibrariesWithCompleteness(userId)).libraries; }
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
