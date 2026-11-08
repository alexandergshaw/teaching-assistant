import type { GradeRunItemRequestBody } from "../grading/incrementalRunPlan";
import { requestForChatSetup, type ChatSetupHistory } from "./chatVersionedSetup";

/** Trusted, session-local state captured by the future integration. */
export interface VersionedRegradeRow {
  readonly sourceIndex: number;
  readonly sourceRevision: number;
  readonly retainedRequest: GradeRunItemRequestBody;
  readonly pending: boolean;
}
export interface VersionedRegradePlanItem {
  readonly sourceIndex: number;
  readonly sourceRevision: number;
  readonly setupVersion: number;
  readonly request: GradeRunItemRequestBody;
}

/**
 * Prepares explicitly selected rows for a chosen immutable version. This does
 * not reserve or dispatch work, alter existing grades, or accept candidates.
 * The caller must atomically recheck session, source revisions, pending state
 * and selection before reservation; never dispatch this plan directly.
 */
export function planVersionedRegrade(
  history: ChatSetupHistory,
  versionNumber: number,
  rows: readonly VersionedRegradeRow[],
  selection: readonly number[],
): readonly VersionedRegradePlanItem[] | null {
  if (!Number.isSafeInteger(versionNumber) || versionNumber < 1 || versionNumber > history.current || history.versions.length !== history.current || history.versions.some((v, index) => v.version !== index + 1) || !Array.isArray(rows) || !Array.isArray(selection) || selection.length === 0) return null;
  const version = history.versions[versionNumber - 1];
  const byIndex = new Map<number, VersionedRegradeRow>();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.sourceIndex) || row.sourceIndex < 0 || !Number.isSafeInteger(row.sourceRevision) || row.sourceRevision < 0 || row.retainedRequest.sourceIndex !== row.sourceIndex || byIndex.has(row.sourceIndex)) return null;
    byIndex.set(row.sourceIndex, row);
  }
  const seen = new Set<number>();
  const plans: VersionedRegradePlanItem[] = [];
  for (const sourceIndex of selection) {
    const row = byIndex.get(sourceIndex);
    if (!Number.isSafeInteger(sourceIndex) || seen.has(sourceIndex) || !row || row.pending) return null;
    seen.add(sourceIndex);
    // The eventual admission must copy and bind source bytes to a revision;
    // this plan is deliberately only a non-dispatching candidate.
    const request = requestForChatSetup(version, { sourceIndex, entry: row.retainedRequest.entry, gradeWindowSec: row.retainedRequest.gradeWindowSec });
    plans.push({ sourceIndex, sourceRevision: row.sourceRevision, setupVersion: versionNumber, request });
  }
  return plans;
}
