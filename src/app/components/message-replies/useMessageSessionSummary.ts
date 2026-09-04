"use client";

// Message replies - the post-stop session summary bookkeeping and M18's
// "outstanding work" hint. Section 0 of docs/message-replies-acceptance-
// criteria.md: "Where this document is silent, the discussion-replies
// contract applies verbatim" - this file's stopped-summary half mirrors
// src/app/components/recording/useDiscussionSessionSummary.ts's own AC7b
// account (found/drafted/failed since Start, and the four totalCount-driven
// empty states), retyped for MessageThreadRow. Every setState below follows
// the "adjust state during rendering" pattern (compare current vs previous,
// setState in the same render), matching that file's own discipline for the
// same eslint reason.
//
// M18 (section 7) is explicit and additive on top of that: a SEPARATE,
// always-live (not stop-gated) `fieldHint` directly under `<RunLogRow>`:
// "7 threads still need you - 5 drafted and not sent, 2 waiting to draft." -
// computed from `rawRows`, hidden when the total is zero. `outstandingWorkHint`
// below is that hint, exported as its own pure function so it has a real
// test surface (this hook itself is never rendered by this repo's node-env
// vitest).

import { useState } from "react";
import type { MessageThreadRow } from "./message-serialization";
import { fmt } from "../recording/types";

export interface StoppedMessageSummary {
  elapsedAtStop: number;
  found: number;
  drafted: number;
  failed: number;
}

export function stoppedMessageSummarySentence(s: StoppedMessageSummary): string {
  const base = `Capture stopped after ${fmt(s.elapsedAtStop)}. Found ${s.found} thread${s.found === 1 ? "" : "s"}, drafted ${s.drafted} repl${s.drafted === 1 ? "y" : "ies"}.`;
  if (s.failed === 0) return base;
  return `${base} ${s.failed} repl${s.failed === 1 ? "y" : "ies"} failed - use Redraft on that thread.`;
}

/**
 * M18's own formula, verbatim: drafted-and-not-sent = `state === "ready" &&
 * reply && !sent && !skipped`; waiting = `state === "pending"` and not
 * answered/preview/skipped. "" (hidden) when the total is zero.
 */
export function outstandingWorkHint(rows: ReadonlyArray<MessageThreadRow>): string {
  let draftedNotSent = 0;
  let waiting = 0;
  for (const row of rows) {
    if (row.state === "ready" && row.reply && !row.sent && !row.skipped) draftedNotSent += 1;
    if (row.state === "pending" && !row.answered && !row.previewOnly && !row.skipped) waiting += 1;
  }
  const total = draftedNotSent + waiting;
  if (total === 0) return "";
  return `${total} thread${total === 1 ? "" : "s"} still need${total === 1 ? "s" : ""} you - ${draftedNotSent} drafted and not sent, ${waiting} waiting to draft.`;
}

export interface UseMessageSessionSummaryArgs {
  capturing: boolean;
  elapsedSec: number;
  /** The UNFILTERED table - the session-start snapshot and the stop-time
   *  diff must both be exact regardless of the filter. */
  rawRows: MessageThreadRow[];
  /** The UNFILTERED count, never the filtered `rows.length`. */
  totalCount: number;
}

export interface UseMessageSessionSummaryReturn {
  stoppedSummary: StoppedMessageSummary | null;
  showNeverOpened: boolean;
  showPersistedBanner: boolean;
  showCapturingEmpty: boolean;
  showStoppedEmpty: boolean;
  /** M18's live fieldHint, recomputed on every call (cheap: a single pass
   *  over `rawRows`) - never gated on capturing/stopped, unlike
   *  `stoppedSummary` above. */
  outstandingHint: string;
}

export function useMessageSessionSummary({
  capturing,
  elapsedSec,
  rawRows,
  totalCount,
}: UseMessageSessionSummaryArgs): UseMessageSessionSummaryReturn {
  const [prevCapturing, setPrevCapturing] = useState(capturing);
  const [sessionStartIds, setSessionStartIds] = useState<ReadonlySet<string>>(() => new Set());
  const [sessionStartTotalCount, setSessionStartTotalCount] = useState(0);
  const [stoppedSummary, setStoppedSummary] = useState<StoppedMessageSummary | null>(null);

  if (capturing !== prevCapturing) {
    setPrevCapturing(capturing);
    if (capturing) {
      setSessionStartIds(new Set(rawRows.map((r) => r.id)));
      setSessionStartTotalCount(totalCount);
      setStoppedSummary(null);
    } else {
      const sessionRows = rawRows.filter((r) => !sessionStartIds.has(r.id));
      setStoppedSummary({
        elapsedAtStop: elapsedSec,
        found: totalCount - sessionStartTotalCount,
        drafted: sessionRows.filter((r) => r.state === "ready").length,
        failed: sessionRows.filter((r) => r.state === "failed").length,
      });
    }
  }
  const everStarted = capturing || stoppedSummary !== null;

  const showNeverOpened = !everStarted && totalCount === 0;
  const showPersistedBanner = !everStarted && totalCount > 0;
  const showCapturingEmpty = capturing && totalCount === 0;
  const showStoppedEmpty = !capturing && stoppedSummary !== null && stoppedSummary.found === 0;

  return {
    stoppedSummary,
    showNeverOpened,
    showPersistedBanner,
    showCapturingEmpty,
    showStoppedEmpty,
    outstandingHint: outstandingWorkHint(rawRows),
  };
}
