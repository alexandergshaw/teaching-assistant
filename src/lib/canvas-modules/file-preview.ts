import { canvasError, resolveCourse } from "../canvas-core";
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
  const ctx = resolveCourse(courseUrl, code);
  const metaResponse = await fetch(`${ctx.baseUrl}/api/v1/files/${fileId}`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
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

  const fileResponse = await fetch(meta.url, { headers: { Authorization: `Bearer ${ctx.token}` } });
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
