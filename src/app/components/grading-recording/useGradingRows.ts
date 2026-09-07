"use client";

// Grading from a screen recording - the TABLE-lifetime state leaf. Owns
// `rows`, `sort`, `filterText`, the sorted-and-filtered display array, and
// the row mutators (editField / applyGradingResult / applyRosterMatch /
// setAllRows / removeRow / clearTable). Mirrors useReplyRows.ts's shape
// deliberately (same "own the table's whole lifetime, mutate through
// synchronous ref reads, delegate sort/filter/guard logic to a pure leaf"
// structure) but is far smaller: this wave builds no capture loop, no
// extraction merge, and no grading dispatch pipeline (R0/R5 of the AC - all
// three are a sibling EXTRACTION wave's job), so there is none of
// useReplyRows.ts's generation-guard (editSeq/tableEpoch/resourceSeq)
// machinery here - nothing in this file races an in-flight async request
// against a table mutation, because nothing in this file dispatches one.
//
// REACHABILITY: GradingRecordingPanel.tsx calls this hook once and renders
// <GradingTable> with its fields - `setAllRows`/`applyGradingResult` are the
// live seam the extraction/grading dispatch pipeline writes GradingRow
// objects through (syncGradingRowsFromExtracted / classifyGradingResult in
// grading-rows.ts), and `removeRow`/`clearTable` are the live seam
// GradingTable/GradingTableRow's Remove and Clear table controls call
// through.
//
// PERSISTENCE SCOPE: the whole table now persists too, not just the two UI
// controls (`filterText`, `sort`) - closing THE GAP a capture/extraction
// caller (GradingRecordingPanel.tsx) now actually exercises: an instructor
// records thirty submissions, reloads, and the table used to come back
// empty, silently dropping every grade and any feedback already edited by
// hand. This mirrors useReplyRows.ts's own STORAGE_KEY_TABLE exactly - same
// "read once in the initializer, write on every commit" shape - except
// there is no debounce here: this file has none of useReplyRows.ts's
// generation-guard/debounce machinery (see the file's own header above), so
// every mutator's `commitRows` call persists synchronously via
// `persistRows`, same as `setSort`/`setFilterText` already do below.
//
// Serialization itself (the version constant, the read/write coercion, and
// the quota-fallback write that drops `submissionText` first) lives in
// grading-row-serialization.ts, a pure DOM-free leaf beside grading-row.ts -
// never duplicated here, mirroring discussion-serialization.ts /
// useReplyRows.ts's own division of labour (that file's own header is this
// one's precedent). GradingRow still carries no field that could ever be
// written to `grading_drafts` (grading-row.ts's own header, R0-2) -
// persisting the raw rows to localStorage does not touch that boundary
// (localStorage is not the database table R0-2 forbids), and
// grading-row-serialization.ts's own header documents why its write path
// cannot leak a stray field into the wire format even by accident.
//
// Quota (item 4): a table of thirty submissions' worth of full-length
// submission text WILL exceed a real class's localStorage quota.
// `persistRows` below tries the full write first; on failure it retries
// with `serializeGradingRowsWithoutSubmissionText` (submissionText dropped,
// every feedback field and `userEdited` kept - see that function's own doc
// comment for why submissionText, not feedback, is what gets sacrificed
// first); if even THAT throws, the failure is reported via `persistError`,
// never swallowed. Caught by catching, never by `err.name` - mirrors
// useReplyRows.ts's own AC23a discipline (Firefox/Safari private mode each
// throw something different here).
//
// Keys are whole string literals throughout this file (never a template
// literal) - this directory's own canary
// (grading-rows.test.ts's "grading-recording persisted key canary" block)
// derives its key set with a regex over the literal source, mirroring
// recording-split.structure.test.ts's AC55 discipline for the same reason:
// see useReplyRows.ts's STORAGE_KEY_TABLE comment for the exact footgun
// (writing the bare prefix in prose gets harvested as a fake key).
//
// COURSE SCOPING (docs/course-student-intelligence-acceptance-criteria.md
// D21d): this hook takes an optional `courseId` (the app's own course_hub
// row id - a uuid), mirroring useReplyRows.ts's own D21d section. The
// underlying table is unchanged - one array under one literal storage key -
// but `rows`/`rawRows`/`totalCount` on the return are FILTERED to the rows
// whose `course` field (grading-row.ts's own D21d section) matches
// `courseId`. `courseId` defaults to "" (the same `undefined` scope a row
// with no course tag carries), so every EXISTING caller - until a later wave
// threads a real course_hub id through GradingRecordingPanel.tsx - keeps
// seeing exactly what it always has. `setAllRows` and `clearTable` are
// scope-aware for the same reason useReplyRows.ts's own mergeIncoming/
// clearTable are: `setAllRows` REPLACES the table wholesale (this file's own
// REACHABILITY note above), so it must replace only this course's own slice,
// stamping every row it does not already recognize by id with the current
// scope - otherwise the very first extraction sync after a course switch
// would silently erase every other course's (and the unattributed bucket's)
// rows.
//
// ASSESSMENT SCOPING (docs/course-student-intelligence-acceptance-criteria.md
// D22b/D23e): this hook ALSO takes a required `assessmentId` (an
// instructor-TYPED label - "Essay 2", "Week 3 discussion" - the same kind of
// string useGradingAssessmentDeclarations.ts's own `assessmentId` is, so a
// name typed here and a deadline declared there can key-match exactly).
// Deliberately NOT a second filter axis the way `courseId` is: `rows`/
// `rawRows`/`totalCount` stay scoped to COURSE ONLY - grading-row.ts's
// `assessment` field exists to make a recorded row's assessment
// ATTRIBUTABLE (for a future per-assessment denominator elsewhere in this
// app), not to change what this table itself displays, and the brief this
// hook was built against asked only to "wire it into the store, so newly
// captured rows are stamped with it at mint time" - filtering the visible
// table by assessment as well would be a real, separate UX decision this
// task was not asked to make. `setAllRows` stamps `assessmentScope` onto
// every row it does not already recognize by id, mirroring `courseScope`'s
// own stamp exactly and using the SAME `previousScoped` lookup array (see
// setAllRows below) - grading-row.ts's own test ("stamping course and
// assessment together preserves both axes independently") pins this exact
// composition. An already-attributed row's assessment is NEVER overwritten
// by whichever assessment happens to be selected now - grading-row.ts's own
// SABOTAGE TARGET note on `stampGradingRowsWithAssessment` names this
// precisely.
//
// `assessmentId` is REQUIRED, not defaulted - see this file's own
// `useGradingRows` doc comment on why `courseId` had to become required
// after shipping defaulted for one wave (TS2554 beats a silent
// always-unattributed capture). The identical footgun applies here: an
// omitted argument would compile and every newly captured row would mint
// unattributed, with nothing failing or warning.
//
// LATE MARKING (docs/course-student-intelligence-acceptance-criteria.md
// D23c): `markSubmissionLate` below sets a row's `submissionTimeStatus` to
// "marked-late" - D23c's cheap, honest fallback source for lateness (the
// instructor asserting it while grading), NEVER derived from a clock read in
// this file (see grading-row.ts's own `GradingRowSubmissionTimeStatus` doc
// comment for why capture/grading time is never used as a stand-in for
// submission time). HONEST REACHABILITY FINDING, mirroring grading-row.ts's
// own finding on `assessment` before it was wired: nothing calls
// `markSubmissionLate` yet. A real per-row "Mark late" control needs
// GradingTable.tsx to forward a new callback prop to GradingTableRow.tsx,
// and GradingTable.tsx is outside this task's file set - adding the button
// to GradingTableRow.tsx alone, with no prop path feeding it, would be a
// button that never renders (GradingTable.tsx does not pass the callback
// down), which is worse than not building it. `markSubmissionLate` is built
// and wired to this hook's return value now so that adding the on-screen
// control later (once GradingTable.tsx is in scope) is the same kind of
// small, additive change `stampGradingRowsWithAssessment` already was for
// `assessment` - not a second store-design effort from scratch.

