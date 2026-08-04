// The shared per-step execution core BOTH workflow run loops call: the
// unattended server runner (server-runner.ts's runExpandedBodyOnce, used by
// the cron route, the run-now route, the webhook route, and the triggers
// route) and the attended in-browser hook (useWorkflowRun.ts's handleRun).
//
// Before this module existed, the two loops each carried their OWN copy of
// this logic - 89 byte-identical lines, plus four behavioral divergences
// nobody had noticed because the attended copy interleaves `setRunState`
// calls into its control flow, which is exactly what made the drift hard to
// spot by eye (a disabled-step branch and a runIf-gate branch that LOOK
// different because one has ten extra UI lines and the other does not).
// Extracting the shared decision logic here - leaving only what genuinely
// differs (persistence backend, pause/resume, deadline/checkpoint
// machinery) in each engine - is what makes the two loops provably the same
// algorithm again, and what finally makes this logic unit-testable at all:
// useWorkflowRun.ts is a React hook and this repo's vitest has no jsdom, so
// its own copy of this logic previously had no executable test.
//
// BROWSER-SAFETY CONSTRAINT: this module is imported by useWorkflowRun.ts,
// which runs in the browser. It may import ONLY from types.ts, scope.ts,
// registry.ts, run-logging.ts, and workflow-field-visibility.ts (all already
// proven browser-safe - useWorkflowRun.ts already imports every one of them
// directly). It must NEVER import, even transitively, "@/lib/supabase/server",
// "@/app/actions/shared", "next/headers", `document`, `window`, or React.
// Importing "@/app/actions" (the "use server" barrel) is fine - scope.ts and
// fanout.ts both already do it from both engines; a "use server" export is
// just an RPC-shaped async function from the caller's point of view.

import {
  applyWorkflowScope,
  scopeCoversType,
  collectRuntimeFields,
  type WorkflowDef,
  type WorkflowScope,
  type WorkflowStepConfig,
  type InputBinding,
  type RuntimeField,
} from "@/lib/workflows/types";
import {
  isScopeableListType,
  expandScopedValue,
  resolveClassRepoRef,
  resolveClassTileRef,
} from "@/lib/workflows/scope";
import { isFieldVisible } from "@/lib/workflow-field-visibility";
import type { StepDefinition, StepRunSummary } from "@/lib/workflows/registry";
import type { SavedCourseZipRef } from "@/lib/workflows/run-logging";

// ---------------------------------------------------------------------------
// Shared outcome shape
// ---------------------------------------------------------------------------

export interface StepRunOutcome {
  index: number;
  type: string;
  status: "done" | "error" | "disabled" | "needs-interaction" | "skipped";
  error: string | null;
  summary: StepRunSummary | null;
  institution?: string;
  courseId?: string;
  /** Set only for a completed ("done") "save-zip-to-course" outcome - the
   * exact course id + file name it wrote (see run-logging.ts's
   * SAVED_ZIP_OUTPUT_KEY). Undefined for every other step/outcome. */
  savedZip?: SavedCourseZipRef;
}

// ---------------------------------------------------------------------------
// D4: which runtime fields are currently live, for both the runIf gate below
// and (in each engine's own binding-resolution loop) the run form's own
// StepInputSpec.visibleWhen suppression.
// ---------------------------------------------------------------------------

/**
 * The runtime fields a workflow's ENABLED (non-disabled) expanded steps
 * collect, exactly as WorkflowsTab.tsx's own `runtimeFields` memo computes
 * it for the run form (`collectRuntimeFields({ ...selectedDef, steps:
 * enabledExpandedSteps }, ...)`) - reproduced here so the unattended runner
 * can build the SAME list without a hook, for evaluateStepGate's own runIf
 * visibility check below (D4). A runIf condition bound to a runtime field
 * (InputBinding `{ source: "runtime", fieldKey }`) carries no StepInputSpec
 * of its own - unlike an ordinary step input, whose spec always carries its
 * own `visibleWhen` - so telling whether ITS field is currently hidden needs
 * this cross-step lookup (collectRuntimeFields' own first-occurrence-wins
 * scan across every step already resolves which step's spec "owns" a given
 * runtime field key).
 */
export function enabledRuntimeFields(
  def: WorkflowDef,
  expandedSteps: WorkflowStepConfig[],
  expandedTopIndices: number[],
  disabledTopIndices: ReadonlySet<number>,
  stepLookup: (type: string) => StepDefinition | undefined
): RuntimeField[] {
  const enabledSteps = expandedSteps.filter((_, i) => !disabledTopIndices.has(expandedTopIndices[i]));
  return collectRuntimeFields({ ...def, steps: enabledSteps }, (type) => stepLookup(type)?.inputs);
}

