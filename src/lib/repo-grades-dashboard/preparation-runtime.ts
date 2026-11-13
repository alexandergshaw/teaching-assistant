import "server-only";

import { generateEmbeddedRubricText } from "@/lib/embedded-grader/rubric";
import { getGeminiApiKey } from "@/lib/gemini";
import type { RepoGradeCourseConfig } from "@/lib/supabase/types.repo-grades-dashboard";
import type { RepoGradeDiscovery } from "./discovery";
import { getRepoGraderIdentity } from "./grader-identity";
import { createAutomaticRepoGradeEvidenceResolver } from "./automatic-evidence";
import { composeRepoGradePreparationEvidence, type RepoGradePreparationEvidenceFailure, type RepoGradeReadmeExample } from "./preparation-evidence";
import { captureRepoGradePreparationPolicy, generatePreparedRepoGradeRubric, type RepoGradeRubricGenerator } from "./preparation-generator";
import type { RepoGradePreparationCapture, RepoGradePreparationInput } from "./preparation-input";
import { captureRepoGradeProfile, isEmbeddedRepoGradeStartupProfile, resolveRepoGradeRubric, type RepoGradeProfile } from "./profile";
import { freezeRepoGradeRubric, readCurrentRepoGradeStartupProfile } from "./profile-store";
import {
  beginRepoGradePreparation, bootstrapRepoGradePreparation, claimRepoGradePreparation, finishRepoGradePreparation,
  type RepoGradeCourseKindBasis, type RepoGradePreparationRetry,
} from "./preparation-ledger";
import type { RepoGradeStartupTarget } from "./scheduler";
import type { RepoGradeCohort, RepoGradePreparedProvenance } from "./state";

type Scope = Pick<RepoGradeProfile, "accountId" | "courseId" | "folder">;
type Target = Pick<RepoGradeStartupTarget, "repo" | "sourceRef" | "sha">;
type Inventory = RepoGradePreparationInput["inventory"];
type Evidence = Extract<RepoGradePreparationCapture, { status: "ready" }>;

export type PreparedRepoGradeReadme = Readonly<{ path: string | null; instructions: string; template?: boolean }>;
export type PreparedRepoGradeProfile = RepoGradeCohort & {
  profile: RepoGradeProfile;
  preparedReadme?: PreparedRepoGradeReadme;
  preparation?: RepoGradePreparedProvenance;
};
export type RepoGradePreparationFailure = {
  status: "busy" | "capacity" | "configuration-changed" | "explicit-retry-required" | "failed" | "forbidden"
    | "profile-unavailable" | "storage-unavailable" | "unknown" | "rubric-scope-required" | "course-kind-required"
    | "retry-unavailable";
  preparationRetry?: RepoGradePreparationRetry;
};
export type RepoGradePreparationDiagnostic = {
  status: "ready" | RepoGradePreparationFailure["status"];
  durationMs: number;
};
export type RepoGradeProfilePreparationFailure = RepoGradePreparationEvidenceFailure
  | "profile-storage-unavailable" | "invalid-scope" | "invalid-settings" | "invalid-grader"
  | "source-configuration-changed" | "unsupported-target-branch" | "automatic-execution-unsupported"
  | "rubric-generator-unavailable" | "grader-configuration-changed" | "gemini-key-unavailable"
  | "pinned-target-missing" | "rubric-freeze-unavailable" | "rubric-generation-unavailable";
type PreparationOptions = {
  observePreparation?: (metric: RepoGradePreparationDiagnostic) => void;
  observeProfileFailure?: (reason: RepoGradeProfilePreparationFailure, example?: RepoGradeReadmeExample) => void;
  retry?: RepoGradePreparationRetry;
  resolveEvidence?: typeof composeRepoGradePreparationEvidence;
};

const PREPARATION_BUDGET_MS = 30_000;

function cohortId(key: string): string {
  return [key.slice(0, 8), key.slice(8, 12), key.slice(12, 16), key.slice(16, 20), key.slice(20, 32)].join("-");
}

