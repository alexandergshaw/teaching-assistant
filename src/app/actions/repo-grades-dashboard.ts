"use server";

import { planRepoGradeCourse, runRepoGradeTarget } from "@/lib/repo-grades-dashboard/runner";
import { requireAppOwner } from "@/lib/supabase/auth";
import { repoGradeAdmissionMode, repoGradeDurableStartupAvailable, repoGradeStartupAvailable } from "@/lib/repo-grades-dashboard/admission-mode";
import { repoGradeDiscoveryEnabled } from "@/lib/repo-grades-dashboard/discovery-mode";
import { readRepoGradeHistoryForOwner, REPO_GRADE_HISTORY_PAGE_SIZE } from "@/lib/repo-grades-dashboard/ledger";
import {
  prepareEmbeddedRepoGradeStartupProfile, prepareRepoGradeStartupProfile, type RepoGradePreparationDiagnostic,
} from "@/lib/repo-grades-dashboard/preparation-runtime";
import {
  createRepoGradeStartupSchedule, repoGradeStartupKey, type RepoGradeHistoryObservation,
} from "@/lib/repo-grades-dashboard/scheduler";
import {
  closeStartupBatch, finishStartupTarget, readStartupBatch, sealStartupBatch, stageStartupTargets, startStartupTarget,
} from "@/lib/repo-grades-dashboard/startup-batch";
import { readRepoGradeStartupCourses } from "@/lib/repo-grades-dashboard/startup-courses";
import { readRepoGradeStartupHistory } from "@/lib/repo-grades-dashboard/startup-history";
import { isPreparationDigest, type RepoGradePreparationRetry } from "@/lib/repo-grades-dashboard/preparation-ledger";
import { isRepoGradeProfileFolder } from "@/lib/repo-grades-dashboard/profile";

function validCourseId(courseId: unknown): courseId is string {
  return typeof courseId === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(courseId);
}

function startupAvailable(mode = repoGradeAdmissionMode()) {
  return repoGradeStartupAvailable(mode) && !repoGradeDurableStartupAvailable(mode);
}

const STARTUP_PREVIEW_TARGET_LIMIT = 50;

/** Read the selected class's plan without a startup batch. */
export async function previewRepoGradeStartupPlanAction(courseId: unknown, expectedAccountId: unknown) {
  const owner = await requireAppOwner();
  if (owner.id !== expectedAccountId || !validCourseId(courseId)) return { status: "course-unavailable" } as const;
  if (!repoGradeDiscoveryEnabled()) return { status: "discovery-disabled" } as const;

  const plan = await readRepoGradeCoursePlan(owner.id, courseId.toLowerCase());
  if (plan.status !== "planned") return { status: "course-unavailable" } as const;
  const { discovery, preview } = plan;
  return {
    status: "preview",
    discovery: discovery.status === "scanned" ? {
      status: "scanned" as const,
      enumerationComplete: discovery.enumerationComplete,
      incompleteSources: discovery.repos.filter((source) => source.status !== "ready").length,
    } : discovery,
    history: preview.history,
    targetCount: preview.targets.length,
    targets: preview.targets.slice(0, STARTUP_PREVIEW_TARGET_LIMIT),
  } as const;
}

/** Check the server's activation gates without starting any course work. */
export async function readRepoGradeStartupReadinessAction(expectedAccountId: unknown) {
  const owner = await requireAppOwner().catch(() => null);
  if (!owner || owner.id !== expectedAccountId || !startupAvailable()) {
    return { status: "unavailable" } as const;
  }
  return { status: "ready", accountId: owner.id } as const;
}

/** Read the startup course inventory for the account that opened the view. */
export async function readRepoGradeStartupCoursesAction(expectedAccountId: unknown) {
  const owner = await requireAppOwner().catch(() => null);
  if (!owner || owner.id !== expectedAccountId) {
    return { status: "unknown", reason: "account-unavailable" } as const;
  }
  return readRepoGradeStartupCourses(owner.id);
}

export async function readRepoGradeStartupBatchAction(expectedAccountId: unknown) {
  const owner = await requireAppOwner().catch(() => null);
  if (!owner || owner.id !== expectedAccountId || !startupAvailable()) return { status: "unavailable" } as const;
  try {
    return { status: "loaded", notice: await readStartupBatch(owner.id) } as const;
  } catch {
    return { status: "unavailable" } as const;
  }
}

export async function sealRepoGradeStartupBatchAction(expectedAccountId: unknown, batchId: unknown, count: unknown) {
  const owner = await requireAppOwner().catch(() => null);
  if (!owner || owner.id !== expectedAccountId || !validCourseId(batchId) || !startupAvailable()
    || typeof count !== "number" || !Number.isSafeInteger(count) || count < 1 || count > 1000) return false;
  return sealStartupBatch(owner.id, batchId, count).catch(() => false);
}

