import "server-only";

import { mapWithConcurrency } from "@/app/actions/shared";
import { encodeRefSegment, normalizeTargetBranch, validateGithubOwnerRepo } from "@/lib/github-ref-name";
import { isGithubCommitSha } from "@/lib/github.repos";
import { assignmentFolderPathsFromTree } from "@/lib/repo-assignment-folder-paths";
import { DEFAULT_TREE_SCAN_CONCURRENCY } from "@/lib/repo-grade-tree-scan";
import { createDiscoveryTransport, DiscoveryTransportError, type DiscoveryTransportFailure } from "./discovery-transport";

type DiscoveryFailure = DiscoveryTransportFailure | "source-set-too-large" | "invalid-scope" | "invalid-source";
type DiscoveryRequest = ReturnType<typeof createDiscoveryTransport>;
type DiscoveryRepo = { owner: string; name: string; fullName: string; defaultBranch: string };

const MAX_DISCOVERY_SOURCE_ROWS = 4_000;
const MAX_ORG_PAGES = 10;
const ORG_PAGE_SIZE = 100;

export type RepoGradeSourceRow =
  | { status: "ready"; repo: string; sourceRef: string; sourceCommit: string; folders: string[] }
  | { status: "partial"; repo: string; sourceRef: string; sourceCommit: string; reason: "tree-truncated" }
  | { status: "blocked"; repo: string; sourceRef: string; sourceCommit?: string; reason: DiscoveryFailure };

export type RepoGradeDiscovery =
  | { status: "not-configured" }
  | { status: "blocked"; reason: DiscoveryFailure | "branch-aware-discovery-disabled" }
  | { status: "scanned"; enumerationComplete: boolean; repos: RepoGradeSourceRow[] };

