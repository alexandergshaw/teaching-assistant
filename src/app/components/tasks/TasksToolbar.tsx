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
import { ALL_FILTER, type TaskSortField, type TaskSortState } from "@/lib/course-tasks-view";
import type { Density } from "./TasksGrid";
import { StatusGlyph } from "./TaskCell";
import styles from "./TasksGrid.module.css";

const SORT_FIELD_LABELS: Record<TaskSortField, string> = {
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
  periodCaption?: string;
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
  periodCaption,
}: TasksToolbarProps) {
  const [columnsAnchor, setColumnsAnchor] = useState<HTMLElement | null>(null);
  const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null);
  const sortLabelId = useId();

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
            <Select
              size="small"
              labelId={sortLabelId}
              label="Sort"
              value={sort.field}
              onChange={(e) => onSortChange({ ...sort, field: e.target.value as TaskSortField })}
            >
              {(Object.keys(SORT_FIELD_LABELS) as TaskSortField[]).map((field) => (
                <MenuItem key={field} value={field}>
                  {SORT_FIELD_LABELS[field]}
                </MenuItem>
              ))}
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

      <div className={styles.summaryBar}>
        <span className={styles.summaryFigure}>{summaryText}</span>
      </div>
      {periodCaption && <p className={styles.periodCaption}>{periodCaption}</p>}
    </>
  );
}
