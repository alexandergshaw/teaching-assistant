import "server-only";

import { createHash } from "node:crypto";
import { normalizeTargetBranch } from "@/lib/github-ref-name";
import { rubricFingerprint } from "@/lib/research/rubric-fingerprint";

type ProfileScope = Readonly<{ accountId: string; courseId: string; folder: string }>;

export type RepoGradeProfile = ProfileScope & Readonly<{
  provider: "gemini" | "embedded";
  model: string;
  graderVersion: string;
  sourceRef: string | null;
  targetBranch: string | null;
  instructions: string;
  rubric: string;
  rubricPolicy: "manual" | "generate";
  useReadmeInstructions: boolean;
  applyNamingDeduction: boolean;
  runCode: boolean;
  configurationFingerprint: string;
}>;

export type RepoGradeRubricReceipt = ProfileScope & Readonly<{
  configurationFingerprint: string;
  rubric: string;
  rubricFingerprint: string;
  profileFingerprint: string;
}>;

const SETTINGS = [
  "sourceRef", "targetBranch", "instructions", "rubric", "useReadmeInstructions",
  "applyNamingDeduction", "runCode",
];

const SCOPE_FIELDS = ["accountId", "courseId", "folder"];
const GRADER_FIELDS = ["provider", "model", "graderVersion"];
const PROFILE_FIELDS = [...SCOPE_FIELDS, ...GRADER_FIELDS, ...SETTINGS, "rubricPolicy", "configurationFingerprint"];
const RECEIPT_FIELDS = [...SCOPE_FIELDS, "configurationFingerprint", "rubric", "rubricFingerprint", "profileFingerprint"];

function snapshotRecord(value: unknown, fields: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;

  const snapshot: Record<string, unknown> = Object.create(null);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !fields.includes(key)) return null;
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value")) return null;
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.isWellFormed() && !/[\s\u0000-\u001f\u007f]/.test(value);
}

function isFolder(value: unknown): value is string {
  return typeof value === "string" && value.isWellFormed() && !/[\\\u0000-\u001f\u007f]/.test(value)
    && value.split("/").every((segment) => segment.trim() !== "" && segment !== "." && segment !== "..");
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return "";
  return typeof value === "string" && value.isWellFormed() && !value.includes("\u0000") ? value.trim() : undefined;
}

function optionalBoolean(value: unknown, fallback: boolean): boolean | undefined {
  if (value === undefined) return fallback;
  return typeof value === "boolean" ? value : undefined;
}

