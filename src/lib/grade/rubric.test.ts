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
import { synthesizeFullCreditChecklist, deriveFullCreditChecklist, extractRubricCriteria } from "./rubric";

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
