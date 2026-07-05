/**
 * Public API for the Embedded Deterministic Engine. It builds a rubric (from a
 * supplied rubric when present, otherwise from the assignment instructions) and
 * grades a set of per-student entries against it, returning the same GradingRun
 * shape every other grader produces so the results matrix renders it unchanged.
 *
 * Unlike the external "Other API" grader, this runs in-process: it keeps each
 * student's Canvas userId and submitted files, so grades can be posted back to
 * Canvas and files can be previewed from the results table.
 */

import {
  scaleResultToPoints,
  RESUBMIT_NOTICE,
  type GradingRun,
  type RubricAreaResult,
  type StudentSubmissionEntry,
} from "@/lib/grade";
import type { EmbeddedRubric } from "./types";
import { pick } from "@/lib/embedded/scaffold";
import { runCheck } from "./checks";
import { formatNumber } from "./format";
import {
  buildRubricFromInstructions,
  buildRubricFromRubricText,
  capCriteria,
  fullCreditChecklist,
} from "./rubric";

export type { EmbeddedRubric } from "./types";
export { renderRubricText, fullCreditChecklist, MAX_CRITERIA } from "./rubric";
export {
  buildDiscussionRubric,
  gradeDiscussion,
  renderDiscussionRubric,
  defaultDiscussionRubric,
} from "./discussion";
export type { DiscussionStudent, DiscussionContext, DiscussionRubric } from "./discussion";

export interface BuildRubricInput {
  /** A supplied rubric (Canvas-provided, pasted, or uploaded). Preferred when present. */
  rubricText?: string;
  rubricFileName?: string;
  /** The assignment brief, used to generate a rubric only when none is supplied. */
  instructions?: string;
}

/**
 * Choose the rubric to grade against. A supplied rubric always wins; a rubric is
 * generated from the instructions only when none was supplied. The result is
 * always capped to MAX_CRITERIA criteria.
 */
export function buildEmbeddedRubric(input: BuildRubricInput): EmbeddedRubric {
  const rubric: EmbeddedRubric =
    input.rubricText && input.rubricText.trim()
      ? buildRubricFromRubricText(input.rubricText, input.rubricFileName)
      : input.instructions && input.instructions.trim()
        ? buildRubricFromInstructions(input.instructions)
        : {
            checks: [],
            origin: "instructions",
            warnings: [
              "Provide a rubric or assignment instructions so the deterministic engine has requirements to grade against.",
            ],
          };
  return capCriteria(rubric);
}


/** Factual, warm-but-professional overall comment. States what was met and, where
 *  points were lost, the concrete reason, without coaching the student to improve.
 *  Phrasing varies deterministically per student (seeded) so a class's comments
 *  read naturally rather than stamped, while the factual core stays identical. */
function buildOverallComment(passed: number, total: number, missing: string[], seed: string): string {
  if (total === 0) return "No rubric criteria were available to score this submission.";
  const s = total === 1 ? "" : "s";
  if (missing.length === 0) {
    return pick(
      [
        `Nice work: all ${total} requirement${s} were met.`,
        `Great job: all ${total} requirement${s} were met.`,
        `Strong submission: all ${total} requirement${s} were met.`,
        `Well done: all ${total} requirement${s} were met.`,
      ],
      seed
    );
  }
  const detail = `Not found in this submission: ${missing.join(", ")}.`;
  return pick(
    [
      `${passed} of ${total} requirements met. ${detail}`,
      `Good progress: ${passed} of ${total} requirements met. ${detail}`,
      `${passed} of ${total} requirements met on this submission. ${detail}`,
    ],
    seed
  );
}

/**
 * Grade per-student entries against an embedded rubric. `pointsPossible` re-bases
 * the total onto a Canvas assignment's real scale (same anchoring as the other
 * graders); pass null for zip uploads.
 */
export function gradeEntriesEmbedded(
  entries: StudentSubmissionEntry[],
  rubric: EmbeddedRubric,
  pointsPossible: number | null = null
): GradingRun {
  const rubricAreaNames = rubric.checks.map((check) => check.criterion);

  const results = entries.map((entry) => {
    const rawAreas: RubricAreaResult[] = [];
    let earned = 0;
    let possible = 0;
    let passedCount = 0;
    const missing: string[] = [];

    for (const check of rubric.checks) {
      const outcome = runCheck(check, entry);
      rawAreas.push({
        area: check.criterion,
        score: `${formatNumber(outcome.earned)}/${formatNumber(outcome.possible)}`,
        comment: "",
      });
      earned += outcome.earned;
      possible += outcome.possible;
      if (outcome.passed) passedCount += 1;
      else missing.push(check.criterion);
    }

    const totalScore = possible > 0 ? `${formatNumber(earned)}/${formatNumber(possible)}` : "";
    const scaled = scaleResultToPoints(rawAreas, totalScore, pointsPossible);

    const baseComment = buildOverallComment(
      passedCount,
      rubric.checks.length,
      missing,
      `${entry.student}|${missing.join(",")}`
    );
    // A failed/partial check always lands in `missing` (a passing check earns full
    // points), so `missing.length > 0` is exactly when points were deducted.
    const overallComment =
      missing.length > 0 ? `${baseComment} ${RESUBMIT_NOTICE}` : baseComment;

    return {
      student: entry.student,
      userId: entry.userId,
      totalScore: scaled.totalScore,
      rubricAreas: scaled.rubricAreas,
      overallComment,
      feedback: "",
      mergedFileCount: entry.mergedFileCount,
      submittedFiles: entry.submittedFiles,
    };
  });

  return {
    results,
    rubricAreaNames,
    fullCreditChecklist: fullCreditChecklist(rubric),
  };
}
