import { describe, it, expect } from "vitest";
import {
  parseQaExamples,
  buildExampleProgramsDocLines,
  buildExampleProgramsTextBlock,
  type QaExample,
} from "./lecture-qa";

describe("parseQaExamples", () => {
  it("returns [] for a missing/undefined value", () => {
    expect(parseQaExamples(undefined)).toEqual([]);
  });

  it("returns [] for a non-array value (malformed field)", () => {
    expect(parseQaExamples("not an array")).toEqual([]);
    expect(parseQaExamples({ title: "oops" })).toEqual([]);
    expect(parseQaExamples(null)).toEqual([]);
  });

  it("parses a well-formed list", () => {
    const raw = [
      { title: "Fibonacci", language: "python", code: "def fib(n): ...", explanation: "Shows recursion." },
    ];
    const result = parseQaExamples(raw);
    expect(result).toEqual([
      { title: "Fibonacci", language: "python", code: "def fib(n): ...", explanation: "Shows recursion." },
    ]);
  });

  it("clamps to at most 3 examples", () => {
    const raw = Array.from({ length: 5 }, (_, i) => ({
      title: `Example ${i}`,
      language: "python",
      code: `print(${i})`,
      explanation: "",
    }));
    const result = parseQaExamples(raw);
    expect(result.length).toBe(3);
    expect(result.map((e) => e.title)).toEqual(["Example 0", "Example 1", "Example 2"]);
  });

  it("drops entries with empty code", () => {
    const raw = [
      { title: "Good", language: "python", code: "print(1)", explanation: "" },
      { title: "No code", language: "python", code: "", explanation: "" },
      { title: "Whitespace code", language: "python", code: "   ", explanation: "" },
    ];
    const result = parseQaExamples(raw);
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("Good");
  });

  it("drops entries with empty title", () => {
    const raw = [
      { title: "", language: "python", code: "print(1)", explanation: "" },
      { title: "   ", language: "python", code: "print(1)", explanation: "" },
    ];
    expect(parseQaExamples(raw)).toEqual([]);
  });

  it("drops non-object entries", () => {
    const raw = ["a string entry", 42, null, { title: "Good", code: "print(1)" }];
    const result = parseQaExamples(raw);
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("Good");
  });

  it("defaults language to 'text' when missing or blank", () => {
    const raw = [{ title: "Untyped", code: "some code" }];
    const result = parseQaExamples(raw);
    expect(result[0].language).toBe("text");
  });

  it("defaults explanation to '' when missing", () => {
    const raw = [{ title: "No explanation", code: "some code" }];
    const result = parseQaExamples(raw);
    expect(result[0].explanation).toBe("");
  });
});

describe("buildExampleProgramsDocLines", () => {
  it("returns [] for an empty list (no empty heading)", () => {
    expect(buildExampleProgramsDocLines([])).toEqual([]);
  });

  it("renders the section heading, per-example heading, explanation, and a fenced code block", () => {
    const examples: QaExample[] = [
      { title: "Fibonacci", language: "python", code: "def fib(n):\n    return n", explanation: "Shows recursion." },
    ];
    const lines = buildExampleProgramsDocLines(examples);

    expect(lines).toContain("## Example programs");
    expect(lines).toContain("### Fibonacci");
    expect(lines).toContain("Shows recursion.");

    const fenceOpenIdx = lines.indexOf("```python");
    expect(fenceOpenIdx).toBeGreaterThan(-1);
    expect(lines[fenceOpenIdx + 1]).toBe("def fib(n):\n    return n");
    expect(lines[fenceOpenIdx + 2]).toBe("```");
  });

  it("renders multiple examples in order", () => {
    const examples: QaExample[] = [
      { title: "First", language: "python", code: "print(1)", explanation: "" },
      { title: "Second", language: "javascript", code: "console.log(2)", explanation: "" },
    ];
    const lines = buildExampleProgramsDocLines(examples);
    const firstIdx = lines.indexOf("### First");
    const secondIdx = lines.indexOf("### Second");
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(firstIdx);
    expect(lines).toContain("```python");
    expect(lines).toContain("```javascript");
  });

  it("omits the explanation line entirely when explanation is blank", () => {
    const examples: QaExample[] = [{ title: "No explanation", language: "python", code: "print(1)", explanation: "" }];
    const lines = buildExampleProgramsDocLines(examples);
    // Heading immediately followed by a blank line, then straight to the fence.
    const headingIdx = lines.indexOf("### No explanation");
    expect(lines[headingIdx + 1]).toBe("");
    expect(lines[headingIdx + 2]).toBe("```python");
  });
});

describe("buildExampleProgramsTextBlock", () => {
  it("returns '' for an empty list (qaText stays byte-identical)", () => {
    expect(buildExampleProgramsTextBlock([])).toBe("");
  });

  it("renders a clearly delimited block with title, language, code, and explanation", () => {
    const examples: QaExample[] = [
      { title: "Fibonacci", language: "python", code: "def fib(n): ...", explanation: "Shows recursion." },
    ];
    const block = buildExampleProgramsTextBlock(examples);
    expect(block).toContain("=== Example programs ===");
    expect(block).toContain("Example 1: Fibonacci (python)");
    expect(block).toContain("def fib(n): ...");
    expect(block).toContain("Explanation: Shows recursion.");
  });

  it("numbers multiple examples in order", () => {
    const examples: QaExample[] = [
      { title: "First", language: "python", code: "print(1)", explanation: "" },
      { title: "Second", language: "javascript", code: "console.log(2)", explanation: "" },
    ];
    const block = buildExampleProgramsTextBlock(examples);
    expect(block.indexOf("Example 1: First")).toBeLessThan(block.indexOf("Example 2: Second"));
  });
});
