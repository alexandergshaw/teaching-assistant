// F3/F4: the ONE pure module that knows what "copy this cell's information"
// and "copy this whole column" mean, per column. Nothing about the copy
// contract lives inline in a component - CellMenu (and, later, CoursesTable's
// own copy/confirm/undo wiring and its header "Copy all") call only the three
// functions exported here.
//
// cellCopyPlan classifies every column exactly once: either a copyable
// PATCH (a Partial<CourseInput> that the existing courseToInput(target) +
// updateCourseHubAction write path can apply verbatim) plus a human summary
// of the value being copied, or an explicit reason it cannot be copied at
// all (the four file-collection columns and the dedicated-writer course
// project - CourseInput has no field for any of them, so a copy would be a
// lie). The switch below is EXHAUSTIVE over CellColumnId with no `default`
// arm that fabricates a patch: a `default: { [column]: value }` arm would
// type-check through a cast, silently write nothing (courseToInput's spread
// drops any key CourseInput does not have), and still report success - see
// cell-copy.test.ts's own "only ever emits patch keys that CourseInput
// actually has" test, which exists specifically to catch that. Instead, the
// default arm below is a `never`-typed compile-time exhaustiveness guard: if
// a column is ever added to ColumnId without a case here, this file fails to
// compile.
//
// cellTextValue is the per-cell FULL TEXT (never truncated) a column's cell
// currently reads as - the raw stored value, except for the exceptions
// listed in D8 of the acceptance-criteria document (selects render their
// label, dates emit ISO, assignmentDue uses its own describer, numbers
// render bare, list/file columns render one entry per line). columnTextForCopy
// stacks that per-cell text over every course currently in view, prefixed by
// course name, for the header's "Copy all" clipboard action (AC38).
//
// Pure - no React, no I/O, no "use client".

import type { Course, CourseInput } from "./supabase/courses";
import { ALL_COLUMN_IDS, truncateForCell, type SortContext } from "./courses-table-helpers";
import { integrationsToText, reposToText, rowsToStudentReposText } from "./courses-tab-helpers";
import { describeAssignmentDueRule } from "./assignment-due-rule";
import { courseLmsLabel } from "./course-lms-options";
import { COURSE_KINDS } from "./course-kind";
import { coerceWeeklyChecklist } from "./weekly-checklist";
import { hasProject, describeProject } from "./course-project";
import { modalityLabel, emailClientLabel } from "./courses-table-labels";
import type { CellColumnId } from "./courses-table-labels";

export type { CellColumnId };

/** Name plus every data column - every cell that can carry a menu (AC22). */
export const CELL_COPY_COLUMN_IDS: readonly CellColumnId[] = ["name", ...ALL_COLUMN_IDS];

export type CellCopyPlan =
  | { copyable: true; patch: Partial<CourseInput>; summary: string }
  | { copyable: false; reason: string };

// ---------------------------------------------------------------------------
// cellTextValue helpers

/** "YYYY-MM-DD HH:MM" when a time is set, "YYYY-MM-DD" otherwise, "" when
 * unset - D8's date rule for the paired grades-due columns. Never
 * toLocaleDateString: locale-dependent output would make the copied block
 * machine-unreadable. */
function gradesDueText(course: Course): string {
  const date = (course.gradesDueDate ?? "").trim();
  if (!date) return "";
  const time = (course.gradesDueTime ?? "").trim();
  return time ? `${date} ${time}` : date;
}

/** File names, one per line - the materials column's own zip (if any) first,
 * then every additional materials file. */
function materialsText(course: Course): string {
  const names: string[] = [];
  if (course.materialsZipName) names.push(course.materialsZipName);
  for (const f of course.materialsFiles) names.push(f.name);
  return names.join("\n");
}

/**
 * The per-cell FULL TEXT (never truncated) for `column`, D8's exact rule.
 * `ctx` resolves syllabusId/syllabusTemplate to their display NAME (the same
 * shape CoursesTable already builds as SortContext); falls back to the raw
 * stored id when no context is supplied, so this never throws for lack of
 * one. Exhaustive switch, same discipline as cellCopyPlan - the default arm
 * is an unreachable `never` guard, never a value-fabricating catch-all.
 */
