// Repo Grades view - the pure core of the course picker's typeahead
// conversion (docs/BACKLOG.md item A6; criteria in
// scratchpad/a6-ac.md, rulings A6-1 through A6-4 in
// scratchpad/a5-rulings.md).
//
// Owner, 2026-09-15: "the repo drop down to select one on the grading page
// needs to be auto complete, and include the institution in the selection".
//
// RULING A6-1: the institution goes in the OPTION LABEL, not a `Typeahead`
// `hint` line. A `hint` renders only inside `renderOption` - i.e. only while
// the dropdown is open - so once a course is picked the closed input would
// show the course name alone again, which is exactly the state the owner's
// literal ask ("include the institution in the SELECTION") is about. Putting
// the institution in the label also means MUI Autocomplete's own DEFAULT
// filter (which stringifies through `getOptionLabel`) matches typed
// institution text with no new `filterOptions` prop on `ui/Typeahead.tsx` -
// that file has 17 importers and stays untouched.
//
// The institution string is rendered AS TYPED, never normalized.
// `src/lib/supabase/courses.ts:132-141` states in its own words that
// `course_hub.institution` is NOT normalized on write (it comes from a
// freeSolo Autocomplete, `AddCourseForm.tsx`) - two rows can read "Physics
// Dept" and "physics dept " and describe the same real institution, or two
// rows can read identically and describe two different ones. A fold key
// (that file's own `institution.trim().toUpperCase()`, used elsewhere for
// counting) would merge genuinely distinct institutions here, which is the
// opposite of what this feature exists to fix - so it is deliberately NOT
// applied to this label.
//
// Pure, no I/O, no React - vitest here is node-env and collects only
// src/**/*.test.ts, so this decision has to live in a module a real test can
// import, matching repoGradesFolderSelection.ts/repoGradesRows.ts's own
// split. RepoGradesControls.tsx makes no decision of its own; it only calls
// this and hands the result to `Typeahead`.
import type { Course } from "@/lib/supabase/courses";
import type { TypeaheadOption } from "../ui/Typeahead";

/**
 * One `Typeahead` option per course: `value` is the course id (the same id
 * `onCourseIdChange` has always taken - this leaf does not change that
 * contract), and `label` is the course name plus its institution in
 * parentheses when the institution is a non-empty string after trimming.
 * `institution: null` (nullable per `courses.types.ts:72`) and an
 * all-whitespace institution both fall back to a bare-name label with no
 * dangling `" ()"` suffix.
 *
 * A course with an empty `name` still produces a selectable option - hiding
 * it would silently make a real row unpickable, which is a display/UX
 * concern this leaf has no business deciding on its own.
 *
 * Option order matches `courses` order exactly - no implicit sort or
 * grouping (RULING A6-1's rejection of grouping-by-institution: two real,
 * distinct institutions can normalize to the same fold key, so any grouping
 * scheme would risk clustering them together, the opposite of what this
 * feature is for).
 */
export function buildCourseOptions(courses: readonly Course[]): TypeaheadOption[] {
  return courses.map((course) => {
    const institution = course.institution?.trim() ?? "";
    return {
      value: course.id,
      label: institution ? `${course.name} (${institution})` : course.name,
    };
  });
}
