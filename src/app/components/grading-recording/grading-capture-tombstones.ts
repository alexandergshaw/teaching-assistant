// Wave 2 of A9 (docs/REGRESSION.md entry 428, docs/BACKLOG.md's A9 entry):
// wave 1 made the in-session accumulator id-correlated to the row table
// (grading-capture-sync.ts) so a deletion can no longer be misattributed -
// but wave 1's accumulator is a plain useRef, so a reload forgets every
// dismissal (RES-A9-7: the deleted student's next re-read simply mints a
// fresh row, indistinguishable from a duplicate). This file is what makes a
// deletion survive a reload: a per-course projection of the accumulator's
// dismissed entries, persisted under TOMBSTONE_STORAGE_KEY, re-seeded into a
// fresh accumulator on mount/course-switch.
//
// FOUR ORCHESTRATOR RULINGS this file builds to (the design artifact this
// wave started from said something incompatible at each point):
//
// 1. `commitTrackingReset` is a plain leaf function, not a hook parameter.
//    Nothing in this repo can execute a React hook (docs/loop/this-repo.md),
//    so a Clear-table reset defined INSIDE the hook would have no test able
//    to touch the real implementation. `commitTrackingReset` does the whole
//    reset (clears this course's persisted tombstones, returns `[]`) and the
//    hook only assigns its return value to the ref.
// 2. Clear table is wrapped, unconditionally - `composeClearHandler` is
//    always used, never optional. Leaving `clearTable` bare would let this
//    course's tombstones survive a Clear table click, silently suppressing
//    every previously-dismissed student forever, with no Undo on this
//    surface - strictly worse than the bug A9 exists to fix.
// 3. Every write to TOMBSTONE_STORAGE_KEY is a course-scoped
//    READ-MODIFY-WRITE - the exact shape useGradingRows.ts's own
//    `setAllRows`/`clearTable` already use (read the whole stored set, drop
//    only this course's own slice, write the union of the rest plus this
//    course's new slice). A flat write would erase every other course's
//    tombstones. `persistDismissedForCourse([], scope)` (an empty `entries`
//    array) is how a course's own tombstones are CLEARED - there is no
//    separate "clear" function, since the read-modify-write already
//    expresses "this course now has zero tombstones" without touching
//    anyone else's.
// 4. `commitCaptureAdvance` takes `rows` from the caller as-is (the panel
//    passes `gradingRows.rawRows`, the render value, never a ref - see
//    GradingRecordingPanel.tsx's runExtraction and
//    useGradingCaptureTracking.ts's own seed-effect note for why the ref is
//    one commit stale and reproduces REGRESSION 428f's course-switch defect
//    if read instead).
//
// SEAM-4a/4b split: the first half below is pure (no I/O); the second half
// is explicitly NOT pure - each of its four functions touches
// `window.localStorage`, guarded by `typeof window` exactly the way
// useAssessmentRowStore.ts's own read guards itself.

import type { GradingRow } from "./grading-row";
import { advanceGradingCapture, type TrackedSubmission } from "./grading-capture-sync";
import type { ExtractedSubmission } from "./grading-submission-merge";

export const TOMBSTONE_STORAGE_KEY = "ta-rec-grade-dismissed";

/** A dismissed submission, projected out of the accumulator for storage.
 *  `course` records which course scope it was persisted under (`undefined`
 *  for the unattributed scope) - the flat stored array holds every course's
 *  tombstones together, and `course` is what a read-modify-write filters on. */
export interface DismissedSubmission {
  name: string;
  text: string;
  course?: string;
}

/** Projects every dismissed entry out of `tracked`, tagged with the scope it
 *  is being persisted under. Pure - does not read or write storage. */
export function projectDismissed(
  tracked: ReadonlyArray<TrackedSubmission>,
  courseScope: string | undefined
): DismissedSubmission[] {
  return tracked
    .filter((entry) => entry.dismissed)
    .map((entry) => ({ name: entry.name, text: entry.text, course: courseScope }));
}

export function serializeDismissed(entries: ReadonlyArray<DismissedSubmission>): string {
  return JSON.stringify(entries);
}

