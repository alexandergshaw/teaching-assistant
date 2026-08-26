// Tests for repoGradesUiState.ts (AC4 items 23-24). vitest.config.ts runs
// with environment: "node", so there is no `window`/`localStorage` global by
// default - this file stubs a minimal in-memory Storage and a `window`
// global before each test and restores the previous globals afterward,
// exactly matching src/app/components/tasks/tasksUiState.test.ts's own
// pattern (see that file's header for why: it confirmed live that
// typeof window/localStorage are both "undefined" under plain Node here).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decodeRepoGradeRubricChoice,
  defaultRepoGradeRubricChoice,
  encodeRepoGradeRubricChoice,
  loadAssignmentMapping,
  loadRepoGradeManualRubricText,
  loadRepoGradeRubricChoice,
  loadRepoGradesUiState,
  loadSelectedRepoIds,
  persistAssignmentMapping,
  loadRepoGradeLog,
  persistRepoGradeLog,
  persistRepoGradeManualRubricText,
  persistRepoGradeRubricChoice,
  persistRepoGradesUiState,
  persistSelectedRepoIds,
  type RepoGradeRubricChoice,
} from "./repoGradesUiState";
import type { RepoGradeLogEntry } from "./repoGradesLog";
import { DEFAULT_REPO_GRADE_SORT } from "./repoGradesRows";