export function cellTextValue(course: Course, column: CellColumnId, ctx?: SortContext): string {
  switch (column) {
    case "name":
      return course.name;
    case "institution":
      return course.institution ?? "";
    case "modality":
      return modalityLabel(course.modality);
    case "startDate":
      return course.startDate ?? "";
    case "endDate":
      return course.endDate ?? "";
    case "gradesDue":
      return gradesDueText(course);
    case "dayTime":
      return course.dayTime ?? "";
    case "classLength":
      return course.classLengthMinutes !== null ? String(course.classLengthMinutes) : "";
    case "weeks":
      return course.weeks !== null ? String(course.weeks) : "";
    case "breaks":
      return course.breaks ?? "";
    case "tests":
      return course.tests !== null ? String(course.tests) : "";
    case "assignmentDue":
      return describeAssignmentDueRule(course.assignmentDueRule);
    case "weeklyChecklist":
      return coerceWeeklyChecklist(course.weeklyChecklist)
        .map((item) => item.label)
        .join("\n");
    case "lms":
      return courseLmsLabel(course.lms);
    case "githubOrg":
      return course.githubOrg ?? "";
    case "integrations":
      return integrationsToText(course);
    case "repos":
      return reposToText(course);
    case "studentRepos":
      return rowsToStudentReposText(
        (course.studentRepos ?? []).map((r) => ({
          student: r.student,
          canvasUserId: r.canvasUserId ?? "",
          repo: r.repo,
        }))
      );
    case "roster":
      return course.roster ?? "";
    case "email":
      return course.email ?? "";
    case "emailClient":
      return emailClientLabel(course.emailClient);
    case "instructorTitle":
      return course.instructorTitle ?? "";
    case "instructorDepartment":
      return course.instructorDepartment ?? "";
    case "instructorCredentials":
      return course.instructorCredentials ?? "";
    case "instructorBio":
      return course.instructorBio ?? "";
    case "syllabusId": {
      const raw = (course.syllabusId ?? "").trim();
      if (!raw) return "";
      return ctx?.syllabusNameById?.get(raw) ?? raw;
    }
    case "syllabusTemplate": {
      const raw = (course.syllabusTemplateId ?? "").trim();
      if (!raw) return "";
      return ctx?.syllabusTemplateNameById?.get(raw) ?? raw;
    }
    case "description":
      return course.description ?? "";
    case "courseKind": {
      const raw = course.courseKind ?? "";
      if (!raw) return "";
      return COURSE_KINDS.find((k) => k.value === raw)?.label ?? raw;
    }
    case "topicOutline":
      return course.topicOutline ?? "";
    case "scheduleCsv":
      return course.csvData ?? "";
    case "textbook":
      return course.textbook ?? "";
    case "rubric":
      return course.rubricData ?? "";
    case "materials":
      return materialsText(course);
    case "lmsExports":
      return course.exportFiles.map((f) => f.name).join("\n");
    case "castletop":
      return course.castletopFiles.map((f) => f.name).join("\n");
    case "miscFiles":
      return course.miscFiles.map((f) => f.name).join("\n");
    case "courseProject":
      return hasProject(course.courseProject) ? describeProject(course.courseProject) : "";
    default: {
      const exhaustive: never = column;
      throw new Error(`cellTextValue: unhandled column "${String(exhaustive)}"`);
    }
  }
}

/** Value summary for the copy confirmation dialog (AC25) - truncated for
 * display, "Not set" (D7's one empty marker) rather than a blank string.
 * CORRECTION 3: threads the optional SortContext through to cellTextValue so
 * a syllabus/syllabusTemplate column's summary reads as its display NAME
 * rather than the raw stored id. */
function summaryFor(course: Course, column: CellColumnId, ctx?: SortContext): string {
  const text = cellTextValue(course, column, ctx);
  return text.trim() === "" ? "Not set" : truncateForCell(text, 60);
}