/** Never throws - a malformed or absent stored value reads back as `[]`,
 *  mirroring grading-row-serialization.ts's own deserializeAssessmentRows
 *  never-throw discipline (428c). */
export function deserializeDismissed(raw: string | null): DismissedSubmission[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is DismissedSubmission =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { name?: unknown }).name === "string" &&
        typeof (entry as { text?: unknown }).text === "string"
    );
  } catch {
    return [];
  }
}

/** Flips `dismissed` on the entry owning `rowId` AND moves it to the end -
 *  SEAM-3's ordering rule: live entries must precede tombstones so a later
 *  reading's `findIndex` match (mergeExtractedSubmissions takes the first)
 *  lands on a still-visible row, never on the entry that just stopped
 *  rendering one. Returns the SAME array reference on a miss, mirroring
 *  removeAssessmentRow's own same-reference-on-a-miss discipline
 *  (assessment-shared/assessment-row.ts). */
export function dismissTrackedRow(
  tracked: ReadonlyArray<TrackedSubmission>,
  rowId: string
): TrackedSubmission[] {
  const index = tracked.findIndex((entry) => entry.rowId === rowId);
  if (index === -1) return tracked as TrackedSubmission[];
  const entry = { ...tracked[index], dismissed: true };
  const rest = tracked.filter((_, i) => i !== index);
  return [...rest, entry];
}

/** Rebuilds a fresh accumulator from the current row table plus this
 *  course's own persisted tombstones - the reload/course-switch seed. Live
 *  entries come first, in row order (so a re-read matches the still-visible
 *  row, not a tombstone); this scope's tombstones follow. A tombstone entry
 *  gets a synthetic id via `mintId` that matches no real row - harmless,
 *  since advanceGradingCapture's branch 1 (dismissed) never reads `rowId`
 *  against `rows`, and its preservation step only EXCLUDES by rowId. */
export function seedTrackedFromRows(
  rows: ReadonlyArray<GradingRow>,
  dismissed: ReadonlyArray<DismissedSubmission>,
  courseScope: string | undefined,
  mintId: () => string
): TrackedSubmission[] {
  const live: TrackedSubmission[] = rows.map((row) => ({
    name: row.studentName,
    text: row.submissionText,
    rowId: row.id,
    dismissed: false,
  }));
  const tombstones: TrackedSubmission[] = dismissed
    .filter((entry) => entry.course === courseScope)
    .map((entry) => ({ name: entry.name, text: entry.text, rowId: mintId(), dismissed: true }));
  return [...live, ...tombstones];
}

// ---------------------------------------------------------------------------
// SEAM-4b: the I/O layer. Explicitly NOT pure - these four functions are the
// only ones in this file that touch storage.
// ---------------------------------------------------------------------------

export function readDismissed(): DismissedSubmission[] {
  if (typeof window === "undefined") return [];
  return deserializeDismissed(window.localStorage.getItem(TOMBSTONE_STORAGE_KEY));
}

/** COURSE-SCOPED READ-MODIFY-WRITE (RULING 3): reads the whole stored set,
 *  drops entries matching `courseScope`, concatenates `entries`, writes the
 *  union - the same shape useGradingRows.ts:363-364/:438 use, for the reason
 *  useGradingRows.wiring.test.ts pins ("it never resets to an empty array,
 *  which would erase every other course's rows"). An EMPTY `entries` array
 *  is how a course's tombstones get cleared (RULING 1/3) - nothing else in
 *  this file writes a flat value.
 *
 *  Quota fallback drops the OLDEST entry OF THIS COURSE, one at a time -
 *  "oldest" meaning earliest in `entries` (the accumulator's own dismissal
 *  order, via `projectDismissed`/`dismissTrackedRow`'s move-to-end rule) -
 *  never truncates `text`, never drops another course's entry, never
 *  touches the rows key. Returns the drop count; -1 if even the
 *  other-courses-only write failed. */
