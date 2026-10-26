import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRepositoryWorkflow, repositoryEntryDigest } from "./chatRepositoryWorkflow";
import { createContinuousRepositoryAdapter } from "./continuousRepositoryAdapter";
import { assembleRepositoryEvidenceEntry } from "@/lib/grade/repository-evidence-entry";
import { recordRepositoryWorkflow } from "./chatRepositoryDiagnostic";
import { buildSessionDiagnosticLog, formatSessionDiagnosticLogCsv, formatSessionDiagnosticLogJson, readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";
import type { GradeRunItemRequestBody } from "../grading/incrementalRunPlan";
import type { RepositoryCollectResponse, RepositoryProposeRequest, RepositoryProposeResponse, RepositoryReviewRequest, RepositoryReviewResponse } from "@/lib/grade/repository-evidence-types";
import type { GradeResult } from "@/lib/grade/types";

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const key = { sessionEpoch: "budget-session", sourceIndex: 0 }, id = JSON.stringify(["budget-session", 0]), sha = "a".repeat(40);
const grade: GradeResult = { student: "private-student", totalScore: "6/10", strengths: "old strength", improvements: "old advice", resubmitNotice: "", overallComment: "old strength old advice", feedback: "old", rubricAreas: [{ area: "Correctness", score: "6/10", comment: "prior rationale" }], mergedFileCount: 0, submittedFiles: [] };
const edit = { total: "7/10", strengths: "manual", improvements: "advice", resubmitNotice: "", overall: "manual advice", areas: { Correctness: { score: "7/10" } } };
const body: GradeRunItemRequestBody = { sourceIndex: 0, provider: "gemini", assignmentInstructions: "Evaluate", rubric: "Correctness (10 pts): behavior", pointsPossible: 10, applyLengthDeduction: true, lengthDeductionThresholdWords: 25, entry: { student: "private-student", content: "private-original", submittedFiles: [], mergedFileCount: 0 } };
const scope = { owner: "acme", repo: "work", kind: "commit" as const, requestedRef: sha, requestedPath: null };
const collection: RepositoryCollectResponse = { operation: "collect", attemptId: "collect-one", studentKey: key, mappings: [{ stagedItemId: "source-one", studentKey: key, scope, mappingRevision: 1, basis: "instructor-confirmed", originalUrl: `https://github.com/acme/work/commit/${sha}` }], evidence: [{ files: [{ id: "repo-main", path: "private.py", text: "private-source", truncated: false }], manifest: { scope, originalUrl: `https://github.com/acme/work/commit/${sha}`, commitSha: sha, pin: "immutable", digest: "fixed", collectedAt: "2026-10-25T00:00:00Z", timing: { kind: "unknown", reason: "no-trusted-submission-time" }, files: [{ id: "repo-main", path: "private.py", bytes: 14, truncated: false }], coverage: { complete: true, treeTruncated: false, omitted: [], unenumerated: false } } }] };
function reviewResponse(request: RepositoryReviewRequest): RepositoryReviewResponse {
  return { operation: "review", revision: request.revision, attemptId: request.attemptId, candidateDigest: request.proposal.candidateDigest, manifests: collection.evidence.map((item) => item.manifest),
    review: { proposalId: request.proposal.proposalId, revision: request.revision, attemptId: request.attemptId, status: "completed", findings: [{ criterionId: "0:Correctness", category: "coverage", evidenceFileIds: ["repo-main"], explanation: "Review verified this source while timing remains unknown." }] } };
}
async function setup() {
  let retainedBytes = 0, busy = false;
  const driver = createContinuousRepositoryAdapter({ epoch: () => key.sessionEpoch, bodies: new Map([[0, body]]), arrived: [{ sourceIndex: 0, result: grade }], revisions: new Map([[0, 1]]), originals: new Map(), pending: new Set(), rubricFingerprint: "rubric", publish() {} });
  const transport = vi.fn(async (request: RepositoryProposeRequest | RepositoryReviewRequest): Promise<RepositoryProposeResponse | RepositoryReviewResponse> => {
    if (request.operation === "review") return reviewResponse(request);
    return { operation: "propose", attemptId: request.attemptId, revision: request.revision, manifests: collection.evidence.map((item) => item.manifest), entryDigest: await repositoryEntryDigest(assembleRepositoryEvidenceEntry(request.base.entry, collection.evidence)),
      proposal: { proposalId: "proposal-one", revision: request.revision, snapshotDigest: "snapshot-one", candidateDigest: "candidate-one", prior: request.prior, current: request.current, proposed: { ...grade, totalScore: "9/10", rubricAreas: [{ area: "Correctness", score: "9/10", comment: "Credit [evidence:repo-main]" }] }, criterionDeltas: [] } };
  });
  const workflow = createRepositoryWorkflow({ context: () => ({ epoch: key.sessionEpoch, driver, collection: () => collection, collections: [collection], retainedBytes }), transport: () => transport,
    reserve() { if (busy) return null; busy = true; return { signal: new AbortController().signal, current: () => busy, release: () => { busy = false; } }; }, publish() {}, record: recordRepositoryWorkflow });
  await workflow.proposeFor(id, edit, false);
  transport.mockImplementationOnce(async (request) => {
    const response = reviewResponse(request as RepositoryReviewRequest); response.review.status = "incomplete"; return response;
  });
  await workflow.adapter(false).review("private-student", edit);
  return { workflow, transport, busy: () => busy, retain: (value: number) => { retainedBytes = value; } };
}
beforeEach(() => resetSessionDiagnosticLogForTests("2026-10-25T00:00:00Z"));
describe("review cumulative retention admission", () => {
  it("captures the original frozen threshold in both proposal and independent review bases", async () => {
    const session = await setup(); expect(session.transport).toHaveBeenCalledTimes(2);
    expect(session.transport.mock.calls.map(([request]) => request.operation)).toEqual(["propose", "review"]);
    for (const [request] of session.transport.mock.calls) expect(request.base).toMatchObject({ assignmentInstructions: "Evaluate", applyLengthDeduction: true, lengthDeductionThresholdWords: 25 });
    expect(session.transport.mock.calls[1][0].base).toEqual(session.transport.mock.calls[0][0].base);
  });
  it("refuses at 11,999,999 retained bytes before reserving or retaining the next review request/state", async () => {
    const session = await setup(), previous = session.workflow.states.get(id)!; session.retain(11_999_999);
    await session.workflow.adapter(false).review("private-student", edit);
    expect(session.transport).toHaveBeenCalledTimes(2); expect(session.busy()).toBe(false); expect(session.workflow.states.get(id)).toBe(previous);
    expect(session.workflow.adapter(false).sourceFor("private-student")?.error).toBe("Repository review retention is full. Existing proposal and review were preserved.");
    const log = buildSessionDiagnosticLog(readSessionDiagnosticLogState(), { currentInstitution: "", currentCourse: "", currentPage: "/", browser: "test" }, "2026-10-25T00:00:01Z");
    expect(readSessionDiagnosticLogState().entries.at(-1)).toMatchObject({ operation: "review_repository_grade", outcome: "failure", error: "Repository review failed" });
    for (const output of [formatSessionDiagnosticLogJson(log), formatSessionDiagnosticLogCsv(log)]) {
      expect(output).toContain("Repository review failed"); for (const secret of ["private-student", "private-original", "private-source", "private.py", "proposal-one"]) expect(output).not.toContain(secret);
    }
  });
  it("refuses a completed review whose replacement state would exceed the cumulative limit by one byte", async () => {
    const session = await setup(), previous = session.workflow.states.get(id)!;
    let finish!: (response: RepositoryReviewResponse) => void;
    session.transport.mockImplementationOnce(async () => new Promise<RepositoryReviewResponse>((resolve) => { finish = resolve; }));
    const pending = session.workflow.adapter(false).review("private-student", edit);
    const reviewing = session.workflow.states.get(id)!, request = session.transport.mock.calls[2][0] as RepositoryReviewRequest, response = reviewResponse(request);
    response.review.findings = [...response.review.findings, { criterionId: "0:Correctness", category: "timing", evidenceFileIds: ["repo-main"], explanation: "No trusted historical timestamp exists for this immutable source. An additional finding increases retained review data." }];
    const completed = { ...reviewing, status: "reviewed", review: response.review, error: undefined };
    const growth = bytes(completed) - bytes(reviewing); expect(growth).toBeGreaterThan(0);
    const beforeCompletion = 12_000_000 - growth + 1; expect(beforeCompletion + growth).toBe(12_000_001); session.retain(beforeCompletion);
    finish(response); await pending;
    const retained = session.workflow.states.get(id)!;
    expect(session.busy()).toBe(false); expect(retained.proposal).toBe(previous.proposal); expect(retained.review).toBe(previous.review);
    expect(retained.status).toBe(previous.status); expect(retained.reviewAttempts).toBe(2);
    expect(session.workflow.adapter(false).sourceFor("private-student")?.error).toContain("retention is full");
  });
});
