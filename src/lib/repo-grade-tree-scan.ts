// Repo Grades view - AC3 (docs/repo-grades-view-acceptance-criteria.md, items
// 12, 17, 18): the pure orchestration behind loadOrgRepoTreesAction
// (src/app/actions/repo-grades.ts).
//
// A "use server" module may export only async functions - no types, no
// consts, no re-exports (src/lib/use-server-exports.test.ts guards this, and
// `next build` is the only gate that actually enforces it). That rules out
// putting the decision logic below directly in the action file: it needs to
// be exported (so this test file can import it) and it is not itself an
// async server call, so it has to live in a plain module. This file is that
// module - the action supplies REAL fetchers (listOrgRepos, getRepoTree);
// this file, and its test, supply FAKE ones. This mirrors
// src/lib/announcement-drafting.ts:41, which injects its `draft` callback for
// exactly the same reason.
//
// What lives here, and why each piece is a separate small function rather
// than one big one:
//   - classifyScanFailure: turns one caught failure into a verdict, via two
//     paths tried in order of how much evidence each actually has.
//
//     PREFERRED - the structured error. ghFetch (src/lib/github.repos.ts:36)
//     throws a GithubHttpError carrying the real status AND the real response
//     headers, so classifyGithubFailure gets exactly what it was built to
//     read. This is what lets a 403 with `x-ratelimit-remaining: 0` be called
//     what it is (a primary-quota rate limit, with a reset time) instead of
//     collapsing into the same "forbidden" bucket as a token missing a scope.
//
//     FALLBACK - parseGithubErrorStatus. Not every failure that reaches these
//     catch blocks came from ghFetch, and one that did not has no status
//     field to read. Every ghError branch happens to embed the numeric status
//     in its message text ("... (403)", "... (HTTP 429)" - github.repos.ts:12-24),
//     so the status is still recoverable by parsing when the structured error
//     is absent. That path has no headers at all, so it classifies with
//     EMPTY_GITHUB_HEADERS and lands exactly where this module landed before
//     the structured error existed: a 429 is still correctly rate-limited
//     from its status code alone, while a bare 403 honestly falls to
//     "forbidden" rather than guessing "rate-limited" without evidence.
//
//     Keeping the fallback is not redundancy for its own sake - it is what
//     makes the preferred path safe to add. The existing tests in this file's
//     suite throw plain Errors with ghError-shaped messages, so they exercise
//     the fallback; they pass unmodified, which is the evidence that a
//     non-ghFetch failure (a network error with no status at all) still
//     degrades the way it always did instead of becoming an exception.
//   - computeOrgReposTruncated: AC3 item 18's "exactly the cap" check, kept as
//     its own function so the magic number 1000 (LIST_ORG_REPOS_CAP, matching
//     the 10-page x 100-per-page loop at src/lib/github.repos.ts:131) has one
//     home and one test.
//   - pickOverallVerdict: turns the per-repo GithubLimitVerdicts collected
//     during the scan into the single "overall" verdict the action returns,
//     preferring "rate-limited" (a global condition worth one banner rather
//     than N identical per-row messages) over "forbidden" over nothing.
//   - scanOrgRepoTrees: the actual orchestration - enumerate, bound
//     concurrency, isolate per-repo failures, derive folders, assemble the
//     result. This is the function the sabotage-check log at the bottom of
//     this file's test exercises for per-repo isolation and the concurrency
//     bound actually bounding.

import { DEFAULT_IGNORED_REPO_FOLDERS } from "@/lib/repo-assignment-folders";
import { assignmentFolderPathsFromTree } from "@/lib/repo-assignment-folder-paths";
import { classifyGithubFailure, type GithubLimitVerdict } from "@/lib/github-rate-limit";
import { asGithubHttpError, EMPTY_GITHUB_HEADERS } from "@/lib/github-http-error";
import { mapWithConcurrency } from "@/app/actions/shared";
import type { GithubRepo } from "@/lib/github";

/** listOrgRepos's own silent cap (src/lib/github.repos.ts:131): 10 pages of
 * 100 repos each. When the array it returns is exactly this long, the org
 * may hold more repos than were actually listed. */
const LIST_ORG_REPOS_CAP = 1000;

