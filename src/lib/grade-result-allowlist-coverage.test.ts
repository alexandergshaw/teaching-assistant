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
// 2. Runtime: two sentinel GradeResults - one GradedResult, one
//    UngradedResult - each with every field it CAN carry set to a
//    distinctive, detectable value, are pushed through each of the three
//    functions. Every field not in that function's own documented DROPPED
//    set must survive with its sentinel value intact, or the test fails.
//
// N13a: GradeResult became a union (GradedResult | UngradedResult) with two
// mutually exclusive fields, userId and ungraded - a single sentinel can no
// longer carry both, so this file now keeps ONE SENTINEL PER MEMBER. See
// "the sentinel guarantee" below for exactly what coverage that buys.
//
// A developer who adds a field to GradeResult but forgets to thread it
// through one of the three allowlists will see this file fail both ways:
// tsc first (if they also forgot to update ALL_GRADE_RESULT_FIELDS), and
// this runtime check second (if they did remember that, but not the actual
// allowlist function).

import { describe, expect, it } from "vitest";
import type {
  GradeResult,
  GradedResult,
  UngradedResult,
  NotAttemptedOutcome,
  GradingFailedOutcome,
} from "@/lib/grade";
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
  "ungraded",
] as const;

// If a field is added to GradeResult without being added to the array above,
// `Exclude<keyof GradeResult, (typeof ALL_GRADE_RESULT_FIELDS)[number]>`
// becomes non-empty, so `MissingFields` stops being `never`, and the
// assignment below fails to compile - `npx tsc --noEmit` catches it even
// though this test file never runs that field through anything at runtime.
type MissingFields = Exclude<keyof GradeResult, (typeof ALL_GRADE_RESULT_FIELDS)[number]>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _exhaustiveFieldCheck: MissingFields extends never ? true : ["add the missing field(s) to ALL_GRADE_RESULT_FIELDS above", MissingFields] = true;

// N13a section 4 item 1: the descriptor's own exhaustiveness check, over
// `keyof NotAttemptedOutcome | keyof GradingFailedOutcome` - NEVER
// `keyof UngradedOutcome`. Measured (probe-keyof.ts): `keyof (A | B)` is the
// INTERSECTION and silently drops a member-only field (here, `stoppedBy`,
// which only NotAttemptedOutcome has) while still compiling clean; the
// union-of-keyofs form is the one that actually catches a missing field.
// Used only in a `typeof` type position below (MissingOutcomeFields), never
// as a runtime value in this file.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ALL_UNGRADED_OUTCOME_FIELDS = [
  "kind",
  "stoppedBy",
  "sourceIndex",
  "student",
  "canvasUserId",
  "message",
] as const;
type MissingOutcomeFields = Exclude<
  keyof NotAttemptedOutcome | keyof GradingFailedOutcome,
  (typeof ALL_UNGRADED_OUTCOME_FIELDS)[number]
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _exhaustiveOutcomeCheck: MissingOutcomeFields extends never
  ? true
  : ["add the missing field(s) to ALL_UNGRADED_OUTCOME_FIELDS above", MissingOutcomeFields] = true;

// Fields each function is documented to intentionally strip/replace, never
// silently - kept here as the one place all three DROP lists are visible
// side by side.
const DROPS_FILE_BYTES_AND_CODE_EXECUTION = new Set<keyof GradeResult>(["codeExecution"]);
// submittedFiles is always rebuilt (emptied, or re-mapped through its own
// coercer) rather than value-compared below - see each describe block.

/** Every field a GradedResult can carry, EXCEPT `ungraded` (that member's
 *  own excluded key - it can never carry it, by the type). */
function gradedSentinel(): GradedResult {
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

/** Every field an UngradedResult can carry, EXCEPT `userId` (that member's
 *  own excluded key - it can never carry it, by the type). */
function ungradedSentinel(): UngradedResult {
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
    ungraded: {
      kind: "grading-failed",
      sourceIndex: 42,
      student: "SENTINEL_student",
      canvasUserId: 555,
      message: "SENTINEL_ungraded_message",
    },
  };
}

const SENTINELS: readonly GradeResult[] = [gradedSentinel(), ungradedSentinel()];

// RUNTIME HALF OF THE GUARD, N13a Ruling 6: every field on every sentinel
// EXCEPT that member's own excluded key (a two-element exclusion set:
// `userId` is excluded from ungradedSentinel(), `ungraded` is excluded from
// gradedSentinel()). NOT `SENTINELS.some(...)` - that is strictly WEAKER
// than the check it replaces: under `.some`, a future optional field given a
// value on the graded sentinel and left undefined on the ungraded one would
// pass, and the ungraded sentinel's round-trips would then trivially
// preserve it (it was never defined to begin with) - exactly the
// submissionTruncated-shaped defect this file exists to catch.
describe("the two sentinels cover every field in ALL_GRADE_RESULT_FIELDS", () => {
  it("has a defined, non-undefined value for every field each member CAN carry", () => {
    for (const field of ALL_GRADE_RESULT_FIELDS) {
      if (field === "userId") {
        expect(gradedSentinel().userId, `gradedSentinel() is missing field "userId"`).not.toBeUndefined();
        continue;
      }
      if (field === "ungraded") {
        expect(ungradedSentinel().ungraded, `ungradedSentinel() is missing field "ungraded"`).not.toBeUndefined();
        continue;
      }
      for (const sentinel of SENTINELS) {
        expect(sentinel[field], `a sentinel is missing field "${field}" (undefined survives every allowlist trivially)`).not.toBeUndefined();
      }
    }
  });
});

/** Fields to compare for one sentinel's round trip: every tracked field
 *  except the one that sentinel's own member cannot carry. */
function fieldsFor(sentinel: GradeResult): readonly (keyof GradeResult)[] {
  const excluded: keyof GradeResult = sentinel.ungraded !== undefined ? "userId" : "ungraded";
  return ALL_GRADE_RESULT_FIELDS.filter((f) => f !== excluded);
}

describe("stripGradeResultForDraft (grading-review-rows.ts) carries every field forward except its documented drops", () => {
  it.each(SENTINELS)("preserves every field's sentinel value except codeExecution (dropped) and submittedFiles (emptied)", (sentinel) => {
    const stripped = stripGradeResultForDraft(sentinel);
    for (const field of fieldsFor(sentinel)) {
      if (field === "codeExecution") {
        expect(stripped.codeExecution, `codeExecution should be dropped`).toBeUndefined();
        continue;
      }
      if (field === "submittedFiles") {
        expect(stripped.submittedFiles, `submittedFiles should be emptied`).toEqual([]);
        continue;
      }
      expect(stripped[field], `field "${field}" was not preserved`).toEqual(sentinel[field]);
    }
  });
});

describe("coerceGradeResult, via coerceGradingDraftPayload (grading-drafts.ts), carries every field forward except its documented drops", () => {
  it.each(SENTINELS)("preserves every field's sentinel value except codeExecution (dropped) and rawBase64 within submittedFiles (dropped)", (sentinel) => {
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
    for (const field of fieldsFor(sentinel)) {
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
  it.each(SENTINELS)("preserves every field's sentinel value except codeExecution and submittedFiles (both dropped for storage size, R2.4)", (sentinel) => {
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
    for (const field of fieldsFor(sentinel)) {
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
