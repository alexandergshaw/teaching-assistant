import "server-only";

import { createHash } from "node:crypto";
import type { CourseKind } from "@/lib/course-kind";
import { normalizeTargetBranch, validateGithubOwnerRepo } from "@/lib/github-ref-name";
import { isInstructionReadmeDocument } from "@/lib/repo-readme-instructions";
import type { RepoGradeProfile } from "./profile";

const KEY_VERSION = "repo-grade-preparation-v1";
const TEMPLATE_KEY_VERSION = "repo-grade-preparation-v2";
const MAX_TARGETS = 4_000;
const MAX_IDENTIFIER_BYTES = 256;
const MAX_REF_BYTES = 1_024;
const MAX_PATH_BYTES = 4_096;
const MAX_INSTRUCTIONS_BYTES = 128_000;

type PreparationConfiguration = Pick<RepoGradeProfile,
  "accountId" | "courseId" | "folder" | "configurationFingerprint" | "provider" | "model" | "graderVersion"
> & Readonly<{ promptParserVersion: string; courseKind: CourseKind }>;

type PinnedTarget = Readonly<{ owner: string; repo: string; sourceRef: string; sourceCommit: string }>;
type InstructionPolicy =
  | Readonly<{ kind: "saved"; instructions: string }>
  | Readonly<{ kind: "readme" }>
  | Readonly<{ kind: "readme-with-configured-fallback"; fallbackInstructions: string }>;

type FallbackEvidence =
  | Readonly<{ kind: "configured-fallback"; readmeStatus: "absent" }>
  | Readonly<{ kind: "configured-fallback"; readmeStatus: "blank"; path: string }>;
type TemplateSource = Readonly<{ kind: "template-readme"; path: string | null; repo: string; sourceRef: string;
  sourceCommit: string; blobSha: string | null; readmeStatus: "present" | "absent" | "blank"; instructionSha256: string }>;
type ReadmeSource = Readonly<{ kind: "pinned-readme"; path: string }> | TemplateSource | FallbackEvidence;
type ReadmeEvidence = Readonly<{
  target: PinnedTarget;
  source: (Readonly<{ kind: "pinned-readme"; path: string; instructions: string }>)
    | (TemplateSource & Readonly<{ instructions: string }>) | FallbackEvidence;
}>;

export type RepoGradePreparationInput = Readonly<{
  configuration: PreparationConfiguration;
  instructionPolicy: InstructionPolicy;
  inventory: Readonly<{ status: "complete"; targets: readonly PinnedTarget[] }> | Readonly<{ status: "incomplete" }>;
  readmeEvidence: readonly ReadmeEvidence[];
}>;

export type RepoGradeTargetEvidence = Readonly<{
  target: PinnedTarget;
  source: ReadmeSource | Readonly<{ kind: "saved" }>;
}>;
type BlockedReason =
  | "invalid-configuration" | "missing-instructions" | "incomplete-inventory" | "invalid-inventory"
  | "duplicate-target" | "invalid-instruction-evidence" | "missing-instruction-evidence"
  | "duplicate-instruction-evidence" | "conflicting-instructions";

export type RepoGradePreparationCapture =
  | Readonly<{
    status: "ready";
    keyVersion: typeof KEY_VERSION | typeof TEMPLATE_KEY_VERSION;
    key: string;
    instructionDigest: string;
    instructions: string;
    evidence: readonly RepoGradeTargetEvidence[];
  }>
  | Readonly<{ status: "blocked"; reason: BlockedReason }>;

function record(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) && Reflect.ownKeys(value).length === fields.length
    && fields.every((key) => Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, "value"));
}

function boundedText(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.length <= limit && value.isWellFormed() && Buffer.byteLength(value, "utf8") <= limit;
}

function identifier(value: unknown): value is string {
  return boundedText(value, MAX_IDENTIFIER_BYTES) && value !== "" && !/[\s\u0000-\u001f\u007f]/.test(value);
}

function exactPath(value: unknown): value is string {
  return boundedText(value, MAX_PATH_BYTES) && !/[\\\u0000-\u001f\u007f]/.test(value)
    && value.split("/").every((part) => part.trim() !== "" && part !== "." && part !== "..");
}

function instructionText(value: unknown): value is string {
  return boundedText(value, MAX_INSTRUCTIONS_BYTES) && !value.includes("\u0000") && value.trim() !== "";
}

function configuration(value: unknown): value is PreparationConfiguration {
  return record(value, [
    "accountId", "courseId", "folder", "configurationFingerprint", "provider", "model",
    "graderVersion", "promptParserVersion", "courseKind",
  ]) && identifier(value.accountId) && identifier(value.courseId) && exactPath(value.folder)
    && typeof value.configurationFingerprint === "string" && /^[0-9a-f]{64}$/.test(value.configurationFingerprint)
    && (value.provider === "gemini" || value.provider === "embedded")
    && identifier(value.model) && identifier(value.graderVersion) && identifier(value.promptParserVersion)
    && (value.courseKind === "coding" || value.courseKind === "applied");
}