export function folderInventory(discovery: RepoGradeDiscovery, profile: RepoGradeProfile): Inventory {
  if (discovery.status !== "scanned" || !discovery.enumerationComplete) return { status: "incomplete" };
  const explicitRef = profile.sourceRef;
  const repositories = new Set<string>();
  const resolved = new Set<string>();
  const targets = [];
  for (const row of discovery.repos) {
    const repoKey = row.repo.toLowerCase();
    repositories.add(repoKey);
    const selectedRef = explicitRef ?? discovery.defaultSourceRefs?.[repoKey];
    if (discovery.defaultSourceRefs && selectedRef === undefined) return { status: "incomplete" };
    if (selectedRef !== undefined && row.sourceRef !== selectedRef) continue;
    if (resolved.has(repoKey)) return { status: "incomplete" };
    resolved.add(repoKey);
    if (row.status !== "ready") return { status: "incomplete" };
    if (!row.folders.includes(profile.folder)) continue;
    // A complete verified tree containing only .gitkeep is not a submission
    // and therefore cannot supply or contradict assignment instructions.
    if (row.emptyFolders?.includes(profile.folder)) continue;
    const [owner, repo, extra] = row.repo.split("/");
    if (!owner || !repo || extra !== undefined) return { status: "incomplete" };
    targets.push({ owner, repo, sourceRef: row.sourceRef, sourceCommit: row.sourceCommit });
  }
  if (resolved.size !== repositories.size) return { status: "incomplete" };
  return { status: "complete", targets };
}

function instructionPolicy(profile: RepoGradeProfile): RepoGradePreparationInput["instructionPolicy"] {
  if (!profile.useReadmeInstructions) return { kind: "saved", instructions: profile.instructions };
  if (profile.instructions) return { kind: "readme-with-configured-fallback", fallbackInstructions: profile.instructions };
  return { kind: "readme" };
}

async function prepareGeminiRubric(
  profile: RepoGradeProfile, courseConfig: RepoGradeCourseConfig, evidence: Evidence, generator: RepoGradeRubricGenerator,
  retry?: RepoGradePreparationRetry,
) {
  let admission: Awaited<ReturnType<typeof claimRepoGradePreparation>>;
  try {
    admission = await claimRepoGradePreparation(profile, courseConfig, evidence, retry);
  } catch {
    // A lost claim cannot authorize dispatch and may already hold a slot.
    return { status: "unknown" } as const;
  }
  if (admission.status !== "claimed") return admission;

  const deadlineMs = Date.now() + PREPARATION_BUDGET_MS;
  const deadlineAt = performance.now() + PREPARATION_BUDGET_MS;
  const signal = AbortSignal.timeout(PREPARATION_BUDGET_MS);
  const boundary: { state: "not-requested" | "unconfirmed" | "denied" | "started" | "lease-too-short" } = {
    state: "not-requested",
  };
  const generation = await generatePreparedRepoGradeRubric(generator, evidence.instructions, {
    deadlineMs, signal,
    beforeDispatch: async () => {
      const requestedAt = performance.now();
      boundary.state = "unconfirmed";
      const remainingMs = await beginRepoGradePreparation(admission.claim);
      // The lease must cover the entire generation window, including the RPC
      // round trip, before the transport is allowed to send the request.
      if (remainingMs === null || remainingMs <= deadlineAt - requestedAt) {
        boundary.state = remainingMs === null ? "denied" : "lease-too-short";
        throw new Error("Repository rubric preparation dispatch was denied");
      }
      boundary.state = "started";
    },
  });
  if (boundary.state === "not-requested" || boundary.state === "denied") {
    return finishRepoGradePreparation(profile, admission.claim, { outcome: "failed-before-dispatch" });
  }
  if (boundary.state === "unconfirmed" || (boundary.state === "started" && generation.status === "unknown")) {
    return finishRepoGradePreparation(profile, admission.claim, { outcome: "unknown" });
  }
  const receipt = generation.status === "ready" && boundary.state === "started"
    ? resolveRepoGradeRubric(profile, generation.rubric) : null;
  return finishRepoGradePreparation(profile, admission.claim, receipt ? { outcome: "succeeded", receipt } : { outcome: "failed" });
}

