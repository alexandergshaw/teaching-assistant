// Reference model for a dark protocol. Each transition assumes one current
// account snapshot and a trusted clock. The runtime must authenticate actors,
// verify proofs, serialize the read/transition/write, and commit before returning
// a permit. The transport must independently enforce single use and produce
// evidence that excludes delayed sends. This module provides none of those
// security guarantees and must not be used as a provider dispatch boundary.

export const REPO_GRADE_ADMISSION_V2 = "repo-grade-queue-v2";

export type AttemptBinding = Readonly<{
  accountId: string;
  executorId: string;
  generation: number;
  protocol: typeof REPO_GRADE_ADMISSION_V2;
}>;

export type OperationSlot = Readonly<{
  id: string;
  kind: "rubric" | "grade";
  provider: string;
  model: string;
  inputDigest: string;
}>;

export type SealedAttempt = Readonly<{
  binding: AttemptBinding;
  courseId: string | null;
  expiresAtMs: number;
  slots: readonly OperationSlot[];
}>;

type TerminalOutcome = "completed" | "refused" | "never-dispatched";

export type TransportReceipt = Readonly<{
  binding: AttemptBinding;
  slot: OperationSlot;
  receiptId: string;
  outcome: TerminalOutcome;
}>;

export type RecoveryEvidence = Readonly<{
  binding: AttemptBinding;
  slot: OperationSlot;
  recoveryExecutorId: string;
  evidenceId: string;
  // The external verifier must establish both the outcome and retirement of
  // the original permit, even when the provider conclusively finished.
  outcome: TerminalOutcome;
}>;

type Executor = Readonly<{ accountId: string; executorId: string }> & (
  | { role: "execution" }
  | { role: "independent-recovery" }
);

// These functions are dependencies of the trusted host, never request fields.
// Opaque proof references are resolved to verified claims by that host.
type AdmissionAuthority = Readonly<{
  verifyPlan: (proof: string) => SealedAttempt | undefined;
  authenticateExecutor: (credential: string) => Executor | undefined;
  verifyReceipt: (proof: string) => TransportReceipt | undefined;
  verifyRetiredPermit: (proof: string) => RecoveryEvidence | undefined;
}>;

export type Settlement = Readonly<{
  id: string;
  outcome: "succeeded" | "no-submission" | "partial" | "failed";
  resultDigest: string | null;
}>;

type TerminalProof = Readonly<{
  source: "transport" | "recovery";
  id: string;
  outcome: TerminalOutcome;
}>;

type SlotState =
  | Readonly<{ status: "untouched"; operation: OperationSlot }>
  | Readonly<{ status: "consumed"; operation: OperationSlot }>
  | Readonly<{ status: "closed"; operation: OperationSlot; proof: TerminalProof }>;

type Disposition =
  | Readonly<{ status: "active" | "unknown" | "revoked" }>
  | Readonly<{ status: "settled"; settlement: Settlement }>
  | Readonly<{
      status: "recovered";
      recoveryExecutorId: string;
      evidence: readonly TerminalProof[];
    }>;

type Attempt = Readonly<{
  binding: AttemptBinding;
  courseId: string | null;
  expiresAtMs: number;
  slots: readonly SlotState[];
  disposition: Disposition;
}>;

export type AdmissionV2State = Readonly<{
  accountId: string;
  origin: "v2-only" | "legacy-unverified";
  tombstone: "live" | "deleted";
  deletedCourses: readonly string[];
  attempts: readonly Attempt[];
}>;

// Only a trusted provisioning decision may start a v2-only account. Missing,
// expired, or deleted legacy records are not evidence for that decision.
export function createAdmissionV2State(accountId: string, origin: AdmissionV2State["origin"]): AdmissionV2State {
  return { accountId, origin, tombstone: "live", deletedCourses: [], attempts: [] };
}

