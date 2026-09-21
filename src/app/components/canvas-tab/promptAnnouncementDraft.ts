// A21 (docs/a21-scope.md section 4.7, docs/a21-instrument-notes.md section
// 4): the draft path's decision logic, in a pure leaf that imports NO
// action and NO Canvas-capable module at all (AC-9b) - every literal
// server-action call stays in announcements-panel.tsx, per
// useAnnouncementDraftSlots.ts's own rule (":152-155").
//
// AC-1(d)/AC-18: `buildPromptDraftRequest` routes through the SHARED
// `resolveChoice` (reused, unmodified) rather than hand-rolling the
// default -> pasted -> saved -> none precedence rule here - a re-
// implementation could match a frozen test table today and silently drift
// from `resolveChoice` the moment upstream changes precedence.

import {
  resolveChoice,
  type ResolvedTemplate,
} from "@/app/components/walkthrough-announcement/announcement-draft-slots";
import type {
  PromptAnnouncementDraftRequest,
  PromptAnnouncementDraftResult,
  PromptDraftUiState,
} from "@/lib/prompt-announcement-types";
import { PROMPT_ANNOUNCEMENT_MAX_CHARS } from "@/lib/prompt-announcement-prompt";
import { promptDraftReceipt } from "./promptAnnouncementTemplate";

/**
 * AC-21: the cap is applied on the way out of the panel, CAP-THEN-TRIM, in
 * that order. Cap first (never let more than PROMPT_ANNOUNCEMENT_MAX_CHARS
 * characters through at all), then trim - trimming first would let a
 * post-cap trim re-admit characters past the cap on the next edit cycle,
 * and running trim after the cap is what keeps AC-22(ii)'s exactly-CAP
 * boundary control from being rejected by a brief whose edges happen to be
 * whitespace at the cap boundary.
 */
function capAndTrimPrompt(promptText: string): string {
  return promptText.slice(0, PROMPT_ANNOUNCEMENT_MAX_CHARS).trim();
}

/**
 * AC-18: the chosen template and its outline reach the REQUEST. Builds the
 * wire payload from the panel's UI state, resolving `state.choice` against
 * `state.live` through the shared `resolveChoice` (never re-implemented
 * here or defaulted to "none").
 */
export function buildPromptDraftRequest(state: PromptDraftUiState): PromptAnnouncementDraftRequest {
  const { template, outline } = resolveChoice(state.choice, state.live);
  return {
    promptText: capAndTrimPrompt(state.promptText),
    courseLabel: state.courseLabel,
    resolvedTemplate: template,
    outline,
    provider: state.provider,
  };
}

/**
 * AC-19/AC-20: folds a draft result back into UI state. A deterministic
 * draft (`templateApplied: false`) resets `lastResolved` to `null` so
 * `posterFor` posts it as plaintext regardless of which template was
 * chosen - `scaffoldAnnouncement` emits no Markdown. A failed result leaves
 * `lastResolved` ALONE, so an error does not silently reset the provenance
 * of a draft still on screen.
 */
export function applyPromptDraftResult(
  state: PromptDraftUiState,
  result: PromptAnnouncementDraftResult
): PromptDraftUiState {
  if (!result.ok) {
    return { ...state, error: result.error };
  }
  const lastResolved: ResolvedTemplate | null = result.templateApplied ? result.resolvedTemplate : null;
  return {
    ...state,
    title: result.title,
    message: result.message,
    lastResolved,
    receipt: promptDraftReceipt(lastResolved, result.templateApplied),
    error: null,
  };
}
