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
import { callLlm, type LlmProvider } from "../llm";
import { CHAT_LABEL_MAX_CHARS } from "@/app/components/grading-chat/chatSubmissionIntake";

/**
 * Deliberately SMALL: a false positive on a real name is worse than a miss.
 * Matched against the WHOLE token set of a stem, never a substring, so
 * "Jordan Lee - reflection" stays usable while "reflection" alone does not.
 */
const GENERIC_NAME_TOKENS: ReadonlySet<string> = new Set([
  "submission", "uploaded", "document", "doc", "assignment", "untitled", "final", "draft",
  "paper", "essay", "homework", "hw", "response", "reflection", "file", "download",
  "upload", "scan", "image", "img", "photo", "attachment", "export", "new", "copy",
  "output", "report",
]);

/** Characters of extracted content shown to the name-inference model. */
const INFERENCE_CONTENT_CHARS = 2000;

/**
 * Pure: true when a file stem carries no usable student name (empty, no
 * letters, a uuid/hash, or made only of generic placeholder words).
 */
export function isUnusableStudentName(stem: string): boolean {
  const lowered = stem.trim().toLowerCase();
  if (lowered.length === 0) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(lowered)) return true;
  if (/^[0-9a-f]{32,64}$/.test(lowered)) return true;
  const withoutCounter = lowered.replace(/\s*\(\d+\)$/, "").replace(/[-_]\d+$/, "");
  const tokens = withoutCounter.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0);
  if (tokens.length === 0) return true;
  if (!/\p{L}/u.test(withoutCounter)) return true;
  return tokens.every((t) => GENERIC_NAME_TOKENS.has(t));
}

/**
 * Asks the model for the submitting student's name from the head of the
 * document. ONE call, temperature 0. Abstains (null) on NONE, on a failed or
 * thrown call, or on a value that is itself unusable or over-long: a guessed
 * name is a misattribution, which is worse than a flag.
 */
export async function inferStudentNameFromContent(
  text: string,
  provider: LlmProvider
): Promise<string | null> {
  const head = text.slice(0, INFERENCE_CONTENT_CHARS);
  const prompt =
    "Below is the start of a student's submitted work. If the submitting student's name " +
    "is clearly present as an author, byline or header, reply with only that name. " +
    "If it is not clearly present, reply with only the single word NONE. Do not guess.\n\n" +
    "---\n" +
    head;
  try {
    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 60 },
      },
      provider
    );
    if (!result.ok) return null;
    const firstLine = result.text.trim().split(/\r?\n/)[0] ?? "";
    const name = firstLine.replace(/^name\s*:\s*/i, "").replace(/^["'`]+|["'`]+$/g, "").trim();
    if (name.length === 0 || name.toUpperCase() === "NONE") return null;
    if (name.length > CHAT_LABEL_MAX_CHARS) return null;
    if (isUnusableStudentName(name)) return null;
    return name;
  } catch {
    return null;
  }
}

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
 * `gradeEntries` (engine.ts:481, re-pinned 2026-09-27 after A44 wave 2 inserted above it) - the same per-entry grading path
 * `gradeOneSubmissionAction` already uses. Returns null when the file's text
 * could not be extracted (e.g. an unreadable document), so the caller can
 * refuse with a named reason instead of grading empty content.
 */
export async function buildSingleFileEntry(
  name: string,
  buffer: Buffer,
  provider?: LlmProvider,
  /** True when the user typed a label: the label wins, so no inference runs. */
  labelled: boolean = false
): Promise<StudentSubmissionEntry | null> {
  const extension = getFileExtension(name);
  const stem = studentLabelFromFileName(name);
  const needsName = !labelled && isUnusableStudentName(stem);

  if (IMAGE_EXTENSIONS.has(extension)) {
    const mimeType = getMimeType(extension);
    const placeholder = `[Image file: ${name}]`;
    return {
      student: stem,
      studentNameSource: needsName ? "unresolved" : "filename",
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
    let student = stem;
    let studentNameSource: "filename" | "inferred" | "unresolved" = "filename";
    if (needsName) {
      const inferred = provider ? await inferStudentNameFromContent(extracted, provider) : null;
      if (inferred) {
        student = inferred;
        studentNameSource = "inferred";
      } else {
        studentNameSource = "unresolved";
      }
    }
    return {
      student,
      studentNameSource,
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