type Status = "applied" | "replayed" | "rejected" | "fenced" | "expired";
type Transition = Readonly<{ state: AdmissionV2State; status: Status }>;
type Begin = Transition | Readonly<{
  state: AdmissionV2State;
  status: "permitted";
  permit: Readonly<{ binding: AttemptBinding; slot: OperationSlot }>;
}>;

const digest = /^[0-9a-f]{64}$/;

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function sameBinding(left: AttemptBinding, right: AttemptBinding): boolean {
  return left.accountId === right.accountId && left.executorId === right.executorId
    && left.generation === right.generation && left.protocol === right.protocol;
}

function sameSlot(left: OperationSlot, right: OperationSlot): boolean {
  return left.id === right.id && left.kind === right.kind && left.provider === right.provider
    && left.model === right.model && left.inputDigest === right.inputDigest;
}

function validPlan(plan: SealedAttempt, state: AdmissionV2State): boolean {
  const { binding, expiresAtMs, slots } = plan;
  return binding.protocol === REPO_GRADE_ADMISSION_V2 && binding.accountId === state.accountId
    && Boolean(binding.executorId) && Number.isSafeInteger(binding.generation) && binding.generation > 0
    && (plan.courseId === null || Boolean(plan.courseId)) && validTime(expiresAtMs)
    && new Set(slots.map((slot) => slot.id)).size === slots.length
    && slots.every((slot) => Boolean(slot.id && slot.provider && slot.model)
      && (slot.kind === "rubric" || slot.kind === "grade") && digest.test(slot.inputDigest));
}

function samePlan(plan: SealedAttempt, attempt: Attempt): boolean {
  return sameBinding(plan.binding, attempt.binding) && plan.courseId === attempt.courseId
    && plan.expiresAtMs === attempt.expiresAtMs && plan.slots.length === attempt.slots.length
    && plan.slots.every((slot, index) => sameSlot(slot, attempt.slots[index].operation));
}

function findAttempt(state: AdmissionV2State, binding: AttemptBinding): Attempt | undefined {
  return state.attempts.find((attempt) => sameBinding(attempt.binding, binding));
}

function updateAttempt(state: AdmissionV2State, next: Attempt): AdmissionV2State {
  const attempts = state.attempts.map((attempt) => attempt.binding.generation === next.binding.generation
    ? next : attempt);
  return { ...state, attempts };
}

function updateSlot(attempt: Attempt, current: SlotState, next: SlotState): Attempt {
  return { ...attempt, slots: attempt.slots.map((slot) => slot === current ? next : slot) };
}

function isDeleted(state: AdmissionV2State, courseId: string | null): boolean {
  return state.tombstone === "deleted" || (courseId !== null && state.deletedCourses.includes(courseId));
}

export function hasAdmissionV2Fence(state: AdmissionV2State): boolean {
  return state.origin === "legacy-unverified" || state.attempts.some(({ disposition }) => (
    disposition.status === "active" || disposition.status === "unknown"
  ));
}

export function tombstoneAdmissionV2Scope(
  state: AdmissionV2State, scope: Readonly<{ accountId: string; courseId: string | null }>,
): Transition {
  if (state.accountId !== scope.accountId) return { state, status: "rejected" };
  if (isDeleted(state, scope.courseId)) return { state, status: "replayed" };
  // Tombstones preserve every attempt, including a reservation with no begins.
  return {
    status: "applied",
    state: scope.courseId === null
      ? { ...state, tombstone: "deleted" }
      : { ...state, deletedCourses: [...state.deletedCourses, scope.courseId] },
  };
}

function expire(attempt: Attempt, nowMs: number): Attempt {
  if (attempt.disposition.status !== "active" || nowMs < attempt.expiresAtMs) return attempt;
  const untouched = attempt.slots.every((slot) => slot.status === "untouched");
  return { ...attempt, disposition: { status: untouched ? "revoked" : "unknown" } };
}

