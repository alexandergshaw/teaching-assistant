"use client";

// One table row per course: sticky-name cell, scalar inline-edit cells for
// the visible columns, the former row-expansion cards as cells (Codebases,
// Roster, Student repos, Integrations, Description, Schedule of Topics,
// Rubric, Materials, LMS Exports), and an actions cell (course planning /
// version control / workflows via onNavigate, delete with confirm). Row
// expansion is gone - every card's behavior now lives in its column's cell.
import type { Course, CourseInput } from "@/lib/supabase/courses";
import type { FinalizedSyllabusMeta } from "@/lib/supabase/course-syllabi";
import { COLUMN_MIN_WIDTHS, truncateForCell, type ColumnId, type TableEditableField } from "@/lib/courses-table-helpers";
import { integrationsToText } from "@/lib/courses-tab-helpers";
import type { UseCourseImportActionsReturn } from "./useCourseImportActions";
import EditableCell from "./EditableCell";
import LmsCell from "./LmsCell";
import SyllabusCell from "./SyllabusCell";
import RepoCell from "./RepoCell";
import { RosterCell, StudentReposCell } from "./RosterCell";
import { ScheduleCsvCell, RubricCell } from "./ScheduleCell";
import { MaterialsCell, LmsExportsCell } from "./FilesCell";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";

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
  const has = (id: ColumnId) => visibleColumns.includes(id);

  const save = (field: TableEditableField) => (rawValue: string) => saveField(course, field, rawValue).then((result) => result !== null);

  const busy = (field: string) => imports.busyKey === `${course.id}:${field}`;
  const lms = imports.canLms(course);
  const importable = imports.canImport(course);

  return (
    <tr>
      <td className={tableStyles.stickyName} style={{ minWidth: COLUMN_MIN_WIDTHS.name }}>
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
      </td>

      {has("institution") && <EditableCell kind="text" rawValue={course.institution ?? ""} onSave={save("institution")} />}
      {has("modality") && (
        <EditableCell
          kind="select"
          rawValue={course.modality ?? ""}
          options={[
            { value: "", label: "Not set" },
            { value: "async", label: "Asynchronous" },
            { value: "sync", label: "Synchronous" },
          ]}
          display={
            course.modality === "async" ? (
              <span className={styles.courseResourceValue}>Asynchronous</span>
            ) : course.modality === "sync" ? (
              <span className={styles.courseResourceValue}>Synchronous</span>
            ) : undefined
          }
          onSave={save("modality")}
        />
      )}
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
          canLms={lms}
          canImport={importable}
          busy={busy("syllabus")}
          onFromLms={imports.handleLmsSyllabus}
          onFromImport={imports.handleImportSyllabus}
          onUploaded={(syllabusId) => onSyllabusUploaded(course, syllabusId)}
        />
      )}
      {has("textbook") && (
        <EditableCell kind="multiline" rawValue={course.textbook ?? ""} placeholder="Title, author, edition, ISBN…" onSave={save("textbook")} />
      )}

      {has("repos") && <RepoCell course={course} ownedRepos={ownedRepos} onSave={save("repos")} />}

      {has("roster") && (
        <RosterCell course={course} onSave={save("roster")} canLms={lms} lmsBusy={busy("roster")} fetchLmsRosterDraft={imports.fetchLmsRosterDraft} />
      )}

      {has("studentRepos") && <StudentReposCell course={course} onSave={save("studentRepos")} />}

      {has("integrations") && (
        <EditableCell
          kind="multiline"
          rawValue={integrationsToText(course)}
          display={
            course.integrations.length > 0 ? (
              <span className={styles.courseResourceValue}>
                {course.integrations.length} integration{course.integrations.length !== 1 ? "s" : ""} - {truncateForCell(course.integrations[0].name, 30)}
              </span>
            ) : undefined
          }
          emptyLabel="None"
          placeholder="Cengage | https://..."
          hint="One per line: Name | link (link optional)."
          onSave={save("integrations")}
        />
      )}

      {has("description") && (
        <EditableCell
          kind="multiline"
          rawValue={course.description ?? ""}
          display={course.description ? <span className={styles.courseResourceValue}>{truncateForCell(course.description, 80)}</span> : undefined}
          emptyLabel="Not set"
          onSave={save("description")}
        />
      )}

      {has("scheduleCsv") && (
        <ScheduleCsvCell
          course={course}
          onCourseUpdated={onCourseUpdated}
          setError={setError}
          onPreviewCsv={onPreviewCsv}
          canLms={lms}
          canImport={importable}
          csvBusy={busy("csv")}
          onCsvFromLms={imports.handleLmsCsv}
          onCsvFromImport={imports.handleImportCsv}
        />
      )}

      {has("rubric") && (
        <RubricCell
          course={course}
          onCourseUpdated={onCourseUpdated}
          setError={setError}
          onPreviewRubric={onPreviewRubric}
          canLms={lms}
          canImport={importable}
          rubricBusy={busy("rubric")}
          onRubricFromLms={imports.handleLmsRubric}
          onRubricFromImport={imports.handleImportRubric}
        />
      )}

      {has("materials") && <MaterialsCell course={course} onCourseUpdated={onCourseUpdated} setError={setError} />}

      {has("lmsExports") && (
        <LmsExportsCell
          course={course}
          onCourseUpdated={onCourseUpdated}
          setError={setError}
          canLms={lms}
          exportBusy={busy("lmsExports")}
          onExportFromLms={imports.handleLmsExport}
        />
      )}

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
  );
}
