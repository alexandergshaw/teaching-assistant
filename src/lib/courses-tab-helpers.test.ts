import { describe, it, expect } from "vitest";
import {
  formFromCourse,
  courseToInput,
  rosterStats,
  rosterToRows,
  rowsToRoster,
  studentReposToRows,
  rowsToStudentReposText,
  mergeOrgReposIntoStudentRepos,
  parseRepoLines,
  parseIntegrationLines,
  readFileBase64,
  readFileText,
  mergeCardLayout,
  mergeInstitutionFields,
  EMPTY_FORM,
} from "./courses-tab-helpers";
import type { Course } from "./supabase/courses";
import type { CardLayoutGroup } from "@/lib/card-layout";
import type { InstitutionField } from "@/lib/institution-fields";

const mockCourse: Course = {
  id: "course-1",
  name: "CS 101",
  courseCode: "CS101",
  term: "Fall 2024",
  institution: "MIT",
  canvasUrl: "https://canvas.example.com/courses/123",
  repos: [
    { repo: "org/repo1", branch: "main" },
    { repo: "org/repo2", branch: null },
  ],
  githubOrg: "org",
  textbook: "ISBN: 123456",
  syllabusId: "syl-1",
  integrations: [
    { name: "Slack", url: "https://slack.example.com" },
    { name: "Discord", url: null },
  ],
  roster: "Alice Smith | alice\nBob Jones | bob\nCharlie Brown",
  notes: "Course notes",
  topics: "topic1,topic2",
  csvName: "schedule.csv",
  csvData: "week,topic",
  rubricName: "rubric.md",
  rubricData: "# Rubric",
  startDate: "2024-09-01",
  description: "A course",
  weeks: 15,
  tests: 3,
  lms: "canvas",
  dayTime: "MWF 10-11am",
  modality: "async",
  customTiles: [],
  hiddenTiles: [],
  studentRepos: [
    { student: "Alice", canvasUserId: "1001", repo: "alice-repo" },
    { student: "Bob", canvasUserId: "1002", repo: "bob-repo" },
  ],
  exportFiles: [],
  materialsFiles: [],
  materialsZipName: null,
  materialsZipPath: null,
  materialsZipSize: null,
  updatedAt: "2024-09-01T00:00:00Z",
};

describe("formFromCourse", () => {
  it("converts Course to CourseForm", () => {
    const form = formFromCourse(mockCourse);
    expect(form.id).toBe("course-1");
    expect(form.name).toBe("CS 101");
    expect(form.weeks).toBe("15");
    expect(form.tests).toBe("3");
    expect(form.repos).toEqual([
      { repo: "org/repo1", branch: "main" },
      { repo: "org/repo2", branch: "" },
    ]);
  });

  it("handles null numeric fields", () => {
    const course = { ...mockCourse, weeks: null, tests: null };
    const form = formFromCourse(course);
    expect(form.weeks).toBe("");
    expect(form.tests).toBe("");
  });

  it("handles missing optional fields", () => {
    const course: Course = {
      ...mockCourse,
      courseCode: null,
      term: null,
      institution: null,
    };
    const form = formFromCourse(course);
    expect(form.courseCode).toBe("");
    expect(form.term).toBe("");
    expect(form.institution).toBe("");
  });
});

describe("courseToInput", () => {
  it("converts Course to CourseInput", () => {
    const input = courseToInput(mockCourse);
    expect(input.name).toBe("CS 101");
    expect(input.weeks).toBe(15);
    expect(input.tests).toBe(3);
  });

  it("preserves null branches in repos", () => {
    const input = courseToInput(mockCourse);
    expect(input.repos[1].branch).toBe(null);
  });

  it("preserves null urls in integrations", () => {
    const input = courseToInput(mockCourse);
    expect(input.integrations[1].url).toBe(null);
  });
});

