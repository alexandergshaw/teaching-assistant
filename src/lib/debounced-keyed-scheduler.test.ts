import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDebouncedKeyedScheduler } from "./debounced-keyed-scheduler";

describe("createDebouncedKeyedScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs once, after the delay, for a single schedule call", () => {
    const scheduler = createDebouncedKeyedScheduler(800);
    const run = vi.fn();
    scheduler.schedule("item-1", run);

    vi.advanceTimersByTime(799);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a burst of calls for the SAME key collapses into exactly one run, timed from the LAST call", () => {
    const scheduler = createDebouncedKeyedScheduler(800);
    const run = vi.fn();
    scheduler.schedule("item-1", run);
    vi.advanceTimersByTime(500);
    scheduler.schedule("item-1", run); // restarts the delay
    vi.advanceTimersByTime(500);
    scheduler.schedule("item-1", run); // restarts again
    vi.advanceTimersByTime(799);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("different keys never interact - each gets its own independent timer", () => {
    const scheduler = createDebouncedKeyedScheduler(800);
    const runA = vi.fn();
    const runB = vi.fn();
    scheduler.schedule("item-a", runA);
    vi.advanceTimersByTime(400);
    scheduler.schedule("item-b", runB); // item-b's own fresh timer - must not delay or reset item-a's
    vi.advanceTimersByTime(400); // item-a's total elapsed: 800 - fires now
    expect(runA).toHaveBeenCalledTimes(1);
    expect(runB).not.toHaveBeenCalled(); // item-b's own timer only has 400ms elapsed
    vi.advanceTimersByTime(400);
    expect(runB).toHaveBeenCalledTimes(1);
  });

  it("the LATEST run callback for a key wins if schedule is called again with a different function before it fires", () => {
    const scheduler = createDebouncedKeyedScheduler(800);
    const stale = vi.fn();
    const fresh = vi.fn();
    scheduler.schedule("item-1", stale);
    scheduler.schedule("item-1", fresh);
    vi.advanceTimersByTime(800);
    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it("cancelAll prevents every pending timer from ever running", () => {
    const scheduler = createDebouncedKeyedScheduler(800);
    const runA = vi.fn();
    const runB = vi.fn();
    scheduler.schedule("item-a", runA);
    scheduler.schedule("item-b", runB);
    scheduler.cancelAll();
    vi.advanceTimersByTime(10_000);
    expect(runA).not.toHaveBeenCalled();
    expect(runB).not.toHaveBeenCalled();
  });

  it("scheduling a key again after it already fired starts a fresh, independent run", () => {
    const scheduler = createDebouncedKeyedScheduler(800);
    const run = vi.fn();
    scheduler.schedule("item-1", run);
    vi.advanceTimersByTime(800);
    expect(run).toHaveBeenCalledTimes(1);

    scheduler.schedule("item-1", run);
    vi.advanceTimersByTime(800);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("scheduling a new key after cancelAll still works (the scheduler itself is reusable)", () => {
    const scheduler = createDebouncedKeyedScheduler(800);
    scheduler.cancelAll();
    const run = vi.fn();
    scheduler.schedule("item-1", run);
    vi.advanceTimersByTime(800);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
