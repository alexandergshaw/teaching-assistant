// CSV export helpers for the Tasks tab (AC10) - split out of
// course-tasks-view.ts to stay under this repo's 1000-line-per-file cap
// (item 240), the same reason course-tasks-view-column-filters.ts was split
// out before it (see that file's own header comment for the identical
// rationale). Everything exported here is re-exported from
// course-tasks-view.ts, so every caller - including this feature's own test
// file, which imports exclusively from "./course-tasks-view" - resolves
// these names from one place regardless of which file actually implements
// them.
//
// Depends only on course-tasks.ts, never on course-tasks-view.ts itself,
// for the same reason course-tasks-view-column-filters.ts gives (see its
// own comment): course-tasks-view.ts's own buildTasksCsv needs THIS module,
// so importing course-tasks-view.ts back from here would create a cycle.
// `TaskCsvRow` below is a structural subset of course-tasks-view.ts's own
// `TaskRow` (same `cells`, and only the three `course` fields this file
// actually reads) rather than that type itself - every `TaskRow[]` a caller
// already has is assignable to it without change, so no call site anywhere
// in the app needs to be touched.
//
// CLIENT-SAFE like every other module in this feature: no Date.now(), no
// supabase/server import, no next/headers.
import {
  effectiveTaskStatus,
  taskCellAt,
  type TaskCadence,
  type TaskCell,
  type TaskCellMap,
  type TaskDefinition,
} from "./course-tasks";

/** Structural subset of course-tasks-view.ts's `TaskRow` - see this file's
 * own header comment for why it is declared separately instead of imported. */
export interface TaskCsvRow {
  course: { name: string; institution?: string | null; term?: string | null };
  cells: TaskCellMap;
}

/** Escapes one CSV field: quotes and doubles internal quotes when the value
 * contains a comma, a double quote, or a newline/carriage return; otherwise
 * returns it unquoted. */
export function escapeCsvValue(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Joins already-ordered field values into one escaped CSV row. Lifted out of
 * src/app/components/message-replies/message-replies-log.ts and
 * src/app/components/recording/discussion-replies-log.ts, which both carried
 * a byte-identical private copy; each calls `escapeCsvValue` with exactly the
 * one argument it takes, rather than `values.map(escapeCsvValue)`, which
 * passes `Array.prototype.map`'s own `(value, index, array)` to it. */
export function csvRow(values: readonly string[]): string {
  return values.map((value) => escapeCsvValue(value)).join(",");
}

/** "Yes"/"No" for a boolean CSV column - this codebase's existing
 * boolean-CSV-column convention (e.g. AutomationRow.tsx's "Unattended"
 * column), rather than a bare `true`/`false` spelling. Lifted alongside
 * `csvRow` for the same reason. */
export function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

/** Renders one cell's EFFECTIVE (period-scoped) status as the source
 * sheet's own token - "Y"/"N"/"N/A"/"" - so an expired daily/weekly
 * completion exports as blank, matching what the grid visually shows rather
 * than the raw stored status. */
export function sheetTokenForCell(cell: TaskCell, cadence: TaskCadence, nowMs: number): string {
  const status = effectiveTaskStatus(cell, cadence, nowMs);
  switch (status) {
    case "done":
      return "Y";
    case "blocked":
      return "N";
    case "na":
      return "N/A";
    case "open":
      return "";
  }
}

/** The full CSV cell text: the sheet token with a trimmed note appended in
 * parentheses when present, or the note alone (still parenthesized) when
 * there is no token (an open cell with a note - "waiting on the dean" is
 * still worth exporting even though it renders no Y/N/N/A). */
export function csvCellText(cell: TaskCell, cadence: TaskCadence, nowMs: number): string {
  const token = sheetTokenForCell(cell, cadence, nowMs);
  const note = cell.note.trim();
  if (token && note) return `${token} (${note})`;
  if (note) return `(${note})`;
  return token;
}

/**
 * Builds the CSV text for `rows`/`tasks`: an identity block (Course,
 * Institution, Term) then one column per task in the order given, mirroring
 * the source sheet's shape (AC10 item 51). When `generatedLabel` is
 * supplied, a `Generated,<label>` line precedes the header - the period
 * this export was taken for (AC14 item 80), so a Daily/Weekly CSV is never
 * ambiguous about which day/week it describes. Every field (including the
 * generated-at label, and every cell's token+note) is escaped individually -
 * a comma or quote inside a NOTE, not just a header label, must not corrupt
 * the row it sits in.
 */
export function buildTasksCsv(
  rows: TaskCsvRow[],
  tasks: TaskDefinition[],
  nowMs: number,
  generatedLabel?: string
): string {
  const lines: string[] = [];
  if (generatedLabel) {
    lines.push(["Generated", generatedLabel].map(escapeCsvValue).join(","));
  }

  const header = ["Course", "Institution", "Term", ...tasks.map((t) => t.label)];
  lines.push(header.map(escapeCsvValue).join(","));

  for (const row of rows) {
    const values = [
      row.course.name,
      row.course.institution ?? "",
      row.course.term ?? "",
      ...tasks.map((task) => csvCellText(taskCellAt(row.cells, task.id), task.cadence, nowMs)),
    ];
    lines.push(values.map(escapeCsvValue).join(","));
  }

  return lines.join("\n");
}
