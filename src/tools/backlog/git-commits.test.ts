import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readRecentWorkCommits, parseGitLog } from "./git-commits";

const RECORD_SEP = "\x1e";
const FIELD_SEP = "\x1f";

describe("parseGitLog (fixture text, no git spawn)", () => {
  it("parses a single commit with two touched files", () => {
    const raw =
      `${RECORD_SEP}832e9d3${FIELD_SEP}2026-09-20T10:00:00-05:00${FIELD_SEP}fix(a30): route the per-cell path\n` +
      `src/lib/grade/x.ts\n` +
      `src/lib/grade/y.ts\n`;
    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(1);
    expect(commits[0].hash).toBe("832e9d3");
    expect(commits[0].subject).toBe("fix(a30): route the per-cell path");
    expect(commits[0].files).toEqual(["src/lib/grade/x.ts", "src/lib/grade/y.ts"]);
  });

  it("parses multiple commits in one pass", () => {
    const raw =
      `${RECORD_SEP}aaa1111${FIELD_SEP}2026-09-20T10:00:00-05:00${FIELD_SEP}first\n` +
      `docs/backlog.yml\n` +
      `${RECORD_SEP}bbb2222${FIELD_SEP}2026-09-21T10:00:00-05:00${FIELD_SEP}second\n` +
      `src/x.ts\n`;
    const commits = parseGitLog(raw);
    expect(commits.map((c) => c.hash)).toEqual(["aaa1111", "bbb2222"]);
  });

  it("handles a commit with no touched files (empty commit)", () => {
    const raw = `${RECORD_SEP}ccc3333${FIELD_SEP}2026-09-20T10:00:00-05:00${FIELD_SEP}empty\n`;
    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(1);
    expect(commits[0].files).toEqual([]);
  });

  it("keeps a colon or field-separator-adjacent subject text intact", () => {
    const raw = `${RECORD_SEP}ddd4444${FIELD_SEP}2026-09-20T10:00:00-05:00${FIELD_SEP}fix(a1): does a thing: twice\n` + `src/a.ts\n`;
    const commits = parseGitLog(raw);
    expect(commits[0].subject).toBe("fix(a1): does a thing: twice");
  });

  it("returns an empty list for empty input", () => {
    expect(parseGitLog("")).toEqual([]);
  });
});

describe("readRecentWorkCommits (fails open, real filesystem)", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "shipped-uncited-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  // FAIL-OPEN PATH 1: no .git directory at all.
  it("fails open with a warning and no commits when .git is missing", () => {
    const dir = makeTempDir();
    const result = readRecentWorkCommits(dir);
    expect(result.commits).toEqual([]);
    expect(result.warning).toContain("no .git directory found");
  });

  // FAIL-OPEN PATH 2: a .git path exists but is not a usable repository, so
  // the git invocation itself throws - this must not propagate.
  it("fails open with a warning and no commits when git itself errors", () => {
    const dir = makeTempDir();
    // A `.git` that is a plain file (not a real repo) satisfies the
    // existence check but makes any git command in this cwd fail.
    writeFileSync(join(dir, ".git"), "not a real git dir");
    const result = readRecentWorkCommits(dir);
    expect(result.commits).toEqual([]);
    expect(result.warning).toBeTruthy();
    expect(result.warning).toContain("git log failed");
  });

  // THE REAL PATH: a genuine tiny repo, built here so the test's meaning
  // never depends on this project's own history.
  it("reads a real commit's hash, subject and files from a fixture repo", () => {
    const dir = makeTempDir();
    execFileSync("git", ["init", "--quiet"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "x.ts"), "export {};\n");
    execFileSync("git", ["add", "src/x.ts"], { cwd: dir });
    execFileSync("git", ["commit", "--quiet", "-m", "fix(a30): route the per-cell path"], { cwd: dir });

    const result = readRecentWorkCommits(dir);
    expect(result.warning).toBeNull();
    expect(result.commits).toHaveLength(1);
    expect(result.commits[0].subject).toBe("fix(a30): route the per-cell path");
    expect(result.commits[0].files).toEqual(["src/x.ts"]);
    expect(result.commits[0].hash).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it("excludes a commit older than the history bound", () => {
    const dir = makeTempDir();
    execFileSync("git", ["init", "--quiet"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
    writeFileSync(join(dir, "x.ts"), "export {};\n");
    execFileSync("git", ["add", "x.ts"], { cwd: dir });
    execFileSync(
      "git",
      ["commit", "--quiet", "--date=2020-01-01T00:00:00", "-m", "old commit"],
      { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: "2020-01-01T00:00:00", GIT_COMMITTER_DATE: "2020-01-01T00:00:00" } },
    );
    const result = readRecentWorkCommits(dir);
    expect(result.commits).toEqual([]);
  });
});
