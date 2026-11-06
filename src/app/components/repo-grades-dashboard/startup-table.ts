import type { CourseStartupProgress, CourseStartupState, StartupRepositoryCoverage } from "./startup-progress";

export type StatusTone = "danger" | "warning" | "accent" | "success" | "neutral";

export const STARTUP_STATUS: Record<CourseStartupState, { label: string; tone: StatusTone }> = {
  failed: { label: "Failed", tone: "danger" },
  unknown: { label: "Status unknown", tone: "warning" },
  blocked: { label: "Blocked", tone: "warning" },
  "embedded-profile-required": { label: "Blocked by Embedded profile requirements", tone: "warning" },
  partial: { label: "Partial", tone: "warning" },
  "not-configured": { label: "No GitHub organization configured", tone: "warning" },
  stopped: { label: "Stopped before starting", tone: "neutral" },
  "not-started": { label: "Not started in this batch", tone: "neutral" },
  busy: { label: "Already claimed", tone: "neutral" },
  running: { label: "Running", tone: "accent" },
  queued: { label: "Queued", tone: "accent" },
  checking: { label: "Checking", tone: "accent" },
  succeeded: { label: "Complete", tone: "success" },
  "already-processed": { label: "Already processed", tone: "neutral" },
  "no-submission": { label: "No submission", tone: "neutral" },
  "no-work": { label: "No work found", tone: "neutral" },
};

// The display order also determines which status represents a class when sorting.
const STATUS_PRIORITY = Object.keys(STARTUP_STATUS);

export type StartupSortColumn = "class" | "status";
export type StartupTableSort = Readonly<{ column: StartupSortColumn; direction: "asc" | "desc" }>;

export function nextStartupTableSort(sort: StartupTableSort, column: StartupSortColumn): StartupTableSort {
  return { column, direction: sort.column === column && sort.direction === "asc" ? "desc" : "asc" };
}

function statusRank(state: CourseStartupState): number {
  return STATUS_PRIORITY.indexOf(state);
}

export function orderStartupStatuses(states: CourseStartupProgress["states"]) {
  return [...states].sort((a, b) => statusRank(a.state) - statusRank(b.state));
}

export function formatStartupRepositoryCoverage({ checked, found, enumerationComplete }: StartupRepositoryCoverage): string {
  const incomplete = found - checked;
  const details = [
    `Repositories checked: ${checked} of ${found}${enumerationComplete ? "" : " found"}`,
    ...(incomplete ? [`Incomplete checks: ${incomplete}`] : []),
    ...(enumerationComplete ? [] : ["Repository list incomplete"]),
  ];
  return details.join(" · ");
}

function leadingStatusRank({ states }: CourseStartupProgress): number {
  return states.reduce((rank, { state }) => Math.min(rank, statusRank(state)), STATUS_PRIORITY.length);
}

export function sortStartupCourses(courses: readonly CourseStartupProgress[], sort: StartupTableSort) {
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...courses].sort((a, b) => {
    const byClass = a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
    if (sort.column === "class") return direction * byClass;
    return direction * (leadingStatusRank(a) - leadingStatusRank(b)) || byClass;
  });
}
