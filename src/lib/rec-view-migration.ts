// TOOLS-IA-REORG W2 (R-b1): the "record an announcement" front door moved out of
// Recording's inner strip into Tools > Announcements > From a recording, so the
// Recording-local persisted value `ta-rec-view = "announcement"` no longer names
// a Recording tab. A returning user whose last Recording sub-view was that one
// must land on the Announcements successor instead of silently on "Record".
//
// A LEAF module: no React import, nothing server-only, so the decision is
// unit-testable (vitest here is node-env).

/** The retired Recording sub-view value. */
export const LEGACY_ANNOUNCEMENT_REC_VIEW = "announcement";

export interface LegacyRecViewRedirect {
  manualView: "announcements";
  announcementsView: "recording";
}

/**
 * Where a persisted `ta-rec-view` should send a returning user, or null when no
 * redirect applies. Redirects only when the stored value is the retired one AND
 * the user is currently landing on the Recording chip (the place that value was
 * meaningful); anyone elsewhere stays put - Recording itself falls back to
 * "record" for the unknown value.
 */
export function legacyRecViewRedirect(
  storedRecView: string | null,
  manualView: string
): LegacyRecViewRedirect | null {
  if (storedRecView !== LEGACY_ANNOUNCEMENT_REC_VIEW) return null;
  if (manualView !== "recording") return null;
  return { manualView: "announcements", announcementsView: "recording" };
}
