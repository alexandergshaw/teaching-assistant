"use client";

import { Fragment, type ReactNode, type RefObject } from "react";

// One table row per course: sticky-name cell, scalar inline-edit cells for
// the visible columns, the former row-expansion cards as cells (Codebases,
// Roster, Student repos, Integrations, Description, Schedule of Topics,
// Rubric, Materials, LMS Exports), and an actions cell (course planning /
// version control / workflows via onNavigate, delete with confirm). Row
// expansion is gone - every card's behavior now lives in its column's cell.
import type { Course, CourseInput } from "@/lib/supabase/courses";
import type { FinalizedSyllabusMeta } from "@/lib/supabase/course-syllabi";
import type { SyllabusTemplateMeta } from "@/lib/supabase/syllabus-templates";
import { COLUMN_MIN_WIDTHS, truncateForCell, type ColumnId, type TableEditableField } from "@/lib/courses-table-helpers";
import { courseCalendarBlockers, type CourseCalendarBlocker } from "@/lib/course-calendar-events";
import { integrationsToText } from "@/lib/courses-tab-helpers";
import { COURSE_KINDS } from "@/lib/course-kind";
import type { UseCourseImportActionsReturn } from "./useCourseImportActions";
import EditableCell from "./EditableCell";
import LmsCell from "./LmsCell";
import SyllabusCell from "./SyllabusCell";
import SyllabusTemplateCell from "./SyllabusTemplateCell";
import AssignmentDueCell from "./AssignmentDueCell";
import GradesDueCell from "./GradesDueCell";
import BreaksCell from "./BreaksCell";
import RepoCell from "./RepoCell";
import { RosterCell, StudentReposCell } from "./RosterCell";
import { ScheduleCsvCell, RubricCell } from "./ScheduleCell";
import { MaterialsCell, LmsExportsCell } from "./FilesCell";
import { CastletopCell } from "./CastletopCell";
import { MiscFilesCell } from "./MiscFilesCell";
import { ProjectCell } from "./ProjectCell";
import { WeeklyChecklistCell } from "./WeeklyChecklistCell";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";

// AC9's two blocking conditions, worded short enough for a badge next to the
// course name (the full-sentence versions live in WeeklyChecklistCell.tsx,
// where there is room and the audience is specifically "checklist
// deadlines" rather than "this course's calendar events" in general).
const CALENDAR_BLOCKER_BADGE_TEXT: Record<CourseCalendarBlocker, string> = {
  "missing-dates": "Calendar: add a start and end date to sync this course",
  "not-connected": "Calendar: connect Google Calendar to sync this course",
};

export interface CourseRowProps {
  course: Course;
  /** Tints this row briefly on arrival from the in-session banner. */
  highlighted?: boolean;
  /** Set only on the highlighted row, so CoursesTable can scroll to it. */
  rowRef?: RefObject<HTMLTableRowElement | null>;
  visibleColumns: ColumnId[];
  syllabi: FinalizedSyllabusMeta[];
  syllabusTemplates: SyllabusTemplateMeta[];
  ownedRepos: string[] | null;
  /** null while the page's one-time connection check is still in flight. */
  googleCalendarConnected: boolean | null;
  notifTotal: number;
  saveField: (course: Course, field: TableEditableField, rawValue: string, extra?: Partial<CourseInput>) => Promise<Course | null>;
  onCourseUpdated: (course: Course) => void;
  setError: (message: string | null) => void;
  imports: UseCourseImportActionsReturn;
  onNavigate: (tab: "course-planning" | "version-control" | "workflows", course: Course) => void;
  onEdit: (course: Course) => void;
  onDelete: (course: Course) => void;
  onAskAi: (course: Course) => void;
  onPreviewProject: (course: Course, name: string, text: string) => void;
  deleteBusy: boolean;
  onPreviewCsv: (course: Course, name: string, csv: string) => void;
  onPreviewRubric: (course: Course, name: string, rubric: string) => void;
  onPreviewSyllabus: (course: Course) => void;
  onDownloadSyllabus: (course: Course) => void;
  previewSyllabusBusy: boolean;
  downloadSyllabusBusy: boolean;
  onSyllabusUploaded: (course: Course, syllabusId: string) => void;
  onSyllabusTemplateCreated: (template: SyllabusTemplateMeta) => void;
}

