import { describe, expect, it } from "vitest";
import { splitNarrationText } from "./narration-chunks";

describe("splitNarrationText", () => {
  it("returns empty array for empty input", () => {
    expect(splitNarrationText("")).toEqual([]);
  });

  it("returns empty array for whitespace-only input", () => {
    expect(splitNarrationText("   \n\n   ")).toEqual([]);
  });

  it("returns single chunk for short text", () => {
    const text = "Hello world.";
    const result = splitNarrationText(text);
    expect(result).toEqual(["Hello world."]);
  });

  it("packs multiple short paragraphs into chunks", () => {
    const text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
    const result = splitNarrationText(text, 50);
    // All three should fit in one chunk since total is ~56 chars and chunks are 50 each
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.join(" ")).toContain("First paragraph");
    expect(result.join(" ")).toContain("Second paragraph");
    expect(result.join(" ")).toContain("Third paragraph");
  });

  it("splits long paragraph on sentence boundaries", () => {
    const text = "Hello world. This is great. Really amazing.";
    const result = splitNarrationText(text, 20);
    // Each sentence should be its own chunk due to maxLen constraint
    expect(result.length).toBeGreaterThan(1);
    expect(result[0]).toContain("Hello");
  });

  it("hard-slices a single sentence longer than maxLen", () => {
    const text = "Thisisaverylongsentencewithoutanyspacesthatexceedsthemaximumlengthbyquite abit.";
    const maxLen = 30;
    const result = splitNarrationText(text, maxLen);

    // Each chunk should not exceed maxLen
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(maxLen);
    }
  });

  it("preserves all text content exactly", () => {
    const texts = [
      "Short text.",
      "Multiple sentences. Like this one. And another!",
      "Paragraph one.\n\nParagraph two.\n\nParagraph three.",
      "Text with varied punctuation? Yes! Absolutely.",
    ];

    for (const text of texts) {
      const result = splitNarrationText(text);
      const joined = result.join(" ");
      // Remove extra spaces that may have been added during chunking
      const originalNormalized = text
        .replace(/\r\n/g, " ")
        .replace(/\r/g, " ")
        .replace(/\n\n+/g, " ")
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const joinedNormalized = joined.replace(/\s+/g, " ").trim();
      expect(joinedNormalized).toEqual(originalNormalized);
    }
  });

  it("respects maxLen constraint on all chunks", () => {
    const text = "Short. Medium sentence here. Very long sentence that definitely exceeds the maximum length for chunks.";
    const maxLen = 25;
    const result = splitNarrationText(text, maxLen);

    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(maxLen);
    }
  });

  it("handles paragraph packing with realistic sizes", () => {
    const para1 = "This is the first paragraph with some content.";
    const para2 = "This is the second paragraph with different content.";
    const para3 = "And the third paragraph to round things out.";
    const text = `${para1}\n\n${para2}\n\n${para3}`;

    const result = splitNarrationText(text, 100);
    // With 100 char limit, should pack multiple paragraphs
    expect(result.length).toBeGreaterThanOrEqual(1);
    const allText = result.join(" ");
    expect(allText).toContain("first paragraph");
    expect(allText).toContain("second paragraph");
    expect(allText).toContain("third paragraph");
  });

  it("normalizes different newline formats", () => {
    const textLF = "Paragraph one.\n\nParagraph two.";
    const textCRLF = "Paragraph one.\r\n\r\nParagraph two.";
    const textCR = "Paragraph one.\r\rParagraph two.";

    const resultLF = splitNarrationText(textLF);
    const resultCRLF = splitNarrationText(textCRLF);
    const resultCR = splitNarrationText(textCR);

    expect(resultLF).toEqual(resultCRLF);
    expect(resultLF).toEqual(resultCR);
  });

  it("handles internal newlines within paragraphs", () => {
    const text = "First line\nof paragraph.\n\nSecond paragraph.";
    const result = splitNarrationText(text);
    const allText = result.join(" ");
    expect(allText).toContain("First line");
    expect(allText).toContain("of paragraph");
  });

  it("removes empty paragraphs", () => {
    const text = "Paragraph one.\n\n\n\n\nParagraph two.";
    const result = splitNarrationText(text);
    expect(result.join(" ")).toEqual("Paragraph one. Paragraph two.");
  });

  it("trims chunks properly", () => {
    const text = "  Paragraph one.  \n\n  Paragraph two.  ";
    const result = splitNarrationText(text);
    for (const chunk of result) {
      expect(chunk).toEqual(chunk.trim());
    }
  });

  it("handles a realistic 15k character script", () => {
    // Create a script approximately 15k characters
    const shortSentence = "This is a sentence about Computer Science Principles. ";
    let script = "";
    while (script.length < 15000) {
      script += shortSentence;
    }
    script = script.slice(0, 15000); // Trim to exactly ~15k

    const result = splitNarrationText(script, 3800);

    // Should split into multiple chunks
    expect(result.length).toBeGreaterThan(1);

    // Verify all chunks are within limit
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(3800);
    }

    // Verify all text is preserved
    const joined = result.join(" ");
    const originalNormalized = script.replace(/\s+/g, " ").trim();
    const joinedNormalized = joined.replace(/\s+/g, " ").trim();
    expect(joinedNormalized).toEqual(originalNormalized);
  });

  it("handles text with various sentence terminators", () => {
    const text = "Question mark? Exclamation! Regular period. Mix them.";
    const result = splitNarrationText(text, 20);
    const joined = result.join(" ");
    expect(joined).toContain("Question mark?");
    expect(joined).toContain("Exclamation!");
    expect(joined).toContain("Regular period");
  });

  it("never returns empty chunks", () => {
    const texts = [
      "Short.",
      "Multiple. Sentences. Here.",
      "Para one.\n\nPara two.\n\nPara three.",
    ];

    for (const text of texts) {
      const result = splitNarrationText(text);
      for (const chunk of result) {
        expect(chunk.length).toBeGreaterThan(0);
      }
    }
  });

  it("preserves order of content", () => {
    const text = "First. Second. Third. Fourth. Fifth.";
    const result = splitNarrationText(text, 15);
    const joined = result.join(" ");

    const firstIdx = joined.indexOf("First");
    const secondIdx = joined.indexOf("Second");
    const thirdIdx = joined.indexOf("Third");
    const fourthIdx = joined.indexOf("Fourth");
    const fifthIdx = joined.indexOf("Fifth");

    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
    expect(thirdIdx).toBeLessThan(fourthIdx);
    expect(fourthIdx).toBeLessThan(fifthIdx);
  });

  it("handles text without sentence terminators", () => {
    const text = "This text has no punctuation whatsoever";
    const result = splitNarrationText(text);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.join(" ")).toContain("This text");
  });

  it("handles multiple spaces between sentences", () => {
    const text = "First sentence.  Second sentence.   Third sentence.";
    const result = splitNarrationText(text, 30);
    const allText = result.join(" ");
    expect(allText).toContain("First sentence");
    expect(allText).toContain("Second sentence");
    expect(allText).toContain("Third sentence");
  });
});
