import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/supabase/auth";
import { withDeadline } from "@/lib/course-intel/fetch";
import { callLlm } from "@/lib/llm";
import type { PptxSlide } from "@/lib/pptx";
import { buildAskPrompt } from "@/lib/decks/ask-prompt";
import { applyDeckOperation, coerceDeckOperation } from "@/lib/decks/deck-operations";
import { buildOperationRefusedAdjustment, type FitReportAdjustment } from "@/lib/decks/fit-report";

// applyDeckOperation only ever returns "operation-refused" or
// "slide-count-refusal" adjustments (deck-operations.ts), both of which
// carry a `reason` - but the type is the full FitReportAdjustment union, so
// this reads the reason without assuming a member that isn't reachable here.
function refusalReason(adjustment: FitReportAdjustment): string {
  switch (adjustment.class) {
    case "operation-refused":
    case "slide-count-refusal":
      return adjustment.reason;
    default:
      return "That change is not allowed.";
  }
}

// The conversational-ask route (docs/a43-c-scope.md section 9). Mirrors
// api/presentations/generate/route.ts's shape: requireUser first, a soft
// work budget around the one callLlm, a 504 styled partial on deadline and a
// 502 on a failed/blank call - never an unstyled Next 500. The uploaded
// template is NEVER in the request body or the prompt (C-TEMPLATE-BLIND);
// the model is shown slide content only and the dispatcher (deck-operations)
// runs server-side.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// SOFT work budget, not merely the declared ceiling - same pattern and same
// reasoning as api/presentations/generate/route.ts's SOFT_DEADLINE_MS: this
// route makes exactly one callLlm, so its wall is simpler, but still present
// because callLlm's own retry/backoff (src/lib/llm.ts) must not be allowed
// to run past the platform kill, which would otherwise produce no response
// at all instead of a worded partial.
const SOFT_DEADLINE_MS = 50_000;

const DEADLINE_MESSAGE =
  "There was not enough time left in this request to finish safely. Nothing was changed - try again.";

const CALL_FAILED_MESSAGE = "The AI did not return a usable response for this request.";

interface AskRequestBody {
  instruction?: unknown;
  slides?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPptxSlide(value: unknown): value is PptxSlide {
  if (!isRecord(value)) return false;
  if (typeof value.title !== "string") return false;
  if (!Array.isArray(value.bullets) || !value.bullets.every((b) => typeof b === "string")) return false;
  if (value.code !== undefined && typeof value.code !== "string") return false;
  if (value.codeLanguage !== undefined && typeof value.codeLanguage !== "string") return false;
  if (value.notes !== undefined && typeof value.notes !== "string") return false;
  return true;
}

function parseAskBody(body: AskRequestBody): { instruction: string; slides: PptxSlide[] } | null {
  if (typeof body.instruction !== "string" || body.instruction.trim() === "") return null;
  if (!Array.isArray(body.slides) || body.slides.length === 0) return null;
  if (!body.slides.every(isPptxSlide)) return null;
  return { instruction: body.instruction, slides: body.slides as PptxSlide[] };
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "an unexpected error";
}

// Slices the first JSON object out of the model's text response - duplicated
// deliberately from src/lib/presentations/parse.ts's private sliceJsonObject
// (docs/pres-1-architecture.md section 3's do-not-reuse-by-import precedent):
// that helper is not exported, and widening that file's API for an ~8-line
// slicer would pull a shared file into this wave's write set.
function sliceJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

function deadlinePartialResponse() {
  return NextResponse.json({ status: "error", error: DEADLINE_MESSAGE, partial: true }, { status: 504 });
}

export async function POST(req: NextRequest) {
  try {
    await requireUser();
  } catch (err) {
    return NextResponse.json({ status: "error", error: describeError(err) }, { status: 401 });
  }

  let body: AskRequestBody;
  try {
    body = (await req.json()) as AskRequestBody;
  } catch {
    return NextResponse.json({ status: "error", error: "Could not read the request." }, { status: 400 });
  }

  const parsed = parseAskBody(body);
  if (!parsed) {
    return NextResponse.json({ status: "error", error: "No instruction or deck content was posted." }, { status: 400 });
  }

  const prompt = buildAskPrompt(parsed.instruction, parsed.slides);

  let text: string;
  try {
    const result = await withDeadline(callLlm({ contents: [{ role: "user", parts: [{ text: prompt }] }] }), SOFT_DEADLINE_MS, "Deck ask");
    if (!result.ok) {
      return NextResponse.json({ status: "error", error: CALL_FAILED_MESSAGE }, { status: 502 });
    }
    text = result.text;
  } catch (err) {
    if (err instanceof Error && /did not finish within/.test(err.message)) {
      return deadlinePartialResponse();
    }
    return NextResponse.json({ status: "error", error: CALL_FAILED_MESSAGE }, { status: 502 });
  }

  const jsonText = sliceJsonObject(text);
  let raw: unknown = null;
  if (jsonText) {
    try {
      raw = JSON.parse(jsonText);
    } catch {
      raw = null;
    }
  }

  const op = coerceDeckOperation(raw);
  if (!op) {
    const refusal = buildOperationRefusedAdjustment("I could not understand that request as a change I'm allowed to make to this deck.");
    return NextResponse.json({ status: "refused", reason: refusalReason(refusal) });
  }

  const dispatched = applyDeckOperation(parsed.slides, op);
  if (!dispatched.ok) {
    return NextResponse.json({ status: "refused", reason: refusalReason(dispatched.refusal) });
  }

  return NextResponse.json({ status: "ok", slides: dispatched.slides });
}
