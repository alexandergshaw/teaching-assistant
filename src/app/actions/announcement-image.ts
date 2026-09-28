"use server";

// Image generation for the recording tab's "draft announcement from a take"
// surface (useTakeAnnouncement.ts / TakeAnnouncementPanel.tsx). The owner
// asked for the generated announcement to come with "a simple, everyday
// image that is relevant", and answered "generate one with gemini" when
// asked how to source it - this is the one action that does that, calling
// generateGeminiImage (src/lib/llm.ts) with a prompt built from the
// announcement's own drafted subject/body (buildAnnouncementImagePrompt,
// src/lib/take-announcement.ts) so the image is actually relevant to THIS
// announcement rather than a generic stock illustration. Per the standing
// "in-house AI only" preference, generation happens through the app's own
// Gemini key - nothing here redirects the instructor to an external tool.
//
// Same {result}|{error} discipline as every other action in this directory
// (see unsplash.ts's fetchUnsplashImageAction and visualizer.ts's
// createVisualizerConceptAction for the two closest precedents): every
// failure - unauthenticated, no prompt, a missing/invalid API key, a
// transport/HTTP failure, a rate limit, or the model responding without an
// image (a refusal, a safety block, MAX_TOKENS) - resolves to a specific,
// real `{ error: string }` rather than throwing. The image is additive to
// the announcement (see useTakeAnnouncement.ts's own note on this): the
// announcement's drafted text is already generated and reviewable before
// this action is ever called, so a failure here never blocks or degrades
// the text the instructor is about to post.

import { requireOwner } from "@/lib/supabase/auth";
import { generateGeminiImage, describeLlmFailure, describeEmptyLlmImage } from "@/lib/llm";
import { raceWithTimeout } from "@/lib/bounded-race";

export type GenerateAnnouncementImageResult =
  | { base64: string; mimeType: string }
  | { error: string };

// RULING 76/94/G5-1: generateGeminiImage (src/lib/llm.ts) is an unbounded
// model transport - nothing bounded how long this action would wait on it,
// so it ran under whatever the platform's own ceiling happened to be. This
// wraps the call in an INNER, elapsed-aware bound: a function of how much of
// this action's own wall-clock budget the auth preamble already spent, not a
// fixed literal. RULING 94 puts a second, independent bound at the client
// caller (a later wave) - the two are not the same bound and neither
// substitutes for the other.
//
// RULING 75's limit still applies: raceWithTimeout races a promise, it does
// not cancel one. Losing this race bounds how long THIS ACTION waits on
// generateGeminiImage, not how long generateGeminiImage itself keeps running
// - the underlying call is left to finish or fail on its own, unobserved.
//
// The four constants below are RULING 77's - same values, same shape, as
// src/app/api/class-trends-insight/route.ts's TOTAL_BUDGET_MS/
// MODEL_WAIT_MIN_MS/MODEL_WAIT_MAX_MS/MODEL_WAIT_RESERVE_MS. They stay
// module-private: this file is "use server", and src/lib/use-server-exports.
// test.ts legalises only async-function and type-only exports from a "use
// server" module, so `export const` here would fail that gate.
const TOTAL_BUDGET_MS = 50_000;
const MODEL_WAIT_MIN_MS = 8_000;
const MODEL_WAIT_MAX_MS = 24_000;
/** Left after the model call for formatting the response. */
const MODEL_WAIT_RESERVE_MS = 2_000;

const IMAGE_TIMEOUT_MESSAGE =
  "Image generation timed out. The announcement text is unaffected - try the image again.";

/**
 * Generate a companion image for an announcement from a prompt already built
 * by buildAnnouncementImagePrompt. Takes the finished prompt string (not the
 * raw subject/body) so this server-only module never needs to know the
 * announcement's own composition rules - the same split callLlm's callers
 * already use (build the instruction/prompt client-side or in a plain lib
 * module, hand the finished string to the action).
 */
export async function generateAnnouncementImageAction(
  prompt: string
): Promise<GenerateAnnouncementImageResult> {
  // Recorded before the auth preamble runs, so the preamble's own latency
  // counts against the budget below - a slower requireOwner() round trip
  // correctly shrinks the wait this action still allows the model call.
  const startedAtMs = Date.now();

  try {
    await requireOwner();

    if (!prompt.trim()) {
      return { error: "Draft the announcement text first - the image is generated from its content." };
    }

    const remainingMs = startedAtMs + TOTAL_BUDGET_MS - Date.now();
    const waitMs = Math.min(MODEL_WAIT_MAX_MS, Math.max(MODEL_WAIT_MIN_MS, remainingMs - MODEL_WAIT_RESERVE_MS));

    const outcome = await raceWithTimeout(generateGeminiImage(prompt), waitMs);

    if (outcome.kind === "timedout") {
      return { error: IMAGE_TIMEOUT_MESSAGE };
    }
    if (outcome.kind === "failed") {
      throw outcome.error;
    }

    const result = outcome.value;

    if (!result.ok) {
      return { error: describeLlmFailure(result, "Image generation failed") };
    }

    if (result.base64 === null) {
      return { error: describeEmptyLlmImage(result, "Image generation failed") };
    }

    return { base64: result.base64, mimeType: result.mimeType };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not generate an image for this announcement.",
    };
  }
}
