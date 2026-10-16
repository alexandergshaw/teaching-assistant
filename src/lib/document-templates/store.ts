import { createServiceClient } from "@/lib/supabase/server";
import { boundedName, documentId, refuse, type DocumentTemplate, type DocumentTemplateMeta, type DocumentDefinition, type DocumentSourceKind } from "./types";

interface Row { id: string; name: string; source_file_name: string; source_kind: DocumentSourceKind; source_base64: string; source_sha256: string; definition: DocumentDefinition; template_base64: string; updated_at: string }
function table() {
  // This new table uses the repo's local row-mapper convention.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (createServiceClient() as any).from("document_template_files");
}
function meta(row: Row): DocumentTemplateMeta { return { id: row.id, name: row.name, fileName: row.source_file_name, sourceKind: row.source_kind, updatedAt: row.updated_at }; }
export async function listDocumentTemplates(userId: string): Promise<DocumentTemplateMeta[]> {
  const { data, error } = await table().select("id,name,source_file_name,source_kind,updated_at").eq("user_id", userId).order("updated_at", { ascending: false });
  if (error) refuse("storage_unavailable", "Document templates are unavailable. Check database setup and try again.");
  return ((data ?? []) as Row[]).map(meta);
}
export async function getDocumentTemplate(userId: string, id: string): Promise<DocumentTemplate> {
  const { data, error } = await table().select("*").eq("user_id", userId).eq("id", documentId(id)).maybeSingle();
  if (error) refuse("storage_unavailable", "Could not open the document template. Check database setup and try again.");
  if (!data) refuse("not_found", "That document template is unavailable.");
  const r = data as Row;
  return { ...meta(r), sourceBase64: r.source_base64, sourceSha256: r.source_sha256, definition: r.definition, templateBase64: r.template_base64 };
}
export async function saveDocumentTemplate(userId: string, input: Omit<DocumentTemplate, "id" | "updatedAt">, id?: string): Promise<DocumentTemplateMeta> {
  const name = boundedName(input.name);
  let query;
  if (id) {
    const existing = await getDocumentTemplate(userId, id);
    if (existing.sourceSha256 !== input.sourceSha256 || existing.sourceBase64 !== input.sourceBase64 || existing.fileName !== input.fileName || existing.sourceKind !== input.sourceKind) refuse("immutable_source", "A saved template's original cannot be replaced. Save a new template instead.");
    query = table().update({ name, definition: input.definition, template_base64: input.templateBase64, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("id", documentId(id));
  } else {
    query = table().insert({ user_id: userId, name, source_file_name: input.fileName, source_kind: input.sourceKind, source_base64: input.sourceBase64, source_sha256: input.sourceSha256, definition: input.definition, template_base64: input.templateBase64 });
  }
  const { data, error } = await query.select("id,name,source_file_name,source_kind,updated_at").single();
  if (error || !data) refuse("save_failed", "Could not save the template. Your reviewed proposal is still available; retry Save or download it.");
  return meta(data as Row);
}
