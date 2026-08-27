"use client";

// Repo Grades view - the stacked form controls (course picker, repo name
// filter + refresh, sort, assignment instructions, rubric source + rubric)
// that used to live inline in index.tsx's returned JSX. Pulled out ONLY
// because index.tsx hit this codebase's 1000-line-per-file cap after gaining
// a feature and had nowhere left to grow - not because these controls needed
// a home of their own. They are the part of that file with no decisions in
// them: every value shown, every gate a block renders behind (`course &&
// !missingOrg`, `model && model.rows.length > 0`), and every state update all
// come in as props. This component owns no state and no effects -
// index.tsx still owns `uiState`/`setUiState` and passes `(value) =>
// setUiState((prev) => ({ ...prev, field: value }))`-style callbacks, the
// same shape it already passes to LinkUsernamesPanel as
// `onAssignmentIdChange`; the rubric-picker props below are the same
// pattern, sourced from index.tsx's `useRepoGradesRubricSource` hook call
// instead of `uiState` directly.
//
// The rubric-source `<select>` (docs/repo-grades-rubric-picker-acceptance-
// criteria.md) sits between the instructions field and the rubric textarea,
// as its own `styles.field` - a control must sit adjacent to the box whose
// editability it governs, or the textarea's read-only state reads as a bug.
// This file only renders the already-ordered, already-grouped option list
// `useRepoGradesRubricSource.ts` builds via `repoGradesRubricSource.ts`; it
// never sorts, groups, or resolves a rubric itself. Two small pure helpers
// below (`describeRubricTextareaLabel`, `describeRubricPlaceholder`) exist
// only to pick the right caption/placeholder STRING for the current source -
// they make no decision about which source is active or what its resolved
// text is.
//
// vitest in this codebase is node-env and collects only src/**/*.test.ts, so
// no component is ever rendered by a test - nothing in this file is
// exercised by any test, which is exactly why it must contain no logic worth
// testing.
import type { Course } from "@/lib/supabase/courses";
import type { RepoGradeSortState } from "./repoGradesRows";
import { parseRepoGradeSortSelectValue, repoGradeSortSelectValue } from "./repoGradesRows";
import { ALL_FOLDERS, describeFolderOption, type FolderOption } from "./repoGradesFolderSelection";
import {
  parseRepoGradeRubricValue,
  type RepoGradeRubricOption,
  type RepoGradeRubricSource,
} from "./repoGradesRubricSource";
import type { RepoGradeRubricListHint } from "./useRepoGradesRubricSource";
import styles from "../../page.module.css";

/** One contiguous run of `RepoGradeRubricOption`s sharing the same
 * `<optgroup>` label (or `null` for a top-level option), in the order
 * `buildRepoGradeRubricOptions` already produced. This component renders
 * options only - it never re-sorts or re-groups them (AC item 3: the order
 * is fixed by that function, not by this one). */
interface RubricOptionSegment {
  group: string | null;
  options: RepoGradeRubricOption[];
}

/** Splits an already-ordered option list into the runs `<optgroup>`
 * rendering needs, without re-deriving grouping from `source` itself - the
 * same "read the field, don't re-derive it" posture
 * `RepoGradeRubricOption.group` was added for. An `<optgroup>` with zero
 * options is never produced because this only ever segments options that
 * exist (AC items 22/23: an empty group is simply absent from
 * `rubricSourceOptions` in the first place). */
function groupRubricSourceOptions(options: readonly RepoGradeRubricOption[]): RubricOptionSegment[] {
  const segments: RubricOptionSegment[] = [];
  for (const option of options) {
    const last = segments[segments.length - 1];
    if (last && last.group === option.group) {
      last.options.push(option);
    } else {
      segments.push({ group: option.group, options: [option] });
    }
  }
  return segments;
}

/** The rubric textarea's own selected title, for the `live`/`export` label
 * variants below (AC item 44's sibling requirement in the picker itself: the
 * read-only reason must NAME the rubric, not just say "read-only"). Reads
 * `rubricSourceValue` back through `parseRepoGradeRubricValue` rather than
 * trusting `RepoGradeRubricOption.label` directly, because an export
 * option's label already carries the "(from export)" suffix
 * (repoGradesRubricSource.ts's own RULE 3b) - using the parsed `title` field
 * for `export` avoids stripping that suffix back off. A `live` choice has no
 * title of its own in the parsed value (only a Canvas id), so that case
 * falls back to the matching option's label, which for `live` IS the bare
 * title. Returns `null` when the value cannot be resolved to a title at all
 * (every source other than live/export, or a stale/unparseable value) - the
 * caller substitutes a generic phrase in that case rather than rendering
 * `null`. */
