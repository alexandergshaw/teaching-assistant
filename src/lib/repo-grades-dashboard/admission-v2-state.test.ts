import { describe, expect, it } from "vitest";
import {
  createAdmissionV2Model,
  createAdmissionV2State,
  expireAdmissionV2Attempt,
  hasAdmissionV2Fence,
  REPO_GRADE_ADMISSION_V2,
  tombstoneAdmissionV2Scope,
  type AttemptBinding,
  type OperationSlot,
  type RecoveryEvidence,
  type SealedAttempt,
  type Settlement,
  type TransportReceipt,
} from "./admission-v2-state";

const accountId = "account";
const courseId = "course";
const binding: AttemptBinding = {
  accountId, executorId: "worker", generation: 1, protocol: REPO_GRADE_ADMISSION_V2,
};
const rubric: OperationSlot = {
  id: "rubric", kind: "rubric", provider: "provider", model: "rubric-model", inputDigest: "a".repeat(64),
};
const grade: OperationSlot = {
  id: "grade", kind: "grade", provider: "provider", model: "grade-model", inputDigest: "b".repeat(64),
};
const plan: SealedAttempt = { binding, courseId, expiresAtMs: 20, slots: [rubric, grade] };
const settlement: Settlement = { id: "settlement", outcome: "succeeded", resultDigest: "c".repeat(64) };
const failed: Settlement = { id: "failed", outcome: "failed", resultDigest: null };
const initial = createAdmissionV2State(accountId, "v2-only");
const worker = "worker-credential";
const recovery = "recovery-credential";

function setup() {
  const plans = new Map([["seal", plan], ["next", {
    ...plan, binding: { ...binding, generation: 2 }, expiresAtMs: 40,
  }]]);
  const receipts = new Map<string, TransportReceipt>([
    ["rubric-receipt", { binding, slot: rubric, receiptId: "receipt-1", outcome: "completed" }],
    ["grade-receipt", { binding, slot: grade, receiptId: "receipt-2", outcome: "completed" }],
  ]);
  const evidence = new Map<string, RecoveryEvidence>([
    ["rubric-retired", {
      binding, slot: rubric, recoveryExecutorId: "reviewer", evidenceId: "evidence-1", outcome: "completed",
    }],
    ["grade-retired", {
      binding, slot: grade, recoveryExecutorId: "reviewer", evidenceId: "evidence-2", outcome: "never-dispatched",
    }],
  ]);
  const model = createAdmissionV2Model({
    verifyPlan: (proof) => plans.get(proof),
    authenticateExecutor: (credential) => {
      switch (credential) {
        case worker: return { role: "execution", accountId, executorId: "worker" };
        case "other-worker": return { role: "execution", accountId, executorId: "other" };
        case "other-account": return { role: "execution", accountId: "other", executorId: "worker" };
        case "wrong-recovery-account": return { role: "independent-recovery", accountId: "other", executorId: "reviewer" };
        case "self-recovery": return { role: "independent-recovery", accountId, executorId: "worker" };
        case recovery: return { role: "independent-recovery", accountId, executorId: "reviewer" };
      }
    },
    verifyReceipt: (proof) => receipts.get(proof),
    verifyRetiredPermit: (proof) => evidence.get(proof),
  });
  const installed = model.install(initial, "seal", 10);
  expect(installed.status).toBe("applied");
  return { model, plans, receipts, evidence, installed: installed.state };
}