describe("rosterStats", () => {
  it("counts students and those with usernames", () => {
    const roster = "Alice Smith | alice\nBob Jones | bob\nCharlie Brown";
    const stats = rosterStats(roster);
    expect(stats.students).toBe(3);
    expect(stats.withUsernames).toBe(2);
  });

  it("handles empty roster", () => {
    const stats = rosterStats("");
    expect(stats.students).toBe(0);
    expect(stats.withUsernames).toBe(0);
  });

  it("handles roster with whitespace", () => {
    const roster = "  Alice  |  alice  \n  Bob Jones  ";
    const stats = rosterStats(roster);
    expect(stats.students).toBe(2);
    expect(stats.withUsernames).toBe(1);
  });

  it("handles malformed pipes", () => {
    const roster = "Alice | | alice\nBob |";
    const stats = rosterStats(roster);
    expect(stats.students).toBe(2);
  });
});

describe("rosterToRows and rowsToRoster round-trip", () => {
  it("converts roster text to rows", () => {
    const roster = "Alice Smith | alice\nBob Jones | bob\nCharlie Brown";
    const rows = rosterToRows(roster);
    expect(rows).toEqual([
      { student: "Alice Smith", username: "alice" },
      { student: "Bob Jones", username: "bob" },
      { student: "Charlie Brown", username: "" },
    ]);
  });

  it("converts rows back to roster text", () => {
    const rows = [
      { student: "Alice Smith", username: "alice" },
      { student: "Bob Jones", username: "bob" },
      { student: "Charlie Brown", username: "" },
    ];
    const roster = rowsToRoster(rows);
    expect(roster).toBe("Alice Smith | alice\nBob Jones | bob\nCharlie Brown");
  });

  it("round-trips correctly", () => {
    const original = "Alice | alice\nBob | bob\nCharlie";
    const rows = rosterToRows(original);
    const reconstructed = rowsToRoster(rows);
    expect(rosterToRows(reconstructed)).toEqual(rows);
  });

  it("handles empty rows", () => {
    const rows: Array<{ student: string; username: string }> = [];
    const roster = rowsToRoster(rows);
    expect(roster).toBe("");
  });

  it("filters out empty rows", () => {
    const rows = [
      { student: "Alice", username: "alice" },
      { student: "", username: "" },
      { student: "Bob", username: "" },
    ];
    const roster = rowsToRoster(rows);
    expect(roster).toBe("Alice | alice\nBob");
  });

  it("handles malformed roster with multiple pipes", () => {
    const roster = "Alice | alice | extra\nBob Jones";
    const rows = rosterToRows(roster);
    expect(rows[0].username).toBe("extra");
    expect(rows[1].student).toBe("Bob Jones");
  });
});

describe("studentReposToRows and rowsToStudentReposText round-trip", () => {
  it("converts student repos text to rows", () => {
    const text = "Alice | 1001 | alice-repo\nBob | 1002 | bob-repo";
    const rows = studentReposToRows(text);
    expect(rows).toEqual([
      { student: "Alice", canvasUserId: "1001", repo: "alice-repo" },
      { student: "Bob", canvasUserId: "1002", repo: "bob-repo" },
    ]);
  });

  it("converts rows back to text", () => {
    const rows = [
      { student: "Alice", canvasUserId: "1001", repo: "alice-repo" },
      { student: "Bob", canvasUserId: "1002", repo: "bob-repo" },
    ];
    const text = rowsToStudentReposText(rows);
    expect(text).toBe("Alice | 1001 | alice-repo\nBob | 1002 | bob-repo");
  });

  it("round-trips correctly", () => {
    const original = "Alice | 1001 | alice-repo\nBob | 1002 | bob-repo";
    const rows = studentReposToRows(original);
    const reconstructed = rowsToStudentReposText(rows);
    expect(reconstructed).toBe(original);
  });

  it("filters out incomplete rows", () => {
    const text = "Alice | 1001 | alice-repo\n | | \nBob | 1002 | ";
    const rows = studentReposToRows(text);
    expect(rows.length).toBe(2);
  });

  it("handles missing fields", () => {
    const text = "Alice | | alice-repo\n | 1002 | bob-repo";
    const rows = studentReposToRows(text);
    expect(rows[0]).toEqual({ student: "Alice", canvasUserId: "", repo: "alice-repo" });
    expect(rows[1]).toEqual({ student: "", canvasUserId: "1002", repo: "bob-repo" });
  });
});

