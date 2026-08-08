// Pure Link-header (RFC 5988) parser for Canvas's paginated list endpoints.
//
// A SEPARATE, more permissive sibling of parseNextLink already in
// ../canvas-core.ts (used throughout src/lib/canvas/listings.ts,
// submissions.ts, auto-zero.ts, grading-queue.ts and
// canvas-modules/fetch-helpers.ts). That existing helper requires an exact
// `rel="next"` (double-quoted, case-sensitive) and is left completely
// untouched here - it has real callers today and changing its matching
// rules is out of scope for this feature. This module exists because the
// weekly-announcement-scheduling feature's own TDD suite
// (src/lib/announcement-schedule.test.ts) imports `parseNextLink` from this
// exact path and requires tolerance the existing helper does not have:
// case-insensitive `rel`, unquoted or single-quoted values, and explicit
// rejection of a decoy like `rel="next-page"`.
//
// Kept dependency-free and framework-agnostic (no fetch, no DOM) so it is
// safe to import from a workflow registry file, which is client-bundled -
// see docs/weekly-announcement-scheduling-acceptance-criteria.md AC8 item 30.

/**
 * The `rel="next"` URL from a Link header, or null when there isn't one.
 * Absence of `rel="next"` is the ONLY reliable stop condition for Canvas's
 * pagination - Canvas may omit `rel="last"` when the total is expensive to
 * compute, so a reader that waits for `rel="last"` would stop after page
 * one. Link URLs are treated as opaque and returned verbatim (never
 * rewritten or re-parsed).
 */
export function parseNextLink(header: string | null | undefined): string | null {
  if (!header) return null;

  // Split into individual `<url>; rel="..."` entries. Canvas (like every
  // RFC 5988 producer) separates entries with a comma immediately followed
  // by the next entry's `<url>` - splitting on a comma that precedes a `<`
  // (rather than every comma) avoids ever being fooled by a comma inside a
  // URL's own query string.
  const entries = header.split(/,(?=\s*<)/);

  for (const entry of entries) {
    const urlMatch = entry.match(/<([^>]*)>/);
    if (!urlMatch) continue;

    // Tolerates a double-quoted, single-quoted, or bare rel value, any
    // amount of whitespace around "=", and matches "rel" case-insensitively
    // (AC4 item 14). Anchored so `rel="next-page"` (or any other rel value
    // that merely CONTAINS "next") never matches - the whole rel value must
    // equal "next" exactly, checked below after unwrapping quotes.
    const relMatch = entry.match(/\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;,\s]+))/i);
    if (!relMatch) continue;

    const relValue = (relMatch[1] ?? relMatch[2] ?? relMatch[3] ?? "").trim().toLowerCase();
    if (relValue === "next") return urlMatch[1];
  }

  return null;
}
