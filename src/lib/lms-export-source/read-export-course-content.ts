// Orchestrates the export-source read: resolve the course row from the tab's
// Canvas URL, find its newest instructor-provided export, download + parse it
// (cached by storage path), and adapt it to the shape ContentTab renders.
//
// Deliberately NOT a "use server" action past the course-row lookup. The
// course-row lookup (resolveLmsCourseRowAction) is a small JSON round trip,
// well inside any server-function limit. The expensive part - downloading
// the cartridge zip and unzipping it with jszip - runs entirely in the
// browser via downloadCourseZipBlob (a signed URL + client-side fetch) and
// parseCartridgeBlob (a dynamic `import("jszip")`), exactly like
// WorkflowsTab.tsx's loadCourseExportData and
// useCourseImportActions.ts's getCourseCartridge already do. Routing the zip
// itself through a server action would reintroduce the 4.5MB request-body
// limit and the 60s function ceiling neither of those two existing call
// sites is subject to today.

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLmsCourseRowAction } from "@/app/actions";
import { downloadCourseZipBlob } from "@/lib/course-files";
import { parseCartridgeBlob, type CartridgeCourseData } from "@/lib/cartridge-import";
import { latestSourceExportFile } from "@/lib/courses-table-helpers";
import type { Database } from "@/lib/supabase/types";
import { adaptCartridgeToCourseContent } from "./adapter";
import { KeyedPromiseCache } from "./cache";
import type { ExportCourseContent } from "./types";

// Parsed cartridges keyed by storage path - see cache.ts's header comment for
// why this is a shared, extracted cache rather than a third hand-rolled copy.
const cartridgeCache = new KeyedPromiseCache<CartridgeCourseData>();

/**
 * Read a course's stored LMS export and adapt it to
 * `{courseName, modules, pages}` - the export-source counterpart to
 * `listCourseContentAction(courseUrl, acronym?)`. Same call shape
 * deliberately: `courseUrl` is the same string ContentTab already tracks in
 * `localStorage` (it has no course ROW, only a URL - docs/REGRESSION.md entry
 * 260 check 10), so a caller can swap which of the two functions it calls
 * without first threading a DB row through.
 *
 * No `acronym` parameter: unlike the live path, nothing here calls the
 * Canvas API, so there is no institution-specific credential to select.
 */
export async function readExportCourseContent(
  supabase: SupabaseClient<Database>,
  courseUrl: string
): Promise<ExportCourseContent | { error: string }> {
  const resolved = await resolveLmsCourseRowAction(courseUrl);
  if ("error" in resolved) return resolved;
  const course = resolved.course;

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
