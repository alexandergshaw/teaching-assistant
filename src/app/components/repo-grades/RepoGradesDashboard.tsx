import { useId, useState } from "react";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import Button from "@mui/material/Button";
import { useSupabase } from "@/context/SupabaseProvider";
import { isOwnerDecision } from "@/lib/access";
import { RepoGradesStartupPreview } from "../repo-grades-dashboard/RepoGradesStartupPreview";
import type { RepoGradeMatrix, RepoGradeSavedResult } from "./repoGradesDashboardModel";
import { useRepoGradeHistory } from "./useRepoGradeHistory";
import { FeedbackDisclosure, RepoDashboardHistoricalFeedback, RepoResultFeedback, type HistoricalFeedbackDraft } from "./RepoDashboardFeedback";
import RepoGradeProfileSettings from "./RepoGradeProfileSettings";
import RepoGradeStatusChip from "./RepoGradeStatusChip";
import { RepoGradesLoadingStatus } from "./RepoGradesLoadingStatus";
import type { RepoGradeColumn } from "./repoGradesRows";
import styles from "./repo-grades-dashboard.module.css";

// The attempt history's separate draft editor stays off pending activation approval.
const dashboardFeedbackEnabled = false;

export default function RepoGradesDashboard({ courseId, gradeColumns }: {
  courseId: string;
  gradeColumns: readonly RepoGradeColumn[];
}) {
  const { user, accessDecision } = useSupabase();
  const [historyOpen, setHistoryOpen] = useState(false);
  const ownerId = user && isOwnerDecision(accessDecision) ? user.id : null;
  if (!ownerId) return null;

  return (
    <section aria-label="Automatic repository evaluations">
      <RepoGradesStartupPreview key={JSON.stringify([ownerId, courseId])} accountId={ownerId} courseId={courseId} />
      <RepoGradeProfileSettings courseId={courseId} columns={gradeColumns} />
      <FeedbackDisclosure title="Saved evaluation history" expanded={historyOpen} onExpand={setHistoryOpen}>
        {historyOpen && <RepoGradeHistory courseId={courseId} accountId={ownerId} />}
      </FeedbackDisclosure>
    </section>
  );
}

export function RepoGradeResultDetails({ repo, folder, editable, hasScanStatus }: {
  repo: RepoGradeMatrix["rows"][number]["repos"][number];
  folder: string;
  editable: boolean;
  hasScanStatus: boolean;
}) {
  const cell = repo.cells.get(folder);
  return (
    <>
      {!editable && cell?.local && (
        <>
          <p><strong>Browser score {cell.local.score.trim() || "unavailable"}</strong></p>
          {cell.local.submissionTruncated && <p>Submission truncated</p>}
          {cell.local.generatedScore !== null && cell.local.score !== cell.local.generatedScore && (
            <p>Rubric scores are from the generated result ({cell.local.generatedScore}).</p>
          )}
          <RepoResultFeedback repo={repo.name} folder={folder} source="browser"
            feedback={{ overall: cell.local.comment, strengths: cell.local.strengths,
              improvements: cell.local.improvements, resubmitNotice: cell.local.resubmitNotice }}
            rubric={cell.local.rubricAreas} />
        </>
      )}
      {!!cell?.retained?.length && (
        <FeedbackDisclosure compact title="Retained results"
          label={`Retained results: ${repo.name} / ${folder || "Repository root"}`}>
          {cell?.retained?.map(({ id, source, draft }, index) => {
            const label = `Retained result ${index + 1}`;
            return (
              <div key={id} className={styles.matrixResult}>
                <p><strong>{label} {source.score.trim() || "score unavailable"}</strong></p>
                {source.submissionTruncated && <p>Submission truncated</p>}
                <RepoResultFeedback repo={repo.name} folder={folder} source={label}
                  feedback={{ overall: source.comment, strengths: source.strengths,
                    improvements: source.improvements, resubmitNotice: source.resubmitNotice }}
                  rubric={source.rubricAreas} />
                {draft && (
                  <>
                    <p>Draft score {draft.score.trim() || "unavailable"}</p>
                    <RepoResultFeedback repo={repo.name} folder={folder} source={`${label} draft`}
                      feedback={{ overall: draft.comment, strengths: draft.strengths,
                        improvements: draft.improvements, resubmitNotice: draft.resubmitNotice }}
                      rubric={[]} />
                  </>
                )}
              </div>
            );
          })}
        </FeedbackDisclosure>
      )}
      {!editable && cell?.grading && <p>Browser grading in progress</p>}
      {!editable && cell?.gradeFailed && <p>Browser grading failed</p>}
      {cell?.saved && <SavedMatrixResult result={cell.saved} repo={repo.name} folder={folder} />}
      {!editable && !hasScanStatus && !cell?.local && !cell?.retained?.length && !cell?.saved && !cell?.grading && !cell?.gradeFailed && (
        <p>{cell?.browser?.discovery === "Found in scan"
          ? "No result yet" : cell?.browser?.discovery ?? repo.emptyDiscovery ?? "No result shown"}</p>
      )}
    </>
  );
}

