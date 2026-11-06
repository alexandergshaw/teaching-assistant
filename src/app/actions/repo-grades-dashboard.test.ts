import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { callLlm } from "@/lib/llm";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { discoverRepoGradeSources } from "@/lib/repo-grades-dashboard/discovery";
import * as admissionMode from "@/lib/repo-grades-dashboard/admission-mode";
import * as discoveryMode from "@/lib/repo-grades-dashboard/discovery-mode";
import {
  beginRepoGradeDispatch, claimRepoGrade, readRepoGradeHistoryForOwner, settleRepoGrade,
} from "@/lib/repo-grades-dashboard/ledger";
import { getRepoGraderIdentity } from "@/lib/repo-grades-dashboard/grader-identity";
import { captureRepoGradeRubricGenerator } from "@/lib/repo-grades-dashboard/preparation-generator";
import { readPinnedRepoGradeReadme } from "@/lib/repo-grades-dashboard/preparation-readme";
import { captureRepoGradeProfile } from "@/lib/repo-grades-dashboard/profile";
import { readCurrentRepoGradeProfilesForOwner } from "@/lib/repo-grades-dashboard/profile-store";
import { evaluateRepoGrade } from "@/lib/repo-grade-evaluator";
import {
  closeRepoGradeStartupBatchAction, planRepoGradeCourseAction, readRepoGradeHistoryAction, readRepoGradeStartupBatchAction, readRepoGradeStartupCoursesAction,
  readRepoGradeStartupReadinessAction, retryRepoGradePreparationAction, runRepoGradeStartupTargetAction,
  sealRepoGradeStartupBatchAction,
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
  select: vi.fn(), eq: vi.fn(), neq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(), abortSignal: vi.fn(), retry: readReceipts,
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
  for (const method of ["select", "eq", "neq", "in", "order", "limit", "abortSignal"] as const) {
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

it.each([
  { session: "signed out", user: null, role: "owner", message: "Not authorized. Sign in with an approved account." },
  { session: "active instructor", user: account, role: "instructor", message: "This action is limited to the workspace owner." },
] as const)("denies a $session caller before storage or GitHub", async ({ user, role, message }) => {
  getUser.mockResolvedValue({ data: { user }, error: null });
  vi.mocked(getAppUser).mockResolvedValue({ ...ownerRow, role });
  await expect(planRepoGradeCourseAction(courseId)).rejects.toThrow(message);
  await expect(runStartupTarget()).rejects.toThrow(message);
  await expect(readRepoGradeHistoryAction(courseId, account.id)).rejects.toThrow(message);
  await expect(readRepoGradeStartupCoursesAction(account.id)).resolves.toEqual({ status: "unknown", reason: "account-unavailable" });
  await expect(readRepoGradeStartupReadinessAction(account.id)).resolves.toEqual({ status: "unavailable" });
  await expect(retryRepoGradePreparationAction(account.id, courseId, "assignment", "a".repeat(64), "b".repeat(64)))
    .resolves.toMatchObject({ status: "forbidden" });
  expect(select).not.toHaveBeenCalled();
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
  expect(readRepoGradeHistoryForOwner).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
});

it("requires both server gates and the expected account for startup readiness", async () => {
  const unavailable = { status: "unavailable" };
  await expect(readRepoGradeStartupReadinessAction(account.id)).resolves.toEqual(unavailable);
  const admission = vi.spyOn(admissionMode, "repoGradeAdmissionMode").mockReturnValue("coordinated");
  const discovery = vi.spyOn(discoveryMode, "repoGradeDiscoveryEnabled").mockReturnValue(false);
  await expect(readRepoGradeStartupReadinessAction(account.id)).resolves.toEqual(unavailable);
  admission.mockReturnValue("unavailable");
  discovery.mockReturnValue(true);
  await expect(readRepoGradeStartupReadinessAction(account.id)).resolves.toEqual(unavailable);
  admission.mockReturnValue("coordinated");
  await expect(readRepoGradeStartupReadinessAction("another-account")).resolves.toEqual(unavailable);
  await expect(readRepoGradeStartupReadinessAction(account.id)).resolves.toEqual({ status: "ready", accountId: account.id });
  expect(from).not.toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
});

it("rejects startup discovery if the account changed before the request", async () => {
  await expect(planRepoGradeCourseAction(courseId, "another-account")).resolves.toEqual({ status: "course-unavailable" });
  expect(select).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
});

it("fences startup inventory reads to the expected account and hides authorization errors", async () => {
  const unavailable = { status: "unknown", reason: "account-unavailable" };
  await expect(readRepoGradeStartupCoursesAction("another-account")).resolves.toEqual(unavailable);
  await expect(readRepoGradeStartupCoursesAction({ id: account.id })).resolves.toEqual(unavailable);
  getUser.mockRejectedValueOnce(new Error("private authorization transport error"));
  await expect(readRepoGradeStartupCoursesAction(account.id)).resolves.toEqual(unavailable);
  expect(from).not.toHaveBeenCalled();
});

it("returns the owned startup inventory without discovery, history, or evaluation", async () => {
  readReceipts.mockResolvedValue({
    data: [{ id: courseId, user_id: account.id, name: "Class name", github_org: "school" }], count: 1, error: null,
  });
  await expect(readRepoGradeStartupCoursesAction(account.id)).resolves.toEqual({
    status: "complete", courses: [{ accountId: account.id, courseId, displayName: "Class name", organization: "school" }],
  });
  expect(from).toHaveBeenCalledExactlyOnceWith("course_hub");
  expect(receiptQuery.eq).toHaveBeenCalledExactlyOnceWith("user_id", account.id);
  expect(select).not.toHaveBeenCalled();
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
  expect(readCurrentRepoGradeProfilesForOwner).not.toHaveBeenCalled();
  expect(readRepoGradeHistoryForOwner).not.toHaveBeenCalled();
  expect(evaluateRepoGrade).not.toHaveBeenCalled();
  expect(callLlm).not.toHaveBeenCalled();
});

it("rejects browser scope objects and never discovers an unowned course", async () => {
  await expect(planRepoGradeCourseAction({ courseId, githubOrg: "external" } as unknown as string))
    .resolves.toEqual({ status: "course-unavailable" });
  expect(select).not.toHaveBeenCalled();
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(planRepoGradeCourseAction(courseId)).resolves.toEqual({ status: "course-unavailable" });
  expect(eq.mock.calls).toEqual([["user_id", "owner"], ["id", courseId]]);
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
});

it("reports that discovery is disabled for a configured course without reading profiles or contacting GitHub", async () => {
  maybeSingle.mockResolvedValue({ data: { github_org: "school", rubric_data: "private" }, error: null });
  await expect(planRepoGradeCourseAction(courseId.toUpperCase())).resolves.toEqual({
    status: "planned",
    discovery: { status: "blocked", reason: "branch-aware-discovery-disabled" },
    execution: "runtime-unavailable",
    preview: { history: "not-read", targets: [] },
  });
  expect(eq.mock.calls).toEqual([["user_id", account.id], ["id", courseId]]);
  expect(readCurrentRepoGradeProfilesForOwner).not.toHaveBeenCalled();
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
  expect(evaluateRepoGrade).not.toHaveBeenCalled();
  expect(callLlm).not.toHaveBeenCalled();
});

it("discloses partial coverage and hides course settings in the dormant preview", async () => {
  maybeSingle.mockResolvedValue({ data: { github_org: "school", rubric_data: "private" }, error: null });
  vi.spyOn(discoveryMode, "repoGradeDiscoveryEnabled").mockReturnValue(true);
  const discovery = { status: "scanned" as const, enumerationComplete: false, repos: [source()] };
  vi.mocked(discoverRepoGradeSources).mockResolvedValue(discovery);
  await expect(planRepoGradeCourseAction(courseId))
    .resolves.toEqual({ status: "planned", discovery, execution: "runtime-unavailable", preview: { history: "not-read", targets: [] } });
  expect(discoverRepoGradeSources).toHaveBeenCalledExactlyOnceWith({ organization: "school", folderSources: new Map() });
  expect(from).not.toHaveBeenCalled();
});

it.each([null, "  "])("keeps mapping-only courses with organization %j outside automatic discovery", async (organization) => {
  maybeSingle.mockResolvedValue({ data: { github_org: organization, student_repos: ["external/repo"] }, error: null });
  await expect(planRepoGradeCourseAction(courseId)).resolves.toEqual({
    status: "planned", discovery: { status: "not-configured" }, execution: "runtime-unavailable",
    preview: { history: "not-read", targets: [] },
  });
  expect(readCurrentRepoGradeProfilesForOwner).not.toHaveBeenCalled();
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
});

const sha = "a".repeat(40);
const currentSha = "b".repeat(40);

function source(folders = ["assignment"]) {
  return { status: "ready" as const, repo: "School/Repo", sourceRef: "Main", sourceCommit: currentSha, folders };
}

function receipt(generation: number, overrides: Record<string, unknown> = {}) {
  return {
    generation, user_id: account.id, course_id: courseId, repo: "school/repo", folder: "assignment",
    source_ref: "Main", source_sha: currentSha, mode: "automatic", status: "succeeded",
    claimed_at: new Date().toISOString(), ...overrides,
  };
}

function discover(...repos: Array<ReturnType<typeof source>>) {
  vi.spyOn(discoveryMode, "repoGradeDiscoveryEnabled").mockReturnValue(true);
  maybeSingle.mockResolvedValue({ data: { github_org: "school", rubric_data: "private" }, error: null });
  vi.mocked(discoverRepoGradeSources).mockResolvedValue({ status: "scanned", enumerationComplete: true, repos });
}

function runStartupTarget(commit = currentSha, expectedAccountId = account.id) {
  return runRepoGradeStartupTargetAction(expectedAccountId, courseId, "School/Repo", "assignment", "Main", commit, batchId);
}

it("preserves earlier unknown and failed work while staging an eligible pinned tail", async () => {
  discover(source(["assignment", "failed", "tail"]));
  vi.spyOn(admissionMode, "repoGradeAdmissionMode").mockReturnValue("coordinated");
  readReceipts.mockResolvedValue({ data: [], count: 0, error: null });
  const selector = { repo: "School/Repo", folder: "assignment", ref: "Main", sha: currentSha };
  const failed = { ...selector, folder: "failed" };
  const tail = { ...selector, folder: "tail" };
  batchRpc.mockReturnValueOnce({ retry: () => ({ abortSignal: async () => ({
    data: [{ ...selector, state: "unknown" }, { ...failed, state: "failed" }], error: null,
  }) }) });
  await expect(planRepoGradeCourseAction(courseId, account.id, batchId)).resolves.toMatchObject({
    status: "planned", preview: { history: "complete", targets: [
      { folder: "assignment", state: { status: "unknown" } },
      { folder: "failed", state: { status: "failed" } },
      { folder: "tail", state: { status: "blocked", reason: "runtime-unavailable" } },
    ] },
  });
  expect(batchRpc).toHaveBeenCalledExactlyOnceWith("repo_grade_stage_startup", {
    p_user_id: account.id, p_batch_id: batchId, p_course_id: courseId, p_targets: [selector, failed, tail],
  });
  expect(callLlm).not.toHaveBeenCalled();
});

it("fences batch read, seal, and close to the expected account and returns only bounded recovery counts", async () => {
  vi.spyOn(admissionMode, "repoGradeAdmissionMode").mockReturnValue("coordinated");
  vi.spyOn(discoveryMode, "repoGradeDiscoveryEnabled").mockReturnValue(true);
  await expect(readRepoGradeStartupBatchAction("other")).resolves.toEqual({ status: "unavailable" });
  await expect(sealRepoGradeStartupBatchAction("other", batchId, 2)).resolves.toBe(false);
  await expect(closeRepoGradeStartupBatchAction("other", batchId)).resolves.toBe(false);
  expect(batchRpc).not.toHaveBeenCalled();

  const counts = [{ courseId, state: "unknown", count: 1 }, { courseId, state: "not-started", count: 1 }];
  batchRpc.mockReturnValueOnce({ retry: () => ({ abortSignal: async () => ({
    data: { active: false, counts: counts.map((count) => ({ ...count, feedback: "private" })) }, error: null,
  }) }) });
  await expect(readRepoGradeStartupBatchAction(account.id)).resolves.toEqual({ status: "loaded", notice: { active: false, counts } });
  expect(batchRpc).toHaveBeenCalledExactlyOnceWith("repo_grade_read_startup", { p_user_id: account.id });
  await expect(sealRepoGradeStartupBatchAction(account.id, batchId, 2)).resolves.toBe(true);
  await expect(closeRepoGradeStartupBatchAction(account.id, batchId)).resolves.toBe(true);
  expect(batchRpc.mock.calls.slice(1)).toEqual([
    ["repo_grade_seal_startup", { p_user_id: account.id, p_batch_id: batchId, p_count: 2 }],
    ["repo_grade_close_startup", { p_user_id: account.id, p_batch_id: batchId }],
  ]);
});

it("never attempts evaluation after an ambiguous startup reservation", async () => {
  vi.spyOn(admissionMode, "repoGradeAdmissionMode").mockReturnValue("coordinated");
  vi.spyOn(discoveryMode, "repoGradeDiscoveryEnabled").mockReturnValue(true);
  const retry = vi.fn(() => ({ abortSignal: async () => { throw new Error("lost response"); } }));
  batchRpc.mockReturnValueOnce({ retry });
  await expect(runStartupTarget()).resolves.toEqual({ status: "storage-unavailable" });
  expect(retry).toHaveBeenCalledExactlyOnceWith(false);
  expect(batchRpc).toHaveBeenCalledExactlyOnceWith("repo_grade_start_startup_target", {
    p_user_id: account.id, p_batch_id: batchId, p_course_id: courseId,
    p_repo: "School/Repo", p_folder: "assignment", p_ref: "Main", p_sha: currentSha,
  });
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
  expect(claimRepoGrade).not.toHaveBeenCalled();
  expect(callLlm).not.toHaveBeenCalled();
});

it("keeps startup execution dark and refuses account changes before touching storage or GitHub", async () => {
  await expect(runStartupTarget()).resolves.toEqual({ status: "runtime-unavailable" });
  await expect(runStartupTarget(currentSha, "another-account")).resolves.toEqual({ status: "forbidden" });
  expect(select).not.toHaveBeenCalled();
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
  expect(claimRepoGrade).not.toHaveBeenCalled();
  expect(evaluateRepoGrade).not.toHaveBeenCalled();
});

it("rejects stale startup selectors and prior receipts before preparing or admitting a target", async () => {
  vi.spyOn(admissionMode, "repoGradeAdmissionMode").mockReturnValue("coordinated");
  discover(source());
  await expect(runStartupTarget(sha)).resolves.toEqual({ status: "ungraded" });
  expect(from).not.toHaveBeenCalled();

  readReceipts.mockResolvedValue({ data: [receipt(1, { source_ref: "other-ref" })], count: 1, error: null });
  await expect(runStartupTarget()).resolves.toEqual({ status: "succeeded" });
  readReceipts.mockResolvedValue({ data: [], count: 1, error: null });
  await expect(runStartupTarget()).resolves.toEqual({ status: "storage-unavailable" });
  expect(rpc).not.toHaveBeenCalled();
  expect(claimRepoGrade).not.toHaveBeenCalled();
  expect(evaluateRepoGrade).not.toHaveBeenCalled();
});

it("releases this batch marker after read-only preflight and preserves uncertain prior attempt history", async () => {
  vi.spyOn(admissionMode, "repoGradeAdmissionMode").mockReturnValue("coordinated");
  discover(source());
  vi.mocked(discoverRepoGradeSources).mockRejectedValueOnce(new Error("Discovery unavailable"));
  await expect(runStartupTarget()).resolves.toEqual({ status: "storage-unavailable" });
  expect(batchRpc).toHaveBeenLastCalledWith("repo_grade_finish_startup_target", expect.objectContaining({ p_status: "not-started" }));

  readReceipts.mockResolvedValueOnce({ data: [], count: 1, error: null });
  await expect(runStartupTarget()).resolves.toEqual({ status: "storage-unavailable" });
  expect(batchRpc).toHaveBeenLastCalledWith("repo_grade_finish_startup_target", expect.objectContaining({ p_status: "not-started" }));

  readReceipts.mockResolvedValueOnce({ data: [receipt(1, { status: "unknown" })], count: 1, error: null });
  await expect(runStartupTarget()).resolves.toEqual({ status: "unknown" });
  expect(batchRpc).toHaveBeenLastCalledWith("repo_grade_finish_startup_target", expect.objectContaining({ p_status: "not-started" }));
  expect(claimRepoGrade).not.toHaveBeenCalled();
  expect(callLlm).not.toHaveBeenCalled();
});

function savedStartupProfile(rubric: string, { provider = "embedded", useReadmeInstructions = false, sourceRef }: {
  provider?: "embedded" | "gemini"; useReadmeInstructions?: boolean; sourceRef?: string;
} = {}) {
  const captured = captureRepoGradeProfile({ accountId: account.id, courseId, folder: "assignment" }, {
    instructions: "Use a loop.", useReadmeInstructions, rubric, sourceRef,
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

it("freezes the saved rubric before admission and invokes the real runner with the exact pin", async () => {
  const profile = admitStartupFixture();
  vi.mocked(settleRepoGrade).mockResolvedValue(true);
  vi.mocked(evaluateRepoGrade).mockResolvedValue({
    noSubmission: true, fullName: "School/Repo", sourceCommit: currentSha, digestTruncated: false, reason: "No submission",
  });

  await expect(runStartupTarget()).resolves.toEqual({ status: "no-submission" });
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(["repo_grade_read_profile", "repo_grade_freeze_rubric"]);
  const frozen = rpc.mock.calls[1][1];
  expect(claimRepoGrade).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    courseId, repo: "School/Repo", folder: "assignment", sourceRef: "Main", sha: currentSha,
    cohort: { cohortId: frozen.p_cohort_id, receipt: frozen.p_receipt },
  }));
  expect(rpc.mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(claimRepoGrade).mock.invocationCallOrder[0]);
  expect(vi.mocked(claimRepoGrade).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(evaluateRepoGrade).mock.invocationCallOrder[0]);
  expect(evaluateRepoGrade).toHaveBeenCalledExactlyOnceWith(
    { owner: "School", repo: "Repo" }, profile.instructions, profile.rubric, "embedded", undefined,
    "assignment", false, false, true, currentSha, expect.objectContaining({ automaticGrader: profile }),
  );
  expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "no-submission", inputsComplete: true });
  expect(callLlm).not.toHaveBeenCalled();
});

