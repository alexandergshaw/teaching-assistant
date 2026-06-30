import { describe, it, expect } from "vitest";
import type { StudentSubmissionEntry } from "@/lib/grade";
import { buildEmbeddedRubric, gradeEntriesEmbedded } from "./index";

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
  });

  it("awards partial totals and names the missing criteria", () => {
    const run = gradeEntriesEmbedded([entry("Bo", "import pandas only", [])], rubric);
    const result = run.results[0];
    expect(result.totalScore).toBe("10/30");
    expect(result.overallComment).toContain("1 of 3 requirements met");
    expect(result.overallComment).toContain("Defines clean");
    expect(result.overallComment).toContain("Submitted .py");
  });

  it("exposes the rubric area names and a deterministic full-credit checklist", () => {
    const run = gradeEntriesEmbedded([entry("Cy", "nothing", [])], rubric);
    expect(run.rubricAreaNames).toEqual(["Uses pandas", "Defines clean", "Submitted .py"]);
    expect(run.fullCreditChecklist.length).toBe(3);
  });

  it("re-bases the total onto a Canvas points_possible when provided", () => {
    const run = gradeEntriesEmbedded(
      [entry("Di", "import pandas\ndef clean(df): pass", ["py"])],
      rubric,
      20 // assignment is worth 20, rubric sums to 30
    );
    expect(run.results[0].totalScore).toBe("20/20");
  });
});
