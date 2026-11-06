import { describe, expect, it } from "vitest";
import {
  claimRepoGradeBatchV2Target,
  createRepoGradeBatchV2State,
  describeRepoGradeBatchV2,
  expireRepoGradeBatchV2,
  installRepoGradeBatchV2,
  resumeRepoGradeBatchV2,
  retryRepoGradeBatchV2,
  settleRepoGradeBatchV2Target,
  type RepoGradeBatchBinding,
  type RepoGradeBatchV2State,
} from "./batch-v2-state";

const scope = { accountId: "account", courseId: "course" };
const binding: RepoGradeBatchBinding = { ...scope, attemptId: "batch", generation: 1 };
const next: RepoGradeBatchBinding = { ...scope, attemptId: "retry", generation: 2 };
const sha = "AB".repeat(20);
const source = { status: "ready", repo: "Org/Repo", sourceRef: "Assignment/Main", sourceCommit: sha, folders: ["A", "B", "C", "D"] };
const initial = createRepoGradeBatchV2State(scope);

function inventory(repos: unknown[] = [source], enumerationComplete = true) {
  return { ...scope, discovery: { status: "scanned", enumerationComplete, repos } };
}

function install() {
  const transition = installRepoGradeBatchV2(initial, binding, inventory(), 20, 10);
  expect(transition.status).toBe("applied");
  const batch = resumeRepoGradeBatchV2(transition.state, binding)!;
  return { state: transition.state, targets: batch.targets.map(({ target }) => target) };
}

function claim(state: RepoGradeBatchV2State, targetId: string, claimBinding = binding) {
  const transition = claimRepoGradeBatchV2Target(state, claimBinding, targetId, 12);
  if (transition.status !== "claimed") throw new Error(`Expected a claim, got ${transition.status}`);
  return transition;
}

