// DET-Wave 2 (docs/grading-recording-detection-reliability-scope.md): the
// COVERAGE-GAP signal. A post that enters and leaves the viewport inside the
// 1.2s inter-keep interval is never sampled, and the existing "scrolled too
// fast" notice is bound to the backpressure counter, so it cannot observe
// that loss. Comparing consecutive KEPT frames can: if two consecutive kept
// frames are so different that no content could plausibly overlap, whatever
// scrolled past between them was never seen.
//
// The metric is the capture's own: framesDifferEnough's mean absolute
// difference across the 32x32 luma signature (discussion-capture.ts), only
// with a much higher bound than the keep gate's FRAME_CHANGE_THRESHOLD. The
// keep gate asks "did anything change"; this asks "did EVERYTHING change".

import { framesDifferEnough, type FrameSignature } from "../recording/discussion-capture";

/** Mean absolute luma difference (0-255) above which two consecutive kept
 *  frames are treated as having no overlap. A heuristic bound - roughly three
 *  times the keep gate's own 6 - tunable once real recordings are measured. */
export const COVERAGE_FULL_TURNOVER_MAD = 20;

export interface CoverageGapResult {
  /** Number of consecutive pairs compared (signatures.length - 1, floor 0). */
  pairsCompared: number;
  /** Pairs whose difference exceeded the full-turnover bound. */
  gapCount: number;
  /** For each gap, the index of the EARLIER frame of the pair. */
  gapAfter: number[];
}

export const EMPTY_COVERAGE_GAP: CoverageGapResult = { pairsCompared: 0, gapCount: 0, gapAfter: [] };

/** Compares each consecutive pair of kept-frame signatures. A pair is a gap
 *  when framesDifferEnough(a, b, fullTurnoverMad) - strictly greater than the
 *  bound, so a pair exactly at the bound is NOT a gap. */
export function detectCoverageGap(
  signatures: ReadonlyArray<FrameSignature>,
  fullTurnoverMad: number = COVERAGE_FULL_TURNOVER_MAD
): CoverageGapResult {
  const gapAfter: number[] = [];
  for (let i = 0; i + 1 < signatures.length; i++) {
    if (framesDifferEnough(signatures[i], signatures[i + 1], fullTurnoverMad)) gapAfter.push(i);
  }
  return { pairsCompared: Math.max(0, signatures.length - 1), gapCount: gapAfter.length, gapAfter };
}

/** Accumulates a batch's result into the run total. gapAfter indexes are
 *  batch-local, so the run total keeps only the counts. */
export function mergeCoverageGap(
  prev: { pairsCompared: number; gapCount: number },
  next: CoverageGapResult
): { pairsCompared: number; gapCount: number } {
  return { pairsCompared: prev.pairsCompared + next.pairsCompared, gapCount: prev.gapCount + next.gapCount };
}
