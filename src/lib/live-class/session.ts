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
//
// An answer's text is itself now a bulleted list ("- " lines - see
// buildAnswerPrompt in src/app/actions/live-class.ts), and is written into
// this document verbatim (unchanged from before): because the whole document
// is one string joined with "\n" and fed line-by-line into
// buildDocxFromPlainText, an answer's own embedded "- " lines already render
// as a real Word list with no extra handling needed here. What DOES need
// explicit handling is the answer's resolved links (AnswerLink, from
// ./links.ts) - the panel shows them, so the saved document must too, or the
// instructor's kept record silently drops what the class actually saw. See
// buildSessionMarkdown's own comment for how.

import type { DetectedQuestion } from "./questions";
import type { AnswerLink } from "./links";

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
  /** Links resolved by code from the model's named concepts (see
   * ./links.ts). Optional so any existing construction of this type (a
   * session recorded before this field existed, or one with no resolved
   * links) keeps compiling and mapping cleanly. */
  links?: AnswerLink[];
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
 * transcript on every sync, which matters because a server action's request
 * body is capped at 4.5MB at the Vercel Functions PLATFORM layer - see
 * src/lib/chat/attachments.ts's header comment for the fullest statement of
 * this constraint (next.config.ts's serverActions.bodySizeLimit cannot
 * raise it).
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

/** Render one resolved AnswerLink as a `[label](url)` markdown link, mirroring
 * sourceBulletText's shape - the label (never the raw url) is the visible
 * text, so buildDocxFromPlainText renders a real hyperlink whose display text
 * reads like "Python documentation" rather than a wall of raw URLs (the
 * current-events report's own fix for the same underlying problem). Falls
 * back to the url itself only if a link somehow arrives with no label. */
function linkBulletText(link: AnswerLink): string {
  const url = (link?.url ?? "").trim();
  if (!url) return "";
  const label = (link?.label ?? "").trim() || url;
  return `[${label}](${url})`;
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

      // Mirrors the Sources bullet immediately above: a parent bullet, each
      // resolved link two-space-indented beneath it as a `[label](url)`
      // markdown link. Omitted entirely (no empty "- Links" heading) when the
      // answer has none.
      const linkLines = (qa.links ?? []).map(linkBulletText).filter(Boolean);
      if (linkLines.length > 0) {
        lines.push("- Links");
        for (const line of linkLines) lines.push(`  - ${line}`);
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
