"use client";

// Repo Grades: a Manual subtab that lists every student repo in a course
// tile's GitHub org, helps bind each repo to the roster student it belongs
// to, and enumerates each repo's assignment folders as grid columns. Full
// spec: docs/repo-grades-view-acceptance-criteria.md.
//
// THIS WAVE (per the acceptance-criteria doc's wave brief): the view, its
// data loading, and binding confirmation. Grading (AC4 items 20-21) and
// posting (AC5) are explicitly the next wave's work - this component never
// calls gradeRepoAction or postCanvasGradesAction, and the grid's per-cell
// score/comment/post-status fields are inert placeholders (see
// repoGradesRows.ts's RepoGradeCell).
//
// All data loading follows this codebase's idiom (ContentTab.tsx:134-155):
// useRepoGradesData owns every effect, each with a `cancelled` guard and an
// async body that awaits before any setState. This file only reads that
// hook's derived state and the pure repoGradesRows.ts functions, and renders.
import { useEffect, useState } from "react";
import TabHeader from "../TabHeader";
import { useRepoGradesData } from "./useRepoGradesData";
import {
  loadRepoGradesUiState,
  loadSelectedRepoIds,
  persistRepoGradesUiState,
  persistSelectedRepoIds,
  type RepoGradesUiState,
} from "./repoGradesUiState";
import { buildRepoGradeGridModel, sortRepoGradeRows, type RepoGradeSortField, type SortDirection } from "./repoGradesRows";
import RepoGradesGrid from "./RepoGradesGrid";
import styles from "../../page.module.css";
import gridStyles from "./repo-grades.module.css";

// AC2 item 7: the empty state for "no confirmed rows at all" must name this
// step by its exact UI label (steps.course-setup.rosters.ts:35's `name`
// field), not a paraphrase - so a support-doc or screenshot search for the
// step's real name still finds this text.
const LINK_GITHUB_USERNAMES_STEP_LABEL = "Link GitHub usernames to roster";

function parseSortValue(value: string): { field: RepoGradeSortField; direction: SortDirection } {
  const [field, direction] = value.split(":");
  return {
    field: field === "binding" ? "binding" : "repo",
    direction: direction === "desc" ? "desc" : "asc",
  };
}

