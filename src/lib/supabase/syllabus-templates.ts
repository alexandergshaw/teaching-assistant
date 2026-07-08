// Persistence for the owner's syllabus template library. Each template is a saved
// Word .docx (base64) plus a name. Reads/writes go through the Supabase
// service-role client behind requireOwner() (mirrors src/lib/google-credentials.ts);
// every query is explicitly scoped to the owning user_id.

import { createServiceClient } from "./server";
import type { Database } from "./types";

type TemplatesTable = Database["public"]["Tables"]["syllabus_templates"];

/** A template without its (potentially large) base64 body, for list views. */
export interface SyllabusTemplateMeta {
  id: string;
  name: string;
  fileName: string;
  updatedAt: string;
}

/** A template including its base64 .docx content. */
export interface SyllabusTemplate extends SyllabusTemplateMeta {
  content: string;
}

function table() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (createServiceClient() as any).from("syllabus_templates");
}

/** List the owner's templates (metadata only), newest first. */
export async function listTemplates(userId: string): Promise<SyllabusTemplateMeta[]> {
  const { data, error } = await table()
    .select("id, name, file_name, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("[syllabus-templates] Could not list templates:", error.message);
    return [];
  }
  const rows = (data ?? []) as Array<{ id: string; name: string; file_name: string; updated_at: string }>;
  return rows.map((r) => ({ id: r.id, name: r.name, fileName: r.file_name, updatedAt: r.updated_at }));
}

/** Fetch one template including its base64 content, or null if not found. */
export async function getTemplate(userId: string, id: string): Promise<SyllabusTemplate | null> {
  const { data, error } = await table()
    .select("id, name, file_name, content, updated_at")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[syllabus-templates] Could not read template:", error.message);
    return null;
  }
  if (!data) return null;
  const r = data as { id: string; name: string; file_name: string; content: string; updated_at: string };
  return { id: r.id, name: r.name, fileName: r.file_name, content: r.content, updatedAt: r.updated_at };
}

/** Create a template. Returns its metadata. */
export async function createTemplate(
  userId: string,
  name: string,
  fileName: string,
  content: string
): Promise<SyllabusTemplateMeta> {
  const row: TemplatesTable["Insert"] = {
    user_id: userId,
    name,
    file_name: fileName,
    content,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await table().insert(row).select("id, name, file_name, updated_at").single();
  if (error) {
    throw new Error(`Could not save the template: ${error.message}`);
  }
  const r = data as { id: string; name: string; file_name: string; updated_at: string };
  return { id: r.id, name: r.name, fileName: r.file_name, updatedAt: r.updated_at };
}

/** Update a template's name and/or its file (name + base64 content). */
export async function updateTemplate(
  userId: string,
  id: string,
  fields: { name?: string; fileName?: string; content?: string }
): Promise<void> {
  const row: TemplatesTable["Update"] = { updated_at: new Date().toISOString() };
  if (fields.name !== undefined) row.name = fields.name;
  if (fields.fileName !== undefined) row.file_name = fields.fileName;
  if (fields.content !== undefined) row.content = fields.content;
  const { error } = await table().update(row).eq("user_id", userId).eq("id", id);
  if (error) {
    throw new Error(`Could not update the template: ${error.message}`);
  }
}

/** Delete a template. */
export async function deleteTemplate(userId: string, id: string): Promise<void> {
  const { error } = await table().delete().eq("user_id", userId).eq("id", id);
  if (error) {
    throw new Error(`Could not delete the template: ${error.message}`);
  }
}
