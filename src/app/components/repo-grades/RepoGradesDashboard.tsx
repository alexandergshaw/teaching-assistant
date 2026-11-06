import { useSupabase } from "@/context/SupabaseProvider";
import { isOwnerDecision } from "@/lib/access";
import type { FeedbackBoxesEdit } from "../grading-results/gradingResultsHelpers";
import { RepoGradesStartupPreview } from "../repo-grades-dashboard/RepoGradesStartupPreview";
import type { RepoGradeMatrix, RepoGradeSavedAttempt, RepoGradeSavedResult } from "./repoGradesDashboardModel";
import { FeedbackDisclosure, RepoResultCopy, RepoResultFeedback } from "./RepoDashboardFeedback";
import type { RepoGradeCellEdit } from "./repoGradesCellEdits";
import RepoGradeProfileSettings from "./RepoGradeProfileSettings";
import RepoGradeStatusChip from "./RepoGradeStatusChip";
import type { RepoGradeColumn } from "./repoGradesRows";
import styles from "./repo-grades-dashboard.module.css";

export default function RepoGradesDashboard({ courseId, gradeColumns }: {
  courseId: string;
  gradeColumns: readonly RepoGradeColumn[];
}) {
  const { user, accessDecision } = useSupabase();
  const ownerId = user && isOwnerDecision(accessDecision) ? user.id : null;
  if (!ownerId) return null;

  return (
    <section aria-label="Automatic repository evaluations">
      <RepoGradesStartupPreview key={JSON.stringify([ownerId, courseId])} accountId={ownerId} courseId={courseId} />
      <RepoGradeProfileSettings courseId={courseId} columns={gradeColumns} />
    </section>
  );
}

export function RepoGradeResultDetails({ repo, folder, editableEdit, hasScanStatus }: {
  repo: RepoGradeMatrix["rows"][number]["repos"][number];
  folder: string;
  editableEdit?: RepoGradeCellEdit;
  hasScanStatus: boolean;
}) {
  const cell = repo.cells.get(folder);
  const editable = editableEdit !== undefined;
  const browserEdit = editableEdit ?? cell?.local;
  const browserFeedback = browserEdit && {
    overall: browserEdit.comment, strengths: browserEdit.strengths,
    improvements: browserEdit.improvements, resubmitNotice: browserEdit.resubmitNotice,
  };
  const scored = cell?.saved?.scored;
  const sections = scored?.feedback_sections;
  const savedFeedback = scored && {
    overall: scored.feedback ?? "", strengths: sections?.strengths ?? "",
    improvements: sections?.improvements ?? "", resubmitNotice: sections?.resubmitNotice ?? "",
  };
  return (
    <>
      {!editable && cell?.local && (
        <>
          <p><strong>Browser score {cell.local.score.trim() || "unavailable"}</strong></p>
          {cell.local.submissionTruncated && <p>Submission truncated</p>}
          {cell.local.generatedScore !== null && cell.local.score !== cell.local.generatedScore && (
            <p>Rubric scores are from the generated result ({cell.local.generatedScore}).</p>
          )}
          {browserFeedback && <RepoResultFeedback repo={repo.name} folder={folder} source="browser"
            feedback={browserFeedback} rubric={cell.local.rubricAreas} hideCopyAll />}
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
      {cell?.saved && <SavedMatrixResult result={cell.saved} repo={repo.name} folder={folder} feedback={savedFeedback} />}
      {!editable && !hasScanStatus && !cell?.local && !cell?.retained?.length && !cell?.saved && !cell?.grading && !cell?.gradeFailed && (
        <p>{cell?.browser?.discovery === "Found in scan"
          ? "No result yet" : cell?.browser?.discovery ?? repo.emptyDiscovery ?? "No result shown"}</p>
      )}
      {browserFeedback && <RepoResultCopy repo={repo.name} folder={folder} source="browser" feedback={browserFeedback} />}
      {scored && savedFeedback && <RepoResultCopy key={scored.generation} repo={repo.name} folder={folder}
        source="saved" feedback={savedFeedback} />}
    </>
  );
}

function SavedMatrixResult({ result, repo, folder, feedback }: {
  result: RepoGradeSavedResult;
  repo: string;
  folder: string;
  feedback: FeedbackBoxesEdit | null | undefined;
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
        <SavedAttemptSource attempt={latest} label="Latest attempt" />
        {latest.feedback_retention && <p>Latest feedback exceeded the storage limit.</p>}
        {scored && (
          <>
            {scored.generation !== latest.generation && <SavedAttemptSource attempt={scored} label="Scored attempt" />}
            {sections && <p>Original score {sections.rawScore}</p>}
            {scored.feedback !== null && !sections && <p>Saved overall feedback may be shortened.</p>}
            {feedback && <RepoResultFeedback key={scored.generation} repo={repo} folder={folder} source="saved"
              feedback={feedback} rubric={scored.rubric ?? []} hideCopyAll />}
          </>
        )}
      </FeedbackDisclosure>
    </>
  );
}

function SavedAttemptSource({ attempt, label }: { attempt: RepoGradeSavedAttempt; label: string }) {
  const timestamp = attempt.settledAt ?? attempt.claimedAt;
  return (
    <p>
      {label} <time dateTime={timestamp}>{timestamp.slice(0, 16).replace("T", " ")} UTC</time>
      <br />Source {attempt.sourceRef} <code title={attempt.commit}>{attempt.commit.slice(0, 12)}</code>
      <br />Configuration <code title={attempt.profileFingerprint}>{attempt.profileFingerprint.slice(0, 12)}</code>
    </p>
  );
}
