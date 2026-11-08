import { describe, expect, it, vi } from "vitest";
import { readBoundedZipStream } from "./bounded-zip-stream";

describe("readBoundedZipStream", () => {
  it("accepts the exact byte limit and preserves bytes", async () => {
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([1, 2])); c.enqueue(new Uint8Array([3])); c.close(); } });
    const blob = await readBoundedZipStream(stream, 3, new AbortController().signal, "too large");
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3]);
  });
  it("cancels an over-limit stream before reading the tail", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(4)); }, cancel });
    await expect(readBoundedZipStream(stream, 3, new AbortController().signal, "too large")).rejects.toThrow("too large");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("aborts a stalled read even when cancellation never settles", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const controller = new AbortController();
    const result = readBoundedZipStream(stream, 3, controller.signal, "too large");
    controller.abort();
    await expect(result).rejects.toThrow("timed out");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("propagates read errors", async () => {
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.error(new Error("read failed")); } });
    await expect(readBoundedZipStream(stream, 3, new AbortController().signal, "too large")).rejects.toThrow("read failed");
  });
  it.each([{ count: 65536, accepted: true }, { count: 65537, accepted: false }])("bounds $count empty chunks", async ({ count, accepted }) => {
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { if (sent++ < count) c.enqueue(new Uint8Array(0)); else c.close(); } }, { highWaterMark: 0 });
    const result = readBoundedZipStream(stream, 3, new AbortController().signal, "too large");
    if (accepted) expect((await result).size).toBe(0);
    else await expect(result).rejects.toThrow("too many pieces");
  });
});
