import { Sandbox } from "@vercel/sandbox";
import { isSafeGenericExecutionComponent } from "./generic-execution-path";
import { NOTEBOOK_CONTROLLER } from "./notebook-kernel-controller";
import { parseNotebookObservations, type NotebookObservations } from "./notebook-kernel-controller";
import { validateNotebookOutputImages } from "./notebook-output-images";
import type { NotebookKernelFile } from "./notebook-kernel-runner";
import { NOTEBOOK_PROJECT_MAX_BYTES, NOTEBOOK_PROJECT_MAX_FILES } from "./notebook-project-limits";

/** Call only after a durable dispatch permit. A lost response is uncertain and
 * must not cause another start. No grading result is produced here. */
export async function startDetachedNotebook(files: readonly NotebookKernelFile[], notebookPath: string, snapshotId: string, sandboxName: string, signal: AbortSignal): Promise<{ sandboxId: string; sandboxName: string; commandId: string }> {
  if (!/^snap_[A-Za-z0-9]{1,128}$/.test(snapshotId) || !/^nb-[a-f0-9]{40}$/.test(sandboxName) || !files.length || files.length > NOTEBOOK_PROJECT_MAX_FILES || !/\.ipynb$/i.test(notebookPath)) throw new Error("Invalid notebook project.");
  const seen = new Set<string>(); let bytes = 0;
  for (const file of files) {
    if (!file.path || file.path.length > 200 || file.path.split("/").some(p => !p || p.startsWith("-") || !isSafeGenericExecutionComponent(p)) || seen.has(file.path.toLowerCase()) || file.path.toLowerCase() === "data") throw new Error("Invalid notebook project path.");
    seen.add(file.path.toLowerCase()); bytes += file.content.byteLength;
  }
  if (bytes > NOTEBOOK_PROJECT_MAX_BYTES || files.filter(file => file.path === notebookPath).length !== 1) throw new Error("Invalid notebook project.");
  signal.throwIfAborted();
  const sandbox = await Sandbox.create({ name: sandboxName, source: { type: "snapshot", snapshotId }, networkPolicy: "deny-all", persistent: false, resources: { vcpus: 1 }, timeout: 900_000, signal });
  let dispatched = false;
  try {
    const preflight = await sandbox.runCommand({ cmd: "python3", args: ["-I", "-c", "import nbformat, nbclient, ipykernel"], timeoutMs: 8_000, signal });
    if (preflight.exitCode !== 0) throw new Error("Notebook kernel is unavailable.");
    const dirs = new Set(["/vercel/project", "/vercel/project/data"]);
    for (const file of files) { const parts = file.path.split("/"); parts.pop(); let current = "/vercel/project"; for (const part of parts) { current += `/${part}`; dirs.add(current); } }
    for (const dir of [...dirs].sort((a, b) => a.length - b.length)) await sandbox.mkDir(dir, { signal });
    await sandbox.writeFiles(files.map(file => ({ path: `/vercel/project/${file.path}`, content: Buffer.from(file.content) })), { signal });
    // Once this request begins, a lost response must remain unknown. Do not retry.
    dispatched = true;
    const command = await sandbox.runCommand({ cmd: "python3", args: ["-I", "-c", NOTEBOOK_CONTROLLER.replace("timeout=30,", "timeout=600,"), `/vercel/project/${notebookPath}`], cwd: "/vercel/project", timeoutMs: 840_000, detached: true, signal });
    return { sandboxId: sandbox.currentSession().sessionId, sandboxName: sandbox.name, commandId: command.cmdId };
  } catch (error) {
    // On uncertain dispatch, preserve the VM for recovery; it expires itself.
    if (!dispatched) await sandbox.stop().catch(() => undefined);
    throw error;
  }
}

