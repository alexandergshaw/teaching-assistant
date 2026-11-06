import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readVerifiedReadmeBlob } from "./github-verified-readme-blob";

function object(text: string | Buffer) {
  const bytes = Buffer.from(text);
  const sha = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  return { bytes, sha, size: bytes.length };
}
const signal = new AbortController().signal;
const scope = { accountId: "blob-tests", credential: "fingerprint" };
afterEach(() => vi.useRealTimers());

describe("shared verified README blob cache", () => {
  it("coalesces five identical misses and isolates cancellation of the initiating waiter", async () => {
    const data = object("concurrent-read");
    const result = Promise.withResolvers<Buffer>();
    const first = new AbortController();
    const load = vi.fn<(readSignal: AbortSignal) => Promise<Buffer>>(() => result.promise);
    const requests = Array.from({ length: 5 }, (_, index) =>
      readVerifiedReadmeBlob(scope, data, load, index === 0 ? first.signal : signal));
    const outcomes = Promise.allSettled(requests);
    await Promise.resolve();
    expect(load).toHaveBeenCalledOnce();
    first.abort();
    expect(load.mock.calls[0][0].aborted).toBe(false);
    result.resolve(data.bytes);
    const settled = await outcomes;
    expect(settled[0].status).toBe("rejected");
    expect(settled.slice(1)).toEqual(Array.from({ length: 4 }, () => ({ status: "fulfilled", value: "concurrent-read" })));
  });

  it("aborts an abandoned shared load and permits a replacement without retaining late results", async () => {
    const data = object("abandoned-shared-read");
    const result = Promise.withResolvers<Buffer>();
    const controllers = [new AbortController(), new AbortController()];
    const load = vi.fn<(readSignal: AbortSignal) => Promise<Buffer>>(() => result.promise);
    const outcomes = Promise.allSettled(controllers.map((caller) => readVerifiedReadmeBlob(scope, data, load, caller.signal)));
    await Promise.resolve();
    controllers.forEach((caller) => caller.abort());
    expect(load.mock.calls[0][0].aborted).toBe(true);
    expect((await outcomes).every((row) => row.status === "rejected")).toBe(true);
    result.resolve(data.bytes);
    const retry = vi.fn(async () => data.bytes);
    await expect(readVerifiedReadmeBlob(scope, data, retry, signal)).resolves.toBe("abandoned-shared-read");
    expect(retry).toHaveBeenCalledOnce();
  });

  it("does not cache when the last caller aborts between the completed read and its continuation", async () => {
    const data = object("abort-at-continuation-boundary");
    const caller = new AbortController();
    let queued = false;
    const load = vi.fn(async (readSignal: AbortSignal) => {
      // The first check after load returns is inside untilAbort. Schedule the
      // caller abort after that check but before the awaiting read continues.
      vi.spyOn(readSignal, "throwIfAborted").mockImplementation(() => {
        AbortSignal.prototype.throwIfAborted.call(readSignal);
        if (!queued) {
          queued = true;
          queueMicrotask(() => caller.abort());
        }
      });
      return data.bytes;
    });
    await expect(readVerifiedReadmeBlob(scope, data, load, caller.signal)).rejects.toThrow();
    const retry = vi.fn(async () => data.bytes);
    await expect(readVerifiedReadmeBlob(scope, data, retry, signal)).resolves.toBe("abort-at-continuation-boundary");
    expect(retry).toHaveBeenCalledOnce();
  });

  it("shares failures only while in flight and isolates account and credential identities", async () => {
    const data = object("failed-concurrent-read");
    const result = Promise.withResolvers<Buffer>();
    const load = vi.fn(() => result.promise);
    const outcomes = Promise.allSettled([
      readVerifiedReadmeBlob(scope, data, load, signal), readVerifiedReadmeBlob(scope, data, load, signal),
      readVerifiedReadmeBlob({ ...scope, accountId: "another" }, data, load, signal),
      readVerifiedReadmeBlob({ ...scope, credential: "rotated" }, data, load, signal),
    ]);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(3);
    result.reject(new Error("upstream throttled"));
    expect((await outcomes).every((row) => row.status === "rejected")).toBe(true);
    const retry = vi.fn(async () => data.bytes);
    await readVerifiedReadmeBlob(scope, data, retry, signal);
    expect(retry).toHaveBeenCalledOnce();
  });

  it("bounds in-flight entries and deadlines even if the transport ignores abort", async () => {
    vi.useFakeTimers();
    const data = object("pending-budget");
    const load = vi.fn<(readSignal: AbortSignal) => Promise<Buffer>>(() => new Promise<Buffer>(() => {}));
    const outcomes = Promise.allSettled(Array.from({ length: 32 }, (_, index) =>
      readVerifiedReadmeBlob({ ...scope, accountId: `pending-${index}` }, data, load, signal)));
    await expect(readVerifiedReadmeBlob({ ...scope, accountId: "overflow" }, data, load, signal)).rejects.toThrow("capacity");
    expect(load).toHaveBeenCalledTimes(32);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await outcomes).every((row) => row.status === "rejected")).toBe(true);
    expect(load.mock.calls.every(([readSignal]) => readSignal.aborted)).toBe(true);
    const retry = vi.fn(async () => data.bytes);
    await readVerifiedReadmeBlob({ ...scope, accountId: "overflow" }, data, retry, signal);
    expect(retry).toHaveBeenCalledOnce();
  });

  it("reuses only exact account, credential, SHA and size and keeps blank text", async () => {
    const data = object(" \r\n");
    const load = vi.fn(async () => data.bytes);
    const read = (who = scope, pin = data) => readVerifiedReadmeBlob(who, pin, load, signal);
    await expect(read()).resolves.toBe(" \r\n");
    await expect(read()).resolves.toBe(" \r\n");
    expect(load).toHaveBeenCalledTimes(1);
    await read({ ...scope, accountId: "other-account" });
    await read({ ...scope, credential: "rotated-credential" });
    await expect(read(scope, { ...data, size: data.size + 1 })).rejects.toThrow();
    await expect(read(scope, { ...data, sha: "a".repeat(40) })).rejects.toThrow();
    expect(load).toHaveBeenCalledTimes(5);
  });

  it("never retains corrupt text, errors, missing scope, or aborted loads", async () => {
    for (const bytes of [Buffer.from([0xff]), Buffer.from("contains\0null")]) {
      const data = object(bytes);
      const load = vi.fn(async () => bytes);
      await expect(readVerifiedReadmeBlob(scope, data, load, signal)).rejects.toThrow();
      await expect(readVerifiedReadmeBlob(scope, data, load, signal)).rejects.toThrow();
      expect(load).toHaveBeenCalledTimes(2);
    }
    const data = object("not-cached");
    const load = vi.fn(async () => data.bytes);
    await readVerifiedReadmeBlob(undefined, data, load, signal);
    await readVerifiedReadmeBlob(undefined, data, load, signal);
    expect(load).toHaveBeenCalledTimes(2);
    const failed = vi.fn(async () => { throw new Error("failure"); });
    await expect(readVerifiedReadmeBlob(scope, data, failed, signal)).rejects.toThrow();
    await expect(readVerifiedReadmeBlob(scope, data, load, signal)).resolves.toBe("not-cached");
    await expect(readVerifiedReadmeBlob(scope, data, load, AbortSignal.abort())).rejects.toThrow();
    const controller = new AbortController();
    const abortData = object("aborted");
    await expect(readVerifiedReadmeBlob(scope, abortData, async () => {
      controller.abort(); return abortData.bytes;
    }, controller.signal)).rejects.toThrow();
    const retry = vi.fn(async () => abortData.bytes);
    await readVerifiedReadmeBlob(scope, abortData, retry, signal);
    expect(retry).toHaveBeenCalledOnce();
  });

  it("captures the immutable expected identity before awaiting and stores text independent of buffers", async () => {
    const data = object("original");
    const replacement = object("replaced");
    const pin = { sha: data.sha, size: data.size };
    const pending = Promise.withResolvers<Buffer>();
    const result = readVerifiedReadmeBlob(scope, pin, () => pending.promise, signal);
    Object.assign(pin, { sha: replacement.sha, size: replacement.size });
    pending.resolve(replacement.bytes);
    await expect(result).rejects.toThrow();
    const load = vi.fn(async () => data.bytes);
    await readVerifiedReadmeBlob(scope, data, load, signal);
    data.bytes.fill(0);
    await expect(readVerifiedReadmeBlob(scope, data, load, signal)).resolves.toBe("original");
    expect(load).toHaveBeenCalledOnce();
  });

  it("bounds entries, aggregate retained text, and lifetime", async () => {
    vi.useFakeTimers();
    const data = object("entry-bound");
    const load = vi.fn(async () => data.bytes);
    const read = (index: number) => readVerifiedReadmeBlob({ ...scope, accountId: `entry-${index}` }, data, load, signal);
    for (let i = 0; i < 257; i++) await read(i);
    load.mockClear();
    await read(256); expect(load).not.toHaveBeenCalled();
    await read(0); expect(load).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(30 * 60_000);
    await read(0); expect(load).toHaveBeenCalledTimes(2);
    const big = object("x".repeat(128_000));
    const loadBig = vi.fn(async () => big.bytes);
    const readBig = (i: number) => readVerifiedReadmeBlob({ ...scope, accountId: `bytes-${i}` }, big, loadBig, signal);
    for (let i = 0; i < 34; i++) await readBig(i);
    loadBig.mockClear();
    await readBig(33); expect(loadBig).not.toHaveBeenCalled();
    await readBig(0); expect(loadBig).toHaveBeenCalledOnce();
    const oversized = object("x".repeat(128_001));
    await expect(readVerifiedReadmeBlob(scope, oversized, loadBig, signal)).rejects.toThrow();
    expect(loadBig).toHaveBeenCalledOnce();
  });
});
