// Shared types for the Live Class Mode UI. No React here - just the shapes
// the container, hooks, and panels pass between each other.

import type { TranscriptionOverride, TranscriptionPath } from "./live-class-logic";
import type { AnswerLink, VisualizerIndexEntry } from "@/lib/live-class/links";

export type { TranscriptionOverride, TranscriptionPath };
export type { AnswerLink, VisualizerIndexEntry };

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
  /** Links resolved by code from the model's named concepts (see
   * src/lib/live-class/links.ts) - never emitted by the model itself. Always
   * present (possibly empty), same as `sources`. */
  links: AnswerLink[];
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
  /** The course tile's own facts (renderCourseFacts), loaded ONCE alongside
   * everything else above - course logistics (dates, contact, schedule), not
   * subject matter. */
  courseFactsText: string;
  /** True when courseFactsText is non-empty - surfaced separately (rather
   * than inferred from string length by every reader) so a thin context is
   * diagnosable during class, the same reasoning materialsSource already
   * exists for. */
  courseFactsAvailable: boolean;
  /** The tile's institution's knowledge-base pages (policies/rules), rendered
   * ONCE via buildLiveSessionContextAction's renderInstitutionPolicyText call.
   * Empty when the tile has no institution, the institution has no pages, or
   * the load failed - never a reason to block starting class. */
  policyText: string;
  /** How many institution pages made it into policyText. */
  policyPagesIncluded: number;
  /** How many institution pages were dropped to stay within the character
   * budget. 0 means every page fit (or there were none). */
  policyPagesOmitted: number;
  /** The visualizer's parsed nav index, loaded ONCE via
   * loadVisualizerIndexAction alongside the course-material pre-warm above -
   * see useLiveSessionPersistence.ts's start(). Optional/possibly empty: a
   * failed load must never block starting a class, it only means
   * resolveVisualizerLinks has nothing to match against for this session
   * (documentation links still resolve normally). */
  visualizerIndex?: VisualizerIndexEntry[];
}
