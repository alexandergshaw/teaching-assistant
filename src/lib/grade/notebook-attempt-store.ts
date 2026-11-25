import "server-only";
import { createServiceClient } from "../supabase/server";
import { verifySingleZipOwnerSession } from "../supabase/single-zip-owner-session";
import type { ExpectedOwnerSession } from "./owner-session-binding";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validate(attempt: string, digest: string): void {
  if (!UUID.test(attempt) || !/^[0-9a-f]{64}$/.test(digest)) throw new Error("Invalid notebook attempt.");
}
async function authenticate(session: ExpectedOwnerSession): Promise<void> {
  if (!await verifySingleZipOwnerSession(session)) throw new Error("Notebook owner session is unavailable.");
}
async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await createServiceClient().rpc(name, args).retry(false);
  if (error) throw new Error("Notebook attempt storage is unavailable.");
  return data;
}
export async function reserveNotebookAttempt(session: ExpectedOwnerSession, attempt: string, digest: string, binding: string, sourceUrl: string, notebookPath: string, commit: string, expected: readonly number[], gradeRequest: unknown, name: string): Promise<unknown> {
  validate(attempt, digest); await authenticate(session);
  if (!/^[0-9a-f]{64}$/.test(binding) || !sourceUrl || sourceUrl.length > 2000) throw new Error("Invalid grading binding.");
  if (!expected.length || expected.length > 200 || expected.some((value, i) => !Number.isSafeInteger(value) || value < 0 || value >= 500 || (i > 0 && value <= expected[i - 1]))) throw new Error("Invalid notebook cell list.");
  if (!/^[0-9a-f]{40}$/.test(commit) || !/^nb-[a-f0-9]{40}$/.test(name)) throw new Error("Invalid repository commit or execution name.");
  return call("reserve_notebook_execution", { p_owner: session.accountId, p_session: session.sessionId, p_attempt: attempt, p_digest: digest, p_grade_binding: binding, p_source_url: sourceUrl, p_notebook_path: notebookPath, p_commit: commit, p_expected: expected, p_grade_request: gradeRequest, p_name: name });
}
export async function beginNotebookAttempt(session: ExpectedOwnerSession, attempt: string, digest: string): Promise<boolean> {
  validate(attempt, digest); await authenticate(session);
  return await call("begin_notebook_execution", { p_owner: session.accountId, p_session: session.sessionId, p_attempt: attempt, p_digest: digest }) === true;
}
export async function bindNotebookAttempt(session: ExpectedOwnerSession, attempt: string, digest: string, sandbox: string, name: string, command: string): Promise<boolean> {
  validate(attempt, digest);
  if (!/^sbx_[A-Za-z0-9]{1,128}$/.test(sandbox) || !/^[A-Za-z0-9_-]{1,128}$/.test(name) || !/^cmd_[A-Za-z0-9]{1,128}$/.test(command)) throw new Error("Invalid notebook execution handles.");
  await authenticate(session);
  return await call("bind_notebook_execution", { p_owner: session.accountId, p_session: session.sessionId, p_attempt: attempt, p_digest: digest, p_sandbox: sandbox, p_name: name, p_command: command }) === true;
}
/** Server-only: callers must never return execution handles to browsers. */
export async function loadNotebookAttempt(session: ExpectedOwnerSession, attempt: string): Promise<unknown> {
  if (!UUID.test(attempt)) throw new Error("Invalid notebook attempt.");
  await authenticate(session);
  const { data, error } = await createServiceClient().from("notebook_execution_attempts")
    .select("input_sha256,grade_binding_sha256,source_url,notebook_path,commit_sha,expected_cells,status,sandbox_id,sandbox_name,command_id,result,expires_at")
    .eq("owner_id", session.accountId).eq("session_id", session.sessionId).eq("attempt_id", attempt).maybeSingle();
  if (error) throw new Error("Notebook attempt storage is unavailable.");
  return data;
}
export async function settleNotebookAttempt(session: ExpectedOwnerSession, attempt: string, status: "succeeded" | "failed", result: unknown): Promise<boolean> {
  if (!UUID.test(attempt) || !["succeeded", "failed"].includes(status)) throw new Error("Invalid notebook attempt.");
  const serialized = JSON.stringify(result);
  if (!serialized || Buffer.byteLength(serialized) > 1_100_000) throw new Error("Invalid notebook result.");
  await authenticate(session);
  return await call("settle_notebook_execution", { p_owner: session.accountId, p_session: session.sessionId, p_attempt: attempt, p_status: status, p_result: result }) === true;
}
export async function cancelNotebookAttempt(session: ExpectedOwnerSession, attempt: string): Promise<unknown> {
  if (!UUID.test(attempt)) throw new Error("Invalid notebook attempt.");
  await authenticate(session);
  return call("cancel_notebook_execution", { p_owner: session.accountId, p_session: session.sessionId, p_attempt: attempt });
}
export async function recoverNotebookUnknown(session: ExpectedOwnerSession, attempt: string, sandbox: string): Promise<boolean> {
  if (!UUID.test(attempt) || !/^sbx_[A-Za-z0-9]{1,128}$/.test(sandbox)) throw new Error("Invalid notebook attempt.");
  await authenticate(session);
  return await call("recover_notebook_unknown", { p_owner: session.accountId, p_session: session.sessionId, p_attempt: attempt, p_sandbox: sandbox }) === true;
}
export async function confirmNotebookCancelled(session: ExpectedOwnerSession, attempt: string): Promise<boolean> {
  if (!UUID.test(attempt)) throw new Error("Invalid notebook attempt.");
  await authenticate(session);
  return await call("confirm_notebook_cancelled", { p_owner: session.accountId, p_session: session.sessionId, p_attempt: attempt }) === true;
}
export async function claimUnboundNotebookRecovery(session: ExpectedOwnerSession, attempt: string): Promise<boolean> {
  if (!UUID.test(attempt)) throw new Error("Invalid notebook attempt.");
  await authenticate(session);
  return await call("claim_unbound_notebook_recovery", { p_owner: session.accountId, p_session: session.sessionId, p_attempt: attempt }) === true;
}
export async function finishUnboundNotebookRecovery(session: ExpectedOwnerSession, attempt: string, name: string, sandbox: string): Promise<"retryable" | "cancelled" | null> {
  if (!UUID.test(attempt) || !/^nb-[a-f0-9]{40}$/.test(name) || !/^sbx_[A-Za-z0-9]{1,128}$/.test(sandbox)) throw new Error("Invalid notebook recovery.");
  await authenticate(session);
  const result = await call("finish_unbound_notebook_recovery", { p_owner: session.accountId, p_session: session.sessionId, p_attempt: attempt, p_name: name, p_sandbox: sandbox });
  return result === "retryable" || result === "cancelled" ? result : null;
}
/** Recovery metadata only; sandbox handles and student output stay server-side. */
export async function listNotebookAttempts(session: ExpectedOwnerSession): Promise<unknown> {
  await authenticate(session);
  const { data, error } = await createServiceClient().from("notebook_execution_attempts")
    .select("attempt_id,grade_binding_sha256,source_url,notebook_path,commit_sha,status,expires_at")
    .eq("owner_id", session.accountId).eq("session_id", session.sessionId)
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("Notebook attempt storage is unavailable.");
  return data;
}
/** Session-scoped request snapshot; never exposes sandbox handles or results. */
export async function restoreNotebookGradeRequest(session: ExpectedOwnerSession, attempt: string): Promise<unknown> {
  if (!UUID.test(attempt)) throw new Error("Invalid notebook attempt.");
  await authenticate(session);
  const { data, error } = await createServiceClient().from("notebook_execution_attempts")
    .select("grade_request,expires_at").eq("owner_id", session.accountId).eq("session_id", session.sessionId).eq("attempt_id", attempt).maybeSingle();
  if (error) throw new Error("Notebook attempt storage is unavailable.");
  const expiry = typeof data?.expires_at === "string" ? Date.parse(data.expires_at) : NaN;
  if (!Number.isFinite(expiry) || expiry <= Date.now() || !data?.grade_request) return null;
  return data.grade_request;
}