// ---------------------------------------------------------------------------
// cellCopyPlan

/**
 * Classifies `column` for the "Copy information to other cells" menu item
 * (AC24-AC32): either a copyable patch (AC29 - a Partial<CourseInput> the
 * existing courseToInput(target) + patch + updateCourseHubAction write path
 * applies verbatim) plus a display summary, or an explicit not-copyable
 * reason.
 *
 * Empty values are copyable and clear the target (AC32) - the key is ALWAYS
 * present in the patch (never omitted), matching D6's exact per-shape rule:
 * plain string columns clear to "", number columns to null, list columns to
 * [], `lms` to { lms: null, canvasUrl: "" }, `gradesDue` to
 * { gradesDueDate: null, gradesDueTime: null } - `undefined` would be
 * dropped by courseToInput's own spread and silently write nothing.
 *
 * Paired columns (D5/AC31) copy both fields together: `lms` + `canvasUrl`,
 * `gradesDue`'s date + time, `scheduleCsv`'s csvData + csvName, `rubric`'s
 * rubricData + rubricName - copying one half without the other would leave
 * the target inconsistent.
 *
 * CORRECTION 3: the optional `ctx` resolves a syllabus/syllabusTemplate
 * column's summary to its display NAME (the same SortContext shape
 * CoursesTable already builds) rather than the raw stored id - callers that
 * omit it (e.g. the existing two-argument test calls) keep compiling and
 * fall back to the raw id, matching cellTextValue's own fallback.
 */