import { useCallback, useMemo, useRef, useState } from "react";
import {
  sortGradingRowsForTable,
  filterGradingRowsForTable,
  isGradingSort,
  editGradingRowField,
  applyGradingResultToRow,
  applyRosterMatchToRow,
  removeGradingRow,
  DEFAULT_GRADING_SORT,
  type GradingSort,
  type GradingFeedbackField,
  type GradingResultInput,
} from "./grading-rows";
import {
  gradingRowMatchesCourse,
  stampGradingRowsWithCourse,
  stampGradingRowsWithAssessment,
  countUnattributedGradingRows,
  type GradingRow,
  type GradingRowNameMatch,
} from "./grading-row";
import {
  serializeGradingRows,
  serializeGradingRowsWithoutSubmissionText,
  deserializeGradingRows,
} from "./grading-row-serialization";

const STORAGE_KEY_FILTER = "ta-rec-grade-filter";
const STORAGE_KEY_SORT = "ta-rec-grade-sort";
const STORAGE_KEY_TABLE = "ta-rec-grade-table";

// Item 4: the exact user-facing messages for the two ways a persistence
// write can come up short. Two distinct messages, not one, because the two
// cases are different in kind: the reduced write still SUCCEEDED (feedback
// is safe), while the full failure means NOTHING was saved this time
// (in-memory rows still work until reload, mirroring useReplyRows.ts's own
// AC23a STORAGE_FULL_MESSAGE guarantee).
const STORAGE_REDUCED_MESSAGE =
  "There was not enough room to also save submission text, so only student names, roster matches, scores and feedback were saved. Your feedback is safe across a reload; re-run the capture to get submission text back.";