function selectedRubricTitle(value: string, options: readonly RepoGradeRubricOption[]): string | null {
  const parsed = parseRepoGradeRubricValue(value);
  if (!parsed) return null;
  if (parsed.source === "export") return parsed.title;
  if (parsed.source === "live") {
    return options.find((option) => option.value === value)?.label ?? null;
  }
  return null;
}

/** The rubric textarea's caption, one per source (AC item 44's picker-side
 * counterpart in the UX pass's notes, section 4.2) - every variant states
 * WHY the box is or isn't editable and, for `live`/`export`, names the
 * rubric so the read-only reason is never just "trust me". */
function describeRubricTextareaLabel(source: RepoGradeRubricSource, title: string | null): string {
  switch (source) {
    case "generate":
      return "Rubric (generated from the instructions when you grade)";
    case "manual":
      return 'Rubric (your own text - used by every "Grade" call)';
    case "live":
      return `Rubric (read-only - from "${title ?? "the chosen Canvas rubric"}" in Canvas)`;
    case "export":
      return `Rubric (read-only - from "${title ?? "the chosen export rubric"}" in the saved course export)`;
    case "assignment":
      return "Rubric (read-only - each column uses its own assignment's rubric)";
  }
}

/** The rubric textarea's placeholder, one per source. `assignment` always
 * carries its own note (there is no single per-page preview to show - AC
 * item 14); `live`/`export` show a resolving note while the hook's own
 * `resolving` flag is true (AC item 45) - NOT while the textarea's value
 * happens to be empty. That distinction is load-bearing: a live/export
 * rubric can legitimately RESOLVE to empty text (a Canvas rubric with no
 * criteria, or a lookup that degrades to "" per AC item 13), and a value-
 * based check would then show "Resolving this rubric..." forever even
 * though the resolve already finished - `resolving` is the hook's real,
 * in-flight signal and never lies that way. `generate`/`manual` keep today's
 * placeholder unchanged. Returns `undefined`, not `""`, for the "no
 * placeholder" case so the `<textarea>` prop is omitted rather than set to
 * an empty string. */
function describeRubricPlaceholder(source: RepoGradeRubricSource, readOnly: boolean, resolving: boolean): string | undefined {
  if (source === "assignment") {
    return "Resolved from each column's mapped Canvas assignment when you grade.";
  }
  if (readOnly && resolving) {
    return "Resolving this rubric...";
  }
  if (!readOnly) {
    return "Paste a grading rubric, or leave blank to generate one from the instructions above.";
  }
  return undefined;
}

/** UX notes 1.6 - the one line, always present, that states whether the
 * picker governs every column on the page or just the one column
 * `assignment` resolves per-column. This is the only place the page states
 * that distinction, which is why `assignment` is not a silent trap (a
 * per-column source hiding behind a page-wide-looking control). Pure: reads
 * only the already-parsed source, never fetches or resolves anything. */
