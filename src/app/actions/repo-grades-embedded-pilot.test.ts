import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { callLlm } from "@/lib/llm";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { discoverRepoGradeSources } from "@/lib/repo-grades-dashboard/discovery";
import * as admissionMode from "@/lib/repo-grades-dashboard/admission-mode";
import * as discoveryMode from "@/lib/repo-grades-dashboard/discovery-mode";
import {
  beginRepoGradeDispatch, claimRepoGrade, settleRepoGrade,
} from "@/lib/repo-grades-dashboard/ledger";
import { getRepoGraderIdentity } from "@/lib/repo-grades-dashboard/grader-identity";
import { readPinnedRepoGradeReadme } from "@/lib/repo-grades-dashboard/preparation-readme";
import { captureRepoGradeProfile } from "@/lib/repo-grades-dashboard/profile";
import { readCurrentRepoGradeProfilesForOwner } from "@/lib/repo-grades-dashboard/profile-store";
import { evaluateRepoGrade } from "@/lib/repo-grade-evaluator";
import {
  readRepoGradeStartupReadinessAction, retryRepoGradePreparationAction, runRepoGradeStartupTargetAction,
} from "./repo-grades-dashboard";

const { select, eq, maybeSingle } = vi.hoisted(() => ({ select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }));
vi.mock("@/lib/supabase/app-users", async (original) => ({
  ...await original<typeof import("@/lib/supabase/app-users")>(),
  getAppUser: vi.fn(),
}));
vi.mock("@/lib/supabase/courses.row", () => ({ table: () => ({ select }) }));
vi.mock("@/lib/repo-grades-dashboard/discovery", () => ({ discoverRepoGradeSources: vi.fn() }));
vi.mock("@/lib/repo-grades-dashboard/preparation-readme", () => ({ readPinnedRepoGradeReadme: vi.fn() }));
vi.mock("@/lib/repo-grade-evaluator", () => ({ evaluateRepoGrade: vi.fn() }));
vi.mock("@/lib/llm", async (original) => ({
  ...await original<typeof import("@/lib/llm")>(),
  callLlm: vi.fn(),
}));
vi.mock("@/lib/repo-grades-dashboard/profile-store", async (original) => ({
  ...await original<typeof import("@/lib/repo-grades-dashboard/profile-store")>(),
  readCurrentRepoGradeProfilesForOwner: vi.fn(),
}));
vi.mock("@/lib/repo-grades-dashboard/ledger", () => ({
  readRepoGradeHistoryForOwner: vi.fn(),
  REPO_GRADE_HISTORY_PAGE_SIZE: 100,
  beginRepoGradeDispatch: vi.fn(),
  claimRepoGrade: vi.fn(),
  settleRepoGrade: vi.fn(),
}));

const courseId = "18d742a1-46a5-4b3f-af5d-5fc9b55023c1";
const batchId = "e7b41e02-a26b-44ea-b6fa-faa58581481c";
const account = { id: "owner", email: "owner@example.test" };
const ownerRow: AppUserRow = {
  ...account,
  displayName: null,
  status: "active",
  role: "owner",
  approvedAt: null,
  approvedBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  statusChangedAt: null,
  statusChangedBy: null,
  roleGrantedBy: null,
};
const getUser = vi.fn();
const readReceipts = vi.fn();
const from = vi.fn();
const rpc = vi.fn();
const batchRpc = vi.fn();
const receiptQuery = {
  select: vi.fn(), eq: vi.fn(), neq: vi.fn(), order: vi.fn(), limit: vi.fn(), abortSignal: vi.fn(), retry: readReceipts,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("REPO_GRADE_DISCOVERY_ENABLED", undefined);
  getUser.mockResolvedValue({ data: { user: account }, error: null });
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser,
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) },
    },
  } as never);
  vi.mocked(getAppUser).mockResolvedValue(ownerRow);
  vi.mocked(readCurrentRepoGradeProfilesForOwner).mockResolvedValue(new Map());
  batchRpc.mockImplementation((name: string) => ({
    retry: () => ({
      abortSignal: async () => ({ data: name === "repo_grade_stage_startup" ? [] : true, error: null }),
    }),
  }));
  vi.mocked(createServiceClient).mockReturnValue({
    from,
    rpc: (name: string, args: unknown) => name.includes("startup") && name !== "repo_grade_claim_startup_target"
      ? batchRpc(name, args) : rpc(name, args),
  } as never);
  from.mockReturnValue(receiptQuery);
  for (const method of ["select", "eq", "neq", "order", "limit", "abortSignal"] as const) {
    receiptQuery[method].mockReturnValue(receiptQuery);
  }
  select.mockReturnValue({ eq });
  eq.mockReturnValue({ eq, maybeSingle });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const currentSha = "b".repeat(40);

function source(folders = ["assignment"]) {
  return { status: "ready" as const, repo: "School/Repo", sourceRef: "Main", sourceCommit: currentSha, folders };
}

function discover(...repos: Array<ReturnType<typeof source>>) {
  vi.spyOn(discoveryMode, "repoGradeDiscoveryEnabled").mockReturnValue(true);
  maybeSingle.mockResolvedValue({ data: { github_org: "school", rubric_data: "private" }, error: null });
  vi.mocked(discoverRepoGradeSources).mockResolvedValue({ status: "scanned", enumerationComplete: true, repos });
}

