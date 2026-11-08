/** Bounds the serialized ZIP ingest response, including encoded source bytes. */
export const MAX_INGEST_RESPONSE_BYTES = 256 * 1024 * 1024;
export const MAX_INGEST_RESPONSE_CHUNKS = 65_536;
export class IngestResponseLimitError extends Error {}

/** Cancel unfinished streams on refusal or when the caller stops at its sentinel. */
export async function* readBoundedIngestLines(body: ReadableStream<Uint8Array>, maxBytes = MAX_INGEST_RESPONSE_BYTES, maxChunks = MAX_INGEST_RESPONSE_CHUNKS): AsyncGenerator<string> {
  const reader = body.getReader(); const decoder = new TextDecoder();
  let pending: string[] = [], bytes = 0, chunks = 0, completed = false;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) { completed = true; break; }
      bytes += result.value.byteLength;
      chunks++;
      if (bytes > maxBytes || chunks > maxChunks) throw new IngestResponseLimitError();
      const decoded = decoder.decode(result.value, { stream: true });
      let start = 0, at = decoded.indexOf("\n");
      while (at >= 0) {
        pending.push(decoded.slice(start, at));
        const line = pending.join("").trim(); pending = [];
        if (line) yield line;
        start = at + 1; at = decoded.indexOf("\n", start);
      }
      pending.push(decoded.slice(start));
    }
    pending.push(decoder.decode());
    const tail = pending.join("").trim(); if (tail) yield tail;
  } finally {
    if (!completed) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
