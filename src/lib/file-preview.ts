/**
 * Pure type-resolution logic for file preview strategy.
 * Determines how a file should be previewed based on its MIME type and extension.
 */

export type PreviewStrategy =
  | "pdf"
  | "image"
  | "text"
  | "docx"
  | "pptx"
  | "zip"
  | "media-play"
  | "none";

/** Determine the preview strategy for a file. */
export function getPreviewStrategy(
  mimeType: string,
  extension?: string
): PreviewStrategy {
  const mime = (mimeType || "").toLowerCase();
  const ext = (extension || "").toLowerCase();

  // Media kinds: delegate to play toggle
  if (mime.startsWith("video/") || mime.startsWith("audio/")) {
    return "media-play";
  }

  // PDF
  if (mime.includes("pdf")) {
    return "pdf";
  }

  // Images
  if (mime.startsWith("image/")) {
    return "image";
  }

  // Office documents
  if (mime.includes("wordprocessingml")) {
    return "docx";
  }
  if (mime.includes("presentationml")) {
    return "pptx";
  }

  // Text-like by MIME type
  if (mime.startsWith("text/") || mime.includes("json")) {
    return "text";
  }

  // Text-like by extension
  if (ext === "md" || ext === "csv" || ext === "log" || ext === "json" || ext === "txt") {
    return "text";
  }

  // ZIP bundles
  if (mime.includes("zip")) {
    return "zip";
  }

  // Unknown
  return "none";
}

/** Human-readable description of why a file cannot be previewed inline. */
export function getNoPreviewReason(mimeType: string, extension?: string): string {
  const strategy = getPreviewStrategy(mimeType, extension);
  if (strategy !== "none") {
    return ""; // Has a preview
  }
  return "No inline preview is available for this file type.";
}
