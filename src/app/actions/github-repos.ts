"use server";

import {
  parseRepoRef,
  forkRepo,
  copyRepo,
  copyPathsToRepo,
  createBranch,
  deleteBranch,
  listPullRequests,
  mergePullRequest,
  markPullRequestReady,
  listWorkflowRuns,
  listPullRequestReviews,
  listPullRequestFiles,
  reviewPullRequest,
  listRunJobs,
  rerunWorkflowRun,
  cancelWorkflowRun,
  rerunFailedJobs,
  setWorkflowEnabled,
  listRunArtifacts,
  getArtifactDownloadUrl,
  getRunLogsDownloadUrl,
  listPendingDeployments,
  reviewPendingDeployments,
  getRepoTree,
  getFileText,
  putFile,
  listOrgMembers,
  inviteOrgMember,
  setOrgMemberRole,
  listRepoCollaborators,
  setRepoCollaborator,
  createPullRequest,
  setBranchProtection,
  updateRepo,
  downloadRepoZipball,
  ingestRepo,
  excludeInstructionsFromDigest,
  type GithubRepo,
  type CopyRepoOptions,
  type CopyRepoResult,
  type CopyPathsOptions,
  type CopyPathsResult,
  type PullRequestInfo,
  type PullRequestReviewInfo,
  type PullRequestFileInfo,
  type WorkflowRunInfo,
  type WorkflowJobInfo,
  type RepoTreeEntry,
  type ArtifactInfo,
  type PendingDeployment,
  type OrgMember,
  type RepoCollaborator,
  type RepoPermission,
  type BranchProtectionOptions,
  type UpdateRepoPatch,
} from "@/lib/github";
import { classifyFrontend, classifyBackend, type BackendInfo } from "@/lib/frontend-detect";
import { generateRubric, gradeEntries, type GradingRun, type StudentSubmissionEntry, type SubmittedFileInfo } from "@/lib/grade";
import { buildEmbeddedRubric, gradeEntriesEmbedded, renderRubricText } from "@/lib/embedded-grader";
import { attachCodeRuns } from "@/lib/code-runner";
import { rememberRubric } from "@/lib/research/rubric-bank";
import { type LlmProvider } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { pickReadmeInstructions } from "@/lib/repo-readme-instructions";

type RepoFile = { path: string; content: string; truncated: boolean };
type RepoDigest = { fullName: string; text: string; fileCount: number; files: RepoFile[] };

// ── Repository operations (fork, branches, commits, PRs, Actions) ───────────

export async function forkRepoAction(repoRef: string, org?: string): Promise<{ repo: GithubRepo } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const repo = await forkRepo(parsed.owner, parsed.repo, org?.trim());
    return { repo };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not fork the repository." };
  }
}

export async function copyRepoAction(
  repoRef: string,
  opts: CopyRepoOptions
): Promise<{ result: CopyRepoResult } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const result = await copyRepo(parsed.owner, parsed.repo, opts);
    return { result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not copy the repository." };
  }
}

export async function copyPathsToRepoAction(
  repoRef: string,
  opts: CopyPathsOptions
): Promise<{ result: CopyPathsResult } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const result = await copyPathsToRepo(parsed.owner, parsed.repo, opts);
    return { result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not copy files to the repository." };
  }
}

export async function detectRepoFrontendAction(fullName: string): Promise<{ frontend: { framework: string; devCommand: string } | null; backend: BackendInfo | null } | { error: string }> {
  try {
    await requireOwner();
    const parts = fullName.split("/");
    if (parts.length !== 2) {
      return { frontend: null, backend: null };
    }
    const [owner, repo] = parts;

    // Fetch files in parallel with individual catches
    const [packageJsonResult, requirementsTxtResult, pyprojectTomlResult, pipfileResult] = await Promise.all([
      getFileText(owner, repo, "package.json").catch(() => undefined),
      getFileText(owner, repo, "requirements.txt").catch(() => undefined),
      getFileText(owner, repo, "pyproject.toml").catch(() => undefined),
      getFileText(owner, repo, "Pipfile").catch(() => undefined),
    ]);

    const frontend = classifyFrontend(packageJsonResult ?? "");
    const backend = classifyBackend({
      packageJson: packageJsonResult,
      requirementsTxt: requirementsTxtResult,
      pyprojectToml: pyprojectTomlResult,
      pipfile: pipfileResult,
    });

    return { frontend, backend };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not detect frontend/backend framework." };
  }
}

