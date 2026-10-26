import { createHash } from "node:crypto";
import { getRepo } from "../github.repos";
import { listCommits } from "../github.branches";
import { getRepoTreeWithMeta, getFileText } from "../github.files";
import { createGithubBoundedReadContext, checkGithubReadDeadline, GithubReadLimitError } from "../github-bounded-read";
import { selectSubmissionRepoFiles } from "../submission-repo";
import { FULL_COMMIT_SHA, REPOSITORY_EVIDENCE_LIMITS as LIMIT, safeRepositoryPath, validateRepositoryCollectRequest } from "./repository-evidence-policy";
import type { RepositoryCollectRequest, RepositoryCollectResponse, RepositoryCollectedEvidence, RepositoryEvidenceManifest, RepositoryEvidenceOmission } from "./repository-evidence-types";
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
export async function collectRepositoryEvidence(request: RepositoryCollectRequest, deadline = Date.now() + LIMIT.deadlineMs): Promise<RepositoryCollectResponse> {
  if (!validateRepositoryCollectRequest(request)) throw new Error("Invalid confirmed repository mapping.");
  const snapshot = structuredClone(request);
  const context = createGithubBoundedReadContext(deadline, LIMIT.networkBytes);
  const evidence: RepositoryCollectedEvidence[] = []; let fileCount = 0; let sourceBytes = 0;
  try {
    for (const source of snapshot.mappings) {
      checkGithubReadDeadline(context);
      const { owner, repo, kind, requestedRef, requestedPath } = source.scope;
      const ref = requestedRef ?? (await getRepo(owner, repo, context)).defaultBranch;
      if (!ref) throw new Error("Repository default ref is unavailable.");
      const commitSha = kind === "commit" ? ref : (await listCommits(owner, repo, ref, 1, context))[0]?.sha;
      if (!commitSha || !FULL_COMMIT_SHA.test(commitSha)) throw new Error("Repository immutable pin could not be resolved.");
      const tree = await getRepoTreeWithMeta(owner, repo, commitSha, context);
      const inScope = (p: string) => kind === "blob" ? p === requestedPath : requestedPath === null || p === requestedPath || p.startsWith(`${requestedPath}/`);
      if (requestedPath && !tree.entries.some((e) => e.path === requestedPath && e.type === (kind === "blob" ? "blob" : "tree"))) {
        throw new Error(tree.truncated || tree.unenumerated ? "Requested scope is unknown in the incomplete tree." : "Requested scope does not exist at this commit.");
      }
      const omitted: RepositoryEvidenceOmission[] = []; let unenumerated = !!tree.unenumerated;
      const omit = (path: string, reason: RepositoryEvidenceOmission["reason"]) => {
        if (omitted.length < LIMIT.omissions) omitted.push({ path, reason }); else unenumerated = true;
      };
      for (const entry of tree.excluded ?? []) if (inScope(entry.path)) omit(entry.path, entry.reason);
      const files: Array<{ id: string; path: string; text: string; truncated: boolean }> = [];
      const scoped = tree.entries.filter((e) => e.type === "blob" && inScope(e.path)).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      for (const entry of scoped) {
        if (!safeRepositoryPath(entry.path)) { omit(entry.path, "unsafe-path"); continue; }
        if ((entry.mode && !["100644", "100755"].includes(entry.mode)) || !selectSubmissionRepoFiles([entry], undefined, { maxFiles: 1, maxFileBytes: Number.MAX_SAFE_INTEGER }).selected.length) { omit(entry.path, "unsupported"); continue; }
        if (fileCount >= LIMIT.files) { omit(entry.path, "file-cap"); continue; }
        if (entry.size > LIMIT.fileBytes || sourceBytes >= LIMIT.sourceBytes) { omit(entry.path, "byte-cap"); continue; }
        try {
          checkGithubReadDeadline(context);
          fileCount += 1;
          const text = await getFileText(owner, repo, entry.path, commitSha, context, Math.min(LIMIT.fileBytes, LIMIT.sourceBytes - sourceBytes));
          const bytes = new TextEncoder().encode(text).byteLength;
          sourceBytes += bytes;
          files.push({ id: `repo:${owner}/${repo}@${commitSha}:${entry.path}`, path: entry.path, text, truncated: false });
        } catch (error) {
          omit(entry.path, error instanceof GithubReadLimitError ? error.kind === "deadline" ? "deadline" : error.kind === "byte-cap" ? "byte-cap" : "unreadable" : context.controller.signal.aborted ? "deadline" : "unreadable");
        }
      }
      omitted.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.reason.localeCompare(b.reason));
      const coverage = { treeTruncated: tree.truncated, complete: !tree.truncated && !unenumerated && omitted.length === 0, omitted, unenumerated };
      const digest = createHash("sha256").update(JSON.stringify(["repository-evidence-v1", [owner, repo, kind, requestedRef, requestedPath], commitSha, files.map((f) => [f.path, f.text]), coverage])).digest("hex");
      const manifest: RepositoryEvidenceManifest = { originalUrl: source.originalUrl, scope: source.scope, commitSha, collectedAt: new Date().toISOString(), pin: "immutable", digest, timing: { kind: "unknown", reason: "no-trusted-submission-time" }, files: files.map((f) => ({ id: f.id, path: f.path, bytes: new TextEncoder().encode(f.text).byteLength, truncated: f.truncated })), coverage };
      evidence.push({ manifest, files });
    }
    checkGithubReadDeadline(context);
    return freeze({ operation: "collect", attemptId: snapshot.attemptId, studentKey: snapshot.studentKey, mappings: snapshot.mappings, evidence });
  } finally { context.dispose(); }
}