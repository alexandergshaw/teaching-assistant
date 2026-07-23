"use client";

import type React from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import type { CanvasModule, CanvasModuleItem, CanvasRubric } from "@/lib/canvas-modules";
import styles from "../../../page.module.css";
import type { RubricBuilderTarget } from "./useRubrics";

export interface BulkItemsSectionProps {
  opBusy: boolean;
  selectedItems: () => Array<{ item: CanvasModuleItem; moduleId: number }>;
  setEditingItem: (item: CanvasModuleItem) => void;
  onEditPage: (pageUrl: string) => void;
  bulkPublish: (published: boolean) => void;
  descSharedState: "idle" | "loading" | "same" | "mixed";
  bulkItemsDescription: string;
  setBulkItemsDescription: (v: string) => void;
  bulkSetDescription: () => void;
  bulkItemsQuestions: unknown[];
  setBulkItemsQuestionsOpen: (v: boolean) => void;
  bulkAddQuestionsToQuizzes: () => void;
  bulkDue: string;
  setBulkDue: (v: string) => void;
  bulkSetDue: () => void;
  bulkShift: number;
  setBulkShift: (v: number) => void;
  bulkShiftDue: () => void;
  bulkStaggerOffset: number;
  setBulkStaggerOffset: (v: number) => void;
  bulkStaggerUnit: "weeks" | "days";
  setBulkStaggerUnit: (v: "weeks" | "days") => void;
  bulkStaggerDue: () => void;
  bulkPoints: string;
  setBulkPoints: (v: string) => void;
  bulkSetPoints: () => void;
  bulkRubricId: number | "";
  setBulkRubricId: (v: number | "") => void;
  rubrics: CanvasRubric[];
  bulkRubric: () => void;
  setRubricBuilder: React.Dispatch<React.SetStateAction<RubricBuilderTarget | null>>;
  openRubricBuilder: () => void;
  bulkSubType: string;
  setBulkSubType: (v: string) => void;
  bulkUpdateSubmissionType: () => void;
  selectedAssignmentCount: () => number;
  bulkModuleShift: number;
  setBulkModuleShift: (v: number) => void;
  bulkShiftModules: (dir: -1 | 1) => void;
  bulkTargetModule: number | "";
  setBulkTargetModule: (v: number | "") => void;
  modules: CanvasModule[];
  bulkMoveToModule: () => void;
  bulkRemoveFromModule: () => void;
  bulkDeleteContent: () => void;
  confirmDeleteContent: boolean;
}

