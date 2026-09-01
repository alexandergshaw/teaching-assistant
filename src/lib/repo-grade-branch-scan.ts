// docs/no-submission-and-requirement-checking-acceptance-criteria.md section 3
// (G3): when the graded ref of a repo has no submission, check the repo's
// OTHER branches for the same scoped folder before reporting a confident
// "nothing submitted" - the most common innocent cause of a missing
// submission is that the work landed on a branch that was never merged.
//
// Same shape as scanOrgRepoTrees (repo-grade-tree-scan.ts), axis changed
// from repos-in-an-org to branches-of-one-repo: injected fetchers so this
// stays network-free and unit-testable, the SAME DEFAULT_TREE_SCAN_CONCURRENCY
// constant (imported, not redeclared - one bound, one home), and the same
// two-path failure classification that module uses (classifyGithubFailure
// over the preferred GithubHttpError-with-headers path, with
// parseGithubErrorStatus - imported from that same module, not copied - as
// the message-parsed fallback for a failure that carries no structured
// status).
//
// G3a: this module is called ONLY from gradeRepoAction's no-submission
// branch (github-repos.ts) - never for a repo that actually submitted
// something. That bound is what keeps the cost affordable across a roster.
//
// G3b/G3c: cost is listBranches (2 GitHub calls: getRepo + one branches
// page - see github.repos.ts:155-165) plus one tree fetch per OTHER branch
// checked, capped at MAX_BRANCHES_SCANNED - "branches + 2" total, matching
// the doc's own estimate. Branches beyond the cap are never fetched, and the
// count skipped is always returned (never silently dropped) so a caller
// cannot mistake a capped scan for an exhaustive one. listBranches itself
// caps at 200 and discards each branch's head SHA, so this scan has no free
// way to dedupe two branch names that happen to point at the same commit -
// recorded as a limitation, not fixed here.
//
// G3d: four situations must never collapse into "checked, found nothing":
// a branch (or the whole repo) that 404s, a 409 "empty repository" response,
// a branch whose tree listing was truncated (GitHub's own recursive-listing
// cap - a matching file could exist past the cutoff), and a rate-limit
// refusal. Every one of those becomes `{ kind: "undetermined" }`, distinct
// from `{ kind: "not-found" }` (checked cleanly, genuinely nothing there).
// A branch that reports a POSITIVE finding despite a truncated listing is
// still trusted - the file that was seen really exists - only an empty-
// looking truncated result is downgraded to undetermined.
//
// G3e: the branch actually graded is established explicitly as
// `explicitBranch || listed.defaultBranch`, mirroring ingestRepo's own
// `ref || info.defaultBranch` resolution (github.digest.ts:275) - never read
// off GradeResult.gradedRef, which repoDigestToEmbeddedEntry leaves
// undefined on this path (both copies do - see that field's own doc comment
// in grade/types.ts). Resolved from THIS scan's own listBranches call, so no
// second GitHub call is spent just to learn the default branch.

import { classifyGithubFailure, type GithubLimitVerdict } from "@/lib/github-rate-limit";
import { asGithubHttpError, EMPTY_GITHUB_HEADERS } from "@/lib/github-http-error";
import { mapWithConcurrency } from "@/app/actions/shared";
import { DEFAULT_TREE_SCAN_CONCURRENCY, parseGithubErrorStatus } from "@/lib/repo-grade-tree-scan";
import { isScaffoldingFile, type RepoTreeEntry } from "@/lib/github";

/** Cap on how many of a repo's OTHER branches this scan will fetch a tree
 * for. Bounds the GitHub calls this costs (G3c) against a repo with many
 * stale branches - a real course repo realistically has a handful of
 * branches, not hundreds, so this cap is rarely the reason a branch goes
 * unchecked, but it must exist and be reported when it is (see
 * `branchesSkipped` on BranchScanResult), rather than silently reading as
 * "checked everywhere". */
export const MAX_BRANCHES_SCANNED = 10;

/** A basename-only, case-insensitive match for "this is a README", mirroring
 * the exact rule pickReadmeInstructions (repo-readme-instructions.ts:62-64)
 * uses to find candidate instruction files. Reused rather than reinvented: a
 * README-named file on another branch is, on the same reasoning that module
 * already applies, overwhelmingly the assignment's own instructions file,
 * not student work - and this scan has no budget to fetch and content-match
 * every candidate branch's README the way excludeInstructionsFromDigest does
 * on the graded branch (G3c: no content fetches here, tree paths only, so
 * this is a best-effort basename heuristic, not the exact-content match the
 * graded branch gets - see this module's own limits in its caller). */
const README_BASENAME = /readme/i;

