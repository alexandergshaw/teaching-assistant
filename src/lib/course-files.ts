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

// downloadCourseZipBlob retry policy (mitigation for the recurring, still-
// unexplained "Failed to fetch" download failures logged in runs 556b49f0,
// 6729e3f5, 90415cd8 and 756544e0 - see that function's own doc comment for
// what has and has not been ruled out). A bare fetch() rejection at
// connection-establishment, or a 5xx response, is exactly the transient-
// network shape a retry is safe to paper over: this is a GET of an immutable
// storage object, so re-issuing it changes nothing about correctness. A 4xx
// is a permanent verdict on the request as sent (a 404 will never become a
// 200) so it is never retried - retrying it would only delay an unavoidable
// failure. 3 total attempts (1 + 2 retries) with a 400ms/800ms exponential
// backoff caps the worst-case added latency per part at ~1.2s of sleep plus
// two extra round trips - small next to a workflow step's own budget, but
// enough to survive a one-off blip. Each attempt re-signs the URL from
// scratch (see the loop below) rather than reusing the one from a failed
// attempt, since the existing signed URL itself is one of the unruled-out
// suspects.
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 5xx is treated as transient-server and retried; 4xx is a permanent
 * verdict on the request and is never retried. */
function isRetryableStatus(status: number): boolean {
  return status >= 500;
}

/** Formats the object identity + whatever instrumentation is known (part
 * position, original file size) into a fragment shared by every download
 * error below - the context a bare "Failed to fetch" never carried in any
 * of the prior undiagnosed runs. */
function describeDownloadTarget(
  p: string,
  isPartsFile: boolean,
  index: number,
  total: number,
  size?: number
): string {
  const partSuffix = isPartsFile ? ` (part ${index + 1}/${total})` : "";
  const sizeSuffix = typeof size === "number" ? ` [size ${size} bytes]` : "";
  return `"${p}"${partSuffix}${sizeSuffix}`;
}

