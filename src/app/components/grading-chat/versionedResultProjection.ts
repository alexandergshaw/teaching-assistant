import type { GradeResult, RubricAreaResult } from "@/lib/grade/types";
import type { ArrivedItemResult } from "../grading/incrementalRunPlan";

/** Bound by the trusted admission/completion transaction, not by display name. */
export interface VersionedArrival extends ArrivedItemResult {
  readonly resultRevision: number;
  readonly setupVersion: number | null;
}

export interface VersionedResultRow {
  readonly sourceIndex: number;
  readonly resultRevision: number;
  /** Null means the result's original setup cannot be established. */
  readonly setupVersion: number | null;
  readonly result: GradeResult;
  /** Original areas in their own row and original order, with no reconciliation. */
  readonly areas: readonly RubricAreaResult[];
}

/**
 * Projects the raw arrival stream for version-aware row rendering. Unlike the
 * single-header table, this never normalizes, folds or matches criteria across
 * versions. Duplicate criteria within a row also stay distinct. A consumer
 * must render these areas within their own row and must not use this view as
 * authorization to post against a single rubric. This does not persist or
 * establish provenance; the caller supplies an authenticated version binding.
 */
export function projectVersionedResults(
  arrived: readonly VersionedArrival[],
  knownVersions: ReadonlySet<number>,
): readonly VersionedResultRow[] {
  const latest = new Map<number, VersionedArrival>();
  const revisions = new Map<number, Set<number>>();
  for (const item of arrived) {
    if (!Number.isSafeInteger(item.sourceIndex) || item.sourceIndex < 0 || !Number.isSafeInteger(item.resultRevision) || item.resultRevision < 0) throw new Error("Invalid result identity.");
    const seen = revisions.get(item.sourceIndex) ?? new Set<number>();
    if (seen.has(item.resultRevision)) throw new Error("Duplicate result revision.");
    seen.add(item.resultRevision); revisions.set(item.sourceIndex, seen);
    const prior = latest.get(item.sourceIndex);
    if (!prior || item.resultRevision > prior.resultRevision) latest.set(item.sourceIndex, item);
  }
  return [...latest.entries()].sort(([a], [b]) => a - b).map(([sourceIndex, item]) => {
    const candidate = item.setupVersion;
    const setupVersion = candidate !== null && Number.isSafeInteger(candidate) && candidate > 0 && knownVersions.has(candidate) ? candidate : null;
    const result = structuredClone(item.result);
    return { sourceIndex, resultRevision: item.resultRevision, setupVersion, result, areas: result.rubricAreas.map((area) => ({ ...area })) };
  });
}

/** Bind only the exact rendered objects from the same source-ordered build. */
export function bindVersionedResultRows(rendered: readonly GradeResult[], rows: readonly VersionedResultRow[], bindings: WeakMap<GradeResult, VersionedResultRow>): void {
  if (rendered.length !== rows.length || rendered.some((result, index) => result.student !== rows[index].result.student)) return;
  rendered.forEach((result, index) => bindings.set(result, rows[index]));
}
