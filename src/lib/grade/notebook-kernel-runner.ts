import { Sandbox } from "@vercel/sandbox";
import { finished } from "node:stream/promises";
import { createGenericOutputCapture } from "./generic-output-capture";
import { isSafeGenericExecutionComponent } from "./generic-execution-path";
import { NOTEBOOK_CONTROLLER, parseNotebookObservations, type NotebookObservations } from "./notebook-kernel-controller";
import { validateNotebookOutputImages } from "./notebook-output-images";

export interface NotebookKernelFile { path: string; content: Uint8Array }
export type NotebookKernelResult = { ok: true; observations: NotebookObservations; caveat: string } | { ok: false; reason: string };

/** Execute one complete notebook in a fresh isolated kernel. Caller must pass
 * full, verified submission files; this does not prove kernel honesty. */
export async function runNotebookKernel(files: readonly NotebookKernelFile[], notebookPath: string, snapshotId: string, signal: AbortSignal): Promise<NotebookKernelResult> {
  const fail = (): NotebookKernelResult => ({ ok: false, reason: "Notebook execution did not complete; review the submission." });
  if (!/^snap_[A-Za-z0-9]{1,128}$/.test(snapshotId) || !files.length || files.length > 100) return fail();
  const seen = new Set<string>(); let bytes = 0;
  for (const file of files) {
    const parts = file.path.split("/");
    if (!file.path || file.path.length > 200 || parts.some(p => !p || p.startsWith("-") || !isSafeGenericExecutionComponent(p)) || seen.has(file.path.toLowerCase()) || file.path.toLowerCase() === "data") return fail();
    seen.add(file.path.toLowerCase()); bytes += file.content.byteLength;
  }
  if (bytes > 4_000_000) return fail();
  const notebook = files.filter(file => file.path === notebookPath);
  if (notebook.length !== 1 || !/\.ipynb$/i.test(notebookPath)) return fail();
  let expected: number[];
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(notebook[0].content));
    if (value?.nbformat !== 4 || !Array.isArray(value.cells) || value.cells.length > 500 || (value.metadata?.kernelspec?.language && value.metadata.kernelspec.language.toLowerCase() !== "python")) return fail();
    expected = value.cells.flatMap((cell: { cell_type?: string }, index: number) => cell?.cell_type === "code" ? [index] : []);
    if (!expected.length || expected.length > 200) return fail();
  } catch { return fail(); }
  let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | undefined;
  let stopOnAbort: (() => void) | undefined;
  try {
    signal.throwIfAborted();
    sandbox = await Sandbox.create({ source: { type: "snapshot", snapshotId }, networkPolicy: "deny-all", persistent: false, resources: { vcpus: 1 }, timeout: 55_000, signal });
    const activeSandbox = sandbox;
    stopOnAbort = () => { void activeSandbox.stop().catch(() => undefined); };
    signal.addEventListener("abort", stopOnAbort, { once: true });
    const preflight = await sandbox.runCommand({ cmd: "python3", args: ["-I", "-c", "import nbformat, nbclient, ipykernel"], timeoutMs: 8_000, signal });
    if (preflight.exitCode !== 0) return fail();
    const dirs = new Set(["/vercel/project", "/vercel/project/data"]);
    for (const file of files) { const parts = file.path.split("/"); parts.pop(); let current = "/vercel/project"; for (const part of parts) { current += `/${part}`; dirs.add(current); } }
    for (const dir of [...dirs].sort((a, b) => a.length - b.length)) await sandbox.mkDir(dir, { signal });
    await sandbox.writeFiles(files.map(file => ({ path: `/vercel/project/${file.path}`, content: Buffer.from(file.content) })), { signal });
    const stdout = createGenericOutputCapture(1_200_000), stderr = createGenericOutputCapture(20_000);
    const result = await sandbox.runCommand({ cmd: "python3", args: ["-I", "-c", NOTEBOOK_CONTROLLER, `/vercel/project/${notebookPath}`], cwd: "/vercel/project", timeoutMs: 45_000, signal, stdout: stdout.stream, stderr: stderr.stream });
    const done = Promise.all([finished(stdout.stream), finished(stderr.stream)]); stdout.stream.end(); stderr.stream.end(); await done;
    const out = stdout.result();
    if (out.truncated) return fail();
    const observations = parseNotebookObservations(out.text, result.exitCode, expected);
    return observations && await validateNotebookOutputImages(observations) !== null ? { ok: true, observations, caveat: "Cell outcomes are observations reported by the untrusted notebook kernel and do not prove resistance to tampering." } : fail();
  } catch { return fail(); }
  finally {
    if (stopOnAbort) signal.removeEventListener("abort", stopOnAbort);
    if (sandbox) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([sandbox.stop().catch(() => undefined), new Promise<void>(resolve => { timer = setTimeout(resolve, 1_000); })]); }
      finally { if (timer) clearTimeout(timer); }
    }
  }
}
