import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/supabase/auth";
import { withDeadline } from "@/lib/course-intel/fetch";
import { callLlm } from "@/lib/llm";
import type { PptxSlide } from "@/lib/pptx";
import type {
  ActivitiesContent,
  DeckContent,
  OutlineContent,
  PresentationContext,
  PresentationSource,
} from "@/lib/presentations/types";
import type { PinnedFrame } from "@/lib/deck-standard/frame";
import type { SlidePlan, SlidePlanEntry } from "@/lib/deck-standard/slide-plan";
import type { PipelineOp, PipelineRequest, PipelineResponse } from "@/lib/presentations/pipeline";
import {
  buildFrameSuggestPrompt,
  buildPipelineActivitiesPrompt,
  buildPipelineDeckPrompt,
  buildPipelineOutlinePrompt,
  buildPlanPrompt,
  buildRegenSlidePrompt,
  buildReviewInfoFlowPrompt,
  buildReviewVisualPrompt,
  parseActivitiesResponse,
  parseDeckResponse,
  parseFrame,
  parseOutlineResponse,
  parsePlan,
  parseRegenSlideResponse,
  parseReviewInfoFlowResponse,
  parseReviewVisualResponse,
} from "@/lib/presentations/pipeline-prompts";

// PRES-2 S6.5: the pipeline route - ONE stage op per invocation
// (docs/pres-2-s6-plan.md section S6.5). Mirrors
// src/app/api/presentations/generate/route.ts's shape (requireUser first, a
// SOFT work budget raced via withDeadline against each callLlm, a styled 504
// partial on timeout and 502 on a failed/blank call, never an unstyled Next
// 500) and src/app/api/decks/ask/route.ts's op response idiom
// (`{status, ...}` narrowed by the caller). All model access goes through
// callLlm - no direct fetch, no external call (in-house only).
//
// The route does NOT loop over stages: the client (S6.6) drives run-to-end
// by calling this route once per op (the never-loop contract,
// docs/pres-2-s6-plan.md section 3). This binds the route to the single
// maxDuration budget below.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// SOFT work budget, not merely the declared ceiling - identical reasoning to
// the sibling routes: maxDuration only bounds what the platform allows
// before it kills the function with no response at all. Checking the
// REMAINING budget before racing callLlm lets the route return a worded
// partial instead of letting the platform truncate silently.
const SOFT_DEADLINE_MS = 50_000;

const DEADLINE_MESSAGE =
  "There was not enough time left in this request to finish safely. Nothing was generated for this step - try again.";

const CALL_FAILED_MESSAGE = "The AI did not return a usable response for this step.";

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "an unexpected error";
}

// PipelineErrorResponse (pipeline.ts) is `{status: "error", reason}` - no
// `partial` field. Matching generate/route.ts's DEADLINE behaviour (a 504
// distinguishable from a plain 502) without widening the wire contract: the
// 504 status code itself is what the client (S6.6) branches on, same as the
// shipped sibling routes' own idiom.
function deadlinePartialResponse(): NextResponse {
  const body: PipelineResponse = { status: "error", reason: DEADLINE_MESSAGE };
  return NextResponse.json(body, { status: 504 });
}

function errorResponse(reason: string, status: number): NextResponse {
  const body: PipelineResponse = { status: "error", reason };
  return NextResponse.json(body, { status });
}

// Races `work` against the REMAINING budget (never the full SOFT_DEADLINE_MS)
// so callLlm's own retry/backoff cannot run past the point this route needs
// to answer by. Distinguishes the timeout rejection (withDeadline's own
// "did not finish within" message) from any OTHER throw, mirroring
// generate/route.ts's callWithBudget exactly.
type BudgetedCallResult<T> = { ok: true; value: T } | { ok: false; reason: "deadline" | "error" };

async function callWithBudget<T>(work: Promise<T>, budgetMs: number, label: string): Promise<BudgetedCallResult<T>> {
  try {
    const value = await withDeadline(work, budgetMs, label);
    return { ok: true, value };
  } catch (err) {
    if (err instanceof Error && /did not finish within/.test(err.message)) {
      return { ok: false, reason: "deadline" };
    }
    return { ok: false, reason: "error" };
  }
}

function remainingBudgetMs(startedAtMs: number): number {
  return Math.max(0, SOFT_DEADLINE_MS - (Date.now() - startedAtMs));
}

const MIN_CALL_BUDGET_MS = 3_000;

