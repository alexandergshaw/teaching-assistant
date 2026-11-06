import { beforeEach, expect, it, vi } from "vitest";
import { readRepoGradeProfileAction, reviewRepoGradePreparationPolicyAction, saveRepoGradeProfileAction } from "@/app/actions/repo-grade-profiles";
import {
  buildSessionDiagnosticLog, formatSessionDiagnosticLogJson,
  readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests,
} from "@/lib/session-diagnostic-log";
import { loadRepoGradeProfile, profileDraft, reviewRepoGradePreparationPolicy, saveRepoGradeProfile, type SavedProfile } from "./repoGradesProfileClient";

vi.mock("@/app/actions/repo-grade-profiles", () => ({
  readRepoGradeProfileAction: vi.fn(),
  reviewRepoGradePreparationPolicyAction: vi.fn(),
  saveRepoGradeProfileAction: vi.fn(),
}));

const AT = "2026-11-05T00:00:00.000Z";
const COURSE = "private-course";
const FOLDER = "Assignments/ExactCase";
const existing: SavedProfile = {
  courseId: COURSE, folder: FOLDER,
  provider: "embedded", model: "private-model", graderVersion: "private-version",
  sourceRef: "private-branch", targetBranch: "private-target", instructions: "private-instructions", rubric: "",
  rubricPolicy: "generate", useReadmeInstructions: true, applyNamingDeduction: false, runCode: true,
  configurationFingerprint: "b".repeat(64),
};

beforeEach(() => {
  vi.resetAllMocks();
  resetSessionDiagnosticLogForTests(AT);
});

it("records bounded policy preview and apply outcomes without logging scope or policy identifiers", async () => {
  const preview = "e".repeat(64);
  vi.mocked(reviewRepoGradePreparationPolicyAction)
    .mockResolvedValueOnce({ status: "current" })
    .mockResolvedValueOnce({ status: "updated" })
    .mockResolvedValueOnce({ status: "busy" })
    .mockRejectedValueOnce(new Error("private-transport-error"));

  await expect(reviewRepoGradePreparationPolicy(COURSE, FOLDER)).resolves.toEqual({ status: "current" });
  await expect(reviewRepoGradePreparationPolicy(COURSE, FOLDER, preview)).resolves.toEqual({ status: "updated" });
  await expect(reviewRepoGradePreparationPolicy(COURSE, FOLDER, preview)).resolves.toEqual({ status: "busy" });
  await expect(reviewRepoGradePreparationPolicy(COURSE, FOLDER, preview)).resolves.toEqual({ status: "request-failed" });
  expect(reviewRepoGradePreparationPolicyAction).toHaveBeenLastCalledWith(COURSE, FOLDER, preview);
  const { entries } = readSessionDiagnosticLogState();
  expect(entries).toMatchObject([
    { operation: "repo_grade_profile_policy_preview", outcome: "success", durationMs: expect.any(Number) },
    { operation: "repo_grade_profile_policy_apply", outcome: "success", durationMs: expect.any(Number) },
    { operation: "repo_grade_profile_policy_apply", outcome: "failure", cause: "busy" },
    { operation: "repo_grade_profile_policy_apply", outcome: "failure", cause: "request-failed" },
  ]);
  expect(JSON.stringify(entries)).not.toMatch(/private-|Assignments\/ExactCase/);
  expect(JSON.stringify(entries)).not.toContain(preview);
});

it("loads the exact course and folder and saves edits against the loaded fingerprint", async () => {
  vi.mocked(readRepoGradeProfileAction).mockResolvedValue({ status: "loaded", profile: existing });
  vi.mocked(saveRepoGradeProfileAction).mockResolvedValue({ status: "conflict" });

  const result = await loadRepoGradeProfile(COURSE, FOLDER);
  expect(result).toEqual({ status: "loaded", profile: existing });
  expect(readRepoGradeProfileAction).toHaveBeenCalledWith(COURSE, FOLDER);

  const draft = profileDraft(existing);
  draft.instructions = "private-updated-instructions";
  await expect(saveRepoGradeProfile(COURSE, FOLDER, draft, existing)).resolves.toEqual({ status: "conflict" });
  expect(saveRepoGradeProfileAction).toHaveBeenCalledWith(COURSE, FOLDER, {
    sourceRef: "private-branch", targetBranch: "private-target", instructions: "private-updated-instructions", rubric: "",
    useReadmeInstructions: true, applyNamingDeduction: false, runCode: true,
  }, existing.configurationFingerprint, "embedded");
});

