"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { Alert, Box, Button, List, ListItem, TextField, Typography } from "@mui/material";
import { useSupabase } from "@/context/SupabaseProvider";
import { isOwnerDecision } from "@/lib/access";
import { visuallyHidden } from "../ui/visuallyHidden";
import { useRepoGradesDurableStartupActivation, useRepoGradesEmbeddedPilot, useRepoGradesStartupActivation } from "./startup-activation";
import { serverRepoGradesStartupAdapter } from "./startup-adapter";
import { disabledRepoGradesStartupAdapter } from "./startup-coordinator";
import type { RepoGradesStartupProgress, RepoGradesStartupRecovery } from "./startup-progress";
import { STARTUP_STATUS } from "./startup-table";
import { useRepoGradesStartup } from "./useRepoGradesStartup";

import { RepoGradesAutomaticStatus } from "./RepoGradesAutomaticStatus";
import { useRepoGradesAutomatic } from "./useRepoGradesAutomatic";

const AutomaticContext = createContext<ReturnType<typeof useRepoGradesAutomatic> | null>(null);
const StartupContext = createContext<ReturnType<typeof useRepoGradesStartup> | null>(null);
const MANUAL_PAUSE = "Manual repository grading is paused while the Embedded pilot is selected.";

export function useRepoGradesTargetedGrading() {
  return useContext(AutomaticContext);
}

export function useRepoGradesAutomaticRun(accountId: string | null) {
  const { user, loading } = useSupabase();
  const status = useContext(AutomaticContext)?.status;
  return !loading && accountId && user?.id === accountId && status?.status === "loaded" ? status.run : null;
}

const PHASE_TEXT: Record<RepoGradesStartupProgress["phase"], string> = {
  unavailable: "Automatic repository checks at startup are currently unavailable.",
  checking: "Checking classes for automatic repository work.",
  processing: "Processing automatic repository checks.",
  complete: "Startup repository checks have finished.",
  incomplete: "Startup repository checks finished with incomplete results.",
  stopped: "Startup scheduling has stopped. Work already running can still finish.",
};

export function RepoGradesStartup({ children }: { children: ReactNode }) {
  const { user, loading, accessDecision } = useSupabase();
  const owner = isOwnerDecision(accessDecision);
  const durable = useRepoGradesDurableStartupActivation() && owner;
  const startupEnabled = useRepoGradesStartupActivation() && owner && !durable;
  const startupAdapter = startupEnabled ? serverRepoGradesStartupAdapter : disabledRepoGradesStartupAdapter;
  const accountId = loading ? null : user?.id ?? null;
  const startup = useRepoGradesStartup(accountId, startupAdapter);
  const automatic = useRepoGradesAutomatic(durable ? accountId : null);
  return (
    <StartupContext.Provider value={startup}>
      <p role="status" aria-atomic="true" style={visuallyHidden}>
        {startupAdapter.status === "configured" && !loading && user ? PHASE_TEXT[startup.progress.phase] : ""}
        {startup.progress.previousBatch?.courses.length ? " Previous batch status is available in Repo Grades." : ""}
        {startup.progress.recoverableResults?.length ? " Feedback is available to copy in Repo Grades during this session." : ""}
      </p>
      <AutomaticContext.Provider value={durable ? automatic : null}>{children}</AutomaticContext.Provider>
    </StartupContext.Provider>
  );
}

/** Refresh course history after a batch, scoped to the currently signed-in account. */
export function useRepoGradesStartupHistoryRevision(accountId: string, courseId: string): number {
  const { user, loading } = useSupabase();
  const progress = useContext(StartupContext)?.progress;
  const automatic = useContext(AutomaticContext)?.status;
  if (loading || user?.id !== accountId) return 0;
  if (automatic?.status === "loaded") {
    const course = automatic.run?.courses.find((entry) => entry.courseId === courseId);
    return course?.counts.reduce((total, { state, count }) =>
      total + (state === "queued" || state === "running" ? 0 : count), 0) ?? 0;
  }
  if (!progress || progress.phase === "checking" || progress.phase === "processing") return 0;
  return progress.historyRevisionByCourse?.get(courseId) ?? 0;
}

