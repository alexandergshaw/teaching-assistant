// Label cache for the two run-form course selectors that persist only an
// id/url in localStorage: the course tile picker (`hubCourse` field type,
// RuntimeFieldInput.tsx) and the Canvas course picker (`lmsCourse` field
// type, CoursePicker.tsx). Both restore the saved id synchronously on page
// load, but the options list that would resolve that id to a human name
// loads asynchronously - and can fail outright. Without a cached name, the
// raw id is the only thing available to show during that window, and
// permanently if the load errors. See docs/REGRESSION.md for the AC this
// closes.
//
// This module is a CACHE, never a source of truth: `resolveSelectorLabel`
// always prefers a freshly loaded options list over anything cached here,
// and neither function here ever hands back anything that should be
// submitted as a value - callers keep using the real id/url for that, exactly
// as they did before this cache existed. A stale or wrong cached label can
// only ever change what text is displayed, never what gets submitted.

/**
 * Which selector a cached id belongs to. Ids are only unique WITHIN a kind -
 * a course-hub tile id and a Canvas course id are different id spaces, so a
 * bare id alone is not a safe cache key.
 */
export type SelectorKind = "hubCourse" | "lmsCourse";

/**
 * Shown when neither a loaded options list nor the cache knows a name for
 * the current id. Deliberately generic rather than fabricated - the point of
 * this whole module is that the raw id must never stand in for a name, and a
 * made-up name would be just as misleading as the id was.
 */
export const UNKNOWN_SELECTOR_LABEL = "Unnamed course";

const CACHE_KEY = "ta-course-selector-labels";

type LabelCache = Record<string, string>;

function cacheKeyFor(kind: SelectorKind, id: string): string {
  return `${kind}:${id}`;
}

function readCache(): LabelCache {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: LabelCache = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeCache(cache: LabelCache): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage write failures (quota exceeded, private browsing, etc.)
    // - this is a cache, so losing a write just means a future render falls
    // back to the neutral placeholder instead of a name. Never fatal.
  }
}

/** Read a previously cached label for `id`, or null if none is known. */
export function readCachedSelectorLabel(kind: SelectorKind, id: string): string | null {
  if (!id) return null;
  return readCache()[cacheKeyFor(kind, id)] ?? null;
}

/**
 * Cache `label` for `id`. Call this the moment a name is known for certain:
 * when the user selects an item from a loaded list, or when a loaded list
 * reveals a (possibly better) name for the currently selected id. Blank
 * labels and blank ids are no-ops - never cache a placeholder as if it were
 * a real name, or the fallback would stop being able to distinguish "we
 * don't know" from "we cached the word 'Unnamed course'".
 */
export function writeCachedSelectorLabel(kind: SelectorKind, id: string, label: string): void {
  const trimmed = label.trim();
  if (!id || !trimmed) return;
  const cache = readCache();
  const key = cacheKeyFor(kind, id);
  if (cache[key] === trimmed) return; // already up to date, skip the write
  cache[key] = trimmed;
  writeCache(cache);
}

export interface ResolveSelectorLabelParams {
  /** The selected id/url. */
  id: string;
  /**
   * This id's name from a freshly loaded options list, if the list has
   * loaded AND contains this id. Pass null/undefined while loading, on load
   * error, or when the id is absent from an otherwise-loaded list (a stale
   * selection) - all three cases fall through to the cache the same way.
   */
  optionLabel?: string | null;
  /** This id's name from the persisted cache, if any (readCachedSelectorLabel). */
  cachedLabel?: string | null;
  /** Overrides UNKNOWN_SELECTOR_LABEL for callers that want a more specific
   *  neutral placeholder. */
  fallback?: string;
}

/**
 * Resolves the display label for a course selector, in priority order:
 *   1. the loaded options list - always wins, it is the freshest truth and
 *      overrides even a cached label that disagrees with it
 *   2. the persisted cache - covers the loading window and permanent load
 *      failures, when the options list cannot yet (or ever) answer
 *   3. a neutral fallback - never the raw id, and never a fabricated name
 */
export function resolveSelectorLabel({
  id,
  optionLabel,
  cachedLabel,
  fallback = UNKNOWN_SELECTOR_LABEL,
}: ResolveSelectorLabelParams): string {
  if (!id) return fallback;
  const trimmedOption = optionLabel?.trim();
  if (trimmedOption) return trimmedOption;
  const trimmedCached = cachedLabel?.trim();
  if (trimmedCached) return trimmedCached;
  return fallback;
}
