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

export async function uploadCourseFile(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string,
  blob: Blob,
  ext: string,
  contentType: string,
  previousPath?: string | null
): Promise<{ path: string }> {
  // Best-effort remove of previous file if it exists
  if (previousPath) {
    await supabase.storage
      .from("course-files")
      .remove([previousPath])
      .catch(() => {});
  }

  const path = `${userId}/${courseId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("course-files")
    .upload(path, blob, { contentType, upsert: false });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  return { path };
}

export async function uploadCourseZip(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string,
  blob: Blob,
  previousPath?: string | null
): Promise<{ path: string }> {
  return uploadCourseFile(supabase, userId, courseId, blob, "zip", "application/zip", previousPath);
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
  // supabase-js's storage client USUALLY does not throw on a network-level
  // failure (DNS, CORS, connection reset) - it CATCHES that internally and
  // returns it as a normal `error` value, same as an HTTP-level failure.
  // Either way `error.message` can be as bare as the browser's own "Failed
  // to fetch", so this names the object path it was signing a URL FOR before
  // rethrowing - without that, the caller only ever learns that SOMETHING,
  // somewhere, failed to fetch (the exact defect run 556b49f0 exposed: the
  // run log's only clue was the literal string "Failed to fetch").
  //
  // AC4 (run 6729e3f5): "usually" is the catch - the `error`-value branch
  // below only fires when createSignedUrl RETURNS a failure. When the client
  // THROWS instead (a rejected promise, not a resolved `{data, error}`), that
  // exception previously had no try/catch around this await at all and
  // escaped completely unwrapped - a bare "Failed to fetch" with no
  // indication which object path was being signed, and neither this
  // function's own error branch nor downloadCourseZipBlob's fetch() guard
  // ever got a chance to add that context. This wraps the call itself so
  // BOTH failure shapes - a returned `error` and a thrown rejection - are
  // named identically. The underlying cause of the throw in the user's
  // environment is still unknown; this only closes the diagnostic gap.
  const { data, error } = await (async () => {
    try {
      return await supabase.storage.from("course-files").createSignedUrl(path, 3600);
    } catch (err) {
      const underlying = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not get a download link for "${path}": ${underlying}`);
    }
  })();

  if (error) {
    throw new Error(`Could not get a download link for "${path}": ${error.message}`);
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
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      // A raw fetch() rejection (TypeError: "Failed to fetch" in Chrome/
      // Firefox) carries zero context of its own - it fires before any
      // response, HTTP or otherwise, exists. Name the object path so this
      // reads as "could not download THIS part" rather than the bare
      // browser wording reaching the run log unexplained.
      const underlying = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not download "${p}": ${underlying}`);
    }
    if (!res.ok) {
      throw new Error(`Could not download "${p}" (HTTP ${res.status}).`);
    }
    // AC3 (real runs 556b49f0, 6729e3f5, 90415cd8): a network failure WHILE
    // streaming the response body (a connection dropped mid-download, after
    // headers already arrived and res.ok was already true) throws from
    // .blob() itself, not from the fetch() call above - the browser reports
    // this identically to a connection-establishment failure, the same bare
    // "Failed to fetch"/"NetworkError" wording, but this read was not
    // wrapped: it escaped with no indication of which object path was mid-
    // download. Defensive hardening alongside the AC3 fix above (a 16.2MB
    // single-part download, well under CHUNK_SIZE so never split, is
    // exactly the shape most exposed to a mid-stream drop).
    let blob: Blob;
    try {
      blob = await res.blob();
    } catch (err) {
      const underlying = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not download "${p}": ${underlying}`);
    }
    pieces.push(blob);
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
