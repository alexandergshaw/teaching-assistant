// LARGE-SINGLE-FILE W2: the browser-side seams of the grading chat's large
// single office/text file lane, as plain testable leaves (no component is ever
// rendered under vitest). Modelled on videoClient.ts.
//
//  - postPrepareSingleFile: the default `prepareSingleFile`, POST
//    /api/grade-submission-file with the staged path. The server downloads,
//    extracts the text and returns ONE text-only entry; the extractor never
//    reaches the client bundle (this file only uploads and POSTs a path).
//  - submitStoragedFile: the direct-to-Storage upload, then the driver's
//    `storaged-file` submit; a refused or thrown submit removes the staged
//    object best-effort (the server's delete and the orphan sweep are the real
//    guarantees).
//
// BROWSER-ONLY: it uploads through the browser Supabase storage client.
import type { StudentSubmissionEntry } from "@/lib/grade/types";
import {
  deleteGradingZipBestEffort,
  singleFileExtension,
  type GradingZipStorage,
  type GradingZipUploadResult,
} from "@/lib/grade/grading-zip-transport";
import { SYLLABUS_UPLOAD_BUCKET, syllabusUploadStoragePath } from "@/lib/syllabus-upload-source";
import type { ChatSubmissionInput } from "./chatSubmissionIntake";

export type PrepareSingleFileOutcome =
  | { readonly kind: "entry"; readonly entry: StudentSubmissionEntry }
  | { readonly kind: "refused"; readonly reason: string };

export type PrepareSingleFileFn = (
  storagePath: string,
  name: string,
  provider: string,
  label?: string
) => Promise<PrepareSingleFileOutcome>;

/** The default `prepareSingleFile`: POST /api/grade-submission-file. Never throws. */
export const postPrepareSingleFile: PrepareSingleFileFn = async (storagePath, name, provider, label) => {
  try {
    const res = await fetch("/api/grade-submission-file", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storagePath, name, provider, ...(label ? { label } : {}) }),
    });
    const body = (await res.json().catch(() => ({}))) as { entry?: StudentSubmissionEntry; error?: unknown };
    if (res.ok && body.entry) return { kind: "entry", entry: body.entry };
    const reason = typeof body.error === "string" && body.error.length > 0 ? body.error : "This file could not be prepared.";
    return { kind: "refused", reason };
  } catch {
    return { kind: "refused", reason: "This file could not be prepared." };
  }
};

/**
 * Uploads one large office/text file straight to the private bucket at
 * `${userId}/grading-uploads/<uuid>.<ext>` (path built only by
 * syllabusUploadStoragePath; the user id is the first segment the bucket's RLS
 * requires). The extension is the file's own, which the route re-checks.
 */
export async function uploadGradingSingleFile(
  storage: GradingZipStorage,
  userId: string,
  file: File,
  uploadId: string = crypto.randomUUID()
): Promise<GradingZipUploadResult> {
  const storagePath = syllabusUploadStoragePath(userId, uploadId, singleFileExtension(file.name), "grading-uploads");
  const failed: GradingZipUploadResult = { ok: false, message: `Could not upload "${file.name}" - try again.` };
  try {
    const { error } = await storage
      .from(SYLLABUS_UPLOAD_BUCKET)
      .upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (error) return failed;
  } catch {
    return failed;
  }
  return { ok: true, storagePath };
}

type DriverSubmit = (input: ChatSubmissionInput) => Promise<
  { readonly kind: "accepted"; readonly entryCount: number } | { readonly kind: "refused"; readonly reason: string } | { readonly kind: "partial"; readonly dispatchedCount: number; readonly refusedCount: number; readonly reason: string }
>;

export interface SubmitStoragedFileArgs {
  readonly file: File;
  readonly label?: string;
  readonly userId: string | null;
  readonly storage: GradingZipStorage;
  readonly submit: DriverSubmit;
  /** Called once the upload succeeded, before the prepare POST (UI phase). */
  readonly onUploaded?: () => void;
  /** Injected for tests; default is the real upload. */
  readonly upload?: (storage: GradingZipStorage, userId: string, file: File) => Promise<GradingZipUploadResult>;
  readonly remove?: (storage: GradingZipStorage, storagePath: string) => Promise<void>;
}

export async function submitStoragedFile(args: SubmitStoragedFileArgs): Promise<Awaited<ReturnType<DriverSubmit>>> {
  if (!args.userId) return { kind: "refused", reason: "You must be signed in to upload a file." };
  const upload = args.upload ?? uploadGradingSingleFile;
  const remove = args.remove ?? deleteGradingZipBestEffort;
  const uploaded = await upload(args.storage, args.userId, args.file);
  if (!uploaded.ok) return { kind: "refused", reason: uploaded.message };
  args.onUploaded?.();
  try {
    const outcome = await args.submit({ kind: "storaged-file", storagePath: uploaded.storagePath, name: args.file.name, label: args.label });
    if (outcome.kind === "refused") await remove(args.storage, uploaded.storagePath);
    return outcome;
  } catch (err) {
    await remove(args.storage, uploaded.storagePath);
    throw err;
  }
}
