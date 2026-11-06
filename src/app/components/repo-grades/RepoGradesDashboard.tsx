import { useSupabase } from "@/context/SupabaseProvider";
import { Typography } from "@mui/material";
import { isOwnerDecision } from "@/lib/access";
import type { FeedbackBoxesEdit } from "../grading-results/gradingResultsHelpers";
import { RepoGradesStartupPreview } from "../repo-grades-dashboard/RepoGradesStartupPreview";
import type { RepoGradeMatrix, RepoGradeSavedAttempt, RepoGradeSavedResult } from "./repoGradesDashboardModel";
import { FeedbackDisclosure, RepoResultCopy, RepoResultFeedback } from "./RepoDashboardFeedback";
import type { RepoGradeCellEdit } from "./repoGradesCellEdits";
import RepoGradeProfileSettings from "./RepoGradeProfileSettings";
import RepoGradeRubricScores from "./RepoGradeRubricScores";
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

export function RepoGradeResultDetails({ repo, folder, editableEdit, scanStatus }: {
  repo: RepoGradeMatrix["rows"][number]["repos"][number];
  folder: string;
  editableEdit?: RepoGradeCellEdit;
  scanStatus?: "ungraded" | "missing-folder" | "scan-error";
}) {
  const cell = repo.cells.get(folder);
  const editable = editableEdit !== undefined;
  const browserEdit = editableEdit ?? cell?.local;
  const latestRetained = (editableEdit?.retainedResults ?? cell?.retained)?.at(-1);
  const retainedSource = latestRetained?.source;
  const retainedFeedback = retainedSource && {
    overall: retainedSource.comment, strengths: retainedSource.strengths,
    improvements: retainedSource.improvements, resubmitNotice: retainedSource.resubmitNotice,
  };
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
  const browserStatus = editable ? undefined : cell?.browserStatus;
  const earlierBrowserScore = cell?.local?.generatedScore != null && browserStatus !== "succeeded" && browserStatus !== "partial";
  const browserScoreLabel = latestRetained ? "Browser draft score " : earlierBrowserScore ? "Earlier browser score "
    : cell?.saved ? "Browser score " : "";
  const hasBrowserGrade = !!(cell?.browserStatus || browserEdit?.score.trim());
  const hasBrowserFeedback = !!browserFeedback && Object.values(browserFeedback).some((part) => part.trim());
  const hasSavedFeedback = !!savedFeedback && Object.values(savedFeedback).some((part) => part.trim());
  const hasRetainedFeedback = !!retainedFeedback && Object.values(retainedFeedback).some((part) => part.trim());
  const resultLabel = `${repo.name} / ${folder || "Repository root"}`;
  return (
    <>
      {browserStatus && <RepoGradeStatusChip status={browserStatus} source={cell?.saved ? "Browser" : undefined} />}
      {!editable && !scanStatus && browserStatus !== "succeeded"
        && browserStatus !== "partial" && browserStatus !== "no-submission"
        && !cell?.saved?.scored && cell?.saved?.latest.status !== "no-submission" && (
        <Typography variant="caption" color="text.secondary">Submission unknown</Typography>
      )}
      {!editable && cell?.local && (
        <>
          {cell.local.score.trim() && <Typography component="p" variant="body2">
            <strong>{browserScoreLabel}{cell.local.score}</strong>
          </Typography>}
          {cell.local.submissionTruncated && <Typography variant="caption" color="text.secondary">Submission truncated</Typography>}
          <RepoGradeRubricScores areas={cell.local.rubricAreas} label={`Browser rubric scores: ${resultLabel}`} />
          {cell.local.generatedScore !== null && cell.local.score !== cell.local.generatedScore && (
            <p>Rubric scores are from the generated result ({cell.local.generatedScore}).</p>
          )}
          {browserFeedback && <RepoResultFeedback repo={repo.name} folder={folder} source="browser"
            feedback={browserFeedback} rubric={cell.local.rubricAreas} hideCopyAll />}
        </>
      )}
      {retainedSource && (
        <>
          <Typography component="p" variant="body2">
            <strong>Latest retained score {retainedSource.score.trim() || "unavailable"}</strong>
            {retainedSource.submissionTruncated && <> <RepoGradeStatusChip status="partial" /></>}
          </Typography>
          <RepoGradeRubricScores areas={retainedSource.rubricAreas} label={`Retained rubric scores: ${resultLabel}`} />
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
                  rubric={source.rubricAreas} hideCopyAll={id === latestRetained?.id} />
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
      {cell?.saved && <SavedMatrixResult result={cell.saved} repo={repo.name} folder={folder} feedback={savedFeedback}
        showSource={hasBrowserGrade} />}
      {browserFeedback && <RepoResultCopy repo={repo.name} folder={folder} source="browser" feedback={browserFeedback}
        distinguishSource={hasSavedFeedback || hasRetainedFeedback} />}
      {scored && savedFeedback && <RepoResultCopy key={scored.generation} repo={repo.name} folder={folder}
        source="saved" feedback={savedFeedback} distinguishSource={hasBrowserFeedback || hasRetainedFeedback} />}
      {latestRetained && retainedFeedback && <RepoResultCopy key={latestRetained.id} repo={repo.name} folder={folder}
        source="retained" feedback={retainedFeedback} distinguishSource retainedSource={latestRetained.source} />}
    </>
  );
}

function SavedMatrixResult({ result, repo, folder, feedback, showSource }: {
  result: RepoGradeSavedResult;
  repo: string;
  folder: string;
  feedback: FeedbackBoxesEdit | null | undefined;
  showSource: boolean;
}) {
  const { latest, scored } = result;
  const sections = scored?.feedback_sections;
  return (
    <>
      <RepoGradeStatusChip status={latest.status === "claimed" ? "running" : latest.status}
        source={scored && scored.generation !== latest.generation ? "Latest saved" : showSource ? "Saved" : undefined} />
      {scored && (
        <>
          <Typography component="p" variant="body2">
            <strong>{scored.generation !== latest.generation ? "Earlier saved score "
              : showSource ? "Saved score " : ""}{scored.score}%</strong>
            {scored.generation !== latest.generation && scored.status === "partial" && <> <RepoGradeStatusChip status="partial" /></>}
          </Typography>
          <RepoGradeRubricScores areas={scored.rubric ?? []} label={`Saved rubric scores: ${repo} / ${folder || "Repository root"}`} />
        </>
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