class FakeStorage {
  private store = new Map<string, string>();
  throwOnSet = false;

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    if (this.throwOnSet) throw new Error("quota exceeded (simulated)");
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

let fakeStorage: FakeStorage;
const originalWindow = (globalThis as { window?: unknown }).window;
const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

beforeEach(() => {
  fakeStorage = new FakeStorage();
  (globalThis as { window?: unknown }).window = globalThis;
  (globalThis as { localStorage?: unknown }).localStorage = fakeStorage;
});

afterEach(() => {
  if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else (globalThis as { window?: unknown }).window = originalWindow;

  if (originalLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
  else (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
});

describe("loadRepoGradesUiState / persistRepoGradesUiState", () => {
  it("returns defaults (empty course, empty prefix, repo/asc sort, empty instructions/rubric/link assignment, roster link source, README instructions on, bulk selection-only off) when nothing is stored", () => {
    expect(loadRepoGradesUiState()).toEqual({
      courseId: "",
      orgPrefix: "",
      sort: DEFAULT_REPO_GRADE_SORT,
      instructions: "",
      rubric: "",
      linkAssignmentId: "",
      linkSource: "roster",
      useReadmeInstructions: true,
      bulkSelectionOnly: false,
    });
  });

  it("returns defaults when window is undefined (SSR-safe read)", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(loadRepoGradesUiState()).toEqual({
      courseId: "",
      orgPrefix: "",
      sort: DEFAULT_REPO_GRADE_SORT,
      instructions: "",
      rubric: "",
      linkAssignmentId: "",
      linkSource: "roster",
      useReadmeInstructions: true,
      bulkSelectionOnly: false,
    });
  });

  it("round-trips a full state through persist then load", () => {
    persistRepoGradesUiState({
      courseId: "course-1",
      orgPrefix: "module",
      sort: { field: "binding", direction: "desc" },
      instructions: "Grade the README against the rubric.",
      rubric: "5 pts: has a README",
      linkAssignmentId: "9001",
      linkSource: "live",
      useReadmeInstructions: false,
      bulkSelectionOnly: true,
    });
    expect(loadRepoGradesUiState()).toEqual({
      courseId: "course-1",
      orgPrefix: "module",
      sort: { field: "binding", direction: "desc" },
      instructions: "Grade the README against the rubric.",
      rubric: "5 pts: has a README",
      linkAssignmentId: "9001",
      linkSource: "live",
      useReadmeInstructions: false,
      bulkSelectionOnly: true,
    });
  });

  it("does nothing when window is undefined (SSR-safe write)", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() =>
      persistRepoGradesUiState({
        courseId: "x",
        orgPrefix: "y",
        sort: DEFAULT_REPO_GRADE_SORT,
        instructions: "",
        rubric: "",
        linkAssignmentId: "",
        linkSource: "roster",
        useReadmeInstructions: true,
        bulkSelectionOnly: false,
      })
    ).not.toThrow();
    expect(fakeStorage.getItem("ta-repo-grades-course")).toBeNull();
  });

  it("swallows a localStorage write failure (quota/private mode) rather than throwing", () => {
    fakeStorage.throwOnSet = true;
    expect(() =>
      persistRepoGradesUiState({
        courseId: "x",
        orgPrefix: "y",
        sort: DEFAULT_REPO_GRADE_SORT,
        instructions: "",
        rubric: "",
        linkAssignmentId: "",
        linkSource: "roster",
        useReadmeInstructions: true,
        bulkSelectionOnly: false,
      })
    ).not.toThrow();
  });

  it("falls back to the default sort for malformed JSON", () => {
    fakeStorage.setItem("ta-repo-grades-sort", "{not json");
    expect(loadRepoGradesUiState().sort).toEqual(DEFAULT_REPO_GRADE_SORT);
  });

  it("falls back to the default sort for a field/direction that no longer exists", () => {
    fakeStorage.setItem("ta-repo-grades-sort", JSON.stringify({ field: "score", direction: "sideways" }));
    expect(loadRepoGradesUiState().sort).toEqual(DEFAULT_REPO_GRADE_SORT);
  });

  it("round-trips the link source through persist then load", () => {
    persistRepoGradesUiState({
      courseId: "",
      orgPrefix: "",
      sort: DEFAULT_REPO_GRADE_SORT,
      instructions: "",
      rubric: "",
      linkAssignmentId: "",
      linkSource: "live",
      useReadmeInstructions: true,
      bulkSelectionOnly: false,
    });
    expect(loadRepoGradesUiState().linkSource).toBe("live");
  });

  it("falls back to the default link source (\"roster\") for a stored value that is neither \"roster\" nor \"live\"", () => {
    fakeStorage.setItem("ta-repo-grades-link-source", "workflow-step");
    expect(loadRepoGradesUiState().linkSource).toBe("roster");
  });

  it("round-trips useReadmeInstructions=false and bulkSelectionOnly=true through persist then load", () => {
    persistRepoGradesUiState({
      courseId: "",
      orgPrefix: "",
      sort: DEFAULT_REPO_GRADE_SORT,
      instructions: "",
      rubric: "",
      linkAssignmentId: "",
      linkSource: "roster",
      useReadmeInstructions: false,
      bulkSelectionOnly: true,
    });
    const loaded = loadRepoGradesUiState();
    expect(loaded.useReadmeInstructions).toBe(false);
    expect(loaded.bulkSelectionOnly).toBe(true);
  });

  it("reads useReadmeInstructions as false for any stored value other than the exact \"1\" marker - only NEVER-persisted (raw null) falls back to the true default", () => {
    fakeStorage.setItem("ta-repo-grades-readme-instructions", "nonsense");
    expect(loadRepoGradesUiState().useReadmeInstructions).toBe(false);
  });

  it("reads bulkSelectionOnly as false for any stored value other than the exact \"1\" marker, same as its own true-marker default of false", () => {
    fakeStorage.setItem("ta-repo-grades-bulk-selection-only", "nonsense");
    expect(loadRepoGradesUiState().bulkSelectionOnly).toBe(false);
  });

  it("persists course id, org prefix, sort, instructions, rubric, link assignment id, link source, README-instructions flag, and bulk-selection-only flag under nine distinct ta- keys", () => {
    persistRepoGradesUiState({
      courseId: "course-9",
      orgPrefix: "wk",
      sort: { field: "repo", direction: "desc" },
      instructions: "Grade folder by folder.",
      rubric: "10 pts total",
      linkAssignmentId: "9001",
      linkSource: "live",
      useReadmeInstructions: false,
      bulkSelectionOnly: true,
    });
    expect(fakeStorage.getItem("ta-repo-grades-course")).toBe("course-9");
    expect(fakeStorage.getItem("ta-repo-grades-org-prefix")).toBe("wk");
    expect(fakeStorage.getItem("ta-repo-grades-sort")).toBe(JSON.stringify({ field: "repo", direction: "desc" }));
    expect(fakeStorage.getItem("ta-repo-grades-instructions")).toBe("Grade folder by folder.");
    expect(fakeStorage.getItem("ta-repo-grades-rubric")).toBe("10 pts total");
    expect(fakeStorage.getItem("ta-repo-grades-link-assignment")).toBe("9001");
    expect(fakeStorage.getItem("ta-repo-grades-link-source")).toBe("live");
    expect(fakeStorage.getItem("ta-repo-grades-readme-instructions")).toBe("");
    expect(fakeStorage.getItem("ta-repo-grades-bulk-selection-only")).toBe("1");
  });
});