export function persistDismissedForCourse(
  entries: ReadonlyArray<DismissedSubmission>,
  courseScope: string | undefined
): number {
  if (typeof window === "undefined") return 0;
  const others = readDismissed().filter((entry) => entry.course !== courseScope);
  let mine = entries.slice();
  let dropped = 0;
  for (;;) {
    try {
      window.localStorage.setItem(TOMBSTONE_STORAGE_KEY, serializeDismissed([...others, ...mine]));
      return dropped;
    } catch {
      if (mine.length === 0) {
        try {
          window.localStorage.setItem(TOMBSTONE_STORAGE_KEY, serializeDismissed(others));
          return dropped;
        } catch {
          return -1;
        }
      }
      mine = mine.slice(1);
      dropped += 1;
    }
  }
}

/** Dismiss and persist, in one call - the caller has no discretion over
 *  whether the dismissal reaches storage. */
export function commitDismissal(
  tracked: ReadonlyArray<TrackedSubmission>,
  rowId: string,
  courseScope: string | undefined
): { tracked: TrackedSubmission[]; persistDropped: number } {
  const nextTracked = dismissTrackedRow(tracked, rowId);
  const persistDropped = persistDismissedForCourse(projectDismissed(nextTracked, courseScope), courseScope);
  return { tracked: nextTracked, persistDropped };
}

/** THE ONLY WAY TO ADVANCE. Computes via advanceGradingCapture, calls
 *  `commitRows` with the new rows, and ONLY THEN persists the projection -
 *  rows first, because the tombstone payload grows without bound (a
 *  dismissed entry keeps absorbing continuations) and competes for the same
 *  per-origin quota as ta-rec-grade-table, so persisting the tombstone
 *  projection first would risk pushing the rows write into its own
 *  quota-fallback path. Fusing advance + commit + persist into one call is
 *  what makes the reload fix unconditional: no caller can choose to advance
 *  without persisting. */
export function commitCaptureAdvance(
  input: {
    tracked: ReadonlyArray<TrackedSubmission>;
    rows: ReadonlyArray<GradingRow>;
    incoming: ReadonlyArray<ExtractedSubmission>;
    courseScope: string | undefined;
    mintId: () => string;
  },
  commitRows: (rows: GradingRow[]) => void
): { tracked: TrackedSubmission[]; addedCount: number; mergedCount: number; divergentRowIds: string[]; persistDropped: number } {
  const advance = advanceGradingCapture(input.tracked, input.rows, input.incoming, input.mintId);
  commitRows(advance.rows);
  const persistDropped = persistDismissedForCourse(projectDismissed(advance.tracked, input.courseScope), input.courseScope);
  return {
    tracked: advance.tracked,
    addedCount: advance.addedCount,
    mergedCount: advance.mergedCount,
    divergentRowIds: advance.divergentRowIds,
    persistDropped,
  };
}

/** RULING 1: Clear table's reset, as a plain leaf function so ORACLE-9 can
 *  call the real implementation directly rather than a hook-internal
 *  stand-in. Clears THIS COURSE's persisted tombstones (via the same
 *  read-modify-write every other write in this file uses) and returns `[]`
 *  for the caller to assign as the next accumulator. Both halves, always -
 *  clearing only the stored set would leave the in-memory entries to
 *  re-persist themselves on the next advance; clearing only the accumulator
 *  would leave every previously-dismissed student suppressed after the
 *  clear (RULING 2). */
export function commitTrackingReset(courseScope: string | undefined): TrackedSubmission[] {
  persistDismissedForCourse([], courseScope);
  return [];
}

/** Dismiss-then-remove, in that order - a shared call-order array in this
 *  file's test proves it, so a future async step inserted between them can
 *  never silently reorder the durability guarantee ahead of the visible
 *  removal. */
export function composeRemoveHandler(
  removeRow: (id: string) => void,
  recordDismissal: (rowId: string) => void
): (id: string) => void {
  return (id: string) => {
    recordDismissal(id);
    removeRow(id);
  };
}

/** RULING 2: always wraps `clearTable` - never optional. */
export function composeClearHandler(clearTable: () => void, resetTracking: () => void): () => void {
  return () => {
    resetTracking();
    clearTable();
  };
}
