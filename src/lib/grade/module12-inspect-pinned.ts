import { createHash } from "node:crypto";
import { inspectModule12Binary, type Module12ArtifactReceipt } from "./module12-binary-sandbox";

/** Fail closed if any pinned artifact cannot be inspected or bound to its bytes. */
export async function inspectModule12PinnedArtifacts(input: {
  files: readonly { path: string; bytes: Uint8Array }[]; repoCommit: string; signal: AbortSignal;
  beforeDispatch: (signal: AbortSignal) => Promise<void>;
}): Promise<Module12ArtifactReceipt[]> {
  if (input.files.length > 3 || new Set(input.files.map(file => file.path)).size !== input.files.length) throw new Error("Artifact inspection capacity exceeded");
  const controller = new AbortController();
  const signal = AbortSignal.any([input.signal, controller.signal]);
  let firstFailure: unknown;
  const pending = input.files.map(async file => {
    try {
      const receipt = await inspectModule12Binary({ ...file, repoCommit: input.repoCommit, signal, beforeDispatch: input.beforeDispatch });
      if (receipt.path !== file.path || receipt.repoCommit !== input.repoCommit || receipt.sha256 !== createHash("sha256").update(file.bytes).digest("hex")) throw new Error("Artifact observation does not match pinned bytes");
      return receipt;
    } catch (error) { if (firstFailure === undefined) firstFailure = error; controller.abort(error); throw error; }
  });
  const settled = await Promise.allSettled(pending);
  if (firstFailure !== undefined) throw firstFailure;
  input.signal.throwIfAborted();
  return settled.map(item => { if (item.status === "rejected") throw item.reason; return item.value; });
}
