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
import { isScopeableListType, expandScopedValue, resolveClassRepoRef, resolveClassTileRef } from "@/lib/workflows/scope";
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
import {
  isInstitutionFanout,
  isCourseFanout,
  isComposedFanout,
  scopeForInstitution,
  scopeForCourse,
  resolveFanoutInstitutions,
  resolveFanoutCourses,
  composedGroupLabel,
} from "@/lib/workflows/fanout";

export interface StepRunOutcome {
  index: number;
  type: string;
  status: "done" | "error" | "disabled" | "needs-interaction" | "skipped";
  error: string | null;
  summary: StepRunSummary | null;
  institution?: string;
  courseId?: string;
}

export interface InstitutionGroupOutcome {
  institution: string;
  steps: StepRunOutcome[];
  ok: boolean;
}

export interface CourseGroupOutcome {
  courseId: string;
  courseName: string;
  /** The course tile's own institution (composed fan-out only - institution "*"
   * combined with course multiplicity; see isComposedFanout). Undefined for a
   * plain course fan-out, where the run's institution isn't fanned out. Empty
   * string means an institution-less tile, pinned to "" (unset) per tile. */
  institution?: string;
  steps: StepRunOutcome[];
  ok: boolean;
}

export interface WorkflowRunSummary {
  ok: boolean;
  /** False when any step genuinely errored, unexpectedly needed interaction,
   * or could not run because a step it depends on was disabled. Only a
   * step's OWN disabled status is exempted from counting against this - a
   * disabled step with no enabled dependents leaves `ok: true` (mirrors
   * handleRun's disabledRunIndices distinction). */
  steps: StepRunOutcome[];
  groups?: InstitutionGroupOutcome[] | CourseGroupOutcome[];
  /** Fan-out progress for the caller (cron route) to decide resume vs finish.
   * Present only for a checkpointed fan-out (institution or course) run. */
  fanout?: { total: number; ranThisTick: string[]; remaining: string[]; truncated: boolean };
}

async function runExpandedBodyOnce(opts: {
  def: WorkflowDef;
  resolveWorkflow: (id: string) => WorkflowDef | undefined;
  fieldValues: Record<string, string>;
  disabledTopIndices: Set<number>;
  helpers: StepRunHelpers;
  stepLookup: (type: string) => StepDefinition | undefined;
  filterHubByInstitution: boolean;
}): Promise<{ steps: StepRunOutcome[]; ok: boolean }> {
  const { def, resolveWorkflow, fieldValues, disabledTopIndices, helpers, stepLookup, filterHubByInstitution } = opts;

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
  const skippedRunIndices = new Set<number>();
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

    // "Run only if": a gated step whose condition is not met (or whose gating
    // step failed) is skipped - dependents cascade through failedSteps like a
    // disabled step, and it is not itself a failure.
    if (step.runIf) {
      const cond = step.runIf;
      let condVal: unknown = "";
      let gateUnavailable = false;
      if (cond.binding.source === "step") {
        if (failedSteps.has(cond.binding.stepIndex)) gateUnavailable = true;
        else condVal = stepOutputs[cond.binding.stepIndex]?.[cond.binding.outputKey];
      } else if (cond.binding.source === "literal") {
        condVal = cond.binding.value;
      } else if (cond.binding.source === "runtime") {
        condVal = fieldValues[cond.binding.fieldKey] ?? "";
      }
      const v = String(condVal).trim().toLowerCase();
      const truthy = v !== "" && v !== "0" && v !== "false";
      if (gateUnavailable || truthy !== cond.expected) {
        failedSteps.add(i);
        skippedRunIndices.add(i);
        outcomes.push({ index: i, type: step.type, status: "skipped", error: null, summary: null });
        continue;
      }
    }

    // A step that consumes a gated-off (skipped) step's output is itself skipped
    // cleanly - the skip cascades transitively. (Disabled / genuinely-failed
    // dependencies still error via the binding-resolution branch below.)
    if (
      Object.values(step.bindings).some(
        (b) => b.source === "step" && skippedRunIndices.has(b.stepIndex)
      )
    ) {
      failedSteps.add(i);
      skippedRunIndices.add(i);
      outcomes.push({ index: i, type: step.type, status: "skipped", error: null, summary: null });
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
        if (!binding) {
          // An input with NO binding (a workflow authored before the step
          // gained this input) is still filled by the workflow scope when the
          // scope covers its family - otherwise a scope-level target (e.g.
          // "Modules ahead") silently never reaches preset steps.
          if (scopeCoversType(def.scope, spec.type)) {
            resolvedInputs[spec.key] = applyWorkflowScope(spec.type, "", def.scope);
          }
          continue;
        }

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
            { activeInstitution: scopeInst || helpers.activeInstitution, filterHubByInstitution }
          );
        }

        // A "@class-repo" reference resolves a repo input to a course tile's
        // linked class repository (the workflow-scoped tile by default, or a
        // specific picked tile). Non-references pass through unchanged.
        if (spec.type === "repo" && typeof resolvedInputs[spec.key] === "string") {
          resolvedInputs[spec.key] = await resolveClassRepoRef(resolvedInputs[spec.key] as string, def.scope);
        }

        // A "@class-tile" reference fills an input from the scoped/picked course
        // tile's matching field (lmsCourse/date/institution). Non-references pass through.
        if (
          (spec.type === "lmsCourse" || spec.type === "date" || spec.type === "institution") &&
          typeof resolvedInputs[spec.key] === "string"
        ) {
          resolvedInputs[spec.key] = await resolveClassTileRef(resolvedInputs[spec.key] as string, def.scope, spec.type);
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

  const genuineFailures = [...failedSteps].filter(
    (i) => !disabledRunIndices.has(i) && !skippedRunIndices.has(i)
  );
  return { ok: genuineFailures.length === 0, steps: outcomes };
}

