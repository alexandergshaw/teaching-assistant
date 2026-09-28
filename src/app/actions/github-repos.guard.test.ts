// R2 wave 1, sub-wave 1 (docs/r2-wave1-subwaves.md section 4, row SW1):
// sites 1-19 of github-repos.ts's 37 requireOwner() call sites moved from the
// permissive alias to requireAppOwner() - each one's own body calls a
// PAT-spending function imported from "@/lib/github" (the direct-import-edge
// Rank-1 basis in that document's section 2), so each reaches the owner's
// single-owner GitHub personal access token.
//
// Sub-wave 2 (row SW2) extends this same file with the remaining 18 sites
// (sites 20-37) rather than creating a second file, per that document's
// section 4 note that SW1/SW2 split ONE file across two sub-waves. Every one
// of these 18 also calls a PAT-spending function imported from "@/lib/github"
// directly in its own body (getRepoTree, getFileText, putFile,
// listOrgMembers, inviteOrgMember, setOrgMemberRole, listRepoCollaborators,
// setRepoCollaborator, createPullRequest, setBranchProtection, updateRepo,
// listRunArtifacts, getArtifactDownloadUrl, getRunLogsDownloadUrl,
// listPendingDeployments, reviewPendingDeployments, downloadRepoZipball) or,
// for gradeRepoAction, calls ingestRepo directly - so all 18 are restrictive
// and none is added to GITHUB_NOT_OWNER_ONLY.
//
// Executes the REAL guard: mocks the client ("@/lib/supabase/server") and the
// app-users lookup ("@/lib/supabase/app-users"), the idiom already landed at
// src/app/actions/github.test.ts and src/lib/supabase/auth.test.ts:432-444 -
// never a module mock of "@/lib/supabase/auth" itself, which would replace
// the guard with a stub and never run it. This file duplicates the small
// fixture helpers locally per this repo's rule against cross-test-file
// imports.
//
// This module also imports @/lib/github, which reaches live network code
// (ghFetch etc.) - none of that runs here because a non-owner is refused
// before any action reaches parseRepoRef or any @/lib/github call.
//
// Table-driven over all 19 (then 37) converted sites rather than one `it`
// block per site (docs/r2-wave1-subwaves.md section 3's per-case cost note).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return { ...actual, getAppUser: vi.fn(), ensureAppUser: vi.fn(), ensureAppUserRowExists: vi.fn() };
});

import { createClient } from "@/lib/supabase/server";
import { getAppUser, ensureAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import {
  forkRepoAction,
  copyRepoAction,
  copyPathsToRepoAction,
  detectRepoFrontendAction,
  createBranchAction,
  deleteBranchAction,
  listPullRequestsAction,
  mergePullRequestAction,
  markPullRequestReadyAction,
  getRepoAttentionAction,
  listPullRequestReviewsAction,
  listPullRequestFilesAction,
  reviewPullRequestAction,
  listWorkflowRunsAction,
  listRunJobsAction,
  rerunWorkflowRunAction,
  cancelWorkflowRunAction,
  rerunFailedJobsAction,
  setWorkflowEnabledAction,
  listRunArtifactsAction,
  getArtifactDownloadUrlAction,
  getRunLogsDownloadUrlAction,
  listPendingDeploymentsAction,
  reviewPendingDeploymentsAction,
  getRepoTreeAction,
  getFileTextAction,
  commitFileAction,
  listOrgMembersAction,
  inviteOrgMemberAction,
  setOrgMemberRoleAction,
  listRepoCollaboratorsAction,
  setRepoCollaboratorAction,
  createPullRequestAction,
  setBranchProtectionAction,
  updateRepoAction,
  gradeRepoAction,
  getRepoZipAction,
} from "./github-repos";
import type { CopyRepoOptions, CopyPathsOptions, BranchProtectionOptions, UpdateRepoPatch } from "@/lib/github";

function fakeAppUserRow(overrides: Partial<AppUserRow> = {}): AppUserRow {
  return {
    id: "u1",
    email: "person@example.com",
    displayName: null,
    status: "active",
    role: "instructor",
    approvedAt: null,
    approvedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    statusChangedAt: null,
    statusChangedBy: null,
    roleGrantedBy: null,
    ...overrides,
  };
}

function makeFakeAuthClient(userId: string, email: string) {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: userId, email } }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: () =>
          Promise.resolve({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }),
      },
    },
  };
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(getAppUser).mockReset();
  vi.mocked(ensureAppUser).mockReset();
  vi.mocked(ensureAppUser).mockResolvedValue(fakeAppUserRow());
  vi.mocked(createClient).mockResolvedValue(makeFakeAuthClient("u1", "m@example.com") as never);
  vi.mocked(getAppUser).mockResolvedValue(
    fakeAppUserRow({ email: "m@example.com", status: "active", role: "instructor" })
  );
});

const OWNER_ONLY_ERROR = { error: "This action is limited to the workspace owner." };

const copyRepoOptions: CopyRepoOptions = {
  destName: "dest-repo",
  visibility: "private",
  includeWorkflows: false,
  copyTopics: false,
  copyLabels: false,
};

