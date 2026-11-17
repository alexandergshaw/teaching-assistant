import { Sandbox } from "@vercel/sandbox";
import { finished } from "node:stream/promises";
import { createGenericOutputCapture } from "./grade/generic-output-capture";
import { isSafeGenericExecutionComponent } from "./grade/generic-execution-path";
import { isStdinEofFailure, sourceLooksLikeItReadsStdin, type CodeRunSelectionFile } from "./code-run-selection";
import type { CodeRunResult } from "./code-runner";

const IMAGE = "vercel/sandbox/universal@sha256:9b2669397f26336812ec6835c2f67db6a546074cbabb05db93bf5e669f71ec5d";
export function supportsVercelCodeRun(language: string): boolean { return ["python", "javascript", "c", "c++"].includes(language); }

/** The VM starts without egress, before any submission bytes are uploaded.
 * Commands and arguments are constructed here, never by the submission. */
export async function runVercelCode(language: string, files: readonly CodeRunSelectionFile[], signal: AbortSignal): Promise<CodeRunResult> {
  if (!supportsVercelCodeRun(language) || !files.length || files.length > 100) throw new Error("Unsupported sandbox input.");
  const seen = new Set<string>(); let bytes = 0;
  const mapped = files.map((file) => {
    if (!isSafeGenericExecutionComponent(file.name) || file.name.startsWith("-") || file.name.length > 200 || seen.has(file.name.toLowerCase()) || file.name.toLowerCase() === "__grade_program") throw new Error("Unsupported sandbox filename.");
    seen.add(file.name.toLowerCase()); const content = Buffer.from(file.content, "utf8"); bytes += content.length;
    return { path: file.name, content };
  });
  if (bytes > 4_000_000) throw new Error("Sandbox input exceeds the supported size.");
  const source = files.filter((file) => language === "c" ? /\.c$/i.test(file.name) : /\.(?:cpp|cc|cxx)$/i.test(file.name));
  if ((language === "c" || language === "c++") && !source.length) throw new Error("No compilable source file was found.");
  signal.throwIfAborted();
  const sandbox = await Sandbox.create({ image: IMAGE, persistent: false, resources: { vcpus: 1 }, timeout: 30_000, networkPolicy: "deny-all", signal });
  const stop = () => { void sandbox.stop().catch(() => {}); }; signal.addEventListener("abort", stop, { once: true });
  try {
    signal.throwIfAborted(); await sandbox.writeFiles(mapped, { signal });
    const stage = async (cmd: string, args: string[]) => {
      const stdout = createGenericOutputCapture(20_000), stderr = createGenericOutputCapture(20_000);
      const result = await sandbox.runCommand({ cmd, args, timeoutMs: 8_000, signal, stdout: stdout.stream, stderr: stderr.stream });
      const completion = Promise.all([finished(stdout.stream), finished(stderr.stream)]); stdout.stream.end(); stderr.stream.end(); await completion;
      const out = stdout.result(), err = stderr.result();
      return { exitCode: result.exitCode, stdout: `${out.text}${out.truncated ? "\n[output truncated]" : ""}`, stderr: `${err.text}${err.truncated ? "\n[output truncated]" : ""}` };
    };
    let compileOutput: string | undefined;
    if (language === "c" || language === "c++") {
      const compile = await stage(language === "c" ? "gcc" : "g++", [...source.map((file) => `./${file.name}`), "-o", "__grade_program"]);
      compileOutput = [compile.stdout, compile.stderr].filter(Boolean).join("\n");
      if (compile.exitCode >= 128) throw new Error("Compiler termination was not confirmed.");
      if (compile.exitCode !== 0) return { language, files: files.map((file) => file.name), ran: false, exitCode: null, stdout: "", stderr: "", compileOutput };
    }
    const command = language === "python" ? "python3" : language === "javascript" ? "node" : "./__grade_program";
    const args = language === "python" || language === "javascript" ? [`./${files[0].name}`] : [];
    const run = await stage(command, args);
    if (run.exitCode >= 128) throw new Error("Program termination was not confirmed.");
    const ran = run.exitCode === 0;
    return { language, files: files.map((file) => file.name), ran, exitCode: run.exitCode, stdout: run.stdout, stderr: run.stderr, ...(compileOutput ? { compileOutput } : {}), neededStdin: !ran && isStdinEofFailure(run.stderr, [...files]), stdinReadSuspected: ran && sourceLooksLikeItReadsStdin(language, [...files]) };
  } finally { signal.removeEventListener("abort", stop); await sandbox.stop().catch(() => {}); }
}