it.each([
  { overLimit: true, settles: true, status: "partial" },
  { overLimit: true, settles: false, status: "unknown" },
  { overLimit: false, settles: false, status: "unknown" },
])("preserves the exact feedback on $status with overLimit=$overLimit", async ({ overLimit, settles, status }) => {
  const profile = admitStartupFixture();
  const strengths = `  Original\r\n${"x".repeat(overLimit ? 16001 : 1)}\t`;
  const grade = {
    student: "student", totalScore: "8/10", rubricAreas: [], overallComment: "Keep the loop.",
    strengths, improvements: "", resubmitNotice: "", feedback: "", mergedFileCount: 1, submittedFiles: [],
  };
  vi.mocked(evaluateRepoGrade).mockResolvedValue({
    fullName: "School/Repo", sourceCommit: currentSha, digestTruncated: false, rubric: profile.rubric,
    run: { results: [grade], rubricAreaNames: [], fullCreditChecklist: [] },
  });
  if (settles) vi.mocked(settleRepoGrade).mockResolvedValue(true);
  else vi.mocked(settleRepoGrade).mockRejectedValue(new Error("Private settlement transport error"));

  const unretainedResult = {
    score: 80, feedback: grade.overallComment, rubric: [],
    sections: { strengths, improvements: "", resubmitNotice: "", rawScore: grade.totalScore },
  };
  await expect(runStartupTarget()).resolves.toEqual({
    status, unretainedResult, ...(overLimit && { feedbackRetention: "strengths" }),
  });
  expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, overLimit
    ? { outcome: "partial", feedbackRetention: "strengths" }
    : { outcome: "succeeded", inputsComplete: true, result: unretainedResult });
  expect(evaluateRepoGrade).toHaveBeenCalledTimes(1);
});

