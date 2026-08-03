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

import { expandWorkflowDef, applyWorkflowScope, scopeCoversType, type WorkflowDef, type InputBinding } from "@/lib/workflows/types";
import { isScopeableListType, expandScopedValue, resolveClassRepoRef, resolveClassTileRef } from "@/lib/workflows/scope";
import {
  getStepDefinition,
  type StepDefinition,
  type StepRunHelpers,
  type StepRunSummary,
} from "@/lib/workflows/registry";
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
import {
  logStepOutcome,
  createProgressCollector,
  readPartialFailureDetail,
  readSavedZipRef,
  collectSavedZipRefs,
  type RunLogContext,
  type SavedCourseZipRef,
} from "@/lib/workflows/run-logging";
import { completeCourseZipRunLogs } from "@/lib/workflows/zip-run-log-completion";
import { joinStepErrorDetail } from "@/lib/workflows/run-detail";

// buildServerStepRunHelpers now lives in server-runner-helpers.ts (split out
// to stay under this project's 1000-line cap - see that file's own header
// comment). Re-exported here so every existing caller (the cron route, the
// run-now route, the webhook route, the triggers route,
// workflow-trigger-runner.ts, and their tests) keeps importing it from this
// same module path, unchanged.
export { buildServerStepRunHelpers } from "./server-runner-helpers";

