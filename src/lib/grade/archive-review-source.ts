import "server-only";
import { ARCHIVE_REVIEW_MAX_BYTES } from "./archive-review-snapshot";
import { validReviewId } from "./archive-review-principal";

/** A dedicated prefix is deliberately outside the generic age-only sweep. */
export function archiveReviewSourcePath(ownerId: string, reviewId: string, sourceId: string): string {
  if (!validReviewId(ownerId) || !validReviewId(reviewId) || !validReviewId(sourceId)) throw new Error("The archive review source is unavailable.");
  return `${ownerId}/grading-review-uploads/${reviewId}/${sourceId}.zip`;
}

export function isArchiveReviewSourcePath(ownerId: string, reviewId: string, path: string): boolean {
  if (!validReviewId(ownerId) || !validReviewId(reviewId) || typeof path !== "string" || path.length > 200) return false;
  const parts = path.split("/");
  return parts.length === 4 && parts[0] === ownerId && parts[1] === "grading-review-uploads" && parts[2] === reviewId && parts[3].endsWith(".zip") && validReviewId(parts[3].slice(0, -4));
}

const UNAVAILABLE = "The archive review source could not be read.";
const MAX_CHUNKS = 8192;

async function readNext(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) throw new Error(UNAVAILABLE);
  let rejectAbort!: (reason: Error) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(new Error(UNAVAILABLE));
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) throw new Error(UNAVAILABLE);
    return await Promise.race([reader.read(), aborted]);
  } finally { signal.removeEventListener("abort", onAbort); }
}

/**
 * Bounds bytes while reading, including when Content-Length is missing or
 * dishonest. The caller must authenticate the owner and use a fixed trusted
 * Storage origin with redirects disabled before constructing the response.
 */
export async function readArchiveReviewResponse(response: Response, maxBytes: number, signal: AbortSignal): Promise<Uint8Array> {
  const rejectResponse = (): never => {
    try { if (response.body) void response.body.cancel().catch(() => {}); } catch { /* Best effort. */ }
    throw new Error(UNAVAILABLE);
  };
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > ARCHIVE_REVIEW_MAX_BYTES || signal.aborted || response.status !== 200 || response.redirected || !response.body || response.headers.has("content-range")) return rejectResponse();
  const encoding = response.headers.get("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity") return rejectResponse();
  const header = response.headers.get("content-length");
  if (header !== null && (!/^(0|[1-9][0-9]*)$/.test(header) || !Number.isSafeInteger(Number(header)) || Number(header) > maxBytes)) return rejectResponse();
  const expected = header === null ? null : Number(header);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0, complete = false;
  try {
    while (true) {
      const result = await readNext(reader, signal);
      if (signal.aborted) throw new Error(UNAVAILABLE);
      if (result.done) break;
      if (!(result.value instanceof Uint8Array) || chunks.length >= MAX_CHUNKS) throw new Error(UNAVAILABLE);
      total += result.value.byteLength;
      if (total > maxBytes || (expected !== null && total > expected)) throw new Error(UNAVAILABLE);
      chunks.push(result.value.slice());
    }
    if (expected !== null && total !== expected) throw new Error(UNAVAILABLE);
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    if (signal.aborted) throw new Error(UNAVAILABLE);
    complete = true;
    return bytes;
  } finally {
    if (!complete) void reader.cancel().catch(() => {});
    try { reader.releaseLock(); } catch { /* Cancellation remains best effort. */ }
  }
}