it("uses an empty expected fingerprint and saved instructions with execution off for a new profile", async () => {
  const saved: SavedProfile = {
    ...existing, provider: "gemini", sourceRef: null, targetBranch: null, rubric: "private-rubric", rubricPolicy: "manual",
    useReadmeInstructions: false, applyNamingDeduction: true, runCode: false,
  };
  vi.mocked(readRepoGradeProfileAction).mockResolvedValue({ status: "not-configured" });
  vi.mocked(saveRepoGradeProfileAction).mockResolvedValue({ status: "saved", profile: saved });

  await expect(loadRepoGradeProfile(COURSE, FOLDER)).resolves.toEqual({ status: "not-configured" });
  const draft = { ...profileDraft(null), instructions: saved.instructions, rubric: saved.rubric };
  await expect(saveRepoGradeProfile(COURSE, FOLDER, draft, null)).resolves.toEqual({ status: "saved", profile: saved });
  expect(saveRepoGradeProfileAction).toHaveBeenCalledWith(COURSE, FOLDER, {
    sourceRef: "", targetBranch: null, instructions: saved.instructions, rubric: saved.rubric,
    useReadmeInstructions: false, applyNamingDeduction: true, runCode: false,
  }, null, "gemini");
});

it("exports fixed profile-operation metrics for success, returned failures, and rejected requests", async () => {
  vi.mocked(readRepoGradeProfileAction)
    .mockResolvedValueOnce({ status: "loaded", profile: existing })
    .mockResolvedValueOnce({ status: "storage-unavailable" })
    .mockRejectedValueOnce(new Error("private-read-error"));
  vi.mocked(saveRepoGradeProfileAction)
    .mockResolvedValueOnce({ status: "saved", profile: existing })
    .mockResolvedValueOnce({ status: "conflict" })
    .mockRejectedValueOnce(new Error("private-save-error"));

  await expect(loadRepoGradeProfile(COURSE, FOLDER)).resolves.toMatchObject({ status: "loaded" });
  await expect(loadRepoGradeProfile(COURSE, FOLDER)).resolves.toEqual({ status: "storage-unavailable" });
  await expect(loadRepoGradeProfile(COURSE, FOLDER)).resolves.toEqual({ status: "request-failed" });
  const save = () => saveRepoGradeProfile(COURSE, FOLDER, profileDraft(existing), existing);
  await expect(save()).resolves.toMatchObject({ status: "saved" });
  await expect(save()).resolves.toEqual({ status: "conflict" });
  await expect(save()).resolves.toEqual({ status: "request-failed" });

  const state = readSessionDiagnosticLogState();
  expect(state.entries).toMatchObject([
    { operation: "repo_grade_profile_read", outcome: "success", durationMs: expect.any(Number) },
    { operation: "repo_grade_profile_read", outcome: "failure", cause: "storage-unavailable" },
    { operation: "repo_grade_profile_read", outcome: "failure", cause: "request-failed" },
    { operation: "repo_grade_profile_save", outcome: "success", durationMs: expect.any(Number) },
    { operation: "repo_grade_profile_save", outcome: "failure", cause: "conflict" },
    { operation: "repo_grade_profile_save", outcome: "failure", cause: "request-failed" },
  ]);
  const exported = formatSessionDiagnosticLogJson(buildSessionDiagnosticLog(
    state, { currentInstitution: "", currentCourse: "", currentPage: "", browser: "" }, AT,
  ));
  expect(exported).toContain("repo_grade_profile_save");
  expect(exported).toContain("request-failed");
  expect(exported).not.toMatch(/private-|Assignments\/ExactCase/);
  expect(exported).not.toContain(existing.configurationFingerprint);
});
