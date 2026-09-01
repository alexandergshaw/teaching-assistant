"use client";

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import { getArtifactDownloadUrlAction, getRunLogsDownloadUrlAction } from "../../actions";
import type { useActionsTab } from "./useActionsTab";
import styles from "../../page.module.css";

// Badge tone for a workflow run / job / step conclusion (or live status).
function conclusionBadge(conclusion: string | null, status: string): { label: string; cls: string } {
  const label = conclusion ?? status.replace(/_/g, " ");
  if (conclusion === "success") return { label, cls: styles.ghBadgeSuccess };
  if (conclusion === "failure" || conclusion === "cancelled" || conclusion === "startup_failure" || conclusion === "timed_out")
    return { label, cls: styles.ghBadgeDanger };
  if (!conclusion && (status === "in_progress" || status === "queued" || status === "waiting"))
    return { label, cls: styles.ghBadgeWarning };
  return { label, cls: styles.ghBadgeNeutral };
}

type ActionsTabState = ReturnType<typeof useActionsTab>;

export function ActionsTab({ repoRef, branch, actions }: { repoRef: string; branch: string; actions: ActionsTabState }) {
  const {
    workflows,
    runs,
    actionsState,
    actionsError,
    actionsMsg,
    dispatchingId,
    runBusyId,
    expandedRun,
    jobsByRun,
    jobsLoadingRun,
    filterWorkflowId,
    setFilterWorkflowId,
    filterStatus,
    setFilterStatus,
    artifactsByRun,
    artifactsLoadingRun,
    expandedArtifactsRun,
    pendingByRun,
    dispatchWorkflowId,
    setDispatchWorkflowId,
    dispatchInputs,
    setDispatchInputs,
    dispatchBusy,
    showRunWithInputs,
    setShowRunWithInputs,
    reloadRuns,
    handleDispatchWithInputs,
    handleRerunFailed,
    toggleArtifacts,
    openDownload,
    handleToggleWorkflow,
    loadPending,
    handleReview,
    handleDispatch,
    handleRerun,
    handleCancel,
    toggleJobs,
  } = actions;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", marginTop: "var(--space-3)" }}>
      <div className={styles.ghPanel}>
        <label className={styles.panelTitle} style={{ display: "block", marginBottom: "var(--space-3)" }}>Workflows</label>
        {actionsState === "loading" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--space-2)", padding: "var(--space-4)" }} role="status" aria-live="polite">
            <CircularProgress size={24} />
            <span style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>Loading workflows…</span>
          </div>
        )}
        {actionsState === "error" && <p className={styles.error}>{actionsError}</p>}
        {actionsState === "idle" && workflows.length === 0 && <p className={styles.fieldHint}>No workflows found.</p>}
        {actionsState === "idle" &&
          workflows.map((w) => (
            <div key={w.id} className={styles.ghRow}>
              <div className={styles.ghRowTop}>
                <div className={styles.ghRowTitle}>
                  <span className={styles.ghRowName}>{w.name}</span>
                  <span className={`${styles.ghBadge} ${w.state === "active" ? styles.ghBadgeSuccess : styles.ghBadgeNeutral}`} style={{ marginLeft: "var(--space-2)" }}>
                    {w.state.replace(/_/g, " ")}
                  </span>
                  <div className={`${styles.ghMeta} ${styles.ghMetaMono}`} style={{ marginTop: "var(--space-1)" }}>{w.path}</div>
                </div>
                <div className={styles.ghActions}>
                  <Button variant="text" size="small" onClick={() => handleToggleWorkflow(w, w.state !== "active")}>
                    {w.state === "active" ? "Disable" : "Enable"}
                  </Button>
                  <Button variant="outlined" size="small" disabled={dispatchingId === w.id || w.state !== "active"} onClick={() => handleDispatch(w)}>
                    {dispatchingId === w.id ? "Running…" : `Run on ${branch}`}
                  </Button>
                </div>
              </div>
            </div>
          ))}

        <div style={{ marginTop: "var(--space-2)" }}>
          <Button variant="text" size="small" onClick={() => setShowRunWithInputs((v) => !v)}>
            {showRunWithInputs ? "Hide run with inputs" : "Run a workflow with inputs"}
          </Button>
        </div>
        {showRunWithInputs && (
          <div className={`${styles.ghPanel} ${styles.ghPanelStack}`} style={{ marginTop: "var(--space-2)" }}>
            <TextField select size="small" label="Workflow" value={dispatchWorkflowId} onChange={(e) => setDispatchWorkflowId(e.target.value)} sx={{ maxWidth: 320 }} slotProps={{ inputLabel: { shrink: true } }}>
              {workflows.map((w) => (
                <MenuItem key={w.id} value={String(w.id)}>{w.name}</MenuItem>
              ))}
            </TextField>
            {dispatchInputs.map((inp, i) => (
              <div key={i} style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                <TextField size="small" placeholder="input name" value={inp.key} onChange={(e) => setDispatchInputs((rows) => rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))} />
                <TextField size="small" placeholder="value" value={inp.value} onChange={(e) => setDispatchInputs((rows) => rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))} />
                <Button variant="text" size="small" color="error" onClick={() => setDispatchInputs((rows) => rows.filter((_, j) => j !== i))}>Remove</Button>
              </div>
            ))}
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <Button variant="text" size="small" onClick={() => setDispatchInputs((rows) => [...rows, { key: "", value: "" }])}>Add input</Button>
              <Button variant="contained" size="small" disabled={dispatchBusy || !dispatchWorkflowId} onClick={handleDispatchWithInputs}>
                {dispatchBusy ? "Running…" : `Run on ${branch}`}
              </Button>
            </div>
          </div>
        )}
        {actionsMsg && (
          <p style={{ marginTop: "var(--space-3)", fontSize: "var(--font-size-md)", color: actionsMsg.startsWith("Error:") ? "var(--danger)" : "var(--text-secondary)" }}>{actionsMsg}</p>
        )}
      </div>

      <div className={styles.ghPanel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <label className={styles.panelTitle}>Runs</label>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            <TextField select size="small" label="Workflow" value={filterWorkflowId} onChange={(e) => setFilterWorkflowId(e.target.value)} sx={{ minWidth: 150 }} slotProps={{ inputLabel: { shrink: true } }}>
              <MenuItem value="">All workflows</MenuItem>
              {workflows.map((w) => (
                <MenuItem key={w.id} value={String(w.id)}>{w.name}</MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} sx={{ minWidth: 130 }} slotProps={{ inputLabel: { shrink: true } }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="queued">Queued</MenuItem>
              <MenuItem value="in_progress">In progress</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
              <MenuItem value="success">Success</MenuItem>
              <MenuItem value="failure">Failure</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
              <MenuItem value="waiting">Waiting</MenuItem>
            </TextField>
            <Button variant="text" size="small" onClick={reloadRuns}>Refresh</Button>
          </div>
        </div>
        {actionsState === "loading" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--space-2)", padding: "var(--space-4)" }} role="status" aria-live="polite">
            <CircularProgress size={24} />
            <span style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>Loading runs…</span>
          </div>
        )}
        {runs.length === 0 && actionsState === "idle" && <p className={styles.fieldHint}>No runs match.</p>}
        {runs.map((run) => {
          const dur =
            run.runStartedAt && run.updatedAt
              ? Math.max(0, Math.round((new Date(run.updatedAt).getTime() - new Date(run.runStartedAt).getTime()) / 1000))
              : null;
          const durLabel = dur == null ? "" : dur >= 60 ? `${Math.floor(dur / 60)}m ${dur % 60}s` : `${dur}s`;
          const pending = pendingByRun[run.id];
          const runBadge = conclusionBadge(run.conclusion, run.status);
          return (
            <div key={run.id} className={styles.ghRow}>
              <div className={styles.ghRowTop}>
                <div className={styles.ghRowTitle}>
                  <span className={styles.ghRowName}>
                    {run.displayTitle || run.name} <span className={styles.ghMeta}>#{run.runNumber}</span>
                  </span>
                  <span className={`${styles.ghBadge} ${runBadge.cls}`} style={{ marginLeft: "var(--space-2)" }}>{runBadge.label}</span>
                  <div className={styles.ghMetaRow} style={{ marginTop: "var(--space-1)" }}>
                    <span className={styles.ghMetaMono}>{run.headBranch}</span>
                    {run.event && <span>{run.event}</span>}
                    {run.actor && <span>{run.actor}</span>}
                    {durLabel && <span>{durLabel}</span>}
                    <span>{new Date(run.createdAt).toLocaleString()}</span>
                    <a href={run.htmlUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)", textDecoration: "none" }}>open</a>
                  </div>
                </div>
                <div className={styles.ghActions}>
                  <Button variant="text" size="small" onClick={() => toggleJobs(run.id)}>{expandedRun === run.id ? "Hide jobs" : "Jobs"}</Button>
                  <Button variant="text" size="small" onClick={() => toggleArtifacts(run.id)}>{expandedArtifactsRun === run.id ? "Hide artifacts" : "Artifacts"}</Button>
                  <Button variant="text" size="small" onClick={() => openDownload(getRunLogsDownloadUrlAction(repoRef, run.id))}>Logs</Button>
                  {run.status !== "completed" ? (
                    <>
                      <Button variant="text" size="small" onClick={() => loadPending(run.id)}>Approvals</Button>
                      <Button variant="outlined" size="small" color="error" disabled={runBusyId === run.id} onClick={() => handleCancel(run.id)}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outlined" size="small" disabled={runBusyId === run.id} onClick={() => handleRerun(run.id)}>Re-run</Button>
                      <Button variant="outlined" size="small" disabled={runBusyId === run.id} onClick={() => handleRerunFailed(run.id)}>Re-run failed</Button>
                    </>
                  )}
                </div>
              </div>

              {pending && pending.length > 0 && (
                <div className={styles.ghSubList}>
                  <span className={styles.ghMeta}>Waiting on: {pending.map((d) => d.environmentName).join(", ")}</span>
                  <div style={{ display: "flex", gap: "var(--space-2)" }}>
                    <Button variant="contained" size="small" disabled={runBusyId === run.id} onClick={() => handleReview(run.id, pending.map((d) => d.environmentId), "approved")}>Approve</Button>
                    <Button variant="outlined" size="small" color="error" disabled={runBusyId === run.id} onClick={() => handleReview(run.id, pending.map((d) => d.environmentId), "rejected")}>Reject</Button>
                  </div>
                </div>
              )}

              {expandedRun === run.id && (
                <div className={styles.ghSubList}>
                  {jobsLoadingRun === run.id && (
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-2)" }} role="status" aria-live="polite">
                      <CircularProgress size={20} />
                      <span style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>Loading jobs…</span>
                    </div>
                  )}
                  {jobsByRun[run.id] &&
                    jobsByRun[run.id].map((job) => {
                      const jobBadge = conclusionBadge(job.conclusion, job.status);
                      return (
                        <div key={job.id} style={{ fontSize: "var(--font-size-md)" }}>
                          <div className={styles.ghBadges}>
                            <span className={styles.ghRowName} style={{ fontSize: "var(--font-size-md)" }}>{job.name}</span>
                            <span className={`${styles.ghBadge} ${jobBadge.cls}`}>{jobBadge.label}</span>
                            {job.htmlUrl && <a href={job.htmlUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)", fontSize: "var(--font-size-xs)" }}>view</a>}
                          </div>
                          {job.steps.length > 0 && (
                            <div className={styles.ghSubList} style={{ gap: "var(--space-1)" }}>
                              {job.steps.map((s) => {
                                const stepBadge = conclusionBadge(s.conclusion, s.status);
                                return (
                                  <div key={s.number} className={styles.ghMetaRow}>
                                    <span>{s.name}</span>
                                    <span className={`${styles.ghBadge} ${stepBadge.cls}`}>{stepBadge.label}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              {expandedArtifactsRun === run.id && (
                <div className={styles.ghSubList}>
                  {artifactsLoadingRun === run.id && (
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-2)" }} role="status" aria-live="polite">
                      <CircularProgress size={20} />
                      <span style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>Loading artifacts…</span>
                    </div>
                  )}
                  {artifactsByRun[run.id] && artifactsByRun[run.id].length === 0 && <p className={styles.fieldHint}>No artifacts.</p>}
                  {artifactsByRun[run.id] &&
                    artifactsByRun[run.id].map((a) => (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--font-size-md)" }}>
                        <span style={{ flex: 1, minWidth: 0 }} className={styles.ghRowName}>{a.name}</span>
                        <span className={styles.ghMeta}>{Math.round(a.sizeInBytes / 1024)} KB</span>
                        {a.expired ? (
                          <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>expired</span>
                        ) : (
                          <Button variant="text" size="small" onClick={() => openDownload(getArtifactDownloadUrlAction(repoRef, a.id))}>Download</Button>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
