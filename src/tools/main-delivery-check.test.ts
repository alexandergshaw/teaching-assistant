import { describe, expect, it } from "vitest";
import { checkMainDelivery } from "./main-delivery-check.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const candidate = "a".repeat(40), remote = "b".repeat(40);
function runner(options: { unpublished?: boolean; offline?: boolean; missing?: boolean; moved?: boolean } = {}) {
  let calls = 0;
  return (args: string[]) => {
    if (args[0] === "rev-parse") return candidate;
    if (args[0] === "ls-remote") {
      if (options.offline) throw new Error("offline");
      calls++;
      return `${options.moved && calls > 1 ? "c".repeat(40) : remote}\trefs/heads/main\n`;
    }
    if (args[0] === "cat-file" && options.missing) throw new Error("missing");
    if (args[0] === "merge-base" && options.unpublished) throw new Error("not ancestor");
    return "";
  };
}
describe("ordinary main delivery check", () => {
  it("accepts a candidate proven on a stable live main", () => expect(checkMainDelivery(candidate, runner())).toEqual({ candidate, remote }));
  it("fails closed for unpublished, offline, missing or moving remote", () => {
    expect(() => checkMainDelivery(candidate, runner({ unpublished: true }))).toThrow("pending-main");
    expect(() => checkMainDelivery(candidate, runner({ offline: true }))).toThrow("Cannot verify live");
    expect(() => checkMainDelivery(candidate, runner({ missing: true }))).toThrow("unavailable locally");
    expect(() => checkMainDelivery(candidate, runner({ moved: true }))).toThrow("moved during");
  });
  it("requires an explicit full commit", () => expect(() => checkMainDelivery("abc", runner())).toThrow("full 40-character"));
  it("refuses nonempty grafts before assessing ancestry", () => {
    expect(() => checkMainDelivery(candidate, runner(), () => "legacy graft")).toThrow("grafts alter ancestry");
  });
  it("refuses an inherited graft-file override", () => {
    const previous = process.env.GIT_GRAFT_FILE;
    try {
      process.env.GIT_GRAFT_FILE = "alternate-grafts";
      expect(() => checkMainDelivery(candidate, runner())).toThrow("GIT_GRAFT_FILE");
    } finally {
      if (previous === undefined) delete process.env.GIT_GRAFT_FILE;
      else process.env.GIT_GRAFT_FILE = previous;
    }
  });
  it("ignores replace refs in a real divergent history", () => {
    const dir = mkdtempSync(join(tmpdir(), "delivery-check-"));
    const command = (args: string[], cwd = dir) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.org", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.org" } }).trim();
    try {
      command(["init", "-b", "main"]);
      const tree = command(["mktree"], dir);
      const base = command(["commit-tree", tree, "-m", "base"]);
      const local = command(["commit-tree", tree, "-p", base, "-m", "candidate"]);
      const upstream = command(["commit-tree", tree, "-p", base, "-m", "upstream"]);
      command(["update-ref", "refs/heads/main", upstream]);
      command(["init", "--bare", join(dir, "remote.git")]);
      command(["remote", "add", "origin", join(dir, "remote.git")]);
      command(["push", "origin", "main"]);
      const replacement = command(["commit-tree", tree, "-p", local, "-m", "replacement"]);
      command(["replace", upstream, replacement]);
      let failure = "";
      try { execFileSync(process.execPath, [resolve("src/tools/main-delivery-check.mjs"), local], { cwd: dir, encoding: "utf8", stdio: "pipe" }); }
      catch (error) { failure = String((error as { stderr?: string }).stderr ?? ""); }
      expect(failure).toContain("pending-main");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
