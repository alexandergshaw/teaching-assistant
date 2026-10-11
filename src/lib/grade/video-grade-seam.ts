// VIDEO-GRADING W3 (docs/video-grading-chat-intake-ops.md section 7.2): the
// grade-time half of the model seam. Everything here runs inside ONE student's
// /api/grade-run-item request. Pure of Next and Supabase imports: Storage and
// the Files client arrive as injected deps, so the whole lifecycle (and the
// bytes-reach chain test, ops 10.2) runs against fakes with no network.
//
// Order per video (ops 7.2): ownership check of the path (T11) -> download ->
// size re-check -> magic-byte sniff (THE trust boundary: the client entry and
// the stored object are both untrusted) -> Files upload bracket -> grade ->
// delete. Storage objects are deleted on success and on TERMINAL failures and
// KEPT on transient ones so a row retry can succeed.
import { withUploadedGeminiVideo, VIDEO_DISPLAY_NAME_PREFIX, GeminiFilesError, type GeminiFilesClient } from "../gemini-files";
import type { GradeAttachment } from "./engine";
import type { StudentSubmissionEntry, SubmittedFileInfo, VideoRef } from "./types";
import type { VideoFailureClass } from "./video-failure";
import { VIDEO_MAX_BYTES } from "./video-limits";
import { VIDEO_HEAD_BYTES, sniffVideoContainer } from "./video-magic";
import { isVideoUploadPath, videoExtensionOf } from "./video-transport";

/** What the seam needs from Storage: a Blob-like handle, or null when absent. */
export interface VideoBlobLike {
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface VideoSeamDeps {
  readonly download: (storagePath: string) => Promise<VideoBlobLike | null>;
  readonly removeObjects: (storagePaths: string[]) => Promise<void>;
  readonly filesClient: GeminiFilesClient;
  readonly newUploadId?: () => string;
}

export interface VideoSeamContext {
  readonly userId: string;
  /** Absolute epoch-ms by which download + upload + ACTIVE must be done. */
  readonly uploadDeadlineMs: number;
  /** Aborted by the route at its own deadline; makes the finally-delete fire. */
  readonly signal?: AbortSignal;
}

export type VideoSeamOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: VideoFailureClass; readonly message: string };

type VideoFile = SubmittedFileInfo & { videoRef: VideoRef };

/** The entry's files that carry a videoRef (the grade-time work list). */
export function videoFilesOf(entry: StudentSubmissionEntry): VideoFile[] {
  return entry.submittedFiles.filter((f): f is VideoFile => f.videoRef !== undefined);
}

/**
 * T11: every videoRef path must be inside the CALLER's own grading-uploads
 * namespace with the video-object shape. The W2 guard only checked the ref's
 * structure; a client could otherwise name another user's object.
 */
export function videoRefsOwnedBy(userId: string, entry: StudentSubmissionEntry): boolean {
  return videoFilesOf(entry).every((f) => isVideoUploadPath(userId, f.videoRef.storagePath));
}

const MESSAGES: Record<VideoFailureClass, string> = {
  "too large": "A video in this submission is too large to grade, so it was not graded.",
  "too many videos": "This submission has too many videos to grade, so it was not graded.",
  "unsupported format": "A video in this submission could not be read as an mp4, webm or mov file, so it was not graded.",
  "upload failed": "A video in this submission could not be prepared for grading, so it was not graded.",
  "extraction failed": "A video in this submission could not be read, so it was not graded.",
  "model rejected": "The grader could not use a video in this submission, so it was not graded.",
  "timed out": "A video in this submission did not finish preparing in time, so it was not graded.",
  "not supported here": "Videos cannot be graded here, so it was not graded.",
};

/** Failures where the Storage object can never succeed on retry. */
const TERMINAL: ReadonlySet<VideoFailureClass> = new Set<VideoFailureClass>(["too large", "unsupported format"]);

class SeamFailure extends Error {
  readonly failure: VideoFailureClass;
  constructor(failure: VideoFailureClass) {
    super(MESSAGES[failure]);
    this.name = "SeamFailure";
    this.failure = failure;
  }
}

function classify(err: unknown): VideoFailureClass {
  if (err instanceof SeamFailure) return err.failure;
  if (err instanceof GeminiFilesError) return err.failure;
  return "model rejected";
}

/**
 * Resolves every video of the entry to a Files API attachment, runs `consume`
 * with them, then cleans up. Never throws: a failure is a typed outcome.
 * `keepObjects(value)` lets the caller keep the Storage objects for a retry
 * when the grade itself came back as a failed row.
 */
export async function withEntryVideos<T>(
  deps: VideoSeamDeps,
  ctx: VideoSeamContext,
  entry: StudentSubmissionEntry,
  consume: (attachments: GradeAttachment[]) => Promise<T>,
  keepObjects: (value: T) => boolean = () => false
): Promise<VideoSeamOutcome<T>> {
  const files = videoFilesOf(entry);
  const allPaths = files.map((f) => f.videoRef.storagePath);
  const uploadId = deps.newUploadId ?? (() => crypto.randomUUID());
  let terminalPath: string | null = null;

  const step = async (index: number, acc: GradeAttachment[]): Promise<T> => {
    if (index >= files.length) return consume(acc);
    const file = files[index];
    const path = file.videoRef.storagePath;
    // Re-validated here as well as by the route: this is the consuming edge.
    if (!isVideoUploadPath(ctx.userId, path)) throw new SeamFailure("not supported here");

    const blob = await deps.download(path);
    if (!blob) throw new SeamFailure("upload failed");
    if (blob.size > VIDEO_MAX_BYTES) {
      terminalPath = path;
      throw new SeamFailure("too large");
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const sniff = sniffVideoContainer(bytes.subarray(0, VIDEO_HEAD_BYTES), videoExtensionOf(path));
    if (!sniff.ok) {
      terminalPath = path;
      throw new SeamFailure("unsupported format");
    }
    const mimeType = sniff.mimeType;
    // Handed over exactly once, so a nested bracket does not pin the buffer
    // while the (long) model call runs.
    let held: Uint8Array | null = bytes;
    return withUploadedGeminiVideo(
      deps.filesClient,
      {
        readBytes: async () => {
          const out = held ?? new Uint8Array(0);
          held = null;
          return out;
        },
        mimeType,
        displayName: `${VIDEO_DISPLAY_NAME_PREFIX}${uploadId()}`,
        deadlineMs: ctx.uploadDeadlineMs,
        signal: ctx.signal,
      },
      (video) => step(index + 1, [...acc, { name: file.name, fileUri: video.fileUri, mimeType: video.mimeType }])
    );
  };

  const remove = async (paths: string[]): Promise<void> => {
    if (paths.length === 0) return;
    try {
      await deps.removeObjects(paths);
    } catch {
      // best effort; the orphan sweep is the backstop
    }
  };

  try {
    const value = await step(0, []);
    if (!keepObjects(value)) await remove(allPaths);
    return { ok: true, value };
  } catch (err) {
    const failure = classify(err);
    if (TERMINAL.has(failure)) await remove(terminalPath ? [terminalPath] : []);
    return { ok: false, failure, message: MESSAGES[failure] };
  }
}
