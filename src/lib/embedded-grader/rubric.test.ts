import { describe, it, expect } from "vitest";
import {
  buildRubricFromInstructions,
  buildRubricFromRubricText,
  fullCreditChecklist,
  renderRubricText,
} from "./rubric";

describe("buildRubricFromInstructions", () => {
  it("derives file, length, code, and keyword checks from a brief", () => {
    const rubric = buildRubricFromInstructions(
      "Submit a PDF report of at least 300 words. You must include normalization. Define a function named clean_data."
    );
    const sig = rubric.checks.map((c) => `${c.checkType}:${c.target}`);
    expect(sig).toContain("file_type:pdf");
    expect(sig).toContain("code_symbol:clean_data");
    expect(sig).toContain("keyword:normalization");
    expect(rubric.checks.some((c) => c.checkType === "min_words" && c.count === 300)).toBe(true);
    expect(rubric.origin).toBe("instructions");
  });

  it("converts a page requirement into a word floor", () => {
    const rubric = buildRubricFromInstructions("Write at least 2 pages.");
    expect(rubric.checks.some((c) => c.checkType === "min_words" && c.count === 500)).toBe(true);
  });

  it("falls back to a single completeness check with a warning when nothing is concrete", () => {
    const rubric = buildRubricFromInstructions("Do your best work.");
    expect(rubric.checks).toHaveLength(1);
    expect(rubric.checks[0].checkType).toBe("min_words");
    expect(rubric.warnings.length).toBeGreaterThan(0);
  });
});

describe("buildRubricFromRubricText", () => {
  it("parses a structured check-based JSON rubric and keeps its points", () => {
    const rubric = buildRubricFromRubricText(
      JSON.stringify([
        { criterion: "Uses pandas", check_type: "keyword", target: "pandas", points: 20 },
        { criterion: "Has main", checkType: "code_symbol", target: "main", points: 30 },
      ])
    );
    expect(rubric.origin).toBe("checks");
    expect(rubric.checks[0].points).toBe(20);
    expect(rubric.checks[1].points).toBe(30);
    expect(rubric.warnings).toHaveLength(0);
  });

  it("maps a free-text criteria rubric onto checks", () => {
    const rubric = buildRubricFromRubricText(
      "Code Quality (10 pts): clean, readable code.\nDocumentation (10 pts): include a README file."
    );
    expect(rubric.origin).toBe("rubric");
    expect(rubric.checks).toHaveLength(2);
  });

  it("generates checks from prose when the rubric has no parseable criteria", () => {
    const rubric = buildRubricFromRubricText("Make sure to define a function named solve and submit a PDF.");
    expect(rubric.origin).toBe("rubric");
    expect(rubric.checks.some((c) => c.checkType === "code_symbol" && c.target === "solve")).toBe(true);
  });
});

describe("buildRubricFromRubricText: CSV", () => {
  it("parses a structured check-based CSV with loosely named headers", () => {
    const csv = [
      "Criterion,Check Type,Target,Points,Count,Terms",
      "Uses pandas,keyword,pandas,20,,",
      "Defines main,code_symbol,main,30,,",
      "Long enough,min_words,,10,300,",
      'Covers topics,all_keywords,,10,,"bias;variance"',
    ].join("\n");
    const rubric = buildRubricFromRubricText(csv, "rubric.csv");
    expect(rubric.origin).toBe("checks");
    expect(rubric.warnings).toHaveLength(0);
    expect(rubric.checks).toHaveLength(4);
    expect(rubric.checks[0]).toMatchObject({ checkType: "keyword", target: "pandas", points: 20 });
    expect(rubric.checks[1]).toMatchObject({ checkType: "code_symbol", target: "main", points: 30 });
    expect(rubric.checks[2]).toMatchObject({ checkType: "min_words", count: 300 });
    expect(rubric.checks[3].terms).toEqual(["bias", "variance"]);
  });

  it("handles quoted cells containing commas", () => {
    const csv = 'criterion,check_type,target,points\n"Imports os, sys",regex,"import\\s+os",15';
    const rubric = buildRubricFromRubricText(csv, "rubric.csv");
    expect(rubric.origin).toBe("checks");
    expect(rubric.checks[0].criterion).toBe("Imports os, sys");
    // The pattern sits in the target column; runCheck reads `pattern ?? target`.
    expect(rubric.checks[0].target).toBe("import\\s+os");
    expect(rubric.checks[0].points).toBe(15);
  });

  it("maps a criterion/points CSV (no check_type) heuristically with a warning", () => {
    const csv = "criterion,points,description\nDocumentation,10,include a README file\nTesting,10,write unit tests";
    const rubric = buildRubricFromRubricText(csv, "rubric.csv");
    expect(rubric.origin).toBe("rubric");
    expect(rubric.checks).toHaveLength(2);
    expect(rubric.warnings[0]).toContain("check_type");
  });

  it("does not misread a free-text criteria rubric as CSV", () => {
    const rubric = buildRubricFromRubricText("Code Quality (10 pts): clean, readable code.");
    expect(rubric.origin).toBe("rubric");
    expect(rubric.checks).toHaveLength(1);
  });
});

describe("presentation helpers", () => {
  it("renders a readable rubric and a full-credit checklist", () => {
    const rubric = buildRubricFromInstructions("Submit a PDF. Define a function named solve.");
    const text = renderRubricText(rubric);
    expect(text).toContain("pts):");
    const checklist = fullCreditChecklist(rubric);
    expect(checklist.length).toBe(rubric.checks.length);
    expect(checklist.join(" ")).toContain("Submit a .pdf file");
  });
});
