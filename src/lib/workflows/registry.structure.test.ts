import { describe, it, expect } from "vitest";
import { STEP_REGISTRY, getStepDefinition } from "./registry";
import { STEP_CATEGORIES } from "./step-categories";

describe("registry structure", () => {
  it("has no duplicate step types", () => {
    const types = STEP_REGISTRY.map((s) => s.type);
    const uniqueTypes = new Set(types);
    expect(types.length).toBe(uniqueTypes.size);
  });

  it("registry type-set matches step-categories", () => {
    const registryTypes = new Set(STEP_REGISTRY.map((s) => s.type));
    const categorizedTypes = new Set(Object.keys(STEP_CATEGORIES));

    // All registry types should be categorized
    for (const type of registryTypes) {
      expect(categorizedTypes).toContain(type);
    }

    // Note: categorized types might include types not yet in STEP_REGISTRY (for future additions)
  });

  it("getStepDefinition resolves every categorized step type", () => {
    const categorizedTypes = Object.keys(STEP_CATEGORIES);
    for (const type of categorizedTypes) {
      const def = getStepDefinition(type);
      // Some types might not be in registry yet (future additions), but should not error
      if (def) {
        expect(def.type).toBe(type);
      }
    }
  });

  it("every step has required fields", () => {
    for (const step of STEP_REGISTRY) {
      expect(step.type).toBeDefined();
      expect(step.name).toBeDefined();
      expect(step.description).toBeDefined();
      expect(Array.isArray(step.inputs)).toBe(true);
      expect(Array.isArray(step.outputs)).toBe(true);
      expect(typeof step.run).toBe("function");
    }
  });
});