export function expireAdmissionV2Attempt(
  state: AdmissionV2State, binding: AttemptBinding, nowMs: number,
): Transition {
  const attempt = findAttempt(state, binding);
  if (!attempt || !validTime(nowMs)) return { state, status: "rejected" };
  const next = expire(attempt, nowMs);
  if (next !== attempt) return { state: updateAttempt(state, next), status: "applied" };
  return {
    state,
    status: attempt.disposition.status === "revoked" || attempt.disposition.status === "unknown"
      ? "replayed" : "rejected",
  };
}

function sameProof(left: TerminalProof, right: TerminalProof): boolean {
  return left.source === right.source && left.id === right.id && left.outcome === right.outcome;
}

function validOutcome(outcome: TerminalOutcome): boolean {
  return outcome === "completed" || outcome === "refused" || outcome === "never-dispatched";
}

export function createAdmissionV2Model(authority: AdmissionAuthority) {
  function executionAttempt(state: AdmissionV2State, credential: string, binding: AttemptBinding) {
    const executor = authority.authenticateExecutor(credential);
    if (executor?.role !== "execution" || executor.accountId !== binding.accountId
      || executor.executorId !== binding.executorId) return undefined;
    return findAttempt(state, binding);
  }

  function install(state: AdmissionV2State, sealProof: string, nowMs: number): Transition {
    const plan = authority.verifyPlan(sealProof);
    if (!plan || !validTime(nowMs) || !validPlan(plan, state)) return { state, status: "rejected" };
    const latest = state.attempts.at(-1);
    if (latest && latest.binding.generation >= plan.binding.generation) {
      const existing = findAttempt(state, plan.binding);
      return { state, status: existing && samePlan(plan, existing) ? "replayed" : "rejected" };
    }
    if (isDeleted(state, plan.courseId) || nowMs >= plan.expiresAtMs) return { state, status: "rejected" };
    if (hasAdmissionV2Fence(state)) return { state, status: "fenced" };
    const attempt: Attempt = {
      binding: Object.freeze({ ...plan.binding }),
      courseId: plan.courseId,
      expiresAtMs: plan.expiresAtMs,
      slots: plan.slots.map((slot) => ({ status: "untouched", operation: Object.freeze({ ...slot }) })),
      disposition: { status: "active" },
    };
    return { state: { ...state, attempts: [...state.attempts, attempt] }, status: "applied" };
  }

  function begin(
    state: AdmissionV2State, credential: string, binding: AttemptBinding, operation: OperationSlot, nowMs: number,
  ): Begin {
    const attempt = executionAttempt(state, credential, binding);
    if (!attempt || !validTime(nowMs)) return { state, status: "rejected" };
    const current = attempt.slots.find((slot) => sameSlot(slot.operation, operation));
    if (!current) return { state, status: "rejected" };
    const next = expire(attempt, nowMs);
    if (next !== attempt) state = updateAttempt(state, next);
    if (current.status !== "untouched") return { state, status: "replayed" };
    if (isDeleted(state, next.courseId)) return { state, status: "rejected" };
    if (next.disposition.status === "revoked" || next.disposition.status === "unknown") {
      return { state, status: "expired" };
    }
    if (next.disposition.status !== "active") return { state, status: "rejected" };
    if (next.slots.some((slot) => slot.status === "consumed")) return { state, status: "fenced" };
    if (next.slots.find((slot) => slot.status === "untouched") !== current) return { state, status: "rejected" };
    return {
      state: updateAttempt(state, updateSlot(next, current, { status: "consumed", operation: current.operation })),
      status: "permitted",
      permit: { binding: next.binding, slot: current.operation },
    };
  }

  function close(state: AdmissionV2State, receiptProof: string): Transition {
    const receipt = authority.verifyReceipt(receiptProof);
    if (!receipt || !receipt.receiptId || !validOutcome(receipt.outcome)) return { state, status: "rejected" };
    const attempt = findAttempt(state, receipt.binding);
    const slot = attempt?.slots.find(({ operation }) => sameSlot(operation, receipt.slot));
    if (!attempt || !slot || slot.status === "untouched") return { state, status: "rejected" };
    const proof: TerminalProof = { source: "transport", id: receipt.receiptId, outcome: receipt.outcome };
    if (slot.status === "closed") return { state, status: sameProof(slot.proof, proof) ? "replayed" : "rejected" };
    const next = updateSlot(attempt, slot, { status: "closed", operation: slot.operation, proof });
    return { state: updateAttempt(state, next), status: "applied" };
  }

  function settle(
    state: AdmissionV2State, credential: string, binding: AttemptBinding, settlement: Settlement, nowMs: number,
  ): Transition {
    const attempt = executionAttempt(state, credential, binding);
    if (!attempt || !validTime(nowMs) || !settlement.id
      || (settlement.resultDigest !== null && !digest.test(settlement.resultDigest))
      || !["succeeded", "no-submission", "partial", "failed"].includes(settlement.outcome)) {
      return { state, status: "rejected" };
    }
    if (attempt.disposition.status === "settled") {
      const prior = attempt.disposition.settlement;
      const exact = prior.id === settlement.id && prior.outcome === settlement.outcome
        && prior.resultDigest === settlement.resultDigest;
      return { state, status: exact ? "replayed" : "rejected" };
    }
    const next = expire(attempt, nowMs);
    if (next !== attempt) state = updateAttempt(state, next);
    if (isDeleted(state, next.courseId)
      || (next.disposition.status !== "active" && next.disposition.status !== "unknown")) {
      return { state, status: "rejected" };
    }
    if (next.slots.some((slot) => slot.status === "consumed")) return { state, status: "fenced" };
    const disposition = { status: "settled", settlement: { ...settlement } } as const;
    return { state: updateAttempt(state, { ...next, disposition }), status: "applied" };
  }

  function recover(
    state: AdmissionV2State, credential: string, binding: AttemptBinding, evidenceProofs: readonly string[],
  ): Transition {
    const executor = authority.authenticateExecutor(credential);
    const attempt = findAttempt(state, binding);
    if (!attempt || executor?.role !== "independent-recovery" || executor.accountId !== binding.accountId
      || !executor.executorId || executor.executorId === binding.executorId) return { state, status: "rejected" };
    const prior = attempt.disposition;
    if (prior.status !== "unknown" && prior.status !== "recovered"
      && !(prior.status === "active" && isDeleted(state, attempt.courseId))) return { state, status: "rejected" };

    const consumed = attempt.slots.filter((slot) => slot.status !== "untouched");
    if (consumed.length === 0 || consumed.length !== evidenceProofs.length) return { state, status: "rejected" };
    const evidence: TerminalProof[] = [];
    const evidenceIds = new Set<string>();
    for (const [index, slot] of consumed.entries()) {
      const claim = authority.verifyRetiredPermit(evidenceProofs[index]);
      if (!claim || !sameBinding(claim.binding, binding) || !sameSlot(claim.slot, slot.operation)
        || claim.recoveryExecutorId !== executor.executorId || !claim.evidenceId || evidenceIds.has(claim.evidenceId)
        || !validOutcome(claim.outcome) || (slot.status === "closed" && slot.proof.outcome !== claim.outcome)) {
        return { state, status: "rejected" };
      }
      evidenceIds.add(claim.evidenceId);
      evidence.push({ source: "recovery", id: claim.evidenceId, outcome: claim.outcome });
    }
    if (prior.status === "recovered") {
      const exact = prior.recoveryExecutorId === executor.executorId
        && evidence.every((proof, index) => sameProof(prior.evidence[index], proof));
      return { state, status: exact ? "replayed" : "rejected" };
    }
    const slots = attempt.slots.map((slot, index): SlotState => slot.status === "consumed"
      ? { status: "closed", operation: slot.operation, proof: evidence[index] } : slot);
    const disposition = { status: "recovered", recoveryExecutorId: executor.executorId, evidence } as const;
    return { state: updateAttempt(state, { ...attempt, slots, disposition }), status: "applied" };
  }

  return { install, begin, close, settle, recover };
}
