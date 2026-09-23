import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decideRoundBump,
  decideRoundStatus,
  readRoundLedgerState,
  writeRoundLedgerState,
  MAX_ROUNDS,
} from "./round-ledger";
import type { LedgerState, RoundLedgerData } from "./round-ledger";

const NOW = "2026-09-23T12:00:00.000Z";

describe("decideRoundBump (pure - no filesystem, no clock)", () => {
  const absent: LedgerState = { kind: "absent" };

  it("round 1 allows, from an absent ledger", () => {
    const result = decideRoundBump(absent, "a29-architecture-small", NOW);
    expect(result.decision).toBe("allow");
    if (result.decision === "allow") {
      expect(result.newRound).toBe(1);
      expect(result.data["a29-architecture-small"]).toEqual({ round: 1, lastIncrementIso: NOW });
    }
  });

  it("round 2 allows, from a ledger already at round 1", () => {
    const state: LedgerState = { kind: "present", data: { "a29-architecture-small": { round: 1, lastIncrementIso: "2026-09-22T00:00:00.000Z" } } };
    const result = decideRoundBump(state, "a29-architecture-small", NOW);
    expect(result.decision).toBe("allow");
    if (result.decision === "allow") {
      expect(result.newRound).toBe(2);
    }
  });

  it("round 3 BLOCKS, from a ledger already at round 2 (the cap)", () => {
    const state: LedgerState = { kind: "present", data: { "a29-architecture-small": { round: 2, lastIncrementIso: "2026-09-22T00:00:00.000Z" } } };
    const result = decideRoundBump(state, "a29-architecture-small", NOW);
    expect(result.decision).toBe("block");
  });

  it("the block reason names the artifact id", () => {
    const state: LedgerState = { kind: "present", data: { "a38-scope": { round: 2, lastIncrementIso: "2026-09-22T00:00:00.000Z" } } };
    const result = decideRoundBump(state, "a38-scope", NOW);
    expect(result.decision).toBe("block");
    if (result.decision === "block") {
      expect(result.reason).toContain("a38-scope");
      // pin the fact and the ordering, never the exact wording (per this
      // repo's own instruction against source-text tests that over-specify).
      expect(result.reason).toContain("2");
    }
  });

  it("a block does not silently allow a different artifact's round count to leak in - each artifact id is independent", () => {
    const state: LedgerState = {
      kind: "present",
      data: {
        "a38-scope": { round: 2, lastIncrementIso: "2026-09-22T00:00:00.000Z" },
        "a29-architecture-small": { round: 0, lastIncrementIso: "2026-09-22T00:00:00.000Z" } as unknown as { round: number; lastIncrementIso: string },
      },
    };
    const blocked = decideRoundBump(state, "a38-scope", NOW);
    expect(blocked.decision).toBe("block");
    const otherAllowed = decideRoundBump(state, "a29-architecture-small", NOW);
    expect(otherAllowed.decision).toBe("allow");
  });

  it("MAX_ROUNDS is 2 - the constant the cap is measured against", () => {
    expect(MAX_ROUNDS).toBe(2);
  });

  it("an absent ledger allows with no warning", () => {
    const result = decideRoundBump(absent, "a1", NOW);
    expect(result.warning).toBeNull();
  });

  it("an unreadable ledger allows (fails open, treated as round 0) but WARNS", () => {
    const unreadable: LedgerState = { kind: "unreadable" };
    const result = decideRoundBump(unreadable, "a1", NOW);
    expect(result.decision).toBe("allow");
    if (result.decision === "allow") {
      expect(result.newRound).toBe(1);
    }
    expect(result.warning).not.toBeNull();
  });
});

describe("decideRoundStatus (pure, read-only)", () => {
  it("reports round 0 for an artifact the ledger has never seen", () => {
    const result = decideRoundStatus({ kind: "absent" }, "never-seen");
    expect(result.entries).toEqual([{ artifactId: "never-seen", round: 0, lastIncrementIso: null }]);
  });

  it("reports the recorded round for a known artifact", () => {
    const state: LedgerState = { kind: "present", data: { "a29-architecture-small": { round: 2, lastIncrementIso: NOW } } };
    const result = decideRoundStatus(state, "a29-architecture-small");
    expect(result.entries).toEqual([{ artifactId: "a29-architecture-small", round: 2, lastIncrementIso: NOW }]);
  });

  it("with no artifact id, lists every recorded artifact", () => {
    const state: LedgerState = {
      kind: "present",
      data: {
        "a29-architecture-small": { round: 2, lastIncrementIso: NOW },
        "a38-scope": { round: 1, lastIncrementIso: NOW },
      },
    };
    const result = decideRoundStatus(state);
    expect(result.entries.map((e) => e.artifactId).sort()).toEqual(["a29-architecture-small", "a38-scope"]);
  });

  it("an unreadable ledger reports empty/zero rounds but WARNS", () => {
    const result = decideRoundStatus({ kind: "unreadable" }, "a1");
    expect(result.entries).toEqual([{ artifactId: "a1", round: 0, lastIncrementIso: null }]);
    expect(result.warning).not.toBeNull();
  });
});

// Every test below works over a FIXTURE directory in the OS temp dir, never
// the real repo's .git - same reasoning as dispatch-markers.test.ts: the
// reader must be testable without racing sibling agents writing to the same
// working tree's real .git.
describe("readRoundLedgerState / writeRoundLedgerState (fixture directories, never the real .git)", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "round-ledger-test-"));
    mkdirSync(join(dir, ".git"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports absent when the ledger file has never been written", () => {
    const dir = makeTempDir();
    expect(readRoundLedgerState(dir)).toEqual({ kind: "absent" });
  });

  it("round-trips a write through a read", () => {
    const dir = makeTempDir();
    const data: RoundLedgerData = { "a29-architecture-small": { round: 1, lastIncrementIso: NOW } };
    writeRoundLedgerState(data, dir);
    expect(readRoundLedgerState(dir)).toEqual({ kind: "present", data });
  });

  it("reports unreadable (never absent) for malformed JSON", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, ".git", "BACKLOG_ROUND_LEDGER.json"), "{ not valid json", "utf-8");
    expect(readRoundLedgerState(dir)).toEqual({ kind: "unreadable" });
  });

  it("reports unreadable (never absent) for well-formed JSON with the wrong shape", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, ".git", "BACKLOG_ROUND_LEDGER.json"), JSON.stringify({ a1: { round: "not-a-number" } }), "utf-8");
    expect(readRoundLedgerState(dir)).toEqual({ kind: "unreadable" });
  });

  it("writeRoundLedgerState never throws even when the parent directory does not exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "round-ledger-test-nogit-"));
    tempDirs.push(dir);
    expect(() => writeRoundLedgerState({ a1: { round: 1, lastIncrementIso: NOW } }, dir)).not.toThrow();
  });

  it("a real write lands as pretty-printed JSON ending in a newline", () => {
    const dir = makeTempDir();
    writeRoundLedgerState({ a1: { round: 1, lastIncrementIso: NOW } }, dir);
    const raw = readFileSync(join(dir, ".git", "BACKLOG_ROUND_LEDGER.json"), "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw).toContain("\n");
  });
});
