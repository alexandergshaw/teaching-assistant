// Builds the single instruction string draftAnnouncementAction
// (src/app/actions/messaging.ts:405) needs to draft a subject and body from a
// recorded take's transcript. draftAnnouncementAction takes ONE instruction
// string - it does not know about takes, transcripts or recordings - so the
// transcript, the recording's own context and a standing framing instruction
// are composed into that string here, in a pure, dependency-free, testable
// function, rather than inline where the action is called.
//
// No React, no browser API, no "use server": safe to import from a client
// hook and to unit test in Node.

/**
 * Cap on how much of the transcript reaches the drafting prompt, in
 * characters. Same value and same rationale as MODULE_MATERIALS_CAP
 * (src/lib/announcement-module-content.ts:30): a 40-minute recording
 * produces roughly 6000 words of transcript - well past any sensible prompt -
 * and an unbounded transcript is how a draft call starts failing on
 * MAX_OUTPUT_TOKENS for reasons nobody can see. Do not raise this without a
 * reason.
 */
export const TRANSCRIPT_PROMPT_CAP = 8000;

const TRUNCATION_MARKER = " [transcript truncated]";

/**
 * The standing instruction, included verbatim in every built prompt so a
 * wording change is a one-line diff here rather than an edit inside a
 * component.
 */
export const TAKE_ANNOUNCEMENT_INSTRUCTION =
  "Write a short announcement for students about this recording. Link the recording's purpose to what they should do next. Do not summarize the video minute by minute.";

export interface TakeAnnouncementContext {
  takeName: string;
  durationSec: number;
  topic?: string;
  objectives?: string;
  cardTitle?: string;
  cardSubtitle?: string;
}

/**
 * Truncates `transcript` to at most `cap` characters (default
 * TRANSCRIPT_PROMPT_CAP), cutting at a word boundary rather than mid-word,
 * and appending a trailing marker so both the model and a human reading the
 * prompt know the transcript was cut. A transcript already at or under the
 * cap is returned completely unchanged - no trim, no marker.
 *
 * The marker's own length is reserved out of the cap up front, so the
 * returned string never exceeds `cap` - a truncation that busts its own
 * limit would defeat the point (same reasoning as formatModuleMaterials in
 * src/lib/announcement-module-content.ts, which this mirrors for the cap
 * arithmetic but not for the cut point - that function cuts at a raw
 * character boundary, which is wrong for a spoken transcript being read by a
 * model as prose).
 */
export function truncateTranscriptForPrompt(transcript: string, cap: number = TRANSCRIPT_PROMPT_CAP): string {
  if (transcript.length <= cap) return transcript;

  const keep = Math.max(0, cap - TRUNCATION_MARKER.length);
  let cut = transcript.slice(0, keep);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > 0) {
    cut = cut.slice(0, lastSpace);
  }
  return cut + TRUNCATION_MARKER;
}

function formatDuration(durationSec: number): string {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return "an unknown length";
  const totalSeconds = Math.round(durationSec);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  if (seconds === 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return `${minutes} minute${minutes === 1 ? "" : "s"} ${seconds} second${seconds === 1 ? "" : "s"}`;
}

/**
 * Composes the transcript, the recording's context, and the standing
 * instruction into the ONE instruction string draftAnnouncementAction takes.
 *
 * Ordering is pinned (standing instruction first, framing and context next,
 * transcript last) because it is what a reader of the prompt - and any
 * future prompt-debugging session - relies on; the exact prose is not, since
 * this repo has twice had a source-text assertion force a contorted
 * implementation to satisfy an over-specified test.
 */
export function buildTakeAnnouncementInstruction(transcript: string, context: TakeAnnouncementContext): string {
  const truncated = truncateTranscriptForPrompt(transcript);

  const lines: string[] = [
    TAKE_ANNOUNCEMENT_INSTRUCTION,
    "",
    `This is a transcript of a screen recording titled "${context.takeName}" (${formatDuration(context.durationSec)} long), made by an instructor for their students. Draft the announcement from this transcript - it is source material, not the announcement itself.`,
  ];

  if (context.topic && context.topic.trim()) {
    lines.push(`Course topic: ${context.topic.trim()}`);
  }
  if (context.objectives && context.objectives.trim()) {
    lines.push(`Learning objectives: ${context.objectives.trim()}`);
  }
  if (context.cardTitle && context.cardTitle.trim()) {
    lines.push(`Recording title card: ${context.cardTitle.trim()}`);
  }
  if (context.cardSubtitle && context.cardSubtitle.trim()) {
    lines.push(`Recording subtitle card: ${context.cardSubtitle.trim()}`);
  }

  lines.push("", "TRANSCRIPT:", truncated);

  return lines.join("\n");
}
