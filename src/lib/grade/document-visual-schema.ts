/** Supported DrawingML pictures only; excludes VML, headers, footers and charts. */
export const DOCUMENT_VISUAL_STATUSES = ["complete", "incomplete", "failed", "unavailable"] as const;
export type DocumentVisualStatus = typeof DOCUMENT_VISUAL_STATUSES[number];
export const DOCUMENT_VISUAL_REASONS = ["none", "unsupported-image", "missing-data", "budget", "inspection-failed", "unsupported-format"] as const;
export const DOCUMENT_PICTURE_LIMIT = 16;
export const DOCUMENT_VISUAL_BYTE_LIMIT = 2 * 1024 * 1024;
export const DOCUMENT_PICTURE_BYTE_LIMIT = 512 * 1024;
export interface DocumentVisuals {
  status: DocumentVisualStatus;
  reason: typeof DOCUMENT_VISUAL_REASONS[number];
  found: number;
  omitted: number;
  parts: { name: string; mimeType: string; base64: string }[];
}
const MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]);
export function isDocumentVisuals(value: unknown): value is DocumentVisuals {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as DocumentVisuals;
  if (!DOCUMENT_VISUAL_STATUSES.includes(v.status) || !DOCUMENT_VISUAL_REASONS.includes(v.reason)) return false;
  if (!Number.isSafeInteger(v.found) || v.found < 0 || v.found > 1e12 || !Number.isSafeInteger(v.omitted) || v.omitted < 0) return false;
  if (!Array.isArray(v.parts) || v.parts.length > DOCUMENT_PICTURE_LIMIT || v.found !== v.parts.length + v.omitted) return false;
  if (v.status === "complete" && (v.omitted !== 0 || v.reason !== "none")) return false;
  if (v.status === "incomplete" && (v.omitted === 0 || !["unsupported-image", "missing-data", "budget"].includes(v.reason))) return false;
  if ((v.status === "failed" || v.status === "unavailable") && (v.parts.length || v.found || v.omitted)) return false;
  if (v.status === "failed" && v.reason !== "inspection-failed") return false;
  if (v.status === "unavailable" && v.reason !== "unsupported-format") return false;
  if (!v.parts.every(p => p && typeof p.name === "string" && p.name.length <= 80 && MIME.has(p.mimeType) && typeof p.base64 === "string" && p.base64.length > 0 && p.base64.length <= 4 * Math.ceil(DOCUMENT_PICTURE_BYTE_LIMIT / 3) && p.base64.length / 4 * 3 - (p.base64.endsWith("==") ? 2 : p.base64.endsWith("=") ? 1 : 0) <= DOCUMENT_PICTURE_BYTE_LIMIT && p.base64.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(p.base64))) return false;
  return Object.keys(v).every(k => ["status", "reason", "found", "omitted", "parts"].includes(k)) && v.parts.every(p => Object.keys(p).every(k => ["name", "mimeType", "base64"].includes(k))) && new TextEncoder().encode(JSON.stringify(v)).byteLength <= DOCUMENT_VISUAL_BYTE_LIMIT;
}
