import { parseSubmissionGithubUrl, type ParsedSubmissionRepoUrl } from "@/lib/submission-repo";

export const REPOSITORY_BATCH_LINES = 40;
export const REPOSITORY_RETAINED_LINKS = 40;
export const REPOSITORY_URL_LENGTH = 2048;
// Per line: literal prefix, separating space, and CRLF, plus bounded padding.
export const REPOSITORY_BATCH_TEXT_LENGTH = 40 * (2048 + 32);
export const REPOSITORY_RETAINED_LINES = 80;
export const REPOSITORY_RETAINED_TEXT_LENGTH = 2 * REPOSITORY_BATCH_TEXT_LENGTH;
export type RepositoryStageOutcome = "staged" | "needs_attention" | "refused";

export type RepositoryLineStatus = "accepted" | "duplicate" | "rejected" | "unresolved";
export interface RepositoryEvidenceLine {
  original: string;
  status: RepositoryLineStatus;
  reason: string;
  url?: string;
  key?: string;
  requested?: ParsedSubmissionRepoUrl;
  scope?: "repository" | "tree" | "blob" | "commit";
}
export interface RepositoryEvidenceState {
  lines: RepositoryEvidenceLine[];
  error: string | null;
}
export const emptyRepositoryEvidence = (): RepositoryEvidenceState => ({ lines: [], error: null });
export interface RepositoryBatchResult {
  state: RepositoryEvidenceState;
  outcome: RepositoryStageOutcome;
}

function classify(original: string): RepositoryEvidenceLine {
  const candidate = original.trim().replace(/^Additional link:\s+/, "");
  const unresolved = { original, status: "unresolved" as const, reason: "Use one repository URL per line without annotations." };
  if (/\s/.test(candidate)) return unresolved;
  const rejected = { original, status: "rejected" as const, reason: "Use a supported GitHub repository, tree or blob URL." };
  if (candidate.length > REPOSITORY_URL_LENGTH || /[\\\u0000-\u001f\u007f]/.test(candidate)) return rejected;
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`); }
  catch { return rejected; }
  if (url.protocol !== "https:" || !/^(www\.)?github\.com$/i.test(url.hostname) || url.username || url.password || url.port || url.search || url.hash) return rejected;
  // Inspect the original path before URL normalization can erase traversal.
  const rawPath = candidate.replace(/^(https?:\/\/)?[^/]+/i, "").replace(/\/$/, "");
  let parts: string[];
  try { parts = rawPath.split("/").slice(1).map(decodeURIComponent); }
  catch { return rejected; }
  if (parts.some((part) => !part || part === "." || part === ".." || /[\\/\u0000-\u001f\u007f]/.test(part))) return rejected;
  const commit = parts[2] === "commit";
  if (commit && (parts.length !== 4 || !/^[a-fA-F0-9]{40}$/.test(parts[3]))) return rejected;
  if (parts.length !== 2 && !commit && !(parts.length >= 4 && (parts[2] === "tree" || parts[2] === "blob"))) return rejected;
  if (parts[2] === "blob" && parts.length < 5) return rejected;
  const requested = commit ? parseSubmissionGithubUrl(`https://github.com/${parts[0]}/${parts[1]}`) : parseSubmissionGithubUrl(candidate);
  if ("error" in requested) return rejected;
  if (commit) requested.ref = parts[3].toLowerCase();
  const scope = parts.length === 2 ? "repository" : parts[2] as "tree" | "blob" | "commit";
  const key = JSON.stringify([requested.owner.toLowerCase(), requested.repo.toLowerCase(), scope, requested.ref ?? "", requested.subpath ?? ""]);
  return { original, status: "accepted", reason: "Staged locally; not matched to a student.", url: url.href, key, requested, scope };
}

/** Atomic admission: a refused batch never hides a retained suffix. */
export function stageRepositoryBatch(raw: string, previous: RepositoryEvidenceState): RepositoryEvidenceState {
  if (raw.length > REPOSITORY_BATCH_TEXT_LENGTH) return { ...previous, error: "Repository input is too long. Stage a smaller batch." };
  const inputs = raw.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (inputs.length > REPOSITORY_BATCH_LINES) return { ...previous, error: "Stage at most 40 nonblank lines at a time." };
  if (previous.lines.length + inputs.length > REPOSITORY_RETAINED_LINES ||
    previous.lines.reduce((total, line) => total + line.original.length, 0) + inputs.reduce((total, line) => total + line.length, 0) > REPOSITORY_RETAINED_TEXT_LENGTH) {
    return { ...previous, error: "Repository evidence storage is full. Remove inputs or clear repository evidence before staging this batch again." };
  }
  const keys = new Set(previous.lines.filter((line) => line.status === "accepted").map((line) => line.key!));
  const lines = inputs.map((original) => {
    const line = classify(original);
    if (line.status !== "accepted") return line;
    if (keys.has(line.key!)) return { ...line, status: "duplicate" as const, reason: "This exact repository scope is already staged." };
    keys.add(line.key!);
    return line;
  });
  if (keys.size > REPOSITORY_RETAINED_LINKS) return { ...previous, error: "Keep at most 40 distinct repository links. Remove links before staging more." };
  return { lines: [...previous.lines, ...lines], error: null };
}

/** Outcome belongs to this admission attempt, independent of older inputs. */
export function stageRepositoryBatchResult(raw: string, previous: RepositoryEvidenceState): RepositoryBatchResult {
  const state = stageRepositoryBatch(raw, previous);
  const outcome = state.error ? "refused" : state.lines.slice(previous.lines.length).some((line) => line.status !== "accepted") ? "needs_attention" : "staged";
  return { state, outcome };
}
