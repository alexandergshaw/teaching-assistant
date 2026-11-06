import { describe, expect, it, vi } from "vitest";
import {
  createRepoFeedbackAuthority,
  planRepoFeedbackChange,
  readRepoFeedbackRows,
} from "./repoFeedbackIdb";
import type { PersistedRepoGradeCell } from "./repoGradesResultsStore";

const feedback = {
  score: "19.5",
  comment: "Detailed feedback",
  strengths: "Clear structure",
  improvements: "Consider edge cases",
  resubmitNotice: "",
};
const source = {
  ...feedback,
  generatedScore: "18",
  generatedComment: "Generated feedback",
  mergeStatus: "not-merged" as const,
  mergeFoundOnBranch: "feature",
  submissionTruncated: true,
  rubricAreas: [{ area: "Correctness", score: "10", comment: "Correct output" }],
};
const retained = {
  id: "local:1",
  source,
  draft: { ...feedback, score: "20", comment: "Edited retained feedback" },
};
const cell: PersistedRepoGradeCell = {
  ...source,
  at: "2026-11-05T12:00:00.000Z",
  draftRevision: 2,
  postStatus: "error",
  postMessage: "A reload interrupted this post.",
  retainedResults: [retained, { id: "legacy-conflict", source, draft: null }],
};
const current = [{ repo: "org/repo", folder: "", cell }];

describe("feedback storage authority contract", () => {
  const target = { kind: "current", course: "course" } as const;

  it("only accepts fresh proof for the pending app-start challenge", () => {
    type Verify = Parameters<typeof createRepoFeedbackAuthority>[0];
    const proofs = new Map<Parameters<Verify>[0], symbol>();
    const verify = vi.fn<Verify>((challenge, candidate) =>
      proofs.has(challenge) && proofs.get(challenge) === candidate
        ? { account: "account-a", session: "session-a" }
        : null,
    );
    const firstStart = createRepoFeedbackAuthority(verify);
    const nextStart = createRepoFeedbackAuthority(verify);
    const firstChallenge = firstStart.beginSignIn();
    const nextChallenge = nextStart.beginSignIn();
    const proof = Symbol();
    proofs.set(firstChallenge, proof);
    expect(firstChallenge.incarnation).not.toBe(nextChallenge.incarnation);
    expect(nextStart.admit(firstChallenge, proof)).toBeNull();
    expect(nextStart.admit({ ...nextChallenge }, proof)).toBeNull();
    expect(verify).not.toHaveBeenCalled();
    expect(nextStart.admit(nextChallenge, proof)).toBeNull();
    expect(nextStart.admit(nextChallenge, { account: "account-a", session: "session-a" })).toBeNull();
    const lease = firstStart.admit(firstChallenge, proof)!;
    expect(firstStart.resolve(lease, target)).toEqual(["account-a", "current", "course"]);
    expect(firstStart.admit(firstChallenge, proof)).toBeNull();
    expect(nextStart.resolve(lease, target)).toBeNull();
  });

  it("revokes outstanding leases and old sign-in attempts on a session transition", () => {
    const authority = createRepoFeedbackAuthority((_challenge, candidate) =>
      candidate === "fresh-a" ? { account: "account-a", session: "session-a" } :
        candidate === "fresh-b" ? { account: "account-b", session: "session-b" } : null,
    );
    const first = authority.beginSignIn();
    const firstLease = authority.admit(first, "fresh-a")!;
    const history = { kind: "history", course: "course:one", generation: 2, repo: "org/repo", folder: "" } as const;
    expect(authority.resolve(firstLease, history)).toEqual(["account-a", "history", "course:one", 2, "org/repo", ""]);
    expect(authority.resolve(firstLease, { ...history, generation: 0 })).toBeNull();
    const second = authority.beginSignIn();
    expect(second.incarnation).toBe(first.incarnation);
    expect(second.epoch).not.toBe(first.epoch);
    expect(firstLease.signal.aborted).toBe(true);
    expect(authority.resolve(firstLease, target)).toBeNull();
    expect(authority.admit(first, "fresh-a")).toBeNull();
    const secondLease = authority.admit(second, "fresh-b")!;
    expect(authority.resolve(secondLease, target)).toEqual(["account-b", "current", "course"]);
    authority.revoke();
    expect(secondLease.signal.aborted).toBe(true);
    expect(authority.resolve(secondLease, target)).toBeNull();
  });

  it("fails closed when verification fails or revokes the pending epoch", () => {
    const failed = createRepoFeedbackAuthority(() => { throw new Error("private verification details"); });
    expect(failed.admit(failed.beginSignIn(), {})).toBeNull();
    const revoked = createRepoFeedbackAuthority(() => {
      revoked.revoke();
      return { account: "account", session: "session" };
    });
    expect(revoked.admit(revoked.beginSignIn(), {})).toBeNull();
  });
});

