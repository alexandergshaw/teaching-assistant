// VIDEO-GRADING W2 (docs/video-grading-chat-intake-ops.md section 3): the
// client half of the LOOSE video transport, plus the path contract both
// routes share. A video can never ride the request body (a 32MB video is
// ~12x the wire budget), so it goes straight to the private bucket and the
// server is handed only a Storage path.
//
// Plain, dependency-light leaf (client-safe, no server import) so every
// decision is testable under vitest. There is NO client-supplied URL anywhere:
// the browser sends a Storage path, the server validates it with
// isVideoUploadPath and mints anything else itself (SSRF-free by construction).
import { SYLLABUS_UPLOAD_BUCKET, isKnownUploadPath, syllabusUploadStoragePath } from "@/lib/syllabus-upload-source";
import { formatMB } from "@/lib/upload-budget";
import { VIDEO_EXTENSIONS } from "./constants";
import type { GradingZipStorage } from "./grading-zip-transport";
import type { VideoFailureClass } from "./video-failure";
import { VIDEO_MAX_BYTES, VIDEO_MAX_PENDING_STAGED } from "./video-limits";

const GRADING_SEGMENT = "grading-uploads";

/**
 * The CLOSED map from a lowercased filename extension to the contentType the
 * object is stored under. The Storage contentType (like File.type) is never
 * trusted as evidence of the container: the bytes decide (video-magic.ts).
 */
const VIDEO_STORAGE_CONTENT_TYPE: Readonly<Record<string, string>> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

// crypto.randomUUID() is a v4 UUID, lowercase. Extension alternatives are
// lowercase only.
const VIDEO_OBJECT_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(mp4|webm|mov|m4v)$/;

/** Lowercased extension of a file name, without the dot ("" when none). */
export function videoExtensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).trim().toLowerCase() : "";
}

/** True for a name whose extension is an accepted video container. */
export function hasVideoExtension(name: string): boolean {
  return VIDEO_EXTENSIONS.has(videoExtensionOf(name));
}

/**
 * Whether `storagePath` is a loose-video object THIS feature could have
 * written for `userId`: EXACTLY three segments, `[0] === userId`,
 * `[1] === "grading-uploads"`, `[2]` a lowercase v4 UUID plus a closed video
 * extension. Layered on isKnownUploadPath (which already rejects empty, ".",
 * "..", backslash and percent-encoded separator segments); the path is never
 * built from a client file name.
 */
export function isVideoUploadPath(userId: string, storagePath: string): boolean {
  if (typeof storagePath !== "string" || !isKnownUploadPath(userId, storagePath)) return false;
  const segments = storagePath.split("/");
  if (segments.length !== 3) return false;
  if (segments[1] !== GRADING_SEGMENT) return false;
  return VIDEO_OBJECT_NAME.test(segments[2]);
}

/** The ONLY builder of a video object path (client upload and server staging). */
export function videoStoragePath(userId: string, uploadId: string, extension: string): string {
  return syllabusUploadStoragePath(userId, uploadId, extension, GRADING_SEGMENT);
}

/** The contentType for a video extension, or null when it is not in the closed map. */
export function videoContentTypeFor(extension: string): string | null {
  return VIDEO_STORAGE_CONTENT_TYPE[extension.toLowerCase()] ?? null;
}

export interface VideoRefusal {
  readonly kind: "refused";
  readonly failure: VideoFailureClass;
  readonly message: string;
}

export type VideoTransport = { readonly kind: "not-video" } | { readonly kind: "storage" } | VideoRefusal;

export const VIDEO_NOT_ENABLED_MESSAGE = "Video grading is not available here yet, so nothing was uploaded.";

/**
 * Picks the transport for one picked file, consulted BEFORE the zip/body
 * preflight (whose "split the archive" wording is wrong for a video). In order:
 * not a video extension -> `not-video` (caller proceeds as today); disabled ->
 * refused `not supported here`; empty -> `unsupported format`; over
 * VIDEO_MAX_BYTES -> `too large`; pending staged videos at the cap ->
 * `too many videos`; else `storage`. A refusal uploads nothing.
 */
export function decideVideoTransport(
  file: { readonly name: string; readonly size: number },
  pendingStaged: number,
  enabled: boolean
): VideoTransport {
  if (!hasVideoExtension(file.name)) return { kind: "not-video" };
  if (!enabled) {
    return { kind: "refused", failure: "not supported here", message: VIDEO_NOT_ENABLED_MESSAGE };
  }
  if (file.size <= 0) {
    return { kind: "refused", failure: "unsupported format", message: `"${file.name}" is empty, so nothing was uploaded.` };
  }
  if (file.size > VIDEO_MAX_BYTES) {
    return {
      kind: "refused",
      failure: "too large",
      message:
        `This video is ${formatMB(file.size)}, over the ${formatMB(VIDEO_MAX_BYTES)} limit. ` +
        "Nothing was uploaded. Trim or compress it, then try again.",
    };
  }
  if (pendingStaged >= VIDEO_MAX_PENDING_STAGED) {
    return {
      kind: "refused",
      failure: "too many videos",
      message: `Up to ${VIDEO_MAX_PENDING_STAGED} videos can wait to be graded at once. Let some finish, then add more.`,
    };
  }
  return { kind: "storage" };
}

export type GradingVideoUploadResult =
  | { readonly ok: true; readonly storagePath: string }
  | { readonly ok: false; readonly failure: VideoFailureClass; readonly message: string };

/**
 * Uploads the video straight to the private bucket, sibling of uploadGradingZip.
 * Path via videoStoragePath only; the extension is looked up in the closed map
 * and contentType comes from that map, never from `file.type`. `upsert: false`.
 */
export async function uploadGradingVideo(
  storage: GradingZipStorage,
  userId: string,
  file: File,
  uploadId: string = crypto.randomUUID()
): Promise<GradingVideoUploadResult> {
  const extension = videoExtensionOf(file.name);
  const contentType = videoContentTypeFor(extension);
  if (!contentType) {
    return { ok: false, failure: "unsupported format", message: `"${file.name}" is not a supported video type.` };
  }
  const storagePath = videoStoragePath(userId, uploadId, extension);
  const failed: GradingVideoUploadResult = {
    ok: false,
    failure: "upload failed",
    message: `Could not upload "${file.name}" - try again.`,
  };
  try {
    const { error } = await storage.from(SYLLABUS_UPLOAD_BUCKET).upload(storagePath, file, { contentType, upsert: false });
    if (error) return failed;
  } catch {
    return failed;
  }
  return { ok: true, storagePath };
}