export async function createBranchAction(repoRef: string, newBranch: string, fromBranch: string): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    if (!newBranch.trim()) return { error: "Enter a new branch name." };
    if (!fromBranch.trim()) return { error: "Select a source branch." };
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await createBranch(parsed.owner, parsed.repo, newBranch.trim(), fromBranch.trim());
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the branch." };
  }
}

export async function deleteBranchAction(repoRef: string, branch: string): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    if (!branch.trim()) return { error: "Select a branch to delete." };
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await deleteBranch(parsed.owner, parsed.repo, branch.trim());
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the branch." };
  }
}


export async function listPullRequestsAction(repoRef: string, state: "open" | "closed" | "all" = "open"): Promise<{ pulls: PullRequestInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const pulls = await listPullRequests(parsed.owner, parsed.repo, state);
    return { pulls };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list pull requests." };
  }
}

export async function mergePullRequestAction(repoRef: string, prNumber: number, method: "merge" | "squash" | "rebase" = "merge"): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await mergePullRequest(parsed.owner, parsed.repo, prNumber, method);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not merge the pull request." };
  }
}

export async function markPullRequestReadyAction(repoRef: string, prNumber: number): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await markPullRequestReady(parsed.owner, parsed.repo, prNumber);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not mark the pull request as ready." };
  }
}

/**
 * Attention counts for a repo's badges: open non-draft pull requests (agent or
 * human, awaiting review/merge) and workflow runs blocked on approval
 * (waiting = deployment review, action_required = fork approval).
 */
export async function getRepoAttentionAction(
  repoRef: string
): Promise<{ openPrs: number; agentPrs: number; runsNeedingApproval: number } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const [pulls, waiting, actionRequired] = await Promise.all([
      listPullRequests(parsed.owner, parsed.repo, "open"),
      listWorkflowRuns(parsed.owner, parsed.repo, { status: "waiting", perPage: 50 }),
      listWorkflowRuns(parsed.owner, parsed.repo, { status: "action_required", perPage: 50 }),
    ]);
    const ready = pulls.filter((p) => !p.draft);
    return {
      openPrs: ready.length,
      // Copilot coding-agent PRs work on copilot/* branches; a ready (non-draft)
      // one means the agent finished and is waiting on review.
      agentPrs: ready.filter((p) => p.head.startsWith("copilot/")).length,
      runsNeedingApproval: waiting.length + actionRequired.length,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load attention counts." };
  }
}

/** List the reviews submitted on a pull request. */
export async function listPullRequestReviewsAction(
  repoRef: string,
  prNumber: number
): Promise<{ reviews: PullRequestReviewInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { reviews: await listPullRequestReviews(parsed.owner, parsed.repo, prNumber) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load reviews." };
  }
}

/** List the files a pull request changes, with their diffs. */
export async function listPullRequestFilesAction(
  repoRef: string,
  prNumber: number
): Promise<{ files: PullRequestFileInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { files: await listPullRequestFiles(parsed.owner, parsed.repo, prNumber) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the pull request's files." };
  }
}

/** Submit a review on a pull request (approve or request changes). */
export async function reviewPullRequestAction(
  repoRef: string,
  prNumber: number,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  body?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    if (event !== "APPROVE" && !body?.trim()) {
      return { error: "Add a comment explaining the requested changes." };
    }
    await reviewPullRequest(parsed.owner, parsed.repo, prNumber, event, body);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not submit the review." };
  }
}

export async function listWorkflowRunsAction(
  repoRef: string,
  branch?: string,
  opts?: { status?: string; workflowId?: number }
): Promise<{ runs: WorkflowRunInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const runs = await listWorkflowRuns(parsed.owner, parsed.repo, {
      branch: branch?.trim() || undefined,
      status: opts?.status,
      workflowId: opts?.workflowId,
    });
    return { runs };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list workflow runs." };
  }
}