function describeRubricScopeHint(source: RepoGradeRubricSource): string {
  return source === "assignment"
    ? "Each column grades against its own mapped Canvas assignment's rubric - the column headers below name which."
    : "Every column on this page grades against this one rubric.";
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

  /** The rubric-source `<select>`'s current value (a namespaced option
   * value from `repoGradesRubricSource.ts` - `generate` | `assignment` |
   * `manual` | `live:<id>` | `export:<occurrence>:<title>`), and the
   * already-ordered, already-grouped option list to render it from. This
   * component renders and forwards a change; it never re-sorts or
   * re-resolves anything (that is `useRepoGradesRubricSource.ts`'s job). */
  rubricSourceValue: string;
  rubricSourceOptions: readonly RepoGradeRubricOption[];
  onRubricSourceChange: (value: string) => void;
  /** What the rubric textarea displays right now for the CURRENT source -
   * the effective rubric text for `manual`/`live`/`export`, or `""` for
   * `generate`/`assignment` (AC items 14/39/51: this textarea always shows
   * what will actually be sent, never a stale or fabricated preview). */
  rubricTextareaValue: string;
  /** True whenever the current source resolves the textarea itself
   * (`live`/`export`/`assignment`) rather than letting the instructor type
   * into it. `readOnly`, not `disabled`, is applied below - see this file's
   * own rendering for why. */
  rubricTextareaReadOnly: boolean;
  /** AC item 45's own real signal: true while the hook has a resolve in
   * flight, or while its per-column cache does not yet belong to the current
   * course. Drives the "Resolving this rubric..." placeholder - NEVER
   * substitute `rubricTextareaValue === ""` for this, that heuristic lies
   * for a live/export rubric that legitimately resolves to empty text. */
  rubricResolving: boolean;
  onRubricTextChange: (value: string) => void;
  /** AC item 40: non-null only right after switching to a `live`/`export`
   * source overwrote non-empty typed text with the resolved rubric. Calling
   * it restores that text and moves the source back to `manual`. Rendered
   * only when this is non-null - never shown, never disabled, the rest of
   * the time (it would otherwise be a control with nothing to do). */
  onRestoreManualRubric: (() => void) | null;
  /** AC item 21: non-null only right after a persisted rubric choice was
   * dropped because the rubric it named no longer exists (the export was
   * replaced, the Canvas rubric was deleted). The instructor must be told
   * their saved choice was degraded to "Generate from the instructions",
   * not left to notice the picker quietly changed under them. */
  rubricStaleNote: string | null;
  /** Why the "Rubrics in Canvas" / "Rubrics in the saved course export"
   * optgroups are absent or worth a note - loading, no connection/no export,
   * a load failure, or loaded-and-empty (UX notes 1.5) - or `null` when that
   * list has options and needs no hint. Computed by
   * `useRepoGradesRubricSource.ts`, which already holds every input the
   * distinction needs; this component only renders the string. */
  rubricLiveHint: RepoGradeRubricListHint | null;
  rubricExportHint: RepoGradeRubricListHint | null;

  /** U1.1/U1.3 - which assignment folder this view is scoped to right now:
   * a raw folder name, or ALL_FOLDERS (repoGradesFolderSelection.ts). The
   * options and the census both come from index.tsx's `buildFolderOptions`
   * call over the current scan - this component renders them, it does not
   * derive them. */
  folderOptions: FolderOption[];
  folderCensus: { scannedRepos: number; unknownRepos: number };
  selectedFolder: string;
  onSelectedFolderChange: (value: string) => void;
  /** U1.6b - non-null only right after a previously-persisted folder was
   * genuinely dropped (gone from an unfiltered scan, not merely hidden by
   * the org-prefix filter - see shouldPersistFolderDrop). Rendered inline
   * next to the folder control so the instructor is told, not left to
   * notice the view silently reset to "All folders". */
  folderDropNotice: string | null;

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
  folderOptions,
  folderCensus,
  selectedFolder,
  onSelectedFolderChange,
  folderDropNotice,
  instructions,
  onInstructionsChange,
  rubricSourceValue,
  rubricSourceOptions,
  onRubricSourceChange,
  rubricTextareaValue,
  rubricTextareaReadOnly,
  rubricResolving,
  onRubricTextChange,
  onRestoreManualRubric,
  rubricStaleNote,
  rubricLiveHint,
  rubricExportHint,
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

      {/* U1.1/U1.3 - the folder chooser, in the view's own control surface
          rather than buried in a table column header. describeFolderOption
          gives each option its "in N of M repos" hint (U1.4) so the
          instructor can see how common a folder is BEFORE grading it. */}
      {showRowDependentFields && (
        <div className={styles.field}>
          <label htmlFor="repo-grades-folder">Assignment folder to grade</label>
          <select
            id="repo-grades-folder"
            value={selectedFolder}
            onChange={(e) => onSelectedFolderChange(e.target.value)}
          >
            <option value={ALL_FOLDERS}>All folders</option>
            {folderOptions.map((option) => (
              <option key={option.folder} value={option.folder}>
                {describeFolderOption(option, folderCensus)}
              </option>
            ))}
          </select>
          {folderOptions.length === 0 && (
            <p className={styles.fieldHint}>No assignment folders were found in this course&apos;s scanned repos.</p>
          )}
          {folderDropNotice && (
            <p className={styles.error} role="alert">
              {folderDropNotice}
            </p>
          )}
        </div>
      )}

      {/* N4/N5 (docs/repo-grades-name-columns-and-sorting-acceptance-
          criteria.md) - every column is ALSO sortable via its own header
          button now (RepoGradesGrid.tsx), including the per-folder score
          columns this select cannot reasonably list. This control still
          covers the four fields it always has, but its value and parsing now
          both go through repoGradesRows.ts's repoGradeSortSelectValue/
          parseRepoGradeSortSelectValue - N5 item 15: the OLD local
          parseSortValue coerced any unrecognised field (e.g. a header-set
          "firstName" or "folder" sort) to "repo", so simply rendering this
          select with a mismatched value and then having the instructor
          interact with it at all could silently snap the sort back to "repo".
          repoGradeSortSelectValue instead resolves to the disabled "custom"
          option below whenever the active sort is not one of these four, so
          the select never shows (or can fire onChange from) a value that
          does not match one of its own real options. */}
      {showRowDependentFields && (
        <div className={styles.field}>
          <label htmlFor="repo-grades-sort">Sort</label>
          <select
            id="repo-grades-sort"
            value={repoGradeSortSelectValue(sort)}
            onChange={(e) => onSortChange(parseRepoGradeSortSelectValue(e.target.value))}
          >
            <option value="repo:asc">Repo name (A to Z)</option>
            <option value="repo:desc">Repo name (Z to A)</option>
            <option value="binding:asc">Needs attention first</option>
            <option value="binding:desc">Confirmed first</option>
            <option value="firstName:asc">First name (A to Z)</option>
            <option value="firstName:desc">First name (Z to A)</option>
            <option value="lastName:asc">Last name (A to Z)</option>
            <option value="lastName:desc">Last name (Z to A)</option>
            {/* Rendered only while it is the active value (repoGradeSortSelectValue
                only ever returns "custom" for a folder-column sort) - disabled
                so it can never itself be chosen, matching this file's own
                header comment above. */}
            {repoGradeSortSelectValue(sort) === "custom" && (
              <option value="custom" disabled>
                Sorted by a folder column (see the table header)
              </option>
            )}
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
          {/* AC items 42/43 (this feature's UX pass) - a plain <select> with
              native <optgroup> grouping, sitting directly above the box
              whose editability it governs, inside its own `styles.field`
              (not folded into the textarea's field below, which would put
              two `.field label` captions in one wrapper). No MUI: nothing in
              this folder imports it. */}
          <div className={styles.field}>
            <label htmlFor="repo-grades-rubric-source">Rubric source</label>
            <select
              id="repo-grades-rubric-source"
              value={rubricSourceValue}
              onChange={(e) => onRubricSourceChange(e.target.value)}
            >
              {groupRubricSourceOptions(rubricSourceOptions).map((segment, index) =>
                segment.group === null ? (
                  segment.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))
                ) : (
                  <optgroup key={`${segment.group}-${index}`} label={segment.group}>
                    {segment.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                )
              )}
            </select>
            {/* AC item 21 - a stale persisted choice is reported here, next
                to the control that would let the instructor pick again, not
                only buried in the log. `role="alert"` matches this file's
                own `folderDropNotice` precedent above. */}
            {rubricStaleNote && (
              <p className={styles.error} role="alert">
                {rubricStaleNote}
              </p>
            )}
            {/* UX notes 1.5 - the live and export lists each contribute AT
                MOST ONE hint, independently: an export hint and a live hint
                can both show at once. Text and severity (hint vs error) both
                come from the hook, which already computed them from the
                exact same load state this control has no other way to see. */}
            {rubricLiveHint && (
              <p className={rubricLiveHint.tone === "error" ? styles.error : styles.fieldHint}>{rubricLiveHint.text}</p>
            )}
            {rubricExportHint && (
              <p className={rubricExportHint.tone === "error" ? styles.error : styles.fieldHint}>{rubricExportHint.text}</p>
            )}
            {/* UX notes 1.6 - always present, one line: the only place this
                page states whether the picker governs every column or just
                one column at a time, which is why `assignment` is not a
                silent trap. */}
            <p className={styles.fieldHint}>
              {describeRubricScopeHint(parseRepoGradeRubricValue(rubricSourceValue)?.source ?? "generate")}
            </p>
          </div>
          <div className={styles.field}>
            <label htmlFor="repo-grades-rubric">
              {describeRubricTextareaLabel(
                parseRepoGradeRubricValue(rubricSourceValue)?.source ?? "generate",
                selectedRubricTitle(rubricSourceValue, rubricSourceOptions)
              )}
            </label>
            <textarea
              id="repo-grades-rubric"
              value={rubricTextareaValue}
              readOnly={rubricTextareaReadOnly}
              onChange={(e) => onRubricTextChange(e.target.value)}
              placeholder={describeRubricPlaceholder(
                parseRepoGradeRubricValue(rubricSourceValue)?.source ?? "generate",
                rubricTextareaReadOnly,
                rubricResolving
              )}
            />
            {/* AC item 40 - rendered ONLY on a real collision (the hook sets
                this to a function only right after an overwrite actually
                happened), so it costs zero clicks in the normal case and one
                click to recover a typed rubric that a source switch just
                replaced. */}
            {onRestoreManualRubric && (
              <>
                <p className={styles.fieldHint}>Your own rubric text was replaced by the resolved rubric.</p>
                <button type="button" className={styles.linkButton} onClick={() => onRestoreManualRubric()}>
                  Restore my own rubric text
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