const STORAGE_FULL_MESSAGE =
  "There is no room left to save the grading table at all. Your grading still works until you reload - remove rows you are done with, or copy out feedback you need, then try again.";

export interface UseGradingRowsReturn {
  /** Sorted AND filtered for display. A fresh array whenever `rawRows`,
   *  `sort` or `filterText` changes; individual row objects keep the same
   *  reference when untouched, mirroring useReplyRows.ts's own `rows`
   *  (F9's discipline, inherited via filterGradingRowsForTable). */
  rows: GradingRow[];
  /** The UNFILTERED row count - read this, never `rows.length`, for any
   *  count/empty-state/arming decision that must describe the whole table
   *  regardless of the search box (useReplyRows.ts's own F0-2/F11 rule).
   *  D21d: also scoped by course - see the file header. */
  totalCount: number;
  /** The UNFILTERED rows themselves, for a caller that needs to act on the
   *  whole table rather than what is currently visible. D21d: also scoped
   *  by course. */
  rawRows: GradingRow[];
  /** D21d: the number of rows in this browser's WHOLE table (every course,
   *  ignoring the `courseId` this hook was called with) that carry no course
   *  tag at all - see useReplyRows.ts's own `unattributedCount` doc comment
   *  for the exact rule this mirrors. */
  unattributedCount: number;

  sort: GradingSort;
  setSort: (next: GradingSort) => void;
  filterText: string;
  setFilterText: (next: string) => void;

  /** The seam a future capture/extraction caller (not built in this wave)
   *  is expected to call once it has produced and roster-matched rows -
   *  see this file's own REACHABILITY NOTE. Replaces the whole table. */
  setAllRows: (rows: GradingRow[]) => void;

  /** An instructor typing into a feedback field - marks the row userEdited
   *  (grading-rows.ts's editGradingRowField). */
  editField: (id: string, field: GradingFeedbackField, value: string) => void;

