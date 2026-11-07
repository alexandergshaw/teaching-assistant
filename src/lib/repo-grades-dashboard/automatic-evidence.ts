import "server-only";

import { createHash } from "node:crypto";
import { createGithubBoundedReadContext } from "@/lib/github-bounded-read";
import { encodeRefSegment, normalizeTargetBranch, validateGithubOwnerRepo } from "@/lib/github-ref-name";
import { ghJson, getRepo, isGithubCommitSha } from "@/lib/github.repos";
import { asGithubHttpError } from "@/lib/github-http-error";
import { preparationGithubThrottle } from "./preparation-github-throttle";
import { composeRepoGradePreparationEvidence } from "./preparation-evidence";
import { captureRepoGradePreparationInput } from "./preparation-input";
import { collectPreparationEvidenceBatch, type RepoGradeEvidenceBatchProgress } from "./preparation-batch";
import { readPinnedRepoGradeReadme } from "./preparation-readme";
import type { RepoGradeCourseConfig } from "@/lib/supabase/types.repo-grades-dashboard";

type Resolver = typeof composeRepoGradePreparationEvidence;
type Input = Parameters<Resolver>[0];
type Store = { read(basis: string): Promise<unknown>; write(basis: string, value: unknown): Promise<void>; readProgress?(basis: string): Promise<unknown> };
const MAX_EVIDENCE_BYTES = 512 * 1024;
const INVALID = { status: "blocked", reason: "invalid-instruction-evidence" } as const;

/** Resolve only the codebase explicitly attached to the owned course. */
export function courseTemplateRepo(config: RepoGradeCourseConfig): { owner: string; repo: string; branch: string | null } | null {
  if (!Array.isArray(config.repos)) return null;
  const entries = config.repos.flatMap((row) => object(row) ? [{ repo: row.repo, branch: row.branch }] : []);
  const pairing = object(config.repo_module_pairing) && typeof config.repo_module_pairing.repoRef === "string"
    ? config.repo_module_pairing.repoRef : null;
  const chosen = entries.length === 1 ? entries[0] : pairing ? entries.find((row) => row.repo === pairing) : undefined;
  if (!chosen || typeof chosen.repo !== "string" || (chosen.branch != null && typeof chosen.branch !== "string")) return null;
  const [owner, repo, extra] = chosen.repo.split("/");
  if (!owner || !repo || extra !== undefined || !validateGithubOwnerRepo(owner, repo)) return null;
  return { owner, repo, branch: typeof chosen.branch === "string" && chosen.branch.trim() ? chosen.branch : null };
}

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
    || !Array.isArray(value.rows) || value.rows.length > 1000) return INVALID;
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

export class PreparationEvidenceContinue extends Error {
  constructor(readonly basis: string, readonly progress: RepoGradeEvidenceBatchProgress) {
    super("Repository instruction evidence requires another batch");
  }
}

/** Save the complete capture, never a target's prepared profile or an
 * unsuccessful scan. Re-run the same input validator when reusing evidence. */
