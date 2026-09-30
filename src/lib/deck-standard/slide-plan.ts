// PRES-2 S3: the Slide-plan stage (docs/pres-2-scope.md section 2.3).
//
// The stage-9 rule ("the app cannot spoil its own poll" - a prediction and
// its answer must never land on the same slide) is held by the TYPE, not by
// a runtime check: SlidePlanEntry is a discriminated union with no variant
// that carries both a question and an answer. A "prediction" entry and its
// paired "answer" entry are always two separate SlidePlanEntry values, and
// since one SlidePlan entry maps to exactly one slide (see SlidePlan below),
// they are always two separate slides. There is no code path that can
// construct a single entry holding both - the "question+answer" variant
// simply does not exist in this union, so the violation is unrepresentable
// rather than merely disallowed.
//
// validateSlidePlan is the belt-and-suspenders half: it catches structural
// problems the type cannot prevent by construction alone (a plan can still
// reference a predictionId that has no matching partner, or omit a
// dominantClaim), per docs/pres-2-scope.md section 5 (PLAN-SEPARATION).
//
// Pure leaf: no IO, no callLlm, no imports from decks/pptx/presentations or
// any other deck-standard file (S1/S2 are concurrent, disjoint waves).

export type SlidePlanEntry =
  | { role: "content"; dominantClaim: string }
  | { role: "prediction"; dominantClaim: string; predictionId: string }
  | { role: "answer"; dominantClaim: string; predictionId: string };

// One entry -> one slide. This is what makes the stage-9 invariant hold: a
// prediction and its answer are two entries, so they are two slides - there
// is no way to fold them back into one without a variant this union does not
// have.
export interface SlidePlan {
  entries: SlidePlanEntry[];
}

export type SlidePlanViolationKind =
  | "orphan-prediction"
  | "orphan-answer"
  | "duplicate-prediction-id"
  | "missing-dominant-claim";

export interface SlidePlanViolation {
  kind: SlidePlanViolationKind;
  index: number;
  predictionId?: string;
  detail: string;
}

/**
 * Pure validator over a SlidePlan. Catches everything the discriminated
 * union cannot rule out at compile time:
 *
 *   - orphan-prediction: a "prediction" entry whose predictionId has no
 *     matching "answer" entry anywhere in the plan.
 *   - orphan-answer: an "answer" entry whose predictionId has no matching
 *     "prediction" entry anywhere in the plan.
 *   - duplicate-prediction-id: two "prediction" entries (or two "answer"
 *     entries) sharing the same predictionId, which would make the pairing
 *     ambiguous.
 *   - missing-dominant-claim: any entry (regardless of role) whose
 *     dominantClaim is missing, empty, or whitespace-only (stage 5's
 *     one-dominant-claim-per-slide object).
 *
 * Returns an empty array for a well-formed plan.
 */
export function validateSlidePlan(plan: SlidePlan): SlidePlanViolation[] {
  const violations: SlidePlanViolation[] = [];

  const predictionIndicesById = new Map<string, number[]>();
  const answerIndicesById = new Map<string, number[]>();

  plan.entries.forEach((entry, index) => {
    if (!entry.dominantClaim || entry.dominantClaim.trim().length === 0) {
      violations.push({
        kind: "missing-dominant-claim",
        index,
        detail: `entry at index ${index} (role "${entry.role}") has an empty dominantClaim`,
      });
    }

    if (entry.role === "prediction") {
      const list = predictionIndicesById.get(entry.predictionId) ?? [];
      list.push(index);
      predictionIndicesById.set(entry.predictionId, list);
    } else if (entry.role === "answer") {
      const list = answerIndicesById.get(entry.predictionId) ?? [];
      list.push(index);
      answerIndicesById.set(entry.predictionId, list);
    }
  });

  for (const [predictionId, indices] of predictionIndicesById) {
    if (indices.length > 1) {
      violations.push({
        kind: "duplicate-prediction-id",
        index: indices[0],
        predictionId,
        detail: `predictionId "${predictionId}" is used by ${indices.length} prediction entries (indices ${indices.join(", ")})`,
      });
    }
    if (!answerIndicesById.has(predictionId)) {
      violations.push({
        kind: "orphan-prediction",
        index: indices[0],
        predictionId,
        detail: `prediction at index ${indices[0]} (predictionId "${predictionId}") has no matching answer entry`,
      });
    }
  }

  for (const [predictionId, indices] of answerIndicesById) {
    if (indices.length > 1) {
      violations.push({
        kind: "duplicate-prediction-id",
        index: indices[0],
        predictionId,
        detail: `predictionId "${predictionId}" is used by ${indices.length} answer entries (indices ${indices.join(", ")})`,
      });
    }
    if (!predictionIndicesById.has(predictionId)) {
      violations.push({
        kind: "orphan-answer",
        index: indices[0],
        predictionId,
        detail: `answer at index ${indices[0]} (predictionId "${predictionId}") has no matching prediction entry`,
      });
    }
  }

  return violations;
}
