import { ZIP_MAX_MEMBER_DECLARED_BYTES } from "../zip-caps";

/** Bounded envelope check only; this cannot establish that a PDF parses or renders. */
export function hasCanvasPdfEnvelope(base64: string): boolean {
  if (!base64 || Buffer.byteLength(base64, "base64") > ZIP_MAX_MEMBER_DECLARED_BYTES) return false;
  const bytes = Buffer.from(base64, "base64");
  const header = bytes.subarray(0, Math.min(bytes.length, 1024)).indexOf("%PDF-");
  return header >= 0 && bytes.subarray(Math.max(0, bytes.length - 1024)).includes("%%EOF");
}
