"use client";

// Wave 2 of A9 (docs/REGRESSION.md entry 428): wiring only. Every decision
// (the four advanceGradingCapture branches, the seed, the read-modify-write,
// the Clear-table reset) lives in grading-capture-sync.ts /
// grading-capture-tombstones.ts, plain .ts leaves vitest can call directly -
// nothing in this repo can execute a React hook (docs/loop/this-repo.md), so
// anything decided IN a hook would be unassertable. This file holds the
// `tracked` ref and the seed effect, and returns the two composed handlers
// plus an `advance` that delegates to `commitCaptureAdvance`.
//
// SEED EFFECT: reads `rawRows` - the RENDER value GradingRecordingPanel.tsx
// passes in (`gradingRows.rawRows`), never a ref of its own - and re-seeds
// ONLY when `courseScope` changes (the dependency array below is
// `[courseScope]`, deliberately NOT `[rawRows]`). Depending on `rawRows`
// instead would re-seed on every commit and drop every joined continuation
// text the accumulator was carrying forward. Reading a ref instead of the
// render value would reproduce REGRESSION.md entry 428f's course-switch
// defect: on the render where `courseScope` changes, the render value is
// already the new scope's slice while any ref mirroring it would still hold
// the old one (see GradingRecordingPanel.tsx's runExtraction for the same
// reasoning applied to `advance`).

import { useCallback, useEffect, useRef } from "react";
import type { GradingRow } from "./grading-row";
import type { TrackedSubmission } from "./grading-capture-sync";
import type { ExtractedSubmission } from "./grading-submission-merge";
import {
  commitCaptureAdvance,
  commitDismissal,
  commitTrackingReset,
  composeClearHandler,
  composeRemoveHandler,
  readDismissed,
  seedTrackedFromRows,
} from "./grading-capture-tombstones";

export interface UseGradingCaptureTrackingReturn {
  /** Reconciles `incoming` against the accumulator and `rows`, commits the
   *  next row table via `commitRows`, and persists the dismissed projection
   *  - see commitCaptureAdvance's own header for the exact order. */
  advance: (
    rows: ReadonlyArray<GradingRow>,
    incoming: ReadonlyArray<ExtractedSubmission>,
    commitRows: (rows: GradingRow[]) => void
  ) => { addedCount: number; mergedCount: number; divergentRowIds: string[] };
  onRemoveRow: (id: string) => void;
  onClearTable: () => void;
}

export function useGradingCaptureTracking(
  removeRow: (id: string) => void,
  clearTable: () => void,
  courseScope: string | undefined,
  rawRows: ReadonlyArray<GradingRow>
): UseGradingCaptureTrackingReturn {
  const trackedRef = useRef<TrackedSubmission[]>([]);

  useEffect(() => {
    trackedRef.current = seedTrackedFromRows(rawRows, readDismissed(), courseScope, () => crypto.randomUUID());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseScope]);

  const advance = useCallback(
    (rows: ReadonlyArray<GradingRow>, incoming: ReadonlyArray<ExtractedSubmission>, commitRows: (rows: GradingRow[]) => void) => {
      const result = commitCaptureAdvance(
        { tracked: trackedRef.current, rows, incoming, courseScope, mintId: () => crypto.randomUUID() },
        commitRows
      );
      trackedRef.current = result.tracked;
      return { addedCount: result.addedCount, mergedCount: result.mergedCount, divergentRowIds: result.divergentRowIds };
    },
    [courseScope]
  );

  const recordDismissal = useCallback(
    (rowId: string) => {
      const result = commitDismissal(trackedRef.current, rowId, courseScope);
      trackedRef.current = result.tracked;
    },
    [courseScope]
  );

  const resetTracking = useCallback(() => {
    trackedRef.current = commitTrackingReset(courseScope);
  }, [courseScope]);

  // react-hooks/refs: composeRemoveHandler/composeClearHandler must not be
  // CALLED during render (both close over recordDismissal/resetTracking,
  // which read trackedRef.current) - useCallback only builds the composed
  // function inside the event-handler body, when onRemoveRow/onClearTable
  // are actually invoked, never at render time.
  const onRemoveRow = useCallback((id: string) => composeRemoveHandler(removeRow, recordDismissal)(id), [removeRow, recordDismissal]);
  const onClearTable = useCallback(() => composeClearHandler(clearTable, resetTracking)(), [clearTable, resetTracking]);

  return { advance, onRemoveRow, onClearTable };
}
