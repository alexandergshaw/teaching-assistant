import "server-only";
import { createHash, createHmac } from "node:crypto";
import { collectNotebookProject } from "./notebook-project-collector";
import { reserveNotebookAttempt, beginNotebookAttempt, bindNotebookAttempt, loadNotebookAttempt, settleNotebookAttempt, cancelNotebookAttempt, recoverNotebookUnknown, confirmNotebookCancelled, claimUnboundNotebookRecovery, finishUnboundNotebookRecovery, listNotebookAttempts, restoreNotebookGradeRequest } from "./notebook-attempt-store";
import { isDetachedNotebookStopped, pollDetachedNotebook, recoverUnboundNotebook, startDetachedNotebook, stopDetachedNotebook } from "./notebook-detached-runner";
import type { ExpectedOwnerSession } from "./owner-session-binding";
import { parseSubmissionGithubUrl } from "../submission-repo";
import { inventoryPathInScope } from "./submission-file-inventory";
import { listCommits } from "../github.branches";
import { notebookGradeBinding } from "./notebook-grade-binding";
import { UPLOAD_WIRE_BUDGET_BYTES } from "../upload-budget";
import { verifySingleZipOwnerSession } from "../supabase/single-zip-owner-session";
import { isExactNotebookRepositoryEntry } from "./notebook-single-source";

export type NotebookAttemptStatus = { status: "running" | "unknown" | "failed" | "expired" | "cancelled" | "succeeded" | "retryable"; attempt?: string };
function safeSourceUrl(sourceUrl: string): boolean {
  try { const url = new URL(sourceUrl); return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash && /^(?:www\.)?github\.com$/i.test(url.hostname); }
  catch { return false; }
}

