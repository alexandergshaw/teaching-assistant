"use client";

// Message replies - assembling the downloadable run log (M19, docs/
// message-replies-acceptance-criteria.md section 8). Mirrors
// src/app/components/recording/useDiscussionRepliesRunLog.ts's own shape:
// COLLECTION (the event streams, appended to at the moment each event
// happens) lives in useMessageReplies.ts; this hook only gathers those
// already-collected inputs plus the current `rawRows` snapshot and calls
// message-replies-log.ts's `buildMessageRepliesLog` - the same
// collection-vs-assembly split that file's own header documents.

import { useMemo } from "react";
import {
  buildMessageRepliesLog,
  type MessageRepliesLogBatch,
  type MessageRepliesLogNotice,
  type MessageRepliesLogRetry,
  type MessageRepliesRunLog,
} from "./message-replies-log";
import type { MessageCompositionSettings } from "@/lib/message-reply-prompt";
import type { MessageThreadRow } from "./message-serialization";

export interface UseMessageRepliesRunLogArgs {
  logStartedAt: string;
  logEndedAt: string;
  courseName: string;
  composition: MessageCompositionSettings;
  signoffSet: boolean;
  skipAnswered: boolean;
  logFramesCaptured: number;
  droppedFrames: number;
  stalled: boolean;
  logBatches: MessageRepliesLogBatch[];
  logAllNotices: MessageRepliesLogNotice[];
  logRetries: MessageRepliesLogRetry[];
  /** The UNFILTERED table - a search-box keystroke must never make the
   *  downloaded log silently omit a row the instructor cannot currently see. */
  rawRows: MessageThreadRow[];
}

export function useMessageRepliesRunLog(args: UseMessageRepliesRunLogArgs): MessageRepliesRunLog {
  const {
    logStartedAt,
    logEndedAt,
    courseName,
    composition,
    signoffSet,
    skipAnswered,
    logFramesCaptured,
    droppedFrames,
    stalled,
    logBatches,
    logAllNotices,
    logRetries,
    rawRows,
  } = args;

  return useMemo(
    () =>
      buildMessageRepliesLog({
        startedAt: logStartedAt,
        endedAt: logEndedAt,
        courseName,
        ingredients: composition.ingredients,
        formality: composition.formality,
        addressByName: composition.addressByName,
        signoffSet,
        skipAnswered,
        framesCaptured: logFramesCaptured,
        droppedFrames,
        stalled,
        batches: logBatches,
        notices: logAllNotices,
        retries: logRetries,
        rawRows,
      }),
    [
      logStartedAt,
      logEndedAt,
      courseName,
      composition,
      signoffSet,
      skipAnswered,
      logFramesCaptured,
      droppedFrames,
      stalled,
      logBatches,
      logAllNotices,
      logRetries,
      rawRows,
    ]
  );
}
