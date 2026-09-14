// Every test here runs under vi.useFakeTimers() with zero real elapsed
// time - vi.advanceTimersByTimeAsync moves the clock synthetically, so a
// promise that "never settles" really does prove the timeout path fires on
// its own rather than because the test happened to wait long enough.

import { describe, it, expect, vi, afterEach } from "vitest";
import { raceWithTimeout } from "./bounded-race";

afterEach(() => {
  vi.useRealTimers();
});

function neverSettles<T>(): Promise<T> {
  return new Promise<T>(() => {
    // Intentionally never resolves or rejects.
  });
}

describe("raceWithTimeout", () => {
  it("resolves to timedout when work never settles", async () => {
    vi.useFakeTimers();
    const outcome = raceWithTimeout(neverSettles<string>(), 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(outcome).resolves.toEqual({ kind: "timedout" });
  });

  it("resolves to timedout when racing two never-settling promises together", async () => {
    // Mirrors the real call site's shape: it races a single
    // Promise.all([...]) of two settlers, not a single promise.
    vi.useFakeTimers();
    const combined = Promise.all([neverSettles<string>(), neverSettles<number>()]);
    const outcome = raceWithTimeout(combined, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(outcome).resolves.toEqual({ kind: "timedout" });
  });

  it("resolves to settled with the value when work resolves before the bound, and the timer never fires", async () => {
    vi.useFakeTimers();
    const outcome = raceWithTimeout(Promise.resolve("done"), 1000);
    await expect(outcome).resolves.toEqual({ kind: "settled", value: "done" });
    // The bound never expired, so no timer should still be pending either -
    // it was cleared once work settled.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resolves to failed with the error when work rejects, and never throws out of the function", async () => {
    vi.useFakeTimers();
    const rejection = new Error("boom");
    const outcome = raceWithTimeout(Promise.reject(rejection), 1000);
    await expect(outcome).resolves.toEqual({ kind: "failed", error: rejection });
  });

  it("leaves no live timer handle after settling via the work-resolves route", async () => {
    vi.useFakeTimers();
    await raceWithTimeout(Promise.resolve("value"), 1000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves no live timer handle after settling via the timeout route", async () => {
    vi.useFakeTimers();
    const outcome = raceWithTimeout(neverSettles<string>(), 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await outcome;
    expect(vi.getTimerCount()).toBe(0);
  });
});
