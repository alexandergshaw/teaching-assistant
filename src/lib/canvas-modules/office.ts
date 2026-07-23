import { canvasError, resolveCourse } from "../canvas-core";
import {
  parseOfficeParagraphs,
  applyOfficeSections,
  appendDocxParagraph,
  setOfficeImageAlt,
  extractDocxTitle,
  setDocxTitle,
  type OfficeKind,
  type OfficeParagraph,
  type RunSpan,
} from "../office-edit";
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

/** Fetch a Canvas file's metadata + bytes, classifying it as docx/pptx if it is. */
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

/** Load a docx/pptx file's editable paragraphs. */
export async function getOfficeEditable(
  courseUrl: string,
  fileId: number,
  code?: string
): Promise<{ name: string; kind: OfficeKind; paragraphs: OfficeParagraph[] }> {
  const ctx = resolveCourse(courseUrl, code);
  const { meta, buffer } = await fetchCanvasFile(ctx, fileId);
  if (!meta.kind) {
    throw new Error("Only Word (.docx) and PowerPoint (.pptx) files can be edited here.");
  }
  const paragraphs = await parseOfficeParagraphs(meta.kind, buffer);
  return { name: meta.name, kind: meta.kind, paragraphs };
}

/** Apply paragraph edits to a docx/pptx file and overwrite it in Canvas. */
export async function saveOfficeEdits(
  courseUrl: string,
  fileId: number,
  sections: Array<{ sourceId: string; spans: RunSpan[]; style?: string }>,
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  const { meta, buffer } = await fetchCanvasFile(ctx, fileId);
  if (!meta.kind) {
    throw new Error("Only Word (.docx) and PowerPoint (.pptx) files can be edited here.");
  }
  const edited = await applyOfficeSections(meta.kind, buffer, sections);
  await overwriteCanvasFile({ ...ctx, courseId: ctx.courseId }, meta, edited);
}

/** Append a paragraph (spans + style) to the end of a target .docx in Canvas. */
export async function appendOfficeParagraph(
  courseUrl: string,
  fileId: number,
  spans: RunSpan[],
  style: string,
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  const { meta, buffer } = await fetchCanvasFile(ctx, fileId);
  if (meta.kind !== "docx") throw new Error("Sections can only be moved into a Word (.docx) file.");
  const edited = await appendDocxParagraph(buffer, spans, style);
  await overwriteCanvasFile({ ...ctx, courseId: ctx.courseId }, meta, edited);
}

/** Load a docx's paragraphs + current title (for the document-structure fix editor). */
export async function getOfficeFileStructure(
  courseUrl: string,
  fileId: number,
  code?: string
): Promise<{ name: string; title: string; paragraphs: OfficeParagraph[] } | null> {
  const ctx = resolveCourse(courseUrl, code);
  const { meta, buffer } = await fetchCanvasFile(ctx, fileId);
  if (meta.kind !== "docx") return null;
  const [paragraphs, title] = await Promise.all([parseOfficeParagraphs("docx", buffer), extractDocxTitle(buffer)]);
  return { name: meta.name, title, paragraphs };
}

/**
 * Set a docx's title and/or paragraph heading styles in one Canvas round-trip
 * (fixes the "missing title" / "no headings" accessibility flags). `title` is
 * skipped when null; `sections` is the full paragraph list (as the office editor
 * sends it) and is skipped when empty.
 */
export async function saveOfficeFileStructure(
  courseUrl: string,
  fileId: number,
  title: string | null,
  sections: Array<{ sourceId: string; spans: RunSpan[]; style?: string }>,
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  const { meta, buffer } = await fetchCanvasFile(ctx, fileId);
  if (meta.kind !== "docx") throw new Error("Only Word (.docx) files have a document title and headings.");
  let edited = buffer;
  if (sections.length) edited = await applyOfficeSections("docx", edited, sections);
  if (title != null) edited = await setDocxTitle(edited, title);
  await overwriteCanvasFile({ ...ctx, courseId: ctx.courseId }, meta, edited);
}

/** Write alt text onto a file's images by id and overwrite the file in Canvas. */
export async function saveOfficeFileImageAlt(
  courseUrl: string,
  fileId: number,
  edits: Record<string, string>,
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  const { meta, buffer } = await fetchCanvasFile(ctx, fileId);
  if (!meta.kind) throw new Error("Only Word (.docx) and PowerPoint (.pptx) files can be edited here.");
  const edited = await setOfficeImageAlt(meta.kind, buffer, edits);
  await overwriteCanvasFile({ ...ctx, courseId: ctx.courseId }, meta, edited);
}