/** Recovers the HTTP status ghFetch's thrown Error embedded in its message
 * text (see the module header). Every branch of ghError
 * (src/lib/github.repos.ts:12-24) puts the numeric status in parentheses,
 * either bare ("(403)") or after "HTTP " ("(HTTP 429)") - this regex matches
 * both shapes. Returns null for any message that does not contain that
 * pattern (a non-GitHub error, e.g. a network failure with no status at
 * all), so a caller can fall back to the raw message instead of pretending a
 * status is known when it is not.
 */
export function parseGithubErrorStatus(message: string): number | null {
  const match = message.match(/\((?:HTTP\s+)?(\d{3})\)/);
  if (!match) return null;
  const status = Number(match[1]);
  return Number.isFinite(status) ? status : null;
}

/** AC3 item 18: true only when `repoCount` lands exactly on listOrgRepos's
 * own silent cap - the one situation where "the org has no more repos than
 * this" cannot be told apart from "the org has more, and they were dropped".
 * Any other count (including one just short of the cap) is not evidence of
 * truncation. */
export function computeOrgReposTruncated(repoCount: number, cap: number = LIST_ORG_REPOS_CAP): boolean {
  return repoCount === cap;
}

/** Reduces every per-repo failure verdict collected during a scan to the one
 * "overall" verdict the action surfaces, preferring the more actionable kind:
 * a rate limit is a condition affecting the whole scan (worth one banner)
 * over a per-repo forbidden (which might genuinely differ repo to repo, e.g.
 * per-repository visibility), and either is more useful to surface than
 * nothing. Returns null when there were no failures, or every failure was
 * "other" (no rate-limit-relevant information to promote to the top level -
 * each row's own error string already carries that detail). */
export function pickOverallVerdict(verdicts: readonly GithubLimitVerdict[]): GithubLimitVerdict | null {
  return verdicts.find((v) => v.kind === "rate-limited") ?? verdicts.find((v) => v.kind === "forbidden") ?? null;
}

/** GitHub's own guidance is to avoid firing many requests at once against the
 * same API - beyond avoiding the primary hourly quota, a high burst of
 * concurrent requests to the same endpoint shape is exactly what trips
 * GitHub's secondary/abuse-detection rate limiting (the 429s this module
 * classifies), which the OLD unbounded-Promise.all code at
 * checkStudentActivityAction (src/app/actions/github.ts:487-500) never had
 * to consider because it fires only one commit-listing call per repo, not a
 * heavier tree fetch. 5 is small enough to stay well clear of that secondary
 * limit for a course's worth of repos (tens, not thousands) while still being
 * meaningfully faster than sequential - and small enough that even a slow
 * GitHub response for one repo cannot dominate this server action's wall
 * clock, which matters because this deployment runs on Vercel Hobby with a
 * 60-second function duration cap (see AGENTS memory: deployment-vercel-hobby).
 */
export const DEFAULT_TREE_SCAN_CONCURRENCY = 5;

export interface RepoFolderRow {
  /** The repo's "owner/name" full name, exactly as listOrgRepos returned it. */
  repo: string;
  htmlUrl: string;
  /** This repo's assignment folders (AC3 items 13-14), or null when this
   * repo's tree fetch failed - never both. */
  folders: string[] | null;
  /** Set only when `folders` is null (AC3 item 17c: this repo's failure never
   * blocks any other repo's row from succeeding). */
  error: string | null;
}

export interface OrgRepoTreesResult {
  repos: RepoFolderRow[];
  /** AC3 item 18: true when listOrgRepos's returned count landed exactly on
   * its own silent cap, meaning the org may hold repos this scan never saw. */
  truncated: boolean;
  /** The single most useful rate-limit/forbidden verdict observed across every
   * repo's failure this scan, or null when nothing failed in a way worth
   * promoting to a scan-wide banner. Per-row detail still lives on each row's
   * own `error` string regardless of this field. */
  rateLimit: GithubLimitVerdict | null;
}

