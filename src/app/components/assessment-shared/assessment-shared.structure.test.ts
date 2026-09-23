// WAVE 1 of the snapshot-grading extraction - the assessment-shared
// directory's own boundary canary.
//
// assessment-row.ts (this directory) is the SHARED row core for every
// assessment-grading surface. The words below are all PER-SURFACE
// semantics that belong to one grading surface, not the shared core -
// grading-recording's nameMatch/rosterCandidates/roster (R3a roster
// matching), submissionTimeStatus/submittedAt (D23c submission timing), and
// snapshot-grading's own shot/snapshot vocabulary. This scan exists to stop
// a future agent pulling any of that up into the shared core, the same way
// a wrongly-shared helper has cost this repo real regressions before
// (docs/REGRESSION.md, "four instances in two features").
//
// MANDATORY: the file-count floor below runs FIRST, so this scan can never
// silently pass over an empty or renamed directory - this repo has been
// bitten by exactly that (a check over nothing proves nothing).

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

const ASSESSMENT_SHARED_DIR = path.resolve(process.cwd(), "src/app/components/assessment-shared");

const FORBIDDEN_WORDS = [
  "nameMatch",
  "rosterCandidates",
  "roster",
  "submissionTimeStatus",
  "submittedAt",
  "shot",
  "snapshot",
];

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));
}

describe("assessment-shared directory floor (a scan over nothing proves nothing)", () => {
  it("has more than 3 files - the scan below must never pass over an empty or renamed directory", () => {
    const files = listFiles(ASSESSMENT_SHARED_DIR);
    expect(files.length).toBeGreaterThan(3);
  });
});

describe("no file in assessment-shared/ carries per-surface semantics", () => {
  const files = listFiles(ASSESSMENT_SHARED_DIR).filter((f) => f !== "assessment-shared.structure.test.ts");

  it.each(files)("%s contains none of the forbidden per-surface words", (file) => {
    const source = fs.readFileSync(path.join(ASSESSMENT_SHARED_DIR, file), "utf-8");
    const found = FORBIDDEN_WORDS.filter((word) => source.includes(word));
    expect(found, `expected no forbidden per-surface words in ${file}, found: ${found.join(", ")}`).toEqual([]);
  });
});