function pinnedTarget(value: unknown): value is PinnedTarget {
  if (!record(value, ["owner", "repo", "sourceRef", "sourceCommit"])
    || !boundedText(value.owner, 100) || !boundedText(value.repo, 100) || !validateGithubOwnerRepo(value.owner, value.repo)
    || !boundedText(value.sourceRef, MAX_REF_BYTES) || value.sourceRef === ""
    || typeof value.sourceCommit !== "string" || !/^[0-9a-f]{40}$/.test(value.sourceCommit)) return false;
  const ref = normalizeTargetBranch(value.sourceRef);
  return ref.ok && ref.branch === value.sourceRef;
}

function repoKey({ owner, repo }: PinnedTarget): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

function exactTarget(target: PinnedTarget, evidence: PinnedTarget): boolean {
  return target.owner === evidence.owner && target.repo === evidence.repo
    && target.sourceRef === evidence.sourceRef && target.sourceCommit === evidence.sourceCommit;
}

function readmePath(path: unknown, folder: string): path is string {
  return exactPath(path) && path.startsWith(`${folder}/`) && isInstructionReadmeDocument(path);
}

function captureReadmeSource(value: unknown, folder: string, fallback: string | undefined) {
  if (record(value, ["kind", "path", "instructions", "repo", "sourceRef", "sourceCommit", "blobSha", "readmeStatus", "instructionSha256"]) && value.kind === "template-readme"
    && instructionText(value.instructions)
    && typeof value.repo === "string" && value.repo.split("/").length === 2
    && validateGithubOwnerRepo(...value.repo.split("/") as [string, string])
    && pinnedTarget({ owner: value.repo.split("/")[0], repo: value.repo.split("/")[1], sourceRef: value.sourceRef, sourceCommit: value.sourceCommit })
    && typeof value.instructionSha256 === "string" && /^[0-9a-f]{64}$/.test(value.instructionSha256)
    && createHash("sha256").update(value.instructions, "utf8").digest("hex") === value.instructionSha256
    && (value.readmeStatus === "absent" && value.path === null && value.blobSha === null && fallback === value.instructions
      || value.readmeStatus === "blank" && readmePath(value.path, folder) && typeof value.blobSha === "string"
        && /^[0-9a-f]{40}$/.test(value.blobSha) && fallback === value.instructions
      || value.readmeStatus === "present" && readmePath(value.path, folder) && typeof value.blobSha === "string"
        && createHash("sha1").update(`blob ${Buffer.byteLength(value.instructions, "utf8")}\0`).update(value.instructions, "utf8").digest("hex") === value.blobSha)) {
    return { source: { kind: "template-readme", path: value.path, repo: value.repo, sourceRef: value.sourceRef as string,
      sourceCommit: value.sourceCommit as string, blobSha: value.blobSha as string | null, readmeStatus: value.readmeStatus as "present" | "blank" | "absent", instructionSha256: value.instructionSha256 } as const,
      instructions: value.instructions };
  }
  if (record(value, ["kind", "path", "instructions"]) && value.kind === "pinned-readme"
    && readmePath(value.path, folder) && instructionText(value.instructions)) {
    return { source: { kind: "pinned-readme", path: value.path } as const, instructions: value.instructions };
  }
  if (fallback === undefined) return null;
  if (record(value, ["kind", "readmeStatus"]) && value.kind === "configured-fallback" && value.readmeStatus === "absent") {
    return { source: { kind: "configured-fallback", readmeStatus: "absent" } as const, instructions: fallback };
  }
  if (record(value, ["kind", "readmeStatus", "path"]) && value.kind === "configured-fallback"
    && value.readmeStatus === "blank" && readmePath(value.path, folder)) {
    return { source: { kind: "configured-fallback", readmeStatus: "blank", path: value.path } as const, instructions: fallback };
  }
  return null;
}

function captureReadmeEvidence(
  rows: readonly unknown[], targets: ReadonlyMap<string, PinnedTarget>, folder: string, fallback: string | undefined,
): { reason: BlockedReason } | { sources: ReadonlyMap<string, ReadmeSource>; instructions: string } {
  let instructions: string | undefined;
  let conflict = false;
  let templateIdentity: string | undefined;
  let sawOtherSource = false;
  const sources = new Map<string, ReadmeSource>();
  for (const row of rows) {
    if (!record(row, ["target", "source"]) || !pinnedTarget(row.target)) {
      return { reason: "invalid-instruction-evidence" };
    }
    const key = repoKey(row.target);
    const target = targets.get(key);
    if (!target || !exactTarget(target, row.target)) return { reason: "invalid-instruction-evidence" };
    if (sources.has(key)) return { reason: "duplicate-instruction-evidence" };

    const captured = captureReadmeSource(row.source, folder, fallback);
    if (!captured) return { reason: "invalid-instruction-evidence" };
    if (captured.source.kind === "template-readme") {
      const identity = JSON.stringify(captured.source);
      if (sawOtherSource || (templateIdentity !== undefined && templateIdentity !== identity)) return { reason: "invalid-instruction-evidence" };
      templateIdentity = identity;
    } else {
      if (templateIdentity !== undefined) return { reason: "invalid-instruction-evidence" };
      sawOtherSource = true;
    }
    instructions ??= captured.instructions;
    conflict ||= instructions !== captured.instructions;
    sources.set(key, Object.freeze(captured.source));
  }
  if (instructions === undefined || sources.size !== targets.size) return { reason: "missing-instruction-evidence" };
  if (conflict) return { reason: "conflicting-instructions" };
  return { sources, instructions };
}

