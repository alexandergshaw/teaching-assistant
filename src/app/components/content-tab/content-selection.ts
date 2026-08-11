// Persisted Course Content tab selection: WHICH course, and WHICH of its two
// content sources (a live Canvas connection, or a stored export) to read
// from. Replaces the bare Canvas-URL string ContentTab used to persist under
// CONTENT_URL_KEY (src/app/components/content-tab/constants.ts), now that an
// export-only course_hub row - one with no canvasUrl at all - can be
// selected too. See docs/REGRESSION.md entry 263's Limits ("the picker...
// lands next" - this is that picker) and lmsRenderSourcesFor
// (src/lib/courses-table-helpers.ts), which decides whether a given course
// even offers each source.
//
// Follows the same versioned-parse idiom courses-table-helpers.ts already
// uses for column sets (CURRENT_COLUMNS_VERSION / parseColumnSet): a version
// number plus a migration path, so an already-persisted value never crashes
// and never silently drops the instructor's saved course. The legacy shape
// here is a BARE, un-JSON-encoded string - every version of ContentTab
// before this feature wrote `localStorage.setItem(CONTENT_URL_KEY, url)`
// directly, never JSON.stringify'd - so it is detected simply by "JSON.parse
// fails, or succeeds with something other than the versioned object shape",
// since a real Canvas URL/path (e.g. "/courses/12345") is essentially never
// valid JSON on its own.

export type ContentSelection = { source: "live"; courseUrl: string } | { source: "export"; courseId: string };

const CURRENT_SELECTION_VERSION = 1;

/** "Nothing chosen yet" - a fresh install (no persisted value at all) and an
 * explicit empty legacy string both resolve here. `courseUrl: ""` matches
 * every "no course loaded" check already in ContentTab
 * (parseCanvasCourseId("") is null). */
export const EMPTY_CONTENT_SELECTION: ContentSelection = { source: "live", courseUrl: "" };

/**
 * Parse a persisted ta-content-course-url value. Never throws - any parse
 * failure or unrecognized shape falls back to EMPTY_CONTENT_SELECTION, same
 * as parseColumnSet's own catch-all in courses-table-helpers.ts.
 */
export function parseContentSelection(raw: string | null | undefined): ContentSelection {
  if (!raw) return EMPTY_CONTENT_SELECTION;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not valid JSON at all - the pre-versioning code stored the bare
    // Canvas URL directly, so `raw` itself IS that URL. Migrate it to a live
    // selection rather than losing it.
    return { source: "live", courseUrl: raw };
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    typeof (parsed as { v?: unknown }).v === "number" &&
    (parsed as { selection?: unknown }).selection &&
    typeof (parsed as { selection?: unknown }).selection === "object" &&
    !Array.isArray((parsed as { selection?: unknown }).selection)
  ) {
    const sel = (parsed as { selection: { source?: unknown; courseUrl?: unknown; courseId?: unknown } }).selection;
    if (sel.source === "live" && typeof sel.courseUrl === "string") {
      return { source: "live", courseUrl: sel.courseUrl };
    }
    if (sel.source === "export" && typeof sel.courseId === "string" && sel.courseId.trim()) {
      return { source: "export", courseId: sel.courseId };
    }
    return EMPTY_CONTENT_SELECTION;
  }

  // Valid JSON, but not the versioned object shape: a JSON-quoted legacy
  // string (defensive - nothing in this codebase writes the value that way,
  // but a hand-edited localStorage value should still migrate rather than be
  // dropped) or otherwise malformed data, which falls back to empty exactly
  // like parseColumnSet's own catch-all does for its own malformed shapes.
  if (typeof parsed === "string") {
    return parsed.trim() ? { source: "live", courseUrl: parsed } : EMPTY_CONTENT_SELECTION;
  }

  return EMPTY_CONTENT_SELECTION;
}

/** Serialize a selection at the current version. Callers should re-serialize
 * (via this function) whenever they persist a value read through
 * parseContentSelection, so a legacy value is upgraded on write. */
export function serializeContentSelection(selection: ContentSelection): string {
  return JSON.stringify({ v: CURRENT_SELECTION_VERSION, selection });
}

/**
 * Stable key that fully disambiguates a selection for use as a React `key`
 * prop. `courseUrl` collapses to "" for EVERY export-only course (there is
 * no Canvas URL at all), so keying a remounted view on `courseUrl` alone -
 * as ContentTab did before this feature - would make two DIFFERENT
 * export-only courses share one key, letting useModuleSelection's Sets and
 * useLmsGeneration's preview state leak from one into the other
 * (docs/REGRESSION.md entry 260 checks 1/2). Prefixing by source also keeps
 * a live and an export selection from colliding even if a courseUrl and a
 * courseId happened to be the same string.
 */
export function contentSelectionKey(selection: ContentSelection): string {
  return selection.source === "live" ? `live:${selection.courseUrl}` : `export:${selection.courseId}`;
}
