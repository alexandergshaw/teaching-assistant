import { createHash } from "node:crypto";
import { inspectModule12Binary, type Module12ArtifactReceipt } from "./module12-binary-sandbox";
import { isSupportedWindowsPe, runGenericWindowsArtifact } from "./generic-windows-sandbox";

/** Fail closed if any pinned artifact cannot be inspected or bound to its bytes. */
export async function inspectModule12PinnedArtifacts(input: {
  files: readonly { path: string; bytes: Uint8Array }[]; repoCommit: string; signal: AbortSignal;
  sourceFiles?: readonly { path: string; bytes: Uint8Array }[];
  beforeDispatch: (signal: AbortSignal) => Promise<void>;
}): Promise<Module12ArtifactReceipt[]> {
  if (input.files.length > 3 || new Set(input.files.map(file => file.path)).size !== input.files.length) throw new Error("Artifact inspection capacity exceeded");
  const controller = new AbortController();
  const signal = AbortSignal.any([input.signal, controller.signal]);
  let firstFailure: unknown;
  const pending = input.files.map(async file => {
    try {
      let receipt: Module12ArtifactReceipt;
      if (file.path === "assignments/module_12/test_utils.exe" && isSupportedWindowsPe(file.bytes)) {
        const allFiles=[...(input.sourceFiles ?? []),...input.files];
        const windows = await runGenericWindowsArtifact({ ...file, folder: "assignments/module_12", files: allFiles, repoCommit: input.repoCommit, signal, beforeDispatch: input.beforeDispatch });
        const manifest=allFiles.map(item=>({path:item.path,sha256:createHash("sha256").update(item.bytes).digest("hex")}));
        if(JSON.stringify(windows.inputManifest)!==JSON.stringify(manifest))throw new Error("Windows input inventory mismatch");
        const info = { command: "validated x86_64 PE header", exitCode: 0, termination: null, stdout: "x86_64 PE", stderr: "", stdoutTruncated: false, stderrTruncated: false };
        const version = { ...info, command: "wine --version", stdout: windows.runtimeVersion };
        const execution = windows.status === "observed" ? { command: windows.execution.command, exitCode: windows.execution.exitCode,
          termination: windows.execution.signal ? "unknown" as const : null, stdout: windows.execution.stdout, stderr: windows.execution.stderr,
          stdoutTruncated: windows.execution.stdoutTruncated, stderrTruncated: windows.execution.stderrTruncated } : null;
        receipt = { path: windows.path, repoCommit: windows.repoCommit, sha256: windows.sha256, kind: "pe", image: windows.image,
          networkPolicy: "deny-all", toolVersion: version, runtimeVersion: version, metadata: info, executionStatus: windows.status === "observed" ? "observed" : "runtime-unavailable", execution,
          sourceEquivalence: "unverified", testCoverage: "unverified" };
      } else {
        receipt = await inspectModule12Binary({ ...file, repoCommit: input.repoCommit, signal, beforeDispatch: input.beforeDispatch });
      }
      if (receipt.path !== file.path || receipt.repoCommit !== input.repoCommit || receipt.sha256 !== createHash("sha256").update(file.bytes).digest("hex")) throw new Error("Artifact observation does not match pinned bytes");
      return receipt;
    } catch (error) { if (firstFailure === undefined) firstFailure = error; controller.abort(error); throw error; }
  });
  const settled = await Promise.allSettled(pending);
  if (firstFailure !== undefined) throw firstFailure;
  input.signal.throwIfAborted();
  return settled.map(item => { if (item.status === "rejected") throw item.reason; return item.value; });
}
