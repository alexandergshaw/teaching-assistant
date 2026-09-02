// Unit tests for CarriedKnowledgePages.tsx's own pure recompute function -
// the component itself renders JSX and is not covered by this repo's
// node-env vitest suite (AGENTS.md/this repo's own constraint: no component
// is ever rendered), so every claim this file makes is about
// recomputeCarriedKnowledgeContext, a plain function with no React import.
//
// This file imports no helper from a sibling *.test.ts (that would re-run
// its describe blocks a second time - this repo's own recorded trap) and
// duplicates any fixture it needs.

import { describe, it, expect } from "vitest";
import { recomputeCarriedKnowledgeContext } from "./CarriedKnowledgePages";
import type { SelectedContextPage } from "../knowledge/knowledge-helpers";

describe("recomputeCarriedKnowledgeContext (AC3/4a of docs/knowledge-recording-handoff-acceptance-criteria.md - removal is a client-side recompute, never a display-only filter)", () => {
  it(
    "HIGHEST VALUE: removing a page actually changes what the model would receive (`.text`), not just what a list would display",
    () => {
      const pages: SelectedContextPage[] = [
        { id: "p1", title: "Grading rubric", body: "Give full credit for effort." },
        { id: "p2", title: "Late policy", body: "Late work loses 10% per day." },
      ];
      const before = recomputeCarriedKnowledgeContext(pages);
      expect(before?.text).toContain("Give full credit for effort.");
      expect(before?.text).toContain("Late work loses 10% per day.");

      const afterRemovingRubric = recomputeCarriedKnowledgeContext(pages.filter((p) => p.id !== "p1"));
      // The removed page's own content must be GONE from the text the model
      // would receive on the next batch - not merely absent from a display
      // list while still riding along in the flattened prompt string. A
      // recompute that only filtered `pages` for display (the exact lie
      // AC1/4a forbids, merely inverted) would leave this text unchanged.
      expect(afterRemovingRubric?.text).not.toContain("Give full credit for effort.");
      expect(afterRemovingRubric?.text).not.toContain("Grading rubric");
      expect(afterRemovingRubric?.text).toContain("Late work loses 10% per day.");
      expect(afterRemovingRubric?.pages?.map((p) => p.id)).toEqual(["p2"]);
    }
  );

  it("removing the ONLY remaining page clears the context entirely (never an empty text/pages shell)", () => {
    const pages: SelectedContextPage[] = [{ id: "p1", title: "Solo page", body: "Some body." }];
    expect(recomputeCarriedKnowledgeContext(pages.filter((p) => p.id !== "p1"))).toBeNull();
  });

  it("returns null for an empty input with no prior pages either", () => {
    expect(recomputeCarriedKnowledgeContext([])).toBeNull();
  });

  it(
    "SABOTAGE TARGET (AC1's core claim, replayed through THIS function): a MIDDLE page dropped by the budget is " +
      "never named as included, even though a later, smaller page right after it survives - inclusion is not a prefix",
    () => {
      // Mirrors knowledge-helpers.test.ts's own includedContextPages sabotage
      // fixture, but exercised end-to-end through recomputeCarriedKnowledgeContext
      // (the actual function the removal control calls), not just the helper
      // it is built from. The budget loop (knowledge-context.ts) uses
      // `continue`, not `break` - a huge middle page is skipped while a
      // later, tiny page still fits within the default 10000-char budget.
      const pages: SelectedContextPage[] = [
        { id: "p1", title: "Intro", body: "Short intro." },
        { id: "p2", title: "Huge policy", body: "x".repeat(11000) },
        { id: "p3", title: "Tiny note", body: "n" },
      ];
      const result = recomputeCarriedKnowledgeContext(pages);
      expect(result, "expected a non-null result - the fixture must actually exercise the omission path").toBeTruthy();
      const resultIds = result!.pages!.map((p) => p.id);
      expect(resultIds).not.toContain("p2");
      expect(resultIds).toContain("p1");
      expect(resultIds).toContain("p3");
      expect(result!.text).not.toContain("x".repeat(11000));
      expect(result!.text).toContain("Short intro.");
      // The label must state the real included-of-remaining count, not a
      // flat "3 pages" that hides the mid-recompute omission.
      expect(result!.label).toBe("2 of 3 Knowledge Base pages (1 omitted - too large for the context budget)");
    }
  );

  it(
    "the label counts REMAINING pages, not the original pre-removal selection - a user-removed page is not " +
      "an 'omitted' page, it is simply no longer selected",
    () => {
      const pages: SelectedContextPage[] = [
        { id: "p1", title: "Page one", body: "Body one." },
        { id: "p2", title: "Page two", body: "Body two." },
        { id: "p3", title: "Page three", body: "Body three." },
      ];
      // Simulate: the instructor removed p1 from an originally-3-page
      // selection. Nothing here was dropped by the BUDGET - the remaining 2
      // pages both fit easily - so the label must read as an ordinary,
      // un-omitted 2-page carry, never "2 of 3 (1 omitted)" (that phrasing is
      // reserved for a real budget drop, not a deliberate removal).
      const result = recomputeCarriedKnowledgeContext(pages.filter((p) => p.id !== "p1"));
      expect(result?.label).toBe("2 Knowledge Base pages");
      expect(result?.pages?.map((p) => p.id)).toEqual(["p2", "p3"]);
    }
  );

  it("restoring a removed page (Undo) recomputes fresh too - not a cached snapshot of the original text", () => {
    const original: SelectedContextPage[] = [
      { id: "p1", title: "A", body: "Body A." },
      { id: "p2", title: "B", body: "Body B." },
    ];
    const afterRemove = recomputeCarriedKnowledgeContext(original.filter((p) => p.id !== "p2"));
    expect(afterRemove?.text).not.toContain("Body B.");
    // Undo re-adds the removed page and recomputes over the restored set -
    // the component's own handleUndo does this by concatenating the removed
    // page back onto the current `pages`, exactly like this fixture.
    const afterUndo = recomputeCarriedKnowledgeContext([...original.filter((p) => p.id !== "p2"), original[1]]);
    expect(afterUndo?.text).toContain("Body B.");
    expect(afterUndo?.pages?.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });
});
