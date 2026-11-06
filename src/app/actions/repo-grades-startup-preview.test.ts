import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { callLlm } from "@/lib/llm";
import { evaluateRepoGrade } from "@/lib/repo-grade-evaluator";
import { discoverRepoGradeSources } from "@/lib/repo-grades-dashboard/discovery";
import { claimRepoGrade } from "@/lib/repo-grades-dashboard/ledger";
import { readPinnedRepoGradeReadme } from "@/lib/repo-grades-dashboard/preparation-readme";
import { readCurrentRepoGradeProfilesForOwner } from "@/lib/repo-grades-dashboard/profile-store";
import { getAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { previewRepoGradeStartupPlanAction, readRepoGradeStartupReadinessAction, runRepoGradeStartupTargetAction } from "./repo-grades-dashboard";

const { select } = vi.hoisted(() => ({ select: vi.fn() }));
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
vi.mock("@/lib/repo-grades-dashboard/ledger", async (original) => ({
  ...await original<typeof import("@/lib/repo-grades-dashboard/ledger")>(),
  claimRepoGrade: vi.fn(),
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

const eq = vi.fn();
const maybeSingle = vi.fn();
const receiptQuery = {
  select: vi.fn(), eq: vi.fn(), neq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(), abortSignal: vi.fn(), retry: readReceipts,
};

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: account }, error: null });
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser,
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) },
    },
  } as never);
  vi.mocked(getAppUser).mockResolvedValue(ownerRow);
  vi.mocked(readCurrentRepoGradeProfilesForOwner).mockResolvedValue(new Map());
  vi.mocked(createServiceClient).mockReturnValue({ from, rpc } as never);
  from.mockReturnValue(receiptQuery);
  for (const method of ["select", "eq", "neq", "in", "order", "limit", "abortSignal"] as const) {
    receiptQuery[method].mockReturnValue(receiptQuery);
  }
  select.mockReturnValue({ eq });
  eq.mockReturnValue({ eq, maybeSingle });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const currentSha = "b".repeat(40);

function source(folders = ["assignment"]) {
  return { status: "ready" as const, repo: "School/Repo", sourceRef: "Main", sourceCommit: currentSha, folders };
}

function receipt() {
  return {
    generation: 1, user_id: account.id, course_id: courseId, repo: "school/repo", folder: "assignment",
    source_ref: "Main", source_sha: currentSha, mode: "automatic", status: "succeeded",
    claimed_at: new Date().toISOString(),
  };
}

it.each([
  { session: "signed out", user: null, role: "owner", message: "Not authorized. Sign in with an approved account." },
  { session: "active instructor", user: account, role: "instructor", message: "This action is limited to the workspace owner." },
] as const)("denies a $session caller before storage or GitHub", async ({ user, role, message }) => {
  vi.stubEnv("REPO_GRADE_DISCOVERY_ENABLED", "true");
  getUser.mockResolvedValue({ data: { user }, error: null });
  vi.mocked(getAppUser).mockResolvedValue({ ...ownerRow, role });
  await expect(previewRepoGradeStartupPlanAction(courseId, account.id)).rejects.toThrow(message);
  expect(select).not.toHaveBeenCalled();
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
});

it("rejects the preview when the account changes before the request", async () => {
  vi.stubEnv("REPO_GRADE_DISCOVERY_ENABLED", "true");
  await expect(previewRepoGradeStartupPlanAction(courseId, "another-account")).resolves.toEqual({ status: "course-unavailable" });
  expect(select).not.toHaveBeenCalled();
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
});

