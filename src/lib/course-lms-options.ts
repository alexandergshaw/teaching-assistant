// Single shared source for the course tile's `lms` field options - which LMS
// a course RUNS IN (a plain free-text string | null column on course_hub;
// see src/lib/supabase/courses.ts). Previously this value/label pairing was
// restated in three places that could drift (the AddCourseForm select, the
// LmsCell select, and LmsCell's separate display mapping) - a value the
// select offered but the display mapping didn't know how to label already
// existed as a live bug for anything other than canvas/blackboard. Every
// select and every display lookup for this field must go through
// COURSE_LMS_OPTIONS / courseLmsLabel so the list cannot drift again.
//
// This is deliberately NOT shared with CartridgeDropPanel.tsx's own LMS
// picker - that component chooses a CARTRIDGE EXPORT FORMAT (a different
// concept, and one that also includes Moodle, which this field does not
// offer), not which LMS the course runs in. See that component's own
// picker for the export-format list.
//
// Selecting an LMS here only records the value on the course tile and flows
// into generated-artifact context (course-facts.ts's `line("LMS", ...)`);
// it does not create a live integration - the app's LMS API work
// (announcements, grading, roster) is Canvas-specific and keyed off
// canvas_url and the Canvas token env vars, not off this field.

export interface CourseLmsOption {
  value: string;
  label: string;
}

export const COURSE_LMS_OPTIONS: readonly CourseLmsOption[] = [
  { value: "canvas", label: "Canvas" },
  { value: "blackboard", label: "Blackboard" },
  // Matches the "brightspace" slug CartridgeDropPanel.tsx already uses for
  // the same product, so the two never disagree on the spelling.
  { value: "brightspace", label: "Brightspace" },
];

const LABEL_BY_VALUE: ReadonlyMap<string, string> = new Map(
  COURSE_LMS_OPTIONS.map((opt) => [opt.value, opt.label])
);

/**
 * Resolves a stored `lms` value to its display label. Falls back to the raw
 * value unchanged for anything not in COURSE_LMS_OPTIONS (a course.lms
 * column is free text - existing courses may hold a hand-set or otherwise
 * unrecognized value, and it must still display rather than render blank).
 * "" / null / undefined -> "".
 */
export function courseLmsLabel(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return "";
  return LABEL_BY_VALUE.get(trimmed) ?? trimmed;
}
