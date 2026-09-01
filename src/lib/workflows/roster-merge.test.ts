import { describe, it, expect } from "vitest";
import { buildRosterUpdate, mergeCanvasRoster, mergeImportedRoster, type RosterStudentRepo, type RosterSubmission } from "./roster-merge";

describe("buildRosterUpdate", () => {
  it("preserves existing repo on re-run", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-old" },
    ];
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice", username: "alice-new" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: existing, existingRoster: "" });

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

    const result = buildRosterUpdate({ submissions, existingStudentRepos: existing, existingRoster: "" });

    expect(result.studentRepos).toHaveLength(2);
    const bob = result.studentRepos.find((r) => r.canvasUserId === "102");
    expect(bob).toEqual({ student: "Bob", canvasUserId: "102", repo: "org/bob" });
  });

  it("skips duplicate username and notes conflict", () => {
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice", username: "shared" },
      { canvasUserId: "102", student: "Bob", username: "shared" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: [], existingRoster: "" });

    expect(result.linked).toBe(0);
    expect(result.studentRepos).toHaveLength(0);
    expect(result.conflicts).toContainEqual('Duplicate GitHub username "shared" (Alice, Bob) - skipped');
  });

  it("disambiguates duplicate display names", () => {
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice", username: "alice1" },
      { canvasUserId: "102", student: "Alice", username: "alice2" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: [], existingRoster: "" });

    expect(result.linked).toBe(2);
    expect(result.studentRepos).toHaveLength(2);
    const students = result.studentRepos.map((r) => r.student).sort();
    expect(students).toEqual(["Alice (alice1)", "Alice (alice2)"]);
    expect(result.conflicts).toContainEqual('Duplicate name "Alice" - repos named with the username');
  });

  it("derives roster from merged studentRepos with usernames only, when there is no existing roster text", () => {
    const existing: RosterStudentRepo[] = [
      { student: "NoUsername", canvasUserId: "100", repo: "org/prev" },
    ];
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice", username: "alice-gh" },
      { canvasUserId: "102", student: "Bob", username: "bob-gh" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: existing, existingRoster: "" });

    const rosterLines = result.roster.split("\n");
    expect(rosterLines).toHaveLength(2);
    expect(rosterLines).toContain("Alice | alice-gh");
    expect(rosterLines).toContain("Bob | bob-gh");
    // NoUsername has no username in studentRepos AND no line in the (empty)
    // existing roster text, so it never had anything to preserve or derive.
    expect(result.roster).not.toContain("NoUsername");
  });

  it("preserves all existing entries, even with no submissions", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice" },
      { student: "Bob", canvasUserId: "102", repo: "org/bob" },
    ];

    const result = buildRosterUpdate({ submissions: [], existingStudentRepos: existing, existingRoster: "" });

    expect(result.studentRepos).toHaveLength(2);
    expect(result.linked).toBe(0);
    expect(result.roster).toBe("");
  });

  it("handles case-insensitive username deduplication", () => {
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice", username: "SharedName" },
      { canvasUserId: "102", student: "Bob", username: "sharedname" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: [], existingRoster: "" });

    expect(result.linked).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatch(/Duplicate GitHub username/);
  });

  it("handles case-insensitive name disambiguation", () => {
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice", username: "alice1" },
      { canvasUserId: "102", student: "alice", username: "alice2" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: [], existingRoster: "" });

    expect(result.linked).toBe(2);
    expect(result.studentRepos).toHaveLength(2);
    expect(result.conflicts).toHaveLength(1);
  });

  it("creates new entries for submissions with no existing repo", () => {
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "NewStudent", username: "newstudent-gh" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: [], existingRoster: "" });

    expect(result.studentRepos).toHaveLength(1);
    expect(result.studentRepos[0]).toEqual({
      student: "NewStudent",
      canvasUserId: "101",
      username: "newstudent-gh",
      repo: "",
    });
  });

  it("returns empty roster when no submissions have usernames and there is no existing roster text", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice" },
    ];

    const result = buildRosterUpdate({ submissions: [], existingStudentRepos: existing, existingRoster: "" });

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

    const result = buildRosterUpdate({ submissions, existingStudentRepos: existing, existingRoster: "" });

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

  // ---- the actual bug: an existing roster line must never be dropped -----

  it("THE BUG: preserves a roster line for a student with no handle who did not submit", () => {
    // "Charlie Brown" is hand-typed into the Courses tab roster, has never
    // submitted anything, and has no GitHub handle recorded anywhere - no
    // studentRepos entry for him exists at all. Before this fix,
    // buildRosterUpdate derived `roster` purely from mergedStudentRepos, so
    // this line was silently erased from course.roster the moment ANYONE
    // else's username was linked.
    const existingRoster = "Alice Smith | alice-old\nCharlie Brown";
    const existing: RosterStudentRepo[] = [
      { student: "Alice Smith", canvasUserId: "101", repo: "org/alice", username: "alice-old" },
    ];
    const submissions: RosterSubmission[] = [
      { canvasUserId: "102", student: "Diana Ross", username: "diana-gh" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: existing, existingRoster });

    const lines = result.roster.split("\n");
    expect(lines).toContain("Charlie Brown");
    expect(lines).toContain("Alice Smith | alice-old");
    expect(lines).toContain("Diana Ross | diana-gh");
  });

  it("fills a blank username on an existing roster line when a submission names that student", () => {
    const existingRoster = "Alice Smith\nBob Jones | bob-gh";
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice Smith", username: "alice-gh" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: [], existingRoster });

    const lines = result.roster.split("\n");
    expect(lines).toContain("Alice Smith | alice-gh");
    expect(lines).toContain("Bob Jones | bob-gh");
  });

  it("reports (not silently resolves) a disagreement between the existing roster line and a fresh submission, and keeps the fresh value", () => {
    const existingRoster = "Alice Smith | alice-old";
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice Smith", username: "alice-new" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: [], existingRoster });

    expect(result.roster.split("\n")).toContain("Alice Smith | alice-new");
    expect(result.conflicts).toContainEqual(
      'Alice Smith: roster had "alice-old", submission says "alice-new" - updated to "alice-new"'
    );
  });

  it("leaves an ambiguous existing roster name unchanged and reports it", () => {
    const existingRoster = "Alice Smith\nAlice Smith | alice-b";
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice Smith", username: "alice-a" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: [], existingRoster });

    // Both original lines survive untouched - no guess about which one to fill.
    expect(result.roster.split("\n")).toContain("Alice Smith");
    expect(result.roster.split("\n")).toContain("Alice Smith | alice-b");
    expect(result.conflicts.some((c) => /ambiguous match/.test(c))).toBe(true);
  });

  it("matches a 'Last, First' existing roster line against a 'First Last' submission", () => {
    const existingRoster = "Smith, Alice";
    const submissions: RosterSubmission[] = [
      { canvasUserId: "101", student: "Alice Smith", username: "alice-gh" },
    ];

    const result = buildRosterUpdate({ submissions, existingStudentRepos: [], existingRoster });

    // Filled the existing "Smith, Alice" line rather than adding a second,
    // duplicate line under the inverted spelling.
    expect(result.roster.split("\n")).toHaveLength(1);
    expect(result.roster).toContain("alice-gh");
  });
});

