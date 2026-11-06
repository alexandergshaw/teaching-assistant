import { describe, expect, it } from "vitest";
import {
  captureRepoGradeProfile,
  repoGradeConfigurationChanged,
  resolveRepoGradeRubric,
  restoreRepoGradeRubric,
} from "./profile";

const SCOPE = { accountId: "account-a", courseId: "course-a", folder: "assignments/project" };
const GRADER = { provider: "gemini", model: "gemini-a", graderVersion: "grader-v1" };
const DEFAULT_FINGERPRINT = "7003672ceadf354f8e033f661b6530b85a38274099ea3a3f84e11925d616e131";

function capture(settings: unknown = {}, scope = SCOPE, grader = GRADER) {
  const result = captureRepoGradeProfile(scope, settings, grader);
  if (result.status !== "ready") throw new Error(`Unexpected profile outcome: ${result.reason}`);
  return result.profile;
}

describe("captureRepoGradeProfile", () => {
  it("uses explicit defaults for a course with no overrides", () => {
    const profile = capture();
    expect(profile).toEqual({
      ...SCOPE,
      ...GRADER,
      sourceRef: null,
      targetBranch: null,
      instructions: "",
      rubric: "",
      rubricPolicy: "generate",
      useReadmeInstructions: true,
      applyNamingDeduction: true,
      runCode: false,
      configurationFingerprint: DEFAULT_FINGERPRINT,
    });
    expect(Object.isFrozen(profile)).toBe(true);
    expect(capture({ targetBranch: "main" }).sourceRef).toBeNull();
    expect(capture({ sourceRef: "feature/submissions" }).targetBranch).toBeNull();
  });

  it("captures explicit options independent of property order and later settings edits", () => {
    const options = {
      sourceRef: " grading/current ", targetBranch: " main ", rubric: " Rubric A ",
      instructions: " Use loops. ", useReadmeInstructions: false, runCode: true, applyNamingDeduction: false,
    };
    const profile = capture(options);
    expect(profile).toMatchObject({
      sourceRef: "grading/current", targetBranch: "main", rubric: "Rubric A", rubricPolicy: "manual",
      instructions: "Use loops.", useReadmeInstructions: false, runCode: true, applyNamingDeduction: false,
    });
    expect(capture({
      runCode: true, useReadmeInstructions: false, instructions: "Use loops.", targetBranch: "main",
      sourceRef: "grading/current", rubric: "Rubric A", applyNamingDeduction: false,
    })).toEqual(profile);
    options.rubric = "Rubric B";
    expect(profile.rubric).toBe("Rubric A");
    expect(capture({}, { ...SCOPE, courseId: "course-b" })).toMatchObject({ instructions: "", rubric: "", runCode: false });
  });

  it.each([
    [{ sourceRef: "other" }], [{ targetBranch: "main" }], [{ instructions: "Use loops." }],
    [{ rubric: "Loops" }], [{ applyNamingDeduction: false }], [{ runCode: true }],
  ])("discloses an existing evaluation as stale after settings change %j", (settings) => {
    expect(repoGradeConfigurationChanged(capture(settings), DEFAULT_FINGERPRINT)).toBe(true);
  });

  it("compares README choice, provider, actual model, grader version and exact ownership", () => {
    const instructions = { instructions: "Use loops." };
    expect(repoGradeConfigurationChanged(capture(instructions), capture({
      ...instructions, useReadmeInstructions: false,
    }).configurationFingerprint)).toBe(true);
    for (const changes of [{ provider: "embedded" }, { model: "gemini-b" }, { graderVersion: "grader-v2" }]) {
      expect(repoGradeConfigurationChanged(capture({}, SCOPE, { ...GRADER, ...changes }), DEFAULT_FINGERPRINT)).toBe(true);
    }
    for (const changes of [{ accountId: "account-b" }, { courseId: "course-b" }, { folder: "assignments/Project" }]) {
      expect(repoGradeConfigurationChanged(capture({}, { ...SCOPE, ...changes }), DEFAULT_FINGERPRINT)).toBe(true);
    }
    expect(repoGradeConfigurationChanged(capture({ rubric: "  ", sourceRef: null, runCode: false }), DEFAULT_FINGERPRINT)).toBe(false);
  });

  it.each([
    null, [], { runCode: "true" }, { runCode: null }, { useReadmeInstructions: 1 }, { applyNamingDeduction: {} },
    { sourceRef: "../private" }, { targetBranch: "bad//branch" }, { sourceRef: 2 }, { instructions: [] },
    { rubric: {} }, { canvasRubric: "Other course rubric" }, Object.create({ runCode: true }),
  ])("blocks malformed or unexpected saved settings %j", (settings) => {
    expect(captureRepoGradeProfile(SCOPE, settings, GRADER)).toEqual({ status: "blocked", reason: "invalid-settings" });
  });

  it("keeps code execution off when Object.prototype supplies a runCode value", () => {
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, "runCode");
    let profile;
    try {
      Object.defineProperty(Object.prototype, "runCode", { configurable: true, value: true });
      profile = capture();
    } finally {
      if (previous) Object.defineProperty(Object.prototype, "runCode", previous);
      else Reflect.deleteProperty(Object.prototype, "runCode");
    }
    expect(profile.runCode).toBe(false);
    expect(profile.configurationFingerprint).toBe(DEFAULT_FINGERPRINT);
  });

  it("rejects getters on scope, grader and saved settings without reading them", () => {
    let reads = 0;
    const scope = { ...SCOPE, get accountId() { return reads++ === 0 ? "account-a" : "account-b"; } };
    const grader = { ...GRADER, get provider() { return reads++ === 0 ? "gemini" : "other"; } };
    const settings = { get runCode() { return reads++ !== 0; } };
    expect(captureRepoGradeProfile(scope, {}, GRADER)).toEqual({ status: "blocked", reason: "invalid-scope" });
    expect(captureRepoGradeProfile(SCOPE, {}, grader)).toEqual({ status: "blocked", reason: "invalid-grader" });
    expect(captureRepoGradeProfile(SCOPE, settings, GRADER)).toEqual({ status: "blocked", reason: "invalid-settings" });
    expect(reads).toBe(0);
  });

  it("blocks missing instructions when README is disabled, invalid scope and unresolved grader identity", () => {
    expect(captureRepoGradeProfile(SCOPE, { useReadmeInstructions: false, rubric: "Loops" }, GRADER))
      .toEqual({ status: "blocked", reason: "missing-instructions" });
    for (const scope of [{ ...SCOPE, folder: "assignments/../solution" }, { ...SCOPE, accountId: "" }, { ...SCOPE, courseId: "course-a\n" }]) {
      expect(captureRepoGradeProfile(scope, {}, GRADER)).toEqual({ status: "blocked", reason: "invalid-scope" });
    }
    for (const grader of [{ ...GRADER, provider: "other" }, { ...GRADER, model: "" }, { ...GRADER, graderVersion: undefined }]) {
      expect(captureRepoGradeProfile(SCOPE, {}, grader)).toEqual({ status: "blocked", reason: "invalid-grader" });
    }
  });
});

