import { describe, expect, it } from "vitest";
import { createGithubBoundedReadContext, readBoundedResponse } from "./github-bounded-read";
describe("bounded streamed GitHub responses", () => {
  it("counts actual multibyte bytes despite misleading length and shares ledger", async () => {
    const context = createGithubBoundedReadContext(Date.now() + 1000, 6);
    try {
      expect(await readBoundedResponse(new Response("abc"), context, 6)).toBe("abc");
      await expect(readBoundedResponse(new Response("éé", { headers: { "content-length": "1" } }), context, 6)).rejects.toThrow("byte-cap");
      expect(context.remainingBytes).toBeLessThan(0);
    } finally { context.dispose(); }
  });
  it("cancels absent-length streams at per-response cap", async () => {
    let cancelled = false;
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(20)); }, cancel() { cancelled = true; } });
    const context = createGithubBoundedReadContext(Date.now() + 1000, 100);
    try { await expect(readBoundedResponse(new Response(stream), context, 10)).rejects.toThrow("byte-cap"); expect(cancelled).toBe(true); }
    finally { context.dispose(); }
  });
  it("aborts stalled streams at the total deadline", async () => {
    const context = createGithubBoundedReadContext(Date.now() + 20, 100);
    try { await expect(readBoundedResponse(new Response(new ReadableStream()), context, 100)).rejects.toThrow("deadline"); }
    finally { context.dispose(); }
  });
});