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

export type GenerateAnnouncementImageResult =
  | { base64: string; mimeType: string }
  | { error: string };

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
  try {
    await requireOwner();

    if (!prompt.trim()) {
      return { error: "Draft the announcement text first - the image is generated from its content." };
    }

    const result = await generateGeminiImage(prompt);

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