describe("loadAssignmentMapping / persistAssignmentMapping - AC5 items 25-26, task 1", () => {
  it("returns an empty mapping when nothing is stored", () => {
    expect(loadAssignmentMapping("course-1")).toEqual({});
  });

  it("returns an empty mapping for a blank course id", () => {
    expect(loadAssignmentMapping("")).toEqual({});
  });

  it("round-trips one course's mapping through persist then load", () => {
    persistAssignmentMapping("course-1", { "week-1": "501", "week-2": "502" });
    expect(loadAssignmentMapping("course-1")).toEqual({ "week-1": "501", "week-2": "502" });
  });

  it("keeps a DIFFERENT course's mapping completely separate", () => {
    persistAssignmentMapping("course-1", { "week-1": "501" });
    persistAssignmentMapping("course-2", { "week-1": "999" });
    expect(loadAssignmentMapping("course-1")).toEqual({ "week-1": "501" });
    expect(loadAssignmentMapping("course-2")).toEqual({ "week-1": "999" });
  });

  it("persisting one course's mapping does not disturb another already-stored course's mapping", () => {
    persistAssignmentMapping("course-1", { "week-1": "501" });
    persistAssignmentMapping("course-2", { "week-1": "999" });
    persistAssignmentMapping("course-1", { "week-1": "501", "week-2": "502" });
    expect(loadAssignmentMapping("course-2")).toEqual({ "week-1": "999" });
  });

  it("overwrites a course's prior mapping entirely on the next persist for that course", () => {
    persistAssignmentMapping("course-1", { "week-1": "501", "week-2": "502" });
    persistAssignmentMapping("course-1", { "week-1": "501" });
    expect(loadAssignmentMapping("course-1")).toEqual({ "week-1": "501" });
  });

  it("returns an empty mapping for malformed JSON", () => {
    fakeStorage.setItem("ta-repo-grades-assignment-map", "{not json");
    expect(loadAssignmentMapping("course-1")).toEqual({});
  });

  it("returns an empty mapping when the stored value is valid JSON but not an object", () => {
    fakeStorage.setItem("ta-repo-grades-assignment-map", JSON.stringify(["not", "an", "object"]));
    expect(loadAssignmentMapping("course-1")).toEqual({});
  });

  it("ignores a course entry whose value is not a string-to-string record", () => {
    fakeStorage.setItem("ta-repo-grades-assignment-map", JSON.stringify({ "course-1": { "week-1": 501 } }));
    expect(loadAssignmentMapping("course-1")).toEqual({});
  });

  it("does nothing when window is undefined (SSR-safe write)", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => persistAssignmentMapping("course-1", { "week-1": "501" })).not.toThrow();
    expect(fakeStorage.getItem("ta-repo-grades-assignment-map")).toBeNull();
  });

  it("returns an empty mapping when window is undefined", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(loadAssignmentMapping("course-1")).toEqual({});
  });

  it("swallows a localStorage write failure rather than throwing", () => {
    fakeStorage.throwOnSet = true;
    expect(() => persistAssignmentMapping("course-1", { "week-1": "501" })).not.toThrow();
  });
});

