/**
 * RULING 57 (docs/a39-build-rulings.md): every producer of a rendered
 * GradingRun stamps the rubricUsed/rubricFingerprint pair, not only
 * engine.ts. Enumerated by `grep -rnE "\)\s*:\s*(Promise<)?GradingRun>?\s*\{"
 * src --include=*.ts | grep -v "\.test\.ts"` (five hits: engine.ts's
 * gradeStudentEntries plus its three exported wrappers, all already stamped;
 * embedded-grader/index.ts's gradeEntriesEmbedded; embedded-grader/
 * discussion.ts's gradeDiscussion; grading-run-mapping.ts's gradingApiToRun -
 * the external "Other API" mapping). stripGradingRunForDraft
 * (workflows/grading-review-rows.ts) is excluded: it transforms an
 * already-produced run, it does not produce one.
 *
 * RULING 58: this is also the ONLY place allowed to construct a
 * StampedRubricText. A producer calls this on the exact text it graded
 * against - never on a value read back from rubric-memory's store - so the
 * pair on the returned run always describes THIS run, never whatever a
 * caller separately persisted.
 */

import { rubricFingerprint } from "../research/rubric-fingerprint";
import type { StampedRubricText } from "./types";

/** Stamp the rubricUsed/rubricFingerprint pair for the exact text a producer
 *  graded against. Returns undefined for both when the text is blank (an
 *  empty-results early return has no rubric to report against). */
export function stampRubricProvenance(rubricText: string): {
  rubricUsed: StampedRubricText | undefined;
  rubricFingerprint: StampedRubricText | undefined;
} {
  if (!rubricText.trim()) {
    return { rubricUsed: undefined, rubricFingerprint: undefined };
  }
  return {
    rubricUsed: rubricText as StampedRubricText,
    rubricFingerprint: rubricFingerprint(rubricText) as StampedRubricText,
  };
}

/** The ONLY other legitimate way to obtain this brand: restoring a run's own
 *  already-stamped field back from persisted storage (a workflow draft via
 *  grading-drafts.ts's coerceGradingRun, or the GitHub grading-run cache via
 *  github-grading-run-store.ts's parseGradingRun) - the value round-trips a
 *  field a producer stamped earlier, it is never a fresh value read from a
 *  different source such as rubric-memory's store. Callers that construct a
 *  GradingRun-shaped test fixture also use this, for the same reason: the
 *  string is a stand-in for an already-produced value, not a fresh claim
 *  being made about what a run graded against. */
export function restoreStampedRubricText(value: string | undefined): StampedRubricText | undefined {
  return value === undefined ? undefined : (value as StampedRubricText);
}
