import "server-only";
import { artifactManifestDigest, beginArtifactDispatch, finishArtifactDispatch, recordArtifactSandbox,
  type ArtifactDispatch, type ArtifactManifestEntry } from "./artifact-dispatch";

/** A prior started request may still be running; callers must not relaunch it. */
export class ArtifactDispatchUncertainError extends Error {}
/** No dispatch was started because the remaining worker budget was too small. */
export class ArtifactBudgetDeferredError extends Error {}

/** Execute once per claim and artifact. Reuse on another claim is available
 * only through an explicit recovery generation admitted by the database.
 * A lost database response always propagates; no dispatch is auto-retried. */
export async function runCheckpointedArtifact<T>(input: {
  identity: Omit<ArtifactDispatch, "manifestSha256">;
  manifest: readonly ArtifactManifestEntry[];
  signal: AbortSignal;
  beforeDispatch: (signal: AbortSignal) => Promise<void>;
  validateReceipt: (value: unknown) => value is T;
  execute: (onSandboxCreated: (id: string) => Promise<void>) => Promise<T>;
  /** Return a bounded unexamined receipt only for a conclusive error before
   * any submitted artifact was executed; transport/abort errors stay unknown. */
  unavailableReceipt?: (error: unknown) => T | undefined;
}): Promise<T> {
  const identity: ArtifactDispatch = { ...input.identity, manifestSha256: artifactManifestDigest(input.manifest) };
  if (!input.manifest.some(item => item.path === identity.path && item.sha256 === identity.artifactSha256)) {
    throw new Error("Artifact is absent from pinned manifest");
  }
  input.signal.throwIfAborted();
  // The run-bound DB check requires the enclosing attempt to have crossed its
  // own dispatch marker. Treat any lost response as uncertain, never replay.
  await input.beforeDispatch(input.signal);
  input.signal.throwIfAborted();
  const admission = await beginArtifactDispatch(identity);
  input.signal.throwIfAborted();
  if (admission.status === "completed") {
    if (!input.validateReceipt(admission.receipt)) throw new Error("Invalid saved artifact receipt");
    return admission.receipt;
  }
  if (admission.status === "unknown") throw new ArtifactDispatchUncertainError("An earlier artifact dispatch is unresolved");
  if (admission.status === "deferred") throw new ArtifactBudgetDeferredError("Artifact execution was deferred before dispatch");
  if (admission.status !== "started") throw new Error("Artifact dispatch denied");
  let recorded = false;
  let result: T;
  try {
    result = await input.execute(async (id) => {
      input.signal.throwIfAborted();
      if (recorded || !await recordArtifactSandbox(identity,id)) throw new ArtifactDispatchUncertainError("Artifact sandbox identity could not be retained");
      recorded = true;
      input.signal.throwIfAborted();
    });
  } catch (error) {
    input.signal.throwIfAborted();
    const unavailable = recorded ? input.unavailableReceipt?.(error) : undefined;
    if (unavailable === undefined) throw error;
    result = unavailable;
  }
  input.signal.throwIfAborted();
  if (!recorded || !input.validateReceipt(result)) throw new ArtifactDispatchUncertainError("Artifact result could not be verified");
  if (!await finishArtifactDispatch(identity,result)) throw new ArtifactDispatchUncertainError("Artifact result could not be retained");
  return result;
}
