// Chunk planning and joining for transcribing a recorded take's audio.
// `transcribeLiveAudioAction` (src/app/actions/live-class.ts) accepts one WAV
// clip per request, bounded by the wire budget in src/lib/upload-budget.ts -
// a full-length lecture cannot go in one request. This module is the pure
// arithmetic for splitting a take's audio into sequential chunks and
// stitching the resulting transcript text back together; it owns no I/O and
// no browser API, so it is safe to unit test in Node.
//
// 60 seconds per chunk: 60s * 32000 bytes/sec (16kHz mono 16-bit PCM) =
// 1.92MB of WAV, ~2.56MB once base64-inflated for the wire - inside
// UPLOAD_WIRE_BUDGET_BYTES (3.5MB) with headroom left for the prompt text.
// Do not raise this without redoing that arithmetic.
export const TRANSCRIBE_CHUNK_SECONDS = 60;

export interface TranscriptChunkPlan {
  index: number;
  startSec: number;
  endSec: number;
}

/**
 * Splits `[0, durationSec)` into contiguous, non-overlapping chunks of at
 * most `chunkSeconds` (default TRANSCRIBE_CHUNK_SECONDS). The final chunk is
 * shorter than the rest whenever durationSec is not an exact multiple of
 * chunkSeconds.
 *
 * A duration that is zero, negative, NaN or Infinity returns an empty plan -
 * a MediaRecorder webm blob reports `duration: Infinity` until it has been
 * seeked (see ensureFiniteDuration in src/lib/caption-burn.ts), so a caller
 * that has not resolved a finite duration yet gets no chunks rather than an
 * infinite loop or a garbage plan.
 */
export function planTranscriptChunks(
  durationSec: number,
  chunkSeconds: number = TRANSCRIBE_CHUNK_SECONDS
): TranscriptChunkPlan[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  if (!Number.isFinite(chunkSeconds) || chunkSeconds <= 0) return [];

  const chunks: TranscriptChunkPlan[] = [];
  let start = 0;
  let index = 0;
  while (start < durationSec) {
    const end = Math.min(start + chunkSeconds, durationSec);
    chunks.push({ index, startSec: start, endSec: end });
    start = end;
    index += 1;
  }
  return chunks;
}

/**
 * Slices a decoded mono PCM buffer to the sample range a single chunk plan
 * covers, clamping both ends to `[0, mono.length]`. Returns a fresh
 * Float32Array (via `.slice`, not `.subarray`) so a chunk no longer holds a
 * view into the full decoded buffer once it has been sent - relevant because
 * the buffer this is called against can be tens of megabytes for a long
 * take's fallback (single-blob) extraction path.
 *
 * Only used on the extractAudioOnly fallback path (AC22a): when the sidecar
 * recorder produced rotated segments, the segments themselves are already
 * chunk-sized and this function is not needed at all.
 */
export function sliceMonoSamples(mono: Float32Array, sampleRate: number, plan: TranscriptChunkPlan): Float32Array {
  const length = mono.length;
  const startIdx = Math.max(0, Math.min(length, Math.round(plan.startSec * sampleRate)));
  const endIdx = Math.max(0, Math.min(length, Math.round(plan.endSec * sampleRate)));
  if (endIdx <= startIdx) return new Float32Array(0);
  return mono.slice(startIdx, endIdx);
}

/**
 * Joins per-chunk transcript text into one transcript: trims each part,
 * drops empties (transcribeLiveAudioAction returns "" for silence by design,
 * via its own normalizeTranscript - AC22d/trap 14), and joins the rest with a
 * single space. A chunk boundary can cut a word in half; this is accepted
 * rather than solved (no overlap, no stitching heuristic) - the result is
 * good enough to draft an announcement from, not offered as a caption track.
 */
export function joinTranscriptChunks(parts: ReadonlyArray<string>): string {
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" ");
}
