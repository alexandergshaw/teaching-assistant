/**
 * A39 wave 1 - "one submission needs no zip". Grading a single student's
 * work has always required wrapping it in a zip archive first, even though
 * the whole pipeline already accepts one already-extracted entry
 * (gradeOneSubmissionAction, engine.ts's gradeEntries). This module is the
 * PURE classifier + builder pair that lets a non-zip upload skip the
 * archive step entirely: classify the upload by its extension, then build
 * the one StudentSubmissionEntry the existing per-entry grading path needs.
 *
 * The live hazard this guards against (RES-A39A-9, docs/a39-waves.md
 * section 7.3, W1-1): a `.docx` file IS a valid zip archive, so a naive
 * "try to open it as a zip" classifier would call it `"zip"`, route it
 * through the archive path, and grade its raw OOXML - `word/document.xml`
 * passes as a "supported" text file (TEXT_EXTENSIONS contains "xml") and
 * the student ends up named "document". Classification here is by
 * EXTENSION only, never by sniffing the bytes, so a `.docx` is always
 * `"single"` and never `"zip"`. (A `.docx` deliberately renamed to `.zip`
 * is a different, still-open problem - RES-A39A-9 - not solved here.)
 *
 * No new dependency: every helper below already exists and is imported,
 * not reimplemented.
 */
import { getFileExtension, TEXT_EXTENSIONS, DOCUMENT_EXTENSIONS, extractTextFromBuffer } from "../office-extract";
import { IMAGE_EXTENSIONS, getMimeType } from "./constants";
import { toPreviewContent } from "./utils";
import type { StudentSubmissionEntry } from "./types";

export type GradingUploadKind = "zip" | "single" | "unsupported";

/**
 * Classifies an uploaded grading file by its extension alone. `"zip"` keeps
 * routing through the existing archive path unchanged; `"single"` is a file
 * this module can turn directly into one gradable entry; `"unsupported"` is
 * neither (the caller keeps today's "please upload a zip" refusal for it).
 */
export function classifyGradingUpload(name: string): GradingUploadKind {
  const extension = getFileExtension(name);
  if (extension === "zip") {
    return "zip";
  }
  if (TEXT_EXTENSIONS.has(extension) || DOCUMENT_EXTENSIONS.has(extension) || IMAGE_EXTENSIONS.has(extension)) {
    return "single";
  }
  return "unsupported";
}

/**
 * The uploaded file's own name, minus its extension, trimmed - a stand-in
 * label for the one submission this upload contains. Deliberately NOT
 * `groupSubmissionsByStudent`/`parseSubmissionFileName`'s filename-convention
 * inference (utils.ts): those exist to recover an identity for many files
 * bundled in one zip, and their fallback (`leafStemFallback`) would name
 * this student after the leading alphanumeric run of the stem - exactly the
 * "document" failure mode W1-1/W1-2 exist to keep out of this path. A single
 * upload has exactly one student in it, so the whole file stem is the label.
 */
function studentLabelFromFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const extension = getFileExtension(base);
  const stem = extension ? base.slice(0, base.length - extension.length - 1) : base;
  const trimmed = stem.trim();
  return trimmed.length > 0 ? trimmed : "Uploaded submission";
}

/**
 * Builds the one StudentSubmissionEntry a non-zip upload represents, for
 * `gradeEntries` (engine.ts:457) - the same per-entry grading path
 * `gradeOneSubmissionAction` already uses. Returns null when the file's text
 * could not be extracted (e.g. an unreadable document), so the caller can
 * refuse with a named reason instead of grading empty content.
 */
export async function buildSingleFileEntry(
  name: string,
  buffer: Buffer
): Promise<StudentSubmissionEntry | null> {
  const extension = getFileExtension(name);
  const student = studentLabelFromFileName(name);

  if (IMAGE_EXTENSIONS.has(extension)) {
    const mimeType = getMimeType(extension);
    const placeholder = `[Image file: ${name}]`;
    return {
      student,
      content: placeholder,
      mergedFileCount: 1,
      submittedFiles: [
        {
          name,
          extension,
          previewContent: placeholder,
          previewTruncated: false,
          rawBase64: buffer.toString("base64"),
          mimeType,
        },
      ],
    };
  }

  if (TEXT_EXTENSIONS.has(extension) || DOCUMENT_EXTENSIONS.has(extension)) {
    // A corrupt or unreadable document (e.g. a truncated upload) must
    // degrade to "could not read it" rather than crash the whole action -
    // gradeOneSubmissionAction's Canvas-file path (canvasWorkToEntry,
    // extraction.ts) has the same try/catch around this same call for the
    // same reason.
    let extracted: string | null;
    try {
      extracted = await extractTextFromBuffer(name, buffer);
    } catch {
      extracted = null;
    }
    if (!extracted || !extracted.trim()) {
      return null;
    }
    const preview = toPreviewContent(extracted);
    return {
      student,
      content: extracted,
      mergedFileCount: 1,
      submittedFiles: [
        {
          name,
          extension,
          previewContent: preview.text,
          previewTruncated: preview.truncated,
          rawBase64: buffer.toString("base64"),
          mimeType: getMimeType(extension),
        },
      ],
    };
  }

  return null;
}
