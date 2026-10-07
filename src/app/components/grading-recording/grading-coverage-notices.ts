// DET-Wave 3 (docs/grading-recording-detection-reliability-scope.md, Change 2
// and Change 3 display): the wording of the two NEW honesty signals, kept in a
// plain .ts leaf so the conditions that decide whether each one shows are
// unit-testable (no component is rendered by any test in this repo).
//
// THREE distinct signals reach the instructor and they are never merged:
//  - backpressure (droppedFramesTotal): extraction fell behind the capture.
//  - coverage gap (coverage.gapCount): consecutive kept frames did not overlap,
//    so content scrolled past between two kept frames. Backpressure cannot
//    observe this - it only counts frames the queue discarded.
//  - ledger (windowsUnread): a whole batch failed and its frames were never read.

import type { GradingExtractionLedger } from "./grading-extraction-ledger";

/** The coverage-gap notice, or null when no gap was detected. */
export function coverageGapNotice(gapCount: number): string | null {
  if (!(gapCount > 0)) return null;
  const noun = gapCount === 1 ? "gap" : "gaps";
  return `Capture may have skipped content where the screen scrolled quickly (${gapCount} ${noun} detected). Review the posts and add any that are missing.`;
}

/** The unread-windows notice, or null when every batch was read. */
export function ledgerUnreadNotice(ledger: GradingExtractionLedger): string | null {
  if (!(ledger.windowsUnread > 0)) return null;
  return `${ledger.windowsUnread} of ${ledger.windowsAttempted} capture windows could not be read. Scroll back over those sections, or add the missing posts by hand.`;
}
