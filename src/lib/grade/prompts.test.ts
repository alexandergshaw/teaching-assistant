import { describe, it, expect } from "vitest";

import { buildSubmittedFileNamesBlock, buildSystemPrompt } from "./prompts";
import type { SubmittedFileInfo } from "./types";

// A second live grading defect: the grader was told only the merged submission
// text, with real filenames buried inside "--- FILE: path ---" headers, so it
// missed a misnamed TripMath.java entirely and impressionistically flagged the
// C++ file as "a minor naming discrepancy". These tests pin the FACT that the
// prompt now carries an explicit, exact submitted-file list plus a rule that
// makes a stated filename requirement an explicit (not ambiguous) violation -
// never the exact wording of the surrounding prose.

function file(overrides: Partial<SubmittedFileInfo> = {}): SubmittedFileInfo {
  return {
    name: "calculator.py",
    extension: "py",
    previewContent: "print('hi')",
    previewTruncated: false,
    ...overrides,
  };
}

describe("buildSubmittedFileNamesBlock", () => {
  it("lists every real submitted file's exact base name", () => {
    const block = buildSubmittedFileNamesBlock([
      file({ name: "calculator.py" }),
      file({ name: "TripMath.java", extension: "java" }),
      file({ name: "trip_math.cpp", extension: "cpp" }),
    ]);

    expect(block).toContain("calculator.py");
    expect(block).toContain("TripMath.java");
    expect(block).toContain("trip_math.cpp");
  });

  it("reduces a folder-prefixed path (the GitHub-repo submission shape) to its base name", () => {
    const block = buildSubmittedFileNamesBlock([
      file({ name: "assignments/module_02/TripMath.java", extension: "java" }),
    ]);

    expect(block).toContain("TripMath.java");
    expect(block).not.toContain("assignments/module_02/TripMath.java");
  });

  it("does not alter the case of a submitted file name (Java's public-class-name rule needs exact case)", () => {
    const block = buildSubmittedFileNamesBlock([file({ name: "TripMath.java", extension: "java" })]);

    expect(block).toContain("TripMath.java");
    expect(block).not.toContain("tripmath.java");
    expect(block).not.toContain("TRIPMATH.JAVA");
  });

  it("filters out non-file pseudo-entries (Discussion post / Submission text / Submission link) that carry no extension", () => {
    const block = buildSubmittedFileNamesBlock([
      file({ name: "Discussion post", extension: "txt" }),
      file({ name: "Submission text", extension: "txt" }),
      file({ name: "Submission link", extension: "url" }),
    ]);

    expect(block).toBe("");
  });

  it("is inert (empty string) when there are no submitted files", () => {
    expect(buildSubmittedFileNamesBlock([])).toBe("");
  });

  it("deduplicates a repeated base name", () => {
    const block = buildSubmittedFileNamesBlock([
      file({ name: "calculator.py" }),
      file({ name: "sub/calculator.py" }),
    ]);

    const occurrences = block.split("calculator.py").length - 1;
    expect(occurrences).toBe(1);
  });
});

describe("buildSystemPrompt - stated filename requirements are an explicit violation", () => {
  it("includes a rule pointing the model at the SUBMITTED FILES list for checking required file names", () => {
    const prompt = buildSystemPrompt("Instructions.", "Rubric.");

    expect(prompt).toContain("SUBMITTED FILES");
    expect(prompt).toMatch(/required file name/i);
    expect(prompt).toMatch(/explicit rubric violation/i);
  });

  it("states the rule is inert when no file names are required, so it cannot be used to justify a phantom deduction", () => {
    const prompt = buildSystemPrompt("Instructions.", "Rubric.");

    expect(prompt).toMatch(/no required file names.*not apply/i);
  });

  it("does not remove the pre-existing generosity policy sentences (must stay a narrow carve-out, not a general tightening)", () => {
    const prompt = buildSystemPrompt("Instructions.", "Rubric.");

    // Pin the ordering/presence of the existing generosity rules that must
    // survive this change untouched - not their exact wording beyond the
    // handful of load-bearing phrases already relied on elsewhere.
    expect(prompt).toMatch(/generous/i);
    expect(prompt).toMatch(/do not deduct points for ambiguity/i);
    expect(prompt).toMatch(/2:1 positive-to-negative ratio/i);
  });
});

