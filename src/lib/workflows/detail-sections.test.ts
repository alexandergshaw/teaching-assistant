import { describe, it, expect } from "vitest";
import { splitDetailSections } from "./detail-sections";

describe("splitDetailSections", () => {
  it("treats a block whose first line ends with a colon as a headed section", () => {
    const text = "Rubric breakdown:\n- Clarity: 4 (well organized)\n- Correctness: 5";
    const sections = splitDetailSections(text);
    expect(sections).toEqual([
      {
        header: "Rubric breakdown:",
        body: "- Clarity: 4 (well organized)\n- Correctness: 5",
      },
    ]);
  });

  it("splits a header whose content continues on the same line", () => {
    const text = "Code run during grading: ran cleanly (exit 0)\nhello world";
    const sections = splitDetailSections(text);
    expect(sections).toEqual([
      { header: "Code run during grading:", body: "ran cleanly (exit 0)\nhello world" },
    ]);
  });

  it("splits multiple blank-line-separated blocks, matching the registry's rowDetail shape", () => {
    const text = [
      "Jane Doe",
      "",
      "Rubric breakdown:\n- Clarity: 4",
      "",
      "AI feedback:\nGreat work overall.",
      "",
      "Code run during grading: ran cleanly (exit 0)\nAll tests passed.",
      "",
      "Text submission:\nHere is my essay.",
    ].join("\n");

    const sections = splitDetailSections(text);

    expect(sections).toEqual([
      { header: null, body: "Jane Doe" },
      { header: "Rubric breakdown:", body: "- Clarity: 4" },
      { header: "AI feedback:", body: "Great work overall." },
      {
        header: "Code run during grading:",
        body: "ran cleanly (exit 0)\nAll tests passed.",
      },
      { header: "Text submission:", body: "Here is my essay." },
    ]);
  });

  it("renders a block with no colon as a headerless body", () => {
    const text = "Just a plain paragraph with no label.";
    expect(splitDetailSections(text)).toEqual([
      { header: null, body: "Just a plain paragraph with no label." },
    ]);
  });

  it("does not misread a colon deep into a long first line as a header", () => {
    const text =
      "This is a long sentence that happens to contain a colon far into the line: like this one.";
    expect(splitDetailSections(text)).toEqual([{ header: null, body: text }]);
  });

  it("returns an empty array for empty input", () => {
    expect(splitDetailSections("")).toEqual([]);
    expect(splitDetailSections("   \n\n  ")).toEqual([]);
  });

  it("handles a header-only block with nothing else on the line or after", () => {
    const text = "AI feedback:";
    expect(splitDetailSections(text)).toEqual([
      { header: "AI feedback:", body: "" },
    ]);
  });
});