// ---------------------------------------------------------------------------
// The disabled-step branch, the runIf gate, and the transitive skip cascade.
// ---------------------------------------------------------------------------

export type StepGateAction = "disabled" | "skipped" | "run";

export interface StepGateContext {
  step: WorkflowStepConfig;
  /** expanded.topIndices[i] - the top-level step index disabledTopIndices is
   * keyed on (see expandWorkflowDef). */
  topIndex: number;
  disabledTopIndices: ReadonlySet<number>;
  /** Every step index that has failed, been disabled, or been gate-skipped
   * so far this run body - used to detect a runIf condition bound to a step
   * that cannot supply a value ("gate unavailable"). */
  failedSteps: ReadonlySet<number>;
  /** Every step index gate-skipped so far - used for the transitive cascade:
   * a step bound to a skipped step's output is itself skipped. Grows as the
   * caller adds to it after each "skipped" verdict, which is what makes a
   * chain of dependents cascade transitively one step at a time. */
  skippedRunIndices: ReadonlySet<number>;
  stepOutputs: ReadonlyArray<Record<string, unknown> | undefined>;
  fieldValues: Record<string, string>;
  /** D4: the workflow's currently-enabled runtime fields (enabledRuntimeFields
   * above, or the attended engine's own already-computed list) - used only to
   * resolve a runIf condition bound to a runtime field's OWN visibility. */
  runtimeFields: RuntimeField[];
}

/**
 * Decide what should happen to one step, given the run's accumulated state
 * so far: disabled (its top-level index is in disabledTopIndices), skipped
 * (its own runIf condition is not met, or it consumes a gate-skipped step's
 * output), or "run" (none of the above - proceed to resolve its inputs and
 * execute it). Pure: every dependency is an explicit parameter, and nothing
 * is mutated - the caller is responsible for recording the verdict (adding
 * the step's index to its own failedSteps/disabledRunIndices/
 * skippedRunIndices accumulators, pushing an outcome, logging it) exactly as
 * it already did before this was extracted.
 *
 * D4: a runIf condition bound to a runtime field (`source: "runtime"`) that
 * is CURRENTLY HIDDEN (StepInputSpec.visibleWhen, via runtimeFields above)
 * reads as "" here - the same suppression each engine's own binding
 * resolution already applies to a hidden field's value - so a hidden field
 * can never gate a step off using a stale value left over from an earlier
 * choice.
 */
export function evaluateStepGate(ctx: StepGateContext): StepGateAction {
  const { step, topIndex, disabledTopIndices, failedSteps, skippedRunIndices, stepOutputs, fieldValues, runtimeFields } = ctx;

  if (disabledTopIndices.has(topIndex)) {
    return "disabled";
  }

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
      const fieldKey = cond.binding.fieldKey;
      const rtField = runtimeFields.find((f) => f.fieldKey === fieldKey);
      const hidden = !!rtField && !isFieldVisible(rtField, fieldValues);
      condVal = hidden ? "" : fieldValues[fieldKey] ?? "";
    }
    const v = String(condVal).trim().toLowerCase();
    const truthy = v !== "" && v !== "0" && v !== "false";
    if (gateUnavailable || truthy !== cond.expected) {
      return "skipped";
    }
  }

  // A step that consumes a gated-off (skipped) step's output is itself
  // skipped cleanly - the skip cascades transitively as the caller folds
  // each verdict back into skippedRunIndices before the next step is
  // evaluated. (Disabled / genuinely-failed dependencies still error via the
  // binding-resolution throw below, not here - see resolveStepInputs.)
  if (Object.values(step.bindings).some((b) => b.source === "step" && skippedRunIndices.has(b.stepIndex))) {
    return "skipped";
  }

  return "run";
}

// ---------------------------------------------------------------------------
// Binding resolution: runtime / step / literal, scope application, "*"
// expansion, and the @class-repo / @class-tile refs.
// ---------------------------------------------------------------------------