export async function closeRepoGradeStartupBatchAction(expectedAccountId: unknown, batchId: unknown) {
  const owner = await requireAppOwner().catch(() => null);
  if (!owner || owner.id !== expectedAccountId || !validCourseId(batchId) || !startupAvailable()) return false;
  return closeStartupBatch(owner.id, batchId).catch(() => false);
}

/** Preview one owned course. A startup opening also stages its eligible
 * targets from this same server-derived snapshot. */
export async function planRepoGradeCourseAction(courseId: string, expectedAccountId?: string, batchId?: string) {
  const owner = await requireAppOwner();
  if (!validCourseId(courseId) || (expectedAccountId !== undefined && owner.id !== expectedAccountId)) {
    return { status: "course-unavailable" } as const;
  }
  if (batchId !== undefined && (owner.id !== expectedAccountId || !validCourseId(batchId) || !startupAvailable())) {
    return { status: "course-unavailable" } as const;
  }
  return readRepoGradeCoursePlan(owner.id, courseId.toLowerCase(), batchId);
}

async function readRepoGradeCoursePlan(accountId: string, courseId: string, batchId?: string) {
  try {
    const plan = await planRepoGradeCourse(accountId, courseId);
    if (!plan) return { status: "course-unavailable" } as const;
    const scope = { accountId, generation: "preview" };
    const inventories = [{
      accountId: plan.accountId, courseId: plan.courseId,
      organization: plan.courseConfig.github_org, discovery: plan.discovery,
    }];
    const inventory = createRepoGradeStartupSchedule(scope, inventories, new Map(), false);
    const targets = [...inventory.work.values()].map(({ target }) => target);
    let history: ReadonlyMap<string, RepoGradeHistoryObservation> | null = targets.length
      ? await readRepoGradeStartupHistory(accountId, plan.courseId, targets) : null;
    if (batchId && history) {
      const queued = targets.filter((target) => history?.get(repoGradeStartupKey(target)) === "never-attempted");
      if (queued.length) {
        const skipped = await stageStartupTargets(accountId, batchId, plan.courseId, queued)
          .catch(() => null);
        if (!skipped) return { status: "batch-unavailable" } as const;
        const observed = new Map<string, RepoGradeHistoryObservation>(history);
        for (const [key, state] of skipped) observed.set(key, state);
        history = observed;
      }
    }
    const preview = history ? createRepoGradeStartupSchedule(scope, inventories, history, false) : inventory;
    return {
      status: "planned",
      discovery: plan.discovery,
      execution: "runtime-unavailable",
      preview: {
        history: history ? "complete" : targets.length ? "unknown" : "not-read",
        targets: [...preview.work.values()].map(({ target, state }) => ({
          repo: target.repo, sourceRef: target.sourceRef, commit: target.sha, folder: target.folder, state,
        })),
      },
    } as const;
  } catch {
    return { status: "storage-unavailable" } as const;
  }
}

/** Revalidate a startup target from the owner's current course and pinned
 * inventory. The browser supplies only a selector from an earlier preview. */
export async function runRepoGradeStartupTargetAction(
  expectedAccountId: unknown, courseId: unknown, repo: unknown, folder: unknown, sourceRef: unknown, commit: unknown,
  batchId: unknown,
) {
  const owner = await requireAppOwner();
  if (owner.id !== expectedAccountId || !validCourseId(courseId)) return { status: "forbidden" } as const;
  if (typeof repo !== "string" || typeof folder !== "string" || typeof sourceRef !== "string"
    || typeof commit !== "string" || !/^[0-9a-f]{40}$/.test(commit)) return { status: "ungraded" } as const;
  const mode = repoGradeAdmissionMode();
  if (!startupAvailable(mode)) {
    return { status: "runtime-unavailable" } as const;
  }
  if (!validCourseId(batchId)) return { status: "forbidden" } as const;
  const startupBatchId = batchId;

  const target = { accountId: owner.id, courseId: courseId.toLowerCase(), repo, folder, sourceRef, sha: commit };
  async function evaluate() {
    const plan = await planRepoGradeCourse(owner.id, target.courseId);
    if (!plan) return { status: "forbidden" } as const;
    if (plan.discovery.status !== "scanned" || !plan.discovery.enumerationComplete) return { status: "partial" } as const;
    const source = plan.discovery.repos.find((row) => row.repo === target.repo && row.sourceRef === target.sourceRef);
    if (source?.status !== "ready" || source.sourceCommit !== target.sha || !source.folders.includes(target.folder)) {
      return { status: "ungraded" } as const;
    }

    // This preflight can suppress already observed work. Activation also
    // requires cross-ref suppression under the durable account lock.
    const history = await readRepoGradeStartupHistory(owner.id, plan.courseId, [target]);
    const status = history?.get(repoGradeStartupKey(target));
    if (!status) return { status: "storage-unavailable" } as const;
    if (status === "recoverable-partial" || status === "recoverable-text") return { status: "partial" } as const;
    if (status !== "never-attempted") return { status };

    // Return unretained feedback to the authorized caller for session recovery.
    const diagnostics: { preparationDiagnostic?: RepoGradePreparationDiagnostic } = {};
    const expectedSourceRef = plan.folderSources.get(target.folder) ?? null;
    const evaluation = await runRepoGradeTarget(plan, target, {
      startupBatchId,
      loadPreparedProfile: (scope) => mode === "embedded-only"
        ? prepareEmbeddedRepoGradeStartupProfile(scope, expectedSourceRef)
        : prepareRepoGradeStartupProfile(
          scope, plan.discovery, expectedSourceRef, target, plan.courseConfig, plan.courseKindBasis,
          { observePreparation: (metric) => { diagnostics.preparationDiagnostic = metric; } },
        ),
    });
    return { ...evaluation, ...diagnostics };
  }

  try {
    // A missing response may conceal a committed start. Never evaluate
    // without positive acknowledgement of this exact batch and target.
    if (!await startStartupTarget(batchId, target)) return { status: "storage-unavailable" } as const;
    const evaluation = await evaluate().catch(() => ({ status: "storage-unavailable" } as const));
    const { status } = evaluation;
    // This updates only an unlinked marker, under the same lock as grading
    // admission. A claimed grade keeps its attempt status, even if the
    // response was lost. Rubric preparation has its own paid-dispatch ledger.
    const durableStatus = status === "terminal" || status === "succeeded" || status === "no-submission"
      ? "already-processed" : "not-started";
    const recorded = await finishStartupTarget(batchId, target, durableStatus).catch(() => false);
    if (!recorded && !("unretainedResult" in evaluation)) return { status: "storage-unavailable" } as const;
    return evaluation;
  } catch {
    return { status: "storage-unavailable" } as const;
  }
}

