// buildServerStepRunHelpers, split out of server-runner.ts (C3/CAP: that file
// was at 997 lines against this project's 1000-line hard cap, and the C3 zip-
// run-log-Detail fix needed a few more lines there - see server-runner.ts's
// own header for why nothing about the run loop itself could move instead:
// runExpandedBodyOnce/runWorkflowUnattended/isRunOk/resolvePassThroughOutputs
// are all mutually coupled around one shared step-execution algorithm, while
// this factory has ZERO dependency on any of that - it only builds the
// StepRunHelpers object a run is handed, and nothing here reads or writes run
// state. That made it the one clean, low-risk seam: everything this function
// needs (recording-files, course-files, common-resources, institution-fields,
// the append*FileAction Server Actions, step-helpers-server.ts's material
// loaders) was ALREADY only used from inside this one function in
// server-runner.ts, so the import list below is exactly what moved with it -
// no leftover unused imports on either side of the split.
//
// Re-exported from server-runner.ts (`export { buildServerStepRunHelpers }
// from "./server-runner-helpers"`) so every existing caller - the cron route,
// the run-now route, the webhook route, the triggers route,
// workflow-trigger-runner.ts, and their tests (which vi.mock the WHOLE
// "@/lib/workflows/server-runner" module path) - keeps importing it from the
// same place, unchanged.
//
// Same module constraints as server-runner.ts: no client-only ("use client")
// modules, no DOM/window access - this must stay buildable for the server.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { LlmProvider } from "@/lib/llm";
import type { StepRunHelpers } from "@/lib/workflows/registry";
import { saveRecordingFile, listRecordingFiles, downloadRecordingFile, extForFile } from "@/lib/recording-files";
import {
  uploadCourseZip,
  uploadCourseZipChunked,
  uploadCourseFile,
  removeCourseZip,
  removeCourseZipObjects,
} from "@/lib/course-files";
import { loadCommonResources } from "@/lib/common-resources";
import { loadInstitutionFields } from "@/lib/institution-fields";
import { appendCourseMaterialFileAction, appendCourseCastletopFileAction, appendCourseExportFileAction } from "@/app/actions";
import { buildServerMaterialLoaders } from "./step-helpers-server";

/**
 * Build the StepRunHelpers the server runner passes to every step, backed by
 * the service-role client + the schedule's own user/institution/provider/
 * author instead of a browser session. Every closure is non-null: unlike the
 * client (where a signed-out state nulls them out), a server run always has
 * a resolved owner and a service-role client, so every headless-safe step's
 * helper dependency is always satisfiable.
 *
 * The functions reused here (saveRecordingFile, uploadCourseZip*,
 * loadCommonResources, loadInstitutionFields) already take a SupabaseClient
 * as an explicit parameter and scope every query to the given userId -
 * passing createServiceClient() here is exactly the same pattern
 * src/lib/supabase/courses.ts already uses internally, just supplied by the
 * caller instead of constructed inline. appendCourseMaterialFileAction /
 * appendCourseCastletopFileAction / appendCourseExportFileAction are Server
 * Actions that call requireOwner() themselves; called from inside runAsOwner
 * (see owner-context.ts) they resolve via the impersonated owner exactly like
 * the rest of the run. loadCourseExport/loadCourseMaterials come from
 * step-helpers-server.ts's buildServerMaterialLoaders (shared with
 * live-class.ts's buildLiveSessionContextAction) - see that module's doc
 * comment for why listCourseHubAction is safe to call there too.
 */
export function buildServerStepRunHelpers(opts: {
  supabase: SupabaseClient<Database>;
  userId: string;
  institution: string | null;
  provider: LlmProvider;
  author: string;
  workflowId?: string;
  workflowName?: string;
  workflowRunId?: string;
}): StepRunHelpers {
  const { supabase, userId, institution, provider, author, workflowId, workflowName, workflowRunId } = opts;

  return {
    activeInstitution: institution,
    provider,
    author,
    saveBundle: async (blob, name) => {
      await saveRecordingFile(supabase, userId, blob, {
        name,
        kind: "bundle",
        mimeType: "application/zip",
        durationSec: null,
        source: "workflow",
        origin: "unattended",
        workflowName: workflowName ?? null,
        workflowId: workflowId ?? null,
        workflowRunId: workflowRunId ?? null,
      });
    },
    saveRunReport: async (name, markdown) => {
      const blob = new Blob([markdown], { type: "text/markdown" });
      await saveRecordingFile(supabase, userId, blob, {
        name,
        kind: "file",
        mimeType: "text/markdown",
        durationSec: null,
        fileExt: "md",
        source: "workflow",
        origin: "unattended",
        workflowName: workflowName ?? null,
        workflowId: workflowId ?? null,
        workflowRunId: workflowRunId ?? null,
      });
    },
    saveCourseMaterialFile: async (courseId, blob, fileName) => {
      const { path } = await uploadCourseZip(supabase, userId, courseId, blob, null);
      const r = await appendCourseMaterialFileAction(courseId, { name: fileName, path, size: blob.size });
      if ("error" in r) throw new Error(r.error);
      if (r.replacedPath) {
        await removeCourseZip(supabase, r.replacedPath);
      }
    },
    saveCourseCastletopFile: async (courseId, blob, fileName) => {
      const { path } = await uploadCourseFile(
        supabase,
        userId,
        courseId,
        blob,
        "xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      const r = await appendCourseCastletopFileAction(courseId, { name: fileName, path, size: blob.size });
      if ("error" in r) throw new Error(r.error);
      if (r.replacedPath) {
        await removeCourseZip(supabase, r.replacedPath);
      }
    },
    saveCourseExportFile: async (courseId, blob, fileName) => {
      const { path, parts } = await uploadCourseZipChunked(supabase, userId, courseId, blob);
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
    },
    loadCommonResources: async () => loadCommonResources(supabase, userId),
    getLibraryFile: async (fileId) => {
      const files = await listRecordingFiles(supabase, userId);
      const f = files.find((x) => x.id === fileId);
      if (!f) return null;
      const blob = await downloadRecordingFile(supabase, f);
      return { blob, name: `${f.name}.${extForFile(f)}`, mimeType: f.mimeType };
    },
    getInstitutionFields: async (acronym) => loadInstitutionFields(supabase, userId, acronym),
    // Shared with live-class.ts's buildLiveSessionContextAction - see
    // step-helpers-server.ts's doc comment.
    ...buildServerMaterialLoaders(supabase),
    workflowId,
    workflowName,
    workflowRunId,
    // This builder is the cron loop's, and only the cron loop's - the app is
    // closed and no result note will ever be read. Nothing else may set this
    // true. See StepRunHelpers.unattended for why no existing field could
    // stand in for it.
    unattended: true,
  };
}
