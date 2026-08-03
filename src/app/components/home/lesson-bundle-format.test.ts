import { describe, expect, it } from "vitest";
import {
  bundleFileBaseName,
  formatExamplesText,
  formatRubricText,
  parseLessonFieldKey,
} from "./lesson-bundle-format";
import type { ExamplesData } from "../../actions-types";

type ExampleItem = ExamplesData["examples"][number];

// `concept` is required on ExampleItem but is not read by any formatter here,
// so it gets a fixed filler rather than being restated in every case.
function examples(items: Array<Omit<ExampleItem, "concept">>): ExamplesData {
  return {
    lessonType: "programming",
    examples: items.map((item) => ({ ...item, concept: "concept" })),
  };
}

describe("formatRubricText", () => {
  it("returns empty string for no rubric, so the caller omits rubric.txt", () => {
    expect(formatRubricText(null)).toBe("");
    expect(formatRubricText("")).toBe("");
  });

  it("renders parsed rows with their weight and indented subcategories", () => {
    const text = formatRubricText(
      "Design (40%): Layout and hierarchy\n  Spacing: Consistent gutters\nCode (60%): Correctness"
    );
    expect(text).toBe(
      [
        "GRADING RUBRIC",
        "==============",
        "",
        "Design (40%): Layout and hierarchy",
        "  Spacing: Consistent gutters",
        "",
        "Code (60%): Correctness",
        "",
      ].join("\n")
    );
  });

  it("appends a percent sign to a bare numeric weight", () => {
    // parseGeneratedRubric accepts "(40)" as well as "(40%)"; only the former
    // needs the suffix added, and it must not be doubled on the latter.
    expect(formatRubricText("Design (40): Layout")).toContain("Design (40%): Layout");
    expect(formatRubricText("Design (40%): Layout")).toContain("Design (40%): Layout");
    expect(formatRubricText("Design (40%): Layout")).not.toContain("40%%");
  });

  it("falls back to the raw text under the same heading when nothing parses", () => {
    expect(formatRubricText("just some prose with no rows")).toBe(
      "GRADING RUBRIC\n==============\n\njust some prose with no rows"
    );
  });
});

describe("formatExamplesText", () => {
  it("returns empty string for no examples, so the caller omits examples.txt", () => {
    expect(formatExamplesText(null)).toBe("");
    expect(formatExamplesText(examples([]))).toBe("");
  });

  it("writes the banner once, then each example with its code left raw", () => {
    const text = formatExamplesText(
      examples([
        { title: "First", language: "python", content: "print(1)", explanation: "Prints one." },
        { title: "Second", language: "python", content: "print(2)", explanation: "Prints two." },
      ])
    );
    // Banner appears exactly once, ahead of the first example only.
    expect(text.match(/IN-CLASS EXAMPLES/g)).toHaveLength(1);
    expect(text.indexOf("IN-CLASS EXAMPLES")).toBeLessThan(text.indexOf("EXAMPLE 1"));
    // Examples are numbered from 1, and the code body carries no comment marker.
    expect(text).toContain("# EXAMPLE 1: First");
    expect(text).toContain("# EXAMPLE 2: Second");
    expect(text).toContain("\nprint(1)\n");
    expect(text).not.toContain("# print(1)");
  });

  it("underlines each heading to the heading's own length", () => {
    const text = formatExamplesText(
      examples([{ title: "Ab", language: "python", content: "x", explanation: "y" }])
    );
    const heading = "EXAMPLE 1: Ab";
    expect(text).toContain(`# ${heading}\n# ${"-".repeat(heading.length)}`);
  });

  it("uses each example's own comment marker", () => {
    const text = formatExamplesText(
      examples([
        { title: "Query", language: "sql", content: "SELECT 1", explanation: "Selects." },
        { title: "Script", language: "javascript", content: "let a", explanation: "Declares." },
      ])
    );
    expect(text).toContain("-- EXAMPLE 1: Query");
    expect(text).toContain("// EXAMPLE 2: Script");
  });

  it("keeps a blank explanation line blank instead of emitting a bare marker", () => {
    const text = formatExamplesText(
      examples([
        { title: "T", language: "python", content: "x", explanation: "one\n\ntwo" },
      ])
    );
    expect(text).toContain("# one\n\n# two");
    expect(text).not.toContain("# one\n# \n# two");
  });
});

describe("bundleFileBaseName", () => {
  it("collapses every run of non-alphanumerics to a single underscore", () => {
    expect(bundleFileBaseName("Week 3: Loops & Arrays!")).toBe("Week_3_Loops_Arrays_");
  });

  it("leaves an already-safe title untouched", () => {
    expect(bundleFileBaseName("Week3")).toBe("Week3");
  });
});

describe("parseLessonFieldKey", () => {
  it("resolves each exact key to its own field", () => {
    expect(parseLessonFieldKey("lesson-title")).toEqual({ kind: "lesson-title" });
    expect(parseLessonFieldKey("intro-overview")).toEqual({ kind: "intro-overview" });
    expect(parseLessonFieldKey("intro-keyTerms")).toEqual({ kind: "intro-keyTerms" });
    expect(parseLessonFieldKey("assignment-overview")).toEqual({ kind: "assignment-overview" });
    expect(parseLessonFieldKey("assignment-tools")).toEqual({ kind: "assignment-tools" });
    expect(parseLessonFieldKey("assignment-deliverables")).toEqual({ kind: "assignment-deliverables" });
    expect(parseLessonFieldKey("rubric")).toEqual({ kind: "rubric" });
  });

  it("reads the index off each prefixed key", () => {
    // These four offsets were hand-counted in the inline version this
    // replaces; two of the prefixes are the same length, which is exactly the
    // kind of coincidence that hides a miscount.
    expect(parseLessonFieldKey("slide-0")).toEqual({ kind: "slide", index: 0 });
    expect(parseLessonFieldKey("assignment-step-2")).toEqual({ kind: "assignment-step", index: 2 });
    expect(parseLessonFieldKey("example-content-3")).toEqual({ kind: "example-content", index: 3 });
    expect(parseLessonFieldKey("example-explanation-4")).toEqual({
      kind: "example-explanation",
      index: 4,
    });
  });

  it("reads multi-digit indices, not just the first digit", () => {
    expect(parseLessonFieldKey("slide-12")).toEqual({ kind: "slide", index: 12 });
    expect(parseLessonFieldKey("example-explanation-10")).toEqual({
      kind: "example-explanation",
      index: 10,
    });
  });

  it("does not confuse example-content with example-explanation", () => {
    // Both suffixes sit under "example-", so a prefix test that stopped too
    // early would route an explanation edit into the content field.
    expect(parseLessonFieldKey("example-content-1")).toEqual({ kind: "example-content", index: 1 });
    expect(parseLessonFieldKey("example-explanation-1")).toEqual({
      kind: "example-explanation",
      index: 1,
    });
  });

  it("rejects a prefixed key whose index is not a non-negative integer", () => {
    expect(parseLessonFieldKey("slide-")).toBeNull();
    expect(parseLessonFieldKey("slide-x")).toBeNull();
    expect(parseLessonFieldKey("slide-1x")).toBeNull();
    expect(parseLessonFieldKey("slide--1")).toBeNull();
    expect(parseLessonFieldKey("slide-1.5")).toBeNull();
  });

  it("returns null for an unknown key", () => {
    expect(parseLessonFieldKey("")).toBeNull();
    expect(parseLessonFieldKey("nope")).toBeNull();
    expect(parseLessonFieldKey("assignment-")).toBeNull();
  });
});
