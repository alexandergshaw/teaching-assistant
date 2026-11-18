import type { GradeRunItemRequestBody } from "@/app/components/grading/incrementalRunPlan";
import type { SupabaseAuthObserver } from "@/context/supabase-auth-observer";
import { createSingleZipBrowserAuthority } from "@/lib/grade/single-zip-browser-authority";
import { discoverNotebookJob, listNotebookJobs, matchNotebookJob, pollNotebookJob, startNotebookJob } from "./notebookJobClient";

/** Resolve and run a single submitted notebook before consuming a grading slot. */
export async function prepareNotebookGrade(request: GradeRunItemRequestBody, observer: SupabaseAuthObserver, current: () => boolean): Promise<GradeRunItemRequestBody> {
  const { notebookAttempt: _priorAttempt, ...withoutAttempt } = request;
  const cleanRequest = request.notebookAttempt === undefined ? request : withoutAttempt;
  const url = cleanRequest.entry.submissionUrl;
  if (!url || !/^https:\/\/github\.com\//i.test(url)) return cleanRequest;
  const response = await fetch("/api/notebook-execution", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("Notebook execution status is unavailable. Review the submission before grading.");
  const feature = await response.json() as { enabled?: unknown };
  if (typeof feature.enabled !== "boolean") throw new Error("Notebook execution status is unavailable. Review the submission before grading.");
  const enabled = feature.enabled;
  if (!enabled || !current()) return cleanRequest;
  const authority = createSingleZipBrowserAuthority(observer);
  try {
    const lease = await authority.admit();
    if (!lease || !current()) throw new Error("Notebook execution could not be verified. Review the submission before grading.");
    const session = authority.identity(lease);
    if (!session || (request.expectedOwnerSession && (request.expectedOwnerSession.accountId !== session.accountId || request.expectedOwnerSession.sessionId !== session.sessionId))) throw new Error("Notebook execution could not be verified. Review the submission before grading.");
    const bound = { ...cleanRequest, expectedOwnerSession: session };
    const source = await discoverNotebookJob(session, url, lease.signal);
    if (!current() || lease.signal.aborted || source === "unavailable") throw new Error("Notebook execution could not be verified. Review the submission before grading.");
    if (source === "none") return cleanRequest;
    const jobs = await listNotebookJobs(session, lease.signal);
    const existing = await matchNotebookJob(bound, url, jobs);
    if (!current() || lease.signal.aborted) throw new Error("Notebook execution could not be verified. Review the submission before grading.");
    let attempt = existing?.attempt_id ?? crypto.randomUUID();
    let status = existing?.status;
    if (!status) { const started = await startNotebookJob(bound, source, attempt, lease.signal); attempt = started.attempt; status = started.status; }
    const deadline = Date.now() + 10 * 60_000;
    let restarted = false;
    while (Date.now() < deadline && current() && !lease.signal.aborted) {
      // Only a terminal status explicitly certified by the server can release
      // an uncertain dispatch. Local time and generic expiry are not evidence.
      if (status === "retryable" && !restarted) {
        restarted = true;
        attempt = crypto.randomUUID();
        const started = await startNotebookJob(bound, source, attempt, lease.signal);
        attempt = started.attempt; status = started.status;
        continue;
      }
      if (status !== "reserved" && status !== "dispatching" && status !== "running" && status !== "unknown" && status !== "recovering" && status !== "cancelling") break;
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new Error("Session changed")); };
        const timer = setTimeout(() => { lease.signal.removeEventListener("abort", abort); resolve(); }, 3000);
        lease.signal.addEventListener("abort", abort, { once: true });
      });
      if (!current() || lease.signal.aborted) throw new Error("Notebook execution could not be verified. Review the submission before grading.");
      status = await pollNotebookJob(session, attempt, lease.signal);
    }
    if (status === "unknown" || status === "reserved" || status === "dispatching" || status === "running" || status === "recovering" || status === "cancelling") throw new Error("Notebook execution is still unconfirmed. Retry this row to check its status; no score was assigned.");
    if (status !== "succeeded" || !current() || lease.signal.aborted) throw new Error("Notebook execution could not be verified. Review the submission before grading.");
    return { ...bound, notebookAttempt: attempt };
  } catch (error) {
    if (error instanceof Error && error.message === "Notebook execution is still unconfirmed. Retry this row to check its status; no score was assigned.") throw error;
    throw new Error("Notebook execution could not be verified. Review the submission before grading.");
  }
  finally { authority.close(); }
}
