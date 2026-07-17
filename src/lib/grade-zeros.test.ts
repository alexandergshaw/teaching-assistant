import { describe, it, expect } from "vitest";
import { buildZeroGradingEntry, isZeroableAssignment } from "./grade-zeros";

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
    expect(entry.run.results[0].overallComment).toBe("");
    expect(entry.run.results[0].totalScore).toBe("0/100");
    expect(entry.run.results[0].rubricAreas).toEqual([]);
    expect(entry.run.results[0].submittedFiles).toEqual([]);
    expect(entry.run.results[0].feedback).toBe("");
    expect(entry.run.results[0].mergedFileCount).toBe(0);

    // Second result
    expect(entry.run.results[1].student).toBe("Bob Jones");
    expect(entry.run.results[1].userId).toBe(102);
    expect(entry.run.results[1].totalScore).toBe("0/100");
  });

  it("handles null pointsPossible by using 0", () => {
    const entry = buildZeroGradingEntry({
      courseName: "Course",
      assignmentName: "Assign",
      canvasUrl: "https://example.com",
      pointsPossible: null,
      nonSubmitters: [{ userId: 1, name: "Student" }],
    });

    expect(entry.run.results[0].totalScore).toBe("0/0");
    expect(entry.pointsPossible).toBeNull();
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
