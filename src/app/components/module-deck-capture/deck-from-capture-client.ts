// The client `fetch` wrapper for POST /api/lms-generation/deck-from-capture
// (src/app/api/lms-generation/deck-from-capture/route.ts, read in full
// before writing this file) - both sides of the generation boundary share
// this one owner so the route and its only caller cannot drift, mirroring
// generateDeckApi/DeckGenerationRequest's own split for the sibling
// selection-driven deck route (content-tab/modules/lmsGenerationDeckHelpers.ts,
// src/lib/lms-generation/deck.ts).
//
// Deliberately NOT generateDeckApi itself (docs/module-walkthrough-deck-
// acceptance-criteria.md AM-J instructs against reuse here): that function
// hardcodes "/api/lms-generation/deck" and its own DeckGenerationRequest
// shape (items/moduleIds, no materialsText) - reusing it would mean widening
// BOTH the URL and the request type behind one function, the same widening
// this feature's route itself was built as a sibling specifically to avoid.
// This file exists so that avoidance is total: neither side of this
// boundary reuses the selection-driven pair's shapes.
import type { GeneratedArtifact } from "@/lib/supabase/generated-artifacts";
import type { LlmProvider } from "@/lib/llm";
import { checkWireBudget } from "@/lib/upload-budget";

/**
 * The request body POST /api/lms-generation/deck-from-capture expects - the
 * ONE owner of this shape (route.ts imports it, type-only, from here rather
 * than declaring its own copy), so the route and its only caller can never
 * drift out of shape, mirroring DeckGenerationRequest's own role for the
 * sibling selection-driven deck route (src/lib/lms-generation/deck.ts).
 *
 * `courseUrl` is always sent, even "" for an export-sourced selection (whose
 * identity instead rides on `courseId`) - matches DeckGenerationRequest's own
 * `courseUrl` field exactly, so the route's course-resolution branch (copied
 * verbatim from deck/route.ts) can stay byte-identical between the two
 * routes.
 */
export interface DeckFromCaptureRequest {
  courseUrl: string;
  /** An export-sourced selection's course_hub row id - present instead of a
   * resolvable `courseUrl`. Undefined for a live selection. */
  courseId?: string;
  acronym?: string;
  moduleLabel?: string;
  templateId: string;
  /** The extracted, deduped, capped capture text - this request's only
   * grounding input. Refused server-side when blank/whitespace-only; see
   * checkCaptureMaterialsWireBudget below for the size guard that runs
   * BEFORE this is ever sent. */
  materialsText: string;
  provider?: LlmProvider;
}

export interface DeckFromCaptureSuccess {
  artifact: GeneratedArtifact;
}

export interface DeckFromCaptureFailure {
  error: string;
  courseNotLinked?: true;
}

/** DE15: `generateDeckFromTemplateAction` performs no `checkWireBudget` and
 * no size check of any kind, and `buildDeckPrompt` interpolates
 * `${ctx.materials}` raw - this feature owns the only guard on this path.
 * G2's DECK_MATERIALS_CAP = 120_000 (characters) is the primary, intended
 * bound (the "braces"); this is the belt - a defense-in-depth check against
 * the actual WIRE budget a JSON body must fit under (see upload-budget.ts's
 * own header comment on why a request over Vercel's ~4.5MB platform cap is
 * rejected BEFORE this route's handler ever runs, turning a bug elsewhere
 * into the exact opaque failure that module exists to prevent). Measured in
 * real UTF-8 bytes (never `.length`, which counts UTF-16 code units and
 * under-counts any non-ASCII character), because this string rides the wire
 * as plain JSON text, never base64 - there is no 4/3 inflation to apply here,
 * unlike a base64-encoded file upload. */
export function checkCaptureMaterialsWireBudget(materialsText: string) {
  const wireBytes = new TextEncoder().encode(materialsText).length;
  return checkWireBudget(wireBytes, "The captured material");
}

/**
 * Calls the deck-from-capture Route Handler. Mirrors generateDeckApi's own
 * non-JSON guard exactly (content-tab/modules/lmsGenerationDeckHelpers.ts:
 * 37-58, read in full before writing this): a non-JSON response (an auth
 * redirect, a platform timeout page) is treated as a clean error instead of
 * letting `JSON.parse` throw "Unexpected token '<'". This is what makes a
 * mid-generation timeout fail safely - the route never writes a version
 * until generation fully succeeds (its own header comment), so a timeout
 * here is guaranteed to mean nothing was saved, never a truncated deck.
 *
 * Refuses locally, before any network call, when `materialsText` exceeds the
 * wire budget (DE15/AC13) - the platform would otherwise reject the request
 * outright and this function would report a generic network failure instead
 * of the specific, actionable reason checkWireBudget already names.
 */
export async function generateDeckFromCaptureApi(
  payload: DeckFromCaptureRequest
): Promise<DeckFromCaptureSuccess | DeckFromCaptureFailure> {
  const budget = checkCaptureMaterialsWireBudget(payload.materialsText);
  if (!budget.ok) {
    return { error: budget.error ?? "The captured material is too large to send." };
  }

  try {
    const res = await fetch("/api/lms-generation/deck-from-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.headers.get("content-type")?.includes("application/json")) {
      return {
        error:
          res.status === 401 || res.status === 403
            ? "Your session expired - sign in again."
            : `Deck generation failed or timed out (HTTP ${res.status}). Try a shorter capture or a simpler template.`,
      };
    }
    return (await res.json()) as DeckFromCaptureSuccess | DeckFromCaptureFailure;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error" };
  }
}