// Bulk bar section shown when one or more items are selected: publish, edit
// content/description/questions, due dates, grading, submission type, and
// cross-module move / remove / delete.
export function BulkItemsSection({
  opBusy,
  selectedItems,
  setEditingItem,
  onEditPage,
  bulkPublish,
  descSharedState,
  bulkItemsDescription,
  setBulkItemsDescription,
  bulkSetDescription,
  bulkItemsQuestions,
  setBulkItemsQuestionsOpen,
  bulkAddQuestionsToQuizzes,
  bulkDue,
  setBulkDue,
  bulkSetDue,
  bulkShift,
  setBulkShift,
  bulkShiftDue,
  bulkStaggerOffset,
  setBulkStaggerOffset,
  bulkStaggerUnit,
  setBulkStaggerUnit,
  bulkStaggerDue,
  bulkPoints,
  setBulkPoints,
  bulkSetPoints,
  bulkRubricId,
  setBulkRubricId,
  rubrics,
  bulkRubric,
  setRubricBuilder,
  openRubricBuilder,
  bulkSubType,
  setBulkSubType,
  bulkUpdateSubmissionType,
  selectedAssignmentCount,
  bulkModuleShift,
  setBulkModuleShift,
  bulkShiftModules,
  bulkTargetModule,
  setBulkTargetModule,
  modules,
  bulkMoveToModule,
  bulkRemoveFromModule,
  bulkDeleteContent,
  confirmDeleteContent,
}: BulkItemsSectionProps) {
  return (
    <>
      <div className={styles.bulkRow}>
        <span className={styles.bulkLabel}>Items</span>
        <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkPublish(true)}>
          Publish
        </Button>
        <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkPublish(false)}>
          Unpublish
        </Button>
        {selectedItems().length === 1 &&
          (() => {
            const one = selectedItems()[0];
            if (!one) return null;
            const it = one.item;
            if (["Assignment", "Quiz", "Discussion"].includes(it.type) && it.contentId != null) {
              return (
                <Button variant="outlined" size="small" onClick={() => setEditingItem(it)} title="Edit every attribute of this item">
                  Edit in detail
                </Button>
              );
            }
            if (it.type === "Page" && it.pageUrl) {
              return (
                <Button variant="outlined" size="small" onClick={() => onEditPage(it.pageUrl!)} title="Edit this page">
                  Edit page
                </Button>
              );
            }
            return null;
          })()}
      </div>
      <div className={styles.bulkRow}>
        <span className={styles.bulkLabel}>Content</span>
        {descSharedState === "loading" && (
          <span className={styles.bulkFieldLabel}>Checking descriptions…</span>
        )}
        {descSharedState === "same" && (
          <span className={styles.bulkFieldLabel}>Loaded the shared description — edits apply to all.</span>
        )}
        {descSharedState === "mixed" && (
          <span className={styles.bulkFieldLabel}>Selected items have different descriptions; typing replaces them all.</span>
        )}
        <TextField
          multiline
          minRows={4}
          fullWidth
          value={bulkItemsDescription}
          onChange={(e) => setBulkItemsDescription(e.target.value)}
          placeholder="Description (HTML allowed) — replaces the description on selected items / the body of selected pages"
          slotProps={{ htmlInput: { spellCheck: true } }}
          aria-label="Description to set on the selected items"
          size="small"
        />
        <Button variant="contained" size="small" disabled={opBusy} onClick={bulkSetDescription}>
          Set description
        </Button>
        <span className={styles.bulkField}>
          <Button variant="outlined" size="small" onClick={() => setBulkItemsQuestionsOpen(true)}>
            Edit questions{bulkItemsQuestions.length > 0 ? ` (${bulkItemsQuestions.length})` : ""}
          </Button>
          <Button variant="outlined" size="small" disabled={opBusy || bulkItemsQuestions.length === 0} onClick={bulkAddQuestionsToQuizzes}>
            Add to selected quizzes
          </Button>
        </span>
        <span className={styles.bulkHint}>
          Set description overwrites the description on selected assignments, quizzes, and discussions (and
          the body of selected pages). Questions are appended to every selected quiz.
        </span>
      </div>
      <div className={styles.bulkRow}>
        <span className={styles.bulkLabel}>Due dates</span>
        <TextField
          type="datetime-local"
          size="small"
          sx={{ width: 188 }}
          value={bulkDue}
          onChange={(e) => setBulkDue(e.target.value)}
          aria-label="Due date"
          slotProps={{ htmlInput: { } }}
        />
        <Button variant="contained" size="small" disabled={opBusy} onClick={bulkSetDue} title="Set this due date on all selected gradables">
          Set
        </Button>
        <span className={styles.bulkField}>
          <TextField
            type="number"
            size="small"
            sx={{ width: 56 }}
            value={bulkShift}
            onChange={(e) => setBulkShift(Number(e.target.value))}
            aria-label="Days to shift"
          />
          <Button variant="outlined" size="small" disabled={opBusy} onClick={bulkShiftDue}>
            Shift days
          </Button>
        </span>
        <span className={styles.bulkField}>
          <TextField
            type="number"
            size="small"
            slotProps={{ htmlInput: { min: 0 } }}
            sx={{ width: 52 }}
            value={bulkStaggerOffset}
            onChange={(e) => setBulkStaggerOffset(Number(e.target.value))}
            aria-label="Stagger interval"
          />
          <TextField
            select
            size="small"
            value={bulkStaggerUnit}
            onChange={(e) => setBulkStaggerUnit(e.target.value === "days" ? "days" : "weeks")}
            aria-label="Stagger interval unit"
          >
            <MenuItem value="weeks">weeks</MenuItem>
            <MenuItem value="days">days</MenuItem>
          </TextField>
          <Button variant="outlined" size="small" disabled={opBusy} onClick={bulkStaggerDue}>
            Stagger
          </Button>
        </span>
        <span className={styles.bulkHint}>
          Stagger gives the earliest selected module the date above, then adds the interval for each later module.
        </span>
      </div>
      <div className={styles.bulkRow}>
        <span className={styles.bulkLabel}>Grading</span>
        <span className={styles.bulkField}>
          <TextField
            type="number"
            size="small"
            sx={{ width: 74 }}
            placeholder="points"
            value={bulkPoints}
            onChange={(e) => setBulkPoints(e.target.value)}
            aria-label="Points"
          />
          <Button variant="outlined" size="small" disabled={opBusy} onClick={bulkSetPoints}>
            Set points
          </Button>
        </span>
        <span className={styles.bulkField}>
          <TextField
            select
            size="small"
            sx={{ maxWidth: 170 }}
            value={bulkRubricId}
            disabled={rubrics.length === 0}
            onChange={(e) => setBulkRubricId(e.target.value === "" ? "" : Number(e.target.value))}
            aria-label="Rubric"
          >
            <MenuItem value="">{rubrics.length === 0 ? "No rubrics" : "Rubric…"}</MenuItem>
            {rubrics.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.title}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="outlined" size="small" disabled={opBusy || bulkRubricId === ""} onClick={bulkRubric}>
            Associate
          </Button>
          <Button
            variant="outlined"
            size="small"
            disabled={opBusy || bulkRubricId === ""}
            onClick={() => bulkRubricId !== "" && setRubricBuilder({ assignments: [], editRubricId: Number(bulkRubricId) })}
          >
            Edit
          </Button>
        </span>
        <Button variant="outlined" size="small" disabled={opBusy} onClick={openRubricBuilder}>
          New rubric
        </Button>
      </div>
      <div className={styles.bulkRow}>
        <span className={styles.bulkLabel}>Submission type</span>
        <TextField
          select
          size="small"
          sx={{ minWidth: 180 }}
          value={bulkSubType}
          onChange={(e) => setBulkSubType(e.target.value)}
          aria-label="Submission type"
        >
          <MenuItem value="">Change submission type…</MenuItem>
          <MenuItem value="online_text_entry">Text entry</MenuItem>
          <MenuItem value="online_upload">File upload</MenuItem>
          <MenuItem value="online_url">Website URL</MenuItem>
          <MenuItem value="on_paper">On paper</MenuItem>
          <MenuItem value="none">No submission</MenuItem>
        </TextField>
        <Button variant="outlined" size="small" disabled={opBusy || bulkSubType === ""} onClick={bulkUpdateSubmissionType}>
          Apply
        </Button>
        <span className={styles.bulkHint}>
          {selectedAssignmentCount() > 0
            ? `${selectedAssignmentCount()} assignment${selectedAssignmentCount() === 1 ? "" : "s"} selected`
            : "Select assignment items to change their submission type."}
        </span>
      </div>
      <div className={styles.bulkRow}>
        <span className={styles.bulkLabel}>Move</span>
        <span className={styles.bulkField}>
          <TextField
            type="number"
            size="small"
            slotProps={{ htmlInput: { min: 1 } }}
            sx={{ width: 56 }}
            value={bulkModuleShift}
            onChange={(e) => setBulkModuleShift(Number(e.target.value))}
            aria-label="Modules to shift by"
          />
          <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkShiftModules(-1)}>
            Shift up
          </Button>
          <Button variant="outlined" size="small" disabled={opBusy} onClick={() => bulkShiftModules(1)}>
            Shift down
          </Button>
        </span>
        <span className={styles.bulkField}>
          <TextField
            select
            size="small"
            sx={{ maxWidth: 190 }}
            value={bulkTargetModule}
            disabled={modules.length === 0}
            onChange={(e) => setBulkTargetModule(e.target.value === "" ? "" : Number(e.target.value))}
            aria-label="Module to move items into"
          >
            <MenuItem value="">{modules.length === 0 ? "No modules" : "Move to module…"}</MenuItem>
            {modules.map((mod) => (
              <MenuItem key={mod.id} value={mod.id}>
                {mod.name}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="outlined" size="small" disabled={opBusy || bulkTargetModule === ""} onClick={bulkMoveToModule} title="Move selected items into this module">
            Move
          </Button>
        </span>
        <Button variant="outlined" size="small" disabled={opBusy} onClick={bulkRemoveFromModule} title="Remove selected items from their module">
          Remove
        </Button>
        <Button variant="outlined" size="small" color="error" disabled={opBusy} onClick={bulkDeleteContent}>
          {confirmDeleteContent ? "Confirm delete" : "Delete from Canvas"}
        </Button>
      </div>
    </>
  );
}
