"use client";

// Shared persistence layer for the assessment-grading surfaces
// (grading-recording today; a second capture-based grading surface is a
// later wave). WAVE 2 of the assessment-grading extraction, following
// WAVE 1's assessment-row.ts.
//
// This is a MOVE of useGradingRows.ts's own rawRows/rowsRef/persistRows/
// commitRows machinery, generalised over the row type via a per-surface
// AssessmentRowCodec (assessment-shared/assessment-row-store.ts) and a pair
// of caller-supplied user-facing messages for the two ways a persistence
// write can come up short. The BEHAVIOUR is lifted verbatim:
//
//   - Read-once-in-the-initializer, guarded by `typeof window` - mirrors
//     useReplyRows.ts's own `rawRows` initializer.
//   - The single synchronously-fresh source of truth for the row array is
//     `rowsRef` - every mutator on the calling hook reads/writes
//     `rowsRef.current`, never a `rawRows` closure (see useGradingRows.ts's
//     own header for the staleness reasoning this avoids).
//   - `persistRows` tries the full write first; on failure (real-world
//     cause is almost always quota - Firefox's NS_ERROR_DOM_QUOTA_REACHED,
//     Safari private mode throwing on any setItem, or the origin's quota
//     actually filled by some other ta- key), retries with the codec's own
//     `dropBulk: true` write. If even the reduced write throws, nothing was
//     saved this time and that is reported via `persistError`, never
//     swallowed. Caught by catching, never by `err.name` - mirrors
//     useReplyRows.ts's own AC23a discipline.
//
// The storage-key parameter MUST be passed as a whole string literal at the
// call site (a `const NAME = "key"` binding is fine - see
// grading-rows.test.ts's own isWired helper), never a template literal -
// the per-directory persisted-key canaries derive their key set with a
// regex over the literal source and cannot see a computed key.
//
// THE PARAMETER IS DELIBERATELY NAMED `STORAGE_KEY_TABLE`, not a generic
// `storageKey`, even though this hook is shared across future surfaces.
// Two independent source-text canaries pin this file's own key wiring from
// OUTSIDE this directory, and both must stay satisfied by this one wave:
//   - courseIntelOfflineTables.test.ts (src/app/components/course-intel/)
//     requires useGradingRows.ts to still declare
//     `const STORAGE_KEY_\w+ = "ta-rec-grade-table"` verbatim.
//   - grading-rows.test.ts's own persisted-key canary requires the SAME
//     identifier spelling to appear at the actual localStorage read/write
//     call site, wherever that call site lives - which, since this wave,
//     is here, not in useGradingRows.ts. Its `isWired` helper matches by
//     identifier TEXT across the combined source of both directories, not
//     by call-site argument name, so the parameter here has to be spelled
//     identically to useGradingRows.ts's own `STORAGE_KEY_TABLE` constant
//     for that cross-file match to hold. A future second caller (a
//     capture-based grading surface) can pass an entirely different
//     runtime key value into this same parameter - only the identifier
//     TEXT needs to match ITS OWN owner file's `STORAGE_KEY_*` constant.
//
// Pure state/persistence only - this file owns none of a surface's own
// sort/filter/mutator logic (editField, applyGradingResult, setAllRows,
// etc. all stay in useGradingRows.ts, which calls `commitRows` the same way
// it always has).

import { useCallback, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { AssessmentRowCore } from "./assessment-row";
import { serializeAssessmentRows, deserializeAssessmentRows, type AssessmentRowCodec } from "./assessment-row-store";

export interface UseAssessmentRowStoreReturn<R extends AssessmentRowCore> {
  /** The whole (unfiltered, unscoped) table, read once from storage at
   *  mount and updated on every `commitRows` call. */
  rawRows: R[];
  /** The single synchronously-fresh source of truth - read/write this, not
   *  a `rawRows` closure, from any mutator built on top of this hook. */
  rowsRef: MutableRefObject<R[]>;
  /** Replaces the whole table: updates `rowsRef`, `rawRows` state, and
   *  persists (with the two-tier quota fallback) in one call. */
  commitRows: (next: R[]) => void;
  /** Null once the last persistence write succeeded (in full or in the
   *  reduced, dropBulk form); the caller-supplied message otherwise.
   *  In-memory rows keep working regardless - this never blocks a
   *  mutator. */
  persistError: string | null;
}

export interface AssessmentRowStoreMessages {
  /** Shown when the full write failed but the reduced (dropBulk) write
   *  succeeded - the reduced write still SUCCEEDED (the surface's own
   *  graded judgment is safe), so this message is distinct from `full`. */
  reduced: string;
  /** Shown when even the reduced write failed - nothing was saved this
   *  time; in-memory rows still work until reload. */
  full: string;
}

export function useAssessmentRowStore<R extends AssessmentRowCore>(
  STORAGE_KEY_TABLE: string,
  codec: AssessmentRowCodec<R>,
  messages: AssessmentRowStoreMessages
): UseAssessmentRowStoreReturn<R> {
  const [rawRows, setRawRows] = useState<R[]>(() => {
    if (typeof window === "undefined") return [];
    return deserializeAssessmentRows(window.localStorage.getItem(STORAGE_KEY_TABLE), codec);
  });
  const [persistError, setPersistError] = useState<string | null>(null);

  const rowsRef = useRef<R[]>(rawRows);

  const persistRows = useCallback(
    (rows: R[]) => {
      try {
        window.localStorage.setItem(STORAGE_KEY_TABLE, serializeAssessmentRows(rows, codec, false));
        setPersistError(null);
        return;
      } catch {
        // fall through to the reduced write below
      }
      try {
        window.localStorage.setItem(STORAGE_KEY_TABLE, serializeAssessmentRows(rows, codec, true));
        setPersistError(messages.reduced);
      } catch {
        setPersistError(messages.full);
      }
    },
    [STORAGE_KEY_TABLE, codec, messages.reduced, messages.full]
  );

  const commitRows = useCallback(
    (next: R[]) => {
      rowsRef.current = next;
      setRawRows(next);
      persistRows(next);
    },
    [persistRows]
  );

  return { rawRows, rowsRef, commitRows, persistError };
}
