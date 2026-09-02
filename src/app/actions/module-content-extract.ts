"use server";

// Server action for the module-walkthrough-deck feature's content extraction
// (docs/module-walkthrough-deck-acceptance-criteria.md section 7, AC8).
// Mirrors extractGradingSubmissionsAction's shape line for line
// (src/app/actions/grading-submission-extract.ts): requireOwner, a
// frame-count cap, checkWireBudget before any model call, parseLenientJsonArray
// for output, and { error } returned rather than thrown - never a throw
// across the Server Action boundary.
//
// DE20: this is a NEW action, a sibling of extractGradingSubmissionsAction,
// not a parameterisation of it - nothing is imported from
// grading-submission-extract.ts, and this file grades nothing, scores
// nothing, and reads no student work (see module-extraction-prompt.ts's
// header and its student-privacy clause for why).
//
// THE THREE OUTCOMES (AC8 - "this is the point"):
//   1. CONFIRMED EMPTY - the model returned the {"noModuleContentVisible":
//      true, ...} marker and no real blocks. Returned as SUCCESS with
//      `blocks: []` and `confirmedEmpty: true` - a real "nothing here" (a
//      module index page, a loading state), not a silent non-event.
//   2. READ SOMETHING, SOME ILLEGIBLE - real blocks plus zero or more blocks
//      the model could see but not confidently read. Success. An illegible
//      block is counted in `illegibleCount` and EXCLUDED from `blocks` - it
//      never reaches the deck's materials text, per AC8.
//   3. NOTHING, AND NO MARKER - the model returned neither a real block nor
//      the required marker: it did not follow the "always say why" contract.
//      This is the exact silent-success shape this repo's most-caught defect
//      class is built from, so it is a hard { error }, never folded into a
//      quiet `{ blocks: [] }` a caller could mistake for outcome 1.
//
// A blank model response and an unparseable response are unchanged from the
// grading action's own handling - both are already loud failures, not silent
// ones.
//
// WIRE BUDGET IS A REACHABLE PRODUCTION PATH, NOT DEFENCE IN DEPTH:
// packFrameBatch (a sibling file's own concern) always returns at least one
// frame even when that frame alone exceeds the batch budget, deliberately,
// so the capture queue cannot wedge. That means THIS action's own
// checkWireBudget refusal is the thing that actually stops an over-budget
// single frame from crossing the Server Action boundary (AC13) - it is not
// merely a defensive restatement of a check already done upstream.

import { requireOwner } from "@/lib/supabase/auth";
import { callLlm, describeLlmFailure, describeEmptyLlmText, type LlmProvider, type LlmPart } from "@/lib/llm";
import { checkWireBudget, sumBase64WireBytes } from "@/lib/upload-budget";
import { parseLenientJsonArray } from "@/lib/lenient-json";
import {
  MODULE_EXTRACT_BATCH_SIZE,
  MAX_BLOCK_CHARS,
  buildModuleContentExtractionPrompt,
  type ExtractedBlock,
  type ModuleBlockKind,
} from "@/app/components/module-deck-capture/module-extraction-prompt";

const VALID_KINDS = new Set<ModuleBlockKind>([
  "prose",
  "list",
  "table",
  "code",
  "caption",
  "objectives",
  "activity",
]);

/**
 * Coerce a raw parsed kind value to a valid ModuleBlockKind, defaulting to
 * "prose" for anything unrecognized - the model occasionally invents or
 * misspells a category, and a wrong kind is a rendering-quality problem
 * downstream, not a reason to drop otherwise-real content.
 */
function coerceKind(value: unknown): ModuleBlockKind {
  return typeof value === "string" && VALID_KINDS.has(value as ModuleBlockKind) ? (value as ModuleBlockKind) : "prose";
}

/**
 * Read the module content visible across a batch of screen-capture frames.
 * frames.length must be 1..MODULE_EXTRACT_BATCH_SIZE.
 *
 * `moduleName` (coordinator correction, 2026-09-02: the original brief's two
 * mandated signatures - this action's and buildModuleContentExtractionPrompt's
 * - did not reconcile; this action now carries the module-name field the
 * prompt builder always expected) and `context` (the instructor's free-text
 * context box, AC2) are both threaded straight into the extraction prompt.
 * Both may legitimately be "" - a caller that does not know the module (the
 * Recording-tab route with no bulk-bar prefill) or one where the instructor
 * left the context box empty - and buildModuleContentExtractionPrompt
 * degrades each independently to its own fallback wording rather than
 * emitting a label naming an empty string. Neither is sanitized here:
 * module-extraction-prompt.ts's own bounding (MAX_MODULE_NAME_CHARS) and
 * explicit label-not-instruction framing are what make it safe to pass
 * `moduleName` through untouched.
 */
