import { describe, it, expect } from "vitest";
import type { StudentSubmissionEntry } from "@/lib/grade";
import { buildEmbeddedRubric, gradeEntriesEmbedded, MAX_CRITERIA } from "./index";

function entry(student: string, content: string, extensions: string[] = [], userId?: number): StudentSubmissionEntry {
  return {
    student,
    content,
    mergedFileCount: Math.max(1, extensions.length),
    submittedFiles: extensions.map((extension) => ({
      name: `${student}.${extension}`,
      extension,
      previewContent: "",
      previewTruncated: false,
    })),
    userId,
  };
}

describe("buildEmbeddedRubric precedence", () => {
  it("uses a supplied rubric when present", () => {
    const rubric = buildEmbeddedRubric({
      rubricText: JSON.stringify([{ criterion: "Uses numpy", checkType: "keyword", target: "numpy", points: 10 }]),
      instructions: "Submit a PDF.",
    });
    expect(rubric.origin).toBe("checks");
    expect(rubric.checks.map((c) => c.target)).toEqual(["numpy"]);
  });

  it("generates from instructions only when no rubric is supplied", () => {
    const rubric = buildEmbeddedRubric({ instructions: "Submit a PDF." });
    expect(rubric.origin).toBe("instructions");
    expect(rubric.checks.some((c) => c.checkType === "file_type" && c.target === "pdf")).toBe(true);
  });

  it("returns no checks when neither a rubric nor instructions are given", () => {
    const rubric = buildEmbeddedRubric({});
    expect(rubric.checks).toHaveLength(0);
    expect(rubric.warnings.length).toBeGreaterThan(0);
  });
});

describe("buildEmbeddedRubric criteria cap", () => {
  it(`caps a generated rubric at ${MAX_CRITERIA} criteria with a warning`, () => {
    const rubric = buildEmbeddedRubric({
      instructions:
        "Submit a PDF and a .ipynb. Define a function named load_data and a function named plot_trends. " +
        "You must use pandas and numpy. Write at least 500 words. Include at least 2 figures.",
    });
    expect(rubric.checks.length).toBe(MAX_CRITERIA);
    expect(rubric.warnings.join(" ")).toContain(`at most ${MAX_CRITERIA} criteria`);
  });

  it("keeps the most concrete criteria (file types and code symbols) when capping", () => {
    const rubric = buildEmbeddedRubric({
      instructions:
        "Submit a PDF and a .ipynb. Define a function named load_data and a function named plot_trends. " +
        "You must use pandas and numpy. Write at least 500 words. Include at least 2 figures.",
    });
    const sig = rubric.checks.map((c) => `${c.checkType}:${c.target}`);
    expect(sig).toEqual(
      expect.arrayContaining(["file_type:pdf", "file_type:ipynb", "code_symbol:load_data", "code_symbol:plot_trends"])
    );
  });

  it("caps a supplied check rubric too", () => {
    const rubric = buildEmbeddedRubric({
      rubricText: JSON.stringify(
        Array.from({ length: 7 }, (_, i) => ({ criterion: `C${i}`, checkType: "keyword", target: `t${i}`, points: 10 }))
      ),
    });
    expect(rubric.checks.length).toBe(MAX_CRITERIA);
  });

  it("does not warn or truncate when there are 4 or fewer", () => {
    const rubric = buildEmbeddedRubric({ instructions: "Submit a PDF. Write at least 300 words." });
    expect(rubric.checks.length).toBeLessThanOrEqual(MAX_CRITERIA);
    expect(rubric.warnings.join(" ")).not.toContain("at most");
  });
});

