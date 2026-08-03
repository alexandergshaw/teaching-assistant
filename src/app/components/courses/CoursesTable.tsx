"use client";

// Phase 2 of the tiles -> table redesign: one row per course. Sticky header,
// sticky (frozen) name column, every column sortable (name plus every
// optional column - the former row-expansion cards are columns too), a
// column-visibility dropdown, and per-row inline editing (CourseRow).
import { useEffect, useRef, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import CircularProgress from "@mui/material/CircularProgress";
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
import type { UseCourseImportActionsReturn } from "./useCourseImportActions";
import CourseRow from "./CourseRow";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";

const SORT_KEY = "ta-courses-sort";
const COLUMNS_KEY = "ta-courses-columns";
const COLUMN_ORDER_KEY = "ta-courses-column-order";

const COLUMN_LABELS: Record<ColumnId, string> = {
  institution: "Institution",
  modality: "Modality",
  startDate: "Start date",
  dayTime: "Day/Time",
  weeks: "Weeks",
  tests: "Tests",
  lms: "LMS",
  githubOrg: "Organization",
  syllabusId: "Syllabus",
  textbook: "Textbook",
  repos: "Codebases",
  roster: "Roster",
  studentRepos: "Student repos",
  integrations: "Integrations",
  description: "Description",
  courseKind: "Course type",
  scheduleCsv: "Schedule of Topics",
  rubric: "Rubric",
  materials: "Materials",
  lmsExports: "LMS Exports",
  topicOutline: "Topic Outline",
  castletop: "Castletop",
  syllabusTemplate: "Syllabus template",
  endDate: "End date",
  gradesDue: "Grades due",
  breaks: "Breaks",
  assignmentDue: "Assignment due",
  email: "Email",
  emailClient: "Email client",
  classLength: "Class length",
  miscFiles: "Misc files",
  courseProject: "Course project",
  // AC4/AC5: relabeled from "Weekly Checklist" - the instructor's ask was a
  // user-facing string change only. The ColumnId key itself ("weeklyChecklist"),
  // every internal symbol, and the weekly_checklist DB column all deliberately
  // keep the word "weekly" - see weekly-checklist.ts's own AC7 naming note for
  // why renaming those buys nothing and costs a real migration/rename risk.
  weeklyChecklist: "Checklist",
};

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

  return (
    <>
      <div className={styles.adaptActionBar} style={{ marginTop: 0 }}>
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
                <ListItemText primary={COLUMN_LABELS[id]} />
                <IconButton
                  size="small"
                  aria-label={`Move ${COLUMN_LABELS[id]} left`}
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
                  aria-label={`Move ${COLUMN_LABELS[id]} right`}
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

      <div className={tableStyles.focusAnnouncement} role="status" aria-live="polite">
        {highlightedCourse ? `Showing ${highlightedCourse.name}.` : ""}
      </div>

      {loading && (
        <div className={styles.finalizedLoading}>
          <CircularProgress size={22} />
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
                <th onClick={() => applySort("name")} style={{ cursor: "pointer", minWidth: COLUMN_MIN_WIDTHS.name }}>
                  Name{sortIndicator("name")}
                </th>
                {orderedVisibleColumns.map((id) => (
                  <th key={id} onClick={() => applySort(id)} style={{ cursor: "pointer", minWidth: COLUMN_MIN_WIDTHS[id] }}>
                    {COLUMN_LABELS[id]}{sortIndicator(id)}
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
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
