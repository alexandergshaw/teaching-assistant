// PPT-TEMPLATE-UPLOAD-PLACE W1 (docs/ppt-template-upload-place-scope.md section
// 4.1, docs/ppt-template-upload-security.md section 1): the pure, head- and
// content-only signature checks that decide whether bytes are a genuine
// PowerPoint (.pptx). The extension is advisory only (the video-magic.ts
// precedent); the container is decided from BYTES.
//
// No imports, no I/O, NO XML parser: the content-types text is read with plain
// string and regex scans, so external entities / DTDs cannot be resolved
// because nothing resolves them (XXE-safe by construction). Executes nothing,
// writes nothing, resolves no URL. Client-importable.
//
// This module only reads text it is handed. The server wrapper
// (pptx-validate.ts) is the one place that opens a zip, and it does so under
// the container caps.

/** How many leading bytes the zip sniff needs; callers read no more than this. */
export const PPTX_HEAD_BYTES = 4;

/** The OPC member that lists every part's content type. */
export const CONTENT_TYPES_MEMBER = "[Content_Types].xml";

/** Member-size cap applied to the content-types read (declared bytes). */
export const CONTENT_TYPES_MAX_BYTES = 256 * 1024;

/** The part a PowerPoint package must declare as its main part. */
export const PPTX_PRESENTATION_PART = "/ppt/presentation.xml";

/** The presentation member as a zip entry name (no leading slash). */
export const PPTX_PRESENTATION_MEMBER = "ppt/presentation.xml";

/**
 * The CLOSED set of main-part content types accepted. Compared by EQUALITY,
 * never by substring. Macro-enabled, slideshow and template types are
 * deliberately absent (R-POTX is an owner choice).
 */
export const PPTX_MAIN_CONTENT_TYPES: readonly string[] = [
  "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
];

/**
 * Why a content-types document was refused, for message selection only:
 * "other-office" is a Word or Excel package, "macro-enabled" a .pptm,
 * "not-pptx" anything else (including a DTD or no usable declaration).
 */
export type PptxContentVerdict = "pptx" | "macro-enabled" | "other-office" | "not-pptx";

/**
 * True iff the first four bytes are the ZIP local-file-header magic
 * 50 4B 03 04. Rejects an OLE .ppt (D0 CF 11 E0), the empty-archive and
 * spanned markers, and every non-zip.
 */
export function sniffZipHead(head: Uint8Array): boolean {
  if (head.length < PPTX_HEAD_BYTES) return false;
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

const OVERRIDE_TAG = /<Override(?=[\s/>])[^>]*>/g;
const PART_NAME_ATTR = /(?:^|\s)PartName\s*=\s*(?:"([^"]*)"|'([^']*)')/;
const CONTENT_TYPE_ATTR = /(?:^|\s)ContentType\s*=\s*(?:"([^"]*)"|'([^']*)')/;
const XML_COMMENT = /<!--[\s\S]*?-->/g;

function attrValue(tag: string, pattern: RegExp): string | null {
  const m = pattern.exec(tag);
  if (!m) return null;
  return m[1] ?? m[2] ?? null;
}

/**
 * Classifies a [Content_Types].xml text. A DOCTYPE or ENTITY declaration is
 * refused outright (real OOXML carries no DTD). Comments are stripped before
 * any scan so a decoy inside a comment is invisible. Each Override is read
 * with separate attribute regexes (attribute order is not fixed by OPC).
 */
export function classifyContentTypes(contentTypesXml: string): PptxContentVerdict {
  if (contentTypesXml.includes("<!DOCTYPE") || contentTypesXml.includes("<!ENTITY")) {
    return "not-pptx";
  }
  const text = contentTypesXml.replace(XML_COMMENT, "");

  const presentationTypes: string[] = [];
  for (const tag of text.match(OVERRIDE_TAG) ?? []) {
    if (attrValue(tag, PART_NAME_ATTR) !== PPTX_PRESENTATION_PART) continue;
    presentationTypes.push(attrValue(tag, CONTENT_TYPE_ATTR) ?? "");
  }

  // One declaration for the main part. Two is ambiguous, so it is refused.
  if (presentationTypes.length === 1) {
    const declared = presentationTypes[0];
    if (PPTX_MAIN_CONTENT_TYPES.includes(declared)) return "pptx";
    if (declared.includes("macroEnabled")) return "macro-enabled";
  }
  if (text.includes("wordprocessingml") || text.includes("spreadsheetml")) return "other-office";
  return "not-pptx";
}

/** True iff the content-types text declares a plain PowerPoint main part. */
export function isPptxContentTypes(contentTypesXml: string): boolean {
  return classifyContentTypes(contentTypesXml) === "pptx";
}
