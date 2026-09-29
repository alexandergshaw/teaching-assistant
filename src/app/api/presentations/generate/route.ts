import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/supabase/auth";
import { withDeadline } from "@/lib/course-intel/fetch";
import { generateOneArtifact, reviewArtifact, regenerateArtifact } from "@/lib/presentations/generate";
import type {
  ArtifactSelection,
  ContentArtifactKind,
  PresentationContext,
  PresentationSource,
  ProducedArtifact,
  RegenerateInput,
} from "@/lib/presentations/types";

// Route handler driving PRES-1 artifact generation (wave 2,
// docs/pres-1-architecture.md section 6.2/B1). Mirrors
// src/app/api/class-trends-insight/route.ts's shape: thin auth + a soft work
// budget + calls into a pure library, never a direct callLlm here.
//
// SINGLE-KIND-PER-INVOCATION (B1): this route produces exactly ONE content
// artifact per call - it does not loop selectedContentKinds() server-side,
// because looping over up to three (soon more) sequential model calls would
// blow the Vercel Hobby 60s cap (maxDuration below). The client (wave 3)
// drives the fan-out, calling this route once per selected kind.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// SOFT work budget, not merely the declared ceiling - copied pattern from
// class-trends-insight/route.ts: `maxDuration` only bounds what the platform
// allows before it kills the function, and that kill produces no response at
// all. Checking elapsed time against this budget before EACH sequential
// model call (generate, then review, or the regenerate call) lets the route
// stop itself and return a worded partial result instead of letting the
// platform truncate it silently.
const SOFT_DEADLINE_MS = 50_000;

// The smallest remaining budget worth STARTING a call with. Below this, a
// call is not attempted at all - the route returns the 504 partial shape
// directly (B1) instead of racing a call that has no realistic chance to
// finish, and instead of passing withDeadline a near-zero or negative ms.
const MIN_CALL_BUDGET_MS = 3_000;

interface GenerateRequestBody {
  mode?: unknown;
  context?: unknown;
  selection?: unknown;
  kind?: unknown;
  withReview?: unknown;
  priorContext?: unknown;
  priorCritique?: unknown;
  priorContent?: unknown;
}

const CONTENT_KINDS: readonly ContentArtifactKind[] = ["outline", "activities", "deck"];

