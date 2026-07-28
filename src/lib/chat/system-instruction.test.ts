import { describe, it, expect } from "vitest";
import { buildChatSystemInstruction, PLAIN_TEXT_ONLY_INSTRUCTION } from "./system-instruction";

describe("buildChatSystemInstruction", () => {
  it("leaves the instruction unchanged when the style block is blank", () => {
    expect(buildChatSystemInstruction("")).toBe(PLAIN_TEXT_ONLY_INSTRUCTION);
  });

  it("keeps the plain-text rule verbatim and gives it precedence (it appears first) when a style block is present", () => {
    const styleBlock =
      "\n\nMATCH THE INSTRUCTOR'S PERSONAL WRITING STYLE (tone, rhythm, vocabulary) shown in this sample:\nSome sample prose.";

    const result = buildChatSystemInstruction(styleBlock);

    expect(result.startsWith(PLAIN_TEXT_ONLY_INSTRUCTION)).toBe(true);
    expect(result.indexOf(PLAIN_TEXT_ONLY_INSTRUCTION)).toBeLessThan(result.indexOf("Some sample prose."));
  });

  it("adds both the writing sample and an explicit mimic instruction when a style block is present", () => {
    const styleBlock =
      "\n\nMATCH THE INSTRUCTOR'S PERSONAL WRITING STYLE (tone, rhythm, vocabulary) shown in this sample:\nSome sample prose.";

    const result = buildChatSystemInstruction(styleBlock);

    expect(result).toContain("Some sample prose.");
    expect(result.toLowerCase()).toContain("mimic this writing tone");
  });
});
