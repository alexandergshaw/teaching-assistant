"use client";

// "Weekly Checklist Overview" - the FAB's third action (AiChatFab.tsx):
// every weekly checklist item across EVERY course, in one sortable table.
//
// THIS REVERSES commit db0d3f1's decision to render this as a centered
// previewBackdrop/previewModal (a "glance and close" snapshot, the same
// pattern CsvPreviewModal/RubricPreviewModal/SyllabusPreviewModal/AskAiModal
// still use). That decision was deliberate at the time, but asking for drag
// and resize is asking for floating-window behavior, which a centered modal
// cannot give without stretching the modal pattern past what it means
// everywhere else in this app - so this is now a THIRD floating window,
// alongside the AI Chatbot and Live Class windows AiChatFab.tsx already
// owns, reusing their exact shell (styles.selectionChatWindow /
// selectionChatHeader / selectionChatClose - see page.module.css) and drag
// algorithm (useWindowHeaderDrag, extracted from AiChatFab.tsx once a THIRD
// window needed the identical mousedown/mousemove/mouseup dance).
//
// Consequences of that reversal, decided explicitly rather than left
// implicit:
//   - Small by default (WEEKLY_CHECKLIST_OVERVIEW_WINDOW_W/H in
//     weekly-checklist-overview-window.ts), not the old previewModal's
//     980x860 - see that file's own comment for exactly why 560x480.
//   - Position AND size now persist across reloads, under this file's own
//     "ta-weekly-checklist-overview-*" keys (matching the sort/search/
//     hide-done keys already below, not AiChatFab's separate "ta:" colon
//     convention) - restored values are sanitized and clamped back into the
//     viewport by weekly-checklist-overview-window.ts, so a corrupt or
//     now-off-screen value can never make the window unreachable.
//   - AiChatFab now also persists this window's open/closed state
//     (checklistOverviewOpen), matching the AI Chatbot/Live Class windows -
//     it is a genuine floating workspace now, not a glance-and-close
//     snapshot, so staying open across a session (and across a reload) is
//     the more honest behavior.
//   - That persistence brings back exactly the staleness risk the old
//     modal's "always re-fetch on open" comment used to call out: a window
//     that can stay open/mounted for a long time while the instructor works
//     elsewhere in the app (toggling checklist items from the Courses tab,
//     for instance) will show what it fetched at mount, not necessarily
//     what is true right now. Handled two ways, not one: (1) the fetch
//     effect below still runs on every MOUNT, and a mount happens both on a
//     fresh page load with the window left open and on every dial click
//     that reopens it - so "every open re-fetches" still holds exactly as
//     it did before; (2) a manual Refresh control in the header covers the
//     remaining gap, a long-lived mount whose data has since drifted,
//     without asking the instructor to close and reopen the window just to
//     force a re-fetch.
//   - No backdrop click to close (a floating window has no backdrop, unlike
//     a modal) - the header's "x" Close button is the sole close affordance,
//     exactly matching the AI Chatbot and Live Class windows, which never
//     had a backdrop either.
//
// READ-ONLY (AC6, unchanged by this reversal): there is deliberately no
// checkbox here to toggle an item's checked state. WeeklyChecklistCell.tsx's
// toggle path now also triggers a scoped Google Calendar write
// (syncChecklistItemCalendarAction) - a second, independent mutation path
// built against that moving target here would race it. Toggling from this
// window is a deliberate FOLLOW-UP, not an oversight; checked state is
// displayed clearly (a text-labeled badge, not a color-only dot) but can
// only be changed from the course's own Weekly Checklist column.
import { useCallback, useEffect, useRef, useState } from "react";
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
import { resolveInitialWindowRect, type WindowPos } from "./weekly-checklist-overview-window";
import { useWindowHeaderDrag } from "@/hooks/useWindowHeaderDrag";
import styles from "../../page.module.css";
import tableStyles from "./WeeklyChecklistOverviewModal.module.css";