function attemptWord(n: number): string {
  return `${n} attempt${n === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// RULING 127: the shared "course-files" bucket object-path validator.
//
// Root cause (docs/service-role-predicate-audit.md Findings 1-3): this
// bucket's RLS policy contains an object to its owner by checking ONLY that
// the first path segment equals the caller's uid
// (supabase/migrations/20260722000000_course_materials.sql:31-33,
// `(storage.foldername(name))[1] = auth.uid()::text`). A service-role client
// bypasses that policy entirely, so every write/persist site and every
// removal sink that hands a caller-supplied path to a SERVICE-ROLE storage
// call must re-enforce the same prefix itself - nothing else does.
//
// This is used at every point this bucket's object path is persisted or
// acted on: src/lib/supabase/course-task-attachments.ts's
// createTaskAttachmentRow (write) and taskAttachmentStorageSweep.remove
// (delete sink); the four append*File actions in
// src/app/actions/course-hub-core.ts (write, both `path` and every entry of
// `parts`); src/lib/workflows/zip-run-log-completion.ts's read of an
// already-recorded entry and its removal of a replaced object.
//
// Refuses rather than sanitises (RULING 127): a caller that fails this check
// gets an outright rejection, never a rewritten "safe" path - rewriting would
// hide the same bug or attack a refusal makes visible.
//
// Checked, not just "starts with the prefix" (the mistake this audit found in
// this bucket's sibling module, src/lib/institution-page-attachments.ts's
// isInstitutionAttachmentStoragePath - see that function's own module for the
// docs/service-role-predicate-audit.md RES-C hole `"<me>/<page>/../../<victim>/x"`
// exploits: `startsWith(`${userId}/${pageId}/`)` alone does not reject a `..`
// segment that walks back out of that prefix. This validator is stricter:
// - the FIRST segment must EQUAL userId exactly, never merely start with it
//   (so "user-12" can never satisfy a check meant for "user-1");
// - there must be at least one segment after it (a bare "user-1" or
//   "user-1/" names no object);
// - no segment may be empty (rejects a leading/trailing/doubled "/", and
//   therefore any absolute-looking path, since splitting a leading "/"
//   yields an empty first segment);
// - no segment may be "." or ".." (rejects a traversal attempt outright,
//   independent of whatever Supabase Storage itself does with one - see
//   RES-C: this repo cannot observe that against a live bucket, so the
//   defensive half is added unconditionally);
// - no segment may contain a literal backslash, and no segment's
//   percent-decoding may introduce a "/", "\\", "." or ".." it did not
//   already spell out literally - closing the "encode the separator/dot to
//   slip past a literal-string check" class of bypass.
// ---------------------------------------------------------------------------

/** True if `segment` is (or, once percent-decoded, becomes) a path-traversal
 * or separator character sequence a naive literal-string check would miss -
 * see the validator's own doc comment above for the exact bypasses this
 * closes. Malformed percent-encoding (a `decodeURIComponent` throw) is
 * treated as suspicious and refused rather than guessed at. */
function isTraversalOrSeparatorSegment(segment: string): boolean {
  if (segment === "." || segment === "..") return true;
  if (segment.includes("\\")) return true;
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return true;
  }
  if (decoded === segment) return false;
  return decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\");
}

/**
 * Whether `storagePath` is an object path `userId` is allowed to write to or
 * act on in the "course-files" bucket: exactly `${userId}/<something>`, with
 * no empty, ".", ".." or separator-hiding segment anywhere in it. See the
 * module header above for why this exists and what it is stricter than.
 */
export function isOwnCourseFilesStoragePath(userId: string, storagePath: string): boolean {
  if (!userId || !storagePath) return false;
  const segments = storagePath.split("/");
  if (segments.length < 2) return false;
  if (segments[0] !== userId) return false;
  return segments.every((segment) => segment.length > 0 && !isTraversalOrSeparatorSegment(segment));
}

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

/**
 * Fetch a stored zip as one Blob, reassembling part objects when present.
 *
 * Retries a bare fetch()/stream rejection or a 5xx response up to
 * `opts.maxAttempts` times (default 3), re-signing the URL fresh on every
 * attempt - see the DEFAULT_MAX_ATTEMPTS block above for why those bounds
 * and why a 4xx is excluded. `opts` exists so tests can drive the loop
 * without real sleeps; production callers should omit it.
 *
 * IMPORTANT - what this does and does not prove: the root cause of the
 * underlying "Failed to fetch" (runs 556b49f0, 6729e3f5, 90415cd8, and most
 * recently 756544e0, where two of three structurally-identical downloads in
 * the SAME run failed and one succeeded) is still unknown. This retry is a
 * mitigation for a transient-network-shaped symptom, not a fix for whatever
 * causes it, and the enrichment below (size/parts/attempt) is instrumentation
 * so the NEXT occurrence - if the retries don't paper over it - finally
 * carries enough context to confirm or kill a cause (e.g. large-file/chunking
 * involvement) instead of reaching a run log as an unexplained bare string
 * for a fourth time.
 */
export async function downloadCourseZipBlob(
  supabase: SupabaseClient<Database>,
  file: { path: string; parts?: string[] | null; size?: number },
  opts?: { maxAttempts?: number; retryDelayMs?: number }
): Promise<Blob> {
  const paths = file.parts && file.parts.length > 0 ? file.parts : [file.path];
  const isPartsFile = paths.length > 1;
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const baseDelayMs = opts?.retryDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  const pieces: Blob[] = [];

  for (let index = 0; index < paths.length; index += 1) {
    const p = paths[index];
    const target = describeDownloadTarget(p, isPartsFile, index, paths.length, file.size);

    let attempt = 0;
    let piece: Blob | null = null;
    while (piece === null) {
      attempt += 1;
      // A fresh signed URL every attempt - the one from a failed attempt is
      // itself one of the unruled-out suspects, so it is never reused.
      const url = await getCourseZipUrl(supabase, p);

      let res: Response;
      try {
        res = await fetch(url);
      } catch (err) {
        // A raw fetch() rejection (TypeError: "Failed to fetch" in Chrome/
        // Firefox) carries zero context of its own - it fires before any
        // response, HTTP or otherwise, exists. This is the exact transient-
        // network shape the retry loop exists for.
        const underlying = err instanceof Error ? err.message : String(err);
        if (attempt < maxAttempts) {
          await sleep(baseDelayMs * 2 ** (attempt - 1));
          continue;
        }
        throw new Error(`Could not download ${target} after ${attemptWord(attempt)}: ${underlying}`);
      }

      if (!res.ok) {
        if (isRetryableStatus(res.status) && attempt < maxAttempts) {
          await sleep(baseDelayMs * 2 ** (attempt - 1));
          continue;
        }
        // A 4xx lands here on the first attempt (never retried - see
        // isRetryableStatus): a 404 will never become a 200, so retrying it
        // would only delay the same failure.
        throw new Error(`Could not download ${target} (HTTP ${res.status}) after ${attemptWord(attempt)}.`);
      }

      // AC3 (real runs 556b49f0, 6729e3f5, 90415cd8): a network failure WHILE
      // streaming the response body (a connection dropped mid-download, after
      // headers already arrived and res.ok was already true) throws from
      // .blob() itself, not from the fetch() call above - the browser reports
      // this identically to a connection-establishment failure, the same bare
      // "Failed to fetch"/"NetworkError" wording. Treated as the same
      // retryable shape as a fetch() rejection: a fresh attempt re-fetches
      // the whole part from scratch, which is safe for an immutable object.
      try {
        piece = await res.blob();
      } catch (err) {
        const underlying = err instanceof Error ? err.message : String(err);
        if (attempt < maxAttempts) {
          await sleep(baseDelayMs * 2 ** (attempt - 1));
          continue;
        }
        throw new Error(`Could not download ${target} after ${attemptWord(attempt)}: ${underlying}`);
      }
    }
    pieces.push(piece);
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