describe("feedback storage codecs and CAS planning", () => {
  it.each([
    { kind: "current", value: current },
    { kind: "history", value: retained },
  ] as const)("preserves every supported field in a $kind draft", ({ kind, value }) => {
    const plan = planRepoFeedbackChange(kind, undefined, undefined, 0, { type: "save", value });
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(readRepoFeedbackRows(kind, plan.meta, plan.draft)).toEqual({ status: "saved", revision: 1, value });
  });

  it("serializes a detached projection of nested records and arrays", () => {
    const serialize = vi.fn(() => ({ credential: "private value" }));
    const proxiedResult = new Proxy(retained, {
      get(target, key, receiver) {
        return key === "toJSON" ? serialize : Reflect.get(target, key, receiver);
      },
    });
    const proxiedResults = new Proxy([proxiedResult], {
      get(target, key, receiver) {
        return key === "toJSON" ? serialize : Reflect.get(target, key, receiver);
      },
    });
    const value = [{ ...current[0], cell: { ...cell, retainedResults: proxiedResults } }];
    const plan = planRepoFeedbackChange("current", undefined, undefined, 0, { type: "save", value });
    expect(serialize).not.toHaveBeenCalled();
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.draft?.payload).not.toContain("private value");
    expect(readRepoFeedbackRows("current", plan.meta, plan.draft)).toEqual({
      status: "saved", revision: 1, value: [{ ...current[0], cell: { ...cell, retainedResults: [retained] } }],
    });
  });

  it("rejects forged changes without running accessors or returning exception details", () => {
    const get = vi.fn(() => current);
    const accessor = Object.defineProperty({ type: "save" as const }, "value", { get, enumerable: true });
    const forgedDiscard = { type: "discard" as const, value: current };
    const revoked = Proxy.revocable({ type: "save" as const, value: current }, {});
    revoked.revoke();
    for (const change of [accessor as { type: "save"; value: unknown }, forgedDiscard, revoked.proxy]) {
      expect(planRepoFeedbackChange("current", undefined, undefined, 0, change)).toEqual({ status: "invalid_payload" });
    }
    expect(get).not.toHaveBeenCalled();
  });

  it("requires the observed revision, including after a discard", () => {
    const change = { type: "save", value: current } as const;
    const first = planRepoFeedbackChange("current", undefined, undefined, 0, change);
    expect(first.status).toBe("ready");
    if (first.status !== "ready") return;
    expect(planRepoFeedbackChange("current", first.meta, first.draft, 0, change)).toEqual({ status: "conflict" });
    expect(planRepoFeedbackChange("current", first.meta, first.draft, 0, { type: "discard" })).toEqual({ status: "conflict" });
    const discarded = planRepoFeedbackChange("current", first.meta, first.draft, 1, { type: "discard" });
    expect(discarded).toEqual({ status: "ready", meta: { revision: 2, discarded: true }, draft: null });
    if (discarded.status !== "ready") return;
    expect(readRepoFeedbackRows("current", discarded.meta, undefined)).toEqual({ status: "discarded", revision: 2 });
    expect(planRepoFeedbackChange("current", discarded.meta, undefined, 0, change)).toEqual({ status: "conflict" });
    expect(planRepoFeedbackChange("current", discarded.meta, undefined, 1, change)).toEqual({ status: "conflict" });
    const recreated = planRepoFeedbackChange("current", discarded.meta, undefined, 2, change);
    expect(recreated).toMatchObject({ status: "ready", meta: { revision: 3, discarded: false } });
  });

  it("fails closed on a torn pair, corruption, and revision exhaustion", () => {
    const savedMeta = { revision: 1, discarded: false };
    const savedDraft = { revision: 1, payload: JSON.stringify(current) };
    const corruptRows = [
      [undefined, savedDraft],
      [savedMeta, undefined],
      [savedMeta, { ...savedDraft, revision: 2 }],
      [{ ...savedMeta, discarded: true }, savedDraft],
      [savedMeta, { ...savedDraft, payload: "unparsed private data" }],
      [savedMeta, { ...savedDraft, payload: JSON.stringify([{ ...current[0], credential: "private data" }]) }],
    ];
    for (const [meta, draft] of corruptRows) {
      expect(readRepoFeedbackRows("current", meta, draft)).toEqual({ status: "invalid_stored_data" });
      expect(planRepoFeedbackChange("current", meta, draft, 1, { type: "discard" })).toEqual({ status: "invalid_stored_data" });
    }
    const maximum = Number.MAX_SAFE_INTEGER;
    expect(planRepoFeedbackChange("history", { revision: maximum, discarded: true }, undefined, maximum, {
      type: "discard",
    })).toEqual({ status: "revision_exhausted" });
  });

  it("rejects extra fields, unsupported forms, duplicate addresses and IDs, and excess UTF-8 bytes", () => {
    const extraFeedback = { ...feedback, submittedFiles: ["private submission"] };
    const dangerous = Object.defineProperty({ ...cell }, "comment", {
      get() { throw new Error("private error"); },
    });
    const invalidCells = [
      { ...cell, codeExecution: {} },
      { ...cell, comment: 42 },
      { ...cell, postStatus: "posting" },
      { ...cell, retainedResults: [retained, retained] },
      { ...cell, retainedResults: [{ ...retained, draft: extraFeedback }] },
      { ...cell, rubricAreas: [{ ...source.rubricAreas[0], credential: "private value" }] },
      { ...cell, comment: "\u6f22".repeat(400_000) },
      dangerous,
    ];
    const invalidPayloads = [
      ...invalidCells.map((entry) => [{ ...current[0], cell: entry }]),
      { "org/repo": { "": cell } },
      [current[0], current[0]],
      new Array(1),
    ];
    for (const value of invalidPayloads) {
      expect(planRepoFeedbackChange("current", undefined, undefined, 0, { type: "save", value }))
        .toEqual({ status: "invalid_payload" });
    }
  });
});
