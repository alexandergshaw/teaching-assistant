import { beforeEach, describe, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => {
  const slots: { value: unknown }[] = []; let cursor = 0;
  return { reset() { slots.length = 0; cursor = 0; }, begin() { cursor = 0; },
    useRef(init: unknown) { const i = cursor++; return (slots[i] ??= { value: { current: init } }).value; },
    useEffect(effect: () => void, deps: unknown[]) { const i = cursor++, old = slots[i]?.value as unknown[] | undefined; if (!old || deps.some((dep, index) => dep !== old[index])) { slots[i] = { value: deps }; effect(); } },
    useState(init: unknown) { const i = cursor++, slot = slots[i] ??= { value: typeof init === "function" ? (init as () => unknown)() : init }; return [slot.value, (next: unknown) => { slot.value = typeof next === "function" ? (next as (old: unknown) => unknown)(slot.value) : next; }]; } };
});
vi.mock("react", () => ({ useRef: harness.useRef, useState: harness.useState, useEffect: harness.useEffect }));
vi.mock("@/app/actions/grading-chat-intake", () => ({ resolveChatRunHeaderAction: async () => ({ kind: "ok", effectiveRubric: "1. Correctness (10 points)", rubricFingerprint: "frozen-rubric", criteriaNames: ["Correctness"], rubricUsed: "provided" }), prepareChatSubmissionAction: vi.fn(), prepareCompositeSubmissionAction: vi.fn() }));
import { useContinuousGradingRun } from "./useContinuousGradingRun";
import { useChatRepositoryProposals } from "./useChatRepositoryProposals";
import { stageRepositoryBatch, emptyRepositoryEvidence } from "./chatRepositoryBatch";
import { studentKeyId } from "./chatRepositoryProposals";
import { repositoryEntryDigest } from "./chatRepositoryWorkflow";
import { repositoryEditSignature } from "../grading-results/repositoryProposalEdits";
import { assembleRepositoryEvidenceEntry } from "@/lib/grade/repository-evidence-entry";
import type { RowEdit } from "../grading-results/gradingResultsHelpers";
import type { GradeResult } from "@/lib/grade/types";
import type { GradeRunItemRequestBody } from "../grading/incrementalRunPlan";
import type { RepositoryCollectRequest, RepositoryCollectResponse, RepositoryProposeRequest, RepositoryReviewRequest, RepositoryProposeResponse, RepositoryReviewResponse } from "@/lib/grade/repository-evidence-types";
const sha = "a".repeat(40);
const row = (student: string): GradeResult => ({ student, totalScore: "6/10", strengths: "machine strength", improvements: "machine improvement", resubmitNotice: "", overallComment: "machine strength machine improvement", feedback: "original feedback", rubricAreas: [{ area: "Correctness", score: "6/10", comment: "original rationale" }], mergedFileCount: 1, submittedFiles: [] });
const manual = (): RowEdit => ({ total: "7/10", strengths: "manual strength", improvements: "manual improvement", resubmitNotice: "", overall: "manual strength manual improvement", areas: { Correctness: { score: "7/10" } } });
function collected(request: RepositoryCollectRequest): RepositoryCollectResponse {
  return { ...request, evidence: request.mappings.map((mapping) => ({ files: [{ id: "repo-main", path: "main.py", text: "NEW_REPOSITORY_SENTINEL", truncated: false }], manifest: { originalUrl: mapping.originalUrl, scope: mapping.scope, pin: "immutable", commitSha: sha, digest: "evidence-fixed", collectedAt: "2026-10-25T00:00:00Z", timing: { kind: "unknown", reason: "no-trusted-submission-time" }, files: [{ id: "repo-main", path: "main.py", bytes: 23, truncated: false }], coverage: { complete: true, treeTruncated: false, omitted: [], unenumerated: false } } })) };
}
let collection!: RepositoryCollectResponse;
async function respond(request: RepositoryProposeRequest | RepositoryReviewRequest): Promise<RepositoryProposeResponse | RepositoryReviewResponse> {
  if (request.operation === "review") return { operation: "review", attemptId: request.attemptId, revision: request.revision, candidateDigest: request.proposal.candidateDigest,
    review: { proposalId: request.proposal.proposalId, revision: request.revision, attemptId: request.attemptId, status: "completed", findings: [{ criterionId: "0:Correctness", category: "timing", evidenceFileIds: ["repo-main"], explanation: "Submission timing remains unknown." }] }, manifests: collection.evidence.map((item) => item.manifest) };
  return { operation: "propose", attemptId: request.attemptId, revision: request.revision, proposal: { proposalId: "proposal-fixed", candidateDigest: "candidate-fixed", snapshotDigest: "snapshot-fixed", revision: request.revision, prior: request.prior, current: request.current,
    proposed: { ...row(request.prior.student), totalScore: "9/10", strengths: "proposed strength", rubricAreas: [{ area: "Correctness", score: "9/10", comment: "New credit [evidence:repo-main]" }] }, criterionDeltas: [{ criterionId: "0:Correctness", area: "Correctness", prior: "6/10", current: "7/10", proposed: "9/10", rationale: "New credit [evidence:repo-main]", evidenceFileIds: ["repo-main"] }] },
    manifests: collection.evidence.map((item) => item.manifest), entryDigest: await repositoryEntryDigest(assembleRepositoryEvidenceEntry(request.base.entry, collection.evidence)) };
}
const dispatch = vi.fn(async (request: GradeRunItemRequestBody) => row(request.entry.student));
let model = vi.fn(respond);
let evidence = emptyRepositoryEvidence();
let collectFailure = false;
function useTestSession() {
  harness.begin();
  const driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch });
  const proposals = useChatRepositoryProposals({ sessionEpoch: driver.runKey, evidence, students: () => driver.repositoryStudents, driver: driver.repositoryAdapter,
    collect: async (request) => { if (collectFailure) throw new Error("collection unavailable"); collection = collected(request); return collection; }, modelTransport: model });
  return { driver, proposals };
}
const renderSession = useTestSession;
async function prepared() {
  let session = renderSession(); await session.driver.beginSession({ assignmentInstructions: "FROZEN_INSTRUCTIONS", rubric: "1. Correctness (10 points)" });
  await session.driver.submit({ kind: "text", label: "Sam", content: "ORIGINAL_SUBMISSION_SENTINEL" });
  await session.driver.submit({ kind: "text", label: "Sam", content: "UNAFFECTED_STUDENT_SENTINEL" });
  await new Promise((resolve) => setTimeout(resolve, 0)); session = renderSession();
  evidence = stageRepositoryBatch(`https://github.com/acme/work/commit/${sha}`, evidence); session = renderSession();
  session.proposals.confirm([{ id: evidence.lines[0].key!, studentId: studentKeyId(session.driver.repositoryStudents[0].key) }]);
  await session.proposals.collect(studentKeyId(session.driver.repositoryStudents[0].key)); return renderSession();
}
beforeEach(() => { harness.reset(); dispatch.mockClear(); model = vi.fn(respond); evidence = emptyRepositoryEvidence(); collectFailure = false; });
describe("actual continuous driver -> repository hook -> adoption callbacks", () => {
  it.each(["blank", "remap", "remove", "failed-refresh"].flatMap((change) => [false, true].map((reviewed) => ({ change, reviewed }))))("retains display evidence but denies workflow reuse after $change (reviewed=$reviewed)", async ({ change, reviewed }) => {
    let session = await prepared(); const edit = manual(), key = session.driver.repositoryStudents[0].key, id = studentKeyId(key), saved = session.proposals.collections.get(id)!.response;
    if (reviewed) { await session.proposals.workflow.propose("Sam", edit, false); session = renderSession(); await session.proposals.workflow.review("Sam", edit); session = renderSession(); }
    const before = JSON.stringify(session.driver.results), calls = model.mock.calls.length;
    if (change === "blank") session.proposals.confirm([{ id: evidence.lines[0].key!, studentId: "" }]);
    if (change === "remap") session.proposals.confirm([{ id: evidence.lines[0].key!, studentId: studentKeyId(session.driver.repositoryStudents[1].key) }]);
    if (change === "remove") evidence = emptyRepositoryEvidence();
    if (change === "failed-refresh") { collectFailure = true; await session.proposals.collect(id, true); }
    session = renderSession(); session = renderSession();
    expect(session.proposals.collections.get(id)?.response).toBe(saved);
    expect(session.proposals.workflow.sourceFor("Sam")).toBeUndefined();
    await session.proposals.workflow.propose("Sam", edit, false); await session.proposals.workflow.review("Sam", edit);
    expect(session.proposals.workflow.accept("Sam", edit, repositoryEditSignature(edit), { total: true }).ok).toBe(false);
    expect(model).toHaveBeenCalledTimes(calls); expect(JSON.stringify(session.driver.results)).toBe(before);
    if (change === "remap") {
      const other = session.driver.repositoryStudents[1]; expect(session.proposals.workflow.sourceFor(other.label)).toBeUndefined();
      await session.proposals.workflow.propose(other.label, edit, false); expect(model).toHaveBeenCalledTimes(calls);
      await session.proposals.collect(studentKeyId(other.key)); session = renderSession();
      expect(session.proposals.workflow.sourceFor(other.label)).toBeDefined();
    }
  });
  it.each(["sessionEpoch", "sourceIndex", "mappingRevision", "evidenceRevision", "rubricFingerprint", "baseGradeRevision", "baseEditRevision", "attemptId"])("refuses a proposal completion with the wrong %s", async (coordinate) => {
    let session = await prepared();
    model.mockImplementationOnce(async (request) => {
      const response = structuredClone(await respond(request)) as RepositoryProposeResponse;
      if (coordinate === "attemptId") response.attemptId = "wrong-attempt";
      else (response.revision as unknown as Record<string, unknown>)[coordinate] = typeof (response.revision as unknown as Record<string, unknown>)[coordinate] === "number" ? 999 : "wrong-revision";
      return response;
    });
    await session.proposals.workflow.propose("Sam", manual(), false); session = renderSession();
    expect(session.proposals.workflow.stateFor("Sam")?.proposal).toBeUndefined(); expect(session.driver.results[0].totalScore).toBe("6/10");
  });
  it.each(["sessionEpoch", "sourceIndex", "mappingRevision", "evidenceRevision", "rubricFingerprint", "baseGradeRevision", "baseEditRevision", "attemptId", "candidateDigest", "proposalId", "reviewAttemptId"])("refuses a review completion with the wrong %s", async (coordinate) => {
    let session = await prepared(); await session.proposals.workflow.propose("Sam", manual(), false); session = renderSession();
    model.mockImplementationOnce(async (request) => {
      const response = structuredClone(await respond(request)) as RepositoryReviewResponse;
      if (coordinate === "attemptId") response.attemptId = "wrong-attempt";
      else if (coordinate === "candidateDigest") response.candidateDigest = "wrong-candidate";
      else if (coordinate === "proposalId") response.review.proposalId = "wrong-proposal";
      else if (coordinate === "reviewAttemptId") response.review.attemptId = "wrong-review-attempt";
      else (response.revision as unknown as Record<string, unknown>)[coordinate] = typeof (response.revision as unknown as Record<string, unknown>)[coordinate] === "number" ? 999 : "wrong-revision";
      return response;
    });
    await session.proposals.workflow.review("Sam", manual()); session = renderSession();
    expect(session.proposals.workflow.stateFor("Sam")?.review).toBeUndefined(); expect(session.driver.results[0].totalScore).toBe("6/10");
  });
  it("refuses old edit-signature acceptance after a completed review without touching the body or accepted row", async () => {
    let session = await prepared(), edit = manual(); await session.proposals.workflow.propose("Sam", edit, false); session = renderSession();
    await session.proposals.workflow.review("Sam", edit); session = renderSession();
    const before = JSON.stringify(session.driver.repositoryAdapter.capture(session.driver.repositoryStudents[0].key));
    const displayed = repositoryEditSignature(edit); edit = { ...edit, total: "8/10", improvements: "NEW_MANUAL_SENTINEL" };
    expect(session.proposals.workflow.accept("Sam", edit, displayed, { total: true }).ok).toBe(false);
    expect(JSON.stringify(session.driver.repositoryAdapter.capture(session.driver.repositoryStudents[0].key))).toBe(before);
  });
  it("counts retained proposal state when admitting a later student's collection", async () => {
    let lastLarge!: RepositoryCollectResponse;
    function useBudgetSession() {
      harness.begin(); const driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch });
      const proposals = useChatRepositoryProposals({ sessionEpoch: driver.runKey, evidence, students: () => driver.repositoryStudents, driver: driver.repositoryAdapter, modelTransport: model,
        collect: async (request) => {
          const response = collected(request), large = request.studentKey.sourceIndex === 2;
          response.evidence[0].files = Array.from({ length: large ? 8 : 1 }, (_, index) => ({ id: index === 0 ? "repo-main" : `repo-${index}`, path: `file${index}.py`, text: "R".repeat(large ? 250_000 : 300_000), truncated: false }));
          response.evidence[0].manifest.files = response.evidence[0].files.map((file) => ({ id: file.id, path: file.path, bytes: file.text.length, truncated: false }));
          collection = response; if (large) lastLarge = response; return response;
        } }); return { driver, proposals };
    }
    const renderBudgetSession = useBudgetSession;
    let session = renderBudgetSession(); await session.driver.beginSession({ assignmentInstructions: "FROZEN_INSTRUCTIONS", rubric: "1. Correctness (10 points)" });
    for (const label of ["A", "B", "C"]) await session.driver.submit({ kind: "text", label, content: "O".repeat(900_000) });
    await new Promise((resolve) => setTimeout(resolve, 0)); session = renderBudgetSession();
    evidence = stageRepositoryBatch(["one", "two", "three"].map((repo) => `https://github.com/acme/${repo}/commit/${sha}`).join("\n"), evidence); session = renderBudgetSession();
    session.proposals.confirm(evidence.lines.map((line, index) => ({ id: line.key!, studentId: studentKeyId(session.driver.repositoryStudents[index].key) })));
    for (const index of [0, 1]) { await session.proposals.collect(studentKeyId(session.driver.repositoryStudents[index].key)); session = renderBudgetSession(); await session.proposals.workflow.propose(["A", "B"][index], manual(), false); session = renderBudgetSession(); }
    const a = session.proposals.workflow.stateFor("A")!, b = session.proposals.workflow.stateFor("B")!;
    expect(session.proposals.workflow.sourceFor("B")?.error).toBeUndefined();
    expect(a.status).toBe("proposed"); expect(b.status).toBe("proposed");
    const before = JSON.stringify(session.driver.results), target = studentKeyId(session.driver.repositoryStudents[2].key);
    await session.proposals.collect(target); session = renderBudgetSession();
    const independentCount = new TextEncoder().encode(JSON.stringify(lastLarge)).byteLength + new TextEncoder().encode(JSON.stringify([["A", a], ["B", b]])).byteLength +
      session.driver.repositoryStudents.reduce((sum, student) => sum + student.retainedBytes, 0) + 600_000;
    expect(independentCount).toBeGreaterThan(12_000_000); expect(session.proposals.collections.get(target)?.status).toBe("failed");
    expect(session.proposals.workflow.stateFor("A")?.proposal).toBe(a.proposal); expect(session.proposals.workflow.stateFor("B")?.proposal).toBe(b.proposal); expect(JSON.stringify(session.driver.results)).toBe(before);
  });
  it("reserves before awaiting, caps failed proposal attempts and dismissal cannot reset the quota", async () => {
    let session = await prepared(); let reject!: (error: Error) => void;
    model.mockImplementation(() => new Promise((_, rejectPromise) => { reject = rejectPromise; }));
    const one = session.proposals.workflow.propose("Sam", manual(), false), two = session.proposals.workflow.propose("Sam", manual(), false);
    expect(model).toHaveBeenCalledTimes(1); reject(new Error("private provider failure")); await Promise.all([one, two]); session = renderSession();
    model.mockRejectedValue(new Error("private provider failure")); await session.proposals.workflow.propose("Sam", manual(), false); session = renderSession();
    session.proposals.workflow.dismiss("Sam"); await session.proposals.workflow.propose("Sam", manual(), false); expect(model).toHaveBeenCalledTimes(2);
    expect(session.driver.results[0].totalScore).toBe("6/10"); expect(JSON.stringify(session.proposals.workflow.stateFor("Sam"))).not.toContain("private provider failure");
  });
  it("refuses a review from another candidate without changing accepted grades or the valid proposal", async () => {
    let session = await prepared(); await session.proposals.workflow.propose("Sam", manual(), false); session = renderSession();
    const proposal = session.proposals.workflow.stateFor("Sam")!.proposal;
    model.mockImplementationOnce(async (request) => ({ ...await respond(request), candidateDigest: "wrong-candidate" } as RepositoryReviewResponse));
    await session.proposals.workflow.review("Sam", manual()); session = renderSession();
    expect(session.proposals.workflow.stateFor("Sam")?.status).toBe("failed"); expect(session.proposals.workflow.stateFor("Sam")?.proposal).toBe(proposal);
    expect(session.proposals.workflow.accept("Sam", manual(), repositoryEditSignature(manual()), { total: true }).ok).toBe(false); expect(session.driver.results[0].totalScore).toBe("6/10");
  });
  it("proposes exactly one target, independently reviews and atomically accepts selected fields while retry keeps original plus new evidence", async () => {
    let session = await prepared(); const unaffected = session.driver.results[1], edit = manual(), originalEdit = structuredClone(edit);
    await session.proposals.workflow.propose("Sam", edit, false); session = renderSession();
    expect(model).toHaveBeenCalledTimes(1); expect(dispatch).toHaveBeenCalledTimes(2); expect(edit).toEqual(originalEdit);
    const request = model.mock.calls[0][0]; expect(request.operation).toBe("propose"); expect(request.base.entry.content).toBe("ORIGINAL_SUBMISSION_SENTINEL"); expect(request.base.assignmentInstructions).toBe("FROZEN_INSTRUCTIONS"); expect(request.current.totalScore).toBe("7/10"); expect(request).not.toHaveProperty("userId");
    await session.proposals.workflow.review("Sam", edit); session = renderSession();
    expect(model.mock.calls.map(([body]) => body.operation)).toEqual(["propose", "review"]);
    const accepted = session.proposals.workflow.accept("Sam", edit, repositoryEditSignature(edit), { criteria: ["Correctness"], feedback: ["strengths"] });
    expect(accepted.ok).toBe(true); if (!accepted.ok) throw new Error("acceptance failed");
    expect(accepted.edit.total).toBe("7/10"); expect(accepted.edit.improvements).toBe("manual improvement"); expect(accepted.edit.strengths).toBe("proposed strength");
    session = renderSession(); expect(session.driver.results[1]).toBe(unaffected);
    expect(session.driver.results[0].rubricAreas).toEqual([{ area: "Correctness", score: "9/10", comment: "New credit [evidence:repo-main]" }]);
    const snapshot = session.driver.repositoryAdapter.capture(session.driver.repositoryStudents[0].key)!;
    expect(snapshot.body.entry.content).toContain("ORIGINAL_SUBMISSION_SENTINEL"); expect(snapshot.body.entry.content).toContain("NEW_REPOSITORY_SENTINEL"); expect(snapshot.originalBody.entry.content).toBe("ORIGINAL_SUBMISSION_SENTINEL");
    session.driver.regrade("Sam"); expect(dispatch.mock.calls[2][0].entry.content).toContain("NEW_REPOSITORY_SENTINEL");
  });
  it("manual edits during proposal remain intact and stale comparison refuses acceptance until explicitly refreshed", async () => {
    let session = await prepared(), finish!: (response: RepositoryProposeResponse | RepositoryReviewResponse) => void;
    model.mockImplementationOnce((request) => new Promise((resolve) => { finish = resolve; void request; }));
    const edit = manual(), pending = session.proposals.workflow.propose("Sam", edit, false);
    const updated = { ...edit, total: "8/10", improvements: "instructor changed during request", overall: "manual strength instructor changed during request" };
    const request = model.mock.calls[0][0]; finish(await respond(request)); await pending; session = renderSession();
    const denied = session.proposals.workflow.accept("Sam", updated, repositoryEditSignature(edit), { total: true }); expect(denied.ok).toBe(false);
    expect(session.driver.results[0].totalScore).toBe("6/10"); expect(updated.total).toBe("8/10");
    session.proposals.workflow.compare("Sam", updated); session = renderSession();
    expect(session.proposals.workflow.stateFor("Sam")?.stale).toBe(true);
    await session.proposals.workflow.propose("Sam", updated, false); session = renderSession();
    await session.proposals.workflow.review("Sam", updated); session = renderSession();
    expect(model.mock.calls[2][0].current.improvements).toBe("instructor changed during request");
    const accepted = session.proposals.workflow.accept("Sam", updated, repositoryEditSignature(updated), { feedback: ["strengths"] });
    expect(accepted.ok).toBe(true); if (accepted.ok) { expect(accepted.edit.total).toBe("8/10"); expect(accepted.edit.improvements).toBe("instructor changed during request"); expect(accepted.scoreChanged).toBe(false); }
  });
  it.each(["reset", "remap", "ordinary regrade"])("discards a late proposal after %s", async (mode) => {
    let session = await prepared(), finish!: (response: RepositoryProposeResponse | RepositoryReviewResponse) => void;
    model.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = session.proposals.workflow.propose("Sam", manual(), false); const request = model.mock.calls[0][0];
    if (mode === "reset") { session.driver.reset(); session.proposals.reset(); }
    if (mode === "remap") session.proposals.confirm([{ id: evidence.lines[0].key!, studentId: studentKeyId(session.driver.repositoryStudents[1].key) }]);
    if (mode === "ordinary regrade") session.driver.regrade("Sam");
    session = renderSession(); finish(await respond(request)); await pending; session = renderSession();
    expect(session.proposals.workflow.stateFor("Sam")?.status).not.toBe("proposed");
    expect(session.driver.results[0]?.totalScore ?? "6/10").toBe("6/10");
  });
});
