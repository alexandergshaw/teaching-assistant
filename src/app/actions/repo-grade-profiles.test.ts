import { beforeEach, expect, it, vi } from "vitest";
import { getGeminiModel } from "@/lib/gemini";
import { getAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { readRepoGradeProfileAction, reviewRepoGradePreparationPolicyAction, saveRepoGradeProfileAction } from "./repo-grade-profiles";

vi.mock("@/lib/gemini", async (original) => ({
  ...await original<typeof import("@/lib/gemini")>(),
  getGeminiModel: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }));
vi.mock("@/lib/supabase/app-users", async (original) => ({
  ...await original<typeof import("@/lib/supabase/app-users")>(),
  getAppUser: vi.fn(),
}));

const owner = { id: "a9e53b89-90df-42eb-b6bb-91c1fa225a8f", email: "owner@example.test" };
const courseId = "18d742a1-46a5-4b3f-af5d-5fc9b55023c1";
const folder = "assignments/module 1";
const ownerRow: AppUserRow = {
  ...owner, displayName: null, status: "active", role: "owner", approvedAt: null, approvedBy: null,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  statusChangedAt: null, statusChangedBy: null, roleGrantedBy: null,
};
const getUser = vi.fn();
const from = vi.fn();
const select = vi.fn();
const eq = vi.fn();
const maybeSingle = vi.fn();
const rpc = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: owner }, error: null });
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser,
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" } }) },
    },
  } as never);
  vi.mocked(getAppUser).mockResolvedValue(ownerRow);
  vi.mocked(getGeminiModel).mockReturnValue("server-model");
  vi.mocked(createServiceClient).mockReturnValue({ from, rpc } as never);
  from.mockReturnValue({ select });
  select.mockReturnValue({ eq });
  eq.mockReturnValue({ eq, maybeSingle });
  maybeSingle.mockResolvedValue({ data: { github_org: " school " }, error: null });
});

it.each([
  { caller: "signed out", user: null, role: "owner", message: "Not authorized" },
  { caller: "an active instructor", user: owner, role: "instructor", message: "limited to the workspace owner" },
] as const)("denies $caller before any privileged storage access", async ({ user, role, message }) => {
  getUser.mockResolvedValue({ data: { user }, error: null });
  vi.mocked(getAppUser).mockResolvedValue({ ...ownerRow, role });
  await expect(readRepoGradeProfileAction(courseId, folder)).rejects.toThrow(message);
  await expect(saveRepoGradeProfileAction(courseId, folder, {}, null)).rejects.toThrow(message);
  await expect(reviewRepoGradePreparationPolicyAction(courseId, folder)).rejects.toThrow(message);
  expect(createServiceClient).not.toHaveBeenCalled();
});