describe("gradeEntriesEmbedded", () => {
  const rubric = buildEmbeddedRubric({
    rubricText: JSON.stringify([
      { criterion: "Uses pandas", checkType: "keyword", target: "pandas", points: 10 },
      { criterion: "Defines clean", checkType: "code_symbol", target: "clean", points: 10 },
      { criterion: "Submitted .py", checkType: "file_type", target: "py", points: 10 },
    ]),
  });

  it("scores each criterion and sums the total deterministically", () => {
    const run = gradeEntriesEmbedded(
      [entry("Ada", "import pandas\ndef clean(df): return df", ["py"], 42)],
      rubric
    );
    const result = run.results[0];
    expect(result.totalScore).toBe("30/30");
    expect(result.overallComment).toContain("all 3 requirements were met");
    expect(result.userId).toBe(42); // userId preserved for Canvas write-back
    expect(result.submittedFiles).toHaveLength(1); // files preserved for previews
    expect(result.overallComment).not.toContain("resubmit");
  });

  it("awards partial totals and names the missing criteria", () => {
    const run = gradeEntriesEmbedded([entry("Bo", "import pandas only", [])], rubric);
    const result = run.results[0];
    expect(result.totalScore).toBe("10/30");
    expect(result.overallComment).toContain("1 of 3 requirements met");
    expect(result.overallComment).toContain("Defines clean");
    expect(result.overallComment).toContain("Submitted .py");
    expect(result.overallComment).toContain("resubmit");
  });

  it("exposes the rubric area names and a deterministic full-credit checklist", () => {
    const run = gradeEntriesEmbedded([entry("Cy", "nothing", [])], rubric);
    expect(run.rubricAreaNames).toEqual(["Uses pandas", "Defines clean", "Submitted .py"]);
    expect(run.fullCreditChecklist.length).toBe(3);
  });

  it("keeps comments deterministic per student while phrasing can vary between students", () => {
    const students = [entry("Ada", "x", []), entry("Bo", "x", []), entry("Cy", "x", []), entry("Di", "x", [])];
    const first = gradeEntriesEmbedded(students, rubric);
    const second = gradeEntriesEmbedded(students, rubric);
    // Same input, same output — always.
    expect(first.results.map((r) => r.overallComment)).toEqual(second.results.map((r) => r.overallComment));
    // Every comment keeps the same factual core.
    for (const result of first.results) {
      expect(result.overallComment).toContain("0 of 3 requirements met");
    }
  });

  it("re-bases the total onto a Canvas points_possible when provided", () => {
    const run = gradeEntriesEmbedded(
      [entry("Di", "import pandas\ndef clean(df): pass", ["py"])],
      rubric,
      20 // assignment is worth 20, rubric sums to 30
    );
    expect(run.results[0].totalScore).toBe("20/20");
  });

  it("adds a scored Code runs criterion when the entry's code ran cleanly", () => {
    const base = entry("Eve", "import pandas\ndef clean(df): return df", ["py"], 7);
    const withRun = { ...base, codeRun: { language: "python", files: ["Eve.py"], ran: true, exitCode: 0, stdout: "ok", stderr: "" } };
    const run = gradeEntriesEmbedded([withRun], rubric);
    expect(run.rubricAreaNames).toContain("Code runs");
    const area = run.results[0].rubricAreas.find((a) => a.area === "Code runs");
    expect(area?.score).toBe("10/10");
    expect(run.results[0].totalScore).toBe("40/40"); // 30 rubric + 10 code
    expect(run.results[0].codeExecution?.ran).toBe(true);
  });

  it("scores Code runs as zero when the code did not run cleanly", () => {
    const base = entry("Fay", "import pandas\ndef clean(df): return df", ["py"]);
    const withRun = { ...base, codeRun: { language: "python", files: ["Fay.py"], ran: false, exitCode: 1, stdout: "", stderr: "boom" } };
    const run = gradeEntriesEmbedded([withRun], rubric);
    const area = run.results[0].rubricAreas.find((a) => a.area === "Code runs");
    expect(area?.score).toBe("0/10");
    expect(run.results[0].totalScore).toBe("30/40");
  });

  it("does not add a Code runs criterion when the runner errored", () => {
    const base = entry("Gus", "import pandas\ndef clean(df): return df", ["py"]);
    const withRun = { ...base, codeRun: { language: "python", files: ["Gus.py"], ran: false, exitCode: null, stdout: "", stderr: "", error: "network down" } };
    const run = gradeEntriesEmbedded([withRun], rubric);
    expect(run.rubricAreaNames).not.toContain("Code runs");
    expect(run.results[0].rubricAreas.find((a) => a.area === "Code runs")).toBeUndefined();
    expect(run.results[0].totalScore).toBe("30/30");
  });
});
