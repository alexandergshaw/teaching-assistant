// Single-artifact executors for the presentations-authoring feature (PRES-1,
// docs/pres-1-architecture.md section 6.2). Each issues at most one callLlm
// (regenerateArtifact issues at most two, including its optional re-review).
//
// These are the executors the route handler (wave 2) and, for
// selectedContentKinds, the client tab (wave 3) call. There is deliberately
// NO multi-kind looper here (B1) - the caller drives the fan-out one kind at
// a time.

import { callLlm, type LlmRequest } from "@/lib/llm";
import {
  buildActivitiesPrompt,
  buildDeckPrompt,
  buildOutlinePrompt,
  buildRegeneratePrompt,
  buildReviewPrompt,
} from "./prompts";
import { parseActivities, parseDeckSlides } from "./parse";
import type {
  ActivitiesContent,
  ArtifactSelection,
  ContentArtifactKind,
  Critique,
  DeckContent,
  OutlineContent,
  PresentationContext,
  ProducedArtifact,
  RegenerateInput,
} from "./types";

// Fixed order. PURE (no callLlm): maps a selection to exactly the selected
// content kinds, deselected kinds absent, `review` never a kind (AC-4).
const CONTENT_KINDS: readonly ContentArtifactKind[] = ["outline", "activities", "deck"];

export function selectedContentKinds(selection: ArtifactSelection): ContentArtifactKind[] {
  return CONTENT_KINDS.filter((kind) => selection[kind]);
}

function buildRequest(prompt: string): LlmRequest {
  return { contents: [{ role: "user", parts: [{ text: prompt }] }] };
}

function buildProducedArtifact(
  kind: ContentArtifactKind,
  content: OutlineContent | ActivitiesContent | DeckContent
): ProducedArtifact {
  switch (kind) {
    case "outline":
      return { kind: "outline", content: content as OutlineContent, critique: null };
    case "activities":
      return { kind: "activities", content: content as ActivitiesContent, critique: null };
    case "deck":
      return { kind: "deck", content: content as DeckContent, critique: null };
  }
}

function contentToReviewText(produced: ProducedArtifact): string {
  switch (produced.kind) {
    case "outline":
      return produced.content.markdown;
    case "activities":
      return produced.content.ideas.join("\n");
    case "deck":
      return JSON.stringify(produced.content);
  }
}

/**
 * Generates the ONE content artifact named by `kind` from `context`. Issues
 * exactly one callLlm. Returns null on a callLlm failure or, for the deck
 * kind, when the model's response fails validateDeck's pre-flight gate
 * (parseDeckSlides, B2 / SRE 3b) - a GENERATION FAILURE the route handler
 * (wave 2) turns into `{ error }`, never a raw builder crash and never a
 * silently-empty deck.
 */
export async function generateOneArtifact(
  kind: ContentArtifactKind,
  context: PresentationContext
): Promise<ProducedArtifact | null> {
  switch (kind) {
    case "outline": {
      const result = await callLlm(buildRequest(buildOutlinePrompt(context)));
      if (!result.ok) return null;
      return buildProducedArtifact("outline", { markdown: result.text });
    }
    case "activities": {
      const result = await callLlm(buildRequest(buildActivitiesPrompt(context)));
      if (!result.ok) return null;
      return buildProducedArtifact("activities", { ideas: parseActivities(result.text) });
    }
    case "deck": {
      const result = await callLlm(buildRequest(buildDeckPrompt(context)));
      if (!result.ok) return null;
      const deck = parseDeckSlides(result.text);
      if (!deck) return null;
      return buildProducedArtifact("deck", deck);
    }
  }
}

/**
 * Produces the critique for an already-produced artifact (AC-5). Issues
 * exactly one callLlm, built from `produced.content` (not from `context`
 * alone), so the review is provably about the specific artifact it names.
 */
export async function reviewArtifact(
  produced: ProducedArtifact,
  context: PresentationContext
): Promise<Critique | null> {
  const prompt = buildReviewPrompt(produced.kind, contentToReviewText(produced), context);
  const result = await callLlm(buildRequest(prompt));
  if (!result.ok) return null;
  return { text: result.text };
}

/**
 * Regenerates one artifact, folding the prior context AND prior critique into
 * the request BY CODE (LEV-1/AC-7, via buildRegeneratePrompt). Issues one
 * callLlm, plus a second when `input.withReview` re-runs the critique.
 */
export async function regenerateArtifact(input: RegenerateInput): Promise<ProducedArtifact | null> {
  const prompt = buildRegeneratePrompt(input);
  const result = await callLlm(buildRequest(prompt));
  if (!result.ok) return null;

  let content: OutlineContent | ActivitiesContent | DeckContent | null;
  switch (input.kind) {
    case "outline":
      content = { markdown: result.text };
      break;
    case "activities":
      content = { ideas: parseActivities(result.text) };
      break;
    case "deck":
      content = parseDeckSlides(result.text);
      break;
  }
  if (content === null) return null;

  const produced = buildProducedArtifact(input.kind, content);

  if (input.withReview) {
    const critique = await reviewArtifact(produced, input.priorContext);
    if (critique) produced.critique = critique;
  }

  return produced;
}
