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
import { cellCopyPlan, type CellColumnId } from "@/lib/cell-copy";
import {
  CELL_COLUMN_LABELS,
  MODALITY_OPTIONS,
  EMAIL_CLIENT_OPTIONS,
  modalityLabel,
  emailClientLabel,
} from "@/lib/courses-table-labels";
import type { UseCourseImportActionsReturn } from "./useCourseImportActions";
import CellMenu, { type CellMenuItem } from "./CellMenu";
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
  /** F3/AC26: courses currently in view (CoursesTable's already-filtered
   * `courses` prop) minus this row's own course - the copy menu item is
   * disabled with an explanatory reason when this is 0. */
  otherCoursesInView: number;
  /** F3: opens CoursesTable's copy-to-other-cells confirmation for this
   * course/column. Only ever called for a column cellCopyPlan reports
   * copyable, with at least one other course in view. */
  onCopyCellToVisible: (course: Course, column: CellColumnId) => void;
  /** F1: opens the "Recommend textbooks" modal for this course. */
  onRecommendTextbooks: (course: Course) => void;
  /** F2: opens the "Extract from photo" modal for this course. */
  onExtractTextbookPhoto: (course: Course) => void;
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
  otherCoursesInView,
  onCopyCellToVisible,
  onRecommendTextbooks,
  onExtractTextbookPhoto,
}: CourseRowProps) {
  const save = (field: TableEditableField) => (rawValue: string) => saveField(course, field, rawValue).then((result) => result !== null);

  const busy = (field: string) => imports.busyKey === `${course.id}:${field}`;
  const lms = imports.canLms(course);
  const importable = imports.canImport(course);

  // F3/AC24-AC26: one "Copy information to other cells" menu item per
  // column, built from cellCopyPlan's own classification - disabled (with
  // its refusal reason) for a not-copyable column, and disabled with a
  // "no other courses" reason when there is nothing to copy to. The Name
  // column still gets a full menu (per the wiring instructions, it is never
  // special-cased out) - cellCopyPlan("name") is itself not-copyable
  // (CORRECTION 1), so it naturally lands in the first disabled branch with
  // its own reason.
  const copyItem = (column: CellColumnId): CellMenuItem => {
    const plan = cellCopyPlan(course, column);
    if (!plan.copyable) {
      return {
        key: "copy",
        label: "Copy information to other cells",
        disabled: true,
        disabledReason: plan.reason,
        onSelect: () => {},
      };
    }
    if (otherCoursesInView === 0) {
      return {
        key: "copy",
        label: "Copy information to other cells",
        disabled: true,
        disabledReason: "No other courses are in view.",
        onSelect: () => {},
      };
    }
    return {
      key: "copy",
      label: "Copy information to other cells",
      onSelect: () => onCopyCellToVisible(course, column),
    };
  };

  // B1: without `context`, every row's menu trigger announces the same
  // "Actions for <Column>" - N identical names in the AT control list. The
  // course name disambiguates them ("Actions for Institution, CS 101").
  const cellMenuFor = (column: CellColumnId) => (
    <CellMenu label={CELL_COLUMN_LABELS[column]} items={[copyItem(column)]} context={course.name} />
  );

  // Every cell keyed by its column id, so the row renders in whatever order
  // the user arranged - the header renders from the same ordered list, so the
  // two can never drift apart the way a hardcoded JSX order could.
  const cells: Record<ColumnId, ReactNode> = {
    institution: <EditableCell kind="text" rawValue={course.institution ?? ""} onSave={save("institution")} menu={cellMenuFor("institution")} />,
    // D9: the option list and the displayed label both read from
    // courses-table-labels.ts (MODALITY_OPTIONS/modalityLabel) instead of
    // restating them inline, so this cell and the copy/read layer
    // (src/lib/cell-copy.ts) can never drift apart. modalityLabel resolves
    // "" to "" (never the select's own "Not set" placeholder text), so the
    // ternary below renders identically to the previous hand-written one.
    modality: (
  <EditableCell
            kind="select"
            rawValue={course.modality ?? ""}
            options={[...MODALITY_OPTIONS]}
            display={
              modalityLabel(course.modality) ? (
                <span className={styles.courseResourceValue}>{modalityLabel(course.modality)}</span>
              ) : undefined
            }
            onSave={save("modality")}
            menu={cellMenuFor("modality")}
          />
    ),
    startDate: (
  <EditableCell
            kind="date"
            rawValue={course.startDate ?? ""}
            display={course.startDate ? <span className={styles.courseResourceValue}>{new Date(`${course.startDate}T00:00:00`).toLocaleDateString()}</span> : undefined}
            onSave={save("startDate")}
            menu={cellMenuFor("startDate")}
          />
    ),
    dayTime: <EditableCell kind="text" rawValue={course.dayTime ?? ""} placeholder="MW 10:00-11:15" onSave={save("dayTime")} menu={cellMenuFor("dayTime")} />,
    weeks: <EditableCell kind="number" rawValue={course.weeks !== null ? String(course.weeks) : ""} onSave={save("weeks")} menu={cellMenuFor("weeks")} />,
    tests: <EditableCell kind="number" rawValue={course.tests !== null ? String(course.tests) : ""} onSave={save("tests")} menu={cellMenuFor("tests")} />,
    lms: (
      <LmsCell
        course={course}
        onSave={(v, extra) => saveField(course, "lms", v, extra).then((result) => result !== null)}
        menu={cellMenuFor("lms")}
      />
    ),
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
            menu={cellMenuFor("githubOrg")}
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
            menu={cellMenuFor("syllabusId")}
          />
    ),
    textbook: (
      <EditableCell
        kind="multiline"
        rawValue={course.textbook ?? ""}
        placeholder="Title, author, edition, ISBN…"
        onSave={save("textbook")}
        actions={
          <button
            type="button"
            className={styles.linkButton}
            aria-label={`Extract from photo for ${course.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onExtractTextbookPhoto(course);
            }}
          >
            Extract from photo
          </button>
        }
        menu={cellMenuFor("textbook")}
      />
    ),
    repos: <RepoCell course={course} ownedRepos={ownedRepos} onSave={save("repos")} menu={cellMenuFor("repos")} />,
    roster: (
      <RosterCell
        course={course}
        onSave={save("roster")}
        canLms={lms}
        lmsBusy={busy("roster")}
        fetchLmsRosterDraft={imports.fetchLmsRosterDraft}
        menu={cellMenuFor("roster")}
      />
    ),
    studentRepos: <StudentReposCell course={course} onSave={save("studentRepos")} menu={cellMenuFor("studentRepos")} />,
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
            menu={cellMenuFor("integrations")}
          />
    ),
    description: (
  <EditableCell
            kind="multiline"
            rawValue={course.description ?? ""}
            display={course.description ? <span className={styles.courseResourceValue}>{truncateForCell(course.description, 80)}</span> : undefined}
            emptyLabel="Not set"
            onSave={save("description")}
            actions={
              <button
                type="button"
                className={styles.linkButton}
                aria-label={`Recommend textbooks for ${course.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRecommendTextbooks(course);
                }}
              >
                Recommend textbooks
              </button>
            }
            menu={cellMenuFor("description")}
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
            menu={cellMenuFor("courseKind")}
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
            menu={cellMenuFor("scheduleCsv")}
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
            menu={cellMenuFor("rubric")}
          />
    ),
    materials: <MaterialsCell course={course} onCourseUpdated={onCourseUpdated} setError={setError} menu={cellMenuFor("materials")} />,
    lmsExports: (
  <LmsExportsCell
            course={course}
            onCourseUpdated={onCourseUpdated}
            setError={setError}
            canLms={lms}
            exportBusy={busy("lmsExports")}
            onExportFromLms={imports.handleLmsExport}
            menu={cellMenuFor("lmsExports")}
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
            menu={cellMenuFor("topicOutline")}
          />
    ),
    castletop: <CastletopCell course={course} onCourseUpdated={onCourseUpdated} menu={cellMenuFor("castletop")} />,
    syllabusTemplate: (
  <SyllabusTemplateCell
            course={course}
            templates={syllabusTemplates}
            onSave={save("syllabusTemplateId")}
            onTemplateCreated={onSyllabusTemplateCreated}
            menu={cellMenuFor("syllabusTemplate")}
          />
    ),
    endDate: (
  <EditableCell
            kind="date"
            rawValue={course.endDate ?? ""}
            display={course.endDate ? <span className={styles.courseResourceValue}>{new Date(`${course.endDate}T00:00:00`).toLocaleDateString()}</span> : undefined}
            onSave={save("endDate")}
            menu={cellMenuFor("endDate")}
          />
    ),
    gradesDue: (
      <GradesDueCell
        course={course}
        onSave={(v, extra) => saveField(course, "gradesDueDate", v, extra).then((result) => result !== null)}
        menu={cellMenuFor("gradesDue")}
      />
    ),
    breaks: <BreaksCell course={course} onSave={save("breaks")} menu={cellMenuFor("breaks")} />,
    assignmentDue: <AssignmentDueCell course={course} onSave={save("assignmentDueRule")} menu={cellMenuFor("assignmentDue")} />,
    email: <EditableCell kind="text" rawValue={course.email ?? ""} placeholder="instructor@school.edu" onSave={save("email")} menu={cellMenuFor("email")} />,
    // C: the instructor's own profile, rendered verbatim (no LLM) into the
    // "About Your Instructor" guide document (generate-course-guides,
    // steps.course-guides.ts) - see Course.instructorBio's own comment for
    // why a bio is never generated from a bare name. instructorBio is the
    // only one of the four that gates the document; the other three are
    // optional detail shown alongside it when present.
    instructorTitle: (
      <EditableCell
        kind="text"
        rawValue={course.instructorTitle ?? ""}
        placeholder="Associate Professor of Computer Science"
        onSave={save("instructorTitle")}
        menu={cellMenuFor("instructorTitle")}
      />
    ),
    instructorDepartment: (
      <EditableCell
        kind="text"
        rawValue={course.instructorDepartment ?? ""}
        placeholder="Department of Computer Science"
        onSave={save("instructorDepartment")}
        menu={cellMenuFor("instructorDepartment")}
      />
    ),
    instructorCredentials: (
      <EditableCell
        kind="text"
        rawValue={course.instructorCredentials ?? ""}
        placeholder="Ph.D. in Computer Science, MIT"
        onSave={save("instructorCredentials")}
        menu={cellMenuFor("instructorCredentials")}
      />
    ),
    instructorBio: (
      <EditableCell
        kind="multiline"
        rawValue={course.instructorBio ?? ""}
        display={course.instructorBio ? <span className={styles.courseResourceValue}>{truncateForCell(course.instructorBio, 80)}</span> : undefined}
        placeholder="A short bio for students - background, interests, teaching philosophy…"
        emptyLabel="Not set - no About Your Instructor document generated"
        onSave={save("instructorBio")}
        menu={cellMenuFor("instructorBio")}
      />
    ),
    // D9: same MODALITY_OPTIONS/modalityLabel treatment as the modality cell
    // above, via EMAIL_CLIENT_OPTIONS/emailClientLabel - identical rendered
    // output to the previous hand-written ternary.
    emailClient: (
  <EditableCell
            kind="select"
            rawValue={course.emailClient ?? ""}
            options={[...EMAIL_CLIENT_OPTIONS]}
            display={
              emailClientLabel(course.emailClient) ? (
                <span className={styles.courseResourceValue}>{emailClientLabel(course.emailClient)}</span>
              ) : undefined
            }
            onSave={save("emailClient")}
            menu={cellMenuFor("emailClient")}
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
            menu={cellMenuFor("classLength")}
          />
    ),
    miscFiles: <MiscFilesCell course={course} onCourseUpdated={onCourseUpdated} setError={setError} menu={cellMenuFor("miscFiles")} />,
    courseProject: (
      <ProjectCell
        course={course}
        onCourseUpdated={onCourseUpdated}
        setError={setError}
        onPreview={onPreviewProject}
        menu={cellMenuFor("courseProject")}
      />
    ),
    weeklyChecklist: (
      <WeeklyChecklistCell
        course={course}
        onCourseUpdated={onCourseUpdated}
        setError={setError}
        googleCalendarConnected={googleCalendarConnected}
        menu={cellMenuFor("weeklyChecklist")}
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
          menu={cellMenuFor("name")}
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
