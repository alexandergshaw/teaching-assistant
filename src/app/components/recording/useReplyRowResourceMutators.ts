"use client";

// docs/reply-resource-concepts-acceptance-criteria.md RC10: the resource
// mutators pulled out of useReplyRows.ts (C2), which was at 940 lines - the
// soft cap - before this extraction. Landed as a PURE MOVE first (the whole
// recording suite green before any behaviour change), then RC3/RC4 changed
// `markResourceSearching`'s signature in place - see that function's own doc
// comment below.
//
// useReplyRows.ts's own file header states the single-writer invariant this
// leaf still relies on: every mutator below reads exclusively from
// `deps.rowsRef.current` (never a closed-over value), computes `next`,
// assigns `deps.rowsRef.current = next` synchronously in its own body, and
// only then calls `deps.commitRows`, which schedules the React state write.
// This leaf is not itself state-holding - it is a plain function returning
// callbacks that close over the refs/callbacks its one caller
// (useReplyRows.ts) hands it via `deps`. `useReplyRows.ts` spreads this
// hook's return straight into its own sealed `UseReplyRowsReturn`, so the
// seven callbacks below are exposed to the rest of the app exactly as if
// they were still defined inline there.
//
// STRUCTURAL_DEBOUNCE_MS/TYPING_DEBOUNCE_MS moved here WITH the mutators that
// use them; useReplyRows.ts imports both from this file rather than
// declaring its own copy - the direction that matters for the recorded
// back-import cycle trap (split-constants-into-the-leaf) is parent-imports-
// from-leaf, which is what this is; the reverse (a leaf importing a constant
// back from its parent) is the trap.

import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { ReplyRow, ReplyResource } from "./discussion-serialization";

// AC23: two debounces. Structural changes (merge, reorder, remove, a
// drafted reply landing) are rare and the user expects immediate
// durability; typing is frequent and a keystroke is not worth a 400ms
// round trip when AC57 already flushes once more on unmount.
export const STRUCTURAL_DEBOUNCE_MS = 400;
export const TYPING_DEBOUNCE_MS = 1000;

// ---------------------------------------------------------------------------
// F1 fix (fixer pass, docs/discussion-reply-resources-acceptance-criteria.md
// R7): this used to be duplicated - a tested-but-dead copy living in
// useReplyResources.ts (its own `describe` block, its own "SABOTAGE CHECK
// (c)"), and this untested, ref-backed copy, which is the one production
// actually called. Inverting the untested copy's `===` to `!==` discarded
// every drafted reply's resources with the entire suite green, because
// nothing exercised THIS comparison directly.
//
// One implementation now, pulled out as a pure, exported equality check so it
// is independently sabotage-testable (vitest in this repo renders no hook -
// see useReplyRows.ts's own header - so a comparison buried inside a
// useCallback body has no test surface of its own). `resourcesUnchangedSince`
// below is the ONLY caller in production; useReplyResources.ts's drain
// reaches this exclusively through that mutator
// (`rowsApi.resourcesUnchangedSince`), never by re-implementing the
// comparison itself. Re-exported from useReplyRows.ts so
// `useReplyResources.test.ts`'s existing import path keeps working - the
// re-export IS the point there now, not merely a convenience: it is what
// proves the test exercises the exact function `resourcesUnchangedSince`
// calls, not a second copy.
// ---------------------------------------------------------------------------

export function isResourceBatchFresh(currentSeq: number, dispatchSnapshotSeq: number): boolean {
  return currentSeq === dispatchSnapshotSeq;
}

export interface UseReplyRowResourceMutatorsDeps {
  rowsRef: MutableRefObject<ReplyRow[]>;
  resourceSeqRef: MutableRefObject<Map<string, number>>;
  commitRows: (next: ReplyRow[]) => void;
  scheduleSave: (debounceMs: number) => void;
}

export interface UseReplyRowResourceMutatorsReturn {
  /** R3/R6. Applies a completed resource search: `resourceState` becomes
   *  "done" whether or not `resources` is non-empty (R11 relies on "done"
   *  meaning "searched", not "found something"). The caller MUST already
   *  have checked `resourcesUnchangedSince` for this id before calling -
   *  same division of responsibility as `applyReply`/`isUnchangedSince` in
   *  useReplyRows.ts; this function does not re-check it. */
  applyResources: (id: string, resources: ReplyResource[]) => void;

  /** R10. One-click remove, matched by `url` within the row's own resource
   *  list. Bumps `resourceSeq` for this id BEFORE writing rows (mirrors
   *  `editReply`'s own bump-before-write ordering) so a search already in
   *  flight for this row cannot land on top of the removal and resurrect
   *  the link. Does NOT touch `resourceState` - R11 relies on a "done" row
   *  the instructor emptied by hand staying "done", not reverting to
   *  "idle" and re-entering the bulk `Find resources` sweep. */
  removeResource: (id: string, url: string) => void;

