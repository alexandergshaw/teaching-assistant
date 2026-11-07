"use client";

import { useEffect, useId, useState } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Button, FormControlLabel, List, ListItem, ListItemText, Stack, SvgIcon, Switch, TextField, Typography } from "@mui/material";
import { RepoGradesStartupTable } from "./RepoGradesStartupTable";
import type { AutomaticRepoGradeRecovery } from "@/lib/repo-grades-dashboard/automatic-status";
import { automaticCourseProgress } from "./automatic-course-progress";
import { automaticReasonLabel } from "@/lib/repo-grades-dashboard/automatic-reason-label";
import { AutomaticRepoGradeScheduleControl } from "./AutomaticRepoGradeScheduleControl";
import { AutomaticRepoGradeClassQueue } from "./AutomaticRepoGradeClassQueue";
import { automaticRepoGradeRunActive, type useRepoGradesAutomatic } from "./useRepoGradesAutomatic";

const PHASE_TEXT = {
  discovering: "Checking classes for automatic repository work. You can close this page.",
  grading: "Automatic repository grading is running. You can close this page.",
  complete: "Automatic repository checks finished.",
  incomplete: "Automatic repository checks finished with incomplete results.",
  stopped: "Automatic scheduling stopped. Work already running can still finish.",
};

export function RepoGradesAutomaticStatus({ automatic }: { automatic: ReturnType<typeof useRepoGradesAutomatic> }) {
  const headingId = useId();
  const preferenceHintId = useId();
  const githubRetryHintId = useId();
  const { status, stale, pending, control, setEnabled, setGithubRetry, setSchedule, setClassQueue, start, stop, readRecovery, retryPreparation } = automatic;
  const [retryMessage, setRetryMessage] = useState("");
  const recoveries = useLiveRecoveries(status?.status === "loaded" ? status.recoveries : EMPTY_RECOVERIES);
  if (!status || status.status === "unavailable") {
    return <Alert severity={status ? "warning" : "info"} role="status">
      {status ? "Automatic repository grading status is unavailable." : "Loading automatic repository grading settings."}
    </Alert>;
  }
  const { run } = status;
  const active = automaticRepoGradeRunActive(run);
  const hasQueuedClasses = status.classQueue?.courses.some((course) => course.included);
  const courses = (run?.courses ?? []).map(automaticCourseProgress);
  const checkedRepos = (run?.courses ?? []).reduce((total, course) => total + (course.repositories?.checked ?? 0), 0);
  const completedGrades = (run?.courses ?? []).reduce((total, course) => total + course.counts.reduce(
    (count, item) => count + (item.state === "succeeded" ? item.count : 0), 0), 0);
  const details = (run?.courses ?? []).flatMap((course) => {
    const reasons = [...new Set([course.reason, ...course.counts.map(({ reason }) => reason)]
      .filter((reason) => reason !== null).map(automaticReasonLabel))];
    return reasons.length ? [{ courseId: course.courseId, label: course.label, reasons }] : [];
  });

  return (
    <section aria-labelledby={headingId}>
      <Typography id={headingId} variant="subtitle1" component="h2">Automatic repository grading</Typography>
      {stale && <Alert severity="warning" role="status">Showing the last available automatic grading status while we retry.</Alert>}
      <Typography variant="body2" role="status">{status.githubRetryAt ? `GitHub rate limit reached. The worker can retry at ${new Date(status.githubRetryAt).toLocaleString()}. You can close this page.`
        : run?.waitingForBrowserStartup ? "Waiting for the previous startup check to finish. You can close this page."
        : run?.phase === "stopped" && run.settling ? "Scheduling stopped. The worker is finishing the current task."
        : run ? PHASE_TEXT[run.phase] : "No automatic run has started."}</Typography>
      {active && <Typography variant="body2">{checkedRepos} repositories checked · {completedGrades} grades completed</Typography>}
      {!status.classQueue && <Alert severity="warning" role="status">Class queue settings are unavailable.</Alert>}
      {control?.changed === false && <Typography variant="body2" role="status">{control.action === "start"
        ? hasQueuedClasses === false ? "No new run started. Select and save at least one class in the queue."
          : "No new run started. The worker already has a run queued or finishing."
        : "This run has already stopped or finished."}</Typography>}
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }} useFlexGap>
        <Button type="button" variant="outlined" size="small" disabled={active || run?.settling || pending || !status.classQueue || hasQueuedClasses === false}
          onClick={() => void start()}>Start checks now</Button>
        <Button type="button" variant="outlined" size="small" disabled={!active || pending}
          onClick={() => { if (run) void stop(run.id); }}>Stop current run</Button>
      </Stack>
      {recoveries.length > 0 && <Alert severity="warning" role="status">Feedback is available to recover for {recoveries.length} grading {recoveries.length === 1 ? "result" : "results"}. Open grading details to copy it.</Alert>}
      {(details.length > 0 || status.preparations.length > 0) && <Alert severity="warning" role="status">Some classes or rubric preparations need attention. Open grading details for the reasons.</Alert>}
      <Accordion disableGutters elevation={0}>
        <AccordionSummary aria-controls={`${headingId}-settings`} id={`${headingId}-settings-summary`}
          expandIcon={<SvgIcon><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" /></SvgIcon>}>
          <Typography>Schedule and class queue</Typography>
        </AccordionSummary>
        <AccordionDetails>
      <FormControlLabel
        label="Start automatic repository grading when I open the app"
        control={<Switch checked={status.enabled} disabled={pending}
          slotProps={{ input: { "aria-describedby": preferenceHintId } }}
          onChange={(_, enabled) => void setEnabled(enabled)} />}
      />
      <p id={preferenceHintId}>Turning this off affects future openings. The background schedule is configured separately.</p>
      <Stack>
        <FormControlLabel
          label="Retry automatically when the GitHub API limit resets"
          control={<Switch checked={status.githubRetryEnabled} disabled={pending}
            slotProps={{ input: { "aria-describedby": githubRetryHintId } }}
            onChange={(_, enabled) => void setGithubRetry(enabled)} />}
        />
        <p id={githubRetryHintId}>When GitHub limits requests, the background worker waits and resumes the same run.
          Turning this off ends a run that is waiting for GitHub.</p>
      </Stack>
      <AutomaticRepoGradeScheduleControl schedule={status.schedule} pending={pending} save={setSchedule} />
      {status.classQueue ? <AutomaticRepoGradeClassQueue queue={status.classQueue} courses={courses} pending={pending}
        save={setClassQueue} /> : <>
        {courses.length > 0 && <RepoGradesStartupTable courses={courses} headingId={headingId} />}
      </>}
        </AccordionDetails>
      </Accordion>
      {(status.preparations.length > 0 || recoveries.length > 0 || details.length > 0 || retryMessage) && <Accordion disableGutters elevation={0}>
        <AccordionSummary aria-controls={`${headingId}-details`} id={`${headingId}-details-summary`}
          expandIcon={<SvgIcon><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" /></SvgIcon>}>
          <Typography>Grading details and recovery</Typography>
        </AccordionSummary>
        <AccordionDetails>
      {status.preparations.length > 0 && (
        <>
          <h3>Rubric preparation</h3>
          <p>A retry may use a model call to prepare the rubric. Repository grading remains separate.</p>
          <List dense>
            {status.preparations.map(({ id, label, folder }) => (
              <ListItem key={id}>
                <Button type="button" size="small" disabled={pending || active} onClick={async () => {
                  const result = await retryPreparation(id);
                  setRetryMessage(result.status === "ready" ? "Rubric preparation finished." :
                    `Rubric preparation: ${result.status.replaceAll("-", " ")}.`);
                }}>
                  Retry rubric preparation for {label} / {folder}
                </Button>
              </ListItem>
            ))}
          </List>
        </>
      )}
      {retryMessage && <p role="status">{retryMessage}</p>}
      {recoveries.length > 0 && (
        <>
          <h3>Feedback recovery</h3>
          <p>This feedback is available to copy for 24 hours after grading.</p>
          {recoveries.map(({ id, label, repo, folder }) => (
            <RecoveryFeedback key={id} label={`${label} / ${repo} / ${folder}`} read={() => readRecovery(id)} />
          ))}
        </>
      )}
      {details.length > 0 && (
        <List dense aria-label="Automatic repository grading details">
          {details.map(({ courseId, label, reasons }) => (
            <ListItem key={courseId}><ListItemText primary={label} secondary={reasons.join(" ")} /></ListItem>
          ))}
        </List>
      )}
        </AccordionDetails>
      </Accordion>}
    </section>
  );
}

const EMPTY_RECOVERIES: AutomaticRepoGradeRecovery[] = [];

function useLiveRecoveries(recoveries: AutomaticRepoGradeRecovery[]) {
  const [now, setNow] = useState(() => Date.now());
  const live = recoveries.filter(({ expiresAt }) => Date.parse(expiresAt) > now);
  const nextExpiry = Math.min(...live.map(({ expiresAt }) => Date.parse(expiresAt)));
  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, nextExpiry - Date.now()));
    return () => clearTimeout(timer);
  }, [nextExpiry]);
  return live;
}

function RecoveryFeedback({ label, read }: { label: string; read: () => Promise<string | null> }) {
  const [payload, setPayload] = useState<string | null>();
  const [loading, setLoading] = useState(false);
  return (
    <Stack>
      <Button type="button" size="small" disabled={loading} onClick={async () => {
        setLoading(true);
        setPayload(await read().catch(() => null));
        setLoading(false);
      }}>
        Load feedback for {label}
      </Button>
      {payload === null && <p role="status">Feedback could not be loaded.</p>}
      {payload && <TextField label={`Recovery data for ${label}`} multiline rows={10} fullWidth
        slotProps={{ input: { readOnly: true } }} value={payload} />}
    </Stack>
  );
}
