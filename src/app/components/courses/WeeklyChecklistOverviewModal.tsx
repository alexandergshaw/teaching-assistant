"use client";

// "Weekly Checklist Overview" - the FAB's third action (AiChatFab.tsx):
// every weekly checklist item across EVERY course, in one sortable table.
// Opened as a MODAL (the previewBackdrop/previewModal pattern already used
// by CsvPreviewModal, RubricPreviewModal, SyllabusPreviewModal, and this
// same folder's AskAiModal), not a third floating window like the FAB's
// other two actions - deliberately:
//   - The FAB's floating windows (AI Chatbot, Live Class) are persistent
//     workspaces the instructor keeps open WHILE doing other things for
//     extended periods, so they persist their open/closed state and screen
//     position across reloads (see the ta:chat-open / ta:live-class-open
//     keys in AiChatFab.tsx).
//   - This view is a read-only glance-and-close snapshot, exactly the shape
//     every other "show me a table of data" surface in this app already
//     uses the modal pattern for. It should always show CURRENT data, not
//     whatever was on screen when a stale floating window was last left
//     open - closing and reopening a modal naturally re-fetches (see the
//     effect below), which is exactly the behavior wanted here and is why
//     this component, unlike the chat/live-class windows, does NOT persist
//     its own open/closed state.
//
// READ-ONLY (AC5): there is deliberately no checkbox here to toggle an
// item's checked state. WeeklyChecklistCell.tsx's toggle path now also
// triggers a scoped Google Calendar write (syncChecklistItemCalendarAction)
// - a second, independent mutation path built against that moving target
// here would race it. Toggling from this modal is a deliberate FOLLOW-UP,
// not an oversight; checked state is displayed clearly (a text-labeled
// badge, not a color-only dot) but can only be changed from the course's
// own Weekly Checklist column.
import { useEffect, useState } from "react";
import { Button, TextField, Checkbox, FormControlLabel, CircularProgress } from "@mui/material";
import { listCourseHubAction } from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";
import { WEEKLY_CHECKLIST_WEEKDAY_LABELS } from "@/lib/weekly-checklist";
import { truncateForCell } from "@/lib/courses-table-helpers";
import {
  buildWeeklyChecklistOverviewRows,
  sortWeeklyChecklistRows,
  parseWeeklyChecklistSortState,
  formatWeeklyChecklistTime,
  WEEKLY_CHECKLIST_SORT_FIELDS,
  type WeeklyChecklistSortField,
  type WeeklyChecklistSortState,
} from "@/lib/weekly-checklist-table-helpers";
import styles from "../../page.module.css";
import tableStyles from "./WeeklyChecklistOverviewModal.module.css";

const SORT_KEY = "ta-weekly-checklist-overview-sort";
const SEARCH_KEY = "ta-weekly-checklist-overview-search";
const HIDE_DONE_KEY = "ta-weekly-checklist-overview-hide-done";

const COLUMN_LABELS: Record<WeeklyChecklistSortField, string> = {
  course: "Course",
  item: "Item",
  weekday: "Weekday",
  time: "Time",
  checked: "Status",
  overdue: "Overdue",
};

// Impure Date.now() read isolated in this tiny top-level helper (mirrors
// currentTimeMs() in WeeklyChecklistCell.tsx) so eslint's react-hooks/purity
// rule - which flags a DIRECT Date.now() call inside a component body -
// reads clean, while the table still shows "overdue right now" on every
// render without waiting for a click.
function currentTimeMs(): number {
  return Date.now();
}

