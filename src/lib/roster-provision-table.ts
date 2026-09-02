// Pure filter/sort for the per-student provisioning table (R12,
// StudentRepoRoster.tsx). Split out of the component because
// docs/org-student-repo-provisioning-acceptance-criteria.md's own
// constraint 3 says testable logic lives outside components (vitest here is
// node-env and never renders a .tsx), and because AC3.5a/REGRESSION 309
// check 26 pin a sharp rule this module exists to make impossible to get
// wrong by construction: **filtering is presentation only**. Every row here
// carries `i`, its position in the UNFILTERED roster - callers must set it
// once, before any filtering or sorting, and this module never recomputes
// it. `rowKey` (useStudentRepoInvitations.ts) and the AC3.5a 80-row budget
// both depend on that index staying the roster's true position.
import type { StudentRepoInvitationState } from "./student-repo-status";

export type RosterProvisionRowState = StudentRepoInvitationState | "unresolved";

export interface RosterProvisionRow {
  i: number;
  student: string;
  username: string;
  state: RosterProvisionRowState;
}

export interface RosterProvisionFilter {
  search: string;
  needsUsername: boolean;
  needsRepo: boolean;
}

export const EMPTY_ROSTER_PROVISION_FILTER: RosterProvisionFilter = {
  search: "",
  needsUsername: false,
  needsRepo: false,
};

export function rosterProvisionFilterIsActive(filter: RosterProvisionFilter): boolean {
  return filter.search.trim() !== "" || filter.needsUsername || filter.needsRepo;
}

export function matchesRosterProvisionFilter(row: RosterProvisionRow, filter: RosterProvisionFilter): boolean {
  const term = filter.search.trim().toLowerCase();
  if (term && !row.student.toLowerCase().includes(term) && !row.username.toLowerCase().includes(term)) {
    return false;
  }
  if (filter.needsUsername && row.state !== "no-username") return false;
  if (filter.needsRepo && row.state !== "missing") return false;
  return true;
}

export function filterRosterProvisionRows(
  rows: RosterProvisionRow[],
  filter: RosterProvisionFilter
): RosterProvisionRow[] {
  return rows.filter((row) => matchesRosterProvisionFilter(row, filter));
}

export type RosterProvisionSortField = "student" | "username" | "status";
export interface RosterProvisionSortState {
  field: RosterProvisionSortField;
  direction: "asc" | "desc";
}

export const DEFAULT_ROSTER_PROVISION_SORT: RosterProvisionSortState = { field: "student", direction: "asc" };

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/** Stable: equal keys keep their original roster order (tiebreak on `i`,
 * always ascending regardless of sort direction) so re-sorting never
 * shuffles rows that compare equal. */
export function sortRosterProvisionRows(
  rows: RosterProvisionRow[],
  sort: RosterProvisionSortState
): RosterProvisionRow[] {
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const cmp =
      sort.field === "student"
        ? compareStrings(a.student, b.student)
        : sort.field === "username"
          ? compareStrings(a.username, b.username)
          : compareStrings(a.state, b.state);
    if (cmp !== 0) return cmp * factor;
    return a.i - b.i;
  });
}

export function ariaSortForField(
  sort: RosterProvisionSortState,
  field: RosterProvisionSortField
): "ascending" | "descending" | "none" {
  if (sort.field !== field) return "none";
  return sort.direction === "asc" ? "ascending" : "descending";
}

export function toggleRosterProvisionSort(
  sort: RosterProvisionSortState,
  field: RosterProvisionSortField
): RosterProvisionSortState {
  if (sort.field !== field) return { field, direction: "asc" };
  return { field, direction: sort.direction === "asc" ? "desc" : "asc" };
}