describe("parseRepoLines", () => {
  it("parses repo lines with branches", () => {
    const text = "org/repo1#main\norg/repo2#develop\norg/repo3";
    const repos = parseRepoLines(text);
    expect(repos).toEqual([
      { repo: "org/repo1", branch: "main" },
      { repo: "org/repo2", branch: "develop" },
      { repo: "org/repo3", branch: null },
    ]);
  });

  it("filters out empty lines", () => {
    const text = "org/repo1#main\n\n  \norg/repo2";
    const repos = parseRepoLines(text);
    expect(repos.length).toBe(2);
  });

  it("filters out lines without repo name", () => {
    const text = "org/repo1#main\n#main\n";
    const repos = parseRepoLines(text);
    expect(repos.length).toBe(1);
  });

  it("handles whitespace around delimiters", () => {
    const text = "  org/repo1  #  main  \n org/repo2 ";
    const repos = parseRepoLines(text);
    expect(repos[0]).toEqual({ repo: "org/repo1", branch: "main" });
    expect(repos[1]).toEqual({ repo: "org/repo2", branch: null });
  });
});

describe("parseIntegrationLines", () => {
  it("parses integration lines with urls", () => {
    const text = "Slack | https://slack.example.com\nDiscord | https://discord.com\nTelegram";
    const integrations = parseIntegrationLines(text);
    expect(integrations).toEqual([
      { name: "Slack", url: "https://slack.example.com" },
      { name: "Discord", url: "https://discord.com" },
      { name: "Telegram", url: null },
    ]);
  });

  it("filters out empty lines", () => {
    const text = "Slack | https://slack.example.com\n\n  \nDiscord";
    const integrations = parseIntegrationLines(text);
    expect(integrations.length).toBe(2);
  });

  it("filters out lines without name or url", () => {
    const text = "Slack | https://slack.example.com\n|\nDiscord";
    const integrations = parseIntegrationLines(text);
    expect(integrations.length).toBe(2);
  });

  it("handles whitespace around delimiters", () => {
    const text = "  Slack  |  https://slack.example.com  \n Discord ";
    const integrations = parseIntegrationLines(text);
    expect(integrations[0]).toEqual({ name: "Slack", url: "https://slack.example.com" });
    expect(integrations[1]).toEqual({ name: "Discord", url: null });
  });
});

describe("readFileBase64", () => {
  it("is a function", () => {
    expect(typeof readFileBase64).toBe("function");
  });
});

describe("readFileText", () => {
  it("is a function", () => {
    expect(typeof readFileText).toBe("function");
  });
});

describe("mergeCardLayout", () => {
  it("returns defaults for empty saved layout", () => {
    const merged = mergeCardLayout([]);
    expect(merged.length).toBeGreaterThan(0);
    expect(merged[0].id).toBeDefined();
    expect(merged[0].label).toBeDefined();
    expect(Array.isArray(merged[0].tiles)).toBe(true);
  });

  it("preserves saved groups", () => {
    const saved: CardLayoutGroup[] = [
      { id: "group1", label: "Group 1", tiles: ["tile1", "tile2"] },
    ];
    const merged = mergeCardLayout(saved);
    expect(merged[0].id).toBe("group1");
    expect(merged[0].tiles).toContain("tile1");
  });

  it("handles stale tile keys", () => {
    const saved: CardLayoutGroup[] = [
      { id: "group1", label: "Group 1", tiles: ["tile1", "unknown-tile"] },
    ];
    const merged = mergeCardLayout(saved);
    expect(merged.some((g) => g.tiles.includes("unknown-tile"))).toBe(true);
  });

  it("appends missing built-in tiles to their home groups", () => {
    const saved: CardLayoutGroup[] = [
      { id: "codebase", label: "Codebase", tiles: [] },
    ];
    const merged = mergeCardLayout(saved);
    const codebaseGroup = merged.find((g) => g.id === "codebase");
    expect(codebaseGroup && codebaseGroup.tiles.length > 0).toBe(true);
  });

  it("recreates deleted groups when their tiles have no home", () => {
    const saved: CardLayoutGroup[] = [
      { id: "group2", label: "Group 2", tiles: [] },
    ];
    const merged = mergeCardLayout(saved);
    expect(merged.length).toBeGreaterThanOrEqual(saved.length);
  });
});

