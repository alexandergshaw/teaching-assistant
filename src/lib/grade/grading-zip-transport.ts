// BULK-ZIP BW1 (docs/bulk-zip-grading-scope.md section 2): the client half of
// the Storage transport for a class submissions zip too large for the request
// body. Plain, dependency-light leaf so the decisions are testable under
// vitest (no component is rendered there) and importable from a client
// component.
//
// The object lives at `${userId}/grading-uploads/<uuid>.zip`, built ONLY via
// syllabusUploadStoragePath - never hand-written. BW2's streaming ingest reads,
// parses and deletes it; until then nothing consumes the object, which is why
// the transport is gated by GRADING_ZIP_STORAGE_INGEST_ENABLED.

import { SYLLABUS_UPLOAD_BUCKET, syllabusUploadStoragePath } from "@/lib/syllabus-upload-source";
import { checkFileWireBudget, formatMB } from "@/lib/upload-budget";

/**
 * Whether the server-side streaming ingest (BW2) exists. While false a large
 * zip keeps today's worded refusal instead of uploading an object nothing can
 * grade. BW2 flips this in the same wave that adds the driver's "storaged-zip"
 * submit path.
 */
export const GRADING_ZIP_STORAGE_INGEST_ENABLED = false;

/** Pre-flight ceiling for the stored zip (scope section 2; the syllabus
 * precedent, syllabus-upload-validation.ts MAX_FILE_SIZE). BW2 re-checks the
 * stored object's real size server-side. */
export const GRADING_ZIP_MAX_BYTES = 25 * 1024 * 1024;

export type ZipTransport =
  | { readonly kind: "body" }
  | { readonly kind: "storage" }
  | { readonly kind: "refused"; readonly message: string };

export function isZipFileName(name: string): boolean {
  return name.trim().toLowerCase().endsWith(".zip");
}

/**
 * Picks the transport for one picked file. Anything that is not a zip, and any
 * zip within the wire budget, keeps the body path. A zip over the wire budget
 * goes to Storage when the ingest exists and is under the ceiling; otherwise it
 * is `body` (so the caller's existing preflight produces its refusal) when the
 * ingest is not enabled, or refused with a worded reason when over the ceiling.
 */
export function chooseZipTransport(
  file: { readonly name: string; readonly size: number },
  ingestEnabled: boolean = GRADING_ZIP_STORAGE_INGEST_ENABLED
): ZipTransport {
  if (!isZipFileName(file.name)) return { kind: "body" };
  if (checkFileWireBudget(file.size, "This file").ok) return { kind: "body" };
  if (!ingestEnabled) return { kind: "body" };
  if (file.size > GRADING_ZIP_MAX_BYTES) {
    return {
      kind: "refused",
      message:
        `This zip is ${formatMB(file.size)}, over the ${formatMB(GRADING_ZIP_MAX_BYTES)} limit. ` +
        "Nothing was uploaded. Split the archive into parts, then try again.",
    };
  }
  return { kind: "storage" };
}

/** The narrow slice of a Supabase Storage bucket client this leaf uses. */
export interface GradingZipBucket {
  upload(
    path: string,
    body: File,
    options: { contentType?: string; upsert: boolean }
  ): Promise<{ error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
}

export interface GradingZipStorage {
  from(bucket: string): GradingZipBucket;
}

export type GradingZipUploadResult =
  | { readonly ok: true; readonly storagePath: string }
  | { readonly ok: false; readonly message: string };

/**
 * Uploads the zip straight to the private bucket. The path is built only by
 * syllabusUploadStoragePath with the "grading-uploads" segment; the user id is
 * its first segment, which the bucket's RLS requires.
 */
export async function uploadGradingZip(
  storage: GradingZipStorage,
  userId: string,
  file: File,
  uploadId: string = crypto.randomUUID()
): Promise<GradingZipUploadResult> {
  const storagePath = syllabusUploadStoragePath(userId, uploadId, ".zip", "grading-uploads");
  try {
    const { error } = await storage
      .from(SYLLABUS_UPLOAD_BUCKET)
      .upload(storagePath, file, { contentType: file.type || "application/zip", upsert: false });
    if (error) return { ok: false, message: `Could not upload "${file.name}" - try again.` };
  } catch {
    return { ok: false, message: `Could not upload "${file.name}" - try again.` };
  }
  return { ok: true, storagePath };
}

/**
 * Best-effort client courtesy (R10): removes the temp object when the ingest
 * call rejects. Never throws; the server's delete-on-every-path and the
 * scheduled orphan sweep remain the real guarantees.
 */
export async function deleteGradingZipBestEffort(storage: GradingZipStorage, storagePath: string): Promise<void> {
  try {
    await storage.from(SYLLABUS_UPLOAD_BUCKET).remove([storagePath]);
  } catch {
    // swallowed by design
  }
}
