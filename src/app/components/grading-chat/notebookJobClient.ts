import { serializeGradeItemWithOfficeSource } from "@/app/components/grading/officeSourceWire";
import type { GradeRunItemRequestBody } from "@/app/components/grading/incrementalRunPlan";
import { notebookGradeBinding } from "@/lib/grade/notebook-grade-binding";

/** A server-resolved, immutable repository snapshot; never infer a commit from a branch. */
export interface NotebookJobSource {
  owner: string;
  repo: string;
  commit: string;
  path: string;
  sourceUrl: string;
}

export type NotebookJobStatus = "reserved" | "dispatching" | "running" | "unknown" | "recovering" | "cancelling" | "retryable" | "failed" | "expired" | "cancelled" | "succeeded";
const statuses = new Set<NotebookJobStatus>(["reserved", "dispatching", "running", "unknown", "recovering", "cancelling", "retryable", "failed", "expired", "cancelled", "succeeded"]);

export interface RecoverableNotebookJob {
  attempt_id: string;
  grade_binding_sha256: string;
  source_url: string;
  notebook_path: string;
  commit_sha: string;
  status: NotebookJobStatus;
  expires_at: string;
}

async function readJobResponse(body: object, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch("/api/notebook-execution", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal,
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok || !value || typeof value !== "object" || Array.isArray(value)) throw new Error("Notebook execution status is unavailable. Review the submission before grading.");
  return value as Record<string, unknown>;
}

async function requestJob(body: object, signal?: AbortSignal): Promise<NotebookJobStatus> {
  const value = await readJobResponse(body, signal);
  const status = value.status;
  if (typeof status !== "string" || !statuses.has(status as NotebookJobStatus)) throw new Error("Notebook execution status is unavailable. Review the submission before grading.");
  // Deliberately discard observations: only the server may attach execution evidence.
  return status as NotebookJobStatus;
}

export async function discoverNotebookJob(session: NonNullable<GradeRunItemRequestBody["expectedOwnerSession"]>, sourceUrl: string, signal?: AbortSignal): Promise<NotebookJobSource | "none" | "unavailable"> {
  const value = await readJobResponse({ operation: "discover", session, sourceUrl }, signal);
  const n = value.notebook as Record<string, unknown> | undefined;
  if (n?.kind === "none" || n?.kind === "unavailable") return n.kind;
  if (n?.kind !== "notebook") throw new Error("Notebook source could not be verified.");
  if (!n || typeof n.owner !== "string" || typeof n.repo !== "string" || typeof n.path !== "string" || typeof n.commit !== "string" || !/^[0-9a-f]{40}$/i.test(n.commit)) throw new Error("Notebook source could not be verified.");
  return { owner: n.owner, repo: n.repo, path: n.path, commit: n.commit, sourceUrl };
}

/** Listing is discovery only. The caller must match an exact saved wire hash,
 * owner session and attempt before adopting a result into a grading row. */
export async function listNotebookJobs(session: NonNullable<GradeRunItemRequestBody["expectedOwnerSession"]>, signal?: AbortSignal): Promise<RecoverableNotebookJob[]> {
  const value = await readJobResponse({ operation: "list", session }, signal);
  if (!Array.isArray(value.attempts) || value.attempts.length > 200) throw new Error("Notebook execution status is unavailable. Review the submission before grading.");
  return value.attempts.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Notebook execution status is unavailable. Review the submission before grading.");
    const row = item as Record<string, unknown>;
    if (typeof row.attempt_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.attempt_id) || typeof row.grade_binding_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(row.grade_binding_sha256) || typeof row.source_url !== "string" || typeof row.notebook_path !== "string" || typeof row.commit_sha !== "string" || !/^[0-9a-f]{40}$/i.test(row.commit_sha) || typeof row.status !== "string" || !statuses.has(row.status as NotebookJobStatus) || typeof row.expires_at !== "string") throw new Error("Notebook execution status is unavailable. Review the submission before grading.");
    return row as unknown as RecoverableNotebookJob;
  });
}

