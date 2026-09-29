import { describe, it, expect } from "vitest";
import { buildRegeneratePrompt } from "./prompts";
import type { RegenerateInput } from "./types";

// W1-T7: buildRegeneratePrompt folds prior context AND prior critique as two
// separately-deletable lines (LEV-1 / AC-7). This is the highest-consequence
// oracle in PRES-1 - the leverage removal test.

function baseInput(overrides: Partial<RegenerateInput> = {}): RegenerateInput {
  return {
    kind: "outline",
    priorContext: {
      text: "CTXNONCE_R1",
      sources: [{ name: "f", text: "SRCNONCE_R2" }],
    },
    priorCritique: { text: "CRITNONCE_R3" },
    priorContent: null,
    withReview: false,
    ...overrides,
  };
}

describe("buildRegeneratePrompt", () => {
  it("folds the prior context text, prior source text, and prior critique text into the prompt", () => {
    const prompt = buildRegeneratePrompt(baseInput());
    expect(prompt).toContain("CTXNONCE_R1");
    expect(prompt).toContain("SRCNONCE_R2");
    expect(prompt).toContain("CRITNONCE_R3");
  });

  it("still folds the context when priorCritique is null, and never injects the literal 'null'", () => {
    const prompt = buildRegeneratePrompt(baseInput({ priorCritique: null }));
    expect(prompt).toContain("CTXNONCE_R1");
    expect(prompt).toContain("SRCNONCE_R2");
    expect(prompt).not.toContain("null");
  });
});