export async function listRunJobsAction(repoRef: string, runId: number): Promise<{ jobs: WorkflowJobInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const jobs = await listRunJobs(parsed.owner, parsed.repo, runId);
    return { jobs };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list workflow jobs." };
  }
}

export async function rerunWorkflowRunAction(repoRef: string, runId: number): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await rerunWorkflowRun(parsed.owner, parsed.repo, runId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not rerun the workflow." };
  }
}

export async function cancelWorkflowRunAction(repoRef: string, runId: number): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await cancelWorkflowRun(parsed.owner, parsed.repo, runId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not cancel the workflow." };
  }
}

export async function rerunFailedJobsAction(repoRef: string, runId: number): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await rerunFailedJobs(parsed.owner, parsed.repo, runId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not re-run the failed jobs." };
  }
}

export async function setWorkflowEnabledAction(repoRef: string, workflowId: number, enabled: boolean): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await setWorkflowEnabled(parsed.owner, parsed.repo, workflowId, enabled);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the workflow." };
  }
}

export async function listRunArtifactsAction(repoRef: string, runId: number): Promise<{ artifacts: ArtifactInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { artifacts: await listRunArtifacts(parsed.owner, parsed.repo, runId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list artifacts." };
  }
}

export async function getArtifactDownloadUrlAction(repoRef: string, artifactId: number): Promise<{ url: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { url: await getArtifactDownloadUrl(parsed.owner, parsed.repo, artifactId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not get the artifact download link." };
  }
}

export async function getRunLogsDownloadUrlAction(repoRef: string, runId: number): Promise<{ url: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { url: await getRunLogsDownloadUrl(parsed.owner, parsed.repo, runId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not get the logs download link." };
  }
}

export async function listPendingDeploymentsAction(repoRef: string, runId: number): Promise<{ deployments: PendingDeployment[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { deployments: await listPendingDeployments(parsed.owner, parsed.repo, runId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list pending deployments." };
  }
}

export async function reviewPendingDeploymentsAction(
  repoRef: string,
  runId: number,
  environmentIds: number[],
  state: "approved" | "rejected",
  comment: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await reviewPendingDeployments(parsed.owner, parsed.repo, runId, environmentIds, state, comment);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not submit the deployment review." };
  }
}

export async function getRepoTreeAction(repoRef: string, ref?: string): Promise<{ tree: RepoTreeEntry[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const tree = await getRepoTree(parsed.owner, parsed.repo, ref?.trim());
    return { tree };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the repository tree." };
  }
}

export async function getFileTextAction(repoRef: string, path: string, ref?: string): Promise<{ content: string } | { error: string }> {
  try {
    await requireOwner();
    if (!path.trim()) return { error: "Enter a file path." };
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const content = await getFileText(parsed.owner, parsed.repo, path.trim(), ref?.trim());
    return { content };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the file." };
  }
}

export async function commitFileAction(repoRef: string, path: string, content: string, message: string, branch: string): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    if (!path.trim()) return { error: "Enter a file path." };
    if (!message.trim()) return { error: "Enter a commit message." };
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await putFile(parsed.owner, parsed.repo, path.trim(), content, message.trim(), branch.trim() || undefined);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not commit the file." };
  }
}

// ── Organization + Repo Management ──────────────────────────────────────────

export async function listOrgMembersAction(org: string): Promise<{ members: OrgMember[] } | { error: string }> {
  try {
    await requireOwner();
    const trimmed = org.trim();
    if (!trimmed) return { error: "Choose an organization." };
    return { members: await listOrgMembers(trimmed) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list organization members." };
  }
}

export async function inviteOrgMemberAction(
  org: string,
  invitee: string,
  role: "admin" | "member"
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const trimmed = org.trim();
    if (!trimmed) return { error: "Choose an organization." };
    if (!invitee.trim()) return { error: "Enter a GitHub username or email to invite." };
    await inviteOrgMember(trimmed, invitee, role);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not invite the member." };
  }
}

export async function setOrgMemberRoleAction(
  org: string,
  username: string,
  role: "admin" | "member"
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const trimmed = org.trim();
    if (!trimmed) return { error: "Choose an organization." };
    await setOrgMemberRole(trimmed, username, role);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the member role." };
  }
}

export async function listRepoCollaboratorsAction(repoRef: string): Promise<{ collaborators: RepoCollaborator[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { collaborators: await listRepoCollaborators(parsed.owner, parsed.repo) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list collaborators." };
  }
}

export async function setRepoCollaboratorAction(
  repoRef: string,
  username: string,
  permission: RepoPermission
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await setRepoCollaborator(parsed.owner, parsed.repo, username, permission);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the collaborator." };
  }
}

export async function createPullRequestAction(
  repoRef: string,
  title: string,
  head: string,
  base: string,
  body: string
): Promise<{ number: number; htmlUrl: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    if (!title.trim()) return { error: "Enter a pull request title." };
    if (!head.trim()) return { error: "Enter the head branch." };
    if (!base.trim()) return { error: "Enter the base branch." };
    return await createPullRequest(parsed.owner, parsed.repo, { title, head, base, body });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the pull request." };
  }
}