/** Poll only handles retrieved from the owner-bound ledger, never from a client. */
export async function pollDetachedNotebook(handle: { sandboxId: string; sandboxName: string; commandId: string; expected: readonly number[] }, signal: AbortSignal): Promise<{ status: "running" } | { status: "failed" } | { status: "succeeded"; observations: NotebookObservations }> {
  if (!/^sbx_[A-Za-z0-9]{1,128}$/.test(handle.sandboxId) || !/^[A-Za-z0-9_-]{1,128}$/.test(handle.sandboxName) || !/^cmd_[A-Za-z0-9]{1,128}$/.test(handle.commandId) || !handle.expected.length || handle.expected.length > 200 || handle.expected.some((n, i) => !Number.isSafeInteger(n) || n < 0 || n >= 500 || (i > 0 && n <= handle.expected[i - 1]))) throw new Error("Invalid stored notebook attempt.");
  const sandbox = await Sandbox.get({ name: handle.sandboxName, resume: false, signal });
  if (sandbox.currentSession().sessionId !== handle.sandboxId) throw new Error("Notebook sandbox session changed.");
  const command = await sandbox.getCommand(handle.commandId, { signal });
  // The non-waiting command API can report null even after a command exits.
  // A short bounded wait retrieves the terminal status without tying up a poll.
  const probeTimeout = AbortSignal.timeout(1_000);
  let completed: Awaited<ReturnType<typeof command.wait>>;
  try { completed = await command.wait({ signal: AbortSignal.any([signal, probeTimeout]) }); }
  catch (error) { if (probeTimeout.aborted && !signal.aborted) return { status: "running" }; throw error; }
  let stdout = ""; let bytes = 0;
  for await (const line of completed.logs({ signal })) {
    bytes += Buffer.byteLength(line.data);
    if (bytes > 1_200_000) return { status: "failed" };
    if (line.stream === "stdout") stdout += line.data;
  }
  const observations = parseNotebookObservations(stdout, completed.exitCode, handle.expected);
  // The caller must persist the result before stopping the VM; failed writes
  // can then be retried without losing command logs.
  return observations && await validateNotebookOutputImages(observations) !== null ? { status: "succeeded", observations } : { status: "failed" };
}

/** Stop only after persisting terminal evidence. A VM also has a fixed TTL. */
export async function stopDetachedNotebook(name: string, sessionId: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(name) || !/^sbx_[A-Za-z0-9]{1,128}$/.test(sessionId)) throw new Error("Invalid stored notebook attempt.");
  const sandbox = await Sandbox.get({ name, resume: false, signal: AbortSignal.timeout(4_000) });
  if (sandbox.currentSession().sessionId !== sessionId) throw new Error("Notebook sandbox session changed.");
  const stopped = await sandbox.stop({ signal: AbortSignal.timeout(4_000) });
  if (stopped.id !== sessionId || !["stopped", "failed", "aborted"].includes(stopped.status)) throw new Error("Notebook sandbox stop was not confirmed.");
  if (!await isDetachedNotebookStopped(name, sessionId)) throw new Error("Notebook sandbox stop could not be independently confirmed.");
}
export async function isDetachedNotebookStopped(name: string, sessionId: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(name) || !/^sbx_[A-Za-z0-9]{1,128}$/.test(sessionId)) return false;
  const sandbox = await Sandbox.get({ name, resume: false, signal: AbortSignal.timeout(4_000) });
  return sandbox.currentSession().sessionId === sessionId && ["stopped", "failed", "aborted"].includes(sandbox.status);
}
/** The name was persisted before dispatch. Never interpret not-found or an
 * unavailable provider as proof that a delayed create cannot still happen. */
export async function recoverUnboundNotebook(name: string): Promise<string | null> {
  if (!/^nb-[a-f0-9]{40}$/.test(name)) return null;
  try {
    const sandbox = await Sandbox.get({ name, resume: false, signal: AbortSignal.timeout(4_000) });
    if (sandbox.name !== name) return null;
    const id = sandbox.currentSession().sessionId;
    if (!/^sbx_[A-Za-z0-9]{1,128}$/.test(id)) return null;
    if (!["stopped", "failed", "aborted"].includes(sandbox.status)) await stopDetachedNotebook(name, id);
    return await isDetachedNotebookStopped(name, id) ? id : null;
  } catch { return null; }
}