export interface ResolveStepInputsContext {
  step: WorkflowStepConfig;
  stepDef: StepDefinition | undefined;
  scope: WorkflowScope | undefined;
  fieldValues: Record<string, string>;
  /** File uploads keyed by runtime field key. An unattended run has none - it
   * passes {} here, which resolves every uploads-type binding to [] exactly
   * as it always did (uploads are never snapshotted into a schedule). */
  uploadFiles: Record<string, unknown[]>;
  failedSteps: ReadonlySet<number>;
  stepOutputs: ReadonlyArray<Record<string, unknown> | undefined>;
  /** The full expanded step list and its top-index mapping, needed only to
   * name a failed/disabled dependency in the thrown error message. */
  expandedSteps: WorkflowStepConfig[];
  expandedTopIndices: number[];
  disabledTopIndices: ReadonlySet<number>;
  stepLookup: (type: string) => StepDefinition | undefined;
  activeInstitution: string | null;
}

/**
 * Resolve one step's inputs into the plain values bag stepDef.run() expects,
 * mutating `target` in place as each input resolves (rather than building
 * and returning a fresh object) so a throw partway through - a
 * binding-resolution failure for one input while others already resolved -
 * still leaves the caller's own `resolvedInputs` holding whatever it managed
 * before the throw. That partial state is itself diagnostic (a "Repository
 * input resolved to empty" failure mode this shape exists to catch), which
 * is why both engines have always declared `resolvedInputs` OUTSIDE their
 * try block and let the catch branch log it - this function preserves that
 * exact contract instead of hiding the partial state inside a lost local.
 *
 * D5: an "uploads" input is identified by `spec.type` (StepInputSpec, always
 * present on stepDef.inputs) - never by a separately-looked-up RuntimeField,
 * which may be undefined for a stale binding (a workflow authored before a
 * preset override dropped the field, or any other mismatch between what the
 * run form currently collects and what an old binding still points at). The
 * old attended-only lookup silently fell through to the string branch in
 * that case, handing the step a raw string where every other path (and the
 * server engine) hands it `[]`.
 *
 * D4: a hidden (StepInputSpec.visibleWhen-gated) runtime field resolves as
 * empty - `[]` for uploads, `""` otherwise - exactly like a scope-covered
 * field already does, so a value left over in `fieldValues`/`uploadFiles`
 * from an earlier, now-hidden choice never reaches the step.
 */
