import { normalizeTargetBranch, validateGithubOwnerRepo } from "../github-ref-name";
import { isGithubCommitSha } from "../github.repos";

// Pure reference transitions over one trusted account/course snapshot. The
// host must authenticate ownership, attest discovery completeness, verify
// outcome evidence, serialize and persist transitions before returning a
// claim, and enforce independent execution admission. A batch claim alone
// cannot authorize a provider call or retire an earlier uncertain execution.

type Scope = Readonly<{ accountId: string; courseId: string }>;

export type RepoGradeBatchBinding = Scope & Readonly<{ attemptId: string; generation: number }>;

type Target = Readonly<{ id: string; repo: string; sourceRef: string; sha: string; folder: string }>;
type Outcome = "succeeded" | "no-submission" | "failed" | "unknown";
type PriorCapture = Readonly<{ binding: RepoGradeBatchBinding; targetId: string; status: Outcome | "not-started" }>;
type Progress = Readonly<{ target: Target }> & (
  | Readonly<{ status: "queued" | "claimed" | Outcome }>
  | Readonly<{ status: "not-started"; reason: "interrupted" }>
  | Readonly<{ status: "not-started"; reason: "already-captured"; previous: PriorCapture }>
);
type Batch = Readonly<{
  binding: RepoGradeBatchBinding;
  leaseExpiresAtMs: number;
  retryOf: string | null;
  targets: readonly Progress[];
}>;

export type RepoGradeBatchV2State = Readonly<{ scope: Scope; batches: readonly Batch[] }>;
export type RepoGradeBatchClaim = Readonly<{ binding: RepoGradeBatchBinding; target: Target }>;

type Transition = Readonly<{
  state: RepoGradeBatchV2State;
  status: "applied" | "replayed" | "rejected" | "invalid-manifest" | "busy" | "no-work" | "already-captured" | "expired";
}>;

