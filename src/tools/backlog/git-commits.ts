// The only place in src/tools/backlog/ that shells out to git (see
// shipped-uncited.ts's header for why the flagging logic itself stays pure
// and git-free). This module's whole job is: read recent commit history and
// hand back plain data, failing OPEN on every error path - a crashing Stop
// hook is worse than a guard that occasionally has nothing to check
// (docs/backlog-reconciliation-2026-09-21.md section 6.4, "New dependency").
//
// HISTORY BOUND. `--since="14 days ago"`, not `--max-count`. Measured on
// this repo on 2026-09-22 (HEAD at 1807 total commits):
//   git log --since="14 days ago" --name-only --format=...   -> 0.275s, 329 commits
//   git log --max-count=500       --name-only --format=...   -> 1.609s, 500 commits
// A date bound stays cheap as this repo's total history keeps growing,
// where a commit-count bound's cost does not; 14 days is ample for a
// per-turn check (the reconciliation report's own dry run used an 8-day
// window and caught every row a full audit found).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { WorkCommit } from "./shipped-uncited";

const HISTORY_BOUND = "14 days ago";
const RECORD_SEP = "\x1e";
const FIELD_SEP = "\x1f";

export interface RecentWorkCommits {
  commits: WorkCommit[];
  /** Non-null means the read failed and was skipped - never thrown. Callers must treat this as "nothing to check", not as an error to surface loudly. */
  warning: string | null;
}

function parseGitLog(raw: string): WorkCommit[] {
  // The format string opens every record with RECORD_SEP, so the first
  // split chunk (anything before the very first commit) is always empty.
  const records = raw.split(RECORD_SEP).slice(1);
  const commits: WorkCommit[] = [];
  for (const record of records) {
    const newlineIndex = record.indexOf("\n");
    const header = newlineIndex === -1 ? record : record.slice(0, newlineIndex);
    const body = newlineIndex === -1 ? "" : record.slice(newlineIndex + 1);
    const fields = header.split(FIELD_SEP);
    const hash = fields[0];
    const subject = fields.slice(2).join(FIELD_SEP);
    if (!hash) continue;
    const files = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    commits.push({ hash, subject, files });
  }
  return commits;
}

/**
 * Reads recent commit history for the shipped-uncited check. FAILS OPEN:
 * missing `.git`, a missing/broken `git` binary, or any other error all
 * return an empty commit list plus a plain warning string, never a thrown
 * error - this is the first backlog tool to spawn a subprocess, and the
 * Stop hook that calls it must never be able to crash because of it.
 */
export function readRecentWorkCommits(cwd: string = process.cwd()): RecentWorkCommits {
  try {
    if (!existsSync(resolve(cwd, ".git"))) {
      return { commits: [], warning: "shipped-uncited check skipped: no .git directory found" };
    }
    const raw = execFileSync(
      "git",
      ["log", `--since=${HISTORY_BOUND}`, "--name-only", `--format=${RECORD_SEP}%h${FIELD_SEP}%aI${FIELD_SEP}%s`],
      { cwd, encoding: "utf-8" },
    );
    return { commits: parseGitLog(raw), warning: null };
  } catch (err) {
    return {
      commits: [],
      warning: `shipped-uncited check skipped: git log failed (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

// Exported for a fixture-driven unit test that never spawns git - see
// git-commits.test.ts's "parseGitLog" block.
export { parseGitLog };