function SavedMatrixResult({ result, repo, folder }: {
  result: RepoGradeSavedResult;
  repo: string;
  folder: string;
}) {
  const { latest, scored } = result;
  const sections = scored?.feedback_sections;
  return (
    <>
      <p>Latest saved attempt: <RepoGradeStatusChip status={latest.status === "claimed" ? "running" : latest.status} /></p>
      {scored && (
        <p>
          <strong>{scored.generation === latest.generation ? "Saved score" : "Earlier saved score"} {scored.score}%</strong>
          {scored.generation !== latest.generation && scored.status === "partial" && <> <RepoGradeStatusChip status="partial" /></>}
        </p>
      )}
      <FeedbackDisclosure compact title="Saved evaluation details" label={`Saved evaluation details: ${repo} / ${folder || "Repository root"}`}>
        <p>Latest commit <code title={latest.commit}>{latest.commit.slice(0, 12)}</code></p>
        {latest.feedback_retention && <p>Latest feedback exceeded the storage limit.</p>}
        {scored && (
          <>
            {scored.generation !== latest.generation && <p>Score from commit <code title={scored.commit}>{scored.commit.slice(0, 12)}</code></p>}
            {sections && <p>Original score {sections.rawScore}</p>}
            {scored.feedback !== null && !sections && <p>Saved overall feedback may be shortened.</p>}
            <RepoResultFeedback key={scored.generation} repo={repo} folder={folder} source="saved"
              feedback={{ overall: scored.feedback ?? "", strengths: sections?.strengths ?? "",
                improvements: sections?.improvements ?? "", resubmitNotice: sections?.resubmitNotice ?? "" }}
              rubric={scored.rubric ?? []} />
          </>
        )}
      </FeedbackDisclosure>
    </>
  );
}

function RepoGradeHistory({ courseId, accountId }: { courseId: string; accountId: string }) {
  const headingId = useId();
  const [drafts, setDrafts] = useState<Record<string, HistoricalFeedbackDraft>>({});
  const { page, pageNumber, pending, error, older, newer, retry } = useRepoGradeHistory(courseId, accountId);
  let summary = "";
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
      <p>Automatic attempts are listed newest first, including repositories outside the current GitHub scan. The gradebook shows browser scores and instructor edits.</p>
      <RepoGradesLoadingStatus label={pending ? "Loading saved evaluation history…" : null} settledLabel={summary} />
      <div>
        <Button type="button" size="small" aria-disabled={pending || pageNumber === 1} onClick={newer}>Newer attempts</Button>
        <Button type="button" size="small" aria-disabled={pending || page?.nextBefore == null} onClick={older}>Older attempts</Button>
        <Button type="button" size="small" aria-disabled={pending || !error} onClick={retry}>Retry history read</Button>
      </div>
      {page && page.rows.length > 0 && (
        <TableContainer className={styles.scroll} role="region" aria-labelledby={headingId} tabIndex={0} aria-busy={pending}>
          <Table size="small" className={styles.table} aria-label="Saved repository evaluation attempts">
            <TableHead>
              <TableRow>
                <TableCell component="th" scope="col">Repository</TableCell>
                <TableCell component="th" scope="col">Folder</TableCell>
                <TableCell component="th" scope="col">Commit and configuration</TableCell>
                <TableCell component="th" scope="col">Attempt date (UTC)</TableCell>
                <TableCell component="th" scope="col">Status</TableCell>
                <TableCell component="th" scope="col">Score</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {page.rows.map((row) => {
                const timestamp = row.settledAt ?? row.claimedAt;
                const draftScope = JSON.stringify([accountId, courseId, row.generation, row.repo, row.folder]);
                return (
                  <TableRow key={row.generation}>
                    <TableCell component="th" scope="row">{row.repo}</TableCell>
                    <TableCell>{row.folder || "Repository root"}</TableCell>
                    <TableCell>
                      {row.sourceRef} <code title={row.commit}>{row.commit.slice(0, 12)}</code>
                      <br />Configuration <code title={row.profileFingerprint}>{row.profileFingerprint.slice(0, 12)}</code>
                    </TableCell>
                    <TableCell><time dateTime={timestamp}>{timestamp.slice(0, 16).replace("T", " ")}</time></TableCell>
                    <TableCell>
                      <RepoGradeStatusChip status={row.status === "claimed" ? "running" : row.status} />
                      {dashboardFeedbackEnabled && <RepoDashboardHistoricalFeedback row={row} draftScope={draftScope} sessionDraft={drafts[draftScope]}
                        onDraftChange={(draft) => setDrafts((current) => ({ ...current, [draftScope]: draft }))} />}
                    </TableCell>
                    <TableCell>{row.score ?? "No score"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </section>
  );
}