/**
 * Run `def` end-to-end with no pauses. `disabledTopIndices` mirrors the
 * client's per-workflow disabled-step overlay (see workflows/types.ts
 * saveDisabledSteps) at the TOP-LEVEL step index space (expandWorkflowDef's
 * topIndices) - the same space handleRun reads it in.
 *
 * When a workflow's scope is `institution: "*"`, runs the workflow body once
 * per configured institution, pinning the scope + active institution each
 * iteration, and aggregates results into labeled groups. When the scope also
 * targets multiple course tiles (a composed fan-out - see isComposedFanout),
 * it instead runs once per resolved course tile, pinning each group's
 * institution from the tile's own institution (scopeForInstitution(
 * scopeForCourse(...))) - see the composed branch below. Non-fan-out runs
 * execute once as before.
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
  /** Optional soft deadline (Date.now() ms). When a fan-out passes it, the
   * remaining institutions are recorded as skipped instead of started, so the
   * unattended run stays inside its time budget and resumes next tick. */
  deadlineMs?: number;
  /** Institution fan-out checkpointing (unattended schedule runs only). When
   * provided, the fan-out skips `skipInstitutions` and, after EACH institution's
   * body finishes, calls `onInstitutionDone` so progress survives a later kill.
   * If `onInstitutionDone` resolves false (checkpoint lost) the fan-out stops.
   * Absent -> current behavior (no checkpoint; the deadline marks the rest errored). */
  skipInstitutions?: Set<string>;
  onInstitutionDone?: (acronym: string, ok: boolean) => Promise<boolean>;
  /** Course fan-out checkpointing (unattended schedule runs only). */
  skipCourses?: Set<string>;
  onCourseDone?: (tileId: string, ok: boolean) => Promise<boolean>;
}): Promise<WorkflowRunSummary> {
  const { def, helpers } = opts;
  const stepLookup = opts.stepLookup ?? getStepDefinition;

  let ok: boolean;
  let steps: StepRunOutcome[];
  let groups: InstitutionGroupOutcome[] | CourseGroupOutcome[] | undefined;
  let fanoutInfo: WorkflowRunSummary["fanout"];

  const composed = isComposedFanout(def.scope);

  if (composed) {
    // A composed fan-out (institution "*" AND multiple course tiles) is NOT a
    // nested (institution x course) product - a course tile belongs to exactly
    // one institution, so this collapses to a single course-dimension fan-out
    // with each group's institution derived from the tile itself. Reuses the
    // SAME per-course group loop (CourseGroupOutcome shape, doneCourses
    // checkpointing, countOkCourses progress semantics) as a plain course
    // fan-out - only the scope/helpers pinning per iteration differs.
    const resolved = await resolveFanoutCourses(def.scope, null);
    if ("error" in resolved) {
      ok = false;
      steps = [{ index: -1, type: def.id, status: "error", error: `Could not list course tiles: ${resolved.error}`, summary: null }];
    } else if (resolved.list.length === 0) {
      ok = false;
      steps = [{ index: -1, type: def.id, status: "error", error: "The scope matched no course tiles.", summary: null }];
    } else {
      const checkpointing = opts.onCourseDone !== undefined;
      const skip = opts.skipCourses ?? new Set<string>();
      const courseGroups: CourseGroupOutcome[] = [];
      const ranThisTick: string[] = [];
      for (const course of resolved.list) {
        if (skip.has(course.id)) continue;

        if (opts.deadlineMs !== undefined && Date.now() > opts.deadlineMs) {
          if (checkpointing) continue;
          courseGroups.push({
            courseId: course.id,
            courseName: course.name,
            institution: course.institution ?? "",
            ok: false,
            steps: [{ index: -1, type: def.id, status: "error", error: "Skipped - run time budget reached this tick.", summary: null, courseId: course.id }],
          });
          continue;
        }

        // Pin BOTH dimensions per AC1's design: scopeForInstitution(
        // scopeForCourse(scope, tile.id), tile.institution ?? ""). An
        // institution-less tile pins to "" (unset) rather than staying "*" -
        // its scoped institution inputs then resolve as unset, same as a
        // single run on such a tile.
        const groupInstitution = course.institution ?? "";
        const scopedDef: WorkflowDef = {
          ...def,
          scope: scopeForInstitution(scopeForCourse(def.scope!, course.id), groupInstitution),
        };
        const scopedHelpers: StepRunHelpers = { ...helpers, activeInstitution: course.institution ?? null };
        const out = await runExpandedBodyOnce({
          ...opts,
          def: scopedDef,
          helpers: scopedHelpers,
          stepLookup,
          filterHubByInstitution: true,
        });
        courseGroups.push({ courseId: course.id, courseName: course.name, institution: groupInstitution, steps: out.steps, ok: out.ok });
        ranThisTick.push(course.id);

        if (checkpointing) {
          const kept = await opts.onCourseDone!(course.id, out.ok);
          if (!kept) break;
        }
      }
      ok = courseGroups.every((g) => g.ok);
      steps = courseGroups.flatMap((g) =>
        g.steps.map((s) => ({ ...s, courseId: s.courseId ?? g.courseId, institution: s.institution ?? g.institution }))
      );
      groups = courseGroups;
      if (checkpointing) {
        const done = new Set([...skip, ...ranThisTick]);
        const remaining = resolved.list.filter((c) => !done.has(c.id));
        fanoutInfo = { total: resolved.list.length, ranThisTick, remaining: remaining.map((c) => c.id), truncated: remaining.length > 0 };
      }
    }
  } else if (!isInstitutionFanout(def.scope) && !isCourseFanout(def.scope)) {
    const out = await runExpandedBodyOnce({ ...opts, stepLookup, filterHubByInstitution: false });
    ok = out.ok;
    steps = out.steps;
  } else if (isInstitutionFanout(def.scope)) {
    const resolved = await resolveFanoutInstitutions();
    if ("error" in resolved) {
      ok = false;
      steps = [{ index: -1, type: def.id, status: "error", error: `Could not list institutions: ${resolved.error}`, summary: null }];
    } else if (resolved.list.length === 0) {
      ok = false;
      steps = [{ index: -1, type: def.id, status: "error", error: "No institutions are configured on the server.", summary: null }];
    } else {
      const checkpointing = opts.onInstitutionDone !== undefined;
      const skip = opts.skipInstitutions ?? new Set<string>();
      groups = [];
      const ranThisTick: string[] = [];
      for (const acronym of resolved.list) {
        if (skip.has(acronym)) continue; // already done in an earlier tick of this occurrence

        if (opts.deadlineMs !== undefined && Date.now() > opts.deadlineMs) {
          if (checkpointing) continue; // resume path: leave the remainder for the next tick, no error row
          (groups as InstitutionGroupOutcome[]).push({
            institution: acronym,
            ok: false,
            steps: [{ index: -1, type: def.id, status: "error", error: "Skipped - run time budget reached this tick.", summary: null, institution: acronym }],
          });
          continue;
        }

        const scopedDef: WorkflowDef = { ...def, scope: scopeForInstitution(def.scope!, acronym) };
        const scopedHelpers: StepRunHelpers = { ...helpers, activeInstitution: acronym };
        const out = await runExpandedBodyOnce({
          ...opts,
          def: scopedDef,
          helpers: scopedHelpers,
          stepLookup,
          filterHubByInstitution: true,
        });
        (groups as InstitutionGroupOutcome[]).push({ institution: acronym, steps: out.steps, ok: out.ok });
        ranThisTick.push(acronym);

        if (checkpointing) {
          // Persist BEFORE the next institution starts, so a hard-kill during it
          // still records this one as done. A lost CAS means we no longer own the
          // occurrence - stop.
          const kept = await opts.onInstitutionDone!(acronym, out.ok);
          if (!kept) break;
        }
      }
      ok = groups.every((g) => g.ok);
      steps = (groups as InstitutionGroupOutcome[]).flatMap((g) => g.steps.map((s) => ({ ...s, institution: s.institution ?? g.institution })));
      if (checkpointing) {
        const done = new Set([...skip, ...ranThisTick]);
        const remaining = resolved.list.filter((a) => !done.has(a));
        fanoutInfo = { total: resolved.list.length, ranThisTick, remaining, truncated: remaining.length > 0 };
      }
    }
  } else {
    const resolved = await resolveFanoutCourses(def.scope, helpers.activeInstitution);
    if ("error" in resolved) {
      ok = false;
      steps = [{ index: -1, type: def.id, status: "error", error: `Could not list course tiles: ${resolved.error}`, summary: null }];
    } else if (resolved.list.length === 0) {
      ok = false;
      steps = [{ index: -1, type: def.id, status: "error", error: "The scope matched no course tiles.", summary: null }];
    } else {
      const checkpointing = opts.onCourseDone !== undefined;
      const skip = opts.skipCourses ?? new Set<string>();
      const courseGroups: CourseGroupOutcome[] = [];
      const ranThisTick: string[] = [];
      for (const course of resolved.list) {
        if (skip.has(course.id)) continue;

        if (opts.deadlineMs !== undefined && Date.now() > opts.deadlineMs) {
          if (checkpointing) continue;
          courseGroups.push({
            courseId: course.id,
            courseName: course.name,
            ok: false,
            steps: [{ index: -1, type: def.id, status: "error", error: "Skipped - run time budget reached this tick.", summary: null, courseId: course.id }],
          });
          continue;
        }

        const scopedDef: WorkflowDef = { ...def, scope: scopeForCourse(def.scope!, course.id) };
        const out = await runExpandedBodyOnce({
          ...opts,
          def: scopedDef,
          helpers,
          stepLookup,
          filterHubByInstitution: false,
        });
        courseGroups.push({ courseId: course.id, courseName: course.name, steps: out.steps, ok: out.ok });
        ranThisTick.push(course.id);

        if (checkpointing) {
          const kept = await opts.onCourseDone!(course.id, out.ok);
          if (!kept) break;
        }
      }
      ok = courseGroups.every((g) => g.ok);
      steps = courseGroups.flatMap((g) => g.steps.map((s) => ({ ...s, courseId: s.courseId ?? g.courseId })));
      groups = courseGroups;
      if (checkpointing) {
        const done = new Set([...skip, ...ranThisTick]);
        const remaining = resolved.list.filter((c) => !done.has(c.id));
        fanoutInfo = { total: resolved.list.length, ranThisTick, remaining: remaining.map((c) => c.id), truncated: remaining.length > 0 };
      }
    }
  }

  // Persist the run's text deliverables to the Files tab (best-effort). For a
  // fan-out this is one combined report across every group.
  if (helpers.saveRunReport && !(fanoutInfo && fanoutInfo.truncated)) {
    const courseNames = ((isCourseFanout(def.scope) || composed) && groups)
      ? new Map((groups as CourseGroupOutcome[]).map((g) => [g.courseId, composedGroupLabel(g.courseName, g.institution)]))
      : undefined;
    const markdown = buildRunReportMarkdown(def.name, new Date().toISOString(), steps, (t) => stepLookup(t)?.name ?? t, courseNames);
    if (markdown) {
      try {
        await helpers.saveRunReport(`${def.name} report`, markdown);
      } catch {
        // ignore - the deliverable report is a convenience, not part of the run
      }
    }
  }

  return groups ? { ok, steps, groups, ...(fanoutInfo ? { fanout: fanoutInfo } : {}) } : { ok, steps };
}

