import { describe, it, expect } from "vitest";
import {
  buildRepoGradingLogEntry,
  buildRepoGradingRunLog,
  summarizeRepoGradingRunLog,
  formatRepoGradingLogCsv,
  formatRepoGradingLogJson,
  buildRepoGradingReportMarkdown,
  repoGradingLogFileName,
  coerceRepoGradingRunLog,
  type RepoGradingLogEntry,
} from "./repo-grading-log";

const AT = "2026-08-24T15:04:05.123Z";

function entriesFor(students: Array<{ repo: string; outcome: RepoGradingLogEntry["outcome"]; reason?: string; score?: string }>) {
  return students.map((s) =>
    buildRepoGradingLogEntry({ repo: s.repo, outcome: s.outcome, reason: s.reason, score: s.score, at: AT })
  );
}

describe("buildRepoGradingLogEntry", () => {
  it("defaults reason and score to empty strings rather than undefined", () => {
    const entry = buildRepoGradingLogEntry({ repo: "org/alice", outcome: "graded", at: AT });
    expect(entry.reason).toBe("");
    expect(entry.score).toBe("");
    expect(entry.at).toBe(AT);
  });

  it("keeps whatever reason/score text it is given", () => {
    const entry = buildRepoGradingLogEntry({
      repo: "org/bob",
      outcome: "skipped",
      reason: "no folder matching week 3",
      at: AT,
    });
    expect(entry.reason).toBe("no folder matching week 3");
    expect(entry.score).toBe("");
  });
});

