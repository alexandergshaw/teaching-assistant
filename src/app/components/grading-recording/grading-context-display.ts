// Pure formatting for the Knowledge Base context notice a "Grade via
// recording" launch may carry (AC2 of docs/knowledge-recording-handoff-
// acceptance-criteria.md) - GradingRecordingPanel.tsx owns the actual
// rendering; this module only turns the carried `pages` array into a
// capped, legible line, so a long selection never blows out the panel.
//
// AC1's own rule ("never name a page the model did not read") is already
// enforced upstream, at the launch site - KnowledgeTab.tsx's
// includedContextPages (knowledge-helpers.ts) filters RecordingKnowledgeContext.pages
// down to only the pages the budget actually included BEFORE the launch
// ever fires. This module has no way to re-check that (it never sees
// pageResults, only the already-filtered `pages` array recording-launch.ts's
// sanitizer hands back), so it must never be handed anything else - it just
// trusts, and formats, whatever the launch site already made honest.

export interface KnowledgeContextPageRef {
  id: string;
  title: string;
}

/** How many page titles to show before folding the rest into "+N more" -
 *  matches knowledge-helpers.ts's describeSelectedPages default (8), give or
 *  take: this surface is a passive notice, not a bulk-selection editor, so a
 *  slightly tighter cap keeps the panel calm even for a large selection. */
export const MAX_SHOWN_CONTEXT_PAGES = 5;

/**
 * Render up to `maxShown` page titles as a comma-joined line, folding
 * anything beyond that into a stated "+N more" - never a silent cutoff, and
 * never nothing at all when there IS something to show. Returns "" for an
 * empty/undefined list, so the caller can skip rendering entirely rather
 * than showing an empty line (AC2: "carrying nothing renders nothing").
 */
export function formatContextPagesList(
  pages: KnowledgeContextPageRef[] | undefined,
  maxShown: number = MAX_SHOWN_CONTEXT_PAGES
): string {
  if (!pages || pages.length === 0) return "";
  const titles = pages.map((p) => p.title.trim() || "Untitled page");
  const shown = titles.slice(0, maxShown);
  const overflow = titles.length - shown.length;
  return overflow > 0 ? `${shown.join(", ")} +${overflow} more` : shown.join(", ");
}

/**
 * Which page id (if any) a "Back to Knowledge" click should ask
 * KnowledgeTab.tsx to land on and expand - the first page this launch is
 * actually carrying, so clicking it always reveals something real rather
 * than the tab's empty "select a page" state, even when the instructor never
 * had a single page open in the editor before launching (only ticked
 * checkboxes across several). Returns undefined when there is nothing to
 * carry, so returnToKnowledge() falls back to its own bare "just switch
 * tabs" behavior.
 */
export function returnTargetPageId(pages: KnowledgeContextPageRef[] | undefined): string | undefined {
  return pages && pages.length > 0 ? pages[0].id : undefined;
}