export function createAutomaticRepoGradeEvidenceResolver(
  snapshotBasis: string, store: Store, authorizeReuse: () => Promise<boolean>, courseConfig?: RepoGradeCourseConfig,
): Resolver {
  return async (input) => {
    if (input.instructionPolicy.kind === "saved" || input.inventory.status === "incomplete") {
      return composeRepoGradePreparationEvidence(input);
    }
    if (courseConfig) {
      const template = courseTemplateRepo(courseConfig);
      if (!template) return { status: "blocked", reason: "missing-instruction-evidence" };
      const basis = createHash("sha256").update(JSON.stringify(["automatic-template-evidence-v1", snapshotBasis, input, template])).digest("hex");
      const prior = await store.read(basis);
      let instructions: string;
      let path: string | null;
      let sourceRef: string;
      let sourceCommit: string;
      let blobSha: string | null;
      let readmeStatus: "present" | "absent" | "blank";
      const fallback = input.instructionPolicy.kind === "readme-with-configured-fallback"
        ? input.instructionPolicy.fallbackInstructions : undefined;
      if (prior !== null) {
        if (!object(prior) || prior.version !== 2 || typeof prior.instructions !== "string"
          || typeof prior.sourceCommit !== "string" || !isGithubCommitSha(prior.sourceCommit)
          || typeof prior.sourceRef !== "string" || (prior.path !== null && typeof prior.path !== "string")
          || (prior.blobSha !== null && typeof prior.blobSha !== "string")
          || (prior.readmeStatus !== "present" && prior.readmeStatus !== "absent" && prior.readmeStatus !== "blank")
          || prior.repo !== `${template.owner}/${template.repo}`) return INVALID;
        if (prior.readmeStatus === "present" && createHash("sha1").update(`blob ${Buffer.byteLength(prior.instructions, "utf8")}\0`)
          .update(prior.instructions, "utf8").digest("hex") !== prior.blobSha) return INVALID;
        if (!await authorizeReuse() || !await authorizeAutomaticRepoGradeEvidence(prior.repo, prior.sourceCommit)) {
          return { status: "blocked", reason: "readme-read-failed" };
        }
        instructions = prior.instructions;
        path = prior.path;
        sourceRef = prior.sourceRef;
        sourceCommit = prior.sourceCommit;
        blobSha = prior.blobSha;
        readmeStatus = prior.readmeStatus;
      } else {
        let branch: string;
        const context = createGithubBoundedReadContext(Date.now() + 10_000, 1_000_001);
        try {
          branch = template.branch ?? (await getRepo(template.owner, template.repo, context)).defaultBranch;
          const normalized = normalizeTargetBranch(branch);
          if (!normalized.ok || normalized.branch !== branch) return INVALID;
          const commit = await ghJson<unknown>(`/repos/${template.owner}/${template.repo}/commits/${encodeRefSegment(branch)}`, { cache: "no-store" }, context);
          if (!object(commit) || !isGithubCommitSha(commit.sha)) return INVALID;
          sourceCommit = commit.sha;
        } catch (error) {
          const response = asGithubHttpError(error);
          const throttle = response && preparationGithubThrottle(response.status, response.headers);
          if (throttle) throw throttle;
          return { status: "blocked", reason: "readme-read-failed" };
        } finally {
          context.dispose();
        }
        const read = await readPinnedRepoGradeReadme({ owner: template.owner, repo: template.repo,
          sourceRef: branch, sourceCommit }, input.configuration.folder, undefined, input.configuration.accountId);
        if (read.status === "failure") return { status: "blocked", reason: "readme-read-failed" };
        if (read.status !== "present" && !fallback) return { status: "blocked", reason: "missing-instruction-evidence" };
        instructions = read.status === "present" ? read.text : fallback!;
        path = read.status === "absent" ? null : read.path;
        blobSha = read.status === "absent" ? null : read.blobSha;
        readmeStatus = read.status;
        sourceRef = branch;
        const payload = { version: 2, repo: `${template.owner}/${template.repo}`, sourceRef, sourceCommit, path, blobSha, readmeStatus, instructions };
        if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_EVIDENCE_BYTES) return INVALID;
        await store.write(basis, payload);
      }
      if (input.inventory.status !== "complete") return INVALID;
      return captureRepoGradePreparationInput({ ...input, readmeEvidence: input.inventory.targets.map((target) => ({
        target, source: { kind: "template-readme", path, repo: `${template.owner}/${template.repo}`, sourceRef, sourceCommit, blobSha, readmeStatus,
          instructionSha256: createHash("sha256").update(instructions, "utf8").digest("hex"), instructions },
      })) });
    }
    const basis = createHash("sha256").update(JSON.stringify(["automatic-evidence-v1", snapshotBasis, input])).digest("hex");
    const prior = await store.read(basis);
    if (prior !== null) return await authorizeReuse() ? restore(input, prior)
      : { status: "blocked", reason: "readme-read-failed" };
    let captured;
    if (input.inventory.targets.length > 100 && store.readProgress) {
      const progress = await store.readProgress(basis);
      if (progress !== null && (!object(progress) || !Array.isArray(progress.rows)
        || !progress.rows.every((row: unknown) => object(row) && object(row.target) && object(row.source)))) return INVALID;
      if (progress !== null && !await authorizeReuse()) return { status: "blocked", reason: "readme-read-failed" };
      const step = await collectPreparationEvidenceBatch(input, progress as RepoGradeEvidenceBatchProgress | null);
      if (step.status === "continue") throw new PreparationEvidenceContinue(basis, step.progress);
      captured = step;
    } else {
      captured = await composeRepoGradePreparationEvidence(input);
    }
    if (captured.status === "ready") {
      const payload = { version: 1, key: captured.key, instructions: captured.instructions, rows: captured.evidence };
      if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_EVIDENCE_BYTES) return INVALID;
      await store.write(basis, payload);
    }
    return captured;
  };
}
