import { isSubmissionFileInventories } from "./submission-file-inventory";
import { UPLOAD_WIRE_BUDGET_BYTES } from "../upload-budget";
import { validateGithubOwnerRepo } from "../github-ref-name";
import type { RepositoryCollectRequest, RepositoryScope } from "./repository-evidence-types";
export const REPOSITORY_EVIDENCE_LIMITS = { links: 3, files: 80, fileBytes: 300_000, sourceBytes: 3_000_000, networkBytes: 8_000_000, metadataBytes: 1_000_000, deadlineMs: 50_000, omissions: 500, requestBytes: UPLOAD_WIRE_BUDGET_BYTES } as const;
export const FULL_COMMIT_SHA = /^[a-f0-9]{40}$/i;
export function safeRepositoryPath(path: string): boolean {
  return path.length > 0 && path.length <= 2048 && !/[\\\x00-\x1f\x7f?#%]/.test(path) && path.split("/").every((s) => !!s && s !== "." && s !== "..");
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && Object.keys(v).every((k) => keys.includes(k));
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(v);
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
export function validateRepositoryScope(originalUrl: string, value: unknown): value is RepositoryScope {
  if (!record(value) || !exact(value, ["owner", "repo", "kind", "requestedRef", "requestedPath"])) return false;
  const { owner, repo, kind, requestedRef: ref, requestedPath: path } = value;
  if (typeof owner !== "string" || typeof repo !== "string" || !validateGithubOwnerRepo(owner, repo)) return false;
  if (typeof originalUrl !== "string" || originalUrl.length > 2048 || originalUrl !== originalUrl.trim() || /[\x00-\x20]/.test(originalUrl)) return false;
  try {
    const raw = originalUrl.match(/^https:\/\/[^/]+(\/[^?#]*)?$/i);
    if (!raw) return false;
    const url = new URL(originalUrl);
    if (!/^(www\.)?github\.com$/i.test(url.hostname) || url.username || url.password || url.port || url.search || url.hash) return false;
    const encoded = (raw[1] ?? "").replace(/\/$/, "").split("/").slice(1);
    const parts = encoded.map((s) => decodeURIComponent(s));
    if (parts.some((s) => !s || /[\\/\x00-\x1f\x7f?#%]/.test(s) || s === "." || s === "..")) return false;
    if (parts[0] !== owner || parts[1]?.replace(/\.git$/i, "") !== repo) return false;
    if (kind === "repository") return parts.length === 2 && ref === null && path === null;
    if (/\.git$/i.test(parts[1])) return false;
    if (kind === "commit") return parts.length === 4 && parts[2] === "commit" && typeof ref === "string" && FULL_COMMIT_SHA.test(ref) && parts[3].toLowerCase() === ref.toLowerCase() && path === null;
    if (kind !== "tree" && kind !== "blob") return false;
    if (parts[2] !== kind || typeof ref !== "string" || !safeRepositoryPath(ref) || ref.includes("..") || /\s/.test(ref) || /[~^:*\[]/.test(ref)) return false;
    if (path !== null && (typeof path !== "string" || !safeRepositoryPath(path))) return false;
    if (kind === "blob" && path === null) return false;
    return parts.slice(3).join("/") === ref + (path === null ? "" : `/${path}`);
  } catch { return false; }
}
export function validateRepositoryCollectRequest(value: unknown): value is RepositoryCollectRequest {
  if (!record(value) || !exact(value, ["operation", "attemptId", "studentKey", "mappings"]) || value.operation !== "collect" || !id(value.attemptId)) return false;
  const key = value.studentKey;
  if (!record(key) || !exact(key, ["sessionEpoch", "sourceIndex"]) || !id(key.sessionEpoch) || !integer(key.sourceIndex)) return false;
  if (!Array.isArray(value.mappings) || value.mappings.length < 1 || value.mappings.length > REPOSITORY_EVIDENCE_LIMITS.links) return false;
  const seen = new Set<string>();
  return value.mappings.every((m: unknown) => {
    if (!record(m) || !exact(m, ["stagedItemId", "studentKey", "scope", "mappingRevision", "basis", "originalUrl"]) || (typeof m.stagedItemId !== "string" || !m.stagedItemId.length || m.stagedItemId.length > 4096 || /[\x00-\x1f\x7f]/.test(m.stagedItemId)) || !integer(m.mappingRevision) || m.basis !== "instructor-confirmed") return false;
    if (!record(m.studentKey) || !exact(m.studentKey, ["sessionEpoch", "sourceIndex"]) || m.studentKey.sessionEpoch !== key.sessionEpoch || m.studentKey.sourceIndex !== key.sourceIndex) return false;
    if (typeof m.originalUrl !== "string" || !validateRepositoryScope(m.originalUrl, m.scope)) return false;
    const canonical = JSON.stringify([m.scope.owner.toLowerCase(), m.scope.repo.toLowerCase(), m.scope.kind, m.scope.kind === "commit" ? m.scope.requestedRef?.toLowerCase() : m.scope.requestedRef, m.scope.requestedPath]);
    if (seen.has(canonical)) return false;
    seen.add(canonical); return true;
  });
}
const only = (value: Record<string, unknown>, required: string[], optional: string[] = []) => required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
const text = (value: unknown, cap: number): value is string => typeof value === "string" && value.length <= cap;
export function validateRepositoryRevision(value: unknown): value is import("./repository-evidence-types").EvidenceRevision {
  if (!record(value) || !exact(value, ["sessionEpoch", "sourceIndex", "mappingRevision", "evidenceRevision", "rubricFingerprint", "baseGradeRevision", "baseEditRevision"])) return false;
  return id(value.sessionEpoch) && /^[a-f0-9]{64}$/i.test(String(value.rubricFingerprint)) && [value.sourceIndex, value.mappingRevision, value.evidenceRevision, value.baseGradeRevision, value.baseEditRevision].every(integer);
}
export function validateRepositoryGrade(value: unknown): value is import("./types").GradeResult {
  if (!record(value) || !only(value, ["student", "overallComment", "strengths", "improvements", "resubmitNotice", "rubricAreas", "totalScore", "feedback", "mergedFileCount", "submittedFiles"], ["gradedRepo", "gradedRef", "submissionTruncated", "linkFetch", "determination"])) return false;
  return text(value.student, 500) && [value.overallComment, value.strengths, value.improvements, value.resubmitNotice, value.feedback].every((field) => text(field, 100_000)) && text(value.totalScore, 100) && integer(value.mergedFileCount) && Array.isArray(value.submittedFiles) && value.submittedFiles.length <= 100 && value.submittedFiles.every(validFile) && Array.isArray(value.rubricAreas) && value.rubricAreas.length <= 200 && value.rubricAreas.every((area) => record(area) && exact(area, ["area", "score", "comment"]) && text(area.area, 1000) && text(area.score, 100) && text(area.comment, 100_000));
}
function validFile(value: unknown): boolean {
  return record(value) && only(value, ["name", "extension", "previewContent", "previewTruncated"], ["mimeType"]) && text(value.name, 4096) && text(value.extension, 30) && text(value.previewContent, 3_000_000) && typeof value.previewTruncated === "boolean" && (value.mimeType === undefined || text(value.mimeType, 200));
}
export function validateRepositoryProposalBase(value: unknown): value is import("./repository-evidence-types").RepositoryProposalBase {
  if (!record(value) || !only(value, ["entry", "assignmentInstructions", "rubric", "provider", "pointsPossible"], ["commentSplit", "harshness", "feedbackWordTarget", "applyNamingDeduction", "applyLengthDeduction"])) return false;
  const entry = value.entry;
  if (!record(entry) || !only(entry, ["student", "content", "mergedFileCount", "submittedFiles"], ["gradedRepo", "gradedRef", "repoReadNote", "linkFetch", "studentNameSource", "repositoryInventories"]) || !text(entry.student, 500) || !text(entry.content, 3_000_000) || !integer(entry.mergedFileCount) || !Array.isArray(entry.submittedFiles) || entry.submittedFiles.length > 100 || !entry.submittedFiles.every(validFile)) return false;
  if (entry.repositoryInventories !== undefined && !isSubmissionFileInventories(entry.repositoryInventories)) return false;
  if (!text(value.assignmentInstructions, 20_000) || !text(value.rubric, 20_000) || !["gemini", "other", "embedded"].includes(String(value.provider)) || (value.pointsPossible !== null && (typeof value.pointsPossible !== "number" || !Number.isFinite(value.pointsPossible) || value.pointsPossible < 0))) return false;
  for (const key of ["commentSplit", "applyNamingDeduction", "applyLengthDeduction"]) if (Object.hasOwn(value, key) && typeof value[key] !== "boolean") return false;
  return (value.harshness === undefined || ["lenient", "balanced", "strict"].includes(String(value.harshness))) && (value.feedbackWordTarget === undefined || (integer(value.feedbackWordTarget) && value.feedbackWordTarget >= 20 && value.feedbackWordTarget <= 500));
}
export function validateRepositoryProposal(value: unknown): value is import("./repository-evidence-types").RepositoryGradeProposal {
  if (!record(value) || !exact(value, ["proposalId", "revision", "snapshotDigest", "candidateDigest", "prior", "current", "proposed", "criterionDeltas"])) return false;
  return id(value.proposalId) && validateRepositoryRevision(value.revision) && [value.snapshotDigest, value.candidateDigest].every((digest) => typeof digest === "string" && /^[a-f0-9]{64}$/.test(digest)) && [value.prior, value.current, value.proposed].every(validateRepositoryGrade) && Array.isArray(value.criterionDeltas) && value.criterionDeltas.length <= 200 && value.criterionDeltas.every((delta) => record(delta) && exact(delta, ["criterionId", "area", "prior", "current", "proposed", "rationale", "evidenceFileIds"]) && [delta.criterionId, delta.area, delta.prior, delta.current, delta.proposed, delta.rationale].every((field) => text(field, 100_000)) && Array.isArray(delta.evidenceFileIds) && delta.evidenceFileIds.length <= 100 && delta.evidenceFileIds.every((field) => text(field, 4096)));
}
export function validateRepositoryModelRequest(value: unknown): value is import("./repository-evidence-types").RepositoryProposeRequest | import("./repository-evidence-types").RepositoryReviewRequest {
  if (!record(value) || !["propose", "review"].includes(String(value.operation)) || !exact(value, ["operation", "attemptId", "revision", "base", "prior", "current", "evidence", "partialAcknowledged", ...(value.operation === "review" ? ["proposal"] : [])])) return false;
  if (!id(value.attemptId) || !validateRepositoryRevision(value.revision) || !validateRepositoryProposalBase(value.base) || !validateRepositoryGrade(value.prior) || !validateRepositoryGrade(value.current) || typeof value.partialAcknowledged !== "boolean" || !Array.isArray(value.evidence) || !value.evidence.length || value.evidence.length > 3) return false;
  const mappings: unknown[] = [];
  for (const pin of value.evidence) {
    if (!record(pin) || !exact(pin, ["source", "commitSha", "digest"]) || typeof pin.commitSha !== "string" || !FULL_COMMIT_SHA.test(pin.commitSha) || typeof pin.digest !== "string" || !/^[a-f0-9]{64}$/.test(pin.digest)) return false;
    mappings.push(pin.source);
  }
  const revision = value.revision;
  if (!validateRepositoryCollectRequest({ operation: "collect", attemptId: value.attemptId, studentKey: { sessionEpoch: revision.sessionEpoch, sourceIndex: revision.sourceIndex }, mappings })) return false;
  if (Math.max(...value.evidence.map((pin) => pin.source.mappingRevision)) !== revision.mappingRevision) return false;
  return value.operation === "propose" || validateRepositoryProposal(value.proposal);
}