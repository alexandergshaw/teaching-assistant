import { useId, useState } from "react";
import { useSupabase } from "@/context/SupabaseProvider";
import { isOwnerDecision } from "@/lib/access";
import type { OrgRepoTreesResult } from "@/lib/repo-grade-tree-scan";
import { getRepoGradeCellEdit, type RepoGradeCellEditsByRepo } from "./repoGradesCellEdits";
import { buildRepoGradesDashboard } from "./repoGradesDashboardModel";
import { useRepoGradeHistory } from "./useRepoGradeHistory";
import { RepoDashboardFeedback, RepoDashboardHistoricalFeedback, type HistoricalFeedbackDraft } from "./RepoDashboardFeedback";
import RepoGradeProfileSettings from "./RepoGradeProfileSettings";
import type { RepoGradeColumn, RepoGradeRow } from "./repoGradesRows";
import type { UseRepoGradesGradingActionsResult } from "./useRepoGradesGradingActions";
import styles from "./repo-grades-dashboard.module.css";

// Kept off pending verification and activation approval.
const dashboardFeedbackEnabled = false;

export default function RepoGradesDashboard({
  cellEdits,
  scan,
  scanLoading,
  scanFailed,
  hasRepoPrefix,
  courseId,
  gradeRows,
  gradeColumns,
  grading,
  onRetainedDraftChange,
  isCurrentCellScope,
}: {
  cellEdits: RepoGradeCellEditsByRepo;
  scan: OrgRepoTreesResult | null;
  scanLoading: boolean;
  scanFailed: boolean;
  hasRepoPrefix: boolean;
  courseId: string;
  gradeRows: readonly RepoGradeRow[];
  gradeColumns: readonly RepoGradeColumn[];
  grading: Pick<UseRepoGradesGradingActionsResult, "handleGradeCell" | "handleGradeColumn" |
    "handleScoreChange" | "handleFeedbackFieldChange" | "bulkRunningFolder">;
  onRetainedDraftChange: UseRepoGradesGradingActionsResult["handleRetainedDraftChange"];
  isCurrentCellScope: UseRepoGradesGradingActionsResult["isCurrent"];
}) {
  const headingId = useId();
  const { user, accessDecision } = useSupabase();
  const rows = buildRepoGradesDashboard(cellEdits, scan);
  const scoreCount = rows.filter((row) => row.score !== null).length;
  const treeFailures = scan?.repos.filter((repo) => repo.folders === null).length ?? 0;
  const verified = !!scan && !scanLoading && !scanFailed;
  const gradeRowsByRepo = new Map(gradeRows.map((row) => [row.repo, row]));
  const gradeColumnsByFolder = new Map(gradeColumns.map((column) => [column.folder, column]));

  let discoverySummary = "GitHub discovery is unavailable.";
  if (scanLoading) discoverySummary = "GitHub discovery is running.";
  else if (scanFailed) discoverySummary = "GitHub discovery failed.";
  else if (scan) {
    const failed = treeFailures ? ` Tree scans failed for ${treeFailures}.` : "";
    const capped = scan.truncated ? " The repository listing may be truncated." : "";
    discoverySummary = `GitHub reported ${scan.repos.length} repositories.${failed}${capped}`;
  }

  return (
    <section className={styles.dashboard} aria-labelledby={headingId}>
      <h2 id={headingId}>Class repository results</h2>
      <p>
        Scores come from repo grading and instructor edits in this browser. The evaluated commit is unknown
        and scores may describe earlier work. Rows use repository and folder names as recorded.
      </p>
      <p>
        GitHub scan coverage may be incomplete.
        {hasRepoPrefix && " The current repository prefix limits discovery. Local results cover the selected class."}
      </p>
      <p role="status">
        {scoreCount} {scoreCount === 1 ? "score" : "scores"} shown. {discoverySummary}
      </p>
      {!dashboardFeedbackEnabled && <p>Feedback controls are available in the grading table below.</p>}
      {user && isOwnerDecision(accessDecision) && <RepoGradeProfileSettings courseId={courseId} columns={gradeColumns} />}
      {dashboardFeedbackEnabled && verified && gradeColumns.length > 0 && (
        <form onSubmit={(event) => {
          event.preventDefault();
          const folder = new FormData(event.currentTarget).get("folder");
          if (typeof folder === "string" && gradeColumnsByFolder.has(folder) && !grading.bulkRunningFolder) {
            grading.handleGradeColumn(folder);
          }
        }}>
          <label>
            Folder to grade{" "}
            <select name="folder">
              {gradeColumns.map(({ folder }) => <option key={folder} value={folder}>{folder}</option>)}
            </select>
          </label>{" "}
          <button type="submit" disabled={!!grading.bulkRunningFolder}>Grade folder</button>
        </form>
      )}
      {rows.length > 0 ? (
        <div className={styles.scroll} role="region" aria-labelledby={headingId} tabIndex={0}>
          <table className={styles.table} aria-label="Repository scores and folder discovery">
            <thead>
              <tr>
                <th scope="col">Repository</th>
                <th scope="col">Folder</th>
                <th scope="col">Score</th>
                <th scope="col">Result</th>
                <th scope="col">GitHub discovery</th>
                <th scope="col">Grading and feedback</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ repo, folder, score, result, discovery }) => {
                const row = gradeRowsByRepo.get(repo);
                const column = folder === null ? undefined : gradeColumnsByFolder.get(folder);
                const canGrade = verified && discovery === "Found in scan" && row && column
                  && row.cells[column.folder]?.status === "ungraded";
                const edit = folder === null ? null : getRepoGradeCellEdit(cellEdits, repo, folder);
                return (
                  <tr key={JSON.stringify([repo, folder])}>
                    <th scope="row">{repo}</th>
                    <td>{folder ?? "—"}</td>
                    <td>{score ?? "—"}</td>
                    <td>{result}</td>
                    <td>{discovery}</td>
                    <td>
                      {dashboardFeedbackEnabled && canGrade && (
                        <button type="button" aria-label={`Grade ${column.folder} for ${repo}`}
                          disabled={!!edit?.grading || !!grading.bulkRunningFolder}
                          onClick={() => void grading.handleGradeCell(row, column)}>
                          {edit?.grading ? "Grading…" : "Grade"}
                        </button>
                      )}
                      {edit?.gradeError && <p role="alert">Grading did not return a usable result.</p>}
                      {dashboardFeedbackEnabled && folder !== null && edit && (
                        <RepoDashboardFeedback repo={repo} folder={folder} edit={edit}
                          accountId={user?.id ?? ""} courseId={courseId} isCurrentCellScope={isCurrentCellScope}
                          onRetainedDraftChange={onRetainedDraftChange}
                          onScoreChange={(score) => grading.handleScoreChange(repo, folder, score)}
                          onFeedbackChange={(field, value) => grading.handleFeedbackFieldChange(repo, folder, field, value)} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No local results or discovered folders to display.</p>
      )}
      {user && <RepoGradeHistory courseId={courseId} accountId={user.id} />}
    </section>
  );
}

const EVALUATION_STATUS = {
  claimed: "Running",
  succeeded: "Graded",
  "no-submission": "No submission",
  partial: "Partial evaluation",
  failed: "Failed",
  unknown: "Outcome unknown",
};

function RepoGradeHistory({ courseId, accountId }: { courseId: string; accountId: string }) {
  const headingId = useId();
  const [drafts, setDrafts] = useState<Record<string, HistoricalFeedbackDraft>>({});
  const { page, pageNumber, pending, error, older, newer, retry } = useRepoGradeHistory(courseId, accountId);
  let summary = "Loading saved evaluation history.";
  if (error) {
    summary = error === "course-unavailable"
      ? "Saved evaluation history is unavailable for this course."
      : "Saved evaluation history could not be loaded.";
    if (page) summary += " The previously loaded page is still shown.";
  } else if (!pending && page) {
    if (page.rows.length === 0) {
      summary = pageNumber === 1 ? "No saved evaluations found." : "No older evaluations found.";
    } else {
      summary = `Page ${pageNumber}. ${page.rows.length} saved attempts shown.`;
      summary += page.nextBefore === null ? " End of saved history." : " Older attempts may be available.";
    }
  }

  return (
    <section className={styles.dashboard} aria-labelledby={headingId}>
      <h3 id={headingId}>Saved repository evaluations</h3>
      <p>Automatic attempts are listed newest first, including repositories outside the current GitHub scan. Browser scores and instructor edits appear above.</p>
      <p role="status">{summary}</p>
      <div>
        <button type="button" aria-disabled={pending || pageNumber === 1} onClick={newer}>Newer attempts</button>
        <button type="button" aria-disabled={pending || page?.nextBefore == null} onClick={older}>Older attempts</button>
        <button type="button" aria-disabled={pending || !error} onClick={retry}>Retry history read</button>
      </div>
      {page && page.rows.length > 0 && (
        <div className={styles.scroll} role="region" aria-labelledby={headingId} tabIndex={0}>
          <table className={styles.table} aria-label="Saved repository evaluation attempts">
            <thead>
              <tr>
                <th scope="col">Repository</th>
                <th scope="col">Folder</th>
                <th scope="col">Commit and configuration</th>
                <th scope="col">Attempt date (UTC)</th>
                <th scope="col">Status</th>
                <th scope="col">Score</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row) => {
                const timestamp = row.settledAt ?? row.claimedAt;
                const draftScope = JSON.stringify([accountId, courseId, row.generation, row.repo, row.folder]);
                return (
                  <tr key={row.generation}>
                    <th scope="row">{row.repo}</th>
                    <td>{row.folder || "Repository root"}</td>
                    <td>
                      {row.sourceRef} <code title={row.commit}>{row.commit.slice(0, 12)}</code>
                      <br />Configuration <code title={row.profileFingerprint}>{row.profileFingerprint.slice(0, 12)}</code>
                    </td>
                    <td><time dateTime={timestamp}>{timestamp.slice(0, 16).replace("T", " ")}</time></td>
                    <td>
                      {EVALUATION_STATUS[row.status]}
                      {dashboardFeedbackEnabled && <RepoDashboardHistoricalFeedback row={row} draftScope={draftScope} sessionDraft={drafts[draftScope]}
                        onDraftChange={(draft) => setDrafts((current) => ({ ...current, [draftScope]: draft }))} />}
                    </td>
                    <td>{row.score ?? "No score"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
