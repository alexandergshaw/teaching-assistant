// PRES-2 S6.4: the per-stage pipeline PROMPT BUILDERS and RESPONSE PARSERS
// (docs/pres-2-s6-plan.md section 4, S6.4 row).
//
// This is a PURE leaf: no callLlm, no fetch, no IO, no React. Its production
// caller is S6.5's route (a named later wave, the same "consumed by its own
// tests, named downstream caller" shape S1-S5 already used,
// docs/pres-2-scope.md:386-390); in THIS wave the only caller is
// pipeline-prompts.test.ts.
//
// Every builder/parser is typed directly against the S6.3 wire contract
// (`PipelineRequest`, `Extract<..., {op: "..."}>` per op) rather than against
// a re-declared payload shape, so the two files cannot silently drift apart.
//
// Reuse ledger (plan section 2 / the brief):
//   - outline, activities ops reuse the shipped PRES-1 builders verbatim
//     (`buildOutlinePrompt`, `buildActivitiesPrompt`, `./prompts.ts`) - their
//     payload IS `{ context: PresentationContext }`, the shipped builders'
//     exact signature.
//   - deck op folds the REUSED rich contract: `SLIDE_STRUCTURE_REQUIREMENTS`
//     + `SLIDE_DECK_JSON_SHAPE` (`@/lib/slide-prompt`, unedited) and the
//     Pinned Frame via `buildFrameFoldLines` (`@/lib/deck-standard/frame`,
//     unedited) as separately-deletable lines (the same FRAME-FOLD idiom
//     `frame.ts` documents).
//   - regen-slide reuses the deck JSON shape + `parseDeckSlides`'s
//     slice+validate idiom (one-slide deck request/response), never a new
//     JSON contract.
//   - review-infoflow / review-visual reuse `buildChecklistPrompt` /
//     `parseChecklistResponse` with `INFO_FLOW_CHECKLIST` / `VISUAL_CHECKLIST`
//     (`@/lib/deck-standard/checklists`, unedited) rather than new checklist
//     logic.
//   - deck / regen-slide response parsing reuses `parseDeckSlides`
//     (`./parse.ts`, unedited) rather than a second JSON-slicing path.
//
// New in this file: `sliceJsonObject` and `contextToPromptText` are
// DUPLICATED, not imported - both are private, unexported helpers in sibling
// files (`./parse.ts`'s own comment states the same rationale for its
// duplicate of `sliceJsonObject` from `@/lib/decks/generate`: widening a
// shared file's API for an ~8-line helper would pull that file and its tests
// into this wave's write set). frame-suggest and plan's JSON contracts are
// new (no existing leaf proposes a Frame or parses a SlidePlan from raw text).
//
// Malformed-input safety: every parser here returns null/empty rather than
// throwing (the T|null idiom `parseDeckSlides` and `parseChecklistResponse`
// already use) - a route stage surfaces a refusal on a bad reply, never a
// 500 from an uncaught parse exception.

import { buildActivitiesPrompt, buildOutlinePrompt } from "./prompts";
import { parseActivities, parseDeckSlides } from "./parse";
import type { ActivitiesContent, DeckContent, OutlineContent, PresentationContext } from "./types";
import type { PipelineRequest } from "./pipeline";
import { buildFrameFoldLines, type PinnedFrame } from "@/lib/deck-standard/frame";
import type { SlidePlan, SlidePlanEntry } from "@/lib/deck-standard/slide-plan";
import {
  buildChecklistPrompt,
  parseChecklistResponse,
  INFO_FLOW_CHECKLIST,
  VISUAL_CHECKLIST,
  type ChecklistResult,
} from "@/lib/deck-standard/checklists";
import { SLIDE_DECK_JSON_SHAPE, SLIDE_STRUCTURE_REQUIREMENTS } from "@/lib/slide-prompt";
import type { PptxSlide } from "@/lib/pptx";

// ---------------------------------------------------------------------------
// Shared, duplicated helpers (see the file header for why these are not
// imported from a sibling file's private internals).
// ---------------------------------------------------------------------------