export async function setBranchProtectionAction(
  repoRef: string,
  branch: string,
  opts: BranchProtectionOptions
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await setBranchProtection(parsed.owner, parsed.repo, branch, opts);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not set branch protection." };
  }
}

export async function updateRepoAction(
  repoRef: string,
  patch: UpdateRepoPatch
): Promise<{ repo: GithubRepo } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const repo = await updateRepo(parsed.owner, parsed.repo, patch);
    return { repo };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the repository." };
  }
}

/** Helper function to convert repo digest to embedded grading entry. */
function repoDigestToEmbeddedEntry(digest: RepoDigest, label?: string): StudentSubmissionEntry {
  const submittedFiles: SubmittedFileInfo[] = digest.files.map((file) => {
    const name = file.path.split("/").pop() || file.path;
    const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
    return {
      name: file.path,
      extension,
      previewContent: file.content,
      // F3: report the fact `ingestRepo` already computed for THIS file
      // rather than guessing here - this was hardcoded false, so the
      // truncation notice was suppressed on precisely the files that had
      // been cut.
      previewTruncated: file.truncated,
      mimeType: "text/plain",
    };
  });
  return {
    student: label?.trim() || digest.fullName,
    content: digest.text,
    mergedFileCount: digest.fileCount,
    submittedFiles,
  };
}

/**
 * Grade a student's GitHub repo against a rubric (generating one if not given).
 *
 * `runCode`, when true, has the EMBEDDED (deterministic) engine run this
 * repo's code in the sandbox and score it via gradeEntriesEmbedded's own
 * "Code runs" criterion (src/lib/embedded-grader/index.ts) - the same
 * scoring the LLM path already applies unconditionally via gradeEntries'
 * internal runSubmittedCode call. Default false/omitted: the embedded engine
 * never ran code here before this parameter existed (github.ts:641 shared the
 * same silent gap), so a caller that does not pass it sees byte-identical
 * scores to before - this is an opt-in, not a default behavior change. The
 * Repo Grades view's own "Score code execution" control
 * (repoGradesUiState.ts's runCodeScoring) is the only UI surface that ever
 * passes true; every other caller (workflows, the per-cell "Grade" button's
 * pinned 7-argument call - see repoGradesRubricPicker.wiring.test.ts) keeps
 * omitting it and keeps today's behavior.
 */
// Scaffolding basenames that never count as a student submission on their
// own - the conservative floor FIX 2 (github-repos.ts's own header, and this
// function's doc comment below) requires: ".gitkeep" is a universal, tool-
// generated marker for "this empty folder must exist in git", never
// something a student wrote or was asked to write. Deliberately NOT extended
// with anything course-specific (a "tests/" folder of instructor-provided
// harness files, a starter "main.py" stub, ...) - that would hardcode one
// course's layout into every course's grading, which is exactly what this
// fix must not do. The assignment-instructions file itself (the README
// picked by pickReadmeInstructions, or content-matched by
// excludeInstructionsFromDigest) is excluded separately, before this check
// ever runs - see gradedDigest below.
function isScaffoldingFile(path: string): boolean {
  const base = (path.split("/").pop() ?? path).toLowerCase();
  return base === ".gitkeep";
}

