"use client";

// The bulk-action bar shown once one or more rows are selected in
// CourseItemsView (Assignments/Quizzes tabs, Contract 2). Extracted out of
// CourseItemsView.tsx - which was again closing on this repo's 1000-line
// ceiling - the same way CourseItemRow.tsx was pulled out of that file
// earlier for the identical reason, and the same shape ModulesView's own
// BulkItemsSection.tsx already uses for its bulk bar: a purely presentational
// section that owns none of the state or write logic, only the controls that
// read and invoke it. Every handler and piece of state this bar needs is
// passed in; it recomputes nothing CourseItemsView.tsx has already resolved
// (eligibleAssignmentCount, confirmDelete, etc - see that file's own
// comments for why each of those exists).
//
// The outer `{selection.selected.size > 0 && (...)}` gate stays in
// CourseItemsView.tsx (matching BulkItemsSection's own call site in
// ModulesView.tsx) - this component is only ever rendered while at least one
// row is selected, so it does not re-check that itself.
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import type { CanvasRubric } from "@/lib/canvas-modules";
import styles from "../../page.module.css";

const SUBMISSION_TYPE_OPTIONS = [
  { value: "online_text_entry", label: "Text entry" },
  { value: "online_upload", label: "File upload" },
  { value: "online_url", label: "Website URL" },
  { value: "on_paper", label: "On paper" },
  { value: "none", label: "No submission" },
];

export interface CourseItemsBulkBarProps {
  kind: "Assignment" | "Quiz";
  kindLabelSingular: string;
  kindLabelPlural: string;
  selectedCount: number;
  onClearSelection: () => void;
  busy: boolean;
  bulkPublish: (published: boolean) => void;
  bulkDue: string;
  setBulkDue: (v: string) => void;
  bulkSetDue: () => void;
  bulkPoints: string;
  setBulkPoints: (v: string) => void;
  bulkSetPoints: () => void;
  /** FINDING 1: how many of the currently selected rows are actually
   * eligible for the rubric/submission-type writes (ordinary assignments
   * only) - computed once by CourseItemsView from ordinaryAssignmentSelection
   * and passed straight through, never re-derived here. */
  eligibleAssignmentCount: number;
  bulkRubricId: number | "";
  setBulkRubricId: (v: number | "") => void;
  rubrics: CanvasRubric[];
  bulkRubric: () => void;
  bulkSubType: string;
  setBulkSubType: (v: string) => void;
  bulkUpdateSubmissionType: () => void;
  bulkDescription: string;
  setBulkDescription: (v: string) => void;
  bulkSetDescription: () => void;
  /** B4: two-click "Confirm delete" arming (confirmArming.ts) - the signed
   * boolean itself lives in CourseItemsView.tsx (selectionSignature keys it
   * to the current selection); this bar only reads it to swap the button's
   * own label. */
  confirmDelete: boolean;
  bulkDeleteContent: () => void;
}

