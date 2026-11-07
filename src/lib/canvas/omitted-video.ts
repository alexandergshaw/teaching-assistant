import { VIDEO_EXTENSIONS } from "../grade/constants";

export type OmittedCanvasVideo = { name: string; reason: string };
export const OMITTED_CANVAS_ATTACHMENT_MIME = "application/x-canvas-attachment-unavailable";
export const UNREADABLE_CANVAS_ATTACHMENT_MIME = "application/x-canvas-attachment-unreadable";

export function safeCanvasLabel(value: string): string {
  return value.replace(/https?:\/\/\S+/gi, "[link]").replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 160) || "unnamed";
}

type Attachment = { id?: number; filename?: string; display_name?: string; "content-type"?: string };

/** Record inaccessible video without inventing file bytes. */
export function noteOmittedCanvasVideo(target: OmittedCanvasVideo[], attachment: Attachment, reason: string): void {
  const rawName = attachment.filename || attachment.display_name || `attachment-${attachment.id ?? "unknown"}`;
  const name = safeCanvasLabel(rawName);
  const videoName = [attachment.filename, attachment.display_name].some((value) => VIDEO_EXTENSIONS.has((value ?? "").trim().split(".").pop()?.toLowerCase() ?? ""));
  const mime = (attachment["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
  if (videoName || mime.startsWith("video/")) target.push({ name, reason });
}

export function noteOmittedCanvasAttachment(videos: OmittedCanvasVideo[], others: OmittedCanvasVideo[], attachment: Attachment, reason: string): void {
  const before = videos.length;
  noteOmittedCanvasVideo(videos, attachment, reason);
  if (videos.length === before) others.push({ name: safeCanvasLabel(attachment.filename || attachment.display_name || `attachment-${attachment.id ?? "unknown"}`), reason });
}
export function canvasVideoRefusal(students: readonly { student: string; files: Array<{ name: string; mimeType: string }>; omittedVideos?: OmittedCanvasVideo[]; omittedAttachments?: OmittedCanvasVideo[] }[]): string | null {
  for (const student of students) {
    const missing = student.omittedAttachments?.[0];
    if (missing) return `Attachment "${safeCanvasLabel(missing.name)}" for ${safeCanvasLabel(student.student)} could not be downloaded (${safeCanvasLabel(missing.reason)}). No grade was produced.`;
    const missingFile = student.files.find((file) => file.mimeType === OMITTED_CANVAS_ATTACHMENT_MIME);
    if (missingFile) return `Attachment "${safeCanvasLabel(missingFile.name)}" for ${safeCanvasLabel(student.student)} could not be downloaded. No grade was produced.`;
    const unreadable = student.files.find((file) => file.mimeType === UNREADABLE_CANVAS_ATTACHMENT_MIME);
    if (unreadable) return `Attachment "${safeCanvasLabel(unreadable.name)}" for ${safeCanvasLabel(student.student)} could not be read. No grade was produced.`;
    const omitted = student.omittedVideos?.[0];
    if (omitted) return `Video "${safeCanvasLabel(omitted.name)}" for ${safeCanvasLabel(student.student)} could not be downloaded (${safeCanvasLabel(omitted.reason)}). No grade was produced.`;
    const found: OmittedCanvasVideo[] = [];
    for (const file of student.files) noteOmittedCanvasVideo(found, { filename: file.name, "content-type": file.mimeType }, "video requires direct upload");
    if (found.length) return `Video "${found[0].name}" for ${safeCanvasLabel(student.student)} requires direct upload to grading chat. No grade was produced.`;
  }
  return null;
}

export function canvasAttachmentMime(attachment: Attachment): string {
  const candidates: OmittedCanvasVideo[] = [];
  noteOmittedCanvasVideo(candidates, attachment, "unavailable");
  const mime = attachment["content-type"] || "application/octet-stream";
  return candidates.length && !mime.trim().toLowerCase().startsWith("video/") ? "video/unknown" : mime;
}

export function canvasOmissionIdentityRefusal(students: readonly { student: string; userId: number; files: Array<{ name: string; mimeType: string }>; omittedVideos?: OmittedCanvasVideo[]; omittedAttachments?: OmittedCanvasVideo[] }[]): string | null {
  if (!canvasVideoRefusal(students)) return null;
  const ids = students.map((student) => student.userId);
  return ids.some((id) => !Number.isSafeInteger(id) || id < 0) || new Set(ids).size !== ids.length
    ? "Canvas submission identities are missing or duplicated; no grades were produced."
    : null;
}