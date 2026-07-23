"use client";

// Phase 2 of the tiles -> table redesign: one row per course. Sticky header,
// sticky (frozen) name column, sortable name/startDate, a column-visibility
// dropdown, and per-row inline editing / expansion (CourseRow).
import { useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import CircularProgress from "@mui/material/CircularProgress";
import type { Course, CourseInput } from "@/lib/supabase/courses";
import type { FinalizedSyllabusMeta } from "@/lib/supabase/course-syllabi";
import {
  ALL_COLUMN_IDS,
  DEFAULT_SORT,
  parseColumnSet,
  parseSortState,
  serializeColumnSet,
  sortCourses,
  type ColumnId,
  type SortField,
  type SortState,
  type TableEditableField,
} from "@/lib/courses-table-helpers";
import type { UseCourseImportActionsReturn } from "./useCourseImportActions";
import CourseRow from "./CourseRow";
import styles from "../../page.module.css";

const SORT_KEY = "ta-courses-sort";
const COLUMNS_KEY = "ta-courses-columns";

// Sticky header offset: pins below the app's fixed top bar + tab strip
// (matches .courseGroupSticky's offset in page.module.css) so the header row
// is never hidden behind them while the page scrolls.
const STICKY_TOP = "calc(var(--topbar-height, 58px) + 45px)";
const HEADER_CELL_STYLE: React.CSSProperties = {
  position: "sticky",
  top: STICKY_TOP,
  zIndex: 2,
  background: "color-mix(in srgb, var(--field-background) 90%, var(--accent) 10%)",
};

const COLUMN_LABELS: Record<ColumnId, string> = {
  institution: "Institution",
  startDate: "Start date",
  dayTime: "Day/Time",
  weeks: "Weeks",
  tests: "Tests",
  lms: "LMS",
  githubOrg: "Organization",
  syllabusId: "Syllabus",
  textbook: "Textbook",
  rosterCount: "Roster",
  studentRepoCount: "Student repos",
  reposCount: "Repos",
};

export interface CoursesTableProps {
  courses: Course[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onNewCourse: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  totalCourseCount: number;
  syllabi: FinalizedSyllabusMeta[];
  ownedRepos: string[] | null;
  notifByCourse: Record<string, { needsGrading: number; unread: number }>;
  saveField: (course: Course, field: TableEditableField, rawValue: string, extra?: Partial<CourseInput>) => Promise<Course | null>;
  onCourseUpdated: (course: Course) => void;
  setError: (message: string | null) => void;
  imports: UseCourseImportActionsReturn;
  onNavigate: (tab: "course-planning" | "version-control" | "workflows", course: Course) => void;
  onEdit: (course: Course) => void;
  onDelete: (course: Course) => void;
  deleteBusyId: string | null;
  onPreviewCsv: (name: string, csv: string) => void;
  onPreviewRubric: (name: string, rubric: string) => void;
  onPreviewSyllabus: (course: Course) => void;
  onDownloadSyllabus: (course: Course) => void;
  previewSyllabusId: string | null;
  downloadSyllabusId: string | null;
  onSyllabusUploaded: (course: Course, syllabusId: string) => void;
}

export default function CoursesTable({
  courses,
  loading,
  refreshing,
  onRefresh,
  onNewCourse,
  search,
  onSearchChange,
  totalCourseCount,
  syllabi,
  ownedRepos,
  notifByCourse,
  saveField,
  onCourseUpdated,
  setError,
  imports,
  onNavigate,
  onEdit,
  onDelete,
  deleteBusyId,
  onPreviewCsv,
  onPreviewRubric,
  onPreviewSyllabus,
  onDownloadSyllabus,
  previewSyllabusId,
  downloadSyllabusId,
  onSyllabusUploaded,
}: CoursesTableProps) {
  // Lazy-initialized from localStorage (client-only guard avoids an SSR
  // mismatch; matches the ta- persistence idiom used across the app).
  const [sort, setSort] = useState<SortState>(() =>
    typeof window === "undefined" ? DEFAULT_SORT : parseSortState(localStorage.getItem(SORT_KEY))
  );
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(() =>
    typeof window === "undefined" ? [...ALL_COLUMN_IDS] : parseColumnSet(localStorage.getItem(COLUMNS_KEY))
  );
  const [columnsMenuAnchor, setColumnsMenuAnchor] = useState<HTMLElement | null>(null);

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

  const sorted = sortCourses(courses, sort);

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
          {ALL_COLUMN_IDS.map((id) => (
            <MenuItem key={id} onClick={() => toggleColumn(id)} dense>
              <Checkbox size="small" checked={visibleColumns.includes(id)} />
              <ListItemText primary={COLUMN_LABELS[id]} />
            </MenuItem>
          ))}
        </Menu>
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
        <div style={{ width: "100%", overflowX: "auto", border: "1px solid var(--field-border)", borderRadius: 14 }}>
          <table className={styles.courseScheduleTable} style={{ minWidth: 960 }}>
            <thead>
              <tr>
                <th
                  onClick={() => applySort("name")}
                  style={{ ...HEADER_CELL_STYLE, left: 0, zIndex: 3, cursor: "pointer", minWidth: 220 }}
                >
                  Name{sortIndicator("name")}
                </th>
                {visibleColumns.includes("institution") && <th style={HEADER_CELL_STYLE}>Institution</th>}
                {visibleColumns.includes("startDate") && (
                  <th onClick={() => applySort("startDate")} style={{ ...HEADER_CELL_STYLE, cursor: "pointer" }}>
                    Start date{sortIndicator("startDate")}
                  </th>
                )}
                {visibleColumns.includes("dayTime") && <th style={HEADER_CELL_STYLE}>Day/Time</th>}
                {visibleColumns.includes("weeks") && <th style={HEADER_CELL_STYLE}>Weeks</th>}
                {visibleColumns.includes("tests") && <th style={HEADER_CELL_STYLE}>Tests</th>}
                {visibleColumns.includes("lms") && <th style={HEADER_CELL_STYLE}>LMS</th>}
                {visibleColumns.includes("githubOrg") && <th style={HEADER_CELL_STYLE}>Organization</th>}
                {visibleColumns.includes("syllabusId") && <th style={HEADER_CELL_STYLE}>Syllabus</th>}
                {visibleColumns.includes("textbook") && <th style={HEADER_CELL_STYLE}>Textbook</th>}
                {visibleColumns.includes("rosterCount") && <th style={HEADER_CELL_STYLE}>Roster</th>}
                {visibleColumns.includes("studentRepoCount") && <th style={HEADER_CELL_STYLE}>Student repos</th>}
                {visibleColumns.includes("reposCount") && <th style={HEADER_CELL_STYLE}>Repos</th>}
                <th style={HEADER_CELL_STYLE}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <CourseRow
                  key={c.id}
                  course={c}
                  visibleColumns={visibleColumns}
                  syllabi={syllabi}
                  ownedRepos={ownedRepos}
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
                  deleteBusy={deleteBusyId === c.id}
                  onPreviewCsv={onPreviewCsv}
                  onPreviewRubric={onPreviewRubric}
                  onPreviewSyllabus={onPreviewSyllabus}
                  onDownloadSyllabus={onDownloadSyllabus}
                  previewSyllabusBusy={previewSyllabusId === c.id}
                  downloadSyllabusBusy={downloadSyllabusId === c.id}
                  onSyllabusUploaded={onSyllabusUploaded}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