/** True when `path` is evidence of real student work under `normalizedPrefix`
 * - not scaffolding (.gitkeep, via the SAME isScaffoldingFile the graded
 * branch's own no-submission rule uses - github.digest.ts), not a
 * README-shaped file (see README_BASENAME above), and inside the scoped
 * folder when one was given. */
function isCandidateSubmissionPath(path: string, normalizedPrefix: string): boolean {
  if (normalizedPrefix && !path.toLowerCase().startsWith(normalizedPrefix)) return false;
  if (isScaffoldingFile(path)) return false;
  const base = path.split("/").pop() ?? path;
  return !README_BASENAME.test(base);
}

/** Mirrors selectDigestFiles's own prefix normalisation (github.digest.ts) -
 * case-insensitive, trailing slash enforced so "week1" cannot match
 * "week10". Not imported from there: that function returns a full digest
 * selection (it fetches file content), and this scan only ever needs the
 * two-line prefix shape it computes internally. */
function normalizePrefix(pathPrefix?: string): string {
  if (!pathPrefix) return "";
  return (pathPrefix.endsWith("/") ? pathPrefix : `${pathPrefix}/`).toLowerCase();
}

function describeNonGithubError(err: unknown): string {
  return err instanceof Error ? err.message : "Could not read this branch's file tree.";
}

/** Same two-route classification repo-grade-tree-scan.ts's own
 * classifyScanFailure uses (see that module's header for the full
 * rationale) - PREFERRED: the structured GithubHttpError's real status and
 * headers. FALLBACK: parseGithubErrorStatus recovers the status from the
 * message text for a failure that carries no structured error at all. */
function classifyScanFailure(err: unknown, nowMs: number): GithubLimitVerdict | null {
  const structured = asGithubHttpError(err);
  if (structured) return classifyGithubFailure(structured.status, structured.headers, nowMs);
  const status = parseGithubErrorStatus(describeNonGithubError(err));
  return status !== null ? classifyGithubFailure(status, EMPTY_GITHUB_HEADERS, nowMs) : null;
}

export interface BranchTreeFetchResult {
  entries: Pick<RepoTreeEntry, "path" | "type">[];
  truncated: boolean;
}

/** The two GitHub calls this scan needs, injected so tests never touch the
 * network - mirrors OrgRepoTreeFetchers's own injection shape
 * (repo-grade-tree-scan.ts:154). `listBranches` matches listBranches's real
 * signature/return shape (github.repos.ts:155); `fetchTree` mirrors
 * getRepoTreeWithMeta (github.files.ts:32) narrowed to the fields this scan
 * actually reads. */
export interface BranchScanFetchers {
  listBranches: (owner: string, repo: string) => Promise<{ branches: string[]; defaultBranch: string }>;
  fetchTree: (owner: string, repo: string, branch: string) => Promise<BranchTreeFetchResult>;
}

export interface ScanBranchesForSubmissionOptions {
  concurrency?: number;
  maxBranches?: number;
  /** Defaults to Date.now, called ONCE at the start of the scan - mirrors
   * ScanOrgRepoTreesOptions.now (repo-grade-tree-scan.ts:165). */
  now?: () => number;
}

export type BranchScanResult =
  | {
      kind: "found";
      /** The other branch that holds real, non-scaffolding, non-README
       * content under the scoped folder. */
      branch: string;
      branchesChecked: number;
      branchesSkipped: number;
    }
  | {
      /** Every branch that could be checked (up to the cap) was read
       * cleanly, and none held anything beyond scaffolding/README under the
       * scoped folder. This is the outcome for a genuinely empty repo, and
       * for a repo whose other branches are all as empty as the graded one -
       * G3d's four could-not-determine states are never folded in here. */
      kind: "not-found";
      branchesChecked: number;
      branchesSkipped: number;
    }
  | {
      /** G3d: at least one branch that mattered (either the branch list
       * itself, or a branch's tree fetch) could not be read with confidence
       * - a 404, a 409 empty-repository response, a truncated tree with
       * nothing found on the visible portion, or a rate-limit refusal. The
       * honest statement here is "could not check", never "checked and
       * found nothing". */
      kind: "undetermined";
      reason: string;
      branchesChecked: number;
      branchesSkipped: number;
    };

type BranchCheckOutcome =
  | { kind: "found"; branch: string }
  | { kind: "clean"; branch: string }
  | { kind: "undetermined"; branch: string; message: string; verdict: GithubLimitVerdict | null };