describe("frozen folder rubric", () => {
  it("fingerprints and freezes exact generated content for a whole folder cohort", () => {
    const profile = capture();
    const receipt = resolveRepoGradeRubric(profile, "Criterion: Loops");
    expect(receipt).toEqual({
      ...SCOPE,
      configurationFingerprint: DEFAULT_FINGERPRINT,
      rubric: "Criterion: Loops",
      rubricFingerprint: "1304506758116514361f9eb73677a084acce5cc84ed2b02905e616f8d560ebfe",
      profileFingerprint: "efe94e348eeb234f673ee0c648549c29e4258a9add6019237cae732bd5a6c75f",
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(restoreRepoGradeRubric(capture(), JSON.parse(JSON.stringify(receipt)))).toEqual(receipt);
    expect(resolveRepoGradeRubric(profile, undefined)).toBeNull();
    expect(resolveRepoGradeRubric(profile, "  ")).toBeNull();
  });

  it("keeps saved manual text and rejects substitution of text or scope at recovery", () => {
    const profile = capture({ rubric: "Criterion: Loops" });
    const receipt = resolveRepoGradeRubric(profile, "Do not use this generated rubric");
    expect(receipt?.rubric).toBe("Criterion: Loops");
    expect(restoreRepoGradeRubric(profile, receipt)).toEqual(receipt);
    expect(restoreRepoGradeRubric(profile, { ...receipt, rubric: "criterion: loops" })).toBeNull();
    expect(restoreRepoGradeRubric(capture({ rubric: "Criterion: Loops", runCode: true }), receipt)).toBeNull();
    expect(restoreRepoGradeRubric(capture({ rubric: "Criterion: Loops" }, { ...SCOPE, folder: "assignments/other" }), receipt)).toBeNull();
    expect(restoreRepoGradeRubric(capture({ rubric: "Criterion: Loops" }, { ...SCOPE, courseId: "course-b" }), receipt)).toBeNull();
  });

  it("distinguishes exact generated text even when the existing normalized rubric fingerprint matches", () => {
    const profile = capture();
    const before = resolveRepoGradeRubric(profile, "Criterion: Loops");
    const after = resolveRepoGradeRubric(profile, "criterion:  loops");
    expect(before?.rubricFingerprint).toBe(after?.rubricFingerprint);
    expect(before?.profileFingerprint).not.toBe(after?.profileFingerprint);
    expect(restoreRepoGradeRubric(profile, { ...before, rubric: after?.rubric })).toBeNull();
  });

  it("rejects receipt getters without evaluating them", () => {
    const profile = capture();
    const receipt = resolveRepoGradeRubric(profile, "Criterion: Loops");
    let reads = 0;
    const changing = { ...receipt, get rubric() { return reads++ === 0 ? "Criterion: Loops" : "Criterion: Other"; } };
    expect(restoreRepoGradeRubric(profile, changing)).toBeNull();
    expect(reads).toBe(0);
  });
});
