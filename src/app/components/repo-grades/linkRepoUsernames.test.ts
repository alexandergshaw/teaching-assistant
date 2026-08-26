import { describe, expect, it } from "vitest";
import {
  linkUsernamesLogDetail,
  linkUsernamesSummaryLine,
  partitionGithubUsernameSubmissions,
  type GithubUsernameSubmission,
  type LinkUsernamesOutcome,
} from "./linkRepoUsernames";

function submission(overrides: Partial<GithubUsernameSubmission>): GithubUsernameSubmission {
  return { userId: 1, name: "Student", submittedText: "octocat", ...overrides };
}

describe("partitionGithubUsernameSubmissions", () => {
  it("accepts a clean handle", () => {
    const result = partitionGithubUsernameSubmissions([
      submission({ userId: 1, name: "Ada Lovelace", submittedText: "octocat" }),
    ]);
    expect(result.ok).toEqual([{ student: "Ada Lovelace", canvasUserId: "1", username: "octocat" }]);
    expect(result.ambiguous).toEqual([]);
  });

  it("accepts an @handle form", () => {
    const result = partitionGithubUsernameSubmissions([
      submission({ userId: 2, name: "Grace Hopper", submittedText: "@octocat" }),
    ]);
    expect(result.ok).toEqual([{ student: "Grace Hopper", canvasUserId: "2", username: "octocat" }]);
    expect(result.ambiguous).toEqual([]);
  });

  it("accepts a full github.com URL", () => {
    const result = partitionGithubUsernameSubmissions([
      submission({ userId: 3, name: "Alan Turing", submittedText: "https://github.com/octocat" }),
    ]);
    expect(result.ok).toEqual([{ student: "Alan Turing", canvasUserId: "3", username: "octocat" }]);
    expect(result.ambiguous).toEqual([]);
  });

  it("treats a sentence with spaces as ambiguous, not ok", () => {
    const result = partitionGithubUsernameSubmissions([
      submission({ userId: 4, name: "Margaret Hamilton", submittedText: "my username is octocat" }),
    ]);
    expect(result.ok).toEqual([]);
    expect(result.ambiguous).toEqual([`Margaret Hamilton: "my username is octocat"`]);
  });

  it("ignores an empty or whitespace-only submission entirely", () => {
    const result = partitionGithubUsernameSubmissions([
      submission({ userId: 5, name: "Empty One", submittedText: "" }),
      submission({ userId: 6, name: "Empty Two", submittedText: "   " }),
    ]);
    expect(result.ok).toEqual([]);
    expect(result.ambiguous).toEqual([]);
  });

  it("coerces userId to a string canvasUserId", () => {
    const result = partitionGithubUsernameSubmissions([
      submission({ userId: 42, name: "Numeric Id", submittedText: "octocat" }),
    ]);
    expect(result.ok[0].canvasUserId).toBe("42");
    expect(typeof result.ok[0].canvasUserId).toBe("string");
  });

  it("does not mutate the input array", () => {
    const submissions: GithubUsernameSubmission[] = [
      submission({ userId: 1, name: "Ada Lovelace", submittedText: "octocat" }),
      submission({ userId: 2, name: "Bad Text", submittedText: "not a handle at all" }),
    ];
    const frozenCopy = JSON.parse(JSON.stringify(submissions));
    partitionGithubUsernameSubmissions(submissions);
    expect(submissions).toEqual(frozenCopy);
  });

  it("keeps ok and ambiguous in submission order across a mixed batch", () => {
    const result = partitionGithubUsernameSubmissions([
      submission({ userId: 1, name: "First", submittedText: "octocat" }),
      submission({ userId: 2, name: "Second", submittedText: "not a handle at all" }),
      submission({ userId: 3, name: "Third", submittedText: "" }),
      submission({ userId: 4, name: "Fourth", submittedText: "@another-handle" }),
    ]);
    expect(result.ok.map((r) => r.student)).toEqual(["First", "Fourth"]);
    expect(result.ambiguous).toEqual([`Second: "not a handle at all"`]);
  });
});

function outcome(overrides: Partial<LinkUsernamesOutcome>): LinkUsernamesOutcome {
  return {
    assignmentId: "999",
    assignmentName: "Week 1 GitHub username",
    linked: 0,
    ambiguous: [],
    conflicts: [],
    changed: false,
    ...overrides,
  };
}

describe("linkUsernamesSummaryLine", () => {
  it("says the tile was not changed when zero were linked", () => {
    const line = linkUsernamesSummaryLine(outcome({ linked: 0, changed: false }));
    expect(line).toMatch(/not changed/i);
  });

  it("names the assignment and uses the word 'suggested' on a successful link", () => {
    const line = linkUsernamesSummaryLine(
      outcome({ linked: 12, changed: true, assignmentName: "Week 1 GitHub username" })
    );
    expect(line).toContain("12");
    expect(line).toContain("Week 1 GitHub username");
    expect(line).toMatch(/suggested/i);
  });

  it("appends the ambiguous count when non-zero", () => {
    const line = linkUsernamesSummaryLine(
      outcome({ linked: 3, changed: true, ambiguous: ["A: \"x\"", "B: \"y\""] })
    );
    expect(line).toContain("2");
    expect(line).toMatch(/ambiguous/i);
  });

  it("omits any mention of ambiguous when zero", () => {
    const line = linkUsernamesSummaryLine(outcome({ linked: 3, changed: true, ambiguous: [] }));
    expect(line).not.toMatch(/ambiguous/i);
  });

  it("appends the conflict count when non-zero", () => {
    const line = linkUsernamesSummaryLine(
      outcome({ linked: 3, changed: true, conflicts: ["Duplicate GitHub username \"x\""] })
    );
    expect(line).toContain("1");
    expect(line).toMatch(/conflict/i);
  });

  it("omits any mention of conflicts when zero", () => {
    const line = linkUsernamesSummaryLine(outcome({ linked: 3, changed: true, conflicts: [] }));
    expect(line).not.toMatch(/conflict/i);
  });
});

describe("linkUsernamesLogDetail", () => {
  it("names the assignment", () => {
    const detail = linkUsernamesLogDetail(
      outcome({ linked: 5, changed: true, assignmentName: "Week 1 GitHub username", assignmentId: "123" })
    );
    expect(detail).toContain("Week 1 GitHub username");
    expect(detail).toContain("123");
    expect(detail).toContain("5");
  });

  it("includes ambiguous lines when present", () => {
    const detail = linkUsernamesLogDetail(
      outcome({ linked: 1, changed: true, ambiguous: [`Jane: "not a handle"`] })
    );
    expect(detail).toContain(`Jane: "not a handle"`);
  });

  it("includes conflict lines when present", () => {
    const detail = linkUsernamesLogDetail(
      outcome({ linked: 1, changed: true, conflicts: [`Duplicate GitHub username "x" (A, B) - skipped`] })
    );
    expect(detail).toContain(`Duplicate GitHub username "x" (A, B) - skipped`);
  });

  it("omits ambiguous and conflict segments when both are empty", () => {
    const detail = linkUsernamesLogDetail(outcome({ linked: 1, changed: true, ambiguous: [], conflicts: [] }));
    expect(detail).not.toMatch(/ambiguous/i);
    expect(detail).not.toMatch(/conflict/i);
  });
});