export function RepoGradesStartupBrief() {
  const startup = useContext(StartupContext);
  const automatic = useContext(AutomaticContext);
  if (!automatic) return <Typography component="span" variant="body2" role="status">{PHASE_TEXT[startup?.progress.phase ?? "unavailable"]}</Typography>;
  const status = automatic.status;
  if (!status || status.status === "unavailable") return <Typography component="span" variant="body2" role="status">{status ? "Status unavailable" : "Loading status"}</Typography>;
  const run = status.run;
  const phase = status.githubRetryAt ? `GitHub rate limit: retry at ${new Date(status.githubRetryAt).toLocaleString()}`
    : run?.waitingForBrowserStartup ? "Waiting for a previous startup check"
    : run ? PHASE_TEXT[run.phase === "discovering" ? "checking" : run.phase === "grading" ? "processing" : run.phase]
    : "No automatic run has started.";
  const notices = [automatic.stale && "Status may be out of date", !status.classQueue && "Class queue settings unavailable",
    status.recoveries.length > 0 && "Feedback recovery available",
    (status.preparations.length > 0 || run?.courses.some((course) => course.reason || course.counts.some((item) => item.reason))) && "Grading needs attention"].filter(Boolean);
  return <Typography component="span" variant="body2" role="status">{phase}{notices.map((notice) => ` · ${notice}`).join("")}</Typography>;
}

export function RepoGradesStartupStatus() {
  const startup = useContext(StartupContext);
  const automatic = useContext(AutomaticContext);
  const pilotEnabled = useRepoGradesEmbeddedPilot();
  const headingId = useId();
  const stopHintId = useId();
  const progress = startup?.progress;
  if (automatic) {
    return <section aria-label="Automatic repository grading"><RepoGradesAutomaticStatus automatic={automatic} />
        {pilotEnabled && <Alert severity="info" role="status">{MANUAL_PAUSE}</Alert>}
      </section>;
  }
  if (!startup || !progress || progress.phase === "unavailable") {
    return <section aria-label="Automatic repository grading"><Alert severity={pilotEnabled ? "warning" : "info"} role="status">
        {PHASE_TEXT.unavailable} {pilotEnabled && MANUAL_PAUSE}
      </Alert></section>;
  }

  const canStop = !!startup.stop && (progress.phase === "checking" || progress.phase === "processing");
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Startup repository checks</h2>
      <p>{PHASE_TEXT[progress.phase]}</p>
      {pilotEnabled && <Alert severity="info" role="status">{MANUAL_PAUSE}</Alert>}
      {progress.courses.some(({ states }) => states.some(({ state }) => state === "embedded-profile-required")) && (
        <p>The Embedded pilot requires a saved Embedded profile with a fixed rubric and instructions. Turn off README instructions, code execution, and target branch checks for that profile.</p>
      )}
      <Button type="button" variant="outlined" size="small" aria-disabled={!canStop} aria-describedby={stopHintId} onClick={() => {
        if (canStop) startup.stop?.();
      }}>
        Stop scheduling
      </Button>
      <p id={stopHintId}>Stops new startup work. Already-running work can still finish.</p>
      {progress.phase === "complete" && progress.courses.length === 0 && <p>No classes were found.</p>}
      {!!progress.previousBatch?.courses.length && (
        <>
          <h3>Previous startup batch</h3>
          {progress.previousBatch.active && <p>Another opening still holds this batch. Refresh later to check its status.</p>}
          <List dense>
            {progress.previousBatch.courses.map((course) => (
              <ListItem key={course.courseId}>
                {course.label} {course.states.map(({ state, count }) => `${STARTUP_STATUS[state].label} (${count})`).join(", ")}
              </ListItem>
            ))}
          </List>
        </>
      )}
      {!!progress.recoverableResults?.length && (
        <>
          <h3>Session feedback recovery</h3>
          <p>Saving could not be confirmed for this feedback. Copy it before reloading or signing out.</p>
          {progress.recoverableResults.map((entry) => {
            const { target } = entry;
            const course = progress.courses.find(({ courseId }) => courseId === target.courseId);
            const label = `${course?.label ?? target.courseId} / ${target.repo} / ${target.folder} / ${target.sourceRef}`;
            return (
              <RecoveryFeedback key={JSON.stringify(target)} label={label} entry={entry} />
            );
          })}
        </>
      )}
    </section>
  );
}

function RecoveryFeedback({ label, entry }: { label: string; entry: RepoGradesStartupRecovery }) {
  return (
    <Box component="section">
      <Typography variant="subtitle2">{label}</Typography>
        <TextField label={`Recovery data for ${label}`} multiline rows={10} fullWidth
          slotProps={{ input: { readOnly: true } }} value={JSON.stringify(entry, null, 2)} />
    </Box>
  );
}
