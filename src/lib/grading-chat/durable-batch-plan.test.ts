import { describe, expect, it } from "vitest";
import { planDurableBatch, type DurableBatchItem } from "./durable-batch-plan";

describe("durable grading batch planning", () => {
  it("drains a large cohort in bounded windows without skipping or duplicating entries", () => {
    let items: DurableBatchItem[] = Array.from({ length: 87 }, (_, ordinal) => ({ id: `item-${ordinal}`, ordinal, state: "queued" }));
    const seen = new Set<string>();
    while (seen.size < items.length) {
      const result = planDurableBatch({ items: [...items].reverse(), snapshotComplete: true, maxInFlight: 3, maxBatchSize: 2 });
      expect(result.kind).toBe("ready");
      if (result.kind !== "ready") throw new Error("expected plan");
      expect(result.nextIds.length).toBeLessThanOrEqual(2);
      for (const id of result.nextIds) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
      items = items.map((item) => seen.has(item.id) ? { ...item, state: "succeeded" } : item);
    }
    expect(seen.size).toBe(87);
  });

  it("reserves in-flight capacity and never silently retries failed or uncertain work", () => {
    const items: DurableBatchItem[] = [
      { id: "late", ordinal: 5, state: "queued" },
      { id: "unknown", ordinal: 0, state: "unknown" },
      { id: "pending", ordinal: 1, state: "dispatched" },
      { id: "failed", ordinal: 2, state: "failed" },
      { id: "early", ordinal: 3, state: "queued" },
      { id: "claimed", ordinal: 4, state: "claimed" },
    ];
    const result = planDurableBatch({ items, snapshotComplete: true, maxInFlight: 3, maxBatchSize: 10 });
    expect(result).toMatchObject({ kind: "ready", nextIds: ["early"], total: 6, counts: { queued: 2, claimed: 1, dispatched: 1, failed: 1, unknown: 1 } });
  });

  it("refuses incomplete, duplicated, or invalid snapshots instead of reporting misleading totals", () => {
    const item: DurableBatchItem = { id: "one", ordinal: 0, state: "queued" };
    const input = { items: [item], snapshotComplete: true, maxInFlight: 1, maxBatchSize: 1 };
    expect(planDurableBatch({ ...input, snapshotComplete: false })).toEqual({ kind: "refused", reason: "incomplete-snapshot" });
    expect(planDurableBatch({ ...input, items: [item, { ...item, id: "two" }] })).toEqual({ kind: "refused", reason: "invalid-snapshot" });
    expect(planDurableBatch({ ...input, maxBatchSize: 0 })).toEqual({ kind: "refused", reason: "invalid-capacity" });
  });
});
