// Deck-specific helpers extracted from useLmsGeneration.ts to keep that file
// under this repo's 1000-line ceiling - a STRUCTURAL split only, no
// behaviour change. `generateDeckApi` is called from useLmsGeneration.ts's
// own `generate` (the call site itself, `await generateDeckApi({...})`,
// stays in that file - see its own M12 reachability-guard test); only this
// function's DEFINITION moved. `deckTemplateOptionsFrom` is re-exported from
// useLmsGeneration.ts so every existing import of that file keeps compiling
// unchanged. See useLmsGeneration.test.ts for the executable coverage of
// deckTemplateOptionsFrom.

import type { DeckGenerationRequest, DeckGenerationSuccess, DeckGenerationFailure } from "@/lib/lms-generation/deck";
import type { DeckTemplate } from "@/lib/decks/types";

/**
 * Calls the deck Route Handler (src/app/api/lms-generation/deck/route.ts)
 * rather than generateFromSelectionAction (a Server Action) - deck
 * generation can run several sequential LLM calls (see that route's own
 * header comment) and routinely exceeds what a Server Action can spend on
 * this page (src/app/page.tsx sets no `maxDuration`). Mirrors
 * AccessibilityProvider.tsx's own `a11yApi` exactly: a non-JSON response (an
 * auth redirect to the login page, a platform timeout page) is treated as a
 * clean error instead of letting `JSON.parse` throw "Unexpected token '<'".
 * This is what makes a mid-generation timeout fail safely - the route never
 * writes a version until generation fully succeeds (its own header comment),
 * so a timeout here is guaranteed to mean nothing was saved, never a
 * truncated deck.
 *
 * `acronym` (M12, docs/module-intro-video-script-acceptance-criteria.md,
 * finding 15): NOT yet part of DeckGenerationRequest's own declared shape
 * (src/lib/lms-generation/deck.ts, outside this chunk's file set) - the
 * route handler already reads it off the request body regardless
 * (src/app/api/lms-generation/deck/route.ts: `Partial<DeckGenerationRequest>
 * & { acronym?: string }`), so this local intersection type is what lets the
 * client actually SEND the field that route is already prepared to read,
 * without editing deck.ts's own type.
 */
export async function generateDeckApi(
  payload: DeckGenerationRequest & { acronym?: string }
): Promise<DeckGenerationSuccess | DeckGenerationFailure> {
  try {
    const res = await fetch("/api/lms-generation/deck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.headers.get("content-type")?.includes("application/json")) {
      return {
        error:
          res.status === 401 || res.status === 403
            ? "Your session expired - sign in again."
            : `Deck generation failed or timed out (HTTP ${res.status}). Try a smaller selection or a simpler template.`,
      };
    }
    return (await res.json()) as DeckGenerationSuccess | DeckGenerationFailure;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error" };
  }
}

/** id/name pairs for the deck template picker - deliberately narrower than
 * the full DeckTemplate (GenerateFromSelectionSection only ever needs to
 * list and select by id). Built-in presets first (DECK_PRESETS is
 * synchronous, zero-network, so the dropdown is never empty even before the
 * instructor's saved templates below finish loading), then this user's own
 * saved deck_templates rows, in listDeckTemplatesAction's own order. */
export interface DeckTemplateOption {
  id: string;
  name: string;
}

export function deckTemplateOptionsFrom(templates: DeckTemplate[]): DeckTemplateOption[] {
  return templates.map((t) => ({ id: t.id, name: t.name }));
}