const SORT_KEY = "ta-weekly-checklist-overview-sort";
const SEARCH_KEY = "ta-weekly-checklist-overview-search";
const HIDE_DONE_KEY = "ta-weekly-checklist-overview-hide-done";
const POS_KEY = "ta-weekly-checklist-overview-pos";
const SIZE_KEY = "ta-weekly-checklist-overview-size";

// Anchored bottom-right like the other two floating windows (AiChatFab's
// CHAT_W/CHAT_H and LIVE_CLASS_WINDOW_W/H both use the same DIAL_RIGHT=24 /
// bottom=100 margin against the FAB) - one shared default-placement scheme
// for every window this app opens, not a bespoke one for this window alone.
const WINDOW_MARGIN = { right: 24, bottom: 100 };

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

/** Parses a possibly-corrupt persisted JSON value; returns null rather than
 * throwing so a hand-edited or truncated localStorage entry falls back to a
 * computed default instead of crashing the window (AC3). */
function readJSON(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or private-browsing restriction - silently ignore, same
    // as AiChatFab's writeLS.
  }
}

// This component only ever mounts client-side, gated behind
// `checklistOverviewOpen` in AiChatFab.tsx (never during SSR - even now that
// open/closed state persists across reloads, the very first client render
// still runs after hydration), so `window` is always available the moment
// this runs - unlike AiChatFab itself, no `mounted`-gate dance is needed
// here.
function computeInitialViewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

export default function WeeklyChecklistOverviewModal({ onClose }: { onClose: () => void }) {
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">("loading");
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped by Refresh (both the header's always-available control and the
  // error state's "Try again" button) to re-run the fetch effect below;
  // also what the very first (mount) fetch runs against, at its initial
  // value of 0.
  const [reloadToken, setReloadToken] = useState(0);

  const [search, setSearch] = useState<string>(() => readLocal(SEARCH_KEY, ""));
  const [hideDone, setHideDone] = useState<boolean>(() => readLocal(HIDE_DONE_KEY, "false") === "true");
  const [sort, setSort] = useState<WeeklyChecklistSortState>(() =>
    parseWeeklyChecklistSortState(typeof window === "undefined" ? null : localStorage.getItem(SORT_KEY))
  );

  // Resolved once, on mount: sanitizes whatever was persisted, falls back to
  // the small default size / a bottom-right-anchored default position, and
  // clamps both into the current viewport (AC3). Kept as ONE state atom
  // whose setter is never called - a stable, render-safe way to compute
  // this exactly once and read both halves later (a plain ref cannot be
  // WRITTEN from inside a useState initializer function; only read/written
  // from effects and event handlers - see react-hooks/refs).
  const [initialRect] = useState(() =>
    resolveInitialWindowRect(readJSON(POS_KEY), readJSON(SIZE_KEY), computeInitialViewport(), WINDOW_MARGIN)
  );

  const [pos, setPosState] = useState<WindowPos>(initialRect.pos);
  const posRef = useRef<WindowPos>(pos);
  const setPos = useCallback((next: WindowPos) => {
    posRef.current = next;
    setPosState(next);
    writeJSON(POS_KEY, next);
  }, []);
  const onHeaderMouseDown = useWindowHeaderDrag(posRef, setPos);

  const containerRef = useRef<HTMLDivElement>(null);

  // Applies the resolved initial size imperatively, ONCE, directly on the
  // DOM node - deliberately NOT through the `style` prop. If width/height
  // were part of the `style` object instead, React would re-apply that same
  // fixed value on every re-render (a search keystroke, the data finishing
  // loading, a sort click...), silently undoing the user's own native
  // resize-handle drag the very next time anything caused this component to
  // re-render. Leaving width/height out of `style` entirely means React
  // never touches those two CSS properties again after this effect runs, so
  // the browser's native `resize: both` handle (from
  // styles.selectionChatWindow) keeps full, uninterrupted ownership of the
  // box size afterward.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.style.width = `${initialRect.size.width}px`;
    el.style.height = `${initialRect.size.height}px`;
  }, [initialRect]);

  // Observes the window's rendered size (however it changed - only the
  // native resize handle can change it, since React never touches
  // width/height itself per the effect above) and persists it, debounced,
  // so the NEXT mount restores the size the user actually left it at (AC3).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      if (timeoutId) clearTimeout(timeoutId);
      // Debounced - resize fires continuously while the handle is being
      // dragged; only the size after the user lets go needs to reach
      // localStorage.
      timeoutId = setTimeout(() => {
        const rect = el.getBoundingClientRect();
        writeJSON(SIZE_KEY, { width: Math.round(rect.width), height: Math.round(rect.height) });
      }, 200);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // The fetch happens when this component mounts, which - even now that
  // checklistOverviewOpen persists across reloads - only happens once the
  // window is actually open: either a fresh page load with it left open, or
  // a dial click that reopens it. Either way this is "every open
  // re-fetches", never eagerly on app load while the window is closed.
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

  const refresh = () => {
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
    <div
      ref={containerRef}
      className={styles.selectionChatWindow}
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label="Weekly Checklist Overview"
    >
      <div className={styles.selectionChatHeader} onMouseDown={onHeaderMouseDown}>
        <div className={styles.selectionChatHeaderLeft}>
          <ChecklistIcon />
          <span>Weekly Checklist Overview</span>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button
            type="button"
            className={styles.selectionChatClose}
            onClick={refresh}
            disabled={loadState === "loading"}
            aria-label="Refresh"
            title="Refresh - re-fetch the latest checklist data"
          >
            <RefreshIcon />
          </button>
          <button type="button" className={styles.selectionChatClose} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
      </div>

      <p className={styles.selectionChatContext}>
        {loadState === "ready" && courses
          ? `${sortedRows.length} of ${allRows.length} item${allRows.length === 1 ? "" : "s"} across ${courses.length} course${courses.length === 1 ? "" : "s"}`
          : "Every weekly checklist item, across every course"}
      </p>

      <div className={tableStyles.toolbar}>
        <TextField
          size="small"
          placeholder="Search course or item…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={loadState !== "ready"}
          sx={{ minWidth: 160, flex: "1 1 160px" }}
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

      <div className={tableStyles.windowBody}>
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
            <Button size="small" variant="outlined" onClick={refresh}>
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
    </div>
  );
}