it("refuses model-backed rubric generation when the course metadata snapshot is incomplete", async () => {
  vi.spyOn(admissionMode, "repoGradeAdmissionMode").mockReturnValue("coordinated");
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  discover(source());
  readReceipts.mockResolvedValue({ data: [], count: 0, error: null });
  rpc.mockResolvedValueOnce({ data: { profile: savedStartupProfile("", { provider: "gemini", useReadmeInstructions: true }), receipt: null }, error: null });
  maybeSingle.mockResolvedValue({ data: { github_org: "school", name: "Special Topics" }, error: null });

  await expect(runStartupTarget()).resolves.toMatchObject({
    status: "course-kind-required", preparationDiagnostic: { status: "course-kind-required", durationMs: expect.any(Number) },
  });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("repo_grade_read_profile", expect.anything());
  expect(claimRepoGrade).not.toHaveBeenCalled();
  expect(evaluateRepoGrade).not.toHaveBeenCalled();
  expect(readPinnedRepoGradeReadme).not.toHaveBeenCalled();
  expect(callLlm).not.toHaveBeenCalled();
});

const preparationId = "b38c5575-31ee-4992-ac6a-4e1356ce806a";
const preparationToken = "fa0d9ff4-7c28-4ebd-9c50-b529c007c0e5";
const preparationRetryGeneration = createHash("sha256").update(preparationToken).digest("hex");
const preparedGradeToken = "bf749542-ed47-46cb-9916-bd8478e0665f";