function isContentArtifactKind(value: unknown): value is ContentArtifactKind {
  return typeof value === "string" && (CONTENT_KINDS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPresentationSource(value: unknown): value is PresentationSource {
  return isRecord(value) && typeof value.name === "string" && typeof value.text === "string";
}

function parsePresentationContext(value: unknown): PresentationContext | null {
  if (!isRecord(value)) return null;
  if (typeof value.text !== "string") return null;
  if (!Array.isArray(value.sources) || !value.sources.every(isPresentationSource)) return null;
  return { text: value.text, sources: value.sources };
}

function parseArtifactSelection(value: unknown): ArtifactSelection | null {
  if (!isRecord(value)) return null;
  const { outline, activities, deck, review } = value;
  if (
    typeof outline !== "boolean" ||
    typeof activities !== "boolean" ||
    typeof deck !== "boolean" ||
    typeof review !== "boolean"
  ) {
    return null;
  }
  if (!outline && !activities && !deck) return null;
  return { outline, activities, deck, review };
}

function parseCritique(value: unknown): { text: string } | null {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.text !== "string") return null;
  return { text: value.text };
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "an unexpected error";
}

// Remaining wall-clock budget against SOFT_DEADLINE_MS, never negative -
// floored at 0 so a caller past the deadline sees "no time left" rather than
// a negative ms passed into withDeadline (which would fire immediately, but
// there is no reason to rely on that instead of checking explicitly).
function remainingBudgetMs(startedAtMs: number): number {
  return Math.max(0, SOFT_DEADLINE_MS - (Date.now() - startedAtMs));
}

const DEADLINE_MESSAGE =
  "There was not enough time left in this request to finish safely. Nothing was generated for this artifact - try again.";

const CALL_FAILED_MESSAGE = "The AI did not return usable content for this artifact.";

function deadlinePartialResponse() {
  return NextResponse.json({ status: "error", error: DEADLINE_MESSAGE, partial: true }, { status: 504 });
}

type BudgetedCallResult<T> = { ok: true; value: T } | { ok: false; reason: "deadline" | "error" };

// Races `work` against the REMAINING budget (never the full SOFT_DEADLINE_MS)
// so a slow or retrying library call (B1 - callLlm's own backoff, unbounded
// fetches) cannot run past the point this route needs to answer by. Mirrors
// class-trends-insight/route.ts's withDeadline usage, but distinguishes the
// timeout rejection (withDeadline's own "did not finish within" message) from
// any OTHER throw out of the library call, so the caller can return the 504
// partial shape for a real timeout and a generic styled 502 for anything
// else - never an unstyled Next 500 either way.
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

export async function POST(req: NextRequest) {
  const startedAtMs = Date.now();

  try {
    await requireUser();
  } catch (err) {
    return NextResponse.json({ status: "error", error: describeError(err) }, { status: 401 });
  }

  let body: GenerateRequestBody;
  try {
    body = (await req.json()) as GenerateRequestBody;
  } catch {
    return NextResponse.json({ status: "error", error: "Could not read the request." }, { status: 400 });
  }

  // I4: an ABSENT mode is fresh-generate (back-compat), but a PRESENT mode
  // that is not "regenerate" is a caller error, not a silent fall-through
  // into handleGenerate producing a misleading 400 further down.
  if (body.mode !== undefined && body.mode !== "regenerate") {
    const label = typeof body.mode === "string" ? `"${body.mode}"` : typeof body.mode;
    return NextResponse.json({ status: "error", error: `Unknown mode: ${label}.` }, { status: 400 });
  }

  if (body.mode === "regenerate") {
    return handleRegenerate(body, startedAtMs);
  }
  return handleGenerate(body, startedAtMs);
}

async function handleGenerate(body: GenerateRequestBody, startedAtMs: number) {
  const context = parsePresentationContext(body.context);
  if (!context) {
    return NextResponse.json({ status: "error", error: "No presentation context was posted." }, { status: 400 });
  }

  const selection = parseArtifactSelection(body.selection);
  if (!selection) {
    return NextResponse.json({ status: "error", error: "No artifact kinds were selected." }, { status: 400 });
  }

  const kind = isContentArtifactKind(body.kind) ? body.kind : null;
  if (!kind || !selection[kind]) {
    return NextResponse.json({ status: "error", error: "The requested kind was not among the selected artifacts." }, { status: 400 });
  }

  // Cheap fast-path (kept from before B1): skip the call entirely if there is
  // not even enough budget left to be worth starting. The withDeadline race
  // below is what actually ENFORCES the wall once a call is started.
  const generateBudgetMs = remainingBudgetMs(startedAtMs);
  if (generateBudgetMs <= MIN_CALL_BUDGET_MS) {
    return deadlinePartialResponse();
  }

  const generateResult = await callWithBudget(generateOneArtifact(kind, context), generateBudgetMs, "Generation");
  if (!generateResult.ok) {
    if (generateResult.reason === "deadline") {
      return deadlinePartialResponse();
    }
    return NextResponse.json({ status: "error", kind, error: CALL_FAILED_MESSAGE }, { status: 502 });
  }

  const produced = generateResult.value;
  if (!produced) {
    // A model or validation failure surfaces as an explicit failed marker -
    // NEVER a 200 that looks like success (Wave 1 verify finding).
    return NextResponse.json({ status: "error", kind, error: CALL_FAILED_MESSAGE }, { status: 502 });
  }

  let artifact: ProducedArtifact = produced;
  // I2: reviewSkipped distinguishes "review did not run because the budget
  // ran out" from "review ran and returned no critique" (a legitimate,
  // pre-existing degrade). Both currently ship the artifact at 200 with
  // critique:null, but Wave 3 needs to tell them apart, so the two cases must
  // not be byte-identical responses.
  let reviewSkipped = false;
  if (selection.review) {
    const reviewBudgetMs = remainingBudgetMs(startedAtMs);
    if (reviewBudgetMs <= MIN_CALL_BUDGET_MS) {
      reviewSkipped = true;
    } else {
      const reviewResult = await callWithBudget(reviewArtifact(produced, context), reviewBudgetMs, "Review");
      if (!reviewResult.ok) {
        // Review failing (deadline OR any other error) degrades the whole
        // response the same way a null critique always has - the content
        // artifact already generated successfully and still ships. Only a
        // deadline-caused skip is flagged for the client.
        if (reviewResult.reason === "deadline") reviewSkipped = true;
      } else if (reviewResult.value) {
        artifact = { ...produced, critique: reviewResult.value };
      }
    }
  }

  // reviewSkipped is only present when true - a legitimate "review ran,
  // critique came back null" response is unchanged from before B1/I2 (no
  // extra field), so it stays distinguishable from "review was skipped"
  // without one being a false-vs-absent footgun for callers that check
  // truthiness rather than presence.
  return reviewSkipped
    ? NextResponse.json({ status: "ok", artifact, reviewSkipped: true })
    : NextResponse.json({ status: "ok", artifact });
}

async function handleRegenerate(body: GenerateRequestBody, startedAtMs: number) {
  const kind = isContentArtifactKind(body.kind) ? body.kind : null;
  if (!kind) {
    return NextResponse.json({ status: "error", error: "No artifact kind was posted to regenerate." }, { status: 400 });
  }

  const priorContext = parsePresentationContext(body.priorContext);
  if (!priorContext) {
    return NextResponse.json({ status: "error", error: "No prior context was posted." }, { status: 400 });
  }

  if (body.priorCritique !== null && body.priorCritique !== undefined && !isRecord(body.priorCritique)) {
    return NextResponse.json({ status: "error", error: "The prior critique was malformed." }, { status: 400 });
  }
  const priorCritique = parseCritique(body.priorCritique ?? null);

  if (typeof body.withReview !== "boolean") {
    return NextResponse.json({ status: "error", error: "withReview must be a boolean." }, { status: 400 });
  }

  const input: RegenerateInput = {
    kind,
    priorContext,
    priorCritique,
    priorContent: (body.priorContent ?? null) as RegenerateInput["priorContent"],
    withReview: body.withReview,
  };

  const regenerateBudgetMs = remainingBudgetMs(startedAtMs);
  if (regenerateBudgetMs <= MIN_CALL_BUDGET_MS) {
    return deadlinePartialResponse();
  }

  const regenerateResult = await callWithBudget(regenerateArtifact(input), regenerateBudgetMs, "Regeneration");
  if (!regenerateResult.ok) {
    if (regenerateResult.reason === "deadline") {
      return deadlinePartialResponse();
    }
    return NextResponse.json({ status: "error", kind, error: CALL_FAILED_MESSAGE }, { status: 502 });
  }

  const artifact = regenerateResult.value;
  if (!artifact) {
    return NextResponse.json({ status: "error", kind, error: CALL_FAILED_MESSAGE }, { status: 502 });
  }

  return NextResponse.json({ status: "ok", artifact });
}
