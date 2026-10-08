// PPT-DESIGN-INTO-PRESENTATIONS: PowerPoint Design left the top-level Tools
// rail and became the third Presentations tab (presentationsView = "ppt-design").
// The raw value "ppt-design" is therefore a RETIRED manualView: an old URL
// (?manualView=ppt-design), an old localStorage entry (ta-manual-view,
// ta-active-tab) or an old destination id all name it, and each must land on
// Presentations > PowerPoint Design rather than a dead view.
//
// A LEAF module: no React import, nothing server-only, no import of
// manual-rail.ts (the literals are self-contained, so there is no cycle), so
// the decision is unit-testable (vitest here is node-env).

/** The retired top-level view value. */
export const LEGACY_PPT_DESIGN_VIEW = "ppt-design";

export interface LegacyPptDesignRedirect {
  manualView: "presentations";
  presentationsView: "ppt-design";
}

/**
 * The canonical state a retired "ppt-design" value now means, or null when the
 * raw value is anything else. An alias is a redirect, not a synonym: callers
 * write the canonical state back, never the legacy value.
 */
export function legacyPptDesignView(raw: string | null | undefined): LegacyPptDesignRedirect | null {
  if (raw !== LEGACY_PPT_DESIGN_VIEW) return null;
  return { manualView: "presentations", presentationsView: "ppt-design" };
}
