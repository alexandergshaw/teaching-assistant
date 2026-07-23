// Server-only GitHub REST client. Authenticates with a Personal Access Token in
// the GITHUB_TOKEN env var (mirrors the Canvas layer's env-var token pattern) and
// uses plain fetch — no SDK dependency. Covers the operations the app needs:
// listing repos, reading a repo's files (for course/rubric generation and
// grading), creating repos, writing files (instruction sync), and reading CI runs.

// Re-export authentication helpers from repos module (defined there to avoid circular deps)
export { githubToken } from "./github.repos";

/** Whether a GitHub token is configured (so the UI can hide GitHub features). */
export function githubConfigured(): boolean {
  return !!process.env.GITHUB_TOKEN?.trim();
}

/** The GitHub webhook signing secret (trimmed), or null if unset/blank. Both the
 * registration action and the /api/github/webhook verifier read the secret through
 * this one accessor so the signing key and the verifying key can never diverge
 * (e.g. from a trailing newline pasted into the env var). */
export function githubWebhookSecret(): string | null {
  const s = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  return s ? s : null;
}

// Re-export all domain modules
export type { GithubRepo, UpdateRepoPatch } from "./github.repos";
export {
  parseRepoRef,
  listRepos,
  getRepo,
  listOwnedOrgs,
  listOrgRepos,
  listBranches,
  generateFromTemplate,
  createRepo,
  createOrgRepo,
  listPersonalRepos,
  updateRepo,
  deleteRepo,
  forkRepo,
} from "./github.repos";

export type { RepoTreeEntry } from "./github.files";
export {
  getRepoTree,
  getFileText,
  putFile,
  deletePaths,
  movePaths,
} from "./github.files";

export {
  createCopilotAgentTask,
  startCopilotBuild,
  listCopilotTasks,
} from "./github.copilot";
export type { CopilotTask, CopilotTaskPr } from "./github.copilot";

export type { RepoFile, RepoDigest } from "./github.digest";
export {
  ingestRepo,
  downloadRepoZipball,
} from "./github.digest";

export type {
  WorkflowRunInfo,
  WorkflowInfo,
  WorkflowJobInfo,
  WorkflowStepInfo,
  ArtifactInfo,
  PendingDeployment,
} from "./github.actions";
export {
  getLatestWorkflowRun,
  listWorkflows,
  dispatchWorkflow,
  findWorkflowRunSince,
  listWorkflowRuns,
  listRunJobs,
  rerunWorkflowRun,
  cancelWorkflowRun,
  downloadArtifactZip,
  rerunFailedJobs,
  setWorkflowEnabled,
  listRunArtifacts,
  getArtifactDownloadUrl,
  getRunLogsDownloadUrl,
  listPendingDeployments,
  reviewPendingDeployments,
} from "./github.actions";

export type { OrgMember, OrgHook } from "./github.orgs";
export {
  listOrgMembers,
  inviteOrgMember,
  setOrgMemberRole,
  listOrgHooks,
  createOrgPushHook,
} from "./github.orgs";

export type { RepoPermission, RepoCollaborator } from "./github.collab";
export {
  listRepoCollaborators,
  setRepoCollaborator,
  createPullRequest,
  setBranchProtection,
} from "./github.collab";
export type { BranchProtectionOptions } from "./github.collab";

export type { PullRequestInfo, PullRequestReviewInfo, PullRequestFileInfo } from "./github.pulls";
export {
  listPullRequests,
  mergePullRequest,
  markPullRequestReady,
  listPullRequestReviews,
  reviewPullRequest,
  listPullRequestFiles,
} from "./github.pulls";

export type { CommitInfo } from "./github.branches";
export {
  createBranch,
  deleteBranch,
  listCommits,
} from "./github.branches";

export {
  getRepoTopics,
  setRepoTopics,
  listRepoLabels,
  createRepoLabel,
} from "./github.metadata";

export type { CopyRepoOptions, CopyRepoResult, CopyPathsOptions, CopyPathsResult } from "./github.copy";
export {
  copyRepo,
  copyPathsToRepo,
} from "./github.copy";
