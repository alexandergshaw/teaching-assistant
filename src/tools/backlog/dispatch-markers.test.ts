import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readDispatchMarkerState,
  touchStopMarker,
  touchDispatchMarker,
  readMarkerState,
} from "./dispatch-markers";

// Every test here works over a FIXTURE directory in the OS temp dir, never
// the real repo's .git - dispatch-guard.ts's own header explains why: the
// decision must be testable without depending on this repo's real clock or
// real git state, and a test that touched the real .git could race sibling
// agents writing to the same working tree.
describe("dispatch-markers (fixture directories, never the real .git)", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "dispatch-markers-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  // FAIL-OPEN PATH: no .git directory at all. Reported as "absent" on both
  // markers (not "unreadable") - decideDispatchGuard's ordinary first-run
  // branch handles it correctly without a special case.
  it("reports both markers absent with a warning when .git is missing", () => {
    const dir = makeTempDir();
    const result = readDispatchMarkerState(dir);
    expect(result.dispatch).toEqual({ kind: "absent" });
    expect(result.lastStop).toEqual({ kind: "absent" });
    expect(result.warning).toContain("no .git directory found");
  });

  // First run: .git exists but neither marker has ever been written.
  it("reports both markers absent with no warning when .git exists but markers do not", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".git"));
    const result = readDispatchMarkerState(dir);
    expect(result.dispatch).toEqual({ kind: "absent" });
    expect(result.lastStop).toEqual({ kind: "absent" });
    expect(result.warning).toBeNull();
  });

  it("reports a present dispatch marker with a real mtime once touched", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".git"));
    touchDispatchMarker(dir);
    const result = readDispatchMarkerState(dir);
    expect(result.warning).toBeNull();
    expect(result.dispatch.kind).toBe("present");
    if (result.dispatch.kind === "present") {
      expect(Number.isFinite(result.dispatch.mtimeMs)).toBe(true);
    }
    expect(result.lastStop).toEqual({ kind: "absent" });
  });

  it("reports a present stop marker with a real mtime once touched", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".git"));
    touchStopMarker(dir);
    const result = readDispatchMarkerState(dir);
    expect(result.warning).toBeNull();
    expect(result.lastStop.kind).toBe("present");
    expect(result.dispatch).toEqual({ kind: "absent" });
  });

  it("touchDispatchMarker creates the marker file if it does not exist", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".git"));
    expect(existsSync(join(dir, ".git", "BACKLOG_LAST_DISPATCH"))).toBe(false);
    touchDispatchMarker(dir);
    expect(existsSync(join(dir, ".git", "BACKLOG_LAST_DISPATCH"))).toBe(true);
  });

  it("touchStopMarker advances an existing marker's mtime rather than only creating it once", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".git"));
    touchStopMarker(dir);
    const first = statSync(join(dir, ".git", "BACKLOG_LAST_STOP")).mtimeMs;
    touchStopMarker(dir);
    const second = statSync(join(dir, ".git", "BACKLOG_LAST_STOP")).mtimeMs;
    expect(second).toBeGreaterThanOrEqual(first);
  });

  // touchStopMarker/touchDispatchMarker must never throw, even with no .git.
  it("touching either marker with no .git directory is a silent no-op", () => {
    const dir = makeTempDir();
    expect(() => touchDispatchMarker(dir)).not.toThrow();
    expect(() => touchStopMarker(dir)).not.toThrow();
    expect(existsSync(join(dir, ".git"))).toBe(false);
  });

  // FAIL-OPEN PATH: an "unreadable" marker, kept DISTINCT from "absent" (the
  // whole point of the fix this file's header describes). A NUL byte in a
  // path is a synchronous, cross-platform, deterministic way to make Node's
  // fs refuse to touch a path at all (ERR_INVALID_ARG_VALUE) without relying
  // on OS-specific file permission behaviour, which differs enough between
  // Windows and POSIX that a chmod-based fixture would not port.
  describe("readMarkerState", () => {
    it("returns unreadable (never absent) for a path fs refuses to touch", () => {
      expect(() => readMarkerState("bad\0path")).not.toThrow();
      expect(readMarkerState("bad\0path")).toEqual({ kind: "unreadable" });
    });

    it("returns absent (never unreadable) for a path that simply does not exist", () => {
      const dir = makeTempDir();
      expect(readMarkerState(join(dir, "nope"))).toEqual({ kind: "absent" });
    });

    it("returns present with a finite mtime for a real file", () => {
      const dir = makeTempDir();
      mkdirSync(join(dir, ".git"));
      touchDispatchMarker(dir);
      const value = readMarkerState(join(dir, ".git", "BACKLOG_LAST_DISPATCH"));
      expect(value.kind).toBe("present");
      if (value.kind === "present") {
        expect(Number.isFinite(value.mtimeMs)).toBe(true);
      }
    });
  });
});
