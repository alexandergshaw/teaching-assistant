// Shared types for the Live Class Mode UI. No React here - just the shapes
// the container, hooks, and panels pass between each other.

import type { TranscriptionOverride, TranscriptionPath } from "./live-class-logic";

export type { TranscriptionOverride, TranscriptionPath };

/** One line of the live transcript, as rendered in the UI (mirrors
 * TranscriptSegment from src/lib/live-class/session.ts, plus the `final`
 * flag questions.ts's Utterance needs). */
export interface LiveTranscriptEntry {
  id: string;
  text: string;
  atMs: number;
  final: boolean;
}

/** One answered question, as rendered in the UI. */
export interface LiveAnswerEntry {
  id: string;
  question: string;
  answer: string;
  askedAtMs: number;
  answeredAtMs: number;
  grounded: boolean;
  sources: string[];
  /** True once the instructor dismisses it from the live panel. The answer
   * was already asked and (if it saved in time) persisted to the session
   * record - dismissing only declutters the live view, it never deletes
   * anything already recorded. */
  dismissed: boolean;
}

/** A course tile, as offered by the course picker (U2). */
export interface LiveCourseOption {
  id: string;
  name: string;
  canvasUrl: string | null;
}

/** A module offered by the module picker (U2), in the same "<id>|<name>" (or
 * "export|<name>") value format buildLiveSessionContextAction's moduleIdRaw
 * parameter and the rest of the workflow system already use (see
 * src/lib/workflows/module-value.ts). */
export interface LiveModuleOption {
  value: string;
  label: string;
}

/** The pre-warmed session context, fetched exactly once via
 * buildLiveSessionContextAction when the instructor starts the session (see
 * U3 - this is the single most important latency decision in this feature). */
export interface LiveSessionContext {
  courseName: string;
  moduleName: string;
  materialsText: string;
  hintTerms: string;
}