export interface StepRunOutcome {
  index: number;
  type: string;
  status: "done" | "error" | "disabled" | "needs-interaction" | "skipped";
  error: string | null;
  summary: StepRunSummary | null;
  institution?: string;
  courseId?: string;
  /** U9-AC1: set only for a completed ("done") "save-zip-to-course" outcome
   * - the exact course id + file name it wrote (see
   * run-logging.ts's SAVED_ZIP_OUTPUT_KEY), read off the step's own raw
   * outputs bag so the post-run completion stage below can find that exact
   * saved file. Undefined for every other step/outcome. */
  savedZip?: SavedCourseZipRef;
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

/**
 * Deliverable-resilience pass-through (StepDefinition.passThroughOnFailure,
 * registry-helpers.ts - see its own doc comment for the full feature). Given
 * a failed step's declared mapping, its OWN bindings, the set of steps that
 * have already genuinely failed, and every step's outputs so far, resolves
 * which of the failed step's outputs can be salvaged from an
 * already-succeeded upstream step - and returns them, so the run loop's
 * catch branch can publish them as this step's own output instead of leaving
 * it undefined for every dependent.
 *
 * Resolved from each mapped input's BINDING, not from the step's own
 * resolvedInputs bag: resolvedInputs is filled in stepDef.inputs DECLARATION
 * ORDER, so whether the mapped input was already resolved at throw time
 * depends on where it happens to sit in that particular step's input list -
 * relying on that would work by accident today and break the first time an
 * input list gets reordered. The binding itself is stable regardless of when
 * the throw happened (a binding-resolution failure for a DIFFERENT input, or
 * a throw from inside stepDef.run() itself after every input resolved).
 *
 * Pure (no closures, every dependency an explicit parameter) and exported
 * specifically so it is unit-testable on its own, and so
 * pass-through-parity.test.ts can prove useWorkflowRun.ts's own copy of this
 * exact algorithm (the attended run loop) resolves every scenario IDENTICALLY
 * to this one, without needing to render that hook (this repo's vitest setup
 * has no jsdom/React Testing Library - see that test file's own header).
 * The two run loops otherwise share no code (server-runner.ts must stay
 * free of client-only/DOM code - see this file's own header - and
 * useWorkflowRun.ts is "use client"), so this parity is proven by comparison
 * against two independent implementations, not by one loop calling the
 * other's code.
 */
export function resolvePassThroughOutputs(
  passThroughOnFailure: Record<string, string> | undefined,
  bindings: Record<string, InputBinding>,
  failedSteps: ReadonlySet<number>,
  stepOutputs: ReadonlyArray<Record<string, unknown> | undefined>
): { passedThrough: boolean; outputs: Record<string, unknown> } {
  const outputs: Record<string, unknown> = {};
  let passedThrough = false;
  if (!passThroughOnFailure) {
    return { passedThrough, outputs };
  }
  for (const [outputKey, inputKey] of Object.entries(passThroughOnFailure)) {
    const binding = bindings[inputKey];
    if (!binding || binding.source !== "step") continue;
    // The step this input binds to must itself have genuinely succeeded (or
    // itself passed through - a passed-through step is deliberately never
    // added to failedSteps, which is exactly what makes ITS OWN output
    // resolvable here) - never salvage a value out of a step that never
    // actually produced one.
    if (failedSteps.has(binding.stepIndex)) continue;
    const value = stepOutputs[binding.stepIndex]?.[binding.outputKey];
    if (value === undefined) continue;
    outputs[outputKey] = value;
    passedThrough = true;
  }
  return { passedThrough, outputs };
}

async function runExpandedBodyOnce(opts: {
  def: WorkflowDef;
  resolveWorkflow: (id: string) => WorkflowDef | undefined;
  fieldValues: Record<string, string>;
  disabledTopIndices: Set<number>;
  helpers: StepRunHelpers;
  stepLookup: (type: string) => StepDefinition | undefined;
  filterHubByInstitution: boolean;
  /** When set, every step outcome from this body invocation is persisted via
   * recordRunStep AS the loop proceeds (never batched at the end) - see
   * run-logging.ts. Absent when the caller has no run-log context (e.g. a
   * test that does not set one up), in which case logging is simply skipped. */
  runLog?: RunLogContext;
  /** Tag attached to every step row logged from this body invocation - the
   * group's institution/courseId for one fan-out iteration, undefined for a
   * non-fan-out (single) run. */
  institution?: string;
  courseId?: string;
  /** The course tile's human name for this fan-out iteration (paired with
   * courseId above) - undefined outside a course fan-out. Threaded straight
   * through to logStepOutcome so buildRunLogText never has to render a bare
   * course UUID when the caller already knows the name. */
  courseName?: string;
}): Promise<{ steps: StepRunOutcome[]; ok: boolean }> {
  const { def, resolveWorkflow, fieldValues, disabledTopIndices, helpers, stepLookup, filterHubByInstitution, runLog, institution, courseId, courseName } = opts;

  // Compact per-step logger bound to this body invocation's fan-out tag
  // (institution/courseId/courseName) - every push into `outcomes` below is
  // paired with exactly one call to this, so a step row is written the
  // moment that step's own outcome is known, never after the whole run (or
  // even the whole fan-out group) finishes.
  const logStep = (
    outcome: StepRunOutcome,
    timing: { startedAt: string; finishedAt: string },
    progress: string[],
    inputs?: Record<string, unknown> | null
  ) =>
    logStepOutcome(
      runLog,
      { ...outcome, institution: outcome.institution ?? institution, courseId: outcome.courseId ?? courseId, courseName },
      timing,
      progress,
      inputs
    );

  let expanded: ReturnType<typeof expandWorkflowDef>;
  try {
    expanded = expandWorkflowDef(def, resolveWorkflow);
  } catch (err) {
    const outcome: StepRunOutcome = {
      index: -1,
      type: def.id,
      status: "error",
      error: `Could not expand the workflow: ${err instanceof Error ? err.message : String(err)}`,
      summary: null,
    };
    const now = new Date().toISOString();
    await logStep(outcome, { startedAt: now, finishedAt: now }, []);
    return { ok: false, steps: [outcome] };
  }

  const stepOutputs: Array<Record<string, unknown>> = [];
  const failedSteps = new Set<number>();
  const disabledRunIndices = new Set<number>();
  const skippedRunIndices = new Set<number>();
  // Deliverable-resilience pass-through (StepDefinition.passThroughOnFailure,
  // registry-helpers.ts): indices whose thrown failure was absorbed via that
  // field rather than cascaded - deliberately kept OUT of failedSteps (that
  // is what stops the cascade to dependents bound to the pass-through
  // output), but tracked here so `ok` below still reflects the real failure.
  // A run that lost a deliverable must not report clean.
  const passThroughFailures = new Set<number>();
  const outcomes: StepRunOutcome[] = [];

  for (let i = 0; i < expanded.steps.length; i++) {
    const step = expanded.steps[i];
    // One consistent clock for this step's timing, captured before the
    // disabled/runIf/cascade checks so even a step that never actually runs
    // gets a (near-zero) duration rather than none at all.
    const startedAt = new Date().toISOString();

    // A step whose top-level index is disabled never runs; dependents cascade
    // through the same failedSteps mechanism a genuine error uses, but this
    // is not itself a failure (see disabledRunIndices / WorkflowRunSummary.ok).
    if (disabledTopIndices.has(expanded.topIndices[i])) {
      failedSteps.add(i);
      disabledRunIndices.add(i);
      const outcome: StepRunOutcome = { index: i, type: step.type, status: "disabled", error: null, summary: null };
      outcomes.push(outcome);
      await logStep(outcome, { startedAt, finishedAt: new Date().toISOString() }, []);
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
        const outcome: StepRunOutcome = { index: i, type: step.type, status: "skipped", error: null, summary: null };
        outcomes.push(outcome);
        await logStep(outcome, { startedAt, finishedAt: new Date().toISOString() }, []);
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
      const outcome: StepRunOutcome = { index: i, type: step.type, status: "skipped", error: null, summary: null };
      outcomes.push(outcome);
      await logStep(outcome, { startedAt, finishedAt: new Date().toISOString() }, []);
      continue;
    }

    const stepDef = stepLookup(step.type);
    // Fresh collector per step - capped at MAX_PROGRESS_MESSAGES_PER_STEP
    // (see run-logging.ts) so a chatty step cannot bloat its log row. This
    // REPLACES the old noopProgress: every onProgress call a step module
    // makes (registry.ts's ~45 step modules) is now captured, where an
    // unattended run previously discarded every one of them.
    const collector = createProgressCollector();
    // Declared OUTSIDE the try block (not `const` inside it, as before) so
    // the catch branch below can also log it: a binding-resolution failure
    // ("Missing output from step N", a dependency error) throws PARTWAY
    // through the loop that fills this object, and what it managed to
    // resolve before the throw is itself diagnostic (AC1 - this is
    // literally the "Repository input resolved to empty" failure mode this
    // feature exists to catch). Reset to {} per step, same as before.
    let resolvedInputs: Record<string, unknown> = {};

    try {
      if (!stepDef) {
        throw new Error(`Unknown step type "${step.type}".`);
      }

      resolvedInputs = {};
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

      const result = await stepDef.run(resolvedInputs, helpers, collector.onProgress);
      stepOutputs[i] = result.outputs;

      // DEFENSIVE: isHeadlessSafeWorkflow is supposed to keep every
      // requireInput/requireConfirmation step out of an unattended run
      // entirely (see workflows/headless.ts). If one slips through anyway,
      // there is nobody to answer it - never wait, never auto-approve. Record
      // it and stop the ENTIRE run (not just this step's dependents),
      // mirroring what a cancelled pause does in the client's handleRun.
      if (result.requireConfirmation || result.requireInput) {
        const outcome: StepRunOutcome = {
          index: i,
          type: step.type,
          status: "needs-interaction",
          error: "This step needs interaction it cannot get unattended; the run was stopped.",
          summary: result.summary,
        };
        outcomes.push(outcome);
        await logStep(outcome, { startedAt, finishedAt: new Date().toISOString() }, collector.messages, resolvedInputs);
        return { ok: false, steps: outcomes };
      }

      // U7-AC2: a step's OWN outputs bag may carry PARTIAL_FAILURE_OUTPUT_KEY
      // (run-logging.ts) to say "I completed, but some of my own units of
      // work failed" - reading it into `error` here (status stays "done",
      // exactly as RCA19 requires - dependents still see this step as having
      // succeeded) is what lets the log render it distinctly instead of an
      // indistinguishable bare "done, error: null".
      //
      // U9-AC1: the same outputs bag may separately carry SAVED_ZIP_OUTPUT_KEY
      // (a "save-zip-to-course" step publishing what it saved) - read here
      // too so it survives on the outcome all the way out to
      // runWorkflowUnattended's post-run completion stage below.
      const outcome: StepRunOutcome = {
        index: i,
        type: step.type,
        status: "done",
        error: readPartialFailureDetail(result.outputs),
        summary: result.summary,
        savedZip: readSavedZipRef(result.outputs) ?? undefined,
      };
      outcomes.push(outcome);
      await logStep(outcome, { startedAt, finishedAt: new Date().toISOString() }, collector.messages, resolvedInputs);
    } catch (err) {
      // Deliverable-resilience pass-through - see resolvePassThroughOutputs'
      // own doc comment (above) for the full reasoning.
      const { passedThrough, outputs: passThroughOutputs } = resolvePassThroughOutputs(
        stepDef?.passThroughOnFailure,
        step.bindings,
        failedSteps,
        stepOutputs
      );
      if (passedThrough) {
        stepOutputs[i] = passThroughOutputs;
        passThroughFailures.add(i);
      } else {
        // A step that passed through is deliberately NOT added to
        // failedSteps: that is what lets a dependent bound to its
        // pass-through output resolve normally below instead of cascading
        // "which failed" through every later step in the chain.
        // passThroughFailures (above) is what keeps the run's own `ok`
        // honest about this still being a real failure.
        failedSteps.add(i);
      }
      const outcome: StepRunOutcome = {
        index: i,
        type: step.type,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        summary: null,
      };
      outcomes.push(outcome);
      await logStep(outcome, { startedAt, finishedAt: new Date().toISOString() }, collector.messages, resolvedInputs);
    }
  }

  return { ok: isRunOk(failedSteps, disabledRunIndices, skippedRunIndices, passThroughFailures), steps: outcomes };
}

/**
 * Whether a run body's step outcomes add up to "ok": no step genuinely
 * failed (a disabled or gate-skipped step does not count - see
 * disabledRunIndices/skippedRunIndices at every call site) AND no step
 * passed through a failure (StepDefinition.passThroughOnFailure /
 * resolvePassThroughOutputs above). A pass-through failure is deliberately
 * never added to `failedSteps` (that is what stops it from cascading to
 * dependents), so without the second condition this would report a run
 * clean even though a generator genuinely failed - a run that lost a
 * deliverable must not report ok. Exported (alongside
 * resolvePassThroughOutputs) so pass-through-parity.test.ts can prove this
 * agrees with useWorkflowRun.ts's own isGroupGenuineFailure, which encodes
 * the same semantics inverted (that loop tracks "genuine failure", this one
 * tracks "ok") for its own attended-loop reasons.
 */
export function isRunOk(
  failedSteps: ReadonlySet<number>,
  disabledRunIndices: ReadonlySet<number>,
  skippedRunIndices: ReadonlySet<number>,
  passThroughFailures: ReadonlySet<number>
): boolean {
  const genuineFailures = [...failedSteps].filter(
    (i) => !disabledRunIndices.has(i) && !skippedRunIndices.has(i)
  );
  return genuineFailures.length === 0 && passThroughFailures.size === 0;
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
  /** When set, every step this run executes (across every fan-out group) is
   * persisted via recordRunStep as it completes - see run-logging.ts. The
   * caller is responsible for the run-level startWorkflowRun/finishWorkflowRun
   * pair; this only drives the per-step rows in between. Absent -> no
   * per-step logging (e.g. in tests that do not set up a run-log context). */
  runLog?: RunLogContext;
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
          institution: groupInstitution,
          courseId: course.id,
          courseName: course.name,
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
          institution: acronym,
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
          courseId: course.id,
          courseName: course.name,
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

  // U9: this is the existing post-run seam (beside saveRunReport just above,
  // rather than a new lifecycle hook) that completes the embedded run log of
  // any course zip(s) "save-zip-to-course" saved during this run - U8 can
  // only ever embed a SNAPSHOT (that step is not the run's last one), and
  // this is what upgrades the SAVED copy (never the browser download the
  // step already produced attended-side - that local copy cannot be updated
  // after the fact, see U9-AC7 and the step's own SNAPSHOT NOTICE header) to
  // the complete log once every later step has actually run.
  //
  // U9-AC3: this runs for a FAILED run too - never gated on `ok` - since a
  // failed run is exactly when the complete log matters most.
  //
  // U9-AC4: never allowed to cost the run anything. completeCourseZipRunLogs
  // itself never throws (every failure - per zip or in building the log text
  // - is caught and returned as a result, not raised), and this is wrapped in
  // its own try/catch anyway, matching the defensive style saveRunReport
  // above already uses, so a defect in this best-effort addition can never
  // reach the caller as a rejected promise.
  //
  // Skipped for a truncated fan-out, for the SAME reason saveRunReport is
  // skipped just above: a truncated tick means institutions/courses remain
  // queued for a LATER cron tick, so this run has not actually finished from
  // the caller's point of view yet. Completing "the" log now would freeze it
  // as complete while steps for the remaining institutions/courses are still
  // to come - exactly the dishonesty U8/U9 exist to fix. A later tick that
  // finishes the fan-out runs this stage again then, against the real,
  // complete step list.
  // C3: the embedded log's own Detail: section used to come out empty on
  // every run, deterministically - buildCompleteRunLogText (zip-run-log-
  // completion.ts) inherited run.detail verbatim from the stored row, and
  // that column is written ONLY by finishWorkflowRun, which every caller of
  // runWorkflowUnattended (the cron route, the run-now route, the webhook
  // route, the triggers route) calls strictly AFTER this function returns -
  // never before, so the row read here always still says "no detail",
  // regardless of timing. Rather than reorder finishWorkflowRun earlier
  // (which would mean writing the run's terminal status/counts to the DB
  // before this stage - and everything downstream of it - has actually
  // finished), this computes the SAME "ok ? '' : joinStepErrorDetail(steps)"
  // text every one of those callers independently computes for their own
  // finishWorkflowRun call in the non-truncated-fan-out case this branch is
  // already gated on, and hands it straight through as an explicit override
  // - so the embedded copy matches the DB row instead of guessing at it.
  if (opts.runLog && !(fanoutInfo && fanoutInfo.truncated)) {
    const savedZipRefs = collectSavedZipRefs(steps);
    if (savedZipRefs.length > 0) {
      try {
        const detail = ok ? "" : joinStepErrorDetail(steps);
        await completeCourseZipRunLogs(opts.runLog.supabase, opts.runLog.userId, opts.runLog.runId, ok, savedZipRefs, detail);
      } catch {
        // ignore - see the AC4 note above: this can never cost the run.
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
