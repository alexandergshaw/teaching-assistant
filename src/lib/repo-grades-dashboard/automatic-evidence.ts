import "server-only";

import { createHash } from "node:crypto";
import { createGithubBoundedReadContext } from "@/lib/github-bounded-read";
import { validateGithubOwnerRepo } from "@/lib/github-ref-name";
import { ghJson, isGithubCommitSha } from "@/lib/github.repos";
import { asGithubHttpError } from "@/lib/github-http-error";
import { preparationGithubThrottle } from "./preparation-github-throttle";
import { composeRepoGradePreparationEvidence } from "./preparation-evidence";
import { captureRepoGradePreparationInput } from "./preparation-input";

type Resolver = typeof composeRepoGradePreparationEvidence;
type Input = Parameters<Resolver>[0];
type Store = { read(basis: string): Promise<unknown>; write(basis: string, value: unknown): Promise<void> };
const MAX_EVIDENCE_BYTES = 512 * 1024;
const INVALID = { status: "blocked", reason: "invalid-instruction-evidence" } as const;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function authorizeAutomaticRepoGradeEvidence(repo: string, sha: string): Promise<boolean> {
  const [owner, name, extra] = repo.split("/");
  if (!owner || !name || extra !== undefined || !validateGithubOwnerRepo(owner, name) || !isGithubCommitSha(sha)) return false;
  const context = createGithubBoundedReadContext(Date.now() + 10_000, 1_000_001);
  try {
    const commit = await ghJson<unknown>(`/repos/${owner}/${name}/git/commits/${sha}`, { cache: "no-store" }, context);
    return object(commit) && commit.sha === sha && object(commit.tree) && isGithubCommitSha(commit.tree.sha);
  } catch (error) {
    const response = asGithubHttpError(error);
    const throttle = response && preparationGithubThrottle(response.status, response.headers);
    if (throttle) throw throttle;
    return false;
  } finally {
    context.dispose();
  }
}

function restore(input: Input, value: unknown) {
  if (!object(value) || value.version !== 1 || typeof value.instructions !== "string" || typeof value.key !== "string"
    || !Array.isArray(value.rows) || value.rows.length > 100) return INVALID;
  const { instructions } = value;
  const readmeEvidence = [];
  for (const row of value.rows as unknown[]) {
    if (!object(row) || !object(row.source)) return INVALID;
    readmeEvidence.push({
      target: row.target,
      source: row.source.kind === "pinned-readme" ? { ...row.source, instructions } : row.source,
    });
  }
  const captured = captureRepoGradePreparationInput({ ...input, readmeEvidence });
  return captured.status === "ready" && captured.key === value.key && captured.instructions === instructions ? captured : INVALID;
}

/** Save the complete capture, never a target's prepared profile or an
 * unsuccessful scan. Re-run the same input validator when reusing evidence. */
export function createAutomaticRepoGradeEvidenceResolver(
  snapshotBasis: string, store: Store, authorizeReuse: () => Promise<boolean>,
): Resolver {
  return async (input) => {
    if (input.instructionPolicy.kind === "saved" || input.inventory.status === "incomplete") {
      return composeRepoGradePreparationEvidence(input);
    }
    const basis = createHash("sha256").update(JSON.stringify(["automatic-evidence-v1", snapshotBasis, input])).digest("hex");
    const prior = await store.read(basis);
    if (prior !== null) return await authorizeReuse() ? restore(input, prior)
      : { status: "blocked", reason: "readme-read-failed" };
    const captured = await composeRepoGradePreparationEvidence(input);
    if (captured.status === "ready") {
      const payload = { version: 1, key: captured.key, instructions: captured.instructions, rows: captured.evidence };
      if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_EVIDENCE_BYTES) return INVALID;
      await store.write(basis, payload);
    }
    return captured;
  };
}
