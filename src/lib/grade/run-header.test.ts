import { describe, it, expect, vi } from "vitest";

// A39 incremental-fill W2, F1/F2/F3 (docs/a39-incremental-fill-architecture.md
// section 9.4, docs/a39-fill-waves.md's W2 row). `generateRubric` is mocked
// (it is the only impure step - it reaches `lib/supabase` through the rubric
// bank and, on a real model call, the network); `extractRubricCriteria` is
// left as the REAL implementation, via `importOriginal`, because F3 measures
// what it does to a real generated rubric string.
vi.mock("./rubric", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rubric")>();
  return {
    ...actual,
    generateRubric: vi.fn(),
  };
});

import { generateRubric } from "./rubric";
import { resolveRunHeader } from "./run-header";

const INSTRUCTIONS = "Write a function that adds two numbers.";
const FILLED_RUBRIC = "1. Correctness (10 pts): the function returns the right sum.";
// Parses to exactly two criteria via extractRubricCriteriaStrict.
const GENERATED_RUBRIC =
  "Thesis (20 pts): states a clear claim.\nEvidence (10 pts): cites two sources.";

describe("resolveRunHeader - F2, the blank-instructions refusal", () => {
  it("refuses blank instructions with the message byte-identical to grading.ts's, and makes no model call", async () => {
    const result = await resolveRunHeader("   ", FILLED_RUBRIC, "gemini", {
      synthesizeRubricWhenBlank: true,
    });
    expect(result).toEqual({ kind: "refused", error: "Please provide assignment instructions." });
    expect(generateRubric).not.toHaveBeenCalled();
  });

  it("refuses blank instructions on the Canvas path (synthesizeRubricWhenBlank: false) the same way", async () => {
    const result = await resolveRunHeader("", FILLED_RUBRIC, "gemini", {
      synthesizeRubricWhenBlank: false,
    });
    expect(result).toEqual({ kind: "refused", error: "Please provide assignment instructions." });
    expect(generateRubric).not.toHaveBeenCalled();
  });
});

describe("resolveRunHeader - F1, rubric generation on exactly one branch", () => {
  it("blank rubric + zip (synthesizeRubricWhenBlank: true): generates, and generatedRubric is set", async () => {
    vi.mocked(generateRubric).mockResolvedValue(GENERATED_RUBRIC);
    const result = await resolveRunHeader(INSTRUCTIONS, "", "gemini", {
      synthesizeRubricWhenBlank: true,
    });
    expect(generateRubric).toHaveBeenCalledTimes(1);
    expect(generateRubric).toHaveBeenCalledWith(INSTRUCTIONS, "gemini");
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.effectiveRubric).toBe(GENERATED_RUBRIC);
    expect(result.generatedRubric).toBe(GENERATED_RUBRIC);
  });

  it("blank rubric + Canvas (synthesizeRubricWhenBlank: false): does not generate, effectiveRubric stays blank", async () => {
    vi.mocked(generateRubric).mockClear();
    const result = await resolveRunHeader(INSTRUCTIONS, "", "gemini", {
      synthesizeRubricWhenBlank: false,
    });
    expect(generateRubric).not.toHaveBeenCalled();
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.effectiveRubric).toBe("");
    expect(result.generatedRubric).toBeUndefined();
  });

  it("filled rubric + zip (synthesizeRubricWhenBlank: true): does not generate, effectiveRubric is the given rubric", async () => {
    vi.mocked(generateRubric).mockClear();
    const result = await resolveRunHeader(INSTRUCTIONS, FILLED_RUBRIC, "gemini", {
      synthesizeRubricWhenBlank: true,
    });
    expect(generateRubric).not.toHaveBeenCalled();
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.effectiveRubric).toBe(FILLED_RUBRIC);
    expect(result.generatedRubric).toBeUndefined();
  });

  it("filled rubric + Canvas (synthesizeRubricWhenBlank: false): does not generate, effectiveRubric is the given rubric", async () => {
    vi.mocked(generateRubric).mockClear();
    const result = await resolveRunHeader(INSTRUCTIONS, FILLED_RUBRIC, "gemini", {
      synthesizeRubricWhenBlank: false,
    });
    expect(generateRubric).not.toHaveBeenCalled();
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.effectiveRubric).toBe(FILLED_RUBRIC);
    expect(result.generatedRubric).toBeUndefined();
  });
});

describe("resolveRunHeader - F3, criteriaNames reads the effective rubric, not the raw one", () => {
  it("a blank-rubric zip case's criteriaNames come from the GENERATED rubric (two criteria), not the raw blank one", async () => {
    vi.mocked(generateRubric).mockResolvedValue(GENERATED_RUBRIC);
    const result = await resolveRunHeader(INSTRUCTIONS, "", "gemini", {
      synthesizeRubricWhenBlank: true,
    });
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.criteriaNames.length).toBe(2);
    expect(result.criteriaNames).toEqual(["Thesis", "Evidence"]);
  });
});
