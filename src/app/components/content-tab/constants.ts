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
