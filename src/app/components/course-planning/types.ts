import type { RunSpan } from "@/lib/office-edit";

/** One editable section (paragraph) of the syllabus being adapted. */
export type AdaptSection = {
  /** Stable React key. */
  key: string;
  /** Original paragraph id whose style/position this section borrows. */
  sourceId: string;
  /** Original text (for change detection / "Original:"); "" for added sections. */
  original: string;
  /** Current content as formatted spans. */
  spans: RunSpan[];
  /** Label for the guided field list; "Section" otherwise. */
  label: string;
  /** Whether the AI flagged this as a class-specific field (shown in the form). */
  isField: boolean;
};

export type PlanningMode = "syllabus" | "schedule" | "project" | "lecture" | "sync";

// The subtab toggle, in workflow order. "Syllabus" is first because it is the
// default landing mode.
export const PLANNING_MODES: Array<{ key: PlanningMode; label: string }> = [
  { key: "syllabus", label: "Syllabus" },
  { key: "schedule", label: "Course Schedule" },
  { key: "project", label: "Course Project Planning" },
  { key: "lecture", label: "Lecture Planning" },
  { key: "sync", label: "Assignment Sync" },
];

// Local storage keys for the course-planning form fields. Module-level so the
// hydration/persistence effects can reference them without them counting as
// reactive dependencies.
export const LS_KEYS = {
  planningMode: "coursePlanning_planningMode",
  courseDescription: "schedule_courseDescription",
  scheduleTerm: "schedule_scheduleTerm",
  scheduleStartDate: "schedule_scheduleStartDate",
  scheduleWeeks: "schedule_scheduleWeeks",
  scheduleTests: "schedule_scheduleTests",
  adaptCourseName: "adapt_courseName",
  adaptCourseCode: "adapt_courseCode",
  adaptInstructorName: "adapt_instructorName",
  adaptInstructorEmail: "adapt_instructorEmail",
  adaptDescription: "adapt_description",
  adaptTextbookText: "adapt_textbookText",
  adaptStartDate: "adapt_startDate",
  adaptMeetingDays: "adapt_meetingDays",
  adaptMeetingTimes: "adapt_meetingTimes",
  adaptLocation: "adapt_location",
};
