"use client";

// Phase 2 of the tiles -> table redesign: one row per course. Sticky header,
// sticky (frozen) name column, every column sortable (name plus every
// optional column - the former row-expansion cards are columns too), a
// column-visibility dropdown, and per-row inline editing (CourseRow).
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
  COLUMN_MIN_WIDTHS,
  DEFAULT_SORT,
  parseColumnSet,
  parseSortState,
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
  repos: "Codebases",
  roster: "Roster",
  studentRepos: "Student repos",
  integrations: "Integrations",
  description: "Description",
  scheduleCsv: "Schedule of Topics",
  rubric: "Rubric",
  materials: "Materials",
  lmsExports: "LMS Exports",
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

  const sortCtx: SortContext = { syllabusNameById: new Map(syllabi.map((s) => [s.id, s.name])) };
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
        <div className={tableStyles.scroller}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th onClick={() => applySort("name")} style={{ cursor: "pointer", minWidth: COLUMN_MIN_WIDTHS.name }}>
                  Name{sortIndicator("name")}
                </th>
                {ALL_COLUMN_IDS.filter((id) => visibleColumns.includes(id)).map((id) => (
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
