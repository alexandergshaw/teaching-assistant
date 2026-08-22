import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/supabase/auth";
import { loadVisualizerIndexAction } from "@/app/actions/live-class";
import { createVisualizerConceptAction } from "@/app/actions/visualizer";
import { matchConcept, VISUALIZER_TOPICS, creatableTopics } from "@/lib/visualizer";
import type { LlmProvider } from "@/lib/llm";
import {
  VISUALIZER_CREATE_MAX_PAGES,
  type GapConcept,
  type VisualizerCreateInput,
  type VisualizerCreateSuccess,
} from "@/lib/visualizer/selection-coverage";

// Visualizer page CREATION (docs/visualizer-coverage-from-selection-
// acceptance-criteria.md, B1-B5) runs behind a Route Handler, not
// createVisualizerPagesForGapsAction (a Server Action, formerly in
// src/app/actions/visualizer-selection.ts) - exactly the reason
// src/app/api/lms-generation/deck/route.ts already moved deck generation off
// generateFromSelectionAction (read that route's own header comment in full:
// it explains the identical constraint this file inherits). Each gap costs
// roughly two LLM round trips (a topic pick, then component authoring at up
// to 4096 output tokens, plus one full retry when validation fails - see
// createVisualizerConceptAction below) and five GitHub operations (two file
// reads, three sequential putFile commits). That loop used to run from a
// Server Action reachable from src/app/page.tsx - a client component that
// sets no `maxDuration`, so every Server Action reachable from it is capped
// by whatever the platform's un-configured default happens to grant, never
// an explicit, confirmed ceiling. A Route Handler CAN declare one.
//
// Requesting 300s does not, by itself, GRANT 300s: this repo's own
// deployment note records prod as Vercel Hobby, whose real hard ceiling is
// 60s regardless of what a route requests - the deck route's own header
// comment states the identical fact about its own requested 300s. If
// creation is still running when that ceiling hits, the platform kills the
// function outright - no response ever reaches the client's fetch (see
// useVisualizerCoverage.ts's createVisualizerPagesApi, which treats a
// non-JSON response, e.g. a platform timeout page, as a clean error rather
// than letting JSON.parse throw). VISUALIZER_CREATE_MAX_PAGES
// (src/lib/visualizer/selection-coverage.ts) is sized against the REAL,
// confirmed 60s Hobby ceiling, not the 300s requested here - see that
// constant's own doc comment for the full arithmetic, and for why it STAYS
// at 2 rather than trading margin away for throughput.
//
// A PLATFORM KILL MID-RUN IS ALSO A PARTIAL-COMMIT HAZARD, not merely a lost
// response. createVisualizerConceptAction commits three files per concept -
// component, topic page, then navItems.ts LAST (src/app/actions/
// visualizer.ts, the three sequential putFile calls at the end of that
// function). If the platform kills the function between the topic-page
// commit and the navItems.ts commit, the component and topic-page case stay
// committed to the external repo with NO nav entry - an orphaned half-
// written page - and the client never receives a response, so the
// instructor sees a bare timeout with no list of what was actually created.
// Worse, this is not self-healing: B4's fresh-index re-check below (and in
// the scan) reads navItems.ts (src/app/actions/live-class.ts's
// loadVisualizerIndexAction), so the orphaned concept has NO nav entry to be
// found by, matchConcept never matches it, and a re-run treats it as still a
// gap - re-authoring a new component over the half-written page rather than
// skipping it. Nothing in this handler can detect or repair that: see A5
// below.
//
// A5 (docs/visualizer-coverage-from-selection-acceptance-criteria.md): A
// PLATFORM KILL MID-RUN CANNOT BE INTERCEPTED FROM INSIDE THIS HANDLER, a
// Route Handler included - no `finally`, no `catch`, no cleanup runs when
// the platform kills the function, and no response reaches the client
// either way (which is exactly what makes the orphan case above possible in
// the first place - there is no way to roll back the already-committed
// files or warn the instructor which concept is now half-written). Moving
// off a Server Action changes WHICH ceiling this handler is confirmed to
// get; it does not change this fact even a little. The per-gap try/catch
// loop below only protects against an IN-PROCESS failure the platform did
// NOT kill the function for - VISUALIZER_CREATE_MAX_PAGES is the ACTUAL
// defense against ever getting close to a real platform kill, exactly as it
// already was before this move (see that constant's own doc comment). Do
// not read this route's explicit `maxDuration` as a guarantee against that
// failure mode; it is not one.
export const runtime = "nodejs";
export const maxDuration = 300;

// FINDING 14 (nit): `provider` arrives on the wire as an unvalidated string,
// not a real LlmProvider. Owner-gated already, and createVisualizerConceptAction
// itself refuses anything that is not a real provider ("embedded" included -
// src/app/actions/visualizer.ts), so this is defence-in-depth rather than a
// live hole. Added for symmetry with isCreatableGapConcept below, which
// applies the same "never trust a caller-supplied label, verify it
// ourselves" rule to `reason`.
const VALID_PROVIDERS: readonly LlmProvider[] = ["gemini", "other", "embedded"];
function isValidProvider(value: unknown): value is LlmProvider {
  return typeof value === "string" && (VALID_PROVIDERS as readonly string[]).includes(value);
}

