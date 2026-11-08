import "server-only";
import { validReviewId } from "./archive-review-principal";
import { isArchiveReviewSourcePath } from "./archive-review-source";

/**
 * A decision seam for a future transactional store. It performs no Storage or
 * database operations and does not itself prove that writers are fenced.
 */
export type ReviewRetentionState =
  | { readonly phase: "active"; readonly ownerId: string; readonly reviewId: string; readonly sourceId: string; readonly sourcePath: string; readonly expiresAtMs: number }
  | { readonly phase: "deleting"; readonly ownerId: string; readonly reviewId: string; readonly sourceId: string; readonly sourcePath: string; readonly deleteToken: string }
  | { readonly phase: "deleted"; readonly ownerId: string; readonly reviewId: string; readonly sourceId: string; readonly sourcePath: string; readonly deleteToken: string };

export interface RetentionFence {
  /** Verified under the same database lock that installs the tombstone. */
  readonly activeReaders: number;
  /** Derived from authoritative storage policy, capability and in-flight writer records. */
  readonly allWritersPermanentlyFenced: boolean;
}

function validSource(state: ReviewRetentionState): boolean {
  if (!state || !validReviewId(state.ownerId) || !validReviewId(state.reviewId) || !validReviewId(state.sourceId) || !isArchiveReviewSourcePath(state.ownerId, state.reviewId, state.sourcePath)) return false;
  return state.sourcePath.endsWith(`/${state.sourceId}.zip`);
}

/**
 * Caller must hold an exclusive database lock and atomically persist the
 * returned non-expiring tombstone before any delete. All upload/read/claim
 * paths must reject a tombstoned source, and the unique source path must never
 * be reused. A mere age threshold or expiring lease is not such a fence.
 */
export function beginArchiveReviewDeletion(state: ReviewRetentionState, fence: RetentionFence, nowMs: number, deleteToken: string): ReviewRetentionState | null {
  if (!validSource(state) || state.phase !== "active" || !Number.isSafeInteger(state.expiresAtMs) || !Number.isSafeInteger(nowMs) || nowMs < state.expiresAtMs || !Number.isSafeInteger(fence?.activeReaders) || fence.activeReaders !== 0 || fence.allWritersPermanentlyFenced !== true || !validReviewId(deleteToken)) return null;
  return { phase: "deleting", ownerId: state.ownerId, reviewId: state.reviewId, sourceId: state.sourceId, sourcePath: state.sourcePath, deleteToken };
}

/**
 * Accept only explicit confirmation that the exact full path was removed.
 * Empty, partial, malformed, timed-out, or lost results keep the tombstone;
 * retries must remain fenced and must never restore the source to active.
 */
export function reconcileArchiveReviewDeletion(
  state: ReviewRetentionState,
  token: string,
  result: { readonly error: string | null; readonly removedPaths: readonly string[] } | null,
): ReviewRetentionState | null {
  if (!validSource(state) || state.phase !== "deleting" || !validReviewId(state.deleteToken) || token !== state.deleteToken) return null;
  if (!result || result.error !== null || !Array.isArray(result.removedPaths) || result.removedPaths.length !== 1 || result.removedPaths[0] !== state.sourcePath) return state;
  return { ...state, phase: "deleted" };
}
