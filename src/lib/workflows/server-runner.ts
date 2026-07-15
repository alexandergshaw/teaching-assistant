// Server-side (unattended/headless) workflow runner: executes a workflow
// with no browser and nobody watching, for the Vercel Cron route. Mirrors the
// client run loop in WorkflowsTab.tsx's handleRun - binding resolution,
// disabled-step cascade, dependency-failure cascade - but with NO pauses.
// requireInput/requireConfirmation can never be answered here, so a step
// that unexpectedly asks for one aborts the run instead of hanging.
//
// This module (and everything it imports) must stay free of client-only
// ("use client") modules and DOM/window access so it can be imported from a
// Route Handler and built for the server. It never constructs its own
// Supabase client - callers (the cron route) pass one in, which is what lets
// buildServerStepRunHelpers below be exercised in tests with a fake client.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { LlmProvider } from "@/lib/llm";
import { expandWorkflowDef, applyWorkflowScope, scopeCoversType, type WorkflowDef } from "@/lib/workflows/types";
import { isScopeableListType, expandScopedValue } from "@/lib/workflows/scope";
import {
  getStepDefinition,
  type StepDefinition,
  type StepRunHelpers,
  type StepRunSummary,
} from "@/lib/workflows/registry";
import { saveRecordingFile, listRecordingFiles, downloadRecordingFile, extForFile } from "@/lib/recording-files";
import {
  uploadCourseZip,
  uploadCourseZipChunked,
  removeCourseZip,
  removeCourseZipObjects,
  downloadCourseZipBlob,
} from "@/lib/course-files";
import { parseCartridgeBlob } from "@/lib/cartridge-import";
import { loadCommonResources } from "@/lib/common-resources";
import { loadInstitutionFields } from "@/lib/institution-fields";
import { listCourseHubAction, appendCourseMaterialFileAction, appendCourseExportFileAction } from "@/app/actions";

export interface StepRunOutcome {
  index: number;
  type: string;
  status: "done" | "error" | "disabled" | "needs-interaction";
  error: string | null;
  summary: StepRunSummary | null;
}

export interface WorkflowRunSummary {
  steps: StepRunOutcome[];
  /** False when any step genuinely errored, unexpectedly needed interaction,
   * or could not run because a step it depends on was disabled. Only a
   * step's OWN disabled status is exempted from counting against this - a
   * disabled step with no enabled dependents leaves `ok: true` (mirrors
   * handleRun's disabledRunIndices distinction). */
  ok: boolean;
}

/**
 * Run `def` end-to-end with no pauses. `disabledTopIndices` mirrors the
 * client's per-workflow disabled-step overlay (see workflows/types.ts
 * saveDisabledSteps) at the TOP-LEVEL step index space (expandWorkflowDef's
 * topIndices) - the same space handleRun reads it in.
 */
