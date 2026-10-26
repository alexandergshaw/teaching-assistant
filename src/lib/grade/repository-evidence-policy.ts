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