export function createRepoGradeBatchV2State(scope: Scope): RepoGradeBatchV2State {
  return Object.freeze({
    scope: Object.freeze({ accountId: scope.accountId, courseId: scope.courseId }),
    batches: Object.freeze([]),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIdentifier(value: string): boolean {
  return typeof value === "string" && value.length > 0 && value.isWellFormed() && !/[\s\u0000-\u001f\u007f]/.test(value);
}

function isExactFolder(value: unknown): value is string {
  return typeof value === "string" && value.isWellFormed() && !/[\\\u0000-\u001f\u007f]/.test(value)
    && value.split("/").every((part) => part.trim() !== "" && part !== "." && part !== ".." && part.toLowerCase() !== ".git");
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function matchesScope(left: Scope, right: Scope): boolean {
  return left.accountId === right.accountId && left.courseId === right.courseId;
}

function matchesBinding(left: RepoGradeBatchBinding, right: RepoGradeBatchBinding): boolean {
  return matchesScope(left, right) && left.attemptId === right.attemptId && left.generation === right.generation;
}

function targetOrder(left: Target, right: Target): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function repeatKey({ repo, sha, folder }: Target): string {
  return JSON.stringify([repo, sha, folder]);
}

// Input is the owned course inventory supplied by the trusted host. Check
// every source row before installing anything, even rows with zero folders.
function captureTargets(scope: Scope, input: unknown): Target[] | undefined {
  if (!isRecord(input) || input.accountId !== scope.accountId || input.courseId !== scope.courseId) return;
  const { discovery } = input;
  if (!isRecord(discovery) || discovery.status !== "scanned" || discovery.enumerationComplete !== true
    || !Array.isArray(discovery.repos)) return;

  const targets: Target[] = [];
  const sources = new Set<string>();
  const identities = new Set<string>();
  for (const source of discovery.repos) {
    if (!isRecord(source) || source.status !== "ready" || typeof source.repo !== "string"
      || typeof source.sourceRef !== "string" || !source.sourceRef.isWellFormed()
      || !isGithubCommitSha(source.sourceCommit) || !Array.isArray(source.folders)) return;
    const [owner, name, extra] = source.repo.split("/");
    if (!owner || !name || extra !== undefined || !validateGithubOwnerRepo(owner, name)) return;
    const ref = normalizeTargetBranch(source.sourceRef);
    if (!ref.ok || !ref.branch || ref.branch !== source.sourceRef) return;

    const repo = source.repo.toLowerCase();
    const sourceRef = ref.branch;
    const sha = source.sourceCommit.toLowerCase();
    const sourceKey = JSON.stringify([repo, sourceRef]);
    if (sources.has(sourceKey)) return;
    sources.add(sourceKey);

    for (const folder of source.folders) {
      if (!isExactFolder(folder)) return;
      const id = JSON.stringify([scope.accountId, scope.courseId, repo, sourceRef, sha, folder]);
      const target = { id, repo, sourceRef, sha, folder };
      const key = repeatKey(target);
      if (identities.has(key)) return;
      identities.add(key);
      targets.push(Object.freeze(target));
    }
  }

  return targets.sort(targetOrder);
}

function pending(batch: Batch): boolean {
  return batch.targets.some(({ status }) => status === "queued" || status === "claimed");
}

function findBatch(state: RepoGradeBatchV2State, binding: RepoGradeBatchBinding): Batch | undefined {
  if (!matchesScope(state.scope, binding)) return;
  return state.batches.find((batch) => matchesBinding(batch.binding, binding));
}

function replaceBatch(state: RepoGradeBatchV2State, previous: Batch, next: Batch): RepoGradeBatchV2State {
  return Object.freeze({ ...state, batches: Object.freeze(state.batches.map((batch) => batch === previous ? next : batch)) });
}

function withProgress(batch: Batch, update: (row: Progress) => Progress): Batch {
  return Object.freeze({ ...batch, targets: Object.freeze(batch.targets.map(update)) });
}

function captureHistory(batches: readonly Batch[]): ReadonlyMap<string, PriorCapture> {
  const history = new Map<string, PriorCapture>();
  for (const batch of batches) {
    for (const row of batch.targets) {
      if (row.status === "queued" || row.status === "claimed"
        || (row.status === "not-started" && row.reason === "already-captured")) continue;
      history.set(repeatKey(row.target), Object.freeze({
        binding: batch.binding, targetId: row.target.id, status: row.status,
      }));
    }
  }
  return history;
}

function install(
  state: RepoGradeBatchV2State, binding: RepoGradeBatchBinding, leaseExpiresAtMs: number, nowMs: number,
  targets: readonly Target[], retryOf: string | null,
): Transition {
  if (!matchesScope(state.scope, binding) || !isIdentifier(binding.accountId) || !isIdentifier(binding.courseId)
    || !isIdentifier(binding.attemptId) || !Number.isSafeInteger(binding.generation) || binding.generation <= 0
    || !validTime(nowMs) || !validTime(leaseExpiresAtMs)) return { state, status: "rejected" };
  if (targets.length === 0) return { state, status: "invalid-manifest" };

  const prior = state.batches.find((batch) => batch.binding.attemptId === binding.attemptId);
  if (prior) {
    const exact = matchesBinding(prior.binding, binding) && prior.leaseExpiresAtMs === leaseExpiresAtMs
      && prior.retryOf === retryOf && prior.targets.length === targets.length
      && prior.targets.every(({ target }, index) => target.id === targets[index].id);
    return { state, status: exact ? "replayed" : "rejected" };
  }

  const latest = state.batches.at(-1);
  if (nowMs >= leaseExpiresAtMs || (latest && binding.generation <= latest.binding.generation)) {
    return { state, status: "rejected" };
  }
  if (state.batches.some(pending)) return { state, status: "busy" };

  // Preserve coverage of repeated identities without turning their prior
  // outcomes into new work. A retry must name the latest original capture.
  const retryIndex = state.batches.findIndex((batch) => batch.binding.attemptId === retryOf);
  const captured = captureHistory(state.batches.slice(retryIndex + 1));
  const rows = targets.map((target): Progress => {
    const previous = captured.get(repeatKey(target));
    return previous
      ? Object.freeze({ target, status: "not-started", reason: "already-captured", previous })
      : Object.freeze({ target, status: "queued" });
  });
  if (retryOf !== null && rows.some((row) => row.status !== "queued")) return { state, status: "already-captured" };
  if (rows.every((row) => row.status !== "queued")) return { state, status: "no-work" };

  const batch: Batch = Object.freeze({
    binding: Object.freeze({
      accountId: binding.accountId, courseId: binding.courseId, attemptId: binding.attemptId, generation: binding.generation,
    }),
    leaseExpiresAtMs,
    retryOf,
    targets: Object.freeze(rows),
  });
  return { state: Object.freeze({ ...state, batches: Object.freeze([...state.batches, batch]) }), status: "applied" };
}

export function installRepoGradeBatchV2(
  state: RepoGradeBatchV2State, binding: RepoGradeBatchBinding, inventory: unknown, leaseExpiresAtMs: number, nowMs: number,
): Transition {
  if (!matchesScope(state.scope, binding)) return { state, status: "rejected" };
  const targets = captureTargets(state.scope, inventory);
  if (!targets) return { state, status: "invalid-manifest" };
  return install(state, binding, leaseExpiresAtMs, nowMs, targets, null);
}

/** An explicit selection from a prior manifest. The host must authorize the
 * retry and recheck course ownership and any outstanding execution fence. */
export function retryRepoGradeBatchV2(
  state: RepoGradeBatchV2State, binding: RepoGradeBatchBinding, previous: RepoGradeBatchBinding,
  targetIds: readonly string[], leaseExpiresAtMs: number, nowMs: number,
): Transition {
  if (!matchesScope(state.scope, binding)) return { state, status: "rejected" };
  const prior = findBatch(state, previous);
  if (!prior || pending(prior)) return { state, status: "rejected" };
  const selected = new Set(targetIds);
  const targets = prior.targets.filter((row) => selected.has(row.target.id)
    && (row.status === "failed" || row.status === "unknown" || (row.status === "not-started" && row.reason === "interrupted")));
  if (selected.size !== targetIds.length || targets.length !== selected.size) return { state, status: "invalid-manifest" };
  return install(state, binding, leaseExpiresAtMs, nowMs, targets.map(({ target }) => target), prior.binding.attemptId);
}

export function expireRepoGradeBatchV2(
  state: RepoGradeBatchV2State, binding: RepoGradeBatchBinding, nowMs: number,
): Transition {
  const batch = findBatch(state, binding);
  if (!batch || !validTime(nowMs) || nowMs < batch.leaseExpiresAtMs) return { state, status: "rejected" };
  if (!pending(batch)) return { state, status: "replayed" };

  const next = withProgress(batch, (row) => {
    if (row.status === "claimed") return Object.freeze({ target: row.target, status: "unknown" });
    if (row.status === "queued") return Object.freeze({ target: row.target, status: "not-started", reason: "interrupted" });
    return row;
  });
  return { state: replaceBatch(state, batch, next), status: "applied" };
}

export function claimRepoGradeBatchV2Target(
  state: RepoGradeBatchV2State, binding: RepoGradeBatchBinding, targetId: string, nowMs: number,
): Transition | Readonly<{ state: RepoGradeBatchV2State; status: "claimed"; claim: RepoGradeBatchClaim }> {
  const batch = findBatch(state, binding);
  const row = batch?.targets.find(({ target }) => target.id === targetId);
  if (!batch || !row || !validTime(nowMs)) return { state, status: "rejected" };
  if (nowMs >= batch.leaseExpiresAtMs) return { state: expireRepoGradeBatchV2(state, binding, nowMs).state, status: "expired" };
  if (row.status !== "queued") return { state, status: "replayed" };

  const next = withProgress(batch, (current) => current === row
    ? Object.freeze({ target: row.target, status: "claimed" }) : current);
  return {
    state: replaceBatch(state, batch, next), status: "claimed",
    claim: Object.freeze({ binding: batch.binding, target: row.target }),
  };
}

export function settleRepoGradeBatchV2Target(
  state: RepoGradeBatchV2State, claim: RepoGradeBatchClaim, outcome: Outcome, nowMs: number,
): Transition {
  const batch = findBatch(state, claim.binding);
  const row = batch?.targets.find(({ target }) => target.id === claim.target.id);
  if (!batch || !row || !validTime(nowMs) || !["succeeded", "no-submission", "failed", "unknown"].includes(outcome)
    || row.target.repo !== claim.target.repo || row.target.sourceRef !== claim.target.sourceRef
    || row.target.sha !== claim.target.sha || row.target.folder !== claim.target.folder) return { state, status: "rejected" };
  if (row.status === outcome) return { state, status: "replayed" };
  if (nowMs >= batch.leaseExpiresAtMs) {
    return { state: expireRepoGradeBatchV2(state, claim.binding, nowMs).state, status: "expired" };
  }
  if (row.status !== "claimed") return { state, status: "rejected" };

  const next = withProgress(batch, (current) => current === row
    ? Object.freeze({ target: row.target, status: outcome }) : current);
  return { state: replaceBatch(state, batch, next), status: "applied" };
}

/** Read the persisted view after reload. A read never renews a lease, grants a
 * claim, retries work, or converts an uncertain outcome into a failure. */
export function resumeRepoGradeBatchV2(state: RepoGradeBatchV2State, binding: RepoGradeBatchBinding): Batch | undefined {
  return findBatch(state, binding);
}

export function describeRepoGradeBatchV2(state: RepoGradeBatchV2State, binding: RepoGradeBatchBinding) {
  const batch = findBatch(state, binding);
  if (!batch) return undefined;
  const counts: Record<Progress["status"], number> = {
    queued: 0, claimed: 0, succeeded: 0, "no-submission": 0, failed: 0, unknown: 0, "not-started": 0,
  };
  for (const row of batch.targets) counts[row.status] += 1;
  return { total: batch.targets.length, counts };
}
