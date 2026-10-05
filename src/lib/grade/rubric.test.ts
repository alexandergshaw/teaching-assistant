import { describe, it, expect, vi, beforeEach } from "vitest";

// synthesizeFullCreditChecklist (the eager, grading-time path) and
// deriveFullCreditChecklist (the on-demand, drafted-grades path) share one
// LLM call + parser (callChecklistLlm in ./rubric) so the two paths can never
// synthesize different checklists for the same inputs. callLlm is mocked so
// both paths run for real without a live Gemini call.
vi.mock("../llm", async () => {
  const actual = await vi.importActual<typeof import("../llm")>("../llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { callLlm } from "../llm";
import {
  synthesizeFullCreditChecklist,
  deriveFullCreditChecklist,
  extractRubricCriteria,
  isReplySectionMarker,
  CANONICAL_REPLY_MARKER,
} from "./rubric";

const checklistResponse = (items: string[]) => ({
  ok: true as const,
  text: JSON.stringify({ fullCreditChecklist: items }),
});

const failResponse = { ok: false as const, status: 500, body: "server error" };

describe("deriveFullCreditChecklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the parsed items on success", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(checklistResponse(["A", "B", "C"]));

    const result = await deriveFullCreditChecklist("Write a sorting function.", "Correctness (100%)");

    expect(result).toEqual({ items: ["A", "B", "C"] });
  });

  it("surfaces an HTTP failure as an error instead of swallowing it", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(failResponse);

    const result = await deriveFullCreditChecklist("Write a sorting function.", "Correctness (100%)");

    expect("error" in result).toBe(true);
  });

  it("surfaces a thrown network error as an error instead of throwing", async () => {
    vi.mocked(callLlm).mockRejectedValueOnce(new Error("network down"));

    const result = await deriveFullCreditChecklist("Write a sorting function.", "Correctness (100%)");

    expect(result).toEqual({ error: "network down" });
  });
});

describe("synthesizeFullCreditChecklist (regression: eager grading-time path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("still returns the parsed items on success after the shared-helper refactor", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(checklistResponse(["A", "B", "C"]));

    const result = await synthesizeFullCreditChecklist("Write a sorting function.", "Correctness (100%)");

    expect(result).toEqual(["A", "B", "C"]);
  });

  it("still degrades to the default checklist on HTTP failure, never throwing", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(failResponse);

    const result = await synthesizeFullCreditChecklist("Write a sorting function.", "Correctness (100%)");

    expect(result).toHaveLength(3);
    expect(result.every((item) => typeof item === "string" && item.length > 0)).toBe(true);
  });

  it("still degrades to the default checklist on a thrown network error, never throwing", async () => {
    vi.mocked(callLlm).mockRejectedValueOnce(new Error("network down"));

    const result = await synthesizeFullCreditChecklist("Write a sorting function.", "Correctness (100%)");

    expect(result).toHaveLength(3);
  });
});

// FALLBACK MODE (backlog 4.3, ruling B43-7 in scratchpad/b43-rulings.md): the
// strict matcher runs first, unchanged; the widened matcher runs ONLY when
// the strict pass recovered zero criteria. These tests pin that ordering
// directly, since it is the entire safety property the design relies on.
describe("extractRubricCriteria (fallback mode - backlog 4.3)", () => {
  // FROZEN LITERAL: a rubric that parses today, byte-for-byte, must parse
  // IDENTICALLY after fallback mode - the strict pass is unchanged and the
  // widened pass must never even run when the strict pass already found
  // something. Sabotage-verified: making the strict pass require two
  // colons, or making extractRubricCriteria call the widened pass
  // unconditionally, both turn this red (see report).
  it("parses a rubric that already works today identically to before (strict pass only)", () => {
    const rubric = [
      "Argument Quality (20 pts): clear thesis and support",
      "  Excellent (20 pts): fully supported",
      "  Poor (5 pts): unsupported",
      "Grammar (10 pts): correct mechanics",
    ].join("\n");

    expect(extractRubricCriteria(rubric)).toEqual([
      { name: "Argument Quality", points: 20 },
      { name: "Grammar", points: 10 },
    ]);
  });

  // The measured target (ruling B43-7): serializeRubric's real, shipped
  // shape (src/lib/submission-archive-sniff.ts:50) - indented two spaces,
  // no colon, unit glued to the number ("20pt"). The strict pass recovers
  // zero for this text (indented = skipped), so the widened pass must run
  // and recover both. Sabotage-verified: removing the widened-pass call
  // (returning `strict` unconditionally) turns this red.
  it("recovers criteria from a colonless, indented rubric (serializeRubric's shape) that the strict pass alone cannot", () => {
    const rubric = ["Some Rubric Title", "  Code Style (20pt)", "  Correctness (30pt)"].join("\n");

    expect(extractRubricCriteria(rubric)).toEqual([
      { name: "Code Style", points: 20 },
      { name: "Correctness", points: 30 },
    ]);
  });

  // The ordering guarantee itself: one line the strict pass can parse, plus
  // colonless lines that the widened pass WOULD recover in isolation (as
  // proven by the previous test). Because the strict pass already found
  // something, the widened pass must never run, so the colonless lines stay
  // unrecovered. Sabotage-verified: changing the guard from
  // `if (strict.length > 0)` to always running both passes and merging
  // turns this red (yields 3, not 1).
  it("never runs the widened pass when the strict pass found anything, even alongside colonless lines", () => {
    const rubric = ["Correctness (30 pts): does the code work", "  Excellent (20pt)", "  Poor (5pt)"].join("\n");

    expect(extractRubricCriteria(rubric)).toEqual([{ name: "Correctness", points: 30 }]);
  });

  // The widened pass's discriminator is "parenthetical ends the line", not
  // "colon is optional" - a colon-suffixed indented line (this repo's own
  // fixture shape for describing "indented like serializeRubric", see
  // rubric-render.test.ts's canary) must NOT be picked up by the widened
  // pass, matching the checker's measurement that the existing canary stays
  // at zero. Sabotage-verified: making the widened regex's trailing group
  // `(?::.*)?$` instead of requiring end-of-line turns this red.
  it("does not widen a colon-suffixed indented line even when nothing else parsed", () => {
    const rubric = ["Some Rubric Title", "  Code Style (20 pts): Follows the style guide", "  Correctness (30 pts): Passes all cases"].join(
      "\n"
    );

    expect(extractRubricCriteria(rubric)).toEqual([]);
  });
});

