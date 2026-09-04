// Message replies (Manual > Recording > Message replies) - the capture
// loop's consumer: reads pending frames off the capture buffer, extracts
// student messages from them (M8), merges them into the table (M9), and
// enqueues newly-added, eligible rows for drafting. Pulled out of
// useMessageReplies.ts (which had grown past its ~500-line budget) mirroring
// message-draft-loop.ts's own shape: an injected-dependency async function,
// no hook render needed - vitest in this repo is node-env and renders
// nothing, so a loop like this one needs to live in a plain function to have
// a real test surface at all.
//
// The table's epoch (`rowsApiRef.current.tableEpochRef.current`) is
// snapshotted BEFORE the extraction request goes out and re-read AFTER it
// lands. `clearTable()` bumps that counter the instant it fires; without
// this check, a `clearTable()` click made while an extraction was in flight
// would have its results merged back in a few hundred milliseconds later,
// silently resurrecting threads the instructor had just deleted. When the
// epoch has moved, the batch is logged as `discarded: true`
// (message-replies-log.ts's own `makeMessageRepliesLogBatch` supports this
// "discarded" lane) and the merge is skipped entirely.

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { EXTRACT_BATCH_WIRE_BUDGET, draftDispatchForce, shouldLoopContinue, type CapturedFrame } from "../recording/discussion-capture";
import { getStoredProvider } from "@/lib/llm-provider";
import { EXTRACT_BATCH_SIZE, type ExtractedMessage } from "@/lib/message-reply-prompt";
import type { MessageThreadRow } from "./message-serialization";
import type { UseMessageRowsReturn } from "./useMessageRows";
import type { makeMessageRepliesLogBatch } from "./message-replies-log";

/** M12/M9's own eligibility for a row entering the AUTOMATIC draft queue -
 * never previewOnly (no thread body to draft from) or skipped, and
 * (`skipAnswered` on, the default) never answered. Exported for
 * message-extraction-loop.test.ts's own direct coverage, and because
 * useMessageReplies.ts's wiring test still needs to see the name at its call
 * site. */
export function isAutoDraftEligible(row: MessageThreadRow, skipAnswered: boolean): boolean {
  if (row.previewOnly || row.skipped) return false;
  if (skipAnswered && row.answered) return false;
  return true;
}

export type ExtractMessagesAction = (
  frames: CapturedFrame[],
  courseName: string,
  provider: string
) => Promise<{ messages: ExtractedMessage[] } | { error: string }>;

export interface RunMessageExtractionLoopDeps {
  loopsActiveRef: MutableRefObject<boolean>;
  loopEpochRef: MutableRefObject<number>;
  captureRef: MutableRefObject<{
    pendingFrames: number;
    takeFrameBatch: (count: number, wireBudget: number) => CapturedFrame[];
  }>;
  waitForWake: () => Promise<void>;
  rowsApiRef: MutableRefObject<UseMessageRowsReturn>;
  courseNameRef: MutableRefObject<string>;
  instructorNameRef: MutableRefObject<string>;
  skipAnsweredRef: MutableRefObject<boolean>;
  setExtracting: Dispatch<SetStateAction<boolean>>;
  /** Stamps `at` itself (Date.now()) and folds the batch into both the
   *  frames-captured tally and the batches list - the orchestrator owns
   *  where those actually live (useState), this loop only reports events. */
  recordBatch: (framesInBatch: number, args: Omit<Parameters<typeof makeMessageRepliesLogBatch>[0], "at" | "framesInBatch">) => void;
  enqueueDrafts: (ids: string[], force: boolean) => void;
  /** M15: "whenever a thread merges afterwards" - called only when a merge
   *  actually changed the table. */
  onMerged: () => void;
  pushNotice: (text: string) => void;
  /** Injected rather than imported directly - this file stays decoupled from
   *  "@/app/actions/message-replies" the same way message-draft-loop.ts
   *  stays decoupled from its own action module. */
  extractAction: ExtractMessagesAction;
}

export async function runMessageExtractionLoop(epoch: number, deps: RunMessageExtractionLoopDeps): Promise<void> {
  const {
    loopsActiveRef,
    loopEpochRef,
    captureRef,
    waitForWake,
    rowsApiRef,
    courseNameRef,
    instructorNameRef,
    skipAnsweredRef,
    setExtracting,
    recordBatch,
    enqueueDrafts,
    onMerged,
    pushNotice,
    extractAction,
  } = deps;

  while (shouldLoopContinue(loopsActiveRef.current, loopEpochRef.current, epoch)) {
    const cap = captureRef.current;
    if (cap.pendingFrames === 0) {
      await waitForWake();
      continue;
    }

    const frames = cap.takeFrameBatch(EXTRACT_BATCH_SIZE, EXTRACT_BATCH_WIRE_BUDGET);
    if (frames.length === 0) {
      await waitForWake();
      continue;
    }

    const provider = getStoredProvider();
    const courseName = courseNameRef.current;
    // See this file's header: the epoch is snapshotted BEFORE the request.
    const epochBeforeRequest = rowsApiRef.current.tableEpochRef.current;

    if (loopsActiveRef.current) setExtracting(true);
    let result: Awaited<ReturnType<ExtractMessagesAction>>;
    try {
      result = await extractAction(frames, courseName, provider);
    } catch (err) {
      result = { error: err instanceof Error ? err.message : "Could not read messages from the screen." };
    }
    if (!loopsActiveRef.current) return;
    setExtracting(false);

    if ("error" in result) {
      recordBatch(frames.length, { error: result.error });
      pushNotice(`Some of the screen could not be read: ${result.error} Capture is still running.`);
      continue;
    }
    if (result.messages.length === 0) {
      recordBatch(frames.length, {});
      continue;
    }

    if (rowsApiRef.current.tableEpochRef.current !== epochBeforeRequest) {
      // The table was cleared (or otherwise whole-table-rewritten) while
      // this request was in flight - merging these results back in would
      // resurrect threads the instructor just deleted. Log it as discarded
      // and drop the results on the floor.
      recordBatch(frames.length, { messagesExtracted: result.messages.length, discarded: true });
      continue;
    }

    const merged = rowsApiRef.current.mergeIncoming(result.messages, {
      instructorName: instructorNameRef.current,
      capturedAtMs: Date.now(),
      now: Date.now(),
    });
    recordBatch(frames.length, { messagesExtracted: result.messages.length, messagesAdded: merged.addedIds.length, capped: merged.capped });
    if (merged.capped) {
      pushNotice("The message table is full. Delete it, or remove some threads, to keep capturing.");
    }
    if (merged.addedIds.length > 0) {
      const addedSet = new Set(merged.addedIds);
      const eligible = merged.rows
        .filter((r) => addedSet.has(r.id) && isAutoDraftEligible(r, skipAnsweredRef.current))
        .map((r) => r.id);
      if (eligible.length > 0) enqueueDrafts(eligible, draftDispatchForce("auto"));
    }
    // M15: "on capture stop and whenever a thread merges afterwards."
    if (merged.changed) onMerged();
  }
}
