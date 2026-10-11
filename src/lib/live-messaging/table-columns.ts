/**
 * The Success Tracking table's columns (LIVE-LMS-STUDENT-MESSAGING W3).
 * Institution is deliberately NOT a column: it is the switcher chrome
 * (docs/live-lms-student-messaging-scope.md section 2). Pinned by
 * table-columns.test.ts.
 */

import type { FilterColumn, SortKey } from "./table-filter-model";

export interface TableColumn {
  readonly id: "name" | "course" | "section" | "term" | "status" | "missing";
  readonly label: string;
  /** Sort key this header toggles; status sorts by the grade it is banded from. */
  readonly sortKey: SortKey;
  /** Funnel column, or null when the header has no funnel (Student uses search). */
  readonly filter: FilterColumn | null;
}

export const TABLE_COLUMNS: readonly TableColumn[] = [
  { id: "name", label: "Student", sortKey: "name", filter: null },
  { id: "course", label: "Course", sortKey: "course", filter: "course" },
  { id: "section", label: "Section", sortKey: "section", filter: "section" },
  { id: "term", label: "Term", sortKey: "term", filter: "term" },
  { id: "status", label: "Current Status", sortKey: "grade", filter: null },
  { id: "missing", label: "# of Missing Assignments", sortKey: "missing", filter: "missing" },
];
