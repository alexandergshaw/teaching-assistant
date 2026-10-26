export type SessionStudentKey = { sessionEpoch: string; sourceIndex: number };
export type RepositoryScope = { owner: string; repo: string; kind: "repository" | "tree" | "blob" | "commit"; requestedRef: string | null; requestedPath: string | null };
export type ConfirmedRepositoryMapping = { stagedItemId: string; studentKey: SessionStudentKey; scope: RepositoryScope; mappingRevision: number; basis: "instructor-confirmed" };
export type EvidenceRevision = SessionStudentKey & { mappingRevision: number; evidenceRevision: number; rubricFingerprint: string; baseGradeRevision: number; baseEditRevision: number };
export type RepositoryEvidenceOmission = { path: string; reason: "unsupported" | "file-cap" | "byte-cap" | "unreadable" | "deadline" | "unsafe-path" };
export type RepositoryEvidenceManifest = {
  originalUrl: string; scope: RepositoryScope; commitSha: string; collectedAt: string; pin: "immutable"; digest: string;
  timing: { kind: "unknown"; reason: "no-trusted-submission-time" | "no-historical-proof" };
  files: readonly { id: string; path: string; bytes: number; truncated: boolean }[];
  coverage: { treeTruncated: boolean; complete: boolean; omitted: readonly RepositoryEvidenceOmission[]; unenumerated: boolean };
};
export type RepositoryEvidenceSource = ConfirmedRepositoryMapping & { originalUrl: string };
export type RepositoryCollectedEvidence = { manifest: RepositoryEvidenceManifest; files: readonly { id: string; path: string; text: string; truncated: boolean }[] };
export type RepositoryCollectRequest = { operation: "collect"; attemptId: string; studentKey: SessionStudentKey; mappings: RepositoryEvidenceSource[] };
export type RepositoryCollectResponse = { operation: "collect"; attemptId: string; studentKey: SessionStudentKey; mappings: RepositoryEvidenceSource[]; evidence: readonly RepositoryCollectedEvidence[] };