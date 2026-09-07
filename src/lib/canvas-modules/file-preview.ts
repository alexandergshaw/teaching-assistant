import { canvasError, resolveCourse } from "../canvas-core";
import { assertCanvasSuppliedUrlIsSameOrigin } from "../canvas-remote-url";
import { canvasGet } from "../canvas-fetch-response";
import { extractTextFromBuffer } from "../office-extract";
import type { FilePreview } from "./types";

const PREVIEW_MAX_BYTES = 15 * 1024 * 1024;
const PREVIEW_TEXT_CHARS = 50000;

/** Fetch a Canvas file by id and return a previewable view of its contents. */
export async function getFilePreview(
  courseUrl: string,
  fileId: number,
  code?: string
): Promise<FilePreview> {
  const ctx = await resolveCourse(courseUrl, code);
  const metaResponse = await canvasGet(`${ctx.baseUrl}/api/v1/files/${fileId}`, ctx.token);
  if (!metaResponse.ok) {
    throw canvasError(metaResponse.status, ctx.institution);
  }
  const meta = (await metaResponse.json()) as {
    display_name?: string;
    filename?: string;
    url?: string;
    "content-type"?: string;
    size?: number;
  };
  const name = (meta.display_name ?? meta.filename ?? `File ${fileId}`).trim() || `File ${fileId}`;
  const mimeType = meta["content-type"] ?? "application/octet-stream";

  if (!meta.url) {
    return { name, mimeType, base64: "", text: "Canvas did not return a download URL for this file.", truncated: false };
  }
  if (typeof meta.size === "number" && meta.size > PREVIEW_MAX_BYTES) {
    return { name, mimeType, base64: "", text: "This file is too large to preview here. Open it in Canvas.", truncated: false };
  }

  // SEC3 (docs/lms-credentials-acceptance-criteria.md) - meta.url is a
  // Canvas-supplied field (this course's own /files/:id response), and the
  // bearer token is about to be attached to a fetch of it. Verified same
  // origin as ctx.baseUrl BEFORE that fetch is issued, and the URL actually
  // dialed is the guard's own return value, never the raw candidate (a
  // relative candidate resolves against the base inside the guard, so only
  // the returned string is safe - see src/lib/canvas-remote-url.ts).
  const fileUrl = assertCanvasSuppliedUrlIsSameOrigin(meta.url, ctx.baseUrl);
  const fileResponse = await canvasGet(fileUrl, ctx.token);
  if (!fileResponse.ok) {
    throw canvasError(fileResponse.status, ctx.institution);
  }
  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  if (buffer.byteLength > PREVIEW_MAX_BYTES) {
    return { name, mimeType, base64: "", text: "This file is too large to preview here.", truncated: false };
  }

  if (mimeType.startsWith("image/") || mimeType === "application/pdf") {
    return { name, mimeType, base64: buffer.toString("base64"), text: "", truncated: false };
  }

  let text = (await extractTextFromBuffer(name, buffer)) ?? "";
  let truncated = false;
  if (!text) {
    text = "No text preview is available for this file type. Open it in Canvas to view it.";
  } else if (text.length > PREVIEW_TEXT_CHARS) {
    text = text.slice(0, PREVIEW_TEXT_CHARS);
    truncated = true;
  }
  return { name, mimeType, base64: "", text, truncated };
}