// ---------------------------------------------------------------------------
// Inbound-request validation (I3 of the S6.4 verify: the route's own job,
// left there deliberately). Every guard is structural and returns a typed
// value or null - never throws - so a malformed body yields 400, not a 500.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPresentationSource(value: unknown): value is PresentationSource {
  return isRecord(value) && typeof value.name === "string" && typeof value.text === "string";
}

function isPresentationContext(value: unknown): value is PresentationContext {
  if (!isRecord(value)) return false;
  if (typeof value.text !== "string") return false;
  if (!Array.isArray(value.sources) || !value.sources.every(isPresentationSource)) return false;
  return true;
}

function isOutlineContent(value: unknown): value is OutlineContent {
  return isRecord(value) && typeof value.markdown === "string";
}

function isPinnedFrameOrNull(value: unknown): value is PinnedFrame | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  const mentalModel = value.mentalModel;
  const runningExample = value.runningExample;
  if (!isRecord(mentalModel) || typeof mentalModel.name !== "string") return false;
  if (!Array.isArray(mentalModel.steps) || !mentalModel.steps.every((s) => typeof s === "string")) return false;
  if (!isRecord(runningExample) || typeof runningExample.name !== "string") return false;
  if (typeof runningExample.description !== "string") return false;
  return true;
}

function isSlidePlanEntry(value: unknown): value is SlidePlanEntry {
  if (!isRecord(value)) return false;
  if (typeof value.dominantClaim !== "string") return false;
  if (value.role === "content") return true;
  if (value.role === "prediction" || value.role === "answer") return typeof value.predictionId === "string";
  return false;
}

function isSlidePlan(value: unknown): value is SlidePlan {
  return isRecord(value) && Array.isArray(value.entries) && value.entries.every(isSlidePlanEntry);
}

function isPptxSlide(value: unknown): value is PptxSlide {
  if (!isRecord(value)) return false;
  if (typeof value.title !== "string") return false;
  if (!Array.isArray(value.bullets) || !value.bullets.every((b) => typeof b === "string")) return false;
  return true;
}

function isDeckContent(value: unknown): value is DeckContent {
  if (!isRecord(value)) return false;
  if (typeof value.presentationTitle !== "string") return false;
  if (!Array.isArray(value.slides) || !value.slides.every(isPptxSlide)) return false;
  return true;
}

/**
 * Validates the whole inbound body against the S6.3 wire contract, per op.
 * Returns the narrowed PipelineRequest or null (caller responds 400). This
 * is deliberately a plain switch, not a per-op table, so each op's guard
 * reads next to the payload shape it is checking (pipeline.ts's own
 * PipelineRequestPayload comment).
 */
