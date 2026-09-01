// docs/no-submission-and-requirement-checking-acceptance-criteria.md G1c:
// three separate modules each hold their own explicit allowlist of
// GradeResult fields - stripGradeResultForDraft (grading-review-rows.ts),
// coerceGradeResult (grading-drafts.ts, reached here through
// coerceGradingDraftPayload since it is not itself exported), and
// parseGradeResult (github-grading-run-store.ts, reached here through the
// serializeGithubGradingRun/parseStoredGithubGradingRun round trip for the
// same reason). `submissionTruncated` was silently dropped by one of these
// once before being caught. This file exists so a FUTURE field gets the same
// treatment automatically, on two independent levels:
//
// 1. Compile-time: ALL_GRADE_RESULT_FIELDS below is asserted (via
//    AssertNoMissingFields) to name every key of GradeResult. Add a field to
//    GradeResult without adding it here and `npx tsc --noEmit` fails on the
//    assertion below - this is the same "widen the union, confirm tsc fails"
//    idiom entry 370 (docs/REGRESSION.md) verifies its own exhaustiveness
//    check with.
// 2. Runtime: a sentinel GradeResult with every field set to a distinctive,
//    detectable value is pushed through each of the three functions. Every
//    field not in that function's own documented DROPPED set must survive
//    with its sentinel value intact, or the test fails.
//
// A developer who adds a field to GradeResult but forgets to thread it
// through one of the three allowlists will see this file fail both ways:
// tsc first (if they also forgot to update ALL_GRADE_RESULT_FIELDS), and
// this runtime check second (if they did remember that, but not the actual
// allowlist function).

import { describe, expect, it } from "vitest";
import type { GradeResult } from "@/lib/grade";
import { stripGradeResultForDraft } from "@/lib/workflows/grading-review-rows";
import { coerceGradingDraftPayload } from "@/lib/grading-drafts";
import { parseStoredGithubGradingRun, serializeGithubGradingRun } from "@/lib/github-grading-run-store";

const ALL_GRADE_RESULT_FIELDS = [
  "student",
  "overallComment",
  "strengths",
  "improvements",
  "resubmitNotice",
  "rubricAreas",
  "totalScore",
  "feedback",
  "mergedFileCount",
  "submittedFiles",
  "userId",
  "codeExecution",
  "gradedRepo",
  "gradedRef",
  "submissionTruncated",
  "determination",
] as const;

// If a field is added to GradeResult without being added to the array above,
// `Exclude<keyof GradeResult, (typeof ALL_GRADE_RESULT_FIELDS)[number]>`
// becomes non-empty, so `MissingFields` stops being `never`, and the
// assignment below fails to compile - `npx tsc --noEmit` catches it even
// though this test file never runs that field through anything at runtime.
type MissingFields = Exclude<keyof GradeResult, (typeof ALL_GRADE_RESULT_FIELDS)[number]>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _exhaustiveFieldCheck: MissingFields extends never ? true : ["add the missing field(s) to ALL_GRADE_RESULT_FIELDS above", MissingFields] = true;

function sentinelResult(): GradeResult {
  return {
    student: "SENTINEL_student",
    overallComment: "SENTINEL_overallComment",
    strengths: "SENTINEL_strengths",
    improvements: "SENTINEL_improvements",
    resubmitNotice: "SENTINEL_resubmitNotice",
    rubricAreas: [{ area: "SENTINEL_area", score: "1/1", comment: "SENTINEL_comment" }],
    totalScore: "SENTINEL_totalScore",
    feedback: "SENTINEL_feedback",
    mergedFileCount: 1234567,
    submittedFiles: [
      {
        name: "sentinel.txt",
        extension: "txt",
        previewContent: "SENTINEL_previewContent",
        previewTruncated: false,
      },
    ],
    userId: 987654321,
    codeExecution: {
      language: "SENTINEL_language",
      files: ["SENTINEL_file"],
      ran: true,
      exitCode: 0,
      stdout: "SENTINEL_stdout",
      stderr: "",
    },
    gradedRepo: "SENTINEL_gradedRepo",
    gradedRef: "SENTINEL_gradedRef",
    submissionTruncated: true,
    determination: "no-submission",
  };
}

// Fields each function is documented to intentionally strip/replace, never
// silently - kept here as the one place all three DROP lists are visible
// side by side.
const DROPS_FILE_BYTES_AND_CODE_EXECUTION = new Set<keyof GradeResult>(["codeExecution"]);
// submittedFiles is always rebuilt (emptied, or re-mapped through its own
// coercer) rather than value-compared below - see each describe block.

