import { graderNeedsFileBytes } from "./constants";
import type { SubmittedFileInfo } from "./types";

export interface InlineVisualPart {
  name: string;
  base64: string;
  mimeType: string;
}

/**
 * The submitted files whose raw bytes go to the model as inline data: images
 * and PDFs (so a PDF's embedded screenshots are seen, not only its extracted
 * text). Wave 1a: no office (docx/pptx) extraction. A file with no rawBase64 or
 * no MIME type is skipped. Pure.
 */
export function collectInlineVisualParts(submittedFiles: SubmittedFileInfo[]): InlineVisualPart[] {
  const parts: InlineVisualPart[] = [];
  for (const f of submittedFiles) {
    if (!f.rawBase64 || !f.mimeType) continue;
    if (!graderNeedsFileBytes(f.mimeType)) continue;
    parts.push({ name: f.name, base64: f.rawBase64, mimeType: f.mimeType });
  }
  return parts;
}
