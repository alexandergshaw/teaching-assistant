import { VIDEO_EXTENSIONS } from "../grade/constants";

export type OmittedCanvasVideo = { name: string; reason: string };

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

export function canvasVideoRefusal(students: readonly { student: string; files: Array<{ name: string; mimeType: string }>; omittedVideos?: OmittedCanvasVideo[] }[]): string | null {
  for (const student of students) {
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
