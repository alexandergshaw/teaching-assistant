"use client";

// D1/D9 (docs/aesthetics-pass-acceptance-criteria.md section 4b, the
// discussion-replies redesign): `handledAt` (which replies the instructor has
// actually copied out) and `skipped` (posts marked "no reply needed") - two
// small per-row flags, deliberately NOT stored on `ReplyRow` itself.
//
// WHY A SIDE CHANNEL - recorded so nobody "fixes" this back into ReplyRow
// without re-deriving the same blocker:
//
// This agent's file set is DiscussionRepliesPanel.tsx/.module.css,
// DiscussionReplyRow.tsx, DiscussionReplyTable.tsx, DiscussionReplyControls.tsx,
// discussion-icons.tsx, useReplyRows.ts, discussion-serialization.ts,
// discussion-table-view.ts, RecordingTab.tsx's tab strip, and new files under
// recording/. It explicitly excludes discussion-capture.ts,
// discussion-draft-loop.ts and "any other agent's area" - and
// useDiscussionReplies.ts (the orchestrator that instantiates useReplyRows()
// and re-exposes a hand-picked subset of it as UseDiscussionRepliesReturn,
// whose shape discussion-draft-loop.ts pins) is one of those other files: it
// is a fully shipped, concurrently-owned file, not a stub waiting on this
// wave.
//
// A genuine ReplyRow field needs a SETTER reachable from the panel. Adding
// `handledAt?`/`skipped?` to ReplyRow (discussion-serialization.ts) and a
// mutator to useReplyRows.ts costs nothing by itself - `rows`/`rawRows`
// already flow through useDiscussionReplies.ts unchanged
// (`rows: rowsApi.rows`), so a widened ReplyRow would be read correctly
// everywhere for free. But there is no path back OUT: every mutator this
// panel can call is one useDiscussionReplies.ts individually chose to
// forward (`editReply`, `removeResource`, `insertResource`, ...), and adding
// a new one to that pinned return type is exactly the edit this file set is
// not allowed to make. Two ReplyRow fields with no way to ever set them
// would be worse than not adding them at all.
//
// So: a standalone map, keyed by row id, persisted under its own
// localStorage key (`ta-rec-disc-flags`) and pruned against whichever ids
// the (untouched) reply table currently has. It behaves like a second, small
// ReplyRow-shaped table living beside the real one - not a replacement for
// the "real" implementation this AC describes, but the closest honest
// approximation reachable from inside this agent's own file boundary.
//
// What this CANNOT do, and is not silently glossed over: `draftAllPending`,
// `redraftAll` and `findMissing` (D9's exclusion list) dispatch entirely
// inside useDiscussionReplies.ts / useReplyResources.ts, reading `rawRows`
// directly with no hook into this file - a skipped row cannot be excluded
// from those three without editing files this agent does not own. The
// exclusion IS implemented for `tableClipboardText` and the "Copy every
// reply" scope, both of which are called from the PANEL with an array this
// file set already controls. See the final report for the follow-up this
// implies.
//
// Pure, testable functions first (no React, no `window`, no `document`) -
// this repo's vitest is node-env and renders no hook, so every behaviour that
// needs a unit test lives at this level, exactly like discussion-capture.ts's
// own split between pure logic and the hooks that call it.

export interface ReplyFlagsState {
  handledAt: Record<string, number>;
  skipped: Record<string, boolean>;
}

export const EMPTY_REPLY_FLAGS: ReplyFlagsState = { handledAt: {}, skipped: {} };

/** Never throws - the same discipline `deserializeReplyTable`
 * (discussion-serialization.ts) and `coerceMessageDraftPayload`
 * (message-drafts.ts:54) already apply to persisted JSON in this repo: drop
 * what is malformed rather than fail the whole read. */
export function coerceReplyFlagsState(raw: unknown): ReplyFlagsState {
  if (!raw || typeof raw !== "object") return EMPTY_REPLY_FLAGS;
  const obj = raw as Record<string, unknown>;

  const handledAt: Record<string, number> = {};
  if (obj.handledAt && typeof obj.handledAt === "object") {
    for (const [id, v] of Object.entries(obj.handledAt as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) handledAt[id] = v;
    }
  }

  const skipped: Record<string, boolean> = {};
  if (obj.skipped && typeof obj.skipped === "object") {
    for (const [id, v] of Object.entries(obj.skipped as Record<string, unknown>)) {
      if (v === true) skipped[id] = true;
    }
  }

  return { handledAt, skipped };
}

export function parseReplyFlagsState(raw: string | null): ReplyFlagsState {
  if (!raw) return EMPTY_REPLY_FLAGS;
  try {
    return coerceReplyFlagsState(JSON.parse(raw));
  } catch {
    return EMPTY_REPLY_FLAGS;
  }
}

export function serializeReplyFlagsState(state: ReplyFlagsState): string {
  return JSON.stringify(state);
}

/** Pure updater. `at: null` clears the flag. Returns the SAME object
 * reference when nothing actually changes (the no-op case a real ReplyRow
 * mutator would also preserve, for the same React.memo reason - see
 * useReplyRows.ts's own header on "AC40/F9"). */
