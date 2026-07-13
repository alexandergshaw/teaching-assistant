// Client-side storage for per-course material zips; browser talks to Supabase
// Storage directly for direct uploads/downloads.
//
// Large files: Supabase enforces a project-wide per-object upload limit (50 MB
// by default), so blobs above CHUNK_SIZE are stored as numbered part objects
// (`<path>.partNN`) and reassembled on download. An entry's `parts` list holds
// the real object paths; its `path` stays the logical identifier.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

/** Per-object ceiling kept safely under the 50 MB project upload limit. */
const CHUNK_SIZE = 45 * 1024 * 1024;

export async function uploadCourseZip(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string,
  blob: Blob,
  previousPath?: string | null
): Promise<{ path: string }> {
  // Best-effort remove of previous file if it exists
  if (previousPath) {
    await supabase.storage
      .from("course-files")
      .remove([previousPath])
      .catch(() => {});
  }

  const path = `${userId}/${courseId}/${crypto.randomUUID()}.zip`;

  const { error: uploadError } = await supabase.storage
    .from("course-files")
    .upload(path, blob, { contentType: "application/zip", upsert: false });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  return { path };
}

/**
 * Upload a zip that may exceed the per-object storage limit. Small blobs are
 * stored as one object (parts: null); larger ones as `<path>.partNN` objects
 * where `path` itself is never created and only names the entry.
 */
export async function uploadCourseZipChunked(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string,
  blob: Blob
): Promise<{ path: string; parts: string[] | null }> {
  if (blob.size <= CHUNK_SIZE) {
    const { path } = await uploadCourseZip(supabase, userId, courseId, blob, null);
    return { path, parts: null };
  }

  const path = `${userId}/${courseId}/${crypto.randomUUID()}.zip`;
  const parts: string[] = [];
  try {
    for (let offset = 0, index = 0; offset < blob.size; offset += CHUNK_SIZE, index += 1) {
      const partPath = `${path}.part${String(index).padStart(2, "0")}`;
      const { error: uploadError } = await supabase.storage
        .from("course-files")
        .upload(partPath, blob.slice(offset, offset + CHUNK_SIZE), {
          contentType: "application/octet-stream",
          upsert: false,
        });
      if (uploadError) {
        throw new Error(uploadError.message);
      }
      parts.push(partPath);
    }
  } catch (err) {
    // Roll back any parts already stored so a failed upload leaves no orphans.
    await removeCourseZipObjects(supabase, parts);
    throw err;
  }

  return { path, parts };
}

export async function getCourseZipUrl(
  supabase: SupabaseClient<Database>,
  path: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("course-files")
    .createSignedUrl(path, 3600);

  if (error) {
    throw new Error(error.message);
  }

  return data.signedUrl;
}

/** Fetch a stored zip as one Blob, reassembling part objects when present. */
export async function downloadCourseZipBlob(
  supabase: SupabaseClient<Database>,
  file: { path: string; parts?: string[] | null }
): Promise<Blob> {
  const paths = file.parts && file.parts.length > 0 ? file.parts : [file.path];
  const pieces: Blob[] = [];
  for (const p of paths) {
    const url = await getCourseZipUrl(supabase, p);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Could not download the file (HTTP ${res.status}).`);
    }
    pieces.push(await res.blob());
  }
  return pieces.length === 1 ? pieces[0] : new Blob(pieces, { type: "application/zip" });
}

export async function removeCourseZip(
  supabase: SupabaseClient<Database>,
  path: string
): Promise<void> {
  await removeCourseZipObjects(supabase, [path]);
}

/** Best-effort removal of a set of storage objects (e.g. an entry's parts). */
export async function removeCourseZipObjects(
  supabase: SupabaseClient<Database>,
  paths: string[]
): Promise<void> {
  if (paths.length === 0) return;
  await supabase.storage
    .from("course-files")
    .remove(paths)
    .catch(() => {});
}

/** The storage object paths behind an export/material entry (parts or single). */
export function courseZipObjectPaths(file: { path: string; parts?: string[] | null }): string[] {
  return file.parts && file.parts.length > 0 ? file.parts : [file.path];
}
