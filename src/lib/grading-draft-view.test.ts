import { describe, it, expect } from "vitest";
import {
  gradeMatchesFilters,
  collectCourseNames,
  draftCourseNames,
  resolveEffectiveCourseFilter,
  buildDraftSections,
  summarizeSections,
  hasActiveFilter,
  formatDraftTimestamp,
  parseCollapsedDraftIds,
  parseStoredSortOrder,
} from "./grading-draft-view";
import type { GradingDraft } from "./grading-drafts";
import type { GradingRunEntry, GradeResult } from "./grade";

function makeResult(overrides: Partial<GradeResult> = {}): GradeResult {
  return {
    student: "Alice",
    overallComment: "Good work",
    strengths: "Good work",
    improvements: "",
    resubmitNotice: "",
    rubricAreas: [{ area: "Correctness", score: "9/10", comment: "Nice" }],
    totalScore: "9/10",
    feedback: "",
    mergedFileCount: 1,
    submittedFiles: [],
    ...overrides,
  };
}

function makeEntry(overrides: Partial<GradingRunEntry> = {}): GradingRunEntry {
  return {
    courseName: "CS 101",
    assignmentName: "Homework 3",
    canvasUrl: "https://canvas.example.com/courses/1/assignments/2",
    run: {
      results: [makeResult()],
      rubricAreaNames: ["Correctness"],
      fullCreditChecklist: [],
    },
    ...overrides,
  };
}