describe("mergeCanvasRoster", () => {
  it("appends new students from Canvas", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-gh" },
    ];
    const students = [
      { id: "101", name: "Alice" },
      { id: "102", name: "Bob" },
    ];

    const result = mergeCanvasRoster(existing, students, "");

    expect(result.added).toBe(1);
    expect(result.studentRepos).toHaveLength(2);
    const bob = result.studentRepos.find((r) => r.canvasUserId === "102");
    expect(bob).toEqual({
      student: "Bob",
      canvasUserId: "102",
      repo: "",
      username: null,
    });
  });

  it("preserves repo and username on match", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-gh" },
    ];
    const students = [{ id: "101", name: "Alice" }];

    const result = mergeCanvasRoster(existing, students, "");

    expect(result.added).toBe(0);
    expect(result.studentRepos).toHaveLength(1);
    expect(result.studentRepos[0]).toEqual({
      student: "Alice",
      canvasUserId: "101",
      repo: "org/alice",
      username: "alice-gh",
    });
  });

  it("updates a changed student name", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice Smith", canvasUserId: "101", repo: "org/alice", username: "alice-gh" },
    ];
    const students = [{ id: "101", name: "Alice Jane Smith" }];

    const result = mergeCanvasRoster(existing, students, "");

    expect(result.added).toBe(0);
    expect(result.studentRepos[0].student).toBe("Alice Jane Smith");
    expect(result.studentRepos[0].repo).toBe("org/alice");
    expect(result.studentRepos[0].username).toBe("alice-gh");
  });

  it("leaves manual entries (null canvasUserId) untouched", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Manual", canvasUserId: null, repo: "org/manual", username: "manual-gh" },
    ];
    const students = [{ id: "101", name: "Alice" }];

    const result = mergeCanvasRoster(existing, students, "");

    expect(result.studentRepos).toHaveLength(2);
    expect(result.studentRepos).toContainEqual({
      student: "Manual",
      canvasUserId: null,
      repo: "org/manual",
      username: "manual-gh",
    });
    expect(result.added).toBe(1);
  });

  it("derives roster text from entries with username only, when there is no existing roster text", () => {
    const existing: RosterStudentRepo[] = [
      { student: "NoUsername", canvasUserId: "100", repo: "org/prev", username: null },
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-gh" },
    ];
    const students = [
      { id: "100", name: "NoUsername" },
      { id: "101", name: "Alice" },
      { id: "102", name: "Bob" },
    ];

    const result = mergeCanvasRoster(existing, students, "");

    const rosterLines = result.roster.split("\n").filter((line) => line);
    expect(rosterLines).toHaveLength(1);
    expect(rosterLines).toContain("Alice | alice-gh");
    expect(result.roster).not.toContain("NoUsername");
    expect(result.roster).not.toContain("Bob");
  });

  it("returns correct added count", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-gh" },
      { student: "Bob", canvasUserId: "102", repo: "org/bob", username: "bob-gh" },
    ];
    const students = [
      { id: "101", name: "Alice" },
      { id: "102", name: "Bob" },
      { id: "103", name: "Charlie" },
      { id: "104", name: "Diana" },
    ];

    const result = mergeCanvasRoster(existing, students, "");

    expect(result.added).toBe(2);
  });

  it("preserves all existing entries regardless of Canvas roster", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-gh" },
      { student: "OldStudent", canvasUserId: "999", repo: "org/old", username: "old-gh" },
    ];
    const students = [{ id: "101", name: "Alice" }];

    const result = mergeCanvasRoster(existing, students, "");

    expect(result.studentRepos).toHaveLength(2);
    expect(result.studentRepos).toContainEqual({
      student: "OldStudent",
      canvasUserId: "999",
      repo: "org/old",
      username: "old-gh",
    });
  });

  it("handles empty existing roster", () => {
    const students = [
      { id: "101", name: "Alice" },
      { id: "102", name: "Bob" },
    ];

    const result = mergeCanvasRoster([], students, "");

    expect(result.added).toBe(2);
    expect(result.studentRepos).toHaveLength(2);
    expect(result.roster).toBe("");
  });

  it("handles empty Canvas roster", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-gh" },
      { student: "Bob", canvasUserId: "102", repo: "org/bob", username: "bob-gh" },
    ];

    const result = mergeCanvasRoster(existing, [], "");

    expect(result.added).toBe(0);
    expect(result.studentRepos).toHaveLength(2);
    const rosterLines = result.roster.split("\n");
    expect(rosterLines).toContain("Alice | alice-gh");
    expect(rosterLines).toContain("Bob | bob-gh");
  });

  it("does not duplicate entries when all Canvas students already exist", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-gh" },
      { student: "Bob", canvasUserId: "102", repo: "org/bob", username: "bob-gh" },
    ];
    const students = [
      { id: "101", name: "Alice" },
      { id: "102", name: "Bob" },
    ];

    const result = mergeCanvasRoster(existing, students, "");

    expect(result.added).toBe(0);
    expect(result.studentRepos).toHaveLength(2);
  });

  it("handles mixed manual and Canvas entries", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Manual", canvasUserId: null, repo: "org/manual", username: "manual-gh" },
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-gh" },
    ];
    const students = [
      { id: "101", name: "Alice" },
      { id: "102", name: "Bob" },
    ];

    const result = mergeCanvasRoster(existing, students, "");

    expect(result.added).toBe(1);
    expect(result.studentRepos).toHaveLength(3);
    const rosterLines = result.roster.split("\n").filter((line) => line);
    expect(rosterLines).toHaveLength(2);
    expect(rosterLines).toContain("Manual | manual-gh");
    expect(rosterLines).toContain("Alice | alice-gh");
  });

  it("THE BUG: preserves an existing roster line for a student with no handle and no Canvas match", () => {
    const existingRoster = "Alice | alice-gh\nCharlie Brown";
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-gh" },
    ];
    const students = [{ id: "101", name: "Alice" }];

    const result = mergeCanvasRoster(existing, students, existingRoster);

    expect(result.roster.split("\n")).toContain("Charlie Brown");
  });
});

