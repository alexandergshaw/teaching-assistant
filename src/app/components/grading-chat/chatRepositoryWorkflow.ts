import type { EvidenceRevision, RepositoryCollectResponse, RepositoryGradeProposal, RepositoryProposalBase, RepositoryProposeRequest, RepositoryProposeResponse, RepositoryReviewRequest, RepositoryReviewResponse, ProposalReview } from "@/lib/grade/repository-evidence-types";
import { assembleRepositoryEvidenceEntry, repositoryEntryCanonicalText } from "@/lib/grade/repository-evidence-entry";
import { estimateNeededWireBytes, ITEM_REQUEST_BYTE_BUDGET } from "../grading/incrementalRunPlan";
import { applyRepositoryProposalFields, repositoryEditSignature, resultWithRepositoryEdits, type RepositoryFieldSelection } from "../grading-results/repositoryProposalEdits";
import type { RowEdit } from "../grading-results/gradingResultsHelpers";
import type { GradeResult } from "@/lib/grade/types";
import type { ContinuousRepositoryAdapter, RepositoryStudentSnapshot } from "./continuousRepositoryAdapter";
import { studentKeyId } from "./chatRepositoryProposals";

export type RepositoryModelTransport = (request: RepositoryProposeRequest | RepositoryReviewRequest, signal: AbortSignal) => Promise<RepositoryProposeResponse | RepositoryReviewResponse>;
export type RepositoryWorkflowOperation = "propose" | "review" | "accept";
export type RepositoryWorkflowCounts = { criteriaChanged?: number; reviewFindings?: number; acceptedFields?: number };
export type RepositoryWorkflowState = {
  status: "proposing" | "proposed" | "reviewing" | "reviewed" | "failed" | "accepted";
  error?: string; stale?: boolean; proposal?: RepositoryGradeProposal; review?: ProposalReview;
  snapshot: RepositoryStudentSnapshot; request: RepositoryProposeRequest; evidence: RepositoryCollectResponse;
  comparisonSignature: string; evidenceSignature: string; proposeAttempts: number; reviewAttempts: number; entryDigest?: string;
};
export type RepositoryWorkflowAdapter = {
  sourceFor: (student: string) => { signature: string; partial: boolean; error?: string } | undefined;
  stateFor: (student: string) => RepositoryWorkflowState | undefined;
  busy: boolean;
  propose: (student: string, edit: RowEdit, partialAcknowledged: boolean) => Promise<void>;
  review: (student: string, edit: RowEdit) => Promise<void>;
  compare: (student: string, edit: RowEdit) => void;
  accept: (student: string, edit: RowEdit, signature: string, fields: RepositoryFieldSelection) => { ok: true; edit: RowEdit; scoreChanged: boolean } | { ok: false; error: string };
  dismiss: (student: string) => void;
};
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const sameRevision = (a: EvidenceRevision, b: EvidenceRevision) => JSON.stringify(a) === JSON.stringify(b);
const signatureFor = (evidence: RepositoryCollectResponse) => JSON.stringify([evidence.mappings, evidence.evidence.map((item) => [item.manifest.commitSha, item.manifest.digest])]);
function withoutIdentity<T extends { userId?: number }>(value: T): T { const copy = { ...value }; delete copy.userId; return copy; }
function comparisonGrade(result: GradeResult): GradeResult {
  return { student: result.student, overallComment: result.overallComment, strengths: result.strengths, improvements: result.improvements,
    resubmitNotice: result.resubmitNotice, rubricAreas: structuredClone(result.rubricAreas), totalScore: result.totalScore,
    feedback: result.feedback, mergedFileCount: result.mergedFileCount, submittedFiles: [] };
}
export async function repositoryEntryDigest(entry: Parameters<typeof repositoryEntryCanonicalText>[0]): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(repositoryEntryCanonicalText(entry)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function createRepositoryWorkflow(params: {
  context: () => { epoch: string; driver?: ContinuousRepositoryAdapter; collection: (id: string) => RepositoryCollectResponse | undefined; collections: readonly RepositoryCollectResponse[]; retainedBytes: number };
  reserve: (studentId: string) => { signal: AbortSignal; current: () => boolean; release: () => void } | null;
  transport: () => RepositoryModelTransport;
  publish: () => void;
  record?: (operation: RepositoryWorkflowOperation, success: boolean, startedAtMs: number, counts: RepositoryWorkflowCounts) => void;
}) {
  const states = new Map<string, RepositoryWorkflowState>(), refusals = new Map<string, string>(); let attempt = 0, evidenceRevision = 0, editRevision = 0;
  const notify = () => params.publish();
  const record = (operation: RepositoryWorkflowOperation, success: boolean, start: number, counts: RepositoryWorkflowCounts = {}) => { try { params.record?.(operation, success, start, counts); } catch { /* Diagnostics cannot change results. */ } };
  const invalidate = (id: string) => { const state = states.get(id); if (state) states.set(id, { ...state, stale: true, error: "The student, grade or evidence changed. Start a new proposal from the current row." }); };
  const fresh = (state: RepositoryWorkflowState): boolean => {
    const context = params.context(), snapshot = context.driver?.capture(state.snapshot.key), evidence = context.collection(studentKeyId(state.snapshot.key));
    return !state.stale && context.epoch === state.snapshot.key.sessionEpoch && !!snapshot && snapshot.signature === state.snapshot.signature &&
      snapshot.gradeRevision === state.snapshot.gradeRevision && !!evidence && signatureFor(evidence) === state.evidenceSignature;
  };
  const resolveId = (student: string) => [...states].find(([, state]) => state.snapshot.result.student === student)?.[0];
  const proposeFor = async (id: string, edit: RowEdit, partialAcknowledged: boolean) => {
    const context = params.context(), evidence = context.collection(id);
    if (!evidence || !context.driver) return;
    const snapshot = context.driver.capture(evidence.studentKey); if (!snapshot) return;
    const old = states.get(id), editSignature = repositoryEditSignature(edit);
    if (old && fresh(old) && old.comparisonSignature === editSignature && old.proposal && old.status !== "failed") return;
    const same = !!old && fresh(old) && old.comparisonSignature === editSignature;
    if (same && old.proposeAttempts >= 2) { states.set(id, { ...old, error: "Both proposal attempts were used. Refresh evidence to start a new revision." }); notify(); return; }
    const original = snapshot.originalBody;
    const entry = withoutIdentity(structuredClone(original.entry)); delete entry.submissionUrl; delete entry.codeRun;
    const base: RepositoryProposalBase = { entry, assignmentInstructions: original.assignmentInstructions, rubric: original.rubric,
      provider: original.provider, pointsPossible: original.pointsPossible, commentSplit: original.commentSplit, harshness: original.harshness,
      feedbackWordTarget: original.feedbackWordTarget, applyNamingDeduction: original.applyNamingDeduction, applyLengthDeduction: original.applyLengthDeduction,
      lengthDeductionThresholdWords: original.lengthDeductionThresholdWords };
    const revision: EvidenceRevision = { ...snapshot.key, mappingRevision: Math.max(...evidence.mappings.map((mapping) => mapping.mappingRevision)),
      evidenceRevision: same ? old.request.revision.evidenceRevision : ++evidenceRevision, rubricFingerprint: snapshot.rubricFingerprint,
      baseGradeRevision: snapshot.gradeRevision, baseEditRevision: same ? old.request.revision.baseEditRevision : ++editRevision };
    const request: RepositoryProposeRequest = { operation: "propose", attemptId: `propose-${++attempt}`, revision, base,
      prior: comparisonGrade(snapshot.result), current: comparisonGrade(resultWithRepositoryEdits(snapshot.result, edit)),
      evidence: evidence.evidence.map((item, index) => ({ source: evidence.mappings[index], commitSha: item.manifest.commitSha, digest: item.manifest.digest })), partialAcknowledged };
    const next: RepositoryWorkflowState = { ...old, status: "proposing", stale: false, error: undefined, snapshot, request,
      evidence, evidenceSignature: signatureFor(evidence), comparisonSignature: editSignature, proposeAttempts: same ? old.proposeAttempts + 1 : 1, reviewAttempts: 0,
      entryDigest: same ? old?.entryDigest : undefined };
    const refusal = base.provider !== "gemini" ? "Repository evidence proposals currently support Gemini only." :
      evidence.evidence.some((item) => !item.manifest.coverage.complete) && !partialAcknowledged ? "Acknowledge partial coverage for this evidence revision before proposing." :
      estimateNeededWireBytes(assembleRepositoryEvidenceEntry(entry, evidence.evidence)) > ITEM_REQUEST_BYTE_BUDGET || bytes(request) > ITEM_REQUEST_BYTE_BUDGET ? "The complete original submission and repository evidence exceed the request limit." :
      context.retainedBytes - (old ? bytes(old) : 0) + bytes(next) > 12_000_000 ? "Repository proposal retention is full. Existing results were preserved." : null;
    if (refusal) { refusals.set(id, refusal); if (old) states.set(id, { ...old, error: refusal }); notify(); return; }
    const reservation = params.reserve(id); if (!reservation) return;
    refusals.delete(id); states.set(id, next); notify(); const started = performance.now(); let success = false;
    try {
      const response = await params.transport()(request, reservation.signal);
      if (!reservation.current() || states.get(id) !== next || !fresh(next)) return;
      if (response.operation !== "propose" || response.attemptId !== request.attemptId || !sameRevision(response.revision, revision) || !sameRevision(response.proposal.revision, revision) || bytes(response) > 262_144 || params.context().retainedBytes + bytes(response) > 12_000_000) throw new Error("Invalid proposal response");
      if (response.entryDigest !== await repositoryEntryDigest(assembleRepositoryEvidenceEntry(entry, evidence.evidence))) throw new Error("Evidence assembly mismatch");
      if (!reservation.current() || states.get(id) !== next || !fresh(next)) return;
      states.set(id, { ...next, status: "proposed", proposal: structuredClone(response.proposal), entryDigest: response.entryDigest }); success = true;
    } catch { if (reservation.current() && states.get(id) === next) states.set(id, { ...next, status: "failed", error: "Repository proposal failed or was incomplete. Current grades and edits were preserved." }); }
    finally { reservation.release(); notify(); record("propose", success, started, { criteriaChanged: states.get(id)?.proposal?.criterionDeltas.length ?? 0 }); }
  };
  const reviewFor = async (id: string, edit: RowEdit) => {
    const state = states.get(id); if (!state?.proposal || !state.entryDigest || !sameRevision(state.proposal.revision, state.request.revision) || !fresh(state) || state.reviewAttempts >= 2 || state.review?.status === "completed") return;
    const started = performance.now();
    const next = { ...state, status: "reviewing" as const, error: undefined, reviewAttempts: state.reviewAttempts + 1 };
    const request: RepositoryReviewRequest = { ...state.request, operation: "review", attemptId: `review-${++attempt}`, proposal: state.proposal };
    if (repositoryEditSignature(edit) !== state.comparisonSignature) { states.set(id, { ...state, error: "Instructor edits changed. Refresh the comparison before reviewing." }); notify(); return; }
    if (bytes(request) > ITEM_REQUEST_BYTE_BUDGET || params.context().retainedBytes - bytes(state) + bytes(next) + bytes(request) > 12_000_000) {
      refusals.set(id, "Repository review retention is full. Existing proposal and review were preserved."); notify(); record("review", false, started); return;
    }
    const reservation = params.reserve(id); if (!reservation) return;
    refusals.delete(id); states.set(id, next); notify(); let success = false;
    try {
      const response = await params.transport()(request, reservation.signal);
      if (!reservation.current() || states.get(id) !== next || !fresh(next)) return;
      if (response.operation !== "review" || response.attemptId !== request.attemptId || !sameRevision(response.revision, request.revision) || response.candidateDigest !== state.proposal.candidateDigest || response.review.proposalId !== state.proposal.proposalId || !sameRevision(response.review.revision, request.revision) || response.review.attemptId !== request.attemptId || bytes(response) > 262_144) throw new Error("Invalid review response");
      const completed: RepositoryWorkflowState = { ...next, status: "reviewed", review: structuredClone(response.review), error: response.review.status === "completed" ? undefined : "Independent review is incomplete. Current grades and edits were preserved." };
      if (params.context().retainedBytes - bytes(next) + bytes(completed) > 12_000_000) {
        states.set(id, { ...state, reviewAttempts: next.reviewAttempts });
        refusals.set(id, "Repository review retention is full. Existing proposal and review were preserved."); return;
      }
      states.set(id, completed); success = response.review.status === "completed";
    } catch { if (reservation.current() && states.get(id) === next) states.set(id, { ...next, status: "failed", error: "Independent repository review failed. Current grades and edits were preserved." }); }
    finally { reservation.release(); notify(); record("review", success, started, { reviewFindings: states.get(id)?.review?.findings.length ?? 0 }); }
  };
  const accept: RepositoryWorkflowAdapter["accept"] = (student, edit, signature, fields) => {
    const started = performance.now(), id = resolveId(student), state = id ? states.get(id) : undefined;
    if (!id || !state?.proposal || !state.entryDigest || state.review?.status !== "completed" || !sameRevision(state.proposal.revision, state.request.revision) || !sameRevision(state.review.revision, state.request.revision) || !fresh(state) || signature !== state.comparisonSignature || repositoryEditSignature(edit) !== signature) {
      record("accept", false, started); return { ok: false, error: "The grade, edits or evidence changed, or independent review is incomplete. Refresh the comparison and confirm again." };
    }
    const selected = applyRepositoryProposalFields(edit, state.snapshot.result, state.proposal.proposed, fields);
    const entry = assembleRepositoryEvidenceEntry(state.request.base.entry, state.evidence.evidence);
    if (!params.context().driver?.adopt(state.snapshot, selected.result, entry)) { record("accept", false, started); return { ok: false, error: "The accepted row changed. Start a new proposal." }; }
    states.set(id, { ...state, status: "accepted" }); notify();
    record("accept", true, started, { acceptedFields: Number(!!fields.total) + (fields.criteria?.length ?? 0) + (fields.feedback?.length ?? 0) });
    return { ok: true, edit: selected.edit, scoreChanged: selected.scoreChanged };
  };
  return { states, invalidate, reset() { states.clear(); refusals.clear(); }, sync() { let changed = false; for (const [id, state] of states) if (state.status !== "accepted" && !state.stale && !fresh(state)) { invalidate(id); changed = true; } return changed; },
    proposeFor, adapter(busy: boolean): RepositoryWorkflowAdapter { return {
      sourceFor(student) { const context = params.context(), evidence = context.collections.find((collection) => context.driver?.capture(collection.studentKey)?.result.student === student);
        return evidence ? { signature: signatureFor(evidence), partial: evidence.evidence.some((item) => !item.manifest.coverage.complete), error: refusals.get(studentKeyId(evidence.studentKey)) } : undefined; },
      busy, stateFor: (student) => { const id = resolveId(student); return id ? states.get(id) : undefined; },
      propose: async (student, edit, acknowledged) => {
        const context = params.context();
        const id = context.collections.find((collection) => context.driver?.capture(collection.studentKey)?.result.student === student);
        if (id) await proposeFor(studentKeyId(id.studentKey), edit, acknowledged);
      },
      review: async (student, edit) => { const id = resolveId(student); if (id) await reviewFor(id, edit); },
      compare(student, edit) { const id = resolveId(student), state = id ? states.get(id) : undefined; if (id && state && repositoryEditSignature(edit) !== state.comparisonSignature) {
        states.set(id, { ...state, stale: true, error: "Instructor edits changed. Start a new targeted proposal and independent review using the current edits." }); notify(); } },
      accept, dismiss(student) { const id = resolveId(student), state = id ? states.get(id) : undefined; if (id && state) {
        states.set(id, { ...state, status: "failed", proposal: undefined, review: undefined, entryDigest: undefined,
          error: state.proposeAttempts >= 2 ? "Both proposal attempts were used. Refresh evidence to start a new revision." : undefined }); notify(); } },
    }; } };
}
