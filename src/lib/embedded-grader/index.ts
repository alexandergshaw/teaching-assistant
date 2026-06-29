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
  type GradingRun,
  type RubricAreaResult,
  type StudentSubmissionEntry,
} from "@/lib/grade";
import type { EmbeddedRubric } from "./types";
import { runCheck } from "./checks";
import {
  buildRubricFromInstructions,
  buildRubricFromRubricText,
  fullCreditChecklist,
} from "./rubric";

export type { EmbeddedRubric } from "./types";
export { renderRubricText, fullCreditChecklist } from "./rubric";

export interface BuildRubricInput {
  /** A supplied rubric (Canvas-provided, pasted, or uploaded). Preferred when present. */
  rubricText?: string;
  rubricFileName?: string;
  /** The assignment brief, used to generate a rubric only when none is supplied. */
  instructions?: string;
}

/**
 * Choose the rubric to grade against. A supplied rubric always wins; a rubric is
 * generated from the instructions only when none was supplied.
 */
export function buildEmbeddedRubric(input: BuildRubricInput): EmbeddedRubric {
  if (input.rubricText && input.rubricText.trim()) {
    return buildRubricFromRubricText(input.rubricText, input.rubricFileName);
  }
  if (input.instructions && input.instructions.trim()) {
    return buildRubricFromInstructions(input.instructions);
  }
  return {
    checks: [],
    origin: "instructions",
    warnings: [
      "Provide a rubric or assignment instructions so the deterministic engine has requirements to grade against.",
    ],
  };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** Factual, warm-but-professional overall comment. States what was met and, where
 *  points were lost, the concrete reason, without coaching the student to improve. */
function buildOverallComment(passed: number, total: number, missing: string[]): string {
  if (total === 0) return "No rubric criteria were available to score this submission.";
  if (missing.length === 0) {
    return `Nice work: all ${total} requirement${total === 1 ? "" : "s"} were met.`;
  }
  return `${passed} of ${total} requirements met. Not found in this submission: ${missing.join(", ")}.`;
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
        comment: outcome.detail,
      });
      earned += outcome.earned;
      possible += outcome.possible;
      if (outcome.passed) passedCount += 1;
      else missing.push(check.criterion);
    }

    const totalScore = possible > 0 ? `${formatNumber(earned)}/${formatNumber(possible)}` : "";
    const scaled = scaleResultToPoints(rawAreas, totalScore, pointsPossible);

    return {
      student: entry.student,
      userId: entry.userId,
      totalScore: scaled.totalScore,
      rubricAreas: scaled.rubricAreas,
      overallComment: buildOverallComment(passedCount, rubric.checks.length, missing),
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
