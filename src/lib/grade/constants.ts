const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  odt: "application/vnd.oasis.opendocument.text",
  odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  rtf: "application/rtf",
  txt: "text/plain",
  md: "text/markdown",
  py: "text/x-python",
  js: "text/javascript",
  ts: "text/typescript",
  tsx: "text/typescript",
  jsx: "text/javascript",
  html: "text/html",
  css: "text/css",
  json: "application/json",
  xml: "application/xml",
  csv: "text/csv",
  java: "text/x-java-source",
  ipynb: "application/json",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

/**
 * VIDEO-GRADING W1 dark flag (docs/video-grading-chat-intake-ops.md section
 * 12 rollback ladder). A module constant, not an env var, so it behaves
 * identically in every environment (precedent: GRADING_ZIP_STORAGE_INGEST_ENABLED).
 * FALSE = a video is exactly what it was before this feature: "unsupported"
 * for a loose upload, "skip" inside a zip. The owner flips it only after the
 * model seam exists and the Supabase upload limit is raised (owner D8).
 */
export const VIDEO_GRADING_ENABLED = false;

// Video containers accepted for grading (ops section 4). One owner, no drift.
export const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set(["mp4", "webm", "mov", "m4v"]);

// The MIME types a sniffed video container resolves to. Video is NEVER inline:
// it is deliberately absent from GEMINI_INLINE_MIME_TYPES, so
// graderNeedsFileBytes is false for every member of this set.
export const VIDEO_MIME_TYPES: ReadonlySet<string> = new Set(["video/mp4", "video/quicktime", "video/webm"]);

// Image formats recognized in submissions so their presence is never missed
// (e.g. required screenshots). They cannot be text-extracted, so they are
// recorded and sent to the vision-capable grader instead.
export const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "heic",
  "heif",
]);

// Image MIME types Gemini can read as inline data. Other recognized images
// still count toward "presence" but are not sent to the model.
export const GEMINI_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

// Every MIME type the grader sends to Gemini as inline data: the readable
// image types plus PDF, so a PDF's embedded screenshots reach the model
// instead of only its extracted text.
export const GEMINI_INLINE_MIME_TYPES = new Set([
  ...GEMINI_IMAGE_MIME_TYPES,
  "application/pdf",
]);

// Office containers whose embedded raster images are extracted and sent to the
// model (wave 1b). Maps the MIME type to the office-edit kind.
export const OFFICE_IMAGE_SOURCE_MIME_TYPES: Record<string, "docx" | "pptx"> = {
  [MIME_TYPES.docx]: "docx",
  [MIME_TYPES.pptx]: "pptx",
};

/** True when the grader sends this MIME type's raw bytes to the model. */
export function graderNeedsFileBytes(mimeType: string | undefined): boolean {
  return mimeType !== undefined && GEMINI_INLINE_MIME_TYPES.has(mimeType);
}

export function getMimeType(extension: string): string {
  return MIME_TYPES[extension.toLowerCase()] ?? "application/octet-stream";
}
