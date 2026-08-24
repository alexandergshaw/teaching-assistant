// Tests for repoGradesLog.ts - the Repo Grades activity log
// (docs/repo-grades-activity-log-acceptance-criteria.md L2/L5/L6). Every
// function under test is pure and takes its timestamp as a parameter, so
// nothing here stubs a clock or asserts around "now": the expected filename
// and the expected exported text are written out literally.
import { describe, expect, it } from "vitest";
import {
  appendRepoGradeLogEntries,
  formatRepoGradeLogCsv,
  formatRepoGradeLogJson,
  MAX_REPO_GRADE_LOG_ENTRIES,
  parseRepoGradeLogEntries,
  recentRepoGradeLogEntries,
  repoGradeLogFileName,
  summarizeRepoGradeLog,
  type RepoGradeLogEntry,
  type RepoGradeLogEventKind,
} from "./repoGradesLog";

function entry(overrides: Partial<RepoGradeLogEntry> = {}): RepoGradeLogEntry {
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

describe("appendRepoGradeLogEntries", () => {
  it("appends in oldest-first order without mutating the input", () => {
    const original = [entry({ repo: "org/a" })];
    const frozen = Object.freeze(original.slice());
    const next = appendRepoGradeLogEntries(frozen, [entry({ repo: "org/b" })]);
    expect(next.map((e) => e.repo)).toEqual(["org/a", "org/b"]);
    expect(original.map((e) => e.repo)).toEqual(["org/a"]);
  });

  it("returns a copy (not the same reference) when there is nothing to append", () => {
    const original = [entry()];
    const next = appendRepoGradeLogEntries(original, []);
    expect(next).toEqual(original);
    expect(next).not.toBe(original);
  });

  it("appends several entries in the order given", () => {
    const next = appendRepoGradeLogEntries([], [entry({ repo: "a" }), entry({ repo: "b" }), entry({ repo: "c" })]);
    expect(next.map((e) => e.repo)).toEqual(["a", "b", "c"]);
  });

  // L2 item 11 - the direction of the trim is the whole point: dropping the
  // NEWEST would make the log go quiet during the long session that filled
  // it, which is the session whose record matters most.
  it("drops the OLDEST entries, never the newest, once past the cap", () => {
    const full = Array.from({ length: MAX_REPO_GRADE_LOG_ENTRIES }, (_, i) => entry({ repo: `org/repo-${i}` }));
    const next = appendRepoGradeLogEntries(full, [entry({ repo: "org/newest" })]);
    expect(next).toHaveLength(MAX_REPO_GRADE_LOG_ENTRIES);
    expect(next[next.length - 1].repo).toBe("org/newest");
    expect(next[0].repo).toBe("org/repo-1");
    expect(next.some((e) => e.repo === "org/repo-0")).toBe(false);
  });

  it("caps correctly when a single append is itself larger than the cap", () => {
    const many = Array.from({ length: MAX_REPO_GRADE_LOG_ENTRIES + 10 }, (_, i) => entry({ repo: `r-${i}` }));
    const next = appendRepoGradeLogEntries([entry({ repo: "pre-existing" })], many);
    expect(next).toHaveLength(MAX_REPO_GRADE_LOG_ENTRIES);
    expect(next.some((e) => e.repo === "pre-existing")).toBe(false);
    expect(next[next.length - 1].repo).toBe(`r-${MAX_REPO_GRADE_LOG_ENTRIES + 9}`);
  });
});

describe("parseRepoGradeLogEntries", () => {
  it("round-trips a valid stored array", () => {
    const stored = [entry({ repo: "org/a" }), entry({ repo: "org/b", kind: "grade-failed" })];
    expect(parseRepoGradeLogEntries(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });

  it("returns [] for anything that is not an array", () => {
    expect(parseRepoGradeLogEntries(undefined)).toEqual([]);
    expect(parseRepoGradeLogEntries(null)).toEqual([]);
    expect(parseRepoGradeLogEntries("[]")).toEqual([]);
    expect(parseRepoGradeLogEntries({ entries: [] })).toEqual([]);
  });

  // L3 item 14 - one bad entry must cost that entry, never the whole log.
  it("drops entries with an unknown kind, a missing field, or a mistyped field, keeping the good ones", () => {
    const good = entry({ repo: "org/keep" });
    const missingField = { ...entry({ repo: "org/drop-1" }) } as Record<string, unknown>;
    delete missingField.detail;
    const mistyped = { ...entry({ repo: "org/drop-2" }), score: 18 };
    const unknownKind = { ...entry({ repo: "org/drop-3" }), kind: "who-knows" };
    const parsed = parseRepoGradeLogEntries([good, missingField, mistyped, unknownKind, null, "nope", 7]);
    expect(parsed).toEqual([good]);
  });

  it("applies the cap to a hand-edited oversized blob, keeping the newest", () => {
    const huge = Array.from({ length: MAX_REPO_GRADE_LOG_ENTRIES + 5 }, (_, i) => entry({ repo: `r-${i}` }));
    const parsed = parseRepoGradeLogEntries(huge);
    expect(parsed).toHaveLength(MAX_REPO_GRADE_LOG_ENTRIES);
    expect(parsed[parsed.length - 1].repo).toBe(`r-${MAX_REPO_GRADE_LOG_ENTRIES + 4}`);
  });
});

describe("summarizeRepoGradeLog", () => {
  it("counts graded, posted and failed, and treats skipped/cancelled as neither", () => {
    const kinds: RepoGradeLogEventKind[] = [
      "grade-succeeded",
      "grade-succeeded",
      "grade-failed",
      "post-succeeded",
      "post-succeeded",
      "post-succeeded",
      "post-failed",
      "scan-failed",
      "post-skipped",
      "post-cancelled",
      "binding-confirmed",
      "assignment-mapped",
    ];
    expect(summarizeRepoGradeLog(kinds.map((kind) => entry({ kind })))).toEqual({
      total: 12,
      graded: 2,
      posted: 3,
      failed: 3,
    });
  });

  it("reports all zeroes for an empty log", () => {
    expect(summarizeRepoGradeLog([])).toEqual({ total: 0, graded: 0, posted: 0, failed: 0 });
  });
});

describe("recentRepoGradeLogEntries", () => {
  const log = ["a", "b", "c", "d"].map((repo) => entry({ repo }));

  it("returns the last N NEWEST FIRST", () => {
    expect(recentRepoGradeLogEntries(log, 2).map((e) => e.repo)).toEqual(["d", "c"]);
  });

  it("returns the whole log (newest first) when it is shorter than N", () => {
    expect(recentRepoGradeLogEntries(log, 10).map((e) => e.repo)).toEqual(["d", "c", "b", "a"]);
  });

  it("returns [] for a non-positive count and never mutates the input", () => {
    expect(recentRepoGradeLogEntries(log, 0)).toEqual([]);
    expect(log.map((e) => e.repo)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("formatRepoGradeLogCsv", () => {
  it("emits the header row even for an empty log", () => {
    expect(formatRepoGradeLogCsv([])).toBe("Time,Event,Course,Repo,Folder,Canvas assignment,Score,Detail");
  });

  it("emits one row per entry, oldest first, with the human event label", () => {
    const csv = formatRepoGradeLogCsv([
      entry({ at: "2026-08-24T15:04:05.123Z", kind: "grade-succeeded", repo: "org/a", score: "18/20", detail: "Graded by openai" }),
      entry({ at: "2026-08-24T15:05:00.000Z", kind: "post-succeeded", repo: "org/a", score: "18" }),
    ]);
    expect(csv.split("\r\n")).toEqual([
      "Time,Event,Course,Repo,Folder,Canvas assignment,Score,Detail",
      "2026-08-24T15:04:05.123Z,Graded,CS 101,org/a,week-1,9001,18/20,Graded by openai",
      "2026-08-24T15:05:00.000Z,Posted to Canvas,CS 101,org/a,week-1,9001,18,",
    ]);
  });

  // L5 item 23 - an AI-written overall comment routinely contains all three
  // of these, and an unescaped one silently corrupts every later column.
  it("escapes commas, quotes and newlines in a detail field", () => {
    const csv = formatRepoGradeLogCsv([
      entry({ kind: "post-failed", detail: 'Canvas said: "bad request", line 2\nline 3' }),
    ]);
    const dataRow = csv.split("\r\n")[1];
    expect(dataRow).toContain('"Canvas said: ""bad request"", line 2\nline 3"');
    // The escaped field must not introduce a bare comma that would split it.
    expect(dataRow.startsWith("2026-08-24T15:04:05.123Z,Post failed,CS 101,org/student-a,week-1,9001,18,\"")).toBe(true);
  });
});

describe("formatRepoGradeLogJson", () => {
  it("wraps the entries in an object carrying the export metadata and the count", () => {
    const log = [entry({ repo: "org/a" })];
    const parsed = JSON.parse(
      formatRepoGradeLogJson(log, { exportedAt: "2026-08-24T16:00:00.000Z", courseId: "course-1", courseName: "CS 101" })
    );
    expect(parsed).toEqual({
      exportedAt: "2026-08-24T16:00:00.000Z",
      courseId: "course-1",
      courseName: "CS 101",
      entryCount: 1,
      entries: log,
    });
  });

  it("is an object, never a bare array, even when the log is empty", () => {
    const parsed = JSON.parse(formatRepoGradeLogJson([], { exportedAt: "x", courseId: "c", courseName: "n" }));
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed.entryCount).toBe(0);
    expect(parsed.entries).toEqual([]);
  });
});

describe("repoGradeLogFileName", () => {
  it("slugs the course name and stamps the date and time", () => {
    expect(repoGradeLogFileName("CS 101: Intro to CS", "csv", "2026-08-24T15:04:05.123Z")).toBe(
      "repo-grades-log-cs-101-intro-to-cs-20260824-150405.csv"
    );
  });

  it("uses the extension it is given", () => {
    expect(repoGradeLogFileName("CS 101", "json", "2026-08-24T15:04:05.123Z")).toBe(
      "repo-grades-log-cs-101-20260824-150405.json"
    );
  });

  // L5 item 26 - a course whose name slugs to nothing must still yield a
  // valid filename, not "repo-grades-log--20260824-150405.csv".
  it("drops the course segment entirely for a blank or punctuation-only name", () => {
    expect(repoGradeLogFileName("", "csv", "2026-08-24T15:04:05.123Z")).toBe("repo-grades-log-20260824-150405.csv");
    expect(repoGradeLogFileName("!!! ???", "csv", "2026-08-24T15:04:05.123Z")).toBe("repo-grades-log-20260824-150405.csv");
  });

  it("never emits a character that is illegal in a Windows filename", () => {
    const name = repoGradeLogFileName("CS 101 / Section 2", "csv", "2026-08-24T15:04:05.123Z");
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("falls back to a sanitised stamp for an unparseable timestamp", () => {
    const name = repoGradeLogFileName("CS 101", "csv", "not a date");
    expect(name).toBe("repo-grades-log-cs-101-not-a-date.csv");
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
  });
});
