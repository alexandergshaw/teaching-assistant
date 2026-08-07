// The built-in Tasks tab catalog: the 40 once-per-term "Term Setup" tasks
// transcribed from the source workbook (Adjuncting Tasks.xlsx, sheet
// "Recurring Tasks", columns D-AQ), plus the 12 "Daily / Weekly" tasks that
// have no source sheet (a proposed default the instructor edits through
// AC9's custom-task machinery - see AC-tasks-tab.md's assumption A5).
//
// This file is DATA ONLY - no logic, no coercion, no persistence. See
// ./course-tasks.ts for the TaskDefinition/TaskGroupDefinition shapes these
// lists are built from, the status vocabulary, and the cell operations, and
// ./course-tasks-view.ts for how a per-user's renames/retirements/custom
// tasks are layered on top of what ships here (resolveTaskCatalog).
//
// Ids are the persistence key (course_tasks.statuses is keyed by task id) and
// NEVER change once shipped, even if a label is later corrected - see A2/A3
// below for the one label this build already corrects on top of the sheet's
// own text. A future rename must keep the id; only resolveTaskCatalog's
// per-user overrides (AC9) may change what an instructor SEES.
import type { TaskDefinition, TaskGroupDefinition } from "./course-tasks";

// ---------------------------------------------------------------------------
// Groups
//
// Four groups across two views. "Dependent Upon Others" / "Independent of
// Others" mirror the sheet's own row-1 banded headers (with the merge
// under-extension corrected per assumption A1: the sheet's F1:L1 merge for
// "Dependent Upon Others" is read as under-extended, since D, E and M-T are
// equally other-dependent tasks - "Talk with dean", "Email dean", "Talk with
// dept chair" - so this build assigns D-T (17 tasks) to "Dependent Upon
// Others" and U-AQ (23 tasks) to "Independent of Others", making the two
// groups contiguous and exhaustive over the sheet's 40 columns). "Daily" and
// "Weekly" have no sheet precedent at all (assumption A5).
export const TASK_GROUPS: TaskGroupDefinition[] = [
  { id: "dependent", label: "Dependent Upon Others", view: "term" },
  { id: "independent", label: "Independent of Others", view: "term" },
  { id: "daily", label: "Daily", view: "recurring" },
  { id: "weekly", label: "Weekly", view: "recurring" },
];

function termTask(id: string, label: string, group: "dependent" | "independent"): TaskDefinition {
  // Every Term Setup task is cadence "once" (AC73): a term-setup checkbox
  // does not reset on any period, unlike the Daily/Weekly catalog below.
  return { id, label, view: "term", group, cadence: "once", builtIn: true };
}