/** The single place pasted text and file-source text are joined into one block, mirroring prompts.ts's private helper of the same name. */
function contextToPromptText(context: PresentationContext): string {
  const sourceBlocks = context.sources.map((source) => `Source "${source.name}":\n${source.text}`).join("\n\n");
  const parts = [context.text.trim(), sourceBlocks.trim()].filter((part) => part.length > 0);
  return parts.join("\n\n");
}

/** Slices the first JSON object out of a raw LLM reply, mirroring parse.ts's private helper of the same name (duplicated deliberately, see file header). */
function sliceJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

// ---------------------------------------------------------------------------
// outline
// ---------------------------------------------------------------------------

export function buildPipelineOutlinePrompt(request: Extract<PipelineRequest, { op: "outline" }>): string {
  return buildOutlinePrompt(request.context);
}

/** Never throws: a blank/empty reply returns null rather than an empty-markdown OutlineContent. */
export function parseOutlineResponse(text: string): OutlineContent | null {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed.length === 0) return null;
  return { markdown: trimmed };
}

// ---------------------------------------------------------------------------
// frame-suggest
// ---------------------------------------------------------------------------

export function buildFrameSuggestPrompt(request: Extract<PipelineRequest, { op: "frame-suggest" }>): string {
  return [
    "You are helping an instructor choose ONE mental model and ONE running example to reuse across an entire lesson's slide deck, from the material below.",
    "The mental model is a short named idea broken into 2-6 concrete steps; the running example is a single scenario threaded through every slide instead of a fresh example per slide.",
    'Return ONLY a JSON object matching this exact shape: {"mentalModel": {"name": "...", "steps": ["...", "..."]}, "runningExample": {"name": "...", "description": "..."}}.',
    "Do not include any text outside the JSON object.",
    "",
    "Material:",
    contextToPromptText(request.context),
  ].join("\n");
}

/** Never throws: any structurally invalid reply (missing name, empty steps, non-string fields) returns null. */
export function parseFrame(text: string): PinnedFrame | null {
  const jsonText = sliceJsonObject(text);
  if (!jsonText) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const obj = parsed as { mentalModel?: unknown; runningExample?: unknown };
  const mentalModelRaw = obj.mentalModel;
  const runningExampleRaw = obj.runningExample;
  if (typeof mentalModelRaw !== "object" || mentalModelRaw === null) return null;
  if (typeof runningExampleRaw !== "object" || runningExampleRaw === null) return null;

  const mentalModel = mentalModelRaw as { name?: unknown; steps?: unknown };
  const runningExample = runningExampleRaw as { name?: unknown; description?: unknown };

  if (typeof mentalModel.name !== "string" || mentalModel.name.trim() === "") return null;
  if (!Array.isArray(mentalModel.steps) || mentalModel.steps.length === 0) return null;

  const steps: string[] = [];
  for (const step of mentalModel.steps) {
    if (typeof step !== "string" || step.trim() === "") return null;
    steps.push(step);
  }

  if (typeof runningExample.name !== "string" || runningExample.name.trim() === "") return null;
  if (typeof runningExample.description !== "string") return null;

  return {
    mentalModel: { name: mentalModel.name, steps },
    runningExample: { name: runningExample.name, description: runningExample.description },
  };
}

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------

export function buildPlanPrompt(request: Extract<PipelineRequest, { op: "plan" }>): string {
  const frameLines = buildFrameFoldLines(request.frame);

  return [
    "You are turning an instructor's lesson outline into a slide-by-slide plan: exactly one dominant claim per slide, for 5-second comprehension.",
    'Where the material invites a prediction, emit a "prediction" entry asking the student to guess before a paired "answer" entry reveals it - the prediction and its answer MUST be two separate entries (two separate slides) sharing the same predictionId, never combined into one entry.',
    ...frameLines,
    "",
    "Outline:",
    request.outline.markdown,
    "",
    "Original material:",
    contextToPromptText(request.context),
    "",
    'Return ONLY a JSON object matching this exact shape: {"entries": [{"role": "content", "dominantClaim": "..."}, {"role": "prediction", "dominantClaim": "...", "predictionId": "p1"}, {"role": "answer", "dominantClaim": "...", "predictionId": "p1"}]}.',
    "Do not include any text outside the JSON object.",
  ].join("\n");
}

