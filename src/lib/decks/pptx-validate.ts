// PPT-TEMPLATE-UPLOAD-PLACE W1 (docs/ppt-template-upload-security.md sections
// 1 and 2): the server-side assertion that an uploaded buffer is a genuine
// PowerPoint (.pptx) package. Layers, in order, each failing fast:
//   1. the 4-byte zip head sniff (no zip work for a non-zip);
//   2. the capped open: the zip load is IMMEDIATELY followed by the container
//      pre-flight (the same two-step pattern as openOfficeZip in
//      src/lib/office-edit.ts, which is not exported), so a decompression bomb
//      is refused from declared sizes before anything is inflated;
//   3. the [Content_Types].xml member, read under a 256KB member cap through
//      the bounded reader, and classified by pptx-signature.ts;
//   4. the ppt/presentation.xml part the content-type points at must exist.
//
// No XML parser anywhere (the content-types text is scanned, never parsed), and
// no direct member decompression in this file: every member read goes through
// readOfficeMember. A decompression-cap breach surfaces as a ZipCapError; every
// other refusal is a PptxValidationError with worded text (the raw library
// message never reaches the user).

import JSZip from "jszip";
import { assertContainerWithinCaps, createZipBudget, readOfficeMember } from "@/lib/zip-caps";
import {
  CONTENT_TYPES_MAX_BYTES,
  CONTENT_TYPES_MEMBER,
  PPTX_HEAD_BYTES,
  PPTX_PRESENTATION_MEMBER,
  classifyContentTypes,
  sniffZipHead,
} from "./pptx-signature";

export const NOT_PPTX_MESSAGE = "That is not a PowerPoint (.pptx) file.";
export const OTHER_OFFICE_MESSAGE = "That is a different Office file, not a PowerPoint.";
export const MACRO_ENABLED_MESSAGE =
  "Macro-enabled PowerPoint files are not accepted. Save the deck as a plain .pptx and upload that.";
export const UNREADABLE_PPTX_MESSAGE =
  "That file could not be opened as a PowerPoint (.pptx). It may be damaged.";

/** A worded refusal of an upload that is not a plain PowerPoint package. */
export class PptxValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PptxValidationError";
  }
}

/**
 * Throws PptxValidationError (worded) when `buffer` is not a plain .pptx, or a
 * ZipCapError when the container breaches a decompression cap. Resolves with
 * nothing for a genuine .pptx.
 */
export async function assertPptxContainer(buffer: Buffer): Promise<void> {
  if (!sniffZipHead(buffer.subarray(0, PPTX_HEAD_BYTES))) {
    throw new PptxValidationError(NOT_PPTX_MESSAGE);
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new PptxValidationError(UNREADABLE_PPTX_MESSAGE);
  }
  assertContainerWithinCaps(zip, "office-file");

  const contentTypes = zip.file(CONTENT_TYPES_MEMBER);
  if (!contentTypes) throw new PptxValidationError(NOT_PPTX_MESSAGE);

  const budget = createZipBudget({ maxMemberDeclaredBytes: CONTENT_TYPES_MAX_BYTES });
  const xml = (await readOfficeMember(contentTypes, CONTENT_TYPES_MEMBER, budget)).toString("utf-8");

  const verdict = classifyContentTypes(xml);
  if (verdict === "other-office") throw new PptxValidationError(OTHER_OFFICE_MESSAGE);
  if (verdict === "macro-enabled") throw new PptxValidationError(MACRO_ENABLED_MESSAGE);
  if (verdict !== "pptx") throw new PptxValidationError(NOT_PPTX_MESSAGE);

  if (!zip.file(PPTX_PRESENTATION_MEMBER)) throw new PptxValidationError(NOT_PPTX_MESSAGE);
}
