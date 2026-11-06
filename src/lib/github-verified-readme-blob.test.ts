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
