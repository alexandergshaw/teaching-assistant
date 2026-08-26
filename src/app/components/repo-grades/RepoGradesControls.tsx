"use client";

// Repo Grades view - the five stacked form controls (course picker, repo
// name filter + refresh, sort, assignment instructions, rubric) that used to
// live inline in index.tsx's returned JSX. Pulled out ONLY because index.tsx
// hit this codebase's 1000-line-per-file cap after gaining a feature and had
// nowhere left to grow - not because these controls needed a home of their
// own. They are the part of that file with no decisions in them: every value
// shown, every gate a block renders behind (`course && !missingOrg`,
// `model && model.rows.length > 0`), and every state update all come in as
// props. This component owns no state and no effects - index.tsx still owns
// `uiState`/`setUiState` and passes `(value) => setUiState((prev) => ({
// ...prev, field: value }))`-style callbacks, the same shape it already
// passes to LinkUsernamesPanel as `onAssignmentIdChange`.
//
// vitest in this codebase is node-env and collects only src/**/*.test.ts, so
// no component is ever rendered by a test - nothing in this file is
// exercised by any test, which is exactly why it must contain no logic worth
// testing.
import type { Course } from "@/lib/supabase/courses";
import type { RepoGradeSortField, RepoGradeSortState, SortDirection } from "./repoGradesRows";
import styles from "../../page.module.css";

/** Moved verbatim from index.tsx, unchanged - parses the sort `<select>`'s
 * combined "field:direction" option value back into a RepoGradeSortState.
 * Lives here now because this is the only control that calls it. */
export function parseSortValue(value: string): { field: RepoGradeSortField; direction: SortDirection } {
  const [field, direction] = value.split(":");
  return {
    field: field === "binding" ? "binding" : "repo",
    direction: direction === "desc" ? "desc" : "asc",
  };
}

export interface RepoGradesControlsProps {
  courses: Course[];
  coursesLoading: boolean;
  coursesError: string | null;
  courseId: string;
  onCourseIdChange: (value: string) => void;

  /** `course && !missingOrg` from index.tsx - gates the repo name filter block. */
  showOrgPrefixFilter: boolean;
  orgPrefix: string;
  onOrgPrefixChange: (value: string) => void;
  scanLoading: boolean;
  onRefreshScan: () => void;

  /** `model && model.rows.length > 0` from index.tsx - gates the sort
   * control and the instructions/rubric pair, matching the two separate but
   * identically-conditioned blocks index.tsx used to render. */
  showRowDependentFields: boolean;
  sort: RepoGradeSortState;
  onSortChange: (value: RepoGradeSortState) => void;
  instructions: string;
  onInstructionsChange: (value: string) => void;
  rubric: string;
  onRubricChange: (value: string) => void;

  /** When true, every "Grade" / "Grade all" call reads a folder's own README
   * as that folder's assignment instructions instead of the instructions
   * textarea below - the action falls back to the textarea only for a repo
   * whose folder has no README, and reports that fallback itself. This
   * component only renders/reports the checkbox; the persisted value lives
   * in RepoGradesUiState (repoGradesUiState.ts). */
  useReadmeInstructions: boolean;
  onUseReadmeInstructionsChange: (value: boolean) => void;

  /** Scopes a "Grade all" bulk run to the checked rows only. With nothing
   * checked, a bulk grade covers the whole column - the same "no selection
   * means everything" convention handlePostColumn already applies to a
   * column post. */
  bulkSelectionOnly: boolean;
  onBulkSelectionOnlyChange: (value: boolean) => void;
}

/** Shared inline override for a checkbox's <label> inside a `.field` wrapper -
 * `.field label` (page.module.css) is styled for a short field CAPTION
 * (small, bold, uppercase, letter-spaced), which reads wrong next to an
 * inline checkbox's own sentence-case prompt text. Overriding just the
 * text-styling properties here keeps `.field`'s spacing/gap without
 * duplicating a whole new CSS rule for two checkboxes. */
const CHECKBOX_LABEL_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  textTransform: "none",
  letterSpacing: "normal",
  fontWeight: 500,
  fontSize: "0.9rem",
  color: "var(--text-primary)",
};

