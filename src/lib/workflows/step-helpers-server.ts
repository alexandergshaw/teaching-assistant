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
import { latestSourceExportFile } from "@/lib/courses-table-helpers";
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
      // AC3 (real runs 556b49f0, 6729e3f5, 90415cd8): this call itself can
      // fail at the network level (listCourseHubAction wraps a Supabase
      // Postgrest query, which - like Storage's createSignedUrl,
      // course-files.ts's getCourseZipUrl - can surface a DNS/CORS/
      // connection failure as a bare browser "Failed to fetch"). Every OTHER
      // rethrow below is already wrapped with the tile/file it was reading
      // (the try/catch around downloadCourseZipBlob/parseCartridgeBlob) -
      // THIS one used to be a bare `throw new Error(list.error)`, the one
      // gap in this chain that named nothing, because at this point the
      // tile has not even been looked up yet. Naming that this is the
      // course-listing step (not which course, since none is known yet) is
      // what closes it - the SAME fix as the attended counterpart
      // (WorkflowsTab.tsx's loadCourseExportData), kept in sync per this
      // file's own header comment.
      if ("error" in list) {
        throw new Error(`Could not list your course tiles: ${list.error}`);
      }
      const course = list.courses.find((c) => c.id === courseId);
      if (!course) return null;
      // Skips app-generated cartridges - see latestSourceExportFile's own
      // doc comment and docs/REGRESSION.md entry 196. A course whose export
      // files are ALL generated has no source export, which is an expected
      // absence (null), not a genuine I/O failure (throw).
      const latest = latestSourceExportFile(course);
      if (!latest) return null;
      try {
        const blob = await downloadCourseZipBlob(supabase, latest);
        return await parseCartridgeBlob(blob);
      } catch (err) {
        // Same fix as the attended counterpart (WorkflowsTab.tsx's own
        // loadCourseExportData - kept in sync per this file's header
        // comment): downloadCourseZipBlob/parseCartridgeBlob only ever see a
        // storage object path, never the tile or export file a human
        // recognizes. Naming both here turns a bare "Failed to fetch" (or
        // any other underlying failure) into something diagnosable.
        const underlying = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Could not read "${course.name}"'s LMS export "${latest.name}": ${underlying}`
        );
      }
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
        try {
          const blob = await downloadCourseZipBlob(supabase, newestMaterialsFile);
          return { name: newestMaterialsFile.name, blob };
        } catch (err) {
          // Same fix as loadCourseExport just above (and its attended
          // counterpart, load-course-materials-attended.ts's
          // loadCourseMaterialsAttended - kept in sync per this file's
          // header comment): name the tile and the materials file before
          // rethrowing, so a bare "Failed to fetch" reads as "could not
          // read THIS tile's THIS materials file" instead of naming
          // nothing.
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
    },
  };
}