export async function gradeRepoAction(
  repoRef: string,
  assignmentInstructions: string,
  rubric: string,
  provider: LlmProvider = "gemini",
  branch?: string,
  pathPrefix?: string,
  useReadmeInstructions?: boolean,
  runCode?: boolean
): Promise<
  | {
      run: GradingRun;
      rubric: string;
      fullName: string;
      digestTruncated?: boolean;
      readmePath?: string;
      readmeMissing?: boolean;
    }
  | {
      // FIX 2: a folder with nothing student-authored in it must never come
      // back looking like a successful (if low) grade, and must never read
      // as an ordinary failure either - `noSubmission: true` is its own
      // branch so a caller cannot reach `result.run` at all here (there is
      // none), and cannot mistake this for `{ error }` (nothing actually
      // went wrong - the read succeeded and correctly found nothing to
      // grade). See this function's own doc comment for the exact rule.
      noSubmission: true;
      fullName: string;
      reason: string;
      digestTruncated?: boolean;
      readmePath?: string;
      readmeMissing?: boolean;
    }
  | { error: string }
> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const digest = await ingestRepo(parsed.owner, parsed.repo, { pathPrefix }, branch);
    // `digest.truncated` used to be read (fileCount/text) and dropped right
    // here - the one signal that the ingest budget cut off part of the repo
    // before grading ever saw it. Both return branches below now carry it
    // through as `digestTruncated` instead of discarding it.
    const digestTruncated = digest.truncated;

    // When asked to grade against the graded folder's own README, prefer it
    // over the typed-in textarea. A missing README is reported, never an
    // error - the instructor still gets a grade using whatever instructions
    // they already had, and the UI surfaces `readmeMissing` so the fallback
    // is visible rather than silent.
    let effectiveInstructions = assignmentInstructions;
    let readmePath: string | undefined;
    let readmeMissing: boolean | undefined;
    if (useReadmeInstructions) {
      const pick = pickReadmeInstructions(digest.files, pathPrefix);
      if (pick) {
        effectiveInstructions = pick.instructions;
        readmePath = pick.path;
      } else {
        readmeMissing = true;
      }
    }

    // FIX 1 - THE LIVE BUG: `digest` still contains whatever file was just
    // used as the assignment instructions (the README pickReadmeInstructions
    // chose above, or - for a caller that fetched a folder's README itself
    // and passed it straight in as `assignmentInstructions`, e.g.
    // steps.grading-repos.helpers.ts's resolveReadmeInstructions - a
    // content-identical file with a path this function never learns). Every
    // consumer of the digest below (repoDigestToEmbeddedEntry's `content`/
    // `submittedFiles`/`mergedFileCount`, and the rubric-generation basis
    // text) must read `gradedDigest`, NEVER `digest`, from this point on -
    // that is what stops the instructions (in the reported case, a full
    // worked solution) from being graded as if it were the student's own
    // work. See excludeInstructionsFromDigest's own doc comment in
    // github.digest.ts for exactly what it excludes and why.
    const gradedDigest = excludeInstructionsFromDigest(digest, {
      instructionsPath: readmePath,
      instructionsText: effectiveInstructions,
    });

    // FIX 2: a submission that does not exist must not receive a grade. The
    // rule is deliberately conservative and folder-shaped, not content-
    // shaped: once the instructions file (just excluded above) and universal
    // scaffolding (.gitkeep) are removed, is there anything left in the
    // graded folder at all? This also naturally covers the folder-does-not-
    // exist case (`digest.prefixMatchedNothing` - `digest.files` is already
    // empty then) without a separate branch for it.
    const gradableFiles = gradedDigest.files.filter((f) => !isScaffoldingFile(f.path));
    if (gradableFiles.length === 0) {
      const folderLabel = pathPrefix ? `"${pathPrefix}"` : "the repository";
      const removed = readmePath ? "the assignment instructions file and scaffolding (.gitkeep)" : "scaffolding (.gitkeep)";
      const reason = `Nothing was submitted in ${folderLabel} - after removing ${removed}, no student-authored files remain.`;
      return { noSubmission: true, fullName: digest.fullName, reason, digestTruncated, readmePath, readmeMissing };
    }

    const instructions = effectiveInstructions.trim() || `Evaluate the repository "${digest.fullName}".`;

    // Embedded Deterministic Engine: grade the repo in-process against the
    // supplied rubric, or one generated from the instructions. No model call.
    if (provider === "embedded") {
      const builtRubric = buildEmbeddedRubric({ rubricText: rubric, instructions });
      if (builtRubric.checks.length === 0) {
        return { error: builtRubric.warnings[0] ?? "Provide a rubric or assignment instructions." };
      }
      // Grow the rubric bank from human-authored rubrics (fire-and-forget).
      if (rubric.trim()) void rememberRubric(instructions, rubric);
      const entries = [repoDigestToEmbeddedEntry(gradedDigest)];
      // The live defect this parameter fixes: gradeEntriesEmbedded only scores
      // a "Code runs" criterion off `entry.codeRun` (src/lib/embedded-grader/
      // index.ts) - it never runs anything itself. Every OTHER embedded caller
      // (grading.ts's Canvas/zip paths) already calls attachCodeRuns first;
      // this branch never did, so repo grading on the embedded engine has
      // never run or scored a student's code, silently, regardless of what
      // the LLM path does. Opt-in and off by default - see this function's
      // own doc comment on `runCode`.
      if (runCode) await attachCodeRuns(entries);
      const run = gradeEntriesEmbedded(entries, builtRubric);
      return { run, rubric: renderRubricText(builtRubric), fullName: digest.fullName, digestTruncated, readmePath, readmeMissing };
    }

    const effectiveRubric = rubric.trim() || (await generateRubric(`${instructions}\n\n${gradedDigest.text}`, provider));
    // F2: reuse the same shape-conversion the embedded path already does a
    // few lines up (repoDigestToEmbeddedEntry) rather than hand-building a
    // second entry with an always-empty submittedFiles - that emptiness was
    // the reason a repo-graded row never had a file list to preview.
    const entry: StudentSubmissionEntry = repoDigestToEmbeddedEntry(gradedDigest);
    const run = await gradeEntries([entry], instructions, effectiveRubric, provider);
    return { run, rubric: effectiveRubric, fullName: digest.fullName, digestTruncated, readmePath, readmeMissing };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not grade the repository." };
  }
}

