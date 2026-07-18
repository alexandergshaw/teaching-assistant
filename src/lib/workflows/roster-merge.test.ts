import { describe, it, expect } from "vitest";
import { buildRosterUpdate, type RosterStudentRepo, type RosterSubmission } from "./roster-merge";

describe("buildRosterUpdate", () => {
  it("preserves existing repo on re-run", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-old" },
    ];
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice", username: "alice-new" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: existing });

    expect(result.studentRepos).toHaveLength(1);
    expect(result.studentRepos[0]).toEqual({
      student: "Alice",
      canvasUserId: "101",
      repo: "org/alice",
      username: "alice-new",
    });
    expect(result.linked).toBe(1);
    expect(result.conflicts).toEqual([]);
  });

  it("preserves non-submitter existing entries", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice" },
      { student: "Bob", canvasUserId: "102", repo: "org/bob" },
    ];
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice", username: "alice-gh" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: existing });

    expect(result.studentRepos).toHaveLength(2);
    const bob = result.studentRepos.find((r) => r.canvasUserId === "102");
    expect(bob).toEqual({ student: "Bob", canvasUserId: "102", repo: "org/bob" });
  });

  it("skips duplicate username and notes conflict", () => {
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice", username: "shared" },
      { canvasUserId: "102", student: "Bob", username: "shared" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: [] });

    expect(result.linked).toBe(0);
    expect(result.studentRepos).toHaveLength(0);
    expect(result.conflicts).toContainEqual('Duplicate GitHub username "shared" (Alice, Bob) - skipped');
  });

  it("disambiguates duplicate display names", () => {
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice", username: "alice1" },
      { canvasUserId: "102", student: "Alice", username: "alice2" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: [] });

    expect(result.linked).toBe(2);
    expect(result.studentRepos).toHaveLength(2);
    const students = result.studentRepos.map((r) => r.student).sort();
    expect(students).toEqual(["Alice (alice1)", "Alice (alice2)"]);
    expect(result.conflicts).toContainEqual('Duplicate name "Alice" - repos named with the username');
  });

  it("derives roster from merged studentRepos with usernames only", () => {
    const existing: RosterStudentRepo[] = [
      { student: "NoUsername", canvasUserId: "100", repo: "org/prev" },
    ];
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice", username: "alice-gh" },
      { canvasUserId: "102", student: "Bob", username: "bob-gh" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: existing });

    const rosterLines = result.roster.split("\n");
    expect(rosterLines).toHaveLength(2);
    expect(rosterLines).toContain("Alice | alice-gh");
    expect(rosterLines).toContain("Bob | bob-gh");
    expect(result.roster).not.toContain("NoUsername");
  });

  it("preserves all existing entries, even with no submissions", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice" },
      { student: "Bob", canvasUserId: "102", repo: "org/bob" },
    ];

    const result = buildRosterUpdate({ submissions: [], existingStudentRepos: existing });

    expect(result.studentRepos).toHaveLength(2);
    expect(result.linked).toBe(0);
    expect(result.roster).toBe("");
  });

  it("handles case-insensitive username deduplication", () => {
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice", username: "SharedName" },
      { canvasUserId: "102", student: "Bob", username: "sharedname" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: [] });

    expect(result.linked).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatch(/Duplicate GitHub username/);
  });

  it("handles case-insensitive name disambiguation", () => {
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice", username: "alice1" },
      { canvasUserId: "102", student: "alice", username: "alice2" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: [] });

    expect(result.linked).toBe(2);
    expect(result.studentRepos).toHaveLength(2);
    expect(result.conflicts).toHaveLength(1);
  });

  it("creates new entries for submissions with no existing repo", () => {
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "NewStudent", username: "newstudent-gh" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: [] });

    expect(result.studentRepos).toHaveLength(1);
    expect(result.studentRepos[0]).toEqual({
      student: "NewStudent",
      canvasUserId: "101",
      username: "newstudent-gh",
      repo: "",
    });
  });

  it("returns empty roster when no submissions have usernames", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice" },
    ];

    const result = buildRosterUpdate({ submissions: [], existingStudentRepos: existing });

    expect(result.roster).toBe("");
    expect(result.linked).toBe(0);
  });

  it("preserves existing entries that have no Canvas user id", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Manual", canvasUserId: null, repo: "org/manual", username: "manual-gh" },
    ];
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice", username: "alice-gh" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: existing });

    // The null-id entry survives unchanged alongside the newly linked Alice.
    expect(result.studentRepos).toContainEqual({
      student: "Manual",
      canvasUserId: null,
      repo: "org/manual",
      username: "manual-gh",
    });
    expect(result.studentRepos).toHaveLength(2);
    expect(result.roster.split("\n")).toContain("Manual | manual-gh");
  });
});