async function paidPreparationFixture({
  begin = "allowed", finish = "saved", readback = true, claimStatus = "claimed", policyVersion,
  wrongContext = false, missingProfile = false, startupDefault = false, courseRubric = null, courseName = "Research",
  rawKind = "applied", bootstrapAllowed = true,
  retryStatus = "claimed",
}: {
  begin?: "allowed" | "denied" | "lost"; finish?: "saved" | "lost"; readback?: boolean;
  claimStatus?: "claimed" | "capacity" | "busy" | "explicit-retry-required";
  policyVersion?: string; wrongContext?: boolean; missingProfile?: boolean; startupDefault?: boolean;
  courseRubric?: string | null; courseName?: string; rawKind?: string | null; bootstrapAllowed?: boolean;
  retryStatus?: "claimed" | "busy" | "unknown" | "retry-unavailable" | "configuration-changed" | "lost";
} = {}) {
  vi.spyOn(admissionMode, "repoGradeAdmissionMode").mockReturnValue("coordinated");
  vi.stubEnv("GEMINI_MODEL", "gemini-3.1-flash-lite");
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_MIN_OUTPUT_TOKENS", "512");
  vi.stubEnv("GEMINI_THINKING_LEVEL", "minimal");
  discover(source(), { ...source(), repo: "School/Other", sourceCommit: sha });
  const courseConfig = {
    github_org: "school", repos: [], rubric_name: courseRubric, rubric_data: null, repo_module_pairing: null, student_repos: [],
  };
  maybeSingle.mockResolvedValue({ data: { ...courseConfig, name: courseName, course_kind: rawKind }, error: null });
  readReceipts.mockResolvedValue({ data: [], count: 0, error: null });
  const profile = savedStartupProfile("", { provider: "gemini", useReadmeInstructions: true });
  const generator = captureRepoGradeRubricGenerator(profile.model, "applied")!;
  const parserVersion = `${generator.promptParserVersion}:${generator.generationConfigFingerprint}`;
  const path = "assignment/README.md";
  const instructions = "Describe your method and show the findings.";
  const context = { instructions, source: { kind: "pinned-readme", path } };
  vi.mocked(readPinnedRepoGradeReadme).mockImplementation(async (target) => ({
    status: "present", target, path, text: instructions, blobSha: sha,
  }));

  const ledger = await vi.importActual<typeof import("@/lib/repo-grades-dashboard/ledger")>("@/lib/repo-grades-dashboard/ledger");
  vi.mocked(claimRepoGrade).mockImplementation(ledger.claimRepoGrade);
  vi.mocked(beginRepoGradeDispatch).mockImplementation(ledger.beginRepoGradeDispatch);
  vi.mocked(settleRepoGrade).mockImplementation(ledger.settleRepoGrade);
  const llm = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  vi.mocked(callLlm).mockImplementation(llm.callLlm);

  const events: string[] = [];
  let candidate: unknown;
  let currentProfile = missingProfile ? null : profile;
  const fetchModel = vi.fn<(url: string, request: RequestInit) => Promise<Response>>(async () => {
    events.push("gemini");
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{
      text: JSON.stringify({ areas: ["Method", "Evidence", "Findings", "Organization"].map((name) => ({
        name, description: `Assess ${name}.`, excellent: "Complete coverage.",
        meets: "Partial coverage.", needs: "Major gaps.",
      })) }),
    }] } }] });
  });
  vi.stubGlobal("fetch", fetchModel);

  const noRetry = vi.fn();
  rpc.mockImplementation((name, args) => {
    events.push(name);
    function response(data: unknown, error: unknown = null) {
      const request = Promise.resolve({ data, error });
      return Object.assign(request, { retry: (value: boolean) => { noRetry(name, value); return request; } });
    }
    switch (name) {
      case "repo_grade_read_profile":
        return args.p_cohort_id ? response(readback ? { profile: currentProfile, receipt: candidate } : null)
          : response(currentProfile ? { profile: currentProfile, receipt: null, startupDefault } : null);
      case "repo_grade_bootstrap_preparation":
        if (policyVersion || !bootstrapAllowed) return response(false);
        currentProfile = args.p_profile;
        return response(true);
      case "repo_grade_claim_preparation":
        if (args.p_retry_generation !== undefined) {
          if (retryStatus === "lost") return response(null, { message: "lost response" });
          if (retryStatus !== "claimed") return response({ status: retryStatus });
          return response({ status: "claimed", cohortId: preparationId, token: preparedGradeToken });
        }
        if (claimStatus === "explicit-retry-required") {
          return response({ status: claimStatus, retryGeneration: preparationRetryGeneration });
        }
        if (claimStatus !== "claimed") return response({ status: claimStatus });
        return candidate ? response({ status: "ready", cohortId: preparationId, receipt: candidate }) : response({
          status: "claimed", cohortId: preparationId, token: preparationToken,
        });
      case "repo_grade_begin_preparation":
        return begin === "lost" ? response(null, { message: "lost response" }) : response(begin === "allowed" ? 500_000 : null);
      case "repo_grade_finish_preparation":
        if (args.p_outcome !== "succeeded") {
          return response({ status: args.p_outcome === "failed-before-dispatch" ? "failed" : args.p_outcome });
        }
        candidate = args.p_receipt;
        return finish === "saved" ? response({ status: "succeeded", receipt: candidate }) : response(null, { message: "lost response" });
      case "repo_grade_claim_startup_target":
        return response({
          status: "claimed", generation: 8, token: preparedGradeToken,
          preparation: wrongContext ? { ...context, instructions: "Unrelated instructions" } : context,
        });
      case "repo_grade_begin_dispatch":
        return response(500_000);
      case "repo_grade_settle":
        return response(true);
      default:
        throw new Error(`Unexpected paid preparation RPC ${name}`);
    }
  });
  vi.mocked(evaluateRepoGrade).mockImplementation(async (...args) => {
    await args[10]?.modelExecution?.beforeDispatch?.(new AbortController().signal);
    return {
      noSubmission: true, fullName: `${args[0].owner}/${args[0].repo}`, sourceCommit: args[9], digestTruncated: false,
      reason: "No submission", readmePath: path,
    };
  });
  return { profile, context, events, fetchModel, noRetry, parserVersion, courseConfig };
}

