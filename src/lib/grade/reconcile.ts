/**
 * A39 wave 4b (docs/a39-waves.md 8.4.2): the canonical-column reconciliation
 * that used to live inline inside gradeStudentEntries (engine.ts:340-401 on
 * the pre-wave-4 tree), pulled out as a PURE projection over an
 * already-graded run so the incremental seam (wave 4c) can reconcile the
 * SAME way a whole run does, one item at a time, without duplicating this
 * logic a second time.
 *
 * Imports only ./types and ./rubric (W4-1/W4-2's own constraint, section
 * 3.3 of docs/a39-waves.md): reconcileRun must stay a pure leaf so
 * re-exporting it from src/lib/grade.ts cannot widen that barrel's reach
 * into server-only code (runtime-import-graph.test.ts, W2-5).
 *
 * THE INVARIANT (W4-1): gradeStudentEntries must return results
 * byte-identical to what the old inline block produced, before and after
 * this extraction - reconcile.test.ts's frozen literal is the oracle for
 * that.
 */
import type { GradeResult, RubricAreaResult } from "./types";
import { normalizeAreaName } from "./rubric";

export interface ReconcileRunResult {
  readonly results: GradeResult[];
  readonly rubricAreaNames: string[];
}

/**
 * Pin every result's rubricAreas onto one shared canonical column set so a
 * grading run's results table never splits into mismatched, half-filled
 * columns.
 *
 * `criteriaNames` is the rubric's own parsed criteria names (extraction
 * happens once, before this is called, by extractRubricCriteria). When the
 * rubric had none to parse, the canonical set falls back to the single
 * richest result's own areas (excluding the "Overall" placeholder) - the
 * same fallback the inline block used.
 *
 * PURE and idempotent under a STABLE canonical set: calling this twice with
 * the same `criteriaNames` on its own output is a no-op, because every
 * result's rubricAreas is already exactly the canonical columns after the
 * first call. It is NOT claimed to be commutative across a GROWING
 * canonical set - reconciling once against the final set is the only
 * supported call shape; reconcile.test.ts's idempotence case is over a
 * stable set for exactly this reason.
 */
export function reconcileRun(
  results: readonly GradeResult[],
  criteriaNames: readonly string[]
): ReconcileRunResult {
  let canonical: string[] = [...criteriaNames];
  if (canonical.length === 0) {
    let richest: RubricAreaResult[] = [];
    for (const result of results) {
      const real = result.rubricAreas.filter((a) => a.area && a.area !== "Overall");
      if (real.length > richest.length) richest = real;
    }
    canonical = richest.map((a) => a.area);
  }

  let reconciledResults: GradeResult[] = results as GradeResult[];
  if (canonical.length > 0) {
    reconciledResults = results.map((result) => {
      const byNorm = new Map<string, RubricAreaResult>();
      for (const area of result.rubricAreas) {
        const key = normalizeAreaName(area.area);
        if (key && !byNorm.has(key)) byNorm.set(key, area);
      }
      const reconciled: RubricAreaResult[] = [];
      for (const name of canonical) {
        const key = normalizeAreaName(name);
        const match = byNorm.get(key);
        if (match) {
          reconciled.push({ ...match, area: name });
          byNorm.delete(key);
        } else {
          reconciled.push({ area: name, score: "", comment: "" });
        }
      }
      const strays = [...byNorm.values()].filter((a) => a.comment.trim());
      let overallComment = result.overallComment;
      if (strays.length > 0) {
        const extra = strays.map((a) => `${a.area}: ${a.comment.trim()}`).join(" ");
        overallComment = overallComment ? `${overallComment} ${extra}` : extra;
      }
      return { ...result, rubricAreas: reconciled, overallComment };
    });
  }

  let rubricAreaNames: string[];
  if (canonical.length > 0) {
    rubricAreaNames = canonical;
  } else {
    rubricAreaNames = [];
    const seenAreas = new Set<string>();
    for (const result of reconciledResults) {
      for (const area of result.rubricAreas) {
        if (!seenAreas.has(area.area)) {
          seenAreas.add(area.area);
          rubricAreaNames.push(area.area);
        }
      }
    }
  }

  return { results: reconciledResults, rubricAreaNames };
}