/** Pinned project collection precedes the durable single-dispatch permit. */
export async function startDurableNotebook(session: ExpectedOwnerSession, attempt: string, owner: string, repo: string, commit: string, path: string, sourceUrl: string, gradeRequest: unknown): Promise<NotebookAttemptStatus> {
  if (process.env.CODE_RUNNER_NOTEBOOK_DURABLE_ENABLED !== "true") return { status: "failed" };
  // Authenticate before any GitHub reads, not only before ledger operations.
  if (!await verifySingleZipOwnerSession(session)) throw new Error("Notebook owner session is unavailable.");
  if (!gradeRequest || typeof gradeRequest !== "object" || Array.isArray(gradeRequest)) return { status: "failed" };
  const request = gradeRequest as { notebookAttempt?: unknown; entry?: { submissionUrl?: unknown }; expectedOwnerSession?: ExpectedOwnerSession };
  if (request.notebookAttempt !== undefined || request.entry?.submissionUrl !== sourceUrl || request.expectedOwnerSession?.accountId !== session.accountId || request.expectedOwnerSession?.sessionId !== session.sessionId || Buffer.byteLength(JSON.stringify(gradeRequest)) > UPLOAD_WIRE_BUDGET_BYTES) return { status: "failed" };
  const gradeBinding = await notebookGradeBinding(gradeRequest);
  const snapshot = process.env.CODE_RUNNER_PYTHON_SNAPSHOT?.trim() ?? "";
  const nameKey = process.env.NOTEBOOK_EXECUTION_NAME_KEY ?? "";
  if (!/^snap_[A-Za-z0-9]{1,128}$/.test(snapshot) || !safeSourceUrl(sourceUrl) || Buffer.byteLength(nameKey) < 32 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attempt)) return { status: "failed" };
  const name = `nb-${createHmac("sha256", nameKey).update(JSON.stringify(["notebook-v1", session.accountId, session.sessionId, attempt])).digest("hex").slice(0, 40)}`;
  const parsedUrl = parseSubmissionGithubUrl(sourceUrl);
  if ("error" in parsedUrl || parsedUrl.owner.toLowerCase() !== owner.toLowerCase() || parsedUrl.repo.toLowerCase() !== repo.toLowerCase()) return { status: "failed" };
  if (parsedUrl.ref) {
    if (/^[a-f0-9]{40}$/i.test(parsedUrl.ref)) { if (parsedUrl.ref.toLowerCase() !== commit.toLowerCase()) return { status: "failed" }; }
    else { const head = await listCommits(owner, repo, parsedUrl.ref, 1); if (head[0]?.sha.toLowerCase() !== commit.toLowerCase()) return { status: "failed" }; }
  }
  const scope = { kind: parsedUrl.kind ?? "repository" as "repository" | "tree" | "blob", path: parsedUrl.subpath ?? null };
  if ((scope.kind !== "repository" && !scope.path) || !inventoryPathInScope(path, scope)) return { status: "failed" };
  if (!await isExactNotebookRepositoryEntry(request.entry, sourceUrl, commit)) return { status: "failed" };
  const files = await collectNotebookProject(owner, repo, commit, Date.now() + 20_000, scope);
  const notebook = files.find(file => file.path === path);
  if (!notebook || !/\.ipynb$/i.test(path)) return { status: "failed" };
  let expected: number[];
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(notebook.content));
    if (parsed?.nbformat !== 4 || !Array.isArray(parsed.cells) || parsed.cells.length > 500 || (parsed.metadata?.kernelspec?.language && parsed.metadata.kernelspec.language.toLowerCase() !== "python")) return { status: "failed" };
    expected = parsed.cells.flatMap((cell: { cell_type?: string }, index: number) => cell?.cell_type === "code" ? [index] : []);
    if (!expected.length || expected.length > 200) return { status: "failed" };
  } catch { return { status: "failed" }; }
  const hash = createHash("sha256");
  hash.update(JSON.stringify(["notebook-project-v1", owner, repo, commit, path, snapshot, scope]));
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) hash.update(JSON.stringify([file.path, file.content.byteLength])).update(file.content);
  const digest = hash.digest("hex");
  const reservation = await reserveNotebookAttempt(session, attempt, digest, gradeBinding, sourceUrl, path, commit.toLowerCase(), expected, gradeRequest, name);
  if (!Array.isArray(reservation) || reservation.length !== 1 || reservation[0]?.input_matches !== true || typeof reservation[0]?.canonical_attempt !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reservation[0].canonical_attempt) || typeof reservation[0]?.canonical_name !== "string" || !/^nb-[a-f0-9]{40}$/.test(reservation[0].canonical_name)) return { status: "unknown" };
  const canonical = reservation[0].canonical_attempt as string;
  const canonicalName = reservation[0].canonical_name as string;
  if (reservation[0].expired) return { status: "expired" };
  if (reservation[0].status !== "reserved") return { ...await pollDurableNotebook(session, canonical), attempt: canonical };
  if (!await beginNotebookAttempt(session, canonical, digest)) return { status: "running", attempt: canonical };
  let handle: Awaited<ReturnType<typeof startDetachedNotebook>> | undefined;
  try {
    handle = await startDetachedNotebook(files, path, snapshot, canonicalName, AbortSignal.timeout(30_000));
    if (handle.sandboxName !== canonicalName) throw new Error("Notebook sandbox name mismatch.");
    if (!await bindNotebookAttempt(session, canonical, digest, handle.sandboxId, handle.sandboxName, handle.commandId)) {
      await stopDetachedNotebook(handle.sandboxName, handle.sandboxId).catch(() => undefined);
      return { status: "unknown", attempt: canonical };
    }
    return { status: "running", attempt: canonical };
  } catch {
    if (handle) await stopDetachedNotebook(handle.sandboxName, handle.sandboxId).catch(() => undefined);
    return { status: "unknown", attempt: canonical };
  }
}

export async function discoverNotebook(session: ExpectedOwnerSession, sourceUrl: string): Promise<{ kind: "notebook"; owner: string; repo: string; commit: string; path: string } | { kind: "none" | "unavailable" }> {
  if (!await verifySingleZipOwnerSession(session)) throw new Error("Notebook owner session is unavailable.");
  if (!safeSourceUrl(sourceUrl)) return { kind: "unavailable" };
  const parsed = parseSubmissionGithubUrl(sourceUrl); if ("error" in parsed) return { kind: "unavailable" };
  const { fetchGradableRepoContent } = await import("./repo-content");
  const content = await fetchGradableRepoContent(sourceUrl);
  if ("error" in content || !/^[a-f0-9]{40}$/i.test(content.ref) || !content.inventory?.enumerationComplete) return { kind: "unavailable" };
  const notebooks = content.inventory.files.filter(file => /\.ipynb$/i.test(file.path));
  if (!notebooks.length) {
    const { getRepoTreeWithMeta } = await import("../github.files");
    const tree = await getRepoTreeWithMeta(parsed.owner, parsed.repo, content.ref);
    const scope = { kind: parsed.kind ?? "repository" as "repository" | "tree" | "blob", path: parsed.subpath ?? null };
    if (tree.truncated || tree.unenumerated || (tree.excluded ?? []).some(item => inventoryPathInScope(item.path, scope))) return { kind: "unavailable" };
    return { kind: "none" };
  }
  if (notebooks.length !== 1 || notebooks[0].content !== "read") return { kind: "unavailable" };
  return { kind: "notebook", owner: parsed.owner, repo: parsed.repo, commit: content.ref.toLowerCase(), path: notebooks[0].path };
}
export async function listDurableNotebooks(session: ExpectedOwnerSession): Promise<unknown> { return listNotebookAttempts(session); }
export async function restoreDurableNotebook(session: ExpectedOwnerSession, attempt: string): Promise<unknown> { return restoreNotebookGradeRequest(session, attempt); }