it.each(["saved", "lost"] as const)("grades only after a durably frozen Gemini rubric with finish=%s", async (finish) => {
  const { profile, context, events, fetchModel, noRetry, parserVersion, courseConfig } = await paidPreparationFixture({ finish });
  await expect(runStartupTarget()).resolves.toMatchObject({
    status: "no-submission", preparationDiagnostic: { status: "ready", durationMs: expect.any(Number) },
  });
  expect(events).toEqual([
    "repo_grade_read_profile", "repo_grade_bootstrap_preparation", "repo_grade_claim_preparation", "repo_grade_begin_preparation", "gemini",
    "repo_grade_finish_preparation", ...(finish === "lost" ? ["repo_grade_read_profile"] : []),
    "repo_grade_claim_startup_target", "repo_grade_begin_dispatch", "repo_grade_settle",
  ]);
  expect(rpc).toHaveBeenCalledWith("repo_grade_bootstrap_preparation", {
    p_user_id: account.id, p_course_id: courseId, p_folder: "assignment", p_course_config: courseConfig,
    p_course_kind_basis: ["Research", "applied"], p_course_kind: "applied",
    p_prompt_parser_version: expect.stringMatching(new RegExp(`^${parserVersion}:[a-f0-9]{64}$`)),
    p_expected_fingerprint: profile.configurationFingerprint, p_profile: profile,
  });
  const claimArgs = rpc.mock.calls.find(([name]) => name === "repo_grade_claim_preparation")![1];
  expect(claimArgs).toMatchObject({
    p_user_id: account.id, p_course_id: courseId, p_folder: "assignment", p_fingerprint: profile.configurationFingerprint,
    p_instructions: context.instructions,
    p_targets: [
      { target: { owner: "School", repo: "Other", sourceRef: "Main", sourceCommit: sha }, source: context.source },
      { target: { owner: "School", repo: "Repo", sourceRef: "Main", sourceCommit: currentSha }, source: context.source },
    ],
  });
  expect(rpc).toHaveBeenCalledWith("repo_grade_begin_preparation", {
    p_user_id: account.id, p_id: preparationId, p_token: preparationToken,
  });
  const finishArgs = rpc.mock.calls.find(([name]) => name === "repo_grade_finish_preparation")![1];
  expect(finishArgs).toMatchObject({
    p_user_id: account.id, p_id: preparationId, p_token: preparationToken, p_key: claimArgs.p_key, p_outcome: "succeeded",
    p_receipt: { accountId: account.id, courseId, folder: "assignment", rubric: expect.stringContaining("Method (25%)") },
  });
  expect(rpc).toHaveBeenCalledWith("repo_grade_claim_startup_target", {
    p_user_id: account.id, p_batch_id: batchId, p_course_id: courseId, p_repo: "School/Repo", p_folder: "assignment",
    p_source_ref: "Main", p_source_sha: currentSha, p_course_config: claimArgs.p_course_config,
    p_cohort_id: preparationId, p_receipt: finishArgs.p_receipt, p_preparation_key: claimArgs.p_key,
  });
  expect(noRetry.mock.calls).toEqual([
    ["repo_grade_bootstrap_preparation", false], ["repo_grade_claim_preparation", false], ["repo_grade_begin_preparation", false],
    ["repo_grade_finish_preparation", false], ["repo_grade_claim_startup_target", false],
  ]);
  expect(evaluateRepoGrade).toHaveBeenCalledExactlyOnceWith(
    { owner: "School", repo: "Repo" }, profile.instructions, finishArgs.p_receipt.rubric, "gemini", undefined,
    "assignment", true, false, true, currentSha,
    expect.objectContaining({ preparedReadme: { path: context.source.path, instructions: context.instructions } }),
  );
  const [, request] = fetchModel.mock.calls[0];
  expect(JSON.parse(String(request.body))).toMatchObject({
    contents: [{ role: "user", parts: [{ text: context.instructions }] }],
    system_instruction: { parts: [{ text: expect.stringContaining("required non-code deliverables") }] },
  });
  await expect(runRepoGradeStartupTargetAction(account.id, courseId, "School/Other", "assignment", "Main", sha, batchId))
    .resolves.toMatchObject({ status: "no-submission", preparationDiagnostic: { status: "ready" } });
  expect(fetchModel).toHaveBeenCalledTimes(1);
});

it.each([
  [{ begin: "lost" }, "unknown", "unknown", 0],
  [{ begin: "denied" }, "failed", "failed-before-dispatch", 0],
  [{ finish: "lost", readback: false }, "unknown", "succeeded", 1],
] as const)("fails closed on %j without an evaluation or retry", async (options, status, outcome, modelCalls) => {
  const { fetchModel } = await paidPreparationFixture(options);
  await expect(runStartupTarget()).resolves.toMatchObject({ status, preparationDiagnostic: { status } });
  expect(fetchModel).toHaveBeenCalledTimes(modelCalls);
  expect(rpc).toHaveBeenCalledWith("repo_grade_finish_preparation", expect.objectContaining({ p_outcome: outcome }));
  expect(rpc.mock.calls.filter(([name]) => name === "repo_grade_finish_preparation")).toHaveLength(1);
  expect(claimRepoGrade).not.toHaveBeenCalled();
  expect(evaluateRepoGrade).not.toHaveBeenCalled();
});

it.each(["capacity", "busy", "explicit-retry-required"] as const)("preserves a %s admission without beginning or grading", async (claimStatus) => {
  const { events, fetchModel } = await paidPreparationFixture({ claimStatus });
  await expect(runStartupTarget()).resolves.toMatchObject({ status: claimStatus, preparationDiagnostic: { status: claimStatus } });
  expect(events).toEqual(["repo_grade_read_profile", "repo_grade_bootstrap_preparation", "repo_grade_claim_preparation"]);
  expect(fetchModel).not.toHaveBeenCalled();
  expect(evaluateRepoGrade).not.toHaveBeenCalled();
});

