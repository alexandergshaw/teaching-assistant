import { describe, expect, it } from "vitest";
import { repoGradeCopyAllText, resultCopyNotice, withCopyNotice, scoredCopyNotice } from "./repoGradeCopyAll";

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

import type { RepoGradeSavedAttempt } from "./repoGradesDashboardModel";

describe("copying qualified results", () => {
  it("keeps feedback and caveats together without creating feedback from a warning", () => {
    expect(withCopyNotice("Useful feedback", "Provisional result")).toBe("Useful feedback\n\nProvisional result");
    expect(withCopyNotice("", "Provisional result")).toBe("");
    expect(withCopyNotice("Useful feedback")).toBe("Useful feedback");
  });
  it("preserves each applicable evidence limitation", () => {
    const attempt = { unexamined_artifacts: [{ path: "program.exe" }], module12_evidence: {}, general_execution_evidence: { policy: "execute" } } as unknown as RepoGradeSavedAttempt;
    const notice = resultCopyNotice(attempt)!;
    expect(notice).toContain("binary files were not examined");
    expect(notice).toContain("provisional");
    expect(notice).toContain("Wine observations");
    expect(resultCopyNotice({ general_execution_evidence: { policy: "source-only" } } as unknown as RepoGradeSavedAttempt)).toContain("No execution was attempted");
  });
});

it("identifies unscored reviews and earlier grades without calling a draft a score", () => {
  const draft = { status: "partial", module12_evidence: {} } as unknown as RepoGradeSavedAttempt;
  expect(resultCopyNotice(draft)).toContain("review is unscored");
  expect(resultCopyNotice(draft)).not.toContain("score is provisional");
  expect(scoredCopyNotice(draft, true)).toContain("earlier or unconfirmed");
  expect(scoredCopyNotice(draft, false)).not.toContain("earlier or unconfirmed");
});