function parsePipelineRequest(body: unknown): PipelineRequest | null {
  if (!isRecord(body)) return null;
  const op = body.op;

  switch (op) {
    case "outline":
    case "frame-suggest":
    case "activities": {
      if (!isPresentationContext(body.context)) return null;
      return { op, context: body.context };
    }
    case "plan": {
      if (!isPresentationContext(body.context)) return null;
      if (!isOutlineContent(body.outline)) return null;
      if (!isPinnedFrameOrNull(body.frame ?? null)) return null;
      return { op, context: body.context, outline: body.outline, frame: (body.frame ?? null) as PinnedFrame | null };
    }
    case "deck": {
      if (!isPresentationContext(body.context)) return null;
      if (!isPinnedFrameOrNull(body.frame ?? null)) return null;
      if (!isSlidePlan(body.plan)) return null;
      return { op, context: body.context, frame: (body.frame ?? null) as PinnedFrame | null, plan: body.plan };
    }
    case "review-infoflow":
    case "review-visual": {
      if (!isDeckContent(body.deck)) return null;
      return { op, deck: body.deck };
    }
    case "regen-slide": {
      if (!isPresentationContext(body.context)) return null;
      if (!isPinnedFrameOrNull(body.frame ?? null)) return null;
      if (!isSlidePlan(body.plan)) return null;
      if (!isDeckContent(body.deck)) return null;
      if (typeof body.slideIndex !== "number" || !Number.isInteger(body.slideIndex) || body.slideIndex < 0) return null;
      if (typeof body.instruction !== "string" || body.instruction.trim() === "") return null;
      return {
        op,
        context: body.context,
        frame: (body.frame ?? null) as PinnedFrame | null,
        plan: body.plan,
        deck: body.deck,
        slideIndex: body.slideIndex,
        instruction: body.instruction,
      };
    }
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  const startedAtMs = Date.now();

  try {
    await requireUser();
  } catch (err) {
    return errorResponse(describeError(err), 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse("Could not read the request.", 400);
  }

  const request = parsePipelineRequest(rawBody);
  if (!request) {
    const op = isRecord(rawBody) ? rawBody.op : undefined;
    const label = typeof op === "string" ? `"${op}"` : "missing/unknown";
    return errorResponse(`Malformed pipeline request (op: ${label}).`, 400);
  }

  const budgetMs = remainingBudgetMs(startedAtMs);
  if (budgetMs <= MIN_CALL_BUDGET_MS) {
    return deadlinePartialResponse();
  }

  const prompt = buildPromptForOp(request);
  const callResult = await callWithBudget(
    callLlm({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
    budgetMs,
    `Pipeline ${request.op}`
  );

  if (!callResult.ok) {
    if (callResult.reason === "deadline") {
      return deadlinePartialResponse();
    }
    return errorResponse(CALL_FAILED_MESSAGE, 502);
  }

  if (!callResult.value.ok) {
    return errorResponse(CALL_FAILED_MESSAGE, 502);
  }

  return respondForOp(request, callResult.value.text);
}

function buildPromptForOp(request: PipelineRequest): string {
  switch (request.op) {
    case "outline":
      return buildPipelineOutlinePrompt(request);
    case "frame-suggest":
      return buildFrameSuggestPrompt(request);
    case "plan":
      return buildPlanPrompt(request);
    case "deck":
      return buildPipelineDeckPrompt(request);
    case "activities":
      return buildPipelineActivitiesPrompt(request);
    case "review-infoflow":
      return buildReviewInfoFlowPrompt(request);
    case "review-visual":
      return buildReviewVisualPrompt(request);
    case "regen-slide":
      return buildRegenSlidePrompt(request);
  }
}

// Dispatches the op's own parser and shapes the response to match
// PipelineSuccessResponse/PipelineErrorResponse exactly (pipeline.ts), so the
// client (S6.6) can narrow on op+status. A parser returning null/[] (model
// produced nothing usable) is an explicit refusal, never a 200 masquerading
// as success - activities/review-infoflow/review-visual parsers never signal
// failure this way (they always degrade to an empty-but-valid artifact per
// pipeline-prompts.ts), so those three always respond "ok".
function respondForOp(request: PipelineRequest, text: string): NextResponse {
  const op: PipelineOp = request.op;

  switch (op) {
    case "outline": {
      const outline: OutlineContent | null = parseOutlineResponse(text);
      if (!outline) return refused("The AI did not produce a usable outline.");
      return ok({ op, status: "ok", outline });
    }
    case "frame-suggest": {
      const frame: PinnedFrame | null = parseFrame(text);
      if (!frame) return refused("The AI did not produce a usable mental model and running example.");
      return ok({ op, status: "ok", frame });
    }
    case "plan": {
      const plan: SlidePlan | null = parsePlan(text);
      if (!plan) return refused("The AI did not produce a usable slide plan.");
      return ok({ op, status: "ok", plan });
    }
    case "deck": {
      const deck: DeckContent | null = parseDeckResponse(text);
      if (!deck) return refused("The AI did not produce a usable deck.");
      return ok({ op, status: "ok", deck });
    }
    case "activities": {
      const activities: ActivitiesContent = parseActivitiesResponse(text);
      return ok({ op, status: "ok", activities });
    }
    case "review-infoflow": {
      const result = parseReviewInfoFlowResponse(text);
      return ok({ op, status: "ok", result });
    }
    case "review-visual": {
      const result = parseReviewVisualResponse(text);
      return ok({ op, status: "ok", result });
    }
    case "regen-slide": {
      const slides: PptxSlide[] = parseRegenSlideResponse(text);
      if (slides.length === 0) return refused("The AI did not produce a usable regenerated slide.");
      return ok({ op, status: "ok", slides });
    }
  }
}

function ok(body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body);
}

// A null/empty parser result (model produced nothing usable) is an explicit
// failure response, never a 200 masquerading as success - matching the
// PipelineErrorResponse shape (`{status: "error", reason}`) exactly, the
// same as every other failure path in this route.
function refused(reason: string): NextResponse {
  const body: PipelineResponse = { status: "error", reason };
  return NextResponse.json(body, { status: 502 });
}