function fingerprint(parts: readonly (string | boolean | null)[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

type ProfileCapture =
  | { status: "ready"; profile: RepoGradeProfile }
  | { status: "blocked"; reason: "invalid-scope" | "invalid-settings" | "invalid-grader" | "missing-instructions" };

/** Capture settings loaded by the server for this authorized course and folder.
 * The grader identity comes from the server's actual execution configuration.
 * A null sourceRef means discovery must resolve each repository's default branch. */
export function captureRepoGradeProfile(rawScope: unknown, rawSettings: unknown, rawGrader: unknown): ProfileCapture {
  const scope = snapshotRecord(rawScope, SCOPE_FIELDS);
  if (!scope || !isIdentifier(scope.accountId) || !isIdentifier(scope.courseId) || !isFolder(scope.folder)) {
    return { status: "blocked", reason: "invalid-scope" };
  }
  const graderIdentity = snapshotRecord(rawGrader, GRADER_FIELDS);
  if (!graderIdentity || (graderIdentity.provider !== "gemini" && graderIdentity.provider !== "embedded")
    || !isIdentifier(graderIdentity.model) || !isIdentifier(graderIdentity.graderVersion)) {
    return { status: "blocked", reason: "invalid-grader" };
  }
  const savedSettings = snapshotRecord(rawSettings, SETTINGS);
  if (!savedSettings) {
    return { status: "blocked", reason: "invalid-settings" };
  }

  const { accountId, courseId, folder } = scope;
  const { provider, model, graderVersion } = graderIdentity;
  const sourceText = optionalText(savedSettings.sourceRef);
  const targetText = optionalText(savedSettings.targetBranch);
  const instructions = optionalText(savedSettings.instructions);
  const rubric = optionalText(savedSettings.rubric);
  const useReadmeInstructions = optionalBoolean(savedSettings.useReadmeInstructions, true);
  const applyNamingDeduction = optionalBoolean(savedSettings.applyNamingDeduction, true);
  const runCode = optionalBoolean(savedSettings.runCode, false);
  if (sourceText === undefined || targetText === undefined || instructions === undefined || rubric === undefined
    || useReadmeInstructions === undefined || applyNamingDeduction === undefined || runCode === undefined) {
    return { status: "blocked", reason: "invalid-settings" };
  }
  const source = normalizeTargetBranch(sourceText);
  const target = normalizeTargetBranch(targetText);
  if (!source.ok || !target.ok) return { status: "blocked", reason: "invalid-settings" };
  if (!useReadmeInstructions && !instructions) return { status: "blocked", reason: "missing-instructions" };

  const sourceRef = source.branch || null;
  const targetBranch = target.branch || null;
  const rubricPolicy = rubric ? "manual" : "generate";
  const configurationFingerprint = fingerprint([
    "repo-grade-configuration-v1", accountId, courseId, folder, provider, model, graderVersion,
    sourceRef, targetBranch, instructions, rubric, rubricPolicy, useReadmeInstructions, applyNamingDeduction, runCode,
  ]);
  return { status: "ready", profile: Object.freeze({
    accountId, courseId, folder, provider, model, graderVersion, sourceRef, targetBranch, instructions, rubric,
    rubricPolicy, useReadmeInstructions, applyNamingDeduction, runCode, configurationFingerprint,
  }) };
}

/** Verify the prepared settings against their fingerprint and freeze a private snapshot. */
export function restoreRepoGradeProfile(raw: unknown): RepoGradeProfile | null {
  const snapshot = snapshotRecord(raw, PROFILE_FIELDS);
  if (!snapshot) return null;
  const pick = (fields: string[]) => Object.fromEntries(fields.map((key) => [key, snapshot[key]]));
  const captured = captureRepoGradeProfile(pick(SCOPE_FIELDS), pick(SETTINGS), pick(GRADER_FIELDS));
  if (captured.status !== "ready") return null;
  const profile = captured.profile;
  return PROFILE_FIELDS.every((key) => snapshot[key] === profile[key as keyof RepoGradeProfile]) ? profile : null;
}

/** Resolve once per cohort before dispatch. The caller must persist the receipt
 * before fan-out and restore it on recovery, including the exact rubric text. */
export function resolveRepoGradeRubric(profile: RepoGradeProfile, generatedText?: unknown): RepoGradeRubricReceipt | null {
  const { accountId, courseId, folder, configurationFingerprint } = profile;
  const rubric = profile.rubricPolicy === "manual" ? profile.rubric : optionalText(generatedText);
  if (!rubric) return null;
  return Object.freeze({
    accountId, courseId, folder, configurationFingerprint, rubric,
    rubricFingerprint: rubricFingerprint(rubric),
    // The existing rubric fingerprint normalizes case and whitespace. Include the
    // exact text here so even those edits cannot alias a different execution input.
    profileFingerprint: fingerprint(["repo-grade-profile-v1", configurationFingerprint, rubric]),
  });
}

/** A persisted receipt may only resume work under the same captured settings. */
export function restoreRepoGradeRubric(profile: RepoGradeProfile, rawReceipt: unknown): RepoGradeRubricReceipt | null {
  const receipt = snapshotRecord(rawReceipt, RECEIPT_FIELDS);
  if (!receipt || receipt.accountId !== profile.accountId || receipt.courseId !== profile.courseId
    || receipt.folder !== profile.folder || receipt.configurationFingerprint !== profile.configurationFingerprint) return null;
  const restored = resolveRepoGradeRubric(profile, receipt.rubric);
  if (!restored || receipt.rubric !== restored.rubric || receipt.rubricFingerprint !== restored.rubricFingerprint
    || receipt.profileFingerprint !== restored.profileFingerprint) return null;
  return restored;
}

/** Display provenance only. Automatic eligibility is keyed by source commit
 * and terminal outcomes independently of grading configuration. */
export function repoGradeConfigurationChanged(profile: RepoGradeProfile, storedConfigurationFingerprint: string): boolean {
  return profile.configurationFingerprint !== storedConfigurationFingerprint;
}
