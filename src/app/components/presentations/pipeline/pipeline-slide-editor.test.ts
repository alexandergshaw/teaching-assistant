import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInitialPipelineState, applyStageEdit } from "@/lib/presentations/pipeline";
import { editPipelineSlide, isCurrentSlideDraft } from "./panel-logic";

describe("pipeline slide editor", () => {
  it("preserves slide order, unedited fields and deck identity while editing title, bullets and notes", () => {
    let state = createInitialPipelineState();
    state = applyStageEdit(state, "deck", { presentationTitle: "Deck", slides: [
      { title: "A", bullets: ["first"], notes: "old note", code: "x", codeLanguage: "js" },
      { title: "B", bullets: ["second"] },
    ] });
    const result = editPipelineSlide(state, 0, { title: "A revised", bulletsText: "new one\nnew two", notes: "new note" });
    expect(result.state.deck.artifact).toEqual({ presentationTitle: "Deck", slides: [
      { title: "A revised", bullets: ["new one", "new two"], notes: "new note", code: "x", codeLanguage: "js" },
      { title: "B", bullets: ["second"] },
    ] });
    expect(editPipelineSlide(state, 0, { title: "", bulletsText: "", notes: "" }).changed).toBe(false);
  });

  it("wires Save/Cancel to the production reducer and disables template notes with an explanation", () => {
    const source = readFileSync(join(process.cwd(), "src/app/components/presentations/pipeline/pipeline-slide-editor.tsx"), "utf8");
    expect(source).toContain("editPipelineSlide(state, index");
    expect(source).toContain("setState(result.state)");
    expect(source).toContain("onClick={() => { setDraft(");
    expect(source).toContain("disabled={templateSelected || disabled}");
    expect(source).toContain("preserve the template&apos;s existing notes");
    expect(source).toContain("isCurrentSlideDraft(sourceDeck.current, sourceSlide.current, deck, slide)");
    expect(source).toContain("sourceDeck.current = deck");
    expect(source).toContain("sourceSlide.current = next");
  });

  it("refuses a slide draft after the deck or selected slide snapshot changes", () => {
    const originalDeck = { presentationTitle: "Deck", slides: [{ title: "Original", bullets: ["old"] }] };
    const originalSlide = originalDeck.slides[0];
    const replacedDeck = { presentationTitle: "Deck", slides: [{ title: "Generated", bullets: ["new"] }] };
    expect(isCurrentSlideDraft(originalDeck, originalSlide, originalDeck, originalSlide)).toBe(true);
    expect(isCurrentSlideDraft(originalDeck, originalSlide, replacedDeck, replacedDeck.slides[0])).toBe(false);
    expect(isCurrentSlideDraft(originalDeck, originalSlide, originalDeck, { ...originalSlide })).toBe(false);
  });
});