export function CourseItemsBulkBar({
  kind,
  kindLabelSingular,
  kindLabelPlural,
  selectedCount,
  onClearSelection,
  busy,
  bulkPublish,
  bulkDue,
  setBulkDue,
  bulkSetDue,
  bulkPoints,
  setBulkPoints,
  bulkSetPoints,
  eligibleAssignmentCount,
  bulkRubricId,
  setBulkRubricId,
  rubrics,
  bulkRubric,
  bulkSubType,
  setBulkSubType,
  bulkUpdateSubmissionType,
  bulkDescription,
  setBulkDescription,
  bulkSetDescription,
  confirmDelete,
  bulkDeleteContent,
}: CourseItemsBulkBarProps) {
  return (
    <div className={styles.bulkBar}>
      <div className={styles.bulkBarHead}>
        <span className={styles.bulkCount}>
          {selectedCount} {selectedCount === 1 ? kindLabelSingular : kindLabelPlural} selected
        </span>
        <Button variant="outlined" size="small" onClick={onClearSelection}>
          Clear
        </Button>
      </div>

      <div className={styles.bulkRow}>
        <span className={styles.bulkLabel}>Publish</span>
        <Button variant="outlined" size="small" disabled={busy} onClick={() => bulkPublish(true)}>
          Publish
        </Button>
        <Button variant="outlined" size="small" disabled={busy} onClick={() => bulkPublish(false)}>
          Unpublish
        </Button>
      </div>

      <div className={styles.bulkRow}>
        <span className={styles.bulkLabel}>Due date</span>
        <TextField
          type="datetime-local"
          size="small"
          sx={{ width: 188 }}
          value={bulkDue}
          onChange={(e) => setBulkDue(e.target.value)}
          aria-label="Due date"
        />
        <Button variant="contained" size="small" disabled={busy} onClick={bulkSetDue}>
          Set
        </Button>
      </div>

      <div className={styles.bulkRow}>
        <span className={styles.bulkLabel}>Points</span>
        <TextField
          type="number"
          size="small"
          sx={{ width: 74 }}
          placeholder="points"
          value={bulkPoints}
          onChange={(e) => setBulkPoints(e.target.value)}
          aria-label="Points"
        />
        <Button variant="outlined" size="small" disabled={busy} onClick={bulkSetPoints}>
          Set points
        </Button>
      </div>

      {/* FINDING 1: rubric association and submission-type change only
          ever apply to an ORDINARY assignment - never a New Quiz, a
          classic-quiz shadow row, or a graded-discussion shadow row, even
          though all three can now appear in this tab (bulk.ts's own bug
          fix). Both controls below stay gated on kind === "Assignment"
          (the Quizzes tab never renders them at all), but are now ALSO
          disabled whenever the current selection contains zero eligible
          rows - communicated up front, before a click, rather than only
          after one via the error note in bulkRubric/
          bulkUpdateSubmissionType. A selection that mixes eligible and
          ineligible rows still applies to the eligible subset (never
          silently drops the rest without saying so - see those
          functions' own "skipped" wording). */}
      {kind === "Assignment" && selectedCount > 0 && eligibleAssignmentCount === 0 && (
        <p className={styles.fieldHint} style={{ margin: 0 }}>
          None of the selected rows are ordinary assignments - New Quizzes, classic quizzes, and graded
          discussions cannot receive a rubric or submission-type change here.
        </p>
      )}

      {kind === "Assignment" && (
        <div className={styles.bulkRow}>
          <span className={styles.bulkLabel}>Rubric</span>
          <TextField
            select
            size="small"
            sx={{ maxWidth: 190 }}
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
          <Button
            variant="outlined"
            size="small"
            disabled={busy || bulkRubricId === "" || eligibleAssignmentCount === 0}
            onClick={bulkRubric}
          >
            Associate
          </Button>
        </div>
      )}

      {kind === "Assignment" && (
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
            {SUBMISSION_TYPE_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="outlined"
            size="small"
            disabled={busy || bulkSubType === "" || eligibleAssignmentCount === 0}
            onClick={bulkUpdateSubmissionType}
          >
            Apply
          </Button>
        </div>
      )}

      <div className={styles.bulkRow}>
        <span className={styles.bulkLabel}>Description</span>
        <TextField
          multiline
          minRows={4}
          fullWidth
          value={bulkDescription}
          onChange={(e) => setBulkDescription(e.target.value)}
          placeholder="Description (HTML allowed) — replaces the description on selected items"
          aria-label="Description to set on the selected items"
          size="small"
        />
        <Button variant="contained" size="small" disabled={busy} onClick={bulkSetDescription}>
          Set description
        </Button>
      </div>

      <div className={styles.bulkRow}>
        <span className={styles.bulkLabel}>Delete</span>
        <Button variant="outlined" size="small" color="error" disabled={busy} onClick={bulkDeleteContent}>
          {confirmDelete ? "Confirm delete" : "Delete from Canvas"}
        </Button>
      </div>
    </div>
  );
}