export async function extractModuleContentAction(
  frames: Array<{ base64: string }>,
  moduleName: string,
  context: string,
  provider: LlmProvider
): Promise<
  {
    blocks: ExtractedBlock[];
    /** True when the model explicitly confirmed it read these frames and
     *  found no module content (outcome 1 above) - a real "nothing here",
     *  never conflated with outcome 3. */
    confirmedEmpty: boolean;
    /** Count of blocks the model could see but could not confidently read.
     *  These are counted here and EXCLUDED from `blocks` (AC8) - a caller
     *  must never read a zero-length `blocks` array as "nothing was even
     *  attempted" when real, if unreadable, content was found. */
    illegibleCount: number;
  }
  | { error: string }
> {
  try {
    await requireOwner();

    if (frames.length === 0) return { error: "No frames were captured from the screen." };
    if (frames.length > MODULE_EXTRACT_BATCH_SIZE) return { error: "Too many frames in one batch." };

    const sizeCheck = checkWireBudget(sumBase64WireBytes(frames.map((f) => f.base64)), "These screen frames");
    if (!sizeCheck.ok) return { error: sizeCheck.error ?? "These screen frames are too large to upload in one request." };

    const parts: LlmPart[] = [
      { text: buildModuleContentExtractionPrompt(frames.length, moduleName, context) },
      ...frames.map((f) => ({ inlineData: { mimeType: "image/jpeg", data: f.base64 } })),
    ];

    // Mirrors extractGradingSubmissionsAction's own generationConfig exactly:
    // 8192 output tokens (a dense batch can legitimately hold several
    // blocks), temperature 0.1 passed through unworked-around.
    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.1, maxOutputTokens: 8192 } },
      provider
    );

    if (!r.ok) return { error: describeLlmFailure(r, "Reading the module content failed") };
    if (!r.text.trim()) return { error: describeEmptyLlmText(r, "Reading the module content") };

    const raw = parseLenientJsonArray(r.text) as
      | Array<{
          heading?: unknown;
          text?: unknown;
          kind?: unknown;
          illegible?: unknown;
          noModuleContentVisible?: unknown;
          reason?: unknown;
        }>
      | null;
    if (!raw) return { error: "Could not read any module content from that part of the screen." };

    const confirmationEntry = raw.find((p) => p && typeof p === "object" && p.noModuleContentVisible === true);

    let illegibleCount = 0;
    const blocks: ExtractedBlock[] = [];

    for (const p of raw) {
      if (!p || typeof p !== "object") continue;
      if (p.noModuleContentVisible === true) continue; // the confirmation marker, not a block

      const hasText = typeof p.text === "string" && p.text.trim().length > 0;
      if (!hasText) continue; // nothing to keep - not even a candidate block

      if (p.illegible === true) {
        // AC8: an illegible block is counted, never returned - it must
        // never reach the deck's materials text as fabricated or
        // half-guessed content.
        illegibleCount++;
        continue;
      }

      const heading = typeof p.heading === "string" && p.heading.trim() ? p.heading.trim() : "Untitled";
      const text = (p.text as string).trim();
      const truncated = text.length > MAX_BLOCK_CHARS ? `${text.slice(0, MAX_BLOCK_CHARS)}...` : text;

      blocks.push({ heading, text: truncated, kind: coerceKind(p.kind) });
    }

    // Outcome 3: nothing usable AND no confirmation marker - the model did
    // not follow the "always say why" contract. This must be made LOUD,
    // never folded into a quiet `{ blocks: [] }` a caller could mistake for
    // outcome 1 (a real, confirmed empty page).
    if (blocks.length === 0 && illegibleCount === 0 && !confirmationEntry) {
      return {
        error:
          "The model returned no module content and did not confirm what these frames actually show. Treat this batch as unread, not as a page with nothing on it.",
      };
    }

    return {
      blocks,
      confirmedEmpty: blocks.length === 0 && illegibleCount === 0 && Boolean(confirmationEntry),
      illegibleCount,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read module content from the screen." };
  }
}
