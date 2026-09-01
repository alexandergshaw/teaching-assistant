"use client";

// Phase 2 of the tiles -> table redesign: one row per course. Sticky header,
// sticky (frozen) name column, every column sortable (name plus every
// optional column - the former row-expansion cards are columns too), a
// column-visibility dropdown, and per-row inline editing (CourseRow).
import { useEffect, useId, useRef, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import type { Course, CourseInput } from "@/lib/supabase/courses";
import { resolveFocusedCourse } from "@/lib/in-session-banner-display";
import type { FinalizedSyllabusMeta } from "@/lib/supabase/course-syllabi";
import type { SyllabusTemplateMeta } from "@/lib/supabase/syllabus-templates";
import IconButton from "@mui/material/IconButton";
import {
  ALL_COLUMN_IDS,
  COLUMN_MIN_WIDTHS,
  DEFAULT_SORT,
  moveColumnInOrder,
  parseColumnOrder,
  parseColumnSet,
  parseSortState,
  serializeColumnOrder,
  serializeColumnSet,
  sortCourses,
  type ColumnId,
  type SortContext,
  type SortField,
  type SortState,
  type TableEditableField,
} from "@/lib/courses-table-helpers";
import { cellCopyPlan, columnTextForCopy, type CellColumnId } from "@/lib/cell-copy";
import { CELL_COLUMN_LABELS } from "@/lib/courses-table-labels";
import { syncCourseCalendarAction } from "@/app/actions";
import type { UseCourseImportActionsReturn } from "./useCourseImportActions";
import CourseRow from "./CourseRow";
import CellMenu, { type CellMenuItem } from "./CellMenu";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";

const SORT_KEY = "ta-courses-sort";
const COLUMNS_KEY = "ta-courses-columns";
const COLUMN_ORDER_KEY = "ta-courses-column-order";

// F3/AC27-AC28: the state behind the copy-to-other-cells confirm dialog and
// its result/Undo summary. copyRequest holds the SOURCE course/column while
// the confirm dialog is open; the plan itself (and its display summary) is
// recomputed fresh from it (with sortCtx) at render/confirm time rather than
// captured once, so the summary always reflects the source's current value.
interface CopyRequest {
  course: Course;
  column: CellColumnId;
}

interface CopySnapshot {
  courseId: string;
  courseName: string;
  patch: Partial<CourseInput>;
}

interface CopyResult {
  /** U1: which action produced this result - "copy" and "undo" report
   * against the same panel, so the summary sentence (and whether Undo is
   * even offered) has to know which one it is describing. */
  action: "copy" | "undo";
  column: CellColumnId;
  succeeded: number;
  total: number;
  errors: { courseName: string; error: string }[];
  /** RCA-1: a weeklyChecklist copy/undo's non-fatal calendar-sync failures.
   * A target only ever lands here AFTER its local save already succeeded
   * (see runCopy/runUndo) - a calendar problem never counts as a failed
   * copy/undo, so these are surfaced as their own line and deliberately kept
   * out of `succeeded`/`total`, which describe the save only. */
  calendarNotices: { courseName: string; error: string }[];
}

/**
 * RCA-1: the exact gate runCopy/runUndo apply before pushing a
 * weeklyChecklist copy/undo TARGET's calendar (never a per-item sync - see
 * those two functions' own comments for why only the course-level
 * syncCourseCalendarAction can clean up events belonging to items a copy
 * just removed). Extracted as its own pure, hook-free, exported function -
 * rather than left as inline conditions duplicated across both loops - so it
 * is unit-testable on its own: neither runCopy nor runUndo can be exercised
 * directly outside a real React render (they are closures over useState, and
 * CoursesTable.tsx also pulls in MUI, CourseRow, and the full server action
 * barrel - none of it safely importable from this repo's node-environment,
 * "*.test.ts"-only vitest setup). See CoursesTable.gate.test.ts's own header
 * comment for the full explanation of why this function - not the closures
 * themselves - is what gets direct unit coverage.
 *
 * `saveSucceeded` must reflect THIS ONE target's own savePatch outcome for
 * THIS iteration - a sync is never attempted for a target whose local save
 * just failed ("only after a SUCCESSFUL local persist", AC3 of the
 * "Calendar events actually reach the calendar" regression entry).
 * `googleCalendarConnected === false` is the only skip condition (a
 * confirmed "not connected"); `null` (the page's one-time connection check
 * still in flight) fails OPEN and lets the server give the authoritative
 * answer - matching WeeklyChecklistCell's own runItemCalendarSync gate
 * exactly.
 */
export function shouldSyncCalendarAfterChecklistWrite(
  column: CellColumnId,
  saveSucceeded: boolean,
  googleCalendarConnected: boolean | null
): boolean {
  return saveSucceeded && column === "weeklyChecklist" && googleCalendarConnected !== false;
}

export interface CoursesTableProps {
  courses: Course[];
  /**
   * The course to scroll to and tint, set when the instructor arrives here
   * from the in-session banner. CoursesTab owns the lifetime of this value
   * (it clears itself after a beat); this component only reacts to it.
   */
  highlightCourseId?: string | null;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onNewCourse: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  totalCourseCount: number;
  syllabi: FinalizedSyllabusMeta[];
  syllabusTemplates: SyllabusTemplateMeta[];
  ownedRepos: string[] | null;
  /** null while the page's one-time connection check is still in flight -
   * see courseCalendarBlockers in course-calendar-events.ts. */
  googleCalendarConnected: boolean | null;
  notifByCourse: Record<string, { needsGrading: number; unread: number }>;
  onSyncAllCalendars: () => void;
  syncingAllCalendars: boolean;
  saveField: (course: Course, field: TableEditableField, rawValue: string, extra?: Partial<CourseInput>) => Promise<Course | null>;
  /** F3: the write half of saveField (useInlineFieldSave), used to apply a
   * ready-made cellCopyPlan patch to a copy target/undo without any
   * per-field recomputation. */
  savePatch: (course: Course, patch: Partial<CourseInput>) => Promise<Course | null>;
  onCourseUpdated: (course: Course) => void;
  setError: (message: string | null) => void;
  imports: UseCourseImportActionsReturn;
  onNavigate: (tab: "course-planning" | "version-control" | "workflows", course: Course) => void;
  onEdit: (course: Course) => void;
  onDelete: (course: Course) => void;
  onAskAi: (course: Course) => void;
  onPreviewProject: (course: Course, name: string, text: string) => void;
  deleteBusyId: string | null;
  onPreviewCsv: (course: Course, name: string, csv: string) => void;
  onPreviewRubric: (course: Course, name: string, rubric: string) => void;
  onPreviewSyllabus: (course: Course) => void;
  onDownloadSyllabus: (course: Course) => void;
  previewSyllabusId: string | null;
  downloadSyllabusId: string | null;
  onSyllabusUploaded: (course: Course, syllabusId: string) => void;
  onSyllabusTemplateCreated: (template: SyllabusTemplateMeta) => void;
  /** F1: opens the "Recommend textbooks" modal for a course. */
  onRecommendTextbooks: (course: Course) => void;
  /** F2: opens the "Extract from photo" modal for a course. */
  onExtractTextbookPhoto: (course: Course) => void;
}

export default function CoursesTable({
  courses,
  highlightCourseId = null,
  loading,
  refreshing,
  onRefresh,
  onNewCourse,
  search,
  onSearchChange,
  totalCourseCount,
  syllabi,
  syllabusTemplates,
  ownedRepos,
  googleCalendarConnected,
  notifByCourse,
  onSyncAllCalendars,
  syncingAllCalendars,
  saveField,
  savePatch,
  onCourseUpdated,
  setError,
  imports,
  onNavigate,
  onEdit,
  onDelete,
  onAskAi,
  onPreviewProject,
  deleteBusyId,
  onPreviewCsv,
  onPreviewRubric,
  onPreviewSyllabus,
  onDownloadSyllabus,
  previewSyllabusId,
  downloadSyllabusId,
  onSyllabusUploaded,
  onSyllabusTemplateCreated,
  onRecommendTextbooks,
  onExtractTextbookPhoto,
}: CoursesTableProps) {
  // Lazy-initialized from localStorage (client-only guard avoids an SSR
  // mismatch; matches the ta- persistence idiom used across the app).
  const [sort, setSort] = useState<SortState>(() =>
    typeof window === "undefined" ? DEFAULT_SORT : parseSortState(localStorage.getItem(SORT_KEY))
  );
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(() =>
    typeof window === "undefined" ? [...ALL_COLUMN_IDS] : parseColumnSet(localStorage.getItem(COLUMNS_KEY))
  );
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(() =>
    typeof window === "undefined" ? [...ALL_COLUMN_IDS] : parseColumnOrder(localStorage.getItem(COLUMN_ORDER_KEY))
  );
  const [columnsMenuAnchor, setColumnsMenuAnchor] = useState<HTMLElement | null>(null);

  // Brings the highlighted row into view. The row is inside .scroller, which
  // is the real scrolling box here (see CoursesTable.module.css), so
  // scrollIntoView has to walk both it and the page - "nearest" leaves the
  // page scroll alone when the table is already on screen, and "center" puts
  // the row clear of the sticky header rather than flush under it.
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (!highlightCourseId) return;
    const row = highlightRowRef.current;
    if (!row) return;
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
  }, [highlightCourseId]);

  // The spoken half of the arrival highlight. resolveFocusedCourse is the
  // same id-to-course resolver the banner itself uses, so a highlight can
  // never announce a course that is not actually on screen.
  const highlightedCourse = resolveFocusedCourse(courses, highlightCourseId);

  // The single ordered list the header AND every row render from, so a header
  // and its cells can never fall out of alignment.
  const orderedVisibleColumns = columnOrder.filter((id) => visibleColumns.includes(id));

  const moveColumn = (id: ColumnId, direction: "up" | "down") => {
    setColumnOrder((prev) => {
      const next = moveColumnInOrder(prev, visibleColumns, id, direction);
      localStorage.setItem(COLUMN_ORDER_KEY, serializeColumnOrder(next));
      return next;
    });
  };

  const applySort = (field: SortField) => {
    setSort((prev) => {
      const next: SortState = prev.field === field ? { field, direction: prev.direction === "asc" ? "desc" : "asc" } : { field, direction: "asc" };
      localStorage.setItem(SORT_KEY, JSON.stringify(next));
      return next;
    });
  };

  const toggleColumn = (id: ColumnId) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(COLUMNS_KEY, serializeColumnSet(next));
      return next;
    });
  };

  const sortIndicator = (field: SortField) => (sort.field === field ? (sort.direction === "asc" ? " ▲" : " ▼") : "");

  const sortCtx: SortContext = {
    syllabusNameById: new Map(syllabi.map((s) => [s.id, s.name])),
    syllabusTemplateNameById: new Map(syllabusTemplates.map((t) => [t.id, t.name])),
  };
  const sorted = sortCourses(courses, sort, sortCtx);

  // F3/AC24-AC28: per-cell "Copy information to other cells" - confirm,
  // write, result summary, Undo. copyRequest names the SOURCE course/column
  // while the confirm dialog is open; the plan (and its display summary) is
  // recomputed fresh from `courses`/sortCtx below rather than snapshotted at
  // the moment the menu item was clicked, so a fast edit in between is never
  // shown a stale summary.
  const [copyRequest, setCopyRequest] = useState<CopyRequest | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyResult, setCopyResult] = useState<CopyResult | null>(null);
  const [undoState, setUndoState] = useState<{ column: CellColumnId; snapshots: CopySnapshot[] } | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);

  const copyPlan = copyRequest ? cellCopyPlan(copyRequest.course, copyRequest.column, sortCtx) : null;
  const copyTargetCount = copyRequest ? courses.filter((c) => c.id !== copyRequest.course.id).length : 0;

  const closeCopyDialog = () => setCopyRequest(null);

  const runCopy = async () => {
    if (!copyRequest || !copyPlan || !copyPlan.copyable) return;
    const { course: source, column } = copyRequest;
    const patch = copyPlan.patch;
    const targets = courses.filter((c) => c.id !== source.id);

    setCopyBusy(true);
    // A fresh copy invalidates any earlier Undo offer (AC28: "offered for
    // the last copy only... disappears once used or once another copy
    // runs") - cleared up front, before the writes below, not after.
    setUndoState(null);

    const snapshots: CopySnapshot[] = [];
    const errors: { courseName: string; error: string }[] = [];
    const calendarNotices: { courseName: string; error: string }[] = [];
    let succeeded = 0;

    for (const target of targets) {
      // AC27/AC28: snapshot the target's CURRENT plan for this column BEFORE
      // writing - that snapshot (its own patch) is exactly what Undo re-applies.
      const beforePlan = cellCopyPlan(target, column, sortCtx);
      const saved = await savePatch(target, patch);
      const ok = saved !== null;
      if (ok) {
        succeeded += 1;
        snapshots.push({
          courseId: target.id,
          courseName: target.name,
          patch: beforePlan.copyable ? beforePlan.patch : {},
        });
      } else {
        // One failure must not abort the rest (AC27). savePatch already
        // surfaced the underlying message via setError; a per-course reason
        // this generic is the most this shared save path can report without
        // its own dedicated per-call error channel.
        errors.push({ courseName: target.name, error: "Could not save." });
      }

      // RCA-1: a weeklyChecklist copy REPLACES the target's whole list, so
      // only a course-level sync (never the per-item
      // syncChecklistItemCalendarAction the checklist cell itself uses) can
      // clean up events belonging to items the copy just removed - it diffs
      // planned-vs-existing for the WHOLE course. shouldSyncCalendarAfterChecklistWrite
      // enforces "only after a successful local persist" (via `ok`, computed
      // fresh above for THIS target) and the same fail-open-on-null
      // connection gate WeeklyChecklistCell's own runItemCalendarSync uses. A
      // sync failure never turns this target's already-successful save into
      // a reported failure - it is collected separately and shown as its own
      // non-fatal line below.
      if (shouldSyncCalendarAfterChecklistWrite(column, ok, googleCalendarConnected)) {
        const syncResult = await syncCourseCalendarAction(target.id);
        if ("error" in syncResult) {
          calendarNotices.push({ courseName: target.name, error: syncResult.error });
        }
      }
    }

    setCopyBusy(false);
    setCopyResult({ action: "copy", column, succeeded, total: targets.length, errors, calendarNotices });
    if (succeeded > 0) setUndoState({ column, snapshots });
    setCopyRequest(null);
  };

  // U1: previously discarded savePatch's return value entirely and always
  // cleared the result panel - if undo failed for some or all courses, the
  // instructor was told nothing and the earlier overwrite silently stood.
  // Mirrors runCopy's own per-course error collection above, and only clears
  // the panel when every course was actually restored.
  const runUndo = async () => {
    if (!undoState) return;
    setUndoBusy(true);
    const { column, snapshots } = undoState;
    const errors: { courseName: string; error: string }[] = [];
    const calendarNotices: { courseName: string; error: string }[] = [];
    let succeeded = 0;
    for (const snap of snapshots) {
      const current = courses.find((c) => c.id === snap.courseId);
      if (!current) {
        // Nothing to save or sync - the course itself is no longer in view.
        errors.push({ courseName: snap.courseName, error: "No longer in view - could not restore." });
        continue;
      }
      const saved = await savePatch(current, snap.patch);
      const ok = saved !== null;
      if (ok) {
        succeeded += 1;
      } else {
        errors.push({ courseName: snap.courseName, error: "Could not restore." });
      }

      // RCA-1: undo is itself a weeklyChecklist write when the copy it is
      // reversing was - same gap, same fix, same shouldSyncCalendarAfterChecklistWrite
      // gate as runCopy above: sync only after THIS target's own restore
      // just succeeded (via `ok`, computed fresh above), only for THIS
      // target, skipped only on a confirmed "not connected", and a sync
      // failure never turns a successful restore into a reported failure.
      if (shouldSyncCalendarAfterChecklistWrite(column, ok, googleCalendarConnected)) {
        const syncResult = await syncCourseCalendarAction(snap.courseId);
        if ("error" in syncResult) {
          calendarNotices.push({ courseName: snap.courseName, error: syncResult.error });
        }
      }
    }
    setUndoBusy(false);
    setUndoState(null);
    if (errors.length === 0 && calendarNotices.length === 0) {
      // Fully restored with nothing to report - same as before this fix.
      setCopyResult(null);
    } else {
      setCopyResult({ action: "undo", column, succeeded, total: snapshots.length, errors, calendarNotices });
    }
  };

  // F4/AC37-AC41: the header "Copy all" clipboard action - one column's full
  // text, one course per line prefixed by its name, for every course
  // currently in view (`sorted`, not the unfiltered set, so the copied order
  // matches what is on screen).
  const [copyAllStatus, setCopyAllStatus] = useState<{ column: CellColumnId; count: number } | null>(null);
  const [copyAllFallback, setCopyAllFallback] = useState<{ column: CellColumnId; text: string } | null>(null);

  const runCopyAll = async (column: CellColumnId) => {
    const text = columnTextForCopy(sorted, column, sortCtx);
    setCopyResult(null);
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard || !window.isSecureContext) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(text);
      setCopyAllStatus({ column, count: sorted.length });
      setCopyAllFallback(null);
    } catch {
      // AC41: a clipboard failure (insecure context, denied permission)
      // never fails silently - the full text is offered in a readonly,
      // pre-selected fallback box instead.
      setCopyAllFallback({ column, text });
      setCopyAllStatus(null);
    }
  };

  const headerMenuItems = (id: CellColumnId): CellMenuItem[] => [
    {
      key: "copy-all",
      label: "Copy all",
      helperText: "Copies every course currently in view to the clipboard.",
      onSelect: () => void runCopyAll(id),
    },
  ];

  // B3: names the two paragraphs the destructive copy-confirmation Dialog
  // relies on to convey its actual consequence - MUI's Dialog auto-wires
  // aria-labelledby from DialogTitle (Dialog.js/DialogTitle.js) but does NOT
  // auto-wire aria-describedby (Dialog.js only forwards it when passed
  // explicitly), so without this id those two sentences are never announced.
  const copyDialogDescriptionId = useId();

  // A5: each of these permanently-mounted role="status" regions (below, next
  // to .focusAnnouncement) holds a short, self-contained sentence - kept
  // separate from the visible summary block's Undo/Dismiss buttons so a
  // screen reader's announcement of the region is never a button's label
  // running on into the sentence.
  const copyAllAnnouncement = copyAllStatus
    ? `Copied ${CELL_COLUMN_LABELS[copyAllStatus.column]} for ${copyAllStatus.count} course${copyAllStatus.count === 1 ? "" : "s"} to the clipboard.`
    : copyAllFallback
      ? `Could not copy ${CELL_COLUMN_LABELS[copyAllFallback.column]} to the clipboard automatically. The text is available below to copy manually.`
      : "";

  const copyResultAnnouncement = copyResult
    ? copyResult.action === "undo"
      ? `Undo restored ${copyResult.succeeded} of ${copyResult.total} course${copyResult.total === 1 ? "" : "s"}.`
      : `Copied ${CELL_COLUMN_LABELS[copyResult.column]} to ${copyResult.succeeded} of ${copyResult.total} course${copyResult.total === 1 ? "" : "s"}.`
    : "";

  return (
    <>
      {/* marginTop: 0 overrides page.module.css's .adaptActionBar (margin-top:
          14px) - kept inline rather than as a same-specificity CSS class
          because a plain className cannot reliably out-rank a class from a
          different, separately-bundled stylesheet; 0 needs no token (AC3
          treats it as a trivial 4px multiple). */}
      <div className={`${styles.adaptActionBar} ${tableStyles.actionBar}`} style={{ marginTop: 0 }}>
        <Button variant="contained" size="small" onClick={onNewCourse}>
          New course
        </Button>
        <Button variant="text" size="small" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
        {totalCourseCount > 0 && (
          <Button
            variant="text"
            size="small"
            onClick={onSyncAllCalendars}
            disabled={syncingAllCalendars}
            title="Push every course's term, meetings, tests, due dates, and checklist deadlines to Google Calendar"
          >
            {syncingAllCalendars ? "Syncing calendars…" : "Sync all calendars"}
          </Button>
        )}
        {totalCourseCount > 0 && (
          <TextField
            size="small"
            type="search"
            placeholder="Search courses, codes, repos, integrations…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            sx={{ flex: "1 1 220px" }}
          />
        )}
        <Button variant="text" size="small" onClick={(e) => setColumnsMenuAnchor(e.currentTarget)}>
          Columns
        </Button>
        <Menu anchorEl={columnsMenuAnchor} open={Boolean(columnsMenuAnchor)} onClose={() => setColumnsMenuAnchor(null)}>
          {columnOrder.map((id) => {
            const shown = visibleColumns.includes(id);
            const position = orderedVisibleColumns.indexOf(id);
            return (
              <MenuItem key={id} onClick={() => toggleColumn(id)} dense>
                <Checkbox size="small" checked={shown} />
                <ListItemText primary={CELL_COLUMN_LABELS[id]} />
                <IconButton
                  size="small"
                  aria-label={`Move ${CELL_COLUMN_LABELS[id]} left`}
                  title="Move left"
                  disabled={!shown || position <= 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    moveColumn(id, "up");
                  }}
                >
                  &#8592;
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={`Move ${CELL_COLUMN_LABELS[id]} right`}
                  title="Move right"
                  disabled={!shown || position === -1 || position >= orderedVisibleColumns.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    moveColumn(id, "down");
                  }}
                >
                  &#8594;
                </IconButton>
              </MenuItem>
            );
          })}
        </Menu>
      </div>

      {/* A5: permanently mounted (never conditional) so a screen reader
          registers the region before the first mutation and actually
          announces it, matching the pre-existing .focusAnnouncement idiom
          below. Holds only the sentence - the visible summary block's own
          Undo/Dismiss buttons live outside it (see the two blocks below) so
          their labels never run into the same announcement. */}
      <div className={tableStyles.focusAnnouncement} role="status" aria-live="polite">
        {copyAllAnnouncement}
      </div>

      {/* F4/AC41: "Copy all" confirmation, or its clipboard-failure fallback -
          a visible, dismissible status rather than only a screen-reader
          announcement, so a clipboard denial is never silent. */}
      {(copyAllStatus || copyAllFallback) && (
        <div className={tableStyles.copyStatusBlock}>
          {copyAllStatus && (
            <div className={tableStyles.rowSm}>
              <p className={styles.fieldHint}>
                Copied {CELL_COLUMN_LABELS[copyAllStatus.column]} for {copyAllStatus.count} course{copyAllStatus.count === 1 ? "" : "s"} to the clipboard.
              </p>
              {/* B7: two "Dismiss" buttons can be on screen at once (this one
                  and the copy-result one below) - aria-label distinguishes
                  them for anyone browsing by control name. */}
              <button type="button" className={styles.linkButton} aria-label="Dismiss copy-all confirmation" onClick={() => setCopyAllStatus(null)}>
                Dismiss
              </button>
            </div>
          )}
          {copyAllFallback && (
            <div className={tableStyles.stackXs}>
              <p className={`${styles.fieldHint} ${tableStyles.dangerLink}`}>
                Could not copy {CELL_COLUMN_LABELS[copyAllFallback.column]} to the clipboard automatically. Select the text below and copy it manually.
              </p>
              <textarea
                readOnly
                aria-label={`${CELL_COLUMN_LABELS[copyAllFallback.column]} text to copy`}
                value={copyAllFallback.text}
                onFocus={(e) => e.currentTarget.select()}
                className={tableStyles.copyFallbackArea}
              />
              <button type="button" className={styles.linkButton} aria-label="Dismiss clipboard-copy fallback" onClick={() => setCopyAllFallback(null)}>
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* A5: see the comment on the copy-all announcement above - same
          always-mounted idiom, same "sentence only" separation from the
          visible block's Undo/Dismiss buttons. */}
      <div className={tableStyles.focusAnnouncement} role="status" aria-live="polite">
        {copyResultAnnouncement}
      </div>

      {/* F3/AC27-AC28/U1: the last copy-to-other-cells (or undo) result. */}
      {copyResult && (
        <div className={tableStyles.copyStatusBlock}>
          <div className={tableStyles.rowSm}>
            <p className={styles.fieldHint}>
              {copyResultAnnouncement}
            </p>
            {undoState && undoState.column === copyResult.column && (
              <button type="button" className={styles.linkButton} disabled={undoBusy} onClick={() => void runUndo()}>
                {undoBusy ? "Undoing…" : "Undo"}
              </button>
            )}
            <button
              type="button"
              className={styles.linkButton}
              aria-label={copyResult.action === "undo" ? "Dismiss undo result" : "Dismiss copy result"}
              onClick={() => setCopyResult(null)}
            >
              Dismiss
            </button>
          </div>
          {copyResult.errors.length > 0 && (
            <ul className={tableStyles.resultList}>
              {copyResult.errors.map((e) => (
                <li key={e.courseName} className={`${styles.fieldHint} ${tableStyles.dangerLink}`}>
                  {e.courseName}: {e.error}
                </li>
              ))}
            </ul>
          )}
          {/* RCA-1: a weeklyChecklist copy/undo's calendar-sync failures - the
              local save for these already succeeded (they are never in
              `errors` above), so this is deliberately worded like
              WeeklyChecklistCell's own per-item notice ("...saved, but the
              calendar could not be updated: ...") rather than as a failure of
              the copy/undo itself. */}
          {copyResult.calendarNotices.length > 0 && (
            <ul className={tableStyles.resultList}>
              {copyResult.calendarNotices.map((n) => (
                <li key={n.courseName} className={`${styles.fieldHint} ${tableStyles.dangerLink}`}>
                  {n.courseName}: Checklist saved, but the calendar could not be updated: {n.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={tableStyles.focusAnnouncement} role="status" aria-live="polite">
        {highlightedCourse ? `Showing ${highlightedCourse.name}.` : ""}
      </div>

      {loading && (
        <div className={styles.finalizedLoading} role="status" aria-live="polite" style={{ alignItems: "center", gap: "var(--space-2)" }}>
          <CircularProgress size={22} />
          <span style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>Loading courses...</span>
        </div>
      )}

      {!loading && totalCourseCount === 0 && (
        <p className={styles.fieldHint}>No courses yet. Choose &ldquo;New course&rdquo; to bundle your first one.</p>
      )}

      {!loading && totalCourseCount > 0 && courses.length === 0 && (
        <p className={styles.fieldHint}>No courses match &ldquo;{search.trim()}&rdquo;.</p>
      )}

      {!loading && courses.length > 0 && (
        <div className={tableStyles.scroller}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                {/* F4/AC35-AC36: the header hamburger sits alongside the sort
                    text, not inside it - CellMenu already stopPropagations
                    its own click/mousedown/keydown, so its button never
                    reaches this th's onClick and never sorts (verified
                    against CellMenu.tsx's own stopBubble wiring). */}
                <th className={tableStyles.sortableHeader} onClick={() => applySort("name")} style={{ minWidth: COLUMN_MIN_WIDTHS.name }}>
                  <span className={tableStyles.headerLabel}>
                    Name{sortIndicator("name")}
                  </span>
                  <span className={tableStyles.cellMenu}>
                    <CellMenu label="Name" items={headerMenuItems("name")} />
                  </span>
                </th>
                {orderedVisibleColumns.map((id) => (
                  <th key={id} className={tableStyles.sortableHeader} onClick={() => applySort(id)} style={{ minWidth: COLUMN_MIN_WIDTHS[id] }}>
                    <span className={tableStyles.headerLabel}>
                      {CELL_COLUMN_LABELS[id]}{sortIndicator(id)}
                    </span>
                    <span className={tableStyles.cellMenu}>
                      <CellMenu label={CELL_COLUMN_LABELS[id]} items={headerMenuItems(id)} />
                    </span>
                  </th>
                ))}
                <th style={{ minWidth: COLUMN_MIN_WIDTHS.actions }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <CourseRow
                  key={c.id}
                  course={c}
                  highlighted={c.id === highlightCourseId}
                  rowRef={c.id === highlightCourseId ? highlightRowRef : undefined}
                  visibleColumns={orderedVisibleColumns}
                  syllabi={syllabi}
                  syllabusTemplates={syllabusTemplates}
                  ownedRepos={ownedRepos}
                  googleCalendarConnected={googleCalendarConnected}
                  notifTotal={(() => {
                    const n = notifByCourse[c.id];
                    return n ? n.needsGrading + n.unread : 0;
                  })()}
                  saveField={saveField}
                  onCourseUpdated={onCourseUpdated}
                  setError={setError}
                  imports={imports}
                  onNavigate={onNavigate}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onAskAi={onAskAi}
                  onPreviewProject={onPreviewProject}
                  deleteBusy={deleteBusyId === c.id}
                  onPreviewCsv={onPreviewCsv}
                  onPreviewRubric={onPreviewRubric}
                  onPreviewSyllabus={onPreviewSyllabus}
                  onDownloadSyllabus={onDownloadSyllabus}
                  previewSyllabusBusy={previewSyllabusId === c.id}
                  downloadSyllabusBusy={downloadSyllabusId === c.id}
                  onSyllabusUploaded={onSyllabusUploaded}
                  onSyllabusTemplateCreated={onSyllabusTemplateCreated}
                  otherCoursesInView={courses.length - 1}
                  onCopyCellToVisible={(course, column) => setCopyRequest({ course, column })}
                  onRecommendTextbooks={onRecommendTextbooks}
                  onExtractTextbookPhoto={onExtractTextbookPhoto}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* F3/AC25: the copy-to-other-cells confirmation - names the column,
          the value being copied (or "Not set"), how many other courses in
          view will be overwritten, and that this overwrites their existing
          value. Cancel changes nothing. */}
      {copyRequest && copyPlan && copyPlan.copyable && (
        <Dialog open onClose={closeCopyDialog} aria-describedby={copyDialogDescriptionId}>
          <DialogTitle>Copy {CELL_COLUMN_LABELS[copyRequest.column]} to other courses</DialogTitle>
          <DialogContent>
            {/* B3: MUI's Dialog auto-wires aria-labelledby from DialogTitle
                (Dialog.js/DialogTitle.js) but does NOT auto-wire
                aria-describedby - verified in Dialog.js, which only forwards
                it when the caller passes it explicitly (see above). Without
                this wrapper's id on the Dialog, these two sentences (the
                entire consequence of the action) are never announced. */}
            <div id={copyDialogDescriptionId}>
              <p className={`${styles.fieldHint} ${tableStyles.copyValueLine}`}>
                Value: {copyPlan.summary}
              </p>
              <p>
                This will overwrite {CELL_COLUMN_LABELS[copyRequest.column]} on {copyTargetCount} other course
                {copyTargetCount === 1 ? "" : "s"} currently in view with the value above.
              </p>
            </div>
          </DialogContent>
          <DialogActions>
            <Button variant="text" size="small" disabled={copyBusy} onClick={closeCopyDialog}>
              Cancel
            </Button>
            <Button variant="contained" size="small" disabled={copyBusy} onClick={() => void runCopy()}>
              {copyBusy ? "Copying…" : "Copy"}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
