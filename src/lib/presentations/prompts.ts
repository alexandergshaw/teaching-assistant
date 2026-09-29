// Pure per-artifact prompt builders for the presentations-authoring feature
// (PRES-1). Every builder composes contextToPromptText, the single place the
// pasted text and file-source text are joined into one block, so "files AND
// text both reach generation" (AC-3) is one code path.
//
// buildRegeneratePrompt is the LEV-1 enforcer (docs/pres-1-architecture.md
// section 1): it folds BOTH the prior context and the prior critique into the
// regenerate request BY CODE, as two separately-deletable lines, so the
// removal test (W1-T7) fails on the removal of either fold independently.

import { SLIDE_DECK_JSON_SHAPE } from "@/lib/slide-prompt";
import type { ContentArtifactKind, PresentationContext, RegenerateInput } from "./types";

// The single place pasted text and file-source text are joined into one
// block. Reused by every builder below.
function contextToPromptText(context: PresentationContext): string {
  const sourceBlocks = context.sources
    .map((source) => `Source "${source.name}":\n${source.text}`)
    .join("\n\n");
  const parts = [context.text.trim(), sourceBlocks.trim()].filter((part) => part.length > 0);
  return parts.join("\n\n");
}

export function buildOutlinePrompt(context: PresentationContext): string {
  return [
    "You are helping an instructor build a lesson outline from the material below.",
    "Produce a clear, well-structured Markdown outline covering the key topics, in a logical teaching order.",
    "",
    "Material:",
    contextToPromptText(context),
  ].join("\n");
}

export function buildActivitiesPrompt(context: PresentationContext): string {
  return [
    "You are helping an instructor design in-class activities from the material below.",
    "Propose 3-5 concrete, engaging activity ideas a class could do to practice this material.",
    'Return ONLY a JSON array of strings, e.g. ["Activity one...", "Activity two..."]. No other text.',
    "",
    "Material:",
    contextToPromptText(context),
  ].join("\n");
}

export function buildDeckPrompt(context: PresentationContext): string {
  return [
    "You are helping an instructor build a slide deck from the material below.",
    `Return ONLY a JSON object matching this exact shape:\n${SLIDE_DECK_JSON_SHAPE}`,
    "Do not include any text outside the JSON object.",
    "",
    "Material:",
    contextToPromptText(context),
  ].join("\n");
}

export function buildReviewPrompt(
  kind: ContentArtifactKind,
  contentText: string,
  context: PresentationContext
): string {
  return [
    `You are reviewing a generated "${kind}" artifact for an instructor's lesson material.`,
    "Give a short, specific critique: what is strong, what is missing, and what to improve.",
    "",
    "Original material:",
    contextToPromptText(context),
    "",
    `Generated "${kind}" content to review:`,
    contentText,
  ].join("\n");
}

// The LEV-1 enforcer. The two fold-ins below are separate, deletable lines
// (docs/pres-1-architecture.md section 6.3 / W1-T7): deleting either one
// removes that value from the built string without affecting the other.
export function buildRegeneratePrompt(input: RegenerateInput): string {
  const contextLine = `Prior material:\n${contextToPromptText(input.priorContext)}`;
  const critiqueLine = input.priorCritique
    ? `Prior critique to address:\n${input.priorCritique.text}`
    : "";

  return [
    `You are regenerating a "${input.kind}" artifact for an instructor's lesson material.`,
    "Produce an improved version that builds on the prior material and, if given, addresses the prior critique.",
    "",
    contextLine,
    "",
    critiqueLine,
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}
