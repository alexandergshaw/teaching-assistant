// Pure helpers for the Knowledge Base context a "Grade via recording" launch
// may carry (docs/knowledge-recording-handoff-acceptance-criteria.md).
//
// This module once also held formatContextPagesList, which rendered the
// carried pages as a capped, comma-joined line. CarriedKnowledgePages.tsx
// replaced that static line with an interactive, removable list on the same
// day it was written, leaving the formatter exported and covered by eight
// tests but called by nothing. A tested export with no consumer reads as
// maintained code, which is the same false signal that once left a live
// control rendering unstyled while its CSS sat in the stylesheet looking
// current - so it was deleted rather than kept "in case". Its behaviour lives
// on inside CarriedKnowledgePages.tsx, which is where the capping decision
// now belongs.

export interface KnowledgeContextPageRef {
  id: string;
  title: string;
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