/** Never attach a recovered attempt to a row unless its exact serialized
 * grading setup and original submission URL match exactly and uniquely. */
export async function matchNotebookJob(request: GradeRunItemRequestBody, sourceUrl: string, jobs: readonly RecoverableNotebookJob[]): Promise<RecoverableNotebookJob | null> {
  if (!request.expectedOwnerSession || !sourceUrl) return null;
  const wire = JSON.parse(serializeGradeItemWithOfficeSource(request)) as unknown;
  const binding = await notebookGradeBinding(wire);
  const matches = jobs.filter(job => job.source_url === sourceUrl && job.grade_binding_sha256 === binding && (["reserved", "dispatching", "running", "unknown", "recovering", "cancelling", "succeeded"] as NotebookJobStatus[]).includes(job.status));
  if (matches.length > 1) throw new Error("Multiple notebook attempts match this request; review before retrying.");
  if (matches.length === 1) return matches[0];
  // Retired attempts have already been confirmed stopped; an active attempt
  // always takes precedence, and any retired receipt can request a restart.
  return jobs.find(job => job.source_url === sourceUrl && job.grade_binding_sha256 === binding && job.status === "retryable") ?? null;
}

export async function startNotebookJob(request: GradeRunItemRequestBody, source: NotebookJobSource, attempt: string, signal?: AbortSignal): Promise<{ status: NotebookJobStatus; attempt: string }> {
  if (!request.expectedOwnerSession || !/^[0-9a-f]{40}$/i.test(source.commit)) throw new Error("A verified owner session and repository revision are required.");
  const { notebookAttempt: _priorAttempt, ...requestWithoutAttempt } = request;
  const wire = JSON.parse(serializeGradeItemWithOfficeSource(requestWithoutAttempt)) as unknown;
  const result = await readJobResponse({ operation: "start", session: request.expectedOwnerSession, attempt, ...source, gradeRequest: wire }, signal);
  if (typeof result.status !== "string" || !statuses.has(result.status as NotebookJobStatus) || typeof result.attempt !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.attempt)) throw new Error("Notebook execution status is unavailable. Review the submission before grading.");
  return { status: result.status as NotebookJobStatus, attempt: result.attempt };
}

/** Recover only the server-owned request, and verify its wire binding before use. */
export async function restoreNotebookRequest(session: NonNullable<GradeRunItemRequestBody["expectedOwnerSession"]>, job: RecoverableNotebookJob, signal?: AbortSignal): Promise<GradeRunItemRequestBody | null> {
  const value = await readJobResponse({ operation: "restore", session, attempt: job.attempt_id }, signal);
  if (value.gradeRequest === null) return null;
  const request = value.gradeRequest as GradeRunItemRequestBody;
  if (!request || typeof request !== "object" || request.expectedOwnerSession?.accountId !== session.accountId || request.expectedOwnerSession?.sessionId !== session.sessionId || request.entry?.submissionUrl !== job.source_url || await notebookGradeBinding(request) !== job.grade_binding_sha256) throw new Error("Notebook execution request could not be verified.");
  return request;
}

export function pollNotebookJob(session: NonNullable<GradeRunItemRequestBody["expectedOwnerSession"]>, attempt: string, signal?: AbortSignal): Promise<NotebookJobStatus> {
  return requestJob({ operation: "poll", session, attempt }, signal);
}

export function cancelNotebookJob(session: NonNullable<GradeRunItemRequestBody["expectedOwnerSession"]>, attempt: string, signal?: AbortSignal): Promise<NotebookJobStatus> {
  return requestJob({ operation: "cancel", session, attempt }, signal);
}

/** A failed attempt must be confirmed stopped before its saved request can restart. */
export async function confirmNotebookRecovery(session: NonNullable<GradeRunItemRequestBody["expectedOwnerSession"]>, job: RecoverableNotebookJob, signal?: AbortSignal): Promise<boolean> {
  return job.status !== "failed" || await cancelNotebookJob(session, job.attempt_id, signal) === "cancelled";
}
