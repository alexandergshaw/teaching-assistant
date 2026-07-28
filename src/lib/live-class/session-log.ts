// Deterministic PLAIN TEXT (not markdown) rendering of a live-class session
// (D1), for two consumers: the "Download log" control in the live-class
// window (available both mid-session and after class ends) and the .txt
// artifact saved to the Files tab alongside the existing end-of-class Word
// document (D3 - additive, never a replacement for it).
//
// This reuses the SAME LiveSessionState data buildSessionMarkdown (./
// session.ts) renders into the docx, and the same formatOffset/
// transcriptText helpers - this module re-shapes that data into plain text,
// it never re-derives anything from raw session data. No React, no Node
// built-ins, no "use server", no Date.now()/Math.random() inside this
// module - every timestamp is a parameter, so this stays deterministic and
// testable, mirroring session.ts's own header comment.

import { formatOffset, transcriptText, type AnsweredQuestion, type LiveSessionState } from "./session";

const SECTION_RULE = "----------------------------------------";

export interface SessionLogMeta {
  courseName?: string;
  moduleName?: string;
  startedAt: Date;
  /** The session's real end time, once it has ended. Undefined/null for a
   * mid-class download (D2) - the header then reports "still running" and
   * elapsed is computed against `nowMs` instead. */
  endedAt?: Date | null;
  /** Wall-clock time to compute "elapsed" against when `endedAt` is not set.
   * Ignored once `endedAt` is set (elapsed is then endedAt - startedAt).
   * Always a parameter - never Date.now() inside this module. */
  nowMs?: number;
}

/** A session snapshot bundled with the metadata needed to render it - what
 * useLiveSessionPersistence.getSessionSnapshot() hands back, so the
 * "Download log" control and the end-of-class save both build from the same
 * shape. */
export interface SessionLogSnapshot {
  state: LiveSessionState;
  meta: SessionLogMeta;
}

function questionAnswerBlock(qa: AnsweredQuestion): string[] {
  const lines: string[] = [];
  lines.push(`Q: ${qa.question}`);
  lines.push(`Asked: [${formatOffset(qa.askedAtMs)}]   Answered: [${formatOffset(qa.answeredAtMs)}]`);
  lines.push(`Grounded in course material: ${qa.grounded ? "Yes" : "No"}`);
  lines.push("A:");

  // The answer's own "- " bullet lines (see buildAnswerPrompt in
  // src/app/actions/live-class.ts) are preserved as separate lines, exactly
  // as they arrived - this is plain text, not markdown, so there is no
  // syntax to render, only whitespace to tidy up.
  const answerLines = (qa.answer || "").split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of answerLines.length > 0 ? answerLines : ["No answer was recorded."]) {
    lines.push(line);
  }

  const links = qa.links ?? [];
  if (links.length > 0) {
    lines.push("Links:");
    for (const link of links) {
      const label = (link.label ?? "").trim() || link.url;
      lines.push(`  ${label} - ${link.url}`);
    }
  }

  const sources = qa.sources ?? [];
  if (sources.length > 0) {
    lines.push("Sources:");
    for (const source of sources) {
      lines.push(`  ${source}`);
    }
  }

  return lines;
}

/**
 * Build the downloadable/saved plain-text session log: a header (course,
 * module, session start, session end or "still running", elapsed, and
 * counts of transcript segments and answered questions), a QUESTIONS AND
 * ANSWERS section (one block per answered question - asked/answered
 * offsets, the question, the answer with its bullets preserved as lines,
 * whether it was grounded, its links as "label - url" lines, and its
 * sources - plus any still-pending question listed rather than omitted),
 * and a FULL TRANSCRIPT section with `[mm:ss]` prefixed lines.
 *
 * Deterministic: every timestamp comes from `state`/`meta`, never
 * Date.now() inside this function.
 */
export function buildSessionLogText(state: LiveSessionState, meta: SessionLogMeta): string {
  const lines: string[] = [];

  const titleParts = [meta.courseName, meta.moduleName].map((p) => (p ?? "").trim()).filter(Boolean);
  lines.push(titleParts.length > 0 ? `LIVE CLASS SESSION LOG - ${titleParts.join(" - ")}` : "LIVE CLASS SESSION LOG");
  lines.push(SECTION_RULE);
  lines.push("");

  const endedAt = meta.endedAt ?? null;
  const endMs = endedAt ? endedAt.getTime() : (meta.nowMs ?? meta.startedAt.getTime());
  const elapsedMs = Math.max(0, endMs - meta.startedAt.getTime());

  lines.push(`Course: ${meta.courseName?.trim() || "Unspecified"}`);
  lines.push(`Module: ${meta.moduleName?.trim() || "Unspecified"}`);
  lines.push(`Session started: ${meta.startedAt.toISOString()}`);
  lines.push(`Session ended: ${endedAt ? endedAt.toISOString() : "still running"}`);
  lines.push(`Elapsed: ${formatOffset(elapsedMs)}`);
  lines.push(`Transcript segments: ${state.segments.length}`);
  lines.push(`Questions answered: ${state.answered.length}`);
  lines.push("");

  lines.push("QUESTIONS AND ANSWERS");
  lines.push(SECTION_RULE);
  lines.push("");

  if (state.answered.length === 0) {
    lines.push("No questions were answered during this session.");
    lines.push("");
  } else {
    state.answered.forEach((qa, i) => {
      lines.push(...questionAnswerBlock(qa));
      if (i < state.answered.length - 1) lines.push("");
    });
    lines.push("");
  }

  // An unanswered/pending question is listed rather than silently dropped -
  // it was asked, the class heard it, and the instructor's kept record
  // should say so even though no answer ever landed for it.
  const pending = state.pending ?? [];
  if (pending.length > 0) {
    lines.push("Pending questions (not yet answered when this log was generated):");
    for (const q of pending) {
      lines.push(`  Q: ${q.text} (asked [${formatOffset(q.atMs)}])`);
    }
    lines.push("");
  }

  lines.push("FULL TRANSCRIPT");
  lines.push(SECTION_RULE);
  lines.push("");
  const transcript = transcriptText(state.segments);
  lines.push(transcript || "No transcript recorded.");

  return lines.join("\n").trim();
}
