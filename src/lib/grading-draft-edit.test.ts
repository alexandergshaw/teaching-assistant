import { describe, it, expect } from "vitest";
import { replaceAreaComment } from "./grading-draft-edit";
import type { GradingDraftPayload } from "./grading-drafts";

describe("replaceAreaComment", () => {
  const createTestPayload = (): GradingDraftPayload => ({
    runs: [
      {
        courseName: "CS 101",
        assignmentName: "Assignment 1",
        canvasUrl: "https://canvas.example.com",
        run: {
          results: [
            {
              student: "Alice",
              overallComment: "Good work",
              rubricAreas: [
                { area: "Clarity", score: "9/10", comment: "Well written" },
                { area: "Correctness", score: "8/10", comment: "One edge case missed" },
              ],
              totalScore: "17/20",
              feedback: "Good overall",
              mergedFileCount: 1,
              submittedFiles: [],
            },
          ],
          rubricAreaNames: ["Clarity", "Correctness"],
          fullCreditChecklist: [],
        },
      },
    ],
  });

  it("replaces the targeted area comment", () => {
    const payload = createTestPayload();
    const updated = replaceAreaComment(payload, 0, 0, "Clarity", "Excellent clarity");

    expect(updated.runs[0].run.results[0].rubricAreas[0].comment).toBe("Excellent clarity");
  });

  it("preserves other area comments", () => {
    const payload = createTestPayload();
    const updated = replaceAreaComment(payload, 0, 0, "Clarity", "Excellent clarity");

    expect(updated.runs[0].run.results[0].rubricAreas[1].comment).toBe("One edge case missed");
  });

  it("does not mutate the input", () => {
    const payload = createTestPayload();
    const originalComment = payload.runs[0].run.results[0].rubricAreas[0].comment;

    replaceAreaComment(payload, 0, 0, "Clarity", "Changed");

    expect(payload.runs[0].run.results[0].rubricAreas[0].comment).toBe(originalComment);
  });

  it("returns a clone when target not found", () => {
    const payload = createTestPayload();
    const updated = replaceAreaComment(payload, 0, 0, "NonExistent", "New comment");

    expect(updated.runs[0].run.results[0].rubricAreas).toEqual(
      payload.runs[0].run.results[0].rubricAreas
    );
    expect(updated).not.toBe(payload);
  });

  it("handles multiple results in a run", () => {
    const payload: GradingDraftPayload = {
      runs: [
        {
          courseName: "CS 101",
          assignmentName: "Assignment 1",
          canvasUrl: "https://canvas.example.com",
          run: {
            results: [
              {
                student: "Alice",
                overallComment: "Good",
                rubricAreas: [{ area: "Design", score: "9/10", comment: "Clear design" }],
                totalScore: "9/10",
                feedback: "Good",
                mergedFileCount: 1,
                submittedFiles: [],
              },
              {
                student: "Bob",
                overallComment: "Needs work",
                rubricAreas: [{ area: "Design", score: "6/10", comment: "Confusing layout" }],
                totalScore: "6/10",
                feedback: "Needs work",
                mergedFileCount: 1,
                submittedFiles: [],
              },
            ],
            rubricAreaNames: ["Design"],
            fullCreditChecklist: [],
          },
        },
      ],
    };

    const updated = replaceAreaComment(payload, 0, 0, "Design", "Excellent design");

    expect(updated.runs[0].run.results[0].rubricAreas[0].comment).toBe("Excellent design");
    expect(updated.runs[0].run.results[1].rubricAreas[0].comment).toBe("Confusing layout");
  });

  it("can target any result by index", () => {
    const payload: GradingDraftPayload = {
      runs: [
        {
          courseName: "CS 101",
          assignmentName: "Assignment 1",
          canvasUrl: "https://canvas.example.com",
          run: {
            results: [
              {
                student: "Alice",
                overallComment: "",
                rubricAreas: [{ area: "Quality", score: "8/10", comment: "Original 1" }],
                totalScore: "8/10",
                feedback: "",
                mergedFileCount: 1,
                submittedFiles: [],
              },
              {
                student: "Bob",
                overallComment: "",
                rubricAreas: [{ area: "Quality", score: "7/10", comment: "Original 2" }],
                totalScore: "7/10",
                feedback: "",
                mergedFileCount: 1,
                submittedFiles: [],
              },
            ],
            rubricAreaNames: ["Quality"],
            fullCreditChecklist: [],
          },
        },
      ],
    };

    const updated = replaceAreaComment(payload, 0, 1, "Quality", "Updated 2");

    expect(updated.runs[0].run.results[0].rubricAreas[0].comment).toBe("Original 1");
    expect(updated.runs[0].run.results[1].rubricAreas[0].comment).toBe("Updated 2");
  });

  it("preserves everything else in the payload", () => {
    const payload = createTestPayload();
    const originalOverallComment = payload.runs[0].run.results[0].overallComment;
    const originalTotalScore = payload.runs[0].run.results[0].totalScore;

    const updated = replaceAreaComment(payload, 0, 0, "Clarity", "Changed");

    expect(updated.runs[0].run.results[0].overallComment).toBe(originalOverallComment);
    expect(updated.runs[0].run.results[0].totalScore).toBe(originalTotalScore);
  });

  it("allows empty comment string", () => {
    const payload = createTestPayload();
    const updated = replaceAreaComment(payload, 0, 0, "Clarity", "");

    expect(updated.runs[0].run.results[0].rubricAreas[0].comment).toBe("");
  });

  it("handles multiline comments", () => {
    const payload = createTestPayload();
    const multiline = "Line 1\nLine 2\nLine 3";
    const updated = replaceAreaComment(payload, 0, 0, "Clarity", multiline);

    expect(updated.runs[0].run.results[0].rubricAreas[0].comment).toBe(multiline);
  });

  it("isolates edits to target run in multi-run payload", () => {
    const payload: GradingDraftPayload = {
      runs: [
        {
          courseName: "CS 101",
          assignmentName: "Assignment 1",
          canvasUrl: "https://canvas.example.com",
          run: {
            results: [
              {
                student: "Alice",
                overallComment: "Good work",
                rubricAreas: [
                  { area: "Quality", score: "9/10", comment: "Original Alice comment" },
                ],
                totalScore: "9/10",
                feedback: "Good",
                mergedFileCount: 1,
                submittedFiles: [],
              },
            ],
            rubricAreaNames: ["Quality"],
            fullCreditChecklist: [],
          },
        },
        {
          courseName: "CS 101",
          assignmentName: "Assignment 1",
          canvasUrl: "https://canvas.example.com",
          run: {
            results: [
              {
                student: "Bob",
                overallComment: "Needs work",
                rubricAreas: [
                  { area: "Quality", score: "6/10", comment: "Original Bob comment" },
                ],
                totalScore: "6/10",
                feedback: "Needs work",
                mergedFileCount: 1,
                submittedFiles: [],
              },
            ],
            rubricAreaNames: ["Quality"],
            fullCreditChecklist: [],
          },
        },
      ],
    };

    const updated = replaceAreaComment(payload, 1, 0, "Quality", "Updated Bob comment");

    expect(updated.runs[0].run.results[0].rubricAreas[0].comment).toBe("Original Alice comment");
    expect(updated.runs[1].run.results[0].rubricAreas[0].comment).toBe("Updated Bob comment");
    expect(updated.runs[0]).toStrictEqual(payload.runs[0]);
  });

  it("targets and edits the Overall area comment", () => {
    const payload: GradingDraftPayload = {
      runs: [
        {
          courseName: "CS 101",
          assignmentName: "Assignment 1",
          canvasUrl: "https://canvas.example.com",
          run: {
            results: [
              {
                student: "Alice",
                overallComment: "No overall comment provided.",
                rubricAreas: [
                  { area: "Overall", score: "", comment: "No overall comment provided." },
                  { area: "Clarity", score: "9/10", comment: "Well written" },
                ],
                totalScore: "9/10",
                feedback: "Good",
                mergedFileCount: 1,
                submittedFiles: [],
              },
            ],
            rubricAreaNames: ["Overall", "Clarity"],
            fullCreditChecklist: [],
          },
        },
      ],
    };

    const updated = replaceAreaComment(payload, 0, 0, "Overall", "Excellent overall submission");

    expect(updated.runs[0].run.results[0].rubricAreas[0].area).toBe("Overall");
    expect(updated.runs[0].run.results[0].rubricAreas[0].comment).toBe("Excellent overall submission");
    expect(updated.runs[0].run.results[0].rubricAreas[1].comment).toBe("Well written");
  });
});
