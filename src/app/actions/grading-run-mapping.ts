// Extracted from src/app/actions/grading.ts (originally lines 28-66) as part
// of splitting that file back under the project's 1000-line-per-file cap
// (AGENTS.md) ahead of two queued features
// (docs/grading-results-file-viewer-acceptance-criteria.md and
// docs/rubric-criteria-breakdown-acceptance-criteria.md) that may need to
// touch it. grading.ts is a "use server" file, which may only export async
// functions - gradingApiToRun is a plain sync function, so it must live in a
// non-"use server" module the action file imports rather than export it
// directly.
//
// Owns exactly one pure decision: turning the deterministic Grading API's
// response shape into the app's GradingRun, so the existing results matrix in
// GradingTab renders it unchanged. No I/O, no clock, no randomness - every
// export below is a pure function of its arguments.

import { scaleResultToPoints, composeOverallComment, type GradingRun } from "@/lib/grade";
import type { GradingApiResponse } from "@/lib/grading-engine";

// Map the deterministic Grading API response onto the app's GradingRun so the
// existing results matrix in GradingTab renders it unchanged. The grader returns
// no per-student files and no full-credit checklist, so those degrade to "-" /
// hidden in the UI.
//
// When grading from a Canvas URL, pointsPossible re-bases the engine's rubric
// total onto the assignment's real scale (same anchoring as the AI path), so the
// tool never grades out of a different total than Canvas.
export function gradingApiToRun(
  resp: GradingApiResponse,
  pointsPossible: number | null = null
): GradingRun {
  return {
    rubricAreaNames: resp.criteria,
    fullCreditChecklist: [],
    results: resp.students.map((s) => {
      const passedCount = s.criteria.filter((c) => c.passed).length;
      const rawAreas = s.criteria.map((c) => ({
        area: c.criterion,
        score: `${c.points_earned}/${c.points_possible}`,
        comment: c.detail,
      }));
      const scaled = scaleResultToPoints(rawAreas, `${s.total}/${s.possible}`, pointsPossible);
      // This external "Other API" grading engine reports only a pass/fail
      // count per criterion (`c.detail`, folded into rubricAreas above), with
      // no separate improvement signal and - unlike the three producers named
      // in docs/grading-results-feedback-boxes-acceptance-criteria.md A6 item
      // 22 - no pre-existing resubmit-notice append to preserve. strengths
      // keeps the exact pre-existing overallComment text; improvements and
      // resubmitNotice stay "" rather than inventing a policy this path never
      // offered before.
      const strengths = `${passedCount}/${s.criteria.length} checks passed`;
      return {
        student: s.student,
        totalScore: scaled.totalScore,
        overallComment: composeOverallComment(strengths, "", ""),
        strengths,
        improvements: "",
        resubmitNotice: "",
        feedback: "",
        mergedFileCount: 0,
        submittedFiles: [],
        rubricAreas: scaled.rubricAreas,
      };
    }),
  };
}
