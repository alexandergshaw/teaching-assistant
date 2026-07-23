import { canvasError, resolveCourse } from "../canvas-core";
import {
  analyzeOfficeFile,
  extractOfficeImages,
  extractOfficeImageData,
  extractOfficeImagesWithData,
  setOfficeImageAlt,
  setDocxTitle,
  applyOfficeSections,
  type OfficeKind,
  type OfficeImage,
  type RunSpan,
} from "../office-edit";
import { scanPdf, readPdfMeta, setPdfAccessibility } from "../accessibility/pdf";
import type { Issue } from "../accessibility/types";
import { listCourseFiles } from "./files";
import type { ScannableFile } from "./types";
import type { CanvasInstitution } from "../canvas-core";

const PREVIEW_MAX_BYTES = 15 * 1024 * 1024;

interface CanvasFileMeta {
  name: string;
  filename: string;
  url: string;
  contentType: string;
  folderId: number | null;
  kind: OfficeKind | null;
}

async function fetchCanvasFile(
  ctx: { baseUrl: string; token: string; institution: CanvasInstitution },
  fileId: number
): Promise<{ meta: CanvasFileMeta; buffer: Buffer }> {
  const metaResponse = await fetch(`${ctx.baseUrl}/api/v1/files/${fileId}`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  if (!metaResponse.ok) {
    throw canvasError(metaResponse.status, ctx.institution);
  }
  const raw = (await metaResponse.json()) as {
    display_name?: string;
    filename?: string;
    url?: string;
    "content-type"?: string;
    folder_id?: number | null;
    size?: number;
  };
  const name = (raw.display_name ?? raw.filename ?? `File ${fileId}`).trim() || `File ${fileId}`;
  const filename = (raw.filename ?? raw.display_name ?? name).trim();
  const lower = (raw.filename ?? raw.display_name ?? "").toLowerCase();
  const kind: OfficeKind | null = lower.endsWith(".docx") ? "docx" : lower.endsWith(".pptx") ? "pptx" : null;
  if (!raw.url) throw new Error("Canvas did not return a download URL for this file.");
  if (typeof raw.size === "number" && raw.size > PREVIEW_MAX_BYTES) {
    throw new Error("This file is too large to edit here.");
  }

  const fileResponse = await fetch(raw.url, { headers: { Authorization: `Bearer ${ctx.token}` } });
  if (!fileResponse.ok) {
    throw canvasError(fileResponse.status, ctx.institution);
  }
  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  if (buffer.byteLength > PREVIEW_MAX_BYTES) {
    throw new Error("This file is too large to edit here.");
  }
  return {
    meta: { name, filename, url: raw.url, contentType: raw["content-type"] ?? "application/octet-stream", folderId: raw.folder_id ?? null, kind },
    buffer,
  };
}

async function overwriteCanvasFile(
  ctx: { baseUrl: string; token: string; institution: CanvasInstitution; courseId: string },
  meta: CanvasFileMeta,
  buffer: Buffer
): Promise<void> {
  const params = new URLSearchParams();
  params.append("name", meta.name);
  if (meta.folderId != null) params.append("parent_folder_id", String(meta.folderId));
  params.append("content_type", meta.contentType);
  params.append("on_duplicate", "overwrite");
  params.append("size", String(buffer.byteLength));

  const presign = await fetch(`${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!presign.ok) {
    throw canvasError(presign.status, ctx.institution);
  }
  const ticket = (await presign.json()) as { upload_url?: string; upload_params?: Record<string, string> };
  if (!ticket.upload_url || !ticket.upload_params) {
    throw new Error("Canvas did not return an upload URL.");
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.upload_params)) form.append(key, value);
  form.append("file", new Blob([new Uint8Array(buffer)], { type: meta.contentType }), meta.name);
  const upload = await fetch(ticket.upload_url, { method: "POST", body: form });
  if (!upload.ok) {
    throw new Error(`Saving to Canvas failed (HTTP ${upload.status}).`);
  }
}

/** List the course's scannable files (docx/pptx/pdf) for accessibility scanning. */
export async function listScannableFiles(courseUrl: string, code?: string): Promise<ScannableFile[]> {
  const files = await listCourseFiles(courseUrl, code);
  const out: ScannableFile[] = [];
  for (const f of files) {
    const lower = (f.fileName || f.displayName || "").toLowerCase();
    const kind: ScannableFile["kind"] | null = lower.endsWith(".docx")
      ? "docx"
      : lower.endsWith(".pptx")
        ? "pptx"
        : lower.endsWith(".pdf")
          ? "pdf"
          : null;
    if (!kind) continue;
    out.push({ id: f.id, title: f.displayName, kind, fingerprint: f.updatedAt || String(f.size) });
  }
  return out;
}

/** Fetch a course file's raw bytes (e.g. to scan a PDF). */
export async function getCanvasFileBuffer(courseUrl: string, fileId: number, code?: string): Promise<Buffer> {
  const ctx = resolveCourse(courseUrl, code);
  const { buffer } = await fetchCanvasFile(ctx, fileId);
  return buffer;
}

/** Read a PDF's current language + title (to prefill the PDF fix editor). */
export async function getPdfMeta(
  courseUrl: string,
  fileId: number,
  code?: string
): Promise<{ lang: string; title: string }> {
  const ctx = resolveCourse(courseUrl, code);
  const { buffer } = await fetchCanvasFile(ctx, fileId);
  return readPdfMeta(buffer);
}

/** Set a PDF's language/title, overwrite it in Canvas, and return its remaining issues. */
export async function savePdfFixes(
  courseUrl: string,
  fileId: number,
  fixes: { lang?: string; title?: string },
  code?: string
): Promise<Issue[]> {
  const ctx = resolveCourse(courseUrl, code);
  const { meta, buffer } = await fetchCanvasFile(ctx, fileId);
  const edited = await setPdfAccessibility(buffer, fixes);
  await overwriteCanvasFile({ ...ctx, courseId: ctx.courseId }, meta, edited);
  return scanPdf(edited);
}

/** Read a file's images + current alt text (for the office alt remediation editor). */
export async function getOfficeFileImages(courseUrl: string, fileId: number, code?: string): Promise<OfficeImage[]> {
  const ctx = resolveCourse(courseUrl, code);
  const { meta, buffer } = await fetchCanvasFile(ctx, fileId);
  if (!meta.kind) return [];
  return extractOfficeImages(meta.kind, buffer);
}

/** Read a file's images with their bytes (data URLs) for the alt editor's previews. */
export async function getOfficeFileImagesWithData(
  courseUrl: string,
  fileId: number,
  code?: string
): Promise<Array<OfficeImage & { mimeType?: string; base64?: string }>> {
  const ctx = resolveCourse(courseUrl, code);
  const { meta, buffer } = await fetchCanvasFile(ctx, fileId);
  if (!meta.kind) return [];
  return extractOfficeImagesWithData(meta.kind, buffer);
}

/** Full accessibility analysis of an Office file (images + docx headings/title). */
export async function getOfficeFileScan(
  courseUrl: string,
  fileId: number,
  code?: string
): Promise<{ kind: OfficeKind; images: OfficeImage[]; hasHeadings: boolean; title: string } | null> {
  const ctx = resolveCourse(courseUrl, code);
  const { meta, buffer } = await fetchCanvasFile(ctx, fileId);
  if (!meta.kind) return null;
  return { kind: meta.kind, ...(await analyzeOfficeFile(meta.kind, buffer)) };
}

/** Read one image's bytes (base64 + mime) from an Office file, for vision alt text. */
export async function getOfficeFileImageData(
  courseUrl: string,
  fileId: number,
  imageId: string,
  code?: string
): Promise<{ mimeType: string; base64: string } | null> {
  const ctx = resolveCourse(courseUrl, code);
  const { meta, buffer } = await fetchCanvasFile(ctx, fileId);
  if (!meta.kind) return null;
  return extractOfficeImageData(meta.kind, buffer, imageId);
}

/**
 * Apply a batch of fixes (title, heading styles, image alt text) to an Office
 * file in a single Canvas round-trip and return the post-fix analysis (so the
 * caller can report any issues that remain). Used by the headless auto-fix.
 */
export async function saveOfficeFileFixes(
  courseUrl: string,
  fileId: number,
  fixes: {
    title: string | null;
    sections: Array<{ sourceId: string; spans: RunSpan[]; style?: string }>;
    altEdits: Record<string, string>;
  },
  code?: string
): Promise<{ kind: OfficeKind; images: OfficeImage[]; hasHeadings: boolean; title: string }> {
  const ctx = resolveCourse(courseUrl, code);
  const { meta, buffer } = await fetchCanvasFile(ctx, fileId);
  if (!meta.kind) throw new Error("Only Word (.docx) and PowerPoint (.pptx) files can be edited here.");
  let edited = buffer;
  if (fixes.sections.length) edited = await applyOfficeSections(meta.kind, edited, fixes.sections);
  if (fixes.title != null && meta.kind === "docx") edited = await setDocxTitle(edited, fixes.title);
  if (Object.keys(fixes.altEdits).length) edited = await setOfficeImageAlt(meta.kind, edited, fixes.altEdits);
  await overwriteCanvasFile({ ...ctx, courseId: ctx.courseId }, meta, edited);
  return { kind: meta.kind, ...(await analyzeOfficeFile(meta.kind, edited)) };
}
