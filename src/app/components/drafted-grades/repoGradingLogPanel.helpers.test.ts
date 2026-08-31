import { describe, it, expect } from "vitest";
import { hasRepoGradingLog, repoGradingLogSummaryLine, repoGradingLogTruncationNote } from "./repoGradingLogPanel.helpers";
import { buildRepoGradingLogEntry, buildRepoGradingRunLog, type RepoGradingRunLog } from "@/lib/repo-grading-log";
import type { GradingDraftPayload } from "@/lib/grading-drafts";

const AT = "2026-08-24T15:04:05.123Z";

function payloadWithLog(log?: RepoGradingRunLog): GradingDraftPayload {
  return log ? { runs: [], repoGradingLog: log } : { runs: [] };
}

describe("hasRepoGradingLog", () => {
  it("is false for a draft payload with no repoGradingLog at all (an older draft, or a non-repo source)", () => {
    expect(hasRepoGradingLog(payloadWithLog())).toBe(false);
  });

  it("is true once repoGradingLog is present, even with zero entries", () => {
    const log = buildRepoGradingRunLog([]);
    expect(hasRepoGradingLog(payloadWithLog(log))).toBe(true);
  });

  it("narrows the type so payload.repoGradingLog is usable without a further cast", () => {
    const log = buildRepoGradingRunLog([
      buildRepoGradingLogEntry({ repo: "org/alice", outcome: "graded", score: "9/10", at: AT }),
    ]);
    const payload = payloadWithLog(log);
    if (hasRepoGradingLog(payload)) {
      expect(payload.repoGradingLog.entries).toHaveLength(1);
    } else {
      throw new Error("expected hasRepoGradingLog to be true");
    }
  });
});

describe("repoGradingLogSummaryLine - R1.2 states the full outcome split", () => {
  it("names attempted/graded/skipped/failed even when nothing was skipped or failed", () => {
    const log = buildRepoGradingRunLog([
      buildRepoGradingLogEntry({ repo: "org/alice", outcome: "graded", score: "9/10", at: AT }),
      buildRepoGradingLogEntry({ repo: "org/bob", outcome: "graded", score: "8/10", at: AT }),
    ]);
    expect(repoGradingLogSummaryLine(log)).toBe("2 repos attempted - 2 graded, 0 skipped, 0 no submission, 0 failed.");
  });

  it("surfaces skips and failures rather than only the graded count - the exact gap R1.1 names", () => {
    const log = buildRepoGradingRunLog([
      buildRepoGradingLogEntry({ repo: "org/alice", outcome: "graded", score: "9/10", at: AT }),
      buildRepoGradingLogEntry({ repo: "org/bob", outcome: "skipped", reason: "no matching folder", at: AT }),
      buildRepoGradingLogEntry({ repo: "org/carol", outcome: "failed", reason: "fetch failed", at: AT }),
    ]);
    expect(repoGradingLogSummaryLine(log)).toBe("3 repos attempted - 1 graded, 1 skipped, 0 no submission, 1 failed.");
  });

  // FIX 2: a repo with nothing submitted counts in its own bucket - never
  // silently absorbed into "skipped" (a precondition failure, distinct from
  // an empty-but-reached folder) - and the four numbers must still sum to
  // the attempted count.
  it("names the no-submission count separately from skipped and failed", () => {
    const log = buildRepoGradingRunLog([
      buildRepoGradingLogEntry({ repo: "org/alice", outcome: "graded", score: "9/10", at: AT }),
      buildRepoGradingLogEntry({ repo: "org/bob", outcome: "no-submission", reason: "nothing was submitted", at: AT }),
      buildRepoGradingLogEntry({ repo: "org/carol", outcome: "skipped", reason: "no matching folder", at: AT }),
      buildRepoGradingLogEntry({ repo: "org/dave", outcome: "failed", reason: "fetch failed", at: AT }),
    ]);
    expect(repoGradingLogSummaryLine(log)).toBe("4 repos attempted - 1 graded, 1 skipped, 1 no submission, 1 failed.");
  });

  it("singularises 'repo' for a single attempt", () => {
    const log = buildRepoGradingRunLog([
      buildRepoGradingLogEntry({ repo: "org/alice", outcome: "graded", score: "9/10", at: AT }),
    ]);
    expect(repoGradingLogSummaryLine(log)).toBe("1 repo attempted - 1 graded, 0 skipped, 0 no submission, 0 failed.");
  });

  it("reads '0 repos attempted' rather than throwing on an empty log", () => {
    const log = buildRepoGradingRunLog([]);
    expect(repoGradingLogSummaryLine(log)).toBe("0 repos attempted - 0 graded, 0 skipped, 0 no submission, 0 failed.");
  });
});

describe("repoGradingLogTruncationNote - R1.5 a cut-off run must say so", () => {
  it("is null for a complete run, so the panel adds nothing extra for the common case", () => {
    const log = buildRepoGradingRunLog([
      buildRepoGradingLogEntry({ repo: "org/alice", outcome: "graded", score: "9/10", at: AT }),
    ]);
    expect(repoGradingLogTruncationNote(log)).toBeNull();
  });

  it("names the count of not-reached repos when truncated", () => {
    const log = buildRepoGradingRunLog(
      [buildRepoGradingLogEntry({ repo: "org/alice", outcome: "graded", score: "9/10", at: AT })],
      { truncated: true, notReached: ["org/bob", "org/carol", "org/dave"] }
    );
    expect(repoGradingLogTruncationNote(log)).toBe("The run ended before reaching 3 more repos.");
  });

  it("singularises for exactly one not-reached repo", () => {
    const log = buildRepoGradingRunLog(
      [buildRepoGradingLogEntry({ repo: "org/alice", outcome: "graded", score: "9/10", at: AT })],
      { truncated: true, notReached: ["org/bob"] }
    );
    expect(repoGradingLogTruncationNote(log)).toBe("The run ended before reaching 1 more repo.");
  });

  it("falls back to a generic note when truncated is true but notReached is empty (names unknown)", () => {
    const log = buildRepoGradingRunLog(
      [buildRepoGradingLogEntry({ repo: "org/alice", outcome: "graded", score: "9/10", at: AT })],
      { truncated: true, notReached: [] }
    );
    expect(repoGradingLogTruncationNote(log)).toBe("The run ended before reaching the rest of the repos.");
  });
});