describe("repo grade queue v2 admission reference model", () => {
  it("seals an ordered snapshot and rejects duplicate IDs, reorder, substitution, and append", () => {
    const { model, plans } = setup();
    plans.set("duplicate", { ...plan, slots: [rubric, { ...grade, id: rubric.id }] });
    plans.set("bad-digest", { ...plan, slots: [{ ...rubric, inputDigest: "arbitrary" }] });
    plans.set("wrong-version", {
      ...plan, binding: { ...binding, protocol: "legacy" as AttemptBinding["protocol"] },
    });
    plans.set("wrong-account", { ...plan, binding: { ...binding, accountId: "other" } });
    for (const proof of ["missing", "duplicate", "bad-digest", "wrong-version", "wrong-account"]) {
      expect(model.install(initial, proof, 10)).toEqual({ state: initial, status: "rejected" });
    }
    const mutableSlots = [{ ...rubric }, { ...grade }];
    const mutableBinding = { ...binding };
    plans.set("mutable", { ...plan, binding: mutableBinding, slots: mutableSlots });
    const { state } = model.install(initial, "mutable", 10);
    mutableSlots[0].model = "unsealed-model";
    mutableSlots.reverse();
    mutableBinding.executorId = "other";
    expect(model.install(state, "mutable", 10)).toEqual({ state, status: "rejected" });
    expect(model.install(state, "seal", 10)).toEqual({ state, status: "replayed" });

    const appended = { ...grade, id: "extra-slot" };
    plans.set("append", { ...plan, slots: [rubric, grade, appended] });
    plans.set("reorder", { ...plan, slots: [grade, rubric] });
    for (const proof of ["append", "reorder"]) {
      expect(model.install(state, proof, 10)).toEqual({ state, status: "rejected" });
    }
    for (const slot of [grade, appended, { ...rubric, model: "unsealed-model" }, {
      ...rubric, provider: "different",
    }, { ...rubric, kind: "grade" } as const, { ...rubric, inputDigest: grade.inputDigest }]) {
      expect(model.begin(state, worker, binding, slot, 11)).toEqual({ state, status: "rejected" });
    }
    expect(model.begin(state, worker, binding, rubric, 11)).toMatchObject({
      status: "permitted", permit: { binding, slot: rubric },
    });
  });

  it("issues one permit even if begin acknowledgement was lost and blocks later slots", () => {
    const { model, installed } = setup();
    const begun = model.begin(installed, worker, binding, rubric, 11);
    expect(begun).toMatchObject({ status: "permitted", permit: { binding, slot: rubric } });
    expect(model.begin(begun.state, worker, binding, rubric, 12)).toEqual({
      state: begun.state, status: "replayed",
    });
    expect(model.begin(begun.state, worker, binding, grade, 12)).toEqual({
      state: begun.state, status: "fenced",
    });
    expect(model.install(begun.state, "next", 12)).toEqual({ state: begun.state, status: "fenced" });
    expect(model.settle(begun.state, worker, binding, failed, 12)).toEqual({
      state: begun.state, status: "fenced",
    });

    const closed = model.close(begun.state, "rubric-receipt");
    expect(closed.status).toBe("applied");
    expect(model.begin(closed.state, worker, binding, rubric, 13)).toEqual({
      state: closed.state, status: "replayed",
    });
    expect(model.begin(closed.state, worker, binding, grade, 13)).toMatchObject({
      status: "permitted", permit: { binding, slot: grade },
    });
  });

  it("checks executor account, executor role, generation, and protocol at begin and settlement", () => {
    const { model, installed } = setup();
    const mismatches = [
      ["other-worker", binding], ["other-account", binding], [recovery, binding], ["unverified", binding],
      [worker, { ...binding, generation: 2 }], [worker, { ...binding, executorId: "other" }],
      [worker, { ...binding, accountId: "other" }],
      [worker, { ...binding, protocol: "legacy" as AttemptBinding["protocol"] }],
    ] as const;
    for (const [credential, identity] of mismatches) {
      expect(model.begin(installed, credential, identity, rubric, 11)).toEqual({
        state: installed, status: "rejected",
      });
      expect(model.settle(installed, credential, identity, failed, 11)).toEqual({
        state: installed, status: "rejected",
      });
    }
  });

  it("makes expiry-first safe and fences a begin-first race at the deadline", () => {
    const { model, installed } = setup();
    expect(expireAdmissionV2Attempt(installed, binding, 19)).toEqual({ state: installed, status: "rejected" });
    const expired = expireAdmissionV2Attempt(installed, binding, 20);
    expect(expired.status).toBe("applied");
    expect(hasAdmissionV2Fence(expired.state)).toBe(false);
    expect(model.begin(expired.state, worker, binding, rubric, 20)).toEqual({
      state: expired.state, status: "expired",
    });
    expect(model.begin(installed, worker, binding, rubric, 20)).toEqual({
      state: expired.state, status: "expired",
    });
    expect(expireAdmissionV2Attempt(expired.state, binding, 21)).toEqual({
      state: expired.state, status: "replayed",
    });
    expect(model.install(expired.state, "next", 21).status).toBe("applied");

    const begun = model.begin(installed, worker, binding, rubric, 19);
    expect(begun.status).toBe("permitted");
    const stale = expireAdmissionV2Attempt(begun.state, binding, 20);
    expect(stale.status).toBe("applied");
    expect(hasAdmissionV2Fence(stale.state)).toBe(true);
    expect(model.begin(stale.state, worker, binding, rubric, 20)).toEqual({
      state: stale.state, status: "replayed",
    });
    expect(model.begin(stale.state, worker, binding, grade, 20)).toEqual({
      state: stale.state, status: "expired",
    });
    expect(model.settle(stale.state, worker, binding, failed, 21)).toEqual({
      state: stale.state, status: "fenced",
    });
    expect(model.install(stale.state, "next", 21)).toEqual({ state: stale.state, status: "fenced" });
    const closed = model.close(stale.state, "rubric-receipt");
    expect(closed.status).toBe("applied");
    expect(hasAdmissionV2Fence(closed.state)).toBe(true);
    const settled = model.settle(closed.state, worker, binding, failed, 21);
    expect(settled.status).toBe("applied");
    expect(hasAdmissionV2Fence(settled.state)).toBe(false);
  });

  it("accepts only a matching terminal receipt for a consumed slot and separates replays from conflicts", () => {
    const { model, receipts, installed } = setup();
    const begun = model.begin(installed, worker, binding, rubric, 11);
    const receipt = receipts.get("rubric-receipt")!;
    receipts.set("wrong-binding", { ...receipt, binding: { ...binding, executorId: "other" } });
    receipts.set("wrong-generation", { ...receipt, binding: { ...binding, generation: 2 } });
    receipts.set("wrong-input", { ...receipt, slot: { ...rubric, inputDigest: grade.inputDigest } });
    receipts.set("conflicting-receipt", { ...receipt, outcome: "refused" });
    receipts.set("different-receipt-id", { ...receipt, receiptId: "other-receipt" });
    for (const proof of ["unverified", "wrong-binding", "wrong-generation", "wrong-input", "grade-receipt"]) {
      expect(model.close(begun.state, proof)).toEqual({ state: begun.state, status: "rejected" });
    }
    const closed = model.close(begun.state, "rubric-receipt");
    expect(closed.status).toBe("applied");
    expect(model.close(closed.state, "rubric-receipt")).toEqual({ state: closed.state, status: "replayed" });
    for (const proof of ["conflicting-receipt", "different-receipt-id"]) {
      expect(model.close(closed.state, proof)).toEqual({ state: closed.state, status: "rejected" });
    }
  });

  it("records exact settlement once and keeps its replay separate from a newer fence", () => {
    const { model, installed } = setup();
    let state = installed;
    for (const [slot, proof] of [[rubric, "rubric-receipt"], [grade, "grade-receipt"]] as const) {
      const begun = model.begin(state, worker, binding, slot, 11);
      expect(begun.status).toBe("permitted");
      const closed = model.close(begun.state, proof);
      expect(closed.status).toBe("applied");
      state = closed.state;
    }
    const settled = model.settle(state, worker, binding, settlement, 12);
    expect(settled.status).toBe("applied");
    expect(hasAdmissionV2Fence(settled.state)).toBe(false);
    const next = model.install(settled.state, "next", 13);
    expect(next.status).toBe("applied");
    expect(model.settle(next.state, worker, binding, { ...settlement }, 13)).toEqual({
      state: next.state, status: "replayed",
    });
    for (const conflict of [{ ...settlement, id: "other-id" }, { ...settlement, resultDigest: grade.inputDigest }, failed]) {
      expect(model.settle(next.state, worker, binding, conflict, 13)).toEqual({
        state: next.state, status: "rejected",
      });
    }
    expect(model.install(next.state, "seal", 13)).toEqual({ state: next.state, status: "replayed" });
    expect(hasAdmissionV2Fence(next.state)).toBe(true);
  });

  it("tombstones a course before consumption without clearing its account fence", () => {
    const { model, plans, installed } = setup();
    const scope = { accountId, courseId };
    expect(tombstoneAdmissionV2Scope(installed, { ...scope, accountId: "other" })).toEqual({
      state: installed, status: "rejected",
    });
    const deleted = tombstoneAdmissionV2Scope(installed, scope);
    expect(deleted.status).toBe("applied");
    expect(tombstoneAdmissionV2Scope(deleted.state, scope)).toEqual({ state: deleted.state, status: "replayed" });
    expect(model.begin(deleted.state, worker, binding, rubric, 11)).toEqual({
      state: deleted.state, status: "rejected",
    });
    expect(model.settle(deleted.state, worker, binding, failed, 11)).toEqual({
      state: deleted.state, status: "rejected",
    });
    plans.set("other-course", { ...plans.get("next")!, courseId: "other" });
    expect(model.install(deleted.state, "other-course", 11)).toEqual({ state: deleted.state, status: "fenced" });
    const expired = expireAdmissionV2Attempt(deleted.state, binding, 20);
    expect(expired.status).toBe("applied");
    expect(model.install(expired.state, "next", 21)).toEqual({ state: expired.state, status: "rejected" });
    expect(model.install(expired.state, "other-course", 21).status).toBe("applied");
  });

  it("keeps a deleted account fenced until independent recovery and then rejects new attempts", () => {
    const { model, installed } = setup();
    const begun = model.begin(installed, worker, binding, rubric, 11);
    const deleted = tombstoneAdmissionV2Scope(begun.state, { accountId, courseId: null });
    expect(deleted.status).toBe("applied");
    expect(model.begin(deleted.state, worker, binding, grade, 12)).toEqual({
      state: deleted.state, status: "rejected",
    });
    const late = model.close(deleted.state, "rubric-receipt");
    expect(late.status).toBe("applied");
    expect(model.settle(late.state, worker, binding, failed, 12)).toEqual({ state: late.state, status: "rejected" });
    expect(hasAdmissionV2Fence(late.state)).toBe(true);
    const recovered = model.recover(late.state, recovery, binding, ["rubric-retired"]);
    expect(recovered.status).toBe("applied");
    expect(hasAdmissionV2Fence(recovered.state)).toBe(false);
    expect(model.install(recovered.state, "next", 13)).toEqual({ state: recovered.state, status: "rejected" });
  });

  it("requires an independent executor and external evidence for every consumed slot before recovery", () => {
    const { model, evidence, installed } = setup();
    const first = model.begin(installed, worker, binding, rubric, 11);
    const closed = model.close(first.state, "rubric-receipt");
    const second = model.begin(closed.state, worker, binding, grade, 12);
    expect(second.status).toBe("permitted");
    const all = ["rubric-retired", "grade-retired"];
    expect(model.recover(second.state, recovery, binding, all)).toEqual({ state: second.state, status: "rejected" });
    const { state } = expireAdmissionV2Attempt(second.state, binding, 20);
    for (const credential of [worker, "wrong-recovery-account", "unverified"]) {
      expect(model.recover(state, credential, binding, all)).toEqual({ state, status: "rejected" });
    }
    const selfEvidence = all.map((proof) => {
      const selfProof = `self-${proof}`;
      evidence.set(selfProof, { ...evidence.get(proof)!, recoveryExecutorId: binding.executorId });
      return selfProof;
    });
    expect(model.recover(state, "self-recovery", binding, selfEvidence)).toEqual({ state, status: "rejected" });
    const gradeEvidence = evidence.get("grade-retired")!;
    evidence.set("wrong-recovery-executor", { ...gradeEvidence, recoveryExecutorId: "other" });
    evidence.set("wrong-attempt", { ...gradeEvidence, binding: { ...binding, generation: 2 } });
    evidence.set("duplicate-id", { ...gradeEvidence, evidenceId: evidence.get("rubric-retired")!.evidenceId });
    evidence.set("conflicting-terminal", { ...evidence.get("rubric-retired")!, outcome: "never-dispatched" });
    evidence.set("different-evidence-id", { ...gradeEvidence, evidenceId: "other-evidence" });
    for (const proofs of [
      [], ["grade-retired"], ["grade-retired", "rubric-retired"], ["rubric-retired", "rubric-retired"],
      ["rubric-retired", "grade-receipt"], ["rubric-retired", "true"], ["rubric-retired", "wrong-attempt"],
      ["rubric-retired", "wrong-recovery-executor"], ["rubric-retired", "duplicate-id"],
      ["conflicting-terminal", "grade-retired"],
    ]) {
      expect(model.recover(state, recovery, binding, proofs)).toEqual({ state, status: "rejected" });
    }
    expect(hasAdmissionV2Fence(state)).toBe(true);
    const recovered = model.recover(state, recovery, binding, all);
    expect(recovered.status).toBe("applied");
    expect(hasAdmissionV2Fence(recovered.state)).toBe(false);
    expect(model.recover(recovered.state, recovery, binding, all)).toEqual({
      state: recovered.state, status: "replayed",
    });
    expect(model.recover(recovered.state, recovery, binding, ["rubric-retired", "different-evidence-id"])).toEqual({
      state: recovered.state, status: "rejected",
    });
    expect(model.close(recovered.state, "grade-receipt")).toEqual({ state: recovered.state, status: "rejected" });
    expect(model.install(recovered.state, "next", 21).status).toBe("applied");
  });

  it("keeps a legacy-unverified account fenced without v2 slot history", () => {
    const { model } = setup();
    const legacy = createAdmissionV2State(accountId, "legacy-unverified");
    expect(hasAdmissionV2Fence(legacy)).toBe(true);
    expect(model.install(legacy, "seal", 11)).toEqual({ state: legacy, status: "fenced" });
    expect(expireAdmissionV2Attempt(legacy, binding, 20)).toEqual({ state: legacy, status: "rejected" });
    expect(model.recover(legacy, recovery, binding, [])).toEqual({ state: legacy, status: "rejected" });
    const deleted = tombstoneAdmissionV2Scope(legacy, { accountId, courseId: null });
    expect(deleted.status).toBe("applied");
    expect(hasAdmissionV2Fence(deleted.state)).toBe(true);
  });
});