/** The pilot freezes a saved rubric. It has no rubric generator or README input path. */
export async function prepareEmbeddedRepoGradeStartupProfile(
  scope: Scope, expectedSourceRef: RepoGradeProfile["sourceRef"],
): Promise<PreparedRepoGradeProfile | { status: "embedded-profile-required" | "configuration-changed" } | null> {
  const saved = await readCurrentRepoGradeStartupProfile(scope, scope.accountId);
  if (!saved || saved.startupDefault !== false || !isEmbeddedRepoGradeStartupProfile(saved.profile)) {
    return { status: "embedded-profile-required" };
  }
  const { profile } = saved;
  if (profile.sourceRef !== expectedSourceRef) return { status: "configuration-changed" };
  return freezeRepoGradeRubric(profile, cohortId(profile.configurationFingerprint));
}

/** Only call from the gated server runner with its owned, pinned inventory. */
export async function prepareRepoGradeStartupProfile(
  scope: Scope, discovery: RepoGradeDiscovery, expectedSourceRef: RepoGradeProfile["sourceRef"], target: Target | undefined,
  courseConfig: RepoGradeCourseConfig, courseKindBasis: RepoGradeCourseKindBasis | undefined,
  options: PreparationOptions = {},
): Promise<PreparedRepoGradeProfile | RepoGradePreparationFailure | null> {
  const { observePreparation, observeProfileFailure, retry } = options;
  const { accountId, courseId, folder } = scope;
  const saved = await readCurrentRepoGradeStartupProfile({ courseId, folder }, accountId).catch((error: unknown) => {
    observeProfileFailure?.("profile-storage-unavailable");
    throw error;
  });
  if (retry && !saved) return { status: "retry-unavailable" };
  // Course attachments have no assignment scope. The automatic default uses
  // the matching pinned assignment instructions to prepare its own rubric.
  const capture = saved ? { status: "ready" as const, profile: saved.profile }
    : captureRepoGradeProfile(scope, {}, getRepoGraderIdentity("gemini"));
  if (capture.status !== "ready") {
    observeProfileFailure?.(capture.reason);
    return null;
  }
  const { profile } = capture;
  const invalidProfile = profile.accountId !== accountId ? "invalid-scope"
    : profile.sourceRef !== expectedSourceRef ? "source-configuration-changed"
    : profile.targetBranch ? "unsupported-target-branch"
    : profile.runCode ? "automatic-execution-unsupported" : null;
  if (invalidProfile) {
    observeProfileFailure?.(invalidProfile);
    return null;
  }
  if (profile.rubricPolicy !== "generate" || profile.provider !== "gemini") {
    if (retry) return { status: "configuration-changed" };
    return prepareRepoGradeStartupRubric(profile, discovery, target, courseConfig, options);
  }

  const startedAt = performance.now();
  let status: RepoGradePreparationDiagnostic["status"] = "storage-unavailable";
  try {
    const prepared = await prepareRepoGradeStartupRubric(profile, discovery, target, courseConfig, options, {
      courseKindBasis, expectedFingerprint: saved?.profile.configurationFingerprint ?? null,
    });
    status = prepared === null ? "profile-unavailable" : "status" in prepared ? prepared.status : "ready";
    return prepared;
  } finally {
    observePreparation?.({ status, durationMs: Math.max(0, Math.round(performance.now() - startedAt)) });
  }
}

