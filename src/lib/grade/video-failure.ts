// VIDEO-GRADING W2 (docs/video-grading-chat-intake-ops.md section 9): the ONE
// owner of the video failure vocabulary. Pure leaf, no imports: reachable from
// the server routes (which TYPE a failure) and from the browser recorder
// (which records it) alike.
//
// The class travels as a TYPED field end to end. It is never recovered from
// message text: the existing text classifier (chatSeamDiagnostic.ts) tests its
// limit pattern before its too-large pattern and so mis-buckets a size
// refusal (ops O-7). NO STUDENT DATA: a class is a fixed string, never a
// filename, size, path, byte or provider URI.

export const VIDEO_FAILURE_CLASSES = [
  "too large",
  "too many videos",
  "unsupported format",
  "upload failed",
  "extraction failed",
  "model rejected",
  "timed out",
  "not supported here",
] as const;

export type VideoFailureClass = (typeof VIDEO_FAILURE_CLASSES)[number];

export function isVideoFailureClass(value: unknown): value is VideoFailureClass {
  return typeof value === "string" && (VIDEO_FAILURE_CLASSES as readonly string[]).includes(value);
}

/** COUNTS only (additive on the ingest ledger; never names or paths). */
export interface VideoOutcomes {
  readonly accepted: number;
  readonly failed: Readonly<Partial<Record<VideoFailureClass, number>>>;
}

export function emptyVideoOutcomes(): VideoOutcomes {
  return { accepted: 0, failed: {} };
}

/** Returns a new tally with one more accepted video. */
export function withAcceptedVideo(outcomes: VideoOutcomes): VideoOutcomes {
  return { accepted: outcomes.accepted + 1, failed: outcomes.failed };
}

/** Returns a new tally with one more failure of `failure`. */
export function withFailedVideo(outcomes: VideoOutcomes, failure: VideoFailureClass): VideoOutcomes {
  return { accepted: outcomes.accepted, failed: { ...outcomes.failed, [failure]: (outcomes.failed[failure] ?? 0) + 1 } };
}

/** Coerces untrusted wire data to VideoOutcomes, or undefined when absent or malformed. */
export function parseVideoOutcomes(value: unknown): VideoOutcomes | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as { accepted?: unknown; failed?: unknown };
  const accepted = typeof raw.accepted === "number" && Number.isInteger(raw.accepted) && raw.accepted >= 0 ? raw.accepted : 0;
  let outcomes: VideoOutcomes = { accepted, failed: {} };
  if (typeof raw.failed === "object" && raw.failed !== null) {
    for (const cls of VIDEO_FAILURE_CLASSES) {
      const n = (raw.failed as Record<string, unknown>)[cls];
      if (typeof n === "number" && Number.isInteger(n) && n > 0) {
        outcomes = { accepted: outcomes.accepted, failed: { ...outcomes.failed, [cls]: n } };
      }
    }
  }
  return outcomes;
}
