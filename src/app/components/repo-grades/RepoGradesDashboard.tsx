import { useSupabase } from "@/context/SupabaseProvider";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { isOwnerDecision } from "@/lib/access";
import type { FeedbackBoxesEdit } from "../grading-results/gradingResultsHelpers";
import { RepoGradesStartupPreview } from "../repo-grades-dashboard/RepoGradesStartupPreview";
import type { RepoGradeMatrix, RepoGradeSavedAttempt, RepoGradeSavedResult } from "./repoGradesDashboardModel";
import { FeedbackDisclosure, RepoResultCopy, RepoResultFeedback } from "./RepoDashboardFeedback";
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

export function RepoGradeAutomaticBlockNotice({ discoveryExplanation, pastRunStartedAt, unavailable, reloading, reloadReasons }: {
  discoveryExplanation: string | null;
  pastRunStartedAt?: string;
  unavailable: boolean;
  reloading: boolean;
  reloadReasons?: () => void;
}) {
  if (discoveryExplanation === null && !reloadReasons) return null;
  return (
    <Stack spacing={1}>
      {discoveryExplanation !== null && <Alert severity="warning" role="status">
        {pastRunStartedAt ? <>Automatic discovery for this class was incomplete in the run started{" "}
          <time dateTime={pastRunStartedAt}>{new Date(pastRunStartedAt).toLocaleString()}</time>.</>
          : "Latest automatic discovery was incomplete."}{" "}{discoveryExplanation}
        {" "}Some repositories may not have assignment results from this check.
      </Alert>}
      {reloadReasons && <Alert severity={unavailable && !reloading ? "warning" : "info"} role="group"
        action={<Button type="button" color="inherit" size="small" aria-disabled={reloading}
          onClick={reloadReasons}>Reload reasons</Button>}>
        <span role="status">{reloading ? "Loading automatic grading reasons for this class."
          : unavailable ? "Automatic grading reasons for this class could not be loaded."
            : "Automatic grading reasons refreshed."}</span>
      </Alert>}
    </Stack>
  );
}

export function RepoGradeResultDetails({ repo, folder, scanStatus, criterionOrder = [] }: {
  repo: RepoGradeMatrix["rows"][number]["repos"][number];
  folder: string;
  scanStatus?: "ungraded" | "missing-folder" | "scan-error";
  criterionOrder?: readonly string[];
}) {
  const cell = repo.cells.get(folder);
  const scored = cell?.saved?.scored;
  const sections = scored?.feedback_sections;
  const feedback = scored && {
    overall: scored.feedback ?? "", strengths: sections?.strengths ?? "",
    improvements: sections?.improvements ?? "", resubmitNotice: sections?.resubmitNotice ?? "",
  };
  return <>
    <div className={styles.matrixScoreHead} data-rubric-head>
      <Box data-rubric-head-content>
        {cell?.saved && <SavedMatrixResult result={cell.saved} repo={repo.name} folder={folder} feedback={feedback} showSource={false} part="score" />}
        {!cell?.saved && scanStatus && scanStatus !== "ungraded" && <RepoGradeStatusChip status={scanStatus} />}
      </Box>
    </div>
    <RepoGradeRubricScores areas={scored?.rubric ?? []} criterionOrder={criterionOrder} label={`Saved rubric scores: ${repo.name} / ${folder || "Repository root"}`} />
    {cell?.saved && <SavedMatrixResult result={cell.saved} repo={repo.name} folder={folder} feedback={feedback} showSource={false} part="details" />}
    {cell?.automaticBlocks?.map(({ sourceRef, explanation, runStartedAt, partial }) => (
      <Typography component="p" variant="body2" key={JSON.stringify([sourceRef, explanation])} sx={{ overflowWrap: "anywhere" }}>
        <strong>{partial ? "Automatic grading incomplete" : "Automatic grading blocked"}</strong> on {sourceRef}
        {runStartedAt && <> (run started <time dateTime={runStartedAt}>{new Date(runStartedAt).toLocaleString()}</time>)</>}.
        {" "}{explanation}
      </Typography>
    ))}
    {scanStatus === "missing-folder" && <Typography component="p" variant="caption" color="text.secondary">
      Check the assignment folder name and the branch selected for the scan.
    </Typography>}
    {scanStatus === "scan-error" && <Typography component="p" variant="caption" color="text.secondary">
      Check that GitHub access and the selected branch are available, then refresh the repository scan.
    </Typography>}
    {!scanStatus && !cell?.saved?.scored && cell?.saved?.latest.status !== "no-submission" &&
      <Typography variant="caption" color="text.secondary">Submission unknown</Typography>}
    {scored && feedback && <RepoResultCopy key={scored.generation} repo={repo.name} folder={folder}
      source="saved" feedback={feedback} rubric={scored.rubric ?? []} distinguishSource={false} />}
  </>;
}

function SavedMatrixResult({ result, repo, folder, feedback, showSource, part }: {
  result: RepoGradeSavedResult;
  repo: string;
  folder: string;
  feedback: FeedbackBoxesEdit | null | undefined;
  showSource: boolean;
  part: "score" | "details";
}) {
  const { latest, scored } = result;
  const sections = scored?.feedback_sections;
  return (
    <>
      {part === "score" && <><RepoGradeStatusChip status={latest.status === "claimed" ? "running" : latest.status}
        source={scored && scored.generation !== latest.generation ? "Latest saved" : showSource ? "Saved" : undefined} />
      {scored && (
        <>
          <Typography component="p" variant="body2">
            <strong>{scored.generation !== latest.generation ? "Earlier saved score "
              : showSource ? "Saved score " : ""}{scored.score}%</strong>
            {scored.generation !== latest.generation && scored.status === "partial" && <> <RepoGradeStatusChip status="partial" /></>}
          </Typography>
        </>
      )}
      </>}
      {part === "details" && <FeedbackDisclosure compact title="Saved evaluation details" label={`Saved evaluation details: ${repo} / ${folder || "Repository root"}`}>
        <SavedAttemptSource attempt={latest} label="Latest attempt" />
        {latest.feedback_retention && <p>Latest feedback exceeded the storage limit.</p>}
        {scored && (
          <>
            {scored.generation !== latest.generation && <SavedAttemptSource attempt={scored} label="Scored attempt" />}
            {sections && <p>Original score {sections.rawScore}</p>}
            {scored.feedback !== null && !sections && <p>Saved overall feedback may be shortened.</p>}
            {feedback && <RepoResultFeedback key={scored.generation} repo={repo} folder={folder} source="saved"
              feedback={feedback} rubric={[]} hideCopyAll />}
          </>
        )}
      </FeedbackDisclosure>}
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
