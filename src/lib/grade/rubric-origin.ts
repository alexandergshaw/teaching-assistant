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
 * RULING 120: `rubric_origin_scope` being null is ambiguous - it means
 * either "no rubric was included" or "a rubric was included but its origin
 * was not recorded" (every pre-migration row, plus the C9 path where the
 * course/assignment labels are blank at upload time). The two states read a
 * FALSE sentence onto real data if collapsed onto FROZEN_NO_RUBRIC, so this
 * third frozen sentence exists to be true of the second state specifically -
 * it asserts presence AND the absence of a recorded source, and promises
 * nothing about why the source is missing. Pinned by string equality, same
 * as FROZEN_NO_RUBRIC.
 */
export const FROZEN_RUBRIC_ORIGIN_UNKNOWN =
  "A rubric was included with this upload, but its source was not recorded.";

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
 *
 * RULING 120: THREE states, not two - `originScope` alone cannot tell "no
 * rubric" apart from "a rubric with an unrecorded origin", so the caller
 * must pass whether the drop actually carries rubric text (`rubricPresent`,
 * from `CartridgeDrop.rubricText`). The precondition for FROZEN_NO_RUBRIC is
 * now the fact it asserts - rubric absence - rather than origin absence.
 *
 * `present` in the return value tracks `rubricPresent` (true whenever the
 * drop carries rubric text, regardless of whether its origin is known). It
 * has no production consumer today - the render at CartridgeDropPanel.tsx
 * reads only `.text` - and is kept solely so tests can assert the presence
 * branch without parsing prose (RULING 123 MI6). It is not load-bearing for
 * rendering.
 */
export function describeDropRubricOrigin(
  originScope: string | null,
  rubricPresent: boolean
): { present: boolean; text: string } {
  if (!rubricPresent) {
    return { present: false, text: FROZEN_NO_RUBRIC };
  }
  if (!originScope) {
    return { present: true, text: FROZEN_RUBRIC_ORIGIN_UNKNOWN };
  }
  return { present: true, text: `Rubric from ${describeRubricScope(originScope)}.` };
}
