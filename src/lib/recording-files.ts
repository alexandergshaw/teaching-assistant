// Client-side persistence for Recording-tab videos; browser talks to Supabase
// Storage directly because recordings are far larger than a server action
// body allows.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

export interface RecordingFile {
  id: string;
  name: string;
  kind: "recording" | "captioned" | "narrated" | "bundle" | "file" | "sample" | "avatar";
  mimeType: string;
  sizeBytes: number;
  durationSec: number | null;
  storagePath: string;
  source: string | null;
  origin: string | null;
  workflowName: string | null;
  workflowId: string | null;
  workflowRunId: string | null;
  createdAt: string;
}

export function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("gif")) return "gif";
  if (m.includes("svg")) return "svg";
  if (m.includes("mpeg") && m.startsWith("audio/")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("csv")) return "csv";
  if (m.includes("json")) return "json";
  if (m.includes("plain")) return "txt";
  if (m.includes("markdown")) return "md";
  if (m.includes("wordprocessingml")) return "docx";
  if (m.includes("presentationml")) return "pptx";
  if (m.includes("spreadsheetml")) return "xlsx";
  if (m.includes("html")) return "html";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("quicktime")) return "mov";
  if (m.includes("matroska")) return "mkv";
  if (m.includes("zip")) return "zip";
  return "webm";
}

export function extForFile(file: RecordingFile): string {
  const lastSegment = file.storagePath.split("/").pop() || "";
  const dotIdx = lastSegment.lastIndexOf(".");
  if (dotIdx > 0) {
    return lastSegment.slice(dotIdx + 1);
  }
  return extForMime(file.mimeType);
}

export function stripMatchingExt(name: string, ext: string): string {
  if (!ext || !name) {
    return name;
  }
  const suffix = `.${ext.toLowerCase()}`;
  if (name.toLowerCase().endsWith(suffix)) {
    return name.slice(0, -suffix.length);
  }
  return name;
}

export async function saveRecordingFile(
  supabase: SupabaseClient<Database>,
  userId: string,
  blob: Blob,
  meta: { name: string; kind: "recording" | "captioned" | "narrated" | "bundle" | "file" | "sample" | "avatar"; mimeType: string; durationSec: number | null; fileExt?: string; source?: string | null; origin?: string | null; workflowName?: string | null; workflowId?: string | null; workflowRunId?: string | null }
): Promise<RecordingFile> {
  const id = crypto.randomUUID();
  let ext = meta.fileExt;
  if (ext) {
    ext = ext.toLowerCase().replace(/^\./, "");
  } else {
    ext = extForMime(meta.mimeType);
  }
  const path = `${userId}/${id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("recordings")
    .upload(path, blob, { contentType: meta.mimeType, upsert: false });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const normalizedName = stripMatchingExt(meta.name, ext);

  const { data: row, error: insertError } = await (supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("recording_files") as any)
    .insert({
      id,
      user_id: userId,
      name: normalizedName,
      kind: meta.kind,
      mime_type: meta.mimeType,
      size_bytes: blob.size,
      duration_sec: meta.durationSec,
      storage_path: path,
      source: meta.source ?? null,
      origin: meta.origin ?? null,
      workflow_name: meta.workflowName ?? null,
      workflow_id: meta.workflowId ?? null,
      workflow_run_id: meta.workflowRunId ?? null,
    })
    .select()
    .single();

  if (insertError) {
    // Best effort: attempt to remove the uploaded object
    await supabase.storage.from("recordings").remove([path]).catch(() => {});
    throw new Error(insertError.message);
  }

  return mapRecordingFile(row);
}

export async function listRecordingFiles(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<RecordingFile[]> {
  const { data: rows, error } = await supabase
    .from("recording_files")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (rows || []).map(mapRecordingFile);
}

/**
 * All recording_files rows attached to any of the given workflow runs, one
 * query via `.in("workflow_run_id", runIds)` rather than one query per run -
 * this is what makes listing "recent runs + their artifacts" cheap for a
 * table of several runs at once. Scoped to the owner. An empty `runIds`
 * short-circuits to [] without a query (an empty `.in()` filter is either a
 * PostgREST error or a vacuous no-match, depending on client version - never
 * worth relying on).
 */
export async function listRecordingFilesForRuns(
  supabase: SupabaseClient<Database>,
  userId: string,
  runIds: string[]
): Promise<RecordingFile[]> {
  if (runIds.length === 0) return [];

  const { data: rows, error } = await supabase
    .from("recording_files")
    .select("*")
    .eq("user_id", userId)
    .in("workflow_run_id", runIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (rows || []).map(mapRecordingFile);
}

/** Fetch one recording_files row by id, scoped to its owner; null if missing
 * or not owned by this user - mirrors getRun in workflow-runs.ts so a
 * missing/foreign id can never leak another user's file. */
export async function getRecordingFileById(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<RecordingFile | null> {
  const { data: row, error } = await supabase
    .from("recording_files")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!row) return null;

  return mapRecordingFile(row);
}

export async function renameRecordingFile(
  supabase: SupabaseClient<Database>,
  id: string,
  name: string
): Promise<void> {
  const { error } = await (supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("recording_files") as any)
    .update({
      name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteRecordingFile(
  supabase: SupabaseClient<Database>,
  file: RecordingFile
): Promise<void> {
  // Remove storage object first (ignore "not found" style errors)
  await supabase.storage
    .from("recordings")
    .remove([file.storagePath])
    .catch(() => {});

  // Delete row
  const { error } = await supabase.from("recording_files").delete().eq("id", file.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getRecordingFileUrl(
  supabase: SupabaseClient<Database>,
  file: RecordingFile,
  expiresInSeconds = 3600
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("recordings")
    .createSignedUrl(file.storagePath, expiresInSeconds);

  if (error) {
    throw new Error(error.message);
  }

  return data.signedUrl;
}

export async function downloadRecordingFile(
  supabase: SupabaseClient<Database>,
  file: RecordingFile
): Promise<Blob> {
  const { data, error } = await supabase.storage
    .from("recordings")
    .download(file.storagePath);

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function mapRecordingFile(row: Database["public"]["Tables"]["recording_files"]["Row"]): RecordingFile {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    durationSec: row.duration_sec,
    storagePath: row.storage_path,
    source: row.source,
    origin: row.origin,
    workflowName: row.workflow_name,
    workflowId: row.workflow_id,
    workflowRunId: row.workflow_run_id,
    createdAt: row.created_at,
  };
}