describe("repo grade batch v2 reference model", () => {
  it.each([
    ["missing capture", null],
    ["wrong course capture", { ...inventory(), courseId: "other" }],
    ["wrong account capture", { ...inventory(), accountId: "other" }],
    ["incomplete enumeration", inventory([source], false)],
    ["partial source beside ready source", inventory([source, { ...source, status: "partial", repo: "org/truncated" }])],
    ["blocked source beside ready source", inventory([source, { ...source, status: "blocked", repo: "org/blocked" }])],
    ["malformed source", inventory([source, null])],
    ["invalid unused source", inventory([source, { ...source, sourceCommit: "main", folders: [] }])],
    ["invalid full repository name", inventory([{ ...source, repo: "https://github.com/Org/Repo" }])],
    ["noncanonical ref", inventory([{ ...source, sourceRef: " main " }])],
    ["unresolved ref", inventory([{ ...source, sourceRef: "" }])],
    ["ref traversal", inventory([{ ...source, sourceRef: "../main" }])],
    ["folder traversal", inventory([{ ...source, folders: ["A", "B/../C"] }])],
    ["noncanonical folder", inventory([{ ...source, folders: ["A//B"] }])],
    ["empty folder", inventory([{ ...source, folders: [""] }])],
    ["missing folder", inventory([{ ...source, folders: Array(1) }])],
    ["duplicate target", inventory([{ ...source, folders: ["A", "A"] }])],
    ["duplicate source", inventory([source, { ...source, repo: "org/repo", folders: [] }])],
    ["same commit and folder under a ref alias", inventory([source, { ...source, sourceRef: "main", sourceCommit: sha.toLowerCase(), folders: ["A"] }])],
    ["empty selection", inventory([])],
  ])("rejects the whole manifest for %s", (_case, malformed) => {
    expect(installRepoGradeBatchV2(initial, binding, malformed, 20, 10)).toEqual({ state: initial, status: "invalid-manifest" });
    expect(resumeRepoGradeBatchV2(initial, binding)).toBeUndefined();
  });

  it("captures and copies exact pinned provenance before the first claim", () => {
    const mutable = { ...source, folders: ["nested/Lab", "nested/lab"] };
    const mutableBinding = { ...binding };
    const { state, status } = installRepoGradeBatchV2(initial, mutableBinding, inventory([mutable]), 20, 10);
    expect(status).toBe("applied");
    mutable.repo = "other/repo";
    mutable.sourceRef = "other";
    mutable.sourceCommit = "c".repeat(40);
    mutable.folders.reverse();
    mutable.folders.push("extra");
    mutableBinding.attemptId = "mutated";

    const manifest = resumeRepoGradeBatchV2(state, binding)!;
    const [first, second] = manifest.targets;
    expect(manifest.targets).toHaveLength(2);
    expect(first).toEqual({ status: "queued", target: {
      id: JSON.stringify([scope.accountId, scope.courseId, "org/repo", source.sourceRef, sha.toLowerCase(), "nested/Lab"]),
      repo: "org/repo", sourceRef: source.sourceRef, sha: sha.toLowerCase(), folder: "nested/Lab",
    } });
    expect(second.target.folder).toBe("nested/lab");
    expect(Object.isFrozen(manifest.targets)).toBe(true);
    expect(Object.isFrozen(first.target)).toBe(true);
    expect(claim(state, first.target.id).claim.target).toBe(first.target);
    expect(installRepoGradeBatchV2(state, binding, inventory([{
      ...source, repo: "org/repo", sourceCommit: sha.toLowerCase(), folders: ["nested/lab", "nested/Lab"],
    }]), 20, 11)).toEqual({ state, status: "replayed" });
    expect(installRepoGradeBatchV2(state, binding, inventory(), 20, 11)).toEqual({ state, status: "rejected" });
    expect(installRepoGradeBatchV2(state, next, inventory(), 30, 11)).toEqual({ state, status: "busy" });
  });

  it("returns no claim after a lost claim response, even after snapshot reload", () => {
    const { state, targets } = install();
    const { state: committed } = claim(state, targets[0].id);
    const reloaded: RepoGradeBatchV2State = JSON.parse(JSON.stringify(committed));
    expect(resumeRepoGradeBatchV2(reloaded, binding)?.targets[0].status).toBe("claimed");
    expect(claimRepoGradeBatchV2Target(reloaded, binding, targets[0].id, 13)).toEqual({ state: reloaded, status: "replayed" });
    expect(reloaded).toEqual(committed);
  });

  it("keeps prior outcomes and distinguishes queued from claimed on lease expiry", () => {
    const { state, targets } = install();
    const success = claim(state, targets[0].id);
    const settled = settleRepoGradeBatchV2Target(success.state, success.claim, "succeeded", 14);
    const absent = claim(settled.state, targets[1].id);
    const noSubmission = settleRepoGradeBatchV2Target(absent.state, absent.claim, "no-submission", 15);
    const consumed = claim(noSubmission.state, targets[2].id);

    const reloaded: RepoGradeBatchV2State = JSON.parse(JSON.stringify(consumed.state));
    expect(resumeRepoGradeBatchV2(reloaded, binding)?.targets.map(({ status }) => status))
      .toEqual(["succeeded", "no-submission", "claimed", "queued"]);
    expect(expireRepoGradeBatchV2(reloaded, binding, 19)).toEqual({ state: reloaded, status: "rejected" });

    const expired = expireRepoGradeBatchV2(reloaded, binding, 20);
    expect(expired.status).toBe("applied");
    expect(resumeRepoGradeBatchV2(expired.state, binding)?.targets).toEqual([
      { target: targets[0], status: "succeeded" },
      { target: targets[1], status: "no-submission" },
      { target: targets[2], status: "unknown" },
      { target: targets[3], status: "not-started", reason: "interrupted" },
    ]);
    expect(expireRepoGradeBatchV2(expired.state, binding, 21)).toEqual({ state: expired.state, status: "replayed" });
    expect(claimRepoGradeBatchV2Target(reloaded, binding, targets[3].id, 20)).toEqual({ state: expired.state, status: "expired" });
    expect(settleRepoGradeBatchV2Target(reloaded, consumed.claim, "succeeded", 20)).toEqual({ state: expired.state, status: "expired" });
    expect(settleRepoGradeBatchV2Target(expired.state, consumed.claim, "failed", 21)).toEqual({ state: expired.state, status: "expired" });
    expect(settleRepoGradeBatchV2Target(expired.state, success.claim, "succeeded", 21)).toEqual({ state: expired.state, status: "replayed" });
    expect(describeRepoGradeBatchV2(expired.state, binding)).toEqual({
      total: 4, counts: { queued: 0, claimed: 0, succeeded: 1, "no-submission": 1, failed: 0, unknown: 1, "not-started": 1 },
    });
  });

  it("records failed and transport-unknown outcomes once and accepts only a separate explicit retry", () => {
    const { state, targets } = install();
    const first = claim(state, targets[0].id);
    const failed = settleRepoGradeBatchV2Target(first.state, first.claim, "failed", 13);
    expect(failed.status).toBe("applied");
    expect(settleRepoGradeBatchV2Target(failed.state, first.claim, "failed", 13)).toEqual({ state: failed.state, status: "replayed" });
    expect(settleRepoGradeBatchV2Target(failed.state, first.claim, "succeeded", 13)).toEqual({ state: failed.state, status: "rejected" });
    const second = claim(failed.state, targets[1].id);
    const lost = settleRepoGradeBatchV2Target(second.state, second.claim, "unknown", 14);
    expect(lost.status).toBe("applied");
    expect(settleRepoGradeBatchV2Target(lost.state, second.claim, "failed", 15)).toEqual({ state: lost.state, status: "rejected" });
    expect(claimRepoGradeBatchV2Target(lost.state, binding, targets[1].id, 15)).toEqual({ state: lost.state, status: "replayed" });
    expect(retryRepoGradeBatchV2(lost.state, next, binding, [targets[0].id], 40, 15)).toEqual({ state: lost.state, status: "rejected" });

    const { state: closed } = expireRepoGradeBatchV2(lost.state, binding, 20);
    const alias = inventory([{ ...source, repo: "ORG/REPO", sourceRef: "alias", sourceCommit: sha.toLowerCase() }]);
    expect(installRepoGradeBatchV2(closed, next, alias, 40, 21)).toEqual({ state: closed, status: "no-work" });
    expect(retryRepoGradeBatchV2(closed, next, binding, [targets[0].id, targets[0].id], 40, 21))
      .toEqual({ state: closed, status: "invalid-manifest" });
    expect(retryRepoGradeBatchV2(closed, next, binding, [targets[0].id, "missing"], 40, 21))
      .toEqual({ state: closed, status: "invalid-manifest" });
    const selected = [targets[3].id, targets[1].id, targets[0].id];
    const retry = retryRepoGradeBatchV2(closed, next, binding, selected, 40, 21);
    expect(retry.status).toBe("applied");
    expect(resumeRepoGradeBatchV2(retry.state, binding)).toBe(resumeRepoGradeBatchV2(closed, binding));
    expect(resumeRepoGradeBatchV2(retry.state, next)).toMatchObject({ retryOf: binding.attemptId, targets: [
      { status: "queued", target: targets[0] }, { status: "queued", target: targets[1] }, { status: "queued", target: targets[3] },
    ] });
    expect(retryRepoGradeBatchV2(retry.state, next, binding, selected, 40, 22)).toEqual({ state: retry.state, status: "replayed" });
    const retryClaim = claimRepoGradeBatchV2Target(retry.state, next, targets[0].id, 22);
    expect(retryClaim.status).toBe("claimed");
    expect(settleRepoGradeBatchV2Target(retryClaim.state, first.claim, "succeeded", 23))
      .toEqual({ state: retryClaim.state, status: "expired" });
    expect(resumeRepoGradeBatchV2(retryClaim.state, next)?.targets[0].status).toBe("claimed");
    const { state: closedRetry } = expireRepoGradeBatchV2(retryClaim.state, next, 40);
    expect(retryRepoGradeBatchV2(closedRetry, { ...next, attemptId: "another", generation: 3 }, binding, selected, 60, 41))
      .toEqual({ state: closedRetry, status: "already-captured" });
  });

  it("captures mixed inventories while queuing only newly pinned identities", () => {
    const { state, targets } = install();
    const first = claim(state, targets[0].id);
    const success = settleRepoGradeBatchV2Target(first.state, first.claim, "succeeded", 13);
    const second = claim(success.state, targets[1].id);
    const failed = settleRepoGradeBatchV2Target(second.state, second.claim, "failed", 14);
    const third = claim(failed.state, targets[2].id);
    const { state: closed } = expireRepoGradeBatchV2(third.state, binding, 20);

    const alias = { ...source, repo: "ORG/REPO", sourceRef: "Alias", folders: ["A", "B", "C"] };
    const changed = { ...source, sourceCommit: "c".repeat(40), folders: ["D"] };
    const added = { ...source, repo: "Org/New", folders: ["A"] };
    expect(installRepoGradeBatchV2(closed, next, inventory([alias, changed], false), 40, 21))
      .toEqual({ state: closed, status: "invalid-manifest" });
    expect(installRepoGradeBatchV2(closed, next, inventory([alias, { ...changed, status: "partial" }]), 40, 21))
      .toEqual({ state: closed, status: "invalid-manifest" });

    const mixed = installRepoGradeBatchV2(closed, next, inventory([alias, changed, added]), 40, 21);
    expect(mixed.status).toBe("applied");
    expect(resumeRepoGradeBatchV2(mixed.state, binding)).toBe(resumeRepoGradeBatchV2(closed, binding));
    const manifest = resumeRepoGradeBatchV2(mixed.state, next)!;
    expect(manifest.targets).toHaveLength(5);
    const skipped = manifest.targets.filter(({ status }) => status === "not-started");
    expect(skipped).toMatchObject(["succeeded", "failed", "unknown"].map((status, index) => ({
      target: { repo: "org/repo", sourceRef: "Alias", sha: sha.toLowerCase(), folder: targets[index].folder },
      status: "not-started", reason: "already-captured",
      previous: { binding, targetId: targets[index].id, status },
    })));
    for (const row of skipped) {
      expect(row.target.id).not.toBe(targets.find((target) => target.folder === row.target.folder)?.id);
      expect(claimRepoGradeBatchV2Target(mixed.state, next, row.target.id, 22))
        .toEqual({ state: mixed.state, status: "replayed" });
    }
    const queued = manifest.targets.filter(({ status }) => status === "queued");
    expect(queued).toMatchObject([
      { target: { repo: "org/new", sha: sha.toLowerCase() } },
      { target: { repo: "org/repo", sourceRef: source.sourceRef, sha: changed.sourceCommit, folder: "D" } },
    ]);
    expect(claimRepoGradeBatchV2Target(mixed.state, next, queued[1].target.id, 22).status).toBe("claimed");
    expect(installRepoGradeBatchV2(mixed.state, next, inventory([changed, added, alias]), 40, 22))
      .toEqual({ state: mixed.state, status: "replayed" });

    const { state: closedMixed } = expireRepoGradeBatchV2(mixed.state, next, 40);
    expect(resumeRepoGradeBatchV2(closedMixed, next)?.targets.filter((row) => skipped.some((prior) => prior === row)))
      .toEqual(skipped);
    const subsequent = { ...next, attemptId: "subsequent", generation: 3 };
    expect(installRepoGradeBatchV2(closedMixed, subsequent, inventory([alias]), 60, 41))
      .toEqual({ state: closedMixed, status: "no-work" });
    expect(retryRepoGradeBatchV2(closedMixed, subsequent, next, [skipped[1].target.id], 60, 41))
      .toEqual({ state: closedMixed, status: "invalid-manifest" });
    expect(retryRepoGradeBatchV2(closedMixed, subsequent, binding, [targets[1].id], 60, 41).status).toBe("applied");
  });

  it("requires exact account, course, attempt, generation and target for mutations and reads", () => {
    const { state, targets } = install();
    const first = claim(state, targets[0].id);
    for (const foreign of [
      { ...binding, accountId: "other" }, { ...binding, courseId: "other" },
      { ...binding, attemptId: "other" }, { ...binding, generation: 2 },
    ]) {
      expect(resumeRepoGradeBatchV2(first.state, foreign)).toBeUndefined();
      expect(describeRepoGradeBatchV2(first.state, foreign)).toBeUndefined();
      expect(claimRepoGradeBatchV2Target(first.state, foreign, targets[1].id, 13)).toEqual({ state: first.state, status: "rejected" });
      expect(settleRepoGradeBatchV2Target(first.state, { ...first.claim, binding: foreign }, "succeeded", 13))
        .toEqual({ state: first.state, status: "rejected" });
      expect(expireRepoGradeBatchV2(first.state, foreign, 20)).toEqual({ state: first.state, status: "rejected" });
    }
    for (const target of [targets[1], { ...targets[0], sourceRef: "different" }, { ...targets[0], id: "forged" }]) {
      expect(settleRepoGradeBatchV2Target(first.state, { ...first.claim, target }, "succeeded", 13))
        .toEqual({ state: first.state, status: "rejected" });
    }
  });
});
