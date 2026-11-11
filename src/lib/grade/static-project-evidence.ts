import { isStaticProjectText } from "./static-project-text";
import type { StudentSubmissionEntry } from "./types";
import { MAX_STATIC_PROJECT_CONTENT_CHARS } from "./static-project-limits";

/** Restore every static text file from its bounded original bytes, or refuse the entire entry. */
export function restoreStaticTextEvidence(entry: StudentSubmissionEntry): StudentSubmissionEntry | null {
  if (!entry.staticOnly) return entry.submittedFiles.some((file) => file.staticTextMarker !== undefined) ? null : entry;
  const replacements: Array<{ marker: string; text: string }> = [], markers = new Set<string>();
  for (const file of entry.submittedFiles) {
    const isText = isStaticProjectText(file.extension);
    if (!isText) { if (file.staticTextMarker !== undefined) return null; continue; }
    const marker = file.staticTextMarker, raw = file.rawBase64;
    if (typeof marker !== "string" || !/^\[\[STATIC_TEXT_\d{1,5}\]\]$/.test(marker) || markers.has(marker) || typeof raw !== "string" || !raw || raw.length > 4_000_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw)) return null;
    markers.add(marker);
    try {
      const binary = atob(raw), bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!text || entry.content.indexOf(marker) < 0 || entry.content.indexOf(marker) !== entry.content.lastIndexOf(marker)) return null;
      replacements.push({ marker, text });
    } catch { return null; }
  }
  if (replacements.some(({ text }) => replacements.some(({ marker }) => text.includes(marker)))) return null;
  let content = entry.content;
  for (const { marker, text } of replacements) {
    if (content.length - marker.length + text.length > MAX_STATIC_PROJECT_CONTENT_CHARS) return null;
    content = content.replace(marker, () => text);
  }
  return { ...entry, content };
}
