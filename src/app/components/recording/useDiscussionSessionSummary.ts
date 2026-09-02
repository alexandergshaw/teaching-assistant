"use client";

// AC7b's post-stop summary bookkeeping, pulled out of DiscussionRepliesPanel.tsx
// into its own hook once that panel was pressing on its own 1000-line
// ceiling again - see recording-split.structure.test.ts's directory-wide
// gate. Same idiom as useDiscussionReplyFiltering.ts's own extraction out of
// the same panel: one hook call in place of a standalone useState/useEffect
// cluster, rather than growing the panel further.
//
// The pinned UseDiscussionRepliesReturn (section 12 of
// docs/discussion-reply-capture-acceptance-criteria.md) exposes only the
// whole persisted `rows` array, not a session-scoped tally - AC24 says the
// table is not owned by a session at all. So THIS hook snapshots which row
// ids existed the moment `start()` was pressed and, on stop, diffs `rawRows`
// against that snapshot to get "found/drafted/failed this session". Every
// setState below follows the "adjust state during rendering" pattern
// (compare current vs previous, setState in the same render) rather than a
// useEffect that calls setState synchronously, which this repo's eslint
// config rejects (TaskAttachmentsDialog.tsx's own note on the same rule).
//
// Also owns the four totalCount/stoppedSummary-driven empty states
// (F11/AC59: all read `totalCount`, never a filtered `rows.length` - a stale
// filter that happens to match nothing must never make a table WITH
// persisted rows look like a table that was never opened) since they are
// pure derivations of this hook's own `stoppedSummary`/`everStarted` and
// nothing else the panel computes.

import { useState } from "react";
import type { ReplyRow } from "./discussion-capture";
import { computeStoppedSessionSummary } from "./discussion-table-view";
import { fmt } from "./types";

export interface StoppedSummary {
  elapsedAtStop: number;
  found: number;
  drafted: number;
  failed: number;
}

export function stoppedSummarySentence(s: StoppedSummary): string {
  const base = `Capture stopped after ${fmt(s.elapsedAtStop)}. Found ${s.found} post${s.found === 1 ? "" : "s"}, drafted ${s.drafted} repl${s.drafted === 1 ? "y" : "ies"}.`;
  if (s.failed === 0) return base;
  return `${base} ${s.failed} repl${s.failed === 1 ? "y" : "ies"} failed - use Retry on that row.`;
}

export interface UseDiscussionSessionSummaryArgs {
  capturing: boolean;
  elapsedSec: number;
  /** F0-2/F11: the UNFILTERED table - the session-start snapshot and the
   *  stop-time diff must both be exact regardless of whatever the filter is
   *  doing (S2 fix, sort-filter review). */
  rawRows: ReplyRow[];
  /** F11: the UNFILTERED count, never the filtered `rows.length`. */
  totalCount: number;
}

export interface UseDiscussionSessionSummaryReturn {
  stoppedSummary: StoppedSummary | null;
  showNeverOpened: boolean;
  showPersistedBanner: boolean;
  showCapturingEmpty: boolean;
  showStoppedEmpty: boolean;
}

export function useDiscussionSessionSummary({
  capturing,
  elapsedSec,
  rawRows,
  totalCount,
}: UseDiscussionSessionSummaryArgs): UseDiscussionSessionSummaryReturn {
  const [prevCapturing, setPrevCapturing] = useState(capturing);
  const [sessionStartIds, setSessionStartIds] = useState<ReadonlySet<string>>(() => new Set());
  // F11: `totalCount` is snapshotted alongside `sessionStartIds` so `found`
  // below can be computed as a pure count delta - correct regardless of
  // whatever the filter is doing, since it never touches the (now filtered)
  // `rows` array at all. See computeStoppedSessionSummary for why the same
  // trick does not extend to `drafted`/`failed`.
  const [sessionStartTotalCount, setSessionStartTotalCount] = useState(0);
  const [stoppedSummary, setStoppedSummary] = useState<StoppedSummary | null>(null);
  if (capturing !== prevCapturing) {
    setPrevCapturing(capturing);
    if (capturing) {
      // S2 fix (sort-filter review): `rawRows`, not a filtered array. Building
      // the start-of-session snapshot from a FILTERED array was the root of
      // BOTH directions of the bug - it could undercount (a row outside the
      // filter at Stop looked like it was never in the session) and OVERcount
      // (a filter matching nothing at Start produced an empty snapshot, so
      // every persisted row looked "new" once the filter was cleared before
      // Stop). `rawRows` is exact under any filter change during the session.
      setSessionStartIds(new Set(rawRows.map((r) => r.id)));
      setSessionStartTotalCount(totalCount);
      setStoppedSummary(null);
    } else {
      // S2 fix (sort-filter review): `rawRows`, not a filtered array - same
      // reasoning as the snapshot above. `drafted`/`failed` are no longer
      // best-effort; both are exact regardless of what the filter is doing
      // at Stop time.
      setStoppedSummary({
        elapsedAtStop: elapsedSec,
        ...computeStoppedSessionSummary({ rawRows, sessionStartIds, totalCount, sessionStartTotalCount }),
      });
    }
  }
  const everStarted = capturing || stoppedSummary !== null;

  const showNeverOpened = !everStarted && totalCount === 0;
  const showPersistedBanner = !everStarted && totalCount > 0;
  const showCapturingEmpty = capturing && totalCount === 0;
  // S2: keyed off `stoppedSummary.found === 0`, not `totalCount === 0`. A
  // session that adds no NEW rows to an already non-empty (persisted) table
  // used to satisfy neither this condition nor the `found > 0` summary gate
  // in the panel, so the panel went completely silent on Stop - the exact
  // "did it work?" moment AC7b exists for, and the likeliest way a returning
  // user meets a real failure (shared the wrong window with yesterday's rows
  // still on screen).
  const showStoppedEmpty = !capturing && stoppedSummary !== null && stoppedSummary.found === 0;

  return { stoppedSummary, showNeverOpened, showPersistedBanner, showCapturingEmpty, showStoppedEmpty };
}
