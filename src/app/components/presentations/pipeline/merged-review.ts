// PRES-2 S6.7 gap closer (follow-up to review-merge.ts's own WIRING NOTE):
// the pure orchestration that lets PipelineTab run BOTH the deterministic
// checklist pass (checklists.ts's runDeterministicChecklist) and the LLM
// route's ChecklistResult for the same checklist, then merge them via
// review-merge.ts so the stored stage artifact is a true completeness
// receipt for the whole checklist, not just whichever half the caller
// happened to run.
//
// Pure leaf: no IO, no fetch, no callLlm - PipelineTab.tsx does the actual
// route call and passes this helper the already-parsed LLM ChecklistResult.
// This file only adapts the real deck shape (DeckContent/PptxSlide) to the
// checklists' structural ChecklistDeckInput and calls the shipped merge.

import type { DeckContent } from "@/lib/presentations/types";
import {
  type Checklist,
  type ChecklistDeckInput,
  type ChecklistResult,
} from "@/lib/deck-standard/checklists";
import { mergeWithDeterministicChecklist } from "@/lib/deck-standard/review-merge";

/**
 * Adapt the real deck content to the checklists' structural input. `terms`
 * is left undefined - `PptxSlide` (src/lib/pptx.ts) does not carry a
 * Terminology-table field yet, so `checkVocabWithoutModel` simply finds
 * nothing to flag on any slide, matching today's actual deck shape rather
 * than inventing a field that does not exist on the wire.
 */
export function adaptDeckForChecklist(deck: DeckContent): ChecklistDeckInput {
  return {
    slides: deck.slides.map((slide) => ({
      title: slide.title,
      bullets: slide.bullets,
      notes: slide.notes,
    })),
  };
}

/**
 * Build the merged (deterministic + llm) `ChecklistResult` for one review
 * stage. `deck` is `PipelineState.deck.artifact` at call time - review
 * stages are gated on `deck.status === "done"` (`canRunStage`), so `deck`
 * should never be null here, but a null deck degrades safely: skip the
 * deterministic half entirely and return `llmResult` unchanged, rather than
 * throwing (the deterministic pass has nothing to run against).
 */
export function buildMergedReview(
  checklist: Checklist,
  deck: DeckContent | null,
  llmResult: ChecklistResult
): ChecklistResult {
  if (deck === null) return llmResult;
  return mergeWithDeterministicChecklist(checklist, adaptDeckForChecklist(deck), llmResult);
}