function runStartupTarget(commit = currentSha, expectedAccountId = account.id) {
  return runRepoGradeStartupTargetAction(expectedAccountId, courseId, "School/Repo", "assignment", "Main", commit, batchId);
}

function savedStartupProfile(rubric: string, { provider = "embedded", useReadmeInstructions = false, sourceRef, runCode, targetBranch }: {
  provider?: "embedded" | "gemini"; useReadmeInstructions?: boolean; sourceRef?: string; runCode?: boolean; targetBranch?: string;
} = {}) {
  const captured = captureRepoGradeProfile({ accountId: account.id, courseId, folder: "assignment" }, {
    instructions: "Use a loop.", useReadmeInstructions, rubric, sourceRef, runCode, targetBranch,
  }, getRepoGraderIdentity(provider));
  if (captured.status !== "ready") throw new Error("Invalid test profile");
  return captured.profile;
}

const claim = { mode: "automatic" as const, generation: 7, token: "test-token" };

function admitStartupFixture() {
  vi.spyOn(admissionMode, "repoGradeAdmissionMode").mockReturnValue("coordinated");
  discover(source());
  readReceipts.mockResolvedValue({ data: [], count: 0, error: null });
  const profile = savedStartupProfile("Correctness (100%): Check the loop.");
  rpc.mockImplementation(async (name, args) => {
    if (name === "repo_grade_read_profile") return { data: { profile, receipt: null }, error: null };
    if (name === "repo_grade_freeze_rubric") return { data: args.p_receipt, error: null };
    throw new Error(`Unexpected profile call ${name}`);
  });
  vi.mocked(claimRepoGrade).mockResolvedValue({ status: "claimed", claim });
  return profile;
}

it("runs the Embedded pilot with the exact explicitly saved rubric and instructions", async () => {
  const profile = admitStartupFixture();
  vi.spyOn(admissionMode, "repoGradeAdmissionMode").mockReturnValue("embedded-only");
  rpc.mockResolvedValueOnce({ data: { profile, receipt: null, startupDefault: false }, error: null });
  vi.mocked(settleRepoGrade).mockResolvedValue(true);
  vi.mocked(evaluateRepoGrade).mockResolvedValue({
    noSubmission: true, fullName: "School/Repo", sourceCommit: currentSha, digestTruncated: false, reason: "No submission",
  });

  await expect(readRepoGradeStartupReadinessAction(account.id)).resolves.toEqual({ status: "ready", accountId: account.id });
  await expect(runStartupTarget()).resolves.toEqual({ status: "no-submission" });
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(["repo_grade_read_profile", "repo_grade_freeze_rubric"]);
  expect(evaluateRepoGrade).toHaveBeenCalledExactlyOnceWith(
    { owner: "School", repo: "Repo" }, profile.instructions, profile.rubric, "embedded", undefined,
    "assignment", false, false, true, currentSha, expect.objectContaining({ automaticGrader: profile }),
  );
  expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "no-submission", inputsComplete: true });
  expect(beginRepoGradeDispatch).not.toHaveBeenCalled();
  expect(readPinnedRepoGradeReadme).not.toHaveBeenCalled();
  expect(callLlm).not.toHaveBeenCalled();
});

it.each([
  { profile: null },
  { profile: savedStartupProfile("Rubric"), startupDefault: true },
  { profile: savedStartupProfile("Rubric") },
  { profile: savedStartupProfile("Rubric", { provider: "gemini" }), startupDefault: false },
  { profile: savedStartupProfile(""), startupDefault: false },
  { profile: savedStartupProfile("Rubric", { useReadmeInstructions: true }), startupDefault: false },
  { profile: savedStartupProfile("Rubric", { runCode: true }), startupDefault: false },
  { profile: savedStartupProfile("Rubric", { targetBranch: "main" }), startupDefault: false },
])("blocks an unsupported Embedded pilot profile before preparation (%j)", async ({ profile, startupDefault }) => {
  admitStartupFixture();
  vi.spyOn(admissionMode, "repoGradeAdmissionMode").mockReturnValue("embedded-only");
  rpc.mockResolvedValueOnce({ data: profile && {
    profile, receipt: null, ...(startupDefault === undefined ? {} : { startupDefault }),
  }, error: null });

  await expect(runStartupTarget()).resolves.toEqual({ status: "embedded-profile-required" });
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(["repo_grade_read_profile"]);
  expect(batchRpc).toHaveBeenLastCalledWith("repo_grade_finish_startup_target", expect.objectContaining({ p_status: "not-started" }));
  expect(claimRepoGrade).not.toHaveBeenCalled();
  expect(readPinnedRepoGradeReadme).not.toHaveBeenCalled();
  expect(evaluateRepoGrade).not.toHaveBeenCalled();
  expect(callLlm).not.toHaveBeenCalled();
});

it("refuses paid rubric preparation retries in the Embedded pilot", async () => {
  vi.spyOn(admissionMode, "repoGradeAdmissionMode").mockReturnValue("embedded-only");
  vi.spyOn(discoveryMode, "repoGradeDiscoveryEnabled").mockReturnValue(true);
  await expect(retryRepoGradePreparationAction(account.id, courseId, "assignment", "a".repeat(64), "b".repeat(64)))
    .resolves.toMatchObject({ status: "retry-unavailable" });
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
  expect(callLlm).not.toHaveBeenCalled();
});
