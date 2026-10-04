// Pure leaf that finalizes draftAnnouncementAction's raw result for the
// recording-to-announcement route before it reaches review. Closes three
// defects: the embedded engine's scaffold echoes the prompt back as the draft
// (refused here, keyed on the closed provider enum, never by scanning text),
// a blank title or message was accepted, and an invented URL could reach the
// instructor's review. No React and no server directive, so it is node-testable.

import type { LlmProvider } from "./llm";
import type { TakeAnnouncementContext } from "./take-announcement";
import { collectTakePermittedUrls, stripUnpermittedUrls } from "./walkthrough-announcement-link-guard";

export const EMBEDDED_DRAFT_REFUSAL =
  "The Embedded Deterministic Engine can't draft an announcement from a recording. Switch the LLM provider to Gemini in Settings and try again.";

// Same wording as the walkthrough drafter's own blank-result error.
export const BLANK_DRAFT_ERROR = "Generated announcement is empty. Try again.";

export type TakeDraftRaw = { title: string; message: string } | { error: string };

export type FinalizeResult = { ok: true; title: string; message: string } | { ok: false; error: string };

export function finalizeTakeDraft(
  raw: TakeDraftRaw,
  args: { provider: LlmProvider; transcript: string; context: TakeAnnouncementContext }
): FinalizeResult {
  if ("error" in raw) return { ok: false, error: raw.error };
  if (args.provider === "embedded") return { ok: false, error: EMBEDDED_DRAFT_REFUSAL };
  if (!raw.title.trim() || !raw.message.trim()) return { ok: false, error: BLANK_DRAFT_ERROR };
  const { context } = args;
  const permitted = collectTakePermittedUrls([
    args.transcript,
    context.topic ?? "",
    context.objectives ?? "",
    context.cardTitle ?? "",
    context.cardSubtitle ?? "",
  ]);
  const { text } = stripUnpermittedUrls(raw.message, permitted);
  return { ok: true, title: raw.title, message: text };
}
