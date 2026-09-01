"use server";

// The R1/R1a/R1b legibility instrument's one server action
// (docs/grading-via-recording-acceptance-criteria.md section 1). Follows
// extractDiscussionPostsAction's shape exactly (src/app/actions/discussion-replies.ts,
// itself modeled on src/app/actions/media.ts:470-565): requireOwner, a frame
// count cap, checkWireBudget before the model call, and { error } returned
// rather than thrown.
//
// What is DELIBERATELY different from extractDiscussionPostsAction: this
// action returns a raw transcript string, never parsed JSON. There is no
// structure to extract - R1/R1a's whole point is an unprocessed, honest
// answer to "what can the model read here", and a JSON-parsing step would
// itself be one more place a genuine "I could not read this" answer could
// get silently dropped by a parser that expected an array of posts.

import { requireOwner } from "@/lib/supabase/auth";
import { callLlm, describeLlmFailure, describeEmptyLlmText, type LlmProvider, type LlmPart } from "@/lib/llm";
import { checkWireBudget, sumBase64WireBytes } from "@/lib/upload-budget";
import { PROBE_MAX_FRAMES } from "@/app/components/grading-recording/legibility-probe";

/**
 * Sends up to PROBE_MAX_FRAMES screen-capture frames to the model with the
 * caller-supplied prompt (built by buildLegibilityProbePrompt in
 * legibility-probe.ts - passed in rather than built here so the prompt text
 * itself stays in the one pure, testable module both the client component
 * and this action import) and returns its raw text response, untouched
 * beyond trimming. An empty or near-empty result is still returned as
 * `{transcript}` - classifying it as the R1a headline finding is the
 * caller's job (legibility-probe.ts's deriveProbeResultNotice), the same
 * split extractDiscussionPostsAction uses between "the action returns data"
 * and "the modal decides what the data means".
 */
export async function probeFrameLegibilityAction(
  frames: Array<{ base64: string }>,
  prompt: string,
  provider: LlmProvider
): Promise<{ transcript: string } | { error: string }> {
  try {
    await requireOwner();

    if (frames.length === 0) return { error: "No frames were captured from the screen." };
    if (frames.length > PROBE_MAX_FRAMES) return { error: "Too many frames in one probe batch." };

    const sizeCheck = checkWireBudget(sumBase64WireBytes(frames.map((f) => f.base64)), "These screen frames");
    if (!sizeCheck.ok) return { error: sizeCheck.error ?? "These screen frames are too large to upload in one request." };

    const parts: LlmPart[] = [
      { text: prompt },
      ...frames.map((f) => ({ inlineData: { mimeType: "image/jpeg", data: f.base64 } })),
    ];

    // Low temperature: this is a transcription task, not a creative one - the
    // model should report what it sees, not embellish it. No JSON output
    // format is requested, so no maxOutputTokens tuning tied to a parser's
    // expectations is needed either; 4096 is comfortably above what a
    // verbatim transcription of a few frames of a submission page needs.
    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0, maxOutputTokens: 4096 } },
      provider
    );

    if (!r.ok) return { error: describeLlmFailure(r, "Reading the screen failed") };
    if (!r.text.trim()) return { error: describeEmptyLlmText(r, "Reading the screen") };

    return { transcript: r.text.trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the screen." };
  }
}
