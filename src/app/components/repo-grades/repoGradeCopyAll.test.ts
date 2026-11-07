import { describe, expect, it } from "vitest";
import { repoGradeCopyAllText } from "./repoGradeCopyAll";

const empty = { overall: "", strengths: "", improvements: "", resubmitNotice: "" };

describe("repo grade feedback copying", () => {
  it("copies all rubric comments, preserving duplicate criterion labels", () => {
    expect(repoGradeCopyAllText(empty, [
      { area: "Tests", score: "1/2", comment: "Add boundary tests" },
      { area: "Tests", score: "2/2", comment: "Good coverage" },
      { area: "Style", score: "3/3", comment: "" },
    ])).toBe("Tests:\nAdd boundary tests\n\nTests:\nGood coverage");
  });

  it("includes overall feedback and criteria together", () => {
    const result = repoGradeCopyAllText({ ...empty, overall: "Well done" }, [
      { area: "Design", score: "4/5", comment: "Explain the interface" },
    ]);
    expect(result).toContain("Well done");
    expect(result).toContain("Design:\nExplain the interface");
  });

  it("does not produce a copy action for absent feedback", () => {
    expect(repoGradeCopyAllText(empty, [{ area: "Design", score: "4/5" }])).toBe("");
  });
  it("includes distinct overall feedback with sections, without repeating a composed overall", () => {
    const input = { ...empty, overall: "Summary", strengths: "Good", improvements: "Improve" };
    expect(repoGradeCopyAllText(input, [])).toBe("Summary\n\nGood\n\nImprove");
    expect(repoGradeCopyAllText({ ...input, overall: "Good Improve" }, [])).toBe("Good\n\nImprove");
  });
});