it("retries only the selected generation with rederived evidence and a new begin permit", async () => {
  const { events, fetchModel } = await paidPreparationFixture({ claimStatus: "explicit-retry-required" });
  const startup = await runStartupTarget();
  expect(startup).toMatchObject({
    status: "explicit-retry-required",
    preparationRetry: { key: expect.stringMatching(/^[0-9a-f]{64}$/), generation: preparationRetryGeneration },
  });
  expect(JSON.stringify(startup)).not.toContain(preparationToken);
  const { p_key: key } = rpc.mock.calls.find(([name]) => name === "repo_grade_claim_preparation")![1];
  events.length = 0;
  await expect(retryRepoGradePreparationAction(account.id, courseId, "assignment", key, preparationRetryGeneration))
    .resolves.toEqual({ status: "ready", durationMs: expect.any(Number) });
  expect(events).toEqual([
    "repo_grade_read_profile", "repo_grade_claim_preparation", "repo_grade_begin_preparation", "gemini",
    "repo_grade_finish_preparation",
  ]);
  expect(rpc).toHaveBeenCalledWith("repo_grade_claim_preparation", expect.objectContaining({
    p_user_id: account.id, p_course_id: courseId, p_folder: "assignment", p_key: key,
    p_retry_generation: preparationRetryGeneration,
    p_targets: expect.arrayContaining([expect.objectContaining({ target: expect.objectContaining({ sourceCommit: currentSha }) })]),
  }));
  expect(rpc).toHaveBeenCalledWith("repo_grade_begin_preparation", {
    p_user_id: account.id, p_id: preparationId, p_token: preparedGradeToken,
  });
  expect(fetchModel).toHaveBeenCalledTimes(1);
  expect(evaluateRepoGrade).not.toHaveBeenCalled();
});

it.each(["busy", "unknown", "retry-unavailable", "configuration-changed", "lost"] as const)(
  "does not dispatch or return another selector for a %s retry claim",
  async (retryStatus) => {
    const { events, fetchModel } = await paidPreparationFixture({ claimStatus: "explicit-retry-required", retryStatus });
    await runStartupTarget();
    const { p_key: key } = rpc.mock.calls.find(([name]) => name === "repo_grade_claim_preparation")![1];
    events.length = 0;
    await expect(retryRepoGradePreparationAction(account.id, courseId, "assignment", "c".repeat(64), preparationRetryGeneration))
      .resolves.toMatchObject({ status: "configuration-changed" });
    expect(events).toEqual(["repo_grade_read_profile"]);
    events.length = 0;
    await expect(retryRepoGradePreparationAction(account.id, courseId, "assignment", key, preparationRetryGeneration))
      .resolves.toEqual({ status: retryStatus === "lost" ? "unknown" : retryStatus, durationMs: expect.any(Number) });
    expect(events).toEqual(["repo_grade_read_profile", "repo_grade_claim_preparation"]);
    expect(fetchModel).not.toHaveBeenCalled();
  },
);

it("rejects an unpinned ref, different tuning and mismatched admitted evidence before evaluation", async () => {
  const { fetchModel } = await paidPreparationFixture({ policyVersion: "repo-grade-gemini-rubric-v1" });
  await expect(runRepoGradeStartupTargetAction(account.id, courseId, "School/Repo", "assignment", "Other", currentSha, batchId))
    .resolves.toEqual({ status: "ungraded" });
  expect(rpc).not.toHaveBeenCalled();
  await expect(runStartupTarget()).resolves.toMatchObject({
    status: "configuration-changed", preparationDiagnostic: { status: "configuration-changed" },
  });
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(["repo_grade_read_profile", "repo_grade_bootstrap_preparation"]);
  expect(fetchModel).not.toHaveBeenCalled();
  expect(evaluateRepoGrade).not.toHaveBeenCalled();

  const mismatched = await paidPreparationFixture({ wrongContext: true });
  await expect(runStartupTarget()).resolves.toMatchObject({
    status: "configuration-changed", preparationDiagnostic: { status: "ready" },
  });
  expect(mismatched.events.at(-1)).toBe("repo_grade_claim_startup_target");
  expect(evaluateRepoGrade).not.toHaveBeenCalled();
});

it.each([true, false])("distinguishes confirmed provider refusal from uncertain transport (%s)", async (refused) => {
  const { fetchModel } = await paidPreparationFixture();
  if (refused) fetchModel.mockResolvedValueOnce(new Response("private body", { status: 429 }));
  else fetchModel.mockRejectedValueOnce(new Error("private transport failure"));
  const status = refused ? "failed" : "unknown";
  await expect(runStartupTarget()).resolves.toMatchObject({ status, preparationDiagnostic: { status } });
  expect(fetchModel).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("repo_grade_finish_preparation", expect.objectContaining({ p_outcome: status }));
  expect(batchRpc).toHaveBeenCalledWith("repo_grade_finish_startup_target", expect.objectContaining({ p_status: "not-started" }));
  expect(claimRepoGrade).not.toHaveBeenCalled();
  expect(evaluateRepoGrade).not.toHaveBeenCalled();
});

it.each([
  ["Intro to Programming", null],
  ["Special Topics", null],
  ["Special Topics", "legacy"],
] as const)("provisions a folder profile from pinned instructions for %s with course kind %s", async (courseName, rawKind) => {
  const { events, fetchModel, courseConfig } = await paidPreparationFixture({
    missingProfile: true, courseName, rawKind,
  });
  await expect(runStartupTarget()).resolves.toMatchObject({
    status: "no-submission", preparationDiagnostic: { status: "ready" },
  });
  expect(rpc).toHaveBeenCalledWith("repo_grade_bootstrap_preparation", {
    p_user_id: account.id, p_course_id: courseId, p_folder: "assignment", p_course_config: courseConfig,
    p_course_kind_basis: [courseName, rawKind], p_course_kind: "coding",
    p_prompt_parser_version: expect.stringMatching(/^repo-grade-gemini-rubric-v1:[a-f0-9]{64}:[a-f0-9]{64}$/),
    p_expected_fingerprint: null,
    p_profile: expect.objectContaining({
      sourceRef: null, useReadmeInstructions: true, instructions: "", runCode: false, rubricPolicy: "generate",
    }),
  });
  expect(events.indexOf("repo_grade_bootstrap_preparation")).toBeLessThan(events.indexOf("repo_grade_claim_preparation"));
  expect(fetchModel).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(fetchModel.mock.calls[0][1].body))).toMatchObject({
    contents: [{ role: "user", parts: [{ text: "Describe your method and show the findings." }] }],
    system_instruction: { parts: [{ text: expect.stringContaining("including code where the assignment requires it") }] },
  });
});

it.each([{ missingProfile: true }, { startupDefault: true }])("uses pinned assignment instructions despite an unscoped course rubric (%j)", async (origin) => {
  const { events, fetchModel } = await paidPreparationFixture({ ...origin, courseRubric: "Course rubric" });
  await expect(runStartupTarget()).resolves.toMatchObject({ status: "no-submission", preparationDiagnostic: { status: "ready" } });
  expect(events).toContain("repo_grade_bootstrap_preparation");
  expect(fetchModel).toHaveBeenCalledTimes(1);
  expect(String(fetchModel.mock.calls[0][1].body)).toContain("Describe your method and show the findings.");
  expect(String(fetchModel.mock.calls[0][1].body)).not.toContain("Course rubric");
});

it("preserves an explicit folder profile with a saved course rubric", async () => {
  await paidPreparationFixture({ courseRubric: "Course rubric" });
  await expect(runStartupTarget()).resolves.toMatchObject({ status: "no-submission" });
});

