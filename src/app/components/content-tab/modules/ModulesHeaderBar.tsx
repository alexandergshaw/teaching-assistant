"use client";

import type React from "react";
import { Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import type { CanvasModule, CanvasRubric } from "@/lib/canvas-modules";
import styles from "../../../page.module.css";
import type { RubricBuilderTarget } from "./useRubrics";

export interface ModulesHeaderBarProps {
  courseName?: string;
  onExport: () => void;
  onImport: () => void;
  canCopy: boolean;
  reload: () => void;
  busy: boolean;
  refreshing: boolean;
  moduleSearch: string;
  setModuleSearch: (v: string) => void;
  allSelected: boolean;
  toggleAll: () => void;
  allKeysLength: number;
  allModulesSelected: boolean;
  toggleAllModules: () => void;
  visibleModulesLength: number;
  selectByKind: (kind: string) => void;
  modules: CanvasModule[];
  setBulkUploadOpen: (v: boolean) => void;
  setRenameOpen: (v: boolean) => void;
  setScheduleOpen: (v: boolean) => void;
  rubrics: CanvasRubric[];
  setRubricBuilder: React.Dispatch<React.SetStateAction<RubricBuilderTarget | null>>;
  editRubricId: number | "";
  setEditRubricId: (v: number | "") => void;
}

// Sticky-header top bar: course title + copy/import/refresh, the module/item
// search box, and the select / files / modules / rubrics quick-action bar.
export function ModulesHeaderBar({
  courseName,
  onExport,
  onImport,
  canCopy,
  reload,
  busy,
  refreshing,
  moduleSearch,
  setModuleSearch,
  allSelected,
  toggleAll,
  allKeysLength,
  allModulesSelected,
  toggleAllModules,
  visibleModulesLength,
  selectByKind,
  modules,
  setBulkUploadOpen,
  setRenameOpen,
  setScheduleOpen,
  rubrics,
  setRubricBuilder,
  editRubricId,
  setEditRubricId,
}: ModulesHeaderBarProps) {
  return (
    <>
      <div className={styles.ccHeaderTop}>
        <h2 className={styles.ccCourseTitle}>{courseName || "Course content"}</h2>
        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Course copy</span>
          <Button
            variant="outlined"
            size="small"
            onClick={onExport}
            disabled={!canCopy}
            title="Copy this course's content into other courses"
          >
            Copy to…
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={onImport}
            disabled={!canCopy}
            title="Import another course's content into this one"
          >
            Import from…
          </Button>
          <span className={styles.ccBarDivider} aria-hidden="true" />
          <Button
            variant="outlined"
            size="small"
            onClick={reload}
            disabled={busy || refreshing}
            title="Reload this course's content"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>
      <TextField
        type="search"
        size="small"
        fullWidth
        placeholder="Search modules and their items by name…"
        value={moduleSearch}
        onChange={(e) => setModuleSearch(e.target.value)}
      />
      <div className={styles.ccBar}>
        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Select</span>
          <FormControlLabel
            control={<Checkbox checked={allSelected} onChange={toggleAll} disabled={allKeysLength === 0} size="small" />}
            label="Items"
          />
          <FormControlLabel
            control={<Checkbox checked={allModulesSelected} onChange={toggleAllModules} disabled={visibleModulesLength === 0} size="small" />}
            label="Modules"
          />
          <TextField
            select
            size="small"
            sx={{ maxWidth: 150 }}
            value=""
            disabled={visibleModulesLength === 0}
            onChange={(e) => selectByKind(e.target.value)}
            aria-label="Select all items of a type"
          >
            <MenuItem value="">By type…</MenuItem>
            <MenuItem value="Graded">Graded items</MenuItem>
            <MenuItem value="Assignment">Assignments</MenuItem>
            <MenuItem value="Quiz">Quizzes</MenuItem>
            <MenuItem value="Discussion">Discussions</MenuItem>
            <MenuItem value="Page">Pages</MenuItem>
            <MenuItem value="File">Files</MenuItem>
          </TextField>
        </div>

        <span className={styles.ccBarDivider} aria-hidden="true" />

        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Files</span>
          <Button variant="outlined" size="small" onClick={() => setBulkUploadOpen(true)} disabled={busy || modules.length === 0}>
            Bulk upload
          </Button>
        </div>

        <span className={styles.ccBarDivider} aria-hidden="true" />

        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Modules</span>
          <Button variant="outlined" size="small" onClick={() => setRenameOpen(true)} disabled={busy || modules.length === 0}>
            Rename
          </Button>
          <Button variant="outlined" size="small" onClick={() => setScheduleOpen(true)} disabled={busy || modules.length === 0}>
            Schedule due dates
          </Button>
        </div>

        <span className={styles.ccBarDivider} aria-hidden="true" />

        <div className={styles.ccBarGroup}>
          <span className={styles.ccBarLabel}>Rubrics</span>
          <Button variant="outlined" size="small" onClick={() => setRubricBuilder({ assignments: [] })}>
            New
          </Button>
          <TextField
            select
            size="small"
            sx={{ maxWidth: 180 }}
            value={editRubricId}
            disabled={rubrics.length === 0}
            onChange={(e) => setEditRubricId(e.target.value === "" ? "" : Number(e.target.value))}
            aria-label="Rubric to edit"
          >
            <MenuItem value="">{rubrics.length === 0 ? "No rubrics" : "Edit…"}</MenuItem>
            {rubrics.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.title}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="outlined"
            size="small"
            disabled={editRubricId === ""}
            onClick={() => editRubricId !== "" && setRubricBuilder({ assignments: [], editRubricId: Number(editRubricId) })}
          >
            Edit
          </Button>
        </div>
      </div>
    </>
  );
}
