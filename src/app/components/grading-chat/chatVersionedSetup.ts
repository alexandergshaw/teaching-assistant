import type { GradeRunItemRequestBody } from "../grading/incrementalRunPlan";

/** Exact grading parameters carried by an item, excluding its submission. */
export type ChatGradingSetup = Omit<GradeRunItemRequestBody, "entry" | "sourceIndex" | "gradeWindowSec">;
export interface ChatSetupVersion { readonly version: number; readonly setup: Readonly<ChatGradingSetup> }
export interface ChatSetupHistory { readonly current: number; readonly versions: readonly ChatSetupVersion[] }

/**
 * The caller resolves and validates setup first, then supplies the revision it
 * observed before asynchronous work. A stale resolution cannot replace a
 * newer setup. Existing versions and already-created requests stay intact.
 * This in-memory seam does not persist versions or dispatch grading.
 */
export function appendChatSetupVersion(history: ChatSetupHistory, expectedCurrent: number, setup: ChatGradingSetup): ChatSetupHistory | null {
  if (!Number.isSafeInteger(history.current) || history.current < 0 || expectedCurrent !== history.current || history.versions.length !== history.current || history.versions.some((version, index) => version.version !== index + 1) || history.current >= Number.MAX_SAFE_INTEGER) return null;
  const snapshot = Object.freeze({
    assignmentInstructions: setup.assignmentInstructions,
    rubric: setup.rubric,
    provider: setup.provider,
    pointsPossible: setup.pointsPossible,
    commentSplit: setup.commentSplit,
    harshness: setup.harshness,
    feedbackWordTarget: setup.feedbackWordTarget,
    applyNamingDeduction: setup.applyNamingDeduction,
    applyLengthDeduction: setup.applyLengthDeduction,
    lengthDeductionThresholdWords: setup.lengthDeductionThresholdWords,
  });
  const version = Object.freeze({ version: history.current + 1, setup: snapshot });
  return Object.freeze({ current: version.version, versions: Object.freeze([...history.versions, version]) });
}

/** Bind an item to the captured version, not whichever setup is current later. */
export function requestForChatSetup(version: ChatSetupVersion, item: Pick<GradeRunItemRequestBody, "entry" | "sourceIndex" | "gradeWindowSec">): GradeRunItemRequestBody {
  return { ...version.setup, sourceIndex: item.sourceIndex, entry: item.entry, gradeWindowSec: item.gradeWindowSec };
}