/** No client-supplied sandbox handles are accepted. Polls can be retried. */
export async function pollDurableNotebook(session: ExpectedOwnerSession, attempt: string): Promise<NotebookAttemptStatus> {
  const row = await loadNotebookAttempt(session, attempt) as { status?: string; expires_at?: string; sandbox_id?: string; sandbox_name?: string; command_id?: string; expected_cells?: number[]; result?: unknown } | null;
  if (!row) return { status: "unknown" };
  const expiry = row.expires_at ? Date.parse(row.expires_at) : NaN;
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return { status: "expired" };
  if (row.status === "succeeded") return { status: "succeeded" };
  if (row.status === "failed") return { status: "failed" };
  if (row.status === "cancelled") return { status: "cancelled" };
  if (row.status === "retryable") return { status: "retryable" };
  if (row.status === "dispatching") {
    if (!await claimUnboundNotebookRecovery(session, attempt)) return { status: "unknown" };
    row.status = "recovering";
  }
  if ((row.status === "recovering" || row.status === "cancelling") && !row.sandbox_id && row.sandbox_name) {
    const recoveredId = await recoverUnboundNotebook(row.sandbox_name);
    if (recoveredId) {
      const state = await finishUnboundNotebookRecovery(session, attempt, row.sandbox_name, recoveredId);
      if (state) return { status: state };
    }
    return { status: "unknown" };
  }
  if (row.status === "cancelling" && row.sandbox_id && row.sandbox_name) {
    try { if (!await isDetachedNotebookStopped(row.sandbox_name, row.sandbox_id)) await stopDetachedNotebook(row.sandbox_name, row.sandbox_id); if (await confirmNotebookCancelled(session, attempt)) return { status: "cancelled" }; } catch { /* retry later */ }
    return { status: "unknown" };
  }
  if (row.status !== "running" || !row.sandbox_id || !row.sandbox_name || !row.command_id || !row.expected_cells) return { status: "unknown" };
  let result: Awaited<ReturnType<typeof pollDetachedNotebook>>;
  try { result = await pollDetachedNotebook({ sandboxId: row.sandbox_id, sandboxName: row.sandbox_name, commandId: row.command_id, expected: row.expected_cells }, AbortSignal.timeout(8_000)); }
  catch {
    try { if (await isDetachedNotebookStopped(row.sandbox_name, row.sandbox_id) && await recoverNotebookUnknown(session, attempt, row.sandbox_id)) return { status: "retryable" }; } catch { /* state remains uncertain */ }
    return { status: "unknown" };
  }
  if (result.status === "running") return result;
  const saved = await settleNotebookAttempt(session, attempt, result.status, result.status === "succeeded" ? result.observations : { reason: "Notebook execution did not complete." });
  if (!saved) return { status: "unknown" };
  await stopDetachedNotebook(row.sandbox_name, row.sandbox_id).catch(() => undefined);
  return result.status === "succeeded" ? { status: "succeeded" } : { status: "failed" };
}

export async function cancelDurableNotebook(session: ExpectedOwnerSession, attempt: string): Promise<NotebookAttemptStatus> {
  const rows = await cancelNotebookAttempt(session, attempt);
  if (!Array.isArray(rows) || rows.length !== 1) return pollDurableNotebook(session, attempt);
  if (rows[0].state === "cancelled") return { status: "cancelled" };
  if (typeof rows[0].sandbox_id === "string" && typeof rows[0].sandbox_name === "string") {
    try { if (!await isDetachedNotebookStopped(rows[0].sandbox_name, rows[0].sandbox_id)) await stopDetachedNotebook(rows[0].sandbox_name, rows[0].sandbox_id); if (await confirmNotebookCancelled(session, attempt)) return { status: "cancelled" }; } catch { /* do not release while uncertain */ }
  }
  return { status: "unknown" };
}