// A third live grading defect, from the same course: a README's own worked
// example (a different scenario, which the README itself says it is) got
// copied wholesale by 7 of 11 students in place of the assigned calculator,
// and one of them was scored 25/25 on "Functional Arithmetic Operations"
// with two of four required operations absent. The model read resemblance
// to instructions-printed code as correctness, and a genuinely-absent
// operation had no rule making it a violation at all. These tests pin the
// FACT that the prompt now (a) disclaims instructions-printed example code
// as a reference solution, (b) makes an absent required behavior an
// explicit violation - the behavioral parallel to entry 371's file-name
// clause, sitting in the same place among the other explicit-violation
// rules - and (c) requires the model to enumerate stated requirements and
// check the submission against each one before scoring. Never the exact
// prose beyond the handful of load-bearing phrases already relied on
// elsewhere in this file.

describe("buildSystemPrompt - example code in the instructions is not a reference solution", () => {
  it("states that example code, sample solutions, or worked examples in the instructions are not a reference solution", () => {
    const prompt = buildSystemPrompt("Instructions.", "Rubric.");

    expect(prompt).toMatch(/reference solution/i);
    expect(prompt).toMatch(/resemblance/i);
  });

  it("states that submitting the instructions' own example instead of the assigned task does not meet the requirements the example does not cover", () => {
    const prompt = buildSystemPrompt("Instructions.", "Rubric.");

    expect(prompt).toMatch(/different scenario or task/i);
  });
});

describe("buildSystemPrompt - a missing required behavior is an explicit violation", () => {
  it("states that a required behavior absent from the submission is an explicit rubric violation, not ambiguity", () => {
    const prompt = buildSystemPrompt("Instructions.", "Rubric.");

    expect(prompt).toMatch(/required functionality/i);
    expect(prompt).toMatch(/absent from the submission is an explicit rubric violation/i);
  });

  it("states the rule is inert when the instructions state no required functionality, mirroring the filename rule's carve-out", () => {
    const prompt = buildSystemPrompt("Instructions.", "Rubric.");

    expect(prompt).toMatch(/no required functionality.*not apply/i);
  });

  it("sits with the other explicit-violation rules: after the filename rule, before the overallComment summary rule", () => {
    const prompt = buildSystemPrompt("Instructions.", "Rubric.");

    const filenameRuleIndex = prompt.indexOf("required file names for the submission");
    const referenceSolutionRuleIndex = prompt.indexOf("not a reference solution");
    const behaviorRuleIndex = prompt.indexOf("required functionality the submission must implement");
    const overallCommentSummaryIndex = prompt.indexOf("In overallComment, summarize strengths");

    expect(filenameRuleIndex).toBeGreaterThan(-1);
    expect(referenceSolutionRuleIndex).toBeGreaterThan(filenameRuleIndex);
    expect(behaviorRuleIndex).toBeGreaterThan(referenceSolutionRuleIndex);
    expect(overallCommentSummaryIndex).toBeGreaterThan(behaviorRuleIndex);
  });
});

describe("buildSystemPrompt - enumerate stated requirements and cite evidence", () => {
  it("requires enumerating each rubric area's stated requirements and checking the submission against each one before scoring", () => {
    const prompt = buildSystemPrompt("Instructions.", "Rubric.");

    expect(prompt).toMatch(/enumerate/i);
    expect(prompt).toMatch(/state plainly that it is absent/i);
  });

  it("extends the existing overallComment evidence requirement rather than adding a new per-criterion field", () => {
    const prompt = buildSystemPrompt("Instructions.", "Rubric.");

    // The JSON contract still carries only "area" and "score" - no per-
    // criterion comment field was opened for this.
    expect(prompt).toMatch(/no per-criterion comment/i);
    expect(prompt).not.toContain('"comment"');
  });
});
