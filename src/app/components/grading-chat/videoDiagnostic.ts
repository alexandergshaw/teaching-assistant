// VIDEO-GRADING W2 (docs/video-grading-chat-intake-ops.md section 9): Session
// Diagnostic Log timing for the `prepare_video` seam on the "grading" surface.
// Mirrors chatSeamDiagnostic.ts: the DECISION is a pure leaf, the thin
// recorder below calls the browser-only wrapper.
//
// TYPED, NOT TEXT-PARSED (ops O-7). The failure class arrives as a
// VideoFailureClass produced by the server or the transport; it is never
// recovered from a message. The recorded `error` is EXACTLY a member of
// VIDEO_FAILURE_CLASSES, so no filename, size, storage path, student name,
// bytes, `fileUri` or `displayName` can reach the log (the user-visible
// message may name the file; the diagnostic never does).
//
// BROWSER-ONLY, like the module it wraps: nothing under src/app/api,
// src/app/actions or any "use server" file may import this.
import { recordGradingDiagnosticEntry } from "@/app/components/grading/gradingDiagnosticLog";
import { isVideoFailureClass, type VideoFailureClass, type VideoOutcomes, VIDEO_FAILURE_CLASSES } from "@/lib/grade/video-failure";

export interface VideoDiagnosticDecision {
  operation: "prepare_video";
  outcome: "success" | "failure";
  durationMs: number;
  /** A member of VIDEO_FAILURE_CLASSES; present only on failure. */
  error?: VideoFailureClass;
}

function elapsedMs(startedAtMs: number, settledAtMs: number): number {
  return Math.max(0, Math.round(settledAtMs - startedAtMs));
}

/** PURE. `null` when no start was captured. `failure` null = success. A value
 * that is not a class (a caller that smuggled text through a cast) is recorded
 * as "extraction failed", never verbatim. */
export function decideVideoDiagnostic(args: {
  startedAtMs: number | null;
  settledAtMs: number;
  failure: VideoFailureClass | null;
}): VideoDiagnosticDecision | null {
  if (args.startedAtMs === null) return null;
  const durationMs = elapsedMs(args.startedAtMs, args.settledAtMs);
  if (args.failure === null) return { operation: "prepare_video", outcome: "success", durationMs };
  const error: VideoFailureClass = isVideoFailureClass(args.failure) ? args.failure : "extraction failed";
  return { operation: "prepare_video", outcome: "failure", durationMs, error };
}

/**
 * PURE. Fans the in-zip `videoOutcomes` counts out to one decision per video
 * part (ops 9.2): `accepted` success entries, then one failure entry per class
 * occurrence, each carrying the zip prepare's `durationMs`. Counts only; the
 * ledger never held a name.
 */
export function fanOutVideoOutcomes(outcomes: VideoOutcomes | undefined, durationMs: number): VideoDiagnosticDecision[] {
  if (!outcomes) return [];
  const out: VideoDiagnosticDecision[] = [];
  for (let i = 0; i < outcomes.accepted; i += 1) {
    out.push({ operation: "prepare_video", outcome: "success", durationMs });
  }
  for (const failure of VIDEO_FAILURE_CLASSES) {
    const count = outcomes.failed[failure] ?? 0;
    for (let i = 0; i < count; i += 1) {
      out.push({ operation: "prepare_video", outcome: "failure", durationMs, error: failure });
    }
  }
  return out;
}

function record(decision: VideoDiagnosticDecision): void {
  recordGradingDiagnosticEntry({
    at: new Date().toISOString(),
    operation: decision.operation,
    outcome: decision.outcome,
    durationMs: decision.durationMs,
    error: decision.error,
  });
}

/** The thin caller for ONE loose video: decide, then record. Returns whether an
 * entry was recorded. `settledAtMs` is a performance.now() capture. */
export function recordVideoSettled(args: {
  startedAtMs: number | null;
  settledAtMs: number;
  failure: VideoFailureClass | null;
}): boolean {
  const decision = decideVideoDiagnostic(args);
  if (!decision) return false;
  record(decision);
  return true;
}

/** The thin caller for a zip's ledger: records one entry per counted video
 * outcome. Returns how many were recorded. */
export function recordZipVideoOutcomes(args: {
  outcomes: VideoOutcomes | undefined;
  startedAtMs: number | null;
  settledAtMs: number;
}): number {
  if (args.startedAtMs === null) return 0;
  const decisions = fanOutVideoOutcomes(args.outcomes, elapsedMs(args.startedAtMs, args.settledAtMs));
  for (const decision of decisions) record(decision);
  return decisions.length;
}
