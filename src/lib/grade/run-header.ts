import { extractRubricCriteria, generateRubric } from "./rubric";
import { stampRubricProvenance } from "./rubric-provenance-stamp";
import type { GradingRunHeader } from "./types";
import type { LlmProvider } from "../llm";

/**
 * A39 incremental-fill W2 (RULING 133). Resolves everything that is per-RUN
 * rather than per-ITEM, once, before any item is dispatched: the blank-
 * instructions refusal, the effective rubric (synthesized from the
 * instructions only when `synthesizeRubricWhenBlank` is true and the rubric
 * is blank - the zip path passes true, the Canvas path passes false, and
 * that asymmetry must be preserved, not flattened), the criteria names
 * parsed from that effective rubric, and the rubricUsed/rubricFingerprint
 * provenance pair for it.
 *
 * SERVER-ONLY: calling `generateRubric` reaches `lib/supabase` through
 * `rubric.ts`'s rubric-bank lookup, so this module must never be imported
 * from a "use client" closure and must never be re-exported through the
 * `@/lib/grade` barrel (grading.ts imports it by deep path instead).
 *
 * The "ok" branch carries five fields but `gradeAction` (src/app/actions/
 * grading.ts) has exactly one legitimate use for two of them:
 * `effectiveRubric` and `generatedRubric`. It must not apply `criteriaNames`
 * (gradeStudentEntries computes its own from the rubric it is handed) and it
 * must not apply `rubricUsed`/`rubricFingerprint` - engine.ts's
 * stampRubricProvenance already stamps the run gradeAction returns, and
 * spreading this header's pair onto the same object would double-stamp it,
 * with spread order silently deciding which value wins. `prepareGradingRunAction`
 * (the incremental route) is the caller that needs all five: it has no
 * engine of its own to stamp for it.
 */
export async function resolveRunHeader(
  assignmentInstructions: string,
  rubric: string,
  provider: LlmProvider,
  options: { readonly synthesizeRubricWhenBlank: boolean }
): Promise<GradingRunHeader> {
  if (!assignmentInstructions.trim()) {
    return { kind: "refused", error: "Please provide assignment instructions." };
  }

  const effectiveRubric = rubric.trim()
    ? rubric
    : options.synthesizeRubricWhenBlank
      ? await generateRubric(assignmentInstructions, provider)
      : rubric;
  const generatedRubric = rubric.trim() || !options.synthesizeRubricWhenBlank ? undefined : effectiveRubric;

  const criteriaNames = extractRubricCriteria(effectiveRubric).map((criterion) => criterion.name);
  const stamp = stampRubricProvenance(effectiveRubric);

  return {
    kind: "ok",
    effectiveRubric,
    generatedRubric,
    criteriaNames,
    rubricUsed: stamp.rubricUsed ?? "",
    rubricFingerprint: stamp.rubricFingerprint ?? "",
  };
}
