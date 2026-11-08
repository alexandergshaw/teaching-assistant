import { describe, expect, it, vi } from "vitest";
import { IngestResponseLimitError, readBoundedIngestLines } from "./bounded-ingest-lines";

describe("bounded ZIP ingest response", () => {
  it("accepts the exact byte limit with chunked multibyte text", async () => {
    const data = new TextEncoder().encode("é\n");
    const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of data) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
    const result: string[] = [];
    for await (const line of readBoundedIngestLines(stream, data.length)) result.push(line);
    expect(result).toEqual(["é"]);
  });
  it("refuses and cancels an over-limit stream before consuming more data", async () => {
    const cancel = vi.fn(); let reads = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { reads++; controller.enqueue(Uint8Array.of(97, 98)); }, cancel });
    const consume = async () => { for await (const unused of readBoundedIngestLines(stream, 3)) void unused; };
    await expect(consume()).rejects.toBeInstanceOf(IngestResponseLimitError);
    expect(cancel).toHaveBeenCalledTimes(1); expect(reads).toBeLessThanOrEqual(3);
  });
  it("cancels when a caller stops after the terminal line", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("done\n")); }, cancel });
    for await (const line of readBoundedIngestLines(stream, 20)) { expect(line).toBe("done"); break; }
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("bounds excessive tiny chunks as well as bytes", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(Uint8Array.of(97)); }, cancel });
    const consume = async () => { for await (const unused of readBoundedIngestLines(stream, 100, 3)) void unused; };
    await expect(consume()).rejects.toBeInstanceOf(IngestResponseLimitError); expect(cancel).toHaveBeenCalledTimes(1);
  });
});
