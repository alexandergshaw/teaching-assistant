/**
 * Selects a bounded work window from a complete, owner-scoped ledger snapshot.
 * Selection is advisory: every selected item must still be claimed atomically
 * against the durable ledger before a worker can dispatch it.
 */
export type DurableBatchState = "queued" | "claimed" | "dispatched" | "succeeded" | "failed" | "unknown";

export interface DurableBatchItem {
  readonly id: string;
  readonly ordinal: number;
  readonly state: DurableBatchState;
}

export type DurableBatchPlan =
  | { readonly kind: "refused"; readonly reason: "incomplete-snapshot" | "invalid-snapshot" | "invalid-capacity" }
  | {
      readonly kind: "ready";
      readonly nextIds: readonly string[];
      readonly counts: Readonly<Record<DurableBatchState, number>>;
      readonly total: number;
    };

const STATES: readonly DurableBatchState[] = ["queued", "claimed", "dispatched", "succeeded", "failed", "unknown"];

export function planDurableBatch(input: {
  readonly items: readonly DurableBatchItem[];
  readonly snapshotComplete: boolean;
  readonly maxInFlight: number;
  readonly maxBatchSize: number;
}): DurableBatchPlan {
  if (input.snapshotComplete !== true) return { kind: "refused", reason: "incomplete-snapshot" };
  if (!Array.isArray(input.items)) return { kind: "refused", reason: "invalid-snapshot" };
  const items: readonly DurableBatchItem[] = input.items;
  if (!Number.isSafeInteger(input.maxInFlight) || input.maxInFlight < 1 ||
      !Number.isSafeInteger(input.maxBatchSize) || input.maxBatchSize < 1) {
    return { kind: "refused", reason: "invalid-capacity" };
  }
  const counts: Record<DurableBatchState, number> = { queued: 0, claimed: 0, dispatched: 0, succeeded: 0, failed: 0, unknown: 0 };
  const ids = new Set<string>();
  const ordinals = new Set<number>();
  for (const item of items) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id.trim() || !Number.isSafeInteger(item.ordinal) || item.ordinal < 0 ||
        !STATES.includes(item.state) || ids.has(item.id) || ordinals.has(item.ordinal)) {
      return { kind: "refused", reason: "invalid-snapshot" };
    }
    ids.add(item.id);
    ordinals.add(item.ordinal);
    counts[item.state] += 1;
  }
  const available = Math.max(0, input.maxInFlight - counts.claimed - counts.dispatched);
  const nextIds = items.filter((item) => item.state === "queued")
    .slice().sort((a, b) => a.ordinal - b.ordinal)
    .slice(0, Math.min(available, input.maxBatchSize)).map((item) => item.id);
  return { kind: "ready", nextIds, counts, total: items.length };
}