async function prepareRepoGradeStartupRubric(
  profile: RepoGradeProfile, discovery: RepoGradeDiscovery, target: Target | undefined, courseConfig: RepoGradeCourseConfig,
  { observeProfileFailure, retry, resolveEvidence }: PreparationOptions,
  bootstrap?: { courseKindBasis: RepoGradeCourseKindBasis | undefined; expectedFingerprint: string | null },
): Promise<PreparedRepoGradeProfile | RepoGradePreparationFailure | null> {
  function unavailable(reason: RepoGradeProfilePreparationFailure): null {
    observeProfileFailure?.(reason);
    return null;
  }

  if (profile.rubricPolicy === "manual" && !profile.useReadmeInstructions) {
    return await freezeRepoGradeRubric(profile, cohortId(profile.configurationFingerprint)) ?? unavailable("rubric-freeze-unavailable");
  }

  const { accountId, courseId, folder, configurationFingerprint, provider, model, graderVersion } = profile;
  let generator: RepoGradeRubricGenerator | null = null;
  let promptParserVersion = "repo-grade-local-rubric-v1";
  if (bootstrap) {
    const { courseKindBasis } = bootstrap;
    if (!courseKindBasis) return { status: "course-kind-required" };
    const policy = captureRepoGradePreparationPolicy(model, courseKindBasis);
    if (policy.status !== "ready") return unavailable("rubric-generator-unavailable");
    const activeGrader = getRepoGraderIdentity("gemini");
    if (activeGrader.model !== model || activeGrader.graderVersion !== graderVersion) return unavailable("grader-configuration-changed");
    try {
      getGeminiApiKey();
    } catch {
      return unavailable("gemini-key-unavailable");
    }
    generator = policy.generator;
    promptParserVersion = policy.version;
  }
  const resolve = resolveEvidence ?? createAutomaticRepoGradeEvidenceResolver(
    "startup", { read: async () => null, write: async () => {} }, async () => false, courseConfig,
  );
  const evidence = await resolve({
    configuration: {
      accountId, courseId, folder, configurationFingerprint, provider, model, graderVersion,
      promptParserVersion, courseKind: generator?.courseKind ?? "coding",
    },
    instructionPolicy: instructionPolicy(profile),
    inventory: folderInventory(discovery, profile),
  });
  if (evidence.status !== "ready") {
    observeProfileFailure?.(evidence.reason, "example" in evidence ? evidence.example : undefined);
    return null;
  }
  if (retry && retry.key !== evidence.key) return { status: "configuration-changed" };
  const captured = target ? evidence.evidence.find(({ target: pin }) => `${pin.owner}/${pin.repo}` === target.repo
    && pin.sourceRef === target.sourceRef && pin.sourceCommit === target.sha) : retry && evidence.evidence[0];
  if (!captured) return unavailable("pinned-target-missing");

  const preparedReadme: PreparedRepoGradeReadme | undefined = captured.source.kind === "template-readme"
    ? { path: null, instructions: evidence.instructions, template: true }
    : captured.source.kind === "saved" ? undefined : {
    path: captured.source.kind === "pinned-readme" ? captured.source.path : null,
    instructions: evidence.instructions,
  };

  if (generator && bootstrap?.courseKindBasis) {
    try {
      if (!retry && !await bootstrapRepoGradePreparation(profile, courseConfig, bootstrap.courseKindBasis, generator.courseKind,
        promptParserVersion, bootstrap.expectedFingerprint)) return { status: "configuration-changed" };
    } catch {
      return { status: "storage-unavailable" };
    }
    const prepared = await prepareGeminiRubric(profile, courseConfig, evidence, generator, retry);
    if (prepared.status !== "ready") return prepared;
    return {
      profile, cohortId: prepared.cohortId, receipt: prepared.receipt, preparedReadme,
      preparation: { key: evidence.key, context: { instructions: evidence.instructions, source: captured.source } },
    };
  }
  if (provider === "gemini" && profile.rubricPolicy === "generate") return unavailable("rubric-generator-unavailable");
  const generated = profile.rubricPolicy === "generate" ? generateEmbeddedRubricText(evidence.instructions) : undefined;
  if (generated === "") return unavailable("rubric-generation-unavailable");
  const frozen = await freezeRepoGradeRubric(profile, cohortId(evidence.key), generated);
  if (!frozen) return unavailable("rubric-freeze-unavailable");
  return { ...frozen, preparedReadme };
}