export async function resolveStepInputs(ctx: ResolveStepInputsContext, target: Record<string, unknown>): Promise<void> {
  const { step, stepDef, scope, fieldValues, uploadFiles, failedSteps, stepOutputs, expandedSteps, expandedTopIndices, disabledTopIndices, stepLookup, activeInstitution } = ctx;

  if (!stepDef) {
    throw new Error(`Unknown step type "${step.type}".`);
  }

  for (const spec of stepDef.inputs) {
    const binding = step.bindings[spec.key];
    if (!binding) {
      // An input with NO binding (a workflow authored before the step gained
      // this input) is still filled by the workflow scope when the scope
      // covers its family - otherwise a scope-level target (e.g. "Modules
      // ahead") silently never reaches preset steps.
      if (scopeCoversType(scope, spec.type)) {
        target[spec.key] = applyWorkflowScope(spec.type, "", scope);
      }
      continue;
    }

    if (binding.source === "runtime") {
      const hiddenByVisibility = !isFieldVisible(spec, fieldValues);
      if (spec.type === "uploads") {
        target[spec.key] = hiddenByVisibility ? [] : uploadFiles[binding.fieldKey] ?? [];
      } else {
        const runVal = hiddenByVisibility || scopeCoversType(scope, spec.type) ? "" : fieldValues[binding.fieldKey] ?? "";
        target[spec.key] = applyWorkflowScope(spec.type, runVal, scope);
      }
    } else if (binding.source === "step") {
      if (failedSteps.has(binding.stepIndex)) {
        const failedDef = stepLookup(expandedSteps[binding.stepIndex]?.type ?? "");
        const dependsOnDisabled = disabledTopIndices.has(expandedTopIndices[binding.stepIndex]);
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
      target[spec.key] = output;
    } else if (binding.source === "literal") {
      target[spec.key] = binding.value;
    }

    // Expand a scopeable input's "*" (all) sentinel into a concrete
    // newline-joined list so the action always receives a real list.
    if (isScopeableListType(spec.type) && typeof target[spec.key] === "string") {
      const scopeInst = applyWorkflowScope("institution", "", scope).trim();
      target[spec.key] = await expandScopedValue(spec.type, target[spec.key] as string, {
        activeInstitution: scopeInst || activeInstitution,
      });
    }

    // A "@class-repo" reference resolves a repo input to a course tile's
    // linked class repository. Non-references pass through unchanged.
    if (spec.type === "repo" && typeof target[spec.key] === "string") {
      target[spec.key] = await resolveClassRepoRef(target[spec.key] as string, scope);
    }

    // A "@class-tile" reference fills an input from the scoped/picked course
    // tile's matching field. Non-references pass through.
    if (
      (spec.type === "lmsCourse" || spec.type === "date" || spec.type === "institution") &&
      typeof target[spec.key] === "string"
    ) {
      target[spec.key] = await resolveClassTileRef(target[spec.key] as string, scope, spec.type);
    }
  }
}

// ---------------------------------------------------------------------------
// D2: deliverable-resilience pass-through has exactly ONE implementation.
// ---------------------------------------------------------------------------

/**
 * Deliverable-resilience pass-through (StepDefinition.passThroughOnFailure,
 * registry-helpers.ts). Given a failed step's declared mapping, its OWN
 * bindings, the set of steps that have already genuinely failed, and every
 * step's outputs so far, resolves which of the failed step's outputs can be
 * salvaged from an already-succeeded upstream step - and returns them, so
 * the run loop's catch branch can publish them as this step's own output
 * instead of leaving it undefined for every dependent.
 *
 * Resolved from each mapped input's BINDING, not from the step's own
 * resolvedInputs bag: resolvedInputs is filled in stepDef.inputs DECLARATION
 * ORDER, so whether the mapped input was already resolved at throw time
 * depends on where it happens to sit in that particular step's input list -
 * relying on that would work by accident today and break the first time an
 * input list gets reordered. The binding itself is stable regardless of when
 * the throw happened.
 *
 * Pure (no closures, every dependency an explicit parameter) and exported
 * specifically so it is unit-testable on its own - see
 * pass-through-on-failure.test.ts, which imports this SAME function via both
 * server-runner.ts's and useWorkflowRun.ts's re-exports and proves an
 * attended run and an unattended run of the same workflow can never diverge
 * on this, because they now literally call the same code (this used to be
 * two independently-maintained copies, proven equal only by a parity test;
 * now there is only one copy to prove correct).
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

/**
 * Whether a run (or one fan-out group's) step outcomes add up to "ok": no
 * step genuinely failed (a disabled or gate-skipped step does not count -
 * see disabledRunIndices/skippedRunIndices) AND no step passed through a
 * failure (StepDefinition.passThroughOnFailure / resolvePassThroughOutputs
 * above). A pass-through failure is deliberately never added to
 * `failedSteps` (that is what stops it from cascading to dependents), so
 * without the second condition this would report a run clean even though a
 * generator genuinely failed - a run that lost a deliverable must not report
 * ok.
 *
 * This is the ONE algorithm both engines use for this verdict. It used to be
 * two: server-runner.ts's own isRunOk (an actual set difference - genuine
 * failures are failedSteps minus disabled minus skipped) and
 * useWorkflowRun.ts's own isGroupGenuineFailure (a cardinality proxy -
 * failedSteps.size > disabledRunIndices.size + skippedRunIndices.size,
 * inverted). The two agreed only while disabledRunIndices and
 * skippedRunIndices stayed disjoint subsets of failedSteps - true of every
 * real call site (a step is added to failedSteps in the SAME branch that
 * adds it to exactly one of those two sets, so the invariant always held in
 * practice) but not a property either algorithm actually checked, so the
 * proxy was silently relying on an invariant it never enforced. See
 * run-step-core.test.ts for a manufactured case where the two disagree.
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

// ---------------------------------------------------------------------------
// D6: the run report - now shared, so an attended run can save one too.
// ---------------------------------------------------------------------------

/**
 * Build a Markdown report of a run's text deliverables, or null when there
 * is nothing substantive to save. Pure (no I/O, no Date) so it is unit
 * testable; the caller supplies `generatedAt` and a step-name lookup. Only
 * `done` steps with a text/list/link summary contribute; schedule summaries
 * and errored/empty steps are skipped. Institution/course grouping is
 * preserved via optional fields; the report will show the group label when
 * available.
 *
 * Used by both engines: an unattended run has always saved this (via
 * StepRunHelpers.saveRunReport, buildServerStepRunHelpers) - an attended run
 * never did, because buildAttendedStepHelpers never set saveRunReport at
 * all, which left this function permanently dead code on that path. Moving
 * it here (rather than leaving it only in server-runner.ts, which an
 * attended, browser-bundled hook cannot import) is what lets a hand-run
 * Course Build land the same report in the Files tab a scheduled run does.
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
