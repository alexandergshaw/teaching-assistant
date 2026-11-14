import { beforeEach, expect, it, vi } from "vitest";
import { prepareRepoGradeStartupProfile } from "./preparation-runtime";
import { freezeRepoGradeRubric, readCurrentRepoGradeStartupProfile } from "./profile-store";

vi.mock("./profile-store", () => ({ freezeRepoGradeRubric: vi.fn(), readCurrentRepoGradeStartupProfile: vi.fn() }));

const scope = { accountId: "owner", courseId: "course", folder: "assignment" };
const profile = { ...scope, provider: "gemini" as const, model: "model", graderVersion: "v1", sourceRef: null,
  targetBranch: null, instructions: "Implement the assignment.", rubric: "Correctness: 100 points",
  rubricPolicy: "manual" as const, useReadmeInstructions: false, applyNamingDeduction: false,
  runCode: true, configurationFingerprint: "a".repeat(64) };
const discovery = { status: "scanned" as const, enumerationComplete: true, repos: [] };
const config = { github_org: "org", repos: null, rubric_name: null, rubric_data: null, repo_module_pairing: null, student_repos: null };

beforeEach(() => vi.resetAllMocks());

it("prepares the exact saved Gemini rubric when execution is enabled", async () => {
  vi.mocked(readCurrentRepoGradeStartupProfile).mockResolvedValue({ profile, receipt: null, startupDefault: false });
  const frozen = { profile, receipt: { rubric: profile.rubric }, cohortId: "cohort" };
  vi.mocked(freezeRepoGradeRubric).mockResolvedValue(frozen as never);
  const result = await prepareRepoGradeStartupProfile(scope, discovery, null, undefined, config, undefined);
  expect(result).toBe(frozen);
  expect(freezeRepoGradeRubric).toHaveBeenCalledWith(profile, expect.any(String));
});

it("does not treat an embedded profile with execution enabled as supported", async () => {
  vi.mocked(readCurrentRepoGradeStartupProfile).mockResolvedValue({ profile: { ...profile, provider: "embedded" }, receipt: null, startupDefault: false });
  const failure = vi.fn();
  expect(await prepareRepoGradeStartupProfile(scope, discovery, null, undefined, config, undefined, { observeProfileFailure: failure })).toBeNull();
  expect(failure).toHaveBeenCalledWith("automatic-execution-unsupported");
  expect(freezeRepoGradeRubric).not.toHaveBeenCalled();
});

it("continues to generated-rubric preparation for a saved Gemini execution opt-in", async () => {
  vi.mocked(readCurrentRepoGradeStartupProfile).mockResolvedValue({
    profile: { ...profile, rubricPolicy: "generate", rubric: "" }, receipt: null, startupDefault: false,
  });
  const failure = vi.fn();
  const result = await prepareRepoGradeStartupProfile(scope, discovery, null, undefined, config, undefined,
    { observeProfileFailure: failure });
  // Reaching this downstream validation proves the saved opt-in wasn't
  // rejected as an unsupported automatic-execution profile.
  expect(result).toEqual({ status: "course-kind-required" });
  expect(failure).not.toHaveBeenCalledWith("automatic-execution-unsupported");
});