async function checkOneBranch(
  owner: string,
  repo: string,
  branch: string,
  normalizedPrefix: string,
  fetchTree: BranchScanFetchers["fetchTree"],
  nowMs: number
): Promise<BranchCheckOutcome> {
  let result: BranchTreeFetchResult;
  try {
    result = await fetchTree(owner, repo, branch);
  } catch (err) {
    const verdict = classifyScanFailure(err, nowMs);
    return {
      kind: "undetermined",
      branch,
      message: verdict ? verdict.message : describeNonGithubError(err),
      verdict,
    };
  }
  const hasCandidate = result.entries.some(
    (e) => e.type === "blob" && isCandidateSubmissionPath(e.path, normalizedPrefix)
  );
  if (hasCandidate) return { kind: "found", branch };
  if (result.truncated) {
    // G3d: GitHub's own recursive listing was cut short. A POSITIVE finding
    // above is still trusted (the file that was seen really exists); an
    // ABSENCE is not - the folder could exist past the cutoff - so an
    // empty-looking truncated branch is undetermined, never "clean".
    return {
      kind: "undetermined",
      branch,
      message: `branch "${branch}"'s file listing was truncated by GitHub before it could be checked completely`,
      verdict: null,
    };
  }
  return { kind: "clean", branch };
}

/** Reduces every per-branch undetermined outcome to one reason string,
 * preferring the most actionable kind - mirrors pickOverallVerdict's own
 * preference order (repo-grade-tree-scan.ts:104): a confirmed rate limit
 * over a bare forbidden over whatever came first (including a truncated-tree
 * message, which carries no GithubLimitVerdict at all). Names how many
 * OTHER branches also could not be checked so the count is never silently
 * lost by only ever reporting one branch's detail. */
function combineUndetermined(outcomes: readonly Extract<BranchCheckOutcome, { kind: "undetermined" }>[]): string {
  const preferred =
    outcomes.find((o) => o.verdict?.kind === "rate-limited") ??
    outcomes.find((o) => o.verdict?.kind === "forbidden") ??
    outcomes[0];
  const extra = outcomes.length - 1;
  const suffix = extra > 0 ? ` (and ${extra} other branch${extra === 1 ? "" : "es"} could not be checked either)` : "";
  return `${preferred.message}${suffix}`;
}

/**
 * G3: when `gradeRepoAction` has already established that the graded ref
 * has nothing student-authored in `pathPrefix`, check the repo's OTHER
 * branches for the same folder before reporting a confident "nothing
 * submitted" - see the module header for cost, caps, and the four
 * could-not-determine states.
 *
 * The branch actually graded (`explicitBranch || listed.defaultBranch`) is
 * always excluded from the candidates checked, and is resolved from THIS
 * scan's own `listBranches` call - see G3e in the module header for why.
 * Never throws: every failure this function can encounter (an unreachable
 * repo, a single bad branch) resolves to `{ kind: "undetermined" }` rather
 * than propagating, matching scanOrgRepoTrees's own "never throws" contract.
 */
export async function scanBranchesForUnmergedSubmission(
  owner: string,
  repo: string,
  pathPrefix: string | undefined,
  explicitBranch: string | undefined,
  fetchers: BranchScanFetchers,
  options: ScanBranchesForSubmissionOptions = {}
): Promise<BranchScanResult> {
  const nowMs = (options.now ?? Date.now)();
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_TREE_SCAN_CONCURRENCY);
  const maxBranches = Math.max(0, options.maxBranches ?? MAX_BRANCHES_SCANNED);

  let listed: { branches: string[]; defaultBranch: string };
  try {
    listed = await fetchers.listBranches(owner, repo);
  } catch (err) {
    const verdict = classifyScanFailure(err, nowMs);
    return {
      kind: "undetermined",
      reason: verdict ? verdict.message : describeNonGithubError(err),
      branchesChecked: 0,
      branchesSkipped: 0,
    };
  }

  const gradedBranch = explicitBranch || listed.defaultBranch;
  const candidates = listed.branches.filter((b) => b !== gradedBranch);
  if (candidates.length === 0) {
    return { kind: "not-found", branchesChecked: 0, branchesSkipped: 0 };
  }

  const toCheck = candidates.slice(0, maxBranches);
  const branchesSkipped = candidates.length - toCheck.length;
  const normalizedPrefix = normalizePrefix(pathPrefix);

  const outcomes = await mapWithConcurrency(toCheck, concurrency, (branch) =>
    checkOneBranch(owner, repo, branch, normalizedPrefix, fetchers.fetchTree, nowMs)
  );

  const found = outcomes.find((o): o is Extract<BranchCheckOutcome, { kind: "found" }> => o.kind === "found");
  if (found) {
    return { kind: "found", branch: found.branch, branchesChecked: toCheck.length, branchesSkipped };
  }

  const undetermined = outcomes.filter(
    (o): o is Extract<BranchCheckOutcome, { kind: "undetermined" }> => o.kind === "undetermined"
  );
  if (undetermined.length > 0) {
    return {
      kind: "undetermined",
      reason: combineUndetermined(undetermined),
      branchesChecked: toCheck.length,
      branchesSkipped,
    };
  }

  return { kind: "not-found", branchesChecked: toCheck.length, branchesSkipped };
}