// The 40 Term Setup tasks, in the sheet's own column order (D-AQ), split
// Dependent Upon Others (17, D-T) then Independent of Others (23, U-AQ) -
// see the group comment above for A1's rationale. AC3 item 14 pins this
// exact id/label/order list; a unit test anchors both ends and the group
// boundary so a reordered or regenerated catalog cannot silently pass.
export const TERM_TASKS: TaskDefinition[] = [
  // Dependent Upon Others (17)
  termTask("course-evaluation-form", "Course Evaluation Form Owned?", "dependent"),
  termTask("syllabus-template-obtained", "Updated Syllabus Template Obtained?", "dependent"),
  termTask("room-code-fob", "Lecture room code / fob obtained?", "dependent"),
  termTask("room-days-times", "Lecture room # / class days / times obtained?", "dependent"),
  termTask("textbook-owned", "Textbook Owned?", "dependent"),
  termTask("textbook-location", "Textbook Location Specified?", "dependent"),
  termTask("textbook-for-students", "Textbook Specified for Students?", "dependent"),
  termTask("syllabus-objectives-owned", "Syllabus/Course Objectives Owned?", "dependent"),
  termTask("course-accessible-lms", "Course Accessible in LMS?", "dependent"),
  termTask("lms-population-method", "Method of Populating LMS Shells Identified?", "dependent"),
  termTask("lms-shells-populated", "LMS Shells Populated?", "dependent"),
  termTask("external-grade-percentage", "External Grade Set to Percentage?", "dependent"),
  termTask("digital-office-hours", "Digital Office Hours Linked and Checked?", "dependent"),
  termTask("syllabus-in-lms", "Syllabus Added to LMS?", "dependent"),
  termTask("syllabus-ack-quiz", "Syllabus Acknowledgement Quiz Added?", "dependent"),
  termTask("syllabus-upload-location", "Syllabus Upload Location ID'ed?", "dependent"),
  termTask("syllabus-uploaded-college", "Syllabus Uploaded to College?", "dependent"),

  // Independent of Others (23)
  termTask("labs-added", "Labs Added?", "independent"),
  termTask("projects-run-through", "Run Through Projects/Homework on My Own?", "independent"),
  termTask("lectures-added", "Lectures Added?", "independent"),
  termTask("software-versions", "Instructor/Student Versions of Software Obtained?", "independent"),
  termTask("deadlines-added", "Deadlines Added?", "independent"),
  termTask("points-added", "Points Added?", "independent"),
  termTask("modules-assignments-published", "All Modules and Assignments Published?", "independent"),
  termTask("ferpa-title-ix", "Updated for FERPA and Title IX?", "independent"),
  termTask("accessibility-100", "Accessibility at 100%?", "independent"),
  termTask("links-validated", "Links Validated?", "independent"),
  termTask("modules-double-checked", "All Modules Double Checked?", "independent"),
  termTask("test-dates-chosen", "Dates Chosen for Tests?", "independent"),
  termTask("tests-made", "Tests Made?", "independent"),
  termTask("course-published", "Course Published?", "independent"),
  // AC A2: the sheet's AI2 header reads "Weclome Note Scheduled in LMS..." -
  // shipped here with the typo corrected and the stray trailing " ?"
  // normalized (A3). The id is stable regardless of label wording.
  termTask("welcome-note-scheduled", "Welcome Note Scheduled in LMS (course days/times/location)?", "independent"),
  termTask("closing-note-scheduled", "Closing Note Scheduled in LMS?", "independent"),
  termTask("standups-implemented", "Standups Implemented?", "independent"),
  termTask("lecture-practiced", "Lecture/Lab Practiced in Classroom?", "independent"),
  termTask("census-on-calendar", "Census Marked on Calendar?", "independent"),
  termTask("grade-deadlines-marked", "Midterm and Final Grade Deadlines Marked?", "independent"),
  termTask("census-entered", "Census Entered?", "independent"),
  termTask("midterm-grades-entered", "Midterm Grades Entered?", "independent"),
  termTask("final-grades-entered", "Final Grades Entered?", "independent"),
];

function recurringTask(id: string, label: string, group: "daily" | "weekly"): TaskDefinition {
  // Cadence is derived from the group because the two Daily/Weekly groups
  // ARE the two cadences - see the "gives every ... a real cadence" unit test,
  // which pins this exact invariant (task.cadence === task.group for every
  // recurring built-in).
  return { id, label, view: "recurring", group, cadence: group, builtIn: true };
}

// The 12 Daily/Weekly tasks (assumption A5 - there is no source sheet for
// these; they are a proposed, fully-editable-through-AC9 starting point
// grounded in what this app already does for the instructor day to day).
// AC14 item 81 pins these exact ids/labels/order.
export const RECURRING_TASKS: TaskDefinition[] = [
  // Daily (4)
  recurringTask("daily-lms-inbox", "LMS inbox and student email cleared?", "daily"),
  recurringTask("daily-questions-answered", "Student questions answered?", "daily"),
  recurringTask("daily-submissions-pulled", "New submissions pulled and graded?", "daily"),
  recurringTask("daily-attendance", "Attendance / standup recorded?", "daily"),

  // Weekly (8)
  recurringTask("weekly-announcement-posted", "Weekly announcement posted?", "weekly"),
  recurringTask("weekly-module-published", "Next module published in the LMS?", "weekly"),
  recurringTask("weekly-lecture-ready", "Next week's lecture materials ready?", "weekly"),
  recurringTask("weekly-assignment-published", "Next week's assignment published?", "weekly"),
  recurringTask("weekly-grades-posted", "Gradebook up to date and grades posted?", "weekly"),
  recurringTask("weekly-feedback-returned", "Feedback returned on last week's work?", "weekly"),
  recurringTask("weekly-at-risk-contacted", "At-risk students contacted?", "weekly"),
  recurringTask("weekly-backup", "Grades and materials backed up?", "weekly"),
];

// Exactly the two catalogs above, concatenated in this order - deliberately
// NOT a third, independently-maintained list, so a caller deriving a
// known-id set (e.g. coerceTaskCellMap's id filter, or the persisted-column
// "allIds") is always working off the same 52 ids these two arrays declare.
// Ids are unique across BOTH catalogs (a unit test pins this) because both
// views persist into the same course_tasks.statuses map (AC3 item 17).
export const BUILT_IN_TASKS: TaskDefinition[] = [...TERM_TASKS, ...RECURRING_TASKS];
