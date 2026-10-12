import { NextRequest, NextResponse } from "next/server";

import { requireOwner } from "@/lib/supabase/auth";
import { raceWithTimeout } from "@/lib/bounded-race";
import { MODEL_WAIT_RESERVE_MS, TOTAL_BUDGET_MS, remainingModelBudgetMs } from "@/lib/llm-deadline";
import { draftDiscussionRepliesAction, gatherReplyResourcesAction } from "@/app/actions/discussion-replies";

// G4 Wave 2 (docs/g4-timeout-bounding-scope.md section 5): the client-facing
// boundary for the discussion-replies model work. A Server Action reached from
// the "use client" page cannot declare a ceiling, so a slow model ended in a
// raw transport failure when the platform killed the invocation. This route
// declares one and answers with a WORDED error before that kill.
//
// requireOwner() is what the two migrated actions used, so the gate is carried
// unchanged (neither widened nor narrowed); the actions re-check it themselves.
//
// Honest limit: raceWithTimeout bounds how long the CALLER waits. It cannot
// cancel the abandoned model call, which keeps running (and spending quota)
// until the platform reclaims the process.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type DraftArgs = Parameters<typeof draftDiscussionRepliesAction>;
type GatherArgs = Parameters<typeof gatherReplyResourcesAction>;

type RequestBody =
  | { op: "draft"; args: DraftArgs }
  | { op: "gather"; args: GatherArgs };

// The wording carries "timed out" on purpose: chatSeamDiagnostic.ts's
// classifier matches /time(d)?[ -]?out|deadline|aborted/i. withDeadline's own
// "did not finish within N seconds" wording matches none of those.
function timeoutMessage(op: RequestBody["op"]): string {
  const what = op === "draft" ? "Drafting replies" : "Finding resources";
  return `${what} timed out - the AI took too long to respond. Try again.`;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "an unexpected error";
}

/**
 * ms the whole action may run, or 0 for "do not start". The sentinel check
 * always goes through remainingModelBudgetMs. A draft is one model call, so its
 * per-call window is the right bound. A gather runs a multi-call search loop
 * inside the action, so capping it at the per-call maximum would cut runs that
 * legitimately finish; it gets the whole remaining invocation budget instead.
 */
function budgetFor(op: RequestBody["op"], startedAtMs: number, now: number): number {
  const perCall = remainingModelBudgetMs(startedAtMs, now);
  if (perCall === 0) return 0;
  if (op === "draft") return perCall;
  return TOTAL_BUDGET_MS - MODEL_WAIT_RESERVE_MS - (now - startedAtMs);
}

export async function POST(req: NextRequest) {
  const startedAtMs = Date.now();

  try {
    await requireOwner();
  } catch (err) {
    return NextResponse.json({ error: describeError(err) }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Could not read the request." }, { status: 400 });
  }
  if (!body || (body.op !== "draft" && body.op !== "gather") || !Array.isArray(body.args)) {
    return NextResponse.json({ error: "Could not read the request." }, { status: 400 });
  }

  const budgetMs = budgetFor(body.op, startedAtMs, Date.now());
  // OR-1: raceWithTimeout does not cancel the loser, so a zero budget must
  // return BEFORE the model work is constructed, or the call would still fire.
  if (budgetMs <= 0) {
    return NextResponse.json({ error: timeoutMessage(body.op) }, { status: 504 });
  }

  const work: Promise<unknown> =
    body.op === "draft"
      ? draftDiscussionRepliesAction(...body.args)
      : gatherReplyResourcesAction(...body.args);
  const outcome = await raceWithTimeout(work, budgetMs);

  if (outcome.kind === "timedout") {
    return NextResponse.json({ error: timeoutMessage(body.op) }, { status: 504 });
  }
  if (outcome.kind === "failed") {
    return NextResponse.json({ error: describeError(outcome.error) }, { status: 502 });
  }
  return NextResponse.json(outcome.value);
}