describe("loadSelectedRepoIds / persistSelectedRepoIds - AC4 item 23", () => {
  it("returns an empty set when nothing is stored", () => {
    expect(loadSelectedRepoIds(["org/a", "org/b"])).toEqual(new Set());
  });

  it("restores a persisted selection that is still valid", () => {
    persistSelectedRepoIds(new Set(["org/a", "org/b"]));
    expect(loadSelectedRepoIds(["org/a", "org/b", "org/c"])).toEqual(new Set(["org/a", "org/b"]));
  });

  it("filters out ids no longer present in validRepoIds (a stale selection never resurrects a removed row)", () => {
    persistSelectedRepoIds(new Set(["org/a", "org/stale-removed"]));
    expect(loadSelectedRepoIds(["org/a"])).toEqual(new Set(["org/a"]));
  });

  it("drops every id when validRepoIds is empty (e.g. course switched, nothing scanned yet)", () => {
    persistSelectedRepoIds(new Set(["org/a", "org/b"]));
    expect(loadSelectedRepoIds([])).toEqual(new Set());
  });

  it("returns an empty set for malformed JSON", () => {
    fakeStorage.setItem("ta-repo-grades-selected", "{not an array");
    expect(loadSelectedRepoIds(["org/a"])).toEqual(new Set());
  });

  it("returns an empty set when the stored value is valid JSON but not an array", () => {
    fakeStorage.setItem("ta-repo-grades-selected", JSON.stringify({ a: 1 }));
    expect(loadSelectedRepoIds(["org/a"])).toEqual(new Set());
  });

  it("ignores non-string entries in the stored array", () => {
    fakeStorage.setItem("ta-repo-grades-selected", JSON.stringify(["org/a", 42, null]));
    expect(loadSelectedRepoIds(["org/a"])).toEqual(new Set(["org/a"]));
  });

  it("returns an empty set when window is undefined", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(loadSelectedRepoIds(["org/a"])).toEqual(new Set());
  });

  it("does nothing when persisting with window undefined", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => persistSelectedRepoIds(new Set(["org/a"]))).not.toThrow();
    expect(fakeStorage.getItem("ta-repo-grades-selected")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Activity log persistence (docs/repo-grades-activity-log-acceptance-criteria.md
// L3). The VALIDATION of a stored entry is repoGradesLog.ts's job and is
// pinned by repoGradesLog.test.ts; what these tests own is the localStorage
// half - the per-course slicing, the "other courses stay untouched"
// guarantee, and the best-effort write.

function logEntry(overrides: Partial<RepoGradeLogEntry> = {}): RepoGradeLogEntry {
  return {
    at: "2026-08-24T15:04:05.123Z",
    kind: "post-succeeded",
    courseId: "course-1",
    courseName: "CS 101",
    repo: "org/student-a",
    folder: "week-1",
    assignmentId: "9001",
    score: "18",
    detail: "",
    ...overrides,
  };
}

describe("loadRepoGradeLog / persistRepoGradeLog", () => {
  it("round-trips one course's entries", () => {
    const entries = [logEntry({ repo: "org/a" }), logEntry({ repo: "org/b", kind: "grade-failed" })];
    persistRepoGradeLog("course-1", entries);
    expect(loadRepoGradeLog("course-1")).toEqual(entries);
  });

  it("returns [] for a course with nothing stored, and for a blank course id", () => {
    persistRepoGradeLog("course-1", [logEntry()]);
    expect(loadRepoGradeLog("course-2")).toEqual([]);
    expect(loadRepoGradeLog("")).toEqual([]);
  });

  // L3 item 13 - a grading session's record must never surface under a
  // different course, which is the same guarantee the assignment mapping
  // above already makes.
  it("leaves every other course's log untouched when one course's is written", () => {
    persistRepoGradeLog("course-1", [logEntry({ repo: "org/one" })]);
    persistRepoGradeLog("course-2", [logEntry({ repo: "org/two" })]);
    persistRepoGradeLog("course-1", [logEntry({ repo: "org/one" }), logEntry({ repo: "org/one-again" })]);
    expect(loadRepoGradeLog("course-2").map((e) => e.repo)).toEqual(["org/two"]);
    expect(loadRepoGradeLog("course-1").map((e) => e.repo)).toEqual(["org/one", "org/one-again"]);
  });

  it("stores an empty array when the log is cleared, rather than leaving the old entries", () => {
    persistRepoGradeLog("course-1", [logEntry()]);
    persistRepoGradeLog("course-1", []);
    expect(loadRepoGradeLog("course-1")).toEqual([]);
  });

  it("drops a malformed blob, a non-object root, and a non-array course slice", () => {
    fakeStorage.setItem("ta-repo-grades-log", "{not json");
    expect(loadRepoGradeLog("course-1")).toEqual([]);
    fakeStorage.setItem("ta-repo-grades-log", JSON.stringify(["a", "b"]));
    expect(loadRepoGradeLog("course-1")).toEqual([]);
    fakeStorage.setItem("ta-repo-grades-log", JSON.stringify({ "course-1": "not an array" }));
    expect(loadRepoGradeLog("course-1")).toEqual([]);
  });

  it("keeps the valid entries and drops the invalid ones from a partially-corrupt slice", () => {
    const good = logEntry({ repo: "org/keep" });
    fakeStorage.setItem("ta-repo-grades-log", JSON.stringify({ "course-1": [good, { kind: "nonsense" }, null] }));
    expect(loadRepoGradeLog("course-1")).toEqual([good]);
  });

  it("does not throw and does not write when localStorage refuses the write (L3 item 16)", () => {
    fakeStorage.throwOnSet = true;
    expect(() => persistRepoGradeLog("course-1", [logEntry()])).not.toThrow();
    fakeStorage.throwOnSet = false;
    expect(loadRepoGradeLog("course-1")).toEqual([]);
  });

  it("does nothing with window undefined", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(loadRepoGradeLog("course-1")).toEqual([]);
    expect(() => persistRepoGradeLog("course-1", [logEntry()])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Rubric picker persistence
// (docs/repo-grades-rubric-picker-acceptance-criteria.md items 19/46/73).
// encodeRepoGradeRubricChoice/decodeRepoGradeRubricChoice carry the source
// AND the chosen rubric's identity together in one value (item 46); the
// separator's first-colon-only split (item 73's underlying hazard) is what
// keeps an identity containing a colon intact rather than truncated.

describe("encodeRepoGradeRubricChoice / decodeRepoGradeRubricChoice", () => {
  it("round-trips every source kind through encode then decode", () => {
    const choices: RepoGradeRubricChoice[] = [
      { source: "generate", identity: "" },
      { source: "assignment", identity: "" },
      { source: "live", identity: "9001" },
      { source: "export", identity: "1:Grading Rubric" },
      { source: "manual", identity: "" },
    ];
    for (const choice of choices) {
      expect(decodeRepoGradeRubricChoice(encodeRepoGradeRubricChoice(choice))).toEqual(choice);
    }
  });

  it("preserves an identity containing the separator character (a naive limited split(\":\", 2) would truncate this - the canary for that exact bug)", () => {
    const choice: RepoGradeRubricChoice = { source: "export", identity: "2:Section 3: Grading Rubric" };
    const encoded = encodeRepoGradeRubricChoice(choice);
    // Prove the canary can actually catch the bug: JS's String.split with a
    // limit still splits on EVERY separator first and only then truncates the
    // result array, so a naive `value.split(":", 2)[1]` implementation would
    // read the identity as just "2" - silently dropping everything after the
    // second colon. The real decoder must NOT reproduce that truncation.
    expect(encoded.split(":", 2)[1]).toBe("2");
    expect(decodeRepoGradeRubricChoice(encoded).identity).not.toBe("2");
    expect(decodeRepoGradeRubricChoice(encoded)).toEqual(choice);
  });

  it("preserves an identity that is itself just a bare colon", () => {
    const choice: RepoGradeRubricChoice = { source: "export", identity: ":" };
    expect(decodeRepoGradeRubricChoice(encodeRepoGradeRubricChoice(choice))).toEqual(choice);
  });

  it("degrades a value with no colon at all to the default choice (never trusts stored data)", () => {
    expect(decodeRepoGradeRubricChoice("garbage")).toEqual(defaultRepoGradeRubricChoice());
  });

  it("degrades a value naming an unrecognised source to the default choice", () => {
    expect(decodeRepoGradeRubricChoice("workflow-step:123")).toEqual(defaultRepoGradeRubricChoice());
  });

  it("degrades an empty string to the default choice", () => {
    expect(decodeRepoGradeRubricChoice("")).toEqual(defaultRepoGradeRubricChoice());
  });
});

describe("loadRepoGradeRubricChoice / persistRepoGradeRubricChoice", () => {
  it("returns the default (generate, empty identity) when nothing is stored - byte-for-byte today's behaviour (item 4)", () => {
    expect(loadRepoGradeRubricChoice("course-1")).toEqual(defaultRepoGradeRubricChoice());
  });

  it("returns the default for a blank course id", () => {
    expect(loadRepoGradeRubricChoice("")).toEqual(defaultRepoGradeRubricChoice());
  });

  it("round-trips one course's choice through persist then load", () => {
    persistRepoGradeRubricChoice("course-1", { source: "live", identity: "9001" });
    expect(loadRepoGradeRubricChoice("course-1")).toEqual({ source: "live", identity: "9001" });
  });

  it("round-trips an export choice whose identity contains a colon", () => {
    persistRepoGradeRubricChoice("course-1", { source: "export", identity: "2:Section 3: Grading Rubric" });
    expect(loadRepoGradeRubricChoice("course-1")).toEqual({ source: "export", identity: "2:Section 3: Grading Rubric" });
  });

  it("keeps a DIFFERENT course's choice completely separate", () => {
    persistRepoGradeRubricChoice("course-1", { source: "live", identity: "9001" });
    persistRepoGradeRubricChoice("course-2", { source: "export", identity: "1:Rubric A" });
    expect(loadRepoGradeRubricChoice("course-1")).toEqual({ source: "live", identity: "9001" });
    expect(loadRepoGradeRubricChoice("course-2")).toEqual({ source: "export", identity: "1:Rubric A" });
  });

  it("writing one course's choice does not disturb another already-stored course's choice", () => {
    persistRepoGradeRubricChoice("course-1", { source: "live", identity: "9001" });
    persistRepoGradeRubricChoice("course-2", { source: "manual", identity: "" });
    persistRepoGradeRubricChoice("course-1", { source: "assignment", identity: "" });
    expect(loadRepoGradeRubricChoice("course-2")).toEqual({ source: "manual", identity: "" });
  });

  it("returns the default for malformed JSON", () => {
    fakeStorage.setItem("ta-repo-grades-rubric-source", "{not json");
    expect(loadRepoGradeRubricChoice("course-1")).toEqual(defaultRepoGradeRubricChoice());
  });

  it("returns the default when the stored value is valid JSON but not an object", () => {
    fakeStorage.setItem("ta-repo-grades-rubric-source", JSON.stringify(["not", "an", "object"]));
    expect(loadRepoGradeRubricChoice("course-1")).toEqual(defaultRepoGradeRubricChoice());
  });

  it("ignores a course entry whose stored value is not a string", () => {
    fakeStorage.setItem("ta-repo-grades-rubric-source", JSON.stringify({ "course-1": { source: "live", identity: "9001" } }));
    expect(loadRepoGradeRubricChoice("course-1")).toEqual(defaultRepoGradeRubricChoice());
  });

  it("does nothing when persisting with window undefined", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => persistRepoGradeRubricChoice("course-1", { source: "live", identity: "9001" })).not.toThrow();
    expect(fakeStorage.getItem("ta-repo-grades-rubric-source")).toBeNull();
  });

  it("returns the default when window is undefined", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(loadRepoGradeRubricChoice("course-1")).toEqual(defaultRepoGradeRubricChoice());
  });

  it("swallows a localStorage write failure rather than throwing", () => {
    fakeStorage.throwOnSet = true;
    expect(() => persistRepoGradeRubricChoice("course-1", { source: "live", identity: "9001" })).not.toThrow();
  });
});

describe("loadRepoGradeManualRubricText / persistRepoGradeManualRubricText (item 73)", () => {
  it("returns \"\" when nothing is stored", () => {
    expect(loadRepoGradeManualRubricText("course-1")).toBe("");
  });

  it("returns \"\" for a blank course id", () => {
    expect(loadRepoGradeManualRubricText("")).toBe("");
  });

  it("round-trips one course's manual rubric text through persist then load", () => {
    persistRepoGradeManualRubricText("course-1", "5 pts: has a README");
    expect(loadRepoGradeManualRubricText("course-1")).toBe("5 pts: has a README");
  });

  it("one course's manual rubric text never appears under another course - the exact defect item 73 closes", () => {
    persistRepoGradeManualRubricText("course-1", "Course 1's own typed rubric");
    persistRepoGradeManualRubricText("course-2", "Course 2's own typed rubric");
    expect(loadRepoGradeManualRubricText("course-1")).toBe("Course 1's own typed rubric");
    expect(loadRepoGradeManualRubricText("course-2")).toBe("Course 2's own typed rubric");
    expect(loadRepoGradeManualRubricText("course-2")).not.toBe(loadRepoGradeManualRubricText("course-1"));
  });

  it("writing one course's text does not disturb another already-stored course's text", () => {
    persistRepoGradeManualRubricText("course-1", "first");
    persistRepoGradeManualRubricText("course-2", "second");
    persistRepoGradeManualRubricText("course-1", "first, edited");
    expect(loadRepoGradeManualRubricText("course-2")).toBe("second");
  });

  it("is stored separately from the pre-existing global ta-repo-grades-rubric key", () => {
    persistRepoGradesUiState({
      courseId: "",
      orgPrefix: "",
      sort: DEFAULT_REPO_GRADE_SORT,
      instructions: "",
      rubric: "the global rubric text",
      linkAssignmentId: "",
      linkSource: "roster",
      useReadmeInstructions: true,
      bulkSelectionOnly: false,
    });
    persistRepoGradeManualRubricText("course-1", "the per-course rubric text");
    expect(fakeStorage.getItem("ta-repo-grades-rubric")).toBe("the global rubric text");
    expect(loadRepoGradeManualRubricText("course-1")).toBe("the per-course rubric text");
  });

  it("returns \"\" for malformed JSON", () => {
    fakeStorage.setItem("ta-repo-grades-rubric-manual-text", "{not json");
    expect(loadRepoGradeManualRubricText("course-1")).toBe("");
  });

  it("returns \"\" when the stored value is valid JSON but not an object", () => {
    fakeStorage.setItem("ta-repo-grades-rubric-manual-text", JSON.stringify(["not", "an", "object"]));
    expect(loadRepoGradeManualRubricText("course-1")).toBe("");
  });

  it("ignores a course entry whose stored value is not a string", () => {
    fakeStorage.setItem("ta-repo-grades-rubric-manual-text", JSON.stringify({ "course-1": 12345 }));
    expect(loadRepoGradeManualRubricText("course-1")).toBe("");
  });

  it("does nothing when persisting with window undefined", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => persistRepoGradeManualRubricText("course-1", "text")).not.toThrow();
    expect(fakeStorage.getItem("ta-repo-grades-rubric-manual-text")).toBeNull();
  });

  it("returns \"\" when window is undefined", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(loadRepoGradeManualRubricText("course-1")).toBe("");
  });

  it("swallows a localStorage write failure rather than throwing", () => {
    fakeStorage.throwOnSet = true;
    expect(() => persistRepoGradeManualRubricText("course-1", "text")).not.toThrow();
  });
});