it("previews the deployed policy and binds explicit apply to the reviewed scope and policy revision", async () => {
  const fingerprint = "b".repeat(64);
  const revision = "77b39c8c-5805-4f0a-85f9-149c70288810";
  const snapshot = {
    model: "server-model", graderVersion: "repo-grader-v1", courseKind: "coding",
    basis: ["Private course name", "applied"], basisMatches: false, revision,
    version: "old-policy", profileFingerprint: fingerprint,
  };
  const read = vi.fn().mockResolvedValue({ data: snapshot, error: null });
  const write = vi.fn().mockResolvedValue({ data: "updated", error: null });
  rpc.mockImplementation((name: string) => ({ retry: name === "repo_grade_preparation_policy_snapshot" ? read : write }));
  const preview = await reviewRepoGradePreparationPolicyAction(courseId, folder);
  expect(preview.status).toBe("preview");
  if (preview.status !== "preview") throw new Error("Expected a policy preview");
  expect(preview.current).toEqual({ version: "old-policy", courseKind: "coding" });
  expect(preview.replacement).toEqual({ version: expect.stringMatching(/^repo-grade-gemini-rubric-v1:[0-9a-f]{64}:[0-9a-f]{64}$/), courseKind: "applied" });
  expect(JSON.stringify(preview)).not.toContain("Private course name");
  expect(rpc.mock.calls).toEqual([["repo_grade_preparation_policy_snapshot", {
    p_user_id: owner.id, p_course_id: courseId, p_folder: folder,
  }]]);

  await expect(reviewRepoGradePreparationPolicyAction(courseId, `${folder}/different`, preview.preview)).resolves.toEqual({ status: "conflict" });
  read.mockResolvedValueOnce({ data: { ...snapshot, basis: ["Renamed course", "applied"] }, error: null });
  await expect(reviewRepoGradePreparationPolicyAction(courseId, folder, preview.preview)).resolves.toEqual({ status: "conflict" });
  read.mockResolvedValueOnce({ data: { ...snapshot, revision: courseId }, error: null });
  await expect(reviewRepoGradePreparationPolicyAction(courseId, folder, preview.preview)).resolves.toEqual({ status: "conflict" });
  expect(write).not.toHaveBeenCalled();
  await expect(reviewRepoGradePreparationPolicyAction(courseId, folder, preview.preview)).resolves.toEqual({ status: "updated" });
  expect(rpc).toHaveBeenLastCalledWith("repo_grade_update_preparation_policy", {
    p_user_id: owner.id, p_course_id: courseId, p_folder: folder, p_expected_revision: revision,
    p_expected_fingerprint: fingerprint, p_course_kind: "applied", p_prompt_parser_version: preview.replacement.version,
  });
  expect(write).toHaveBeenCalledExactlyOnceWith(false);
});

it.each([
  { data: null, status: "course-unavailable" },
  { data: { github_org: "  " }, status: "organization-unavailable" },
  { data: { github_org: "https://example.test" }, status: "organization-unavailable" },
])("requires an owned course with a usable saved organization ($status)", async ({ data, status }) => {
  maybeSingle.mockResolvedValue({ data, error: null });
  await expect(readRepoGradeProfileAction(courseId, folder)).resolves.toEqual({ status });
  await expect(saveRepoGradeProfileAction(courseId, folder, {}, null)).resolves.toEqual({ status });
  expect(from).toHaveBeenCalledWith("course_hub");
  expect(select.mock.calls).toEqual([["github_org"], ["github_org"]]);
  expect(eq.mock.calls).toEqual([["user_id", owner.id], ["id", courseId], ["user_id", owner.id], ["id", courseId]]);
  expect(rpc).not.toHaveBeenCalled();
});

it.each(["", "../work", "work//task", "work\\task", "a".repeat(513), "\uD800"])("rejects invalid folder %s", async (badFolder) => {
  await expect(readRepoGradeProfileAction(courseId, badFolder)).resolves.toEqual({ status: "invalid-scope" });
  await expect(saveRepoGradeProfileAction(courseId, badFolder, {}, null)).resolves.toEqual({ status: "invalid-scope" });
  expect(createServiceClient).not.toHaveBeenCalled();
});

it("rejects forged settings, caller-selected models and invalid CAS tokens", async () => {
  for (const key of ["accountId", "githubOrg", "commit", "apiKey", "model", "provider", "graderVersion"]) {
    await expect(saveRepoGradeProfileAction(courseId, folder, { [key]: "browser-value" }, null))
      .resolves.toEqual({ status: "invalid-settings" });
  }
  await expect(saveRepoGradeProfileAction(courseId, folder, { sourceRef: "a".repeat(40) }, null))
    .resolves.toEqual({ status: "invalid-settings" });
  await expect(saveRepoGradeProfileAction(courseId, folder, { runCode: "true" }, null))
    .resolves.toEqual({ status: "invalid-settings" });
  await expect(saveRepoGradeProfileAction(courseId, folder, { useReadmeInstructions: false }, null))
    .resolves.toEqual({ status: "missing-instructions" });
  await expect(saveRepoGradeProfileAction(courseId, folder, {}, undefined))
    .resolves.toEqual({ status: "invalid-fingerprint" });
  await expect(saveRepoGradeProfileAction(courseId, folder, {}, null, { model: "browser-model" }))
    .resolves.toEqual({ status: "invalid-provider" });
  expect(rpc).not.toHaveBeenCalled();
});

