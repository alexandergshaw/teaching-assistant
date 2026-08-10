// Pure wording + institution-set decisions shared by BOTH editing surfaces
// this feature adds (docs/task-institution-instructions-acceptance-
// criteria.md AC5 items 19-22): the cell editor (TaskCell.tsx) and the
// column menu (TaskColumnMenu.tsx). Kept in one file, not written twice
// inline, specifically so the two surfaces cannot drift into different
// wording for the same fact (item 19) or different institution-count logic
// (item 21).
//
// THE FOOTGUN THIS FILE EXISTS TO DEFUSE: editing an instruction from a
// CELL looks per-cell but rewrites what EVERY course at that institution
// shows in that column. Nothing here changes what gets saved (that is
// useCourseTasksData.ts's job, via taskInstructionEdit.ts) - this module
// only decides what the instructor is TOLD before they type into the box.

/**
 * The scope statement shown directly beside the institution-instruction
 * editor on both surfaces (AC5 item 19). Names both the institution and the
 * task, never a bare "Instructions" label - the two facts an instructor
 * needs so this cannot be mistaken for a per-course field the way
 * `TaskCell.note` is.
 *
 * `institution === null` is the AC5 item 22 case: there is no institution
 * to attach a shared instruction to (a course with no institution set, in
 * the cell editor; no visible course carries one, in the column menu).
 * Rather than a disabled control with no explanation, this returns the
 * one-line reason the editor is absent - still naming the task, so it reads
 * as an answer to "why can't I edit this?" rather than a generic dead end.
 */
export function taskInstructionScopeText(institution: string | null, taskLabel: string): string {
  if (institution === null) {
    return `No institution is set, so there is no shared instruction to edit for "${taskLabel}" here.`;
  }
  return `Applies to every course at ${institution}, not just this one - shared instructions for "${taskLabel}".`;
}

/**
 * Which institution(s) the column menu's Instructions section (AC5 item 21)
 * should offer editing for, derived from the institutions present among the
 * VISIBLE rows for one task column. `institutions` should come from
 * `distinctInstitutions` (src/lib/course-tasks-view.ts) - already sorted,
 * already blank-excluded - so this function only decides what to DO with
 * the count, never re-derives the set itself:
 *
 * - zero institutions: nothing to edit ("none").
 * - exactly one: edit it directly, no picking required ("single").
 * - several: list them so the instructor picks deliberately rather than the
 *   app guessing which one they meant ("multiple").
 */
export type ColumnInstructionScope =
  | { kind: "none" }
  | { kind: "single"; institution: string }
  | { kind: "multiple"; institutions: string[] };

export function columnInstructionScope(institutions: string[]): ColumnInstructionScope {
  if (institutions.length === 0) return { kind: "none" };
  if (institutions.length === 1) return { kind: "single", institution: institutions[0] };
  return { kind: "multiple", institutions };
}
