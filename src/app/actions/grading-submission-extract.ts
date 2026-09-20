"use server";

// Server action for grading-via-recording's submission extraction
// (docs/grading-via-recording-acceptance-criteria.md sections 1 and 3).
// Follows extractDiscussionPostsAction's shape exactly
// (src/app/actions/discussion-replies.ts): requireOwner, a frame-count cap,
// checkWireBudget before any model call, parseLenientJsonArray for output,
// and { error } returned rather than thrown - never a throw across the
// Server Action boundary.
//
// R4b: this is a NEW action, not a parameterisation of
// extractDiscussionPostsAction - nothing is imported from discussion-replies.ts,
// and this file grades nothing, scores nothing, and persists nothing (see
// grading-extraction-prompt.ts's header for what this surface is not).
//
// R1a - THE EMPTY-VS-NOTHING DISTINCTION:
// buildSubmissionExtractionPrompt (grading-extraction-prompt.ts) refuses to
// let the model return a bare `[]` - when nothing is visible it must return
// one explicit marker element naming what it actually saw instead. That
// gives this action three distinguishable outcomes for what would otherwise
// all look like "zero rows, no error, every gate green" (the exact defect
// R1a names):
//
//   1. CONFIRMED EMPTY - the model returned the marker element. A real
//      "nothing here" (a gradebook list, a loading state). Returned as
//      SUCCESS with `submissions: []` and `confirmedEmpty: true`, so the
//      caller can render this as an honest, positive finding rather than a
//      silent non-event.
//   2. FOUND SOMETHING, NAME UNREADABLE - the model returned submission-
//      shaped entries with real text but no readable name. R3 requires
//      these be skipped entirely (never attributed to the nearest name), so
//      they never become an ExtractedSubmission - but `skippedUnnamed`
//      reports the count, so a caller does not read "0 submissions" as "0
//      candidates" when real work was actually skipped for safety.
//   3. NOTHING, NO CONFIRMATION - the model returned neither a real
//      submission nor the required marker: it did not follow the "always
//      say why" contract. This is the exact silent-success shape R1a warns
//      about, and it is made VISIBLE here as a hard { error }, not folded
//      into a quiet `{ submissions: [] }` the caller could mistake for
//      outcome 1.
//
// A blank model response (r.text.trim() === "") and an unparseable response
// (parseLenientJsonArray returns null) are unchanged from the discussion
// action's own handling - both are already loud failures, not silent ones.

import { requireOwner } from "@/lib/supabase/auth";
import { callLlm, describeLlmFailure, describeEmptyLlmText, type LlmProvider, type LlmPart } from "@/lib/llm";
import { checkWireBudget, sumBase64WireBytes } from "@/lib/upload-budget";
import { parseLenientJsonArray } from "@/lib/lenient-json";
import {
  GRADING_EXTRACT_BATCH_SIZE,
  MAX_SUBMISSION_CHARS,
  buildSubmissionExtractionPrompt,
} from "@/app/components/grading-recording/grading-extraction-prompt";
import type { ExtractedSubmission } from "@/app/components/grading-recording/grading-submission-merge";
import { coerceSubmissionKind } from "@/lib/grade/submission-kind";

/**
 * Read the student submissions visible across a batch of screen-capture
 * frames. frames.length must be 1..GRADING_EXTRACT_BATCH_SIZE.
 *
 * WIRED AND LIVE. This comment used to say "NOT YET WIRED TO A PRODUCTION
 * CALLER: this action has no caller in this change", which was true when the
 * action was built ahead of its consumer and false from the moment that
 * consumer landed. Corrected 2026-09-15 after an A8 scoping pass reasoned
 * from it and reached a wrong conclusion about what this tree contains.
 * MEASURED, and re-measure rather than trusting this line too: `grep -rn
 * "extractGradingSubmissionsAction" src --include=*.ts --include=*.tsx`
 * shows the caller in GradingRecordingPanel.tsx - it imports the action near
 * the top of its import block and calls it inside the capture loop.
 *
 * DELIBERATELY NO LINE NUMBERS. The previous version cited :89 and :419;
 * measured 2026-09-20 those are :99 and :440, wrong by 10 and 21, and any
 * replacement rots the same way the next time something above them moves.
 * Naming the file and the command is the part that stays true. This comment
 * shape has now cost this row three separate passes - first as a false
 * reachability claim, then as citations nobody re-measured.
 *
 * The consumer is the capture loop in GradingRecordingPanel.tsx: it calls
 * this action per frame batch, feeds the returned `submissions` through
 * mergeExtractedSubmissions (grading-submission-merge.ts), and turns the
 * merged result into GradingRow entries (grading-row.ts), minting each row's
 * id there.
 *
 * A "not yet wired" note is a claim with an expiry date and no gate to
 * enforce it - docs/loop/traps-spec.md's brief-from-the-tree-not-the-doc
 * class, in a source comment rather than a design doc.
 */