it.each([undefined, "false", "TRUE"])("keeps the owner preview off for discovery flag %j", async (flag) => {
  vi.stubEnv("REPO_GRADE_DISCOVERY_ENABLED", flag);
  await expect(previewRepoGradeStartupPlanAction(courseId, account.id)).resolves.toEqual({ status: "discovery-disabled" });
  expect(select).not.toHaveBeenCalled();
  expect(discoverRepoGradeSources).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

it("returns a bounded pinned plan and read-only history even when automatic startup is unavailable", async () => {
  vi.stubEnv("REPO_GRADE_DISCOVERY_ENABLED", "true");
  vi.stubEnv("REPO_GRADE_ADMISSION_MODE", "coordinated");
  const folders = ["assignment", ...Array.from({ length: 50 }, (_, index) => `folder-${index}`)];
  const blockedSource = { status: "blocked" as const, repo: "School/Other", sourceRef: "Main", reason: "rate-limited" as const };
  maybeSingle.mockResolvedValue({ data: { github_org: "school", rubric_data: "private" }, error: null });
  vi.mocked(discoverRepoGradeSources).mockResolvedValue({
    status: "scanned", enumerationComplete: true, repos: [source(folders), blockedSource],
  });
  readReceipts.mockResolvedValue({ data: [receipt()], count: 1, error: null });

  const preview = await previewRepoGradeStartupPlanAction(courseId.toUpperCase(), account.id);
  expect(preview).toMatchObject({
    status: "preview",
    discovery: { status: "scanned", enumerationComplete: true, incompleteSources: 1 },
    history: "complete",
    targetCount: 51,
  });
  if (preview.status !== "preview") throw new Error("Expected a read-only preview");
  expect(preview.targets).toHaveLength(50);
  expect(preview.targets[0]).toEqual({
    repo: "School/Repo", folder: "assignment", sourceRef: "Main", commit: currentSha, state: { status: "succeeded" },
  });
  expect(preview.targets[1]?.state).toEqual({ status: "blocked", reason: "runtime-unavailable" });
  expect(preview.discovery).not.toHaveProperty("repos");
  expect(JSON.stringify(preview)).not.toContain("private");
  expect(eq.mock.calls).toEqual([["user_id", account.id], ["id", courseId]]);
  expect(await readRepoGradeStartupReadinessAction(account.id)).toEqual({ status: "unavailable" });
  expect(await runRepoGradeStartupTargetAction(account.id, courseId, "School/Repo", "assignment", "Main", currentSha, batchId)).toEqual({ status: "runtime-unavailable" });
  expect(rpc).not.toHaveBeenCalled();
  expect(claimRepoGrade).not.toHaveBeenCalled();
  expect(readPinnedRepoGradeReadme).not.toHaveBeenCalled();
  expect(evaluateRepoGrade).not.toHaveBeenCalled();
  expect(callLlm).not.toHaveBeenCalled();
});

it("reports an incomplete owner preview without inferring targets or reading history", async () => {
  vi.stubEnv("REPO_GRADE_DISCOVERY_ENABLED", "true");
  maybeSingle.mockResolvedValue({ data: { github_org: "school" }, error: null });
  vi.mocked(discoverRepoGradeSources).mockResolvedValue({
    status: "scanned", enumerationComplete: false, repos: [source()],
  });
  await expect(previewRepoGradeStartupPlanAction(courseId, account.id)).resolves.toEqual({
    status: "preview",
    discovery: { status: "scanned", enumerationComplete: false, incompleteSources: 0 },
    history: "not-read",
    targetCount: 0,
    targets: [],
  });
  expect(from).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

it("splits pinned history across bounded requests and rejects incomplete later chunks", async () => {
  const repos = Array.from({ length: 41 }, (_, index) => ({
    ...source(), repo: `School/Repo-${String(index).padStart(2, "0")}`, sourceCommit: index.toString(16).padStart(40, "0"),
  }));
  vi.stubEnv("REPO_GRADE_DISCOVERY_ENABLED", "true");
  maybeSingle.mockResolvedValue({ data: { github_org: "school" }, error: null });
  vi.mocked(discoverRepoGradeSources).mockResolvedValue({ status: "scanned", enumerationComplete: true, repos });
  const last = repos.at(-1)!;
  const grade = { ...receipt(), repo: last.repo, source_sha: last.sourceCommit };
  readReceipts.mockResolvedValueOnce({ data: [], count: 0, error: null })
    .mockResolvedValueOnce({ data: [grade], count: 1, error: null })
    .mockResolvedValueOnce({ data: [], count: 0, error: null })
    .mockResolvedValueOnce({ data: [], count: 1, error: null });

  await expect(previewRepoGradeStartupPlanAction(courseId, account.id)).resolves.toMatchObject({
    status: "preview", history: "complete", targets: expect.arrayContaining([
      { repo: last.repo, sourceRef: "Main", commit: last.sourceCommit, folder: "assignment", state: { status: "succeeded" } },
    ]),
  });
  const requested = receiptQuery.in.mock.calls.slice(0, 2).flatMap(([, commits]) => commits);
  expect(requested.toSorted()).toEqual(repos.map((repo) => repo.sourceCommit).toSorted());
  expect(receiptQuery.in.mock.calls.slice(0, 2).map(([, commits]) => commits.length)).toEqual([40, 1]);
  expect(receiptQuery.abortSignal.mock.calls[0][0]).toBe(receiptQuery.abortSignal.mock.calls[1][0]);

  await expect(previewRepoGradeStartupPlanAction(courseId, account.id)).resolves.toMatchObject({
    status: "preview", history: "unknown", targets: expect.arrayContaining([
      expect.objectContaining({ repo: last.repo, state: { status: "blocked", reason: "history-unavailable" } }),
    ]),
  });
});
