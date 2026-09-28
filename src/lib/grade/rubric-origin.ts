/**
 * A40 (docs/owner-decisions-2026-09-27.md DECISION 16): the cartridge drop
 * row discloses presence plus ORIGIN - which course/assignment (or which
 * uploaded file) the persisted rubric text actually came from. Computed
 * once, at upload time, and stored on the row (RULING 105) - never
 * recomputed at render time, because a render-time comparison against
 * rubric-memory silently stops being true on reload.
 *
 * The one fact this module exists to get right: the origin recorded must be
 * the scope the rubric ACTUALLY came from, never the scope the upload
 * requested. A rubric restored from a different assignment's memory (the
 * cross-assignment fallback in rubric-memory.ts's loadRubricMemory) must be
 * attributed to THAT assignment, not to the one being uploaded now.
 */

import { describeRubricScope } from "./rubric-memory";

/** The frozen no-rubric sentence (RULING 113). A retrospective statement of
 *  fact, read later by an instructor who may never have turned auto-grading
 *  on - it must never promise that a workflow generated a rubric. */
export const FROZEN_NO_RUBRIC = "No rubric was included with this upload.";

/**
 * Decides which scope the rubric text actually carried at upload time.
 * Order matters: the falsy guard runs BEFORE the restored check (a drop
 * with no rubric text must never be attributed to a scope, even when a
 * restored value is sitting in the ref), and the restored scope outranks a
 * sniffed one (mergeSniffedValues's own current-wins ordering).
 */
export function resolveRubricOriginScope(input: {
  rubricText: string | null;
  currentScope: string;
  restored: { rubric: string; scope: string } | null;
  sniffedRubric: string | null;
  archiveName: string;
}): string | null {
  const { rubricText, currentScope, restored, sniffedRubric, archiveName } = input;

  if (!rubricText) return null;

  if (restored && restored.rubric === rubricText) {
    return restored.scope;
  }

  if (sniffedRubric && sniffedRubric === rubricText) {
    return `upload:${archiveName}`;
  }

  return currentScope || null;
}

/**
 * The drop-row copy. Says what the form caption already says (the COPY
 * PRINCIPLE), in the caption's own vocabulary, via the SAME humaniser
 * (RULING 115) - so the row can never drift into a second parse.
 */
export function describeDropRubricOrigin(originScope: string | null): { present: boolean; text: string } {
  if (!originScope) {
    return { present: false, text: FROZEN_NO_RUBRIC };
  }
  return { present: true, text: `Rubric from ${describeRubricScope(originScope)}.` };
}
