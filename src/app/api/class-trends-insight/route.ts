import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/supabase/auth";
import { callLlm, describeLlmFailure, normalizeProvider } from "@/lib/llm";
import { withDeadline } from "@/lib/course-intel/fetch";
import {
  anonymizeGradeResults,
  buildClassTrendsInsightPrompt,
  hasSubmissionsToAnalyze,
  parseClassTrendsInsightResponse,
  type ClassTrendsInsightObservation,
} from "@/lib/grade/class-trends-insight";
import type { GradingRunEntry } from "@/lib/grade/types";

// Layer B of backlog N9/N10's class trends feature (see
// src/lib/grade/class-trends-insight.ts's own header for the full picture).
// This route is deliberately thin: auth, a work budget, one model call, parse,
// return. Every rule that matters lives in that pure module, where it can be
// tested without a network call - this file exists only because the pure
// module cannot reach a model itself.
//
// requireUser(), NOT requireOwner() - matching src/app/api/course-intel/ask/
// route.ts:70-71. requireOwner is now an alias for requireUser (any active
// account, not literally the owner), so a comment here claiming an owner
// check would be false. This layer reads only a run already in the
// instructor's own browser session (posted in the request body, never
// fetched from storage here), so there is no separate tenant boundary to
// enforce beyond "is this an active account at all".
//
// maxDuration = 60: Hobby's hard cap, matching course-intel/ask. A value
// above 60 fails to build there.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// A SOFT work budget, not merely a declared ceiling (requirement 2).
//
// Copied from course-intel/ask/route.ts:63-68: `maxDuration` only bounds what
// the PLATFORM allows before it kills the function - and that kill cannot be
// intercepted from in here, so it produces no response at all, not a worded
// error. The only way this handler can hand back a readable message instead
// of silence is to stop itself, on its own clock, before the platform's
// clock runs out. Every number below is wall-clock milliseconds from
// `startedAtMs`, sized well under the 60s ceiling on purpose.
// ---------------------------------------------------------------------------
const TOTAL_BUDGET_MS = 50_000;
const MODEL_WAIT_MIN_MS = 8_000;
const MODEL_WAIT_MAX_MS = 24_000;
/** Left after the model call for parsing and responding. */
const MODEL_WAIT_RESERVE_MS = 2_000;

const GENERATION_CONFIG = { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: "application/json" };

const MODEL_PHASE_ERROR =
  "The AI did not return concept-level insight. Try again - the counted per-area trends above are unaffected.";

interface ClassTrendsInsightRequestBody {
  entry?: unknown;
  provider?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Minimal structural validation of the posted run - just enough to safely
 * read `.run.results` and `.assignmentName`. This route does not persist or
 * re-derive anything from the entry beyond what the pure module needs, so it
 * does not need the full parsing rigor a stored/untrusted record elsewhere in
 * this repo gets. */
function parseGradingRunEntry(value: unknown): GradingRunEntry | null {
  if (!isRecord(value)) return null;
  const run = value.run;
  if (!isRecord(run) || !Array.isArray(run.results)) return null;
  const assignmentName = typeof value.assignmentName === "string" ? value.assignmentName : "";
  return {
    courseName: typeof value.courseName === "string" ? value.courseName : "",
    assignmentName,
    canvasUrl: typeof value.canvasUrl === "string" ? value.canvasUrl : "",
    run: {
      results: run.results,
      rubricAreaNames: Array.isArray(run.rubricAreaNames) ? run.rubricAreaNames : [],
      fullCreditChecklist: Array.isArray(run.fullCreditChecklist) ? run.fullCreditChecklist : [],
    },
  } as GradingRunEntry;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "an unexpected error";
}

export async function POST(req: NextRequest) {
  const startedAtMs = Date.now();

  try {
    await requireUser();
  } catch (err) {
    return NextResponse.json({ status: "error", error: describeError(err) }, { status: 401 });
  }

  let body: ClassTrendsInsightRequestBody;
  try {
    body = (await req.json()) as ClassTrendsInsightRequestBody;
  } catch {
    return NextResponse.json({ status: "error", error: "Could not read the request." }, { status: 400 });
  }

  const entry = parseGradingRunEntry(body.entry);
  if (!entry) {
    return NextResponse.json({ status: "error", error: "No graded run was posted." }, { status: 400 });
  }
  const provider = normalizeProvider(typeof body.provider === "string" ? body.provider : undefined);

  // An empty run produces no call - there is nothing for a model to read a
  // pattern out of, and spending the work budget on it would only ever
  // return "empty" anyway.
  if (!hasSubmissionsToAnalyze(entry)) {
    return NextResponse.json({ status: "ok", observations: [] as ClassTrendsInsightObservation[] });
  }

  // Requirement 1: anonymized BEFORE the prompt is built. This route never
  // reads GradeResult.student itself - anonymizeGradeResults is the only
  // function that touches it, and its return type carries no field capable
  // of holding a name.
  let promptText: string;
  try {
    const submissions = anonymizeGradeResults(entry.run.results);
    promptText = buildClassTrendsInsightPrompt({
      assignmentName: entry.assignmentName,
      submissions,
    });
  } catch {
    return NextResponse.json({ status: "error", error: "The posted graded run was not in the expected shape." }, { status: 400 });
  }

  const remainingMs = startedAtMs + TOTAL_BUDGET_MS - Date.now();
  const waitMs = Math.min(MODEL_WAIT_MAX_MS, Math.max(MODEL_WAIT_MIN_MS, remainingMs - MODEL_WAIT_RESERVE_MS));

  let rawText: string;
  try {
    const result = await withDeadline(
      callLlm(
        {
          contents: [{ role: "user", parts: [{ text: promptText }] }],
          generationConfig: GENERATION_CONFIG,
        },
        provider
      ),
      waitMs,
      "The AI"
    );
    if (!result.ok) {
      // Logged, never returned - describeLlmFailure redacts secrets out of
      // the upstream body, but the body is still an upstream body. Nothing
      // about a submission or its feedback text is logged here or anywhere
      // else in this route: only the failure description of the LLM call
      // itself.
      console.error("[class-trends-insight] model call failed:", describeLlmFailure(result, "class-trends-insight"));
      return NextResponse.json({ status: "error", error: MODEL_PHASE_ERROR }, { status: 502 });
    }
    if (!result.text.trim()) {
      console.error(`[class-trends-insight] model returned no text (finishReason: ${result.finishReason ?? "none"})`);
      return NextResponse.json({ status: "error", error: MODEL_PHASE_ERROR }, { status: 502 });
    }
    rawText = result.text;
  } catch (err) {
    console.error("[class-trends-insight] model call did not complete:", describeError(err));
    return NextResponse.json({ status: "error", error: MODEL_PHASE_ERROR }, { status: 504 });
  }

  const parsed = parseClassTrendsInsightResponse(rawText);
  if (parsed.status === "rejected") {
    return NextResponse.json({ status: "error", error: parsed.reason }, { status: 502 });
  }

  return NextResponse.json({
    status: "ok",
    observations: parsed.status === "ok" ? parsed.observations : [],
  });
}
