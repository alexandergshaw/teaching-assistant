// Pure session-state shaping for live-class mode, used by both the UI (to
// render the live transcript/Q&A panel) and the persistence layer (to save
// incremental transcript syncs and the end-of-class artifact). No React, no
// Node built-ins, no "use server", no Date.now()/Math.random() - every
// timestamp and id is a parameter, so this stays deterministic and testable.
//
// The end-of-class document this module builds (`buildSessionMarkdown`) is
// rendered by `buildDocxFromPlainText` in ../docx.ts, whose line-level syntax
// is defined in ../docx-blocks.ts: "#"/"##"/"###" headings, "- " bullets at
// column 0, a two-space indent for a nested bullet, and "[text](url)" for a
// link. Only that syntax is emitted below.

import type { DetectedQuestion } from "./questions";

/** One line of the live transcript. */
export interface TranscriptSegment {
  id: string;
  text: string;
  atMs: number;
  speaker?: string;
}

/** A question that was detected, answered, and recorded. */
export interface AnsweredQuestion {
  id: string;
  question: string;
  answer: string;
  askedAtMs: number;
  answeredAtMs: number;
  grounded: boolean;
  sources?: string[];
}

/** The full state of one live-class session. */
export interface LiveSessionState {
  startedAtMs: number;
  segments: TranscriptSegment[];
  answered: AnsweredQuestion[];
  pending: DetectedQuestion[];
}

/**
 * Immutably append a transcript segment. Ignores a segment whose text is
 * empty after trimming, and ignores an exact duplicate id (already present
 * in `state.segments`) - both are no-ops that return `state` unchanged.
 */
export function appendSegment(state: LiveSessionState, seg: TranscriptSegment): LiveSessionState {
  const text = typeof seg?.text === "string" ? seg.text : "";
  if (!text.trim()) return state;
  if (state.segments.some((s) => s.id === seg.id)) return state;
  return { ...state, segments: [...state.segments, seg] };
}

/**
 * Format an elapsed-milliseconds offset as `mm:ss`, or `hh:mm:ss` once it
 * passes an hour. Always zero-padded, never negative.
 */
export function formatOffset(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Join transcript segments into one block of text, each line prefixed with
 * its `[mm:ss]` (or `[hh:mm:ss]`) offset from the session start.
 */
export function transcriptText(segments: TranscriptSegment[]): string {
  return segments.map((s) => `[${formatOffset(s.atMs)}] ${s.text}`).join("\n");
}

/**
 * Everything in `segments` after the one with id `lastSyncedId` - or all of
 * them when `lastSyncedId` is null or not found in the list. This is what
 * makes persistence an incremental append rather than resending the whole
 * transcript on every sync, which matters because of the 10MB server-action
 * request body cap (next.config.ts experimental.serverActions.bodySizeLimit).
 */
export function unsyncedSegments(
  segments: TranscriptSegment[],
  lastSyncedId: string | null
): TranscriptSegment[] {
  if (!Array.isArray(segments)) return [];
  if (lastSyncedId === null || lastSyncedId === undefined) return segments;
  const idx = segments.findIndex((s) => s.id === lastSyncedId);
  if (idx === -1) return segments;
  return segments.slice(idx + 1);
}

/** Render one recorded source as a bullet line: a real link when it looks like a URL, plain text otherwise. */
function sourceBulletText(source: string): string {
  const trimmed = (source ?? "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return `[${trimmed}](${trimmed})`;
  return trimmed;
}

/**
 * Build the end-of-class markdown artifact: a title, a metadata block, a
 * `## Questions and answers` section (one `### <question>` heading per
 * answered question, its answer, and any recorded sources as a nested bullet
 * list), and a `## Full transcript` section with the timestamped transcript.
 * The Questions section is omitted entirely when nothing was answered.
 */
export function buildSessionMarkdown(
  state: LiveSessionState,
  meta: { courseName?: string; moduleName?: string; startedAt: Date }
): string {
  const titleParts = [meta.courseName, meta.moduleName].map((p) => (p ?? "").trim()).filter(Boolean);
  const title = titleParts.length > 0 ? `# Class session - ${titleParts.join(" ")}` : "# Class session";

  const lines: string[] = [];
  lines.push(title);
  lines.push("");
  lines.push(`Course: ${meta.courseName?.trim() || "Unspecified"}`);
  lines.push(`Module: ${meta.moduleName?.trim() || "Unspecified"}`);
  lines.push(`Started: ${meta.startedAt.toISOString()}`);
  lines.push("");

  if (state.answered.length > 0) {
    lines.push("## Questions and answers");
    lines.push("");
    for (const qa of state.answered) {
      lines.push(`### ${qa.question}`);
      lines.push("");
      lines.push(qa.answer || "No answer was recorded.");
      lines.push("");

      const sourceLines = (qa.sources ?? []).map(sourceBulletText).filter(Boolean);
      if (sourceLines.length > 0) {
        lines.push("- Sources");
        for (const line of sourceLines) lines.push(`  - ${line}`);
        lines.push("");
      }
    }
  }

  lines.push("## Full transcript");
  lines.push("");
  const transcript = transcriptText(state.segments);
  lines.push(transcript || "No transcript recorded.");

  return lines.join("\n").trim();
}
