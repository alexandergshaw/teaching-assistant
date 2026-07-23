import { canvasError, resolveCourse } from "../canvas-core";
import { fetchAll } from "./fetch-helpers";
import { createModuleItem } from "./module-items";
import type { CanvasModuleItem, CourseFile, FileUploadTicket } from "./types";
import type { RawCourseFile } from "./raw-types";

/**
 * Step 1 of the Canvas file upload: tell Canvas about the incoming file and get
 * back a pre-signed upload URL + params. The browser then POSTs the file bytes
 * straight to that URL (step 2), so large files never pass through our server
 * and the API token is never exposed to the client.
 */
export async function requestFileUpload(
  courseUrl: string,
  file: { name: string; size: number; contentType?: string; folderPath?: string },
  code?: string
): Promise<FileUploadTicket> {
  const ctx = resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  params.append("name", file.name);
  params.append("size", String(file.size));
  if (file.contentType) params.append("content_type", file.contentType);
  params.append("parent_folder_path", file.folderPath?.trim() || "uploads");
  params.append("on_duplicate", "rename");

  const response = await fetch(`${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!response.ok) {
    throw canvasError(response.status, ctx.institution);
  }
  const data = (await response.json()) as {
    upload_url?: string;
    upload_params?: Record<string, string>;
  };
  if (!data.upload_url || !data.upload_params) {
    throw new Error("Canvas did not return an upload URL.");
  }
  return { uploadUrl: data.upload_url, uploadParams: data.upload_params };
}

/** List every file in the course (paginated), newest first. */
export async function listCourseFiles(courseUrl: string, code?: string): Promise<CourseFile[]> {
  const ctx = resolveCourse(courseUrl, code);
  const raw = await fetchAll<RawCourseFile>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/files?per_page=100&sort=updated_at&order=desc`,
    ctx
  );
  return raw
    .filter((f) => typeof f.id === "number")
    .map((f) => ({
      id: f.id!,
      displayName: (f.display_name ?? f.filename ?? `File ${f.id}`).trim() || `File ${f.id}`,
      fileName: (f.filename ?? f.display_name ?? "").trim(),
      contentType: f["content-type"] ?? "application/octet-stream",
      size: typeof f.size === "number" ? f.size : 0,
      url: f.url ?? "",
      folderId: f.folder_id ?? null,
      updatedAt: f.updated_at ?? null,
    }));
}

/** Rename a course file (its display name). */
export async function renameCourseFile(
  courseUrl: string,
  fileId: number,
  name: string,
  code?: string
): Promise<void> {
  if (!name.trim()) throw new Error("A file needs a name.");
  const ctx = resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  params.append("name", name.trim());
  const response = await fetch(`${ctx.baseUrl}/api/v1/files/${fileId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) {
    throw canvasError(response.status, ctx.institution);
  }
}

/** Delete a course file. */
export async function deleteCourseFile(courseUrl: string, fileId: number, code?: string): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  const response = await fetch(`${ctx.baseUrl}/api/v1/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  if (!response.ok) {
    throw canvasError(response.status, ctx.institution);
  }
}

/**
 * Upload a file (base64) into a course and add it to a module at `position`
 * (1-based; omit for the end). Returns the created module item. Used to drop a
 * generated syllabus straight into a course's module.
 */
export async function uploadFileToModule(
  courseUrl: string,
  base64: string,
  fileName: string,
  contentType: string,
  moduleId: number,
  position?: number,
  code?: string
): Promise<CanvasModuleItem> {
  const ctx = resolveCourse(courseUrl, code);
  const buffer = Buffer.from(base64, "base64");

  const params = new URLSearchParams();
  params.append("name", fileName);
  params.append("size", String(buffer.byteLength));
  params.append("content_type", contentType);
  params.append("parent_folder_path", "uploads");
  params.append("on_duplicate", "rename");
  const presign = await fetch(`${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!presign.ok) throw canvasError(presign.status, ctx.institution);
  const ticket = (await presign.json()) as { upload_url?: string; upload_params?: Record<string, string> };
  if (!ticket.upload_url || !ticket.upload_params) throw new Error("Canvas did not return an upload URL.");

  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.upload_params)) form.append(key, value);
  form.append("file", new Blob([new Uint8Array(buffer)], { type: contentType }), fileName);
  const upload = await fetch(ticket.upload_url, { method: "POST", body: form });
  if (!upload.ok) throw new Error(`Upload to Canvas failed (HTTP ${upload.status}).`);
  const uploaded = (await upload.json().catch(() => null)) as { id?: number } | null;
  if (typeof uploaded?.id !== "number") throw new Error("Canvas did not return the uploaded file id.");

  return createModuleItem(courseUrl, moduleId, { type: "File", contentId: uploaded.id, title: fileName, position }, code);
}
