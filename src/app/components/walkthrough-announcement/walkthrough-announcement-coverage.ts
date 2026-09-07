// AC6's per-page coverage report for the "announcement (and video script)
// from a recorded LMS walkthrough" feature
// (docs/announcement-from-walkthrough-acceptance-criteria.md). A pure,
// dependency-light leaf - no React, no DOM, no clock - so it is unit
// testable in this repo's node-env vitest and importable from both the
// panel and a future server action alike.
//
// WHY THIS IS A SEPARATE FOLD, NOT A REUSE OF module-blocks.ts's OWN
// DEDUPE. The acceptance document is explicit (the AC4/AC6 contradiction
// section): appendBatchBlocks (module-deck-capture/module-blocks.ts)
// deliberately rejects a global dedupe set, because a module legitimately
// repeats short lines under DIFFERENT headings, and a global set would
// silently delete real second occurrences. That rule protects MATERIALS
// TEXT - the content the drafter reads - and must stay exactly as
// measured.
//
// This file answers a different question: "which PAGES (headings) were
// captured, and could each be read", for a REPORT the announcement names -
// never the materials text itself. Deduping PAGE TITLES here changes
// nothing about what content reaches the drafter (renderMaterialsText,
// called separately, still walks every block); it only prevents a page the
// instructor scrolled past twice from being counted, or reported, twice.
// That is exactly AC4's own wording: "if the instructor doubles back to a
// page, it is covered once, at its first appearance." A global Set keyed on
// PAGE TITLE is therefore the right tool here, in a fold that touches
// nothing module-blocks.ts owns.
//
// PAGE IDENTITY IS THE MODEL'S BELIEF, NEVER A FACT (see the acceptance
// document's own "THE CONTRADICTION IN AC4/AC6" section). getDisplayMedia
// exposes pixels, not a URL or a window title - "heading" is only ever
// whatever text the extraction model read off the page. This module inherits
// that same non-guarantee: it can only ever report what the extraction
// pipeline believed the heading was, and the acceptance document is explicit
// that the model will sometimes split one page into two or merge two into
// one. The rendered coverage block below is worded to match ("captured
// pages", never "the pages of the module").
//
// P13 - THIS IS A SECOND UNSCRUBBED TEXT ARTIFACT, INHERITED, NOT CREATED.
// A page's `heading` field is exactly the same untrusted, unredacted text
// that already flows into the materials string (nothing here filters a
// heading that happens to contain a name or a grade - the acceptance
// document names that as an accepted risk of the underlying extraction
// pipeline, not something this feature can close). This module does not
// widen that risk: it renders the SAME heading strings the materials text
// already carries, through the same by-INDEX marker mechanism
// (renderPageMarkers) the knowledge-overview prompt already uses for its
// own citations - never a second, independently-sourced identifier.

import { renderPageMarkers, type MarkedPage } from "@/lib/knowledge-overview-prompt";
import type { ExtractedBlock } from "../module-deck-capture/module-extraction-prompt";

/** One captured page's coverage, in order of first appearance. */
export interface WalkthroughPageCoverage {
  /** The heading the extraction model read off the page - "Untitled" when a
   * block carried no heading at all. See this file's header: this is a
   * belief the model formed, never a confirmed page identity. */
  title: string;
  /** True once at least one NON-illegible block was seen under this
   * heading. A page whose every block came back `illegible: true` (AC8 of
   * the module-walkthrough-deck acceptance criteria) stays false - its text
   * could not be extracted, which is exactly what AC6 of THIS feature
   * requires the coverage report to say plainly rather than drop silently. */
  legible: boolean;
}

const UNTITLED_PAGE = "Untitled";

/**
 * Derives the ordered, deduped list of captured pages from the walkthrough's
 * extracted blocks (post seam-join - the same `blocks` reduceCaptureToMaterials
 * returns alongside its rendered text). A page is identified by its `heading`
 * field; the FIRST block under a given heading fixes that page's position in
 * the returned list (AC4: "covered once, at its first appearance"), and any
 * LATER block under the same heading - however far away - only ever updates
 * `legible`, never creates a second entry or moves the page's position.
 *
 * Pure fold, single pass, no map re-keying beyond a title->index lookup -
 * see walkthrough-announcement-coverage.test.ts for the sabotage-checked
 * cases (a doubled-back page, an all-illegible page, an empty run).
 */
export function deriveWalkthroughPageCoverage(blocks: readonly ExtractedBlock[]): WalkthroughPageCoverage[] {
  const pages: WalkthroughPageCoverage[] = [];
  const indexByTitle = new Map<string, number>();

  for (const block of blocks) {
    const title = block.heading.trim() || UNTITLED_PAGE;
    const existingIndex = indexByTitle.get(title);
    if (existingIndex === undefined) {
      indexByTitle.set(title, pages.length);
      pages.push({ title, legible: !block.illegible });
    } else if (!block.illegible) {
      pages[existingIndex].legible = true;
    }
  }

  return pages;
}

/**
 * Renders `pages` into the "CAPTURED PAGE COVERAGE NOTES" block
 * walkthrough-announcement-prompt.ts's `coverageBlock` parameter expects:
 * numbered page markers (renderPageMarkers, knowledge-overview-prompt.ts -
 * AC6's own named precedent, resolving references BY INDEX rather than by
 * title, since headings are not unique) followed by a line naming any page
 * that came back with no legible text at all. Returns "" for an empty
 * `pages` array - walkthrough-announcement-prompt.ts already treats an
 * empty coverageBlock as "nothing to render" and omits the section
 * entirely, so there is nothing this function needs to special-case.
 */
export function renderWalkthroughCoverageBlock(pages: readonly WalkthroughPageCoverage[]): string {
  if (pages.length === 0) return "";

  const markedPages: MarkedPage[] = pages.map((page, i) => ({ id: String(i + 1), title: page.title }));
  const lines = [renderPageMarkers(markedPages)];

  const unreadable = pages
    .map((page, i) => ({ marker: `P${i + 1}`, title: page.title, legible: page.legible }))
    .filter((entry) => !entry.legible);

  lines.push(
    unreadable.length > 0
      ? `Could not be read (too little legible text): ${unreadable.map((entry) => `[${entry.marker}] ${entry.title}`).join("; ")}.`
      : "Every captured page above had at least some legible text."
  );

  return lines.join("\n");
}
