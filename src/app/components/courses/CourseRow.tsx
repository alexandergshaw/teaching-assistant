"use client";

// One table row per course: sticky-name cell, scalar inline-edit cells for
// the visible columns, derived read-only count cells, an actions cell
// (course planning / version control / workflows via onNavigate, delete with
// confirm), and a chevron that expands RowDetail below.
import { useState } from "react";
import type { Course, CourseInput } from "@/lib/supabase/courses";
import type { FinalizedSyllabusMeta } from "@/lib/supabase/course-syllabi";
import { deriveCourseCounts, type ColumnId, type TableEditableField } from "@/lib/courses-table-helpers";
import type { UseCourseImportActionsReturn } from "./useCourseImportActions";
import EditableCell from "./EditableCell";
import LmsCell from "./LmsCell";
import SyllabusCell from "./SyllabusCell";
import RowDetail from "./RowDetail";
import styles from "../../page.module.css";

export interface CourseRowProps {
  course: Course;
  visibleColumns: ColumnId[];
  syllabi: FinalizedSyllabusMeta[];
  ownedRepos: string[] | null;
  notifTotal: number;
  saveField: (course: Course, field: TableEditableField, rawValue: string, extra?: Partial<CourseInput>) => Promise<Course | null>;
  onCourseUpdated: (course: Course) => void;
  setError: (message: string | null) => void;
  imports: UseCourseImportActionsReturn;
  onNavigate: (tab: "course-planning" | "version-control" | "workflows", course: Course) => void;
  onEdit: (course: Course) => void;
  onDelete: (course: Course) => void;
  deleteBusy: boolean;
  onPreviewCsv: (name: string, csv: string) => void;
  onPreviewRubric: (name: string, rubric: string) => void;
  onPreviewSyllabus: (course: Course) => void;
  onDownloadSyllabus: (course: Course) => void;
  previewSyllabusBusy: boolean;
  downloadSyllabusBusy: boolean;
  onSyllabusUploaded: (course: Course, syllabusId: string) => void;
}

const NAME_CELL_STYLE: React.CSSProperties = {
  position: "sticky",
  left: 0,
  background: "var(--card-background)",
  zIndex: 1,
  minWidth: 220,
};

export default function CourseRow({
  course,
  visibleColumns,
  syllabi,
  ownedRepos,
  notifTotal,
  saveField,
  onCourseUpdated,
  setError,
  imports,
  onNavigate,
  onEdit,
  onDelete,
  deleteBusy,
  onPreviewCsv,
  onPreviewRubric,
  onPreviewSyllabus,
  onDownloadSyllabus,
  previewSyllabusBusy,
  downloadSyllabusBusy,
  onSyllabusUploaded,
}: CourseRowProps) {
  const [expanded, setExpanded] = useState(false);
  const counts = deriveCourseCounts(course);
  const has = (id: ColumnId) => visibleColumns.includes(id);

  const save = (field: TableEditableField) => (rawValue: string) => saveField(course, field, rawValue).then((result) => result !== null);

  return (
    <>
      <tr>
        <td style={NAME_CELL_STYLE}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              className={styles.linkButton}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse row" : "Expand row"}
              onClick={() => setExpanded((v) => !v)}
              style={{ fontSize: "0.9em", minWidth: 16 }}
            >
              {expanded ? "▾" : "▸"}
            </button>
            <div style={{ minWidth: 0, flex: 1 }}>
              <EditableCell
                kind="text"
                rawValue={course.name}
                display={
                  <span className={styles.courseResourceValue} style={{ fontWeight: 600 }}>
                    {course.name}
                    {notifTotal > 0 && <span className={styles.navBadge} style={{ marginLeft: 8 }} title="Outstanding LMS notifications">{notifTotal}</span>}
                  </span>
                }
                onSave={save("name")}
              />
            </div>
          </div>
        </td>

        {has("institution") && <EditableCell kind="text" rawValue={course.institution ?? ""} onSave={save("institution")} />}
        {has("startDate") && (
          <EditableCell
            kind="date"
            rawValue={course.startDate ?? ""}
            display={course.startDate ? <span className={styles.courseResourceValue}>{new Date(`${course.startDate}T00:00:00`).toLocaleDateString()}</span> : undefined}
            onSave={save("startDate")}
          />
        )}
        {has("dayTime") && <EditableCell kind="text" rawValue={course.dayTime ?? ""} placeholder="MW 10:00-11:15" onSave={save("dayTime")} />}
        {has("weeks") && <EditableCell kind="number" rawValue={course.weeks !== null ? String(course.weeks) : ""} onSave={save("weeks")} />}
        {has("tests") && <EditableCell kind="number" rawValue={course.tests !== null ? String(course.tests) : ""} onSave={save("tests")} />}
        {has("lms") && <LmsCell course={course} onSave={(v, extra) => saveField(course, "lms", v, extra).then((result) => result !== null)} />}
        {has("githubOrg") && (
          <EditableCell
            kind="text"
            rawValue={course.githubOrg ?? ""}
            placeholder="e.g. my-university-org"
            display={course.githubOrg ? (
              <a className={styles.courseResourceValue} href={`https://github.com/${course.githubOrg}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                {course.githubOrg}
              </a>
            ) : undefined}
            onSave={save("githubOrg")}
          />
        )}
        {has("syllabusId") && (
          <SyllabusCell
            course={course}
            syllabi={syllabi}
            onSave={save("syllabusId")}
            onPreview={onPreviewSyllabus}
            onDownload={onDownloadSyllabus}
            previewBusy={previewSyllabusBusy}
            downloadBusy={downloadSyllabusBusy}
            canLms={imports.canLms(course)}
            canImport={imports.canImport(course)}
            busy={imports.busyKey === `${course.id}:syllabus`}
            onFromLms={imports.handleLmsSyllabus}
            onFromImport={imports.handleImportSyllabus}
            onUploaded={(syllabusId) => onSyllabusUploaded(course, syllabusId)}
          />
        )}
        {has("textbook") && (
          <EditableCell kind="multiline" rawValue={course.textbook ?? ""} placeholder="Title, author, edition, ISBN…" onSave={save("textbook")} />
        )}
        {has("rosterCount") && <td>{counts.rosterCount}</td>}
        {has("studentRepoCount") && <td>{counts.studentRepoCount}</td>}
        {has("reposCount") && <td>{counts.reposCount}</td>}

        <td>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" className={styles.linkButton} onClick={() => onNavigate("course-planning", course)}>
              Syllabus builder
            </button>
            <button type="button" className={styles.linkButton} onClick={() => onNavigate("version-control", course)}>
              Version control
            </button>
            <button type="button" className={styles.linkButton} onClick={() => onNavigate("workflows", course)}>
              Workflows
            </button>
            <button type="button" className={styles.linkButton} onClick={() => onEdit(course)}>
              Edit
            </button>
            <button
              type="button"
              className={styles.linkButton}
              style={{ color: "var(--danger)" }}
              disabled={deleteBusy}
              onClick={() => onDelete(course)}
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={visibleColumns.length + 2} style={{ background: "var(--surface-subtle, var(--card-background))" }}>
            <RowDetail
              course={course}
              ownedRepos={ownedRepos}
              syllabi={syllabi}
              saveField={saveField}
              onCourseUpdated={onCourseUpdated}
              setError={setError}
              onPreviewCsv={onPreviewCsv}
              onPreviewRubric={onPreviewRubric}
              imports={imports}
            />
          </td>
        </tr>
      )}
    </>
  );
}
