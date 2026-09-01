// Pure decision leaf for RubricInputModal.tsx - the "paste a rubric into a
// modal (plain text paste, plus PDF/doc upload)" surface
// (docs/grading-via-recording-acceptance-criteria.md section 2). vitest is
// node-env and collects only src/**/*.test.ts (vitest.config.ts) - no
// component in this repo is ever rendered by a test - so every decision this
// modal needs to make (which paste/upload states are valid, what message a
// given failure gets, whether an extraction is suspicious) lives here as a
// plain function, not inline in the component, or none of it could be
// tested at all.
//
// This modal does NOT own file-type/size validation (that stays
// `validateFileUpload`, src/lib/syllabus-upload-validation.ts, run on both
// sides so the two gates can never disagree - R2) and does NOT own
// extraction (that stays `extractSyllabusTextAction`,
// src/app/actions/syllabus-upload.ts, reused whole: it already downloads,
// extracts, and ALWAYS deletes the temporary object). What lives here is
// everything downstream of a successful validation/extraction call: is the
// result trustworthy, and what should the instructor be told either way.

/** Where the text currently shown in the review textarea came from - R2b's
 * "tell the instructor which path produced the text" applies even without a
 * vision-model fallback (see RubricInputModal.tsx's header comment for why
 * that fallback was not built this wave): a pasted rubric and a machine's
 * extraction of an uploaded document are not the same kind of evidence, and
 * the instructor should always be able to tell which one they are looking
 * at. */
export type RubricTextSource = "paste" | "upload";

/** A rubric is exactly as sensitive as a syllabus (AC section 2) and gets no
 * lower a bar for "usable" than any other text field in this app:
 * non-blank once whitespace is trimmed from both ends. */
export function isRubricTextUsable(text: string): boolean {
  return text.trim().length > 0;
}

/** Gate for the modal's "Use this rubric" action: usable text, and not
 * mid-upload (submitting while an extraction is still in flight would hand
 * the caller stale text the instructor has not actually reviewed yet). */
export function canSubmitRubric(text: string, uploadBusy: boolean): boolean {
  return !uploadBusy && isRubricTextUsable(text);
}

/**
 * R1a/R2b's failure mode, one level up from extraction: `extractSyllabusText
 * Action` already refuses a FULLY blank result ("No text found in that
 * file..."), but a scanned PDF routinely yields a HANDFUL of real characters
 * - a running header, a lone page number, an OCR artifact from an
 * embedded thumbnail - which is not literally empty and would otherwise look
 * exactly like a real extraction succeeding. This threshold is deliberately
 * generous (real rubrics run to hundreds of characters at minimum) so it
 * only fires on text that could not possibly be a usable rubric.
 */
export const SUSPICIOUS_EXTRACTION_MAX_CHARS = 25;

export function isExtractionSuspiciouslyShort(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= SUSPICIOUS_EXTRACTION_MAX_CHARS;
}

/** Shown once, next to the review textarea, when no file has been touched
 * yet - this modal's whole point is that paste needs no upload at all
 * (R2a). */
export const NOT_SIGNED_IN_MESSAGE = "You must be signed in to upload a rubric file.";

/** Mirrors SyllabusUploadControl.tsx's own wording for the same failure
 * (Storage upload rejected) - the two controls should read as the same
 * product, not two independently-invented error styles for one failure. */
export function describeStorageUploadFailureMessage(fileName: string): string {
  return `Could not upload "${fileName}" - try again.`;
}

/**
 * Enriches `extractSyllabusTextAction`'s own "No text found in that file..."
 * error (a fully-blank extraction) with the scanned-PDF explanation R2b
 * requires - but ONLY when the error is actually that one; every other
 * extraction error (unsupported type, too large, download failure) is
 * already specific on its own and is returned unchanged rather than having
 * an unrelated OCR note bolted onto it.
 */
export function describeExtractionErrorMessage(fileName: string, extension: string, rawError: string): string {
  const isEmptyTextError = /no text found/i.test(rawError);
  if (!isEmptyTextError) {
    return rawError;
  }
  const scanNote =
    extension === "pdf"
      ? " If this is a scanned PDF (a photo or image of a page rather than real text), this app has no OCR and cannot read it that way - paste the rubric text directly instead."
      : " Paste the rubric text directly instead, or try a different file.";
  return `"${fileName}" extracted to no readable text.${scanNote}`;
}

/** The warning shown when extraction technically succeeded but landed at or
 * under SUSPICIOUS_EXTRACTION_MAX_CHARS - see that constant's own comment.
 * Never a hard refusal: the (short) text is still populated into the
 * textarea for the instructor to see and decide, per R2c. */
export function describeSuspiciousExtractionMessage(fileName: string, extension: string): string {
  const scanNote =
    extension === "pdf"
      ? " This usually means the PDF is a scanned image rather than real text - this app has no OCR, so a scanned page cannot be read reliably this way."
      : " The file may be blank, image-only, or in a format this app could not read correctly.";
  return `Only a few characters came back from "${fileName}".${scanNote} Review the extracted text below, or paste the rubric text directly instead.`;
}

/** The neutral confirmation for a normal, non-suspicious extraction -
 * R2c's "shown for review before it is used", satisfied by the count alone
 * telling the instructor something real came back before they even read it. */
export function describeExtractionSuccessMessage(fileName: string, charCount: number): string {
  return `Extracted ${charCount} character${charCount === 1 ? "" : "s"} from "${fileName}". Review the text below before continuing.`;
}

/** One notice, one severity, for whatever an upload attempt just produced -
 * the single decision RubricInputModal.tsx renders from, so the component
 * itself never has to re-derive "is this good, suspicious, or a failure"
 * from raw strings. */
export type RubricUploadNotice =
  | { kind: "success"; text: string }
  | { kind: "warning"; text: string }
  | { kind: "error"; text: string };

export function deriveUploadOutcomeNotice(
  fileName: string,
  extension: string,
  result: { text: string } | { error: string }
): RubricUploadNotice {
  if ("error" in result) {
    return { kind: "error", text: describeExtractionErrorMessage(fileName, extension, result.error) };
  }
  if (isExtractionSuspiciouslyShort(result.text)) {
    return { kind: "warning", text: describeSuspiciousExtractionMessage(fileName, extension) };
  }
  return { kind: "success", text: describeExtractionSuccessMessage(fileName, result.text.trim().length) };
}

/** The small provenance label rendered above the review textarea (R2b/R2c) -
 * never the notice banner itself, which is transient and about the LAST
 * upload attempt; this is about what the textarea's CURRENT content is. */
export function describeRubricSourceLabel(source: RubricTextSource, fileName: string | null): string {
  if (source === "paste") {
    return "Source: pasted text";
  }
  return fileName ? `Source: extracted from "${fileName}"` : "Source: extracted from an uploaded file";
}
