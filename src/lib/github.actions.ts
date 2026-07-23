// GitHub Actions: workflows, runs, jobs, artifacts, and pending deployments.

import { ghFetch, ghJson, ghError, githubToken } from "./github.repos";

const API = "https://api.github.com";

export interface WorkflowRunInfo {
  id: number;
  name: string;
  /** queued | in_progress | completed | … */
  status: string;
  /** success | failure | cancelled | … (null until completed). */
  conclusion: string | null;
  headBranch: string;
  htmlUrl: string;
  createdAt: string;
  event: string;
  actor: string;
  runNumber: number;
  runAttempt: number;
  runStartedAt: string | null;
  updatedAt: string | null;
  headSha: string;
  displayTitle: string;
}

interface RawRun {
  id?: number;
  name?: string;
  status?: string;
  conclusion?: string | null;
  head_branch?: string;
  html_url?: string;
  created_at?: string;
  event?: string;
  actor?: { login?: string };
  run_number?: number;
  run_attempt?: number;
  run_started_at?: string | null;
  updated_at?: string | null;
  head_sha?: string;
  display_title?: string;
}

function mapRun(r: RawRun): WorkflowRunInfo {
  return {
    id: r.id ?? 0,
    name: r.name ?? "workflow",
    status: r.status ?? "unknown",
    conclusion: r.conclusion ?? null,
    headBranch: r.head_branch ?? "",
    htmlUrl: r.html_url ?? "",
    createdAt: r.created_at ?? "",
    event: r.event ?? "",
    actor: r.actor?.login ?? "",
    runNumber: r.run_number ?? 0,
    runAttempt: r.run_attempt ?? 1,
    runStartedAt: r.run_started_at ?? null,
    updatedAt: r.updated_at ?? null,
    headSha: r.head_sha ?? "",
    displayTitle: r.display_title ?? r.name ?? "",
  };
}

/** The most recent GitHub Actions run for a repo (optionally on one branch). */
export async function getLatestWorkflowRun(owner: string, repo: string, branch?: string): Promise<WorkflowRunInfo | null> {
  const data = await ghJson<{ workflow_runs?: RawRun[] }>(
    `/repos/${owner}/${repo}/actions/runs?per_page=1${branch ? `&branch=${encodeURIComponent(branch)}` : ""}`
  );
  const run = data.workflow_runs?.[0];
  return run ? mapRun(run) : null;
}

export interface WorkflowInfo {
  id: number;
  name: string;
  /** The workflow file path, e.g. ".github/workflows/tests.yml". */
  path: string;
  state: string;
}

/** List a repo's Actions workflows (for choosing which one to run). */
export async function listWorkflows(owner: string, repo: string): Promise<WorkflowInfo[]> {
  const data = await ghJson<{ workflows?: Array<{ id?: number; name?: string; path?: string; state?: string }> }>(
    `/repos/${owner}/${repo}/actions/workflows?per_page=100`
  );
  return (data.workflows ?? [])
    .filter((w): w is { id: number; name?: string; path?: string; state?: string } => typeof w.id === "number")
    .map((w) => ({ id: w.id, name: w.name ?? "", path: w.path ?? "", state: w.state ?? "" }));
}

/**
 * Trigger a workflow_dispatch run. `workflowRef` is the workflow file name (e.g.
 * "tests.yml") or its numeric id; the workflow must declare `on: workflow_dispatch`.
 * Returns 204 with no body, so the caller correlates the resulting run via
 * {@link findWorkflowRunSince}.
 */
export async function dispatchWorkflow(
  owner: string,
  repo: string,
  workflowRef: string,
  ref: string,
  inputs?: Record<string, string>
): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowRef)}/dispatches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs && Object.keys(inputs).length > 0 ? { ref, inputs } : { ref }),
  });
}

/** Find the newest workflow_dispatch run on `ref` created at or after `sinceIso`. */
export async function findWorkflowRunSince(
  owner: string,
  repo: string,
  ref: string,
  sinceIso: string
): Promise<WorkflowRunInfo | null> {
  const data = await ghJson<{ workflow_runs?: RawRun[] }>(
    `/repos/${owner}/${repo}/actions/runs?branch=${encodeURIComponent(ref)}&event=workflow_dispatch&per_page=10`
  );
  const since = Date.parse(sinceIso) - 15_000; // small buffer for clock skew
  const run = (data.workflow_runs ?? []).find((r) => r.created_at && Date.parse(r.created_at) >= since);
  return run ? mapRun(run) : null;
}

export async function listWorkflowRuns(
  owner: string,
  repo: string,
  opts: { branch?: string; perPage?: number; status?: string; workflowId?: number } = {}
): Promise<WorkflowRunInfo[]> {
  const params = new URLSearchParams({ per_page: String(opts.perPage ?? 30) });
  if (opts.branch) params.set("branch", opts.branch);
  if (opts.status) params.set("status", opts.status);
  const base = opts.workflowId
    ? `/repos/${owner}/${repo}/actions/workflows/${opts.workflowId}/runs`
    : `/repos/${owner}/${repo}/actions/runs`;
  const data = await ghJson<{ workflow_runs?: RawRun[] }>(`${base}?${params.toString()}`);
  return (data.workflow_runs ?? []).map(mapRun);
}