describe("mergeImportedRoster", () => {
  it("matches by externalId (canvasUserId)", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-gh" },
    ];
    const students = [
      { name: "Alice", externalId: "101", email: "alice@example.com" },
    ];

    const result = mergeImportedRoster(existing, students, "");

    expect(result.matched).toBe(1);
    expect(result.added).toBe(0);
    expect(result.studentRepos).toHaveLength(1);
    expect(result.studentRepos[0]).toEqual({
      student: "Alice",
      canvasUserId: "101",
      repo: "org/alice",
      username: "alice-gh",
      email: "alice@example.com",
    });
  });

  it("matches by email (case-insensitive)", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: null, repo: "org/alice", username: "alice-gh" },
    ];
    const students = [
      { name: "Alice", email: "Alice@Example.COM" },
    ];

    const result = mergeImportedRoster(existing, students, "");

    expect(result.matched).toBe(1);
    expect(result.added).toBe(0);
    expect(result.studentRepos).toHaveLength(1);
    expect(result.studentRepos[0].email).toBe("Alice@Example.COM");
  });

  it("matches by exact name when externalId and email don't match", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice Smith", canvasUserId: null, repo: "org/alice", username: "alice-gh" },
    ];
    const students = [
      { name: "Alice Smith", email: "alice@example.com" },
    ];

    const result = mergeImportedRoster(existing, students, "");

    expect(result.matched).toBe(1);
    expect(result.added).toBe(0);
    expect(result.studentRepos[0].email).toBe("alice@example.com");
  });

  it("never overwrites existing email, username, or repo", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-old", email: "old@example.com" },
    ];
    const students = [
      { name: "Alice", externalId: "101", email: "new@example.com" },
    ];

    const result = mergeImportedRoster(existing, students, "");

    expect(result.studentRepos[0]).toEqual({
      student: "Alice",
      canvasUserId: "101",
      repo: "org/alice",
      username: "alice-old",
      email: "old@example.com",
    });
  });

  it("adds email to matched entries when absent", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-gh" },
    ];
    const students = [
      { name: "Alice", externalId: "101", email: "alice@example.com" },
    ];

    const result = mergeImportedRoster(existing, students, "");

    expect(result.studentRepos[0].email).toBe("alice@example.com");
  });

  it("creates new entry for unmatched student", () => {
    const existing: RosterStudentRepo[] = [];
    const students = [
      { name: "Bob", email: "bob@example.com", externalId: "102" },
    ];

    const result = mergeImportedRoster(existing, students, "");

    expect(result.added).toBe(1);
    expect(result.matched).toBe(0);
    expect(result.studentRepos).toHaveLength(1);
    expect(result.studentRepos[0]).toEqual({
      student: "Bob",
      canvasUserId: "102",
      repo: "",
      username: null,
      email: "bob@example.com",
    });
  });

  it("preserves existing entries that are not matched", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-gh" },
      { student: "Charlie", canvasUserId: "103", repo: "org/charlie", username: "charlie-gh" },
    ];
    const students = [
      { name: "Alice", externalId: "101" },
      { name: "Bob", externalId: "102" },
    ];

    const result = mergeImportedRoster(existing, students, "");

    expect(result.studentRepos).toHaveLength(3);
    expect(result.matched).toBe(1);
    expect(result.added).toBe(1);
    const charlie = result.studentRepos.find((r) => r.canvasUserId === "103");
    expect(charlie).toBeDefined();
  });

  it("derives roster from entries with username only, when there is no existing roster text", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-gh" },
      { student: "Bob", canvasUserId: "102", repo: "org/bob" },
    ];
    const students = [
      { name: "Alice", externalId: "101" },
      { name: "Bob", externalId: "102" },
    ];

    const result = mergeImportedRoster(existing, students, "");

    const rosterLines = result.roster.split("\n").filter((line) => line);
    expect(rosterLines).toHaveLength(1);
    expect(rosterLines).toContain("Alice | alice-gh");
    expect(result.roster).not.toContain("Bob");
  });

  it("handles null-id existing entries (manual entries)", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Manual", canvasUserId: null, repo: "org/manual", username: "manual-gh" },
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-gh" },
    ];
    const students = [
      { name: "Alice", externalId: "101" },
    ];

    const result = mergeImportedRoster(existing, students, "");

    expect(result.studentRepos).toHaveLength(2);
    expect(result.studentRepos).toContainEqual({
      student: "Manual",
      canvasUserId: null,
      repo: "org/manual",
      username: "manual-gh",
    });
  });

  it("returns correct added and matched counts", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice" },
      { student: "Bob", canvasUserId: "102", repo: "org/bob" },
    ];
    const students = [
      { name: "Alice", externalId: "101" },
      { name: "Bob", externalId: "102" },
      { name: "Charlie", externalId: "103" },
    ];

    const result = mergeImportedRoster(existing, students, "");

    expect(result.matched).toBe(2);
    expect(result.added).toBe(1);
  });

  it("handles empty existing roster", () => {
    const students = [
      { name: "Alice", email: "alice@example.com", externalId: "101" },
      { name: "Bob", email: "bob@example.com" },
    ];

    const result = mergeImportedRoster([], students, "");

    expect(result.added).toBe(2);
    expect(result.matched).toBe(0);
    expect(result.studentRepos).toHaveLength(2);
  });

  it("handles empty imported roster", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-gh" },
    ];

    const result = mergeImportedRoster(existing, [], "");

    expect(result.added).toBe(0);
    expect(result.matched).toBe(0);
    expect(result.studentRepos).toHaveLength(1);
  });

  it("matches by email when externalId is not provided", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: null, repo: "org/alice", email: "alice@example.com" },
    ];
    const students = [
      { name: "Different Name", email: "alice@example.com" },
    ];

    const result = mergeImportedRoster(existing, students, "");

    expect(result.matched).toBe(1);
    expect(result.added).toBe(0);
  });

  it("priority: externalId takes precedence over email", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", email: "alice@example.com" },
      { student: "Bob", canvasUserId: null, repo: "org/bob", email: "bob@example.com" },
    ];
    const students = [
      { name: "Different Name", externalId: "101", email: "alice@example.com" },
    ];

    const result = mergeImportedRoster(existing, students, "");

    // Should match Alice by externalId, not Bob by email
    expect(result.matched).toBe(1);
    const matched = result.studentRepos.find((r) => r.canvasUserId === "101");
    expect(matched).toBeDefined();
  });

  it("never duplicates entries when multiple match criteria apply", () => {
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", email: "alice@example.com", username: "alice-gh" },
    ];
    const students = [
      { name: "Alice", externalId: "101", email: "alice@example.com" },
    ];

    const result = mergeImportedRoster(existing, students, "");

    expect(result.studentRepos).toHaveLength(1);
    expect(result.matched).toBe(1);
    expect(result.added).toBe(0);
  });

  it("unmatched student without email sets email to undefined", () => {
    const existing: RosterStudentRepo[] = [];
    const students = [
      { name: "Alice" },
    ];

    const result = mergeImportedRoster(existing, students, "");

    expect(result.added).toBe(1);
    expect(result.studentRepos[0]).toEqual({
      student: "Alice",
      canvasUserId: null,
      repo: "",
      username: null,
      email: undefined,
    });
  });

  it("THE BUG: preserves an existing roster line for a student with no handle and no import match", () => {
    const existingRoster = "Alice | alice-gh\nCharlie Brown";
    const existing: RosterStudentRepo[] = [
      { student: "Alice", canvasUserId: "101", repo: "org/alice", username: "alice-gh" },
    ];
    const students = [{ name: "Alice", externalId: "101" }];

    const result = mergeImportedRoster(existing, students, existingRoster);

    expect(result.roster.split("\n")).toContain("Charlie Brown");
  });
});
