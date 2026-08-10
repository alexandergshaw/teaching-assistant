// Pure decision of which corner indicators a Tasks-grid status cell shows
// (docs/task-institution-instructions-acceptance-criteria.md AC4 items
// 14-16, "Tests written BEFORE implementation" item 8). vitest is node-env
// and collects only src/**/*.test.ts - no .tsx is ever rendered - so whether
// TaskCell.tsx's note dog-ear (top-right, .noteMarker), the new institution-
// instruction mark (bottom-left, .instructionMarker), and the save-error
// mark (bottom-right, .errorMarker) can all appear on the SAME cell at once,
// without one displacing another, has to be provable from a pure function
// rather than from rendering the component. TaskCell.tsx reads its three
// markers' visibility straight off this function's return value (see this
// feature's own taskInstructionIndicator.wiring.test.ts, which reads
// TaskCell.tsx as text and confirms each marker's JSX is actually gated on
// the corresponding field here, not re-derived inline) rather than
// re-deriving any of the three conditions itself, so a passing test against
// this module is a real guarantee about what the button renders, not merely
// about a value that gets computed and then ignored.
export interface TaskCellIndicatorSet {
  /** The note-or-files dog-ear, top-right (.noteMarker in TasksGrid.module.css) -
   * true when the text note is non-blank OR the cell has one or more
   * attachments (docs/task-cell-attachments-acceptance-criteria.md AC3 item
   * 15). The instructor's own framing ("files as notes") is why this corner
   * mark is shared rather than getting a fifth. */
  note: boolean;
  /** This feature's institution-instruction mark, bottom-left
   * (.instructionMarker) - AC4 item 14 puts it in the one corner this grid's
   * cell was not already using: .noteMarker has top-right, .errorMarker has
   * bottom-right, and .cellMenuTrigger (the "more options" affordance) has
   * top-left. */
  instruction: boolean;
  /** The failed-save mark, bottom-right (.errorMarker). */
  error: boolean;
}

/**
 * `note` and `instruction` both collapse a blank-or-whitespace-only string
 * to "not shown," matching two existing "blank means absent" conventions
 * this feature deliberately does not re-litigate: TaskCell.note is always
 * trimmed by every writer before it reaches a cell (setTaskCellNote/
 * coerceTaskCellMap in src/lib/course-tasks.ts), and resolveTaskInstruction
 * (src/lib/task-institution-instructions.ts) already returns "" for
 * "nothing to show" - a missing row, a course with no institution (A4), or a
 * stored-but-blank body. Trimming again here is defensive, not load-bearing:
 * it means this function's own contract ("blank in, false out") holds even
 * if a future caller ever hands it an untrimmed string directly. `error` is
 * a plain presence check on the per-cell save-error message TasksTab.tsx
 * tracks (`cellErrors`, keyed `${courseId}:${taskId}`).
 *
 * All three fields are computed independently, and none influences another:
 * a cell can show any combination of the three at once (AC4 item 16 - the
 * note dog-ear, the instruction mark, and the error mark occupy three
 * different corners of the same cell specifically so this is possible).
 * This function never picks a "primary" indicator and never suppresses one
 * because another is also present.
 *
 * `attachmentCount` (docs/task-cell-attachments-acceptance-criteria.md AC3
 * item 15) is a fourth, OPTIONAL parameter defaulting to 0, so every
 * existing call site keeps compiling and behaving exactly as before. `note`
 * becomes true when the trimmed text note is non-blank OR `attachmentCount`
 * is a positive INTEGER - a negative, fractional, or non-finite count (NaN
 * included) can never turn the mark on by accident, since `Number.isInteger`
 * is false for all three. The decision stays in this one pure function,
 * never an inline `cell.note || count > 0` re-derived in TaskCell.tsx.
 */
export function taskCellIndicatorSet(
  note: string,
  instruction: string,
  error: string | undefined,
  attachmentCount: number = 0
): TaskCellIndicatorSet {
  return {
    note: note.trim() !== "" || (Number.isInteger(attachmentCount) && attachmentCount > 0),
    instruction: instruction.trim() !== "",
    error: Boolean(error),
  };
}
