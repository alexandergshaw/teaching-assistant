import { boundSubmissionInventory } from "./submission-file-inventory";
import type { RepositoryCollectedEvidence } from "./repository-evidence-types";
import type { StudentSubmissionEntry } from "./types";
/** The base is the session's retained original material, never a previously composed evidence entry. */
export function assembleRepositoryEvidenceEntry(base: StudentSubmissionEntry, evidence: readonly RepositoryCollectedEvidence[]): StudentSubmissionEntry {
  const originals = base.submittedFiles.map((file, index) => ({ ...file, name: `original:${index}:${file.name}` }));
  const repoFiles = evidence.flatMap((item) => item.files.map((file) => ({ name: file.id, extension: file.path.includes(".") ? file.path.split(".").pop()!.toLowerCase() : "", previewContent: file.text, previewTruncated: file.truncated, mimeType: "text/plain" })));
  const blocks = evidence.flatMap((item) => item.files.map((file) => `File: ${file.id}\n\n${file.text}`));
  const repositoryInventories = [...(base.repositoryInventories ?? []), boundSubmissionInventory({ source: "original submission", scope: { kind: "repository", path: null }, enumerationComplete: false, files: base.submittedFiles.filter((file) => !["Discussion post", "Submission text", "Submission link"].includes(file.name)).map((file) => ({ path: file.name, content: file.previewTruncated ? "truncated" : "read" })) }), ...evidence.map((item) => boundSubmissionInventory({ source: `${item.manifest.scope.owner}/${item.manifest.scope.repo} @ ${item.manifest.commitSha}`, scope: { kind: item.manifest.scope.kind === "commit" ? "repository" : item.manifest.scope.kind, path: item.manifest.scope.requestedPath }, enumerationComplete: !item.manifest.coverage.treeTruncated && !item.manifest.coverage.unenumerated, files: [...item.files.map((file) => ({ path: file.path, content: file.truncated ? "truncated" as const : "read" as const })), ...item.manifest.coverage.omitted.map((file) => ({ path: file.path, content: file.reason === "unsupported" || file.reason === "unsafe-path" ? "unsupported" as const : file.reason === "unreadable" || file.reason === "deadline" ? "unreadable" as const : "budget" as const }))] }))];
  return { repositoryInventories, student: base.student, content: [base.content, ...originals.map((file) => `Original file: ${file.name}\n\n${file.previewContent}`), ...blocks].join("\n\n---\n\n"), mergedFileCount: originals.length + repoFiles.length, submittedFiles: [...originals, ...repoFiles] };
}
export function repositoryEntryCanonicalText(entry: StudentSubmissionEntry): string {
  return JSON.stringify([entry.repositoryInventories ?? null, entry.student, entry.content, entry.mergedFileCount, entry.submittedFiles.map((file) => [file.name, file.extension, file.previewContent, file.previewTruncated, file.mimeType ?? null])]);
}
export function repositoryCandidateCanonicalText(proposal: import("./repository-evidence-types").RepositoryGradeProposal): string {
  const sorted = (value: unknown): unknown => Array.isArray(value) ? value.map(sorted) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sorted(child)])) : value;
  return JSON.stringify(sorted([proposal.proposalId, proposal.revision, proposal.snapshotDigest, proposal.prior, proposal.current, proposal.proposed, proposal.criterionDeltas]));
}
export function freezeRepositorySnapshot<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (item: unknown): void => { if (item && typeof item === "object") { Object.values(item).forEach(freeze); Object.freeze(item); } };
  freeze(clone); return clone;
}