import "server-only";

import { createHash } from "node:crypto";
import { normalizeTargetBranch, validateGithubOwnerRepo } from "@/lib/github-ref-name";
import type { RepoGradeDiscovery, RepoGradeSourceRow } from "./discovery";
import type { DiscoveryRateLimit } from "./discovery-transport";

const MAX_SNAPSHOT_BYTES = 1024 * 1024;
type CompleteDiscovery = {
  status: "scanned"; enumerationComplete: true;
  repos: Extract<RepoGradeSourceRow, { status: "ready" }>[];
  defaultSourceRefs?: Record<string, string>;
  rateLimit?: DiscoveryRateLimit;
};
export type AutomaticRepoGradeSnapshot = {
  version: 1; basis: string; discovery: CompleteDiscovery;
};

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export function automaticRepoGradeSnapshotBasis(
  accountId: string, courseId: string, courseConfig: unknown, courseKindBasis: unknown,
  folderSources: ReadonlyMap<string, string | null>,
) {
  // A newly created default profile does not change routing. Overrides do.
  const overrides = [...folderSources.entries()].filter(([, ref]) => ref !== null)
    .sort(([left], [right]) => left < right ? -1 : left === right ? 0 : 1);
  return createHash("sha256").update(JSON.stringify(canonical([
    accountId, courseId, courseConfig, courseKindBasis, overrides, process.env.GITHUB_TOKEN?.trim() ?? null,
  ]))).digest("hex");
}

function exactRef(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 255 || !value.isWellFormed()) return false;
  const parsed = normalizeTargetBranch(value);
  return parsed.ok && parsed.branch === value;
}

function exactFolder(value: unknown): value is string {
  return typeof value === "string" && value.length <= 512 && value.isWellFormed() && !/[\\\u0000-\u001f\u007f]/.test(value)
    && value.split("/").every((part) => !!part.trim() && part !== "." && part !== "..");
}

export function restoreAutomaticRepoGradeSnapshot(value: unknown): AutomaticRepoGradeSnapshot | null {
  if (!object(value) || value.version !== 1 || typeof value.basis !== "string" || !/^[0-9a-f]{64}$/.test(value.basis)
    || !object(value.discovery) || value.discovery.status !== "scanned" || value.discovery.enumerationComplete !== true
    || !Array.isArray(value.discovery.repos) || value.discovery.repos.length > 4_000) return null;
  const { defaultSourceRefs, rateLimit } = value.discovery;
  if (defaultSourceRefs !== undefined && !object(defaultSourceRefs)) return null;
  if (rateLimit !== undefined && (!object(rateLimit) || typeof rateLimit.primary !== "boolean"
    || typeof rateLimit.retryAtMs !== "number" || !Number.isSafeInteger(rateLimit.retryAtMs)
    || rateLimit.retryAtMs <= 0 || rateLimit.retryAtMs > 8.64e15)) return null;
  const repos: CompleteDiscovery["repos"] = [];
  const refsByRepo = new Map<string, Set<string>>();
  for (const row of value.discovery.repos as unknown[]) {
    if (!object(row) || row.status !== "ready" || typeof row.repo !== "string" || row.repo.length > 200
      || !exactRef(row.sourceRef) || typeof row.sourceCommit !== "string" || !/^[0-9a-f]{40}$/.test(row.sourceCommit)
      || !Array.isArray(row.folders) || !row.folders.every(exactFolder) || new Set(row.folders).size !== row.folders.length) return null;
    const [owner, repo, extra] = row.repo.split("/");
    if (!owner || !repo || extra !== undefined || !validateGithubOwnerRepo(owner, repo)) return null;
    const key = row.repo.toLowerCase();
    const refs = refsByRepo.get(key) ?? new Set<string>();
    if (refs.has(row.sourceRef) || (refs.size > 0 && defaultSourceRefs === undefined)) return null;
    refs.add(row.sourceRef);
    refsByRepo.set(key, refs);
    repos.push({ status: "ready", repo: row.repo, sourceRef: row.sourceRef, sourceCommit: row.sourceCommit, folders: row.folders });
  }
  const defaults: Record<string, string> = {};
  if (defaultSourceRefs !== undefined) {
    if (Object.keys(defaultSourceRefs).length !== refsByRepo.size) return null;
    for (const [repo, ref] of Object.entries(defaultSourceRefs)) {
      if (!exactRef(ref) || !refsByRepo.get(repo)?.has(ref)) return null;
      defaults[repo] = ref;
    }
  }
  return {
    version: 1, basis: value.basis,
    discovery: { status: "scanned", enumerationComplete: true, repos,
      ...(rateLimit && { rateLimit: { retryAtMs: rateLimit.retryAtMs as number, primary: rateLimit.primary as boolean } }),
      ...(defaultSourceRefs !== undefined && { defaultSourceRefs: defaults }) },
  };
}

export function captureAutomaticRepoGradeSnapshot(basis: string, discovery: RepoGradeDiscovery) {
  const snapshot = restoreAutomaticRepoGradeSnapshot({ version: 1, basis, discovery: discovery.status === "scanned"
    && discovery.rateLimit ? {
      ...discovery, rateLimit: { ...discovery.rateLimit, retryAtMs: discovery.rateLimit.retryAtMs ?? Date.now() + 60_000 },
    } : discovery });
  return snapshot && Buffer.byteLength(JSON.stringify(snapshot), "utf8") <= MAX_SNAPSHOT_BYTES ? snapshot : null;
}
