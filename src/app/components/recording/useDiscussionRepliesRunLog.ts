"use client";

// Discussion reply capture - assembling the downloadable run log
// (docs/DEV_LOOP.md's rule; REGRESSION entries 369/372/373/374), split out
// of useDiscussionReplies.ts (set C3) purely to stay under
// recording-split.structure.test.ts's 1000-line ceiling on
// src/app/components/recording/ (non-recursive) - see that file's own
// header for the full account of what stayed and why.
//
// COLLECTION (the three event streams, appended to at the moment each event
// happens) stays in useDiscussionReplies.ts - that part has no test surface
// and is verified by reading only. This hook only gathers those already-
// collected inputs plus the current `rawRows` snapshot and calls
// discussion-replies-log.ts's `buildDiscussionRepliesRunLog` - the same
// COLLECTION-vs-ASSEMBLY split that file's own header documents, one layer
// further out.
//
// `courseName` is read the same way useDiscussionReplies.ts's own
// `courseNameRef` derives it (courses.find by id), not through that ref, so
// this hook's memo can name the real reactive inputs (`courses`, `courseId`)
// instead of a ref whose writes React cannot see.

import { useMemo } from "react";
import {
  buildDiscussionRepliesRunLog,
  type DiscussionRepliesLogBatch,
  type DiscussionRepliesLogNotice,
  type DiscussionRepliesLogRetry,
  type DiscussionRepliesRunLog,
} from "./discussion-replies-log";
import type { DiscussionAudience, ReplyCompositionSettings } from "@/lib/discussion-reply-prompt";
import type { ReplyRow } from "./discussion-capture";

export interface UseDiscussionRepliesRunLogArgs {
  logStartedAt: string;
  logEndedAt: string;
  audience: DiscussionAudience;
  courseId: string;
  courses: Array<{ id: string; name: string }> | null;
  composition: ReplyCompositionSettings;
  logFramesCaptured: number;
  droppedFrames: number;
  stalled: boolean;
  logBatches: DiscussionRepliesLogBatch[];
  logAllNotices: DiscussionRepliesLogNotice[];
  logRetries: DiscussionRepliesLogRetry[];
  /** F0-2/F11: the UNFILTERED table (`rowsApi.rawRows`, never the
   *  display-filtered `rows`) - a search-box keystroke must never make the
   *  downloaded log silently omit a row the instructor cannot currently
   *  see. */
  rawRows: ReplyRow[];
}

export function useDiscussionRepliesRunLog(args: UseDiscussionRepliesRunLogArgs): DiscussionRepliesRunLog {
  const {
    logStartedAt,
    logEndedAt,
    audience,
    courseId,
    courses,
    composition,
    logFramesCaptured,
    droppedFrames,
    stalled,
    logBatches,
    logAllNotices,
    logRetries,
    rawRows,
  } = args;

  return useMemo(() => {
    const courseName = courses?.find((c) => c.id === courseId)?.name ?? "";
    return buildDiscussionRepliesRunLog(
      {
        startedAt: logStartedAt,
        endedAt: logEndedAt,
        audience,
        courseName,
        ingredients: composition.ingredients,
        addressByName: composition.addressByName,
        formality: composition.formality,
        framesCaptured: logFramesCaptured,
        droppedFrames,
        stalled,
        batches: logBatches,
        notices: logAllNotices,
        retries: logRetries,
      },
      rawRows
    );
  }, [
    logStartedAt,
    logEndedAt,
    audience,
    courseId,
    courses,
    composition,
    logFramesCaptured,
    droppedFrames,
    stalled,
    logBatches,
    logAllNotices,
    logRetries,
    rawRows,
  ]);
}
