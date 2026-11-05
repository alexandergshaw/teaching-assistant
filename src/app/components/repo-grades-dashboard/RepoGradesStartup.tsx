"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { useSupabase } from "@/context/SupabaseProvider";
import { visuallyHidden } from "../ui/visuallyHidden";
import { disabledRepoGradesStartupAdapter } from "./startup-coordinator";
import type { CourseStartupState, RepoGradesStartupProgress } from "./startup-progress";
import { useRepoGradesStartup } from "./useRepoGradesStartup";

// The preview action only scans a single course and cannot authorize startup
// evaluation. Replace this adapter when the server can attest to readiness.
const startupAdapter = disabledRepoGradesStartupAdapter;
const StartupContext = createContext<ReturnType<typeof useRepoGradesStartup> | null>(null);

const PHASE_TEXT: Record<RepoGradesStartupProgress["phase"], string> = {
  unavailable: "Automatic repository checks at startup are currently unavailable.",
  checking: "Checking classes for automatic repository work.",
  processing: "Processing automatic repository checks.",
  complete: "Startup repository checks have finished.",
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
  busy: "Already claimed",
  "already-processed": "Already processed",
  stopped: "Stopped before starting",
  "not-configured": "No GitHub organization configured",
};

export function RepoGradesStartup({ children }: { children: ReactNode }) {
  const { user, loading } = useSupabase();
  const startup = useRepoGradesStartup(loading ? null : user?.id ?? null, startupAdapter);
  return (
    <StartupContext.Provider value={startup}>
      <p role="status" aria-atomic="true" style={visuallyHidden}>
        {startupAdapter.status === "configured" && !loading && user ? PHASE_TEXT[startup.progress.phase] : ""}
      </p>
      {children}
    </StartupContext.Provider>
  );
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
      <button type="button" aria-disabled={!canStop} aria-describedby={stopHintId} onClick={() => {
        if (canStop) startup.stop?.();
      }}>
        Stop scheduling
      </button>
      <p id={stopHintId}>Stops new startup work. Already-running work can still finish.</p>
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
    </section>
  );
}
