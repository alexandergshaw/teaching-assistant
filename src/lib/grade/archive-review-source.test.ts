import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { archiveReviewSourcePath, isArchiveReviewSourcePath, readArchiveReviewResponse } from "./archive-review-source";

const OWNER = "11111111-1111-4111-8111-111111111111";
const REVIEW = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";

function response(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  const pending = [...chunks];
  return new Response(new ReadableStream<Uint8Array>({ pull(controller) { const next = pending.shift(); if (next) controller.enqueue(next); else controller.close(); } }), { status: 200, headers });
}

describe("archive review source", () => {
  it("uses a dedicated exact owner and review prefix", () => {
    const path = archiveReviewSourcePath(OWNER, REVIEW, FILE);
    expect(path).toBe(`${OWNER}/grading-review-uploads/${REVIEW}/${FILE}.zip`);
    expect(isArchiveReviewSourcePath(OWNER, REVIEW, path)).toBe(true);
    expect(isArchiveReviewSourcePath(REVIEW, REVIEW, path)).toBe(false);
    expect(isArchiveReviewSourcePath(OWNER, FILE, path)).toBe(false);
    expect(isArchiveReviewSourcePath(OWNER, REVIEW, path.replace("grading-review-uploads", "grading-uploads"))).toBe(false);
    expect(isArchiveReviewSourcePath(OWNER, REVIEW, path.replace(`${FILE}.zip`, `../${FILE}.zip`))).toBe(false);
  });

  it("reads streamed bytes with or without a trustworthy declared length", async () => {
    const signal = new AbortController().signal;
    expect([...await readArchiveReviewResponse(response([new Uint8Array([1, 2]), new Uint8Array([3])]), 3, signal)]).toEqual([1, 2, 3]);
    expect([...await readArchiveReviewResponse(response([new Uint8Array([1, 2, 3])], { "content-length": "3" }), 3, signal)]).toEqual([1, 2, 3]);
  });

  it("rejects oversized, truncated, partial or encoded responses", async () => {
    const signal = new AbortController().signal;
    for (const value of [
      response([new Uint8Array(4)]),
      response([new Uint8Array(1)], { "content-length": "4" }),
      response([new Uint8Array(1)], { "content-length": "2" }),
      response([new Uint8Array(1)], { "content-encoding": "gzip" }),
      response([new Uint8Array(1)], { "content-range": "bytes 0-0/1" }),
    ]) await expect(readArchiveReviewResponse(value, 3, signal)).rejects.toThrow();
  });

  it("cancels a stalled read on abort rather than waiting for storage", async () => {
    const cancelled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => {}), cancel: cancelled });
    const controller = new AbortController();
    const pending = readArchiveReviewResponse(new Response(stream), 100, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it("copies reusable stream buffers as each chunk arrives", async () => {
    const shared = new Uint8Array([1]);
    let index = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { if (index++ === 0) controller.enqueue(shared); else if (index === 2) { shared[0] = 2; controller.enqueue(shared); } else controller.close(); } }, { highWaterMark: 0 });
    expect([...await readArchiveReviewResponse(new Response(stream), 2, new AbortController().signal)]).toEqual([1, 2]);
  });
});
