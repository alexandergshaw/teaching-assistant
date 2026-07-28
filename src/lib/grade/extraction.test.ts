import { describe, it, expect } from "vitest";
import { canvasWorkToEntry } from "./extraction";
import type { CanvasStudentWork } from "../canvas/discussions";

describe("canvasWorkToEntry - submission URL", () => {
  it("notes the submitted link in content for a URL-only submission (no empty content)", async () => {
    const work: CanvasStudentWork = {
      student: "Ada Lovelace",
      userId: 1,
      text: "",
      files: [],
      contributionCount: 1,
      submissionUrl: "https://github.com/student/hw1",
    };

    const entry = await canvasWorkToEntry(work);

    expect(entry.content).not.toBe("");
    expect(entry.content).toContain("https://github.com/student/hw1");
    expect(entry.submissionUrl).toBe("https://github.com/student/hw1");
    expect(entry.submittedFiles.some((f) => f.name === "Submission link")).toBe(true);
  });

  it("adds no link note and a null submissionUrl when nothing was submitted as a URL", async () => {
    const work: CanvasStudentWork = {
      student: "Bo Text",
      userId: 2,
      text: "My essay.",
      files: [],
      contributionCount: 1,
    };

    const entry = await canvasWorkToEntry(work);

    expect(entry.content).toBe("My essay.");
    expect(entry.submissionUrl).toBeNull();
    expect(entry.submittedFiles.some((f) => f.name === "Submission link")).toBe(false);
  });
});
