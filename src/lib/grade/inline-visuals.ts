import { extractOfficeImagesWithData } from "../office-edit";
import {
  GEMINI_IMAGE_MIME_TYPES,
  OFFICE_IMAGE_SOURCE_MIME_TYPES,
  graderNeedsFileBytes,
} from "./constants";
import type { SubmittedFileInfo } from "./types";

export interface InlineVisualPart {
  name: string;
  base64: string;
  mimeType: string;
}

/**
 * Embedded raster images of one docx/pptx, as inline parts. Parses UNTRUSTED
 * bytes: extractOfficeImagesWithData opens the zip through openOfficeZip, which
 * runs the zip-bomb caps (assertContainerWithinCaps) before any decompression.
 * Any error (corrupt zip, cap breach, bad XML) yields no parts for this file so
 * the grade proceeds on its text. Known gap (RES-VIS-6): emf/wmf/svg images are
 * not returned by office-edit, so a screenshot pasted as EMF/WMF yields nothing.
 */
async function officeImageParts(f: SubmittedFileInfo, kind: "docx" | "pptx"): Promise<InlineVisualPart[]> {
  try {
    const images = await extractOfficeImagesWithData(kind, Buffer.from(f.rawBase64 ?? "", "base64"));
    const parts: InlineVisualPart[] = [];
    images.forEach((im, i) => {
      if (!im.base64 || !im.mimeType || !GEMINI_IMAGE_MIME_TYPES.has(im.mimeType)) return;
      parts.push({ name: `${f.name} (image ${i + 1}: ${im.name})`, base64: im.base64, mimeType: im.mimeType });
    });
    return parts;
  } catch {
    return [];
  }
}

/**
 * The submitted files whose visuals go to the model as inline data: images and
 * PDFs as-is (so a PDF's embedded screenshots are seen, not only its extracted
 * text), and the embedded raster images of a docx/pptx. A file with no
 * rawBase64 or no MIME type is skipped. Never throws.
 */
export async function collectInlineVisualParts(submittedFiles: SubmittedFileInfo[]): Promise<InlineVisualPart[]> {
  const parts: InlineVisualPart[] = [];
  for (const f of submittedFiles) {
    if (!f.rawBase64 || !f.mimeType) continue;
    if (graderNeedsFileBytes(f.mimeType)) {
      parts.push({ name: f.name, base64: f.rawBase64, mimeType: f.mimeType });
      continue;
    }
    const kind = OFFICE_IMAGE_SOURCE_MIME_TYPES[f.mimeType];
    if (kind) parts.push(...(await officeImageParts(f, kind)));
  }
  return parts;
}