function makeDraft(overrides: Partial<GradingDraft> = {}): GradingDraft {
  return {
    id: "draft-1",
    userId: "user-1",
    status: "pending",
    summary: "Grading draft",
    payload: { runs: [makeEntry()] },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("gradeMatchesFilters", () => {
  const entry = makeEntry({ courseName: "CS 101", assignmentName: "Binary Search Tree" });
  const result = makeResult({ student: "Alice Johnson" });

  it("matches with no search and 'all' course filter", () => {
    expect(gradeMatchesFilters(entry, result, { search: "", courseFilter: "all" })).toBe(true);
  });

  it("matches case-insensitively on student name", () => {
    expect(gradeMatchesFilters(entry, result, { search: "alice", courseFilter: "all" })).toBe(true);
  });

  it("matches on assignment name", () => {
    expect(gradeMatchesFilters(entry, result, { search: "binary search", courseFilter: "all" })).toBe(true);
  });

  it("matches on course name", () => {
    expect(gradeMatchesFilters(entry, result, { search: "cs 101", courseFilter: "all" })).toBe(true);
  });

  it("treats an all-whitespace search as no search", () => {
    expect(gradeMatchesFilters(entry, result, { search: "   ", courseFilter: "all" })).toBe(true);
  });

  it("excludes a non-matching search", () => {
    expect(gradeMatchesFilters(entry, result, { search: "zzz-no-match", courseFilter: "all" })).toBe(false);
  });

  it("excludes a result whose course does not match the course filter", () => {
    expect(gradeMatchesFilters(entry, result, { search: "", courseFilter: "MATH 200" })).toBe(false);
  });

  it("includes a result whose course matches the course filter", () => {
    expect(gradeMatchesFilters(entry, result, { search: "", courseFilter: "CS 101" })).toBe(true);
  });
});

describe("collectCourseNames / draftCourseNames", () => {
  it("collects and sorts distinct course names across drafts", () => {
    const drafts = [
      makeDraft({ payload: { runs: [makeEntry({ courseName: "CS 201" }), makeEntry({ courseName: "CS 101" })] } }),
      makeDraft({ payload: { runs: [makeEntry({ courseName: "CS 101" })] } }),
    ];
    expect(collectCourseNames(drafts)).toEqual(["CS 101", "CS 201"]);
  });

  it("returns an empty array for drafts with no runs", () => {
    const drafts = [makeDraft({ payload: { runs: [] } })];
    expect(collectCourseNames(drafts)).toEqual([]);
  });

  it("returns a single draft's distinct, sorted course names", () => {
    const draft = makeDraft({
      payload: { runs: [makeEntry({ courseName: "CS 201" }), makeEntry({ courseName: "CS 101" }), makeEntry({ courseName: "CS 101" })] },
    });
    expect(draftCourseNames(draft)).toEqual(["CS 101", "CS 201"]);
  });
});

describe("resolveEffectiveCourseFilter", () => {
  it("passes through 'all' unchanged", () => {
    expect(resolveEffectiveCourseFilter("all", ["CS 101"])).toBe("all");
  });

  it("keeps a course filter that is still present", () => {
    expect(resolveEffectiveCourseFilter("CS 101", ["CS 101", "CS 201"])).toBe("CS 101");
  });

  it("falls back to 'all' when the persisted course filter is no longer loaded", () => {
    expect(resolveEffectiveCourseFilter("CS 999", ["CS 101"])).toBe("all");
  });

  it("falls back to 'all' when there are no courses at all", () => {
    expect(resolveEffectiveCourseFilter("CS 101", [])).toBe("all");
  });
});

describe("buildDraftSections", () => {
  const filters = { search: "", courseFilter: "all", sort: "newest" as const };

  it("drops a draft with no results (a draft with no gradable content)", () => {
    const draft = makeDraft({
      payload: { runs: [makeEntry({ run: { results: [], rubricAreaNames: [], fullCreditChecklist: [] } })] },
    });
    expect(buildDraftSections([draft], filters)).toEqual([]);
  });

  it("drops a draft with no runs at all", () => {
    const draft = makeDraft({ payload: { runs: [] } });
    expect(buildDraftSections([draft], filters)).toEqual([]);
  });

  it("keeps a result with an empty rubric area list", () => {
    const draft = makeDraft({
      payload: { runs: [makeEntry({ run: { results: [makeResult({ rubricAreas: [] })], rubricAreaNames: [], fullCreditChecklist: [] } })] },
    });
    const sections = buildDraftSections([draft], filters);
    expect(sections).toHaveLength(1);
    expect(sections[0].groups[0].results[0].result.rubricAreas).toEqual([]);
  });

  it("keeps a result with a missing score and comment", () => {
    const draft = makeDraft({
      payload: {
        runs: [
          makeEntry({
            run: {
              results: [makeResult({ totalScore: "", overallComment: "" })],
              rubricAreaNames: [],
              fullCreditChecklist: [],
            },
          }),
        ],
      },
    });
    const sections = buildDraftSections([draft], filters);
    expect(sections).toHaveLength(1);
    expect(sections[0].groups[0].results[0].result.totalScore).toBe("");
    expect(sections[0].groups[0].results[0].result.overallComment).toBe("");
  });

  it("groups multiple assignments within one draft into separate groups", () => {
    const draft = makeDraft({
      payload: {
        runs: [
          makeEntry({ assignmentName: "Homework 1", run: { results: [makeResult({ student: "Alice" })], rubricAreaNames: [], fullCreditChecklist: [] } }),
          makeEntry({ assignmentName: "Homework 2", run: { results: [makeResult({ student: "Bob" })], rubricAreaNames: [], fullCreditChecklist: [] } }),
        ],
      },
    });
    const [section] = buildDraftSections([draft], filters);
    expect(section.groups).toHaveLength(2);
    expect(section.passingGrades).toBe(2);
  });

  it("drops just the assignment group whose results are all filtered out, keeping the rest", () => {
    const draft = makeDraft({
      payload: {
        runs: [
          makeEntry({ courseName: "CS 101", run: { results: [makeResult({ student: "Alice" })], rubricAreaNames: [], fullCreditChecklist: [] } }),
          makeEntry({ courseName: "MATH 200", run: { results: [makeResult({ student: "Bob" })], rubricAreaNames: [], fullCreditChecklist: [] } }),
        ],
      },
    });
    const [section] = buildDraftSections([draft], { search: "", courseFilter: "CS 101", sort: "newest" });
    expect(section.groups).toHaveLength(1);
    expect(section.groups[0].entry.courseName).toBe("CS 101");
    expect(section.passingGrades).toBe(1);
  });

  it("sorts drafts newest-first by default", () => {
    const older = makeDraft({ id: "older", createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = makeDraft({ id: "newer", createdAt: "2026-02-01T00:00:00.000Z" });
    const sections = buildDraftSections([older, newer], filters);
    expect(sections.map((s) => s.draft.id)).toEqual(["newer", "older"]);
  });

  it("sorts drafts oldest-first when requested", () => {
    const older = makeDraft({ id: "older", createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = makeDraft({ id: "newer", createdAt: "2026-02-01T00:00:00.000Z" });
    const sections = buildDraftSections([older, newer], { ...filters, sort: "oldest" });
    expect(sections.map((s) => s.draft.id)).toEqual(["older", "newer"]);
  });

  it("does not mutate the input drafts array", () => {
    const drafts = [makeDraft({ id: "a" }), makeDraft({ id: "b" })];
    const snapshot = JSON.stringify(drafts);
    buildDraftSections(drafts, filters);
    expect(JSON.stringify(drafts)).toBe(snapshot);
  });

  it("preserves resultIdx/runIdx as the original array indices, not filtered-array indices", () => {
    const draft = makeDraft({
      payload: {
        runs: [
          makeEntry({
            run: {
              results: [makeResult({ student: "Alice" }), makeResult({ student: "Bob" })],
              rubricAreaNames: [],
              fullCreditChecklist: [],
            },
          }),
        ],
      },
    });
    const [section] = buildDraftSections([draft], { search: "bob", courseFilter: "all", sort: "newest" });
    expect(section.groups[0].runIdx).toBe(0);
    expect(section.groups[0].results[0].resultIdx).toBe(1);
  });
});

describe("summarizeSections", () => {
  it("sums grades and counts drafts across sections", () => {
    const sections = buildDraftSections(
      [
        makeDraft({
          id: "d1",
          payload: { runs: [makeEntry({ run: { results: [makeResult({ student: "Alice" }), makeResult({ student: "Bob" })], rubricAreaNames: [], fullCreditChecklist: [] } })] },
        }),
        makeDraft({
          id: "d2",
          payload: { runs: [makeEntry({ run: { results: [makeResult({ student: "Cara" })], rubricAreaNames: [], fullCreditChecklist: [] } })] },
        }),
      ],
      { search: "", courseFilter: "all", sort: "newest" }
    );
    expect(summarizeSections(sections)).toEqual({ totalGrades: 3, totalDrafts: 2 });
  });

  it("returns zeros for an empty section list", () => {
    expect(summarizeSections([])).toEqual({ totalGrades: 0, totalDrafts: 0 });
  });
});

describe("hasActiveFilter", () => {
  it("is false with no search and 'all' course", () => {
    expect(hasActiveFilter("", "all")).toBe(false);
  });

  it("is false for a whitespace-only search", () => {
    expect(hasActiveFilter("   ", "all")).toBe(false);
  });

  it("is true when a search is present", () => {
    expect(hasActiveFilter("alice", "all")).toBe(true);
  });

  it("is true when a course filter is active", () => {
    expect(hasActiveFilter("", "CS 101")).toBe(true);
  });
});

describe("formatDraftTimestamp", () => {
  it("formats an ISO timestamp as a locale date + time string", () => {
    const formatted = formatDraftTimestamp("2026-01-15T10:30:00.000Z");
    // Locale-dependent formatting - just assert it produced a non-empty,
    // two-part (date + time) string rather than asserting an exact value.
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toContain(new Date("2026-01-15T10:30:00.000Z").toLocaleDateString());
  });
});

describe("parseCollapsedDraftIds", () => {
  it("returns an empty list for null", () => {
    expect(parseCollapsedDraftIds(null)).toEqual([]);
  });

  it("returns an empty list for an empty string", () => {
    expect(parseCollapsedDraftIds("")).toEqual([]);
  });

  it("returns an empty list for invalid JSON (corrupt stored value)", () => {
    expect(parseCollapsedDraftIds("{not valid json")).toEqual([]);
  });

  it("returns an empty list for valid JSON that is not an array", () => {
    expect(parseCollapsedDraftIds('{"a":1}')).toEqual([]);
  });

  it("filters out non-string entries from an otherwise valid array", () => {
    expect(parseCollapsedDraftIds('["draft-1", 42, null, "draft-2"]')).toEqual(["draft-1", "draft-2"]);
  });

  it("round-trips a valid stored array", () => {
    const stored = JSON.stringify(["draft-a", "draft-b"]);
    expect(parseCollapsedDraftIds(stored)).toEqual(["draft-a", "draft-b"]);
  });
});

describe("parseStoredSortOrder", () => {
  it("defaults to 'newest' for null", () => {
    expect(parseStoredSortOrder(null)).toBe("newest");
  });

  it("defaults to 'newest' for an unknown/corrupt value", () => {
    expect(parseStoredSortOrder("garbage")).toBe("newest");
  });

  it("recognizes 'oldest'", () => {
    expect(parseStoredSortOrder("oldest")).toBe("oldest");
  });

  it("recognizes 'newest' explicitly", () => {
    expect(parseStoredSortOrder("newest")).toBe("newest");
  });
});
