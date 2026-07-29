/**
 * Fetches a Canvas submission's linked GitHub repository so grading reads the
 * actual CODE, not the URL string (defect: canvasWorkToEntry used to note the
 * link in `content` and stop there - see the comment this file's caller,
 * extraction.ts, used to carry: "Grading never fetches or runs this URL's
 * contents - that happens only on demand from the drafted grades page").
 *
 * Reuses the exact same repo-reading primitives the drafted-grades "Load
 * code" button already uses (src/app/actions/submission-repo.ts): the pure
 * URL/selection/byte-budget helpers from src/lib/submission-repo.ts, and the
 * getRepo/getRepoTree/getFileText/listCommits GitHub client functions from
 * src/lib/github (the same ones grade-repo and github-content.ts call) -
 * rather than a new fetch path. The orchestration here is new because the
 * output shape is different (one flattened text blob for the grader, not a
 * per-file list for an editor), but every network/parsing primitive it calls
 * already existed and was already tested.
 */

import { getRepo, getRepoTree, getFileText, listCommits } from "../github";
import {
  parseSubmissionGithubUrl,
  selectSubmissionRepoFiles,
  clampFileBytes,
  applyTotalByteBudget,
  type SubmissionRepoFile,
} from "../submission-repo";

export interface GradableRepoContent {
  /** "owner/repo". */
  repo: string;
  /** The resolved commit sha (or branch/tag name when the commit lookup failed). */
  ref: string;
  /** Every selected file flattened into one text blob, ready to hand to a grader. */
  content: string;
  fileCount: number;
  truncated: boolean;
}

export type GradableRepoResult = GradableRepoContent | { error: string };

/**
 * Fetch and flatten a submitted GitHub repo's source into one text blob.
 * Never throws: every failure mode (not a GitHub URL, repo not found/private,
 * unreadable tree, no recognized source files, a GitHub API error) returns
 * `{ error }` instead, so a bad or inaccessible link degrades the caller to
 * text-only grading (AC2.3) rather than aborting a grading run.
 */
export async function fetchGradableRepoContent(submissionUrl: string): Promise<GradableRepoResult> {
  const parsed = parseSubmissionGithubUrl(submissionUrl);
  if ("error" in parsed) return parsed;
  const { owner, repo, ref: requestedRef, subpath } = parsed;

  let defaultBranch: string;
  try {
    defaultBranch = (await getRepo(owner, repo)).defaultBranch;
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/404/.test(message)) {
      return {
        error: `could not find "${owner}/${repo}" on GitHub (private, deleted, or the configured GITHUB_TOKEN lacks access)`,
      };
    }
    return { error: `could not reach "${owner}/${repo}" on GitHub${message ? `: ${message}` : ""}` };
  }

  const wantedRef = requestedRef || defaultBranch;

  // Resolve to the exact commit sha so the tree and every file read pin to
  // the same snapshot, and so the caller can record precisely what it graded
  // (AC2.4) even if the branch moves mid-fetch.
  let resolvedRef = wantedRef;
  try {
    const commits = await listCommits(owner, repo, wantedRef, 1);
    if (commits[0]?.sha) resolvedRef = commits[0].sha;
  } catch {
    // Fall through with the branch/tag name itself - still a valid ref.
  }

  let tree;
  try {
    tree = await getRepoTree(owner, repo, resolvedRef);
  } catch (err) {
    return {
      error: `could not read the file tree for "${owner}/${repo}" at "${resolvedRef}"${err instanceof Error ? `: ${err.message}` : ""}`,
    };
  }

  const { selected, truncated: selectionTruncated } = selectSubmissionRepoFiles(tree, subpath);
  if (selected.length === 0) {
    return {
      error: subpath
        ? `no recognized source files were found under "${subpath}" in "${owner}/${repo}"`
        : `no recognized source files were found in "${owner}/${repo}"`,
    };
  }

  const fetched: SubmissionRepoFile[] = [];
  let perFileTruncated = false;
  for (const entry of selected) {
    let text: string;
    try {
      text = await getFileText(owner, repo, entry.path, resolvedRef);
    } catch {
      // Skip a file that cannot be read rather than failing the whole pull.
      continue;
    }
    const clamped = clampFileBytes(text);
    if (clamped.truncated) perFileTruncated = true;
    fetched.push({ path: entry.path, text: clamped.text });
  }

  if (fetched.length === 0) {
    return { error: `could not read any files from "${owner}/${repo}" (they may all be unreadable or too large)` };
  }

  const budgeted = applyTotalByteBudget(fetched);
  const content = budgeted.files.map((f) => `File: ${f.path}\n\n${f.text}`).join("\n\n---\n\n");

  return {
    repo: `${owner}/${repo}`,
    ref: resolvedRef,
    content,
    fileCount: budgeted.files.length,
    truncated: selectionTruncated || perFileTruncated || budgeted.truncated,
  };
}
