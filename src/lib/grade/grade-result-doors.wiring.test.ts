// N13a section 4 item 2 / Ruling 4: a source-text test over the "doors" - the
// places that emit a grade or comment to an LMS - is the only mechanism in
// this repo that can check WIRING rather than pure logic (vitest is node-env
// and renders nothing). Rather than freezing the eight call sites the
// contract enumerated (a floor, not the set - the contract's own words), this
// derives the emit families BY BUILDER NAME and asserts every non-test module
// that calls one of them ALSO references `ungraded` or `isUngraded`
// somewhere in the same file - pinning the FACT that every emit site knows
// about the flag, never the spelling of any particular predicate. This repo
// has twice paid for a source-text test that over-specified phrasing
// (docs, "source-scanning tests over-specify"), so this test is deliberately
// loose on HOW a file acknowledges the flag and strict on THAT it does.
//
// Ruling 4: the builder-name seed is
// postCanvasGradesAction, buildCanvasGradebookCsv, buildMoodleGradebookCsv,
// AND fillGradebookCsv - the original artifact seeded only the first three,
// which would have let a future module reach a real gradebook file
// (fillGradebookCsv, gradebook-csv.ts:463) through a door this oracle could
// not see.
//
// grep -P is broken in this checkout and exits 0 without checking anything
// (this repo's own recorded lesson) - every search below uses a plain JS
// RegExp (no lookbehind/lookahead reliance), and every search is paired with
// a canary: one string known to be absent (must return zero hits) and one
// known to be present (must hit), proven in the "canary" describe block
// before the real files are trusted against the same matcher.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC_ROOT = path.join(process.cwd(), "src");

const DOOR_BUILDER_NAMES = [
  "postCanvasGradesAction",
  "buildCanvasGradebookCsv",
  "buildMoodleGradebookCsv",
  "fillGradebookCsv",
] as const;

function collectSourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectSourceFiles(full));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (entry.name.includes(".test.")) continue;
    found.push(full);
  }
  return found;
}

/** True when `source` calls the named builder - a plain word-boundary
 *  substring match on the identifier, not an import-statement parse, so a
 *  re-export or a destructured call are both caught the same way. */
function callsBuilder(source: string, name: string): boolean {
  return new RegExp(`\\b${name}\\b`).test(source);
}

/** True when `source` shows any awareness of the ungraded flag - either
 *  spelling, anywhere in the file. Deliberately loose (this pins the FACT of
 *  awareness, not a particular predicate's spelling). */
function referencesUngradedFlag(source: string): boolean {
  return /\bungraded\b/i.test(source) || /\bisUngraded\b/.test(source);
}

describe("canary: callsBuilder / referencesUngradedFlag can actually tell hit from miss", () => {
  it("callsBuilder hits a real call and misses a similarly-spelled non-match", () => {
    expect(callsBuilder("const x = postCanvasGradesAction(url, grades);", "postCanvasGradesAction")).toBe(true);
    expect(callsBuilder("const x = postCanvasGradesActionZZZ(url, grades);", "postCanvasGradesAction")).toBe(false);
    expect(callsBuilder("// no mention of any builder here", "postCanvasGradesAction")).toBe(false);
  });

  it("referencesUngradedFlag hits either spelling and misses an unrelated file", () => {
    expect(referencesUngradedFlag("if (isUngraded(row)) continue;")).toBe(true);
    expect(referencesUngradedFlag("const x = result.ungraded;")).toBe(true);
    expect(referencesUngradedFlag("// nothing relevant in this file at all")).toBe(false);
  });
});

describe("every non-test module that calls a gradebook/Canvas-posting door builder also references the ungraded flag", () => {
  const files = collectSourceFiles(SRC_ROOT);
  const fileSources = new Map<string, string>();
  for (const file of files) {
    fileSources.set(file, fs.readFileSync(file, "utf8"));
  }

  // Canary that the seed itself is non-trivial: at least one real file in
  // this tree calls at least one builder, and the builder-name search
  // itself is not accidentally matching everything.
  it("canary: at least one door builder has at least one real caller in src/, and a made-up name has none", () => {
    let anyCaller = false;
    for (const source of fileSources.values()) {
      for (const name of DOOR_BUILDER_NAMES) {
        if (callsBuilder(source, name)) anyCaller = true;
      }
    }
    expect(anyCaller).toBe(true);

    let fakeCallers = 0;
    for (const source of fileSources.values()) {
      if (callsBuilder(source, "buildZZZGradebookCsv")) fakeCallers += 1;
    }
    expect(fakeCallers).toBe(0);
  });

  for (const builderName of DOOR_BUILDER_NAMES) {
    it(`every caller of ${builderName} also references the ungraded flag`, () => {
      const callers: string[] = [];
      for (const [file, source] of fileSources) {
        // A file that only IMPORTS the name (a barrel re-export, e.g.
        // gradebook-csv.ts itself, or grade.ts's own barrel) is not a
        // caller - it never invokes the builder, so it has nothing to
        // refuse. Require an actual call: the name followed by "(".
        if (new RegExp(`\\b${builderName}\\s*\\(`).test(source) && callsBuilder(source, builderName)) {
          // Exclude the builder's OWN declaration file (gradebook-csv.ts
          // defines `export function fillGradebookCsv(...)`, which matches
          // `fillGradebookCsv(` too, but a definition is not a call site).
          const definesIt = new RegExp(`function\\s+${builderName}\\s*\\(`).test(source);
          if (!definesIt) callers.push(file);
        }
      }

      expect(callers.length, `expected at least one caller of ${builderName}`).toBeGreaterThan(0);

      const missing = callers.filter((file) => !referencesUngradedFlag(fileSources.get(file)!));
      expect(
        missing,
        `these callers of ${builderName} never reference "ungraded" or "isUngraded": ${missing.join(", ")}`
      ).toEqual([]);
    });
  }
});
