// Orchestrates the export-source read: resolve the course row - either from
// the tab's Canvas URL, or (now that entry 263's Limits are closed) directly
// by its course_hub row id for a course with no Canvas URL at all - find its
// newest instructor-provided export, download + parse it (cached by storage
// path), and adapt it to the shape ContentTab renders.
//
// Deliberately NOT a "use server" action past the course-row lookup. The
// course-row lookup (resolveLmsCourseRowAction / listCourseHubAction) is a
// small JSON round trip, well inside any server-function limit. The
// expensive part - downloading the cartridge zip and unzipping it with jszip
// - runs entirely in the browser via downloadCourseZipBlob (a signed URL +
// client-side fetch) and parseCartridgeBlob (a dynamic `import("jszip")`),
// exactly like WorkflowsTab.tsx's loadCourseExportData and
// useCourseImportActions.ts's getCourseCartridge already do. Routing the zip
// itself through a server action would reintroduce the 4.5MB request-body
// limit and the 60s function ceiling neither of those two existing call
// sites is subject to today.

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLmsCourseRowAction, listCourseHubAction } from "@/app/actions";
import { downloadCourseZipBlob } from "@/lib/course-files";
import { parseCartridgeBlob, type CartridgeCourseData } from "@/lib/cartridge-import";
import { latestSourceExportFile } from "@/lib/courses-table-helpers";
import type { Course } from "@/lib/supabase/courses";
import type { Database } from "@/lib/supabase/types";
import { adaptCartridgeToCourseContent } from "./adapter";
import { KeyedPromiseCache } from "./cache";
import type { ExportCourseContent } from "./types";

// Parsed cartridges keyed by storage path - see cache.ts's header comment for
// why this is a shared, extracted cache rather than a third hand-rolled copy.
// Shared by BOTH resolution paths below (by Canvas URL and by course_hub row
// id): they can never collide on the same file.path since it names a
// specific storage object, not a course, so sharing one cache here is a pure
// win, never a cross-course correctness risk.
const cartridgeCache = new KeyedPromiseCache<CartridgeCourseData>();

/** Shared tail of both resolution paths below: given an already-resolved
 * course row, find its newest instructor-provided export, download + parse
 * it (cached by storage path), and adapt it to the shape ContentTab renders.
 * Not exported - callers resolve the row first via whichever lookup fits how
 * they identify the course. */
async function readExportCourseContentForRow(
  supabase: SupabaseClient<Database>,
  course: Course
): Promise<ExportCourseContent | { error: string }> {
  // Same "instructor-provided export, not one this app generated" rule as
  // useCourseImportActions.ts's getCourseCartridge and WorkflowsTab.tsx's
  // loadCourseExportData - see latestSourceExportFile's own doc comment and
  // docs/REGRESSION.md entry 196.
  const file = latestSourceExportFile(course);
  if (!file) return { error: `"${course.name}" has no LMS export to read.` };

  try {
    const data = await cartridgeCache.get(file.path, async () => {
      const blob = await downloadCourseZipBlob(supabase, file);
      return parseCartridgeBlob(blob);
    });
    return adaptCartridgeToCourseContent(data, course.name);
  } catch (err) {
    const underlying = err instanceof Error ? err.message : String(err);
    return { error: `Could not read "${course.name}"'s LMS export "${file.name}": ${underlying}` };
  }
}

/**
 * Read a course's stored LMS export and adapt it to
 * `{courseName, modules, pages}` - the export-source counterpart to
 * `listCourseContentAction(courseUrl, acronym?)`. Same call shape
 * deliberately: `courseUrl` is the same string ContentTab already tracks in
 * `localStorage` (it has no course ROW, only a URL - docs/REGRESSION.md entry
 * 260 check 10), so a caller can swap which of the two functions it calls
 * without first threading a DB row through.
 *
 * Resolves the course row by matching this Canvas URL, so it can only ever
 * find a course that HAS a canvasUrl. A course with no Canvas connection at
 * all (export-only) cannot be reached this way - use
 * readExportCourseContentById for that case instead.
 *
 * No `acronym` parameter - and NOT for the reason this comment used to give
 * ("nothing here calls the Canvas API, so there is no institution-specific
 * credential to select"). That reasoning is stale: since M12/M14
 * (course-canvas-url-match.ts's own header comment), `acronym` is no longer a
 * Canvas credential at all - it is a course-row SCOPING key that
 * resolveLmsCourseRowAction/findCourseForCanvasUrl need to disambiguate a
 * host-less `canvasUrl` between two saved courses that happen to share the
 * same numeric Canvas course id. That need applies here exactly as it does on
 * the live path, regardless of whether this function itself ever calls
 * Canvas.
 *
 * DEFECT 5 (M14 review) - the honest reason today: this function
 * (`readExportCourseContent`, as opposed to `...ById` below) has NO CALLER
 * anywhere in this codebase - verified by grep, it is only re-exported from
 * `./index.ts`. Every real call site (ContentTab.tsx,
 * useLmsAssignmentPull.ts, lms-export/selection/route.ts) resolves an export
 * course by its course_hub row id instead, via `readExportCourseContentById`,
 * which needs no Canvas-URL match (and so no acronym) at all. There is
 * therefore no real caller anywhere to supply an institution-scoping acronym
 * from. Reported rather than silently "fixed": adding a parameter nothing
 * calls would be unverifiable dead surface, and inventing a caller is out of
 * this fix's scope. If a caller of THIS function (by Canvas URL, not by row
 * id) ever appears, it must thread through the same active-institution
 * acronym every live-path caller of resolveLmsCourseRowAction already
 * carries - by adding an `acronym` parameter here and passing it to
 * resolveLmsCourseRowAction below - exactly as readExportCourseContentById's
 * caller already threads a course id.
 */
export async function readExportCourseContent(
  supabase: SupabaseClient<Database>,
  courseUrl: string
): Promise<ExportCourseContent | { error: string }> {
  const resolved = await resolveLmsCourseRowAction(courseUrl);
  if ("error" in resolved) return resolved;
  return readExportCourseContentForRow(supabase, resolved.course);
}

/**
 * Read a course's stored LMS export by its course_hub row id directly,
 * skipping the Canvas-URL match `readExportCourseContent` requires. This is
 * the only way to reach an export-only course (no canvasUrl at all, so there
 * is no URL for resolveLmsCourseRowAction/findCourseForCanvasUrl to match
 * against - docs/REGRESSION.md entry 263's Limits). The Course Content tab's
 * source picker calls this for any course chosen from its "export" section
 * (src/lib/courses-table-helpers.ts's lmsRenderSourcesFor decides which
 * courses that section lists) - including a course that ALSO has a live
 * Canvas connection, since the instructor may deliberately pick the export
 * for one of those too.
 */
export async function readExportCourseContentById(
  supabase: SupabaseClient<Database>,
  courseId: string
): Promise<ExportCourseContent | { error: string }> {
  const hub = await listCourseHubAction();
  if ("error" in hub) return { error: hub.error };
  const course = hub.courses.find((c) => c.id === courseId);
  if (!course) return { error: "Could not find that saved course." };
  return readExportCourseContentForRow(supabase, course);
}
