// R4 (docs/r4-scope.md section 5/6): ingestRepoAction is its own
// client-reachable "use server" endpoint on the same GitHub-PAT chain as
// extractDeckSourceRepoAction (deck-source.ts), referenced from the workflow
// registry that ships in the client bundle. Its guard moved from the
// permissive requireOwner() alias to requireAppOwner() at github.ts:260.
//
// R2 wave 1, sub-wave 3 (docs/r2-wave1-subwaves.md section 4, row SW3): the
// remaining 26 requireOwner() sites in this file. Re-derived rather than
// inherited (the plan predicted 24 restrictive / 2 permissive): every one of
// the 26 actions below calls a function imported from "@/lib/github" (or,
// for listGithubModelsAction/copilotChatAction, "@/lib/github-models", which
// src/lib/github-models.ts:3 says is "authenticated with the same
// GITHUB_TOKEN as the REST client") - so every site reaches the shared
// GitHub personal access token. src/lib/supabase/auth.ts's own doc comment
// on requireAppOwner() (":369-375") reserves it for exactly this shape:
// "call sites that spend or reach an OWNER-PRIVATE resource through a shared
// server secret (Canvas, GitHub, ...)". None of the 26 is added to
// GITHUB_NOT_OWNER_ONLY; all 26 are restrictive. This matches SW1/SW2's own
// finding on github-repos.ts (38 sites, 0 permissive) for the identical
// PAT-backed reason.
//
// Executes the REAL guard: mocks the client ("./server") and the app-users
// lookup ("./app-users"), the idiom in src/lib/supabase/auth.test.ts:19-30 -
// never a module mock of "@/lib/supabase/auth" itself, which would replace
// the guard with a stub and never run it. This file duplicates the small
// fixture helpers locally per this repo's rule against cross-test-file
// imports (auth.test.ts:13-16).
//
// This module also imports @/lib/github, which reaches live network code
// (ghFetch etc.) - none of that runs here because a non-owner is refused
// before any action below reaches parseRepoRef or any @/lib/github call.
//
// Table-driven over the 26 sites rather than one `it` block each
// (docs/r2-wave1-subwaves.md section 3's per-case cost note).
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
  ingestRepoAction,
  extractTopicsFromRepoAction,
  setRepoTopicsAction,
  listGithubReposAction,
  deleteOrgReposAction,
  setupStudentRepoAction,
  listMyOrgsAction,
  listOrgReposAction,
  listGithubBranchesAction,
  createRepoAction,
  createRepoFromTemplateAction,
  createCopilotRepoAction,
  createCopilotTaskAction,
  listCopilotTasksAction,
  bulkDeletePathsAction,
  bulkMovePathsAction,
  listGithubModelsAction,
  copilotChatAction,
  checkStudentActivityAction,
  registerOrgPushWebhookAction,
  generateRubricFromRepoAction,
  gradeReposAction,
  listWorkflowsAction,
  dispatchWorkflowAction,
  dispatchTestsAction,
  getTestRunStatusAction,
  setupTestsWorkflowAction,
} from "./github";

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
      getUser: () =>
        Promise.resolve({
          data: { user: { id: userId, email } },
          error: null,
        }),
      mfa: {
        getAuthenticatorAssuranceLevel: () =>
          Promise.resolve({
            data: { currentLevel: "aal1", nextLevel: "aal1" },
            error: null,
          }),
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

describe("ingestRepoAction - R4 guard swap", () => {
  it("rejects an active, signed-in non-owner with the owner-only message - the guard actually runs, not a mocked stub", async () => {
    const result = await ingestRepoAction("owner/repo");

    expect(result).toEqual({ error: "This action is limited to the workspace owner." });
  });
});

const OWNER_ONLY_ERROR = { error: "This action is limited to the workspace owner." };

// registerOrgPushWebhookAction's own return type has no plain `{ error }`
// member - every branch carries `ok` and `url` alongside the message (see
// github.ts's own return type on that action) - so its case below asserts
// against this shape instead of OWNER_ONLY_ERROR.
const REGISTER_WEBHOOK_OWNER_ONLY_ERROR = {
  ok: false,
  url: "https://teaching-assistant-pi.vercel.app/api/github/webhook",
  error: "This action is limited to the workspace owner.",
};

const sw3Cases: Array<[string, () => Promise<unknown>, unknown?]> = [
  ["extractTopicsFromRepoAction", () => extractTopicsFromRepoAction("owner/repo")],
  ["setRepoTopicsAction", () => setRepoTopicsAction("owner/repo", ["topic"])],
  ["listGithubReposAction", () => listGithubReposAction()],
  ["deleteOrgReposAction", () => deleteOrgReposAction("org", ["repo"])],
  [
    "setupStudentRepoAction",
    () => setupStudentRepoAction("org", "template", "prefix", "student", "username", true, "push"),
  ],
  ["listMyOrgsAction", () => listMyOrgsAction()],
  ["listOrgReposAction", () => listOrgReposAction("org")],
  ["listGithubBranchesAction", () => listGithubBranchesAction("owner/repo")],
  ["createRepoAction", () => createRepoAction("name", "description", true, false)],
  ["createRepoFromTemplateAction", () => createRepoFromTemplateAction("owner/repo", "name", true, false)],
  ["createCopilotRepoAction", () => createCopilotRepoAction("name", "prompt")],
  ["createCopilotTaskAction", () => createCopilotTaskAction("owner/repo", "title", "body")],
  ["listCopilotTasksAction", () => listCopilotTasksAction("owner/repo")],
  ["bulkDeletePathsAction", () => bulkDeletePathsAction("owner/repo", "main", ["a.txt"])],
  ["bulkMovePathsAction", () => bulkMovePathsAction("owner/repo", "main", ["a.txt"], "dest")],
  ["listGithubModelsAction", () => listGithubModelsAction()],
  ["copilotChatAction", () => copilotChatAction("model", [{ role: "user", content: "hi" }])],
  ["checkStudentActivityAction", () => checkStudentActivityAction("org")],
  ["registerOrgPushWebhookAction", () => registerOrgPushWebhookAction("org"), REGISTER_WEBHOOK_OWNER_ONLY_ERROR],
  ["generateRubricFromRepoAction", () => generateRubricFromRepoAction("owner/repo")],
  ["gradeReposAction", () => gradeReposAction([], "instructions", "rubric")],
  ["listWorkflowsAction", () => listWorkflowsAction("owner/repo")],
  ["dispatchWorkflowAction", () => dispatchWorkflowAction("owner/repo", "workflow.yml", "main")],
  ["dispatchTestsAction", () => dispatchTestsAction("owner/repo")],
  ["getTestRunStatusAction", () => getTestRunStatusAction("owner/repo", "main", new Date().toISOString())],
  ["setupTestsWorkflowAction", () => setupTestsWorkflowAction("owner/repo", "main", "node")],
];

describe("github.ts sites 1-26 (minus ingestRepoAction) - R2 SW3 guard swap", () => {
  it.each(sw3Cases)(
    "%s rejects an active, signed-in non-owner with the owner-only message - the guard actually runs, not a mocked stub",
    async (_name, run, expected) => {
      const result = await run();
      expect(result).toEqual(expected ?? OWNER_ONLY_ERROR);
    }
  );
});
