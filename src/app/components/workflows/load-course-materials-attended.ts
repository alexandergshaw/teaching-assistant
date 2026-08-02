// The attended (in-browser) counterpart of buildServerMaterialLoaders's
// loadCourseMaterials closure (src/lib/workflows/step-helpers-server.ts) -
// extracted out of useWorkflowRun.ts's StepRunHelpers object literal so that
// file stays under the project's 1000-line cap. The two implementations are
// kept in sync BY HAND (the same convention step-helpers-server.ts's own
// header comment documents from the other side): there is no shared import
// between them because one talks to Supabase Storage from the browser and
// the other from the server, matching how loadCourseExport's attended half
// (WorkflowsTab.tsx's loadCourseExportData) and server half
// (buildServerMaterialLoaders) are already kept in sync today.
import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadCourseZipBlob } from "@/lib/course-files";
import { listCourseHubAction } from "@/app/actions";

/**
 * Download the newest materials file saved on a course tile, falling back to
 * the legacy single materialsZipPath when the tile has no per-file materials
 * entry. Mirrors buildServerMaterialLoaders's loadCourseMaterials exactly,
 * including which outcomes return null (course/tile not found, no materials
 * on the tile, listCourseHubAction itself erroring - all normal, expected
 * "nothing to load" outcomes for a fail-forward material source) versus
 * which throw: a genuine downloadCourseZipBlob failure is wrapped to name
 * the course tile and the materials file, the same fix already applied to
 * loadCourseExport for defect run 556b49f0's bare, contextless
 * "Failed to fetch".
 */
export async function loadCourseMaterialsAttended(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>,
  courseId: string
): Promise<{ name: string; blob: Blob } | null> {
  const list = await listCourseHubAction();
  if ("error" in list) return null;
  const tile = list.courses.find((c) => c.id === courseId);
  if (!tile) return null;
  const newestMaterialsFile =
    tile.materialsFiles.length > 0
      ? tile.materialsFiles.reduce((a, b) => (b.addedAt > a.addedAt ? b : a))
      : null;
  if (newestMaterialsFile) {
    try {
      const blob = await downloadCourseZipBlob(supabase, newestMaterialsFile);
      return { name: newestMaterialsFile.name, blob };
    } catch (err) {
      const underlying = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Could not read "${tile.name}"'s course materials "${newestMaterialsFile.name}": ${underlying}`
      );
    }
  }
  if (tile.materialsZipPath) {
    const fileName = tile.materialsZipName ?? "materials.zip";
    try {
      const blob = await downloadCourseZipBlob(supabase, { path: tile.materialsZipPath });
      return { name: fileName, blob };
    } catch (err) {
      const underlying = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Could not read "${tile.name}"'s course materials "${fileName}": ${underlying}`
      );
    }
  }
  return null;
}