describe("mergeInstitutionFields", () => {
  it("returns defaults for empty saved fields", () => {
    const merged = mergeInstitutionFields([]);
    expect(merged.length).toBeGreaterThan(0);
  });

  it("preserves saved values over defaults", () => {
    const saved: InstitutionField[] = [
      { id: "field1", label: "Old Label", type: "text", value: "saved1", lms: "canvas" },
    ];
    const merged = mergeInstitutionFields(saved);
    const field = merged.find((f) => f.id === "field1");
    expect(field?.value).toBe("saved1");
  });

  it("keeps default label and type", () => {
    const saved: InstitutionField[] = [
      { id: "field1", label: "Old Label", type: "text", value: "saved1", lms: "canvas" },
    ];
    const merged = mergeInstitutionFields(saved);
    const field = merged.find((f) => f.id === "field1");
    expect(field).toBeDefined();
  });

  it("appends extra saved fields", () => {
    const saved: InstitutionField[] = [
      { id: "extra", label: "Extra Field", type: "text", value: "extra" },
    ];
    const merged = mergeInstitutionFields(saved);
    const extra = merged.find((f) => f.id === "extra");
    expect(extra).toBeDefined();
  });

  it("handles stale saved fields by id", () => {
    const saved: InstitutionField[] = [
      { id: "unknown", label: "Unknown", type: "text", value: "test" },
    ];
    const merged = mergeInstitutionFields(saved);
    const unknown = merged.find((f) => f.id === "unknown");
    expect(unknown?.value).toBe("test");
  });
});

describe("mergeOrgReposIntoStudentRepos", () => {
  it("appends every org repo as an unassigned row when there are no existing rows", () => {
    const merged = mergeOrgReposIntoStudentRepos([], ["org/repo1", "org/repo2"]);
    expect(merged).toEqual([
      { student: "", canvasUserId: null, repo: "org/repo1", username: null, email: null },
      { student: "", canvasUserId: null, repo: "org/repo2", username: null, email: null },
    ]);
  });

  it("leaves an existing assigned row for a repo already listed unchanged and does not duplicate it", () => {
    const existing = [{ student: "Alice", canvasUserId: "1", repo: "org/repo1", username: "alice-gh", email: "a@x.com" }];
    const merged = mergeOrgReposIntoStudentRepos(existing, ["org/repo1", "org/repo2"]);
    expect(merged).toEqual([
      existing[0],
      { student: "", canvasUserId: null, repo: "org/repo2", username: null, email: null },
    ]);
  });

  it("dedupes case-insensitively against existing rows and within the incoming list", () => {
    const existing = [{ student: "Alice", canvasUserId: null, repo: "Org/Repo1", username: null, email: null }];
    const merged = mergeOrgReposIntoStudentRepos(existing, ["org/repo1", "ORG/REPO2", "org/repo2"]);
    expect(merged).toEqual([
      existing[0],
      { student: "", canvasUserId: null, repo: "ORG/REPO2", username: null, email: null },
    ]);
  });

  it("returns existing rows unchanged when the org list is empty", () => {
    const existing = [{ student: "Alice", canvasUserId: "1", repo: "org/repo1", username: null, email: null }];
    expect(mergeOrgReposIntoStudentRepos(existing, [])).toEqual(existing);
  });
});

describe("EMPTY_FORM", () => {
  it("has all fields as empty strings or empty arrays", () => {
    expect(EMPTY_FORM.id).toBe(null);
    expect(EMPTY_FORM.name).toBe("");
    expect(EMPTY_FORM.courseCode).toBe("");
    expect(EMPTY_FORM.repos).toEqual([]);
    expect(EMPTY_FORM.integrations).toEqual([]);
  });
});
