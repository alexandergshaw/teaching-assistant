import { describe, it, expect, vi } from "vitest";

import * as fs from "fs";
import * as path from "path";

// L15: this file walks a real directory tree / reads many real files.
// vitest's 5000ms default testTimeout treats that as slow-but-fine when
// run alone, and as a false timeout under concurrent `npm test` load from
// sibling agents (measured: the slowest single top-level it() here runs
// well under 1s alone). Raised to the repo's existing slow-test
// convention of 30_000, already used by canvas-client-boundary.
// transitive.test.ts and runtime-import-graph.test.ts - this changes
// nothing about what any test asserts.
vi.setConfig({ testTimeout: 30_000 });

// N1 (suggest-and-confirm shot roles, Ruling N1-R1): AC-1's whole claim is
// that a suggested role NEVER becomes the effective role without an
// explicit instructor action, quantified over EVERY code path - but a test
// over one reducer (useSnapshotShots.ts's own setRole) cannot see a NEW
// caller anywhere else in this directory. This canary pins the exact set of
// files where the identifier `setRole` may appear at all (comment-stripped),
// the same shape as this repo's own headless-safe-step-type count canary and
// the ta-* exact-set scan - both of which exist because a scoped assertion
// missed a new caller. Adding a legitimate new reference means bumping this
// pinned set in the SAME commit, deliberately, which is exactly the moment
// someone must justify it.
//
// WHY this matters for THIS item specifically: the read path (handleRead in
// SnapshotGradingPanel.tsx) and the new suggestion leaf
// (snapshot-role-suggestion.ts) must never call setRole directly - the
// bulk-accept action goes through applyRoleSuggestions -> acceptAllSuggestions
// -> a single setShots instead, precisely so this pinned set never has to
// grow to admit the read/suggestion path.

const SNAPSHOT_GRADING_DIR = path.resolve(process.cwd(), "src/app/components/snapshot-grading");

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("setRole's call sites are pinned (AC-1, Ruling N1-R1)", () => {
  const files = fs
    .readdirSync(SNAPSHOT_GRADING_DIR)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));

  it("finds more than 3 non-test files in this directory - a scan over an empty or renamed directory proves nothing", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  const occurrences: { file: string; count: number }[] = [];
  for (const file of files) {
    const source = stripComments(fs.readFileSync(path.join(SNAPSHOT_GRADING_DIR, file), "utf-8"));
    const matches = source.match(/\bsetRole\b/g) ?? [];
    if (matches.length > 0) occurrences.push({ file, count: matches.length });
  }

  it("references the identifier setRole in exactly the pinned files - useSnapshotShots.ts (its own declaration and return) and SnapshotGradingPanel.tsx (destructure and the tray wiring), and nowhere else", () => {
    const fileNames = occurrences.map((o) => o.file).sort();
    expect(fileNames).toEqual(["SnapshotGradingPanel.tsx", "useSnapshotShots.ts"]);
  });

  it("useSnapshotShots.ts references setRole exactly 3 times (the interface field, the useCallback declaration, and the return object)", () => {
    const entry = occurrences.find((o) => o.file === "useSnapshotShots.ts");
    expect(entry?.count).toBe(3);
  });

  it("SnapshotGradingPanel.tsx references setRole exactly 2 times (the destructure and the SnapshotShotTray onSetRole wiring) - a THIRD reference here would be a new call site this canary exists to catch", () => {
    const entry = occurrences.find((o) => o.file === "SnapshotGradingPanel.tsx");
    expect(entry?.count).toBe(2);
  });

  it("snapshot-role-suggestion.ts (the read/suggestion path's own leaf) contains no reference to setRole at all - the bulk accept goes through acceptAllSuggestions, never setRole", () => {
    const suggestionSource = stripComments(
      fs.readFileSync(path.join(SNAPSHOT_GRADING_DIR, "snapshot-role-suggestion.ts"), "utf-8")
    );
    expect(suggestionSource).not.toMatch(/\bsetRole\b/);
  });
});
