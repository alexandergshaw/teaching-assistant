"use client";

// The Tasks tab's toolbar: search, Institution/Term filters, the
// outstanding-only toggle, density + highlight-outstanding switches, the
// sort control, the per-view column chooser, CSV export, and the entry
// point into the Manage Tasks dialog (AC7/AC8/AC10). Every control here is
// presentation only - state lives in TasksTab, this file just renders it and
// forwards changes, so the persistence (AC7 item 38) and the actual
// filter/sort/CSV logic (course-tasks-view.ts) stay out of a component this
// codebase's vitest setup can never execute.
import { useId, useState } from "react";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import ListSubheader from "@mui/material/ListSubheader";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import Checkbox from "@mui/material/Checkbox";
import Switch from "@mui/material/Switch";
import Button from "@mui/material/Button";
import ListItemText from "@mui/material/ListItemText";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Popover from "@mui/material/Popover";
import type { TaskDefinition, TaskGroupId } from "@/lib/course-tasks";
import {
  ALL_FILTER,
  taskSortFromValueKey,
  taskSortValueKey,
  type TaskColumnFilters,
  type TaskSortState,
} from "@/lib/course-tasks-view";
import type { Density } from "./TasksGrid";
import { StatusGlyph } from "./TaskCell";
import TasksFilterChips from "./TasksFilterChips";
import styles from "./TasksGrid.module.css";

// TRAP (item 200): `TaskSortField` gained a fifth member, "task", when this
// feature added column sorting. This record used to be keyed by
// `TaskSortField` directly, which made it an EXHAUSTIVE `Record` over that
// union - the moment "task" was added there, this stopped compiling for the
// whole app. It is re-keyed to its OWN four-field type instead: the Sort
// select's task-column options are rendered separately below (grouped under
// headings, item 227), so this map never needed a "task" entry to begin
// with.
type BaseSortField = "name" | "institution" | "term" | "progress";
const SORT_FIELD_LABELS: Record<BaseSortField, string> = {
  name: "Course",
  institution: "Institution",
  term: "Term",
  progress: "Progress",
};

export interface TasksToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  institution: string;
  onInstitutionChange: (v: string) => void;
  institutionOptions: string[];
  term: string;
  onTermChange: (v: string) => void;
  termOptions: string[];
  outstandingOnly: boolean;
  onOutstandingOnlyChange: (v: boolean) => void;
  outstandingOnlyDisabled: boolean;
  highlightOutstanding: boolean;
  onHighlightOutstandingChange: (v: boolean) => void;
  density: Density;
  onDensityChange: (v: Density) => void;
  sort: TaskSortState;
  onSortChange: (v: TaskSortState) => void;
  tasks: TaskDefinition[];
  groups: { id: TaskGroupId; label: string }[];
  visibleColumnIds: ReadonlySet<string>;
  onToggleColumn: (taskId: string) => void;
  onShowAllColumns: () => void;
  onDownloadCsv: () => void;
  onManageTasks: () => void;
  summaryText: string;
  /** BLOCKER 2 (Tasks-tab UX audit): the SAME announcement string the tab's
   * srOnly live region carries, rendered visibly beside `summaryText` - a
   * bulk outcome ("Set X to Y for 3 of 26 courses.") used to reach a
   * sighted instructor nowhere but that 1px-clipped region. */
  statusText: string;
  /** SHOULD 8: a manual refresh entry point next to Download CSV, matching
   * CoursesTable.tsx's own Refresh button - previously the only way to force
   * a fresh load was the Retry button, which only appeared after a
   * NON-silent failure. */
  refreshing: boolean;
  onRefresh: () => void;
  periodCaption?: string;

  // AC-E: the active-filter chip row (item 225-226), rendered here (plan
  // step 6) rather than by TasksTab directly, since every constraint it
  // names - search/institution/term/outstandingOnly above, plus column
  // filters here - is already a prop of this component.
  columnFilters: TaskColumnFilters;
  onClearColumnFilter: (taskId: string) => void;
  onClearAllFilters: () => void;
}

