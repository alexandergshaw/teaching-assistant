// Pure decision logic for LecturePlanningTab.tsx, extracted so it can be
// tested with frozen literals (vitest here is node-env and never renders a
// component - see vitest.config.ts) and to keep the component itself under
// this project's 1000-line cap.
//
// Two destructive actions on this tab used to fire with no confirmation:
// "Generate" (clears every plan and every edit before the request even
// starts) and per-card "Regenerate" (overwrites both the plan and its
// reset-snapshot). Both are fixed here using this app's existing
// signature-based arming idiom (content-tab/modules/confirmArming.ts):
// arming is a property of the VALUE that would be discarded, not of a click
// count or a timer, so re-confirming the identical thing stays armed but a
// changed thing re-requires confirmation.
import { selectionSignature, isConfirmArmed } from "./content-tab/modules/confirmArming";
import type { AssignmentPlan } from "../actions";

export type EditablePlanFields = Pick<
  AssignmentPlan,
  "presentationTitle" | "moduleIntroduction" | "assignmentInstructions" | "slides"
>;

export type RegenerateArmed = { index: number; signature: string } | null;

type GenerateStatus = "idle" | "loading" | "done" | "error";

// Order-independent signature of the plan SET currently on screen, keyed by
// assignment name (mirrors selectionSignature's own contract: {A,B} and
// {B,A} must produce the same signature).
export function plansSignature(plans: Pick<AssignmentPlan, "assignmentName">[]): string {
  return selectionSignature(plans.map((p) => p.assignmentName));
}

// True only when Generate, if clicked right now, would run for real rather
// than arm the confirmation. A plan set with nothing in it has nothing to
// discard, so it never needs confirming.
export function isGenerateConfirmArmed(armedFor: string | null, plans: AssignmentPlan[]): boolean {
  if (plans.length === 0) return false;
  return isConfirmArmed(armedFor, plansSignature(plans));
}

// Deterministic signature of the fields a person can actually edit in
// LecturePlanPreviewModal.tsx. Two plans with the same signature are, for
// confirmation purposes, "the same edited state".
export function planEditSignature(plan: EditablePlanFields): string {
  return JSON.stringify({
    presentationTitle: plan.presentationTitle,
    moduleIntroduction: plan.moduleIntroduction,
    assignmentInstructions: plan.assignmentInstructions,
    slides: plan.slides,
  });
}

// True when the instructor has changed anything in this card since it was
// generated (or since it was last reset). A card with no edits has nothing
// to protect, so callers should regenerate it immediately rather than
// interposing a confirmation click.
export function planHasEdits(current: EditablePlanFields, original: EditablePlanFields): boolean {
  return planEditSignature(current) !== planEditSignature(original);
}

// True only when per-card Regenerate, if clicked right now for this index,
// would run for real. Re-arms itself (returns false again) if the card was
// edited again since it was armed, per confirmArming.ts's "armed for a
// VALUE, not an event" contract.
export function isRegenerateConfirmArmed(
  armed: RegenerateArmed,
  index: number,
  plan: EditablePlanFields | undefined
): boolean {
  if (!plan || !armed || armed.index !== index) return false;
  return isConfirmArmed(armed.signature, planEditSignature(plan));
}

export function generateButtonLabel(opts: {
  status: GenerateStatus;
  scope: "all" | "single";
  confirmArmed: boolean;
}): string {
  if (opts.status === "loading") return "Generating…";
  if (opts.confirmArmed) return "Confirm — discard and regenerate";
  return opts.scope === "single" ? "Generate Module" : "Generate Lecture Plans";
}

export function generateConfirmMessage(plansCount: number): string {
  return `This will discard ${plansCount} generated plan${plansCount === 1 ? "" : "s"} and any edits you have made to them. Click Generate again to confirm.`;
}

export function regenerateButtonLabel(opts: { regenerating: boolean; confirmArmed: boolean }): string {
  if (opts.regenerating) return "Regenerating…";
  if (opts.confirmArmed) return "Confirm — discard edits";
  return "Regenerate";
}

export function regenerateTooltip(opts: { hasEdits: boolean; confirmArmed: boolean }): string {
  if (!opts.hasEdits) return "Regenerate this module from the uploaded zip.";
  if (opts.confirmArmed) return "This module has unsaved edits. Click again to discard them and regenerate.";
  return "This module has unsaved edits. Regenerating will discard them.";
}

// BLOCKER 3: the Course Engine generation path can finish with `status ===
// "done"` and no per-assignment plans to show at all - it produces one
// finished course package, not per-assignment preview cards - so a done
// state with nothing in `plans` must say what happened instead of rendering
// a blank success.
export function courseEngineDoneMessage(fileName: string): string {
  return `Course package generated: ${fileName}. The download should have started automatically — if it did not, use the button below.`;
}
