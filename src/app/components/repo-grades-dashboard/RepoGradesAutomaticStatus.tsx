"use client";

import { useId, useState } from "react";
import { Alert, Button, FormControlLabel, List, ListItem, Stack, Switch, TextField } from "@mui/material";
import { RepoGradesStartupTable } from "./RepoGradesStartupTable";
import type { CourseStartupProgress } from "./startup-progress";
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
  const { status, pending, setEnabled, start, stop, readRecovery, retryPreparation } = automatic;
  const [retryMessage, setRetryMessage] = useState("");
  if (!status || status.status === "unavailable") {
    return <Alert severity={status ? "warning" : "info"} role="status">
      {status ? "Automatic repository grading status is unavailable." : "Loading automatic repository grading settings."}
    </Alert>;
  }
  const { run } = status;
  const active = automaticRepoGradeRunActive(run);
  const courses: CourseStartupProgress[] = (run?.courses ?? []).map((course) => {
    const states = new Map<CourseStartupProgress["states"][number]["state"], number>();
    for (const { state, count } of course.counts) states.set(state, (states.get(state) ?? 0) + count);
    if (course.state === "partial" || states.size === 0) {
      const state = course.state === "scanned" ? "no-work" : course.state;
      states.set(state, (states.get(state) ?? 0) + 1);
    }
    return {
      courseId: course.courseId,
      label: course.label,
      states: [...states].map(([state, count]) => ({ state, count })),
    };
  });
  const details = (run?.courses ?? []).flatMap((course) => {
    const reasons = [...new Set([course.reason, ...course.counts.map(({ reason }) => reason)].filter((reason) => reason !== null))];
    return reasons.length ? [{ courseId: course.courseId, label: course.label, reasons }] : [];
  });

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Automatic repository grading</h2>
      <FormControlLabel
        label="Start automatic repository grading when I open the app"
        control={<Switch checked={status.enabled} disabled={pending}
          slotProps={{ input: { "aria-describedby": preferenceHintId } }}
          onChange={(_, enabled) => void setEnabled(enabled)} />}
      />
      <p id={preferenceHintId}>Turning this off affects future openings. Use Stop scheduling to stop the current run.</p>
      <p role="status">{run ? PHASE_TEXT[run.phase] : "No automatic run has started."}</p>
      <Stack direction="row" spacing={1}>
        <Button type="button" variant="outlined" size="small" disabled={!status.enabled || active || pending}
          onClick={() => void start()}>Start checks now</Button>
        <Button type="button" variant="outlined" size="small" disabled={!active || pending}
          onClick={() => { if (run) void stop(run.id); }}>Stop scheduling</Button>
      </Stack>
      {courses.length > 0 && <RepoGradesStartupTable courses={courses} headingId={headingId} />}
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
      {status.recoveries.length > 0 && (
        <>
          <h3>Feedback recovery</h3>
          <p>This feedback is available to copy for 24 hours after grading.</p>
          {status.recoveries.map(({ id, label, repo, folder }) => (
            <RecoveryFeedback key={id} label={`${label} / ${repo} / ${folder}`} read={() => readRecovery(id)} />
          ))}
        </>
      )}
      {details.length > 0 && (
        <List dense aria-label="Automatic repository grading details">
          {details.map(({ courseId, label, reasons }) => (
            <ListItem key={courseId}>{label} {reasons.map((reason) => reason.replaceAll("-", " ")).join(", ")}</ListItem>
          ))}
        </List>
      )}
    </section>
  );
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
