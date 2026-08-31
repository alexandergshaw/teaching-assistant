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

function entriesFor(
  students: Array<{
    repo: string;
    outcome: RepoGradingLogEntry["outcome"];
    reason?: string;
    score?: string;
    digestTruncated?: boolean;
  }>
) {
  return students.map((s) =>
    buildRepoGradingLogEntry({
      repo: s.repo,
      outcome: s.outcome,
      reason: s.reason,
      score: s.score,
      at: AT,
      digestTruncated: s.digestTruncated,
    })
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

  // Entry 344: gradeRepoAction returns digestTruncated - whether the ingest
  // hit its cap collecting this repo's folder - and it used to be dropped
  // entirely on the floor by every workflow grading path.
  it("defaults digestTruncated to false when not given", () => {
    const entry = buildRepoGradingLogEntry({ repo: "org/alice", outcome: "graded", at: AT });
    expect(entry.digestTruncated).toBe(false);
  });

  it("carries digestTruncated:true through when given", () => {
    const entry = buildRepoGradingLogEntry({ repo: "org/alice", outcome: "graded", at: AT, digestTruncated: true });
    expect(entry.digestTruncated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Entry 344 gap: a graded repo's own digest can be truncated (the folder
// ingest hit its cap) - a fact distinct from the outcome. This is NOT a
// fourth outcome and NOT text stuffed into `reason` (whose meaning R1.2 fixes
// as "the reason for anything that is NOT graded").
// ---------------------------------------------------------------------------
describe("digestTruncated - graded-but-truncated stays distinguishable from graded", () => {
  it("a graded-but-truncated repo keeps outcome \"graded\" while carrying the truncation fact", () => {
    const entry = buildRepoGradingLogEntry({
      repo: "org/alice",
      outcome: "graded",
      score: "9/10",
      at: AT,
      digestTruncated: true,
    });
    expect(entry.outcome).toBe("graded");
    expect(entry.score).toBe("9/10");
    expect(entry.digestTruncated).toBe(true);
    // The outcome enum itself is untouched - still exactly the three R1.2
    // values, never a fourth "graded-partial" kind.
    expect(["graded", "skipped", "failed"]).toContain(entry.outcome);
  });

  // SABOTAGE CHECK: this test was manually broken by making
  // buildRepoGradingLogEntry ignore its digestTruncated option (always
  // returning false), confirmed to turn this test red, then restored to the
  // version in this file with no other change - diffed against a backup of
  // repo-grading-log.ts taken before any edit in this chunk, with `git diff
  // --no-index` against that backup showing no difference after the restore.
  it("distinguishes a graded-but-truncated repo from a graded-and-complete one with the same outcome and score", () => {
    const complete = buildRepoGradingLogEntry({ repo: "org/alice", outcome: "graded", score: "9/10", at: AT });
    const truncated = buildRepoGradingLogEntry({
      repo: "org/bob",
      outcome: "graded",
      score: "9/10",
      at: AT,
      digestTruncated: true,
    });
    expect(complete.outcome).toBe(truncated.outcome);
    expect(complete.score).toBe(truncated.score);
    expect(complete.digestTruncated).toBe(false);
    expect(truncated.digestTruncated).toBe(true);
    expect(complete.digestTruncated).not.toBe(truncated.digestTruncated);
  });

  it("summarizeRepoGradingRunLog counts only truncated GRADED entries, not skipped/failed ones", () => {
    const log = buildRepoGradingRunLog(
      entriesFor([
        { repo: "org/alice", outcome: "graded", digestTruncated: true },
        { repo: "org/bob", outcome: "graded", digestTruncated: false },
        { repo: "org/carol", outcome: "skipped", reason: "no folder", digestTruncated: true },
        { repo: "org/dave", outcome: "failed", reason: "no result returned", digestTruncated: true },
      ])
    );
    const summary = summarizeRepoGradingRunLog(log);
    expect(summary.digestTruncatedGraded).toBe(1);
    expect(summary.graded).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// The run-level truncation (RepoGradingRunLog.truncated/notReached, R1.5) and
// the per-repo digestTruncated must coexist - neither one can crowd the other
// out of the same run's record.
// ---------------------------------------------------------------------------
describe("run-level truncation and per-repo digestTruncated coexist", () => {
  it("a run that stopped short AND graded a repo on partial input carries both facts, neither lost", () => {
    const log = buildRepoGradingRunLog(
      entriesFor([{ repo: "org/alice", outcome: "graded", score: "9/10", digestTruncated: true }]),
      { truncated: true, notReached: ["org/bob"] }
    );

    // The run-level fact.
    expect(log.truncated).toBe(true);
    expect(log.notReached).toEqual(["org/bob"]);
    // The per-repo fact, on the one entry that was actually attempted.
    expect(log.entries[0].digestTruncated).toBe(true);

    const summary = summarizeRepoGradingRunLog(log);
    expect(summary.truncated).toBe(true);
    expect(summary.notReachedCount).toBe(1);
    expect(summary.digestTruncatedGraded).toBe(1);
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
      noSubmission: 0,
      notReachedCount: 1,
      truncated: true,
      digestTruncatedGraded: 0,
    });
  });

  it("returns all-zero counts for an empty log", () => {
    const log = buildRepoGradingRunLog([]);
    expect(summarizeRepoGradingRunLog(log)).toEqual({
      attempted: 0,
      graded: 0,
      skipped: 0,
      failed: 0,
      noSubmission: 0,
      notReachedCount: 0,
      truncated: false,
      digestTruncatedGraded: 0,
    });
  });

  // The live defect fix: a repo with nothing submitted must count in its OWN
  // bucket - never silently folded into "skipped" (a precondition failure,
  // e.g. no matching folder) or "failed" (an error) - see the
  // RepoGradingOutcome doc comment in repo-grading-log.ts.
  it("counts a no-submission entry in its own bucket, distinct from skipped and failed", () => {
    const entries = entriesFor([
      { repo: "org/alice", outcome: "graded" },
      { repo: "org/bob", outcome: "no-submission", reason: "nothing was submitted" },
      { repo: "org/carol", outcome: "skipped", reason: "no folder" },
      { repo: "org/dave", outcome: "failed", reason: "boom" },
    ]);
    const log = buildRepoGradingRunLog(entries);
    const summary = summarizeRepoGradingRunLog(log);

    expect(summary.noSubmission).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.graded).toBe(1);
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

    expect(rows[0]).toBe("Repo,Outcome,Reason,Score,Digest truncated,At");
    expect(rows[1]).toBe(`org/alice,Graded,,9/10,No,${AT}`);
    expect(rows[2]).toBe(`org/bob,Skipped,no folder matching week 3,,No,${AT}`);
    expect(rows).toHaveLength(3);
  });

  // Entry 344's per-repo fact: a graded repo whose ingest hit its folder cap
  // must be distinguishable in the exported CSV, not just in memory.
  it("marks a graded-but-truncated repo's row with Digest truncated = Yes", () => {
    const log = buildRepoGradingRunLog(
      entriesFor([{ repo: "org/alice", outcome: "graded", score: "9/10", digestTruncated: true }])
    );
    const csv = formatRepoGradingLogCsv(log);
    const rows = csv.split("\r\n");

    expect(rows[1]).toBe(`org/alice,Graded,,9/10,Yes,${AT}`);
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
    expect(rows[0]).toBe("Repo,Outcome,Reason,Score,Digest truncated,At");
  });

  it("labels a no-submission entry distinctly from Skipped and Failed", () => {
    const log = buildRepoGradingRunLog(
      entriesFor([{ repo: "org/alice", outcome: "no-submission", reason: "nothing was submitted" }])
    );
    const csv = formatRepoGradingLogCsv(log);
    const rows = csv.split("\r\n");
    expect(rows[1]).toBe(`org/alice,No submission,nothing was submitted,,No,${AT}`);
  });

  it("appends a not-reached row per remaining repo when the run was truncated", () => {
    const log = buildRepoGradingRunLog(entriesFor([{ repo: "org/alice", outcome: "graded" }]), {
      truncated: true,
      notReached: ["org/bob", "org/carol"],
    });
    const csv = formatRepoGradingLogCsv(log);
    const rows = csv.split("\r\n");

    expect(rows).toHaveLength(4);
    expect(rows[2]).toBe("org/bob,Not reached,The run ended before reaching this repo.,,,");
    expect(rows[3]).toBe("org/carol,Not reached,The run ended before reaching this repo.,,,");
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
    expect(md).toContain("Attempted 3 repo(s): 1 graded, 1 skipped, 1 failed, 0 no submission.");
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
    expect(md).toContain("Attempted 2 repo(s): 0 graded, 2 skipped, 0 failed, 0 no submission.");
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

  // The live defect fix: a report must say, in its own line, how many repos
  // had nothing submitted - not silently absorbed into the generic count
  // sentence, and never invented when the count is zero (mirrors the
  // existing digestTruncatedGraded pattern immediately above).
  it("adds a no-submission line naming the count when at least one repo had nothing submitted", () => {
    const log = buildRepoGradingRunLog(
      entriesFor([
        { repo: "org/alice", outcome: "graded", score: "9/10" },
        { repo: "org/bob", outcome: "no-submission", reason: "nothing was submitted" },
      ])
    );
    const md = buildRepoGradingReportMarkdown(log, { title: "CS 101 repo grading", generatedAt: AT });

    // S2 (verification finding): the headline used to undercount by omitting
    // no-submission entirely, so these four numbers did not sum to
    // "Attempted 2" on this exact log. This assertion cements the fixed,
    // reconciling headline rather than the undercount.
    expect(md).toContain("Attempted 2 repo(s): 1 graded, 0 skipped, 0 failed, 1 no submission.");
    expect(md).toContain("1 repo(s) had nothing submitted");
    expect(md).toContain("**org/bob**: No submission - nothing was submitted");
  });

  // S2 (verification finding): pins the FACT (the four printed numbers
  // reconcile with `attempted`), not just the exact wording pinned above -
  // this is the assertion that would have caught the original undercount
  // (which was arithmetically wrong: "Attempted 2: 1 graded, 0 skipped, 0
  // failed" sums to 1, not 2) even if the sentence's phrasing changes later.
  it("the four printed outcome counts always sum to the printed attempted count", () => {
    const log = buildRepoGradingRunLog(
      entriesFor([
        { repo: "org/alice", outcome: "graded", score: "9/10" },
        { repo: "org/bob", outcome: "no-submission", reason: "nothing was submitted" },
        { repo: "org/carol", outcome: "skipped", reason: "no folder matching week 3" },
        { repo: "org/dave", outcome: "failed", reason: "network exploded" },
      ])
    );
    const summary = summarizeRepoGradingRunLog(log);
    const md = buildRepoGradingReportMarkdown(log, { title: "CS 101 repo grading", generatedAt: AT });

    const headline = md.split("\n").find((line) => line.startsWith("Attempted "));
    expect(headline).toBeDefined();
    const match = headline!.match(
      /^Attempted (\d+) repo\(s\): (\d+) graded, (\d+) skipped, (\d+) failed, (\d+) no submission\.$/
    );
    expect(match).not.toBeNull();
    const [, attempted, graded, skipped, failed, noSubmission] = match!.map(Number);
    expect(attempted).toBe(summary.attempted);
    expect(graded + skipped + failed + noSubmission).toBe(attempted);
  });

  it("does not invent a no-submission line when nothing had that outcome", () => {
    const log = buildRepoGradingRunLog(entriesFor([{ repo: "org/alice", outcome: "graded", score: "9/10" }]));
    const md = buildRepoGradingReportMarkdown(log, { title: "CS 101 repo grading", generatedAt: AT });
    expect(md).not.toContain("nothing submitted");
  });

  // Entry 344's per-repo fact, reaching the one place an instructor with no
  // one watching an unattended run would actually see it.
  it("mentions how many repos were graded on partial input when at least one was", () => {
    const log = buildRepoGradingRunLog(
      entriesFor([
        { repo: "org/alice", outcome: "graded", score: "9/10", digestTruncated: true },
        { repo: "org/bob", outcome: "graded", score: "8/10" },
      ])
    );
    const md = buildRepoGradingReportMarkdown(log, { title: "CS 101 repo grading", generatedAt: AT });

    expect(md).toContain("1 of the graded repo(s) were graded on partial input");
    expect(md).toContain("**org/alice**: Graded - score 9/10 - partial input - folder digest truncated");
    // The complete repo's own line must not pick up the same note.
    expect(md).toContain("**org/bob**: Graded - score 8/10");
    expect(md).not.toContain("**org/bob**: Graded - score 8/10 - partial input");
  });

  // TESTS requirement: silence when absent - a report must never invent a
  // partial-input line for a run where nothing was truncated.
  it("does not invent a partial-input line when no repo was graded on partial input", () => {
    const log = buildRepoGradingRunLog(
      entriesFor([{ repo: "org/alice", outcome: "graded", score: "9/10", digestTruncated: false }])
    );
    const md = buildRepoGradingReportMarkdown(log, { title: "CS 101 repo grading", generatedAt: AT });

    expect(md).not.toContain("graded on partial input");
    expect(md).not.toContain("partial input - folder digest truncated");
  });

  // The two truncations (run-level and per-repo) must both surface, and
  // distinctly - never merged into one statement that would point an
  // instructor at the wrong budget to raise.
  it("reports the run-level truncation and the per-repo digest truncation as separate, both-present facts", () => {
    const log = buildRepoGradingRunLog(
      entriesFor([{ repo: "org/alice", outcome: "graded", score: "9/10", digestTruncated: true }]),
      { truncated: true, notReached: ["org/bob"] }
    );
    const md = buildRepoGradingReportMarkdown(log, { title: "CS 101 repo grading", generatedAt: AT });

    expect(md).toContain("1 of the graded repo(s) were graded on partial input");
    expect(md).toContain("The run ended before reaching 1 more repo(s):");
    expect(md).toContain("- org/bob");
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

  it("round-trips a no-submission entry (does not drop it as an unrecognized outcome)", () => {
    const log = buildRepoGradingRunLog(entriesFor([{ repo: "org/alice", outcome: "no-submission", reason: "nothing was submitted" }]));
    const raw = JSON.parse(JSON.stringify(log));
    const coerced = coerceRepoGradingRunLog(raw);
    expect(coerced?.entries).toHaveLength(1);
    expect(coerced?.entries[0].outcome).toBe("no-submission");
  });

  it("filters non-string entries out of notReached", () => {
    const coerced = coerceRepoGradingRunLog({ notReached: ["org/alice", 42, null, "org/bob"] });
    expect(coerced?.notReached).toEqual(["org/alice", "org/bob"]);
  });

  it("coerces digestTruncated to a real boolean and defaults it to false when absent", () => {
    const coerced = coerceRepoGradingRunLog({
      entries: [
        { repo: "org/alice", outcome: "graded", reason: "", score: "9/10", at: AT, digestTruncated: true },
        { repo: "org/bob", outcome: "graded", reason: "", score: "8/10", at: AT },
      ],
    });
    expect(coerced?.entries[0].digestTruncated).toBe(true);
    expect(coerced?.entries[1].digestTruncated).toBe(false);
  });
});