it("saves an exact captured profile scoped to the owner and reads it back without exposing the account ID", async () => {
  rpc.mockResolvedValueOnce({ data: true, error: null });
  const result = await saveRepoGradeProfileAction(courseId.toUpperCase(), folder, {
    sourceRef: " main ", rubric: " Exact  rubric\nText ", instructions: " Use loops ",
  }, null);
  expect(result).toMatchObject({
    status: "saved",
    profile: {
      courseId, folder, model: "server-model", provider: "gemini", sourceRef: "main", targetBranch: null,
      instructions: "Use loops", rubric: "Exact  rubric\nText", rubricPolicy: "manual", runCode: false,
      applyNamingDeduction: true, useReadmeInstructions: true,
    },
  });
  if (result.status !== "saved") throw new Error("Expected profile to be saved");
  expect(result.profile).not.toHaveProperty("accountId");
  const profile = { ...result.profile, accountId: owner.id };
  expect(rpc).toHaveBeenNthCalledWith(1, "repo_grade_save_profile", {
    p_user_id: owner.id, p_course_id: courseId, p_folder: folder, p_profile: profile,
    p_configuration_fingerprint: profile.configurationFingerprint, p_expected_configuration_fingerprint: null,
  });
  rpc.mockResolvedValueOnce({ data: { profile, receipt: null }, error: null });
  await expect(readRepoGradeProfileAction(courseId, folder)).resolves.toEqual({ status: "loaded", profile: result.profile });
  expect(rpc).toHaveBeenNthCalledWith(2, "repo_grade_read_profile", {
    p_user_id: owner.id, p_course_id: courseId, p_folder: folder, p_cohort_id: null,
  });
});

it("persists explicit execution opt-in and forwards the caller's expected version on edits", async () => {
  const expected = "a".repeat(64);
  rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
  await expect(saveRepoGradeProfileAction(courseId, folder, { runCode: true }, expected, "embedded"))
    .resolves.toMatchObject({
      status: "saved", profile: { provider: "embedded", model: "embedded-deterministic", runCode: true, rubricPolicy: "generate" },
    });
  expect(getGeminiModel).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith("repo_grade_save_profile", expect.objectContaining({
    p_user_id: owner.id, p_course_id: courseId, p_folder: folder, p_expected_configuration_fingerprint: expected,
  }));
  await expect(saveRepoGradeProfileAction(courseId, folder, {}, expected)).resolves.toEqual({ status: "conflict" });
  expect(rpc).toHaveBeenCalledTimes(2);
});

it("distinguishes missing profiles from bounded storage failures and does not retry a lost save response", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: null });
  await expect(readRepoGradeProfileAction(courseId, folder)).resolves.toEqual({ status: "not-configured" });
  rpc.mockResolvedValueOnce({ data: { profile: { accountId: "foreign" }, receipt: null }, error: null });
  await expect(readRepoGradeProfileAction(courseId, folder)).resolves.toEqual({ status: "storage-unavailable" });
  rpc.mockRejectedValueOnce(new Error("sensitive response details"));
  await expect(saveRepoGradeProfileAction(courseId, folder, {}, null)).resolves.toEqual({ status: "storage-unavailable" });
  expect(rpc).toHaveBeenCalledTimes(3);
  maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "sensitive response details" } });
  await expect(readRepoGradeProfileAction(courseId, folder)).resolves.toEqual({ status: "storage-unavailable" });
  expect(rpc).toHaveBeenCalledTimes(3);
});