/**
 * Never throws: this is a STRUCTURAL parser (every entry has a valid role
 * and a non-empty dominantClaim, and prediction/answer entries carry a
 * predictionId) - it does not itself run `validateSlidePlan`'s cross-entry
 * pairing checks (orphan prediction/answer, duplicate ids). Those remain the
 * separate business-rule pass `@/lib/deck-standard/slide-plan.ts` already
 * owns, run by the caller after this parser hands back a structurally sound
 * SlidePlan.
 */
export function parsePlan(text: string): SlidePlan | null {
  const jsonText = sliceJsonObject(text);
  if (!jsonText) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const obj = parsed as { entries?: unknown };
  if (!Array.isArray(obj.entries) || obj.entries.length === 0) return null;

  const entries: SlidePlanEntry[] = [];
  for (const raw of obj.entries) {
    if (typeof raw !== "object" || raw === null) return null;
    const entry = raw as { role?: unknown; dominantClaim?: unknown; predictionId?: unknown };

    if (typeof entry.dominantClaim !== "string" || entry.dominantClaim.trim() === "") return null;

    if (entry.role === "content") {
      entries.push({ role: "content", dominantClaim: entry.dominantClaim });
    } else if (entry.role === "prediction" || entry.role === "answer") {
      if (typeof entry.predictionId !== "string" || entry.predictionId.trim() === "") return null;
      entries.push({ role: entry.role, dominantClaim: entry.dominantClaim, predictionId: entry.predictionId });
    } else {
      return null;
    }
  }

  return { entries };
}

// ---------------------------------------------------------------------------
// deck
// ---------------------------------------------------------------------------

/**
 * The deck op's prompt: the ONLY builder here required to fold in all three
 * reused rich pieces (the brief) - `SLIDE_STRUCTURE_REQUIREMENTS`, the Pinned
 * Frame via `buildFrameFoldLines` (its own separately-deletable lines), and
 * `SLIDE_DECK_JSON_SHAPE` - plus the plan's per-slide dominant claims so the
 * model builds toward the already-approved slide-by-slide plan rather than a
 * fresh outline-only pass.
 */
export function buildPipelineDeckPrompt(request: Extract<PipelineRequest, { op: "deck" }>): string {
  const frameLines = buildFrameFoldLines(request.frame);
  const claimLines = request.plan.entries.map(
    (entry, index) => `Slide ${index + 1} dominant claim (${entry.role}): ${entry.dominantClaim}`
  );

  return [
    "You are helping an instructor build a slide deck from the material below.",
    SLIDE_STRUCTURE_REQUIREMENTS,
    ...frameLines,
    "",
    "Slide plan (one dominant claim per slide, in order - build exactly this many slides, in this order):",
    ...claimLines,
    "",
    `Return ONLY a JSON object matching this exact shape:\n${SLIDE_DECK_JSON_SHAPE}`,
    "Do not include any text outside the JSON object.",
    "",
    "Material:",
    contextToPromptText(request.context),
  ].join("\n");
}

/** Delegates to parseDeckSlides' slice+validate idiom (./parse.ts, unedited) - never throws, returns null on invalid. */
export function parseDeckResponse(text: string): DeckContent | null {
  return parseDeckSlides(text);
}

// ---------------------------------------------------------------------------
// activities
// ---------------------------------------------------------------------------

export function buildPipelineActivitiesPrompt(request: Extract<PipelineRequest, { op: "activities" }>): string {
  return buildActivitiesPrompt(request.context);
}

/** parseActivities (./parse.ts, via parseLenientJsonArray) never throws; a malformed reply yields an empty ideas list, never null. */
export function parseActivitiesResponse(text: string): ActivitiesContent {
  return { ideas: parseActivities(text) };
}