export interface WorkflowStepInfo {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
}

export interface WorkflowJobInfo {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  startedAt: string | null;
  completedAt: string | null;
  steps: WorkflowStepInfo[];
}

export async function listRunJobs(owner: string, repo: string, runId: number): Promise<WorkflowJobInfo[]> {
  const data = await ghJson<{
    jobs?: Array<{
      id?: number;
      name?: string;
      status?: string;
      conclusion?: string | null;
      html_url?: string;
      started_at?: string | null;
      completed_at?: string | null;
      steps?: Array<{ name?: string; status?: string; conclusion?: string | null; number?: number }>;
    }>;
  }>(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);
  return (data.jobs ?? [])
    .filter((j) => typeof j.id === "number")
    .map((j) => ({
      id: j.id as number,
      name: j.name ?? "",
      status: j.status ?? "",
      conclusion: j.conclusion ?? null,
      htmlUrl: j.html_url ?? "",
      startedAt: j.started_at ?? null,
      completedAt: j.completed_at ?? null,
      steps: (j.steps ?? []).map((s) => ({ name: s.name ?? "", status: s.status ?? "", conclusion: s.conclusion ?? null, number: s.number ?? 0 })),
    }));
}

export async function rerunWorkflowRun(owner: string, repo: string, runId: number): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun`, { method: "POST" });
}

export async function cancelWorkflowRun(owner: string, repo: string, runId: number): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/cancel`, { method: "POST" });
}

/** Download an artifact's zip bytes (the API 302-redirects to signed storage). */
export async function downloadArtifactZip(owner: string, repo: string, artifactId: number): Promise<Buffer> {
  const res = await ghFetch(`/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`);
  return Buffer.from(await res.arrayBuffer());
}

export async function rerunFailedJobs(owner: string, repo: string, runId: number): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun-failed-jobs`, { method: "POST" });
}

export async function setWorkflowEnabled(owner: string, repo: string, workflowId: number, enabled: boolean): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/${enabled ? "enable" : "disable"}`, { method: "PUT" });
}

export interface ArtifactInfo {
  id: number;
  name: string;
  sizeInBytes: number;
  expired: boolean;
  expiresAt: string | null;
  createdAt: string | null;
}

/** List a run's build artifacts. */
export async function listRunArtifacts(owner: string, repo: string, runId: number): Promise<ArtifactInfo[]> {
  const data = await ghJson<{
    artifacts?: Array<{ id?: number; name?: string; size_in_bytes?: number; expired?: boolean; expires_at?: string | null; created_at?: string | null }>;
  }>(`/repos/${owner}/${repo}/actions/runs/${runId}/artifacts?per_page=100`);
  return (data.artifacts ?? [])
    .filter((a) => typeof a.id === "number")
    .map((a) => ({
      id: a.id as number,
      name: a.name ?? "artifact",
      sizeInBytes: a.size_in_bytes ?? 0,
      expired: !!a.expired,
      expiresAt: a.expires_at ?? null,
      createdAt: a.created_at ?? null,
    }));
}

// GitHub returns a 302 to a short-lived signed URL for artifact / log zip downloads.
// Read the Location without following it (undici exposes it on a manual redirect).
async function ghRedirectLocation(path: string): Promise<string> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${githubToken()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "manual",
  });
  const loc = res.headers.get("location");
  if (loc) return loc;
  throw new Error(ghError(res.status, await res.text().catch(() => "")));
}

/** Resolve a short-lived download URL for one artifact's zip. */
export async function getArtifactDownloadUrl(owner: string, repo: string, artifactId: number): Promise<string> {
  return ghRedirectLocation(`/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`);
}

/** Resolve a short-lived download URL for a run's full log zip. */
export async function getRunLogsDownloadUrl(owner: string, repo: string, runId: number): Promise<string> {
  return ghRedirectLocation(`/repos/${owner}/${repo}/actions/runs/${runId}/logs`);
}

export interface PendingDeployment {
  environmentId: number;
  environmentName: string;
  currentUserCanApprove: boolean;
}

/** List a run's pending deployment approvals (protected environments). */
export async function listPendingDeployments(owner: string, repo: string, runId: number): Promise<PendingDeployment[]> {
  const data = await ghJson<Array<{ environment?: { id?: number; name?: string }; current_user_can_approve?: boolean }>>(
    `/repos/${owner}/${repo}/actions/runs/${runId}/pending_deployments`
  );
  return (data ?? [])
    .filter((d) => typeof d.environment?.id === "number")
    .map((d) => ({
      environmentId: d.environment!.id as number,
      environmentName: d.environment?.name ?? "",
      currentUserCanApprove: !!d.current_user_can_approve,
    }));
}

/** Approve or reject pending deployments for the given environment ids. */
export async function reviewPendingDeployments(
  owner: string,
  repo: string,
  runId: number,
  environmentIds: number[],
  state: "approved" | "rejected",
  comment: string
): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/pending_deployments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ environment_ids: environmentIds, state, comment }),
  });
}
