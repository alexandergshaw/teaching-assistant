import { describe, expect, it } from "vitest";
import { canReconcile, finishPackageReview, persistThenPublish, readReconciliationIntent, reviewIsCurrent, runSingleFlight } from "./repository-confirmation";

describe("exact snapshot confirmation and privacy-safe recovery", () => {
  const captured = { snapshotKey: JSON.stringify({ deck: "private slide text", context: "private context", objectives: ["A"] }), name: "private-deck" };
  const hash = "a".repeat(64);
  it("binds review to exact deck/context/objectives and repository name, including late results", () => {
    const review = finishPackageReview(captured, captured, "owner", hash);
    expect(reviewIsCurrent(review, captured)).toBe(true);
    for (const current of [
      { ...captured, snapshotKey: JSON.stringify({ deck: "edited", context: "private context", objectives: ["A"] }) },
      { ...captured, snapshotKey: JSON.stringify({ deck: "private slide text", context: "edited", objectives: ["A"] }) },
      { ...captured, snapshotKey: JSON.stringify({ deck: "private slide text", context: "private context", objectives: ["B"] }) },
      { ...captured, name: "other-repository" },
    ]) {
      expect(finishPackageReview(captured, current, "owner", hash)).toBeNull();
      expect(reviewIsCurrent(review, current)).toBe(false);
    }
  });
  it("persists only login/name/hash before egress and recovers the same intent after response loss", async () => {
    const order: string[] = [];
    let stored: string | null = null;
    const intent = { login: "owner", name: captured.name, fingerprint: hash };
    await expect(persistThenPublish(intent, text => { stored = text; order.push("persist"); }, async () => { order.push("egress"); throw new Error("response lost"); })).rejects.toThrow("response lost");
    expect(order).toEqual(["persist", "egress"]);
    expect(JSON.parse(stored!)).toEqual(intent);
    expect(stored).not.toContain("private slide text");
    expect(stored).not.toContain("private context");
    const recovered = readReconciliationIntent(stored, "owner");
    expect(recovered).toEqual(intent);
    expect(canReconcile(recovered!, "owner", hash, captured.name)).toBe(true);
    expect(canReconcile(recovered!, "owner", "b".repeat(64), captured.name)).toBe(false);
    expect(canReconcile(recovered!, "owner", hash, "different-name")).toBe(false);
    expect(readReconciliationIntent(stored, "other-owner")).toBeNull();
    let sent = false;
    await expect(persistThenPublish(intent, () => { throw new Error("storage denied"); }, async () => { sent = true; })).rejects.toThrow("storage denied");
    expect(sent).toBe(false);
  });

  it("rejects overlapping submissions before the first operation can finish", async () => {
    const lock = { current: false };
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    const first = runSingleFlight(lock, async () => { calls++; await held; });
    const second = await runSingleFlight(lock, async () => { calls++; });
    expect(second).toBe(false);
    expect(calls).toBe(1);
    release();
    await expect(first).resolves.toBe(true);
    expect(lock.current).toBe(false);
  });
});
