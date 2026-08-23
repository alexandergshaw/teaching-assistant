"use client";

// One row of CourseItemsView's flat list (Assignments/Quizzes tabs). Extracted
// out of CourseItemsView.tsx - which was approaching this repo's 1000-line
// ceiling once finding 1's per-row eligibility fix landed - so the per-row
// JSX (the New Quiz/shadow labels, A2/C2/C4; the four-way module-cell
// rendering, A2/A3/A4/NIT11) lives in its own leaf, the same way
// courseItems-modules.ts, courseItems-filters.ts and
// courseItems-eligibility.ts were already pulled out of that same file for
// the identical reason.
//
// Purely presentational: every input it needs (the item, whether it is
// selected, its already-resolved module association) is passed in - it never
// recomputes anything CourseItemsView.tsx has already resolved once. In
// particular, `moduleInfo` is looked up by the parent from a map built once
// per items/moduleIndex change (`moduleInfoById`), not recomputed here via a
// second `modulesForItem` call - see CourseItemsView.tsx's own comment on why
// calling it twice per row per render was worth folding into one.
import Checkbox from "@mui/material/Checkbox";
import type { BulkItem } from "@/lib/canvas-modules";
import type { ItemModuleInfo } from "./courseItems-modules";
import styles from "../../page.module.css";
import { formatDueDate } from "./utils";

export interface CourseItemRowProps {
  item: BulkItem;
  selected: boolean;
  onToggle: () => void;
  moduleInfo: ItemModuleInfo;
  /** Distinguishes "still loading" from "genuinely failed" when
   *  moduleInfo.known is false (NIT11) - see CourseItemsView.tsx's own
   *  moduleIndexFailed state for the full reasoning: it is set true ONLY on a
   *  genuine module-tree fetch error, never during the ordinary initial-load
   *  window. */
  moduleIndexFailed: boolean;
}

export function CourseItemRow({ item, selected, onToggle, moduleInfo, moduleIndexFailed }: CourseItemRowProps) {
  // A2/A3/A4/NIT11: the four module outcomes - still loading, genuinely
  // failed, no module, and one-or-more module names - are genuinely
  // different branches, never one collapsed fallback (courseItems-modules.ts's
  // own ItemModuleInfo doc comment). `known: true, names: []` (A2) renders
  // "No module" explicitly, in the warning color, since an unassociated
  // assignment is usually a mistake worth noticing; `known: true,
  // names: [...]` joins every module name (A3 - never just the first).
  const moduleCell = !moduleInfo.known
    ? moduleIndexFailed
      ? { text: "Unknown", title: "The module list could not be loaded for this course.", warn: false, dim: true }
      : { text: "Loading…", title: "Module associations are still loading.", warn: false, dim: true }
    : moduleInfo.names.length === 0
      ? { text: "No module", title: "This item is not in any module.", warn: true, dim: false }
      : { text: moduleInfo.names.join(", "), title: moduleInfo.names.join(", "), warn: false, dim: false };

  return (
    <div className={styles.ccItem}>
      <Checkbox
        size="small"
        className={styles.ccCheckbox}
        checked={selected}
        onChange={onToggle}
        aria-label={`Select ${item.title}`}
      />
      <span className={styles.ccType} title={item.published ? "Published" : "Unpublished"}>
        {item.published ? "PUBLISHED" : "UNPUBLISHED"}
      </span>
      {/* BUG FIX (live report 2026-08-22): a New Quiz row can now appear in
          EITHER tab (bulk.ts's Assignment branch no longer excludes it -
          Canvas's own Assignments page lists New Quizzes too), so this label
          fires on `isNewQuiz` alone, whichever tab the row is shown in -
          never gated on which tab this component happens to be rendered
          from (this component is not even given the tab's `kind` at all). */}
      {item.isNewQuiz && (
        <span
          className={styles.ccType}
          title="LTI-backed New Quiz (Quizzes 2) - rubric and submission-type changes do not apply"
        >
          NEW QUIZ
        </span>
      )}
      {/* A classic quiz's own shadow assignment row (bulk.ts): this row's id
          IS the assignment id, and deleting it deletes the quiz - labelled so
          that is a deliberate choice, never a surprise (A2/A3). */}
      {item.isClassicQuizShadow && (
        <span
          className={styles.ccType}
          title="Classic quiz - this row is the assignment record Canvas created for grading; deleting it deletes the quiz"
        >
          QUIZ
        </span>
      )}
      {/* A graded discussion's own shadow assignment row (bulk.ts): same
          reasoning as the Classic quiz label above. */}
      {item.isGradedDiscussionShadow && (
        <span
          className={styles.ccType}
          title="Graded discussion - this row is the assignment record Canvas created for grading; deleting it deletes the discussion"
        >
          DISCUSSION
        </span>
      )}
      <span className={styles.ccItemName} title={item.title} style={{ display: "flex", alignItems: "center" }}>
        {item.title}
      </span>
      <span
        className={styles.ccCount}
        style={{
          width: 170,
          textAlign: "left",
          flexShrink: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: moduleCell.warn ? "var(--danger)" : moduleCell.dim ? "var(--text-secondary)" : undefined,
          fontStyle: moduleCell.dim ? "italic" : "normal",
        }}
        title={moduleCell.title}
      >
        {moduleCell.text}
      </span>
      <span className={styles.ccCount} style={{ width: 150, textAlign: "right", flexShrink: 0 }}>
        {item.dueAt ? formatDueDate(item.dueAt) : "No due date"}
      </span>
      <span className={styles.ccCount} style={{ width: 70, textAlign: "right", flexShrink: 0 }}>
        {item.pointsPossible != null ? `${item.pointsPossible} pts` : "—"}
      </span>
    </div>
  );
}
