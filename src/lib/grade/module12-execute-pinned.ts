import { createHash } from "node:crypto";
import { runModule12SandboxSource } from "./module12-vercel-sandbox";
import { validModule12ExecutionReceipt, type Module12ExecutionReceipt } from "./module12-receipt";

export async function executeModule12PinnedFiles(input: {
  files: readonly { path: string; bytes: Uint8Array }[]; repoCommit: string; signal: AbortSignal;
  beforeDispatch: (signal: AbortSignal) => Promise<void>;
}): Promise<Module12ExecutionReceipt[]> {
  const targets = [
    { language: "python", name: "test_utils.py" }, { language: "java", name: "TestUtils.java" },
    { language: "c++", name: "test_utils.cpp" },
  ] as const;
  const controller = new AbortController();
  const signal = AbortSignal.any([input.signal, controller.signal]);
  let firstFailure: unknown;
  const pending = targets.map(async ({ language, name }) => {
    try {
      const path = `assignments/module_12/${name}`;
      const found = input.files.filter((file) => file.path === path);
      if (found.length !== 1) throw new Error("Pinned execution source is missing or ambiguous");
      const result = await runModule12SandboxSource({ ...found[0], repoCommit: input.repoCommit, signal,
        companions: input.files.filter((file) => file.path !== path), beforeDispatch: input.beforeDispatch });
      const sourceSha256 = createHash("sha256").update(found[0].bytes).digest("hex");
      if (!validModule12ExecutionReceipt(result, { repoCommit: input.repoCommit, sourcePath: path, sourceSha256, language })) throw new Error("Invalid execution receipt");
      const manifest = input.files.map((file) => `${file.path}:${createHash("sha256").update(file.bytes).digest("hex")}`).sort();
      const observed = result.inputManifest.map((file) => `${file.path}:${file.sha256}`).sort();
      if (JSON.stringify(manifest) !== JSON.stringify(observed)) throw new Error("Execution inputs did not match pinned files");
      return result;
    } catch (error) {
      if (firstFailure === undefined) firstFailure = error;
      controller.abort(error);
      throw error;
    }
  });
  const settled = await Promise.allSettled(pending);
  if (firstFailure !== undefined) throw firstFailure;
  input.signal.throwIfAborted();
  return settled.map((item) => {
    if (item.status === "rejected") throw item.reason;
    return item.value;
  });
}
