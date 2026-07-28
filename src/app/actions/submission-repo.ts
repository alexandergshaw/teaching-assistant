"use server";

import { requireOwner } from "@/lib/supabase/auth";
import { getRepo, getRepoTree, getFileText, listCommits } from "@/lib/github";
import {
  parseSubmissionGithubUrl,
  selectSubmissionRepoFiles,
  clampFileBytes,
  applyTotalByteBudget,
  type SubmissionRepoFile,
} from "@/lib/submission-repo";

export type FetchSubmissionRepoResult =
  | { files: SubmissionRepoFile[]; ref: string; repo: string; truncated: boolean }
  | { error: string };

/**
 * Fetch a student's submitted GitHub repository on demand.
 *
 * This is called directly by the drafted grades page (DraftedGradesTab /
 * SubmissionCodePanel) - never by a grading workflow or step. Keeping the
 * fetch here, one level below any specific workflow, is what makes "load the
 * code" work the same way regardless of which grading path produced the
 * draft (LLM grading, the embedded deterministic engine, a single re-graded
 * submission, or any future workflow): none of them need to know about
 * GitHub at all, and none of src/lib/workflows/ references this file.
 *
 * The repo is fetched live at whatever commit `ref`/`submissionUrl` resolves
 * to right now - not the code the draft was originally graded against, which
 * was never fetched. Callers must surface the returned `ref`/`repo` next to
 * the code so an instructor can see they may be looking at a later commit.
 */
export async function fetchSubmissionRepoAction(submissionUrl: string): Promise<FetchSubmissionRepoResult> {
  try {
    await requireOwner();

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
          error: `Could not find "${owner}/${repo}" on GitHub. It may be private (the configured GITHUB_TOKEN needs access to it), deleted, or the link may be mistyped.`,
        };
      }
      return { error: message || `Could not reach "${owner}/${repo}" on GitHub.` };
    }

    const wantedRef = requestedRef || defaultBranch;

    // Resolve to the exact commit SHA so every subsequent call (tree + each
    // file's content) reads the same snapshot, even if the branch moves
    // mid-fetch, and so the caller can surface precisely what was loaded.
    let resolvedRef = wantedRef;
    try {
      const commits = await listCommits(owner, repo, wantedRef, 1);
      if (commits[0]?.sha) resolvedRef = commits[0].sha;
    } catch {
      // Fall through with the branch/tag name itself - still a valid ref for
      // the tree/content calls below, just not pinned to one commit.
    }

    let tree;
    try {
      tree = await getRepoTree(owner, repo, resolvedRef);
    } catch (err) {
      return {
        error:
          err instanceof Error
            ? err.message
            : `Could not read the file tree for "${owner}/${repo}" at "${resolvedRef}".`,
      };
    }

    const { selected, truncated: selectionTruncated } = selectSubmissionRepoFiles(tree, subpath);
    if (selected.length === 0) {
      return {
        error: subpath
          ? `No recognized source files were found under "${subpath}" in "${owner}/${repo}".`
          : `No recognized source files were found in "${owner}/${repo}".`,
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
      return { error: `Could not read any files from "${owner}/${repo}" (they may all be unreadable or too large).` };
    }

    const budgeted = applyTotalByteBudget(fetched);

    return {
      files: budgeted.files,
      ref: resolvedRef,
      repo: `${owner}/${repo}`,
      truncated: selectionTruncated || perFileTruncated || budgeted.truncated,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not fetch the submitted repository." };
  }
}
