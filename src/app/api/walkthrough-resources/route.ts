import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/supabase/auth";
import { raceWithTimeout } from "@/lib/bounded-race";
import { MODEL_WAIT_RESERVE_MS, TOTAL_BUDGET_MS, remainingModelBudgetMs } from "@/lib/llm-deadline";
import { gatherWalkthroughResourcesAction } from "@/app/actions/walkthrough-announcement";

// G4 Wave 3b (docs/g4-s2-reachability.md, Surface S2): the client-facing
// boundary for the walkthrough announcement's resource research. A Server
// Action reached from the "use client" adapter hook cannot declare a ceiling,
// so a slow model ended in a raw transport failure when the platform killed the
// invocation. This route declares one and answers with a WORDED error before
// that kill.
//
// requireUser() is what the action used (NOT requireOwner), so the gate is
// carried unchanged; the action re-checks it itself.
//
// Honest limit: raceWithTimeout bounds how long the CALLER waits. It cannot
// cancel the abandoned model call, which keeps running until the platform
// reclaims the process.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type GatherArgs = Parameters<typeof gatherWalkthroughResourcesAction>;

interface RequestBody {
  args: GatherArgs;
}

// The wording carries "timed out" on purpose: the client's failure classifier
// matches /time(d)?[ -]?out|deadline|aborted/i.
const TIMEOUT_MESSAGE = "Gathering resources timed out - the AI took too long to respond. Try again.";

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "an unexpected error";
}

/**
 * ms the whole action may run, or 0 for "do not start". The sentinel check goes
 * through remainingModelBudgetMs. The action runs several model calls (concept
 * derivation, then the search loop), so it gets the whole remaining invocation
 * budget rather than the per-call maximum.
 */
function budgetFor(startedAtMs: number, now: number): number {
  if (remainingModelBudgetMs(startedAtMs, now) === 0) return 0;
  return TOTAL_BUDGET_MS - MODEL_WAIT_RESERVE_MS - (now - startedAtMs);
}

export async function POST(req: NextRequest) {
  const startedAtMs = Date.now();

  try {
    await requireUser();
  } catch (err) {
    return NextResponse.json({ error: describeError(err) }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Could not read the request." }, { status: 400 });
  }
  if (!body || !Array.isArray(body.args)) {
    return NextResponse.json({ error: "Could not read the request." }, { status: 400 });
  }

  const budgetMs = budgetFor(startedAtMs, Date.now());
  // OR-1: raceWithTimeout does not cancel the loser, so a zero budget must
  // return BEFORE the model work is constructed, or the call would still fire.
  if (budgetMs <= 0) {
    return NextResponse.json({ error: TIMEOUT_MESSAGE }, { status: 504 });
  }

  const outcome = await raceWithTimeout(gatherWalkthroughResourcesAction(...body.args), budgetMs);

  if (outcome.kind === "timedout") {
    return NextResponse.json({ error: TIMEOUT_MESSAGE }, { status: 504 });
  }
  if (outcome.kind === "failed") {
    return NextResponse.json({ error: describeError(outcome.error) }, { status: 502 });
  }
  return NextResponse.json(outcome.value);
}
