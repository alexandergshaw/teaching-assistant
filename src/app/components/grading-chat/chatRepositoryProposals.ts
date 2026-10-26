import type { RepositoryCollectRequest, RepositoryCollectResponse, RepositoryEvidenceSource, RepositoryScope, SessionStudentKey } from "@/lib/grade/repository-evidence-types";
import type { RepositoryEvidenceLine } from "./chatRepositoryBatch";
import type { RepositorySessionStudent } from "./continuousRepositoryAdapter";

export function studentKeyId(key: SessionStudentKey): string { return JSON.stringify([key.sessionEpoch, key.sourceIndex]); }
export function stagedItemId(line: RepositoryEvidenceLine): string { return line.key ?? ""; }

export function confirmRepositoryMapping(line: RepositoryEvidenceLine, student: RepositorySessionStudent, revision: number, ref?: string, path?: string): RepositoryEvidenceSource | null {
  if (line.status !== "accepted" || !line.requested || !line.url || !line.scope || !line.key) return null;
  const scope: RepositoryScope = { owner: line.requested.owner, repo: line.requested.repo, kind: line.scope,
    requestedRef: ref === undefined ? line.requested.ref ?? null : ref || null,
    requestedPath: path === undefined ? line.requested.subpath ?? null : path || null };
  if (scope.kind === "tree" || scope.kind === "blob") {
    const urlParts = new URL(line.url.startsWith("http") ? line.url : `https://${line.url}`).pathname.split("/").slice(4).map(decodeURIComponent).join("/");
    if (!scope.requestedRef || [scope.requestedRef, scope.requestedPath].filter(Boolean).join("/") !== urlParts || (scope.kind === "blob" && !scope.requestedPath)) return null;
  }
  return { stagedItemId: line.key, studentKey: { ...student.key }, scope, mappingRevision: revision, basis: "instructor-confirmed", originalUrl: line.url };
}

export function collectionRequest(attemptId: string, mappings: readonly RepositoryEvidenceSource[]): RepositoryCollectRequest | null {
  if (!mappings.length || mappings.length > 3) return null;
  const studentKey = mappings[0].studentKey;
  if (mappings.some((mapping) => studentKeyId(mapping.studentKey) !== studentKeyId(studentKey))) return null;
  if (new Set(mappings.map((mapping) => mapping.stagedItemId)).size !== mappings.length) return null;
  return { operation: "collect", attemptId, studentKey, mappings: structuredClone([...mappings]) };
}

export function collectionMatches(request: RepositoryCollectRequest, response: RepositoryCollectResponse): boolean {
  return response.operation === "collect" && response.attemptId === request.attemptId &&
    studentKeyId(response.studentKey) === studentKeyId(request.studentKey) && JSON.stringify(response.mappings) === JSON.stringify(request.mappings) &&
    response.evidence.length === request.mappings.length && response.evidence.every((item, index) =>
      item.manifest.pin === "immutable" && /^[a-f0-9]{40}$/i.test(item.manifest.commitSha) &&
      item.manifest.originalUrl === request.mappings[index].originalUrl &&
      JSON.stringify(item.manifest.scope) === JSON.stringify(request.mappings[index].scope));
}

export function freezeCollection(response: RepositoryCollectResponse): RepositoryCollectResponse {
  const copy = structuredClone(response);
  const freeze = (value: unknown): void => {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  };
  freeze(copy);
  return copy;
}