export default function RepoGradesTab() {
  const [uiState, setUiState] = useState<RepoGradesUiState>(() => loadRepoGradesUiState());

  useEffect(() => {
    persistRepoGradesUiState(uiState);
  }, [uiState]);

  const {
    courses,
    coursesLoading,
    coursesError,
    course,
    scan,
    scanLoading,
    scanError,
    roster,
    rosterLoading,
    rosterError,
    reloadScan,
    acceptBinding,
  } = useRepoGradesData(uiState.courseId, uiState.orgPrefix);

  const model = scan ? buildRepoGradeGridModel(scan.repos, roster, course?.studentRepos ?? [], uiState.orgPrefix) : null;
  const sortedRows = model ? sortRepoGradeRows(model.rows, uiState.sort) : [];

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // AC4 item 23: the persisted selection is restored (and filtered against
  // currently-valid repo ids) once this course's rows are known, not before -
  // done as a render-phase compare-and-adjust (matching CoursePicker.tsx's
  // own prevInstitution pattern) rather than inside a useEffect, since
  // setting state synchronously inside an effect is what
  // react-hooks/set-state-in-effect forbids.
  const [selectionLoadedForKey, setSelectionLoadedForKey] = useState<string | null>(null);
  const selectionKey = model ? `${uiState.courseId}:${model.rows.length}` : null;
  if (model && selectionKey !== selectionLoadedForKey) {
    setSelectionLoadedForKey(selectionKey);
    setSelected(loadSelectedRepoIds(model.rows.map((row) => row.repo)));
  }

  useEffect(() => {
    persistSelectedRepoIds(selected);
  }, [selected]);

  const toggleSelected = (repo: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(repo)) next.delete(repo);
      else next.add(repo);
      return next;
    });
  };

  const missingInstitution = !!course && !(course.institution ?? "").trim();
  const missingOrg = !!course && !(course.githubOrg ?? "").trim();
  const noConfirmedRows = !!model && model.rows.length > 0 && model.rows.every((row) => row.binding.state !== "confirmed");

  return (
    <div className={styles.tabContainer}>
      <TabHeader
        eyebrow="Grading"
        title="Repo Grades"
        subtitle="Grade every student's GitHub repo folder by folder and post the results to the Canvas gradebook."
      />

      <div className={styles.field}>
        <label htmlFor="repo-grades-course">Course</label>
        <select
          id="repo-grades-course"
          value={uiState.courseId}
          disabled={coursesLoading}
          onChange={(e) => setUiState((prev) => ({ ...prev, courseId: e.target.value }))}
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

      {course && !missingOrg && (
        <div className={styles.field}>
          <label htmlFor="repo-grades-org-prefix">Repo name filter (optional)</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              id="repo-grades-org-prefix"
              type="text"
              value={uiState.orgPrefix}
              onChange={(e) => setUiState((prev) => ({ ...prev, orgPrefix: e.target.value }))}
              placeholder="e.g. module"
              style={{ flex: "1 1 220px" }}
            />
            <button type="button" className={styles.linkButton} disabled={scanLoading} onClick={() => reloadScan()}>
              {scanLoading ? "Scanning..." : "Refresh"}
            </button>
          </div>
        </div>
      )}

      {model && model.rows.length > 0 && (
        <div className={styles.field}>
          <label htmlFor="repo-grades-sort">Sort</label>
          <select
            id="repo-grades-sort"
            value={`${uiState.sort.field}:${uiState.sort.direction}`}
            onChange={(e) => setUiState((prev) => ({ ...prev, sort: parseSortValue(e.target.value) }))}
          >
            <option value="repo:asc">Repo name (A to Z)</option>
            <option value="repo:desc">Repo name (Z to A)</option>
            <option value="binding:asc">Needs attention first</option>
            <option value="binding:desc">Confirmed first</option>
          </select>
        </div>
      )}

      {!course && !coursesLoading && <p className={styles.emptyState}>Choose a course tile above to list its repos.</p>}

      {course && missingInstitution && (
        <p className={styles.error} role="alert">
          &quot;{course.name}&quot; has no institution set, so its Canvas roster cannot be loaded for binding - set one on
          the course tile first.
        </p>
      )}

      {course && missingOrg && (
        <p className={styles.error} role="alert">
          &quot;{course.name}&quot; has no GitHub org set, so its repos cannot be listed - set one on the course tile
          first.
        </p>
      )}

      {course && !missingOrg && scanLoading && (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.loadingTitle}>Scanning {course.githubOrg} for repos...</p>
          </div>
        </div>
      )}

      {course && !missingOrg && scanError && (
        <p className={styles.error} role="alert">
          {scanError}
        </p>
      )}

      {course && !missingInstitution && rosterLoading && (
        <p className={styles.fieldHint} role="status" aria-live="polite">
          Loading the Canvas roster...
        </p>
      )}

      {course && !missingInstitution && rosterError && (
        <p className={styles.error} role="alert">
          Roster: {rosterError}
        </p>
      )}

      {scan && scan.truncated && (
        <p className={gridStyles.banner} role="status">
          This org has at least as many repos as this scan&apos;s listing limit - the repos below may be an incomplete
          list, not the full org.
        </p>
      )}

      {scan && scan.rateLimit && (
        <p className={gridStyles.banner} role="status">
          {scan.rateLimit.message}
        </p>
      )}

      {model && noConfirmedRows && (
        <p className={gridStyles.banner} role="status">
          No repos are confirmed-bound to a roster student yet. Running the &quot;{LINK_GITHUB_USERNAMES_STEP_LABEL}&quot;
          workflow step is the reliable way to populate bindings, since it uses each student&apos;s own Canvas submission
          rather than an inferred match.
        </p>
      )}

      {model && (
        <RepoGradesGrid
          columns={model.columns}
          rows={sortedRows}
          roster={roster}
          selected={selected}
          onToggleSelected={toggleSelected}
          onAcceptBinding={acceptBinding}
        />
      )}
    </div>
  );
}
