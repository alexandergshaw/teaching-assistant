import "server-only";

import { mapWithConcurrency } from "@/app/actions/shared";
import { asGithubHttpError } from "@/lib/github-http-error";
import { classifyGithubFailure } from "@/lib/github-rate-limit";
import { normalizeTargetBranch, validateGithubOwnerRepo } from "@/lib/github-ref-name";
import {
  getRepoCommitTree,
  listOrgReposWithCoverage,
  resolveRepoSourceCommit,
  type GithubRepo,
  type GithubRepoRequestOptions,
} from "@/lib/github.repos";
import { assignmentFolderPathsFromTree } from "@/lib/repo-assignment-folder-paths";
import { DEFAULT_TREE_SCAN_CONCURRENCY } from "@/lib/repo-grade-tree-scan";

type DiscoveryStop = "rate-limited" | "request-budget-exhausted" | "deadline-exceeded";
type DiscoveryFailure = DiscoveryStop | "source-set-too-large" | "invalid-scope" | "invalid-source" | "access-denied" | "unavailable";

// A source needs up to three GitHub requests. Include enumeration in the
// shared request budget and bound both wall time and skipped-row materialization.
const MAX_DISCOVERY_REQUESTS = 300;
const DISCOVERY_DEADLINE_MS = 40_000;
const MAX_DISCOVERY_SOURCE_ROWS = 4_000;

class StoppedDiscovery extends Error {
  constructor(readonly reason: DiscoveryStop) {
    super(reason);
  }
}

export type RepoGradeSourceRow =
  | { status: "ready"; repo: string; sourceRef: string; sourceCommit: string; folders: string[] }
  | { status: "partial"; repo: string; sourceRef: string; sourceCommit: string; reason: "tree-truncated" }
  | { status: "blocked"; repo: string; sourceRef: string; sourceCommit?: string; reason: DiscoveryFailure };

export type RepoGradeDiscovery =
  | { status: "not-configured" }
  | { status: "blocked"; reason: DiscoveryFailure | "branch-aware-discovery-disabled" }
  | { status: "scanned"; enumerationComplete: boolean; repos: RepoGradeSourceRow[] };

function classifyFailure(error: unknown, signal: AbortSignal): DiscoveryFailure {
  if (error instanceof StoppedDiscovery) return error.reason;
  const http = asGithubHttpError(error);
  if (!http) return signal.aborted ? "deadline-exceeded" : "unavailable";
  const verdict = classifyGithubFailure(http.status, http.headers, Date.now());
  if (http.status === 429 || verdict.kind === "rate-limited"
    || (http.status === 403 && (http.headers.get("retry-after") !== null || /secondary rate limit/i.test(http.message)))) {
    return "rate-limited";
  }
  if (http.status === 401 || verdict.kind === "forbidden") return "access-denied";
  return "unavailable";
}

async function readSource(
  { owner, name, fullName: repo }: GithubRepo,
  sourceRef: string,
  includesFolder: (folder: string) => boolean,
  request: GithubRepoRequestOptions & { signal: AbortSignal },
): Promise<RepoGradeSourceRow> {
  if (!sourceRef) return { status: "blocked", repo, sourceRef, reason: "invalid-source" };
  let sourceCommit: string | undefined;
  try {
    sourceCommit = await resolveRepoSourceCommit(owner, name, sourceRef, request);
    const tree = await getRepoCommitTree(owner, name, sourceCommit, request);
    if (tree.truncated) return { status: "partial", repo, sourceRef, sourceCommit, reason: "tree-truncated" };
    const paths = tree.entries.map(({ path, type }) => type === "tree" ? `${path}/` : path);
    const folders = assignmentFolderPathsFromTree(paths).filter(includesFolder);
    return { status: "ready", repo, sourceRef, sourceCommit, folders };
  } catch (error) {
    return { status: "blocked", repo, sourceRef, sourceCommit, reason: classifyFailure(error, request.signal) };
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

  const signal = AbortSignal.timeout(DISCOVERY_DEADLINE_MS);
  let rateLimited = false;
  let remainingRequests = MAX_DISCOVERY_REQUESTS;
  const request = {
    signal,
    beforeRequest() {
      if (rateLimited) throw new StoppedDiscovery("rate-limited");
      if (signal.aborted) throw new StoppedDiscovery("deadline-exceeded");
      if (remainingRequests === 0) throw new StoppedDiscovery("request-budget-exhausted");
      remainingRequests -= 1;
    },
    observeResponse({ status, headers }: Response) {
      if (status === 429 || headers.get("x-ratelimit-remaining") === "0"
        || (status === 403 && headers.has("retry-after"))) rateLimited = true;
    },
  };

  try {
    const listing = await listOrgReposWithCoverage(organization, scope.prefix, request);
    if (listing.repos.length * (configuredRefs.size + 1) > MAX_DISCOVERY_SOURCE_ROWS) {
      return { status: "blocked", reason: "source-set-too-large" };
    }
    const repos = await mapWithConcurrency(listing.repos, DEFAULT_TREE_SCAN_CONCURRENCY, async (item): Promise<RepoGradeSourceRow[]> => {
      const { owner, name, fullName: repo, defaultBranch } = item;
      const fallback = normalizeTargetBranch(override.branch || (typeof defaultBranch === "string" ? defaultBranch : ""));
      const fallbackRef = fallback.ok ? fallback.branch : "";
      if (!validateGithubOwnerRepo(owner, name) || owner.toLowerCase() !== organization.toLowerCase() || repo !== `${owner}/${name}`) {
        return [{ status: "blocked", repo, sourceRef: fallbackRef, reason: "invalid-scope" }];
      }
      const rows: RepoGradeSourceRow[] = [];
      // Scan refs within a repo sequentially to preserve the existing request
      // concurrency bound. Folder overrides are exact and never fall back.
      for (const ref of new Set([fallbackRef, ...configuredRefs])) {
        const row = await readSource(item, ref, (folder) => (scope.folderSources?.get(folder) ?? fallbackRef) === ref, request);
        if (row.status === "blocked" && row.reason === "rate-limited") rateLimited = true;
        rows.push(row);
      }
      return rows;
    });
    return { status: "scanned", enumerationComplete: listing.complete, repos: repos.flat() };
  } catch (error) {
    return { status: "blocked", reason: classifyFailure(error, signal) };
  }
}