// ---------------------------------------------------------------------------
// R1.2 - one entry per repo attempted, including skips with their real
// reasons (not per repo graded).
// ---------------------------------------------------------------------------
describe("buildRepoGradingRunLog - R1.2 one entry per attempted repo", () => {
  it("records an entry for every attempted repo regardless of outcome, preserving the given reasons", () => {
    const entries = entriesFor([
      { repo: "org/alice", outcome: "graded", score: "9/10" },
      { repo: "org/bob", outcome: "skipped", reason: "no folder matching week 3" },
      { repo: "org/carol", outcome: "failed", reason: "GitHub rejected the token (401)." },
    ]);
    const log = buildRepoGradingRunLog(entries);

    expect(log.attempted).toBe(3);
    expect(log.entries).toHaveLength(3);
    expect(log.entries[1]).toMatchObject({ repo: "org/bob", outcome: "skipped", reason: "no folder matching week 3" });
    expect(log.entries[2]).toMatchObject({ repo: "org/carol", outcome: "failed", reason: "GitHub rejected the token (401)." });
  });

  it("defaults truncated to false and notReached to empty when not given", () => {
    const log = buildRepoGradingRunLog(entriesFor([{ repo: "org/alice", outcome: "graded" }]));
    expect(log.truncated).toBe(false);
    expect(log.notReached).toEqual([]);
  });

  // SABOTAGE CHECK (per this feature's dispatch notes): a caller could
  // silently stop pushing an entry for a skipped repo, and a log-building
  // function that "helpfully" filtered by outcome would hide that bug
  // instead of surfacing it as a too-short log. This test pins that
  // buildRepoGradingRunLog passes every given entry through untouched - it
  // was manually broken (filtering out "skipped" entries inside
  // buildRepoGradingRunLog), confirmed to turn this test red, then restored
  // to the version in this file with no other change (diffed against a
  // pre-edit backup of repo-grading-log.ts).
  it("never drops a skipped or failed entry - the log always has one entry per attempted repo", () => {
    const entries = entriesFor([
      { repo: "org/alice", outcome: "graded" },
      { repo: "org/bob", outcome: "skipped", reason: "no rubric or instructions available" },
      { repo: "org/carol", outcome: "failed", reason: "network exploded" },
    ]);
    const log = buildRepoGradingRunLog(entries);
    expect(log.entries.map((e) => e.outcome)).toEqual(["graded", "skipped", "failed"]);
    expect(log.attempted).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// R1.5 - truncated / notReached: a run cut off mid-batch must say so.
// ---------------------------------------------------------------------------
describe("buildRepoGradingRunLog - R1.5 truncation", () => {
  it("carries truncated:true and the not-reached repos when given", () => {
    const entries = entriesFor([{ repo: "org/alice", outcome: "graded" }]);
    const log = buildRepoGradingRunLog(entries, { truncated: true, notReached: ["org/bob", "org/carol"] });

    expect(log.truncated).toBe(true);
    expect(log.notReached).toEqual(["org/bob", "org/carol"]);
    // The attempted count only covers what actually finished - the
    // not-reached repos are not entries (R1.2) and must not inflate it.
    expect(log.attempted).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------
describe("summarizeRepoGradingRunLog", () => {
  it("counts graded/skipped/failed and carries truncation/not-reached through", () => {
    const entries = entriesFor([
      { repo: "org/alice", outcome: "graded" },
      { repo: "org/bob", outcome: "graded" },
      { repo: "org/carol", outcome: "skipped", reason: "no folder" },
      { repo: "org/dave", outcome: "failed", reason: "boom" },
    ]);
    const log = buildRepoGradingRunLog(entries, { truncated: true, notReached: ["org/eve"] });
    const summary = summarizeRepoGradingRunLog(log);

    expect(summary).toEqual({
      attempted: 4,
      graded: 2,
      skipped: 1,
      failed: 1,
      notReachedCount: 1,
      truncated: true,
    });
  });

  it("returns all-zero counts for an empty log", () => {
    const log = buildRepoGradingRunLog([]);
    expect(summarizeRepoGradingRunLog(log)).toEqual({
      attempted: 0,
      graded: 0,
      skipped: 0,
      failed: 0,
      notReachedCount: 0,
      truncated: false,
    });
  });
});

// ---------------------------------------------------------------------------
// CSV - reuses escapeCsvValue; a reason with a comma/quote/newline must not
// corrupt the file.
// ---------------------------------------------------------------------------
describe("formatRepoGradingLogCsv", () => {
  it("emits a header row then one row per entry", () => {
    const log = buildRepoGradingRunLog(
      entriesFor([
        { repo: "org/alice", outcome: "graded", score: "9/10" },
        { repo: "org/bob", outcome: "skipped", reason: "no folder matching week 3" },
      ])
    );
    const csv = formatRepoGradingLogCsv(log);
    const rows = csv.split("\r\n");

    expect(rows[0]).toBe("Repo,Outcome,Reason,Score,At");
    expect(rows[1]).toBe(`org/alice,Graded,,9/10,${AT}`);
    expect(rows[2]).toBe(`org/bob,Skipped,no folder matching week 3,,${AT}`);
    expect(rows).toHaveLength(3);
  });

  it("escapes a reason containing a comma, a double quote, and a newline", () => {
    const reason = 'failed, "bad" input\nsecond line';
    const log = buildRepoGradingRunLog(entriesFor([{ repo: "org/alice", outcome: "failed", reason }]));
    const csv = formatRepoGradingLogCsv(log);
    const rows = csv.split("\r\n");

    // escapeCsvValue quotes the whole field and doubles internal quotes -
    // the embedded \r\n inside the quoted field must not be mistaken for a
    // row separator by a naive split, so assert on the raw string.
    expect(csv).toContain('"failed, ""bad"" input\nsecond line"');
    expect(rows[0]).toBe("Repo,Outcome,Reason,Score,At");
  });

  it("appends a not-reached row per remaining repo when the run was truncated", () => {
    const log = buildRepoGradingRunLog(entriesFor([{ repo: "org/alice", outcome: "graded" }]), {
      truncated: true,
      notReached: ["org/bob", "org/carol"],
    });
    const csv = formatRepoGradingLogCsv(log);
    const rows = csv.split("\r\n");

    expect(rows).toHaveLength(4);
    expect(rows[2]).toBe("org/bob,Not reached,The run ended before reaching this repo.,,");
    expect(rows[3]).toBe("org/carol,Not reached,The run ended before reaching this repo.,,");
  });

  it("adds no not-reached rows when the run was not truncated, even if notReached were somehow set", () => {
    const log = buildRepoGradingRunLog(entriesFor([{ repo: "org/alice", outcome: "graded" }]), {
      truncated: false,
      notReached: ["org/bob"],
    });
    const csv = formatRepoGradingLogCsv(log);
    expect(csv.split("\r\n")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------
describe("formatRepoGradingLogJson", () => {
  it("round-trips as an object carrying entries, attempted, truncated, and notReached", () => {
    const log = buildRepoGradingRunLog(
      entriesFor([
        { repo: "org/alice", outcome: "graded", score: "9/10" },
        { repo: "org/bob", outcome: "skipped", reason: "no folder" },
      ]),
      { truncated: true, notReached: ["org/carol"] }
    );
    const json = formatRepoGradingLogJson(log, { exportedAt: "2026-08-24T16:00:00.000Z" });
    const parsed = JSON.parse(json);

    expect(parsed.exportedAt).toBe("2026-08-24T16:00:00.000Z");
    expect(parsed.attempted).toBe(2);
    expect(parsed.truncated).toBe(true);
    expect(parsed.notReached).toEqual(["org/carol"]);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0].repo).toBe("org/alice");
  });
});

// ---------------------------------------------------------------------------
// R1.4 - the Markdown report body (built here so vitest can reach the exact
// wording without going through saveRecordingFile).
// ---------------------------------------------------------------------------
describe("buildRepoGradingReportMarkdown", () => {
  it("includes the title, counts, and one line per entry", () => {
    const log = buildRepoGradingRunLog(
      entriesFor([
        { repo: "org/alice", outcome: "graded", score: "9/10" },
        { repo: "org/bob", outcome: "skipped", reason: "no folder matching week 3" },
        { repo: "org/carol", outcome: "failed", reason: "network exploded" },
      ])
    );
    const md = buildRepoGradingReportMarkdown(log, { title: "CS 101 repo grading", generatedAt: "2026-08-24T16:00:00.000Z" });

    expect(md).toContain("# CS 101 repo grading");
    expect(md).toContain("Generated 2026-08-24T16:00:00.000Z");
    expect(md).toContain("Attempted 3 repo(s): 1 graded, 1 skipped, 1 failed.");
    expect(md).toContain("**org/alice**: Graded - score 9/10");
    expect(md).toContain("**org/bob**: Skipped - no folder matching week 3");
    expect(md).toContain("**org/carol**: Failed - network exploded");
  });

  it("still produces a report when nothing was graded (every repo skipped) - R1.1/R1.4's whole point", () => {
    const log = buildRepoGradingRunLog(
      entriesFor([
        { repo: "org/alice", outcome: "skipped", reason: "no folder matching week 3" },
        { repo: "org/bob", outcome: "skipped", reason: "no folder matching week 3" },
      ])
    );
    const md = buildRepoGradingReportMarkdown(log, { title: "CS 101 repo grading", generatedAt: AT });
    expect(md).toContain("Attempted 2 repo(s): 0 graded, 2 skipped, 0 failed.");
  });

  it("names every not-reached repo when the run was truncated, so silence never reads as \"there were none\"", () => {
    const log = buildRepoGradingRunLog(entriesFor([{ repo: "org/alice", outcome: "graded" }]), {
      truncated: true,
      notReached: ["org/bob", "org/carol"],
    });
    const md = buildRepoGradingReportMarkdown(log, { title: "CS 101 repo grading", generatedAt: AT });

    expect(md).toContain("The run ended before reaching 2 more repo(s):");
    expect(md).toContain("- org/bob");
    expect(md).toContain("- org/carol");
  });

  it("adds no truncation section when the run completed", () => {
    const log = buildRepoGradingRunLog(entriesFor([{ repo: "org/alice", outcome: "graded" }]));
    const md = buildRepoGradingReportMarkdown(log, { title: "CS 101 repo grading", generatedAt: AT });
    expect(md).not.toContain("ended before reaching");
  });
});

// ---------------------------------------------------------------------------
// Filename
// ---------------------------------------------------------------------------
describe("repoGradingLogFileName", () => {
  it("slugifies the name and stamps the timestamp", () => {
    expect(repoGradingLogFileName("CS 101", "md", AT)).toBe("repo-grading-log-cs-101-20260824-150405.md");
  });

  it("drops the name segment entirely when it slugifies to nothing", () => {
    expect(repoGradingLogFileName("!!!", "csv", AT)).toBe("repo-grading-log-20260824-150405.csv");
  });
});

// ---------------------------------------------------------------------------
// Defensive parsing (never trust stored data) - used by grading-drafts.ts.
// ---------------------------------------------------------------------------
describe("coerceRepoGradingRunLog", () => {
  it("returns undefined for null/undefined/non-object input", () => {
    expect(coerceRepoGradingRunLog(null)).toBeUndefined();
    expect(coerceRepoGradingRunLog(undefined)).toBeUndefined();
    expect(coerceRepoGradingRunLog("nope")).toBeUndefined();
  });

  it("round-trips a well-formed log", () => {
    const log = buildRepoGradingRunLog(entriesFor([{ repo: "org/alice", outcome: "graded", score: "9/10" }]), {
      truncated: true,
      notReached: ["org/bob"],
    });
    const raw = JSON.parse(JSON.stringify(log));
    const coerced = coerceRepoGradingRunLog(raw);
    expect(coerced).toEqual(log);
  });

  it("drops a malformed entry (bad outcome, missing repo) without throwing", () => {
    const coerced = coerceRepoGradingRunLog({
      entries: [
        { repo: "org/alice", outcome: "graded", reason: "", score: "9/10", at: AT },
        { repo: "org/bob", outcome: "not-a-real-outcome", reason: "", score: "", at: AT },
        { outcome: "skipped", reason: "no repo field", score: "", at: AT },
      ],
      attempted: 3,
      truncated: false,
      notReached: [],
    });
    expect(coerced?.entries).toHaveLength(1);
    expect(coerced?.entries[0].repo).toBe("org/alice");
  });

  it("defaults entries/notReached to empty and truncated to false when absent", () => {
    const coerced = coerceRepoGradingRunLog({});
    expect(coerced).toEqual({ entries: [], attempted: 0, truncated: false, notReached: [] });
  });

  it("filters non-string entries out of notReached", () => {
    const coerced = coerceRepoGradingRunLog({ notReached: ["org/alice", 42, null, "org/bob"] });
    expect(coerced?.notReached).toEqual(["org/alice", "org/bob"]);
  });
});
