// extractVisualizationConceptsAction calls requireOwner() (auth) and callLlm()
// (network) - both mocked so the pipeline logic itself (the embedded refusal,
// clamping, JSON parsing via parseDeckConcepts, the char cap, and error
// surfacing) runs for real without hitting Supabase or Gemini. Mirrors
// src/app/actions/visualizer.test.ts's mocking shape for
// extractDeckConceptsAction, the sibling action this one deliberately does
// NOT reuse (see this action's own header comment for why).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { extractVisualizationConceptsAction } from "./visualization-concepts-generator";

function llmPromptText(callIndex: number): string {
  const args = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = args.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

// Assignment-shaped prose - the exact shape D1/D3 care about: NOT a slide
// deck (no "## heading" or "Slide N:" lines extractDeckConceptsAction's own
// embedded fallback would need), just an ordinary assignment body the way
// gatherSelectionMaterials actually produces it.
const ASSIGNMENT_PROSE =
  "Assignment: Sorting Practice\n" +
  "Implement binary search on a sorted array of integers and trace how the search space narrows on each iteration. " +
  "Submit your file as lastname_binarysearch.py through Canvas by Friday at 11:59pm. Late submissions lose 10% per day.";

describe("extractVisualizationConceptsAction", () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks): a test whose code throws before
    // consuming every queued mockResolvedValueOnce would otherwise leak the
    // leftover value into whichever test runs next - see visualizer.test.ts's
    // own comment on this same choice.
    vi.resetAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  });

  it("returns an error for empty/whitespace-only materials without calling the LLM", async () => {
    const result = await extractVisualizationConceptsAction("   ", 8, "gemini");
    expect(result).toEqual({ error: "Provide the selection's materials to analyze." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  // D1 - THE SPECIFIC FAILURE D3 EXISTS TO PREVENT: a fallback that silently
  // returns an empty list when fed prose. This action's embedded path
  // deliberately refuses instead (see the module's header comment) - this
  // test pins that refusal against REAL assignment-shaped prose, proving the
  // result is an honest, specific error and NOT `{ concepts: [] }`.
  it("provider embedded refuses with a specific error on real assignment-shaped prose, never a silent empty list", async () => {
    const result = await extractVisualizationConceptsAction(ASSIGNMENT_PROSE, 8, "embedded");
    expect(result).toEqual({
      error:
        "Extracting visualization-worthy concepts requires an LLM provider - judging which concepts a student would " +
        "grasp better from an interactive visual (as opposed to a definition, a policy, or an admin instruction) " +
        "cannot be done honestly from structure alone.",
    });
    // Guard against the exact regression this test exists to catch: the
    // result must be an error, not a concepts array (empty or otherwise).
    expect("concepts" in result).toBe(false);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("happy path: returns the model's parsed concepts in order", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        concepts: [
          { concept: "binary search", evidence: "Implement binary search on a sorted array of integers." },
          { concept: "loop invariants", evidence: "trace how the search space narrows on each iteration." },
        ],
      }),
    });

    const result = await extractVisualizationConceptsAction(ASSIGNMENT_PROSE, 8, "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.concepts).toEqual([
      { concept: "binary search", evidence: "Implement binary search on a sorted array of integers." },
      { concept: "loop invariants", evidence: "trace how the search space narrows on each iteration." },
    ]);
  });

  it("caps the returned concepts at maxConcepts even when the model returns more", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        concepts: Array.from({ length: 6 }, (_, i) => ({ concept: `concept ${i}`, evidence: `e${i}` })),
      }),
    });

    const result = await extractVisualizationConceptsAction(ASSIGNMENT_PROSE, 3, "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.concepts).toHaveLength(3);
  });

  // clampDeckConcepts (reused, not reimplemented) clamps to [1, 20] with a
  // default of 8 when maxConcepts is omitted.
  it("clamps a caller value above the max (999) down to 20", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        concepts: Array.from({ length: 25 }, (_, i) => ({ concept: `concept ${i}`, evidence: "e" })),
      }),
    });

    const result = await extractVisualizationConceptsAction(ASSIGNMENT_PROSE, 999, "gemini");
    expect("error" in result).toBe(false);
    if (!("error" in result)) expect(result.concepts).toHaveLength(20);
  });

  it("defaults to 8 when maxConcepts is omitted", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        concepts: Array.from({ length: 12 }, (_, i) => ({ concept: `concept ${i}`, evidence: "e" })),
      }),
    });

    const result = await extractVisualizationConceptsAction(ASSIGNMENT_PROSE);
    expect("error" in result).toBe(false);
    if (!("error" in result)) expect(result.concepts).toHaveLength(8);
  });

  // A6: an extraction that found no visualization-worthy concepts must be a
  // specific, distinguishable error - never a silent empty success.
  it("errors when the model's response parses to zero concepts - never a silent empty success", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: JSON.stringify({ concepts: [] }) });
    const result = await extractVisualizationConceptsAction(ASSIGNMENT_PROSE, 8, "gemini");
    expect(result).toEqual({
      error: "Could not find any concepts in this material that would benefit from an interactive visual.",
    });
  });

  // SHOULD-FIX 4 fix: a provider FAILURE must be reported distinctly from the
  // "material had nothing worth visualizing" refusal, not folded into the
  // same message - the old behavior this test used to pin ("a failed LLM
  // call yields the same zero-concepts error") is exactly the defect this
  // test now guards against.
  it("a failed LLM call (bad key/500/quota) yields a distinguishable provider-failure error, not the zero-concepts error", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 500, body: "server error" });
    const result = await extractVisualizationConceptsAction(ASSIGNMENT_PROSE, 8, "gemini");

    expect("error" in result).toBe(true);
    const message = (result as { error: string }).error;
    expect(message).not.toEqual(
      "Could not find any concepts in this material that would benefit from an interactive visual."
    );
    // describeLlmFailure's own convention: HTTP status and body surfaced,
    // not swallowed into a generic sentence.
    expect(message).toMatch(/500/);
    expect(message).toMatch(/server error/);
  });

  it("an empty-but-ok LLM response (e.g. finishReason MAX_TOKENS) yields its own distinguishable error, not the zero-concepts error", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "", finishReason: "MAX_TOKENS" });
    const result = await extractVisualizationConceptsAction(ASSIGNMENT_PROSE, 8, "gemini");

    expect("error" in result).toBe(true);
    const message = (result as { error: string }).error;
    expect(message).not.toEqual(
      "Could not find any concepts in this material that would benefit from an interactive visual."
    );
    expect(message).toMatch(/MAX_TOKENS/);
  });

  it("a requireOwner rejection yields an error result, not a thrown exception", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("not signed in"));
    const result = await extractVisualizationConceptsAction(ASSIGNMENT_PROSE, 8, "gemini");
    expect(result).toEqual({ error: "not signed in" });
  });

  // D2 - the prompt must actually ask for what D2 requires and forbid what it
  // forbids. Pinning FACTS (the categories named), never exact prose.
  it("the prompt asks for visualization-worthy categories: state changes, control flow, data structures, algorithms, sequencing, transformations", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: JSON.stringify({ concepts: [{ concept: "x", evidence: "y" }] }) });
    await extractVisualizationConceptsAction(ASSIGNMENT_PROSE, 8, "gemini");

    const prompt = llmPromptText(0);
    expect(prompt).toMatch(/state change/i);
    expect(prompt).toMatch(/control flow/i);
    expect(prompt).toMatch(/data structure/i);
    expect(prompt).toMatch(/algorithm/i);
    expect(prompt).toMatch(/sequenc/i);
    expect(prompt).toMatch(/transformation/i);
  });

  it("the prompt explicitly forbids definitions, policies, admin/submission instructions, and grading rules", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: JSON.stringify({ concepts: [{ concept: "x", evidence: "y" }] }) });
    await extractVisualizationConceptsAction(ASSIGNMENT_PROSE, 8, "gemini");

    const prompt = llmPromptText(0);
    expect(prompt).toMatch(/definition/i);
    expect(prompt).toMatch(/polic/i);
    expect(prompt).toMatch(/admin|submission/i);
    expect(prompt).toMatch(/grading/i);
    expect(prompt, "does not tell the model to never list the forbidden categories").toMatch(/never list/i);
  });

  it("the prompt does NOT use the deck-framing D3 forbids ('below is a lecture slide deck')", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: JSON.stringify({ concepts: [{ concept: "x", evidence: "y" }] }) });
    await extractVisualizationConceptsAction(ASSIGNMENT_PROSE, 8, "gemini");

    const prompt = llmPromptText(0);
    expect(prompt).not.toMatch(/lecture slide deck/i);
  });

  // Mirrors extractDeckConceptsAction's own char-cap test - materials text is
  // sliced to MATERIALS_TEXT_CHAR_CAP (12000, a private constant) before
  // reaching the model.
  it("caps the materials text sent to the model at the module's 12000-character limit", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({ concepts: [{ concept: "x", evidence: "y" }] }),
    });
    const CAP = 12000;
    const materials = "A".repeat(CAP) + "OVERFLOW_MARKER" + "B".repeat(500);

    await extractVisualizationConceptsAction(materials, 8, "gemini");

    const prompt = llmPromptText(0);
    expect(prompt).not.toContain("OVERFLOW_MARKER");
    const marker = "SELECTION MATERIALS (the assignments, quizzes, pages, and files an instructor selected for this scan):\n";
    const sliceStart = prompt.indexOf(marker) + marker.length;
    expect(prompt.length - sliceStart).toBe(CAP);
  });
});
