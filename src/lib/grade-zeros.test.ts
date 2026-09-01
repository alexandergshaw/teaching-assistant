import { describe, it, expect } from "vitest";
import { buildZeroGradingEntry, isZeroableAssignment } from "./grade-zeros";
import { RESUBMIT_NOTICE } from "./grade";

// Phrases that would imply the student did something wrong. Deliberately
// multi-word/targeted (not a bare "fail") since the comment's own innocent
// framing legitimately uses words like "failed upload" - pins the FACT (no
// accusatory language directed AT the student) rather than the exact wording
// of the comment, so a future copy edit does not have to keep matching one
// literal string.
const ACCUSATORY_TERMS = [
  "you failed to",
  "your failure",
  "failed to submit",
  "failed to complete",
  "failed to turn in",
  "cheat",
  "plagiar",
  "lazy",
  "irresponsib",
  "your fault",
  "you did not do",
  "you didn't do",
  "you neglected",
  "no excuse",
  "unacceptable",
];

function assertNotAccusatory(text: string) {
  const lower = text.toLowerCase();
  for (const term of ACCUSATORY_TERMS) {
    expect(lower).not.toContain(term);
  }
}

describe("buildZeroGradingEntry", () => {
  it("creates a grading entry with zero scores for all non-submitters", () => {
    const nonSubmitters = [
      { userId: 101, name: "Alice Smith" },
      { userId: 102, name: "Bob Jones" },
    ];

    const entry = buildZeroGradingEntry({
      courseName: "Test Course",
      assignmentName: "Assignment 1",
      canvasUrl: "https://canvas.example.com/courses/123/assignments/456",
      institution: "example",
      assignmentId: "456",
      pointsPossible: 100,
      nonSubmitters,
    });

    expect(entry.courseName).toBe("Test Course");
    expect(entry.assignmentName).toBe("Assignment 1");
    expect(entry.canvasUrl).toBe("https://canvas.example.com/courses/123/assignments/456");
    expect(entry.institution).toBe("example");
    expect(entry.assignmentId).toBe("456");
    expect(entry.pointsPossible).toBe(100);

    expect(entry.run.results).toHaveLength(2);
    expect(entry.run.rubricAreaNames).toEqual([]);
    expect(entry.run.fullCreditChecklist).toEqual([]);
    expect(entry.run.speedGraderUrl).toBeNull();

    // First result
    expect(entry.run.results[0].student).toBe("Alice Smith");
    expect(entry.run.results[0].userId).toBe(101);
    expect(entry.run.results[0].totalScore).toBe("0/100");
    expect(entry.run.results[0].rubricAreas).toEqual([]);
    expect(entry.run.results[0].submittedFiles).toEqual([]);
    expect(entry.run.results[0].mergedFileCount).toBe(0);

    // Second result
    expect(entry.run.results[1].student).toBe("Bob Jones");
    expect(entry.run.results[1].userId).toBe(102);
    expect(entry.run.results[1].totalScore).toBe("0/100");
  });

  // docs/no-submission-and-requirement-checking-acceptance-criteria.md G1a/
  // G1c: the no-submission fact is its own field, never encoded into the
  // score string - it must survive as `determination: "no-submission"` on
  // every produced result.
  it("marks every result with determination: \"no-submission\"", () => {
    const entry = buildZeroGradingEntry({
      courseName: "Course",
      assignmentName: "Assign",
      canvasUrl: "https://example.com",
      pointsPossible: 20,
      nonSubmitters: [
        { userId: 1, name: "A" },
        { userId: 2, name: "B" },
      ],
    });
    expect(entry.run.results[0].determination).toBe("no-submission");
    expect(entry.run.results[1].determination).toBe("no-submission");
  });

  // G2/G2a: all four feedback fields carry real, coherent text - not the
  // pre-fix "" in every box - and overallComment is exactly the composition
  // of the other three (never authored separately, so it cannot drift).
  it("populates all four feedback fields with real, coherent text derived via composeOverallComment", () => {
    const entry = buildZeroGradingEntry({
      courseName: "Course",
      assignmentName: "Assign",
      canvasUrl: "https://example.com",
      pointsPossible: 20,
      nonSubmitters: [{ userId: 1, name: "Student" }],
    });
    const result = entry.run.results[0];

    expect(result.strengths.length).toBeGreaterThan(0);
    expect(result.improvements.length).toBeGreaterThan(0);
    expect(result.resubmitNotice).toBe(RESUBMIT_NOTICE);
    expect(result.overallComment.length).toBeGreaterThan(0);
    expect(result.overallComment).toBe(
      [result.strengths, result.improvements, result.resubmitNotice].join(" ")
    );

    // States plainly that no submission was found (G2), without needing to
    // pin the exact sentence.
    expect(result.overallComment.toLowerCase()).toContain("no submission");
  });

  // G2: must not imply wrongdoing - a missing submission has innocent
  // causes, and the comment must read that way regardless of exact wording.
  it("does not use accusatory or wrongdoing-implying language in any feedback field", () => {
    const entry = buildZeroGradingEntry({
      courseName: "Course",
      assignmentName: "Assign",
      canvasUrl: "https://example.com",
      pointsPossible: 20,
      nonSubmitters: [{ userId: 1, name: "Student" }],
    });
    const result = entry.run.results[0];
    assertNotAccusatory(result.strengths);
    assertNotAccusatory(result.improvements);
    assertNotAccusatory(result.resubmitNotice);
    assertNotAccusatory(result.overallComment);
    assertNotAccusatory(result.feedback);
  });

  // G1b: pointsPossible ?? 0 used to produce "0/0", which every fraction
  // parser here (parseEarnedPossibleScore) rejects. A null/zero
  // pointsPossible must never reach that shape again.
  it("never emits an unparseable 0/0 total score, regardless of pointsPossible", () => {
    const nullPoints = buildZeroGradingEntry({
      courseName: "Course",
      assignmentName: "Assign",
      canvasUrl: "https://example.com",
      pointsPossible: null,
      nonSubmitters: [{ userId: 1, name: "Student" }],
    });
    expect(nullPoints.run.results[0].totalScore).not.toBe("0/0");
    expect(nullPoints.run.results[0].totalScore).toBe("0");
    expect(nullPoints.pointsPossible).toBeNull();

    const zeroPoints = buildZeroGradingEntry({
      courseName: "Course",
      assignmentName: "Assign",
      canvasUrl: "https://example.com",
      pointsPossible: 0,
      nonSubmitters: [{ userId: 1, name: "Student" }],
    });
    expect(zeroPoints.run.results[0].totalScore).not.toBe("0/0");
    expect(zeroPoints.run.results[0].totalScore).toBe("0");
  });

  it("uses 0/N when pointsPossible is a positive number", () => {
    const entry = buildZeroGradingEntry({
      courseName: "Course",
      assignmentName: "Assign",
      canvasUrl: "https://example.com",
      pointsPossible: 50,
      nonSubmitters: [{ userId: 1, name: "Student" }],
    });
    expect(entry.run.results[0].totalScore).toBe("0/50");
  });

  // G2b: no LLM call - the function is synchronous (not a Promise), so a
  // caller that forgot to await it would still see a fully-formed result
  // rather than a pending promise silently discarded.
  it("returns synchronously (no LLM/network call)", () => {
    const result = buildZeroGradingEntry({
      courseName: "Course",
      assignmentName: "Assign",
      canvasUrl: "https://example.com",
      pointsPossible: 20,
      nonSubmitters: [{ userId: 1, name: "Student" }],
    });
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof (result as unknown as Promise<unknown>).then).not.toBe("function");
  });

  it("passes through canvasUrl and pointsPossible to the entry", () => {
    const canvasUrl = "https://canvas.edu/courses/999/assignments/888";
    const entry = buildZeroGradingEntry({
      courseName: "Course",
      assignmentName: "Assign",
      canvasUrl,
      pointsPossible: 50,
      nonSubmitters: [],
    });

    expect(entry.canvasUrl).toBe(canvasUrl);
    expect(entry.pointsPossible).toBe(50);
  });
});

