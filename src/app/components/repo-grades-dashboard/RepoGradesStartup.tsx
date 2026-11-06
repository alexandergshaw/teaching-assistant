"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { useSupabase } from "@/context/SupabaseProvider";
import { visuallyHidden } from "../ui/visuallyHidden";
import { serverRepoGradesStartupAdapter } from "./startup-adapter";
import { disabledRepoGradesStartupAdapter } from "./startup-coordinator";
import type { CourseStartupState, RepoGradesStartupPreparation, RepoGradesStartupProgress } from "./startup-progress";
import { useRepoGradesStartup } from "./useRepoGradesStartup";

// Requires verified discovery and durable admission before activation.
const startupEnabled = false;
const startupAdapter = startupEnabled ? serverRepoGradesStartupAdapter : disabledRepoGradesStartupAdapter;
const StartupContext = createContext<ReturnType<typeof useRepoGradesStartup> | null>(null);

const PHASE_TEXT: Record<RepoGradesStartupProgress["phase"], string> = {
  unavailable: "Automatic repository checks at startup are currently unavailable.",
  checking: "Checking classes for automatic repository work.",
  processing: "Processing automatic repository checks.",
  complete: "Startup repository checks have finished.",
  incomplete: "Startup repository checks finished with incomplete results.",
  stopped: "Startup scheduling has stopped. Work already running can still finish.",
};

const STATE_TEXT: Record<CourseStartupState, string> = {
  checking: "Checking",
  queued: "Queued",
  running: "Running",
  succeeded: "Complete",
  "no-submission": "No submission",
  "no-work": "No work found",
  partial: "Partial",
  failed: "Failed",
  unknown: "Status unknown",
  blocked: "Blocked",
  "embedded-profile-required": "Blocked by Embedded profile requirements",
  busy: "Already claimed",
  "already-processed": "Already processed",
  stopped: "Stopped before starting",
  "not-started": "Not started in this batch",
  "not-configured": "No GitHub organization configured",
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
  const { user, loading } = useSupabase();
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
  const headingId = useId();
  const stopHintId = useId();
  const progress = startup?.progress;
  if (!startup || !progress || progress.phase === "unavailable") return <p>{PHASE_TEXT.unavailable}</p>;

  const canStop = !!startup.stop && (progress.phase === "checking" || progress.phase === "processing");
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Startup repository checks</h2>
      <p>{PHASE_TEXT[progress.phase]}</p>
      {progress.courses.some(({ states }) => states.some(({ state }) => state === "embedded-profile-required")) && (
        <p>The Embedded pilot requires a saved Embedded profile with a fixed rubric and instructions. Turn off README instructions, code execution, and target branch checks for that profile.</p>
      )}
      <button type="button" aria-disabled={!canStop} aria-describedby={stopHintId} onClick={() => {
        if (canStop) startup.stop?.();
      }}>
        Stop scheduling
      </button>
      <p id={stopHintId}>Stops new startup work. Already-running work can still finish.</p>
      {progress.phase === "complete" && progress.courses.length === 0 && <p>No classes were found.</p>}
      {progress.courses.length > 0 && (
        <table>
          <thead>
            <tr><th scope="col">Class</th><th scope="col">Startup status</th></tr>
          </thead>
          <tbody>
            {progress.courses.map((course) => (
              <tr key={course.courseId}>
                <th scope="row">{course.label}</th>
                <td>{course.states.map(({ state, count }) =>
                  count ? `${STATE_TEXT[state]} (${count})` : STATE_TEXT[state],
                ).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!!progress.previousBatch?.courses.length && (
        <>
          <h3>Previous startup batch</h3>
          {progress.previousBatch.active && <p>Another opening still holds this batch. Refresh later to check its status.</p>}
          <ul>
            {progress.previousBatch.courses.map((course) => (
              <li key={course.courseId}>
                {course.label} {course.states.map(({ state, count }) => `${STATE_TEXT[state]} (${count})`).join(", ")}
              </li>
            ))}
          </ul>
        </>
      )}
      {!!progress.preparations?.length && (
        <>
          <h3>Rubric preparation</h3>
          <p>A retry may use a model call to prepare the rubric. Repository grading remains separate.</p>
          <ul>
            {progress.preparations.map((preparation) => {
              const { courseId, folder, status, canRetry } = preparation;
              const course = progress.courses.find((entry) => entry.courseId === courseId);
              const label = `${course?.label ?? "Class"} / ${folder}`;
              const enabled = progress.preparationRetryAvailable && canRetry;
              return (
                <li key={JSON.stringify([courseId, folder])}>
                  <p>{label}</p>
                  <p role="status">{PREPARATION_TEXT[status]}</p>
                  {(canRetry || status === "retrying") && (
                    <button type="button" aria-label={`Retry rubric preparation for ${label}`} aria-disabled={!enabled}
                      onClick={() => { if (enabled) void startup.retryPreparation?.(preparation); }}>
                      Retry rubric preparation
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
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
              <details key={JSON.stringify(target)}>
                <summary>{label}</summary>
                <textarea aria-label={`Recovery data for ${label}`} readOnly rows={10} value={JSON.stringify(entry, null, 2)} />
              </details>
            );
          })}
        </>
      )}
    </section>
  );
}