export default function CourseRow({
  course,
  highlighted = false,
  rowRef,
  visibleColumns,
  syllabi,
  syllabusTemplates,
  ownedRepos,
  googleCalendarConnected,
  notifTotal,
  saveField,
  onCourseUpdated,
  setError,
  imports,
  onNavigate,
  onEdit,
  onDelete,
  onAskAi,
  onPreviewProject,
  deleteBusy,
  onPreviewCsv,
  onPreviewRubric,
  onPreviewSyllabus,
  onDownloadSyllabus,
  previewSyllabusBusy,
  downloadSyllabusBusy,
  onSyllabusUploaded,
  onSyllabusTemplateCreated,
}: CourseRowProps) {
  const save = (field: TableEditableField) => (rawValue: string) => saveField(course, field, rawValue).then((result) => result !== null);

  const busy = (field: string) => imports.busyKey === `${course.id}:${field}`;
  const lms = imports.canLms(course);
  const importable = imports.canImport(course);

  // Every cell keyed by its column id, so the row renders in whatever order
  // the user arranged - the header renders from the same ordered list, so the
  // two can never drift apart the way a hardcoded JSX order could.
  const cells: Record<ColumnId, ReactNode> = {
    institution: <EditableCell kind="text" rawValue={course.institution ?? ""} onSave={save("institution")} />,
    modality: (
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
    ),
    startDate: (
  <EditableCell
            kind="date"
            rawValue={course.startDate ?? ""}
            display={course.startDate ? <span className={styles.courseResourceValue}>{new Date(`${course.startDate}T00:00:00`).toLocaleDateString()}</span> : undefined}
            onSave={save("startDate")}
          />
    ),
    dayTime: <EditableCell kind="text" rawValue={course.dayTime ?? ""} placeholder="MW 10:00-11:15" onSave={save("dayTime")} />,
    weeks: <EditableCell kind="number" rawValue={course.weeks !== null ? String(course.weeks) : ""} onSave={save("weeks")} />,
    tests: <EditableCell kind="number" rawValue={course.tests !== null ? String(course.tests) : ""} onSave={save("tests")} />,
    lms: <LmsCell course={course} onSave={(v, extra) => saveField(course, "lms", v, extra).then((result) => result !== null)} />,
    githubOrg: (
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
    ),
    syllabusId: (
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
    ),
    textbook: <EditableCell kind="multiline" rawValue={course.textbook ?? ""} placeholder="Title, author, edition, ISBN…" onSave={save("textbook")} />,
    repos: <RepoCell course={course} ownedRepos={ownedRepos} onSave={save("repos")} />,
    roster: <RosterCell course={course} onSave={save("roster")} canLms={lms} lmsBusy={busy("roster")} fetchLmsRosterDraft={imports.fetchLmsRosterDraft} />,
    studentRepos: <StudentReposCell course={course} onSave={save("studentRepos")} />,
    integrations: (
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
    ),
    description: (
  <EditableCell
            kind="multiline"
            rawValue={course.description ?? ""}
            display={course.description ? <span className={styles.courseResourceValue}>{truncateForCell(course.description, 80)}</span> : undefined}
            emptyLabel="Not set"
            onSave={save("description")}
          />
    ),
    // F3: the tile's own authoritative course kind - "Not set" (null) means
    // Course Build falls back to deriving it from the run's own schedule
    // source, exactly like every course tile before this column existed.
    // Options reuse COURSE_KINDS (@/lib/course-kind) rather than restating
    // its two labels here, so this select can never drift out of sync with
    // the vocabulary Course Build/Refresh/Kickoff actually resolve against.
    courseKind: (
  <EditableCell
            kind="select"
            rawValue={course.courseKind ?? ""}
            options={[
              { value: "", label: "Not set - derived from source" },
              ...COURSE_KINDS.map((k) => ({ value: k.value, label: k.label })),
            ]}
            display={
              course.courseKind ? (
                <span className={styles.courseResourceValue}>
                  {COURSE_KINDS.find((k) => k.value === course.courseKind)?.label ?? course.courseKind}
                </span>
              ) : undefined
            }
            onSave={save("courseKind")}
          />
    ),
    scheduleCsv: (
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
    ),
    rubric: (
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
    ),
    materials: <MaterialsCell course={course} onCourseUpdated={onCourseUpdated} setError={setError} />,
    lmsExports: (
  <LmsExportsCell
            course={course}
            onCourseUpdated={onCourseUpdated}
            setError={setError}
            canLms={lms}
            exportBusy={busy("lmsExports")}
            onExportFromLms={imports.handleLmsExport}
          />
    ),
    topicOutline: (
  <EditableCell
            kind="multiline"
            rawValue={course.topicOutline ?? ""}
            display={course.topicOutline ? <span className={styles.courseResourceValue}>{truncateForCell(course.topicOutline, 80)}</span> : undefined}
            placeholder="Paste topic outline from Cengage, uCertify, etc."
            emptyLabel="Not set"
            onSave={save("topicOutline")}
          />
    ),
    castletop: <CastletopCell course={course} onCourseUpdated={onCourseUpdated} />,
    syllabusTemplate: (
  <SyllabusTemplateCell
            course={course}
            templates={syllabusTemplates}
            onSave={save("syllabusTemplateId")}
            onTemplateCreated={onSyllabusTemplateCreated}
          />
    ),
    endDate: (
  <EditableCell
            kind="date"
            rawValue={course.endDate ?? ""}
            display={course.endDate ? <span className={styles.courseResourceValue}>{new Date(`${course.endDate}T00:00:00`).toLocaleDateString()}</span> : undefined}
            onSave={save("endDate")}
          />
    ),
    gradesDue: (
      <GradesDueCell
        course={course}
        onSave={(v, extra) => saveField(course, "gradesDueDate", v, extra).then((result) => result !== null)}
      />
    ),
    breaks: <BreaksCell course={course} onSave={save("breaks")} />,
    assignmentDue: <AssignmentDueCell course={course} onSave={save("assignmentDueRule")} />,
    email: <EditableCell kind="text" rawValue={course.email ?? ""} placeholder="instructor@school.edu" onSave={save("email")} />,
    emailClient: (
  <EditableCell
            kind="select"
            rawValue={course.emailClient ?? ""}
            options={[
              { value: "", label: "Not set" },
              { value: "outlook", label: "Outlook" },
              { value: "gmail", label: "Gmail" },
              { value: "other", label: "Other" },
            ]}
            display={
              course.emailClient === "outlook" ? (
                <span className={styles.courseResourceValue}>Outlook</span>
              ) : course.emailClient === "gmail" ? (
                <span className={styles.courseResourceValue}>Gmail</span>
              ) : course.emailClient === "other" ? (
                <span className={styles.courseResourceValue}>Other</span>
              ) : undefined
            }
            onSave={save("emailClient")}
          />
    ),
    classLength: (
  <EditableCell
            kind="number"
            rawValue={course.classLengthMinutes !== null ? String(course.classLengthMinutes) : ""}
            display={
              course.classLengthMinutes !== null ? (
                <span className={styles.courseResourceValue}>{course.classLengthMinutes} min</span>
              ) : undefined
            }
            placeholder="75"
            onSave={save("classLengthMinutes")}
          />
    ),
    miscFiles: <MiscFilesCell course={course} onCourseUpdated={onCourseUpdated} setError={setError} />,
    courseProject: (
      <ProjectCell
        course={course}
        onCourseUpdated={onCourseUpdated}
        setError={setError}
        onPreview={onPreviewProject}
      />
    ),
    weeklyChecklist: (
      <WeeklyChecklistCell
        course={course}
        onCourseUpdated={onCourseUpdated}
        setError={setError}
        googleCalendarConnected={googleCalendarConnected}
      />
    ),
  };

  // AC9: the same two conditions that block a checklist item's calendar
  // events (missing term dates, Google not connected) also block the plain
  // term event every course gets - and that event does not depend on the
  // checklist at all, so this notice must not be checklist-specific. Shown
  // next to the course name (always visible, unlike the toggleable columns)
  // so it is diagnosable from the table regardless of which optional
  // columns are on.
  const calendarBlockers = courseCalendarBlockers(course, googleCalendarConnected);

  return (
    <tr ref={rowRef} className={highlighted ? tableStyles.rowHighlighted : undefined}>
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
        {calendarBlockers.length > 0 && (
          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
            {calendarBlockers.map((blocker) => (
              <span key={blocker} className={`${styles.ghBadge} ${styles.ghBadgeWarning}`} style={{ display: "inline-block" }}>
                {CALENDAR_BLOCKER_BADGE_TEXT[blocker]}
              </span>
            ))}
          </div>
        )}
      </td>

      {visibleColumns.map((id) => (
        <Fragment key={id}>{cells[id]}</Fragment>
      ))}

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
          <button type="button" className={styles.linkButton} onClick={() => onAskAi(course)}>
            Ask AI
          </button>
        </div>
      </td>
    </tr>
  );
}
