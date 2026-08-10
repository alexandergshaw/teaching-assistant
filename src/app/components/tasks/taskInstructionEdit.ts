// The pure half of useCourseTasksData.ts's optimistic instruction write
// (docs/task-institution-instructions-acceptance-criteria.md AC5 items 23,
// 25, 26) - pulled out so the "does this actually clear/cap correctly" logic
// is unit-testable without rendering a hook, which this repo's node-env
// vitest cannot do (no component, and no hook, is ever rendered - see
// gridFocus.test.ts's own header comment for the same constraint on a
// different feature). useCourseTasksData.ts calls this for the optimistic
// local-map update; the revert-on-failure half is a plain snapshot restore
// (no computation to pull out), matching how saveDef/saveDefs/setCourseCells
// already revert in that same file.
import {
  taskInstructionMapKey,
  TASK_INSTRUCTION_MAX_LENGTH,
  type TaskInstructionMap,
} from "@/lib/task-institution-instructions";

/**
 * Applies one edit to `map`, mirroring exactly what the server-side
 * `upsertTaskInstruction` (src/lib/supabase/task-institution-instructions.ts)
 * does, so the optimistic local map never shows something the server would
 * not actually have stored:
 *
 * - AC5 item 25: a blank or whitespace-only `body` DELETES the
 *   (institution, task) key rather than storing "" - mirrors
 *   `applyTaskCell`'s own "empty means absent" rule (src/lib/course-tasks.ts).
 * - AC5 item 24: a non-blank body is trimmed and capped at
 *   TASK_INSTRUCTION_MAX_LENGTH - defense in depth alongside the UI's own
 *   input cap and the server's authoritative one, so this local map can
 *   never optimistically show more than the server would ever persist.
 *
 * Never mutates `map`; every other key is passed through untouched.
 */
export function applyInstructionEdit(
  map: TaskInstructionMap,
  institution: string,
  taskId: string,
  body: string
): TaskInstructionMap {
  const key = taskInstructionMapKey(institution, taskId);
  const trimmed = body.trim();
  const next: TaskInstructionMap = { ...map };
  if (trimmed === "") {
    delete next[key];
  } else {
    next[key] = trimmed.slice(0, TASK_INSTRUCTION_MAX_LENGTH);
  }
  return next;
}
