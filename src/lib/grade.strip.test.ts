import { describe, it, expect } from "vitest";
import {
  stripGradeResultForDraft,
  stripGradingRunForDraft,
  stripGradingRunEntriesForDraft,
} from "./workflows/grading-review-rows";
import type { GradeResult, GradingRun, GradingRunEntry } from "./grade";

function makeResult(overrides: Partial<GradeResult> = {}): GradeResult {
  return {
    student: "Jane Doe",
    overallComment: "Nice work.",
    rubricAreas: [{ area: "Clarity", score: "8/10", comment: "" }],
    totalScore: "8/10",
    feedback: "Total Score: 8/10\nOverall: Nice work.",
    mergedFileCount: 1,
    submittedFiles: [
      {
        name: "essay.docx",
        extension: "docx",
        previewContent: "a".repeat(20000),
        previewTruncated: true,
        rawBase64: "QUJDREVGRw==".repeat(1000),
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ],
    userId: 42,
    codeExecution: {
      language: "python",
      files: ["main.py"],
      ran: true,
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    },
    ...overrides,
  };
}

describe("stripGradeResultForDraft", () => {
  it("drops every submitted file (and therefore rawBase64/previewContent) entirely", () => {
    const result = makeResult();
    const stripped = stripGradeResultForDraft(result);
    expect(stripped.submittedFiles).toEqual([]);
  });

  it("never leaves rawBase64 reachable anywhere in the stripped object", () => {
    const result = makeResult();
    const stripped = stripGradeResultForDraft(result);
    expect(JSON.stringify(stripped)).not.toContain("QUJDREVGRw");
  });

  it("drops the display-only codeExecution field", () => {
    const result = makeResult();
    const stripped = stripGradeResultForDraft(result);
    expect(stripped.codeExecution).toBeUndefined();
  });

  it("keeps every grade-relevant field intact", () => {
    const result = makeResult();
    const stripped = stripGradeResultForDraft(result);
    expect(stripped.student).toBe("Jane Doe");
    expect(stripped.overallComment).toBe("Nice work.");
    expect(stripped.rubricAreas).toEqual([{ area: "Clarity", score: "8/10", comment: "" }]);
    expect(stripped.totalScore).toBe("8/10");
    expect(stripped.feedback).toBe("Total Score: 8/10\nOverall: Nice work.");
    expect(stripped.mergedFileCount).toBe(1);
    expect(stripped.userId).toBe(42);
  });

  it("handles a result with no submitted files or userId", () => {
    const result = makeResult({ submittedFiles: [], userId: undefined, codeExecution: undefined });
    const stripped = stripGradeResultForDraft(result);
    expect(stripped.submittedFiles).toEqual([]);
    expect(stripped.userId).toBeUndefined();
  });
});

describe("stripGradingRunForDraft / stripGradingRunEntriesForDraft", () => {
  it("strips every result in a run", () => {
    const run: GradingRun = {
      results: [makeResult({ student: "A" }), makeResult({ student: "B" })],
      rubricAreaNames: ["Clarity"],
      fullCreditChecklist: [],
      speedGraderUrl: "https://canvas.example.com/courses/1/gradebook/speed_grader?assignment_id=2",
    };
    const stripped = stripGradingRunForDraft(run);
    expect(stripped.results.every((r) => r.submittedFiles.length === 0)).toBe(true);
    expect(stripped.speedGraderUrl).toBe(run.speedGraderUrl);
    expect(stripped.results.map((r) => r.student)).toEqual(["A", "B"]);
  });

  it("strips every entry's run across a full runs array, including offline entries", () => {
    const entries: GradingRunEntry[] = [
      {
        courseName: "Course A",
        assignmentName: "Essay 1",
        canvasUrl: "https://canvas.example.com/courses/1/assignments/2",
        run: {
          results: [makeResult()],
          rubricAreaNames: [],
          fullCreditChecklist: [],
        },
      },
      {
        courseName: "Course B (offline)",
        assignmentName: "Offline submission",
        canvasUrl: "",
        run: { results: [makeResult()], rubricAreaNames: [], fullCreditChecklist: [] },
        offline: true,
      },
    ];

    const stripped = stripGradingRunEntriesForDraft(entries);
    expect(stripped).toHaveLength(2);
    for (const entry of stripped) {
      for (const result of entry.run.results) {
        expect(result.submittedFiles).toEqual([]);
        expect(result.codeExecution).toBeUndefined();
      }
    }
    // Non-run fields (offline flag, course/assignment names) are untouched.
    expect(stripped[1].offline).toBe(true);
    expect(stripped[0].courseName).toBe("Course A");
  });
});