describe("isZeroableAssignment", () => {
  it("returns true for online_upload assignment that is graded and published", () => {
    expect(
      isZeroableAssignment({
        submissionTypes: ["online_upload"],
        gradingType: "points",
        published: true,
        omitFromFinalGrade: false,
      })
    ).toBe(true);
  });

  it("returns false for on_paper submission type", () => {
    expect(
      isZeroableAssignment({
        submissionTypes: ["on_paper"],
        gradingType: "points",
        published: true,
        omitFromFinalGrade: false,
      })
    ).toBe(false);
  });

  it("returns false for none submission type", () => {
    expect(
      isZeroableAssignment({
        submissionTypes: ["none"],
        gradingType: "points",
        published: true,
        omitFromFinalGrade: false,
      })
    ).toBe(false);
  });

  it("returns false for empty submission types", () => {
    expect(
      isZeroableAssignment({
        submissionTypes: [],
        gradingType: "points",
        published: true,
        omitFromFinalGrade: false,
      })
    ).toBe(false);
  });

  it("returns false for not_graded grading type", () => {
    expect(
      isZeroableAssignment({
        submissionTypes: ["online_upload"],
        gradingType: "not_graded",
        published: true,
        omitFromFinalGrade: false,
      })
    ).toBe(false);
  });

  it("returns false for unpublished assignment", () => {
    expect(
      isZeroableAssignment({
        submissionTypes: ["online_upload"],
        gradingType: "points",
        published: false,
        omitFromFinalGrade: false,
      })
    ).toBe(false);
  });

  it("returns false for assignment omitted from final grade", () => {
    expect(
      isZeroableAssignment({
        submissionTypes: ["online_upload"],
        gradingType: "points",
        published: true,
        omitFromFinalGrade: true,
      })
    ).toBe(false);
  });
});