/** The two GitHub calls scanOrgRepoTrees needs, injected so tests can supply
 * fakes instead of a real network. `listRepos` mirrors listOrgRepos's own
 * signature and return shape (src/lib/github.repos.ts:128); `fetchTreePaths`
 * mirrors getRepoTree (src/lib/github.files.ts:17) collapsed to just the path
 * list assignmentFoldersFromTree needs, so a fake never has to fabricate a
 * full RepoTreeEntry. */
export interface OrgRepoTreeFetchers {
  listRepos: (org: string, prefix?: string) => Promise<Pick<GithubRepo, "fullName" | "htmlUrl">[]>;
  fetchTreePaths: (fullName: string) => Promise<string[]>;
}

export interface ScanOrgRepoTreesOptions {
  concurrency?: number;
  ignore?: ReadonlySet<string>;
  /** Defaults to Date.now, called ONCE at the start of the scan so every
   * per-repo rate-limit message in one scan reports relative to the same
   * "now", rather than drifting across a long-running scan. */
  now?: () => number;
}

function describeNonGithubError(err: unknown): string {
  return err instanceof Error ? err.message : "Could not read this repository's file tree.";
}

/**
 * Classifies one caught scan failure, or returns null when the failure
 * carries no HTTP status by either route (a network error, an aborted
 * request, a thrown non-Error) and the caller should surface the raw message
 * instead of inventing a verdict. See the module header for why there are two
 * routes and why the weaker one is kept.
 */
function classifyScanFailure(err: unknown, nowMs: number): GithubLimitVerdict | null {
  const structured = asGithubHttpError(err);
  if (structured) {
    return classifyGithubFailure(structured.status, structured.headers, nowMs);
  }
  const status = parseGithubErrorStatus(describeNonGithubError(err));
  return status !== null ? classifyGithubFailure(status, EMPTY_GITHUB_HEADERS, nowMs) : null;
}

/**
 * Enumerates an org's repos and fetches ONE tree per repo (AC3 item 12),
 * deriving each repo's assignment folders. Bounds concurrency (AC3 item 17a),
 * isolates one repo's failure from every other repo's row (AC3 item 17c),
 * classifies failures so a throttle is never reported as a permissions
 * problem (AC3 item 17b), and flags when listOrgRepos's own silent cap was
 * hit (AC3 item 18). Never throws - the org-level listRepos call is the only
 * thing that can fail the whole scan, and that failure is returned as
 * `{ error }` rather than propagated.
 */
export async function scanOrgRepoTrees(
  org: string,
  prefix: string | undefined,
  repoLimit: number | undefined,
  fetchers: OrgRepoTreeFetchers,
  options: ScanOrgRepoTreesOptions = {}
): Promise<OrgRepoTreesResult | { error: string }> {
  const nowMs = (options.now ?? Date.now)();
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_TREE_SCAN_CONCURRENCY);
  const ignore = options.ignore ?? DEFAULT_IGNORED_REPO_FOLDERS;

  let allRepos: Pick<GithubRepo, "fullName" | "htmlUrl">[];
  try {
    allRepos = await fetchers.listRepos(org, prefix);
  } catch (err) {
    const verdict = classifyScanFailure(err, nowMs);
    return { error: verdict ? verdict.message : describeNonGithubError(err) };
  }

  const truncated = computeOrgReposTruncated(allRepos.length);
  const scanned = repoLimit !== undefined && repoLimit > 0 ? allRepos.slice(0, repoLimit) : allRepos;

  const verdicts: GithubLimitVerdict[] = [];

  const rows = await mapWithConcurrency(scanned, concurrency, async (repo): Promise<RepoFolderRow> => {
    try {
      const paths = await fetchers.fetchTreePaths(repo.fullName);
      return { repo: repo.fullName, htmlUrl: repo.htmlUrl, folders: assignmentFolderPathsFromTree(paths, ignore), error: null };
    } catch (err) {
      const verdict = classifyScanFailure(err, nowMs);
      if (verdict) {
        verdicts.push(verdict);
        return { repo: repo.fullName, htmlUrl: repo.htmlUrl, folders: null, error: verdict.message };
      }
      return { repo: repo.fullName, htmlUrl: repo.htmlUrl, folders: null, error: describeNonGithubError(err) };
    }
  });

  return { repos: rows, truncated, rateLimit: pickOverallVerdict(verdicts) };
}
