import { useSupabase } from "@/context/SupabaseProvider";
import { Alert, Box, Button, Chip, Stack, Typography } from "@mui/material";
import { isOwnerDecision } from "@/lib/access";
import type { FeedbackBoxesEdit } from "../grading-results/gradingResultsHelpers";
import { hasUnresolvedStaleNoSubmission, unorderedNoSubmissionContext, newerVerifiedNoSubmission, noSubmissionMatchesScan, savedResultIsEarlierThanObservedPin, type RepoGradeMatrix, type RepoGradeSavedAttempt, type RepoGradeSavedResult } from "./repoGradesDashboardModel";
import { FeedbackDisclosure, RepoResultCopy, RepoResultFeedback } from "./RepoDashboardFeedback";
import RepoGradeInstructorReview from "./RepoGradeInstructorReview";
import RepoGradeProfileSettings from "./RepoGradeProfileSettings";
import RepoGradeRubricScores from "./RepoGradeRubricScores";
import RepoGradeStatusChip from "./RepoGradeStatusChip";
import type { RepoGradeColumn } from "./repoGradesRows";
import styles from "./repo-grades-dashboard.module.css";

export default function RepoGradesDashboard({ courseId, organization, gradeColumns }: {
  courseId: string;
  organization: string;
  gradeColumns: readonly RepoGradeColumn[];
}) {
  const { user, accessDecision } = useSupabase();
  const ownerId = user && isOwnerDecision(accessDecision) ? user.id : null;
  if (!ownerId) return null;

  return (
    <section aria-label="Automatic repository evaluations">
      <RepoGradeProfileSettings courseId={courseId} organization={organization} columns={gradeColumns} />
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

export function RepoGradeResultDetails({ repo, folder, scanStatus, criterionOrder = [], courseId }: {
  repo: RepoGradeMatrix["rows"][number]["repos"][number];
  folder: string;
  scanStatus?: "ungraded" | "missing-folder" | "scan-error";
  criterionOrder?: readonly string[];
  courseId?: string;
}) {
  const cell = repo.cells.get(folder);
  const rawNoSubmission = cell?.automaticBlocks?.find((item) => item.noSubmission && !item.noSubmissionStale);
  const provenNoSubmission = newerVerifiedNoSubmission(cell?.saved, cell?.automaticBlocks)
    && noSubmissionMatchesScan(rawNoSubmission?.sourceRef, rawNoSubmission?.sourceSha, cell?.browser);
  const historicalEmpty = cell?.saved?.latest.status === "no-submission"
    && !noSubmissionMatchesScan(cell.saved.latest.sourceRef, cell.saved.latest.commit, cell.browser);
  const historicalAutomaticEmpty = !!rawNoSubmission && !provenNoSubmission
    && !noSubmissionMatchesScan(rawNoSubmission.sourceRef, rawNoSubmission.sourceSha, cell?.browser);
  const staleNoSubmission = cell?.automaticBlocks?.some((item) => item.noSubmissionStale);
  const earlierScore = savedResultIsEarlierThanObservedPin(cell?.saved, cell?.automaticBlocks);
  const ambiguousNoSubmission = unorderedNoSubmissionContext(cell?.saved, cell?.automaticBlocks, provenNoSubmission, !!staleNoSubmission);
  const scored = provenNoSubmission ? null : cell?.saved?.scored;
  const draft = cell?.saved?.draft && cell.saved.draft.generation === cell.saved.latest.generation ? cell.saved.draft : null;
  const sections = scored?.feedback_sections;
  const feedback = scored && {
    overall: scored.feedback ?? "", strengths: sections?.strengths ?? "",
    improvements: sections?.improvements ?? "", resubmitNotice: sections?.resubmitNotice ?? "",
  };
  return <>
    <div className={styles.matrixScoreHead} data-rubric-head>
      <Box data-rubric-head-content className={styles.matrixScoreContent}>
        {cell?.saved && !provenNoSubmission && <SavedMatrixResult result={cell.saved} repo={repo.name} folder={folder} feedback={feedback} showSource={false} part="score" earlierPin={earlierScore || historicalEmpty} />}
        {provenNoSubmission && <RepoGradeStatusChip status="no-submission" />}
        {!cell?.saved && scanStatus && scanStatus !== "ungraded" && <RepoGradeStatusChip status={scanStatus} />}
      </Box>
    </div>
    {draft && <Alert severity="warning" role="status">
      Unscored provisional draft: test coverage was not verified. {draft.unexamined_artifacts?.length ? `Unexamined optional binary files: ${draft.unexamined_artifacts.map((item) => item.path).join(", ")}. These files were not assessed.` : "No optional files were excluded."}
      Instructor review is required.
    </Alert>}
    {draft && courseId && <RepoGradeInstructorReview key={draft.generation} courseId={courseId} generation={draft.generation} sourceSha={draft.commit} areas={(draft.rubric ?? []).map(item => item.area)} />}
    {draft?.module12_evidence && <FeedbackDisclosure compact title="Execution observations" label={`Execution observations: ${repo.name} / ${folder}`}>
      <Typography component="p" variant="body2">Coverage and source equivalence are unverified. Output is supplied by the submission and may be misleading.</Typography>
      {draft.module12_evidence.sourceReceipts.map(item => <Typography component="p" variant="body2" key={item.sourcePath}>
        {item.sourcePath}: compile {item.compileState}, exit {item.compileExit ?? "not reported"}; run {item.runState}, exit {item.runExit ?? "not reported"}.
      </Typography>)}
      {draft.module12_evidence.artifactReceipts.map(item => <Typography component="p" variant="body2" key={item.path}>
        {item.path}: {item.executionStatus}; exit {item.exit ?? "not run"}.
      </Typography>)}
    </FeedbackDisclosure>}
    {scored?.unexamined_artifacts?.length ? <Alert severity="warning" role="status">
      Unexamined optional binary files: {scored.unexamined_artifacts.map((item) => item.path).join(", ")}.
      Correctness and equivalence to source were not established. Feedback copying is unavailable for this result while the omitted files require review.
    </Alert> : null}
    {scored?.module12_evidence && <Alert severity="warning" role="status">
      This is a provisional model-assessed score based on submitted source and observed execution. Test counts, coverage and binary-to-source equivalence were not independently verified; runtime failures may reflect unavailable dependencies.
    </Alert>}
    {scored?.module12_evidence && <FeedbackDisclosure compact title="Execution observations" label={`Execution observations: ${repo.name} / ${folder}`}>
      {scored.module12_evidence.sourceReceipts.map(item => <Typography component="p" variant="body2" key={item.sourcePath}>
        {item.sourcePath}: compile {item.compileState}, exit {item.compileExit ?? "not reported"}; run {item.runState}, exit {item.runExit ?? "not reported"}.
      </Typography>)}
      {scored.module12_evidence.artifactReceipts.map(item => <Typography component="p" variant="body2" key={item.path}>
        {item.path}: {item.executionStatus}; exit {item.exit ?? "not run"}. Source equivalence unverified.
      </Typography>)}
    </FeedbackDisclosure>}
    {scored?.execution_receipts?.length ? <FeedbackDisclosure compact title="Execution evidence" label={`Execution evidence: ${repo.name} / ${folder}`}>
      <Typography component="p" variant="body2">Dependency completeness is unverified. Execution does not establish test count, coverage, or correctness.</Typography>
      {scored.execution_receipts.map((receipt) => <Typography component="p" variant="body2" key={receipt.sourcePath}>
        {receipt.sourcePath}: {receipt.language}; {receipt.compile ? `compile exit ${receipt.compile.exitCode}; ` : ""}
        {receipt.run ? `run exit ${receipt.run.exitCode}` : "not run after compile failure"}; {receipt.compilerVersion}.
      </Typography>)}
    </FeedbackDisclosure> : null}
    {draft && <FeedbackDisclosure compact title="Review-only draft" label={`Review-only draft: ${repo.name} / ${folder}`}>
      <RepoResultFeedback repo={repo.name} folder={folder} source="review-only draft"
        feedback={{ overall: draft.feedback ?? "", strengths: draft.feedback_sections?.strengths ?? "", improvements: draft.feedback_sections?.improvements ?? "", resubmitNotice: draft.feedback_sections?.resubmitNotice ?? "" }} rubric={draft.rubric ?? []} />
    </FeedbackDisclosure>}
    <RepoGradeRubricScores areas={scored?.rubric ?? []} criterionOrder={criterionOrder}
      placeholderOnly={provenNoSubmission || (!scored && cell?.saved?.latest.status === "no-submission")}
      label={`Saved rubric scores: ${repo.name} / ${folder || "Repository root"}`} />
    {cell?.saved && !provenNoSubmission && <SavedMatrixResult result={cell.saved} repo={repo.name} folder={folder} feedback={feedback} showSource={false} part="details" />}
    {(historicalEmpty || historicalAutomaticEmpty) && <Typography component="p" variant="caption" color="text.secondary">
      {cell?.browser?.scanCommit
        ? "An earlier check found no submission at a different revision. Check the current revision before grading."
        : "A previous check found no submission, but the current target branch revision could not be verified against it."}
    </Typography>}
    {ambiguousNoSubmission && <Typography component="p" variant="caption" color="text.secondary">
      A repository check found no submission; its order relative to the saved {ambiguousNoSubmission === "score" ? "grade" : "attempt"} could not be verified.
    </Typography>}
    {hasUnresolvedStaleNoSubmission(cell?.saved, cell?.automaticBlocks) && <Typography component="p" variant="caption" color="text.secondary">
      An earlier check found no submission. A later check used a different repository revision; check its grading status.
    </Typography>}
    {cell?.automaticBlocks?.filter((item) => !item.noSubmission).map(({ sourceRef, explanation, runStartedAt, partial }) => (
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
    {!scanStatus && !draft && !provenNoSubmission && !cell?.saved?.scored && cell?.saved?.latest.status !== "no-submission" &&
      <Typography variant="caption" color="text.secondary">Submission unknown</Typography>}
    {scored && feedback && !scored.unexamined_artifacts?.length && !scored.module12_evidence && <RepoResultCopy key={scored.generation} repo={repo.name} folder={folder}
      source="saved" feedback={feedback} rubric={scored.rubric ?? []} distinguishSource={false} />}
  </>;
}

function SavedMatrixResult({ result, repo, folder, feedback, showSource, part, earlierPin }: {
  result: RepoGradeSavedResult;
  repo: string;
  folder: string;
  feedback: FeedbackBoxesEdit | null | undefined;
  showSource: boolean;
  part: "score" | "details";
  earlierPin?: boolean;
}) {
  const { latest, scored } = result;
  const sections = scored?.feedback_sections;
  return (
    <>
      {part === "score" && <>{earlierPin ? <Chip size="small" label={latest.status === "no-submission" ? "Earlier no-submission check" : "Earlier or unconfirmed grade"} />
        : <RepoGradeStatusChip status={latest.status === "claimed" ? "running" : latest.status}
          source={scored && scored.generation !== latest.generation ? "Latest saved" : showSource ? "Saved" : undefined} />}
      {scored && scored.score !== null && (
        <>
          <Typography component="p" variant="body2">
            <strong>{earlierPin || scored.generation !== latest.generation ? "Earlier saved score "
              : showSource ? "Saved score " : ""}{scored.score}%</strong>
            {scored.generation !== latest.generation && scored.status === "partial" && <> <RepoGradeStatusChip status="partial" /></>}
          </Typography>
        </>
      )}
      </>}
      {part === "details" && <FeedbackDisclosure compact title="Saved evaluation details" label={`Saved evaluation details: ${repo} / ${folder || "Repository root"}`}>
        <SavedAttemptSource attempt={latest} label="Latest attempt" />
        {latest.feedback_retention && <p>Latest feedback exceeded the storage limit.</p>}
        {scored && scored.score !== null && (
          <>
            {scored.generation !== latest.generation && <SavedAttemptSource attempt={scored} label="Scored attempt" />}
            {sections && <p>Original score {sections.rawScore}</p>}
            {scored.feedback !== null && !sections && <p>Saved overall feedback may be shortened.</p>}
            {feedback && <RepoResultFeedback key={scored.generation} repo={repo} folder={folder} source="saved"
              feedback={feedback} rubric={[]} hideCopyAll disableCopy={!!scored.unexamined_artifacts?.length || !!scored.module12_evidence} />}
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