  /** Item 5's guard: applies a (future) grading pass's result through
   *  applyGradingResultToRow, which refuses to overwrite an edited row's
   *  scored fields. The caller does not need to check `userEdited` itself -
   *  this function's whole point is that the check happens here, once. */
  applyGradingResult: (id: string, result: GradingResultInput) => void;

  /** Merges a roster-match verdict onto a row (grading-roster-match.ts's
   *  matchNameAgainstRoster is expected to produce the argument). */
  applyRosterMatch: (id: string, match: { nameMatch: GradingRowNameMatch; rosterCandidates: readonly string[] }) => void;

  removeRow: (id: string) => void;
  clearTable: () => void;

  /** D23c: sets `id`'s `submissionTimeStatus` to "marked-late" and clears
   *  `submittedAt` (marked-late carries a verdict, never a timestamp - see
   *  grading-row.ts's own doc comment on `GradingRowSubmissionTimeStatus`).
   *  A no-op when `id` is not found, mirroring `editField`/`applyRosterMatch`'s
   *  own "row is gone" discipline. See this file's own header (LATE MARKING)
   *  for the honest finding on why nothing calls this yet. */
  markSubmissionLate: (id: string) => void;

  /** Item 4. Null once the last persistence write succeeded (in full or in
   *  the reduced, submission-text-dropped form); the exact user-facing
   *  message otherwise. In-memory rows keep working regardless - this never
   *  blocks a mutator, mirroring useReplyRows.ts's own `persistError`. */
  persistError: string | null;
}

/**
 * REQUIRED, not defaulted, and it shipped defaulted for exactly one wave.
 *
 * The default existed for a good reason at the time - the call sites were
 * outside the implementing group's file set, so a required parameter would
 * have broken the build. They are wired now, and the default has to go with
 * them, because of what it does when it is wrong: omitting the argument
 * COMPILES, and every captured row silently mints unattributed. Nothing
 * fails, nothing warns, and the per-course scoping this function exists for
 * is simply absent.
 *
 * This repo has shipped that exact shape twice this week - an optional prop
 * with a no-op default that rendered correctly and wrote nothing, and an
 * optional field whose undefined case could only ever come from a fixture.
 * Both had to be come back for. A required parameter makes the omission
 * error TS2554 instead of a silent behaviour change.
 *
 * Pass the course_hub uuid. An empty string is still legal and still means
 * "no course selected" - what is no longer legal is forgetting to say.
 *
 * `assessmentId` (D22b/D23e) is the instructor-typed assessment label - see
 * this file's own ASSESSMENT SCOPING header section. An empty string is
 * still legal and still means "no assessment set" - what is no longer legal
 * is forgetting to say, for the identical reason `courseId` above stopped
 * being optional.
 */