  /** Flips the given ids to "searching", clearing any stale
   *  `resourceError` - mirrors `markDrafting`. Ids absent from the current
   *  table are dropped. RC4: `queryById`, when supplied, sets
   *  `resourceQuery`/`resourceQuerySource` for each id present in the map
   *  from its `{ text, source }` entry, alongside `resourceState:
   *  "searching"` - neither field is ever cleared (they record the LAST
   *  search, including one that failed), so an id with no entry in the map
   *  (or no map at all) is flipped to "searching" with those two fields
   *  left exactly as they were. */
  markResourceSearching: (
    ids: string[],
    queryById?: ReadonlyMap<string, { text: string; source: "concepts" | "post" | "post-reply" }>
  ) => void;

  /** Mirrors `markFailed` for the resource state machine. */
  markResourceFailed: (ids: string[], error: string) => void;

  // R7 - the per-row resource generation guard, mirroring editSeqRef's own
  // three-part shape exactly. Bumped only by removeResource; the caller
  // (useReplyResources.ts's drain) snapshots it before dispatch and checks
  // it before calling applyResources.
  bumpResourceSeq: (id: string) => void;
  snapshotResourceSeq: (ids: string[]) => Map<string, number>;
  resourcesUnchangedSince: (id: string, snapshot: Map<string, number>) => boolean;
}

// ---------------------------------------------------------------------------
// docs/discussion-reply-resources-acceptance-criteria.md R3/R7: the
// resource mutators. Two guards the neighbouring drafting mutators in
// useReplyRows.ts use are DELIBERATELY NOT copied here:
//   - no tableEpochRef check: applyResources is an id lookup that
//     already returns early on a miss (so clearTable needs nothing more
//     - every id misses), and redraftAll bumps tableEpochRef WITHOUT
//     deleting anything, so an epoch guard would discard a completed
//     grounded search on every redraft of rows that still exist.
//   - no editSeqRef check: that guard counts REPLY edits. Resources are
//     keyed to the post, a disjoint field from `reply` - gating on it
//     would discard good resources because the instructor fixed a typo.
// ---------------------------------------------------------------------------

export function useReplyRowResourceMutators(deps: UseReplyRowResourceMutatorsDeps): UseReplyRowResourceMutatorsReturn {
  const { rowsRef, resourceSeqRef, commitRows, scheduleSave } = deps;

  const applyResources = useCallback(
    (id: string, resources: ReplyResource[]) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return; // row removed or table cleared under us
      const next = raw.map((r, i) =>
        i === idx ? { ...r, resources, resourceState: "done" as const, resourceError: null } : r
      );
      commitRows(next);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [rowsRef, commitRows, scheduleSave]
  );

  const removeResource = useCallback(
    (id: string, url: string) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return;
      const row = raw[idx];
      if (!row.resources?.some((res) => res.url === url)) return; // no-op: nothing to remove
      // R7: bump BEFORE writing rows - mirrors editReply's own ordering.
      resourceSeqRef.current.set(id, (resourceSeqRef.current.get(id) ?? 0) + 1);
      const next = raw.map((r, i) =>
        i === idx ? { ...r, resources: r.resources!.filter((res) => res.url !== url) } : r
      );
      commitRows(next);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [rowsRef, resourceSeqRef, commitRows, scheduleSave]
  );

  const markResourceSearching = useCallback(
    (ids: string[], queryById?: ReadonlyMap<string, { text: string; source: "concepts" | "post" | "post-reply" }>) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      let changed = false;
      const next = rowsRef.current.map((r) => {
        if (!idSet.has(r.id)) return r;
        changed = true;
        const query = queryById?.get(r.id);
        return {
          ...r,
          resourceState: "searching" as const,
          resourceError: null,
          // RC4: only overwritten when this dispatch actually supplied a
          // query for this row - never cleared otherwise (they record the
          // LAST search, including one that failed).
          ...(query ? { resourceQuery: query.text, resourceQuerySource: query.source } : {}),
        };
      });
      if (!changed) return;
      commitRows(next);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [rowsRef, commitRows, scheduleSave]
  );

  const markResourceFailed = useCallback(
    (ids: string[], error: string) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      let changed = false;
      const next = rowsRef.current.map((r) => {
        if (!idSet.has(r.id)) return r;
        changed = true;
        return { ...r, resourceState: "failed" as const, resourceError: error };
      });
      if (!changed) return;
      commitRows(next);
      scheduleSave(STRUCTURAL_DEBOUNCE_MS);
    },
    [rowsRef, commitRows, scheduleSave]
  );

  const bumpResourceSeq = useCallback(
    (id: string) => {
      resourceSeqRef.current.set(id, (resourceSeqRef.current.get(id) ?? 0) + 1);
    },
    [resourceSeqRef]
  );
  const snapshotResourceSeq = useCallback(
    (ids: string[]) => {
      const snap = new Map<string, number>();
      ids.forEach((id) => snap.set(id, resourceSeqRef.current.get(id) ?? 0));
      return snap;
    },
    [resourceSeqRef]
  );
  const resourcesUnchangedSince = useCallback(
    (id: string, snapshot: Map<string, number>) => {
      return isResourceBatchFresh(resourceSeqRef.current.get(id) ?? 0, snapshot.get(id) ?? 0);
    },
    [resourceSeqRef]
  );

  return {
    applyResources,
    removeResource,
    markResourceSearching,
    markResourceFailed,
    bumpResourceSeq,
    snapshotResourceSeq,
    resourcesUnchangedSince,
  };
}