function classifyFailure(error: unknown): DiscoveryFailure {
  return error instanceof DiscoveryTransportError ? error.reason : "unavailable";
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readRepo(value: unknown, organization: string): DiscoveryRepo | undefined {
  const repo = record(value);
  if (!repo) return;
  const { name, full_name: fullName, default_branch: defaultBranch } = repo;
  const owner = record(repo.owner)?.login;
  if (typeof owner !== "string" || typeof name !== "string" || !validateGithubOwnerRepo(owner, name)
    || owner.toLowerCase() !== organization.toLowerCase() || fullName !== `${owner}/${name}`
    || (defaultBranch !== undefined && typeof defaultBranch !== "string")) return;
  return { owner, name, fullName, defaultBranch: defaultBranch ?? "" };
}

async function readOrganization(request: DiscoveryRequest, organization: string, prefix?: string) {
  const repos: DiscoveryRepo[] = [];
  const seen = new Set<string>();
  const needle = prefix?.trim().toLowerCase();
  let malformed = false;
  for (let page = 1; page <= MAX_ORG_PAGES; page += 1) {
    const count = await request.getJson(`/orgs/${organization}/repos?per_page=${ORG_PAGE_SIZE}&sort=full_name&page=${page}`, (data) => {
      if (!Array.isArray(data) || data.length > ORG_PAGE_SIZE) throw new DiscoveryTransportError("unavailable");
      for (const value of data) {
        const repo = readRepo(value, organization);
        const key = repo?.fullName.toLowerCase();
        if (!repo || !key || seen.has(key)) {
          malformed = true;
          continue;
        }
        seen.add(key);
        if (!needle || repo.name.toLowerCase().startsWith(needle)) repos.push(repo);
      }
      return data.length;
    });
    if (count < ORG_PAGE_SIZE) return { repos, complete: !malformed };
  }
  return { repos, complete: false };
}

function requireSha(value: unknown): string {
  if (!isGithubCommitSha(value)) throw new DiscoveryTransportError("unavailable");
  return value.toLowerCase();
}

function readFolders(value: unknown, treeSha: string, includesFolder: (folder: string) => boolean): string[] | null {
  const tree = record(value);
  if (!tree || requireSha(tree.sha) !== treeSha || !Array.isArray(tree.tree) || typeof tree.truncated !== "boolean") {
    throw new DiscoveryTransportError("unavailable");
  }
  if (tree.truncated) return null;
  const paths: string[] = [];
  for (const value of tree.tree) {
    const entry = record(value);
    if (!entry || typeof entry.path !== "string" || !entry.path) return null;
    if (entry.type === "tree") paths.push(`${entry.path}/`);
    else if (entry.type === "blob" && typeof entry.size === "number" && Number.isSafeInteger(entry.size) && entry.size >= 0) {
      paths.push(entry.path);
    } else return null;
  }
  return assignmentFolderPathsFromTree(paths).filter(includesFolder);
}

async function readSource(
  { owner, name, fullName: repo }: DiscoveryRepo,
  sourceRef: string,
  includesFolder: (folder: string) => boolean,
  request: DiscoveryRequest,
): Promise<RepoGradeSourceRow> {
  if (!sourceRef) return { status: "blocked", repo, sourceRef, reason: "invalid-source" };
  let sourceCommit: string | undefined;
  try {
    const base = `/repos/${owner}/${name}` as const;
    sourceCommit = await request.getJson(`${base}/commits/${encodeRefSegment(sourceRef)}`, (value) => requireSha(record(value)?.sha));
    const treeSha = await request.getJson(`${base}/git/commits/${sourceCommit}`, (value) => {
      const commit = record(value);
      if (requireSha(commit?.sha) !== sourceCommit) throw new DiscoveryTransportError("unavailable");
      return requireSha(record(commit?.tree)?.sha);
    });
    const folders = await request.getJson(`${base}/git/trees/${treeSha}?recursive=1`, (value) => readFolders(value, treeSha, includesFolder));
    if (!folders) return { status: "partial", repo, sourceRef, sourceCommit, reason: "tree-truncated" };
    return { status: "ready", repo, sourceRef, sourceCommit, folders };
  } catch (error) {
    return { status: "blocked", repo, sourceRef, sourceCommit, reason: classifyFailure(error) };
  }
}

/** Pass only an owned course's server-resolved scope and saved folder refs. */
export async function discoverRepoGradeSources(scope: {
  organization: string | null;
  prefix?: string;
  sourceRef?: string;
  folderSources?: ReadonlyMap<string, string | null>;
}): Promise<RepoGradeDiscovery> {
  const organization = scope.organization?.trim();
  if (!organization) return { status: "not-configured" };
  if (!validateGithubOwnerRepo(organization, "repo")) return { status: "blocked", reason: "invalid-scope" };
  const override = normalizeTargetBranch(scope.sourceRef ?? "");
  if (!override.ok) return { status: "blocked", reason: "invalid-source" };

  const configuredRefs = new Set<string>();
  for (const ref of scope.folderSources?.values() ?? []) {
    if (ref === null) continue;
    const normalized = normalizeTargetBranch(ref);
    if (!normalized.ok || !ref || normalized.branch !== ref) return { status: "blocked", reason: "invalid-source" };
    configuredRefs.add(ref);
  }

  const request = createDiscoveryTransport();
  try {
    const listing = await readOrganization(request, organization, scope.prefix);
    if (listing.repos.length * (configuredRefs.size + 1) > MAX_DISCOVERY_SOURCE_ROWS) {
      return { status: "blocked", reason: "source-set-too-large" };
    }
    const repos = await mapWithConcurrency(listing.repos, DEFAULT_TREE_SCAN_CONCURRENCY, async (item): Promise<RepoGradeSourceRow[]> => {
      const fallback = normalizeTargetBranch(override.branch || item.defaultBranch);
      const fallbackRef = fallback.ok ? fallback.branch : "";
      const rows: RepoGradeSourceRow[] = [];
      // Scan refs within a repo sequentially to preserve the existing request
      // concurrency bound. Folder overrides are exact and never fall back.
      for (const ref of new Set([fallbackRef, ...configuredRefs])) {
        rows.push(await readSource(item, ref, (folder) => (scope.folderSources?.get(folder) ?? fallbackRef) === ref, request));
      }
      return rows;
    });
    return { status: "scanned", enumerationComplete: listing.complete, repos: repos.flat() };
  } catch (error) {
    return { status: "blocked", reason: classifyFailure(error) };
  } finally {
    request.dispose();
  }
}