it("excludes proven unrelated override failures and blocks unresolved eligible default refs", async () => {
  const { fetchModel } = await paidPreparationFixture({ missingProfile: true });
  const other = { ...source(), repo: "School/Other", sourceCommit: sha };
  const unrelated = { status: "blocked", repo: other.repo, sourceRef: "override", reason: "unavailable" } as const;
  const defaultSourceRefs = { "school/repo": "Main", "school/other": "Main" };
  const unavailableDefault = { ...unrelated, sourceRef: "Main" };
  vi.mocked(discoverRepoGradeSources).mockResolvedValueOnce({
    status: "scanned", enumerationComplete: true, defaultSourceRefs, repos: [source(), unavailableDefault, unrelated],
  }).mockResolvedValueOnce({
    status: "scanned", enumerationComplete: true, defaultSourceRefs, repos: [source(), unrelated, other],
  });
  await expect(runStartupTarget()).resolves.toMatchObject({ status: "profile-unavailable" });
  expect(fetchModel).not.toHaveBeenCalled();
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(["repo_grade_read_profile"]);
  await expect(runStartupTarget()).resolves.toMatchObject({ status: "no-submission" });
  expect(fetchModel).toHaveBeenCalledTimes(1);
});

it.each(["", "Correctness (100%): Check the loop."])("prepares one folder rubric from pinned READMEs with saved rubric %j", async (rubric) => {
  vi.spyOn(admissionMode, "repoGradeAdmissionMode").mockReturnValue("coordinated");
  discover(source(), { ...source(), repo: "School/Other", sourceCommit: sha });
  readReceipts.mockResolvedValue({ data: [], count: 0, error: null });
  const profile = savedStartupProfile(rubric, { useReadmeInstructions: true });
  const path = "assignment/README.md";
  const instructions = "Create a file named solution.py and include a loop.";
  vi.mocked(readPinnedRepoGradeReadme).mockImplementation(async (target) => ({
    status: "present", target, path, text: instructions, blobSha: sha,
  }));
  rpc.mockImplementation(async (name, args) => {
    if (name === "repo_grade_read_profile") return { data: { profile, receipt: null }, error: null };
    if (name === "repo_grade_freeze_rubric") return { data: args.p_receipt, error: null };
    throw new Error(`Unexpected profile call ${name}`);
  });
  vi.mocked(claimRepoGrade).mockResolvedValue({ status: "claimed", claim });
  vi.mocked(settleRepoGrade).mockResolvedValue(true);
  vi.mocked(evaluateRepoGrade).mockResolvedValue({
    noSubmission: true, fullName: "School/Repo", sourceCommit: currentSha, digestTruncated: false,
    reason: "No submission", readmePath: path,
  });

  await expect(runStartupTarget()).resolves.toEqual({ status: "no-submission" });
  expect(vi.mocked(readPinnedRepoGradeReadme).mock.calls.map(([target, folder]) => [target.repo, target.sourceCommit, folder]))
    .toEqual([["Repo", currentSha, "assignment"], ["Other", sha, "assignment"]]);
  const frozen = rpc.mock.calls[1][1];
  if (rubric) expect(frozen.p_receipt.rubric).toBe(rubric);
  else expect(frozen.p_receipt.rubric).toContain("Submitted a .py file");
  expect(rpc.mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(claimRepoGrade).mock.invocationCallOrder[0]);
  expect(evaluateRepoGrade).toHaveBeenCalledExactlyOnceWith(
    { owner: "School", repo: "Repo" }, profile.instructions, frozen.p_receipt.rubric, "embedded", undefined,
    "assignment", true, false, true, currentSha, expect.objectContaining({ preparedReadme: { path, instructions } }),
  );
  expect(callLlm).not.toHaveBeenCalled();

  vi.mocked(readPinnedRepoGradeReadme).mockImplementation(async (target) => ({
    status: "present", target, path, text: target.repo === "Other" ? "Different assignment" : instructions, blobSha: sha,
  }));
  await expect(runStartupTarget()).resolves.toEqual({ status: "profile-unavailable" });
  vi.mocked(readPinnedRepoGradeReadme).mockClear();
  vi.mocked(discoverRepoGradeSources).mockResolvedValueOnce({
    status: "scanned", enumerationComplete: true,
    repos: [source(), { status: "blocked", reason: "unavailable", repo: "School/Other", sourceRef: "trunk" }],
  });
  await expect(runStartupTarget()).resolves.toEqual({ status: "profile-unavailable" });
  expect(readPinnedRepoGradeReadme).not.toHaveBeenCalled();
  expect(vi.mocked(claimRepoGrade)).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls.map(([name]) => name)).toEqual([
    "repo_grade_read_profile", "repo_grade_freeze_rubric", "repo_grade_read_profile", "repo_grade_read_profile",
  ]);
});

it("requires every repo's explicit ref while excluding failed unrelated branches", async () => {
  admitStartupFixture();
  const selected = source();
  const other = { ...source(), repo: "School/Other", sourceCommit: sha };
  const unrelated = { status: "blocked" as const, reason: "unavailable" as const, repo: other.repo, sourceRef: "trunk" };
  const found = { status: "scanned" as const, enumerationComplete: true, repos: [selected, unrelated, other] };
  const profile = savedStartupProfile("Correctness (100%): Check the loop.", { useReadmeInstructions: true, sourceRef: "Main" });
  vi.mocked(readCurrentRepoGradeProfilesForOwner).mockResolvedValue(new Map([[profile.folder, profile.sourceRef]]));
  vi.mocked(discoverRepoGradeSources).mockResolvedValueOnce(found);
  rpc.mockImplementation(async (name, args) => {
    if (name === "repo_grade_read_profile") return { data: { profile, receipt: null }, error: null };
    if (name === "repo_grade_freeze_rubric") return { data: args.p_receipt, error: null };
    throw new Error(`Unexpected profile call ${name}`);
  });
  vi.mocked(readPinnedRepoGradeReadme).mockImplementation(async (target) => ({ status: "absent", target }));
  vi.mocked(settleRepoGrade).mockResolvedValue(true);
  vi.mocked(evaluateRepoGrade).mockResolvedValue({
    noSubmission: true, fullName: selected.repo, sourceCommit: currentSha, digestTruncated: false, reason: "No submission",
  });

  await expect(runStartupTarget()).resolves.toEqual({ status: "no-submission" });
  expect(vi.mocked(readPinnedRepoGradeReadme).mock.calls.map(([target]) => [target.repo, target.sourceRef])).toEqual([
    ["Repo", "Main"], ["Other", "Main"],
  ]);
  for (const unresolved of [[], [{ ...unrelated, sourceRef: "Main" }], [other, other]]) {
    vi.mocked(discoverRepoGradeSources).mockResolvedValueOnce({ ...found, repos: [selected, unrelated, ...unresolved] });
    await expect(runStartupTarget()).resolves.toEqual({ status: "profile-unavailable" });
  }
  vi.mocked(discoverRepoGradeSources).mockResolvedValueOnce({ ...found, enumerationComplete: false });
  await expect(runStartupTarget()).resolves.toEqual({ status: "partial" });
  expect(readPinnedRepoGradeReadme).toHaveBeenCalledTimes(2);
  expect(claimRepoGrade).toHaveBeenCalledTimes(1);
});