/** The server supplies the complete scoped inventory and evidence from reads at
 * its pinned commits. An absent or blank fallback requires a conclusive read.
 * The caller must establish read completeness and decode UTF-8 losslessly. */
export function captureRepoGradePreparationInput(raw: unknown): RepoGradePreparationCapture {
  if (!record(raw, ["configuration", "instructionPolicy", "inventory", "readmeEvidence"]) || !configuration(raw.configuration)) {
    return { status: "blocked", reason: "invalid-configuration" };
  }
  const config = raw.configuration;
  const { inventory, instructionPolicy: policy, readmeEvidence } = raw;
  if (record(inventory, ["status"]) && inventory.status === "incomplete") {
    return { status: "blocked", reason: "incomplete-inventory" };
  }
  if (!record(inventory, ["status", "targets"]) || inventory.status !== "complete"
    || !Array.isArray(inventory.targets) || inventory.targets.length === 0 || inventory.targets.length > MAX_TARGETS) {
    return { status: "blocked", reason: "invalid-inventory" };
  }
  const targets = new Map<string, PinnedTarget>();
  for (const target of inventory.targets) {
    if (!pinnedTarget(target)) return { status: "blocked", reason: "invalid-inventory" };
    const key = repoKey(target);
    if (targets.has(key)) return { status: "blocked", reason: "duplicate-target" };
    const { owner, repo, sourceRef, sourceCommit } = target;
    targets.set(key, Object.freeze({ owner, repo, sourceRef, sourceCommit }));
  }

  if (!Array.isArray(readmeEvidence) || readmeEvidence.length > MAX_TARGETS) {
    return { status: "blocked", reason: "invalid-instruction-evidence" };
  }
  let instructions: string;
  let sources: ReadonlyMap<string, ReadmeSource> | undefined;
  let policyKind: InstructionPolicy["kind"];
  if (record(policy, ["kind", "instructions"]) && policy.kind === "saved") {
    if (!instructionText(policy.instructions)) return { status: "blocked", reason: "missing-instructions" };
    if (readmeEvidence.length !== 0) return { status: "blocked", reason: "invalid-instruction-evidence" };
    instructions = policy.instructions;
    policyKind = policy.kind;
  } else if ((record(policy, ["kind"]) && policy.kind === "readme")
    || (record(policy, ["kind", "fallbackInstructions"]) && policy.kind === "readme-with-configured-fallback")) {
    const fallback = policy.kind === "readme-with-configured-fallback" ? policy.fallbackInstructions : undefined;
    if (policy.kind === "readme-with-configured-fallback" && !instructionText(fallback)) {
      return { status: "blocked", reason: "missing-instructions" };
    }
    const captured = captureReadmeEvidence(readmeEvidence, targets, config.folder, typeof fallback === "string" ? fallback : undefined);
    if ("reason" in captured) return { status: "blocked", reason: captured.reason };
    ({ instructions, sources } = captured);
    policyKind = policy.kind;
  } else {
    return { status: "blocked", reason: "invalid-configuration" };
  }

  const instructionDigest = createHash("sha256").update(instructions, "utf8").digest("hex");
  const keyVersion = sources && [...sources.values()].some((source) => source.kind === "template-readme")
    ? TEMPLATE_KEY_VERSION : KEY_VERSION;
  const baseKey = createHash("sha256").update(JSON.stringify([
    keyVersion, config.accountId, config.courseId, config.folder, config.configurationFingerprint, policyKind,
    instructionDigest, config.provider, config.model, config.graderVersion, config.promptParserVersion, config.courseKind,
  ]), "utf8").digest("hex");
  const templateSource = sources && [...sources.values()].find((source) => source.kind === "template-readme");
  const key = templateSource?.kind === "template-readme"
    ? createHash("sha256").update(JSON.stringify(["repo-grade-template-key-v1", baseKey, templateSource.repo,
      templateSource.sourceRef, templateSource.sourceCommit]), "utf8").digest("hex") : baseKey;

  // Target identity is execution provenance. New code commits with the same
  // instructions can reuse the cohort rubric while keeping their own evidence.
  const saved = Object.freeze({ kind: "saved" } as const);
  const evidence = [...targets.entries()].sort(([left], [right]) => left < right ? -1 : 1)
    .map(([repo, target]) => Object.freeze({ target, source: sources ? sources.get(repo)! : saved }));
  return Object.freeze({ status: "ready", keyVersion, key, instructionDigest, instructions, evidence: Object.freeze(evidence) });
}