// RUNTIME HALF OF THE GUARD. The compile-time exhaustiveness check above
// (`_exhaustiveFieldCheck`) only forces a new field into
// ALL_GRADE_RESULT_FIELDS - it does NOT force that field into
// sentinelResult(). An OPTIONAL field left out of the sentinel is
// `undefined` there, and every allowlist function passed an `undefined`
// value through as `undefined` "survives" the `toEqual` comparisons in every
// describe block below trivially, so all three round-trips report the field
// preserved even though nothing ever actually carried a real value through.
// That is exactly the submissionTruncated defect this whole file exists to
// catch, reproduced one level up. This check closes that gap: it fails the
// instant a field is added to ALL_GRADE_RESULT_FIELDS (and hence to
// GradeResult) without also being given a real, defined value in
// sentinelResult(), independent of what any allowlist function does with it.
describe("sentinelResult() covers every field in ALL_GRADE_RESULT_FIELDS", () => {
  it("has a defined, non-undefined value for every field the compile-time check tracks", () => {
    const sentinel = sentinelResult();
    for (const field of ALL_GRADE_RESULT_FIELDS) {
      expect(sentinel[field], `sentinelResult() is missing field "${field}" (undefined survives every allowlist trivially)`).not.toBeUndefined();
    }
  });
});

describe("stripGradeResultForDraft (grading-review-rows.ts) carries every field forward except its documented drops", () => {
  it("preserves every field's sentinel value except codeExecution (dropped) and submittedFiles (emptied)", () => {
    const stripped = stripGradeResultForDraft(sentinelResult());
    for (const field of ALL_GRADE_RESULT_FIELDS) {
      if (field === "codeExecution") {
        expect(stripped.codeExecution, `codeExecution should be dropped`).toBeUndefined();
        continue;
      }
      if (field === "submittedFiles") {
        expect(stripped.submittedFiles, `submittedFiles should be emptied`).toEqual([]);
        continue;
      }
      expect(stripped[field], `field "${field}" was not preserved`).toEqual(sentinelResult()[field]);
    }
  });
});

describe("coerceGradeResult, via coerceGradingDraftPayload (grading-drafts.ts), carries every field forward except its documented drops", () => {
  it("preserves every field's sentinel value except codeExecution (dropped) and rawBase64 within submittedFiles (dropped)", () => {
    const sentinel = sentinelResult();
    const raw = JSON.parse(JSON.stringify(sentinel)) as Record<string, unknown>;
    const payload = coerceGradingDraftPayload({
      runs: [
        {
          courseName: "Course",
          assignmentName: "Assignment",
          canvasUrl: "https://canvas.example.com",
          run: { results: [raw], rubricAreaNames: [], fullCreditChecklist: [] },
        },
      ],
    });
    expect(payload.runs).toHaveLength(1);
    const result = payload.runs[0].run.results[0];
    for (const field of ALL_GRADE_RESULT_FIELDS) {
      if (DROPS_FILE_BYTES_AND_CODE_EXECUTION.has(field)) {
        expect(result.codeExecution, `codeExecution should be dropped`).toBeUndefined();
        continue;
      }
      if (field === "submittedFiles") {
        expect(result.submittedFiles, `submittedFiles should round-trip (minus rawBase64)`).toEqual(
          sentinel.submittedFiles
        );
        continue;
      }
      expect(result[field], `field "${field}" was not preserved`).toEqual(sentinel[field]);
    }
  });
});

describe("parseGradeResult, via serializeGithubGradingRun/parseStoredGithubGradingRun (github-grading-run-store.ts), carries every field forward except its documented drops", () => {
  it("preserves every field's sentinel value except codeExecution and submittedFiles (both dropped for storage size, R2.4)", () => {
    const sentinel = sentinelResult();
    const json = serializeGithubGradingRun({
      run: { results: [sentinel], rubricAreaNames: [], fullCreditChecklist: [] },
      gradedAt: "2026-08-24T12:00:00.000Z",
      lastGradedFolder: "",
      truncatedRepos: [],
      noSubmissionRepos: [],
      undeterminedRepos: [],
    });
    const restored = parseStoredGithubGradingRun(json);
    expect(restored).not.toBeNull();
    const result = restored!.run.results[0];
    for (const field of ALL_GRADE_RESULT_FIELDS) {
      if (DROPS_FILE_BYTES_AND_CODE_EXECUTION.has(field)) {
        expect(result.codeExecution, `codeExecution should be dropped`).toBeUndefined();
        continue;
      }
      if (field === "submittedFiles") {
        expect(result.submittedFiles, `submittedFiles should be emptied (R2.4)`).toEqual([]);
        continue;
      }
      expect(result[field], `field "${field}" was not preserved`).toEqual(sentinel[field]);
    }
  });
});