// ---------------------------------------------------------------------------
// review-infoflow / review-visual
// ---------------------------------------------------------------------------

export function buildReviewInfoFlowPrompt(request: Extract<PipelineRequest, { op: "review-infoflow" }>): string {
  return buildChecklistPrompt(INFO_FLOW_CHECKLIST, { slides: request.deck.slides });
}

export function buildReviewVisualPrompt(request: Extract<PipelineRequest, { op: "review-visual" }>): string {
  return buildChecklistPrompt(VISUAL_CHECKLIST, { slides: request.deck.slides });
}

/** parseChecklistResponse (@/lib/deck-standard/checklists, unedited) never throws; a malformed reply yields zero findings, never null. */
export function parseReviewInfoFlowResponse(text: string): ChecklistResult {
  return parseChecklistResponse(INFO_FLOW_CHECKLIST, text);
}

export function parseReviewVisualResponse(text: string): ChecklistResult {
  return parseChecklistResponse(VISUAL_CHECKLIST, text);
}

// ---------------------------------------------------------------------------
// regen-slide
// ---------------------------------------------------------------------------

/**
 * Builds a single-slide regeneration prompt from `{deck, slideIndex,
 * instruction, frame, plan}` (the brief): `priorSlide` is derived by code as
 * `deck.slides[slideIndex]`, and `planEntry` as `plan.entries[slideIndex]`
 * (one SlidePlan entry maps to exactly one slide,
 * `@/lib/deck-standard/slide-plan.ts`'s own stated invariant) - neither is
 * passed in separately, so the request payload matches the S6.3 wire
 * contract's literal `{context, frame, plan, deck, slideIndex, instruction}`
 * shape while this builder still folds the plan-section-1 fact
 * (`buildFrameFoldLines(frame)` + the target entry's `dominantClaim`, both by
 * code).
 */
export function buildRegenSlidePrompt(request: Extract<PipelineRequest, { op: "regen-slide" }>): string {
  const priorSlide: PptxSlide | undefined = request.deck.slides[request.slideIndex];
  const planEntry: SlidePlanEntry | undefined = request.plan.entries[request.slideIndex];
  const frameLines = buildFrameFoldLines(request.frame);

  const priorSlideLines = priorSlide
    ? [
        `Title: ${priorSlide.title}`,
        ...priorSlide.bullets.map((bullet) => `- ${bullet}`),
        priorSlide.notes ? `Notes: ${priorSlide.notes}` : "",
      ].filter((line) => line.length > 0)
    : ["(no prior slide at this index)"];

  return [
    "You are regenerating ONE slide of an instructor's slide deck in place; every other slide stays unchanged.",
    SLIDE_STRUCTURE_REQUIREMENTS,
    ...frameLines,
    "",
    planEntry ? `This slide's dominant claim: ${planEntry.dominantClaim}` : "",
    "Prior version of this slide:",
    ...priorSlideLines,
    "",
    "Instructor's regeneration instruction:",
    request.instruction,
    "",
    `Return ONLY a JSON object matching this exact shape:\n${SLIDE_DECK_JSON_SHAPE}`,
    'The "slides" array in your reply must contain EXACTLY ONE slide: the regenerated replacement for this slide.',
    "Do not include any text outside the JSON object.",
    "",
    "Material:",
    contextToPromptText(request.context),
  ].join("\n");
}

/**
 * Reuses parseDeckSlides' slice+validate idiom (./parse.ts, unedited) rather
 * than a second JSON contract: a valid one-slide deck reply's first slide is
 * returned as a one-element PptxSlide[]; any invalid/malformed reply (bad
 * JSON, missing title, non-array bullets, zero slides) returns []. Never
 * throws.
 */
export function parseRegenSlideResponse(text: string): PptxSlide[] {
  const parsed = parseDeckSlides(text);
  if (!parsed || parsed.slides.length === 0) return [];
  return [parsed.slides[0]];
}
