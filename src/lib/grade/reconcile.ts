/**
 * A39 wave 4b (docs/a39-waves.md 8.4.2): the canonical-column reconciliation
 * that used to live inline inside gradeStudentEntries (engine.ts:340-401 on
 * the pre-wave-4 tree), pulled out as a PURE projection over an
 * already-graded run so the incremental seam (wave 4c) can reconcile the
 * SAME way a whole run does, one item at a time, without duplicating this
 * logic a second time.
 *
 * Imports only ./types and ./prompts (A39 W1, RULING 134): reconcileRun must
 * stay a pure leaf so re-exporting it from src/lib/grade.ts cannot widen
 * that barrel's reach into server-only code (runtime-import-graph.test.ts).
 * ./prompts, not ./rubric, is deliberate - normalizeAreaName is defined in
 * ./prompts and only re-exported by ./rubric, and importing the barrel-
 * adjacent ./rubric would pull this leaf one hop closer to server-only code
 * for no reason.
 *
 * THE INVARIANT (W4-1): gradeStudentEntries must return results
 * byte-identical to what the old inline block produced for the
 * PARSEABLE-CRITERIA case. For the no-parseable-criteria fallback the
 * invariant is DELIBERATELY SUPERSEDED by RULING 134 (docs/a39-fill-waves.md
 * W1): the fallback now unions every result's areas instead of taking the
 * single richest result's areas, so both the whole-run route and the
 * incremental route converge on the same column set. See
 * reconcile.test.ts's frozen literal and its own header comment.
 */
import type { GradeResult, RubricAreaResult } from "./types";
import { normalizeAreaName } from "./prompts";

export interface ReconcileRunResult {
  readonly results: GradeResult[];
  readonly rubricAreaNames: string[];
}

/**
 * First-seen union of real area names over `rows` IN THE ORDER GIVEN, deduped
 * by normalizeAreaName, keeping the first-seen raw spelling, excluding the
 * empty area and the "Overall" placeholder - the same two exclusions the old
 * richest-single-result fallback applied. The CALLER owns the order: the
 * whole-run path and the incremental route's terminal normalisation pass
 * dense, ascending-sourceIndex rows; the incremental route passes arrival
 * order while the run is in progress (RULING 134, RULING 132).
 */
export function unionAreaNames(rows: readonly GradeResult[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const area of row.rubricAreas) {
      if (!area.area || area.area === "Overall") continue;
      const key = normalizeAreaName(area.area);
      if (key && !seen.has(key)) {
        seen.add(key);
        names.push(area.area);
      }
    }
  }
  return names;
}

/**
 * Pin every result's rubricAreas onto one shared canonical column set so a
 * grading run's results table never splits into mismatched, half-filled
 * columns.
 *
 * `criteriaNames` is the rubric's own parsed criteria names (extraction
 * happens once, before this is called, by extractRubricCriteria). When the
 * rubric had none to parse, the canonical set falls back to a first-seen
 * UNION over every result's own areas (excluding the "Overall" placeholder) -
 * RULING 134: both the whole-run route and the incremental route use this
 * same union, so the two routes provably agree on the same column set.
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
  if (canonical.length === 0) canonical = unionAreaNames(results);

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
