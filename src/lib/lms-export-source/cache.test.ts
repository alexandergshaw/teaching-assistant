import { describe, expect, it, vi } from "vitest";
import { KeyedPromiseCache } from "./cache";

// A loader that resolves on demand, so tests can control exactly when a
// promise settles instead of racing real microtask timing.
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("KeyedPromiseCache", () => {
  it("calls load() on a miss and returns its resolved value", async () => {
    const cache = new KeyedPromiseCache<string>();
    const load = vi.fn(async () => "value-a");
    const result = await cache.get("key-a", load);
    expect(result).toBe("value-a");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight load across concurrent callers with the same key", async () => {
    const cache = new KeyedPromiseCache<string>();
    const d = deferred<string>();
    const load = vi.fn(() => d.promise);

    const first = cache.get("same-key", load);
    const second = cache.get("same-key", load);
    expect(load).toHaveBeenCalledTimes(1);

    d.resolve("shared-value");
    await expect(first).resolves.toBe("shared-value");
    await expect(second).resolves.toBe("shared-value");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps a resolved entry cached - a later get() with the same key does not reload", async () => {
    const cache = new KeyedPromiseCache<string>();
    const load = vi.fn(async () => "value-a");
    await cache.get("key-a", load);
    await cache.get("key-a", load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("loads independently per key - a miss on a different key never reuses another key's entry", async () => {
    const cache = new KeyedPromiseCache<string>();
    const loadA = vi.fn(async () => "value-a");
    const loadB = vi.fn(async () => "value-b");
    const a = await cache.get("key-a", loadA);
    const b = await cache.get("key-b", loadB);
    expect(a).toBe("value-a");
    expect(b).toBe("value-b");
    expect(loadA).toHaveBeenCalledTimes(1);
    expect(loadB).toHaveBeenCalledTimes(1);
  });

  it("evicts a failed entry so the next get() retries instead of replaying the same rejection", async () => {
    const cache = new KeyedPromiseCache<string>();
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("transient failure"))
      .mockResolvedValueOnce("recovered");

    await expect(cache.get("key-a", load)).rejects.toThrow("transient failure");
    // Give the eviction's .catch() a microtask to run before the next get().
    await Promise.resolve();
    expect(cache.has("key-a")).toBe(false);

    const result = await cache.get("key-a", load);
    expect(result).toBe("recovered");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("has()/size() reflect entries currently cached, including in-flight ones", async () => {
    const cache = new KeyedPromiseCache<string>();
    expect(cache.has("key-a")).toBe(false);
    expect(cache.size).toBe(0);

    const d = deferred<string>();
    const promise = cache.get("key-a", () => d.promise);
    expect(cache.has("key-a")).toBe(true);
    expect(cache.size).toBe(1);

    d.resolve("value-a");
    await promise;
    expect(cache.has("key-a")).toBe(true);
    expect(cache.size).toBe(1);
  });

  it("clear() drops every entry", async () => {
    const cache = new KeyedPromiseCache<string>();
    await cache.get("key-a", async () => "value-a");
    await cache.get("key-b", async () => "value-b");
    expect(cache.size).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has("key-a")).toBe(false);
  });
});
