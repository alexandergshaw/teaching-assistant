import { sanitizePreviousAnnouncementHtml } from "@/lib/announcement-library-rich-text";
import { markdownToHtml } from "@/lib/markdown";

/** One allowlisted representation is used by the editor, preview and Canvas. */
export function sanitizeRecordingAnnouncementHtml(value: string): string {
  return sanitizePreviousAnnouncementHtml(value ?? "");
}

/** Model drafts arrive as Markdown; the editor and saved value use HTML. */
export function recordingDraftToHtml(markdown: string): string {
  return sanitizeRecordingAnnouncementHtml(markdownToHtml(markdown));
}

/** Prefer safe rich clipboard content, with a plain-text fallback. */
export function recordingClipboardContent(html: string, text: string): { command: "insertHTML" | "insertText"; value: string } {
  const safe = html ? sanitizeRecordingAnnouncementHtml(html) : "";
  return safe.trim() ? { command: "insertHTML", value: safe } : { command: "insertText", value: text };
}