// VIDEO-GRADING W1 (docs/video-grading-chat-intake-ops.md section 10.1): the
// defined, non-silent consumer every "video" upload kind lands on before the
// model seam exists. Pure leaf (wording + predicates), importable from server
// actions, extraction and the ingest wire protocol alike.
import { VIDEO_EXTENSIONS, VIDEO_MIME_TYPES } from "./constants";
import type { StudentSubmissionEntry, SubmittedFileInfo } from "./types";

/** One constant for the "received but not graded yet" disposition. */
export const VIDEO_PENDING_MESSAGE = "Video received. Grading videos is being set up, so nothing was graded.";

export const VIDEO_UNSUPPORTED_FORMAT_MESSAGE =
  "This video could not be read as an mp4, webm or mov file, so nothing was graded.";

export const VIDEO_DRIVE_MESSAGE =
  "Video files can't be graded from a Google Drive link; download it and drop it in.";

export const VIDEO_BATCH_MESSAGE = "Videos are only accepted in the grading chat.";

export const VIDEO_LINK_NOTE = "link not fetched: video files aren't supported for linked submissions";

/** In-zip placeholder recorded for a video member while no model seam exists. */
export function videoPlaceholderNote(baseName: string): string {
  return `[Video file: ${baseName} - received; video grading is being set up, do not treat its absence from the work as missing.]`;
}

/** True for a name whose extension is an accepted video container. */
export function isVideoName(name: string): boolean {
  // No office-extract import: this leaf is reachable from client code.
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot >= 0 && VIDEO_EXTENSIONS.has(base.slice(dot + 1).toLowerCase());
}

/** True when the file is a video (by recorded MIME). Never carries bytes (O-1). */
export function isVideoFile(file: SubmittedFileInfo): boolean {
  return file.mimeType !== undefined && VIDEO_MIME_TYPES.has(file.mimeType);
}

/** Number of video files an entry carries. */
export function countVideoFiles(entry: StudentSubmissionEntry): number {
  return entry.submittedFiles.filter(isVideoFile).length;
}

/**
 * True when every file of the entry is a video (and there is at least one):
 * such a student has nothing the grader can read yet, so the ingest turns them
 * into a NAMED skip rather than a grade computed from absent evidence.
 */
export function isVideoOnlyEntry(entry: StudentSubmissionEntry): boolean {
  return entry.submittedFiles.length > 0 && entry.submittedFiles.every(isVideoFile);
}

/**
 * The exhaustiveness assertion every "single, else zip" dispatch site ends in.
 * Adding a fifth GradingUploadKind makes the call a tsc error at all five
 * sites instead of silently falling into the zip branch.
 */
export function assertNeverUploadKind(kind: never): never {
  throw new Error(`Unhandled upload kind: ${String(kind)}`);
}