export async function extractGradingSubmissionsAction(
  frames: Array<{ base64: string }>,
  provider: LlmProvider
): Promise<
  {
    submissions: ExtractedSubmission[];
    /** True when the model explicitly confirmed it read these frames and
     *  found no submissions (outcome 1 above) - a real "nothing here", never
     *  conflated with outcome 3 (see this file's header). */
    confirmedEmpty: boolean;
    /** Count of raw entries the model returned with real submission text but
     *  no readable name, skipped per R3 (outcome 2 above). Reported so a
     *  zero-length `submissions` array is never silently indistinguishable
     *  from "nothing was even attempted on this batch". */
    skippedUnnamed: number;
  }
  | { error: string }
> {
  try {
    await requireOwner();

    if (frames.length === 0) return { error: "No frames were captured from the screen." };
    // N8: state BOTH numbers. A refusal the instructor cannot act on is close to
    // no refusal - they cannot tell whether to retry with fewer frames or that
    // something upstream is wrong. The caller clamps before calling
    // (takeFrameBatch), so this branch is defence in depth today; it says the
    // numbers anyway, because the reason it exists is the day a caller stops
    // clamping.
    if (frames.length > GRADING_EXTRACT_BATCH_SIZE)
      return {
        error: `Too many frames in one batch: ${frames.length} supplied, at most ${GRADING_EXTRACT_BATCH_SIZE} per batch.`,
      };

    const sizeCheck = checkWireBudget(sumBase64WireBytes(frames.map((f) => f.base64)), "These screen frames");
    if (!sizeCheck.ok) return { error: sizeCheck.error ?? "These screen frames are too large to upload in one request." };

    const parts: LlmPart[] = [
      { text: buildSubmissionExtractionPrompt(frames.length) },
      ...frames.map((f) => ({ inlineData: { mimeType: "image/jpeg", data: f.base64 } })),
    ];

    // Mirrors extractDiscussionPostsAction's own generationConfig exactly
    // (AC4b-i/ii there): 8192 output tokens (thinking tokens share the same
    // budget on Gemini 3.x, and a dense batch can legitimately hold several
    // submissions), temperature 0.1 passed through unworked-around.
    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.1, maxOutputTokens: 8192 } },
      provider
    );

    if (!r.ok) return { error: describeLlmFailure(r, "Reading the submissions failed") };
    if (!r.text.trim()) return { error: describeEmptyLlmText(r, "Reading the submissions") };

    const raw = parseLenientJsonArray(r.text) as
      | Array<{
          studentName?: unknown;
          submissionText?: unknown;
          noSubmissionsVisible?: unknown;
          reason?: unknown;
          submissionKind?: unknown;
          kindCue?: unknown;
        }>
      | null;
    if (!raw) return { error: "Could not read any submissions from that part of the screen." };

    const confirmationEntry = raw.find((p) => p && typeof p === "object" && p.noSubmissionsVisible === true);

    let skippedUnnamed = 0;
    const submissions: ExtractedSubmission[] = [];

    for (const p of raw) {
      if (!p || typeof p !== "object") continue;
      if (p.noSubmissionsVisible === true) continue; // the confirmation marker, not a submission

      const hasText = typeof p.submissionText === "string" && p.submissionText.trim().length > 0;
      if (!hasText) continue; // nothing to grade - not even a candidate

      const hasName = typeof p.studentName === "string" && p.studentName.trim().length > 0;
      if (!hasName) {
        // R3: a submission whose name is not visible is SKIPPED entirely -
        // never attributed to the nearest visible name. Counted, not
        // silently discarded, so outcome 2 (above) stays distinguishable.
        skippedUnnamed++;
        continue;
      }

      const name = (p.studentName as string).trim();
      const text = (p.submissionText as string).trim();
      const truncated = text.length > MAX_SUBMISSION_CHARS ? `${text.slice(0, MAX_SUBMISSION_CHARS)}...` : text;
      // docs/a8r-scope.md (A8-R) CUE-1: the mint. coerceSubmissionKind
      // defaults anything the model did not return (or returned outside the
      // four-member set) to "unknown" - a model response captured before
      // this contract existed reads identically to one that genuinely had no
      // basis to suggest a kind.
      const suggestedSubmissionKind = coerceSubmissionKind(p.submissionKind);
      const submissionKindCue = typeof p.kindCue === "string" ? p.kindCue.trim() : "";
      submissions.push({ name, text: truncated, suggestedSubmissionKind, submissionKindCue });
    }

    // Outcome 3: nothing usable AND no confirmation marker - the model did
    // not follow the "always say why" contract. R1a: this must be made
    // LOUD, never folded into a quiet `{ submissions: [] }` a caller could
    // mistake for outcome 1 (a real, confirmed empty page).
    if (submissions.length === 0 && skippedUnnamed === 0 && !confirmationEntry) {
      return {
        error:
          "The model returned no submissions and did not confirm what these frames actually show. Treat this batch as unread, not as a page with nothing on it.",
      };
    }

    return {
      submissions,
      confirmedEmpty: submissions.length === 0 && skippedUnnamed === 0 && Boolean(confirmationEntry),
      skippedUnnamed,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read submissions from the screen." };
  }
}