it("uses compact owner/course history and matches exact discovered targets without enabling dispatch", async () => {
  discover(source(["assignment", "NoSubmission", "pending", "current-commit", "exact-folder", "exact-repo"]));
  const data = [
    receipt(10, { status: "failed", mode: "retry", profile_fingerprint: "new-settings" }),
    receipt(9, { folder: "NoSubmission", status: "partial", mode: "retry" }),
    receipt(8, { folder: "pending", status: "claimed" }),
    receipt(7, { folder: "pending", status: "failed" }),
    receipt(4, { folder: "Exact-Folder", source_ref: "previous-ref" }),
    receipt(3, { folder: "exact-repo", repo: "school/other", source_ref: "previous-ref" }),
    receipt(2, { folder: "NoSubmission", source_ref: "previous-ref", status: "no-submission" }),
    receipt(1, { source_ref: "previous-ref", profile_fingerprint: "old-settings", feedback: "private", claim_token: "private" }),
  ];
  readReceipts.mockResolvedValue({ data, count: data.length, error: null });
  const result = await planRepoGradeCourseAction(courseId.toUpperCase());
  expect(from).toHaveBeenCalledExactlyOnceWith("repo_grade_attempts");
  expect(receiptQuery.select).toHaveBeenCalledExactlyOnceWith(
    "generation, user_id, course_id, repo, folder, source_ref, source_sha, mode, status, claimed_at", { count: "exact" },
  );
  expect(receiptQuery.eq.mock.calls).toEqual([["user_id", account.id], ["course_id", courseId]]);
  expect(receiptQuery.neq).toHaveBeenCalledExactlyOnceWith("mode", "manual");
  expect(receiptQuery.in).toHaveBeenCalledExactlyOnceWith("source_sha", [currentSha]);
  expect(receiptQuery.order).toHaveBeenCalledExactlyOnceWith("generation", { ascending: false });
  expect(readReceipts).toHaveBeenCalledExactlyOnceWith(false);
  expect(result).toMatchObject({ status: "planned", execution: "runtime-unavailable", preview: { history: "complete" } });
  if (result.status !== "planned") throw new Error("Expected preview");
  const work = new Map(result.preview.targets.map((target) => [target.folder, target]));
  expect(work.get("assignment")).toEqual({
    repo: "School/Repo", sourceRef: "Main", commit: currentSha, folder: "assignment", state: { status: "succeeded" },
  });
  expect(work.get("NoSubmission")?.state).toEqual({ status: "no-submission" });
  expect(work.get("pending")?.state).toEqual({ status: "claimed" });
  for (const folder of ["current-commit", "exact-folder", "exact-repo"]) {
    expect(work.get(folder)?.state).toEqual({ status: "blocked", reason: "runtime-unavailable" });
  }
  expect(JSON.stringify(result)).not.toMatch(/old-settings|new-settings|private|queued|running/);
  expect(readRepoGradeHistoryForOwner).not.toHaveBeenCalled();
});

it.each([
  { older: "succeeded", newer: "unknown", expected: "succeeded" },
  { older: "unknown", newer: "failed", expected: "unknown" },
  { older: "unknown", newer: "claimed", expected: "unknown" },
  { older: "claimed", newer: "partial", expected: "claimed" },
])("previews $expected for the same SHA across refs with an older $older and newer $newer", async ({ older, newer, expected }) => {
  discover(source());
  const data = [receipt(2, { status: newer }), receipt(1, { source_ref: "previous-ref", status: older })];
  readReceipts.mockResolvedValue({ data, count: data.length, error: null });
  await expect(planRepoGradeCourseAction(courseId)).resolves.toMatchObject({
    execution: "runtime-unavailable",
    preview: { history: "complete", targets: [{ sourceRef: "Main", commit: currentSha, state: { status: expected } }] },
  });
});

it("classifies a stale claim as unknown and a proven empty history as runtime-blocked", async () => {
  discover(source());
  readReceipts.mockResolvedValueOnce({
    data: [receipt(1, { status: "claimed", claimed_at: "2026-01-01T00:00:00Z" })], count: 1, error: null,
  }).mockResolvedValueOnce({ data: [], count: 0, error: null });
  await expect(planRepoGradeCourseAction(courseId)).resolves.toMatchObject({
    preview: { history: "complete", targets: [{ state: { status: "unknown" } }] },
  });
  await expect(planRepoGradeCourseAction(courseId)).resolves.toMatchObject({
    preview: { history: "complete", targets: [{ state: { status: "blocked", reason: "runtime-unavailable" } }] },
  });
});

it.each([
  { label: "foreign owner", data: [receipt(2), receipt(1, { user_id: "other-owner" })], count: 2 },
  { label: "foreign course", data: [receipt(2), receipt(1, { course_id: "other-course" })], count: 2 },
  { label: "manual attempt", data: [receipt(2), receipt(1, { mode: "manual" })], count: 2 },
  { label: "unrecognized attempt status", data: [receipt(2), receipt(1, { status: "private" })], count: 2 },
  { label: "unpinned commit", data: [receipt(2), receipt(1, { source_sha: sha })], count: 2 },
  { label: "duplicate generation", data: [receipt(2), receipt(2)], count: 2 },
  { label: "missing body", data: null, count: 0 },
  { label: "missing count", data: [], count: null },
  { label: "truncated body", data: [receipt(1)], count: 2 },
  { label: "missing table", data: null, count: null, error: { message: "private database error" } },
])("keeps every target unknown with $label", async (result) => {
  discover(source());
  readReceipts.mockResolvedValue({ error: null, ...result });
  const preview = await planRepoGradeCourseAction(courseId);
  expect(preview).toMatchObject({
    status: "planned", execution: "runtime-unavailable", preview: {
      history: "unknown", targets: [{ state: { status: "blocked", reason: "history-unavailable" } }],
    },
  });
  expect(JSON.stringify(preview)).not.toContain("private");
});

it("requires an exact match at the receipt cap and fails closed on a thrown request", async () => {
  discover(source());
  const data = Array.from({ length: 1_000 }, (_, index) => receipt(1_001 - index));
  readReceipts.mockResolvedValueOnce({ data, count: 1_000, error: null })
    .mockResolvedValueOnce({ data, count: 1_001, error: null })
    .mockRejectedValueOnce(new Error("private transport failure"));
  await expect(planRepoGradeCourseAction(courseId)).resolves.toMatchObject({
    preview: { history: "complete", targets: [{ state: { status: "succeeded" } }] },
  });
  for (let request = 0; request < 2; request += 1) {
    await expect(planRepoGradeCourseAction(courseId)).resolves.toMatchObject({
      preview: { history: "unknown", targets: [{ state: { status: "blocked", reason: "history-unavailable" } }] },
    });
  }
  expect(receiptQuery.limit.mock.calls).toEqual([[1_000], [1_000], [1_000]]);
});
