// A38 wave 0 (docs/a38-wave-plan.md section 3.1): the capture-drain
// extraction pipeline, extracted whole out of GradingRecordingPanel.tsx -
// `runExtraction` and the drain effect that keeps it fed as frames arrive,
// together with the `extracting` state they own. This is a byte-identical
// relocation (modulo the params-object destructure below and the
// `return { extracting }`), not a rewrite: both dep arrays, the render-value
// (never ref) read of `gradingRows.rawRows`, the `await Promise.resolve()`
// microtask gate, and the drain effect's `cancelled` flag are unchanged from
// the panel's own prior copy - see that panel's still-present header comment
// (the "Collection ... lives here, mirroring useDiscussionReplies.ts's own
// split" note) for why this shape exists in the first place.
//
// Pin-free (docs/a38-wave-plan.md section 3.2): no test in this repo reads
// `runExtraction`, the drain effect, `setLogBatches`, `setTotalReadingsCount`
// or `totalReadingsCount` as source text, so this move's correctness is
// proven by the whole suite staying green with no test edited, plus reading,
// plus tsc/lint/build - not by any assertion here (RES-A38WP-4).

import { useCallback, useEffect, useState } from "react";
import { EXTRACT_BATCH_WIRE_BUDGET } from "../recording/discussion-capture";
import type { LlmProvider } from "@/lib/llm";
import { extractGradingSubmissionsAction } from "@/app/actions/grading-submission-extract";
import { GRADING_EXTRACT_BATCH_SIZE } from "./grading-extraction-prompt";
import { matchNameAgainstRoster } from "./grading-roster-match";
import { parseRosterNames } from "./grading-course-roster";
import type { GradingRow } from "./grading-row";
import type { UseGradingRowsReturn } from "./useGradingRows";
import type { UseGradingCaptureTrackingReturn } from "./useGradingCaptureTracking";
import { describeExtractionOutcome, type GradingExtractionOutcome } from "./grading-extraction-outcome";
import { makeGradingRecordingLogBatch, type GradingRecordingLogBatch } from "./grading-recording-log";

interface UseGradingRecordingExtractionParams {
  takeFrameBatch: (max: number, maxWireBytes: number) => { base64: string }[];
  pendingFrames: number;
  provider: LlmProvider;
  pushNotices: (outcomes: GradingExtractionOutcome[]) => void;
  gradingRows: UseGradingRowsReturn;
  selectedRosterText: string | null;
  capture: UseGradingCaptureTrackingReturn;
  setLogBatches: React.Dispatch<React.SetStateAction<GradingRecordingLogBatch[]>>;
  setTotalReadingsCount: React.Dispatch<React.SetStateAction<number>>;
}

export interface UseGradingRecordingExtractionReturn {
  extracting: boolean;
}

export function useGradingRecordingExtraction({
  takeFrameBatch,
  pendingFrames,
  provider,
  pushNotices,
  gradingRows,
  selectedRosterText,
  capture,
  setLogBatches,
  setTotalReadingsCount,
}: UseGradingRecordingExtractionParams): UseGradingRecordingExtractionReturn {
  const [extracting, setExtracting] = useState(false);

  const runExtraction = useCallback(async () => {
    const frames = takeFrameBatch(GRADING_EXTRACT_BATCH_SIZE, EXTRACT_BATCH_WIRE_BUDGET);
    if (frames.length === 0) return;
    // AGENTS.md's setState-in-effect idiom: this function is invoked
    // (`void runExtraction()`) from the drain effect below - a setState
    // reached SYNCHRONOUSLY from an effect (even indirectly, through a
    // called function) is what react-hooks/set-state-in-effect rejects. The
    // microtask hop below is a real gate, not a no-op - it is what makes
    // every setState from here on happen strictly AFTER the effect body has
    // returned, exactly like AiChatFab.tsx's own tone-status effect.
    await Promise.resolve();
    setExtracting(true);
    try {
      const result = await extractGradingSubmissionsAction(
        frames.map((f) => ({ base64: f.base64 })),
        provider
      );
      if ("error" in result) {
        setLogBatches((prev) => [
          ...prev,
          makeGradingRecordingLogBatch({ at: new Date().toISOString(), framesInBatch: frames.length, error: result.error }),
        ]);
        pushNotices(describeExtractionOutcome(result, 0));
        return;
      }
      // A9/RES-A9-9: the RENDER value (gradingRows.rawRows), never
      // rawRowsRef.current - the ref is one commit stale (see the panel's
      // own effect that writes it), and on the render where
      // courseId/assessmentId change, gradingRows.rawRows is already the new
      // scope's slice while the ref still holds the old one. Reading the ref
      // here would feed a stale course's rows against this call's freshly-
      // scoped accumulator, reproducing the course-switch misattribution
      // REGRESSION.md entry 428f records. capture.advance persists the
      // dismissed projection AFTER committing rows - see
      // commitCaptureAdvance's own header for why the order matters.
      let nextRows: GradingRow[] = [];
      const advance = capture.advance(gradingRows.rawRows, result.submissions, (rows) => {
        nextRows = rows;
        gradingRows.setAllRows(rows);
      });
      setLogBatches((prev) => [
        ...prev,
        makeGradingRecordingLogBatch({
          at: new Date().toISOString(),
          framesInBatch: frames.length,
          submissionsExtracted: result.submissions.length,
          added: advance.addedCount,
          merged: advance.mergedCount,
          skippedUnnamed: result.skippedUnnamed,
          confirmedEmpty: result.confirmedEmpty,
        }),
      ]);
      pushNotices(describeExtractionOutcome(result, advance.addedCount));
      setTotalReadingsCount((prev) => prev + advance.addedCount + advance.mergedCount);

      // R3a: roster-match every row in THIS synced table right away, so a
      // newly-minted row never sits at the neutral "no-roster" default for
      // longer than one tick when a real roster is already selected.
      const rosterNames = parseRosterNames(selectedRosterText);
      for (const row of nextRows) {
        const match = matchNameAgainstRoster(row.studentName, rosterNames);
        gradingRows.applyRosterMatch(row.id, match);
      }
    } finally {
      setExtracting(false);
    }
    // `setLogBatches`/`setTotalReadingsCount` are the panel's React setState
    // dispatch functions, guaranteed referentially stable by React - the
    // same guarantee this hook's own `setExtracting` (declared right in this
    // file) gets for free and eslint recognises automatically. Received here
    // as plain parameters instead, eslint no longer sees that guarantee and
    // flags them as missing - a lint-only artifact of the params-object
    // boundary, not a real dependency; the dep array itself is unchanged
    // from the panel's pre-move copy (docs/a38-wave-plan.md section 7).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takeFrameBatch, provider, pushNotices, gradingRows, selectedRosterText, capture]);

  // Drains the capture queue as frames arrive, and keeps draining after Stop
  // - mirroring useDiscussionCapture's own documented contract ("the
  // extraction loop outlives capturing===false and drains it to empty").
  //
  // AGENTS.md's setState-in-effect idiom, applied the same way AiChatFab.tsx's
  // own tone-status effect does: an inline async IIFE with a `cancelled`
  // flag, invoked from the effect body rather than calling a setState-
  // touching function directly - react-hooks/set-state-in-effect traces a
  // same-file useCallback's body and flags a setState reachable from it, so
  // `runExtraction` (which does set state, after its own await gate) is
  // called from inside this wrapper instead of directly from the effect.
  useEffect(() => {
    if (extracting) return;
    if (pendingFrames === 0) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await runExtraction();
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingFrames, extracting, runExtraction]);

  return { extracting };
}
