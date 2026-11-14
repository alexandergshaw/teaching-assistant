import "server-only";
import { MAX_GENERIC_EXECUTION_FILES } from "@/lib/grade/generic-execution-limits";
import { createHash } from "node:crypto";
import { requireAppOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { RepoGradeClaim } from "./state";

export type ArtifactManifestEntry = { path: string; sha256: string };
export type ArtifactDispatch = {
  claim: RepoGradeClaim;
  run: { runId: string; lease: string };
  sourceSha: string;
  path: string;
  artifactSha256: string;
  manifestSha256: string;
  /** Explicit recovery only; fresh targeted regrades must not reuse results. */
  resumeGeneration?: number;
  /** False permits replay of a completed checkpoint but starts no new work. */
  allowStart?: boolean;
};

/** Stable identity for the entire pinned input inventory, not only its entry. */
export function artifactManifestDigest(entries: readonly ArtifactManifestEntry[]): string {
  if (!entries.length || entries.length > MAX_GENERIC_EXECUTION_FILES) throw new Error("Invalid artifact manifest");
  const seen = new Set<string>();
  const normalized = entries.map(({path, sha256}) => {
    if (!path || path.length > 600 || /[\x00-\x1f\x7f\\]/.test(path) || path.split("/").some(part => !part || part === "." || part === "..")
      || !/^[a-f0-9]{64}$/.test(sha256) || seen.has(path.toLowerCase())) throw new Error("Invalid artifact manifest");
    seen.add(path.toLowerCase());
    return {path, sha256};
  }).sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return createHash("sha256").update(JSON.stringify(normalized), "utf8").digest("hex");
}

async function artifactRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const owner = await requireAppOwner();
  // A response may be lost after the database commits; never retry a write.
  const { data, error } = await createServiceClient().rpc(name, { p_user_id: owner.id, ...args }).retry(false);
  if (error) throw new Error("Artifact dispatch storage is unavailable");
  return data;
}

const identity = ({claim, run, path}: ArtifactDispatch) => ({
  p_generation: claim.generation, p_token: claim.token, p_run_id: run.runId, p_lease: run.lease, p_path: path,
});

/** Must be called after the enclosing attempt dispatch marker is fenced. */
export async function findArtifactResume(input: Pick<ArtifactDispatch,"claim"|"run"|"manifestSha256">): Promise<number|null> {
  const response = await artifactRpc("repo_grade_find_artifact_resume", {
    p_generation:input.claim.generation,p_token:input.claim.token,p_run_id:input.run.runId,p_lease:input.run.lease,
    p_manifest_sha256:input.manifestSha256,
  });
  if (response !== null && (typeof response !== "number" || !Number.isSafeInteger(response) || response <= 0 || response >= input.claim.generation)) {
    throw new Error("Invalid artifact resume response");
  }
  return response;
}

export async function beginArtifactDispatch(input: ArtifactDispatch): Promise<{status:"started"|"deferred"|"unknown"|"conflict"|"forbidden"} | {status:"completed";receipt:unknown}> {
  const response = await artifactRpc("repo_grade_begin_artifact_dispatch", { ...identity(input),
    p_source_sha: input.sourceSha, p_artifact_sha256: input.artifactSha256, p_manifest_sha256: input.manifestSha256,
    p_resume_generation: input.resumeGeneration ?? null, p_allow_start:input.allowStart ?? true });
  if (!response || typeof response !== "object" || !("status" in response)) throw new Error("Invalid artifact dispatch response");
  if (response.status === "completed" && "receipt" in response && response.receipt && typeof response.receipt === "object") return {status:"completed",receipt:response.receipt};
  if (response.status === "started" || response.status === "deferred" || response.status === "unknown" || response.status === "conflict" || response.status === "forbidden") return {status:response.status};
  throw new Error("Invalid artifact dispatch response");
}

export async function recordArtifactSandbox(input: ArtifactDispatch, sandboxId: string): Promise<boolean> {
  const response = await artifactRpc("repo_grade_record_artifact_sandbox", { ...identity(input), p_sandbox_id: sandboxId });
  if (typeof response !== "boolean") throw new Error("Invalid artifact sandbox response");
  return response;
}

export async function finishArtifactDispatch(input: ArtifactDispatch, receipt: unknown): Promise<boolean> {
  const response = await artifactRpc("repo_grade_finish_artifact_dispatch", { ...identity(input), p_receipt: receipt });
  if (typeof response !== "boolean") throw new Error("Invalid artifact completion response");
  return response;
}
