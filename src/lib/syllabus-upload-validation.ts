// Pure validation logic for syllabus file uploads (no server action, no async).

// Maximum file size: ~6 MB, mirroring repository upload caps
const MAX_FILE_SIZE = 6 * 1024 * 1024;

// Allowed file extensions (MIME type not checked due to browser inconsistencies)
const ALLOWED_EXTENSIONS = new Set([".docx", ".pdf", ".txt", ".md"]);

/** Result of validating a file for syllabus upload. */
export type ValidationResult =
  | { valid: true; extension: string }
  | { valid: false; error: string };

/** Validate file extension and MIME type. */
export function validateFileUpload(
  fileName: string,
  mimeType: string,
  fileSize: number
): ValidationResult {
  if (fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File is too large. Maximum size is 6 MB.`,
    };
  }

  const ext = fileName.toLowerCase().match(/\.\w+$/)?.[0] || "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `File type not supported. Accepted formats: .docx, .pdf, .txt, .md`,
    };
  }

  // Don't fail on MIME type mismatch alone; extension is the primary gate
  // (browsers report inconsistent MIME for .docx, .pdf, .md, etc.)

  return { valid: true, extension: ext };
}
