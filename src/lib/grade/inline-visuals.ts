import { DOCUMENT_EXTENSIONS } from "../office-extract";
import { OFFICE_IMAGE_SOURCE_MIME_TYPES, graderNeedsFileBytes } from "./constants";
import { prepareDocumentVisuals } from "./document-visuals";
import { DOCUMENT_PICTURE_LIMIT, DOCUMENT_VISUAL_BYTE_LIMIT } from "./document-visual-schema";
import type { DocumentVisuals } from "./document-visual-schema";
import type { SubmittedFileInfo } from "./types";
export interface InlineVisualPart { name: string; base64: string; mimeType: string }
export interface CollectedVisuals { parts: InlineVisualPart[]; documents: { file: SubmittedFileInfo; coverage: DocumentVisuals }[] }
/** Prepared representations win over raw fallback, preventing duplicate pictures. */
export async function collectInlineVisualEvidence(submittedFiles: SubmittedFileInfo[]): Promise<CollectedVisuals> {
  const out: CollectedVisuals = { parts: [], documents: [] };
  let remainingParts = DOCUMENT_PICTURE_LIMIT;
  let remainingBytes = DOCUMENT_VISUAL_BYTE_LIMIT;
  for (const f of submittedFiles) {
    const kind = f.extension === "docx" || f.extension === "pptx" ? f.extension : f.mimeType ? OFFICE_IMAGE_SOURCE_MIME_TYPES[f.mimeType] : undefined;
    if (f.documentVisuals || kind || (DOCUMENT_EXTENSIONS.has(f.extension) && f.extension !== "pdf")) {
      let coverage = f.documentVisuals ?? await prepareDocumentVisuals(kind ?? f.extension, f.rawBase64 ? Buffer.from(f.rawBase64, "base64") : undefined, { parts: remainingParts, bytes: remainingBytes });
      if (coverage.parts.length && (coverage.parts.length > remainingParts || new TextEncoder().encode(JSON.stringify(coverage)).byteLength > remainingBytes)) {
        coverage = { ...coverage, status: "incomplete", reason: "budget", omitted: coverage.found, parts: [] };
      }
      remainingParts -= coverage.parts.length;
      remainingBytes = Math.max(0, remainingBytes - new TextEncoder().encode(JSON.stringify(coverage)).byteLength);
      out.documents.push({ file: f, coverage });
      out.parts.push(...coverage.parts.map(p => ({ ...p, name: f.name + " (" + p.name + ")" })));
    } else if (f.rawBase64 && f.mimeType && graderNeedsFileBytes(f.mimeType)) {
      out.parts.push({ name: f.name, base64: f.rawBase64, mimeType: f.mimeType });
    }
  }
  return out;
}
/** Compatibility projection; grading consumes the coverage-bearing form. */
export async function collectInlineVisualParts(submittedFiles: SubmittedFileInfo[]): Promise<InlineVisualPart[]> {
  return (await collectInlineVisualEvidence(submittedFiles)).parts;
}
