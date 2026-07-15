import { describe, it, expect } from "vitest";
import {
  STEP_CATEGORY_ORDER,
  STEP_CATEGORIES,
  stepCategory,
  stepCategoryLabel,
  stepCategoryOrderIndex,
} from "./step-categories";

describe("STEP_CATEGORY_ORDER", () => {
  it("has unique category ids", () => {
    const ids = STEP_CATEGORY_ORDER.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ends with the 'other' fallback group", () => {
    expect(STEP_CATEGORY_ORDER[STEP_CATEGORY_ORDER.length - 1].id).toBe("other");
  });
});

describe("STEP_CATEGORIES", () => {
  it("assigns every mapped step to a category present in STEP_CATEGORY_ORDER", () => {
    const known = new Set(STEP_CATEGORY_ORDER.map((c) => c.id));
    for (const [type, categoryId] of Object.entries(STEP_CATEGORIES)) {
      expect(known.has(categoryId), `${type} -> ${categoryId}`).toBe(true);
    }
  });

  it("never assigns a step to the 'other' fallback (other is unmapped-only)", () => {
    for (const categoryId of Object.values(STEP_CATEGORIES)) {
      expect(categoryId).not.toBe("other");
    }
  });
});

describe("stepCategory", () => {
  it("returns the assigned category for known steps", () => {
    expect(stepCategory("grade-repo")).toBe("grading");
    expect(stepCategory("read-inbox")).toBe("messaging");
    expect(stepCategory("repo-from-template")).toBe("github");
    expect(stepCategory("generate-schedule")).toBe("planning");
    expect(stepCategory("dispatch-tests")).toBe("testing");
  });

  it("returns 'other' for an unknown step type", () => {
    expect(stepCategory("not-a-real-step")).toBe("other");
    expect(stepCategory("")).toBe("other");
  });
});

describe("stepCategoryLabel", () => {
  it("returns the label for a known category id", () => {
    expect(stepCategoryLabel("github")).toBe("GitHub & repos");
    expect(stepCategoryLabel("grading")).toBe("Grading");
  });

  it("falls back to 'Other' for an unknown category id", () => {
    expect(stepCategoryLabel("nope")).toBe("Other");
  });
});

describe("stepCategoryOrderIndex", () => {
  it("orders known categories by their position", () => {
    expect(stepCategoryOrderIndex("planning")).toBe(0);
    expect(stepCategoryOrderIndex("planning")).toBeLessThan(stepCategoryOrderIndex("github"));
    expect(stepCategoryOrderIndex("other")).toBe(STEP_CATEGORY_ORDER.length - 1);
  });

  it("sorts an unknown category id last", () => {
    expect(stepCategoryOrderIndex("nope")).toBe(STEP_CATEGORY_ORDER.length);
  });
});