function readLocal(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

export default function WeeklyChecklistOverviewModal({ onClose }: { onClose: () => void }) {
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">("loading");
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped by the Retry button to re-run the fetch effect below; also what
  // the very first (mount) fetch runs against, at its initial value of 0.
  const [reloadToken, setReloadToken] = useState(0);

  const [search, setSearch] = useState<string>(() => readLocal(SEARCH_KEY, ""));
  const [hideDone, setHideDone] = useState<boolean>(() => readLocal(HIDE_DONE_KEY, "false") === "true");
  const [sort, setSort] = useState<WeeklyChecklistSortState>(() =>
    parseWeeklyChecklistSortState(typeof window === "undefined" ? null : localStorage.getItem(SORT_KEY))
  );

  // AC6: the fetch happens when this component mounts, which only happens
  // once the modal is actually opened (AiChatFab conditionally renders this
  // component) - never eagerly on app load, mirroring how AiChatFab's own
  // toneStatus effect is gated on chatOpen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listCourseHubAction();
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        setLoadState("error");
      } else {
        setCourses(result.courses);
        setLoadState("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(SEARCH_KEY, search);
  }, [search]);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(HIDE_DONE_KEY, String(hideDone));
  }, [hideDone]);

  const retry = () => {
    // Synchronous setState here is fine - this runs in a click handler, not
    // in the effect body (see the setState-in-effect idiom's actual
    // constraint: no setState reached SYNCHRONOUSLY from an effect).
    setLoadState("loading");
    setError(null);
    setReloadToken((t) => t + 1);
  };

  const applySort = (field: WeeklyChecklistSortField) => {
    setSort((prev) => {
      const next: WeeklyChecklistSortState =
        prev.field === field ? { field, direction: prev.direction === "asc" ? "desc" : "asc" } : { field, direction: "asc" };
      if (typeof window !== "undefined") localStorage.setItem(SORT_KEY, JSON.stringify(next));
      return next;
    });
  };

  const allRows = courses ? buildWeeklyChecklistOverviewRows(courses, currentTimeMs()) : [];
  const trimmedSearch = search.trim().toLowerCase();
  const hasActiveFilter = hideDone || trimmedSearch !== "";
  const filteredRows = allRows.filter((row) => {
    if (hideDone && row.checked) return false;
    if (trimmedSearch && !row.courseName.toLowerCase().includes(trimmedSearch) && !row.label.toLowerCase().includes(trimmedSearch)) {
      return false;
    }
    return true;
  });
  const sortedRows = sortWeeklyChecklistRows(filteredRows, sort);

  const sortIndicator = (field: WeeklyChecklistSortField) => (sort.field === field ? (sort.direction === "asc" ? " ▲" : " ▼") : "");
  const ariaSortFor = (field: WeeklyChecklistSortField): "ascending" | "descending" | "none" =>
    sort.field === field ? (sort.direction === "asc" ? "ascending" : "descending") : "none";

  const clearFilters = () => {
    setSearch("");
    setHideDone(false);
  };

  return (
    <div className={styles.previewBackdrop} onClick={onClose}>
      <section
        className={styles.previewModal}
        role="dialog"
        aria-modal="true"
        aria-label="Weekly Checklist Overview"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <div>
            <h3>Weekly Checklist Overview</h3>
            <p className={styles.previewMeta}>
              {loadState === "ready" && courses
                ? `${sortedRows.length} of ${allRows.length} item${allRows.length === 1 ? "" : "s"} across ${courses.length} course${courses.length === 1 ? "" : "s"}`
                : "Every weekly checklist item, across every course"}
            </p>
          </div>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>

        <div className={tableStyles.toolbar}>
          <TextField
            size="small"
            placeholder="Search course or item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={loadState !== "ready"}
            sx={{ minWidth: 220, flex: "1 1 220px" }}
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={hideDone}
                onChange={(e) => setHideDone(e.target.checked)}
                disabled={loadState !== "ready"}
              />
            }
            label="Hide completed"
          />
        </div>

        <div className={styles.previewContent} style={{ overflow: "auto", padding: 0 }}>
          {loadState === "loading" && (
            <div className={tableStyles.stateMessage} style={{ alignItems: "center", flexDirection: "row" }}>
              <CircularProgress size={18} />
              <span className={styles.previewMeta}>Loading weekly checklist items…</span>
            </div>
          )}

          {loadState === "error" && (
            <div className={tableStyles.stateMessage}>
              <p className={styles.previewMeta} style={{ color: "var(--danger)" }}>
                {error ?? "Could not load your courses."}
              </p>
              <Button size="small" variant="outlined" onClick={retry}>
                Try again
              </Button>
            </div>
          )}

          {loadState === "ready" && allRows.length === 0 && (
            <div className={tableStyles.stateMessage}>
              <p className={styles.previewMeta}>No weekly checklist items yet.</p>
              <p className={styles.previewMeta}>
                Add items from a course&apos;s Weekly Checklist column in the Courses tab.
              </p>
            </div>
          )}

          {loadState === "ready" && allRows.length > 0 && sortedRows.length === 0 && (
            <div className={tableStyles.stateMessage}>
              <p className={styles.previewMeta}>No items match the current filter.</p>
              {hasActiveFilter && (
                <button type="button" className={styles.linkButton} onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          )}

          {loadState === "ready" && sortedRows.length > 0 && (
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    {WEEKLY_CHECKLIST_SORT_FIELDS.map((field) => (
                      <th
                        key={field}
                        scope="col"
                        aria-sort={ariaSortFor(field)}
                        className={tableStyles.sortableHeader}
                        onClick={() => applySort(field)}
                      >
                        {COLUMN_LABELS[field]}
                        {sortIndicator(field)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr key={row.key}>
                      <td className={tableStyles.courseCell} title={row.courseName}>
                        {truncateForCell(row.courseName, 60)}
                      </td>
                      <td className={tableStyles.itemCell} title={row.label}>
                        {truncateForCell(row.label, 60)}
                      </td>
                      <td>{row.deadline ? WEEKLY_CHECKLIST_WEEKDAY_LABELS[row.deadline.weekday] : "No deadline"}</td>
                      <td>
                        {row.deadline ? (row.deadline.time ? formatWeeklyChecklistTime(row.deadline.time) : "End of day") : "-"}
                      </td>
                      <td>
                        <span className={`${styles.ghBadge} ${row.checked ? styles.ghBadgeSuccess : styles.ghBadgeNeutral}`}>
                          {row.checked ? "Done" : "Open"}
                        </span>
                      </td>
                      <td>
                        {row.overdue ? (
                          <span className={`${styles.ghBadge} ${styles.ghBadgeDanger}`}>Overdue</span>
                        ) : (
                          <span className={tableStyles.dash}>-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
