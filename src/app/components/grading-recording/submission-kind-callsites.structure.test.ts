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

// G-R3 (docs/a8r-scope.md section 5), replacing the withdrawn
// EffectiveSubmissionKind brand (Ruling M): the instrument this repo already
// owns for exactly this shape - a pinned call-site canary, modelled line for
// line on src/app/components/snapshot-grading/
// snapshot-role-setrole-callsites.structure.test.ts (read in full before
// writing this file).
//
// THE ONE WAY THIS CANARY MUST DIFFER FROM ITS MODEL, and it is not
// optional: that file scans ONE directory, non-recursively. A8-R's
// composers span src/app/components/grading-recording/, src/app/actions/
// and src/lib/grade/ - a single-directory scan here would be exactly the
// false absence traps-search.md warns about, a clean result that checked
// nothing outside one folder. This canary walks all of src/ recursively.
//
// Two pinned sets:
//  - Set A, who may read the SUGGESTION (`suggestedSubmissionKind` or
//    `submissionKindCue`). The composers are deliberately NOT in it:
//    grading-feedback-prompt.ts, grading-submission-grade.ts,
//    GradingRecordingPanel.tsx and src/lib/grade/submission-kind.ts must
//    contain zero references, so the suggestion physically cannot reach the
//    prompt without an instructor's confirmation.
//  - Set B, who may compose a label or a prompt header
//    (`SUBMISSION_KIND_LABELS`, `SUBMISSION_KIND_PROMPT_LABELS`,
//    `submissionKindLabel`).

const SRC_ROOT = path.resolve(process.cwd(), "src");

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function walkSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) continue;
    out.push(full);
  }
  return out;
}

const ALL_FILES = walkSourceFiles(SRC_ROOT);

function relFiles(matcher: RegExp): string[] {
  const matches: string[] = [];
  for (const full of ALL_FILES) {
    const source = stripComments(fs.readFileSync(full, "utf-8"));
    if (matcher.test(source)) matches.push(path.relative(SRC_ROOT, full).replace(/\\/g, "/"));
  }
  return matches.sort();
}

const SET_A_MATCHER = /\bsuggestedSubmissionKind\b|\bsubmissionKindCue\b/;
const SET_B_MATCHER = /\bSUBMISSION_KIND_LABELS\b|\bSUBMISSION_KIND_PROMPT_LABELS\b|\bsubmissionKindLabel\b/;

const COMPOSER_FILES = [
  "app/components/grading-recording/grading-feedback-prompt.ts",
  "app/actions/grading-submission-grade.ts",
  "app/components/grading-recording/GradingRecordingPanel.tsx",
  "lib/grade/submission-kind.ts",
];

describe("A8-R submission-kind call-site canary (G-R3)", () => {
  it("the walk found more than 200 files - a broken walk over an empty or renamed root otherwise reports every set empty and passes forever", () => {
    expect(ALL_FILES.length).toBeGreaterThan(200);
  });

  it('a known-positive identifier ("GradingRow") is found in more than one file - proves the walk and the comment-stripped regex actually fire', () => {
    const hits = relFiles(/\bGradingRow\b/);
    expect(hits.length).toBeGreaterThan(1);
  });

  it("Set A: suggestedSubmissionKind/submissionKindCue appear in exactly the pinned files, in either direction", () => {
    const hits = relFiles(SET_A_MATCHER);
    expect(hits).toEqual(
      [
        "app/actions/grading-submission-extract.ts",
        "app/components/grading-recording/GradingTableRow.tsx",
        "app/components/grading-recording/grading-capture-sync.ts",
        "app/components/grading-recording/grading-capture-tombstones.ts",
        "app/components/grading-recording/grading-row-serialization.ts",
        "app/components/grading-recording/grading-row.ts",
        "app/components/grading-recording/grading-rows.ts",
        "app/components/grading-recording/grading-submission-merge.ts",
        "lib/course-intel/offline-payload.ts",
      ].sort()
    );
  });

  it("Set A: none of the four named composer files contains a reference, in code (comments naming the rule do not count, and are stripped before this check runs)", () => {
    const hits = relFiles(SET_A_MATCHER);
    for (const composer of COMPOSER_FILES) {
      expect(hits).not.toContain(composer);
    }
  });

  it("Set B: SUBMISSION_KIND_LABELS/SUBMISSION_KIND_PROMPT_LABELS/submissionKindLabel appear in exactly the pinned files, in either direction", () => {
    const hits = relFiles(SET_B_MATCHER);
    expect(hits).toEqual(
      [
        "app/components/grading-recording/GradingTableRow.tsx",
        "app/components/grading-recording/grading-feedback-prompt.ts",
        "lib/grade/submission-kind.ts",
      ].sort()
    );
  });

  it("Set B: grading-submission-grade.ts and GradingRecordingPanel.tsx never compose a label directly - only grading-feedback-prompt.ts composes the prompt header, only GradingTableRow.tsx composes the on-screen label", () => {
    const hits = relFiles(SET_B_MATCHER);
    expect(hits).not.toContain("app/actions/grading-submission-grade.ts");
    expect(hits).not.toContain("app/components/grading-recording/GradingRecordingPanel.tsx");
  });
});
