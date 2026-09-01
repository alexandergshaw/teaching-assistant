// docs/reply-composition-controls-acceptance-criteria.md C5a, this group's
// own C-2: coercion for the announcement surface's two persisted composition
// keys (their exact literal spelling lives only in useTakeAnnouncement.ts's
// state initializer and setComposition - never restated here, so this
// comment can never poison the key-inventory scan in
// recording-split.structure.test.ts), kept in a plain exported function -
// never inline in a useState initializer - because
// vitest here renders no hook and an inline coercion would have no test
// surface at all. Mirrors coerceReplyComposition (discussion-draft-loop.ts)
// field-for-field: never throws, an unrecognised or malformed stored value
// falls back to DEFAULT_ANNOUNCEMENT_COMPOSITION rather than reaching the
// prompt builder.

import {
  ANNOUNCEMENT_INGREDIENTS,
  DEFAULT_ANNOUNCEMENT_COMPOSITION,
  type AnnouncementCompositionSettings,
  type AnnouncementIngredient,
} from "@/lib/take-announcement";
import { REPLY_FORMALITY_STOPS, type ReplyFormality } from "@/lib/discussion-reply-prompt";

/**
 * Coerce the two raw localStorage reads (`rawIngredients`, a JSON array;
 * `rawFormality`, the literal stop name) into a valid
 * AnnouncementCompositionSettings. Never throws:
 *  - a missing key, malformed JSON, a non-array blob, or an ingredient id
 *    outside ANNOUNCEMENT_INGREDIENTS falls back to
 *    DEFAULT_ANNOUNCEMENT_COMPOSITION.ingredients;
 *  - a missing key or a formality string outside REPLY_FORMALITY_STOPS falls
 *    back to DEFAULT_ANNOUNCEMENT_COMPOSITION.formality ("balanced").
 * An empty array (`"[]"`) is a legal, distinct value - "nothing selected" -
 * and is NOT coerced to the default; only genuinely unreadable input is.
 */
export function coerceAnnouncementComposition(
  rawIngredients: string | null,
  rawFormality: string | null
): AnnouncementCompositionSettings {
  let ingredients: readonly AnnouncementIngredient[] = DEFAULT_ANNOUNCEMENT_COMPOSITION.ingredients;
  if (rawIngredients !== null) {
    try {
      const parsed: unknown = JSON.parse(rawIngredients);
      if (Array.isArray(parsed)) {
        const seen = new Set<AnnouncementIngredient>();
        for (const v of parsed) {
          if (typeof v === "string" && (ANNOUNCEMENT_INGREDIENTS as readonly string[]).includes(v)) {
            seen.add(v as AnnouncementIngredient);
          }
        }
        ingredients = Array.from(seen);
      }
      // Array.isArray(parsed) false - a non-array blob (an object, a bare
      // string, a number) - falls through with `ingredients` left at the
      // default set above.
    } catch {
      // Malformed JSON - fall back to the default, never throw.
    }
  }

  const formality: ReplyFormality =
    rawFormality !== null && (REPLY_FORMALITY_STOPS as readonly string[]).includes(rawFormality)
      ? (rawFormality as ReplyFormality)
      : DEFAULT_ANNOUNCEMENT_COMPOSITION.formality;

  return { ingredients, formality };
}
