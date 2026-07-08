// Persistence for the owner's library of finalized course syllabi. Each row is
// a completed Word .docx (base64) plus a name and optional course code. Reads/
// writes go through the Supabase service-role client behind requireOwner()
// (mirrors src/lib/supabase/syllabus-templates.ts); every query is explicitly
// scoped to the owning user_id.

import { createServiceClient } from "./server";
import type { Database } from "./types";

type SyllabiTable = Database["public"]["Tables"]["course_syllabi"];

/** A finalized syllabus without its (potentially large) base64 body. */
export interface FinalizedSyllabusMeta {
  id: string;
  name: string;
  fileName: string;
  courseCode: string | null;
  updatedAt: string;
}

/** A finalized syllabus including its base64 .docx content. */
export interface FinalizedSyllabus extends FinalizedSyllabusMeta {
  content: string;
}

function table() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (createServiceClient() as any).from("course_syllabi");
}

/** List the owner's finalized syllabi (metadata only), newest first. */
export async function listSyllabi(userId: string): Promise<FinalizedSyllabusMeta[]> {
  const { data, error } = await table()
    .select("id, name, file_name, course_code, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("[course-syllabi] Could not list syllabi:", error.message);
    return [];
  }
  const rows = (data ?? []) as Array<{ id: string; name: string; file_name: string; course_code: string | null; updated_at: string }>;
  return rows.map((r) => ({ id: r.id, name: r.name, fileName: r.file_name, courseCode: r.course_code, updatedAt: r.updated_at }));
}

/** Fetch one finalized syllabus including its base64 content, or null. */
export async function getSyllabus(userId: string, id: string): Promise<FinalizedSyllabus | null> {
  const { data, error } = await table()
    .select("id, name, file_name, course_code, content, updated_at")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[course-syllabi] Could not read syllabus:", error.message);
    return null;
  }
  if (!data) return null;
  const r = data as { id: string; name: string; file_name: string; course_code: string | null; content: string; updated_at: string };
  return { id: r.id, name: r.name, fileName: r.file_name, courseCode: r.course_code, content: r.content, updatedAt: r.updated_at };
}

/** Save a finalized syllabus. Returns its metadata. */
export async function createSyllabus(
  userId: string,
  name: string,
  fileName: string,
  content: string,
  courseCode?: string
): Promise<FinalizedSyllabusMeta> {
  const row: SyllabiTable["Insert"] = {
    user_id: userId,
    name,
    file_name: fileName,
    course_code: courseCode ?? null,
    content,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await table().insert(row).select("id, name, file_name, course_code, updated_at").single();
  if (error) {
    throw new Error(`Could not save the syllabus: ${error.message}`);
  }
  const r = data as { id: string; name: string; file_name: string; course_code: string | null; updated_at: string };
  return { id: r.id, name: r.name, fileName: r.file_name, courseCode: r.course_code, updatedAt: r.updated_at };
}

/** Rename a finalized syllabus. */
export async function renameSyllabus(userId: string, id: string, name: string): Promise<void> {
  const row: SyllabiTable["Update"] = { name, updated_at: new Date().toISOString() };
  const { error } = await table().update(row).eq("user_id", userId).eq("id", id);
  if (error) {
    throw new Error(`Could not rename the syllabus: ${error.message}`);
  }
}

/** Delete a finalized syllabus. */
export async function deleteSyllabus(userId: string, id: string): Promise<void> {
  const { error } = await table().delete().eq("user_id", userId).eq("id", id);
  if (error) {
    throw new Error(`Could not delete the syllabus: ${error.message}`);
  }
}
