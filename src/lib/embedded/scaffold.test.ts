import { describe, it, expect } from "vitest";
import { copyedit, extractDefinitions, summarize } from "./scaffold";

describe("summarize", () => {
  it("returns the input unchanged when it has few sentences", () => {
    expect(summarize("Only one sentence here.", 2)).toBe("Only one sentence here.");
  });

  it("selects the most topical sentences and keeps original order", () => {
    const text =
      "Photosynthesis converts sunlight into chemical energy. The cafeteria serves lunch at noon. " +
      "Chlorophyll in the leaves absorbs sunlight for photosynthesis. Buses leave from the north lot.";
    const summary = summarize(text, 2);
    // The two photosynthesis sentences are the most topical.
    expect(summary).toContain("Photosynthesis converts sunlight");
    expect(summary).toContain("Chlorophyll in the leaves");
    expect(summary).not.toContain("cafeteria");
    // Original order preserved.
    expect(summary.indexOf("Photosynthesis")).toBeLessThan(summary.indexOf("Chlorophyll"));
  });

  it("is deterministic", () => {
    const text = "Alpha beta gamma delta. Beta gamma delta epsilon. Unrelated filler sentence here.";
    expect(summarize(text, 1)).toBe(summarize(text, 1));
  });

  it("returns an empty string for empty input", () => {
    expect(summarize("", 2)).toBe("");
  });
});

describe("extractDefinitions", () => {
  it("captures copula and 'refers to' definitions", () => {
    const defs = extractDefinitions(
      "Recursion is when a function calls itself. An API refers to a contract between programs."
    );
    const terms = defs.map((d) => d.term.toLowerCase());
    expect(terms).toContain("recursion");
    expect(defs.find((d) => d.term.toLowerCase() === "recursion")?.definition).toMatch(/function calls itself/);
  });

  it("captures 'Term: definition' label lines", () => {
    const defs = extractDefinitions("Idempotence: an operation that can be applied many times without changing the result.");
    expect(defs[0].term).toBe("Idempotence");
    expect(defs[0].definition).toMatch(/^Idempotence is an operation/);
  });

  it("ignores non-definitional sentences (schedule / pronoun leads)", () => {
    const defs = extractDefinitions("The midterm is on Friday. This is important. Students are expected to attend.");
    expect(defs).toHaveLength(0);
  });

  it("deduplicates by term", () => {
    const defs = extractDefinitions("Loops are used to repeat code. Loops are a control structure.");
    expect(defs.filter((d) => d.term.toLowerCase() === "loops")).toHaveLength(1);
  });
});

describe("copyedit", () => {
  it("cuts wordy phrases and empty intensifiers", () => {
    const out = copyedit("In order to pass, you really must very carefully test the code.");
    expect(out).toBe("To pass, you must carefully test the code.");
  });

  it("fixes punctuation spacing and repeated words", () => {
    expect(copyedit("the the results are good ,really")).toBe("The results are good, really.");
  });

  it("leaves numbers with commas and colons alone", () => {
    expect(copyedit("Revenue was 3,000 by 10:30")).toBe("Revenue was 3,000 by 10:30.");
  });

  it("capitalizes sentence starts and ensures terminal punctuation", () => {
    expect(copyedit("hello world. this is fine")).toBe("Hello world. This is fine.");
  });

  it("returns empty for empty input", () => {
    expect(copyedit("   ")).toBe("");
  });
});
