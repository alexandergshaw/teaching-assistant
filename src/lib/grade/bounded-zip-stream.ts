/** Read a Storage response without trusting metadata or buffering an unlimited Blob. */
export async function readBoundedZipStream(
  stream: ReadableStream<Uint8Array>, maxBytes: number, signal: AbortSignal, overLimitMessage: string,
): Promise<Blob> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let reads = 0;
  let completed = false;
  let rejectAbort!: (error: Error) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => rejectAbort(new Error("Upload preparation timed out."));
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      const result = await Promise.race([reader.read(), aborted]);
      if (signal.aborted) throw new Error("Upload preparation timed out.");
      if (result.done) { completed = true; break; }
      if (++reads > 65536) throw new Error("The uploaded ZIP arrived in too many pieces. Please try uploading it again.");
      if (result.value.byteLength === 0) continue;
      size += result.value.byteLength;
      if (size > maxBytes) throw new Error(overLimitMessage);
      chunks.push(result.value.slice());
    }
    return new Blob(chunks as BlobPart[]);
  } finally {
    signal.removeEventListener("abort", abort);
    if (!completed) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
