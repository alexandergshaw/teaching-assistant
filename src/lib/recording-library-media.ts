import type { RecordingFile } from "@/lib/recording-files";

const MEDIA_EXTENSION = /\.(?:mp4|m4v|mov|webm|mkv|mpeg|mpg|mp3|m4a|wav|wave|ogg|oga|opus|aac|flac)$/i;

/** Limit this picker to media while allowing older files saved with a generic MIME. */
export function isRecordingLibraryMedia(file: Pick<RecordingFile, "kind" | "mimeType" | "name" | "storagePath">): boolean {
  if (file.kind === "bundle") return false;
  const mime = file.mimeType.trim().toLowerCase().split(";")[0];
  if (mime.startsWith("audio/") || mime.startsWith("video/")) return true;
  if (mime && mime !== "application/octet-stream" && mime !== "binary/octet-stream" && mime !== "application/ogg") return false;
  return MEDIA_EXTENSION.test(file.storagePath) || MEDIA_EXTENSION.test(file.name);
}
