// Wording for three currently-invisible (or currently-misleading) states
// spanning CoursePicker (src/app/components/CoursePicker.tsx) and its one
// caller that renders a loaded course, ContentTab
// (src/app/components/ContentTab.tsx): the live Canvas dropdown with no
// institution selected, the "courses with a saved export" section in every
// state that is not "ready with at least one qualifying course", and a
// REMEMBERED live selection with no institution selected (which needs
// wording ContentTab itself owns no gating vocabulary for - it renders a
// loaded course, CoursePicker only renders a picker). See
// docs/export-only-course-content-acceptance-criteria.md (AC2, AC4, AC5) and
// docs/REGRESSION.md entries 295 checks 4 and 5, and 295's follow-up fixing
// the empty-course-that-looks-real regression the AC1 gate removal
// introduced, for the reported silence (or false positive) each string
// replaces.
//
// Deliberately a PURE module, with no React/MUI import at all - the same
// shape as src/app/components/content-tab/contentSourceGating.ts, which this
// file sits next to but does not touch (that one is Course-Content-specific;
// CoursePicker is shared by seven call sites, so its wording lives here
// instead). Every string is defined ONCE and is exhaustively testable
// without rendering anything (vitest here is node-env and renders no
// component - see course-picker-availability.test.ts's own header).

import type { Course } from "./supabase/courses";
import { hasOnlyGeneratedExports, lmsRenderSourcesFor } from "./courses-table-helpers";

/**
 * Why the live Canvas course dropdown is unavailable when no institution
 * acronym is selected (AC2). An institution acronym is the only thing that
 * picks a Canvas credential (`<ACRONYM>_CANVAS_URL` / `_CANVAS_API_TOKEN`),
 * so with none selected there is no live course list to fetch at all -
 * `listCoursesAction` is never called (its `acronym` parameter is required),
 * and this is the text that explains why in its place. Meant to be rendered
 * as visible text (styles.fieldHint), never a `title` tooltip - a tooltip
 * does not surface on keyboard focus (see
 * src/app/components/courses/CellMenu.tsx's header comment, the one correct
 * precedent for that rule in this repo).
 */
export function describeNoInstitutionSelected(): string {
  return "Select a school in Settings (top right) to load its Canvas courses here.";
}

/**
 * Why a REMEMBERED live (non-export) course selection cannot be shown with
 * no institution acronym selected - ContentTab's counterpart to
 * `describeNoInstitutionSelected` above. An institution acronym is a
 * live-Canvas credential selector; a persisted `{source: "live"}` selection
 * still parses to a real course id even with no acronym registered or
 * selected (an instructor can remove their last acronym, or arrive before
 * picking one), so `ContentTab`'s mount effect deliberately does not fetch
 * for it - it cannot resolve a Canvas host. Rendering the content view
 * anyway, with nothing fetched, would show an EMPTY course that looks real:
 * the exact failure mode docs/REGRESSION.md entry 264 check 9 named
 * ("An empty course that looks real is a worse failure than an absent
 * option") when it kept the export picker switched off. This string is
 * ContentTab's explanatory state instead, rendered in place of the loaded
 * view - as visible text (never a `title` tooltip), naming both the missing
 * precondition and that an export-sourced course does not share it.
 */
export function describeLiveSelectionNeedsInstitution(): string {
  return (
    "This course loads from live Canvas, which needs a school selected in Settings (top right). " +
    "A course with a saved export can be opened without one."
  );
}

/** The visible label path (Courses tab -> a course's LMS Exports cell ->
 * Manage -> Upload export) an export must be attached through for
 * `describeExportSectionState`'s empty-state wording. Exact labels per
 * src/app/components/courses/FilesCell.tsx:259, :376, :385 - not "the files
 * cell" (that name is internal) and not the adjacent Materials/Upload zip
 * control, which is a different store. */
const EXPORT_ATTACH_PATH =
  'the Courses tab, open a course\'s "LMS Exports" cell, choose "Manage", then "Upload export"';

export type ExportSectionState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; courses: Array<{ id: string; name: string }> }
  | { kind: "empty-no-exports"; message: string }
  | { kind: "empty-only-generated"; message: string };

/**
 * Classifies the "courses with a saved export" section of CoursePicker
 * (AC4, AC5) from the RAW course_hub rows `listCourseHubAction` returns -
 * raw, not pre-filtered, because telling "no exports at all" apart from
 * "every export is app-generated" needs `hasOnlyGeneratedExports` run over
 * the same rows `lmsRenderSourcesFor` filters down to the qualifying set.
 *
 * Uses the EXISTING predicates from courses-table-helpers.ts -
 * `lmsRenderSourcesFor` for which courses qualify (mirrors the filter the
 * component itself used before this module existed) and
 * `hasOnlyGeneratedExports` for the AC5 distinction - rather than
 * reimplementing either rule.
 *
 * `loading` and `error` are passed in by the caller (CoursePicker already
 * tracks its own fetch state) rather than inferred here, since this module
 * has no knowledge of network state.
 */
export function describeExportSectionState(
  status: "loading" | "error" | "idle",
  courses: Course[]
): ExportSectionState {
  if (status === "loading") return { kind: "loading" };
  if (status === "error") return { kind: "error", message: "Could not list your saved courses." };

  const qualifying = courses
    .filter((c) => lmsRenderSourcesFor(c).export)
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (qualifying.length > 0) return { kind: "ready", courses: qualifying };

  // `.some(...)`, not `.every(...)`: this branch is also reached by a MIX -
  // one course whose only exports are app-generated alongside others with no
  // exports at all. The message is worded to stay true in that mix (it does
  // not claim every attached export, or every course, is generated-only -
  // only that at least one is), rather than the narrower "the exports
  // attached here are..." phrasing this used to have, which over-claimed
  // once a mix was possible.
  const onlyGenerated = courses.length > 0 && courses.some((c) => hasOnlyGeneratedExports(c));
  if (onlyGenerated) {
    return {
      kind: "empty-only-generated",
      message:
        "At least one course's only exports are cartridges this app generated, which do not count as a source export. " +
        `Attach an instructor-provided export at ${EXPORT_ATTACH_PATH}.`,
    };
  }

  return {
    kind: "empty-no-exports",
    message: `No course has a saved export yet. Attach one at ${EXPORT_ATTACH_PATH}.`,
  };
}
