// Shared types and constants for academic calendar / syllabus events extracted
// from uploaded PDFs (and shown in the Deadlines & Events window).

export type CalendarEventType =
  | "assignment"
  | "exam"
  | "quiz"
  | "review_session"
  | "term_start"
  | "term_end"
  | "finals_week"
  | "break"
  | "holiday"
  | "lecture"
  | "other";

export const CALENDAR_EVENT_TYPES: readonly CalendarEventType[] = [
  "assignment",
  "exam",
  "quiz",
  "review_session",
  "term_start",
  "term_end",
  "finals_week",
  "break",
  "holiday",
  "lecture",
  "other",
] as const;

export function isCalendarEventType(value: unknown): value is CalendarEventType {
  return (
    typeof value === "string" &&
    (CALENDAR_EVENT_TYPES as readonly string[]).includes(value)
  );
}

export const CALENDAR_EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  assignment: "Assignment",
  exam: "Exam",
  quiz: "Quiz",
  review_session: "Review Session",
  term_start: "Term Start",
  term_end: "Term End",
  finals_week: "Finals Week",
  break: "Break",
  holiday: "Holiday",
  lecture: "Lecture",
  other: "Other",
};

// Event type categories used for legacy badge coloring.
// "deadline" = something due, "event" = anything else.
export function categorizeEventType(
  type: CalendarEventType
): "deadline" | "event" {
  switch (type) {
    case "assignment":
    case "exam":
    case "quiz":
      return "deadline";
    default:
      return "event";
  }
}

// The structured shape returned by the calendar-parsing API endpoint for
// each parsed event. `endDate` is provided for ranged events (e.g. finals
// week, spring break). Both dates are ISO `YYYY-MM-DD` strings.
export interface ParsedCalendarEvent {
  title: string;
  date: string;
  endDate?: string;
  type: CalendarEventType;
  description?: string;
}

export interface ParsedCalendarResult {
  school?: string;
  courseName?: string;
  term?: string;
  events: ParsedCalendarEvent[];
}