export function ChecklistIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M9 5h11a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2zm0 6h11a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2zm0 6h11a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2z"
        fill="currentColor"
      />
      <path
        d="M4.7 4.3a1 1 0 0 1 1.4 0L7 5.3l1.9-1.9a1 1 0 1 1 1.4 1.4l-2.6 2.6a1 1 0 0 1-1.4 0L4.7 5.7a1 1 0 0 1 0-1.4zm0 6a1 1 0 0 1 1.4 0L7 11.3l1.9-1.9a1 1 0 1 1 1.4 1.4l-2.6 2.6a1 1 0 0 1-1.4 0l-1.6-1.6a1 1 0 0 1 0-1.4zm0 6a1 1 0 0 1 1.4 0L7 17.3l1.9-1.9a1 1 0 1 1 1.4 1.4l-2.6 2.6a1 1 0 0 1-1.4 0l-1.6-1.6a1 1 0 0 1 0-1.4z"
        fill="currentColor"
      />
    </svg>
  );
}

// Same glyph as AiChatWindow.tsx's ResendIcon (a circular reload arrow) -
// this window's header button means "refresh," a different action from
// "edit and resend," but the same icon shape is the right visual language
// for both.
function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M15.312 11.424a5.5 5.5 0 0 1-9.201-4.925A5.5 5.5 0 0 1 15.1 4.9l1.647 1.629A.75.75 0 0 0 18 6V2a.75.75 0 0 0-.75-.75h-4a.75.75 0 0 0-.482 1.32l1.18 1.168a7 7 0 1 0 1.706 7.197.75.75 0 1 0-1.42-.49 5.502 5.502 0 0 1-.922 1.979Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
