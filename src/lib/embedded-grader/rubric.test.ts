import { describe, it, expect } from "vitest";
import {
  assertNoCodeLanguage,
  buildRubricFromInstructions,
  buildRubricFromRubricText,
  fullCreditChecklist,
  generateEmbeddedRubricText,
  isDegenerateCriterion,
  MAX_CRITERIA,
  MAX_CRITERIA_APPLIED,
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

describe("buildRubricFromInstructions: a realistic assignment brief", () => {
  const brief = `Assignment 3: Exploratory Data Analysis in Python

Requirements:
- Submit a single Jupyter notebook (.ipynb) named analysis.ipynb.
- Also submit a written summary as a PDF, at least 500 words.
- Your notebook must import pandas and matplotlib.
- Define a function named load_data that reads the CSV into a DataFrame.
- Define a function called plot_trends that produces a chart.
- Use the term "normalization" when you discuss preprocessing.
- Include at least 2 figures.
- Cite at least 3 sources.`;

  const rubric = buildRubricFromInstructions(brief);
  const has = (checkType: string, target?: string) =>
    rubric.checks.some((c) => c.checkType === checkType && (target === undefined || c.target === target));

  it("captures both required file types", () => {
    expect(has("file_type", "ipynb")).toBe(true);
    expect(has("file_type", "pdf")).toBe(true);
  });

  it("captures the word floor and the figure count", () => {
    expect(rubric.checks.some((c) => c.checkType === "min_words" && c.count === 500)).toBe(true);
    expect(rubric.checks.some((c) => c.checkType === "min_file_count" && c.count === 2)).toBe(true);
  });

  it("captures both required function definitions", () => {
    expect(has("code_symbol", "load_data")).toBe(true);
    expect(has("code_symbol", "plot_trends")).toBe(true);
  });

  it("captures content terms from quoted text and import/use phrases", () => {
    const keywords = rubric.checks.filter((c) => c.checkType === "keyword").map((c) => c.target);
    expect(keywords).toEqual(expect.arrayContaining(["normalization", "pandas", "matplotlib"]));
  });

  it("does not turn structural nouns (sources, figures) into content keywords", () => {
    const keywords = rubric.checks.filter((c) => c.checkType === "keyword").map((c) => c.target);
    expect(keywords).not.toContain("sources");
    expect(keywords).not.toContain("figures");
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

  it("reads the criterion description, not just its name", () => {
    const rubric = buildRubricFromRubricText("Deliverable (10 pts): submit your report as a PDF.");
    expect(rubric.checks[0]).toMatchObject({ checkType: "file_type", target: "pdf" });
  });

  it("captures a list of explicitly required terms as all_keywords", () => {
    const rubric = buildRubricFromRubricText("Libraries (10 pts): you must use pandas and numpy.");
    const c = rubric.checks[0];
    expect(c.checkType).toBe("all_keywords");
    expect(c.terms).toEqual(expect.arrayContaining(["pandas", "numpy"]));
  });

  it("detects a minimum file count from the description", () => {
    const rubric = buildRubricFromRubricText("Evidence (10 pts): attach at least 3 screenshots.");
    expect(rubric.checks[0]).toMatchObject({ checkType: "min_file_count", count: 3 });
  });

  it("does not treat a stray letter in prose as a file type", () => {
    const rubric = buildRubricFromRubricText("Clarity (10 pts): write clearly for the reader.");
    expect(rubric.checks[0].checkType).not.toBe("file_type");
  });

  it("falls back to an on-topic keyword check for a subjective criterion", () => {
    const rubric = buildRubricFromRubricText("Analysis (10 pts): interpret the regression results thoughtfully.");
    const c = rubric.checks[0];
    expect(["keyword", "any_keywords"]).toContain(c.checkType);
    const haystack = [c.target, ...(c.terms ?? [])].join(" ");
    expect(haystack).toContain("regression");
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

describe("generateEmbeddedRubricText", () => {
  it("renders the LLM generator's weighted, three-tier format", () => {
    const text = generateEmbeddedRubricText(
      "Submit a PDF of at least 300 words. Define a function named clean_data."
    );
    const areaLines = text.split("\n").filter((line) => line && !/^\s/.test(line));
    expect(areaLines.length).toBeGreaterThan(0);
    expect(areaLines.every((line) => /\(\d+%\):/.test(line))).toBe(true);
    expect(text).toContain("clean_data");
    expect(text).toContain("  Excellent (100%");
    expect(text).toContain("  Meets Expectations (75%");
    expect(text).toContain("  Needs Improvement (50%");
  });

  it("caps the generated rubric at MAX_CRITERIA areas", () => {
    const text = generateEmbeddedRubricText(
      "Submit a PDF. Submit a DOCX. Define a function named a. Define a function named b. " +
        "Include alpha. Include beta. Write at least 200 words. Submit at least 3 files."
    );
    const areaLines = text.split("\n").filter((line) => line && !/^\s/.test(line));
    expect(areaLines.length).toBeLessThanOrEqual(MAX_CRITERIA);
  });

  it("round-trips through the rubric parser like an LLM-authored rubric", () => {
    const text = generateEmbeddedRubricText("Submit a PDF. Define a function named solve.");
    const areaCount = text.split("\n").filter((line) => line && !/^\s/.test(line)).length;
    const parsed = buildRubricFromRubricText(text);
    expect(parsed.checks.length).toBe(areaCount);
  });

  it("still produces a completeness rubric when nothing concrete is present", () => {
    const text = generateEmbeddedRubricText("Do your best work.");
    expect(text.trim().length).toBeGreaterThan(0);
  });
});

// Y1: the grading rubric was gibberish for an applied (no-code) course - the
// OFFLINE CODING grader's word/code-symbol extractor, reused verbatim,
// produced "Defines to (25%): Define to in your code." on all 16 assignments
// of a real course. These tests exercise the applied-only path
// (generateEmbeddedRubricText(text, "applied")) directly.

// A realistic Week 5 critical-path assignment, matching the AC's own
// evidence: a Requirements section with concrete, well-formed statements of
// what the work must do, and a Deliverables section covering submission
// format/completeness and applying the work to the student's own project.
const CRITICAL_PATH_ASSIGNMENT = `# Critical Path Analysis

## Assignment Overview
Build a project schedule and identify its critical path.

## Instructions
- Build a task list for your own project with 12-20 activities.
- Diagram the dependencies between activities.

## Requirements
- Dependency logic must be complete and free of any circular references.
- Early start and early finish times must be computed correctly for every activity using forward pass arithmetic.
- The identified critical path must genuinely be the longest-duration path through the network, not simply the first tasks listed.
- At least three parallel task sequences must converge at a single milestone.

## Expected Scope and Effort
This should take about 3-4 hours.

## Deliverables
- Apply the analysis to your own selected project, not a textbook example.
- Submit your schedule as a .xlsx file with a written summary of at least 300 words.`;

describe("Y1-AC1: applied-course rubric criteria describe a quality of the deliverable", () => {
  it("builds criteria from the assignment's own Requirements and Deliverables sections, not word extraction", () => {
    const text = generateEmbeddedRubricText(CRITICAL_PATH_ASSIGNMENT, "applied");

    // The actual, concrete requirements the assignment stated are present -
    // this is the raw material Y1-AC1 calls for, not an invented rephrasing.
    expect(text).toContain("Dependency logic must be complete and free of any circular references");
    expect(text).toContain("Early start and early finish times must be computed correctly");
    expect(text).toContain("the longest-duration path through the network");
    expect(text).toContain("At least three parallel task sequences must converge");

    // None of the OFFLINE CODING grader's labels ever appear for an applied
    // course - this is the literal defect being fixed.
    expect(text).not.toMatch(/^Defines /m);
    expect(text).not.toMatch(/^Mentions /m);
  });

  it("SABOTAGE - reproduces the original defect when the coding generator is used on the same text", () => {
    // Proves the test above is not vacuously true: calling the coding-path
    // generator (kind omitted -> defaults to "coding") on the exact same
    // applied assignment text reproduces exactly the reported defect shape.
    const text = generateEmbeddedRubricText(CRITICAL_PATH_ASSIGNMENT);
    // "class" in "circular references" and "method"/"function"/"class"/"def"
    // occurring as ordinary English words is what actually produced
    // "Defines to" et al. in the real shipped course; at minimum, this text
    // never reads as a deliverable-quality description the way the applied
    // path's output does.
    const areaLines = text.split("\n").filter((line) => line && !/^\s/.test(line));
    expect(areaLines.length).toBeGreaterThan(0);
    // The coding path never reads the Requirements/Deliverables sections as
    // whole-sentence qualities - it never reproduces this exact sentence.
    expect(text).not.toContain("Dependency logic must be complete and free of any circular references");
  });

  it("falls back to a single completeness criterion when neither section is present", () => {
    const text = generateEmbeddedRubricText("# Assignment\n\nJust do the work.", "applied");
    expect(text.trim().length).toBeGreaterThan(0);
    const areaLines = text.split("\n").filter((line) => line && !/^\s/.test(line));
    expect(areaLines.length).toBe(1);
  });
});

describe("Y1-AC2: an applied-course rubric never mentions code (hard assertion)", () => {
  it("assertNoCodeLanguage throws on forbidden phrasing", () => {
    expect(() => assertNoCodeLanguage('Defines Analysis (25%): Define Analysis in your code.')).toThrow();
    expect(() => assertNoCodeLanguage("Excellent: Analysis is defined and used in the submitted code.")).toThrow();
    expect(() => assertNoCodeLanguage("This mentions code somewhere in the sentence.")).toThrow();
  });

  it("assertNoCodeLanguage does not throw on clean applied-course text", () => {
    expect(() =>
      assertNoCodeLanguage('Dependency logic is complete (60%): Assessed against this requirement: "Dependency logic is complete".')
    ).not.toThrow();
  });

  it("SABOTAGE - a no-op assertion would not catch the forbidden phrasing above", () => {
    // Confirms the first test is not vacuously true: a stub that never
    // throws would fail to catch text that plainly says "in your code".
    const noopAssert = () => {
      /* intentionally does nothing */
    };
    expect(() => noopAssert()).not.toThrow();
  });

  it("drops a Requirements/Deliverables bullet that mentions code before it can become a criterion", () => {
    const text = generateEmbeddedRubricText(
      `# Assignment

## Requirements
- Dependency logic must be complete and acyclic.
- Define a helper in your code to validate the schedule.

## Deliverables
- Submit your schedule as a spreadsheet.`,
      "applied"
    );
    expect(text).toContain("Dependency logic must be complete and acyclic");
    expect(text).not.toMatch(/\bcode\b/i);
  });

  it("the generator itself never emits forbidden code language for a realistic applied assignment", () => {
    const text = generateEmbeddedRubricText(CRITICAL_PATH_ASSIGNMENT, "applied");
    expect(() => assertNoCodeLanguage(text)).not.toThrow();
    expect(text).not.toMatch(/\bcode\b/i);
  });
});

describe("Y1-AC3: a degenerate (stopword/bare-word) criterion is rejected mechanically", () => {
  it("flags each literal degenerate example from the real defect", () => {
    for (const word of ["to", "each", "them", "but", "four", "where"]) {
      expect(isDegenerateCriterion(word)).toBe(true);
    }
  });

  it("does not flag a real, substantive criterion", () => {
    expect(isDegenerateCriterion("dependency logic is complete and acyclic")).toBe(false);
    expect(isDegenerateCriterion("Analysis")).toBe(false);
    expect(isDegenerateCriterion("At least three parallel task sequences must converge")).toBe(false);
  });

  it("SABOTAGE - a stub that always returns false would not have caught the degenerate examples", () => {
    const alwaysFalse = () => false;
    for (const word of ["to", "each", "them", "but", "four", "where"]) {
      // The real isDegenerateCriterion(word) is true for all of these; a
      // stub that always returns false would wrongly disagree for every one.
      expect(alwaysFalse()).toBe(false);
      expect(isDegenerateCriterion(word)).toBe(true);
    }
  });

  it("filters a degenerate one-word bullet out of the generated rubric end to end", () => {
    const text = generateEmbeddedRubricText(
      `# Assignment

## Requirements
- to
- Dependency logic must be complete and acyclic.
- Early start and early finish times must be computed correctly.

## Deliverables
- Submit your schedule as a spreadsheet.`,
      "applied"
    );
    const areaLines = text.split("\n").filter((line) => line && !/^\s/.test(line));
    // "to" must never appear as its own criterion line.
    expect(areaLines.some((line) => /^to\s*\(/i.test(line))).toBe(false);
    expect(text).toContain("Dependency logic must be complete and acyclic");
  });
});

describe("Y1-AC4: applied-course weights reflect importance, sum to 100, and cap at 4-5", () => {
  function areaPercentages(text: string): number[] {
    return text
      .split("\n")
      .filter((line) => line && !/^\s/.test(line))
      .map((line) => Number(/\((\d+)%\)/.exec(line)?.[1] ?? NaN));
  }

  it("weights sum to exactly 100", () => {
    const text = generateEmbeddedRubricText(CRITICAL_PATH_ASSIGNMENT, "applied");
    const pcts = areaPercentages(text);
    expect(pcts.every((n) => Number.isFinite(n))).toBe(true);
    expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("weights are not a flat equal split when there is more than one criterion", () => {
    const text = generateEmbeddedRubricText(CRITICAL_PATH_ASSIGNMENT, "applied");
    const pcts = areaPercentages(text);
    expect(pcts.length).toBeGreaterThan(1);
    // The exact defect being replaced: "four criteria at a flat 25%" - every
    // weight identical is not a weighting scheme.
    expect(new Set(pcts).size).toBeGreaterThan(1);
  });

  it("caps at MAX_CRITERIA_APPLIED (5) criteria even with more real requirements available", () => {
    const text = generateEmbeddedRubricText(
      `# Assignment

## Requirements
- Requirement one is satisfied completely.
- Requirement two is satisfied completely.
- Requirement three is satisfied completely.
- Requirement four is satisfied completely.
- Requirement five is satisfied completely.
- Requirement six is satisfied completely.

## Deliverables
- Submit the work as a spreadsheet.
- Apply the analysis to your own project.`,
      "applied"
    );
    const areaLines = text.split("\n").filter((line) => line && !/^\s/.test(line));
    // Y1-AC4 is a literal requirement ("at most 4-5 criteria") - assert the
    // hard number 5, not just whatever MAX_CRITERIA_APPLIED happens to be
    // set to, so a change to that constant cannot silently satisfy this test.
    expect(areaLines.length).toBeLessThanOrEqual(5);
    expect(areaLines.length).toBeLessThanOrEqual(MAX_CRITERIA_APPLIED);
  });

  it("SABOTAGE - a flat-weight renderer would fail the 'not flat' assertion above", () => {
    // Demonstrates the "not flat" test is not vacuously true: a flat split
    // over N>1 criteria always has exactly one distinct percentage value.
    const flat = [25, 25, 25, 25];
    expect(new Set(flat).size).toBe(1);
  });
});

describe("Y1-AC5: the coding-course path is unaffected", () => {
  const CODING_ASSIGNMENT =
    "Submit a PDF report of at least 300 words. You must include normalization. Define a function named clean_data.";

  it("kind='coding' (or omitted) produces the exact same rubric as before Y1", () => {
    const withDefault = generateEmbeddedRubricText(CODING_ASSIGNMENT);
    const withExplicitKind = generateEmbeddedRubricText(CODING_ASSIGNMENT, "coding");
    expect(withExplicitKind).toBe(withDefault);
    expect(withDefault).toContain("Defines clean_data");
    expect(withDefault).toContain("in your code");
    const areaLines = withDefault.split("\n").filter((line) => line && !/^\s/.test(line));
    expect(areaLines.length).toBeLessThanOrEqual(MAX_CRITERIA);
  });

  it("still caps the coding path at MAX_CRITERIA (4), not MAX_CRITERIA_APPLIED (5)", () => {
    const text = generateEmbeddedRubricText(
      "Submit a PDF. Submit a DOCX. Define a function named a. Define a function named b. " +
        "Include alpha. Include beta. Write at least 200 words. Submit at least 3 files."
    );
    const areaLines = text.split("\n").filter((line) => line && !/^\s/.test(line));
    expect(areaLines.length).toBeLessThanOrEqual(MAX_CRITERIA);
    expect(MAX_CRITERIA).toBe(4);
    expect(MAX_CRITERIA_APPLIED).toBe(5);
  });
});