/**
 * FINDING 9 fix: re-derive whether a gap concept is creatable from the SAME
 * inputs classifySelectionCoverage (src/lib/visualizer/selection-coverage.ts)
 * itself uses - matchConcept against the freshly-loaded index, then whether
 * the matched topic is one of creatableTopics() - rather than trusting the
 * caller-supplied `reason` field. `reason` arrives IN THE POST BODY, and a
 * hand-crafted payload can set it to anything:
 * `{"concepts":[{"concept":"Semantic Tags","evidence":"","reason":"no-match"}]}`
 * for a concept that genuinely already matches a non-creatable index entry
 * (e.g. an HTML topic nav leaf) sails past a filter that reads `reason`
 * alone. This function ignores `reason` entirely and answers the question
 * itself: a concept is creatable unless it matches an EXISTING index entry
 * whose topic is confirmed non-creatable. Nothing matched, or a matched-and-
 * creatable topic, is eligible regardless of what the payload claims.
 *
 * Blast radius of the bug this closes was limited even before this fix (be
 * fair about it): createVisualizerConceptAction never reads `reason` either
 * - it always picks its own topic from creatableTopics() (falling back to
 * programming-basics when the LLM's pick is not creatable) and sanitises the
 * slug/component name, so there was no path traversal and no page actually
 * created under a non-creatable topic even with the old, trusting filter.
 * This still matters because V4 requires the property be enforced ON THE
 * SERVER, not merely true by construction elsewhere - a hand-crafted payload
 * should not be ABLE to relabel its way past this route's own gate, whether
 * or not today's downstream code happens to catch it too.
 */
function isCreatableGapConcept(
  concept: string,
  entries: Array<{ topicExport: string; label: string; value: string }>
): boolean {
  const match = matchConcept(entries, concept);
  if (!match) return true;
  const topic = VISUALIZER_TOPICS.find((t) => t.navExport === match.topicExport);
  if (!topic) return true;
  return creatableTopics().some((t) => t.key === topic.key);
}

export async function POST(req: NextRequest) {
  try {
    await requireOwner();

    const body = (await req.json()) as Partial<VisualizerCreateInput>;
    const rawConcepts: GapConcept[] = Array.isArray(body.concepts) ? body.concepts : [];
    const candidates = rawConcepts.filter((c): c is GapConcept => Boolean(c && c.concept));
    if (candidates.length === 0) {
      return NextResponse.json({ error: "No creatable gap concepts were provided." });
    }

    // B4: the visualizer index is re-read FRESH here, at creation time -
    // never trusted from the scan's own (possibly stale) snapshot - so a
    // concept that gained a page since the scan is skipped rather than
    // duplicated below. The SAME fresh read also backs the FINDING 9
    // re-derivation immediately below, so both checks are made against one
    // real, just-loaded index rather than anything the client claims about
    // it.
    const index = await loadVisualizerIndexAction();
    if ("error" in index) return NextResponse.json({ error: index.error });

    // A4/B1/FINDING 9, enforced HERE regardless of what a hand-crafted
    // payload sends: `reason` is NEVER read. Creatability is re-derived from
    // the fresh index (isCreatableGapConcept above), so a gap that actually
    // matches a non-creatable topic can never reach creation no matter what
    // label the caller attaches to it.
    const creatableGaps = candidates.filter((c) => isCreatableGapConcept(c.concept, index.entries));
    if (creatableGaps.length === 0) {
      return NextResponse.json({ error: "No creatable gap concepts were provided." });
    }

    // Cap BEFORE any work starts - see VISUALIZER_CREATE_MAX_PAGES' own doc
    // comment for the time-budget arithmetic behind the number.
    const toAttempt = creatableGaps.slice(0, VISUALIZER_CREATE_MAX_PAGES);

    const provider: LlmProvider = isValidProvider(body.provider) ? body.provider : "gemini";
    const created: VisualizerCreateSuccess["created"] = [];
    const skipped: string[] = [];
    const failed: VisualizerCreateSuccess["failed"] = [];

    for (const gap of toAttempt) {
      try {
        if (matchConcept(index.entries, gap.concept)) {
          skipped.push(gap.concept);
          continue;
        }

        // B2: the gap's own scan-time evidence is passed as `context`, so the
        // generated component is grounded in the instructor's material. B5:
        // this is the ONLY external write in this handler - never
        // createModuleItemAction or any other Canvas call (this route never
        // imports @/app/actions/canvas-modules at all, so B5 is enforced
        // structurally, not merely by omission inside one function body).
        const result = await createVisualizerConceptAction(gap.concept, gap.evidence, provider);
        if ("error" in result) {
          failed.push({ concept: gap.concept, error: result.error });
          continue;
        }
        created.push({ concept: gap.concept, url: result.url });
      } catch (err) {
        // B3: isolated to THIS gap only - matchConcept and
        // createVisualizerConceptAction share one try/catch per gap so
        // neither can abort the loop and erase earlier gaps' already-
        // committed pages.
        failed.push({
          concept: gap.concept,
          error: err instanceof Error ? err.message : "Could not create the visualizer page.",
        });
      }
    }

    // A SILENT truncation would be worse than the cap itself: `notAttempted`
    // is computed from the full `creatableGaps` set (not just the excess past
    // VISUALIZER_CREATE_MAX_PAGES) so it also covers the pathological case
    // where this run stops before even reaching every capped concept.
    const reached = new Set([...created.map((c) => c.concept), ...skipped, ...failed.map((f) => f.concept)]);
    const notAttempted = creatableGaps.filter((c) => !reached.has(c.concept)).map((c) => c.concept);

    return NextResponse.json({ created, skipped, failed, notAttempted } satisfies VisualizerCreateSuccess);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create the visualizer pages." },
      { status: 500 }
    );
  }
}