export default function TasksToolbar({
  search,
  onSearchChange,
  institution,
  onInstitutionChange,
  institutionOptions,
  term,
  onTermChange,
  termOptions,
  outstandingOnly,
  onOutstandingOnlyChange,
  outstandingOnlyDisabled,
  highlightOutstanding,
  onHighlightOutstandingChange,
  density,
  onDensityChange,
  sort,
  onSortChange,
  tasks,
  groups,
  visibleColumnIds,
  onToggleColumn,
  onShowAllColumns,
  onDownloadCsv,
  onManageTasks,
  summaryText,
  statusText,
  refreshing,
  onRefresh,
  periodCaption,
  columnFilters,
  onClearColumnFilter,
  onClearAllFilters,
}: TasksToolbarProps) {
  const [columnsAnchor, setColumnsAnchor] = useState<HTMLElement | null>(null);
  const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null);
  const sortLabelId = useId();

  // item 227: the Sort select lists every VISIBLE task column (a hidden one
  // is not reachable, matching item 211/228's "not shown as active" rule for
  // filters) grouped under its own task group's heading, so sorting by a
  // column is reachable without horizontal-scrolling to find its header.
  const visibleTasks = tasks.filter((t) => visibleColumnIds.has(t.id));

  // item 227: the decoder (taskSortFromValueKey) is what clears a stale
  // taskId, not this handler - it is built from the DECODED partial sort
  // plus the untouched direction, never from `{...sort, field}`, which is
  // exactly the spread that let a stale taskId survive a switch away from a
  // column sort and reach `persistUiState`'s JSON.stringify.
  const handleSortFieldChange = (value: string) => {
    onSortChange({ ...taskSortFromValueKey(value), direction: sort.direction });
  };

  return (
    <>
      <div className={styles.toolbar}>
        {/* S15: the accessible name used to be the placeholder alone, which
            vanishes the instant the user types anything - an explicit
            aria-label keeps naming the field regardless of its value. */}
        <TextField
          size="small"
          type="search"
          placeholder="Search courses, institutions, terms, notes…"
          aria-label="Search courses, institutions, terms, notes"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          sx={{ flex: "1 1 220px" }}
        />

        {/* B5: an explicit aria-label - MUI's SelectInput renders
            role="combobox", which does not take its accessible name from
            its own contents (the "All institutions" MenuItem is content,
            not a label), so with neither a `label`+labelId FormControl nor
            an aria-label the name was simply omitted. */}
        <Select
          size="small"
          value={institution}
          onChange={(e) => onInstitutionChange(e.target.value)}
          displayEmpty
          aria-label="Institution"
        >
          <MenuItem value={ALL_FILTER}>All institutions</MenuItem>
          {institutionOptions.map((opt) => (
            <MenuItem key={opt} value={opt}>
              {opt}
            </MenuItem>
          ))}
        </Select>

        <Select size="small" value={term} onChange={(e) => onTermChange(e.target.value)} displayEmpty aria-label="Term">
          <MenuItem value={ALL_FILTER}>All terms</MenuItem>
          {termOptions.map((opt) => (
            <MenuItem key={opt} value={opt}>
              {opt}
            </MenuItem>
          ))}
        </Select>

        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={outstandingOnly}
              disabled={outstandingOnlyDisabled}
              onChange={(e) => onOutstandingOnlyChange(e.target.checked)}
            />
          }
          label="Outstanding only"
        />

        <div className={styles.toolbarDivider} />

        <div className={styles.toolbarGroup}>
          {/* B5: the visible "Sort" caption becomes the Select's real
              InputLabel (associated via labelId) instead of a plain <span>
              associated with nothing - "the visible <span> labels should
              become real InputLabels rather than being duplicated". */}
          <FormControl size="small">
            <InputLabel id={sortLabelId}>Sort</InputLabel>
            {/* item 227: a `<select>` carries exactly one string, so the
                option value is the opaque key taskSortValueKey/
                taskSortFromValueKey round-trip ("name", "progress",
                "task:<id>") - never the raw field, which cannot represent
                which task column is meant. */}
            <Select
              size="small"
              labelId={sortLabelId}
              label="Sort"
              value={taskSortValueKey(sort)}
              onChange={(e) => handleSortFieldChange(e.target.value)}
            >
              {(Object.keys(SORT_FIELD_LABELS) as BaseSortField[]).map((field) => (
                <MenuItem key={field} value={field}>
                  {SORT_FIELD_LABELS[field]}
                </MenuItem>
              ))}
              {groups.map((group) => {
                const groupTasks = visibleTasks.filter((t) => t.group === group.id);
                if (groupTasks.length === 0) return null;
                return [
                  <ListSubheader key={`${group.id}-heading`}>{group.label}</ListSubheader>,
                  ...groupTasks.map((task) => (
                    <MenuItem key={task.id} value={taskSortValueKey({ field: "task", taskId: task.id, direction: "asc" })}>
                      {task.label}
                    </MenuItem>
                  )),
                ];
              })}
            </Select>
          </FormControl>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={sort.direction}
            onChange={(_, v) => v && onSortChange({ ...sort, direction: v })}
          >
            <ToggleButton value="asc" aria-label="Sort ascending">
              {"▲"}
            </ToggleButton>
            <ToggleButton value="desc" aria-label="Sort descending">
              {"▼"}
            </ToggleButton>
          </ToggleButtonGroup>
        </div>

        <div className={styles.toolbarDivider} />

        <div className={styles.toolbarGroup}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Density</span>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={density}
            onChange={(_, v: Density | null) => v && onDensityChange(v)}
          >
            <ToggleButton value="compact" aria-label="Compact row height">
              Compact
            </ToggleButton>
            <ToggleButton value="default" aria-label="Default row height">
              Default
            </ToggleButton>
            <ToggleButton value="comfortable" aria-label="Comfortable row height">
              Comfortable
            </ToggleButton>
          </ToggleButtonGroup>
        </div>

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={highlightOutstanding}
              onChange={(e) => onHighlightOutstandingChange(e.target.checked)}
            />
          }
          label="Highlight outstanding"
        />

        <div className={styles.toolbarDivider} />

        <Button variant="text" size="small" onClick={(e) => setColumnsAnchor(e.currentTarget)}>
          Columns
        </Button>
        {/* S14: `Popover`, not `Menu` - a MUI `Menu`'s single child used to
            be a `<div>` of headings, a "Show all columns" button, and forty
            checkboxes, none of which are valid `MenuList` children under
            the `role="menu"` that component renders, and there is nothing
            here for `MenuList`'s own arrow-key model to traverse (checkboxes
            and a plain button, not menuitems). `Popover` is a plain
            positioned panel with no such role contract. */}
        <Popover
          anchorEl={columnsAnchor}
          open={Boolean(columnsAnchor)}
          onClose={() => setColumnsAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          <div className={styles.columnList} style={{ padding: "4px 8px" }} aria-label="Choose visible columns">
            <button type="button" className={styles.taskRow} onClick={onShowAllColumns}>
              <ListItemText primary="Show all columns" />
            </button>
            {groups.map((group) => (
              <div key={group.id}>
                <div className={styles.groupHeading}>{group.label}</div>
                {tasks
                  .filter((t) => t.group === group.id)
                  .map((task) => (
                    <FormControlLabel
                      key={task.id}
                      className={styles.taskRow}
                      control={
                        <Checkbox
                          size="small"
                          checked={visibleColumnIds.has(task.id)}
                          onChange={() => onToggleColumn(task.id)}
                        />
                      }
                      label={<span className={styles.taskRowLabel}>{task.label}</span>}
                    />
                  ))}
              </div>
            ))}
          </div>
        </Popover>

        {/* SHOULD 8: matches CoursesTable.tsx's own Refresh button exactly -
            disabled label while a silent background reload is in flight. */}
        <Button variant="text" size="small" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>

        <Button variant="text" size="small" onClick={onDownloadCsv}>
          Download CSV
        </Button>

        <Button variant="text" size="small" onClick={onManageTasks}>
          Manage tasks
        </Button>

        <Button variant="text" size="small" onClick={(e) => setHelpAnchor(e.currentTarget)} aria-label="Keyboard shortcuts">
          Shortcuts
        </Button>
        <Popover
          open={Boolean(helpAnchor)}
          anchorEl={helpAnchor}
          onClose={() => setHelpAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          <div style={{ padding: 14, maxWidth: 320, display: "flex", flexDirection: "column", gap: 6, fontSize: "0.8rem" }}>
            <strong>Keyboard shortcuts</strong>
            <span>Arrow keys / Home / End / Page Up / Page Down - move around the grid</span>
            <span>Enter or Space - cycle a cell&apos;s status</span>
            <span>
              <StatusGlyph status="done" /> d done &middot; <StatusGlyph status="open" /> o open &middot;{" "}
              <StatusGlyph status="blocked" /> n blocked &middot; <StatusGlyph status="na" /> a n/a
            </span>
            <span>F2 or right-click - open a cell&apos;s status/note menu</span>
            <span>Escape - close the menu</span>
            <span>Ctrl+D - fill the cell&apos;s value down its column</span>
          </div>
        </Popover>
      </div>

      {/* AC-E item 225: a filtered table must never look identical to an
          unfiltered one - a column filter can otherwise sit off-screen
          behind a horizontal scroll or a hidden column and silently change
          what the instructor is reading. `tasks` is filtered to VISIBLE
          columns here, same rule item 228 applies everywhere else: a filter
          on a hidden column is not applied, so it is not shown as active. */}
      <TasksFilterChips
        search={search}
        onClearSearch={() => onSearchChange("")}
        institution={institution}
        onClearInstitution={() => onInstitutionChange(ALL_FILTER)}
        term={term}
        onClearTerm={() => onTermChange(ALL_FILTER)}
        outstandingOnly={outstandingOnly}
        onClearOutstandingOnly={() => onOutstandingOnlyChange(false)}
        columnFilters={columnFilters}
        tasks={visibleTasks}
        onClearColumnFilter={onClearColumnFilter}
        onClearAll={onClearAllFilters}
      />

      <div className={styles.summaryBar}>
        <span className={styles.summaryFigure}>{summaryText}</span>
        {/* BLOCKER 2: visible counterpart of the tab's srOnly announcement
            region - see this prop's own doc comment above. */}
        {statusText && <span className={styles.bulkStatusLine}>{statusText}</span>}
      </div>
      {periodCaption && <p className={styles.periodCaption}>{periodCaption}</p>}
    </>
  );
}
