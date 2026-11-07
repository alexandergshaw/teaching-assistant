import { describe, expect, it } from "vitest";
import { dispatchComposite } from "./compositeSubmission";

describe("composite submission dispatch", () => {
  it("clears only after one confirmed accepted entry", async () => {
    expect(await dispatchComposite(async () => ({ kind: "accepted", entryCount: 1 }), () => true)).toEqual({ kind: "accepted" });
    expect(await dispatchComposite(async () => ({ kind: "accepted", entryCount: 0 }), () => true)).toEqual({ kind: "uncertain" });
    expect(await dispatchComposite(async () => ({ kind: "accepted", entryCount: 2 }), () => true)).toEqual({ kind: "uncertain" });
  });
  it("retains a refused tray with its reason", async () => {
    expect(await dispatchComposite(async () => ({ kind: "refused", reason: "Try another file" }), () => true)).toEqual({ kind: "refused", reason: "Try another file" });
  });
  it("treats partial dispatch, rejected requests and a changed session as uncertain", async () => {
    expect(await dispatchComposite(async () => ({ kind: "partial", dispatchedCount: 1, refusedCount: 1, reason: "partial" }), () => true)).toEqual({ kind: "uncertain" });
    expect(await dispatchComposite(async () => { throw new Error("offline"); }, () => true)).toEqual({ kind: "uncertain" });
    let current = true;
    let finish!: (value: { kind: "accepted"; entryCount: number }) => void;
    const result = dispatchComposite(() => new Promise((resolve) => { finish = resolve; }), () => current);
    current = false;
    finish({ kind: "accepted", entryCount: 1 });
    expect(await result).toEqual({ kind: "uncertain" });
  });
});