/**
 * Download a repo as a zip whose entries sit at the root (GitHub wraps everything
 * in a "<repo>-<sha>/" folder; we strip it) so the result is a drop-in for the
 * uploaded-zip flows in lecture and syllabus planning.
 */
export async function getRepoZipAction(
  repoRef: string,
  branch?: string
): Promise<{ base64: string; name: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const buffer = await downloadRepoZipball(parsed.owner, parsed.repo, branch);
    const JSZipMod = (await import("jszip")).default;
    const src = await JSZipMod.loadAsync(buffer);
    // The wrapper folder is the common first path segment of every entry.
    let wrapper = "";
    src.forEach((path) => {
      if (!wrapper) wrapper = path.split("/")[0];
    });
    const out = new JSZipMod();
    const entries: Array<{ path: string; file: import("jszip").JSZipObject }> = [];
    src.forEach((path, file) => {
      if (!file.dir) entries.push({ path, file });
    });
    for (const { path, file } of entries) {
      const stripped = wrapper && path.startsWith(`${wrapper}/`) ? path.slice(wrapper.length + 1) : path;
      if (stripped) out.file(stripped, await file.async("uint8array"));
    }
    const base64 = await out.generateAsync({ type: "base64" });
    return { base64, name: `${parsed.repo}.zip` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not download the repository." };
  }
}
