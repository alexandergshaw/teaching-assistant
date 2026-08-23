// resolveGenerationCourseRow, split out of src/app/actions/lms-generation.ts
// to keep that file under this repo's 1000-line ceiling (it crossed 1000
// lines once Job 4's diag-log field/plumbing landed - a STRUCTURAL split
// only, no behaviour change). Not itself a "use server" module - nothing
// here is called directly from client code (useLmsGeneration.ts never
// imports this function), only from other, already-server-side action files
// (lms-generation.ts and lms-generation-refine.ts), so the "use server"
// export-only-async rule this repo otherwise follows does not apply to this
// file at all. Kept `async` anyway, unchanged from before the move, since
// every existing call site already awaits it.
import { resolveLmsCourseRowAction, resolveLmsCourseRowByIdAction } from "./lms-syllabus-buttons";

/**
 * Resolve the course row a generation call should operate on, source-aware
 * (docs/REGRESSION.md entry recording this fix - the "no saved course is
 * linked to <empty>" defect). `courseId` present means an export-sourced
 * selection - ContentTab.tsx blanks `courseUrl` to "" for every one of those,
 * so resolveLmsCourseRowAction could never match it - and is resolved by its
 * course_hub row id instead (resolveLmsCourseRowByIdAction,
 * lms-syllabus-buttons.ts), the same identifier
 * readExportCourseContentById/useSelectionDownload.ts's own `courseId` param
 * already use for this exact export-selection problem. `courseId` absent
 * means a live selection, resolved by Canvas URL exactly as every call site
 * always has - byte-identical, since every existing caller that never sends
 * `courseId` keeps hitting this same `resolveLmsCourseRowAction` branch.
 * Called from both src/app/actions/lms-generation.ts and
 * src/app/actions/lms-generation-refine.ts's refineGeneratedArtifactAction
 * and saveEditedGeneratedArtifactAction.
 *
 * M12 (docs/module-intro-video-script-acceptance-criteria.md, findings
 * 11-16): `acronym` - the LMS tab's active institution, the same value every
 * caller here already carries as `activeInstitution`/`acronym` for its own
 * Canvas calls - is threaded through to resolveLmsCourseRowAction so a
 * host-less `courseUrl` (the ONLY shape CoursePicker.tsx/LmsCell.tsx ever
 * emit) can still resolve to the right row instead of silently colliding
 * with another institution's course sharing the same numeric id
 * (course-canvas-url-match.ts's own doc comment has the full mechanism).
 * Ignored entirely on the `courseId` branch - the by-id resolver needs no
 * Canvas identity at all. Passed only when actually present, so a caller
 * that omits it keeps calling resolveLmsCourseRowAction with exactly the
 * single argument it always has - byte-identical for every existing
 * caller/test.
 */
export async function resolveGenerationCourseRow(courseUrl: string, courseId?: string, acronym?: string) {
  if (courseId) return resolveLmsCourseRowByIdAction(courseId);
  return acronym ? resolveLmsCourseRowAction(courseUrl, acronym) : resolveLmsCourseRowAction(courseUrl);
}