export function setHandledAtFlag(state: ReplyFlagsState, id: string, at: number | null): ReplyFlagsState {
  const current = state.handledAt[id];
  if (at === null) {
    if (current === undefined) return state;
    const next = { ...state.handledAt };
    delete next[id];
    return { ...state, handledAt: next };
  }
  if (current === at) return state;
  return { ...state, handledAt: { ...state.handledAt, [id]: at } };
}

export function setSkippedFlag(state: ReplyFlagsState, id: string, skipped: boolean): ReplyFlagsState {
  const current = state.skipped[id] === true;
  if (current === skipped) return state;
  if (!skipped) {
    const next = { ...state.skipped };
    delete next[id];
    return { ...state, skipped: next };
  }
  return { ...state, skipped: { ...state.skipped, [id]: true } };
}

/** Drops entries for ids the (real) table no longer has - a row removed, the
 * table cleared, or a freshly-loaded table with different ids would
 * otherwise leave this key growing forever with orphaned entries. Returns
 * the SAME reference when nothing was actually stale, so a hook wrapping
 * this can skip a persistence write on every unrelated render. */
export function pruneReplyFlagsState(state: ReplyFlagsState, liveIds: ReadonlySet<string>): ReplyFlagsState {
  let changed = false;

  const handledAt: Record<string, number> = {};
  for (const [id, v] of Object.entries(state.handledAt)) {
    if (liveIds.has(id)) handledAt[id] = v;
    else changed = true;
  }

  const skipped: Record<string, boolean> = {};
  for (const [id, v] of Object.entries(state.skipped)) {
    if (liveIds.has(id)) skipped[id] = v;
    else changed = true;
  }

  return changed ? { handledAt, skipped } : state;
}

// ---------------------------------------------------------------------------
// The hook. Thin: localStorage-backed state plus the four stable mutators a
// memoized DiscussionReplyRow needs (see that file's own header on why every
// row updater must be a stable useCallback). `handledAt`/`skipped` are
// returned as plain records - a consumer passes `flags.handledAt[row.id]`
// (a primitive) down to each row, never the whole map as a prop, so an
// unrelated row's flag changing does not defeat this row's own memoization
// (this repo's `react-hooks/refs` rule also forbids reading a ref's
// `.current` during render, which a callback-based `isHandled(id)` lookup
// would have required here - plain data avoids that entirely).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY_FLAGS = "ta-rec-disc-flags";

export interface UseDiscussionReplyFlagsReturn {
  handledAt: Readonly<Record<string, number>>;
  skipped: Readonly<Record<string, boolean>>;
  markHandled: (id: string) => void;
  clearHandled: (id: string) => void;
  toggleHandled: (id: string) => void;
  toggleSkipped: (id: string) => void;
}

export function useDiscussionReplyFlags(liveIds: ReadonlyArray<string>): UseDiscussionReplyFlagsReturn {
  const [state, setState] = useState<ReplyFlagsState>(() => {
    if (typeof window === "undefined") return EMPTY_REPLY_FLAGS;
    return parseReplyFlagsState(window.localStorage.getItem(STORAGE_KEY_FLAGS));
  });

  // A genuine effect (synchronize React state to an external system,
  // localStorage) that calls no setState of its own - fires whenever `state`
  // changes, for WHATEVER reason (a mutator below, or the prune adjustment
  // just below this). This is deliberately separate from the pruning logic:
  // an effect that itself called setState synchronously is exactly what this
  // repo's react-hooks/set-state-in-effect rule (and this repo's own
  // "setState-in-effect idiom" note) forbids.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY_FLAGS, serializeReplyFlagsState(state));
    } catch {
      // Best-effort, low-stakes persistence - mirrors useReplyRows.ts's own
      // filter-text write, which does not surface a storage-full banner for
      // this class of control either.
    }
  }, [state]);

  // Prune whenever the live id set changes - "adjust state during rendering"
  // (this repo's own idiom; DiscussionReplyRow.tsx's `removeArmed`
  // invalidation is the precedent cited throughout this feature), NOT a
  // useEffect calling setState synchronously. Joined to a string so this
  // comparison is stable across renders even though the panel passes a fresh
  // `rawRows.map(r => r.id)` array every time.
  const liveIdsKey = liveIds.join(",");
  const [prevLiveIdsKey, setPrevLiveIdsKey] = useState(liveIdsKey);
  if (liveIdsKey !== prevLiveIdsKey) {
    setPrevLiveIdsKey(liveIdsKey);
    const pruned = pruneReplyFlagsState(state, new Set(liveIds));
    if (pruned !== state) setState(pruned);
  }

  const markHandled = useCallback((id: string) => {
    setState((prev) => setHandledAtFlag(prev, id, Date.now()));
  }, []);

  const clearHandled = useCallback((id: string) => {
    setState((prev) => setHandledAtFlag(prev, id, null));
  }, []);

  const toggleHandled = useCallback((id: string) => {
    setState((prev) => setHandledAtFlag(prev, id, prev.handledAt[id] !== undefined ? null : Date.now()));
  }, []);

  const toggleSkipped = useCallback((id: string) => {
    setState((prev) => setSkippedFlag(prev, id, prev.skipped[id] !== true));
  }, []);

  return { handledAt: state.handledAt, skipped: state.skipped, markHandled, clearHandled, toggleHandled, toggleSkipped };
}
