"use client";

import { useEffect, useState } from "react";
import {
  listWorkflowsAction,
  dispatchWorkflowAction,
  listWorkflowRunsAction,
  listRunJobsAction,
  rerunWorkflowRunAction,
  cancelWorkflowRunAction,
  rerunFailedJobsAction,
  setWorkflowEnabledAction,
  listRunArtifactsAction,
  listPendingDeploymentsAction,
  reviewPendingDeploymentsAction,
} from "../../actions";
import type { WorkflowInfo, WorkflowRunInfo, WorkflowJobInfo, ArtifactInfo, PendingDeployment } from "@/lib/github";

// Owns the Actions tab: workflow listing/dispatch/enable-toggle, and run
// listing with jobs, artifacts, logs, cancel/rerun, and deployment approvals.
export function useActionsTab(
  repoRef: string,
  branch: string,
  tab: string,
  refreshVcCounts: (repoRef?: string) => void
) {
  // Actions tab state
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([]);
  const [runs, setRuns] = useState<WorkflowRunInfo[]>([]);
  const [actionsState, setActionsState] = useState<"idle" | "loading" | "error">("idle");
  const [actionsError, setActionsError] = useState<string | null>(null);
  const [actionsMsg, setActionsMsg] = useState<string | null>(null);
  const [dispatchingId, setDispatchingId] = useState<number | null>(null);
  const [runBusyId, setRunBusyId] = useState<number | null>(null);
  const [expandedRun, setExpandedRun] = useState<number | null>(null);
  const [jobsByRun, setJobsByRun] = useState<Record<number, WorkflowJobInfo[]>>({});
  const [jobsLoadingRun, setJobsLoadingRun] = useState<number | null>(null);
  const [filterWorkflowId, setFilterWorkflowId] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [artifactsByRun, setArtifactsByRun] = useState<Record<number, ArtifactInfo[]>>({});
  const [artifactsLoadingRun, setArtifactsLoadingRun] = useState<number | null>(null);
  const [expandedArtifactsRun, setExpandedArtifactsRun] = useState<number | null>(null);
  const [pendingByRun, setPendingByRun] = useState<Record<number, PendingDeployment[]>>({});
  const [dispatchWorkflowId, setDispatchWorkflowId] = useState<string>("");
  const [dispatchInputs, setDispatchInputs] = useState<Array<{ key: string; value: string }>>([]);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [showRunWithInputs, setShowRunWithInputs] = useState(false);

  // Load workflows and runs when the actions tab is active
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!repoRef || tab !== "actions") {
      if (!repoRef) {
        setWorkflows([]);
        setRuns([]);
      }
      return;
    }
    let cancelled = false;
    setActionsState("loading");
    setActionsError(null);
    (async () => {
      const [wf, rr] = await Promise.all([
        listWorkflowsAction(repoRef),
        listWorkflowRunsAction(repoRef, branch, {
          status: filterStatus || undefined,
          workflowId: filterWorkflowId ? Number(filterWorkflowId) : undefined,
        }),
      ]);
      if (cancelled) return;
      if ("error" in wf) {
        setActionsState("error");
        setActionsError(wf.error);
        return;
      }
      if ("error" in rr) {
        setActionsState("error");
        setActionsError(rr.error);
        return;
      }
      setWorkflows(wf.workflows);
      setRuns(rr.runs);
      setActionsState("idle");
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [repoRef, tab, branch, filterStatus, filterWorkflowId]);

  const reloadRuns = async () => {
    const r = await listWorkflowRunsAction(repoRef, branch, {
      status: filterStatus || undefined,
      workflowId: filterWorkflowId ? Number(filterWorkflowId) : undefined,
    });
    if (!("error" in r)) setRuns(r.runs);
  };

  const handleDispatchWithInputs = async () => {
    if (!dispatchWorkflowId) {
      setActionsMsg("Error: choose a workflow to run.");
      return;
    }
    const inputs: Record<string, string> = {};
    for (const { key, value } of dispatchInputs) {
      if (key.trim()) inputs[key.trim()] = value;
    }
    setDispatchBusy(true);
    setActionsMsg(null);
    const r = await dispatchWorkflowAction(repoRef, dispatchWorkflowId, branch, Object.keys(inputs).length ? inputs : undefined);
    setDispatchBusy(false);
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    setActionsMsg(`Dispatched on ${branch}. Give it a moment, then Refresh.`);
    setDispatchInputs([]);
  };

  const handleRerunFailed = async (id: number) => {
    setRunBusyId(id);
    setActionsMsg(null);
    const r = await rerunFailedJobsAction(repoRef, id);
    setRunBusyId(null);
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    await reloadRuns();
  };

  const toggleArtifacts = async (id: number) => {
    if (expandedArtifactsRun === id) {
      setExpandedArtifactsRun(null);
      return;
    }
    setExpandedArtifactsRun(id);
    if (!artifactsByRun[id]) {
      setArtifactsLoadingRun(id);
      const r = await listRunArtifactsAction(repoRef, id);
      setArtifactsLoadingRun(null);
      if (!("error" in r)) setArtifactsByRun((m) => ({ ...m, [id]: r.artifacts }));
    }
  };

  const openDownload = async (result: Promise<{ url: string } | { error: string }>) => {
    const r = await result;
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    if (typeof window !== "undefined") window.open(r.url, "_blank", "noopener");
  };

  const handleToggleWorkflow = async (w: WorkflowInfo, enabled: boolean) => {
    setActionsMsg(null);
    const r = await setWorkflowEnabledAction(repoRef, w.id, enabled);
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    const list = await listWorkflowsAction(repoRef);
    if (!("error" in list)) setWorkflows(list.workflows);
  };

  const loadPending = async (id: number) => {
    setActionsMsg(null);
    const r = await listPendingDeploymentsAction(repoRef, id);
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    setPendingByRun((m) => ({ ...m, [id]: r.deployments }));
  };

  const handleReview = async (id: number, envIds: number[], state: "approved" | "rejected") => {
    setRunBusyId(id);
    setActionsMsg(null);
    const r = await reviewPendingDeploymentsAction(repoRef, id, envIds, state, "");
    setRunBusyId(null);
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    setPendingByRun((m) => ({ ...m, [id]: [] }));
    await reloadRuns();
    refreshVcCounts();
  };

  const handleDispatch = async (w: WorkflowInfo) => {
    setDispatchingId(w.id);
    setActionsMsg(null);
    const r = await dispatchWorkflowAction(repoRef, String(w.id), branch);
    setDispatchingId(null);
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    setActionsMsg(`Dispatched ${w.name} on ${branch}. Give it a moment, then Refresh.`);
  };

  const handleRerun = async (id: number) => {
    setRunBusyId(id);
    setActionsMsg(null);
    const r = await rerunWorkflowRunAction(repoRef, id);
    setRunBusyId(null);
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    await reloadRuns();
  };

  const handleCancel = async (id: number) => {
    setRunBusyId(id);
    setActionsMsg(null);
    const r = await cancelWorkflowRunAction(repoRef, id);
    setRunBusyId(null);
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    await reloadRuns();
    refreshVcCounts();
  };

  const toggleJobs = async (id: number) => {
    if (expandedRun === id) {
      setExpandedRun(null);
      return;
    }
    setExpandedRun(id);
    if (!jobsByRun[id]) {
      setJobsLoadingRun(id);
      const r = await listRunJobsAction(repoRef, id);
      setJobsLoadingRun(null);
      if (!("error" in r)) setJobsByRun((m) => ({ ...m, [id]: r.jobs }));
    }
  };

  return {
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
  };
}
