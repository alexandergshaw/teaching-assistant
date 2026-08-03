// The attended (in-browser) StepRunHelpers construction useWorkflowRun.ts's
// handleRun builds once per run - extracted out of that file to keep it
// under this project's 1000-line cap (same reasoning load-course-materials-
// attended.ts's own header comment already gives for its own extraction).
// A pure, mechanical extraction of the object literal that used to live
// inline in handleRun: every closure below is null exactly when it always
// was (user or supabase absent - a signed-out attended run), and every
// network call is the SAME call with the SAME arguments as before. No "use
// client" directive - like load-course-materials-attended.ts, this is a
// plain function export (no hooks, no JSX), only ever imported from a
// "use client" caller.

import { resolveDocumentAuthor } from "@/lib/author";
import { saveRecordingFile, listRecordingFiles, downloadRecordingFile, extForFile } from "@/lib/recording-files";
import { uploadCourseZip, uploadCourseZipChunked, uploadCourseFile, removeCourseZip, removeCourseZipObjects } from "@/lib/course-files";
import { loadInstitutionFields } from "@/lib/institution-fields";
import { appendCourseMaterialFileAction, appendCourseCastletopFileAction, appendCourseExportFileAction } from "@/app/actions";
import { loadCourseMaterialsAttended } from "./load-course-materials-attended";
import { loadCommonResources } from "@/lib/common-resources";
import { getStoredProvider } from "@/lib/llm-provider";
import type { StepRunHelpers } from "@/lib/workflows/registry";
import type { CartridgeCourseData } from "@/lib/cartridge-import";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Build the StepRunHelpers an attended run passes to every step - the
 * in-browser counterpart of server-runner.ts's buildServerStepRunHelpers.
 * Unlike the server version (always a resolved owner + service-role
 * client), a signed-out attended run nulls out every closure that needs a
 * user/session, exactly as the ORIGINAL inline object literal in
 * useWorkflowRun.ts already did - this is a straight relocation, not a
 * behavior change.
 */
export function buildAttendedStepHelpers(opts: {
  user: User | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any> | null;
  activeInstitution: string | null;
  workflowId: string;
  workflowName: string;
  workflowRunId: string;
  loadCourseExportData: (courseId: string) => Promise<CartridgeCourseData | null>;
}): StepRunHelpers {
  const { user, supabase, activeInstitution, workflowId, workflowName, workflowRunId, loadCourseExportData } = opts;

  return {
    activeInstitution: activeInstitution || null,
    provider: getStoredProvider(),
    author: resolveDocumentAuthor(user),
    saveBundle:
      user && supabase
        ? async (blob: Blob, name: string) => {
            await saveRecordingFile(supabase, user.id, blob, {
              name,
              kind: "bundle",
              mimeType: "application/zip",
              durationSec: null,
              source: "workflow",
              origin: "manual",
              workflowName,
              workflowId,
              workflowRunId,
            });
          }
        : null,
    saveCourseMaterialFile:
      user && supabase
        ? async (courseId: string, blob: Blob, fileName: string) => {
            const { path } = await uploadCourseZip(
              supabase,
              user.id,
              courseId,
              blob,
              null
            );
            const r = await appendCourseMaterialFileAction(courseId, {
              name: fileName,
              path,
              size: blob.size,
            });
            if ("error" in r) throw new Error(r.error);
            if (r.replacedPath) {
              await removeCourseZip(supabase, r.replacedPath);
            }
          }
        : null,
    saveCourseCastletopFile:
      user && supabase
        ? async (courseId: string, blob: Blob, fileName: string) => {
            const { path } = await uploadCourseFile(
              supabase,
              user.id,
              courseId,
              blob,
              "xlsx",
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            );
            const r = await appendCourseCastletopFileAction(courseId, {
              name: fileName,
              path,
              size: blob.size,
            });
            if ("error" in r) throw new Error(r.error);
            if (r.replacedPath) {
              await removeCourseZip(supabase, r.replacedPath);
            }
          }
        : null,
    saveCourseExportFile:
      user && supabase
        ? async (courseId: string, blob: Blob, fileName: string) => {
            const { path, parts } = await uploadCourseZipChunked(
              supabase,
              user.id,
              courseId,
              blob
            );
            const r = await appendCourseExportFileAction(courseId, {
              name: fileName,
              path,
              size: blob.size,
              ...(parts ? { parts } : {}),
              generated: true,
            });
            if ("error" in r) {
              await removeCourseZipObjects(supabase, parts ?? [path]);
              throw new Error(r.error);
            }
            await removeCourseZipObjects(supabase, r.replacedPaths);
          }
        : null,
    loadCommonResources:
      user && supabase
        ? async () => loadCommonResources(supabase, user.id)
        : null,
    getLibraryFile:
      user && supabase
        ? async (fileId: string) => {
            const files = await listRecordingFiles(supabase, user.id);
            const f = files.find((x) => x.id === fileId);
            if (!f) return null;
            const blob = await downloadRecordingFile(supabase, f);
            return {
              blob,
              name: `${f.name}.${extForFile(f)}`,
              mimeType: f.mimeType,
            };
          }
        : null,
    getInstitutionFields:
      user && supabase
        ? async (acronym: string) =>
            loadInstitutionFields(supabase, user.id, acronym)
        : null,
    loadCourseExport: user && supabase ? loadCourseExportData : null,
    // Extracted to load-course-materials-attended.ts (kept under the
    // 1000-line cap there too); wraps a genuine downloadCourseZipBlob failure
    // with the tile and file name the same way loadCourseExportData above
    // already wraps loadCourseExport's - see that module's header comment.
    loadCourseMaterials:
      user && supabase
        ? (courseId: string) => loadCourseMaterialsAttended(supabase, courseId)
        : null,
    workflowId,
    workflowName,
    workflowRunId,
  };
}