export default function RepoGradesControls({
  courses,
  coursesLoading,
  coursesError,
  courseId,
  onCourseIdChange,
  showOrgPrefixFilter,
  orgPrefix,
  onOrgPrefixChange,
  scanLoading,
  onRefreshScan,
  showRowDependentFields,
  sort,
  onSortChange,
  instructions,
  onInstructionsChange,
  rubric,
  onRubricChange,
  useReadmeInstructions,
  onUseReadmeInstructionsChange,
  bulkSelectionOnly,
  onBulkSelectionOnlyChange,
}: RepoGradesControlsProps) {
  return (
    <>
      <div className={styles.field}>
        <label htmlFor="repo-grades-course">Course</label>
        <select
          id="repo-grades-course"
          value={courseId}
          disabled={coursesLoading}
          onChange={(e) => onCourseIdChange(e.target.value)}
        >
          <option value="">{coursesLoading ? "Loading courses..." : "Choose a course..."}</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {coursesError && (
          <p className={styles.error} role="alert">
            {coursesError}
          </p>
        )}
      </div>

      {showOrgPrefixFilter && (
        <div className={styles.field}>
          <label htmlFor="repo-grades-org-prefix">Repo name filter (optional)</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              id="repo-grades-org-prefix"
              type="text"
              value={orgPrefix}
              onChange={(e) => onOrgPrefixChange(e.target.value)}
              placeholder="e.g. module"
              style={{ flex: "1 1 220px" }}
            />
            <button type="button" className={styles.linkButton} disabled={scanLoading} onClick={() => onRefreshScan()}>
              {scanLoading ? "Scanning..." : "Refresh"}
            </button>
          </div>
        </div>
      )}

      {showRowDependentFields && (
        <div className={styles.field}>
          <label htmlFor="repo-grades-sort">Sort</label>
          <select
            id="repo-grades-sort"
            value={`${sort.field}:${sort.direction}`}
            onChange={(e) => onSortChange(parseSortValue(e.target.value))}
          >
            <option value="repo:asc">Repo name (A to Z)</option>
            <option value="repo:desc">Repo name (Z to A)</option>
            <option value="binding:asc">Needs attention first</option>
            <option value="binding:desc">Confirmed first</option>
          </select>
        </div>
      )}

      {showRowDependentFields && (
        <>
          <div className={styles.field}>
            <label htmlFor="repo-grades-use-readme" style={CHECKBOX_LABEL_STYLE}>
              <input
                id="repo-grades-use-readme"
                type="checkbox"
                checked={useReadmeInstructions}
                onChange={(e) => onUseReadmeInstructionsChange(e.target.checked)}
              />
              Use each folder&apos;s README as the assignment instructions
            </label>
          </div>
          <div className={styles.field}>
            <label htmlFor="repo-grades-bulk-selection-only" style={CHECKBOX_LABEL_STYLE}>
              <input
                id="repo-grades-bulk-selection-only"
                type="checkbox"
                checked={bulkSelectionOnly}
                onChange={(e) => onBulkSelectionOnlyChange(e.target.checked)}
              />
              Only the checked rows
            </label>
            <p className={styles.fieldHint}>With nothing checked, a bulk grade covers the whole column.</p>
          </div>
          <div className={styles.field}>
            <label htmlFor="repo-grades-instructions">
              {useReadmeInstructions
                ? "Assignment instructions (fallback - used only for a repo whose folder has no README)"
                : "Assignment instructions (used by every \"Grade\" call)"}
            </label>
            <textarea
              id="repo-grades-instructions"
              value={instructions}
              onChange={(e) => onInstructionsChange(e.target.value)}
              placeholder="Describe what a folder needs to contain to earn full credit."
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="repo-grades-rubric">Rubric (optional - generated from the instructions if left blank)</label>
            <textarea
              id="repo-grades-rubric"
              value={rubric}
              onChange={(e) => onRubricChange(e.target.value)}
              placeholder="Paste a grading rubric, or leave blank to generate one from the instructions above."
            />
          </div>
        </>
      )}
    </>
  );
}