const copyPathsOptions: CopyPathsOptions = {
  destOwner: "owner",
  destRepo: "dest-repo",
  paths: ["a.txt"],
};

const branchProtectionOptions: BranchProtectionOptions = {
  requirePullRequestReviews: true,
  requiredApprovingReviewCount: 1,
  requireStatusChecks: false,
  statusCheckContexts: [],
  strictStatusChecks: false,
  enforceAdmins: true,
  requireLinearHistory: false,
};

const updateRepoPatch: UpdateRepoPatch = { description: "updated" };

const cases: Array<[string, () => Promise<unknown>]> = [
  ["forkRepoAction", () => forkRepoAction("owner/repo")],
  ["copyRepoAction", () => copyRepoAction("owner/repo", copyRepoOptions)],
  ["copyPathsToRepoAction", () => copyPathsToRepoAction("owner/repo", copyPathsOptions)],
  ["detectRepoFrontendAction", () => detectRepoFrontendAction("owner/repo")],
  ["createBranchAction", () => createBranchAction("owner/repo", "new-branch", "main")],
  ["deleteBranchAction", () => deleteBranchAction("owner/repo", "old-branch")],
  ["listPullRequestsAction", () => listPullRequestsAction("owner/repo")],
  ["mergePullRequestAction", () => mergePullRequestAction("owner/repo", 1)],
  ["markPullRequestReadyAction", () => markPullRequestReadyAction("owner/repo", 1)],
  ["getRepoAttentionAction", () => getRepoAttentionAction("owner/repo")],
  ["listPullRequestReviewsAction", () => listPullRequestReviewsAction("owner/repo", 1)],
  ["listPullRequestFilesAction", () => listPullRequestFilesAction("owner/repo", 1)],
  ["reviewPullRequestAction", () => reviewPullRequestAction("owner/repo", 1, "APPROVE")],
  ["listWorkflowRunsAction", () => listWorkflowRunsAction("owner/repo")],
  ["listRunJobsAction", () => listRunJobsAction("owner/repo", 1)],
  ["rerunWorkflowRunAction", () => rerunWorkflowRunAction("owner/repo", 1)],
  ["cancelWorkflowRunAction", () => cancelWorkflowRunAction("owner/repo", 1)],
  ["rerunFailedJobsAction", () => rerunFailedJobsAction("owner/repo", 1)],
  ["setWorkflowEnabledAction", () => setWorkflowEnabledAction("owner/repo", 1, true)],
];

describe("github-repos.ts sites 1-19 - R2 SW1 guard swap", () => {
  it.each(cases)(
    "%s rejects an active, signed-in non-owner with the owner-only message - the guard actually runs, not a mocked stub",
    async (_name, run) => {
      const result = await run();
      expect(result).toEqual(OWNER_ONLY_ERROR);
    }
  );
});

const sw2Cases: Array<[string, () => Promise<unknown>]> = [
  ["listRunArtifactsAction", () => listRunArtifactsAction("owner/repo", 1)],
  ["getArtifactDownloadUrlAction", () => getArtifactDownloadUrlAction("owner/repo", 1)],
  ["getRunLogsDownloadUrlAction", () => getRunLogsDownloadUrlAction("owner/repo", 1)],
  ["listPendingDeploymentsAction", () => listPendingDeploymentsAction("owner/repo", 1)],
  [
    "reviewPendingDeploymentsAction",
    () => reviewPendingDeploymentsAction("owner/repo", 1, [1], "approved", "comment"),
  ],
  ["getRepoTreeAction", () => getRepoTreeAction("owner/repo")],
  ["getFileTextAction", () => getFileTextAction("owner/repo", "README.md")],
  ["commitFileAction", () => commitFileAction("owner/repo", "README.md", "content", "message", "main")],
  ["listOrgMembersAction", () => listOrgMembersAction("org")],
  ["inviteOrgMemberAction", () => inviteOrgMemberAction("org", "someone", "member")],
  ["setOrgMemberRoleAction", () => setOrgMemberRoleAction("org", "someone", "member")],
  ["listRepoCollaboratorsAction", () => listRepoCollaboratorsAction("owner/repo")],
  ["setRepoCollaboratorAction", () => setRepoCollaboratorAction("owner/repo", "someone", "push")],
  ["createPullRequestAction", () => createPullRequestAction("owner/repo", "title", "head", "base", "body")],
  ["setBranchProtectionAction", () => setBranchProtectionAction("owner/repo", "main", branchProtectionOptions)],
  ["updateRepoAction", () => updateRepoAction("owner/repo", updateRepoPatch)],
  ["gradeRepoAction", () => gradeRepoAction("owner/repo", "instructions", "rubric")],
  ["getRepoZipAction", () => getRepoZipAction("owner/repo")],
];

describe("github-repos.ts sites 20-37 - R2 SW2 guard swap", () => {
  it.each(sw2Cases)(
    "%s rejects an active, signed-in non-owner with the owner-only message - the guard actually runs, not a mocked stub",
    async (_name, run) => {
      const result = await run();
      expect(result).toEqual(OWNER_ONLY_ERROR);
    }
  );
});
