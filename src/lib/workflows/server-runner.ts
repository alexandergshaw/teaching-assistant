// Server-side (unattended/headless) workflow runner: executes a workflow
// with no browser and nobody watching, for the Vercel Cron route. Mirrors the
// client run loop in useWorkflowRun.ts's handleRun - binding resolution,
// disabled-step cascade, dependency-failure cascade - but with NO pauses.
// requireInput/requireConfirmation can never be answered here, so a step
// that unexpectedly asks for one aborts the ENTIRE run instead of hanging
// (see the needs-interaction branch in runExpandedBodyOnce and the `aborted`
// break in every fan-out loop below - D3).
//
// The per-step decision logic itself - binding resolution, the runIf gate,
// the skip cascade, the disabled-step branch, and the pass-through-on-
// failure catch - now lives in run-step-core.ts, shared with
// useWorkflowRun.ts's own run loop. This file owns everything that IS
// genuinely different about running unattended: no pause/resume, the
// fan-out loops with their deadline/checkpoint machinery, and persistence
// via a caller-supplied service-role Supabase client instead of a browser
// session.
//
// This module (and everything it imports) must stay free of client-only
// ("use client") modules and DOM/window access so it can be imported from a
// Route Handler and built for the server. It never constructs its own
// Supabase client - callers (the cron route) pass one in, which is what lets
// buildServerStepRunHelpers below be exercised in tests with a fake client.

import { expandWorkflowDef, type WorkflowDef } from "@/lib/workflows/types";
import {
  getStepDefinition,
  type StepDefinition,
  type StepRunHelpers,
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
} from "@/lib/workflows/run-logging";
import { completeCourseZipRunLogs } from "@/lib/workflows/zip-run-log-completion";
import { joinStepErrorDetail } from "@/lib/workflows/run-detail";
import {
  evaluateStepGate,
  resolveStepInputs,
  resolvePassThroughOutputs,
  isRunOk,
  buildRunReportMarkdown,
  enabledRuntimeFields,
  type StepRunOutcome,
} from "@/lib/workflows/run-step-core";

// buildServerStepRunHelpers now lives in server-runner-helpers.ts (split out
// to stay under this project's 1000-line cap - see that file's own header
// comment). Re-exported here so every existing caller (the cron route, the
// run-now route, the webhook route, the triggers route,
// workflow-trigger-runner.ts, and their tests) keeps importing it from this
// same module path, unchanged.
export { buildServerStepRunHelpers } from "./server-runner-helpers";

// D1/D2/D6: these three now have exactly ONE implementation each, shared
// with useWorkflowRun.ts - see run-step-core.ts. Re-exported under their
// original names so every existing import site (pass-through-on-failure.
// test.ts, server-runner.test.ts, and any other caller of
// "./server-runner") keeps resolving unchanged.
export { resolvePassThroughOutputs, isRunOk, buildRunReportMarkdown };
export type { StepRunOutcome };

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
}): Promise<{ steps: StepRunOutcome[]; ok: boolean; aborted?: boolean }> {
  const { def, resolveWorkflow, fieldValues, disabledTopIndices, helpers, stepLookup, runLog, institution, courseId, courseName } = opts;

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

  // D4: the runtime fields this body's ENABLED steps currently collect - fed
  // to evaluateStepGate below so a runIf condition bound to a hidden runtime
  // field cannot gate a step using a stale, suppressed value (see
  // enabledRuntimeFields' own doc comment, run-step-core.ts).
  const runtimeFields = enabledRuntimeFields(def, expanded.steps, expanded.topIndices, disabledTopIndices, stepLookup);

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

    const gate = evaluateStepGate({
      step,
      topIndex: expanded.topIndices[i],
      disabledTopIndices,
      failedSteps,
      skippedRunIndices,
      stepOutputs,
      fieldValues,
      runtimeFields,
    });

    if (gate === "disabled" || gate === "skipped") {
      failedSteps.add(i);
      (gate === "disabled" ? disabledRunIndices : skippedRunIndices).add(i);
      const outcome: StepRunOutcome = { index: i, type: step.type, status: gate, error: null, summary: null };
      outcomes.push(outcome);
      await logStep(outcome, { startedAt, finishedAt: new Date().toISOString() }, []);
      continue;
    }

    const stepDef = stepLookup(step.type);
    // Fresh collector per step - capped at MAX_PROGRESS_MESSAGES_PER_STEP
    // (see run-logging.ts) so a chatty step cannot bloat its log row.
    const collector = createProgressCollector();
    // Declared OUTSIDE the try block so the catch branch below can also log
    // it: a binding-resolution failure ("Missing output from step N", a
    // dependency error) throws PARTWAY through resolveStepInputs, and what
    // it managed to resolve before the throw is itself diagnostic (AC1 -
    // this is literally the "Repository input resolved to empty" failure
    // mode this feature exists to catch). resolveStepInputs mutates this
    // object in place for exactly that reason - see its own doc comment.
    const resolvedInputs: Record<string, unknown> = {};

    try {
      await resolveStepInputs(
        {
          step,
          stepDef,
          scope: def.scope,
          fieldValues,
          // An unattended run never has file uploads (uploads are never
          // snapshotted into a schedule) - {} resolves every uploads-type
          // binding to [] exactly like a client run whose uploadFiles state
          // was never populated.
          uploadFiles: {},
          failedSteps,
          stepOutputs,
          expandedSteps: expanded.steps,
          expandedTopIndices: expanded.topIndices,
          disabledTopIndices,
          stepLookup,
          activeInstitution: helpers.activeInstitution,
        },
        resolvedInputs
      );

      // resolveStepInputs already threw "Unknown step type" above when
      // stepDef was undefined, so it is guaranteed defined past this point.
      const result = await stepDef!.run(resolvedInputs, helpers, collector.onProgress);
      stepOutputs[i] = result.outputs;

      // DEFENSIVE: isHeadlessSafeWorkflow is supposed to keep every
      // requireInput/requireConfirmation step out of an unattended run
      // entirely (see workflows/headless.ts). If one slips through anyway,
      // there is nobody to answer it - never wait, never auto-approve. Record
      // it and stop the ENTIRE run (not just this fan-out group), mirroring
      // what a cancelled pause does in the client's handleRun - see the
      // `aborted` break in every fan-out loop below (D3).
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
        return { ok: false, steps: outcomes, aborted: true };
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
      // own doc comment (run-step-core.ts) for the full reasoning.
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
 *
 * D3: when a step in ANY fan-out group unexpectedly needs interaction,
 * runExpandedBodyOnce returns `aborted: true` for that group - every fan-out
 * loop below checks that and `break`s, so no LATER institution/course starts
 * (the group that hit it is still recorded, and still checkpointed normally
 * when checkpointing is active, exactly like any other failed group).
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
        // D3: a step in this group unexpectedly needed interaction - stop
        // the whole run, do not start the next course.
        if (out.aborted) break;
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
    const out = await runExpandedBodyOnce({ ...opts, stepLookup });
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
        // D3: a step in this group unexpectedly needed interaction - stop
        // the whole run, do not start the next institution.
        if (out.aborted) break;
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
          courseId: course.id,
          courseName: course.name,
        });
        courseGroups.push({ courseId: course.id, courseName: course.name, steps: out.steps, ok: out.ok });
        ranThisTick.push(course.id);

        if (checkpointing) {
          const kept = await opts.onCourseDone!(course.id, out.ok);
          if (!kept) break;
        }
        // D3: a step in this group unexpectedly needed interaction - stop
        // the whole run, do not start the next course.
        if (out.aborted) break;
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