// A8 Wave A: the reply-section marker and the per-criterion axis tag.
// toStrictEqual is deliberate: it treats a present-but-undefined `axis` key as
// different from an absent one, so AC-R2 (no key at all) is pinned exactly.
describe("extractRubricCriteria (A8 reply-section axis tagging)", () => {
  // AC-R2. Sabotage: always emitting `axis: currentAxis` (even when undefined)
  // or defaulting the axis to "initial-post" without a marker turns this red.
  it("parses a marker-free rubric with no axis key at all (strict pass)", () => {
    const rubric = ["Thesis (20 pts): clear", "Grammar (10 pts): mechanics"].join("\n");

    expect(extractRubricCriteria(rubric)).toStrictEqual([
      { name: "Thesis", points: 20 },
      { name: "Grammar", points: 10 },
    ]);
  });

  it("parses a marker-free rubric with no axis key at all (widened pass)", () => {
    const rubric = ["Some Rubric Title", "  Code Style (20pt)", "  Correctness (30pt)"].join("\n");

    expect(extractRubricCriteria(rubric)).toStrictEqual([
      { name: "Code Style", points: 20 },
      { name: "Correctness", points: 30 },
    ]);
  });

  // AC-R1, strict pass. Sabotage: dropping the `currentAxis = "reply"` switch
  // leaves every criterion "initial-post" and turns this red; dropping the
  // parenthetical exclusion is covered by the recognizer tests below.
  it("tags criteria before the marker initial-post and after it reply (strict pass)", () => {
    const rubric = [
      "Thesis (20 pts): clear",
      "Evidence (20 pts): cited",
      "Reply section:",
      "Engagement (10 pts): responds to peers",
      "Tone (5 pts): civil",
    ].join("\n");

    expect(extractRubricCriteria(rubric)).toStrictEqual([
      { name: "Thesis", points: 20, axis: "initial-post" },
      { name: "Evidence", points: 20, axis: "initial-post" },
      { name: "Engagement", points: 10, axis: "reply" },
      { name: "Tone", points: 5, axis: "reply" },
    ]);
  });

  // AC-R1, widened pass (colonless, indented): the same threading must exist
  // in the second pass. Sabotage: removing the marker handling from the widened
  // loop leaves all axes absent and turns this red.
  it("tags criteria before the marker initial-post and after it reply (widened pass)", () => {
    const rubric = [
      "Some Rubric Title",
      "  Thesis (20pt)",
      "Replies to classmates",
      "  Engagement (10pt)",
    ].join("\n");

    expect(extractRubricCriteria(rubric)).toStrictEqual([
      { name: "Thesis", points: 20, axis: "initial-post" },
      { name: "Engagement", points: 10, axis: "reply" },
    ]);
  });

  it("never emits the marker line itself as a criterion", () => {
    const rubric = ["Thesis (20 pts): clear", "Reply section", "Tone (5 pts): civil"].join("\n");

    expect(extractRubricCriteria(rubric).map((c) => c.name)).toStrictEqual(["Thesis", "Tone"]);
  });

  // Backward compatibility. Sabotage: loosening the parenthetical exclusion so
  // "Replies (10 pts):" counts as a marker turns this red (it would vanish).
  it("keeps a legacy 'Replies (10 pts):' line as an ordinary criterion with no axis", () => {
    const rubric = ["Posts (20 pts): initial post", "Replies (10 pts): reply to peers"].join("\n");

    expect(extractRubricCriteria(rubric)).toStrictEqual([
      { name: "Posts", points: 20 },
      { name: "Replies", points: 10 },
    ]);
  });
});

describe("isReplySectionMarker", () => {
  it("recognizes a parenthetical-free line starting with 'replies' or 'reply section'", () => {
    expect(isReplySectionMarker("Replies")).toBe(true);
    expect(isReplySectionMarker("  REPLIES to classmates:")).toBe(true);
    expect(isReplySectionMarker("Reply section")).toBe(true);
    expect(isReplySectionMarker("reply section: peer responses")).toBe(true);
  });

  it("rejects a line that carries a points parenthetical", () => {
    expect(isReplySectionMarker("Replies (10 pts):")).toBe(false);
    expect(isReplySectionMarker("Reply section (10 points)")).toBe(false);
    expect(isReplySectionMarker("Replies (25%)")).toBe(false);
    expect(isReplySectionMarker("Replies (10)")).toBe(false);
  });

  it("rejects lines that merely resemble the marker", () => {
    expect(isReplySectionMarker("Reply quality: be thoughtful")).toBe(false);
    expect(isReplySectionMarker("Repliesx")).toBe(false);
    expect(isReplySectionMarker("Thesis (20 pts): replies are due Friday")).toBe(false);
    expect(isReplySectionMarker("")).toBe(false);
  });

  it("recognizes the canonical marker", () => {
    expect(isReplySectionMarker(CANONICAL_REPLY_MARKER)).toBe(true);
  });
});