export async function runWorkflowUnattended(opts: {
  def: WorkflowDef;
  resolveWorkflow: (id: string) => WorkflowDef | undefined;
  fieldValues: Record<string, string>;
  disabledTopIndices: Set<number>;
  helpers: StepRunHelpers;
  /** Step catalog lookup; defaults to the real registry. Overridable in
   * tests so binding-resolution/cascade/abort logic can be exercised without
   * pulling in the full (network-touching) step catalog. */
  stepLookup?: (type: string) => StepDefinition | undefined;
}): Promise<WorkflowRunSummary> {
  const { def, resolveWorkflow, fieldValues, disabledTopIndices, helpers } = opts;
  const stepLookup = opts.stepLookup ?? getStepDefinition;

  let expanded: ReturnType<typeof expandWorkflowDef>;
  try {
    expanded = expandWorkflowDef(def, resolveWorkflow);
  } catch (err) {
    return {
      ok: false,
      steps: [
        {
          index: -1,
          type: def.id,
          status: "error",
          error: `Could not expand the workflow: ${err instanceof Error ? err.message : String(err)}`,
          summary: null,
        },
      ],
    };
  }

  const stepOutputs: Array<Record<string, unknown>> = [];
  const failedSteps = new Set<number>();
  const disabledRunIndices = new Set<number>();
  const outcomes: StepRunOutcome[] = [];
  const noopProgress = () => {};

  for (let i = 0; i < expanded.steps.length; i++) {
    const step = expanded.steps[i];

    // A step whose top-level index is disabled never runs; dependents cascade
    // through the same failedSteps mechanism a genuine error uses, but this
    // is not itself a failure (see disabledRunIndices / WorkflowRunSummary.ok).
    if (disabledTopIndices.has(expanded.topIndices[i])) {
      failedSteps.add(i);
      disabledRunIndices.add(i);
      outcomes.push({ index: i, type: step.type, status: "disabled", error: null, summary: null });
      continue;
    }

    const stepDef = stepLookup(step.type);

    try {
      if (!stepDef) {
        throw new Error(`Unknown step type "${step.type}".`);
      }

      const resolvedInputs: Record<string, unknown> = {};
      for (const spec of stepDef.inputs) {
        const binding = step.bindings[spec.key];
        if (!binding) continue;

        if (binding.source === "runtime") {
          // Uploads are never snapshotted into a schedule (see
          // workflow-schedules.ts) - an unattended run always resolves an
          // uploads-type runtime field to an empty list, exactly like a
          // client run whose uploadFiles state was never populated.
          // For entity inputs, an empty value falls back to the workflow's
          // scope target, so an unattended run needs no prompt. A scope-COVERED
          // input is filled from the scope directly (ignoring any snapshot value
          // from a sibling field sharing the key) so an "all" scope is not
          // narrowed.
          if (spec.type === "uploads") {
            resolvedInputs[spec.key] = [];
          } else {
            const runVal = scopeCoversType(def.scope, spec.type) ? "" : fieldValues[binding.fieldKey] ?? "";
            resolvedInputs[spec.key] = applyWorkflowScope(spec.type, runVal, def.scope);
          }
        } else if (binding.source === "step") {
          if (failedSteps.has(binding.stepIndex)) {
            const failedDef = stepLookup(expanded.steps[binding.stepIndex]?.type ?? "");
            const dependsOnDisabled = disabledTopIndices.has(expanded.topIndices[binding.stepIndex]);
            throw new Error(
              dependsOnDisabled
                ? `Skipped - depends on step ${binding.stepIndex + 1} ("${failedDef?.name ?? "unknown step"}"), which is disabled.`
                : `Skipped - depends on step ${binding.stepIndex + 1} ("${failedDef?.name ?? "unknown step"}"), which failed.`
            );
          }
          const output = stepOutputs[binding.stepIndex]?.[binding.outputKey];
          if (output === undefined) {
            throw new Error(`Missing output from step ${binding.stepIndex + 1}.`);
          }
          resolvedInputs[spec.key] = output;
        } else if (binding.source === "literal") {
          resolvedInputs[spec.key] = binding.value;
        }

        // Expand a scopeable input's "*" (all) sentinel into a concrete
        // newline-joined list so the action always receives a real list.
        // Canvas-course "*" enumerates the workflow's scoped institution when
        // set (falling back to the run's institution).
        if (isScopeableListType(spec.type) && typeof resolvedInputs[spec.key] === "string") {
          const scopeInst = applyWorkflowScope("institution", "", def.scope).trim();
          resolvedInputs[spec.key] = await expandScopedValue(
            spec.type,
            resolvedInputs[spec.key] as string,
            { activeInstitution: scopeInst || helpers.activeInstitution }
          );
        }
      }

      const result = await stepDef.run(resolvedInputs, helpers, noopProgress);
      stepOutputs[i] = result.outputs;

      // DEFENSIVE: isHeadlessSafeWorkflow is supposed to keep every
      // requireInput/requireConfirmation step out of an unattended run
      // entirely (see workflows/headless.ts). If one slips through anyway,
      // there is nobody to answer it - never wait, never auto-approve. Record
      // it and stop the ENTIRE run (not just this step's dependents),
      // mirroring what a cancelled pause does in the client's handleRun.
      if (result.requireConfirmation || result.requireInput) {
        outcomes.push({
          index: i,
          type: step.type,
          status: "needs-interaction",
          error: "This step needs interaction it cannot get unattended; the run was stopped.",
          summary: result.summary,
        });
        return { ok: false, steps: outcomes };
      }

      outcomes.push({ index: i, type: step.type, status: "done", error: null, summary: result.summary });
    } catch (err) {
      failedSteps.add(i);
      outcomes.push({
        index: i,
        type: step.type,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        summary: null,
      });
    }
  }

  const genuineFailures = [...failedSteps].filter((i) => !disabledRunIndices.has(i));
  return { ok: genuineFailures.length === 0, steps: outcomes };
}

/**
 * Build the StepRunHelpers the server runner passes to every step, backed by
 * the service-role client + the schedule's own user/institution/provider/
 * author instead of a browser session. Every closure is non-null: unlike the
 * client (where a signed-out state nulls them out), a server run always has
 * a resolved owner and a service-role client, so every headless-safe step's
 * helper dependency is always satisfiable.
 *
 * The functions reused here (saveRecordingFile, uploadCourseZip*,
 * loadCommonResources, loadInstitutionFields, downloadCourseZipBlob) already
 * take a SupabaseClient as an explicit parameter and scope every query to the
 * given userId - passing createServiceClient() here is exactly the same
 * pattern src/lib/supabase/courses.ts already uses internally, just supplied
 * by the caller instead of constructed inline. appendCourseMaterialFileAction
 * / appendCourseExportFileAction / listCourseHubAction are Server Actions
 * that call requireOwner() themselves; called from inside runAsOwner (see
 * owner-context.ts) they resolve via the impersonated owner exactly like the
 * rest of the run.
 */
export function buildServerStepRunHelpers(opts: {
  supabase: SupabaseClient<Database>;
  userId: string;
  institution: string | null;
  provider: LlmProvider;
  author: string;
}): StepRunHelpers {
  const { supabase, userId, institution, provider, author } = opts;

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
    saveCourseExportFile: async (courseId, blob, fileName) => {
      const { path, parts } = await uploadCourseZipChunked(supabase, userId, courseId, blob);
      const r = await appendCourseExportFileAction(courseId, {
        name: fileName,
        path,
        size: blob.size,
        ...(parts ? { parts } : {}),
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
    loadCourseExport: async (courseId) => {
      const list = await listCourseHubAction();
      if ("error" in list) throw new Error(list.error);
      const course = list.courses.find((c) => c.id === courseId);
      if (!course || course.exportFiles.length === 0) return null;
      const latest = course.exportFiles.reduce((a, b) => (b.addedAt > a.addedAt ? b : a));
      const blob = await downloadCourseZipBlob(supabase, latest);
      return await parseCartridgeBlob(blob);
    },
  };
}
