import "server-only";
import { randomUUID } from "node:crypto";
import { validReviewId } from "./archive-review-principal";
import { reconcileArchiveReviewDeletion, type ReviewRetentionState } from "./archive-review-retention";

type DeletingState = Extract<ReviewRetentionState, { phase: "deleting" }>;

/** Implementations must transact and persist a non-expiring deletion fence. */
export interface ArchiveReviewCleanupStore {
  /**
   * Atomically fence all readers and writers and install or retrieve the
   * existing tombstone. Return null unless all writer capabilities and
   * in-flight operations have been authoritatively retired. Never reuse paths.
   */
  readonly acquireTombstone: (key: { ownerId: string; reviewId: string; sourceId: string; proposedToken: string }) => Promise<DeletingState | null>;
  /** Conditionally mark the exact fenced token deleted; never reactivate it. */
  readonly markDeleted: (state: DeletingState) => Promise<boolean>;
}

export interface ArchiveReviewCleanupStorage {
  /** Must remove only the supplied path and return the actual Storage response. */
  readonly remove: (path: string, signal: AbortSignal) => Promise<{ readonly error: string | null; readonly removedPaths: readonly string[] }>;
}

/** A pending result always leaves the durable tombstone in place for retry. */
export type ArchiveReviewCleanupResult = "deleted" | "blocked" | "pending";

async function awaitOrAbort<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T | null> {
  if (signal.aborted) return null;
  let onAbort!: () => void;
  const aborted = new Promise<null>((resolve) => { onAbort = () => resolve(null); });
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) return null;
    return await Promise.race([Promise.resolve().then(() => signal.aborted ? null : operation()), aborted]);
  } finally { signal.removeEventListener("abort", onAbort); }
}

/**
 * This coordinator is intentionally unconnected. Its store must implement
 * atomic database transitions, writer retirement, never-reused paths and
 * authenticated Storage access; injected tests do not establish those facts.
 */
export async function cleanArchiveReviewSource(
  key: { readonly ownerId: string; readonly reviewId: string; readonly sourceId: string },
  store: ArchiveReviewCleanupStore,
  storage: ArchiveReviewCleanupStorage,
  signal: AbortSignal,
): Promise<ArchiveReviewCleanupResult> {
  if (!validReviewId(key?.ownerId) || !validReviewId(key.reviewId) || !validReviewId(key.sourceId) || signal.aborted) return "blocked";
  const { ownerId, reviewId, sourceId } = key;
  try {
    const found = await awaitOrAbort(() => store.acquireTombstone({ ownerId, reviewId, sourceId, proposedToken: randomUUID() }), signal);
    if (signal.aborted) return "pending";
    if (!found) return "blocked";
    const state = { ...found };
    // Validate the adapter response independently before giving it to Storage.
    if (state.phase !== "deleting" || state.ownerId !== ownerId || state.reviewId !== reviewId || state.sourceId !== sourceId || reconcileArchiveReviewDeletion(state, state.deleteToken, null) === null) return "pending";
    if (signal.aborted) return "pending";
    const sourcePath = state.sourcePath, token = state.deleteToken;
    const outcome = await awaitOrAbort(() => storage.remove(sourcePath, signal), signal);
    if (signal.aborted || !outcome) return "pending";
    const reconciled = reconcileArchiveReviewDeletion(state, token, outcome);
    if (!reconciled || reconciled.phase !== "deleted") return "pending";
    // The adapter must compare the full state and token atomically.
    const marked = await awaitOrAbort(() => store.markDeleted(state), signal);
    return !signal.aborted && marked === true ? "deleted" : "pending";
  } catch { return "pending"; }
}
