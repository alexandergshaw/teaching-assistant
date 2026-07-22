import type { QuizQuestionType } from "@/lib/canvas-modules";

export type ContentView = "modules" | "pages" | "files" | "grading" | "announcements" | "inbox" | "version-control";

export const CONTENT_URL_KEY = "ta-content-course-url";
export const VIEW_KEY = "ta-content-view";
// Persisted height (px) the user dragged the sticky module header down to.
export const HEADER_HEIGHT_KEY = "ta-content-header-height";

export const MAX_INDENT = 5;

// Elements that own their click (so a click on blank row space can fall through
// to toggling the row's selection checkbox instead of hitting one of these).
export const ROW_INTERACTIVE =
  "button, a, input, select, textarea, label, [role='button'], [contenteditable='true']";

// Item types that carry a due date / points (graded). Decide which rows show them.
export const DATED_TYPES = ["Assignment", "Quiz", "Discussion"];
// Of those, the ones whose points can be edited through the gradable API here.
export const POINTS_EDITABLE = ["Assignment", "Quiz"];

export const QUIZ_TYPE_LABELS: Record<QuizQuestionType, string> = {
  multiple_choice_question: "Multiple choice",
  true_false_question: "True / False",
  short_answer_question: "Fill in the blank",
  essay_question: "Essay",
};
export const QUIZ_TYPES = Object.keys(QUIZ_TYPE_LABELS) as QuizQuestionType[];