/** Retry only the selected terminal rubric generation. Current course inputs,
 * profile, folder inventory and instructions come from the server. */
export async function retryRepoGradePreparationAction(
  expectedAccountId: unknown, courseId: unknown, folder: unknown, key: unknown, generation: unknown,
): Promise<RepoGradePreparationDiagnostic & { preparationRetry?: RepoGradePreparationRetry }> {
  const startedAt = performance.now();
  function result(status: RepoGradePreparationDiagnostic["status"], preparationRetry?: RepoGradePreparationRetry) {
    return {
      status, durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      ...(preparationRetry && { preparationRetry }),
    };
  }
  const owner = await requireAppOwner().catch(() => null);
  if (!owner || owner.id !== expectedAccountId || !validCourseId(courseId)
    || !isRepoGradeProfileFolder(folder) || folder.length > 512
    || !isPreparationDigest(key) || !isPreparationDigest(generation)) return result("forbidden");
  if (repoGradeAdmissionMode() !== "coordinated" || !repoGradeDiscoveryEnabled()) return result("retry-unavailable");
  try {
    const plan = await planRepoGradeCourse(owner.id, courseId.toLowerCase());
    if (!plan) return result("forbidden");
    if (plan.discovery.status !== "scanned" || !plan.discovery.enumerationComplete) return result("profile-unavailable");
    const prepared = await prepareRepoGradeStartupProfile(
      { accountId: owner.id, courseId: plan.courseId, folder }, plan.discovery,
      plan.folderSources.get(folder) ?? null, undefined, plan.courseConfig, plan.courseKindBasis,
      { retry: { key, generation } },
    );
    if (!prepared) return result("profile-unavailable");
    if ("status" in prepared) return result(prepared.status, prepared.preparationRetry);
    return result("ready");
  } catch {
    return result("storage-unavailable");
  }
}

/** Read-only attempt history. An account change between rendering and sending
 * the request must not substitute the newly authenticated account's data. */
export async function readRepoGradeHistoryAction(courseId: string, expectedAccountId: string, before?: number) {
  const owner = await requireAppOwner();
  if (owner.id !== expectedAccountId || !validCourseId(courseId)
    || (before !== undefined && (!Number.isSafeInteger(before) || before <= 0))) {
    return { status: "course-unavailable" } as const;
  }
  try {
    const rows = await readRepoGradeHistoryForOwner(owner.id, courseId, before);
    if (!rows) return { status: "course-unavailable" } as const;
    return {
      status: "loaded",
      // A full page might be the last page. Only a short read proves the end.
      nextBefore: rows.length === REPO_GRADE_HISTORY_PAGE_SIZE ? rows.at(-1)!.generation : null,
      rows: rows.map((row) => ({
        generation: row.generation,
        repo: row.repo,
        folder: row.folder,
        sourceRef: row.source_ref,
        commit: row.source_sha,
        profileFingerprint: row.profile_fingerprint,
        status: row.status,
        claimedAt: new Date(row.claimed_at).toISOString(),
        settledAt: row.settled_at === null ? null : new Date(row.settled_at).toISOString(),
        score: row.score,
        feedback: row.feedback,
        feedback_sections: row.feedback_sections ?? null,
        unexamined_artifacts: row.unexamined_artifacts ?? null,
        feedback_retention: row.feedback_retention ?? null,
        rubric: row.rubric,
      })),
    } as const;
  } catch {
    return { status: "storage-unavailable" } as const;
  }
}