export function useGradingRows(courseId: string, assessmentId: string): UseGradingRowsReturn {
  // D21d: "" collapses to the same `undefined` scope a row with no course
  // tag carries - see the file header and useReplyRows.ts's own identical
  // comment on its courseScope.
  const courseScope = courseId.length > 0 ? courseId : undefined;
  // D22b/D23e: identical collapse, for the identical reason - see the file
  // header's ASSESSMENT SCOPING section.
  const assessmentScope = assessmentId.length > 0 ? assessmentId : undefined;

  // Read-once-in-the-initializer, guarded by `typeof window` - mirrors
  // useReplyRows.ts's own `rawRows` initializer (STORAGE_KEY_TABLE).
  const [rawRows, setRawRows] = useState<GradingRow[]>(() => {
    if (typeof window === "undefined") return [];
    return deserializeGradingRows(window.localStorage.getItem(STORAGE_KEY_TABLE));
  });
  const [persistError, setPersistError] = useState<string | null>(null);

  // Read-once-in-the-initializer, guarded by `typeof window` - mirrors
  // useReplyRows.ts's own sort/filter initializers. The table is not owned
  // by a capture session, so these two controls outlive one.
  const [sort, setSortState] = useState<GradingSort>(() => {
    if (typeof window === "undefined") return DEFAULT_GRADING_SORT;
    const stored = window.localStorage.getItem(STORAGE_KEY_SORT);
    return isGradingSort(stored) ? stored : DEFAULT_GRADING_SORT;
  });
  const [filterText, setFilterTextState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(STORAGE_KEY_FILTER) ?? "";
  });

  // The single synchronously-fresh source of truth for the row array -
  // mirrors useReplyRows.ts's rowsRef discipline (see that file's own
  // header for the staleness reasoning this avoids). Every mutator below
  // reads/writes rowsRef.current, never a `rawRows` closure.
  const rowsRef = useRef<GradingRow[]>(rawRows);

  // Item 4: tries the full write first; on failure (real-world cause is
  // almost always quota - Firefox's NS_ERROR_DOM_QUOTA_REACHED, Safari
  // private mode throwing on any setItem, or the origin's quota actually
  // filled by some other ta- key), retries with submissionText dropped
  // (serializeGradingRowsWithoutSubmissionText keeps every feedback field
  // and userEdited - see that function's own doc comment for why
  // submissionText is what gets sacrificed first, never feedback). If even
  // the reduced write throws, nothing was saved this time and that is
  // reported, never swallowed. Caught by catching, never by `err.name` -
  // mirrors useReplyRows.ts's own AC23a discipline.
  const persistRows = useCallback((rows: GradingRow[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY_TABLE, serializeGradingRows(rows));
      setPersistError(null);
      return;
    } catch {
      // fall through to the reduced write below
    }
    try {
      window.localStorage.setItem(STORAGE_KEY_TABLE, serializeGradingRowsWithoutSubmissionText(rows));
      setPersistError(STORAGE_REDUCED_MESSAGE);
    } catch {
      setPersistError(STORAGE_FULL_MESSAGE);
    }
  }, []);

  const commitRows = useCallback(
    (next: GradingRow[]) => {
      rowsRef.current = next;
      setRawRows(next);
      persistRows(next);
    },
    [persistRows]
  );

  const setSort = useCallback((next: GradingSort) => {
    setSortState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY_SORT, next);
    } catch {
      // Best-effort, mirrors useReplyRows.ts's own low-stakes-control
      // handling for its filter key: losing this persistence does not
      // affect the in-memory table.
    }
  }, []);

  const setFilterText = useCallback((next: string) => {
    setFilterTextState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY_FILTER, next);
    } catch {
      // Best-effort - see setSort's own comment above.
    }
  }, []);

  const setAllRows = useCallback(
    (next: GradingRow[]) => {
      // D21d: `next` is a WHOLE replacement for this course's own slice
      // (grading-capture-sync.ts's syncGradingRowsFromExtracted builds it
      // from THIS hook's own scoped `rawRows` fed back in - see the file
      // header) - it must never replace rows belonging to a different
      // course or the unattributed bucket. `stampGradingRowsWithCourse`
      // tags every row `next` introduces that this scope's own previous
      // slice did not already have (a brand-new submission) with the
      // current scope; a row that WAS already present keeps its own prior
      // course value exactly.
      const previousScoped = rowsRef.current.filter((r) => gradingRowMatchesCourse(r, courseScope));
      const stampedCourse = stampGradingRowsWithCourse(next, previousScoped, courseScope);
      // D22b/D23e: the identical stamp, one axis at a time, on the SAME
      // `previousScoped` lookup - a row already present in `previousScoped`
      // keeps its own prior assessment exactly; only a row `next` introduces
      // that this scope's own previous slice did not already have gets
      // stamped with the CURRENTLY selected assessment. Never re-adopts an
      // existing row into whichever assessment happens to be selected now -
      // grading-row.ts's own SABOTAGE TARGET note on
      // stampGradingRowsWithAssessment names this precisely, and
      // grading-row.test.ts's "stamping course and assessment together"
      // test pins this exact course-then-assessment composition.
      const stamped = stampGradingRowsWithAssessment(stampedCourse, previousScoped, assessmentScope);
      const otherScopes = rowsRef.current.filter((r) => !gradingRowMatchesCourse(r, courseScope));
      commitRows([...otherScopes, ...stamped]);
    },
    [commitRows, courseScope, assessmentScope]
  );

  const editField = useCallback(
    (id: string, field: GradingFeedbackField, value: string) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return; // row is gone - intentional no-op, mirrors editReply's own AC40 discipline
      const next = raw.map((r, i) => (i === idx ? editGradingRowField(r, field, value) : r));
      commitRows(next);
    },
    [commitRows]
  );

  const applyGradingResult = useCallback(
    (id: string, result: GradingResultInput) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return;
      const next = raw.map((r, i) => (i === idx ? applyGradingResultToRow(r, result) : r));
      commitRows(next);
    },
    [commitRows]
  );

  const applyRosterMatch = useCallback(
    (id: string, match: { nameMatch: GradingRowNameMatch; rosterCandidates: readonly string[] }) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return;
      const next = raw.map((r, i) => (i === idx ? applyRosterMatchToRow(r, match) : r));
      commitRows(next);
    },
    [commitRows]
  );

  // D23c: marks one row "marked-late" - a verdict, never a timestamp (see
  // this file's own header, LATE MARKING). `submittedAt` is explicitly
  // cleared rather than left whatever it happened to be, so an in-memory row
  // can never carry a stale timestamp under a non-"known" status - the same
  // invariant grading-row-serialization.ts's buildWireRow already enforces
  // on write, made true in memory too rather than relying on the write path
  // to paper over it. A no-op when `id` is not found, mirroring
  // editField/applyRosterMatch's own "row is gone" discipline above.
  const markSubmissionLate = useCallback(
    (id: string) => {
      const raw = rowsRef.current;
      const idx = raw.findIndex((r) => r.id === id);
      if (idx === -1) return;
      const next = raw.map((r, i) =>
        i === idx ? { ...r, submissionTimeStatus: "marked-late" as const, submittedAt: undefined } : r
      );
      commitRows(next);
    },
    [commitRows]
  );

  const removeRow = useCallback(
    (id: string) => {
      const raw = rowsRef.current;
      const next = removeGradingRow(raw, id);
      if (next === raw) return; // row is gone - intentional no-op, mirrors editField's own discipline
      commitRows(next);
    },
    [commitRows]
  );

  const clearTable = useCallback(() => {
    // D21d: clears only THIS course's own rows - mirrors useReplyRows.ts's
    // own clearTable exactly. An instructor clearing one class's table must
    // never destroy another class's (or the unattributed bucket's) data,
    // now that they can share one underlying table.
    commitRows(rowsRef.current.filter((r) => !gradingRowMatchesCourse(r, courseScope)));
  }, [commitRows, courseScope]);

  // D21d: the course-scoped slice of the full table - every display/count
  // field below reads from this, never from `rawRows` (the whole table)
  // directly.
  const scopedRawRows = useMemo(
    () => rawRows.filter((r) => gradingRowMatchesCourse(r, courseScope)),
    [rawRows, courseScope]
  );
  // D21d: independent of `courseScope` on purpose - see this field's own
  // doc comment on the return type.
  const unattributedCount = useMemo(() => countUnattributedGradingRows(rawRows), [rawRows]);

  const rows = useMemo(() => {
    const sorted = sortGradingRowsForTable(scopedRawRows, sort);
    return filterGradingRowsForTable(sorted, filterText);
  }, [scopedRawRows, sort, filterText]);

  return {
    rows,
    totalCount: scopedRawRows.length,
    rawRows: scopedRawRows,
    unattributedCount,
    sort,
    setSort,
    filterText,
    setFilterText,
    setAllRows,
    editField,
    applyGradingResult,
    applyRosterMatch,
    removeRow,
    clearTable,
    markSubmissionLate,
    persistError,
  };
}