export function cellCopyPlan(course: Course, column: CellColumnId, ctx?: SortContext): CellCopyPlan {
  const copy = (patch: Partial<CourseInput>): CellCopyPlan => ({
    copyable: true,
    patch,
    summary: summaryFor(course, column, ctx),
  });
  const notCopyable = (reason: string): CellCopyPlan => ({ copyable: false, reason });

  switch (column) {
    // CORRECTION 1: a course name is the row's IDENTIFIER, not an ordinary
    // scalar field. Copying it to every other course in view would rename
    // all of them to the same string at once - the table becomes
    // unnavigable, and it breaks the "Copy all" block (columnTextForCopy
    // below), which attributes every value BY course name. The reason names
    // that actual hazard rather than a generic "unsupported", since this is
    // the one refusal an instructor would otherwise read as a bug.
    case "name":
      return notCopyable(
        "A course's name identifies its row. Copying it to every other course in view would give every course the same name, making the table unnavigable and breaking \"Copy all\", which attributes every value by course name."
      );
    case "institution":
      return copy({ institution: course.institution ?? "" });
    case "modality":
      return copy({ modality: course.modality ?? "" });
    case "startDate":
      return copy({ startDate: course.startDate ?? "" });
    case "endDate":
      return copy({ endDate: course.endDate ?? "" });
    case "gradesDue":
      return copy({
        gradesDueDate: course.gradesDueDate ?? null,
        gradesDueTime: course.gradesDueTime ?? null,
      });
    case "dayTime":
      return copy({ dayTime: course.dayTime ?? "" });
    case "classLength":
      return copy({ classLengthMinutes: course.classLengthMinutes });
    case "weeks":
      return copy({ weeks: course.weeks });
    case "breaks":
      return copy({ breaks: course.breaks ?? "" });
    case "tests":
      return copy({ tests: course.tests });
    case "assignmentDue":
      return copy({ assignmentDueRule: course.assignmentDueRule ?? "" });
    case "weeklyChecklist":
      return copy({ weeklyChecklist: coerceWeeklyChecklist(course.weeklyChecklist) });
    case "lms":
      return copy({ lms: course.lms ?? null, canvasUrl: course.canvasUrl ?? "" });
    case "githubOrg":
      return copy({ githubOrg: course.githubOrg ?? "" });
    case "integrations":
      return copy({ integrations: course.integrations });
    case "repos":
      return copy({ repos: course.repos });
    case "studentRepos":
      return copy({ studentRepos: course.studentRepos });
    case "roster":
      return copy({ roster: course.roster ?? "" });
    case "email":
      return copy({ email: course.email ?? "" });
    case "emailClient":
      return copy({ emailClient: course.emailClient ?? "" });
    case "instructorTitle":
      return copy({ instructorTitle: course.instructorTitle ?? "" });
    case "instructorDepartment":
      return copy({ instructorDepartment: course.instructorDepartment ?? "" });
    case "instructorCredentials":
      return copy({ instructorCredentials: course.instructorCredentials ?? "" });
    case "instructorBio":
      return copy({ instructorBio: course.instructorBio ?? "" });
    case "syllabusId":
      return copy({ syllabusId: course.syllabusId ?? "" });
    case "syllabusTemplate":
      return copy({ syllabusTemplateId: course.syllabusTemplateId ?? "" });
    case "description":
      return copy({ description: course.description ?? "" });
    case "courseKind":
      return copy({ courseKind: course.courseKind ?? "" });
    case "topicOutline":
      return copy({ topicOutline: course.topicOutline ?? "" });
    case "scheduleCsv":
      return copy({ csvData: course.csvData ?? "", csvName: course.csvName ?? "" });
    case "textbook":
      return copy({ textbook: course.textbook ?? "" });
    case "rubric":
      return copy({ rubricData: course.rubricData ?? "", rubricName: course.rubricName ?? "" });
    case "materials":
      return notCopyable(
        "Materials is an uploaded zip plus its extracted files, not a plain value - upload materials directly on the target course instead."
      );
    case "lmsExports":
      return notCopyable(
        "LMS Exports holds uploaded or generated cartridge files, not a plain value - manage exports directly on the target course instead."
      );
    case "castletop":
      return notCopyable(
        "Castletop holds generated workbook files, not a plain value - generate or upload them directly on the target course instead."
      );
    case "miscFiles":
      return notCopyable(
        "Misc files holds uploaded files, not a plain value - upload files directly on the target course instead."
      );
    case "courseProject":
      return notCopyable(
        "Course project is dedicated, generated planning state for this one course, not a plain value another course can inherit - set it up directly on the target course instead."
      );
    default: {
      const exhaustive: never = column;
      throw new Error(`cellCopyPlan: unhandled column "${String(exhaustive)}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// columnTextForCopy

/** One course's line(s) in the "Copy all" block (AC38): `Name: text` when
 * text is empty or a single line ("Not set" - D7 - when empty), or
 * `Name:` followed by every line of `text` indented two spaces when it spans
 * more than one line, so a multi-line cell (e.g. Description) stays readable
 * and attributable to its course. */
function courseColumnLine(courseName: string, text: string): string {
  if (text === "") return `${courseName}: Not set`;
  const lines = text.split("\n");
  if (lines.length === 1) return `${courseName}: ${lines[0]}`;
  return [`${courseName}:`, ...lines.map((line) => `  ${line}`)].join("\n");
}

/**
 * The full clipboard text for the header's "Copy all" action (AC37-AC41):
 * one entry per course CURRENTLY IN VIEW (the caller's own already-filtered
 * `courses` array - never re-filtered here), in the order given, each
 * prefixed by the course name. No course is skipped for being empty (AC38) -
 * an unset value reads as "Not set", never a silently missing line. Uses the
 * cell's FULL text (cellTextValue), never truncateForCell - "Copy all" is a
 * read, so AC29's write restriction does not apply here (AC40): file-backed
 * and dedicated-writer columns still produce a useful block. No trailing
 * newline; "" for an empty `courses` array.
 *
 * CORRECTION 2: the optional `ctx` resolves syllabusId/syllabusTemplate to
 * their display NAME via cellTextValue, so a copied column of those reads as
 * real names rather than raw UUIDs. Optional so existing two-argument call
 * sites (including the frozen-literal tests) keep compiling and fall back to
 * the raw id, matching cellTextValue's own fallback.
 */
export function columnTextForCopy(courses: Course[], column: CellColumnId, ctx?: SortContext): string {
  return courses.map((c) => courseColumnLine(c.name, cellTextValue(c, column, ctx))).join("\n");
}
