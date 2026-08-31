import type { GradingDraftPayload } from "./grading-drafts";
import type { GradingRunEntry } from "./grade";

// Pure helpers behind the drafted-grades page's per-assignment full-credit
// checklist panel. Kept plain (no server actions, no DOM) so the invariants
// that matter - one checklist per ASSIGNMENT, never per student, and never
// rendering an empty list - are unit-testable without a component-rendering
// harness (this repo has none; see grading-review-rows.ts and
// grading-draft-edit.ts for the same pattern applied to other drafted-grades
// page behavior).

export interface AssignmentChecklistSection {
  /** Index into payload.runs - also the key DraftedGradesTab already uses
   * for this entry's group, so persisting a derived checklist back can reuse
   * the exact same indexing as every other draft edit (see
   * applyDerivedChecklist). */
  runIndex: number;
  courseName: string;
  assignmentName: string;
  /** How many students share this assignment in the draft - informational
   * only; never used to decide how many times the checklist renders. */
  studentCount: number;
  checklist: string[];
  sampleAnswer?: string;
  /** True when this entry's run has no persisted checklist yet, so the page
   * should offer the on-demand derive control instead of a list. */
  needsDerivation: boolean;
}

/** True when a checklist has content worth rendering as a list. Guards
 * against ever rendering an empty <ul> for a run whose checklist is []. */
export function hasRenderableChecklist(checklist: string[]): boolean {
  return checklist.length > 0;
}

/**
 * One section per ASSIGNMENT (= one per run entry in the payload), never one
 * per student - a shared assignment's checklist must render once even when
 * many students' results sit under the same entry. DraftedGradesTab renders
 * exactly one AssignmentChecklistPanel per section returned here, placed
 * once above that entry's per-student grade rows.
 */
export function buildAssignmentChecklistSections(
  payload: GradingDraftPayload
): AssignmentChecklistSection[] {
  return payload.runs.map((entry, runIndex) => ({
    runIndex,
    courseName: entry.courseName,
    assignmentName: entry.assignmentName,
    studentCount: entry.run.results.length,
    checklist: entry.run.fullCreditChecklist,
    sampleAnswer: entry.run.sampleAnswer,
    needsDerivation: !hasRenderableChecklist(entry.run.fullCreditChecklist),
  }));
}

/**
 * Best-effort assignment instructions + rubric text to feed
 * deriveAssignmentChecklistAction when a draft entry has no canvasUrl to
 * refetch live Canvas data from (the offline zip-upload grading path never
 * sets one). Reconstructed from what the draft already carries: the
 * assignment name doubles as instructions, and the graded rubric area names
 * double as a plain-text rubric. Returns null when there is no assignment
 * name to work with, so the caller can show an honest "not enough
 * information" message instead of deriving a checklist from nothing.
 */
export function resolveFallbackChecklistInput(
  entry: GradingRunEntry
): { instructions: string; rubric: string } | null {
  const instructions = entry.assignmentName.trim();
  if (!instructions) return null;
  return { instructions, rubric: entry.run.rubricAreaNames.join("\n") };
}

/**
 * Pure write-back for a freshly derived checklist: returns a new payload
 * with runs[runIndex].run.fullCreditChecklist replaced, so the drafted
 * grades page can persist the result via updateGradingDraftPayloadAction and
 * never re-derive (and re-bill the LLM) the next time this draft is opened.
 * Does not mutate the input.
 */
export function applyDerivedChecklist(
  payload: GradingDraftPayload,
  runIndex: number,
  items: string[]
): GradingDraftPayload {
  // Spread the payload rather than reconstructing it from `runs` alone - see
  // the same fix in grading-draft-edit.ts. GradingDraftPayload carries an
  // optional `repoGradingLog`, and returning `{ runs }` silently dropped it,
  // so deriving a checklist destroyed the run's log on the way to
  // updateGradingDraftPayloadAction. Spreading also carries any field added
  // to the payload later.
  return {
    ...payload,
    runs: payload.runs.map((entry, idx) =>
      idx === runIndex
        ? { ...entry, run: { ...entry.run, fullCreditChecklist: items } }
        : entry
    ),
  };
}
