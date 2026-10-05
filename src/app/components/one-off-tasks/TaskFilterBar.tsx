"use client";

// College + status filter controls. Presentational: the hook owns the state
// and persists it (ta-one-off-college-filter / ta-one-off-status-filter).

import type { TaskFilter } from "./one-off-task-model";
import styles from "./OneOffTasks.module.css";

type StatusFilter = "all" | "open" | "done";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
];

const ALL_VALUE = "__all__";
const UNASSIGNED_VALUE = "__unassigned__";

function collegeSelectValue(filter: TaskFilter): string {
  if (filter.college === undefined) return ALL_VALUE;
  if (filter.college === null) return UNASSIGNED_VALUE;
  return filter.college;
}

export default function TaskFilterBar({
  institutions,
  filter,
  onCollegeChange,
  onStatusChange,
}: {
  institutions: string[];
  filter: TaskFilter;
  onCollegeChange: (value: string | null | "all") => void;
  onStatusChange: (value: StatusFilter) => void;
}) {
  const status = filter.status ?? "all";
  return (
    <div className={styles.filterBar}>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="one-off-college-filter">
          College
        </label>
        <select
          id="one-off-college-filter"
          className={styles.select}
          value={collegeSelectValue(filter)}
          onChange={(e) => {
            const v = e.target.value;
            onCollegeChange(v === ALL_VALUE ? "all" : v === UNASSIGNED_VALUE ? null : v);
          }}
        >
          <option value={ALL_VALUE}>All colleges</option>
          {institutions.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
          <option value={UNASSIGNED_VALUE}>Unassigned</option>
        </select>
      </div>
      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel} id="one-off-status-label">
          Status
        </span>
        <div className={styles.segments} role="radiogroup" aria-labelledby="one-off-status-label">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={status === opt.value}
              className={`${styles.segment}${status === opt.value ? ` ${styles.segmentActive}` : ""}`}
              onClick={() => onStatusChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
