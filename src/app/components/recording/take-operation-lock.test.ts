import { describe, expect, it } from "vitest";
import { acquireExclusive, createTakeOperationLock } from "./take-operation-lock";

describe("take operation lock", () => {
  it("rejects a simultaneous attempt and permits retry after release", async () => {
    const lock = createTakeOperationLock();
    let finish!: () => void;
    let requests = 0;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const submit = async () => {
      if (!lock.acquire()) return;
      requests++;
      await pending;
      lock.release();
    };
    const first = submit();
    await submit();
    expect(requests).toBe(1);
    finish();
    await first;
    await submit();
    expect(requests).toBe(2);
  });
  it("can stay locked after success until its owner is replaced", () => {
    const lock = createTakeOperationLock();
    expect(lock.isHeld()).toBe(false);
    expect(lock.acquire()).toBe(true);
    expect(lock.isHeld()).toBe(true);
    expect(lock.acquire()).toBe(false);
    lock.release();
    expect(lock.isHeld()).toBe(false);
  });
  it.each(["save", "post"])("prevents overlapping save and post when %s starts first", async (first) => {
    const save = createTakeOperationLock(), post = createTakeOperationLock();
    const primary = first === "save" ? save : post, secondary = first === "save" ? post : save;
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const run = async () => { if (!acquireExclusive(primary, secondary)) return; await pending; primary.release(); };
    const active = run();
    expect(acquireExclusive(secondary, primary)).toBe(false);
    finish(); await active;
    expect(acquireExclusive(secondary, primary)).toBe(true);
  });
});
