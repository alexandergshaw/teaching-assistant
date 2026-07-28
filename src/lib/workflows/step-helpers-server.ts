// Server-side StepRunHelpers material loaders, shared by every context that
// builds a StepRunHelpers OUTSIDE the browser - the unattended workflow
// runner (server-runner.ts's buildServerStepRunHelpers) and
// src/app/actions/live-class.ts's buildLiveSessionContextAction (which builds
// a StepRunHelpers for a single gatherModuleMaterials call, not a full
// workflow run). Extracted so there is exactly ONE implementation of
// loadCourseExport/loadCourseMaterials to keep in sync between the two -
// before this file existed, both closures lived inline in server-runner.ts;
// see that file's git history for the original.
//
// This module (and everything it imports) must stay free of client-only
// ("use client") modules and DOM/window access, matching server-runner.ts's
// own constraint - it is imported from there.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { downloadCourseZipBlob } from "@/lib/course-files";
import { parseCartridgeBlob } from "@/lib/cartridge-import";
import { listCourseHubAction } from "@/app/actions";
import type { StepRunHelpers } from "./registry-helpers";

/**
 * Build the loadCourseExport/loadCourseMaterials closures for a server-side
 * StepRunHelpers. Both resolve the course tile via listCourseHubAction (a
 * Server Action that resolves the caller's own identity via requireOwner -
 * see buildServerStepRunHelpers's doc comment for the impersonation note),
 * then read the newest matching file from Supabase Storage through
 * `supabase`. Each returns null for the "nothing to load" cases
 * (course/tile not found, no export or materials file on it) - those are
 * normal, expected outcomes for gatherModuleMaterials's fail-forward sources,
 * not errors. A genuine storage/parse failure DOES throw past this
 * function - gatherModuleMaterials's own callers (tryExport,
 * materialsZipGatherer) already wrap their calls to these closures in
 * try/catch and turn a throw into a fail-forward note, exactly like every
 * other material source, so a throw here never escapes to the caller of
 * gatherModuleMaterials.
 */
export function buildServerMaterialLoaders(
  supabase: SupabaseClient<Database>
): Pick<StepRunHelpers, "loadCourseExport" | "loadCourseMaterials"> {
  return {
    loadCourseExport: async (courseId) => {
      const list = await listCourseHubAction();
      if ("error" in list) throw new Error(list.error);
      const course = list.courses.find((c) => c.id === courseId);
      if (!course || course.exportFiles.length === 0) return null;
      const latest = course.exportFiles.reduce((a, b) => (b.addedAt > a.addedAt ? b : a));
      const blob = await downloadCourseZipBlob(supabase, latest);
      return await parseCartridgeBlob(blob);
    },
    loadCourseMaterials: async (courseId) => {
      const list = await listCourseHubAction();
      if ("error" in list) return null;
      const tile = list.courses.find((c) => c.id === courseId);
      if (!tile) return null;
      const newestMaterialsFile =
        tile.materialsFiles.length > 0
          ? tile.materialsFiles.reduce((a, b) => (b.addedAt > a.addedAt ? b : a))
          : null;
      if (newestMaterialsFile) {
        const blob = await downloadCourseZipBlob(supabase, newestMaterialsFile);
        return { name: newestMaterialsFile.name, blob };
      }
      if (tile.materialsZipPath) {
        const blob = await downloadCourseZipBlob(supabase, { path: tile.materialsZipPath });
        return { name: tile.materialsZipName ?? "materials.zip", blob };
      }
      return null;
    },
  };
}
