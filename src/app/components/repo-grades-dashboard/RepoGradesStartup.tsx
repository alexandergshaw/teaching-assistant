"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Button, List, ListItem, TextField } from "@mui/material";
import { useSupabase } from "@/context/SupabaseProvider";
import { isOwnerDecision } from "@/lib/access";
import { visuallyHidden } from "../ui/visuallyHidden";
import { RepoGradesStartupTable } from "./RepoGradesStartupTable";
import { useRepoGradesEmbeddedPilot, useRepoGradesStartupActivation } from "./startup-activation";
import { serverRepoGradesStartupAdapter } from "./startup-adapter";
import { disabledRepoGradesStartupAdapter } from "./startup-coordinator";
import type { RepoGradesStartupPreparation, RepoGradesStartupProgress, RepoGradesStartupRecovery } from "./startup-progress";
import { STARTUP_STATUS } from "./startup-table";
import { useRepoGradesStartup } from "./useRepoGradesStartup";

const StartupContext = createContext<ReturnType<typeof useRepoGradesStartup> | null>(null);
const MANUAL_PAUSE = "Manual repository grading is paused while the Embedded pilot is selected.";

const PHASE_TEXT: Record<RepoGradesStartupProgress["phase"], string> = {
  unavailable: "Automatic repository checks at startup are currently unavailable.",
  checking: "Checking classes for automatic repository work.",
  processing: "Processing automatic repository checks.",
  complete: "Startup repository checks have finished.",
  incomplete: "Startup repository checks finished with incomplete results.",
  stopped: "Startup scheduling has stopped. Work already running can still finish.",
};

const PREPARATION_TEXT: Record<RepoGradesStartupPreparation["status"], string> = {
  "explicit-retry-required": "This rubric preparation needs an explicit retry.",
  failed: "Rubric preparation failed.",
  retrying: "Retrying rubric preparation.",
  ready: "The rubric is ready for future eligible checks. This startup batch has finished.",
  busy: "Rubric preparation is already in progress.",
  capacity: "The preparation limit was reached.",
  "configuration-changed": "The assignment settings or repository inputs changed.",
  forbidden: "Access to this rubric preparation could not be verified.",
  "profile-unavailable": "The current grading profile could not be verified.",
  "storage-unavailable": "The saved preparation status could not be read.",
  unknown: "The retry outcome could not be confirmed.",
  "request-failed": "The retry request could not be confirmed.",
  "rubric-scope-required": "Save a rubric in the assignment's automatic grading profile before preparing it.",
  "course-kind-required": "Rubric preparation requires a course kind.",
  "retry-unavailable": "This retry is no longer available.",
};

export function RepoGradesStartup({ children }: { children: ReactNode }) {
  const { user, loading, accessDecision } = useSupabase();
  const startupEnabled = useRepoGradesStartupActivation() && isOwnerDecision(accessDecision);
  const startupAdapter = startupEnabled ? serverRepoGradesStartupAdapter : disabledRepoGradesStartupAdapter;
  const startup = useRepoGradesStartup(loading ? null : user?.id ?? null, startupAdapter);
  return (
    <StartupContext.Provider value={startup}>
      <p role="status" aria-atomic="true" style={visuallyHidden}>
        {startupAdapter.status === "configured" && !loading && user ? PHASE_TEXT[startup.progress.phase] : ""}
        {startup.progress.previousBatch?.courses.length ? " Previous batch status is available in Repo Grades." : ""}
        {startup.progress.recoverableResults?.length ? " Feedback is available to copy in Repo Grades during this session." : ""}
      </p>
      {children}
    </StartupContext.Provider>
  );
}

/** Refresh course history after a batch, scoped to the currently signed-in account. */
export function useRepoGradesStartupHistoryRevision(accountId: string, courseId: string): number {
  const { user, loading } = useSupabase();
  const progress = useContext(StartupContext)?.progress;
  if (loading || user?.id !== accountId || !progress || progress.phase === "checking" || progress.phase === "processing") return 0;
  return progress.historyRevisionByCourse?.get(courseId) ?? 0;
}

export function RepoGradesStartupStatus() {
  const startup = useContext(StartupContext);
  const pilotEnabled = useRepoGradesEmbeddedPilot();
  const headingId = useId();
  const stopHintId = useId();
  const progress = startup?.progress;
  if (!startup || !progress || progress.phase === "unavailable") {
    return <Alert severity={pilotEnabled ? "warning" : "info"} role="status">
      {PHASE_TEXT.unavailable} {pilotEnabled && MANUAL_PAUSE}
    </Alert>;
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
      {progress.courses.length > 0 && (
        <RepoGradesStartupTable courses={progress.courses} headingId={headingId} />
      )}
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
      {!!progress.preparations?.length && (
        <>
          <h3>Rubric preparation</h3>
          <p>A retry may use a model call to prepare the rubric. Repository grading remains separate.</p>
          <List dense>
            {progress.preparations.map((preparation) => {
              const { courseId, folder, status, canRetry } = preparation;
              const course = progress.courses.find((entry) => entry.courseId === courseId);
              const label = `${course?.label ?? "Class"} / ${folder}`;
              const enabled = progress.preparationRetryAvailable && canRetry;
              return (
                <ListItem key={JSON.stringify([courseId, folder])} sx={{ display: "block" }}>
                  <p>{label}</p>
                  <p role="status">{PREPARATION_TEXT[status]}</p>
                  {(canRetry || status === "retrying") && (
                    <Button type="button" variant="outlined" size="small" aria-label={`Retry rubric preparation for ${label}`} aria-disabled={!enabled}
                      onClick={() => { if (enabled) void startup.retryPreparation?.(preparation); }}>
                      Retry rubric preparation
                    </Button>
                  )}
                </ListItem>
              );
            })}
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
  const summaryId = useId();
  const panelId = useId();
  return (
    <Accordion>
      <AccordionSummary id={summaryId} aria-controls={panelId}>{label}</AccordionSummary>
      <AccordionDetails>
        <TextField label={`Recovery data for ${label}`} multiline rows={10} fullWidth
          slotProps={{ input: { readOnly: true } }} value={JSON.stringify(entry, null, 2)} />
      </AccordionDetails>
    </Accordion>
  );
}