/**
 * Build a Markdown report of an unattended run's text deliverables, or null when
 * there is nothing substantive to save. Pure (no I/O, no Date) so it is unit
 * testable; the caller supplies `generatedAt` and a step-name lookup. Only
 * `done` steps with a text/list/link summary contribute; schedule summaries and
 * errored/empty steps are skipped. Institution/course grouping is preserved via
 * optional fields; the report will show the group label when available.
 */
export function buildRunReportMarkdown(
  workflowName: string,
  generatedAt: string,
  outcomes: StepRunOutcome[],
  stepName: (type: string) => string,
  courseNames?: Map<string, string>
): string | null {
  if (outcomes.length === 0) return null;
  const sections: string[] = [];
  for (const o of outcomes) {
    if (o.status !== "done" || !o.summary) continue;
    const s = o.summary;
    let body = "";
    if (s.kind === "text") {
      body = s.text.trim();
    } else if (s.kind === "list") {
      const items = s.items.map((it) => `- ${it}`).join("\n");
      body = `**${s.label}**\n\n${items}`;
    } else if (s.kind === "link") {
      body = `[${s.label}](${s.url})`;
    } else {
      continue;
    }
    if (!body.trim()) continue;
    let groupLabel = "";
    if (o.courseId && courseNames) {
      groupLabel = courseNames.get(o.courseId) || o.courseId;
    } else if (o.institution) {
      groupLabel = o.institution;
    }
    const heading = groupLabel ? `${o.index + 1}. ${stepName(o.type)} (${groupLabel})` : `${o.index + 1}. ${stepName(o.type)}`;
    sections.push(`## ${heading}\n\n${body}`);
  }
  for (const o of outcomes) {
    if (o.status === "error") {
      const heading = o.institution ? `${o.index + 1}. ${stepName(o.type)} - ERROR (${o.institution})` : `${o.index + 1}. ${stepName(o.type)} - ERROR`;
      const body = o.error ?? "(no error message)";
      sections.push(`## ${heading}\n\n${body}`);
    }
  }
  for (const o of outcomes) {
    if (o.status === "needs-interaction") {
      const heading = o.institution ? `${o.index + 1}. ${stepName(o.type)} (${o.institution})` : `${o.index + 1}. ${stepName(o.type)}`;
      sections.push(`## ${heading}\n\nSkipped: requires user interaction`);
    } else if (o.status === "skipped") {
      const heading = o.institution ? `${o.index + 1}. ${stepName(o.type)} (${o.institution})` : `${o.index + 1}. ${stepName(o.type)}`;
      sections.push(`## ${heading}\n\nSkipped: dependency failed`);
    } else if (o.status === "disabled") {
      const heading = o.institution ? `${o.index + 1}. ${stepName(o.type)} (${o.institution})` : `${o.index + 1}. ${stepName(o.type)}`;
      sections.push(`## ${heading}\n\nDisabled by user`);
    }
  }
  if (sections.length === 0) {
    const fallback = outcomes.length === 1 ? "Run produced no output." : `Run completed: ${outcomes.length} step(s); no text deliverables.`;
    return `# ${workflowName}\n\n_Generated ${generatedAt}_\n\n${fallback}\n`;
  }
  return `# ${workflowName}\n\n_Generated ${generatedAt}_\n\n${sections.join("\n\n")}\n`;
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
    workflowId,
    workflowName,
    workflowRunId,
  };
}
